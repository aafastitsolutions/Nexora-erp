import { renderNexoraShell } from "./nexora-shell.js";
import { renderSalesNav } from "./nexora-sales-pages.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function quoteBadge(status) {
  const s = String(status || "DRAFT").toUpperCase();
  const cls = s === "ACCEPTED" ? "success"
    : s === "REJECTED" ? "danger"
    : s === "SENT" ? "warn"
    : "neutral";

  return `<span class="nx-status-pill ${cls}">${escapeHtml(s)}</span>`;
}

function renderNexoraQuotesPage(ctx = {}) {
  const {
    currentPath = "/nexora/quotes",
    userEmail = "",
    companyName = "",
    quotes = [],
    clients = [],
    q = "",
    fmtMoney = (v) => String(v ?? "")
  } = ctx;

  const rows = quotes.map((x) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/quotes/${x.id}">${escapeHtml(x.quote_number || "")}</a></td>
      <td>
        <b>${escapeHtml(x.client_name || "")}</b>
        <div class="nx-table-sub">${escapeHtml(x.client_cui || "")}</div>
      </td>
      <td>${quoteBadge(x.status)}</td>
      <td class="nx-right">${escapeHtml(fmtMoney(x.total))}</td>
      <td>${escapeHtml(x.valid_until || "") || `<span class="nx-table-sub">—</span>`}</td>
      <td>${escapeHtml(x.created_at || "")}</td>
    </tr>
  `).join("");

  const clientOptions = clients.map((c) =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || "")} (${escapeHtml(c.cui || "")})</option>`
  ).join("");

  const body = `
    ${renderSalesNav("/nexora/quotes")}
    <section class="nx-content-card">
    <div class="nx-section-head">
      <div>
        <h1>Oferte</h1>
        <p>Creează, urmărește și convertește ofertele comerciale în contracte.</p>
      </div>
      <div class="nx-form-actions">
        <a class="nx-btn primary" href="/nexora/clients">Clienți</a>
      </div>
    </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Ofertă nouă</h2>
            <p>Creează rapid o ofertă pentru un client existent.</p>
          </div>
        </div>

        <form method="post" action="/nexora/quotes/create" class="nx-form">
          <label class="nx-field"><span>Client</span><select name="client_id" required>${clientOptions}</select></label>
          <label class="nx-field"><span>Titlu</span><input name="title" placeholder="Ex: Oferta servicii QR-LAB"></label>

          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>TVA</span><select name="vat_rate"><option value="0">0%</option><option value="0.19" selected>19%</option></select></label>
            <label class="nx-field"><span>Valabil până la</span><input name="valid_until" placeholder="2026-03-31"></label>
          </div>

          <label class="nx-field"><span>Note</span><textarea name="notes" rows="4"></textarea></label>
          <button class="nx-btn primary" type="submit">Creează oferta</button>
        </form>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Caută oferte</h2>
            <p>Caută după număr ofertă, client sau CUI.</p>
          </div>
        </div>

        <form method="get" action="/nexora/quotes" class="nx-form">
          <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(q)}" placeholder="Q-2026-0001 / client / CUI"></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Caută</button>
            <a class="nx-btn" href="/nexora/quotes">Reset</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h2>Lista oferte</h2>
          <p>Ultimele 300 de oferte comerciale.</p>
        </div>
      </div>

      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Ofertă</th>
              <th>Client</th>
              <th>Status</th>
              <th class="nx-right">Total</th>
              <th>Valabil până la</th>
              <th>Creată</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6"><em>Nu există oferte încă.</em></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Oferte",
    appName: "Nexora ERP",
    companyName,
    user: ctx.user,
    userEmail,
    currentPath,
    eyebrow: "Vânzări",
    pageTitle: "Oferte",
    body
  });
}

function renderNexoraQuoteDetailPage(ctx = {}) {
  const {
    quote = {},
    items = [],
    totals = {},
    companyName = "",
    currentPath = "/nexora/quotes",
    fmtMoney = (v) => String(v ?? "")
  } = ctx;

  const rows = items.map((it) => `
    <tr>
      <td><b>${escapeHtml(it.name || "")}</b></td>
      <td class="nx-right">${escapeHtml(String(it.qty ?? ""))}</td>
      <td>${escapeHtml(it.unit || "") || `<span class="nx-table-sub">—</span>`}</td>
      <td class="nx-right">${escapeHtml(fmtMoney(it.unit_price))}</td>
      <td class="nx-right">${escapeHtml(fmtMoney(it.line_total))}</td>
    </tr>
  `).join("");

  const canConvert = String(quote.status || "").toUpperCase() === "ACCEPTED";
  const title = quote.quote_number ? `Ofertă ${quote.quote_number}` : "Ofertă";

  const body = `
    ${renderSalesNav("/nexora/quotes")}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(quote.client_name || "Client necunoscut")} ${quote.client_cui ? "· " + escapeHtml(quote.client_cui) : ""}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/quotes">Înapoi la oferte</a>
        </div>
      </div>

      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">▣</div>
          <div>
            <div class="nx-kpi-label">Status</div>
            <div class="nx-kpi-value">${quoteBadge(quote.status)}</div>
          </div>
        </div>
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">∑</div>
          <div>
            <div class="nx-kpi-label">Total</div>
            <div class="nx-kpi-value">${escapeHtml(fmtMoney(totals.total ?? quote.total))}</div>
          </div>
        </div>
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon orange">%</div>
          <div>
            <div class="nx-kpi-label">TVA</div>
            <div class="nx-kpi-value">${escapeHtml(fmtMoney(totals.vat_amount ?? quote.vat_amount))}</div>
          </div>
        </div>
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon purple">⌁</div>
          <div>
            <div class="nx-kpi-label">Valabil până la</div>
            <div class="nx-kpi-value">${escapeHtml(quote.valid_until || "-")}</div>
          </div>
        </div>
      </section>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <h2>Detalii ofertă</h2>
          <span>${escapeHtml(quote.created_at || "-")}</span>
        </div>
        <div class="nx-client-info-grid">
          <div><span>Client</span><b>${escapeHtml(quote.client_name || "-")}</b></div>
          <div><span>CUI</span><b>${escapeHtml(quote.client_cui || "-")}</b></div>
          <div><span>Monedă</span><b>${escapeHtml(quote.currency || "RON")}</b></div>
          <div class="wide"><span>Titlu</span><b>${escapeHtml(quote.title || "-")}</b></div>
          <div class="wide"><span>Note</span><b>${escapeHtml(quote.notes || "-")}</b></div>
        </div>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <h2>Status & PDF</h2>
          <span>Flux comercial</span>
        </div>

        <form method="post" action="/quote/${escapeHtml(quote.id)}/status" class="nx-form">
          <input type="hidden" name="return_to" value="nexora">
          <label class="nx-field">
            <span>Status</span>
            <select name="status">
              ${["DRAFT", "SENT", "ACCEPTED", "REJECTED"].map((st) => `<option value="${st}" ${String(quote.status || "").toUpperCase() === st ? "selected" : ""}>${st}</option>`).join("")}
            </select>
          </label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Salvează</button>
          </div>
        </form>

        <div class="nx-invoice-action-stack">
          ${quote.pdf_path ? `<a class="nx-btn" href="/${escapeHtml(quote.pdf_path)}" target="_blank">Deschide PDF</a>` : ""}
          <form method="post" action="/quote/${escapeHtml(quote.id)}/generate-pdf">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn" type="submit">Generează PDF</button>
          </form>
          <form method="post" action="/quote/${escapeHtml(quote.id)}/convert-to-contract">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn ${canConvert ? "primary" : ""}" type="submit" ${canConvert ? "" : "disabled"}>Convertește în contract</button>
          </form>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h2>Linii ofertă</h2>
          <p>Produse și servicii incluse în oferta curentă.</p>
        </div>
      </div>

      <form method="post" action="/quote/${escapeHtml(quote.id)}/items/add" class="nx-inline-form nx-invoice-line-form">
        <input type="hidden" name="return_to" value="nexora">
        <label class="nx-field"><span>Denumire</span><input name="name" required placeholder="Servicii implementare"></label>
        <label class="nx-field"><span>Unitate</span><input name="unit" placeholder="buc / ore / luni"></label>
        <label class="nx-field"><span>Cantitate</span><input name="qty" value="1"></label>
        <label class="nx-field"><span>Preț unitar</span><input name="unit_price" value="0"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă</button></div>
      </form>

      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Denumire</th>
              <th class="nx-right">Cant.</th>
              <th>Unitate</th>
              <th class="nx-right">Preț unitar</th>
              <th class="nx-right">Total linie</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="5"><div class="nx-empty-state">Nu există linii în ofertă.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user: ctx.user,
    currentPath,
    eyebrow: "Vânzări / Oferte",
    pageTitle: title,
    body
  });
}

export {
  renderNexoraQuotesPage,
  renderNexoraQuoteDetailPage
};
