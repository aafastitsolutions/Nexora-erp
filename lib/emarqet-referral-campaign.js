import crypto from "node:crypto";

const REFERRAL_REWARD_THRESHOLD = 3;
const REFERRAL_REWARD_DAYS = 7;
const CAMPAIGN_CODE = "pune-l-pe-emarqet";

function safeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeCode(value = "") {
  return safeText(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, "").slice(0, 48);
}

function publicBaseUrl() {
  return safeText(process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");
}

function slugKey(row = {}) {
  return encodeURIComponent(row.slug || row.listing_code || row.id || "");
}

function randomCode(prefix = "EMQ") {
  return `${prefix}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function hashValue(value = "") {
  const secret = safeText(process.env.SESSION_SECRET || process.env.COOKIE_SECRET || "nexora");
  return crypto.createHash("sha256").update(`${secret}:${safeText(value)}`).digest("hex");
}

function requestIp(req = {}) {
  const forwarded = safeText(req.headers?.["x-forwarded-for"]).split(",")[0].trim();
  return forwarded || safeText(req.ip || req.socket?.remoteAddress || "");
}

function requestUserAgent(req = {}) {
  return safeText(req.headers?.["user-agent"]);
}

function ensureColumn(db, table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function addDaysIso(days = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function ensureEmarqetReferralSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_referral_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      referral_code TEXT NOT NULL,
      referrer_user_id INTEGER,
      listing_id INTEGER,
      event_type TEXT NOT NULL DEFAULT 'click',
      channel TEXT,
      ip_hash TEXT,
      user_agent_hash TEXT,
      target_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_referral_rewards(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      emarqet_user_id INTEGER,
      listing_id INTEGER,
      referral_code TEXT NOT NULL,
      reward_type TEXT NOT NULL DEFAULT 'promotion_7_days',
      status TEXT NOT NULL DEFAULT 'awarded',
      threshold_count INTEGER NOT NULL DEFAULT 3,
      actual_count INTEGER NOT NULL DEFAULT 0,
      awarded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      notes TEXT,
      UNIQUE(company_id, listing_id, reward_type)
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_referral_events_code
      ON emarqet_referral_events(company_id, referral_code, event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_emarqet_referral_events_listing
      ON emarqet_referral_events(company_id, listing_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_emarqet_referral_rewards_user
      ON emarqet_referral_rewards(company_id, emarqet_user_id, status);
  `);
  ensureColumn(db, "emarqet_users", "referral_code", "TEXT");
  ensureColumn(db, "emarqet_users", "referral_clicks_total", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_users", "referral_rewards_total", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_listings", "referral_code", "TEXT");
  ensureColumn(db, "emarqet_listings", "referral_share_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_listings", "referral_click_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_listings", "referral_reward_granted_at", "TEXT");
}

export function ensureUserReferralCode(db, companyId, userId) {
  ensureEmarqetReferralSchema(db);
  const user = db.prepare("SELECT id, referral_code FROM emarqet_users WHERE company_id=? AND id=?").get(companyId, Number(userId || 0));
  if (!user?.id) return "";
  if (safeText(user.referral_code)) return normalizeCode(user.referral_code);
  let code = "";
  do {
    code = randomCode("USER");
  } while (db.prepare("SELECT id FROM emarqet_users WHERE company_id=? AND referral_code=?").get(companyId, code));
  db.prepare("UPDATE emarqet_users SET referral_code=?, updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?").run(code, companyId, user.id);
  return code;
}

export function ensureListingReferralCode(db, companyId, listing = {}) {
  ensureEmarqetReferralSchema(db);
  if (!listing?.id) return "";
  if (safeText(listing.referral_code)) return normalizeCode(listing.referral_code);
  if (listing.emarqet_user_id) ensureUserReferralCode(db, companyId, listing.emarqet_user_id);
  let code = "";
  do {
    code = randomCode("EMQ");
  } while (db.prepare("SELECT id FROM emarqet_listings WHERE company_id=? AND referral_code=?").get(companyId, code));
  db.prepare("UPDATE emarqet_listings SET referral_code=?, updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?").run(code, companyId, listing.id);
  listing.referral_code = code;
  return code;
}

export function emarqetReferralShareUrl(listing = {}, referralCode = "") {
  const url = new URL(`/anunt/${slugKey(listing)}`, publicBaseUrl());
  url.searchParams.set("ref", normalizeCode(referralCode || listing.referral_code));
  url.searchParams.set("utm_source", "facebook");
  url.searchParams.set("utm_medium", "referral_share");
  url.searchParams.set("utm_campaign", CAMPAIGN_CODE);
  url.searchParams.set("utm_content", safeText(listing.listing_code || `listing_${listing.id}`));
  return url.toString();
}

export function emarqetReferralCaption(listing = {}, shareUrl = "") {
  const title = safeText(listing.title || "anuntul meu");
  const location = safeText(listing.location);
  const price = Number(listing.price_amount || 0) > 0
    ? `${Number(listing.price_amount).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} ${safeText(listing.price_currency || "RON").toUpperCase()}`
    : "pret la cerere";
  return [
    `Am publicat pe e-Marqet: ${title}`,
    location ? `Locatie: ${location}` : "",
    `Pret: ${price}`,
    "",
    "Vezi detalii aici:",
    shareUrl,
    "",
    "Pune-l pe e-Marqet. Da-l mai departe."
  ].filter(Boolean).join("\n");
}

function uniqueReferralClicks(db, companyId, listingId, referralCode = "") {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(NULLIF(ip_hash, ''), id)) AS clicks
    FROM emarqet_referral_events
    WHERE company_id=?
      AND listing_id=?
      AND referral_code=?
      AND event_type='click'
  `).get(companyId, Number(listingId || 0), normalizeCode(referralCode));
  return Number(row?.clicks || 0);
}

function maybeGrantReferralReward(db, companyId, listing = {}, referralCode = "") {
  const code = normalizeCode(referralCode);
  if (!listing?.id || !code) return null;
  const actualCount = uniqueReferralClicks(db, companyId, listing.id, code);
  db.prepare(`
    UPDATE emarqet_listings
    SET referral_click_count=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(actualCount, companyId, listing.id);
  if (actualCount < REFERRAL_REWARD_THRESHOLD) return null;
  const existing = db.prepare(`
    SELECT *
    FROM emarqet_referral_rewards
    WHERE company_id=? AND listing_id=? AND reward_type='promotion_7_days'
    LIMIT 1
  `).get(companyId, listing.id);
  if (existing?.id) return existing;

  const expiresAt = addDaysIso(REFERRAL_REWARD_DAYS);
  const insert = db.prepare(`
    INSERT INTO emarqet_referral_rewards (
      company_id, emarqet_user_id, listing_id, referral_code, reward_type,
      status, threshold_count, actual_count, expires_at, notes
    ) VALUES (?, ?, ?, ?, 'promotion_7_days', 'awarded', ?, ?, ?, ?)
  `).run(
    companyId,
    listing.emarqet_user_id || null,
    listing.id,
    code,
    REFERRAL_REWARD_THRESHOLD,
    actualCount,
    expiresAt,
    "Promovare gratuita prin campania Pune-l pe e-Marqet. Da-l mai departe."
  );
  db.prepare(`
    UPDATE emarqet_listings
    SET promotion_level='referral_boost',
        promotion_until=?,
        referral_reward_granted_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(expiresAt, companyId, listing.id);
  if (listing.emarqet_user_id) {
    db.prepare(`
      UPDATE emarqet_users
      SET referral_rewards_total=COALESCE(referral_rewards_total,0)+1,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(companyId, listing.emarqet_user_id);
  }
  return { id: insert.lastInsertRowid, expires_at: expiresAt, actual_count: actualCount };
}

export function registerEmarqetReferralClick(db, companyId, listing = {}, referralCode = "", req = {}) {
  ensureEmarqetReferralSchema(db);
  const code = normalizeCode(referralCode);
  if (!listing?.id || !code) return { ok: false, error: "missing" };
  const current = db.prepare(`
    SELECT id, emarqet_user_id, referral_code
    FROM emarqet_listings
    WHERE company_id=? AND id=?
    LIMIT 1
  `).get(companyId, listing.id);
  if (!current?.id) return { ok: false, error: "missing_listing" };
  if (normalizeCode(current.referral_code) !== code) return { ok: false, error: "code_mismatch" };
  const ipHash = hashValue(requestIp(req));
  const userAgentHash = hashValue(requestUserAgent(req));
  const recent = db.prepare(`
    SELECT id
    FROM emarqet_referral_events
    WHERE company_id=? AND listing_id=? AND referral_code=? AND event_type='click' AND ip_hash=?
      AND datetime(created_at) >= datetime('now', '-12 hours')
    LIMIT 1
  `).get(companyId, listing.id, code, ipHash);
  if (recent?.id) return { ok: true, duplicate: true, reward: maybeGrantReferralReward(db, companyId, { ...listing, emarqet_user_id: current.emarqet_user_id }, code) };
  db.prepare(`
    INSERT INTO emarqet_referral_events (
      company_id, referral_code, referrer_user_id, listing_id, event_type,
      channel, ip_hash, user_agent_hash, target_url
    ) VALUES (?, ?, ?, ?, 'click', ?, ?, ?, ?)
  `).run(
    companyId,
    code,
    current.emarqet_user_id || null,
    listing.id,
    safeText(req.query?.utm_source || "direct"),
    ipHash,
    userAgentHash,
    safeText(req.originalUrl || req.url || "")
  );
  if (current.emarqet_user_id) {
    db.prepare(`
      UPDATE emarqet_users
      SET referral_clicks_total=COALESCE(referral_clicks_total,0)+1,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(companyId, current.emarqet_user_id);
  }
  return { ok: true, reward: maybeGrantReferralReward(db, companyId, { ...listing, emarqet_user_id: current.emarqet_user_id }, code) };
}

export function registerEmarqetReferralShare(db, companyId, listing = {}, user = {}, channel = "facebook") {
  ensureEmarqetReferralSchema(db);
  const code = ensureListingReferralCode(db, companyId, listing);
  if (!code) return { ok: false, error: "missing" };
  db.prepare(`
    INSERT INTO emarqet_referral_events (
      company_id, referral_code, referrer_user_id, listing_id, event_type, channel, target_url
    ) VALUES (?, ?, ?, ?, 'share', ?, ?)
  `).run(companyId, code, user?.id || listing.emarqet_user_id || null, listing.id, safeText(channel || "facebook"), emarqetReferralShareUrl(listing, code));
  db.prepare(`
    UPDATE emarqet_listings
    SET referral_share_count=COALESCE(referral_share_count,0)+1,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(companyId, listing.id);
  return { ok: true, referralCode: code };
}

export function loadEmarqetReferralStats(db, companyId, userId) {
  ensureEmarqetReferralSchema(db);
  const user = db.prepare(`
    SELECT referral_code, referral_clicks_total, referral_rewards_total
    FROM emarqet_users
    WHERE company_id=? AND id=?
  `).get(companyId, Number(userId || 0)) || {};
  const listingStats = db.prepare(`
    SELECT
      COUNT(*) AS shareable_listings,
      COALESCE(SUM(referral_share_count),0) AS shares,
      COALESCE(SUM(referral_click_count),0) AS clicks,
      SUM(CASE WHEN referral_reward_granted_at IS NOT NULL THEN 1 ELSE 0 END) AS rewarded
    FROM emarqet_listings
    WHERE company_id=? AND emarqet_user_id=?
      AND UPPER(COALESCE(status,''))='PUBLICAT'
  `).get(companyId, Number(userId || 0)) || {};
  return {
    referral_code: safeText(user.referral_code),
    total_clicks: Number(user.referral_clicks_total || listingStats.clicks || 0),
    total_rewards: Number(user.referral_rewards_total || listingStats.rewarded || 0),
    shareable_listings: Number(listingStats.shareable_listings || 0),
    shares: Number(listingStats.shares || 0),
    listing_clicks: Number(listingStats.clicks || 0),
    rewarded: Number(listingStats.rewarded || 0),
    threshold: REFERRAL_REWARD_THRESHOLD,
    reward_days: REFERRAL_REWARD_DAYS,
    campaign_code: CAMPAIGN_CODE
  };
}

export function emarqetReferralShareKit(db, companyId, listing = {}) {
  ensureEmarqetReferralSchema(db);
  const referralCode = ensureListingReferralCode(db, companyId, listing);
  const shareUrl = emarqetReferralShareUrl(listing, referralCode);
  const clicks = uniqueReferralClicks(db, companyId, listing.id, referralCode);
  const reward = db.prepare(`
    SELECT *
    FROM emarqet_referral_rewards
    WHERE company_id=? AND listing_id=? AND reward_type='promotion_7_days'
    LIMIT 1
  `).get(companyId, listing.id) || null;
  return {
    referralCode,
    shareUrl,
    facebookShareUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    caption: emarqetReferralCaption(listing, shareUrl),
    clicks,
    threshold: REFERRAL_REWARD_THRESHOLD,
    remaining: Math.max(0, REFERRAL_REWARD_THRESHOLD - clicks),
    rewardDays: REFERRAL_REWARD_DAYS,
    reward
  };
}
