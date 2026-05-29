import fs from "fs";
import path from "path";
import multer from "multer";
import {
  renderContractsPage,
  renderDashboardPage,
  renderDocumentsPage,
  renderInvoicesPage,
  renderMessagesPage,
  renderOffersPage,
  renderProjectDetailPage,
  renderProjectsPage,
  renderTasksPage,
  renderTicketDetailPage,
  renderTicketsPage
} from "../src/ui/nexora-client-portal-pages.js";

const TICKET_CATEGORIES = new Set(["GENERAL", "PROIECT", "DOCUMENTE", "FINANCIAR", "BUG"]);
const PRIORITIES = new Set(["SCAZUTA", "MEDIE", "RIDICATA", "URGENTA"]);
const UPLOAD_CATEGORIES = new Set(["DOCUMENT", "CONTRACT", "OFERTA", "FACTURA", "SUPORT", "LIVRABIL", "ALTELE"]);

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = safeText(value).toUpperCase().replace(/\s+/g, "_");
  return allowed.has(normalized) ? normalized : fallback;
}

function safeFileName(value = "document") {
  return path.basename(safeText(value) || "document")
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

function roleIsClient(user = {}) {
  return String(user.role || "").trim().toLowerCase() === "client";
}

function requireClientPortal(req, res, next) {
  if (!roleIsClient(req.session?.user)) return res.status(403).send("Forbidden");
  return next();
}

function portalContext(db, req, res) {
  const user = req.session?.user || {};
  const companyId = Number(user.company_id || 0);
  const clientId = Number(user.client_id || 0);
  if (!companyId || !clientId) {
    res.status(403).send("Contul client nu este asociat unei fișe de client.");
    return null;
  }

  const client = db.prepare(`
    SELECT id, name, cui, address, email, phone
    FROM clients
    WHERE id=? AND company_id=?
  `).get(clientId, companyId);

  if (!client) {
    res.status(403).send("Clientul asociat contului nu există.");
    return null;
  }

  return {
    user,
    companyId,
    clientId: Number(client.id),
    client,
    companyName: user.company_name || "Nexora"
  };
}

function logActivity(db, req, ctx, { action, entityType, entityId = null, metadata = {} }) {
  try {
    db.prepare(`
      INSERT INTO activity_logs (
        company_id, client_id, user_id, actor_email, actor_role, action,
        entity_type, entity_id, metadata_json, ip_address, user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ctx.companyId,
      ctx.clientId,
      Number(ctx.user.id || 0) || null,
      safeText(ctx.user.email),
      safeText(ctx.user.role),
      action,
      entityType || null,
      Number(entityId || 0) || null,
      JSON.stringify(metadata || {}),
      safeText(req.ip || req.headers?.["x-forwarded-for"]),
      safeText(req.headers?.["user-agent"])
    );
  } catch (error) {
    console.warn("client portal activity log failed:", error?.message || error);
  }
}

function nextTicketNumber(db, companyId) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT seq
    FROM client_portal_tickets
    WHERE company_id=? AND year=?
    ORDER BY seq DESC
    LIMIT 1
  `).get(companyId, year);
  const seq = Number(row?.seq || 0) + 1;
  return { year, seq, ticketNumber: `TCK-${year}-${String(seq).padStart(4, "0")}` };
}

function getProject(db, ctx, projectId) {
  return db.prepare(`
    SELECT *
    FROM projects
    WHERE id=? AND company_id=? AND client_id=?
  `).get(Number(projectId || 0), ctx.companyId, ctx.clientId) || null;
}

function getTask(db, ctx, taskId) {
  return db.prepare(`
    SELECT t.*, p.title AS project_title
    FROM project_tasks t
    JOIN projects p ON p.id=t.project_id AND p.company_id=t.company_id
    WHERE t.id=? AND t.company_id=? AND p.client_id=?
  `).get(Number(taskId || 0), ctx.companyId, ctx.clientId) || null;
}

function getTicket(db, ctx, ticketId) {
  return db.prepare(`
    SELECT *
    FROM client_portal_tickets
    WHERE id=? AND company_id=? AND client_id=?
  `).get(Number(ticketId || 0), ctx.companyId, ctx.clientId) || null;
}

function appDocumentPath(fsLib, pathLib, appRoot, relativePath = "") {
  const normalized = safeText(relativePath).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized) return "";

  const allowedPrefixes = ["contracts/", "uploads/", "public/uploads/"];
  if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) return "";

  const root = pathLib.resolve(appRoot);
  const publicRoot = pathLib.resolve(pathLib.join(appRoot, "public"));
  const candidates = normalized.startsWith("uploads/")
    ? [pathLib.resolve(pathLib.join(publicRoot, normalized)), pathLib.resolve(pathLib.join(root, normalized))]
    : [pathLib.resolve(pathLib.join(root, normalized)), pathLib.resolve(pathLib.join(publicRoot, normalized))];

  return candidates.find((candidate) =>
    (candidate === root || candidate.startsWith(root + pathLib.sep)) && fsLib.existsSync(candidate)
  ) || "";
}

function clientFilePath(fsLib, pathLib, appRoot, companyId, clientId, storedPath = "") {
  const expectedPrefix = `company-${Number(companyId || 0)}/client-${Number(clientId || 0)}/`;
  const normalized = safeText(storedPath).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized.startsWith(expectedPrefix)) return "";
  const root = pathLib.resolve(pathLib.join(appRoot, "uploads", "client-files"));
  const absolute = pathLib.resolve(root, normalized);
  return absolute.startsWith(root + pathLib.sep) && fsLib.existsSync(absolute) ? absolute : "";
}

function projectFilePath(fsLib, pathLib, appRoot, companyId, projectId, storedPath = "") {
  const expectedPrefix = `company-${Number(companyId || 0)}/project-${Number(projectId || 0)}/`;
  const normalized = safeText(storedPath).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized.startsWith(expectedPrefix)) return "";
  const root = pathLib.resolve(pathLib.join(appRoot, "uploads", "projects"));
  const absolute = pathLib.resolve(root, normalized);
  return absolute.startsWith(root + pathLib.sep) && fsLib.existsSync(absolute) ? absolute : "";
}

function portalUploadPath(fsLib, pathLib, appRoot, companyId, clientId, storedPath = "") {
  const expectedPrefix = `company-${Number(companyId || 0)}/client-${Number(clientId || 0)}/`;
  const normalized = safeText(storedPath).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized.startsWith(expectedPrefix)) return "";
  const root = pathLib.resolve(pathLib.join(appRoot, "uploads", "client-portal"));
  const absolute = pathLib.resolve(root, normalized);
  return absolute.startsWith(root + pathLib.sep) && fsLib.existsSync(absolute) ? absolute : "";
}

function sendDownload(res, absolutePath, fileName) {
  if (!absolutePath) return res.status(404).send("Fișierul nu a fost găsit.");
  return res.download(absolutePath, safeFileName(fileName || "document"));
}

function collectDocuments(db, ctx) {
  const documents = [];

  db.prepare(`
    SELECT id, title, category, original_file_name, created_at
    FROM client_portal_uploads
    WHERE company_id=? AND client_id=?
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "client_upload",
    category: row.category || "DOCUMENT",
    title: row.title,
    kind: "Upload client",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/uploads/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, title, category, original_file_name, created_at
    FROM dms_client_files
    WHERE company_id=? AND client_id=? AND archived_at IS NULL
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "dms",
    category: row.category || "ALTELE",
    title: row.title,
    kind: "Fișier intern",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/dms-files/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, contract_number, pdf_path, created_at
    FROM contracts
    WHERE company_id=? AND client_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "contract",
    category: "CONTRACTE",
    title: `Contract ${row.contract_number}`,
    kind: "Contract",
    fileName: `${row.contract_number}.pdf`,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/contracts/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, quote_number, title, pdf_path, created_at
    FROM quotes
    WHERE company_id=? AND client_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "offer",
    category: "OFERTE",
    title: row.title || `Ofertă ${row.quote_number}`,
    kind: "Ofertă",
    fileName: `${row.quote_number}.pdf`,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/offers/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, factura_nr, pdf_path, created_at
    FROM facturi
    WHERE company_id=? AND client_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "invoice",
    category: "FACTURI",
    title: `Factură ${row.factura_nr}`,
    kind: "Factură",
    fileName: `${row.factura_nr}.pdf`,
    createdAt: row.created_at,
    downloadHref: `/client-portal/invoices/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, title, category, file_name, created_at
    FROM tipizate_docs
    WHERE company_id=? AND client_id=? AND TRIM(COALESCE(file_path,'')) <> ''
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "tipizat",
    category: row.category || "TIPIZATE",
    title: row.title,
    kind: "Tipizat",
    fileName: row.file_name,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/tipizate/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, title, output_file_name, created_at
    FROM dms_autofill_documents
    WHERE company_id=? AND client_id=? AND TRIM(COALESCE(output_file_path,'')) <> ''
    ORDER BY id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "autofill",
    category: "FORMULARE",
    title: row.title,
    kind: "Formular completat",
    fileName: row.output_file_name,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/autofill/${row.id}/download`
  }));

  db.prepare(`
    SELECT pf.id, pf.project_id, pf.original_file_name, pf.category, pf.created_at, p.title AS project_title
    FROM project_files pf
    JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id
    WHERE pf.company_id=? AND p.client_id=?
    ORDER BY pf.id DESC
  `).all(ctx.companyId, ctx.clientId).forEach((row) => documents.push({
    source: "project_file",
    category: "PROIECTE",
    title: row.project_title || row.original_file_name,
    kind: "Fișier proiect",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    downloadHref: `/client-portal/documents/project-files/${row.project_id}/${row.id}/download`
  }));

  return documents.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function insertComment(db, req, ctx, payload = {}) {
  const body = safeText(payload.body);
  if (!body) return null;
  const result = db.prepare(`
    INSERT INTO client_portal_comments (
      company_id, client_id, ticket_id, project_id, task_id, entity_type, entity_id,
      body, visibility, author_user_id, author_email, author_role
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CLIENT', ?, ?, ?)
  `).run(
    ctx.companyId,
    ctx.clientId,
    payload.ticketId || null,
    payload.projectId || null,
    payload.taskId || null,
    payload.entityType || "MESSAGE",
    payload.entityId || null,
    body,
    Number(ctx.user.id || 0) || null,
    safeText(ctx.user.email),
    safeText(ctx.user.role)
  );
  logActivity(db, req, ctx, {
    action: "client_comment_created",
    entityType: payload.entityType || "MESSAGE",
    entityId: payload.entityId || result.lastInsertRowid,
    metadata: { comment_id: result.lastInsertRowid }
  });
  return Number(result.lastInsertRowid);
}

function resolveUploadAssociations(db, ctx, body = {}) {
  const ticketId = Number(body.ticket_id || 0) || null;
  const projectId = Number(body.project_id || 0) || null;
  const taskId = Number(body.task_id || 0) || null;

  let ticket = null;
  let project = null;
  let task = null;

  if (ticketId) {
    ticket = getTicket(db, ctx, ticketId);
    if (!ticket) return { ok: false, message: "Ticket invalid." };
  }
  if (projectId) {
    project = getProject(db, ctx, projectId);
    if (!project) return { ok: false, message: "Proiect invalid." };
  }
  if (taskId) {
    task = getTask(db, ctx, taskId);
    if (!task) return { ok: false, message: "Task invalid." };
    if (projectId && Number(task.project_id) !== Number(projectId)) {
      return { ok: false, message: "Task-ul nu aparține proiectului selectat." };
    }
    if (!project) project = getProject(db, ctx, task.project_id);
  }

  return {
    ok: true,
    ticketId: ticket?.id || null,
    projectId: project?.id || null,
    taskId: task?.id || null
  };
}

function handleUpload({ db, req, res, ctx, file, fsLib, pathLib, appRoot, redirectTo, ticketId = null }) {
  if (!file) return res.redirect(`${redirectTo}?err=no_file`);
  const body = { ...req.body };
  if (ticketId) body.ticket_id = String(ticketId);
  const association = resolveUploadAssociations(db, ctx, body);
  if (!association.ok) {
    try { fsLib.unlinkSync(file.path); } catch {}
    return res.status(400).send(association.message);
  }

  const title = safeText(req.body?.title) || decodeUploadedFileName(file.originalname, "document");
  const category = normalizeChoice(req.body?.category, UPLOAD_CATEGORIES, ticketId ? "SUPORT" : "DOCUMENT");
  const originalName = decodeUploadedFileName(file.originalname, "document");
  const safeOriginal = safeFileName(originalName);
  const storedName = `${Date.now()}-${Math.round(Math.random() * 9999)}-${safeOriginal}`;
  const relativePath = `company-${ctx.companyId}/client-${ctx.clientId}/${storedName}`;
  const directory = pathLib.join(appRoot, "uploads", "client-portal", `company-${ctx.companyId}`, `client-${ctx.clientId}`);
  const destination = pathLib.join(directory, storedName);

  try {
    fsLib.mkdirSync(directory, { recursive: true });
    fsLib.renameSync(file.path, destination);
    const result = db.prepare(`
      INSERT INTO client_portal_uploads (
        company_id, client_id, ticket_id, project_id, task_id, title, category,
        original_file_name, stored_file_name, stored_path, mime_type, file_size,
        uploaded_by_user_id, uploaded_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ctx.companyId,
      ctx.clientId,
      association.ticketId,
      association.projectId,
      association.taskId,
      title,
      category,
      originalName,
      storedName,
      relativePath,
      safeText(file.mimetype || "application/octet-stream"),
      Number(file.size || 0),
      Number(ctx.user.id || 0) || null,
      safeText(ctx.user.email)
    );
    logActivity(db, req, ctx, {
      action: "client_document_uploaded",
      entityType: "UPLOAD",
      entityId: result.lastInsertRowid,
      metadata: { title, category, ticket_id: association.ticketId, project_id: association.projectId, task_id: association.taskId }
    });
    return res.redirect(`${redirectTo}?ok=uploaded`);
  } catch (error) {
    console.error("client portal upload failed:", error);
    try { if (fsLib.existsSync(file.path)) fsLib.unlinkSync(file.path); } catch {}
    try { if (fsLib.existsSync(destination)) fsLib.unlinkSync(destination); } catch {}
    return res.redirect(`${redirectTo}?err=upload`);
  }
}

export function registerClientPortalRoutes(app, deps = {}) {
  const db = deps.db;
  const requireAuth = deps.requireAuth;
  const fsLib = deps.fs || fs;
  const pathLib = deps.path || path;
  const appRoot = deps.__dirname || process.cwd();
  const upload = deps.upload || multer({ dest: "uploads/", limits: { fileSize: 30 * 1024 * 1024 } });

  app.get("/client-portal", requireAuth, requireClientPortal, (req, res) => {
    res.redirect("/client-portal/dashboard");
  });

  app.get("/nexora/client-portal", requireAuth, requireClientPortal, (req, res) => {
    res.redirect("/client-portal/dashboard");
  });

  app.get("/nexora/client-portal/projects/:id", requireAuth, requireClientPortal, (req, res) => {
    res.redirect(`/client-portal/projects/${Number(req.params.id || 0)}`);
  });

  app.get("/client-portal/dashboard", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;

    const stats = {
      projects: db.prepare("SELECT COUNT(*) AS n FROM projects WHERE company_id=? AND client_id=?").get(ctx.companyId, ctx.clientId)?.n || 0,
      activeProjects: db.prepare(`
        SELECT COUNT(*) AS n FROM projects
        WHERE company_id=? AND client_id=? AND status IN ('ACTIV','IN_REVIZUIRE','PLANIFICARE')
      `).get(ctx.companyId, ctx.clientId)?.n || 0,
      openTasks: db.prepare(`
        SELECT COUNT(*) AS n
        FROM project_tasks t
        JOIN projects p ON p.id=t.project_id AND p.company_id=t.company_id
        WHERE t.company_id=? AND p.client_id=? AND UPPER(COALESCE(t.status,'')) <> 'FINALIZAT'
      `).get(ctx.companyId, ctx.clientId)?.n || 0,
      openOffers: db.prepare(`
        SELECT COUNT(*) AS n
        FROM quotes
        WHERE company_id=? AND client_id=? AND UPPER(COALESCE(status,'')) NOT IN ('ACCEPTED','ACCEPTATA','REJECTED','RESPINSA')
      `).get(ctx.companyId, ctx.clientId)?.n || 0,
      openTickets: db.prepare(`
        SELECT COUNT(*) AS n
        FROM client_portal_tickets
        WHERE company_id=? AND client_id=? AND UPPER(COALESCE(status,'')) NOT IN ('REZOLVAT','INCHIS')
      `).get(ctx.companyId, ctx.clientId)?.n || 0
    };
    const recentProjects = db.prepare(`
      SELECT id, project_code, title, status, progress, due_date
      FROM projects
      WHERE company_id=? AND client_id=?
      ORDER BY updated_at DESC, id DESC
      LIMIT 5
    `).all(ctx.companyId, ctx.clientId);
    const recentTasks = db.prepare(`
      SELECT t.id, t.project_id, t.title, t.status, t.due_date, p.title AS project_title
      FROM project_tasks t
      JOIN projects p ON p.id=t.project_id AND p.company_id=t.company_id
      WHERE t.company_id=? AND p.client_id=? AND UPPER(COALESCE(t.status,'')) <> 'FINALIZAT'
      ORDER BY COALESCE(t.due_date,'9999-12-31') ASC, t.id DESC
      LIMIT 6
    `).all(ctx.companyId, ctx.clientId);
    const recentOffers = db.prepare(`
      SELECT id, quote_number, title, status, total, currency, created_at
      FROM quotes
      WHERE company_id=? AND client_id=?
      ORDER BY id DESC
      LIMIT 5
    `).all(ctx.companyId, ctx.clientId);

    res.type("html").send(renderDashboardPage({
      user: ctx.user,
      companyName: ctx.companyName,
      client: ctx.client,
      stats,
      recentProjects,
      recentTasks,
      recentOffers,
      recentDocuments: collectDocuments(db, ctx).slice(0, 5)
    }));
  });

  app.get("/client-portal/projects", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const projects = db.prepare(`
      SELECT id, project_code, title, manager_name, status, priority, progress, start_date, due_date, updated_at
      FROM projects
      WHERE company_id=? AND client_id=?
      ORDER BY updated_at DESC, id DESC
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderProjectsPage({ user: ctx.user, companyName: ctx.companyName, client: ctx.client, projects }));
  });

  app.get("/client-portal/projects/:id", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const project = getProject(db, ctx, req.params.id);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const tasks = db.prepare(`
      SELECT id, title, description, assignee, priority, status, due_date, completed_at, created_at
      FROM project_tasks
      WHERE company_id=? AND project_id=?
      ORDER BY COALESCE(due_date,'9999-12-31') ASC, id DESC
    `).all(ctx.companyId, project.id);
    const milestones = db.prepare(`
      SELECT id, title, due_date, status, notes, completed_at, created_at
      FROM project_milestones
      WHERE company_id=? AND project_id=?
      ORDER BY COALESCE(due_date,'9999-12-31') ASC, id DESC
    `).all(ctx.companyId, project.id);
    const files = db.prepare(`
      SELECT id, original_file_name, stored_file_name, stored_path, mime_type, file_size, category, notes, uploaded_by_email, created_at
      FROM project_files
      WHERE company_id=? AND project_id=?
      ORDER BY id DESC
    `).all(ctx.companyId, project.id);
    res.type("html").send(renderProjectDetailPage({ user: ctx.user, companyName: ctx.companyName, client: ctx.client, project, tasks, milestones, files }));
  });

  app.get("/client-portal/tasks", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const tasks = db.prepare(`
      SELECT t.id, t.project_id, t.title, t.description, t.assignee, t.priority, t.status, t.due_date, t.completed_at,
             p.title AS project_title
      FROM project_tasks t
      JOIN projects p ON p.id=t.project_id AND p.company_id=t.company_id
      WHERE t.company_id=? AND p.client_id=?
      ORDER BY CASE WHEN UPPER(COALESCE(t.status,''))='FINALIZAT' THEN 1 ELSE 0 END,
               COALESCE(t.due_date,'9999-12-31') ASC, t.id DESC
      LIMIT 300
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderTasksPage({ user: ctx.user, companyName: ctx.companyName, client: ctx.client, tasks }));
  });

  app.get("/client-portal/offers", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const offers = db.prepare(`
      SELECT id, quote_number, status, title, notes, currency, total, valid_until, created_at, pdf_path
      FROM quotes
      WHERE company_id=? AND client_id=?
      ORDER BY id DESC
      LIMIT 300
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderOffersPage({
      user: ctx.user,
      companyName: ctx.companyName,
      client: ctx.client,
      offers,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/client-portal/offers/:id/accept", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const offerId = Number(req.params.id || 0);
    const offer = db.prepare(`
      SELECT id, quote_number, status
      FROM quotes
      WHERE id=? AND company_id=? AND client_id=?
    `).get(offerId, ctx.companyId, ctx.clientId);
    if (!offer) return res.status(404).send("Oferta nu a fost găsită.");
    db.prepare("UPDATE quotes SET status='ACCEPTED' WHERE id=? AND company_id=? AND client_id=?")
      .run(offer.id, ctx.companyId, ctx.clientId);
    logActivity(db, req, ctx, {
      action: "client_offer_accepted",
      entityType: "QUOTE",
      entityId: offer.id,
      metadata: { quote_number: offer.quote_number, previous_status: offer.status }
    });
    res.redirect("/client-portal/offers?ok=accepted");
  });

  app.get("/client-portal/contracts", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const contracts = db.prepare(`
      SELECT id, contract_number, service_description, price, duration, created_at, pdf_path
      FROM contracts
      WHERE company_id=? AND client_id=?
      ORDER BY id DESC
      LIMIT 300
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderContractsPage({ user: ctx.user, companyName: ctx.companyName, client: ctx.client, contracts }));
  });

  app.get("/client-portal/invoices", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const invoices = db.prepare(`
      SELECT id, factura_nr, status, moneda, total, data_emitere, scadenta, created_at, pdf_path
      FROM facturi
      WHERE company_id=? AND client_id=?
      ORDER BY data_emitere DESC, id DESC
      LIMIT 300
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderInvoicesPage({ user: ctx.user, companyName: ctx.companyName, client: ctx.client, invoices }));
  });

  app.get("/client-portal/documents", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const projects = db.prepare(`
      SELECT id, project_code, title
      FROM projects
      WHERE company_id=? AND client_id=?
      ORDER BY id DESC
    `).all(ctx.companyId, ctx.clientId);
    const tickets = db.prepare(`
      SELECT id, ticket_number, subject
      FROM client_portal_tickets
      WHERE company_id=? AND client_id=? AND UPPER(COALESCE(status,'')) NOT IN ('REZOLVAT','INCHIS')
      ORDER BY id DESC
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderDocumentsPage({
      user: ctx.user,
      companyName: ctx.companyName,
      client: ctx.client,
      documents: collectDocuments(db, ctx),
      projects,
      tickets,
      ok: safeText(req.query?.ok)
    }));
  });

  app.get("/client-portal/uploads", requireAuth, requireClientPortal, (req, res) => {
    res.redirect("/client-portal/documents");
  });

  app.post("/client-portal/uploads", requireAuth, requireClientPortal, upload.single("file"), (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    return handleUpload({
      db,
      req,
      res,
      ctx,
      file: req.file,
      fsLib,
      pathLib,
      appRoot,
      redirectTo: "/client-portal/documents"
    });
  });

  app.get("/client-portal/tickets", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const tickets = db.prepare(`
      SELECT id, ticket_number, subject, category, priority, status, created_at, updated_at
      FROM client_portal_tickets
      WHERE company_id=? AND client_id=?
      ORDER BY id DESC
      LIMIT 300
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderTicketsPage({
      user: ctx.user,
      companyName: ctx.companyName,
      client: ctx.client,
      tickets,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/client-portal/tickets", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const subject = safeText(req.body?.subject);
    if (!subject) return res.status(400).send("Subiectul este obligatoriu.");
    const category = normalizeChoice(req.body?.category, TICKET_CATEGORIES, "GENERAL");
    const priority = normalizeChoice(req.body?.priority, PRIORITIES, "MEDIE");
    const next = nextTicketNumber(db, ctx.companyId);
    const created = db.transaction(() => {
      const ticketResult = db.prepare(`
        INSERT INTO client_portal_tickets (
          company_id, client_id, year, seq, ticket_number, subject,
          category, priority, status, created_by_user_id, created_by_email
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DESCHIS', ?, ?)
      `).run(
        ctx.companyId,
        ctx.clientId,
        next.year,
        next.seq,
        next.ticketNumber,
        subject,
        category,
        priority,
        Number(ctx.user.id || 0) || null,
        safeText(ctx.user.email)
      );
      const ticketId = Number(ticketResult.lastInsertRowid);
      const body = safeText(req.body?.body);
      if (body) {
        insertComment(db, req, ctx, {
          ticketId,
          entityType: "TICKET",
          entityId: ticketId,
          body
        });
      }
      return ticketId;
    })();
    logActivity(db, req, ctx, {
      action: "client_ticket_created",
      entityType: "TICKET",
      entityId: created,
      metadata: { ticket_number: next.ticketNumber, subject, category, priority }
    });
    res.redirect(`/client-portal/tickets/${created}?ok=created`);
  });

  app.get("/client-portal/tickets/:id", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const ticket = getTicket(db, ctx, req.params.id);
    if (!ticket) return res.status(404).send("Ticketul nu a fost găsit.");
    const comments = db.prepare(`
      SELECT id, body, author_email, author_role, created_at
      FROM client_portal_comments
      WHERE company_id=? AND client_id=? AND ticket_id=?
      ORDER BY id ASC
    `).all(ctx.companyId, ctx.clientId, ticket.id);
    const uploads = db.prepare(`
      SELECT id, title, original_file_name, mime_type, file_size, created_at
      FROM client_portal_uploads
      WHERE company_id=? AND client_id=? AND ticket_id=?
      ORDER BY id DESC
    `).all(ctx.companyId, ctx.clientId, ticket.id);
    res.type("html").send(renderTicketDetailPage({ user: ctx.user, companyName: ctx.companyName, client: ctx.client, ticket, comments, uploads }));
  });

  app.post("/client-portal/tickets/:id/comments", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const ticket = getTicket(db, ctx, req.params.id);
    if (!ticket) return res.status(404).send("Ticketul nu a fost găsit.");
    insertComment(db, req, ctx, {
      ticketId: ticket.id,
      entityType: "TICKET",
      entityId: ticket.id,
      body: req.body?.body
    });
    db.prepare("UPDATE client_portal_tickets SET updated_at=datetime('now') WHERE id=? AND company_id=? AND client_id=?")
      .run(ticket.id, ctx.companyId, ctx.clientId);
    res.redirect(`/client-portal/tickets/${ticket.id}?ok=comment`);
  });

  app.post("/client-portal/tickets/:id/uploads", requireAuth, requireClientPortal, upload.single("file"), (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const ticket = getTicket(db, ctx, req.params.id);
    if (!ticket) {
      if (req.file) { try { fsLib.unlinkSync(req.file.path); } catch {} }
      return res.status(404).send("Ticketul nu a fost găsit.");
    }
    return handleUpload({
      db,
      req,
      res,
      ctx,
      file: req.file,
      fsLib,
      pathLib,
      appRoot,
      redirectTo: `/client-portal/tickets/${ticket.id}`,
      ticketId: ticket.id
    });
  });

  app.get("/client-portal/comments", requireAuth, requireClientPortal, (req, res) => {
    res.redirect("/client-portal/messages");
  });

  app.post("/client-portal/comments", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    let entityType = "MESSAGE";
    let entityId = null;
    let ticketId = null;
    let projectId = null;
    let taskId = null;

    const requestedTicketId = Number(req.body?.ticket_id || 0) || null;
    const requestedProjectId = Number(req.body?.project_id || 0) || null;
    const requestedTaskId = Number(req.body?.task_id || 0) || null;
    if (requestedTicketId) {
      const ticket = getTicket(db, ctx, requestedTicketId);
      if (!ticket) return res.status(404).send("Ticket invalid.");
      ticketId = ticket.id;
      entityType = "TICKET";
      entityId = ticket.id;
    } else if (requestedTaskId) {
      const task = getTask(db, ctx, requestedTaskId);
      if (!task) return res.status(404).send("Task invalid.");
      taskId = task.id;
      projectId = task.project_id;
      entityType = "TASK";
      entityId = task.id;
    } else if (requestedProjectId) {
      const project = getProject(db, ctx, requestedProjectId);
      if (!project) return res.status(404).send("Proiect invalid.");
      projectId = project.id;
      entityType = "PROJECT";
      entityId = project.id;
    }

    const commentId = insertComment(db, req, ctx, {
      ticketId,
      projectId,
      taskId,
      entityType,
      entityId,
      body: req.body?.body
    });
    if (!commentId) return res.status(400).send("Mesajul este obligatoriu.");
    res.redirect("/client-portal/messages?ok=sent");
  });

  app.get("/client-portal/messages", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const comments = db.prepare(`
      SELECT c.id, c.body, c.entity_type, c.entity_id, c.author_email, c.author_role, c.created_at,
             t.ticket_number
      FROM client_portal_comments c
      LEFT JOIN client_portal_tickets t ON t.id=c.ticket_id AND t.company_id=c.company_id
      WHERE c.company_id=? AND c.client_id=?
      ORDER BY c.id DESC
      LIMIT 300
    `).all(ctx.companyId, ctx.clientId);
    res.type("html").send(renderMessagesPage({
      user: ctx.user,
      companyName: ctx.companyName,
      client: ctx.client,
      comments,
      ok: safeText(req.query?.ok)
    }));
  });

  app.get("/client-portal/documents/uploads/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const file = db.prepare(`
      SELECT id, original_file_name, stored_path
      FROM client_portal_uploads
      WHERE id=? AND company_id=? AND client_id=?
    `).get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
    return sendDownload(res, portalUploadPath(fsLib, pathLib, appRoot, ctx.companyId, ctx.clientId, file.stored_path), file.original_file_name);
  });

  app.get("/client-portal/documents/dms-files/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const file = db.prepare(`
      SELECT id, original_file_name, stored_path
      FROM dms_client_files
      WHERE id=? AND company_id=? AND client_id=? AND archived_at IS NULL
    `).get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
    return sendDownload(res, clientFilePath(fsLib, pathLib, appRoot, ctx.companyId, ctx.clientId, file.stored_path), file.original_file_name);
  });

  app.get("/client-portal/documents/contracts/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const row = db.prepare("SELECT contract_number, pdf_path FROM contracts WHERE id=? AND company_id=? AND client_id=?")
      .get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!row) return res.status(404).send("Contractul nu a fost găsit.");
    return sendDownload(res, appDocumentPath(fsLib, pathLib, appRoot, row.pdf_path), `${row.contract_number || "contract"}.pdf`);
  });

  app.get("/client-portal/documents/offers/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const row = db.prepare("SELECT quote_number, pdf_path FROM quotes WHERE id=? AND company_id=? AND client_id=?")
      .get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!row) return res.status(404).send("Oferta nu a fost găsită.");
    return sendDownload(res, appDocumentPath(fsLib, pathLib, appRoot, row.pdf_path), `${row.quote_number || "oferta"}.pdf`);
  });

  app.get("/client-portal/invoices/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const row = db.prepare("SELECT id, factura_nr, pdf_path FROM facturi WHERE id=? AND company_id=? AND client_id=?")
      .get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!row) return res.status(404).send("Factura nu a fost găsită.");
    const absolutePath = appDocumentPath(fsLib, pathLib, appRoot, row.pdf_path);
    if (!absolutePath) return res.status(404).send("Fișierul nu a fost găsit.");
    logActivity(db, req, ctx, {
      action: "client_invoice_downloaded",
      entityType: "INVOICE",
      entityId: row.id,
      metadata: { factura_nr: row.factura_nr }
    });
    return sendDownload(res, absolutePath, `${row.factura_nr || "factura"}.pdf`);
  });

  app.get("/client-portal/documents/tipizate/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const row = db.prepare("SELECT title, file_name, file_path FROM tipizate_docs WHERE id=? AND company_id=? AND client_id=?")
      .get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!row) return res.status(404).send("Documentul nu a fost găsit.");
    return sendDownload(res, appDocumentPath(fsLib, pathLib, appRoot, row.file_path), row.file_name || row.title || "document");
  });

  app.get("/client-portal/documents/autofill/:id/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const row = db.prepare(`
      SELECT title, output_file_name, output_file_path
      FROM dms_autofill_documents
      WHERE id=? AND company_id=? AND client_id=?
    `).get(Number(req.params.id || 0), ctx.companyId, ctx.clientId);
    if (!row) return res.status(404).send("Documentul nu a fost găsit.");
    const root = pathLib.resolve(pathLib.join(appRoot, "uploads", "dms-autofill"));
    const normalized = safeText(row.output_file_path).replaceAll("\\", "/").replace(/^\/+/, "");
    const absolute = pathLib.resolve(root, normalized);
    const safePath = absolute.startsWith(root + pathLib.sep) && fsLib.existsSync(absolute) ? absolute : "";
    return sendDownload(res, safePath, row.output_file_name || row.title || "document");
  });

  app.get("/client-portal/documents/project-files/:projectId/:fileId/download", requireAuth, requireClientPortal, (req, res) => {
    const ctx = portalContext(db, req, res);
    if (!ctx) return;
    const projectId = Number(req.params.projectId || 0);
    const fileId = Number(req.params.fileId || 0);
    const file = db.prepare(`
      SELECT pf.id, pf.project_id, pf.original_file_name, pf.stored_path
      FROM project_files pf
      JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id
      WHERE pf.id=? AND pf.project_id=? AND pf.company_id=? AND p.client_id=?
    `).get(fileId, projectId, ctx.companyId, ctx.clientId);
    if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
    return sendDownload(res, projectFilePath(fsLib, pathLib, appRoot, ctx.companyId, projectId, file.stored_path), file.original_file_name);
  });
}
