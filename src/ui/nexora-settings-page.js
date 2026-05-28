import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTab(value = "", canAccessSpv = false) {
  const allowed = new Set(["company", "subscription", "invoice", "logo"]);
  if (canAccessSpv) allowed.add("spv");
  const tab = String(value || "").trim().toLowerCase();
  return allowed.has(tab) ? tab : "company";
}

function fieldValue(settings = {}, key = "", fallback = "") {
  return settings[key] ?? fallback;
}

function statusBadge(status = "") {
  const normalized = String(status || "active").trim().toLowerCase();
  const tone = ["active", "trialing", "paid"].includes(normalized)
    ? "success"
    : ["past_due", "pending", "demo"].includes(normalized)
      ? "warn"
      : "danger";
  return `<span class="nx-status-pill ${tone}">${escapeHtml(normalized || "-")}</span>`;
}

function selected(value, expected) {
  return String(value || "") === String(expected || "") ? "selected" : "";
}

function checked(value) {
  return value ? "checked" : "";
}

function renderFlash(ok = "", err = "") {
  const okMessages = {
    saved: "Setările au fost salvate.",
    subscription: "Abonamentul a fost actualizat.",
    modules: "Modulele active au fost actualizate.",
    logo: "Logo-ul de factură a fost actualizat."
  };
  const errMessages = {
    no_file: "Alege un fișier înainte de upload.",
    modules_contract: "Modulele companiei sunt gestionate de super admin pe baza contractului."
  };

  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function renderTab({ key, label, meta, activeTab }) {
  return `
    <a class="nx-settings-tab ${activeTab === key ? "active" : ""}" href="/nexora/settings?tab=${escapeHtml(key)}">
      <b>${escapeHtml(label)}</b>
      <span>${escapeHtml(meta)}</span>
    </a>
  `;
}

function renderPlanCards({ plans = [], activePlanId = null, isCompanyAdmin = false } = {}) {
  if (!plans.length) {
    return `<div class="nx-empty-state">Nu există planuri publice active.</div>`;
  }

  return plans.map((plan) => {
    const isActive = Number(activePlanId || 0) === Number(plan.id || 0);
    const features = Array.isArray(plan.features) ? plan.features : [];
    return `
      <label class="nx-plan-card ${isActive ? "active" : ""}">
        <input type="radio" name="plan_id" value="${escapeHtml(plan.id)}" ${checked(isActive)} ${isCompanyAdmin ? "" : "disabled"}>
        <span class="nx-plan-content">
          <span class="nx-plan-head">
            <span>
              <b>${escapeHtml(plan.name || "Plan")}</b>
              <small>${escapeHtml(plan.tagline || "")}</small>
            </span>
            <strong>${escapeHtml(plan.pricingLabel || "-")}</strong>
          </span>
          <span class="nx-plan-badges">
            <em>${escapeHtml(plan.moduleLimitCopy || "Acces module")}</em>
            <em>${escapeHtml(plan.chargeCopy || "")}</em>
          </span>
          <span class="nx-plan-description">${escapeHtml(plan.description || "")}</span>
          ${features.length ? `
            <span class="nx-plan-features">
              ${features.map((feature) => `<i>${escapeHtml(feature)}</i>`).join("")}
            </span>
          ` : ""}
        </span>
      </label>
    `;
  }).join("");
}

function renderModuleGroups({ groups = [], canManageCompanyModules = false, companyModuleLimit = 0 } = {}) {
  if (!groups.length) {
    return `<div class="nx-empty-state">Nu există module configurate pentru companie.</div>`;
  }

  return groups.map((group) => `
    <section class="nx-settings-module-group">
      <div class="nx-settings-module-head">
        <div>
          <h3>${escapeHtml(group.label || group.key || "Module")}</h3>
          <p>${escapeHtml(group.description || "")}</p>
        </div>
        <span class="nx-count-pill">${escapeHtml(group.activeCount || 0)} / ${escapeHtml(group.totalCount || 0)}</span>
      </div>
      <div class="nx-module-check-grid">
        ${(group.modules || []).map((item) => `
          <label class="nx-check-row ${item.includedByPlan ? "" : "disabled"}">
            <input
              type="checkbox"
              name="module_keys"
              value="${escapeHtml(item.key)}"
              ${checked(item.active)}
              ${item.includedByPlan && canManageCompanyModules && !item.isCoreModule ? "" : "disabled"}
              ${item.includedByPlan && !item.isCoreModule ? `data-company-module="1"` : ""}
            >
            ${item.includedByPlan && item.isCoreModule ? `<input type="hidden" name="module_keys" value="${escapeHtml(item.key)}">` : ""}
            <span>
              <b>${escapeHtml(item.label || item.key)}</b>
              <small>${escapeHtml(item.copy || "")}</small>
            </span>
          </label>
        `).join("")}
      </div>
    </section>
  `).join("") + (companyModuleLimit > 0 ? `
    <script>
      (function(){
        var limit = ${Number(companyModuleLimit || 0)};
        var boxes = Array.from(document.querySelectorAll('input[data-company-module="1"]'));
        function sync(){
          var checked = boxes.filter(function(input){ return input.checked; }).length;
          boxes.forEach(function(input){ input.disabled = !input.checked && checked >= limit; });
        }
        boxes.forEach(function(input){ input.addEventListener("change", sync); });
        sync();
      })();
    </script>
  ` : "");
}

function renderNexoraSettingsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const company = options.company || {};
  const subscription = options.subscription || {};
  const settings = options.settings || {};
  const canAccessSpvSettings = Boolean(options.canAccessSpvSettings);
  const activeTab = normalizeTab(options.activeTab, canAccessSpvSettings);
  const companyStatus = String(options.companyStatus || company.status || subscription.status || "active").toLowerCase();
  const isCompanyAdmin = Boolean(options.isCompanyAdmin);
  const companyModuleLimit = Number(options.companyModuleLimit || 0);
  const activeOptionalModuleCount = Number(options.activeOptionalModuleCount || 0);
  const canManageCompanyModules = Boolean(options.canManageCompanyModules);
  const stripeBillingConfigured = Boolean(options.stripeBillingConfigured);
  const stripeWebhookConfigured = Boolean(options.stripeWebhookConfigured);
  const activeUserCount = Number(options.activeUserCount || subscription.seats_used || 0);
  const seatsIncluded = Number(subscription.seats_included || company.max_users || 0);

  const tabs = [
    { key: "company", label: "Date firmă", meta: "Identitate, reprezentant, CUI, TVA" },
    { key: "subscription", label: "Abonament & module", meta: "Plan, locuri, acces module" },
    { key: "invoice", label: "Factură", meta: "Serie, culoare, footer PDF" },
    { key: "logo", label: "Logo", meta: "Logo folosit pe facturi" },
    ...(canAccessSpvSettings ? [{ key: "spv", label: "SPV / e-Factura", meta: "ANAF, OAuth, inbox/outbox" }] : [])
  ];

  const body = `
    ${renderFlash(options.ok, options.err)}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">ORG</div><div><div class="nx-kpi-label">Companie</div><div class="nx-kpi-value">${escapeHtml(company.name || companyName)}</div><div class="nx-kpi-trend warn">${escapeHtml(company.cui || "CUI neconfigurat")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">PLAN</div><div><div class="nx-kpi-label">Abonament</div><div class="nx-kpi-value">${escapeHtml(subscription.plan_name || "Fără plan")}</div><div class="nx-kpi-trend up">${statusBadge(companyStatus)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">USR</div><div><div class="nx-kpi-label">Utilizatori</div><div class="nx-kpi-value">${escapeHtml(activeUserCount)} / ${escapeHtml(seatsIncluded || "-")}</div><div class="nx-kpi-trend warn">locuri active</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">MOD</div><div><div class="nx-kpi-label">Module active</div><div class="nx-kpi-value">${escapeHtml(activeOptionalModuleCount)}${companyModuleLimit > 0 ? ` / ${escapeHtml(companyModuleLimit)}` : ""}</div><div class="nx-kpi-trend up">operaționale</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Setări generale</h1>
          <p>Configurare companie, facturare, abonament, module și conectare ANAF pentru workspace-ul curent.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/users">Utilizatori & roluri</a>
          ${canAccessSpvSettings ? `<a class="nx-btn primary" href="/nexora/anaf/status">SPV / e-Factura</a>` : ""}
          <a class="nx-btn" href="/nexora-dashboard">Dashboard</a>
        </div>
      </div>

      <nav class="nx-settings-tabs">
        ${tabs.map((tab) => renderTab({ ...tab, activeTab })).join("")}
      </nav>
    </section>

    <section class="nx-settings-panel ${activeTab === "company" ? "active" : ""}">
      <form method="post" action="/setari" class="nx-form nx-content-card">
        <input type="hidden" name="return_to" value="nexora">
        <input type="hidden" name="settings_tab" value="company">
        <div class="nx-panel-head compact-head">
          <div><h2>Date firmă</h2><span>Date comerciale și fiscale per companie</span></div>
        </div>
        <div class="nx-two-column-grid compact">
          <label class="nx-field"><span>Nume firmă</span><input name="company_name" value="${escapeHtml(fieldValue(settings, "company_name"))}"></label>
          <label class="nx-field"><span>CUI</span><input name="company_cui" value="${escapeHtml(fieldValue(settings, "company_cui"))}"></label>
          <label class="nx-field"><span>Registrul Comerțului</span><input name="company_rc" value="${escapeHtml(fieldValue(settings, "company_rc"))}"></label>
          <label class="nx-field"><span>Reprezentant</span><input name="company_rep" value="${escapeHtml(fieldValue(settings, "company_rep"))}"></label>
          <label class="nx-field"><span>Seria CI reprezentant</span><input name="company_rep_ci_series" value="${escapeHtml(fieldValue(settings, "company_rep_ci_series"))}"></label>
          <label class="nx-field"><span>Număr CI reprezentant</span><input name="company_rep_ci_number" value="${escapeHtml(fieldValue(settings, "company_rep_ci_number"))}"></label>
          <label class="nx-field"><span>CI eliberată de</span><input name="company_rep_ci_issued_by" value="${escapeHtml(fieldValue(settings, "company_rep_ci_issued_by"))}"></label>
          <label class="nx-field"><span>IBAN</span><input name="company_iban" value="${escapeHtml(fieldValue(settings, "company_iban"))}"></label>
          <label class="nx-field"><span>Bancă</span><input name="company_bank" value="${escapeHtml(fieldValue(settings, "company_bank"))}"></label>
          <label class="nx-field"><span>Telefon</span><input name="company_phone" value="${escapeHtml(fieldValue(settings, "company_phone"))}"></label>
          <label class="nx-field"><span>Email</span><input type="email" name="company_email" value="${escapeHtml(fieldValue(settings, "company_email"))}"></label>
          <label class="nx-field"><span>Plătitor TVA</span><select name="company_vat"><option value="0" ${selected(fieldValue(settings, "company_vat", "0"), "0")}>Nu</option><option value="1" ${selected(fieldValue(settings, "company_vat"), "1")}>Da</option></select></label>
          <label class="nx-field"><span>Capital social</span><input name="capital_social" value="${escapeHtml(fieldValue(settings, "capital_social"))}"></label>
        </div>
        <label class="nx-field"><span>Adresă</span><textarea name="company_address">${escapeHtml(fieldValue(settings, "company_address"))}</textarea></label>
        <label class="nx-field"><span>Motiv scutire TVA</span><textarea name="company_vat_exemption_reason">${escapeHtml(fieldValue(settings, "company_vat_exemption_reason"))}</textarea></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Salvează datele firmei</button>
        </div>
      </form>
    </section>

    <section class="nx-settings-panel ${activeTab === "subscription" ? "active" : ""}">
      <div class="nx-two-column-grid settings-columns">
        <div class="nx-content-card">
          <div class="nx-panel-head compact-head">
            <div><h2>Abonament</h2><span>${isCompanyAdmin ? "administrator companie" : "doar administratorul poate modifica"}</span></div>
            ${statusBadge(companyStatus)}
          </div>
          <form method="post" action="/setari/subscription" class="nx-form">
            <input type="hidden" name="return_to" value="nexora">
            ${renderPlanCards({
              plans: options.plans || [],
              activePlanId: subscription.plan_id,
              isCompanyAdmin
            })}
            <div class="nx-form-actions">
              <button class="nx-btn primary" type="submit" ${isCompanyAdmin ? "" : "disabled"}>Salvează abonamentul</button>
              <a class="nx-btn" href="/billing/checkout?return_to=nexora">Stripe checkout</a>
              <a class="nx-btn" href="/billing/portal?return_to=nexora">Portal billing</a>
            </div>
            <div class="nx-settings-note">
              <b>Billing</b>
              <span>${stripeBillingConfigured ? "Stripe este configurat." : "Stripe nu este configurat."} ${stripeWebhookConfigured ? "Webhook activ." : "Webhook lipsă."}</span>
            </div>
          </form>
        </div>

        <form method="post" action="/setari/modules" class="nx-form nx-content-card">
          <input type="hidden" name="return_to" value="nexora">
          <div class="nx-panel-head compact-head">
            <div><h2>Module active</h2><span>${companyModuleLimit > 0 ? `limită contract: ${escapeHtml(companyModuleLimit)} module operaționale` : "stabilite prin contract"}</span></div>
          </div>
          <div class="nx-settings-note">
            <b>Contract companie</b>
            <span>Modulele active sunt setate de super admin pentru companie. Accesul pentru fiecare persoană se acordă în Utilizatori & roluri.</span>
          </div>
          ${renderModuleGroups({
            groups: options.moduleGroups || [],
            canManageCompanyModules,
            companyModuleLimit
          })}
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit" ${canManageCompanyModules ? "" : "disabled"}>Salvează modulele</button>
            <a class="nx-btn" href="/nexora/users">Utilizatori & roluri</a>
          </div>
        </form>
      </div>
    </section>

    <section class="nx-settings-panel ${activeTab === "invoice" ? "active" : ""}">
      <form method="post" action="/setari" class="nx-form nx-content-card">
        <input type="hidden" name="return_to" value="nexora">
        <input type="hidden" name="settings_tab" value="invoice">
        <div class="nx-panel-head compact-head">
          <div><h2>Setări factură</h2><span>Numerotare, culoare PDF și footer</span></div>
        </div>
        <div class="nx-two-column-grid compact">
          <label class="nx-field"><span>Serie / număr de pornire</span><input name="invoice_series" value="${escapeHtml(fieldValue(settings, "invoice_series", "INV"))}"><small class="nx-field-hint">Exemple: INV sau FITS-049.</small></label>
          <label class="nx-field"><span>Culoare factură</span><input type="color" name="invoice_color" value="${escapeHtml(fieldValue(settings, "invoice_color", "#39a935"))}"></label>
        </div>
        <label class="nx-field"><span>Footer factură</span><textarea name="invoice_footer">${escapeHtml(fieldValue(settings, "invoice_footer", "Factura este valabila fara semnatura conform legii."))}</textarea></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Salvează factura</button>
        </div>
      </form>
    </section>

    <section class="nx-settings-panel ${activeTab === "logo" ? "active" : ""}">
      <form method="post" action="/setari/logo" enctype="multipart/form-data" class="nx-form nx-content-card">
        <input type="hidden" name="return_to" value="nexora">
        <div class="nx-panel-head compact-head">
          <div><h2>Logo factură</h2><span>Fișier separat pentru compania curentă</span></div>
        </div>
        <label class="nx-field"><span>Logo</span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Upload logo</button>
        </div>
      </form>
    </section>

    ${canAccessSpvSettings ? `
      <section class="nx-settings-panel ${activeTab === "spv" ? "active" : ""}">
        <form method="post" action="/setari" class="nx-form nx-content-card">
          <input type="hidden" name="return_to" value="nexora">
          <input type="hidden" name="settings_tab" value="spv">
          <div class="nx-panel-head compact-head">
            <div><h2>SPV / e-Factura</h2><span>Configurare ANAF pentru compania curentă</span></div>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Mediu ANAF</span><select name="anaf_environment"><option value="test" ${selected(fieldValue(settings, "anaf_environment", "test"), "test")}>Test</option><option value="prod" ${selected(fieldValue(settings, "anaf_environment"), "prod")}>Producție</option></select></label>
            <label class="nx-field"><span>Redirect URI</span><input name="anaf_redirect_uri" value="${escapeHtml(fieldValue(settings, "anaf_redirect_uri"))}"></label>
          </div>
          <label class="nx-field"><span>Client ID</span><input name="anaf_client_id" value="${escapeHtml(fieldValue(settings, "anaf_client_id"))}"></label>
          <label class="nx-field"><span>Client Secret</span><input type="password" name="anaf_client_secret" value="${escapeHtml(fieldValue(settings, "anaf_client_secret"))}"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Salvează ANAF</button>
            <a class="nx-btn" href="/oauth/anaf/start?return_to=nexora">Conectează SPV</a>
            <a class="nx-btn" href="/nexora/anaf/status">Status ANAF</a>
            <a class="nx-btn" href="/nexora/anaf/inbox">Inbox / sincronizare</a>
            <a class="nx-btn" href="/nexora/anaf/outbox">Outbox</a>
          </div>
        </form>
      </section>
    ` : ""}
  `;

  return renderNexoraShell({
    title: "Setări generale",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/settings",
    eyebrow: "Administrare",
    pageTitle: "Setări generale",
    body
  });
}

export {
  renderNexoraSettingsPage
};
