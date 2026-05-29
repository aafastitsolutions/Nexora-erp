import {
  renderNexoraCrmActivitiesPage,
  renderNexoraCrmEmailTrackingPage,
  renderNexoraCrmFollowUpPage,
  renderNexoraCrmHubPage,
  renderNexoraCrmLeadsPage,
  renderNexoraCrmPipelinePage
} from "../src/ui/nexora-crm-pages.js";

const LEAD_STATUSES = ["NOU", "CONTACTAT", "CALIFICAT", "NECALIFICAT", "CONVERTIT", "PIERDUT"];
const OPPORTUNITY_STAGES = ["CALIFICARE", "CONTACT", "OFERTA", "NEGOCIERE", "CASTIGATA", "PIERDUTA"];
const FOLLOWUP_TYPES = ["TASK", "CALL", "MEETING", "EMAIL", "NOTE"];
const FOLLOWUP_PRIORITIES = ["SCAZUTA", "MEDIE", "RIDICATA", "URGENTA"];
const EMAIL_DIRECTIONS = ["OUT", "IN"];
const EMAIL_STATUSES = ["PREGATIT", "TRIMIS", "DESCHIS", "RASPUNS", "ESUAT"];

function safeText(value = "") {
  return String(value || "").trim();
}

function parseMoney(value = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parsePercent(value = 0, fallback = 0) {
  const parsed = Math.round(Number(String(value ?? "").replace(",", ".")));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function parseDate(value = "") {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function oneOf(value, allowed, fallback) {
  const normalized = safeText(value).toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function nextNumber(db, companyId, tableName, numberColumn, prefix) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM ${tableName}
    WHERE company_id=? AND year=?
  `).get(companyId, year)?.next_seq || 1);

  let number = "";
  do {
    number = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
    seq += 1;
  } while (db.prepare(`SELECT id FROM ${tableName} WHERE company_id=? AND ${numberColumn}=?`).get(companyId, number));

  return { year, seq: seq - 1, number };
}

function generatedLeadClientCui(db, companyId, leadId) {
  let candidate = `LEAD-${leadId}`;
  let suffix = 1;
  while (db.prepare("SELECT id FROM clients WHERE company_id=? AND cui=?").get(companyId, candidate)) {
    candidate = `LEAD-${leadId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function loadClients(db, companyId) {
  return db.prepare(`
    SELECT id, name, cui, email, phone
    FROM clients
    WHERE company_id=? AND COALESCE(inactive, 0)=0
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 1000
  `).all(companyId);
}

function loadLeadOptions(db, companyId) {
  return db.prepare(`
    SELECT id, lead_number, name, company_name, email
    FROM crm_leads
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1000
  `).all(companyId);
}

function loadOpportunityOptions(db, companyId) {
  return db.prepare(`
    SELECT id, opportunity_number, title
    FROM crm_opportunities
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1000
  `).all(companyId);
}

function existingClientId(db, companyId, id) {
  const value = Number(id || 0);
  if (!value) return null;
  return db.prepare("SELECT id FROM clients WHERE id=? AND company_id=?").get(value, companyId)?.id || null;
}

function existingLeadId(db, companyId, id) {
  const value = Number(id || 0);
  if (!value) return null;
  return db.prepare("SELECT id FROM crm_leads WHERE id=? AND company_id=?").get(value, companyId)?.id || null;
}

function existingOpportunityId(db, companyId, id) {
  const value = Number(id || 0);
  if (!value) return null;
  return db.prepare("SELECT id FROM crm_opportunities WHERE id=? AND company_id=?").get(value, companyId)?.id || null;
}

function redirect(path, params = {}) {
  const search = new URLSearchParams(params);
  return `${path}${String(search) ? `?${search}` : ""}`;
}

function relationSelectSql() {
  return `
    f.*,
    cl.name AS client_name,
    l.name AS lead_name,
    l.lead_number AS lead_number,
    o.title AS opportunity_title,
    o.opportunity_number AS opportunity_number
  `;
}

function relationJoinsSql(alias = "f") {
  return `
    LEFT JOIN clients cl ON cl.id=${alias}.client_id AND cl.company_id=${alias}.company_id
    LEFT JOIN crm_leads l ON l.id=${alias}.lead_id AND l.company_id=${alias}.company_id
    LEFT JOIN crm_opportunities o ON o.id=${alias}.opportunity_id AND o.company_id=${alias}.company_id
  `;
}

export function registerCrmRoutes(app, { db, requireAuth, fmtMoney }) {
  app.get("/nexora/crm", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM crm_leads WHERE company_id=? AND status NOT IN ('CONVERTIT','PIERDUT')) AS open_leads,
        (SELECT COUNT(*) FROM crm_opportunities WHERE company_id=? AND status='DESCHISA') AS open_opportunities,
        (SELECT COALESCE(SUM(amount),0) FROM crm_opportunities WHERE company_id=? AND status='DESCHISA') AS pipeline_amount,
        (SELECT COUNT(*) FROM crm_followups WHERE company_id=? AND status <> 'REALIZAT' AND due_date <> '' AND date(due_date) <= date('now')) AS due_followups
    `).get(companyId, companyId, companyId, companyId) || {};

    const recentLeads = db.prepare(`
      SELECT *
      FROM crm_leads
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 8
    `).all(companyId);

    const opportunities = db.prepare(`
      SELECT o.*, cl.name AS client_name, l.name AS lead_name
      FROM crm_opportunities o
      LEFT JOIN clients cl ON cl.id=o.client_id AND cl.company_id=o.company_id
      LEFT JOIN crm_leads l ON l.id=o.lead_id AND l.company_id=o.company_id
      WHERE o.company_id=? AND o.status='DESCHISA'
      ORDER BY o.id DESC
      LIMIT 8
    `).all(companyId);

    const followups = db.prepare(`
      SELECT ${relationSelectSql()}
      FROM crm_followups f
      ${relationJoinsSql("f")}
      WHERE f.company_id=? AND f.status <> 'REALIZAT'
      ORDER BY COALESCE(f.due_date, '9999-12-31') ASC, f.id DESC
      LIMIT 8
    `).all(companyId);

    return res.type("html").send(renderNexoraCrmHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      recentLeads,
      opportunities,
      followups,
      fmtMoney
    }));
  });

  app.get("/nexora/crm/leads", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = safeText(req.query?.q);
    const status = oneOf(req.query?.status, LEAD_STATUSES, "");
    const where = ["company_id=?"];
    const params = [companyId];

    if (q) {
      const like = `%${q}%`;
      where.push("(lead_number LIKE ? OR name LIKE ? OR company_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ?)");
      params.push(like, like, like, like, like, like);
    }
    if (status) {
      where.push("status=?");
      params.push(status);
    }

    const rows = db.prepare(`
      SELECT *
      FROM crm_leads
      WHERE ${where.join(" AND ")}
      ORDER BY id DESC
      LIMIT 300
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN status='CONVERTIT' THEN 1 ELSE 0 END) AS converted_count,
        COALESCE(SUM(estimated_value),0) AS estimated_amount,
        SUM(CASE WHEN status NOT IN ('CONVERTIT','PIERDUT') AND next_followup_date <> '' AND date(next_followup_date) <= date('now') THEN 1 ELSE 0 END) AS due_today
      FROM crm_leads
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraCrmLeadsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      filters: { q, status },
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err),
      leadStatuses: LEAD_STATUSES,
      fmtMoney
    }));
  });

  app.post("/nexora/crm/leads/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect(redirect("/nexora/crm/leads", { err: "required" }));

    try {
      const next = nextNumber(db, companyId, "crm_leads", "lead_number", "LD");
      db.prepare(`
        INSERT INTO crm_leads (
          company_id, year, seq, lead_number, name, company_name, contact_name,
          email, phone, source, status, owner_email, estimated_value, probability,
          next_step, next_followup_date, notes, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOU', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        next.year,
        next.seq,
        next.number,
        name,
        safeText(req.body?.company_name) || null,
        safeText(req.body?.contact_name) || null,
        safeText(req.body?.email) || null,
        safeText(req.body?.phone) || null,
        oneOf(req.body?.source, ["MANUAL", "WEBSITE", "RECOMANDARE", "TELEFON", "EMAIL", "CAMPANIE"], "MANUAL"),
        safeText(req.session.user.email),
        parseMoney(req.body?.estimated_value),
        parsePercent(req.body?.probability, 10),
        safeText(req.body?.next_step) || null,
        parseDate(req.body?.next_followup_date) || null,
        safeText(req.body?.notes) || null,
        safeText(req.session.user.email)
      );
      return res.redirect(redirect("/nexora/crm/leads", { ok: "saved" }));
    } catch (error) {
      console.error("[CRM] create lead failed", error);
      return res.redirect(redirect("/nexora/crm/leads", { err: "save_failed" }));
    }
  });

  app.post("/nexora/crm/leads/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const leadId = Number(req.params.id || 0);
    const status = oneOf(req.body?.status, LEAD_STATUSES, "NOU");
    const result = db.prepare("UPDATE crm_leads SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(status, leadId, companyId);
    return res.redirect(redirect("/nexora/crm/leads", { [result.changes ? "ok" : "err"]: result.changes ? "updated" : "missing" }));
  });

  app.post("/nexora/crm/leads/:id/convert", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const leadId = Number(req.params.id || 0);
    const lead = db.prepare("SELECT * FROM crm_leads WHERE id=? AND company_id=?").get(leadId, companyId);
    if (!lead) return res.redirect(redirect("/nexora/crm/leads", { err: "missing" }));
    if (lead.converted_client_id) return res.redirect(redirect("/nexora/crm/leads", { ok: "converted" }));

    try {
      const tx = db.transaction(() => {
        const clientName = safeText(lead.company_name) || safeText(lead.name) || `Lead ${lead.lead_number}`;
        const clientCui = generatedLeadClientCui(db, companyId, lead.id);
        const clientInfo = db.prepare(`
          INSERT INTO clients (cui, name, email, phone, notes, vat, inactive, client_status, company_id)
          VALUES (?, ?, ?, ?, ?, 0, 0, 'verde', ?)
        `).run(
          clientCui,
          clientName,
          safeText(lead.email) || null,
          safeText(lead.phone) || null,
          safeText(lead.notes) || null,
          companyId
        );

        const clientId = clientInfo.lastInsertRowid;
        if (safeText(lead.contact_name) || safeText(lead.email) || safeText(lead.phone)) {
          db.prepare(`
            INSERT INTO contacts (client_id, name, email, phone, position, is_primary, company_id)
            VALUES (?, ?, ?, ?, ?, 1, ?)
          `).run(
            clientId,
            safeText(lead.contact_name) || clientName,
            safeText(lead.email) || null,
            safeText(lead.phone) || null,
            "Contact lead",
            companyId
          );
        }

        db.prepare(`
          UPDATE crm_leads
          SET status='CONVERTIT', converted_client_id=?, updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(clientId, lead.id, companyId);
        return clientId;
      });
      tx();
      return res.redirect(redirect("/nexora/crm/leads", { ok: "converted" }));
    } catch (error) {
      console.error("[CRM] convert lead failed", error);
      return res.redirect(redirect("/nexora/crm/leads", { err: "save_failed" }));
    }
  });

  app.get("/nexora/crm/pipeline", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT o.*, cl.name AS client_name, l.name AS lead_name
      FROM crm_opportunities o
      LEFT JOIN clients cl ON cl.id=o.client_id AND cl.company_id=o.company_id
      LEFT JOIN crm_leads l ON l.id=o.lead_id AND l.company_id=o.company_id
      WHERE o.company_id=?
      ORDER BY
        CASE o.stage
          WHEN 'CALIFICARE' THEN 1 WHEN 'CONTACT' THEN 2 WHEN 'OFERTA' THEN 3
          WHEN 'NEGOCIERE' THEN 4 WHEN 'CASTIGATA' THEN 5 WHEN 'PIERDUTA' THEN 6
          ELSE 7
        END,
        o.id DESC
      LIMIT 500
    `).all(companyId);

    return res.type("html").send(renderNexoraCrmPipelinePage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      clients: loadClients(db, companyId),
      leads: loadLeadOptions(db, companyId),
      stages: OPPORTUNITY_STAGES,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err),
      fmtMoney
    }));
  });

  app.post("/nexora/crm/opportunities/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const title = safeText(req.body?.title);
    if (!title) return res.redirect(redirect("/nexora/crm/pipeline", { err: "required" }));

    try {
      const next = nextNumber(db, companyId, "crm_opportunities", "opportunity_number", "OPP");
      const stage = oneOf(req.body?.stage, OPPORTUNITY_STAGES, "CALIFICARE");
      const status = stage === "CASTIGATA" ? "CASTIGATA" : (stage === "PIERDUTA" ? "PIERDUTA" : "DESCHISA");
      db.prepare(`
        INSERT INTO crm_opportunities (
          company_id, year, seq, opportunity_number, client_id, lead_id, title,
          stage, status, amount, probability, expected_close_date, owner_email,
          source, notes, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        next.year,
        next.seq,
        next.number,
        existingClientId(db, companyId, req.body?.client_id),
        existingLeadId(db, companyId, req.body?.lead_id),
        title,
        stage,
        status,
        parseMoney(req.body?.amount),
        parsePercent(req.body?.probability, 25),
        parseDate(req.body?.expected_close_date) || null,
        safeText(req.session.user.email),
        "CRM",
        safeText(req.body?.notes) || null,
        safeText(req.session.user.email)
      );
      return res.redirect(redirect("/nexora/crm/pipeline", { ok: "saved" }));
    } catch (error) {
      console.error("[CRM] create opportunity failed", error);
      return res.redirect(redirect("/nexora/crm/pipeline", { err: "save_failed" }));
    }
  });

  app.post("/nexora/crm/opportunities/:id/stage", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const stage = oneOf(req.body?.stage, OPPORTUNITY_STAGES, "CALIFICARE");
    const status = stage === "CASTIGATA" ? "CASTIGATA" : (stage === "PIERDUTA" ? "PIERDUTA" : "DESCHISA");
    const probabilityByStage = { CALIFICARE: 20, CONTACT: 35, OFERTA: 55, NEGOCIERE: 75, CASTIGATA: 100, PIERDUTA: 0 };
    const result = db.prepare(`
      UPDATE crm_opportunities
      SET stage=?, status=?, probability=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(stage, status, probabilityByStage[stage], id, companyId);
    return res.redirect(redirect("/nexora/crm/pipeline", { [result.changes ? "ok" : "err"]: result.changes ? "updated" : "missing" }));
  });

  app.get("/nexora/crm/follow-up", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const status = oneOf(req.query?.status, ["DESCHIS", "REALIZAT"], "");
    const activityType = oneOf(req.query?.activity_type, FOLLOWUP_TYPES, "");
    const q = safeText(req.query?.q);
    const where = ["f.company_id=?"];
    const params = [companyId];
    if (status) {
      where.push("f.status=?");
      params.push(status);
    }
    if (activityType) {
      where.push("f.activity_type=?");
      params.push(activityType);
    }
    if (q) {
      const like = `%${q}%`;
      where.push("(f.subject LIKE ? OR f.notes LIKE ? OR cl.name LIKE ? OR l.name LIKE ? OR o.title LIKE ?)");
      params.push(like, like, like, like, like);
    }

    const rows = db.prepare(`
      SELECT ${relationSelectSql()}
      FROM crm_followups f
      ${relationJoinsSql("f")}
      WHERE ${where.join(" AND ")}
      ORDER BY CASE WHEN f.status='REALIZAT' THEN 1 ELSE 0 END,
               COALESCE(f.due_date, '9999-12-31') ASC,
               f.id DESC
      LIMIT 500
    `).all(...params);

    return res.type("html").send(renderNexoraCrmFollowUpPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      clients: loadClients(db, companyId),
      leads: loadLeadOptions(db, companyId),
      opportunities: loadOpportunityOptions(db, companyId),
      filters: { status, activity_type: activityType, q },
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/crm/follow-up/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const subject = safeText(req.body?.subject);
    if (!subject) return res.redirect(redirect("/nexora/crm/follow-up", { err: "required" }));
    const clientId = existingClientId(db, companyId, req.body?.client_id);

    try {
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO crm_followups (
            company_id, client_id, lead_id, opportunity_id, activity_type, subject,
            notes, due_date, priority, status, owner_email, created_by_email
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DESCHIS', ?, ?)
        `).run(
          companyId,
          clientId,
          existingLeadId(db, companyId, req.body?.lead_id),
          existingOpportunityId(db, companyId, req.body?.opportunity_id),
          oneOf(req.body?.activity_type, FOLLOWUP_TYPES, "TASK"),
          subject,
          safeText(req.body?.notes) || null,
          parseDate(req.body?.due_date) || null,
          oneOf(req.body?.priority, FOLLOWUP_PRIORITIES, "MEDIE"),
          safeText(req.body?.owner_email) || safeText(req.session.user.email),
          safeText(req.session.user.email)
        );
        if (clientId) {
          db.prepare(`
            INSERT INTO activities (client_id, contact_id, type, subject, note, due_at, done, employee_id, company_id)
            VALUES (?, NULL, ?, ?, ?, ?, 0, NULL, ?)
          `).run(clientId, oneOf(req.body?.activity_type, FOLLOWUP_TYPES, "TASK").toLowerCase(), subject, safeText(req.body?.notes) || null, parseDate(req.body?.due_date) || null, companyId);
        }
      });
      tx();
      return res.redirect(redirect("/nexora/crm/follow-up", { ok: "saved" }));
    } catch (error) {
      console.error("[CRM] create follow-up failed", error);
      return res.redirect(redirect("/nexora/crm/follow-up", { err: "save_failed" }));
    }
  });

  app.post("/nexora/crm/follow-up/:id/toggle", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const row = db.prepare("SELECT status FROM crm_followups WHERE id=? AND company_id=?").get(id, companyId);
    if (!row) return res.redirect(redirect("/nexora/crm/follow-up", { err: "missing" }));
    const nextStatus = String(row.status || "").toUpperCase() === "REALIZAT" ? "DESCHIS" : "REALIZAT";
    db.prepare(`
      UPDATE crm_followups
      SET status=?, completed_at=CASE WHEN ?='REALIZAT' THEN datetime('now') ELSE NULL END, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(nextStatus, nextStatus, id, companyId);
    return res.redirect(redirect("/nexora/crm/follow-up", { ok: "updated" }));
  });

  app.get("/nexora/crm/activities", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT *
      FROM (
        SELECT 'crm' AS source, f.id, f.activity_type, f.subject, f.notes, f.due_date,
               f.status, f.created_at, cl.name AS client_name, l.name AS lead_name,
               o.title AS opportunity_title, NULL AS type, NULL AS note, NULL AS due_at, 0 AS done
        FROM crm_followups f
        ${relationJoinsSql("f")}
        WHERE f.company_id=?
        UNION ALL
        SELECT 'client' AS source, a.id, UPPER(a.type) AS activity_type, a.subject, a.note AS notes, a.due_at AS due_date,
               CASE WHEN a.done=1 THEN 'REALIZAT' ELSE 'DESCHIS' END AS status, a.created_at,
               cl.name AS client_name, NULL AS lead_name, NULL AS opportunity_title,
               a.type, a.note, a.due_at, a.done
        FROM activities a
        JOIN clients cl ON cl.id=a.client_id AND cl.company_id=a.company_id
        WHERE a.company_id=?
      )
      ORDER BY created_at DESC
      LIMIT 500
    `).all(companyId, companyId);

    return res.type("html").send(renderNexoraCrmActivitiesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      clients: loadClients(db, companyId),
      leads: loadLeadOptions(db, companyId),
      opportunities: loadOpportunityOptions(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/crm/activities/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const subject = safeText(req.body?.subject);
    if (!subject) return res.redirect(redirect("/nexora/crm/activities", { err: "required" }));
    const activityType = oneOf(req.body?.activity_type, FOLLOWUP_TYPES, "NOTE");
    const clientId = existingClientId(db, companyId, req.body?.client_id);

    try {
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO crm_followups (
            company_id, client_id, lead_id, opportunity_id, activity_type, subject,
            notes, due_date, priority, status, completed_at, owner_email, created_by_email
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MEDIE', 'REALIZAT', datetime('now'), ?, ?)
        `).run(
          companyId,
          clientId,
          existingLeadId(db, companyId, req.body?.lead_id),
          existingOpportunityId(db, companyId, req.body?.opportunity_id),
          activityType,
          subject,
          safeText(req.body?.notes) || null,
          parseDate(req.body?.due_date) || null,
          safeText(req.session.user.email),
          safeText(req.session.user.email)
        );
        if (clientId) {
          db.prepare(`
            INSERT INTO activities (client_id, contact_id, type, subject, note, due_at, done, employee_id, company_id)
            VALUES (?, NULL, ?, ?, ?, ?, 1, NULL, ?)
          `).run(clientId, activityType.toLowerCase(), subject, safeText(req.body?.notes) || null, parseDate(req.body?.due_date) || null, companyId);
        }
      });
      tx();
      return res.redirect(redirect("/nexora/crm/activities", { ok: "saved" }));
    } catch (error) {
      console.error("[CRM] create activity failed", error);
      return res.redirect(redirect("/nexora/crm/activities", { err: "save_failed" }));
    }
  });

  app.get("/nexora/crm/email-tracking", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT e.*, cl.name AS client_name, l.name AS lead_name, o.title AS opportunity_title
      FROM crm_email_events e
      LEFT JOIN clients cl ON cl.id=e.client_id AND cl.company_id=e.company_id
      LEFT JOIN crm_leads l ON l.id=e.lead_id AND l.company_id=e.company_id
      LEFT JOIN crm_opportunities o ON o.id=e.opportunity_id AND o.company_id=e.company_id
      WHERE e.company_id=?
      ORDER BY e.id DESC
      LIMIT 500
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        SUM(CASE WHEN status='PREGATIT' THEN 1 ELSE 0 END) AS prepared,
        SUM(CASE WHEN status='TRIMIS' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status='DESCHIS' THEN 1 ELSE 0 END) AS opened,
        SUM(CASE WHEN status='RASPUNS' THEN 1 ELSE 0 END) AS replied
      FROM crm_email_events
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraCrmEmailTrackingPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      clients: loadClients(db, companyId),
      leads: loadLeadOptions(db, companyId),
      opportunities: loadOpportunityOptions(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/crm/email-tracking/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const subject = safeText(req.body?.subject);
    const recipient = safeText(req.body?.recipient_email);
    if (!subject || !recipient) return res.redirect(redirect("/nexora/crm/email-tracking", { err: "required" }));

    try {
      db.prepare(`
        INSERT INTO crm_email_events (
          company_id, client_id, lead_id, opportunity_id, direction, recipient_email,
          subject, status, notes, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PREGATIT', ?, ?)
      `).run(
        companyId,
        existingClientId(db, companyId, req.body?.client_id),
        existingLeadId(db, companyId, req.body?.lead_id),
        existingOpportunityId(db, companyId, req.body?.opportunity_id),
        oneOf(req.body?.direction, EMAIL_DIRECTIONS, "OUT"),
        recipient,
        subject,
        safeText(req.body?.notes) || null,
        safeText(req.session.user.email)
      );
      return res.redirect(redirect("/nexora/crm/email-tracking", { ok: "saved" }));
    } catch (error) {
      console.error("[CRM] create email event failed", error);
      return res.redirect(redirect("/nexora/crm/email-tracking", { err: "save_failed" }));
    }
  });

  app.post("/nexora/crm/email-tracking/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const status = oneOf(req.body?.status, EMAIL_STATUSES, "PREGATIT");
    const result = db.prepare(`
      UPDATE crm_email_events
      SET status=?,
          sent_at=CASE WHEN ? IN ('TRIMIS','DESCHIS','RASPUNS') THEN COALESCE(sent_at, datetime('now')) ELSE sent_at END,
          opened_at=CASE WHEN ? IN ('DESCHIS','RASPUNS') THEN COALESCE(opened_at, datetime('now')) ELSE opened_at END,
          replied_at=CASE WHEN ?='RASPUNS' THEN COALESCE(replied_at, datetime('now')) ELSE replied_at END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, status, status, status, id, companyId);
    return res.redirect(redirect("/nexora/crm/email-tracking", { [result.changes ? "ok" : "err"]: result.changes ? "updated" : "missing" }));
  });
}
