#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  csvRows,
  ensureEmarqetOutboundSchema,
  mapPreparedLeadRow,
  normalizeKey,
  safeText,
  segmentByKey,
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

function matchesFilter(value = "", filter = "") {
  const expected = normalizeKey(filter);
  if (!expected) return true;
  return normalizeKey(value).includes(expected);
}

function companyIdFromDb() {
  const row = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(row?.id || 0);
}

async function main() {
  const file = safeText(argValue("--file"));
  if (!file) throw new Error("Lipseste --file path/to/leads.csv");
  const sourceFile = path.resolve(file);
  if (!fs.existsSync(sourceFile)) throw new Error(`Fisierul nu exista: ${sourceFile}`);

  const segmentKey = safeText(argValue("--segment", "all"));
  const county = safeText(argValue("--county"));
  const city = safeText(argValue("--city"));
  const source = safeText(argValue("--source", "manual_enrichment"));
  const limit = Math.max(0, Number(argValue("--limit", "0")) || 0);
  const dryRun = hasFlag("--dry-run");
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");

  ensureEmarqetOutboundSchema(db);

  const selectedSegment = segmentByKey(segmentKey);
  const expectedSegmentKey = selectedSegment?.key || (segmentKey === "all" ? "" : segmentKey);
  const report = [];
  let seen = 0;
  let imported = 0;
  let skipped = 0;

  for await (const row of csvRows(sourceFile)) {
    seen += 1;
    const lead = mapPreparedLeadRow(row, {
      source,
      source_file: sourceFile,
      segment_key: selectedSegment?.key || (segmentKey === "all" ? "" : segmentKey),
      segment_label: selectedSegment?.label || "",
      created_by: "emarqet-partner-leads-import"
    });
    const reason = [];
    if (!lead.company_name) reason.push("missing_company_name");
    if (expectedSegmentKey && lead.segment_key !== expectedSegmentKey) reason.push("segment_mismatch");
    if (!matchesFilter(lead.county, county)) reason.push("county_mismatch");
    if (!matchesFilter(lead.city, city)) reason.push("city_mismatch");
    if (reason.length) {
      skipped += 1;
      if (report.length < 50) report.push({ ok: false, skipped: true, reason, company: lead.company_name, email: lead.email, segment: lead.segment_key });
      continue;
    }
    if (!dryRun) upsertOutboundLead(db, companyId, lead);
    imported += 1;
    if (report.length < 50) report.push({ ok: true, dryRun, company: lead.company_name, email: lead.email, segment: lead.segment_key, city: lead.city, county: lead.county });
    if (limit && imported >= limit) break;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "importuri", `emarqet-partner-leads-import-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    importedAt: new Date().toISOString(),
    file: sourceFile,
    source,
    segment: segmentKey,
    county,
    city,
    dryRun,
    seen,
    imported,
    skipped,
    sample: report
  }, null, 2));

  console.log(JSON.stringify({ reportPath, dryRun, seen, imported, skipped, sample: report }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
