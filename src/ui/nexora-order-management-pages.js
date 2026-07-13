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

function dateTimeValue(value = "") {
  return String(value || "").replace("T", " ").slice(0, 16);
}

function money(value, fmtMoney) {
  if (typeof fmtMoney === "function") return fmtMoney(value || 0);
  return `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
}

function selected(actual, expected) {
  return String(actual || "").toUpperCase() === expected ? "selected" : "";
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["CONFIRMATA", "CONFIRMAT", "LIVRATA", "LIVRAT", "FINALIZAT", "FINALIZATA", "PREDAT_CURIER", "ACCEPTATA"].includes(normalized)) return "success";
  if (["NOUA", "PREGATITA", "PLANIFICAT", "IN_LUCRU", "IN_TRANZIT", "PROGRAMATA", "AMBALAT", "PICKING"].includes(normalized)) return "warn";
  if (["ANULATA", "ANULAT", "BLOCAT", "INTARZIAT", "ESUAT", "RETURNAT"].includes(normalized)) return "danger";
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
  ["Comenzi", "/nexora/orders"],
  ["Lifecycle", "/nexora/orders/lifecycle"],
  ["Fulfillment", "/nexora/orders/fulfillment"],
  ["Tracking", "/nexora/orders/tracking"],
  ["Status livrare", "/nexora/orders/delivery-status"]
];

function tabs(activePath = "/nexora/orders/lifecycle") {
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
    eyebrow: "Order Management",
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

function orderOptions(orders = [], selectedId = "", emptyLabel = "Alege comanda") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...orders.map((order) => `<option value="${escapeHtml(order.id)}" ${String(order.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(order.order_number || "-")} · ${escapeHtml(order.client_name || "-")} · ${statusBadgeText(order.status)}</option>`)
  ].join("");
}

function deliveryOptions(deliveries = [], selectedId = "", emptyLabel = "Fără livrare") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...deliveries.map((delivery) => `<option value="${escapeHtml(delivery.id)}" ${String(delivery.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(delivery.delivery_number || "-")} · ${escapeHtml(delivery.client_name || "-")} · ${statusBadgeText(delivery.status)}</option>`)
  ].join("");
}

function warehouseOptions(warehouses = [], selectedId = "", emptyLabel = "Fără depozit") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...warehouses.map((warehouse) => `<option value="${escapeHtml(warehouse.id)}" ${String(warehouse.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(warehouse.warehouse_code || "-")} · ${escapeHtml(warehouse.name || "-")}</option>`)
  ].join("");
}

function statusBadgeText(value = "") {
  return String(value || "-").toLowerCase().replaceAll("_", " ");
}

function renderLifecycleTimeline(events = []) {
  const rows = rowsOrEmpty(events, 7, (event) => `
    <tr>
      <td><b>${escapeHtml(event.event_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateTimeValue(event.event_date) || "-")}</div></td>
      <td><a class="nx-table-main-link" href="/nexora/orders/${escapeHtml(event.order_id)}">${escapeHtml(event.order_number || "-")}</a><div class="nx-table-sub">${escapeHtml(event.client_name || "-")}</div></td>
      <td>${statusBadge(event.from_status)}</td>
      <td>${statusBadge(event.to_status)}</td>
      <td>${escapeHtml(event.event_type || "-")}</td>
      <td>${escapeHtml(event.actor_email || "-")}</td>
      <td>${escapeHtml(event.notes || "-")}</td>
    </tr>
  `, "Nu există evenimente de lifecycle.");

  return `
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Istoric lifecycle comenzi</h1><p>Audit operațional pentru fiecare schimbare de stare.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Eveniment</th><th>Comandă</th><th>Din</th><th>În</th><th>Tip</th><th>Actor</th><th>Observații</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderNexoraOrderLifecyclePage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const events = Array.isArray(options.events) ? options.events : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">SO</div><div><div class="nx-kpi-label">Comenzi active</div><div class="nx-kpi-value">${escapeHtml(stats.open_orders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Confirmate</div><div class="nx-kpi-value">${escapeHtml(stats.confirmed_orders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RUN</div><div><div class="nx-kpi-label">În lucru</div><div class="nx-kpi-value">${escapeHtml(stats.in_progress_orders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">LOG</div><div><div class="nx-kpi-label">Evenimente</div><div class="nx-kpi-value">${escapeHtml(stats.events_count || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Schimbă lifecycle comandă</h1><p>Confirmare, lucru, blocaj, livrare sau anulare, cu istoric păstrat.</p></div></div>
      <form method="post" action="/nexora/orders/lifecycle/create" class="nx-inline-form">
        <label class="nx-field"><span>Comandă</span><select name="order_id" required>${orderOptions(orders)}</select></label>
        <label class="nx-field"><span>Tip eveniment</span><select name="event_type"><option value="STATUS">Status</option><option value="CONFIRMARE">Confirmare</option><option value="BLOCARE">Blocare</option><option value="REPLANIFICARE">Replanificare</option><option value="LIVRARE">Livrare</option><option value="ANULARE">Anulare</option></select></label>
        <label class="nx-field"><span>Status nou</span><select name="to_status"><option value="NOUA">Nouă</option><option value="CONFIRMATA">Confirmată</option><option value="IN_LUCRU">În lucru</option><option value="LIVRATA">Livrată</option><option value="ANULATA">Anulată</option><option value="BLOCAT">Blocat</option></select></label>
        <label class="nx-field"><span>Data</span><input type="datetime-local" name="event_date"></label>
        <label class="nx-field nx-field-wide"><span>Observații</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează eveniment</button></div>
      </form>
    </section>

    ${renderLifecycleTimeline(events)}
  `;

  return shell({ title: "Lifecycle comandă", activePath: "/nexora/orders/lifecycle", companyName, user: options.user, body });
}

function renderNexoraOrderFulfillmentPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const deliveries = Array.isArray(options.deliveries) ? options.deliveries : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const rows = rowsOrEmpty(tasks, 9, (task) => `
    <tr>
      <td><b>${escapeHtml(task.task_number || "-")}</b><div class="nx-table-sub">${escapeHtml(task.task_type || "-")}</div></td>
      <td><a class="nx-table-main-link" href="/nexora/orders/${escapeHtml(task.order_id)}">${escapeHtml(task.order_number || "-")}</a><div class="nx-table-sub">${escapeHtml(task.client_name || "-")}</div></td>
      <td>${task.delivery_id ? `<a class="nx-table-main-link" href="/nexora/deliveries/${escapeHtml(task.delivery_id)}">${escapeHtml(task.delivery_number || "-")}</a>` : "-"}</td>
      <td>${escapeHtml(task.warehouse_name || "-")}</td>
      <td>${escapeHtml(task.assigned_to || "-")}</td>
      <td>${escapeHtml(dateValue(task.planned_date) || "-")}</td>
      <td>${statusBadge(task.status)}</td>
      <td>${escapeHtml(task.notes || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/orders/fulfillment/${escapeHtml(task.id)}/status" class="nx-inline-form compact">
          <select name="status">
            <option value="PLANIFICAT" ${selected(task.status, "PLANIFICAT")}>Planificat</option>
            <option value="IN_LUCRU" ${selected(task.status, "IN_LUCRU")}>În lucru</option>
            <option value="FINALIZAT" ${selected(task.status, "FINALIZAT")}>Finalizat</option>
            <option value="BLOCAT" ${selected(task.status, "BLOCAT")}>Blocat</option>
            <option value="ANULAT" ${selected(task.status, "ANULAT")}>Anulat</option>
          </select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există task-uri de fulfillment.");

  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PCK</div><div><div class="nx-kpi-label">Task-uri</div><div class="nx-kpi-value">${escapeHtml(stats.total_tasks || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RUN</div><div><div class="nx-kpi-label">În lucru</div><div class="nx-kpi-value">${escapeHtml(stats.running_tasks || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Finalizate</div><div class="nx-kpi-value">${escapeHtml(stats.done_tasks || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">!</div><div><div class="nx-kpi-label">Blocate</div><div class="nx-kpi-value">${escapeHtml(stats.blocked_tasks || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Task fulfillment</h1><p>Picking, packing, verificare și expediere pentru comenzi.</p></div></div>
      <form method="post" action="/nexora/orders/fulfillment/create" class="nx-inline-form">
        <label class="nx-field"><span>Comandă</span><select name="order_id" required>${orderOptions(orders)}</select></label>
        <label class="nx-field"><span>Livrare</span><select name="delivery_id">${deliveryOptions(deliveries)}</select></label>
        <label class="nx-field"><span>Tip task</span><select name="task_type"><option value="PICKING">Picking</option><option value="PACKING">Packing</option><option value="VERIFICARE">Verificare</option><option value="EXPEDIERE">Expediere</option><option value="RETUR">Retur</option></select></label>
        <label class="nx-field"><span>Depozit</span><select name="warehouse_id">${warehouseOptions(warehouses)}</select></label>
        <label class="nx-field"><span>Responsabil</span><input name="assigned_to"></label>
        <label class="nx-field"><span>Planificat</span><input type="date" name="planned_date"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="PLANIFICAT">Planificat</option><option value="IN_LUCRU">În lucru</option></select></label>
        <label class="nx-field nx-field-wide"><span>Observații</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează task</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Plan operațional</h1><p>Task-uri de pregătire și expediere legate de comenzi și livrări.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Comandă</th><th>Livrare</th><th>Depozit</th><th>Responsabil</th><th>Planificat</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
  `;

  return shell({ title: "Fulfillment", activePath: "/nexora/orders/fulfillment", companyName, user: options.user, body });
}

function renderNexoraOrderTrackingPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const deliveries = Array.isArray(options.deliveries) ? options.deliveries : [];
  const events = Array.isArray(options.events) ? options.events : [];
  const rows = rowsOrEmpty(events, 9, (event) => `
    <tr>
      <td><b>${escapeHtml(event.tracking_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateTimeValue(event.event_date) || "-")}</div></td>
      <td>${event.order_id ? `<a class="nx-table-main-link" href="/nexora/orders/${escapeHtml(event.order_id)}">${escapeHtml(event.order_number || "-")}</a>` : "-"}</td>
      <td>${event.delivery_id ? `<a class="nx-table-main-link" href="/nexora/deliveries/${escapeHtml(event.delivery_id)}">${escapeHtml(event.delivery_number || "-")}</a>` : "-"}</td>
      <td>${escapeHtml(event.client_name || "-")}</td>
      <td>${escapeHtml(event.event_type || "-")}</td>
      <td>${statusBadge(event.status)}</td>
      <td>${escapeHtml(event.courier || "-")}<div class="nx-table-sub">${escapeHtml(event.awb || "")}</div></td>
      <td>${escapeHtml(event.location || "-")}</td>
      <td>${escapeHtml(event.notes || "-")}</td>
    </tr>
  `, "Nu există evenimente de tracking.");

  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">TRK</div><div><div class="nx-kpi-label">Evenimente</div><div class="nx-kpi-value">${escapeHtml(stats.events_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">AWB</div><div><div class="nx-kpi-label">Cu AWB</div><div class="nx-kpi-value">${escapeHtml(stats.awb_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">MOV</div><div><div class="nx-kpi-label">În tranzit</div><div class="nx-kpi-value">${escapeHtml(stats.in_transit_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Livrate</div><div class="nx-kpi-value">${escapeHtml(stats.delivered_count || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Eveniment tracking</h1><p>Curier, AWB, locație, status transport și notițe operaționale.</p></div></div>
      <form method="post" action="/nexora/orders/tracking/create" class="nx-inline-form">
        <label class="nx-field"><span>Comandă</span><select name="order_id">${orderOptions(orders, "", "Fără comandă")}</select></label>
        <label class="nx-field"><span>Livrare</span><select name="delivery_id">${deliveryOptions(deliveries)}</select></label>
        <label class="nx-field"><span>Tip eveniment</span><select name="event_type"><option value="AWB">AWB</option><option value="PREDAT_CURIER">Predat curier</option><option value="IN_TRANZIT">În tranzit</option><option value="LIVRAT">Livrat</option><option value="INTARZIAT">Întârziat</option><option value="RETURNAT">Returnat</option></select></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="PREGATITA">Pregătită</option><option value="PREDAT_CURIER">Predat curier</option><option value="IN_TRANZIT">În tranzit</option><option value="LIVRATA">Livrată</option><option value="INTARZIAT">Întârziat</option><option value="RETURNAT">Returnat</option></select></label>
        <label class="nx-field"><span>Data</span><input type="datetime-local" name="event_date"></label>
        <label class="nx-field"><span>Curier</span><input name="courier"></label>
        <label class="nx-field"><span>AWB</span><input name="awb"></label>
        <label class="nx-field"><span>Locație</span><input name="location"></label>
        <label class="nx-field nx-field-wide"><span>Observații</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă tracking</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Istoric tracking</h1><p>Evenimente de transport și livrare pentru comenzi.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Tracking</th><th>Comandă</th><th>Livrare</th><th>Client</th><th>Eveniment</th><th>Status</th><th>Curier / AWB</th><th>Locație</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
  `;

  return shell({ title: "Tracking comenzi", activePath: "/nexora/orders/tracking", companyName, user: options.user, body });
}

function renderNexoraOrderDeliveryStatusPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const rowsData = Array.isArray(options.rows) ? options.rows : [];
  const rows = rowsOrEmpty(rowsData, 10, (row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/deliveries/${escapeHtml(row.id)}">${escapeHtml(row.delivery_number || "-")}</a><div class="nx-table-sub">${escapeHtml(dateValue(row.scheduled_date) || "-")}</div></td>
      <td>${row.order_id ? `<a class="nx-table-main-link" href="/nexora/orders/${escapeHtml(row.order_id)}">${escapeHtml(row.order_number || "-")}</a>` : "-"}</td>
      <td>${escapeHtml(row.client_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.courier || "-")}<div class="nx-table-sub">${escapeHtml(row.awb || "")}</div></td>
      <td>${escapeHtml(row.last_tracking_status || "-")}<div class="nx-table-sub">${escapeHtml(dateTimeValue(row.last_tracking_date) || "")}</div></td>
      <td class="nx-right">${escapeHtml(row.items_count || 0)}</td>
      <td>${escapeHtml(dateValue(row.delivered_at) || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/orders/delivery-status/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
          <select name="status">
            <option value="PREGATITA" ${selected(row.status, "PREGATITA")}>Pregătită</option>
            <option value="PREDAT_CURIER" ${selected(row.status, "PREDAT_CURIER")}>Predat curier</option>
            <option value="IN_TRANZIT" ${selected(row.status, "IN_TRANZIT")}>În tranzit</option>
            <option value="LIVRATA" ${selected(row.status, "LIVRATA")}>Livrată</option>
            <option value="INTARZIATA" ${selected(row.status, "INTARZIATA")}>Întârziată</option>
            <option value="ANULATA" ${selected(row.status, "ANULATA")}>Anulată</option>
          </select>
          <input name="courier" value="${escapeHtml(row.courier || "")}" placeholder="Curier">
          <input name="awb" value="${escapeHtml(row.awb || "")}" placeholder="AWB">
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există livrări.");

  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DLV</div><div><div class="nx-kpi-label">Livrări</div><div class="nx-kpi-value">${escapeHtml(stats.total_deliveries || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RUN</div><div><div class="nx-kpi-label">Deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_deliveries || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">AWB</div><div><div class="nx-kpi-label">Cu AWB</div><div class="nx-kpi-value">${escapeHtml(stats.awb_deliveries || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Livrate</div><div class="nx-kpi-value">${escapeHtml(stats.done_deliveries || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Status livrare</h1><p>Urmărire livrări, curier, AWB și ultimul tracking.</p></div>
        <div class="nx-form-actions"><a class="nx-btn primary" href="/nexora/deliveries">Livrări</a><a class="nx-btn" href="/nexora/orders/tracking">Tracking</a></div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Livrare</th><th>Comandă</th><th>Client</th><th>Status</th><th>Curier / AWB</th><th>Ultim tracking</th><th class="nx-right">Poziții</th><th>Livrat</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;

  return shell({ title: "Status livrare", activePath: "/nexora/orders/delivery-status", companyName, user: options.user, body });
}

export {
  renderNexoraOrderDeliveryStatusPage,
  renderNexoraOrderFulfillmentPage,
  renderNexoraOrderLifecyclePage,
  renderNexoraOrderTrackingPage
};
