#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  ensureEmarqetOutboundSchema,
  isGenericBusinessEmail,
  normalizeEmail,
  normalizeKey,
  safeText,
  segmentByKey
} from "../lib/emarqet-outbound.js";

dotenv.config();

const SEARCH_TIMEOUT_MS = 20000;
const PAGE_TIMEOUT_MS = 15000;
const USER_AGENT = "Mozilla/5.0 NexoraContactEnrichment/1.0 (+https://e-marqet.com)";
const EXCLUDED_HOST_PARTS = [
  "listafirme",
  "termene.ro",
  "risco.ro",
  "confidas.ro",
  "firme.info",
  "romanian-companies.eu",
  "mfinante.gov.ro",
  "anaf.ro",
  "data.gov.ro",
  "e-licitatie.ro",
  "olx.ro",
  "autovit.ro",
  "lajumate.ro",
  "wikipedia.org"
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

function stripCompanyNoise(value = "") {
  return normalizeKey(value)
    .replace(/\b(srl|sa|pfa|ii|if|sc|societate|comerciala|comercial)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyTokens(value = "") {
  return stripCompanyNoise(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 5);
}

function hostOf(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function cleanUrl(raw = "") {
  const value = safeText(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.hostname.includes("duckduckgo.com") && url.searchParams.get("uddg")) {
      return decodeURIComponent(url.searchParams.get("uddg"));
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isExcludedHost(url = "") {
  const host = hostOf(url);
  if (!host) return true;
  return EXCLUDED_HOST_PARTS.some((part) => host.includes(part));
}

function looksOfficialForLead(url = "", lead = {}, label = "") {
  const host = hostOf(url);
  if (!host || isExcludedHost(url)) return false;
  const normalizedHost = normalizeKey(host.replace(/\.(ro|com|eu|net|org|auto|shop)$/i, ""));
  const normalizedLabel = normalizeKey(label);
  const tokens = companyTokens(lead.company_name);
  if (!tokens.length) return false;
  return tokens.some((token) => normalizedHost.includes(token) || normalizedLabel.includes(token));
}

async function fetchText(url, timeoutMs = PAGE_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7",
      "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6",
      "user-agent": USER_AGENT
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return text;
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;|&apos;/gi, "'");
}

function textFromHtml(html = "") {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractLinks(html = "", baseUrl = "") {
  const links = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl).toString();
      links.push({ url, label: textFromHtml(match[2]) });
    } catch {
      // ignoram linkurile invalide
    }
  }
  return links;
}

function extractEmails(text = "") {
  const emails = new Set();
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let match;
  while ((match = regex.exec(text))) {
    const email = normalizeEmail(match[0]).replace(/[.,;:)]+$/, "");
    if (!email.match(/\.(png|jpe?g|gif|webp|svg|pdf)$/i)) emails.add(email);
  }
  return Array.from(emails);
}

function extractPhones(text = "") {
  const match = text.match(/(?:\+4|004)?0?\s*(?:2|3|7)\d(?:[\s().-]*\d){7,9}/);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function extractFacebookUrl(html = "", baseUrl = "") {
  const link = extractLinks(html, baseUrl).find((item) => hostOf(item.url).includes("facebook.com") && !item.url.includes("/sharer"));
  return link?.url || "";
}

async function searchWeb(query = "") {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, SEARCH_TIMEOUT_MS);
  const results = [];
  const regex = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const url = cleanUrl(decodeHtml(match[1]));
    const label = textFromHtml(match[2]);
    if (url) results.push({ url, label });
  }
  if (!results.length) {
    for (const link of extractLinks(html, "https://duckduckgo.com")) {
      const url = cleanUrl(link.url);
      if (url && !hostOf(url).includes("duckduckgo.com")) results.push({ url, label: link.label });
    }
  }
  return results.slice(0, 12);
}

function candidateQueries(lead = {}) {
  const name = safeText(lead.company_name);
  const place = [lead.city, lead.county].filter(Boolean).join(" ");
  const cui = lead.cui ? `CUI ${lead.cui}` : "";
  return [
    `"${name}" ${place} site oficial ${cui}`.trim(),
    `"${name}" ${place} contact email`.trim(),
    `"${name}" ${place} Facebook`.trim(),
    `"${name}" ${place} Google Maps`.trim()
  ].filter(Boolean);
}

function normalizeWebsite(url = "") {
  if (!url) return "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    parsed.hash = "";
    return parsed.origin;
  } catch {
    return "";
  }
}

async function discoverCandidates(lead = {}) {
  const official = new Map();
  const socials = { facebook: "", googleBusinessUrl: "" };
  const existingWebsite = normalizeWebsite(lead.website || "");
  if (existingWebsite) official.set(existingWebsite, { url: existingWebsite, label: "website existent in lead" });

  for (const query of candidateQueries(lead)) {
    try {
      const results = await searchWeb(query);
      for (const result of results) {
        const url = cleanUrl(result.url);
        const host = hostOf(url);
        if (!url || !host) continue;
        if (!socials.facebook && host.includes("facebook.com")) socials.facebook = url;
        if (!socials.googleBusinessUrl && (host.includes("google.") || host.includes("goo.gl")) && /maps|place|business/i.test(url)) socials.googleBusinessUrl = url;
        if (looksOfficialForLead(url, lead, result.label)) official.set(normalizeWebsite(url) || url, result);
      }
    } catch {
      // cautarea publica poate esua punctual; trecem la urmatorul query
    }
  }
  return { websites: Array.from(official.values()).slice(0, 4), ...socials };
}

function contactPageLinks(html = "", baseUrl = "") {
  const preferred = extractLinks(html, baseUrl)
    .filter((link) => {
      const key = normalizeKey(`${link.url} ${link.label}`);
      return ["contact", "contacte", "despre", "about", "service", "programari"].some((token) => key.includes(token));
    })
    .map((link) => link.url);
  return Array.from(new Set([baseUrl, ...preferred])).slice(0, 6);
}

async function crawlWebsiteForContact(website = "", lead = {}) {
  const start = normalizeWebsite(website) || website;
  if (!start) return null;
  const pages = [];
  const emails = new Set();
  let phone = "";
  let facebook = "";
  let bestEvidenceUrl = "";
  try {
    const homeHtml = await fetchText(start);
    pages.push(...contactPageLinks(homeHtml, start));
  } catch {
    pages.push(start);
  }
  for (const url of Array.from(new Set(pages)).slice(0, 6)) {
    try {
      const html = await fetchText(url);
      const text = `${textFromHtml(html)} ${html}`;
      for (const email of extractEmails(text)) emails.add(email);
      if (!phone) phone = extractPhones(text);
      if (!facebook) facebook = extractFacebookUrl(html, url);
      if (!bestEvidenceUrl && emails.size) bestEvidenceUrl = url;
    } catch {
      // pagina de contact poate fi blocata
    }
  }
  const cleanEmails = Array.from(emails).filter(isGenericBusinessEmail);
  const email = cleanEmails[0] || "";
  return {
    website: start,
    email,
    phone,
    facebook,
    evidenceUrl: bestEvidenceUrl || start,
    emailsFound: Array.from(emails),
    cleanEmails,
    officialMatch: looksOfficialForLead(start, lead, "")
  };
}

function loadCandidates(companyId, filters = {}) {
  const selectedSegment = segmentByKey(filters.segment);
  const segment = selectedSegment?.key || safeText(filters.segment);
  const where = [
    "company_id=?",
    "opt_out_at IS NULL",
    "(email IS NULL OR TRIM(email)='' OR outreach_status='NOT_READY')"
  ];
  const params = [companyId];
  if (segment) {
    where.push("segment_key=?");
    params.push(segment);
  }
  params.push(Math.max(Number(filters.limit || 50) * 5, 100));
  const rows = db.prepare(`
    SELECT *
    FROM emarqet_outbound_leads
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE WHEN website IS NOT NULL AND TRIM(website)<>'' THEN 1 ELSE 2 END,
      updated_at ASC,
      id ASC
    LIMIT ?
  `).all(...params);
  const selected = [];
  for (const row of rows) {
    if (!matchesFilter(row.county, filters.county)) continue;
    if (!matchesFilter(row.city, filters.city)) continue;
    selected.push(row);
    if (selected.length >= Number(filters.limit || 50)) break;
  }
  return selected;
}

function saveEnrichment(companyId, lead, enrichment, options = {}) {
  const hasCleanEmail = Boolean(enrichment.email && isGenericBusinessEmail(enrichment.email));
  const contactStatus = hasCleanEmail || enrichment.website || enrichment.phone || enrichment.facebook || enrichment.googleBusinessUrl
    ? "CONTACT_FOUND"
    : "CONTACT_NEEDED";
  const outreachStatus = hasCleanEmail ? "READY" : "NOT_READY";
  const note = [
    `Enrichment ${new Date().toISOString()}: ${hasCleanEmail ? "email business verificat" : "fara email business curat"}.`,
    enrichment.evidenceUrl ? `Sursa: ${enrichment.evidenceUrl}` : "",
    enrichment.emailsFound?.length ? `Emailuri gasite: ${enrichment.emailsFound.join(", ")}` : ""
  ].filter(Boolean).join(" ");
  const shouldUpdate = hasCleanEmail || enrichment.website || enrichment.phone || enrichment.facebook || enrichment.googleBusinessUrl || options.markChecked;
  if (!shouldUpdate) return { saved: false, outreachStatus, contactStatus };
  db.prepare(`
    UPDATE emarqet_outbound_leads
    SET website=COALESCE(NULLIF(?, ''), website),
        email=COALESCE(NULLIF(?, ''), email),
        phone=COALESCE(NULLIF(?, ''), phone),
        facebook=COALESCE(NULLIF(?, ''), facebook),
        google_business_url=COALESCE(NULLIF(?, ''), google_business_url),
        contact_status=?,
        outreach_status=?,
        notes=trim(COALESCE(notes, '') || char(10) || ?),
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(
    enrichment.website || "",
    hasCleanEmail ? normalizeEmail(enrichment.email) : "",
    enrichment.phone || "",
    enrichment.facebook || "",
    enrichment.googleBusinessUrl || "",
    contactStatus,
    outreachStatus,
    note,
    companyId,
    lead.id
  );
  return { saved: true, outreachStatus, contactStatus };
}

async function enrichLead(lead = {}) {
  const discovered = await discoverCandidates(lead);
  const checked = [];
  let best = {
    website: "",
    email: "",
    phone: "",
    facebook: discovered.facebook || "",
    googleBusinessUrl: discovered.googleBusinessUrl || "",
    evidenceUrl: "",
    emailsFound: [],
    cleanEmails: []
  };
  for (const candidate of discovered.websites) {
    const enrichment = await crawlWebsiteForContact(candidate.url, lead);
    if (!enrichment) continue;
    checked.push({ website: enrichment.website, email: enrichment.email, evidenceUrl: enrichment.evidenceUrl, emailsFound: enrichment.emailsFound });
    best = {
      ...best,
      ...enrichment,
      facebook: enrichment.facebook || best.facebook,
      googleBusinessUrl: best.googleBusinessUrl
    };
    if (enrichment.email && isGenericBusinessEmail(enrichment.email)) break;
  }
  return { ...best, checked };
}

async function main() {
  const limit = Math.max(1, Number(argValue("--limit", "50")) || 50);
  const segment = safeText(argValue("--segment"));
  const county = safeText(argValue("--county"));
  const city = safeText(argValue("--city"));
  const save = hasFlag("--save");
  const markChecked = hasFlag("--mark-checked");
  const companyId = Number(argValue("--company-id", "")) || companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureEmarqetOutboundSchema(db);

  const rows = loadCandidates(companyId, { limit, segment, county, city });
  const report = [];
  let ready = 0;
  let foundContact = 0;
  let saved = 0;

  for (const lead of rows) {
    const enrichment = await enrichLead(lead);
    const hasCleanEmail = Boolean(enrichment.email && isGenericBusinessEmail(enrichment.email));
    if (hasCleanEmail) ready += 1;
    if (enrichment.website || enrichment.phone || enrichment.facebook || enrichment.googleBusinessUrl) foundContact += 1;
    let savedResult = { saved: false, outreachStatus: hasCleanEmail ? "READY" : "NOT_READY", contactStatus: hasCleanEmail ? "CONTACT_FOUND" : "CONTACT_NEEDED" };
    if (save) {
      savedResult = saveEnrichment(companyId, lead, enrichment, { markChecked });
      if (savedResult.saved) saved += 1;
    }
    report.push({
      id: lead.id,
      company: lead.company_name,
      county: lead.county,
      city: lead.city,
      segment: lead.segment_key,
      website: enrichment.website,
      email: hasCleanEmail ? normalizeEmail(enrichment.email) : "",
      phone: enrichment.phone,
      facebook: enrichment.facebook,
      googleBusinessUrl: enrichment.googleBusinessUrl,
      evidenceUrl: enrichment.evidenceUrl,
      emailsFound: enrichment.emailsFound,
      checked: enrichment.checked,
      ready: hasCleanEmail,
      saved: savedResult.saved,
      dryRun: !save
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "enrichment", `emarqet-contact-enrichment-report-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    enrichedAt: new Date().toISOString(),
    companyId,
    filters: { limit, segment, county, city },
    dryRun: !save,
    markChecked,
    scanned: rows.length,
    foundContact,
    ready,
    saved,
    results: report
  }, null, 2));

  console.log(JSON.stringify({
    reportPath,
    dryRun: !save,
    scanned: rows.length,
    foundContact,
    ready,
    saved,
    sample: report.slice(0, 10)
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
