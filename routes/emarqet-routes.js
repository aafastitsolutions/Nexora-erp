import {
  renderEmarqetDashboardPage,
  renderEmarqetIntegrationsPage,
  renderEmarqetLeadsPage,
  renderEmarqetListingsPage,
  renderEmarqetPartnersPage,
  renderEmarqetServicesPage,
  renderEmarqetSettingsPage,
  renderEmarqetSocialPage,
  renderEmarqetSubscriptionsPage,
  renderEmarqetVerticalsPage
} from "../src/ui/nexora-emarqet-pages.js";
import {
  ensureEmarqetAnalyticsSchema,
  loadEmarqetDashboardAnalytics
} from "../lib/emarqet-analytics.js";
import {
  createMarketplaceServiceRequest,
  ensureMarketplaceServicesSchema,
  loadMarketplaceServiceRequests,
  loadMarketplaceServices,
  seedMarketplaceServicesCatalog,
  updateMarketplaceServiceRequestStatus
} from "../lib/emarqet-marketplace-services.js";
import {
  ensureEmarqetMonetizationSchema,
  findEmarqetPricingPlan,
  loadEmarqetAddons,
  loadEmarqetPricingPlans,
  seedEmarqetMonetizationCatalog
} from "../lib/emarqet-monetization.js";
import {
  ensureEmarqetSocialSchema,
  generateEmarqetSocialPosts,
  importEmarqetManualGroups,
  loadEmarqetSocialAccounts,
  loadEmarqetMarketplaceFeedRows,
  loadEmarqetManualGroupTargets,
  loadEmarqetManualSharePosts,
  loadEmarqetManualShareSuggestions,
  loadEmarqetSocialListings,
  loadEmarqetSocialPosts,
  loadEmarqetSocialPublishJobs,
  loadEmarqetSocialSummary,
  loadEmarqetSocialTargets,
  markEmarqetSocialPostManualPublished,
  marketplaceCatalogCsv,
  processEmarqetSocialQueue,
  queueEmarqetSocialPost,
  recordEmarqetManualGroupShare,
  saveEmarqetSocialAccount,
  seedEmarqetSocialDefaults,
  socialTargetsCsv,
  updateEmarqetSocialPostStatus,
  upsertEmarqetSocialTarget
} from "../lib/emarqet-social-distribution.js";
import { emarqetDefaultVerticalRows } from "../lib/emarqet-categories.js";
import {
  authenticateMarketplaceApiToken,
  createMarketplaceApiKey,
  ensureEmarqetIntegrationSchema,
  generateEmarqetIntegrationReport,
  ensureEmarqetIntegrationReports,
  loadEmarqetIntegrationLogs,
  loadEmarqetIntegrationReports,
  loadEmarqetIntegrations,
  loadEmarqetIntegrationStats,
  loadMarketplaceApiKeys,
  logEmarqetIntegrationEvent,
  revokeMarketplaceApiKey,
  saveEmarqetIntegrationConfig,
  saveEmarqetIntegrationCredentials,
  seedEmarqetIntegrations,
  testEmarqetIntegration,
  updateEmarqetIntegrationStatus
} from "../lib/emarqet-integrations.js";

const LISTING_STATUSES = ["DRAFT", "IN_REVIZIE", "PUBLICAT", "PAUZAT", "RESPINS"];
const LEAD_STATUSES = ["NOU", "CONTACTAT", "OFERTA", "CASTIGAT", "PIERDUT"];
const SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIV", "PAUZAT", "ANULAT"];
const VERTICAL_STATUSES = ["ACTIV", "PLANIFICAT", "PAUZAT"];
const AI_STATUSES = ["NEGENERAT", "GENERAT", "DE_REVIZUIT"];
const SERVICE_REQUEST_STATUSES = ["NOU", "IN_LUCRU", "FINALIZAT", "ESUAT", "ANULAT"];
const PARTNER_STATUSES = ["IN_REVIZIE", "ACTIV", "PAUZAT", "RESPINS"];

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function currentUserEmail(req) {
  return String(req.session.user.email || "").trim().toLowerCase();
}

function safeText(value) {
  return String(value || "").trim();
}

function parseAmount(value) {
  const normalized = safeText(value).replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseDate(value) {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function ensureColumn(db, table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function normalizeCode(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = safeText(value).toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function founderBenefitsJson(body = {}) {
  return JSON.stringify({
    free_account: safeText(body.free_account) === "1",
    free_publishing: safeText(body.free_publishing) === "1",
    free_import: safeText(body.free_import) === "1",
    setup_support: safeText(body.setup_support) === "1",
    homepage_promotion: safeText(body.homepage_promotion) === "1",
    social_promotion: safeText(body.social_promotion) === "1",
    no_sales_commission: safeText(body.no_sales_commission) === "1",
    stock_sync_priority: safeText(body.stock_sync_priority) === "1",
    early_features: safeText(body.early_features) === "1"
  });
}

function nextListingCode(db, companyId) {
  const year = new Date().getFullYear();
  const stem = `EMQ-${year}-`;
  const latest = db.prepare(`
    SELECT listing_code
    FROM emarqet_listings
    WHERE company_id=? AND listing_code LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${stem}%`);
  const last = Number(String(latest?.listing_code || "").split("-").pop() || 0);
  return `${stem}${String(last + 1).padStart(4, "0")}`;
}

function ensureEmarqetSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_verticals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      public_path TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      launch_stage TEXT,
      listing_count_goal INTEGER DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS emarqet_listings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      vertical_id INTEGER,
      listing_code TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT,
      owner_name TEXT,
      owner_email TEXT,
      location TEXT,
      price_amount REAL,
      price_currency TEXT DEFAULT 'RON',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      quality_score INTEGER DEFAULT 0,
      ai_status TEXT DEFAULT 'NEGENERAT',
      metadata_json TEXT,
      primary_image_url TEXT,
      image_urls_json TEXT,
      contact_phone TEXT,
      seller_type TEXT,
      selected_plan_code TEXT,
      promotion_level TEXT DEFAULT '',
      promotion_until TEXT,
      stripe_checkout_status TEXT DEFAULT 'PENDING',
      stripe_checkout_session_id TEXT,
      checkout_token TEXT,
      paid_at TEXT,
      published_at TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, listing_code)
    );

    CREATE TABLE IF NOT EXISTS emarqet_leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      listing_id INTEGER,
      vertical_id INTEGER,
      requester_name TEXT NOT NULL,
      requester_email TEXT,
      requester_phone TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'NOU',
      message TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      email TEXT NOT NULL,
      password_hash TEXT,
      display_name TEXT,
      phone TEXT,
      name_normalized TEXT,
      phone_normalized TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      auth_provider TEXT DEFAULT 'email',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT,
      UNIQUE(company_id, email)
    );

    CREATE TABLE IF NOT EXISTS emarqet_subscriptions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      plan_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TRIAL',
      listing_limit INTEGER DEFAULT 0,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'RON',
      started_at TEXT,
      next_billing_at TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_partner_profiles(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      emarqet_user_id INTEGER NOT NULL,
      partner_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      legal_name TEXT,
      cui TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      city TEXT,
      county TEXT,
      address TEXT,
      selected_plan_code TEXT,
      import_mode TEXT,
      status TEXT NOT NULL DEFAULT 'IN_REVIZIE',
      verified_at TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, emarqet_user_id, partner_type)
    );

    CREATE TABLE IF NOT EXISTS emarqet_partner_imports(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      partner_profile_id INTEGER NOT NULL,
      emarqet_user_id INTEGER NOT NULL,
      vertical_code TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'csv',
      file_name TEXT,
      status TEXT NOT NULL DEFAULT 'PROCESAT',
      total_rows INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      report_json TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_verticals_company ON emarqet_verticals(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_listings_company ON emarqet_listings(company_id, status, vertical_id);
    CREATE INDEX IF NOT EXISTS idx_emarqet_leads_company ON emarqet_leads(company_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_emarqet_subscriptions_company ON emarqet_subscriptions(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_users_company ON emarqet_users(company_id, email, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_partner_profiles_user ON emarqet_partner_profiles(company_id, emarqet_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_partner_imports_profile ON emarqet_partner_imports(company_id, partner_profile_id, created_at);
  `);
  ensureColumn(db, "emarqet_listings", "emarqet_user_id", "INTEGER");
  ensureColumn(db, "emarqet_listings", "partner_profile_id", "INTEGER");
  ensureColumn(db, "emarqet_listings", "metadata_json", "TEXT");
  ensureColumn(db, "emarqet_listings", "primary_image_url", "TEXT");
  ensureColumn(db, "emarqet_listings", "image_urls_json", "TEXT");
  ensureColumn(db, "emarqet_listings", "contact_phone", "TEXT");
  ensureColumn(db, "emarqet_listings", "seller_type", "TEXT");
  ensureColumn(db, "emarqet_listings", "selected_plan_code", "TEXT");
  ensureColumn(db, "emarqet_listings", "promotion_level", "TEXT DEFAULT ''");
  ensureColumn(db, "emarqet_listings", "promotion_until", "TEXT");
  ensureColumn(db, "emarqet_listings", "stripe_checkout_status", "TEXT DEFAULT 'PENDING'");
  ensureColumn(db, "emarqet_listings", "stripe_checkout_session_id", "TEXT");
  ensureColumn(db, "emarqet_listings", "checkout_token", "TEXT");
  ensureColumn(db, "emarqet_listings", "paid_at", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_badge_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_partner_profiles", "founder_badge_label", "TEXT DEFAULT 'Dealer Fondator'");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_start_at", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_end_at", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_json", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_converted_subscription_id", "INTEGER");
  ensureColumn(db, "emarqet_partner_profiles", "founder_notes", "TEXT");
  ensureEmarqetAnalyticsSchema(db);
  ensureEmarqetMonetizationSchema(db);
  ensureMarketplaceServicesSchema(db);
  ensureEmarqetSocialSchema(db);
  ensureEmarqetIntegrationSchema(db);
}

function seedDefaultVerticals(db, companyId, createdBy = "") {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO emarqet_verticals
      (company_id, code, name, public_path, status, launch_stage, listing_count_goal, notes, created_by)
    VALUES
      (@company_id, @code, @name, @public_path, @status, @launch_stage, @listing_count_goal, @notes, @created_by)
  `);

  const update = db.prepare(`
    UPDATE emarqet_verticals
    SET
      name=@name,
      public_path=@public_path,
      status=@status,
      launch_stage=@launch_stage,
      listing_count_goal=@listing_count_goal,
      notes=@notes,
      updated_at=CURRENT_TIMESTAMP
    WHERE company_id=@company_id AND code=@code
  `);

  const trx = db.transaction((rows) => {
    for (const row of rows) {
      const payload = {
        ...row,
        company_id: companyId,
        created_by: createdBy
      };
      const exists = db.prepare("SELECT id FROM emarqet_verticals WHERE company_id=? AND code=? LIMIT 1").get(companyId, row.code);
      if (exists?.id) {
        update.run(payload);
      } else {
        insert.run(payload);
      }
    }
  });
  trx(emarqetDefaultVerticalRows());
}

function bootstrapWorkspace(db, companyId, createdBy = "") {
  seedDefaultVerticals(db, companyId, createdBy);
  seedEmarqetMonetizationCatalog(db, companyId);
  seedMarketplaceServicesCatalog(db, companyId);
  seedEmarqetSocialDefaults(db, companyId);
  seedEmarqetIntegrations(db, companyId, createdBy);
  ensureEmarqetIntegrationReports(db, companyId, createdBy);
}

function loadVerticals(db, companyId) {
  return db.prepare(`
    SELECT
      v.*,
      COUNT(l.id) AS actual_listings,
      SUM(CASE WHEN UPPER(COALESCE(l.status,''))='PUBLICAT' THEN 1 ELSE 0 END) AS published_listings
    FROM emarqet_verticals v
    LEFT JOIN emarqet_listings l ON l.vertical_id=v.id AND l.company_id=v.company_id
    WHERE v.company_id=?
    GROUP BY v.id
    ORDER BY
      CASE UPPER(COALESCE(v.status,''))
        WHEN 'ACTIV' THEN 1
        WHEN 'PLANIFICAT' THEN 2
        ELSE 3
      END,
      v.name COLLATE NOCASE ASC
  `).all(companyId);
}

function loadListings(db, companyId, limit = 300) {
  return db.prepare(`
    SELECT l.*, v.name AS vertical_name, v.code AS vertical_code
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    WHERE l.company_id=?
    ORDER BY l.id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function loadLeads(db, companyId, limit = 300) {
  return db.prepare(`
    SELECT
      lead.*,
      l.title AS listing_title,
      l.listing_code,
      v.name AS vertical_name
    FROM emarqet_leads lead
    LEFT JOIN emarqet_listings l ON l.id=lead.listing_id AND l.company_id=lead.company_id
    LEFT JOIN emarqet_verticals v ON v.id=lead.vertical_id AND v.company_id=lead.company_id
    WHERE lead.company_id=?
    ORDER BY lead.id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function loadSubscriptions(db, companyId, limit = 300) {
  return db.prepare(`
    SELECT *
    FROM emarqet_subscriptions
    WHERE company_id=?
    ORDER BY
      CASE UPPER(COALESCE(status,''))
        WHEN 'ACTIV' THEN 1
        WHEN 'TRIAL' THEN 2
        WHEN 'PAUZAT' THEN 3
        ELSE 4
      END,
      id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function loadPartnerProfiles(db, companyId, limit = 300) {
  return db.prepare(`
    SELECT
      p.*,
      u.email AS account_email,
      u.display_name AS account_name,
      COUNT(l.id) AS listing_count,
      SUM(CASE WHEN UPPER(COALESCE(l.status,''))='PUBLICAT' THEN 1 ELSE 0 END) AS published_count,
      SUM(CASE WHEN UPPER(COALESCE(l.status,''))='IN_REVIZIE' THEN 1 ELSE 0 END) AS review_count,
      SUM(CASE WHEN COALESCE(l.paid_at,'') <> '' OR UPPER(COALESCE(l.stripe_checkout_status,'')) LIKE 'PAID%' THEN 1 ELSE 0 END) AS paid_count
    FROM emarqet_partner_profiles p
    LEFT JOIN emarqet_users u ON u.id=p.emarqet_user_id AND u.company_id=p.company_id
    LEFT JOIN emarqet_listings l ON l.partner_profile_id=p.id AND l.company_id=p.company_id
    WHERE p.company_id=?
    GROUP BY p.id
    ORDER BY
      CASE UPPER(COALESCE(p.status,''))
        WHEN 'IN_REVIZIE' THEN 1
        WHEN 'ACTIV' THEN 2
        WHEN 'PAUZAT' THEN 3
        ELSE 4
      END,
      p.id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function loadPartnerImports(db, companyId, limit = 200) {
  return db.prepare(`
    SELECT
      i.*,
      p.display_name AS partner_name,
      p.partner_type,
      u.email AS account_email
    FROM emarqet_partner_imports i
    LEFT JOIN emarqet_partner_profiles p ON p.id=i.partner_profile_id AND p.company_id=i.company_id
    LEFT JOIN emarqet_users u ON u.id=i.emarqet_user_id AND u.company_id=i.company_id
    WHERE i.company_id=?
    ORDER BY i.id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function loadPendingPartnerListings(db, companyId, limit = 120) {
  return db.prepare(`
    SELECT
      l.*,
      v.name AS vertical_name,
      v.code AS vertical_code,
      p.display_name AS partner_name,
      p.partner_type,
      u.email AS account_email
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    LEFT JOIN emarqet_partner_profiles p ON p.id=l.partner_profile_id AND p.company_id=l.company_id
    LEFT JOIN emarqet_users u ON u.id=l.emarqet_user_id AND u.company_id=l.company_id
    WHERE l.company_id=?
      AND UPPER(COALESCE(l.status,''))='IN_REVIZIE'
      AND (
        l.partner_profile_id IS NOT NULL
        OR COALESCE(l.paid_at,'') <> ''
        OR UPPER(COALESCE(l.stripe_checkout_status,'')) LIKE 'PAID%'
      )
    ORDER BY
      CASE WHEN COALESCE(l.paid_at,'') <> '' OR UPPER(COALESCE(l.stripe_checkout_status,'')) LIKE 'PAID%' THEN 0 ELSE 1 END,
      l.id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function stats(db, companyId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM emarqet_verticals WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS activeVerticals,
      (SELECT COUNT(*) FROM emarqet_listings WHERE company_id=?) AS totalListings,
      (SELECT COUNT(*) FROM emarqet_listings WHERE company_id=? AND UPPER(COALESCE(status,''))='PUBLICAT') AS publishedListings,
      (SELECT COUNT(*) FROM emarqet_leads WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('NOU','CONTACTAT','OFERTA')) AS openLeads,
      (SELECT COUNT(*) FROM emarqet_subscriptions WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('TRIAL','ACTIV')) AS activeSubscriptions,
      (SELECT COUNT(*) FROM emarqet_partner_profiles WHERE company_id=? AND UPPER(COALESCE(status,''))='IN_REVIZIE') AS pendingPartners,
      (SELECT COUNT(*) FROM emarqet_listings WHERE company_id=? AND UPPER(COALESCE(status,''))='IN_REVIZIE' AND (COALESCE(paid_at,'') <> '' OR UPPER(COALESCE(stripe_checkout_status,'')) LIKE 'PAID%')) AS paidPendingListings
  `).get(companyId, companyId, companyId, companyId, companyId, companyId, companyId) || {};
}

function findListing(db, companyId, listingId) {
  if (!listingId) return null;
  return db.prepare("SELECT id, vertical_id FROM emarqet_listings WHERE company_id=? AND id=?").get(companyId, listingId) || null;
}

function ensureVerticalId(db, companyId, rawId) {
  const verticalId = Number(rawId || 0);
  if (!verticalId) return null;
  const row = db.prepare("SELECT id FROM emarqet_verticals WHERE company_id=? AND id=?").get(companyId, verticalId);
  return row?.id || null;
}

function bearerToken(req) {
  const header = safeText(req.get?.("authorization") || req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? safeText(match[1]) : "";
}

function requireMarketplaceApi(req, res, db) {
  const token = bearerToken(req);
  const apiKey = token ? authenticateMarketplaceApiToken(db, token) : null;
  if (!apiKey) {
    res.status(401).json({ ok: false, error: "invalid_api_token" });
    return null;
  }
  return apiKey;
}

function verticalIdForApi(db, companyId, payload = {}) {
  const rawId = Number(payload.vertical_id || 0);
  if (rawId) {
    const existing = ensureVerticalId(db, companyId, rawId);
    if (existing) return existing;
  }
  const code = normalizeCode(payload.vertical_code || payload.category || payload.vertical || "");
  if (code) {
    const row = db.prepare("SELECT id FROM emarqet_verticals WHERE company_id=? AND code=? LIMIT 1").get(companyId, code);
    if (row?.id) return row.id;
  }
  const first = db.prepare(`
    SELECT id
    FROM emarqet_verticals
    WHERE company_id=?
    ORDER BY CASE UPPER(COALESCE(status,'')) WHEN 'ACTIV' THEN 1 ELSE 2 END, id ASC
    LIMIT 1
  `).get(companyId);
  return first?.id || null;
}

function jsonParseSafe(value = "", fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mergeListingMetadata(current = "", patch = {}) {
  return JSON.stringify({
    ...jsonParseSafe(current, {}),
    ...patch,
    updated_via: "marketplace_api",
    updated_at: new Date().toISOString()
  });
}

function apiListingPayload(db, companyId, payload = {}) {
  const title = safeText(payload.title || payload.name);
  if (!title) return { ok: false, error: "title_required" };
  const verticalId = verticalIdForApi(db, companyId, payload);
  if (!verticalId) return { ok: false, error: "vertical_required" };
  const status = normalizeStatus(payload.status || "IN_REVIZIE", LISTING_STATUSES, "IN_REVIZIE");
  return {
    ok: true,
    verticalId,
    title,
    slug: slugify(payload.slug || title) || "",
    ownerName: safeText(payload.owner_name || payload.seller_name),
    ownerEmail: safeText(payload.owner_email || payload.seller_email).toLowerCase(),
    location: safeText(payload.location || payload.city),
    priceAmount: parseAmount(payload.price_amount ?? payload.price),
    priceCurrency: safeText(payload.price_currency || payload.currency).toUpperCase() || "RON",
    status,
    primaryImageUrl: safeText(payload.primary_image_url || payload.image_url),
    imageUrlsJson: Array.isArray(payload.image_urls) ? JSON.stringify(payload.image_urls) : safeText(payload.image_urls_json),
    contactPhone: safeText(payload.contact_phone || payload.phone),
    sellerType: safeText(payload.seller_type || "api"),
    notes: safeText(payload.notes || payload.description),
    metadata: {
      external_id: safeText(payload.external_id || payload.product_id || payload.sku),
      sku: safeText(payload.sku),
      stock: Number(payload.stock ?? 0) || 0,
      description: safeText(payload.description),
      raw: payload
    }
  };
}

function createListingFromApi(db, companyId, payload = {}, actor = "marketplace_api") {
  const normalized = apiListingPayload(db, companyId, payload);
  if (!normalized.ok) return normalized;
  const listingCode = safeText(payload.listing_code) || nextListingCode(db, companyId);
  const exists = db.prepare("SELECT id FROM emarqet_listings WHERE company_id=? AND listing_code=? LIMIT 1").get(companyId, listingCode);
  if (exists?.id) return updateListingFromApi(db, companyId, listingCode, payload, actor);
  db.prepare(`
    INSERT INTO emarqet_listings (
      company_id, vertical_id, listing_code, title, slug, owner_name, owner_email,
      location, price_amount, price_currency, status, quality_score, ai_status,
      metadata_json, primary_image_url, image_urls_json, contact_phone, seller_type,
      published_at, notes, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'NEGENERAT', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    normalized.verticalId,
    listingCode,
    normalized.title,
    normalized.slug || listingCode.toLowerCase(),
    normalized.ownerName,
    normalized.ownerEmail,
    normalized.location,
    normalized.priceAmount,
    normalized.priceCurrency,
    normalized.status,
    JSON.stringify(normalized.metadata),
    normalized.primaryImageUrl,
    normalized.imageUrlsJson,
    normalized.contactPhone,
    normalized.sellerType,
    normalized.status === "PUBLICAT" ? new Date().toISOString().slice(0, 10) : null,
    normalized.notes,
    actor
  );
  return { ok: true, listing_code: listingCode, action: "created" };
}

function updateListingFromApi(db, companyId, listingCode = "", payload = {}, actor = "marketplace_api") {
  const code = safeText(listingCode || payload.listing_code);
  const row = db.prepare("SELECT * FROM emarqet_listings WHERE company_id=? AND listing_code=? LIMIT 1").get(companyId, code);
  if (!row) return { ok: false, error: "listing_missing" };
  const normalized = apiListingPayload(db, companyId, { ...row, ...payload, title: payload.title || row.title });
  if (!normalized.ok) return normalized;
  db.prepare(`
    UPDATE emarqet_listings
    SET vertical_id=?,
        title=?,
        slug=?,
        owner_name=?,
        owner_email=?,
        location=?,
        price_amount=?,
        price_currency=?,
        status=?,
        metadata_json=?,
        primary_image_url=?,
        image_urls_json=?,
        contact_phone=?,
        seller_type=?,
        notes=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND listing_code=?
  `).run(
    normalized.verticalId,
    normalized.title,
    normalized.slug || row.slug,
    normalized.ownerName || row.owner_name,
    normalized.ownerEmail || row.owner_email,
    normalized.location || row.location,
    normalized.priceAmount ?? row.price_amount,
    normalized.priceCurrency || row.price_currency,
    normalized.status || row.status,
    mergeListingMetadata(row.metadata_json, normalized.metadata),
    normalized.primaryImageUrl || row.primary_image_url,
    normalized.imageUrlsJson || row.image_urls_json,
    normalized.contactPhone || row.contact_phone,
    normalized.sellerType || row.seller_type,
    normalized.notes || row.notes,
    companyId,
    code
  );
  return { ok: true, listing_code: code, action: "updated" };
}

function updateListingStockOrPrice(db, companyId, payload = {}, type = "stock") {
  const code = safeText(payload.listing_code);
  const externalId = safeText(payload.external_id || payload.product_id || payload.sku);
  const row = code
    ? db.prepare("SELECT * FROM emarqet_listings WHERE company_id=? AND listing_code=? LIMIT 1").get(companyId, code)
    : db.prepare("SELECT * FROM emarqet_listings WHERE company_id=? AND COALESCE(metadata_json,'') LIKE ? LIMIT 1").get(companyId, `%${externalId}%`);
  if (!row) return { ok: false, error: "listing_missing" };
  const patch = type === "stock"
    ? { stock: Number(payload.stock ?? payload.quantity ?? 0) || 0, stock_status: safeText(payload.stock_status) }
    : { price_amount: Number(payload.price_amount ?? payload.price ?? row.price_amount) || row.price_amount, price_currency: safeText(payload.price_currency || payload.currency || row.price_currency) || row.price_currency };
  if (type === "price") {
    db.prepare(`
      UPDATE emarqet_listings
      SET price_amount=?,
          price_currency=?,
          metadata_json=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(patch.price_amount, patch.price_currency, mergeListingMetadata(row.metadata_json, patch), companyId, row.id);
  } else {
    db.prepare(`
      UPDATE emarqet_listings
      SET metadata_json=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(mergeListingMetadata(row.metadata_json, patch), companyId, row.id);
  }
  return { ok: true, listing_code: row.listing_code, action: `${type}_updated` };
}

export function registerEmarqetRoutes(app, { db, requireAuth }) {
  ensureEmarqetSchema(db);

  app.get("/api/e-marqet/v1/health", (_req, res) => {
    res.json({
      ok: true,
      service: "e-marqet-marketplace-api",
      version: "v1",
      authentication: "Authorization: Bearer <api_token>",
      endpoints: [
        "POST /api/e-marqet/v1/listings",
        "PATCH /api/e-marqet/v1/listings/{listing_code}",
        "POST /api/e-marqet/v1/products/sync",
        "POST /api/e-marqet/v1/stock",
        "POST /api/e-marqet/v1/prices",
        "GET /api/e-marqet/v1/orders"
      ]
    });
  });

  app.post("/api/e-marqet/v1/listings", (req, res) => {
    const apiKey = requireMarketplaceApi(req, res, db);
    if (!apiKey) return;
    bootstrapWorkspace(db, apiKey.company_id, "marketplace_api");
    const result = createListingFromApi(db, apiKey.company_id, req.body || {});
    logEmarqetIntegrationEvent(db, apiKey.company_id, "marketplace_api", {
      action: "api_listings_create",
      direction: "inbound",
      status: result.ok ? "ok" : "error",
      message: result.ok ? `Listing ${result.listing_code} ${result.action}.` : result.error,
      metadata: { body: req.body },
      error: result.ok ? "" : result.error
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.patch("/api/e-marqet/v1/listings/:listingCode", (req, res) => {
    const apiKey = requireMarketplaceApi(req, res, db);
    if (!apiKey) return;
    const result = updateListingFromApi(db, apiKey.company_id, req.params.listingCode, req.body || {});
    logEmarqetIntegrationEvent(db, apiKey.company_id, "marketplace_api", {
      action: "api_listings_update",
      direction: "inbound",
      status: result.ok ? "ok" : "error",
      message: result.ok ? `Listing ${result.listing_code} actualizat.` : result.error,
      metadata: { listingCode: req.params.listingCode, body: req.body },
      error: result.ok ? "" : result.error
    });
    res.status(result.ok ? 200 : 404).json(result);
  });

  app.post("/api/e-marqet/v1/products/sync", (req, res) => {
    const apiKey = requireMarketplaceApi(req, res, db);
    if (!apiKey) return;
    bootstrapWorkspace(db, apiKey.company_id, "marketplace_api");
    const rows = Array.isArray(req.body?.products) ? req.body.products : [req.body || {}];
    const results = rows.map((row) => createListingFromApi(db, apiKey.company_id, {
      ...row,
      title: row.title || row.name || row.product_name,
      listing_code: row.listing_code || row.sku || row.external_id
    }));
    const ok = results.every((row) => row.ok);
    logEmarqetIntegrationEvent(db, apiKey.company_id, "marketplace_api", {
      action: "api_products_sync",
      direction: "inbound",
      status: ok ? "ok" : "partial",
      message: `${results.filter((row) => row.ok).length}/${results.length} produse sincronizate.`,
      metadata: { count: rows.length }
    });
    res.status(ok ? 200 : 207).json({ ok, results });
  });

  app.post("/api/e-marqet/v1/stock", (req, res) => {
    const apiKey = requireMarketplaceApi(req, res, db);
    if (!apiKey) return;
    const rows = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
    const results = rows.map((row) => updateListingStockOrPrice(db, apiKey.company_id, row, "stock"));
    const ok = results.every((row) => row.ok);
    logEmarqetIntegrationEvent(db, apiKey.company_id, "marketplace_api", {
      action: "api_stock_update",
      direction: "inbound",
      status: ok ? "ok" : "partial",
      message: `${results.filter((row) => row.ok).length}/${results.length} stocuri actualizate.`,
      metadata: { count: rows.length }
    });
    res.status(ok ? 200 : 207).json({ ok, results });
  });

  app.post("/api/e-marqet/v1/prices", (req, res) => {
    const apiKey = requireMarketplaceApi(req, res, db);
    if (!apiKey) return;
    const rows = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
    const results = rows.map((row) => updateListingStockOrPrice(db, apiKey.company_id, row, "price"));
    const ok = results.every((row) => row.ok);
    logEmarqetIntegrationEvent(db, apiKey.company_id, "marketplace_api", {
      action: "api_prices_update",
      direction: "inbound",
      status: ok ? "ok" : "partial",
      message: `${results.filter((row) => row.ok).length}/${results.length} preturi actualizate.`,
      metadata: { count: rows.length }
    });
    res.status(ok ? 200 : 207).json({ ok, results });
  });

  app.get("/api/e-marqet/v1/orders", (req, res) => {
    const apiKey = requireMarketplaceApi(req, res, db);
    if (!apiKey) return;
    const rows = db.prepare(`
      SELECT
        lead.id,
        lead.requester_name,
        lead.requester_email,
        lead.requester_phone,
        lead.status,
        lead.message,
        lead.created_at,
        l.listing_code,
        l.title AS listing_title
      FROM emarqet_leads lead
      LEFT JOIN emarqet_listings l ON l.id=lead.listing_id AND l.company_id=lead.company_id
      WHERE lead.company_id=?
      ORDER BY lead.id DESC
      LIMIT 200
    `).all(apiKey.company_id);
    logEmarqetIntegrationEvent(db, apiKey.company_id, "marketplace_api", {
      action: "api_orders_read",
      direction: "inbound",
      status: "ok",
      message: `${rows.length} comenzi/leaduri returnate.`
    });
    res.json({ ok: true, orders: rows });
  });

  app.get("/nexora/e-marqet", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetDashboardPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: stats(db, companyId),
      verticals: loadVerticals(db, companyId),
      listings: loadListings(db, companyId, 8),
      leads: loadLeads(db, companyId, 8),
      subscriptions: loadSubscriptions(db, companyId, 8),
      analytics: loadEmarqetDashboardAnalytics(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/e-marqet/listings", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetListingsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadListings(db, companyId),
      verticals: loadVerticals(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/listings/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const title = safeText(req.body?.title);
    const verticalId = ensureVerticalId(db, companyId, req.body?.vertical_id);
    if (!title || !verticalId) return res.redirect("/nexora/e-marqet/listings?err=required");

    const status = normalizeStatus(req.body?.status, LISTING_STATUSES, "DRAFT");
    const listingCode = nextListingCode(db, companyId);
    db.prepare(`
      INSERT INTO emarqet_listings
        (company_id, vertical_id, listing_code, title, slug, owner_name, owner_email, location, price_amount, price_currency, status, quality_score, ai_status, published_at, notes, created_by)
      VALUES
        (@company_id, @vertical_id, @listing_code, @title, @slug, @owner_name, @owner_email, @location, @price_amount, @price_currency, @status, @quality_score, @ai_status, @published_at, @notes, @created_by)
    `).run({
      company_id: companyId,
      vertical_id: verticalId,
      listing_code: listingCode,
      title,
      slug: slugify(title) || listingCode.toLowerCase(),
      owner_name: safeText(req.body?.owner_name),
      owner_email: safeText(req.body?.owner_email).toLowerCase(),
      location: safeText(req.body?.location),
      price_amount: parseAmount(req.body?.price_amount),
      price_currency: safeText(req.body?.price_currency).toUpperCase() || "RON",
      status,
      quality_score: Math.max(0, Math.min(100, Number(req.body?.quality_score || 0) || 0)),
      ai_status: normalizeStatus(req.body?.ai_status, AI_STATUSES, "NEGENERAT"),
      published_at: status === "PUBLICAT" ? new Date().toISOString().slice(0, 10) : null,
      notes: safeText(req.body?.notes),
      created_by: currentUserEmail(req)
    });
    return res.redirect("/nexora/e-marqet/listings?ok=created");
  });

  app.post("/nexora/e-marqet/listings/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, LISTING_STATUSES, "");
    if (!id || !status) return res.redirect("/nexora/e-marqet/listings?err=invalid");
    const publishedAt = status === "PUBLICAT" ? new Date().toISOString().slice(0, 10) : null;
    const result = db.prepare(`
      UPDATE emarqet_listings
      SET status=?, published_at=COALESCE(?, published_at), updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(status, publishedAt, companyId, id);
    const returnTo = safeText(req.body?.return_to);
    const target = returnTo.startsWith("/nexora/e-marqet/partners") ? "/nexora/e-marqet/partners" : "/nexora/e-marqet/listings";
    return res.redirect(`${target}?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.get("/nexora/e-marqet/partners", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetPartnersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      partnerProfiles: loadPartnerProfiles(db, companyId),
      partnerImports: loadPartnerImports(db, companyId),
      pendingListings: loadPendingPartnerListings(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/partners/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, PARTNER_STATUSES, "");
    if (!id || !status) return res.redirect("/nexora/e-marqet/partners?err=invalid");
    const result = db.prepare(`
      UPDATE emarqet_partner_profiles
      SET status=?,
          verified_at=CASE WHEN ?='ACTIV' THEN COALESCE(verified_at, datetime('now')) ELSE verified_at END,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(status, status, companyId, id);
    return res.redirect(`/nexora/e-marqet/partners?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.post("/nexora/e-marqet/partners/:id/founder", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const id = Number(req.params.id || 0);
    if (!id) return res.redirect("/nexora/e-marqet/partners?err=invalid");
    const result = db.prepare(`
      UPDATE emarqet_partner_profiles
      SET founder_badge_enabled=?,
          founder_badge_label=?,
          founder_benefits_enabled=?,
          founder_benefits_start_at=?,
          founder_benefits_end_at=?,
          founder_benefits_json=?,
          founder_notes=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(
      safeText(req.body?.founder_badge_enabled) === "1" ? 1 : 0,
      safeText(req.body?.founder_badge_label || "Dealer Fondator"),
      safeText(req.body?.founder_benefits_enabled) === "1" ? 1 : 0,
      parseDate(req.body?.founder_benefits_start_at),
      parseDate(req.body?.founder_benefits_end_at),
      founderBenefitsJson(req.body || {}),
      safeText(req.body?.founder_notes),
      companyId,
      id
    );
    return res.redirect(`/nexora/e-marqet/partners?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.post("/nexora/e-marqet/partners/:id/convert-subscription", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const id = Number(req.params.id || 0);
    const partner = db.prepare("SELECT * FROM emarqet_partner_profiles WHERE company_id=? AND id=?").get(companyId, id);
    if (!partner) return res.redirect("/nexora/e-marqet/partners?err=missing");
    const planKey = safeText(req.body?.plan_key || partner.selected_plan_code || "auto_business").toLowerCase();
    const selectedPlan = findEmarqetPricingPlan(db, companyId, planKey);
    const result = db.prepare(`
      INSERT INTO emarqet_subscriptions
        (company_id, customer_name, customer_email, plan_key, status, listing_limit, amount, currency, started_at, next_billing_at, notes, created_by)
      VALUES
        (@company_id, @customer_name, @customer_email, @plan_key, @status, @listing_limit, @amount, @currency, date('now'), date('now', '+30 day'), @notes, @created_by)
    `).run({
      company_id: companyId,
      customer_name: partner.display_name,
      customer_email: safeText(partner.email).toLowerCase(),
      plan_key: planKey,
      status: "TRIAL",
      listing_limit: Number(selectedPlan?.listing_limit ?? 0) || 0,
      amount: Number(selectedPlan?.monthly_price ?? 0) || 0,
      currency: selectedPlan?.currency || "RON",
      notes: `Conversie din Dealer Fondator E-MARQET pentru profil #${partner.id}.`,
      created_by: currentUserEmail(req)
    });
    db.prepare(`
      UPDATE emarqet_partner_profiles
      SET founder_converted_subscription_id=?, updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(Number(result.lastInsertRowid || 0), companyId, id);
    return res.redirect("/nexora/e-marqet/partners?ok=created");
  });

  app.get("/nexora/e-marqet/leads", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetLeadsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadLeads(db, companyId),
      listings: loadListings(db, companyId),
      verticals: loadVerticals(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/leads/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const requesterName = safeText(req.body?.requester_name);
    if (!requesterName) return res.redirect("/nexora/e-marqet/leads?err=required");
    const listing = findListing(db, companyId, Number(req.body?.listing_id || 0));
    const verticalId = listing?.vertical_id || ensureVerticalId(db, companyId, req.body?.vertical_id);
    db.prepare(`
      INSERT INTO emarqet_leads
        (company_id, listing_id, vertical_id, requester_name, requester_email, requester_phone, source, status, message, created_by)
      VALUES
        (@company_id, @listing_id, @vertical_id, @requester_name, @requester_email, @requester_phone, @source, @status, @message, @created_by)
    `).run({
      company_id: companyId,
      listing_id: listing?.id || null,
      vertical_id: verticalId || null,
      requester_name: requesterName,
      requester_email: safeText(req.body?.requester_email).toLowerCase(),
      requester_phone: safeText(req.body?.requester_phone),
      source: safeText(req.body?.source) || "manual",
      status: normalizeStatus(req.body?.status, LEAD_STATUSES, "NOU"),
      message: safeText(req.body?.message),
      created_by: currentUserEmail(req)
    });
    return res.redirect("/nexora/e-marqet/leads?ok=created");
  });

  app.post("/nexora/e-marqet/leads/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, LEAD_STATUSES, "");
    if (!id || !status) return res.redirect("/nexora/e-marqet/leads?err=invalid");
    const result = db.prepare(`
      UPDATE emarqet_leads
      SET status=?, updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(status, companyId, id);
    return res.redirect(`/nexora/e-marqet/leads?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.get("/nexora/e-marqet/subscriptions", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetSubscriptionsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadSubscriptions(db, companyId),
      pricingPlans: loadEmarqetPricingPlans(db, companyId),
      addons: loadEmarqetAddons(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/subscriptions/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const customerName = safeText(req.body?.customer_name);
    const planKey = safeText(req.body?.plan_key).toLowerCase();
    if (!customerName || !planKey) return res.redirect("/nexora/e-marqet/subscriptions?err=required");
    const selectedPlan = findEmarqetPricingPlan(db, companyId, planKey);
    const rawListingLimit = safeText(req.body?.listing_limit);
    const rawAmount = safeText(req.body?.amount);
    const listingLimit = rawListingLimit
      ? Number(req.body?.listing_limit || 0) || 0
      : Number(selectedPlan?.listing_limit ?? 0) || 0;
    const amount = rawAmount
      ? (parseAmount(req.body?.amount) || 0)
      : (Number(selectedPlan?.monthly_price ?? 0) || 0);
    db.prepare(`
      INSERT INTO emarqet_subscriptions
        (company_id, customer_name, customer_email, plan_key, status, listing_limit, amount, currency, started_at, next_billing_at, notes, created_by)
      VALUES
        (@company_id, @customer_name, @customer_email, @plan_key, @status, @listing_limit, @amount, @currency, @started_at, @next_billing_at, @notes, @created_by)
    `).run({
      company_id: companyId,
      customer_name: customerName,
      customer_email: safeText(req.body?.customer_email).toLowerCase(),
      plan_key: planKey,
      status: normalizeStatus(req.body?.status, SUBSCRIPTION_STATUSES, "TRIAL"),
      listing_limit: listingLimit,
      amount,
      currency: safeText(req.body?.currency).toUpperCase() || selectedPlan?.currency || "RON",
      started_at: parseDate(req.body?.started_at),
      next_billing_at: parseDate(req.body?.next_billing_at),
      notes: safeText(req.body?.notes),
      created_by: currentUserEmail(req)
    });
    return res.redirect("/nexora/e-marqet/subscriptions?ok=created");
  });

  app.post("/nexora/e-marqet/subscriptions/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, SUBSCRIPTION_STATUSES, "");
    if (!id || !status) return res.redirect("/nexora/e-marqet/subscriptions?err=invalid");
    const result = db.prepare(`
      UPDATE emarqet_subscriptions
      SET status=?, updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(status, companyId, id);
    return res.redirect(`/nexora/e-marqet/subscriptions?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.get("/nexora/e-marqet/services", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetServicesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      services: loadMarketplaceServices(db, companyId),
      requests: loadMarketplaceServiceRequests(db, companyId),
      listings: loadListings(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/services/request", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const serviceCode = safeText(req.body?.service_code);
    const listing = findListing(db, companyId, Number(req.body?.listing_id || 0));
    if (!serviceCode || !listing?.id) return res.redirect("/nexora/e-marqet/services?err=required");
    try {
      createMarketplaceServiceRequest(db, companyId, {
        service_code: serviceCode,
        listing_id: listing.id,
        vertical_id: listing.vertical_id,
        requester_name: safeText(req.body?.requester_name),
        requester_email: safeText(req.body?.requester_email).toLowerCase(),
        requester_phone: safeText(req.body?.requester_phone),
        status: normalizeStatus(req.body?.status, SERVICE_REQUEST_STATUSES, "NOU"),
        notes: safeText(req.body?.notes),
        created_by: currentUserEmail(req)
      });
    } catch (error) {
      if (String(error?.message || "").includes("marketplace_service_missing")) {
        return res.redirect("/nexora/e-marqet/services?err=missing");
      }
      throw error;
    }
    return res.redirect("/nexora/e-marqet/services?ok=created");
  });

  app.post("/nexora/e-marqet/services/requests/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, SERVICE_REQUEST_STATUSES, "");
    if (!id || !status) return res.redirect("/nexora/e-marqet/services?err=invalid");
    const changes = updateMarketplaceServiceRequestStatus(db, companyId, id, status);
    return res.redirect(`/nexora/e-marqet/services?${changes ? "ok=status" : "err=missing"}`);
  });

  app.get("/nexora/e-marqet/social", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const manualPosts = loadEmarqetManualSharePosts(db, companyId);
    return res.type("html").send(renderEmarqetSocialPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      summary: loadEmarqetSocialSummary(db, companyId),
      accounts: loadEmarqetSocialAccounts(db, companyId),
      targets: loadEmarqetSocialTargets(db, companyId),
      posts: loadEmarqetSocialPosts(db, companyId),
      manualGroups: loadEmarqetManualGroupTargets(db, companyId),
      manualPosts,
      manualSuggestions: loadEmarqetManualShareSuggestions(db, companyId, manualPosts.map((post) => post.id), 9),
      publishJobs: loadEmarqetSocialPublishJobs(db, companyId),
      listings: loadEmarqetSocialListings(db, companyId, 80),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/social/accounts", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = saveEmarqetSocialAccount(db, companyId, req.body || {});
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_account" : `err=${result.error || "invalid"}`}`);
  });

  app.post("/nexora/e-marqet/social/targets", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = upsertEmarqetSocialTarget(db, companyId, req.body || {});
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_target" : `err=${result.error || "invalid"}`}`);
  });

  app.post("/nexora/e-marqet/social/targets/:id", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = upsertEmarqetSocialTarget(db, companyId, { ...(req.body || {}), id: req.params.id });
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_target" : `err=${result.error || "invalid"}`}`);
  });

  app.post("/nexora/e-marqet/social/groups/import", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = importEmarqetManualGroups(db, companyId, req.body || {});
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_groups_imported" : `err=${result.error || "invalid"}`}`);
  });

  app.get("/nexora/e-marqet/social/targets/export.csv", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=emarqet-facebook-targets.csv");
    return res.send(socialTargetsCsv(loadEmarqetSocialTargets(db, companyId, 1000)));
  });

  app.get("/nexora/e-marqet/social/marketplace-feed.csv", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=emarqet-marketplace-feed.csv");
    return res.send(marketplaceCatalogCsv(loadEmarqetMarketplaceFeedRows(db, companyId, 5000)));
  });

  app.post("/nexora/e-marqet/social/generate", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = generateEmarqetSocialPosts(db, companyId, {
      limit: Number(req.body?.limit || 10) || 10,
      includeGroups: safeText(req.body?.include_groups) === "1",
      includeMarketplace: safeText(req.body?.include_marketplace) !== "0",
      createdBy: currentUserEmail(req)
    });
    const ok = result.created > 0 ? "social_generated" : "social_generated_empty";
    return res.redirect(`/nexora/e-marqet/social?ok=${ok}`);
  });

  app.post("/nexora/e-marqet/social/posts/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const result = updateEmarqetSocialPostStatus(db, companyId, req.params.id, req.body?.status);
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_post" : `err=${result.error || "invalid"}`}`);
  });

  app.post("/nexora/e-marqet/social/posts/:id/queue", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = queueEmarqetSocialPost(db, companyId, req.params.id, {
      scheduledAt: safeText(req.body?.scheduled_at)
    });
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_queued" : `err=${result.error || "publish_failed"}`}`);
  });

  app.post("/nexora/e-marqet/social/posts/:id/manual-published", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = markEmarqetSocialPostManualPublished(db, companyId, req.params.id);
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_manual_published" : `err=${result.error || "invalid"}`}`);
  });

  app.post("/nexora/e-marqet/social/posts/:id/manual-share", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = recordEmarqetManualGroupShare(db, companyId, req.params.id, req.body || {});
    return res.redirect(`/nexora/e-marqet/social?${result.ok ? "ok=social_manual_share" : `err=${result.error || "invalid"}`}`);
  });

  app.post("/nexora/e-marqet/social/process", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    try {
      const result = await processEmarqetSocialQueue(db, companyId, 10);
      const ok = result.failed > 0 ? "social_processed_with_errors" : "social_processed";
      return res.redirect(`/nexora/e-marqet/social?ok=${ok}`);
    } catch {
      return res.redirect("/nexora/e-marqet/social?err=publish_failed");
    }
  });

  app.get("/nexora/e-marqet/integrations", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const apiToken = safeText(req.session?.emarqetApiToken);
    delete req.session.emarqetApiToken;
    return res.type("html").send(renderEmarqetIntegrationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      integrations: loadEmarqetIntegrations(db, companyId),
      stats: loadEmarqetIntegrationStats(db, companyId),
      logs: loadEmarqetIntegrationLogs(db, companyId, 80),
      reports: loadEmarqetIntegrationReports(db, companyId, 30),
      apiKeys: loadMarketplaceApiKeys(db, companyId),
      apiToken,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/integrations/:providerKey/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = updateEmarqetIntegrationStatus(db, companyId, req.params.providerKey, req.body || {}, currentUserEmail(req));
    return res.redirect(`/nexora/e-marqet/integrations?${result.ok ? "ok=integration_status" : "err=integration_failed"}`);
  });

  app.post("/nexora/e-marqet/integrations/:providerKey/config", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = saveEmarqetIntegrationConfig(db, companyId, req.params.providerKey, req.body || {}, currentUserEmail(req));
    return res.redirect(`/nexora/e-marqet/integrations?${result.ok ? "ok=integration_config" : "err=integration_failed"}`);
  });

  app.post("/nexora/e-marqet/integrations/:providerKey/credentials", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = saveEmarqetIntegrationCredentials(db, companyId, req.params.providerKey, req.body || {}, currentUserEmail(req));
    return res.redirect(`/nexora/e-marqet/integrations?${result.ok ? "ok=integration_credentials" : "err=integration_failed"}`);
  });

  app.post("/nexora/e-marqet/integrations/:providerKey/test", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    await testEmarqetIntegration(db, companyId, req.params.providerKey, currentUserEmail(req));
    return res.redirect("/nexora/e-marqet/integrations?ok=integration_test");
  });

  app.post("/nexora/e-marqet/integrations/:providerKey/report", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = generateEmarqetIntegrationReport(db, companyId, req.params.providerKey, currentUserEmail(req));
    return res.redirect(`/nexora/e-marqet/integrations?${result.ok ? "ok=integration_report" : "err=integration_failed"}`);
  });

  app.get("/nexora/e-marqet/integrations/reports/:id.md", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const row = db.prepare(`
      SELECT markdown, provider_key
      FROM emarqet_integration_reports
      WHERE company_id=? AND id=?
      LIMIT 1
    `).get(companyId, Number(req.params.id || 0));
    if (!row) return res.status(404).type("text/plain").send("Raport lipsa.");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"emarqet-${safeText(row.provider_key) || "integration"}-report.md\"`);
    return res.send(row.markdown || "");
  });

  app.post("/nexora/e-marqet/integrations/api-keys", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = createMarketplaceApiKey(db, companyId, req.body || {}, currentUserEmail(req));
    if (result.ok) req.session.emarqetApiToken = result.token;
    return res.redirect(`/nexora/e-marqet/integrations?${result.ok ? "ok=api_key_created" : "err=api_key_failed"}`);
  });

  app.post("/nexora/e-marqet/integrations/api-keys/:id/revoke", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    const result = revokeMarketplaceApiKey(db, companyId, req.params.id, currentUserEmail(req));
    return res.redirect(`/nexora/e-marqet/integrations?${result.ok ? "ok=api_key_revoked" : "err=api_key_failed"}`);
  });

  app.get("/nexora/e-marqet/verticals", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetVerticalsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadVerticals(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/e-marqet/verticals/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.redirect("/nexora/e-marqet/verticals?err=required");
    try {
      db.prepare(`
        INSERT INTO emarqet_verticals
          (company_id, code, name, public_path, status, launch_stage, listing_count_goal, notes, created_by)
        VALUES
          (@company_id, @code, @name, @public_path, @status, @launch_stage, @listing_count_goal, @notes, @created_by)
      `).run({
        company_id: companyId,
        code,
        name,
        public_path: safeText(req.body?.public_path) || `/${code.replaceAll("_", "-")}`,
        status: normalizeStatus(req.body?.status, VERTICAL_STATUSES, "PLANIFICAT"),
        launch_stage: safeText(req.body?.launch_stage) || "Roadmap",
        listing_count_goal: Math.max(0, Number(req.body?.listing_count_goal || 0) || 0),
        notes: safeText(req.body?.notes),
        created_by: currentUserEmail(req)
      });
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE")) {
        return res.redirect("/nexora/e-marqet/verticals?err=duplicate");
      }
      throw error;
    }
    return res.redirect("/nexora/e-marqet/verticals?ok=created");
  });

  app.post("/nexora/e-marqet/verticals/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, VERTICAL_STATUSES, "");
    if (!id || !status) return res.redirect("/nexora/e-marqet/verticals?err=invalid");
    const result = db.prepare(`
      UPDATE emarqet_verticals
      SET status=?, updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(status, companyId, id);
    return res.redirect(`/nexora/e-marqet/verticals?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.get("/nexora/e-marqet/settings", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    bootstrapWorkspace(db, companyId, currentUserEmail(req));
    return res.type("html").send(renderEmarqetSettingsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: stats(db, companyId),
      verticals: loadVerticals(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });
}
