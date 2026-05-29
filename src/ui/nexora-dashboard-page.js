import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNexoraDashboardPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || options.companyName || "Workspace";
  const userName = user.name || user.email || "utilizator";

  const metrics = {
    totalRevenue: options.totalRevenue || "0 RON",
    totalClients: options.totalClients || 0,
    totalQuotesOpen: options.totalQuotesOpen || 0,
    totalContracts: options.totalContracts || 0,
    totalInvoicesOpen: options.totalInvoicesOpen || 0,
    openTasks: options.openTasks || 0
  };

  const activities = Array.isArray(options.activities) ? options.activities : [];
  const visibleActivities = activities.slice(0, 3);
  const recentInvoices = Array.isArray(options.recentInvoices) ? options.recentInvoices : [];
  const efacturaSummary = options.efacturaSummary || {
    total: 0,
    responseAvailable: 0,
    missingStatus: 0
  };

  const sidebar = renderErpSidebar({
    currentPath: "/nexora-dashboard",
    appName: "Nexora ERP",
    companyName,
    isSuperAdmin: Number(user.is_super_admin || 0) === 1,
    isCompanyAdmin: Number(user.is_company_admin || 0) === 1
  });

  const activitiesHtml = visibleActivities.length
    ? visibleActivities.map((item) => `
        <div class="nx-activity">
          <b>${escapeHtml(item.title)}</b>
          <span>${escapeHtml(item.subtitle || "")}</span>
        </div>
      `).join("")
    : `
      <div class="nx-activity">
        <b>Nu există activități recente</b>
        <span>Activitățile vor apărea aici pe măsură ce lucrezi în ERP.</span>
      </div>
    `;

  const recentInvoicesHtml = recentInvoices.length
    ? recentInvoices.map((invoice) => `
        <a class="nx-invoice-row" href="/nexora/facturi/${escapeHtml(invoice.id)}">
          <div class="nx-invoice-main">
            <span class="nx-invoice-number">${escapeHtml(invoice.display_number || invoice.factura_nr || "-")}</span>
            <b>${escapeHtml(invoice.client_name || "Client necunoscut")}</b>
            <small>${escapeHtml(invoice.data_emitere ? `Emisă la ${String(invoice.data_emitere).slice(0, 10)}` : "Dată emitere necompletată")}</small>
          </div>
          <strong class="nx-invoice-total">${escapeHtml(invoice.total_formatted || invoice.total || "0.00 RON")}</strong>
        </a>
      `).join("")
    : `
      <div class="nx-empty-state">
        Nu există facturi recente.
      </div>
    `;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP Dashboard</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main nx-dashboard-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Dashboard</div>
          <div class="nx-page-title">Bună ziua, ${escapeHtml(userName)}</div>
        </div>

        <form class="nx-search" method="get" action="/nexora/search">
          <input name="q" aria-label="Caută în ERP" placeholder="Caută în ERP..." />
        </form>

        <div class="nx-actions">
          <a class="nx-btn" href="/nexora/facturi">Facturi</a>
          <a class="nx-btn primary" href="/nexora/clients/new">Client nou</a>
          <form method="post" action="/logout" class="nx-logout-form">
            <button class="nx-btn nx-logout-btn" type="submit">Logout</button>
          </form>
        </div>
      </header>

      <section class="nx-kpi-grid">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon purple">↗</div>
          <div>
            <div class="nx-kpi-label">Venit contractat</div>
            <div class="nx-kpi-value">${escapeHtml(metrics.totalRevenue)}</div>
            <div class="nx-kpi-trend up">Date reale din contracte</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">◉</div>
          <div>
            <div class="nx-kpi-label">Clienți</div>
            <div class="nx-kpi-value">${escapeHtml(metrics.totalClients)}</div>
            <div class="nx-kpi-trend up">Portofoliu activ</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">▣</div>
          <div>
            <div class="nx-kpi-label">Facturi deschise</div>
            <div class="nx-kpi-value">${escapeHtml(metrics.totalInvoicesOpen)}</div>
            <div class="nx-kpi-trend warn">Necesită urmărire</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon orange">▤</div>
          <div>
            <div class="nx-kpi-label">Oferte active</div>
            <div class="nx-kpi-value">${escapeHtml(metrics.totalQuotesOpen)}</div>
            <div class="nx-kpi-trend up">Pipeline vânzări</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon red">!</div>
          <div>
            <div class="nx-kpi-label">Task-uri deschise</div>
            <div class="nx-kpi-value">${escapeHtml(metrics.openTasks)}</div>
            <div class="nx-kpi-trend down">De verificat azi</div>
          </div>
        </div>
      </section>

      <section class="nx-dashboard-grid">
        <div class="nx-panel large nx-dashboard-chart-panel">
          <div class="nx-panel-head">
            <h2>Privire generală business</h2>
            <span>Date live</span>
          </div>
          <div class="nx-chart-line">
            <div class="nx-chart-grid"></div>
            <svg viewBox="0 0 600 220" preserveAspectRatio="none">
              <polyline points="0,180 120,145 240,118 360,92 480,58 600,28" fill="none" stroke="currentColor" stroke-width="5" />
              <circle cx="0" cy="180" r="7"></circle>
              <circle cx="120" cy="145" r="7"></circle>
              <circle cx="240" cy="118" r="7"></circle>
              <circle cx="360" cy="92" r="7"></circle>
              <circle cx="480" cy="58" r="7"></circle>
              <circle cx="600" cy="28" r="7"></circle>
            </svg>
          </div>
        </div>

        <div class="nx-panel nx-dashboard-activity-panel">
          <div class="nx-panel-head">
            <h2>Activități recente</h2>
            <span>Live</span>
          </div>

          <div class="nx-activity-list">
            ${activitiesHtml}
          </div>
        </div>

        <div class="nx-panel nx-dashboard-invoices-panel">
          <div class="nx-panel-head">
            <h2>Facturi recente</h2>
            <span>Ultimele 3</span>
          </div>

          <div class="nx-invoice-list">
            ${recentInvoicesHtml}
          </div>
        </div>

        <div class="nx-panel nx-dashboard-tools-panel">
          <div class="nx-panel-head">
            <h2>Acțiuni rapide</h2>
            <span>Status + comenzi</span>
          </div>

          <div class="nx-anaf-compact">
            <a class="nx-anaf-mini" href="/nexora/anaf/outbox"><span>Total</span><strong>${escapeHtml(efacturaSummary.total)}</strong></a>
            <a class="nx-anaf-mini success" href="/nexora/anaf/outbox"><span>Răspuns</span><strong>${escapeHtml(efacturaSummary.responseAvailable)}</strong></a>
            <a class="nx-anaf-mini warn" href="/nexora/anaf/outbox"><span>Fără status</span><strong>${escapeHtml(efacturaSummary.missingStatus)}</strong></a>
          </div>

          <div class="nx-shortcuts">
            <a href="/nexora/facturi/new">Factură nouă</a>
            <a href="/nexora/quotes">Ofertă nouă</a>
            <a href="/nexora/clients/new">Client nou</a>
            <a href="/nexora/products">Produs nou</a>
            <a href="/nexora/employees">Angajat nou</a>
            <a href="/nexora/reports">Dashboard BI</a>
          </div>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraDashboardPage
};
