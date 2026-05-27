import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, currency = "RON") {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} ${String(currency || "RON").toUpperCase()}`;
}

function statusBadge(status = "") {
  const normalized = String(status || "active").trim().toLowerCase();
  const tone = normalized === "active" || normalized === "paid"
    ? "success"
    : normalized === "suspended" || normalized === "failed" || normalized === "archived"
      ? "danger"
      : normalized === "past_due" || normalized === "pending_verification"
        ? "warn"
        : "neutral";
  return `<span class="nx-status-pill ${tone}">${escapeHtml(normalized || "-")}</span>`;
}

function renderKpis(items = []) {
  const colors = ["blue", "green", "orange", "purple", "red"];
  return `
    <section class="nx-kpi-grid invoice-kpis">
      ${items.map((item, index) => `
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon ${colors[index % colors.length]}">${escapeHtml(item.icon || "")}</div>
          <div>
            <div class="nx-kpi-label">${escapeHtml(item.label || "")}</div>
            <div class="nx-kpi-value">${escapeHtml(item.value ?? "-")}</div>
            ${item.hint ? `<div class="nx-kpi-trend ${escapeHtml(item.trend || "")}">${escapeHtml(item.hint)}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </section>
  `;
}

function shell({ title, currentPath, body, actionsHtml = "" }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName: "Platform Admin",
    currentPath,
    eyebrow: "Super admin",
    pageTitle: title,
    actionsHtml,
    isSuperAdmin: true,
    body
  });
}

function renderNexoraSuperAdminDashboardPage(options = {}) {
  const stats = options.stats || {};
  const latestCompanies = Array.isArray(options.latestCompanies) ? options.latestCompanies : [];
  const planUsage = Array.isArray(options.planUsage) ? options.planUsage : [];
  const recentPayments = Array.isArray(options.recentPayments) ? options.recentPayments : [];

  const companyRows = latestCompanies.map((row) => `
    <tr>
      <td>
        <a class="nx-table-main-link" href="/nexora/super-admin/companies/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a>
        <div class="nx-table-sub">${escapeHtml(row.slug || "")}</div>
      </td>
      <td>${escapeHtml(row.cui || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.plan_name || "Fără plan")}</td>
      <td>${escapeHtml(row.users_count || 0)}</td>
      <td>${escapeHtml(row.created_at || "-")}</td>
    </tr>
  `).join("");

  const planRows = planUsage.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.name || row.code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.code || "")}</div></td>
      <td>${escapeHtml(row.companies_count || 0)}</td>
      <td>${escapeHtml(row.users_count || 0)} / ${escapeHtml(row.seats_total || 0)}</td>
    </tr>
  `).join("");

  const paymentRows = recentPayments.map((row) => `
    <tr>
      <td>
        <b>${escapeHtml(row.company_name || "-")}</b>
        <div class="nx-table-sub">${escapeHtml(row.plan_name || "Fără plan")}</div>
      </td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(money(row.amount, row.currency))}</td>
      <td>${escapeHtml(row.payer_email || row.payer_name || "-")}</td>
      <td>${escapeHtml(row.created_at || row.paid_at || "-")}</td>
    </tr>
  `).join("");

  const body = `
    ${renderKpis([
      { icon: "ORG", label: "Companii", value: stats.totalCompanies || 0, hint: `${stats.activeCompanies || 0} active / ${stats.archivedCompanies || 0} arhivate`, trend: "up" },
      { icon: "TR", label: "Trial", value: stats.trialCompanies || 0 },
      { icon: "PD", label: "Past due", value: stats.pastDueCompanies || 0, trend: "warn" },
      { icon: "USR", label: "Utilizatori", value: stats.totalUsers || 0 },
      { icon: "PAY", label: "Plăți urmărite", value: stats.totalPayments || 0 }
    ])}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Control platformă</h1>
          <p>Vedere globală peste companii, abonamente, statusuri și plăți. Accesul este disponibil doar pentru super admin.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/super-admin/companies">Companii</a>
          <a class="nx-btn" href="/nexora/super-admin/payments">Plăți</a>
        </div>
      </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Companii recente</h2><span>${escapeHtml(latestCompanies.length)} tenant-uri</span></div></div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead><tr><th>Companie</th><th>CUI</th><th>Status</th><th>Plan</th><th>Useri</th><th>Creată</th></tr></thead>
            <tbody>${companyRows || `<tr><td colspan="6"><div class="nx-empty-state">Nu există companii.</div></td></tr>`}</tbody>
          </table>
        </div>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Planuri</h2><span>utilizare</span></div></div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead><tr><th>Plan</th><th>Companii</th><th>Utilizatori / locuri</th></tr></thead>
            <tbody>${planRows || `<tr><td colspan="3"><div class="nx-empty-state">Nu există planuri active.</div></td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Plăți recente</h2><p>Ultimele evenimente Stripe sau OP manual.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Companie</th><th>Status</th><th>Sumă</th><th>Plătitor</th><th>Moment</th></tr></thead>
          <tbody>${paymentRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există plăți înregistrate.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  return shell({ title: "Dashboard platformă", currentPath: "/nexora/super-admin", body });
}

function renderNexoraSuperAdminCompaniesPage(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const plans = Array.isArray(options.plans) ? options.plans : [];
  const createPlans = Array.isArray(options.createPlans) ? options.createPlans : [];
  const filters = options.filters || {};
  const lookup = options.lookup || {};
  const ok = String(options.ok || "");
  const err = String(options.err || "");

  const okMessages = {
    created: "Compania a fost verificată în ANAF și tenant-ul a fost creat.",
    archived: "Compania a fost arhivată. Datele sunt păstrate pentru restaurare.",
    restored: "Compania a fost restaurată din arhivă."
  };
  const errorMessages = {
    invalid_cui: "Introdu un CUI valid pentru căutarea în ANAF.",
    anaf_not_found: "CUI-ul nu a fost găsit în registrul ANAF.",
    anaf_unavailable: "Registrul ANAF nu răspunde momentan. Reîncearcă.",
    company_exists: "Există deja un tenant cu acest CUI.",
    missing_fields: "Completează planul, emailul și parola administratorului.",
    short_password: "Parola administratorului trebuie să aibă minimum 8 caractere.",
    user_exists: "Există deja un utilizator cu acest email.",
    invalid_plan: "Planul selectat nu mai este disponibil.",
    create_failed: "Compania nu a putut fi creată.",
    archive_status: "Doar companiile suspendate sau cu plata restantă pot fi arhivate.",
    archived: "Compania este arhivată. Restaureaz-o înainte de a schimba statusul.",
    already_archived: "Compania este deja arhivată.",
    not_archived: "Compania nu este arhivată."
  };
  const alertHtml = [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errorMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");

  const existingTenant = lookup.existingCompany || null;
  const anafCompany = lookup.company || null;
  const lookupResultHtml = anafCompany ? `
    <section class="nx-panel">
      <div class="nx-panel-head">
        <div><h2>Date găsite în ANAF</h2><span>preluate la verificarea CUI-ului</span></div>
      </div>
      <div class="nx-form" style="margin-bottom:16px">
        <div class="nx-settings-note"><b>Denumire</b><span>${escapeHtml(anafCompany.name || "-")}</span></div>
        <div class="nx-settings-note"><b>CUI / RC</b><span>${escapeHtml(anafCompany.cui || "-")} / ${escapeHtml(anafCompany.reg_com || "-")}</span></div>
        <div class="nx-settings-note"><b>Adresă</b><span>${escapeHtml(anafCompany.address || "-")}</span></div>
        <div class="nx-settings-note"><b>Status fiscal</b><span>${Number(anafCompany.inactive || 0) ? "Inactiv ANAF" : "Activ ANAF"} · ${Number(anafCompany.vat || 0) ? "Plătitor TVA" : "Neplătitor TVA"}</span></div>
      </div>
      ${existingTenant ? `
        <div class="nx-alert danger">CUI-ul este deja asociat tenant-ului <b>${escapeHtml(existingTenant.name || "")}</b>.</div>
        <a class="nx-btn" href="/nexora/super-admin/companies/${escapeHtml(existingTenant.id)}">Deschide tenant</a>
      ` : `
        <form method="post" action="/nexora/super-admin/companies/create-from-anaf" class="nx-form">
          <input type="hidden" name="company_cui" value="${escapeHtml(anafCompany.cui || lookup.cui || "")}">
          <label class="nx-field"><span>Plan inițial *</span><select name="plan_id" required>
            ${createPlans.map((plan) => `<option value="${escapeHtml(plan.id || "")}">${escapeHtml(plan.name || plan.code || "")}</option>`).join("")}
          </select></label>
          <label class="nx-field"><span>Reprezentant legal</span><input name="company_rep" placeholder="Nume și prenume"></label>
          <label class="nx-field"><span>Email administrator *</span><input type="email" name="admin_email" required placeholder="admin@companie.ro"></label>
          <label class="nx-field"><span>Parolă administrator *</span><input type="password" name="admin_password" minlength="8" required></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează tenant</button></div>
        </form>
      `}
    </section>
  ` : `
    <section class="nx-panel">
      <div class="nx-panel-head">
        <div><h2>Date firmă</h2><span>ANAF</span></div>
      </div>
      <div class="nx-empty-state">Introdu CUI-ul și apasă „Caută în ANAF” pentru a prelua datele oficiale înainte de creare.</div>
    </section>
  `;

  const tableRows = rows.map((row) => `
    <tr>
      <td>
        <a class="nx-table-main-link" href="/nexora/super-admin/companies/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a>
        <div class="nx-table-sub">${escapeHtml(row.slug || "")}${Number(row.is_demo || 0) ? " · demo" : ""}</div>
      </td>
      <td>${escapeHtml(row.cui || "-")}</td>
      <td>${escapeHtml(row.plan_name || "Fără plan")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.users_count || 0)} / ${escapeHtml(row.seats_included || row.max_users || 0)}</td>
      <td>${escapeHtml(row.clients_count || 0)}</td>
      <td>${escapeHtml(row.contracts_count || 0)}</td>
      <td>${escapeHtml(row.facturi_count || 0)}</td>
      <td class="nx-table-actions">
        <a class="nx-btn" href="/nexora/super-admin/companies/${escapeHtml(row.id)}">Audit</a>
        ${String(row.status || "").toLowerCase() === "archived" || row.archived_at ? `
          <form method="post" action="/nexora/super-admin/companies/${escapeHtml(row.id)}/restore" onsubmit="return confirm('Restaurezi compania din arhivă?');">
            <button class="nx-btn primary" type="submit">Restaurează</button>
          </form>
        ` : ["suspended", "past_due"].includes(String(row.status || "").toLowerCase()) ? `
          <form method="post" action="/nexora/super-admin/companies/${escapeHtml(row.id)}/archive" onsubmit="return confirm('Arhivezi compania? Datele rămân în baza de date și pot fi restaurate.');">
            <button class="nx-btn danger" type="submit">Arhivează</button>
          </form>
        ` : ""}
      </td>
    </tr>
  `).join("");

  const body = `
    ${alertHtml}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Companii</h1>
          <p>Administrare globală tenant-uri: creare din ANAF, status, plan, utilizatori și volum operațional.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/super-admin">Dashboard</a>
          <a class="nx-btn" href="/nexora/super-admin/companies?status=archived">Arhivate</a>
          <a class="nx-btn primary" href="/nexora/super-admin/payments">Plăți</a>
        </div>
      </div>
    </section>

    <section class="nx-content-card" id="anaf-create">
      <div class="nx-section-head">
        <div>
          <h2>Adaugă companie din ANAF</h2>
          <p>Caută după CUI, verifică datele oficiale și creează tenant-ul cu primul administrator.</p>
        </div>
      </div>
      <div class="nx-two-column-grid compact">
        <section class="nx-panel">
          <div class="nx-panel-head">
            <div><h2>Căutare CUI</h2><span>registru oficial ANAF</span></div>
          </div>
          <form method="get" action="/nexora/super-admin/companies#anaf-create" class="nx-form">
            <label class="nx-field"><span>CUI companie *</span><input name="lookup_cui" value="${escapeHtml(lookup.cui || "")}" placeholder="Ex: 48995252" required></label>
            <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Caută în ANAF</button></div>
          </form>
        </section>
        ${lookupResultHtml}
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Filtrează tenant-uri existente</h2><p>Căutarea de mai jos verifică doar companiile deja create în platformă.</p></div></div>
      <form method="get" action="/nexora/super-admin/companies" class="nx-inline-form">
        <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="nume, slug sau CUI"></label>
        <label class="nx-field"><span>Status</span><select name="status">
          ${["all", "trial", "active", "past_due", "suspended", "archived"].map((status) => `<option value="${status}" ${String(filters.status || "all") === status ? "selected" : ""}>${status}</option>`).join("")}
        </select></label>
        <label class="nx-field"><span>Plan</span><select name="plan">
          <option value="all" ${!filters.plan || filters.plan === "all" ? "selected" : ""}>Toate</option>
          ${plans.map((plan) => `<option value="${escapeHtml(plan.code || "")}" ${String(filters.plan || "") === String(plan.code || "").toLowerCase() ? "selected" : ""}>${escapeHtml(plan.name || plan.code || "")}</option>`).join("")}
        </select></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Filtrează</button>
          <a class="nx-btn" href="/nexora/super-admin/companies">Reset</a>
        </div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Lista companii</h2><p>${escapeHtml(rows.length)} rezultate.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Companie</th><th>CUI</th><th>Plan</th><th>Status</th><th>Useri</th><th>Clienți</th><th>Contracte</th><th>Facturi</th><th></th></tr></thead>
          <tbody>${tableRows || `<tr><td colspan="9"><div class="nx-empty-state">Nu există companii pentru filtrele curente.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  return shell({ title: "Companii", currentPath: "/nexora/super-admin/companies", body });
}

function renderNexoraSuperAdminCompanyDetailPage(options = {}) {
  const company = options.company || {};
  const subscription = options.subscription || {};
  const moduleGroups = Array.isArray(options.moduleGroups) ? options.moduleGroups : [];
  const companyModuleLimit = Number(options.companyModuleLimit || 0);
  const stats = options.stats || {};
  const users = Array.isArray(options.users) ? options.users : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const invoices = Array.isArray(options.invoices) ? options.invoices : [];
  const payments = Array.isArray(options.payments) ? options.payments : [];
  const events = Array.isArray(options.events) ? options.events : [];
  const ok = String(options.ok || "");
  const err = String(options.err || "");
  const archived = Boolean(company.archived_at) || String(company.status || "").toLowerCase() === "archived";
  const archivable = ["suspended", "past_due"].includes(String(company.status || "").toLowerCase()) && !archived;
  const alertHtml = ok
    ? `<div class="nx-alert success">${escapeHtml(ok === "archived" ? "Compania a fost arhivată fără ștergerea datelor." : ok === "restored" ? "Compania a fost restaurată din arhivă." : ok === "modules" ? "Modulele active ale companiei au fost actualizate." : "Statusul companiei a fost actualizat.")}</div>`
    : err
      ? `<div class="nx-alert danger">${escapeHtml(err === "archive_status" ? "Arhivarea este disponibilă doar pentru companii suspendate sau past_due." : err === "subscription" ? "Compania nu are un abonament configurat pentru selectarea modulelor." : "Operațiunea nu a putut fi finalizată.")}</div>`
      : "";

  const userRows = users.map((row) => `<tr><td>${escapeHtml(row.email || "-")}</td><td>${escapeHtml(row.role || "-")}</td><td>${statusBadge(row.status)}</td><td>${escapeHtml(row.created_at || "-")}</td></tr>`).join("");
  const clientRows = clients.map((row) => `<tr><td>${escapeHtml(row.name || "-")}</td><td>${escapeHtml(row.cui || "-")}</td><td>${escapeHtml(row.created_at || "-")}</td></tr>`).join("");
  const invoiceRows = invoices.map((row) => `<tr><td>${escapeHtml(row.factura_nr || "-")}</td><td>${statusBadge(row.status)}</td><td>${escapeHtml(money(row.total, row.moneda))}</td><td>${escapeHtml(row.created_at || "-")}</td></tr>`).join("");
  const paymentRows = payments.map((row) => `<tr><td>${escapeHtml(row.source || "-")}</td><td>${statusBadge(row.status)}</td><td>${escapeHtml(money(row.amount, row.currency))}</td><td>${escapeHtml(row.payer_email || row.payer_name || "-")}</td><td>${escapeHtml(row.created_at || row.paid_at || "-")}</td></tr>`).join("");
  const eventRows = events.map((row) => `<tr><td>${escapeHtml(row.created_at || "-")}</td><td>${escapeHtml(row.actor_email || "-")}</td><td>${escapeHtml(row.event_type || "-")}</td><td>${escapeHtml(row.status_from || "-")} -> ${escapeHtml(row.status_to || "-")}</td><td>${escapeHtml(row.reason || "-")}</td></tr>`).join("");
  const activeOptionalModules = moduleGroups
    .flatMap((group) => group.modules || [])
    .filter((module) => module.active && !module.isCoreModule).length;
  const moduleGroupsHtml = moduleGroups.map((group) => `
    <section class="nx-settings-module-group">
      <div class="nx-settings-module-head">
        <div><h3>${escapeHtml(group.label || group.key || "Module")}</h3><p>${escapeHtml(group.description || "")}</p></div>
        <span class="nx-count-pill">${escapeHtml(group.activeCount || 0)} / ${escapeHtml(group.totalCount || 0)}</span>
      </div>
      <div class="nx-module-check-grid">
        ${(group.modules || []).map((module) => `
          <label class="nx-check-row ${module.includedByPlan ? "" : "disabled"}">
            <input type="checkbox" name="module_keys" value="${escapeHtml(module.key)}"
              ${module.active ? "checked" : ""}
              ${module.includedByPlan && !module.isCoreModule ? 'data-super-company-module="1"' : "disabled"}>
            ${module.includedByPlan && module.isCoreModule ? `<input type="hidden" name="module_keys" value="${escapeHtml(module.key)}">` : ""}
            <span>
              <b>${escapeHtml(module.label || module.key)}</b>
              <small>${escapeHtml(module.includedByPlan ? (module.isCoreModule ? "Inclus implicit în plan." : "Disponibil în abonamentul cumpărat.") : "Indisponibil în planul curent.")}</small>
            </span>
          </label>
        `).join("")}
      </div>
    </section>
  `).join("");

  const body = `
    ${alertHtml}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(company.name || "Companie")}</h1>
          <p>Slug: ${escapeHtml(company.slug || "-")} · CUI: ${escapeHtml(company.cui || "-")} · Plan: ${escapeHtml(company.plan_name || "Fără plan")}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/super-admin/companies">Înapoi</a>
          <a class="nx-btn primary" href="/nexora/super-admin/payments?company_id=${escapeHtml(company.id || "")}">Plăți</a>
        </div>
      </div>
    </section>

    ${renderKpis([
      { icon: "USR", label: "Utilizatori", value: stats.users || 0 },
      { icon: "CRM", label: "Clienți", value: stats.clients || 0 },
      { icon: "Q", label: "Oferte", value: stats.quotes || 0 },
      { icon: "CT", label: "Contracte", value: stats.contracts || 0 },
      { icon: "F", label: "Facturi", value: stats.facturi || 0 }
    ])}

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Status tenant</h2><p>${statusBadge(company.status)} ${Number(company.is_demo || 0) ? " · demo" : ""}</p></div></div>
      ${archived ? `
        <div class="nx-alert danger">Compania este arhivată din ${escapeHtml(company.archived_at || "-")} de ${escapeHtml(company.archived_by_email || "-")}. Datele și documentele rămân păstrate.</div>
        ${company.archive_reason ? `<p class="nx-table-sub">Motiv: ${escapeHtml(company.archive_reason)}</p>` : ""}
        <form method="post" action="/nexora/super-admin/companies/${escapeHtml(company.id)}/restore" onsubmit="return confirm('Restaurezi compania și accesul ei din arhivă?');">
          <button class="nx-btn primary" type="submit">Restaurează compania</button>
        </form>
      ` : `<form method="post" action="/nexora/super-admin/companies/${escapeHtml(company.id)}/status" class="nx-inline-form">
        <label class="nx-field"><span>Status nou</span><select name="status">
          ${["trial", "active", "past_due", "suspended"].map((status) => `<option value="${status}" ${String(company.status || "").toLowerCase() === status ? "selected" : ""}>${status}</option>`).join("")}
        </select></label>
        <label class="nx-field nx-field-wide"><span>Motiv</span><input name="reason" value="${escapeHtml(company.suspension_reason || "")}" placeholder="motiv suspendare / reactivare"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează statusul</button></div>
      </form>`}
      ${archivable ? `
        <form method="post" action="/nexora/super-admin/companies/${escapeHtml(company.id)}/archive" class="nx-inline-form" onsubmit="return confirm('Arhivezi compania? Datele rămân în baza de date și pot fi restaurate.');">
          <label class="nx-field nx-field-wide"><span>Motiv arhivare</span><input name="reason" placeholder="companie inactivă / neplată / suspendare"></label>
          <div class="nx-form-actions"><button class="nx-btn danger" type="submit">Arhivează compania</button></div>
        </form>
      ` : ""}
      ${Number(company.is_demo || 0) === 1 && !archived ? `
        <form method="post" action="/nexora/super-admin/companies/${escapeHtml(company.id)}/delete" onsubmit="return confirm('Ștergi definitiv tenantul demo și toate datele lui?');">
          <button class="nx-btn danger" type="submit">Șterge tenant demo</button>
        </form>
      ` : ""}
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h2>Module active companie</h2>
          <p>Configurează modulele livrate prin abonamentul ${escapeHtml(subscription.plan_name || company.plan_name || "curent")}.</p>
        </div>
        <span class="nx-status-pill neutral">${escapeHtml(activeOptionalModules)} active${companyModuleLimit > 0 ? ` / ${escapeHtml(companyModuleLimit)} permise` : ""}</span>
      </div>
      ${subscription.id ? `
        <form method="post" action="/nexora/super-admin/companies/${escapeHtml(company.id)}/modules" class="nx-form">
          ${moduleGroupsHtml}
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează modulele active</button></div>
        </form>
        ${companyModuleLimit > 0 ? `
          <script>
            (function () {
              var limit = ${companyModuleLimit};
              var boxes = Array.from(document.querySelectorAll('input[data-super-company-module="1"]'));
              function sync() {
                var count = boxes.filter(function (box) { return box.checked; }).length;
                boxes.forEach(function (box) { box.disabled = !box.checked && count >= limit; });
              }
              boxes.forEach(function (box) { box.addEventListener("change", sync); });
              sync();
            })();
          </script>
        ` : ""}
      ` : `<div class="nx-empty-state">Compania nu are un abonament configurat.</div>`}
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel"><div class="nx-panel-head"><div><h2>Utilizatori</h2><span>${escapeHtml(users.length)} recenți</span></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Email</th><th>Rol</th><th>Status</th><th>Creat</th></tr></thead><tbody>${userRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există utilizatori.</div></td></tr>`}</tbody></table></div></section>
      <section class="nx-panel"><div class="nx-panel-head"><div><h2>Clienți recenți</h2><span>${escapeHtml(clients.length)}</span></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Client</th><th>CUI</th><th>Creat</th></tr></thead><tbody>${clientRows || `<tr><td colspan="3"><div class="nx-empty-state">Nu există clienți.</div></td></tr>`}</tbody></table></div></section>
    </div>

    <section class="nx-content-card"><div class="nx-section-head"><div><h2>Facturi recente</h2><p>Audit read-only pe tenant.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Factură</th><th>Status</th><th>Total</th><th>Creat</th></tr></thead><tbody>${invoiceRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există facturi.</div></td></tr>`}</tbody></table></div></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h2>Plăți recente</h2><p>Evenimente Stripe / OP pentru companie.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Sursă</th><th>Status</th><th>Sumă</th><th>Plătitor</th><th>Moment</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există plăți.</div></td></tr>`}</tbody></table></div></section>
    <section class="nx-content-card"><div class="nx-section-head"><div><h2>Istoric super admin</h2><p>Modificări de status și acțiuni globale.</p></div></div><div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Actor</th><th>Eveniment</th><th>Status</th><th>Motiv</th></tr></thead><tbody>${eventRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există evenimente.</div></td></tr>`}</tbody></table></div></section>
  `;

  return shell({ title: `Audit ${company.name || ""}`, currentPath: "/nexora/super-admin/companies", body });
}

function renderNexoraSuperAdminPaymentsPage(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const companies = Array.isArray(options.companies) ? options.companies : [];
  const plans = Array.isArray(options.plans) ? options.plans : [];
  const filters = options.filters || {};
  const stats = options.stats || {};

  const paymentRows = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.company_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.plan_name || "Fără plan")}</div></td>
      <td>${escapeHtml(row.source || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(money(row.amount, row.currency))}</td>
      <td>${escapeHtml(row.payer_name || "-")}<div class="nx-table-sub">${escapeHtml(row.payer_email || "")}</div></td>
      <td>${escapeHtml(row.reference_code || row.generated_factura_nr || "-")}</td>
      <td>${escapeHtml(row.paid_at || row.created_at || "-")}</td>
      <td>${escapeHtml(row.failure_reason || row.notes || "-")}</td>
    </tr>
  `).join("");

  const body = `
    ${renderKpis([
      { icon: "PAY", label: "Plăți", value: stats.total || 0 },
      { icon: "ST", label: "Stripe", value: stats.stripe || 0 },
      { icon: "OP", label: "OP", value: stats.op || 0 },
      { icon: "OK", label: "Reușite", value: stats.paid || 0 },
      { icon: "ERR", label: "Eșuate", value: stats.failed || 0 }
    ])}

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre plăți</h2><span>${escapeHtml(rows.length)} rezultate</span></div></div>
        <form method="get" action="/nexora/super-admin/payments" class="nx-form">
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="companie, plătitor, referință"></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Status</span><select name="status">${["all", "initiated", "processing", "pending_verification", "paid", "failed"].map((v) => `<option value="${v}" ${String(filters.status || "all") === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label class="nx-field"><span>Sursă</span><select name="source">${["all", "stripe", "op"].map((v) => `<option value="${v}" ${String(filters.source || "all") === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Plan</span><select name="plan"><option value="all">Toate</option>${plans.map((plan) => `<option value="${escapeHtml(plan.code || "")}" ${String(filters.plan || "") === String(plan.code || "").toLowerCase() ? "selected" : ""}>${escapeHtml(plan.name || plan.code || "")}</option>`).join("")}</select></label>
            <label class="nx-field"><span>Companie</span><select name="company_id"><option value="0">Toate</option>${companies.map((company) => `<option value="${escapeHtml(company.id)}" ${Number(filters.companyId || 0) === Number(company.id) ? "selected" : ""}>${escapeHtml(company.name || "")}</option>`).join("")}</select></label>
          </div>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică</button><a class="nx-btn" href="/nexora/super-admin/payments">Reset</a></div>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Înregistrează OP</h2><span>manual</span></div></div>
        <form method="post" action="/nexora/super-admin/payments/op" class="nx-form">
          <label class="nx-field"><span>Companie</span><select name="company_id" required><option value="">Alege compania</option>${companies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name || "")}</option>`).join("")}</select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Sumă</span><input type="number" step="0.01" min="0" name="amount" required></label>
            <label class="nx-field"><span>Monedă</span><input name="currency" value="RON" maxlength="8"></label>
          </div>
          <label class="nx-field"><span>Plătitor</span><input name="payer_name"></label>
          <label class="nx-field"><span>Email plătitor</span><input type="email" name="payer_email"></label>
          <label class="nx-field"><span>Referință OP</span><input name="reference_code"></label>
          <label class="nx-field"><span>Status</span><select name="status"><option value="pending_verification">pending_verification</option><option value="paid">paid</option><option value="failed">failed</option></select></label>
          <label class="nx-field"><span>Data plății</span><input type="datetime-local" name="paid_at"></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează OP</button></div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Plăți platformă</h1><p>Monitorizare centrală pentru Stripe și OP manual.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Companie</th><th>Sursă</th><th>Status</th><th>Sumă</th><th>Plătitor</th><th>Referință</th><th>Moment</th><th>Detalii</th></tr></thead>
          <tbody>${paymentRows || `<tr><td colspan="8"><div class="nx-empty-state">Nu există plăți pentru filtrele curente.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  return shell({ title: "Plăți platformă", currentPath: "/nexora/super-admin/payments", body });
}

export {
  renderNexoraSuperAdminCompaniesPage,
  renderNexoraSuperAdminCompanyDetailPage,
  renderNexoraSuperAdminDashboardPage,
  renderNexoraSuperAdminPaymentsPage
};
