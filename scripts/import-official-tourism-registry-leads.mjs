#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";
import { db, migrate } from "../db.js";

const DEFAULT_SOURCE_URL = "https://turism.gov.ro/web/wp-content/uploads/2022/08/Lista-structurilor-de-primire-turistice-cu-functiuni-de-cazare-clasificate-actualizata-la-27.09.2024.xlsx";
const DEFAULT_SOURCE_FILE = path.join(process.cwd(), "data", "travel-sources", "Lista-structurilor-de-primire-turistice-cu-functiuni-de-cazare-clasificate-actualizata-la-27.09.2024.xlsx");
const SOURCE = "official_tourism_registry";
const SOURCE_UPDATE = "27.09.2024";
const IMPORT_COUNTRY = "Romania";

const DEFAULT_TOURIST_CITIES = [
  "Bucuresti",
  "Brasov",
  "Sibiu",
  "Cluj-Napoca",
  "Timisoara",
  "Constanta",
  "Mamaia",
  "Oradea",
  "Iasi",
  "Sinaia",
  "Predeal",
  "Busteni",
  "Bran",
  "Sighisoara",
  "Vama Veche",
  "Eforie Nord",
  "Baile Felix",
  "Suceava",
  "Tulcea",
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
    dryRun: false,
    file: DEFAULT_SOURCE_FILE,
    limit: 0,
    sourceUrl: DEFAULT_SOURCE_URL
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "file") args.file = rawValue || args.file;
    if (key === "limit") args.limit = Math.max(0, Number(rawValue) || 0);
    if (key === "source-url") args.sourceUrl = rawValue || args.sourceUrl;
  }
  return args;
}

function safeText(value = "") {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
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

function normalizeEmail(value = "") {
  const text = safeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

function normalizeWebsite(value = "") {
  let text = safeText(value).toLowerCase();
  if (!text) return "";
  try {
    const parsed = new URL(text.startsWith("http") ? text : `https://${text}`);
    text = `${parsed.hostname}${parsed.pathname || ""}`;
  } catch {
    text = text.replace(/^https?:\/\//, "");
  }
  return stripDiacritics(text)
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, "");
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

function headerKey(value = "") {
  return normalizeKey(value)
    .replace(/\bnumar\b/g, "numar")
    .replace(/\bjudet\b/g, "judet");
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
  if (candidate.city && touristCities.has(normalizeKey(candidate.city))) score += config.tourist_city_points;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function propertyTypeFromOfficial(value = "") {
  const normalized = normalizeKey(value);
  if (normalized.includes("hotel")) return "hotel";
  if (normalized.includes("motel")) return "motel";
  if (normalized.includes("hostel")) return "hostel";
  if (normalized.includes("pensiune")) return "pensiune";
  if (normalized.includes("agroturistica")) return "pensiune agroturistica";
  if (normalized.includes("apartamente")) return "apartament";
  if (normalized.includes("camere")) return "camere de inchiriat";
  if (normalized.includes("vila")) return "vila";
  if (normalized.includes("cabana")) return "cabana";
  if (normalized.includes("camping") || normalized.includes("campare")) return "camping";
  if (normalized.includes("bungal")) return "bungalow";
  if (normalized.includes("casute")) return "casute turistice";
  return titleCaseRo(value).toLowerCase();
}

function splitWeb(value = "") {
  const raw = safeText(value);
  if (!raw) return { website: "", facebook: "", instagram: "" };
  const first = raw.split(/[;\s]+/).map(safeText).find(Boolean) || "";
  const normalized = first.toLowerCase();
  if (normalized.includes("facebook.com") || normalized.includes("fb.com")) {
    return { website: "", facebook: first, instagram: "" };
  }
  if (normalized.includes("instagram.com")) {
    return { website: "", facebook: "", instagram: first };
  }
  if (normalizeEmail(first)) return { website: "", facebook: "", instagram: "" };
  return { website: first, facebook: "", instagram: "" };
}

async function downloadSource(url, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
      referer: "https://turism.gov.ro/"
    }
  });
  if (!response.ok) {
    throw new Error(`Nu am putut descărca registrul oficial: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, buffer);
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

function value(row, map, aliases = []) {
  for (const alias of aliases) {
    const index = map.get(alias);
    if (Number.isInteger(index)) return safeText(row[index]);
  }
  return "";
}

function officialKeyFromNotes(notes = "") {
  const auth = safeText(notes.match(/official_auth=([^;]+)/)?.[1]);
  return auth ? `auth:${normalizeKey(auth)}` : "";
}

function loadKeySets(companyId) {
  const keySets = {
    email: new Set(),
    nameCity: new Set(),
    officialAuth: new Set(),
    phone: new Set(),
    website: new Set()
  };

  const rows = db.prepare(`
    SELECT name, city, phone, email, website, notes
    FROM travel_leads
    WHERE company_id=?
    UNION ALL
    SELECT name, city, phone, email, website, NULL AS notes
    FROM travel_properties
    WHERE company_id=?
  `).all(companyId, companyId);

  for (const row of rows) addKeys(keySets, row);
  return keySets;
}

function addKeys(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const nameCity = normalizeNameCity(row.name, row.city);
  const officialAuth = row.official_auth ? `auth:${normalizeKey(row.official_auth)}` : officialKeyFromNotes(row.notes || "");
  if (phone) keySets.phone.add(phone);
  if (email) keySets.email.add(email);
  if (website) keySets.website.add(website);
  if (nameCity) keySets.nameCity.add(nameCity);
  if (officialAuth) keySets.officialAuth.add(officialAuth);
}

function duplicateReason(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const nameCity = normalizeNameCity(row.name, row.city);
  const officialAuth = row.official_auth ? `auth:${normalizeKey(row.official_auth)}` : "";
  if (officialAuth && keySets.officialAuth.has(officialAuth)) return "official_auth";
  if (phone && keySets.phone.has(phone)) return "phone";
  if (email && keySets.email.has(email)) return "email";
  if (website && keySets.website.has(website)) return "website";
  if (nameCity && keySets.nameCity.has(nameCity)) return "name_city";
  return "";
}

function normalizeOfficialRow(row, map, scoringConfig) {
  const unitType = value(row, map, ["tip unitate"]);
  const name = value(row, map, ["nume unitate"]);
  const category = value(row, map, ["tip categorie"]);
  const spaces = value(row, map, ["numar spatii"]);
  const places = value(row, map, ["numar locuri"]);
  const addressDetails = value(row, map, ["alte detalii adresa"]);
  const localityComponent = value(row, map, ["localitate componenta"]);
  const locality = value(row, map, ["localitate"]);
  const county = value(row, map, ["judet"]);
  const email = normalizeEmail(value(row, map, ["email"]));
  const web = splitWeb(value(row, map, ["web"]));
  const operatorType = value(row, map, ["tip operator economic"]);
  const operator = value(row, map, ["operator economic"]);
  const registrationNumber = value(row, map, ["numar inregistrare"]);
  const cui = value(row, map, ["cod unic inregistrare"]);
  const authorization = value(row, map, ["numar autorizatie"]);
  const authorizationDate = value(row, map, ["data emitere autorizatie"]);
  const city = titleCaseRo(localityName(localityComponent || locality));
  const countyLabel = titleCaseRo(county);
  const address = [
    addressDetails,
    locality && locality !== localityComponent ? locality : "",
    countyLabel ? `jud. ${countyLabel}` : ""
  ].filter(Boolean).join(", ");

  if (!name || !city) return { error: "missing_name_or_city" };

  const notes = [
    "official_registry=turism.gov.ro",
    `registry_update=${SOURCE_UPDATE}`,
    `tip_unitate=${unitType}`,
    category ? `categorie=${category}` : "",
    spaces ? `numar_spatii=${spaces}` : "",
    places ? `numar_locuri=${places}` : "",
    operatorType ? `operator_type=${operatorType}` : "",
    operator ? `operator=${operator}` : "",
    registrationNumber ? `registru=${registrationNumber}` : "",
    cui ? `official_cui=${cui}` : "",
    authorization ? `official_auth=${authorization}` : "",
    authorizationDate ? `auth_date=${authorizationDate}` : ""
  ].filter(Boolean).join("; ");

  const candidate = {
    name: titleCaseRo(name),
    property_type: propertyTypeFromOfficial(unitType),
    country: IMPORT_COUNTRY,
    city,
    county: countyLabel,
    address,
    phone: "",
    email,
    website: web.website,
    facebook: web.facebook,
    instagram: web.instagram,
    google_rating: null,
    google_reviews: 0,
    source: SOURCE,
    status: "nou",
    score: 0,
    notes,
    next_follow_up_at: null,
    official_auth: authorization
  };
  candidate.score = calculateScore(candidate, scoringConfig);
  return { candidate };
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

function insertCandidates(companyId, candidates = []) {
  const insert = db.prepare(`
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
  `);

  const run = db.transaction((rows) => {
    const ids = [];
    for (const row of rows) {
      const { official_auth, ...stored } = row;
      const result = insert.run({ company_id: companyId, ...stored });
      ids.push(result.lastInsertRowid);
    }
    return ids;
  });

  return run(candidates);
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `official-tourism-registry-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();

  if (!fs.existsSync(args.file)) {
    await downloadSource(args.sourceUrl, args.file);
  }

  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu există nicio companie în baza de date.");

  const scoringConfig = loadScoringConfig(company.id);
  const keySets = loadKeySets(company.id);
  const rows = await loadWorkbookRows(args.file);
  const header = findHeader(rows);
  const candidates = [];
  const stats = {
    company_id: company.id,
    company_name: company.name,
    source: SOURCE,
    source_update: SOURCE_UPDATE,
    source_file: args.file,
    source_url: args.sourceUrl,
    dry_run: args.dryRun,
    rows_total: Math.max(0, rows.length - header.index - 1),
    normalized: 0,
    created: 0,
    skipped_duplicates: 0,
    skipped_invalid: 0,
    duplicate_reasons: {},
    invalid_reasons: {},
    with_email: 0,
    with_website: 0,
    with_social: 0,
    samples: []
  };

  for (let index = header.index + 1; index < rows.length; index += 1) {
    if (args.limit && candidates.length >= args.limit) break;
    const row = rows[index] || [];
    if (!row.some((cell) => safeText(cell))) continue;

    const { candidate, error } = normalizeOfficialRow(row, header.map, scoringConfig);
    if (error) {
      stats.skipped_invalid += 1;
      stats.invalid_reasons[error] = (stats.invalid_reasons[error] || 0) + 1;
      continue;
    }

    const duplicate = duplicateReason(keySets, candidate);
    if (duplicate) {
      stats.skipped_duplicates += 1;
      stats.duplicate_reasons[duplicate] = (stats.duplicate_reasons[duplicate] || 0) + 1;
      continue;
    }

    candidates.push(candidate);
    addKeys(keySets, candidate);
    stats.normalized += 1;
    if (candidate.email) stats.with_email += 1;
    if (candidate.website) stats.with_website += 1;
    if (candidate.facebook || candidate.instagram) stats.with_social += 1;
    if (stats.samples.length < 20) {
      stats.samples.push({
        name: candidate.name,
        city: candidate.city,
        county: candidate.county,
        property_type: candidate.property_type,
        email: candidate.email,
        website: candidate.website,
        facebook: candidate.facebook,
        score: candidate.score
      });
    }
  }

  if (!args.dryRun && candidates.length) {
    const ids = insertCandidates(company.id, candidates);
    stats.created = ids.length;
    stats.first_inserted_id = ids[0] || null;
    stats.last_inserted_id = ids.at(-1) || null;
  }

  stats.report_path = writeReport(stats);
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
