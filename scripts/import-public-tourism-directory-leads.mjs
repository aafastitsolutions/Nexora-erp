#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const SOURCE_CONFIGS = {
  turistinfo: {
    baseUrl: "https://www.turistinfo.ro",
    defaultDelayMs: 10000,
    listingSeeds: [
      "/",
      "/bran/cazare-hoteluri-vile-pensiuni-bran.html",
      "/sinaia/cazare-hoteluri-vile-pensiuni-sinaia.html",
      "/brasov/cazare-hoteluri-vile-pensiuni-brasov.html",
      "/busteni/cazare-hoteluri-vile-pensiuni-busteni.html",
      "/moieciu/cazare-hoteluri-vile-pensiuni-moieciu.html",
      "/mamaia_nord/cazare-hoteluri-vile-pensiuni-mamaia_nord.html",
      "/eforie_nord/cazare-hoteluri-vile-pensiuni-eforie_nord.html",
      "/sibiu/cazare-hoteluri-vile-pensiuni-sibiu.html",
      "/baile_felix/cazare-hoteluri-vile-pensiuni-baile_felix.html",
      "/oradea/cazare-hoteluri-vile-pensiuni-oradea.html",
      "/cluj_napoca/cazare-hoteluri-vile-pensiuni-cluj_napoca.html",
      "/iasi/cazare-hoteluri-vile-pensiuni-iasi.html",
      "/suceava/cazare-hoteluri-vile-pensiuni-suceava.html",
      "/gura_humorului/cazare-hoteluri-vile-pensiuni-gura_humorului.html",
      "/vatra_dornei/cazare-hoteluri-vile-pensiuni-vatra_dornei.html",
      "/sovata/cazare-hoteluri-vile-pensiuni-sovata.html",
      "/ranca/cazare-hoteluri-vile-pensiuni-ranca.html",
      "/arieseni/cazare-hoteluri-vile-pensiuni-arieseni.html",
      "/borsa/cazare-hoteluri-vile-pensiuni-borsa.html",
      "/viseu_de_sus/cazare-hoteluri-vile-pensiuni-viseu_de_sus.html",
      "/murighiol/cazare-hoteluri-vile-pensiuni-murighiol.html",
      "/tulcea/cazare-hoteluri-vile-pensiuni-tulcea.html"
    ]
  },
  infopensiuni: {
    baseUrl: "https://www.infopensiuni.ro",
    defaultDelayMs: 2500,
    listingSeeds: [
      "/",
      "/cazare-sinaia/",
      "/cazare-bran/",
      "/cazare-busteni/",
      "/cazare-moieciu/",
      "/cazare-sibiu/",
      "/cazare-eforie-nord/",
      "/cazare-mamaia/",
      "/cazare-vama-veche/",
      "/cazare-poiana-brasov/",
      "/cazare-cluj-napoca/",
      "/cazare-oradea/",
      "/cazare-iasi/",
      "/cazare-suceava/",
      "/cazare-gura-humorului/",
      "/cazare-vatra-dornei/",
      "/cazare-sovata/",
      "/cazare-ranca/",
      "/cazare-arieseni/",
      "/cazare-borsa/",
      "/cazare-viseu-de-sus/",
      "/cazare-murighiol/",
      "/cazare-tulcea/"
    ]
  },
  hoteluri_infoturism: {
    baseUrl: "https://hoteluri.infoturism.ro",
    defaultDelayMs: 5000,
    listingSeeds: [
      "/",
      "/sinaia/",
      "/brasov/",
      "/bran/",
      "/busteni/",
      "/mamaia/",
      "/eforie-nord/",
      "/sibiu/",
      "/cluj-napoca/",
      "/baile-felix/",
      "/oradea/",
      "/iasi/",
      "/suceava/",
      "/gura-humorului/",
      "/vatra-dornei/",
      "/sovata/",
      "/ranca/",
      "/arieseni/",
      "/borsa/",
      "/viseu-de-sus/",
      "/murighiol/",
      "/tulcea/"
    ]
  }
};

const OWN_DOMAINS = [
  "turistinfo.ro",
  "infopensiuni.ro",
  "infoturism.ro",
  "trevoro.ro",
  "facebook.com/tr",
  "googleadservices.com",
  "googletagmanager.com",
  "googletagservices.com"
];

const DEFAULT_TOURIST_CITIES = [
  "Bucuresti",
  "Brasov",
  "Sibiu",
  "Cluj-Napoca",
  "Timisoara",
  "Constanta",
  "Mamaia",
  "Mamaia Nord",
  "Eforie Nord",
  "Sinaia",
  "Predeal",
  "Busteni",
  "Bran",
  "Moieciu",
  "Sighisoara",
  "Vama Veche",
  "Baile Felix",
  "Suceava",
  "Tulcea",
  "Murighiol",
  "Delta Dunarii"
];

const DEFAULT_SCORING_CONFIG = {
  phone_points: 20,
  email_points: 20,
  website_points: 15,
  social_points: 10,
  google_reviews_50_points: 10,
  google_reviews_200_points: 20,
  tourist_city_points: 10,
  tourist_cities: DEFAULT_TOURIST_CITIES
};

function parseArgs(argv = []) {
  const args = {
    companyId: 0,
    source: "all",
    dryRun: false,
    limit: 100,
    seedLimit: 10,
    detailLimitPerSource: 0,
    delayMs: null,
    timeoutMs: 20000,
    country: "Romania"
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "source") args.source = safeText(rawValue) || args.source;
    if (key === "limit") args.limit = Math.max(0, Number(rawValue) || 0);
    if (key === "seed-limit") args.seedLimit = Math.max(0, Number(rawValue) || 0);
    if (key === "detail-limit-per-source") args.detailLimitPerSource = Math.max(0, Number(rawValue) || 0);
    if (key === "delay-ms") args.delayMs = Math.max(0, Number(rawValue) || 0);
    if (key === "timeout-ms") args.timeoutMs = Math.max(1000, Number(rawValue) || 20000);
    if (key === "country") args.country = safeText(rawValue) || args.country;
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
    .replace(/&[a-z0-9#]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16) || 32))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(value = "") {
  return safeText(decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function titleCase(value = "") {
  return safeText(value)
    .toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s.-])(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("ro-RO")}`);
}

function parseTouristCities(value = DEFAULT_TOURIST_CITIES) {
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(safeText).filter(Boolean);
    } catch {}
  }
  return String(value || "")
    .split(/[\n,;]/)
    .map(safeText)
    .filter(Boolean);
}

function loadScoringConfig(companyId) {
  const row = db.prepare("SELECT * FROM travel_scoring_settings WHERE company_id=?").get(companyId);
  if (!row) return DEFAULT_SCORING_CONFIG;
  return {
    phone_points: Number(row.phone_points) || DEFAULT_SCORING_CONFIG.phone_points,
    email_points: Number(row.email_points) || DEFAULT_SCORING_CONFIG.email_points,
    website_points: Number(row.website_points) || DEFAULT_SCORING_CONFIG.website_points,
    social_points: Number(row.social_points) || DEFAULT_SCORING_CONFIG.social_points,
    google_reviews_50_points: Number(row.google_reviews_50_points) || DEFAULT_SCORING_CONFIG.google_reviews_50_points,
    google_reviews_200_points: Number(row.google_reviews_200_points) || DEFAULT_SCORING_CONFIG.google_reviews_200_points,
    tourist_city_points: Number(row.tourist_city_points) || DEFAULT_SCORING_CONFIG.tourist_city_points,
    tourist_cities: parseTouristCities(row.tourist_cities || DEFAULT_SCORING_CONFIG.tourist_cities)
  };
}

function calculateScore(candidate, config) {
  let score = 0;
  const touristCities = new Set(config.tourist_cities.map(normalizeKey));
  if (candidate.phone) score += config.phone_points;
  if (candidate.email) score += config.email_points;
  if (candidate.website) score += config.website_points;
  if (candidate.facebook || candidate.instagram) score += config.social_points;
  if (candidate.google_reviews >= 200) score += config.google_reviews_200_points;
  else if (candidate.google_reviews >= 50) score += config.google_reviews_50_points;
  if (candidate.city && touristCities.has(normalizeKey(candidate.city))) score += config.tourist_city_points;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeEmail(value = "") {
  const text = safeText(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "";
  if (/(example|domeniu|domain|noreply|no-reply|test)@/i.test(text)) return "";
  if (OWN_DOMAINS.some((domain) => text.endsWith(`@${domain}`))) return "";
  return text;
}

function extractEmails(html = "") {
  const emails = new Set();
  const text = decodeHtml(html);
  for (const match of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const email = normalizeEmail(match[0]);
    if (email) emails.add(email);
  }
  return [...emails];
}

function normalizeWebsite(value = "") {
  let raw = safeText(decodeHtml(value));
  if (!raw) return "";
  raw = raw.replace(/^www\./i, "https://www.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return "";
    if (OWN_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function websiteKey(value = "") {
  const normalized = normalizeWebsite(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function extractExternalWebsite(html = "", sourceName = "") {
  const webLabel = html.match(/<b>\s*Web\s*:\s*<\/b>\s*([^<\s][^<]*)/i)?.[1]
    || html.match(/Web\s*:\s*(www\.[a-z0-9.-]+\.[a-z]{2,}[^\s<]*)/i)?.[1]
    || "";
  const direct = normalizeWebsite(webLabel);
  if (direct) return direct;

  const base = SOURCE_CONFIGS[sourceName]?.baseUrl || "";
  for (const href of extractHrefValues(html)) {
    const absolute = absoluteUrl(base, href);
    const normalized = normalizeWebsite(absolute);
    if (normalized) return normalized;
  }
  return "";
}

function extractSocial(html = "") {
  const socials = { facebook: "", instagram: "" };
  for (const href of extractHrefValues(html)) {
    const decoded = decodeHtml(href);
    if (!socials.facebook && /facebook\.com/i.test(decoded) && !/facebook\.com\/(tr|sharer|plugins|turistinfo|infoturism)/i.test(decoded)) {
      socials.facebook = decoded;
    }
    if (!socials.instagram && /instagram\.com/i.test(decoded)) {
      socials.instagram = decoded;
    }
  }
  return socials;
}

function extractHrefValues(html = "") {
  const values = [];
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    values.push(match[1]);
  }
  return values;
}

function extractPhones(value = "") {
  const raw = decodeHtml(value);
  const phones = [];
  const seen = new Set();
  for (const match of raw.matchAll(/(?:\+4|004)?0?\d(?:[\s().-]*\d){8,11}/g)) {
    const formatted = normalizePhone(match[0]);
    const key = formatted.replace(/\D/g, "");
    if (formatted && key && !seen.has(key)) {
      seen.add(key);
      phones.push(formatted);
    }
  }
  return phones;
}

function normalizePhone(value = "") {
  let digits = safeText(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("40") && digits.length === 11) digits = `0${digits.slice(2)}`;
  if (digits.length === 9 && /^[237]/.test(digits)) digits = `0${digits}`;
  if (digits.length !== 10 || !/^0[237]\d{8}$/.test(digits)) return "";
  return digits.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function phoneKey(value = "") {
  const direct = normalizePhone(value);
  if (direct) return direct.replace(/\D/g, "");
  for (const match of decodeHtml(value).matchAll(/(?:\+4|004)?0?\d(?:[\s().-]*\d){8,11}/g)) {
    const formatted = normalizePhone(match[0]);
    if (formatted) return formatted.replace(/\D/g, "");
  }
  return "";
}

function absoluteUrl(baseUrl, href = "") {
  const raw = safeText(decodeHtml(href));
  if (!raw || raw.startsWith("javascript:") || raw.startsWith("#")) return "";
  try {
    if (raw.startsWith("//")) return `https:${raw}`;
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function unique(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values.map(safeText).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function cleanName(value = "", city = "") {
  let name = htmlToText(value)
    .replace(/\s+\d+\*.*$/, "")
    .replace(/\s+grade\s+grade.*$/i, "")
    .replace(/\s+\(contact direct\).*$/i, "")
    .replace(/\s+-\s*recenzii.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const cityKey = normalizeKey(city);
  if (cityKey) {
    const dinCity = name.match(/\s+din\s+(.+)$/i);
    if (dinCity && normalizeKey(dinCity[1]) === cityKey) {
      name = name.slice(0, dinCity.index).trim();
    }
    const tokens = name.split(/\s+/);
    const last = normalizeKey(tokens.slice(-cityKey.split(" ").length).join(" "));
    const previous = normalizeKey(tokens.slice(-cityKey.split(" ").length * 2, -cityKey.split(" ").length).join(" "));
    if (last === cityKey && previous === cityKey) {
      name = tokens.slice(0, -cityKey.split(" ").length).join(" ");
    }
  }
  return safeText(name);
}

function cityFromSlug(slug = "") {
  return titleCase(stripDiacritics(slug)
    .replace(/^cazare[-_]/, "")
    .replace(/[-_]+jud[-_].*$/i, "")
    .replace(/[-_]+/g, " "));
}

function propertyTypeFromName(name = "", pathName = "") {
  const key = normalizeKey(`${name} ${pathName}`);
  if (key.includes("hotel")) return "hotel";
  if (key.includes("pensiune")) return "pensiune";
  if (key.includes("agroturistica")) return "pensiune agroturistica";
  if (key.includes("vila")) return "vila";
  if (key.includes("cabana")) return "cabana";
  if (key.includes("apartament")) return "apartament";
  if (key.includes("casa de vacanta")) return "casa de vacanta";
  if (key.includes("casa")) return "casa de vacanta";
  if (key.includes("complex")) return "complex turistic";
  if (key.includes("camping") || key.includes("campare")) return "camping";
  if (key.includes("motel")) return "motel";
  if (key.includes("hostel")) return "hostel";
  return "cazare";
}

function sourceKeyFromCandidate(candidate = {}) {
  if (candidate.source_key) return `${candidate.source}:${candidate.source_key}`;
  const sourceUrl = safeText(candidate.source_url);
  return sourceUrl ? `${candidate.source}:${sourceUrl}` : "";
}

function sourceKeyFromNotes(notes = "", source = "") {
  const sourceId = safeText(notes.match(/(?:turistinfo_id|infopensiuni_path|hoteluri_infoturism_path)=([^;]+)/)?.[1]);
  if (sourceId && source) return `${source}:${sourceId}`;
  const sourceUrl = safeText(notes.match(/public_source_url=([^;]+)/)?.[1]);
  return sourceUrl && source ? `${source}:${sourceUrl}` : "";
}

function nameCityKey(row = {}) {
  const name = normalizeKey(row.name);
  const city = normalizeKey(row.city);
  const country = normalizeKey(row.country || "Romania");
  return name && city ? `${country}|${name}|${city}` : "";
}

function namesLookRelated(left = "", right = "") {
  const leftTokens = new Set(normalizeKey(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeKey(right).split(" ").filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return false;
  const leftText = [...leftTokens].join(" ");
  const rightText = [...rightTokens].join(" ");
  if (leftText.includes(rightText) || rightText.includes(leftText)) return true;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap >= 2;
}

function loadKeyMaps(companyId) {
  const maps = {
    email: new Map(),
    nameCity: new Map(),
    phone: new Map(),
    sourceKey: new Map(),
    website: new Map()
  };

  const rows = db.prepare(`
    SELECT id, name, country, city, county, address, phone, email, website, facebook, instagram, source, score, notes
    FROM travel_leads
    WHERE company_id=?
  `).all(companyId);

  for (const row of rows) addRowToMaps(maps, row);
  return maps;
}

function addRowToMaps(maps, row = {}) {
  const email = normalizeEmail(row.email);
  const phone = phoneKey(row.phone);
  const website = websiteKey(row.website);
  const nc = nameCityKey(row);
  const sk = row.source_key ? sourceKeyFromCandidate(row) : sourceKeyFromNotes(row.notes || "", row.source || "");
  if (email && !maps.email.has(email)) maps.email.set(email, row);
  if (phone && !maps.phone.has(phone)) maps.phone.set(phone, row);
  if (website && !maps.website.has(website)) maps.website.set(website, row);
  if (nc && !maps.nameCity.has(nc)) maps.nameCity.set(nc, row);
  if (sk && !maps.sourceKey.has(sk)) maps.sourceKey.set(sk, row);
}

function findExisting(maps, candidate = {}) {
  const sk = sourceKeyFromCandidate(candidate);
  const phone = phoneKey(candidate.phone);
  const email = normalizeEmail(candidate.email);
  const website = websiteKey(candidate.website);
  const nc = nameCityKey(candidate);
  if (sk && maps.sourceKey.has(sk)) return { reason: "source_key", row: maps.sourceKey.get(sk) };
  if (email && maps.email.has(email)) return { reason: "email", row: maps.email.get(email) };
  if (website && maps.website.has(website)) return { reason: "website", row: maps.website.get(website) };
  if (nc && maps.nameCity.has(nc)) return { reason: "name_city", row: maps.nameCity.get(nc) };
  if (phone && maps.phone.has(phone)) {
    const row = maps.phone.get(phone);
    const sameCity = normalizeKey(row.city) && normalizeKey(row.city) === normalizeKey(candidate.city);
    if (sameCity && namesLookRelated(row.name, candidate.name)) return { reason: "phone", row };
  }
  return null;
}

function appendNote(existingNotes = "", newNote = "") {
  const left = safeText(existingNotes);
  const right = safeText(newNote);
  if (!right) return left;
  if (left.includes(right)) return left;
  return [left, right].filter(Boolean).join("; ");
}

function upsertCandidate(companyId, candidate, maps, scoringConfig, dryRun = false) {
  const existing = findExisting(maps, candidate);
  if (existing?.row) {
    const row = existing.row;
    const sameSourceRecord = existing.reason === "source_key" && safeText(row.source) === safeText(candidate.source);
    const updates = {};
    for (const key of ["property_type", "city", "county", "address", "phone", "email", "website", "facebook", "instagram"]) {
      if (!safeText(row[key]) && safeText(candidate[key])) updates[key] = candidate[key];
    }
    const merged = { ...row, ...updates };
    const newScore = Math.max(Number(row.score) || 0, calculateScore(merged, scoringConfig), Number(candidate.score) || 0);
    if (newScore > (Number(row.score) || 0)) updates.score = newScore;
    if (!sameSourceRecord) {
      const sourceNote = `enriched_from=${candidate.source}; public_source_url=${candidate.source_url}`;
      const notes = appendNote(row.notes || "", sourceNote);
      if (notes !== safeText(row.notes || "")) updates.notes = notes;
    }

    if (!Object.keys(updates).length) {
      return { action: "duplicate", reason: existing.reason, id: row.id };
    }

    if (!dryRun) {
      const keys = Object.keys(updates);
      db.prepare(`
        UPDATE travel_leads
        SET ${keys.map((key) => `${key}=@${key}`).join(", ")}, updated_at=datetime('now')
        WHERE company_id=@company_id AND id=@id
      `).run({ ...updates, company_id: companyId, id: row.id });
    }
    const updatedRow = { ...row, ...updates, id: row.id };
    addRowToMaps(maps, { ...updatedRow, source_key: candidate.source_key });
    return { action: "updated", reason: existing.reason, id: row.id, fields: Object.keys(updates) };
  }

  if (!dryRun) {
    const result = db.prepare(`
      INSERT INTO travel_leads (
        company_id, name, property_type, country, city, county, address, phone, email, website,
        facebook, instagram, google_rating, google_reviews, source, status, score,
        notes, next_follow_up_at, created_at, updated_at
      )
      VALUES (
        @company_id, @name, @property_type, @country, @city, @county, @address, @phone, @email, @website,
        @facebook, @instagram, @google_rating, @google_reviews, @source, @status, @score,
        @notes, @next_follow_up_at, datetime('now'), datetime('now')
      )
    `).run({ company_id: companyId, ...candidate });
    candidate.id = result.lastInsertRowid;
  }
  addRowToMaps(maps, candidate);
  return { action: "created", id: candidate.id || null };
}

function selectCompany(companyId) {
  if (companyId) {
    const selected = db.prepare("SELECT id, name FROM companies WHERE id=?").get(companyId);
    if (selected) return selected;
  }
  return db.prepare(`
    SELECT id, name
    FROM companies
    WHERE status='active'
    ORDER BY id
    LIMIT 1
  `).get() || db.prepare("SELECT id, name FROM companies ORDER BY id LIMIT 1").get();
}

function extractMeta(html = "", key = "") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return decodeHtml(value);
  }
  return "";
}

function firstItemprop(html = "", prop = "") {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const content = html.match(new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"))?.[1];
  if (content) return decodeHtml(content);
  const body = html.match(new RegExp(`<([a-z0-9]+)[^>]+itemprop=["']${escaped}["'][^>]*>([\\s\\S]{0,1200}?)<\\/\\1>`, "i"))?.[2];
  return body ? htmlToText(body) : "";
}

function countyFromText(text = "") {
  const match = safeText(text).match(/\bjud\.?\s+([A-ZĂÂÎȘȚa-zăâîșț -]+)/i);
  return match?.[1] ? titleCase(match[1].replace(/[,.].*$/, "")) : "";
}

function capacityFromHtml(html = "") {
  const block = html.match(/<div[^>]+class=["'][^"']*\bcapacitate\b[^"']*["'][^>]*>([\s\S]{0,500}?)<\/div>/i)?.[1] || "";
  const text = htmlToText(block);
  return text ? text.replace(/\s+/g, " ").slice(0, 220) : "";
}

function reviewStatsFromHtml(html = "") {
  const ratingValue = Number(firstItemprop(html, "ratingValue").replace(",", ".")) || null;
  const ratingCount = Number(firstItemprop(html, "ratingCount")) || 0;
  return { ratingValue, ratingCount };
}

function parseTuristinfoDetail(html, url, scoringConfig, country) {
  const parsed = new URL(url);
  const city = cityFromSlug(parsed.pathname.split("/")[1] || "");
  const id = parsed.pathname.match(/-c(\d+)\.html/i)?.[1] || parsed.pathname;
  const mainName = html.match(/<h1[\s\S]{0,800}<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
    || html.match(/<div[^>]+class=["'][^"']*\bsumar\b[^"']*["'][\s\S]{0,300}<b>([\s\S]*?)<\/b>/i)?.[1]
    || "";
  const name = cleanName(mainName || extractMeta(html, "og:title") || html.match(/<title>([\s\S]*?)<\/title>/i)?.[1], city);
  const address = firstItemprop(html, "address");
  const phones = [
    ...extractPhones(html.match(/href=["']tel:([^"']+)["']/i)?.[1] || ""),
    ...extractPhones(html.match(/Telefon:\s*([^<]+)/i)?.[1] || ""),
    ...extractPhones(html.match(/wa\.me\/([^?"']+)/i)?.[1] || "")
  ];
  const emails = extractEmails(html);
  const socials = extractSocial(html);
  const reviews = reviewStatsFromHtml(html);
  const sourceUrl = url;
  const capacity = capacityFromHtml(html);
  if (!name || (!phones.length && !emails.length)) return { error: "missing_name_or_contact" };

  const candidate = {
    name,
    property_type: propertyTypeFromName(name, parsed.pathname),
    country,
    city,
    county: countyFromText(address),
    address,
    phone: unique(phones).slice(0, 2).join("; "),
    email: emails[0] || "",
    website: "",
    facebook: socials.facebook || "",
    instagram: socials.instagram || "",
    google_rating: reviews.ratingValue,
    google_reviews: reviews.ratingCount,
    source: "turistinfo",
    status: "nou",
    score: 0,
    notes: [
      "public_directory=turistinfo.ro",
      `turistinfo_id=${id}`,
      `public_source_url=${sourceUrl}`,
      capacity ? `capacity=${capacity}` : ""
    ].filter(Boolean).join("; "),
    next_follow_up_at: null,
    source_key: id,
    source_url: sourceUrl
  };
  candidate.score = calculateScore(candidate, scoringConfig);
  return { candidate };
}

function parseInfopensiuniDetail(html, url, scoringConfig, country) {
  const parsed = new URL(url);
  const city = cityFromSlug(parsed.pathname.match(/\/cazare-([^/]+)/i)?.[1] || "");
  const name = cleanName(html.match(/<h1[^>]*class=["']bread["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || extractMeta(html, "og:title"), city);
  const address = firstItemprop(html, "streetAddress") || firstItemprop(html, "address");
  const phoneBlock = html.match(/<span[^>]+class=["']telephone["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "";
  const phones = extractPhones(phoneBlock || html.match(/Telefon[\s\S]{0,220}/i)?.[0] || "");
  const emails = extractEmails(html);
  const socials = extractSocial(html);
  const sourceUrl = url;
  if (!name || (!phones.length && !emails.length)) return { error: "missing_name_or_contact" };

  const candidate = {
    name,
    property_type: propertyTypeFromName(name, parsed.pathname),
    country,
    city,
    county: countyFromText(address),
    address,
    phone: unique(phones).slice(0, 2).join("; "),
    email: emails[0] || "",
    website: "",
    facebook: socials.facebook || "",
    instagram: socials.instagram || "",
    google_rating: null,
    google_reviews: 0,
    source: "infopensiuni",
    status: "nou",
    score: 0,
    notes: [
      "public_directory=infopensiuni.ro",
      `infopensiuni_path=${parsed.pathname}`,
      `public_source_url=${sourceUrl}`
    ].join("; "),
    next_follow_up_at: null,
    source_key: parsed.pathname,
    source_url: sourceUrl
  };
  candidate.score = calculateScore(candidate, scoringConfig);
  return { candidate };
}

function parseHoteluriInfoturismDetail(html, url, scoringConfig, country) {
  const parsed = new URL(url);
  const city = cityFromSlug(parsed.pathname.split("/")[1] || "");
  const name = cleanName(html.match(/<h3[^>]*class=["']h3_c["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1] || html.match(/<title>([\s\S]*?)<\/title>/i)?.[1], city);
  const contactBlock = html.match(/Date de contact[\s\S]{0,2200}/i)?.[0] || html;
  const address = htmlToText(contactBlock.match(/<b>\s*Adresa:\s*<\/b>\s*([^<]+(?:<br\s*\/?>)?)/i)?.[1] || "");
  const phones = extractPhones(contactBlock.match(/<b>\s*Telefon:\s*<\/b>\s*([\s\S]*?)<br/i)?.[1] || "");
  const emails = extractEmails(contactBlock);
  const website = extractExternalWebsite(contactBlock, "hoteluri_infoturism");
  const socials = extractSocial(html);
  const sourceUrl = url;
  if (!name || (!phones.length && !emails.length && !website)) return { error: "missing_name_or_contact" };

  const candidate = {
    name,
    property_type: propertyTypeFromName(name, parsed.pathname),
    country,
    city,
    county: countyFromText(address),
    address,
    phone: unique(phones).slice(0, 2).join("; "),
    email: emails[0] || "",
    website,
    facebook: socials.facebook || "",
    instagram: socials.instagram || "",
    google_rating: null,
    google_reviews: 0,
    source: "hoteluri_infoturism",
    status: "nou",
    score: 0,
    notes: [
      "public_directory=hoteluri.infoturism.ro",
      `hoteluri_infoturism_path=${parsed.pathname}`,
      `public_source_url=${sourceUrl}`
    ].join("; "),
    next_follow_up_at: null,
    source_key: parsed.pathname,
    source_url: sourceUrl
  };
  candidate.score = calculateScore(candidate, scoringConfig);
  return { candidate };
}

function extractTuristinfoDetailLinks(html, baseUrl) {
  return unique(extractHrefValues(html)
    .map((href) => absoluteUrl(baseUrl, href))
    .filter(Boolean)
    .filter((url) => /\/cazare-[^/]+\/[^/]+-c\d+\.html$/i.test(new URL(url).pathname))
    .filter((url) => !/\/(reviews|review|harta|poze|tarife|calendar)/i.test(new URL(url).pathname)));
}

function extractInfopensiuniDetailLinks(html, baseUrl) {
  return unique(extractHrefValues(html)
    .map((href) => absoluteUrl(baseUrl, href))
    .filter(Boolean)
    .filter((url) => /\/cazare-[^/]+\/(?:pensiuni|vile|hoteluri|apartamente|cabane|case-de-vacanta|complexe-turistice|garsoniere|hostel|moteluri)-[^/]+\/[^/?#]+\/?$/i.test(new URL(url).pathname)));
}

function extractHoteluriInfoturismDetailLinks(html, baseUrl) {
  return unique(extractHrefValues(html)
    .map((href) => absoluteUrl(baseUrl, href))
    .filter(Boolean)
    .filter((url) => /^\/[^/]+\/hotel-[^/?#]+\/?$/i.test(new URL(url).pathname)));
}

function extractListingLinks(source, html, baseUrl) {
  if (source === "turistinfo") {
    return unique(extractHrefValues(html)
      .map((href) => absoluteUrl(baseUrl, href))
      .filter(Boolean)
      .filter((url) => /\/cazare-hoteluri-vile-pensiuni-[^/]+\.html$/i.test(new URL(url).pathname))
      .slice(0, 40));
  }
  if (source === "infopensiuni") {
    return unique(extractHrefValues(html)
      .map((href) => absoluteUrl(baseUrl, href))
      .filter(Boolean)
      .filter((url) => /^\/cazare-[^/?#]+\/$/i.test(new URL(url).pathname))
      .slice(0, 40));
  }
  if (source === "hoteluri_infoturism") {
    return unique(extractHrefValues(html)
      .map((href) => absoluteUrl(baseUrl, href))
      .filter(Boolean)
      .filter((url) => /^\/[^/?#]+\/$/i.test(new URL(url).pathname))
      .filter((url) => !/administrare|cautare|cookies/i.test(url))
      .slice(0, 40));
  }
  return [];
}

function parseDetail(source, html, url, scoringConfig, country) {
  if (source === "turistinfo") return parseTuristinfoDetail(html, url, scoringConfig, country);
  if (source === "infopensiuni") return parseInfopensiuniDetail(html, url, scoringConfig, country);
  if (source === "hoteluri_infoturism") return parseHoteluriInfoturismDetail(html, url, scoringConfig, country);
  return { error: "unsupported_source" };
}

function extractDetailLinks(source, html, baseUrl) {
  if (source === "turistinfo") return extractTuristinfoDetailLinks(html, baseUrl);
  if (source === "infopensiuni") return extractInfopensiuniDetailLinks(html, baseUrl);
  if (source === "hoteluri_infoturism") return extractHoteluriInfoturismDetailLinks(html, baseUrl);
  return [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ro,en;q=0.8",
        "user-agent": "NexoraTravelImport/1.0 (+https://www.trevoro.ro)"
      },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 160)}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function collectDetailUrls(source, config, args, stats) {
  const baseUrl = config.baseUrl;
  const queue = unique(config.listingSeeds.map((seed) => absoluteUrl(baseUrl, seed))).slice(0, args.seedLimit || config.listingSeeds.length);
  const maxListingPages = args.seedLimit || config.listingSeeds.length;
  const seenListings = new Set();
  const detailUrls = [];

  for (const listingUrl of queue) {
    if (seenListings.has(listingUrl)) continue;
    seenListings.add(listingUrl);
    if (stats.remaining <= 0) break;
    console.log(`[${source}] listing ${listingUrl}`);
    try {
      const html = await fetchText(listingUrl, args.timeoutMs);
      stats.listing_pages_ok += 1;
      for (const url of extractDetailLinks(source, html, baseUrl)) {
        if (!detailUrls.includes(url)) detailUrls.push(url);
      }
      for (const url of extractListingLinks(source, html, baseUrl)) {
        if (!seenListings.has(url) && queue.length < maxListingPages) queue.push(url);
      }
    } catch (error) {
      stats.listing_pages_failed += 1;
      stats.errors.push({ source, url: listingUrl, error: error.message });
    }
    await sleep(args.delayMs ?? config.defaultDelayMs);
  }

  return detailUrls;
}

async function importSource(source, args, context) {
  const config = SOURCE_CONFIGS[source];
  if (!config) {
    return {
      source,
      unsupported: true,
      note: source === "listafirme"
        ? "listafirme.ro is behind Cloudflare/API access; import needs API credentials or CSV export."
        : "Unsupported source."
    };
  }

  const stats = {
    source,
    dry_run: args.dryRun,
    listing_pages_ok: 0,
    listing_pages_failed: 0,
    detail_pages_ok: 0,
    detail_pages_failed: 0,
    candidates: 0,
    created: 0,
    updated: 0,
    duplicates: 0,
    skipped_invalid: 0,
    duplicate_reasons: {},
    invalid_reasons: {},
    update_fields: {},
    errors: [],
    samples: [],
    remaining: args.detailLimitPerSource || args.limit
  };

  const detailUrls = await collectDetailUrls(source, config, args, stats);
  const targetDetailUrls = unique(detailUrls).slice(0, stats.remaining || detailUrls.length);
  stats.discovered_detail_urls = detailUrls.length;
  stats.selected_detail_urls = targetDetailUrls.length;

  for (const detailUrl of targetDetailUrls) {
    if (context.importedTotal >= args.limit) break;
    console.log(`[${source}] detail ${detailUrl}`);
    try {
      const html = await fetchText(detailUrl, args.timeoutMs);
      stats.detail_pages_ok += 1;
      const { candidate, error } = parseDetail(source, html, detailUrl, context.scoringConfig, args.country);
      if (error) {
        stats.skipped_invalid += 1;
        stats.invalid_reasons[error] = (stats.invalid_reasons[error] || 0) + 1;
      } else {
        stats.candidates += 1;
        const result = upsertCandidate(context.company.id, candidate, context.maps, context.scoringConfig, args.dryRun);
        if (result.action === "created") {
          stats.created += 1;
          context.importedTotal += 1;
        } else if (result.action === "updated") {
          stats.updated += 1;
          context.importedTotal += 1;
          for (const field of result.fields || []) {
            stats.update_fields[field] = (stats.update_fields[field] || 0) + 1;
          }
        } else {
          stats.duplicates += 1;
          stats.duplicate_reasons[result.reason] = (stats.duplicate_reasons[result.reason] || 0) + 1;
        }
        if (stats.samples.length < 20 && result.action !== "duplicate") {
          stats.samples.push({
            action: result.action,
            id: result.id,
            name: candidate.name,
            city: candidate.city,
            phone: candidate.phone,
            email: candidate.email,
            website: candidate.website,
            source_url: candidate.source_url
          });
        }
      }
    } catch (error) {
      stats.detail_pages_failed += 1;
      stats.errors.push({ source, url: detailUrl, error: error.message });
    }
    await sleep(args.delayMs ?? config.defaultDelayMs);
  }

  delete stats.remaining;
  return stats;
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `public-tourism-directory-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();

  const company = selectCompany(args.companyId);
  if (!company) throw new Error("No company found.");

  const sources = args.source === "all"
    ? ["turistinfo", "infopensiuni", "hoteluri_infoturism", "listafirme"]
    : args.source.split(",").map(safeText).filter(Boolean);

  const context = {
    company,
    scoringConfig: loadScoringConfig(company.id),
    maps: loadKeyMaps(company.id),
    importedTotal: 0
  };

  const report = {
    imported_at: new Date().toISOString(),
    company_id: company.id,
    company_name: company.name,
    country: args.country,
    requested_source: args.source,
    sources,
    dry_run: args.dryRun,
    limit: args.limit,
    seed_limit: args.seedLimit,
    delay_ms: args.delayMs,
    source_reports: []
  };

  for (const source of sources) {
    if (context.importedTotal >= args.limit) break;
    const sourceReport = await importSource(source, args, context);
    report.source_reports.push(sourceReport);
  }

  report.imported_or_updated = context.importedTotal;
  report.report_path = writeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
