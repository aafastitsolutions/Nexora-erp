import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  hr: "HR",
  accounting: "Contabilitate"
};

function roleLabel(role) {
  return ROLE_LABELS[String(role || "").trim().toLowerCase()] || String(role || "-");
}

function roleBadge(role) {
  const normalized = String(role || "").trim().toLowerCase();
  const tone = normalized === "admin" ? "success" : normalized === "accounting" ? "warn" : "neutral";
  return `<span class="nx-status-pill ${tone}">${escapeHtml(roleLabel(normalized))}</span>`;
}

function statusBadge(status) {
  const normalized = String(status || "active").trim().toLowerCase();
  return normalized === "active"
    ? `<span class="nx-status-pill success">activ</span>`
    : `<span class="nx-status-pill danger">${escapeHtml(normalized || "-")}</span>`;
}

function roleOptions(selectedRole = "operator") {
  return Object.keys(ROLE_LABELS).map((role) => `
    <option value="${escapeHtml(role)}" ${String(selectedRole || "").toLowerCase() === role ? "selected" : ""}>${escapeHtml(roleLabel(role))}</option>
  `).join("");
}

function moduleNames(moduleKeys = [], moduleDefinitions = []) {
  const byKey = new Map(moduleDefinitions.map((item) => [String(item.key), item.label || item.key]));
  return (moduleKeys || []).map((key) => byKey.get(String(key)) || String(key));
}

function renderRoleMatrix(roleModules = {}, moduleDefinitions = []) {
  const rows = Object.keys(ROLE_LABELS).map((role) => {
    const modules = moduleNames(roleModules[role] || [], moduleDefinitions);
    return `
      <tr>
        <td>${roleBadge(role)}</td>
        <td>${escapeHtml(modules.join(", ") || "-")}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="nx-table-wrap">
      <table class="nx-table">
        <thead><tr><th>Rol</th><th>Module implicite</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderNexoraUsersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const users = Array.isArray(options.users) ? options.users : [];
  const seatContext = options.seatContext || {};
  const roleModules = options.roleModules || {};
  const moduleDefinitions = Array.isArray(options.moduleDefinitions) ? options.moduleDefinitions : [];
  const currentUserId = Number(options.currentUserId || 0);
  const isSuperAdmin = Number(options.isSuperAdmin || 0) === 1;
  const ok = options.ok || "";

  const seatLimitReached = Number(seatContext.seatsUsed || 0) >= Number(seatContext.seatsIncluded || 1);
  const adminCount = users.filter((user) => String(user.role || "").toLowerCase() === "admin").length;
  const activeCount = users.filter((user) => String(user.status || "active").toLowerCase() === "active").length;
  const perUserModuleLimit = Number(seatContext.subscription?.max_modules_per_user || 0);

  const okMessages = {
    created: "Utilizatorul a fost creat.",
    saved: "Utilizatorul a fost actualizat.",
    deleted: "Utilizatorul a fost șters."
  };

  const rowsHtml = users.length
    ? users.map((user) => {
      const moduleLabels = moduleNames(user.modules || [], moduleDefinitions);
      return `
        <tr>
          <td>
            <b>${escapeHtml(user.email || "-")}</b>
            <div class="nx-table-sub">${Number(user.id) === currentUserId ? "contul conectat" : `ID ${escapeHtml(user.id || "-")}`}</div>
          </td>
          <td>${roleBadge(user.role)}</td>
          <td>${statusBadge(user.status)}</td>
          <td>${Number(user.is_company_admin) ? `<span class="nx-status-pill success">admin companie</span>` : `<span class="nx-status-pill neutral">standard</span>`}</td>
          <td>${escapeHtml(moduleLabels.length)}<div class="nx-table-sub">${escapeHtml(moduleLabels.slice(0, 4).join(", ") || "-")}</div></td>
          <td>${escapeHtml(user.created_at || "-")}</td>
          <td class="nx-table-actions">
            <a class="nx-btn" href="/nexora/users/${escapeHtml(user.id)}/edit">Editează</a>
            <form method="post" action="/accounts/${escapeHtml(user.id)}/delete" onsubmit="return confirm('Ștergi acest utilizator?');">
              <input type="hidden" name="return_to" value="nexora">
              <button class="nx-btn danger" type="submit" ${Number(user.id) === currentUserId ? "disabled" : ""}>Șterge</button>
            </form>
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="7"><div class="nx-empty-state">Nu există utilizatori în această companie.</div></td></tr>`;

  const body = `
    ${ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">USR</div><div><div class="nx-kpi-label">Utilizatori</div><div class="nx-kpi-value">${escapeHtml(seatContext.seatsUsed || users.length)} / ${escapeHtml(seatContext.seatsIncluded || 1)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ADM</div><div><div class="nx-kpi-label">Admini companie</div><div class="nx-kpi-value">${escapeHtml(adminCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">ACT</div><div><div class="nx-kpi-label">Conturi active</div><div class="nx-kpi-value">${escapeHtml(activeCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">SA</div><div><div class="nx-kpi-label">Super admin</div><div class="nx-kpi-value">${isSuperAdmin ? "DA" : "NU"}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Adaugă utilizator</h2>
            <span>${seatLimitReached ? "limită atinsă" : "cont nou"}</span>
          </div>
        </div>
        <form method="post" action="/accounts/create" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <label class="nx-field"><span>Email</span><input type="email" name="email" required ${seatLimitReached ? "disabled" : ""}></label>
          <label class="nx-field"><span>Parolă</span><input type="password" name="password" required ${seatLimitReached ? "disabled" : ""}></label>
          <label class="nx-field"><span>Rol</span><select name="role" ${seatLimitReached ? "disabled" : ""}>${roleOptions("operator")}</select></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit" ${seatLimitReached ? "disabled" : ""}>Adaugă</button>
          </div>
          <div class="nx-table-sub">${seatLimitReached ? "Planul curent nu mai permite utilizatori noi." : "Modulele se acordă automat după rol, plan și modulele active în companie."}</div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Roluri</h2>
            <span>${perUserModuleLimit > 0 ? `max ${escapeHtml(perUserModuleLimit)} module operaționale / user` : "fără limită pe user"}</span>
          </div>
        </div>
        ${renderRoleMatrix(roleModules, moduleDefinitions)}
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Utilizatori & roluri</h1>
          <p>Administrare conturi, roluri și module pentru compania curentă.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/settings">Setări</a>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Utilizator</th><th>Rol</th><th>Status</th><th>Admin</th><th>Module</th><th>Creat</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Utilizatori & roluri",
    appName: "Nexora ERP",
    companyName,
    user: options.currentUser,
    currentPath: "/nexora/users",
    eyebrow: "Administrare",
    pageTitle: "Utilizatori & roluri",
    body
  });
}

function renderModuleCheckboxes({ selectableModules = [], assignedModules = [] } = {}) {
  return selectableModules.length
    ? selectableModules.map((item) => {
      const isCoreModule = ["dashboard", "accounts", "setari"].includes(item.key);
      const isChecked = assignedModules.includes(item.key) || isCoreModule;
      return `
        <label class="nx-check-row">
          <input
            type="checkbox"
            name="modules"
            value="${escapeHtml(item.key)}"
            ${isChecked ? "checked" : ""}
            ${isCoreModule ? "disabled" : ""}
            ${!isCoreModule ? `data-limited-module="1"` : ""}
          >
          ${isCoreModule ? `<input type="hidden" name="modules" value="${escapeHtml(item.key)}">` : ""}
          <span>
            <b>${escapeHtml(item.label || item.key)}</b>
            <small>${isCoreModule ? "Inclus implicit." : "Disponibil prin rol și plan."}</small>
          </span>
        </label>
      `;
    }).join("")
    : `<div class="nx-empty-state">Nu există module active disponibile pentru acest rol.</div>`;
}

function renderNexoraUserEditPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const user = options.user || {};
  const selectableModules = Array.isArray(options.selectableModules) ? options.selectableModules : [];
  const assignedModules = Array.isArray(options.assignedModules) ? options.assignedModules : [];
  const seatContext = options.seatContext || {};
  const perUserModuleLimit = Number(options.perUserModuleLimit || 0);
  const ok = options.ok || "";

  const body = `
    ${ok ? `<div class="nx-alert success">Utilizatorul a fost actualizat.</div>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(user.email || "Utilizator")}</h1>
          <p>${roleBadge(user.role)} · ${escapeHtml(seatContext.subscription?.plan_name || "plan activ")}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/users">Înapoi</a>
        </div>
      </div>
    </section>

    <section class="nx-content-card">
      <form method="post" action="/accounts/${escapeHtml(user.id)}/edit" class="nx-form">
        <input type="hidden" name="return_to" value="nexora">
        <div class="nx-two-column-grid compact">
          <label class="nx-field"><span>Email</span><input type="email" name="email" value="${escapeHtml(user.email || "")}" required></label>
          <label class="nx-field"><span>Rol</span><select name="role">${roleOptions(user.role)}</select></label>
        </div>
        <label class="nx-field"><span>Parolă nouă</span><input type="password" name="password" placeholder="lasă gol pentru a păstra parola"></label>
        <div>
          <div class="nx-panel-head compact-head">
            <div>
              <h2>Module permise</h2>
              <span>${perUserModuleLimit > 0 ? `max ${escapeHtml(perUserModuleLimit)} module operaționale / utilizator` : "fără limită pe module / utilizator"}</span>
            </div>
          </div>
          <div class="nx-module-check-grid">
            ${renderModuleCheckboxes({ selectableModules, assignedModules })}
          </div>
        </div>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Salvează</button>
        </div>
      </form>

      <form method="post" action="/accounts/${escapeHtml(user.id)}/delete" onsubmit="return confirm('Ștergi acest utilizator?');" class="nx-form">
        <input type="hidden" name="return_to" value="nexora">
        <div class="nx-form-actions"><button class="nx-btn danger" type="submit">Șterge utilizatorul</button></div>
      </form>
    </section>

    <script>
      const maxOperationalModules = ${Number.isFinite(perUserModuleLimit) ? perUserModuleLimit : 0};
      const limitedCheckboxes = Array.from(document.querySelectorAll('input[data-limited-module="1"]'));
      function syncLimitedModules() {
        if (!maxOperationalModules || maxOperationalModules < 1) return;
        const checkedCount = limitedCheckboxes.filter((input) => input.checked).length;
        for (const input of limitedCheckboxes) {
          input.disabled = !input.checked && checkedCount >= maxOperationalModules;
        }
      }
      limitedCheckboxes.forEach((input) => input.addEventListener("change", syncLimitedModules));
      syncLimitedModules();
    </script>
  `;

  return renderNexoraShell({
    title: user.email || "Utilizator",
    appName: "Nexora ERP",
    companyName,
    user: options.currentUser,
    currentPath: "/nexora/users",
    eyebrow: "Administrare",
    pageTitle: "Editare utilizator",
    body
  });
}

export {
  renderNexoraUserEditPage,
  renderNexoraUsersPage
};
