import multer from "multer";
import {
  renderNexoraProjectCreatePage,
  renderNexoraProjectDetailPage,
  renderNexoraProjectEditPage,
  renderNexoraProjectsPage,
  renderNexoraProjectTasksPage
} from "../src/ui/nexora-projects-page.js";

const PROJECT_STATUSES = new Set(["PLANIFICARE", "ACTIV", "BLOCAT", "IN_REVIZUIRE", "FINALIZAT", "ANULAT"]);
const TASK_STATUSES = new Set(["DE_FACUT", "IN_LUCRU", "BLOCAT", "FINALIZAT"]);
const MILESTONE_STATUSES = new Set(["PLANIFICAT", "IN_LUCRU", "BLOCAT", "REALIZAT"]);
const PRIORITIES = new Set(["SCAZUTA", "MEDIE", "RIDICATA", "URGENTA"]);
const FILE_CATEGORIES = new Set(["DOCUMENT", "CONTRACT", "LIVRABIL", "OFERTA", "ALTELE"]);
const ALLOWED_FILE_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".png", ".jpg",
  ".jpeg", ".webp", ".zip", ".xml", ".msg", ".eml", ".ppt", ".pptx"
]);

function safeText(value = "") {
  return String(value || "").trim();
}

function parseDate(value = "") {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseMoney(value = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function oneOf(value, values, fallback) {
  const normalized = safeText(value).toUpperCase();
  return values.has(normalized) ? normalized : fallback;
}

function safeFileName(value = "document") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_") || "document";
}

function decodeUploadedFileName(value = "", fallback = "document") {
  const original = safeText(value) || fallback;
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? original : decoded;
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function addActivity(db, companyId, projectId, eventType, subject, details, req) {
  db.prepare(`
    INSERT INTO project_activity (company_id, project_id, event_type, subject, details, actor_email)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    projectId,
    eventType,
    safeText(subject),
    safeText(details),
    safeText(req.session?.user?.email)
  );
}

function getProject(db, projectId, companyId) {
  return db.prepare(`
    SELECT p.*
    FROM projects p
    WHERE p.id=? AND p.company_id=?
  `).get(projectId, companyId);
}

function loadClients(db, companyId) {
  return db.prepare(`
    SELECT id, name, cui
    FROM clients
    WHERE company_id=? AND COALESCE(inactive, 0)=0
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 1000
  `).all(companyId);
}

function resolveClient(db, companyId, payload = {}) {
  const clientId = Number(payload.client_id || 0) || null;
  const client = clientId
    ? db.prepare("SELECT id, name FROM clients WHERE id=? AND company_id=?").get(clientId, companyId)
    : null;
  return {
    clientId: client?.id || null,
    clientName: safeText(payload.client_name) || safeText(client?.name)
  };
}

function nextProjectCode(db, companyId) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare(`
    SELECT COUNT(*) + 1 AS next_seq
    FROM projects
    WHERE company_id=? AND project_code LIKE ?
  `).get(companyId, `PRJ-${year}-%`)?.next_seq || 1);
  let code = "";
  do {
    code = `PRJ-${year}-${String(seq).padStart(4, "0")}`;
    seq += 1;
  } while (db.prepare("SELECT id FROM projects WHERE company_id=? AND project_code=?").get(companyId, code));
  return code;
}

function syncProjectProgress(db, companyId, projectId) {
  const totals = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status='FINALIZAT' THEN 1 ELSE 0 END) AS done
    FROM project_tasks
    WHERE project_id=? AND company_id=?
  `).get(projectId, companyId) || {};
  const total = Number(totals.total || 0);
  const done = Number(totals.done || 0);
  const progress = total ? Math.round((done / total) * 100) : 0;
  db.prepare("UPDATE projects SET progress=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
    .run(progress, projectId, companyId);
  return { total, done, progress };
}

function projectStorageRoot(path, __dirname) {
  return path.resolve(path.join(__dirname, "uploads", "projects"));
}

function projectStorageDirectory(path, __dirname, companyId, projectId) {
  return path.join(projectStorageRoot(path, __dirname), `company-${companyId}`, `project-${projectId}`);
}

function resolveStoredProjectPath(path, __dirname, companyId, projectId, storedPath = "") {
  const prefix = `company-${companyId}/project-${projectId}/`;
  const relative = String(storedPath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!relative.startsWith(prefix)) return "";
  const root = projectStorageRoot(path, __dirname);
  const absolute = path.resolve(path.join(root, relative));
  return absolute.startsWith(root + path.sep) ? absolute : "";
}

function buildProjectsWhere(query, companyId) {
  const q = safeText(query.q);
  const status = oneOf(query.status, PROJECT_STATUSES, "");
  const where = ["p.company_id=?"];
  const params = [companyId];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push("(LOWER(p.project_code) LIKE ? OR LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.client_name,'')) LIKE ? OR LOWER(COALESCE(p.manager_name,'')) LIKE ?)");
    params.push(like, like, like, like);
  }
  if (status) {
    where.push("p.status=?");
    params.push(status);
  }
  return { q, status, whereSql: where.join(" AND "), params };
}

export function registerProjectsRoutes(app, { db, requireAuth, fs, path, __dirname }) {
  const tempDir = path.join(__dirname, "uploads", "project-temp");
  fs.mkdirSync(tempDir, { recursive: true });
  const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });
  function uploadProjectFile(req, res, next) {
    upload.single("file")(req, res, (error) => {
      if (error?.code === "LIMIT_FILE_SIZE") {
        return res.redirect(`/nexora/projects/${Number(req.params.id || 0)}?err=file_size`);
      }
      if (error) return res.status(400).send("Fișierul nu a putut fi încărcat.");
      return next();
    });
  }

  app.get("/nexora/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildProjectsWhere(req.query || {}, companyId);
    const rows = db.prepare(`
      SELECT p.*,
             COUNT(t.id) AS total_tasks,
             SUM(CASE WHEN t.id IS NOT NULL AND t.status <> 'FINALIZAT' THEN 1 ELSE 0 END) AS open_tasks
      FROM projects p
      LEFT JOIN project_tasks t ON t.project_id=p.id AND t.company_id=p.company_id
      WHERE ${filters.whereSql}
      GROUP BY p.id
      ORDER BY
        CASE p.status WHEN 'BLOCAT' THEN 0 WHEN 'ACTIV' THEN 1 WHEN 'PLANIFICARE' THEN 2 ELSE 3 END,
        COALESCE(p.due_date, '9999-12-31') ASC, p.id DESC
      LIMIT 500
    `).all(...filters.params);
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM projects WHERE company_id=?) AS total,
        (SELECT COUNT(*) FROM projects WHERE company_id=? AND status IN ('ACTIV','IN_REVIZUIRE')) AS active,
        (SELECT COUNT(*) FROM project_tasks WHERE company_id=? AND status <> 'FINALIZAT') AS open_tasks,
        (SELECT COUNT(*) FROM project_tasks WHERE company_id=? AND status <> 'FINALIZAT' AND due_date <> '' AND date(due_date) < date('now')) AS overdue_tasks
    `).get(companyId, companyId, companyId, companyId) || {};

    return res.type("html").send(renderNexoraProjectsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      filters,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/projects/new", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    return res.type("html").send(renderNexoraProjectCreatePage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      clients: loadClients(db, companyId),
      nextCode: nextProjectCode(db, companyId),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const title = safeText(req.body?.title);
    if (!title) return res.redirect("/nexora/projects/new?err=required");
    const client = resolveClient(db, companyId, req.body);
    const projectCode = safeText(req.body?.project_code) || nextProjectCode(db, companyId);

    try {
      const result = db.prepare(`
        INSERT INTO projects (
          company_id, project_code, title, client_id, client_name, manager_name,
          description, status, priority, start_date, due_date, budget, currency,
          notes, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PLANIFICARE', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        projectCode,
        title,
        client.clientId,
        client.clientName,
        safeText(req.body?.manager_name),
        safeText(req.body?.description),
        oneOf(req.body?.priority, PRIORITIES, "MEDIE"),
        parseDate(req.body?.start_date),
        parseDate(req.body?.due_date),
        parseMoney(req.body?.budget),
        oneOf(req.body?.currency, new Set(["RON", "EUR", "USD"]), "RON"),
        safeText(req.body?.notes),
        safeText(req.session.user.email)
      );
      const projectId = Number(result.lastInsertRowid);
      addActivity(db, companyId, projectId, "PROJECT_CREATED", "Proiect creat", `${projectCode} · ${title}`, req);
      return res.redirect(`/nexora/projects/${projectId}?ok=created`);
    } catch (error) {
      if (String(error?.code || "").includes("SQLITE_CONSTRAINT")) {
        return res.redirect("/nexora/projects/new?err=duplicate_code");
      }
      return res.status(500).send("Proiectul nu a putut fi creat.");
    }
  });

  app.get("/nexora/projects/tasks", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = safeText(req.query?.q);
    const status = oneOf(req.query?.status, TASK_STATUSES, "");
    const projectId = Number(req.query?.project_id || 0) || 0;
    const where = ["t.company_id=?"];
    const params = [companyId];
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      where.push("(LOWER(t.title) LIKE ? OR LOWER(COALESCE(t.assignee,'')) LIKE ? OR LOWER(p.title) LIKE ?)");
      params.push(like, like, like);
    }
    if (status) {
      where.push("t.status=?");
      params.push(status);
    }
    if (projectId) {
      where.push("t.project_id=?");
      params.push(projectId);
    }
    const tasks = db.prepare(`
      SELECT t.*, p.title AS project_title, p.project_code
      FROM project_tasks t
      JOIN projects p ON p.id=t.project_id AND p.company_id=t.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE t.status WHEN 'BLOCAT' THEN 0 WHEN 'IN_LUCRU' THEN 1 WHEN 'DE_FACUT' THEN 2 ELSE 3 END,
               COALESCE(t.due_date, '9999-12-31') ASC, t.id DESC
      LIMIT 1000
    `).all(...params);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='IN_LUCRU' THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN status='FINALIZAT' THEN 1 ELSE 0 END) AS done,
             SUM(CASE WHEN status <> 'FINALIZAT' AND due_date <> '' AND date(due_date) < date('now') THEN 1 ELSE 0 END) AS overdue
      FROM project_tasks
      WHERE company_id=?
    `).get(companyId) || {};
    const projects = db.prepare("SELECT id, title FROM projects WHERE company_id=? ORDER BY title COLLATE NOCASE").all(companyId);
    return res.type("html").send(renderNexoraProjectTasksPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      tasks,
      stats,
      projects,
      filters: { q, status, projectId },
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/projects/:id/edit", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const project = getProject(db, Number(req.params.id || 0), companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    return res.type("html").send(renderNexoraProjectEditPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      project,
      clients: loadClients(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = getProject(db, projectId, companyId);
    const title = safeText(req.body?.title);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    if (!title) return res.redirect(`/nexora/projects/${projectId}/edit?err=required`);
    const client = resolveClient(db, companyId, req.body);
    const status = oneOf(req.body?.status, PROJECT_STATUSES, project.status || "PLANIFICARE");
    try {
      db.prepare(`
        UPDATE projects
        SET project_code=?, title=?, client_id=?, client_name=?, manager_name=?,
            description=?, status=?, priority=?, start_date=?, due_date=?, budget=?,
            currency=?, notes=?, completed_at=CASE WHEN ?='FINALIZAT' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(
        safeText(req.body?.project_code) || project.project_code,
        title,
        client.clientId,
        client.clientName,
        safeText(req.body?.manager_name),
        safeText(req.body?.description),
        status,
        oneOf(req.body?.priority, PRIORITIES, "MEDIE"),
        parseDate(req.body?.start_date),
        parseDate(req.body?.due_date),
        parseMoney(req.body?.budget),
        oneOf(req.body?.currency, new Set(["RON", "EUR", "USD"]), "RON"),
        safeText(req.body?.notes),
        status,
        projectId,
        companyId
      );
      addActivity(db, companyId, projectId, "PROJECT_UPDATED", "Proiect actualizat", status !== project.status ? `Status: ${status}` : "Date generale actualizate", req);
      return res.redirect(`/nexora/projects/${projectId}?ok=saved`);
    } catch (error) {
      if (String(error?.code || "").includes("SQLITE_CONSTRAINT")) {
        return res.redirect(`/nexora/projects/${projectId}/edit?err=duplicate_code`);
      }
      return res.status(500).send("Proiectul nu a putut fi actualizat.");
    }
  });

  app.post("/nexora/projects/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = getProject(db, projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const status = oneOf(req.body?.status, PROJECT_STATUSES, project.status);
    db.prepare(`
      UPDATE projects
      SET status=?, completed_at=CASE WHEN ?='FINALIZAT' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, status, projectId, companyId);
    addActivity(db, companyId, projectId, "STATUS", `Status proiect: ${status}`, safeText(req.body?.note), req);
    return res.redirect(`/nexora/projects/${projectId}?ok=status`);
  });

  app.get("/nexora/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = getProject(db, projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const tasks = db.prepare("SELECT * FROM project_tasks WHERE project_id=? AND company_id=? ORDER BY CASE status WHEN 'BLOCAT' THEN 0 WHEN 'IN_LUCRU' THEN 1 WHEN 'DE_FACUT' THEN 2 ELSE 3 END, COALESCE(due_date, '9999-12-31'), id DESC").all(projectId, companyId);
    const files = db.prepare("SELECT * FROM project_files WHERE project_id=? AND company_id=? ORDER BY id DESC").all(projectId, companyId)
      .map((file) => ({ ...file, file_size_label: formatFileSize(file.file_size) }));
    const milestones = db.prepare("SELECT * FROM project_milestones WHERE project_id=? AND company_id=? ORDER BY COALESCE(due_date, '9999-12-31'), id DESC").all(projectId, companyId);
    const activities = db.prepare("SELECT * FROM project_activity WHERE project_id=? AND company_id=? ORDER BY id DESC LIMIT 40").all(projectId, companyId);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total_tasks, SUM(CASE WHEN status='FINALIZAT' THEN 1 ELSE 0 END) AS done_tasks
      FROM project_tasks WHERE project_id=? AND company_id=?
    `).get(projectId, companyId) || {};
    return res.type("html").send(renderNexoraProjectDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      project,
      tasks,
      files,
      milestones,
      activities,
      stats,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/projects/:id/tasks", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    if (!getProject(db, projectId, companyId)) return res.status(404).send("Proiectul nu a fost găsit.");
    const title = safeText(req.body?.title);
    if (!title) return res.redirect(`/nexora/projects/${projectId}?err=required`);
    db.prepare(`
      INSERT INTO project_tasks (company_id, project_id, title, description, assignee, priority, status, due_date, created_by_email)
      VALUES (?, ?, ?, ?, ?, ?, 'DE_FACUT', ?, ?)
    `).run(
      companyId,
      projectId,
      title,
      safeText(req.body?.description),
      safeText(req.body?.assignee),
      oneOf(req.body?.priority, PRIORITIES, "MEDIE"),
      parseDate(req.body?.due_date),
      safeText(req.session.user.email)
    );
    syncProjectProgress(db, companyId, projectId);
    addActivity(db, companyId, projectId, "TASK_CREATED", "Task adăugat", title, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=task_created`);
  });

  app.post("/nexora/projects/:projectId/tasks/:taskId/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.projectId || 0);
    const taskId = Number(req.params.taskId || 0);
    const task = db.prepare("SELECT * FROM project_tasks WHERE id=? AND project_id=? AND company_id=?").get(taskId, projectId, companyId);
    if (!task) return res.status(404).send("Task-ul nu a fost găsit.");
    const status = oneOf(req.body?.status, TASK_STATUSES, task.status);
    db.prepare(`
      UPDATE project_tasks
      SET status=?, completed_at=CASE WHEN ?='FINALIZAT' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
          updated_at=datetime('now')
      WHERE id=? AND project_id=? AND company_id=?
    `).run(status, status, taskId, projectId, companyId);
    syncProjectProgress(db, companyId, projectId);
    addActivity(db, companyId, projectId, "TASK_STATUS", `Task ${status.toLowerCase()}`, task.title, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=task_updated`);
  });

  app.post("/nexora/projects/:projectId/tasks/:taskId/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.projectId || 0);
    const taskId = Number(req.params.taskId || 0);
    const task = db.prepare("SELECT title FROM project_tasks WHERE id=? AND project_id=? AND company_id=?").get(taskId, projectId, companyId);
    if (!task) return res.status(404).send("Task-ul nu a fost găsit.");
    db.prepare("DELETE FROM project_tasks WHERE id=? AND project_id=? AND company_id=?").run(taskId, projectId, companyId);
    syncProjectProgress(db, companyId, projectId);
    addActivity(db, companyId, projectId, "TASK_DELETED", "Task șters", task.title, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=task_deleted`);
  });

  app.post("/nexora/projects/:id/milestones", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    if (!getProject(db, projectId, companyId)) return res.status(404).send("Proiectul nu a fost găsit.");
    const title = safeText(req.body?.title);
    if (!title) return res.redirect(`/nexora/projects/${projectId}?err=required`);
    db.prepare(`
      INSERT INTO project_milestones (company_id, project_id, title, due_date, notes, created_by_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, projectId, title, parseDate(req.body?.due_date), safeText(req.body?.notes), safeText(req.session.user.email));
    addActivity(db, companyId, projectId, "MILESTONE_CREATED", "Etapă adăugată", title, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=milestone_created`);
  });

  app.post("/nexora/projects/:projectId/milestones/:milestoneId/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.projectId || 0);
    const milestoneId = Number(req.params.milestoneId || 0);
    const milestone = db.prepare("SELECT title, status FROM project_milestones WHERE id=? AND project_id=? AND company_id=?").get(milestoneId, projectId, companyId);
    if (!milestone) return res.status(404).send("Etapa nu a fost găsită.");
    const status = oneOf(req.body?.status, MILESTONE_STATUSES, milestone.status);
    db.prepare(`
      UPDATE project_milestones
      SET status=?, completed_at=CASE WHEN ?='REALIZAT' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
          updated_at=datetime('now')
      WHERE id=? AND project_id=? AND company_id=?
    `).run(status, status, milestoneId, projectId, companyId);
    addActivity(db, companyId, projectId, "MILESTONE_STATUS", `Etapă: ${status.toLowerCase()}`, milestone.title, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=milestone_updated`);
  });

  app.post("/nexora/projects/:id/files", requireAuth, uploadProjectFile, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = getProject(db, projectId, companyId);
    if (!project) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).send("Proiectul nu a fost găsit.");
    }
    if (!req.file) return res.redirect(`/nexora/projects/${projectId}?err=no_file`);
    const extension = path.extname(String(req.file.originalname || "")).toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
      fs.unlinkSync(req.file.path);
      return res.redirect(`/nexora/projects/${projectId}?err=file_type`);
    }
    const directory = projectStorageDirectory(path, __dirname, companyId, projectId);
    fs.mkdirSync(directory, { recursive: true });
    const incomingName = decodeUploadedFileName(req.file.originalname, `document${extension}`).replaceAll("\\", "/");
    const originalName = path.basename(incomingName).slice(0, 255) || `document${extension}`;
    const storedFileName = `${Date.now()}-${safeFileName(originalName)}`;
    const destination = path.join(directory, storedFileName);
    fs.renameSync(req.file.path, destination);
    const storedPath = `company-${companyId}/project-${projectId}/${storedFileName}`;
    db.prepare(`
      INSERT INTO project_files (
        company_id, project_id, original_file_name, stored_file_name, stored_path,
        mime_type, file_size, category, notes, uploaded_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      projectId,
      originalName,
      storedFileName,
      storedPath,
      safeText(req.file.mimetype),
      Number(req.file.size || 0),
      oneOf(req.body?.category, FILE_CATEGORIES, "DOCUMENT"),
      safeText(req.body?.notes),
      safeText(req.session.user.email)
    );
    addActivity(db, companyId, projectId, "FILE_UPLOADED", "Fișier încărcat", originalName, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=file_uploaded`);
  });

  app.get("/nexora/projects/:projectId/files/:fileId/download", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.projectId || 0);
    const fileId = Number(req.params.fileId || 0);
    const file = db.prepare("SELECT * FROM project_files WHERE id=? AND project_id=? AND company_id=?").get(fileId, projectId, companyId);
    if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
    const absolute = resolveStoredProjectPath(path, __dirname, companyId, projectId, file.stored_path);
    if (!absolute || !fs.existsSync(absolute)) return res.status(404).send("Fișierul nu a fost găsit.");
    return res.download(absolute, file.original_file_name);
  });

  app.post("/nexora/projects/:projectId/files/:fileId/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.projectId || 0);
    const fileId = Number(req.params.fileId || 0);
    const file = db.prepare("SELECT * FROM project_files WHERE id=? AND project_id=? AND company_id=?").get(fileId, projectId, companyId);
    if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
    const absolute = resolveStoredProjectPath(path, __dirname, companyId, projectId, file.stored_path);
    if (absolute && fs.existsSync(absolute)) fs.unlinkSync(absolute);
    db.prepare("DELETE FROM project_files WHERE id=? AND project_id=? AND company_id=?").run(fileId, projectId, companyId);
    addActivity(db, companyId, projectId, "FILE_DELETED", "Fișier șters", file.original_file_name, req);
    return res.redirect(`/nexora/projects/${projectId}?ok=file_deleted`);
  });

  app.post("/nexora/projects/:id/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    if (!getProject(db, projectId, companyId)) return res.status(404).send("Proiectul nu a fost găsit.");
    const directory = projectStorageDirectory(path, __dirname, companyId, projectId);
    if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
    const remove = db.transaction(() => {
      db.prepare("DELETE FROM project_activity WHERE project_id=? AND company_id=?").run(projectId, companyId);
      db.prepare("DELETE FROM project_files WHERE project_id=? AND company_id=?").run(projectId, companyId);
      db.prepare("DELETE FROM project_milestones WHERE project_id=? AND company_id=?").run(projectId, companyId);
      db.prepare("DELETE FROM project_tasks WHERE project_id=? AND company_id=?").run(projectId, companyId);
      db.prepare("DELETE FROM projects WHERE id=? AND company_id=?").run(projectId, companyId);
    });
    remove();
    return res.redirect("/nexora/projects?ok=deleted");
  });
}
