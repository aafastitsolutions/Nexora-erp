import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateValue(value = "") {
  return String(value || "").slice(0, 10);
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "ACTIVA", "FINALIZAT", "SINCRONIZAT", "DESCHIS"].includes(normalized)) return "success";
  if (["PAUZAT", "IN_LUCRU", "PENDING", "PLANIFICAT"].includes(normalized)) return "warn";
  if (["BLOCAT", "INCHISA", "ANULAT", "EROARE"].includes(normalized)) return "danger";
  return "neutral";
}

function statusBadge(value = "") {
  const label = String(value || "-").toLowerCase().replaceAll("_", " ");
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(label)}</span>`;
}

function rowsOrEmpty(rows = [], colspan = 6, mapper = () => "", empty = "Nu există înregistrări.") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="${escapeHtml(colspan)}"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

const TABS = [
  ["Dashboard", "/nexora/mobile-apps"],
  ["Agenți", "/nexora/mobile-apps/sales-agents"],
  ["Tehnicieni", "/nexora/mobile-apps/technicians"],
  ["Manager", "/nexora/mobile-apps/manager"],
  ["Scanare", "/nexora/mobile-apps/scanning"],
  ["Push", "/nexora/mobile-apps/push"],
  ["Aprobări", "/nexora/mobile-apps/approvals"],
  ["Poze & semnături", "/nexora/mobile-apps/field-proof"],
  ["Pontaj/GPS", "/nexora/mobile-apps/time-location"],
  ["Comenzi rapide", "/nexora/mobile-apps/quick-orders"],
  ["Inventar mobil", "/nexora/mobile-apps/mobile-inventory"],
  ["Clienți/date", "/nexora/mobile-apps/client-data"],
  ["Dispozitive", "/nexora/mobile-apps/devices"],
  ["Fluxuri mobile", "/nexora/mobile-apps/workflows"],
  ["Task-uri mobile", "/nexora/mobile-apps/tasks"],
  ["Sesiuni & PIN", "/nexora/mobile-apps/sessions"]
];

function tabs(activePath = "/nexora/mobile-apps") {
  return `<nav class="nx-module-tabs">${TABS.map(([label, href]) => `
    <a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>
  `).join("")}</nav>`;
}

function shell({ title, activePath, companyName, user, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath: activePath,
    eyebrow: "Aplicații mobile",
    pageTitle: title,
    body: `${tabs(activePath)}${body}`
  });
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    status: "Statusul a fost actualizat."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    invalid: "Datele trimise nu sunt valide.",
    missing: "Înregistrarea nu a fost găsită."
  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function deviceOptions(devices = [], selectedId = "") {
  return [
    `<option value="">Fără dispozitiv</option>`,
    ...devices.map((device) => `<option value="${escapeHtml(device.id)}" ${String(device.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(device.device_code || "-")} · ${escapeHtml(device.device_name || "-")} · ${escapeHtml(device.assigned_role || "-")}</option>`)
  ].join("");
}

function workflowTypeOptions(selectedType = "") {
  const options = [
    ["AGENTI_VANZARI", "Agenți vânzări"],
    ["INTERVENTII", "Tehnicieni / intervenții"],
    ["COMENZI_SALA", "Comenzi sală"],
    ["COMENZI_RAPIDE", "Comenzi rapide"],
    ["KDS_BUCATARIE", "KDS bucătărie/bar"],
    ["INVENTARIERE", "Inventariere"],
    ["RECEPTIE_MARFA", "Recepție marfă"],
    ["SCANARE_QR", "Scanare coduri / QR"],
    ["APROBARE_MANAGER", "Aprobare manager"],
    ["DOVADA_TEREN", "Poze & semnături teren"],
    ["PONTAJ", "Pontaj / geolocație"],
    ["PUSH", "Notificări push"],
    ["CONSULTARE_DATE", "Clienți / facturi / stocuri"],
    ["QR_CLIENT", "QR client"]
  ];
  return options.map(([value, label]) => `<option value="${value}" ${String(selectedType) === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function renderNexoraMobileAppsHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const devices = Array.isArray(options.devices) ? options.devices : [];
  const taskRows = rowsOrEmpty(tasks, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.task_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.workflow_type || "")}</div></td>
      <td>${escapeHtml(row.title || "-")}</td>
      <td>${escapeHtml(row.location || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
    </tr>
  `, "Nu există task-uri mobile.");
  const deviceRows = rowsOrEmpty(devices, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.device_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.device_code || "")}</div></td>
      <td>${escapeHtml(row.device_type || "-")}</td>
      <td>${escapeHtml(row.assigned_role || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.last_seen_at || "-")}</td>
    </tr>
  `, "Nu există dispozitive.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Aplicații mobile</h1>
          <p>Administrare dispozitive, fluxuri mobile, task-uri operaționale, sesiuni și acces pe PIN/rol.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/mobile-apps/devices">Dispozitiv nou</a>
          <a class="nx-btn" href="/nexora/mobile-apps/workflows">Flux nou</a>
          <a class="nx-btn" href="/nexora/mobile-apps/tasks">Task mobil</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">D</div><div><div class="nx-kpi-label">Dispozitive active</div><div class="nx-kpi-value">${escapeHtml(stats.activeDevices || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">F</div><div><div class="nx-kpi-label">Fluxuri active</div><div class="nx-kpi-value">${escapeHtml(stats.activeWorkflows || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">T</div><div><div class="nx-kpi-label">Task-uri deschise</div><div class="nx-kpi-value">${escapeHtml(stats.openTasks || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">S</div><div><div class="nx-kpi-label">Sesiuni active</div><div class="nx-kpi-value">${escapeHtml(stats.activeSessions || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Task-uri recente</h1><p>Inventariere, recepții și comenzi pe mobil.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Titlu</th><th>Locație</th><th>Status</th><th>Termen</th></tr></thead><tbody>${taskRows}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Dispozitive</h1><p>Telefoane, tablete, POS-uri sau ecrane bucătărie.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Dispozitiv</th><th>Tip</th><th>Rol</th><th>Status</th><th>Ultima activitate</th></tr></thead><tbody>${deviceRows}</tbody></table></div>
      </section>
    </div>
  `;
  return shell({ title: "Aplicații mobile", activePath: "/nexora/mobile-apps", companyName, user: options.user, body });
}

function renderNexoraMobileDevicesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 7, (row) => `
    <tr>
      <td><b>${escapeHtml(row.device_code || "-")}</b></td>
      <td>${escapeHtml(row.device_name || "-")}<div class="nx-table-sub">${escapeHtml(row.pin_label || "")}</div></td>
      <td>${escapeHtml(row.device_type || "-")}</td>
      <td>${escapeHtml(row.assigned_role || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.last_seen_at || "-")}</td>
      <td>
        <form method="post" action="/nexora/mobile-apps/devices/${escapeHtml(row.id)}/status">
          <select name="status"><option value="ACTIV">Activ</option><option value="PAUZAT">Pauzat</option><option value="BLOCAT">Blocat</option></select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există dispozitive mobile.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Dispozitiv nou</h1><p>Înregistrează telefon, tabletă, POS mobil sau ecran KDS.</p></div></div>
      <form method="post" action="/nexora/mobile-apps/devices/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Cod</span><input name="device_code" placeholder="MOB-01"></label>
        <label class="nx-field"><span>Nume dispozitiv</span><input name="device_name" required></label>
        <label class="nx-field"><span>Tip</span><select name="device_type"><option value="Telefon">Telefon</option><option value="Tabletă">Tabletă</option><option value="POS mobil">POS mobil</option><option value="KDS">KDS</option></select></label>
        <label class="nx-field"><span>Rol</span><input name="assigned_role" value="Ospătar"></label>
        <label class="nx-field"><span>Etichetă PIN</span><input name="pin_label" placeholder="PIN ospătari / manager"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="PAUZAT">Pauzat</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă dispozitiv</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Dispozitive</h1><p>Inventar operațional pentru aplicațiile mobile.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Nume</th><th>Tip</th><th>Rol</th><th>Status</th><th>Ultima activitate</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Dispozitive mobile", activePath: "/nexora/mobile-apps/devices", companyName, user: options.user, body });
}

function renderNexoraMobileWorkflowsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.workflow_code || "-")}</b></td>
      <td>${escapeHtml(row.workflow_name || "-")}<div class="nx-table-sub">${escapeHtml(row.workflow_type || "")}</div></td>
      <td>${escapeHtml(row.target_role || "-")}</td>
      <td>${Number(row.offline_enabled || 0) ? "Da" : "Nu"}</td>
      <td>${Number(row.requires_pin || 0) ? "Da" : "Nu"}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/mobile-apps/workflows/${escapeHtml(row.id)}/status">
          <select name="status"><option value="ACTIV">Activ</option><option value="PAUZAT">Pauzat</option><option value="BLOCAT">Blocat</option></select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există fluxuri mobile.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Flux mobil nou</h1><p>Definește ce poate face un rol pe telefon/tabletă.</p></div></div>
      <form method="post" action="/nexora/mobile-apps/workflows/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Cod</span><input name="workflow_code" placeholder="WF-MOB-01"></label>
        <label class="nx-field"><span>Nume flux</span><input name="workflow_name" required></label>
        <label class="nx-field"><span>Tip flux</span><select name="workflow_type">${workflowTypeOptions()}</select></label>
        <label class="nx-field"><span>Rol țintă</span><input name="target_role" value="Ospătar"></label>
        <label class="nx-field"><span>Offline</span><select name="offline_enabled"><option value="1">Da</option><option value="0">Nu</option></select></label>
        <label class="nx-field"><span>PIN necesar</span><select name="requires_pin"><option value="1">Da</option><option value="0">Nu</option></select></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="PAUZAT">Pauzat</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează flux</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Fluxuri mobile</h1><p>Comenzi sală, KDS, inventariere, recepții marfă și aprobări manager.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Flux</th><th>Rol</th><th>Offline</th><th>PIN</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Fluxuri mobile", activePath: "/nexora/mobile-apps/workflows", companyName, user: options.user, body });
}

function renderNexoraMobileTasksPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const title = options.title || "Task-uri mobile";
  const activePath = options.activePath || "/nexora/mobile-apps/tasks";
  const intro = options.intro || "Lucrări trimise către telefoane/tablete, cu status operațional.";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.task_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.workflow_type || "")}</div></td>
      <td>${escapeHtml(row.title || "-")}</td>
      <td>${escapeHtml(row.location || "-")}</td>
      <td>${escapeHtml(row.assigned_role || "-")}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.notes || "")}</td>
      <td>
        <form method="post" action="/nexora/mobile-apps/tasks/${escapeHtml(row.id)}/status">
          <select name="status"><option value="DESCHIS">Deschis</option><option value="IN_LUCRU">În lucru</option><option value="FINALIZAT">Finalizat</option><option value="ANULAT">Anulat</option></select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există task-uri mobile.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Task mobil nou</h1><p>Trimite către mobil inventariere, recepție marfă, verificare sau aprobare.</p></div></div>
      <form method="post" action="/nexora/mobile-apps/tasks/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Tip flux</span><select name="workflow_type">${workflowTypeOptions("INVENTARIERE")}</select></label>
        <label class="nx-field"><span>Titlu</span><input name="title" required></label>
        <label class="nx-field"><span>Locație</span><input name="location" placeholder="Depozit / Bar / Bucătărie"></label>
        <label class="nx-field"><span>Rol</span><input name="assigned_role" value="Operator"></label>
        <label class="nx-field"><span>Termen</span><input name="due_date" type="date"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="DESCHIS">Deschis</option><option value="PLANIFICAT">Planificat</option></select></label>
        <label class="nx-field nx-field-wide"><span>Instrucțiuni</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează task</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Titlu</th><th>Locație</th><th>Rol</th><th>Termen</th><th>Status</th><th>Instrucțiuni</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title, activePath, companyName, user: options.user, body });
}

function renderNexoraMobileOperationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const title = options.title || "Aplicații mobile";
  const activePath = options.activePath || "/nexora/mobile-apps";
  const description = options.description || "";
  const cards = Array.isArray(options.cards) ? options.cards : [];
  const columns = Array.isArray(options.columns) ? options.columns : [];
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const actionsHtml = options.actionsHtml || "";
  const cardHtml = cards.length ? `
    <section class="nx-kpi-grid">
      ${cards.map((card) => `
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon ${escapeHtml(card.tone || "blue")}">${escapeHtml(card.icon || "M")}</div>
          <div>
            <div class="nx-kpi-label">${escapeHtml(card.label || "")}</div>
            <div class="nx-kpi-value">${escapeHtml(card.value ?? "")}</div>
            ${card.copy ? `<div class="nx-table-sub">${escapeHtml(card.copy)}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </section>
  ` : "";
  const headerCells = columns.map((column) => `<th class="${column.right ? "nx-right" : ""}">${escapeHtml(column.label || "")}</th>`).join("");
  const bodyRows = rowsOrEmpty(rows, columns.length || 1, (row) => `
    <tr>${columns.map((column) => `<td class="${column.right ? "nx-right" : ""}">${column.html ? column.html(row) : escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>
  `, options.empty || "Nu există înregistrări.");
  const tableHtml = columns.length ? `
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>${escapeHtml(options.tableTitle || title)}</h1><p>${escapeHtml(options.tableDescription || description)}</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>
    </section>
  ` : "";
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
        ${actionsHtml ? `<div class="nx-form-actions">${actionsHtml}</div>` : ""}
      </div>
    </section>
    ${cardHtml}
    ${tableHtml}
  `;
  return shell({ title, activePath, companyName, user: options.user, body });
}

function renderNexoraMobileSessionsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const devices = Array.isArray(options.devices) ? options.devices : [];
  const rowsHtml = rowsOrEmpty(rows, 7, (row) => `
    <tr>
      <td><b>${escapeHtml(row.session_number || "-")}</b></td>
      <td>${escapeHtml(row.device_name || "-")}<div class="nx-table-sub">${escapeHtml(row.device_code || "")}</div></td>
      <td>${escapeHtml(row.user_email || "-")}</td>
      <td>${escapeHtml(row.opened_at || "-")}</td>
      <td>${escapeHtml(row.closed_at || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>
        <form method="post" action="/nexora/mobile-apps/sessions/${escapeHtml(row.id)}/status">
          <input type="hidden" name="status" value="INCHISA">
          <button class="nx-btn" type="submit">Închide</button>
        </form>
      </td>
    </tr>
  `, "Nu există sesiuni mobile.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Sesiune nouă</h1><p>Înregistrează o sesiune de lucru pe dispozitiv și rol.</p></div></div>
      <form method="post" action="/nexora/mobile-apps/sessions/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Dispozitiv</span><select name="device_id">${deviceOptions(devices)}</select></label>
        <label class="nx-field"><span>Email utilizator</span><input name="user_email" placeholder="operator@firma.ro"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIVA">Activă</option><option value="PAUZAT">Pauzată</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Deschide sesiune</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Sesiuni & PIN</h1><p>Urmărește cine a lucrat pe dispozitivele mobile.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Sesiune</th><th>Dispozitiv</th><th>Utilizator</th><th>Deschisă</th><th>Închisă</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Sesiuni & PIN", activePath: "/nexora/mobile-apps/sessions", companyName, user: options.user, body });
}

export {
  renderNexoraMobileAppsHubPage,
  renderNexoraMobileDevicesPage,
  renderNexoraMobileOperationsPage,
  renderNexoraMobileSessionsPage,
  renderNexoraMobileTasksPage,
  renderNexoraMobileWorkflowsPage
};
