#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const SOURCE_URL = "https://data.classement.atout-france.fr/static/exportHebergementsClasses/hebergements_classes.csv";
const SOURCE = "official_france_atout_france";
const COUNTRY = "France";

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasArg(name) {
  return process.argv.includes(name) || process.argv.some((item) => item.startsWith(`${name}=`));
}

function safeText(value = "") {
  return String(value ?? "").trim();
}

function stripDiacritics(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value = "") {
  return stripDiacritics(safeText(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWebsite(value = "") {
  let text = safeText(value);
  if (!text || text === "-") return "";
  text = text.split(/[;\s]+/).find(Boolean) || "";
  if (!text || text.includes("@")) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return `${parsed.hostname}${parsed.pathname || ""}`
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  } catch {
    return stripDiacritics(text)
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\s+/g, "");
  }
}

function displayWebsite(value = "") {
  const text = safeText(value);
  if (!text || text === "-") return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.includes(".") && !text.includes("@")) return `https://${text}`;
  return "";
}

function parseCsv(text = "", delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function rowObject(headers = [], values = []) {
  const row = {};
  headers.forEach((header, index) => {
    row[normalizeKey(header)] = safeText(values[index]);
  });
  return row;
}

function propertyType(value = "") {
  const normalized = normalizeKey(value);
  if (normalized.includes("hotel")) return "hotel";
  if (normalized.includes("camping")) return "camping";
  if (normalized.includes("residence")) return "residence de tourisme";
  if (normalized.includes("village")) return "village de vacanta";
  if (normalized.includes("auberge")) return "hostel";
  if (normalized.includes("parc residentiel")) return "resort";
  return safeText(value).toLowerCase() || "cazare";
}

function candidateFromRow(row = {}) {
  const name = safeText(row["nom commercial"]);
  const city = safeText(row.commune);
  const rawWebsite = safeText(row["site internet"]);
  const website = displayWebsite(rawWebsite);
  const postalCode = safeText(row["code postal"]);
  const address = [safeText(row.adresse), postalCode, city].filter((item) => item && item !== "-").join(", ");
  if (!name || !city) return { error: "missing_name_or_city" };

  const notes = [
    "Import Atout France",
    `source_url=${SOURCE_URL}`,
    row["typologie etablissement"] ? `typologie=${row["typologie etablissement"]}` : "",
    row.classement ? `classement=${row.classement}` : "",
    row["date de classement"] ? `date_classement=${row["date de classement"]}` : "",
    row["capacite d accueil personnes"] ? `capacite=${row["capacite d accueil personnes"]}` : "",
    row["nombre de chambres"] ? `chambres=${row["nombre de chambres"]}` : ""
  ].filter(Boolean).join("; ");

  return {
    candidate: {
      name,
      property_type: propertyType(row["typologie etablissement"]),
      country: COUNTRY,
      city,
      county: postalCode.slice(0, 2),
      address,
      phone: "",
      email: "",
      website,
      facebook: "",
      instagram: "",
      google_rating: null,
      google_reviews: 0,
      source: SOURCE,
      status: "nou",
      score: website ? 15 : 0,
      notes,
      next_follow_up_at: null,
      website_key: normalizeWebsite(rawWebsite),
      name_city_key: `${normalizeKey(COUNTRY)}|${normalizeKey(name)}|${normalizeKey(city)}`
    }
  };
}

function loadKeySets(companyId) {
  const keySets = { nameCity: new Set(), website: new Set() };
  const rows = db.prepare(`
    SELECT name, country, city, website
    FROM travel_leads
    WHERE company_id=?
    UNION ALL
    SELECT name, country, city, website
    FROM travel_properties
    WHERE company_id=?
  `).all(companyId, companyId);

  for (const row of rows) {
    const website = normalizeWebsite(row.website);
    if (website) keySets.website.add(website);
    const name = normalizeKey(row.name);
    const city = normalizeKey(row.city);
    const country = normalizeKey(row.country || COUNTRY);
    if (name && city) keySets.nameCity.add(`${country}|${name}|${city}`);
  }
  return keySets;
}

function duplicateReason(keySets, candidate) {
  if (candidate.website_key && keySets.website.has(candidate.website_key)) return "website";
  if (candidate.name_city_key && keySets.nameCity.has(candidate.name_city_key)) return "name_city";
  return "";
}

function addKeys(keySets, candidate) {
  if (candidate.website_key) keySets.website.add(candidate.website_key);
  if (candidate.name_city_key) keySets.nameCity.add(candidate.name_city_key);
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
      const { website_key, name_city_key, ...payload } = row;
      const result = insert.run({ company_id: companyId, ...payload });
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
  const reportPath = path.join(reportDir, `france-atout-accommodations-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  migrate();
  const args = {
    companyId: Number(argValue("--company-id", "0")) || 0,
    dryRun: hasArg("--dry-run"),
    limit: Math.max(0, Number(argValue("--limit", "0")) || 0),
    url: argValue("--url", SOURCE_URL)
  };

  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");

  const response = await fetch(args.url, {
    headers: {
      accept: "text/csv,*/*",
      "user-agent": "NexoraTravelFranceAtoutImport/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Nu am putut descarca CSV Atout France: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const rows = parseCsv(text);
  const headers = rows.shift() || [];
  const keySets = loadKeySets(company.id);
  const candidates = [];
  const stats = {
    company_id: company.id,
    company_name: company.name,
    country: COUNTRY,
    source: SOURCE,
    source_url: args.url,
    dry_run: args.dryRun,
    fetched: rows.length,
    normalized: 0,
    created: 0,
    skipped_duplicates: 0,
    skipped_invalid: 0,
    duplicate_reasons: {},
    invalid_reasons: {},
    samples: []
  };

  for (const values of rows) {
    const parsed = rowObject(headers, values);
    const { candidate, error } = candidateFromRow(parsed);
    if (error) {
      stats.skipped_invalid += 1;
      stats.invalid_reasons[error] = (stats.invalid_reasons[error] || 0) + 1;
      continue;
    }
    const reason = duplicateReason(keySets, candidate);
    if (reason) {
      stats.skipped_duplicates += 1;
      stats.duplicate_reasons[reason] = (stats.duplicate_reasons[reason] || 0) + 1;
      continue;
    }
    addKeys(keySets, candidate);
    candidates.push(candidate);
    stats.normalized += 1;
    if (stats.samples.length < 20) {
      stats.samples.push({
        name: candidate.name,
        city: candidate.city,
        property_type: candidate.property_type,
        website: candidate.website,
        score: candidate.score
      });
    }
    if (args.limit && candidates.length >= args.limit) break;
  }

  if (!args.dryRun && candidates.length) {
    const insertedIds = insertCandidates(company.id, candidates);
    stats.created = insertedIds.length;
    stats.first_inserted_id = insertedIds[0] || null;
    stats.last_inserted_id = insertedIds.at(-1) || null;
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
