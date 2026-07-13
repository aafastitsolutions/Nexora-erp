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

function dateTimeValue(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  return raw.slice(0, 16).replace("T", " ");
}

function selected(actual, expected) {
  return String(actual || "").toUpperCase() === String(expected || "").toUpperCase() ? "selected" : "";
}

function statusBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "APROBATA", "APROBAT", "CONFIRMATA", "RECEPTIONATA", "VALIDATA", "PLATITA", "FINALIZAT"].includes(normalized)) {
    return `<span class="nx-status-pill success">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  }
  if (["DRAFT", "PENDING", "NECESITA_APROBARE", "TRIMISA", "PARTIAL_RECEPTIONATA", "PLANIFICAT", "NEPLATITA", "PARTIALA"].includes(normalized)) {
    return `<span class="nx-status-pill warn">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  }
  if (["INACTIV", "RESPINSA", "ANULATA", "BLOCAT"].includes(normalized)) {
    return `<span class="nx-status-pill danger">${escapeHtml(normalized.toLowerCase().replaceAll("_", " "))}</span>`;
  }
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase().replaceAll("_", " ") || "-")}</span>`;
}

function sourceBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const labels = {
    SICAP_PROCEDURI: "SICAP proceduri",
    SICAP_PUBLICITATE: "SICAP publicitate",
    TED_RO: "TED România",
    OPORTUNITATI_UE: "Fonduri UE / PNRR",
    PNRR_PROCEDURI: "PNRR proceduri",
    BENEFICIAR_FONDURI_UE: "Beneficiar fonduri UE",
    FILTRU_IT_SOFTWARE: "Filtru IT/software",
    EU_PNRR: "PNRR",
    EU_ADR: "ADR",
    EU_INTERREG: "Interreg",
    EU_CORDIS: "CORDIS",
    EU_HORIZON: "Horizon",
    EU_EIT: "EIT",
    EU_UNIVERSITATE: "Universitate",
    EU_INSTITUT: "Institut",
    EU_BENEFICIAR_PRIVAT: "Beneficiar privat"
  };
  return `<span class="nx-status-pill neutral">${escapeHtml(labels[normalized] || normalized || "-")}</span>`;
}

function activeBadge(row = {}) {
  return Number(row.is_active || 0) === 1
    ? `<span class="nx-status-pill success">activ</span>`
    : `<span class="nx-status-pill danger">expirat</span>`;
}

function valueWithCurrency(value, currency = "RON", fmtMoney) {
  if (value === null || value === undefined || value === "") return "-";
  if (String(currency || "").toUpperCase() === "RON") return money(value, fmtMoney);
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toLocaleString("ro-RO", { maximumFractionDigits: 2 }) : "0"} ${currency || ""}`.trim();
}

function renderProcurementNav(activePath) {
  const items = [
    ["General", "/nexora/procurement"],
    ["EU Opportunity Finder", "/nexora/procurement/opportunities"],
    ["Furnizori", "/nexora/procurement/suppliers"],
    ["Comenzi achiziție", "/nexora/procurement/orders"],
    ["Recepții", "/nexora/procurement/receipts"],
    ["Aprobări", "/nexora/procurement/approvals"],
    ["Costuri", "/nexora/procurement/costs"],
    ["Facturi furnizori", "/nexora/procurement/bills"]
  ];
  return `
    <div class="nx-module-tabs">
      ${items.map(([label, href]) => `<a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function renderProcurementShell({ title, companyName, user, currentPath, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath,
    eyebrow: "Achiziții",
    pageTitle: title,
    body: `${renderProcurementNav(currentPath)}${body}`
  });
}

function supplierOptions(suppliers = [], selectedId = "", emptyLabel = "Alege furnizor") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...suppliers.map((supplier) => `<option value="${escapeHtml(supplier.id)}" ${String(supplier.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(supplier.name || "-")} ${supplier.cui ? `(${escapeHtml(supplier.cui)})` : ""}</option>`)
  ].join("");
}

function productOptions(products = [], selectedId = "", emptyLabel = "Linie manuală") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...products.map((product) => `<option value="${escapeHtml(product.id)}" ${String(product.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim() || "-")} · ${escapeHtml(product.unit || "buc")}</option>`)
  ].join("");
}

function warehouseOptions(warehouses = [], selectedId = "", emptyLabel = "Alege depozit") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...warehouses.map((warehouse) => `<option value="${escapeHtml(warehouse.id)}" ${String(warehouse.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(warehouse.warehouse_code || "-")} · ${escapeHtml(warehouse.name || "-")}</option>`)
  ].join("");
}

function orderOptions(orders = [], selectedId = "", emptyLabel = "Alege comandă") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...orders.map((order) => `<option value="${escapeHtml(order.id)}" ${String(order.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(order.order_number || "-")} · ${escapeHtml(order.supplier_name || "-")} · ${escapeHtml(money(order.total))}</option>`)
  ].join("");
}

function orderItemOptions(items = [], selectedId = "", emptyLabel = "Alege linie comandă") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...items.map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.order_number || "-")} · ${escapeHtml(item.item_name || "-")} · rămas ${escapeHtml(item.remaining_qty || 0)} ${escapeHtml(item.unit || "buc")}</option>`)
  ].join("");
}

function receiptOptions(receipts = [], selectedId = "", emptyLabel = "Alege recepție") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...receipts.map((receipt) => `<option value="${escapeHtml(receipt.id)}" ${String(receipt.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(receipt.receipt_number || "-")} · ${escapeHtml(receipt.supplier_name || "-")}</option>`)
  ].join("");
}

function billOptions(bills = [], selectedId = "", emptyLabel = "Fără factură") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...bills.map((bill) => `<option value="${escapeHtml(bill.id)}" ${String(bill.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(bill.bill_number || "-")} · ${escapeHtml(bill.supplier_name || "-")} · ${escapeHtml(money(bill.total))}</option>`)
  ].join("");
}

function renderNexoraProcurementOpportunitiesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const latestRuns = Array.isArray(options.latestRuns) ? options.latestRuns : [];
  const syncResults = Array.isArray(options.syncResults) ? options.syncResults : [];
  const sources = Array.isArray(options.sources) ? options.sources : [];
  const notifications = Array.isArray(options.notifications) ? options.notifications : [];
  const fmtMoney = options.fmtMoney;

  const sourceTypeOptions = Array.from(new Set(sources.map((source) => String(source.source_type || "").trim()).filter(Boolean))).sort();
  const countryOptions = Array.from(new Set(sources.map((source) => String(source.country || "").trim()).filter(Boolean))).sort();

  const docsHtml = (row = {}) => {
    const docs = Array.isArray(row.documents) ? row.documents : [];
    if (!docs.length) return `<span class="nx-table-sub">fără documente</span>`;
    return docs.slice(0, 3).map((doc, index) => {
      const href = doc.source_url || doc.url || doc.file_path || "";
      const label = doc.file_name || doc.title || `Document ${index + 1}`;
      return href ? `<a class="nx-btn" href="${escapeHtml(href)}" target="_blank" rel="noopener">Vezi documente</a>` : `<span class="nx-table-sub">${escapeHtml(label)}</span>`;
    }).join(" ");
  };

  const statusActions = (row = {}) => `
    <form method="post" action="/nexora/procurement/opportunities/${escapeHtml(row.id)}/status" class="nx-form-actions" style="gap:6px; flex-wrap:wrap">
      <button class="nx-btn" name="review_status" value="interesant" type="submit">Marchează interesant</button>
      <button class="nx-btn" name="review_status" value="respins" type="submit">Respinge</button>
      <button class="nx-btn" name="review_status" value="analizat" type="submit">Analizat</button>
    </form>
  `;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td>
        <b>${escapeHtml(row.notice_no || row.source_id || "-")}</b>
        <div class="nx-table-sub">${sourceBadge(row.source)} ${activeBadge(row)}</div>
        <div class="nx-table-sub">${escapeHtml(row.country || "-")} · ${escapeHtml(row.funding_program || row.contract_type || "-")}</div>
      </td>
      <td>
        <b>${escapeHtml(row.title || "-")}</b>
        <div class="nx-table-sub">${escapeHtml(row.buyer_name || "-")}</div>
        <div class="nx-table-sub">${escapeHtml(row.description || row.cpv_code || "")}</div>
      </td>
      <td><b>${escapeHtml(Number(row.relevance_score || 0))}/100</b><div class="nx-table-sub">${escapeHtml(row.detected_keywords || "")}</div></td>
      <td>${statusBadge(row.review_status || "nou")}<div class="nx-table-sub">${statusBadge(row.status)}</div></td>
      <td>${escapeHtml(dateTimeValue(row.publication_date))}</td>
      <td><b>${escapeHtml(dateTimeValue(row.submission_deadline))}</b></td>
      <td class="nx-right">${escapeHtml(valueWithCurrency(row.estimated_value, row.currency, fmtMoney))}</td>
      <td>
        <div class="nx-table-actions" style="gap:6px; flex-wrap:wrap">
          ${row.detail_url ? `<a class="nx-btn" href="${escapeHtml(row.detail_url)}" target="_blank" rel="noopener">Deschide</a>` : ""}
          ${docsHtml(row)}
          ${row.crm_lead_id ? `<a class="nx-btn" href="/nexora/crm/leads?q=${escapeHtml(row.crm_lead_id)}">Lead creat</a>` : `<form method="post" action="/nexora/procurement/opportunities/${escapeHtml(row.id)}/create-lead"><button class="nx-btn primary" type="submit">Creează lead</button></form>`}
        </div>
        ${statusActions(row)}
      </td>
    </tr>
  `).join("");

  const runsHtml = latestRuns.map((run) => `
    <tr>
      <td>${sourceBadge(run.source)}</td>
      <td>${statusBadge(run.status)}</td>
      <td class="nx-right">${escapeHtml(run.imported_count || 0)}</td>
      <td class="nx-right">${escapeHtml(run.updated_count || 0)}</td>
      <td class="nx-right">${escapeHtml(run.opportunities_found || 0)}</td>
      <td class="nx-right">${escapeHtml(run.pages_scanned || 0)}</td>
      <td>${escapeHtml(dateTimeValue(run.finished_at || run.started_at))}</td>
    </tr>
  `).join("");

  const syncHtml = syncResults.length ? `
    <div class="nx-alert success">
      Sincronizare finalizată:
      ${syncResults.map((item) => `${escapeHtml(item.source)} ${escapeHtml(item.status)} (+${escapeHtml(item.imported || 0)} / upd ${escapeHtml(item.updated || 0)} / găsite ${escapeHtml(item.found || 0)})`).join(" · ")}
    </div>
  ` : "";

  const notificationsHtml = notifications.length ? `
    <div class="nx-alert warn">
      ${notifications.map((item) => `Scor ${escapeHtml(item.relevance_score || 0)}: ${escapeHtml(item.title || item.message || "-")}`).join(" · ")}
    </div>
  ` : "";

  const body = `
    ${syncHtml}
    ${notificationsHtml}
    ${options.err ? `<div class="nx-alert danger">${escapeHtml(options.err)}</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>EU Opportunity Finder</h1>
          <p>Proceduri publice din PNRR, ADR, Interreg, CORDIS, Horizon, EIT, universități, institute și beneficiari privați, filtrate pentru servicii IT.</p>
        </div>
        <form method="post" action="/nexora/procurement/opportunities/sync" class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Sincronizează acum</button>
        </form>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">ALL</div><div><div class="nx-kpi-label">Total importate</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.active || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">70+</div><div><div class="nx-kpi-label">Scor peste 70</div><div class="nx-kpi-value">${escapeHtml(stats.high_score || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">CRM</div><div><div class="nx-kpi-label">Leaduri create</div><div class="nx-kpi-value">${escapeHtml(stats.crm_leads || 0)}</div></div></div>
    </section>

    <section class="nx-panel">
      <div class="nx-panel-head"><div><h2>Filtre</h2><span>${escapeHtml(rows.length)} rezultate afișate</span></div></div>
      <form method="get" action="/nexora/procurement/opportunities" class="nx-form">
        <div class="nx-two-column-grid compact">
          <label class="nx-field"><span>Tip sursă</span><select name="source_type"><option value="">toate</option>${sourceTypeOptions.map((type) => `<option value="${escapeHtml(type)}" ${selected(filters.source_type, type)}>${escapeHtml(type)}</option>`).join("")}</select></label>
          <label class="nx-field"><span>Țară</span><select name="country"><option value="">toate</option>${countryOptions.map((country) => `<option value="${escapeHtml(country)}" ${selected(filters.country, country)}>${escapeHtml(country)}</option>`).join("")}</select></label>
          <label class="nx-field"><span>Stare anunț</span><select name="status"><option value="active" ${selected(filters.status || "active", "active")}>active</option><option value="">toate</option><option value="expired" ${selected(filters.status, "expired")}>expirate</option></select></label>
          <label class="nx-field"><span>Status analiză</span><select name="review_status"><option value="">toate</option><option value="nou" ${selected(filters.review_status, "nou")}>nou</option><option value="analizat" ${selected(filters.review_status, "analizat")}>analizat</option><option value="interesant" ${selected(filters.review_status, "interesant")}>interesant</option><option value="respins" ${selected(filters.review_status, "respins")}>respins</option><option value="aplicat" ${selected(filters.review_status, "aplicat")}>aplicat</option></select></label>
          <label class="nx-field"><span>Program</span><input name="funding_program" value="${escapeHtml(filters.funding_program || "")}" placeholder="PNRR, Interreg, Horizon"></label>
          <label class="nx-field"><span>Scor minim</span><input type="number" min="0" max="100" name="min_score" value="${escapeHtml(filters.min_score || "")}" placeholder="70"></label>
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="software, website, CRM, ERP, platformă"></label>
          <label class="nx-field"><span>Dată publicare de la</span><input type="date" name="publication_from" value="${escapeHtml(filters.publication_from || "")}"></label>
          <label class="nx-field"><span>Dată publicare până la</span><input type="date" name="publication_to" value="${escapeHtml(filters.publication_to || "")}"></label>
          <label class="nx-field"><span>Dată limită depunere de la</span><input type="date" name="deadline_from" value="${escapeHtml(filters.deadline_from || "")}"></label>
          <label class="nx-field"><span>Dată limită depunere până la</span><input type="date" name="deadline_to" value="${escapeHtml(filters.deadline_to || "")}"></label>
        </div>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică filtre</button><a class="nx-btn" href="/nexora/procurement/opportunities">Reset</a></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Oportunități EU</h1><p>Scorul se calculează din titlu, conținutul paginii și documentele publice descărcate.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Anunț</th><th>Titlu / beneficiar</th><th>Scor</th><th>Status</th><th>Publicat</th><th>Limită</th><th class="nx-right">Valoare</th><th>Acțiuni</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="8"><div class="nx-empty-state">Nu există oportunități pentru filtrele curente. Rulează sincronizarea.</div></td></tr>`}</tbody></table></div>
    </section>

    <section class="nx-panel" style="margin-top:18px">
      <div class="nx-panel-head"><div><h2>Ultimele sincronizări</h2><span>monitorizare surse</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Sursă</th><th>Status</th><th class="nx-right">Noi</th><th class="nx-right">Actualizate</th><th class="nx-right">Găsite</th><th class="nx-right">Pagini</th><th>Ora</th></tr></thead><tbody>${runsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există încă sincronizări.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderProcurementShell({ title: "EU Opportunity Finder", companyName, user: options.user, currentPath: "/nexora/procurement/opportunities", body });
}

function renderNexoraProcurementHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const recentOrders = Array.isArray(options.recentOrders) ? options.recentOrders : [];
  const recentBills = Array.isArray(options.recentBills) ? options.recentBills : [];
  const fmtMoney = options.fmtMoney;

  const orderRows = recentOrders.map((row) => `
    <tr>
      <td>${escapeHtml(row.order_number || "-")}<div class="nx-table-sub">${escapeHtml(dateValue(row.order_date) || "-")}</div></td>
      <td>${escapeHtml(row.supplier_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
    </tr>
  `).join("");
  const billRows = recentBills.map((row) => `
    <tr>
      <td>${escapeHtml(row.bill_number || "-")}<div class="nx-table-sub">${escapeHtml(row.doc_number || "fără document")}</div></td>
      <td>${escapeHtml(row.supplier_name || "-")}</td>
      <td>${statusBadge(row.payment_status)}</td>
      <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
    </tr>
  `).join("");

  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Achiziții</h1>
          <p>Furnizori, comenzi de achiziție, aprobări, recepții, costuri și facturi furnizor.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/procurement/orders">Comenzi</a>
          <a class="nx-btn" href="/nexora/procurement/receipts">Recepții</a>
          <a class="nx-btn" href="/nexora/procurement/bills">Facturi furnizori</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">SUP</div><div><div class="nx-kpi-label">Furnizori activi</div><div class="nx-kpi-value">${escapeHtml(stats.active_suppliers || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">PO</div><div><div class="nx-kpi-label">Comenzi deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_orders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">APR</div><div><div class="nx-kpi-label">Aprobări în așteptare</div><div class="nx-kpi-value">${escapeHtml(stats.pending_approvals || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">RON</div><div><div class="nx-kpi-label">Facturi neplătite</div><div class="nx-kpi-value">${escapeHtml(money(stats.unpaid_bills_amount, fmtMoney))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Comenzi recente</h1><p>Ultimele comenzi de achiziție.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Furnizor</th><th>Status</th><th class="nx-right">Total</th></tr></thead><tbody>${orderRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există comenzi de achiziție.</div></td></tr>`}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Facturi furnizori recente</h1><p>Documente de plată și validare internă.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Factură</th><th>Furnizor</th><th>Plată</th><th class="nx-right">Total</th></tr></thead><tbody>${billRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există facturi furnizori.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderProcurementShell({ title: "Achiziții", companyName, user: options.user, currentPath: "/nexora/procurement", body });
}

function renderNexoraProcurementSuppliersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.supplier_code || "-")} · ${escapeHtml(row.cui || "fără CUI")}</div></td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td>${escapeHtml(row.contact_name || "-")}<div class="nx-table-sub">${escapeHtml(row.email || row.phone || "")}</div></td>
      <td>${escapeHtml(row.payment_terms_days || 0)} zile</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.orders_count || 0)}</td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Furnizorul a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">SUP</div><div><div class="nx-kpi-label">Furnizori</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Activi</div><div class="nx-kpi-value">${escapeHtml(stats.active || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">PO</div><div><div class="nx-kpi-label">Cu comenzi</div><div class="nx-kpi-value">${escapeHtml(stats.with_orders || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">BIL</div><div><div class="nx-kpi-label">Cu facturi</div><div class="nx-kpi-value">${escapeHtml(stats.with_bills || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Furnizor nou</h2><span>Date comerciale și contact</span></div></div>
        <form method="post" action="/nexora/procurement/suppliers/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod</span><input name="supplier_code" placeholder="FUR-001"></label>
            <label class="nx-field"><span>Denumire</span><input name="name" required></label>
            <label class="nx-field"><span>CUI</span><input name="cui"></label>
            <label class="nx-field"><span>Registru comerț</span><input name="registration_number"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Categorie</span><input name="category" placeholder="Marfă / servicii / logistică"></label>
            <label class="nx-field"><span>Termen plată zile</span><input name="payment_terms_days" value="30"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Persoană contact</span><input name="contact_name"></label>
            <label class="nx-field"><span>Email</span><input name="email"></label>
            <label class="nx-field"><span>Telefon</span><input name="phone"></label>
            <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="INACTIV">Inactiv</option><option value="BLOCAT">Blocat</option></select></label>
          </div>
          <label class="nx-field"><span>Adresă</span><textarea name="address" rows="2"></textarea></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează furnizor</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre</h2><span>${escapeHtml(rows.length)} rezultate</span></div></div>
        <form method="get" action="/nexora/procurement/suppliers" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="">toate</option><option value="ACTIV" ${selected(filters.status, "ACTIV")}>activ</option><option value="INACTIV" ${selected(filters.status, "INACTIV")}>inactiv</option><option value="BLOCAT" ${selected(filters.status, "BLOCAT")}>blocat</option></select></label>
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="denumire, CUI, email, telefon"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică</button><a class="nx-btn" href="/nexora/procurement/suppliers">Reset</a></div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Furnizori</h1><p>Registru furnizori, termene de plată și contact operațional.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Furnizor</th><th>Categorie</th><th>Contact</th><th>Termen</th><th>Status</th><th class="nx-right">Comenzi</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există furnizori pentru filtrele curente.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderProcurementShell({ title: "Furnizori", companyName, user: options.user, currentPath: "/nexora/procurement/suppliers", body });
}

function renderNexoraProcurementOrdersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const openOrders = Array.isArray(options.openOrders) ? options.openOrders : [];
  const suppliers = Array.isArray(options.suppliers) ? options.suppliers : [];
  const products = Array.isArray(options.products) ? options.products : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.order_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.order_date) || "-")} · ${escapeHtml(dateValue(row.expected_date) || "fără termen")}</div></td>
      <td>${escapeHtml(row.supplier_name || "-")}<div class="nx-table-sub">${escapeHtml(row.supplier_cui || "")}</div></td>
      <td>${statusBadge(row.status)}<div class="nx-table-sub">${statusBadge(row.approval_status)}</div></td>
      <td class="nx-right">${escapeHtml(row.line_count || 0)}</td>
      <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/procurement/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="TRIMISA"><button class="nx-btn" type="submit">Trimisă</button></form>
        <form method="post" action="/nexora/procurement/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="CONFIRMATA"><button class="nx-btn" type="submit">Confirmă</button></form>
        <form method="post" action="/nexora/procurement/orders/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="ANULATA"><button class="nx-btn danger" type="submit">Anulează</button></form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${ok ? `<div class="nx-alert success">Comanda de achiziție a fost salvată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PO</div><div><div class="nx-kpi-label">Comenzi</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Valoare</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OPEN</div><div><div class="nx-kpi-label">Deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">REC</div><div><div class="nx-kpi-label">Recepționate parțial</div><div class="nx-kpi-value">${escapeHtml(stats.partial_count || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Comandă nouă</h2><span>Solicitare către furnizor</span></div></div>
        <form method="post" action="/nexora/procurement/orders/create" class="nx-form">
          <label class="nx-field"><span>Furnizor</span><select name="supplier_id" required>${supplierOptions(suppliers)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data comandă</span><input type="date" name="order_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
            <label class="nx-field"><span>Termen estimat</span><input type="date" name="expected_date"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează comanda</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă linie</h2><span>Produs sau serviciu achiziționat</span></div></div>
        <form method="post" action="/nexora/procurement/orders/items" class="nx-form">
          <label class="nx-field"><span>Comandă</span><select name="order_id" required>${orderOptions(openOrders, "", "Alege comandă deschisă")}</select></label>
          <label class="nx-field"><span>Produs catalog</span><select name="product_id">${productOptions(products)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod</span><input name="item_code"></label>
            <label class="nx-field"><span>Denumire</span><input name="item_name" placeholder="Se completează din produs dacă rămâne gol"></label>
            <label class="nx-field"><span>UM</span><input name="unit" value="buc"></label>
            <label class="nx-field"><span>Cantitate</span><input name="quantity" value="1"></label>
            <label class="nx-field"><span>Cost unitar</span><input name="unit_cost" value="0"></label>
            <label class="nx-field"><span>TVA %</span><input name="vat_percent" value="19"></label>
          </div>
          <label class="nx-field"><span>Observații</span><input name="notes"></label>
          <button class="nx-btn primary" type="submit">Adaugă linie</button>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Comenzi achiziție</h1><p>Comenzi către furnizori, aprobări și recepții asociate.</p></div>
        <form method="get" action="/nexora/procurement/orders" class="nx-inline-form">
          <input name="q" value="${escapeHtml(filters.q || "")}" placeholder="caută comandă sau furnizor">
          <select name="status"><option value="">status</option><option value="DRAFT" ${selected(filters.status, "DRAFT")}>draft</option><option value="TRIMISA" ${selected(filters.status, "TRIMISA")}>trimisă</option><option value="CONFIRMATA" ${selected(filters.status, "CONFIRMATA")}>confirmată</option><option value="ANULATA" ${selected(filters.status, "ANULATA")}>anulată</option></select>
          <button class="nx-btn" type="submit">Filtrează</button>
        </form>
      </div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Comandă</th><th>Furnizor</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Total</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există comenzi de achiziție.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderProcurementShell({ title: "Comenzi achiziție", companyName, user: options.user, currentPath: "/nexora/procurement/orders", body });
}

function renderNexoraProcurementReceiptsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const openReceipts = Array.isArray(options.openReceipts) ? options.openReceipts : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const suppliers = Array.isArray(options.suppliers) ? options.suppliers : [];
  const warehouses = Array.isArray(options.warehouses) ? options.warehouses : [];
  const orderItems = Array.isArray(options.orderItems) ? options.orderItems : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.receipt_number || "-")}</b><div class="nx-table-sub">${escapeHtml(dateValue(row.receipt_date) || "-")} · ${escapeHtml(row.document_number || "fără document")}</div></td>
      <td>${escapeHtml(row.supplier_name || "-")}<div class="nx-table-sub">${escapeHtml(row.order_number || "fără comandă")}</div></td>
      <td>${escapeHtml(row.warehouse_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.line_count || 0)}</td>
      <td class="nx-right">${escapeHtml(money(row.total_value, fmtMoney))}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/procurement/receipts/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="RECEPTIONATA"><button class="nx-btn primary" type="submit">Finalizează</button></form>
        <form method="post" action="/nexora/procurement/receipts/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="ANULATA"><button class="nx-btn danger" type="submit">Anulează</button></form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Recepția a fost salvată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">REC</div><div><div class="nx-kpi-label">Recepții</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OPEN</div><div><div class="nx-kpi-label">În lucru</div><div class="nx-kpi-value">${escapeHtml(stats.open_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Finalizate</div><div class="nx-kpi-value">${escapeHtml(stats.done_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">VAL</div><div><div class="nx-kpi-label">Valoare recepții</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_value, fmtMoney))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Recepție nouă</h2><span>Intrare marfă de la furnizor</span></div></div>
        <form method="post" action="/nexora/procurement/receipts/create" class="nx-form">
          <label class="nx-field"><span>Comandă sursă</span><select name="order_id">${orderOptions(orders, "", "Fără comandă")}</select></label>
          <label class="nx-field"><span>Furnizor</span><select name="supplier_id" required>${supplierOptions(suppliers)}</select></label>
          <label class="nx-field"><span>Depozit</span><select name="warehouse_id" required>${warehouseOptions(warehouses)}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data recepției</span><input type="date" name="receipt_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
            <label class="nx-field"><span>Document furnizor</span><input name="document_number" placeholder="Aviz / NIR / packing list"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează recepție</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă linie</h2><span>Din comandă sau manual</span></div></div>
        <form method="post" action="/nexora/procurement/receipts/items" class="nx-form">
          <label class="nx-field"><span>Recepție</span><select name="receipt_id" required>${receiptOptions(openReceipts, "", "Alege recepție deschisă")}</select></label>
          <label class="nx-field"><span>Linie comandă</span><select name="order_item_id">${orderItemOptions(orderItems, "", "Linie manuală")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod</span><input name="item_code"></label>
            <label class="nx-field"><span>Denumire</span><input name="item_name" placeholder="Se completează din linia comenzii dacă rămâne gol"></label>
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
      <div class="nx-section-head"><div><h1>Recepții achiziții</h1><p>Recepțiile finalizate intră în gestiune și actualizează cantitățile comandate.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Recepție</th><th>Furnizor</th><th>Depozit</th><th>Status</th><th class="nx-right">Linii</th><th class="nx-right">Valoare</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există recepții.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderProcurementShell({ title: "Recepții achiziții", companyName, user: options.user, currentPath: "/nexora/procurement/receipts", body });
}

function renderNexoraProcurementApprovalsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.approval_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.order_number || "fără comandă")}</div></td>
      <td>${escapeHtml(row.subject || "-")}</td>
      <td>${escapeHtml(row.requested_by_email || "-")}<div class="nx-table-sub">${escapeHtml(row.approver_email || "fără aprobator")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/procurement/approvals/${escapeHtml(row.id)}/decision"><input type="hidden" name="status" value="APROBATA"><button class="nx-btn primary" type="submit">Aprobă</button></form>
        <form method="post" action="/nexora/procurement/approvals/${escapeHtml(row.id)}/decision"><input type="hidden" name="status" value="RESPINSA"><button class="nx-btn danger" type="submit">Respinge</button></form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Aprobarea a fost actualizată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">APR</div><div><div class="nx-kpi-label">Aprobări</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">PEND</div><div><div class="nx-kpi-label">În așteptare</div><div class="nx-kpi-value">${escapeHtml(stats.pending || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Aprobate</div><div class="nx-kpi-value">${escapeHtml(stats.approved || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">NO</div><div><div class="nx-kpi-label">Respinse</div><div class="nx-kpi-value">${escapeHtml(stats.rejected || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Aprobare nouă</h2><span>Control intern achiziții</span></div></div>
        <form method="post" action="/nexora/procurement/approvals/create" class="nx-form">
          <label class="nx-field"><span>Comandă</span><select name="order_id">${orderOptions(orders, "", "Aprobare fără comandă")}</select></label>
          <label class="nx-field"><span>Subiect</span><input name="subject" required placeholder="Aprobare achiziție"></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Valoare</span><input name="amount" value="0"></label>
            <label class="nx-field"><span>Aprobator</span><input name="approver_email" placeholder="email aprobator"></label>
            <label class="nx-field"><span>Termen</span><input type="date" name="due_date"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="decision_notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează aprobare</button>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Regulă operațională</h2><span>Vizibilă pentru echipă</span></div></div>
        <p class="nx-muted">Comenzile pot fi ținute în status DRAFT până când aprobarea devine APROBATA. La aprobare, comanda primește automat status intern de aprobare.</p>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Aprobări achiziții</h1><p>Cereri de aprobare pentru comenzi, costuri sau achiziții excepționale.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Nr.</th><th>Subiect</th><th>Solicitant / aprobator</th><th>Status</th><th>Termen</th><th class="nx-right">Valoare</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există aprobări.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderProcurementShell({ title: "Aprobări achiziții", companyName, user: options.user, currentPath: "/nexora/procurement/approvals", body });
}

function renderNexoraProcurementCostsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const suppliers = Array.isArray(options.suppliers) ? options.suppliers : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const receipts = Array.isArray(options.receipts) ? options.receipts : [];
  const bills = Array.isArray(options.bills) ? options.bills : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.description || "-")}</b><div class="nx-table-sub">${escapeHtml(row.cost_type || "-")} · ${escapeHtml(dateValue(row.cost_date) || "-")}</div></td>
      <td>${escapeHtml(row.supplier_name || "-")}</td>
      <td>${escapeHtml(row.order_number || row.receipt_number || row.bill_number || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.allocation_method || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Costul a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">CST</div><div><div class="nx-kpi-label">Costuri</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Valoare totală</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">PLAN</div><div><div class="nx-kpi-label">Planificate</div><div class="nx-kpi-value">${escapeHtml(stats.planned_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">FIN</div><div><div class="nx-kpi-label">Finalizate</div><div class="nx-kpi-value">${escapeHtml(stats.final_count || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Cost nou</h2><span>Transport, taxe, vamă sau servicii</span></div></div>
        <form method="post" action="/nexora/procurement/costs/create" class="nx-form">
          <label class="nx-field"><span>Descriere</span><input name="description" required></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip cost</span><select name="cost_type"><option value="TRANSPORT">Transport</option><option value="VAMA">Vamă</option><option value="MANIPULARE">Manipulare</option><option value="ASIGURARE">Asigurare</option><option value="SERVICII">Servicii</option><option value="ALTELE">Altele</option></select></label>
            <label class="nx-field"><span>Data</span><input type="date" name="cost_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
            <label class="nx-field"><span>Valoare</span><input name="amount" value="0"></label>
            <label class="nx-field"><span>Status</span><select name="status"><option value="PLANIFICAT">Planificat</option><option value="FINALIZAT">Finalizat</option></select></label>
          </div>
          <label class="nx-field"><span>Furnizor</span><select name="supplier_id">${supplierOptions(suppliers, "", "Fără furnizor")}</select></label>
          <label class="nx-field"><span>Comandă</span><select name="order_id">${orderOptions(orders, "", "Fără comandă")}</select></label>
          <label class="nx-field"><span>Recepție</span><select name="receipt_id">${receiptOptions(receipts, "", "Fără recepție")}</select></label>
          <label class="nx-field"><span>Factură</span><select name="bill_id">${billOptions(bills)}</select></label>
          <label class="nx-field"><span>Metodă alocare</span><select name="allocation_method"><option value="MANUAL">Manual</option><option value="VALOARE">După valoare</option><option value="CANTITATE">După cantitate</option><option value="GREUTATE">După greutate</option></select></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează cost</button>
        </form>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Costuri achiziții</h1><p>Costuri adiționale pentru analiza costului real de achiziție.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cost</th><th>Furnizor</th><th>Legătură</th><th>Status</th><th>Alocare</th><th class="nx-right">Valoare</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există costuri înregistrate.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderProcurementShell({ title: "Costuri achiziții", companyName, user: options.user, currentPath: "/nexora/procurement/costs", body });
}

function renderNexoraProcurementBillsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const suppliers = Array.isArray(options.suppliers) ? options.suppliers : [];
  const orders = Array.isArray(options.orders) ? options.orders : [];
  const receipts = Array.isArray(options.receipts) ? options.receipts : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.bill_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.doc_number || "fără nr. furnizor")} · ${escapeHtml(dateValue(row.issue_date) || "-")}</div></td>
      <td>${escapeHtml(row.supplier_name || "-")}<div class="nx-table-sub">${escapeHtml(row.supplier_cui || "")}</div></td>
      <td>${escapeHtml(row.order_number || row.receipt_number || "-")}</td>
      <td>${statusBadge(row.status)}<div class="nx-table-sub">${statusBadge(row.payment_status)}</div></td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
      <td class="nx-table-actions">
        ${row.attachment_path ? `<a class="nx-btn" href="/${encodeURI(row.attachment_path)}" target="_blank">Document</a>` : ""}
        <form method="post" action="/nexora/procurement/bills/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="VALIDATA"><button class="nx-btn" type="submit">Validează</button></form>
        <form method="post" action="/nexora/procurement/bills/${escapeHtml(row.id)}/payment"><input type="hidden" name="payment_status" value="PLATITA"><button class="nx-btn primary" type="submit">Plătită</button></form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${options.ok ? `<div class="nx-alert success">Factura furnizor a fost salvată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">BIL</div><div><div class="nx-kpi-label">Facturi</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DUE</div><div><div class="nx-kpi-label">Neplătite</div><div class="nx-kpi-value">${escapeHtml(stats.unpaid_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Valoare totală</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">PAY</div><div><div class="nx-kpi-label">De plată</div><div class="nx-kpi-value">${escapeHtml(money(stats.unpaid_amount, fmtMoney))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Factură furnizor nouă</h2><span>Document intern, fără flux ANAF</span></div></div>
        <form method="post" action="/nexora/procurement/bills/create" enctype="multipart/form-data" class="nx-form">
          <label class="nx-field"><span>Furnizor</span><select name="supplier_id" required>${supplierOptions(suppliers)}</select></label>
          <label class="nx-field"><span>Comandă</span><select name="order_id">${orderOptions(orders, "", "Fără comandă")}</select></label>
          <label class="nx-field"><span>Recepție</span><select name="receipt_id">${receiptOptions(receipts, "", "Fără recepție")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Nr. document furnizor</span><input name="doc_number"></label>
            <label class="nx-field"><span>Data emitere</span><input type="date" name="issue_date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}"></label>
            <label class="nx-field"><span>Scadență</span><input type="date" name="due_date"></label>
            <label class="nx-field"><span>Status plată</span><select name="payment_status"><option value="NEPLATITA">Neplătită</option><option value="PARTIALA">Parțială</option><option value="PLATITA">Plătită</option></select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Subtotal</span><input name="subtotal" value="0"></label>
            <label class="nx-field"><span>TVA</span><input name="vat_amount" value="0"></label>
            <label class="nx-field"><span>Total</span><input name="total" value="0"></label>
          </div>
          <label class="nx-field"><span>Document</span><input type="file" name="attachment"></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează factura</button>
        </form>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Facturi furnizori</h1><p>Facturi de cumpărare, atașamente și status plată. Documentele sunt reflectate și în cheltuieli.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Factură</th><th>Furnizor</th><th>Legătură</th><th>Status</th><th>Scadență</th><th class="nx-right">Total</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există facturi furnizori.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderProcurementShell({ title: "Facturi furnizori", companyName, user: options.user, currentPath: "/nexora/procurement/bills", body });
}

export {
  renderNexoraProcurementApprovalsPage,
  renderNexoraProcurementBillsPage,
  renderNexoraProcurementCostsPage,
  renderNexoraProcurementHubPage,
  renderNexoraProcurementOpportunitiesPage,
  renderNexoraProcurementOrdersPage,
  renderNexoraProcurementReceiptsPage,
  renderNexoraProcurementSuppliersPage
};
