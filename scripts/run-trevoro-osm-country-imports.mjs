#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const COUNTRY_TARGETS = {
  Albania: 1200,
  Andorra: 300,
  Austria: 900,
  Belgium: 700,
  "Bosnia and Herzegovina": 900,
  Bulgaria: 1200,
  Croatia: 1200,
  Cyprus: 1200,
  Czechia: 700,
  Denmark: 600,
  Egypt: 1500,
  Argentina: 900,
  Bahamas: 500,
  Brazil: 1200,
  Canada: 900,
  "Cape Verde": 400,
  Chile: 700,
  Colombia: 900,
  "Costa Rica": 700,
  Cuba: 600,
  "Dominican Republic": 700,
  Estonia: 500,
  Finland: 500,
  France: 1200,
  Germany: 1200,
  Greece: 1500,
  Hungary: 800,
  Iceland: 500,
  India: 1200,
  Indonesia: 1200,
  Ireland: 700,
  Italy: 1200,
  Jamaica: 500,
  Japan: 1200,
  Kenya: 700,
  Kosovo: 500,
  Latvia: 500,
  Liechtenstein: 200,
  Lithuania: 500,
  Luxembourg: 300,
  Madagascar: 500,
  Malaysia: 900,
  Maldives: 600,
  Malta: 1000,
  Mauritius: 400,
  Mexico: 1200,
  Moldova: 500,
  Monaco: 200,
  Montenegro: 1000,
  Morocco: 900,
  Namibia: 500,
  Netherlands: 700,
  "North Macedonia": 700,
  Norway: 600,
  Panama: 600,
  Peru: 700,
  Philippines: 900,
  Poland: 900,
  Portugal: 1200,
  Romania: 0,
  "San Marino": 200,
  Serbia: 900,
  Seychelles: 400,
  Singapore: 500,
  Slovakia: 700,
  Slovenia: 700,
  "South Africa": 900,
  "South Korea": 800,
  Spain: 1200,
  "Sri Lanka": 800,
  Sweden: 600,
  Switzerland: 900,
  Tanzania: 700,
  Thailand: 1200,
  Tunisia: 700,
  Turkey: 1500,
  Ukraine: 700,
  "United Arab Emirates": 700,
  "United Kingdom": 1200,
  "United States": 1500,
  Vietnam: 1000
};

const ASIA_COUNTRIES = [
  "Thailand",
  "Indonesia",
  "Japan",
  "Vietnam",
  "Malaysia",
  "Singapore",
  "United Arab Emirates",
  "India",
  "Sri Lanka",
  "Maldives",
  "Philippines",
  "South Korea"
];

const AFRICA_COUNTRIES = [
  "Egypt",
  "Morocco",
  "Tunisia",
  "South Africa",
  "Kenya",
  "Tanzania",
  "Seychelles",
  "Mauritius",
  "Cape Verde",
  "Madagascar",
  "Namibia"
];

const AMERICA_COUNTRIES = [
  "Mexico",
  "Dominican Republic",
  "Costa Rica",
  "Brazil",
  "Argentina",
  "Colombia",
  "Peru",
  "Chile",
  "Canada",
  "Cuba",
  "Jamaica",
  "Bahamas",
  "Panama",
  "United States"
];

const COUNTRY_ORDER = [
  ...ASIA_COUNTRIES,
  ...AFRICA_COUNTRIES,
  ...AMERICA_COUNTRIES,
  "Cyprus",
  "Malta",
  "Greece",
  "Bulgaria",
  "Turkey",
  "Croatia",
  "Montenegro",
  "Albania",
  "Portugal",
  "Spain",
  "Italy",
  "France",
  "Austria",
  "Germany",
  "United Kingdom",
  "Ireland",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Slovenia",
  "Serbia",
  "Bosnia and Herzegovina",
  "North Macedonia",
  "Kosovo",
  "Hungary",
  "Czechia",
  "Slovakia",
  "Poland",
  "Moldova",
  "Denmark",
  "Sweden",
  "Norway",
  "Finland",
  "Iceland",
  "Estonia",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Andorra",
  "Monaco",
  "San Marino",
  "Liechtenstein",
  "Ukraine"
];

const COUNTRY_GROUPS = {
  priority: COUNTRY_ORDER.slice(0, 16),
  asia: ASIA_COUNTRIES,
  africa: AFRICA_COUNTRIES,
  america: AMERICA_COUNTRIES,
  americas: AMERICA_COUNTRIES,
  "global-tourism": [...ASIA_COUNTRIES, ...AFRICA_COUNTRIES, ...AMERICA_COUNTRIES],
  "new-tourist": [...ASIA_COUNTRIES, ...AFRICA_COUNTRIES, ...AMERICA_COUNTRIES]
};

const SMALL_COUNTRIES = new Set([
  "Andorra",
  "Liechtenstein",
  "Luxembourg",
  "Malta",
  "Monaco",
  "Seychelles",
  "Singapore",
  "San Marino"
]);

const LARGE_COUNTRIES = new Set([
  "Argentina",
  "Brazil",
  "Canada",
  "Egypt",
  "France",
  "Germany",
  "Greece",
  "India",
  "Indonesia",
  "Italy",
  "Japan",
  "Mexico",
  "Poland",
  "Spain",
  "Thailand",
  "Turkey",
  "Ukraine",
  "United Kingdom",
  "United States"
]);

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

function parseList(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countRows(country) {
  return db.prepare("SELECT COUNT(*) AS count FROM travel_leads WHERE country=?").get(country)?.count || 0;
}

function contactStats(country) {
  return db.prepare(`
    SELECT
      COUNT(*) AS count,
      SUM(CASE WHEN email IS NOT NULL AND email<>'' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN phone IS NOT NULL AND phone<>'' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN website IS NOT NULL AND website<>'' THEN 1 ELSE 0 END) AS with_website
    FROM travel_leads
    WHERE country=?
  `).get(country);
}

function parseJsonFromOutput(output = "") {
  const marker = output.lastIndexOf("\n{");
  const start = marker >= 0 ? marker + 1 : output.indexOf("{");
  if (start < 0) return null;
  const candidate = output.slice(start).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function gridForCountry(country, defaultRows, defaultCols) {
  if (SMALL_COUNTRIES.has(country)) return { rows: 1, cols: 1 };
  if (LARGE_COUNTRIES.has(country)) return { rows: Math.max(defaultRows, 5), cols: Math.max(defaultCols, 5) };
  return { rows: defaultRows, cols: defaultCols };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runImport({ country, limit, rows, cols, timeoutMs, maxCells, endpoint, preset, spreadHotspots, dryRun }) {
  return new Promise((resolve) => {
    const args = [
      "scripts/import-osm-travel-leads.mjs",
      `--country=${country}`,
      `--rows=${rows}`,
      `--cols=${cols}`,
      `--limit=${limit}`,
      `--timeout-ms=${timeoutMs}`
    ];
    if (maxCells) args.push(`--max-cells=${maxCells}`);
    if (endpoint) args.push(`--endpoint=${endpoint}`);
    if (preset) args.push(`--preset=${preset}`);
    if (spreadHotspots) args.push("--spread-hotspots");
    if (dryRun) args.push("--dry-run");

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        code,
        stats: parseJsonFromOutput(stdout),
        stderr: stderr.trim(),
        stdoutTail: stdout.trim().split("\n").slice(-12).join("\n")
      });
    });
  });
}

function writeAggregateReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `osm-multi-country-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  migrate();

  const countryArg = argValue("--countries", "priority");
  const countries = countryArg === "all"
    ? COUNTRY_ORDER
    : COUNTRY_GROUPS[countryArg]
      ? COUNTRY_GROUPS[countryArg]
      : parseList(countryArg);
  const defaultRows = Math.max(1, Number(argValue("--rows", "4")) || 4);
  const defaultCols = Math.max(1, Number(argValue("--cols", "4")) || 4);
  const timeoutMs = Math.max(10_000, Number(argValue("--timeout-ms", "90000")) || 90_000);
  const delayMs = Math.max(0, Number(argValue("--delay-ms", "1500")) || 0);
  const maxCells = Math.max(0, Number(argValue("--max-cells", "0")) || 0);
  const endpoint = argValue("--endpoint", "");
  const preset = argValue("--preset", "");
  const spreadHotspots = hasArg("--spread-hotspots");
  const dryRun = hasArg("--dry-run");
  const targetOverride = Number(argValue("--target", "0")) || 0;
  const maxPerCountry = Math.max(0, Number(argValue("--max-per-country", "0")) || 0);

  const report = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    countries_requested: countries,
    default_rows: defaultRows,
    default_cols: defaultCols,
    timeout_ms: timeoutMs,
    delay_ms: delayMs,
    max_cells: maxCells || null,
    endpoint: endpoint || null,
    preset: preset || null,
    spread_hotspots: spreadHotspots,
    target_override: targetOverride || null,
    max_per_country: maxPerCountry || null,
    results: []
  };

  for (const country of countries) {
    const before = countRows(country);
    const target = targetOverride || COUNTRY_TARGETS[country] || 500;
    if (!target) {
      report.results.push({ country, status: "skipped", reason: "target_zero", before, target });
      console.log(`[skip] ${country}: target 0, existing ${before}`);
      continue;
    }
    let limit = Math.max(0, target - before);
    if (maxPerCountry) limit = Math.min(limit, maxPerCountry);
    if (!limit) {
      report.results.push({ country, status: "skipped", reason: "target_reached", before, target });
      console.log(`[skip] ${country}: existing ${before} >= target ${target}`);
      continue;
    }

    const { rows, cols } = gridForCountry(country, defaultRows, defaultCols);
    console.log(`[import] ${country}: existing ${before}, target ${target}, limit ${limit}, grid ${rows}x${cols}`);
    const startedAt = new Date().toISOString();
    const run = await runImport({ country, limit, rows, cols, timeoutMs, maxCells, endpoint, preset, spreadHotspots, dryRun });
    const after = countRows(country);
    const finalStats = contactStats(country);
    const result = {
      country,
      status: run.code === 0 ? "completed" : "failed",
      code: run.code,
      before,
      after,
      added: Math.max(0, after - before),
      target,
      limit,
      rows,
      cols,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      import_stats: run.stats,
      final_stats: finalStats,
      stderr: run.stderr,
      stdout_tail: run.stdoutTail
    };
    report.results.push(result);
    console.log(`[done] ${country}: added ${result.added}, total ${after}, email ${finalStats.with_email || 0}, phone ${finalStats.with_phone || 0}, website ${finalStats.with_website || 0}`);

    if (delayMs) await wait(delayMs);
  }

  report.finished_at = new Date().toISOString();
  report.total_added = report.results.reduce((sum, item) => sum + Number(item.added || 0), 0);
  report.report_path = writeAggregateReport(report);
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
