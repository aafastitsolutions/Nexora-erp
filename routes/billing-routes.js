import express from "express";
import Stripe from "stripe";
import { maybeSendBillingInvoiceToEfactura } from "../lib/billing-efactura.js";
import { maybeEmailBillingInvoice } from "../lib/billing-invoice-email.js";
import { maybeGenerateBillingInvoicePdf } from "../lib/billing-invoice-pdf.js";
import { maybeGenerateBillingInvoice } from "../lib/billing-invoices.js";
import {
  emarqetStripeBillingDetails,
  finalizeEmarqetStripePayment,
  findEmarqetListingForStripe,
  findEmarqetPlanForListing
} from "../lib/emarqet-billing.js";
import {
  finalizeEmarqetPromotionStripePayment,
  isEmarqetPromotionStripeMetadata,
  markPromotionOrderFailed
} from "../lib/emarqet-promotions.js";
import { planChargeAmount, planChargeQuantity } from "../lib/app-config.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

function stripeConfigured() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
}

function stripeWebhookConfigured() {
  return Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim());
}

function stripeWebhookSecrets() {
  return [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.EMARQET_STRIPE_WEBHOOK_SECRET,
    process.env.NEXORA_STRIPE_WEBHOOK_SECRET
  ]
    .map((value) => String(value || "").trim())
    .filter((value, index, all) => value && all.indexOf(value) === index);
}

function constructStripeWebhookEvent(stripe, body, signature, secrets = []) {
  let lastError = null;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Invalid signature");
}

function envEnabled(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return Boolean(defaultValue);
  return ["1", "true", "yes", "on"].includes(raw);
}

function stripeAutomaticTaxEnabled() {
  return envEnabled("STRIPE_AUTOMATIC_TAX_ENABLED", false);
}

function stripeTaxIdCollectionEnabled() {
  return envEnabled("STRIPE_TAX_ID_COLLECTION_ENABLED", true);
}

function appBaseUrl(req) {
  const envUrl = String(process.env.APP_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function toStripeAmount(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function fromStripeAmount(value) {
  return Number(value || 0) / 100;
}

function isoFromStripeTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

function normalizeStripeCountry(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.toUpperCase() === "RO" ? "Romania" : raw.toUpperCase();
}

function stripeAddressLines(address = {}) {
  return [
    address.line1,
    address.line2,
    address.postal_code,
    address.city,
    address.state,
    normalizeStripeCountry(address.country)
  ].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

function firstStripeTaxId(source = {}) {
  const candidates = [
    source?.customer_details?.tax_ids,
    source?.customer_tax_ids,
    source?.tax_ids
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) {
      const found = item.find((taxId) => String(taxId?.value || "").trim());
      if (found) return {
        type: String(found.type || "").trim(),
        value: String(found.value || "").replace(/\s+/g, "").toUpperCase()
      };
    }
  }
  return { type: "", value: "" };
}

function stripeBillingDetails(source = {}) {
  const details = source?.customer_details || {};
  const taxId = firstStripeTaxId(source);
  const address = details.address || source?.customer_address || {};
  return {
    name: String(details.name || source?.customer_name || "").trim(),
    email: String(details.email || source?.customer_email || "").trim().toLowerCase(),
    tax_id_type: taxId.type,
    tax_id: taxId.value,
    address: stripeAddressLines(address),
    country: normalizeStripeCountry(address.country)
  };
}

function stripeSubscriptionMetadata(source = {}) {
  const candidates = [
    source?.metadata,
    source?.subscription_details?.metadata,
    source?.parent?.subscription_details?.metadata,
    source?.lines?.data?.[0]?.metadata
  ];
  for (const metadata of candidates) {
    if (metadata && typeof metadata === "object" && Object.keys(metadata).length) return metadata;
  }
  return {};
}

function trevoroBillingMetadata(source = {}, billingDetails = {}, extra = {}) {
  const metadata = stripeSubscriptionMetadata(source);
  const propertyCount = Number(metadata.billing_property_count || metadata.property_count || 0);
  const unitAmount = Number(metadata.billing_unit_amount || metadata.unit_amount || 0);
  const totalAmount = Number(metadata.billing_amount || metadata.total_amount || 0);
  const propertyIds = String(metadata.billing_property_ids || metadata.property_ids || "")
    .split(",")
    .map((item) => Number(String(item || "").trim() || 0))
    .filter(Boolean);
  return {
    ...extra,
    property_count: propertyCount || undefined,
    property_ids: propertyIds.length ? propertyIds : undefined,
    unit_amount: unitAmount || undefined,
    total_amount: totalAmount || undefined,
    currency: String(metadata.billing_currency || source?.currency || "").toUpperCase() || undefined,
    stripe_billing_details: billingDetails
  };
}

function emarqetMetadata(source = {}) {
  const metadata = stripeSubscriptionMetadata(source);
  return metadata?.emarqet_company_id ? metadata : {};
}

function nextPdfPriceIds() {
  return new Set([
    process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID,
    process.env.NEXTPDF_STRIPE_ANNUAL_PRICE_ID,
    process.env.STRIPE_NEXTPDF_MONTHLY_PRICE_ID,
    process.env.STRIPE_NEXTPDF_ANNUAL_PRICE_ID
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function stripePriceIds(source = {}) {
  const lines = Array.isArray(source?.lines?.data) ? source.lines.data : [];
  const directItems = Array.isArray(source?.line_items?.data) ? source.line_items.data : [];
  return [...lines, ...directItems]
    .map((line) => String(line?.price?.id || line?.pricing?.price_details?.price || "").trim())
    .filter(Boolean);
}

function nextPdfAccountId(source = {}) {
  const metadata = stripeSubscriptionMetadata(source);
  const metadataId = Number(metadata.nextpdf_account_id || 0);
  if (metadataId) return metadataId;
  const reference = String(source?.client_reference_id || "");
  const match = reference.match(/^np_(\d+)_/);
  return match ? Number(match[1] || 0) : 0;
}

export function isNextPdfStripeObject(source = {}) {
  const metadata = stripeSubscriptionMetadata(source);
  if (metadata.nextpdf_account_id || String(metadata.nextpdf_product || "").toLowerCase() === "nextpdf") return true;
  if (/^np_\d+_[ma]_/.test(String(source?.client_reference_id || ""))) return true;
  const configured = nextPdfPriceIds();
  return stripePriceIds(source).some((priceId) => configured.has(priceId));
}

function nextPdfIssuerCompanyId(db) {
  const explicitId = Number(process.env.BILLING_ISSUER_COMPANY_ID || 0);
  if (explicitId) return explicitId;
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const row = adminEmail
    ? db.prepare("SELECT company_id FROM users WHERE LOWER(email)=? AND company_id IS NOT NULL ORDER BY id LIMIT 1").get(adminEmail)
    : null;
  return Number(row?.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
}

export function nextPdfPlanDetails(source = {}) {
  const ids = stripePriceIds(source);
  const monthlyId = String(process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_NEXTPDF_MONTHLY_PRICE_ID || "").trim();
  const annualId = String(process.env.NEXTPDF_STRIPE_ANNUAL_PRICE_ID || process.env.STRIPE_NEXTPDF_ANNUAL_PRICE_ID || "").trim();
  if (annualId && ids.includes(annualId)) return { plan: "premium_annual", label: "Abonament NextPDF Premium anual", unit: "an" };
  if (monthlyId && ids.includes(monthlyId)) return { plan: "premium_monthly", label: "Abonament NextPDF Premium lunar", unit: "luna" };
  const metadata = stripeSubscriptionMetadata(source);
  return String(metadata.nextpdf_plan_id || "").includes("annual")
    ? { plan: "premium_annual", label: "Abonament NextPDF Premium anual", unit: "an" }
    : { plan: "premium_monthly", label: "Abonament NextPDF Premium lunar", unit: "luna" };
}

async function handleNextPdfStripePayment(db, source = {}, eventType = "", options = {}) {
  if (!isNextPdfStripeObject(source)) return { handled: false };
  const companyId = nextPdfIssuerCompanyId(db);
  if (!companyId) return { handled: true, ok: false, reason: "issuer_company_missing" };
  const billingDetails = stripeBillingDetails(source);
  const subscription = typeof source?.subscription === "string"
    ? source.subscription
    : String(source?.subscription?.id || source?.parent?.subscription_details?.subscription || "");
  const paymentIntent = typeof source?.payment_intent === "string" ? source.payment_intent : String(source?.payment_intent?.id || "");
  const checkoutId = eventType === "checkout.session.completed" ? String(source?.id || "") : "";
  const invoiceId = eventType.startsWith("invoice.")
    ? String(source?.id || "")
    : typeof source?.invoice === "string"
      ? source.invoice
      : String(source?.invoice?.id || "");
  const paid = eventType === "invoice.paid" || (eventType === "checkout.session.completed" && ["paid", "no_payment_required"].includes(String(source?.payment_status || "").toLowerCase()));
  const failed = eventType === "invoice.payment_failed";
  const plan = nextPdfPlanDetails(source);
  const amount = fromStripeAmount(source?.amount_paid || source?.amount_total || source?.amount_due || 0);
  const paidAt = isoFromStripeTimestamp(source?.status_transitions?.paid_at || source?.created) || new Date().toISOString();
  const metadata = {
    ...stripeSubscriptionMetadata(source),
    product: "nextpdf",
    nextpdf: true,
    nextpdf_account_id: nextPdfAccountId(source) || undefined,
    nextpdf_plan_id: plan.plan,
    external_payer: true,
    allow_consumer_without_fiscal_id: true,
    invoice_line_label: plan.label,
    invoice_label_prefix: "Abonament NextPDF",
    invoice_unit: plan.unit,
    payer_name: billingDetails.name || billingDetails.email || "Client NextPDF",
    payer_email: billingDetails.email,
    payer_cui: billingDetails.tax_id,
    payer_address: billingDetails.address,
    payer_country: billingDetails.country || "Romania",
    stripe_billing_details: billingDetails
  };
  const paymentId = upsertBillingPayment(db, {
    companyId,
    source: "stripe",
    providerEventType: eventType,
    paymentKind: "nextpdf_subscription",
    status: paid ? "paid" : failed ? "failed" : "processing",
    amount,
    currency: String(source?.currency || "ron"),
    payerName: billingDetails.name,
    payerEmail: billingDetails.email || String(source?.customer_email || ""),
    referenceCode: String(source?.number || source?.id || ""),
    stripeCheckoutSessionId: checkoutId,
    stripeSubscriptionId: subscription,
    stripeInvoiceId: invoiceId,
    stripePaymentIntentId: paymentIntent,
    paidAt: paid ? paidAt : null,
    failureReason: failed ? String(source?.last_finalization_error?.message || source?.status || "payment_failed") : "",
    notes: paid ? "Plată NextPDF confirmată" : failed ? "Plată NextPDF eșuată" : "Plată NextPDF în procesare",
    metadata
  });
  if (paid && paymentId) {
    const invoiceResult = maybeGenerateBillingInvoice(db, paymentId, { livemode: source?.livemode ? 1 : 0 });
    if (invoiceResult?.facturaId) {
      await runBillingInvoiceAutomationSteps(db, invoiceResult.facturaId, options);
    }
  }
  return { handled: true, ok: true, paymentId };
}


async function handleEmarqetStripeCheckoutCompleted(db, source = {}, eventType = "", options = {}) {
  const metadata = emarqetMetadata(source);
  const companyId = Number(metadata.emarqet_company_id || 0);
  if (!companyId) return { handled: false };
  if (isEmarqetPromotionStripeMetadata(metadata)) {
    const paid = String(source?.payment_status || "").toLowerCase() === "paid";
    const paymentIntentId = typeof source?.payment_intent === "string" ? source.payment_intent : String(source?.payment_intent?.id || "");
    await finalizeEmarqetPromotionStripePayment(db, {
      companyId,
      metadata,
      providerEventType: eventType || "checkout.session.completed",
      status: paid ? "paid" : "processing",
      amount: fromStripeAmount(source?.amount_total || source?.amount_subtotal || 0),
      currency: source?.currency || "RON",
      stripeCheckoutSessionId: String(source?.id || ""),
      stripeInvoiceId: String(source?.invoice || ""),
      stripePaymentIntentId: paymentIntentId,
      referenceCode: String(source?.id || ""),
      paidAt: isoFromStripeTimestamp(source?.created) || new Date().toISOString(),
      livemode: Boolean(source?.livemode),
      stripeBillingDetails: emarqetStripeBillingDetails(source),
      ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated,
      transporter: options.transporter
    });
    return { handled: true, ok: true };
  }
  const listing = findEmarqetListingForStripe(db, companyId, metadata, String(source?.id || ""));
  if (!listing) return { handled: true, ok: false, reason: "listing_missing" };
  const plan = findEmarqetPlanForListing(db, companyId, listing);
  const subscriptionId = typeof source?.subscription === "string" ? source.subscription : String(source?.subscription?.id || "");
  const paid = String(source?.payment_status || "").toLowerCase() === "paid";
  await finalizeEmarqetStripePayment(db, {
    companyId,
    listing,
    plan,
    providerEventType: eventType || "checkout.session.completed",
    status: paid ? "paid" : "processing",
    amount: fromStripeAmount(source?.amount_total || source?.amount_subtotal || 0) || Number(plan.monthly_price || 0),
    currency: source?.currency || plan.currency || "RON",
    stripeCheckoutSessionId: String(source?.id || ""),
    stripeSubscriptionId: subscriptionId,
    stripeInvoiceId: String(source?.invoice || ""),
    stripePaymentIntentId: String(source?.payment_intent || ""),
    referenceCode: String(source?.id || ""),
    paidAt: isoFromStripeTimestamp(source?.created) || new Date().toISOString(),
    livemode: Boolean(source?.livemode),
    stripeBillingDetails: emarqetStripeBillingDetails(source),
    metadata,
    listingPaymentStatus: paid ? "PAID" : "PROCESSING",
    ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated,
    transporter: options.transporter
  });
  return { handled: true, ok: true };
}

async function handleEmarqetStripeInvoicePaid(db, source = {}, eventType = "", options = {}) {
  const metadata = emarqetMetadata(source);
  const companyId = Number(metadata.emarqet_company_id || 0);
  if (!companyId) return { handled: false };
  if (isEmarqetPromotionStripeMetadata(metadata)) {
    const paymentIntentId = typeof source?.payment_intent === "string" ? source.payment_intent : String(source?.payment_intent?.id || "");
    await finalizeEmarqetPromotionStripePayment(db, {
      companyId,
      metadata,
      providerEventType: eventType || "invoice.paid",
      status: "paid",
      amount: fromStripeAmount(source?.amount_paid || source?.amount_due || 0),
      currency: source?.currency || "RON",
      stripeCheckoutSessionId: String(metadata.stripe_checkout_session_id || ""),
      stripeInvoiceId: String(source?.id || ""),
      stripePaymentIntentId: paymentIntentId,
      referenceCode: String(source?.number || source?.id || ""),
      paidAt: isoFromStripeTimestamp(source?.status_transitions?.paid_at || source?.created) || new Date().toISOString(),
      livemode: Boolean(source?.livemode),
      stripeBillingDetails: emarqetStripeBillingDetails(source),
      ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated,
      transporter: options.transporter
    });
    return { handled: true, ok: true };
  }
  const listing = findEmarqetListingForStripe(db, companyId, metadata, "");
  if (!listing) return { handled: true, ok: false, reason: "listing_missing" };
  const plan = findEmarqetPlanForListing(db, companyId, listing);
  await finalizeEmarqetStripePayment(db, {
    companyId,
    listing,
    plan,
    providerEventType: eventType || "invoice.paid",
    status: "paid",
    amount: fromStripeAmount(source?.amount_paid || source?.amount_due || 0) || Number(plan.monthly_price || 0),
    currency: source?.currency || plan.currency || "RON",
    stripeSubscriptionId: String(source?.subscription || ""),
    stripeInvoiceId: String(source?.id || ""),
    stripePaymentIntentId: String(source?.payment_intent || ""),
    referenceCode: String(source?.number || source?.id || ""),
    paidAt: isoFromStripeTimestamp(source?.status_transitions?.paid_at || source?.created) || new Date().toISOString(),
    livemode: Boolean(source?.livemode),
    stripeBillingDetails: emarqetStripeBillingDetails(source),
    metadata,
    listingPaymentStatus: "PAID",
    notes: "Plata Stripe e-Marqet confirmata prin invoice.",
    ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated,
    transporter: options.transporter
  });
  return { handled: true, ok: true };
}

function handleEmarqetStripeInvoiceFailed(db, source = {}, eventType = "") {
  const metadata = emarqetMetadata(source);
  const companyId = Number(metadata.emarqet_company_id || 0);
  if (!companyId) return { handled: false };
  if (isEmarqetPromotionStripeMetadata(metadata)) {
    const orderId = Number(metadata.promotion_order_id || 0);
    if (orderId) markPromotionOrderFailed(db, companyId, orderId, eventType || "invoice.payment_failed");
    return { handled: true, ok: true, eventType };
  }
  const listing = findEmarqetListingForStripe(db, companyId, metadata, "");
  if (!listing) return { handled: true, ok: false, reason: "listing_missing" };
  db.prepare(`
    UPDATE emarqet_listings
    SET stripe_checkout_status='PAYMENT_FAILED',
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(companyId, listing.id);
  return { handled: true, ok: true, eventType };
}

function applyStripeBillingDetailsToCompany(db, companyId, details = {}) {
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) return;
  const taxId = String(details.tax_id || "").trim().toUpperCase();
  const name = String(details.name || "").trim();
  const address = String(details.address || "").trim();
  const country = String(details.country || "").trim();
  if (!taxId && !name && !address && !country) return;

  db.prepare(`
    UPDATE companies
    SET name=CASE WHEN ? <> '' THEN ? ELSE name END,
        cui=CASE WHEN ? <> '' THEN ? ELSE cui END,
        address=CASE WHEN ? <> '' THEN ? ELSE address END,
        country=CASE WHEN ? <> '' THEN ? ELSE country END,
        updated_at=datetime('now')
    WHERE id=?
  `).run(
    name, name,
    taxId, country === "Romania" ? taxId.replace(/^RO/i, "") : taxId,
    address, address,
    country, country,
    normalizedCompanyId
  );
}

function mapStripeSubscriptionStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "trialing") return "trial";
  if (normalized === "active") return "active";
  if (normalized === "past_due" || normalized === "unpaid" || normalized === "incomplete") return "past_due";
  if (normalized === "canceled" || normalized === "incomplete_expired" || normalized === "paused") return "suspended";
  return "active";
}

function latestSubscriptionRow(db, companyId) {
  return db.prepare(`
    SELECT cs.id, cs.plan_id, cs.status, cs.seats_included, cs.seats_used, cs.module_overrides,
           cs.stripe_subscription_id, cs.billing_email, cs.billing_currency,
           p.name AS plan_name, p.code AS plan_code, p.pricing_model, p.price_monthly, p.max_users, p.module_keys
    FROM company_subscriptions cs
    JOIN plans p ON p.id = cs.plan_id
    WHERE cs.company_id=?
    ORDER BY cs.id DESC
    LIMIT 1
  `).get(companyId);
}

function syncCompanyStatusFromSubscription(db, companyId) {
  const subscription = db.prepare(`
    SELECT status, seats_included
    FROM company_subscriptions
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);
  if (!subscription) return;

  db.prepare(`
    UPDATE companies
    SET status=?,
        max_users=COALESCE(?, max_users),
        updated_at=datetime('now')
    WHERE id=? AND archived_at IS NULL
  `).run(
    subscription.status || "active",
    subscription.seats_included || null,
    companyId
  );
}

function ensureStripeCustomer(db, stripe, companyId, email) {
  const company = db.prepare(`
    SELECT id, name, cui, stripe_customer_id
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!company) throw new Error("Company not found");

  if (company.stripe_customer_id) {
    stripe.customers.update(company.stripe_customer_id, {
      email: email || undefined,
      name: company.name || undefined,
      metadata: {
        company_id: String(company.id),
        company_cui: String(company.cui || "")
      }
    }).catch(() => null);
    return company.stripe_customer_id;
  }

  return stripe.customers.create({
    email: email || undefined,
    name: company.name || undefined,
    metadata: {
      company_id: String(company.id),
      company_cui: String(company.cui || "")
    }
  }).then((customer) => {
    db.prepare(`
      UPDATE companies
      SET stripe_customer_id=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(customer.id, companyId);
    return customer.id;
  });
}

function updateSubscriptionFromStripe(db, stripeSubscription) {
  const subscriptionId = String(stripeSubscription?.id || "");
  if (!subscriptionId) return;

  const row = db.prepare(`
    SELECT id, company_id, seats_used
    FROM company_subscriptions
    WHERE stripe_subscription_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(subscriptionId);
  if (!row) return;

  const item = Array.isArray(stripeSubscription.items?.data) ? stripeSubscription.items.data[0] : null;
  const mappedStatus = mapStripeSubscriptionStatus(stripeSubscription.status);
  const currentPeriodEnd = stripeSubscription.current_period_end
    ? new Date(Number(stripeSubscription.current_period_end) * 1000).toISOString()
    : null;

  db.prepare(`
    UPDATE company_subscriptions
    SET status=?,
        stripe_price_id=?,
        current_period_end=?,
        billing_currency=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(
    mappedStatus,
    item?.price?.id || null,
    currentPeriodEnd,
    String(stripeSubscription.currency || item?.price?.currency || "eur"),
    row.id
  );

  syncCompanyStatusFromSubscription(db, row.company_id);
}

function findBillingPayment(db, { stripeInvoiceId = "", stripePaymentIntentId = "", stripeCheckoutSessionId = "", stripeSubscriptionId = "", companyId = 0 }) {
  if (stripeInvoiceId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE stripe_invoice_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripeInvoiceId);
    if (row?.id) return row.id;
  }

  if (stripePaymentIntentId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE stripe_payment_intent_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripePaymentIntentId);
    if (row?.id) return row.id;
  }

  if (stripeCheckoutSessionId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE stripe_checkout_session_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripeCheckoutSessionId);
    if (row?.id) return row.id;
  }

  if (stripeSubscriptionId && companyId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE company_id=?
        AND stripe_subscription_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, stripeSubscriptionId);
    if (row?.id) return row.id;
  }

  return null;
}

function upsertBillingPayment(db, payload = {}) {
  const companyId = Number(payload.companyId || 0);
  if (!companyId) return null;

  const existingId = findBillingPayment(db, {
    stripeInvoiceId: String(payload.stripeInvoiceId || ""),
    stripePaymentIntentId: String(payload.stripePaymentIntentId || ""),
    stripeCheckoutSessionId: String(payload.stripeCheckoutSessionId || ""),
    stripeSubscriptionId: String(payload.stripeSubscriptionId || ""),
    companyId
  });

  const values = {
    company_subscription_id: Number(payload.companySubscriptionId || 0) || null,
    source: String(payload.source || "stripe"),
    provider_event_type: String(payload.providerEventType || ""),
    payment_kind: String(payload.paymentKind || "subscription"),
    status: String(payload.status || "initiated"),
    amount: Number(payload.amount || 0),
    currency: String(payload.currency || "eur").toLowerCase(),
    payer_name: String(payload.payerName || ""),
    payer_email: String(payload.payerEmail || "").trim().toLowerCase(),
    reference_code: String(payload.referenceCode || ""),
    stripe_checkout_session_id: String(payload.stripeCheckoutSessionId || ""),
    stripe_subscription_id: String(payload.stripeSubscriptionId || ""),
    stripe_invoice_id: String(payload.stripeInvoiceId || ""),
    stripe_payment_intent_id: String(payload.stripePaymentIntentId || ""),
    paid_at: payload.paidAt ? String(payload.paidAt) : null,
    failure_reason: String(payload.failureReason || ""),
    notes: String(payload.notes || ""),
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    created_by_user_id: Number(payload.createdByUserId || 0) || null,
    created_by_email: String(payload.createdByEmail || "").trim().toLowerCase()
  };

  if (existingId) {
    db.prepare(`
      UPDATE billing_payments
      SET company_subscription_id=COALESCE(?, company_subscription_id),
          source=CASE WHEN ? <> '' THEN ? ELSE source END,
          provider_event_type=CASE WHEN ? <> '' THEN ? ELSE provider_event_type END,
          payment_kind=CASE WHEN ? <> '' THEN ? ELSE payment_kind END,
          status=CASE WHEN ? <> '' THEN ? ELSE status END,
          amount=CASE WHEN ? > 0 THEN ? ELSE amount END,
          currency=CASE WHEN ? <> '' THEN ? ELSE currency END,
          payer_name=CASE WHEN ? <> '' THEN ? ELSE payer_name END,
          payer_email=CASE WHEN ? <> '' THEN ? ELSE payer_email END,
          reference_code=CASE WHEN ? <> '' THEN ? ELSE reference_code END,
          stripe_checkout_session_id=CASE WHEN ? <> '' THEN ? ELSE stripe_checkout_session_id END,
          stripe_subscription_id=CASE WHEN ? <> '' THEN ? ELSE stripe_subscription_id END,
          stripe_invoice_id=CASE WHEN ? <> '' THEN ? ELSE stripe_invoice_id END,
          stripe_payment_intent_id=CASE WHEN ? <> '' THEN ? ELSE stripe_payment_intent_id END,
          paid_at=COALESCE(?, paid_at),
          failure_reason=CASE WHEN ? <> '' THEN ? ELSE failure_reason END,
          notes=CASE WHEN ? <> '' THEN ? ELSE notes END,
          metadata=COALESCE(?, metadata),
          created_by_user_id=COALESCE(created_by_user_id, ?),
          created_by_email=CASE WHEN created_by_email IS NULL OR created_by_email='' THEN ? ELSE created_by_email END,
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      values.company_subscription_id,
      values.source, values.source,
      values.provider_event_type, values.provider_event_type,
      values.payment_kind, values.payment_kind,
      values.status, values.status,
      values.amount, values.amount,
      values.currency, values.currency,
      values.payer_name, values.payer_name,
      values.payer_email, values.payer_email,
      values.reference_code, values.reference_code,
      values.stripe_checkout_session_id, values.stripe_checkout_session_id,
      values.stripe_subscription_id, values.stripe_subscription_id,
      values.stripe_invoice_id, values.stripe_invoice_id,
      values.stripe_payment_intent_id, values.stripe_payment_intent_id,
      values.paid_at,
      values.failure_reason, values.failure_reason,
      values.notes, values.notes,
      values.metadata,
      values.created_by_user_id,
      values.created_by_email,
      existingId
    );
    return existingId;
  }

  const result = db.prepare(`
    INSERT INTO billing_payments (
      company_id, company_subscription_id, source, provider_event_type, payment_kind, status,
      amount, currency, payer_name, payer_email, reference_code,
      stripe_checkout_session_id, stripe_subscription_id, stripe_invoice_id, stripe_payment_intent_id,
      paid_at, failure_reason, notes, metadata, created_by_user_id, created_by_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    values.company_subscription_id,
    values.source,
    values.provider_event_type || null,
    values.payment_kind,
    values.status,
    values.amount,
    values.currency,
    values.payer_name || null,
    values.payer_email || null,
    values.reference_code || null,
    values.stripe_checkout_session_id || null,
    values.stripe_subscription_id || null,
    values.stripe_invoice_id || null,
    values.stripe_payment_intent_id || null,
    values.paid_at,
    values.failure_reason || null,
    values.notes || null,
    values.metadata,
    values.created_by_user_id,
    values.created_by_email || null
  );

  return result.lastInsertRowid;
}

function renderBillingResult(message, href = "/setari") {
  return `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Billing</title></head>
<body style="font-family:system-ui;padding:40px;background:#f8fafc;color:#0f172a">
  <div style="max-width:760px;margin:0 auto;padding:24px;border-radius:20px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 20px 40px rgba(15,23,42,.08)">
    <h1 style="margin:0 0 12px 0">Stripe Billing</h1>
    <p style="line-height:1.6">${escapeHtml(message)}</p>
    <a href="${href}" style="display:inline-flex;margin-top:12px;padding:10px 14px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">Înapoi în aplicație</a>
  </div>
</body>
</html>
`;
}

function wantsNexoraReturn(req) {
  return String(req.query?.return_to || "").trim().toLowerCase() === "nexora";
}

function settingsReturnHref(req) {
  return wantsNexoraReturn(req) ? "/nexora/settings?tab=subscription" : "/setari";
}

async function runBillingInvoiceAutomationSteps(db, facturaId, { ensureFacturaXmlGenerated, transporter } = {}) {
  const results = {};
  const errors = [];
  const runStep = async (key, fn) => {
    try {
      results[key] = await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || `${key}_failed`);
      errors.push({ step: key, message });
      console.error(`Billing invoice ${key} failed:`, message);
    }
  };

  await runStep("efactura", () => maybeSendBillingInvoiceToEfactura(db, facturaId, { ensureFacturaXmlGenerated }));
  await runStep("pdf", () => maybeGenerateBillingInvoicePdf(db, facturaId));
  await runStep("email", () => maybeEmailBillingInvoice(db, facturaId, { transporter }));

  return { ok: errors.length === 0, results, errors };
}

export function registerBillingWebhook(app, { db, ensureFacturaXmlGenerated, transporter }) {
  const stripe = createStripeClient();
  const webhookSecrets = stripeWebhookSecrets();
  if (!stripe || !webhookSecrets.length) return;

  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.headers["stripe-signature"];
    let event;

    try {
      event = constructStripeWebhookEvent(stripe, req.body, signature, webhookSecrets);
    } catch (error) {
      console.error("Stripe webhook signature failed:", error?.message || error);
      return res.status(400).send(`Webhook Error: ${error?.message || "Invalid signature"}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const nextPdfHandled = await handleNextPdfStripePayment(db, session, event.type, { ensureFacturaXmlGenerated, transporter });
          if (nextPdfHandled.handled) break;
          const emarqetHandled = await handleEmarqetStripeCheckoutCompleted(db, session, event.type, { ensureFacturaXmlGenerated, transporter });
          if (emarqetHandled.handled) break;
          const companyId = Number(session?.metadata?.company_id || 0);
          const companySubscriptionId = Number(session?.metadata?.subscription_id || 0) || null;
          const subscriptionId = String(session?.subscription || "");
          const customerId = String(session?.customer || "");
          const email = String(session?.customer_details?.email || session?.customer_email || "");
          const billingDetails = stripeBillingDetails(session);
          const initiatedByUserId = Number(session?.metadata?.initiated_by_user_id || 0) || null;
          const initiatedByEmail = String(session?.metadata?.initiated_by_email || email || "");
          const checkoutPaymentStatus = String(session?.payment_status || "").toLowerCase() === "paid" ? "paid" : "processing";
          const checkoutAmount = fromStripeAmount(session?.amount_total || session?.amount_subtotal || 0);
          const checkoutCurrency = String(session?.currency || "eur").toLowerCase();
          const checkoutMetadata = stripeSubscriptionMetadata(session);
          const checkoutUnitAmount = Number(checkoutMetadata.billing_unit_amount || checkoutMetadata.unit_amount || 0) || checkoutAmount;

          if (companyId) {
            applyStripeBillingDetailsToCompany(db, companyId, billingDetails);
            const paymentId = upsertBillingPayment(db, {
              companyId,
              companySubscriptionId,
              source: "stripe",
              providerEventType: event.type,
              paymentKind: "subscription",
              status: checkoutPaymentStatus,
              amount: checkoutAmount,
              currency: checkoutCurrency,
              payerName: billingDetails.name,
              payerEmail: billingDetails.email || email,
              referenceCode: String(session?.id || ""),
              stripeCheckoutSessionId: String(session?.id || ""),
              stripeSubscriptionId: subscriptionId,
              paidAt: isoFromStripeTimestamp(session?.created),
              createdByUserId: initiatedByUserId,
              createdByEmail: initiatedByEmail,
              metadata: trevoroBillingMetadata(session, billingDetails, {
                company_id: companyId,
                customer_id: customerId
              })
            });

            if (customerId) {
              db.prepare(`
                UPDATE companies
                SET stripe_customer_id=?,
                    updated_at=datetime('now')
                WHERE id=?
              `).run(customerId, companyId);
            }

            db.prepare(`
              UPDATE company_subscriptions
              SET stripe_checkout_session_id=?,
                  stripe_subscription_id=COALESCE(?, stripe_subscription_id),
                  billing_email=CASE WHEN ? <> '' THEN ? ELSE billing_email END,
                  last_payment_status='checkout_completed',
                  updated_at=datetime('now')
              WHERE company_id=?
            `).run(
              session.id,
              subscriptionId || null,
              email,
              email,
              companyId
            );

            if (subscriptionId) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
                updateSubscriptionFromStripe(db, stripeSubscription);
              } catch (error) {
                console.error("Stripe subscription retrieve failed:", error?.message || error);
              }
            } else {
              syncCompanyStatusFromSubscription(db, companyId);
            }

            if (checkoutPaymentStatus === "paid") {
              db.prepare(`
                UPDATE company_subscriptions
                SET status='active',
                    last_payment_status='paid',
                    updated_at=datetime('now')
                WHERE company_id=?
              `).run(companyId);
              db.prepare(`
                UPDATE travel_properties
                SET status='activ',
                    subscription_status='active',
                    partner_plan='standard_monthly',
                    monthly_price_ron=CASE
                      WHEN lower(?)='ron' THEN CASE WHEN COALESCE(monthly_price_ron, 0) > 0 THEN monthly_price_ron ELSE ? END
                      ELSE COALESCE(monthly_price_ron, 0)
                    END,
                    monthly_price_amount=CASE WHEN COALESCE(monthly_price_amount, 0) > 0 THEN monthly_price_amount ELSE ? END,
                    monthly_price_currency=UPPER(CASE WHEN COALESCE(monthly_price_currency, '') <> '' THEN monthly_price_currency ELSE ? END),
                    updated_at=datetime('now')
                WHERE billing_company_id=?
              `).run(checkoutCurrency, checkoutUnitAmount, checkoutUnitAmount, checkoutCurrency, companyId);
	              if (paymentId) {
	                const invoiceResult = maybeGenerateBillingInvoice(db, paymentId, { livemode: session?.livemode ? 1 : 0 });
	                if (invoiceResult?.facturaId) {
	                  await runBillingInvoiceAutomationSteps(db, invoiceResult.facturaId, { ensureFacturaXmlGenerated, transporter });
	                }
	              }
              syncCompanyStatusFromSubscription(db, companyId);
            }
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          updateSubscriptionFromStripe(db, event.data.object);
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const nextPdfHandled = await handleNextPdfStripePayment(db, invoice, event.type, { ensureFacturaXmlGenerated, transporter });
          if (nextPdfHandled.handled) break;
          const emarqetHandled = handleEmarqetStripeInvoiceFailed(db, invoice, event.type);
          if (emarqetHandled.handled) break;
          const subscriptionId = String(invoice?.subscription || "");
          if (subscriptionId) {
            const billingDetails = stripeBillingDetails(invoice);
            const row = db.prepare(`
              SELECT id, company_id
              FROM company_subscriptions
              WHERE stripe_subscription_id=?
              ORDER BY id DESC
              LIMIT 1
            `).get(subscriptionId);
            if (row) {
              applyStripeBillingDetailsToCompany(db, row.company_id, billingDetails);
              upsertBillingPayment(db, {
                companyId: row.company_id,
                companySubscriptionId: row.id,
                source: "stripe",
                providerEventType: event.type,
                paymentKind: "subscription",
                status: "failed",
                amount: fromStripeAmount(invoice?.amount_due || invoice?.amount_remaining || 0),
                currency: String(invoice?.currency || "eur"),
                payerName: billingDetails.name || String(invoice?.customer_name || ""),
                payerEmail: billingDetails.email || String(invoice?.customer_email || ""),
                referenceCode: String(invoice?.number || invoice?.id || ""),
                stripeSubscriptionId: subscriptionId,
                stripeInvoiceId: String(invoice?.id || ""),
                stripePaymentIntentId: String(invoice?.payment_intent || ""),
                failureReason: String(invoice?.last_finalization_error?.message || invoice?.status || "payment_failed"),
                notes: "Plată Stripe eșuată",
                metadata: trevoroBillingMetadata(invoice, billingDetails, {
                  hosted_invoice_url: invoice?.hosted_invoice_url || null
                })
              });

              db.prepare(`
                UPDATE company_subscriptions
                SET status='past_due',
                    last_payment_status='payment_failed',
                    updated_at=datetime('now')
                WHERE id=?
              `).run(row.id);
              syncCompanyStatusFromSubscription(db, row.company_id);
            }
          }
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object;
          const nextPdfHandled = await handleNextPdfStripePayment(db, invoice, event.type, { ensureFacturaXmlGenerated, transporter });
          if (nextPdfHandled.handled) break;
          const emarqetHandled = await handleEmarqetStripeInvoicePaid(db, invoice, event.type, { ensureFacturaXmlGenerated, transporter });
          if (emarqetHandled.handled) break;
          const subscriptionId = String(invoice?.subscription || "");
          if (subscriptionId) {
            const billingDetails = stripeBillingDetails(invoice);
            const invoiceAmount = fromStripeAmount(invoice?.amount_paid || invoice?.amount_due || 0);
            const invoiceMetadata = stripeSubscriptionMetadata(invoice);
            const invoiceUnitAmount = Number(invoiceMetadata.billing_unit_amount || invoiceMetadata.unit_amount || 0) || invoiceAmount;
            const row = db.prepare(`
              SELECT id, company_id
              FROM company_subscriptions
              WHERE stripe_subscription_id=?
              ORDER BY id DESC
              LIMIT 1
            `).get(subscriptionId);
            if (row) {
              applyStripeBillingDetailsToCompany(db, row.company_id, billingDetails);
              upsertBillingPayment(db, {
                companyId: row.company_id,
                companySubscriptionId: row.id,
                source: "stripe",
                providerEventType: event.type,
                paymentKind: "subscription",
                status: "paid",
                amount: invoiceAmount,
                currency: String(invoice?.currency || "eur"),
                payerName: billingDetails.name || String(invoice?.customer_name || ""),
                payerEmail: billingDetails.email || String(invoice?.customer_email || ""),
                referenceCode: String(invoice?.number || invoice?.id || ""),
                stripeSubscriptionId: subscriptionId,
                stripeInvoiceId: String(invoice?.id || ""),
                stripePaymentIntentId: String(invoice?.payment_intent || ""),
                paidAt: isoFromStripeTimestamp(invoice?.status_transitions?.paid_at || invoice?.created),
                notes: "Plată Stripe confirmată",
                metadata: trevoroBillingMetadata(invoice, billingDetails, {
                  hosted_invoice_url: invoice?.hosted_invoice_url || null
                })
              });
              const paymentId = findBillingPayment(db, {
                stripeInvoiceId: String(invoice?.id || ""),
                stripePaymentIntentId: String(invoice?.payment_intent || ""),
                stripeSubscriptionId: subscriptionId,
                companyId: row.company_id
              });
	              if (paymentId) {
	                const invoiceResult = maybeGenerateBillingInvoice(db, paymentId, { livemode: invoice?.livemode ? 1 : 0 });
	                if (invoiceResult?.facturaId) {
	                  await runBillingInvoiceAutomationSteps(db, invoiceResult.facturaId, { ensureFacturaXmlGenerated, transporter });
	                }
	              }

              db.prepare(`
                UPDATE company_subscriptions
                SET status='active',
                    last_payment_status='paid',
                    updated_at=datetime('now')
                WHERE id=?
              `).run(row.id);
              db.prepare(`
                UPDATE travel_properties
                SET status='activ',
                    subscription_status='active',
                    partner_plan='standard_monthly',
                    monthly_price_ron=CASE
                      WHEN lower(?)='ron' THEN CASE WHEN COALESCE(monthly_price_ron, 0) > 0 THEN monthly_price_ron ELSE ? END
                      ELSE COALESCE(monthly_price_ron, 0)
                    END,
                    monthly_price_amount=CASE WHEN COALESCE(monthly_price_amount, 0) > 0 THEN monthly_price_amount ELSE ? END,
                    monthly_price_currency=UPPER(CASE WHEN COALESCE(monthly_price_currency, '') <> '' THEN monthly_price_currency ELSE ? END),
                    updated_at=datetime('now')
                WHERE billing_company_id=?
              `).run(
                String(invoice?.currency || "eur").toLowerCase(),
                invoiceUnitAmount,
                invoiceUnitAmount,
                String(invoice?.currency || "eur").toLowerCase(),
                row.company_id
              );
              syncCompanyStatusFromSubscription(db, row.company_id);
            }
          }
          break;
        }
        default:
          break;
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook handling failed:", error?.message || error);
      return res.status(500).send("Webhook handler failed");
    }
  });
}

export function registerBillingRoutes(app, { db, requireAuth, requireRole, getSetting, refreshSessionCompanyAccess }) {
  const stripe = createStripeClient();

  app.get("/billing/checkout", requireAuth, requireRole("admin"), async (req, res) => {
    const settingsHref = settingsReturnHref(req);
    if (!stripeConfigured() || !stripe) {
      return res.status(400).type("html").send(renderBillingResult("Stripe nu este configurat încă pe server.", settingsHref));
    }

    const companyId = Number(req.session?.user?.company_id || 0);
    const email = String(req.session?.user?.email || "").trim().toLowerCase();
    const subscription = latestSubscriptionRow(db, companyId);
    if (!companyId || !subscription) {
      return res.status(404).type("html").send(renderBillingResult("Nu am găsit abonamentul companiei.", settingsHref));
    }

    try {
      const customerId = await ensureStripeCustomer(db, stripe, companyId, email);
      const currency = String(process.env.STRIPE_CURRENCY || subscription.billing_currency || "eur").toLowerCase();
      const successUrl = `${appBaseUrl(req)}/billing/success?session_id={CHECKOUT_SESSION_ID}${wantsNexoraReturn(req) ? "&return_to=nexora" : ""}`;
      const cancelUrl = `${appBaseUrl(req)}${wantsNexoraReturn(req) ? "/nexora/settings?tab=subscription&billing=cancelled" : "/setari?billing=cancelled"}`;
      const unitAmount = toStripeAmount(subscription.price_monthly || 0);
      const quantity = planChargeQuantity(subscription, subscription.seats_used || 1);
      const estimatedAmount = planChargeAmount(subscription, subscription.seats_used || 1);
      if (!unitAmount) {
        return res.status(400).type("html").send(renderBillingResult("Planul selectat nu are preț lunar configurat.", settingsHref));
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customerId,
        customer_update: { address: "auto", name: "auto" },
        client_reference_id: String(companyId),
        billing_address_collection: "required",
        ...(stripeTaxIdCollectionEnabled() ? { tax_id_collection: { enabled: true } } : {}),
        ...(stripeAutomaticTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
        metadata: {
          company_id: String(companyId),
          subscription_id: String(subscription.id),
          plan_code: String(subscription.plan_code || ""),
          initiated_by_user_id: String(req.session?.user?.id || ""),
          initiated_by_email: email
        },
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: unitAmount,
              recurring: { interval: "month" },
              product_data: {
                name: `MiniCRM ${subscription.plan_name || subscription.plan_code || "Subscription"}`,
                description: String(subscription.pricing_model || "flat").trim().toLowerCase() === "per_user"
                  ? `Abonament lunar pentru ${quantity} utilizatori activi`
                  : `Abonament lunar pentru ${subscription.plan_name || "plan activ"}`
              }
            },
            quantity
          }
        ]
      });

      db.prepare(`
        UPDATE company_subscriptions
        SET stripe_checkout_session_id=?,
            billing_currency=?,
            billing_email=?,
            updated_at=datetime('now')
        WHERE id=?
      `).run(
        session.id,
        currency,
        email || null,
        subscription.id
      );

      upsertBillingPayment(db, {
        companyId,
        companySubscriptionId: subscription.id,
        source: "stripe",
        providerEventType: "checkout.session.created",
        paymentKind: "subscription",
        status: "initiated",
        amount: Number(estimatedAmount || 0),
        currency,
        payerEmail: email,
        referenceCode: session.id,
        stripeCheckoutSessionId: session.id,
        createdByUserId: Number(req.session?.user?.id || 0) || null,
        createdByEmail: email,
        metadata: {
          company_id: companyId,
          subscription_id: subscription.id,
          plan_code: subscription.plan_code || ""
        }
      });

      return res.redirect(session.url);
    } catch (error) {
      console.error("Stripe checkout create failed:", error?.message || error);
      return res.status(500).type("html").send(renderBillingResult(`Nu am putut crea sesiunea Stripe: ${error?.message || "eroare necunoscută"}`, settingsHref));
    }
  });

  app.get("/billing/success", requireAuth, async (req, res) => {
    const settingsHref = settingsReturnHref(req);
    const stripeClient = createStripeClient();
    const sessionId = String(req.query?.session_id || "");
    if (!stripeClient || !sessionId) {
      return res.type("html").send(renderBillingResult("Plata a fost finalizată, dar sesiunea Stripe nu a putut fi verificată.", settingsHref));
    }

    try {
      const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"]
      });
      const companyId = Number(req.session?.user?.company_id || 0);
      if (companyId && Number(session?.metadata?.company_id || 0) === companyId) {
        const subscription = session.subscription;
        if (subscription && typeof subscription === "object") {
          updateSubscriptionFromStripe(db, subscription);
        }
        refreshSessionCompanyAccess(req);
      }
      return res.type("html").send(renderBillingResult("Plata a fost confirmată. Abonamentul companiei a fost sincronizat cu Stripe.", settingsHref));
    } catch (error) {
      console.error("Stripe success sync failed:", error?.message || error);
      return res.type("html").send(renderBillingResult("Plata a fost finalizată, dar sincronizarea finală se va face prin webhook în câteva momente.", settingsHref));
    }
  });

  app.get("/billing/portal", requireAuth, requireRole("admin"), async (req, res) => {
    const settingsHref = settingsReturnHref(req);
    if (!stripeConfigured() || !stripe) {
      return res.status(400).type("html").send(renderBillingResult("Stripe nu este configurat încă pe server.", settingsHref));
    }

    const companyId = Number(req.session?.user?.company_id || 0);
    const company = db.prepare(`
      SELECT stripe_customer_id
      FROM companies
      WHERE id=?
    `).get(companyId);

    if (!company?.stripe_customer_id) {
      return res.type("html").send(renderBillingResult("Compania nu are încă un client Stripe activ. Finalizează mai întâi prima plată.", settingsHref));
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id,
        return_url: `${appBaseUrl(req)}${wantsNexoraReturn(req) ? "/nexora/settings?tab=subscription" : "/setari"}`
      });
      return res.redirect(session.url);
    } catch (error) {
      console.error("Stripe portal session failed:", error?.message || error);
      return res.status(500).type("html").send(renderBillingResult(`Nu am putut deschide portalul Stripe: ${error?.message || "eroare necunoscută"}`, settingsHref));
    }
  });

  app.get("/billing/status", requireAuth, (req, res) => {
    const companyId = Number(req.session?.user?.company_id || 0);
    const company = db.prepare(`
      SELECT id, name, stripe_customer_id
      FROM companies
      WHERE id=?
    `).get(companyId);
    const subscription = latestSubscriptionRow(db, companyId);

    res.json({
      stripe_configured: stripeConfigured(),
      stripe_webhook_configured: stripeWebhookConfigured(),
      company: company ? {
        id: company.id,
        name: company.name,
        stripe_customer_id: company.stripe_customer_id || null
      } : null,
      subscription: subscription ? {
        id: subscription.id,
        plan_name: subscription.plan_name,
        plan_code: subscription.plan_code,
        status: subscription.status,
        stripe_subscription_id: subscription.stripe_subscription_id || null,
        stripe_checkout_session_id: subscription.stripe_checkout_session_id || null,
        billing_currency: subscription.billing_currency || null,
        current_period_end: subscription.current_period_end || null,
        last_payment_status: subscription.last_payment_status || null
      } : null
    });
  });
}
