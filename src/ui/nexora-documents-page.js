import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const TEMPLATE_LINKS = [
  ["/nexora/documents/templates/proces-verbal", "Proces verbal"],
  ["/nexora/documents/templates/adeverinta", "Adeverință salariat"],
  ["/nexora/documents/templates/decizie-interna", "Decizie internă"],
  ["/nexora/documents/templates/notificare-client", "Notificare client"],
  ["/nexora/documents/templates/cerere-concediu", "Cerere concediu"],
  ["/nexora/documents/templates/ordin-deplasare", "Ordin de deplasare"],
  ["/nexora/documents/templates/fisa-hr", "Fișă HR"]
];

function renderNexoraDocumentsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const docs = Array.isArray(options.docs) ? options.docs : [];
  const autofillDocuments = Array.isArray(options.autofillDocuments) ? options.autofillDocuments : [];
  const autofillProfile = options.autofillProfile || {};
  const summary = options.summary || {};
  const ok = options.ok || "";
  const err = options.err || "";

  const okMessages = {
    uploaded: "Documentul a fost încărcat și înregistrat.",
    deleted: "Documentul a fost șters. Poziția din registru a rămas marcată.",
    autofilled: "Formularul a fost completat automat. Îl poți descărca din istoricul de mai jos.",
    autofill_deleted: "Documentul completat a fost șters din istoricul automatizării."
  };
  const errorMessages = {
    no_file: "Selectează un formular DOCX sau PDF.",
    unsupported_type: "Automatizarea acceptă numai formulare DOCX sau PDF.",
    invalid_docx: "Fișierul DOCX nu poate fi citit.",
    invalid_pdf: "Fișierul PDF nu poate fi citit.",
    no_fields: "Nu au fost găsite câmpuri completabile: folosește linii punctate etichetate ori markeri în DOCX sau un PDF cu câmpuri editabile.",
    processing: "Formularul nu a putut fi procesat."
  };

  const alertHtml = [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errorMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");

  const templatesHtml = TEMPLATE_LINKS.map(([href, label]) => `
    <a href="${escapeHtml(href)}">${escapeHtml(label)}</a>
  `).join("");

  const rowsHtml = docs.length
    ? docs.map((doc) => `
      <tr>
        <td>
          <b>${escapeHtml(doc.title || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(doc.file_name || "")}</div>
        </td>
        <td>${doc.registration_number ? `<span class="nx-status-pill warn">${escapeHtml(doc.registration_number)}</span>` : `<span class="nx-table-sub">—</span>`}</td>
        <td>${escapeHtml(doc.category || "-")}</td>
        <td>${escapeHtml(doc.created_at || "-")}</td>
        <td>${escapeHtml(doc.registered_at || "-")}</td>
        <td class="nx-table-actions">
          <a class="nx-btn primary" href="/${escapeHtml(doc.file_path || "")}" target="_blank">Deschide</a>
          <form method="post" action="/nexora/documents/${escapeHtml(doc.id)}/delete" onsubmit="return confirm('Ștergi documentul? Numărul din registru rămâne păstrat.');">
            <button class="nx-btn danger" type="submit">Șterge</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6"><div class="nx-empty-state">Nu există documente încărcate.</div></td></tr>`;

  const profileItems = [
    ["Companie", autofillProfile.company_name],
    ["CUI", autofillProfile.company_cui],
    ["RC", autofillProfile.company_rc],
    ["Adresă", autofillProfile.company_address],
    ["IBAN / Bancă", [autofillProfile.company_iban, autofillProfile.company_bank].filter(Boolean).join(" / ")],
    ["Reprezentant legal", autofillProfile.legal_representative],
    ["CI reprezentant", [autofillProfile.legal_representative_ci_series, autofillProfile.legal_representative_ci_number, autofillProfile.legal_representative_ci_issued_by].filter(Boolean).join(" / ")],
    ["Contact", [autofillProfile.company_phone, autofillProfile.company_email].filter(Boolean).join(" / ")]
  ].map(([label, value]) => `
    <div class="nx-settings-note">
      <b>${escapeHtml(label)}</b>
      <span>${escapeHtml(value || "Necompletat")}</span>
    </div>
  `).join("");

  const autofillRowsHtml = autofillDocuments.length
    ? autofillDocuments.map((document) => `
      <tr>
        <td>
          <b>${escapeHtml(document.title || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(document.source_file_name || "")}</div>
          ${document.registration_number ? `<span class="nx-status-pill warn">${escapeHtml(document.registration_number)}</span>` : ""}
        </td>
        <td><span class="nx-status-pill success">${escapeHtml(document.template_type || "-")}</span></td>
        <td>${escapeHtml((document.matchedFields || []).join(", ") || "-")}<div class="nx-table-sub">${escapeHtml(document.replacement_count || 0)} completări</div></td>
        <td>${escapeHtml(document.created_at || "-")}</td>
        <td class="nx-table-actions">
          <a class="nx-btn primary" href="/nexora/documents/autofill/${escapeHtml(document.id)}/download">Descarcă</a>
          <form method="post" action="/nexora/documents/autofill/${escapeHtml(document.id)}/delete" onsubmit="return confirm('Ștergi formularul completat?');">
            <button class="nx-btn danger" type="submit">Șterge</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5"><div class="nx-empty-state">Nu ai procesat încă formulare automat.</div></td></tr>`;

  const body = `
    ${alertHtml}

    <section class="nx-content-card" id="autofill">
      <div class="nx-section-head">
        <div>
          <h1>Completare automată formulare</h1>
          <p>Încarcă un DOCX sau PDF, iar Nexora completează numai datele firmei și ale reprezentantului legal.</p>
        </div>
        <a class="nx-btn" href="/nexora/settings?tab=company">Actualizează date firmă</a>
      </div>

      <div class="nx-two-column-grid">
        <section class="nx-panel">
          <div class="nx-panel-head">
            <div><h2>Formular de completat</h2><span>Export în același format: DOCX sau PDF</span></div>
          </div>
          <form method="post" action="/nexora/documents/autofill" enctype="multipart/form-data" class="nx-form">
            <label class="nx-field"><span>Titlu intern</span><input name="title" placeholder="Declarație / cerere completată"></label>
            <label class="nx-field">
              <span>Formular DOCX sau PDF</span>
              <input type="file" name="template" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
            </label>
            <p class="nx-field-hint">DOCX: sunt recunoscute liniile punctate etichetate (de ex. Subsemnatul, seria și nr. CI, eliberat de, sediul social, cod fiscal) și markerii de mai jos. PDF: formularul trebuie să conțină câmpuri editabile denumite pentru firmă ori reprezentant.</p>
            <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Completează automat</button></div>
          </form>
        </section>

        <section class="nx-panel">
          <div class="nx-panel-head">
            <div><h2>Date folosite</h2><span>din Setări / Date firmă</span></div>
          </div>
          <div class="nx-form">${profileItems}</div>
        </section>
      </div>

      <section class="nx-panel" style="margin-top:18px">
        <div class="nx-panel-head">
          <div><h2>Câmpuri DOCX acceptate</h2><span>Se completează strict aceste informații</span></div>
        </div>
        <p class="nx-field-hint">Nexora completează automat spații punctate după etichete clare precum <code>Subsemnatul(a)</code>, <code>seria</code> / <code>nr.</code> CI, <code>eliberat(ă) de</code>, <code>reprezentant legal al</code>, <code>sediul social</code> și <code>cod de înregistrare fiscală</code>. Se completează numai valorile existente în Setări / Date firmă.</p>
        <div class="nx-shortcuts">
          <span><code>{{company_name}}</code></span>
          <span><code>{{company_cui}}</code></span>
          <span><code>{{company_rc}}</code></span>
          <span><code>{{company_address}}</code></span>
          <span><code>{{company_iban}}</code></span>
          <span><code>{{company_bank}}</code></span>
          <span><code>{{company_phone}}</code></span>
          <span><code>{{company_email}}</code></span>
          <span><code>{{capital_social}}</code></span>
          <span><code>{{legal_representative}}</code></span>
          <span><code>{{legal_representative_ci_series}}</code></span>
          <span><code>{{legal_representative_ci_number}}</code></span>
          <span><code>{{legal_representative_ci_issued_by}}</code></span>
        </div>
        <p class="nx-field-hint">Un PDF scanat sau fără câmpuri editabile rămâne nemodificat; Nexora nu inserează date în zone incerte ale formularului.</p>
      </section>

      <div class="nx-table-wrap" style="margin-top:18px">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Formular</th>
              <th>Format export</th>
              <th>Câmpuri completate</th>
              <th>Procesat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${autofillRowsHtml}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">DOC</div><div><div class="nx-kpi-label">Documente</div><div class="nx-kpi-value">${escapeHtml(docs.length)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">REG</div><div><div class="nx-kpi-label">Înregistrări</div><div class="nx-kpi-value">${escapeHtml(summary.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(summary.active || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">NR</div><div><div class="nx-kpi-label">Următorul număr</div><div class="nx-kpi-value">${escapeHtml(summary.nextNumber || "-")}</div></div></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Modele generate</h2>
            <span>Formulare existente</span>
          </div>
        </div>
        <div class="nx-shortcuts">${templatesHtml}</div>
      </section>

      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Încarcă PDF</h2>
            <span>DMS</span>
          </div>
        </div>
        <form method="post" action="/nexora/documents/upload" enctype="multipart/form-data" class="nx-form">
          <label class="nx-field"><span>Titlu document</span><input name="title" required placeholder="Proces verbal recepție"></label>
          <label class="nx-field">
            <span>Categorie</span>
            <select name="category">
              <option value="PROCES_VERBAL">PROCES_VERBAL</option>
              <option value="ADEVERINTA">ADEVERINTA</option>
              <option value="DECIZIE_INTERNA">DECIZIE_INTERNA</option>
              <option value="NOTIFICARE_CLIENT">NOTIFICARE_CLIENT</option>
              <option value="CERERE_CONCEDIU">CERERE_CONCEDIU</option>
              <option value="ORDIN_DE_DEPLASARE">ORDIN_DE_DEPLASARE</option>
              <option value="FISE_HR">FISE_HR</option>
              <option value="CONTRACT">CONTRACT</option>
              <option value="HR">HR</option>
              <option value="ALTELE">ALTELE</option>
            </select>
          </label>
          <label class="nx-field"><span>Fișier PDF</span><input type="file" name="pdf" accept="application/pdf,.pdf" required></label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Upload PDF</button>
            <a class="nx-btn" href="/nexora/documents/register">Registru</a>
          </div>
        </form>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Documente / DMS</h1>
          <p>Biblioteca documentelor tipizate încărcate manual sau generate.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/documents/register">Registru evidență</a>
          <a class="nx-btn" href="/nexora/documents/register/export.xls">Export registru</a>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Nr. înregistrare</th>
              <th>Categorie</th>
              <th>Creat</th>
              <th>Înregistrat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Documente / DMS",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/documents",
    eyebrow: "Documente",
    pageTitle: "Documente / DMS",
    body
  });
}

function renderNexoraDocumentsRegisterPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const summary = options.summary || {};
  const ok = options.ok || "";

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td><span class="nx-status-pill warn">${escapeHtml(row.registration_number || "-")}</span></td>
        <td>${escapeHtml(row.issued_at || row.created_at || "-")}</td>
        <td>${escapeHtml(row.entry_type || "-")}</td>
        <td><b>${escapeHtml(row.doc_title || "-")}</b><div class="nx-table-sub">${escapeHtml(row.file_name || "")}</div></td>
        <td>${escapeHtml(row.doc_category || "-")}</td>
        <td>${escapeHtml(row.recipient || "-")}</td>
        <td>${row.file_path ? `<a class="nx-table-main-link" href="/${escapeHtml(row.file_path)}" target="_blank">Fișier</a>` : `<span class="nx-table-sub">—</span>`}</td>
        <td>${escapeHtml(row.status || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8"><div class="nx-empty-state">Nu există poziții în registru.</div></td></tr>`;

  const body = `
    ${ok ? `<div class="nx-alert success">Înregistrarea manuală a fost creată.</div>` : ""}

    <section class="nx-kpi-grid invoice-kpis">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">REG</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(summary.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">✓</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(summary.active || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">AN</div><div><div class="nx-kpi-label">An curent</div><div class="nx-kpi-value">${escapeHtml(summary.year || "-")}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">NR</div><div><div class="nx-kpi-label">Următorul număr</div><div class="nx-kpi-value">${escapeHtml(summary.nextNumber || "-")}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Registru evidență acte ieșite</h1>
          <p>Numerotare anuală automată pentru documentele care ies din firmă.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/documents">Documente</a>
          <a class="nx-btn" href="/nexora/documents/register/export.xls">Fisa nr Inregistrare.xls</a>
        </div>
      </div>

      <form method="post" action="/nexora/documents/register/manual" enctype="multipart/form-data" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Denumire document</span><input name="title" required placeholder="Adresă către client"></label>
        <label class="nx-field"><span>Categorie</span><input name="category" value="MANUAL"></label>
        <label class="nx-field"><span>Data documentului</span><input type="date" name="issued_at"></label>
        <label class="nx-field"><span>Destinatar</span><input name="recipient"></label>
        <label class="nx-field"><span>Atașament</span><input type="file" name="attachment" accept=".pdf,.xls,.xlsx,.doc,.docx"></label>
        <label class="nx-field"><span>Observații</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Alocă număr</button></div>
      </form>

      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Dată</th>
              <th>Tip</th>
              <th>Document</th>
              <th>Categorie</th>
              <th>Destinatar</th>
              <th>Fișier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;

  return renderNexoraShell({
    title: "Registru DMS",
    appName: "Nexora ERP",
    companyName,
    currentPath: "/nexora/documents",
    eyebrow: "Documente / DMS",
    pageTitle: "Registru evidență",
    body
  });
}

export {
  renderNexoraDocumentsPage,
  renderNexoraDocumentsRegisterPage
};
