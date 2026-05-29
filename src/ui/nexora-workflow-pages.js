import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selected(value, expected) {
  return String(value || "") === String(expected || "") ? "selected" : "";
}

function dateValue(value = "") {
  return String(value || "").slice(0, 10);
}

function money(value, currency = "RON") {
  return `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function statusTone(value = "") {
  const normalized = String(value || "").toUpperCase();
  if (["ACTIVE", "ACTIV", "COMPLETED", "DONE", "APPROVED", "SENT"].includes(normalized)) return "success";
  if (["FAILED", "ERROR", "REJECTED", "RESPINS", "PAUSED", "CANCELLED"].includes(normalized)) return "danger";
  if (["DRAFT", "QUEUED", "RUNNING", "PENDING", "SCHEDULED"].includes(normalized)) return "warn";
  return "neutral";
}

function statusBadge(value = "") {
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(value || "-")}</span>`;
}

const WORKFLOW_TABS = [
  ["RPA Dashboard", "/nexora/workflow"],
  ["RPA Studio", "/nexora/workflow/automations"],
  ["Automatizare facturi", "/nexora/workflow/invoice-automation"],
  ["Reguli business", "/nexora/workflow/rules"],
  ["Aprobări", "/nexora/workflow/approvals"],
  ["Notificări", "/nexora/workflow/notifications"],
  ["Istoric rulări", "/nexora/workflow/runs"]
];

function workflowTabs(activePath = "/nexora/workflow") {
  return `<nav class="nx-module-tabs">${WORKFLOW_TABS.map(([label, href]) => `
    <a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>
  `).join("")}</nav>`;
}

function renderPage({ title, activePath, user, companyName, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath: activePath,
    eyebrow: "Workflow & Automatizări",
    pageTitle: title,
    body: `${workflowTabs(activePath)}${body}`
  });
}

function renderAlert(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    run: "Automatizarea a fost rulată.",
    status: "Statusul a fost actualizat.",
    decided: "Decizia a fost salvată."
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

function rowsOrEmpty(rows = [], colspan = 8, mapper = () => "", empty = "Nu există înregistrări.") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="${escapeHtml(colspan)}"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

function runRows(rows = []) {
  return rowsOrEmpty(rows, 8, (run) => `
    <tr>
      <td><b>${escapeHtml(run.run_number || "-")}</b><div class="nx-table-sub">${escapeHtml(run.run_type || "")}</div></td>
      <td>${escapeHtml(run.automation_name || run.invoice_automation_name || run.rule_name || "-")}</td>
      <td>${statusBadge(run.status)}</td>
      <td class="nx-right">${escapeHtml(run.processed_count || 0)}</td>
      <td class="nx-right">${escapeHtml(run.success_count || 0)}</td>
      <td class="nx-right">${escapeHtml(run.failed_count || 0)}</td>
      <td>${escapeHtml(run.started_at || "-")}<div class="nx-table-sub">${escapeHtml(run.finished_at || "")}</div></td>
      <td>${escapeHtml(run.summary || "")}</td>
    </tr>
  `, "Nu există rulări RPA.");
}

function renderNexoraWorkflowHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const recentRuns = Array.isArray(options.recentRuns) ? options.recentRuns : [];
  const invoiceStats = options.invoiceStats || {};
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">RPA</div><div><div class="nx-kpi-label">Automatizări</div><div class="nx-kpi-value">${escapeHtml(stats.automations || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.activeAutomations || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">REG</div><div><div class="nx-kpi-label">Reguli</div><div class="nx-kpi-value">${escapeHtml(stats.rules || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RUN</div><div><div class="nx-kpi-label">Rulări azi</div><div class="nx-kpi-value">${escapeHtml(stats.runsToday || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>RPA Studio</h1><p>Construiește reguli simple: trigger, condiție, acțiune, rulare și jurnal.</p></div></div>
        <div class="nx-shortcuts nx-template-links">
          <a href="/nexora/workflow/automations"><b>Robot nou</b><small>Automatizare pe module, cu rulare manuală sau programată.</small></a>
          <a href="/nexora/workflow/invoice-automation"><b>Facturi</b><small>Reminder scadență, verificare, aprobare sau notificare internă.</small></a>
          <a href="/nexora/workflow/rules"><b>Reguli business</b><small>Condiții reutilizabile pentru vânzări, CRM, DMS și operațional.</small></a>
          <a href="/nexora/workflow/runs"><b>Istoric</b><small>Audit pentru fiecare rulare RPA și pașii executați.</small></a>
        </div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Facturi monitorizate</h1><p>Indicatori pentru automatizările de facturi.</p></div></div>
        <div class="nx-kpi-grid invoice-kpis">
          <div class="nx-kpi-card"><div class="nx-kpi-icon blue">INV</div><div><div class="nx-kpi-label">Total facturi</div><div class="nx-kpi-value">${escapeHtml(invoiceStats.total || 0)}</div></div></div>
          <div class="nx-kpi-card"><div class="nx-kpi-icon red">OD</div><div><div class="nx-kpi-label">Scadente depășite</div><div class="nx-kpi-value">${escapeHtml(invoiceStats.overdue || 0)}</div></div></div>
          <div class="nx-kpi-card"><div class="nx-kpi-icon orange">7Z</div><div><div class="nx-kpi-label">Scadente 7 zile</div><div class="nx-kpi-value">${escapeHtml(invoiceStats.dueSoon || 0)}</div></div></div>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Rulări recente</h1><p>Ultimele execuții RPA.</p></div><a class="nx-btn" href="/nexora/workflow/runs">Toate rulările</a></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Rulare</th><th>Automatizare</th><th>Status</th><th class="nx-right">Procesate</th><th class="nx-right">OK</th><th class="nx-right">Erori</th><th>Moment</th><th>Sumar</th></tr></thead><tbody>${runRows(recentRuns)}</tbody></table></div>
    </section>
  `;
  return renderPage({ title: "RPA Dashboard", activePath: "/nexora/workflow", companyName, user: options.user, body });
}

function renderNexoraWorkflowAutomationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.automation_number || "")}</div></td>
      <td>${escapeHtml(row.category || "-")}<div class="nx-table-sub">${escapeHtml(row.source_module || "")}</div></td>
      <td>${escapeHtml(row.trigger_event || "-")}</td>
      <td>${escapeHtml(row.action_type || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.owner_email || "-")}</td>
      <td>${escapeHtml(row.updated_at || row.created_at || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/workflow/automations/${escapeHtml(row.id)}/run"><button class="nx-btn primary" type="submit">Rulează</button></form>
        <form method="post" action="/nexora/workflow/automations/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="${String(row.status || "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE"}"><button class="nx-btn" type="submit">${String(row.status || "").toUpperCase() === "ACTIVE" ? "Pauză" : "Activează"}</button></form>
      </td>
    </tr>
  `, "Nu există automatizări RPA.");
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Robot RPA nou</h1><p>Definește un robot cu trigger, sursă și acțiune.</p></div></div>
      <form method="post" action="/nexora/workflow/automations/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume robot</span><input name="name" required placeholder="Ex: Notificare client la ofertă acceptată"></label>
        <label class="nx-field"><span>Categorie</span><select name="category"><option value="RPA">RPA</option><option value="WORKFLOW">Workflow</option><option value="ALERT">Alertă</option><option value="INTEGRARE">Integrare</option></select></label>
        <label class="nx-field"><span>Modul sursă</span><select name="source_module"><option value="GENERAL">General</option><option value="FACTURI">Facturi</option><option value="VANZARI">Vânzări</option><option value="CRM">CRM</option><option value="DMS">DMS</option><option value="ACHIZITII">Achiziții</option><option value="HR">HR</option></select></label>
        <label class="nx-field"><span>Trigger</span><select name="trigger_event"><option value="MANUAL">Manual</option><option value="ON_CREATE">La creare</option><option value="ON_STATUS_CHANGE">La schimbare status</option><option value="SCHEDULED">Programat</option><option value="DUE_DATE">La termen/scadență</option></select></label>
        <label class="nx-field"><span>Acțiune</span><select name="action_type"><option value="CREATE_NOTIFICATION">Creează notificare</option><option value="CREATE_APPROVAL">Cere aprobare</option><option value="UPDATE_STATUS">Actualizează status</option><option value="GENERATE_DOCUMENT">Generează document</option><option value="WEBHOOK">Webhook extern</option></select></label>
        <label class="nx-field"><span>Programare</span><input name="schedule_label" placeholder="Ex: zilnic la 09:00"></label>
        <label class="nx-field"><span>Responsabil</span><input name="owner_email" type="email" placeholder="email responsabil"></label>
        <label class="nx-field"><span>Prioritate</span><select name="priority"><option value="MEDIE">Medie</option><option value="RIDICATA">Ridicată</option><option value="URGENTA">Urgentă</option><option value="SCAZUTA">Scăzută</option></select></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIVE">Activ</option><option value="DRAFT">Draft</option><option value="PAUSED">Pauză</option></select></label>
        <label class="nx-field nx-field-wide"><span>Descriere</span><textarea name="description" rows="2"></textarea></label>
        <label class="nx-field nx-field-wide"><span>Config acțiune JSON</span><textarea name="action_config_json" rows="3" placeholder='{"template":"standard","notify":"owner"}'></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează robot</button></div>
      </form>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>RPA Studio</h1><p>Robots, status și rulare manuală.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Robot</th><th>Categorie</th><th>Trigger</th><th>Acțiune</th><th>Status</th><th>Owner</th><th>Actualizat</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return renderPage({ title: "RPA Studio", activePath: "/nexora/workflow/automations", companyName, user: options.user, body });
}

function renderNexoraWorkflowInvoiceAutomationPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const invoiceStats = options.invoiceStats || {};
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.automation_number || "")}</div></td>
      <td>${escapeHtml(row.trigger_event || "-")}<div class="nx-table-sub">${row.due_days ? `${escapeHtml(row.due_days)} zile` : ""}</div></td>
      <td>${escapeHtml(row.invoice_status_filter || "orice status")}</td>
      <td>${escapeHtml(row.client_filter || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.amount_min || 0))}</td>
      <td>${escapeHtml(row.action_type || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/workflow/invoice-automation/${escapeHtml(row.id)}/run"><button class="nx-btn primary" type="submit">Rulează</button></form>
        <form method="post" action="/nexora/workflow/invoice-automation/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="${String(row.status || "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE"}"><button class="nx-btn" type="submit">${String(row.status || "").toUpperCase() === "ACTIVE" ? "Pauză" : "Activează"}</button></form>
      </td>
    </tr>
  `, "Nu există automatizări pentru facturi.");
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">INV</div><div><div class="nx-kpi-label">Facturi</div><div class="nx-kpi-value">${escapeHtml(invoiceStats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">OD</div><div><div class="nx-kpi-label">Depășite</div><div class="nx-kpi-value">${escapeHtml(invoiceStats.overdue || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">7Z</div><div><div class="nx-kpi-label">Scadente curând</div><div class="nx-kpi-value">${escapeHtml(invoiceStats.dueSoon || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">RON</div><div><div class="nx-kpi-label">Valoare monitorizată</div><div class="nx-kpi-value">${escapeHtml(money(invoiceStats.amount || 0))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Regulă facturi nouă</h1><p>Automatizează notificări, aprobări și verificări pe facturi.</p></div></div>
        <form method="post" action="/nexora/workflow/invoice-automation/create" class="nx-form">
          <label class="nx-field"><span>Nume regulă</span><input name="name" required placeholder="Ex: Reminder scadență 7 zile"></label>
          <label class="nx-field"><span>Trigger factură</span><select name="trigger_event"><option value="DUE_SOON">Scadentă în curând</option><option value="OVERDUE">Scadență depășită</option><option value="INVOICE_CREATED">Factură creată</option><option value="STATUS_CHANGED">Status schimbat</option><option value="QUOTE_ACCEPTED">Ofertă acceptată</option></select></label>
          <label class="nx-field"><span>Status factură</span><select name="invoice_status_filter"><option value="">Orice status</option><option value="CIORNA">Ciornă</option><option value="EMISA">Emisă</option><option value="TRIMISA">Trimisă</option><option value="PLATITA">Plătită</option><option value="ANULATA">Anulată</option></select></label>
          <label class="nx-field"><span>Zile până/la scadență</span><input name="due_days" inputmode="numeric" value="7"></label>
          <label class="nx-field"><span>Filtru client</span><input name="client_filter" placeholder="nume sau CUI, opțional"></label>
          <label class="nx-field"><span>Total minim</span><input name="amount_min" inputmode="decimal" value="0"></label>
          <label class="nx-field"><span>Acțiune RPA</span><select name="action_type"><option value="CREATE_NOTIFICATION">Creează notificare internă</option><option value="SEND_REMINDER">Pregătește reminder client</option><option value="CREATE_APPROVAL">Cere aprobare</option><option value="MARK_FOR_REVIEW">Marchează pentru verificare</option><option value="SCHEDULE_EFACTURA">Pregătește e-Factura, fără trimitere automată</option></select></label>
          <label class="nx-field"><span>Notifică email</span><input name="notify_email" type="email" placeholder="contabil@firma.ro"></label>
          <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIVE">Activ</option><option value="DRAFT">Draft</option><option value="PAUSED">Pauză</option></select></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează regula</button></div>
        </form>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Rețete rapide</h1><p>Exemple de reguli utile pentru facturi.</p></div></div>
        <div class="nx-shortcuts nx-template-links">
          <span><b>Reminder scadență</b><small>Trigger DUE_SOON, acțiune SEND_REMINDER, 7 zile.</small></span>
          <span><b>Verificare sume mari</b><small>Total minim, acțiune CREATE_APPROVAL.</small></span>
          <span><b>Facturi depășite</b><small>Trigger OVERDUE, notificare internă către financiar.</small></span>
          <span><b>e-Factura ready</b><small>Pregătește verificarea internă, fără trimitere ANAF automată.</small></span>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Automatizări facturi</h1><p>Reguli active pentru facturi, scadențe și verificări.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Regulă</th><th>Trigger</th><th>Status factură</th><th>Client</th><th class="nx-right">Total minim</th><th>Acțiune</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;
  return renderPage({ title: "Automatizare facturi", activePath: "/nexora/workflow/invoice-automation", companyName, user: options.user, body });
}

function renderNexoraWorkflowRulesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.rule_number || "")}</div></td>
      <td>${escapeHtml(row.applies_to || "-")}<div class="nx-table-sub">${escapeHtml(row.trigger_event || "")}</div></td>
      <td>${escapeHtml([row.condition_field, row.condition_operator, row.condition_value].filter(Boolean).join(" ") || "ALWAYS")}</td>
      <td>${escapeHtml(row.action_type || "-")}<div class="nx-table-sub">${escapeHtml(row.action_target || "")}</div></td>
      <td>${escapeHtml(row.severity || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${Number(row.stop_on_match || 0) ? "Da" : "Nu"}</td>
      <td class="nx-table-actions"><form method="post" action="/nexora/workflow/rules/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="${String(row.status || "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE"}"><button class="nx-btn" type="submit">${String(row.status || "").toUpperCase() === "ACTIVE" ? "Pauză" : "Activează"}</button></form></td>
    </tr>
  `, "Nu există reguli business.");
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Regulă business nouă</h1><p>Definește condiția și acțiunea pe care o poate folosi RPA.</p></div></div>
      <form method="post" action="/nexora/workflow/rules/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume regulă</span><input name="name" required></label>
        <label class="nx-field"><span>Se aplică la</span><select name="applies_to"><option value="GENERAL">General</option><option value="FACTURI">Facturi</option><option value="CLIENTI">Clienți</option><option value="OFERTE">Oferte</option><option value="ACHIZITII">Achiziții</option><option value="DMS">DMS</option><option value="HR">HR</option></select></label>
        <label class="nx-field"><span>Trigger</span><select name="trigger_event"><option value="ON_CREATE">La creare</option><option value="ON_UPDATE">La actualizare</option><option value="ON_STATUS_CHANGE">Schimbare status</option><option value="SCHEDULED">Programat</option><option value="MANUAL">Manual</option></select></label>
        <label class="nx-field"><span>Câmp condiție</span><input name="condition_field" placeholder="ex: total, status, client"></label>
        <label class="nx-field"><span>Operator</span><select name="condition_operator"><option value="ALWAYS">Întotdeauna</option><option value="EQUALS">Egal cu</option><option value="CONTAINS">Conține</option><option value="GREATER_THAN">Mai mare decât</option><option value="LESS_THAN">Mai mic decât</option><option value="IS_EMPTY">Este gol</option></select></label>
        <label class="nx-field"><span>Valoare</span><input name="condition_value"></label>
        <label class="nx-field"><span>Acțiune</span><select name="action_type"><option value="CREATE_NOTIFICATION">Creează notificare</option><option value="CREATE_APPROVAL">Cere aprobare</option><option value="ASSIGN_OWNER">Atribuie responsabil</option><option value="GENERATE_DOCUMENT">Generează document</option><option value="WEBHOOK">Webhook</option></select></label>
        <label class="nx-field"><span>Țintă acțiune</span><input name="action_target" placeholder="email, rol sau endpoint"></label>
        <label class="nx-field"><span>Severitate</span><select name="severity"><option value="MEDIE">Medie</option><option value="RIDICATA">Ridicată</option><option value="URGENTA">Urgentă</option><option value="SCAZUTA">Scăzută</option></select></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIVE">Activ</option><option value="DRAFT">Draft</option><option value="PAUSED">Pauză</option></select></label>
        <label class="nx-check-field"><input type="checkbox" name="stop_on_match" value="1"><span>Oprește fluxul când regula se potrivește</span></label>
        <label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează regula</button></div>
      </form>
    </section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Reguli business</h1><p>Bibliotecă de reguli reutilizabile pentru RPA.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Regulă</th><th>Context</th><th>Condiție</th><th>Acțiune</th><th>Severitate</th><th>Status</th><th>Stop</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Reguli business", activePath: "/nexora/workflow/rules", companyName, user: options.user, body });
}

function renderNexoraWorkflowApprovalsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(row.approval_number || "")}</div></td>
      <td>${escapeHtml(row.module || "-")}<div class="nx-table-sub">${escapeHtml([row.entity_type, row.entity_id].filter(Boolean).join(" #"))}</div></td>
      <td class="nx-right">${escapeHtml(money(row.amount || 0))}</td>
      <td>${escapeHtml(row.requested_by_email || "-")}</td>
      <td>${escapeHtml(row.approver_email || "-")}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/workflow/approvals/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="APPROVED"><button class="nx-btn primary" type="submit">Aprobă</button></form>
        <form method="post" action="/nexora/workflow/approvals/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="REJECTED"><button class="nx-btn" type="submit">Respinge</button></form>
      </td>
    </tr>
  `, "Nu există aprobări.");
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Cerere aprobare nouă</h1><p>Poate fi creată manual sau de o automatizare RPA.</p></div></div>
      <form method="post" action="/nexora/workflow/approvals/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Subiect</span><input name="subject" required></label>
        <label class="nx-field"><span>Modul</span><select name="module"><option value="GENERAL">General</option><option value="FACTURI">Facturi</option><option value="ACHIZITII">Achiziții</option><option value="VANZARI">Vânzări</option><option value="HR">HR</option></select></label>
        <label class="nx-field"><span>Tip entitate</span><input name="entity_type" placeholder="factura, oferta, comanda"></label>
        <label class="nx-field"><span>ID entitate</span><input name="entity_id" inputmode="numeric"></label>
        <label class="nx-field"><span>Valoare</span><input name="amount" inputmode="decimal" value="0"></label>
        <label class="nx-field"><span>Aprobator</span><input name="approver_email" type="email"></label>
        <label class="nx-field"><span>Termen</span><input name="due_date" type="date"></label>
        <label class="nx-field nx-field-wide"><span>Note decizie</span><textarea name="decision_notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează aprobare</button></div>
      </form>
    </section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Aprobări</h1><p>Queue pentru decizii interne.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Subiect</th><th>Context</th><th class="nx-right">Valoare</th><th>Solicitat de</th><th>Aprobator</th><th>Termen</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Aprobări", activePath: "/nexora/workflow/approvals", companyName, user: options.user, body });
}

function renderNexoraWorkflowNotificationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(row.notification_number || "")}</div></td>
      <td>${escapeHtml(row.channel || "-")}</td>
      <td>${escapeHtml(row.recipient || "-")}</td>
      <td>${escapeHtml(row.related_module || "-")}<div class="nx-table-sub">${escapeHtml([row.entity_type, row.entity_id].filter(Boolean).join(" #"))}</div></td>
      <td>${escapeHtml(row.scheduled_at || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.created_at || "-")}</td>
      <td class="nx-table-actions"><form method="post" action="/nexora/workflow/notifications/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="SENT"><button class="nx-btn primary" type="submit">Marchează trimisă</button></form></td>
    </tr>
  `, "Nu există notificări.");
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Notificare nouă</h1><p>Mesaj intern sau pregătit pentru trimitere manuală.</p></div></div>
      <form method="post" action="/nexora/workflow/notifications/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Subiect</span><input name="subject" required></label>
        <label class="nx-field"><span>Canal</span><select name="channel"><option value="IN_APP">In-app</option><option value="EMAIL_DRAFT">Email draft</option><option value="SMS_DRAFT">SMS draft</option><option value="WEBHOOK">Webhook</option></select></label>
        <label class="nx-field"><span>Destinatar</span><input name="recipient" placeholder="email, rol sau utilizator"></label>
        <label class="nx-field"><span>Modul</span><select name="related_module"><option value="GENERAL">General</option><option value="FACTURI">Facturi</option><option value="CRM">CRM</option><option value="VANZARI">Vânzări</option><option value="DMS">DMS</option></select></label>
        <label class="nx-field"><span>Tip entitate</span><input name="entity_type"></label>
        <label class="nx-field"><span>ID entitate</span><input name="entity_id" inputmode="numeric"></label>
        <label class="nx-field"><span>Programată la</span><input name="scheduled_at" type="datetime-local"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="DRAFT">Draft</option><option value="SCHEDULED">Programată</option><option value="SENT">Trimisă</option></select></label>
        <label class="nx-field nx-field-wide"><span>Mesaj</span><textarea name="body" rows="3"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează notificare</button></div>
      </form>
    </section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Notificări</h1><p>Mesaje create manual sau de roboții RPA.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Subiect</th><th>Canal</th><th>Destinatar</th><th>Context</th><th>Programare</th><th>Status</th><th>Creat</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Notificări", activePath: "/nexora/workflow/notifications", companyName, user: options.user, body });
}

function renderNexoraWorkflowRunsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const steps = Array.isArray(options.steps) ? options.steps : [];
  const stepRows = rowsOrEmpty(steps, 5, (step) => `
    <tr>
      <td>${escapeHtml(step.run_number || "-")}</td>
      <td class="nx-right">${escapeHtml(step.step_order || 0)}</td>
      <td><b>${escapeHtml(step.step_name || "-")}</b></td>
      <td>${statusBadge(step.status)}</td>
      <td>${escapeHtml(step.details || "")}</td>
    </tr>
  `, "Nu există pași pentru rulările afișate.");
  const body = `
    ${renderAlert(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Istoric rulări RPA</h1><p>Audit pentru execuții, simulări și reguli de facturi.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Rulare</th><th>Automatizare</th><th>Status</th><th class="nx-right">Procesate</th><th class="nx-right">OK</th><th class="nx-right">Erori</th><th>Moment</th><th>Sumar</th></tr></thead><tbody>${runRows(rows)}</tbody></table></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Pași execuție</h1><p>Ultimii pași înregistrați de roboți.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Rulare</th><th class="nx-right">Pas</th><th>Denumire</th><th>Status</th><th>Detalii</th></tr></thead><tbody>${stepRows}</tbody></table></div>
    </section>
  `;
  return renderPage({ title: "Istoric rulări", activePath: "/nexora/workflow/runs", companyName, user: options.user, body });
}

export {
  renderNexoraWorkflowApprovalsPage,
  renderNexoraWorkflowAutomationsPage,
  renderNexoraWorkflowHubPage,
  renderNexoraWorkflowInvoiceAutomationPage,
  renderNexoraWorkflowNotificationsPage,
  renderNexoraWorkflowRulesPage,
  renderNexoraWorkflowRunsPage
};
