import {
  defaultStripeReconciliationFilters,
  ensureStripeReconciliationSchema,
  formatMinorAmount,
  importStripeReconciliation,
  loadStripeReconciliationCsvRows,
  loadStripeReconciliationDashboard,
  startStripeReconciliationScheduler
} from "../lib/stripe-reconciliation.js";
import { renderNexoraStripeReconciliationPage } from "../src/ui/nexora-stripe-reconciliation-page.js";

function safeText(value = "") {
  return String(value ?? "").trim();
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function queryFromFilters(filters = {}) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.brand && filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.sourceKey && filters.sourceKey !== "all") params.set("source", filters.sourceKey);
  if (Number(filters.companyId || 0)) params.set("company_id", String(filters.companyId));
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function filtersFromBody(body = {}) {
  return defaultStripeReconciliationFilters({
    date_from: body.date_from,
    date_to: body.date_to,
    brand: body.brand,
    source: body.source,
    company_id: body.company_id,
    q: body.q
  });
}

export function registerStripeReconciliationRoutes(app, { db, requireAuth, requireSuperAdmin }) {
  ensureStripeReconciliationSchema(db);
  startStripeReconciliationScheduler(db);

  app.get("/nexora/super-admin/stripe-reconciliation", requireAuth, requireSuperAdmin, (req, res) => {
    const filters = defaultStripeReconciliationFilters(req.query || {});
    const dashboard = loadStripeReconciliationDashboard(db, filters);
    return res.type("html").send(renderNexoraStripeReconciliationPage({
      ...dashboard,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err),
      imported: safeText(req.query?.imported),
      payoutsImported: safeText(req.query?.payouts),
      runIds: safeText(req.query?.runs)
    }));
  });

  app.post("/nexora/super-admin/stripe-reconciliation/import", requireAuth, requireSuperAdmin, async (req, res) => {
    const filters = filtersFromBody(req.body || {});
    try {
      const result = await importStripeReconciliation(db, {
        sourceKey: filters.sourceKey,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        triggerSource: "manual",
        requestedByEmail: safeText(req.session?.user?.email)
      });
      const query = new URLSearchParams(queryFromFilters(filters).replace(/^\?/, ""));
      query.set("ok", result.errors?.length ? "partial" : "imported");
      query.set("imported", String(result.importedTransactions || 0));
      query.set("payouts", String(result.importedPayouts || 0));
      query.set("runs", (result.runs || []).join(","));
      return res.redirect(`/nexora/super-admin/stripe-reconciliation?${query.toString()}`);
    } catch (error) {
      console.error("[STRIPE-RECONCILIATION] manual import failed:", error?.message || error);
      const query = new URLSearchParams(queryFromFilters(filters).replace(/^\?/, ""));
      query.set("err", safeText(error?.message || "import_failed").slice(0, 120));
      return res.redirect(`/nexora/super-admin/stripe-reconciliation?${query.toString()}`);
    }
  });

  app.get("/nexora/super-admin/stripe-reconciliation/export.csv", requireAuth, requireSuperAdmin, (req, res) => {
    const filters = defaultStripeReconciliationFilters(req.query || {});
    const rows = loadStripeReconciliationCsvRows(db, filters);
    const header = [
      "brand",
      "company",
      "factura_nr",
      "factura_id",
      "stripe_created_at",
      "customer_name",
      "customer_email",
      "currency",
      "suma_incasata",
      "comision_stripe",
      "suma_neta_stripe",
      "payout_id",
      "payout_arrival_date",
      "payout_status",
      "stripe_balance_transaction_id",
      "stripe_charge_id",
      "stripe_payment_intent_id",
      "stripe_invoice_id",
      "reconciliation_status"
    ];
    const csv = [
      header.map(csvEscape).join(","),
      ...rows.map((row) => [
        row.brand,
        row.company_name,
        row.factura_nr,
        row.factura_id,
        row.stripe_created_at,
        row.customer_name,
        row.customer_email,
        String(row.currency || "").toUpperCase(),
        formatMinorAmount(row.gross_amount_minor),
        formatMinorAmount(row.stripe_fee_amount_minor),
        formatMinorAmount(row.net_amount_minor),
        row.stripe_payout_id,
        row.payout_arrival_date,
        row.payout_status,
        row.stripe_balance_transaction_id,
        row.stripe_charge_id,
        row.stripe_payment_intent_id,
        row.stripe_invoice_id,
        row.reconciliation_status
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="stripe-reconciliere-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  });
}
