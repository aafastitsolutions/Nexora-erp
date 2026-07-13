import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, fmtMoney) {
  if (typeof fmtMoney === "function") return fmtMoney(value || 0);
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} RON`;
}

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

function selected(actual, expected) {
  return String(actual || "").toUpperCase() === expected ? "selected" : "";
}

function statusBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACCEPTATA", "CONFIRMATA", "LIVRATA", "ACTIVA", "ACTIV", "FINALIZATA"].includes(normalized)) return `<span class="nx-status-pill success">${escapeHtml(normalized.toLowerCase())}</span>`;
  if (["NOUA", "PREGATITA", "IN_LUCRU", "PROGRAMATA", "TRIMISA"].includes(normalized)) return `<span class="nx-status-pill warn">${escapeHtml(normalized.toLowerCase())}</span>`;
  if (["ANULATA", "EXPIRATA", "RESPINSA"].includes(normalized)) return `<span class="nx-status-pill danger">${escapeHtml(normalized.toLowerCase())}</span>`;
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase() || "-")}</span>`;
}

function renderSalesNav(activePath) {
  const items = [
    ["General", "/nexora/sales"],
    ["Oferte", "/nexora/quotes"],
    ["Import oferte", "/nexora/sales/import-foldere-oferte"],
    ["Comenzi", "/nexora/orders"],
    ["Clienți", "/nexora/clients"],
    ["Prețuri", "/nexora/sales/prices"],
    ["Discounturi", "/nexora/sales/discounts"],
    ["Contracte", "/nexora/contracts"],
    ["Livrări", "/nexora/deliveries"]
  ];
  return `
    <div class="nx-module-tabs">
      ${items.map(([label, href]) => `<a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function renderSalesShell({ title, companyName, user, currentPath, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath,
    eyebrow: "Vânzări",
    pageTitle: title,
    body: `${renderSalesNav(currentPath)}${body}`
  });
}

function clientOptions(clients = [], selectedId = "") {
  return clients.map((client) => `<option value="${escapeHtml(client.id)}" ${String(client.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(client.name || "-")} ${client.cui ? `(${escapeHtml(client.cui)})` : ""}</option>`).join("");
}

function productOptions(products = []) {
  return products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim())} · ${money(product.price)}</option>`).join("");
}

function orderOptions(orders = []) {
  return orders.map((order) => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.order_number || "-")} · ${escapeHtml(order.client_name || "-")} · ${money(order.total)}</option>`).join("");
}

function renderNexoraSalesHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const recentOrders = Array.isArray(options.recentOrders) ? options.recentOrders : [];
  const recentDeliveries = Array.isArray(options.recentDeliveries) ? options.recentDeliveries : [];
  const fmtMoney = options.fmtMoney;

  const orderRows = recentOrders.map((row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/orders/${escapeHtml(row.id)}">${escapeHtml(row.order_number || "-")}</a></td>
      <td>${escapeHtml(row.client_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
    </tr>
  `).join("");
  const deliveryRows = recentDeliveries.map((row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/deliveries/${escapeHtml(row.id)}">${escapeHtml(row.delivery_number || "-")}</a></td>
      <td>${escapeHtml(row.client_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.awb || "-")}</td>
    </tr>
  `).join("");

  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Vânzări</h1>
          <p>Pipeline comercial, oferte, comenzi, liste de preț, discounturi și livrări, fără flux de facturare.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/orders">Comenzi</a>
          <a class="nx-btn" href="/nexora/quotes">Oferte</a>
          <a class="nx-btn" href="/nexora/deliveries">Livrări</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">Q</div><div><div class="nx-kpi-label">Oferte active</div><div class="nx-kpi-value">${escapeHtml(stats.quotes_open || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">SO</div><div><div class="nx-kpi-label">Comenzi</div><div class="nx-kpi-value">${escapeHtml(stats.orders_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RON</div><div><div class="nx-kpi-label">Valoare comenzi</div><div class="nx-kpi-value">${escapeHtml(money(stats.orders_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DLV</div><div><div class="nx-kpi-label">Livrări deschise</div><div class="nx-kpi-value">${escapeHtml(stats.deliveries_open || 0)}</div></div></div>
    </section>

    <section class="nx-panel" id="import-folder-oferte">
      <div class="nx-panel-head">
        <div>
          <h2>Import folder oferte</h2>
          <span>Dosare organizate pe clienți</span>
        </div>
        <a class="nx-btn" href="/nexora/quotes">Vezi oferte</a>
      </div>

      <form method="post" action="/nexora/sales/import-foldere-oferte" enctype="multipart/form-data" class="nx-form">
        <input type="hidden" name="folder_layout" value="client_folders">
        <label class="nx-field">
          <span>Folder</span>
          <input type="file" name="quote_files" accept=".pdf,.doc,.docx,.xls,.xlsx" webkitdirectory directory multiple required>
        </label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Importă folder</button>
        </div>
      </form>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Comenzi recente</h1><p>Ultimele comenzi comerciale.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Client</th><th>Status</th><th class="nx-right">Total</th></tr></thead><tbody>${orderRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există comenzi.</div></td></tr>`}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Livrări recente</h1><p>Urmărire status, curier și AWB.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Livrare</th><th>Client</th><th>Status</th><th>AWB</th></tr></thead><tbody>${deliveryRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există livrări.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderSalesShell({ title: "Vânzări", companyName, user: options.user, currentPath: "/nexora/sales", body });
}

function renderNexoraSalesOrdersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const quotes = Array.isArray(options.quotes) ? options.quotes : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const quoteOptions = quotes.map((quote) => `<option value="${escapeHtml(quote.id)}">${escapeHtml(quote.quote_number || "-")} · ${escapeHtml(quote.client_name || "-")} · ${money(quote.total, fmtMoney)}</option>`).join("");
  const rowsHtml = rows.map((row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/orders/${escapeHtml(row.id)}">${escapeHtml(row.order_number || "-")}</a><div class="nx-table-sub">${escapeHtml(dateValue(row.order_date) || "-")}</div></td>
      <td><a class="nx-table-main-link" href="/nexora/clients/${escapeHtml(row.client_id)}">${escapeHtml(row.client_name || "-")}</a><div class="nx-table-sub">${escapeHtml(row.client_cui || "")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
      <td class="nx-table-actions"><a class="nx-btn primary" href="/nexora/orders/${escapeHtml(row.id)}">Deschide</a></td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Comanda a fost salvată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">SO</div><div><div class="nx-kpi-label">Comenzi</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Valoare totală</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OPEN</div><div><div class="nx-kpi-label">Deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DLV</div><div><div class="nx-kpi-label">Cu livrare</div><div class="nx-kpi-value">${escapeHtml(stats.delivery_count || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Comandă nouă</h2><span>Din client sau ofertă acceptată</span></div></div>
        <form method="post" action="/nexora/orders/create" class="nx-form">
          <label class="nx-field"><span>Client</span><select name="client_id" required>${clientOptions(clients)}</select></label>
          <label class="nx-field"><span>Ofertă sursă</span><select name="quote_id"><option value="">Fără ofertă</option>${quoteOptions}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data comandă</span><input type="date" name="order_date" value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="nx-field"><span>Termen livrare</span><input type="date" name="due_date"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Persoană contact</span><input name="contact_name"></label>
            <label class="nx-field"><span>Telefon</span><input name="contact_phone"></label>
          </div>
          <label class="nx-field"><span>Adresă livrare</span><textarea name="delivery_address" rows="3"></textarea></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează comanda</button></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre</h2><span>${escapeHtml(rows.length)} rezultate</span></div></div>
        <form method="get" action="/nexora/orders" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="">toate</option><option value="NOUA" ${selected(filters.status, "NOUA")}>nouă</option><option value="CONFIRMATA" ${selected(filters.status, "CONFIRMATA")}>confirmată</option><option value="IN_LUCRU" ${selected(filters.status, "IN_LUCRU")}>în lucru</option><option value="LIVRATA" ${selected(filters.status, "LIVRATA")}>livrată</option><option value="ANULATA" ${selected(filters.status, "ANULATA")}>anulată</option></select></label>
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="comandă, client, CUI"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică</button><a class="nx-btn" href="/nexora/orders">Reset</a></div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Comenzi vânzări</h1><p>Comenzi comerciale urmărite până la livrare, fără creare factură.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Client</th><th>Status</th><th>Termen</th><th class="nx-right">Total</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există comenzi pentru filtrele curente.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderSalesShell({ title: "Comenzi", companyName, user: options.user, currentPath: "/nexora/orders", body });
}

function renderNexoraSalesOrderDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const order = options.order || {};
  const items = Array.isArray(options.items) ? options.items : [];
  const deliveries = Array.isArray(options.deliveries) ? options.deliveries : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const itemRows = items.map((item) => `
    <tr>
      <td><b>${escapeHtml(item.item_name || "-")}</b><div class="nx-table-sub">${escapeHtml(item.sku || "")}</div></td>
      <td class="nx-right">${escapeHtml(item.qty || 0)}</td>
      <td>${escapeHtml(item.unit || "-")}</td>
      <td class="nx-right">${escapeHtml(money(item.unit_price, fmtMoney))}</td>
      <td class="nx-right">${escapeHtml(item.discount_percent || 0)}%</td>
      <td class="nx-right">${escapeHtml(money(item.line_total, fmtMoney))}</td>
    </tr>
  `).join("");
  const deliveryRows = deliveries.map((row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/deliveries/${escapeHtml(row.id)}">${escapeHtml(row.delivery_number || "-")}</a></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.scheduled_date) || "-")}</td>
      <td>${escapeHtml(row.courier || "-")}</td>
      <td>${escapeHtml(row.awb || "-")}</td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Comanda a fost actualizată.</div>` : ""}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(order.order_number || "Comandă")}</h1><p>${escapeHtml(order.client_name || "-")} ${order.client_cui ? "· " + escapeHtml(order.client_cui) : ""}</p></div>
        <div class="nx-form-actions"><a class="nx-btn" href="/nexora/orders">Înapoi</a><a class="nx-btn primary" href="/nexora/deliveries?order_id=${escapeHtml(order.id || "")}">Livrare</a></div>
      </div>
      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card"><div class="nx-kpi-icon blue">ST</div><div><div class="nx-kpi-label">Status</div><div class="nx-kpi-value">${statusBadge(order.status)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(money(order.total, fmtMoney))}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon orange">ITM</div><div><div class="nx-kpi-label">Poziții</div><div class="nx-kpi-value">${escapeHtml(items.length)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DLV</div><div><div class="nx-kpi-label">Livrări</div><div class="nx-kpi-value">${escapeHtml(deliveries.length)}</div></div></div>
      </section>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă poziție</h2><span>produs, serviciu sau linie manuală</span></div></div>
        <form method="post" action="/nexora/orders/${escapeHtml(order.id)}/items" class="nx-form">
          <label class="nx-field"><span>Produs din catalog</span><select name="product_id"><option value="">Linie manuală</option>${productOptions(products)}</select></label>
          <label class="nx-field"><span>Denumire manuală</span><input name="item_name" placeholder="se completează dacă nu alegi produs"></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cantitate</span><input type="number" step="0.01" name="qty" value="1"></label>
            <label class="nx-field"><span>UM</span><input name="unit" placeholder="buc"></label>
            <label class="nx-field"><span>Preț unitar</span><input type="number" step="0.01" name="unit_price" value="0"></label>
            <label class="nx-field"><span>Discount %</span><input type="number" step="0.01" name="discount_percent" value="0"></label>
          </div>
          <label class="nx-field"><span>Observații</span><input name="notes"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă poziția</button></div>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Status comandă</h2><span>fără facturare</span></div></div>
        <form method="post" action="/nexora/orders/${escapeHtml(order.id)}/status" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="NOUA" ${selected(order.status, "NOUA")}>Nouă</option><option value="CONFIRMATA" ${selected(order.status, "CONFIRMATA")}>Confirmată</option><option value="IN_LUCRU" ${selected(order.status, "IN_LUCRU")}>În lucru</option><option value="LIVRATA" ${selected(order.status, "LIVRATA")}>Livrată</option><option value="ANULATA" ${selected(order.status, "ANULATA")}>Anulată</option></select></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează status</button></div>
        </form>
        <div class="nx-table-wrap">
          <table class="nx-table"><tbody>
            <tr><th>Data</th><td>${escapeHtml(dateValue(order.order_date) || "-")}</td></tr>
            <tr><th>Termen</th><td>${escapeHtml(dateValue(order.due_date) || "-")}</td></tr>
            <tr><th>Contact</th><td>${escapeHtml([order.contact_name, order.contact_phone].filter(Boolean).join(" / ") || "-")}</td></tr>
            <tr><th>Adresă livrare</th><td>${escapeHtml(order.delivery_address || "-")}</td></tr>
          </tbody></table>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Poziții comandă</h1><p>Liniile comerciale care vor merge spre livrare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Produs / serviciu</th><th class="nx-right">Cant.</th><th>UM</th><th class="nx-right">Preț</th><th class="nx-right">Disc.</th><th class="nx-right">Total</th></tr></thead><tbody>${itemRows || `<tr><td colspan="6"><div class="nx-empty-state">Nu există poziții.</div></td></tr>`}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Livrări asociate</h1><p>Documente operaționale de livrare pentru această comandă.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Livrare</th><th>Status</th><th>Programată</th><th>Curier</th><th>AWB</th></tr></thead><tbody>${deliveryRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există livrări pentru comandă.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderSalesShell({ title: order.order_number || "Comandă", companyName, user: options.user, currentPath: "/nexora/orders", body });
}

function renderNexoraSalesPricesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const lists = Array.isArray(options.lists) ? options.lists : [];
  const items = Array.isArray(options.items) ? options.items : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";
  const listOptions = lists.map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name || "-")}</option>`).join("");
  const listRows = lists.map((list) => `
    <tr><td><b>${escapeHtml(list.name || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(list.valid_from) || "-")} - ${escapeHtml(dateValue(list.valid_to) || "-")}</div></td><td>${statusBadge(list.status)}</td><td>${escapeHtml(list.currency || "RON")}</td><td class="nx-right">${escapeHtml(list.items_count || 0)}</td></tr>
  `).join("");
  const itemRows = items.map((item) => `
    <tr><td><b>${escapeHtml(item.product_name || "-")}</b><div class="nx-table-sub">${escapeHtml(item.list_name || "-")}</div></td><td>${escapeHtml(item.unit || "-")}</td><td class="nx-right">${escapeHtml(money(item.base_price, fmtMoney))}</td><td class="nx-right">${escapeHtml(money(item.sale_price, fmtMoney))}</td><td class="nx-right">${escapeHtml(item.min_qty || 1)}</td></tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Lista de preț a fost actualizată.</div>` : ""}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Listă de preț nouă</h2><span>contractuală, standard sau promoțională</span></div></div>
        <form method="post" action="/nexora/sales/prices/lists/create" class="nx-form">
          <label class="nx-field"><span>Nume listă</span><input name="name" required placeholder="Prețuri standard 2026"></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label><label class="nx-field"><span>Status</span><select name="status"><option value="ACTIVA">Activă</option><option value="DRAFT">Draft</option><option value="EXPIRATA">Expirată</option></select></label></div>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Valabil de la</span><input type="date" name="valid_from"></label><label class="nx-field"><span>Valabil până la</span><input type="date" name="valid_to"></label></div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează lista</button></div>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă preț</h2><span>preț pe produs și cantitate minimă</span></div></div>
        <form method="post" action="/nexora/sales/prices/items/create" class="nx-form">
          <label class="nx-field"><span>Listă</span><select name="price_list_id" required>${listOptions}</select></label>
          <label class="nx-field"><span>Produs</span><select name="product_id" required>${productOptions(products)}</select></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Preț vânzare</span><input type="number" step="0.01" name="sale_price" value="0"></label><label class="nx-field"><span>Cantitate minimă</span><input type="number" step="0.01" name="min_qty" value="1"></label></div>
          <label class="nx-field"><span>Observații</span><input name="notes"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă prețul</button></div>
        </form>
      </section>
    </div>
    <div class="nx-two-column-grid">
      <section class="nx-content-card"><div class="nx-section-head"><div><h1>Liste de preț</h1><p>Seturi active pentru ofertare și comenzi.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Listă</th><th>Status</th><th>Monedă</th><th class="nx-right">Poziții</th></tr></thead><tbody>${listRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există liste de preț.</div></td></tr>`}</tbody></table></div></section>
      <section class="nx-content-card"><div class="nx-section-head"><div><h1>Prețuri produse</h1><p>Prețuri comerciale pe produs.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Produs</th><th>UM</th><th class="nx-right">Preț bază</th><th class="nx-right">Preț vânzare</th><th class="nx-right">Min.</th></tr></thead><tbody>${itemRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există prețuri definite.</div></td></tr>`}</tbody></table></div></section>
    </div>
  `;

  return renderSalesShell({ title: "Prețuri", companyName, user: options.user, currentPath: "/nexora/sales/prices", body });
}

function renderNexoraSalesDiscountsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const ok = options.ok || "";
  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.notes || "")}</div></td>
      <td>${escapeHtml(row.discount_type || "-")}</td>
      <td class="nx-right">${escapeHtml(row.discount_type === "VALOARE" ? money(row.discount_value, options.fmtMoney) : `${Number(row.discount_value || 0)}%`)}</td>
      <td>${escapeHtml(row.target_type || "-")} ${row.target_ref ? `· ${escapeHtml(row.target_ref)}` : ""}</td>
      <td>${escapeHtml(dateValue(row.valid_from) || "-")} - ${escapeHtml(dateValue(row.valid_to) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `).join("");
  const body = `
    ${ok ? `<div class="nx-alert success">Discountul a fost salvat.</div>` : ""}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Discount nou</h2><span>regulă comercială sau campanie</span></div></div>
        <form method="post" action="/nexora/sales/discounts/create" class="nx-form">
          <label class="nx-field"><span>Nume campanie</span><input name="name" required placeholder="Promoție Q2"></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Tip discount</span><select name="discount_type"><option value="PROCENT">Procent</option><option value="VALOARE">Valoare fixă</option></select></label><label class="nx-field"><span>Valoare</span><input type="number" step="0.01" name="discount_value" value="0"></label></div>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Aplicare</span><select name="target_type"><option value="GLOBAL">Global</option><option value="CLIENT">Client</option><option value="PRODUS">Produs</option><option value="CATEGORIE">Categorie</option></select></label><label class="nx-field"><span>Referință</span><input name="target_ref" placeholder="CUI / cod produs / categorie"></label></div>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>De la</span><input type="date" name="valid_from"></label><label class="nx-field"><span>Până la</span><input type="date" name="valid_to"></label></div>
          <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="DRAFT">Draft</option><option value="EXPIRAT">Expirat</option></select></label>
          <label class="nx-check-field"><input type="checkbox" name="combinable" value="1"><span>Se poate combina cu alte discounturi</span></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează discount</button></div>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Discounturi active</h1><p>Reguli comerciale folosite la negociere și ofertare.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Campanie</th><th>Tip</th><th class="nx-right">Valoare</th><th>Aplicare</th><th>Perioadă</th><th>Status</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există discounturi.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;
  return renderSalesShell({ title: "Discounturi", companyName, user: options.user, currentPath: "/nexora/sales/discounts", body });
}

function renderNexoraSalesDeliveriesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";
  const rowsHtml = rows.map((row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/deliveries/${escapeHtml(row.id)}">${escapeHtml(row.delivery_number || "-")}</a><div class="nx-table-sub">${escapeHtml(dateValue(row.scheduled_date) || "-")}</div></td>
      <td>${escapeHtml(row.order_number || "-")}</td>
      <td>${escapeHtml(row.client_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.courier || "-")}</td>
      <td>${escapeHtml(row.awb || "-")}</td>
      <td class="nx-table-actions"><a class="nx-btn primary" href="/nexora/deliveries/${escapeHtml(row.id)}">Deschide</a></td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Livrarea a fost salvată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DLV</div><div><div class="nx-kpi-label">Livrări</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OPEN</div><div><div class="nx-kpi-label">Deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Livrate</div><div class="nx-kpi-value">${escapeHtml(stats.done_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">AWB</div><div><div class="nx-kpi-label">Cu AWB</div><div class="nx-kpi-value">${escapeHtml(stats.awb_count || 0)}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Livrare nouă</h2><span>legată de comandă sau client</span></div></div>
        <form method="post" action="/nexora/deliveries/create" class="nx-form">
          <label class="nx-field"><span>Comandă</span><select name="order_id"><option value="">Fără comandă</option>${orderOptions(orders)}</select></label>
          <label class="nx-field"><span>Client</span><select name="client_id"><option value="">Din comandă</option>${clientOptions(clients)}</select></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Programată</span><input type="date" name="scheduled_date"></label><label class="nx-field"><span>Status</span><select name="status"><option value="PREGATITA">Pregătită</option><option value="IN_TRANZIT">În tranzit</option><option value="LIVRATA">Livrată</option><option value="ANULATA">Anulată</option></select></label></div>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Curier</span><input name="courier"></label><label class="nx-field"><span>AWB</span><input name="awb"></label></div>
          <label class="nx-field"><span>Adresă livrare</span><textarea name="delivery_address" rows="3"></textarea></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Contact</span><input name="contact_name"></label><label class="nx-field"><span>Telefon</span><input name="contact_phone"></label></div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează livrarea</button></div>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre</h2><span>${escapeHtml(rows.length)} rezultate</span></div></div>
        <form method="get" action="/nexora/deliveries" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="">toate</option><option value="PREGATITA" ${selected(filters.status, "PREGATITA")}>pregătite</option><option value="IN_TRANZIT" ${selected(filters.status, "IN_TRANZIT")}>în tranzit</option><option value="LIVRATA" ${selected(filters.status, "LIVRATA")}>livrate</option><option value="ANULATA" ${selected(filters.status, "ANULATA")}>anulate</option></select></label>
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="livrare, comandă, client, AWB"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică</button><a class="nx-btn" href="/nexora/deliveries">Reset</a></div>
        </form>
      </section>
    </div>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Livrări</h1><p>Planificare, curier, AWB și confirmare livrare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Livrare</th><th>Comandă</th><th>Client</th><th>Status</th><th>Curier</th><th>AWB</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există livrări.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderSalesShell({ title: "Livrări", companyName, user: options.user, currentPath: "/nexora/deliveries", body });
}

function renderNexoraSalesDeliveryDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const delivery = options.delivery || {};
  const items = Array.isArray(options.items) ? options.items : [];
  const orderItems = Array.isArray(options.orderItems) ? options.orderItems : [];
  const ok = options.ok || "";
  const orderItemOptions = orderItems.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.item_name || "-")} · ${escapeHtml(item.qty || 0)} ${escapeHtml(item.unit || "")}</option>`).join("");
  const rowsHtml = items.map((item) => `<tr><td><b>${escapeHtml(item.item_name || "-")}</b></td><td class="nx-right">${escapeHtml(item.qty || 0)}</td><td>${escapeHtml(item.unit || "-")}</td><td>${escapeHtml(item.notes || "")}</td></tr>`).join("");
  const body = `
    ${ok ? `<div class="nx-alert success">Livrarea a fost actualizată.</div>` : ""}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(delivery.delivery_number || "Livrare")}</h1><p>${escapeHtml(delivery.client_name || "-")} ${delivery.order_number ? "· " + escapeHtml(delivery.order_number) : ""}</p></div>
        <div class="nx-form-actions"><a class="nx-btn" href="/nexora/deliveries">Înapoi</a>${delivery.order_id ? `<a class="nx-btn primary" href="/nexora/orders/${escapeHtml(delivery.order_id)}">Comandă</a>` : ""}</div>
      </div>
      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card"><div class="nx-kpi-icon blue">ST</div><div><div class="nx-kpi-label">Status</div><div class="nx-kpi-value">${statusBadge(delivery.status)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon green">AWB</div><div><div class="nx-kpi-label">AWB</div><div class="nx-kpi-value">${escapeHtml(delivery.awb || "-")}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon orange">CUR</div><div><div class="nx-kpi-label">Curier</div><div class="nx-kpi-value">${escapeHtml(delivery.courier || "-")}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon purple">ITM</div><div><div class="nx-kpi-label">Poziții</div><div class="nx-kpi-value">${escapeHtml(items.length)}</div></div></div>
      </section>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Actualizează livrarea</h2><span>status, curier și AWB</span></div></div>
        <form method="post" action="/nexora/deliveries/${escapeHtml(delivery.id)}/update" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="PREGATITA" ${selected(delivery.status, "PREGATITA")}>Pregătită</option><option value="IN_TRANZIT" ${selected(delivery.status, "IN_TRANZIT")}>În tranzit</option><option value="LIVRATA" ${selected(delivery.status, "LIVRATA")}>Livrată</option><option value="ANULATA" ${selected(delivery.status, "ANULATA")}>Anulată</option></select></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Curier</span><input name="courier" value="${escapeHtml(delivery.courier || "")}"></label><label class="nx-field"><span>AWB</span><input name="awb" value="${escapeHtml(delivery.awb || "")}"></label></div>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Programată</span><input type="date" name="scheduled_date" value="${escapeHtml(dateValue(delivery.scheduled_date))}"></label><label class="nx-field"><span>Livrată la</span><input type="date" name="delivered_at" value="${escapeHtml(dateValue(delivery.delivered_at))}"></label></div>
          <label class="nx-field"><span>Adresă</span><textarea name="delivery_address" rows="3">${escapeHtml(delivery.delivery_address || "")}</textarea></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3">${escapeHtml(delivery.notes || "")}</textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează</button></div>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă poziție livrată</h2><span>din comandă sau manual</span></div></div>
        <form method="post" action="/nexora/deliveries/${escapeHtml(delivery.id)}/items" class="nx-form">
          <label class="nx-field"><span>Poziție comandă</span><select name="order_item_id"><option value="">Manual</option>${orderItemOptions}</select></label>
          <label class="nx-field"><span>Denumire manuală</span><input name="item_name"></label>
          <div class="nx-two-column-grid compact"><label class="nx-field"><span>Cantitate</span><input type="number" step="0.01" name="qty" value="1"></label><label class="nx-field"><span>UM</span><input name="unit" placeholder="buc"></label></div>
          <label class="nx-field"><span>Observații</span><input name="notes"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă</button></div>
        </form>
      </section>
    </div>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Poziții livrare</h1><p>Bunuri sau servicii marcate pentru livrare.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Poziție</th><th class="nx-right">Cantitate</th><th>UM</th><th>Observații</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="4"><div class="nx-empty-state">Nu există poziții pe livrare.</div></td></tr>`}</tbody></table></div></section>
  `;
  return renderSalesShell({ title: delivery.delivery_number || "Livrare", companyName, user: options.user, currentPath: "/nexora/deliveries", body });
}

export {
  renderNexoraSalesDeliveryDetailPage,
  renderNexoraSalesDeliveriesPage,
  renderNexoraSalesDiscountsPage,
  renderNexoraSalesHubPage,
  renderNexoraSalesOrderDetailPage,
  renderNexoraSalesOrdersPage,
  renderNexoraSalesPricesPage,
  renderSalesNav
};
