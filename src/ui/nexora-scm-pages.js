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
  if (["FINALIZAT", "LIVRAT", "CONFIRMAT", "ACTIV", "ACOPERIT"].includes(normalized)) return "success";
  if (["PLANIFICAT", "IN_LUCRU", "IN_TRANZIT", "PREGATIRE", "RISC_STOC"].includes(normalized)) return "warn";
  if (["ANULAT", "BLOCAT", "INTARZIAT", "RESPINS"].includes(normalized)) return "danger";
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
  ["Dashboard", "/nexora/supply-chain"],
  ["Logistică", "/nexora/supply-chain/logistics"],
  ["Transport", "/nexora/supply-chain/transport"],
  ["Distribuție", "/nexora/supply-chain/distribution"],
  ["Forecasting", "/nexora/supply-chain/forecasting"]
];

function tabs(activePath = "/nexora/supply-chain") {
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
    eyebrow: "Supply Chain",
    pageTitle: title,
    body: `${tabs(activePath)}${body}`
  });
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    status: "Statusul a fost actualizat."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    invalid: "Datele trimise nu sunt valide.",
    missing: "Înregistrarea nu a fost găsită."
  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function warehouseOptions(warehouses = [], selectedId = "", emptyLabel = "Fără depozit") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...warehouses.map((warehouse) => `<option value="${escapeHtml(warehouse.id)}" ${String(warehouse.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(warehouse.warehouse_code || "-")} · ${escapeHtml(warehouse.name || "-")}</option>`)
  ].join("");
}

function productOptions(products = [], selectedId = "", emptyLabel = "Alege produs") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...products.map((product) => `<option value="${escapeHtml(product.id)}" ${String(product.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim() || "-")} · ${escapeHtml(product.unit || "buc")}</option>`)
  ].join("");
}

function renderNexoraScmHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const logistics = Array.isArray(options.logistics) ? options.logistics : [];
  const transports = Array.isArray(options.transports) ? options.transports : [];
  const logisticRows = rowsOrEmpty(logistics, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.task_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.task_type || "")}</div></td>
      <td>${escapeHtml(row.product_name || row.reference_doc || "-")}</td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.planned_date) || "-")}</td>
    </tr>
  `, "Nu există activități logistice.");
  const transportRows = rowsOrEmpty(transports, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.transport_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.carrier_name || "")}</div></td>
      <td>${escapeHtml(row.origin || "-")} → ${escapeHtml(row.destination || "-")}</td>
      <td>${escapeHtml(row.vehicle_number || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.delivery_date) || "-")}</td>
    </tr>
  `, "Nu există transporturi.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Supply Chain</h1>
          <p>Planificare logistică, transport, distribuție și previziuni de cerere legate de stoc și produse.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/supply-chain/logistics">Task logistic</a>
          <a class="nx-btn" href="/nexora/supply-chain/transport">Transport</a>
          <a class="nx-btn" href="/nexora/supply-chain/forecasting">Forecast</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">L</div><div><div class="nx-kpi-label">Task-uri logistice deschise</div><div class="nx-kpi-value">${escapeHtml(stats.openLogistics || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">T</div><div><div class="nx-kpi-label">Transporturi active</div><div class="nx-kpi-value">${escapeHtml(stats.activeTransports || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">D</div><div><div class="nx-kpi-label">Distribuții planificate</div><div class="nx-kpi-value">${escapeHtml(stats.plannedDistributions || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">F</div><div><div class="nx-kpi-label">Forecast risc stoc</div><div class="nx-kpi-value">${escapeHtml(stats.riskForecasts || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Logistică recentă</h1><p>Picking, recepții, transferuri și retururi operaționale.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Produs / referință</th><th>Depozit</th><th>Status</th><th>Dată</th></tr></thead><tbody>${logisticRows}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Transporturi active</h1><p>Curse, rute, vehicule și termene de livrare.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Transport</th><th>Rută</th><th>Vehicul</th><th>Status</th><th>Livrare</th></tr></thead><tbody>${transportRows}</tbody></table></div>
      </section>
    </div>
  `;
  return shell({ title: "Supply Chain", activePath: "/nexora/supply-chain", companyName, user: options.user, body });
}

function renderNexoraScmLogisticsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const rowsHtml = rowsOrEmpty(rows, 10, (row) => `
    <tr>
      <td><b>${escapeHtml(row.task_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.reference_doc || "")}</div></td>
      <td>${escapeHtml(row.task_type || "-")}</td>
      <td>${escapeHtml(row.product_name || "-")}<div class="nx-table-sub">${escapeHtml(row.quantity || 0)} ${escapeHtml(row.unit || "buc")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td>${escapeHtml(row.source_location || "-")}<div class="nx-table-sub">${escapeHtml(row.destination_location || "")}</div></td>
      <td>${escapeHtml(dateValue(row.planned_date) || "-")}</td>
      <td>${escapeHtml(row.responsible || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/supply-chain/logistics/${escapeHtml(row.id)}/status">
          <select name="status"><option value="PLANIFICAT">Planificat</option><option value="IN_LUCRU">În lucru</option><option value="FINALIZAT">Finalizat</option><option value="ANULAT">Anulat</option></select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există task-uri logistice.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Task logistic nou</h1><p>Planifică picking, recepție, transfer, cross-dock sau retur.</p></div></div>
      <form method="post" action="/nexora/supply-chain/logistics/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Tip</span><select name="task_type"><option value="PICKING">Picking</option><option value="RECEPTIE">Recepție</option><option value="TRANSFER">Transfer</option><option value="CROSS_DOCK">Cross-dock</option><option value="RETUR">Retur</option></select></label>
        <label class="nx-field"><span>Depozit</span><select name="warehouse_id">${warehouseOptions(warehouses)}</select></label>
        <label class="nx-field"><span>Produs</span><select name="product_id">${productOptions(products, "", "Fără produs / manual")}</select></label>
        <label class="nx-field"><span>Produs manual</span><input name="product_name"></label>
        <label class="nx-field"><span>Cantitate</span><input name="quantity" value="1"></label>
        <label class="nx-field"><span>UM</span><input name="unit" value="buc"></label>
        <label class="nx-field"><span>Sursă</span><input name="source_location" placeholder="raft / zonă"></label>
        <label class="nx-field"><span>Destinație</span><input name="destination_location" placeholder="zonă / client"></label>
        <label class="nx-field"><span>Referință</span><input name="reference_doc" placeholder="comandă / aviz"></label>
        <label class="nx-field"><span>Data planificată</span><input name="planned_date" type="date"></label>
        <label class="nx-field"><span>Responsabil</span><input name="responsible"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează task</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Logistică</h1><p>Execuție operațională în depozit și între locații.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Tip</th><th>Produs</th><th>Depozit</th><th>Traseu intern</th><th>Dată</th><th>Responsabil</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Logistică", activePath: "/nexora/supply-chain/logistics", companyName, user: options.user, body });
}

function renderNexoraScmTransportPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 10, (row) => `
    <tr>
      <td><b>${escapeHtml(row.transport_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.tracking_code || "")}</div></td>
      <td>${escapeHtml(row.carrier_name || "-")}<div class="nx-table-sub">${escapeHtml(row.driver_name || "")}</div></td>
      <td>${escapeHtml(row.vehicle_number || "-")}</td>
      <td>${escapeHtml(row.origin || "-")}<div class="nx-table-sub">${escapeHtml(row.destination || "")}</div></td>
      <td>${escapeHtml(dateValue(row.pickup_date) || "-")}<div class="nx-table-sub">${escapeHtml(dateValue(row.delivery_date) || "")}</div></td>
      <td>${escapeHtml(row.client_name || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.cost || 0, row.currency || "RON"))}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/supply-chain/transport/${escapeHtml(row.id)}/status">
          <select name="status"><option value="PLANIFICAT">Planificat</option><option value="IN_TRANZIT">În tranzit</option><option value="LIVRAT">Livrat</option><option value="INTARZIAT">Întârziat</option><option value="ANULAT">Anulat</option></select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există transporturi.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Transport nou</h1><p>Planifică transportatori, rute, vehicule, costuri și tracking.</p></div></div>
      <form method="post" action="/nexora/supply-chain/transport/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Transportator</span><input name="carrier_name"></label>
        <label class="nx-field"><span>Vehicul</span><input name="vehicle_number"></label>
        <label class="nx-field"><span>Șofer</span><input name="driver_name"></label>
        <label class="nx-field"><span>Rută</span><input name="route_name"></label>
        <label class="nx-field"><span>Origine</span><input name="origin"></label>
        <label class="nx-field"><span>Destinație</span><input name="destination"></label>
        <label class="nx-field"><span>Ridicare</span><input name="pickup_date" type="date"></label>
        <label class="nx-field"><span>Livrare</span><input name="delivery_date" type="date"></label>
        <label class="nx-field"><span>Client</span><input name="client_name"></label>
        <label class="nx-field"><span>Tracking</span><input name="tracking_code"></label>
        <label class="nx-field"><span>Cost</span><input name="cost" value="0"></label>
        <label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează transport</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Transport</h1><p>Curse, transportatori, costuri și status livrare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Transport</th><th>Transportator</th><th>Vehicul</th><th>Origine / destinație</th><th>Date</th><th>Client</th><th class="nx-right">Cost</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Transport", activePath: "/nexora/supply-chain/transport", companyName, user: options.user, body });
}

function renderNexoraScmDistributionPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const rowsHtml = rowsOrEmpty(rows, 10, (row) => `
    <tr>
      <td><b>${escapeHtml(row.distribution_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.channel || "")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td>${escapeHtml(row.destination_region || "-")}<div class="nx-table-sub">${escapeHtml(row.route_name || "")}</div></td>
      <td>${escapeHtml(dateValue(row.planned_date) || "-")}<div class="nx-table-sub">${escapeHtml(row.delivery_window || "")}</div></td>
      <td class="nx-right">${escapeHtml(row.orders_count || 0)}</td>
      <td class="nx-right">${escapeHtml(row.parcels_count || 0)}</td>
      <td class="nx-right">${escapeHtml(row.total_weight || 0)} kg</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/supply-chain/distribution/${escapeHtml(row.id)}/status">
          <select name="status"><option value="PLANIFICAT">Planificat</option><option value="PREGATIRE">Pregătire</option><option value="IN_TRANZIT">În tranzit</option><option value="LIVRAT">Livrat</option><option value="ANULAT">Anulat</option></select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există planuri de distribuție.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Plan distribuție nou</h1><p>Planifică livrări pe zonă, canal, rută și depozit.</p></div></div>
      <form method="post" action="/nexora/supply-chain/distribution/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Depozit</span><select name="warehouse_id">${warehouseOptions(warehouses)}</select></label>
        <label class="nx-field"><span>Canal</span><select name="channel"><option value="B2B">B2B</option><option value="B2C">B2C</option><option value="RETAIL">Retail</option><option value="HORECA">Horeca</option><option value="EXPORT">Export</option></select></label>
        <label class="nx-field"><span>Regiune</span><input name="destination_region"></label>
        <label class="nx-field"><span>Rută</span><input name="route_name"></label>
        <label class="nx-field"><span>Data</span><input name="planned_date" type="date"></label>
        <label class="nx-field"><span>Interval livrare</span><input name="delivery_window" placeholder="09:00-13:00"></label>
        <label class="nx-field"><span>Comenzi</span><input name="orders_count" value="0"></label>
        <label class="nx-field"><span>Colete</span><input name="parcels_count" value="0"></label>
        <label class="nx-field"><span>Greutate kg</span><input name="total_weight" value="0"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează plan</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Distribuție</h1><p>Planuri de livrare pe depozit, rută și canal.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Plan</th><th>Depozit</th><th>Regiune / rută</th><th>Program</th><th class="nx-right">Comenzi</th><th class="nx-right">Colete</th><th class="nx-right">Kg</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Distribuție", activePath: "/nexora/supply-chain/distribution", companyName, user: options.user, body });
}

function renderNexoraScmForecastingPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.forecast_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.demand_source || "")}</div></td>
      <td>${escapeHtml(row.product_name || "-")}</td>
      <td>${escapeHtml(dateValue(row.period_start) || "-")}<div class="nx-table-sub">${escapeHtml(dateValue(row.period_end) || "")}</div></td>
      <td class="nx-right">${escapeHtml(row.forecast_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.current_stock || 0)}</td>
      <td class="nx-right">${escapeHtml(row.recommended_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.confidence_percent || 0)}%</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
    </tr>
  `, "Nu există forecast-uri.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Forecast nou</h1><p>Previzionează cererea și calculează recomandarea față de stocul curent.</p></div></div>
      <form method="post" action="/nexora/supply-chain/forecasting/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Produs</span><select name="product_id">${productOptions(products, "", "Produs manual")}</select></label>
        <label class="nx-field"><span>Produs manual</span><input name="product_name"></label>
        <label class="nx-field"><span>Sursă cerere</span><select name="demand_source"><option value="VANZARI">Vânzări</option><option value="SEZON">Sezon</option><option value="PROMOTIE">Promoție</option><option value="CLIENT_CHEIE">Client cheie</option><option value="MANUAL">Manual</option></select></label>
        <label class="nx-field"><span>Start</span><input name="period_start" type="date"></label>
        <label class="nx-field"><span>Final</span><input name="period_end" type="date"></label>
        <label class="nx-field"><span>Cerere estimată</span><input name="forecast_qty" value="0"></label>
        <label class="nx-field"><span>Încredere %</span><input name="confidence_percent" value="70"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Calculează forecast</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Forecasting</h1><p>Cerere estimată, stoc curent și cantitate recomandată pentru aprovizionare/producție.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Forecast</th><th>Produs</th><th>Perioadă</th><th class="nx-right">Cerere</th><th class="nx-right">Stoc</th><th class="nx-right">Recomandat</th><th class="nx-right">Încredere</th><th>Status</th><th>Note</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Forecasting", activePath: "/nexora/supply-chain/forecasting", companyName, user: options.user, body });
}

export {
  renderNexoraScmDistributionPage,
  renderNexoraScmForecastingPage,
  renderNexoraScmHubPage,
  renderNexoraScmLogisticsPage,
  renderNexoraScmTransportPage
};
