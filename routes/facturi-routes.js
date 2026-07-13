import { renderNexoraInvoiceNewPage } from "../src/ui/nexora-invoice-new-page.js";
import { renderNexoraInvoiceDetailPage } from "../src/ui/nexora-invoice-detail-page.js";
import { renderNexoraInvoicesPage } from "../src/ui/nexora-invoices-page.js";
export function registerFacturiRoutes(app, deps) {
  const {
    COMPANY,
    Mustache,
    __dirname,
    crmShellEnd,
    crmShellStart,
    db,
    buildDraftInvoiceNumber,
    escapeHtml,
    ensureOfficialInvoiceNumber,
    ensureFacturaXmlGenerated,
    fetchAnafCompany,
    formatInvoiceDisplayNumber,
    fmt2,
    fmtMoney,
    fs,
    getInvoiceLogoDataUri,
    getInvoiceTheme,
    getSetting,
    anafCheckUploadStatus,
    anafDownloadMessage,
    anafUploadFactura,
    invoiceTemplateHtml,
    nextFacturaNumber,
    normalizeCui,
    path,
    recalcFacturaTotals,
    renderPdfBuffer,
    requireAuth,
    transporter
  } = deps;

  app.use((req, res, next) => {
    const currentPath = String(req.path || "");
    if (
      currentPath === "/facturi" ||
      currentPath.startsWith("/facturi/") ||
      currentPath.startsWith("/factura/") ||
      currentPath.startsWith("/nexora/facturi")
    ) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
    next();
  });

  function facturaDisplayNumber(invoice) {
    return formatInvoiceDisplayNumber(invoice);
  }

  function removeStoredFile(relativePath) {
    const normalized = String(relativePath || "").trim();
    if (!normalized) return;
    const absolutePath = path.join(__dirname, normalized);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }

  function finalizeFacturaNumber(facturaId, companyId, factura = null) {
    const currentFactura = factura || db.prepare(`
      SELECT id, an, pdf_path, efactura_xml_path, efactura_response_zip_path
      FROM facturi
      WHERE id=? AND company_id=?
    `).get(facturaId, companyId);

    if (!currentFactura) {
      throw new Error("Factura nu exista.");
    }

    const assignedNumber = ensureOfficialInvoiceNumber(db, facturaId, {
      year: Number(currentFactura.an || new Date().getFullYear()),
      companyId
    });

    if (!assignedNumber.changed) {
      return assignedNumber;
    }

    for (const storedFile of [
      currentFactura.pdf_path,
      currentFactura.efactura_xml_path,
      currentFactura.efactura_response_zip_path
    ]) {
      try {
        removeStoredFile(storedFile);
      } catch (fileError) {
        console.warn("[FACTURI] invoice artifact cleanup failed", {
          facturaId,
          storedFile,
          error: String(fileError?.message || fileError)
        });
      }
    }

    db.prepare(`
      UPDATE facturi
      SET pdf_path=NULL,
          efactura_xml_path=NULL,
          efactura_status=NULL,
          efactura_last_error=NULL,
          efactura_message_id=NULL,
          efactura_upload_index=NULL,
          efactura_download_id=NULL,
          efactura_response_zip_path=NULL,
          efactura_last_checked_at=NULL
      WHERE id=? AND company_id=?
    `).run(facturaId, companyId);

    return assignedNumber;
  }

  function sendEfacturaArchive(res, relativePath) {
    const normalized = String(relativePath || "").trim().replace(/^\/+/, "");
    if (!normalized) return res.status(404).send("Raspunsul SPV nu este disponibil.");

    const absolutePath = path.join(__dirname, normalized);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).send("Arhiva SPV lipseste de pe server.");
    }

    return res.download(absolutePath, path.basename(absolutePath));
  }

  function logAnafMessage({
    companyId,
    accountId = null,
    messageId = "",
    facturaId = null,
    direction = "OUT",
    status = "",
    payload = "",
    details = ""
  }) {
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedDirection = String(direction || "").trim().toUpperCase() || "OUT";
    const normalizedStatus = String(status || "").trim().toUpperCase();

    if (normalizedMessageId) {
      const existing = db.prepare(`
        SELECT id
        FROM anaf_messages
        WHERE company_id=?
          AND COALESCE(factura_id, 0)=COALESCE(?, 0)
          AND UPPER(COALESCE(direction,''))=?
          AND UPPER(COALESCE(status,''))=?
          AND COALESCE(message_id,'')=?
        ORDER BY id DESC
        LIMIT 1
      `).get(companyId, facturaId || null, normalizedDirection, normalizedStatus, normalizedMessageId);

      if (existing?.id) {
        db.prepare(`
          UPDATE anaf_messages
          SET payload=?,
              details=?
          WHERE id=?
        `).run(String(payload || ""), String(details || ""), existing.id);
        return existing.id;
      }
    }

    const inserted = db.prepare(`
      INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      accountId,
      normalizedMessageId,
      facturaId || null,
      normalizedDirection,
      normalizedStatus || String(status || ""),
      String(payload || ""),
      String(details || "")
    );

    return Number(inserted.lastInsertRowid || 0);
  }

  function facturaStatusBadgeModern(status) {
    const s = String(status || "").toUpperCase();
    if (s === "INCASATA") return `<span class="crm-badge crm-badge-green">INCASATA</span>`;
    if (s === "TRIMISA") return `<span class="crm-badge crm-badge-blue">TRIMISA</span>`;
    if (s === "TRIMIS_CLIENT") return `<span class="crm-badge crm-badge-green">TRIMIS CLIENT</span>`;
    if (s === "INTARZIATA") return `<span class="crm-badge crm-badge-red">INTARZIATA</span>`;
    if (s === "ANULATA") return `<span class="crm-badge crm-badge-neutral">ANULATA</span>`;
    if (s === "FACTURA_GENERATA") return `<span class="crm-badge crm-badge-blue">FACTURA GENERATA</span>`;
    if (s === "TRIMIS_EFACTURA") return `<span class="crm-badge crm-badge-green">TRIMIS E-FACTURA</span>`;
    if (s === "RECEPTIONATA_SPV") return `<span class="crm-badge crm-badge-green">RECEPTIONATA SPV</span>`;
    if (s === "RESPINSA_SPV") return `<span class="crm-badge crm-badge-red">RESPINSA SPV</span>`;
    return `<span class="crm-badge crm-badge-amber">CIORNA</span>`;
  }

  function efacturaStatusBadge(status) {
    const s = String(status || "").toUpperCase();
    if (!s) return `<span class="crm-badge crm-badge-neutral">NEINITIALIZAT</span>`;
    if (s === "DEMO_LOCAL") return `<span class="crm-badge crm-badge-blue">DEMO SIMULAT</span>`;
    if (s === "DEMO_CONFIRMAT") return `<span class="crm-badge crm-badge-green">DEMO CONFIRMAT</span>`;
    if (s === "TRIMIS") return `<span class="crm-badge crm-badge-blue">TRIMIS LA ANAF</span>`;
    if (s === "IN_PROCESARE") return `<span class="crm-badge crm-badge-amber">IN PROCESARE</span>`;
    if (s === "RASPUNS_DISPONIBIL") return `<span class="crm-badge crm-badge-blue">RASPUNS ANAF DISPONIBIL</span>`;
    if (s === "RECEPTIONATA_SPV") return `<span class="crm-badge crm-badge-green">CONFIRMATA SPV</span>`;
    if (s === "RESPINS_VALIDARE" || s === "RESPINSA_SPV") return `<span class="crm-badge crm-badge-red">RESPINSA DE ANAF</span>`;
    if (s === "EROARE_UPLOAD" || s === "EROARE") return `<span class="crm-badge crm-badge-red">EROARE ANAF</span>`;
    if (s === "FARA_CONEXIUNE") return `<span class="crm-badge crm-badge-red">NECONECTAT SPV</span>`;
    if (s === "GENERAT") return `<span class="crm-badge crm-badge-neutral">XML GENERAT</span>`;
    return `<span class="crm-badge crm-badge-neutral">${escapeHtml(status || "—")}</span>`;
  }

  function spvNeedsManualReauthorization(message) {
    const normalized = String(message || "").trim().toLowerCase();
    if (!normalized) return false;
    return normalized.includes("refresh token") ||
      normalized.includes("token anaf invalid") ||
      normalized.includes("access_denied") ||
      normalized.includes("conexiune anaf") ||
      normalized.includes("nu exista conexiune anaf") ||
      normalized.includes("autorizata pentru mediul selectat") ||
      normalized.includes("expirat");
  }

  function normalizeFacturaStatus(status) {
    return String(status || "").trim().toUpperCase();
  }

  function isDraftFacturaStatus(status) {
    const normalized = normalizeFacturaStatus(status);
    return normalized === "CIORNA" || normalized === "DRAFT";
  }

  function isCancelledFacturaStatus(status) {
    return normalizeFacturaStatus(status) === "ANULATA";
  }

  app.get("/efactura_responses/:fileName", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const fileName = path.basename(String(req.params.fileName || "").trim());
    if (!fileName) return res.status(400).send("Bad file name");

    const relativePath = `efactura_responses/${fileName}`;
    const factura = db.prepare(`
      SELECT id
      FROM facturi
      WHERE company_id=? AND efactura_response_zip_path=?
      LIMIT 1
    `).get(companyId, relativePath);

    if (!factura) return res.status(404).send("Arhiva SPV nu exista pentru aceasta companie.");
    return sendEfacturaArchive(res, relativePath);
  });

  app.get(["/factura/:id/efactura/raspuns", "/nexora/facturi/:id/efactura/raspuns"], requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const factura = db.prepare(`
      SELECT efactura_response_zip_path
      FROM facturi
      WHERE id=? AND company_id=?
    `).get(id, companyId);

    if (!factura) return res.status(404).send("Factura nu exista");
    return sendEfacturaArchive(res, factura.efactura_response_zip_path);
  });

  app.post("/factura/:id/linie", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const factura_id = Number(req.params.id);
    if (!Number.isFinite(factura_id)) return res.status(400).send("Bad id");

    const factura = db.prepare("SELECT status FROM facturi WHERE id=? AND company_id=?").get(factura_id, companyId);
    const lockedStatuses = new Set(["TRIMIS_EFACTURA", "RECEPTIONATA_SPV"]);
    if (factura && lockedStatuses.has(String(factura.status || "").toUpperCase())) {
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + factura_id + "?err=factura_blocata" : "/factura/" + factura_id + "?err=factura_blocata");
    }

    const denumire = String(req.body?.denumire || "").trim();
    const descriere = String(req.body?.descriere || "").trim();
    const cantitate = Number(String(req.body?.cantitate || "1").replace(",", "."));
    const unitate = String(req.body?.unitate || "").trim();
    const pret_unitar = Number(String(req.body?.pret_unitar || "0").replace(",", "."));

    if (!denumire) return res.status(400).send("Denumire required");
    if (!Number.isFinite(cantitate) || cantitate <= 0) return res.status(400).send("Cantitate invalida");
    if (!Number.isFinite(pret_unitar) || pret_unitar < 0) return res.status(400).send("Pret invalid");

    const lt = Math.round((cantitate * pret_unitar) * 100) / 100;
    const mx = db.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM facturi_linii WHERE factura_id=? AND company_id=?").get(factura_id, companyId);
    const sort_order = (mx?.m || 0) + 1;

    db.prepare(`
      INSERT INTO facturi_linii (factura_id, denumire, descriere, cantitate, unitate, pret_unitar, total_linie, sort_order, company_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(factura_id, denumire, descriere || null, cantitate, unitate || null, pret_unitar, lt, sort_order, companyId);

    recalcFacturaTotals(factura_id, companyId);
    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + factura_id : "/factura/" + factura_id);
  });

  app.post("/factura/:id/linie/:lid/sterge", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const factura_id = Number(req.params.id);
    const lid = Number(req.params.lid);
    if (!Number.isFinite(factura_id) || !Number.isFinite(lid)) return res.status(400).send("Bad id");

    const factura = db.prepare("SELECT status FROM facturi WHERE id=? AND company_id=?").get(factura_id, companyId);
    const lockedStatuses = new Set(["TRIMIS_EFACTURA", "RECEPTIONATA_SPV"]);
    if (factura && lockedStatuses.has(String(factura.status || "").toUpperCase())) {
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + factura_id + "?err=factura_blocata" : "/factura/" + factura_id + "?err=factura_blocata");
    }

    db.prepare("DELETE FROM facturi_linii WHERE id=? AND factura_id=? AND company_id=?").run(lid, factura_id, companyId);
    recalcFacturaTotals(factura_id, companyId);
    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + factura_id : "/factura/" + factura_id);
  });

  app.post("/factura/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const factura_id = Number(req.params.id);
    if (!Number.isFinite(factura_id)) return res.status(400).send("Bad id");

    const status = String(req.body?.status || "CIORNA").trim().toUpperCase();
    const allowed = new Set(["CIORNA", "TRIMISA", "INCASATA", "INTARZIATA", "ANULATA"]);
    if (!allowed.has(status)) return res.status(400).send("Status invalid");

    const factura = db.prepare("SELECT id FROM facturi WHERE id=? AND company_id=?").get(factura_id, companyId);
    if (!factura) return res.status(404).send("Factura nu exista");

    db.prepare("UPDATE facturi SET status=? WHERE id=? AND company_id=?").run(status, factura_id, companyId);
    if (status === "ANULATA") {
      return res.redirect("/facturi?view=anulate&ok=anulata");
    }

    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + factura_id + "?ok=status_factura_actualizat" : "/factura/" + factura_id + "?ok=status_factura_actualizat");
  });

  app.get("/nexora/facturi/new", requireAuth, (req, res) => {
    res.send(renderNexoraInvoiceNewPage({
      user: req.session.user
    }));
  });

  app.get("/nexora/facturi", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const view = String(req.query.view || "").trim().toLowerCase();
    const showCancelled = view === "anulate";
    const statusOperator = showCancelled ? "=" : "<>";

    const counters = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'ANULATA' THEN 1 ELSE 0 END), 0) AS cancelled_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) <> 'ANULATA' THEN 1 ELSE 0 END), 0) AS active_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('CIORNA', 'TRIMISA', 'INTARZIATA') THEN 1 ELSE 0 END), 0) AS pending_count
      FROM facturi
      WHERE company_id=?
    `).get(companyId) || {};

    const invoices = db.prepare(`
      SELECT f.id, f.factura_nr, f.an, f.seq, f.data_emitere, f.total, f.status,
             c.name AS client_name, c.cui AS client_cui
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE f.company_id=?
        AND UPPER(COALESCE(f.status,'')) ${statusOperator} 'ANULATA'
      ORDER BY f.id DESC
      LIMIT 300
    `).all(companyId).map((invoice) => ({
      ...invoice,
      display_number: facturaDisplayNumber(invoice)
    }));

    res.send(renderNexoraInvoicesPage({
      user: req.session.user,
      invoices,
      counters,
      showCancelled,
      ok: String(req.query.ok || ""),
      err: String(req.query.err || "")
    }));
  });

  app.get("/facturi", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const ok = String(req.query.ok || "");
    const err = String(req.query.err || "");
    const view = String(req.query.view || "").trim().toLowerCase();
    const showCancelled = view === "anulate";
    const statusOperator = showCancelled ? "=" : "<>";
    const counters = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'ANULATA' THEN 1 ELSE 0 END), 0) AS cancelled_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) <> 'ANULATA' THEN 1 ELSE 0 END), 0) AS active_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('CIORNA', 'TRIMISA', 'INTARZIATA') THEN 1 ELSE 0 END), 0) AS pending_count
      FROM facturi
      WHERE company_id=?
    `).get(companyId) || {};
    const facturi = db.prepare(`
      SELECT f.id, f.factura_nr, f.data_emitere, f.total, f.status,
             c.name AS client_name, c.cui AS client_cui
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE f.company_id=?
        AND UPPER(COALESCE(f.status,'')) ${statusOperator} 'ANULATA'
      ORDER BY f.id DESC
      LIMIT 300
    `).all(companyId);

    const userEmail = req.session.user.email;
    const listTitle = showCancelled ? "Facturi anulate" : "Lista facturi";
    const listDescription = showCancelled
      ? "Facturile marcate ca anulate sunt separate aici pentru o evidenta mai curata."
      : "Ultimele 300 de facturi active din sistem.";
    const emptyState = showCancelled ? "Nu exista facturi anulate" : "Nu exista facturi active";
    const rows = facturi.map((f) => `
      <tr>
        <td><a href="/factura/${f.id}">${escapeHtml(facturaDisplayNumber(f))}</a></td>
        <td>
          <div style="font-weight:800">${escapeHtml(f.client_name || "")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(f.client_cui || "")}</div>
        </td>
        <td>${escapeHtml(String(f.data_emitere || "").slice(0, 10))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(f.total))}</td>
        <td>${facturaStatusBadgeModern(f.status)}</td>
      </tr>`).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  .facturi-shell{
    display:grid;
    gap:12px;
  }
  .facturi-top-grid{
    margin-bottom:0;
    overflow:visible;
  }
  .facturi-card{
    padding:14px;
  }
  .facturi-card-sticky{
    position:sticky;
    top:16px;
    z-index:10;
  }
  .facturi-card-head,
  .facturi-list-head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    flex-wrap:wrap;
    margin-bottom:10px;
  }
  .facturi-card-title{
    margin:0;
    font-size:18px;
    line-height:1.12;
  }
  .facturi-card-copy{
    margin-top:4px;
    font-size:12px;
    line-height:1.45;
  }
  .facturi-summary-grid{
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:10px;
  }
  .facturi-summary-grid .crm-kpi{
    padding:10px;
    border-radius:12px;
  }
  .facturi-shell .crm-table th,
  .facturi-shell .crm-table td{
    padding:9px 10px;
  }
.factura-preview-box{
  display:none;
  margin-top:10px;
  padding:12px 14px;
  border:1px solid #dbeafe;
  background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);
  border-radius:14px;
}
.factura-preview-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px 12px;
  margin-top:8px;
}
.factura-preview-line{
  min-width:0;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(191,219,254,.55);
  background:rgba(255,255,255,.62);
}
.factura-preview-label{
  display:block;
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:#64748b;
  margin-bottom:3px;
}
.factura-preview-value{
  font-weight:700;
  font-size:13px;
  color:#0f172a;
  word-break:break-word;
}
.factura-preview-status{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
}
.factura-preview-chip{
  display:inline-flex;
  align-items:center;
  gap:6px;
  border-radius:999px;
  padding:5px 9px;
  font-size:11px;
  font-weight:700;
}
.factura-preview-chip.green{
  background:#dcfce7;
  color:#166534;
}
.factura-preview-chip.blue{
  background:#dbeafe;
  color:#1d4ed8;
}
.factura-preview-chip.amber{
  background:#fef3c7;
  color:#92400e;
}
.factura-preview-chip.red{
  background:#fee2e2;
  color:#991b1b;
}
.factura-preview-chip.neutral{
  background:#e5e7eb;
  color:#374151;
}
.factura-preview-hint{
  margin-top:8px;
  font-size:12px;
  color:#64748b;
}
.factura-client-search{
  position:relative;
}
.factura-client-results{
  display:none;
  position:absolute;
  top:calc(100% + 6px);
  left:0;
  right:0;
  z-index:40;
  border:1px solid #dbeafe;
  border-radius:12px;
  background:#ffffff;
  box-shadow:0 14px 28px rgba(15,23,42,.12);
  overflow:hidden;
}
.factura-client-result{
  width:100%;
  border:0;
  background:transparent;
  text-align:left;
  padding:10px 12px;
  cursor:pointer;
  border-bottom:1px solid #eef2ff;
}
.factura-client-result:last-child{
  border-bottom:0;
}
.factura-client-result:hover,
.factura-client-result:focus{
  background:#f8fbff;
  outline:none;
}
.factura-client-result-name{
  font-weight:800;
  font-size:13px;
  color:#0f172a;
}
.factura-client-result-meta{
  margin-top:3px;
  font-size:11px;
  color:#64748b;
}
.factura-client-empty{
  padding:10px 12px;
  font-size:12px;
  color:#64748b;
}
@media (max-width: 1100px){
  .facturi-summary-grid{
    grid-template-columns:1fr;
  }
}
@media (max-width: 900px){
  .factura-preview-grid{
    grid-template-columns:1fr;
  }
}
</style>
<meta charset="utf8">
<title>Facturi</title>
</head>

${crmShellStart("facturi", "Facturi", "Creare rapida de facturi si urmarirea statusului de incasare.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="facturi-shell">
  ${ok ? `<div class="crm-card" style="margin-bottom:0;border:1px solid #bbf7d0;background:#f0fdf4">
    <div style="font-weight:800;color:#166534;margin-bottom:6px">Operatiune reusita</div>
    <div class="crm-muted">${
      ok === "stearsa" ? "Factura ciorna a fost stearsa definitiv."
      : ok === "anulata" ? "Factura a fost mutata in lista separata de facturi anulate."
      : "Operatiunea a fost finalizata cu succes."
    }</div>
  </div>` : ``}

  ${err ? `<div class="crm-card" style="margin-bottom:0;border:1px solid #fecaca;background:#fef2f2">
    <div style="font-weight:800;color:#991b1b;margin-bottom:6px">Operatiune esuata</div>
    <div class="crm-muted">${escapeHtml(err)}</div>
  </div>` : ``}

  <div class="crm-grid-2 facturi-top-grid">
    <section class="crm-card facturi-card facturi-card-sticky">
      <div class="facturi-card-head">
        <div>
          <h3 class="facturi-card-title">Creeaza factura</h3>
          <div class="crm-muted facturi-card-copy">Introdu CUI-ul clientului si genereaza rapid o factura noua.</div>
        </div>
      </div>

      <form method="post" action="/facturi" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">CUI Client</label>
            <div class="factura-client-search">
              <input class="crm-input" id="factura-cui-input" name="cui" required placeholder="Ex: 47446760 sau denumirea clientului" autocomplete="off">
              <div class="factura-client-results" id="factura-client-results" aria-live="polite"></div>
            </div>
            <div class="crm-muted" style="margin-top:6px">Poți scrie și denumirea unui client deja salvat în MiniCRM.</div>
          </div>
          <div>
            <label class="crm-label">Scadenta</label>
            <input class="crm-input" name="scadenta" type="date">
          </div>
        </div>

        <div class="factura-preview-hint" id="factura-preview-hint">Introdu CUI-ul și în câteva momente verific automat datele firmei în ANAF.</div>
        <div class="crm-muted" id="factura-preview-error" style="display:none;color:#b91c1c;font-weight:700"></div>
        <div class="factura-preview-box" id="factura-preview-box" aria-live="polite">
          <div class="factura-preview-status">
            <div>
              <div style="font-weight:800;font-size:15px" id="factura-preview-name">—</div>
              <div class="crm-muted" style="margin-top:4px" id="factura-preview-cui">—</div>
            </div>
            <div class="factura-preview-chip blue" id="factura-preview-source">Verificare ANAF</div>
          </div>
          <div class="factura-preview-grid">
            <div class="factura-preview-line">
              <span class="factura-preview-label">Adresă</span>
              <span class="factura-preview-value" id="factura-preview-address">—</span>
            </div>
            <div class="factura-preview-line">
              <span class="factura-preview-label">Registrul Comerțului</span>
              <span class="factura-preview-value" id="factura-preview-regcom">—</span>
            </div>
            <div class="factura-preview-line">
              <span class="factura-preview-label">CAEN</span>
              <span class="factura-preview-value" id="factura-preview-caen">—</span>
            </div>
            <div class="factura-preview-line">
              <span class="factura-preview-label">Status</span>
              <span class="factura-preview-value" id="factura-preview-status">—</span>
            </div>
          </div>
        </div>

        <div>
          <label class="crm-label" style="display:flex;align-items:center;gap:10px;margin:0">
            <input type="checkbox" name="aplica_tva" value="1" checked style="width:auto">
            Aplic TVA
          </label>
        </div>

        <div>
          <button class="crm-btn" id="create-invoice-btn" type="submit">Creeaza factura</button>
        </div>
      </form>
    </section>

    <section class="crm-card facturi-card facturi-card-sticky">
      <div class="facturi-card-head">
        <div>
          <h3 class="facturi-card-title">Sumar</h3>
          <div class="crm-muted facturi-card-copy">Vedere rapida asupra facturilor generate.</div>
        </div>
      </div>

      <div class="crm-kpis facturi-summary-grid">
        <div class="crm-kpi">
          <div class="crm-kpi-label">Facturi active</div>
          <div class="crm-kpi-value">${escapeHtml(String(counters.active_count || 0))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Neincasate</div>
          <div class="crm-kpi-value">${escapeHtml(String(counters.pending_count || 0))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Facturi anulate</div>
          <div class="crm-kpi-value">${escapeHtml(String(counters.cancelled_count || 0))}</div>
        </div>
      </div>
    </section>
  </div>

  <section class="crm-card facturi-card">
    <div class="facturi-list-head">
      <div>
        <h3 class="facturi-card-title">${listTitle}</h3>
        <div class="crm-muted facturi-card-copy">${listDescription}</div>
      </div>
      <div class="crm-row" style="gap:8px;align-items:center">
        <a class="${showCancelled ? "crm-btn crm-btn-secondary" : "crm-btn"}" href="/facturi">Facturi active</a>
        <a class="${showCancelled ? "crm-btn" : "crm-btn crm-btn-secondary"}" href="/facturi?view=anulate">Facturi anulate</a>
      </div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Factura</th>
            <th>Client</th>
            <th>Data</th>
            <th class="crm-right">Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5"><i>${emptyState}</i></td></tr>`}
        </tbody>
      </table>
    </div>
  </section>
  </div>

  <script>
    (() => {
      const input = document.getElementById("factura-cui-input");
      const submitBtn = document.getElementById("create-invoice-btn");
      const hint = document.getElementById("factura-preview-hint");
      const err = document.getElementById("factura-preview-error");
      const box = document.getElementById("factura-preview-box");
      const source = document.getElementById("factura-preview-source");
      const resultsBox = document.getElementById("factura-client-results");
      const fields = {
        name: document.getElementById("factura-preview-name"),
        cui: document.getElementById("factura-preview-cui"),
        address: document.getElementById("factura-preview-address"),
        regCom: document.getElementById("factura-preview-regcom"),
        caen: document.getElementById("factura-preview-caen"),
        status: document.getElementById("factura-preview-status")
      };

      let debounceTimer = null;
      let suggestionTimer = null;
      let activeController = null;
      let activeSuggestionController = null;
      let activeLookupId = 0;
      let activeSuggestionLookupId = 0;

      function isCuiLike(value) {
        const raw = String(value || "").trim();
        if (!raw) return false;
        const withoutPrefix = raw.replace(/^RO/i, "");
        return !/[A-Za-z]/.test(withoutPrefix);
      }

      function setChip(variant, text) {
        source.className = "factura-preview-chip " + variant;
        source.textContent = text;
      }

      function setFieldValue(key, value) {
        const el = fields[key];
        if (!el) return;
        el.textContent = value || "—";
      }

      function resetPreview() {
        box.style.display = "none";
        err.style.display = "none";
        err.textContent = "";
        setFieldValue("name", "—");
        setFieldValue("cui", "—");
        setFieldValue("address", "—");
        setFieldValue("regCom", "—");
        setFieldValue("caen", "—");
        setFieldValue("status", "—");
        setChip("blue", "Verificare ANAF");
      }

      function hideSuggestions() {
        if (!resultsBox) return;
        resultsBox.style.display = "none";
        resultsBox.innerHTML = "";
      }

      function renderLocalPreview(client) {
        const vatLabel = Number(client?.vat) ? "Plătitor TVA" : "Neplătitor TVA";
        const activeLabel = Number(client?.inactive) ? "Inactiv fiscal" : "Activ fiscal";
        err.style.display = "none";
        box.style.display = "block";
        box.style.borderColor = "#bfdbfe";
        box.style.background = "linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%)";
        setChip("blue", "Client MiniCRM");
        setFieldValue("name", client?.name || "—");
        setFieldValue("cui", client?.cui || "—");
        setFieldValue("address", client?.address || "—");
        setFieldValue("regCom", client?.reg_com || "—");
        setFieldValue("caen", client?.caen || "—");
        setFieldValue("status", activeLabel + " • " + vatLabel + " • Client existent în MiniCRM");
        hint.textContent = "Client selectat din MiniCRM. Poți apăsa acum pe „Creează factura”.";
        submitBtn.disabled = false;
      }

      function applyLocalClient(client) {
        input.value = client?.cui || "";
        hideSuggestions();
        clearTimeout(debounceTimer);
        if (activeController) activeController.abort();
        renderLocalPreview(client);
      }

      function renderSuggestions(clients, query) {
        const escapeClientText = (value) => String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

        if (!resultsBox) return;
        if (!clients.length) {
          resultsBox.innerHTML = '<div class="factura-client-empty">Nu există client salvat în MiniCRM pentru „' + escapeClientText(query) + '”.</div>';
          resultsBox.style.display = "block";
          return;
        }

        resultsBox.innerHTML = clients.map((client, index) => {
          const safeName = escapeClientText(client.name || "");
          const safeCui = escapeClientText(client.cui || "fără CUI");
          const safeAddress = client.address ? " • " + escapeClientText(client.address) : "";
          return [
            '<button class="factura-client-result" type="button" data-index="', String(index), '">',
            '<div class="factura-client-result-name">', safeName, '</div>',
            '<div class="factura-client-result-meta">', safeCui, safeAddress, '</div>',
            '</button>'
          ].join("");
        }).join("");

        resultsBox.style.display = "block";
        Array.from(resultsBox.querySelectorAll("[data-index]")).forEach((button) => {
          button.addEventListener("mousedown", (event) => event.preventDefault());
          button.addEventListener("click", () => {
            const client = clients[Number(button.getAttribute("data-index"))];
            if (client) applyLocalClient(client);
          });
        });
      }

      async function runLocalSearch(query) {
        const rawQuery = String(query || "").trim();
        if (isCuiLike(rawQuery) || rawQuery.length < 2) {
          hideSuggestions();
          return;
        }

        if (activeSuggestionController) activeSuggestionController.abort();
        activeSuggestionController = new AbortController();
        const lookupId = ++activeSuggestionLookupId;

        try {
          const response = await fetch("/clients/search?q=" + encodeURIComponent(rawQuery), {
            headers: { "Accept": "application/json" },
            signal: activeSuggestionController.signal
          });
          const data = await response.json().catch(() => ({}));
          if (lookupId !== activeSuggestionLookupId) return;
          renderSuggestions(Array.isArray(data.clients) ? data.clients : [], rawQuery);
        } catch (searchError) {
          if (searchError?.name === "AbortError") return;
          hideSuggestions();
        }
      }

      async function updateExistingClientStatus(cui) {
        try {
          const existsRes = await fetch("/clients/check-exists?cui=" + encodeURIComponent(cui), {
            headers: { "Accept": "application/json" }
          });
          const existsData = await existsRes.json().catch(() => ({}));
          if (existsData.exists) {
            return "Client existent în MiniCRM";
          }
        } catch {}
        return "Client nou în MiniCRM";
      }

      async function runLookup(force = false) {
        const rawCui = String(input.value || "").trim();
        const normalizedLength = rawCui.replace(/[^0-9A-Za-z]/g, "").length;

        if (!rawCui) {
          hideSuggestions();
          resetPreview();
          hint.textContent = "Introdu CUI-ul și în câteva momente verific automat datele firmei în ANAF.";
          submitBtn.disabled = false;
          return;
        }

        if (!isCuiLike(rawCui)) {
          if (activeController) activeController.abort();
          resetPreview();
          hint.textContent = "Caută clientul după denumire în lista MiniCRM și selectează-l din sugestii.";
          submitBtn.disabled = false;
          return;
        }

        if (!force && normalizedLength < 4) {
          resetPreview();
          hint.textContent = "Continuă să introduci CUI-ul pentru a porni verificarea automată.";
          submitBtn.disabled = false;
          return;
        }

        if (activeController) activeController.abort();
        activeController = new AbortController();
        const lookupId = ++activeLookupId;

        err.style.display = "none";
        box.style.display = "block";
        hint.textContent = "Interoghez ANAF și pregătesc datele clientului pentru factură.";
        setChip("amber", "Se caută în ANAF...");
        setFieldValue("name", "Se caută...");
        setFieldValue("cui", rawCui);
        setFieldValue("address", "—");
        setFieldValue("regCom", "—");
        setFieldValue("caen", "—");
        setFieldValue("status", "—");
        submitBtn.disabled = true;

        try {
          const response = await fetch("/api/company?cui=" + encodeURIComponent(rawCui), {
            headers: { "Accept": "application/json" },
            signal: activeController.signal
          });
          const data = await response.json().catch(() => ({}));
          if (lookupId !== activeLookupId) return;

          if (!response.ok || data.error) {
            throw new Error(data.details || data.error || "Nu am găsit acest CUI în ANAF.");
          }

          const normalizedCui = data.normalized_cui || rawCui;
          const clientPresence = await updateExistingClientStatus(normalizedCui);
          if (lookupId !== activeLookupId) return;

          input.value = normalizedCui;
          setFieldValue("name", data.legal_name || data.name || "—");
          setFieldValue("cui", normalizedCui);
          setFieldValue("address", data.address || "—");
          setFieldValue("regCom", data.reg_com || "—");
          setFieldValue("caen", data.caen || "—");

          const vatLabel = Number(data.vat) ? "Plătitor TVA" : "Neplătitor TVA";
          const activeLabel = Number(data.inactive) ? "Inactiv fiscal" : "Activ fiscal";
          setFieldValue("status", activeLabel + " • " + vatLabel + " • " + clientPresence);

          box.style.display = "block";
          box.style.borderColor = Number(data.inactive) ? "#fecaca" : "#bfdbfe";
          box.style.background = Number(data.inactive)
            ? "linear-gradient(180deg,#fff7f7 0%,#fef2f2 100%)"
            : "linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%)";
          setChip(Number(data.inactive) ? "red" : "green", Number(data.inactive) ? "Companie inactivă" : "Companie validată");
          hint.textContent = "Datele firmei au fost preluate. Poți apăsa acum pe „Creează factura”.";
          submitBtn.disabled = false;
        } catch (lookupError) {
          if (lookupError?.name === "AbortError") return;
          resetPreview();
          err.textContent = String(lookupError?.message || lookupError);
          err.style.display = "block";
          hint.textContent = "Nu am putut prelua acum datele din ANAF. Poți corecta CUI-ul sau continua dacă vrei să lași sistemul să încerce din nou la creare.";
          submitBtn.disabled = false;
        }
      }

      input?.addEventListener("input", () => {
        clearTimeout(suggestionTimer);
        suggestionTimer = setTimeout(() => runLocalSearch(input.value), 180);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runLookup(false), 500);
      });

      input?.addEventListener("blur", () => {
        clearTimeout(debounceTimer);
        runLookup(true);
      });

      document.addEventListener("click", (event) => {
        if (!resultsBox) return;
        if (event.target === input || resultsBox.contains(event.target)) return;
        hideSuggestions();
      });
    })();
  </script>

${crmShellEnd()}
</html>`);
  });

  app.post("/facturi", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rawClientInput = String(req.body.cui || "").trim();
    let cui = normalizeCui(rawClientInput);
    const scadenta = req.body.scadenta || null;
    const aplica_tva = String(req.body?.aplica_tva || "") === "1";

    let client = null;
    if (!cui && rawClientInput) {
      client = db.prepare(`
        SELECT id, vat, cui
        FROM clients
        WHERE company_id=? AND LOWER(TRIM(name)) = LOWER(TRIM(?))
        ORDER BY id DESC
        LIMIT 1
      `).get(companyId, rawClientInput);
      cui = String(client?.cui || "");
    }

    if (!cui) return res.status(400).send("CUI sau denumire client required");

    let anaf = null;
    try {
      anaf = await fetchAnafCompany(cui);
    } catch (e) {
      console.warn("ANAF client refresh failed:", String(e?.message ?? e));
    }

    client = client || db.prepare("SELECT id, vat FROM clients WHERE cui=? AND company_id=?").get(cui, companyId);
    if (!client) {
      if (anaf) {
        db.prepare(`
          INSERT INTO clients (cui,name,address,reg_com,caen,vat,inactive,company_id)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(anaf.cui, anaf.name || ("Client " + cui), anaf.address || null, anaf.reg_com || null, anaf.caen || null, anaf.vat || 0, anaf.inactive || 0, companyId);
      } else {
        db.prepare("INSERT INTO clients (cui,name,vat,inactive,company_id) VALUES (?,?,0,0,?)").run(cui, "Client " + cui, companyId);
      }
      client = db.prepare("SELECT id, vat FROM clients WHERE cui=? AND company_id=?").get(cui, companyId);
    } else if (anaf) {
      db.prepare(`
        UPDATE clients
        SET name=?, address=?, reg_com=?, caen=?, vat=?, inactive=?
        WHERE cui=? AND company_id=?
      `).run(anaf.name || ("Client " + cui), anaf.address || null, anaf.reg_com || null, anaf.caen || null, anaf.vat || 0, anaf.inactive || 0, cui, companyId);
      client = db.prepare("SELECT id, vat FROM clients WHERE cui=? AND company_id=?").get(cui, companyId);
    }

    const client_id = client?.id;
    if (!client_id) return res.status(400).send("Client negasit/creat");

    const defaultRate = Number(process.env.VAT_RATE_DEFAULT || "0.19");
    const tva_procent = aplica_tva ? defaultRate : 0;
    const currentYear = new Date().getFullYear();
    const temporaryNumber = `PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const r = db.prepare(`
      INSERT INTO facturi
      (factura_nr, an, seq, client_id, scadenta, tva_procent, company_id)
      VALUES (?,?,?,?,?,?,?)
    `).run(temporaryNumber, currentYear, 0, client_id, scadenta, tva_procent, companyId);

    const facturaId = Number(r.lastInsertRowid);
    db.prepare(`
      UPDATE facturi
      SET factura_nr=?
      WHERE id=? AND company_id=?
    `).run(buildDraftInvoiceNumber(facturaId), facturaId, companyId);

    if (req.body?.return_to === "nexora") {
      return res.redirect("/nexora/facturi/" + facturaId);
    }

    res.redirect("/factura/" + facturaId);
  });

  app.post("/factura/:id/sterge", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const factura_id = Number(req.params.id);
    if (!Number.isFinite(factura_id)) return res.status(400).send("Bad id");

    const factura = db.prepare(`
      SELECT id, status, pdf_path, efactura_xml_path, efactura_response_zip_path
      FROM facturi
      WHERE id=? AND company_id=?
    `).get(factura_id, companyId);

    if (!factura) return res.status(404).send("Factura nu exista");
    if (!isDraftFacturaStatus(factura.status)) {
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + factura_id + "?err=stergere_permisa_doar_ciorna" : "/factura/" + factura_id + "?err=stergere_permisa_doar_ciorna");
    }

    for (const storedFile of [factura.pdf_path, factura.efactura_xml_path, factura.efactura_response_zip_path]) {
      try {
        removeStoredFile(storedFile);
      } catch (fileError) {
        console.warn("[FACTURI] invoice file cleanup failed", {
          facturaId: factura_id,
          storedFile,
          error: String(fileError?.message || fileError)
        });
      }
    }

    db.transaction(() => {
      db.prepare("UPDATE billing_payments SET generated_factura_id=NULL WHERE generated_factura_id=? AND company_id=?").run(factura_id, companyId);
      db.prepare("DELETE FROM anaf_messages WHERE factura_id=? AND company_id=?").run(factura_id, companyId);
      db.prepare("DELETE FROM facturi_linii WHERE factura_id=? AND company_id=?").run(factura_id, companyId);
      db.prepare("DELETE FROM facturi WHERE id=? AND company_id=?").run(factura_id, companyId);
    })();

    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi?ok=stearsa" : "/facturi?ok=stearsa");
  });

  app.get("/nexora/facturi/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    const ok = String(req.query.ok || "");
    const err = String(req.query.err || "");
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const f = db.prepare(`
      SELECT f.*, c.name AS client
      FROM facturi f
      JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
      WHERE f.id=? AND f.company_id=?
    `).get(id, companyId);

    if (!f) return res.status(404).send("Factura nu exista");

    const clientEmail = db.prepare(`
      SELECT email
      FROM contacts
      WHERE client_id=? AND company_id=? AND email IS NOT NULL AND TRIM(email) <> ''
      ORDER BY is_primary DESC, id ASC
      LIMIT 1
    `).get(f.client_id, companyId)?.email || "";

    const linii = db.prepare(`
      SELECT id, denumire, descriere, cantitate, unitate, pret_unitar, total_linie
      FROM facturi_linii
      WHERE factura_id=? AND company_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(id, companyId);

    const totals = recalcFacturaTotals(id, companyId);
    const displayNumber = facturaDisplayNumber(f);

    res.send(renderNexoraInvoiceDetailPage({
      user: req.session.user,
      invoice: f,
      lines: linii,
      totals,
      displayNumber,
      clientEmail,
      ok,
      err
    }));
  });

  app.get("/factura/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    const ok = String(req.query.ok || "");
    const err = String(req.query.err || "");
    const reauth = String(req.query.reauth || "");

    const f = db.prepare(`
      SELECT f.*, c.name AS client
      FROM facturi f
      JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
      WHERE f.id=? AND f.company_id=?
    `).get(id, companyId);

    if (!f) return res.status(404).send("Factura nu exista");

    const clientEmail = db.prepare(`
      SELECT email
      FROM contacts
      WHERE client_id=? AND company_id=? AND email IS NOT NULL AND TRIM(email) <> ''
      ORDER BY is_primary DESC, id ASC
      LIMIT 1
    `).get(f.client_id, companyId)?.email || "";

    const linii = db.prepare(`
      SELECT id, denumire, descriere, cantitate, unitate, pret_unitar, total_linie
      FROM facturi_linii
      WHERE factura_id=? AND company_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(id, companyId);

    const totals = recalcFacturaTotals(id, companyId);
    const displayFacturaNumber = facturaDisplayNumber(f);
    const products = db.prepare(`
      SELECT id, code, name, unit, price, tva_percent, kind
      FROM products
      WHERE active=1 AND company_id=?
      ORDER BY name COLLATE NOCASE ASC, id DESC
      LIMIT 500
    `).all(companyId);
    const isDraftFactura = isDraftFacturaStatus(f.status);
    const isCancelledFactura = isCancelledFacturaStatus(f.status);
    const facturiBackLink = isCancelledFactura ? "/facturi?view=anulate" : "/facturi";
    const pdfActionLabel = isDraftFactura ? "Emite factura si genereaza PDF" : "Regenereaza PDF";
    const isDemoCompany = Number(req.session.user?.company_is_demo || 0) === 1;
    const canAccessSettings = Array.isArray(req.session.user?.module_permissions) &&
      (req.session.user.module_permissions.includes("settings") || req.session.user.module_permissions.includes("setari"));
    const canManageSpvReauth = Boolean(Number(req.session.user?.is_super_admin || 0)) ||
      String(req.session.user?.role || "").trim().toLowerCase() === "accounting";
    const spvNeedsReauthorization = !isDemoCompany && (reauth === "needed" || spvNeedsManualReauthorization(f.efactura_last_error));
    const spvReauthBanner = spvNeedsReauthorization
      ? `<div class="crm-card" style="margin-bottom:18px;border:1px solid #fcd34d;background:#fffbeb">
          <div style="font-weight:800;color:#92400e;margin-bottom:6px">Reautorizare SPV necesară</div>
          <div class="crm-muted">${canManageSpvReauth
            ? "Conexiunea ANAF pentru această firmă trebuie refăcută. Deschide Status ANAF și generează un cod / link pentru contabil sau reconectează direct în browserul curent."
            : "Conexiunea ANAF pentru această firmă trebuie refăcută. Roagă un utilizator cu rol contabil sau super admin să reautorizeze SPV pentru companie."}</div>
          ${canManageSpvReauth
            ? `<div class="crm-row" style="margin-top:12px">
                <a class="crm-btn" href="/anaf/status?reauth=needed">Status ANAF</a>
              </div>`
            : ``}
        </div>`
      : "";
    const demoEfacturaBanner = isDemoCompany
      ? `<div class="crm-card" style="margin-bottom:18px;border:1px solid #bfdbfe;background:#eff6ff">
          <div style="font-weight:800;color:#1d4ed8;margin-bottom:6px">Mod demo pentru e-Factura</div>
          <div class="crm-muted">XML-ul si statusurile pot fi parcurse pentru prezentare, dar aplicatia nu trimite nimic catre SPV si nu foloseste conexiuni ANAF reale pe acest workspace demo.</div>
        </div>`
      : "";
    const efacturaActionLabel = isDemoCompany ? "Simuleaza trimiterea e-Factura" : "Trimite e-Factura";
    const efacturaCheckLabel = isDemoCompany ? "Simuleaza confirmarea" : "Verifica status SPV";

    const productOptions = (products || []).map((p) => `
      <option
        value="${p.id}"
        data-name="${escapeHtml(p.name || "")}"
        data-unit="${escapeHtml(p.unit || "")}"
        data-price="${escapeHtml(String(p.price ?? 0))}"
        data-code="${escapeHtml(p.code || "")}"
      >${escapeHtml((p.code ? "[" + p.code + "] " : "") + (p.name || ""))}</option>
    `).join("");

    const liniiRows = (linii || []).map((l) => `
      <tr>
        <td>
          <div>${escapeHtml(l.denumire || "")}</div>
          ${l.descriere ? `<div class="crm-muted" style="margin-top:4px">${escapeHtml(l.descriere)}</div>` : ``}
        </td>
        <td class="crm-right">${escapeHtml(String(l.cantitate ?? ""))}</td>
        <td>${escapeHtml(l.unitate || "")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(l.pret_unitar))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(l.total_linie))}</td>
        <td class="crm-right">
          <form method="post" action="/factura/${id}/linie/${l.id}/sterge" style="margin:0">
            <button class="crm-btn crm-btn-danger" type="submit">Sterge</button>
          </form>
        </td>
      </tr>`).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf8">
<title>${escapeHtml(displayFacturaNumber)}</title>
</head>

${crmShellStart("facturi", `Factura ${displayFacturaNumber}`, "Administrare linii, totaluri si generare PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  ${ok ? `<div class="crm-card" style="margin-bottom:18px;border:1px solid #bbf7d0;background:#f0fdf4">
    <div style="font-weight:800;color:#166534;margin-bottom:6px">Operatiune reusita</div>
    <div class="crm-muted">${
      ok === "xml_generat" ? "XML-ul e-Factura a fost generat cu succes."
      : ok === "trimis_anaf" ? "Factura a fost transmisa catre ANAF si a primit index de incarcare."
      : ok === "trimis_demo" ? "Fluxul e-Factura a fost simulat local. Nu s-a trimis nimic catre SPV."
      : ok === "stare_actualizata" ? "Statusul ANAF a fost actualizat."
      : ok === "stare_actualizata_cu_zip" ? "Raspunsul ANAF a fost descarcat si atasat facturii."
      : ok === "stare_respinsa_anaf" ? "ANAF a respins factura la validare. Raspunsul oficial a fost descarcat."
      : ok === "stare_demo" ? "Confirmarea e-Factura a fost simulata local pentru demo."
      : ok === "status_factura_actualizat" ? "Statusul facturii a fost actualizat."
      : ok === "trimis_local" ? "Factura a fost marcata ca pregatita pentru trimitere catre ANAF."
      : ok === "anulata" ? "Factura a fost anulata."
      : "Operatiunea a fost finalizata cu succes."
    }</div>
  </div>` : ``}

  ${err ? `<div class="crm-card" style="margin-bottom:18px;border:1px solid #fecaca;background:#fef2f2">
    <div style="font-weight:800;color:#991b1b;margin-bottom:6px">Operatiune esuata</div>
    <div class="crm-muted">${
      err === "nu_exista_xml" ? "Nu exista XML generat pentru aceasta factura."
      : err === "xml_lipsa_pe_server" ? "Fisierul XML lipseste de pe server."
      : err === "factura_blocata" ? "Factura nu poate fi modificata, este deja trimisa in e-Factura."
      : err === "fara_conexiune_anaf" ? "Nu exista o conexiune ANAF activa. Conecteaza mai intai contul SPV."
      : err === "fara_index_incarcare" ? "Factura nu are index de incarcare ANAF. Trimite-o mai intai."
      : err === "pdf_neconfigurat" ? "Motorul PDF nu este instalat complet pe server. Incearca din nou in cateva secunde."
      : err === "pdf_generare" ? "PDF-ul nu a putut fi generat. Verifica datele facturii si incearca din nou."
      : err === "stergere_permisa_doar_ciorna" ? "Factura poate fi stearsa definitiv doar cat timp este in ciorna."
      : err === "eroare_anaf" ? escapeHtml(String(f.efactura_last_error || "ANAF a returnat o eroare."))
      : "A aparut o eroare la procesarea e-Factura."
    }</div>
  </div>` : ``}

  ${demoEfacturaBanner}
  ${spvReauthBanner}

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 10px 0;font-size:20px">Detalii factura</h3>
          <div class="crm-muted">Informatii principale despre document.</div>
        </div>
        <div>${facturaStatusBadgeModern(f.status)}</div>
      </div>

      <div class="crm-stack" style="margin-top:16px;gap:10px">
        <div><b>Client:</b> ${escapeHtml(f.client || "")}</div>
        <div><b>Data emitere:</b> ${escapeHtml(String(f.data_emitere || "").slice(0,10))}</div>
        <div><b>Scadenta:</b> ${escapeHtml(String(f.scadenta || "").slice(0,10)) || `<span class="crm-muted">-</span>`}</div>
        <div><b>Total:</b> ${escapeHtml(fmtMoney(f.total))}</div>
        <div><b>Status e-Factura:</b> ${efacturaStatusBadge(f.efactura_status)}</div>
        <div><b>Index incarcare:</b> ${escapeHtml(f.efactura_upload_index || f.efactura_message_id || "—")}</div>
        <div><b>ID descarcare:</b> ${escapeHtml(f.efactura_download_id || "—")}</div>
        <div><b>Ultima verificare:</b> ${escapeHtml(f.efactura_last_checked_at || "—")}</div>
        <div><b>Ultima eroare:</b> ${escapeHtml(f.efactura_last_error || "—")}</div>
        ${f.efactura_response_zip_path
          ? `<div><b>Raspuns SPV:</b> <a href="/factura/${id}/efactura/raspuns" target="_blank" rel="noopener noreferrer">Descarca arhiva ANAF</a></div>`
          : ``}
      </div>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Actiuni document</h3>
        <div class="crm-muted" style="margin-top:6px">${isDemoCompany ? "Flux demo: simulezi e-Factura, generezi PDF si vezi traseul complet fara conexiune reala la SPV." : "Flux recomandat: Trimite e-Factura, genereaza PDF si trimite clientului documentul final."}</div>
      </div>

      <div class="crm-stack" style="gap:10px">
        <form method="post" action="/factura/${id}/efactura/trimite" style="margin:0">
          <button class="crm-btn" type="submit">${efacturaActionLabel}</button>
        </form>

        <form method="post" action="/factura/${id}/genereaza-pdf" style="margin:0">
          <button class="crm-btn crm-btn-secondary" type="submit">${pdfActionLabel}</button>
        </form>

        <a href="/factura/${id}/preview-pdf2" target="_blank" class="crm-btn crm-btn-secondary" style="text-decoration:none">
          Deschide preview
        </a>

        ${clientEmail
          ? `<form method="post" action="/factura/${id}/trimite-client" style="margin:0">
              <button class="crm-btn crm-btn-secondary" type="submit">Trimite email clientului</button>
            </form>`
          : `<a href="/client/${f.client_id}" class="crm-btn crm-btn-secondary" style="text-decoration:none">Adauga email client</a>`}

        ${isDraftFactura
          ? `<form method="post" action="/factura/${id}/sterge" style="margin:0" onsubmit="return confirm('Esti sigur ca vrei sa stergi definitiv aceasta factura ciorna?');">
              <button class="crm-btn crm-btn-danger" type="submit">Sterge factura</button>
            </form>`
          : !isCancelledFactura
            ? `<form method="post" action="/factura/${id}/status" style="margin:0" onsubmit="return confirm('Esti sigur ca vrei sa anulezi factura?');">
                <input type="hidden" name="status" value="ANULATA">
                <button class="crm-btn crm-btn-danger" type="submit">Anuleaza factura</button>
              </form>`
            : `<a href="/facturi?view=anulate" class="crm-btn crm-btn-secondary" style="text-decoration:none">Facturi anulate</a>`}

        ${f.pdf_path
          ? `<a href="/${encodeURI(f.pdf_path)}" target="_blank" class="crm-btn crm-btn-secondary" style="text-decoration:none">Deschide PDF</a>`
          : `<span class="crm-muted">Fara PDF generat inca</span>`}
      </div>

      <div class="crm-muted" style="margin-top:12px">
        ${isDraftFactura
          ? "Factura este in ciorna, deci poate fi stearsa definitiv."
          : isCancelledFactura
            ? "Factura este anulata si apare in lista separata de facturi anulate."
            : "Stergerea definitiva este disponibila doar cat timp factura ramane in ciorna."}
      </div>

      <div style="margin-top:16px;padding:14px 16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc">
        <div style="font-weight:800;margin-bottom:6px">Flux recomandat</div>
        <div class="crm-muted">1. Verifici preview-ul de mai jos · 2. Generezi PDF · 3. Trimiti e-Factura · 4. Verifici statusul SPV pana apare confirmarea · 5. Trimiti email clientului.</div>
      </div>
    </section>
  </div>

  <section class="crm-card" style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">Linii factura</h3>
        <div class="crm-muted" style="margin-top:6px">Produse si servicii adaugate pe document.</div>
      </div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Denumire</th>
            <th class="crm-right">Cant</th>
            <th>UM</th>
            <th class="crm-right">Pret</th>
            <th class="crm-right">Total</th>
            <th class="crm-right">Actiuni</th>
          </tr>
        </thead>
        <tbody>
          ${liniiRows || `<tr><td colspan="6"><i>Nu exista linii</i></td></tr>`}
        </tbody>
      </table>
    </div>

    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <div class="crm-card" style="padding:0;min-width:340px;max-width:420px;width:100%">
        <table class="crm-table">
          <tbody>
            <tr>
              <th style="width:60%">Subtotal</th>
              <td class="crm-right">${escapeHtml(fmtMoney(totals.subtotal))}</td>
            </tr>
            <tr>
              <th>TVA (${escapeHtml(String(Math.round(totals.tva_procent * 100))) }%)</th>
              <td class="crm-right">${escapeHtml(fmtMoney(totals.tva_valoare))}</td>
            </tr>
            <tr>
              <th>TOTAL</th>
              <td class="crm-right"><b>${escapeHtml(fmtMoney(totals.total))}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <div style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Adauga linie</h3>
        <div class="crm-muted" style="margin-top:6px">Poti porni de la un produs activ sau poti completa manual.</div>
      </div>

      <form method="post" action="/factura/${id}/linie" class="crm-stack">
        <div>
          <label class="crm-label">Produs / serviciu</label>
          <select class="crm-select" id="product_select">
            <option value="">-- alege produs --</option>
            ${productOptions}
          </select>
        </div>

        <div>
          <label class="crm-label">Denumire</label>
          <input class="crm-input" id="denumire_input" name="denumire" required>
        </div>

        <div>
          <label class="crm-label">Descriere</label>
          <textarea class="crm-textarea" name="descriere" rows="3"></textarea>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Cantitate</label>
            <input class="crm-input" name="cantitate" value="1">
          </div>
          <div>
            <label class="crm-label">UM</label>
            <input class="crm-input" id="unitate_input" name="unitate" placeholder="buc">
          </div>
        </div>

        <div>
          <label class="crm-label">Pret unitar</label>
          <input class="crm-input" id="pret_input" name="pret_unitar" value="0">
        </div>

        <div>
          <button class="crm-btn" type="submit">Adauga linie</button>
        </div>
      </form>

      <div style="margin-top:18px">
        <a href="${facturiBackLink}">← Inapoi la facturi</a>${canAccessSettings ? ` · <a href="/setari">Setari</a>` : ``}
      </div>
    </section>
  </div>

  <section class="crm-card" style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">e-Factura ANAF</h3>
        <div class="crm-muted" style="margin-top:6px">${isDemoCompany ? "In demo poti parcurge acelasi flux, dar fara transmitere reala in SPV." : "Dupa verificarea PDF-ului, poti trimite direct e-Factura."}</div>
      </div>
      <div>${efacturaStatusBadge(f.efactura_status)}</div>
    </div>

    <div class="crm-row" style="margin-top:4px">
      <form method="post" action="/factura/${id}/efactura/trimite" style="margin:0">
        <button class="crm-btn" type="submit">${efacturaActionLabel}</button>
      </form>
      <form method="post" action="/factura/${id}/efactura/genereaza-xml" style="margin:0">
        <button class="crm-btn crm-btn-secondary" type="submit">Regenereaza XML</button>
      </form>
      ${(f.efactura_upload_index || f.efactura_message_id || String(f.status || "").toUpperCase() === "TRIMIS_EFACTURA") ? `
      <form method="post" action="/factura/${id}/efactura/confirma-spv" style="margin:0">
        <button class="crm-btn crm-btn-secondary" type="submit">${efacturaCheckLabel}</button>
      </form>` : ``}
    </div>
  </section>

  <script>
  function toggleFacturaPreview(forceState){
    const wrap = document.getElementById("factura-preview-wrap");
    const frame = document.getElementById("factura-preview-frame");
    const btnText = document.getElementById("factura-preview-toggle-text");
    const btnIcon = document.getElementById("factura-preview-toggle-icon");

    if(!wrap || !frame) return;

    const frameBox = frame.parentElement;
    const isHidden = !frameBox || frameBox.style.display === "none";
    const willShow = typeof forceState === "boolean" ? forceState : isHidden;

    if(willShow){
      if(frameBox) frameBox.style.display = "block";
      if(!frame.src){
        frame.src = frame.dataset.src || "";
      }
      if(btnText) btnText.textContent = "Ascunde preview";
      if(btnIcon) btnIcon.textContent = "▾";

      setTimeout(() => {
        wrap.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } else {
      if(frameBox) frameBox.style.display = "none";
      if(btnText) btnText.textContent = "Afiseaza preview";
      if(btnIcon) btnIcon.textContent = "▸";
    }
  }
  </script>

  <script>
  (function(){
    const sel = document.getElementById("product_select");
    const den = document.getElementById("denumire_input");
    const um  = document.getElementById("unitate_input");
    const pre = document.getElementById("pret_input");
    if(!sel || !den || !um || !pre) return;

    sel.addEventListener("change", function(){
      const opt = sel.options[sel.selectedIndex];
      if(!opt || !opt.value) return;
      den.value = opt.getAttribute("data-name") || "";
      um.value = opt.getAttribute("data-unit") || "";
      pre.value = opt.getAttribute("data-price") || "0";
    });
  })();
  </script>

${crmShellEnd()}
</html>`);
  });

  app.get("/factura/:id/preview-pdf", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const embed = String(req.query?.embed || "") === "1";
    const f = db.prepare(`
      SELECT f.*, c.name AS client, c.address AS client_address, c.cui AS client_cui, c.reg_com AS client_reg_com
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE f.id=? AND f.company_id=?
    `).get(id, companyId);

    if (!f) return res.status(404).send("Factura nu exista");

    const lines = db.prepare(`
      SELECT denumire, descriere, cantitate, unitate, pret_unitar, total_linie
      FROM facturi_linii
      WHERE factura_id=? AND company_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(id, companyId);

    const totals = recalcFacturaTotals(id, companyId);
    const displayFacturaNumber = facturaDisplayNumber(f);
    const company = {
      name: getSetting("company_name", COMPANY.name),
      cui: getSetting("company_cui", COMPANY.cui),
      rc: getSetting("company_rc", COMPANY.rc),
      address: getSetting("company_address", COMPANY.address),
      iban: getSetting("company_iban", COMPANY.iban),
      bank: getSetting("company_bank", COMPANY.bank),
      rep: getSetting("company_rep", COMPANY.rep)
    };
    const pdfActionLabel = isDraftFacturaStatus(f.status) ? "Emite factura si genereaza PDF" : "Regenereaza PDF";

    const rowsHtml = (lines || []).map((l, idx) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">${idx + 1}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">
          <div>${escapeHtml(l.denumire || "")}</div>
          ${l.descriere ? `<div style="margin-top:4px;color:#64748b;font-size:12px">${escapeHtml(l.descriere)}</div>` : ``}
        </td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(String(l.cantitate || ""))}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(l.unitate || "")}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(fmtMoney(l.pret_unitar))}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(fmtMoney(l.total_linie))}</td>
      </tr>
    `).join("");

    res.type("html").send(`<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Preview PDF ${escapeHtml(displayFacturaNumber)}</title>
<style>
body{font-family:Arial,sans-serif;background:${embed ? "#ffffff" : "#ecfdf5"};color:#0f172a;margin:0;padding:${embed ? "12px" : "24px"}}
.wrap{max-width:${embed ? "100%" : "1100px"};margin:0 auto}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;box-shadow:${embed ? "none" : "0 8px 24px rgba(15,23,42,.06)"}}
.top{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:24px}
.muted{color:#64748b}
.kv div{margin-bottom:8px}
h1,h2,h3{margin:0}
table{width:100%;border-collapse:collapse}
.totalbox{margin-left:auto;max-width:360px;width:100%;margin-top:18px}
.totalbox td,.totalbox th{padding:10px;border-bottom:1px solid #e5e7eb}
.actions{display:${embed ? "none" : "flex"};gap:10px;flex-wrap:wrap;margin-bottom:18px}
.btn{display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;text-decoration:none;color:#0f172a;background:white;font-weight:700}
.btn-primary{background:#0f172a;color:white;border-color:#0f172a}
</style>
</head>
<body>
<div class="wrap">
  <div class="actions">
    <a class="btn" href="/factura/${id}">Inapoi la factura</a>
    <form method="post" action="/factura/${id}/genereaza-pdf" style="margin:0">
      <button class="btn btn-primary" type="submit">${pdfActionLabel}</button>
    </form>
  </div>

  <div class="card">
    <div class="top">
      <div>
        <h1>Factura ${escapeHtml(displayFacturaNumber)}</h1>
        <div class="muted" style="margin-top:8px">Preview inainte de generarea PDF-ului.</div>
      </div>
      <div class="kv">
        <div><b>Data emitere:</b> ${escapeHtml(String(f.data_emitere || "").slice(0,10))}</div>
        <div><b>Scadenta:</b> ${escapeHtml(String(f.scadenta || "").slice(0,10)) || "-"}</div>
        <div><b>Moneda:</b> ${escapeHtml(f.moneda || "RON")}</div>
      </div>
    </div>

    <div class="top">
      <div style="min-width:320px;flex:1">
        <h3>Furnizor</h3>
        <div style="margin-top:10px;line-height:1.7">
          <div><b>${escapeHtml(company.name || "")}</b></div>
          <div>CUI: ${escapeHtml(company.cui || "")}</div>
          <div>RC: ${escapeHtml(company.rc || "")}</div>
          <div>${escapeHtml(company.address || "")}</div>
          <div>IBAN: ${escapeHtml(company.iban || "")}</div>
          <div>Banca: ${escapeHtml(company.bank || "")}</div>
          <div>Reprezentant: ${escapeHtml(company.rep || "")}</div>
        </div>
      </div>

      <div style="min-width:320px;flex:1">
        <h3>Client</h3>
        <div style="margin-top:10px;line-height:1.7">
          <div><b>${escapeHtml(f.client || "")}</b></div>
          <div>CUI: ${escapeHtml(f.client_cui || "")}</div>
          <div>Reg. com.: ${escapeHtml(f.client_reg_com || "")}</div>
          <div>${escapeHtml(f.client_address || "")}</div>
        </div>
      </div>
    </div>

    <div style="margin-top:18px">
      <table>
        <tr>
          <th style="width:6%">Nr.</th>
          <th>Denumire</th>
          <th style="text-align:right">Cant</th>
          <th>UM</th>
          <th style="text-align:right">Pret</th>
          <th style="text-align:right">Total</th>
        </tr>
        ${rowsHtml}
      </table>
    </div>

    <table class="totalbox">
      <tbody>
        <tr><th style="text-align:left">Subtotal</th><td style="text-align:right">${escapeHtml(fmtMoney(totals.subtotal))}</td></tr>
        <tr><th style="text-align:left">TVA (${escapeHtml(String(Math.round((totals.tva_procent || 0) * 100))) }%)</th><td style="text-align:right">${escapeHtml(fmtMoney(totals.tva_valoare))}</td></tr>
        <tr><th style="text-align:left">TOTAL</th><td style="text-align:right"><b>${escapeHtml(fmtMoney(totals.total))}</b></td></tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`);
  });

  app.get("/factura/:id/preview-pdf2", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const f = db.prepare(`
      SELECT f.*, c.name AS client_name, c.cui AS client_cui, c.address AS client_address, c.reg_com AS client_reg_com
      FROM facturi f
      JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
      WHERE f.id=?
    `).get(id);

    if (!f) return res.status(404).send("Factura nu exista");

    const lines = db.prepare(`
      SELECT denumire, descriere, cantitate, unitate, pret_unitar, total_linie
      FROM facturi_linii
      WHERE factura_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(id);

    const totals = recalcFacturaTotals(id, companyId);
    const theme = getInvoiceTheme();
    const logo_data_uri = getInvoiceLogoDataUri();
    const company_name = getSetting("company_name", COMPANY.name || "QR-LAB SRL");
    const company_cui = getSetting("company_cui", COMPANY.cui || "");
    const company_rc = getSetting("company_rc", COMPANY.rc || "");
    const company_address = getSetting("company_address", COMPANY.address || "");
    const company_iban = getSetting("company_iban", COMPANY.iban || "");
    const company_bank = getSetting("company_bank", COMPANY.bank || "");
    const company_rep = getSetting("company_rep", COMPANY.representative || "");
    const invoice_footer = getSetting("invoice_footer", "Factura este valabila fara semnatura conform legii.");

    const vm = {
      theme_color: theme.theme,
      theme_color_light: theme.light,
      logo_data_uri,
      serie: (String(f.factura_nr || "INV").split("-")[0] || "INV"),
      numar: (String(f.factura_nr || "") || ""),
      factura_nr: f.factura_nr,
      data_emitere: String(f.data_emitere || "").slice(0, 10),
      scadenta: f.scadenta ? String(f.scadenta).slice(0, 10) : "",
      status: f.status || "CIORNA",
      moneda: f.moneda || "RON",
      subtotal: fmt2(totals.subtotal),
      tva_percent: Math.round((Number(totals.tva_procent || 0) * 100)),
      tva_valoare: fmt2(totals.tva_valoare),
      total: fmt2(totals.total),
      observatii: f.observatii || "",
      app_name: "QR-LAB",
      doc_code: "-",
      intocmit_de: company_rep || "-",
      invoice_footer: invoice_footer || "",
      spv_index: f.spv_index || "",
      spv_date: f.spv_date || "",
      show_tva: Number(totals.tva_procent || 0) > 0,
      furnizor: {
        name: company_name,
        cui: company_cui,
        rc: company_rc,
        address: company_address,
        judet: "Prahova",
        iban: company_iban,
        bank: company_bank
      },
      client: {
        name: f.client_name || "",
        cui: f.client_cui || "",
        address: f.client_address || "",
        reg_com: f.client_reg_com || "",
        judet: "-",
        tara: "Romania"
      },
      lines: (lines || []).map((l, i) => ({
        idx: i + 1,
        denumire: l.denumire || "",
        descriere: l.descriere || "",
        cantitate: String(l.cantitate ?? ""),
        unitate: l.unitate || "",
        pret_unitar: fmt2(l.pret_unitar),
        total_linie: fmt2(l.total_linie)
      }))
    };

    let html = Mustache.render(invoiceTemplateHtml, vm);
    if (String(req.query.embed || "") !== "1") {
      const backBar = `
        <div style="position:sticky;top:0;z-index:9999;background:#ffffff;border-bottom:1px solid #e5e7eb;padding:12px 18px;display:flex;align-items:center;gap:12px">
          <a href="/factura/${id}" style="display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:#eef2ff;color:#1e3a8a;text-decoration:none;font-weight:700">
            ← Inapoi la editare factura
          </a>
          <div style="color:#64748b;font-size:14px">Preview factura</div>
        </div>
      `;
      html = html.replace(/<body([^>]*)>/i, '<body$1>' + backBar);
    }

    return res.type("html").send(html);
  });

  app.post("/factura/:id/genereaza-pdf", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    try {
      const existingFactura = db.prepare(`
        SELECT f.*, c.name AS client_name, c.cui AS client_cui, c.address AS client_address, c.reg_com AS client_reg_com, c.vat AS client_vat
        FROM facturi f
        JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
        WHERE f.id=? AND f.company_id=?
      `).get(id, companyId);

      if (!existingFactura) return res.status(404).send("Factura nu exista");

      finalizeFacturaNumber(id, companyId, existingFactura);

      const f = db.prepare(`
        SELECT f.*, c.name AS client_name, c.cui AS client_cui, c.address AS client_address, c.reg_com AS client_reg_com, c.vat AS client_vat
        FROM facturi f
        JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
        WHERE f.id=? AND f.company_id=?
      `).get(id, companyId);

      if (!f) return res.status(404).send("Factura nu exista");

      const lines = db.prepare(`
        SELECT denumire, descriere, cantitate, unitate, pret_unitar, total_linie
        FROM facturi_linii
        WHERE factura_id=? AND company_id=?
        ORDER BY sort_order ASC, id ASC
      `).all(id, companyId);

      const totals = recalcFacturaTotals(id, companyId);
      const year = Number(f.an || new Date().getFullYear());
      const yearDir = path.join(__dirname, "contracts", "invoices", String(year));
      fs.mkdirSync(yearDir, { recursive: true });

      const fileName = `${f.factura_nr}.pdf`;
      const absPath = path.join(yearDir, fileName);
      const pdf_path = `contracts/invoices/${year}/${fileName}`;
      const facturaStatusForPdf = isDraftFacturaStatus(f.status) ? "FACTURA_GENERATA" : (f.status || "CIORNA");

      const theme = getInvoiceTheme();
      const logo_data_uri = getInvoiceLogoDataUri();
      const company_name = getSetting("company_name", COMPANY.name || "QR-LAB SRL");
      const company_cui = getSetting("company_cui", COMPANY.cui || "");
      const company_rc = getSetting("company_rc", COMPANY.rc || "");
      const company_address = getSetting("company_address", COMPANY.address || "");
      const company_iban = getSetting("company_iban", COMPANY.iban || "");
      const company_bank = getSetting("company_bank", COMPANY.bank || "");
      const company_rep = getSetting("company_rep", COMPANY.representative || "");
      const capital_social = getSetting("capital_social", "-");
      const invoice_footer = getSetting("invoice_footer", "Factura este valabila fara semnatura conform legii.");

      const vm = {
        theme_color: theme.theme,
        theme_color_light: theme.light,
        logo_data_uri,
        serie: (String(f.factura_nr || "INV").split("-")[0] || "INV"),
        numar: (String(f.factura_nr || "") || ""),
        factura_nr: f.factura_nr,
        data_emitere: String(f.data_emitere || "").slice(0, 10),
        scadenta: f.scadenta ? String(f.scadenta).slice(0, 10) : "",
        status: facturaStatusForPdf,
        moneda: f.moneda || "RON",
        subtotal: fmt2(totals.subtotal),
        tva_percent: Math.round((Number(totals.tva_procent || 0) * 100)),
        tva_valoare: fmt2(totals.tva_valoare),
        total: fmt2(totals.total),
        observatii: f.observatii || "",
        app_name: "QR-LAB",
        doc_code: "-",
        capital_social: capital_social || "-",
        intocmit_de: company_rep || "-",
        invoice_footer: invoice_footer || "",
        spv_index: f.spv_index || "",
        spv_date: f.spv_date || "",
        show_tva: Number(totals.tva_procent || 0) > 0,
        furnizor: {
          name: company_name,
          cui: company_cui,
          rc: company_rc,
          address: company_address,
          judet: "Prahova",
          iban: company_iban,
          bank: company_bank
        },
        client: {
          name: f.client_name || "",
          cui: f.client_cui || "",
          address: f.client_address || "",
          reg_com: f.client_reg_com || "",
          judet: "-",
          tara: "Romania"
        },
        lines: (lines || []).map((l, i) => ({
          idx: i + 1,
          denumire: l.denumire || "",
          descriere: l.descriere || "",
          cantitate: String(l.cantitate ?? ""),
          unitate: l.unitate || "",
          pret_unitar: fmt2(l.pret_unitar),
          total_linie: fmt2(l.total_linie)
        }))
      };

      const html = Mustache.render(invoiceTemplateHtml, vm);
      const pdf = await renderPdfBuffer(html);

      fs.writeFileSync(absPath, pdf);
      db.prepare(`
        UPDATE facturi
        SET pdf_path=?,
            status=CASE
              WHEN UPPER(COALESCE(status,'')) IN ('CIORNA','DRAFT') THEN 'FACTURA_GENERATA'
              ELSE status
            END
        WHERE id=? AND company_id=?
      `).run(pdf_path, id, companyId);

      if (req.body?.return_to === "nexora") {
        return res.redirect(`/nexora/facturi/${id}?ok=pdf_generat`);
      }

      return res.redirect("/" + encodeURI(pdf_path));
    } catch (error) {
      console.error(`[PDF] generate invoice ${id} failed`, error);
      const errCode = error?.code === "PDF_BROWSER_MISSING" ? "pdf_neconfigurat" : "pdf_generare";
      return res.redirect(req.body?.return_to === "nexora" ? `/nexora/facturi/${id}?err=${errCode}` : `/factura/${id}?err=${errCode}`);
    }
  });

  app.post("/factura/:id/efactura/genereaza-xml", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");
    const exists = db.prepare(`
      SELECT id, an, pdf_path, efactura_xml_path, efactura_response_zip_path
      FROM facturi
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!exists) return res.status(404).send("Factura nu exista");

    finalizeFacturaNumber(id, companyId, exists);

    const r = ensureFacturaXmlGenerated(id, companyId);
    if (r.error) return res.status(404).send(r.error);
    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?ok=xml_generat" : "/factura/" + id + "?ok=xml_generat");
  });

  app.post("/factura/:id/efactura/trimite", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    const isDemoCompany = Number(req.session.user?.company_is_demo || 0) === 1;
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const f = db.prepare(`
      SELECT id, an, factura_nr, pdf_path, efactura_xml_path, efactura_response_zip_path
      FROM facturi
      WHERE id=? AND company_id=?
    `).get(id, companyId);

    if (!f) return res.status(404).send("Factura nu exista");

    try {
      const assignedNumber = finalizeFacturaNumber(id, companyId, f);

      const generated = ensureFacturaXmlGenerated(id, companyId);
      if (generated.error) {
        db.prepare(`
          UPDATE facturi
          SET efactura_last_error=?
          WHERE id=?
        `).run(generated.error, id);
        return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=nu_exista_xml" : "/factura/" + id + "?err=nu_exista_xml");
      }

      if (!fs.existsSync(generated.absPath)) {
        db.prepare(`
          UPDATE facturi
          SET efactura_last_error=?
          WHERE id=?
        `).run("Fisierul XML lipseste de pe server.", id);
        return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=xml_lipsa_pe_server" : "/factura/" + id + "?err=xml_lipsa_pe_server");
      }

      const payload = fs.readFileSync(generated.absPath, "utf8");
      if (isDemoCompany) {
        const demoUploadIndex = `DEMO-${id}-${Date.now()}`;

        db.prepare(`
          INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, null, demoUploadIndex, id, "OUT", "DEMO_LOCAL", payload, "Flux e-Factura simulat local pentru workspace demo.");

        db.prepare(`
          UPDATE facturi
          SET efactura_status=?,
              efactura_message_id=?,
              efactura_upload_index=?,
              efactura_download_id=NULL,
              efactura_response_zip_path=NULL,
              efactura_last_error=NULL,
              efactura_last_checked_at=CURRENT_TIMESTAMP
          WHERE id=? AND company_id=?
        `).run("DEMO_LOCAL", demoUploadIndex, demoUploadIndex, id, companyId);

        db.prepare("UPDATE facturi SET status=? WHERE id=? AND company_id=?").run("TRIMIS_EFACTURA", id, companyId);
        return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?ok=trimis_demo" : "/factura/" + id + "?ok=trimis_demo");
      }

      const environment = String(getSetting("anaf_environment", "test") || "test").trim();
      const companyCui = String(getSetting("company_cui", COMPANY.cui || "") || "").replace(/^RO/i, "").trim();

      const uploaded = await anafUploadFactura({
        cif: companyCui,
        companyId,
        db,
        environment,
        getSetting,
        xml: payload
      });

      if (!uploaded.ok) {
        const errorMessage = uploaded.message || uploaded.rawText || `ANAF upload error (${uploaded.httpStatus})`;
        db.prepare(`
          UPDATE facturi
          SET efactura_status=?,
              efactura_last_error=?,
              efactura_last_checked_at=CURRENT_TIMESTAMP
          WHERE id=? AND company_id=?
        `).run("EROARE_UPLOAD", errorMessage, id, companyId);

        db.prepare(`
          INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, null, uploaded.uploadIndex || "", id, "OUT", "EROARE", payload, uploaded.rawText || errorMessage);

        return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=eroare_anaf" : "/factura/" + id + "?err=eroare_anaf");
      }

      db.prepare(`
        INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, null, uploaded.uploadIndex, id, "OUT", "TRIMIS", payload, uploaded.rawText || "");

      db.prepare(`
        UPDATE facturi
        SET efactura_status=?,
            efactura_message_id=?,
            efactura_upload_index=?,
            efactura_download_id=NULL,
            efactura_response_zip_path=NULL,
            efactura_last_error=NULL,
            efactura_last_checked_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?
      `).run("TRIMIS", uploaded.uploadIndex, uploaded.uploadIndex, id, companyId);

      db.prepare("UPDATE facturi SET status=? WHERE id=? AND company_id=?").run("TRIMIS_EFACTURA", id, companyId);
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?ok=trimis_anaf" : "/factura/" + id + "?ok=trimis_anaf");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nu exista conexiune ANAF activa.";
      db.prepare(`
        UPDATE facturi
        SET efactura_status=?,
            efactura_last_error=?,
            efactura_last_checked_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?
      `).run("FARA_CONEXIUNE", message, id, companyId);
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + `?err=fara_conexiune_anaf${spvNeedsManualReauthorization(message) ? "&reauth=needed" : ""}` : "/factura/" + id + `?err=fara_conexiune_anaf${spvNeedsManualReauthorization(message) ? "&reauth=needed" : ""}`);
    }
  });

  app.post("/factura/:id/efactura/confirma-spv", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    const isDemoCompany = Number(req.session.user?.company_is_demo || 0) === 1;
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const factura = db.prepare(`
      SELECT id, factura_nr, efactura_upload_index, efactura_message_id
      FROM facturi
      WHERE id=? AND company_id=?
    `).get(id, companyId);

    if (isDemoCompany) {
      const demoDownloadId = `DEMO-RSP-${id}-${Date.now()}`;
      db.prepare(`
        INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, null, demoDownloadId, id, "OUT", "DEMO_CONFIRMAT", "", "Confirmare e-Factura simulata local pentru workspace demo.");

      db.prepare(`
        UPDATE facturi
        SET status=?,
            efactura_status=?,
            efactura_download_id=?,
            efactura_last_error=NULL,
            efactura_last_checked_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?
      `).run("TRIMIS_EFACTURA", "DEMO_CONFIRMAT", demoDownloadId, id, companyId);

      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?ok=stare_demo" : "/factura/" + id + "?ok=stare_demo");
    }

    const uploadIndex = String(factura?.efactura_upload_index || factura?.efactura_message_id || "").trim();
    if (!uploadIndex) return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=fara_index_incarcare" : "/factura/" + id + "?err=fara_index_incarcare");

    const environment = String(getSetting("anaf_environment", "test") || "test").trim();

    try {
      const checked = await anafCheckUploadStatus({
        companyId,
        db,
        environment,
        getSetting,
        uploadIndex
      });

      const responseMessage = checked.message || checked.rawText || "";
      const isRejectedByAnaf = String(checked.executionStatus || "").trim().toLowerCase() === "nok";
      const nextStatus = checked.downloadId
        ? (isRejectedByAnaf ? "RESPINS_VALIDARE" : "RASPUNS_DISPONIBIL")
        : checked.executionStatus
          ? String(checked.executionStatus).toUpperCase()
          : "IN_PROCESARE";

      let responseZipPath = "";
      if (checked.downloadId) {
        const downloaded = await anafDownloadMessage({
          companyId,
          db,
          environment,
          getSetting,
          downloadId: checked.downloadId
        });

        if (downloaded.ok) {
          const zipDir = path.join(__dirname, "efactura_responses");
          fs.mkdirSync(zipDir, { recursive: true });
          const zipFile = `${String(factura.factura_nr || "factura").replace(/[^A-Za-z0-9._-]/g, "_")}-${checked.downloadId}.zip`;
          const absZipPath = path.join(zipDir, zipFile);
          fs.writeFileSync(absZipPath, downloaded.buffer);
          responseZipPath = `efactura_responses/${zipFile}`;
        }
      }

      logAnafMessage({
        companyId,
        accountId: null,
        messageId: checked.downloadId || uploadIndex,
        facturaId: id,
        direction: "OUT",
        status: nextStatus,
        payload: checked.rawText || "",
        details: responseMessage
      });

      db.prepare(`
        UPDATE facturi
        SET status=?,
            efactura_status=?,
            efactura_download_id=COALESCE(?, efactura_download_id),
            efactura_response_zip_path=CASE WHEN ? <> '' THEN ? ELSE efactura_response_zip_path END,
            efactura_last_error=?,
            efactura_last_checked_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?
      `).run(
        checked.downloadId ? (isRejectedByAnaf ? "RESPINSA_SPV" : "RECEPTIONATA_SPV") : "TRIMIS_EFACTURA",
        nextStatus,
        checked.downloadId || null,
        responseZipPath,
        responseZipPath,
        isRejectedByAnaf
          ? "ANAF a respins factura la validare. Descarca arhiva de raspuns pentru detalii."
          : (checked.ok ? null : (responseMessage || `ANAF status error (${checked.httpStatus})`)),
        id,
        companyId
      );

      const nextOkParam = isRejectedByAnaf
        ? "stare_respinsa_anaf"
        : (responseZipPath ? "stare_actualizata_cu_zip" : "stare_actualizata");
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + `?ok=${nextOkParam}` : "/factura/" + id + `?ok=${nextOkParam}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nu exista conexiune ANAF activa.";
      db.prepare(`
        UPDATE facturi
        SET efactura_last_error=?,
            efactura_last_checked_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?
      `).run(message, id, companyId);
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + `?err=fara_conexiune_anaf${spvNeedsManualReauthorization(message) ? "&reauth=needed" : ""}` : "/factura/" + id + `?err=fara_conexiune_anaf${spvNeedsManualReauthorization(message) ? "&reauth=needed" : ""}`);
    }
  });

  app.post("/factura/:id/trimite-client", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const f = db.prepare(`
      SELECT f.*, c.name AS client
      FROM facturi f
      JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
      WHERE f.id=? AND f.company_id=?
    `).get(id, companyId);

    if (!f) return res.status(404).send("Factura nu exista");

    const contact = db.prepare(`
      SELECT email
      FROM contacts
      WHERE client_id=? AND company_id=? AND email IS NOT NULL AND TRIM(email) <> ''
      ORDER BY is_primary DESC, id ASC
      LIMIT 1
    `).get(f.client_id, companyId);

    if (!contact || !contact.email) return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=fara_email_client" : "/factura/" + id + "?err=fara_email_client");
    if (!f.pdf_path) return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=fara_pdf" : "/factura/" + id + "?err=fara_pdf");

    const absPath = path.join(__dirname, f.pdf_path);
    if (!fs.existsSync(absPath)) return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=pdf_lipsa" : "/factura/" + id + "?err=pdf_lipsa");

    try {
      const displayFacturaNumber = facturaDisplayNumber(f);
      const attachmentName = displayFacturaNumber.replace(/[^A-Za-z0-9._ -]/g, "_") + ".pdf";
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: contact.email,
        subject: "Factura " + displayFacturaNumber,
        text: "Buna ziua,\n\nAtasat gasiti factura.\n\nMultumim.",
        attachments: [{ filename: attachmentName, path: absPath }]
      });

      db.prepare("UPDATE facturi SET status=? WHERE id=? AND company_id=?").run("TRIMIS_CLIENT", id, companyId);
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?ok=trimis_client" : "/factura/" + id + "?ok=trimis_client");
    } catch (e) {
      console.error("EMAIL ERROR:", e);
      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/facturi/" + id + "?err=eroare_email" : "/factura/" + id + "?err=eroare_email");
    }
  });
}
