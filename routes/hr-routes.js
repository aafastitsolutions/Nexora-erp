import {
  renderNexoraEmployeesPage,
  renderNexoraHrContractsPage,
  renderNexoraHrLeavePage,
  renderNexoraHrPayrollPage,
  renderNexoraHrRecruitmentPage,
  renderNexoraHrReviewsPage,
  renderNexoraHrTimesheetsPage
} from "../src/ui/nexora-employees-page.js";

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function currentUserEmail(req) {
  return String(req.session.user.email || "").trim().toLowerCase();
}

function safeText(value) {
  return String(value || "").trim();
}

function parseNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function parseDate(value) {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function oneOf(value, allowed, fallback) {
  const normalized = safeText(value || fallback).toUpperCase().replace(/\s+/g, "_");
  return allowed.includes(normalized) ? normalized : fallback;
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    employees: "employee_code",
    hr_contracts: "contract_number",
    hr_payroll_runs: "run_number",
    hr_leave_requests: "leave_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported HR sequence");
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const latest = db.prepare(`
    SELECT ${columnName} AS number_value
    FROM ${tableName}
    WHERE company_id=? AND ${columnName} LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${stem}%`);
  const last = Number(String(latest?.number_value || "").split("-").pop() || 0);
  return `${stem}${String(last + 1).padStart(4, "0")}`;
}

function calculateDays(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return 1;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 1;
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

function loadEmployees(db, companyId, activeOnly = false) {
  const activeFilter = activeOnly ? "AND COALESCE(active,1)=1" : "";
  return db.prepare(`
    SELECT id, employee_code, name, email, phone, position, department, hire_date,
           salary, contract_type, manager, notes, active, created_at, updated_at
    FROM employees
    WHERE company_id=? ${activeFilter}
    ORDER BY COALESCE(active,1) DESC, name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function employeeExists(db, companyId, employeeId) {
  if (!Number(employeeId)) return false;
  return Boolean(db.prepare(`
    SELECT id
    FROM employees
    WHERE id=? AND company_id=?
  `).get(Number(employeeId), companyId));
}

function syncPayrollTotals(db, companyId, runId) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(gross_pay),0) AS total_gross,
      COALESCE(SUM(net_pay),0) AS total_net,
      COALESCE(SUM(deductions),0) AS total_taxes
    FROM hr_payroll_items
    WHERE company_id=? AND run_id=?
  `).get(companyId, runId) || {};
  db.prepare(`
    UPDATE hr_payroll_runs
    SET total_gross=?, total_net=?, total_taxes=?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    Number(totals.total_gross || 0),
    Number(totals.total_net || 0),
    Number(totals.total_taxes || 0),
    runId,
    companyId
  );
}

function generatePayrollItems(db, companyId, runId) {
  const run = db.prepare(`
    SELECT id
    FROM hr_payroll_runs
    WHERE id=? AND company_id=?
  `).get(runId, companyId);
  if (!run) return 0;

  const employees = db.prepare(`
    SELECT
      e.id,
      e.salary,
      (
        SELECT c.salary_base
        FROM hr_contracts c
        WHERE c.company_id=e.company_id
          AND c.employee_id=e.id
          AND UPPER(COALESCE(c.status,''))='ACTIV'
        ORDER BY c.start_date DESC, c.id DESC
        LIMIT 1
      ) AS contract_salary
    FROM employees e
    WHERE e.company_id=? AND COALESCE(e.active,1)=1
    ORDER BY e.name COLLATE NOCASE ASC
  `).all(companyId);

  const upsert = db.prepare(`
    INSERT INTO hr_payroll_items (
      company_id, run_id, employee_id, base_salary, gross_pay, deductions,
      net_pay, employer_cost, notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(company_id, run_id, employee_id) DO UPDATE SET
      base_salary=excluded.base_salary,
      gross_pay=excluded.gross_pay,
      deductions=excluded.deductions,
      net_pay=excluded.net_pay,
      employer_cost=excluded.employer_cost,
      notes=excluded.notes,
      updated_at=datetime('now')
  `);

  const tx = db.transaction((rows) => {
    for (const employee of rows) {
      const baseSalary = Number(employee.salary || employee.contract_salary || 0);
      const grossPay = Math.max(0, baseSalary);
      const deductions = Math.round(grossPay * 0.35 * 100) / 100;
      const netPay = Math.max(0, Math.round((grossPay - deductions) * 100) / 100);
      const employerCost = Math.round(grossPay * 1.0225 * 100) / 100;
      upsert.run(
        companyId,
        runId,
        employee.id,
        baseSalary,
        grossPay,
        deductions,
        netPay,
        employerCost,
        "Generat automat din salariul angajatului"
      );
    }
  });
  tx(employees);
  syncPayrollTotals(db, companyId, runId);
  return employees.length;
}

export function registerHrRoutes(app, { db, requireAuth }) {
  app.get("/nexora/hr", requireAuth, (req, res) => {
    res.redirect("/nexora/employees");
  });

  app.get("/nexora/employees", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadEmployees(db, companyId);
    return res.type("html").send(renderNexoraEmployeesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/employees/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.status(400).send("Nume obligatoriu");

    const employeeCode = safeText(req.body?.employee_code) || nextNumber(db, companyId, "employees", "employee_code", "EMP");
    db.prepare(`
      INSERT INTO employees (
        company_id, employee_code, name, email, phone, position, department,
        hire_date, salary, contract_type, manager, notes, active, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      employeeCode,
      name,
      safeText(req.body?.email),
      safeText(req.body?.phone),
      safeText(req.body?.position),
      safeText(req.body?.department),
      parseDate(req.body?.hire_date) || null,
      parseNumber(req.body?.salary, 0),
      oneOf(req.body?.contract_type, ["CIM", "PFA", "COLABORARE"], "CIM"),
      safeText(req.body?.manager),
      safeText(req.body?.notes),
      safeText(req.body?.active || "1") === "0" ? 0 : 1
    );

    res.redirect("/nexora/employees?ok=created");
  });

  app.get("/nexora/hr/contracts", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employees = loadEmployees(db, companyId, true);
    const contracts = db.prepare(`
      SELECT c.*, e.name AS employee_name, e.position
      FROM hr_contracts c
      JOIN employees e ON e.id=c.employee_id AND e.company_id=c.company_id
      WHERE c.company_id=?
      ORDER BY c.start_date DESC, c.id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraHrContractsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      employees,
      contracts
    }));
  });

  app.post("/nexora/hr/contracts/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employeeId = Number(req.body?.employee_id || 0);
    if (!employeeExists(db, companyId, employeeId)) return res.status(400).send("Angajat invalid");
    const startDate = parseDate(req.body?.start_date) || todayIso();
    const contractNumber = safeText(req.body?.contract_number) || nextNumber(db, companyId, "hr_contracts", "contract_number", "HRC");

    db.prepare(`
      INSERT INTO hr_contracts (
        company_id, employee_id, contract_number, contract_type, start_date,
        end_date, salary_base, work_norm, status, notes, created_by_email,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      employeeId,
      contractNumber,
      oneOf(req.body?.contract_type, ["CIM", "ACT_ADITIONAL", "COLABORARE"], "CIM"),
      startDate,
      parseDate(req.body?.end_date) || null,
      parseNumber(req.body?.salary_base, 0),
      safeText(req.body?.work_norm) || "8h/zi",
      oneOf(req.body?.status, ["ACTIV", "SUSPENDAT", "INCETAT"], "ACTIV"),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );

    res.redirect("/nexora/hr/contracts?ok=created");
  });

  app.get("/nexora/hr/payroll", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const runs = db.prepare(`
      SELECT *
      FROM hr_payroll_runs
      WHERE company_id=?
      ORDER BY COALESCE(period_end, created_at) DESC, id DESC
      LIMIT 300
    `).all(companyId);
    const requestedRunId = Number(req.query?.run_id || 0);
    const selectedRun = requestedRunId
      ? db.prepare("SELECT * FROM hr_payroll_runs WHERE id=? AND company_id=?").get(requestedRunId, companyId)
      : runs[0] || null;
    const items = selectedRun ? db.prepare(`
      SELECT i.*, e.name AS employee_name
      FROM hr_payroll_items i
      JOIN employees e ON e.id=i.employee_id AND e.company_id=i.company_id
      WHERE i.company_id=? AND i.run_id=?
      ORDER BY e.name COLLATE NOCASE ASC
    `).all(companyId, selectedRun.id) : [];

    res.type("html").send(renderNexoraHrPayrollPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      runs,
      selectedRun,
      items
    }));
  });

  app.post("/nexora/hr/payroll/runs/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const periodLabel = safeText(req.body?.period_label);
    if (!periodLabel) return res.status(400).send("Perioada este obligatorie");
    const runNumber = nextNumber(db, companyId, "hr_payroll_runs", "run_number", "PAY");
    const info = db.prepare(`
      INSERT INTO hr_payroll_runs (
        company_id, run_number, period_label, period_start, period_end,
        payment_date, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      runNumber,
      periodLabel,
      parseDate(req.body?.period_start) || null,
      parseDate(req.body?.period_end) || null,
      parseDate(req.body?.payment_date) || null,
      oneOf(req.body?.status, ["DRAFT", "IN_PROGRESS", "FINAL", "PAID"], "DRAFT"),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    if (safeText(req.body?.generate_items) === "1") {
      generatePayrollItems(db, companyId, info.lastInsertRowid);
    }
    res.redirect(`/nexora/hr/payroll?run_id=${info.lastInsertRowid}`);
  });

  app.post("/nexora/hr/payroll/runs/:id/generate", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const runId = Number(req.params.id || 0);
    generatePayrollItems(db, companyId, runId);
    res.redirect(`/nexora/hr/payroll?run_id=${runId}`);
  });

  app.post("/nexora/hr/payroll/runs/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const runId = Number(req.params.id || 0);
    const status = oneOf(req.body?.status, ["DRAFT", "IN_PROGRESS", "FINAL", "PAID"], "FINAL");
    db.prepare(`
      UPDATE hr_payroll_runs
      SET status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, runId, companyId);
    res.redirect(`/nexora/hr/payroll?run_id=${runId}`);
  });

  app.get("/nexora/hr/leave", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employees = loadEmployees(db, companyId, true);
    const requests = db.prepare(`
      SELECT r.*, e.name AS employee_name
      FROM hr_leave_requests r
      JOIN employees e ON e.id=r.employee_id AND e.company_id=r.company_id
      WHERE r.company_id=?
      ORDER BY r.start_date DESC, r.id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraHrLeavePage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      employees,
      requests
    }));
  });

  app.post("/nexora/hr/leave/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employeeId = Number(req.body?.employee_id || 0);
    if (!employeeExists(db, companyId, employeeId)) return res.status(400).send("Angajat invalid");
    const startDate = parseDate(req.body?.start_date);
    const endDate = parseDate(req.body?.end_date);
    if (!startDate || !endDate) return res.status(400).send("Perioada este obligatorie");
    const days = parseNumber(req.body?.days, calculateDays(startDate, endDate));
    const status = oneOf(req.body?.status, ["PENDING", "APROBAT", "RESPINS"], "PENDING");

    db.prepare(`
      INSERT INTO hr_leave_requests (
        company_id, employee_id, leave_number, leave_type, start_date,
        end_date, days, status, approved_at, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      employeeId,
      nextNumber(db, companyId, "hr_leave_requests", "leave_number", "LV"),
      oneOf(req.body?.leave_type, ["ODIHNA", "MEDICAL", "FARA_PLATA", "EVENIMENT"], "ODIHNA"),
      startDate,
      endDate,
      Math.max(days, 0.5),
      status,
      status === "APROBAT" ? new Date().toISOString() : null,
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/hr/leave?ok=created");
  });

  app.post("/nexora/hr/leave/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const requestId = Number(req.params.id || 0);
    const status = oneOf(req.body?.status, ["PENDING", "APROBAT", "RESPINS"], "PENDING");
    db.prepare(`
      UPDATE hr_leave_requests
      SET status=?,
          approved_at=CASE WHEN ?='APROBAT' THEN datetime('now') ELSE approved_at END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, status, requestId, companyId);
    res.redirect("/nexora/hr/leave");
  });

  app.get("/nexora/hr/timesheets", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employees = loadEmployees(db, companyId, true);
    const rows = db.prepare(`
      SELECT t.*, e.name AS employee_name
      FROM hr_timesheets t
      JOIN employees e ON e.id=t.employee_id AND e.company_id=t.company_id
      WHERE t.company_id=?
      ORDER BY t.work_date DESC, t.id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraHrTimesheetsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      employees,
      rows
    }));
  });

  app.post("/nexora/hr/timesheets/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employeeId = Number(req.body?.employee_id || 0);
    if (!employeeExists(db, companyId, employeeId)) return res.status(400).send("Angajat invalid");
    const workDate = parseDate(req.body?.work_date) || todayIso();
    db.prepare(`
      INSERT INTO hr_timesheets (
        company_id, employee_id, work_date, hours_worked, overtime_hours,
        leave_hours, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(company_id, employee_id, work_date) DO UPDATE SET
        hours_worked=excluded.hours_worked,
        overtime_hours=excluded.overtime_hours,
        leave_hours=excluded.leave_hours,
        status=excluded.status,
        notes=excluded.notes,
        created_by_email=excluded.created_by_email,
        updated_at=datetime('now')
    `).run(
      companyId,
      employeeId,
      workDate,
      parseNumber(req.body?.hours_worked, 8),
      parseNumber(req.body?.overtime_hours, 0),
      parseNumber(req.body?.leave_hours, 0),
      oneOf(req.body?.status, ["DRAFT", "APROBAT"], "DRAFT"),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/hr/timesheets?ok=created");
  });

  app.get("/nexora/hr/recruitment", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const candidates = db.prepare(`
      SELECT *
      FROM hr_recruitment_candidates
      WHERE company_id=?
      ORDER BY updated_at DESC, id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraHrRecruitmentPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      candidates
    }));
  });

  app.post("/nexora/hr/recruitment/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const candidateName = safeText(req.body?.candidate_name);
    const position = safeText(req.body?.position);
    if (!candidateName || !position) return res.status(400).send("Candidat si pozitie obligatorii");
    db.prepare(`
      INSERT INTO hr_recruitment_candidates (
        company_id, candidate_name, email, phone, position, stage, source,
        expected_salary, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      candidateName,
      safeText(req.body?.email),
      safeText(req.body?.phone),
      position,
      oneOf(req.body?.stage, ["APLICAT", "SCREENING", "INTERVIU", "OFERTA", "ANGAJAT", "RESPINS"], "APLICAT"),
      safeText(req.body?.source),
      parseNumber(req.body?.expected_salary, 0),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/hr/recruitment?ok=created");
  });

  app.post("/nexora/hr/recruitment/:id/stage", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const candidateId = Number(req.params.id || 0);
    const stage = oneOf(req.body?.stage, ["APLICAT", "SCREENING", "INTERVIU", "OFERTA", "ANGAJAT", "RESPINS"], "SCREENING");
    db.prepare(`
      UPDATE hr_recruitment_candidates
      SET stage=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(stage, candidateId, companyId);
    res.redirect("/nexora/hr/recruitment");
  });

  app.get("/nexora/hr/reviews", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employees = loadEmployees(db, companyId, true);
    const reviews = db.prepare(`
      SELECT r.*, e.name AS employee_name, e.position
      FROM hr_performance_reviews r
      JOIN employees e ON e.id=r.employee_id AND e.company_id=r.company_id
      WHERE r.company_id=?
      ORDER BY r.review_date DESC, r.id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraHrReviewsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      employees,
      reviews
    }));
  });

  app.post("/nexora/hr/reviews/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const employeeId = Number(req.body?.employee_id || 0);
    if (!employeeExists(db, companyId, employeeId)) return res.status(400).send("Angajat invalid");
    const reviewPeriod = safeText(req.body?.review_period);
    if (!reviewPeriod) return res.status(400).send("Perioada este obligatorie");
    db.prepare(`
      INSERT INTO hr_performance_reviews (
        company_id, employee_id, review_period, review_date, reviewer,
        score, status, strengths, goals, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      employeeId,
      reviewPeriod,
      parseDate(req.body?.review_date) || todayIso(),
      safeText(req.body?.reviewer),
      Math.max(0, Math.min(5, parseNumber(req.body?.score, 0))),
      oneOf(req.body?.status, ["DRAFT", "FINAL"], "DRAFT"),
      safeText(req.body?.strengths),
      safeText(req.body?.goals),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/hr/reviews?ok=created");
  });
}
