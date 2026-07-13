#!/usr/bin/env node
import dotenv from "dotenv";
import { db } from "../db.js";
import { syncEuOpportunityFinder } from "../lib/procurement-opportunities.js";

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
  const row = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(row?.id || 0);
}

async function main() {
  const companyId = Number(argValue("--company-id", "")) || companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  const limit = Math.max(5, Number(argValue("--limit", "40")) || 40);
  const sourceLimit = Math.max(1, Number(argValue("--source-limit", "200")) || 200);
  const source = argValue("--source", "");
  const dueOnly = hasFlag("--due-only");

  const results = await syncEuOpportunityFinder(db, companyId, {
    limit,
    sourceLimit,
    source,
    dueOnly
  });
  console.log(JSON.stringify({
    companyId,
    limit,
    sourceLimit,
    source,
    dueOnly,
    results
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
