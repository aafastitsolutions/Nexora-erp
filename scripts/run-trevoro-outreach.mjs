#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { db } from "../db.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";

dotenv.config();

const DEFAULT_ROMANIA_LIMIT = 200;
const DEFAULT_INTERNATIONAL_LIMIT = 100;
const DEFAULT_LOCAL_LIMIT = 0;
const DEFAULT_SOURCE = "all";
const DEFAULT_MIN_SCORE = 40;
const DEFAULT_DELAY_MS = 45000;
const DEFAULT_DAILY_QUOTA = 800;

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

function getCompanyId() {
  return Number(db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()?.id || 0);
}

function sentToday(companyId) {
  return Number(db.prepare(`
    SELECT COUNT(*) AS n
    FROM travel_email_messages
    WHERE company_id=?
      AND direction='outbound'
      AND date(received_at)=date('now')
  `).get(companyId)?.n || 0);
}

function remainingDailyQuota(companyId, dailyQuota = 0) {
  const quota = Number(dailyQuota || 0);
  if (!quota) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, quota - sentToday(companyId));
}

function parseJsonOutput(value = "") {
  const text = safeText(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
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
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.slice(0, 12000),
        stderr: stderr.slice(0, 12000),
        parsed: parseJsonOutput(stdout)
      });
    });
  });
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "outreach");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `trevoro-outreach-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  exitIfTrevoroEmailSendingPaused("scripts/run-trevoro-outreach.mjs");
  const dryRun = hasFlag("--dry-run");
  const romaniaLimit = numericArg("--romania-limit", DEFAULT_ROMANIA_LIMIT, { min: 0 });
  const internationalLimit = numericArg("--international-limit", DEFAULT_INTERNATIONAL_LIMIT, { min: 0 });
  const localLimit = numericArg("--local-limit", DEFAULT_LOCAL_LIMIT, { min: 0 });
  const source = safeText(argValue("--source", DEFAULT_SOURCE)) || DEFAULT_SOURCE;
  const minScore = numericArg("--min-score", DEFAULT_MIN_SCORE, { min: 0, max: 100 });
  const delayMs = numericArg("--delay-ms", DEFAULT_DELAY_MS, { min: 0 });
  const romaniaFallbackFromInternational = !hasFlag("--no-romania-fallback-from-international");
  const dailyQuota = numericArg(
    "--daily-quota",
    process.env.TREVORO_SMTP_DAILY_QUOTA || process.env.SENDMACHINE_DAILY_QUOTA || DEFAULT_DAILY_QUOTA,
    { min: 0 }
  );
  const companyId = getCompanyId();
  if (!companyId) throw new Error("Nu am gasit companie activa.");

  const report = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    romania_limit: romaniaLimit,
    international_limit: internationalLimit,
    local_limit: localLimit,
    source,
    min_score: minScore,
    delay_ms: delayMs,
    romania_fallback_from_international: romaniaFallbackFromInternational,
    daily_quota: dailyQuota || null,
    sent_today_before: sentToday(companyId),
    steps: []
  };

  const stepLimit = (requestedLimit) => Math.min(Number(requestedLimit || 0), remainingDailyQuota(companyId, dailyQuota));

  let ownersOk = true;
  if (romaniaLimit > 0) {
    const romaniaSendLimit = stepLimit(romaniaLimit);
    if (romaniaSendLimit <= 0) {
      report.steps.push({
        name: "owners_romania",
        ok: true,
        skipped: true,
        reason: "daily_quota_exhausted",
        requested_send_limit: romaniaLimit,
        planned_send_limit: 0
      });
    } else {
      const romaniaArgs = [
        "lib/trevoro-outreach-sender.mjs",
        "--limit",
        String(romaniaSendLimit),
        "--source",
        source,
        "--country",
        "Romania",
        "--min-score",
        String(minScore),
        "--allow-partial",
        "--stop-on-throttle",
        "--delay-ms",
        String(delayMs)
      ];
      if (dryRun) romaniaArgs.push("--dry-run");
      const romania = await runNode(romaniaArgs);
      ownersOk = ownersOk && romania.ok;
      report.steps.push({
        name: "owners_romania",
        ok: romania.ok,
        requested_send_limit: romaniaLimit,
        planned_send_limit: romaniaSendLimit,
        parsed: romania.parsed,
        stderr: romania.stderr || undefined,
        stdout: romania.parsed ? undefined : romania.stdout
      });
    }
  }

  if (internationalLimit > 0 && ownersOk) {
    const internationalSendLimit = stepLimit(internationalLimit);
    if (internationalSendLimit <= 0) {
      report.steps.push({
        name: "owners_international",
        ok: true,
        skipped: true,
        reason: "daily_quota_exhausted",
        requested_send_limit: internationalLimit,
        planned_send_limit: 0
      });
    } else {
      const internationalArgs = [
        "lib/trevoro-outreach-sender.mjs",
        "--limit",
        String(internationalSendLimit),
        "--source",
        source,
        "--international",
        "--min-score",
        String(minScore),
        "--allow-partial",
        "--stop-on-throttle",
        "--delay-ms",
        String(delayMs)
      ];
      if (dryRun) internationalArgs.push("--dry-run");
      const international = await runNode(internationalArgs);
      ownersOk = ownersOk && international.ok;
      report.steps.push({
        name: "owners_international",
        ok: international.ok,
        requested_send_limit: internationalLimit,
        planned_send_limit: internationalSendLimit,
        parsed: international.parsed,
        stderr: international.stderr || undefined,
        stdout: international.parsed ? undefined : international.stdout
      });

      const internationalSent = Number(international.parsed?.sent || 0);
      const romaniaFallbackLimit = romaniaFallbackFromInternational
        ? Math.max(0, internationalLimit - internationalSent)
        : 0;
      if (ownersOk && romaniaFallbackLimit > 0) {
        const romaniaFallbackSendLimit = stepLimit(romaniaFallbackLimit);
        if (romaniaFallbackSendLimit <= 0) {
          report.steps.push({
            name: "owners_romania_fallback",
            ok: true,
            skipped: true,
            reason: "daily_quota_exhausted",
            requested_send_limit: romaniaFallbackLimit,
            planned_send_limit: 0
          });
        } else {
          const romaniaFallbackArgs = [
            "lib/trevoro-outreach-sender.mjs",
            "--limit",
            String(romaniaFallbackSendLimit),
            "--source",
            source,
            "--country",
            "Romania",
            "--min-score",
            String(minScore),
            "--allow-partial",
            "--stop-on-throttle",
            "--delay-ms",
            String(delayMs)
          ];
          if (dryRun) romaniaFallbackArgs.push("--dry-run");
          const romaniaFallback = await runNode(romaniaFallbackArgs);
          ownersOk = ownersOk && romaniaFallback.ok;
          report.steps.push({
            name: "owners_romania_fallback",
            ok: romaniaFallback.ok,
            requested_send_limit: romaniaFallbackLimit,
            planned_send_limit: romaniaFallbackSendLimit,
            reason: "international_shortfall",
            parsed: romaniaFallback.parsed,
            stderr: romaniaFallback.stderr || undefined,
            stdout: romaniaFallback.parsed ? undefined : romaniaFallback.stdout
          });
        }
      }
    }
  }

  const sentAfterOwners = sentToday(companyId);
  const remainingQuota = dailyQuota > 0 ? Math.max(0, dailyQuota - sentAfterOwners) : localLimit;
  const localSendLimit = Math.min(localLimit, remainingQuota);
  report.steps.push({
    name: "local_partners",
    ok: true,
    skipped: true,
    reason: localLimit > 0 ? "disabled_in_single_owner_outreach_job" : "not_requested",
    planned_send_limit: localSendLimit
  });

  report.finished_at = new Date().toISOString();
  report.sent_today_after = sentToday(companyId);
  report.remaining_quota_after = dailyQuota > 0 ? Math.max(0, dailyQuota - report.sent_today_after) : null;
  report.ok = report.steps.every((step) => step.ok);
  report.report_path = writeReport(report);

  console.log(JSON.stringify({
    ok: report.ok,
    dryRun,
    reportPath: report.report_path,
    sentTodayBefore: report.sent_today_before,
    sentTodayAfter: report.sent_today_after,
    remainingQuotaAfter: report.remaining_quota_after,
    steps: report.steps.map((step) => ({
      name: step.name,
      ok: step.ok,
      skipped: step.skipped || false,
      reason: step.reason || undefined,
      plannedSendLimit: step.planned_send_limit || undefined
    }))
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    const reportPath = writeReport({
      started_at: new Date().toISOString(),
      ok: false,
      error: error?.message || String(error)
    });
    console.error(`${error?.message || error}\nreport: ${reportPath}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
