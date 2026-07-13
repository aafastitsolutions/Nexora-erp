import { maybeSendBillingInvoiceToEfactura } from "./billing-efactura.js";
import { maybeEmailBillingInvoice } from "./billing-invoice-email.js";
import { maybeGenerateBillingInvoicePdf } from "./billing-invoice-pdf.js";
import { maybeGenerateBillingInvoice } from "./billing-invoices.js";

import { emarqetSupportEmail } from "./emarqet-mailboxes.js";

function safeText(value = "") {
  return String(value || "").trim();
}

function safeJson(value = {}) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function firstFilled(...values) {
  for (const value of values) {
    const text = safeText(value);
    if (text) return text;
  }
  return "";
}

function normalizeRomanianFiscalId(value = "") {
  return safeText(value).toUpperCase().replace(/^RO/i, "").replace(/[^0-9]/g, "");
}

function billingAddressForInvoice(source = {}) {
  const address = safeText(source.billing_address);
  const city = safeText(source.billing_city);
  const county = safeText(source.billing_county);
  const country = safeText(source.billing_country || "Romania") || "Romania";
  if (!address && !city && !county) return "";
  return [address, city, county ? `Jud. ${county}` : "", country].filter(Boolean).join(", ");
}

function savedBillingProfile(listing = {}, payload = {}) {
  const profile = payload.billing_profile || {};
  const taxId = firstFilled(profile.billing_cui, profile.billing_tax_id, listing.billing_cui);
  return {
    name: firstFilled(profile.billing_name, listing.billing_name),
    tax_id: normalizeRomanianFiscalId(taxId),
    address: firstFilled(profile.billing_address_full, billingAddressForInvoice(profile), billingAddressForInvoice(listing)),
    country: firstFilled(profile.billing_country, listing.billing_country, "Romania")
  };
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = value ? JSON.parse(String(value)) : fallback;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function fromStripeAmount(value) {
  return Number(value || 0) / 100;
}

function normalizeStripeCountry(value) {
  const raw = safeText(value);
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
  ].map((part) => safeText(part)).filter(Boolean).join(", ");
}

function firstStripeTaxId(source = {}) {
  const candidates = [
    source?.customer_details?.tax_ids,
    source?.customer_tax_ids,
    source?.tax_ids
  ];
  for (const item of candidates) {
    if (!Array.isArray(item)) continue;
    const found = item.find((taxId) => safeText(taxId?.value));
    if (found) {
      return {
        type: safeText(found.type),
        value: safeText(found.value).replace(/\s+/g, "").toUpperCase()
      };
    }
  }
  return { type: "", value: "" };
}

export function emarqetStripeBillingDetails(source = {}) {
  const details = source?.customer_details || {};
  const taxId = firstStripeTaxId(source);
  const address = details.address || source?.customer_address || {};
  return {
    name: safeText(details.name || source?.customer_name),
    email: normalizeEmail(details.email || source?.customer_email),
    tax_id_type: taxId.type,
    tax_id: taxId.value,
    address: stripeAddressLines(address),
    country: normalizeStripeCountry(address.country)
  };
}

function paymentMetadata(listing = {}, plan = {}, payload = {}) {
  const billingDetails = payload.stripe_billing_details || {};
  const billingProfile = savedBillingProfile(listing, payload);
  const planName = safeText(plan.name || listing.selected_plan_code || "abonament");
  const payerName = safeText(billingProfile.name || billingDetails.name || listing.owner_name);
  const payerEmail = normalizeEmail(billingDetails.email || listing.owner_email);
  return {
    external_payer: true,
    emarqet_external_payer: true,
    invoice_brand: "e-Marqet",
    invoice_label_prefix: "Abonament e-Marqet",
    invoice_line_label: `Abonament e-Marqet - ${planName}`,
    invoice_unit: "luna",
    support_email: emarqetSupportEmail(),
    listing_id: listing.id,
    listing_code: listing.listing_code,
    listing_title: listing.title,
    listing_slug: listing.slug,
    plan_code: plan.code || listing.selected_plan_code || "",
    plan_name: plan.name || listing.selected_plan_code || "",
    payer_name: payerName,
    payer_email: payerEmail,
    payer_phone: safeText(listing.contact_phone),
    payer_cui: safeText(billingProfile.tax_id || billingDetails.tax_id),
    payer_address: safeText(billingProfile.address || billingDetails.address),
    payer_country: safeText(billingProfile.country || billingDetails.country) || "Romania",
    billing_profile: billingProfile,
    stripe_billing_details: billingDetails,
    stripe_mode: safeText(process.env.EMARQET_STRIPE_MODE) || "stripe",
    simulated: Boolean(payload.simulated),
    ...parseJson(payload.metadata, {})
  };
}

function findExistingPaymentId(db, payload = {}) {
  const stripeInvoiceId = safeText(payload.stripe_invoice_id);
  const stripePaymentIntentId = safeText(payload.stripe_payment_intent_id);
  const stripeCheckoutSessionId = safeText(payload.stripe_checkout_session_id || payload.reference_code);
  const stripeSubscriptionId = safeText(payload.stripe_subscription_id);
  const listingId = Number(payload.listing_id || 0);
  const companyId = Number(payload.company_id || 0);

  if (stripeInvoiceId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE payment_kind='emarqet_subscription'
        AND stripe_invoice_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripeInvoiceId);
    if (row?.id) return Number(row.id);
  }

  if (stripePaymentIntentId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE payment_kind='emarqet_subscription'
        AND stripe_payment_intent_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripePaymentIntentId);
    if (row?.id) return Number(row.id);
  }

  if (stripeCheckoutSessionId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE payment_kind='emarqet_subscription'
        AND stripe_checkout_session_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripeCheckoutSessionId);
    if (row?.id) return Number(row.id);
  }

  if (stripeSubscriptionId && listingId && companyId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE company_id=?
        AND payment_kind='emarqet_subscription'
        AND stripe_subscription_id=?
        AND (stripe_invoice_id IS NULL OR stripe_invoice_id='')
        AND (generated_factura_id IS NULL OR generated_factura_id=0)
        AND metadata LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, stripeSubscriptionId, `%"listing_id":${listingId}%`);
    if (row?.id) return Number(row.id);
  }

  return null;
}

export function upsertEmarqetBillingPayment(db, companyId, listing = {}, plan = {}, payload = {}) {
  const normalizedCompanyId = Number(companyId || listing.company_id || 0);
  const amount = Number(payload.amount ?? plan.monthly_price ?? 0);
  const currency = safeText(payload.currency || plan.currency || listing.price_currency || "RON").toLowerCase();
  const sessionId = safeText(payload.stripe_checkout_session_id || payload.reference_code || `sim-emq-${listing.id}-${Date.now()}`);
  const metadata = paymentMetadata(listing, plan, payload);
  const existingId = findExistingPaymentId(db, {
    ...payload,
    company_id: normalizedCompanyId,
    listing_id: listing.id,
    reference_code: sessionId
  });

  const values = {
    source: safeText(payload.source) || "stripe",
    provider_event_type: safeText(payload.provider_event_type) || "emarqet.payment",
    status: safeText(payload.status) || "initiated",
    amount,
    currency,
    payer_name: safeText(metadata.payer_name || listing.owner_name),
    payer_email: normalizeEmail(metadata.payer_email || listing.owner_email),
    reference_code: safeText(payload.reference_code || sessionId),
    stripe_checkout_session_id: sessionId,
    stripe_subscription_id: safeText(payload.stripe_subscription_id),
    stripe_invoice_id: safeText(payload.stripe_invoice_id),
    stripe_payment_intent_id: safeText(payload.stripe_payment_intent_id),
    paid_at: safeText(payload.paid_at),
    notes: safeText(payload.notes) || "Plata e-Marqet.",
    metadata: safeJson(metadata)
  };

  if (existingId) {
    db.prepare(`
      UPDATE billing_payments
      SET source=CASE WHEN ? <> '' THEN ? ELSE source END,
          provider_event_type=CASE WHEN ? <> '' THEN ? ELSE provider_event_type END,
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
          paid_at=COALESCE(NULLIF(?, ''), paid_at),
          notes=CASE WHEN ? <> '' THEN ? ELSE notes END,
          metadata=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      values.source, values.source,
      values.provider_event_type, values.provider_event_type,
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
      values.notes, values.notes,
      values.metadata,
      existingId
    );
    return { id: existingId, lastInsertRowid: existingId, changes: 1 };
  }

  const result = db.prepare(`
    INSERT INTO billing_payments (
      company_id, source, provider_event_type, payment_kind,
      status, amount, currency, payer_name, payer_email, reference_code,
      stripe_checkout_session_id, stripe_subscription_id, stripe_invoice_id,
      stripe_payment_intent_id, paid_at, notes, metadata
    )
    VALUES (?, ?, ?, 'emarqet_subscription', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedCompanyId,
    values.source,
    values.provider_event_type,
    values.status,
    values.amount,
    values.currency,
    values.payer_name,
    values.payer_email,
    values.reference_code,
    values.stripe_checkout_session_id,
    values.stripe_subscription_id,
    values.stripe_invoice_id,
    values.stripe_payment_intent_id,
    values.paid_at || null,
    values.notes,
    values.metadata
  );

  return { id: Number(result.lastInsertRowid || 0), lastInsertRowid: result.lastInsertRowid, changes: result.changes };
}

export function markEmarqetListingPaidAndPublished(db, companyId, listing = {}, payload = {}) {
  const status = safeText(payload.status) || "PAID";
  const sessionId = safeText(payload.stripe_checkout_session_id);
  const subscriptionId = safeText(payload.stripe_subscription_id);
  return db.prepare(`
    UPDATE emarqet_listings
    SET status='PUBLICAT',
        stripe_checkout_status=?,
        stripe_checkout_session_id=CASE WHEN ? <> '' THEN ? ELSE stripe_checkout_session_id END,
        paid_at=COALESCE(paid_at, datetime('now')),
        published_at=COALESCE(published_at, date('now')),
        notes=notes,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(
    subscriptionId ? `${status}:${subscriptionId}` : status,
    sessionId,
    sessionId,
    Number(companyId || listing.company_id || 0),
    listing.id
  );
}

export function markEmarqetListingPaidAwaitingApproval(db, companyId, listing = {}, payload = {}) {
  const status = safeText(payload.status) || "PAID";
  const sessionId = safeText(payload.stripe_checkout_session_id);
  const subscriptionId = safeText(payload.stripe_subscription_id);
  return db.prepare(`
    UPDATE emarqet_listings
    SET status=CASE
          WHEN UPPER(COALESCE(status,''))='PUBLICAT' THEN status
          ELSE 'IN_REVIZIE'
        END,
        stripe_checkout_status=?,
        stripe_checkout_session_id=CASE WHEN ? <> '' THEN ? ELSE stripe_checkout_session_id END,
        paid_at=COALESCE(paid_at, datetime('now')),
        published_at=CASE
          WHEN UPPER(COALESCE(status,''))='PUBLICAT' THEN COALESCE(published_at, date('now'))
          ELSE published_at
        END,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(
    subscriptionId ? `${status}:${subscriptionId}` : status,
    sessionId,
    sessionId,
    Number(companyId || listing.company_id || 0),
    listing.id
  );
}

async function runEmarqetInvoiceAutomationSteps(db, facturaId, options = {}) {
  const results = {};
  const errors = [];
  const runStep = async (key, fn) => {
    try {
      results[key] = await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || `${key}_failed`);
      errors.push({ step: key, message });
      console.error(`[EMARQET] Invoice ${key} failed:`, message);
    }
  };

  await runStep("efactura", () => maybeSendBillingInvoiceToEfactura(db, facturaId, { ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated }));
  await runStep("pdf", () => maybeGenerateBillingInvoicePdf(db, facturaId));
  await runStep("email", () => maybeEmailBillingInvoice(db, facturaId, { transporter: options.transporter }));

  return { ok: errors.length === 0, results, errors };
}

export async function runEmarqetInvoiceAutomation(db, paymentId, options = {}) {
  const invoiceResult = maybeGenerateBillingInvoice(db, paymentId, { livemode: options.livemode ? 1 : 0 });
  if (!invoiceResult?.facturaId) return invoiceResult;
  const automation = await runEmarqetInvoiceAutomationSteps(db, invoiceResult.facturaId, options);
  return { ...invoiceResult, automation };
}

export function findEmarqetListingForStripe(db, companyId, metadata = {}, sessionId = "") {
  const listingId = Number(metadata.listing_id || 0);
  const listingCode = safeText(metadata.listing_code);
  const params = [Number(companyId || 0)];
  const where = ["l.company_id=?"];
  if (listingId) {
    where.push("l.id=?");
    params.push(listingId);
  } else if (listingCode) {
    where.push("l.listing_code=?");
    params.push(listingCode);
  } else if (sessionId) {
    where.push("l.stripe_checkout_session_id=?");
    params.push(sessionId);
  } else {
    return null;
  }

  return db.prepare(`
    SELECT
      l.*,
      v.name AS vertical_name,
      v.code AS vertical_code
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    WHERE ${where.join(" AND ")}
    ORDER BY l.id DESC
    LIMIT 1
  `).get(...params) || null;
}

export function findEmarqetPlanForListing(db, companyId, listing = {}) {
  const code = safeText(listing.selected_plan_code || "free").toLowerCase();
  return db.prepare(`
    SELECT *
    FROM emarqet_pricing_plans
    WHERE company_id=?
      AND LOWER(code)=?
    ORDER BY CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 0 ELSE 1 END
    LIMIT 1
  `).get(Number(companyId || listing.company_id || 0), code) || {
    code,
    name: code || "Free",
    monthly_price: 0,
    currency: listing.price_currency || "RON"
  };
}

export async function finalizeEmarqetStripePayment(db, options = {}) {
  const companyId = Number(options.companyId || options.metadata?.emarqet_company_id || 0);
  const listing = options.listing || findEmarqetListingForStripe(db, companyId, options.metadata || {}, options.stripeCheckoutSessionId || "");
  if (!companyId || !listing?.id) return { ok: false, reason: "emarqet_listing_missing" };
  const plan = options.plan || findEmarqetPlanForListing(db, companyId, listing);
  const payment = upsertEmarqetBillingPayment(db, companyId, listing, plan, {
    source: "stripe",
    provider_event_type: options.providerEventType || "stripe.emarqet",
    status: options.status || "paid",
    amount: options.amount ?? plan.monthly_price ?? 0,
    currency: options.currency || plan.currency || listing.price_currency || "RON",
    stripe_checkout_session_id: options.stripeCheckoutSessionId || "",
    stripe_subscription_id: options.stripeSubscriptionId || "",
    stripe_invoice_id: options.stripeInvoiceId || "",
    stripe_payment_intent_id: options.stripePaymentIntentId || "",
    reference_code: options.referenceCode || options.stripeInvoiceId || options.stripeCheckoutSessionId || "",
    paid_at: options.paidAt || new Date().toISOString(),
    stripe_billing_details: options.stripeBillingDetails || {},
    notes: options.notes || "Plata Stripe e-Marqet confirmata.",
    metadata: safeJson(options.metadata || {})
  });

  if (String(options.status || "").toLowerCase() !== "paid") {
    return { ok: true, listingId: listing.id, paymentId: payment.id || payment.lastInsertRowid, invoice: null, pending: true };
  }

  markEmarqetListingPaidAwaitingApproval(db, companyId, listing, {
    status: options.listingPaymentStatus || "PAID",
    stripe_checkout_session_id: options.stripeCheckoutSessionId || listing.stripe_checkout_session_id || "",
    stripe_subscription_id: options.stripeSubscriptionId || ""
  });

  let invoice = null;
  let invoiceError = null;
  try {
    invoice = await runEmarqetInvoiceAutomation(db, payment.id || payment.lastInsertRowid, {
      livemode: options.livemode,
      ensureFacturaXmlGenerated: options.ensureFacturaXmlGenerated,
      transporter: options.transporter
    });
  } catch (error) {
    invoiceError = {
      message: safeText(error?.message || error),
      code: safeText(error?.code)
    };
    console.error("[EMARQET] Invoice automation failed after paid Stripe", invoiceError.message || invoiceError.code || error);
  }

  return { ok: true, listingId: listing.id, paymentId: payment.id || payment.lastInsertRowid, invoice, invoiceError };
}
