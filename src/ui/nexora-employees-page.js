import { renderNexoraShell } from "./nexora-shell.js";

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
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} ${currency}`;
}

function dateValue(value = "") {
  return String(value || "").slice(0, 10);
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "ACTIVE", "APROBAT", "APPROVED", "PLATIT", "PAID", "FINAL", "ANGAJAT", "COMPLETED"].includes(normalized)) return "success";
  if (["RESPINS", "REJECTED", "ANULAT", "CANCELLED", "INACTIV"].includes(normalized)) return "danger";
  if (["PENDING", "DRAFT", "PLANIFICAT", "INTERVIU", "OFERTA", "IN_PROGRESS"].includes(normalized)) return "warn";
  return "neutral";
}

function statusBadge(value = "") {
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(value || "-")}</span>`;
}

const HR_TABS = [
  ["Angajați", "/nexora/employees"],
  ["Contracte", "/nexora/hr/contracts"],
  ["Payroll", "/nexora/hr/payroll"],
  ["Concedii", "/nexora/hr/leave"],
  ["Pontaj", "/nexora/hr/timesheets"],
  ["Recrutare", "/nexora/hr/recruitment"],
  ["Evaluări", "/nexora/hr/reviews"]
];

function hrTabs(activePath = "/nexora/employees") {
  return `<nav class="nx-module-tabs">${HR_TABS.map(([label, href]) => `
    <a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>
  `).join("")}</nav>`;
}

function employeeOptions(employees = [], selected = "") {
  return employees.map((employee) => `
    <option value="${escapeHtml(employee.id)}" ${String(selected || "") === String(employee.id || "") ? "selected" : ""}>
      ${escapeHtml(employee.name || "-")}${employee.position ? ` - ${escapeHtml(employee.position)}` : ""}
    </option>
  `).join("");
}

function renderPage({ title, activePath, user, companyName, body, actionsHtml = "" }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath: activePath,
    eyebrow: "Resurse Umane",
    pageTitle: title,
    actionsHtml,
    body: `${hrTabs(activePath)}${body}`
  });
}

function renderRows(rows = [], empty = "Nu există înregistrări.", mapper = () => "") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="12"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

function renderNexoraEmployeesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const ok = options.ok || "";
  const activeCount = rows.filter((row) => Number(row.active)).length;
  const departmentCount = new Set(rows.map((row) => String(row.department || "").trim()).filter(Boolean)).size;

  const rowsHtml = renderRows(rows, "Nu există angajați.", (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.employee_code || "")}</div></td>
      <td>${escapeHtml(row.department || "-")}</td>
      <td>${escapeHtml(row.position || "-")}</td>
      <td>${escapeHtml(row.email || "-")}<div class="nx-table-sub">${escapeHtml(row.phone || "")}</div></td>
      <td>${escapeHtml(dateValue(row.hire_date) || "-")}</td>
      <td class="nx-right">${escapeHtml(money(row.salary))}</td>
      <td>${Number(row.active) ? statusBadge("ACTIV") : statusBadge("INACTIV")}</td>
    </tr>
  `);

  const body = `
    ${ok ? `<div class="nx-alert success">Operațiunea HR a fost salvată.</div>` : ""}
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">HR</div><div><div class="nx-kpi-label">Angajați</div><div class="nx-kpi-value">${escapeHtml(rows.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">✓</div><div><div class="nx-kpi-label">Activi</div><div class="nx-kpi-value">${escapeHtml(activeCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">DEP</div><div><div class="nx-kpi-label">Departamente</div><div class="nx-kpi-value">${escapeHtml(departmentCount)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">SAL</div><div><div class="nx-kpi-label">Fond salarial</div><div class="nx-kpi-value">${escapeHtml(money(rows.reduce((sum, row) => sum + Number(row.salary || 0), 0)))}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Adaugă angajat</h2><span>Fișă personal</span></div></div>
        <form method="post" action="/nexora/employees/create" class="nx-form">
          <label class="nx-field"><span>Cod angajat</span><input name="employee_code" placeholder="ex: EMP-001"></label>
          <label class="nx-field"><span>Nume</span><input name="name" required></label>
          <label class="nx-field"><span>Email</span><input name="email" type="email"></label>
          <label class="nx-field"><span>Telefon</span><input name="phone"></label>
          <label class="nx-field"><span>Funcție</span><input name="position"></label>
          <label class="nx-field"><span>Departament</span><input name="department" placeholder="ex: Vânzări"></label>
          <label class="nx-field"><span>Data angajării</span><input name="hire_date" type="date"></label>
          <label class="nx-field"><span>Salariu brut</span><input name="salary" inputmode="decimal" placeholder="0.00"></label>
          <label class="nx-field"><span>Tip contract</span><select name="contract_type"><option value="CIM">CIM</option><option value="PFA">PFA</option><option value="COLABORARE">Colaborare</option></select></label>
          <label class="nx-field"><span>Manager</span><input name="manager"></label>
          <label class="nx-field"><span>Activ</span><select name="active"><option value="1">DA</option><option value="0">NU</option></select></label>
          <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă angajat</button></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Fluxuri rapide HR</h2><span>Acțiuni frecvente</span></div></div>
        <div class="nx-shortcuts">
          <a href="/nexora/hr/contracts">Contract nou</a>
          <a href="/nexora/hr/leave">Cerere concediu</a>
          <a href="/nexora/hr/timesheets">Pontaj zi</a>
          <a href="/nexora/hr/payroll">Stat payroll</a>
          <a href="/tipizate/cerere-concediu">Tipizat concediu</a>
          <a href="/tipizate/fisa-hr">Fișă HR</a>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Angajați</h1><p>Registru de personal pentru compania curentă.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Nume</th><th>Departament</th><th>Funcție</th><th>Contact</th><th>Angajare</th><th class="nx-right">Salariu</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    </section>
  `;

  return renderPage({ title: "Angajați", activePath: "/nexora/employees", companyName, user: options.user, body });
}

function renderNexoraHrContractsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const contracts = Array.isArray(options.contracts) ? options.contracts : [];
  const employees = Array.isArray(options.employees) ? options.employees : [];
  const rowsHtml = renderRows(contracts, "Nu există contracte HR.", (row) => `
    <tr>
      <td><b>${escapeHtml(row.contract_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.contract_type || "")}</div></td>
      <td>${escapeHtml(row.employee_name || "-")}<div class="nx-table-sub">${escapeHtml(row.position || "")}</div></td>
      <td>${escapeHtml(dateValue(row.start_date) || "-")} - ${escapeHtml(dateValue(row.end_date) || "nedeterminat")}</td>
      <td class="nx-right">${escapeHtml(money(row.salary_base))}</td>
      <td>${escapeHtml(row.work_norm || "-")}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `);
  const body = `
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">CIM</div><div><div class="nx-kpi-label">Contracte</div><div class="nx-kpi-value">${escapeHtml(contracts.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(contracts.filter((c) => String(c.status).toUpperCase() === "ACTIV").length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">EXP</div><div><div class="nx-kpi-label">Cu termen</div><div class="nx-kpi-value">${escapeHtml(contracts.filter((c) => c.end_date).length)}</div></div></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Contract nou</h1><p>Înregistrează contracte de muncă, colaborare sau acte adiționale.</p></div></div>
      <form method="post" action="/nexora/hr/contracts/create" class="nx-inline-form">
        <label class="nx-field"><span>Angajat</span><select name="employee_id" required>${employeeOptions(employees)}</select></label>
        <label class="nx-field"><span>Număr contract</span><input name="contract_number" placeholder="auto"></label>
        <label class="nx-field"><span>Tip</span><select name="contract_type"><option value="CIM">CIM</option><option value="ACT_ADITIONAL">Act adițional</option><option value="COLABORARE">Colaborare</option></select></label>
        <label class="nx-field"><span>Start</span><input name="start_date" type="date" required></label>
        <label class="nx-field"><span>Final</span><input name="end_date" type="date"></label>
        <label class="nx-field"><span>Salariu brut</span><input name="salary_base" inputmode="decimal"></label>
        <label class="nx-field"><span>Normă</span><input name="work_norm" value="8h/zi"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="ACTIV">Activ</option><option value="SUSPENDAT">Suspendat</option><option value="INCETAT">Încetat</option></select></label>
        <label class="nx-field nx-field-wide"><span>Observații</span><textarea name="notes" rows="2"></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează contract</button></div>
      </form>
    </section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Contracte</h1><p>Istoric contractual pe angajat.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Contract</th><th>Angajat</th><th>Perioadă</th><th class="nx-right">Salariu</th><th>Normă</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Contracte HR", activePath: "/nexora/hr/contracts", companyName, user: options.user, body });
}

function renderNexoraHrPayrollPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const runs = Array.isArray(options.runs) ? options.runs : [];
  const selectedRun = options.selectedRun || runs[0] || null;
  const items = Array.isArray(options.items) ? options.items : [];
  const runRows = renderRows(runs, "Nu există state payroll.", (run) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/hr/payroll?run_id=${escapeHtml(run.id)}">${escapeHtml(run.run_number || "-")}</a><div class="nx-table-sub">${escapeHtml(run.period_label || "")}</div></td>
      <td>${escapeHtml(dateValue(run.period_start) || "-")} - ${escapeHtml(dateValue(run.period_end) || "-")}</td>
      <td>${statusBadge(run.status)}</td>
      <td class="nx-right">${escapeHtml(money(run.total_gross))}</td>
      <td class="nx-right">${escapeHtml(money(run.total_net))}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/hr/payroll/runs/${escapeHtml(run.id)}/generate"><button class="nx-btn" type="submit">Generează</button></form>
        <form method="post" action="/nexora/hr/payroll/runs/${escapeHtml(run.id)}/status"><input type="hidden" name="status" value="FINAL"><button class="nx-btn primary" type="submit">Finalizează</button></form>
      </td>
    </tr>
  `);
  const itemRows = renderRows(items, "Nu există linii generate pentru statul selectat.", (item) => `
    <tr><td>${escapeHtml(item.employee_name || "-")}</td><td class="nx-right">${escapeHtml(money(item.base_salary))}</td><td class="nx-right">${escapeHtml(money(item.gross_pay))}</td><td class="nx-right">${escapeHtml(money(item.deductions))}</td><td class="nx-right">${escapeHtml(money(item.net_pay))}</td><td class="nx-right">${escapeHtml(money(item.employer_cost))}</td></tr>
  `);
  const body = `
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">RUN</div><div><div class="nx-kpi-label">State</div><div class="nx-kpi-value">${escapeHtml(runs.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">BRUT</div><div><div class="nx-kpi-label">Brut selectat</div><div class="nx-kpi-value">${escapeHtml(money(selectedRun?.total_gross || 0))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">NET</div><div><div class="nx-kpi-label">Net selectat</div><div class="nx-kpi-value">${escapeHtml(money(selectedRun?.total_net || 0))}</div></div></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Stat payroll nou</h1><p>Generează rapid linii salariale pe baza angajaților activi.</p></div></div>
      <form method="post" action="/nexora/hr/payroll/runs/create" class="nx-inline-form">
        <label class="nx-field"><span>Perioadă</span><input name="period_label" required placeholder="Mai 2026"></label>
        <label class="nx-field"><span>Start</span><input name="period_start" type="date"></label>
        <label class="nx-field"><span>Final</span><input name="period_end" type="date"></label>
        <label class="nx-field"><span>Data plății</span><input name="payment_date" type="date"></label>
        <label class="nx-field"><span>Status</span><select name="status"><option value="DRAFT">Draft</option><option value="IN_PROGRESS">În lucru</option><option value="FINAL">Final</option></select></label>
        <label class="nx-check-field"><input type="checkbox" name="generate_items" value="1" checked><span>Generează linii pentru angajații activi</span></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează stat</button></div>
      </form>
    </section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>State payroll</h1><p>Lunar, draft sau finalizat.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Stat</th><th>Perioadă</th><th>Status</th><th class="nx-right">Brut</th><th class="nx-right">Net</th><th></th></tr></thead><tbody>${runRows}</tbody></table></div></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Linii payroll ${selectedRun ? escapeHtml(selectedRun.run_number || "") : ""}</h1><p>Calcul brut, taxe estimate și net.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Angajat</th><th class="nx-right">Bază</th><th class="nx-right">Brut</th><th class="nx-right">Rețineri</th><th class="nx-right">Net</th><th class="nx-right">Cost angajator</th></tr></thead><tbody>${itemRows}</tbody></table></div></section>
  `;
  return renderPage({ title: "Payroll", activePath: "/nexora/hr/payroll", companyName, user: options.user, body });
}

function renderNexoraHrLeavePage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const employees = Array.isArray(options.employees) ? options.employees : [];
  const requests = Array.isArray(options.requests) ? options.requests : [];
  const rowsHtml = renderRows(requests, "Nu există cereri de concediu.", (row) => `
    <tr><td><b>${escapeHtml(row.leave_number || "-")}</b><div class="nx-table-sub">${escapeHtml(row.leave_type || "")}</div></td><td>${escapeHtml(row.employee_name || "-")}</td><td>${escapeHtml(dateValue(row.start_date))} - ${escapeHtml(dateValue(row.end_date))}</td><td class="nx-right">${escapeHtml(row.days || 0)}</td><td>${statusBadge(row.status)}</td><td class="nx-table-actions"><form method="post" action="/nexora/hr/leave/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="APROBAT"><button class="nx-btn primary" type="submit">Aprobă</button></form><form method="post" action="/nexora/hr/leave/${escapeHtml(row.id)}/status"><input type="hidden" name="status" value="RESPINS"><button class="nx-btn" type="submit">Respinge</button></form></td></tr>
  `);
  const body = `
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">REQ</div><div><div class="nx-kpi-label">Cereri</div><div class="nx-kpi-value">${escapeHtml(requests.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">PEN</div><div><div class="nx-kpi-label">În așteptare</div><div class="nx-kpi-value">${escapeHtml(requests.filter((r) => String(r.status).toUpperCase() === "PENDING").length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ZILE</div><div><div class="nx-kpi-label">Zile aprobate</div><div class="nx-kpi-value">${escapeHtml(requests.filter((r) => String(r.status).toUpperCase() === "APROBAT").reduce((s, r) => s + Number(r.days || 0), 0))}</div></div></div>
    </section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Cerere concediu</h1><p>Planifică și aprobă absențe.</p></div></div><form method="post" action="/nexora/hr/leave/create" class="nx-inline-form"><label class="nx-field"><span>Angajat</span><select name="employee_id" required>${employeeOptions(employees)}</select></label><label class="nx-field"><span>Tip</span><select name="leave_type"><option value="ODIHNA">Odihnă</option><option value="MEDICAL">Medical</option><option value="FARA_PLATA">Fără plată</option><option value="EVENIMENT">Eveniment</option></select></label><label class="nx-field"><span>Start</span><input name="start_date" type="date" required></label><label class="nx-field"><span>Final</span><input name="end_date" type="date" required></label><label class="nx-field"><span>Zile</span><input name="days" inputmode="decimal" placeholder="auto"></label><label class="nx-field"><span>Status</span><select name="status"><option value="PENDING">Pending</option><option value="APROBAT">Aprobat</option></select></label><label class="nx-field nx-field-wide"><span>Observații</span><textarea name="notes" rows="2"></textarea></label><div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează cerere</button></div></form></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Concedii</h1><p>Cereri, status și zile aprobate.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cerere</th><th>Angajat</th><th>Perioadă</th><th class="nx-right">Zile</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Concedii", activePath: "/nexora/hr/leave", companyName, user: options.user, body });
}

function renderNexoraHrTimesheetsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const employees = Array.isArray(options.employees) ? options.employees : [];
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const rowsHtml = renderRows(rows, "Nu există pontaje.", (row) => `
    <tr><td>${escapeHtml(dateValue(row.work_date))}</td><td>${escapeHtml(row.employee_name || "-")}</td><td class="nx-right">${escapeHtml(row.hours_worked || 0)}</td><td class="nx-right">${escapeHtml(row.overtime_hours || 0)}</td><td class="nx-right">${escapeHtml(row.leave_hours || 0)}</td><td>${statusBadge(row.status)}</td><td>${escapeHtml(row.notes || "")}</td></tr>
  `);
  const totalHours = rows.reduce((sum, row) => sum + Number(row.hours_worked || 0) + Number(row.overtime_hours || 0), 0);
  const body = `
    <section class="nx-kpi-grid"><div class="nx-kpi-card"><div class="nx-kpi-icon blue">PON</div><div><div class="nx-kpi-label">Pontaje</div><div class="nx-kpi-value">${escapeHtml(rows.length)}</div></div></div><div class="nx-kpi-card"><div class="nx-kpi-icon green">ORE</div><div><div class="nx-kpi-label">Ore lucrate</div><div class="nx-kpi-value">${escapeHtml(totalHours)}</div></div></div><div class="nx-kpi-card"><div class="nx-kpi-icon orange">OT</div><div><div class="nx-kpi-label">Ore supl.</div><div class="nx-kpi-value">${escapeHtml(rows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0))}</div></div></div></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Pontaj zi</h1><p>Înregistrează ore lucrate, suplimentare sau concediu.</p></div></div><form method="post" action="/nexora/hr/timesheets/create" class="nx-inline-form"><label class="nx-field"><span>Angajat</span><select name="employee_id" required>${employeeOptions(employees)}</select></label><label class="nx-field"><span>Data</span><input name="work_date" type="date" required></label><label class="nx-field"><span>Ore lucrate</span><input name="hours_worked" value="8" inputmode="decimal"></label><label class="nx-field"><span>Ore suplimentare</span><input name="overtime_hours" value="0" inputmode="decimal"></label><label class="nx-field"><span>Ore concediu</span><input name="leave_hours" value="0" inputmode="decimal"></label><label class="nx-field"><span>Status</span><select name="status"><option value="DRAFT">Draft</option><option value="APROBAT">Aprobat</option></select></label><label class="nx-field nx-field-wide"><span>Observații</span><textarea name="notes" rows="2"></textarea></label><div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează pontaj</button></div></form></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Pontaj</h1><p>Registru ore lucrate.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Angajat</th><th class="nx-right">Ore</th><th class="nx-right">Supl.</th><th class="nx-right">Concediu</th><th>Status</th><th>Note</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Pontaj", activePath: "/nexora/hr/timesheets", companyName, user: options.user, body });
}

function renderNexoraHrRecruitmentPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const rowsHtml = renderRows(candidates, "Nu există candidați.", (row) => `
    <tr><td><b>${escapeHtml(row.candidate_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.email || "")} ${row.phone ? `· ${escapeHtml(row.phone)}` : ""}</div></td><td>${escapeHtml(row.position || "-")}</td><td>${statusBadge(row.stage)}</td><td>${escapeHtml(row.source || "-")}</td><td class="nx-right">${escapeHtml(row.expected_salary ? money(row.expected_salary) : "-")}</td><td class="nx-table-actions"><form method="post" action="/nexora/hr/recruitment/${escapeHtml(row.id)}/stage"><select name="stage"><option value="SCREENING">Screening</option><option value="INTERVIU">Interviu</option><option value="OFERTA">Ofertă</option><option value="ANGAJAT">Angajat</option><option value="RESPINS">Respins</option></select><button class="nx-btn" type="submit">Mută</button></form></td></tr>
  `);
  const body = `
    <section class="nx-kpi-grid"><div class="nx-kpi-card"><div class="nx-kpi-icon blue">CV</div><div><div class="nx-kpi-label">Candidați</div><div class="nx-kpi-value">${escapeHtml(candidates.length)}</div></div></div><div class="nx-kpi-card"><div class="nx-kpi-icon orange">INT</div><div><div class="nx-kpi-label">Interviuri</div><div class="nx-kpi-value">${escapeHtml(candidates.filter((c) => String(c.stage).toUpperCase() === "INTERVIU").length)}</div></div></div><div class="nx-kpi-card"><div class="nx-kpi-icon green">ANG</div><div><div class="nx-kpi-label">Angajați</div><div class="nx-kpi-value">${escapeHtml(candidates.filter((c) => String(c.stage).toUpperCase() === "ANGAJAT").length)}</div></div></div></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Candidat nou</h1><p>Pipeline recrutare pe poziții.</p></div></div><form method="post" action="/nexora/hr/recruitment/create" class="nx-inline-form"><label class="nx-field"><span>Nume candidat</span><input name="candidate_name" required></label><label class="nx-field"><span>Email</span><input name="email" type="email"></label><label class="nx-field"><span>Telefon</span><input name="phone"></label><label class="nx-field"><span>Poziție</span><input name="position" required></label><label class="nx-field"><span>Etapă</span><select name="stage"><option value="APLICAT">Aplicat</option><option value="SCREENING">Screening</option><option value="INTERVIU">Interviu</option><option value="OFERTA">Ofertă</option></select></label><label class="nx-field"><span>Sursă</span><input name="source" placeholder="LinkedIn, recomandare..."></label><label class="nx-field"><span>Salariu așteptat</span><input name="expected_salary" inputmode="decimal"></label><label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label><div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă candidat</button></div></form></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Recrutare</h1><p>Candidați și etape.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Candidat</th><th>Poziție</th><th>Etapă</th><th>Sursă</th><th class="nx-right">Așteptări</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Recrutare", activePath: "/nexora/hr/recruitment", companyName, user: options.user, body });
}

function renderNexoraHrReviewsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const employees = Array.isArray(options.employees) ? options.employees : [];
  const reviews = Array.isArray(options.reviews) ? options.reviews : [];
  const avgScore = reviews.length ? (reviews.reduce((sum, row) => sum + Number(row.score || 0), 0) / reviews.length).toFixed(1) : "0.0";
  const rowsHtml = renderRows(reviews, "Nu există evaluări.", (row) => `
    <tr><td><b>${escapeHtml(row.employee_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.position || "")}</div></td><td>${escapeHtml(row.review_period || "-")}</td><td>${escapeHtml(dateValue(row.review_date) || "-")}</td><td class="nx-right">${escapeHtml(row.score || 0)}</td><td>${statusBadge(row.status)}</td><td>${escapeHtml(row.reviewer || "-")}</td></tr>
  `);
  const body = `
    <section class="nx-kpi-grid"><div class="nx-kpi-card"><div class="nx-kpi-icon blue">REV</div><div><div class="nx-kpi-label">Evaluări</div><div class="nx-kpi-value">${escapeHtml(reviews.length)}</div></div></div><div class="nx-kpi-card"><div class="nx-kpi-icon green">AVG</div><div><div class="nx-kpi-label">Scor mediu</div><div class="nx-kpi-value">${escapeHtml(avgScore)}</div></div></div><div class="nx-kpi-card"><div class="nx-kpi-icon orange">DRF</div><div><div class="nx-kpi-label">Draft</div><div class="nx-kpi-value">${escapeHtml(reviews.filter((r) => String(r.status).toUpperCase() === "DRAFT").length)}</div></div></div></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Evaluare nouă</h1><p>Scor, obiective și feedback pentru angajați.</p></div></div><form method="post" action="/nexora/hr/reviews/create" class="nx-inline-form"><label class="nx-field"><span>Angajat</span><select name="employee_id" required>${employeeOptions(employees)}</select></label><label class="nx-field"><span>Perioadă</span><input name="review_period" required placeholder="Q2 2026"></label><label class="nx-field"><span>Data</span><input name="review_date" type="date"></label><label class="nx-field"><span>Evaluator</span><input name="reviewer"></label><label class="nx-field"><span>Scor</span><input name="score" inputmode="decimal" placeholder="1-5"></label><label class="nx-field"><span>Status</span><select name="status"><option value="DRAFT">Draft</option><option value="FINAL">Final</option></select></label><label class="nx-field nx-field-wide"><span>Puncte tari</span><textarea name="strengths" rows="2"></textarea></label><label class="nx-field nx-field-wide"><span>Obiective</span><textarea name="goals" rows="2"></textarea></label><label class="nx-field nx-field-wide"><span>Note</span><textarea name="notes" rows="2"></textarea></label><div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează evaluare</button></div></form></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h1>Evaluări</h1><p>Istoric performanță.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Angajat</th><th>Perioadă</th><th>Data</th><th class="nx-right">Scor</th><th>Status</th><th>Evaluator</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section>
  `;
  return renderPage({ title: "Evaluări", activePath: "/nexora/hr/reviews", companyName, user: options.user, body });
}

export {
  renderNexoraEmployeesPage,
  renderNexoraHrContractsPage,
  renderNexoraHrPayrollPage,
  renderNexoraHrLeavePage,
  renderNexoraHrTimesheetsPage,
  renderNexoraHrRecruitmentPage,
  renderNexoraHrReviewsPage
};
