#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const DEFAULT_LIMIT = 25;
const DEFAULT_TIMEOUT_MS = 18_000;
const DEFAULT_USER_AGENT = "NexoraTravelLeadEnrichment/1.0 (+https://www.trevoro.ro)";
const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contacts",
  "/contacte",
  "/contacto",
  "/contatti",
  "/kontakt",
  "/impressum",
  "/about",
  "/about-us",
  "/despre-noi"
];
const CONTACT_KEYWORDS = [
  "contact",
  "contacte",
  "contacto",
  "contacts",
  "contatti",
  "kontakt",
  "impressum",
  "despre",
  "about"
];
const EMAIL_PRIORITY_PREFIXES = [
  "contact",
  "office",
  "info",
  "booking",
  "bookings",
  "reservation",
  "reservations",
  "reception",
  "sales"
];
const BAD_EMAIL_PATTERNS = [
  "example.",
  "domain.",
  "domeniu.",
  "email.com",
  "your@",
  "you@",
  "nume@",
  "noreply@",
  "no-reply@",
  "sentry.",
  "estelarsoftware.",
  "wixpress.",
  "schema.org",
  "facebook.com",
  "instagram.com",
  "linkedin.com"
];
const CONTACT_PERSON_PATTERNS = [
  /(?:[Pp]ersoan[ăa]\s+de\s+contact|[Aa]dministrator|[Mm]anager|[Dd]irector(?:\s+[Gg]eneral)?|[Gg]eneral\s+[Mm]anager|[Oo]wner|[Pp]roprietar[ăa]?|[Rr]eprezentant)\s*[:\-–]\s*([\p{Lu}][\p{L}.'-]+(?:\s+[\p{Lu}][\p{L}.'-]+){1,4})/gu,
  /([\p{Lu}][\p{L}.'-]+(?:\s+[\p{Lu}][\p{L}.'-]+){1,4})\s*[-–,]\s*(?:[Aa]dministrator|[Mm]anager|[Dd]irector(?:\s+[Gg]eneral)?|[Gg]eneral\s+[Mm]anager|[Oo]wner|[Pp]roprietar[ăa]?|[Rr]eprezentant)/gu
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
const INTERMEDIARY_WEBSITE_DOMAINS = [
  "airbnb.com",
  "booking.com",
  "eforieonline.ro",
  "facebook.com",
  "hotels.com",
  "infopensiuni.ro",
  "infoturism.ro",
  "instagram.com",
  "romania-turistica.ro",
  "roturistic.ro",
  "tripadvisor.com",
  "turistinfo.ro"
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
  return String(value ?? "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function stripHtmlEntities(value = "") {
  return safeText(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanHtmlForExtraction(value = "") {
  return stripHtmlEntities(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
}

function htmlToVisibleText(value = "") {
  return cleanHtmlForExtraction(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function normalizeWebsiteUrl(value = "") {
  const raw = safeText(value);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function hostnameKey(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isIntermediaryWebsite(value = "") {
  const host = hostnameKey(value);
  if (!host) return false;
  return INTERMEDIARY_WEBSITE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function normalizePhone(value = "", { allowLongLocal = false, minDigits = 7 } = {}) {
  const raw = safeText(value).replace(/^tel:/i, "");
  const plus = raw.trim().startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < minDigits || digits.length > 15) return "";
  if (!plus && !raw.trim().startsWith("00") && !allowLongLocal && digits.length > 11) return "";
  if (!plus && !raw.trim().startsWith("00") && !raw.trim().startsWith("0")) return "";
  if (/^1\d{12,}$/.test(digits)) return "";
  if (/^(19|20)\d{6,}$/.test(digits)) return "";
  return `${plus}${digits}`;
}

function unique(values = []) {
  return [...new Set(values.map(safeText).filter(Boolean))];
}

function isBadEmail(value = "") {
  const email = normalizeEmail(value);
  if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return true;
  return BAD_EMAIL_PATTERNS.some((pattern) => email.includes(pattern));
}

function scoreEmail(email = "") {
  const normalized = normalizeEmail(email);
  const local = normalized.split("@")[0] || "";
  const prefixIndex = EMAIL_PRIORITY_PREFIXES.findIndex((prefix) => local === prefix || local.startsWith(`${prefix}.`) || local.startsWith(`${prefix}-`));
  let score = prefixIndex >= 0 ? 100 - prefixIndex : 30;
  if (local.includes("reservation") || local.includes("booking")) score += 15;
  if (local.includes("office") || local.includes("contact")) score += 10;
  if (local.includes("noreply") || local.includes("no-reply")) score -= 100;
  return score;
}

function bestEmail(emails = []) {
  return unique(emails)
    .map(normalizeEmail)
    .filter((email) => !isBadEmail(email))
    .sort((a, b) => scoreEmail(b) - scoreEmail(a))[0] || "";
}

function cleanSocialUrl(value = "", platform = "") {
  const raw = stripHtmlEntities(value);
  try {
    const parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (platform === "facebook" && !host.endsWith("facebook.com")) return "";
    if (platform === "instagram" && !host.endsWith("instagram.com")) return "";
    if (platform === "linkedin" && !host.endsWith("linkedin.com")) return "";
    const pathName = parsed.pathname.replace(/\/+$/, "");
    if (!pathName || pathName === "/") return "";
    if (platform === "facebook" && pathName === "/profile.php") {
      const id = parsed.searchParams.get("id");
      if (!id) return "";
      parsed.search = `?id=${encodeURIComponent(id)}`;
      parsed.hash = "";
      return parsed.toString();
    }
    const lower = `${host}${pathName}`.toLowerCase();
    const excluded = [
      "facebook.com/sharer",
      "facebook.com/share",
      "facebook.com/plugins",
      "facebook.com/dialog",
      "facebook.com/login",
      "facebook.com/thimpress",
      "facebook.com/theme",
      "facebook.com/envato",
      "facebook.com/wordpress",
      "facebook.com/all/",
      "instagram.com/accounts",
      "instagram.com/explore",
      "instagram.com/p/",
      "instagram.com/all.accor",
      "linkedin.com/share",
      "linkedin.com/feed",
      "linkedin.com/login",
      "linkedin.com/uas",
      "linkedin.com/help"
    ];
    if (excluded.some((item) => lower.includes(item))) return "";
    if (platform === "linkedin" && !/^\/(company|in|school|showcase)\//i.test(pathName)) return "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractLinks(html = "", baseUrl = "") {
  const links = [];
  const normalized = cleanHtmlForExtraction(html);
  const hrefRegex = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(normalized))) {
    const href = safeText(match[1]);
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {}
  }
  return unique(links);
}

function extractEmails(html = "") {
  const normalized = cleanHtmlForExtraction(html)
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".");
  return unique(normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
    .map((email) => email.replace(/[.,;:)]+$/g, ""))
    .filter((email) => !isBadEmail(email));
}

function extractPhones(html = "") {
  const normalized = cleanHtmlForExtraction(html);
  const phones = [];
  const telRegex = /\bhref\s*=\s*["']tel:([^"']+)["']/gi;
  let telMatch;
  while ((telMatch = telRegex.exec(normalized))) phones.push(normalizePhone(telMatch[1], { allowLongLocal: true }));
  const genericMatches = normalized.match(/(?:\+|00)?\d[\d\s()./-]{6,}\d/g) || [];
  for (const item of genericMatches) phones.push(normalizePhone(item, { minDigits: 9 }));
  return unique(phones).filter(Boolean);
}

function cleanContactPerson(value = "") {
  const name = safeText(value)
    .replace(/\s+/g, " ")
    .replace(/\s+(tel|telefon|phone|mobile|mobil)\.?$/i, "")
    .replace(/[|,;:.]+$/g, "")
    .trim();
  if (!name || name.length > 90) return "";
  if (/\d|@|www\.|https?:\/\//i.test(name)) return "";
  const lower = name.toLowerCase();
  const blocked = ["hotel", "pensiune", "restaurant", "receptie", "recepție", "contact", "office", "rezervari", "rezervări", "brevet", "turism", "located", "rooms", "apartments"];
  if (blocked.some((item) => lower === item || lower.includes(`${item} `))) return "";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return "";
  return name;
}

function extractContactPerson(html = "") {
  const text = htmlToVisibleText(html);
  for (const pattern of CONTACT_PERSON_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const person = cleanContactPerson(match[1]);
      if (person) return person;
    }
  }
  return "";
}

function normalizeCountry(value = "") {
  return safeText(value).toLowerCase();
}

function scorePhone(phone = "", country = "") {
  const raw = safeText(phone);
  const digits = raw.replace(/\D/g, "");
  const normalizedCountry = normalizeCountry(country || "Romania");
  if (!digits) return -100;
  if (normalizedCountry === "romania") {
    if (raw.startsWith("+40") && digits.length >= 11) return 100;
    if (digits.startsWith("0040") && digits.length >= 12) return 95;
    if (digits.startsWith("40") && digits.length === 11) return 90;
    if (digits.startsWith("07") && digits.length === 10) return 85;
    if ((digits.startsWith("02") || digits.startsWith("03")) && digits.length === 10) return 75;
    return -100;
  }
  if (raw.startsWith("+")) return 80;
  if (digits.startsWith("00")) return 70;
  if (digits.startsWith("0") && digits.length >= 9) return 50;
  if (digits.length >= 9 && digits.length <= 12) return 25;
  return 0;
}

function bestPhone(phones = [], country = "") {
  return unique(phones)
    .map((phone) => ({ phone, score: scorePhone(phone, country) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.phone || "";
}

function extractSocial(html = "", baseUrl = "") {
  const links = extractLinks(html, baseUrl);
  return {
    facebook: links.map((link) => cleanSocialUrl(link, "facebook")).find(Boolean) || "",
    instagram: links.map((link) => cleanSocialUrl(link, "instagram")).find(Boolean) || "",
    linkedin: links.map((link) => cleanSocialUrl(link, "linkedin")).find(Boolean) || ""
  };
}

function chooseContactUrl(homeHtml = "", homeUrl = "") {
  const links = extractLinks(homeHtml, homeUrl)
    .filter((link) => {
      try {
        const parsedHome = new URL(homeUrl);
        const parsedLink = new URL(link);
        if (parsedHome.hostname.replace(/^www\./, "") !== parsedLink.hostname.replace(/^www\./, "")) return false;
        if (/\.(css|js|png|jpe?g|webp|gif|svg|pdf|zip|xml)(?:$|\?)/i.test(parsedLink.pathname)) return false;
        const haystack = `${parsedLink.pathname} ${parsedLink.search}`.toLowerCase();
        return CONTACT_KEYWORDS.some((keyword) => haystack.includes(keyword));
      } catch {
        return false;
      }
    });
  if (links.length) {
    return links.sort((a, b) => a.length - b.length)[0];
  }
  for (const contactPath of CONTACT_PATHS) {
    try {
      return new URL(contactPath, homeUrl).toString();
    } catch {}
  }
  return "";
}

async function fetchPage(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": DEFAULT_USER_AGENT
      },
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error(`unsupported_content_type:${contentType.slice(0, 60)}`);
    }
    return {
      ok: true,
      url: response.url || url,
      html: text.slice(0, 1_500_000)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWebsite(url, timeoutMs) {
  const errors = [];
  for (const candidate of [url, url.replace(/^https:\/\//i, "http://")]) {
    if (!candidate) continue;
    try {
      return await fetchPage(candidate, timeoutMs);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function crawlLead(lead, timeoutMs) {
  const homeUrl = normalizeWebsiteUrl(lead.website);
  if (!homeUrl) return { status: "no_website", error: "website_invalid" };
  if (isIntermediaryWebsite(homeUrl)) return { status: "no_website", error: "intermediary_website" };
  const home = await fetchWebsite(homeUrl, timeoutMs);
  if (isIntermediaryWebsite(home.url)) return { status: "no_website", error: "redirected_to_intermediary_website" };
  const contactUrl = chooseContactUrl(home.html, home.url);
  let contact = null;
  if (contactUrl && contactUrl !== home.url) {
    try {
      contact = await fetchWebsite(contactUrl, timeoutMs);
      if (isIntermediaryWebsite(contact.url)) {
        contact = { ok: false, url: contactUrl, html: "", error: "redirected_to_intermediary_website" };
      }
    } catch (error) {
      contact = { ok: false, url: contactUrl, html: "", error: error.message };
    }
  }

  const pages = [home, contact].filter(Boolean);
  const combinedHtml = pages.map((page) => page.html || "").join("\n");
  const sourceUrl = contact?.ok ? contact.url : home.url;
  const social = extractSocial(combinedHtml, home.url);
  return {
    status: "checked",
    sourceUrl,
    contactUrl,
    emails: extractEmails(combinedHtml),
    phones: extractPhones(combinedHtml),
    facebook: social.facebook,
    instagram: social.instagram,
    linkedin: social.linkedin,
    contactPerson: extractContactPerson(combinedHtml),
    contactError: contact && !contact.ok ? contact.error : ""
  };
}

function isTransientFailure(value = "") {
  const normalized = safeText(value).toLowerCase();
  return TRANSIENT_SMTP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function loadFailureState(companyId, lead) {
  const rows = db.prepare(`
    SELECT direction, to_email, text_body, received_at
    FROM travel_email_messages
    WHERE company_id=?
      AND (
        lead_id=?
        OR (lower(trim(to_email))=lower(trim(?)) AND COALESCE(to_email, '')<>'')
      )
      AND direction='outbound_failed'
    ORDER BY received_at DESC
    LIMIT 5
  `).all(companyId, lead.id, safeText(lead.email));
  const latest = rows[0] || null;
  return {
    hasFailed: rows.length > 0,
    hasTransient: rows.some((row) => isTransientFailure(row.text_body)),
    latestAt: latest?.received_at || "",
    latestEmail: latest?.to_email || "",
    latestError: latest?.text_body || ""
  };
}

function loadLeads(companyId, options) {
  const where = [
    "company_id=?",
    "COALESCE(website, '')<>''"
  ];
  const params = [companyId];

  if (options.country) {
    where.push("lower(trim(COALESCE(country, 'Romania')))=lower(trim(?))");
    params.push(options.country);
  } else if (options.international) {
    where.push("lower(trim(COALESCE(country, 'Romania')))<>'romania'");
  }

  if (options.source) {
    where.push("lower(trim(COALESCE(source, '')))=lower(trim(?))");
    params.push(options.source);
  }

  if (options.onlyMissingEmail) where.push("COALESCE(email, '')=''");
  if (options.retryFailedOnly) {
    where.push(`EXISTS (
      SELECT 1 FROM travel_email_messages m
      WHERE m.company_id=travel_leads.company_id
        AND m.lead_id=travel_leads.id
        AND m.direction='outbound_failed'
    )`);
  }
  if (!options.force) {
    where.push(`(
      last_enriched_at IS NULL
      OR enrichment_status='pending'
      OR (
        enrichment_status IN ('error', 'no_website', 'skipped_intermediary_website')
        AND last_enriched_at < datetime('now', '-14 days')
      )
      OR (
        enrichment_status NOT IN ('error', 'no_website', 'skipped_intermediary_website')
        AND last_enriched_at < datetime('now', '-14 days')
      )
    )`);
  }

  return db.prepare(`
    SELECT *
    FROM travel_leads
    WHERE ${where.join("\n      AND ")}
    ORDER BY
      CASE WHEN EXISTS (
        SELECT 1 FROM travel_email_messages m
        WHERE m.company_id=travel_leads.company_id
          AND m.lead_id=travel_leads.id
          AND m.direction='outbound_failed'
      ) THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(email, '')='' THEN 0 ELSE 1 END,
      score DESC,
      id ASC
    LIMIT ?
  `).all(...params, options.limit);
}

function updateLead(companyId, lead, crawl) {
  const failure = loadFailureState(companyId, lead);
  const currentEmail = normalizeEmail(lead.email);
  const foundEmail = bestEmail(crawl.emails);
  const foundPhone = bestPhone(crawl.phones, lead.country);
  const emailChanged = Boolean(foundEmail && foundEmail !== currentEmail);
  const updateEmail = Boolean(foundEmail && (!currentEmail || (failure.hasFailed && emailChanged)));
  const updatePhone = Boolean(foundPhone && !safeText(lead.phone));
  const updateFacebook = Boolean(crawl.facebook && !safeText(lead.facebook));
  const updateInstagram = Boolean(crawl.instagram && !safeText(lead.instagram));
  const updateLinkedin = Boolean(crawl.linkedin && !safeText(lead.linkedin));
  const updateContactPage = Boolean((crawl.contactUrl || crawl.sourceUrl) && !safeText(lead.contact_page_url));
  const updateContactPerson = Boolean(crawl.contactPerson && !safeText(lead.contact_person));
  const shouldPrioritizeRetry = Boolean(
    foundEmail
    && failure.hasFailed
    && (updateEmail || failure.hasTransient)
  );
  const gainedScore = [
    updateEmail ? 20 : 0,
    updatePhone ? 20 : 0,
    updateFacebook || updateInstagram || updateLinkedin ? 10 : 0,
    updateContactPerson ? 10 : 0
  ].reduce((sum, value) => sum + value, 0);
  const nextScore = Math.min(100, Math.max(Number(lead.score || 0), Number(lead.score || 0) + gainedScore));
  const updates = {
    email: updateEmail ? foundEmail : safeText(lead.email),
    phone: updatePhone ? foundPhone : safeText(lead.phone),
    facebook: updateFacebook ? crawl.facebook : safeText(lead.facebook),
    instagram: updateInstagram ? crawl.instagram : safeText(lead.instagram),
    linkedin: updateLinkedin ? crawl.linkedin : safeText(lead.linkedin),
    contact_page_url: updateContactPage ? (crawl.contactUrl || crawl.sourceUrl) : safeText(lead.contact_page_url),
    contact_person: updateContactPerson ? crawl.contactPerson : safeText(lead.contact_person),
    score: nextScore,
    enrichment_status: (
      updateEmail
      || updatePhone
      || updateFacebook
      || updateInstagram
      || updateLinkedin
      || updateContactPage
      || updateContactPerson
      || shouldPrioritizeRetry
    ) ? "enriched" : "checked_no_new_data",
    enrichment_error: crawl.contactError || "",
    enrichment_source_url: crawl.sourceUrl || normalizeWebsiteUrl(lead.website),
    email_retry_priority: shouldPrioritizeRetry ? (updateEmail ? 100 : 70) : Number(lead.email_retry_priority || 0),
    email_retry_reason: shouldPrioritizeRetry
      ? [
          updateEmail ? `Email gasit prin enrichment: ${foundEmail}` : `Email confirmat prin enrichment: ${foundEmail}`,
          failure.latestAt ? `esec anterior: ${failure.latestAt}` : ""
        ].filter(Boolean).join("; ")
      : safeText(lead.email_retry_reason),
    email_retry_ready_at: shouldPrioritizeRetry ? new Date().toISOString().slice(0, 19).replace("T", " ") : safeText(lead.email_retry_ready_at)
  };

  db.transaction(() => {
    db.prepare(`
      UPDATE travel_leads
      SET email=?,
          phone=?,
          facebook=?,
          instagram=?,
          linkedin=?,
          contact_page_url=?,
          contact_person=?,
          score=?,
          enrichment_status=?,
          enrichment_error=?,
          enrichment_source_url=?,
          email_retry_priority=?,
          email_retry_reason=?,
          email_retry_ready_at=?,
          last_enriched_at=datetime('now'),
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      updates.email,
      updates.phone,
      updates.facebook,
      updates.instagram,
      updates.linkedin,
      updates.contact_page_url,
      updates.contact_person,
      updates.score,
      updates.enrichment_status,
      updates.enrichment_error,
      updates.enrichment_source_url,
      updates.email_retry_priority,
      updates.email_retry_reason,
      updates.email_retry_ready_at,
      lead.id,
      companyId
    );

    if (updates.enrichment_status === "enriched") {
      db.prepare(`
        INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
        VALUES (?, ?, 'lead_enriched', 'Lead îmbogățit automat', ?, datetime('now'))
      `).run(companyId, lead.id, [
        updateEmail ? `email=${foundEmail}` : "",
        updatePhone ? `phone=${foundPhone}` : "",
        updateFacebook ? `facebook=${crawl.facebook}` : "",
        updateInstagram ? `instagram=${crawl.instagram}` : "",
        updateLinkedin ? `linkedin=${crawl.linkedin}` : "",
        updateContactPage ? `contact_page=${updates.contact_page_url}` : "",
        updateContactPerson ? `contact_person=${crawl.contactPerson}` : "",
        shouldPrioritizeRetry ? `retry_priority=${updates.email_retry_priority}` : "",
        crawl.sourceUrl ? `source=${crawl.sourceUrl}` : ""
      ].filter(Boolean).join("; "));
    }
  })();

  return {
    updated: updates.enrichment_status === "enriched",
    retryPrioritized: shouldPrioritizeRetry,
    foundEmail,
    foundPhone,
    foundFacebook: crawl.facebook,
    foundInstagram: crawl.instagram,
    foundLinkedin: crawl.linkedin,
    foundContactPage: updates.contact_page_url,
    foundContactPerson: crawl.contactPerson,
    status: updates.enrichment_status,
    sourceUrl: updates.enrichment_source_url
  };
}

function markNoWebsite(companyId, lead, error = "") {
  db.prepare(`
    UPDATE travel_leads
    SET enrichment_status=?,
        enrichment_error=?,
        last_enriched_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run("no_website", safeText(error).slice(0, 500), lead.id, companyId);
}

function markError(companyId, lead, error = "") {
  db.prepare(`
    UPDATE travel_leads
    SET enrichment_status='error',
        enrichment_error=?,
        last_enriched_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(safeText(error).slice(0, 500), lead.id, companyId);
}

function writeReport(payload) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "enrichment");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `travel-lead-enrichment-report-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const options = {
    limit: Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT),
    country: safeText(argValue("--country", "")),
    source: safeText(argValue("--source", "")),
    international: hasFlag("--international"),
    onlyMissingEmail: hasFlag("--only-missing-email"),
    retryFailedOnly: hasFlag("--retry-failed-only"),
    force: hasFlag("--force"),
    dryRun: hasFlag("--dry-run"),
    delayMs: Math.max(0, Number(argValue("--delay-ms", 750)) || 0),
    timeoutMs: Math.max(5_000, Number(argValue("--timeout-ms", DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS)
  };

  migrate();
  const company = db.prepare("SELECT id, name FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id, name FROM companies ORDER BY id ASC LIMIT 1").get();
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");

  const leads = loadLeads(company.id, options);
  const report = {
    started_at: new Date().toISOString(),
    company_id: company.id,
    company_name: company.name,
    options,
    selected: leads.length,
    checked: 0,
    enriched: 0,
    retry_prioritized: 0,
    errors: 0,
    rows: []
  };

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const row = {
      id: lead.id,
      name: lead.name,
      country: lead.country || "Romania",
      city: lead.city,
      website: lead.website
    };
    try {
      const crawl = await crawlLead(lead, options.timeoutMs);
      report.checked += 1;
      if (options.dryRun) {
        row.status = crawl.status;
        row.found_email = bestEmail(crawl.emails);
        row.found_phone = bestPhone(crawl.phones, lead.country);
        row.found_facebook = crawl.facebook || "";
        row.found_instagram = crawl.instagram || "";
        row.found_linkedin = crawl.linkedin || "";
        row.found_contact_page = crawl.contactUrl || crawl.sourceUrl || "";
        row.found_contact_person = crawl.contactPerson || "";
        row.source_url = crawl.sourceUrl || "";
      } else if (crawl.status === "no_website") {
        markNoWebsite(company.id, lead, crawl.error);
        row.status = "no_website";
      } else {
        const result = updateLead(company.id, lead, crawl);
        if (result.updated) report.enriched += 1;
        if (result.retryPrioritized) report.retry_prioritized += 1;
        Object.assign(row, result);
      }
    } catch (error) {
      report.errors += 1;
      row.status = "error";
      row.error = error.message;
      if (!options.dryRun) markError(company.id, lead, error.message);
    }
    report.rows.push(row);
    if (options.delayMs && index < leads.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  report.finished_at = new Date().toISOString();
  const reportPath = writeReport(report);
  report.report_path = reportPath;
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
