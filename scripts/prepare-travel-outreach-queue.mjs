#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const DEFAULT_SOURCE = "all";
const PROSPECTING_SOURCES = [
  "osm",
  "official_tourism_registry",
  "turistinfo",
  "infopensiuni",
  "hoteluri_infoturism"
];

function safeText(value = "") {
  return String(value ?? "").trim();
}

function parseSources(value = DEFAULT_SOURCE) {
  const raw = safeText(value || DEFAULT_SOURCE).toLowerCase();
  if (["all", "prospecting", "cold"].includes(raw)) return [...PROSPECTING_SOURCES];
  const sources = raw.split(",").map(safeText).filter(Boolean);
  return sources.length ? sources : [DEFAULT_SOURCE];
}

function numberArg(rawValue, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(rawValue);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
}

function parseArgs(argv = []) {
  const args = {
    companyId: 0,
    dailyLimit: 50,
    dryRun: false,
    limit: 250,
    minScore: 40,
    source: DEFAULT_SOURCE,
    startDays: 1
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "daily-limit") args.dailyLimit = numberArg(rawValue, args.dailyLimit, { min: 1 });
    if (key === "limit") args.limit = numberArg(rawValue, args.limit, { min: 1 });
    if (key === "min-score") args.minScore = numberArg(rawValue, args.minScore, { min: 0, max: 100 });
    if (key === "source") args.source = safeText(rawValue) || args.source;
    if (key === "start-days") args.startDays = numberArg(rawValue, args.startDays, { min: 0 });
  }

  return args;
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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

function preferredChannel(lead = {}) {
  if (safeText(lead.email)) return "email";
  if (safeText(lead.whatsapp_phone)) return "whatsapp";
  if (safeText(lead.phone)) return "telefon";
  if (safeText(lead.website)) return "research_website";
  return "manual";
}

function followUpAt(index, dailyLimit, startDays) {
  const date = new Date();
  const dayOffset = startDays + Math.floor(index / dailyLimit);
  const slot = index % dailyLimit;
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const workdayMinutes = 9 * 60;
  const minuteOffset = Math.floor((slot * workdayMinutes) / dailyLimit);
  date.setUTCHours(9, minuteOffset, 0, 0);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function loadCandidates(companyId, args) {
  const sources = parseSources(args.source);
  const placeholders = sources.map(() => "?").join(", ");
  return db.prepare(`
    SELECT *
    FROM travel_leads
    WHERE company_id=?
      AND source IN (${placeholders})
      AND status='nou'
      AND score>=?
      AND (next_follow_up_at IS NULL OR next_follow_up_at='')
      AND (
        COALESCE(email, '') <> ''
        OR COALESCE(whatsapp_phone, '') <> ''
        OR COALESCE(phone, '') <> ''
        OR COALESCE(website, '') <> ''
      )
    ORDER BY
      CASE WHEN COALESCE(email, '') <> '' THEN 0 ELSE 1 END ASC,
      CASE WHEN COALESCE(whatsapp_phone, '') <> '' OR COALESCE(phone, '') <> '' THEN 0 ELSE 1 END ASC,
      score DESC,
      created_at ASC,
      id ASC
    LIMIT ?
  `).all(companyId, ...sources, args.minScore, args.limit);
}

function writeQueueCsv(rows = [], fileName) {
  const columns = [
    "id",
    "name",
    "property_type",
    "city",
    "county",
    "phone",
    "whatsapp_phone",
    "email",
    "website",
    "google_place_id",
    "source",
    "status",
    "score",
    "preferred_channel",
    "next_follow_up_at",
    "detail_url"
  ];
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n");

  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "outreach");
  fs.mkdirSync(reportDir, { recursive: true });
  const filePath = path.join(reportDir, fileName);
  fs.writeFileSync(filePath, `${csv}\n`, "utf8");
  return filePath;
}

function writeQueueReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "outreach");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `travel-outreach-queue-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function prepareQueue(companyId, args) {
  const candidates = loadCandidates(companyId, args);
  const prepared = candidates.map((lead, index) => ({
    ...lead,
    preferred_channel: preferredChannel(lead),
    next_follow_up_at: followUpAt(index, args.dailyLimit, args.startDays),
    detail_url: `/nexora/travel/leads/${lead.id}`
  }));

  if (!args.dryRun && prepared.length) {
    const updateLead = db.prepare(`
      UPDATE travel_leads
      SET next_follow_up_at=?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `);
    const insertActivity = db.prepare(`
      INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
      VALUES (?, ?, 'outreach_queued', 'Lead prioritizat pentru outreach', ?, datetime('now'))
    `);

    const run = db.transaction((rows) => {
      for (const row of rows) {
        updateLead.run(row.next_follow_up_at, row.id, companyId);
        insertActivity.run(
          companyId,
          row.id,
          `Sursă ${row.source || "-"}; score ${row.score ?? 0}; canal recomandat ${row.preferred_channel}; follow-up ${row.next_follow_up_at}`
        );
      }
    });
    run(prepared);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = writeQueueCsv(prepared, `travel-outreach-queue-${timestamp}.csv`);

  return {
    dry_run: args.dryRun,
    source: args.source,
    sources: parseSources(args.source),
    min_score: args.minScore,
    limit: args.limit,
    daily_limit: args.dailyLimit,
    queued: prepared.length,
    csv_path: csvPath,
    first_follow_up_at: prepared[0]?.next_follow_up_at || null,
    last_follow_up_at: prepared.at(-1)?.next_follow_up_at || null,
    channels: prepared.reduce((acc, row) => {
      acc[row.preferred_channel] = (acc[row.preferred_channel] || 0) + 1;
      return acc;
    }, {})
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();

  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");

  const report = {
    company_id: company.id,
    company_name: company.name,
    ...prepareQueue(company.id, args)
  };
  report.report_path = writeQueueReport(report);

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
