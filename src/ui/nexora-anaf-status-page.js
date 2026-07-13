import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function connectionState(connection) {
  if (!connection) {
    return { label: "neconectat", tone: "danger", title: "Necesită conectare" };
  }

  const accessActive = Boolean(connection.accessActive);
  const refreshActive = Boolean(connection.refreshActive);
  if (accessActive) return { label: "activ", tone: "success", title: "Conexiune activă" };
  if (refreshActive) return { label: "refresh", tone: "warn", title: "Refresh disponibil" };
  return { label: "expirat", tone: "danger", title: "Reautorizare necesară" };
}

function renderConnectionCard(title, connection, { active = false } = {}) {
  const state = active || !connection
    ? connectionState(connection)
    : { label: "inactiv", tone: "neutral", title: "Conexiune salvată" };

  return `
    <article class="nx-spv-connection ${active ? "active" : ""}">
      <div class="nx-spv-connection-top">
        <div>
          <span>${active ? "Mediu curent" : "Mediu"}</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <span class="nx-status-pill ${state.tone}">${escapeHtml(state.label)}</span>
      </div>

      ${connection ? `
        <dl class="nx-spv-meta-grid">
          <div><dt>Certificat</dt><dd>${escapeHtml(connection.serial_certificate || "-")}</dd></div>
          <div><dt>Access până la</dt><dd>${escapeHtml(connection.expires_at || "-")}</dd></div>
          <div><dt>Refresh până la</dt><dd>${escapeHtml(connection.refresh_expires_at || "-")}</dd></div>
          <div><dt>Actualizat</dt><dd>${escapeHtml(connection.updated_at || "-")}</dd></div>
        </dl>
      ` : `
        <div class="nx-spv-empty-line">Nu există token OAuth salvat pentru acest mediu.</div>
      `}
    </article>
  `;
}

function renderStatusTile({ label, value, detail = "", tone = "neutral" }) {
  return `
    <div class="nx-spv-tile ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

function renderConfigItem(label, value, { configured = true } = {}) {
  return `
    <div class="nx-spv-config-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
      <em class="${configured ? "ok" : "bad"}">${configured ? "configurat" : "lipsește"}</em>
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
  const hasClientId = Boolean(options.hasClientId);
  const hasClientSecret = Boolean(options.hasClientSecret);
  const activeConnection = environment === "prod" ? latestProdConnection : latestTestConnection;
  const activeState = connectionState(activeConnection);
  const oauthConfigured = hasClientId && hasClientSecret && redirectUri && redirectUri !== "-";
  const needsConnection = !activeConnection || activeState.tone === "danger";

  const inviteFlashHtml = inviteFlash
    ? `<div class="nx-alert ${inviteFlash.status === "error" ? "danger" : inviteFlash.status === "warning" ? "warn" : "success"}">
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

  const oauthAlert = oauthState
    ? `<div class="nx-alert ${oauthState === "success" ? "success" : "danger"}">
        ${escapeHtml(oauthMessage || (oauthState === "success" ? "Conexiunea ANAF a fost salvată." : "Conectarea ANAF a eșuat."))}
      </div>`
    : "";

  const reauthAlert = reauthRequested && !inviteFlash
    ? `<div class="nx-alert danger">Conexiunea ANAF/SPV trebuie reautorizată pentru această companie.</div>`
    : "";

  const actionsHtml = `
    <a class="nx-btn" href="/nexora/facturi">Facturi</a>
    <a class="nx-btn" href="/nexora/anaf/inbox">Inbox</a>
    <a class="nx-btn" href="/nexora/settings?tab=spv">Configurează OAuth</a>
    <a class="nx-btn primary" href="/oauth/anaf/start?return_to=nexora&launch=1">Conectează SPV</a>
  `;

  const body = `
      ${oauthAlert}
      ${inviteFlashHtml}
      ${reauthAlert}

      <section class="nx-spv-hero">
        <div>
          <span class="nx-status-pill ${environment === "prod" ? "success" : "warn"}">${escapeHtml(String(environment).toUpperCase())}</span>
          <h1>SPV / e-Factura</h1>
          <p>${escapeHtml(companyName)}</p>
        </div>
        <div class="nx-spv-hero-actions">
          <a class="nx-btn primary" href="/oauth/anaf/start?return_to=nexora&launch=1">Deschide ANAF</a>
          <a class="nx-btn" href="/nexora/anaf/inbox">Sincronizează inbox</a>
        </div>
      </section>

      <section class="nx-spv-status-strip">
        ${renderStatusTile({
          label: "Mediu activ",
          value: String(environment).toUpperCase(),
          detail: environment === "prod" ? "trimiteri reale" : "testare",
          tone: environment === "prod" ? "success" : "warn"
        })}
        ${renderStatusTile({
          label: "Conexiune",
          value: activeState.title,
          detail: activeConnection?.updated_at || "fără autorizare",
          tone: activeState.tone
        })}
        ${renderStatusTile({
          label: "OAuth app",
          value: oauthConfigured ? "Pregătit" : "Incomplet",
          detail: redirectUri,
          tone: oauthConfigured ? "success" : "danger"
        })}
        ${renderStatusTile({
          label: "Ultimul OAuth",
          value: lastOauthLog?.status || "-",
          detail: lastOauthLog?.created_at || "fără log",
          tone: lastOauthLog?.status === "success" ? "success" : lastOauthLog?.status ? "warn" : "neutral"
        })}
      </section>

      <div class="nx-spv-layout">
        <section class="nx-panel">
          <div class="nx-panel-head">
            <div>
              <h2>Conexiuni ANAF</h2>
              <span>Tokenuri salvate pe compania curentă</span>
            </div>
          </div>

          <div class="nx-spv-connection-grid">
            ${renderConnectionCard("TEST", latestTestConnection, { active: environment !== "prod" })}
            ${renderConnectionCard("PRODUCȚIE", latestProdConnection, { active: environment === "prod" })}
          </div>
        </section>

        <aside class="nx-spv-side-stack">
          <section class="nx-panel">
            <div class="nx-panel-head">
              <div>
                <h2>${needsConnection ? "Conectare SPV" : "Conexiune curentă"}</h2>
                <span>${escapeHtml(activeState.title)}</span>
              </div>
            </div>

            <div class="nx-spv-action-box ${needsConnection ? "needs-action" : "ready"}">
              <strong>${needsConnection ? "Autorizare necesară" : "Pregătit pentru sincronizare"}</strong>
              <p>${needsConnection
                ? "Conectează compania cu un certificat digital care are drept SPV pe CUI-ul firmei."
                : "Poți trimite facturi și sincroniza inbox-ul pe mediul activ."}</p>
              <div class="nx-form-actions">
                <a class="nx-btn primary" href="/oauth/anaf/start?return_to=nexora&launch=1">Deschide ANAF</a>
                <a class="nx-btn" href="/nexora/settings?tab=spv">Editează credențiale</a>
                <a class="nx-btn" href="/nexora/anaf/inbox">Inbox</a>
              </div>
            </div>
          </section>

          <section class="nx-panel">
            <div class="nx-panel-head">
              <div>
                <h2>Cod contabil</h2>
                <span>autorizare la distanță</span>
              </div>
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
          </section>

          <section class="nx-panel">
            <div class="nx-panel-head">
              <div>
                <h2>Config OAuth</h2>
                <span>aplicație ANAF</span>
              </div>
            </div>
            <div class="nx-spv-config-list">
              ${renderConfigItem("Client ID", hasClientId ? "setat" : "neconfigurat", { configured: hasClientId })}
              ${renderConfigItem("Client Secret", hasClientSecret ? "setat" : "neconfigurat", { configured: hasClientSecret })}
              ${renderConfigItem("Redirect URI", redirectUri, { configured: Boolean(redirectUri && redirectUri !== "-") })}
              ${renderConfigItem("API e-Factura", efacturaApiBase, { configured: Boolean(efacturaApiBase && efacturaApiBase !== "-") })}
            </div>
            <div class="nx-form-actions" style="margin-top:12px">
              <a class="nx-btn primary" href="/nexora/settings?tab=spv">Configurează Client ID / Secret</a>
            </div>
          </section>
        </aside>
      </div>
  `;

  return renderNexoraShell({
    title: "Status ANAF",
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath: "/nexora/anaf/status",
    eyebrow: "Financiar / ANAF e-Factura",
    pageTitle: "Status conexiune ANAF",
    actionsHtml,
    body
  });
}

export {
  renderNexoraAnafStatusPage
};
