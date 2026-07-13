#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const COUNTRY_BOUNDS = {
  Romania: { south: 43.55, west: 20.15, north: 48.35, east: 29.85 },
  Bulgaria: { south: 41.2, west: 22.35, north: 44.25, east: 28.65 },
  Greece: { south: 34.7, west: 19.25, north: 41.75, east: 29.75 },
  Albania: { south: 39.6, west: 19.2, north: 42.75, east: 21.1 }
};

const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function parseArgs(argv = []) {
  const args = {
    bbox: "",
    cellDelayMs: 750,
    countries: "",
    companyId: 0,
    cols: 4,
    dryRun: false,
    endpoints: DEFAULT_ENDPOINTS,
    limit: 0,
    maxCells: 0,
    rows: 4,
    timeoutMs: 90_000
  };
  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "country" || key === "countries") args.countries = rawValue;
    if (key === "bbox") args.bbox = rawValue;
    if (key === "cell-delay-ms") args.cellDelayMs = Math.max(0, Number(rawValue) || args.cellDelayMs);
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "cols") args.cols = Math.max(1, Number(rawValue) || args.cols);
    if (key === "endpoint") args.endpoints = rawValue ? [rawValue] : args.endpoints;
    if (key === "limit") args.limit = Math.max(0, Number(rawValue) || 0);
    if (key === "max-cells") args.maxCells = Math.max(0, Number(rawValue) || 0);
    if (key === "rows") args.rows = Math.max(1, Number(rawValue) || args.rows);
    if (key === "timeout-ms") args.timeoutMs = Math.max(10_000, Number(rawValue) || args.timeoutMs);
  }
  return args;
}

function safeText(value = "") {
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

function normalizeCountry(value = "") {
  const key = normalizeKey(value);
  const aliases = new Map([
    ["romania", "Romania"],
    ["ro", "Romania"],
    ["bulgaria", "Bulgaria"],
    ["bg", "Bulgaria"],
    ["greece", "Greece"],
    ["grecia", "Greece"],
    ["gr", "Greece"],
    ["albania", "Albania"],
    ["al", "Albania"]
  ]);
  return aliases.get(key) || safeText(value);
}

function agencyPrice(country = "") {
  return normalizeCountry(country) === "Romania"
    ? { monthly_price_ron: 199, monthly_price_amount: 199, monthly_price_currency: "RON" }
    : { monthly_price_ron: 0, monthly_price_amount: 60, monthly_price_currency: "EUR" };
}

function normalizePhone(value = "") {
  let digits = safeText(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("40") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
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

function firstTag(tags = {}, names = []) {
  for (const name of names) {
    const value = safeText(tags[name]);
    if (value) return value.split(";").map(safeText).find(Boolean) || value;
  }
  return "";
}

function addressFromTags(tags = {}) {
  const street = firstTag(tags, ["addr:street"]);
  const number = firstTag(tags, ["addr:housenumber"]);
  const postcode = firstTag(tags, ["addr:postcode"]);
  const city = firstTag(tags, ["addr:city", "addr:town", "addr:village"]);
  return [[street, number].filter(Boolean).join(" "), postcode, city].filter(Boolean).join(", ");
}

function buildGrid(bounds, rows, cols) {
  const cells = [];
  const latStep = (bounds.north - bounds.south) / rows;
  const lonStep = (bounds.east - bounds.west) / cols;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        south: Number((bounds.south + row * latStep).toFixed(5)),
        west: Number((bounds.west + col * lonStep).toFixed(5)),
        north: Number((bounds.south + (row + 1) * latStep).toFixed(5)),
        east: Number((bounds.west + (col + 1) * lonStep).toFixed(5))
      });
    }
  }
  return cells;
}

function parseBbox(value = "") {
  const parts = safeText(value).split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) return null;
  return { south, west, north, east };
}

function overpassQuery(cell) {
  const bbox = `${cell.south},${cell.west},${cell.north},${cell.east}`;
  return `[out:json][timeout:80];
(
  node["shop"="travel_agency"](${bbox});
  way["shop"="travel_agency"](${bbox});
  relation["shop"="travel_agency"](${bbox});
  node["office"~"^(travel_agent|travel_agency|tourism)$"](${bbox});
  way["office"~"^(travel_agent|travel_agency|tourism)$"](${bbox});
  relation["office"~"^(travel_agent|travel_agency|tourism)$"](${bbox});
  node["tourism"="travel_agency"](${bbox});
  way["tourism"="travel_agency"](${bbox});
  relation["tourism"="travel_agency"](${bbox});
);
out tags center qt;`;
}

async function fetchOverpass(query, endpoints, timeoutMs) {
  const errors = [];
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "NexoraTravelAgencyImport/1.0"
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
      return JSON.parse(text);
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(errors.join(" | "));
}

function sleep(ms = 0) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function normalizeOsmElement(element = {}, country = "Romania") {
  const tags = element.tags || {};
  const name = firstTag(tags, ["name", "official_name", "brand", "operator"]);
  const city = firstTag(tags, ["addr:city", "addr:town", "addr:village", "addr:municipality", "is_in:city", "is_in:town"]);
  const phone = firstTag(tags, ["contact:phone", "phone", "mobile", "contact:mobile"]);
  const email = firstTag(tags, ["contact:email", "email"]);
  const website = firstTag(tags, ["contact:website", "website", "url"]);
  const facebook = firstTag(tags, ["contact:facebook", "facebook", "facebook:page"]);
  const instagram = firstTag(tags, ["contact:instagram", "instagram"]);
  if (!name) return { error: "missing_name" };
  if (!city && !phone && !email && !website && !facebook && !instagram) return { error: "missing_city_or_contact" };

  const osmPath = `${element.type}/${element.id}`;
  const offerFocus = firstTag(tags, ["tourism", "shop", "office"]) || "travel agency";
  const notes = [
    "Import OpenStreetMap agentie turism",
    `osm=${osmPath}`,
    `osm_url=https://www.openstreetmap.org/${osmPath}`
  ].join("; ");

  const price = agencyPrice(country);
  return {
    candidate: {
      name,
      country,
      city,
      address: addressFromTags(tags),
      phone,
      email,
      website,
      facebook,
      instagram,
      offer_focus: offerFocus,
      source: "osm_agency",
      status: "nou",
      subscription_status: "lead",
      monthly_price_ron: price.monthly_price_ron,
      monthly_price_amount: price.monthly_price_amount,
      monthly_price_currency: price.monthly_price_currency,
      listing_limit: 0,
      promotion_notes: "Listari nelimitate. Promovare pe platforma si social media Trevoro.",
      notes,
      next_follow_up_at: null,
      osm_key: osmPath
    }
  };
}

function addKeys(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const nameCity = normalizeNameCity(row.name, row.city, row.country);
  if (phone) keySets.phone.add(phone);
  if (email) keySets.email.add(email);
  if (website) keySets.website.add(website);
  if (nameCity) keySets.nameCity.add(nameCity);
  const osmMatch = safeText(row.notes).match(/osm=(node|way|relation)\/(\d+)/);
  if (osmMatch) keySets.osm.add(`${osmMatch[1]}/${osmMatch[2]}`);
  if (row.osm_key) keySets.osm.add(row.osm_key);
}

function normalizeNameCity(name = "", city = "", country = "") {
  const normalizedName = normalizeKey(name);
  const normalizedCity = normalizeKey(city);
  const normalizedCountry = normalizeKey(country);
  return normalizedName && normalizedCity ? `${normalizedCountry}|${normalizedName}|${normalizedCity}` : "";
}

function duplicateReason(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const nameCity = normalizeNameCity(row.name, row.city, row.country);
  if (row.osm_key && keySets.osm.has(row.osm_key)) return "osm_id";
  if (phone && keySets.phone.has(phone)) return "phone";
  if (email && keySets.email.has(email)) return "email";
  if (website && keySets.website.has(website)) return "website";
  if (nameCity && keySets.nameCity.has(nameCity)) return "name_city";
  return "";
}

function loadKeySets(companyId) {
  const keySets = { email: new Set(), nameCity: new Set(), osm: new Set(), phone: new Set(), website: new Set() };
  const rows = db.prepare(`
    SELECT name, country, city, phone, email, website, notes
    FROM travel_agency_leads
    WHERE company_id=?
  `).all(companyId);
  for (const row of rows) addKeys(keySets, row);
  return keySets;
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

function existingCountries(companyId) {
  const rows = db.prepare(`
    SELECT DISTINCT country FROM travel_leads WHERE company_id=? AND COALESCE(country, '')<>''
    UNION
    SELECT DISTINCT country FROM travel_properties WHERE company_id=? AND COALESCE(country, '')<>''
    UNION
    SELECT DISTINCT country FROM travel_agency_leads WHERE company_id=? AND COALESCE(country, '')<>''
  `).all(companyId, companyId, companyId);
  const countries = rows.map((row) => normalizeCountry(row.country)).filter((country) => COUNTRY_BOUNDS[country]);
  return countries.length ? [...new Set(countries)] : Object.keys(COUNTRY_BOUNDS);
}

function requestedCountries(value = "", companyId) {
  const raw = safeText(value);
  if (!raw || raw === "existing") return existingCountries(companyId);
  if (["all", "all-existing"].includes(raw.toLowerCase())) return existingCountries(companyId);
  const countries = raw.split(",").map(normalizeCountry).filter((country) => COUNTRY_BOUNDS[country]);
  return countries.length ? [...new Set(countries)] : existingCountries(companyId);
}

function insertCandidates(companyId, candidates = []) {
  const insert = db.prepare(`
    INSERT INTO travel_agency_leads (
      company_id, name, country, city, address, phone, email, website, facebook, instagram,
      offer_focus, source, status, subscription_status, monthly_price_ron, monthly_price_amount, monthly_price_currency, listing_limit,
      promotion_notes, notes, next_follow_up_at, created_at, updated_at
    )
    VALUES (
      @company_id, @name, @country, @city, @address, @phone, @email, @website, @facebook, @instagram,
      @offer_focus, @source, @status, @subscription_status, @monthly_price_ron, @monthly_price_amount, @monthly_price_currency, @listing_limit,
      @promotion_notes, @notes, @next_follow_up_at, datetime('now'), datetime('now')
    )
  `);
  return db.transaction((rows) => rows.map((row) => insert.run({ company_id: companyId, ...row }).lastInsertRowid))(candidates);
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `osm-travel-agencies-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();
  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");
  const countries = requestedCountries(args.countries, company.id);
  const customBbox = parseBbox(args.bbox);
  const keySets = loadKeySets(company.id);
  const report = {
    company_id: company.id,
    company_name: company.name,
    source: "osm_agency",
    dry_run: args.dryRun,
    countries,
    cells_total: 0,
    cells_ok: 0,
    cells_failed: 0,
    fetched: 0,
    normalized: 0,
    created: 0,
    skipped_duplicates: 0,
    skipped_invalid: 0,
    errors: []
  };
  if (args.dryRun) report.preview = [];

  for (const country of countries) {
    let cells = customBbox ? [customBbox] : buildGrid(COUNTRY_BOUNDS[country], args.rows, args.cols);
    if (args.maxCells) cells = cells.slice(0, args.maxCells);
    report.cells_total += cells.length;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells[cellIndex];
      const cellCandidates = [];
      try {
        const data = await fetchOverpass(overpassQuery(cell), args.endpoints, args.timeoutMs);
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        report.fetched += elements.length;
        for (const element of elements) {
          const { candidate, error } = normalizeOsmElement(element, country);
          if (error || !candidate) {
            report.skipped_invalid += 1;
            continue;
          }
          const duplicate = duplicateReason(keySets, candidate);
          if (duplicate) {
            report.skipped_duplicates += 1;
            continue;
          }
          report.normalized += 1;
          addKeys(keySets, candidate);
          if (args.dryRun) {
            if (report.preview.length < 20) report.preview.push(candidate);
          } else {
            cellCandidates.push(candidate);
          }
          if (args.limit && report.normalized >= args.limit) break;
        }
        if (!args.dryRun && cellCandidates.length) {
          insertCandidates(company.id, cellCandidates);
          report.created += cellCandidates.length;
        }
        report.cells_ok += 1;
        console.error(
          `[agency-import] ${country} cell ${cellIndex + 1}/${cells.length}: fetched ${elements.length}, added ${cellCandidates.length}, total ${report.created}`
        );
      } catch (error) {
        report.cells_failed += 1;
        report.errors.push({ country, cell, message: error.message });
        console.error(`[agency-import] ${country} cell ${cellIndex + 1}/${cells.length} failed: ${error.message}`);
      }
      if (args.limit && report.normalized >= args.limit) break;
      await sleep(args.cellDelayMs);
    }
    if (args.limit && report.normalized >= args.limit) break;
  }

  report.reportPath = writeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
