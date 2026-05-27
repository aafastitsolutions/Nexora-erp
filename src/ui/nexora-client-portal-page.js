import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(value = "") {
  const labels = {
    PLANIFICARE: "Planificare",
    ACTIV: "Activ",
    BLOCAT: "Blocat",
    IN_REVIZUIRE: "În revizuire",
    FINALIZAT: "Finalizat",
    ANULAT: "Anulat",
    DE_FACUT: "De făcut",
    IN_LUCRU: "În lucru",
    PLANIFICAT: "Planificat",
    REALIZAT: "Realizat"
  };
  const normalized = String(value || "").toUpperCase();
  return labels[normalized] || normalized || "-";
}

function statusTone(value = "") {
  const normalized = String(value || "").toUpperCase();
  if (["ACTIV", "FINALIZAT", "REALIZAT"].includes(normalized)) return "success";
  if (["BLOCAT", "ANULAT"].includes(normalized)) return "danger";
  if (["IN_LUCRU", "IN_REVIZUIRE", "PLANIFICARE", "PLANIFICAT"].includes(normalized)) return "warn";
  return "neutral";
}

function statusBadge(value = "") {
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(statusLabel(value))}</span>`;
}

function renderProgress(value = 0) {
  const progress = Math.max(0, Math.min(100, Number(value || 0)));
  return `
    <div class="nx-project-progress"><span style="width:${progress}%"></span></div>
    <small class="nx-table-sub">${escapeHtml(progress)}%</small>
  `;
}

function groupDocuments(documents = []) {
  return documents.reduce((result, document) => {
    const key = String(document.category || "ALTELE").toUpperCase();
    if (!result[key]) result[key] = [];
    result[key].push(document);
    return result;
  }, {});
}

function renderDocuments(documents = []) {
  const groups = groupDocuments(documents);
  const order = ["PROIECTE", "CONTRACTE", "OFERTE", "FACTURI", "TIPIZATE", "FORMULARE", "CORESPONDENTA", "ALTELE"];
  const categories = [...order.filter((key) => groups[key]), ...Object.keys(groups).filter((key) => !order.includes(key))];

  return categories.map((category) => `
    <section class="nx-panel" style="margin-top:18px">
      <div class="nx-panel-head"><div><h2>${escapeHtml(category)}</h2><span>${escapeHtml(groups[category].length)} documente</span></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Document</th><th>Tip</th><th>Dată</th><th></th></tr></thead>
          <tbody>${groups[category].map((document) => `
            <tr>
              <td><b>${escapeHtml(document.title || "-")}</b><div class="nx-table-sub">${escapeHtml(document.fileName || "")}</div></td>
              <td>${escapeHtml(document.kind || category)}</td>
              <td>${escapeHtml(document.createdAt || "-")}</td>
              <td class="nx-table-actions">
                ${document.openHref ? `<a class="nx-btn" href="${escapeHtml(document.openHref)}">Detalii</a>` : ""}
                ${document.downloadHref ? `<a class="nx-btn primary" href="${escapeHtml(document.downloadHref)}" target="_blank">Descarcă</a>` : ""}
              </td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </section>
  `).join("");
}

function renderNexoraClientPortalPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const client = options.client || {};
  const projects = Array.isArray(options.projects) ? options.projects : [];
  const documents = Array.isArray(options.documents) ? options.documents : [];
  const stats = options.stats || {};
  const missingAssignment = Boolean(options.missingAssignment);

  const projectRows = projects.length ? projects.map((project) => `
    <tr>
      <td>
        <a class="nx-table-main-link" href="/nexora/client-portal/projects/${escapeHtml(project.id)}">${escapeHtml(project.title || "-")}</a>
        <div class="nx-table-sub">${escapeHtml(project.project_code || "-")}</div>
      </td>
      <td>${statusBadge(project.status)}</td>
      <td>${renderProgress(project.progress)}</td>
      <td>${escapeHtml(project.due_date || "-")}</td>
      <td class="nx-table-actions"><a class="nx-btn primary" href="/nexora/client-portal/projects/${escapeHtml(project.id)}">Deschide</a></td>
    </tr>
  `).join("") : `<tr><td colspan="5"><div class="nx-empty-state">Nu există proiecte asociate acestui client.</div></td></tr>`;

  const body = missingAssignment ? `
    <section class="nx-content-card">
      <div class="nx-empty-state">Contul nu este asociat unui client.</div>
    </section>
  ` : `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(client.name || "Client")}</h1>
          <p>CUI: ${escapeHtml(client.cui || "-")} · ${escapeHtml(client.address || "")}</p>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PRJ</div><div><div class="nx-kpi-label">Proiecte</div><div class="nx-kpi-value">${escapeHtml(stats.projects || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.activeProjects || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DOC</div><div><div class="nx-kpi-label">Documente</div><div class="nx-kpi-value">${escapeHtml(documents.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">TSK</div><div><div class="nx-kpi-label">Task-uri deschise</div><div class="nx-kpi-value">${escapeHtml(stats.openTasks || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Proiecte</h1><p>Proiecte asociate clientului curent.</p></div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Proiect</th><th>Status</th><th>Progres</th><th>Termen</th><th></th></tr></thead>
          <tbody>${projectRows}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Documente</h1><p>Documente asociate dosarului clientului.</p></div>
      </div>
    </section>
    ${renderDocuments(documents) || `<section class="nx-content-card"><div class="nx-empty-state">Nu există documente asociate acestui client.</div></section>`}
  `;

  return renderNexoraShell({
    title: "Portal client",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/client-portal",
    eyebrow: "Portal client",
    pageTitle: "Portal client",
    body
  });
}

function renderNexoraClientPortalProjectPage(options = {}) {
  const project = options.project || {};
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const milestones = Array.isArray(options.milestones) ? options.milestones : [];
  const files = Array.isArray(options.files) ? options.files : [];

  const taskRows = tasks.length ? tasks.map((task) => `
    <tr>
      <td><b>${escapeHtml(task.title || "-")}</b><div class="nx-table-sub">${escapeHtml(task.description || "")}</div></td>
      <td>${escapeHtml(task.assignee || "-")}</td>
      <td>${statusBadge(task.status)}</td>
      <td>${escapeHtml(task.due_date || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="4"><div class="nx-empty-state">Nu există task-uri publicate pentru acest proiect.</div></td></tr>`;

  const milestoneRows = milestones.length ? milestones.map((milestone) => `
    <tr>
      <td><b>${escapeHtml(milestone.title || "-")}</b><div class="nx-table-sub">${escapeHtml(milestone.notes || "")}</div></td>
      <td>${statusBadge(milestone.status)}</td>
      <td>${escapeHtml(milestone.due_date || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="3"><div class="nx-empty-state">Nu există etape publicate pentru acest proiect.</div></td></tr>`;

  const fileRows = files.length ? files.map((file) => `
    <tr>
      <td><b>${escapeHtml(file.original_file_name || "-")}</b><div class="nx-table-sub">${escapeHtml(file.notes || "")}</div></td>
      <td>${escapeHtml(file.category || "-")}</td>
      <td>${escapeHtml(file.created_at || "-")}</td>
      <td class="nx-table-actions"><a class="nx-btn primary" href="/nexora/client-portal/projects/${escapeHtml(project.id)}/files/${escapeHtml(file.id)}/download" target="_blank">Descarcă</a></td>
    </tr>
  `).join("") : `<tr><td colspan="4"><div class="nx-empty-state">Nu există fișiere asociate proiectului.</div></td></tr>`;

  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(project.title || "Proiect")}</h1>
          <p>${escapeHtml(project.project_code || "-")} · ${statusBadge(project.status)}</p>
        </div>
        <a class="nx-btn" href="/nexora/client-portal">Portal client</a>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">%</div><div><div class="nx-kpi-label">Progres</div><div class="nx-kpi-value">${escapeHtml(project.progress || 0)}%</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">TSK</div><div><div class="nx-kpi-label">Task-uri</div><div class="nx-kpi-value">${escapeHtml(tasks.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DOC</div><div><div class="nx-kpi-label">Fișiere</div><div class="nx-kpi-value">${escapeHtml(files.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DAT</div><div><div class="nx-kpi-label">Termen</div><div class="nx-kpi-value">${escapeHtml(project.due_date || "-")}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Detalii</h2><span>${escapeHtml(project.manager_name || "responsabil nesetat")}</span></div></div>
        ${renderProgress(project.progress)}
        <table class="nx-table" style="margin-top:14px"><tbody>
          <tr><th>Start</th><td>${escapeHtml(project.start_date || "-")}</td></tr>
          <tr><th>Termen</th><td>${escapeHtml(project.due_date || "-")}</td></tr>
          <tr><th>Descriere</th><td>${escapeHtml(project.description || "-")}</td></tr>
        </tbody></table>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Etape</h2><span>${escapeHtml(milestones.length)} repere</span></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Etapă</th><th>Status</th><th>Termen</th></tr></thead><tbody>${milestoneRows}</tbody></table></div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Task-uri</h1><p>Stadiul livrabilelor proiectului.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Responsabil</th><th>Status</th><th>Termen</th></tr></thead><tbody>${taskRows}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Fișiere proiect</h1><p>Documente și livrabile asociate proiectului.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Fișier</th><th>Categorie</th><th>Încărcat</th><th></th></tr></thead><tbody>${fileRows}</tbody></table></div>
    </section>
  `;

  return renderNexoraShell({
    title: project.title || "Proiect",
    appName: "Nexora ERP",
    companyName: options.companyName || "Workspace",
    user: options.user,
    currentPath: "/nexora/client-portal",
    eyebrow: "Portal client",
    pageTitle: project.title || "Proiect",
    body
  });
}

export {
  renderNexoraClientPortalPage,
  renderNexoraClientPortalProjectPage
};
