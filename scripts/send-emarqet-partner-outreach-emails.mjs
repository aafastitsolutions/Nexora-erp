#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import { createTransporter } from "../lib/bootstrap.js";
import {
  buildEmarqetOutboundMessage,
  ensureEmarqetOutboundSchema,
  isGenericBusinessEmail,
  normalizeEmail,
  normalizeKey,
  safeText,
  segmentByKey
} from "../lib/emarqet-outbound.js";

dotenv.config();

const DEFAULT_LIMIT = 10;
const EMAIL_PAUSE_FILE = process.env.EMARQET_EMAIL_PAUSE_FILE
  || path.join(process.cwd(), "utile", "flags", "emarqet-email-sending-paused");

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
  const row = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(row?.id || 0);
}

function matchesFilter(value = "", filter = "") {
  const expected = normalizeKey(filter);
  if (!expected) return true;
  return normalizeKey(value).includes(expected);
}

function requireEmailConfig() {
  const from = safeText(process.env.EMARQET_MAIL_FROM || process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER);
  if (!from || !process.env.SMTP_USER || !(process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS)) {
    throw new Error("SMTP nu este configurat complet.");
  }
  return from;
}

function paused() {
  return fs.existsSync(EMAIL_PAUSE_FILE);
}

function loadEligibleLeads(companyId, filters = {}) {
  const selectedSegment = segmentByKey(filters.segment);
  const segmentFilter = selectedSegment?.key || safeText(filters.segment);
  const where = [
    "company_id=?",
    "email IS NOT NULL",
    "TRIM(email)<>''",
    "opt_out_at IS NULL",
    "outreach_status IN ('READY','FAILED')",
    `NOT EXISTS (
      SELECT 1 FROM emarqet_outbound_email_events e
      WHERE e.company_id=emarqet_outbound_leads.company_id
        AND e.outbound_lead_id=emarqet_outbound_leads.id
        AND e.status='TRIMIS'
    )`
  ];
  const params = [companyId];
  if (segmentFilter) {
    where.push("segment_key=?");
    params.push(segmentFilter);
  }
  if (filters.county) {
    where.push("county IS NOT NULL");
  }
  if (filters.city) {
    where.push("city IS NOT NULL");
  }
  params.push(Math.max(Number(filters.limit || DEFAULT_LIMIT) * 5, 50));
  const rows = db.prepare(`
    SELECT *
    FROM emarqet_outbound_leads
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE contact_status WHEN 'CONTACT_FOUND' THEN 1 ELSE 2 END,
      updated_at DESC,
      id ASC
    LIMIT ?
  `).all(...params);
  const selected = [];
  const seenEmails = new Set();
  for (const row of rows) {
    if (!matchesFilter(row.county, filters.county)) continue;
    if (!matchesFilter(row.city, filters.city)) continue;
    const email = normalizeEmail(row.email);
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);
    selected.push({ ...row, email });
    if (selected.length >= Number(filters.limit || DEFAULT_LIMIT)) break;
  }
  return selected;
}

function markSent(companyId, row, message, info, from) {
  db.prepare(`
    UPDATE emarqet_outbound_leads
    SET contact_status='CONTACTED',
        outreach_status='EMAIL_SENT',
        last_contacted_at=datetime('now'),
        next_follow_up_at=datetime('now', '+4 days'),
        notes=trim(COALESCE(notes, '') || char(10) || ?),
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(`Email outbound trimis: ${message.subject}; messageId=${safeText(info?.messageId) || "-"}`, companyId, row.id);

  db.prepare(`
    INSERT INTO emarqet_outbound_email_events (
      company_id, outbound_lead_id, direction, recipient_email, subject,
      template_key, status, provider_message_id, sent_at, created_by
    )
    VALUES (?, ?, 'OUT', ?, ?, ?, 'TRIMIS', ?, datetime('now'), 'emarqet-outbound-email')
  `).run(companyId, row.id, row.email, message.subject, message.templateKey, safeText(info?.messageId));

  const existingLead = db.prepare(`
    SELECT id
    FROM emarqet_leads
    WHERE company_id=? AND LOWER(COALESCE(requester_email,''))=? AND source='outbound_caen'
    LIMIT 1
  `).get(companyId, normalizeEmail(row.email));
  const leadMessage = [
    `Outbound e-Marqet catre ${row.company_name}.`,
    `Segment: ${row.segment_label || row.segment_key || "-"}.`,
    `CAEN: ${row.caen_code || "-"}.`,
    `Sursa: ${row.source || "-"}.`,
    `Email trimis de la: ${from}.`
  ].join("\n");
  if (existingLead?.id) {
    db.prepare(`
      UPDATE emarqet_leads
      SET status='CONTACTAT',
          message=?,
          updated_at=datetime('now')
      WHERE company_id=? AND id=?
    `).run(leadMessage, companyId, existingLead.id);
  } else {
    db.prepare(`
      INSERT INTO emarqet_leads (
        company_id, listing_id, vertical_id, requester_name, requester_email,
        requester_phone, source, status, message, created_by
      )
      VALUES (?, NULL, NULL, ?, ?, ?, 'outbound_caen', 'CONTACTAT', ?, 'emarqet-outbound-email')
    `).run(companyId, row.company_name, row.email, row.phone || "", leadMessage);
  }
}

function markFailed(companyId, row, message, error) {
  const errorText = safeText(error?.message || error || "email_send_failed");
  db.prepare(`
    UPDATE emarqet_outbound_leads
    SET outreach_status='FAILED',
        notes=trim(COALESCE(notes, '') || char(10) || ?),
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(`Email outbound esuat: ${message.subject}; error=${errorText}`, companyId, row.id);
  db.prepare(`
    INSERT INTO emarqet_outbound_email_events (
      company_id, outbound_lead_id, direction, recipient_email, subject,
      template_key, status, error, created_by
    )
    VALUES (?, ?, 'OUT', ?, ?, ?, 'ESUAT', ?, 'emarqet-outbound-email')
  `).run(companyId, row.id, row.email, message.subject, message.templateKey, errorText);
}

async function main() {
  const limit = Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT);
  const rawSegment = safeText(argValue("--segment"));
  const selectedSegment = segmentByKey(rawSegment);
  const segment = selectedSegment?.key || rawSegment;
  const county = safeText(argValue("--county"));
  const city = safeText(argValue("--city"));
  const delayMs = Math.max(0, Number(argValue("--delay-ms", "1500")) || 0);
  const cc = safeText(argValue("--cc", process.env.EMARQET_OUTREACH_CC || ""));
  const replyTo = safeText(argValue("--reply-to", process.env.EMARQET_REPLY_TO || process.env.MAIL_REPLY_TO || process.env.REPLY_TO || ""));
  const allowNonGeneric = hasFlag("--allow-non-generic");
  const dryRun = !hasFlag("--send") || hasFlag("--dry-run");
  const from = requireEmailConfig();
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureEmarqetOutboundSchema(db);

  const rows = loadEligibleLeads(companyId, { limit, segment, county, city });
  const transporter = createTransporter();
  if (!dryRun) await transporter.verify();

  const report = [];
  let stoppedEarly = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const message = buildEmarqetOutboundMessage(row);
    if (!allowNonGeneric && !isGenericBusinessEmail(row.email)) {
      report.push({ ok: true, skipped: true, reason: "non_generic_or_free_email", id: row.id, company: row.company_name, email: maskEmail(row.email), segment: row.segment_key });
      continue;
    }
    if (paused()) {
      stoppedEarly = true;
      report.push({ ok: true, skipped: true, reason: "emarqet_email_sending_paused", pauseFile: EMAIL_PAUSE_FILE });
      break;
    }
    if (dryRun) {
      report.push({ ok: true, dryRun: true, id: row.id, company: row.company_name, email: maskEmail(row.email), segment: row.segment_key, subject: message.subject });
      continue;
    }
    try {
      const info = await transporter.sendMail({
        from,
        to: row.email,
        cc: cc || undefined,
        replyTo: replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html
      });
      markSent(companyId, row, message, info, from);
      report.push({ ok: true, id: row.id, company: row.company_name, email: maskEmail(row.email), segment: row.segment_key, subject: message.subject, messageId: safeText(info?.messageId) });
    } catch (error) {
      markFailed(companyId, row, message, error);
      report.push({ ok: false, id: row.id, company: row.company_name, email: maskEmail(row.email), segment: row.segment_key, subject: message.subject, error: error?.message || String(error) });
    }
    if (delayMs && index < rows.length - 1) await sleep(delayMs);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "outreach", `emarqet-partner-outreach-email-report-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    sentAt: new Date().toISOString(),
    dryRun,
    sendRequiredFlag: "--send",
    limit,
    segment,
    county,
    city,
    stoppedEarly,
    pauseFile: EMAIL_PAUSE_FILE,
    allowNonGeneric,
    cc: maskEmail(cc),
    report
  }, null, 2));

  console.log(JSON.stringify({
    reportPath,
    dryRun,
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
