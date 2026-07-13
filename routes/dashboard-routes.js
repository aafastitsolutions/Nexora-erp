import {
  DEFAULT_DASHBOARD_CONFIG,
  normalizeDashboardConfig,
  renderNexoraDashboardPage,
  renderNexoraDashboardSettingsPage
} from "../src/ui/nexora-dashboard-page.js";
import { renderNexoraShell } from "../src/ui/nexora-shell.js";
import { formatInvoiceDisplayNumber } from "../lib/invoice-numbering.js";
import { ensureProcurementOpportunitiesSchema } from "../lib/procurement-opportunities.js";

function renderSearchResultSection({ title, count, rows, emptyText }) {
  return `
    <section class="nx-search-result-section">
      <div class="nx-panel-head">
        <h2>${title}</h2>
        <span>${count}</span>
      </div>
      <div class="nx-search-result-list">
        ${rows.length ? rows.join("") : `<div class="nx-empty-state">${emptyText}</div>`}
      </div>
    </section>
  `;
}

function parseDashboardConfig(value = "") {
  if (!value) return normalizeDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
  try {
    return normalizeDashboardConfig(JSON.parse(value));
  } catch {
    return normalizeDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
  }
}

function readDashboardConfig(db, req) {
  const companyId = Number(req.session?.user?.company_id || 0);
  const userId = Number(req.session?.user?.id || 0);
  if (!companyId || !userId) return normalizeDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
  const row = db.prepare(`
    SELECT widget_config_json
    FROM dashboard_preferences
    WHERE company_id=? AND user_id=?
  `).get(companyId, userId);
  return parseDashboardConfig(row?.widget_config_json || "");
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function writeDashboardConfig(db, req, config) {
  const companyId = Number(req.session?.user?.company_id || 0);
  const userId = Number(req.session?.user?.id || 0);
  if (!companyId || !userId) return;
  db.prepare(`
    INSERT INTO dashboard_preferences (company_id, user_id, widget_config_json, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(company_id, user_id)
    DO UPDATE SET widget_config_json=excluded.widget_config_json, updated_at=datetime('now')
  `).run(companyId, userId, JSON.stringify(normalizeDashboardConfig(config)));
}

export function registerDashboardRoutes(app, { db, requireAuth, todayISO, escapeHtml, fmtMoney, crmShellStart, crmShellEnd }) {
  app.get("/dashboard", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const isSuperAdmin = Number(req.session.user.is_super_admin || 0) === 1;
    const isDemoCompany = Number(req.session.user.company_is_demo || 0) === 1;
    const demoCredentials = req.session?.demo_credentials && typeof req.session.demo_credentials === "object"
      ? { ...req.session.demo_credentials }
      : null;
    delete req.session.demo_credentials;
    const rows = db.prepare(`
      SELECT c.id, c.contract_number, c.created_at, c.price, c.duration,
             cl.name AS client_name, cl.cui AS client_cui,
             c.pdf_path
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
      WHERE IFNULL(c.origin,'DIRECT') <> 'QUOTE'
        AND c.company_id = ?
      ORDER BY c.id DESC
      LIMIT 200
    `).all(companyId);

    const tasks = db.prepare(`
      SELECT a.id, a.subject, a.note, a.due_at, a.created_at,
             cl.id AS client_id, cl.name AS client_name
      FROM activities a
      JOIN clients cl ON cl.id = a.client_id AND cl.company_id = a.company_id
      WHERE a.type='task' AND a.done=0 AND a.company_id=?
      ORDER BY (a.due_at IS NULL) ASC, a.due_at ASC, a.id DESC
      LIMIT 20
    `).all(companyId);

    const totalClients = db.prepare(`SELECT COUNT(*) AS n FROM clients WHERE company_id=?`).get(companyId)?.n || 0;
    const totalQuotesOpen = db.prepare(`
      SELECT COUNT(*) AS n
      FROM quotes
      WHERE status IN ('DRAFT','SENT') AND company_id=?
    `).get(companyId)?.n || 0;
    const totalContracts = db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE company_id=?`).get(companyId)?.n || 0;
    const totalInvoicesOpen = db.prepare(`
      SELECT COUNT(*) AS n
      FROM facturi
      WHERE status IN ('CIORNA','TRIMISA','INTARZIATA') AND company_id=?
    `).get(companyId)?.n || 0;

    const totalRevenue = db.prepare(`
      SELECT IFNULL(SUM(price), 0) AS total
      FROM contracts
      WHERE company_id=?
    `).get(companyId)?.total || 0;

    const today = todayISO();
    const overdue = tasks.filter((t) => t.due_at && String(t.due_at) < today).length;
    const latestContract = rows[0] || null;
    const userEmail = req.session.user.email;
    let heroTitle = "Un tablou de bord mai clar pentru tot ce se mișcă azi în MiniCRM.";
    let heroText = "Ai o vedere rapidă asupra portofoliului, documentelor comerciale și ritmului operațional, fără liste aglomerate în prima zonă a paginii.";
    let focusTitle = "Ce merită deschis acum";
    let focusBadge = `<span class="crm-badge ${overdue ? "crm-badge-red" : "crm-badge-green"}">${overdue ? `${overdue} overdue` : "la zi"}</span>`;
    let quickActions = `
      <a class="crm-btn dashboard-action-btn" href="/clients">Clienți</a>
      <a class="crm-btn crm-btn-secondary dashboard-action-btn" href="/quotes">Oferte</a>
      <a class="crm-btn crm-btn-secondary dashboard-action-btn" href="/contracte">Contracte</a>
      <a class="crm-btn crm-btn-secondary dashboard-action-btn" href="/facturi">Facturi</a>
    `;
    let kpis = [
      { label: "Clienți", value: String(totalClients) },
      { label: "Quotes active", value: String(totalQuotesOpen) },
      { label: "Contracte", value: String(totalContracts) },
      { label: "Facturi deschise", value: String(totalInvoicesOpen) }
    ];
    let quickStats = [
      { label: "Task-uri deschise", value: String(tasks.length) },
      { label: "Task-uri overdue", value: String(overdue) },
      { label: "Venit contractat", value: fmtMoney(totalRevenue) }
    ];

    let latestContractHtml = latestContract
      ? `
        <div class="dashboard-latest-grid">
          <div>
            <div class="crm-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Ultimul contract</div>
            <div style="margin-top:6px;font-size:20px;font-weight:800">${escapeHtml(latestContract.contract_number || "—")}</div>
            <div class="crm-muted" style="margin-top:4px">${escapeHtml(latestContract.client_name || "")}</div>
          </div>
          <div class="dashboard-latest-meta">
            <div class="dashboard-mini-panel">
              <div class="crm-muted" style="font-size:12px">Valoare</div>
              <div style="margin-top:4px;font-weight:800;font-size:16px">${escapeHtml(fmtMoney(latestContract.price))}</div>
            </div>
            <div class="dashboard-mini-panel">
              <div class="crm-muted" style="font-size:12px">Durată</div>
              <div style="margin-top:4px;font-weight:800;font-size:16px">${escapeHtml(latestContract.duration || "—")}</div>
            </div>
          </div>
          <div class="dashboard-quick-actions">
            <a class="crm-btn dashboard-action-btn" href="/contract/${latestContract.id}">Deschide contractul</a>
            ${latestContract.pdf_path ? `<a class="crm-btn crm-btn-secondary dashboard-action-btn" href="/${encodeURI(latestContract.pdf_path)}" target="_blank">Deschide PDF</a>` : ``}
          </div>
        </div>
      `
      : `
        <div style="padding:14px;border:1px dashed var(--line);border-radius:14px;background:rgba(15,23,42,.03)">
          <div style="font-weight:800">Nu există încă contracte recente.</div>
          <div class="crm-muted" style="margin-top:4px">Poți începe din modulul Contracte sau din conversia unei oferte.</div>
        </div>
      `;

    if (isSuperAdmin) {
      const activeCompanies = db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE LOWER(COALESCE(status,'active'))='active'`).get()?.n || 0;
      const trialCompanies = db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE LOWER(COALESCE(status,''))='trial'`).get()?.n || 0;
      const pastDueCompanies = db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE LOWER(COALESCE(status,''))='past_due'`).get()?.n || 0;
      const suspendedCompanies = db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE LOWER(COALESCE(status,''))='suspended'`).get()?.n || 0;
      const totalCompanies = db.prepare(`SELECT COUNT(*) AS n FROM companies`).get()?.n || 0;
      const totalUsers = db.prepare(`SELECT COUNT(*) AS n FROM users`).get()?.n || 0;
      const companyTrend = db.prepare(`
        SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS companies_count
        FROM companies
        WHERE date(created_at) >= date('now', '-29 day')
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC
      `).all();
      const planUsage = db.prepare(`
        SELECT
          p.name,
          p.code,
          COUNT(cs.id) AS companies_count,
          IFNULL(SUM(cs.seats_used), 0) AS users_count,
          IFNULL(SUM(cs.seats_included), 0) AS seats_total
        FROM plans p
        LEFT JOIN company_subscriptions cs
          ON cs.plan_id = p.id
         AND cs.id = (
           SELECT cs2.id
           FROM company_subscriptions cs2
           WHERE cs2.company_id = cs.company_id
           ORDER BY cs2.id DESC
           LIMIT 1
         )
        WHERE p.status='active'
        GROUP BY p.id, p.name, p.code
        ORDER BY p.price_monthly ASC, p.id ASC
      `).all();

      heroTitle = "Panoul de control pentru platformă și tenant-uri.";
      heroText = "Vezi imediat câte companii sunt active, restante sau suspendate și cum se distribuie utilizatorii pe planurile comerciale.";
      focusTitle = "Pulse de platformă";
      focusBadge = `<span class="crm-badge crm-badge-blue">${totalCompanies} companii</span>`;
      quickStats = [
        { label: "Companii active", value: String(activeCompanies), tone: "rgba(34,197,94,.18)", border: "rgba(74,222,128,.34)" },
        { label: "Companii restante", value: String(pastDueCompanies), tone: "rgba(245,158,11,.18)", border: "rgba(251,191,36,.34)" }
      ];
      kpis = [
        { label: "Companii trial", value: String(trialCompanies), tone: "linear-gradient(180deg,rgba(219,234,254,.96) 0%, rgba(191,219,254,.78) 100%)", accent: "#1d4ed8" },
        { label: "Companii active", value: String(activeCompanies), tone: "linear-gradient(180deg,rgba(220,252,231,.96) 0%, rgba(187,247,208,.78) 100%)", accent: "#166534" },
        { label: "Companii past due", value: String(pastDueCompanies), tone: "linear-gradient(180deg,rgba(254,243,199,.96) 0%, rgba(253,230,138,.8) 100%)", accent: "#92400e" },
        { label: "Utilizatori total", value: String(totalUsers), tone: "linear-gradient(180deg,rgba(240,249,255,.96) 0%, rgba(186,230,253,.78) 100%)", accent: "#0f4fa8" }
      ];
      quickActions = `
        <a class="crm-btn dashboard-action-btn" href="/super-admin/companies">Companii</a>
        <a class="crm-btn crm-btn-secondary dashboard-action-btn" href="/accounts">Utilizatori</a>
        <a class="crm-btn crm-btn-secondary dashboard-action-btn" href="/setari">Setări</a>
      `;
      const maxCompaniesByPlan = Math.max(1, ...planUsage.map((plan) => Number(plan.companies_count || 0)));
      const trendDays = new Map(companyTrend.map((entry) => [entry.day, Number(entry.companies_count || 0)]));
      const trendBars = Array.from({ length: 30 }, (_, index) => {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - (29 - index));
        const day = date.toISOString().slice(0, 10);
        const value = trendDays.get(day) || 0;
        return { day: day.slice(5), value };
      });
      const maxTrendValue = Math.max(1, ...trendBars.map((entry) => entry.value));
      latestContractHtml = `
        <div class="dashboard-latest-grid">
          <div class="dashboard-mini-panel" style="background:rgba(255,255,255,.74)">
            <div class="crm-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Distribuție pe planuri</div>
            <div style="margin-top:4px;font-size:20px;font-weight:800">${escapeHtml(String(totalCompanies))} companii / ${escapeHtml(String(totalUsers))} utilizatori</div>
          </div>
          <div style="display:grid;gap:8px">
            ${planUsage.map((plan) => `
              <div class="dashboard-mini-panel">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
                  <div style="font-weight:800">${escapeHtml(plan.name || plan.code || "Plan")}</div>
                  <div class="crm-badge crm-badge-blue">${escapeHtml(String(plan.companies_count || 0))} companii</div>
                </div>
                <div style="margin-top:8px;height:8px;border-radius:999px;background:rgba(148,163,184,.16);overflow:hidden">
                  <div style="height:100%;width:${Math.max(8, Math.round((Number(plan.companies_count || 0) / maxCompaniesByPlan) * 100))}%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--hero-end))"></div>
                </div>
                <div class="crm-muted" style="margin-top:4px">${escapeHtml(String(plan.users_count || 0))} utilizatori din ${escapeHtml(String(plan.seats_total || 0))} locuri incluse</div>
              </div>
            `).join("") || `<div style="padding:14px;border:1px dashed var(--line);border-radius:14px;background:rgba(15,23,42,.03)">Nu există încă planuri active.</div>`}
          </div>
          <div class="dashboard-mini-panel" style="background:rgba(255,255,255,.74)">
            <div class="crm-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Companii noi în ultimele 30 zile</div>
            <div style="display:flex;align-items:flex-end;gap:5px;height:108px;margin-top:10px">
              ${trendBars.map((entry, index) => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;min-width:0">
                  <div title="${escapeHtml(entry.day)}: ${escapeHtml(String(entry.value))}" style="width:100%;border-radius:10px 10px 4px 4px;background:${entry.value ? "linear-gradient(180deg,var(--hero-end),var(--primary))" : "rgba(148,163,184,.18)"};height:${Math.max(8, Math.round((entry.value / maxTrendValue) * 88))}px"></div>
                  <div style="font-size:10px;color:var(--muted)">${index % 5 === 0 ? escapeHtml(entry.day) : ""}</div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
    }

    const quickStatsHtml = quickStats.map((item) => `
      <div class="dashboard-stat" style="border:1px solid ${item.border || "rgba(255,255,255,.14)"};background:${item.tone || "rgba(255,255,255,.08)"}">
        <div class="dashboard-stat-label">${escapeHtml(item.label)}</div>
        <div class="dashboard-stat-value">${escapeHtml(item.value)}</div>
      </div>
    `).join("");

    const kpisHtml = kpis.map((item) => `
      <div class="crm-kpi dashboard-kpi" style="${item.tone ? `background:${item.tone};border-color:transparent;` : ""}">
        <div class="crm-kpi-label">${escapeHtml(item.label)}</div>
        <div class="crm-kpi-value" style="${item.accent ? `color:${item.accent}` : ""}">${escapeHtml(item.value)}</div>
      </div>
    `).join("");

    const dashboardHeroSectionHtml = isSuperAdmin
      ? ``
      : `
        <section class="crm-card dashboard-hero-card">
          <div class="crm-hero-grid">
            <div class="crm-hero-panel dashboard-hero-panel">
              <div class="dashboard-hero-tag">Workspace Pulse</div>
              <h2 class="dashboard-hero-title">${escapeHtml(heroTitle)}</h2>
              <div class="dashboard-hero-copy">
                ${escapeHtml(heroText)}
              </div>
              <div class="crm-hero-metrics dashboard-hero-metrics">
                ${quickStatsHtml}
              </div>
            </div>

            <div class="crm-hero-side dashboard-hero-side">
              <div class="dashboard-focus-head">
                <div>
                  <div class="crm-muted dashboard-focus-kicker">Focus</div>
                  <div class="dashboard-focus-title">${escapeHtml(focusTitle)}</div>
                </div>
                ${focusBadge}
              </div>
              ${latestContractHtml}
            </div>
          </div>
          <div class="dashboard-actions-bar">
            <div class="dashboard-actions-copy">
              <div class="dashboard-actions-title">Quick actions</div>
              <div class="dashboard-actions-sub">Acces rapid către zonele folosite zilnic.</div>
            </div>
            <div class="dashboard-quick-actions">
              ${quickActions}
            </div>
          </div>
        </section>
      `;

    const demoBanner = isDemoCompany
      ? `
        <div class="crm-card" style="margin-bottom:18px;border:1px solid #bfdbfe;background:#eff6ff">
          <div style="font-weight:800;color:#1d4ed8;margin-bottom:6px">Workspace demo activ</div>
          <div class="crm-muted">Datele din acest cont sunt separate, demo-ul ramane activ pana la ${escapeHtml(req.session.user.demo_expires_at || "data neconfigurata")}, iar e-Factura functioneaza doar in mod simulat, fara SPV live.</div>
          ${demoCredentials ? `<div style="margin-top:10px" class="crm-muted">Credențiale demo: <b>${escapeHtml(demoCredentials.email || "")}</b> / parola: <b>${escapeHtml(demoCredentials.password || "")}</b></div>` : ``}
        </div>
      `
      : "";

    res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  .dashboard-shell{
    display:grid;
    gap:8px;
  }
  .dashboard-hero-card{
    padding:0;
    overflow:hidden;
  }
  .dashboard-hero-card .crm-hero-grid{
    grid-template-columns:minmax(0,1.52fr) minmax(240px,.72fr);
  }
  .dashboard-hero-panel{
    padding:10px;
  }
  .dashboard-hero-side{
    padding:10px;
  }
  .dashboard-hero-tag{
    display:inline-flex;
    align-items:center;
    gap:6px;
    padding:3px 7px;
    border-radius:999px;
    background:rgba(255,255,255,.12);
    font-size:8px;
    font-weight:800;
    letter-spacing:.06em;
    text-transform:uppercase;
  }
  .dashboard-hero-title{
    margin:5px 0 1px 0;
    font-size:20px;
    line-height:1.04;
  }
  .dashboard-hero-copy{
    display:none;
    max-width:600px;
    color:rgba(255,255,255,.82);
    font-size:12px;
    line-height:1.45;
  }
  .dashboard-hero-metrics{
    margin-top:6px;
    gap:5px;
  }
  .dashboard-stat{
    padding:7px 8px;
    border-radius:10px;
    backdrop-filter:blur(10px);
  }
  .dashboard-stat-label{
    font-size:8px;
    letter-spacing:.06em;
    text-transform:uppercase;
    color:rgba(255,255,255,.72);
    font-weight:800;
  }
  .dashboard-stat-value{
    margin-top:2px;
    font-size:16px;
    font-weight:800;
    color:#fff;
    line-height:1.1;
  }
  .dashboard-focus-head{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:8px;
    margin-bottom:6px;
  }
  .dashboard-focus-kicker{
    font-size:9px;
    text-transform:uppercase;
    letter-spacing:.06em;
  }
  .dashboard-focus-title{
    margin-top:2px;
    font-size:15px;
    font-weight:800;
    line-height:1.1;
  }
  .dashboard-latest-grid{
    display:grid;
    gap:6px;
  }
  .dashboard-latest-meta{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:5px;
  }
  .dashboard-mini-panel{
    padding:7px 9px;
    border-radius:9px;
    background:rgba(15,23,42,.04);
    border:1px solid var(--line);
  }
  .dashboard-actions-bar{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:6px;
    flex-wrap:wrap;
    padding:6px 8px;
    border-top:1px solid var(--line);
    background:rgba(255,255,255,.55);
  }
  .dashboard-actions-copy{
    display:grid;
    gap:2px;
  }
  .dashboard-actions-title{
    margin:0;
    font-size:9px;
    letter-spacing:.06em;
    text-transform:uppercase;
    color:var(--muted);
    font-weight:800;
  }
  .dashboard-actions-sub{
    display:none;
  }
  .dashboard-quick-actions{
    display:flex;
    gap:4px;
    flex-wrap:wrap;
  }
  .dashboard-action-btn{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    padding:5px 8px;
    border-radius:8px;
    font-size:10px;
  }
  .dashboard-kpis-grid{
    margin-bottom:6px;
    gap:8px;
  }
  .dashboard-kpi{
    padding:9px;
    border-radius:11px;
  }
  .dashboard-kpi .crm-kpi-label{
    font-size:9px;
    margin-bottom:3px;
  }
  .dashboard-kpi .crm-kpi-value{
    font-size:16px;
  }
  .dashboard-overview-card{
    padding:10px;
  }
  .dashboard-overview-card .dashboard-actions-bar{
    margin:8px -10px -10px -10px;
    border-top:1px solid var(--line);
    border-radius:0 0 16px 16px;
  }
  @media (max-width: 1440px), (max-height: 900px){
    .dashboard-hero-card .crm-hero-grid{
      grid-template-columns:minmax(0,1.48fr) minmax(220px,.68fr);
    }
    .dashboard-hero-title{
      font-size:18px;
    }
    .dashboard-hero-panel,
    .dashboard-hero-side{
      padding:9px;
    }
    .dashboard-stat{
      padding:6px 8px;
    }
    .dashboard-stat-value{
      font-size:15px;
    }
    .dashboard-actions-bar{
      padding:5px 7px;
    }
  }
  @media (min-width: 1600px) and (min-height: 980px){
    .dashboard-hero-copy{
      display:block;
    }
  }
  @media (max-width: 1100px){
    .dashboard-hero-card .crm-hero-grid{
      grid-template-columns:1fr;
    }
    .dashboard-actions-bar{
      align-items:flex-start;
    }
  }
  @media (max-width: 720px){
    .dashboard-latest-meta{
      grid-template-columns:1fr;
    }
    .dashboard-quick-actions{
      width:100%;
    }
    .dashboard-action-btn{
      flex:1 1 150px;
    }
  }
}
</style>
<meta charset="utf-8">
<title>Dashboard</title>
</head>
${crmShellStart("dashboard", "Dashboard", "Overview rapid pentru activitatea curentă.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="dashboard-shell">
  ${demoBanner}

  ${dashboardHeroSectionHtml}

  <div class="crm-kpis dashboard-kpis-grid">
    ${kpisHtml}
  </div>
  </div>

${crmShellEnd()}
</html>`);
  });

  app.get("/nexora-dashboard", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);

    const totalClients = db.prepare(`SELECT COUNT(*) AS n FROM clients WHERE company_id=?`).get(companyId)?.n || 0;

    const totalQuotesOpen = db.prepare(`
      SELECT COUNT(*) AS n
      FROM quotes
      WHERE status IN ('DRAFT','SENT') AND company_id=?
    `).get(companyId)?.n || 0;

    const totalContracts = db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE company_id=?`).get(companyId)?.n || 0;

    const totalInvoicesOpen = db.prepare(`
      SELECT COUNT(*) AS n
      FROM facturi
      WHERE status IN ('CIORNA','TRIMISA','INTARZIATA') AND company_id=?
    `).get(companyId)?.n || 0;

    const totalRevenueValue = db.prepare(`
      SELECT IFNULL(SUM(price), 0) AS total
      FROM contracts
      WHERE company_id=?
    `).get(companyId)?.total || 0;

    const tasks = db.prepare(`
      SELECT a.id, a.subject, a.note, a.due_at, a.created_at,
             cl.id AS client_id, cl.name AS client_name
      FROM activities a
      JOIN clients cl ON cl.id = a.client_id AND cl.company_id = a.company_id
      WHERE a.type='task' AND a.done=0 AND a.company_id=?
      ORDER BY (a.due_at IS NULL) ASC, a.due_at ASC, a.id DESC
      LIMIT 5
    `).all(companyId);

    const activities = tasks.map((task) => ({
      title: task.subject || "Task fără titlu",
      subtitle: `${task.client_name || "Client"}${task.due_at ? " · scadent " + task.due_at : ""}`
    }));

    const recentInvoices = db.prepare(`
      SELECT f.id, f.factura_nr, f.total, f.moneda, f.data_emitere,
             cl.name AS client_name
      FROM facturi f
      LEFT JOIN clients cl ON cl.id = f.client_id AND cl.company_id = f.company_id
      WHERE f.company_id = ?
      ORDER BY f.id DESC
      LIMIT 3
    `).all(companyId).map((invoice) => ({
      ...invoice,
      display_number: formatInvoiceDisplayNumber(invoice),
      total_formatted: `${fmtMoney(Number(invoice.total || 0))} ${invoice.moneda || "RON"}`
    }));

    const efacturaStatusRows = db.prepare(`
      SELECT IFNULL(efactura_status, 'NULL') AS status, COUNT(*) AS count
      FROM facturi
      WHERE company_id = ?
      GROUP BY IFNULL(efactura_status, 'NULL')
    `).all(companyId);

    const efacturaSummary = efacturaStatusRows.reduce((acc, row) => {
      acc.total += Number(row.count || 0);

      if (row.status === "RASPUNS_DISPONIBIL") {
        acc.responseAvailable += Number(row.count || 0);
      }

      if (row.status === "NULL") {
        acc.missingStatus += Number(row.count || 0);
      }

      return acc;
    }, {
      total: 0,
      responseAvailable: 0,
      missingStatus: 0
    });

    ensureProcurementOpportunitiesSchema(db);
    const euOpportunityNotifications = db.prepare(`
      SELECT n.id, n.message, o.id AS opportunity_id, o.title, o.relevance_score, o.submission_deadline
      FROM procurement_opportunity_notifications n
      JOIN procurement_opportunities o ON o.id=n.opportunity_id AND o.company_id=n.company_id
      WHERE n.company_id=? AND n.status='new'
      ORDER BY o.relevance_score DESC, n.id DESC
      LIMIT 5
    `).all(companyId);

    res.send(renderNexoraDashboardPage({
      user: req.session.user,
      totalRevenue: fmtMoney(totalRevenueValue),
      totalClients,
      totalQuotesOpen,
      totalContracts,
      totalInvoicesOpen,
      openTasks: tasks.length,
      activities,
      recentInvoices,
      efacturaSummary,
      euOpportunityNotifications,
      dashboardConfig: readDashboardConfig(db, req)
    }));
  });

  app.get("/nexora-dashboard/settings", requireAuth, (req, res) => {
    res.type("html").send(renderNexoraDashboardSettingsPage({
      user: req.session.user,
      dashboardConfig: readDashboardConfig(db, req),
      saved: String(req.query?.saved || "")
    }));
  });

  app.post("/nexora-dashboard/settings", requireAuth, (req, res) => {
    writeDashboardConfig(db, req, {
      kpis: asArray(req.body?.kpis),
      panels: asArray(req.body?.panels),
      shortcuts: asArray(req.body?.shortcuts)
    });
    res.redirect("/nexora-dashboard/settings?saved=1");
  });

  app.post("/nexora-dashboard/settings/reset", requireAuth, (req, res) => {
    const companyId = Number(req.session?.user?.company_id || 0);
    const userId = Number(req.session?.user?.id || 0);
    if (companyId && userId) {
      db.prepare("DELETE FROM dashboard_preferences WHERE company_id=? AND user_id=?").run(companyId, userId);
    }
    res.redirect("/nexora-dashboard/settings?saved=1");
  });

  app.get("/nexora/search", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = String(req.query?.q || "").trim();
    const like = `%${q.toLowerCase()}%`;

    const results = q ? {
      clients: db.prepare(`
        SELECT DISTINCT cl.id, cl.name, cl.cui, cl.reg_com, cl.email, cl.phone
        FROM clients cl
        LEFT JOIN contacts ct
          ON ct.client_id = cl.id
         AND COALESCE(ct.company_id, cl.company_id) = cl.company_id
        WHERE cl.company_id = ?
          AND (
            LOWER(COALESCE(cl.name, '')) LIKE ?
            OR LOWER(COALESCE(cl.cui, '')) LIKE ?
            OR LOWER(COALESCE(cl.reg_com, '')) LIKE ?
            OR LOWER(COALESCE(cl.email, '')) LIKE ?
            OR LOWER(COALESCE(cl.phone, '')) LIKE ?
            OR LOWER(COALESCE(ct.name, '')) LIKE ?
            OR LOWER(COALESCE(ct.email, '')) LIKE ?
            OR LOWER(COALESCE(ct.phone, '')) LIKE ?
          )
        ORDER BY cl.name COLLATE NOCASE ASC, cl.id DESC
        LIMIT 5
      `).all(companyId, like, like, like, like, like, like, like, like),
      invoices: db.prepare(`
        SELECT f.id, f.factura_nr, f.total, f.moneda, f.data_emitere, cl.name AS client_name
        FROM facturi f
        LEFT JOIN clients cl ON cl.id = f.client_id AND cl.company_id = f.company_id
        WHERE f.company_id = ?
          AND (
            LOWER(COALESCE(f.factura_nr, '')) LIKE ?
            OR LOWER(COALESCE(cl.name, '')) LIKE ?
            OR LOWER(COALESCE(cl.cui, '')) LIKE ?
          )
        ORDER BY f.id DESC
        LIMIT 5
      `).all(companyId, like, like, like),
      products: db.prepare(`
        SELECT id, code, name, kind, price, unit
        FROM products
        WHERE company_id = ?
          AND (
            LOWER(COALESCE(code, '')) LIKE ?
            OR LOWER(COALESCE(name, '')) LIKE ?
            OR LOWER(COALESCE(kind, '')) LIKE ?
            OR LOWER(COALESCE(lot, '')) LIKE ?
          )
        ORDER BY active DESC, name COLLATE NOCASE ASC, id DESC
        LIMIT 5
      `).all(companyId, like, like, like, like),
      documents: db.prepare(`
        SELECT id, title, category, file_name, file_path, created_at
        FROM tipizate_docs
        WHERE company_id = ?
          AND (
            LOWER(COALESCE(title, '')) LIKE ?
            OR LOWER(COALESCE(category, '')) LIKE ?
            OR LOWER(COALESCE(file_name, '')) LIKE ?
            OR LOWER(COALESCE(registration_number, '')) LIKE ?
          )
        ORDER BY id DESC
        LIMIT 5
      `).all(companyId, like, like, like, like)
    } : {
      clients: [],
      invoices: [],
      products: [],
      documents: []
    };

    const clientRows = results.clients.map((row) => `
      <a class="nx-search-result-row" href="/nexora/clients/${escapeHtml(row.id)}">
        <span class="nx-search-result-type">Client</span>
        <div>
          <b>${escapeHtml(row.name || "Client fără nume")}</b>
          <em>${escapeHtml([row.cui, row.reg_com, row.email || row.phone].filter(Boolean).join(" · ") || "Fără detalii")}</em>
        </div>
        <strong>Deschide</strong>
      </a>
    `);

    const invoiceRows = results.invoices.map((row) => `
      <a class="nx-search-result-row" href="/nexora/facturi/${escapeHtml(row.id)}">
        <span class="nx-search-result-type">Factură</span>
        <div>
          <b>${escapeHtml(formatInvoiceDisplayNumber(row))}</b>
          <em>${escapeHtml([row.client_name || "Client necunoscut", row.data_emitere ? String(row.data_emitere).slice(0, 10) : "", `${fmtMoney(row.total)} ${row.moneda || "RON"}`].filter(Boolean).join(" · "))}</em>
        </div>
        <strong>Deschide</strong>
      </a>
    `);

    const productRows = results.products.map((row) => `
      <a class="nx-search-result-row" href="/nexora/products/${escapeHtml(row.id)}/edit">
        <span class="nx-search-result-type">Produs</span>
        <div>
          <b>${escapeHtml(row.name || "Produs fără nume")}</b>
          <em>${escapeHtml([row.code, row.kind, `${fmtMoney(row.price)} RON`, row.unit].filter(Boolean).join(" · "))}</em>
        </div>
        <strong>Deschide</strong>
      </a>
    `);

    const documentRows = results.documents.map((row) => `
      <a class="nx-search-result-row" href="${escapeHtml(row.file_path ? `/${row.file_path}` : "/nexora/documents")}">
        <span class="nx-search-result-type">Document</span>
        <div>
          <b>${escapeHtml(row.title || "Document fără titlu")}</b>
          <em>${escapeHtml([row.category, row.file_name, row.created_at].filter(Boolean).join(" · ") || "DMS")}</em>
        </div>
        <strong>Deschide</strong>
      </a>
    `);

    const totalResults = Object.values(results).reduce((sum, rows) => sum + rows.length, 0);
    const body = `
      <section class="nx-content-card nx-search-page">
        <div class="nx-section-head">
          <div>
            <h1>Rezultate căutare</h1>
            <p>${q ? `Pentru „${escapeHtml(q)}”` : "Introdu un termen de căutare."}</p>
          </div>
          <div class="nx-count-pill">${escapeHtml(totalResults)} rezultate</div>
        </div>

        <form class="nx-search-results-form" method="get" action="/nexora/search">
          <input name="q" value="${escapeHtml(q)}" aria-label="Caută în ERP" placeholder="Caută în ERP">
          <button class="nx-btn primary" type="submit">Caută</button>
        </form>

        <div class="nx-search-results-grid">
          ${renderSearchResultSection({ title: "Clienți", count: results.clients.length, rows: clientRows, emptyText: "Nu am găsit clienți." })}
          ${renderSearchResultSection({ title: "Facturi", count: results.invoices.length, rows: invoiceRows, emptyText: "Nu am găsit facturi." })}
          ${renderSearchResultSection({ title: "Produse", count: results.products.length, rows: productRows, emptyText: "Nu am găsit produse." })}
          ${renderSearchResultSection({ title: "Documente", count: results.documents.length, rows: documentRows, emptyText: "Nu am găsit documente." })}
        </div>
      </section>
    `;

    res.type("html").send(renderNexoraShell({
      title: "Căutare Nexora ERP",
      appName: "Nexora ERP",
      companyName: req.session.user.company_name || "Workspace",
      currentPath: "/nexora-dashboard",
      eyebrow: "Căutare",
      pageTitle: q ? `Căutare: ${q}` : "Căutare",
      user: req.session.user,
      actionsHtml: `<a class="nx-btn" href="/nexora-dashboard">Dashboard</a>`,
      body
    }));
  });
}
