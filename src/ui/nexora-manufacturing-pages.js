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

function selected(value, expected) {
  return String(value || "").toUpperCase() === String(expected || "").toUpperCase() ? "selected" : "";
}

function money(value, currency = "RON") {
  return `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "LANSAT", "IN_LUCRU", "FINALIZAT", "CONSUMAT", "APROBAT", "PASS", "GENERAT"].includes(normalized)) return "success";
  if (["DRAFT", "PLANIFICAT", "NEEMIS", "EMIS_PARTIAL", "PENDING", "IN_CONTROL"].includes(normalized)) return "warn";
  if (["ANULAT", "RESPINS", "FAIL", "BLOCAT"].includes(normalized)) return "danger";
  return "neutral";
}

function statusBadge(value = "") {
  const label = String(value || "-").toLowerCase().replaceAll("_", " ");
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(label)}</span>`;
}

const TABS = [
  ["Dashboard", "/nexora/manufacturing"],
  ["BOM", "/nexora/manufacturing/bom"],
  ["Ordine producție", "/nexora/manufacturing/orders"],
  ["Planificare", "/nexora/manufacturing/planning"],
  ["Consum materiale", "/nexora/manufacturing/materials"],
  ["Cost producție", "/nexora/manufacturing/costs"],
  ["Quality control", "/nexora/manufacturing/quality"]
];

function tabs(activePath = "/nexora/manufacturing") {
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
    eyebrow: "Producție / MRP",
    pageTitle: title,
    body: `${tabs(activePath)}${body}`
  });
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    launched: "Ordinul de producție a fost lansat.",
    finished: "Producția a fost finalizată și stocul a fost actualizat.",
    generated: "Ordinul de producție a fost generat din plan.",
    consumed: "Consumul de materiale a fost confirmat.",
    status: "Statusul a fost actualizat."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    invalid: "Datele trimise nu sunt valide.",
    missing: "Înregistrarea nu a fost găsită.",
    stock: "Stoc insuficient pentru confirmarea consumului."
  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function rowsOrEmpty(rows = [], colspan = 8, mapper = () => "", empty = "Nu există înregistrări.") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="${escapeHtml(colspan)}"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

function productOptions(products = [], selectedId = "", emptyLabel = "Alege produs") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...products.map((product) => `<option value="${escapeHtml(product.id)}" ${String(product.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim() || "-")} · ${escapeHtml(product.unit || "buc")}</option>`)
  ].join("");
}

function bomOptions(boms = [], selectedId = "", emptyLabel = "Alege BOM") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...boms.map((bom) => `<option value="${escapeHtml(bom.id)}" ${String(bom.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(bom.bom_number || "-")} · ${escapeHtml(bom.product_name || "-")} · rev ${escapeHtml(bom.revision || "A")}</option>`)
  ].join("");
}

function orderOptions(orders = [], selectedId = "", emptyLabel = "Alege ordin") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...orders.map((order) => `<option value="${escapeHtml(order.id)}" ${String(order.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(order.order_number || "-")} · ${escapeHtml(order.product_name || "-")} · ${escapeHtml(order.quantity_planned || 0)} ${escapeHtml(order.unit || "buc")}</option>`)
  ].join("");
}

function warehouseOptions(warehouses = [], selectedId = "", emptyLabel = "Fără depozit") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...warehouses.map((warehouse) => `<option value="${escapeHtml(warehouse.id)}" ${String(warehouse.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(warehouse.warehouse_code || "-")} · ${escapeHtml(warehouse.name || "-")}</option>`)
  ].join("");
}

function stockOptions(stockItems = [], selectedId = "", emptyLabel = "Alege stoc") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...stockItems.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.item_code || "-")} · ${escapeHtml(item.item_name || "-")} · ${escapeHtml(item.quantity || 0)} ${escapeHtml(item.unit || "buc")}</option>`)
  ].join("");
}

function orderMaterialOptions(items = [], selectedId = "", emptyLabel = "Linie manuală") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...items.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.order_number || "-")} · ${escapeHtml(item.item_name || "-")} · necesar ${escapeHtml(item.required_qty || 0)} ${escapeHtml(item.unit || "buc")}</option>`)
  ].join("");
}

function renderNexoraManufacturingHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const orders = Array.isArray(options.recentOrders) ? options.recentOrders : [];
  const plans = Array.isArray(options.recentPlans) ? options.recentPlans : [];
  const orderRows = rowsOrEmpty(orders, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.order_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.product_name || "")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.quantity_planned || 0)} ${escapeHtml(row.unit || "buc")}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td>${escapeHtml(row.priority || "-")}</td>
    </tr>
  `, "Nu există ordine de producție.");
  const planRows = rowsOrEmpty(plans, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.plan_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.product_name || "")}</div></td>
      <td>${escapeHtml(row.demand_source || "-")}</td>
      <td class="nx-right">${escapeHtml(row.demand_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.planned_qty || 0)}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `, "Nu există planuri MRP.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Producție / MRP</h1>
          <p>Rețete BOM, ordine de producție, plan necesar, consum materiale, costuri și quality control.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/manufacturing/orders">Ordin nou</a>
          <a class="nx-btn" href="/nexora/manufacturing/bom">BOM</a>
          <a class="nx-btn" href="/nexora/manufacturing/planning">MRP</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">BOM</div><div><div class="nx-kpi-label">BOM active</div><div class="nx-kpi-value">${escapeHtml(stats.activeBoms || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OP</div><div><div class="nx-kpi-label">Ordine deschise</div><div class="nx-kpi-value">${escapeHtml(stats.openOrders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">MRP</div><div><div class="nx-kpi-label">Planuri de generat</div><div class="nx-kpi-value">${escapeHtml(stats.pendingPlans || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">QC</div><div><div class="nx-kpi-label">Verificări QC</div><div class="nx-kpi-value">${escapeHtml(stats.qualityChecks || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Ordine recente</h1><p>Ultimele ordine de producție.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Ordin</th><th>Status</th><th class="nx-right">Cantitate</th><th>Termen</th><th>Prioritate</th></tr></thead><tbody>${orderRows}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Planificare MRP</h1><p>Cereri, disponibil și cantitate planificată.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Plan</th><th>Sursă</th><th class="nx-right">Necesar</th><th class="nx-right">Planificat</th><th>Status</th></tr></thead><tbody>${planRows}</tbody></table></div>
      </section>
    </div>
  `;
  return shell({ title: "Producție / MRP", activePath: "/nexora/manufacturing", companyName, user: options.user, body });
}

function renderNexoraManufacturingBomPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const boms = Array.isArray(options.boms) ? options.boms : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const stockItems = Array.isArray(options.stockItems) ? options.stockItems : [];
  const selectedBom = options.selectedBom || boms[0] || null;
  const items = Array.isArray(options.items) ? options.items : [];
  const bomRows = rowsOrEmpty(boms, 7, (row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/manufacturing/bom?bom_id=${escapeHtml(row.id)}">${escapeHtml(row.bom_number || "-")}</a><div class="nx-table-sub">rev ${escapeHtml(row.revision || "A")}</div></td>
      <td>${escapeHtml(row.product_name || "-")}<div class="nx-table-sub">${escapeHtml(row.product_code || "")}</div></td>
      <td class="nx-right">${escapeHtml(row.batch_size || 1)} ${escapeHtml(row.unit || "buc")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.items_count || 0)}</td>
      <td class="nx-right">${escapeHtml(money(row.estimated_cost || 0))}</td>
      <td>
        <form method="post" action="/nexora/manufacturing/bom/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="${String(row.status || "").toUpperCase() === "ACTIV" ? "DRAFT" : "ACTIV"}">
          <button class="nx-btn" type="submit">${String(row.status || "").toUpperCase() === "ACTIV" ? "Draft" : "Activează"}</button>
        </form>
      </td>
    </tr>
  `, "Nu există BOM-uri.");
  const itemRows = rowsOrEmpty(items, 7, (item) => `
    <tr>
      <td><b>${escapeHtml(item.component_name || "-")}</b><div class="nx-table-sub">${escapeHtml(item.component_code || "")}</div></td>
      <td>${escapeHtml(item.operation_step || "-")}</td>
      <td class="nx-right">${escapeHtml(item.quantity_per_batch || 0)} ${escapeHtml(item.unit || "buc")}</td>
      <td class="nx-right">${escapeHtml(item.scrap_percent || 0)}%</td>
      <td class="nx-right">${escapeHtml(money(item.unit_cost || 0))}</td>
      <td class="nx-right">${escapeHtml(money((Number(item.quantity_per_batch || 0) * Number(item.unit_cost || 0)) || 0))}</td>
      <td>${escapeHtml(item.notes || "")}</td>
    </tr>
  `, "BOM-ul selectat nu are componente.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>BOM nou</h2><span>Produs finit și revizie</span></div></div>
        <form method="post" action="/nexora/manufacturing/bom/create" class="nx-form">
          <label class="nx-field"><span>Produs finit</span><select name="product_id" required>${productOptions(products)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Revizie</span><input name="revision" value="A"></label>
            <label class="nx-field"><span>Lot standard</span><input name="batch_size" value="1"></label>
          </div>
          <label class="nx-field"><span>Status</span><select name="status"><option value="DRAFT">Draft</option><option value="ACTIV">Activ</option><option value="BLOCAT">Blocat</option></select></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează BOM</button>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Componentă BOM</h2><span>${selectedBom ? escapeHtml(selectedBom.bom_number || "") : "alege BOM"}</span></div></div>
        <form method="post" action="/nexora/manufacturing/bom/items/create" class="nx-form">
          <label class="nx-field"><span>BOM</span><select name="bom_id" required>${bomOptions(boms, selectedBom?.id || "")}</select></label>
          <label class="nx-field"><span>Componentă din catalog</span><select name="component_product_id">${productOptions(products, "", "Linie manuală / din stoc")}</select></label>
          <label class="nx-field"><span>Sau componentă din stoc</span><select name="stock_item_id">${stockOptions(stockItems, "", "Fără stoc asociat")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Denumire manuală</span><input name="component_name" placeholder="dacă nu alegi produs/stoc"></label>
            <label class="nx-field"><span>UM</span><input name="unit" value="buc"></label>
            <label class="nx-field"><span>Cantitate / lot</span><input name="quantity_per_batch" value="1"></label>
            <label class="nx-field"><span>Pierdere %</span><input name="scrap_percent" value="0"></label>
            <label class="nx-field"><span>Cost unitar</span><input name="unit_cost" value="0"></label>
            <label class="nx-field"><span>Operație</span><input name="operation_step" placeholder="Debitare / Asamblare"></label>
          </div>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
          <button class="nx-btn primary" type="submit">Adaugă componentă</button>
        </form>
      </section>
    </div>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>BOM-uri</h1><p>Rețete de fabricație, revizii și cost estimat pe lot.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>BOM</th><th>Produs finit</th><th class="nx-right">Lot</th><th>Status</th><th class="nx-right">Componente</th><th class="nx-right">Cost estimat</th><th></th></tr></thead><tbody>${bomRows}</tbody></table></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Componente ${selectedBom ? escapeHtml(selectedBom.bom_number || "") : ""}</h1><p>Materiale, pierderi tehnologice, costuri și operații.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Componentă</th><th>Operație</th><th class="nx-right">Cantitate</th><th class="nx-right">Pierdere</th><th class="nx-right">Cost unitar</th><th class="nx-right">Cost lot</th><th>Note</th></tr></thead><tbody>${itemRows}</tbody></table></div>
    </section>
  `;
  return shell({ title: "BOM", activePath: "/nexora/manufacturing/bom", companyName, user: options.user, body });
}

function renderNexoraManufacturingOrdersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const boms = Array.isArray(options.boms) ? options.boms : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.order_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.client_name || "")}</div></td>
      <td>${escapeHtml(row.product_name || "-")}<div class="nx-table-sub">${escapeHtml(row.bom_number || "fără BOM")}</div></td>
      <td class="nx-right">${escapeHtml(row.quantity_completed || 0)} / ${escapeHtml(row.quantity_planned || 0)} ${escapeHtml(row.unit || "buc")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.priority || "-")}</td>
      <td>${escapeHtml(dateValue(row.planned_start) || "-")}<div class="nx-table-sub">${escapeHtml(dateValue(row.planned_end) || "")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.cost_total || 0))}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/manufacturing/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="IN_LUCRU"><button class="nx-btn" type="submit">Lansează</button></form>
        <form method="post" action="/nexora/manufacturing/orders/${escapeHtml(row.id)}/finish"><input type="hidden" name="quantity_completed" value="${escapeHtml(row.quantity_planned || 0)}"><button class="nx-btn primary" type="submit">Finalizează</button></form>
      </td>
    </tr>
  `, "Nu există ordine de producție.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Ordin de producție nou</h1><p>Generează necesarul de materiale din BOM și urmărește execuția.</p></div></div>
      <form method="post" action="/nexora/manufacturing/orders/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>BOM</span><select name="bom_id">${bomOptions(boms, "", "Fără BOM / manual")}</select></label>
        <label class="nx-field"><span>Produs manual</span><select name="product_id">${productOptions(products, "", "Din BOM sau alege produs")}</select></label>
        <label class="nx-field"><span>Cantitate</span><input name="quantity_planned" value="1"></label>
        <label class="nx-field"><span>Depozit produs finit</span><select name="warehouse_id">${warehouseOptions(warehouses)}</select></label>
        <label class="nx-field"><span>Start</span><input name="planned_start" type="date"></label>
        <label class="nx-field"><span>Final planificat</span><input name="planned_end" type="date"></label>
        <label class="nx-field"><span>Termen</span><input name="due_date" type="date"></label>
        <label class="nx-field"><span>Prioritate</span><select name="priority"><option value="MEDIE">Medie</option><option value="RIDICATA">Ridicată</option><option value="URGENTA">Urgentă</option><option value="SCAZUTA">Scăzută</option></select></label>
        <label class="nx-field"><span>Client / comandă</span><input name="client_name"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează ordin</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Ordine producție</h1><p>Lansare, execuție, finalizare și intrare produs finit în stoc.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Ordin</th><th>Produs</th><th class="nx-right">Cantitate</th><th>Status</th><th>Prioritate</th><th>Plan</th><th>Depozit</th><th class="nx-right">Costuri</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Ordine producție", activePath: "/nexora/manufacturing/orders", companyName, user: options.user, body });
}

function renderNexoraManufacturingPlanningPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.plan_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.demand_source || "")}</div></td>
      <td>${escapeHtml(row.product_name || "-")}</td>
      <td>${escapeHtml(dateValue(row.period_start) || "-")}<div class="nx-table-sub">${escapeHtml(dateValue(row.required_date) || "")}</div></td>
      <td class="nx-right">${escapeHtml(row.demand_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.available_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.planned_qty || 0)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.generated_order_id ? `<a class="nx-btn" href="/nexora/manufacturing/orders">Ordin generat</a>` : `<form method="post" action="/nexora/manufacturing/planning/${escapeHtml(row.id)}/generate-order"><button class="nx-btn primary" type="submit">Generează ordin</button></form>`}</td>
    </tr>
  `, "Nu există planuri MRP.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Plan MRP nou</h1><p>Calculează necesarul din forecast, vânzări sau comandă internă.</p></div></div>
      <form method="post" action="/nexora/manufacturing/planning/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Produs</span><select name="product_id" required>${productOptions(products)}</select></label>
        <label class="nx-field"><span>Sursă necesar</span><select name="demand_source"><option value="FORECAST">Forecast</option><option value="SALES">Vânzări</option><option value="STOC_MINIM">Stoc minim</option><option value="CUSTOM">Manual</option></select></label>
        <label class="nx-field"><span>Perioadă start</span><input name="period_start" type="date"></label>
        <label class="nx-field"><span>Perioadă final</span><input name="period_end" type="date"></label>
        <label class="nx-field"><span>Data necesară</span><input name="required_date" type="date"></label>
        <label class="nx-field"><span>Cantitate necesară</span><input name="demand_qty" value="1"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Calculează plan</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Planificare MRP</h1><p>Necesar, stoc disponibil și cantitate de produs pentru ordin.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Plan</th><th>Produs</th><th>Perioadă</th><th class="nx-right">Necesar</th><th class="nx-right">Disponibil</th><th class="nx-right">Planificat</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Planificare", activePath: "/nexora/manufacturing/planning", companyName, user: options.user, body });
}

function renderNexoraManufacturingMaterialsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const issues = Array.isArray(options.issues) ? options.issues : [];
  const orderMaterials = Array.isArray(options.orderMaterials) ? options.orderMaterials : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const stockItems = Array.isArray(options.stockItems) ? options.stockItems : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const rowsHtml = rowsOrEmpty(issues, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.issue_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.issue_date) || "")}</div></td>
      <td>${escapeHtml(row.order_number || "-")}</td>
      <td>${escapeHtml(row.item_name || "-")}<div class="nx-table-sub">${escapeHtml(row.item_code || "")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td class="nx-right">${escapeHtml(row.issued_qty || 0)} ${escapeHtml(row.unit || "buc")}</td>
      <td class="nx-right">${escapeHtml(row.consumed_qty || 0)} ${escapeHtml(row.unit || "buc")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.created_by_email || "-")}</td>
      <td>${String(row.status || "").toUpperCase() === "CONSUMAT" ? "" : `<form method="post" action="/nexora/manufacturing/materials/${escapeHtml(row.id)}/consume"><button class="nx-btn primary" type="submit">Confirmă consum</button></form>`}</td>
    </tr>
  `, "Nu există bonuri de consum materiale.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Consum materiale</h1><p>Emitere materiale pe ordin și scădere opțională din stoc.</p></div></div>
      <form method="post" action="/nexora/manufacturing/materials/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Linie necesar ordin</span><select name="order_material_id">${orderMaterialOptions(orderMaterials)}</select></label>
        <label class="nx-field"><span>Ordin manual</span><select name="order_id">${orderOptions(orders, "", "Fără ordin")}</select></label>
        <label class="nx-field"><span>Stoc</span><select name="stock_item_id">${stockOptions(stockItems)}</select></label>
        <label class="nx-field"><span>Depozit</span><select name="warehouse_id">${warehouseOptions(warehouses)}</select></label>
        <label class="nx-field"><span>Denumire manuală</span><input name="item_name"></label>
        <label class="nx-field"><span>UM</span><input name="unit" value="buc"></label>
        <label class="nx-field"><span>Cantitate emisă</span><input name="issued_qty" value="1"></label>
        <label class="nx-field"><span>Data</span><input name="issue_date" type="date"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Emite materiale</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Bonuri consum</h1><p>Materiale emise și consum confirmat pe producție.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Bon</th><th>Ordin</th><th>Material</th><th>Depozit</th><th class="nx-right">Emis</th><th class="nx-right">Consumat</th><th>Status</th><th>Creat de</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Consum materiale", activePath: "/nexora/manufacturing/materials", companyName, user: options.user, body });
}

function renderNexoraManufacturingCostsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.cost_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.cost_date) || "")}</div></td>
      <td>${escapeHtml(row.order_number || "-")}<div class="nx-table-sub">${escapeHtml(row.product_name || "")}</div></td>
      <td>${escapeHtml(row.cost_type || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.material_cost || 0))}</td>
      <td class="nx-right">${escapeHtml(money(row.labor_cost || 0))}</td>
      <td class="nx-right">${escapeHtml(money(row.overhead_cost || 0))}</td>
      <td class="nx-right">${escapeHtml(money(row.total_cost || 0))}</td>
      <td class="nx-right">${escapeHtml(money(row.unit_cost || 0))}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `, "Nu există costuri de producție.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Cost producție nou</h1><p>Cost estimat sau realizat pe ordin, cu material, manoperă și regie.</p></div></div>
      <form method="post" action="/nexora/manufacturing/costs/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Ordin</span><select name="order_id">${orderOptions(orders, "", "Fără ordin")}</select></label>
        <label class="nx-field"><span>Tip cost</span><select name="cost_type"><option value="ESTIMAT">Estimat</option><option value="REALIZAT">Realizat</option><option value="SIMULARE">Simulare</option></select></label>
        <label class="nx-field"><span>Data</span><input name="cost_date" type="date"></label>
        <label class="nx-field"><span>Cost materiale</span><input name="material_cost" value="0"></label>
        <label class="nx-field"><span>Manoperă</span><input name="labor_cost" value="0"></label>
        <label class="nx-field"><span>Regie</span><input name="overhead_cost" value="0"></label>
        <label class="nx-field"><span>Subcontractare</span><input name="subcontract_cost" value="0"></label>
        <label class="nx-field"><span>Cantitate bază</span><input name="quantity_basis" value="0"></label>
        <label class="nx-check-field"><input type="checkbox" name="auto_material_cost" value="1"><span>Preia automat cost materiale din consum/BOM</span></label>
        <label class="nx-field nx-field-wide"><span>Descriere</span><input name="description"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează cost</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Costuri producție</h1><p>Analiză pe ordin și cost unitar.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cost</th><th>Ordin</th><th>Tip</th><th class="nx-right">Materiale</th><th class="nx-right">Manoperă</th><th class="nx-right">Regie</th><th class="nx-right">Total</th><th class="nx-right">Unitar</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Cost producție", activePath: "/nexora/manufacturing/costs", companyName, user: options.user, body });
}

function renderNexoraManufacturingQualityPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.qc_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.check_date) || "")}</div></td>
      <td>${escapeHtml(row.order_number || "-")}<div class="nx-table-sub">${escapeHtml(row.product_name || "")}</div></td>
      <td>${escapeHtml(row.inspection_type || "-")}</td>
      <td class="nx-right">${escapeHtml(row.sample_size || 0)}</td>
      <td class="nx-right">${escapeHtml(row.accepted_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.rejected_qty || 0)}</td>
      <td>${escapeHtml(row.defect_type || "-")}</td>
      <td>${statusBadge(row.result)}</td>
      <td>${escapeHtml(row.inspector_email || "-")}</td>
    </tr>
  `, "Nu există verificări quality control.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Control calitate nou</h1><p>Inspecții la intrare în producție, în proces sau finale.</p></div></div>
      <form method="post" action="/nexora/manufacturing/quality/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Ordin</span><select name="order_id">${orderOptions(orders, "", "Fără ordin")}</select></label>
        <label class="nx-field"><span>Tip inspecție</span><select name="inspection_type"><option value="FINAL">Final</option><option value="IN_PROCES">În proces</option><option value="RECEPTIE_MATERII">Recepție materii</option><option value="MOSTRA">Mostră</option></select></label>
        <label class="nx-field"><span>Data</span><input name="check_date" type="date"></label>
        <label class="nx-field"><span>Eșantion</span><input name="sample_size" value="0"></label>
        <label class="nx-field"><span>Acceptate</span><input name="accepted_qty" value="0"></label>
        <label class="nx-field"><span>Respins</span><input name="rejected_qty" value="0"></label>
        <label class="nx-field"><span>Tip defect</span><input name="defect_type"></label>
        <label class="nx-field"><span>Rezultat</span><select name="result"><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="PENDING">Pending</option><option value="IN_CONTROL">În control</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează QC</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Quality control</h1><p>Rezultate, neconformități și trasabilitate pe ordin.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>QC</th><th>Ordin</th><th>Tip</th><th class="nx-right">Eșantion</th><th class="nx-right">OK</th><th class="nx-right">Respins</th><th>Defect</th><th>Rezultat</th><th>Inspector</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Quality control", activePath: "/nexora/manufacturing/quality", companyName, user: options.user, body });
}

export {
  renderNexoraManufacturingBomPage,
  renderNexoraManufacturingCostsPage,
  renderNexoraManufacturingHubPage,
  renderNexoraManufacturingMaterialsPage,
  renderNexoraManufacturingOrdersPage,
  renderNexoraManufacturingPlanningPage,
  renderNexoraManufacturingQualityPage
};
