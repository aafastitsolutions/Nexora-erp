import Stripe from "stripe";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_AUTO_LOOKBACK_DAYS = 7;
const DEFAULT_AUTO_INTERVAL_MINUTES = 360;
const PAYOUT_TYPES = new Set(["payout", "payout_cancel", "payout_failure"]);

let schedulerStarted = false;
let schedulerRunning = false;

function safeText(value = "") {
  return String(value ?? "").trim();
}

function safeLower(value = "") {
  return safeText(value).toLowerCase();
}

function safeJson(value = {}) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function objectId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return safeText(value.id);
  return "";
}

function objectMetadata(value) {
  if (!value || typeof value !== "object") return {};
  const metadata = value.metadata;
  return metadata && typeof metadata === "object" ? metadata : {};
}

function firstFilled(...values) {
  for (const value of values) {
    const text = safeText(value);
    if (text) return text;
  }
  return "";
}

function isoFromUnix(seconds = 0) {
  const timestamp = Number(seconds || 0);
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toISOString();
}

function normalizeDate(value = "") {
  const text = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateDaysAgo(days = DEFAULT_LOOKBACK_DAYS) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(1, Number(days || DEFAULT_LOOKBACK_DAYS)));
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateRangeToStripeCreated(dateFrom = "", dateTo = "") {
  const created = {};
  const from = normalizeDate(dateFrom);
  const to = normalizeDate(dateTo);
  if (from) created.gte = Math.floor(new Date(`${from}T00:00:00.000Z`).getTime() / 1000);
  if (to) created.lte = Math.floor(new Date(`${to}T23:59:59.999Z`).getTime() / 1000);
  return Object.keys(created).length ? created : undefined;
}

function boolEnv(name, defaultValue = false) {
  const raw = safeLower(process.env[name]);
  if (!raw) return Boolean(defaultValue);
  return ["1", "true", "yes", "on"].includes(raw);
}

function numberEnv(name, defaultValue = 0) {
  const value = Number(process.env[name] || 0);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function sourceFromEnv() {
  const primaryKey = safeText(process.env.STRIPE_SECRET_KEY);
  const emarqetKey = safeText(process.env.EMARQET_STRIPE_SECRET_KEY);
  const sources = [];

  if (primaryKey) {
    sources.push({
      key: "platform",
      label: "Trevoro / Nexora",
      secretKey: primaryKey,
      configured: true,
      available: true,
      defaultBrand: "trevoro"
    });
  }

  if (emarqetKey && emarqetKey !== primaryKey) {
    const liveBlocked = emarqetKey.startsWith("sk_live_") && !boolEnv("EMARQET_ALLOW_LIVE_STRIPE", false);
    sources.push({
      key: "emarqet",
      label: "e-Marqet",
      secretKey: emarqetKey,
      configured: true,
      available: !liveBlocked,
      unavailableReason: liveBlocked ? "live_blocked" : "",
      defaultBrand: "emarqet"
    });
  }

  if (!emarqetKey) {
    sources.push({
      key: "emarqet",
      label: "e-Marqet",
      secretKey: "",
      configured: false,
      available: false,
      unavailableReason: "missing_secret",
      defaultBrand: "emarqet"
    });
  } else if (emarqetKey === primaryKey) {
    sources.push({
      key: "emarqet_shared",
      label: "e-Marqet (cheie comună)",
      secretKey: "",
      configured: true,
      available: false,
      unavailableReason: "covered_by_platform",
      defaultBrand: "emarqet"
    });
  }

  return sources;
}

function availableSourceConfigs(sourceKey = "all") {
  const selected = safeLower(sourceKey || "all");
  return sourceFromEnv()
    .filter((source) => source.available && source.secretKey)
    .filter((source) => selected === "all" || source.key === selected || (selected === "emarqet" && source.key === "emarqet"));
}

export function stripeReconciliationSourceSummaries() {
  return sourceFromEnv().map((source) => ({
    key: source.key,
    label: source.label,
    configured: Boolean(source.configured),
    available: Boolean(source.available),
    unavailableReason: source.unavailableReason || "",
    defaultBrand: source.defaultBrand || ""
  }));
}

export function stripeReconciliationConfigured() {
  return availableSourceConfigs("all").length > 0;
}

export function defaultStripeReconciliationFilters(query = {}) {
  return {
    dateFrom: normalizeDate(query.date_from) || dateDaysAgo(DEFAULT_LOOKBACK_DAYS),
    dateTo: normalizeDate(query.date_to) || todayIsoDate(),
    brand: ["all", "trevoro", "emarqet", "nextpdf", "nexora", "unknown"].includes(safeLower(query.brand)) ? safeLower(query.brand) : "all",
    sourceKey: safeLower(query.source || "all") || "all",
    companyId: Number(query.company_id || 0) || 0,
    q: safeText(query.q)
  };
}

export function ensureStripeReconciliationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_reconciliation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL DEFAULT 'all',
      source_label TEXT,
      stripe_account_id TEXT,
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      requested_by_email TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      date_from TEXT,
      date_to TEXT,
      imported_transactions INTEGER NOT NULL DEFAULT 0,
      imported_payouts INTEGER NOT NULL DEFAULT 0,
      imported_payout_items INTEGER NOT NULL DEFAULT 0,
      matched_invoices INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stripe_reconciliation_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      stripe_source_key TEXT NOT NULL,
      stripe_source_label TEXT,
      stripe_account_id TEXT,
      stripe_payout_id TEXT NOT NULL,
      stripe_balance_transaction_id TEXT,
      status TEXT,
      currency TEXT,
      amount_minor INTEGER NOT NULL DEFAULT 0,
      arrival_date TEXT,
      stripe_created_at TEXT,
      payout_method TEXT,
      payout_type TEXT,
      bank_account_last4 TEXT,
      description TEXT,
      metadata TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stripe_source_key, stripe_payout_id)
    );

    CREATE TABLE IF NOT EXISTS stripe_reconciliation_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      stripe_source_key TEXT NOT NULL,
      stripe_source_label TEXT,
      stripe_account_id TEXT,
      company_id INTEGER,
      brand TEXT NOT NULL DEFAULT 'unknown',
      stripe_balance_transaction_id TEXT NOT NULL,
      stripe_charge_id TEXT,
      stripe_payment_intent_id TEXT,
      stripe_checkout_session_id TEXT,
      stripe_invoice_id TEXT,
      stripe_subscription_id TEXT,
      stripe_payout_id TEXT,
      billing_payment_id INTEGER,
      factura_id INTEGER,
      factura_nr TEXT,
      invoice_amount_minor INTEGER,
      customer_email TEXT,
      customer_name TEXT,
      description TEXT,
      type TEXT,
      reporting_category TEXT,
      stripe_status TEXT,
      reconciliation_status TEXT NOT NULL DEFAULT 'de_verificat',
      currency TEXT,
      gross_amount_minor INTEGER NOT NULL DEFAULT 0,
      stripe_fee_amount_minor INTEGER NOT NULL DEFAULT 0,
      net_amount_minor INTEGER NOT NULL DEFAULT 0,
      available_on TEXT,
      stripe_created_at TEXT,
      metadata TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stripe_source_key, stripe_balance_transaction_id)
    );

    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_runs_created ON stripe_reconciliation_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_tx_company ON stripe_reconciliation_transactions(company_id);
    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_tx_brand ON stripe_reconciliation_transactions(brand);
    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_tx_created ON stripe_reconciliation_transactions(stripe_created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_tx_invoice ON stripe_reconciliation_transactions(factura_id);
    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_tx_payout ON stripe_reconciliation_transactions(stripe_source_key, stripe_payout_id);
    CREATE INDEX IF NOT EXISTS idx_stripe_reconciliation_payout_created ON stripe_reconciliation_payouts(stripe_created_at DESC);
  `);
}

function retrieveStripeAccountId(stripe) {
  return stripe.accounts.retrieve()
    .then((account) => safeText(account?.id))
    .catch(() => "");
}

async function listStripeItems(listFn, params = {}, onItem) {
  let startingAfter = "";
  while (true) {
    const page = await listFn({
      ...params,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    });
    for (const item of page.data || []) {
      await onItem(item);
    }
    if (!page.has_more || !(page.data || []).length) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

function createRun(db, source = {}, options = {}, stripeAccountId = "") {
  const result = db.prepare(`
    INSERT INTO stripe_reconciliation_runs (
      source_key, source_label, stripe_account_id, trigger_source,
      requested_by_email, status, date_from, date_to
    )
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?)
  `).run(
    source.key || "all",
    source.label || "",
    stripeAccountId || "",
    options.triggerSource || "manual",
    options.requestedByEmail || "",
    options.dateFrom || "",
    options.dateTo || ""
  );
  return Number(result.lastInsertRowid || 0);
}

function finishRun(db, runId, status, stats = {}, errorMessage = "") {
  db.prepare(`
    UPDATE stripe_reconciliation_runs
    SET status=?,
        imported_transactions=?,
        imported_payouts=?,
        imported_payout_items=?,
        matched_invoices=?,
        error_message=?,
        finished_at=datetime('now')
    WHERE id=?
  `).run(
    status,
    Number(stats.importedTransactions || 0),
    Number(stats.importedPayouts || 0),
    Number(stats.importedPayoutItems || 0),
    Number(stats.matchedInvoices || 0),
    errorMessage || null,
    runId
  );
}

function parsePaymentMetadata(payment = {}) {
  try {
    const parsed = payment?.metadata ? JSON.parse(String(payment.metadata)) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function findLinkedPayment(db, identifiers = {}) {
  const invoiceId = safeText(identifiers.stripeInvoiceId);
  const paymentIntentId = safeText(identifiers.stripePaymentIntentId);
  const checkoutSessionId = safeText(identifiers.stripeCheckoutSessionId);
  const subscriptionId = safeText(identifiers.stripeSubscriptionId);
  const companyId = Number(identifiers.companyId || 0) || 0;

  const selectSql = `
    SELECT
      bp.*,
      f.factura_nr,
      f.total AS factura_total,
      f.moneda AS factura_moneda
    FROM billing_payments bp
    LEFT JOIN facturi f ON f.id=bp.generated_factura_id AND f.company_id=bp.company_id
  `;

  const bySingleField = (field, value) => {
    if (!value) return null;
    return db.prepare(`
      ${selectSql}
      WHERE bp.${field}=?
      ORDER BY bp.id DESC
      LIMIT 1
    `).get(value) || null;
  };

  return bySingleField("stripe_invoice_id", invoiceId)
    || bySingleField("stripe_payment_intent_id", paymentIntentId)
    || bySingleField("stripe_checkout_session_id", checkoutSessionId)
    || (subscriptionId && companyId ? db.prepare(`
      ${selectSql}
      WHERE bp.company_id=? AND bp.stripe_subscription_id=?
      ORDER BY bp.id DESC
      LIMIT 1
    `).get(companyId, subscriptionId) : null)
    || (subscriptionId ? db.prepare(`
      ${selectSql}
      WHERE bp.stripe_subscription_id=?
      ORDER BY bp.id DESC
      LIMIT 1
    `).get(subscriptionId) : null)
    || null;
}

function detectBrand({ source, payment, metadata = {} }) {
  const paymentKind = safeLower(payment?.payment_kind);
  const metadataText = safeLower(JSON.stringify(metadata || {}));
  const notes = safeLower(`${payment?.notes || ""} ${payment?.provider_event_type || ""}`);

  if (source?.key === "emarqet" || paymentKind === "emarqet_subscription" || metadataText.includes("emarqet") || notes.includes("emarqet")) {
    return "emarqet";
  }
  if (paymentKind === "nextpdf_subscription" || metadataText.includes("nextpdf") || notes.includes("nextpdf")) {
    return "nextpdf";
  }
  if (
    metadataText.includes("trevoro")
    || safeLower(metadata.plan_code).includes("trevoro")
    || safeLower(metadata.source).includes("trevoro")
    || safeText(metadata.property_id)
    || notes.includes("trevoro")
  ) {
    return "trevoro";
  }
  if (payment?.id) return "nexora";
  return source?.defaultBrand || "unknown";
}

function linkedReconciliationStatus(payment = {}, tx = {}) {
  const facturaId = Number(payment?.generated_factura_id || 0) || 0;
  if (!payment?.id) return "de_verificat";
  if (!facturaId) return "plata_fara_factura";

  const invoiceMinor = Math.round(Number(payment?.factura_total || 0) * 100);
  if (!invoiceMinor) return "reconciliat";
  return Math.abs(Number(tx.grossAmountMinor || 0) - invoiceMinor) <= 1
    ? "reconciliat"
    : "factura_legata_suma_diferita";
}

async function retrieveCharge(stripe, sourceObject) {
  if (sourceObject && typeof sourceObject === "object" && sourceObject.object === "charge") return sourceObject;
  const sourceId = objectId(sourceObject);
  if (!sourceId.startsWith("ch_")) return null;
  try {
    return await stripe.charges.retrieve(sourceId, { expand: ["payment_intent"] });
  } catch {
    return null;
  }
}

async function retrievePaymentIntent(stripe, idOrObject) {
  if (idOrObject && typeof idOrObject === "object" && idOrObject.object === "payment_intent") return idOrObject;
  const id = objectId(idOrObject);
  if (!id.startsWith("pi_")) return null;
  try {
    return await stripe.paymentIntents.retrieve(id);
  } catch {
    return null;
  }
}

async function findCheckoutSession(stripe, { paymentIntentId = "", subscriptionId = "" } = {}) {
  try {
    if (paymentIntentId) {
      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
      if (sessions.data?.[0]) return sessions.data[0];
    }
    if (subscriptionId) {
      const sessions = await stripe.checkout.sessions.list({ subscription: subscriptionId, limit: 1 });
      if (sessions.data?.[0]) return sessions.data[0];
    }
  } catch {}
  return null;
}

async function findStripeInvoice(stripe, { invoiceId = "", paymentIntentId = "" } = {}) {
  try {
    if (invoiceId) return await stripe.invoices.retrieve(invoiceId);
    if (paymentIntentId) {
      const invoices = await stripe.invoices.list({ payment_intent: paymentIntentId, limit: 1 });
      if (invoices.data?.[0]) return invoices.data[0];
    }
  } catch {}
  return null;
}

async function buildAndStoreTransaction(db, stripe, source, balanceTx, runId, stripeAccountId, payoutIdOverride = "") {
  if (PAYOUT_TYPES.has(safeLower(balanceTx?.type))) return { imported: false, matched: false };

  const balanceSource = balanceTx?.source || null;
  const charge = await retrieveCharge(stripe, balanceSource);
  const paymentIntent = await retrievePaymentIntent(stripe, charge?.payment_intent || balanceSource);
  const paymentIntentId = objectId(charge?.payment_intent || paymentIntent);
  const invoiceIdFromObjects = firstFilled(charge?.invoice, paymentIntent?.invoice);
  const stripeInvoice = await findStripeInvoice(stripe, { invoiceId: invoiceIdFromObjects, paymentIntentId });
  const stripeInvoiceId = objectId(stripeInvoice) || invoiceIdFromObjects;
  const subscriptionId = firstFilled(
    objectId(stripeInvoice?.subscription),
    objectId(charge?.subscription),
    objectId(paymentIntent?.subscription)
  );
  const checkoutSession = await findCheckoutSession(stripe, { paymentIntentId, subscriptionId });
  const checkoutSessionId = objectId(checkoutSession);

  const mergedMetadata = {
    ...objectMetadata(stripeInvoice),
    ...objectMetadata(paymentIntent),
    ...objectMetadata(charge),
    ...objectMetadata(checkoutSession)
  };
  const companyId = Number(
    mergedMetadata.company_id
      || mergedMetadata.emarqet_company_id
      || checkoutSession?.client_reference_id
      || 0
  ) || 0;

  const payment = findLinkedPayment(db, {
    stripeInvoiceId,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: checkoutSessionId,
    stripeSubscriptionId: subscriptionId,
    companyId
  });
  const paymentMetadata = parsePaymentMetadata(payment || {});
  const metadata = { ...mergedMetadata, ...paymentMetadata };
  const brand = detectBrand({ source, payment, metadata });
  const effectiveCompanyId = Number(payment?.company_id || companyId || 0) || null;
  const grossAmountMinor = Number(balanceTx?.amount || 0);
  const feeAmountMinor = Number(balanceTx?.fee || 0);
  const netAmountMinor = Number(balanceTx?.net || 0);
  const reconciliationStatus = linkedReconciliationStatus(payment || {}, { grossAmountMinor });
  const customerEmail = firstFilled(
    charge?.billing_details?.email,
    checkoutSession?.customer_details?.email,
    stripeInvoice?.customer_email,
    paymentIntent?.receipt_email,
    payment?.payer_email
  ).toLowerCase();
  const customerName = firstFilled(
    charge?.billing_details?.name,
    checkoutSession?.customer_details?.name,
    stripeInvoice?.customer_name,
    payment?.payer_name
  );
  const stripeChargeId = objectId(charge) || (objectId(balanceSource).startsWith("ch_") ? objectId(balanceSource) : "");
  const stripePayoutId = firstFilled(payoutIdOverride, balanceTx?.payout);

  db.prepare(`
    INSERT INTO stripe_reconciliation_transactions (
      run_id, stripe_source_key, stripe_source_label, stripe_account_id, company_id, brand,
      stripe_balance_transaction_id, stripe_charge_id, stripe_payment_intent_id,
      stripe_checkout_session_id, stripe_invoice_id, stripe_subscription_id, stripe_payout_id,
      billing_payment_id, factura_id, factura_nr, invoice_amount_minor,
      customer_email, customer_name, description, type, reporting_category,
      stripe_status, reconciliation_status, currency, gross_amount_minor,
      stripe_fee_amount_minor, net_amount_minor, available_on, stripe_created_at, metadata,
      imported_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(stripe_source_key, stripe_balance_transaction_id)
    DO UPDATE SET
      run_id=excluded.run_id,
      stripe_source_label=excluded.stripe_source_label,
      stripe_account_id=excluded.stripe_account_id,
      company_id=COALESCE(excluded.company_id, stripe_reconciliation_transactions.company_id),
      brand=excluded.brand,
      stripe_charge_id=COALESCE(NULLIF(excluded.stripe_charge_id, ''), stripe_reconciliation_transactions.stripe_charge_id),
      stripe_payment_intent_id=COALESCE(NULLIF(excluded.stripe_payment_intent_id, ''), stripe_reconciliation_transactions.stripe_payment_intent_id),
      stripe_checkout_session_id=COALESCE(NULLIF(excluded.stripe_checkout_session_id, ''), stripe_reconciliation_transactions.stripe_checkout_session_id),
      stripe_invoice_id=COALESCE(NULLIF(excluded.stripe_invoice_id, ''), stripe_reconciliation_transactions.stripe_invoice_id),
      stripe_subscription_id=COALESCE(NULLIF(excluded.stripe_subscription_id, ''), stripe_reconciliation_transactions.stripe_subscription_id),
      stripe_payout_id=COALESCE(NULLIF(excluded.stripe_payout_id, ''), stripe_reconciliation_transactions.stripe_payout_id),
      billing_payment_id=COALESCE(excluded.billing_payment_id, stripe_reconciliation_transactions.billing_payment_id),
      factura_id=COALESCE(excluded.factura_id, stripe_reconciliation_transactions.factura_id),
      factura_nr=COALESCE(NULLIF(excluded.factura_nr, ''), stripe_reconciliation_transactions.factura_nr),
      invoice_amount_minor=COALESCE(excluded.invoice_amount_minor, stripe_reconciliation_transactions.invoice_amount_minor),
      customer_email=COALESCE(NULLIF(excluded.customer_email, ''), stripe_reconciliation_transactions.customer_email),
      customer_name=COALESCE(NULLIF(excluded.customer_name, ''), stripe_reconciliation_transactions.customer_name),
      description=excluded.description,
      type=excluded.type,
      reporting_category=excluded.reporting_category,
      stripe_status=excluded.stripe_status,
      reconciliation_status=excluded.reconciliation_status,
      currency=excluded.currency,
      gross_amount_minor=excluded.gross_amount_minor,
      stripe_fee_amount_minor=excluded.stripe_fee_amount_minor,
      net_amount_minor=excluded.net_amount_minor,
      available_on=excluded.available_on,
      stripe_created_at=excluded.stripe_created_at,
      metadata=excluded.metadata,
      updated_at=datetime('now')
  `).run(
    runId,
    source.key,
    source.label,
    stripeAccountId,
    effectiveCompanyId,
    brand,
    safeText(balanceTx?.id),
    stripeChargeId,
    paymentIntentId,
    checkoutSessionId,
    stripeInvoiceId,
    subscriptionId,
    stripePayoutId,
    payment?.id || null,
    payment?.generated_factura_id || null,
    payment?.factura_nr || "",
    payment?.factura_total ? Math.round(Number(payment.factura_total || 0) * 100) : null,
    customerEmail,
    customerName,
    safeText(balanceTx?.description || charge?.description || paymentIntent?.description || payment?.notes),
    safeText(balanceTx?.type),
    safeText(balanceTx?.reporting_category),
    safeText(balanceTx?.status),
    reconciliationStatus,
    safeLower(balanceTx?.currency),
    grossAmountMinor,
    feeAmountMinor,
    netAmountMinor,
    isoFromUnix(balanceTx?.available_on),
    isoFromUnix(balanceTx?.created),
    safeJson({
      balance_transaction_id: balanceTx?.id || "",
      charge_id: stripeChargeId,
      payment_intent_id: paymentIntentId,
      checkout_session_id: checkoutSessionId,
      stripe_invoice_id: stripeInvoiceId,
      subscription_id: subscriptionId,
      payout_id: stripePayoutId,
      metadata
    })
  );

  return { imported: true, matched: Boolean(payment?.generated_factura_id) };
}

function payoutDestinationLast4(payout = {}) {
  const destination = payout?.destination;
  if (destination && typeof destination === "object") return safeText(destination.last4);
  return "";
}

function upsertPayout(db, source, payout, runId, stripeAccountId) {
  db.prepare(`
    INSERT INTO stripe_reconciliation_payouts (
      run_id, stripe_source_key, stripe_source_label, stripe_account_id,
      stripe_payout_id, stripe_balance_transaction_id, status, currency,
      amount_minor, arrival_date, stripe_created_at, payout_method, payout_type,
      bank_account_last4, description, metadata, imported_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(stripe_source_key, stripe_payout_id)
    DO UPDATE SET
      run_id=excluded.run_id,
      stripe_source_label=excluded.stripe_source_label,
      stripe_account_id=excluded.stripe_account_id,
      stripe_balance_transaction_id=COALESCE(NULLIF(excluded.stripe_balance_transaction_id, ''), stripe_reconciliation_payouts.stripe_balance_transaction_id),
      status=excluded.status,
      currency=excluded.currency,
      amount_minor=excluded.amount_minor,
      arrival_date=excluded.arrival_date,
      stripe_created_at=excluded.stripe_created_at,
      payout_method=excluded.payout_method,
      payout_type=excluded.payout_type,
      bank_account_last4=COALESCE(NULLIF(excluded.bank_account_last4, ''), stripe_reconciliation_payouts.bank_account_last4),
      description=excluded.description,
      metadata=excluded.metadata,
      updated_at=datetime('now')
  `).run(
    runId,
    source.key,
    source.label,
    stripeAccountId,
    safeText(payout?.id),
    objectId(payout?.balance_transaction),
    safeText(payout?.status),
    safeLower(payout?.currency),
    Number(payout?.amount || 0),
    isoFromUnix(payout?.arrival_date),
    isoFromUnix(payout?.created),
    safeText(payout?.method),
    safeText(payout?.type),
    payoutDestinationLast4(payout),
    safeText(payout?.description),
    safeJson({
      payout_id: payout?.id || "",
      balance_transaction_id: objectId(payout?.balance_transaction),
      metadata: objectMetadata(payout)
    })
  );
}

async function importPayoutsForSource(db, stripe, source, runId, stripeAccountId, options = {}) {
  const created = dateRangeToStripeCreated(options.dateFrom, options.dateTo);
  const stats = { importedPayouts: 0, importedPayoutItems: 0, importedTransactions: 0, matchedInvoices: 0 };

  await listStripeItems(
    (params) => stripe.payouts.list(params),
    { ...(created ? { created } : {}) },
    async (payout) => {
      upsertPayout(db, source, payout, runId, stripeAccountId);
      stats.importedPayouts += 1;
      const payoutId = safeText(payout?.id);
      if (!payoutId) return;
      await listStripeItems(
        (params) => stripe.balanceTransactions.list(params),
        { payout: payoutId, expand: ["data.source"] },
        async (balanceTx) => {
          const result = await buildAndStoreTransaction(db, stripe, source, balanceTx, runId, stripeAccountId, payoutId);
          if (result.imported) {
            stats.importedPayoutItems += 1;
            stats.importedTransactions += 1;
            if (result.matched) stats.matchedInvoices += 1;
          }
        }
      );
    }
  );

  return stats;
}

async function importBalanceTransactionsForSource(db, stripe, source, runId, stripeAccountId, options = {}) {
  const created = dateRangeToStripeCreated(options.dateFrom, options.dateTo);
  const stats = { importedTransactions: 0, matchedInvoices: 0 };
  await listStripeItems(
    (params) => stripe.balanceTransactions.list(params),
    { ...(created ? { created } : {}), expand: ["data.source"] },
    async (balanceTx) => {
      const result = await buildAndStoreTransaction(db, stripe, source, balanceTx, runId, stripeAccountId);
      if (result.imported) {
        stats.importedTransactions += 1;
        if (result.matched) stats.matchedInvoices += 1;
      }
    }
  );
  return stats;
}

export async function importStripeReconciliation(db, options = {}) {
  ensureStripeReconciliationSchema(db);
  const sources = availableSourceConfigs(options.sourceKey || "all");
  if (!sources.length) {
    throw new Error("stripe_not_configured");
  }

  const totals = {
    runs: [],
    importedTransactions: 0,
    importedPayouts: 0,
    importedPayoutItems: 0,
    matchedInvoices: 0,
    errors: []
  };

  for (const source of sources) {
    const stripe = new Stripe(source.secretKey);
    const stripeAccountId = await retrieveStripeAccountId(stripe);
    const runId = createRun(db, source, options, stripeAccountId);
    totals.runs.push(runId);
    try {
      const payoutStats = await importPayoutsForSource(db, stripe, source, runId, stripeAccountId, options);
      const transactionStats = await importBalanceTransactionsForSource(db, stripe, source, runId, stripeAccountId, options);
      const stats = {
        importedPayouts: payoutStats.importedPayouts,
        importedPayoutItems: payoutStats.importedPayoutItems,
        importedTransactions: payoutStats.importedTransactions + transactionStats.importedTransactions,
        matchedInvoices: payoutStats.matchedInvoices + transactionStats.matchedInvoices
      };
      finishRun(db, runId, "completed", stats);
      totals.importedTransactions += stats.importedTransactions;
      totals.importedPayouts += stats.importedPayouts;
      totals.importedPayoutItems += stats.importedPayoutItems;
      totals.matchedInvoices += stats.matchedInvoices;
    } catch (error) {
      const message = safeText(error?.message || error || "stripe_import_failed");
      finishRun(db, runId, "failed", {}, message);
      totals.errors.push({ source: source.key, message });
    }
  }

  if (totals.errors.length && totals.importedTransactions === 0 && totals.importedPayouts === 0) {
    throw new Error(totals.errors.map((item) => `${item.source}:${item.message}`).join("; "));
  }

  return totals;
}

function reportWhere(filters = {}, alias = "t") {
  const where = ["1=1"];
  const params = [];
  if (filters.dateFrom) {
    where.push(`date(COALESCE(${alias}.stripe_created_at, ${alias}.imported_at)) >= date(?)`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push(`date(COALESCE(${alias}.stripe_created_at, ${alias}.imported_at)) <= date(?)`);
    params.push(filters.dateTo);
  }
  if (filters.brand && filters.brand !== "all") {
    where.push(`${alias}.brand=?`);
    params.push(filters.brand);
  }
  if (filters.sourceKey && filters.sourceKey !== "all") {
    if (filters.sourceKey === "emarqet") {
      where.push(`${alias}.stripe_source_key IN ('emarqet', 'emarqet_shared')`);
    } else {
      where.push(`${alias}.stripe_source_key=?`);
      params.push(filters.sourceKey);
    }
  }
  if (Number(filters.companyId || 0)) {
    where.push(`${alias}.company_id=?`);
    params.push(Number(filters.companyId || 0));
  }
  if (filters.q) {
    where.push(`(
      LOWER(COALESCE(c.name,'')) LIKE ?
      OR LOWER(COALESCE(${alias}.factura_nr,'')) LIKE ?
      OR LOWER(COALESCE(${alias}.customer_email,'')) LIKE ?
      OR LOWER(COALESCE(${alias}.stripe_charge_id,'')) LIKE ?
      OR LOWER(COALESCE(${alias}.stripe_payment_intent_id,'')) LIKE ?
      OR LOWER(COALESCE(${alias}.stripe_payout_id,'')) LIKE ?
    )`);
    const token = `%${safeLower(filters.q)}%`;
    params.push(token, token, token, token, token, token);
  }
  return { whereSql: where.join(" AND "), params };
}

export function loadStripeReconciliationDashboard(db, filters = {}) {
  ensureStripeReconciliationSchema(db);
  const normalized = {
    dateFrom: normalizeDate(filters.dateFrom) || dateDaysAgo(DEFAULT_LOOKBACK_DAYS),
    dateTo: normalizeDate(filters.dateTo) || todayIsoDate(),
    brand: filters.brand || "all",
    sourceKey: filters.sourceKey || "all",
    companyId: Number(filters.companyId || 0) || 0,
    q: safeText(filters.q)
  };
  const txWhere = reportWhere(normalized, "t");

  const rows = db.prepare(`
    SELECT
      t.*,
      c.name AS company_name,
      p.arrival_date AS payout_arrival_date,
      p.status AS payout_status,
      p.amount_minor AS payout_amount_minor
    FROM stripe_reconciliation_transactions t
    LEFT JOIN companies c ON c.id=t.company_id
    LEFT JOIN stripe_reconciliation_payouts p
      ON p.stripe_source_key=t.stripe_source_key
     AND p.stripe_payout_id=t.stripe_payout_id
    WHERE ${txWhere.whereSql}
    ORDER BY datetime(COALESCE(t.stripe_created_at, t.imported_at)) DESC, t.id DESC
    LIMIT 300
  `).all(...txWhere.params);

  const totalsByCurrency = db.prepare(`
    SELECT
      t.currency,
      COUNT(*) AS tx_count,
      IFNULL(SUM(t.gross_amount_minor), 0) AS gross_amount_minor,
      IFNULL(SUM(t.stripe_fee_amount_minor), 0) AS stripe_fee_amount_minor,
      IFNULL(SUM(t.net_amount_minor), 0) AS net_amount_minor,
      SUM(CASE WHEN t.factura_id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count,
      SUM(CASE WHEN COALESCE(t.stripe_payout_id,'') <> '' THEN 1 ELSE 0 END) AS payout_linked_count
    FROM stripe_reconciliation_transactions t
    LEFT JOIN companies c ON c.id=t.company_id
    WHERE ${txWhere.whereSql}
    GROUP BY t.currency
    ORDER BY t.currency ASC
  `).all(...txWhere.params);

  const payoutWhere = (() => {
    const where = ["1=1"];
    const params = [];
    if (normalized.dateFrom) {
      where.push("date(COALESCE(p.arrival_date, p.stripe_created_at, p.imported_at)) >= date(?)");
      params.push(normalized.dateFrom);
    }
    if (normalized.dateTo) {
      where.push("date(COALESCE(p.arrival_date, p.stripe_created_at, p.imported_at)) <= date(?)");
      params.push(normalized.dateTo);
    }
    if (normalized.sourceKey && normalized.sourceKey !== "all") {
      if (normalized.sourceKey === "emarqet") where.push("p.stripe_source_key IN ('emarqet', 'emarqet_shared')");
      else {
        where.push("p.stripe_source_key=?");
        params.push(normalized.sourceKey);
      }
    }
    return { whereSql: where.join(" AND "), params };
  })();

  const payouts = db.prepare(`
    SELECT
      p.*,
      COUNT(t.id) AS transaction_count,
      IFNULL(SUM(t.net_amount_minor), 0) AS reconciled_net_minor
    FROM stripe_reconciliation_payouts p
    LEFT JOIN stripe_reconciliation_transactions t
      ON t.stripe_source_key=p.stripe_source_key
     AND t.stripe_payout_id=p.stripe_payout_id
    WHERE ${payoutWhere.whereSql}
    GROUP BY p.id
    ORDER BY datetime(COALESCE(p.arrival_date, p.stripe_created_at, p.imported_at)) DESC, p.id DESC
    LIMIT 100
  `).all(...payoutWhere.params);

  const payoutTotalsByCurrency = db.prepare(`
    SELECT currency, COUNT(*) AS payout_count, IFNULL(SUM(amount_minor), 0) AS amount_minor
    FROM stripe_reconciliation_payouts p
    WHERE ${payoutWhere.whereSql}
    GROUP BY currency
    ORDER BY currency ASC
  `).all(...payoutWhere.params);

  const runs = db.prepare(`
    SELECT *
    FROM stripe_reconciliation_runs
    ORDER BY id DESC
    LIMIT 8
  `).all();

  const companies = db.prepare(`
    SELECT id, name
    FROM companies
    WHERE archived_at IS NULL
    ORDER BY name COLLATE NOCASE ASC
  `).all();

  return {
    filters: normalized,
    sources: stripeReconciliationSourceSummaries(),
    rows,
    payouts,
    runs,
    companies,
    stats: {
      totalsByCurrency,
      payoutTotalsByCurrency,
      transactionCount: totalsByCurrency.reduce((sum, row) => sum + Number(row.tx_count || 0), 0),
      matchedCount: totalsByCurrency.reduce((sum, row) => sum + Number(row.matched_count || 0), 0),
      payoutLinkedCount: totalsByCurrency.reduce((sum, row) => sum + Number(row.payout_linked_count || 0), 0),
      payoutCount: payoutTotalsByCurrency.reduce((sum, row) => sum + Number(row.payout_count || 0), 0)
    }
  };
}

export function loadStripeReconciliationCsvRows(db, filters = {}) {
  ensureStripeReconciliationSchema(db);
  const txWhere = reportWhere(filters, "t");
  return db.prepare(`
    SELECT
      t.*,
      c.name AS company_name,
      p.arrival_date AS payout_arrival_date,
      p.status AS payout_status,
      p.amount_minor AS payout_amount_minor
    FROM stripe_reconciliation_transactions t
    LEFT JOIN companies c ON c.id=t.company_id
    LEFT JOIN stripe_reconciliation_payouts p
      ON p.stripe_source_key=t.stripe_source_key
     AND p.stripe_payout_id=t.stripe_payout_id
    WHERE ${txWhere.whereSql}
    ORDER BY datetime(COALESCE(t.stripe_created_at, t.imported_at)) DESC, t.id DESC
    LIMIT 10000
  `).all(...txWhere.params);
}

export function formatMinorAmount(value = 0) {
  const n = Number(value || 0) / 100;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function startStripeReconciliationScheduler(db) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  if (!boolEnv("STRIPE_RECONCILIATION_AUTO_IMPORT", true)) return;
  if (!stripeReconciliationConfigured()) return;

  const intervalMinutes = Math.max(15, numberEnv("STRIPE_RECONCILIATION_INTERVAL_MINUTES", DEFAULT_AUTO_INTERVAL_MINUTES));
  const lookbackDays = Math.max(1, numberEnv("STRIPE_RECONCILIATION_LOOKBACK_DAYS", DEFAULT_AUTO_LOOKBACK_DAYS));
  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await importStripeReconciliation(db, {
        sourceKey: "all",
        dateFrom: dateDaysAgo(lookbackDays),
        dateTo: todayIsoDate(),
        triggerSource: "auto",
        requestedByEmail: "system"
      });
    } catch (error) {
      console.error("[STRIPE-RECONCILIATION] auto import failed:", error?.message || error);
    } finally {
      schedulerRunning = false;
    }
  };

  const startupTimer = setTimeout(run, 60 * 1000);
  if (typeof startupTimer.unref === "function") startupTimer.unref();
  const intervalTimer = setInterval(run, intervalMinutes * 60 * 1000);
  if (typeof intervalTimer.unref === "function") intervalTimer.unref();
}
