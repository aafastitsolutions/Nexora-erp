import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateValue(value = "") {
  return String(value || "").slice(0, 10);
}

function money(value, currency = "RON") {
  return `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "GENERAT", "OK", "UP", "PESTE_TINTA"].includes(normalized)) return "success";
  if (["DRAFT", "PLANIFICAT", "STABIL", "SUB_TINTA"].includes(normalized)) return "warn";
  if (["BLOCAT", "EROARE", "DOWN", "ANULAT"].includes(normalized)) return "danger";
  return "neutral";
}

function statusBadge(value = "") {
  const label = String(value || "-").toLowerCase().replaceAll("_", " ");
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(label)}</span>`;
}

function rowsOrEmpty(rows = [], colspan = 6, mapper = () => "", empty = "Nu există înregistrări.") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="${escapeHtml(colspan)}"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

const TABS = [
  ["Dashboard BI", "/nexora/reports"],
  ["Dashboard-uri", "/nexora/reports/dashboards"],
  ["KPI", "/nexora/reports/kpi"],
  ["Rapoarte", "/nexora/reports/saved"],
  ["Export Excel/PDF", "/nexora/reports/exports"],
  ["Analytics", "/nexora/reports/analytics"]
];

function tabs(activePath = "/nexora/reports") {
  return `<nav class="nx-module-tabs">${TABS.map(([label, href]) => `
    <a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>
  `).join("")}</nav>`;
}

function shell({ title, activePath, companyName, user, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath: activePath,
    eyebrow: "Rapoarte & BI (Business Intelligence)",
    pageTitle: title,
    body: `${tabs(activePath)}${body}`
  });
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    status: "Statusul a fost actualizat.",
    export: "Exportul a fost generat."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    invalid: "Datele trimise nu sunt valide.",
    missing: "Înregistrarea nu a fost găsită.",
    export: "Exportul nu a putut fi generat."
  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function reportTypeOptions(selectedType = "") {
  const options = [
    ["VANZARI", "Vânzări"],
    ["FACTURI", "Facturi"],
    ["STOCURI", "Stocuri"],
    ["CLIENTI", "Clienți"],
    ["PROIECTE", "Proiecte"],
    ["ACHIZITII", "Achiziții"],
    ["SUPPLY_CHAIN", "Supply Chain"]
  ];
  return options.map(([value, label]) => `<option value="${value}" ${String(selectedType).toUpperCase() === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function reportOptions(reports = [], selectedId = "") {
  return [
    `<option value="">Alege raport</option>`,
    ...reports.map((report) => `<option value="${escapeHtml(report.id)}" ${String(report.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(report.report_number || "-")} · ${escapeHtml(report.name || "-")}</option>`)
  ].join("");
}

function dynamicTable(columns = [], rows = [], empty = "Nu există date.") {
  if (!columns.length) return `<div class="nx-empty-state">${escapeHtml(empty)}</div>`;
  const head = columns.map((column) => `<th class="${column.right ? "nx-right" : ""}">${escapeHtml(column.label || column.key || "")}</th>`).join("");
  const body = rowsOrEmpty(rows, columns.length, (row) => `
    <tr>
      ${columns.map((column) => {
        const value = column.html ? column.html(row) : row[column.key];
        return `<td class="${column.right ? "nx-right" : ""}">${column.raw ? value : escapeHtml(value ?? "")}</td>`;
      }).join("")}
    </tr>
  `, empty);
  return `<div class="nx-table-wrap"><table class="nx-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderNexoraReportsHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const reports = Array.isArray(options.reports) ? options.reports : [];
  const exports = Array.isArray(options.exports) ? options.exports : [];
  const reportRows = rowsOrEmpty(reports, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.report_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.report_type || "")}</div></td>
      <td>${escapeHtml(row.name || "-")}</td>
      <td>${escapeHtml(row.source_module || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td><a class="nx-btn" href="/nexora/reports/saved?report_id=${escapeHtml(row.id)}">Deschide</a></td>
    </tr>
  `, "Nu există rapoarte salvate.");
  const exportRows = rowsOrEmpty(exports, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.export_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.file_format || "")}</div></td>
      <td>${escapeHtml(row.report_name || row.export_type || "-")}</td>
      <td class="nx-right">${escapeHtml(row.row_count || 0)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.file_path ? `<a class="nx-btn" href="/${escapeHtml(row.file_path)}">Descarcă</a>` : ""}</td>
    </tr>
  `, "Nu există exporturi.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Rapoarte & BI (Business Intelligence)</h1>
          <p>Indicatori, rapoarte salvate, exporturi și analiză operațională peste modulele Nexora.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/reports/saved">Raport nou</a>
          <a class="nx-btn" href="/nexora/reports/kpi">KPI</a>
          <a class="nx-btn" href="/nexora/reports/analytics">Analytics</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">RON</div><div><div class="nx-kpi-label">Venit facturi</div><div class="nx-kpi-value">${escapeHtml(money(stats.invoiceRevenue || 0))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">SO</div><div><div class="nx-kpi-label">Comenzi vânzări</div><div class="nx-kpi-value">${escapeHtml(stats.salesOrders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">ST</div><div><div class="nx-kpi-label">Alerte stoc</div><div class="nx-kpi-value">${escapeHtml(stats.stockAlerts || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">KPI</div><div><div class="nx-kpi-label">KPI active</div><div class="nx-kpi-value">${escapeHtml(stats.activeKpis || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Rapoarte salvate</h1><p>Ultimele configurații de raport.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Raport</th><th>Nume</th><th>Modul</th><th>Status</th><th></th></tr></thead><tbody>${reportRows}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Exporturi recente</h1><p>Fișiere CSV și PDF generate.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Export</th><th>Raport</th><th class="nx-right">Rânduri</th><th>Status</th><th></th></tr></thead><tbody>${exportRows}</tbody></table></div>
      </section>
    </div>
  `;
  return shell({ title: "Rapoarte & BI", activePath: "/nexora/reports", companyName, user: options.user, body });
}

function renderNexoraReportDashboardsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.dashboard_number || "-")}</b></td>
      <td>${escapeHtml(row.name || "-")}</td>
      <td>${escapeHtml(row.scope || "-")}</td>
      <td>${escapeHtml(row.refresh_interval || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>${escapeHtml(row.created_by_email || "-")}</td>
      <td>
        <form method="post" action="/nexora/reports/dashboards/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="${String(row.status || "").toUpperCase() === "ACTIV" ? "BLOCAT" : "ACTIV"}">
          <button class="nx-btn" type="submit">${String(row.status || "").toUpperCase() === "ACTIV" ? "Blochează" : "Activează"}</button>
        </form>
      </td>
    </tr>
  `, "Nu există dashboard-uri BI.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Dashboard BI nou</h1><p>Configurează o vedere de management pe domeniu.</p></div></div>
      <form method="post" action="/nexora/reports/dashboards/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume</span><input name="name" required></label>
        <label class="nx-field"><span>Domeniu</span><select name="scope"><option value="GENERAL">General</option><option value="VANZARI">Vânzări</option><option value="FINANCIAR">Financiar</option><option value="STOCURI">Stocuri</option><option value="OPERATIONAL">Operațional</option></select></label>
        <label class="nx-field"><span>Refresh</span><select name="refresh_interval"><option value="MANUAL">Manual</option><option value="15_MIN">15 minute</option><option value="ORA">Orar</option><option value="ZI">Zilnic</option></select></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="DRAFT">Draft</option></select></label>
        <label class="nx-field nx-field-wide"><span>Carduri / layout</span><input name="layout_json" placeholder='ex: ["venituri","stocuri","taskuri"]'></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează dashboard</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Dashboard-uri BI</h1><p>Vederi de management și monitorizare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Nume</th><th>Domeniu</th><th>Refresh</th><th>Status</th><th>Note</th><th>Creat de</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Dashboard-uri BI", activePath: "/nexora/reports/dashboards", companyName, user: options.user, body });
}

function renderNexoraReportKpisPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.kpi_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.metric_key || "")}</div></td>
      <td>${escapeHtml(row.name || "-")}</td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td class="nx-right">${escapeHtml(row.current_value ?? 0)} ${escapeHtml(row.unit || "")}</td>
      <td class="nx-right">${escapeHtml(row.target_value ?? 0)} ${escapeHtml(row.unit || "")}</td>
      <td>${statusBadge(row.trend_direction)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/reports/kpi/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="${String(row.status || "").toUpperCase() === "ACTIV" ? "BLOCAT" : "ACTIV"}">
          <button class="nx-btn" type="submit">${String(row.status || "").toUpperCase() === "ACTIV" ? "Blochează" : "Activează"}</button>
        </form>
      </td>
    </tr>
  `, "Nu există KPI-uri.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>KPI nou</h1><p>Indicator cu valoare manuală sau calculată automat din datele ERP.</p></div></div>
      <form method="post" action="/nexora/reports/kpi/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume</span><input name="name" required></label>
        <label class="nx-field"><span>Categorie</span><select name="category"><option value="FINANCIAR">Financiar</option><option value="VANZARI">Vânzări</option><option value="STOCURI">Stocuri</option><option value="PROIECTE">Proiecte</option><option value="GENERAL">General</option></select></label>
        <label class="nx-field"><span>Metrică</span><select name="metric_key"><option value="invoice_revenue">Venit facturi</option><option value="sales_orders">Comenzi vânzări</option><option value="active_clients">Clienți activi</option><option value="stock_alerts">Alerte stoc</option><option value="open_tasks">Task-uri deschise</option><option value="manual">Manual</option></select></label>
        <label class="nx-field"><span>Valoare manuală</span><input name="current_value" value="0"></label>
        <label class="nx-field"><span>Țintă</span><input name="target_value" value="0"></label>
        <label class="nx-field"><span>UM</span><input name="unit" placeholder="RON / buc / %"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="DRAFT">Draft</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează KPI</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>KPI</h1><p>Indicatori calculați sau urmăriți manual.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Nume</th><th>Categorie</th><th class="nx-right">Curent</th><th class="nx-right">Țintă</th><th>Trend</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "KPI", activePath: "/nexora/reports/kpi", companyName, user: options.user, body });
}

function renderNexoraSavedReportsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const preview = options.preview || {};
  const selectedReport = options.selectedReport || null;
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/reports/saved?report_id=${escapeHtml(row.id)}">${escapeHtml(row.report_number || "-")}</a></td>
      <td>${escapeHtml(row.name || "-")}</td>
      <td>${escapeHtml(row.report_type || "-")}</td>
      <td>${escapeHtml(row.source_module || "-")}</td>
      <td>${escapeHtml(dateValue(row.period_start) || "-")}<div class="nx-table-sub">${escapeHtml(dateValue(row.period_end) || "")}</div></td>
      <td>${escapeHtml(row.format || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>
        <form method="post" action="/nexora/reports/exports/create">
          <input type="hidden" name="report_id" value="${escapeHtml(row.id)}">
          <select name="file_format"><option value="CSV">Excel/CSV</option><option value="PDF">PDF</option></select>
          <button class="nx-btn primary" type="submit">Export</button>
        </form>
      </td>
    </tr>
  `, "Nu există rapoarte salvate.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Raport nou</h1><p>Configurează o sursă de date și o perioadă pentru analiză.</p></div></div>
      <form method="post" action="/nexora/reports/saved/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume</span><input name="name" required></label>
        <label class="nx-field"><span>Tip raport</span><select name="report_type">${reportTypeOptions()}</select></label>
        <label class="nx-field"><span>Modul sursă</span><select name="source_module"><option value="sales">Vânzări</option><option value="finance">Financiar</option><option value="inventory">Inventar</option><option value="crm">CRM</option><option value="projects">Proiecte</option><option value="procurement">Achiziții</option><option value="scm">Supply Chain</option></select></label>
        <label class="nx-field"><span>Start</span><input name="period_start" type="date"></label>
        <label class="nx-field"><span>Final</span><input name="period_end" type="date"></label>
        <label class="nx-field"><span>Format</span><select name="format"><option value="TABLE">Tabel</option><option value="SUMMARY">Sumar</option><option value="CHART">Grafic</option></select></label>
        <label class="nx-field nx-field-wide"><span>Filtre JSON</span><input name="filters_json" placeholder='ex: {"status":"ACTIV"}'></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează raport</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Rapoarte salvate</h1><p>Rapoarte reutilizabile pentru export sau analiză.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Nume</th><th>Tip</th><th>Modul</th><th>Perioadă</th><th>Format</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Preview ${selectedReport ? escapeHtml(selectedReport.name || "") : ""}</h1><p>${selectedReport ? "Primele rezultate ale raportului selectat." : "Selectează un raport din listă pentru preview."}</p></div></div>
      ${dynamicTable(preview.columns || [], preview.rows || [], "Nu există date în preview.")}
    </section>
  `;
  return shell({ title: "Rapoarte", activePath: "/nexora/reports/saved", companyName, user: options.user, body });
}

function renderNexoraReportExportsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const reports = Array.isArray(options.reports) ? options.reports : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.export_number || "-")}</b></td>
      <td>${escapeHtml(row.report_name || row.export_type || "-")}<div class="nx-table-sub">${escapeHtml(row.report_number || "")}</div></td>
      <td>${escapeHtml(row.file_format || "-")}</td>
      <td class="nx-right">${escapeHtml(row.row_count || 0)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.requested_by_email || "-")}</td>
      <td>${escapeHtml(row.created_at || "-")}</td>
      <td>${row.file_path ? `<a class="nx-btn primary" href="/${escapeHtml(row.file_path)}">Descarcă</a>` : ""}</td>
    </tr>
  `, "Nu există exporturi.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Export nou</h1><p>Generează fișier CSV pentru Excel sau PDF.</p></div></div>
      <form method="post" action="/nexora/reports/exports/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Raport</span><select name="report_id" required>${reportOptions(reports)}</select></label>
        <label class="nx-field"><span>Format fișier</span><select name="file_format"><option value="CSV">Excel/CSV</option><option value="PDF">PDF</option></select></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Generează export</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Exporturi Excel / PDF</h1><p>Fișiere generate din rapoartele salvate.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Export</th><th>Raport</th><th>Format</th><th class="nx-right">Rânduri</th><th>Status</th><th>Utilizator</th><th>Data</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Export Excel / PDF", activePath: "/nexora/reports/exports", companyName, user: options.user, body });
}

function renderNexoraAnalyticsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const revenueRows = dynamicTable([
    { key: "month", label: "Lună" },
    { key: "total", label: "Venit", right: true, html: (row) => money(row.total || 0) }
  ], options.monthlyRevenue || [], "Nu există venituri.");
  const clientRows = dynamicTable([
    { key: "client_name", label: "Client" },
    { key: "invoice_count", label: "Facturi", right: true },
    { key: "total", label: "Total", right: true, html: (row) => money(row.total || 0) }
  ], options.topClients || [], "Nu există clienți cu facturi.");
  const stockRows = dynamicTable([
    { key: "item_name", label: "Articol" },
    { key: "quantity", label: "Cant.", right: true },
    { key: "minimum_quantity", label: "Minim", right: true },
    { key: "warehouse_name", label: "Depozit" }
  ], options.stockAlerts || [], "Nu există alerte de stoc.");
  const pipelineRows = dynamicTable([
    { key: "status", label: "Status" },
    { key: "count", label: "Oferte", right: true },
    { key: "total", label: "Total", right: true, html: (row) => money(row.total || 0) }
  ], options.pipeline || [], "Nu există pipeline.");
  const body = `
    <div class="nx-two-column-grid">
      <section class="nx-content-card"><div class="nx-section-head"><div><h1>Venit lunar</h1><p>Total facturi pe lună.</p></div></div>${revenueRows}</section>
      <section class="nx-content-card"><div class="nx-section-head"><div><h1>Top clienți</h1><p>Clienți după valoare facturată.</p></div></div>${clientRows}</section>
    </div>
    <div class="nx-two-column-grid">
      <section class="nx-content-card"><div class="nx-section-head"><div><h1>Alerte stoc</h1><p>Articole la sau sub minim.</p></div></div>${stockRows}</section>
      <section class="nx-content-card"><div class="nx-section-head"><div><h1>Pipeline oferte</h1><p>Valoare pe status ofertă.</p></div></div>${pipelineRows}</section>
    </div>
  `;
  return shell({ title: "Analytics", activePath: "/nexora/reports/analytics", companyName, user: options.user, body });
}

export {
  renderNexoraAnalyticsPage,
  renderNexoraReportDashboardsPage,
  renderNexoraReportExportsPage,
  renderNexoraReportKpisPage,
  renderNexoraReportsHubPage,
  renderNexoraSavedReportsPage
};
