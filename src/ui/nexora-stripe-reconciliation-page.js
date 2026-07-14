import { renderNexoraShell } from "./nexora-shell.js";
import { formatMinorAmount } from "../../lib/stripe-reconciliation.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyMinor(value = 0, currency = "RON") {
  return `${formatMinorAmount(value)} ${String(currency || "RON").toUpperCase()}`;
}

function moneyList(rows = [], amountKey = "gross_amount_minor") {
  if (!rows.length) return "0.00";
  return rows
    .map((row) => moneyMinor(row[amountKey], row.currency))
    .join(" / ");
}

function statusBadge(status = "") {
  const normalized = String(status || "de_verificat").trim().toLowerCase();
  const tone = normalized === "reconciliat" || normalized === "paid" || normalized === "completed"
    ? "success"
    : normalized.includes("fara") || normalized.includes("diferita") || normalized === "failed"
      ? "danger"
      : normalized === "pending" || normalized === "in_transit"
        ? "warn"
        : "neutral";
  return `<span class="nx-status-pill ${tone}">${escapeHtml(normalized || "-")}</span>`;
}

function renderKpis(items = []) {
  const colors = ["blue", "green", "orange", "purple", "red"];
  return `
    <section class="nx-kpi-grid invoice-kpis">
      ${items.map((item, index) => `
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon ${colors[index % colors.length]}">${escapeHtml(item.icon || "")}</div>
          <div>
            <div class="nx-kpi-label">${escapeHtml(item.label || "")}</div>
            <div class="nx-kpi-value">${escapeHtml(item.value ?? "-")}</div>
            ${item.hint ? `<div class="nx-kpi-trend ${escapeHtml(item.trend || "")}">${escapeHtml(item.hint)}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </section>
  `;
}

function sourceOptionLabel(source = {}) {
  if (source.available) return source.label || source.key;
  if (source.unavailableReason === "covered_by_platform") return `${source.label || source.key} - inclusă în Trevoro/Nexora`;
  if (source.unavailableReason === "live_blocked") return `${source.label || source.key} - live blocat`;
  return `${source.label || source.key} - neconfigurată`;
}

function alertHtml(ok = "", err = "", imported = "", payouts = "", runIds = "") {
  if (err) {
    const messages = {
      stripe_not_configured: "Stripe nu este configurat pentru import.",
      import_failed: "Importul Stripe nu a putut fi finalizat."
    };
    return `<div class="nx-alert danger">${escapeHtml(messages[err] || err)}</div>`;
  }
  if (ok === "imported" || ok === "partial") {
    const tone = ok === "partial" ? "warn" : "success";
    const text = ok === "partial"
      ? "Import parțial finalizat."
      : "Import Stripe finalizat.";
    return `<div class="nx-alert ${tone}">${escapeHtml(text)} Tranzacții: ${escapeHtml(imported || "0")} · Payout-uri: ${escapeHtml(payouts || "0")}${runIds ? ` · Rulări: ${escapeHtml(runIds)}` : ""}</div>`;
  }
  return "";
}

function queryString(filters = {}) {
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

function renderNexoraStripeReconciliationPage(options = {}) {
  const filters = options.filters || {};
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const payouts = Array.isArray(options.payouts) ? options.payouts : [];
  const runs = Array.isArray(options.runs) ? options.runs : [];
  const companies = Array.isArray(options.companies) ? options.companies : [];
  const sources = Array.isArray(options.sources) ? options.sources : [];
  const stats = options.stats || {};
  const exportHref = `/nexora/super-admin/stripe-reconciliation/export.csv${queryString(filters)}`;

  const sourceOptions = [
    `<option value="all" ${filters.sourceKey === "all" ? "selected" : ""}>Toate sursele Stripe</option>`,
    ...sources.map((source) => `
      <option value="${escapeHtml(source.key === "emarqet_shared" ? "all" : source.key)}" ${filters.sourceKey === source.key ? "selected" : ""} ${source.available || source.unavailableReason === "covered_by_platform" ? "" : "disabled"}>
        ${escapeHtml(sourceOptionLabel(source))}
      </option>
    `)
  ].join("");

  const transactionRows = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.brand || "unknown")}</b><div class="nx-table-sub">${escapeHtml(row.stripe_source_label || row.stripe_source_key || "")}</div></td>
      <td>${escapeHtml(row.company_name || "Nepotrivit")}<div class="nx-table-sub">${escapeHtml(row.customer_email || row.customer_name || "")}</div></td>
      <td>${row.factura_id ? `<a class="nx-table-main-link" href="/nexora/facturi/${escapeHtml(row.factura_id)}">${escapeHtml(row.factura_nr || `Factura #${row.factura_id}`)}</a>` : `<span class="nx-table-sub">fără factură</span>`}</td>
      <td>${escapeHtml(row.stripe_created_at || row.imported_at || "-")}<div class="nx-table-sub">${escapeHtml(row.type || row.reporting_category || "")}</div></td>
      <td>${escapeHtml(moneyMinor(row.gross_amount_minor, row.currency))}</td>
      <td>${escapeHtml(moneyMinor(row.stripe_fee_amount_minor, row.currency))}</td>
      <td>${escapeHtml(moneyMinor(row.net_amount_minor, row.currency))}</td>
      <td>${row.stripe_payout_id ? `<b>${escapeHtml(row.stripe_payout_id)}</b><div class="nx-table-sub">${escapeHtml(row.payout_arrival_date || "fără dată virare")}</div>` : `<span class="nx-table-sub">nevirat / pending</span>`}</td>
      <td>${statusBadge(row.reconciliation_status)}</td>
    </tr>
  `).join("");

  const payoutRows = payouts.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.stripe_payout_id || "-")}</b><div class="nx-table-sub">${escapeHtml(row.stripe_source_label || row.stripe_source_key || "")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(moneyMinor(row.amount_minor, row.currency))}</td>
      <td>${escapeHtml(row.arrival_date || "-")}</td>
      <td>${escapeHtml(row.transaction_count || 0)}</td>
      <td>${escapeHtml(moneyMinor(row.reconciled_net_minor, row.currency))}</td>
    </tr>
  `).join("");

  const runRows = runs.map((run) => `
    <tr>
      <td>${escapeHtml(run.id)}</td>
      <td>${escapeHtml(run.source_label || run.source_key || "-")}</td>
      <td>${statusBadge(run.status)}</td>
      <td>${escapeHtml(run.date_from || "-")} → ${escapeHtml(run.date_to || "-")}</td>
      <td>${escapeHtml(run.imported_transactions || 0)} / ${escapeHtml(run.imported_payouts || 0)}</td>
      <td>${escapeHtml(run.finished_at || run.started_at || "-")}</td>
    </tr>
  `).join("");

  const body = `
    ${alertHtml(options.ok, options.err, options.imported, options.payoutsImported, options.runIds)}

    ${renderKpis([
      { icon: "TX", label: "Tranzacții Stripe", value: stats.transactionCount || 0, hint: `${stats.matchedCount || 0} cu factură`, trend: "up" },
      { icon: "GR", label: "Încasat brut", value: moneyList(stats.totalsByCurrency || [], "gross_amount_minor") },
      { icon: "SF", label: "Comision Stripe", value: moneyList(stats.totalsByCurrency || [], "stripe_fee_amount_minor"), trend: "warn" },
      { icon: "NET", label: "Net Stripe", value: moneyList(stats.totalsByCurrency || [], "net_amount_minor") },
      { icon: "BNK", label: "Payout bancă", value: moneyList(stats.payoutTotalsByCurrency || [], "amount_minor"), hint: `${stats.payoutCount || 0} payout-uri` }
    ])}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Reconciliere Stripe</h1>
          <p>Plăți, comisioane Stripe, facturi și payout-uri bancare pentru Trevoro și e-Marqet.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/super-admin/payments">Plăți platformă</a>
          <a class="nx-btn primary" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre raport</h2><span>${escapeHtml(rows.length)} tranzacții afișate</span></div></div>
        <form method="get" action="/nexora/super-admin/stripe-reconciliation" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>De la</span><input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}"></label>
            <label class="nx-field"><span>Până la</span><input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Brand</span><select name="brand">${["all", "trevoro", "emarqet", "nexora", "unknown"].map((brand) => `<option value="${brand}" ${filters.brand === brand ? "selected" : ""}>${brand}</option>`).join("")}</select></label>
            <label class="nx-field"><span>Sursă Stripe</span><select name="source">${sourceOptions}</select></label>
          </div>
          <label class="nx-field"><span>Companie</span><select name="company_id"><option value="0">Toate companiile</option>${companies.map((company) => `<option value="${escapeHtml(company.id)}" ${Number(filters.companyId || 0) === Number(company.id) ? "selected" : ""}>${escapeHtml(company.name || "")}</option>`).join("")}</select></label>
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="factură, client, email, charge, payout"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Aplică</button>
            <a class="nx-btn" href="/nexora/super-admin/stripe-reconciliation">Reset</a>
          </div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Import Stripe</h2><span>plăți + payout-uri</span></div></div>
        <form method="post" action="/nexora/super-admin/stripe-reconciliation/import" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>De la</span><input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}"></label>
            <label class="nx-field"><span>Până la</span><input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}"></label>
          </div>
          <label class="nx-field"><span>Sursă Stripe</span><select name="source">${sourceOptions}</select></label>
          <input type="hidden" name="brand" value="${escapeHtml(filters.brand || "all")}">
          <input type="hidden" name="company_id" value="${escapeHtml(filters.companyId || 0)}">
          <input type="hidden" name="q" value="${escapeHtml(filters.q || "")}">
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Importă acum</button>
          </div>
        </form>

        <div class="nx-table-wrap" style="margin-top:16px">
          <table class="nx-table">
            <thead><tr><th>ID</th><th>Sursă</th><th>Status</th><th>Interval</th><th>Tx / payout</th><th>Finalizat</th></tr></thead>
            <tbody>${runRows || `<tr><td colspan="6"><div class="nx-empty-state">Nu există rulări de import.</div></td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Tranzacții reconciliere</h1><p>Raport contabil: factură, sumă încasată, comision Stripe și net virat către bancă.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Brand</th><th>Companie / client</th><th>Factură</th><th>Data Stripe</th><th>Încasat</th><th>Comision</th><th>Net</th><th>Payout</th><th>Status</th></tr></thead>
          <tbody>${transactionRows || `<tr><td colspan="9"><div class="nx-empty-state">Nu există tranzacții pentru filtrele curente.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Payout-uri Stripe</h1><p>Sumele virate de Stripe în bancă și tranzacțiile incluse în fiecare payout.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Payout</th><th>Status</th><th>Virat bancă</th><th>Data virării</th><th>Tranzacții</th><th>Net reconciliat</th></tr></thead>
          <tbody>${payoutRows || `<tr><td colspan="6"><div class="nx-empty-state">Nu există payout-uri pentru filtrele curente.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Reconciliere Stripe",
    appName: "Nexora ERP",
    companyName: "Platform Admin",
    currentPath: "/nexora/super-admin/stripe-reconciliation",
    eyebrow: "Super admin",
    pageTitle: "Reconciliere Stripe",
    isSuperAdmin: true,
    body
  });
}

export {
  renderNexoraStripeReconciliationPage
};
