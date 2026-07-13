#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createTransporter } from "../lib/bootstrap.js";
import { db } from "../db.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";

dotenv.config();

const REMINDER_SUBJECT = "Trevoro - completare fotografii si calendar proprietate";

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

function escapeHtml(value = "") {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function maskEmail(value = "") {
  const email = safeText(value);
  const at = email.indexOf("@");
  if (at <= 1) return email ? "***" : "";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function publicBaseUrl() {
  return safeText(process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "https://www.trevoro.ro").replace(/\/+$/, "");
}

function requireEmailConfig() {
  const from = safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER);
  if (!process.env.SMTP_USER || !(process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS) || !from) {
    throw new Error("SMTP nu este configurat complet.");
  }
  return from;
}

function loadTargets({ includeAlreadySent = false } = {}) {
  const duplicateSql = includeAlreadySent
    ? ""
    : `AND NOT EXISTS (
        SELECT 1
        FROM travel_email_messages m
        WHERE m.company_id=p.company_id
          AND lower(trim(m.to_email))=lower(trim(COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), ''))))
          AND m.direction='outbound'
          AND m.subject=?
      )`;
  const params = includeAlreadySent ? [] : [REMINDER_SUBJECT];
  const rows = db.prepare(`
    SELECT
      p.id,
      p.company_id,
      p.name,
      p.city,
      COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), '')) AS owner_email,
      COALESCE(ph.cnt, 0) AS photo_count,
      COALESCE(cl.cnt, 0) AS calendar_count
    FROM travel_properties p
    LEFT JOIN (
      SELECT company_id, property_id, COUNT(*) AS cnt
      FROM travel_property_photos
      GROUP BY company_id, property_id
    ) ph ON ph.company_id=p.company_id AND ph.property_id=p.id
    LEFT JOIN (
      SELECT company_id, property_id, COUNT(*) AS cnt
      FROM travel_property_calendar_links
      WHERE TRIM(COALESCE(calendar_url, '')) <> ''
      GROUP BY company_id, property_id
    ) cl ON cl.company_id=p.company_id AND cl.property_id=p.id
    WHERE p.status='activ'
      AND p.account_status='active'
      AND COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), '')) IS NOT NULL
      AND (COALESCE(ph.cnt, 0)=0 OR COALESCE(cl.cnt, 0)=0)
      ${duplicateSql}
    ORDER BY lower(owner_email), p.name
  `).all(...params);

  const grouped = new Map();
  for (const row of rows) {
    const email = normalizeEmail(row.owner_email);
    if (!email) continue;
    if (!grouped.has(email)) grouped.set(email, {
      email,
      companyId: Number(row.company_id || 0),
      properties: []
    });
    grouped.get(email).properties.push({
      id: Number(row.id || 0),
      name: safeText(row.name),
      city: safeText(row.city),
      photoCount: Number(row.photo_count || 0),
      calendarCount: Number(row.calendar_count || 0),
      needsPhotos: Number(row.photo_count || 0) <= 0,
      needsCalendar: Number(row.calendar_count || 0) <= 0
    });
  }
  return Array.from(grouped.values());
}

function buildMessage(target = {}) {
  const loginUrl = `${publicBaseUrl()}/login?next=%2Fdashboard%2Fpartner`;
  const missingLabel = (property) => {
    if (property.needsPhotos && property.needsCalendar) return "lipsesc fotografiile si calendarul sincronizat";
    if (property.needsPhotos) return "lipsesc fotografiile";
    if (property.needsCalendar) return "lipseste calendarul sincronizat";
    return "actualizare necesara";
  };
  const propertyLines = target.properties.map((property) => {
    return `- ${property.name}${property.city ? ` (${property.city})` : ""}: ${missingLabel(property)}.`;
  });
  const anyPhotos = target.properties.some((property) => property.needsPhotos);
  const anyCalendar = target.properties.some((property) => property.needsCalendar);
  const requestedItems = [
    anyPhotos ? "incarcarea fotografiilor reprezentative ale proprietatii" : "",
    anyCalendar ? "sincronizarea calendarului de disponibilitate" : ""
  ].filter(Boolean).join(" si ");
  const text = [
    "Buna ziua,",
    "",
    "Pentru a putea promova corect proprietatea Dumneavoastra in cadrul platformei Trevoro si pentru a evita solicitari de rezervare pe perioade indisponibile, va rugam sa actualizati contul de proprietar.",
    "",
    `Va rugam sa completati ${requestedItems}.`,
    "",
    "Proprietate/proprietati vizate:",
    ...propertyLines,
    "",
    `Acces cont proprietar: ${loginUrl}`,
    "",
    "Dupa autentificare, mergeti in sectiunile Poze si Calendar si salvati modificarile. Daca intampinati dificultati, ne puteti raspunde direct la acest email sau ne puteti scrie la support@trevoro.ro.",
    "",
    "Va multumim,",
    "Echipa Trevoro"
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#12312d;line-height:1.55">
      <p>Buna ziua,</p>
      <p>Pentru a putea promova corect proprietatea Dumneavoastra in cadrul platformei <strong>Trevoro</strong> si pentru a evita solicitari de rezervare pe perioade indisponibile, va rugam sa actualizati contul de proprietar.</p>
      <p>Va rugam sa completati <strong>${escapeHtml(requestedItems)}</strong>.</p>
      <p><strong>Proprietate/proprietati vizate:</strong></p>
      <ul>${target.properties.map((property) => {
        return `<li>${escapeHtml(property.name)}${property.city ? ` (${escapeHtml(property.city)})` : ""}: ${escapeHtml(missingLabel(property))}.</li>`;
      }).join("")}</ul>
      <p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:8px">Acces cont proprietar</a></p>
      <p>Dupa autentificare, mergeti in sectiunile <strong>Poze</strong> si <strong>Calendar</strong> si salvati modificarile. Daca intampinati dificultati, ne puteti raspunde direct la acest email sau ne puteti scrie la <a href="mailto:support@trevoro.ro">support@trevoro.ro</a>.</p>
      <p>Va multumim,<br>Echipa Trevoro</p>
    </div>
  `;
  return { subject: REMINDER_SUBJECT, text, html };
}

function markSent({ companyId, to, from, info, message }) {
  db.prepare(`
    INSERT INTO travel_email_messages (
      company_id, lead_id, mailbox, direction, provider_message_id,
      from_email, to_email, subject, text_body, received_at, created_at
    )
    VALUES (?, NULL, ?, 'outbound', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    companyId,
    from,
    safeText(info?.messageId || `owner-media-calendar:${Date.now()}:${to}`),
    from,
    to,
    message.subject,
    message.text
  );
}

function markFailed({ companyId, to, from, error, message }) {
  db.prepare(`
    INSERT INTO travel_email_messages (
      company_id, lead_id, mailbox, direction, provider_message_id,
      from_email, to_email, subject, text_body, received_at, created_at
    )
    VALUES (?, NULL, ?, 'outbound_failed', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    companyId,
    from,
    `failed:owner-media-calendar:${Date.now()}:${to}`,
    from,
    to,
    message.subject,
    `Reminder poze/calendar esuat: ${error?.message || String(error)}`
  );
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "outreach");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `trevoro-owner-media-calendar-reminder-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function main() {
  exitIfTrevoroEmailSendingPaused("scripts/send-trevoro-owner-media-calendar-reminders.mjs");
  const dryRun = hasFlag("--dry-run");
  const includeAlreadySent = hasFlag("--include-already-sent");
  const delayMs = Math.max(0, Number(argValue("--delay-ms", 2500)) || 0);
  const from = requireEmailConfig();
  const targets = loadTargets({ includeAlreadySent });
  const report = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    include_already_sent: includeAlreadySent,
    target_count: targets.length,
    sent: 0,
    failed: 0,
    rows: []
  };

  let transporter = null;
  if (!dryRun && targets.length) {
    transporter = createTransporter();
    await transporter.verify();
  }

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const message = buildMessage(target);
    if (dryRun) {
      report.rows.push({
        ok: true,
        dry_run: true,
        to: maskEmail(target.email),
        properties: target.properties.map((property) => ({
          id: property.id,
          name: property.name,
          needsPhotos: property.needsPhotos,
          needsCalendar: property.needsCalendar
        })),
        subject: message.subject,
        text: message.text
      });
      continue;
    }
    try {
      const info = await transporter.sendMail({
        from,
        to: target.email,
        replyTo: "support@trevoro.ro",
        subject: message.subject,
        text: message.text,
        html: message.html
      });
      markSent({ companyId: target.companyId, to: target.email, from, info, message });
      report.sent += 1;
      report.rows.push({ ok: true, to: maskEmail(target.email), properties: target.properties.length, messageId: safeText(info?.messageId) });
    } catch (error) {
      markFailed({ companyId: target.companyId, to: target.email, from, error, message });
      report.failed += 1;
      report.rows.push({ ok: false, to: maskEmail(target.email), error: error?.message || String(error) });
    }
    if (delayMs && index < targets.length - 1) await sleep(delayMs);
  }

  report.finished_at = new Date().toISOString();
  report.report_path = writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    const reportPath = writeReport({
      started_at: new Date().toISOString(),
      ok: false,
      error: error?.message || String(error)
    });
    console.error(`${error?.message || error}\nreport: ${reportPath}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
