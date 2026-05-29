function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, currency = "RON") {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} ${currency || "RON"}`;
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "ACCEPTED", "ACCEPTATA", "FINALIZAT", "REALIZAT", "ACHITATA", "INCHIS", "REZOLVAT"].includes(normalized)) return "success";
  if (["BLOCAT", "ANULAT", "ANULATA", "RESPINSA", "REJECTED", "RESTANTA"].includes(normalized)) return "danger";
  if (["IN_LUCRU", "IN_REVIZUIRE", "PLANIFICARE", "DESCHIS", "DRAFT", "CIORNA", "TRIMISA"].includes(normalized)) return "warn";
  return "neutral";
}

function statusLabel(value = "") {
  const labels = {
    DRAFT: "Ciornă",
    CIORNA: "Ciornă",
    SENT: "Trimisă",
    TRIMISA: "Trimisă",
    ACCEPTED: "Acceptată",
    ACCEPTATA: "Acceptată",
    REJECTED: "Respinsă",
    PLANIFICARE: "Planificare",
    ACTIV: "Activ",
    BLOCAT: "Blocat",
    IN_REVIZUIRE: "În revizuire",
    FINALIZAT: "Finalizat",
    ANULAT: "Anulat",
    DE_FACUT: "De făcut",
    IN_LUCRU: "În lucru",
    PLANIFICAT: "Planificat",
    REALIZAT: "Realizat",
    DESCHIS: "Deschis",
    IN_ASTEPTARE_CLIENT: "În așteptare",
    REZOLVAT: "Rezolvat",
    INCHIS: "Închis"
  };
  const normalized = String(value || "").trim().toUpperCase();
  return labels[normalized] || normalized || "-";
}

function statusBadge(value = "") {
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(statusLabel(value))}</span>`;
}

function progressBar(value = 0) {
  const progress = Math.max(0, Math.min(100, Number(value || 0)));
  return `
    <div class="nx-project-progress"><span style="width:${progress}%"></span></div>
    <small class="nx-table-sub">${escapeHtml(progress)}%</small>
  `;
}

function tableRows(rows = [], emptyMessage = "Nu există înregistrări.", mapper = () => "") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="10"><div class="nx-empty-state">${escapeHtml(emptyMessage)}</div></td></tr>`;
}

const navItems = [
  ["Dashboard", "/client-portal/dashboard", "⌂"],
  ["Proiecte", "/client-portal/projects", "▥"],
  ["Task-uri", "/client-portal/tasks", "☑"],
  ["Oferte", "/client-portal/offers", "↗"],
  ["Contracte", "/client-portal/contracts", "▣"],
  ["Facturi", "/client-portal/invoices", "▤"],
  ["Documente", "/client-portal/documents", "▧"],
  ["Suport", "/client-portal/tickets", "!"],
  ["Mesaje", "/client-portal/messages", "✉"]
];

function isActive(currentPath = "", href = "") {
  const current = String(currentPath || "").split(/[?#]/)[0];
  const target = String(href || "").split(/[?#]/)[0];
  return current === target || (target !== "/client-portal/dashboard" && current.startsWith(target + "/"));
}

function renderClientPortalShell(options = {}) {
  const title = options.title || "Portal client";
  const companyName = options.companyName || "Nexora";
  const client = options.client || {};
  const user = options.user || {};
  const currentPath = options.currentPath || "/client-portal/dashboard";
  const actionsHtml = options.actionsHtml || "";
  const body = options.body || "";
  const navHtml = navItems.map(([label, href, icon]) => `
    <a class="cp-nav-item ${isActive(currentPath, href) ? "active" : ""}" href="${escapeHtml(href)}">
      <span>${escapeHtml(icon)}</span>
      <b>${escapeHtml(label)}</b>
    </a>
  `).join("");

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
  <style>
    .cp-shell{min-height:100vh;display:grid;grid-template-columns:260px minmax(0,1fr);background:#f5f7fb;color:#0f172a}
    .cp-sidebar{background:#fff;border-right:1px solid #e2e8f0;padding:18px 14px;position:sticky;top:0;height:100vh;overflow:auto}
    .cp-brand{display:flex;gap:10px;align-items:center;padding:0 8px 18px;border-bottom:1px solid #e2e8f0;margin-bottom:14px}
    .cp-brand-mark{width:38px;height:38px;border-radius:8px;background:#14532d;color:#fff;display:grid;place-items:center;font-weight:900}
    .cp-brand-title{font-weight:900;line-height:1.1}.cp-brand-subtitle{font-size:12px;color:#64748b;margin-top:2px}
    .cp-nav{display:grid;gap:6px}.cp-nav-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;color:#334155;text-decoration:none}
    .cp-nav-item span{width:26px;height:26px;border-radius:7px;background:#f1f5f9;display:grid;place-items:center;color:#0f172a;font-size:13px}
    .cp-nav-item.active,.cp-nav-item:hover{background:#ecfdf5;color:#14532d}.cp-nav-item.active span,.cp-nav-item:hover span{background:#bbf7d0;color:#14532d}
    .cp-main{min-width:0;padding:18px 22px 28px}.cp-topbar{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:18px}
    .cp-eyebrow{font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase}.cp-title{font-size:24px;line-height:1.15;font-weight:900}
    .cp-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.cp-user{font-size:12px;color:#64748b;text-align:right}
    .cp-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
    .cp-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px}.cp-kpi span{font-size:12px;color:#64748b;font-weight:800}.cp-kpi b{display:block;font-size:24px;margin-top:6px}
    .cp-two{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:14px}.cp-list{display:grid;gap:10px}
    .cp-list-item{border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fff;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .cp-muted{color:#64748b;font-size:12px}.cp-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cp-form-grid .wide{grid-column:1/-1}
    @media (max-width: 920px){.cp-shell{grid-template-columns:1fr}.cp-sidebar{position:relative;height:auto}.cp-main{padding:14px}.cp-card-grid,.cp-two,.cp-form-grid{grid-template-columns:1fr}.cp-topbar{align-items:flex-start;flex-direction:column}.cp-user{text-align:left}}
  </style>
</head>
<body>
  <div class="cp-shell">
    <aside class="cp-sidebar">
      <div class="cp-brand">
        <div class="cp-brand-mark">N</div>
        <div>
          <div class="cp-brand-title">Nexora Portal</div>
          <div class="cp-brand-subtitle">${escapeHtml(companyName)}</div>
        </div>
      </div>
      <nav class="cp-nav">${navHtml}</nav>
    </aside>
    <main class="cp-main">
      <header class="cp-topbar">
        <div>
          <div class="cp-eyebrow">${escapeHtml(client.name || "Portal client")}</div>
          <div class="cp-title">${escapeHtml(title)}</div>
        </div>
        <div class="cp-actions">
          ${actionsHtml}
          <div class="cp-user">${escapeHtml(user.email || "")}</div>
          <form method="post" action="/logout" class="nx-logout-form"><button class="nx-btn" type="submit">Logout</button></form>
        </div>
      </header>
      ${body}
    </main>
  </div>
</body>
</html>`;
}

function renderKpis(items = []) {
  return `<section class="cp-card-grid">${items.map((item) => `
    <div class="cp-kpi"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value ?? 0)}</b></div>
  `).join("")}</section>`;
}

function renderDashboardPage(options = {}) {
  const stats = options.stats || {};
  const projects = options.recentProjects || [];
  const tasks = options.recentTasks || [];
  const documents = options.recentDocuments || [];
  const offers = options.recentOffers || [];

  const body = `
    ${renderKpis([
      { label: "Proiecte active", value: stats.activeProjects || 0 },
      { label: "Task-uri deschise", value: stats.openTasks || 0 },
      { label: "Oferte disponibile", value: stats.openOffers || 0 },
      { label: "Tichete suport", value: stats.openTickets || 0 }
    ])}
    <div class="cp-two">
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Proiecte recente</h2><span>${escapeHtml(projects.length)} afișate</span></div><a class="nx-btn" href="/client-portal/projects">Toate</a></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Proiect</th><th>Status</th><th>Progres</th><th>Termen</th><th></th></tr></thead><tbody>
          ${tableRows(projects, "Nu există proiecte.", (project) => `
            <tr>
              <td><a class="nx-table-main-link" href="/client-portal/projects/${escapeHtml(project.id)}">${escapeHtml(project.title || "-")}</a><div class="nx-table-sub">${escapeHtml(project.project_code || "-")}</div></td>
              <td>${statusBadge(project.status)}</td>
              <td>${progressBar(project.progress)}</td>
              <td>${escapeHtml(project.due_date || "-")}</td>
              <td class="nx-table-actions"><a class="nx-btn primary" href="/client-portal/projects/${escapeHtml(project.id)}">Deschide</a></td>
            </tr>
          `)}
        </tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Task-uri apropiate</h2><span>${escapeHtml(tasks.length)} task-uri</span></div><a class="nx-btn" href="/client-portal/tasks">Toate</a></div>
        <div class="cp-list">
          ${tasks.length ? tasks.map((task) => `
            <div class="cp-list-item">
              <div><b>${escapeHtml(task.title || "-")}</b><div class="cp-muted">${escapeHtml(task.project_title || "")}</div></div>
              <div>${statusBadge(task.status)}<div class="cp-muted">${escapeHtml(task.due_date || "-")}</div></div>
            </div>
          `).join("") : `<div class="nx-empty-state">Nu există task-uri deschise.</div>`}
        </div>
      </section>
    </div>
    <div class="cp-two" style="margin-top:14px">
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Oferte recente</h2><span>${escapeHtml(offers.length)} afișate</span></div><a class="nx-btn" href="/client-portal/offers">Toate</a></div>
        <div class="cp-list">
          ${offers.length ? offers.map((offer) => `
            <div class="cp-list-item">
              <div><b>${escapeHtml(offer.quote_number || "-")}</b><div class="cp-muted">${escapeHtml(offer.title || "Ofertă comercială")}</div></div>
              <div><b>${escapeHtml(money(offer.total, offer.currency))}</b><div>${statusBadge(offer.status)}</div></div>
            </div>
          `).join("") : `<div class="nx-empty-state">Nu există oferte asociate.</div>`}
        </div>
      </section>
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Documente recente</h2><span>${escapeHtml(documents.length)} documente</span></div><a class="nx-btn" href="/client-portal/documents">Toate</a></div>
        <div class="cp-list">
          ${documents.length ? documents.map((document) => `
            <div class="cp-list-item">
              <div><b>${escapeHtml(document.title || "-")}</b><div class="cp-muted">${escapeHtml(document.kind || "")} · ${escapeHtml(document.createdAt || "-")}</div></div>
              ${document.downloadHref ? `<a class="nx-btn primary" href="${escapeHtml(document.downloadHref)}">Descarcă</a>` : ""}
            </div>
          `).join("") : `<div class="nx-empty-state">Nu există documente.</div>`}
        </div>
      </section>
    </div>
  `;

  return renderClientPortalShell({ ...options, title: "Dashboard", currentPath: "/client-portal/dashboard", body });
}

function renderProjectsPage(options = {}) {
  const projects = options.projects || [];
  const body = `
    ${renderKpis([
      { label: "Total proiecte", value: projects.length },
      { label: "Active", value: projects.filter((p) => ["ACTIV", "IN_REVIZUIRE"].includes(String(p.status || "").toUpperCase())).length },
      { label: "Finalizate", value: projects.filter((p) => String(p.status || "").toUpperCase() === "FINALIZAT").length },
      { label: "Cu termen", value: projects.filter((p) => p.due_date).length }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Proiecte</h2><span>Proiectele asociate contului tău</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Proiect</th><th>Status</th><th>Prioritate</th><th>Progres</th><th>Termen</th><th></th></tr></thead><tbody>
        ${tableRows(projects, "Nu există proiecte asociate.", (project) => `
          <tr>
            <td><a class="nx-table-main-link" href="/client-portal/projects/${escapeHtml(project.id)}">${escapeHtml(project.title || "-")}</a><div class="nx-table-sub">${escapeHtml(project.project_code || "-")} · ${escapeHtml(project.manager_name || "responsabil nesetat")}</div></td>
            <td>${statusBadge(project.status)}</td>
            <td>${escapeHtml(project.priority || "-")}</td>
            <td>${progressBar(project.progress)}</td>
            <td>${escapeHtml(project.due_date || "-")}</td>
            <td class="nx-table-actions"><a class="nx-btn primary" href="/client-portal/projects/${escapeHtml(project.id)}">Detalii</a></td>
          </tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Proiecte", currentPath: "/client-portal/projects", body });
}

function renderProjectDetailPage(options = {}) {
  const project = options.project || {};
  const tasks = options.tasks || [];
  const milestones = options.milestones || [];
  const files = options.files || [];
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(project.title || "Proiect")}</h1><p>${escapeHtml(project.project_code || "-")} · ${statusBadge(project.status)} · ${escapeHtml(project.manager_name || "responsabil nesetat")}</p></div>
        <a class="nx-btn" href="/client-portal/projects">Înapoi</a>
      </div>
      <div class="nx-client-info-grid">
        <div><span>Start</span><b>${escapeHtml(project.start_date || "-")}</b></div>
        <div><span>Termen</span><b>${escapeHtml(project.due_date || "-")}</b></div>
        <div><span>Prioritate</span><b>${escapeHtml(project.priority || "-")}</b></div>
        <div><span>Buget</span><b>${escapeHtml(money(project.budget, project.currency))}</b></div>
        <div class="wide"><span>Descriere</span><b>${escapeHtml(project.description || "-")}</b></div>
      </div>
    </section>
    ${renderKpis([
      { label: "Progres", value: `${Number(project.progress || 0)}%` },
      { label: "Task-uri", value: tasks.length },
      { label: "Etape", value: milestones.length },
      { label: "Fișiere", value: files.length }
    ])}
    <div class="cp-two">
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Task-uri</h2><span>Stadiu livrabile</span></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Responsabil</th><th>Status</th><th>Termen</th></tr></thead><tbody>
          ${tableRows(tasks, "Nu există task-uri.", (task) => `
            <tr><td><b>${escapeHtml(task.title || "-")}</b><div class="nx-table-sub">${escapeHtml(task.description || "")}</div></td><td>${escapeHtml(task.assignee || "-")}</td><td>${statusBadge(task.status)}</td><td>${escapeHtml(task.due_date || "-")}</td></tr>
          `)}
        </tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Etape</h2><span>Repere proiect</span></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Etapă</th><th>Status</th><th>Termen</th></tr></thead><tbody>
          ${tableRows(milestones, "Nu există etape.", (milestone) => `
            <tr><td><b>${escapeHtml(milestone.title || "-")}</b><div class="nx-table-sub">${escapeHtml(milestone.notes || "")}</div></td><td>${statusBadge(milestone.status)}</td><td>${escapeHtml(milestone.due_date || "-")}</td></tr>
          `)}
        </tbody></table></div>
      </section>
    </div>
    <section class="nx-content-card" style="margin-top:14px">
      <div class="nx-panel-head"><div><h2>Fișiere proiect</h2><span>Documente publicate pe proiect</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Fișier</th><th>Categorie</th><th>Încărcat</th><th></th></tr></thead><tbody>
        ${tableRows(files, "Nu există fișiere.", (file) => `
          <tr><td><b>${escapeHtml(file.original_file_name || "-")}</b><div class="nx-table-sub">${escapeHtml(file.notes || "")}</div></td><td>${escapeHtml(file.category || "-")}</td><td>${escapeHtml(file.created_at || "-")}</td><td class="nx-table-actions"><a class="nx-btn primary" href="/client-portal/documents/project-files/${escapeHtml(project.id)}/${escapeHtml(file.id)}/download">Descarcă</a></td></tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: project.title || "Proiect", currentPath: "/client-portal/projects", body });
}

function renderTasksPage(options = {}) {
  const tasks = options.tasks || [];
  const body = `
    ${renderKpis([
      { label: "Task-uri", value: tasks.length },
      { label: "Deschise", value: tasks.filter((t) => String(t.status || "").toUpperCase() !== "FINALIZAT").length },
      { label: "În lucru", value: tasks.filter((t) => String(t.status || "").toUpperCase() === "IN_LUCRU").length },
      { label: "Finalizate", value: tasks.filter((t) => String(t.status || "").toUpperCase() === "FINALIZAT").length }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Task-uri</h2><span>Task-uri din proiectele tale</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Task</th><th>Proiect</th><th>Responsabil</th><th>Status</th><th>Termen</th></tr></thead><tbody>
        ${tableRows(tasks, "Nu există task-uri.", (task) => `
          <tr>
            <td><b>${escapeHtml(task.title || "-")}</b><div class="nx-table-sub">${escapeHtml(task.description || "")}</div></td>
            <td><a class="nx-table-main-link" href="/client-portal/projects/${escapeHtml(task.project_id)}">${escapeHtml(task.project_title || "-")}</a></td>
            <td>${escapeHtml(task.assignee || "-")}</td>
            <td>${statusBadge(task.status)}</td>
            <td>${escapeHtml(task.due_date || "-")}</td>
          </tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Task-uri", currentPath: "/client-portal/tasks", body });
}

function renderOffersPage(options = {}) {
  const offers = options.offers || [];
  const ok = options.ok || "";
  const body = `
    ${ok === "accepted" ? `<section class="nx-content-card" style="border-color:#bbf7d0;background:#ecfdf5;color:#166534">Oferta a fost acceptată și acțiunea a fost logată.</section>` : ""}
    ${renderKpis([
      { label: "Oferte", value: offers.length },
      { label: "Acceptate", value: offers.filter((o) => ["ACCEPTED", "ACCEPTATA"].includes(String(o.status || "").toUpperCase())).length },
      { label: "Deschise", value: offers.filter((o) => !["ACCEPTED", "ACCEPTATA", "REJECTED", "RESPINSA"].includes(String(o.status || "").toUpperCase())).length },
      { label: "Valoare totală", value: money(offers.reduce((sum, o) => sum + Number(o.total || 0), 0), "RON") }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Oferte</h2><span>Ofertele asociate companiei tale</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Ofertă</th><th>Status</th><th>Total</th><th>Valabilă până la</th><th></th></tr></thead><tbody>
        ${tableRows(offers, "Nu există oferte.", (offer) => {
          const accepted = ["ACCEPTED", "ACCEPTATA"].includes(String(offer.status || "").toUpperCase());
          return `
            <tr>
              <td><b>${escapeHtml(offer.quote_number || "-")}</b><div class="nx-table-sub">${escapeHtml(offer.title || "Ofertă comercială")} · ${escapeHtml(offer.created_at || "-")}</div></td>
              <td>${statusBadge(offer.status)}</td>
              <td>${escapeHtml(money(offer.total, offer.currency))}</td>
              <td>${escapeHtml(offer.valid_until || "-")}</td>
              <td class="nx-table-actions">
                ${offer.pdf_path ? `<a class="nx-btn" href="/client-portal/documents/offers/${escapeHtml(offer.id)}/download">PDF</a>` : ""}
                ${accepted ? `<span class="nx-status-pill success">Acceptată</span>` : `<form method="post" action="/client-portal/offers/${escapeHtml(offer.id)}/accept"><button class="nx-btn primary" type="submit">Acceptă</button></form>`}
              </td>
            </tr>
          `;
        })}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Oferte", currentPath: "/client-portal/offers", body });
}

function renderContractsPage(options = {}) {
  const contracts = options.contracts || [];
  const body = `
    ${renderKpis([
      { label: "Contracte", value: contracts.length },
      { label: "Cu PDF", value: contracts.filter((c) => c.pdf_path).length },
      { label: "Valoare", value: money(contracts.reduce((sum, c) => sum + Number(c.price || 0), 0), "RON") },
      { label: "Ultimul", value: contracts[0]?.created_at || "-" }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Contracte</h2><span>Contractele disponibile în portal</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Contract</th><th>Serviciu</th><th>Valoare</th><th>Durată</th><th></th></tr></thead><tbody>
        ${tableRows(contracts, "Nu există contracte.", (contract) => `
          <tr>
            <td><b>${escapeHtml(contract.contract_number || "-")}</b><div class="nx-table-sub">${escapeHtml(contract.created_at || "-")}</div></td>
            <td>${escapeHtml(contract.service_description || "-")}</td>
            <td>${escapeHtml(money(contract.price, "RON"))}</td>
            <td>${escapeHtml(contract.duration || "-")}</td>
            <td class="nx-table-actions">${contract.pdf_path ? `<a class="nx-btn primary" href="/client-portal/documents/contracts/${escapeHtml(contract.id)}/download">Descarcă</a>` : "-"}</td>
          </tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Contracte", currentPath: "/client-portal/contracts", body });
}

function renderInvoicesPage(options = {}) {
  const invoices = options.invoices || [];
  const body = `
    ${renderKpis([
      { label: "Facturi", value: invoices.length },
      { label: "Cu PDF", value: invoices.filter((invoice) => invoice.pdf_path).length },
      { label: "Total", value: money(invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0), "RON") },
      { label: "Ultima", value: invoices[0]?.data_emitere || "-" }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Facturi</h2><span>Facturile disponibile pentru descărcare</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Factură</th><th>Status</th><th>Data emiterii</th><th>Scadență</th><th>Total</th><th></th></tr></thead><tbody>
        ${tableRows(invoices, "Nu există facturi.", (invoice) => `
          <tr>
            <td><b>${escapeHtml(invoice.factura_nr || "-")}</b><div class="nx-table-sub">${escapeHtml(invoice.created_at || "-")}</div></td>
            <td>${statusBadge(invoice.status)}</td>
            <td>${escapeHtml(invoice.data_emitere || "-")}</td>
            <td>${escapeHtml(invoice.scadenta || "-")}</td>
            <td>${escapeHtml(money(invoice.total, invoice.moneda))}</td>
            <td class="nx-table-actions">${invoice.pdf_path ? `<a class="nx-btn primary" href="/client-portal/invoices/${escapeHtml(invoice.id)}/download">Descarcă</a>` : "-"}</td>
          </tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Facturi", currentPath: "/client-portal/invoices", body });
}

function renderDocumentsPage(options = {}) {
  const documents = options.documents || [];
  const projects = options.projects || [];
  const tickets = options.tickets || [];
  const ok = options.ok || "";
  const projectOptions = projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title || project.project_code || "")}</option>`).join("");
  const ticketOptions = tickets.map((ticket) => `<option value="${escapeHtml(ticket.id)}">${escapeHtml(ticket.ticket_number || "")} - ${escapeHtml(ticket.subject || "")}</option>`).join("");
  const body = `
    ${ok === "uploaded" ? `<section class="nx-content-card" style="border-color:#bbf7d0;background:#ecfdf5;color:#166534">Documentul a fost încărcat și logat.</section>` : ""}
    ${renderKpis([
      { label: "Documente", value: documents.length },
      { label: "Încărcate de tine", value: documents.filter((d) => d.source === "client_upload").length },
      { label: "Contracte", value: documents.filter((d) => d.category === "CONTRACTE").length },
      { label: "Facturi", value: documents.filter((d) => d.category === "FACTURI").length }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Încarcă document</h2><span>Fișierul va fi asociat automat clientului tău</span></div></div>
      <form class="cp-form-grid" method="post" action="/client-portal/uploads" enctype="multipart/form-data">
        <label class="nx-field"><span>Titlu</span><input name="title" required placeholder="Ex: Proces verbal semnat"></label>
        <label class="nx-field"><span>Categorie</span><select name="category"><option value="DOCUMENT">Document</option><option value="CONTRACT">Contract</option><option value="OFERTA">Ofertă</option><option value="FACTURA">Factură</option><option value="SUPORT">Suport</option></select></label>
        <label class="nx-field"><span>Proiect</span><select name="project_id"><option value="">Fără proiect</option>${projectOptions}</select></label>
        <label class="nx-field"><span>Ticket</span><select name="ticket_id"><option value="">Fără ticket</option>${ticketOptions}</select></label>
        <label class="nx-field wide"><span>Fișier</span><input name="file" type="file" required></label>
        <div class="wide"><button class="nx-btn primary" type="submit">Încarcă document</button></div>
      </form>
    </section>
    <section class="nx-content-card" style="margin-top:14px">
      <div class="nx-panel-head"><div><h2>Documente</h2><span>Toate documentele asociate contului tău</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Document</th><th>Categorie</th><th>Tip</th><th>Dată</th><th></th></tr></thead><tbody>
        ${tableRows(documents, "Nu există documente.", (document) => `
          <tr>
            <td><b>${escapeHtml(document.title || "-")}</b><div class="nx-table-sub">${escapeHtml(document.fileName || "")}</div></td>
            <td>${escapeHtml(document.category || "-")}</td>
            <td>${escapeHtml(document.kind || "-")}</td>
            <td>${escapeHtml(document.createdAt || "-")}</td>
            <td class="nx-table-actions">${document.downloadHref ? `<a class="nx-btn primary" href="${escapeHtml(document.downloadHref)}">Descarcă</a>` : "-"}</td>
          </tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Documente", currentPath: "/client-portal/documents", body });
}

function renderTicketsPage(options = {}) {
  const tickets = options.tickets || [];
  const ok = options.ok || "";
  const body = `
    ${ok === "created" ? `<section class="nx-content-card" style="border-color:#bbf7d0;background:#ecfdf5;color:#166534">Ticketul a fost creat și logat.</section>` : ""}
    ${renderKpis([
      { label: "Tichete", value: tickets.length },
      { label: "Deschise", value: tickets.filter((t) => !["REZOLVAT", "INCHIS"].includes(String(t.status || "").toUpperCase())).length },
      { label: "Rezolvate", value: tickets.filter((t) => String(t.status || "").toUpperCase() === "REZOLVAT").length },
      { label: "Ultimul", value: tickets[0]?.created_at || "-" }
    ])}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Creează ticket</h2><span>Solicitările tale ajung în zona de suport</span></div></div>
      <form class="cp-form-grid" method="post" action="/client-portal/tickets">
        <label class="nx-field"><span>Subiect</span><input name="subject" required placeholder="Ex: Am nevoie de clarificări"></label>
        <label class="nx-field"><span>Categorie</span><select name="category"><option value="GENERAL">General</option><option value="PROIECT">Proiect</option><option value="DOCUMENTE">Documente</option><option value="FINANCIAR">Financiar</option><option value="BUG">Problemă tehnică</option></select></label>
        <label class="nx-field"><span>Prioritate</span><select name="priority"><option value="MEDIE">Medie</option><option value="SCAZUTA">Scăzută</option><option value="RIDICATA">Ridicată</option><option value="URGENTA">Urgentă</option></select></label>
        <label class="nx-field wide"><span>Mesaj</span><textarea name="body" rows="4" placeholder="Descrie solicitarea..."></textarea></label>
        <div class="wide"><button class="nx-btn primary" type="submit">Creează ticket</button></div>
      </form>
    </section>
    <section class="nx-content-card" style="margin-top:14px">
      <div class="nx-panel-head"><div><h2>Suport</h2><span>Tichetele tale</span></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Ticket</th><th>Categorie</th><th>Prioritate</th><th>Status</th><th>Creat</th><th></th></tr></thead><tbody>
        ${tableRows(tickets, "Nu există tichete.", (ticket) => `
          <tr>
            <td><a class="nx-table-main-link" href="/client-portal/tickets/${escapeHtml(ticket.id)}">${escapeHtml(ticket.ticket_number || "-")}</a><div class="nx-table-sub">${escapeHtml(ticket.subject || "-")}</div></td>
            <td>${escapeHtml(ticket.category || "-")}</td>
            <td>${escapeHtml(ticket.priority || "-")}</td>
            <td>${statusBadge(ticket.status)}</td>
            <td>${escapeHtml(ticket.created_at || "-")}</td>
            <td class="nx-table-actions"><a class="nx-btn primary" href="/client-portal/tickets/${escapeHtml(ticket.id)}">Deschide</a></td>
          </tr>
        `)}
      </tbody></table></div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Suport", currentPath: "/client-portal/tickets", body });
}

function renderTicketDetailPage(options = {}) {
  const ticket = options.ticket || {};
  const comments = options.comments || [];
  const uploads = options.uploads || [];
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(ticket.ticket_number || "Ticket")}</h1><p>${escapeHtml(ticket.subject || "-")} · ${statusBadge(ticket.status)}</p></div>
        <a class="nx-btn" href="/client-portal/tickets">Înapoi</a>
      </div>
      <div class="nx-client-info-grid">
        <div><span>Categorie</span><b>${escapeHtml(ticket.category || "-")}</b></div>
        <div><span>Prioritate</span><b>${escapeHtml(ticket.priority || "-")}</b></div>
        <div><span>Creat</span><b>${escapeHtml(ticket.created_at || "-")}</b></div>
        <div><span>Actualizat</span><b>${escapeHtml(ticket.updated_at || "-")}</b></div>
      </div>
    </section>
    <div class="cp-two" style="margin-top:14px">
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Comentarii</h2><span>${escapeHtml(comments.length)} mesaje</span></div></div>
        <div class="cp-list">
          ${comments.length ? comments.map((comment) => `
            <div class="cp-list-item">
              <div><b>${escapeHtml(comment.author_email || "Client")}</b><div class="cp-muted">${escapeHtml(comment.created_at || "-")}</div><p>${escapeHtml(comment.body || "")}</p></div>
            </div>
          `).join("") : `<div class="nx-empty-state">Nu există comentarii.</div>`}
        </div>
        <form class="cp-form-grid" method="post" action="/client-portal/tickets/${escapeHtml(ticket.id)}/comments" style="margin-top:14px">
          <label class="nx-field wide"><span>Comentariu nou</span><textarea name="body" rows="4" required></textarea></label>
          <div class="wide"><button class="nx-btn primary" type="submit">Trimite comentariu</button></div>
        </form>
      </section>
      <section class="nx-content-card">
        <div class="nx-panel-head"><div><h2>Uploaduri</h2><span>${escapeHtml(uploads.length)} fișiere</span></div></div>
        <div class="cp-list">
          ${uploads.length ? uploads.map((upload) => `
            <div class="cp-list-item">
              <div><b>${escapeHtml(upload.title || upload.original_file_name || "-")}</b><div class="cp-muted">${escapeHtml(upload.created_at || "-")}</div></div>
              <a class="nx-btn primary" href="/client-portal/documents/uploads/${escapeHtml(upload.id)}/download">Descarcă</a>
            </div>
          `).join("") : `<div class="nx-empty-state">Nu există fișiere încărcate pe ticket.</div>`}
        </div>
        <form class="cp-form-grid" method="post" action="/client-portal/tickets/${escapeHtml(ticket.id)}/uploads" enctype="multipart/form-data" style="margin-top:14px">
          <label class="nx-field"><span>Titlu</span><input name="title" required></label>
          <label class="nx-field"><span>Fișier</span><input name="file" type="file" required></label>
          <div class="wide"><button class="nx-btn primary" type="submit">Încarcă</button></div>
        </form>
      </section>
    </div>
  `;
  return renderClientPortalShell({ ...options, title: ticket.ticket_number || "Ticket", currentPath: "/client-portal/tickets", body });
}

function renderMessagesPage(options = {}) {
  const comments = options.comments || [];
  const ok = options.ok || "";
  const body = `
    ${ok === "sent" ? `<section class="nx-content-card" style="border-color:#bbf7d0;background:#ecfdf5;color:#166534">Mesajul a fost trimis și logat.</section>` : ""}
    <section class="nx-content-card">
      <div class="nx-panel-head"><div><h2>Mesaj nou</h2><span>Mesaj general către echipă</span></div></div>
      <form class="cp-form-grid" method="post" action="/client-portal/comments">
        <label class="nx-field wide"><span>Mesaj</span><textarea name="body" rows="4" required></textarea></label>
        <div class="wide"><button class="nx-btn primary" type="submit">Trimite mesaj</button></div>
      </form>
    </section>
    <section class="nx-content-card" style="margin-top:14px">
      <div class="nx-panel-head"><div><h2>Mesaje</h2><span>Comentarii și conversații</span></div></div>
      <div class="cp-list">
        ${comments.length ? comments.map((comment) => `
          <div class="cp-list-item">
            <div>
              <b>${escapeHtml(comment.author_email || "Client")}</b>
              <div class="cp-muted">${escapeHtml(comment.entity_type || "MESSAGE")} ${comment.ticket_number ? `· ${escapeHtml(comment.ticket_number)}` : ""} · ${escapeHtml(comment.created_at || "-")}</div>
              <p>${escapeHtml(comment.body || "")}</p>
            </div>
          </div>
        `).join("") : `<div class="nx-empty-state">Nu există mesaje.</div>`}
      </div>
    </section>
  `;
  return renderClientPortalShell({ ...options, title: "Mesaje", currentPath: "/client-portal/messages", body });
}

export {
  renderDashboardPage,
  renderProjectsPage,
  renderProjectDetailPage,
  renderTasksPage,
  renderOffersPage,
  renderContractsPage,
  renderInvoicesPage,
  renderDocumentsPage,
  renderTicketsPage,
  renderTicketDetailPage,
  renderMessagesPage
};
