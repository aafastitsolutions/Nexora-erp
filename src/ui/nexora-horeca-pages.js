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
  if (["LIBERA", "ACTIV", "CONFIRMATA", "DESCHISA", "IN_PREPARARE", "GATA", "SERVIT", "SERVITA", "ACHITATA", "FINALIZATA"].includes(normalized)) return "success";
  if (["REZERVATA", "OCUPATA", "NOU", "IN_ASTEPTARE", "DRAFT"].includes(normalized)) return "warn";
  if (["ANULATA", "BLOCATA", "INDISPONIBILA"].includes(normalized)) return "danger";
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
  ["Dashboard", "/nexora/horeca"],
  ["Mese & sală", "/nexora/horeca/tables"],
  ["Comenzi", "/nexora/horeca/orders"],
  ["POS", "/nexora/horeca/pos"],
  ["Meniu", "/nexora/horeca/menu"],
  ["Rețetare", "/nexora/horeca/recipes"],
  ["Consum", "/nexora/horeca/consumption"],
  ["Stoc bar/bucătărie", "/nexora/horeca/stock"],
  ["Note plată", "/nexora/horeca/checks"],
  ["Split bill", "/nexora/horeca/split-bill"],
  ["Bacșiș", "/nexora/horeca/tips"],
  ["Rezervări", "/nexora/horeca/reservations"],
  ["Takeaway", "/nexora/horeca/takeaway"],
  ["Fiscal", "/nexora/horeca/fiscal"],
  ["Rapoarte", "/nexora/horeca/reports"]
];

function tabs(activePath = "/nexora/horeca") {
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
    eyebrow: "Restaurant / Horeca",
    pageTitle: title,
    body: `${tabs(activePath)}${body}`
  });
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    status: "Statusul a fost actualizat.",
    item: "Preparatul a fost adăugat pe comandă."
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

function tableOptions(tables = [], selectedId = "", emptyLabel = "Fără masă") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...tables.map((table) => `<option value="${escapeHtml(table.id)}" ${String(table.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(table.table_code || "-")} · ${escapeHtml(table.area || "Sală")} · ${escapeHtml(table.seats || 0)} locuri</option>`)
  ].join("");
}

function menuOptions(items = [], selectedId = "") {
  return [
    `<option value="">Alege preparat</option>`,
    ...items.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.item_code || "-")} · ${escapeHtml(item.name || "-")} · ${escapeHtml(money(item.price || 0))}</option>`)
  ].join("");
}

function orderOptions(orders = [], selectedId = "") {
  return [
    `<option value="">Alege comandă deschisă</option>`,
    ...orders.map((order) => `<option value="${escapeHtml(order.id)}" ${String(order.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(order.order_number || "-")} · ${escapeHtml(order.table_code || order.channel || "-")} · ${escapeHtml(money(order.total || 0))}</option>`)
  ].join("");
}

function renderNexoraHorecaHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const reservations = Array.isArray(options.reservations) ? options.reservations : [];
  const orderRows = rowsOrEmpty(orders, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.order_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.table_code || row.channel || "")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.waiter_name || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.total || 0))}</td>
      <td><a class="nx-btn" href="/nexora/horeca/orders">Deschide</a></td>
    </tr>
  `, "Nu există comenzi deschise.");
  const reservationRows = rowsOrEmpty(reservations, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.client_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.phone || "")}</div></td>
      <td>${escapeHtml(row.table_code || "-")}</td>
      <td>${escapeHtml(dateValue(row.reservation_date) || "-")} ${escapeHtml(row.reservation_time || "")}</td>
      <td class="nx-right">${escapeHtml(row.guest_count || 0)}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `, "Nu există rezervări apropiate.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Restaurant / Horeca</h1>
          <p>Sală, mese, rezervări, meniu cu rețete, comenzi la masă și monitorizare bucătărie/bar.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/horeca/orders">Comandă nouă</a>
          <a class="nx-btn" href="/nexora/horeca/reservations">Rezervare</a>
          <a class="nx-btn" href="/nexora/horeca/menu">Meniu</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">M</div><div><div class="nx-kpi-label">Mese libere</div><div class="nx-kpi-value">${escapeHtml(stats.freeTables || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">R</div><div><div class="nx-kpi-label">Rezervări azi</div><div class="nx-kpi-value">${escapeHtml(stats.todayReservations || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">C</div><div><div class="nx-kpi-label">Comenzi deschise</div><div class="nx-kpi-value">${escapeHtml(stats.openOrders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">V</div><div><div class="nx-kpi-label">Vânzări azi</div><div class="nx-kpi-value">${escapeHtml(money(stats.todaySales || 0))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Comenzi active</h1><p>Flux sală, takeaway, delivery sau room service.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Status</th><th>Responsabil</th><th class="nx-right">Total</th><th></th></tr></thead><tbody>${orderRows}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Rezervări apropiate</h1><p>Clienți programați și mese alocate.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Client</th><th>Masă</th><th>Ora</th><th class="nx-right">Persoane</th><th>Status</th></tr></thead><tbody>${reservationRows}</tbody></table></div>
      </section>
    </div>
  `;
  return shell({ title: "Restaurant / Horeca", activePath: "/nexora/horeca", companyName, user: options.user, body });
}

function renderNexoraHorecaTablesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 6, (row) => `
    <tr>
      <td><b>${escapeHtml(row.table_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.area || "")}</div></td>
      <td class="nx-right">${escapeHtml(row.seats || 0)}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.open_orders || 0)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/horeca/tables/${escapeHtml(row.id)}/status">
          <select name="status"><option value="LIBERA">Liberă</option><option value="OCUPATA">Ocupată</option><option value="REZERVATA">Rezervată</option><option value="INDISPONIBILA">Indisponibilă</option></select>
          <button class="nx-btn" type="submit">Actualizează</button>
        </form>
      </td>
    </tr>
  `, "Nu există mese configurate.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Masă nouă</h1><p>Definește zonele de sală, terasă, bar sau evenimente.</p></div></div>
      <form method="post" action="/nexora/horeca/tables/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Cod masă</span><input name="table_code" placeholder="M01" required></label>
        <label class="nx-field"><span>Zonă</span><input name="area" value="Sală"></label>
        <label class="nx-field"><span>Locuri</span><input name="seats" value="2"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="LIBERA">Liberă</option><option value="REZERVATA">Rezervată</option><option value="INDISPONIBILA">Indisponibilă</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă masă</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Sală & mese</h1><p>Disponibilitate, zone și comenzi active pe masă.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Masă</th><th class="nx-right">Locuri</th><th>Status</th><th class="nx-right">Comenzi</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Sală & mese", activePath: "/nexora/horeca/tables", companyName, user: options.user, body });
}

function renderNexoraHorecaReservationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const tables = Array.isArray(options.tables) ? options.tables : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.reservation_number || "-")}</b></td>
      <td>${escapeHtml(row.client_name || "-")}<div class="nx-table-sub">${escapeHtml(row.phone || "")}</div></td>
      <td>${escapeHtml(row.table_code || "-")}</td>
      <td>${escapeHtml(dateValue(row.reservation_date) || "-")} ${escapeHtml(row.reservation_time || "")}</td>
      <td class="nx-right">${escapeHtml(row.guest_count || 0)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/horeca/reservations/${escapeHtml(row.id)}/status">
          <select name="status"><option value="CONFIRMATA">Confirmată</option><option value="IN_ASTEPTARE">În așteptare</option><option value="FINALIZATA">Finalizată</option><option value="ANULATA">Anulată</option></select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există rezervări.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Rezervare nouă</h1><p>Înregistrează clientul, ora, masa și numărul de persoane.</p></div></div>
      <form method="post" action="/nexora/horeca/reservations/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Client</span><input name="client_name" required></label>
        <label class="nx-field"><span>Telefon</span><input name="phone"></label>
        <label class="nx-field"><span>Masă</span><select name="table_id">${tableOptions(tables)}</select></label>
        <label class="nx-field"><span>Persoane</span><input name="guest_count" value="2"></label>
        <label class="nx-field"><span>Data</span><input name="reservation_date" type="date"></label>
        <label class="nx-field"><span>Ora</span><input name="reservation_time" type="time"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="CONFIRMATA">Confirmată</option><option value="IN_ASTEPTARE">În așteptare</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează rezervare</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Rezervări</h1><p>Programări, mese alocate și status.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Nr.</th><th>Client</th><th>Masă</th><th>Data/Ora</th><th class="nx-right">Persoane</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Rezervări Horeca", activePath: "/nexora/horeca/reservations", companyName, user: options.user, body });
}

function renderNexoraHorecaMenuPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const title = options.title || "Meniu & rețete";
  const activePath = options.activePath || "/nexora/horeca/menu";
  const intro = options.intro || "Preparatele vândute și regula de consum din stoc.";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.item_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.category || "")}</div></td>
      <td>${escapeHtml(row.name || "-")}<div class="nx-table-sub">${escapeHtml(row.course_type || "")}</div></td>
      <td class="nx-right">${escapeHtml(money(row.price || 0))}</td>
      <td class="nx-right">${escapeHtml(row.vat_percent || 0)}%</td>
      <td>${escapeHtml(row.stock_policy || "-")}</td>
      <td>${escapeHtml(row.recipe_notes || "")}</td>
      <td>${escapeHtml(row.allergen_notes || "")}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `, "Nu există preparate în meniu.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Preparat nou</h1><p>Meniu cu preț, TVA, rețetă scurtă și alergeni.</p></div></div>
      <form method="post" action="/nexora/horeca/menu/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Cod</span><input name="item_code" placeholder="PIZZA-01"></label>
        <label class="nx-field"><span>Denumire</span><input name="name" required></label>
        <label class="nx-field"><span>Categorie</span><input name="category" value="Meniu"></label>
        <label class="nx-field"><span>Tip</span><select name="course_type"><option value="Preparat">Preparat</option><option value="Băutură">Băutură</option><option value="Desert">Desert</option><option value="Pachet">Pachet</option></select></label>
        <label class="nx-field"><span>Preț</span><input name="price" value="0"></label>
        <label class="nx-field"><span>TVA %</span><input name="vat_percent" value="9"></label>
        <label class="nx-field"><span>Stoc</span><select name="stock_policy"><option value="CONSUM_RETETA">Consum pe rețetă</option><option value="NU_SCADE_STOC">Nu scade stoc</option><option value="PRODUS_STOC">Produs din stoc</option></select></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="DRAFT">Draft</option><option value="BLOCAT">Blocat</option></select></label>
        <label class="nx-field nx-field-wide"><span>Rețetă / ingrediente</span><textarea name="recipe_notes" rows="2" placeholder="ex: blat 1 buc, sos 80g, mozzarella 120g"></textarea></label>
        <label class="nx-field nx-field-wide"><span>Alergeni</span><input name="allergen_notes" placeholder="gluten, lapte"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă în meniu</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Preparat</th><th class="nx-right">Preț</th><th class="nx-right">TVA</th><th>Stoc</th><th>Rețetă</th><th>Alergeni</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title, activePath, companyName, user: options.user, body });
}

function renderNexoraHorecaOrdersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const title = options.title || "Comenzi & KDS";
  const activePath = options.activePath || "/nexora/horeca/orders";
  const intro = options.intro || "Status comandă, totaluri și trecere prin bucătărie/bar.";
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const orderItems = Array.isArray(options.orderItems) ? options.orderItems : [];
  const tables = Array.isArray(options.tables) ? options.tables : [];
  const menuItems = Array.isArray(options.menuItems) ? options.menuItems : [];
  const openOrders = orders.filter((order) => !["ACHITATA", "ANULATA"].includes(String(order.status || "").toUpperCase()));
  const orderRows = rowsOrEmpty(orders, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.order_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.opened_at || "")}</div></td>
      <td>${escapeHtml(row.table_code || row.channel || "-")}</td>
      <td>${escapeHtml(row.waiter_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(money(row.subtotal || 0))}</td>
      <td class="nx-right">${escapeHtml(money(row.total || 0))}</td>
      <td class="nx-right">${escapeHtml(row.items_count || 0)}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/horeca/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="IN_PREPARARE"><button class="nx-btn" type="submit">Bucătărie</button></form>
        <form method="post" action="/nexora/horeca/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="SERVITA"><button class="nx-btn" type="submit">Servită</button></form>
        <form method="post" action="/nexora/horeca/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="ACHITATA"><button class="nx-btn primary" type="submit">Achitată</button></form>
      </td>
    </tr>
  `, "Nu există comenzi.");
  const itemRows = rowsOrEmpty(orderItems, 7, (row) => `
    <tr>
      <td><b>${escapeHtml(row.order_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.table_code || row.channel || "")}</div></td>
      <td>${escapeHtml(row.item_name || "-")}</td>
      <td class="nx-right">${escapeHtml(row.quantity || 0)}</td>
      <td class="nx-right">${escapeHtml(money(row.line_total || 0))}</td>
      <td>${statusBadge(row.kitchen_status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/horeca/order-items/${escapeHtml(row.id)}/status">
          <select name="kitchen_status"><option value="NOU">Nou</option><option value="IN_PREPARARE">În preparare</option><option value="GATA">Gata</option><option value="SERVIT">Servit</option></select>
          <button class="nx-btn" type="submit">KDS</button>
        </form>
      </td>
    </tr>
  `, "Nu există linii pe comenzi.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Comandă nouă</h2><span>sală, bar, takeaway sau delivery</span></div></div>
        <form method="post" action="/nexora/horeca/orders/create" class="nx-form">
          <label class="nx-field"><span>Masă</span><select name="table_id">${tableOptions(tables, "", "Fără masă / takeaway")}</select></label>
          <label class="nx-field"><span>Canal</span><select name="channel"><option value="SALA">Sală</option><option value="BAR">Bar</option><option value="TAKEAWAY">Takeaway</option><option value="DELIVERY">Delivery</option><option value="ROOM_SERVICE">Room service</option></select></label>
          <label class="nx-field"><span>Ospătar / responsabil</span><input name="waiter_name"></label>
          <label class="nx-field"><span>Metodă plată</span><select name="payment_method"><option value="">Neachitat</option><option value="CARD">Card</option><option value="CASH">Cash</option><option value="TRANSFER">Transfer</option></select></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
          <button class="nx-btn primary" type="submit">Deschide comandă</button>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă preparat</h2><span>linie pe comandă și KDS</span></div></div>
        <form method="post" action="/nexora/horeca/order-items/create" class="nx-form">
          <label class="nx-field"><span>Comandă</span><select name="order_id" required>${orderOptions(openOrders)}</select></label>
          <label class="nx-field"><span>Preparat</span><select name="menu_item_id" required>${menuOptions(menuItems)}</select></label>
          <label class="nx-field"><span>Cantitate</span><input name="quantity" value="1"></label>
          <label class="nx-field"><span>Observații bucătărie</span><input name="notes" placeholder="fără ceapă, extra sos"></label>
          <button class="nx-btn primary" type="submit">Adaugă preparat</button>
        </form>
      </section>
    </div>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Masă/Canal</th><th>Responsabil</th><th>Status</th><th class="nx-right">Subtotal</th><th class="nx-right">Total</th><th class="nx-right">Linii</th><th></th></tr></thead><tbody>${orderRows}</tbody></table></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Monitor bucătărie / bar</h1><p>Preparatele nou intrate, în lucru sau gata de servire.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Preparat</th><th class="nx-right">Cant.</th><th class="nx-right">Valoare</th><th>Status KDS</th><th>Note</th><th></th></tr></thead><tbody>${itemRows}</tbody></table></div>
    </section>
  `;
  return shell({ title, activePath, companyName, user: options.user, body });
}

function renderNexoraHorecaOperationalPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const title = options.title || "Restaurant / Horeca";
  const activePath = options.activePath || "/nexora/horeca";
  const description = options.description || "";
  const cards = Array.isArray(options.cards) ? options.cards : [];
  const columns = Array.isArray(options.columns) ? options.columns : [];
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const actionsHtml = options.actionsHtml || "";
  const cardHtml = cards.length ? `
    <section class="nx-kpi-grid">
      ${cards.map((card) => `
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon ${escapeHtml(card.tone || "blue")}">${escapeHtml(card.icon || "H")}</div>
          <div>
            <div class="nx-kpi-label">${escapeHtml(card.label || "")}</div>
            <div class="nx-kpi-value">${escapeHtml(card.value ?? "")}</div>
            ${card.copy ? `<div class="nx-table-sub">${escapeHtml(card.copy)}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </section>
  ` : "";
  const headerCells = columns.map((column) => `<th class="${column.right ? "nx-right" : ""}">${escapeHtml(column.label || "")}</th>`).join("");
  const bodyRows = rowsOrEmpty(rows, columns.length || 1, (row) => `
    <tr>
      ${columns.map((column) => `<td class="${column.right ? "nx-right" : ""}">${column.html ? column.html(row) : escapeHtml(row[column.key] ?? "")}</td>`).join("")}
    </tr>
  `, options.empty || "Nu există înregistrări.");
  const tableHtml = columns.length ? `
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>${escapeHtml(options.tableTitle || title)}</h1><p>${escapeHtml(options.tableDescription || description)}</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>
    </section>
  ` : "";
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
        ${actionsHtml ? `<div class="nx-form-actions">${actionsHtml}</div>` : ""}
      </div>
    </section>
    ${cardHtml}
    ${tableHtml}
  `;
  return shell({ title, activePath, companyName, user: options.user, body });
}

function renderNexoraHorecaReportsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const topItems = Array.isArray(options.topItems) ? options.topItems : [];
  const topRows = rowsOrEmpty(topItems, 4, (row) => `
    <tr>
      <td>${escapeHtml(row.item_name || "-")}</td>
      <td class="nx-right">${escapeHtml(row.qty || 0)}</td>
      <td class="nx-right">${escapeHtml(money(row.total || 0))}</td>
      <td>${escapeHtml(row.category || "-")}</td>
    </tr>
  `, "Nu există vânzări pe preparate.");
  const body = `
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">Z</div><div><div class="nx-kpi-label">Vânzări azi</div><div class="nx-kpi-value">${escapeHtml(money(stats.todaySales || 0))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">L</div><div><div class="nx-kpi-label">Linii servite</div><div class="nx-kpi-value">${escapeHtml(stats.servedItems || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">M</div><div><div class="nx-kpi-label">Grad ocupare mese</div><div class="nx-kpi-value">${escapeHtml(stats.occupiedRate || 0)}%</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">B</div><div><div class="nx-kpi-label">Bon mediu</div><div class="nx-kpi-value">${escapeHtml(money(stats.avgTicket || 0))}</div></div></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Top preparate</h1><p>Cantități și valoare vândută pe meniul Horeca.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Preparat</th><th class="nx-right">Cantitate</th><th class="nx-right">Total</th><th>Categorie</th></tr></thead><tbody>${topRows}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Rapoarte Horeca", activePath: "/nexora/horeca/reports", companyName, user: options.user, body });
}

export {
  renderNexoraHorecaHubPage,
  renderNexoraHorecaMenuPage,
  renderNexoraHorecaOperationalPage,
  renderNexoraHorecaOrdersPage,
  renderNexoraHorecaReportsPage,
  renderNexoraHorecaReservationsPage,
  renderNexoraHorecaTablesPage
};
