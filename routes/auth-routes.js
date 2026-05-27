import bcrypt from "bcrypt";
import { DEMO_PLAN_CODE, ROLE_MODULES, normalizeCompanyModules, normalizeUserModules, parseModuleList } from "../lib/app-config.js";
import { renderPlanCards } from "../lib/plan-cards.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyCompanyName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureUniqueCompanySlug(db, baseName) {
  const baseSlug = slugifyCompanyName(baseName) || "companie";
  let slug = baseSlug;
  let index = 2;

  while (db.prepare("SELECT id FROM companies WHERE slug=?").get(slug)) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  return slug;
}

function buildSessionUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    company_id: u.company_id,
    company_name: u.company_name,
    company_is_demo: u.company_is_demo,
    demo_expires_at: u.demo_expires_at,
    is_company_admin: u.is_company_admin,
    is_super_admin: u.is_super_admin,
    assigned_module_permissions: u.assigned_module_permissions,
    module_permissions: u.module_permissions,
    effective_module_permissions: u.effective_module_permissions,
    subscription: u.subscription
  };
}

function generateDemoCredentials(db) {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 9999)}`;
  let email = `demo-${suffix}@demo.minicrm.local`;

  while (db.prepare("SELECT id FROM users WHERE email=?").get(email)) {
    email = `demo-${Date.now()}-${Math.round(Math.random() * 9999)}@demo.minicrm.local`;
  }

  return {
    email,
    password: "Demo12345!"
  };
}

export function createWorkspace(db, {
  companyName,
  companyCui = "",
  companyRc = "",
  companyRep = "",
  companyAddress = "",
  adminEmail,
  adminPassword,
  plan,
  isDemo = false
}) {
  const planModules = parseModuleList(plan?.module_keys, []);
  const defaultRoleModules = ROLE_MODULES.admin || [];
  const activeModules = normalizeCompanyModules(planModules, planModules, plan, { companyIsDemo: isDemo });
  const adminModules = normalizeUserModules(defaultRoleModules, activeModules, plan, defaultRoleModules, { companyIsDemo: isDemo });
  const companySlug = ensureUniqueCompanySlug(db, companyName);
  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  const demoExpiresAt = isDemo
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const createCompany = db.transaction(() => {
    const companyResult = db.prepare(`
      INSERT INTO companies (
        name, slug, cui, rc, address, representative, status, max_users,
        is_demo, demo_expires_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'trial', ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      companyName,
      companySlug,
      companyCui,
      companyRc,
      companyAddress,
      companyRep,
      Math.max(Number(plan?.max_users || 1), 1),
      isDemo ? 1 : 0,
      demoExpiresAt
    );

    const companyId = Number(companyResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO company_subscriptions (
        company_id, plan_id, status, seats_included, seats_used, module_overrides,
        starts_at, ends_at, created_at, updated_at
      )
      VALUES (?, ?, 'trial', ?, 1, ?, datetime('now'), ?, datetime('now'), datetime('now'))
    `).run(
      companyId,
      plan.id,
      Math.max(Number(plan?.max_users || 1), 1),
      JSON.stringify(activeModules),
      demoExpiresAt
    );

    db.prepare(`
      INSERT INTO users (email, password_hash, role, company_id, status, is_company_admin, module_permissions, created_at)
      VALUES (?, ?, 'admin', ?, 'active', 1, ?, datetime('now'))
    `).run(
      adminEmail,
      passwordHash,
      companyId,
      JSON.stringify(adminModules)
    );

    return { companyId, demoExpiresAt };
  });

  return createCompany();
}

function resolvePostLoginPath(user) {
  if (Number(user?.is_super_admin || 0) === 1) {
    return "/nexora/super-admin";
  }

  const modules = Array.isArray(user?.effective_module_permissions)
    ? user.effective_module_permissions
    : Array.isArray(user?.module_permissions)
      ? user.module_permissions
      : [];

  if (String(user?.role || "").trim().toLowerCase() === "accounting" && modules.includes("accounting")) {
    return "/nexora/accounting";
  }

  const firstAllowedPath = [
    ["dashboard", "/nexora-dashboard"],
    ["accounting", "/nexora/accounting"],
    ["facturi", "/nexora/facturi"],
    ["clients", "/nexora/clients"],
    ["quotes", "/nexora/quotes"],
    ["contracts", "/nexora/contracts"],
    ["produse", "/nexora/products"],
    ["tipizate", "/nexora/documents"],
    ["employees", "/nexora/employees"],
    ["accounts", "/nexora/users"],
    ["setari", "/nexora/settings"]
  ].find(([moduleKey]) => modules.includes(moduleKey));

  return firstAllowedPath ? firstAllowedPath[1] : "/nexora-dashboard";
}

function renderAuthPage({
  title,
  heading,
  description,
  formHtml,
  footerHtml = "",
  accent = "blue"
}) {
  const accentGradient = accent === "emerald"
    ? "linear-gradient(145deg,#10261d 0%,#1a4737 56%,#2b6d56 100%)"
    : "linear-gradient(145deg,#0f172a 0%,#16398d 56%,#2563eb 100%)";
  const buttonGradient = accent === "emerald"
    ? "linear-gradient(135deg,#1a4737,#24614d)"
    : "linear-gradient(135deg,#2563eb,#1d4ed8)";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
  :root{
    --auth-bg:#eef4ff;
    --auth-bg-2:#f8fbff;
    --auth-panel:rgba(255,255,255,.96);
    --auth-panel-solid:#ffffff;
    --auth-line:rgba(100,116,139,.34);
    --auth-text:#0b1220;
    --auth-muted:#475569;
    --auth-primary:#2563eb;
    --auth-primary-2:#1d4ed8;
    --auth-navy:#0f172a;
    --auth-navy-2:#172033;
    --auth-ring:rgba(37,99,235,.22);
    --auth-shadow:0 28px 80px rgba(15,23,42,.18);
    --auth-shadow-soft:0 16px 38px rgba(15,23,42,.12);
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    min-height:100vh;
    padding:32px 20px;
    font-family:"Plus Jakarta Sans","Segoe UI",sans-serif;
    color:var(--auth-text);
    position:relative;
    overflow-x:hidden;
    background:
      radial-gradient(circle at top left, rgba(56,189,248,.22), rgba(56,189,248,0) 32%),
      radial-gradient(circle at bottom right, rgba(37,99,235,.18), rgba(37,99,235,0) 30%),
      linear-gradient(180deg,#f4f8ff 0%, #e8eff9 56%, #dfe8f4 100%);
  }
  body::before,
  body::after{
    content:"";
    position:fixed;
    inset:0;
    pointer-events:none;
  }
  body::before{
    background:
      linear-gradient(rgba(148,163,184,.10) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,.10) 1px, transparent 1px);
    background-size:58px 58px;
    mask-image:linear-gradient(180deg, rgba(0,0,0,.24), rgba(0,0,0,0));
  }
  body::after{
    inset:auto -10% 10% auto;
    width:420px;
    height:420px;
    border-radius:50%;
    background:radial-gradient(circle, rgba(37,99,235,.18), rgba(37,99,235,0) 72%);
    filter:blur(14px);
  }
  @keyframes cardIn{
    from{opacity:0;transform:translateY(18px) scale(.98)}
    to{opacity:1;transform:translateY(0) scale(1)}
  }
  .auth-shell{
    position:relative;
    width:100%;
    max-width:1360px;
    margin:0 auto;
    display:grid;
    grid-template-columns:minmax(320px, 380px) minmax(0, 1fr);
    gap:28px;
    align-items:start;
  }
  .auth-shell::before{
    content:"";
    position:absolute;
    inset:-8% -4% auto -4%;
    height:240px;
    background:radial-gradient(circle, rgba(255,255,255,.52), rgba(255,255,255,0) 70%);
    filter:blur(10px);
    pointer-events:none;
  }
  .auth-brand,
  .auth-card{
    position:relative;
    overflow:hidden;
    border-radius:28px;
    box-shadow:var(--auth-shadow);
    animation:cardIn .55s ease;
  }
  .auth-brand{
    padding:32px;
    color:#fff;
    background:${accentGradient};
    border:1px solid rgba(255,255,255,.12);
  }
  .auth-card{
    padding:32px;
    background:var(--auth-panel);
    border:1px solid rgba(255,255,255,.92);
    backdrop-filter:blur(16px);
    -webkit-backdrop-filter:blur(16px);
  }
  .auth-brand::before,
  .auth-card::before{
    content:"";
    position:absolute;
    inset:-1px;
    border-radius:28px;
    pointer-events:none;
  }
  .auth-brand::before{
    background:
      radial-gradient(circle at top right, rgba(255,255,255,.16), rgba(255,255,255,0) 28%),
      linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,0));
  }
  .auth-card::before{
    background:linear-gradient(180deg,rgba(255,255,255,.68),rgba(255,255,255,0));
    opacity:.64;
  }
  .brand-chip{
    display:inline-flex;
    align-items:center;
    gap:10px;
    padding:10px 14px;
    border-radius:999px;
    background:rgba(255,255,255,.10);
    border:1px solid rgba(255,255,255,.14);
    font-size:12px;
    font-weight:700;
    letter-spacing:.08em;
    text-transform:uppercase;
  }
  .brand-title{
    margin:20px 0 0;
    font-family:"Space Grotesk","Plus Jakarta Sans",sans-serif;
    font-size:38px;
    line-height:1.03;
    letter-spacing:.01em;
  }
  .brand-copy{
    margin:14px 0 0;
    color:rgba(255,255,255,.78);
    line-height:1.68;
    max-width:34ch;
    font-weight:500;
  }
  .brand-points{
    margin:28px 0 0;
    display:grid;
    gap:12px;
  }
  .brand-point{
    padding:14px 16px;
    border-radius:18px;
    background:rgba(255,255,255,.08);
    border:1px solid rgba(255,255,255,.10);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
  }
  .brand-point strong{
    display:block;
    margin-bottom:4px;
    font-size:14px;
    font-weight:800;
  }
  .brand-point span{
    color:rgba(255,255,255,.72);
    font-size:13px;
    line-height:1.45;
    font-weight:500;
  }
  h1{
    margin:0;
    color:var(--auth-text);
    font-family:"Space Grotesk","Plus Jakarta Sans",sans-serif;
    font-size:32px;
    letter-spacing:.02em;
    font-weight:800;
  }
  .auth-description{
    margin:10px 0 24px;
    color:var(--auth-muted);
    line-height:1.65;
    font-weight:500;
  }
  label{
    display:block;
    margin:0 0 6px;
    color:#1e293b;
    font-size:13px;
    font-weight:800;
  }
  input, select{
    width:100%;
    padding:13px 14px;
    margin:0 0 14px;
    border:1px solid var(--auth-line);
    border-radius:16px;
    background:rgba(255,255,255,.96);
    color:var(--auth-text);
    outline:none;
    font-size:14px;
    font-weight:600;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.8);
  }
  input:focus, select:focus{
    border-color:rgba(37,99,235,.38);
    box-shadow:0 0 0 4px var(--auth-ring);
  }
  .grid-2{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:14px;
  }
  .plan-card{
    display:flex;
    align-items:flex-start;
    gap:10px;
    padding:14px 16px;
    border-radius:18px;
    margin-bottom:10px;
    border:1px solid rgba(255,255,255,.18);
    background:rgba(255,255,255,.10);
    color:#fff;
  }
  .plan-card input{
    width:auto;
    margin:4px 0 0;
  }
  .plan-card strong{
    display:block;
    font-size:15px;
  }
  .plan-card span{
    display:block;
    color:#dbeafe;
    font-size:13px;
    line-height:1.45;
    margin-top:4px;
  }
  button{
    width:100%;
    padding:13px 16px;
    border:0;
    border-radius:16px;
    background:${buttonGradient};
    color:#fff;
    font-weight:800;
    font-size:14px;
    cursor:pointer;
    box-shadow:0 12px 28px rgba(37,99,235,.24);
    transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;
  }
  button:hover{
    transform:translateY(-1px);
    box-shadow:0 16px 30px rgba(37,99,235,.28);
    filter:brightness(1.03);
  }
  .auth-actions{
    display:grid;
    gap:12px;
  }
  .auth-secondary-btn{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    width:100%;
    padding:13px 16px;
    border-radius:16px;
    text-decoration:none;
    font-weight:800;
    font-size:14px;
    color:var(--auth-text);
    border:1px solid var(--auth-line);
    background:rgba(255,255,255,.74);
    transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;
  }
  .auth-secondary-btn:hover{
    transform:translateY(-1px);
    box-shadow:0 14px 28px rgba(15,23,42,.10);
    filter:brightness(1.03);
  }
  .demo-cta{
    margin-top:18px;
    padding:16px 18px;
    border-radius:20px;
    border:1px solid rgba(37,99,235,.12);
    background:linear-gradient(180deg,rgba(255,255,255,.94) 0%, rgba(239,246,255,.88) 100%);
    color:var(--auth-text);
  }
  .demo-cta strong{
    display:block;
    font-size:15px;
    margin-bottom:6px;
    font-weight:800;
  }
  .demo-cta p{
    margin:0 0 14px;
    color:var(--auth-muted);
    line-height:1.55;
    font-size:13px;
    font-weight:500;
  }
  .pricing-stack{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:14px;
    margin-top:10px;
    align-items:stretch;
  }
  .pricing-card{
    position:relative;
    display:flex;
    flex-direction:column;
    min-height:100%;
    border-radius:22px;
    overflow:hidden;
    border:1px solid var(--auth-line);
    background:linear-gradient(180deg,rgba(255,255,255,.98) 0%, rgba(248,250,252,.96) 100%);
    box-shadow:var(--auth-shadow-soft);
    cursor:pointer;
    transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;
  }
  .pricing-card:hover{transform:translateY(-2px);border-color:rgba(37,99,235,.28)}
  .pricing-card.selected{
    border-color:rgba(37,99,235,.38);
    box-shadow:0 0 0 4px var(--auth-ring), 0 18px 36px rgba(37,99,235,.16);
  }
  .pricing-radio{
    position:absolute;
    top:14px;
    right:14px;
    width:16px;
    height:16px;
    z-index:2;
    margin:0;
    accent-color:var(--auth-primary);
  }
  .pricing-media-wrap{
    position:relative;
    min-height:108px;
    background:var(--plan-accent);
  }
  .pricing-media{
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
  }
  .pricing-media-placeholder{
    min-height:108px;
  }
  .pricing-chip{
    position:absolute;
    top:12px;
    left:12px;
    display:inline-flex;
    align-items:center;
    padding:6px 10px;
    border-radius:999px;
    background:rgba(15,23,42,.66);
    border:1px solid rgba(255,255,255,.18);
    color:#fff;
    font-size:10px;
    font-weight:800;
    letter-spacing:.08em;
    text-transform:uppercase;
  }
  .pricing-body{
    padding:14px 14px 16px;
  }
  .pricing-heading{
    display:grid;
    gap:10px;
  }
  .pricing-title{
    color:var(--auth-text);
    font-size:18px;
    font-weight:900;
  }
  .pricing-tagline{
    margin-top:8px;
    color:#334155;
    line-height:1.5;
    font-size:12px;
    font-weight:600;
  }
  .pricing-price{
    color:var(--auth-primary);
    font-size:15px;
    font-weight:900;
    white-space:nowrap;
  }
  .pricing-meta{
    display:grid;
    gap:8px;
    flex-wrap:wrap;
    margin-top:12px;
  }
  .pricing-meta span{
    display:inline-flex;
    align-items:center;
    width:max-content;
    max-width:100%;
    padding:7px 10px;
    border-radius:999px;
    background:#eff6ff;
    border:1px solid #dbeafe;
    color:#1d4ed8;
    font-size:11px;
    font-weight:800;
  }
  .pricing-description{
    margin-top:12px;
    color:#1e293b;
    line-height:1.55;
    font-size:12px;
    font-weight:600;
  }
  .pricing-feature-list{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin-top:12px;
  }
  .pricing-feature{
    display:inline-flex;
    align-items:center;
    padding:7px 9px;
    border-radius:12px;
    background:#f8fafc;
    border:1px solid var(--auth-line);
    color:#334155;
    font-size:11px;
    line-height:1.4;
    font-weight:700;
  }
  .pricing-footnotes{
    display:none;
  }
  .auth-footer{
    margin-top:18px;
    color:var(--auth-muted);
    font-size:13px;
    line-height:1.55;
    font-weight:500;
  }
  .auth-footer a{
    color:var(--auth-primary);
    font-weight:700;
    text-decoration:none;
  }
  .bg-logo{
    position:fixed;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    pointer-events:none;
    user-select:none;
    font-size:clamp(72px,16vw,220px);
    font-family:"Space Grotesk","Plus Jakarta Sans",sans-serif;
    font-weight:800;
    letter-spacing:4px;
    color:rgba(37,99,235,.08);
    text-transform:uppercase;
    text-shadow:0 10px 34px rgba(15,23,42,.08);
    animation:bgLogoFloat 7s ease-in-out infinite;
  }
  @keyframes bgLogoFloat{
    0%{transform:translateY(0);opacity:.08}
    50%{transform:translateY(10px);opacity:.12}
    100%{transform:translateY(0);opacity:.08}
  }
  @media (max-width: 1180px){
    .pricing-stack{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media (max-width: 920px){
    .auth-shell{grid-template-columns:1fr}
  }
  @media (max-width: 760px){
    .grid-2{grid-template-columns:1fr}
    .auth-card, .auth-brand{padding:24px}
    h1{font-size:28px}
    .pricing-stack{grid-template-columns:1fr}
    .pricing-media-wrap{min-height:120px}
    .pricing-media-placeholder{min-height:120px}
  }
</style>
</head>
<body>
  <div class="bg-logo" id="bgLogo">MiniCRM</div>
  <div class="auth-shell">
    <section class="auth-brand">
      <div class="brand-chip">MiniCRM Cloud Ready</div>
      <h2 class="brand-title">CRM și ERP modular pentru companii pe abonament.</h2>
      <p class="brand-copy">Activezi compania, alegi planul lunar și intri direct într-un workspace propriu, cu utilizatori și module controlate pe rol.</p>
      <div class="brand-points">
        <div class="brand-point">
          <strong>Companii separate</strong>
          <span>Date și acces izolate pe fiecare companie.</span>
        </div>
        <div class="brand-point">
          <strong>Planuri predefinite</strong>
          <span>Activezi modulele CRM și ERP în funcție de abonament.</span>
        </div>
        <div class="brand-point">
          <strong>Drepturi pe utilizator</strong>
          <span>Fiecare companie își controlează echipa și vizibilitatea pe module.</span>
        </div>
      </div>
    </section>

    <section class="auth-card">
      <h1>${escapeHtml(heading)}</h1>
      <div class="auth-description">${escapeHtml(description)}</div>
      ${formHtml}
      ${footerHtml ? `<div class="auth-footer">${footerHtml}</div>` : ""}
    </section>
  </div>
<script>
  const bgLogo = document.getElementById("bgLogo");
  document.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 18;
    const y = (e.clientY / window.innerHeight - 0.5) * 12;
    bgLogo.style.transform = "translate(" + x + "px," + (y + 4) + "px)";
  });
</script>
</body>
</html>
`;
}

function loginErrorMessage(code, companyName) {
  if (code === "company_suspended") {
    return companyName
      ? `Compania ${companyName} este suspendată momentan. Contactează administratorul platformei.`
      : "Compania asociată contului este suspendată momentan. Contactează administratorul platformei.";
  }
  if (code === "company_suspended_with_reason") {
    return companyName
      ? `Compania ${companyName} este suspendată momentan. Verifică mesajul afișat sau contactează administratorul platformei.`
      : "Compania asociată contului este suspendată momentan. Verifică mesajul afișat sau contactează administratorul platformei.";
  }
  if (code === "company_demo_expired") {
    return companyName
      ? `Perioada demo pentru ${companyName} a expirat. Poți cere reactivare sau crea un demo nou.`
      : "Perioada demo a expirat. Poți cere reactivare sau crea un demo nou.";
  }
  if (code === "user_inactive") {
    return "Contul tău este inactiv. Contactează administratorul companiei.";
  }
  if (code === "missing_credentials") {
    return "Email și parola sunt obligatorii.";
  }
  if (code === "session_error") {
    return "A apărut o eroare internă la deschiderea sesiunii.";
  }
  if (code === "invalid_credentials") {
    return "Email sau parolă incorecte.";
  }
  return "";
}

export function registerAuthRoutes(app, { db, verifyUser, verifyUserAttempt }) {
  app.get("/login", (req, res) => {
    if (req.session?.user) return res.redirect(resolvePostLoginPath(req.session.user));
    const errorCode = String(req.query?.err || "").trim();
    const companyName = String(req.query?.company || "").trim();
    const detail = String(req.query?.detail || "").trim();
    const errorMessage = loginErrorMessage(errorCode, companyName);

    const formHtml = `
      ${errorMessage ? `<div style="margin-bottom:16px;padding:14px 16px;border-radius:16px;border:1px solid rgba(248,113,113,.45);background:rgba(127,29,29,.35);color:#fee2e2;font-size:14px;line-height:1.5">${escapeHtml(errorMessage)}${detail ? `<div style="margin-top:8px;color:#fecaca">${escapeHtml(detail)}</div>` : ""}</div>` : ""}
      <form method="post" action="/login" class="auth-actions">
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" required />
        <button type="submit">Login</button>
      </form>
      <div class="demo-cta">
        <strong>Creeaza cont demo in 1 click</strong>
        <p>Datele raman pe un tenant separat, demo-ul este activ 7 zile, vezi aproape toate modulele si e-Factura ramane doar simulata, fara trimitere reala in SPV.</p>
        <div class="auth-actions">
          <form method="post" action="/signup/demo" style="margin:0">
            <button type="submit">Creeaza cont demo</button>
          </form>
          <a class="auth-secondary-btn" href="/signup/company">Vezi pachetele disponibile</a>
        </div>
      </div>
    `;

    res.type("html").send(renderAuthPage({
      title: "Login",
      heading: "MiniCRM Login",
      description: "Intri in compania ta sau pornesti imediat un workspace demo, cu date separate si prezentare completa a platformei.",
      formHtml,
      footerHtml: `Nu ai inca un workspace? <a href="/signup/company">Configureaza companie noua</a>.`
    }));
  });

  app.get("/signup/company", (req, res) => {
    if (req.session?.user) return res.redirect(resolvePostLoginPath(req.session.user));

    const plans = db.prepare(`
      SELECT
        id, code, name, price_monthly, pricing_model, max_users, max_modules_per_user,
        max_active_modules, module_keys, tagline, description, features_json,
        support_copy, extra_dev_copy, image_path
      FROM plans
      WHERE status='active'
        AND COALESCE(is_public, 1) = 1
      ORDER BY COALESCE(sort_order, 100) ASC, price_monthly ASC, id ASC
    `).all();

    const planCards = renderPlanCards(plans, { selectedPlanId: Number(plans[0]?.id || 0), allowSelection: true });

    const formHtml = `
      <form method="post" action="/signup/company">
        <div class="grid-2">
          <div>
            <label>Nume companie</label>
            <input name="company_name" required />
          </div>
          <div>
            <label>CUI</label>
            <input name="company_cui" />
          </div>
        </div>
        <div class="grid-2">
          <div>
            <label>RC</label>
            <input name="company_rc" />
          </div>
          <div>
            <label>Reprezentant</label>
            <input name="company_rep" />
          </div>
        </div>
        <label>Adresă companie</label>
        <input name="company_address" />
        <div class="grid-2">
          <div>
            <label>Email administrator</label>
            <input name="admin_email" type="email" required />
          </div>
          <div>
            <label>Parolă administrator</label>
            <input name="admin_password" type="password" minlength="8" required />
          </div>
        </div>
        <div style="margin-top:10px">
          <label id="pricing-packages">Pachete disponibile</label>
          <div class="pricing-stack">${planCards}</div>
        </div>
        <button type="submit" style="margin-top:8px">Activeaza workspace-ul</button>
      </form>
    `;

    res.type("html").send(renderAuthPage({
      title: "Creează companie",
      heading: "Creează companie nouă",
      description: "Pornesti un workspace nou, alegi pachetul potrivit si primesti automat primul cont de administrator, cu suport inclus si module adaptabile.",
      formHtml,
      footerHtml: `Ai deja cont? <a href="/login">Mergi la login</a>. Sau testeaza instant prin <a href="/login">cont demo</a>.`
    }));
  });

  app.post("/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.redirect("/login?err=missing_credentials");
    }

    const attempt = verifyUserAttempt(email, password);
    if (!attempt?.ok) {
      const params = new URLSearchParams();
      params.set("err", attempt?.reason || "invalid_credentials");
      if (attempt?.company_name) params.set("company", attempt.company_name);
      if (attempt?.detail) params.set("detail", attempt.detail);
      return res.redirect(`/login?${params.toString()}`);
    }
    const u = attempt.user;

    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate failed:", err);
        return res.redirect("/login?err=session_error");
      }

      req.session.user = buildSessionUser(u);
      return res.redirect(resolvePostLoginPath(u));
    });
  });

  app.post("/signup/company", (req, res) => {
    const companyName = String(req.body?.company_name || "").trim();
    const companyCui = String(req.body?.company_cui || "").trim();
    const companyRc = String(req.body?.company_rc || "").trim();
    const companyRep = String(req.body?.company_rep || "").trim();
    const companyAddress = String(req.body?.company_address || "").trim();
    const adminEmail = String(req.body?.admin_email || "").trim().toLowerCase();
    const adminPassword = String(req.body?.admin_password || "");
    const planId = Number(req.body?.plan_id);

    if (!companyName || !adminEmail || !adminPassword || !Number.isFinite(planId)) {
      return res.status(400).type("html").send("<p style='font-family:system-ui'>Completează toate câmpurile obligatorii. <a href='/signup/company'>Înapoi</a></p>");
    }

    if (adminPassword.length < 8) {
      return res.status(400).type("html").send("<p style='font-family:system-ui'>Parola trebuie să aibă minim 8 caractere. <a href='/signup/company'>Înapoi</a></p>");
    }

    const existingUser = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
    if (existingUser) {
      return res.status(400).type("html").send("<p style='font-family:system-ui'>Există deja un utilizator cu acest email. <a href='/signup/company'>Înapoi</a></p>");
    }

    const plan = db.prepare(`
      SELECT
        id, name, code, max_users, pricing_model, price_monthly, max_modules_per_user,
        max_active_modules, module_keys
      FROM plans
      WHERE id=? AND status='active' AND COALESCE(is_public, 1) = 1
    `).get(planId);
    if (!plan) {
      return res.status(404).type("html").send("<p style='font-family:system-ui'>Planul ales nu există. <a href='/signup/company'>Înapoi</a></p>");
    }

    try {
      createWorkspace(db, {
        companyName,
        companyCui,
        companyRc,
        companyRep,
        companyAddress,
        adminEmail,
        adminPassword,
        plan,
        isDemo: false
      });
    } catch (error) {
      console.error("Company signup failed:", error);
      return res.status(500).type("html").send("<p style='font-family:system-ui'>Nu am putut crea compania. <a href='/signup/company'>Înapoi</a></p>");
    }

    const user = verifyUser(adminEmail, adminPassword);
    if (!user) {
      return res.redirect("/login");
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate after signup failed:", err);
        return res.redirect("/login");
      }

      req.session.user = buildSessionUser(user);
      return res.redirect(resolvePostLoginPath(user));
    });
  });

  app.post("/signup/demo", (req, res) => {
    if (req.session?.user) return res.redirect(resolvePostLoginPath(req.session.user));

    const plan = db.prepare(`
      SELECT
        id, name, code, max_users, pricing_model, price_monthly, max_modules_per_user,
        max_active_modules, module_keys
      FROM plans
      WHERE code=? AND status='active'
      ORDER BY id DESC
      LIMIT 1
    `).get(DEMO_PLAN_CODE);

    if (!plan) {
      return res.status(500).type("html").send("<p style='font-family:system-ui'>Planul demo nu este configurat. <a href='/login'>Înapoi la login</a></p>");
    }

    const credentials = generateDemoCredentials(db);
    const companyName = `Demo Workspace ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    let demoExpiresAt = null;

    try {
      const created = createWorkspace(db, {
        companyName,
        adminEmail: credentials.email,
        adminPassword: credentials.password,
        plan,
        isDemo: true
      });
      demoExpiresAt = created.demoExpiresAt;
    } catch (error) {
      console.error("Demo signup failed:", error);
      return res.status(500).type("html").send("<p style='font-family:system-ui'>Nu am putut crea workspace-ul demo. <a href='/login'>Înapoi la login</a></p>");
    }

    const user = verifyUser(credentials.email, credentials.password);
    if (!user) {
      return res.redirect("/login");
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate after demo signup failed:", err);
        return res.redirect("/login");
      }

      req.session.user = buildSessionUser(user);
      req.session.demo_credentials = {
        email: credentials.email,
        password: credentials.password,
        expires_at: demoExpiresAt
      };
      return res.redirect(resolvePostLoginPath(user));
    });
  });

  app.post("/logout", (req, res) => {
    req.session?.destroy(() => {
      res.clearCookie("minicrm.sid");
      res.redirect("/login");
    });
  });
}
