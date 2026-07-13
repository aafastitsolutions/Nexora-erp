import crypto from "crypto";

function safeText(value = "") {
  return String(value || "").trim();
}

function safeCompanyId(companyId) {
  return Number(companyId || 0);
}

function clientIp(req = {}) {
  const cfIp = safeText(req.headers?.["cf-connecting-ip"]);
  if (cfIp) return cfIp;
  const forwarded = safeText(req.headers?.["x-forwarded-for"]).split(",").map((item) => safeText(item)).filter(Boolean);
  if (forwarded[0]) return forwarded[0];
  return safeText(req.ip || req.socket?.remoteAddress || "");
}

function visitorHash(req = {}) {
  const source = [
    clientIp(req),
    safeText(req.headers?.["user-agent"]),
    safeText(req.headers?.["accept-language"])
  ].join("|");
  return crypto.createHash("sha256").update(source || "anonymous").digest("hex");
}

function queryValue(req = {}, key = "") {
  return safeText(req.query?.[key]);
}

export function ensureEmarqetAnalyticsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_site_pageviews(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      site TEXT NOT NULL DEFAULT 'e-marqet',
      path TEXT NOT NULL,
      route_name TEXT,
      listing_id INTEGER,
      vertical_code TEXT,
      partner_profile_id INTEGER,
      emarqet_user_id INTEGER,
      visitor_hash TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_site_pageviews_company_created
      ON emarqet_site_pageviews(company_id, site, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_emarqet_site_pageviews_visitor_created
      ON emarqet_site_pageviews(company_id, visitor_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_emarqet_site_pageviews_path_created
      ON emarqet_site_pageviews(company_id, path, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_emarqet_site_pageviews_listing_created
      ON emarqet_site_pageviews(company_id, listing_id, created_at DESC);
  `);
}

export function recordEmarqetPageView(db, companyId, req = {}, context = {}) {
  const safeId = safeCompanyId(companyId);
  if (!safeId) return { ok: false, error: "company" };
  ensureEmarqetAnalyticsSchema(db);
  const path = safeText(req.originalUrl || req.url || context.path || "/").slice(0, 500);
  const routeName = safeText(context.routeName || context.route_name || "").slice(0, 120);
  db.prepare(`
    INSERT INTO emarqet_site_pageviews (
      company_id, site, path, route_name, listing_id, vertical_code, partner_profile_id,
      emarqet_user_id, visitor_hash, referrer, user_agent, utm_source, utm_medium, utm_campaign
    )
    VALUES (?, 'e-marqet', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    safeId,
    path || "/",
    routeName,
    context.listingId ? Number(context.listingId || 0) : null,
    safeText(context.verticalCode || ""),
    context.partnerProfileId ? Number(context.partnerProfileId || 0) : null,
    context.userId ? Number(context.userId || 0) : null,
    visitorHash(req),
    safeText(req.headers?.referer || req.headers?.referrer || "").slice(0, 500),
    safeText(req.headers?.["user-agent"]).slice(0, 500),
    queryValue(req, "utm_source").slice(0, 120),
    queryValue(req, "utm_medium").slice(0, 120),
    queryValue(req, "utm_campaign").slice(0, 120)
  );
  return { ok: true };
}

function countRow(db, sql = "", params = []) {
  return db.prepare(sql).get(...params) || {};
}

function planLabels(db, companyId) {
  ensureEmarqetAnalyticsSchema(db);
  const rows = db.prepare(`
    SELECT code, name
    FROM emarqet_pricing_plans
    WHERE company_id=?
  `).all(companyId);
  const labels = new Map(rows.map((row) => [safeText(row.code).toLowerCase(), safeText(row.name || row.code)]));
  labels.set("free", labels.get("free") || "Free");
  return labels;
}

function loadSubscriptionPlanRows(db, companyId) {
  return db.prepare(`
    SELECT
      LOWER(COALESCE(NULLIF(plan_key, ''), 'free')) AS plan_code,
      COUNT(*) AS subscriptions_total,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active_subscriptions,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIAL' THEN 1 ELSE 0 END) AS trial_subscriptions,
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS new_subscriptions_30d,
      SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('ACTIV','TRIAL') THEN COALESCE(amount, 0) ELSE 0 END) AS monthly_value
    FROM emarqet_subscriptions
    WHERE company_id=?
    GROUP BY LOWER(COALESCE(NULLIF(plan_key, ''), 'free'))
  `).all(companyId);
}

function loadUserPlanRows(db, companyId) {
  return db.prepare(`
    WITH user_plans AS (
      SELECT
        u.id,
        u.created_at,
        LOWER(COALESCE(
          NULLIF((
            SELECT p.selected_plan_code
            FROM emarqet_partner_profiles p
            WHERE p.company_id=u.company_id AND p.emarqet_user_id=u.id AND COALESCE(p.selected_plan_code,'') <> ''
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT 1
          ), ''),
          NULLIF((
            SELECT l.selected_plan_code
            FROM emarqet_listings l
            WHERE l.company_id=u.company_id AND l.emarqet_user_id=u.id AND COALESCE(l.selected_plan_code,'') <> ''
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT 1
          ), ''),
          NULLIF((
            SELECT s.plan_key
            FROM emarqet_subscriptions s
            WHERE s.company_id=u.company_id AND LOWER(COALESCE(s.customer_email,''))=LOWER(COALESCE(u.email,''))
              AND COALESCE(s.plan_key,'') <> ''
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT 1
          ), ''),
          'free'
        )) AS plan_code
      FROM emarqet_users u
      WHERE u.company_id=?
    )
    SELECT
      plan_code,
      COUNT(*) AS customers_total,
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS new_customers_30d,
      SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS new_customers_7d
    FROM user_plans
    GROUP BY plan_code
  `).all(companyId);
}

function loadListingPlanRows(db, companyId) {
  return db.prepare(`
    SELECT
      LOWER(COALESCE(NULLIF(selected_plan_code, ''), 'free')) AS plan_code,
      COUNT(*) AS listings_total,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='PUBLICAT' THEN 1 ELSE 0 END) AS published_listings,
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS new_listings_30d,
      SUM(CASE WHEN COALESCE(paid_at,'') <> '' OR UPPER(COALESCE(stripe_checkout_status,'')) LIKE 'PAID%' THEN 1 ELSE 0 END) AS paid_listings
    FROM emarqet_listings
    WHERE company_id=?
    GROUP BY LOWER(COALESCE(NULLIF(selected_plan_code, ''), 'free'))
  `).all(companyId);
}

function loadPartnerPlanRows(db, companyId) {
  return db.prepare(`
    SELECT
      LOWER(COALESCE(NULLIF(selected_plan_code, ''), 'business')) AS plan_code,
      COUNT(*) AS partner_profiles_total,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active_partner_profiles,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='IN_REVIZIE' THEN 1 ELSE 0 END) AS pending_partner_profiles,
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS new_partner_profiles_30d
    FROM emarqet_partner_profiles
    WHERE company_id=?
    GROUP BY LOWER(COALESCE(NULLIF(selected_plan_code, ''), 'business'))
  `).all(companyId);
}

function mergePlanRows(db, companyId) {
  const labels = planLabels(db, companyId);
  const merged = new Map();
  const ensure = (code = "") => {
    const planCode = safeText(code).toLowerCase() || "free";
    if (!merged.has(planCode)) {
      merged.set(planCode, {
        plan_code: planCode,
        plan_name: labels.get(planCode) || planCode,
        customers_total: 0,
        new_customers_30d: 0,
        new_customers_7d: 0,
        subscriptions_total: 0,
        active_subscriptions: 0,
        trial_subscriptions: 0,
        new_subscriptions_30d: 0,
        monthly_value: 0,
        listings_total: 0,
        published_listings: 0,
        new_listings_30d: 0,
        paid_listings: 0,
        partner_profiles_total: 0,
        active_partner_profiles: 0,
        pending_partner_profiles: 0,
        new_partner_profiles_30d: 0
      });
    }
    return merged.get(planCode);
  };
  for (const code of labels.keys()) ensure(code);
  for (const row of loadUserPlanRows(db, companyId)) Object.assign(ensure(row.plan_code), row);
  for (const row of loadSubscriptionPlanRows(db, companyId)) Object.assign(ensure(row.plan_code), row);
  for (const row of loadListingPlanRows(db, companyId)) Object.assign(ensure(row.plan_code), row);
  for (const row of loadPartnerPlanRows(db, companyId)) Object.assign(ensure(row.plan_code), row);
  return [...merged.values()]
    .filter((row) => Number(row.customers_total || row.subscriptions_total || row.listings_total || row.partner_profiles_total || row.active_subscriptions || row.new_customers_30d))
    .sort((a, b) => {
      const totalA = Number(a.active_subscriptions || 0) + Number(a.customers_total || 0) + Number(a.listings_total || 0);
      const totalB = Number(b.active_subscriptions || 0) + Number(b.customers_total || 0) + Number(b.listings_total || 0);
      return totalB - totalA || safeText(a.plan_name).localeCompare(safeText(b.plan_name), "ro");
    });
}

export function loadEmarqetDashboardAnalytics(db, companyId) {
  const safeId = safeCompanyId(companyId);
  ensureEmarqetAnalyticsSchema(db);
  const traffic = countRow(db, `
    SELECT
      COUNT(*) AS total_pageviews,
      COUNT(DISTINCT visitor_hash) AS total_visitors,
      SUM(CASE WHEN created_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS pageviews_24h,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-1 day') THEN visitor_hash END) AS visitors_24h,
      SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS pageviews_7d,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-7 days') THEN visitor_hash END) AS visitors_7d,
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS pageviews_30d,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-30 days') THEN visitor_hash END) AS visitors_30d
    FROM emarqet_site_pageviews
    WHERE company_id=? AND site='e-marqet'
  `, [safeId]);

  const customers = countRow(db, `
    SELECT
      COUNT(*) AS customers_total,
      SUM(CASE WHEN created_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS customers_24h,
      SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS customers_7d,
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS customers_30d
    FROM emarqet_users
    WHERE company_id=?
  `, [safeId]);

  const business = countRow(db, `
    SELECT
      SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS partner_profiles_30d,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='IN_REVIZIE' THEN 1 ELSE 0 END) AS partner_profiles_pending,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS partner_profiles_active
    FROM emarqet_partner_profiles
    WHERE company_id=?
  `, [safeId]);

  const topPages = db.prepare(`
    SELECT route_name, path, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
    FROM emarqet_site_pageviews
    WHERE company_id=? AND site='e-marqet' AND created_at >= datetime('now','-30 days')
    GROUP BY route_name, path
    ORDER BY views DESC, visitors DESC
    LIMIT 8
  `).all(safeId);

  const dailyTraffic = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
    FROM emarqet_site_pageviews
    WHERE company_id=? AND site='e-marqet' AND created_at >= date('now','-13 days')
    GROUP BY date(created_at)
    ORDER BY day DESC
    LIMIT 14
  `).all(safeId);

  return {
    traffic,
    customers,
    business,
    planRows: mergePlanRows(db, safeId),
    topPages,
    dailyTraffic
  };
}
