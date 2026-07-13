#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createTransporter } from "../lib/bootstrap.js";
import { db, migrate } from "../db.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";

dotenv.config();

const SUBJECT = "Actualizari noi in contul Trevoro pentru proprietatea dumneavoastra";

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
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
  const params = includeAlreadySent ? [] : [SUBJECT];
  const rows = db.prepare(`
    SELECT
      p.id,
      p.company_id,
      p.name,
      p.city,
      COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), '')) AS owner_email
    FROM travel_properties p
    WHERE p.status='activ'
      AND COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), '')) IS NOT NULL
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
      city: safeText(row.city)
    });
  }
  return Array.from(grouped.values());
}

function buildMessage(target = {}) {
  const loginUrl = `${publicBaseUrl()}/login?next=%2Fdashboard%2Fpartner`;
  const propertyLines = (target.properties || []).map((property) => (
    `- ${property.name}${property.city ? ` (${property.city})` : ""}`
  ));
  const text = [
    "Buna ziua,",
    "",
    "Am adaugat functionalitati noi in contul de proprietar Trevoro, pentru ca prezentarea proprietatii sa fie mai completa si mai clara pentru turisti.",
    "",
    "In contul dumneavoastra puteti actualiza acum:",
    "",
    "1. Descrierea proprietatii",
    "Puteti completa o descriere mai detaliata despre proprietate, pozitionare, atmosfera, camere, avantaje si informatii utile pentru turisti.",
    "",
    "2. Facilitati Proprietate",
    "Sectiunea de facilitati a fost reorganizata. Aici puteti selecta facilitatile disponibile, tipurile de masa oferite si regulile generale pentru capacitate si copii.",
    "",
    "3. Camere si tarife",
    "Puteti completa tipurile de camere, tarifele, capacitatea si detaliile fiecarei camere, astfel incat turistul sa vada mai clar ce poate rezerva.",
    "",
    "4. Poze si calendar",
    "Va recomandam sa verificati pozele proprietatii si sa sincronizati calendarul, pentru ca disponibilitatea afisata sa fie cat mai corecta.",
    "",
    "Proprietate/proprietati vizate:",
    ...propertyLines,
    "",
    "Va rugam sa intrati in contul Trevoro si sa actualizati informatiile proprietatii, astfel incat listarea dumneavoastra sa fie promovata cat mai bine pe platforma.",
    "",
    `Acces cont proprietar: ${loginUrl}`,
    "",
    "Suport tehnic Trevoro:",
    "Email: support@trevoro.ro",
    "WhatsApp: 0774362975",
    "Program suport: 09:00-18:00, luni-vineri",
    "",
    "Va multumim,",
    "Echipa Trevoro"
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#12312d;line-height:1.55">
      <p>Buna ziua,</p>
      <p>Am adaugat functionalitati noi in contul de proprietar <strong>Trevoro</strong>, pentru ca prezentarea proprietatii sa fie mai completa si mai clara pentru turisti.</p>
      <p><strong>In contul dumneavoastra puteti actualiza acum:</strong></p>
      <ol>
        <li><strong>Descrierea proprietatii</strong><br>Puteti completa o descriere mai detaliata despre proprietate, pozitionare, atmosfera, camere, avantaje si informatii utile pentru turisti.</li>
        <li><strong>Facilitati Proprietate</strong><br>Sectiunea de facilitati a fost reorganizata. Aici puteti selecta facilitatile disponibile, tipurile de masa oferite si regulile generale pentru capacitate si copii.</li>
        <li><strong>Camere si tarife</strong><br>Puteti completa tipurile de camere, tarifele, capacitatea si detaliile fiecarei camere, astfel incat turistul sa vada mai clar ce poate rezerva.</li>
        <li><strong>Poze si calendar</strong><br>Va recomandam sa verificati pozele proprietatii si sa sincronizati calendarul, pentru ca disponibilitatea afisata sa fie cat mai corecta.</li>
      </ol>
      <p><strong>Proprietate/proprietati vizate:</strong></p>
      <ul>${(target.properties || []).map((property) => `<li>${escapeHtml(property.name)}${property.city ? ` (${escapeHtml(property.city)})` : ""}</li>`).join("")}</ul>
      <p>Va rugam sa intrati in contul Trevoro si sa actualizati informatiile proprietatii, astfel incat listarea dumneavoastra sa fie promovata cat mai bine pe platforma.</p>
      <p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:8px">Acces cont proprietar</a></p>
      <p><strong>Suport tehnic Trevoro</strong><br>
        Email: <a href="mailto:support@trevoro.ro">support@trevoro.ro</a><br>
        WhatsApp: 0774362975<br>
        Program suport: 09:00-18:00, luni-vineri
      </p>
      <p>Va multumim,<br>Echipa Trevoro</p>
    </div>
  `;
  return { subject: SUBJECT, text, html };
}

function markSent({ companyId, to, from, info, message }) {
  db.prepare(`
    INSERT OR IGNORE INTO travel_email_messages (
      company_id, lead_id, mailbox, direction, provider_message_id,
      from_email, to_email, subject, text_body, received_at, created_at
    )
    VALUES (?, NULL, ?, 'outbound', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    companyId,
    from,
    safeText(info?.messageId || `owner-feature-update:${Date.now()}:${to}`),
    from,
    to,
    message.subject,
    message.text
  );
}

function markFailed({ companyId, to, from, error, message }) {
  db.prepare(`
    INSERT OR IGNORE INTO travel_email_messages (
      company_id, lead_id, mailbox, direction, provider_message_id,
      from_email, to_email, subject, text_body, received_at, created_at
    )
    VALUES (?, NULL, ?, 'outbound_failed', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    companyId,
    from,
    `failed:owner-feature-update:${Date.now()}:${to}`,
    from,
    to,
    message.subject,
    `Email actualizari proprietar esuat: ${error?.message || String(error)}`
  );
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "outreach");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `trevoro-owner-feature-update-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function main() {
  exitIfTrevoroEmailSendingPaused("scripts/send-trevoro-owner-feature-update-email.mjs");
  migrate();
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
        properties: target.properties.map((property) => ({ id: property.id, name: property.name })),
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
