import fs from "fs";
import { db } from "../db.js";

const RUNTIME_ENV_PATH = "/home/server/.config/nexora/runtime.env";
const PAGE_ID = "1164872880043948";

function parseEnvFile(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

async function readStdin() {
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value.trim().replace(/\s+/g, "");
}

async function graphGet(path, params) {
  const url = new URL(`https://graph.facebook.com/v25.0/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Facebook API error ${response.status}`);
  }
  return payload;
}

function scheduleFacebookBacklog(pageAccountId) {
  const spacingMinutes = Math.max(
    5,
    Number(process.env.TREVORO_FACEBOOK_BACKLOG_SPACING_MINUTES || process.env.TREVORO_SOCIAL_BACKLOG_SPACING_MINUTES || 30) || 30
  );
  const jobs = db.prepare(`
    SELECT id, social_post_id
    FROM travel_social_publish_jobs
    WHERE platform='facebook' AND status='manual_required'
    ORDER BY COALESCE(scheduled_at, created_at) ASC, id ASC
  `).all();
  const timeFor = db.prepare(`SELECT datetime('now', ?) AS scheduled_at`);
  const updateJob = db.prepare(`
    UPDATE travel_social_publish_jobs
    SET status='queued',
        account_id=?,
        scheduled_at=?,
        error='',
        updated_at=datetime('now')
    WHERE id=?
  `);
  const updatePost = db.prepare(`
    UPDATE travel_social_posts
    SET status='scheduled',
        scheduled_at=?,
        updated_at=datetime('now')
    WHERE id=?
  `);

  for (const [index, job] of jobs.entries()) {
    const scheduledAt = timeFor.get(`+${index * spacingMinutes} minutes`)?.scheduled_at || "";
    updateJob.run(pageAccountId, scheduledAt, job.id);
    updatePost.run(scheduledAt, job.social_post_id);
  }
  return jobs.length;
}

try {
  const userToken = await readStdin();
  if (!userToken || userToken.length < 50) throw new Error("Tokenul pare gol sau prea scurt.");

  const env = parseEnvFile(RUNTIME_ENV_PATH);
  const appId = env.FACEBOOK_CLIENT_ID || "";
  const appSecret = env.FACEBOOK_CLIENT_SECRET || "";
  if (!appId || !appSecret) throw new Error("Lipsește FACEBOOK_CLIENT_ID sau FACEBOOK_CLIENT_SECRET.");

  const debugPayload = await graphGet("debug_token", {
    input_token: userToken,
    access_token: `${appId}|${appSecret}`
  });
  if (!debugPayload?.data?.is_valid) throw new Error("Token invalid la debug_token.");
  const scopes = debugPayload.data.scopes || [];
  console.log(`Token valid: ${debugPayload.data.type || "unknown"} ${scopes.join(", ")}`);

  if (debugPayload.data.type === "PAGE") {
    const pagePayload = await graphGet("me", {
      fields: "id,name",
      access_token: userToken
    });
    if (String(pagePayload.id) !== PAGE_ID) {
      throw new Error(`Tokenul este pentru pagina ${pagePayload.name || ""} ${pagePayload.id || ""}, nu pentru Trevoro ${PAGE_ID}.`);
    }

    const result = db.prepare(`
      UPDATE travel_social_accounts
      SET account_name=?,
          account_handle=?,
          external_id=?,
          page_id=?,
          posting_mode='api',
          auto_publish=1,
          access_token=?,
          scopes=?,
          status='active',
          last_sync_at=datetime('now'),
          updated_at=datetime('now')
      WHERE platform='facebook'
    `).run(
      pagePayload.name || "Trevoro",
      `facebook.com/${PAGE_ID}`,
      PAGE_ID,
      PAGE_ID,
      userToken,
      scopes.join(",")
    );
    if (!result.changes) throw new Error("Contul Facebook nu exista in Nexora.");

    const account = db.prepare(`SELECT id FROM travel_social_accounts WHERE platform='facebook' LIMIT 1`).get();
    const queued = scheduleFacebookBacklog(account.id);

    console.log(`PAGE_FOUND=${pagePayload.name} ${pagePayload.id}`);
    console.log(`Nexora Facebook activat. Joburi mutate in coada: ${queued}`);
    process.exit(0);
  }

  const pagesPayload = await graphGet("me/accounts", {
    fields: "id,name,access_token,tasks",
    access_token: userToken
  });
  const pages = pagesPayload.data || [];
  console.log(`Pagini gasite: ${pages.map((page) => `${page.name} ${page.id}`).join(", ") || "niciuna"}`);

  const page = pages.find((item) => String(item.id) === PAGE_ID);
  if (!page?.access_token) {
    const missingBusinessManagement = !scopes.includes("business_management");
    if (!pages.length && missingBusinessManagement) {
      throw new Error("Pagina Trevoro nu a venit in /me/accounts. Genereaza un token nou si adauga si permisiunea business_management, pe langa pages_show_list, pages_read_engagement si pages_manage_posts.");
    }
    throw new Error("Pagina Trevoro nu a fost gasita sau nu are access_token. Regenereaza tokenul si selecteaza explicit pagina Trevoro in popup.");
  }

  const result = db.prepare(`
    UPDATE travel_social_accounts
    SET account_name=?,
        account_handle=?,
        external_id=?,
        page_id=?,
        posting_mode='api',
        auto_publish=1,
        access_token=?,
        scopes=?,
        status='active',
        last_sync_at=datetime('now'),
        updated_at=datetime('now')
    WHERE platform='facebook'
  `).run(
    page.name || "Trevoro",
    `facebook.com/${PAGE_ID}`,
    PAGE_ID,
    PAGE_ID,
    page.access_token,
    scopes.join(",")
  );
  if (!result.changes) throw new Error("Contul Facebook nu exista in Nexora.");

  const account = db.prepare(`SELECT id FROM travel_social_accounts WHERE platform='facebook' LIMIT 1`).get();
  const queued = scheduleFacebookBacklog(account.id);

  console.log(`PAGE_FOUND=${page.name} ${page.id}`);
  console.log(`Nexora Facebook activat. Joburi mutate in coada: ${queued}`);
} catch (error) {
  console.error(error?.message || "Salvarea tokenului Facebook a eșuat.");
  process.exitCode = 1;
} finally {
  db.close();
}
