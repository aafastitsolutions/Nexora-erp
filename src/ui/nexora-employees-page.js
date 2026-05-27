import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNexoraEmployeesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const ok = options.ok || "";
  const activeCount = rows.filter((row) => Number(row.active)).length;

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.position || "")}</div></td>
        <td>${escapeHtml(row.email || "-")}</td>
        <td>${escapeHtml(row.phone || "-")}</td>
        <td>${Number(row.active) ? `<span class="nx-status-pill success">activ</span>` : `<span class="nx-status-pill neutral">inactiv</span>`}</td>
        <td>${escapeHtml(row.created_at || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5"><div class="nx-empty-state">Nu există angajați.</div></td></tr>`;

  const body = `
    ${ok ? `<div class="nx-alert success">Angajatul a fost adăugat.</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">HR</div><div><div class="nx-kpi-label">Angajați</div><div class="nx-kpi-value">${escapeHtml(rows.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">✓</div><div><div class="nx-kpi-label">Activi</div><div class="nx-kpi-value">${escapeHtml(activeCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">OFF</div><div><div class="nx-kpi-label">Inactivi</div><div class="nx-kpi-value">${escapeHtml(rows.length - activeCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DMS</div><div><div class="nx-kpi-label">Tipizate HR</div><div class="nx-kpi-value"><a class="nx-table-main-link" href="/nexora/documents">DMS</a></div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Adaugă angajat</h2>
            <span>Resurse Umane</span>
          </div>
        </div>
        <form method="post" action="/employees/create" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <label class="nx-field"><span>Nume</span><input name="name" required></label>
          <label class="nx-field"><span>Email</span><input name="email"></label>
          <label class="nx-field"><span>Telefon</span><input name="phone"></label>
          <label class="nx-field"><span>Funcție</span><input name="position"></label>
          <label class="nx-field"><span>Activ</span><select name="active"><option value="1">DA</option><option value="0">NU</option></select></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Adaugă angajat</button>
          </div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Documente HR</h2>
            <span>Tipizate</span>
          </div>
        </div>
        <div class="nx-shortcuts">
          <a href="/nexora/documents/templates/adeverinta">Adeverință</a>
          <a href="/nexora/documents/templates/cerere-concediu">Cerere concediu</a>
          <a href="/nexora/documents/templates/fisa-hr">Fișă HR</a>
          <a href="/nexora/documents/templates/ordin-deplasare">Ordin deplasare</a>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Angajați</h1>
          <p>Administrare personal și operatori ai companiei curente.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Nume</th><th>Email</th><th>Telefon</th><th>Status</th><th>Creat</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Angajați",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/employees",
    eyebrow: "Resurse Umane",
    pageTitle: "Angajați",
    body
  });
}

export {
  renderNexoraEmployeesPage
};
