import dotenv from "dotenv";
import { db, migrate } from "../db.js";
import { syncTravelEmailReplies } from "../lib/travel-email-sync.js";

dotenv.config();

const SUPPORT_EMAIL = "support@trevoro.ro";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function internalSupportEmails() {
  return new Set([
    "contact@trevoro.ro",
    SUPPORT_EMAIL,
    process.env.MAIL_FROM,
    process.env.EMAIL_FROM,
    process.env.SMTP_USER,
    process.env.TREVORO_IMAP_USER,
    process.env.TREVORO_SUPPORT_IMAP_USER
  ].map(normalizeEmail).filter(Boolean));
}

function isInternalSupportEmail(email = "") {
  return internalSupportEmails().has(normalizeEmail(email));
}

function nextTicketNumber(companyId) {
  const year = new Date().getFullYear();
  const prefix = `TS-${year}-`;
  const row = db.prepare(`
    SELECT ticket_number
    FROM travel_support_tickets
    WHERE company_id=? AND ticket_number LIKE ?
    ORDER BY ticket_number DESC
    LIMIT 1
  `).get(companyId, `${prefix}%`);
  const last = Number(safeText(row?.ticket_number).slice(prefix.length)) || 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

function findEntity(companyId, email = "") {
  const normalized = normalizeEmail(email);
  if (!normalized) return {};
  const lead = db.prepare(`
    SELECT *
    FROM travel_leads
    WHERE company_id=? AND lower(COALESCE(email, ''))=?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(companyId, normalized);
  const property = db.prepare(`
    SELECT *
    FROM travel_properties
    WHERE company_id=? AND lower(COALESCE(email, ''))=?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(companyId, normalized);
  const inquiry = db.prepare(`
    SELECT *
    FROM travel_property_inquiries
    WHERE company_id=? AND lower(COALESCE(email, ''))=?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(companyId, normalized);
  return { lead, property, inquiry };
}

function linkThreadMessages(companyId, ticket) {
  const ticketId = Number(ticket?.id || ticket?.ticketId || 0);
  if (!ticketId) return 0;
  const fullTicket = ticket.id ? ticket : db.prepare(`
    SELECT t.*, l.email AS lead_email, p.email AS property_email
    FROM travel_support_tickets t
    LEFT JOIN travel_leads l ON l.company_id=t.company_id AND l.id=t.lead_id
    LEFT JOIN travel_properties p ON p.company_id=t.company_id AND p.id=t.property_id
    WHERE t.company_id=? AND t.id=?
    LIMIT 1
  `).get(companyId, ticketId);
  if (!fullTicket) return 0;

  const conditions = [];
  const params = [companyId];
  if (fullTicket.email_message_id) {
    conditions.push("m.id=?");
    params.push(Number(fullTicket.email_message_id));
  }
  if (fullTicket.lead_id) {
    conditions.push("m.lead_id=?");
    params.push(Number(fullTicket.lead_id));
  }
  const requesterEmail = normalizeEmail(fullTicket.requester_email || fullTicket.property_email || fullTicket.lead_email);
  if (isInternalSupportEmail(requesterEmail)) return 0;
  if (requesterEmail) {
    conditions.push("(instr(lower(COALESCE(m.from_email, '')), ?) > 0 OR instr(lower(COALESCE(m.to_email, '')), ?) > 0)");
    params.push(requesterEmail, requesterEmail);
  }
  if (!conditions.length) return 0;

  const messages = db.prepare(`
    SELECT m.*
    FROM travel_email_messages m
    WHERE m.company_id=?
      AND m.direction IN ('outbound', 'inbound', 'outbound_failed', 'bounce')
      AND (${conditions.join(" OR ")})
    ORDER BY datetime(COALESCE(m.received_at, m.created_at)) ASC, m.id ASC
    LIMIT 500
  `).all(...params);

  let linked = 0;
  for (const message of messages) {
    const exists = db.prepare(`
      SELECT id
      FROM travel_support_ticket_messages
      WHERE company_id=? AND email_message_id=?
      LIMIT 1
    `).get(companyId, message.id);
    if (exists) continue;
    db.prepare(`
      INSERT INTO travel_support_ticket_messages (
        company_id, ticket_id, email_message_id, direction, from_email, to_email, subject, text_body, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      companyId,
      ticketId,
      message.id,
      safeText(message.direction || "inbound"),
      safeText(message.from_email),
      safeText(message.to_email),
      safeText(message.subject),
      safeText(message.text_body),
      message.received_at || message.created_at || null
    );
    linked += 1;
  }
  return linked;
}

function createTicketFromMessage(companyId, message) {
  const requesterEmail = normalizeEmail(String(message.from_email || "").split(",")[0]);
  if (isInternalSupportEmail(requesterEmail)) {
    return { created: false, linked: false, skipped: true, reason: "internal_sender" };
  }
  const existingByMessage = db.prepare(`
    SELECT ticket_id
    FROM travel_support_ticket_messages
    WHERE company_id=? AND email_message_id=?
    LIMIT 1
  `).get(companyId, message.id);
  if (existingByMessage) {
    linkThreadMessages(companyId, { ticketId: existingByMessage.ticket_id });
    return { created: false, linked: false, skipped: true, ticketId: Number(existingByMessage.ticket_id || 0) };
  }

  const existingTicket = requesterEmail ? db.prepare(`
    SELECT *
    FROM travel_support_tickets
    WHERE company_id=?
      AND lower(COALESCE(requester_email, ''))=?
      AND status <> 'rezolvat'
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(companyId, requesterEmail) : null;
  const entity = findEntity(companyId, requesterEmail);
  const country = safeText(entity.lead?.country || entity.property?.country || "Romania");
  const subject = safeText(message.subject) || "Support Trevoro";

  const outcome = db.transaction(() => {
    let ticketId = Number(existingTicket?.id || 0);
    let created = false;
    if (!ticketId) {
      const result = db.prepare(`
        INSERT INTO travel_support_tickets (
          company_id, ticket_number, lead_id, property_id, inquiry_id, email_message_id,
          requester_email, country, subject, status, source, first_seen_at, last_activity_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nou', 'support_email', COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
      `).run(
        companyId,
        nextTicketNumber(companyId),
        entity.lead?.id || null,
        entity.property?.id || null,
        entity.inquiry?.id || null,
        message.id,
        requesterEmail,
        country,
        subject,
        message.received_at || null,
        message.received_at || null
      );
      ticketId = Number(result.lastInsertRowid);
      created = true;
    } else {
      db.prepare(`
        UPDATE travel_support_tickets
        SET status=CASE WHEN status='rezolvat' THEN status ELSE 'nou' END,
            opened_at=NULL,
            last_activity_at=COALESCE(?, datetime('now')),
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(message.received_at || null, ticketId, companyId);
    }

    db.prepare(`
      INSERT INTO travel_support_ticket_messages (
        company_id, ticket_id, email_message_id, direction, from_email, to_email, subject, text_body, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      companyId,
      ticketId,
      message.id,
      safeText(message.direction || "inbound"),
      safeText(message.from_email),
      safeText(message.to_email),
      subject,
      safeText(message.text_body),
      message.received_at || null
    );
    return { created, linked: !created, skipped: false, ticketId };
  })();
  if (outcome.ticketId) linkThreadMessages(companyId, { ticketId: outcome.ticketId });
  return outcome;
}

function createTickets(companyId, limit = 500) {
  const rows = db.prepare(`
    SELECT m.*
    FROM travel_email_messages m
    WHERE m.company_id=?
      AND m.direction='inbound'
      AND (
        lower(COALESCE(m.to_email, '')) LIKE ?
        OR lower(COALESCE(m.mailbox, ''))=?
        OR EXISTS (
          SELECT 1
          FROM travel_properties p
          WHERE p.company_id=m.company_id
            AND COALESCE(p.email, '')<>''
            AND instr(lower(COALESCE(m.from_email, '')), lower(p.email))>0
        )
        OR EXISTS (
          SELECT 1
          FROM travel_leads l
          WHERE l.company_id=m.company_id
            AND COALESCE(l.email, '')<>''
            AND instr(lower(COALESCE(m.from_email, '')), lower(l.email))>0
        )
        OR EXISTS (
          SELECT 1
          FROM travel_property_inquiries i
          WHERE i.company_id=m.company_id
            AND COALESCE(i.email, '')<>''
            AND instr(lower(COALESCE(m.from_email, '')), lower(i.email))>0
        )
      )
    ORDER BY datetime(COALESCE(m.received_at, m.created_at)) DESC, m.id DESC
    LIMIT ?
  `).all(companyId, `%${SUPPORT_EMAIL}%`, SUPPORT_EMAIL, Math.max(1, Number(limit || 500)));
  const report = { scanned: rows.length, created: 0, linked: 0, skipped: 0 };
  for (const row of rows) {
    const result = createTicketFromMessage(companyId, row);
    if (result.created) report.created += 1;
    else if (result.linked) report.linked += 1;
    else report.skipped += 1;
  }
  return report;
}

async function main() {
  migrate();
  const company = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  const companyId = Number(company?.id || 0);
  if (!companyId) throw new Error("Nu am găsit companie activă.");

  const sinceDays = Number(argValue("--since-days", 30)) || 30;
  const limit = Number(argValue("--limit", 500)) || 500;
  const emailSync = await syncTravelEmailReplies({ db, companyId, sinceDays, limit });
  const tickets = createTickets(companyId, limit);

  console.log(JSON.stringify({ ok: true, emailSync: { ...emailSync, mailbox: emailSync.mailbox ? "***" : "" }, tickets }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
