// auth.js (ESM)
import bcrypt from "bcrypt";
import { db } from "./db.js";
import { ALL_MODULE_KEYS, ROLE_MODULES, isDemoExpired, normalizeUserModules, parseModuleList } from "./lib/app-config.js";

function superAdminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;
  return superAdminEmails().includes(normalizedEmail);
}

function intersectModules(left, right) {
  const rightSet = new Set((right || []).map(String));
  return (left || []).map(String).filter((key) => rightSet.has(key));
}

function resolveCompanyAccess(companyId) {
  if (!companyId) {
    return {
      company: null,
      subscription: null,
      allowedModules: [...ALL_MODULE_KEYS]
    };
  }

  const company = db.prepare(`
    SELECT id, name, slug, status, max_users, suspension_reason, is_demo, demo_expires_at
    FROM companies
    WHERE id=?
  `).get(companyId) || null;

  const subscription = db.prepare(`
    SELECT
      cs.id,
      cs.status,
      cs.seats_included,
      cs.seats_used,
      cs.module_overrides,
      p.code AS plan_code,
      p.name AS plan_name,
      p.module_keys AS plan_module_keys,
      p.pricing_model,
      p.price_monthly,
      p.max_modules_per_user,
      p.max_active_modules
    FROM company_subscriptions cs
    JOIN plans p ON p.id = cs.plan_id
    WHERE cs.company_id=?
    ORDER BY cs.id DESC
    LIMIT 1
  `).get(companyId) || null;

  const planModules = parseModuleList(subscription?.plan_module_keys, ALL_MODULE_KEYS);
  const overrideModules = parseModuleList(subscription?.module_overrides, planModules);
  const allowedModules = (overrideModules.length ? overrideModules : planModules)
    .filter((moduleKey) => !(Number(company?.is_demo || 0) === 1 && moduleKey === "setari"));

  return {
    company,
    subscription,
    allowedModules: allowedModules.length ? allowedModules : [...ALL_MODULE_KEYS]
  };
}

function resolveRequestModule(req) {
  const path = String(req.path || "");
  if (path.startsWith("/contract-form") || path.startsWith("/api/contract/")) return "contracts";
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/clients") || path.startsWith("/client/")) return "clients";
  if (path.startsWith("/quotes") || path.startsWith("/quote/")) return "quotes";
  if (path.startsWith("/contracte") || path.startsWith("/contract/")) return "contracts";
  if (path.startsWith("/produse")) return "produse";
  if (path.startsWith("/facturi") || path.startsWith("/factura/")) return "facturi";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/accounting")) return "accounting";
  if (path.startsWith("/anaf/status") || path.startsWith("/anaf/inbox") || path.startsWith("/anaf/outbox")) return "accounting";
  if (path.startsWith("/tipizate")) return "tipizate";
  if (path.startsWith("/employees")) return "employees";
  if (path.startsWith("/accounts")) return "accounts";
  if (path.startsWith("/setari") || path.startsWith("/oauth/anaf/")) return "setari";
  return null;
}

function userHasModule(user, moduleKey) {
  const modules = Array.isArray(user?.effective_module_permissions)
    ? user.effective_module_permissions
    : Array.isArray(user?.module_permissions)
      ? user.module_permissions
      : [];
  return modules.includes(moduleKey);
}

function refreshSessionUserAccess(sessionUser) {
  if (!sessionUser?.id) return sessionUser;

  const dbUser = db.prepare(`
    SELECT id, email, role, module_permissions, company_id, status, is_company_admin
    FROM users
    WHERE id=?
  `).get(sessionUser.id);

  if (!dbUser) return null;
  if (String(dbUser.status || "active").toLowerCase() !== "active") return null;
  const isSuperAdmin = isSuperAdminEmail(dbUser.email);

  const roleModules = ROLE_MODULES[String(dbUser.role || "").toLowerCase()] || [];
  const rawUserModules = parseModuleList(dbUser.module_permissions, roleModules);
  const userModules = rawUserModules.length ? rawUserModules : [...roleModules];
  const companyAccess = resolveCompanyAccess(dbUser.company_id);
  if (!isSuperAdmin && Number(companyAccess.company?.is_demo || 0) === 1 && isDemoExpired(companyAccess.company)) {
    return null;
  }
  if (!isSuperAdmin && companyAccess.company && String(companyAccess.company.status || "active").toLowerCase() === "suspended") {
    return null;
  }
  const effectiveModules = isSuperAdmin
    ? [...ALL_MODULE_KEYS]
    : normalizeUserModules(
        intersectModules(userModules, companyAccess.allowedModules),
        companyAccess.allowedModules,
        companyAccess.subscription || {},
        roleModules,
        { companyIsDemo: Number(companyAccess.company?.is_demo || 0) === 1 }
      );

  return {
    ...sessionUser,
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    company_id: dbUser.company_id || null,
    company_name: companyAccess.company?.name || null,
    company_is_demo: Number(companyAccess.company?.is_demo || 0),
    demo_expires_at: companyAccess.company?.demo_expires_at || null,
    is_company_admin: Number(dbUser.is_company_admin || 0),
    is_super_admin: isSuperAdmin ? 1 : 0,
    assigned_module_permissions: userModules,
    module_permissions: effectiveModules,
    effective_module_permissions: effectiveModules,
    subscription: companyAccess.subscription ? {
      id: companyAccess.subscription.id,
      status: companyAccess.subscription.status,
      plan_code: companyAccess.subscription.plan_code,
      plan_name: companyAccess.subscription.plan_name,
      pricing_model: companyAccess.subscription.pricing_model,
      price_monthly: companyAccess.subscription.price_monthly,
      max_modules_per_user: companyAccess.subscription.max_modules_per_user,
      max_active_modules: companyAccess.subscription.max_active_modules,
      seats_included: companyAccess.subscription.seats_included,
      seats_used: companyAccess.subscription.seats_used
    } : null
  };
}

export function requireAuth(req, res, next) {
  if (!(req.session && req.session.user)) {
    return res.redirect("/login");
  }

  const refreshedUser = refreshSessionUserAccess(req.session.user);
  if (!refreshedUser) {
    req.session.user = null;
    return res.redirect("/login");
  }
  req.session.user = refreshedUser;

  const requiredModule = resolveRequestModule(req);
  if (requiredModule && !userHasModule(req.session.user, requiredModule)) {
    return res.status(403).send("Forbidden");
  }

  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.redirect("/login");
    if (!roles.includes(user.role)) return res.status(403).send("Forbidden");
    next();
  };
}

export function seedAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return { ok: false, reason: "ADMIN_EMAIL/ADMIN_PASSWORD missing" };

  const existing = db.prepare("SELECT id,email,role FROM users WHERE email=?").get(email);
  if (existing) return { ok: true, created: false, email };

  const hash = bcrypt.hashSync(password, 12);
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?,?,?)")
    .run(email, hash, "admin");

  return { ok: true, created: true, email };
}

export function verifyUserAttempt(email, password) {
  const u = db.prepare(`
    SELECT id,email,password_hash,role,module_permissions,company_id,status,is_company_admin
    FROM users
    WHERE email=?
  `).get(email);
  if (!u) return { ok: false, reason: "invalid_credentials" };
  if (String(u.status || "active").toLowerCase() !== "active") {
    return { ok: false, reason: "user_inactive" };
  }
  const ok = bcrypt.compareSync(password, u.password_hash);
  if (!ok) return { ok: false, reason: "invalid_credentials" };
  const isSuperAdmin = isSuperAdminEmail(u.email);

  const roleModules = ROLE_MODULES[String(u.role || "").toLowerCase()] || [];
  const rawUserModules = parseModuleList(u.module_permissions, roleModules);
  const userModules = rawUserModules.length ? rawUserModules : [...roleModules];
  const companyAccess = resolveCompanyAccess(u.company_id);
  if (!isSuperAdmin && Number(companyAccess.company?.is_demo || 0) === 1 && isDemoExpired(companyAccess.company)) {
    return {
      ok: false,
      reason: "company_demo_expired",
      company_name: companyAccess.company?.name || null,
      detail: "Perioada demo de 7 zile a expirat. Contacteaza administratorul platformei pentru activare sau recreare demo."
    };
  }
  if (!isSuperAdmin && companyAccess.company && String(companyAccess.company.status || "active").toLowerCase() === "suspended") {
    return {
      ok: false,
      reason: companyAccess.company?.suspension_reason ? "company_suspended_with_reason" : "company_suspended",
      company_name: companyAccess.company?.name || null,
      detail: companyAccess.company?.suspension_reason || ""
    };
  }
  const effectiveModules = isSuperAdmin
    ? [...ALL_MODULE_KEYS]
    : normalizeUserModules(
        intersectModules(userModules, companyAccess.allowedModules),
        companyAccess.allowedModules,
        companyAccess.subscription || {},
        roleModules,
        { companyIsDemo: Number(companyAccess.company?.is_demo || 0) === 1 }
      );

  return {
    ok: true,
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      company_id: u.company_id || null,
      company_name: companyAccess.company?.name || null,
      company_is_demo: Number(companyAccess.company?.is_demo || 0),
      demo_expires_at: companyAccess.company?.demo_expires_at || null,
      is_company_admin: Number(u.is_company_admin || 0),
      is_super_admin: isSuperAdmin ? 1 : 0,
      assigned_module_permissions: userModules,
      module_permissions: effectiveModules,
      effective_module_permissions: effectiveModules,
      subscription: companyAccess.subscription ? {
        id: companyAccess.subscription.id,
        status: companyAccess.subscription.status,
        plan_code: companyAccess.subscription.plan_code,
        plan_name: companyAccess.subscription.plan_name,
        pricing_model: companyAccess.subscription.pricing_model,
        price_monthly: companyAccess.subscription.price_monthly,
        max_modules_per_user: companyAccess.subscription.max_modules_per_user,
        max_active_modules: companyAccess.subscription.max_active_modules,
        seats_included: companyAccess.subscription.seats_included,
        seats_used: companyAccess.subscription.seats_used
      } : null
    }
  };
}

export function verifyUser(email, password) {
  const result = verifyUserAttempt(email, password);
  return result.ok ? result.user : null;
}

export function canAccessSpvUser(user) {
  if (Number(user?.company_is_demo || 0) === 1) return false;
  const role = String(user?.role || "").trim().toLowerCase();
  return Boolean(Number(user?.is_super_admin || 0)) || role === "accounting";
}

export function requireModule(moduleKey) {
  return (req, res, next) => {

    const user = req.session?.user;
    if (!user) return res.redirect("/login");
    if (!userHasModule(user, moduleKey)) {
      return res.status(403).send("Forbidden");
    }

    next();
  };
}

export function requireSpvAccess(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.redirect("/login");
  if (!canAccessSpvUser(user)) {
    return res.status(403).send("Forbidden");
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.redirect("/login");
  if (!Number(user.is_super_admin || 0)) {
    return res.status(403).send("Forbidden");
  }
  next();
}
