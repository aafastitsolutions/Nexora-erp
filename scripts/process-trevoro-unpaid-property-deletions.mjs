#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createTransporter } from "../lib/bootstrap.js";
import { db, migrate } from "../db.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";

dotenv.config();

const SCRIPT_NAME = "scripts/process-trevoro-unpaid-property-deletions.mjs";
const GRACE_DAYS = Math.max(1, Number(process.env.TREVORO_PROPERTY_DELETION_GRACE_DAYS || 30) || 30);
const SUPPORT_EMAIL = "support@trevoro.ro";
const UNPAID_SUBSCRIPTION_STATUSES = new Set(["payment_required", "past_due", "expired", "unpaid"]);
const DELETED_STATUSES = new Set(["sters", "deleted"]);

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

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function publicPropertySlug(property = {}) {
  return `${Number(property.id || 0)}-${slugify([property.name, property.city].filter(Boolean).join(" "))}`;
}

function publicBaseUrl() {
  return safeText(
    process.env.TREVORO_PUBLIC_BASE_URL ||
    process.env.TREVORO_SITE_URL ||
    process.env.NEXT_PUBLIC_TREVORO_SITE_URL ||
    "https://www.trevoro.ro"
  ).replace(/\/+$/, "").replace("https://trevoro.ro", "https://www.trevoro.ro");
}

function emailFrom() {
  return safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || "contact@trevoro.ro");
}

function requireEmailConfig() {
  const from = emailFrom();
  if (!process.env.SMTP_USER || !(process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS) || !from) {
    throw new Error("SMTP nu este configurat complet.");
  }
  return from;
}

function displayDate(value = "") {
  return safeText(value).slice(0, 10);
}

function dateTimeAfterDays(days = GRACE_DAYS) {
  const date = new Date(Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function propertyUrl(property = {}) {
  return `${publicBaseUrl()}/properties/${publicPropertySlug(property)}`;
}

function ownerEmail(property = {}) {
  return normalizeEmail(property.account_email || property.email);
}

function buildNoticeMessage(property = {}, scheduledAt = "") {
  const propertyName = safeText(property.name || "proprietatea ta");
  const scheduledDate = displayDate(scheduledAt) || `in ${GRACE_DAYS} zile`;
  const loginUrl = `${publicBaseUrl()}/login?next=%2Fdashboard%2Fpartner`;
  const subject = `Trevoro: proprietatea ${propertyName} are nevoie de verificare`;
  const text = [
    "Buna ziua,",
    "",
    `Proprietatea ${propertyName} are nevoie de verificare in Trevoro.`,
    `Daca datele nu sunt completate, proprietatea poate fi scoasa temporar din public la data ${scheduledDate}.`,
    "",
    "Ce inseamna asta:",
    "- pagina publica nu va mai fi vizibila in Trevoro;",
    "- contul de proprietar va fi suspendat pana la reactivare;",
    "- istoricul ramane pastrat pentru verificare.",
    "",
    `Link proprietate: ${propertyUrl(property)}`,
    `Cont proprietar: ${loginUrl}`,
    `Pentru verificare sau reactivare, raspunde la acest email sau scrie la ${SUPPORT_EMAIL}.`,
    "",
    "Echipa Trevoro"
  ].join("\n");
  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px\">",
    "<h1 style=\"font-size:22px;margin:0 0 12px;color:#92400e\">Verificare necesara pentru listarea Trevoro</h1>",
    "<p>Proprietatea <strong>" + escapeHtml(propertyName) + "</strong> are nevoie de verificare in Trevoro.</p>",
    "<p style=\"padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px\">Daca datele nu sunt completate, proprietatea poate fi scoasa temporar din public la data <strong>" + escapeHtml(scheduledDate) + "</strong>.</p>",
    "<p><strong>Ce inseamna asta:</strong></p>",
    "<ul><li>pagina publica nu va mai fi vizibila in Trevoro;</li><li>contul de proprietar va fi suspendat pana la reactivare;</li><li>istoricul ramane pastrat pentru verificare.</li></ul>",
    "<p><a href=\"" + escapeHtml(loginUrl) + "\" style=\"display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:8px\">Intra in contul de proprietar</a></p>",
    "<p>Daca ai nevoie de ajutor pentru verificare, raspunde la acest email sau scrie la <a href=\"mailto:" + SUPPORT_EMAIL + "\">" + SUPPORT_EMAIL + "</a>.</p>",
    "<p style=\"margin-top:24px\">Echipa Trevoro</p>",
    "</div>"
  ].join("\n");
  return { subject, text, html };
}

function buildDeletedMessage(property = {}) {
  const propertyName = safeText(property.name || "proprietatea ta");
  const loginUrl = `${publicBaseUrl()}/login?next=%2Fdashboard%2Fpartner`;
  const subject = `Trevoro: proprietatea ${propertyName} a fost oprita temporar`;
  const text = [
    "Buna ziua,",
    "",
    `Proprietatea ${propertyName} a fost scoasa temporar din public in Trevoro pentru verificare.`,
    "Contul de proprietar ramane disponibil pentru actualizarea datelor.",
    "",
    `Cont proprietar: ${loginUrl}`,
    `Suport: ${SUPPORT_EMAIL}`,
    "",
    "Echipa Trevoro"
  ].join("\n");
  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px\">",
    "<h1 style=\"font-size:22px;margin:0 0 12px;color:#991b1b\">Listare oprita temporar</h1>",
    "<p>Proprietatea <strong>" + escapeHtml(propertyName) + "</strong> a fost scoasa temporar din public in Trevoro pentru verificare.</p>",
    "<p>Contul de proprietar ramane disponibil pentru actualizarea datelor.</p>",
    "<p><a href=\"" + escapeHtml(loginUrl) + "\" style=\"display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:8px\">Intra in contul de proprietar</a></p>",
    "<p>Pentru reactivare sau verificare, scrie la <a href=\"mailto:" + SUPPORT_EMAIL + "\">" + SUPPORT_EMAIL + "</a>.</p>",
    "<p style=\"margin-top:24px\">Echipa Trevoro</p>",
    "</div>"
  ].join("\n");
  return { subject, text, html };
}

function loadCandidates(limit = 200) {
  return db.prepare([
    "SELECT *",
    "FROM travel_properties",
    "WHERE COALESCE(status, '') NOT IN ('sters', 'deleted')",
    "  AND (",
    "    lower(trim(COALESCE(status, '')))='plata_necesara'",
    "    OR lower(trim(COALESCE(subscription_status, ''))) IN ('payment_required', 'past_due', 'expired', 'unpaid')",
    "  )",
    "  AND COALESCE(NULLIF(TRIM(account_email), ''), NULLIF(TRIM(email), '')) IS NOT NULL",
    "ORDER BY COALESCE(deletion_scheduled_at, datetime('now', '+100 years')) ASC, updated_at ASC, id ASC",
    "LIMIT ?"
  ].join("\n")).all(Number(limit || 200));
}

function markEmailMessage({ companyId, leadId, direction, to, from, providerMessageId, subject, text }) {
  db.prepare([
    "INSERT OR IGNORE INTO travel_email_messages (",
    "  company_id, lead_id, mailbox, direction, provider_message_id,",
    "  from_email, to_email, subject, text_body, received_at, created_at",
    ")",
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ].join("\n")).run(Number(companyId || 0), leadId || null, from, direction, providerMessageId, from, to, subject, text);
}

function logOwnerEvent({ property, eventType, severity = "info", actorEmail = "", subject = "", details = "", metadata = {} }) {
  db.prepare([
    "INSERT INTO travel_owner_account_events (",
    "  company_id, property_id, lead_id, event_type, severity, actor_email, actor_role, source,",
    "  subject, details, metadata_json, request_method, request_path",
    ")",
    "VALUES (?, ?, ?, ?, ?, ?, 'system', 'nexora_property_lifecycle', ?, ?, ?, 'SCRIPT', ?)"
  ].join("\n")).run(
    Number(property.company_id || 0),
    Number(property.id || 0),
    property.lead_id || null,
    eventType,
    severity,
    normalizeEmail(actorEmail),
    subject,
    safeText(details).slice(0, 2000),
    JSON.stringify(metadata || {}).slice(0, 4000),
    SCRIPT_NAME
  );
}

function scheduleDeletion(property = {}, scheduledAt = "") {
  db.prepare([
    "UPDATE travel_properties",
    "SET deletion_notice_sent_at=COALESCE(deletion_notice_sent_at, datetime('now')),",
    "    deletion_scheduled_at=?,",
    "    updated_at=datetime('now')",
    "WHERE id=? AND company_id=?"
  ].join("\n")).run(scheduledAt, Number(property.id || 0), Number(property.company_id || 0));
}

function markDeleted(property = {}, actorEmail = "") {
  db.prepare([
    "UPDATE travel_properties",
    "SET status='sters',",
    "    account_status='suspended',",
    "    deleted_at=COALESCE(deleted_at, datetime('now')),",
    "    deletion_reason='auto_unpaid_30_days',",
    "    deleted_by_email=?,",
    "    updated_at=datetime('now')",
    "WHERE id=? AND company_id=?"
  ].join("\n")).run(normalizeEmail(actorEmail), Number(property.id || 0), Number(property.company_id || 0));
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "property-lifecycle");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, "trevoro-unpaid-property-deletions-" + timestamp + ".json");
  const finalReport = { ...report, report_path: reportPath };
  fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2) + "\n", "utf8");
  return { reportPath, finalReport };
}

async function sendMessage({ transporter, from, to, message, property, type }) {
  const info = await transporter.sendMail({
    from,
    to,
    replyTo: SUPPORT_EMAIL,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
  const providerMessageId = safeText(info?.messageId || `property-${type}:${Date.now()}:${property.id || to}`);
  markEmailMessage({
    companyId: property.company_id,
    leadId: property.lead_id,
    direction: "outbound",
    to,
    from,
    providerMessageId,
    subject: message.subject,
    text: message.text
  });
  return providerMessageId;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const noEmail = hasFlag("--no-email");
  const ignorePause = hasFlag("--ignore-pause");
  const limit = Math.max(1, Number(argValue("--limit", 200)) || 200);

  if (!dryRun && !noEmail && !ignorePause) {
    exitIfTrevoroEmailSendingPaused(SCRIPT_NAME);
  }

  migrate();
  const from = dryRun || noEmail ? emailFrom() : requireEmailConfig();
  const candidates = loadCandidates(limit);
  const report = {
    ok: true,
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    no_email: noEmail,
    grace_days: GRACE_DAYS,
    candidate_count: candidates.length,
    notices_scheduled: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    rows: []
  };

  let transporter = null;
  if (!dryRun && !noEmail && candidates.length) {
    transporter = createTransporter();
    await transporter.verify();
  }

  for (const property of candidates) {
    const status = safeText(property.status).toLowerCase();
    const subscriptionStatus = safeText(property.subscription_status).toLowerCase();
    const to = ownerEmail(property);

    if (DELETED_STATUSES.has(status) || safeText(property.deleted_at)) {
      report.skipped += 1;
      report.rows.push({ id: property.id, name: property.name, action: "skipped_deleted" });
      continue;
    }

    if (status !== "plata_necesara" && !UNPAID_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
      report.skipped += 1;
      report.rows.push({ id: property.id, name: property.name, action: "skipped_paid" });
      continue;
    }

    const scheduledAt = safeText(property.deletion_scheduled_at || dateTimeAfterDays(GRACE_DAYS));
    const shouldDelete = safeText(property.deletion_scheduled_at) && safeText(property.deletion_scheduled_at) <= new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
      if (!safeText(property.deletion_notice_sent_at) || !safeText(property.deletion_scheduled_at)) {
        const message = buildNoticeMessage(property, scheduledAt);
        if (!dryRun) {
          scheduleDeletion(property, scheduledAt);
          let providerMessageId = "";
          if (!noEmail) providerMessageId = await sendMessage({ transporter, from, to, message, property, type: "notice" });
          logOwnerEvent({
            property,
            eventType: "property_deletion_notice_sent",
            actorEmail: from,
            subject: message.subject,
            details: `Avertizare dezactivare trimisa catre ${to}; dezactivare programata la ${scheduledAt}`,
            metadata: { to, scheduled_at: scheduledAt, provider_message_id: providerMessageId, no_email: noEmail }
          });
        }
        report.notices_scheduled += 1;
        report.rows.push({ id: property.id, name: property.name, to, action: "notice_scheduled", scheduled_at: scheduledAt, dry_run: dryRun });
        continue;
      }

      if (!shouldDelete) {
        report.skipped += 1;
        report.rows.push({ id: property.id, name: property.name, to, action: "waiting", scheduled_at: property.deletion_scheduled_at });
        continue;
      }

      const message = buildDeletedMessage(property);
      if (!dryRun) {
        markDeleted(property, from);
        let providerMessageId = "";
        if (!noEmail) providerMessageId = await sendMessage({ transporter, from, to, message, property, type: "deleted" });
        logOwnerEvent({
          property,
          eventType: "property_deleted_unpaid",
          severity: "warning",
          actorEmail: from,
          subject: message.subject,
          details: `Proprietate scoasa din public dupa perioada de gratie pentru plata. Email catre ${to}`,
          metadata: { to, scheduled_at: property.deletion_scheduled_at, provider_message_id: providerMessageId, no_email: noEmail }
        });
      }
      report.deleted += 1;
      report.rows.push({ id: property.id, name: property.name, to, action: "deleted", scheduled_at: property.deletion_scheduled_at, dry_run: dryRun });
    } catch (error) {
      report.failed += 1;
      report.rows.push({ id: property.id, name: property.name, to, action: "failed", error: error?.message || "failed" });
      if (!dryRun) {
        logOwnerEvent({
          property,
          eventType: "property_lifecycle_failed",
          severity: "error",
          actorEmail: from,
          subject: "Eroare lifecycle proprietate",
          details: error?.message || "failed",
          metadata: { to }
        });
      }
    }
  }

  report.finished_at = new Date().toISOString();
  const { finalReport } = writeReport(report);
  console.log(JSON.stringify(finalReport, null, 2));
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
