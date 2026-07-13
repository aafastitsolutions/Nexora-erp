#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";
import { db, migrate } from "../db.js";
import { fetchAnafCompany } from "../lib/anaf.js";

dotenv.config();

const DEFAULT_SOURCE_FILE = path.join(process.cwd(), "data", "travel-sources", "Lista-structurilor-de-primire-turistice-cu-functiuni-de-cazare-clasificate-actualizata-la-27.09.2024.xlsx");
const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const CONTACT_PATHS = [
  "",
  "/contact",
  "/contact-us",
  "/contacte",
  "/contacts",
  "/about",
  "/about-us",
  "/despre-noi",
  "/rezervari",
  "/reservation",
  "/booking"
];
const EMAIL_BLACKLIST_PARTS = [
  "example.",
  "domain.",
  "email.com",
  "yourname",
  "noreply",
  "no-reply",
  "donotreply",
  "wixpress.com",
  "sentry.io"
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
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

function stripDiacritics(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șȘ]/g, "s")
    .replace(/[țȚ]/g, "t");
}

function normalizeKey(value = "") {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const text = safeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

function normalizeWebsite(value = "") {
  const text = safeText(value);
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function rootUrl(value = "") {
  try {
    const url = new URL(normalizeWebsite(value));
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "";
  }
}

function emailDomain(value = "") {
  const email = normalizeEmail(value);
  return email ? email.split("@").at(-1) : "";
}

function hostDomain(value = "") {
  try {
    return new URL(normalizeWebsite(value)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyPublicEmail(value = "") {
  const email = normalizeEmail(value);
  if (!email) return false;
  const lower = email.toLowerCase();
  if (EMAIL_BLACKLIST_PARTS.some((part) => lower.includes(part))) return false;
  return true;
}

function decodeHtmlEntities(value = "") {
  return safeText(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&amp;/gi, "&");
}

function deobfuscateEmails(value = "") {
  return decodeHtmlEntities(value)
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s+dot\s+/gi, ".");
}

function extractEmailsFromText(value = "") {
  const text = deobfuscateEmails(value);
  const matches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return [...new Set(matches.map(normalizeEmail).filter(isLikelyPublicEmail))];
}

function candidateConfidence(email, website) {
  const domain = emailDomain(email);
  const host = hostDomain(website);
  if (!domain || !host) return 55;
  if (domain === host || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)) return 95;
  if (/gmail\.com|yahoo\.|outlook\.|hotmail\.|icloud\.com/i.test(domain)) return 70;
  return 60;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "TrevoroBot/1.0 (+https://www.trevoro.ro)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      },
      redirect: "follow"
    });
    if (!response.ok) return { ok: false, status: response.status, text: "" };
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/text|html|xml/i.test(contentType)) return { ok: false, status: response.status, text: "" };
    return { ok: true, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name === "AbortError" ? "timeout" : (error?.message || String(error)), text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

function contactUrlsForWebsite(website = "") {
  const base = rootUrl(website);
  if (!base) return [];
  return CONTACT_PATHS.map((item) => `${base}${item}`);
}

async function findWebsiteEmailCandidates(lead) {
  if (!safeText(lead.website)) return [];
  const candidates = new Map();
  for (const url of contactUrlsForWebsite(lead.website)) {
    const fetched = await fetchText(url);
    if (!fetched.ok || !fetched.text) continue;
    for (const email of extractEmailsFromText(fetched.text)) {
      const current = candidates.get(email) || { email, source_url: url, confidence: 0, occurrences: 0 };
      current.confidence = Math.max(current.confidence, candidateConfidence(email, lead.website));
      current.occurrences += 1;
      candidates.set(email, current);
    }
    if (candidates.size >= 5) break;
  }
  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);
}

function normalizePhone(value = "") {
  let digits = safeText(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("40") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function normalizeNameCity(name = "", city = "") {
  const normalizedName = normalizeKey(name);
  const normalizedCity = normalizeKey(city);
  return normalizedName && normalizedCity ? `${normalizedName}|${normalizedCity}` : "";
}

function headerKey(value = "") {
  return normalizeKey(value)
    .replace(/\bnumar\b/g, "numar")
    .replace(/\bjudet\b/g, "judet");
}

function titleCaseRo(value = "") {
  return safeText(value)
    .toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s.-])(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("ro-RO")}`);
}

function localityName(value = "") {
  let text = safeText(value)
    .replace(/\bcomuna\b/gi, "Com.")
    .replace(/\bmunicipiul\b/gi, "Mun.")
    .replace(/\borașul\b/gi, "Oras")
    .replace(/\borasul\b/gi, "Oras")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  const sat = text.match(/\bSat\.?\s+(.+)$/i);
  if (sat?.[1]) return safeText(sat[1].replace(/^sat\.?\s+/i, ""));
  const mun = text.match(/\bMun\.?\s+(.+)$/i);
  if (mun?.[1]) return safeText(mun[1]);
  const oras = text.match(/\bOra[șs]\.?\s+(.+)$/i);
  if (oras?.[1]) return safeText(oras[1]);
  if (text.includes(",")) return safeText(text.split(",").at(-1));
  return text.replace(/^Com\.?\s+/i, "").trim();
}

function value(row, map, aliases = []) {
  for (const alias of aliases) {
    const index = map.get(alias);
    if (Number.isInteger(index)) return safeText(row[index]);
  }
  return "";
}

function noteValue(notes = "", key = "") {
  const pattern = new RegExp(`${key}=([^;]+)`, "i");
  return safeText(notes.match(pattern)?.[1]);
}

function maskEmail(value = "") {
  const email = safeText(value);
  const at = email.indexOf("@");
  if (at <= 1) return email ? "***" : "";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function maskPhone(value = "") {
  const phone = normalizePhone(value);
  if (phone.length < 5) return phone ? "***" : "";
  return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
}

function isTransientSmtpError(value = "") {
  const normalized = safeText(value).toLowerCase();
  return TRANSIENT_SMTP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

async function loadWorkbookRows(file) {
  const workbook = await readXlsxFile(file);
  const sheets = Array.isArray(workbook) && workbook[0]?.data ? workbook : [{ sheet: "Sheet1", data: workbook }];
  const sheet = sheets.find((item) => Array.isArray(item.data) && item.data.some((row) => row.some((cell) => headerKey(cell) === "tip unitate"))) || sheets[0];
  return sheet?.data || [];
}

function findHeader(rows = []) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const keys = row.map(headerKey);
    if (keys.includes("tip unitate") && keys.includes("nume unitate")) {
      const map = new Map();
      keys.forEach((key, columnIndex) => {
        if (key) map.set(key, columnIndex);
      });
      return { index, map };
    }
  }
  throw new Error("Nu am găsit header-ul registrului oficial.");
}

function addIndexEntry(map, key, row) {
  if (!key) return;
  const rows = map.get(key) || [];
  rows.push(row);
  map.set(key, rows);
}

async function loadOfficialRegistryIndex(file) {
  const index = {
    byAuth: new Map(),
    byCui: new Map(),
    byNameCity: new Map(),
    file,
    rows: 0,
    withEmail: 0,
    loaded: false,
    error: ""
  };

  if (!fs.existsSync(file)) {
    index.error = "official_registry_file_missing";
    return index;
  }

  const rows = await loadWorkbookRows(file);
  const header = findHeader(rows);
  for (let rowIndex = header.index + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (!row.some((cell) => safeText(cell))) continue;

    const name = titleCaseRo(value(row, header.map, ["nume unitate"]));
    const city = titleCaseRo(localityName(value(row, header.map, ["localitate componenta"]) || value(row, header.map, ["localitate"])));
    const email = normalizeEmail(value(row, header.map, ["email"]));
    const website = safeText(value(row, header.map, ["web"]));
    const operator = value(row, header.map, ["operator economic"]);
    const cui = value(row, header.map, ["cod unic inregistrare"]);
    const auth = value(row, header.map, ["numar autorizatie"]);
    if (!name || !city) continue;

    const registryRow = {
      row_index: rowIndex + 1,
      name,
      city,
      county: titleCaseRo(value(row, header.map, ["judet"])),
      email,
      website,
      operator,
      cui,
      auth
    };
    index.rows += 1;
    if (email) index.withEmail += 1;
    addIndexEntry(index.byNameCity, normalizeNameCity(name, city), registryRow);
    addIndexEntry(index.byAuth, auth ? normalizeKey(auth) : "", registryRow);
    addIndexEntry(index.byCui, cui ? normalizeKey(cui) : "", registryRow);
  }

  index.loaded = true;
  return index;
}

function selectCompany() {
  return db.prepare(`
    SELECT id, name
    FROM companies
    WHERE status='active'
    ORDER BY id ASC
    LIMIT 1
  `).get();
}

function loadFailedLeads(companyId, sinceDays, limit) {
  const rows = db.prepare(`
    SELECT
      l.id, l.company_id, l.name, l.city, l.county, l.property_type,
      l.phone, l.email, l.website, l.status, l.notes,
      m.id AS message_id, m.direction, m.subject AS failed_subject,
      m.text_body AS failed_body, COALESCE(m.received_at, m.created_at) AS failed_at
    FROM travel_email_messages m
    JOIN travel_leads l ON l.company_id=m.company_id AND l.id=m.lead_id
    WHERE m.company_id=?
      AND m.direction IN ('outbound_failed', 'bounce')
      AND COALESCE(m.received_at, m.created_at) >= datetime('now', ?)
      AND l.status IN ('nou', 'contactat', 'interesat')
    ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC
    LIMIT ?
  `).all(companyId, `-${Math.max(1, Number(sinceDays) || 30)} days`, Math.max(1, Number(limit) || 100) * 4);

  const byLead = new Map();
  for (const row of rows) {
    if (!byLead.has(row.id)) byLead.set(row.id, row);
  }
  return [...byLead.values()].slice(0, Math.max(1, Number(limit) || 100));
}

function hasEmailHistory(companyId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  return Boolean(db.prepare(`
    SELECT 1
    FROM travel_email_messages
    WHERE company_id=?
      AND lower(trim(to_email))=?
      AND direction IN ('outbound', 'outbound_failed', 'bounce')
    LIMIT 1
  `).get(companyId, normalized));
}

function hasActivity(companyId, leadId, type) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM travel_lead_activities
    WHERE company_id=? AND lead_id=? AND activity_type=?
    LIMIT 1
  `).get(companyId, leadId, type));
}

function insertActivity({ companyId, leadId, type, subject, details, dryRun }) {
  if (dryRun || hasActivity(companyId, leadId, type)) return;
  db.prepare(`
    INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(companyId, leadId, type, subject, details);
}

function appendNotes(notes = "", lines = []) {
  return [safeText(notes), ...lines.map(safeText).filter(Boolean)].filter(Boolean).join("; ");
}

function bestRegistryMatch(index, lead) {
  const auth = noteValue(lead.notes, "official_auth");
  const cui = noteValue(lead.notes, "official_cui");
  const nameCity = normalizeNameCity(lead.name, lead.city);
  const pools = [
    { strategy: "official_auth", rows: auth ? index.byAuth.get(normalizeKey(auth)) : [] },
    { strategy: "official_cui", rows: cui ? index.byCui.get(normalizeKey(cui)) : [] },
    { strategy: "name_city", rows: nameCity ? index.byNameCity.get(nameCity) : [] }
  ];

  for (const pool of pools) {
    const row = (pool.rows || []).find((item) => item.email) || (pool.rows || [])[0];
    if (row) return { strategy: pool.strategy, row };
  }
  return { strategy: "", row: null };
}

async function maybeCheckAnaf(cui, enabled) {
  const cleanCui = normalizeKey(cui);
  if (!enabled || !cleanCui) return null;
  try {
    const company = await fetchAnafCompany(cleanCui);
    return {
      ok: true,
      cui: company.cui,
      name: company.name,
      inactive: Boolean(company.inactive),
      vat: Boolean(company.vat)
    };
  } catch (error) {
    return { ok: false, cui: cleanCui, error: error?.message || String(error) };
  }
}

function repairEmail({ companyId, lead, email, registryRow, strategy, anaf, dryRun }) {
  const oldEmail = normalizeEmail(lead.email);
  const notes = appendNotes(lead.notes, [
    `email_repaired_from=${strategy === "website_contact" ? "official_website" : "official_tourism_registry"}`,
    `email_repair_strategy=${strategy}`,
    oldEmail ? `old_email=${oldEmail}` : "",
    registryRow?.cui ? `email_repair_cui=${registryRow.cui}` : "",
    registryRow?.source_url ? `email_repair_source=${registryRow.source_url}` : "",
    `email_repaired_at=${new Date().toISOString()}`
  ]);
  if (!dryRun) {
    db.transaction(() => {
      db.prepare(`
        UPDATE travel_leads
        SET email=?, status='nou', notes=?, updated_at=datetime('now')
        WHERE company_id=? AND id=?
      `).run(email, notes, companyId, lead.id);

      db.prepare(`
        INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
        VALUES (?, ?, 'outreach_email_repaired', 'Email corectat pentru outreach', ?, datetime('now'))
      `).run(
        companyId,
        lead.id,
        [
          `strategie: ${strategy}`,
          oldEmail ? `email vechi: ${maskEmail(oldEmail)}` : "",
          `email nou: ${maskEmail(email)}`,
          registryRow?.cui ? `CUI: ${registryRow.cui}` : "",
          registryRow?.source_url ? `sursa: ${registryRow.source_url}` : "",
          anaf ? `ANAF: ${anaf.ok ? "verificat" : `eroare ${anaf.error}`}` : ""
        ].filter(Boolean).join("; ")
      );
    })();
  }
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "email-repair");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `trevoro-email-repair-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  migrate();
  const dryRun = hasFlag("--dry-run");
  const checkAnaf = hasFlag("--check-anaf");
  const checkWebsites = !hasFlag("--no-websites");
  const limit = Math.max(1, Number(argValue("--limit", 100)) || 100);
  const sinceDays = Math.max(1, Number(argValue("--since-days", 30)) || 30);
  const sourceFile = safeText(argValue("--source-file", DEFAULT_SOURCE_FILE)) || DEFAULT_SOURCE_FILE;

  const company = selectCompany();
  if (!company?.id) throw new Error("Nu am găsit companie activă.");

  const registry = await loadOfficialRegistryIndex(sourceFile);
  const leads = loadFailedLeads(company.id, sinceDays, limit);
  const stats = {
    checked_at: new Date().toISOString(),
    dry_run: dryRun,
    check_anaf: checkAnaf,
    check_websites: checkWebsites,
    company_id: company.id,
    company_name: company.name,
    since_days: sinceDays,
    limit,
    registry: {
      file: registry.file,
      loaded: registry.loaded,
      rows: registry.rows,
      with_email: registry.withEmail,
      error: registry.error
    },
    failed_leads_found: leads.length,
    repaired: 0,
    retry_waiting: 0,
    whatsapp_candidates: 0,
    manual_review: 0,
    skipped_same_email: 0,
    skipped_email_already_used: 0,
    website_candidates_found: 0,
    rows: []
  };

  for (const lead of leads) {
    const failureText = `${lead.failed_subject || ""}\n${lead.failed_body || ""}`;
    const rowReport = {
      id: lead.id,
      name: lead.name,
      city: lead.city,
      current_email: maskEmail(lead.email),
      direction: lead.direction,
      failed_at: lead.failed_at,
      action: ""
    };

    if (lead.direction === "outbound_failed" && isTransientSmtpError(failureText)) {
      stats.retry_waiting += 1;
      rowReport.action = "retry_after_cooldown";
      insertActivity({
        companyId: company.id,
        leadId: lead.id,
        type: "outreach_retry_waiting",
        subject: "Retry email după cooldown SMTP",
        details: "Eroare temporară SMTP; jobul zilnic va reîncerca după cooldown.",
        dryRun
      });
      stats.rows.push(rowReport);
      continue;
    }

    const match = bestRegistryMatch(registry, lead);
    rowReport.match_strategy = match.strategy || "";
    if (match.row) {
      rowReport.registry_email = maskEmail(match.row.email);
      rowReport.registry_cui = match.row.cui || "";
      rowReport.registry_operator = match.row.operator || "";
    }

    const newEmail = normalizeEmail(match.row?.email || "");
    const oldEmail = normalizeEmail(lead.email);
    if (newEmail && newEmail !== oldEmail) {
      const emailAlreadyUsed = hasEmailHistory(company.id, newEmail);
      if (!emailAlreadyUsed) {
        const anaf = await maybeCheckAnaf(match.row?.cui || noteValue(lead.notes, "official_cui"), checkAnaf);
        repairEmail({ companyId: company.id, lead, email: newEmail, registryRow: match.row, strategy: match.strategy, anaf, dryRun });
        stats.repaired += 1;
        rowReport.action = "email_repaired";
        rowReport.new_email = maskEmail(newEmail);
        if (anaf) rowReport.anaf = anaf;
        stats.rows.push(rowReport);
        continue;
      }
      stats.skipped_email_already_used += 1;
      rowReport.email_already_used = true;
    } else if (newEmail && newEmail === oldEmail) {
      stats.skipped_same_email += 1;
      rowReport.same_email_in_registry = true;
    }

    if (checkWebsites && safeText(lead.website)) {
      const websiteCandidates = await findWebsiteEmailCandidates(lead);
      if (websiteCandidates.length) {
        stats.website_candidates_found += websiteCandidates.length;
        rowReport.website_candidates = websiteCandidates.map((item) => ({
          email: maskEmail(item.email),
          confidence: item.confidence,
          source_url: item.source_url
        }));
        const best = websiteCandidates.find((item) => {
          const candidateEmail = normalizeEmail(item.email);
          return candidateEmail && candidateEmail !== oldEmail && !hasEmailHistory(company.id, candidateEmail);
        });
        if (best && Number(best.confidence || 0) >= 70) {
          repairEmail({
            companyId: company.id,
            lead,
            email: normalizeEmail(best.email),
            registryRow: { source_url: best.source_url },
            strategy: "website_contact",
            anaf: null,
            dryRun
          });
          stats.repaired += 1;
          rowReport.action = "email_repaired_from_website";
          rowReport.new_email = maskEmail(best.email);
          rowReport.website_source_url = best.source_url;
          stats.rows.push(rowReport);
          continue;
        }
      }
    }

    if (normalizePhone(lead.phone)) {
      stats.whatsapp_candidates += 1;
      rowReport.action = "whatsapp_candidate";
      rowReport.phone = maskPhone(lead.phone);
      insertActivity({
        companyId: company.id,
        leadId: lead.id,
        type: "outreach_whatsapp_candidate",
        subject: "Fallback WhatsApp Business",
        details: `Nu am găsit email alternativ sigur. Telefon disponibil: ${maskPhone(lead.phone)}.`,
        dryRun
      });
    } else {
      stats.manual_review += 1;
      rowReport.action = "manual_review";
      insertActivity({
        companyId: company.id,
        leadId: lead.id,
        type: "outreach_manual_review",
        subject: "Review manual contact",
        details: "Emailul a eșuat și nu există telefon disponibil pentru fallback.",
        dryRun
      });
    }
    stats.rows.push(rowReport);
  }

  stats.report_path = writeReport(stats);
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
