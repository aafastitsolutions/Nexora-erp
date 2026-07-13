import dotenv from "dotenv";
import { db, migrate } from "../db.js";
import { syncTravelEmailReplies, travelEmailSyncConfig } from "../lib/travel-email-sync.js";

dotenv.config();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function maskEmail(value = "") {
  const email = String(value || "").trim();
  const at = email.indexOf("@");
  if (at <= 1) return email ? "***" : "";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

async function main() {
  migrate();
  const company = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  const companyId = Number(company?.id || 0);
  if (!companyId) throw new Error("Nu am găsit companie activă.");

  const config = travelEmailSyncConfig();
  const result = await syncTravelEmailReplies({
    db,
    companyId,
    sinceDays: Number(argValue("--since-days", 30)) || 30,
    limit: Number(argValue("--limit", 80)) || 80
  });

  console.log(JSON.stringify({
    ...result,
    mailbox: maskEmail(result.mailbox || config.user || "")
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
