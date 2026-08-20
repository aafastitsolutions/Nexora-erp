#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";
import { createTransporter } from "../lib/bootstrap.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";

dotenv.config();

const DEFAULT_LIMIT = 50;
const CLAIM_URL = `${safePublicBaseUrl()}/#formular`;
const INTERNATIONAL_CLAIM_URL = `${safePublicBaseUrl().replace("https://trevoro.ro", "https://www.trevoro.ro")}/en/owners#form`;
const OUR_EMAIL_PATTERNS = [
  /@trevoro\.ro$/i,
  /mailer-daemon/i,
  /postmaster/i
];

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

function safePublicBaseUrl() {
  return safeText(process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "https://trevoro.ro").replace(/\/+$/, "");
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

function escapeHtml(value = "") {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function extractEmails(value = "") {
  return [...new Set(safeText(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])]
    .map(normalizeEmail)
    .filter(Boolean);
}

function splitEmails(value = "") {
  return safeText(value)
    .split(/[,\s;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function isOurEmail(email = "") {
  const normalized = normalizeEmail(email);
  return OUR_EMAIL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function requireEmailConfig() {
  const from = safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER);
  if (!process.env.SMTP_USER || !(process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS) || !from) {
    throw new Error("SMTP nu este configurat complet.");
  }
  return from;
}

function alreadyFollowedUp(companyId, leadId, email) {
  return Boolean(db.prepare(`
    SELECT id
    FROM travel_lead_activities
    WHERE company_id=?
      AND lead_id=?
      AND activity_type='interested_alt_followup_sent'
      AND lower(COALESCE(details, '')) LIKE ?
    LIMIT 1
  `).get(companyId, leadId, `%${normalizeEmail(email)}%`));
}

function loadInterestedReplies(companyId, limit) {
  return db.prepare(`
    SELECT
      l.id AS lead_id,
      l.company_id,
      l.name,
      l.property_type,
      l.country,
      l.city,
      l.county,
      l.email AS lead_email,
      l.status,
      m.id AS message_id,
      m.from_email,
      m.to_email,
      m.subject,
      m.text_body,
      m.received_at
    FROM travel_leads l
    JOIN travel_email_messages m ON m.company_id=l.company_id AND m.lead_id=l.id
    WHERE l.company_id=?
      AND l.status='interesat'
      AND m.direction='inbound'
      AND COALESCE(m.text_body, '')<>''
    ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC
    LIMIT ?
  `).all(companyId, Math.max(1, Number(limit || DEFAULT_LIMIT)));
}

function alternativeEmails(row) {
  const original = new Set([
    normalizeEmail(row.lead_email),
    ...splitEmails(row.from_email),
    ...splitEmails(row.to_email)
  ].filter(Boolean));

  return extractEmails(row.text_body)
    .filter((email) => !original.has(email))
    .filter((email) => !isOurEmail(email));
}

function buildMessage(row, targetEmail) {
  const name = safeText(row.name) || "proprietatea dvs.";
  const city = safeText(row.city) || "zona dvs.";
  const propertyType = safeText(row.property_type) || "proprietate";
  const supportEmail = "support@trevoro.ro";
  const supportHoursRo = "Program suport: 09:00-18:00, luni-vineri.";
  const supportHoursEn = "Support hours: 09:00-18:00, Monday-Friday, Romania time.";
  const supportMailto = `mailto:${supportEmail}?subject=${encodeURIComponent("I need support publishing my property on Trevoro")}`;
  const isRomania = safeText(row.country || "Romania").toLowerCase() === "romania";
  if (!isRomania) {
    const claimUrl = INTERNATIONAL_CLAIM_URL;
    const subject = `Trevoro - 12 months free for ${safeText(row.name) || "your property"}`;
    const text = [
      "Hello,",
      "",
      `We received a reply for ${safeText(row.name) || "your property"}, ${safeText(row.property_type) || "property"} in ${safeText(row.city) || "your area"}, where this address was indicated for more details.`,
      "",
      "We are contacting you from Trevoro, a new Romanian booking platform for hotels, guesthouses, villas, cabins and serviced apartments.",
      "",
      "Trevoro registrations are now open. During launch, the owner account and property listing preparation are free.",
      "",
      "The launch offer includes:",
      "- free owner registration during launch",
      "- direct guest requests",
      "- support for preparing the property listing on Trevoro",
      "",
      `We also offer support for any issue related to publishing your property. You can contact us directly at ${supportEmail}.`,
      supportHoursEn,
      "",
      "Registration link:",
      claimUrl,
      "",
      "If you are not the right person, please send us the correct contact address and we will update it.",
      "",
      "Thank you,",
      "The Trevoro Team"
    ].join("\n");
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
        <p>Hello,</p>
        <p>We received a reply for <strong>${escapeHtml(row.name || "your property")}</strong>, ${escapeHtml(row.property_type || "property")} in ${escapeHtml(row.city || "your area")}, where this address was indicated for more details.</p>
        <p>We are contacting you from <strong>Trevoro</strong>, a new Romanian booking platform for hotels, guesthouses, villas, cabins and serviced apartments.</p>
        <div style="padding:14px 16px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;margin:16px 0">
          <strong>Launch offer</strong><br>
          Owner registration and property listing preparation are <strong>free during launch</strong>. The Trevoro team helps with publishing support and direct guest requests.
        </div>
        <p>We also offer support for any issue related to publishing your property.</p>
        <p><strong>Support hours:</strong> 09:00-18:00, Monday-Friday, Romania time.</p>
        <p><a href="${supportMailto}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:bold">Need support? Email Trevoro</a></p>
        <p>Registration link:<br><a href="${claimUrl}">${claimUrl}</a></p>
        <p>If you are not the right person, please send us the correct contact address and we will update it.</p>
        <p>Thank you,<br>The Trevoro Team</p>
        <p style="font-size:12px;color:#94a3b8">Lead: ${Number(row.lead_id)} · alternative contact: ${escapeHtml(targetEmail)}</p>
      </div>
    `;
    return { subject, text, html };
  }
  const subject = `Trevoro - inscriere gratuita in programul de lansare pentru ${name}`;
  const text = [
    "Bună ziua,",
    "",
    `Am primit un răspuns pentru ${name}, ${propertyType} din ${city}, în care a fost indicată această adresă pentru detalii.`,
    "",
    "Vă scriem din partea Trevoro, platforma românească pentru listarea proprietăților turistice.",
    "",
    "S-au deschis inscrierile pe Trevoro, iar in perioada de lansare oferim pregatirea listarii gratuit.",
    "",
    "Oferta de lansare include:",
    "- inscriere gratuita in programul de lansare",
    "- cereri directe de la turisti",
    "- suport pentru publicarea proprietatii pe Trevoro",
    "",
    `Pentru suport legat de publicarea proprietății, ne puteți scrie direct la ${supportEmail}.`,
    supportHoursRo,
    "",
    "Dacă proprietatea poate fi listată acum sau după redeschidere/renovare, înscrierea se poate face aici:",
    CLAIM_URL,
    "",
    "Dacă nu sunteți persoana potrivită, ne puteți indica adresa corectă și actualizăm contactul.",
    "",
    "Mulțumesc,",
    "Echipa Trevoro"
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
      <p>Bună ziua,</p>
      <p>Am primit un răspuns pentru <strong>${escapeHtml(name)}</strong>, ${escapeHtml(propertyType)} din ${escapeHtml(city)}, în care a fost indicată această adresă pentru detalii.</p>
      <p>Vă scriem din partea <strong>Trevoro</strong>, platforma românească pentru listarea proprietăților turistice.</p>
      <div style="padding:14px 16px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;margin:16px 0">
        <strong>Oferta de lansare Trevoro</strong><br>
        Inscrierea in programul de lansare si pregatirea listarii sunt <strong>gratuite</strong>.<br><br>
        Echipa Trevoro ajuta la publicarea proprietatii si la pregatirea cererilor directe de la turisti.
      </div>
      <p>Oferim suport pentru orice problemă legată de publicarea proprietății pe Trevoro. Ne puteți scrie direct la <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      <p><strong>Program suport:</strong> 09:00-18:00, luni-vineri.</p>
      <p><a href="mailto:${supportEmail}?subject=Am nevoie de suport pentru publicarea proprietății pe Trevoro" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:bold">Am nevoie de suport</a></p>
      <p>Dacă proprietatea poate fi listată acum sau după redeschidere/renovare, înscrierea se poate face aici:<br><a href="${CLAIM_URL}">${CLAIM_URL}</a></p>
      <p>Dacă nu sunteți persoana potrivită, ne puteți indica adresa corectă și actualizăm contactul.</p>
      <p>Mulțumesc,<br>Echipa Trevoro</p>
      <p style="font-size:12px;color:#94a3b8">Lead: ${Number(row.lead_id)} · contact alternativ: ${escapeHtml(targetEmail)}</p>
    </div>
  `;
  return { subject, text, html };
}

function markSent(companyId, row, targetEmail, info, subject, from, replyTo, cc) {
  db.transaction(() => {
    db.prepare(`
      UPDATE travel_leads
      SET next_follow_up_at=datetime('now', '+3 days'),
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(row.lead_id, companyId);

    db.prepare(`
      INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
      VALUES (?, ?, 'interested_alt_followup_sent', 'Follow-up automat către contact alternativ', ?, datetime('now'))
    `).run(
      companyId,
      row.lead_id,
      [
        `către: ${normalizeEmail(targetEmail)}`,
        `mascat: ${maskEmail(targetEmail)}`,
        `subiect: ${subject}`,
        replyTo ? `reply-to: ${maskEmail(replyTo)}` : "",
        cc ? `cc: ${maskEmail(cc)}` : "",
        `sursa mesaj inbound: ${row.message_id}`,
        `messageId: ${safeText(info?.messageId) || "-"}`
      ].filter(Boolean).join("; ")
    );

    db.prepare(`
      INSERT OR IGNORE INTO travel_email_messages (
        company_id, lead_id, mailbox, direction, provider_message_id,
        from_email, to_email, subject, text_body, received_at
      )
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      row.lead_id,
      from,
      safeText(info?.messageId) || `interested-alt:${Date.now()}:${row.lead_id}`,
      from,
      normalizeEmail(targetEmail),
      subject,
      "Follow-up automat Trevoro către contact alternativ indicat într-un răspuns."
    );
  })();
}

function markSkipped(companyId, row, reason) {
  db.prepare(`
    INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
    VALUES (?, ?, 'interested_alt_followup_skipped', 'Follow-up contact alternativ omis', ?, datetime('now'))
  `).run(companyId, row.lead_id, `mesaj inbound: ${row.message_id}; motiv: ${reason}`);
}

function writeReport(payload) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "follow-up");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `trevoro-interested-followup-report-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  exitIfTrevoroEmailSendingPaused("scripts/follow-up-interested-travel-replies.mjs");
  migrate();
  const limit = Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT);
  const dryRun = hasFlag("--dry-run");
  const company = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  const companyId = Number(company?.id || 0);
  if (!companyId) throw new Error("Nu am găsit companie activă.");

  const from = requireEmailConfig();
  const replyTo = safeText(argValue("--reply-to", process.env.TREVORO_REPLY_TO || process.env.MAIL_REPLY_TO || process.env.REPLY_TO || ""));
  const cc = safeText(argValue("--cc", process.env.TREVORO_OUTREACH_CC || ""));
  const rows = loadInterestedReplies(companyId, limit);
  const transporter = createTransporter();
  if (!dryRun) await transporter.verify();

  const report = [];
  for (const row of rows) {
    const emails = alternativeEmails(row);
    if (!emails.length) {
      report.push({ ok: true, skipped: true, id: row.lead_id, name: row.name, reason: "no_alternative_email" });
      continue;
    }

    for (const email of emails) {
      if (alreadyFollowedUp(companyId, row.lead_id, email)) {
        report.push({ ok: true, skipped: true, id: row.lead_id, name: row.name, email: maskEmail(email), reason: "already_followed_up" });
        continue;
      }

      const message = buildMessage(row, email);
      if (dryRun) {
        report.push({ ok: true, dryRun: true, id: row.lead_id, name: row.name, email: maskEmail(email), subject: message.subject });
        continue;
      }

      try {
        const info = await transporter.sendMail({
          from,
          to: email,
          cc: cc || undefined,
          replyTo: replyTo || undefined,
          subject: message.subject,
          text: message.text,
          html: message.html
        });
        markSent(companyId, row, email, info, message.subject, from, replyTo, cc);
        report.push({ ok: true, id: row.lead_id, name: row.name, email: maskEmail(email), subject: message.subject, messageId: safeText(info?.messageId) });
      } catch (error) {
        const reason = error?.message || String(error);
        markSkipped(companyId, row, `send_failed: ${reason}`);
        report.push({ ok: false, id: row.lead_id, name: row.name, email: maskEmail(email), error: reason });
      }
    }
  }

  const payload = {
    checked_at: new Date().toISOString(),
    dryRun,
    limit,
    claimUrl: CLAIM_URL,
    processedReplies: rows.length,
    sent: report.filter((row) => row.ok && !row.skipped && !row.dryRun).length,
    skipped: report.filter((row) => row.skipped).length,
    failed: report.filter((row) => !row.ok).length,
    report
  };
  payload.reportPath = writeReport(payload);
  console.log(JSON.stringify({
    ok: payload.failed === 0,
    dryRun,
    processedReplies: payload.processedReplies,
    sent: payload.sent,
    skipped: payload.skipped,
    failed: payload.failed,
    reportPath: payload.reportPath,
    rows: report
  }, null, 2));
  if (payload.failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
