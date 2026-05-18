import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) q.set(key, value);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

function renderNexoraAnafInboxPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filteredStats = options.filteredStats || {};
  const processedFilter = options.processedFilter || "";
  const search = options.search || "";
  const dateFrom = options.dateFrom || "";
  const dateTo = options.dateTo || "";
  const ok = options.ok || "";
  const err = options.err || "";
  const reauth = options.reauth || "";
  const sync = options.sync || {};

  const sidebar = renderErpSidebar({
    currentPath: "/anaf/inbox",
    appName: "Nexora ERP",
    companyName
  });

  const currentPath = `/nexora/anaf/inbox${buildQuery({
    processed: processedFilter,
    search,
    date_from: dateFrom,
    date_to: dateTo
  })}`;

  const filterHref = (processed) => `/nexora/anaf/inbox${buildQuery({
    processed,
    search,
    date_from: dateFrom,
    date_to: dateTo
  })}`;

  const filterBtn = (label, value) => {
    const active = (!value && !processedFilter) || value === processedFilter;
    return `<a class="nx-btn ${active ? "primary" : ""}" href="${filterHref(value)}">${escapeHtml(label)}</a>`;
  };

  const okMessages = {
    synced: `Sincronizare finalizată: ${sync.imported || 0} importate, ${sync.newCount || 0} noi, ${sync.updated || 0} actualizate.`,
    processed: "Mesajul a fost marcat ca procesat.",
    unprocessed: "Mesajul a fost marcat ca nou."
  };

  const errMessages = {
    sync_failed: "Sincronizarea inbox-ului ANAF a eșuat.",
    fara_conexiune_anaf: "Conexiunea ANAF/SPV trebuie refăcută.",
    not_found: "Mesajul nu a fost găsit."
  };

  const alertHtml = err
    ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || ("A apărut o eroare: " + err))}</div>`
    : ok
      ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată cu succes.")}</div>`
      : "";

  const reauthAlert = reauth === "needed"
    ? `<div class="nx-alert danger">Conexiunea ANAF/SPV trebuie reautorizată înainte de sincronizare.</div>`
    : "";

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>
          <b>${escapeHtml(row.invoice_number || "Fără număr")}</b>
          <div class="nx-table-sub">${escapeHtml(row.supplier_name || "Furnizor necunoscut")}${row.supplier_cui ? " · " + escapeHtml(row.supplier_cui) : ""}</div>
          ${row.message_type ? `<div class="nx-table-sub">${escapeHtml(row.message_type)}</div>` : ""}
          ${row.details ? `<div class="nx-table-sub">${escapeHtml(String(row.details).slice(0, 180))}</div>` : ""}
        </td>
        <td>${escapeHtml(row.received_at || row.created_at || "-")}</td>
        <td>
          ${Number(row.processed)
            ? `<span class="nx-status-pill success">procesată</span>`
            : `<span class="nx-status-pill neutral">nouă</span>`}
        </td>
        <td>
          <div class="nx-file-links">
            ${row.xml_path ? `<a href="/${encodeURI(row.xml_path)}" target="_blank">XML</a>` : `<span>XML lipsă</span>`}
            ${row.zip_path ? `<a href="/${encodeURI(row.zip_path)}" target="_blank">ZIP</a>` : `<span>ZIP lipsă</span>`}
            ${row.pdf_path ? `<a href="/${encodeURI(row.pdf_path)}" target="_blank">PDF</a>` : `<span>PDF lipsă</span>`}
          </div>
        </td>
        <td class="nx-table-actions">
          <form method="post" action="/anaf/inbox/${escapeHtml(row.id)}/process">
            <input type="hidden" name="processed" value="${Number(row.processed) ? "0" : "1"}">
            <input type="hidden" name="redirect_to" value="${escapeHtml(currentPath)}">
            <button class="nx-btn" type="submit">${Number(row.processed) ? "Marchează nouă" : "Marchează procesată"}</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="6">
          <div class="nx-empty-state">Nu există mesaje în Inbox pentru filtrele curente.</div>
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Inbox e-Factura</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Financiar / ANAF e-Factura</div>
          <div class="nx-page-title">Inbox e-Factura</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/anaf/inbox">UI vechi</a>
          <a class="nx-btn" href="/nexora/anaf/status">Status ANAF</a>
          <form method="post" action="/anaf/inbox/sync" style="margin:0">
            <input type="hidden" name="redirect_to" value="/nexora/anaf/inbox">
            <button class="nx-btn primary" type="submit">Sincronizează inbox</button>
          </form>
        </div>
      </header>

      ${alertHtml}
      ${reauthAlert}

      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">IN</div>
          <div>
            <div class="nx-kpi-label">Total mesaje</div>
            <div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon orange">!</div>
          <div>
            <div class="nx-kpi-label">Noi</div>
            <div class="nx-kpi-value">${escapeHtml(stats.new_count || 0)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">✓</div>
          <div>
            <div class="nx-kpi-label">Procesate</div>
            <div class="nx-kpi-value">${escapeHtml(stats.processed_count || 0)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon purple">#</div>
          <div>
            <div class="nx-kpi-label">Filtrate</div>
            <div class="nx-kpi-value">${escapeHtml(filteredStats.total_count || 0)}</div>
          </div>
        </div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>Mesaje primite din SPV</h1>
            <p>Facturi primite, arhive XML/ZIP/PDF și stare procesare internă.</p>
          </div>

          <div class="nx-panel-actions">
            ${filterBtn("Toate", "")}
            ${filterBtn("Noi", "new")}
            ${filterBtn("Procesate", "processed")}
          </div>
        </div>

        <form class="nx-inline-form nx-inbox-filter-form" method="get" action="/nexora/anaf/inbox">
          <label class="nx-field">
            <span>Căutare</span>
            <input name="search" value="${escapeHtml(search)}" placeholder="furnizor, CUI, număr, detalii...">
          </label>

          <label class="nx-field">
            <span>De la</span>
            <input type="date" name="date_from" value="${escapeHtml(dateFrom)}">
          </label>

          <label class="nx-field">
            <span>Până la</span>
            <input type="date" name="date_to" value="${escapeHtml(dateTo)}">
          </label>

          <input type="hidden" name="processed" value="${escapeHtml(processedFilter)}">

          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Filtrează</button>
            <a class="nx-btn" href="/nexora/anaf/inbox">Resetează</a>
          </div>
        </form>

        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Document</th>
                <th>Primit la</th>
                <th>Status</th>
                <th>Fișiere</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraAnafInboxPage
};
