#!/usr/bin/env node
import "dotenv/config";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

dns.setDefaultResultOrder("ipv4first");

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id";

function safeText(value = "") {
  return String(value ?? "").trim();
}

function parseArgs(argv = []) {
  const args = {
    companyId: 0,
    delayMs: 150,
    dryRun: false,
    limit: 200,
    minScore: 40,
    source: "osm"
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "delay-ms") args.delayMs = Math.max(0, Number(rawValue) || args.delayMs);
    if (key === "limit") args.limit = Math.max(1, Number(rawValue) || args.limit);
    if (key === "min-score") args.minScore = Math.max(0, Math.min(100, Number(rawValue) || args.minScore));
    if (key === "source") args.source = safeText(rawValue) || args.source;
  }

  return args;
}

function apiKey() {
  return safeText(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY);
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

function loadCandidates(companyId, args) {
  return db.prepare(`
    SELECT id, name, property_type, city, county, phone, email, website, source, score
    FROM travel_leads
    WHERE company_id=?
      AND source=?
      AND score>=?
      AND COALESCE(google_place_id, '')=''
      AND COALESCE(name, '')<>''
      AND (COALESCE(city, '')<>'' OR COALESCE(phone, '')<>'' OR COALESCE(website, '')<>'')
    ORDER BY
      score DESC,
      CASE WHEN COALESCE(city, '') <> '' THEN 0 ELSE 1 END ASC,
      id ASC
    LIMIT ?
  `).all(companyId, args.source, args.minScore, args.limit);
}

function queryForLead(lead = {}) {
  return [
    lead.name,
    lead.property_type,
    lead.city,
    lead.county,
    "Romania"
  ].map(safeText).filter(Boolean).join(" ");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchPlaceId(key, query) {
  const response = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "RO",
      languageCode: "ro",
      pageSize: 1
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
  }

  const payload = JSON.parse(text || "{}");
  return safeText(payload.places?.[0]?.id);
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `google-place-id-match-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = apiKey();
  if (!key) {
    throw new Error("Lipseste GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY / GOOGLE_API_KEY in .env sau environment.");
  }

  migrate();
  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");

  const candidates = loadCandidates(company.id, args);
  const existingPlaceIds = new Set(
    db.prepare(`
      SELECT google_place_id
      FROM travel_leads
      WHERE company_id=? AND COALESCE(google_place_id, '')<>''
    `).all(company.id).map((row) => row.google_place_id)
  );
  const updateLead = db.prepare(`
    UPDATE travel_leads
    SET google_place_id=?,
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `);
  const insertActivity = db.prepare(`
    INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
    VALUES (?, ?, 'google_place_matched', 'Google Place ID atașat', ?, datetime('now'))
  `);

  const report = {
    company_id: company.id,
    company_name: company.name,
    dry_run: args.dryRun,
    source: args.source,
    min_score: args.minScore,
    requested: candidates.length,
    matched: 0,
    skipped_duplicate_place_id: 0,
    not_found: 0,
    errors: [],
    samples: []
  };

  for (const lead of candidates) {
    const query = queryForLead(lead);
    try {
      const placeId = await searchPlaceId(key, query);
      if (!placeId) {
        report.not_found += 1;
      } else if (existingPlaceIds.has(placeId)) {
        report.skipped_duplicate_place_id += 1;
      } else {
        report.matched += 1;
        existingPlaceIds.add(placeId);
        if (!args.dryRun) {
          updateLead.run(placeId, lead.id, company.id);
          insertActivity.run(company.id, lead.id, `place_id=${placeId}; query=${query}`);
        }
        if (report.samples.length < 20) {
          report.samples.push({
            id: lead.id,
            name: lead.name,
            city: lead.city,
            source: lead.source,
            score: lead.score,
            google_place_id: placeId
          });
        }
      }
    } catch (error) {
      report.errors.push({ id: lead.id, query, error: error.message });
    }

    if (args.delayMs) await wait(args.delayMs);
  }

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
