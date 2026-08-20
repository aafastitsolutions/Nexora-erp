import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import { createTransporter } from "./bootstrap.js";
import { buildTrevoroOutreachMessage } from "./trevoro-outreach-messages.js";
import { exitIfTrevoroEmailSendingPaused, isTrevoroEmailSendingPaused } from "../scripts/lib/trevoro-email-pause.mjs";

dotenv.config();

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0;
const DEFAULT_SOURCE = "osm";
const PROSPECTING_SOURCES = [
  "osm",
  "official_tourism_registry",
  "official_portugal_rnt",
  "official_france_atout_france",
  "turistinfo",
  "infopensiuni",
  "hoteluri_infoturism"
];
const TRANSIENT_SMTP_PATTERNS = [
  "too much mail",
  "rate limit",
  "try again later",
  "temporar",
  "temporarily",
  "4.7.1",
  "450 "
];
const SMTP_QUOTA_PATTERNS = [
  "daily message count limit",
  "message count limit has exceeded",
  "daily quota",
  "quota exceeded",
  "too much mail",
  "rate limit"
];
const CLAIM_URL = `${safePublicBaseUrl().replace("https://trevoro.ro", "https://www.trevoro.ro")}/proprietari#formular`;
const INTERNATIONAL_CLAIM_URL = `${safePublicBaseUrl().replace("https://trevoro.ro", "https://www.trevoro.ro")}/en/owners#form`;
const SUPPORT_EMAIL = "support@trevoro.ro";
const SUPPORT_HOURS_RO = "Program suport: 09:00-18:00, luni-vineri.";
const SUPPORT_HOURS_EN = "Support hours: 09:00-18:00, Monday-Friday, Romania time.";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("I need support publishing my property on Trevoro")}`;
const RO_SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Am nevoie de suport pentru publicarea proprietății pe Trevoro")}`;
const SUPPORT_WHATSAPP_DISPLAY = "+40 774 362 975";
const SUPPORT_WHATSAPP_URL = "https://wa.me/40774362975";
const DEFAULT_RELAUNCH_CAMPAIGN_KEY = "trevoro-free-12m-launch-2026-07";
const EXCLUDED_BRAND_PATTERNS = [
  "hilton",
  "intercontinental",
  "ihg",
  "marriott",
  "autograph collection",
  "radisson",
  "ramada",
  "accor",
  "ibis",
  "novotel",
  "mercure",
  "continental",
  "golden tulip",
  "vienna house"
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

function normalizeKey(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function normalizeUrlHost(value = "") {
  const raw = safeText(value).toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .trim();
  }
}

function parseSources(value = DEFAULT_SOURCE) {
  const raw = safeText(value || DEFAULT_SOURCE).toLowerCase();
  if (["all", "prospecting", "cold"].includes(raw)) return [...PROSPECTING_SOURCES];
  const sources = raw
    .split(",")
    .map(safeText)
    .filter(Boolean);
  return sources.length ? sources : [DEFAULT_SOURCE];
}

function isTransientSmtpError(value = "") {
  const normalized = safeText(value).toLowerCase();
  return TRANSIENT_SMTP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isSmtpQuotaError(value = "") {
  const normalized = safeText(value).toLowerCase();
  return SMTP_QUOTA_PATTERNS.some((pattern) => normalized.includes(pattern));
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

function escapeHtml(value = "") {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isRomaniaLead(lead = {}) {
  return safeText(lead.country || "Romania").toLowerCase() === "romania";
}

function englishNextSteps() {
  return [
    "What happens after registration:",
    "1. You receive access to the owner dashboard.",
    "2. You verify the property details and add real photos.",
    "3. You paste your iCal/ICS calendar link from Google Calendar, Booking.com, Airbnb or Outlook in Trevoro > Calendar.",
    "4. Trevoro syncs busy dates and helps you prepare the listing for launch."
  ];
}

function romanianNextSteps() {
  return [
    "Ce se întâmplă după înscriere:",
    "1. Primiți acces în contul de proprietar.",
    "2. Verificați datele proprietății și adăugați poze reale.",
    "3. Lipiți în Trevoro > Calendar linkul iCal/ICS din Google Calendar, Booking.com, Airbnb sau Outlook.",
    "4. Trevoro sincronizează zilele ocupate și vă ajută să pregătiți listarea pentru lansare."
  ];
}

function englishPromotionBenefits() {
  return [
    "How we promote your property:",
    "- your property is published in the Trevoro search experience",
    "- selected properties are featured in launch campaigns and social content",
    "- we create SEO-oriented property pages to help tourists find accommodation by destination and property type",
    "- support is included for listing setup, photos, calendar sync and requests"
  ];
}

function romanianPromotionBenefits() {
  return [
    "Cum vă promovăm proprietatea:",
    "- proprietatea apare în căutarea Trevoro",
    "- proprietățile selectate sunt promovate în campaniile de lansare și în conținut social",
    "- construim pagini SEO pentru destinații și tipuri de proprietăți, ca turiștii să găsească mai ușor cazarea",
    "- suportul este inclus pentru listare, poze, sincronizare calendar și cereri"
  ];
}

function listingPlanTextLines() {
  return INTERNATIONAL_LISTING_PLANS.map(([label, price]) => `- ${label}: ${price}`);
}

function listingPlanHtmlRows() {
  return INTERNATIONAL_LISTING_PLANS
    .map(([label, price]) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${escapeHtml(price)}</td>
      </tr>
    `)
    .join("");
}

function buildMessage(lead = {}) {
  return buildTrevoroOutreachMessage(lead, { publicBaseUrl: safePublicBaseUrl() });
}

function requireEmailConfig() {
  const from = safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER);
  if (!process.env.SMTP_USER || !(process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS) || !from) {
    throw new Error("SMTP nu este configurat complet.");
  }
  return from;
}

function isExcludedBrand(lead = {}) {
  const haystack = normalizeKey([lead.name, lead.email, lead.website].filter(Boolean).join(" "));
  return EXCLUDED_BRAND_PATTERNS.some((pattern) => haystack.includes(normalizeKey(pattern)));
}

function sqliteDateMs(value = "") {
  const text = safeText(value);
  if (!text) return 0;
  const normalized = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function loadEmailBlocks(companyId, { campaignKey = "" } = {}) {
  const rows = db.prepare(`
    SELECT lead_id, lower(trim(to_email)) AS email, direction, text_body, received_at
    FROM travel_email_messages
    WHERE company_id=?
      AND direction IN ('outbound', 'bounce', 'outbound_failed')
  `).all(companyId);

  const sentLeadIds = new Set();
  const sentEmails = new Set();
  const recentlySentLeadIds = new Set();
  const recentlySentEmails = new Set();
  const campaignLeadIds = new Set();
  const campaignEmails = new Set();
  const failedLeadIds = new Set();
  const failedEmails = new Set();
  const now = Date.now();
  const recentWindowMs = 18 * 60 * 60 * 1000;
  const sameCampaignWindowMs = 24 * 60 * 60 * 1000;
  const campaignMarker = campaignKey ? `[campaign:${campaignKey}]` : "";

  for (const row of rows) {
    const leadId = Number(row.lead_id || 0);
    const email = normalizeEmail(row.email);
    const messageAt = sqliteDateMs(row.received_at);

    if (row.direction === "outbound") {
      if (leadId) sentLeadIds.add(leadId);
      if (email) sentEmails.add(email);
      if (!messageAt || now - messageAt < sameCampaignWindowMs) {
        if (leadId) recentlySentLeadIds.add(leadId);
        if (email) recentlySentEmails.add(email);
      }
      if (campaignMarker && safeText(row.text_body).includes(campaignMarker)) {
        if (leadId) campaignLeadIds.add(leadId);
        if (email) campaignEmails.add(email);
      }
      continue;
    }

    if (row.direction === "bounce") {
      if (leadId) failedLeadIds.add(leadId);
      if (email) failedEmails.add(email);
      continue;
    }

    const recentFailure = messageAt ? now - messageAt < recentWindowMs : true;
    const transientFailure = isTransientSmtpError(row.text_body);
    if (recentFailure || !transientFailure) {
      if (leadId) failedLeadIds.add(leadId);
      if (email) failedEmails.add(email);
    }
  }

  return { campaignEmails, campaignLeadIds, failedEmails, failedLeadIds, recentlySentEmails, recentlySentLeadIds, sentEmails, sentLeadIds };
}

function loadRegisteredPropertyBlocks(companyId) {
  const rows = db.prepare(`
    SELECT lead_id, name, city, country, email, account_email, website
    FROM travel_properties
    WHERE company_id=?
      AND COALESCE(deleted_at, '')=''
      AND UPPER(COALESCE(status, '')) NOT IN ('STERS', 'DELETED', 'ANULAT')
  `).all(companyId);

  const leadIds = new Set();
  const emails = new Set();
  const websites = new Set();
  const namesByPlace = new Set();

  for (const row of rows) {
    const leadId = Number(row.lead_id || 0);
    if (leadId) leadIds.add(leadId);
    for (const email of [row.email, row.account_email]) {
      const normalized = normalizeEmail(email);
      if (normalized) emails.add(normalized);
    }
    const website = normalizeUrlHost(row.website);
    if (website) websites.add(website);
    const name = normalizeKey(row.name);
    const city = normalizeKey(row.city);
    const country = normalizeKey(row.country || "Romania");
    if (name && city) namesByPlace.add(`${name}|${city}|${country}`);
  }

  return { emails, leadIds, namesByPlace, websites };
}

function isAlreadyRegisteredLead(lead = {}, registered = {}) {
  const leadId = Number(lead.id || 0);
  if (leadId && registered.leadIds?.has(leadId)) return true;
  const email = normalizeEmail(lead.email);
  if (email && registered.emails?.has(email)) return true;
  const website = normalizeUrlHost(lead.website);
  if (website && registered.websites?.has(website)) return true;
  const name = normalizeKey(lead.name);
  const city = normalizeKey(lead.city);
  const country = normalizeKey(lead.country || "Romania");
  return Boolean(name && city && registered.namesByPlace?.has(`${name}|${city}|${country}`));
}

function loadLeads(companyId, { limit, sources, minScore, country, international = false, includeExcludedBrands = false, resendContacted = false, campaignKey = "" }) {
  const sourceList = Array.isArray(sources) && sources.length ? sources : [DEFAULT_SOURCE];
  const placeholders = sourceList.map(() => "?").join(", ");
  const countryFilter = safeText(country);
  const countrySql = countryFilter ? "AND lower(trim(COALESCE(country, 'Romania')))=lower(trim(?))" : "";
  const internationalSql = !countryFilter && international ? "AND lower(trim(COALESCE(country, 'Romania'))) <> 'romania'" : "";
  const statusSql = resendContacted
    ? "AND lower(trim(COALESCE(status, 'nou'))) IN ('nou', 'contactat')"
    : "AND lower(trim(COALESCE(status, 'nou')))='nou'";
  const scanLimit = Math.min(Math.max(limit * 300, 1000), 50000);
  const candidates = db.prepare(`
    SELECT id, company_id, name, city, county, country, property_type, email, score, status,
           COALESCE(email_retry_priority, 0) AS email_retry_priority,
           email_retry_reason,
           email_retry_ready_at
    FROM travel_leads
    WHERE company_id=?
      AND source IN (${placeholders})
      ${countrySql}
      ${internationalSql}
      ${statusSql}
      AND score >= ?
      AND email IS NOT NULL
      AND TRIM(email) <> ''
      AND (
        COALESCE(email_retry_priority, 0) <= 0
        OR email_retry_ready_at IS NULL
        OR email_retry_ready_at <= datetime('now')
      )
    ORDER BY COALESCE(email_retry_priority, 0) DESC, score DESC, id ASC
    LIMIT ?
  `).all(
    companyId,
    ...sourceList,
    ...(countryFilter ? [countryFilter] : []),
    minScore,
    scanLimit
  );

  const blocks = loadEmailBlocks(companyId, { campaignKey });
  const registered = loadRegisteredPropertyBlocks(companyId);
  const seenEmails = new Set();
  const selected = [];
  for (const lead of candidates) {
    const email = normalizeEmail(lead.email);
    if (
      !email
      || seenEmails.has(email)
      || blocks.recentlySentLeadIds.has(Number(lead.id))
      || blocks.recentlySentEmails.has(email)
      || blocks.campaignLeadIds.has(Number(lead.id))
      || blocks.campaignEmails.has(email)
      || (!resendContacted && blocks.sentLeadIds.has(Number(lead.id)))
      || (!resendContacted && blocks.sentEmails.has(email))
      || blocks.failedLeadIds.has(Number(lead.id))
      || blocks.failedEmails.has(email)
      || isAlreadyRegisteredLead(lead, registered)
      || (!includeExcludedBrands && isExcludedBrand(lead))
    ) continue;
    seenEmails.add(email);
    selected.push({ ...lead, email });
    if (selected.length >= limit) break;
  }
  return selected;
}

function markSent(companyId, lead, info, subject, cc, replyTo, textBody = "", campaignKey = "") {
  const previousStatus = safeText(lead.status || "nou") || "nou";
  const storedTextBody = campaignKey ? `${safeText(textBody)}\n\n[campaign:${campaignKey}]` : safeText(textBody);
  db.transaction(() => {
    db.prepare(`
      UPDATE travel_leads
      SET status='contactat',
          next_follow_up_at=datetime('now', '+3 days'),
          email_retry_priority=0,
          email_retry_reason=NULL,
          email_retry_ready_at=NULL,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(lead.id, companyId);

    db.prepare(`
      INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
      VALUES (?, ?, 'status_changed', 'Status schimbat', ?, datetime('now'))
    `).run(companyId, lead.id, `${previousStatus} -> contactat`);

    db.prepare(`
      INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
      VALUES (?, ?, 'outreach_email_sent', 'Email outreach trimis', ?, datetime('now'))
    `).run(
      companyId,
      lead.id,
      [
        `Subiect: ${subject}`,
        `către: ${maskEmail(lead.email)}`,
        cc ? `cc: ${maskEmail(cc)}` : "",
        replyTo ? `reply-to: ${maskEmail(replyTo)}` : "",
        `messageId: ${safeText(info?.messageId) || "-"}`,
        "follow-up automat peste 3 zile"
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
      lead.id,
      safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || "contact@trevoro.ro"),
      safeText(info?.messageId) || `outbound:${Date.now()}:${lead.id}`,
      safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || "contact@trevoro.ro"),
      safeText(lead.email),
      subject,
      storedTextBody || "Email outreach Trevoro trimis din platformă."
    );
  })();
}

function markFailed(companyId, lead, subject, error, cc, replyTo) {
  const message = safeText(error?.message || error || "email_send_failed");
  const retryReadyAt = isTransientSmtpError(message) ? "datetime('now', '+18 hours')" : "NULL";
  db.transaction(() => {
    db.prepare(`
      UPDATE travel_leads
      SET email_retry_priority=0,
          email_retry_reason=?,
          email_retry_ready_at=${retryReadyAt},
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(`Ultima trimitere a eșuat: ${message}`.slice(0, 500), lead.id, companyId);

    db.prepare(`
      INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
      VALUES (?, ?, 'outreach_email_failed', 'Email outreach eșuat', ?, datetime('now'))
    `).run(
      companyId,
      lead.id,
      [
        `Subiect: ${subject}`,
        `către: ${maskEmail(lead.email)}`,
        cc ? `cc: ${maskEmail(cc)}` : "",
        replyTo ? `reply-to: ${maskEmail(replyTo)}` : "",
        `eroare: ${message}`
      ].filter(Boolean).join("; ")
    );

    db.prepare(`
      INSERT OR IGNORE INTO travel_email_messages (
        company_id, lead_id, mailbox, direction, provider_message_id,
        from_email, to_email, subject, text_body, received_at
      )
      VALUES (?, ?, ?, 'outbound_failed', ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      lead.id,
      safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || "contact@trevoro.ro"),
      `failed:${Date.now()}:${lead.id}`,
      safeText(process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || "contact@trevoro.ro"),
      safeText(lead.email),
      subject,
      `Email outreach Trevoro eșuat: ${message}`
    );
  })();
}

async function main() {
  exitIfTrevoroEmailSendingPaused("lib/trevoro-outreach-sender.mjs");
  const limit = Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT);
  const rawMinScore = Number(argValue("--min-score", DEFAULT_MIN_SCORE));
  const minScore = Math.max(0, Math.min(100, Number.isFinite(rawMinScore) ? rawMinScore : DEFAULT_MIN_SCORE));
  const source = safeText(argValue("--source", DEFAULT_SOURCE));
  const sources = parseSources(source);
  const country = safeText(argValue("--country", ""));
  const international = hasFlag("--international");
  const internationalRun = international || (!!country && country.toLowerCase() !== "romania");
  const reportClaimUrl = internationalRun ? INTERNATIONAL_CLAIM_URL : CLAIM_URL;
  const delayMs = Math.max(0, Number(argValue("--delay-ms", 1200)) || 0);
  const dryRun = hasFlag("--dry-run");
  const allowPartial = hasFlag("--allow-partial");
  const stopOnThrottle = hasFlag("--stop-on-throttle");
  const includeExcludedBrands = hasFlag("--include-excluded-brands");
  const resendContacted = hasFlag("--resend-contacted") || hasFlag("--allow-resend");
  const campaignKey = safeText(argValue("--campaign-key", resendContacted ? DEFAULT_RELAUNCH_CAMPAIGN_KEY : ""));
  const cc = safeText(argValue("--cc", process.env.TREVORO_OUTREACH_CC || ""));
  const replyTo = safeText(argValue("--reply-to", process.env.TREVORO_REPLY_TO || process.env.MAIL_REPLY_TO || process.env.REPLY_TO || ""));
  const from = requireEmailConfig();
  const company = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  const companyId = Number(company?.id || 0);
  if (!companyId) throw new Error("Nu am găsit companie activă.");

  const leads = loadLeads(companyId, { limit, sources, minScore, country, international: internationalRun, includeExcludedBrands, resendContacted, campaignKey });
  if (leads.length < limit && !allowPartial) throw new Error(`Am găsit doar ${leads.length} lead-uri eligibile pentru email.`);

  const transporter = createTransporter();
  if (!dryRun) await transporter.verify();
  const report = [];
  let stoppedEarly = false;
  let pauseRequested = false;

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    if (isTrevoroEmailSendingPaused()) {
      stoppedEarly = true;
      pauseRequested = true;
      report.push({
        ok: true,
        skipped: true,
        reason: "trevoro_email_sending_paused",
        id: lead.id,
        name: lead.name,
        country: lead.country || "Romania",
        city: lead.city,
        email: maskEmail(lead.email)
      });
      break;
    }
    const message = buildMessage(lead);
    if (dryRun) {
      report.push({ ok: true, dryRun: true, id: lead.id, name: lead.name, country: lead.country || "Romania", city: lead.city, email: maskEmail(lead.email), cc: maskEmail(cc), replyTo: maskEmail(replyTo), subject: message.subject });
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: safeText(lead.email),
        cc: cc || undefined,
        replyTo: replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html
      });
      markSent(companyId, lead, info, message.subject, cc, replyTo, message.text, campaignKey);
      report.push({ ok: true, id: lead.id, name: lead.name, country: lead.country || "Romania", city: lead.city, email: maskEmail(lead.email), cc: maskEmail(cc), replyTo: maskEmail(replyTo), subject: message.subject, messageId: safeText(info?.messageId) });
    } catch (error) {
      const errorMessage = error?.message || String(error);
      const transient = isTransientSmtpError(errorMessage);
      const quota = isSmtpQuotaError(errorMessage);
      if (!(stopOnThrottle && quota)) {
        markFailed(companyId, lead, message.subject, error, cc, replyTo);
      }
      report.push({ ok: false, transient, quota, id: lead.id, name: lead.name, country: lead.country || "Romania", city: lead.city, email: maskEmail(lead.email), cc: maskEmail(cc), replyTo: maskEmail(replyTo), error: errorMessage });
      if (stopOnThrottle && (transient || quota)) {
        stoppedEarly = true;
        break;
      }
    }
    if (delayMs && index < leads.length - 1) await sleep(delayMs);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "outreach", `trevoro-outreach-email-report-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ sentAt: new Date().toISOString(), limit, source, sources, country: country || "all", international: internationalRun, minScore, dryRun, allowPartial, stopOnThrottle, includeExcludedBrands, resendContacted, campaignKey, stoppedEarly, pauseRequested, claimUrl: reportClaimUrl, cc: maskEmail(cc), replyTo: maskEmail(replyTo), report }, null, 2));

  console.log(JSON.stringify({
    reportPath,
    sent: report.filter((row) => row.ok && !row.dryRun && !row.skipped).length,
    failed: report.filter((row) => !row.ok).length,
    attempted: report.length,
    stoppedEarly,
    pauseRequested,
    source,
    sources,
    country: country || "all",
    international: internationalRun,
    minScore,
    dryRun,
    resendContacted,
    campaignKey,
    includeExcludedBrands,
    claimUrl: reportClaimUrl,
    cc: maskEmail(cc),
    replyTo: maskEmail(replyTo),
    rows: report.map((row) => ({ ok: row.ok, skipped: row.skipped || undefined, reason: row.reason || undefined, id: row.id, name: row.name, country: row.country, city: row.city, email: row.email, cc: row.cc, replyTo: row.replyTo, quota: row.quota || undefined, error: row.error || undefined }))
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
