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
  {
    key: "proces-verbal",
    href: "/nexora/documents/templates/proces-verbal",
    label: "Proces verbal",
    description: "Recepție, predare-primire sau constatare internă.",
    accent: "PV"
  },
  {
    key: "adeverinta",
    href: "/nexora/documents/templates/adeverinta",
    label: "Adeverință salariat",
    description: "Document HR pentru confirmarea funcției și calității de salariat.",
    accent: "HR"
  },
  {
    key: "decizie-interna",
    href: "/nexora/documents/templates/decizie-interna",
    label: "Decizie internă",
    description: "Decizii operaționale, administrative sau de management.",
    accent: "DEC"
  },
  {
    key: "notificare-client",
    href: "/nexora/documents/templates/notificare-client",
    label: "Notificare client",
    description: "Adresă oficială către un client din portofoliu.",
    accent: "CLI"
  },
  {
    key: "cerere-concediu",
    href: "/nexora/documents/templates/cerere-concediu",
    label: "Cerere concediu",
    description: "Cerere de concediu pregătită pentru registrul DMS.",
    accent: "CON"
  },
  {
    key: "ordin-deplasare",
    href: "/nexora/documents/templates/ordin-deplasare",
    label: "Ordin de deplasare",
    description: "Delegare, avans și decont pentru deplasări.",
    accent: "OD"
  },
  {
    key: "fisa-hr",
    href: "/nexora/documents/templates/fisa-hr",
    label: "Fișă HR",
    description: "Fișă internă pentru date de personal.",
    accent: "FHR"
  }
];

const TEMPLATE_DEFINITIONS = {
  "proces-verbal": {
    title: "Proces verbal",
    description: "Completează datele procesului verbal și generează PDF înregistrat în DMS.",
    action: "/nexora/documents/templates/proces-verbal/generate",
    fields: [
      { name: "title", label: "Titlu document", required: true, placeholder: "Ex: Proces verbal recepție lucrări" },
      { name: "doc_date", label: "Data", type: "date", value: "today" },
      { name: "location", label: "Locația" },
      { name: "participants", label: "Participanți" },
      { name: "subject", label: "Subiect" },
      { name: "content", label: "Conținut", type: "textarea", rows: 8, required: true },
      { name: "prepared_by", label: "Întocmit de" }
    ]
  },
  adeverinta: {
    title: "Adeverință salariat",
    description: "Generează o adeverință salariat și o salvează în biblioteca DMS.",
    action: "/nexora/documents/templates/adeverinta/generate",
    fields: [
      { name: "title", label: "Titlu document", value: "Adeverință salariat", required: true },
      { name: "employee_name", label: "Nume salariat", required: true, placeholder: "Ex: Popescu Ion" },
      { name: "position", label: "Funcție", required: true, placeholder: "Ex: Tehnician" },
      { name: "doc_date", label: "Data", type: "date", value: "today" },
      { name: "prepared_by", label: "Întocmit de", placeholder: "Ex: Administrator" },
      { name: "content", label: "Conținut / observații", type: "textarea", rows: 6 }
    ]
  },
  "decizie-interna": {
    title: "Decizie internă",
    description: "Pregătește o decizie internă cu număr de înregistrare DMS.",
    action: "/nexora/documents/templates/decizie-interna/generate",
    fields: [
      { name: "title", label: "Titlu document", required: true, placeholder: "Ex: Decizie internă nr. 1" },
      { name: "doc_date", label: "Data", type: "date", value: "today" },
      { name: "issuer", label: "Emitent", placeholder: "Ex: Administrator" },
      { name: "subject", label: "Subiect", required: true },
      { name: "content", label: "Conținut", type: "textarea", rows: 7, required: true }
    ]
  },
  "notificare-client": {
    title: "Notificare client",
    description: "Trimite către PDF o notificare oficială legată de clientul selectat.",
    action: "/nexora/documents/templates/notificare-client/generate",
    fields: [
      { name: "title", label: "Titlu document", required: true, placeholder: "Ex: Notificare client" },
      { name: "client_id", label: "Client", type: "client-select", required: true },
      { name: "doc_date", label: "Data", type: "date", value: "today" },
      { name: "subject", label: "Subiect", required: true },
      { name: "content", label: "Mesaj", type: "textarea", rows: 7, required: true },
      { name: "prepared_by", label: "Semnat de", placeholder: "Ex: Administrator" }
    ]
  },
  "cerere-concediu": {
    title: "Cerere concediu",
    description: "Generează cererea de concediu direct din interfața Nexora.",
    action: "/nexora/documents/templates/cerere-concediu/generate",
    fields: [
      { name: "employee_name", label: "Nume salariat", required: true },
      { name: "period", label: "Perioada", required: true, placeholder: "Ex: 10.03.2026 - 15.03.2026" },
      { name: "leave_type", label: "Tip concediu", required: true, placeholder: "Ex: odihnă" },
      { name: "content", label: "Motiv / observații", type: "textarea", rows: 5 },
      { name: "doc_date", label: "Data cererii", type: "date", value: "today" }
    ]
  },
  "ordin-deplasare": {
    title: "Ordin de deplasare",
    description: "Completează ordinul de deplasare și decontul de bază.",
    action: "/nexora/documents/templates/ordin-deplasare/generate",
    fields: [
      { name: "title", label: "Titlu document", value: "Ordin de deplasare", required: true },
      { name: "doc_date", label: "Data", type: "date", value: "today" },
      { name: "order_number", label: "Număr ordin" },
      { name: "employee_name", label: "Nume delegat", required: true },
      { name: "position", label: "Funcție" },
      { name: "department", label: "Departament / unitate" },
      { name: "destination", label: "Destinație", required: true },
      { name: "purpose", label: "Scop deplasare" },
      { name: "departure_date", label: "Data plecării", type: "date" },
      { name: "return_date", label: "Data sosirii", type: "date" },
      { name: "transport", label: "Transport / legitimare" },
      { name: "advance_amount", label: "Avans spre decontare", placeholder: "0.00" },
      { name: "employee_sign", label: "Titular avans / semnătură" },
      { name: "expenses_notes", label: "Observații decont", type: "textarea", rows: 3 }
    ]
  },
  "fisa-hr": {
    title: "Fișă HR",
    description: "Generează o fișă internă pentru datele de personal.",
    action: "/nexora/documents/templates/fisa-hr/generate",
    fields: [
      { name: "employee_name", label: "Nume salariat", required: true },
      { name: "position", label: "Funcție", required: true },
      { name: "department", label: "Departament" },
      { name: "hire_date", label: "Data angajării", type: "date" },
      { name: "content", label: "Observații / conținut", type: "textarea", rows: 6 }
    ]
  }
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function renderTemplateCards() {
  return TEMPLATE_LINKS.map((template) => `
    <a href="${escapeHtml(template.href)}">
      <b>${escapeHtml(template.label)}</b>
      <small>${escapeHtml(template.description)}</small>
    </a>
  `).join("");
}

function renderTemplateField(field, clients = []) {
  const required = field.required ? "required" : "";
  const value = field.value === "today" ? todayValue() : field.value || "";
  if (field.type === "textarea") {
    return `<label class="nx-field nx-field-wide"><span>${escapeHtml(field.label)}</span><textarea name="${escapeHtml(field.name)}" rows="${escapeHtml(field.rows || 4)}" ${required} placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea></label>`;
  }
  if (field.type === "client-select") {
    return `<label class="nx-field"><span>${escapeHtml(field.label)}</span><select name="${escapeHtml(field.name)}" ${required}>
      <option value="">Selectează clientul</option>
      ${clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name || "-")}${client.cui ? ` (${escapeHtml(client.cui)})` : ""}</option>`).join("")}
    </select></label>`;
  }
  return `<label class="nx-field"><span>${escapeHtml(field.label)}</span><input name="${escapeHtml(field.name)}" type="${escapeHtml(field.type || "text")}" value="${escapeHtml(value)}" ${required} placeholder="${escapeHtml(field.placeholder || "")}"></label>`;
}

function renderNexoraDocumentsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const docs = Array.isArray(options.docs) ? options.docs : [];
  const autofillDocuments = Array.isArray(options.autofillDocuments) ? options.autofillDocuments : [];
  const autofillProfile = options.autofillProfile || {};
  const summary = options.summary || {};
  const ok = options.ok || "";
  const err = options.err || "";
  const isCompanyAdmin = Number(options.isCompanyAdmin || 0) === 1;
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const clientSelectHtml = isCompanyAdmin ? `
    <label class="nx-field"><span>Client asociat (opțional)</span><select name="client_id">
      <option value="">Fără asociere</option>
      ${clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name || "-")} ${client.cui ? `(${escapeHtml(client.cui)})` : ""}</option>`).join("")}
    </select></label>
  ` : "";

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
    file_too_large: "Fișierul este prea mare. Limita pentru completare automată este 20 MB.",
    storage_full: "Serverul nu mai avea spațiu liber pentru upload. Am curățat spațiul; încearcă din nou.",
    upload: "Fișierul nu a putut fi încărcat. Încearcă din nou.",
    processing: "Formularul nu a putut fi procesat."
  };

  const alertHtml = [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errorMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");

  const templatesHtml = renderTemplateCards();

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
    ["CNP reprezentant", autofillProfile.legal_representative_cnp],
    ["Funcție reprezentant", autofillProfile.legal_representative_role],
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
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/documents/ocr">OCR document</a>
          <a class="nx-btn" href="/nexora/settings?tab=company">Actualizează date firmă</a>
        </div>
      </div>

      <div class="nx-two-column-grid">
        <section class="nx-panel">
          <div class="nx-panel-head">
            <div><h2>Formular de completat</h2><span>Export în același format: DOCX sau PDF</span></div>
          </div>
          <form method="post" action="/nexora/documents/autofill" enctype="multipart/form-data" class="nx-form">
            <label class="nx-field"><span>Titlu intern</span><input name="title" placeholder="Declarație / cerere completată"></label>
            ${clientSelectHtml}
            <label class="nx-field">
              <span>Formular DOCX sau PDF</span>
              <input type="file" name="template" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
            </label>
            <p class="nx-field-hint">DOCX: sunt recunoscute liniile punctate etichetate (de ex. OFERTANT/ASOCIAT, Subsemnatul/a, solicitantul, CNP, seria și nr. CI, eliberat de, sediul social, cod fiscal) și markerii de mai jos. PDF: formularul trebuie să conțină câmpuri editabile denumite pentru firmă ori reprezentant.</p>
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
        <p class="nx-field-hint">Nexora completează automat spații punctate după etichete clare precum <code>OFERTANT/ASOCIAT</code>, <code>Subsemnatul/a</code>, <code>solicitantul</code>, <code>CNP</code>, <code>seria</code> / <code>nr.</code> CI, <code>eliberat(ă) de</code>, <code>reprezentant legal al</code>, <code>sediul social</code> și <code>cod de înregistrare fiscală</code>. Se completează numai valorile existente în Setări / Date firmă.</p>
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
          <span><code>{{legal_representative_cnp}}</code></span>
          <span><code>{{legal_representative_role}}</code></span>
          <span><code>{{legal_representative_ci_series}}</code></span>
          <span><code>{{legal_representative_ci_number}}</code></span>
          <span><code>{{legal_representative_ci_issued_by}}</code></span>
        </div>
        <p class="nx-field-hint">Pentru PDF-uri scanate sau documente imagine, folosește pagina OCR ca să extragi textul și să verifici câmpurile înainte de completare.</p>
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
        <div class="nx-shortcuts nx-template-links">${templatesHtml}</div>
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
          ${clientSelectHtml}
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
          ${isCompanyAdmin ? `<a class="nx-btn primary" href="/nexora/documents/client-files">Dosar Client</a>` : ""}
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
    user: options.user,
    currentPath: "/nexora/documents",
    isCompanyAdmin,
    eyebrow: "Documente",
    pageTitle: "Documente / DMS",
    body
  });
}

function renderOcrStatus(status = {}) {
  const pill = (active, label, detail = "") => `
    <div class="nx-settings-note">
      <b>${escapeHtml(label)}</b>
      <span class="nx-status-pill ${active ? "success" : "danger"}">${active ? "activ" : "inactiv"}</span>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
    </div>
  `;
  const languages = Array.isArray(status.tesseractLanguages) && status.tesseractLanguages.length
    ? status.tesseractLanguages.join(", ")
    : "fără limbi detectate";
  return `
    ${pill(status.pdftotextAvailable, "PDF text selectabil", "pdftotext")}
    ${pill(status.pdftoppmAvailable, "Conversie PDF scanat", "pdftoppm")}
    ${pill(status.tesseractAvailable, "OCR scanări", status.tesseractAvailable ? languages : "Tesseract neinstalat")}
  `;
}

function renderNexoraDocumentsOcrPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const isCompanyAdmin = Number(options.isCompanyAdmin || 0) === 1;
  const status = options.status || {};
  const result = options.result || null;
  const err = String(options.err || "");
  const ok = String(options.ok || "");
  const profile = options.profile || {};
  const errorMessages = {
    no_file: "Selectează un document pentru OCR.",
    unsupported_type: "OCR acceptă DOCX, PDF sau imagini PNG/JPG/WEBP/TIFF.",
    invalid_docx: "Fișierul DOCX nu poate fi citit.",
    invalid_pdf: "Fișierul PDF nu poate fi citit.",
    empty_text: "Nu am putut extrage text din document.",
    ocr_unavailable: "Motorul OCR pentru scanări nu este instalat pe server.",
    file_too_large: "Fișierul este prea mare pentru OCR.",
    storage_full: "Spațiul de stocare este insuficient.",
    upload: "Fișierul nu a putut fi încărcat.",
    processing: "OCR-ul nu a putut procesa documentul."
  };
  const alertHtml = err
    ? `<div class="nx-alert danger">${escapeHtml(errorMessages[err] || errorMessages.processing)}</div>`
    : ok
      ? `<div class="nx-alert success">Textul a fost extras.</div>`
      : "";
  const tesseractWarning = !status.tesseractAvailable
    ? `<div class="nx-alert warn">Pentru PDF-uri scanate și imagini trebuie instalat Tesseract OCR pe server. DOCX și PDF-urile cu text selectabil pot fi citite deja.</div>`
    : "";
  const methodLabels = {
    docx_text: "Text DOCX",
    pdf_text: "Text PDF selectabil",
    pdf_ocr: "OCR PDF scanat",
    image_ocr: "OCR imagine"
  };
  const profileItems = [
    ["Companie", profile.company_name],
    ["CUI", profile.company_cui],
    ["Adresă", profile.company_address],
    ["Reprezentant", profile.legal_representative],
    ["CNP", profile.legal_representative_cnp],
    ["CI", [profile.legal_representative_ci_series, profile.legal_representative_ci_number, profile.legal_representative_ci_issued_by].filter(Boolean).join(" / ")]
  ].map(([label, value]) => `
    <div class="nx-settings-note">
      <b>${escapeHtml(label)}</b>
      <span>${escapeHtml(value || "Necompletat")}</span>
    </div>
  `).join("");
  const suggestions = result && Array.isArray(result.suggestions) ? result.suggestions : [];
  const suggestionRows = suggestions.length
    ? suggestions.map((item) => `
      <tr>
        <td><b>${escapeHtml(item.label || "-")}</b><div class="nx-table-sub">${escapeHtml(item.reason || "")}</div></td>
        <td>${escapeHtml(item.value || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="2"><div class="nx-empty-state">Nu au fost detectate etichete clare pentru datele firmei.</div></td></tr>`;
  const warningsHtml = result?.warnings?.length
    ? `<div class="nx-alert warn">${result.warnings.map((warning) => escapeHtml(warning)).join("<br>")}</div>`
    : "";
  const resultHtml = result ? `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Rezultat OCR</h1>
          <p>${escapeHtml(result.fileName || "Document")} · ${escapeHtml(methodLabels[result.method] || result.method || "OCR")} · ${escapeHtml(result.textLength || 0)} caractere</p>
        </div>
        <a class="nx-btn" href="/nexora/documents/ocr">Curăță rezultat</a>
      </div>
      ${warningsHtml}
      <div class="nx-two-column-grid">
        <section class="nx-panel">
          <div class="nx-panel-head"><div><h2>Date detectate</h2><span>din profilul firmei</span></div></div>
          <div class="nx-table-wrap">
            <table class="nx-table">
              <thead><tr><th>Câmp</th><th>Valoare propusă</th></tr></thead>
              <tbody>${suggestionRows}</tbody>
            </table>
          </div>
        </section>
        <section class="nx-panel">
          <div class="nx-panel-head"><div><h2>Text extras</h2><span>previzualizare</span></div></div>
          <pre style="white-space:pre-wrap;max-height:420px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#fff;font-size:12px;line-height:1.5">${escapeHtml(result.text || "")}</pre>
        </section>
      </div>
    </section>
  ` : "";

  const body = `
    ${alertHtml}
    ${tesseractWarning}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>OCR documente</h1>
          <p>Extrage text din formulare și verifică automat datele firmei înainte de completare.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/documents">Completare automată</a>
          <a class="nx-btn" href="/nexora/settings?tab=company">Date firmă</a>
        </div>
      </div>
      <div class="nx-two-column-grid">
        <section class="nx-panel">
          <div class="nx-panel-head">
            <div><h2>Încarcă document</h2><span>DOCX, PDF sau imagine</span></div>
          </div>
          <form method="post" action="/nexora/documents/ocr" enctype="multipart/form-data" class="nx-form">
            <label class="nx-field">
              <span>Document</span>
              <input type="file" name="document" accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" required>
            </label>
            <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Rulează OCR</button></div>
          </form>
        </section>
        <section class="nx-panel">
          <div class="nx-panel-head">
            <div><h2>Motor OCR</h2><span>stare server</span></div>
          </div>
          <div class="nx-form">${renderOcrStatus(status)}</div>
        </section>
      </div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Date folosite la verificare</h1>
          <p>Valorile vin din Setări / Date firmă.</p>
        </div>
      </div>
      <div class="nx-form">${profileItems}</div>
    </section>
    ${resultHtml}
  `;

  return renderNexoraShell({
    title: "OCR documente",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/documents/ocr",
    isCompanyAdmin,
    eyebrow: "Documente / DMS",
    pageTitle: "OCR documente",
    body
  });
}

function renderNexoraDocumentsTemplatesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const isCompanyAdmin = Number(options.isCompanyAdmin || 0) === 1;
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Tipizate</h1>
          <p>Modele de documente generate direct în Nexora DMS, cu salvare în registrul de evidență.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/documents">Documente / DMS</a>
          <a class="nx-btn" href="/nexora/documents/register">Registru</a>
        </div>
      </div>
      <div class="nx-shortcuts nx-template-links">${renderTemplateCards()}</div>
    </section>
  `;

  return renderNexoraShell({
    title: "Tipizate DMS",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/documents/templates",
    isCompanyAdmin,
    eyebrow: "Documente / DMS",
    pageTitle: "Tipizate",
    body
  });
}

function renderNexoraDocumentTemplateFormPage(options = {}) {
  const templateKey = String(options.templateKey || "").trim();
  const template = TEMPLATE_DEFINITIONS[templateKey];
  if (!template) return "";

  const companyName = options.companyName || "Workspace";
  const isCompanyAdmin = Number(options.isCompanyAdmin || 0) === 1;
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const fieldsHtml = template.fields.map((field) => renderTemplateField(field, clients)).join("");
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(template.title)}</h1>
          <p>${escapeHtml(template.description)}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/documents/templates">Tipizate</a>
          <a class="nx-btn" href="/nexora/documents">DMS</a>
        </div>
      </div>
      <form method="post" action="${escapeHtml(template.action)}" class="nx-inline-form nx-register-form">
        ${fieldsHtml}
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Generează PDF</button>
        </div>
      </form>
    </section>
  `;

  return renderNexoraShell({
    title: template.title,
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/documents/templates",
    isCompanyAdmin,
    eyebrow: "Documente / DMS",
    pageTitle: template.title,
    body
  });
}

function renderNexoraClientDossiersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const q = options.q || "";
  const rowsHtml = rows.map((client) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/documents/client-files/${escapeHtml(client.id)}">${escapeHtml(client.name || "-")}</a><div class="nx-table-sub">${escapeHtml(client.cui || "-")}</div></td>
      <td>${escapeHtml(client.contracts_count || 0)}</td>
      <td>${escapeHtml(client.quotes_count || 0)}</td>
      <td>${escapeHtml(client.invoices_count || 0)}</td>
      <td>${escapeHtml(client.files_count || 0)}</td>
      <td><b>${escapeHtml(client.documents_count || 0)}</b></td>
      <td><a class="nx-btn primary" href="/nexora/documents/client-files/${escapeHtml(client.id)}">Deschide dosar</a></td>
    </tr>
  `).join("");
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Dosar Client</h1>
          <p>Arhiva documentelor pentru fiecare client: contracte, oferte, facturi, tipizate și fișiere importate.</p>
        </div>
        <a class="nx-btn" href="/nexora/documents">Documente / DMS</a>
      </div>
      <form class="nx-inline-form" method="get" action="/nexora/documents/client-files">
        <label class="nx-field"><span>Caută client</span><input name="q" value="${escapeHtml(q)}" placeholder="nume sau CUI"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Caută</button><a class="nx-btn" href="/nexora/documents/client-files">Reset</a></div>
      </form>
      <div class="nx-table-wrap" style="margin-top:18px">
        <table class="nx-table">
          <thead><tr><th>Client</th><th>Contracte</th><th>Oferte</th><th>Facturi</th><th>Fișiere</th><th>Total documente</th><th></th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7"><div class="nx-empty-state">Nu există clienți pentru căutarea curentă.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
  return renderNexoraShell({
    title: "Dosar Client",
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/documents/client-files",
    eyebrow: "Documente / DMS",
    pageTitle: "Dosar Client",
    isCompanyAdmin: true,
    body
  });
}

function renderNexoraClientDossierDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const client = options.client || {};
  const documents = Array.isArray(options.documents) ? options.documents : [];
  const ok = String(options.ok || "");
  const err = String(options.err || "");
  const groups = documents.reduce((result, document) => {
    const key = String(document.category || "ALTELE").toUpperCase();
    if (!result[key]) result[key] = [];
    result[key].push(document);
    return result;
  }, {});
  const categoryOrder = ["CONTRACTE", "OFERTE", "FACTURI", "E-FACTURA", "TIPIZATE", "FORMULARE", "PROIECTE", "CORESPONDENTA", "ALTELE"];
  const orderedCategories = [...categoryOrder.filter((key) => groups[key]), ...Object.keys(groups).filter((key) => !categoryOrder.includes(key))];
  const groupsHtml = orderedCategories.map((category) => `
    <section class="nx-panel" style="margin-top:18px">
      <div class="nx-panel-head"><div><h2>${escapeHtml(category)}</h2><span>${escapeHtml(groups[category].length)} documente</span></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Document</th><th>Tip</th><th>Dată</th><th></th></tr></thead>
          <tbody>${groups[category].map((document) => `
            <tr>
              <td><b>${escapeHtml(document.title || "-")}</b><div class="nx-table-sub">${escapeHtml(document.fileName || "")}</div></td>
              <td>${escapeHtml(document.kind || category)}</td>
              <td>${escapeHtml(document.createdAt || "-")}</td>
              <td class="nx-table-actions">${document.openHref ? `<a class="nx-btn" href="${escapeHtml(document.openHref)}">Detalii</a>` : ""}${document.downloadHref ? `<a class="nx-btn primary" href="${escapeHtml(document.downloadHref)}" target="_blank">Deschide</a>` : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `).join("");
  const body = `
    ${ok === "uploaded" ? `<div class="nx-alert success">Fișierul a fost adăugat în dosarul clientului.</div>` : ""}
    ${err ? `<div class="nx-alert danger">Fișierul nu a putut fi salvat în dosar.</div>` : ""}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>${escapeHtml(client.name || "Client")}</h1><p>CUI: ${escapeHtml(client.cui || "-")} · ${escapeHtml(client.address || "")}</p></div>
        <a class="nx-btn" href="/nexora/documents/client-files">Toate dosarele</a>
      </div>
      <div class="nx-two-column-grid">
        <section class="nx-panel">
          <div class="nx-panel-head"><div><h2>Adaugă document</h2><span>fișier arhivat la acest client</span></div></div>
          <form class="nx-form" method="post" action="/nexora/documents/client-files/${escapeHtml(client.id)}/upload" enctype="multipart/form-data">
            <label class="nx-field"><span>Titlu</span><input name="title" required placeholder="Contract semnat / corespondență"></label>
            <label class="nx-field"><span>Categorie</span><select name="category">
              ${["CONTRACTE", "OFERTE", "FACTURI", "TIPIZATE", "FORMULARE", "PROIECTE", "CORESPONDENTA", "ALTELE"].map((category) => `<option value="${category}">${category}</option>`).join("")}
            </select></label>
            <label class="nx-field"><span>Fișier</span><input type="file" name="file" required></label>
            <label class="nx-field"><span>Observații</span><textarea name="notes" rows="3"></textarea></label>
            <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Încarcă în dosar</button></div>
          </form>
        </section>
        <section class="nx-panel">
          <div class="nx-panel-head"><div><h2>Arhivă</h2><span>documente găsite automat</span></div></div>
          <div class="nx-kpi-value">${escapeHtml(documents.length)}</div>
          <p class="nx-field-hint">Sunt reunite documentele deja asociate clientului și încărcările făcute direct în dosar.</p>
        </section>
      </div>
    </section>
    ${groupsHtml || `<section class="nx-content-card"><div class="nx-empty-state">Acest client nu are documente asociate încă.</div></section>`}
  `;
  return renderNexoraShell({
    title: `Dosar ${client.name || "Client"}`,
    appName: "Nexora ERP",
    companyName,
    user: options.user,
    currentPath: "/nexora/documents/client-files",
    eyebrow: "Documente / DMS",
    pageTitle: "Dosar Client",
    isCompanyAdmin: true,
    body
  });
}

function renderNexoraDocumentsRegisterPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const summary = options.summary || {};
  const ok = options.ok || "";
  const isCompanyAdmin = Number(options.isCompanyAdmin || 0) === 1;

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
    user: options.user,
    currentPath: "/nexora/documents",
    isCompanyAdmin,
    eyebrow: "Documente / DMS",
    pageTitle: "Registru evidență",
    body
  });
}

export {
  renderNexoraDocumentTemplateFormPage,
  renderNexoraClientDossierDetailPage,
  renderNexoraClientDossiersPage,
  renderNexoraDocumentsPage,
  renderNexoraDocumentsOcrPage,
  renderNexoraDocumentsRegisterPage,
  renderNexoraDocumentsTemplatesPage
};
