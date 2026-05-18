import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} RON`;
}

function statusClass(status = "") {
  const s = String(status || "").toUpperCase();
  if (s === "PLATITA" || s === "ACHITATA") return "success";
  if (s === "ANULATA") return "danger";
  if (s === "INTARZIATA") return "danger";
  if (s === "TRIMISA") return "warn";
  return "neutral";
}

function renderNexoraInvoicesPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || "Workspace";
  const invoices = Array.isArray(options.invoices) ? options.invoices : [];
  const counters = options.counters || {};
  const showCancelled = Boolean(options.showCancelled);

  const sidebar = renderErpSidebar({
    currentPath: "/facturi",
    appName: "Nexora ERP",
    companyName
  });

  const rowsHtml = invoices.length
    ? invoices.map((invoice) => `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/nexora/facturi/${escapeHtml(invoice.id)}">
            ${escapeHtml(invoice.display_number || invoice.factura_nr || "-")}
          </a>
          <div class="nx-table-sub">${escapeHtml(invoice.client_cui || "")}</div>
        </td>
        <td>
          <b>${escapeHtml(invoice.client_name || "Client necunoscut")}</b>
        </td>
        <td>${escapeHtml(String(invoice.data_emitere || "").slice(0, 10) || "-")}</td>
        <td>${escapeHtml(money(invoice.total))}</td>
        <td><span class="nx-status-pill ${statusClass(invoice.status)}">${escapeHtml(invoice.status || "CIORNA")}</span></td>
        <td class="nx-table-actions">
          <a class="nx-btn" href="/nexora/facturi/${escapeHtml(invoice.id)}">Deschide</a>
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="6">
          <div class="nx-empty-state">${showCancelled ? "Nu există facturi anulate." : "Nu există facturi active."}</div>
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Facturi</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Financiar & Contabilitate</div>
          <div class="nx-page-title">${showCancelled ? "Facturi anulate" : "Facturi"}</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/facturi">UI vechi</a>
          <a class="nx-btn ${showCancelled ? "" : "primary"}" href="/nexora/facturi">Active</a>
          <a class="nx-btn ${showCancelled ? "primary" : ""}" href="/nexora/facturi?view=anulate">Anulate</a>
        </div>
      </header>

      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">▣</div>
          <div>
            <div class="nx-kpi-label">Total facturi</div>
            <div class="nx-kpi-value">${escapeHtml(counters.total_count || 0)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">✓</div>
          <div>
            <div class="nx-kpi-label">Active</div>
            <div class="nx-kpi-value">${escapeHtml(counters.active_count || 0)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon orange">!</div>
          <div>
            <div class="nx-kpi-label">În lucru / trimise</div>
            <div class="nx-kpi-value">${escapeHtml(counters.pending_count || 0)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon red">×</div>
          <div>
            <div class="nx-kpi-label">Anulate</div>
            <div class="nx-kpi-value">${escapeHtml(counters.cancelled_count || 0)}</div>
          </div>
        </div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>${showCancelled ? "Facturi anulate" : "Lista facturi active"}</h1>
            <p>${showCancelled ? "Facturile anulate sunt separate pentru evidență clară." : "Ultimele facturi active din sistem."}</p>
          </div>
          <div class="nx-count-pill">${escapeHtml(invoices.length)} afișate</div>
        </div>

        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead>
              <tr>
                <th>Factură</th>
                <th>Client</th>
                <th>Data emitere</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraInvoicesPage
};
