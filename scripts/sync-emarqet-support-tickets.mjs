#!/usr/bin/env node
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, migrate } from "../db.js";
import { emarqetOfficeEmail, emarqetSupportEmail } from "../lib/emarqet-mailboxes.js";
import {
  createMarketplaceServiceRequest,
  ensureMarketplaceServicesSchema,
  seedMarketplaceServicesCatalog
} from "../lib/emarqet-marketplace-services.js";

dotenv.config();

const ACTOR = "emarqet-support-email-sync";

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function maskEmail(value = "") {
  const email = safeText(value);
  const at = email.indexOf("@");
  if (at <= 1) return email ? "***" : "";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function companyIdFromDb() {
  const explicit = Number(argValue("--company-id", "0"));
  if (explicit) return explicit;
  const row = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(row?.id || 0);
}

function mailboxConfig() {
  const user = normalizeEmail(process.env.EMARQET_SUPPORT_IMAP_USER || emarqetSupportEmail());
  const pass = safeText(process.env.EMARQET_SUPPORT_IMAP_PASS || process.env.EMARQET_MAIL_PASS);
  return {
    host: safeText(process.env.EMARQET_SUPPORT_IMAP_HOST || "cp109s.zooku.eu"),
    port: Number(process.env.EMARQET_SUPPORT_IMAP_PORT || 993),
    secure: String(process.env.EMARQET_SUPPORT_IMAP_SECURE || "true").toLowerCase() !== "false",
    user,
    pass,
    mailbox: safeText(process.env.EMARQET_SUPPORT_IMAP_MAILBOX || "INBOX")
  };
}

function ownEmails() {
  return new Set([
    emarqetSupportEmail(),
    emarqetOfficeEmail(),
    process.env.EMARQET_SUPPORT_IMAP_USER,
    process.env.EMARQET_OFFICE_IMAP_USER,
    process.env.EMARQET_SMTP_USER
  ].map(normalizeEmail).filter(Boolean));
}

function isAutomatedSender(email = "", subject = "") {
  const normalized = normalizeEmail(email);
  const local = normalized.split("@")[0] || "";
  const text = `${normalized} ${subject}`.toLowerCase();
  return local === "mailer-daemon"
    || local === "postmaster"
    || local === "cpanel"
    || local === "noreply"
    || local === "no-reply"
    || text.includes("mail delivery failed")
    || text.includes("delivery status notification")
    || text.includes("client configuration settings");
}

function htmlToText(value = "") {
  return safeText(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageBody(parsed = {}) {
  const text = safeText(parsed.text) || htmlToText(parsed.html);
  return text.slice(0, 4000);
}

function emailList(values = []) {
  return (values || [])
    .map((item) => normalizeEmail(item?.address || item?.text || ""))
    .filter(Boolean)
    .join(", ");
}

function existingTicket(companyId, mailbox, messageId, uid) {
  if (messageId) {
    const row = db.prepare(`
      SELECT id
      FROM emarqet_service_requests
      WHERE company_id=? AND email_message_id=?
      LIMIT 1
    `).get(companyId, messageId);
    if (row) return row;
  }
  if (uid) {
    const row = db.prepare(`
      SELECT id
      FROM emarqet_service_requests
      WHERE company_id=? AND LOWER(COALESCE(mailbox,''))=? AND email_uid=?
      LIMIT 1
    `).get(companyId, normalizeEmail(mailbox), String(uid));
    if (row) return row;
  }
  return null;
}

function createTicket(companyId, mailbox, uid, parsed, envelope = {}) {
  const from = parsed.from?.value?.[0] || envelope.from?.[0] || {};
  const fromEmail = normalizeEmail(from.address);
  const fromName = safeText(from.name || fromEmail);
  const subject = safeText(parsed.subject || envelope.subject || "Mesaj suport e-Marqet");
  const receivedAt = parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())
    ? parsed.date.toISOString()
    : new Date().toISOString();
  const messageId = safeText(parsed.messageId || envelope.messageId || `imap:${uid}`);
  const body = messageBody(parsed);
  const payload = {
    message_id: messageId,
    imap_uid: String(uid || ""),
    from: fromEmail,
    from_name: fromName,
    to: emailList(parsed.to?.value || envelope.to || []),
    cc: emailList(parsed.cc?.value || envelope.cc || []),
    date: receivedAt,
    subject
  };

  const requestId = createMarketplaceServiceRequest(db, companyId, {
    service_code: "support_email",
    requester_name: fromName,
    requester_email: fromEmail,
    status: "NOU",
    request_payload: payload,
    notes: body || subject,
    mailbox,
    channel: "support_email",
    last_email_at: receivedAt,
    created_by: ACTOR
  });

  db.prepare(`
    UPDATE emarqet_service_requests
    SET email_message_id=?,
        email_uid=?,
        email_subject=?,
        last_email_at=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(messageId, String(uid || ""), subject, receivedAt, companyId, requestId);
  return requestId;
}

async function syncSupportTickets({ companyId, limit = 100, commit = false } = {}) {
  const config = mailboxConfig();
  if (!config.host || !config.user || !config.pass) {
    throw new Error("Mailbox suport e-Marqet incomplet. Seteaza EMARQET_SUPPORT_IMAP_HOST, EMARQET_SUPPORT_IMAP_USER si EMARQET_SUPPORT_IMAP_PASS.");
  }

  ensureMarketplaceServicesSchema(db);
  seedMarketplaceServicesCatalog(db, companyId);

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false
  });
  const internalEmails = ownEmails();
  const report = {
    ok: true,
    dryRun: !commit,
    mailbox: maskEmail(config.user),
    host: config.host,
    scanned: 0,
    created: 0,
    skipped: 0,
    duplicates: 0,
    rows: []
  };

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);
  try {
    const exists = Number(client.mailbox.exists || 0);
    const fetchLimit = Math.max(1, Number(limit || 100));
    const start = Math.max(1, exists - fetchLimit + 1);
    if (!exists) return report;

    for await (const message of client.fetch(`${start}:*`, { envelope: true, source: true }, { uid: true })) {
      report.scanned += 1;
      const parsed = await simpleParser(message.source);
      const from = parsed.from?.value?.[0] || message.envelope?.from?.[0] || {};
      const fromEmail = normalizeEmail(from.address);
      const subject = safeText(parsed.subject || message.envelope?.subject || "");
      const messageId = safeText(parsed.messageId || message.envelope?.messageId || `imap:${message.uid}`);
      const row = {
        uid: message.uid,
        from: maskEmail(fromEmail),
        subject,
        messageId,
        action: ""
      };

      if (!fromEmail) {
        row.action = "skipped_missing_from";
        report.skipped += 1;
        report.rows.push(row);
        continue;
      }
      if (internalEmails.has(fromEmail) || isAutomatedSender(fromEmail, subject)) {
        row.action = "skipped_internal_or_automated";
        report.skipped += 1;
        report.rows.push(row);
        continue;
      }
      const duplicate = existingTicket(companyId, config.user, messageId, message.uid);
      if (duplicate) {
        row.action = "duplicate";
        row.ticketId = duplicate.id;
        report.duplicates += 1;
        report.rows.push(row);
        continue;
      }
      if (!commit) {
        row.action = "would_create";
        report.rows.push(row);
        continue;
      }
      const ticketId = createTicket(companyId, config.user, message.uid, parsed, message.envelope);
      row.action = "created";
      row.ticketId = ticketId;
      report.created += 1;
      report.rows.push(row);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return report;
}

async function main() {
  migrate();
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  const limit = Math.max(1, Number(argValue("--limit", "100")) || 100);
  const commit = hasFlag("--commit") || hasFlag("--save");
  const report = await syncSupportTickets({ companyId, limit, commit });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
