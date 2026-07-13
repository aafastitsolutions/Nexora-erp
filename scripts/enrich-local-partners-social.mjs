#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; TrevoroLocalPartnerEnrichment/1.0; +https://www.trevoro.ro)";
const CONTACT_PATHS = ["contact", "contacte", "contact-us", "about", "despre", "despre-noi"];
const FACEBOOK_SKIP_PATHS = /\/(?:sharer|share|plugins|tr|login|privacy|policies|help|terms|dialog)\b/i;

function parseArgs(argv = []) {
  const args = {
    companyId: 0,
    id: 0,
    limit: 30,
    dryRun: false,
    force: false,
    includeComplete: false,
    search: true,
    timeoutMs: 15_000,
    delayMs: 1200,
    maxPagesPerPartner: 8,
    saveFacebook: false,
    saveWebsite: false
  };
  for (const item of argv) {
    if (item === "--dry-run") args.dryRun = true;
    if (item === "--force") args.force = true;
    if (item === "--include-complete") args.includeComplete = true;
    if (item === "--no-search") args.search = false;
    if (item === "--save-facebook") args.saveFacebook = true;
    if (item === "--save-website") args.saveWebsite = true;
    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "id") args.id = Number(rawValue) || 0;
    if (key === "limit") args.limit = Math.max(1, Number(rawValue) || args.limit);
    if (key === "timeout-ms") args.timeoutMs = Math.max(3000, Number(rawValue) || args.timeoutMs);
    if (key === "delay-ms") args.delayMs = Math.max(0, Number(rawValue) || args.delayMs);
    if (key === "max-pages") args.maxPagesPerPartner = Math.max(2, Number(rawValue) || args.maxPagesPerPartner);
  }
  return args;
}

function safeText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripDiacritics(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șȘ]/g, "s")
    .replace(/[țȚ]/g, "t");
}

function normalizeKey(value = "") {
  return stripDiacritics(safeText(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeEmail(value = "") {
  const text = safeText(decodeHtml(value)).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (!match) return "";
  const email = match[0].replace(/[.,;:!?]+$/g, "").toLowerCase();
  const bad = [
    "example.",
    "facebook.com",
    "fb.com",
    "schema.org",
    "sentry.io",
    "wixpress.com",
    "wordpress.com"
  ];
  if (bad.some((item) => email.includes(item))) return "";
  if (/^(?:no-?reply|noreply|donotreply|privacy|abuse|postmaster)@/i.test(email)) return "";
  return email;
}

function normalizeWebsite(value = "") {
  const text = safeText(decodeHtml(value));
  if (!text || text.toLowerCase() === "www.") return "";
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return `${url.protocol}//${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

function normalizeFacebookUrl(value = "") {
  const text = safeText(decodeHtml(value))
    .replace(/\s+\|\s+.*$/g, "")
    .replace(/[<>"'].*$/g, "");
  if (!text || !/(?:facebook|fb)\.com/i.test(text)) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (/l\.facebook\.com$/i.test(url.hostname) && url.searchParams.get("u")) {
      return normalizeFacebookUrl(url.searchParams.get("u") || "");
    }
    const host = url.hostname.replace(/^m\.|^mbasic\.|^mobile\.|^www\./i, "").toLowerCase();
    if (!["facebook.com", "fb.com"].includes(host)) return "";
    if (FACEBOOK_SKIP_PATHS.test(url.pathname)) return "";
    let pathName = decodeURIComponent(url.pathname || "/").replace(/\/+$/g, "");
    pathName = pathName.replace(/\/(?:about|about_contact_and_basic_info)$/i, "");
    if (/\s|\||%20/i.test(pathName)) return "";
    if (!pathName || pathName === "/") return "";
    const allowedQuery = url.pathname.includes("/profile.php") && url.searchParams.get("id")
      ? `?id=${encodeURIComponent(url.searchParams.get("id") || "")}`
      : "";
    return `https://www.facebook.com${pathName}${allowedQuery}`;
  } catch {
    return "";
  }
}

function facebookFetchVariants(url = "") {
  const normalized = normalizeFacebookUrl(url);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  try {
    const parsed = new URL(normalized);
    const pathName = parsed.pathname.replace(/\/+$/, "");
    const query = parsed.search || "";
    variants.add(`https://www.facebook.com${pathName}/about${query}`);
    variants.add(`https://www.facebook.com${pathName}/about_contact_and_basic_info${query}`);
    variants.add(`https://mbasic.facebook.com${pathName}${query}`);
    variants.add(`https://mbasic.facebook.com${pathName}/about${query}`);
  } catch {}
  return [...variants];
}

function resolveHref(href = "", baseUrl = "") {
  const text = safeText(decodeHtml(href));
  if (!text || text.startsWith("#") || /^javascript:/i.test(text)) return "";
  if (/^mailto:/i.test(text)) return text;
  if (/^tel:/i.test(text)) return text;
  try {
    return new URL(text, baseUrl || undefined).toString();
  } catch {
    return "";
  }
}

function extractLinks(html = "", baseUrl = "") {
  const links = [];
  for (const match of String(html || "").matchAll(/\b(?:href|content|url)=["']([^"']+)["']/gi)) {
    const href = resolveHref(match[1], baseUrl);
    if (href) links.push(href);
  }
  for (const match of String(html || "").matchAll(/https?:\\?\/\\?\/[^"'<>\\\s)]+/gi)) {
    const href = resolveHref(match[0].replaceAll("\\/", "/"), baseUrl);
    if (href) links.push(href);
  }
  return [...new Set(links)];
}

function extractFacebookLinks(html = "", baseUrl = "") {
  return [...new Set(extractLinks(html, baseUrl).map(normalizeFacebookUrl).filter(Boolean))];
}

function extractWebsiteLinks(html = "", baseUrl = "") {
  return [...new Set(extractLinks(html, baseUrl)
    .map(normalizeWebsite)
    .filter((url) => url && !/(facebook|instagram|twitter|youtube|tiktok|linkedin)\.com/i.test(url)))];
}

function extractEmails(html = "") {
  const text = decodeHtml(String(html || ""))
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/\s+dot\s+/gi, ".");
  const emails = new Set();
  for (const match of text.matchAll(/[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/gi)) {
    const email = normalizeEmail(match[0].replace(/\s+/g, ""));
    if (email) emails.add(email);
  }
  for (const match of text.matchAll(/mailto:([^"'<>\s?]+)/gi)) {
    const email = normalizeEmail(match[1]);
    if (email) emails.add(email);
  }
  return [...emails];
}

function normalizePhone(value = "", country = "Romania") {
  const raw = safeText(decodeHtml(value));
  if (!raw) return "";
  const hasPlus = raw.includes("+");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (country === "Romania") {
    if (digits.startsWith("40") && digits.length === 11 && /^40[2378]/.test(digits)) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 10 && /^0[2378]/.test(digits)) return `+40${digits.slice(1)}`;
    if (digits.length === 9 && /^[2378]/.test(digits)) return `+40${digits}`;
    return "";
  }
  if (hasPlus && digits.length >= 9 && digits.length <= 15) return `+${digits}`;
  if (digits.length >= 9 && digits.length <= 15) return `+${digits}`;
  return "";
}

function extractPhones(html = "", country = "Romania") {
  const text = decodeHtml(String(html || "")).replace(/<[^>]+>/g, " ");
  const phones = new Set();
  for (const match of String(html || "").matchAll(/tel:([^"'<>\s]+)/gi)) {
    const phone = normalizePhone(match[1], country);
    if (phone) phones.add(phone);
  }
  for (const match of text.matchAll(/(?:telefon|tel\.?|phone|mobil|mobile|whatsapp|contact)[:\s]*(\+?\d[\d\s()./-]{7,}\d)/gi)) {
    const phone = normalizePhone(match[1], country);
    if (phone) phones.add(phone);
  }
  for (const match of text.matchAll(/(?:\+|00)?\d[\d\s()./-]{7,}\d/g)) {
    const candidate = match[0];
    const digits = candidate.replace(/\D/g, "");
    if (/^20\d{2}$/.test(digits) || digits.length < 9 || digits.length > 15) continue;
    if (/^(.)\1{8,}$/.test(digits)) continue;
    const phone = normalizePhone(candidate, country);
    if (phone) phones.add(phone);
  }
  return [...phones];
}

function firstUsefulEmail(emails = []) {
  return emails.find((email) => !/^(?:office|contact|info)@facebook\./i.test(email)) || emails[0] || "";
}

function firstUsefulPhone(phones = []) {
  return phones.find((phone) => phone.startsWith("+40")) || phones[0] || "";
}

async function fetchText(url, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text|html|json|xml/i.test(contentType)) return "";
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function contactPageCandidates(website = "") {
  const normalized = normalizeWebsite(website);
  if (!normalized) return [];
  if (/(?:facebook|fb)\.com/i.test(normalized)) {
    return [normalizeFacebookUrl(normalized)].filter(Boolean);
  }
  try {
    const url = new URL(normalized);
    const origin = url.origin;
    return [normalized, ...CONTACT_PATHS.map((item) => `${origin}/${item}`)];
  } catch {
    return [normalized];
  }
}

function searchQueries(partner = {}) {
  const name = safeText(partner.name);
  const area = [partner.city, partner.region, partner.country].filter(Boolean).join(" ");
  const admin = safeText(partner.administrator);
  return [
    `site:facebook.com "${name}" "${area}"`,
    admin ? `site:facebook.com "${admin}" "${area}" turism` : "",
    `"${name}" "${area}" facebook telefon email`
  ].filter(Boolean);
}

async function searchFacebookUrls(partner = {}, args = {}) {
  const urls = new Set();
  if (!args.search) return [];

  for (const query of searchQueries(partner).slice(0, 3)) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const html = await fetchText(searchUrl, args);
      for (const link of extractLinks(html, searchUrl)) {
        const decoded = (() => {
          try {
            const parsed = new URL(link);
            return parsed.searchParams.get("uddg") || link;
          } catch {
            return link;
          }
        })();
        const facebook = normalizeFacebookUrl(decoded);
        if (facebook) urls.add(facebook);
        if (urls.size >= 4) break;
      }
    } catch {}
    if (urls.size >= 4) break;
    await sleep(args.delayMs);
  }

  return [...urls];
}

function scoreFacebookUrl(url = "", partner = {}) {
  const urlKey = normalizeKey(url);
  const nameWords = specificPartnerWords(partner.name);
  const cityWords = normalizeKey([partner.city, partner.region].filter(Boolean).join(" ")).split(" ").filter((word) => word.length >= 4);
  let score = 0;
  for (const word of nameWords) if (urlKey.includes(word)) score += 4;
  for (const word of cityWords) if (urlKey.includes(word)) score += 2;
  if (/turism|tourism|visit|info|omd|primaria|consiliul/i.test(url)) score += 2;
  return score;
}

function specificPartnerWords(value = "") {
  const generic = new Set([
    "centrul",
    "centru",
    "national",
    "local",
    "informare",
    "promovare",
    "turistica",
    "turistic",
    "judetului",
    "judetean",
    "organizatia",
    "management",
    "destinatiei",
    "asociatia",
    "municipiul",
    "orasul",
    "comuna"
  ]);
  return normalizeKey(value)
    .split(" ")
    .filter((word) => word.length >= 4 && !generic.has(word));
}

function facebookCandidateScore(url = "", html = "", partner = {}) {
  const textKey = normalizeKey(`${url} ${html.slice(0, 20000)}`);
  const nameWords = specificPartnerWords(partner.name);
  const adminWords = specificPartnerWords(partner.administrator);
  const areaWords = normalizeKey([partner.city, partner.region].filter(Boolean).join(" "))
    .split(" ")
    .filter((word) => word.length >= 4);
  let score = scoreFacebookUrl(url, partner);
  for (const word of nameWords) if (textKey.includes(word)) score += 3;
  for (const word of adminWords) if (textKey.includes(word)) score += 2;
  for (const word of areaWords) if (textKey.includes(word)) score += 2;
  if (/turism|tourism|visit|informare|promovare|omd|destinatie/i.test(textKey)) score += 2;
  return score;
}

function isRelevantFacebookCandidate(url = "", html = "", partner = {}) {
  const score = facebookCandidateScore(url, html, partner);
  if (score >= 8) return true;
  const areaWords = normalizeKey([partner.city, partner.region].filter(Boolean).join(" "))
    .split(" ")
    .filter((word) => word.length >= 4);
  const textKey = normalizeKey(`${url} ${html.slice(0, 20000)}`);
  const hasArea = areaWords.some((word) => textKey.includes(word));
  return score >= 6 && hasArea;
}

function appendUnique(items = [], additions = []) {
  const set = new Set(items.filter(Boolean));
  for (const item of additions) if (item) set.add(item);
  return [...set];
}

async function enrichPartner(partner = {}, args = {}) {
  const sources = [];
  let emails = [];
  let phones = [];
  let websites = [];
  let facebookUrls = [];

  if (partner.facebook) facebookUrls.push(normalizeFacebookUrl(partner.facebook));

  for (const pageUrl of [partner.website, partner.source_url].filter(Boolean).flatMap(contactPageCandidates).slice(0, 4)) {
    try {
      const html = await fetchText(pageUrl, args);
      sources.push(pageUrl);
      if (normalizeFacebookUrl(pageUrl) && isRelevantFacebookCandidate(pageUrl, html, partner)) {
        emails = appendUnique(emails, extractEmails(html));
        phones = appendUnique(phones, extractPhones(html, partner.country || "Romania"));
        websites = appendUnique(websites, extractWebsiteLinks(html, pageUrl));
      }
      facebookUrls = appendUnique(facebookUrls, extractFacebookLinks(html, pageUrl));
    } catch {}
    await sleep(args.delayMs);
  }

  if (!facebookUrls.length || (!emails.length && !phones.length)) {
    facebookUrls = appendUnique(facebookUrls, await searchFacebookUrls(partner, args));
  }

  facebookUrls = facebookUrls
    .map(normalizeFacebookUrl)
    .filter(Boolean)
    .sort((left, right) => scoreFacebookUrl(right, partner) - scoreFacebookUrl(left, partner));

  const acceptedFacebookUrls = [];
  for (const facebook of facebookUrls.slice(0, 4)) {
    let accepted = Boolean(partner.facebook && normalizeFacebookUrl(partner.facebook) === facebook);
    let sawHtml = false;
    for (const variant of facebookFetchVariants(facebook).slice(0, args.maxPagesPerPartner)) {
      try {
        const html = await fetchText(variant, args);
        sawHtml = true;
        sources.push(variant);
        if (isRelevantFacebookCandidate(facebook, html, partner)) {
          accepted = true;
          emails = appendUnique(emails, extractEmails(html));
          phones = appendUnique(phones, extractPhones(html, partner.country || "Romania"));
          websites = appendUnique(websites, extractWebsiteLinks(html, variant));
        }
      } catch {}
      if (emails.length && phones.length) break;
      await sleep(args.delayMs);
    }
    if (!sawHtml && scoreFacebookUrl(facebook, partner) >= 8) accepted = true;
    if (accepted) acceptedFacebookUrls.push(facebook);
    if (emails.length && phones.length) break;
  }

  const email = firstUsefulEmail(emails);
  const phone = firstUsefulPhone(phones);
  const facebook = acceptedFacebookUrls[0] || "";
  const website = websites.find((item) => !/facebook\.com/i.test(item)) || "";
  const changedFields = [];
  if ((args.force || !safeText(partner.email)) && email) changedFields.push("email");
  if ((args.force || !safeText(partner.phone)) && phone) changedFields.push("phone");
  if (args.saveFacebook && (args.force || !safeText(partner.facebook)) && facebook) changedFields.push("facebook");
  if (args.saveWebsite && (args.force || !safeText(partner.website)) && website) changedFields.push("website");

  return {
    email,
    phone,
    facebook,
    website,
    sources: [...new Set(sources)].slice(0, 10),
    status: changedFields.length ? "updated" : (email || phone || facebook || website ? "checked" : "not_found"),
    changedFields
  };
}

function loadPartners(companyId, args = {}) {
  const where = ["company_id=?"];
  const params = [companyId];
  if (args.id) {
    where.push("id=?");
    params.push(args.id);
  }
  if (!args.includeComplete) {
    where.push("(COALESCE(email, '')='' OR COALESCE(phone, '')='')");
  }
  where.push("status<>'respins'");
  params.push(args.limit);
  return db.prepare(`
    SELECT *
    FROM travel_local_partners
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE WHEN COALESCE(facebook, '')<>'' THEN 0 ELSE 1 END ASC,
      CASE WHEN COALESCE(website, '')<>'' THEN 0 ELSE 1 END ASC,
      COALESCE(social_enriched_at, '') ASC,
      potential_reach DESC,
      id ASC
    LIMIT ?
  `).all(...params);
}

function updatePartner(partner = {}, enrichment = {}, args = {}) {
  const next = {
    email: (args.force || !safeText(partner.email)) && enrichment.email ? enrichment.email : safeText(partner.email),
    phone: (args.force || !safeText(partner.phone)) && enrichment.phone ? enrichment.phone : safeText(partner.phone),
    facebook: args.saveFacebook && (args.force || !safeText(partner.facebook)) && enrichment.facebook ? enrichment.facebook : safeText(partner.facebook),
    website: args.saveWebsite && (args.force || !safeText(partner.website)) && enrichment.website ? enrichment.website : safeText(partner.website)
  };
  const source = enrichment.sources.join(" | ").slice(0, 1000);
  const error = enrichment.status === "not_found" ? "Nu am găsit date publice utile pe social/website." : "";
  if (args.dryRun) return next;
  db.prepare(`
    UPDATE travel_local_partners
    SET email=?,
        phone=?,
        facebook=?,
        website=?,
        social_enrichment_status=?,
        social_enrichment_source=?,
        social_enrichment_error=?,
        social_enriched_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    next.email,
    next.phone,
    next.facebook,
    next.website,
    enrichment.status,
    source,
    error,
    partner.id,
    partner.company_id
  );
  return next;
}

function markPartnerError(partner = {}, error = {}, args = {}) {
  if (args.dryRun) return;
  db.prepare(`
    UPDATE travel_local_partners
    SET social_enrichment_status='error',
        social_enrichment_error=?,
        social_enriched_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(safeText(error.message || error).slice(0, 500), partner.id, partner.company_id);
}

function ensureReportDir() {
  const dir = path.join(process.cwd(), "utile", "rapoarte", "enrichment");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();
  const companyId = args.companyId || Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
  if (!companyId) throw new Error("Nu există companie pentru enrichment.");
  const partners = loadPartners(companyId, args);
  const report = {
    createdAt: new Date().toISOString(),
    companyId,
    dryRun: args.dryRun,
    force: args.force,
    limit: args.limit,
    checked: 0,
    updated: 0,
    checkedOnly: 0,
    notFound: 0,
    errors: 0,
    rows: []
  };

  for (const partner of partners) {
    try {
      const enrichment = await enrichPartner(partner, args);
      const next = updatePartner(partner, enrichment, args);
      report.checked += 1;
      if (enrichment.status === "updated") report.updated += 1;
      if (enrichment.status === "checked") report.checkedOnly += 1;
      if (enrichment.status === "not_found") report.notFound += 1;
      report.rows.push({
        id: partner.id,
        name: partner.name,
        status: enrichment.status,
        changedFields: enrichment.changedFields,
        email: next.email,
        phone: next.phone,
        facebookSource: enrichment.facebook,
        source: enrichment.sources[0] || ""
      });
    } catch (error) {
      report.checked += 1;
      report.errors += 1;
      markPartnerError(partner, error, args);
      report.rows.push({
        id: partner.id,
        name: partner.name,
        status: "error",
        error: safeText(error.message || error).slice(0, 500)
      });
    }
    await sleep(args.delayMs);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(ensureReportDir(), `local-partners-social-enrichment-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main()
  .catch((error) => {
    console.error(`[local-partners-social-enrichment] ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
