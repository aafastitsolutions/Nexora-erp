import fs from "fs";
import Database from "better-sqlite3";
import { renderQrlabPage } from "../src/ui/nexora-qrlab-pages.js";

const DEFAULT_QRLAB_DB_PATH = "/home/server/uploadapi/qr_lab.db";

function safeText(value = "") {
  return String(value || "").trim();
}

function qrlabDbPath() {
  return process.env.QRLAB_DB_PATH || DEFAULT_QRLAB_DB_PATH;
}

function hasLocalQrlabDb() {
  return fs.existsSync(qrlabDbPath());
}

function openQrlabDb() {
  const dbPath = qrlabDbPath();
  if (!hasLocalQrlabDb()) {
    throw new Error(`QR-Lab DB lipseste: ${dbPath}`);
  }
  const qdb = new Database(dbPath);
  qdb.pragma("busy_timeout = 5000");
  return qdb;
}

function qrlabApiBase() {
  return (process.env.QRLAB_ADMIN_API_BASE || "https://api.qr-lab.ro").replace(/\/+$/, "");
}

function qrlabAdminKey() {
  return safeText(process.env.QRLAB_ADMIN_API_KEY);
}

function canUseQrlabApi() {
  return qrlabAdminKey().length > 0;
}

function isQrlabAdmin(req) {
  const user = req.session?.user || {};
  return Number(user.is_super_admin || 0) === 1 || Number(user.is_company_admin || 0) === 1;
}

function requireQrlabAdmin(req, res, next) {
  if (!req.session?.user?.id) return res.redirect("/login");
  if (!isQrlabAdmin(req)) return res.status(403).send("Forbidden");
  return next();
}

function safeReturnTo(value = "") {
  const target = safeText(value);
  return target.startsWith("/nexora/qr-lab") ? target : "/nexora/qr-lab";
}

function addMonths(date, months) {
  const copy = new Date(date.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function iso(date) {
  return date.toISOString();
}

function ensureQrlabAdminSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS qrlab_admin_grants(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qrlab_user_id INTEGER NOT NULL,
      email TEXT,
      grant_type TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      subscription_status TEXT NOT NULL,
      subscription_period_end TEXT,
      note TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_qrlab_admin_grants_user ON qrlab_admin_grants(qrlab_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_qrlab_admin_grants_created ON qrlab_admin_grants(created_at DESC);
  `);
}

function grantPayload(grantType = "") {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  switch (grantType) {
    case "free_1_month":
      return {
        plan_code: "monthly",
        subscription_status: "active",
        subscription_period_end: iso(addMonths(now, 1)),
        trial_ends_at: null,
        label: "Plan gratuit 1 lună"
      };
    case "free_12_months":
      return {
        plan_code: "annual",
        subscription_status: "active",
        subscription_period_end: iso(addMonths(now, 12)),
        trial_ends_at: null,
        label: "Plan gratuit 12 luni"
      };
    case "free_unlimited":
      return {
        plan_code: "free_unlimited",
        subscription_status: "active",
        subscription_period_end: null,
        trial_ends_at: null,
        label: "Plan gratuit nelimitat"
      };
    case "trial_14":
      return {
        plan_code: "trial",
        subscription_status: "trial",
        subscription_period_end: null,
        trial_ends_at: iso(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)),
        label: "Trial 14 zile"
      };
    case "revoke":
      return {
        plan_code: "trial",
        subscription_status: "inactive",
        subscription_period_end: null,
        trial_ends_at: iso(yesterday),
        label: "Acces revocat"
      };
    default:
      return null;
  }
}

function loadQrlabUsers(qdb) {
  return qdb.prepare(`
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.plan_code,
      u.subscription_status,
      u.subscription_period_end,
      u.role,
      u.trial_ends_at,
      u.stripe_customer_id,
      u.stripe_subscription_id,
      COALESCE(q.qr_count, 0) AS qr_count,
      COALESCE(q.card_count, 0) AS card_count,
      COALESCE(q.scan_count, 0) AS scan_count,
      COALESCE(f.file_count, 0) AS file_count,
      COALESCE(f.file_bytes, 0) AS file_bytes
    FROM users u
    LEFT JOIN (
      SELECT
        user_id,
        COUNT(*) AS qr_count,
        SUM(CASE WHEN type='business_card' THEN 1 ELSE 0 END) AS card_count,
        SUM(COALESCE(scans, 0)) AS scan_count
      FROM qr_codes
      WHERE deleted_at IS NULL
      GROUP BY user_id
    ) q ON q.user_id=u.id
    LEFT JOIN (
      SELECT
        user_id,
        COUNT(*) AS file_count,
        SUM(COALESCE(bytes, 0)) AS file_bytes
      FROM files
      WHERE deleted_at IS NULL
      GROUP BY user_id
    ) f ON f.user_id=u.id
    ORDER BY u.id DESC
  `).all();
}

function qrlabStats(qdb) {
  return qdb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users_total,
      (
        SELECT COUNT(*)
        FROM users
        WHERE role='admin'
           OR plan_code='free_unlimited'
           OR (subscription_status='active' AND (subscription_period_end IS NULL OR subscription_period_end >= datetime('now')))
      ) AS active_users,
      (SELECT COUNT(*) FROM users WHERE subscription_status='trial') AS trial_users,
      (SELECT COUNT(*) FROM users WHERE plan_code='free_unlimited') AS unlimited_users,
      (SELECT COUNT(*) FROM qr_codes WHERE deleted_at IS NULL) AS qr_total,
      (SELECT COUNT(*) FROM qr_codes WHERE deleted_at IS NULL AND type='business_card') AS card_total,
      (SELECT COALESCE(SUM(scans), 0) FROM qr_codes WHERE deleted_at IS NULL) AS scan_total,
      (SELECT COUNT(*) FROM files WHERE deleted_at IS NULL) AS file_total,
      (SELECT COALESCE(SUM(bytes), 0) FROM files WHERE deleted_at IS NULL) AS file_bytes
  `).get();
}

function loadQrlabDataFromDb() {
  const qdb = openQrlabDb();
  try {
    return {
      users: loadQrlabUsers(qdb),
      stats: qrlabStats(qdb),
      sourceLabel: qrlabDbPath()
    };
  } finally {
    qdb.close();
  }
}

async function qrlabAdminFetch(path, options = {}) {
  if (!canUseQrlabApi()) {
    throw new Error("QR-Lab Admin API nu are cheia configurata.");
  }
  const response = await fetch(`${qrlabApiBase()}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "X-QRLAB-Admin-Key": qrlabAdminKey(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`QR-Lab API a raspuns neasteptat: ${response.status}`);
    }
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `QR-Lab API error ${response.status}`);
  }
  return data;
}

async function loadQrlabData() {
  if (hasLocalQrlabDb()) {
    return loadQrlabDataFromDb();
  }
  if (canUseQrlabApi()) {
    const data = await qrlabAdminFetch("/admin/users");
    return {
      users: data.users || [],
      stats: data.stats || {},
      sourceLabel: `API ${qrlabApiBase()}`
    };
  }
  throw new Error(`QR-Lab DB lipseste: ${qrlabDbPath()} si QRLAB_ADMIN_API_KEY nu este configurat.`);
}

function applyQrlabGrantDirect(id, grantType, payload) {
  const qdb = openQrlabDb();
  try {
    const user = qdb.prepare("SELECT id,email FROM users WHERE id=?").get(id);
    if (!user) throw new Error("user_missing");
    qdb.prepare(`
      UPDATE users
      SET plan_code=?,
          subscription_status=?,
          subscription_period_end=?,
          trial_ends_at=?,
          stripe_subscription_id=NULL
      WHERE id=?
    `).run(
      payload.plan_code,
      payload.subscription_status,
      payload.subscription_period_end,
      payload.trial_ends_at,
      id
    );
    return { user, grant: { grant_type: grantType, ...payload }, source: "db" };
  } finally {
    qdb.close();
  }
}

async function applyQrlabGrant(id, grantType, payload) {
  if (hasLocalQrlabDb()) {
    return applyQrlabGrantDirect(id, grantType, payload);
  }
  const data = await qrlabAdminFetch(`/admin/users/${encodeURIComponent(id)}/grant`, {
    method: "POST",
    body: JSON.stringify({ grant_type: grantType })
  });
  return {
    user: data.user || { id },
    grant: data.grant || { grant_type: grantType, ...payload },
    source: "api"
  };
}

function loadGrants(db, limit = 30) {
  ensureQrlabAdminSchema(db);
  return db.prepare(`
    SELECT *
    FROM qrlab_admin_grants
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

async function renderPage(req, res, deps, currentPath) {
  const db = deps.db;
  ensureQrlabAdminSchema(db);
  let users = [];
  let stats = {};
  let err = safeText(req.query?.err);
  let sourceLabel = qrlabDbPath();
  try {
    const data = await loadQrlabData();
    users = data.users;
    stats = data.stats;
    sourceLabel = data.sourceLabel || sourceLabel;
  } catch (error) {
    err = error.message || "Nu pot citi baza QR-Lab.";
  }

  return res.type("html").send(renderQrlabPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    currentPath,
    users,
    stats,
    grants: loadGrants(db, 30),
    dbPath: sourceLabel,
    ok: safeText(req.query?.ok),
    err
  }));
}

export function registerQrlabRoutes(app, deps = {}) {
  const requireAuth = deps.requireAuth;
  const db = deps.db;
  const page = (currentPath) => (req, res, next) => {
    renderPage(req, res, { db }, currentPath).catch(next);
  };

  app.get("/nexora/qr-lab", requireAuth, requireQrlabAdmin, page("/nexora/qr-lab"));
  app.get("/nexora/qr-lab/users", requireAuth, requireQrlabAdmin, page("/nexora/qr-lab/users"));
  app.get("/nexora/qr-lab/grants", requireAuth, requireQrlabAdmin, page("/nexora/qr-lab/grants"));
  app.get("/nexora/qr-lab/stats", requireAuth, requireQrlabAdmin, page("/nexora/qr-lab/stats"));

  app.post("/nexora/qr-lab/users/:id/grant", requireAuth, requireQrlabAdmin, async (req, res) => {
    ensureQrlabAdminSchema(db);
    const id = Number(req.params.id || 0);
    const grantType = safeText(req.body?.grant_type);
    const payload = grantPayload(grantType);
    const returnTo = safeReturnTo(req.body?.return_to);
    if (!id || !payload) return res.redirect(`${returnTo}?err=grant_invalid`);

    try {
      const result = await applyQrlabGrant(id, grantType, payload);
      const user = result.user || {};
      const grant = result.grant || payload;

      db.prepare(`
        INSERT INTO qrlab_admin_grants(
          qrlab_user_id,email,grant_type,plan_code,subscription_status,subscription_period_end,note,created_by
        )
        VALUES(?,?,?,?,?,?,?,?)
      `).run(
        id,
        user.email,
        grantType,
        grant.plan_code,
        grant.subscription_status,
        grant.subscription_period_end,
        safeText(req.body?.note),
        safeText(req.session.user.email || req.session.user.id)
      );

      return res.redirect(`${returnTo}?ok=grant`);
    } catch (error) {
      return res.redirect(`${returnTo}?err=${encodeURIComponent(error.message || "grant_failed")}`);
    }
  });
}
