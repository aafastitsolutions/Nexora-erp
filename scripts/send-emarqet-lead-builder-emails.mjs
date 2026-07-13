#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  emarqetOfficeEmail,
  emarqetOutreachCcEmails,
  emarqetReplyToEmail
} from "../lib/emarqet-mailboxes.js";
import { createEmarqetTransporter, requireEmarqetSmtpConfig } from "../lib/emarqet-smtp.js";
import {
  buildEmarqetOutboundMessage,
  ensureEmarqetOutboundSchema,
  normalizeEmail,
  safeText
} from "../lib/emarqet-outbound.js";
import {
  ensureLeadBuilderSchema,
  LEAD_PILOT_CAMPAIGN_NAME,
  regenerateLeadDrafts
} from "../lib/lead-builder.js";

dotenv.config();

const DEFAULT_LIMIT = 50;
const DEFAULT_MESSAGE_TYPE = "email_initial";
const ACTOR_EMAIL = "emarqet-lead-builder-email";
const EMAIL_PAUSE_FILE = process.env.EMARQET_EMAIL_PAUSE_FILE
  || path.join(process.cwd(), "utile", "flags", "emarqet-email-sending-paused");

const PLACEHOLDER_EMAILS = new Set([
  "email@domain.com",
  "test@test.com",
  "test@example.com",
  "office@example.com",
  "contact@example.com"
]);

const PLACEHOLDER_DOMAINS = new Set([
  "domain.com",
  "example.com",
  "example.ro",
  "test.com"
]);

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

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
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

function paused() {
  return fs.existsSync(EMAIL_PAUSE_FILE);
}

function escapeHtml(value = "") {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(text = "") {
  const paragraphs = safeText(text)
    .split(/\n{2,}/)
    .map((part) => part.split("\n").map(escapeHtml).join("<br>"))
    .filter(Boolean);
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
      ${paragraphs.map((part) => `<p>${part}</p>`).join("\n")}
    </div>
  `;
}

function emailValidationReason(value = "") {
  const email = normalizeEmail(value);
  if (!email) return "missing_email";
  if (PLACEHOLDER_EMAILS.has(email)) return "placeholder_email";
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "invalid_email";
  const domain = parts[1].toLowerCase();
  if (PLACEHOLDER_DOMAINS.has(domain)) return "placeholder_domain";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "invalid_email";
  return "";
}

function loadCampaign(companyId, campaignId = 0, campaignName = "") {
  if (Number(campaignId || 0)) {
    return db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND id=?").get(companyId, Number(campaignId));
  }
  const name = safeText(campaignName) || LEAD_PILOT_CAMPAIGN_NAME;
  return db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND name=?").get(companyId, name);
}

function loadCandidateRows(companyId, campaignId, messageType, limit) {
  return db.prepare(`
    SELECT
      m.id AS message_id,
      m.message_type,
      m.channel,
      m.subject,
      m.body,
      m.status AS message_status,
      l.id AS lead_id,
      l.status AS lead_status,
      l.stage AS lead_stage,
      l.score,
      l.priority,
      l.campaign_id,
      l.search_id,
      l.lead_company_id,
      c.commercial_name,
      c.legal_name,
      c.cui,
      c.registration_number,
      c.category,
      c.country,
      c.county,
      c.city,
      c.address,
      c.website,
      c.primary_email,
      c.primary_phone,
      c.contact_person,
      c.source_url,
      c.main_source,
      cp.name AS campaign_name
    FROM lead_messages m
    JOIN leads l ON l.id=m.lead_id AND l.company_id=m.company_id
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    JOIN lead_campaigns cp ON cp.id=l.campaign_id AND cp.company_id=l.company_id
    WHERE m.company_id=?
      AND l.campaign_id=?
      AND m.message_type=?
      AND m.channel='email'
      AND COALESCE(l.do_not_contact, 0)=0
      AND COALESCE(m.status, 'draft') NOT IN ('sent', 'rejected', 'do_not_contact', 'call_requested')
      AND COALESCE(c.primary_email, '')<>''
      AND NOT EXISTS (
        SELECT 1
        FROM emarqet_outbound_email_events e
        WHERE e.company_id=m.company_id
          AND LOWER(COALESCE(e.recipient_email, ''))=LOWER(COALESCE(c.primary_email, ''))
          AND UPPER(COALESCE(e.status, ''))='TRIMIS'
      )
    ORDER BY
      CASE COALESCE(m.status, 'draft') WHEN 'approved' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
      l.score DESC,
      l.id ASC
    LIMIT ?
  `).all(companyId, campaignId, messageType, Number(limit || DEFAULT_LIMIT) * 3);
}

function freshMessageForRow(companyId, row, refreshDrafts = false) {
  if (refreshDrafts) {
    regenerateLeadDrafts(db, companyId, row.lead_id, ACTOR_EMAIL);
    const fresh = db.prepare(`
      SELECT subject, body, status
      FROM lead_messages
      WHERE company_id=? AND lead_id=? AND message_type=?
    `).get(companyId, row.lead_id, row.message_type);
    if (fresh?.subject || fresh?.body) {
      return {
        subject: safeText(fresh.subject || row.subject),
        text: safeText(fresh.body || row.body),
        html: textToHtml(fresh.body || row.body),
        templateKey: "lead_builder_auto_dealer"
      };
    }
  }

  if (safeText(row.subject) && safeText(row.body)) {
    return {
      subject: safeText(row.subject),
      text: safeText(row.body),
      html: textToHtml(row.body),
      templateKey: "lead_builder_auto_dealer"
    };
  }

  return buildEmarqetOutboundMessage({
    company_name: row.commercial_name,
    city: row.city,
    county: row.county,
    website: row.website,
    email: row.primary_email,
    phone: row.primary_phone,
    segment_key: "auto_dealers",
    template_key: "auto_dealer"
  });
}

function upsertOutboundLead(companyId, row) {
  const leadKey = `lead_builder:${row.campaign_id}:${row.lead_id}`;
  db.prepare(`
    INSERT INTO emarqet_outbound_leads (
      company_id, lead_key, source, source_file, segment_key, segment_label,
      cui, registration_number, company_name, county, city, address, website,
      email, phone, contact_name, contact_status, outreach_status, notes, created_by, updated_at
    )
    VALUES (
      ?, ?, 'lead_builder', ?, 'auto_dealers', 'Dealeri auto',
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONTACT_FOUND', 'READY', ?, ?, datetime('now')
    )
    ON CONFLICT(company_id, lead_key)
    DO UPDATE SET
      source_file=excluded.source_file,
      cui=excluded.cui,
      registration_number=excluded.registration_number,
      company_name=excluded.company_name,
      county=excluded.county,
      city=excluded.city,
      address=excluded.address,
      website=excluded.website,
      email=excluded.email,
      phone=excluded.phone,
      contact_name=excluded.contact_name,
      contact_status='CONTACT_FOUND',
      outreach_status=CASE
        WHEN emarqet_outbound_leads.outreach_status='EMAIL_SENT' THEN emarqet_outbound_leads.outreach_status
        ELSE 'READY'
      END,
      updated_at=datetime('now')
  `).run(
    companyId,
    leadKey,
    `lead_campaign:${row.campaign_name || row.campaign_id}`,
    safeText(row.cui),
    safeText(row.registration_number),
    safeText(row.commercial_name || row.legal_name),
    safeText(row.county),
    safeText(row.city),
    safeText(row.address),
    safeText(row.website),
    normalizeEmail(row.primary_email),
    safeText(row.primary_phone),
    safeText(row.contact_person),
    `Creat din Lead Builder #${row.lead_id}.`,
    ACTOR_EMAIL
  );
  return db.prepare("SELECT id FROM emarqet_outbound_leads WHERE company_id=? AND lead_key=?").get(companyId, leadKey)?.id;
}

function updateLeadAsSent(companyId, row, message, info, from, replyTo, cc, outboundLeadId) {
  const oldLead = db.prepare("SELECT status FROM leads WHERE company_id=? AND id=?").get(companyId, row.lead_id);
  db.prepare(`
    UPDATE emarqet_outbound_leads
    SET contact_status='CONTACTED',
        outreach_status='EMAIL_SENT',
        last_contacted_at=datetime('now'),
        next_follow_up_at=datetime('now', '+4 days'),
        notes=trim(COALESCE(notes, '') || char(10) || ?),
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(`Email Lead Builder trimis: ${message.subject}; messageId=${safeText(info?.messageId) || "-"}`, companyId, outboundLeadId);

  db.prepare(`
    UPDATE emarqet_outbound_email_events
    SET status='REINCERCAT',
        updated_at=datetime('now')
    WHERE company_id=?
      AND LOWER(COALESCE(recipient_email, ''))=LOWER(?)
      AND UPPER(COALESCE(status, ''))='ESUAT'
  `).run(companyId, normalizeEmail(row.primary_email));

  db.prepare(`
    INSERT INTO emarqet_outbound_email_events (
      company_id, outbound_lead_id, direction, recipient_email, subject,
      template_key, from_email, reply_to_email, cc_email, mailbox, message_type,
      status, provider_message_id, sent_at, created_by
    )
    VALUES (?, ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, 'partner_outreach', 'TRIMIS', ?, datetime('now'), ?)
  `).run(
    companyId,
    outboundLeadId,
    normalizeEmail(row.primary_email),
    message.subject,
    message.templateKey,
    from,
    replyTo,
    cc,
    from,
    safeText(info?.messageId),
    ACTOR_EMAIL
  );

  db.prepare(`
    UPDATE lead_messages
    SET subject=?, body=?, status='sent', sent_at=datetime('now'), updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(message.subject, message.text, companyId, row.message_id);

  db.prepare(`
    UPDATE leads
    SET status='email_trimis',
        stage='email_trimis',
        contacted_at=COALESCE(contacted_at, datetime('now')),
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(companyId, row.lead_id);

  db.prepare(`
    INSERT INTO lead_status_history (company_id, lead_id, status_from, status_to, changed_by_email, note)
    VALUES (?, ?, ?, 'email_trimis', ?, ?)
  `).run(companyId, row.lead_id, oldLead?.status || row.lead_status || "", ACTOR_EMAIL, `Email trimis catre ${normalizeEmail(row.primary_email)}.`);

  db.prepare(`
    INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
    VALUES (?, ?, ?, 'email_sent', ?, ?, ?)
  `).run(
    companyId,
    row.lead_id,
    row.lead_company_id,
    message.subject,
    [`Catre: ${normalizeEmail(row.primary_email)}`, `From: ${from}`, `Reply-To: ${replyTo}`, `CC: ${cc || "-"}`, `MessageId: ${safeText(info?.messageId) || "-"}`].join("\n"),
    ACTOR_EMAIL
  );

  const leadMessage = [
    `Outbound E-MARQET catre ${safeText(row.commercial_name || row.legal_name)}.`,
    `Campanie Lead Builder: ${safeText(row.campaign_name)}.`,
    `Lead Builder #${row.lead_id}.`,
    `Email trimis de la: ${from}.`
  ].join("\n");
  const existingLead = db.prepare(`
    SELECT id
    FROM emarqet_leads
    WHERE company_id=? AND LOWER(COALESCE(requester_email, ''))=? AND source='lead_builder_auto_dealers'
    LIMIT 1
  `).get(companyId, normalizeEmail(row.primary_email));
  if (existingLead?.id) {
    db.prepare(`
      UPDATE emarqet_leads
      SET requester_name=?, requester_phone=?, status='CONTACTAT', message=?, updated_at=datetime('now')
      WHERE company_id=? AND id=?
    `).run(row.commercial_name || row.legal_name || "", row.primary_phone || "", leadMessage, companyId, existingLead.id);
  } else {
    db.prepare(`
      INSERT INTO emarqet_leads (
        company_id, listing_id, vertical_id, requester_name, requester_email,
        requester_phone, source, status, message, created_by
      )
      VALUES (?, NULL, NULL, ?, ?, ?, 'lead_builder_auto_dealers', 'CONTACTAT', ?, ?)
    `).run(companyId, row.commercial_name || row.legal_name || "", normalizeEmail(row.primary_email), row.primary_phone || "", leadMessage, ACTOR_EMAIL);
  }
}

function updateLeadAsFailed(companyId, row, message, error, from, replyTo, cc, outboundLeadId) {
  const errorText = safeText(error?.message || error || "email_send_failed");
  db.prepare(`
    UPDATE emarqet_outbound_leads
    SET outreach_status='FAILED',
        notes=trim(COALESCE(notes, '') || char(10) || ?),
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(`Email Lead Builder esuat: ${message.subject}; error=${errorText}`, companyId, outboundLeadId);
  db.prepare(`
    INSERT INTO emarqet_outbound_email_events (
      company_id, outbound_lead_id, direction, recipient_email, subject,
      template_key, from_email, reply_to_email, cc_email, mailbox, message_type,
      status, error, created_by
    )
    VALUES (?, ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, 'partner_outreach', 'ESUAT', ?, ?)
  `).run(companyId, outboundLeadId, normalizeEmail(row.primary_email), message.subject, message.templateKey, from, replyTo, cc, from, errorText, ACTOR_EMAIL);
  db.prepare(`
    UPDATE lead_messages
    SET status='failed', updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(companyId, row.message_id);
  db.prepare(`
    INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
    VALUES (?, ?, ?, 'email_failed', ?, ?, ?)
  `).run(companyId, row.lead_id, row.lead_company_id, message.subject, errorText, ACTOR_EMAIL);
}

async function main() {
  const dryRun = !hasFlag("--send") || hasFlag("--dry-run");
  const limit = Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT);
  const delayMs = Math.max(0, Number(argValue("--delay-ms", "1500")) || 0);
  const campaignIdArg = Number(argValue("--campaign-id", "0")) || 0;
  const campaignNameArg = safeText(argValue("--campaign-name", LEAD_PILOT_CAMPAIGN_NAME));
  const messageType = safeText(argValue("--message-type", DEFAULT_MESSAGE_TYPE)) || DEFAULT_MESSAGE_TYPE;
  const cc = safeText(argValue("--cc", emarqetOutreachCcEmails()));
  const replyTo = safeText(argValue("--reply-to", emarqetReplyToEmail()));
  const refreshDrafts = !dryRun && !hasFlag("--no-refresh-drafts");
  const from = emarqetOfficeEmail();
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureLeadBuilderSchema(db);
  ensureEmarqetOutboundSchema(db);

  const campaign = loadCampaign(companyId, campaignIdArg, campaignNameArg);
  if (!campaign?.id) throw new Error(`Nu am gasit campania Lead Builder: ${campaignNameArg || campaignIdArg}`);

  const rawRows = loadCandidateRows(companyId, campaign.id, messageType, limit);
  const report = [];
  const selected = [];
  const seenEmails = new Set();
  for (const row of rawRows) {
    const email = normalizeEmail(row.primary_email);
    const invalidReason = emailValidationReason(email);
    if (invalidReason) {
      report.push({ ok: true, skipped: true, reason: invalidReason, leadId: row.lead_id, company: row.commercial_name, email: maskEmail(email) });
      continue;
    }
    if (seenEmails.has(email)) {
      report.push({ ok: true, skipped: true, reason: "duplicate_email_in_batch", leadId: row.lead_id, company: row.commercial_name, email: maskEmail(email) });
      continue;
    }
    seenEmails.add(email);
    selected.push({ ...row, primary_email: email });
    if (selected.length >= limit) break;
  }

  const transporter = dryRun ? null : createEmarqetTransporter(from, {
    allowSenderMismatch: hasFlag("--allow-sender-mismatch")
  });
  if (!dryRun) {
    requireEmarqetSmtpConfig(from, { allowSenderMismatch: hasFlag("--allow-sender-mismatch") });
    await transporter.verify();
  }

  let stoppedEarly = false;
  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index];
    const message = freshMessageForRow(companyId, row, refreshDrafts);
    if (paused()) {
      stoppedEarly = true;
      report.push({ ok: true, skipped: true, reason: "emarqet_email_sending_paused", pauseFile: EMAIL_PAUSE_FILE });
      break;
    }
    if (dryRun) {
      report.push({
        ok: true,
        dryRun: true,
        leadId: row.lead_id,
        messageId: row.message_id,
        company: row.commercial_name,
        email: maskEmail(row.primary_email),
        messageStatus: row.message_status,
        subject: message.subject,
        willRefreshDraftOnSend: !hasFlag("--no-refresh-drafts")
      });
      continue;
    }
    const outboundLeadId = upsertOutboundLead(companyId, row);
    try {
      const info = await transporter.sendMail({
        from,
        to: row.primary_email,
        cc: cc || undefined,
        replyTo: replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html
      });
      const tx = db.transaction(() => updateLeadAsSent(companyId, row, message, info, from, replyTo, cc, outboundLeadId));
      tx();
      report.push({
        ok: true,
        leadId: row.lead_id,
        messageId: row.message_id,
        company: row.commercial_name,
        email: maskEmail(row.primary_email),
        subject: message.subject,
        outboundLeadId,
        providerMessageId: safeText(info?.messageId)
      });
    } catch (error) {
      const tx = db.transaction(() => updateLeadAsFailed(companyId, row, message, error, from, replyTo, cc, outboundLeadId));
      tx();
      report.push({
        ok: false,
        leadId: row.lead_id,
        messageId: row.message_id,
        company: row.commercial_name,
        email: maskEmail(row.primary_email),
        subject: message.subject,
        outboundLeadId,
        error: error?.message || String(error)
      });
    }
    if (delayMs && index < selected.length - 1) await sleep(delayMs);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "outreach", `emarqet-lead-builder-email-report-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    sentAt: new Date().toISOString(),
    dryRun,
    sendRequiredFlag: "--send",
    companyId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    messageType,
    limit,
    delayMs,
    refreshDrafts,
    stoppedEarly,
    pauseFile: EMAIL_PAUSE_FILE,
    from: maskEmail(from),
    replyTo: maskEmail(replyTo),
    cc: maskEmail(cc),
    selected: selected.length,
    report
  }, null, 2));

  console.log(JSON.stringify({
    ok: report.every((item) => item.ok),
    reportPath,
    dryRun,
    campaignId: campaign.id,
    campaignName: campaign.name,
    selected: selected.length,
    attempted: report.length,
    sent: report.filter((item) => item.ok && !item.dryRun && !item.skipped).length,
    skipped: report.filter((item) => item.skipped).length,
    failed: report.filter((item) => !item.ok).length,
    stoppedEarly,
    rows: report
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
