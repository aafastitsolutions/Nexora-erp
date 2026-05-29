import {
  renderNexoraWorkflowApprovalsPage,
  renderNexoraWorkflowAutomationsPage,
  renderNexoraWorkflowHubPage,
  renderNexoraWorkflowInvoiceAutomationPage,
  renderNexoraWorkflowNotificationsPage,
  renderNexoraWorkflowRulesPage,
  renderNexoraWorkflowRunsPage
} from "../src/ui/nexora-workflow-pages.js";

function safeText(value = "") {
  return String(value || "").trim();
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value = "") {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function actorEmail(req) {
  return safeText(req.session.user.email).toLowerCase();
}

function oneOf(value, allowed, fallback) {
  const normalized = safeText(value || fallback).toUpperCase().replace(/\s+/g, "_");
  return allowed.includes(normalized) ? normalized : fallback;
}

function jsonText(value) {
  const raw = safeText(value);
  if (!raw) return "{}";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed);
  } catch {
    return JSON.stringify({ raw });
  }
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    workflow_automations: "automation_number",
    workflow_rules: "rule_number",
    workflow_invoice_automations: "automation_number",
    workflow_runs: "run_number",
    workflow_approvals: "approval_number",
    workflow_notifications: "notification_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported workflow sequence");
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

function stats(db, companyId) {
  const automations = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM workflow_automations WHERE company_id=?) +
      (SELECT COUNT(*) FROM workflow_invoice_automations WHERE company_id=?) AS total,
      (SELECT COUNT(*) FROM workflow_automations WHERE company_id=? AND status='ACTIVE') +
      (SELECT COUNT(*) FROM workflow_invoice_automations WHERE company_id=? AND status='ACTIVE') AS active
  `).get(companyId, companyId, companyId, companyId) || {};
  const rules = db.prepare("SELECT COUNT(*) AS count FROM workflow_rules WHERE company_id=?").get(companyId) || {};
  const runsToday = db.prepare(`
    SELECT COUNT(*) AS count
    FROM workflow_runs
    WHERE company_id=? AND date(created_at)=date('now')
  `).get(companyId) || {};
  return {
    automations: Number(automations.total || 0),
    activeAutomations: Number(automations.active || 0),
    rules: Number(rules.count || 0),
    runsToday: Number(runsToday.count || 0)
  };
}

function invoiceStats(db, companyId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(total), 0) AS amount,
      SUM(CASE WHEN scadenta IS NOT NULL AND date(scadenta) < date('now') AND UPPER(COALESCE(status,'')) NOT IN ('PLATITA','ANULATA') THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN scadenta IS NOT NULL AND date(scadenta) BETWEEN date('now') AND date('now', '+7 day') AND UPPER(COALESCE(status,'')) NOT IN ('PLATITA','ANULATA') THEN 1 ELSE 0 END) AS dueSoon
    FROM facturi
    WHERE company_id=?
  `).get(companyId) || {};
}

function recentRuns(db, companyId, limit = 20) {
  return db.prepare(`
    SELECT r.*, a.name AS automation_name, ia.name AS invoice_automation_name, br.name AS rule_name
    FROM workflow_runs r
    LEFT JOIN workflow_automations a ON a.id=r.automation_id AND a.company_id=r.company_id
    LEFT JOIN workflow_invoice_automations ia ON ia.id=r.invoice_automation_id AND ia.company_id=r.company_id
    LEFT JOIN workflow_rules br ON br.id=r.rule_id AND br.company_id=r.company_id
    WHERE r.company_id=?
    ORDER BY r.id DESC
    LIMIT ?
  `).all(companyId, limit);
}

function addRunStep(db, companyId, runId, order, name, status, details = "") {
  db.prepare(`
    INSERT INTO workflow_run_steps (company_id, run_id, step_order, step_name, status, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(companyId, runId, order, safeText(name), status, safeText(details));
}

function createNotification(db, companyId, values = {}, req) {
  db.prepare(`
    INSERT INTO workflow_notifications (
      company_id, notification_number, channel, recipient, subject, body,
      status, related_module, entity_type, entity_id, scheduled_at,
      created_by_email, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    companyId,
    nextNumber(db, companyId, "workflow_notifications", "notification_number", "NTF"),
    values.channel || "IN_APP",
    safeText(values.recipient),
    safeText(values.subject) || "Notificare RPA",
    safeText(values.body),
    values.status || "DRAFT",
    safeText(values.relatedModule),
    safeText(values.entityType),
    Number(values.entityId || 0) || null,
    safeText(values.scheduledAt),
    actorEmail(req)
  );
}

function createApproval(db, companyId, values = {}, req) {
  db.prepare(`
    INSERT INTO workflow_approvals (
      company_id, approval_number, subject, module, entity_type, entity_id,
      amount, status, requested_by_email, approver_email, due_date,
      decision_notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, datetime('now'))
  `).run(
    companyId,
    nextNumber(db, companyId, "workflow_approvals", "approval_number", "APR"),
    safeText(values.subject) || "Aprobare RPA",
    safeText(values.module) || "GENERAL",
    safeText(values.entityType),
    Number(values.entityId || 0) || null,
    parseNumber(values.amount, 0),
    actorEmail(req),
    safeText(values.approverEmail),
    parseDate(values.dueDate) || null,
    safeText(values.notes)
  );
}

function runAutomation(db, companyId, automationId, req) {
  const automation = db.prepare(`
    SELECT *
    FROM workflow_automations
    WHERE id=? AND company_id=?
  `).get(automationId, companyId);
  if (!automation) return null;

  const runNumber = nextNumber(db, companyId, "workflow_runs", "run_number", "RUN");
  const info = db.prepare(`
    INSERT INTO workflow_runs (
      company_id, run_number, automation_id, run_type, status,
      processed_count, success_count, failed_count, summary, actor_email
    )
    VALUES (?, ?, ?, 'MANUAL', 'RUNNING', 0, 0, 0, ?, ?)
  `).run(companyId, runNumber, automation.id, `Pornire ${automation.name}`, actorEmail(req));
  const runId = info.lastInsertRowid;

  addRunStep(db, companyId, runId, 1, "Validare trigger", "DONE", automation.trigger_event);
  addRunStep(db, companyId, runId, 2, "Pregătire acțiune", "DONE", automation.action_type);

  if (automation.action_type === "CREATE_APPROVAL") {
    createApproval(db, companyId, {
      subject: `RPA: ${automation.name}`,
      module: automation.source_module,
      notes: automation.description,
      approverEmail: automation.owner_email
    }, req);
    addRunStep(db, companyId, runId, 3, "Aprobare creată", "DONE", automation.owner_email);
  } else {
    createNotification(db, companyId, {
      channel: automation.action_type === "WEBHOOK" ? "WEBHOOK" : "IN_APP",
      recipient: automation.owner_email,
      subject: `RPA: ${automation.name}`,
      body: automation.description,
      relatedModule: automation.source_module,
      status: automation.action_type === "WEBHOOK" ? "DRAFT" : "SENT"
    }, req);
    addRunStep(db, companyId, runId, 3, "Notificare creată", "DONE", automation.owner_email);
  }

  db.prepare(`
    UPDATE workflow_runs
    SET status='COMPLETED',
        finished_at=datetime('now'),
        processed_count=1,
        success_count=1,
        failed_count=0,
        summary=?
    WHERE id=? AND company_id=?
  `).run("Rulare manuală finalizată.", runId, companyId);
  return runId;
}

function matchingInvoices(db, companyId, automation) {
  const where = ["f.company_id=?"];
  const params = [companyId];

  const statusFilter = safeText(automation.invoice_status_filter).toUpperCase();
  if (statusFilter) {
    where.push("UPPER(COALESCE(f.status,''))=?");
    params.push(statusFilter);
  }

  const amountMin = parseNumber(automation.amount_min, 0);
  if (amountMin > 0) {
    where.push("f.total>=?");
    params.push(amountMin);
  }

  const trigger = safeText(automation.trigger_event).toUpperCase();
  if (trigger === "OVERDUE") {
    where.push("f.scadenta IS NOT NULL AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('PLATITA','ANULATA')");
  } else if (trigger === "DUE_SOON") {
    const days = Math.max(0, Number(automation.due_days || 0));
    where.push(`f.scadenta IS NOT NULL AND date(f.scadenta) BETWEEN date('now') AND date('now', '+${days} day') AND UPPER(COALESCE(f.status,'')) NOT IN ('PLATITA','ANULATA')`);
  } else if (trigger === "QUOTE_ACCEPTED") {
    where.push("f.quote_id IS NOT NULL");
  }

  const clientFilter = safeText(automation.client_filter).toLowerCase();
  if (clientFilter) {
    where.push("(LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
    params.push(`%${clientFilter}%`, `%${clientFilter}%`);
  }

  return db.prepare(`
    SELECT f.id, f.factura_nr, f.status, f.total, f.scadenta, c.name AS client_name, c.email AS client_email
    FROM facturi f
    LEFT JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
    WHERE ${where.join(" AND ")}
    ORDER BY f.id DESC
    LIMIT 100
  `).all(...params);
}

function runInvoiceAutomation(db, companyId, automationId, req) {
  const automation = db.prepare(`
    SELECT *
    FROM workflow_invoice_automations
    WHERE id=? AND company_id=?
  `).get(automationId, companyId);
  if (!automation) return null;

  const invoices = matchingInvoices(db, companyId, automation);
  const runNumber = nextNumber(db, companyId, "workflow_runs", "run_number", "RUN");
  const runInfo = db.prepare(`
    INSERT INTO workflow_runs (
      company_id, run_number, invoice_automation_id, run_type, status,
      processed_count, success_count, failed_count, summary, actor_email
    )
    VALUES (?, ?, ?, 'INVOICE_AUTOMATION', 'RUNNING', 0, 0, 0, ?, ?)
  `).run(companyId, runNumber, automation.id, `Automatizare facturi: ${automation.name}`, actorEmail(req));
  const runId = runInfo.lastInsertRowid;

  addRunStep(db, companyId, runId, 1, "Selectare facturi", "DONE", `${invoices.length} facturi potrivite`);

  const action = safeText(automation.action_type).toUpperCase();
  let step = 2;
  for (const invoice of invoices) {
    const subject = `${automation.name}: ${invoice.factura_nr || `Factura #${invoice.id}`}`;
    const body = [
      `Client: ${invoice.client_name || "-"}`,
      `Total: ${Number(invoice.total || 0).toFixed(2)} RON`,
      `Scadență: ${invoice.scadenta || "-"}`,
      `Status: ${invoice.status || "-"}`
    ].join("\n");

    if (["CREATE_APPROVAL", "MARK_FOR_REVIEW"].includes(action)) {
      createApproval(db, companyId, {
        subject,
        module: "FACTURI",
        entityType: "factura",
        entityId: invoice.id,
        amount: invoice.total,
        approverEmail: automation.notify_email,
        notes: body
      }, req);
      addRunStep(db, companyId, runId, step, "Aprobare factură creată", "DONE", invoice.factura_nr);
    } else {
      createNotification(db, companyId, {
        channel: action === "SEND_REMINDER" ? "EMAIL_DRAFT" : "IN_APP",
        recipient: automation.notify_email || invoice.client_email,
        subject,
        body: action === "SCHEDULE_EFACTURA" ? `${body}\n\nPregătire e-Factura: verificare internă, fără trimitere automată ANAF.` : body,
        relatedModule: "FACTURI",
        entityType: "factura",
        entityId: invoice.id,
        status: action === "SEND_REMINDER" ? "DRAFT" : "SENT"
      }, req);
      addRunStep(db, companyId, runId, step, "Notificare factură creată", "DONE", invoice.factura_nr);
    }
    step += 1;
  }

  db.prepare(`
    UPDATE workflow_invoice_automations
    SET last_run_at=datetime('now'), updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(automation.id, companyId);
  db.prepare(`
    UPDATE workflow_runs
    SET status='COMPLETED',
        finished_at=datetime('now'),
        processed_count=?,
        success_count=?,
        failed_count=0,
        summary=?
    WHERE id=? AND company_id=?
  `).run(
    invoices.length,
    invoices.length,
    invoices.length ? `Au fost procesate ${invoices.length} facturi.` : "Nu au fost găsite facturi potrivite.",
    runId,
    companyId
  );
  return runId;
}

export function registerWorkflowRoutes(app, { db, requireAuth }) {
  app.get("/nexora/workflow", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    res.type("html").send(renderNexoraWorkflowHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: stats(db, companyId),
      invoiceStats: invoiceStats(db, companyId),
      recentRuns: recentRuns(db, companyId, 8),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/workflow/automations", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT *
      FROM workflow_automations
      WHERE company_id=?
      ORDER BY status='ACTIVE' DESC, id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraWorkflowAutomationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/workflow/automations/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/workflow/automations?err=required");
    db.prepare(`
      INSERT INTO workflow_automations (
        company_id, automation_number, name, description, category, source_module,
        trigger_event, action_type, action_config_json, schedule_label,
        owner_email, priority, status, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      nextNumber(db, companyId, "workflow_automations", "automation_number", "RPA"),
      name,
      safeText(req.body?.description),
      oneOf(req.body?.category, ["RPA", "WORKFLOW", "ALERT", "INTEGRARE"], "RPA"),
      oneOf(req.body?.source_module, ["GENERAL", "FACTURI", "VANZARI", "CRM", "DMS", "ACHIZITII", "HR"], "GENERAL"),
      oneOf(req.body?.trigger_event, ["MANUAL", "ON_CREATE", "ON_STATUS_CHANGE", "SCHEDULED", "DUE_DATE"], "MANUAL"),
      oneOf(req.body?.action_type, ["CREATE_NOTIFICATION", "CREATE_APPROVAL", "UPDATE_STATUS", "GENERATE_DOCUMENT", "WEBHOOK"], "CREATE_NOTIFICATION"),
      jsonText(req.body?.action_config_json),
      safeText(req.body?.schedule_label),
      safeText(req.body?.owner_email),
      oneOf(req.body?.priority, ["SCAZUTA", "MEDIE", "RIDICATA", "URGENTA"], "MEDIE"),
      oneOf(req.body?.status, ["DRAFT", "ACTIVE", "PAUSED"], "ACTIVE"),
      actorEmail(req)
    );
    res.redirect("/nexora/workflow/automations?ok=created");
  });

  app.post("/nexora/workflow/automations/:id/run", requireAuth, (req, res) => {
    const runId = runAutomation(db, companyIdFrom(req), Number(req.params.id || 0), req);
    res.redirect(runId ? "/nexora/workflow/runs?ok=run" : "/nexora/workflow/automations?err=missing");
  });

  app.post("/nexora/workflow/automations/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = oneOf(req.body?.status, ["DRAFT", "ACTIVE", "PAUSED"], "ACTIVE");
    db.prepare("UPDATE workflow_automations SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(status, Number(req.params.id || 0), companyId);
    res.redirect("/nexora/workflow/automations?ok=status");
  });

  app.get("/nexora/workflow/invoice-automation", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT *
      FROM workflow_invoice_automations
      WHERE company_id=?
      ORDER BY status='ACTIVE' DESC, id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraWorkflowInvoiceAutomationPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      invoiceStats: invoiceStats(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/workflow/invoice-automation/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/workflow/invoice-automation?err=required");
    db.prepare(`
      INSERT INTO workflow_invoice_automations (
        company_id, automation_number, name, trigger_event, invoice_status_filter,
        due_days, client_filter, amount_min, action_type, notify_email,
        status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      nextNumber(db, companyId, "workflow_invoice_automations", "automation_number", "INV-RPA"),
      name,
      oneOf(req.body?.trigger_event, ["DUE_SOON", "OVERDUE", "INVOICE_CREATED", "STATUS_CHANGED", "QUOTE_ACCEPTED"], "DUE_SOON"),
      safeText(req.body?.invoice_status_filter).toUpperCase(),
      Math.max(0, Math.round(parseNumber(req.body?.due_days, 0))),
      safeText(req.body?.client_filter),
      Math.max(0, parseNumber(req.body?.amount_min, 0)),
      oneOf(req.body?.action_type, ["CREATE_NOTIFICATION", "SEND_REMINDER", "CREATE_APPROVAL", "MARK_FOR_REVIEW", "SCHEDULE_EFACTURA"], "CREATE_NOTIFICATION"),
      safeText(req.body?.notify_email),
      oneOf(req.body?.status, ["DRAFT", "ACTIVE", "PAUSED"], "ACTIVE"),
      safeText(req.body?.notes),
      actorEmail(req)
    );
    res.redirect("/nexora/workflow/invoice-automation?ok=created");
  });

  app.post("/nexora/workflow/invoice-automation/:id/run", requireAuth, (req, res) => {
    const runId = runInvoiceAutomation(db, companyIdFrom(req), Number(req.params.id || 0), req);
    res.redirect(runId ? "/nexora/workflow/runs?ok=run" : "/nexora/workflow/invoice-automation?err=missing");
  });

  app.post("/nexora/workflow/invoice-automation/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = oneOf(req.body?.status, ["DRAFT", "ACTIVE", "PAUSED"], "ACTIVE");
    db.prepare("UPDATE workflow_invoice_automations SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(status, Number(req.params.id || 0), companyId);
    res.redirect("/nexora/workflow/invoice-automation?ok=status");
  });

  app.get("/nexora/workflow/rules", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT *
      FROM workflow_rules
      WHERE company_id=?
      ORDER BY status='ACTIVE' DESC, id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraWorkflowRulesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/workflow/rules/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/workflow/rules?err=required");
    db.prepare(`
      INSERT INTO workflow_rules (
        company_id, rule_number, name, applies_to, trigger_event, condition_field,
        condition_operator, condition_value, action_type, action_target, severity,
        status, stop_on_match, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      nextNumber(db, companyId, "workflow_rules", "rule_number", "RULE"),
      name,
      oneOf(req.body?.applies_to, ["GENERAL", "FACTURI", "CLIENTI", "OFERTE", "ACHIZITII", "DMS", "HR"], "GENERAL"),
      oneOf(req.body?.trigger_event, ["ON_CREATE", "ON_UPDATE", "ON_STATUS_CHANGE", "SCHEDULED", "MANUAL"], "ON_CREATE"),
      safeText(req.body?.condition_field),
      oneOf(req.body?.condition_operator, ["ALWAYS", "EQUALS", "CONTAINS", "GREATER_THAN", "LESS_THAN", "IS_EMPTY"], "ALWAYS"),
      safeText(req.body?.condition_value),
      oneOf(req.body?.action_type, ["CREATE_NOTIFICATION", "CREATE_APPROVAL", "ASSIGN_OWNER", "GENERATE_DOCUMENT", "WEBHOOK"], "CREATE_NOTIFICATION"),
      safeText(req.body?.action_target),
      oneOf(req.body?.severity, ["SCAZUTA", "MEDIE", "RIDICATA", "URGENTA"], "MEDIE"),
      oneOf(req.body?.status, ["DRAFT", "ACTIVE", "PAUSED"], "ACTIVE"),
      safeText(req.body?.stop_on_match) === "1" ? 1 : 0,
      safeText(req.body?.notes),
      actorEmail(req)
    );
    res.redirect("/nexora/workflow/rules?ok=created");
  });

  app.post("/nexora/workflow/rules/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = oneOf(req.body?.status, ["DRAFT", "ACTIVE", "PAUSED"], "ACTIVE");
    db.prepare("UPDATE workflow_rules SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(status, Number(req.params.id || 0), companyId);
    res.redirect("/nexora/workflow/rules?ok=status");
  });

  app.get("/nexora/workflow/approvals", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT *
      FROM workflow_approvals
      WHERE company_id=?
      ORDER BY status='PENDING' DESC, id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraWorkflowApprovalsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/workflow/approvals/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const subject = safeText(req.body?.subject);
    if (!subject) return res.redirect("/nexora/workflow/approvals?err=required");
    createApproval(db, companyId, {
      subject,
      module: oneOf(req.body?.module, ["GENERAL", "FACTURI", "ACHIZITII", "VANZARI", "HR"], "GENERAL"),
      entityType: safeText(req.body?.entity_type),
      entityId: Number(req.body?.entity_id || 0) || null,
      amount: parseNumber(req.body?.amount, 0),
      approverEmail: safeText(req.body?.approver_email),
      dueDate: parseDate(req.body?.due_date),
      notes: safeText(req.body?.decision_notes)
    }, req);
    res.redirect("/nexora/workflow/approvals?ok=created");
  });

  app.post("/nexora/workflow/approvals/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = oneOf(req.body?.status, ["PENDING", "APPROVED", "REJECTED"], "PENDING");
    db.prepare(`
      UPDATE workflow_approvals
      SET status=?, decided_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, Number(req.params.id || 0), companyId);
    res.redirect("/nexora/workflow/approvals?ok=decided");
  });

  app.get("/nexora/workflow/notifications", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT *
      FROM workflow_notifications
      WHERE company_id=?
      ORDER BY status IN ('DRAFT','SCHEDULED') DESC, id DESC
      LIMIT 500
    `).all(companyId);
    res.type("html").send(renderNexoraWorkflowNotificationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/workflow/notifications/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const subject = safeText(req.body?.subject);
    if (!subject) return res.redirect("/nexora/workflow/notifications?err=required");
    createNotification(db, companyId, {
      channel: oneOf(req.body?.channel, ["IN_APP", "EMAIL_DRAFT", "SMS_DRAFT", "WEBHOOK"], "IN_APP"),
      recipient: safeText(req.body?.recipient),
      subject,
      body: safeText(req.body?.body),
      relatedModule: safeText(req.body?.related_module),
      entityType: safeText(req.body?.entity_type),
      entityId: Number(req.body?.entity_id || 0) || null,
      scheduledAt: safeText(req.body?.scheduled_at),
      status: oneOf(req.body?.status, ["DRAFT", "SCHEDULED", "SENT"], "DRAFT")
    }, req);
    res.redirect("/nexora/workflow/notifications?ok=created");
  });

  app.post("/nexora/workflow/notifications/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = oneOf(req.body?.status, ["DRAFT", "SCHEDULED", "SENT", "FAILED"], "SENT");
    db.prepare(`
      UPDATE workflow_notifications
      SET status=?,
          sent_at=CASE WHEN ?='SENT' THEN datetime('now') ELSE sent_at END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, status, Number(req.params.id || 0), companyId);
    res.redirect("/nexora/workflow/notifications?ok=status");
  });

  app.get("/nexora/workflow/runs", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const runs = recentRuns(db, companyId, 100);
    const steps = db.prepare(`
      SELECT s.*, r.run_number
      FROM workflow_run_steps s
      JOIN workflow_runs r ON r.id=s.run_id AND r.company_id=s.company_id
      WHERE s.company_id=?
      ORDER BY s.id DESC
      LIMIT 300
    `).all(companyId);
    res.type("html").send(renderNexoraWorkflowRunsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: runs,
      steps,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });
}
