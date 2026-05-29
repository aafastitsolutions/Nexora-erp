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

function selected(actual, expected) {
  return String(actual || "").toUpperCase() === expected ? "selected" : "";
}

function statusBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["IN_STOC", "ACTIV", "APPLIED", "RECEPTIONAT", "FINALIZAT", "AMBALAT", "LIVRAT"].includes(normalized)) return `<span class="nx-status-pill success">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  if (["ALOCAT", "DRAFT", "PREGATIT", "IN_TRANZIT", "IN_LUCRU", "PARTIAL", "REZERVAT"].includes(normalized)) return `<span class="nx-status-pill warn">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  if (["CASAT", "RESPINS", "ANULAT", "EXPIRAT"].includes(normalized)) return `<span class="nx-status-pill danger">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase().replaceAll("_", " ") || "-")}</span>`;
}

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

function renderInventoryNav(activePath) {
  const items = [
    ["Stocuri", "/nexora/inventory"],
    ["Registru active", "/nexora/inventory/assets"],
    ["Proiecte inventar", "/nexora/inventory/projects"],
    ["Produse", "/nexora/products"],
    ["Depozite", "/nexora/inventory/warehouses"],
    ["Loturi / Serii", "/nexora/inventory/lots"],
    ["Transferuri", "/nexora/inventory/transfers"],
    ["Inventar", "/nexora/inventory/counts"],
    ["Recepții", "/nexora/inventory/receipts"],
    ["Picking / Packing", "/nexora/inventory/picking"],
    ["Coduri de bare", "/nexora/inventory/barcodes"]
  ];
  return `
    <div class="nx-module-tabs">
      ${items.map(([label, href]) => `<a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function renderInventoryShell({ title, companyName, user, currentPath, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath,
    eyebrow: "Inventar & Gestiune",
    pageTitle: title,
    body: `${renderInventoryNav(currentPath)}${body}`
  });
}

function assetTypeBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "MIJLOC_FIX"
    ? `<span class="nx-status-pill warn">mijloc fix</span>`
    : `<span class="nx-status-pill neutral">obiect inventar</span>`;
}

function warehouseOptions(warehouses = [], selectedId = "", emptyLabel = "Fără depozit") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...warehouses.map((warehouse) => `<option value="${escapeHtml(warehouse.id)}" ${String(warehouse.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(warehouse.warehouse_code || "-")} · ${escapeHtml(warehouse.name || "-")}</option>`)
  ].join("");
}

function productOptions(products = [], selectedId = "", emptyLabel = "Linie manuală") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...products.map((product) => `<option value="${escapeHtml(product.id)}" ${String(product.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim() || "-")} · ${escapeHtml(product.unit || "buc")}</option>`)
  ].join("");
}

function stockItemOptions(items = [], selectedId = "", emptyLabel = "Linie manuală") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...items.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.item_code || "-")} · ${escapeHtml(item.item_name || "-")} · ${escapeHtml(item.quantity || 0)} ${escapeHtml(item.unit || "buc")}</option>`)
  ].join("");
}

function varianceBadge(value) {
  const amount = Number(value || 0);
  if (amount > 0) return `<span class="nx-status-pill success">plus ${escapeHtml(amount)}</span>`;
  if (amount < 0) return `<span class="nx-status-pill danger">minus ${escapeHtml(Math.abs(amount))}</span>`;
  return `<span class="nx-status-pill neutral">ok</span>`;
}

function assetOptions(assets = [], selectedId = "", emptyLabel = "Fără activ") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...assets.map((asset) => `<option value="${escapeHtml(asset.id)}" ${String(asset.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(asset.asset_code || "-")} · ${escapeHtml(asset.asset_name || "-")}</option>`)
  ].join("");
}

function lotOptions(lots = [], selectedId = "", emptyLabel = "Fără lot") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...lots.map((lot) => `<option value="${escapeHtml(lot.id)}" ${String(lot.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(lot.lot_number || "-")} · ${escapeHtml(lot.item_name || "-")}</option>`)
  ].join("");
}

function documentOptions(rows = [], idKey, numberKey, selectedId = "", emptyLabel = "Alege document") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...rows.map((row) => `<option value="${escapeHtml(row[idKey])}" ${String(row[idKey]) === String(selectedId) ? "selected" : ""}>${escapeHtml(row[numberKey] || "-")} · ${escapeHtml(row.status || "DRAFT")}</option>`)
  ].join("");
}

function assetForm(asset = {}, action = "/inventory/assets", submitLabel = "Adaugă activ") {
  return `
    <form method="post" action="${escapeHtml(action)}" class="nx-form">
      <input type="hidden" name="return_to" value="nexora">
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Cod activ</span><input name="asset_code" value="${escapeHtml(asset.asset_code || "")}" required placeholder="INV-001"></label>
        <label class="nx-field"><span>Denumire</span><input name="asset_name" value="${escapeHtml(asset.asset_name || "")}" required placeholder="Laptop Dell Latitude"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Tip</span><select name="asset_type"><option value="MIJLOC_FIX" ${selected(asset.asset_type, "MIJLOC_FIX")}>Mijloc fix</option><option value="OBIECT_INVENTAR" ${selected(asset.asset_type || "OBIECT_INVENTAR", "OBIECT_INVENTAR")}>Obiect mobil</option></select></label>
        <label class="nx-field"><span>Categorie</span><input name="category" value="${escapeHtml(asset.category || "MOBIL")}"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Unitate</span><input name="unit" value="${escapeHtml(asset.unit || "buc")}"></label>
        <label class="nx-field"><span>Cantitate scriptică</span><input type="number" step="0.01" name="quantity_scriptic" value="${escapeHtml(asset.quantity_scriptic ?? 1)}"></label>
        <label class="nx-field"><span>Prag minim</span><input type="number" step="0.01" name="minimum_quantity" value="${escapeHtml(asset.minimum_quantity ?? 0)}"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="IN_STOC" ${selected(asset.status || "IN_STOC", "IN_STOC")}>În stoc</option><option value="ALOCAT" ${selected(asset.status, "ALOCAT")}>Alocat</option><option value="IN_SERVICE" ${selected(asset.status, "IN_SERVICE")}>În service</option><option value="CASAT" ${selected(asset.status, "CASAT")}>Casat</option></select></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Locație</span><input name="location" value="${escapeHtml(asset.location || "")}" placeholder="Depozit / birou / auto"></label>
        <label class="nx-field"><span>Serie / SN</span><input name="serial_number" value="${escapeHtml(asset.serial_number || "")}"></label>
        <label class="nx-field"><span>Data achiziției</span><input type="date" name="purchase_date" value="${escapeHtml(asset.purchase_date || "")}"></label>
        <label class="nx-field"><span>Valoare achiziție</span><input type="number" step="0.01" name="purchase_value" value="${escapeHtml(asset.purchase_value ?? 0)}"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Furnizor</span><input name="supplier_name" value="${escapeHtml(asset.supplier_name || "")}"></label>
        <label class="nx-field"><span>Nr. factură</span><input name="invoice_number" value="${escapeHtml(asset.invoice_number || "")}"></label>
      </div>
      <label class="nx-field"><span>Observații</span><textarea name="notes" rows="4">${escapeHtml(asset.notes || "")}</textarea></label>
      <div class="nx-form-actions">
        <button class="nx-btn primary" type="submit">${escapeHtml(submitLabel)}</button>
      </div>
    </form>
  `;
}

function projectForm(project = {}, action = "/inventory/projects", submitLabel = "Creează proiect") {
  return `
    <form method="post" action="${escapeHtml(action)}" class="nx-form">
      <input type="hidden" name="return_to" value="nexora">
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Cod proiect</span><input name="project_code" value="${escapeHtml(project.project_code || "")}" required placeholder="PRJ-001"></label>
        <label class="nx-field"><span>Denumire</span><input name="project_name" value="${escapeHtml(project.project_name || "")}" required placeholder="Sediu client X"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Client</span><input name="client_name" value="${escapeHtml(project.client_name || "")}"></label>
        <label class="nx-field"><span>Locație</span><input name="location" value="${escapeHtml(project.location || "")}"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Data start</span><input type="date" name="start_date" value="${escapeHtml(project.start_date || "")}"></label>
        <label class="nx-field"><span>Data final</span><input type="date" name="end_date" value="${escapeHtml(project.end_date || "")}"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV" ${selected(project.status || "ACTIV", "ACTIV")}>Activ</option><option value="INCHIS" ${selected(project.status, "INCHIS")}>Închis</option></select></label>
      </div>
      <label class="nx-field"><span>Observații</span><textarea name="notes" rows="4">${escapeHtml(project.notes || "")}</textarea></label>
      <div class="nx-form-actions">
        <button class="nx-btn primary" type="submit">${escapeHtml(submitLabel)}</button>
      </div>
    </form>
  `;
}

function renderNexoraInventoryAssetsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";
  const fmtMoney = options.fmtMoney;

  const okMessages = {
    created: "Activul a fost adăugat.",
    saved: "Activul a fost actualizat.",
    deleted: "Activul a fost șters."
  };

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td><span class="nx-status-pill neutral">${escapeHtml(row.asset_code || "-")}</span></td>
        <td>
          <a class="nx-table-main-link" href="/nexora/inventory/assets/${escapeHtml(row.id)}">${escapeHtml(row.asset_name || "-")}</a>
          <div class="nx-table-sub">${escapeHtml(row.serial_number || row.notes || "fără serie / observații")}</div>
        </td>
        <td>${assetTypeBadge(row.asset_type)}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(row.location || "-")}</td>
        <td>${escapeHtml(row.quantity_scriptic || 0)} ${escapeHtml(row.unit || "buc")}</td>
        <td>${escapeHtml(row.minimum_quantity || 0)}</td>
        <td class="nx-right">${escapeHtml(money(row.purchase_value, fmtMoney))}</td>
        <td class="nx-table-actions">
          <a class="nx-btn" href="/nexora/inventory/assets/${escapeHtml(row.id)}">Editează</a>
          <form method="post" action="/inventory/assets/${escapeHtml(row.id)}/delete" onsubmit="return confirm('Ștergi activul din inventar?')">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn danger" type="submit">Șterge</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="9"><div class="nx-empty-state">Nu există active pentru criteriile curente.</div></td></tr>`;

  const body = `
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">A</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.total_assets || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">MF</div><div><div class="nx-kpi-label">Mijloace fixe</div><div class="nx-kpi-value">${escapeHtml(stats.fixed_assets || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">OBJ</div><div><div class="nx-kpi-label">Obiecte mobile</div><div class="nx-kpi-value">${escapeHtml(stats.mobile_assets || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">MIN</div><div><div class="nx-kpi-label">Sub minim</div><div class="nx-kpi-value">${escapeHtml(stats.low_stock_assets || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Activ nou</h2>
            <span>Registru active</span>
          </div>
        </div>
        ${assetForm()}
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Filtre</h2>
            <span>${escapeHtml(rows.length)} rezultate</span>
          </div>
        </div>
        <form method="get" action="/nexora/inventory/assets" class="nx-form">
          <label class="nx-field"><span>Căutare</span><input name="search" value="${escapeHtml(filters.search || "")}" placeholder="cod, denumire, locație, serie"></label>
          <label class="nx-field"><span>Tip</span><select name="type"><option value="">Toate</option><option value="MIJLOC_FIX" ${selected(filters.type, "MIJLOC_FIX")}>Mijloace fixe</option><option value="OBIECT_INVENTAR" ${selected(filters.type, "OBIECT_INVENTAR")}>Obiecte mobile</option></select></label>
          <label class="nx-field"><span>Status</span><select name="status"><option value="">Toate</option><option value="IN_STOC" ${selected(filters.status, "IN_STOC")}>În stoc</option><option value="ALOCAT" ${selected(filters.status, "ALOCAT")}>Alocat</option><option value="IN_SERVICE" ${selected(filters.status, "IN_SERVICE")}>În service</option><option value="CASAT" ${selected(filters.status, "CASAT")}>Casat</option></select></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Filtrează</button>
            <a class="nx-btn" href="/nexora/inventory/assets">Reset</a>
            <a class="nx-btn" href="/nexora/inventory">Inventar</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Registru active</h1>
          <p>Mijloace fixe și obiecte mobile, cu stoc scriptic, praguri și locații.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/inventory/projects">Proiecte inventar</a>
          <a class="nx-btn" href="/nexora/inventory/reports">Rapoarte</a>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Cod</th><th>Denumire</th><th>Tip</th><th>Status</th><th>Locație</th><th>Scriptic</th><th>Minim</th><th class="nx-right">Valoare</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderInventoryShell({
    title: "Registru active",
    companyName,
    user: options.user,
    currentPath: "/nexora/inventory/assets",
    body
  });
}

function renderNexoraInventoryAssetDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const asset = options.asset || {};
  const usage = options.usage || {};
  const adjustments = options.adjustments || {};
  const ok = options.ok || "";

  const body = `
    ${ok ? `<div class="nx-alert success">Activul a fost actualizat.</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(asset.asset_name || "Activ inventar")}</h1>
          <p>${escapeHtml(asset.asset_code || "fără cod")} · ${assetTypeBadge(asset.asset_type)} · ${statusBadge(asset.status)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/inventory/assets">Înapoi</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">QTY</div><div><div class="nx-kpi-label">Scriptic</div><div class="nx-kpi-value">${escapeHtml(asset.quantity_scriptic || 0)} ${escapeHtml(asset.unit || "buc")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">MIN</div><div><div class="nx-kpi-label">Prag minim</div><div class="nx-kpi-value">${escapeHtml(asset.minimum_quantity || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">PRJ</div><div><div class="nx-kpi-label">Alocări proiecte</div><div class="nx-kpi-value">${escapeHtml(usage.project_links || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ADJ</div><div><div class="nx-kpi-label">Corecții</div><div class="nx-kpi-value">${escapeHtml(adjustments.adjustment_links || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Editare activ</h2>
            <span>Date registru</span>
          </div>
        </div>
        ${assetForm(asset, `/inventory/assets/${escapeHtml(asset.id)}`, "Salvează")}
        <form method="post" action="/inventory/assets/${escapeHtml(asset.id)}/delete" onsubmit="return confirm('Ștergi activul din inventar?')" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <div class="nx-form-actions"><button class="nx-btn danger" type="submit">Șterge activul</button></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Trasabilitate</h2>
            <span>Legături active</span>
          </div>
        </div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <tbody>
              <tr><th>Locație</th><td>${escapeHtml(asset.location || "-")}</td></tr>
              <tr><th>Serie / SN</th><td>${escapeHtml(asset.serial_number || "-")}</td></tr>
              <tr><th>Furnizor</th><td>${escapeHtml(asset.supplier_name || "-")}</td></tr>
              <tr><th>Nr. factură</th><td>${escapeHtml(asset.invoice_number || "-")}</td></tr>
              <tr><th>Observații</th><td>${escapeHtml(asset.notes || "-")}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  return renderInventoryShell({
    title: asset.asset_name || "Activ inventar",
    companyName,
    user: options.user,
    currentPath: "/nexora/inventory/assets",
    body
  });
}

function renderNexoraInventoryProjectsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const ok = options.ok || "";

  const okMessages = {
    created: "Proiectul a fost creat.",
    deleted: "Proiectul a fost șters."
  };

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/nexora/inventory/projects/${escapeHtml(row.id)}">${escapeHtml(row.project_name || "-")}</a>
          <div class="nx-table-sub">${escapeHtml(row.project_code || "-")} · ${escapeHtml(row.location || "fără locație")}</div>
        </td>
        <td>${escapeHtml(row.client_name || "-")}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(row.allocated_lines || 0)}</td>
        <td>${escapeHtml(row.active_quantity || 0)}</td>
        <td class="nx-table-actions">
          <a class="nx-btn" href="/nexora/inventory/projects/${escapeHtml(row.id)}">Deschide</a>
          <a class="nx-btn" href="/nexora/inventory/projects/${escapeHtml(row.id)}/edit">Editează</a>
          <form method="post" action="/inventory/projects/${escapeHtml(row.id)}/delete" onsubmit="return confirm('Ștergi proiectul și alocările lui?')">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn danger" type="submit">Șterge</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există proiecte de inventar încă.</div></td></tr>`;

  const body = `
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PRJ</div><div><div class="nx-kpi-label">Proiecte</div><div class="nx-kpi-value">${escapeHtml(stats.total_projects || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.active_projects || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">LIN</div><div><div class="nx-kpi-label">Linii alocate</div><div class="nx-kpi-value">${escapeHtml(stats.allocated_lines || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">QTY</div><div><div class="nx-kpi-label">Cantitate activă</div><div class="nx-kpi-value">${escapeHtml(stats.active_quantity || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Proiect nou</h2>
            <span>Alocare inventar</span>
          </div>
        </div>
        ${projectForm()}
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Scurtături</h2>
            <span>Inventar</span>
          </div>
        </div>
        <div class="nx-shortcuts">
          <a href="/nexora/inventory/assets">Registru active</a>
          <a href="/nexora/products">Produse</a>
          <a href="/nexora/inventory/counts">Numărări</a>
          <a href="/nexora/inventory/reports">Rapoarte</a>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Inventar pe proiect</h1>
          <p>Alocări de active pe proiect, cantități returnate și poziții rămase în teren.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Proiect</th><th>Client</th><th>Status</th><th>Articole</th><th>Cantitate activă</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderInventoryShell({
    title: "Inventar pe proiect",
    companyName,
    user: options.user,
    currentPath: "/nexora/inventory/projects",
    body
  });
}

function renderNexoraInventoryProjectDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const project = options.project || {};
  const allocations = Array.isArray(options.allocations) ? options.allocations : [];
  const assets = Array.isArray(options.assets) ? options.assets : [];
  const ok = options.ok || "";

  const rowsHtml = allocations.length
    ? allocations.map((row) => `
      <tr>
        <td><b>${escapeHtml(row.asset_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.asset_code || "-")}</div></td>
        <td>${escapeHtml(row.quantity_allocated || 0)}</td>
        <td>${escapeHtml(row.quantity_returned || 0)}</td>
        <td>${escapeHtml(Number(row.quantity_allocated || 0) - Number(row.quantity_returned || 0))}</td>
        <td>${escapeHtml(row.assigned_at || "-")}</td>
        <td>${escapeHtml(row.notes || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există active alocate încă pe proiect.</div></td></tr>`;

  const body = `
    ${ok ? `<div class="nx-alert success">${escapeHtml(ok === "item_added" ? "Activul a fost alocat pe proiect." : "Proiectul a fost actualizat.")}</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(project.project_name || "Inventar proiect")}</h1>
          <p>${escapeHtml(project.project_code || "-")} · ${escapeHtml(project.client_name || "client nesetat")} · ${statusBadge(project.status)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/inventory/projects">Înapoi</a>
          <a class="nx-btn" href="/nexora/inventory/projects/${escapeHtml(project.id)}/edit">Editează</a>
        </div>
      </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Adaugă inventar</h2>
            <span>Alocare pe proiect</span>
          </div>
        </div>
        <form method="post" action="/inventory/projects/${escapeHtml(project.id)}/items" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <label class="nx-field">
            <span>Activ</span>
            <select name="asset_id" required>
              <option value="">Selectează activ</option>
              ${assets.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.asset_code)} · ${escapeHtml(asset.asset_name)} · ${escapeHtml(asset.quantity_scriptic || 0)} ${escapeHtml(asset.unit || "buc")}</option>`).join("")}
            </select>
          </label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cantitate alocată</span><input type="number" step="0.01" name="quantity_allocated" value="1"></label>
            <label class="nx-field"><span>Cantitate returnată</span><input type="number" step="0.01" name="quantity_returned" value="0"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="4"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă pe proiect</button></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Detalii proiect</h2>
            <span>${escapeHtml(project.location || "fără locație")}</span>
          </div>
        </div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <tbody>
              <tr><th>Start</th><td>${escapeHtml(project.start_date || "-")}</td></tr>
              <tr><th>Final</th><td>${escapeHtml(project.end_date || "-")}</td></tr>
              <tr><th>Observații</th><td>${escapeHtml(project.notes || "-")}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Alocări inventar</h1>
          <p>Tot ce s-a luat pe acest proiect și ce mai este în teren.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Activ</th><th>Alocat</th><th>Returnat</th><th>Rămas</th><th>Data</th><th>Observații</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderInventoryShell({
    title: project.project_name || "Inventar proiect",
    companyName,
    user: options.user,
    currentPath: "/nexora/inventory/projects",
    body
  });
}

function renderNexoraInventoryProjectEditPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const project = options.project || {};
  const allocationStats = options.allocationStats || {};
  const ok = options.ok || "";

  const body = `
    ${ok ? `<div class="nx-alert success">Proiectul a fost actualizat.</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(project.project_name || "Editare proiect")}</h1>
          <p>${escapeHtml(project.project_code || "-")} · ${statusBadge(project.status)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/inventory/projects/${escapeHtml(project.id)}">Detalii</a>
          <a class="nx-btn" href="/nexora/inventory/projects">Proiecte</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">LIN</div><div><div class="nx-kpi-label">Linii inventar</div><div class="nx-kpi-value">${escapeHtml(allocationStats.total_lines || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">QTY</div><div><div class="nx-kpi-label">Cantitate activă</div><div class="nx-kpi-value">${escapeHtml(allocationStats.active_qty || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      ${projectForm(project, `/inventory/projects/${escapeHtml(project.id)}`, "Salvează proiectul")}
      <form method="post" action="/inventory/projects/${escapeHtml(project.id)}/delete" onsubmit="return confirm('Ștergi proiectul și alocările lui?')" class="nx-form">
        <input type="hidden" name="return_to" value="nexora">
        <div class="nx-form-actions"><button class="nx-btn danger" type="submit">Șterge proiectul</button></div>
      </form>
    </section>
  `;

  return renderInventoryShell({
    title: project.project_name || "Editare proiect",
    companyName,
    user: options.user,
    currentPath: "/nexora/inventory/projects",
    body
  });
}

function renderNexoraInventoryStockPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const stats = options.stats || {};
  const ok = options.ok || "";
  const fmtMoney = options.fmtMoney;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.item_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.item_code || "-")} · ${escapeHtml(row.bin_location || "fără raft")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "Fără depozit")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.quantity || 0)} ${escapeHtml(row.unit || "buc")}</td>
      <td class="nx-right">${escapeHtml(row.reserved_quantity || 0)}</td>
      <td class="nx-right">${escapeHtml(row.minimum_quantity || 0)}</td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Stocul a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">SKU</div><div><div class="nx-kpi-label">Poziții stoc</div><div class="nx-kpi-value">${escapeHtml(stats.total_items || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">QTY</div><div><div class="nx-kpi-label">Cantitate totală</div><div class="nx-kpi-value">${escapeHtml(stats.total_qty || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RES</div><div><div class="nx-kpi-label">Rezervat</div><div class="nx-kpi-value">${escapeHtml(stats.reserved_qty || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">MIN</div><div><div class="nx-kpi-label">Sub minim</div><div class="nx-kpi-value">${escapeHtml(stats.low_stock || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Poziție stoc nouă</h2><span>Produs sau linie manuală</span></div></div>
        <form method="post" action="/nexora/inventory/stock/create" class="nx-form">
          <label class="nx-field"><span>Depozit</span><select name="warehouse_id">${warehouseOptions(warehouses, "", "Alege depozit")}</select></label>
          <label class="nx-field"><span>Produs catalog</span><select name="product_id">${productOptions(products)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod</span><input name="item_code" placeholder="SKU-001"></label>
            <label class="nx-field"><span>Denumire</span><input name="item_name" required placeholder="Material / produs"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Unitate</span><input name="unit" value="buc"></label>
            <label class="nx-field"><span>Cantitate</span><input name="quantity" value="0"></label>
            <label class="nx-field"><span>Rezervat</span><input name="reserved_quantity" value="0"></label>
            <label class="nx-field"><span>Prag minim</span><input name="minimum_quantity" value="0"></label>
          </div>
          <label class="nx-field"><span>Raft / locație internă</span><input name="bin_location" placeholder="A-01 / raft 3"></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează stoc</button>
        </form>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Stocuri pe depozit</h1><p>Poziții curente, rezervări și praguri minime.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Articol</th><th>Depozit</th><th>Status</th><th class="nx-right">Stoc</th><th class="nx-right">Rezervat</th><th class="nx-right">Minim</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există poziții de stoc.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderInventoryShell({ title: "Stocuri", companyName, user: options.user, currentPath: "/nexora/inventory", body });
}

function renderNexoraInventoryWarehousesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const ok = options.ok || "";
  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.warehouse_code || "-")} · ${escapeHtml(row.address || "fără adresă")}</div></td>
      <td>${escapeHtml(row.warehouse_type || "-")}</td>
      <td>${escapeHtml(row.manager_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.stock_lines || 0)}</td>
      <td class="nx-right">${escapeHtml(row.stock_qty || 0)}</td>
    </tr>
  `).join("");
  const body = `
    ${ok ? `<div class="nx-alert success">Depozitul a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DEP</div><div><div class="nx-kpi-label">Depozite</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.active || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">SKU</div><div><div class="nx-kpi-label">Poziții stoc</div><div class="nx-kpi-value">${escapeHtml(stats.stock_lines || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">QTY</div><div><div class="nx-kpi-label">Cantitate</div><div class="nx-kpi-value">${escapeHtml(stats.stock_qty || 0)}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Depozit nou</h2><span>Locație de stoc</span></div></div>
        <form method="post" action="/nexora/inventory/warehouses/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod</span><input name="warehouse_code" required placeholder="DEP-001"></label>
            <label class="nx-field"><span>Denumire</span><input name="name" required placeholder="Depozit central"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip</span><select name="warehouse_type"><option>DEPOZIT</option><option>MAGAZIN</option><option>SERVICE</option><option>TEREN</option></select></label>
            <label class="nx-field"><span>Status</span><select name="status"><option>ACTIV</option><option>INACTIV</option></select></label>
          </div>
          <label class="nx-field"><span>Responsabil</span><input name="manager_name"></label>
          <label class="nx-field"><span>Adresă</span><input name="address"></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează depozit</button>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Depozite</h1><p>Locații de stoc, responsabili și cantități curente.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Depozit</th><th>Tip</th><th>Responsabil</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Cantitate</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există depozite.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;
  return renderInventoryShell({ title: "Depozite", companyName, user: options.user, currentPath: "/nexora/inventory/warehouses", body });
}

function renderNexoraInventoryLotsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const stockItems = Array.isArray(options.stockItems) ? options.stockItems : [];
  const ok = options.ok || "";
  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.lot_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.serial_number || "fără serie")}</div></td>
      <td>${escapeHtml(row.item_name || "-")}</td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td class="nx-right">${escapeHtml(row.quantity_available || 0)} / ${escapeHtml(row.quantity_initial || 0)} ${escapeHtml(row.unit || "buc")}</td>
      <td>${escapeHtml(dateValue(row.expiry_date) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `).join("");
  const body = `
    ${ok ? `<div class="nx-alert success">Lotul a fost salvat.</div>` : ""}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Lot / serie nouă</h2><span>Trasabilitate</span></div></div>
        <form method="post" action="/nexora/inventory/lots/create" class="nx-form">
          <label class="nx-field"><span>Depozit</span><select name="warehouse_id">${warehouseOptions(warehouses, "", "Alege depozit")}</select></label>
          <label class="nx-field"><span>Poziție stoc</span><select name="stock_item_id">${stockItemOptions(stockItems)}</select></label>
          <label class="nx-field"><span>Produs catalog</span><select name="product_id">${productOptions(products)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Lot</span><input name="lot_number" required placeholder="LOT-2026-001"></label>
            <label class="nx-field"><span>Serie</span><input name="serial_number"></label>
          </div>
          <label class="nx-field"><span>Denumire</span><input name="item_name" required></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cantitate inițială</span><input name="quantity_initial" value="1"></label>
            <label class="nx-field"><span>Cantitate disponibilă</span><input name="quantity_available" value="1"></label>
            <label class="nx-field"><span>Unitate</span><input name="unit" value="buc"></label>
            <label class="nx-field"><span>Expiră la</span><input type="date" name="expiry_date"></label>
          </div>
          <label class="nx-field"><span>Furnizor</span><input name="supplier_name"></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează lot</button>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Loturi și serii</h1><p>Trasabilitate pe lot, serie, depozit și expirare.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Lot / Serie</th><th>Articol</th><th>Depozit</th><th class="nx-right">Disponibil</th><th>Expiră</th><th>Status</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există loturi.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;
  return renderInventoryShell({ title: "Loturi / Serii", companyName, user: options.user, currentPath: "/nexora/inventory/lots", body });
}

function renderNexoraInventoryTransfersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const openTransfers = Array.isArray(options.openTransfers) ? options.openTransfers : rows.filter((row) => !["FINALIZAT", "ANULAT"].includes(String(row.status || "").toUpperCase()));
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const stockItems = Array.isArray(options.stockItems) ? options.stockItems : [];
  const stats = options.stats || {};
  const ok = options.ok || "";

  const okMessages = {
    created: "Transferul a fost creat.",
    item_added: "Linia a fost adăugată pe transfer.",
    status: "Statusul transferului a fost actualizat."
  };

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.transfer_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.transfer_date) || "-")} · ${escapeHtml(row.requested_by || "fără solicitant")}</div></td>
      <td>${escapeHtml(row.from_warehouse_name || "Fără depozit")}</td>
      <td>${escapeHtml(row.to_warehouse_name || "Fără depozit")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.line_count || 0)}</td>
      <td class="nx-right">${escapeHtml(row.total_qty || 0)}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/inventory/transfers/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="PREGATIT">
          <button class="nx-btn" type="submit">Pregătit</button>
        </form>
        <form method="post" action="/nexora/inventory/transfers/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="IN_TRANZIT">
          <button class="nx-btn" type="submit">În tranzit</button>
        </form>
        <form method="post" action="/nexora/inventory/transfers/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="FINALIZAT">
          <button class="nx-btn primary" type="submit">Finalizează</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">TRF</div><div><div class="nx-kpi-label">Transferuri</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DRF</div><div><div class="nx-kpi-label">În lucru</div><div class="nx-kpi-value">${escapeHtml(stats.open || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">FIN</div><div><div class="nx-kpi-label">Finalizate</div><div class="nx-kpi-value">${escapeHtml(stats.done || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">QTY</div><div><div class="nx-kpi-label">Cantitate transferată</div><div class="nx-kpi-value">${escapeHtml(stats.qty || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Transfer nou</h2><span>Mișcare între depozite</span></div></div>
        <form method="post" action="/nexora/inventory/transfers/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Din depozit</span><select name="from_warehouse_id" required>${warehouseOptions(warehouses, "", "Alege sursa")}</select></label>
            <label class="nx-field"><span>Către depozit</span><select name="to_warehouse_id" required>${warehouseOptions(warehouses, "", "Alege destinația")}</select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data transferului</span><input type="date" name="transfer_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
            <label class="nx-field"><span>Solicitat de</span><input name="requested_by" value="${escapeHtml(options.user?.email || "")}"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează transfer</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă linie</h2><span>Articole transferate</span></div></div>
        <form method="post" action="/nexora/inventory/transfers/items" class="nx-form">
          <label class="nx-field"><span>Transfer</span><select name="transfer_id" required>${documentOptions(openTransfers, "id", "transfer_number", "", "Alege transfer deschis")}</select></label>
          <label class="nx-field"><span>Poziție stoc</span><select name="stock_item_id" required>${stockItemOptions(stockItems, "", "Alege articol")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cantitate</span><input name="quantity" value="1"></label>
            <label class="nx-field"><span>Observații</span><input name="notes"></label>
          </div>
          <button class="nx-btn primary" type="submit">Adaugă pe transfer</button>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Transferuri stoc</h1><p>Documente de mișcare între depozite, cu finalizare care mută cantitățile.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Transfer</th><th>Din</th><th>Către</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Cantitate</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există transferuri.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: "Transferuri", companyName, user: options.user, currentPath: "/nexora/inventory/transfers", body });
}

function renderNexoraInventoryReceiptsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const openReceipts = Array.isArray(options.openReceipts) ? options.openReceipts : rows.filter((row) => !["RECEPTIONAT", "ANULAT"].includes(String(row.status || "").toUpperCase()));
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const stockItems = Array.isArray(options.stockItems) ? options.stockItems : [];
  const stats = options.stats || {};
  const ok = options.ok || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.receipt_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.receipt_date) || "-")} · ${escapeHtml(row.document_number || "fără document")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "Fără depozit")}</td>
      <td>${escapeHtml(row.supplier_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.line_count || 0)}</td>
      <td class="nx-right">${escapeHtml(row.total_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(money(row.total_value || 0, options.fmtMoney))}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/inventory/receipts/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="RECEPTIONAT">
          <button class="nx-btn primary" type="submit">Recepționează</button>
        </form>
        <form method="post" action="/nexora/inventory/receipts/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="ANULAT">
          <button class="nx-btn danger" type="submit">Anulează</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Operațiunea pe recepții a fost finalizată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">REC</div><div><div class="nx-kpi-label">Recepții</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DRF</div><div><div class="nx-kpi-label">În lucru</div><div class="nx-kpi-value">${escapeHtml(stats.open || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Recepționate</div><div class="nx-kpi-value">${escapeHtml(stats.done || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">VAL</div><div><div class="nx-kpi-label">Valoare intrări</div><div class="nx-kpi-value">${escapeHtml(money(stats.value || 0, options.fmtMoney))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Recepție nouă</h2><span>Intrare marfă / materiale</span></div></div>
        <form method="post" action="/nexora/inventory/receipts/create" class="nx-form">
          <label class="nx-field"><span>Depozit</span><select name="warehouse_id" required>${warehouseOptions(warehouses, "", "Alege depozit")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Furnizor</span><input name="supplier_name" placeholder="Furnizor"></label>
            <label class="nx-field"><span>Document</span><input name="document_number" placeholder="Aviz / NIR / comandă"></label>
            <label class="nx-field"><span>Data recepției</span><input type="date" name="receipt_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează recepție</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă linie</h2><span>Articol recepționat</span></div></div>
        <form method="post" action="/nexora/inventory/receipts/items" class="nx-form">
          <label class="nx-field"><span>Recepție</span><select name="receipt_id" required>${documentOptions(openReceipts, "id", "receipt_number", "", "Alege recepție deschisă")}</select></label>
          <label class="nx-field"><span>Produs catalog</span><select name="product_id">${productOptions(products)}</select></label>
          <label class="nx-field"><span>Poziție stoc existentă</span><select name="stock_item_id">${stockItemOptions(stockItems)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod</span><input name="item_code" placeholder="SKU / cod furnizor"></label>
            <label class="nx-field"><span>Denumire</span><input name="item_name" required></label>
            <label class="nx-field"><span>UM</span><input name="unit" value="buc"></label>
            <label class="nx-field"><span>Cantitate</span><input name="quantity" value="1"></label>
            <label class="nx-field"><span>Cost unitar</span><input name="unit_cost" value="0"></label>
            <label class="nx-field"><span>Lot</span><input name="lot_number"></label>
            <label class="nx-field"><span>Serie</span><input name="serial_number"></label>
            <label class="nx-field"><span>Expiră la</span><input type="date" name="expiry_date"></label>
          </div>
          <button class="nx-btn primary" type="submit">Adaugă linie</button>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Recepții</h1><p>Intrări în depozit, loturi, serii și costuri de intrare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Recepție</th><th>Depozit</th><th>Furnizor</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Cantitate</th><th class="nx-right">Valoare</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="8"><div class="nx-empty-state">Nu există recepții.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: "Recepții", companyName, user: options.user, currentPath: "/nexora/inventory/receipts", body });
}

function renderNexoraInventoryPickingPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const openPickings = Array.isArray(options.openPickings) ? options.openPickings : rows.filter((row) => !["LIVRAT", "ANULAT"].includes(String(row.status || "").toUpperCase()));
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const stockItems = Array.isArray(options.stockItems) ? options.stockItems : [];
  const stats = options.stats || {};

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.picking_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.scheduled_date) || "-")} · ${escapeHtml(row.project_name || "fără proiect")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "Fără depozit")}</td>
      <td>${escapeHtml(row.client_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.line_count || 0)}</td>
      <td class="nx-right">${escapeHtml(row.requested_qty || 0)}</td>
      <td class="nx-right">${escapeHtml(row.packed_qty || 0)}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/inventory/picking/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="PREGATIT">
          <button class="nx-btn" type="submit">Pregătit</button>
        </form>
        <form method="post" action="/nexora/inventory/picking/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="AMBALAT">
          <button class="nx-btn" type="submit">Ambalat</button>
        </form>
        <form method="post" action="/nexora/inventory/picking/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="LIVRAT">
          <button class="nx-btn primary" type="submit">Livrează</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Operațiunea de picking a fost finalizată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PKG</div><div><div class="nx-kpi-label">Picking-uri</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RES</div><div><div class="nx-kpi-label">Rezervate</div><div class="nx-kpi-value">${escapeHtml(stats.reserved || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">LIV</div><div><div class="nx-kpi-label">Livrate</div><div class="nx-kpi-value">${escapeHtml(stats.done || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">QTY</div><div><div class="nx-kpi-label">Cantitate cerută</div><div class="nx-kpi-value">${escapeHtml(stats.qty || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Picking nou</h2><span>Pregătire pentru livrare</span></div></div>
        <form method="post" action="/nexora/inventory/picking/create" class="nx-form">
          <label class="nx-field"><span>Depozit</span><select name="warehouse_id" required>${warehouseOptions(warehouses, "", "Alege depozit")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Client</span><input name="client_name" placeholder="Client"></label>
            <label class="nx-field"><span>Proiect / comandă</span><input name="project_name" placeholder="Comandă / proiect"></label>
            <label class="nx-field"><span>Data planificată</span><input type="date" name="scheduled_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează picking</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă linie</h2><span>Rezervare și ambalare</span></div></div>
        <form method="post" action="/nexora/inventory/picking/items" class="nx-form">
          <label class="nx-field"><span>Picking</span><select name="picking_id" required>${documentOptions(openPickings, "id", "picking_number", "", "Alege picking deschis")}</select></label>
          <label class="nx-field"><span>Poziție stoc</span><select name="stock_item_id" required>${stockItemOptions(stockItems, "", "Alege articol")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cerut</span><input name="quantity_requested" value="1"></label>
            <label class="nx-field"><span>Pick-uit</span><input name="quantity_picked" value="1"></label>
            <label class="nx-field"><span>Ambalat</span><input name="quantity_packed" value="0"></label>
          </div>
          <label class="nx-field"><span>Observații</span><input name="notes"></label>
          <button class="nx-btn primary" type="submit">Adaugă linie</button>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Picking / Packing</h1><p>Pregătire, rezervare, ambalare și scădere din stoc la livrare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Picking</th><th>Depozit</th><th>Client</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Cerut</th><th class="nx-right">Ambalat</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="8"><div class="nx-empty-state">Nu există picking-uri.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: "Picking / Packing", companyName, user: options.user, currentPath: "/nexora/inventory/picking", body });
}

function renderNexoraInventoryBarcodesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const assets = Array.isArray(options.assets) ? options.assets : [];
  const lots = Array.isArray(options.lots) ? options.lots : [];

  const rowsHtml = rows.map((row) => `
    <tr>
      <td>
        <div style="font-family:monospace;font-size:18px;font-weight:800;letter-spacing:2px">${escapeHtml(row.barcode_value || "-")}</div>
        <div class="nx-table-sub">${escapeHtml(row.barcode_type || "CODE128")}</div>
      </td>
      <td><b>${escapeHtml(row.label || "-")}</b><div class="nx-table-sub">${escapeHtml(row.product_name || row.asset_name || row.lot_number || "fără legătură")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.created_at || "-")}</td>
      <td>${escapeHtml(row.notes || "-")}</td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Codul de bare a fost creat.</div>` : ""}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Cod nou</h2><span>Etichetă pentru produs, activ sau lot</span></div></div>
        <form method="post" action="/nexora/inventory/barcodes/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip cod</span><select name="barcode_type"><option value="CODE128">CODE128</option><option value="EAN13">EAN13</option><option value="QR">QR</option></select></label>
            <label class="nx-field"><span>Cod</span><input name="barcode_value" placeholder="Se generează dacă rămâne gol"></label>
          </div>
          <label class="nx-field"><span>Etichetă</span><input name="label" required placeholder="Denumire afișată pe etichetă"></label>
          <label class="nx-field"><span>Produs</span><select name="product_id">${productOptions(products, "", "Fără produs")}</select></label>
          <label class="nx-field"><span>Activ</span><select name="asset_id">${assetOptions(assets)}</select></label>
          <label class="nx-field"><span>Lot</span><select name="lot_id">${lotOptions(lots)}</select></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Generează cod</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Tipărire</h2><span>Etichete selectabile din browser</span></div></div>
        <p class="nx-muted">Lista din dreapta poate fi tipărită direct din browser. Codul text este păstrat lângă etichetă ca să poată fi introdus manual dacă scanerul nu este disponibil.</p>
        <button class="nx-btn" type="button" onclick="window.print()">Tipărește etichete</button>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Coduri de bare</h1><p>Etichete pentru produse, active, loturi și serii.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Etichetă</th><th>Status</th><th>Creat</th><th>Observații</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="5"><div class="nx-empty-state">Nu există coduri de bare.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: "Coduri de bare", companyName, user: options.user, currentPath: "/nexora/inventory/barcodes", body });
}

function renderNexoraInventoryCountsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const ok = options.ok || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/inventory/counts/${escapeHtml(row.id)}">${escapeHtml(row.title || "Inventar")}</a><div class="nx-table-sub">${escapeHtml(row.source_file_name || "generat din sistem")}</div></td>
      <td>${escapeHtml(dateValue(row.count_date) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.line_count || 0)}</td>
      <td class="nx-right">${escapeHtml(row.variance_lines || 0)}</td>
      <td class="nx-table-actions">
        <a class="nx-btn" href="/nexora/inventory/counts/${escapeHtml(row.id)}">Deschide</a>
        <a class="nx-btn" href="/nexora/inventory/counts/export/${escapeHtml(row.id)}.csv">Export CSV</a>
      </td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Sesiunea de inventar a fost creată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">INV</div><div><div class="nx-kpi-label">Sesiuni</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DRF</div><div><div class="nx-kpi-label">Draft</div><div class="nx-kpi-value">${escapeHtml(stats.draft || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">APL</div><div><div class="nx-kpi-label">Aplicate</div><div class="nx-kpi-value">${escapeHtml(stats.applied || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">DIF</div><div><div class="nx-kpi-label">Linii cu diferențe</div><div class="nx-kpi-value">${escapeHtml(stats.variance_lines || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Numărare nouă</h2><span>Scriptic vs faptic</span></div></div>
        <form method="post" action="/nexora/inventory/counts/create" enctype="multipart/form-data" class="nx-form">
          <label class="nx-field"><span>Titlu</span><input name="title" value="Inventar lunar" required></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data</span><input type="date" name="count_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
            <label class="nx-field"><span>Sursă</span><select name="scope"><option value="STOCURI">Stocuri pe depozite</option><option value="ACTIVE">Registru active</option></select></label>
          </div>
          <label class="nx-field"><span>Fișier CSV opțional</span><input type="file" name="count_file" accept=".csv,.txt"></label>
          <p class="nx-muted">CSV acceptat: <code>asset_code</code> și <code>quantity_counted</code>. Dacă nu încarci fișier, se generează liniile din stocurile sau activele curente.</p>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează inventar</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Flux recomandat</h2><span>Control operațional</span></div></div>
        <div class="nx-shortcuts">
          <a href="/nexora/inventory">Verifică stocuri</a>
          <a href="/nexora/inventory/receipts">Recepții nefinalizate</a>
          <a href="/nexora/inventory/transfers">Transferuri</a>
          <a href="/nexora/inventory/reports">Rapoarte</a>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Sesiuni de inventar</h1><p>Importă faptic, compară cu scriptic și aplică diferențele aprobate.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Titlu</th><th>Data</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Diferențe</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există sesiuni de inventar.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: "Inventar", companyName, user: options.user, currentPath: "/nexora/inventory/counts", body });
}

function renderNexoraInventoryCountDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const count = options.count || {};
  const items = Array.isArray(options.items) ? options.items : [];
  const stats = options.stats || {};

  const rowsHtml = items.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.asset_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.warehouse_name || row.notes || "")}</div></td>
      <td>${escapeHtml(row.asset_name || "-")}</td>
      <td class="nx-right">${escapeHtml(row.quantity_scriptic || 0)}</td>
      <td class="nx-right">${escapeHtml(row.quantity_counted || 0)}</td>
      <td>${varianceBadge(row.variance)}</td>
      <td>${Number(row.applied || 0) ? `<span class="nx-status-pill success">da</span>` : `<span class="nx-status-pill neutral">nu</span>`}</td>
      <td>${escapeHtml(row.notes || "-")}</td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Corecțiile au fost aplicate.</div>` : ""}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(count.title || "Inventar")}</h1>
          <p>${escapeHtml(dateValue(count.count_date) || "-")} · ${escapeHtml(count.source_file_name || "generat din sistem")} · ${statusBadge(count.status)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/inventory/counts">Înapoi</a>
          <a class="nx-btn" href="/nexora/inventory/counts/export/${escapeHtml(count.id)}.csv">Export CSV</a>
          <form method="post" action="/nexora/inventory/counts/${escapeHtml(count.id)}/apply">
            <button class="nx-btn primary" type="submit" ${Number(stats.unapplied || 0) ? "" : "disabled"}>Aplică diferențe</button>
          </form>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">LIN</div><div><div class="nx-kpi-label">Linii</div><div class="nx-kpi-value">${escapeHtml(stats.lines || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">DIF</div><div><div class="nx-kpi-label">Diferențe</div><div class="nx-kpi-value">${escapeHtml(stats.variance || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">APL</div><div><div class="nx-kpi-label">Neaplicate</div><div class="nx-kpi-value">${escapeHtml(stats.unapplied || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Fără diferențe</div><div class="nx-kpi-value">${escapeHtml(stats.ok || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Linii de numărare</h1><p>Scriptic, faptic și diferențe pe fiecare poziție.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Denumire</th><th class="nx-right">Scriptic</th><th class="nx-right">Faptic</th><th>Diferență</th><th>Aplicat</th><th>Observații</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există linii în această sesiune.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: count.title || "Inventar", companyName, user: options.user, currentPath: "/nexora/inventory/counts", body });
}

function renderNexoraInventoryReportsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const byWarehouse = Array.isArray(options.byWarehouse) ? options.byWarehouse : [];
  const lowStock = Array.isArray(options.lowStock) ? options.lowStock : [];
  const expiringLots = Array.isArray(options.expiringLots) ? options.expiringLots : [];
  const movements = options.movements || {};

  const warehouseRows = byWarehouse.map((row) => `
    <tr><td>${escapeHtml(row.warehouse_name || "Fără depozit")}</td><td class="nx-right">${escapeHtml(row.lines || 0)}</td><td class="nx-right">${escapeHtml(row.qty || 0)}</td><td class="nx-right">${escapeHtml(row.reserved || 0)}</td></tr>
  `).join("");
  const lowRows = lowStock.map((row) => `
    <tr><td><b>${escapeHtml(row.item_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.item_code || "-")} · ${escapeHtml(row.warehouse_name || "Fără depozit")}</div></td><td class="nx-right">${escapeHtml(row.quantity || 0)}</td><td class="nx-right">${escapeHtml(row.reserved_quantity || 0)}</td><td class="nx-right">${escapeHtml(row.minimum_quantity || 0)}</td></tr>
  `).join("");
  const lotRows = expiringLots.map((row) => `
    <tr><td><b>${escapeHtml(row.lot_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.item_name || "-")}</div></td><td>${escapeHtml(row.warehouse_name || "-")}</td><td>${escapeHtml(dateValue(row.expiry_date) || "-")}</td><td class="nx-right">${escapeHtml(row.quantity_available || 0)}</td></tr>
  `).join("");

  const body = `
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DEP</div><div><div class="nx-kpi-label">Depozite cu stoc</div><div class="nx-kpi-value">${escapeHtml(byWarehouse.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">MIN</div><div><div class="nx-kpi-label">Poziții sub minim</div><div class="nx-kpi-value">${escapeHtml(lowStock.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">LOT</div><div><div class="nx-kpi-label">Loturi cu expirare</div><div class="nx-kpi-value">${escapeHtml(expiringLots.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">MOV</div><div><div class="nx-kpi-label">Documente deschise</div><div class="nx-kpi-value">${escapeHtml(Number(movements.open_transfers || 0) + Number(movements.open_receipts || 0) + Number(movements.open_pickings || 0))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Stoc pe depozite</h1><p>Linii, cantități și rezervări curente.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Depozit</th><th class="nx-right">Linii</th><th class="nx-right">Cantitate</th><th class="nx-right">Rezervat</th></tr></thead><tbody>${warehouseRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există stoc pe depozite.</div></td></tr>`}</tbody></table></div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Sub minim</h1><p>Poziții care cer reaprovizionare sau transfer.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Articol</th><th class="nx-right">Stoc</th><th class="nx-right">Rezervat</th><th class="nx-right">Minim</th></tr></thead><tbody>${lowRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există poziții sub minim.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Loturi apropiate de expirare</h1><p>Loturi active cu dată de expirare setată.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Lot</th><th>Depozit</th><th>Expiră</th><th class="nx-right">Disponibil</th></tr></thead><tbody>${lotRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există loturi cu expirare setată.</div></td></tr>`}</tbody></table></div>
    </section>
  `;
  return renderInventoryShell({ title: "Rapoarte inventar", companyName, user: options.user, currentPath: "/nexora/inventory/reports", body });
}

export {
  renderNexoraInventoryAssetDetailPage,
  renderNexoraInventoryAssetsPage,
  renderNexoraInventoryBarcodesPage,
  renderNexoraInventoryCountDetailPage,
  renderNexoraInventoryCountsPage,
  renderNexoraInventoryLotsPage,
  renderNexoraInventoryPickingPage,
  renderNexoraInventoryProjectDetailPage,
  renderNexoraInventoryProjectEditPage,
  renderNexoraInventoryProjectsPage,
  renderNexoraInventoryReceiptsPage,
  renderNexoraInventoryReportsPage,
  renderNexoraInventoryStockPage,
  renderNexoraInventoryTransfersPage,
  renderNexoraInventoryWarehousesPage
};
