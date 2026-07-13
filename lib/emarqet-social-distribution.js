const SOCIAL_ACCOUNT_STATUSES = new Set(["setup_required", "active", "paused"]);
const SOCIAL_POST_STATUSES = new Set(["draft", "ready", "scheduled", "published", "failed"]);
const SOCIAL_JOB_STATUSES = new Set(["queued", "manual_required", "published", "failed"]);
const SOCIAL_TARGET_TYPES = new Set(["page", "group", "marketplace", "profile"]);
const SOCIAL_TARGET_JOIN_STATUSES = new Set(["de_verificat", "requested", "joined", "rejected", "left", "not_applicable"]);
const SOCIAL_TARGET_RULE_STATUSES = new Set(["de_verificat", "permis", "interzis", "doar_recomandari", "fara_linkuri"]);
const MANUAL_GROUP_DISCOVERY_URLS = new Set([
  "https://www.facebook.com/groups/feed/",
  "https://www.facebook.com/search/groups/?q=auto%20romania",
  "https://www.facebook.com/search/groups/?q=masini%20de%20vanzare%20romania",
  "https://www.facebook.com/search/groups/?q=imobiliare%20romania",
  "https://www.facebook.com/search/groups/?q=apartamente%20de%20vanzare%20inchiriat",
  "https://www.facebook.com/search/groups/?q=locuri%20de%20munca%20romania",
  "https://www.facebook.com/search/groups/?q=electronice%20telefoane%20romania",
  "https://www.facebook.com/search/groups/?q=servicii%20locale%20romania",
  "https://www.facebook.com/search/groups/?q=marketplace%20bucuresti",
  "https://www.facebook.com/search/groups/?q=vanzari%20cumparari%20bucuresti",
  "https://www.facebook.com/search/groups/?q=vanzari%20cumparari%20prahova"
]);

function safeText(value = "") {
  return String(value || "").trim();
}

function oneOf(value = "", allowed = new Set(), fallback = "") {
  const normalized = safeText(value);
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeInt(value = 0, fallback = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeFacebookGroupUrl(value = "") {
  const raw = safeText(value).replace(/[)\].,;]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

function groupNameFromUrl(url = "", index = 1) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const groupIndex = parts.findIndex((part) => part.toLowerCase() === "groups");
    const slug = groupIndex >= 0 ? parts[groupIndex + 1] : parts.at(-1);
    const clean = safeText(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ");
    return clean ? `Grup ${clean}` : `Grup Facebook ${index}`;
  } catch {
    return `Grup Facebook ${index}`;
  }
}

function parseManualGroupLine(line = "", index = 1) {
  const raw = safeText(line);
  if (!raw) return null;
  const urlMatch = raw.match(/https?:\/\/[^\s|,;]+/i);
  const url = normalizeFacebookGroupUrl(urlMatch?.[0] || "");
  const pipeParts = raw.split("|").map((part) => safeText(part));
  let name = pipeParts.find((part) => part && !/^https?:\/\//i.test(part)) || raw;
  if (urlMatch?.[0]) name = name.replace(urlMatch[0], "");
  name = safeText(name.replace(/[|:;,]+/g, " ").replace(/\s+-\s+$/g, "").replace(/\s+/g, " "));
  if (!name && url) name = groupNameFromUrl(url, index);
  if (!name && !url) return null;
  return { name: name || `Grup Facebook ${index}`, url };
}

function publicBaseUrl() {
  return safeText(process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");
}

function publicListingUrl(row = {}) {
  const slug = safeText(row.slug || row.listing_code || row.id);
  const url = new URL(`/anunt/${encodeURIComponent(slug)}`, publicBaseUrl());
  url.searchParams.set("utm_source", "facebook");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "emarqet_social_distribution");
  url.searchParams.set("utm_content", safeText(row.listing_code || `listing_${row.id}`));
  return url.toString();
}

function absolutePublicUrl(value = "") {
  const raw = safeText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${publicBaseUrl()}${raw}`;
  return raw;
}

function fmtAmount(value, currency = "RON") {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Pret la cerere";
  const label = String(currency || "RON").toUpperCase() === "RON" ? "lei" : String(currency || "RON").toUpperCase();
  return `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${label}`;
}

function sqliteDateTime(value = "") {
  const raw = safeText(value);
  if (raw) {
    const normalized = raw.replace("T", " ").replace(/\.\d{3}Z$/, "").replace(/Z$/, "").slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized} 00:00:00`;
  }
  return new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function targetHandleFromEnv() {
  const pageId = safeText(process.env.EMARQET_FACEBOOK_PAGE_ID || process.env.FACEBOOK_PAGE_ID);
  return pageId ? `facebook.com/${pageId}` : "facebook.com/e-marqet";
}

export function ensureEmarqetSocialSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_social_accounts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      platform TEXT NOT NULL DEFAULT 'facebook',
      account_name TEXT NOT NULL,
      account_handle TEXT,
      external_id TEXT,
      page_id TEXT,
      posting_mode TEXT NOT NULL DEFAULT 'draft',
      auto_publish INTEGER NOT NULL DEFAULT 0,
      access_token TEXT,
      token_expires_at TEXT,
      scopes TEXT,
      profile_json TEXT,
      status TEXT NOT NULL DEFAULT 'setup_required',
      last_sync_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, platform, account_name)
    );

    CREATE TABLE IF NOT EXISTS emarqet_social_targets(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      platform TEXT NOT NULL DEFAULT 'facebook',
      target_type TEXT NOT NULL DEFAULT 'group',
      name TEXT NOT NULL,
      url TEXT,
      category TEXT,
      language TEXT,
      location TEXT,
      members_count INTEGER NOT NULL DEFAULT 0,
      join_status TEXT NOT NULL DEFAULT 'de_verificat',
      rules_status TEXT NOT NULL DEFAULT 'de_verificat',
      promotion_allowed INTEGER NOT NULL DEFAULT 0,
      marketplace_allowed INTEGER NOT NULL DEFAULT 0,
      posting_mode TEXT NOT NULL DEFAULT 'manual',
      frequency_limit_per_week INTEGER NOT NULL DEFAULT 1,
      last_post_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, platform, target_type, name)
    );

    CREATE TABLE IF NOT EXISTS emarqet_social_posts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      listing_id INTEGER,
      partner_profile_id INTEGER,
      social_target_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'facebook',
      target_type TEXT NOT NULL DEFAULT 'page',
      content_type TEXT NOT NULL DEFAULT 'listing_post',
      caption TEXT NOT NULL,
      hashtags TEXT,
      link_url TEXT,
      media_url TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      scheduled_at TEXT,
      published_at TEXT,
      external_post_id TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_social_publish_jobs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      social_post_id INTEGER NOT NULL,
      account_id INTEGER,
      social_target_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'facebook',
      target_type TEXT NOT NULL DEFAULT 'page',
      target_name TEXT,
      target_url TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      scheduled_at TEXT,
      published_at TEXT,
      external_post_id TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_social_manual_shares(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      social_post_id INTEGER NOT NULL,
      social_target_id INTEGER NOT NULL,
      group_name TEXT,
      group_url TEXT,
      status TEXT NOT NULL DEFAULT 'posted',
      posted_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, social_post_id, social_target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_social_accounts_company
      ON emarqet_social_accounts(company_id, platform, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_social_targets_company
      ON emarqet_social_targets(company_id, platform, target_type, join_status, promotion_allowed);
    CREATE INDEX IF NOT EXISTS idx_emarqet_social_posts_company
      ON emarqet_social_posts(company_id, platform, target_type, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_emarqet_social_jobs_company
      ON emarqet_social_publish_jobs(company_id, platform, status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_emarqet_manual_shares_post
      ON emarqet_social_manual_shares(company_id, social_post_id, status, posted_at);
    CREATE INDEX IF NOT EXISTS idx_emarqet_manual_shares_target
      ON emarqet_social_manual_shares(company_id, social_target_id, status, posted_at);
  `);
}

const DEFAULT_TARGETS = [
  {
    target_type: "page",
    name: "Pagina e-Marqet",
    url: targetHandleFromEnv(),
    category: "owned_page",
    language: "ro",
    location: "Romania",
    join_status: "not_applicable",
    rules_status: "permis",
    promotion_allowed: 1,
    posting_mode: "api",
    notes: "Publicare oficiala prin Meta Pages API dupa conectarea paginii."
  },
  {
    target_type: "marketplace",
    name: "Facebook Marketplace - publicare manuala",
    url: "https://www.facebook.com/marketplace/create/item",
    category: "marketplace",
    language: "ro",
    location: "Romania",
    join_status: "not_applicable",
    rules_status: "de_verificat",
    marketplace_allowed: 1,
    posting_mode: "manual",
    notes: "Marketplace se publica manual sau prin program de parteneriat Meta, nu prin bot."
  },
  ["Auto Romania - cautare grupuri", "auto", "https://www.facebook.com/search/groups/?q=auto%20romania", "Romania"],
  ["Masini de vanzare Romania - cautare grupuri", "auto", "https://www.facebook.com/search/groups/?q=masini%20de%20vanzare%20romania", "Romania"],
  ["Imobiliare Romania - cautare grupuri", "imobiliare", "https://www.facebook.com/search/groups/?q=imobiliare%20romania", "Romania"],
  ["Apartamente de vanzare/inchiriat - cautare grupuri", "imobiliare", "https://www.facebook.com/search/groups/?q=apartamente%20de%20vanzare%20inchiriat", "Romania"],
  ["Locuri de munca Romania - cautare grupuri", "joburi", "https://www.facebook.com/search/groups/?q=locuri%20de%20munca%20romania", "Romania"],
  ["Electronice si telefoane - cautare grupuri", "electronice", "https://www.facebook.com/search/groups/?q=electronice%20telefoane%20romania", "Romania"],
  ["Servicii locale Romania - cautare grupuri", "servicii", "https://www.facebook.com/search/groups/?q=servicii%20locale%20romania", "Romania"],
  ["Marketplace Bucuresti - cautare grupuri", "local", "https://www.facebook.com/search/groups/?q=marketplace%20bucuresti", "Bucuresti"],
  ["Vanzari cumparari Bucuresti - cautare grupuri", "local", "https://www.facebook.com/search/groups/?q=vanzari%20cumparari%20bucuresti", "Bucuresti"],
  ["Vanzari cumparari Prahova - cautare grupuri", "local", "https://www.facebook.com/search/groups/?q=vanzari%20cumparari%20prahova", "Prahova"]
];

export function seedEmarqetSocialDefaults(db, companyId) {
  ensureEmarqetSocialSchema(db);
  const account = db.prepare(`
    SELECT id
    FROM emarqet_social_accounts
    WHERE company_id=? AND platform='facebook' AND account_name='e-Marqet'
    LIMIT 1
  `).get(companyId);
  if (!account?.id) {
    const pageId = safeText(process.env.EMARQET_FACEBOOK_PAGE_ID || process.env.FACEBOOK_PAGE_ID);
    db.prepare(`
      INSERT INTO emarqet_social_accounts (
        company_id, platform, account_name, account_handle, external_id, page_id,
        posting_mode, auto_publish, status, updated_at
      )
      VALUES (?, 'facebook', 'e-Marqet', ?, ?, ?, 'api', 1, 'setup_required', datetime('now'))
    `).run(companyId, targetHandleFromEnv(), pageId, pageId);
  }

  const insertTarget = db.prepare(`
    INSERT OR IGNORE INTO emarqet_social_targets (
      company_id, platform, target_type, name, url, category, language, location,
      members_count, join_status, rules_status, promotion_allowed, marketplace_allowed,
      posting_mode, frequency_limit_per_week, notes, updated_at
    )
    VALUES (
      @company_id, 'facebook', @target_type, @name, @url, @category, @language, @location,
      @members_count, @join_status, @rules_status, @promotion_allowed, @marketplace_allowed,
      @posting_mode, @frequency_limit_per_week, @notes, datetime('now')
    )
  `);

  for (const target of DEFAULT_TARGETS) {
    const payload = Array.isArray(target)
      ? {
          target_type: "group",
          name: target[0],
          category: target[1],
          url: target[2],
          location: target[3],
          language: "ro",
          members_count: 0,
          join_status: "de_verificat",
          rules_status: "de_verificat",
          promotion_allowed: 0,
          marketplace_allowed: 0,
          posting_mode: "manual",
          frequency_limit_per_week: 1,
          notes: "Cautare manuala. Adaugam doar grupuri unde regulile permit postari relevante."
        }
      : target;
    insertTarget.run({
      company_id: companyId,
      target_type: payload.target_type || "group",
      name: payload.name,
      url: payload.url,
      category: payload.category || "",
      language: payload.language || "ro",
      location: payload.location || "",
      members_count: normalizeInt(payload.members_count),
      join_status: payload.join_status || "de_verificat",
      rules_status: payload.rules_status || "de_verificat",
      promotion_allowed: payload.promotion_allowed ? 1 : 0,
      marketplace_allowed: payload.marketplace_allowed ? 1 : 0,
      posting_mode: payload.posting_mode || "manual",
      frequency_limit_per_week: normalizeInt(payload.frequency_limit_per_week, 1) || 1,
      notes: payload.notes || ""
    });
  }
}

export function loadEmarqetSocialAccounts(db, companyId) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT id, platform, account_name, account_handle, external_id, page_id,
           posting_mode, auto_publish, status, token_expires_at, scopes,
           profile_json, last_sync_at,
           CASE WHEN COALESCE(access_token, '') <> '' THEN 1 ELSE 0 END AS has_access_token,
           updated_at
    FROM emarqet_social_accounts
    WHERE company_id=?
    ORDER BY CASE platform WHEN 'facebook' THEN 1 ELSE 2 END ASC, id ASC
  `).all(companyId);
}

export function saveEmarqetSocialAccount(db, companyId, body = {}) {
  seedEmarqetSocialDefaults(db, companyId);
  const id = Number(body.id || 0);
  const existing = id
    ? db.prepare("SELECT * FROM emarqet_social_accounts WHERE company_id=? AND id=?").get(companyId, id)
    : db.prepare("SELECT * FROM emarqet_social_accounts WHERE company_id=? AND platform='facebook' ORDER BY id ASC LIMIT 1").get(companyId);
  if (!existing?.id) return { ok: false, error: "missing" };
  const accessToken = safeText(body.access_token) || safeText(existing.access_token);
  const pageId = safeText(body.page_id || body.external_id || existing.page_id || existing.external_id);
  const status = oneOf(body.status, SOCIAL_ACCOUNT_STATUSES, accessToken && pageId ? "active" : existing.status || "setup_required");
  db.prepare(`
    UPDATE emarqet_social_accounts
    SET account_name=?,
        account_handle=?,
        external_id=?,
        page_id=?,
        posting_mode=?,
        auto_publish=?,
        access_token=?,
        token_expires_at=?,
        scopes=?,
        status=?,
        last_sync_at=CASE WHEN ? <> '' THEN datetime('now') ELSE last_sync_at END,
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(
    safeText(body.account_name) || existing.account_name || "e-Marqet",
    safeText(body.account_handle) || existing.account_handle,
    pageId,
    pageId,
    safeText(body.posting_mode) === "api" ? "api" : "draft",
    safeText(body.auto_publish) === "1" ? 1 : 0,
    accessToken,
    safeText(body.token_expires_at),
    safeText(body.scopes) || existing.scopes || "",
    status,
    accessToken,
    companyId,
    existing.id
  );
  promoteManualPageJobs(db, companyId, existing.id);
  return { ok: true };
}

export function loadEmarqetSocialTargets(db, companyId, limit = 250) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT *
    FROM emarqet_social_targets
    WHERE company_id=?
    ORDER BY
      CASE target_type WHEN 'page' THEN 1 WHEN 'marketplace' THEN 2 WHEN 'group' THEN 3 ELSE 4 END,
      promotion_allowed DESC,
      CASE join_status WHEN 'joined' THEN 1 WHEN 'requested' THEN 2 ELSE 3 END,
      members_count DESC,
      id ASC
    LIMIT ?
  `).all(companyId, Number(limit || 250));
}

export function loadEmarqetSocialSummary(db, companyId) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM emarqet_social_posts WHERE company_id=?) AS posts,
      (SELECT COUNT(*) FROM emarqet_social_posts WHERE company_id=? AND status='published') AS published,
      (SELECT COUNT(*) FROM emarqet_social_publish_jobs WHERE company_id=? AND status='queued') AS queued,
      (SELECT COUNT(*) FROM emarqet_social_publish_jobs WHERE company_id=? AND status='manual_required') AS manualRequired,
      (SELECT COUNT(*) FROM emarqet_social_targets WHERE company_id=? AND target_type='group') AS groups,
      (SELECT COUNT(*) FROM emarqet_social_targets WHERE company_id=? AND target_type='group' AND join_status='joined') AS joinedGroups,
      (SELECT COUNT(*) FROM emarqet_social_targets WHERE company_id=? AND promotion_allowed=1) AS allowedTargets
  `).get(companyId, companyId, companyId, companyId, companyId, companyId, companyId) || {};
}

function socialTargetPayload(body = {}) {
  const targetType = oneOf(body.target_type, SOCIAL_TARGET_TYPES, "group");
  return {
    target_type: targetType,
    name: safeText(body.name),
    url: safeText(body.url),
    category: safeText(body.category),
    language: safeText(body.language) || "ro",
    location: safeText(body.location),
    members_count: normalizeInt(body.members_count),
    join_status: targetType === "group"
      ? oneOf(body.join_status, SOCIAL_TARGET_JOIN_STATUSES, "de_verificat")
      : "not_applicable",
    rules_status: oneOf(body.rules_status, SOCIAL_TARGET_RULE_STATUSES, "de_verificat"),
    promotion_allowed: safeText(body.promotion_allowed) === "1" ? 1 : 0,
    marketplace_allowed: safeText(body.marketplace_allowed) === "1" || targetType === "marketplace" ? 1 : 0,
    posting_mode: targetType === "page" && safeText(body.posting_mode) === "api" ? "api" : "manual",
    frequency_limit_per_week: normalizeInt(body.frequency_limit_per_week, 1) || 1,
    last_post_at: safeText(body.last_post_at),
    notes: safeText(body.notes)
  };
}

export function upsertEmarqetSocialTarget(db, companyId, body = {}) {
  seedEmarqetSocialDefaults(db, companyId);
  const payload = socialTargetPayload(body);
  if (!payload.name) return { ok: false, error: "required" };
  const id = Number(body.id || 0);
  if (id) {
    const result = db.prepare(`
      UPDATE emarqet_social_targets
      SET target_type=@target_type,
          name=@name,
          url=@url,
          category=@category,
          language=@language,
          location=@location,
          members_count=@members_count,
          join_status=@join_status,
          rules_status=@rules_status,
          promotion_allowed=@promotion_allowed,
          marketplace_allowed=@marketplace_allowed,
          posting_mode=@posting_mode,
          frequency_limit_per_week=@frequency_limit_per_week,
          last_post_at=@last_post_at,
          notes=@notes,
          updated_at=datetime('now')
      WHERE company_id=@company_id AND id=@id
    `).run({ ...payload, company_id: companyId, id });
    return { ok: Boolean(result.changes), error: result.changes ? "" : "missing" };
  }
  db.prepare(`
    INSERT INTO emarqet_social_targets (
      company_id, platform, target_type, name, url, category, language, location,
      members_count, join_status, rules_status, promotion_allowed, marketplace_allowed,
      posting_mode, frequency_limit_per_week, last_post_at, notes, updated_at
    )
    VALUES (
      @company_id, 'facebook', @target_type, @name, @url, @category, @language, @location,
      @members_count, @join_status, @rules_status, @promotion_allowed, @marketplace_allowed,
      @posting_mode, @frequency_limit_per_week, @last_post_at, @notes, datetime('now')
    )
    ON CONFLICT(company_id, platform, target_type, name) DO UPDATE SET
      url=excluded.url,
      category=excluded.category,
      language=excluded.language,
      location=excluded.location,
      members_count=excluded.members_count,
      join_status=excluded.join_status,
      rules_status=excluded.rules_status,
      promotion_allowed=excluded.promotion_allowed,
      marketplace_allowed=excluded.marketplace_allowed,
      posting_mode=excluded.posting_mode,
      frequency_limit_per_week=excluded.frequency_limit_per_week,
      last_post_at=excluded.last_post_at,
      notes=excluded.notes,
      updated_at=datetime('now')
  `).run({ ...payload, company_id: companyId });
  return { ok: true };
}

export function loadEmarqetSocialPosts(db, companyId, limit = 200) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT
      p.*,
      l.listing_code,
      l.title AS listing_title,
      l.slug AS listing_slug,
      l.location AS listing_location,
      v.name AS vertical_name,
      v.code AS vertical_code,
      t.name AS target_name,
      t.url AS target_url,
      (
        SELECT j.status
        FROM emarqet_social_publish_jobs j
        WHERE j.company_id=p.company_id AND j.social_post_id=p.id
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT 1
      ) AS publish_status,
      (
        SELECT j.error
        FROM emarqet_social_publish_jobs j
        WHERE j.company_id=p.company_id AND j.social_post_id=p.id
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT 1
      ) AS publish_error
    FROM emarqet_social_posts p
    LEFT JOIN emarqet_listings l ON l.id=p.listing_id AND l.company_id=p.company_id
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    LEFT JOIN emarqet_social_targets t ON t.id=p.social_target_id AND t.company_id=p.company_id
    WHERE p.company_id=?
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ?
  `).all(companyId, Number(limit || 200));
}

export function loadEmarqetManualSharePosts(db, companyId, limit = 60) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT
      p.*,
      t.name AS target_name,
      t.url AS target_url,
      (
        SELECT j.status
        FROM emarqet_social_publish_jobs j
        WHERE j.company_id=p.company_id AND j.social_post_id=p.id
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT 1
      ) AS publish_status,
      (
        SELECT j.error
        FROM emarqet_social_publish_jobs j
        WHERE j.company_id=p.company_id AND j.social_post_id=p.id
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT 1
      ) AS publish_error,
      (
        SELECT COUNT(*)
        FROM emarqet_social_manual_shares s
        WHERE s.company_id=p.company_id
          AND s.social_post_id=p.id
          AND s.status='posted'
      ) AS manual_share_count,
      (
        SELECT group_concat(name, ' • ')
        FROM (
          SELECT COALESCE(NULLIF(s.group_name, ''), t.name, 'Grup Facebook') AS name
          FROM emarqet_social_manual_shares s
          LEFT JOIN emarqet_social_targets t ON t.id=s.social_target_id AND t.company_id=s.company_id
          WHERE s.company_id=p.company_id
            AND s.social_post_id=p.id
            AND s.status='posted'
          ORDER BY COALESCE(s.posted_at, s.created_at) DESC, s.id DESC
          LIMIT 12
        )
      ) AS manual_share_targets
    FROM emarqet_social_posts p
    LEFT JOIN emarqet_social_targets t ON t.id=p.social_target_id AND t.company_id=p.company_id
    WHERE p.company_id=?
      AND (
        p.content_type IN ('manual_group_share', 'facebook_ad_manual_share', 'marketplace_listing_copy')
        OR p.target_type IN ('group', 'marketplace', 'profile')
      )
    ORDER BY
      CASE p.status WHEN 'ready' THEN 1 WHEN 'scheduled' THEN 2 WHEN 'failed' THEN 3 WHEN 'published' THEN 4 ELSE 5 END,
      p.created_at DESC,
      p.id DESC
    LIMIT ?
  `).all(companyId, Number(limit || 60));
}

export function loadEmarqetManualGroupTargets(db, companyId, limit = 300) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT id, name, url, category, location, last_post_at
    FROM emarqet_social_targets
    WHERE company_id=?
      AND platform='facebook'
      AND target_type='group'
      AND name <> 'Grupuri Facebook - distribuire manuala'
    ORDER BY COALESCE(last_post_at, created_at) DESC, name ASC
    LIMIT 1000
  `).all(companyId)
    .filter((row) => !MANUAL_GROUP_DISCOVERY_URLS.has(safeText(row.url)))
    .slice(0, Number(limit || 300));
}

export function loadEmarqetManualShareSuggestions(db, companyId, postIds = [], perPostLimit = 9) {
  seedEmarqetSocialDefaults(db, companyId);
  const ids = [...new Set((Array.isArray(postIds) ? postIds : []).map((id) => Number(id || 0)).filter(Boolean))];
  if (!ids.length) return {};
  const groups = loadEmarqetManualGroupTargets(db, companyId, 500)
    .sort((a, b) => {
      const left = safeText(a.last_post_at) || "1970-01-01 00:00:00";
      const right = safeText(b.last_post_at) || "1970-01-01 00:00:00";
      if (left !== right) return left.localeCompare(right);
      return safeText(a.name).localeCompare(safeText(b.name), "ro");
    });
  const placeholders = ids.map(() => "?").join(",");
  const shareRows = db.prepare(`
    SELECT social_post_id, social_target_id
    FROM emarqet_social_manual_shares
    WHERE company_id=?
      AND status='posted'
      AND social_post_id IN (${placeholders})
  `).all(companyId, ...ids);
  const usedByPost = new Map();
  for (const row of shareRows) {
    const postId = Number(row.social_post_id || 0);
    if (!usedByPost.has(postId)) usedByPost.set(postId, new Set());
    usedByPost.get(postId).add(Number(row.social_target_id || 0));
  }
  const result = {};
  const limit = Math.max(1, Number(perPostLimit || 9));
  for (const postId of ids) {
    const used = usedByPost.get(postId) || new Set();
    const remaining = Math.max(0, limit - used.size);
    result[postId] = remaining
      ? groups.filter((group) => !used.has(Number(group.id || 0))).slice(0, remaining)
      : [];
  }
  return result;
}

export function importEmarqetManualGroups(db, companyId, body = {}) {
  seedEmarqetSocialDefaults(db, companyId);
  const rawText = safeText(body.groups_text || body.groups || body.manual_groups);
  const lines = rawText.split(/\r?\n/).map((line) => safeText(line)).filter(Boolean);
  const seen = new Set();
  const items = [];
  lines.forEach((line, index) => {
    const parsed = parseManualGroupLine(line, index + 1);
    if (!parsed?.name) return;
    const key = `${parsed.name.toLowerCase()}|${parsed.url.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(parsed);
  });
  if (!items.length) return { ok: false, error: "group_required", imported: 0 };

  const tx = db.transaction((rows) => {
    let imported = 0;
    let updated = 0;
    for (const row of rows) {
      const byUrl = row.url ? db.prepare(`
        SELECT id, name
        FROM emarqet_social_targets
        WHERE company_id=?
          AND platform='facebook'
          AND target_type='group'
          AND url=?
        LIMIT 1
      `).get(companyId, row.url) : null;
      if (byUrl?.id) {
        db.prepare(`
          UPDATE emarqet_social_targets
          SET name=CASE WHEN COALESCE(name, '') LIKE 'Grup Facebook %' THEN ? ELSE name END,
              category='manual_groups',
              join_status='joined',
              rules_status='permis',
              promotion_allowed=1,
              posting_mode='manual',
              updated_at=datetime('now')
          WHERE company_id=? AND id=?
        `).run(row.name, companyId, byUrl.id);
        updated += 1;
        continue;
      }
      const result = db.prepare(`
        INSERT INTO emarqet_social_targets (
          company_id, platform, target_type, name, url, category, language, location,
          members_count, join_status, rules_status, promotion_allowed, marketplace_allowed,
          posting_mode, frequency_limit_per_week, notes, updated_at
        )
        VALUES (?, 'facebook', 'group', ?, ?, 'manual_groups', 'ro', 'Romania', 0, 'joined', 'permis', 1, 0, 'manual', 1, 'Importat pentru distribuire manuala e-Marqet.', datetime('now'))
        ON CONFLICT(company_id, platform, target_type, name) DO UPDATE SET
          url=COALESCE(NULLIF(excluded.url, ''), url),
          category='manual_groups',
          join_status='joined',
          rules_status='permis',
          promotion_allowed=1,
          posting_mode='manual',
          updated_at=datetime('now')
      `).run(companyId, row.name, row.url);
      if (result.changes) imported += 1;
    }
    return { imported, updated };
  });
  const result = tx(items);
  return { ok: true, imported: result.imported, updated: result.updated };
}

export function loadEmarqetSocialPublishJobs(db, companyId, limit = 120) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT j.*, p.caption, p.link_url, p.media_url, a.account_name, a.account_handle
    FROM emarqet_social_publish_jobs j
    LEFT JOIN emarqet_social_posts p ON p.id=j.social_post_id AND p.company_id=j.company_id
    LEFT JOIN emarqet_social_accounts a ON a.id=j.account_id AND a.company_id=j.company_id
    WHERE j.company_id=?
    ORDER BY j.created_at DESC, j.id DESC
    LIMIT ?
  `).all(companyId, Number(limit || 120));
}

export function loadEmarqetSocialListings(db, companyId, limit = 80) {
  return db.prepare(`
    SELECT l.*, v.name AS vertical_name, v.code AS vertical_code, p.display_name AS partner_name
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    LEFT JOIN emarqet_partner_profiles p ON p.id=l.partner_profile_id AND p.company_id=l.company_id
    WHERE l.company_id=?
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
    ORDER BY
      CASE WHEN COALESCE(l.promotion_level, '') <> '' THEN 0 ELSE 1 END,
      COALESCE(l.published_at, l.updated_at, l.created_at) DESC,
      l.id DESC
    LIMIT ?
  `).all(companyId, Number(limit || 80));
}

function hashtagsFor(row = {}) {
  const vertical = slugify(row.vertical_name || row.vertical_code || "anunturi").replaceAll("-", "");
  const location = slugify(row.location || "").replaceAll("-", "");
  return ["#eMarqet", "#AnunturiLocale", vertical ? `#${vertical}` : "", location ? `#${location}` : ""]
    .filter(Boolean)
    .join(" ");
}

function captionForTarget(row = {}, target = {}) {
  const title = safeText(row.title) || "Anunt e-Marqet";
  const vertical = safeText(row.vertical_name || row.vertical_code || "anunt");
  const location = safeText(row.location);
  const price = fmtAmount(row.price_amount, row.price_currency);
  const url = publicListingUrl(row);
  const locationLine = location ? `Locatie: ${location}` : "";
  if (target.target_type === "marketplace") {
    return [
      title,
      "",
      `Categorie: ${vertical}`,
      locationLine,
      `Pret: ${price}`,
      "",
      "Detalii si contact:",
      url
    ].filter(Boolean).join("\n");
  }
  if (target.target_type === "group") {
    return [
      `Am gasit pe e-Marqet un anunt din categoria ${vertical}: ${title}.`,
      locationLine,
      `Pret: ${price}`,
      "",
      "Daca este util pentru grup, detaliile sunt aici:",
      url
    ].filter(Boolean).join("\n");
  }
  return [
    `Nou pe e-Marqet: ${title}`,
    "",
    [vertical, location].filter(Boolean).join(" · "),
    `Pret: ${price}`,
    "",
    "Vezi anuntul:",
    url
  ].filter(Boolean).join("\n");
}

function postExists(db, companyId, listingId, targetId, targetType) {
  return db.prepare(`
    SELECT id
    FROM emarqet_social_posts
    WHERE company_id=?
      AND listing_id=?
      AND COALESCE(social_target_id, 0)=?
      AND target_type=?
    LIMIT 1
  `).get(companyId, listingId, targetId || 0, targetType) || null;
}

export function generateEmarqetSocialPosts(db, companyId, options = {}) {
  seedEmarqetSocialDefaults(db, companyId);
  const listingLimit = Math.max(1, Math.min(50, Number(options.limit || 10) || 10));
  const listings = loadEmarqetSocialListings(db, companyId, listingLimit);
  const includeGroups = Boolean(options.includeGroups);
  const includeMarketplace = options.includeMarketplace !== false;
  const targets = db.prepare(`
    SELECT *
    FROM emarqet_social_targets
    WHERE company_id=?
      AND platform='facebook'
      AND (
        target_type='page'
        ${includeMarketplace ? "OR target_type='marketplace'" : ""}
        ${includeGroups ? "OR (target_type='group' AND join_status='joined' AND promotion_allowed=1 AND rules_status IN ('permis','doar_recomandari'))" : ""}
      )
    ORDER BY CASE target_type WHEN 'page' THEN 1 WHEN 'marketplace' THEN 2 ELSE 3 END, members_count DESC, id ASC
    LIMIT 80
  `).all(companyId);
  const insert = db.prepare(`
    INSERT INTO emarqet_social_posts (
      company_id, listing_id, partner_profile_id, social_target_id, platform, target_type,
      content_type, caption, hashtags, link_url, media_url, status, created_by, updated_at
    )
    VALUES (?, ?, ?, ?, 'facebook', ?, ?, ?, ?, ?, ?, 'ready', ?, datetime('now'))
  `);
  const created = [];
  const skipped = [];
  const tx = db.transaction(() => {
    for (const listing of listings) {
      for (const target of targets) {
        if (postExists(db, companyId, listing.id, target.id, target.target_type)) {
          skipped.push({ listing_id: listing.id, target_id: target.id });
          continue;
        }
        const result = insert.run(
          companyId,
          listing.id,
          listing.partner_profile_id || null,
          target.id,
          target.target_type,
          target.target_type === "marketplace" ? "marketplace_listing_copy" : "listing_post",
          captionForTarget(listing, target),
          hashtagsFor(listing),
          publicListingUrl(listing),
          safeText(listing.primary_image_url),
          safeText(options.createdBy || "emarqet-social")
        );
        created.push({ id: result.lastInsertRowid, listing_id: listing.id, target_id: target.id });
      }
    }
  });
  tx();
  return { ok: true, selectedListings: listings.length, targets: targets.length, created: created.length, skipped: skipped.length };
}

function defaultFacebookAccount(db, companyId) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT *
    FROM emarqet_social_accounts
    WHERE company_id=? AND platform='facebook'
    ORDER BY CASE status WHEN 'active' THEN 1 ELSE 2 END, id ASC
    LIMIT 1
  `).get(companyId) || null;
}

function promoteManualPageJobs(db, companyId, accountId) {
  const account = db.prepare("SELECT * FROM emarqet_social_accounts WHERE company_id=? AND id=?").get(companyId, accountId);
  if (!account || account.status !== "active" || !safeText(account.access_token) || !safeText(account.page_id)) return;
  db.prepare(`
    UPDATE emarqet_social_publish_jobs
    SET account_id=?,
        status='queued',
        error='',
        updated_at=datetime('now')
    WHERE company_id=?
      AND platform='facebook'
      AND target_type='page'
      AND status='manual_required'
  `).run(account.id, companyId);
}

export function queueEmarqetSocialPost(db, companyId, postId, options = {}) {
  seedEmarqetSocialDefaults(db, companyId);
  const post = db.prepare(`
    SELECT p.*, t.name AS target_name, t.url AS target_url, t.posting_mode AS target_posting_mode
    FROM emarqet_social_posts p
    LEFT JOIN emarqet_social_targets t ON t.id=p.social_target_id AND t.company_id=p.company_id
    WHERE p.company_id=? AND p.id=?
    LIMIT 1
  `).get(companyId, Number(postId || 0));
  if (!post?.id) return { ok: false, error: "missing" };
  const account = defaultFacebookAccount(db, companyId);
  const canApiPublish = post.target_type === "page"
    && account?.status === "active"
    && safeText(account.access_token)
    && safeText(account.page_id)
    && safeText(account.posting_mode) === "api";
  const status = canApiPublish ? "queued" : "manual_required";
  const scheduledAt = sqliteDateTime(options.scheduledAt);
  const error = canApiPublish
    ? ""
    : post.target_type === "page"
      ? "Conecteaza pagina Facebook cu Page Access Token si pages_manage_posts."
      : "Publicare manuala: grupurile si Marketplace nu se posteaza automat din Nexora.";
  const existing = db.prepare(`
    SELECT id
    FROM emarqet_social_publish_jobs
    WHERE company_id=? AND social_post_id=? AND status IN ('queued','manual_required')
    LIMIT 1
  `).get(companyId, post.id);
  if (existing?.id) {
    db.prepare(`
      UPDATE emarqet_social_publish_jobs
      SET account_id=?,
          social_target_id=?,
          target_type=?,
          target_name=?,
          target_url=?,
          status=?,
          scheduled_at=?,
          error=?,
          updated_at=datetime('now')
      WHERE company_id=? AND id=?
    `).run(
      canApiPublish ? account.id : null,
      post.social_target_id || null,
      post.target_type,
      post.target_name || "",
      post.target_url || "",
      status,
      scheduledAt,
      error,
      companyId,
      existing.id
    );
    return { ok: true, status, jobId: existing.id };
  }
  const result = db.prepare(`
    INSERT INTO emarqet_social_publish_jobs (
      company_id, social_post_id, account_id, social_target_id, platform, target_type,
      target_name, target_url, status, scheduled_at, error, updated_at
    )
    VALUES (?, ?, ?, ?, 'facebook', ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    companyId,
    post.id,
    canApiPublish ? account.id : null,
    post.social_target_id || null,
    post.target_type,
    post.target_name || "",
    post.target_url || "",
    status,
    scheduledAt,
    error
  );
  db.prepare(`
    UPDATE emarqet_social_posts
    SET status=?,
        scheduled_at=?,
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(status === "queued" ? "scheduled" : "ready", scheduledAt, companyId, post.id);
  return { ok: true, status, jobId: result.lastInsertRowid };
}

async function publishFacebookPagePost(account = {}, post = {}) {
  const pageId = safeText(account.page_id || account.external_id);
  const token = safeText(account.access_token);
  if (!pageId || !token) throw new Error("Facebook Page ID sau Page Access Token lipseste.");
  const mediaUrl = absolutePublicUrl(post.media_url);
  const endpoint = mediaUrl
    ? `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/photos`
    : `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/feed`;
  const body = new URLSearchParams();
  const message = [post.caption, post.hashtags].map(safeText).filter(Boolean).join("\n\n");
  if (mediaUrl) {
    body.set("caption", message);
    body.set("url", mediaUrl);
  } else {
    body.set("message", message);
    if (safeText(post.link_url)) body.set("link", safeText(post.link_url));
  }
  body.set("access_token", token);
  const response = await fetch(endpoint, { method: "POST", body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.message || `Facebook API error ${response.status}`);
  }
  return { externalPostId: safeText(payload.id) };
}

export async function processEmarqetSocialQueue(db, companyId, limit = 10) {
  seedEmarqetSocialDefaults(db, companyId);
  const jobs = db.prepare(`
    SELECT j.*, p.caption, p.hashtags, p.link_url, p.media_url, p.id AS post_id, a.access_token, a.page_id, a.external_id
    FROM emarqet_social_publish_jobs j
    LEFT JOIN emarqet_social_posts p ON p.id=j.social_post_id AND p.company_id=j.company_id
    LEFT JOIN emarqet_social_accounts a ON a.id=j.account_id AND a.company_id=j.company_id
    WHERE j.company_id=?
      AND j.status='queued'
      AND j.platform='facebook'
      AND j.target_type='page'
      AND (j.scheduled_at IS NULL OR j.scheduled_at='' OR j.scheduled_at <= datetime('now'))
    ORDER BY COALESCE(j.scheduled_at, j.created_at) ASC, j.id ASC
    LIMIT ?
  `).all(companyId, Number(limit || 10));
  let published = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const result = await publishFacebookPagePost(job, job);
      db.prepare(`
        UPDATE emarqet_social_publish_jobs
        SET status='published',
            published_at=datetime('now'),
            external_post_id=?,
            error='',
            updated_at=datetime('now')
        WHERE company_id=? AND id=?
      `).run(result.externalPostId, companyId, job.id);
      db.prepare(`
        UPDATE emarqet_social_posts
        SET status='published',
            published_at=datetime('now'),
            external_post_id=?,
            updated_at=datetime('now')
        WHERE company_id=? AND id=?
      `).run(result.externalPostId, companyId, job.social_post_id);
      published += 1;
    } catch (error) {
      failed += 1;
      db.prepare(`
        UPDATE emarqet_social_publish_jobs
        SET status='failed',
            error=?,
            updated_at=datetime('now')
        WHERE company_id=? AND id=?
      `).run(safeText(error?.message || error).slice(0, 1000), companyId, job.id);
      db.prepare(`
        UPDATE emarqet_social_posts
        SET status='failed',
            updated_at=datetime('now')
        WHERE company_id=? AND id=?
      `).run(companyId, job.social_post_id);
    }
  }
  return { ok: true, processed: jobs.length, published, failed };
}

export function updateEmarqetSocialPostStatus(db, companyId, postId, status = "") {
  const normalized = oneOf(status, SOCIAL_POST_STATUSES, "");
  if (!normalized) return { ok: false, error: "invalid" };
  const result = db.prepare(`
    UPDATE emarqet_social_posts
    SET status=?,
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(normalized, companyId, Number(postId || 0));
  return { ok: Boolean(result.changes), error: result.changes ? "" : "missing" };
}

export function markEmarqetSocialPostManualPublished(db, companyId, postId) {
  seedEmarqetSocialDefaults(db, companyId);
  const id = Number(postId || 0);
  const post = db.prepare(`
    SELECT id
    FROM emarqet_social_posts
    WHERE company_id=? AND id=?
    LIMIT 1
  `).get(companyId, id);
  if (!post?.id) return { ok: false, error: "missing" };
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE emarqet_social_posts
      SET status='published',
          published_at=COALESCE(NULLIF(published_at, ''), datetime('now')),
          updated_at=datetime('now')
      WHERE company_id=? AND id=?
    `).run(companyId, id);
    db.prepare(`
      UPDATE emarqet_social_publish_jobs
      SET status='published',
          published_at=COALESCE(NULLIF(published_at, ''), datetime('now')),
          external_post_id=COALESCE(NULLIF(external_post_id, ''), 'manual'),
          error='',
          updated_at=datetime('now')
      WHERE company_id=? AND social_post_id=?
    `).run(companyId, id);
  });
  tx();
  return { ok: true };
}

export function recordEmarqetManualGroupShare(db, companyId, postId, body = {}) {
  seedEmarqetSocialDefaults(db, companyId);
  const id = Number(postId || 0);
  const post = db.prepare(`
    SELECT id
    FROM emarqet_social_posts
    WHERE company_id=? AND id=?
    LIMIT 1
  `).get(companyId, id);
  if (!post?.id) return { ok: false, error: "missing" };

  const shareLimit = 9;
  const shareCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM emarqet_social_manual_shares
    WHERE company_id=? AND social_post_id=? AND status='posted'
  `).get(companyId, id)?.count || 0;
  if (shareCount >= shareLimit) return { ok: false, error: "manual_limit" };

  let targetId = Number(body.social_target_id || 0);
  let target = targetId
    ? db.prepare(`
        SELECT *
        FROM emarqet_social_targets
        WHERE company_id=? AND id=? AND platform='facebook' AND target_type='group'
        LIMIT 1
      `).get(companyId, targetId)
    : null;

  const groupName = safeText(target?.name || body.group_name);
  const groupUrl = safeText(target?.url || body.group_url);
  if (!groupName) return { ok: false, error: "group_required" };

  const tx = db.transaction(() => {
    if (!target?.id) {
      db.prepare(`
        INSERT INTO emarqet_social_targets (
          company_id, platform, target_type, name, url, category, language, location,
          members_count, join_status, rules_status, promotion_allowed, marketplace_allowed,
          posting_mode, frequency_limit_per_week, notes, updated_at
        )
        VALUES (?, 'facebook', 'group', ?, ?, 'manual_groups', 'ro', ?, 0, 'joined', 'permis', 1, 0, 'manual', 1, ?, datetime('now'))
        ON CONFLICT(company_id, platform, target_type, name) DO UPDATE SET
          url=COALESCE(NULLIF(excluded.url, ''), url),
          join_status='joined',
          rules_status='permis',
          promotion_allowed=1,
          updated_at=datetime('now')
      `).run(
        companyId,
        groupName,
        groupUrl,
        safeText(body.location || "Romania"),
        safeText(body.notes || "Adaugat din distribuire manuala e-Marqet.")
      );
      target = db.prepare(`
        SELECT *
        FROM emarqet_social_targets
        WHERE company_id=? AND platform='facebook' AND target_type='group' AND name=?
        LIMIT 1
      `).get(companyId, groupName);
      targetId = Number(target?.id || 0);
    }
    if (!targetId) throw new Error("target_missing");

    const existing = db.prepare(`
      SELECT id
      FROM emarqet_social_manual_shares
      WHERE company_id=? AND social_post_id=? AND social_target_id=? AND status='posted'
      LIMIT 1
    `).get(companyId, id, targetId);
    if (existing?.id) throw new Error("manual_duplicate");

    db.prepare(`
      INSERT INTO emarqet_social_manual_shares (
        company_id, social_post_id, social_target_id, group_name, group_url,
        status, posted_at, notes, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'posted', datetime('now'), ?, datetime('now'))
    `).run(companyId, id, targetId, groupName, groupUrl, safeText(body.notes));

    db.prepare(`
      UPDATE emarqet_social_targets
      SET last_post_at=datetime('now'),
          updated_at=datetime('now')
      WHERE company_id=? AND id=?
    `).run(companyId, targetId);
  });

  try {
    tx();
  } catch (error) {
    if (String(error?.message || "") === "manual_duplicate") return { ok: false, error: "manual_duplicate" };
    return { ok: false, error: "invalid" };
  }
  const nextCount = shareCount + 1;
  return { ok: true, count: nextCount, limit: shareLimit };
}

export function socialTargetsCsv(rows = []) {
  const columns = [
    "id",
    "target_type",
    "name",
    "url",
    "category",
    "location",
    "members_count",
    "join_status",
    "rules_status",
    "promotion_allowed",
    "frequency_limit_per_week",
    "last_post_at",
    "notes"
  ];
  const csvEscape = (value = "") => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n");
}

export function loadEmarqetMarketplaceFeedRows(db, companyId, limit = 5000) {
  return db.prepare(`
    SELECT
      l.id,
      l.listing_code,
      l.title,
      l.slug,
      l.location,
      l.price_amount,
      l.price_currency,
      l.primary_image_url,
      l.image_urls_json,
      l.notes,
      l.updated_at,
      l.published_at,
      v.name AS vertical_name,
      v.code AS vertical_code,
      p.display_name AS partner_name,
      p.website AS partner_website
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    LEFT JOIN emarqet_partner_profiles p ON p.id=l.partner_profile_id AND p.company_id=l.company_id
    WHERE l.company_id=?
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
    ORDER BY COALESCE(l.published_at, l.updated_at, l.created_at) DESC, l.id DESC
    LIMIT ?
  `).all(companyId, Number(limit || 5000));
}

function firstImageUrl(row = {}) {
  const primary = safeText(row.primary_image_url);
  if (/^https?:\/\//i.test(primary)) return primary;
  if (primary.startsWith("/")) return `${publicBaseUrl()}${primary}`;
  try {
    const parsed = JSON.parse(safeText(row.image_urls_json) || "[]");
    const first = Array.isArray(parsed) ? safeText(parsed[0]) : "";
    if (/^https?:\/\//i.test(first)) return first;
    if (first.startsWith("/")) return `${publicBaseUrl()}${first}`;
  } catch {
    return "";
  }
  return "";
}

function feedDescription(row = {}) {
  const notes = safeText(row.notes).replace(/\s+/g, " ");
  const vertical = safeText(row.vertical_name || row.vertical_code);
  const location = safeText(row.location);
  const parts = [notes, vertical ? `Categorie: ${vertical}` : "", location ? `Locatie: ${location}` : ""].filter(Boolean);
  return (parts.join(" | ") || safeText(row.title)).slice(0, 4900);
}

export function marketplaceCatalogCsv(rows = []) {
  const columns = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
    "google_product_category",
    "custom_label_0",
    "custom_label_1"
  ];
  const csvEscape = (value = "") => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const priceLabel = (row = {}) => {
    const amount = Number(row.price_amount || 0);
    const currency = safeText(row.price_currency || "RON").toUpperCase();
    return amount > 0 ? `${amount.toFixed(2)} ${currency}` : "";
  };
  return [
    columns.join(","),
    ...rows.map((row) => [
      safeText(row.listing_code || row.id),
      safeText(row.title),
      feedDescription(row),
      "in stock",
      "used",
      priceLabel(row),
      publicListingUrl(row),
      firstImageUrl(row),
      safeText(row.partner_name || "e-Marqet"),
      "",
      safeText(row.vertical_code),
      safeText(row.location)
    ].map(csvEscape).join(","))
  ].join("\n");
}
