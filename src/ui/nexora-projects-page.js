import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selected(value, expected) {
  return String(value || "") === String(expected || "") ? "selected" : "";
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

function priorityBadge(value = "") {
  const normalized = String(value || "MEDIE").toUpperCase();
  const tone = normalized === "URGENTA" || normalized === "RIDICATA"
    ? "danger"
    : normalized === "SCĂZUTĂ" || normalized === "SCAZUTA"
      ? "neutral"
      : "warn";
  const labels = { URGENTA: "Urgentă", RIDICATA: "Ridicată", MEDIE: "Medie", SCAZUTA: "Scăzută" };
  return `<span class="nx-status-pill ${tone}">${escapeHtml(labels[normalized] || normalized)}</span>`;
}

function money(value, currency = "RON") {
  return `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency || "RON"}`;
}

function renderAlert(ok = "", err = "") {
  const okMessages = {
    created: "Proiectul a fost creat.",
    saved: "Proiectul a fost actualizat.",
    status: "Statusul proiectului a fost actualizat.",
    task_created: "Task-ul a fost adăugat.",
    task_updated: "Task-ul a fost actualizat.",
    task_deleted: "Task-ul a fost șters.",
    file_uploaded: "Fișierul a fost încărcat în proiect.",
    file_deleted: "Fișierul a fost șters.",
    milestone_created: "Etapa a fost adăugată.",
    milestone_updated: "Etapa a fost actualizată.",
    deleted: "Proiectul a fost șters."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    duplicate_code: "Codul proiectului există deja.",
    no_file: "Selectează un fișier pentru încărcare.",
    file_type: "Tipul fișierului nu este permis.",
    file_size: "Fișierul depășește limita de 25 MB."
  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function renderProgress(value = 0) {
  const progress = Math.max(0, Math.min(100, Number(value || 0)));
  return `
    <div class="nx-project-progress">
      <span style="width:${progress}%"></span>
    </div>
    <small class="nx-table-sub">${escapeHtml(progress)}%</small>
  `;
}

function clientOptions(clients = [], selectedId = "") {
  return clients.map((client) => `
    <option value="${escapeHtml(client.id)}" ${selected(selectedId, client.id)}>
      ${escapeHtml(client.name || "-")}${client.cui ? ` · ${escapeHtml(client.cui)}` : ""}
    </option>
  `).join("");
}

function projectForm({ project = {}, clients = [], action = "/nexora/projects", submitLabel = "Creează proiect" } = {}) {
  return `
    <form method="post" action="${escapeHtml(action)}" class="nx-form">
      <div class="nx-two-column-grid compact">
        <label class="nx-field"><span>Cod proiect</span><input name="project_code" value="${escapeHtml(project.project_code || "")}" placeholder="Se generează automat"></label>
        <label class="nx-field"><span>Denumire proiect *</span><input name="title" value="${escapeHtml(project.title || "")}" required placeholder="Implementare platformă client"></label>
        <label class="nx-field">
          <span>Client din CRM</span>
          <select name="client_id">
            <option value="">Fără client asociat</option>
            ${clientOptions(clients, project.client_id)}
          </select>
        </label>
        <label class="nx-field"><span>Client / beneficiar liber</span><input name="client_name" value="${escapeHtml(project.client_name || "")}" placeholder="Dacă nu este în CRM"></label>
        <label class="nx-field"><span>Responsabil proiect</span><input name="manager_name" value="${escapeHtml(project.manager_name || "")}" placeholder="Project manager"></label>
        <label class="nx-field">
          <span>Prioritate</span>
          <select name="priority">
            <option value="SCAZUTA" ${selected(project.priority, "SCAZUTA")}>Scăzută</option>
            <option value="MEDIE" ${selected(project.priority || "MEDIE", "MEDIE")}>Medie</option>
            <option value="RIDICATA" ${selected(project.priority, "RIDICATA")}>Ridicată</option>
            <option value="URGENTA" ${selected(project.priority, "URGENTA")}>Urgentă</option>
          </select>
        </label>
        <label class="nx-field"><span>Data start</span><input type="date" name="start_date" value="${escapeHtml(project.start_date || "")}"></label>
        <label class="nx-field"><span>Termen final</span><input type="date" name="due_date" value="${escapeHtml(project.due_date || "")}"></label>
        <label class="nx-field"><span>Buget estimat</span><input type="number" step="0.01" min="0" name="budget" value="${escapeHtml(project.budget || "")}" placeholder="0"></label>
        <label class="nx-field">
          <span>Monedă</span>
          <select name="currency">
            <option value="RON" ${selected(project.currency || "RON", "RON")}>RON</option>
            <option value="EUR" ${selected(project.currency, "EUR")}>EUR</option>
            <option value="USD" ${selected(project.currency, "USD")}>USD</option>
          </select>
        </label>
        ${project.id ? `
          <label class="nx-field">
            <span>Status proiect</span>
            <select name="status">
              <option value="PLANIFICARE" ${selected(project.status, "PLANIFICARE")}>Planificare</option>
              <option value="ACTIV" ${selected(project.status, "ACTIV")}>Activ</option>
              <option value="BLOCAT" ${selected(project.status, "BLOCAT")}>Blocat</option>
              <option value="IN_REVIZUIRE" ${selected(project.status, "IN_REVIZUIRE")}>În revizuire</option>
              <option value="FINALIZAT" ${selected(project.status, "FINALIZAT")}>Finalizat</option>
              <option value="ANULAT" ${selected(project.status, "ANULAT")}>Anulat</option>
            </select>
          </label>
        ` : ""}
      </div>
      <label class="nx-field"><span>Descriere / obiective</span><textarea name="description" placeholder="Scopul, rezultatele și livrabilele proiectului">${escapeHtml(project.description || "")}</textarea></label>
      <label class="nx-field"><span>Observații interne</span><textarea name="notes">${escapeHtml(project.notes || "")}</textarea></label>
      <div class="nx-form-actions"><button class="nx-btn primary" type="submit">${escapeHtml(submitLabel)}</button></div>
    </form>
  `;
}

function renderNexoraProjectsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};

  const rowsHtml = rows.length ? rows.map((project) => `
    <tr>
      <td>
        <a class="nx-table-main-link" href="/nexora/projects/${escapeHtml(project.id)}">${escapeHtml(project.title || "-")}</a>
        <div class="nx-table-sub">${escapeHtml(project.project_code || "-")} · ${escapeHtml(project.client_name || "fără client")}</div>
      </td>
      <td>${statusBadge(project.status)}</td>
      <td>${priorityBadge(project.priority)}</td>
      <td>${escapeHtml(project.manager_name || "-")}</td>
      <td>${renderProgress(project.progress)}</td>
      <td>${escapeHtml(project.open_tasks || 0)} / ${escapeHtml(project.total_tasks || 0)}</td>
      <td>${escapeHtml(project.due_date || "-")}</td>
      <td class="nx-table-actions"><a class="nx-btn" href="/nexora/projects/${escapeHtml(project.id)}">Deschide</a></td>
    </tr>
  `).join("") : `<tr><td colspan="8"><div class="nx-empty-state">Nu există proiecte. Creează primul proiect pentru a începe urmărirea.</div></td></tr>`;

  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Proiecte</h1>
          <p>Planificare, taskuri, termene, documente și progres centralizate pentru echipă.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/projects/new">Adaugă proiect</a>
          <a class="nx-btn" href="/nexora/projects/tasks">Task-uri</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PRJ</div><div><div class="nx-kpi-label">Proiecte</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.active || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">TSK</div><div><div class="nx-kpi-label">Task-uri deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_tasks || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">!</div><div><div class="nx-kpi-label">Întârziate</div><div class="nx-kpi-value">${escapeHtml(stats.overdue_tasks || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <form method="get" action="/nexora/projects" class="nx-inline-form">
        <label class="nx-field"><span>Caută</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="cod, proiect, client, responsabil"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="">Toate</option><option value="PLANIFICARE" ${selected(filters.status, "PLANIFICARE")}>Planificare</option><option value="ACTIV" ${selected(filters.status, "ACTIV")}>Activ</option><option value="BLOCAT" ${selected(filters.status, "BLOCAT")}>Blocat</option><option value="IN_REVIZUIRE" ${selected(filters.status, "IN_REVIZUIRE")}>În revizuire</option><option value="FINALIZAT" ${selected(filters.status, "FINALIZAT")}>Finalizat</option></select></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Filtrează</button><a class="nx-btn" href="/nexora/projects">Reset</a></div>
      </form>
      <div class="nx-table-wrap" style="margin-top:18px">
        <table class="nx-table">
          <thead><tr><th>Proiect</th><th>Status</th><th>Prioritate</th><th>Responsabil</th><th>Progres</th><th>Taskuri deschise / total</th><th>Termen</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return renderNexoraShell({ title: "Proiecte", appName: "Nexora ERP", companyName, user: options.user, currentPath: "/nexora/projects", eyebrow: "Proiecte", pageTitle: "Proiecte", body });
}

function renderNexoraProjectCreatePage(options = {}) {
  const body = `
    ${renderAlert("", options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Proiect nou</h1><p>Definește proiectul, responsabilul, termenul și bugetul inițial.</p></div>
        <a class="nx-btn" href="/nexora/projects">Înapoi la proiecte</a>
      </div>
      ${projectForm({ project: { project_code: options.nextCode || "" }, clients: options.clients || [] })}
    </section>
  `;
  return renderNexoraShell({ title: "Proiect nou", appName: "Nexora ERP", companyName: options.companyName || "Workspace", user: options.user, currentPath: "/nexora/projects", eyebrow: "Proiecte", pageTitle: "Proiect nou", body });
}

function renderNexoraProjectEditPage(options = {}) {
  const project = options.project || {};
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Editează ${escapeHtml(project.title || "proiect")}</h1><p>${escapeHtml(project.project_code || "-")} · ${statusBadge(project.status)}</p></div>
        <div class="nx-form-actions"><a class="nx-btn" href="/nexora/projects/${escapeHtml(project.id)}">Detalii</a><a class="nx-btn" href="/nexora/projects">Proiecte</a></div>
      </div>
      ${projectForm({ project, clients: options.clients || [], action: `/nexora/projects/${escapeHtml(project.id)}`, submitLabel: "Salvează proiectul" })}
      <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/delete" onsubmit="return confirm('Ștergi proiectul, task-urile, etapele și fișierele asociate?');" class="nx-project-delete-form">
        <button class="nx-btn danger" type="submit">Șterge proiectul</button>
      </form>
    </section>
  `;
  return renderNexoraShell({ title: project.title || "Editare proiect", appName: "Nexora ERP", companyName: options.companyName || "Workspace", user: options.user, currentPath: "/nexora/projects", eyebrow: "Proiecte", pageTitle: "Editare proiect", body });
}

function renderNexoraProjectDetailPage(options = {}) {
  const project = options.project || {};
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const files = Array.isArray(options.files) ? options.files : [];
  const milestones = Array.isArray(options.milestones) ? options.milestones : [];
  const activities = Array.isArray(options.activities) ? options.activities : [];
  const stats = options.stats || {};

  const tasksHtml = tasks.length ? tasks.map((task) => `
    <tr>
      <td><b>${escapeHtml(task.title || "-")}</b><div class="nx-table-sub">${escapeHtml(task.description || "")}</div></td>
      <td>${escapeHtml(task.assignee || "-")}</td>
      <td>${priorityBadge(task.priority)}</td>
      <td>${statusBadge(task.status)}</td>
      <td>${escapeHtml(task.due_date || "-")}</td>
      <td>
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/tasks/${escapeHtml(task.id)}/status" class="nx-table-action-form">
          <select name="status"><option value="DE_FACUT" ${selected(task.status, "DE_FACUT")}>De făcut</option><option value="IN_LUCRU" ${selected(task.status, "IN_LUCRU")}>În lucru</option><option value="BLOCAT" ${selected(task.status, "BLOCAT")}>Blocat</option><option value="FINALIZAT" ${selected(task.status, "FINALIZAT")}>Finalizat</option></select>
          <button class="nx-btn" type="submit">Actualizează</button>
        </form>
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/tasks/${escapeHtml(task.id)}/delete" onsubmit="return confirm('Ștergi task-ul?');" class="nx-table-action-form" style="margin-top:6px">
          <button class="nx-btn danger" type="submit">Șterge</button>
        </form>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="6"><div class="nx-empty-state">Nu există taskuri încă.</div></td></tr>`;

  const filesHtml = files.length ? files.map((file) => `
    <tr>
      <td><b>${escapeHtml(file.original_file_name || "-")}</b><div class="nx-table-sub">${escapeHtml(file.notes || "")}</div></td>
      <td>${escapeHtml(file.category || "-")}</td>
      <td>${escapeHtml(file.file_size_label || "-")}</td>
      <td>${escapeHtml(file.created_at || "-")}</td>
      <td class="nx-table-actions">
        <a class="nx-btn primary" href="/nexora/projects/${escapeHtml(project.id)}/files/${escapeHtml(file.id)}/download">Descarcă</a>
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/files/${escapeHtml(file.id)}/delete" onsubmit="return confirm('Ștergi fișierul?');"><button class="nx-btn danger" type="submit">Șterge</button></form>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5"><div class="nx-empty-state">Nu există fișiere încărcate.</div></td></tr>`;

  const milestonesHtml = milestones.length ? milestones.map((milestone) => `
    <tr>
      <td><b>${escapeHtml(milestone.title || "-")}</b><div class="nx-table-sub">${escapeHtml(milestone.notes || "")}</div></td>
      <td>${escapeHtml(milestone.due_date || "-")}</td>
      <td>${statusBadge(milestone.status)}</td>
      <td>
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/milestones/${escapeHtml(milestone.id)}/status" class="nx-table-action-form">
          <select name="status"><option value="PLANIFICAT" ${selected(milestone.status, "PLANIFICAT")}>Planificat</option><option value="IN_LUCRU" ${selected(milestone.status, "IN_LUCRU")}>În lucru</option><option value="BLOCAT" ${selected(milestone.status, "BLOCAT")}>Blocat</option><option value="REALIZAT" ${selected(milestone.status, "REALIZAT")}>Realizat</option></select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="4"><div class="nx-empty-state">Nu există etape definite.</div></td></tr>`;

  const activityHtml = activities.length ? activities.map((activity) => `
    <div class="nx-project-event">
      <b>${escapeHtml(activity.subject || "-")}</b>
      <span>${escapeHtml(activity.details || "")}</span>
      <small>${escapeHtml(activity.actor_email || "")} · ${escapeHtml(activity.created_at || "")}</small>
    </div>
  `).join("") : `<div class="nx-empty-state">Nu există activitate înregistrată.</div>`;

  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(project.title || "Proiect")}</h1>
          <p>${escapeHtml(project.project_code || "-")} · ${escapeHtml(project.client_name || "fără client")} · ${statusBadge(project.status)} ${priorityBadge(project.priority)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/projects">Înapoi</a>
          <a class="nx-btn" href="/nexora/projects/${escapeHtml(project.id)}/edit">Editează</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">%</div><div><div class="nx-kpi-label">Progres din taskuri</div><div class="nx-kpi-value">${escapeHtml(project.progress || 0)}%</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">TSK</div><div><div class="nx-kpi-label">Finalizate</div><div class="nx-kpi-value">${escapeHtml(stats.done_tasks || 0)} / ${escapeHtml(stats.total_tasks || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DOC</div><div><div class="nx-kpi-label">Fișiere</div><div class="nx-kpi-value">${escapeHtml(files.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">BUG</div><div><div class="nx-kpi-label">Buget</div><div class="nx-kpi-value">${escapeHtml(money(project.budget, project.currency))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Status proiect</h2><span>urmărire executivă</span></div></div>
        ${renderProgress(project.progress)}
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/status" class="nx-form" style="margin-top:14px">
          <label class="nx-field"><span>Status</span><select name="status"><option value="PLANIFICARE" ${selected(project.status, "PLANIFICARE")}>Planificare</option><option value="ACTIV" ${selected(project.status, "ACTIV")}>Activ</option><option value="BLOCAT" ${selected(project.status, "BLOCAT")}>Blocat</option><option value="IN_REVIZUIRE" ${selected(project.status, "IN_REVIZUIRE")}>În revizuire</option><option value="FINALIZAT" ${selected(project.status, "FINALIZAT")}>Finalizat</option><option value="ANULAT" ${selected(project.status, "ANULAT")}>Anulat</option></select></label>
          <label class="nx-field"><span>Notă status</span><input name="note" placeholder="Motiv schimbare / blocaj"></label>
          <button class="nx-btn primary" type="submit">Actualizează status</button>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Detalii</h2><span>${escapeHtml(project.manager_name || "responsabil nesetat")}</span></div></div>
        <table class="nx-table"><tbody>
          <tr><th>Start</th><td>${escapeHtml(project.start_date || "-")}</td></tr>
          <tr><th>Termen</th><td>${escapeHtml(project.due_date || "-")}</td></tr>
          <tr><th>Descriere</th><td>${escapeHtml(project.description || "-")}</td></tr>
          <tr><th>Observații</th><td>${escapeHtml(project.notes || "-")}</td></tr>
        </tbody></table>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Task-uri</h1><p>Responsabili, priorități, termene și execuție.</p></div><a class="nx-btn" href="/nexora/projects/tasks">Toate task-urile</a></div>
      <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/tasks" class="nx-inline-form nx-project-create-row">
        <label class="nx-field"><span>Task *</span><input name="title" required placeholder="Livrabil sau acțiune"></label>
        <label class="nx-field"><span>Responsabil</span><input name="assignee" placeholder="Nume / echipă"></label>
        <label class="nx-field"><span>Termen</span><input type="date" name="due_date"></label>
        <label class="nx-field"><span>Prioritate</span><select name="priority"><option value="MEDIE">Medie</option><option value="RIDICATA">Ridicată</option><option value="URGENTA">Urgentă</option><option value="SCAZUTA">Scăzută</option></select></label>
        <label class="nx-field"><span>Detalii</span><input name="description"></label>
        <button class="nx-btn primary" type="submit">Adaugă task</button>
      </form>
      <div class="nx-table-wrap" style="margin-top:18px"><table class="nx-table"><thead><tr><th>Task</th><th>Responsabil</th><th>Prioritate</th><th>Status</th><th>Termen</th><th></th></tr></thead><tbody>${tasksHtml}</tbody></table></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Fișiere proiect</h2><span>încărcare și descărcare securizată</span></div></div>
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/files" enctype="multipart/form-data" class="nx-form">
          <label class="nx-field"><span>Fișier *</span><input type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.zip,.xml,.msg,.eml,.ppt,.pptx" required></label>
          <p class="nx-field-hint">Acceptă PDF, Word, Excel, imagini, ZIP, XML, email și PowerPoint, maximum 25 MB.</p>
          <label class="nx-field"><span>Categorie</span><select name="category"><option value="DOCUMENT">Document</option><option value="CONTRACT">Contract</option><option value="LIVRABIL">Livrabil</option><option value="OFERTA">Ofertă</option><option value="ALTELE">Altele</option></select></label>
          <label class="nx-field"><span>Notă</span><input name="notes"></label>
          <button class="nx-btn primary" type="submit">Încarcă fișier</button>
        </form>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Etape / milestone-uri</h2><span>repere proiect</span></div></div>
        <form method="post" action="/nexora/projects/${escapeHtml(project.id)}/milestones" class="nx-form">
          <label class="nx-field"><span>Etapă *</span><input name="title" required placeholder="Acceptanță livrabil"></label>
          <label class="nx-field"><span>Termen</span><input type="date" name="due_date"></label>
          <label class="nx-field"><span>Observații</span><input name="notes"></label>
          <button class="nx-btn primary" type="submit">Adaugă etapă</button>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Documente încărcate</h1><p>Documentație, contracte și livrabile asociate proiectului.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Fișier</th><th>Categorie</th><th>Mărime</th><th>Încărcat</th><th></th></tr></thead><tbody>${filesHtml}</tbody></table></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Etape proiect</h2><span>${escapeHtml(milestones.length)} repere</span></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Etapă</th><th>Termen</th><th>Status</th><th></th></tr></thead><tbody>${milestonesHtml}</tbody></table></div>
      </section>
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Jurnal activitate</h2><span>ultimele modificări</span></div></div>
        <div class="nx-project-timeline">${activityHtml}</div>
      </section>
    </div>
  `;
  return renderNexoraShell({ title: project.title || "Proiect", appName: "Nexora ERP", companyName: options.companyName || "Workspace", user: options.user, currentPath: "/nexora/projects", eyebrow: "Proiecte", pageTitle: project.title || "Proiect", body });
}

function renderNexoraProjectTasksPage(options = {}) {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const filters = options.filters || {};
  const stats = options.stats || {};
  const rowsHtml = tasks.length ? tasks.map((task) => `
    <tr>
      <td><b>${escapeHtml(task.title || "-")}</b><div class="nx-table-sub">${escapeHtml(task.assignee || "neasignat")}</div></td>
      <td><a class="nx-table-main-link" href="/nexora/projects/${escapeHtml(task.project_id)}">${escapeHtml(task.project_title || "-")}</a><div class="nx-table-sub">${escapeHtml(task.project_code || "-")}</div></td>
      <td>${priorityBadge(task.priority)}</td>
      <td>${statusBadge(task.status)}</td>
      <td>${escapeHtml(task.due_date || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="5"><div class="nx-empty-state">Nu există task-uri pentru filtrul ales.</div></td></tr>`;
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Task-uri proiecte</h1><p>Vedere transversală asupra execuției și termenelor.</p></div><div class="nx-form-actions"><a class="nx-btn primary" href="/nexora/projects/new">Proiect nou</a><a class="nx-btn" href="/nexora/projects">Proiecte</a></div></div>
    </section>
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">ALL</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RUN</div><div><div class="nx-kpi-label">În lucru</div><div class="nx-kpi-value">${escapeHtml(stats.in_progress || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">!</div><div><div class="nx-kpi-label">Întârziate</div><div class="nx-kpi-value">${escapeHtml(stats.overdue || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Finalizate</div><div class="nx-kpi-value">${escapeHtml(stats.done || 0)}</div></div></div>
    </section>
    <section class="nx-content-card">
      <form method="get" action="/nexora/projects/tasks" class="nx-inline-form">
        <label class="nx-field"><span>Caută</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="task, proiect, responsabil"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="">Toate</option><option value="DE_FACUT" ${selected(filters.status, "DE_FACUT")}>De făcut</option><option value="IN_LUCRU" ${selected(filters.status, "IN_LUCRU")}>În lucru</option><option value="BLOCAT" ${selected(filters.status, "BLOCAT")}>Blocat</option><option value="FINALIZAT" ${selected(filters.status, "FINALIZAT")}>Finalizat</option></select></label>
        <label class="nx-field"><span>Proiect</span><select name="project_id"><option value="">Toate</option>${(options.projects || []).map((project) => `<option value="${escapeHtml(project.id)}" ${selected(filters.projectId, project.id)}>${escapeHtml(project.title || "-")}</option>`).join("")}</select></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Filtrează</button><a class="nx-btn" href="/nexora/projects/tasks">Reset</a></div>
      </form>
      <div class="nx-table-wrap" style="margin-top:18px"><table class="nx-table"><thead><tr><th>Task</th><th>Proiect</th><th>Prioritate</th><th>Status</th><th>Termen</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return renderNexoraShell({ title: "Task-uri proiecte", appName: "Nexora ERP", companyName: options.companyName || "Workspace", user: options.user, currentPath: "/nexora/projects/tasks", eyebrow: "Proiecte", pageTitle: "Task-uri", body });
}

export {
  renderNexoraProjectCreatePage,
  renderNexoraProjectDetailPage,
  renderNexoraProjectEditPage,
  renderNexoraProjectsPage,
  renderNexoraProjectTasksPage
};
