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

function renderNexoraAccountingExpensesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";
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
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DEC</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">PRE</div><div><div class="nx-kpi-label">Pregătite</div><div class="nx-kpi-value">${escapeHtml(stats.pregatita_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">TRM</div><div><div class="nx-kpi-label">Trimise</div><div class="nx-kpi-value">${escapeHtml(stats.trimisa_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">VAL</div><div><div class="nx-kpi-label">Validate</div><div class="nx-kpi-value">${escapeHtml(stats.validata_count || 0)}</div></div></div>
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
            <label class="nx-field"><span>Tip declarație</span><select name="declaration_type"><option>D100</option><option>D112</option><option>D300</option><option>D390</option><option>D394</option><option>SAF-T</option><option>BILANT</option><option>ALTA</option></select></label>
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
    currentPath: "/nexora/accounting/declarations",
    eyebrow: "Financiar & Contabilitate",
    pageTitle: "Declarație",
    body
  });
}

export {
  renderNexoraAccountingDeclarationDetailPage,
  renderNexoraAccountingDeclarationsPage,
  renderNexoraAccountingExpensesPage
};
