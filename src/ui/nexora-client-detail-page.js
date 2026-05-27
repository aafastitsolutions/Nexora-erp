import { renderErpSidebar } from "./erp-sidebar.js";

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
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} ${currency || "RON"}`;
}

function renderRows(rows, empty, mapper) {
  return rows && rows.length ? rows.map(mapper).join("") : `<tr><td colspan="10"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

function renderNexoraClientDetailPage(options = {}) {
  const user = options.user || {};
  const client = options.client || {};
  const contacts = options.contacts || [];
  const activities = options.activities || [];
  const contracts = options.contracts || [];
  const quotes = options.quotes || [];
  const facturi = options.facturi || [];
  const timeline = options.timeline || [];

  const companyName = user.company_name || "Workspace";

  const sidebar = renderErpSidebar({
    currentPath: "/nexora/clients",
    appName: "Nexora ERP",
    companyName
  });

  const statusClass =
    client.client_status === "rosu" ? "danger" :
    client.client_status === "galben" ? "warn" :
    "success";

  const contactsRows = renderRows(contacts, "Nu există contacte.", (c) => `
    <tr>
      <td><b>${escapeHtml(c.name || "-")}</b>${c.is_primary ? `<div class="nx-mini-badge">principal</div>` : ""}</td>
      <td>${escapeHtml(c.position || "-")}</td>
      <td>${escapeHtml(c.email || "-")}</td>
      <td>${escapeHtml(c.phone || "-")}</td>
      <td>${escapeHtml(c.created_at || "-")}</td>
    </tr>
  `);

  const activitiesRows = renderRows(activities, "Nu există activități.", (a) => `
    <tr>
      <td>${escapeHtml(a.type || "-")}</td>
      <td><b>${escapeHtml(a.subject || "-")}</b><div class="nx-table-sub">${escapeHtml(a.contact_name || "")}</div></td>
      <td>${escapeHtml(a.due_at || "-")}</td>
      <td>${a.done ? `<span class="nx-status-pill success">done</span>` : `<span class="nx-status-pill warn">open</span>`}</td>
      <td>${escapeHtml(a.created_at || "-")}</td>
      <td class="nx-table-actions">
        <form method="post" action="/client/${escapeHtml(client.id)}/activities/${escapeHtml(a.id)}/delete" onsubmit="return confirm('Ștergi această activitate?');">
          <input type="hidden" name="return_to" value="nexora">
          <button class="nx-btn danger" type="submit">Șterge</button>
        </form>
      </td>
    </tr>
  `);

  const contractsRows = renderRows(contracts, "Nu există contracte.", (c) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/contracts/${escapeHtml(c.id)}">${escapeHtml(c.contract_number || "-")}</a></td>
      <td>${escapeHtml(c.created_at || "-")}</td>
      <td>${escapeHtml(money(c.price))}</td>
      <td>${escapeHtml(c.duration || "-")}</td>
      <td>${c.pdf_path ? `<a class="nx-table-main-link" href="/${escapeHtml(c.pdf_path)}" target="_blank">PDF</a>` : "-"}</td>
    </tr>
  `);

  const quotesRows = renderRows(quotes, "Nu există oferte.", (q) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/quotes/${escapeHtml(q.id)}">${escapeHtml(q.quote_number || "-")}</a></td>
      <td>${escapeHtml(q.status || "-")}</td>
      <td>${escapeHtml(money(q.total, q.currency))}</td>
      <td>${escapeHtml(q.created_at || "-")}</td>
      <td>${q.pdf_path ? `<a class="nx-table-main-link" href="/${escapeHtml(q.pdf_path)}" target="_blank">PDF</a>` : "-"}</td>
    </tr>
  `);

  const invoicesRows = renderRows(facturi, "Nu există facturi.", (f) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/facturi/${escapeHtml(f.id)}">${escapeHtml(f.factura_nr || "-")}</a></td>
      <td>${escapeHtml(f.status || "-")}</td>
      <td>${escapeHtml(money(f.total, f.moneda))}</td>
      <td>${escapeHtml(f.created_at || "-")}</td>
      <td>${f.pdf_path ? `<a class="nx-table-main-link" href="/${escapeHtml(f.pdf_path)}" target="_blank">PDF</a>` : "-"}</td>
    </tr>
  `);

  const timelineHtml = timeline.length
    ? timeline.slice(0, 12).map((e) => `
      <div class="nx-timeline-item">
        <div class="nx-timeline-dot"></div>
        <div>
          <b>${escapeHtml(e.type || "event")} ${escapeHtml(e.number || e.subject || "")}</b>
          <span>${escapeHtml(e.date || "")}${e.total ? ` · ${escapeHtml(String(e.total))}` : ""}</span>
        </div>
      </div>
    `).join("")
    : `<div class="nx-empty-state">Nu există timeline.</div>`;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - ${escapeHtml(client.name || "Client")}</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">CRM / Client</div>
          <div class="nx-page-title">${escapeHtml(client.name || "Client")}</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/nexora/clients">Înapoi la clienți</a>
        </div>
      </header>

      <section class="nx-client-layout">
        <div class="nx-client-main">
          <section class="nx-content-card">
            <form id="nx-client-profile-form" method="post" action="/client/${escapeHtml(client.id)}/profile/save">
              <input type="hidden" name="return_to" value="nexora">

              <div class="nx-section-head">
                <div>
                  <h1>Date client</h1>
                  <p>Fișă centralizată CRM pentru client, contacte, documente și activități.</p>
                </div>

                <div class="nx-panel-actions">
                  <span class="nx-status-pill ${statusClass}">${escapeHtml(client.client_status || "verde")}</span>
                  <button class="nx-btn primary" type="submit">Salvează client</button>
                </div>
              </div>

              <div class="nx-client-info-grid">
                <div><span>CUI</span><b>${escapeHtml(client.cui || "-")}</b></div>
                <div><span>Reg. Com.</span><b>${escapeHtml(client.reg_com || "-")}</b></div>
                <div><span>CAEN</span><b>${escapeHtml(client.caen || "-")}</b></div>
                <div><span>TVA</span><b>${client.vat ? "Da" : "Nu"}</b></div>
                <div class="wide"><span>Adresă</span><b>${escapeHtml(client.address || "-")}</b></div>
              </div>

              <div class="nx-profile-edit-grid">
                <label class="nx-field">
                  <span>Email</span>
                  <input name="email" type="email" value="${escapeHtml(client.email || "")}" placeholder="email@firma.ro">
                </label>

                <label class="nx-field">
                  <span>Telefon</span>
                  <input name="phone" value="${escapeHtml(client.phone || "")}" placeholder="+40...">
                </label>

                <label class="nx-field">
                  <span>Status client</span>
                  <select name="client_status">
                    <option value="verde" ${client.client_status === "verde" ? "selected" : ""}>Verde - OK</option>
                    <option value="galben" ${client.client_status === "galben" ? "selected" : ""}>Galben - atenție</option>
                    <option value="rosu" ${client.client_status === "rosu" ? "selected" : ""}>Roșu - risc</option>
                  </select>
                </label>

                <label class="nx-field nx-field-wide">
                  <span>Observații</span>
                  <textarea name="notes" rows="4" placeholder="Observații despre client...">${escapeHtml(client.notes || "")}</textarea>
                </label>
              </div>
            </form>
          </section>

          <section class="nx-kpi-grid client-kpis">
            <div class="nx-kpi-card"><div class="nx-kpi-icon green">◉</div><div><div class="nx-kpi-label">Contacte</div><div class="nx-kpi-value">${contacts.length}</div></div></div>
            <div class="nx-kpi-card"><div class="nx-kpi-icon blue">☑</div><div><div class="nx-kpi-label">Activități</div><div class="nx-kpi-value">${activities.length}</div></div></div>
            <div class="nx-kpi-card"><div class="nx-kpi-icon purple">▣</div><div><div class="nx-kpi-label">Contracte</div><div class="nx-kpi-value">${contracts.length}</div></div></div>
            <div class="nx-kpi-card"><div class="nx-kpi-icon orange">↗</div><div><div class="nx-kpi-label">Oferte</div><div class="nx-kpi-value">${quotes.length}</div></div></div>
            <div class="nx-kpi-card"><div class="nx-kpi-icon red">!</div><div><div class="nx-kpi-label">Facturi</div><div class="nx-kpi-value">${facturi.length}</div></div></div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head">
              <h2>Contacte</h2>
              <div class="nx-panel-actions">
                <span>${contacts.length}</span>
                <button class="nx-btn primary" type="submit" form="nx-contact-form">Adaugă contact</button>
              </div>
            </div>

            <form id="nx-contact-form" class="nx-inline-form" method="post" action="/client/${escapeHtml(client.id)}/contacts/add">\n              <input type="hidden" name="return_to" value="nexora">
              <label class="nx-field">
                <span>Nume contact</span>
                <input name="name" required placeholder="Ex: Popescu Ion">
              </label>

              <label class="nx-field">
                <span>Funcție</span>
                <input name="position" placeholder="Ex: Manager">
              </label>

              <label class="nx-field">
                <span>Email</span>
                <input name="email" type="email" placeholder="email@firma.ro">
              </label>

              <label class="nx-field">
                <span>Telefon</span>
                <input name="phone" placeholder="+40...">
              </label>

              <label class="nx-check-field">
                <input type="checkbox" name="is_primary" value="1">
                <span>Contact principal</span>
              </label>

              <div class="nx-form-actions nx-form-actions-placeholder"></div>
            </form>

            <div class="nx-table-wrap">
              <table class="nx-table">
                <thead><tr><th>Nume</th><th>Funcție</th><th>Email</th><th>Telefon</th><th>Creat</th></tr></thead>
                <tbody>${contactsRows}</tbody>
              </table>
            </div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head">
              <h2>Activități</h2>
              <div class="nx-panel-actions">
                <span>${activities.length}</span>
                <button class="nx-btn primary" type="submit" form="nx-activity-form">Adaugă activitate</button>
              </div>
            </div>

            <form id="nx-activity-form" class="nx-inline-form nx-inline-form-activity" method="post" action="/client/${escapeHtml(client.id)}/activities/add">
              <input type="hidden" name="return_to" value="nexora">

              <label class="nx-field">
                <span>Tip</span>
                <select name="type" required>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="email">Email</option>
                  <option value="note" selected>Note</option>
                  <option value="task">Task</option>
                </select>
              </label>

              <label class="nx-field">
                <span>Contact</span>
                <select name="contact_id">
                  <option value="">—</option>
                  ${contacts.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || "")}</option>`).join("")}
                </select>
              </label>

              <label class="nx-field">
                <span>Subiect</span>
                <input name="subject" placeholder="Ex: Follow-up ofertă">
              </label>

              <label class="nx-field">
                <span>Scadent</span>
                <input name="due_at" placeholder="2026-05-18">
              </label>

              <label class="nx-field nx-field-wide">
                <span>Note</span>
                <textarea name="note" rows="3" placeholder="Detalii activitate..."></textarea>
              </label>

              <div class="nx-form-actions nx-form-actions-placeholder"></div>
            </form>

            <div class="nx-table-wrap">
              <table class="nx-table">
                <thead><tr><th>Tip</th><th>Subiect</th><th>Scadent</th><th>Status</th><th>Creat</th><th></th></tr></thead>
                <tbody>${activitiesRows}</tbody>
              </table>
            </div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head"><h2>Contracte</h2><span>${contracts.length}</span></div>
            <div class="nx-table-wrap">
              <table class="nx-table">
                <thead><tr><th>Contract</th><th>Creat</th><th>Valoare</th><th>Durată</th><th>PDF</th></tr></thead>
                <tbody>${contractsRows}</tbody>
              </table>
            </div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head"><h2>Oferte</h2><span>${quotes.length}</span></div>
            <div class="nx-table-wrap">
              <table class="nx-table">
                <thead><tr><th>Ofertă</th><th>Status</th><th>Total</th><th>Creat</th><th>PDF</th></tr></thead>
                <tbody>${quotesRows}</tbody>
              </table>
            </div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head"><h2>Facturi</h2><span>${facturi.length}</span></div>
            <div class="nx-table-wrap">
              <table class="nx-table">
                <thead><tr><th>Factură</th><th>Status</th><th>Total</th><th>Creat</th><th>PDF</th></tr></thead>
                <tbody>${invoicesRows}</tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="nx-client-side">
          <section class="nx-content-card">
            <div class="nx-panel-head"><h2>Timeline</h2><span>ultimele 12</span></div>
            <div class="nx-timeline">
              ${timelineHtml}
            </div>
          </section>
        </aside>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export {
  renderNexoraClientDetailPage
};
