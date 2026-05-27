import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} RON`;
}

function kindBadge(kind) {
  const value = String(kind || "SERVICIU").toUpperCase();
  return `<span class="nx-status-pill ${value === "PRODUS" ? "warn" : "neutral"}">${escapeHtml(value)}</span>`;
}

function activeBadge(active) {
  return Number(active)
    ? `<span class="nx-status-pill success">activ</span>`
    : `<span class="nx-status-pill neutral">inactiv</span>`;
}

function productForm(product = {}, action = "/produse/create", submitLabel = "Salvează produsul") {
  return `
    <form method="post" action="${escapeHtml(action)}" class="nx-form">
      <input type="hidden" name="return_to" value="nexora">
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Cod</span><input name="code" value="${escapeHtml(product.code || "")}" placeholder="SVC-001"></label>
        <label class="nx-field"><span>Denumire</span><input name="name" required value="${escapeHtml(product.name || "")}" placeholder="Mentenanță lunară"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field">
          <span>Tip</span>
          <select name="kind">
            <option value="SERVICIU" ${String(product.kind || "SERVICIU").toUpperCase() === "SERVICIU" ? "selected" : ""}>SERVICIU</option>
            <option value="PRODUS" ${String(product.kind || "").toUpperCase() === "PRODUS" ? "selected" : ""}>PRODUS</option>
          </select>
        </label>
        <label class="nx-field"><span>UM</span><input name="unit" value="${escapeHtml(product.unit || "buc")}" placeholder="buc / ora / abon"></label>
      </div>
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Preț</span><input name="price" value="${escapeHtml(String(product.price ?? 0))}"></label>
        <label class="nx-field"><span>TVA %</span><input name="tva_percent" value="${escapeHtml(String(product.tva_percent ?? 19))}"></label>
      </div>
      <label class="nx-field">
        <span>Activ</span>
        <select name="active">
          <option value="1" ${Number(product.active ?? 1) ? "selected" : ""}>DA</option>
          <option value="0" ${Number(product.active ?? 1) ? "" : "selected"}>NU</option>
        </select>
      </label>
      <div class="nx-form-actions">
        <button class="nx-btn primary" type="submit">${escapeHtml(submitLabel)}</button>
        <a class="nx-btn" href="/nexora/products">Înapoi la catalog</a>
      </div>
    </form>
  `;
}

function renderNexoraProductsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const q = options.q || "";
  const ok = options.ok || "";

  const activeCount = rows.filter((row) => Number(row.active)).length;
  const serviceCount = rows.filter((row) => String(row.kind || "").toUpperCase() !== "PRODUS").length;
  const productCount = rows.filter((row) => String(row.kind || "").toUpperCase() === "PRODUS").length;

  const okMessages = {
    created: "Produsul a fost adăugat.",
    saved: "Produsul a fost actualizat.",
    toggled: "Statusul produsului a fost schimbat."
  };

  const alertHtml = ok
    ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>`
    : "";

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/nexora/products/${escapeHtml(row.id)}/edit">${escapeHtml(row.name || "-")}</a>
          <div class="nx-table-sub">${escapeHtml(row.code || "fără cod")}</div>
        </td>
        <td>${kindBadge(row.kind)}</td>
        <td>${escapeHtml(row.unit || "-")}</td>
        <td class="nx-right">${escapeHtml(money(row.price))}</td>
        <td class="nx-right">${escapeHtml(String(row.tva_percent ?? 0))}%</td>
        <td>${activeBadge(row.active)}</td>
        <td class="nx-table-actions">
          <a class="nx-btn" href="/nexora/products/${escapeHtml(row.id)}/edit">Editează</a>
          <form method="post" action="/produse/${escapeHtml(row.id)}/toggle" style="margin:0">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn ${Number(row.active) ? "danger" : ""}" type="submit">${Number(row.active) ? "Dezactivează" : "Activează"}</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7"><div class="nx-empty-state">Nu există produse pentru criteriile curente.</div></td></tr>`;

  const body = `
    ${alertHtml}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">▣</div><div><div class="nx-kpi-label">Total afișate</div><div class="nx-kpi-value">${escapeHtml(rows.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">✓</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(activeCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">S</div><div><div class="nx-kpi-label">Servicii</div><div class="nx-kpi-value">${escapeHtml(serviceCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">P</div><div><div class="nx-kpi-label">Produse</div><div class="nx-kpi-value">${escapeHtml(productCount)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Adaugă produs / serviciu</h2>
            <span>Catalog reutilizabil</span>
          </div>
        </div>
        ${productForm()}
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Caută în catalog</h2>
            <span>${escapeHtml(rows.length)} rezultate</span>
          </div>
        </div>
        <form class="nx-form" method="get" action="/nexora/products">
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(q)}" placeholder="Cod, denumire sau tip"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Caută</button>
            <a class="nx-btn" href="/nexora/products">Reset</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Produse / Servicii</h1>
          <p>Catalog intern pentru linii de ofertă, factură și consum.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Denumire</th>
              <th>Tip</th>
              <th>UM</th>
              <th class="nx-right">Preț</th>
              <th class="nx-right">TVA</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Produse / Servicii",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/products",
    eyebrow: "Inventar / Catalog",
    pageTitle: "Produse / Servicii",
    body
  });
}

function renderNexoraProductEditPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const product = options.product || {};
  const ok = options.ok || "";

  const body = `
    ${ok ? `<div class="nx-alert success">Produsul a fost actualizat.</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(product.name || "Produs")}</h1>
          <p>${escapeHtml(product.code || "fără cod")} · ${escapeHtml(product.kind || "SERVICIU")}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/products">Înapoi la catalog</a>
        </div>
      </div>
      ${productForm(product, `/produse/${escapeHtml(product.id)}/edit`, "Salvează modificările")}
    </section>
  `;

  return renderNexoraShell({
    title: product.name ? `Produs ${product.name}` : "Produs",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/products",
    eyebrow: "Inventar / Catalog",
    pageTitle: "Editare produs",
    body
  });
}

export {
  renderNexoraProductEditPage,
  renderNexoraProductsPage
};
