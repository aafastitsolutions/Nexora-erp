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

function formatFileSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function renderImportFlash(ok = "", err = "", registrationNumber = "", folderStats = {}) {
  if (ok === "imported") {
    return `<div class="nx-alert success">Document importat și înregistrat cu numărul ${escapeHtml(registrationNumber || "-")}.</div>`;
  }
  if (ok === "folder_imported") {
    const imported = escapeHtml(folderStats.imported || "0");
    const duplicates = escapeHtml(folderStats.duplicates || "0");
    const skipped = escapeHtml(folderStats.skipped || "0");
    return `<div class="nx-alert success">Import folder finalizat: ${imported} documente importate, ${duplicates} duplicate, ${skipped} fișiere sărite.</div>`;
  }

  const messages = {
    client_required: "Alege un client existent sau completează datele pentru client nou.",
    client_missing: "Clientul selectat nu mai există.",
    client_create_required: "Completează numele clientului nou.",
    file_count: "Folderul conține prea multe fișiere pentru un singur import.",
    file_size: "Fișierul depășește limita permisă.",
    file_type: "Poți importa doar PDF, Word sau Excel.",
    folder_empty: "Folderul selectat nu conține documente importabile.",
    folder_structure: "Folderul trebuie să conțină documente în dosare de client.",
    no_file: "Alege un fișier pentru import.",
    save_failed: "Importul nu a putut fi salvat."
  };
  return err ? `<div class="nx-alert danger">${escapeHtml(messages[err] || messages.save_failed)}</div>` : "";
}

function renderNexoraQuotesPage(ctx = {}) {
  const {
    currentPath = "/nexora/quotes",
    userEmail = "",
    companyName = "",
    quotes = [],
    importedQuotes = [],
    clients = [],
    q = "",
    ok = "",
    err = "",
    registrationNumber = "",
    folderImportedCount = "",
    folderDuplicateCount = "",
    folderSkippedCount = "",
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

  const importClientOptions = [
    `<option value="">Alege client existent</option>`,
    ...clients.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || "")} (${escapeHtml(c.cui || "")})</option>`)
  ].join("");

  const importedRows = importedQuotes.map((x) => `
    <tr>
      <td>
        <b>${escapeHtml(x.registration_number || "-")}</b>
        <div class="nx-table-sub">${escapeHtml(x.created_at || "")}</div>
      </td>
      <td>
        <b>${escapeHtml(x.client_name || "")}</b>
        <div class="nx-table-sub">${escapeHtml(x.client_cui || "")}</div>
      </td>
      <td>
        <b>${escapeHtml(x.title || "")}</b>
        <div class="nx-table-sub">${escapeHtml(x.original_file_name || "")} · ${escapeHtml(String(x.extension || "").replace(".", "").toUpperCase())} · ${escapeHtml(formatFileSize(x.file_size))}</div>
      </td>
      <td class="nx-right">
        <a class="nx-btn" href="/nexora/quotes/imports/${escapeHtml(x.id)}/download">Descarcă</a>
      </td>
    </tr>
  `).join("");

  const flashHtml = renderImportFlash(ok, err, registrationNumber, {
    imported: folderImportedCount,
    duplicates: folderDuplicateCount,
    skipped: folderSkippedCount
  });

  const body = `
    ${renderSalesNav("/nexora/quotes")}
    ${flashHtml}
    <section class="nx-content-card">
    <div class="nx-section-head">
      <div>
        <h1>Oferte</h1>
        <p>Creează, urmărește și convertește ofertele comerciale în contracte.</p>
      </div>
      <div class="nx-form-actions">
        <a class="nx-btn primary" href="#import-folder-oferte">Import folder</a>
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
            <h2>Import document ofertă</h2>
            <p>Înregistrează PDF, Word sau Excel și leagă documentul de client.</p>
          </div>
        </div>

        <form method="post" action="/nexora/quotes/import" enctype="multipart/form-data" class="nx-form">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Titlu intern</span><input name="title" placeholder="Ex: ofertă primită furnizor / client"></label>
            <label class="nx-field"><span>Document</span><input type="file" name="quote_file" accept=".pdf,.doc,.docx,.xls,.xlsx" required></label>
          </div>

          <div class="nx-two-column-grid compact">
            <label class="nx-field">
              <span>Tip client</span>
              <select name="client_mode" data-quote-import-mode>
                <option value="existent">Client existent</option>
                <option value="nou">Client nou</option>
              </select>
            </label>
            <label class="nx-field" data-quote-existing-client>
              <span>Client existent</span>
              <select name="client_id">${importClientOptions}</select>
            </label>
          </div>

          <div data-quote-new-client style="display:none">
            <div class="nx-two-column-grid compact">
              <label class="nx-field"><span>Nume client nou</span><input name="new_client_name" placeholder="Denumire client"></label>
              <label class="nx-field"><span>CUI / cod intern</span><input name="new_client_cui" placeholder="RO123456 sau cod intern"></label>
            </div>
            <div class="nx-two-column-grid compact">
              <label class="nx-field"><span>Email</span><input name="new_client_email" placeholder="contact@client.ro"></label>
              <label class="nx-field"><span>Telefon</span><input name="new_client_phone" placeholder="+40..."></label>
            </div>
            <label class="nx-field"><span>Adresă</span><input name="new_client_address" placeholder="Adresă client"></label>
          </div>

          <label class="nx-field"><span>Note</span><textarea name="notes" rows="3"></textarea></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Importă și înregistrează</button>
          </div>
        </form>
      </section>

      <section class="nx-panel" id="import-folder-oferte">
        <div class="nx-panel-head">
          <div>
            <h2>Import folder oferte</h2>
            <p>Încarcă dosare organizate pe clienți și le înregistrează automat.</p>
          </div>
        </div>

        <form method="post" action="/nexora/sales/import-foldere-oferte" enctype="multipart/form-data" class="nx-form">
          <input type="hidden" name="folder_layout" value="client_folders">
          <label class="nx-field">
            <span>Folder</span>
            <input type="file" name="quote_files" accept=".pdf,.doc,.docx,.xls,.xlsx" webkitdirectory directory multiple required>
          </label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Importă folder</button>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-panel">
      <div class="nx-panel-head">
        <div>
          <h2>Caută oferte</h2>
          <p>Caută după număr ofertă, număr înregistrare, client, CUI sau document.</p>
        </div>
      </div>

      <form method="get" action="/nexora/quotes" class="nx-inline-form">
        <label class="nx-field"><span>Căutare</span><input name="q" value="${escapeHtml(q)}" placeholder="Q-2026-0001 / OFE-2026-00001 / client / CUI"></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Caută</button>
          <a class="nx-btn" href="/nexora/quotes">Reset</a>
        </div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h2>Oferte importate</h2>
          <p>Documente externe înregistrate automat și atribuite clienților.</p>
        </div>
      </div>

      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Număr înregistrare</th>
              <th>Client</th>
              <th>Document</th>
              <th class="nx-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody>${importedRows || `<tr><td colspan="4"><div class="nx-empty-state">Nu există documente importate încă.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>

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
    <script>
      (() => {
        const mode = document.querySelector("[data-quote-import-mode]");
        const existingClient = document.querySelector("[data-quote-existing-client]");
        const newClient = document.querySelector("[data-quote-new-client]");
        if (!mode || !existingClient || !newClient) return;
        const sync = () => {
          const isNew = mode.value === "nou";
          existingClient.style.display = isNew ? "none" : "";
          newClient.style.display = isNew ? "" : "none";
        };
        mode.addEventListener("change", sync);
        sync();
      })();
    </script>
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

function renderNexoraQuoteFolderImportPage(ctx = {}) {
  const {
    currentPath = "/nexora/sales/import-foldere-oferte",
    userEmail = "",
    companyName = "",
    ok = "",
    err = "",
    folderImportedCount = "",
    folderDuplicateCount = "",
    folderSkippedCount = ""
  } = ctx;

  const flashHtml = renderImportFlash(ok, err, "", {
    imported: folderImportedCount,
    duplicates: folderDuplicateCount,
    skipped: folderSkippedCount
  });

  const body = `
    ${renderSalesNav("/nexora/sales/import-foldere-oferte")}
    ${flashHtml}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Import foldere oferte</h1>
          <p>Încarcă dosare locale organizate pe clienți. Nexora creează clienții lipsă și înregistrează documentele în Vânzări.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/quotes">Înapoi la oferte</a>
        </div>
      </div>
    </section>

    <section class="nx-panel">
      <div class="nx-panel-head">
        <div>
          <h2>Folder de import</h2>
          <span>PDF, Word sau Excel</span>
        </div>
      </div>

      <form method="post" action="/nexora/sales/import-foldere-oferte" enctype="multipart/form-data" class="nx-form">
        <input type="hidden" name="folder_layout" value="client_folders">
        <label class="nx-field">
          <span>Selectează folderul</span>
          <input type="file" name="quote_files" accept=".pdf,.doc,.docx,.xls,.xlsx" webkitdirectory directory multiple required>
        </label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Importă folder</button>
        </div>
      </form>
    </section>
  `;

  return renderNexoraShell({
    title: "Import foldere oferte",
    appName: "Nexora ERP",
    companyName,
    user: ctx.user,
    userEmail,
    currentPath,
    eyebrow: "Vânzări",
    pageTitle: "Import foldere oferte",
    body
  });
}

export {
  renderNexoraQuotesPage,
  renderNexoraQuoteFolderImportPage,
  renderNexoraQuoteDetailPage
};
