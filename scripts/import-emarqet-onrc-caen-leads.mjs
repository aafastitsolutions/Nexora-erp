#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  csvRows,
  ensureEmarqetOutboundSchema,
  firstValue,
  mapOnrcFirmRow,
  normalizeCaen,
  normalizeKey,
  safeText,
  segmentByKey,
  targetCaenCodes,
  upsertOutboundLead
} from "../lib/emarqet-outbound.js";

dotenv.config();

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

function argList(name) {
  return safeText(argValue(name))
    .split(",")
    .map((item) => safeText(item))
    .filter(Boolean);
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

function matchesAnyFilter(value = "", filters = []) {
  const normalizedFilters = filters.map(normalizeKey).filter(Boolean);
  if (!normalizedFilters.length) return true;
  const normalizedValue = normalizeKey(value);
  return normalizedFilters.some((filter) => normalizedValue.includes(filter));
}

async function loadTargetCaenMap(caenFile, caenCodes, maxRows = 0) {
  const caenByRegistration = new Map();
  let seen = 0;
  let matched = 0;
  for await (const row of csvRows(caenFile)) {
    seen += 1;
    const registration = safeText(firstValue(row, ["COD_INMATRICULARE", "NR_REG_COM", "REGISTRATION_NUMBER"])).toUpperCase();
    const caen = normalizeCaen(firstValue(row, ["COD_CAEN_AUTORIZAT", "COD_CAEN", "CAEN"]));
    if (registration && caenCodes.has(caen)) {
      if (!caenByRegistration.has(registration)) caenByRegistration.set(registration, new Set());
      caenByRegistration.get(registration).add(caen);
      matched += 1;
    }
    if (maxRows && seen >= maxRows) break;
  }
  return { caenByRegistration, seen, matched };
}

async function main() {
  const firmeFile = path.resolve(safeText(argValue("--firme")));
  const caenFile = path.resolve(safeText(argValue("--caen")));
  if (!safeText(argValue("--firme")) || !fs.existsSync(firmeFile)) throw new Error("Lipseste sau nu exista --firme OD_FIRME.csv");
  if (!safeText(argValue("--caen")) || !fs.existsSync(caenFile)) throw new Error("Lipseste sau nu exista --caen OD_CAEN_AUTORIZAT.csv");

  const segmentKey = safeText(argValue("--segment", "all"));
  const segmentKeys = argList("--segments");
  const requestedSegments = segmentKeys.length ? segmentKeys : [segmentKey];
  const county = safeText(argValue("--county"));
  const counties = argList("--counties");
  const city = safeText(argValue("--city"));
  const cities = argList("--cities");
  const limit = Math.max(0, Number(argValue("--limit", "0")) || 0);
  const maxCaenRows = Math.max(0, Number(argValue("--max-caen-rows", "0")) || 0);
  const maxFirmRows = Math.max(0, Number(argValue("--max-firm-rows", "0")) || 0);
  const dryRun = hasFlag("--dry-run");
  const selectedSegment = segmentKeys.length ? null : segmentByKey(segmentKey);
  const caenCodes = new Set(requestedSegments.flatMap((item) => [...targetCaenCodes(item)]));
  if (!caenCodes.size) throw new Error(`Segment CAEN necunoscut: ${segmentKey}`);
  const countyFilters = counties.length ? counties : (county ? [county] : []);
  const cityFilters = cities.length ? cities : (city ? [city] : []);

  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureEmarqetOutboundSchema(db);

  const caenLoad = await loadTargetCaenMap(caenFile, caenCodes, maxCaenRows);
  const report = [];
  let seenFirms = 0;
  let matchedFirms = 0;
  let imported = 0;
  let skipped = 0;

  for await (const row of csvRows(firmeFile)) {
    seenFirms += 1;
    const registration = safeText(firstValue(row, ["COD_INMATRICULARE"])).toUpperCase();
    const caens = caenLoad.caenByRegistration.get(registration);
    if (!caens?.size) {
      skipped += 1;
      if (maxFirmRows && seenFirms >= maxFirmRows) break;
      continue;
    }
    matchedFirms += 1;
    const caen = [...caens][0];
    const lead = mapOnrcFirmRow(row, caen, {
      source: "onrc_open_data",
      source_file: firmeFile,
      segment_key: selectedSegment?.key || "",
      notes: `Import ONRC pe CAEN ${[...caens].join(",")}; necesita imbogatire contact business public.`
    });
    const reason = [];
    if (!matchesAnyFilter(lead.county, countyFilters)) reason.push("county_mismatch");
    if (!matchesAnyFilter(lead.city, cityFilters)) reason.push("city_mismatch");
    if (reason.length) {
      skipped += 1;
      if (report.length < 50) report.push({ ok: false, skipped: true, reason, company: lead.company_name, caen: lead.caen_code, county: lead.county, city: lead.city });
      if (maxFirmRows && seenFirms >= maxFirmRows) break;
      continue;
    }
    if (!dryRun) upsertOutboundLead(db, companyId, lead);
    imported += 1;
    if (report.length < 50) report.push({ ok: true, dryRun, company: lead.company_name, cui: lead.cui, caen: lead.caen_code, segment: lead.segment_key, county: lead.county, city: lead.city });
    if (limit && imported >= limit) break;
    if (maxFirmRows && seenFirms >= maxFirmRows) break;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "importuri", `emarqet-onrc-caen-import-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    importedAt: new Date().toISOString(),
    firmeFile,
    caenFile,
    segment: segmentKeys.length ? segmentKeys : segmentKey,
    targetCaen: [...caenCodes],
    county: countyFilters.length ? countyFilters : county,
    city: cityFilters.length ? cityFilters : city,
    dryRun,
    caenRowsSeen: caenLoad.seen,
    caenRowsMatched: caenLoad.matched,
    firmsSeen: seenFirms,
    firmsMatchedByCaen: matchedFirms,
    imported,
    skipped,
    sample: report
  }, null, 2));

  console.log(JSON.stringify({
    reportPath,
    dryRun,
    segment: segmentKeys.length ? segmentKeys : segmentKey,
    targetCaen: [...caenCodes],
    caenRowsSeen: caenLoad.seen,
    caenRowsMatched: caenLoad.matched,
    firmsSeen: seenFirms,
    firmsMatchedByCaen: matchedFirms,
    imported,
    skipped,
    sample: report
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
