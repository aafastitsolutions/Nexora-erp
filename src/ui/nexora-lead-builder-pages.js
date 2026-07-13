import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateValue(value = "") {
  return String(value || "").slice(0, 16).replace("T", " ");
}

function selected(actual = "", expected = "") {
  return String(actual || "") === String(expected || "") ? "selected" : "";
}

function checked(value) {
  return Number(value || 0) === 1 || value === true || String(value || "").toLowerCase() === "on" ? "checked" : "";
}

function statusBadge(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["completed", "verificat", "prioritar", "pregatit_contact", "client_activ", "active", "valid", "probabil_valid"].includes(normalized)) {
    return `<span class="nx-status-pill success">${escapeHtml(normalized || "-")}</span>`;
  }
  if (["running", "queued", "nou", "draft", "ready", "date_incomplete", "neverificat"].includes(normalized)) {
    return `<span class="nx-status-pill warn">${escapeHtml(normalized || "-")}</span>`;
  }
  if (["failed", "stopped", "invalid", "refuzat", "nu_mai_contacta", "indisponibil"].includes(normalized)) {
    return `<span class="nx-status-pill danger">${escapeHtml(normalized || "-")}</span>`;
  }
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized || "-")}</span>`;
}

function queryString(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    if (value != null && String(value).trim() !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function renderLeadBuilderNav(activePath = "/nexora/lead-builder") {
  const items = [
    ["Dashboard", "/nexora/lead-builder"],
    ["Cautare noua", "/nexora/lead-builder/searches/new"],
    ["Leaduri", "/nexora/lead-builder/leads"],
    ["Aprobare mesaje", "/nexora/lead-builder/approval"],
    ["Surse", "/nexora/lead-builder/sources"],
    ["CRM", "/nexora/crm"]
  ];
  return `
    <div class="nx-module-tabs">
      ${items.map(([label, href]) => `<a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function renderLeadBuilderShell({ title, companyName, user, currentPath, body, actionsHtml = "" }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath,
    eyebrow: "CRM",
    pageTitle: title,
    actionsHtml,
    body: `${renderLeadBuilderNav(currentPath)}${body}`
  });
}

function renderFlash(ok = "", err = "") {
  const success = {
    saved: "Inregistrarea a fost salvata.",
    queued: "Jobul a fost pus in coada.",
    running: "Jobul a pornit.",
    updated: "Modificarile au fost salvate.",
    crm: "Leadul a fost trimis in CRM.",
    messages: "Drafturile au fost regenerate.",
    pilot: "Campania pilot este pregatita.",
    approval_ready: "Top 50 este pregatit pentru aprobare."
  };
  const errors = {
    required: "Completeaza campurile obligatorii.",
    missing: "Inregistrarea nu a fost gasita.",
    save_failed: "Nu am putut salva modificarea.",
    job_failed: "Jobul nu a putut porni.",
    crm_failed: "Leadul nu a putut fi trimis in CRM."
  };
  if (ok) return `<div class="nx-alert success">${escapeHtml(success[ok] || success.saved)}</div>`;
  if (err) return `<div class="nx-alert danger">${escapeHtml(errors[err] || errors.save_failed)}</div>`;
  return "";
}

function smallRows(rows = [], labelKey = "label") {
  if (!rows.length) return `<tr><td colspan="2"><div class="nx-empty-state">Nu exista date.</div></td></tr>`;
  return rows.map((row) => `
    <tr>
      <td>${escapeHtml(row[labelKey] || "-")}</td>
      <td class="nx-right"><b>${escapeHtml(row.total || 0)}</b></td>
    </tr>
  `).join("");
}

function renderDashboardPage(options = {}) {
  const data = options.data || {};
  const stats = data.stats || {};
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  const campaignRows = campaigns.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.category || "-")} · ${escapeHtml(row.county || "-")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td class="nx-right">${escapeHtml(row.lead_count || 0)}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/lead-builder/campaigns/${escapeHtml(row.id)}/run">
          <button class="nx-btn" type="submit">Porneste</button>
        </form>
        <a class="nx-btn" href="/nexora/lead-builder/campaigns/${escapeHtml(row.id)}/approval">Aprobare</a>
      </td>
    </tr>
  `).join("");

  const jobRows = jobs.map((row) => `
    <tr>
      <td><b>#${escapeHtml(row.id)}</b><div class="nx-table-sub">${escapeHtml(row.search_name || row.job_type || "-")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.progress || 0)}%</td>
      <td>${escapeHtml(row.success_count || 0)} / ${escapeHtml(row.failed_count || 0)}</td>
      <td class="nx-table-actions">
        ${["queued", "failed", "stopped"].includes(String(row.status || "")) ? `
          <form method="post" action="/nexora/lead-builder/jobs/${escapeHtml(row.id)}/run">
            <button class="nx-btn" type="submit">Ruleaza</button>
          </form>
        ` : ""}
      </td>
    </tr>
  `).join("");

  const body = `
    ${renderFlash(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Lead Builder</h1>
          <p>Colectare, verificare si calificare automata a potentialilor clienti.</p>
        </div>
        <div class="nx-form-actions">
          <form method="post" action="/nexora/lead-builder/pilot/prahova">
            <button class="nx-btn" type="submit">Pregateste pilot Prahova</button>
          </form>
          <a class="nx-btn primary" href="/nexora/lead-builder/searches/new">Cautare noua</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">LD</div><div><div class="nx-kpi-label">Leaduri colectate</div><div class="nx-kpi-value">${escapeHtml(stats.total_leads || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Verificate</div><div class="nx-kpi-value">${escapeHtml(stats.verified_leads || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">@</div><div><div class="nx-kpi-label">Cu email</div><div class="nx-kpi-value">${escapeHtml(stats.with_email || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">TEL</div><div><div class="nx-kpi-label">Cu telefon</div><div class="nx-kpi-value">${escapeHtml(stats.with_phone || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">80</div><div><div class="nx-kpi-label">Prioritare</div><div class="nx-kpi-value">${escapeHtml(stats.priority_leads || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Distributie pe judete</h2></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><tbody>${smallRows(data.byCounty || [])}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Distributie pe scor</h2></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><tbody>${smallRows(data.byScore || [])}</tbody></table></div>
      </section>
    </div>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Campanii</h2></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Campanie</th><th>Status</th><th class="nx-right">Leaduri</th><th></th></tr></thead><tbody>${campaignRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu exista campanii.</div></td></tr>`}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Joburi recente</h2></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Job</th><th>Status</th><th>Progres</th><th>OK / erori</th><th></th></tr></thead><tbody>${jobRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu exista joburi.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>
  `;

  return renderLeadBuilderShell({
    title: "Lead Builder",
    companyName: options.companyName,
    user: options.user,
    currentPath: "/nexora/lead-builder",
    body
  });
}

function sourceCheckboxes(sources = [], selectedKeys = ["openstreetmap", "public_website"]) {
  const selectedSet = new Set(selectedKeys);
  return sources.map((source) => `
    <label class="nx-check-field">
      <input type="checkbox" name="sources" value="${escapeHtml(source.source_key)}" ${selectedSet.has(source.source_key) ? "checked" : ""} ${Number(source.is_active || 0) !== 1 ? "disabled" : ""}>
      <span>${escapeHtml(source.name || source.source_key)}</span>
    </label>
  `).join("");
}

function renderSearchNewPage(options = {}) {
  const categories = options.categories || [];
  const sources = options.sources || [];
  const categoryOptionsHtml = categories.map((item) => `<option value="${escapeHtml(item.key)}" ${selected(item.key, "auto_dealers")}>${escapeHtml(item.label)}</option>`).join("");
  const body = `
    ${renderFlash(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Cautare noua</h1>
          <p>Defineste zona, categoria si sursele pentru jobul Lead Builder.</p>
        </div>
      </div>
      <form method="post" action="/nexora/lead-builder/searches" class="nx-inline-form">
        <label class="nx-field"><span>Denumirea campaniei</span><input name="campaign_name" value="Dealeri Auto Prahova – Lansare E-MARQET" required></label>
        <label class="nx-field"><span>Domeniu</span><input name="activity_domain" value="Auto"></label>
        <label class="nx-field"><span>Categorie</span><select name="category">${categoryOptionsHtml}</select></label>
        <label class="nx-field"><span>Numar maxim</span><input type="number" min="1" max="5000" name="max_results" value="200"></label>
        <label class="nx-field nx-field-wide"><span>Cuvinte cheie</span><textarea name="keywords" rows="3">parc auto Prahova, dealer auto Prahova, mașini rulate Prahova, autoturisme second-hand Prahova, parc auto Ploiești, dealer auto Ploiești, parc auto Blejoi, parc auto Câmpina, parc auto Băicoi, vânzări auto Prahova, autoturisme în rate Prahova</textarea></label>
        <label class="nx-field"><span>Tara</span><input name="country" value="Romania"></label>
        <label class="nx-field"><span>Judet</span><input name="county" value="Prahova"></label>
        <label class="nx-field"><span>Orase</span><input name="city" value="Ploiești, Blejoi, Bucov, Câmpina, Băicoi, Boldești-Scăeni, Vălenii de Munte, Urlați, Mizil, Breaza, Sinaia"></label>
        <label class="nx-field"><span>Raza km</span><input type="number" min="1" max="100" step="1" name="radius_km" value="22"></label>
        <div class="nx-field-wide">
          <div class="nx-section-head"><div><h2>Surse activate</h2></div></div>
          <div class="nx-two-column-grid compact">${sourceCheckboxes(sources)}</div>
        </div>
        <div class="nx-field-wide">
          <div class="nx-section-head"><div><h2>Colectare si verificari</h2></div></div>
          <div class="nx-two-column-grid compact">
            ${[
              ["collect_email", "Colecteaza email"],
              ["collect_phone", "Colecteaza telefon"],
              ["collect_website", "Colecteaza website"],
              ["collect_facebook", "Colecteaza Facebook"],
              ["collect_instagram", "Colecteaza Instagram"],
              ["collect_linkedin", "Colecteaza LinkedIn"],
              ["collect_address", "Colecteaza adresa"],
              ["identify_contact_person", "Identifica persoana contact"],
              ["identify_external_platforms", "Identifica platforme externe"],
              ["check_online_store", "Verifica magazin/catalog online"],
              ["check_existing_crm", "Verifica CRM"],
              ["check_existing_emarqet", "Verifica E-MARQET"],
              ["auto_sync_crm", "Salveaza in CRM"]
            ].map(([name, label]) => `<label class="nx-check-field"><input type="checkbox" name="${name}" value="1" checked><span>${escapeHtml(label)}</span></label>`).join("")}
          </div>
        </div>
        <div class="nx-form-actions">
          <button class="nx-btn" type="submit" name="run_now" value="0">Salveaza cautarea</button>
          <button class="nx-btn primary" type="submit" name="run_now" value="1">Salveaza si porneste</button>
        </div>
      </form>
    </section>
  `;
  return renderLeadBuilderShell({
    title: "Lead Builder - Cautare noua",
    companyName: options.companyName,
    user: options.user,
    currentPath: "/nexora/lead-builder/searches/new",
    body
  });
}

function leadFilterForm(filters = {}) {
  return `
    <form method="get" action="/nexora/lead-builder/leads" class="nx-inline-form">
      <label class="nx-field"><span>Cautare</span><input name="q" value="${escapeHtml(filters.q || "")}"></label>
      <label class="nx-field"><span>Categorie</span><input name="category" value="${escapeHtml(filters.category || "")}"></label>
      <label class="nx-field"><span>Judet</span><input name="county" value="${escapeHtml(filters.county || "")}"></label>
      <label class="nx-field"><span>Oras</span><input name="city" value="${escapeHtml(filters.city || "")}"></label>
      <label class="nx-field"><span>Scor minim</span><input type="number" min="0" max="100" name="min_score" value="${escapeHtml(filters.min_score || "")}"></label>
      <label class="nx-field"><span>Status</span><input name="status" value="${escapeHtml(filters.status || "")}"></label>
      <label class="nx-check-field"><input type="checkbox" name="has_email" value="1" ${checked(filters.has_email)}><span>Are email</span></label>
      <label class="nx-check-field"><input type="checkbox" name="has_phone" value="1" ${checked(filters.has_phone)}><span>Are telefon</span></label>
      <label class="nx-check-field"><input type="checkbox" name="has_website" value="1" ${checked(filters.has_website)}><span>Are website</span></label>
      <label class="nx-check-field"><input type="checkbox" name="google_found" value="1" ${checked(filters.google_found)}><span>Gasit in Google</span></label>
      <label class="nx-check-field"><input type="checkbox" name="google_confirmed" value="1" ${checked(filters.google_confirmed)}><span>Potrivire confirmata</span></label>
      <label class="nx-check-field"><input type="checkbox" name="google_needs_review" value="1" ${checked(filters.google_needs_review)}><span>Necesita verificare</span></label>
      <label class="nx-field"><span>Tip Google</span><input name="google_category" value="${escapeHtml(filters.google_category || "")}" placeholder="market"></label>
      <label class="nx-field"><span>Status Google</span><input name="google_business_status" value="${escapeHtml(filters.google_business_status || "")}" placeholder="OPERATIONAL"></label>
      <label class="nx-check-field"><input type="checkbox" name="duplicate" value="1" ${checked(filters.duplicate)}><span>Duplicat</span></label>
      <div class="nx-form-actions">
        <button class="nx-btn primary" type="submit">Aplica</button>
        <a class="nx-btn" href="/nexora/lead-builder/leads">Reset</a>
      </div>
    </form>
  `;
}

function renderLeadsPage(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const filters = options.filters || {};
  const exportHref = `/nexora/lead-builder/leads/export.csv${queryString(filters)}`;
  const rowsHtml = rows.map((row) => `
    <tr>
      <td><input type="checkbox" name="lead_ids" value="${escapeHtml(row.id)}"></td>
      <td>
        <a class="nx-table-main-link" href="/nexora/lead-builder/leads/${escapeHtml(row.id)}">${escapeHtml(row.commercial_name || "-")}</a>
        <div class="nx-table-sub">${escapeHtml(row.legal_name || "")}</div>
      </td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td>${escapeHtml(row.city || "-")}<div class="nx-table-sub">${escapeHtml(row.county || "")}</div></td>
      <td>${row.primary_email ? `<a class="nx-table-main-link" href="mailto:${escapeHtml(row.primary_email)}">${escapeHtml(row.primary_email)}</a>` : "-"}</td>
      <td>${escapeHtml(row.primary_phone || "-")}</td>
      <td>${row.website ? `<a class="nx-table-main-link" href="${escapeHtml(row.website)}" target="_blank" rel="noreferrer">website</a>` : "-"}</td>
      <td>${row.google_place_id ? `${statusBadge(row.google_match_status || "google")}<div class="nx-table-sub">${escapeHtml(row.google_category || "-")} ${row.google_match_score ? `· scor ${escapeHtml(row.google_match_score)}` : ""}</div>` : "-"}</td>
      <td class="nx-right">${escapeHtml(row.estimated_items_count || 0)}</td>
      <td><b>${escapeHtml(row.score || 0)}</b><div class="nx-table-sub">${escapeHtml(row.score_category || "-")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.main_source || "-")}</td>
      <td>${escapeHtml(dateValue(row.last_checked_at) || "-")}</td>
    </tr>
  `).join("");
  const body = `
    ${renderFlash(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Leaduri</h1><p>Lista consolidata cu filtre, export si actiuni CRM.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="${escapeHtml(exportHref)}">Export CSV</a>
          <a class="nx-btn primary" href="/nexora/lead-builder/searches/new">Cautare noua</a>
        </div>
      </div>
      ${leadFilterForm(filters)}
      <details class="nx-content-card" style="margin-bottom:12px">
        <summary><b>Import CSV</b></summary>
        <form method="post" action="/nexora/lead-builder/import/csv" class="nx-inline-form" style="margin-top:12px">
          <label class="nx-field"><span>Campanie</span><input name="campaign_name" value="Import manual Lead Builder"></label>
          <label class="nx-field"><span>Categorie</span><input name="category" value="auto_dealers"></label>
          <label class="nx-field"><span>Tara</span><input name="country" value="Romania"></label>
          <label class="nx-field"><span>Judet</span><input name="county" value="${escapeHtml(filters.county || "")}"></label>
          <label class="nx-field nx-field-wide"><span>CSV</span><textarea name="csv_text" rows="6" placeholder="Company Name,Email Address,Phone,Website URL,County,City"></textarea></label>
          <label class="nx-check-field"><input type="checkbox" name="enrich_websites" value="1"><span>Imbogateste website-uri</span></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Importa</button></div>
        </form>
      </details>
      <form method="post" action="/nexora/lead-builder/leads/bulk">
        <div class="nx-form-actions" style="margin-bottom:10px">
          <select name="bulk_action">
            <option value="crm">Trimite in CRM</option>
            <option value="drafts">Regenereaza drafturi</option>
            <option value="status_prioritar">Marcheaza prioritar</option>
            <option value="do_not_contact">Nu mai contacta</option>
          </select>
          <button class="nx-btn" type="submit">Aplica selectiei</button>
        </div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead><tr><th></th><th>Companie</th><th>Categorie</th><th>Zona</th><th>Email</th><th>Telefon</th><th>Website</th><th>Google</th><th class="nx-right">Anunturi</th><th>Scor</th><th>Status</th><th>Sursa</th><th>Verificare</th></tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="13"><div class="nx-empty-state">Nu exista leaduri pentru filtrele curente.</div></td></tr>`}</tbody>
          </table>
        </div>
      </form>
    </section>
  `;
  return renderLeadBuilderShell({
    title: "Lead Builder - Leaduri",
    companyName: options.companyName,
    user: options.user,
    currentPath: "/nexora/lead-builder/leads",
    body
  });
}

function renderMessages(messages = []) {
  if (!messages.length) return `<div class="nx-empty-state">Nu exista drafturi generate.</div>`;
  return messages.map((message) => `
    <details class="nx-content-card" style="margin-bottom:10px">
      <summary><b>${escapeHtml(message.message_type || "-")}</b> ${statusBadge(message.status)} ${message.subject ? `· ${escapeHtml(message.subject)}` : ""}</summary>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.45">${escapeHtml(message.body || "")}</pre>
    </details>
  `).join("");
}

function renderGoogleBusiness(detail = {}, lead = {}) {
  const matches = Array.isArray(detail.googleMatches) ? detail.googleMatches : [];
  const match = matches[0] || {};
  const matchId = match.id || "";
  const leadId = lead.lead_id || lead.id;
  const google = {
    google_place_id: match.google_place_id || lead.google_place_id,
    google_name: match.google_name || lead.google_name,
    google_phone: match.google_phone || lead.google_phone,
    google_website: match.google_website || lead.google_website,
    google_address: match.google_address || lead.google_address,
    google_locality: match.google_locality || lead.google_locality,
    google_category: match.google_category || lead.google_category,
    google_rating: match.google_rating || lead.google_rating,
    google_review_count: match.google_review_count ?? lead.google_review_count,
    google_business_status: match.google_business_status || lead.google_business_status,
    google_maps_uri: match.google_maps_uri || lead.google_maps_uri,
    google_match_score: match.match_score || lead.google_match_score,
    google_match_status: match.match_status || lead.google_match_status,
    google_last_checked_at: match.last_checked_at || lead.google_last_checked_at
  };
  const row = (label, value, html = "") => `
    <div><span>${escapeHtml(label)}</span><b>${html || escapeHtml(value || "-")}</b></div>
  `;
  return `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h2>Google Business</h2></div>
        <div class="nx-form-actions">
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(leadId)}/google/search">
            <button class="nx-btn primary" type="submit">Cauta in Google</button>
          </form>
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(leadId)}/google/search">
            <button class="nx-btn" type="submit">Actualizeaza date</button>
          </form>
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(leadId)}/google/confirm">
            <input type="hidden" name="match_id" value="${escapeHtml(matchId)}">
            <button class="nx-btn" type="submit" ${matchId ? "" : "disabled"}>Confirma potrivirea</button>
          </form>
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(leadId)}/google/reject">
            <input type="hidden" name="match_id" value="${escapeHtml(matchId)}">
            <button class="nx-btn danger" type="submit" ${matchId ? "" : "disabled"}>Respinge potrivirea</button>
          </form>
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(leadId)}/google/website-email">
            <button class="nx-btn" type="submit" ${google.google_website || lead.website ? "" : "disabled"}>Cauta email pe website</button>
          </form>
        </div>
      </div>
      <div class="nx-client-info-grid">
        ${row("Google Place ID", google.google_place_id)}
        ${row("Denumire Google", google.google_name)}
        ${row("Telefon Google", google.google_phone)}
        ${row("Website Google", google.google_website, google.google_website ? `<a href="${escapeHtml(google.google_website)}" target="_blank" rel="noreferrer">${escapeHtml(google.google_website)}</a>` : "")}
        ${row("Adresa", google.google_address)}
        ${row("Localitate", google.google_locality)}
        ${row("Categorie", google.google_category)}
        ${row("Rating", google.google_rating ? `${google.google_rating} / ${escapeHtml(google.google_review_count || 0)} recenzii` : "-")}
        ${row("Status operational", google.google_business_status)}
        ${row("Google Maps", google.google_maps_uri, google.google_maps_uri ? `<a href="${escapeHtml(google.google_maps_uri)}" target="_blank" rel="noreferrer">deschide profilul</a>` : "")}
        ${row("Scor potrivire", google.google_match_score)}
        ${row("Ultima actualizare", dateValue(google.google_last_checked_at))}
        ${row("Status verificare", google.google_match_status)}
      </div>
    </section>
  `;
}

function renderLeadDetailPage(options = {}) {
  const detail = options.detail || {};
  const lead = detail.lead || {};
  const insight = (detail.insights || [])[0] || {};
  const body = `
    ${renderFlash(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(lead.commercial_name || lead.title || "Lead")}</h1>
          <p>${escapeHtml([lead.category, lead.city, lead.county].filter(Boolean).join(" · "))}</p>
        </div>
        <div class="nx-form-actions">
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(lead.lead_id || lead.id)}/crm">
            <button class="nx-btn primary" type="submit">Trimite in CRM</button>
          </form>
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(lead.lead_id || lead.id)}/messages">
            <button class="nx-btn" type="submit">Regenerare drafturi</button>
          </form>
          <a class="nx-btn" href="/nexora/lead-builder/leads">Inapoi</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">${escapeHtml(lead.score || 0)}</div><div><div class="nx-kpi-label">Scor</div><div class="nx-kpi-value">${escapeHtml(lead.score_category || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">@</div><div><div class="nx-kpi-label">Email</div><div class="nx-kpi-value">${escapeHtml(lead.primary_email || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">T</div><div><div class="nx-kpi-label">Telefon</div><div class="nx-kpi-value">${escapeHtml(lead.primary_phone || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">CRM</div><div><div class="nx-kpi-label">CRM lead</div><div class="nx-kpi-value">${escapeHtml(lead.crm_lead_id || "-")}</div></div></div>
    </section>

    <div class="nx-client-layout">
      <div class="nx-client-main">
        <section class="nx-content-card">
          <div class="nx-section-head"><div><h2>Date companie</h2></div></div>
          <div class="nx-client-info-grid">
            <div><span>Denumire comerciala</span><b>${escapeHtml(lead.commercial_name || "-")}</b></div>
            <div><span>Denumire juridica</span><b>${escapeHtml(lead.legal_name || "-")}</b></div>
            <div><span>CUI</span><b>${escapeHtml(lead.cui || "-")}</b></div>
            <div><span>Website</span><b>${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noreferrer">${escapeHtml(lead.website)}</a>` : "-"}</b></div>
            <div><span>Adresa</span><b>${escapeHtml([lead.address, lead.city, lead.county].filter(Boolean).join(", ") || "-")}</b></div>
            <div><span>Sursa</span><b>${lead.source_url ? `<a href="${escapeHtml(lead.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(lead.main_source || "sursa")}</a>` : escapeHtml(lead.main_source || "-")}</b></div>
            <div><span>Catalog online</span><b>${Number(lead.has_online_catalog || 0) ? "da" : "nu"}</b></div>
            <div><span>Anunturi estimate</span><b>${escapeHtml(lead.estimated_items_count || 0)}</b></div>
            <div><span>Verificare</span><b>${escapeHtml(lead.verification_status || "-")}</b></div>
          </div>
        </section>

        ${renderGoogleBusiness(detail, lead)}

        <section class="nx-content-card">
          <div class="nx-section-head"><div><h2>Lead Intelligence</h2></div></div>
          <p style="white-space:pre-wrap">${escapeHtml(insight.analysis_text || "-")}</p>
          <p style="white-space:pre-wrap">${escapeHtml(insight.recommendation_text || "")}</p>
          <div class="nx-empty-state">Metoda recomandata: ${escapeHtml(insight.best_contact_method || "-")}</div>
        </section>

        <section class="nx-content-card">
          <div class="nx-section-head"><div><h2>Mesaje draft</h2></div></div>
          ${renderMessages(detail.messages || [])}
        </section>
      </div>

      <aside class="nx-client-side">
        <section class="nx-content-card">
          <div class="nx-section-head"><div><h2>Status</h2></div></div>
          <form method="post" action="/nexora/lead-builder/leads/${escapeHtml(lead.lead_id || lead.id)}/status" class="nx-form">
            <label class="nx-field"><span>Status</span><select name="status">
              ${options.statuses.map((status) => `<option value="${escapeHtml(status)}" ${selected(status, lead.status)}>${escapeHtml(status)}</option>`).join("")}
            </select></label>
            <label class="nx-field"><span>Nota</span><textarea name="note"></textarea></label>
            <button class="nx-btn primary" type="submit">Salveaza</button>
          </form>
        </section>
        <section class="nx-content-card">
          <div class="nx-section-head"><div><h2>Contacte</h2></div></div>
          <div class="nx-table-wrap"><table class="nx-table"><tbody>
            ${(detail.emails || []).map((row) => `<tr><td>${escapeHtml(row.email)}</td><td>${statusBadge(row.validation_status)}</td></tr>`).join("")}
            ${(detail.phones || []).map((row) => `<tr><td>${escapeHtml(row.phone_normalized)}</td><td>${escapeHtml(row.phone_type || "-")}</td></tr>`).join("")}
          </tbody></table></div>
        </section>
        <section class="nx-content-card">
          <div class="nx-section-head"><div><h2>Istoric</h2></div></div>
          <div class="nx-timeline">
            ${(detail.history || []).map((row) => `<div class="nx-timeline-item"><div class="nx-timeline-dot"></div><div><b>${escapeHtml(row.status_to || row.activity_type || "-")}</b><span>${escapeHtml(dateValue(row.created_at))} ${row.note ? `· ${escapeHtml(row.note)}` : ""}</span></div></div>`).join("") || `<div class="nx-empty-state">Fara istoric.</div>`}
          </div>
        </section>
      </aside>
    </div>
  `;
  return renderLeadBuilderShell({
    title: `Lead Builder - ${lead.commercial_name || "Lead"}`,
    companyName: options.companyName,
    user: options.user,
    currentPath: "/nexora/lead-builder/leads",
    body
  });
}

function approvalStatusOptions(current = "") {
  const statuses = ["draft", "approved", "rejected", "deferred", "call_requested", "do_not_contact"];
  return statuses.map((status) => `<option value="${escapeHtml(status)}" ${selected(status, current)}>${escapeHtml(status)}</option>`).join("");
}

function channelOptions(current = "email") {
  const channels = ["email", "phone", "whatsapp", "facebook", "messenger"];
  return channels.map((channel) => `<option value="${escapeHtml(channel)}" ${selected(channel, current)}>${escapeHtml(channel)}</option>`).join("");
}

function approvalRows(rows = [], campaign = {}) {
  if (!rows.length) {
    return `<div class="nx-empty-state">Nu exista leaduri pregatite pentru aprobare. Ruleaza campania si apoi apasa Pregateste top 50.</div>`;
  }
  return rows.map((row, index) => `
    <article class="nx-content-card" style="margin-bottom:12px">
      <div class="nx-section-head">
        <div>
          <h2>#${escapeHtml(index + 1)} ${escapeHtml(row.commercial_name || "-")}</h2>
          <p>${escapeHtml([row.city, row.county].filter(Boolean).join(", ") || "-")} · scor ${escapeHtml(row.score || 0)} · ${escapeHtml(row.score_category || "-")}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/lead-builder/leads/${escapeHtml(row.lead_id)}">Fisa</a>
          ${row.website ? `<a class="nx-btn" href="${escapeHtml(row.website)}" target="_blank" rel="noreferrer">Website</a>` : ""}
        </div>
      </div>
      <div class="nx-kpi-grid invoice-kpis" style="margin-bottom:12px">
        <div class="nx-kpi-card"><div class="nx-kpi-icon blue">@</div><div><div class="nx-kpi-label">Email</div><div class="nx-kpi-value" style="font-size:16px">${escapeHtml(row.primary_email || "-")}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon green">TEL</div><div><div class="nx-kpi-label">Telefon</div><div class="nx-kpi-value" style="font-size:16px">${escapeHtml(row.primary_phone || "-")}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon orange">ST</div><div><div class="nx-kpi-label">Stoc public</div><div class="nx-kpi-value">${escapeHtml(row.estimated_items_count || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon purple">T</div><div><div class="nx-kpi-label">Taskuri</div><div class="nx-kpi-value">${escapeHtml(row.onboarding_task_count || 0)}</div></div></div>
      </div>
      <div class="nx-client-info-grid" style="margin-bottom:12px">
        <div><span>Sursa email</span><b>${row.email_source_url ? `<a href="${escapeHtml(row.email_source_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.email_validation_status || "sursa")}</a>` : escapeHtml(row.email_validation_status || "-")}</b></div>
        <div><span>Motiv selectie</span><b>${escapeHtml(row.selection_reason || "-")}</b></div>
        <div><span>Beneficiu recomandat</span><b>${escapeHtml(row.recommended_benefit || "-")}</b></div>
        <div><span>Metoda contact</span><b>${escapeHtml(row.preferred_contact_method || "-")}</b></div>
      </div>
      ${row.message_id ? `
        <form method="post" action="/nexora/lead-builder/messages/${escapeHtml(row.message_id)}/approval" class="nx-form">
          <input type="hidden" name="campaign_id" value="${escapeHtml(campaign.id || row.campaign_id || "")}">
          <div class="nx-inline-form">
            <label class="nx-field"><span>Canal</span><select name="channel">${channelOptions(row.channel || "email")}</select></label>
            <label class="nx-field"><span>Status</span><select name="status">${approvalStatusOptions(row.message_status || "draft")}</select></label>
            <label class="nx-field nx-field-wide"><span>Subiect</span><input name="subject" value="${escapeHtml(row.subject || "")}"></label>
            <label class="nx-field nx-field-wide"><span>Nota interna</span><input name="note" placeholder="motiv aprobare / amanare / respingere"></label>
          </div>
          <label class="nx-field nx-field-wide"><span>Mesaj</span><textarea name="body" rows="10">${escapeHtml(row.body || "")}</textarea></label>
          <div class="nx-form-actions">
            <button class="nx-btn" type="submit" name="action" value="save">Salveaza</button>
            <button class="nx-btn primary" type="submit" name="action" value="approve">Aproba</button>
            <button class="nx-btn" type="submit" name="action" value="defer">Amana</button>
            <button class="nx-btn" type="submit" name="action" value="call">Suna telefonic</button>
            <button class="nx-btn" type="submit" name="action" value="reject">Respinge</button>
            <button class="nx-btn danger" type="submit" name="action" value="do_not_contact">Nu contacta</button>
          </div>
        </form>
      ` : `<div class="nx-empty-state">Nu exista mesaj email generat pentru acest lead. Apasa Pregateste top 50.</div>`}
    </article>
  `).join("");
}

function renderApprovalPage(options = {}) {
  const campaign = options.campaign || {};
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.report?.stats || {};
  const body = `
    ${renderFlash(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Campanie → Aprobare mesaje</h1>
          <p>${escapeHtml(campaign.name || "Campanie")} · primele 50 leaduri sunt pregatite ca drafturi, fara trimitere automata.</p>
        </div>
        <div class="nx-form-actions">
          <form method="post" action="/nexora/lead-builder/campaigns/${escapeHtml(campaign.id || "")}/google-enrich">
            <button class="nx-btn" type="submit">Imbogateste cu Google</button>
          </form>
          <form method="post" action="/nexora/lead-builder/campaigns/${escapeHtml(campaign.id || "")}/prepare-approval">
            <button class="nx-btn primary" type="submit">Pregateste top 50</button>
          </form>
          <a class="nx-btn" href="/nexora/lead-builder/leads?county=Prahova&category=auto_dealers">Leaduri Prahova</a>
        </div>
      </div>
      <div class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card"><div class="nx-kpi-icon blue">LD</div><div><div class="nx-kpi-label">Gasite</div><div class="nx-kpi-value">${escapeHtml(stats.identified || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon green">@</div><div><div class="nx-kpi-label">Cu email</div><div class="nx-kpi-value">${escapeHtml(stats.with_email || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon orange">TEL</div><div><div class="nx-kpi-label">Cu telefon</div><div class="nx-kpi-value">${escapeHtml(stats.with_phone || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon purple">OK</div><div><div class="nx-kpi-label">Aprobate</div><div class="nx-kpi-value">${escapeHtml(stats.approved_messages || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon red">CRM</div><div><div class="nx-kpi-label">In CRM</div><div class="nx-kpi-value">${escapeHtml(stats.crm_synced || 0)}</div></div></div>
      </div>
    </section>
    ${approvalRows(rows, campaign)}
  `;
  return renderLeadBuilderShell({
    title: "Lead Builder - Aprobare mesaje",
    companyName: options.companyName,
    user: options.user,
    currentPath: "/nexora/lead-builder/approval",
    body
  });
}

function renderSourcesPage(options = {}) {
  const sources = Array.isArray(options.sources) ? options.sources : [];
  const scoreConfig = options.scoreConfig || {};
  const sourceRows = sources.map((source) => `
    <tr>
      <td><b>${escapeHtml(source.name)}</b><div class="nx-table-sub">${escapeHtml(source.source_key)} · ${escapeHtml(source.type)}</div></td>
      <td>${statusBadge(Number(source.is_active || 0) ? "active" : "inactive")}</td>
      <td>${escapeHtml(source.access_method || "-")}</td>
      <td>${escapeHtml(source.result_count || 0)} / ${escapeHtml(source.error_count || 0)}</td>
      <td class="nx-table-actions">
        <details>
          <summary class="nx-btn">Editare</summary>
          <form method="post" action="/nexora/lead-builder/sources/${escapeHtml(source.id)}" class="nx-form" style="margin-top:10px;min-width:320px;text-align:left">
            <label class="nx-check-field"><input type="checkbox" name="is_active" value="1" ${checked(source.is_active)}><span>Activ</span></label>
            <label class="nx-field"><span>Metoda acces</span><input name="access_method" value="${escapeHtml(source.access_method || "")}"></label>
            <label class="nx-field"><span>API key</span><input type="password" name="api_key" placeholder="pastreaza cheia existenta"></label>
            <label class="nx-field"><span>Limite JSON</span><textarea name="limits_json">${escapeHtml(source.limits_json || "{}")}</textarea></label>
            <label class="nx-field"><span>Termeni</span><input name="terms_url" value="${escapeHtml(source.terms_url || "")}"></label>
            <label class="nx-field"><span>Observatii</span><textarea name="notes">${escapeHtml(source.notes || "")}</textarea></label>
            <button class="nx-btn primary" type="submit">Salveaza sursa</button>
          </form>
        </details>
      </td>
    </tr>
  `).join("");
  const scoringFields = Object.entries(scoreConfig).map(([key, value]) => `
    <label class="nx-field"><span>${escapeHtml(key)}</span><input type="number" min="-100" max="100" name="${escapeHtml(key)}" value="${escapeHtml(value)}"></label>
  `).join("");
  const body = `
    ${renderFlash(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Surse Lead Builder</h1><p>Configurare adaptoare, acces si limite.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Sursa</th><th>Status</th><th>Acces</th><th>Rezultate / erori</th><th></th></tr></thead>
          <tbody>${sourceRows || `<tr><td colspan="5"><div class="nx-empty-state">Nu exista surse.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Scor automat</h2></div></div>
      <form method="post" action="/nexora/lead-builder/sources/scoring" class="nx-inline-form">
        ${scoringFields}
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salveaza scoring</button></div>
      </form>
    </section>
  `;
  return renderLeadBuilderShell({
    title: "Lead Builder - Surse",
    companyName: options.companyName,
    user: options.user,
    currentPath: "/nexora/lead-builder/sources",
    body
  });
}

export {
  renderApprovalPage as renderLeadBuilderApprovalPage,
  renderDashboardPage as renderLeadBuilderDashboardPage,
  renderLeadDetailPage as renderLeadBuilderDetailPage,
  renderLeadsPage as renderLeadBuilderLeadsPage,
  renderSearchNewPage as renderLeadBuilderSearchNewPage,
  renderSourcesPage as renderLeadBuilderSourcesPage
};
