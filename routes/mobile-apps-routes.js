import {
  renderNexoraMobileAppsHubPage,
  renderNexoraMobileDevicesPage,
  renderNexoraMobileOperationsPage,
  renderNexoraMobileSessionsPage,
  renderNexoraMobileTasksPage,
  renderNexoraMobileWorkflowsPage
} from "../src/ui/nexora-mobile-apps-pages.js";

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function currentUserEmail(req) {
  return String(req.session.user.email || "").trim().toLowerCase();
}

function safeText(value) {
  return String(value || "").trim();
}

function parseDate(value) {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function slugCode(value = "") {
  const normalized = safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized || "MOB";
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    mobile_app_devices: "device_code",
    mobile_app_workflows: "workflow_code",
    mobile_app_tasks: "task_number",
    mobile_app_sessions: "session_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported mobile app sequence");
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

function loadDevices(db, companyId, activeOnly = false) {
  const activeFilter = activeOnly ? "AND UPPER(COALESCE(status,''))='ACTIV'" : "";
  return db.prepare(`
    SELECT *
    FROM mobile_app_devices
    WHERE company_id=? ${activeFilter}
    ORDER BY status='ACTIV' DESC, device_name COLLATE NOCASE ASC
    LIMIT 300
  `).all(companyId);
}

function loadWorkflows(db, companyId) {
  return db.prepare(`
    SELECT *
    FROM mobile_app_workflows
    WHERE company_id=?
    ORDER BY status='ACTIV' DESC, workflow_type COLLATE NOCASE ASC, workflow_name COLLATE NOCASE ASC
    LIMIT 300
  `).all(companyId);
}

function loadTasks(db, companyId, openOnly = false) {
  const openFilter = openOnly ? "AND UPPER(COALESCE(status,'')) NOT IN ('FINALIZAT','ANULAT')" : "";
  return db.prepare(`
    SELECT *
    FROM mobile_app_tasks
    WHERE company_id=? ${openFilter}
    ORDER BY id DESC
    LIMIT 400
  `).all(companyId);
}

function loadTasksByTypes(db, companyId, workflowTypes = []) {
  const types = workflowTypes.map((type) => safeText(type).toUpperCase()).filter(Boolean);
  if (!types.length) return loadTasks(db, companyId, true);
  const placeholders = types.map(() => "?").join(",");
  return db.prepare(`
    SELECT *
    FROM mobile_app_tasks
    WHERE company_id=?
      AND UPPER(COALESCE(workflow_type,'')) IN (${placeholders})
    ORDER BY id DESC
    LIMIT 300
  `).all(companyId, ...types);
}

function loadSessions(db, companyId) {
  return db.prepare(`
    SELECT s.*, d.device_code, d.device_name
    FROM mobile_app_sessions s
    LEFT JOIN mobile_app_devices d ON d.id=s.device_id AND d.company_id=s.company_id
    WHERE s.company_id=?
    ORDER BY s.id DESC
    LIMIT 300
  `).all(companyId);
}

function stats(db, companyId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM mobile_app_devices WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS activeDevices,
      (SELECT COUNT(*) FROM mobile_app_workflows WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS activeWorkflows,
      (SELECT COUNT(*) FROM mobile_app_tasks WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('FINALIZAT','ANULAT')) AS openTasks,
      (SELECT COUNT(*) FROM mobile_app_sessions WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIVA') AS activeSessions
  `).get(companyId, companyId, companyId, companyId) || {};
}

function clientDataStats(db, companyId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM clients WHERE company_id=? AND COALESCE(inactive,0)=0) AS clients,
      (SELECT COUNT(*) FROM facturi WHERE company_id=?) AS invoices,
      (SELECT COUNT(*) FROM inventory_stock_items WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS stockItems
  `).get(companyId, companyId, companyId) || {};
}

function boolFrom(value, fallback = 1) {
  const raw = safeText(value);
  if (raw === "0") return 0;
  if (raw === "1") return 1;
  return fallback;
}

export function registerMobileAppsRoutes(app, { db, requireAuth }) {
  app.get("/nexora/mobile-apps", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraMobileAppsHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: stats(db, companyId),
      tasks: loadTasks(db, companyId, true).slice(0, 8),
      devices: loadDevices(db, companyId).slice(0, 8),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  const taskFlowPages = [
    {
      path: "/nexora/mobile-apps/sales-agents",
      title: "Aplicație mobilă agenți vânzări",
      types: ["AGENTI_VANZARI", "COMENZI_RAPIDE"],
      intro: "Task-uri pentru agenți: vizite, comenzi rapide, consultare clienți, facturi și stocuri."
    },
    {
      path: "/nexora/mobile-apps/technicians",
      title: "Aplicație tehnicieni / intervenții",
      types: ["INTERVENTII"],
      intro: "Intervenții pe teren, poze, semnături, status lucrare și observații."
    },
    {
      path: "/nexora/mobile-apps/scanning",
      title: "Scanare coduri bare / QR",
      types: ["INVENTARIERE", "RECEPTIE_MARFA", "SCANARE_QR"],
      intro: "Fluxuri mobile pentru scanare produse, loturi, active, recepții și inventariere."
    },
    {
      path: "/nexora/mobile-apps/approvals",
      title: "Aprobări documente",
      types: ["APROBARE_MANAGER"],
      intro: "Task-uri de aprobare pentru documente, achiziții, discounturi sau operațiuni interne."
    },
    {
      path: "/nexora/mobile-apps/field-proof",
      title: "Poze & semnături teren",
      types: ["INTERVENTII", "DOVADA_TEREN"],
      intro: "Dovezi operaționale din teren: poze, semnături, confirmări și observații."
    },
    {
      path: "/nexora/mobile-apps/time-location",
      title: "Pontaj / geolocație",
      types: ["PONTAJ"],
      intro: "Pontaj mobil și locație opțională pentru echipe mobile, doar unde politica firmei permite."
    },
    {
      path: "/nexora/mobile-apps/quick-orders",
      title: "Comenzi rapide",
      types: ["COMENZI_RAPIDE", "AGENTI_VANZARI"],
      intro: "Comenzi rapide pe mobil pentru agenți, operatori sau echipe Horeca."
    },
    {
      path: "/nexora/mobile-apps/mobile-inventory",
      title: "Inventar mobil",
      types: ["INVENTARIERE", "RECEPTIE_MARFA", "SCANARE_QR"],
      intro: "Inventariere pe telefon, recepție marfă, verificare stoc și scanare coduri."
    }
  ];

  for (const page of taskFlowPages) {
    app.get(page.path, requireAuth, (req, res) => {
      const companyId = companyIdFrom(req);
      return res.type("html").send(renderNexoraMobileTasksPage({
        companyName: req.session.user.company_name || "",
        user: req.session.user,
        title: page.title,
        activePath: page.path,
        intro: page.intro,
        rows: loadTasksByTypes(db, companyId, page.types),
        ok: safeText(req.query?.ok),
        err: safeText(req.query?.err)
      }));
    });
  }

  app.get("/nexora/mobile-apps/manager", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const currentStats = stats(db, companyId);
    return res.type("html").send(renderNexoraMobileOperationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Manager dashboard mobil",
      activePath: "/nexora/mobile-apps/manager",
      description: "Vedere compactă pentru manageri: dispozitive, fluxuri, task-uri și sesiuni active.",
      actionsHtml: `<a class="nx-btn primary" href="/nexora/mobile-apps/tasks">Task-uri</a><a class="nx-btn" href="/nexora-dashboard">Dashboard ERP</a>`,
      cards: [
        { icon: "D", label: "Dispozitive active", value: currentStats.activeDevices || 0, tone: "blue" },
        { icon: "F", label: "Fluxuri active", value: currentStats.activeWorkflows || 0, tone: "green" },
        { icon: "T", label: "Task-uri deschise", value: currentStats.openTasks || 0, tone: "orange" },
        { icon: "S", label: "Sesiuni active", value: currentStats.activeSessions || 0, tone: "purple" }
      ]
    }));
  });

  app.get("/nexora/mobile-apps/push", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadWorkflows(db, companyId).filter((row) => ["ACTIV", "PAUZAT"].includes(String(row.status || "").toUpperCase()));
    return res.type("html").send(renderNexoraMobileOperationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Notificări push",
      activePath: "/nexora/mobile-apps/push",
      description: "Centru pentru notificări operaționale către dispozitive. Trimiterea push live se leagă ulterior de providerul ales.",
      actionsHtml: `<a class="nx-btn primary" href="/nexora/mobile-apps/workflows">Configurează flux</a>`,
      cards: [
        { icon: "P", label: "Fluxuri notificabile", value: rows.length, tone: "blue" },
        { icon: "A", label: "Dispozitive active", value: stats(db, companyId).activeDevices || 0, tone: "green" }
      ],
      columns: [
        { label: "Flux", key: "workflow_name" },
        { label: "Tip", key: "workflow_type" },
        { label: "Rol", key: "target_role" },
        { label: "Status", key: "status" },
        { label: "Note", key: "notes" }
      ],
      rows,
      empty: "Nu există fluxuri pentru notificări."
    }));
  });

  app.get("/nexora/mobile-apps/client-data", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const counts = clientDataStats(db, companyId);
    return res.type("html").send(renderNexoraMobileOperationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Clienți / facturi / stocuri",
      activePath: "/nexora/mobile-apps/client-data",
      description: "Punct mobil de consultare pentru agenți și manageri: clienți, facturi și stocuri.",
      actionsHtml: `<a class="nx-btn" href="/nexora/clients">Clienți</a><a class="nx-btn" href="/nexora/facturi">Facturi</a><a class="nx-btn primary" href="/nexora/inventory">Stocuri</a>`,
      cards: [
        { icon: "C", label: "Clienți activi", value: counts.clients || 0, tone: "blue" },
        { icon: "F", label: "Facturi", value: counts.invoices || 0, tone: "green" },
        { icon: "S", label: "Articole stoc", value: counts.stockItems || 0, tone: "orange" }
      ]
    }));
  });

  app.get("/nexora/mobile-apps/devices", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraMobileDevicesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadDevices(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/mobile-apps/devices/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const deviceName = safeText(req.body?.device_name);
    if (!deviceName) return res.redirect("/nexora/mobile-apps/devices?err=required");
    const generatedCode = nextNumber(db, companyId, "mobile_app_devices", "device_code", "MOB");
    const deviceCode = safeText(req.body?.device_code) || `${slugCode(deviceName).slice(0, 8)}-${generatedCode.split("-").pop()}`;
    db.prepare(`
      INSERT INTO mobile_app_devices (
        company_id, device_code, device_name, device_type, assigned_role,
        pin_label, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      deviceCode,
      deviceName,
      safeText(req.body?.device_type) || "Telefon",
      safeText(req.body?.assigned_role) || "Ospătar",
      safeText(req.body?.pin_label),
      safeText(req.body?.status) || "ACTIV",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/mobile-apps/devices?ok=created");
  });

  app.post("/nexora/mobile-apps/devices/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["ACTIV", "PAUZAT", "BLOCAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/mobile-apps/devices?err=invalid");
    db.prepare("UPDATE mobile_app_devices SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/mobile-apps/devices?ok=status");
  });

  app.get("/nexora/mobile-apps/workflows", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraMobileWorkflowsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadWorkflows(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/mobile-apps/workflows/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const workflowName = safeText(req.body?.workflow_name);
    if (!workflowName) return res.redirect("/nexora/mobile-apps/workflows?err=required");
    const generatedCode = nextNumber(db, companyId, "mobile_app_workflows", "workflow_code", "WFM");
    const workflowCode = safeText(req.body?.workflow_code) || `${slugCode(workflowName).slice(0, 8)}-${generatedCode.split("-").pop()}`;
    db.prepare(`
      INSERT INTO mobile_app_workflows (
        company_id, workflow_code, workflow_name, workflow_type, target_role,
        offline_enabled, requires_pin, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      workflowCode,
      workflowName,
      safeText(req.body?.workflow_type) || "COMENZI_SALA",
      safeText(req.body?.target_role) || "Ospătar",
      boolFrom(req.body?.offline_enabled, 1),
      boolFrom(req.body?.requires_pin, 1),
      safeText(req.body?.status) || "ACTIV",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/mobile-apps/workflows?ok=created");
  });

  app.post("/nexora/mobile-apps/workflows/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["ACTIV", "PAUZAT", "BLOCAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/mobile-apps/workflows?err=invalid");
    db.prepare("UPDATE mobile_app_workflows SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/mobile-apps/workflows?ok=status");
  });

  app.get("/nexora/mobile-apps/tasks", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraMobileTasksPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadTasks(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/mobile-apps/tasks/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const title = safeText(req.body?.title);
    if (!title) return res.redirect("/nexora/mobile-apps/tasks?err=required");
    const taskNumber = nextNumber(db, companyId, "mobile_app_tasks", "task_number", "MTK");
    db.prepare(`
      INSERT INTO mobile_app_tasks (
        company_id, task_number, workflow_type, title, location, assigned_role,
        due_date, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      taskNumber,
      safeText(req.body?.workflow_type) || "INVENTARIERE",
      title,
      safeText(req.body?.location),
      safeText(req.body?.assigned_role) || "Operator",
      parseDate(req.body?.due_date),
      safeText(req.body?.status) || "DESCHIS",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/mobile-apps/tasks?ok=created");
  });

  app.post("/nexora/mobile-apps/tasks/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["DESCHIS", "PLANIFICAT", "IN_LUCRU", "FINALIZAT", "ANULAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/mobile-apps/tasks?err=invalid");
    db.prepare("UPDATE mobile_app_tasks SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/mobile-apps/tasks?ok=status");
  });

  app.get("/nexora/mobile-apps/sessions", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraMobileSessionsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadSessions(db, companyId),
      devices: loadDevices(db, companyId, true),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/mobile-apps/sessions/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const sessionNumber = nextNumber(db, companyId, "mobile_app_sessions", "session_number", "MSE");
    db.prepare(`
      INSERT INTO mobile_app_sessions (
        company_id, session_number, device_id, user_email, status,
        notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      sessionNumber,
      Number(req.body?.device_id || 0) || null,
      safeText(req.body?.user_email),
      safeText(req.body?.status) || "ACTIVA",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    if (Number(req.body?.device_id || 0)) {
      db.prepare("UPDATE mobile_app_devices SET last_seen_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND company_id=?").run(Number(req.body.device_id), companyId);
    }
    return res.redirect("/nexora/mobile-apps/sessions?ok=created");
  });

  app.post("/nexora/mobile-apps/sessions/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["ACTIVA", "PAUZAT", "INCHISA"]);
    if (!allowed.has(status)) return res.redirect("/nexora/mobile-apps/sessions?err=invalid");
    db.prepare(`
      UPDATE mobile_app_sessions
      SET status=?,
          closed_at=CASE WHEN ?='INCHISA' THEN datetime('now') ELSE closed_at END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, status, Number(req.params.id), companyId);
    return res.redirect("/nexora/mobile-apps/sessions?ok=status");
  });
}
