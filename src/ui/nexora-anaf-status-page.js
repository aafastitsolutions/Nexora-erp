import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderConnectionCard(title, connection) {
  if (!connection) {
    return `
      <div class="nx-anaf-status-card">
        <div class="nx-anaf-status-head">
          <h3>${escapeHtml(title)}</h3>
          <span class="nx-status-pill danger">neconectat</span>
        </div>
        <p>Nu există conexiune ANAF configurată pentru acest mediu.</p>
      </div>
    `;
  }

  const accessActive = Boolean(connection.accessActive);
  const refreshActive = Boolean(connection.refreshActive);
  const statusLabel = accessActive ? "activă" : refreshActive ? "refresh disponibil" : "reautorizare necesară";
  const statusClass = accessActive ? "success" : refreshActive ? "warn" : "danger";

  return `
    <div class="nx-anaf-status-card">
      <div class="nx-anaf-status-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="nx-status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>

      <div class="nx-client-info-grid">
        <div><span>Certificat</span><b>${escapeHtml(connection.serial_certificate || "-")}</b></div>
        <div><span>Access expiră</span><b>${escapeHtml(connection.expires_at || "-")}</b></div>
        <div><span>Refresh expiră</span><b>${escapeHtml(connection.refresh_expires_at || "-")}</b></div>
        <div><span>Ultima actualizare</span><b>${escapeHtml(connection.updated_at || "-")}</b></div>
      </div>
    </div>
  `;
}

function renderNexoraAnafStatusPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || "Workspace";
  const environment = options.environment || "test";
  const efacturaApiBase = options.efacturaApiBase || "-";
  const redirectUri = options.redirectUri || "-";
  const oauthState = options.oauthState || "";
  const oauthMessage = options.oauthMessage || "";
  const reauthRequested = Boolean(options.reauthRequested);
  const latestTestConnection = options.latestTestConnection || null;
  const latestProdConnection = options.latestProdConnection || null;
  const lastOauthLog = options.lastOauthLog || null;
  const inviteFlash = options.inviteFlash || null;

  const inviteFlashHtml = inviteFlash
    ? `<div class="nx-alert ${inviteFlash.status === "error" ? "danger" : "success"}">
        <div style="font-weight:950;margin-bottom:8px">${escapeHtml(inviteFlash.status === "error" ? "Generare cod eșuată" : "Cod pentru contabil generat")}</div>
        <div>${escapeHtml(inviteFlash.message || "Codul de reautorizare este pregătit.")}</div>
        ${inviteFlash.code ? `
          <div class="nx-invite-grid">
            <label class="nx-field">
              <span>Cod contabil</span>
              <input readonly onclick="this.select()" value="${escapeHtml(inviteFlash.code)}">
            </label>
            <label class="nx-field">
              <span>Link direct</span>
              <input readonly onclick="this.select()" value="${escapeHtml(inviteFlash.invite_link || "")}">
            </label>
            <div><span>Expiră la</span><b>${escapeHtml(inviteFlash.expires_at || "-")}</b></div>
            <div><span>Email contabil</span><b>${escapeHtml(inviteFlash.accountant_email || "-")}</b></div>
            <div><span>Mediu</span><b>${escapeHtml(String(inviteFlash.environment || environment).toUpperCase())}</b></div>
          </div>
        ` : ""}
      </div>`
    : "";

  const sidebar = renderErpSidebar({
    currentPath: "/anaf/outbox",
    appName: "Nexora ERP",
    companyName
  });

  const oauthAlert = oauthState
    ? `<div class="nx-alert ${oauthState === "success" ? "success" : "danger"}">
        ${escapeHtml(oauthMessage || (oauthState === "success" ? "Conexiunea ANAF a fost salvată." : "Conectarea ANAF a eșuat."))}
      </div>`
    : "";

  const reauthAlert = reauthRequested && !inviteFlash
    ? `<div class="nx-alert danger">Conexiunea ANAF/SPV trebuie reautorizată pentru această companie.</div>`
    : "";

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Status ANAF</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Financiar / ANAF e-Factura</div>
          <div class="nx-page-title">Status conexiune ANAF</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/anaf/status">UI vechi</a>
          <a class="nx-btn" href="/nexora/facturi">Facturi</a>
          <a class="nx-btn primary" href="/nexora/anaf/status">Reîmprospătează</a>
        </div>
      </header>

      ${oauthAlert}
      ${inviteFlashHtml}
      ${reauthAlert}

      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon ${environment === "prod" ? "green" : "blue"}">SPV</div>
          <div>
            <div class="nx-kpi-label">Mediu activ</div>
            <div class="nx-kpi-value">${escapeHtml(String(environment).toUpperCase())}</div>
            <div class="nx-kpi-trend ${environment === "prod" ? "up" : "warn"}">${environment === "prod" ? "Trimiteri reale în SPV" : "Mediu de test"}</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon purple">API</div>
          <div>
            <div class="nx-kpi-label">API e-Factura</div>
            <div class="nx-kpi-value small">${escapeHtml(efacturaApiBase)}</div>
          </div>
        </div>
      </section>

      <section class="nx-dashboard-grid">
        <div class="nx-panel large">
          <div class="nx-panel-head">
            <h2>Conexiuni ANAF</h2>
            <span>TEST / PROD</span>
          </div>

          <div class="nx-anaf-status-grid">
            ${renderConnectionCard("Mediu TEST", latestTestConnection)}
            ${renderConnectionCard("Mediu PRODUCȚIE", latestProdConnection)}
          </div>
        </div>

        <div class="nx-panel">
          <div class="nx-panel-head">
            <h2>Config OAuth</h2>
            <span>ANAF</span>
          </div>

          <div class="nx-anaf-box">
            <div class="nx-anaf-row">
              <span>Redirect URI</span>
              <strong>${escapeHtml(redirectUri)}</strong>
            </div>
            <div class="nx-anaf-row">
              <span>Ultimul OAuth</span>
              <strong>${escapeHtml(lastOauthLog?.status || "-")}</strong>
            </div>
            <div class="nx-anaf-row">
              <span>Ultimul eveniment</span>
              <strong>${escapeHtml(lastOauthLog?.event_type || "-")}</strong>
            </div>
            <div class="nx-anaf-row">
              <span>Data log</span>
              <strong>${escapeHtml(lastOauthLog?.created_at || "-")}</strong>
            </div>
            <form class="nx-anaf-accountant-form" method="post" action="/anaf/reautorizare-link">
              <input type="hidden" name="redirect_to" value="/nexora/anaf/status?reauth=needed">

              <label class="nx-field">
                <span>Email contabil, opțional</span>
                <input type="email" name="accountant_email" placeholder="contabil@firma.ro">
              </label>

              <label class="nx-field">
                <span>Notă internă, opțional</span>
                <input name="note" placeholder="reautorizare certificat nou">
              </label>

              <button class="nx-btn primary" type="submit">Generează cod contabil</button>
            </form>

            <a class="nx-btn nx-anaf-link" href="/anaf/status">Acțiuni avansate în UI vechi</a>
          </div>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraAnafStatusPage
};
