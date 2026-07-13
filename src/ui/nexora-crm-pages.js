import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, fmtMoney) {
  if (typeof fmtMoney === "function") return fmtMoney(value || 0);
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} RON`;
}

function dateValue(value) {
  return String(value || "").slice(0, 10);
}

function selected(actual, expected) {
  return String(actual || "").toUpperCase() === expected ? "selected" : "";
}

function statusBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["CONVERTIT", "CASTIGATA", "FINALIZAT", "REALIZAT", "TRIMIS", "RASPUNS"].includes(normalized)) {
    return `<span class="nx-status-pill success">${escapeHtml(normalized.toLowerCase())}</span>`;
  }
  if (["NOU", "CALIFICARE", "CONTACTAT", "PROGRAMAT", "IN_LUCRU", "DESCHISA", "PREGATIT"].includes(normalized)) {
    return `<span class="nx-status-pill warn">${escapeHtml(normalized.toLowerCase())}</span>`;
  }
  if (["PIERDUT", "ANULAT", "ESUAT", "RESPINS"].includes(normalized)) {
    return `<span class="nx-status-pill danger">${escapeHtml(normalized.toLowerCase())}</span>`;
  }
  return `<span class="nx-status-pill neutral">${escapeHtml(normalized.toLowerCase() || "-")}</span>`;
}

function optionList(values = [], selectedValue = "") {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${selected(selectedValue, value)}>${escapeHtml(value)}</option>`).join("");
}

function clientOptions(clients = [], selectedId = "") {
  return [
    `<option value="">Fără client</option>`,
    ...clients.map((client) => `
      <option value="${escapeHtml(client.id)}" ${String(client.id) === String(selectedId) ? "selected" : ""}>
        ${escapeHtml(client.name || "-")} ${client.cui ? `(${escapeHtml(client.cui)})` : ""}
      </option>
    `)
  ].join("");
}

function leadOptions(leads = [], selectedId = "") {
  return [
    `<option value="">Fără lead</option>`,
    ...leads.map((lead) => `
      <option value="${escapeHtml(lead.id)}" ${String(lead.id) === String(selectedId) ? "selected" : ""}>
        ${escapeHtml(lead.lead_number || "-")} · ${escapeHtml(lead.name || "-")}
      </option>
    `)
  ].join("");
}

function opportunityOptions(opportunities = [], selectedId = "") {
  return [
    `<option value="">Fără oportunitate</option>`,
    ...opportunities.map((opportunity) => `
      <option value="${escapeHtml(opportunity.id)}" ${String(opportunity.id) === String(selectedId) ? "selected" : ""}>
        ${escapeHtml(opportunity.opportunity_number || "-")} · ${escapeHtml(opportunity.title || "-")}
      </option>
    `)
  ].join("");
}

function renderCrmNav(activePath = "/nexora/crm") {
  const items = [
    ["General", "/nexora/crm"],
    ["Lead Builder", "/nexora/lead-builder"],
    ["Lead-uri", "/nexora/crm/leads"],
    ["Pipeline", "/nexora/crm/pipeline"],
    ["Follow-up", "/nexora/crm/follow-up"],
    ["Activități", "/nexora/crm/activities"],
    ["Email tracking", "/nexora/crm/email-tracking"],
    ["Relații clienți", "/nexora/clients"]
  ];
  return `
    <div class="nx-module-tabs">
      ${items.map(([label, href]) => `<a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function renderCrmShell({ title, companyName, user, currentPath, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath,
    eyebrow: "CRM",
    pageTitle: title,
    body: `${renderCrmNav(currentPath)}${body}`
  });
}

function renderFlash(ok = "", err = "") {
  const success = {
    saved: "Înregistrarea a fost salvată.",
    converted: "Lead-ul a fost convertit în client.",
    updated: "Statusul a fost actualizat."
  };
  const errors = {
    required: "Completează câmpurile obligatorii.",
    missing: "Înregistrarea nu a fost găsită.",
    save_failed: "Nu am putut salva modificarea."
  };
  if (ok) return `<div class="nx-alert success">${escapeHtml(success[ok] || success.saved)}</div>`;
  if (err) return `<div class="nx-alert danger">${escapeHtml(errors[err] || errors.save_failed)}</div>`;
  return "";
}

function renderNexoraCrmHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const recentLeads = Array.isArray(options.recentLeads) ? options.recentLeads : [];
  const opportunities = Array.isArray(options.opportunities) ? options.opportunities : [];
  const followups = Array.isArray(options.followups) ? options.followups : [];
  const fmtMoney = options.fmtMoney;

  const leadRows = recentLeads.map((lead) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/crm/leads?q=${encodeURIComponent(lead.lead_number || "")}">${escapeHtml(lead.lead_number || "-")}</a><div class="nx-table-sub">${escapeHtml(lead.name || "-")}</div></td>
      <td>${escapeHtml(lead.company_name || "-")}</td>
      <td>${statusBadge(lead.status)}</td>
      <td class="nx-right">${escapeHtml(money(lead.estimated_value, fmtMoney))}</td>
    </tr>
  `).join("");

  const opportunityRows = opportunities.map((opportunity) => `
    <tr>
      <td><b>${escapeHtml(opportunity.title || "-")}</b><div class="nx-table-sub">${escapeHtml(opportunity.opportunity_number || "-")}</div></td>
      <td>${escapeHtml(opportunity.client_name || opportunity.lead_name || "-")}</td>
      <td>${statusBadge(opportunity.stage)}</td>
      <td class="nx-right">${escapeHtml(money(opportunity.amount, fmtMoney))}</td>
    </tr>
  `).join("");

  const followupRows = followups.map((item) => `
    <tr>
      <td><b>${escapeHtml(item.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(item.activity_type || "-")}</div></td>
      <td>${escapeHtml(item.client_name || item.lead_name || item.opportunity_title || "-")}</td>
      <td>${escapeHtml(dateValue(item.due_date) || "-")}</td>
      <td>${statusBadge(item.status)}</td>
    </tr>
  `).join("");

  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>CRM</h1>
          <p>Lead-uri, pipeline, follow-up-uri, activități și interacțiuni email într-un singur flux.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/crm/leads">Lead nou</a>
          <a class="nx-btn" href="/nexora/crm/pipeline">Pipeline</a>
          <a class="nx-btn" href="/nexora/clients">Clienți</a>
        </div>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">LD</div><div><div class="nx-kpi-label">Lead-uri deschise</div><div class="nx-kpi-value">${escapeHtml(stats.open_leads || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OPP</div><div><div class="nx-kpi-label">Oportunități</div><div class="nx-kpi-value">${escapeHtml(stats.open_opportunities || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RON</div><div><div class="nx-kpi-label">Valoare pipeline</div><div class="nx-kpi-value">${escapeHtml(money(stats.pipeline_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">FU</div><div><div class="nx-kpi-label">Follow-up scadent</div><div class="nx-kpi-value">${escapeHtml(stats.due_followups || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Lead-uri recente</h2><p>Prospecți intrați în CRM.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Lead</th><th>Companie</th><th>Status</th><th class="nx-right">Valoare</th></tr></thead><tbody>${leadRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există lead-uri.</div></td></tr>`}</tbody></table></div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Pipeline activ</h2><p>Oportunități deschise.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Oportunitate</th><th>Partener</th><th>Etapă</th><th class="nx-right">Valoare</th></tr></thead><tbody>${opportunityRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există oportunități.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Follow-up-uri apropiate</h2><p>Lucruri care trebuie urmărite.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Subiect</th><th>Legătură</th><th>Scadență</th><th>Status</th></tr></thead><tbody>${followupRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există follow-up-uri scadente.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderCrmShell({ title: "CRM", companyName, user: options.user, currentPath: "/nexora/crm", body });
}

function renderNexoraCrmLeadsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const ok = options.ok || "";
  const err = options.err || "";
  const fmtMoney = options.fmtMoney;
  const leadStatuses = options.leadStatuses || [];

  const rowsHtml = rows.map((lead) => `
    <tr>
      <td>
        <b>${escapeHtml(lead.lead_number || "-")}</b>
        <div class="nx-table-sub">${escapeHtml(lead.name || "-")}</div>
      </td>
      <td>
        <b>${escapeHtml(lead.company_name || "-")}</b>
        <div class="nx-table-sub">${escapeHtml(lead.contact_name || "")} ${lead.email ? `· ${escapeHtml(lead.email)}` : ""}</div>
      </td>
      <td>${statusBadge(lead.status)}</td>
      <td class="nx-right">${escapeHtml(money(lead.estimated_value, fmtMoney))}</td>
      <td>${escapeHtml(dateValue(lead.next_followup_date) || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/crm/leads/${escapeHtml(lead.id)}/status" class="nx-row-form">
          <select name="status">${optionList(leadStatuses, lead.status)}</select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
        ${lead.converted_client_id ? `<a class="nx-btn primary" href="/nexora/clients/${escapeHtml(lead.converted_client_id)}">Client</a>` : `
          <form method="post" action="/nexora/crm/leads/${escapeHtml(lead.id)}/convert" class="nx-row-form">
            <button class="nx-btn primary" type="submit">Convertește</button>
          </form>
        `}
      </td>
    </tr>
  `).join("");

  const body = `
    ${renderFlash(ok, err)}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">LD</div><div><div class="nx-kpi-label">Total lead-uri</div><div class="nx-kpi-value">${escapeHtml(stats.total_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OK</div><div><div class="nx-kpi-label">Convertite</div><div class="nx-kpi-value">${escapeHtml(stats.converted_count || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">RON</div><div><div class="nx-kpi-label">Valoare estimată</div><div class="nx-kpi-value">${escapeHtml(money(stats.estimated_amount, fmtMoney))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">TOD</div><div><div class="nx-kpi-label">Follow-up azi</div><div class="nx-kpi-value">${escapeHtml(stats.due_today || 0)}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Lead nou</h2><span>Prospect sau oportunitate incipientă</span></div></div>
        <form method="post" action="/nexora/crm/leads/create" class="nx-form">
          <label class="nx-field"><span>Denumire lead</span><input name="name" required placeholder="Ex: cerere website / abonament"></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Companie</span><input name="company_name"></label>
            <label class="nx-field"><span>Persoană contact</span><input name="contact_name"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Email</span><input name="email"></label>
            <label class="nx-field"><span>Telefon</span><input name="phone"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Sursă</span><select name="source"><option>MANUAL</option><option>WEBSITE</option><option>RECOMANDARE</option><option>TELEFON</option><option>EMAIL</option><option>CAMPANIE</option></select></label>
            <label class="nx-field"><span>Valoare estimată</span><input name="estimated_value" value="0"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Probabilitate %</span><input name="probability" value="10"></label>
            <label class="nx-field"><span>Următorul follow-up</span><input type="date" name="next_followup_date"></label>
          </div>
          <label class="nx-field"><span>Următorul pas</span><input name="next_step"></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Salvează lead</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre</h2><span>Listă lead-uri</span></div></div>
        <form method="get" action="/nexora/crm/leads" class="nx-form">
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="număr, companie, contact, email"></label>
          <label class="nx-field"><span>Status</span><select name="status"><option value="">Toate</option>${optionList(leadStatuses, filters.status)}</select></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Aplică</button>
            <a class="nx-btn" href="/nexora/crm/leads">Reset</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Lead-uri</h2><p>Registru de prospecți și lead-uri comerciale.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Lead</th><th>Contact</th><th>Status</th><th class="nx-right">Valoare</th><th>Follow-up</th><th>Acțiuni</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există lead-uri.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderCrmShell({ title: "Lead-uri", companyName, user: options.user, currentPath: "/nexora/crm/leads", body });
}

function renderNexoraCrmPipelinePage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const leads = Array.isArray(options.leads) ? options.leads : [];
  const stages = options.stages || [];
  const ok = options.ok || "";
  const err = options.err || "";
  const fmtMoney = options.fmtMoney;

  const board = stages.map((stage) => {
    const stageRows = rows.filter((row) => String(row.stage || "").toUpperCase() === stage);
    const cards = stageRows.map((row) => `
      <article class="nx-crm-board-card">
        <div>
          <b>${escapeHtml(row.title || "-")}</b>
          <span>${escapeHtml(row.opportunity_number || "-")}</span>
        </div>
        <p>${escapeHtml(row.client_name || row.lead_name || "-")}</p>
        <div class="nx-crm-board-meta">
          <span>${escapeHtml(money(row.amount, fmtMoney))}</span>
          <span>${escapeHtml(String(row.probability || 0))}%</span>
        </div>
        <form method="post" action="/nexora/crm/opportunities/${escapeHtml(row.id)}/stage" class="nx-row-form">
          <select name="stage">${optionList(stages, row.stage)}</select>
          <button class="nx-btn" type="submit">Mută</button>
        </form>
      </article>
    `).join("");
    const amount = stageRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `
      <section class="nx-crm-board-column">
        <div class="nx-crm-board-head">
          <b>${escapeHtml(stage)}</b>
          <span>${escapeHtml(stageRows.length)} · ${escapeHtml(money(amount, fmtMoney))}</span>
        </div>
        ${cards || `<div class="nx-empty-state">Fără oportunități.</div>`}
      </section>
    `;
  }).join("");

  const tableRows = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.title || "-")}</b><div class="nx-table-sub">${escapeHtml(row.opportunity_number || "-")}</div></td>
      <td>${escapeHtml(row.client_name || row.lead_name || "-")}</td>
      <td>${statusBadge(row.stage)}</td>
      <td class="nx-right">${escapeHtml(money(row.amount, fmtMoney))}</td>
      <td>${escapeHtml(dateValue(row.expected_close_date) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `).join("");

  const body = `
    ${renderFlash(ok, err)}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Oportunitate nouă</h2><span>Pipeline CRM</span></div></div>
        <form method="post" action="/nexora/crm/opportunities/create" class="nx-form">
          <label class="nx-field"><span>Titlu</span><input name="title" required placeholder="Ex: abonament enterprise"></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Client</span><select name="client_id">${clientOptions(clients)}</select></label>
            <label class="nx-field"><span>Lead sursă</span><select name="lead_id">${leadOptions(leads)}</select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Etapă</span><select name="stage">${optionList(stages, "CALIFICARE")}</select></label>
            <label class="nx-field"><span>Valoare</span><input name="amount" value="0"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Probabilitate %</span><input name="probability" value="25"></label>
            <label class="nx-field"><span>Închidere estimată</span><input type="date" name="expected_close_date"></label>
          </div>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Adaugă oportunitate</button>
        </form>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Pipeline pe etape</h2><p>Mută rapid oportunitățile între etape.</p></div></div>
        <div class="nx-crm-board">${board}</div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Oportunități</h2><p>Registrul complet al pipeline-ului CRM.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Oportunitate</th><th>Partener</th><th>Etapă</th><th class="nx-right">Valoare</th><th>Închidere</th><th>Status</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6"><div class="nx-empty-state">Nu există oportunități.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderCrmShell({ title: "Pipeline", companyName, user: options.user, currentPath: "/nexora/crm/pipeline", body });
}

function renderNexoraCrmFollowUpPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const leads = Array.isArray(options.leads) ? options.leads : [];
  const opportunities = Array.isArray(options.opportunities) ? options.opportunities : [];
  const filters = options.filters || {};
  const ok = options.ok || "";
  const err = options.err || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(row.activity_type || "-")} · ${escapeHtml(row.priority || "-")}</div></td>
      <td>${escapeHtml(row.client_name || row.lead_name || row.opportunity_title || "-")}</td>
      <td>${escapeHtml(dateValue(row.due_date) || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.owner_email || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/crm/follow-up/${escapeHtml(row.id)}/toggle" class="nx-row-form">
          <button class="nx-btn ${String(row.status || "").toUpperCase() === "REALIZAT" ? "" : "primary"}" type="submit">${String(row.status || "").toUpperCase() === "REALIZAT" ? "Redeschide" : "Realizat"}</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${renderFlash(ok, err)}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Follow-up nou</h2><span>Task, apel, întâlnire sau email</span></div></div>
        <form method="post" action="/nexora/crm/follow-up/create" class="nx-form">
          <label class="nx-field"><span>Subiect</span><input name="subject" required placeholder="Ex: sună clientul pentru ofertă"></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Tip</span><select name="activity_type"><option>TASK</option><option>CALL</option><option>MEETING</option><option>EMAIL</option><option>NOTE</option></select></label>
            <label class="nx-field"><span>Prioritate</span><select name="priority"><option>MEDIE</option><option>SCAZUTA</option><option>RIDICATA</option><option>URGENTA</option></select></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Scadență</span><input type="date" name="due_date"></label>
            <label class="nx-field"><span>Responsabil</span><input name="owner_email" value="${escapeHtml(options.user?.email || "")}"></label>
          </div>
          <label class="nx-field"><span>Client</span><select name="client_id">${clientOptions(clients)}</select></label>
          <label class="nx-field"><span>Lead</span><select name="lead_id">${leadOptions(leads)}</select></label>
          <label class="nx-field"><span>Oportunitate</span><select name="opportunity_id">${opportunityOptions(opportunities)}</select></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Programează</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Filtre</h2><span>Agenda CRM</span></div></div>
        <form method="get" action="/nexora/crm/follow-up" class="nx-form">
          <label class="nx-field"><span>Status</span><select name="status"><option value="">Toate</option><option value="DESCHIS" ${selected(filters.status, "DESCHIS")}>Deschise</option><option value="REALIZAT" ${selected(filters.status, "REALIZAT")}>Realizate</option></select></label>
          <label class="nx-field"><span>Tip</span><select name="activity_type"><option value="">Toate</option><option>CALL</option><option>MEETING</option><option>EMAIL</option><option>TASK</option><option>NOTE</option></select></label>
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="subiect, client, lead"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Aplică</button>
            <a class="nx-btn" href="/nexora/crm/follow-up">Reset</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Follow-up-uri</h2><p>Agenda operațională pentru relații comerciale.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Subiect</th><th>Legătură</th><th>Scadență</th><th>Status</th><th>Responsabil</th><th>Acțiuni</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6"><div class="nx-empty-state">Nu există follow-up-uri.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderCrmShell({ title: "Follow-up", companyName, user: options.user, currentPath: "/nexora/crm/follow-up", body });
}

function renderNexoraCrmActivitiesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const leads = Array.isArray(options.leads) ? options.leads : [];
  const opportunities = Array.isArray(options.opportunities) ? options.opportunities : [];
  const ok = options.ok || "";
  const err = options.err || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td>${statusBadge(row.activity_type || row.type)}</td>
      <td><b>${escapeHtml(row.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(row.notes || row.note || "")}</div></td>
      <td>${escapeHtml(row.client_name || row.lead_name || row.opportunity_title || "-")}</td>
      <td>${escapeHtml(dateValue(row.due_date || row.due_at || row.created_at) || "-")}</td>
      <td>${statusBadge(row.status || (row.done ? "REALIZAT" : "DESCHIS"))}</td>
    </tr>
  `).join("");

  const body = `
    ${renderFlash(ok, err)}
    <section class="nx-panel">
      <div class="nx-panel-head"><div><h2>Activitate nouă</h2><span>Apel, întâlnire, email, notă</span></div></div>
      <form method="post" action="/nexora/crm/activities/create" class="nx-inline-form nx-crm-activity-form">
        <label class="nx-field"><span>Tip</span><select name="activity_type"><option>CALL</option><option>MEETING</option><option>EMAIL</option><option>NOTE</option><option>TASK</option></select></label>
        <label class="nx-field"><span>Subiect</span><input name="subject" required></label>
        <label class="nx-field"><span>Client</span><select name="client_id">${clientOptions(clients)}</select></label>
        <label class="nx-field"><span>Lead</span><select name="lead_id">${leadOptions(leads)}</select></label>
        <label class="nx-field"><span>Oportunitate</span><select name="opportunity_id">${opportunityOptions(opportunities)}</select></label>
        <label class="nx-field"><span>Data</span><input type="date" name="due_date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Înregistrează</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Activități CRM</h2><p>Istoric comun pentru clienți, lead-uri și oportunități.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Tip</th><th>Subiect</th><th>Legătură</th><th>Dată</th><th>Status</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="5"><div class="nx-empty-state">Nu există activități.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderCrmShell({ title: "Activități", companyName, user: options.user, currentPath: "/nexora/crm/activities", body });
}

function renderNexoraCrmEmailTrackingPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const leads = Array.isArray(options.leads) ? options.leads : [];
  const opportunities = Array.isArray(options.opportunities) ? options.opportunities : [];
  const ok = options.ok || "";
  const err = options.err || "";

  const rowsHtml = rows.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(row.recipient_email || "-")} · ${escapeHtml(row.direction || "-")}</div></td>
      <td>${escapeHtml(row.client_name || row.lead_name || row.opportunity_title || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.sent_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.opened_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.replied_at) || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/nexora/crm/email-tracking/${escapeHtml(row.id)}/status" class="nx-row-form">
          <select name="status"><option ${selected(row.status, "PREGATIT")}>PREGATIT</option><option ${selected(row.status, "TRIMIS")}>TRIMIS</option><option ${selected(row.status, "DESCHIS")}>DESCHIS</option><option ${selected(row.status, "RASPUNS")}>RASPUNS</option><option ${selected(row.status, "ESUAT")}>ESUAT</option></select>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    ${renderFlash(ok, err)}
    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head"><div><h2>Email urmărit</h2><span>Înregistrare manuală interacțiune</span></div></div>
        <form method="post" action="/nexora/crm/email-tracking/create" class="nx-form">
          <label class="nx-field"><span>Subiect</span><input name="subject" required></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Destinatar</span><input name="recipient_email" required placeholder="client@firma.ro"></label>
            <label class="nx-field"><span>Direcție</span><select name="direction"><option>OUT</option><option>IN</option></select></label>
          </div>
          <label class="nx-field"><span>Client</span><select name="client_id">${clientOptions(clients)}</select></label>
          <label class="nx-field"><span>Lead</span><select name="lead_id">${leadOptions(leads)}</select></label>
          <label class="nx-field"><span>Oportunitate</span><select name="opportunity_id">${opportunityOptions(opportunities)}</select></label>
          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <button class="nx-btn primary" type="submit">Adaugă email</button>
        </form>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h2>Statusuri</h2><p>Pregătit, trimis, deschis, răspuns sau eșuat.</p></div></div>
        <div class="nx-client-info-grid">
          <div><span>Pregătit</span><b>${escapeHtml(options.stats?.prepared || 0)}</b></div>
          <div><span>Trimis</span><b>${escapeHtml(options.stats?.sent || 0)}</b></div>
          <div><span>Deschis</span><b>${escapeHtml(options.stats?.opened || 0)}</b></div>
          <div><span>Răspuns</span><b>${escapeHtml(options.stats?.replied || 0)}</b></div>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h2>Email tracking</h2><p>Registru de emailuri și răspunsuri comerciale.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Email</th><th>Legătură</th><th>Status</th><th>Trimis</th><th>Deschis</th><th>Răspuns</th><th>Acțiuni</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există emailuri urmărite.</div></td></tr>`}</tbody></table></div>
    </section>
  `;

  return renderCrmShell({ title: "Email tracking", companyName, user: options.user, currentPath: "/nexora/crm/email-tracking", body });
}

export {
  renderCrmNav,
  renderNexoraCrmActivitiesPage,
  renderNexoraCrmEmailTrackingPage,
  renderNexoraCrmFollowUpPage,
  renderNexoraCrmHubPage,
  renderNexoraCrmLeadsPage,
  renderNexoraCrmPipelinePage
};
