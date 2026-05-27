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
  if (["IN_STOC", "ACTIV", "APPLIED"].includes(normalized)) return `<span class="nx-status-pill success">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  if (["ALOCAT", "FINALIZAT"].includes(normalized)) return `<span class="nx-status-pill warn">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  if (["CASAT", "RESPINS"].includes(normalized)) return `<span class="nx-status-pill danger">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase().replaceAll("_", " ") || "-")}</span>`;
}

function assetTypeBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "MIJLOC_FIX"
    ? `<span class="nx-status-pill warn">mijloc fix</span>`
    : `<span class="nx-status-pill neutral">obiect inventar</span>`;
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

  return renderNexoraShell({
    title: "Registru active",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/inventory/assets",
    eyebrow: "Inventar & Gestiune",
    pageTitle: "Registru active",
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

  return renderNexoraShell({
    title: asset.asset_name || "Activ inventar",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/inventory/assets",
    eyebrow: "Inventar & Gestiune",
    pageTitle: "Activ inventar",
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

  return renderNexoraShell({
    title: "Inventar pe proiect",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/inventory/projects",
    eyebrow: "Inventar & Gestiune",
    pageTitle: "Inventar pe proiect",
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

  return renderNexoraShell({
    title: project.project_name || "Inventar proiect",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/inventory/projects",
    eyebrow: "Inventar & Gestiune",
    pageTitle: "Inventar pe proiect",
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

  return renderNexoraShell({
    title: project.project_name || "Editare proiect",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/inventory/projects",
    eyebrow: "Inventar & Gestiune",
    pageTitle: "Editare proiect",
    body
  });
}

export {
  renderNexoraInventoryAssetDetailPage,
  renderNexoraInventoryAssetsPage,
  renderNexoraInventoryProjectDetailPage,
  renderNexoraInventoryProjectEditPage,
  renderNexoraInventoryProjectsPage
};
