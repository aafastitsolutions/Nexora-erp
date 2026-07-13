#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createTransporter } from "../lib/bootstrap.js";
import { db, migrate } from "../db.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";

dotenv.config();

const SUBJECT = "Trevoro - completare poze si preturi pentru promovare social media";
const SUPPORT_EMAIL = "support@trevoro.ro";
const SUPPORT_PHONE = "0774362975";
const SCRIPT_NAME = "scripts/send-trevoro-owner-photo-price-reminder-email.mjs";

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(name + "="));
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

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function escapeHtml(value = "") {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function publicBaseUrl() {
  return safeText(process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "https://www.trevoro.ro")
    .replace(/\/+$/, "")
    .replace("https://trevoro.ro", "https://www.trevoro.ro");
}

function emailFrom() {
  return safeText(
    process.env.TREVORO_OWNER_REMINDER_FROM ||
    process.env.MAIL_FROM ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    process.env.TREVORO_SUPPORT_FROM ||
    SUPPORT_EMAIL ||
    "contact@trevoro.ro"
  );
}

function requireEmailConfig() {
  const from = emailFrom();
  if (!process.env.SMTP_USER || !(process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS) || !from) {
    throw new Error("SMTP nu este configurat complet.");
  }
  return from;
}

function propertyLabel(property = {}) {
  return safeText(property.name) + (property.city ? " (" + safeText(property.city) + ")" : "");
}

function roDate(value = "") {
  const text = safeText(value);
  if (!text) return "";
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function loadTargets({ includeAlreadySent = false, includePendingAccounts = false, limit = 0, onlyEmail = "" } = {}) {
  const params = [];
  const duplicateClause = includeAlreadySent ? "" : [
    "AND NOT EXISTS (",
    "  SELECT 1",
    "  FROM travel_email_messages m",
    "  WHERE m.company_id=p.company_id",
    "    AND lower(trim(m.to_email))=lower(trim(COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), ''))))",
    "    AND m.direction='outbound'",
    "    AND m.subject=?",
    ")"
  ].join("\n");
  if (!includeAlreadySent) params.push(SUBJECT);

  const accountStatusClause = includePendingAccounts ? "" : "AND p.account_status='active'";
  const rows = db.prepare([
    "WITH photo_counts AS (",
    "  SELECT property_id, COUNT(*) AS photo_count",
    "  FROM travel_property_photos",
    "  GROUP BY property_id",
    ")",
    "SELECT",
    "  p.id,",
    "  p.company_id,",
    "  p.lead_id,",
    "  p.name,",
    "  p.city,",
    "  p.country,",
    "  p.account_status,",
    "  COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), '')) AS owner_email,",
    "  COALESCE(pc.photo_count, 0) AS photo_count,",
    "  COALESCE(p.price_per_night, 0) AS price_per_night,",
    "  COALESCE(NULLIF(TRIM(p.price_currency), ''), 'RON') AS price_currency,",
    "  COALESCE(NULLIF(TRIM(p.partner_plan), ''), 'standard_monthly') AS partner_plan,",
    "  COALESCE(p.monthly_price_ron, 0) AS monthly_price_ron,",
    "  p.free_until,",
    "  p.activation_source",
    "FROM travel_properties p",
    "LEFT JOIN photo_counts pc ON pc.property_id=p.id",
    "WHERE p.status='activ'",
    "  " + accountStatusClause,
    "  AND lower(trim(COALESCE(p.partner_plan, '')))='founding_partner'",
    "  AND lower(trim(COALESCE(p.subscription_status, '')))='free_12_months'",
    "  AND COALESCE(pc.photo_count, 0)=0",
    "  AND COALESCE(p.price_per_night, 0)<=0",
    "  AND COALESCE(NULLIF(TRIM(p.account_email), ''), NULLIF(TRIM(p.email), '')) IS NOT NULL",
    "  " + duplicateClause,
    "ORDER BY lower(owner_email), p.name"
  ].join("\n")).all(...params);

  const wantedEmail = normalizeEmail(onlyEmail);
  const grouped = new Map();
  const skipped = [];

  for (const row of rows) {
    const email = normalizeEmail(row.owner_email);
    const property = {
      id: Number(row.id || 0),
      companyId: Number(row.company_id || 0),
      leadId: Number(row.lead_id || 0) || null,
      name: safeText(row.name),
      city: safeText(row.city),
      country: safeText(row.country),
      accountStatus: safeText(row.account_status),
      photoCount: Number(row.photo_count || 0),
      pricePerNight: Number(row.price_per_night || 0),
      priceCurrency: safeText(row.price_currency || "RON"),
      partnerPlan: safeText(row.partner_plan || "standard_monthly"),
      monthlyPriceRon: Number(row.monthly_price_ron || 0),
      freeUntil: safeText(row.free_until),
      activationSource: safeText(row.activation_source)
    };

    if (wantedEmail && email !== wantedEmail) continue;
    if (!email) {
      skipped.push({ reason: "missing_email", property });
      continue;
    }
    if (!isValidEmail(email)) {
      skipped.push({ reason: "invalid_email", email, property });
      continue;
    }

    if (!grouped.has(email)) {
      grouped.set(email, { email, companyId: property.companyId, properties: [] });
    }
    grouped.get(email).properties.push(property);
  }

  const targets = Array.from(grouped.values());
  return {
    targets: limit > 0 ? targets.slice(0, limit) : targets,
    skipped
  };
}

function buildMessage(target = {}) {
  const dashboardUrl = publicBaseUrl() + "/login?next=%2Fdashboard%2Fpartner";
  const guideUrl = publicBaseUrl() + "/dashboard/partner/ghid";
  const photoUrl = publicBaseUrl() + "/dashboard/partner?view=poze";
  const infoUrl = publicBaseUrl() + "/dashboard/partner?view=proprietate";
  const roomsUrl = publicBaseUrl() + "/dashboard/partner?view=camere";
  const calendarUrl = publicBaseUrl() + "/dashboard/partner?view=calendar";
  const propertyLines = (target.properties || []).map((property) => "- " + propertyLabel(property));
  const htmlProperties = (target.properties || [])
    .map((property) => {
      const freeUntil = roDate(property.freeUntil);
      const extra = property.partnerPlan === "founding_partner" && freeUntil
        ? " - exceptie comerciala activa pana la " + freeUntil
        : "";
      return "<li>" + escapeHtml(propertyLabel(property) + extra) + "</li>";
    })
    .join("");
  const commercialExceptionText = (target.properties || []).some((property) => property.partnerPlan === "founding_partner")
    ? [
      "Important: sunteti membru fondator Trevoro. Nu aveti nimic de platit catre Trevoro pentru publicarea listarii in perioada gratuita aprobata.",
      "Va rugam doar sa completati pozele si tarifele de cazare, ca sa putem promova proprietatea corect pe site si pe social media.",
      "Prin pret/tarif ne referim la pretul de cazare afisat turistilor, nu la o plata catre Trevoro.",
      "Trevoro pastreaza 0% comision pe rezervari."
    ]
    : [];
  const htmlCommercialException = commercialExceptionText.length
    ? "<div style=\"background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px;margin:14px 0\"><strong>Important:</strong> sunteti membru fondator Trevoro. Nu aveti nimic de platit catre Trevoro pentru publicarea listarii in perioada gratuita aprobata.<br>Va rugam doar sa completati pozele si tarifele de cazare, ca sa putem promova proprietatea corect pe site si pe social media.<br>Prin pret/tarif ne referim la pretul de cazare afisat turistilor, nu la o plata catre Trevoro.<br>Trevoro pastreaza <strong>0% comision pe rezervari</strong>.</div>"
    : "";
  const text = [
    "Buna ziua,",
    "",
    "Va scriem din partea echipei de suport Trevoro cu un reminder pentru completarea listarii.",
    "",
    "Am observat ca proprietatea/proprietatile de mai jos nu au inca poze incarcate si nu au pret/tarif afisat in contul Trevoro:",
    "",
    ...propertyLines,
    "",
    ...commercialExceptionText,
    commercialExceptionText.length ? "" : "",
    "Pentru ca turistii sa poata vedea corect proprietatea si ca noi sa o putem promova profesional pe Trevoro si pe social media, va rugam sa intrati in cont si sa completati:",
    "",
    "1. Incarcati poze reale ale proprietatii: exterior, camere, baie, zona de luat masa si facilitati.",
    "2. Completati pretul/tariful de baza pe noapte sau tarifele pe camere, astfel incat turistul sa vada informatii actuale.",
    "3. Actualizati informatiile proprietatii: descriere, facilitati, capacitate, adresa, telefon si email de contact.",
    "4. Daca aveti tarife diferite pe camere sau perioade, completati sectiunile Camere si tarife / Disponibilitate.",
    "5. Daca folositi Booking, Airbnb sau un channel manager, sincronizati calendarul pentru a evita suprapunerile.",
    "",
    "Puteti incarca maximum 30 de poze pentru fiecare proprietate.",
    "",
    "Acces cont proprietar:",
    "- Link login: " + dashboardUrl,
    "- Email cont: " + target.email,
    "- Parola: parola pe care ati creat-o la inscriere. Din motive de securitate, Trevoro nu trimite parola prin email.",
    "- Dupa introducerea parolei, veti primi pe email un cod de verificare pentru autentificare.",
    "",
    "Ghiduri disponibile in cont:",
    "- Ghid cont proprietar: " + guideUrl,
    "- Sectiunea Poze: " + photoUrl,
    "- Sectiunea Informatii proprietate: " + infoUrl,
    "- Sectiunea Camere si tarife: " + roomsUrl,
    "- Sectiunea Calendar si disponibilitate: " + calendarUrl,
    "",
    "Daca aveti nevoie de ajutor, ne puteti contacta direct:",
    "Email: " + SUPPORT_EMAIL,
    "WhatsApp: " + SUPPORT_PHONE,
    "Program suport: 09:00-18:00, luni-vineri",
    "",
    "Va multumim,",
    "Echipa Trevoro"
  ].join("\n");

  const html = [
    "<div style=\"font-family:Arial,sans-serif;color:#12312d;line-height:1.55\">",
    "<p>Buna ziua,</p>",
    "<p>Va scriem din partea echipei de suport <strong>Trevoro</strong> cu un reminder pentru completarea listarii.</p>",
    "<p>Am observat ca proprietatea/proprietatile de mai jos nu au inca poze incarcate si nu au pret/tarif afisat in contul Trevoro:</p>",
    "<ul>" + htmlProperties + "</ul>",
    htmlCommercialException,
    "<p>Pentru ca turistii sa poata vedea corect proprietatea si ca noi sa o putem promova profesional pe Trevoro si pe social media, va rugam sa intrati in cont si sa completati:</p>",
    "<ol>",
    "<li>Incarcati poze reale ale proprietatii: exterior, camere, baie, zona de luat masa si facilitati.</li>",
    "<li>Completati pretul/tariful de baza pe noapte sau tarifele pe camere, astfel incat turistul sa vada informatii actuale.</li>",
    "<li>Actualizati informatiile proprietatii: descriere, facilitati, capacitate, adresa, telefon si email de contact.</li>",
    "<li>Daca aveti tarife diferite pe camere sau perioade, completati sectiunile <strong>Camere si tarife</strong> / <strong>Disponibilitate</strong>.</li>",
    "<li>Daca folositi Booking, Airbnb sau un channel manager, sincronizati calendarul pentru a evita suprapunerile.</li>",
    "</ol>",
    "<p>Puteti incarca maximum <strong>30 de poze</strong> pentru fiecare proprietate.</p>",
    "<p><strong>Date conectare:</strong><br>",
    "Link login: <a href=\"" + escapeHtml(dashboardUrl) + "\">" + escapeHtml(dashboardUrl) + "</a><br>",
    "Email cont: <strong>" + escapeHtml(target.email) + "</strong><br>",
    "Parola: parola pe care ati creat-o la inscriere. Din motive de securitate, Trevoro nu trimite parola prin email.<br>",
    "Dupa introducerea parolei, veti primi pe email un cod de verificare pentru autentificare.</p>",
    "<p><a href=\"" + escapeHtml(dashboardUrl) + "\" style=\"display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:8px\">Acces cont proprietar</a></p>",
    "<p><strong>Ghiduri disponibile in cont:</strong><br>",
    "<a href=\"" + escapeHtml(guideUrl) + "\">Ghid cont proprietar</a><br>",
    "<a href=\"" + escapeHtml(photoUrl) + "\">Sectiunea Poze</a><br>",
    "<a href=\"" + escapeHtml(infoUrl) + "\">Sectiunea Informatii proprietate</a><br>",
    "<a href=\"" + escapeHtml(roomsUrl) + "\">Sectiunea Camere si tarife</a><br>",
    "<a href=\"" + escapeHtml(calendarUrl) + "\">Sectiunea Calendar si disponibilitate</a></p>",
    "<p>Daca aveti nevoie de ajutor, ne puteti contacta direct:<br>",
    "Email: <a href=\"mailto:" + SUPPORT_EMAIL + "\">" + SUPPORT_EMAIL + "</a><br>",
    "WhatsApp: " + SUPPORT_PHONE + "<br>",
    "Program suport: 09:00-18:00, luni-vineri</p>",
    "<p>Va multumim,<br>Echipa Trevoro</p>",
    "</div>"
  ].join("\n");

  return { subject: SUBJECT, text, html };
}

function markEmailMessage({ companyId, direction, to, from, providerMessageId, subject, text }) {
  db.prepare([
    "INSERT OR IGNORE INTO travel_email_messages (",
    "  company_id, lead_id, mailbox, direction, provider_message_id,",
    "  from_email, to_email, subject, text_body, received_at, created_at",
    ")",
    "VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ].join("\n")).run(companyId, from, direction, providerMessageId, from, to, subject, text);
}

function logOwnerEvent({ property, eventType, severity = "info", actorEmail = "", subject = "", details = "", metadata = {} }) {
  db.prepare([
    "INSERT INTO travel_owner_account_events (",
    "  company_id, property_id, lead_id, event_type, severity, actor_email, actor_role, source,",
    "  subject, details, metadata_json, request_method, request_path",
    ")",
    "VALUES (?, ?, ?, ?, ?, ?, 'system', 'nexora_outreach', ?, ?, ?, 'SCRIPT', ?)"
  ].join("\n")).run(
    property.companyId,
    property.id,
    property.leadId || null,
    eventType,
    severity,
    actorEmail,
    subject,
    details,
    JSON.stringify(metadata || {}),
    SCRIPT_NAME
  );
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "outreach");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, "trevoro-owner-photo-price-reminder-report-" + timestamp + ".json");
  const finalReport = { ...report, report_path: reportPath };
  fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2) + "\n", "utf8");
  return { reportPath, finalReport };
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function main() {
  const allowWhilePaused = hasFlag("--allow-while-paused");
  if (!allowWhilePaused) exitIfTrevoroEmailSendingPaused(SCRIPT_NAME);
  migrate();
  const dryRun = hasFlag("--dry-run");
  const includeAlreadySent = hasFlag("--include-already-sent");
  const includePendingAccounts = hasFlag("--include-pending-accounts");
  const limit = Math.max(0, Number(argValue("--limit", 0)) || 0);
  const delayMs = Math.max(0, Number(argValue("--delay-ms", 2500)) || 0);
  const onlyEmail = argValue("--only-email", "");
  const from = dryRun ? emailFrom() : requireEmailConfig();
  const { targets, skipped } = loadTargets({ includeAlreadySent, includePendingAccounts, limit, onlyEmail });
  const report = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    subject: SUBJECT,
    include_already_sent: includeAlreadySent,
    include_pending_accounts: includePendingAccounts,
    allow_while_paused: allowWhilePaused,
    limit,
    only_email: onlyEmail || "",
    target_count: targets.length,
    skipped_count: skipped.length,
    sent: 0,
    failed: 0,
    skipped,
    rows: []
  };

  let transporter = null;
  if (!dryRun && targets.length) {
    transporter = createTransporter();
    await transporter.verify();
  }

  if (!dryRun) {
    for (const skippedRow of skipped) {
      if (!skippedRow.property) continue;
      logOwnerEvent({
        property: skippedRow.property,
        eventType: "owner_photo_price_reminder_skipped",
        severity: "warning",
        actorEmail: from,
        subject: SUBJECT,
        details: "Reminder poze si preturi netrimis: " + skippedRow.reason,
        metadata: skippedRow
      });
    }
  }

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const message = buildMessage(target);
    if (dryRun) {
      report.rows.push({
        ok: true,
        dry_run: true,
        to: target.email,
        properties: target.properties.map((property) => ({ id: property.id, name: property.name, city: property.city })),
        subject: message.subject,
        text: message.text
      });
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: target.email,
        replyTo: SUPPORT_EMAIL,
        subject: message.subject,
        text: message.text,
        html: message.html,
        allowWhenTrevoroEmailPaused: allowWhilePaused
      });
      const messageId = safeText(info?.messageId || "owner-photo-price-reminder:" + Date.now() + ":" + target.email);
      markEmailMessage({
        companyId: target.companyId,
        direction: "outbound",
        to: target.email,
        from,
        providerMessageId: messageId,
        subject: message.subject,
        text: message.text
      });
      for (const property of target.properties) {
        logOwnerEvent({
          property,
          eventType: "owner_photo_price_reminder_email_sent",
          actorEmail: from,
          subject: message.subject,
          details: "Reminder poze si preturi trimis catre " + target.email,
          metadata: { to: target.email, provider_message_id: messageId, property }
        });
      }
      report.sent += 1;
      report.rows.push({ ok: true, to: target.email, properties: target.properties.map((property) => ({ id: property.id, name: property.name })), messageId });
    } catch (error) {
      const errorMessage = error?.message || String(error);
      markEmailMessage({
        companyId: target.companyId,
        direction: "outbound_failed",
        to: target.email,
        from,
        providerMessageId: "failed:owner-photo-price-reminder:" + Date.now() + ":" + target.email,
        subject: message.subject,
        text: "Email reminder poze si preturi esuat: " + errorMessage
      });
      for (const property of target.properties) {
        logOwnerEvent({
          property,
          eventType: "owner_photo_price_reminder_email_failed",
          severity: "error",
          actorEmail: from,
          subject: message.subject,
          details: errorMessage,
          metadata: { to: target.email, error: errorMessage, property }
        });
      }
      report.failed += 1;
      report.rows.push({ ok: false, to: target.email, properties: target.properties.map((property) => ({ id: property.id, name: property.name })), error: errorMessage });
    }

    if (delayMs && index < targets.length - 1) await sleep(delayMs);
  }

  report.finished_at = new Date().toISOString();
  const { finalReport } = writeReport(report);
  console.log(JSON.stringify(finalReport, null, 2));
  if (report.failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    const { finalReport } = writeReport({
      started_at: new Date().toISOString(),
      ok: false,
      subject: SUBJECT,
      error: error?.message || String(error)
    });
    console.error(JSON.stringify(finalReport, null, 2));
    process.exitCode = 1;
  })
  .finally(() => db.close());
