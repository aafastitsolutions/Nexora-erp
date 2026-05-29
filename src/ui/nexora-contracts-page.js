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

function money(value, fmtMoney) {
  if (typeof fmtMoney === "function") return fmtMoney(value || 0);
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} RON`;
}

function originBadge(origin) {
  const value = String(origin || "DIRECT").toUpperCase();
  const cls = value === "QUOTE" ? "warn" : "success";
  return `<span class="nx-status-pill ${cls}">${escapeHtml(value)}</span>`;
}

function renderNexoraContractsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const q = options.q || "";
  const fmtMoney = options.fmtMoney;

  const directCount = rows.filter((row) => String(row.origin || "DIRECT").toUpperCase() !== "QUOTE").length;
  const quoteCount = rows.filter((row) => String(row.origin || "").toUpperCase() === "QUOTE").length;
  const totalValue = rows.reduce((sum, row) => sum + (Number(row.price || 0) || 0), 0);

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/nexora/contracts/${escapeHtml(row.id)}">${escapeHtml(row.contract_number || "-")}</a>
          <div class="nx-table-sub">${escapeHtml(row.created_at || "-")}</div>
        </td>
        <td>
          <a class="nx-table-main-link" href="/nexora/clients/${escapeHtml(row.client_id)}">${escapeHtml(row.client_name || "Client necunoscut")}</a>
          <div class="nx-table-sub">${escapeHtml(row.client_cui || "")}</div>
        </td>
        <td class="nx-right">${escapeHtml(money(row.price, fmtMoney))}</td>
        <td>${escapeHtml(row.duration || "-")}</td>
        <td>${originBadge(row.origin)}</td>
        <td class="nx-table-actions">
          ${row.pdf_path ? `<a class="nx-btn" href="/${escapeHtml(row.pdf_path)}" target="_blank">PDF</a>` : ""}
          <a class="nx-btn primary" href="/nexora/contracts/${escapeHtml(row.id)}">Deschide</a>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există contracte pentru criteriile curente.</div></td></tr>`;

  const body = `
    ${renderSalesNav("/nexora/contracts")}
    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card">
        <div class="nx-kpi-icon blue">▣</div>
        <div>
          <div class="nx-kpi-label">Contracte afișate</div>
          <div class="nx-kpi-value">${escapeHtml(rows.length)}</div>
        </div>
      </div>
      <div class="nx-kpi-card">
        <div class="nx-kpi-icon green">∑</div>
        <div>
          <div class="nx-kpi-label">Valoare totală</div>
          <div class="nx-kpi-value">${escapeHtml(money(totalValue, fmtMoney))}</div>
        </div>
      </div>
      <div class="nx-kpi-card">
        <div class="nx-kpi-icon purple">Q</div>
        <div>
          <div class="nx-kpi-label">Din oferte</div>
          <div class="nx-kpi-value">${escapeHtml(quoteCount)}</div>
        </div>
      </div>
      <div class="nx-kpi-card">
        <div class="nx-kpi-icon orange">D</div>
        <div>
          <div class="nx-kpi-label">Directe</div>
          <div class="nx-kpi-value">${escapeHtml(directCount)}</div>
        </div>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Contracte</h1>
          <p>Contracte generate direct sau convertite din oferte, filtrate pe compania curentă.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/quotes">Oferte</a>
        </div>
      </div>

      <form class="nx-inline-form nx-contract-filter-form" method="get" action="/nexora/contracts">
        <label class="nx-field nx-field-wide">
          <span>Caută contract</span>
          <input name="q" value="${escapeHtml(q)}" placeholder="Număr contract, client sau CUI">
        </label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Caută</button>
          <a class="nx-btn" href="/nexora/contracts">Reset</a>
        </div>
      </form>

      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Client</th>
              <th class="nx-right">Valoare</th>
              <th>Durată</th>
              <th>Origine</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Contracte",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/contracts",
    eyebrow: "Vânzări",
    pageTitle: "Contracte",
    body
  });
}

function renderNexoraContractDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const contract = options.contract || {};
  const fmtMoney = options.fmtMoney;
  const ok = options.ok || "";

  const okMessages = {
    salvat: "Contractul a fost actualizat.",
    pdf_generat: "PDF-ul contractului a fost regenerat.",
    contract_generat: "Contractul a fost generat din ofertă."
  };

  const alertHtml = ok
    ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>`
    : "";

  const body = `
    ${renderSalesNav("/nexora/contracts")}
    ${alertHtml}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(contract.contract_number || "Contract")}</h1>
          <p>${escapeHtml(contract.client_name || "Client necunoscut")} ${contract.client_cui ? "· " + escapeHtml(contract.client_cui) : ""}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/contracts">Înapoi la contracte</a>
        </div>
      </div>

      <section class="nx-kpi-grid invoice-kpis">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">∑</div>
          <div>
            <div class="nx-kpi-label">Valoare</div>
            <div class="nx-kpi-value">${escapeHtml(money(contract.price, fmtMoney))}</div>
          </div>
        </div>
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon orange">⌁</div>
          <div>
            <div class="nx-kpi-label">Durată</div>
            <div class="nx-kpi-value">${escapeHtml(contract.duration || "-")}</div>
          </div>
        </div>
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">▣</div>
          <div>
            <div class="nx-kpi-label">Origine</div>
            <div class="nx-kpi-value">${originBadge(contract.origin)}</div>
          </div>
        </div>
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon purple">PDF</div>
          <div>
            <div class="nx-kpi-label">Document</div>
            <div class="nx-kpi-value">${contract.pdf_path ? "generat" : "lipsă"}</div>
          </div>
        </div>
      </section>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <h2>Client</h2>
          <span>${escapeHtml(contract.created_at || "-")}</span>
        </div>
        <div class="nx-client-info-grid">
          <div><span>Nume</span><b>${escapeHtml(contract.client_name || "-")}</b></div>
          <div><span>CUI</span><b>${escapeHtml(contract.client_cui || "-")}</b></div>
          <div><span>Reg. Com.</span><b>${escapeHtml(contract.client_reg_com || "-")}</b></div>
          <div class="wide"><span>Adresă</span><b>${escapeHtml(contract.client_address || "-")}</b></div>
        </div>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <h2>PDF</h2>
          <span>Document contract</span>
        </div>
        <div class="nx-invoice-action-stack">
          ${contract.pdf_path ? `<a class="nx-btn primary" href="/${escapeHtml(contract.pdf_path)}" target="_blank">Deschide PDF</a>` : ""}
          <form method="post" action="/contract/${escapeHtml(contract.id)}/regenerate-pdf">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn" type="submit">Regenerează PDF</button>
          </form>
        </div>
        <div class="nx-table-sub">${escapeHtml(contract.pdf_path || "PDF-ul nu a fost generat încă.")}</div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h2>Editare contract</h2>
          <p>Actualizează descrierea serviciilor, valoarea și durata. PDF-ul se regenerează separat.</p>
        </div>
      </div>

      <form method="post" action="/contract/${escapeHtml(contract.id)}/edit" class="nx-form">
        <input type="hidden" name="return_to" value="nexora">
        <label class="nx-field">
          <span>Descriere servicii</span>
          <textarea name="service_description" rows="8" required>${escapeHtml(contract.service_description || "")}</textarea>
        </label>
        <div class="nx-two-column-grid compact">
          <label class="nx-field"><span>Preț</span><input name="price" value="${escapeHtml(String(contract.price ?? ""))}" required></label>
          <label class="nx-field"><span>Durată</span><input name="duration" value="${escapeHtml(contract.duration || "")}" required></label>
        </div>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Salvează</button>
          ${contract.pdf_path ? `<a class="nx-btn" href="/${escapeHtml(contract.pdf_path)}" target="_blank">PDF curent</a>` : ""}
        </div>
      </form>
    </section>
  `;

  return renderNexoraShell({
    title: contract.contract_number ? `Contract ${contract.contract_number}` : "Contract",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/contracts",
    eyebrow: "Vânzări / Contracte",
    pageTitle: contract.contract_number || "Contract",
    body
  });
}

export {
  renderNexoraContractDetailPage,
  renderNexoraContractsPage
};
