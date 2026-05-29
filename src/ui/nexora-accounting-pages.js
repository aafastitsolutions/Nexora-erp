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

function paymentBadge(value) {
  const normalized = String(value || "NEPLATITA").trim().toUpperCase();
  if (normalized === "PLATITA") return `<span class="nx-status-pill success">plătită</span>`;
  if (normalized === "PARTIALA") return `<span class="nx-status-pill warn">parțială</span>`;
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase())}</span>`;
}

function declarationBadge(value) {
  const normalized = String(value || "PREGATITA").trim().toUpperCase();
  if (normalized === "VALIDATA") return `<span class="nx-status-pill success">validată</span>`;
  if (normalized === "TRIMISA") return `<span class="nx-status-pill warn">trimisă</span>`;
  if (normalized === "RESPINSA") return `<span class="nx-status-pill danger">respinsă</span>`;
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase())}</span>`;
}

function selected(actual, expected) {
  return String(actual || "").toUpperCase() === expected ? "selected" : "";
}

function checked(actual, expected) {
  return String(actual || "").toUpperCase() === expected ? "checked" : "";
}

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

function statusPill(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["CONFIRMATA", "RECONCILIATA", "VALIDATA", "ACTIV"].includes(normalized)) return `<span class="nx-status-pill success">${escapeHtml(normalized.toLowerCase())}</span>`;
  if (["PLANIFICATA", "NECORELATA", "PREGATITA"].includes(normalized)) return `<span class="nx-status-pill warn">${escapeHtml(normalized.toLowerCase())}</span>`;
  if (["RESPINSA", "ANULATA", "EROARE"].includes(normalized)) return `<span class="nx-status-pill danger">${escapeHtml(normalized.toLowerCase())}</span>`;
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase() || "-")}</span>`;
}

function directionLabel(direction) {
  return String(direction || "OUT").toUpperCase() === "IN" ? "Încasare" : "Plată";
}

function periodQuery(filters = {}) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function renderAccountingNav(activePath) {
  const items = [
    ["Generală", "/nexora/accounting"],
    ["Cheltuieli", "/nexora/accounting/expenses"],
    ["Declarații", "/nexora/accounting/declarations"],
    ["Plăți", "/nexora/accounting/payments"],
    ["Încasări", "/nexora/accounting/receipts"],
    ["Registre", "/nexora/accounting/registers"],
    ["Balanță", "/nexora/accounting/trial-balance"],
    ["Cashflow", "/nexora/accounting/cashflow"],
    ["Bugete", "/nexora/accounting/budgets"],
    ["Reconciliere", "/nexora/accounting/bank-reconciliation"],
    ["TVA", "/nexora/accounting/vat"],
    ["Active fixe", "/nexora/accounting/fixed-assets"]
  ];

  return `
    <div class="nx-module-tabs">
      ${items.map(([label, href]) => `<a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function renderNexoraAccountingExpensesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";
  const declarationCatalog = Array.isArray(options.declarationCatalog) ? options.declarationCatalog : [];
  const fmtMoney = options.fmtMoney;

  const okMessages = {
    created: "Cheltuiala a fost înregistrată."
  };

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <b>${escapeHtml(row.supplier_name || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(row.supplier_cui || "fără CUI")}</div>
        </td>
        <td>${escapeHtml(row.doc_number || "-")}</td>
        <td>${escapeHtml(row.category || row.expense_type || "-")}</td>
        <td>${paymentBadge(row.payment_status)}</td>
        <td>${escapeHtml(row.issue_date || "-")}</td>
        <td>${escapeHtml(row.due_date || "-")}</td>
        <td class="nx-right">${escapeHtml(money(row.total, fmtMoney))}</td>
        <td>${row.attachment_path ? `<a class="nx-table-main-link" href="/${encodeURI(row.attachment_path)}" target="_blank">Document</a>` : `<span class="nx-table-sub">—</span>`}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8"><div class="nx-empty-state">Nu există cheltuieli pentru criteriile curente.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/expenses")}
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">EXP</div><div><div class="nx-kpi-label">Înregistrări</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Valoare totală</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">OK</div><div><div class="nx-kpi-label">Plătite</div><div class="nx-kpi-value">${escapeHtml(stats.paid_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DUE</div><div><div class="nx-kpi-label">Neplătite</div><div class="nx-kpi-value">${escapeHtml(stats.unpaid_count || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Adaugă cheltuială</h2>
            <span>Facturi furnizor, bonuri și deconturi</span>
          </div>
        </div>
        <form method="post" action="/accounting/expenses/create" enctype="multipart/form-data" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip document</span><select name="expense_type"><option value="FACTURA">Factură furnizor</option><option value="BON_FISCAL">Bon fiscal</option><option value="CHITANTA">Chitanță</option><option value="DECONT">Decont</option><option value="ALTA">Alta</option></select></label>
            <label class="nx-field"><span>Categorie</span><select name="category"><option value="UTILITATI">Utilități</option><option value="CHIRIE">Chirie</option><option value="MATERIALE">Materiale</option><option value="PROTOCOL">Protocol</option><option value="TRANSPORT">Transport</option><option value="SERVICII">Servicii</option><option value="SALARII">Salarii</option><option value="TAXE">Taxe</option><option value="ALTELE">Altele</option></select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Furnizor</span><input name="supplier_name" required></label>
            <label class="nx-field"><span>CUI furnizor</span><input name="supplier_cui"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Număr document</span><input name="doc_number"></label>
            <label class="nx-field"><span>Status plată</span><select name="payment_status"><option value="NEPLATITA">Neplătită</option><option value="PLATITA">Plătită</option><option value="PARTIALA">Parțială</option></select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data emitere</span><input type="date" name="issue_date"></label>
            <label class="nx-field"><span>Scadență</span><input type="date" name="due_date"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Subtotal</span><input name="subtotal" value="0"></label>
            <label class="nx-field"><span>TVA</span><input name="vat_amount" value="0"></label>
            <label class="nx-field"><span>Total</span><input name="total" value="0"></label>
            <label class="nx-field"><span>Deductibil %</span><input name="deductible_percent" value="100"></label>
          </div>
          <label class="nx-field"><span>Document</span><input type="file" name="attachment"></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Salvează</button>
          </div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Filtre</h2>
            <span>${escapeHtml(rows.length)} rezultate</span>
          </div>
        </div>
        <form method="get" action="/nexora/accounting/expenses" class="nx-form">
          <label class="nx-field"><span>Status plată</span><select name="payment_status"><option value="">toate</option><option value="NEPLATITA" ${selected(filters.paymentStatus, "NEPLATITA")}>neplătite</option><option value="PLATITA" ${selected(filters.paymentStatus, "PLATITA")}>plătite</option><option value="PARTIALA" ${selected(filters.paymentStatus, "PARTIALA")}>parțiale</option></select></label>
          <label class="nx-field"><span>Categorie</span><input name="category" value="${escapeHtml(filters.category || "")}" placeholder="ex: UTILITATI"></label>
          <label class="nx-field"><span>Căutare</span><input name="search" value="${escapeHtml(filters.search || "")}" placeholder="furnizor, CUI, număr document"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Aplică</button>
            <a class="nx-btn" href="/nexora/accounting/expenses">Reset</a>
            <a class="nx-btn" href="/nexora/accounting">Contabilitate</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Cheltuieli</h1>
          <p>Registru operațional pentru documente de furnizor și cheltuieli deductibile.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Furnizor</th><th>Document</th><th>Categorie</th><th>Status</th><th>Emitere</th><th>Scadență</th><th class="nx-right">Total</th><th>Fișier</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Cheltuieli",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/expenses",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Cheltuieli",
    body
  });
}

function renderNexoraAccountingDeclarationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";

  const okMessages = {
    created: "Declarația a fost înregistrată."
  };

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/nexora/accounting/declarations/${escapeHtml(row.id)}">${escapeHtml(row.declaration_type || "-")}</a>
          <div class="nx-table-sub">${escapeHtml(row.period_label || "fără perioadă")}</div>
        </td>
        <td>${declarationBadge(row.status)}</td>
        <td>${escapeHtml(row.due_date || "-")}</td>
        <td>${escapeHtml(row.reference_number || "-")}</td>
        <td>${escapeHtml(row.submission_channel || "-")}</td>
        <td>
          ${row.attachment_path ? `<a class="nx-table-main-link" href="/${encodeURI(row.attachment_path)}" target="_blank">Declarație</a>` : `<span class="nx-table-sub">—</span>`}
          ${row.receipt_path ? `<a class="nx-table-main-link" href="/${encodeURI(row.receipt_path)}" target="_blank">Recipisă</a>` : ""}
        </td>
        <td><a class="nx-btn" href="/nexora/accounting/declarations/${escapeHtml(row.id)}">Detalii</a></td>
      </tr>
    `).join("")
    : `<tr><td colspan="7"><div class="nx-empty-state">Nu există declarații pentru criteriile curente.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/declarations")}
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DEC</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">PRE</div><div><div class="nx-kpi-label">Pregătite</div><div class="nx-kpi-value">${escapeHtml(stats.pregatita_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">TRM</div><div><div class="nx-kpi-label">Trimise</div><div class="nx-kpi-value">${escapeHtml(stats.trimisa_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">VAL</div><div><div class="nx-kpi-label">Validate</div><div class="nx-kpi-value">${escapeHtml(stats.validata_count || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Modele oficiale ANAF</h1>
          <p>Catalog rapid pentru formularele folosite cel mai des. PDF-urile inteligente se descarcă din sursa oficială și se deschid în Adobe Reader.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="https://static.anaf.ro/static/10/Anaf/formulare/toate_formularele.htm" target="_blank">Toate formularele</a>
          <a class="nx-btn" href="https://www.anaf.ro/declaratii/" target="_blank">Portal formulare</a>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Cod</th><th>Ce găsește utilizatorul</th><th>Frecvență</th><th>Depunere</th><th></th></tr></thead>
          <tbody>
            ${declarationCatalog.map((item) => `
              <tr>
                <td><b>${escapeHtml(item.code)}</b></td>
                <td><div>${escapeHtml(item.title)}</div><div class="nx-table-sub">${escapeHtml(item.description || "")}</div></td>
                <td>${escapeHtml(item.frequency || "-")}</td>
                <td>${escapeHtml(item.channel || "SPV / e-guvernare")}</td>
                <td class="nx-table-actions">
                  <a class="nx-btn" href="${escapeHtml(item.sourceUrl)}" target="_blank">Deschide model</a>
                  <a class="nx-btn primary" href="/nexora/accounting/declarations?type=${encodeURIComponent(item.code)}">Pregătește</a>
                </td>
              </tr>
            `).join("") || `<tr><td colspan="5"><div class="nx-empty-state">Catalogul nu este configurat.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Adaugă declarație</h2>
            <span>Evidență ANAF</span>
          </div>
        </div>
        <form method="post" action="/accounting/declarations/create" enctype="multipart/form-data" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip declarație</span><select name="declaration_type"><option ${selected(filters.typeFilter, "D100")}>D100</option><option ${selected(filters.typeFilter, "D101")}>D101</option><option ${selected(filters.typeFilter, "D112")}>D112</option><option ${selected(filters.typeFilter, "D300")}>D300</option><option ${selected(filters.typeFilter, "D390")}>D390</option><option ${selected(filters.typeFilter, "D394")}>D394</option><option value="D406" ${selected(filters.typeFilter, "D406")}>D406</option><option ${selected(filters.typeFilter, "D700")}>D700</option><option ${selected(filters.typeFilter, "D710")}>D710</option><option ${selected(filters.typeFilter, "BILANT")}>BILANT</option><option ${selected(filters.typeFilter, "ALTA")}>ALTA</option></select></label>
            <label class="nx-field"><span>Perioadă</span><input name="period_label" placeholder="ex: martie 2026"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Start perioadă</span><input type="date" name="period_start"></label>
            <label class="nx-field"><span>Sfârșit perioadă</span><input type="date" name="period_end"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Scadență</span><input type="date" name="due_date"></label>
            <label class="nx-field"><span>Status</span><select name="status"><option value="PREGATITA">Pregătită</option><option value="TRIMISA">Trimisă</option><option value="VALIDATA">Validată</option><option value="RESPINSA">Respinsă</option></select></label>
          </div>
          <label class="nx-field"><span>Canal</span><select name="submission_channel"><option value="MANUAL_SPV">Manual SPV</option><option value="E_GUVERNARE">e-Guvernare</option><option value="ALT_CANAL">Alt canal</option></select></label>
          <label class="nx-field"><span>Număr referință ANAF</span><input name="reference_number"></label>
          <label class="nx-field"><span>Fișier declarație</span><input type="file" name="attachment"></label>
          <label class="nx-field"><span>Recipisă / confirmare</span><input type="file" name="receipt"></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Salvează</button>
          </div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Filtre</h2>
            <span>${escapeHtml(rows.length)} rezultate</span>
          </div>
        </div>
        <form method="get" action="/nexora/accounting/declarations" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="">toate</option><option value="PREGATITA" ${selected(filters.statusFilter, "PREGATITA")}>pregătite</option><option value="TRIMISA" ${selected(filters.statusFilter, "TRIMISA")}>trimise</option><option value="VALIDATA" ${selected(filters.statusFilter, "VALIDATA")}>validate</option><option value="RESPINSA" ${selected(filters.statusFilter, "RESPINSA")}>respinse</option></select></label>
          <label class="nx-field"><span>Tip</span><input name="type" value="${escapeHtml(filters.typeFilter || "")}" placeholder="ex: D112"></label>
          <label class="nx-field"><span>Căutare</span><input name="search" value="${escapeHtml(filters.search || "")}" placeholder="perioadă / referință"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Aplică</button>
            <a class="nx-btn" href="/nexora/accounting/declarations">Reset</a>
            <a class="nx-btn" href="/nexora/accounting">Contabilitate</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Declarații</h1>
          <p>Urmărire declarații fiscale, perioade, fișiere și recipise.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Declarație</th><th>Status</th><th>Scadență</th><th>Nr. înregistrare</th><th>Canal</th><th>Fișiere</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Declarații",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/declarations",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Declarații",
    body
  });
}

function renderStatusAction(id, nextStatus, label, tone = "") {
  return `
    <form method="post" action="/accounting/declarations/${escapeHtml(id)}/status">
      <input type="hidden" name="return_to" value="nexora">
      <input type="hidden" name="status" value="${escapeHtml(nextStatus)}">
      <button class="nx-btn ${escapeHtml(tone)}" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function renderNexoraAccountingDeclarationDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const row = options.row || {};
  const ok = options.ok || "";
  const currentStatus = String(row.status || "PREGATITA").toUpperCase();
  const actions = currentStatus === "PREGATITA"
    ? renderStatusAction(row.id, "TRIMISA", "Marchează trimisă", "primary")
    : currentStatus === "TRIMISA"
      ? `${renderStatusAction(row.id, "VALIDATA", "Marchează validată", "primary")}${renderStatusAction(row.id, "RESPINSA", "Marchează respinsă", "danger")}`
      : currentStatus === "RESPINSA"
        ? renderStatusAction(row.id, "PREGATITA", "Revino la pregătită")
        : renderStatusAction(row.id, "TRIMISA", "Retrimite");

  const body = `
    ${ok ? `<div class="nx-alert success">Declarația a fost actualizată.</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(row.declaration_type || "Declarație")}</h1>
          <p>${escapeHtml(row.period_label || "fără perioadă")} · ${declarationBadge(row.status)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/accounting/declarations">Înapoi</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PER</div><div><div class="nx-kpi-label">Perioadă</div><div class="nx-kpi-value">${escapeHtml(row.period_label || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DUE</div><div><div class="nx-kpi-label">Scadență</div><div class="nx-kpi-value">${escapeHtml(row.due_date || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">REF</div><div><div class="nx-kpi-label">Referință</div><div class="nx-kpi-value">${escapeHtml(row.reference_number || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">SPV</div><div><div class="nx-kpi-label">Canal</div><div class="nx-kpi-value">${escapeHtml(row.submission_channel || "-")}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Actualizare depunere</h2>
            <span>Documente și status</span>
          </div>
        </div>
        <form method="post" action="/accounting/declarations/${escapeHtml(row.id)}/update" enctype="multipart/form-data" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Status</span><select name="status"><option value="PREGATITA" ${selected(row.status, "PREGATITA")}>Pregătită</option><option value="TRIMISA" ${selected(row.status, "TRIMISA")}>Trimisă</option><option value="VALIDATA" ${selected(row.status, "VALIDATA")}>Validată</option><option value="RESPINSA" ${selected(row.status, "RESPINSA")}>Respinsă</option></select></label>
            <label class="nx-field"><span>Număr de înregistrare ANAF</span><input name="reference_number" value="${escapeHtml(row.reference_number || "")}"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Fișier depunere nou</span><input type="file" name="attachment"></label>
            <label class="nx-field"><span>Recipisă nouă</span><input type="file" name="receipt"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="4">${escapeHtml(row.notes || "")}</textarea></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Salvează</button>
          </div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Acțiuni rapide</h2>
            <span>Flux ANAF</span>
          </div>
        </div>
        <div class="nx-form-actions">${actions}</div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <tbody>
              <tr><th>Fișier depunere</th><td>${row.attachment_path ? `<a class="nx-table-main-link" href="/${encodeURI(row.attachment_path)}" target="_blank">Deschide declarația</a>` : `<span class="nx-table-sub">Nu există</span>`}</td></tr>
              <tr><th>Recipisă</th><td>${row.receipt_path ? `<a class="nx-table-main-link" href="/${encodeURI(row.receipt_path)}" target="_blank">Deschide recipisa</a>` : `<span class="nx-table-sub">Nu există</span>`}</td></tr>
              <tr><th>Actualizat la</th><td>${escapeHtml(row.updated_at || row.created_at || "-")}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  return renderNexoraShell({
    title: row.declaration_type ? `Declarație ${row.declaration_type}` : "Declarație",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/declarations",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Declarație",
    body
  });
}

function renderNexoraAccountingTransactionsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const fmtMoney = options.fmtMoney;
  const direction = String(options.direction || "OUT").toUpperCase() === "IN" ? "IN" : "OUT";
  const isReceipt = direction === "IN";
  const pagePath = isReceipt ? "/nexora/accounting/receipts" : "/nexora/accounting/payments";
  const title = isReceipt ? "Încasări" : "Plăți";
  const actionText = isReceipt ? "Adaugă încasare" : "Adaugă plată";
  const ok = options.ok || "";

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <b>${escapeHtml(row.partner_name || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(row.partner_cui || "fără CUI")}</div>
        </td>
        <td>
          <div>${escapeHtml(row.document_type || "-")} ${escapeHtml(row.document_number || "")}</div>
          <div class="nx-table-sub">${escapeHtml(row.reference || "")}</div>
        </td>
        <td>${escapeHtml(row.category || "-")}</td>
        <td>${statusPill(row.status)}</td>
        <td>${escapeHtml(row.payment_method || "-")}</td>
        <td>${escapeHtml(dateValue(row.transaction_date) || "-")}</td>
        <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
        <td>${row.attachment_path ? `<a class="nx-table-main-link" href="/${encodeURI(row.attachment_path)}" target="_blank">Document</a>` : `<span class="nx-table-sub">—</span>`}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8"><div class="nx-empty-state">Nu există ${isReceipt ? "încasări" : "plăți"} pentru criteriile curente.</div></td></tr>`;

  const body = `
    ${renderAccountingNav(pagePath)}
    ${ok ? `<div class="nx-alert success">${escapeHtml(isReceipt ? "Încasarea a fost salvată." : "Plata a fost salvată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">${isReceipt ? "INC" : "PAY"}</div><div><div class="nx-kpi-label">Înregistrări</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RON</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">OK</div><div><div class="nx-kpi-label">Confirmate</div><div class="nx-kpi-value">${escapeHtml(stats.confirmed_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">REC</div><div><div class="nx-kpi-label">Necorelate</div><div class="nx-kpi-value">${escapeHtml(stats.open_count || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>${escapeHtml(actionText)}</h2><span>${isReceipt ? "bancă, POS, numerar sau OP primit" : "furnizori, taxe, salarii sau cheltuieli"}</span></div></div>
        <form method="post" action="${pagePath}/create" enctype="multipart/form-data" class="nx-form">
          <input type="hidden" name="direction" value="${direction}">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Partener</span><input name="partner_name" required></label>
            <label class="nx-field"><span>CUI partener</span><input name="partner_cui"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip document</span><select name="document_type"><option>OP</option><option>EXTRAS</option><option>CHITANTA</option><option>CONTRACT</option><option>STAT_PLATA</option><option>ALTA</option></select></label>
            <label class="nx-field"><span>Număr document</span><input name="document_number"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Categorie</span><input name="category" placeholder="${isReceipt ? "ex: VÂNZĂRI / AVANS / ALTE VENITURI" : "ex: FURNIZORI / TAXE / SALARII"}"></label>
            <label class="nx-field"><span>Metodă</span><select name="payment_method"><option>BANCA</option><option>CARD</option><option>NUMERAR</option><option>TREZORERIE</option><option>ALTĂ METODĂ</option></select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data</span><input type="date" name="transaction_date" value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="nx-field"><span>Status</span><select name="status"><option value="NECORELATA">Necorelată</option><option value="PLANIFICATA">Planificată</option><option value="CONFIRMATA">Confirmată</option><option value="RECONCILIATA">Reconciliată</option></select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Valoare</span><input type="number" step="0.01" name="amount" value="0"></label>
            <label class="nx-field"><span>TVA inclus</span><input type="number" step="0.01" name="vat_amount" value="0"></label>
            <label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label>
            <label class="nx-field"><span>Cont / IBAN</span><input name="bank_account"></label>
          </div>
          <label class="nx-field"><span>Referință extras</span><input name="reference"></label>
          <label class="nx-field"><span>Document suport</span><input type="file" name="attachment"></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează</button></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre</h2><span>${escapeHtml(rows.length)} rezultate</span></div></div>
        <form method="get" action="${pagePath}" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>De la</span><input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}"></label>
            <label class="nx-field"><span>Până la</span><input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}"></label>
          </div>
          <label class="nx-field"><span>Status</span><select name="status"><option value="">toate</option><option value="NECORELATA" ${selected(filters.status, "NECORELATA")}>necorelate</option><option value="PLANIFICATA" ${selected(filters.status, "PLANIFICATA")}>planificate</option><option value="CONFIRMATA" ${selected(filters.status, "CONFIRMATA")}>confirmate</option><option value="RECONCILIATA" ${selected(filters.status, "RECONCILIATA")}>reconciliate</option></select></label>
          <label class="nx-field"><span>Căutare</span><input name="search" value="${escapeHtml(filters.search || "")}" placeholder="partener, document, referință"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Aplică</button>
            <a class="nx-btn" href="${pagePath}">Reset</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>${escapeHtml(title)}</h1><p>Registru operațional pentru ${isReceipt ? "banii intrați în firmă" : "banii ieșiți din firmă"}, util la reconciliere și cashflow.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Partener</th><th>Document</th><th>Categorie</th><th>Status</th><th>Metodă</th><th>Data</th><th class="nx-right">Valoare</th><th>Fișier</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: pagePath,
    eyebrow: "Financiar & Contabilitate",
    pageTitle: title,
    body
  });
}

function renderNexoraAccountingRegistersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(dateValue(row.entry_date) || "-")}</td>
        <td><b>${escapeHtml(row.document_type || "-")} ${escapeHtml(row.document_number || "")}</b><div class="nx-table-sub">${escapeHtml(row.partner_name || "")}</div></td>
        <td><span class="nx-table-sub">Debit</span><br><b>${escapeHtml(row.account_debit || "-")}</b></td>
        <td><span class="nx-table-sub">Credit</span><br><b>${escapeHtml(row.account_credit || "-")}</b></td>
        <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
        <td>${escapeHtml(row.tax_code || "-")}</td>
        <td>${escapeHtml(row.description || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7"><div class="nx-empty-state">Nu există note contabile pentru filtrele curente.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/registers")}
    ${ok ? `<div class="nx-alert success">Nota contabilă a fost salvată.</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">REG</div><div><div class="nx-kpi-label">Note</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">D</div><div><div class="nx-kpi-label">Debit total</div><div class="nx-kpi-value">${escapeHtml(money(stats.debit_total, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">C</div><div><div class="nx-kpi-label">Credit total</div><div class="nx-kpi-value">${escapeHtml(money(stats.credit_total, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">MAN</div><div><div class="nx-kpi-label">Manuale</div><div class="nx-kpi-value">${escapeHtml(stats.manual_count || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă notă contabilă</h2><span>Debit / credit, document și explicație</span></div></div>
        <form method="post" action="/nexora/accounting/registers/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data</span><input type="date" name="entry_date" value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="nx-field"><span>Partener</span><input name="partner_name"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip document</span><input name="document_type" placeholder="ex: NIR / OP / NC"></label>
            <label class="nx-field"><span>Număr document</span><input name="document_number"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cont debit</span><input name="account_debit" required placeholder="ex: 628"></label>
            <label class="nx-field"><span>Cont credit</span><input name="account_credit" required placeholder="ex: 401"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Valoare</span><input type="number" step="0.01" name="amount" value="0"></label>
            <label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label>
            <label class="nx-field"><span>Cod taxă</span><input name="tax_code" placeholder="TVA19 / scutit"></label>
          </div>
          <label class="nx-field"><span>Explicație</span><textarea name="description" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează nota</button></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre registru</h2><span>${escapeHtml(rows.length)} afișate</span></div></div>
        <form method="get" action="/nexora/accounting/registers" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>De la</span><input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}"></label>
            <label class="nx-field"><span>Până la</span><input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}"></label>
          </div>
          <label class="nx-field"><span>Căutare</span><input name="search" value="${escapeHtml(filters.search || "")}" placeholder="cont, partener, document"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică</button><a class="nx-btn" href="/nexora/accounting/registers">Reset</a><a class="nx-btn" href="/nexora/accounting/trial-balance">Balanță</a></div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Registru note contabile</h1><p>Jurnal manual pentru operațiuni care nu vin încă din module dedicate.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Document</th><th>Debit</th><th>Credit</th><th class="nx-right">Valoare</th><th>Taxă</th><th>Explicație</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;

  return renderNexoraShell({
    title: "Registre contabile",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/registers",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Registre",
    body
  });
}

function renderNexoraAccountingTrialBalancePage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const balances = Array.isArray(options.balances) ? options.balances : [];
  const totals = options.totals || {};
  const filters = options.filters || {};
  const fmtMoney = options.fmtMoney;

  const rowsHtml = balances.length
    ? balances.map((row) => `
      <tr>
        <td><b>${escapeHtml(row.account || "-")}</b></td>
        <td class="nx-right">${escapeHtml(money(row.debit_turnover, fmtMoney))}</td>
        <td class="nx-right">${escapeHtml(money(row.credit_turnover, fmtMoney))}</td>
        <td class="nx-right">${escapeHtml(money(row.debit_balance, fmtMoney))}</td>
        <td class="nx-right">${escapeHtml(money(row.credit_balance, fmtMoney))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5"><div class="nx-empty-state">Balanța se va popula după ce există note contabile în registru.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/trial-balance")}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">CNT</div><div><div class="nx-kpi-label">Conturi</div><div class="nx-kpi-value">${escapeHtml(balances.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">D</div><div><div class="nx-kpi-label">Rulaj debit</div><div class="nx-kpi-value">${escapeHtml(money(totals.debit_turnover, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">C</div><div><div class="nx-kpi-label">Rulaj credit</div><div class="nx-kpi-value">${escapeHtml(money(totals.credit_turnover, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DIF</div><div><div class="nx-kpi-label">Diferență</div><div class="nx-kpi-value">${escapeHtml(money((totals.debit_turnover || 0) - (totals.credit_turnover || 0), fmtMoney))}</div></div></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Balanță de verificare</h1><p>Rulaje debit/credit calculate din notele contabile manuale.</p></div><a class="nx-btn primary" href="/nexora/accounting/registers">Adaugă note</a></div>
      <form method="get" action="/nexora/accounting/trial-balance" class="nx-inline-form">
        <input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}">
        <input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}">
        <button class="nx-btn primary" type="submit">Aplică</button>
        <a class="nx-btn" href="/nexora/accounting/trial-balance">Reset</a>
      </form>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cont</th><th class="nx-right">Rulaj debit</th><th class="nx-right">Rulaj credit</th><th class="nx-right">Sold debit</th><th class="nx-right">Sold credit</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;

  return renderNexoraShell({
    title: "Balanță",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/trial-balance",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Balanță",
    body
  });
}

function renderNexoraAccountingCashflowPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const summary = Array.isArray(options.summary) ? options.summary : [];
  const recent = Array.isArray(options.recent) ? options.recent : [];
  const totals = options.totals || {};
  const fmtMoney = options.fmtMoney;

  const summaryRows = summary.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.period || "-")}</b></td>
      <td class="nx-right">${escapeHtml(money(row.in_amount, fmtMoney))}</td>
      <td class="nx-right">${escapeHtml(money(row.out_amount, fmtMoney))}</td>
      <td class="nx-right">${escapeHtml(money((row.in_amount || 0) - (row.out_amount || 0), fmtMoney))}</td>
    </tr>
  `).join("");

  const recentRows = recent.map((row) => `
    <tr>
      <td>${escapeHtml(dateValue(row.transaction_date) || "-")}</td>
      <td>${escapeHtml(directionLabel(row.direction))}</td>
      <td><b>${escapeHtml(row.partner_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.category || "")}</div></td>
      <td>${statusPill(row.status)}</td>
      <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
    </tr>
  `).join("");

  const body = `
    ${renderAccountingNav("/nexora/accounting/cashflow")}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">IN</div><div><div class="nx-kpi-label">Încasări</div><div class="nx-kpi-value">${escapeHtml(money(totals.in_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OUT</div><div><div class="nx-kpi-label">Plăți</div><div class="nx-kpi-value">${escapeHtml(money(totals.out_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">NET</div><div><div class="nx-kpi-label">Net</div><div class="nx-kpi-value">${escapeHtml(money((totals.in_amount || 0) - (totals.out_amount || 0), fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">TRX</div><div><div class="nx-kpi-label">Tranzacții</div><div class="nx-kpi-value">${escapeHtml(totals.total_count || 0)}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Cashflow lunar</h1><p>Încasări minus plăți, pe luni.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Lună</th><th class="nx-right">Încasări</th><th class="nx-right">Plăți</th><th class="nx-right">Net</th></tr></thead><tbody>${summaryRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există tranzacții cashflow.</div></td></tr>`}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Ultimele tranzacții</h1><p>Flux agregat din plăți și încasări.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Tip</th><th>Partener</th><th>Status</th><th class="nx-right">Valoare</th></tr></thead><tbody>${recentRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există tranzacții.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderNexoraShell({
    title: "Cashflow",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/cashflow",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Cashflow",
    body
  });
}

function renderNexoraAccountingBudgetsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const totals = options.totals || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const rowsHtml = rows.length
    ? rows.map((row) => {
      const variance = Number(row.planned_amount || 0) - Number(row.actual_amount || 0);
      return `
        <tr>
          <td><b>${escapeHtml(row.period_label || `${dateValue(row.period_start)} - ${dateValue(row.period_end)}`)}</b><div class="nx-table-sub">${escapeHtml(row.owner || "")}</div></td>
          <td>${escapeHtml(row.budget_type || "-")}</td>
          <td>${escapeHtml(row.category || "-")}</td>
          <td class="nx-right">${escapeHtml(money(row.planned_amount, fmtMoney))}</td>
          <td class="nx-right">${escapeHtml(money(row.actual_amount, fmtMoney))}</td>
          <td class="nx-right">${escapeHtml(money(variance, fmtMoney))}</td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există bugete definite.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/budgets")}
    ${ok ? `<div class="nx-alert success">Bugetul a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">BUG</div><div><div class="nx-kpi-label">Bugete</div><div class="nx-kpi-value">${escapeHtml(rows.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">PLAN</div><div><div class="nx-kpi-label">Planificat</div><div class="nx-kpi-value">${escapeHtml(money(totals.planned_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">ACT</div><div><div class="nx-kpi-label">Realizat</div><div class="nx-kpi-value">${escapeHtml(money(totals.actual_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">VAR</div><div><div class="nx-kpi-label">Diferență</div><div class="nx-kpi-value">${escapeHtml(money((totals.planned_amount || 0) - (totals.actual_amount || 0), fmtMoney))}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă buget</h2><span>Plan pe perioadă și categorie</span></div></div>
        <form method="post" action="/nexora/accounting/budgets/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Etichetă</span><input name="period_label" placeholder="ex: Q2 2026"></label>
            <label class="nx-field"><span>Responsabil</span><input name="owner"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Start</span><input type="date" name="period_start" required></label>
            <label class="nx-field"><span>Sfârșit</span><input type="date" name="period_end" required></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip</span><select name="budget_type"><option value="CHELTUIALA">Cheltuială</option><option value="VENIT">Venit</option></select></label>
            <label class="nx-field"><span>Categorie</span><input name="category" required placeholder="ex: SERVICII / MARKETING"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Valoare planificată</span><input type="number" step="0.01" name="planned_amount" value="0"></label>
            <label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează buget</button></div>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Execuție bugete</h1><p>Realizatul se calculează din plăți/încasări pe aceeași categorie și perioadă.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Perioadă</th><th>Tip</th><th>Categorie</th><th class="nx-right">Planificat</th><th class="nx-right">Realizat</th><th class="nx-right">Diferență</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      </section>
    </div>
  `;

  return renderNexoraShell({
    title: "Bugete",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/budgets",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Bugete",
    body
  });
}

function renderNexoraAccountingBankReconciliationPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";
  const candidateOptions = candidates.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(`${dateValue(row.transaction_date)} · ${directionLabel(row.direction)} · ${row.partner_name || "-"} · ${money(row.amount, fmtMoney)}`)}</option>`).join("");

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td><b>${escapeHtml(dateValue(row.transaction_date) || "-")}</b><div class="nx-table-sub">${escapeHtml(row.bank_name || "")}</div></td>
        <td>${escapeHtml(directionLabel(row.direction))}</td>
        <td><b>${escapeHtml(row.partner_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.description || row.reference || "")}</div></td>
        <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
        <td>${statusPill(row.reconciliation_status)}</td>
        <td>
          <form method="post" action="/nexora/accounting/bank-reconciliation/${escapeHtml(row.id)}/match" class="nx-inline-form">
            <select name="cash_transaction_id"><option value="">Fără legătură</option>${candidateOptions}</select>
            <button class="nx-btn" type="submit">Leagă</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există tranzacții bancare de reconciliat.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/bank-reconciliation")}
    ${ok ? `<div class="nx-alert success">Reconcilierea a fost actualizată.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">BNK</div><div><div class="nx-kpi-label">Tranzacții bancă</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Reconciliate</div><div class="nx-kpi-value">${escapeHtml(stats.matched_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OPEN</div><div><div class="nx-kpi-label">Necorelate</div><div class="nx-kpi-value">${escapeHtml(stats.open_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">CND</div><div><div class="nx-kpi-label">Candidați</div><div class="nx-kpi-value">${escapeHtml(candidates.length)}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă extras bancar</h2><span>Linie manuală din extras, pentru reconciliere</span></div></div>
        <form method="post" action="/nexora/accounting/bank-reconciliation/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Bancă</span><input name="bank_name"></label>
            <label class="nx-field"><span>IBAN</span><input name="account_iban"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data tranzacției</span><input type="date" name="transaction_date" value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="nx-field"><span>Data valută</span><input type="date" name="value_date"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip</span><select name="direction"><option value="IN">Încasare</option><option value="OUT">Plată</option></select></label>
            <label class="nx-field"><span>Partener</span><input name="partner_name"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Valoare</span><input type="number" step="0.01" name="amount" value="0"></label>
            <label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label>
          </div>
          <label class="nx-field"><span>Referință</span><input name="reference"></label>
          <label class="nx-field"><span>Descriere extras</span><textarea name="description" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează linia</button></div>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Reconciliere bancară</h1><p>Leagă liniile din extras de plățile și încasările înregistrate în Nexora.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Tip</th><th>Partener / descriere</th><th class="nx-right">Valoare</th><th>Status</th><th>Acțiune</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      </section>
    </div>
  `;

  return renderNexoraShell({
    title: "Reconciliere bancară",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/bank-reconciliation",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Reconciliere bancară",
    body
  });
}

function renderNexoraAccountingVatPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const fmtMoney = options.fmtMoney;

  const rowsHtml = rows.map((row) => `
    <tr>
      <td>${escapeHtml(dateValue(row.doc_date) || "-")}</td>
      <td>${escapeHtml(row.source || "-")}</td>
      <td><b>${escapeHtml(row.partner_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.doc_number || "")}</div></td>
      <td class="nx-right">${escapeHtml(money(row.base_amount, fmtMoney))}</td>
      <td class="nx-right">${escapeHtml(money(row.vat_amount, fmtMoney))}</td>
      <td>${escapeHtml(row.tax_code || "TVA")}</td>
    </tr>
  `).join("");

  const body = `
    ${renderAccountingNav("/nexora/accounting/vat")}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">CO</div><div><div class="nx-kpi-label">TVA colectată</div><div class="nx-kpi-value">${escapeHtml(money(stats.output_vat, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DE</div><div><div class="nx-kpi-label">TVA deductibilă</div><div class="nx-kpi-value">${escapeHtml(money(stats.input_vat, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">NET</div><div><div class="nx-kpi-label">TVA de plată</div><div class="nx-kpi-value">${escapeHtml(money((stats.output_vat || 0) - (stats.input_vat || 0), fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DOC</div><div><div class="nx-kpi-label">Documente</div><div class="nx-kpi-value">${escapeHtml(rows.length)}</div></div></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Jurnal TVA</h1><p>Centralizare TVA din facturi emise și cheltuieli înregistrate, fără trimitere automată ANAF.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/accounting/declarations?type=D300">Pregătește D300</a>
          <a class="nx-btn" href="/nexora/accounting/declarations?type=D394">Pregătește D394</a>
        </div>
      </div>
      <form method="get" action="/nexora/accounting/vat" class="nx-inline-form">
        <input type="date" name="date_from" value="${escapeHtml(filters.dateFrom || "")}">
        <input type="date" name="date_to" value="${escapeHtml(filters.dateTo || "")}">
        <button class="nx-btn primary" type="submit">Aplică</button>
        <a class="nx-btn" href="/nexora/accounting/vat">Reset</a>
      </form>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Sursă</th><th>Partener / document</th><th class="nx-right">Bază</th><th class="nx-right">TVA</th><th>Cod</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există documente TVA pentru perioada curentă.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderNexoraShell({
    title: "TVA",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/vat",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "TVA",
    body
  });
}

function renderNexoraAccountingFixedAssetsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td><b>${escapeHtml(row.asset_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.asset_name || "")}</div></td>
        <td>${escapeHtml(row.category || "-")}</td>
        <td>${escapeHtml(dateValue(row.purchase_date) || "-")}</td>
        <td class="nx-right">${escapeHtml(money(row.purchase_value, fmtMoney))}</td>
        <td class="nx-right">${escapeHtml(money(row.monthly_depreciation, fmtMoney))}</td>
        <td class="nx-right">${escapeHtml(money(row.accumulated_depreciation, fmtMoney))}</td>
        <td>${statusPill(row.status)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7"><div class="nx-empty-state">Nu există mijloace fixe înregistrate.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/fixed-assets")}
    ${ok ? `<div class="nx-alert success">Activul fix a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">MF</div><div><div class="nx-kpi-label">Active fixe</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">VAL</div><div><div class="nx-kpi-label">Valoare achiziție</div><div class="nx-kpi-value">${escapeHtml(money(stats.purchase_value, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">AMZ</div><div><div class="nx-kpi-label">Amortizare lunară</div><div class="nx-kpi-value">${escapeHtml(money(stats.monthly_depreciation, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">NET</div><div><div class="nx-kpi-label">Valoare rămasă</div><div class="nx-kpi-value">${escapeHtml(money(stats.net_value, fmtMoney))}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă mijloc fix</h2><span>Registru imobilizări</span></div></div>
        <form method="post" action="/nexora/accounting/fixed-assets/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Cod activ</span><input name="asset_code" required placeholder="MF-001"></label>
            <label class="nx-field"><span>Denumire</span><input name="asset_name" required></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Categorie</span><input name="category" value="IMOBILIZARI"></label>
            <label class="nx-field"><span>Locație</span><input name="location"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Data achiziției</span><input type="date" name="purchase_date"></label>
            <label class="nx-field"><span>Valoare achiziție</span><input type="number" step="0.01" name="purchase_value" value="0"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Durată amortizare luni</span><input type="number" name="useful_life_months" value="36"></label>
            <label class="nx-field"><span>Valoare reziduală</span><input type="number" step="0.01" name="residual_value" value="0"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Furnizor</span><input name="supplier_name"></label>
            <label class="nx-field"><span>Document achiziție</span><input name="invoice_number"></label>
          </div>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează activul</button><a class="nx-btn" href="/nexora/inventory/assets">Inventar</a></div>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Registru active fixe</h1><p>Amortizare liniară estimată pe baza valorii și duratei în luni.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Activ</th><th>Categorie</th><th>Achiziție</th><th class="nx-right">Valoare</th><th class="nx-right">Amortizare/lună</th><th class="nx-right">Amortizat</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      </section>
    </div>
  `;

  return renderNexoraShell({
    title: "Active fixe",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/fixed-assets",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Active fixe",
    body
  });
}

function renderNexoraAccountingConsumptionPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const products = Array.isArray(options.products) ? options.products : [];
  const vouchers = Array.isArray(options.vouchers) ? options.vouchers : [];
  const stats = options.stats || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";
  const productOptions = products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim())} · ${escapeHtml(product.unit || "buc")}</option>`).join("");
  const lineInputs = Array.from({ length: 4 }, (_, index) => `
    <div class="nx-two-column-grid compact">
      <label class="nx-field"><span>Produs ${index + 1}</span><select name="product_id"><option value="">Selectează</option>${productOptions}</select></label>
      <label class="nx-field"><span>Cantitate</span><input type="number" step="0.01" name="qty" value="0"></label>
      <label class="nx-field"><span>UM</span><input name="unit" placeholder="buc"></label>
      <label class="nx-field"><span>Cost unitar</span><input type="number" step="0.01" name="unit_cost" value="0"></label>
    </div>
  `).join("");

  const rowsHtml = vouchers.length
    ? vouchers.map((row) => `
      <tr>
        <td><a class="nx-table-main-link" href="/nexora/accounting/consumption/${escapeHtml(row.id)}">${escapeHtml(row.voucher_number || "-")}</a></td>
        <td>${escapeHtml(dateValue(row.issue_date) || "-")}</td>
        <td>${escapeHtml(row.department || "-")}</td>
        <td>${escapeHtml(row.issued_to || "-")}</td>
        <td class="nx-right">${escapeHtml(row.items_count || 0)}</td>
        <td class="nx-right">${escapeHtml(money(row.total_amount, fmtMoney))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există bonuri de consum.</div></td></tr>`;

  const body = `
    ${renderAccountingNav("/nexora/accounting/consumption")}
    ${ok ? `<div class="nx-alert success">Bonul de consum a fost salvat.</div>` : ""}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">BC</div><div><div class="nx-kpi-label">Bonuri</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">VAL</div><div><div class="nx-kpi-label">Valoare consum</div><div class="nx-kpi-value">${escapeHtml(money(stats.total_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">LUN</div><div><div class="nx-kpi-label">Luna curentă</div><div class="nx-kpi-value">${escapeHtml(stats.month_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">PRD</div><div><div class="nx-kpi-label">Produse active</div><div class="nx-kpi-value">${escapeHtml(products.length)}</div></div></div>
    </section>
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Creează bon de consum</h2><span>Consum intern din catalogul de produse</span></div></div>
        <form method="post" action="/nexora/accounting/consumption/create" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Număr bon</span><input name="voucher_number" required value="BC-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-4)}"></label>
            <label class="nx-field"><span>Data</span><input type="date" name="issue_date" value="${new Date().toISOString().slice(0, 10)}"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Departament</span><input name="department" placeholder="Administrativ"></label>
            <label class="nx-field"><span>Predat către</span><input name="issued_to" placeholder="persoană / compartiment"></label>
          </div>
          ${lineInputs}
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează bonul</button><a class="nx-btn" href="/nexora/products">Produse</a></div>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Registru bonuri de consum</h1><p>Evidență pentru consum intern de materiale, produse și obiecte consumabile.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Bon</th><th>Data</th><th>Departament</th><th>Predat către</th><th class="nx-right">Poziții</th><th class="nx-right">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      </section>
    </div>
  `;

  return renderNexoraShell({
    title: "Bonuri de consum",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/consumption",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Bonuri de consum",
    body
  });
}

function renderNexoraAccountingConsumptionDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const voucher = options.voucher || {};
  const items = Array.isArray(options.items) ? options.items : [];
  const fmtMoney = options.fmtMoney;
  const total = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
  const rowsHtml = items.map((item) => `
    <tr>
      <td><b>${escapeHtml(item.product_name || "-")}</b></td>
      <td class="nx-right">${escapeHtml(item.qty || 0)}</td>
      <td>${escapeHtml(item.unit || "buc")}</td>
      <td class="nx-right">${escapeHtml(money(item.unit_cost, fmtMoney))}</td>
      <td class="nx-right">${escapeHtml(money(item.line_total, fmtMoney))}</td>
    </tr>
  `).join("");

  const body = `
    ${renderAccountingNav("/nexora/accounting/consumption")}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(voucher.voucher_number || "Bon de consum")}</h1><p>${escapeHtml(dateValue(voucher.issue_date) || "-")} · ${escapeHtml(voucher.department || "-")} · ${escapeHtml(voucher.issued_to || "-")}</p></div>
        <a class="nx-btn" href="/nexora/accounting/consumption">Înapoi</a>
      </div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Produs</th><th class="nx-right">Cantitate</th><th>UM</th><th class="nx-right">Cost unitar</th><th class="nx-right">Total</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="5"><div class="nx-empty-state">Nu există poziții.</div></td></tr>`}</tbody></table></div>
      <div class="nx-section-head" style="margin-top:16px">
        <p>${escapeHtml(voucher.notes || "Fără observații")}</p>
        <h1>${escapeHtml(money(total, fmtMoney))}</h1>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: voucher.voucher_number || "Bon de consum",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/accounting/consumption",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Bon de consum",
    body
  });
}

export {
  renderNexoraAccountingDeclarationDetailPage,
  renderNexoraAccountingDeclarationsPage,
  renderNexoraAccountingExpensesPage,
  renderNexoraAccountingBankReconciliationPage,
  renderNexoraAccountingBudgetsPage,
  renderNexoraAccountingCashflowPage,
  renderNexoraAccountingConsumptionDetailPage,
  renderNexoraAccountingConsumptionPage,
  renderNexoraAccountingFixedAssetsPage,
  renderNexoraAccountingRegistersPage,
  renderNexoraAccountingTransactionsPage,
  renderNexoraAccountingTrialBalancePage,
  renderNexoraAccountingVatPage
};
