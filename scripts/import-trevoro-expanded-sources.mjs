#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

dotenv.config();

const DEFAULT_COUNTRIES = [
  "Croatia",
  "Slovenia",
  "Serbia",
  "Bosnia and Herzegovina",
  "Cyprus",
  "Portugal",
  "France",
  "Turkey",
  "Switzerland",
  "Belgium",
  "Netherlands",
  "Poland",
  "Czechia",
  "Slovakia",
  "Ireland",
  "United Kingdom"
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
  return String(value || "").trim();
}

function numericArg(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(argValue(name, fallback));
  const value = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(min, Math.min(max, value));
}

function parseCountries(value = "") {
  const raw = safeText(value);
  if (!raw) return DEFAULT_COUNTRIES;
  return raw.split(",").map(safeText).filter(Boolean);
}

function parseJsonOutput(value = "") {
  const text = safeText(value);
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function runNode(args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        parsed: parseJsonOutput(stdout),
        stdout: stdout.slice(-12000),
        stderr: stderr.slice(-12000)
      });
    });
  });
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `trevoro-expanded-sources-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const countries = parseCountries(argValue("--countries", ""));
  const countryLimit = numericArg("--country-limit", 200, { min: 0 });
  const rows = numericArg("--rows", 8, { min: 1, max: 20 });
  const cols = numericArg("--cols", 8, { min: 1, max: 20 });
  const timeoutMs = numericArg("--timeout-ms", 90000, { min: 10000 });
  const publicLimit = numericArg("--public-limit", 600, { min: 0 });
  const publicSeedLimit = numericArg("--public-seed-limit", 30, { min: 0 });
  const publicDetailLimit = numericArg("--public-detail-limit", 250, { min: 0 });
  const publicDelayMs = numericArg("--public-delay-ms", 2500, { min: 0 });

  const report = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    countries,
    country_limit: countryLimit,
    rows,
    cols,
    timeout_ms: timeoutMs,
    public_limit: publicLimit,
    runs: []
  };

  for (const country of countries) {
    const args = [
      "scripts/import-osm-travel-leads.mjs",
      `--country=${country}`,
      `--limit=${countryLimit}`,
      `--rows=${rows}`,
      `--cols=${cols}`,
      `--timeout-ms=${timeoutMs}`
    ];
    if (dryRun) args.push("--dry-run");
    console.log(`\n=== Import OSM ${country} ===`);
    const result = await runNode(args);
    report.runs.push({
      type: "osm",
      country,
      ok: result.ok,
      code: result.code,
      created: Number(result.parsed?.created || 0),
      normalized: Number(result.parsed?.normalized || 0),
      fetched: Number(result.parsed?.fetched || 0),
      report_path: result.parsed?.report_path || "",
      errors: result.parsed?.errors || [],
      stderr: result.ok ? undefined : result.stderr
    });
  }

  if (publicLimit > 0) {
    const args = [
      "scripts/import-public-tourism-directory-leads.mjs",
      "--source=all",
      `--limit=${publicLimit}`,
      `--seed-limit=${publicSeedLimit}`,
      `--detail-limit-per-source=${publicDetailLimit}`,
      `--delay-ms=${publicDelayMs}`
    ];
    if (dryRun) args.push("--dry-run");
    console.log("\n=== Import public Romania directories ===");
    const result = await runNode(args);
    report.runs.push({
      type: "public_romania_directories",
      ok: result.ok,
      code: result.code,
      created: Number(result.parsed?.created || 0),
      normalized: Number(result.parsed?.normalized || 0),
      fetched: Number(result.parsed?.fetched || 0),
      report_path: result.parsed?.report_path || "",
      stderr: result.ok ? undefined : result.stderr
    });
  }

  report.finished_at = new Date().toISOString();
  report.ok = report.runs.every((run) => run.ok);
  report.created_total = report.runs.reduce((sum, run) => sum + Number(run.created || 0), 0);
  report.report_path = writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const reportPath = writeReport({
    started_at: new Date().toISOString(),
    ok: false,
    error: error?.message || String(error)
  });
  console.error(`${error?.message || error}\nreport: ${reportPath}`);
  process.exitCode = 1;
});
