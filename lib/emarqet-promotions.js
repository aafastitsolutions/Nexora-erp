import {
  runEmarqetInvoiceAutomation,
  upsertEmarqetBillingPayment
} from "./emarqet-billing.js";
import {
  createMarketplaceServiceRequest,
  ensureMarketplaceServicesSchema
} from "./emarqet-marketplace-services.js";
import { emarqetSupportEmail } from "./emarqet-mailboxes.js";

const PROMOTION_ADDON_CATEGORIES = new Set(["promovare", "distributie"]);

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function safeJson(value = {}) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJson(value = "", fallback = {}) {
  try {
    const parsed = value ? JSON.parse(String(value)) : fallback;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function ensureColumn(db, table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function normalizeCompanyId(companyId = 0) {
  return Number(companyId || 0);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateAfterDays(days = 0) {
  const numeric = Number(days || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Math.round(numeric));
  return date.toISOString().slice(0, 10);
}

function parseDaysFromText(value = "") {
  const match = safeText(value).match(/(\d+)\s*zile/i);
  return match ? Number(match[1] || 0) : 0;
}

function rowListing(db, companyId, listingId) {
  return db.prepare(`
    SELECT
      l.*,
      v.name AS vertical_name,
      v.code AS vertical_code
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    WHERE l.company_id=? AND l.id=?
    LIMIT 1
  `).get(normalizeCompanyId(companyId), Number(listingId || 0)) || null;
}

export function ensureEmarqetPromotionsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_promotion_orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      listing_id INTEGER NOT NULL,
      emarqet_user_id INTEGER,
      partner_profile_id INTEGER,
      addon_code TEXT NOT NULL,
      addon_name TEXT NOT NULL,
      addon_category TEXT,
      billing_unit TEXT,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'RON',
      status TEXT DEFAULT 'CHECKOUT_CREATED',
      fulfillment_status TEXT DEFAULT 'ASTEPTARE_PLATA',
      promotion_level TEXT DEFAULT '',
      promotion_until TEXT,
      requester_name TEXT,
      requester_email TEXT,
      requester_phone TEXT,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      stripe_invoice_id TEXT,
      paid_at TEXT,
      metadata_json TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emq_promotion_orders_company
      ON emarqet_promotion_orders(company_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_emq_promotion_orders_listing
      ON emarqet_promotion_orders(company_id, listing_id, status);
    CREATE INDEX IF NOT EXISTS idx_emq_promotion_orders_stripe
      ON emarqet_promotion_orders(company_id, stripe_checkout_session_id);
  `);

  ensureColumn(db, "emarqet_promotion_orders", "emarqet_user_id", "INTEGER");
  ensureColumn(db, "emarqet_promotion_orders", "partner_profile_id", "INTEGER");
  ensureColumn(db, "emarqet_promotion_orders", "addon_category", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "billing_unit", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "fulfillment_status", "TEXT DEFAULT 'ASTEPTARE_PLATA'");
  ensureColumn(db, "emarqet_promotion_orders", "promotion_level", "TEXT DEFAULT ''");
  ensureColumn(db, "emarqet_promotion_orders", "promotion_until", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "requester_name", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "requester_email", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "requester_phone", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "stripe_payment_intent_id", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "stripe_invoice_id", "TEXT");
  ensureColumn(db, "emarqet_promotion_orders", "paid_at", "TEXT");
}

export function isEmarqetPromotionAddon(addon = {}) {
  return PROMOTION_ADDON_CATEGORIES.has(safeText(addon.category).toLowerCase());
}

export function isEmarqetListingBoostAddon(addon = {}) {
  return safeText(addon.category).toLowerCase() === "promovare";
}

export function promotionDaysForAddon(addon = {}) {
  const code = safeText(addon.code).toLowerCase();
  const unitDays = parseDaysFromText(addon.billing_unit);
  if (unitDays) return unitDays;
  if (code.includes("_7")) return 7;
  if (code.includes("_30")) return 30;
  if (code.includes("top_category")) return 14;
  if (code.includes("highlight")) return 30;
  if (safeText(addon.category).toLowerCase() === "distributie") return 7;
  return 30;
}

export function promotionUntilForAddon(addon = {}) {
  return dateAfterDays(promotionDaysForAddon(addon));
}

export function createEmarqetPromotionOrder(db, companyId, listing = {}, addon = {}, payload = {}) {
  ensureEmarqetPromotionsSchema(db);
  const amount = Number(addon.price_amount ?? payload.amount ?? 0) || 0;
  const currency = safeText(addon.currency || payload.currency || "RON").toUpperCase();
  const isListingBoost = isEmarqetListingBoostAddon(addon);
  const promotionUntil = isListingBoost ? promotionUntilForAddon(addon) : "";
  const result = db.prepare(`
    INSERT INTO emarqet_promotion_orders (
      company_id, listing_id, emarqet_user_id, partner_profile_id,
      addon_code, addon_name, addon_category, billing_unit, amount, currency,
      status, fulfillment_status, promotion_level, promotion_until,
      requester_name, requester_email, requester_phone, metadata_json, notes, created_by
    )
    VALUES (
      @company_id, @listing_id, @emarqet_user_id, @partner_profile_id,
      @addon_code, @addon_name, @addon_category, @billing_unit, @amount, @currency,
      @status, @fulfillment_status, @promotion_level, @promotion_until,
      @requester_name, @requester_email, @requester_phone, @metadata_json, @notes, @created_by
    )
  `).run({
    company_id: normalizeCompanyId(companyId || listing.company_id),
    listing_id: Number(listing.id || 0),
    emarqet_user_id: Number(listing.emarqet_user_id || payload.emarqet_user_id || 0) || null,
    partner_profile_id: Number(listing.partner_profile_id || payload.partner_profile_id || 0) || null,
    addon_code: safeText(addon.code),
    addon_name: safeText(addon.name || addon.code),
    addon_category: safeText(addon.category),
    billing_unit: safeText(addon.billing_unit),
    amount,
    currency,
    status: safeText(payload.status || "CHECKOUT_CREATED"),
    fulfillment_status: safeText(payload.fulfillment_status || "ASTEPTARE_PLATA"),
    promotion_level: isListingBoost ? safeText(addon.code) : "",
    promotion_until: promotionUntil || null,
    requester_name: safeText(payload.requester_name || listing.owner_name),
    requester_email: normalizeEmail(payload.requester_email || listing.owner_email),
    requester_phone: safeText(payload.requester_phone || listing.contact_phone),
    metadata_json: safeJson(payload.metadata || {}),
    notes: safeText(payload.notes),
    created_by: safeText(payload.created_by || "emarqet-public")
  });
  return findEmarqetPromotionOrderById(db, companyId, Number(result.lastInsertRowid || 0));
}

export function attachStripeSessionToPromotionOrder(db, companyId, orderId, sessionId = "") {
  ensureEmarqetPromotionsSchema(db);
  return db.prepare(`
    UPDATE emarqet_promotion_orders
    SET stripe_checkout_session_id=?,
        status='CHECKOUT_CREATED',
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(safeText(sessionId), normalizeCompanyId(companyId), Number(orderId || 0));
}

export function markPromotionOrderFailed(db, companyId, orderId, reason = "") {
  ensureEmarqetPromotionsSchema(db);
  return db.prepare(`
    UPDATE emarqet_promotion_orders
    SET status='FAILED',
        fulfillment_status='ESUAT',
        notes=CASE WHEN ? <> '' THEN ? ELSE notes END,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(safeText(reason), safeText(reason), normalizeCompanyId(companyId), Number(orderId || 0));
}

export function findEmarqetPromotionOrderById(db, companyId, orderId) {
  ensureEmarqetPromotionsSchema(db);
  return db.prepare(`
    SELECT
      o.*,
      l.title AS listing_title,
      l.listing_code,
      l.slug AS listing_slug,
      l.vertical_id,
      l.owner_name,
      l.owner_email,
      l.contact_phone,
      v.name AS vertical_name,
      v.code AS vertical_code
    FROM emarqet_promotion_orders o
    LEFT JOIN emarqet_listings l ON l.id=o.listing_id AND l.company_id=o.company_id
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    WHERE o.company_id=? AND o.id=?
    LIMIT 1
  `).get(normalizeCompanyId(companyId), Number(orderId || 0)) || null;
}

export function findEmarqetPromotionOrderByStripeSession(db, companyId, sessionId = "") {
  ensureEmarqetPromotionsSchema(db);
  const safeSession = safeText(sessionId);
  if (!safeSession) return null;
  return db.prepare(`
    SELECT
      o.*,
      l.title AS listing_title,
      l.listing_code,
      l.slug AS listing_slug,
      l.vertical_id,
      l.owner_name,
      l.owner_email,
      l.contact_phone,
      v.name AS vertical_name,
      v.code AS vertical_code
    FROM emarqet_promotion_orders o
    LEFT JOIN emarqet_listings l ON l.id=o.listing_id AND l.company_id=o.company_id
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    WHERE o.company_id=? AND o.stripe_checkout_session_id=?
    ORDER BY o.id DESC
    LIMIT 1
  `).get(normalizeCompanyId(companyId), safeSession) || null;
}

export function loadEmarqetPromotionOrders(db, companyId, limit = 200) {
  ensureEmarqetPromotionsSchema(db);
  return db.prepare(`
    SELECT
      o.*,
      l.title AS listing_title,
      l.listing_code,
      l.slug AS listing_slug,
      v.name AS vertical_name,
      v.code AS vertical_code
    FROM emarqet_promotion_orders o
    LEFT JOIN emarqet_listings l ON l.id=o.listing_id AND l.company_id=o.company_id
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    WHERE o.company_id=?
    ORDER BY
      CASE UPPER(COALESCE(o.status,''))
        WHEN 'PAID' THEN 1
        WHEN 'CHECKOUT_CREATED' THEN 2
        WHEN 'PROCESSING' THEN 3
        ELSE 4
      END,
      o.id DESC
    LIMIT ?
  `).all(normalizeCompanyId(companyId), Number(limit || 200));
}

export function setAdminListingPromotion(db, companyId, listingId, payload = {}) {
  ensureEmarqetPromotionsSchema(db);
  const listing = rowListing(db, companyId, listingId);
  if (!listing?.id) return { changes: 0 };
  const action = safeText(payload.action).toLowerCase();
  if (action === "clear") {
    return db.prepare(`
      UPDATE emarqet_listings
      SET promotion_level='',
          promotion_until=NULL,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=?
    `).run(normalizeCompanyId(companyId), Number(listingId || 0));
  }
  const days = Number(payload.days || 30);
  const until = days > 0 ? dateAfterDays(days) : "";
  const metadata = {
    ...parseJson(listing.metadata_json),
    promotion_admin: {
      enabled: true,
      actor: safeText(payload.actor),
      set_at: new Date().toISOString(),
      days: days > 0 ? days : null,
      until: until || null
    }
  };
  return db.prepare(`
    UPDATE emarqet_listings
    SET promotion_level='admin_top',
        promotion_until=?,
        metadata_json=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(until || null, safeJson(metadata), normalizeCompanyId(companyId), Number(listingId || 0));
}

function metadataForPayment(order = {}, listing = {}, extra = {}) {
  return {
    emarqet_company_id: String(order.company_id || listing.company_id || ""),
    checkout_kind: "emarqet_promotion",
    invoice_brand: "e-Marqet",
    invoice_label_prefix: "Promovare e-Marqet",
    invoice_line_label: `Promovare e-Marqet - ${order.addon_name || order.addon_code}`,
    invoice_unit: order.billing_unit || "campanie",
    promotion_order_id: order.id,
    addon_code: order.addon_code,
    addon_name: order.addon_name,
    addon_category: order.addon_category,
    fulfillment_status: order.fulfillment_status,
    promotion_level: order.promotion_level,
    promotion_until: order.promotion_until,
    listing_id: listing.id || order.listing_id,
    listing_code: listing.listing_code || order.listing_code,
    listing_title: listing.title || order.listing_title,
    source: "emarqet_promotion_checkout",
    ...extra
  };
}

function paymentPlanForOrder(order = {}) {
  return {
    code: order.addon_code,
    name: order.addon_name,
    monthly_price: Number(order.amount || 0),
    currency: order.currency || "RON"
  };
}

function listingForOrder(order = {}) {
  return {
    id: order.listing_id,
    company_id: order.company_id,
    listing_code: order.listing_code,
    slug: order.listing_slug,
    title: order.listing_title,
    owner_name: order.requester_name || order.owner_name,
    owner_email: order.requester_email || order.owner_email,
    contact_phone: order.requester_phone || order.contact_phone,
    price_currency: order.currency || "RON"
  };
}

function applyPaidListingPromotion(db, companyId, order = {}) {
  if (!safeText(order.promotion_level)) return { changes: 0 };
  const listing = rowListing(db, companyId, order.listing_id);
  if (!listing?.id) return { changes: 0 };
  const metadata = {
    ...parseJson(listing.metadata_json),
    promotion_paid: {
      order_id: order.id,
      addon_code: order.addon_code,
      addon_name: order.addon_name,
      stripe_checkout_session_id: order.stripe_checkout_session_id,
      paid_at: order.paid_at || new Date().toISOString(),
      until: order.promotion_until || null
    }
  };
  return db.prepare(`
    UPDATE emarqet_listings
    SET promotion_level=?,
        promotion_until=?,
        metadata_json=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(
    safeText(order.promotion_level),
    safeText(order.promotion_until) || null,
    safeJson(metadata),
    normalizeCompanyId(companyId),
    Number(order.listing_id || 0)
  );
}

function recordPromotionLead(db, companyId, order = {}) {
  const existing = db.prepare(`
    SELECT id
    FROM emarqet_leads
    WHERE company_id=?
      AND source='promotion_paid'
      AND message LIKE ?
    LIMIT 1
  `).get(normalizeCompanyId(companyId), `%promotion_order_id:${Number(order.id || 0)}%`);
  if (existing?.id) return existing.id;
  const message = [
    `Promovare achitata: ${order.addon_name || order.addon_code}`,
    `Anunt: ${order.listing_code || order.listing_id} - ${order.listing_title || ""}`,
    `Suma: ${Number(order.amount || 0).toLocaleString("ro-RO")} ${order.currency || "RON"}`,
    order.stripe_checkout_session_id ? `Stripe session: ${order.stripe_checkout_session_id}` : "",
    order.promotion_until ? `Activ pana la: ${order.promotion_until}` : "Necesita operare manuala.",
    `promotion_order_id:${Number(order.id || 0)}`
  ].filter(Boolean).join("\n");
  const result = db.prepare(`
    INSERT INTO emarqet_leads
      (company_id, listing_id, vertical_id, requester_name, requester_email, requester_phone, source, status, message, created_by)
    VALUES
      (@company_id, @listing_id, @vertical_id, @requester_name, @requester_email, @requester_phone, 'promotion_paid', 'NOU', @message, 'stripe')
  `).run({
    company_id: normalizeCompanyId(companyId),
    listing_id: Number(order.listing_id || 0) || null,
    vertical_id: Number(order.vertical_id || 0) || null,
    requester_name: safeText(order.requester_name || order.owner_name),
    requester_email: normalizeEmail(order.requester_email || order.owner_email),
    requester_phone: safeText(order.requester_phone || order.contact_phone),
    message
  });
  return Number(result.lastInsertRowid || 0);
}

function recordPromotionServiceRequest(db, companyId, order = {}) {
  ensureMarketplaceServicesSchema(db);
  const existing = db.prepare(`
    SELECT id
    FROM emarqet_service_requests
    WHERE company_id=?
      AND channel='promotion_checkout'
      AND request_payload_json LIKE ?
    LIMIT 1
  `).get(normalizeCompanyId(companyId), `%"promotion_order_id":${Number(order.id || 0)}%`);
  if (existing?.id) return existing.id;
  try {
    return createMarketplaceServiceRequest(db, companyId, {
      service_code: "verified_listing_promo",
      listing_id: Number(order.listing_id || 0) || null,
      vertical_id: Number(order.vertical_id || 0) || null,
      requester_name: safeText(order.requester_name || order.owner_name),
      requester_email: normalizeEmail(order.requester_email || order.owner_email),
      requester_phone: safeText(order.requester_phone || order.contact_phone),
      amount: Number(order.amount || 0) || 0,
      currency: safeText(order.currency || "RON").toUpperCase(),
      status: "NOU",
      channel: "promotion_checkout",
      mailbox: emarqetSupportEmail(),
      request_payload: {
        promotion_order_id: Number(order.id || 0),
        addon_code: order.addon_code,
        addon_name: order.addon_name,
        addon_category: order.addon_category,
        listing_code: order.listing_code,
        stripe_checkout_session_id: order.stripe_checkout_session_id,
        promotion_until: order.promotion_until
      },
      notes: `Promovare achitata: ${order.addon_name || order.addon_code}.`,
      created_by: "stripe"
    });
  } catch {
    return null;
  }
}

export function isEmarqetPromotionStripeMetadata(metadata = {}) {
  return safeText(metadata.checkout_kind).toLowerCase() === "emarqet_promotion"
    || Boolean(safeText(metadata.promotion_order_id));
}

export async function finalizeEmarqetPromotionStripePayment(db, options = {}) {
  const metadata = options.metadata || {};
  const companyId = normalizeCompanyId(options.companyId || metadata.emarqet_company_id);
  if (!companyId) return { ok: false, reason: "company_missing" };
  const sessionId = safeText(options.stripeCheckoutSessionId || options.sessionId || options.source?.id);
  const orderId = Number(options.orderId || metadata.promotion_order_id || 0);
  let order = orderId
    ? findEmarqetPromotionOrderById(db, companyId, orderId)
    : findEmarqetPromotionOrderByStripeSession(db, companyId, sessionId);
  if (!order && sessionId) order = findEmarqetPromotionOrderByStripeSession(db, companyId, sessionId);
  if (!order?.id) return { ok: false, reason: "promotion_order_missing" };

  const paid = String(options.status || "").toLowerCase() === "paid";
  if (paid && String(order.status || "").toUpperCase() === "PAID") {
    return { ok: true, orderId: order.id, listingId: order.listing_id, alreadyPaid: true };
  }
  const paidAt = safeText(options.paidAt) || new Date().toISOString();
  const fulfillmentStatus = paid
    ? (safeText(order.promotion_level) ? "ACTIVAT" : "DE_LUCRU")
    : "ASTEPTARE_PLATA";
  const status = paid ? "PAID" : safeText(options.status || "PROCESSING").toUpperCase();

  db.prepare(`
    UPDATE emarqet_promotion_orders
    SET status=?,
        fulfillment_status=?,
        stripe_checkout_session_id=CASE WHEN ? <> '' THEN ? ELSE stripe_checkout_session_id END,
        stripe_payment_intent_id=CASE WHEN ? <> '' THEN ? ELSE stripe_payment_intent_id END,
        stripe_invoice_id=CASE WHEN ? <> '' THEN ? ELSE stripe_invoice_id END,
        paid_at=CASE WHEN ?='PAID' THEN COALESCE(paid_at, ?) ELSE paid_at END,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(
    status,
    fulfillmentStatus,
    sessionId,
    sessionId,
    safeText(options.stripePaymentIntentId),
    safeText(options.stripePaymentIntentId),
    safeText(options.stripeInvoiceId),
    safeText(options.stripeInvoiceId),
    status,
    paidAt,
    companyId,
    order.id
  );

  order = findEmarqetPromotionOrderById(db, companyId, order.id);
  const listing = listingForOrder(order);
  const payment = upsertEmarqetBillingPayment(db, companyId, listing, paymentPlanForOrder(order), {
    source: "stripe",
    provider_event_type: safeText(options.providerEventType || "stripe.emarqet_promotion"),
    status: paid ? "paid" : "processing",
    amount: Number(options.amount ?? order.amount ?? 0) || 0,
    currency: safeText(options.currency || order.currency || "RON"),
    stripe_checkout_session_id: sessionId,
    stripe_invoice_id: safeText(options.stripeInvoiceId),
    stripe_payment_intent_id: safeText(options.stripePaymentIntentId),
    reference_code: sessionId || safeText(options.referenceCode),
    paid_at: paid ? paidAt : "",
    stripe_billing_details: options.stripeBillingDetails || {},
    notes: paid ? "Promovare e-Marqet achitata prin Stripe." : "Checkout promovare e-Marqet creat.",
    metadata: safeJson(metadataForPayment(order, listing, metadata))
  });

  let invoice = null;
  let invoiceError = null;
  if (paid) {
    applyPaidListingPromotion(db, companyId, order);
    recordPromotionLead(db, companyId, order);
    recordPromotionServiceRequest(db, companyId, order);
    try {
      invoice = await runEmarqetInvoiceAutomation(db, payment.id || payment.lastInsertRowid, {
        livemode: Boolean(options.livemode),
        ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated,
        transporter: options.transporter
      });
    } catch (error) {
      invoiceError = {
        message: safeText(error?.message || error),
        code: safeText(error?.code)
      };
      console.error("[EMARQET] Promotion invoice automation failed:", invoiceError.message || invoiceError.code || error);
    }
  }

  return { ok: true, orderId: order.id, listingId: order.listing_id, paymentId: payment.id || payment.lastInsertRowid, invoice, invoiceError };
}
