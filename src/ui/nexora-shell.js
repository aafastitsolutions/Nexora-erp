import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNexoraShell(options = {}) {
  const title = options.title || "Nexora ERP";
  const appName = options.appName || "Nexora ERP";
  const companyName = options.companyName || "Workspace";
  const currentPath = options.currentPath || "/nexora-dashboard";
  const body = options.body || "";
  const eyebrow = options.eyebrow || appName;
  const pageTitle = options.pageTitle || title;
  const actionsHtml = options.actionsHtml || "";
  const isSuperAdmin = Number(options.isSuperAdmin || options.user?.is_super_admin || 0) === 1;
  const logoutHtml = `
    <form method="post" action="/logout" class="nx-logout-form">
      <button class="nx-btn nx-logout-btn" type="submit">Logout</button>
    </form>
  `;

  const sidebar = renderErpSidebar({
    currentPath,
    appName,
    companyName,
    isSuperAdmin
  });

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">${escapeHtml(eyebrow)}</div>
          <div class="nx-page-title">${escapeHtml(pageTitle)}</div>
        </div>

        <div class="nx-actions">
          ${actionsHtml}
          ${logoutHtml}
        </div>
      </header>

      ${body}
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraShell
};
