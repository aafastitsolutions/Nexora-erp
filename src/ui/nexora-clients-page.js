import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNexoraClientsPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || options.companyName || "Workspace";
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const q = options.q || "";

  const sidebar = renderErpSidebar({
    currentPath: "/clients",
    appName: "Nexora ERP",
    companyName
  });

  const rowsHtml = clients.length
    ? clients.map((client) => `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/clients/${escapeHtml(client.id)}">
            ${escapeHtml(client.name || "Client fără nume")}
          </a>
          <div class="nx-table-sub">${escapeHtml(client.address || "")}</div>
        </td>
        <td>${escapeHtml(client.cui || "-")}</td>
        <td>${escapeHtml(client.reg_com || "-")}</td>
        <td>${escapeHtml(client.created_at || "-")}</td>
        <td class="nx-table-actions">
          <a class="nx-btn" href="/clients/${escapeHtml(client.id)}">Deschide</a>
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="5">
          <div class="nx-empty-state">Nu există clienți pentru criteriile curente.</div>
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Clienți</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">CRM</div>
          <div class="nx-page-title">Clienți</div>
        </div>

        <form class="nx-search" method="get" action="/nexora/clients">
          <input name="q" value="${escapeHtml(q)}" placeholder="Caută după nume, CUI, email sau telefon..." />
        </form>

        <div class="nx-actions">
          <a class="nx-btn" href="/clients">UI vechi</a>
          <a class="nx-btn primary" href="/clients">Client nou</a>
        </div>
      </header>

      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>Portofoliu clienți</h1>
            <p>Listă CRM conectată la datele reale din aplicația existentă.</p>
          </div>
          <div class="nx-count-pill">${escapeHtml(clients.length)} clienți afișați</div>
        </div>

        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>CUI</th>
                <th>Reg. Com.</th>
                <th>Creat la</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraClientsPage
};
