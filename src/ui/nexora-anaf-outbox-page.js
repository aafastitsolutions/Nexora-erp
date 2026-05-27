import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusClass(status = "") {
  const s = String(status || "").toUpperCase();
  if (s === "RASPUNS_DISPONIBIL") return "success";
  if (s === "RESPINS_VALIDARE" || s === "RESPINSA_SPV") return "danger";
  return "neutral";
}

function statusLabel(status = "") {
  const s = String(status || "").toUpperCase();
  if (s === "RASPUNS_DISPONIBIL") return "răspuns SPV";
  if (s === "RESPINS_VALIDARE" || s === "RESPINSA_SPV") return "respinsă";
  return status || "—";
}

function renderNexoraAnafOutboxPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const statusFilter = String(options.statusFilter || "").toUpperCase();

  const acceptedCount = rows.filter((r) => String(r.status || "").toUpperCase() === "RASPUNS_DISPONIBIL").length;
  const rejectedCount = rows.filter((r) => ["RESPINS_VALIDARE", "RESPINSA_SPV"].includes(String(r.status || "").toUpperCase())).length;

  const sidebar = renderErpSidebar({
    currentPath: "/nexora/anaf/outbox",
    appName: "Nexora ERP",
    companyName,
    isSuperAdmin: Number(user.is_super_admin || 0) === 1,
    isCompanyAdmin: Number(user.is_company_admin || 0) === 1
  });

  const filterHref = (status) => status ? `/nexora/anaf/outbox?status=${encodeURIComponent(status)}` : "/nexora/anaf/outbox";
  const filterBtn = (label, status) => {
    const active = (!status && !statusFilter) || statusFilter === status;
    return `<a class="nx-btn ${active ? "primary" : ""}" href="${filterHref(status)}">${escapeHtml(label)}</a>`;
  };

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          ${row.factura_id
            ? `<a class="nx-table-main-link" href="/nexora/facturi/${escapeHtml(row.factura_id)}">${escapeHtml(row.factura_nr || ("#" + row.factura_id))}</a>`
            : `<span class="nx-table-sub">—</span>`}
        </td>
        <td><span class="nx-status-pill neutral">${escapeHtml(row.direction || "OUT")}</span></td>
        <td><span class="nx-status-pill ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span></td>
        <td>${escapeHtml(row.message_id || "-")}</td>
        <td>${escapeHtml(row.created_at || "-")}</td>
        <td><span class="nx-table-sub">${escapeHtml(row.efactura_xml_path || "—")}</span></td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="6">
          <div class="nx-empty-state">Nu există mesaje în Outbox pentru filtrul curent.</div>
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Outbox e-Factura</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Financiar / ANAF e-Factura</div>
          <div class="nx-page-title">Outbox e-Factura</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/nexora/anaf/status">Status ANAF</a>
          <a class="nx-btn primary" href="/nexora/facturi">Facturi</a>
        </div>
      </header>

      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">OUT</div>
          <div>
            <div class="nx-kpi-label">Mesaje afișate</div>
            <div class="nx-kpi-value">${escapeHtml(rows.length)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">✓</div>
          <div>
            <div class="nx-kpi-label">Acceptate</div>
            <div class="nx-kpi-value">${escapeHtml(acceptedCount)}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon red">!</div>
          <div>
            <div class="nx-kpi-label">Respinse</div>
            <div class="nx-kpi-value">${escapeHtml(rejectedCount)}</div>
          </div>
        </div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>Facturi cu răspuns SPV</h1>
            <p>O singură intrare per factură, doar după ce există răspuns în SPV.</p>
          </div>

          <div class="nx-panel-actions">
            ${filterBtn("Toate", "")}
            ${filterBtn("Acceptate", "RASPUNS_DISPONIBIL")}
            ${filterBtn("Respinse", "RESPINSE")}
          </div>
        </div>

        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead>
              <tr>
                <th>Factură</th>
                <th>Direcție</th>
                <th>Status</th>
                <th>Message ID</th>
                <th>Creat la</th>
                <th>XML</th>
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
  renderNexoraAnafOutboxPage
};
