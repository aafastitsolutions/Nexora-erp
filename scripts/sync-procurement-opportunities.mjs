import { db } from "../db.js";
import { syncProcurementOpportunities } from "../lib/procurement-opportunities.js";

function parseArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

const companyId = Number(parseArg("--company-id", "1") || 1);
const limit = Number(parseArg("--limit", "150") || 150);
const publicationDays = Number(parseArg("--publication-days", "30") || 30);

const results = await syncProcurementOpportunities(db, companyId, { limit, publicationDays });
console.log(JSON.stringify({ companyId, results }, null, 2));
