import { renderErpSidebar } from "./erp-sidebar.js";
import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const DASHBOARD_KPI_OPTIONS = [
  { key: "revenue", label: "Venit contractat", description: "Suma contractelor active.", color: "purple" },
  { key: "clients", label: "Clienți", description: "Portofoliul de clienți.", color: "green" },
  { key: "contracts", label: "Contracte", description: "Numărul total de contracte.", color: "blue" },
  { key: "invoices", label: "Facturi deschise", description: "Facturi ce necesită urmărire.", color: "blue" },
  { key: "quotes", label: "Oferte active", description: "Pipeline comercial.", color: "orange" },
  { key: "tasks", label: "Task-uri deschise", description: "Activități de verificat.", color: "red" }
];

const DASHBOARD_PANEL_OPTIONS = [
  { key: "chart", label: "Privire generală business", description: "Graficul sintetic din dashboard." },
  { key: "activities", label: "Activități recente", description: "Primele task-uri și activități deschise." },
  { key: "invoices", label: "Facturi recente", description: "Ultimele 3 facturi." },
  { key: "actions", label: "Acțiuni rapide + e-Factura", description: "Scurtături și status ANAF compact." }
];

const DASHBOARD_SHORTCUT_OPTIONS = [
  { key: "invoice_new", label: "Factură nouă", href: "/nexora/facturi/new" },
  { key: "quote_new", label: "Ofertă nouă", href: "/nexora/quotes" },
  { key: "client_new", label: "Client nou", href: "/nexora/clients/new" },
  { key: "product_new", label: "Produs nou", href: "/nexora/products" },
  { key: "employee_new", label: "Angajat nou", href: "/nexora/employees" },
  { key: "projects", label: "Proiecte", href: "/nexora/projects" },
  { key: "documents", label: "Documente", href: "/nexora/documents" },
  { key: "reports", label: "Dashboard BI", href: "/nexora/reports" }
];

const DEFAULT_DASHBOARD_CONFIG = {
  kpis: ["revenue", "clients", "invoices", "quotes", "tasks"],
  panels: ["chart", "activities", "invoices", "actions"],
  shortcuts: ["invoice_new", "quote_new", "client_new", "product_new", "employee_new", "reports"]
};

function normalizeList(values = [], allowed = [], fallback = []) {
  const allowedSet = new Set(allowed.map((item) => item.key));
  const result = [];
  const source = Array.isArray(values) ? values : [];
  for (const value of source) {
    const normalized = String(value || "").trim();
    if (!allowedSet.has(normalized) || result.includes(normalized)) continue;
    result.push(normalized);
  }
  return result.length ? result : [...fallback];
}

function normalizeDashboardConfig(config = {}) {
  return {
    kpis: normalizeList(config.kpis, DASHBOARD_KPI_OPTIONS, DEFAULT_DASHBOARD_CONFIG.kpis),
    panels: normalizeList(config.panels, DASHBOARD_PANEL_OPTIONS, DEFAULT_DASHBOARD_CONFIG.panels),
    shortcuts: normalizeList(config.shortcuts, DASHBOARD_SHORTCUT_OPTIONS, DEFAULT_DASHBOARD_CONFIG.shortcuts)
  };
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
  const dashboardConfig = normalizeDashboardConfig(options.dashboardConfig || {});
  const selectedKpis = new Set(dashboardConfig.kpis);
  const selectedPanels = new Set(dashboardConfig.panels);
  const selectedShortcuts = new Set(dashboardConfig.shortcuts);

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

  const kpiCards = [
    {
      key: "revenue",
      icon: "↗",
      color: "purple",
      label: "Venit contractat",
      value: metrics.totalRevenue,
      trendClass: "up",
      trend: "Date reale din contracte"
    },
    {
      key: "clients",
      icon: "◉",
      color: "green",
      label: "Clienți",
      value: metrics.totalClients,
      trendClass: "up",
      trend: "Portofoliu activ"
    },
    {
      key: "contracts",
      icon: "▥",
      color: "blue",
      label: "Contracte",
      value: metrics.totalContracts,
      trendClass: "up",
      trend: "Documente comerciale"
    },
    {
      key: "invoices",
      icon: "▣",
      color: "blue",
      label: "Facturi deschise",
      value: metrics.totalInvoicesOpen,
      trendClass: "warn",
      trend: "Necesită urmărire"
    },
    {
      key: "quotes",
      icon: "▤",
      color: "orange",
      label: "Oferte active",
      value: metrics.totalQuotesOpen,
      trendClass: "up",
      trend: "Pipeline vânzări"
    },
    {
      key: "tasks",
      icon: "!",
      color: "red",
      label: "Task-uri deschise",
      value: metrics.openTasks,
      trendClass: "down",
      trend: "De verificat azi"
    }
  ].filter((card) => selectedKpis.has(card.key));

  const kpiGridHtml = kpiCards.length ? `
      <section class="nx-kpi-grid">
        ${kpiCards.map((card) => `
          <div class="nx-kpi-card">
            <div class="nx-kpi-icon ${escapeHtml(card.color)}">${escapeHtml(card.icon)}</div>
            <div>
              <div class="nx-kpi-label">${escapeHtml(card.label)}</div>
              <div class="nx-kpi-value">${escapeHtml(card.value)}</div>
              <div class="nx-kpi-trend ${escapeHtml(card.trendClass)}">${escapeHtml(card.trend)}</div>
            </div>
          </div>
        `).join("")}
      </section>
    ` : "";

  const shortcutLinks = DASHBOARD_SHORTCUT_OPTIONS.filter((shortcut) => selectedShortcuts.has(shortcut.key));
  const shortcutsHtml = shortcutLinks.length
    ? shortcutLinks.map((shortcut) => `<a href="${escapeHtml(shortcut.href)}">${escapeHtml(shortcut.label)}</a>`).join("")
    : `<span>Nu ai scurtături selectate</span>`;

  const panelBlocks = [
    selectedPanels.has("chart") ? `
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
      ` : "",
    selectedPanels.has("activities") ? `
        <div class="nx-panel nx-dashboard-activity-panel">
          <div class="nx-panel-head">
            <h2>Activități recente</h2>
            <span>Live</span>
          </div>
          <div class="nx-activity-list">
            ${activitiesHtml}
          </div>
        </div>
      ` : "",
    selectedPanels.has("invoices") ? `
        <div class="nx-panel nx-dashboard-invoices-panel">
          <div class="nx-panel-head">
            <h2>Facturi recente</h2>
            <span>Ultimele 3</span>
          </div>
          <div class="nx-invoice-list">
            ${recentInvoicesHtml}
          </div>
        </div>
      ` : "",
    selectedPanels.has("actions") ? `
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
            ${shortcutsHtml}
          </div>
        </div>
      ` : ""
  ].filter(Boolean).join("");

  const dashboardGridHtml = panelBlocks
    ? `<section class="nx-dashboard-grid">${panelBlocks}</section>`
    : `<section class="nx-content-card"><div class="nx-empty-state">Nu ai selectat niciun panou pentru dashboard. Deschide setările și alege ce vrei să vezi.</div></section>`;

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
          <a class="nx-btn" href="/nexora-dashboard/settings">Setări dashboard</a>
          <a class="nx-btn" href="/nexora/facturi">Facturi</a>
          <a class="nx-btn primary" href="/nexora/clients/new">Client nou</a>
          <form method="post" action="/logout" class="nx-logout-form">
            <button class="nx-btn nx-logout-btn" type="submit">Logout</button>
          </form>
        </div>
      </header>

      ${kpiGridHtml}
      ${dashboardGridHtml}
    </main>
  </div>
</body>
</html>`;
}

function checkboxList(name, options = [], selected = []) {
  const selectedSet = new Set(selected.map(String));
  return options.map((option) => `
    <label class="nx-dashboard-config-option">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(option.key)}" ${selectedSet.has(option.key) ? "checked" : ""}>
      <span>
        <b>${escapeHtml(option.label)}</b>
        ${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}
      </span>
    </label>
  `).join("");
}

function renderNexoraDashboardSettingsPage(options = {}) {
  const user = options.user || {};
  const config = normalizeDashboardConfig(options.dashboardConfig || {});
  const saved = options.saved || "";
  const body = `
    ${saved === "1" ? `<section class="nx-content-card nx-dashboard-config-flash">Setările dashboardului au fost salvate.</section>` : ""}
    <form method="post" action="/nexora-dashboard/settings" class="nx-dashboard-config-form">
      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>Setări dashboard</h1>
            <p>Alege ce vezi pe prima pagină. Configurația este salvată doar pentru utilizatorul tău.</p>
          </div>
          <div class="nx-actions">
            <button class="nx-btn primary" type="submit">Salvează</button>
            <button class="nx-btn" type="submit" formaction="/nexora-dashboard/settings/reset">Resetează</button>
          </div>
        </div>
      </section>

      <div class="nx-dashboard-config-grid">
        <section class="nx-panel">
          <div class="nx-panel-head"><h2>KPI-uri</h2><span>Carduri sus</span></div>
          <div class="nx-dashboard-config-list">${checkboxList("kpis", DASHBOARD_KPI_OPTIONS, config.kpis)}</div>
        </section>

        <section class="nx-panel">
          <div class="nx-panel-head"><h2>Panouri</h2><span>Blocuri principale</span></div>
          <div class="nx-dashboard-config-list">${checkboxList("panels", DASHBOARD_PANEL_OPTIONS, config.panels)}</div>
        </section>

        <section class="nx-panel nx-dashboard-config-wide">
          <div class="nx-panel-head"><h2>Scurtături rapide</h2><span>Linkuri în dashboard</span></div>
          <div class="nx-dashboard-config-list nx-dashboard-config-list-compact">${checkboxList("shortcuts", DASHBOARD_SHORTCUT_OPTIONS, config.shortcuts)}</div>
        </section>
      </div>
    </form>
  `;

  return renderNexoraShell({
    title: "Setări dashboard",
    appName: "Nexora ERP",
    companyName: user.company_name || "Workspace",
    user,
    currentPath: "/nexora-dashboard",
    eyebrow: "Dashboard",
    pageTitle: "Setări dashboard",
    actionsHtml: `<a class="nx-btn" href="/nexora-dashboard">Înapoi la dashboard</a>`,
    body
  });
}

export {
  DASHBOARD_KPI_OPTIONS,
  DASHBOARD_PANEL_OPTIONS,
  DASHBOARD_SHORTCUT_OPTIONS,
  DEFAULT_DASHBOARD_CONFIG,
  normalizeDashboardConfig,
  renderNexoraDashboardPage,
  renderNexoraDashboardSettingsPage
};
