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

function statusClass(status = "") {
  const s = String(status || "").toUpperCase();
  if (s === "PLATITA" || s === "ACHITATA") return "success";
  if (s === "ANULATA" || s === "INTARZIATA") return "danger";
  if (s === "TRIMISA") return "warn";
  return "neutral";
}

function renderNexoraInvoiceDetailPage(options = {}) {
  const user = options.user || {};
  const invoice = options.invoice || {};
  const lines = Array.isArray(options.lines) ? options.lines : [];
  const totals = options.totals || {};
  const displayNumber = options.displayNumber || invoice.factura_nr || "-";
  const clientEmail = options.clientEmail || "";
  const companyName = user.company_name || "Workspace";

  const sidebar = renderErpSidebar({
    currentPath: "/facturi",
    appName: "Nexora ERP",
    companyName
  });

  const linesHtml = lines.length
    ? lines.map((line) => `
      <tr>
        <td>
          <b>${escapeHtml(line.denumire || "-")}</b>
          ${line.descriere ? `<div class="nx-table-sub">${escapeHtml(line.descriere)}</div>` : ""}
        </td>
        <td>${escapeHtml(line.cantitate ?? "-")}</td>
        <td>${escapeHtml(line.unitate || "-")}</td>
        <td>${escapeHtml(money(line.pret_unitar, invoice.moneda))}</td>
        <td>${escapeHtml(money(line.total_linie, invoice.moneda))}</td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="5">
          <div class="nx-empty-state">Factura nu are linii.</div>
        </td>
      </tr>
    `;

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Factura ${escapeHtml(displayNumber)}</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Financiar / Factură</div>
          <div class="nx-page-title">${escapeHtml(displayNumber)}</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/nexora/facturi">Înapoi la facturi</a>
          <a class="nx-btn" href="/factura/${escapeHtml(invoice.id)}">UI vechi</a>
          <form method="post" action="/factura/${escapeHtml(invoice.id)}/genereaza-pdf" style="margin:0">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn primary" type="submit">Generează PDF</button>
          </form>
          <form method="post" action="/factura/${escapeHtml(invoice.id)}/efactura/trimite" style="margin:0">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn primary" type="submit">Trimite e-Factura</button>
          </form>
          <form method="post" action="/factura/${escapeHtml(invoice.id)}/efactura/confirma-spv" style="margin:0">
            <input type="hidden" name="return_to" value="nexora">
            <button class="nx-btn" type="submit">Verifică SPV</button>
          </form>
          ${invoice.pdf_path ? `<a class="nx-btn" href="/${escapeHtml(invoice.pdf_path)}" target="_blank">Deschide PDF</a>` : ""}
        </div>
      </header>

      <section class="nx-invoice-layout">
        <main class="nx-invoice-main">
          <section class="nx-content-card">
            <div class="nx-section-head">
              <div>
                <h1>Detalii factură</h1>
                <p>Informații principale despre documentul fiscal și client.</p>
              </div>
              <span class="nx-status-pill ${statusClass(invoice.status)}">${escapeHtml(invoice.status || "CIORNA")}</span>
            </div>

            <div class="nx-client-info-grid">
              <div><span>Număr</span><b>${escapeHtml(displayNumber)}</b></div>
              <div><span>Data emitere</span><b>${escapeHtml(invoice.data_emitere || "-")}</b></div>
              <div><span>Scadență</span><b>${escapeHtml(invoice.scadenta || "-")}</b></div>
              <div><span>Client</span><b>${escapeHtml(invoice.client || "-")}</b></div>
              <div><span>Email client</span><b>${escapeHtml(clientEmail || "-")}</b></div>
              <div><span>Monedă</span><b>${escapeHtml(invoice.moneda || "RON")}</b></div>
              <div class="wide"><span>Observații</span><b>${escapeHtml(invoice.observatii || "-")}</b></div>
            </div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head">
              <h2>Linii factură</h2>
              <span>${lines.length}</span>
            </div>

            <div class="nx-table-wrap">
              <table class="nx-table">
                <thead>
                  <tr>
                    <th>Denumire</th>
                    <th>Cantitate</th>
                    <th>UM</th>
                    <th>Preț unitar</th>
                    <th>Total linie</th>
                  </tr>
                </thead>
                <tbody>${linesHtml}</tbody>
              </table>
            </div>
          </section>
        </main>

        <aside class="nx-invoice-side">
          <section class="nx-content-card">
            <div class="nx-panel-head">
              <h2>Totaluri</h2>
              <span>${escapeHtml(invoice.moneda || "RON")}</span>
            </div>

            <div class="nx-total-box">
              <div><span>Subtotal</span><strong>${escapeHtml(money(totals.subtotal ?? invoice.subtotal, invoice.moneda))}</strong></div>
              <div><span>TVA</span><strong>${escapeHtml(money(totals.tva_valoare ?? invoice.tva_valoare, invoice.moneda))}</strong></div>
              <div class="grand"><span>Total</span><strong>${escapeHtml(money(totals.total ?? invoice.total, invoice.moneda))}</strong></div>
            </div>
          </section>

          <section class="nx-content-card">
            <div class="nx-panel-head">
              <h2>e-Factura</h2>
              <span>Status</span>
            </div>

            <div class="nx-anaf-box">
              <div class="nx-anaf-row">
                <span>Status</span>
                <strong>${escapeHtml(invoice.efactura_status || "Netrimis")}</strong>
              </div>
              <div class="nx-anaf-row">
                <span>Message ID</span>
                <strong>${escapeHtml(invoice.efactura_message_id || "-")}</strong>
              </div>
              <div class="nx-invoice-action-stack">
                <form method="post" action="/factura/${escapeHtml(invoice.id)}/efactura/genereaza-xml">
                  <input type="hidden" name="return_to" value="nexora">
                  <button class="nx-btn" type="submit">Generează XML</button>
                </form>

                ${invoice.efactura_response_zip_path ? `<a class="nx-btn" href="/factura/${escapeHtml(invoice.id)}/efactura/raspuns">Deschide răspuns ANAF</a>` : ""}
                <a class="nx-btn" href="/factura/${escapeHtml(invoice.id)}">Acțiuni avansate în UI vechi</a>
              </div>
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
  renderNexoraInvoiceDetailPage
};
