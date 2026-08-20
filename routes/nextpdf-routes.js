import { renderNextPdfAdminPage } from "../src/ui/nexora-nextpdf-page.js";
import crypto from "node:crypto";
import Stripe from "stripe";

function safeText(value = "") {
  return String(value ?? "").trim();
}

function apiBase() {
  return safeText(process.env.NEXTPDF_ADMIN_API_BASE || "https://nextpdf.qr-lab.ro").replace(/\/+$/, "");
}

function adminToken() {
  return safeText(process.env.NEXTPDF_ADMIN_API_TOKEN);
}

function validInternalToken(value = "") {
  const expected = Buffer.from(adminToken());
  const received = Buffer.from(safeText(value));
  return expected.length > 0 && expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function nextPdfOwnerCompanyId() {
  return Number(process.env.NEXTPDF_OWNER_COMPANY_ID || process.env.BILLING_ISSUER_COMPANY_ID || 1);
}

export function isNextPdfAdminUser(user = {}) {
  if (Number(user.is_super_admin || 0) === 1) return true;
  const isAdmin = String(user.role || "").trim().toLowerCase() === "admin"
    || Number(user.is_company_admin || 0) === 1;
  return isAdmin && Number(user.company_id || 0) === nextPdfOwnerCompanyId();
}

function requireNextPdfAdmin(req, res, next) {
  if (!isNextPdfAdminUser(req.session?.user)) return res.status(403).send("Forbidden");
  return next();
}

function nextPdfPriceIds() {
  return new Set([
    process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID,
    process.env.NEXTPDF_STRIPE_ANNUAL_PRICE_ID
  ].map((value) => safeText(value)).filter(Boolean));
}

function invoicePriceIds(invoice = {}) {
  return (invoice?.lines?.data || [])
    .map((line) => safeText(line?.price?.id || line?.pricing?.price_details?.price))
    .filter(Boolean);
}

function subscriptionPeriodEnd(subscription = {}) {
  const direct = Number(subscription.current_period_end || 0);
  if (direct) return direct;
  return Math.max(0, ...(subscription.items?.data || []).map((item) => Number(item.current_period_end || 0)));
}

async function scheduleNextPdfStripeCancellation({ accountId, subscriptionId, customerId = "" }) {
  const secretKey = safeText(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY nu este configurat în Nexora.");
  if (!Number.isInteger(accountId) || accountId <= 0 || !subscriptionId.startsWith("sub_")) {
    throw new Error("Datele abonamentului NextPDF sunt invalide.");
  }
  const stripe = new Stripe(secretKey, { timeout: 20_000, maxNetworkRetries: 1 });
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const configuredPriceIds = nextPdfPriceIds();
  const priceIds = new Set((subscription.items?.data || []).map((item) => safeText(item.price?.id)).filter(Boolean));
  if (![...priceIds].some((priceId) => configuredPriceIds.has(priceId))) {
    throw new Error("Abonamentul nu aparține produsului NextPDF LIVE.");
  }
  const subscriptionCustomerId = safeText(
    typeof subscription.customer === "object" ? subscription.customer?.id : subscription.customer
  );
  if (customerId && subscriptionCustomerId !== customerId) {
    throw new Error("Clientul Stripe nu corespunde contului NextPDF.");
  }
  const metadataAccountId = Number(subscription.metadata?.nextpdf_account_id || 0);
  if (metadataAccountId && metadataAccountId !== accountId) {
    throw new Error("Abonamentul Stripe este asociat altui cont NextPDF.");
  }
  const updated = subscription.cancel_at_period_end
    ? subscription
    : await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  return {
    ok: true,
    subscriptionId: updated.id,
    customerId: subscriptionCustomerId,
    status: updated.status,
    cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
    currentPeriodEnd: subscriptionPeriodEnd(updated)
  };
}

async function loadNextPdfPaidInvoices() {
  const secretKey = safeText(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY nu este configurat în Nexora.");
  const priceIds = nextPdfPriceIds();
  if (!priceIds.size) throw new Error("Price ID-urile NextPDF nu sunt configurate în Nexora.");
  const stripe = new Stripe(secretKey);
  const page = await stripe.invoices.list({ status: "paid", limit: 100 });
  return (page.data || []).filter((invoice) => invoicePriceIds(invoice).some((priceId) => priceIds.has(priceId)));
}

async function nextPdfAdminFetch(path, options = {}) {
  if (!adminToken()) throw new Error("NEXTPDF_ADMIN_API_TOKEN nu este configurat în Nexora.");
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/json",
      "X-Nexora-Admin-Token": adminToken(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`NextPDF API a răspuns nevalid (${response.status}).`);
    }
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || `NextPDF API error ${response.status}`);
  }
  return data;
}

async function loadOverview() {
  return nextPdfAdminFetch("/api/v1/admin/overview");
}

function render(req, res, overview = {}, extra = {}) {
  return res.type("html").send(renderNextPdfAdminPage({
    overview,
    user: req.session?.user,
    companyName: req.session?.user?.company_name || "A&A FAST IT SOLUTIONS S.R.L.",
    apiBase: apiBase(),
    ...extra
  }));
}

export function registerNextPdfRoutes(app, { requireAuth }) {
  app.post("/api/internal/nextpdf/subscriptions/cancel", async (req, res) => {
    if (!validInternalToken(req.get("X-NextPDF-Admin-Token"))) {
      return res.status(401).json({ error: { code: "invalid_token", message: "Autorizare invalidă." } });
    }
    try {
      const result = await scheduleNextPdfStripeCancellation({
        accountId: Number(req.body?.accountId || 0),
        subscriptionId: safeText(req.body?.subscriptionId),
        customerId: safeText(req.body?.customerId)
      });
      return res.json(result);
    } catch (error) {
      const status = error?.code === "resource_missing" ? 404 : 502;
      return res.status(status).json({
        error: { code: "stripe_cancel_error", message: error?.message || "Anularea Stripe a eșuat." }
      });
    }
  });

  app.get("/nexora/super-admin/nextpdf", requireAuth, requireNextPdfAdmin, async (req, res) => {
    try {
      return render(req, res, await loadOverview(), { ok: safeText(req.query?.ok) });
    } catch (error) {
      return render(req, res, {}, { error: error?.message || "NextPDF nu este disponibil." });
    }
  });

  app.post("/nexora/super-admin/nextpdf/users/:id/reset-password", requireAuth, requireNextPdfAdmin, async (req, res) => {
    try {
      const result = await nextPdfAdminFetch(`/api/v1/admin/users/${Number(req.params.id)}/reset-password`, {
        method: "POST",
        body: "{}"
      });
      return render(req, res, await loadOverview(), {
        ok: "password_reset",
        temporaryPassword: result.temporaryPassword || ""
      });
    } catch (error) {
      return render(req, res, await loadOverview().catch(() => ({})), { error: error?.message || "Resetarea a eșuat." });
    }
  });

  app.post("/nexora/super-admin/nextpdf/users/:id/revoke-sessions", requireAuth, requireNextPdfAdmin, async (req, res) => {
    try {
      await nextPdfAdminFetch(`/api/v1/admin/users/${Number(req.params.id)}/revoke-sessions`, {
        method: "POST",
        body: "{}"
      });
      return res.redirect("/nexora/super-admin/nextpdf?ok=sessions_revoked");
    } catch (error) {
      return render(req, res, await loadOverview().catch(() => ({})), { error: error?.message || "Revocarea sesiunilor a eșuat." });
    }
  });

  app.post("/nexora/super-admin/nextpdf/users/:id/cancel-subscription", requireAuth, requireNextPdfAdmin, async (req, res) => {
    try {
      await nextPdfAdminFetch(`/api/v1/admin/users/${Number(req.params.id)}/cancel-subscription`, {
        method: "POST",
        body: "{}"
      });
      return res.redirect("/nexora/super-admin/nextpdf?ok=subscription_cancellation_scheduled");
    } catch (error) {
      return render(req, res, await loadOverview().catch(() => ({})), {
        error: error?.message || "Anularea abonamentului a eșuat."
      });
    }
  });

  app.post("/nexora/super-admin/nextpdf/users/:id/status", requireAuth, requireNextPdfAdmin, async (req, res) => {
    try {
      const disabled = ["1", "true", "on"].includes(String(req.body?.disabled || "").toLowerCase());
      await nextPdfAdminFetch(`/api/v1/admin/users/${Number(req.params.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ disabled })
      });
      return res.redirect(`/nexora/super-admin/nextpdf?ok=${disabled ? "user_disabled" : "user_enabled"}`);
    } catch (error) {
      return render(req, res, await loadOverview().catch(() => ({})), { error: error?.message || "Actualizarea contului a eșuat." });
    }
  });

  app.post("/nexora/super-admin/nextpdf/payments/sync", requireAuth, requireNextPdfAdmin, async (req, res) => {
    try {
      const invoices = await loadNextPdfPaidInvoices();
      const result = await nextPdfAdminFetch("/api/v1/admin/payments/sync", {
        method: "POST",
        body: JSON.stringify({ invoices })
      });
      return res.redirect(`/nexora/super-admin/nextpdf?ok=payments_synced&count=${Number(result.synced || 0)}`);
    } catch (error) {
      return render(req, res, await loadOverview().catch(() => ({})), { error: error?.message || "Sincronizarea plăților a eșuat." });
    }
  });
}
