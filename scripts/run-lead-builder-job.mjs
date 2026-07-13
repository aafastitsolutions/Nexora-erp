#!/usr/bin/env node
import dotenv from "dotenv";
import { db } from "../db.js";
import {
  createLeadBuilderJob,
  ensureLeadBuilderSchema,
  ensurePilotPrahovaCampaign,
  runLeadBuilderJob,
  seedLeadBuilderDefaults,
  safeText
} from "../lib/lead-builder.js";

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

function companyIdFromDb() {
  const explicit = Number(argValue("--company-id", "0"));
  if (explicit) return explicit;
  const active = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  if (active?.id) return Number(active.id);
  return Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
}

async function main() {
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie pentru Lead Builder.");
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);

  let searchId = Number(argValue("--search-id", "0"));
  if (hasFlag("--pilot-prahova")) {
    const pilot = ensurePilotPrahovaCampaign(db, companyId, "lead-builder-cli");
    searchId = Number(pilot.search?.id || searchId);
  }
  if (!searchId) {
    const latest = db.prepare(`
      SELECT id
      FROM lead_searches
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId);
    searchId = Number(latest?.id || 0);
  }
  if (!searchId) throw new Error("Nu exista cautare Lead Builder. Foloseste --pilot-prahova sau creeaza una din UI.");

  const maxResults = Number(argValue("--max-results", "0"));
  if (Number.isFinite(maxResults) && maxResults > 0) {
    db.prepare("UPDATE lead_searches SET max_results=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(Math.max(1, Math.min(5000, maxResults)), searchId, companyId);
  }

  let jobId = Number(argValue("--job-id", "0"));
  if (!jobId) {
    const job = createLeadBuilderJob(db, companyId, searchId, "search_companies", "lead-builder-cli");
    jobId = Number(job?.id || 0);
  }
  if (!jobId) throw new Error("Nu am putut crea jobul Lead Builder.");

  if (hasFlag("--no-run")) {
    console.log(JSON.stringify({ ok: true, companyId, searchId, jobId, queued: true }, null, 2));
    return;
  }

  const result = await runLeadBuilderJob(db, jobId);
  console.log(JSON.stringify({ companyId, searchId, jobId, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(safeText(error?.message || error));
    process.exitCode = 1;
  })
  .finally(() => db.close());
