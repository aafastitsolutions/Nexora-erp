import { formatInvoiceDisplayNumber } from "../lib/invoice-numbering.js";
import {
  renderNexoraAccountingBankReconciliationPage,
  renderNexoraAccountingBudgetsPage,
  renderNexoraAccountingCashflowPage,
  renderNexoraAccountingConsumptionDetailPage,
  renderNexoraAccountingConsumptionPage,
  renderNexoraAccountingDeclarationDetailPage,
  renderNexoraAccountingDeclarationsPage,
  renderNexoraAccountingExpensesPage,
  renderNexoraAccountingFixedAssetsPage,
  renderNexoraAccountingInvoiceAutomationPage,
  renderNexoraAccountingRegistersPage,
  renderNexoraAccountingTransactionsPage,
  renderNexoraAccountingTrialBalancePage,
  renderNexoraAccountingVatPage
} from "../src/ui/nexora-accounting-pages.js";
import { renderNexoraHubPage } from "../src/ui/nexora-hub-page.js";

function parseDateFilter(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseStatusFilter(value) {
  return String(value || "").trim().toUpperCase();
}

function parseEfacturaFilter(value) {
  return String(value || "").trim().toLowerCase();
}

function buildInvoiceFilterState(query = {}) {
  return {
    dateFrom: parseDateFilter(query.date_from),
    dateTo: parseDateFilter(query.date_to),
    status: parseStatusFilter(query.status),
    efactura: parseEfacturaFilter(query.efactura),
    search: String(query.search || "").trim()
  };
}

function buildInvoiceWhereClause(filters, companyId) {
  const where = ["f.company_id=?"];
  const params = [companyId];

  if (filters.dateFrom) {
    where.push("date(COALESCE(f.data_emitere, f.created_at)) >= date(?)");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push("date(COALESCE(f.data_emitere, f.created_at)) <= date(?)");
    params.push(filters.dateTo);
  }

  if (filters.status) {
    if (filters.status === "RESTANTE") {
      where.push("f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')");
    } else if (filters.status === "DESCHISE") {
      where.push("UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')");
    } else {
      where.push("UPPER(COALESCE(f.status,'')) = ?");
      params.push(filters.status);
    }
  }

  if (filters.efactura === "pending") {
    where.push("COALESCE(f.efactura_upload_index, f.efactura_message_id, '') <> '' AND COALESCE(f.efactura_download_id, '') = ''");
  } else if (filters.efactura === "error") {
    where.push("COALESCE(f.efactura_last_error, '') <> ''");
  } else if (filters.efactura === "sent") {
    where.push("COALESCE(f.efactura_upload_index, f.efactura_message_id, '') <> ''");
  } else if (filters.efactura === "downloaded") {
    where.push("COALESCE(f.efactura_download_id, '') <> ''");
  } else if (filters.efactura === "none") {
    where.push("COALESCE(f.efactura_status, f.efactura_upload_index, f.efactura_message_id, '') = ''");
  }

  if (filters.search) {
    where.push("(LOWER(COALESCE(f.factura_nr,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
    const like = `%${filters.search.toLowerCase()}%`;
    params.push(like, like, like);
  }

  return { whereSql: where.join(" AND "), params };
}

function invoiceExportQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  if (filters.efactura) params.set("efactura", filters.efactura);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

const ANAF_FORMS_URL = "https://static.anaf.ro/static/10/Anaf/formulare/toate_formularele.htm";
const ANAF_DECLARATIONS_PORTAL_URL = "https://www.anaf.ro/declaratii/";

const DECLARATION_CATALOG = [
  {
    code: "D100",
    title: "Declarație privind obligațiile de plată la bugetul de stat",
    description: "Impozit micro/profit, dividende și alte obligații declarative recurente.",
    frequency: "lunar / trimestrial",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D101",
    title: "Declarație privind impozitul pe profit",
    description: "Regularizare anuală pentru contribuabilii plătitori de impozit pe profit.",
    frequency: "anual",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D112",
    title: "Obligații salariale și evidența nominală a persoanelor asigurate",
    description: "Contribuții sociale, impozit pe venit și salariați/asigurați.",
    frequency: "lunar",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D300",
    title: "Decont de taxă pe valoarea adăugată",
    description: "TVA colectată, TVA deductibilă și sold de plată/rambursare.",
    frequency: "lunar / trimestrial",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D390",
    title: "Declarație recapitulativă operațiuni intracomunitare",
    description: "Livrări, achiziții și servicii intracomunitare VIES.",
    frequency: "lunar, când există operațiuni",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D394",
    title: "Declarație informativă livrări/prestări și achiziții pe teritoriul național",
    description: "Detaliere operațiuni interne relevante pentru TVA.",
    frequency: "lunar / trimestrial",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D406",
    title: "SAF-T - fișierul standard de control fiscal",
    description: "Raportare fiscal-contabilă detaliată, de regulă XML validat și PDF cu XML atașat.",
    frequency: "lunar / trimestrial / anual",
    channel: "SPV",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D700",
    title: "Declarație pentru înregistrare/modificare categorii obligații fiscale",
    description: "Vector fiscal: TVA, impozite, contribuții și alte mențiuni fiscale.",
    frequency: "la modificare",
    channel: "SPV",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D710",
    title: "Declarație rectificativă",
    description: "Corectarea obligațiilor declarate anterior.",
    frequency: "la nevoie",
    channel: "SPV / e-guvernare",
    sourceUrl: ANAF_FORMS_URL
  },
  {
    code: "D212",
    title: "Declarația unică",
    description: "Venituri persoane fizice, PFA și contribuții estimate/realizate.",
    frequency: "anual",
    channel: "Portal formulare ANAF",
    sourceUrl: ANAF_DECLARATIONS_PORTAL_URL
  }
];

function uploadDirPath(path, __dirname, folderName) {
  return path.join(__dirname, "public", "uploads", "accounting", folderName);
}

function saveUploadedFile({ fs, path, __dirname, file, folderName }) {
  if (!file) return "";
  const targetDir = uploadDirPath(path, __dirname, folderName);
  fs.mkdirSync(targetDir, { recursive: true });
  const safeBase = String(file.originalname || "document.bin").replace(/[^A-Za-z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeBase}`;
  const finalPath = path.join(targetDir, finalName);
  fs.renameSync(file.path, finalPath);
  return `uploads/accounting/${folderName}/${finalName}`;
}

function moneyInput(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function safeText(value = "") {
  return String(value || "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function positiveNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function integerBetween(value, min, max, fallback) {
  const parsed = Math.round(positiveNumber(value, fallback));
  return Math.min(max, Math.max(min, parsed));
}

function normalizeVatRate(value) {
  const parsed = positiveNumber(value, 0);
  if (parsed > 1) return parsed / 100;
  return parsed;
}

function normalizeAccountingStatus(value, fallback = "NECORELATA") {
  return String(value || fallback).trim().toUpperCase().replace(/\s+/g, "_");
}

function buildPeriodFilter(query = {}) {
  return {
    dateFrom: parseDateFilter(query.date_from),
    dateTo: parseDateFilter(query.date_to),
    status: String(query.status || "").trim().toUpperCase(),
    search: String(query.search || "").trim()
  };
}

function addPeriodWhere({ where, params, dateExpression, filters }) {
  if (filters.dateFrom) {
    where.push(`date(${dateExpression}) >= date(?)`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push(`date(${dateExpression}) <= date(?)`);
    params.push(filters.dateTo);
  }
}

function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateParts(dateIso = currentDateIso()) {
  const safeDate = parseDateFilter(dateIso) || currentDateIso();
  const [year, month, day] = safeDate.split("-").map(Number);
  return { year, month, day };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function scheduledDateForMonth(year, month, issueDay) {
  const day = Math.min(daysInMonth(year, month), integerBetween(issueDay, 1, 31, 1));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodLabelFromDate(dateIso = currentDateIso()) {
  return String(parseDateFilter(dateIso) || currentDateIso()).slice(0, 7);
}

function addDaysIso(dateIso, days = 0) {
  const safeDate = parseDateFilter(dateIso) || currentDateIso();
  const date = new Date(`${safeDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.round(Number(days || 0))));
  return date.toISOString().slice(0, 10);
}

function monthlyScheduleFor(automation = {}, nowIso = currentDateIso()) {
  const { year, month } = dateParts(nowIso);
  const scheduledDate = scheduledDateForMonth(year, month, automation.issue_day || 1);
  return {
    periodLabel: `${year}-${String(month).padStart(2, "0")}`,
    scheduledDate
  };
}

function isAutomationDue(automation = {}, nowIso = currentDateIso(), force = false) {
  const { periodLabel, scheduledDate } = monthlyScheduleFor(automation, nowIso);
  if (!force && scheduledDate > nowIso) return { due: false, periodLabel, scheduledDate, reason: "not_due" };
  const startDate = parseDateFilter(automation.start_date) || "";
  if (startDate && scheduledDate < startDate) return { due: false, periodLabel, scheduledDate, reason: "before_start" };
  const endDate = parseDateFilter(automation.end_date) || "";
  if (endDate && scheduledDate > endDate) return { due: false, periodLabel, scheduledDate, reason: "after_end" };
  return { due: true, periodLabel, scheduledDate };
}

function nextAccountingAutomationNumber(db, companyId) {
  const year = new Date().getFullYear();
  const prefix = `AIF-${year}-`;
  const row = db.prepare(`
    SELECT automation_number
    FROM accounting_invoice_automations
    WHERE company_id=? AND automation_number LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${prefix}%`);
  const seq = Number(String(row?.automation_number || "").split("-").pop() || 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function monthsBetween(startDate, endDate) {
  const start = String(startDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return 0;
  const end = String(endDate || currentDateIso()).slice(0, 10);
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

function declarationStatusBadge(escapeHtml, status) {
  const normalized = String(status || "PREGATITA").trim().toUpperCase();
  if (normalized === "VALIDATA") return `<span class="crm-badge crm-badge-green">validată</span>`;
  if (normalized === "TRIMISA") return `<span class="crm-badge crm-badge-blue">trimisă</span>`;
  if (normalized === "RESPINSA") return `<span class="crm-badge crm-badge-red">respinsă</span>`;
  return `<span class="crm-badge crm-badge-amber">${escapeHtml(normalized.toLowerCase())}</span>`;
}

function buildInboxFilterState(query = {}) {
  return {
    processed: String(query.processed || "").trim().toLowerCase(),
    dateFrom: parseDateFilter(query.inbox_date_from || query.date_from),
    dateTo: parseDateFilter(query.inbox_date_to || query.date_to),
    search: String(query.inbox_search || query.search || "").trim()
  };
}

function buildInboxWhereClause(filters, companyId) {
  const where = ["company_id=?"];
  const params = [companyId];

  if (filters.processed === "processed") {
    where.push("processed=1");
  } else if (filters.processed === "new") {
    where.push("processed=0");
  }

  if (filters.dateFrom) {
    where.push("date(COALESCE(received_at, created_at)) >= date(?)");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push("date(COALESCE(received_at, created_at)) <= date(?)");
    params.push(filters.dateTo);
  }

  if (filters.search) {
    const like = `%${filters.search.toLowerCase()}%`;
    where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(invoice_number,'')) LIKE ? OR LOWER(COALESCE(details,'')) LIKE ? OR LOWER(COALESCE(xml_path,'')) LIKE ? OR LOWER(COALESCE(pdf_path,'')) LIKE ? OR LOWER(COALESCE(zip_path,'')) LIKE ?)");
    params.push(like, like, like, like, like, like, like);
  }

  return { whereSql: where.join(" AND "), params };
}

export function registerAccountingRoutes(app, {
  db,
  requireAuth,
  requireSpvAccess,
  canAccessSpvUser,
  escapeHtml,
  fmtMoney,
  crmShellStart,
  crmShellEnd,
  fs,
  path,
  __dirname,
  upload,
  COMPANY = {},
  anafUploadFactura,
  ensureFacturaXmlGenerated,
  ensureOfficialInvoiceNumber,
  getCompanySetting,
  getSetting
}) {
  const scopedSetting = (companyId, key, fallback = "") => {
    if (typeof getCompanySetting === "function") return getCompanySetting(companyId, key, fallback);
    if (typeof getSetting === "function") return getSetting(key, fallback);
    return fallback;
  };

  function normalizeAutomationLines(body = {}) {
    const names = asArray(body.line_name);
    const descriptions = asArray(body.line_description);
    const quantities = asArray(body.line_qty);
    const units = asArray(body.line_unit);
    const prices = asArray(body.line_price);
    const rows = [];

    for (let index = 0; index < names.length; index += 1) {
      const denumire = safeText(names[index]);
      if (!denumire) continue;
      const cantitate = positiveNumber(quantities[index], 1) || 1;
      const pretUnitar = positiveNumber(prices[index], 0);
      rows.push({
        denumire,
        descriere: safeText(descriptions[index]),
        cantitate,
        unitate: safeText(units[index]) || "buc",
        pret_unitar: pretUnitar,
        total_linie: cantitate * pretUnitar,
        sort_order: rows.length + 1
      });
    }

    return rows;
  }

  function invoiceAutomationWithLines(automationId, companyId) {
    const automation = db.prepare(`
      SELECT a.*, c.name AS client_name, c.cui AS client_cui, c.email AS client_email
      FROM accounting_invoice_automations a
      JOIN clients c ON c.id=a.client_id AND c.company_id=a.company_id
      WHERE a.id=? AND a.company_id=?
    `).get(automationId, companyId);
    if (!automation) return null;
    automation.lines = db.prepare(`
      SELECT denumire, descriere, cantitate, unitate, pret_unitar, sort_order
      FROM accounting_invoice_automation_lines
      WHERE automation_id=? AND company_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(automationId, companyId);
    return automation;
  }

  async function sendInvoiceToEfactura({ facturaId, companyId, automationId, runId }) {
    if (typeof ensureFacturaXmlGenerated !== "function" || typeof anafUploadFactura !== "function") {
      const message = "Integrarea e-Factura nu este disponibilă în procesul curent.";
      db.prepare("UPDATE facturi SET efactura_status=?, efactura_last_error=?, efactura_last_checked_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?")
        .run("EROARE", message, facturaId, companyId);
      db.prepare("UPDATE accounting_invoice_automation_runs SET status='ERROR_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, runId, companyId);
      db.prepare("UPDATE accounting_invoice_automations SET last_error=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, automationId, companyId);
      return { ok: false, message };
    }

    const generated = ensureFacturaXmlGenerated(facturaId, companyId);
    if (generated?.error) {
      const message = generated.error;
      db.prepare("UPDATE facturi SET efactura_status=?, efactura_last_error=?, efactura_last_checked_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?")
        .run("EROARE", message, facturaId, companyId);
      db.prepare("UPDATE accounting_invoice_automation_runs SET status='ERROR_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, runId, companyId);
      db.prepare("UPDATE accounting_invoice_automations SET last_error=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, automationId, companyId);
      return { ok: false, message };
    }

    const payload = String(generated?.xml || (generated?.absPath && fs?.existsSync?.(generated.absPath) ? fs.readFileSync(generated.absPath, "utf8") : ""));
    if (!payload) {
      const message = "XML-ul e-Factura nu a putut fi citit.";
      db.prepare("UPDATE facturi SET efactura_status=?, efactura_last_error=?, efactura_last_checked_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?")
        .run("EROARE", message, facturaId, companyId);
      db.prepare("UPDATE accounting_invoice_automation_runs SET status='ERROR_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, runId, companyId);
      return { ok: false, message };
    }

    const company = db.prepare("SELECT is_demo FROM companies WHERE id=?").get(companyId) || {};
    const demoUploadIndex = Number(company.is_demo || 0) === 1 ? `DEMO-AIF-${facturaId}-${Date.now()}` : "";
    if (demoUploadIndex) {
      db.prepare(`
        INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
        VALUES (?, NULL, ?, ?, 'OUT', 'DEMO_LOCAL', ?, ?)
      `).run(companyId, demoUploadIndex, facturaId, payload, "Flux e-Factura simulat local pentru automatizare facturi.");
      db.prepare(`
        UPDATE facturi
        SET efactura_status='DEMO_LOCAL',
            efactura_message_id=?,
            efactura_upload_index=?,
            efactura_download_id=NULL,
            efactura_response_zip_path=NULL,
            efactura_last_error=NULL,
            efactura_last_checked_at=CURRENT_TIMESTAMP,
            status='TRIMIS_EFACTURA'
        WHERE id=? AND company_id=?
      `).run(demoUploadIndex, demoUploadIndex, facturaId, companyId);
      db.prepare("UPDATE accounting_invoice_automation_runs SET status='SENT_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run("Trimitere e-Factura simulată pentru companie demo.", runId, companyId);
      return { ok: true, demo: true };
    }

    try {
      const environment = safeText(scopedSetting(companyId, "anaf_environment", "test")) || "test";
      const companyCui = String(scopedSetting(companyId, "company_cui", COMPANY.cui || "") || "").replace(/^RO/i, "").trim();
      const getScopedSetting = (key, fallback = "") => scopedSetting(companyId, key, fallback);
      const uploaded = await anafUploadFactura({
        cif: companyCui,
        companyId,
        db,
        environment,
        getSetting: getScopedSetting,
        xml: payload
      });

      if (!uploaded.ok) {
        const message = uploaded.message || uploaded.rawText || `ANAF upload error (${uploaded.httpStatus || "necunoscut"})`;
        db.prepare(`
          UPDATE facturi
          SET efactura_status='EROARE_UPLOAD',
              efactura_last_error=?,
              efactura_last_checked_at=CURRENT_TIMESTAMP
          WHERE id=? AND company_id=?
        `).run(message, facturaId, companyId);
        db.prepare(`
          INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
          VALUES (?, NULL, ?, ?, 'OUT', 'EROARE', ?, ?)
        `).run(companyId, uploaded.uploadIndex || "", facturaId, payload, uploaded.rawText || message);
        db.prepare("UPDATE accounting_invoice_automation_runs SET status='ERROR_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
          .run(message, runId, companyId);
        db.prepare("UPDATE accounting_invoice_automations SET last_error=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
          .run(message, automationId, companyId);
        return { ok: false, message };
      }

      db.prepare(`
        INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
        VALUES (?, NULL, ?, ?, 'OUT', 'TRIMIS', ?, ?)
      `).run(companyId, uploaded.uploadIndex, facturaId, payload, uploaded.rawText || "");
      db.prepare(`
        UPDATE facturi
        SET efactura_status='TRIMIS',
            efactura_message_id=?,
            efactura_upload_index=?,
            efactura_download_id=NULL,
            efactura_response_zip_path=NULL,
            efactura_last_error=NULL,
            efactura_last_checked_at=CURRENT_TIMESTAMP,
            status='TRIMIS_EFACTURA'
        WHERE id=? AND company_id=?
      `).run(uploaded.uploadIndex, uploaded.uploadIndex, facturaId, companyId);
      db.prepare("UPDATE accounting_invoice_automation_runs SET status='SENT_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(`Trimis la ANAF cu index ${uploaded.uploadIndex}.`, runId, companyId);
      db.prepare("UPDATE accounting_invoice_automations SET last_error=NULL, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(automationId, companyId);
      return { ok: true, uploadIndex: uploaded.uploadIndex };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Nu există conexiune ANAF activă.");
      db.prepare(`
        UPDATE facturi
        SET efactura_status='FARA_CONEXIUNE',
            efactura_last_error=?,
            efactura_last_checked_at=CURRENT_TIMESTAMP
        WHERE id=? AND company_id=?
      `).run(message, facturaId, companyId);
      db.prepare("UPDATE accounting_invoice_automation_runs SET status='ERROR_EFACTURA', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, runId, companyId);
      db.prepare("UPDATE accounting_invoice_automations SET last_error=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message, automationId, companyId);
      return { ok: false, message };
    }
  }

  async function generateInvoiceForAutomation(automation, { nowIso = currentDateIso(), force = false, actorEmail = "system@nexora.local" } = {}) {
    const companyId = Number(automation?.company_id || 0);
    const schedule = isAutomationDue(automation, nowIso, force);
    if (!companyId || !schedule.due) return { ok: false, skipped: true, reason: schedule.reason || "not_due" };
    const lines = Array.isArray(automation.lines) && automation.lines.length
      ? automation.lines
      : db.prepare(`
          SELECT denumire, descriere, cantitate, unitate, pret_unitar, sort_order
          FROM accounting_invoice_automation_lines
          WHERE company_id=? AND automation_id=?
          ORDER BY sort_order ASC, id ASC
        `).all(companyId, automation.id);
    if (!lines.length) return { ok: false, skipped: true, reason: "no_lines" };

    let runId = 0;
    let facturaId = 0;
    let subtotal = 0;
    const invoiceDate = force ? nowIso : schedule.scheduledDate;
    const dueDate = addDaysIso(invoiceDate, automation.due_days || 0);

    try {
      const created = db.transaction(() => {
        const run = db.prepare(`
          INSERT INTO accounting_invoice_automation_runs (
            company_id, automation_id, period_label, scheduled_date, status, details
          )
          VALUES (?, ?, ?, ?, 'RUNNING', ?)
        `).run(companyId, automation.id, schedule.periodLabel, schedule.scheduledDate, "Generare factură recurentă pornită.");
        runId = Number(run.lastInsertRowid || 0);

        const temporaryNumber = `PENDING-AIF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const invoice = db.prepare(`
          INSERT INTO facturi (
            factura_nr, an, seq, client_id, contract_id, status, moneda,
            tva_procent, data_emitere, scadenta, observatii, company_id, created_at
          )
          VALUES (?, ?, 0, ?, ?, 'FACTURA_GENERATA', ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          temporaryNumber,
          Number(invoiceDate.slice(0, 4)),
          Number(automation.client_id || 0),
          Number(automation.contract_id || 0) || null,
          safeText(automation.currency) || "RON",
          Number(automation.vat_rate || 0),
          invoiceDate,
          dueDate,
          [
            `Factură generată automat din regula ${automation.automation_number || automation.name}.`,
            `Perioadă: ${schedule.periodLabel}.`,
            safeText(automation.notes)
          ].filter(Boolean).join(" "),
          companyId
        );
        facturaId = Number(invoice.lastInsertRowid || 0);
        db.prepare("UPDATE facturi SET factura_nr=? WHERE id=? AND company_id=?")
          .run(`DRAFT-${facturaId}`, facturaId, companyId);

        const insertLine = db.prepare(`
          INSERT INTO facturi_linii (
            factura_id, denumire, descriere, cantitate, unitate, pret_unitar, total_linie, sort_order, company_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const [index, line] of lines.entries()) {
          const quantity = positiveNumber(line.cantitate, 1) || 1;
          const unitPrice = positiveNumber(line.pret_unitar, 0);
          const lineTotal = quantity * unitPrice;
          subtotal += lineTotal;
          insertLine.run(
            facturaId,
            safeText(line.denumire),
            safeText(line.descriere),
            quantity,
            safeText(line.unitate) || "buc",
            unitPrice,
            lineTotal,
            Number(line.sort_order || index + 1),
            companyId
          );
        }

        const vatAmount = subtotal * Number(automation.vat_rate || 0);
        const total = subtotal + vatAmount;
        db.prepare(`
          UPDATE facturi
          SET subtotal=?, tva_valoare=?, total=?
          WHERE id=? AND company_id=?
        `).run(subtotal, vatAmount, total, facturaId, companyId);
        db.prepare(`
          UPDATE accounting_invoice_automation_runs
          SET factura_id=?, status='GENERATED', details=?, updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(facturaId, `Factura a fost generată pentru perioada ${schedule.periodLabel}.`, runId, companyId);
        return { runId, facturaId };
      })();

      runId = created.runId;
      facturaId = created.facturaId;
      if (typeof ensureOfficialInvoiceNumber === "function") {
        ensureOfficialInvoiceNumber(db, facturaId, { companyId, year: Number(invoiceDate.slice(0, 4)) });
      }

      db.prepare(`
        UPDATE accounting_invoice_automations
        SET last_generated_for=?,
            last_run_at=datetime('now'),
            last_error=NULL,
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(schedule.periodLabel, automation.id, companyId);

      if (Number(automation.auto_send_efactura || 0) === 1) {
        await sendInvoiceToEfactura({ facturaId, companyId, automationId: automation.id, runId });
      } else {
        db.prepare(`
          UPDATE accounting_invoice_automation_runs
          SET status='GENERATED',
              details=?,
              updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run("Factura a fost generată. Trimiterea e-Factura este dezactivată pentru această regulă.", runId, companyId);
      }

      return { ok: true, facturaId, runId, periodLabel: schedule.periodLabel };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Eroare generare factură.");
      if (/UNIQUE constraint failed/i.test(message)) {
        return { ok: false, skipped: true, reason: "already_generated", periodLabel: schedule.periodLabel };
      }
      if (runId) {
        db.prepare("UPDATE accounting_invoice_automation_runs SET status='ERROR', details=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
          .run(message, runId, companyId);
      }
      if (companyId && automation?.id) {
        db.prepare("UPDATE accounting_invoice_automations SET last_error=?, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND company_id=?")
          .run(message, automation.id, companyId);
      }
      return { ok: false, error: message };
    }
  }

  async function runDueInvoiceAutomations({ companyId = null, automationId = null, force = false, actorEmail = "system@nexora.local" } = {}) {
    const params = [];
    const where = ["UPPER(COALESCE(status,''))='ACTIVE'"];
    if (companyId) {
      where.push("company_id=?");
      params.push(Number(companyId));
    }
    if (automationId) {
      where.push("id=?");
      params.push(Number(automationId));
    }
    const automations = db.prepare(`
      SELECT *
      FROM accounting_invoice_automations
      WHERE ${where.join(" AND ")}
      ORDER BY company_id ASC, id ASC
      LIMIT 500
    `).all(...params);

    const results = [];
    const nowIso = currentDateIso();
    for (const row of automations) {
      const automation = invoiceAutomationWithLines(row.id, row.company_id);
      if (!automation) continue;
      results.push(await generateInvoiceForAutomation(automation, { nowIso, force, actorEmail }));
    }
    return results;
  }

  if (!globalThis.__nexoraAccountingInvoiceAutomationTimer && String(process.env.DISABLE_ACCOUNTING_INVOICE_AUTOMATION || "") !== "1") {
    globalThis.__nexoraAccountingInvoiceAutomationTimer = setInterval(() => {
      runDueInvoiceAutomations().catch((error) => {
        console.warn("[ACCOUNTING] invoice automation scheduler failed", String(error?.message || error));
      });
    }, 30 * 60 * 1000);
    setTimeout(() => {
      runDueInvoiceAutomations().catch((error) => {
        console.warn("[ACCOUNTING] invoice automation startup run failed", String(error?.message || error));
      });
    }, 45 * 1000);
  }

  app.get("/nexora/accounting", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const invoiceStats = db.prepare(`
      SELECT COUNT(*) AS total_count,
             IFNULL(SUM(total), 0) AS total_amount,
             SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS open_count
      FROM facturi
      WHERE company_id=?
    `).get(companyId) || {};
    const expenses = db.prepare(`
      SELECT COUNT(*) AS total_count, IFNULL(SUM(total), 0) AS total_amount
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};
    const declarations = db.prepare(`
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('DEPUSA', 'FINALIZATA', 'ANULATA') THEN 1 ELSE 0 END) AS open_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};
    const inbox = db.prepare(`
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS new_count
      FROM anaf_inbox
      WHERE company_id=?
    `).get(companyId) || {};
    const cash = db.prepare(`
      SELECT
        IFNULL(SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END), 0) AS in_amount,
        IFNULL(SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END), 0) AS out_amount,
        SUM(CASE WHEN direction='IN' THEN 1 ELSE 0 END) AS in_count,
        SUM(CASE WHEN direction='OUT' THEN 1 ELSE 0 END) AS out_count
      FROM accounting_cash_transactions
      WHERE company_id=?
    `).get(companyId) || {};
    const entries = db.prepare(`
      SELECT COUNT(*) AS total_count, IFNULL(SUM(amount),0) AS total_amount
      FROM accounting_entries
      WHERE company_id=?
    `).get(companyId) || {};
    const budgets = db.prepare(`
      SELECT COUNT(*) AS total_count, IFNULL(SUM(planned_amount),0) AS total_amount
      FROM accounting_budgets
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      currentPath: "/nexora/accounting",
      eyebrow: "Financiar & Contabilitate",
      title: "Contabilitate",
      description: "Hub Nexora pentru cheltuieli, plăți, încasări, registre, bugete, TVA, declarații și active fixe.",
      stats: [
        { icon: "C", label: "Cheltuieli", value: expenses.total_count || 0, hint: `${fmtMoney(expenses.total_amount || 0)} total` },
        { icon: "IN", label: "Încasări", value: cash.in_count || 0, hint: `${fmtMoney(cash.in_amount || 0)} total` },
        { icon: "OUT", label: "Plăți", value: cash.out_count || 0, hint: `${fmtMoney(cash.out_amount || 0)} total` },
        { icon: "REG", label: "Note contabile", value: entries.total_count || 0, hint: `${fmtMoney(entries.total_amount || 0)} rulaj` },
        { icon: "D", label: "Declarații deschise", value: declarations.open_count || 0 },
        { icon: "BUG", label: "Bugete", value: budgets.total_count || 0, hint: `${fmtMoney(budgets.total_amount || 0)} planificat` }
      ],
      links: [
        { label: "Cheltuieli", href: "/nexora/accounting/expenses" },
        { label: "Automatizare facturi", href: "/nexora/accounting/invoice-automation" },
        { label: "Declarații", href: "/nexora/accounting/declarations" },
        { label: "Plăți", href: "/nexora/accounting/payments" },
        { label: "Încasări", href: "/nexora/accounting/receipts" },
        { label: "Registre", href: "/nexora/accounting/registers" },
        { label: "Balanță", href: "/nexora/accounting/trial-balance" },
        { label: "Cashflow", href: "/nexora/accounting/cashflow" },
        { label: "Bugete", href: "/nexora/accounting/budgets" },
        { label: "Reconciliere bancară", href: "/nexora/accounting/bank-reconciliation" },
        { label: "TVA", href: "/nexora/accounting/vat" },
        { label: "Active fixe", href: "/nexora/accounting/fixed-assets" },
        { label: "Bonuri de consum", href: "/nexora/accounting/consumption" }
      ]
    }));
  });

  app.get("/nexora/accounting/invoice-automation", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT a.*,
             c.name AS client_name,
             c.cui AS client_cui,
             c.email AS client_email,
             ct.contract_number,
             ct.service_description AS contract_description,
             IFNULL((SELECT SUM(l.cantitate * l.pret_unitar) FROM accounting_invoice_automation_lines l WHERE l.company_id=a.company_id AND l.automation_id=a.id), 0) AS subtotal_template,
             (SELECT COUNT(*) FROM accounting_invoice_automation_lines l WHERE l.company_id=a.company_id AND l.automation_id=a.id) AS line_count,
             (SELECT COUNT(*) FROM accounting_invoice_automation_runs r WHERE r.company_id=a.company_id AND r.automation_id=a.id) AS run_count,
             (SELECT r.status FROM accounting_invoice_automation_runs r WHERE r.company_id=a.company_id AND r.automation_id=a.id ORDER BY r.id DESC LIMIT 1) AS last_run_status,
             (SELECT r.details FROM accounting_invoice_automation_runs r WHERE r.company_id=a.company_id AND r.automation_id=a.id ORDER BY r.id DESC LIMIT 1) AS last_run_details
      FROM accounting_invoice_automations a
      JOIN clients c ON c.id=a.client_id AND c.company_id=a.company_id
      LEFT JOIN contracts ct ON ct.id=a.contract_id AND ct.company_id=a.company_id
      WHERE a.company_id=? AND UPPER(COALESCE(a.status,'')) <> 'ARCHIVED'
      ORDER BY UPPER(COALESCE(a.status,''))='ACTIVE' DESC, a.id DESC
      LIMIT 500
    `).all(companyId).map((row) => {
      const schedule = monthlyScheduleFor(row, currentDateIso());
      const dueState = isAutomationDue(row, currentDateIso(), false);
      return {
        ...row,
        next_period_label: schedule.periodLabel,
        next_scheduled_date: schedule.scheduledDate,
        is_due_now: dueState.due ? 1 : 0
      };
    });

    const clients = db.prepare(`
      SELECT id, name, cui, email
      FROM clients
      WHERE company_id=? AND COALESCE(inactive,0)=0
      ORDER BY LOWER(name) ASC
      LIMIT 1000
    `).all(companyId);

    const contracts = db.prepare(`
      SELECT ct.id, ct.client_id, ct.contract_number, ct.service_description, ct.price, ct.duration, c.name AS client_name
      FROM contracts ct
      JOIN clients c ON c.id=ct.client_id AND c.company_id=ct.company_id
      WHERE ct.company_id=?
      ORDER BY ct.id DESC
      LIMIT 500
    `).all(companyId);

    const recentRuns = db.prepare(`
      SELECT r.*, a.automation_number, a.name AS automation_name, c.name AS client_name, f.factura_nr, f.total
      FROM accounting_invoice_automation_runs r
      JOIN accounting_invoice_automations a ON a.id=r.automation_id AND a.company_id=r.company_id
      LEFT JOIN clients c ON c.id=a.client_id AND c.company_id=a.company_id
      LEFT JOIN facturi f ON f.id=r.factura_id AND f.company_id=r.company_id
      WHERE r.company_id=?
      ORDER BY r.id DESC
      LIMIT 80
    `).all(companyId);

    const stats = {
      total: rows.length,
      active: rows.filter((row) => String(row.status || "").toUpperCase() === "ACTIVE").length,
      dueNow: rows.filter((row) => Number(row.is_due_now || 0) === 1 && String(row.status || "").toUpperCase() === "ACTIVE").length,
      sentEfactura: recentRuns.filter((row) => String(row.status || "").toUpperCase() === "SENT_EFACTURA").length
    };

    return res.type("html").send(renderNexoraAccountingInvoiceAutomationPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      clients,
      contracts,
      recentRuns,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || ""),
      err: String(req.query?.err || ""),
      generatedFacturaId: String(req.query?.factura_id || "")
    }));
  });

  app.get("/accounting/invoice-automation", requireAuth, (req, res) => {
    const query = String(req.url || "").includes("?") ? String(req.url || "").slice(String(req.url || "").indexOf("?")) : "";
    res.redirect(`/nexora/accounting/invoice-automation${query}`);
  });

  app.post("/nexora/accounting/invoice-automation/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const clientId = Number(req.body?.client_id || 0);
    const client = db.prepare("SELECT id FROM clients WHERE id=? AND company_id=? AND COALESCE(inactive,0)=0").get(clientId, companyId);
    if (!client) return res.redirect("/nexora/accounting/invoice-automation?err=client");
    const contractId = Number(req.body?.contract_id || 0) || null;
    if (contractId) {
      const contract = db.prepare("SELECT id FROM contracts WHERE id=? AND client_id=? AND company_id=?").get(contractId, clientId, companyId);
      if (!contract) return res.redirect("/nexora/accounting/invoice-automation?err=contract");
    }
    const lines = normalizeAutomationLines(req.body);
    if (!lines.length) return res.redirect("/nexora/accounting/invoice-automation?err=lines");

    const name = safeText(req.body?.name) || "Factură recurentă";
    const status = ["ACTIVE", "PAUSED", "DRAFT"].includes(safeText(req.body?.status).toUpperCase())
      ? safeText(req.body?.status).toUpperCase()
      : "ACTIVE";
    const startDate = parseDateFilter(req.body?.start_date) || currentDateIso();
    const endDate = parseDateFilter(req.body?.end_date) || null;

    db.transaction(() => {
      const inserted = db.prepare(`
        INSERT INTO accounting_invoice_automations (
          company_id, automation_number, client_id, contract_id, name, status, recurrence,
          issue_day, start_date, end_date, due_days, currency, vat_rate,
          auto_send_efactura, auto_generate_pdf, notes, created_by_email, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'MONTHLY', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))
      `).run(
        companyId,
        nextAccountingAutomationNumber(db, companyId),
        clientId,
        contractId,
        name,
        status,
        integerBetween(req.body?.issue_day, 1, 31, 1),
        startDate,
        endDate,
        integerBetween(req.body?.due_days, 0, 365, 15),
        safeText(req.body?.currency).toUpperCase() || "RON",
        normalizeVatRate(req.body?.vat_rate),
        safeText(req.body?.auto_send_efactura) === "1" ? 1 : 0,
        safeText(req.body?.notes),
        safeText(req.session.user.email).toLowerCase()
      );
      const automationId = Number(inserted.lastInsertRowid || 0);
      const insertLine = db.prepare(`
        INSERT INTO accounting_invoice_automation_lines (
          company_id, automation_id, denumire, descriere, cantitate, unitate, pret_unitar, sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const line of lines) {
        insertLine.run(companyId, automationId, line.denumire, line.descriere, line.cantitate, line.unitate, line.pret_unitar, line.sort_order);
      }
    })();

    res.redirect("/nexora/accounting/invoice-automation?ok=created");
  });

  app.post("/nexora/accounting/invoice-automation/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const status = ["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"].includes(safeText(req.body?.status).toUpperCase())
      ? safeText(req.body?.status).toUpperCase()
      : "PAUSED";
    db.prepare(`
      UPDATE accounting_invoice_automations
      SET status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, id, companyId);
    res.redirect("/nexora/accounting/invoice-automation?ok=status");
  });

  app.post("/nexora/accounting/invoice-automation/:id/run", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const automation = invoiceAutomationWithLines(id, companyId);
    if (!automation) return res.redirect("/nexora/accounting/invoice-automation?err=missing");
    const result = await generateInvoiceForAutomation(automation, {
      nowIso: currentDateIso(),
      force: true,
      actorEmail: safeText(req.session.user.email).toLowerCase()
    });
    if (result.ok) return res.redirect(`/nexora/accounting/invoice-automation?ok=run&factura_id=${encodeURIComponent(result.facturaId)}`);
    if (result.reason === "already_generated") return res.redirect("/nexora/accounting/invoice-automation?err=already");
    if (result.reason === "no_lines") return res.redirect("/nexora/accounting/invoice-automation?err=lines");
    return res.redirect("/nexora/accounting/invoice-automation?err=run");
  });

  app.get("/nexora/accounting/expenses", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const search = String(req.query?.search || "").trim();
    const paymentStatus = String(req.query?.payment_status || "").trim().toUpperCase();
    const category = String(req.query?.category || "").trim().toUpperCase();

    const where = ["company_id=?"];
    const params = [companyId];
    if (paymentStatus) {
      where.push("UPPER(COALESCE(payment_status,''))=?");
      params.push(paymentStatus);
    }
    if (category) {
      where.push("UPPER(COALESCE(category,''))=?");
      params.push(category);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(doc_number,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, expense_type, category, supplier_name, supplier_cui, doc_number, issue_date, due_date,
             payment_status, deductible_percent, currency, subtotal, vat_amount, total, attachment_path
      FROM accounting_expenses
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))='PLATITA' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))<>'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingExpensesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || ""),
      filters: { search, paymentStatus, category }
    }));
  });

  app.get("/nexora/accounting/declarations", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const typeFilter = String(req.query?.type || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim();
    const where = ["company_id=?"];
    const params = [companyId];

    if (statusFilter) {
      where.push("UPPER(COALESCE(status,''))=?");
      params.push(statusFilter);
    }
    if (typeFilter) {
      where.push("UPPER(COALESCE(declaration_type,''))=?");
      params.push(typeFilter);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(period_label,'')) LIKE ? OR LOWER(COALESCE(reference_number,'')) LIKE ? OR LOWER(COALESCE(declaration_type,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, declaration_type, period_label, period_start, period_end, due_date, status, submission_channel,
             reference_number, attachment_path, receipt_path, created_at, updated_at
      FROM accounting_declarations
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(due_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PREGATITA' THEN 1 ELSE 0 END) AS pregatita_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1 ELSE 0 END) AS trimisa_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='VALIDATA' THEN 1 ELSE 0 END) AS validata_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS respinsa_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingDeclarationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      ok: String(req.query?.ok || ""),
      filters: { statusFilter, typeFilter, search },
      declarationCatalog: DECLARATION_CATALOG
    }));
  });

  app.get("/nexora/accounting/declarations/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const row = db.prepare(`
      SELECT *
      FROM accounting_declarations
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!row) return res.status(404).send("Declarație inexistentă");

    return res.type("html").send(renderNexoraAccountingDeclarationDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      row,
      ok: String(req.query?.ok || "")
    }));
  });

  function renderCashTransactions(req, res, direction) {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildPeriodFilter(req.query);
    const where = ["company_id=?", "direction=?"];
    const params = [companyId, direction];
    addPeriodWhere({ where, params, dateExpression: "COALESCE(transaction_date, created_at)", filters });
    if (filters.status) {
      where.push("UPPER(COALESCE(status,''))=?");
      params.push(filters.status);
    }
    if (filters.search) {
      const like = `%${filters.search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(partner_name,'')) LIKE ? OR LOWER(COALESCE(partner_cui,'')) LIKE ? OR LOWER(COALESCE(document_number,'')) LIKE ? OR LOWER(COALESCE(reference,'')) LIKE ? OR LOWER(COALESCE(category,'')) LIKE ?)");
      params.push(like, like, like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, direction, transaction_date, partner_name, partner_cui, document_type, document_number,
             category, payment_method, bank_account, amount, vat_amount, currency, reference, status,
             matched_document_type, matched_document_id, notes, attachment_path, created_at
      FROM accounting_cash_transactions
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(transaction_date, created_at)) DESC, id DESC
      LIMIT 250
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(amount),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('CONFIRMATA','RECONCILIATA') THEN 1 ELSE 0 END) AS confirmed_count,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('CONFIRMATA','RECONCILIATA') THEN 1 ELSE 0 END) AS open_count
      FROM accounting_cash_transactions
      WHERE company_id=? AND direction=?
    `).get(companyId, direction) || {};

    return res.type("html").send(renderNexoraAccountingTransactionsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      direction,
      rows,
      stats,
      filters,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  }

  app.get("/nexora/accounting/payments", requireAuth, (req, res) => renderCashTransactions(req, res, "OUT"));
  app.get("/nexora/accounting/receipts", requireAuth, (req, res) => renderCashTransactions(req, res, "IN"));

  function createCashTransaction(req, res, direction) {
    const companyId = Number(req.session.user.company_id || 0);
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: req.file, folderName: "cash" });
    const finalDirection = direction === "IN" ? "IN" : "OUT";
    db.prepare(`
      INSERT INTO accounting_cash_transactions (
        company_id, direction, transaction_date, partner_name, partner_cui, document_type, document_number,
        category, payment_method, bank_account, amount, vat_amount, currency, reference, status, notes,
        attachment_path, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      finalDirection,
      String(req.body?.transaction_date || "").trim() || currentDateIso(),
      String(req.body?.partner_name || "").trim(),
      String(req.body?.partner_cui || "").trim(),
      String(req.body?.document_type || "").trim().toUpperCase(),
      String(req.body?.document_number || "").trim(),
      String(req.body?.category || "").trim().toUpperCase(),
      String(req.body?.payment_method || "BANCA").trim().toUpperCase(),
      String(req.body?.bank_account || "").trim(),
      moneyInput(req.body?.amount),
      moneyInput(req.body?.vat_amount),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      String(req.body?.reference || "").trim(),
      normalizeAccountingStatus(req.body?.status),
      String(req.body?.notes || "").trim(),
      attachmentPath || null,
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect(finalDirection === "IN" ? "/nexora/accounting/receipts?ok=created" : "/nexora/accounting/payments?ok=created");
  }

  app.post("/nexora/accounting/payments/create", requireAuth, upload.single("attachment"), (req, res) => createCashTransaction(req, res, "OUT"));
  app.post("/nexora/accounting/receipts/create", requireAuth, upload.single("attachment"), (req, res) => createCashTransaction(req, res, "IN"));

  app.get("/nexora/accounting/registers", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildPeriodFilter(req.query);
    const where = ["company_id=?"];
    const params = [companyId];
    addPeriodWhere({ where, params, dateExpression: "COALESCE(entry_date, created_at)", filters });
    if (filters.search) {
      const like = `%${filters.search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(document_type,'')) LIKE ? OR LOWER(COALESCE(document_number,'')) LIKE ? OR LOWER(COALESCE(partner_name,'')) LIKE ? OR LOWER(COALESCE(account_debit,'')) LIKE ? OR LOWER(COALESCE(account_credit,'')) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ?)");
      params.push(like, like, like, like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, entry_date, document_type, document_number, partner_name, account_debit, account_credit,
             amount, currency, tax_code, description, source_type, created_at
      FROM accounting_entries
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(entry_date, created_at)) DESC, id DESC
      LIMIT 300
    `).all(...params);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total_count,
             IFNULL(SUM(amount),0) AS debit_total,
             IFNULL(SUM(amount),0) AS credit_total,
             SUM(CASE WHEN UPPER(COALESCE(source_type,''))='MANUAL' THEN 1 ELSE 0 END) AS manual_count
      FROM accounting_entries
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingRegistersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      filters,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/accounting/registers/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    db.prepare(`
      INSERT INTO accounting_entries (
        company_id, entry_date, document_type, document_number, partner_name,
        account_debit, account_credit, amount, currency, tax_code, description,
        source_type, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.entry_date || "").trim() || currentDateIso(),
      String(req.body?.document_type || "").trim().toUpperCase(),
      String(req.body?.document_number || "").trim(),
      String(req.body?.partner_name || "").trim(),
      String(req.body?.account_debit || "").trim(),
      String(req.body?.account_credit || "").trim(),
      moneyInput(req.body?.amount),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      String(req.body?.tax_code || "").trim().toUpperCase(),
      String(req.body?.description || "").trim(),
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect("/nexora/accounting/registers?ok=created");
  });

  app.get("/nexora/accounting/trial-balance", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildPeriodFilter(req.query);
    const where = ["company_id=?"];
    const params = [companyId];
    addPeriodWhere({ where, params, dateExpression: "COALESCE(entry_date, created_at)", filters });
    const whereSql = where.join(" AND ");

    const debitRows = db.prepare(`
      SELECT account_debit AS account, IFNULL(SUM(amount),0) AS debit_turnover
      FROM accounting_entries
      WHERE ${whereSql}
      GROUP BY account_debit
    `).all(...params);
    const creditRows = db.prepare(`
      SELECT account_credit AS account, IFNULL(SUM(amount),0) AS credit_turnover
      FROM accounting_entries
      WHERE ${whereSql}
      GROUP BY account_credit
    `).all(...params);

    const byAccount = new Map();
    for (const row of debitRows) {
      const account = String(row.account || "").trim() || "-";
      byAccount.set(account, { account, debit_turnover: Number(row.debit_turnover || 0), credit_turnover: 0 });
    }
    for (const row of creditRows) {
      const account = String(row.account || "").trim() || "-";
      const current = byAccount.get(account) || { account, debit_turnover: 0, credit_turnover: 0 };
      current.credit_turnover = Number(row.credit_turnover || 0);
      byAccount.set(account, current);
    }
    const balances = Array.from(byAccount.values()).sort((a, b) => a.account.localeCompare(b.account, "ro")).map((row) => {
      const net = Number(row.debit_turnover || 0) - Number(row.credit_turnover || 0);
      return {
        ...row,
        debit_balance: net > 0 ? net : 0,
        credit_balance: net < 0 ? Math.abs(net) : 0
      };
    });
    const totals = balances.reduce((acc, row) => {
      acc.debit_turnover += Number(row.debit_turnover || 0);
      acc.credit_turnover += Number(row.credit_turnover || 0);
      acc.debit_balance += Number(row.debit_balance || 0);
      acc.credit_balance += Number(row.credit_balance || 0);
      return acc;
    }, { debit_turnover: 0, credit_turnover: 0, debit_balance: 0, credit_balance: 0 });

    return res.type("html").send(renderNexoraAccountingTrialBalancePage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      balances,
      totals,
      filters,
      fmtMoney
    }));
  });

  app.get("/nexora/accounting/cashflow", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const summary = db.prepare(`
      SELECT substr(COALESCE(transaction_date, created_at), 1, 7) AS period,
             IFNULL(SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END),0) AS in_amount,
             IFNULL(SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END),0) AS out_amount,
             COUNT(*) AS total_count
      FROM accounting_cash_transactions
      WHERE company_id=?
      GROUP BY period
      ORDER BY period DESC
      LIMIT 12
    `).all(companyId);
    const recent = db.prepare(`
      SELECT id, direction, transaction_date, partner_name, category, amount, currency, status
      FROM accounting_cash_transactions
      WHERE company_id=?
      ORDER BY date(COALESCE(transaction_date, created_at)) DESC, id DESC
      LIMIT 20
    `).all(companyId);
    const totals = db.prepare(`
      SELECT COUNT(*) AS total_count,
             IFNULL(SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END),0) AS in_amount,
             IFNULL(SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END),0) AS out_amount
      FROM accounting_cash_transactions
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingCashflowPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      summary,
      recent,
      totals,
      fmtMoney
    }));
  });

  app.get("/nexora/accounting/budgets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT b.*,
             IFNULL((
               SELECT SUM(t.amount)
               FROM accounting_cash_transactions t
               WHERE t.company_id=b.company_id
                 AND date(COALESCE(t.transaction_date, t.created_at)) BETWEEN date(b.period_start) AND date(b.period_end)
                 AND UPPER(COALESCE(t.category,'')) = UPPER(COALESCE(b.category,''))
                 AND t.direction = CASE WHEN UPPER(COALESCE(b.budget_type,''))='VENIT' THEN 'IN' ELSE 'OUT' END
             ), 0) AS actual_amount
      FROM accounting_budgets b
      WHERE b.company_id=?
      ORDER BY date(b.period_start) DESC, b.id DESC
      LIMIT 200
    `).all(companyId);
    const totals = rows.reduce((acc, row) => {
      acc.planned_amount += Number(row.planned_amount || 0);
      acc.actual_amount += Number(row.actual_amount || 0);
      return acc;
    }, { planned_amount: 0, actual_amount: 0 });

    return res.type("html").send(renderNexoraAccountingBudgetsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      totals,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/accounting/budgets/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    db.prepare(`
      INSERT INTO accounting_budgets (
        company_id, period_label, period_start, period_end, budget_type, category,
        planned_amount, currency, owner, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.period_label || "").trim(),
      String(req.body?.period_start || "").trim() || currentDateIso(),
      String(req.body?.period_end || "").trim() || currentDateIso(),
      String(req.body?.budget_type || "CHELTUIALA").trim().toUpperCase(),
      String(req.body?.category || "").trim().toUpperCase(),
      moneyInput(req.body?.planned_amount),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      String(req.body?.owner || "").trim(),
      String(req.body?.notes || "").trim(),
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect("/nexora/accounting/budgets?ok=created");
  });

  app.get("/nexora/accounting/bank-reconciliation", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT id, bank_name, account_iban, transaction_date, value_date, direction, partner_name,
             description, reference, amount, currency, reconciliation_status, matched_cash_transaction_id, notes
      FROM accounting_bank_transactions
      WHERE company_id=?
      ORDER BY date(COALESCE(transaction_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(companyId);
    const candidates = db.prepare(`
      SELECT id, direction, transaction_date, partner_name, amount, currency
      FROM accounting_cash_transactions
      WHERE company_id=?
        AND UPPER(COALESCE(status,'')) <> 'RECONCILIATA'
      ORDER BY date(COALESCE(transaction_date, created_at)) DESC, id DESC
      LIMIT 80
    `).all(companyId);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN UPPER(COALESCE(reconciliation_status,''))='RECONCILIATA' THEN 1 ELSE 0 END) AS matched_count,
             SUM(CASE WHEN UPPER(COALESCE(reconciliation_status,''))<>'RECONCILIATA' THEN 1 ELSE 0 END) AS open_count
      FROM accounting_bank_transactions
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingBankReconciliationPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      candidates,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/accounting/bank-reconciliation/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    db.prepare(`
      INSERT INTO accounting_bank_transactions (
        company_id, bank_name, account_iban, transaction_date, value_date, direction,
        partner_name, description, reference, amount, currency, reconciliation_status,
        notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NECORELATA', ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.bank_name || "").trim(),
      String(req.body?.account_iban || "").trim(),
      String(req.body?.transaction_date || "").trim() || currentDateIso(),
      String(req.body?.value_date || "").trim() || null,
      String(req.body?.direction || "OUT").trim().toUpperCase() === "IN" ? "IN" : "OUT",
      String(req.body?.partner_name || "").trim(),
      String(req.body?.description || "").trim(),
      String(req.body?.reference || "").trim(),
      moneyInput(req.body?.amount),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      String(req.body?.notes || "").trim(),
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect("/nexora/accounting/bank-reconciliation?ok=created");
  });

  app.post("/nexora/accounting/bank-reconciliation/:id/match", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const bankId = Number(req.params.id || 0);
    const cashId = Number(req.body?.cash_transaction_id || 0);
    const bankRow = db.prepare(`SELECT id FROM accounting_bank_transactions WHERE id=? AND company_id=?`).get(bankId, companyId);
    if (!bankRow) return res.status(404).send("Tranzacția bancară nu există.");

    if (!cashId) {
      db.prepare(`
        UPDATE accounting_bank_transactions
        SET reconciliation_status='NECORELATA', matched_cash_transaction_id=NULL, updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(bankId, companyId);
      return res.redirect("/nexora/accounting/bank-reconciliation?ok=updated");
    }

    const cashRow = db.prepare(`SELECT id FROM accounting_cash_transactions WHERE id=? AND company_id=?`).get(cashId, companyId);
    if (!cashRow) return res.status(404).send("Tranzacția cash nu există.");

    db.exec("BEGIN");
    try {
      db.prepare(`
        UPDATE accounting_bank_transactions
        SET reconciliation_status='RECONCILIATA', matched_cash_transaction_id=?, updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(cashId, bankId, companyId);
      db.prepare(`
        UPDATE accounting_cash_transactions
        SET status='RECONCILIATA', updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(cashId, companyId);
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      return res.status(500).send(`Reconcilierea nu a putut fi salvată: ${String(error?.message || error)}`);
    }
    res.redirect("/nexora/accounting/bank-reconciliation?ok=updated");
  });

  app.get("/nexora/accounting/vat", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildPeriodFilter(req.query);
    const invoiceWhere = ["f.company_id=?"];
    const invoiceParams = [companyId];
    addPeriodWhere({ where: invoiceWhere, params: invoiceParams, dateExpression: "COALESCE(f.data_emitere, f.created_at)", filters });
    const expenseWhere = ["company_id=?"];
    const expenseParams = [companyId];
    addPeriodWhere({ where: expenseWhere, params: expenseParams, dateExpression: "COALESCE(issue_date, created_at)", filters });

    const outputRows = db.prepare(`
      SELECT COALESCE(f.data_emitere, f.created_at) AS doc_date,
             'TVA colectată' AS source,
             c.name AS partner_name,
             f.factura_nr AS doc_number,
             f.subtotal AS base_amount,
             f.tva_valoare AS vat_amount,
             'TVA19' AS tax_code
      FROM facturi f
      JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
      WHERE ${invoiceWhere.join(" AND ")}
      ORDER BY date(COALESCE(f.data_emitere, f.created_at)) DESC, f.id DESC
      LIMIT 300
    `).all(...invoiceParams);
    const inputRows = db.prepare(`
      SELECT COALESCE(issue_date, created_at) AS doc_date,
             'TVA deductibilă' AS source,
             supplier_name AS partner_name,
             doc_number,
             subtotal AS base_amount,
             vat_amount,
             'TVA deductibilă' AS tax_code
      FROM accounting_expenses
      WHERE ${expenseWhere.join(" AND ")}
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 300
    `).all(...expenseParams);
    const rows = [...outputRows, ...inputRows]
      .sort((a, b) => String(b.doc_date || "").localeCompare(String(a.doc_date || "")))
      .slice(0, 500);
    const stats = {
      output_vat: outputRows.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0),
      input_vat: inputRows.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0)
    };

    return res.type("html").send(renderNexoraAccountingVatPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      filters,
      fmtMoney
    }));
  });

  app.get("/nexora/accounting/fixed-assets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const today = currentDateIso();
    const rows = db.prepare(`
      SELECT id, asset_code, asset_name, category, purchase_date, purchase_value, status, supplier_name,
             invoice_number, useful_life_months, residual_value, depreciation_method
      FROM inventory_assets
      WHERE company_id=? AND UPPER(COALESCE(asset_type,''))='MIJLOC_FIX'
      ORDER BY date(COALESCE(purchase_date, created_at)) DESC, id DESC
      LIMIT 250
    `).all(companyId).map((row) => {
      const usefulLife = Math.max(1, Number(row.useful_life_months || 36));
      const depreciable = Math.max(0, Number(row.purchase_value || 0) - Number(row.residual_value || 0));
      const monthly = depreciable / usefulLife;
      const elapsed = Math.min(usefulLife, monthsBetween(row.purchase_date, today));
      const accumulated = Math.min(depreciable, monthly * elapsed);
      return {
        ...row,
        monthly_depreciation: monthly,
        accumulated_depreciation: accumulated,
        net_value: Math.max(0, Number(row.purchase_value || 0) - accumulated)
      };
    });
    const stats = rows.reduce((acc, row) => {
      acc.total_count += 1;
      acc.purchase_value += Number(row.purchase_value || 0);
      acc.monthly_depreciation += Number(row.monthly_depreciation || 0);
      acc.net_value += Number(row.net_value || 0);
      return acc;
    }, { total_count: 0, purchase_value: 0, monthly_depreciation: 0, net_value: 0 });

    return res.type("html").send(renderNexoraAccountingFixedAssetsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/accounting/fixed-assets/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    db.prepare(`
      INSERT INTO inventory_assets (
        company_id, asset_code, asset_name, category, asset_type, unit, quantity_scriptic,
        minimum_quantity, location, purchase_date, purchase_value, status, supplier_name,
        invoice_number, useful_life_months, residual_value, depreciation_method, notes,
        created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, 'MIJLOC_FIX', 'buc', 1, 0, ?, ?, ?, 'IN_STOC', ?, ?, ?, ?, 'LINIARA', ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.asset_code || "").trim(),
      String(req.body?.asset_name || "").trim(),
      String(req.body?.category || "IMOBILIZARI").trim().toUpperCase(),
      String(req.body?.location || "").trim(),
      String(req.body?.purchase_date || "").trim() || currentDateIso(),
      moneyInput(req.body?.purchase_value),
      String(req.body?.supplier_name || "").trim(),
      String(req.body?.invoice_number || "").trim(),
      Math.max(1, Number(req.body?.useful_life_months || 36)),
      moneyInput(req.body?.residual_value),
      String(req.body?.notes || "").trim(),
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect("/nexora/accounting/fixed-assets?ok=created");
  });

  app.get("/nexora/accounting/consumption", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const products = db.prepare(`
      SELECT id, code, name, unit, price
      FROM products
      WHERE company_id=? AND active=1
      ORDER BY name COLLATE NOCASE ASC
    `).all(companyId);
    const vouchers = db.prepare(`
      SELECT cv.id, cv.voucher_number, cv.issue_date, cv.department, cv.issued_to, cv.notes,
             IFNULL(SUM(cvi.line_total), 0) AS total_amount,
             COUNT(cvi.id) AS items_count
      FROM consumption_vouchers cv
      LEFT JOIN consumption_voucher_items cvi ON cvi.voucher_id = cv.id
      WHERE cv.company_id=?
      GROUP BY cv.id
      ORDER BY date(cv.issue_date) DESC, cv.id DESC
      LIMIT 150
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT cv.id) AS total_count,
        IFNULL(SUM(cvi.line_total),0) AS total_amount,
        COUNT(DISTINCT CASE WHEN substr(COALESCE(cv.issue_date, cv.created_at, ''), 1, 7)=strftime('%Y-%m','now') THEN cv.id END) AS month_count
      FROM consumption_vouchers cv
      LEFT JOIN consumption_voucher_items cvi ON cvi.voucher_id=cv.id
      WHERE cv.company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingConsumptionPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      products,
      vouchers,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/accounting/consumption/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const productIds = Array.isArray(req.body?.product_id) ? req.body.product_id : [req.body?.product_id];
    const quantities = Array.isArray(req.body?.qty) ? req.body.qty : [req.body?.qty];
    const units = Array.isArray(req.body?.unit) ? req.body.unit : [req.body?.unit];
    const unitCosts = Array.isArray(req.body?.unit_cost) ? req.body.unit_cost : [req.body?.unit_cost];
    const items = [];

    for (let index = 0; index < productIds.length; index += 1) {
      const productId = Number(productIds[index] || 0);
      const qty = moneyInput(quantities[index]);
      if (!productId || qty <= 0) continue;
      const product = db.prepare(`SELECT id, name, unit, price FROM products WHERE id=? AND company_id=?`).get(productId, companyId);
      if (!product) continue;
      const unit = String(units[index] || product.unit || "buc").trim();
      const unitCost = moneyInput(unitCosts[index] || product.price || 0);
      items.push({
        productId,
        productName: product.name,
        unit,
        qty,
        unitCost,
        lineTotal: qty * unitCost
      });
    }

    if (!items.length) return res.status(400).send("Adaugă cel puțin o poziție în bon.");

    db.exec("BEGIN");
    try {
      const voucherResult = db.prepare(`
        INSERT INTO consumption_vouchers (company_id, voucher_number, issue_date, department, issued_to, notes, created_by_email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        String(req.body?.voucher_number || "").trim(),
        String(req.body?.issue_date || "").trim() || currentDateIso(),
        String(req.body?.department || "").trim(),
        String(req.body?.issued_to || "").trim(),
        String(req.body?.notes || "").trim(),
        String(req.session.user.email || "").trim().toLowerCase()
      );
      const voucherId = Number(voucherResult.lastInsertRowid);
      const insertItem = db.prepare(`
        INSERT INTO consumption_voucher_items (voucher_id, product_id, product_name, qty, unit, unit_cost, line_total, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(voucherId, item.productId, item.productName, item.qty, item.unit, item.unitCost, item.lineTotal, companyId);
      }
      db.exec("COMMIT");
      res.redirect(`/nexora/accounting/consumption/${voucherId}?ok=created`);
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      res.status(500).send(`Bonul de consum nu a putut fi salvat: ${String(error?.message || error)}`);
    }
  });

  app.get("/nexora/accounting/consumption/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const voucher = db.prepare(`
      SELECT id, voucher_number, issue_date, department, issued_to, notes, created_by_email, created_at
      FROM consumption_vouchers
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!voucher) return res.status(404).send("Bon inexistent");
    const items = db.prepare(`
      SELECT product_name, qty, unit, unit_cost, line_total
      FROM consumption_voucher_items
      WHERE voucher_id=? AND company_id=?
      ORDER BY id ASC
    `).all(id, companyId);

    return res.type("html").send(renderNexoraAccountingConsumptionDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      voucher,
      items,
      fmtMoney
    }));
  });

  app.get("/accounting/export/facturi.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildInvoiceFilterState(req.query);
    const { whereSql, params } = buildInvoiceWhereClause(filters, companyId);

    const rows = db.prepare(`
      SELECT
        f.factura_nr,
        c.name AS client_name,
        c.cui AS client_cui,
        f.status,
        f.efactura_status,
        f.data_emitere,
        f.scadenta,
        f.moneda,
        f.subtotal,
        f.tva_valoare,
        f.total,
        f.efactura_upload_index,
        f.efactura_download_id,
        f.efactura_last_error
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE ${whereSql}
      ORDER BY date(COALESCE(f.data_emitere, f.created_at)) DESC, f.id DESC
      LIMIT 5000
    `).all(...params);

    const header = [
      "factura_nr",
      "client_name",
      "client_cui",
      "status",
      "efactura_status",
      "data_emitere",
      "scadenta",
      "moneda",
      "subtotal",
      "tva_valoare",
      "total",
      "efactura_upload_index",
      "efactura_download_id",
      "efactura_last_error"
    ].join(",");

    const csv = [
      header,
      ...rows.map((row) => [
        row.factura_nr,
        row.client_name,
        row.client_cui,
        row.status,
        row.efactura_status,
        row.data_emitere,
        row.scadenta,
        row.moneda,
        fmtMoney(row.subtotal),
        fmtMoney(row.tva_valoare),
        fmtMoney(row.total),
        row.efactura_upload_index,
        row.efactura_download_id,
        row.efactura_last_error
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="accounting-facturi.csv"');
    res.send(csv);
  });

  app.get("/accounting/export/reconciliere.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);

    const rows = db.prepare(`
      SELECT
        bp.id,
        bp.source,
        bp.status,
        bp.amount,
        bp.currency,
        bp.payer_name,
        bp.payer_email,
        bp.reference_code,
        bp.paid_at,
        bp.created_at,
        bp.generated_factura_id,
        bp.invoice_generation_status,
        f.factura_nr,
        f.status AS factura_status,
        f.total AS factura_total
      FROM billing_payments bp
      LEFT JOIN facturi f ON f.id = bp.generated_factura_id
      WHERE bp.company_id=?
      ORDER BY datetime(COALESCE(bp.paid_at, bp.created_at)) DESC, bp.id DESC
      LIMIT 5000
    `).all(companyId);

    const header = [
      "payment_id",
      "source",
      "payment_status",
      "amount",
      "currency",
      "payer_name",
      "payer_email",
      "reference_code",
      "paid_at",
      "created_at",
      "generated_factura_id",
      "invoice_generation_status",
      "factura_nr",
      "factura_status",
      "factura_total",
      "reconciliation_status"
    ].join(",");

    function reconciliationStatus(row) {
      const paymentStatus = String(row?.status || "").trim().toLowerCase();
      const facturaStatus = String(row?.factura_status || "").trim().toUpperCase();
      const hasInvoice = Number(row?.generated_factura_id || 0) > 0;

      if (paymentStatus === "paid" && hasInvoice && facturaStatus === "INCASATA") return "reconciliat";
      if (paymentStatus === "paid" && hasInvoice) return "plata_confirmata_factura_neincasata";
      if (paymentStatus === "paid" && !hasInvoice) return "plata_fara_factura";
      if (hasInvoice) return "factura_legata_plata_in_curs";
      return "de_verificat";
    }

    const csv = [
      header,
      ...rows.map((row) => [
        row.id,
        row.source,
        row.status,
        fmtMoney(row.amount),
        String(row.currency || "").toUpperCase(),
        row.payer_name,
        row.payer_email,
        row.reference_code,
        row.paid_at,
        row.created_at,
        row.generated_factura_id,
        row.invoice_generation_status,
        row.factura_nr,
        row.factura_status,
        fmtMoney(row.factura_total),
        reconciliationStatus(row)
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="accounting-reconciliere.csv"');
    res.send(csv);
  });

  app.get("/accounting/export/inbox-spv.csv", requireAuth, requireSpvAccess, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildInboxFilterState(req.query);
    const { whereSql, params } = buildInboxWhereClause(filters, companyId);

    const rows = db.prepare(`
      SELECT
        id,
        supplier_name,
        supplier_cui,
        invoice_number,
        message_type,
        details,
        download_id,
        zip_path,
        xml_path,
        pdf_path,
        received_at,
        created_at,
        processed
      FROM anaf_inbox
      WHERE ${whereSql}
      ORDER BY datetime(COALESCE(received_at, created_at)) DESC, id DESC
      LIMIT 5000
    `).all(...params);

    const header = [
      "id",
      "supplier_name",
      "supplier_cui",
      "invoice_number",
      "message_type",
      "details",
      "download_id",
      "received_at",
      "created_at",
      "processed",
      "zip_path",
      "xml_path",
      "pdf_path"
    ].join(",");

    const csv = [
      header,
      ...rows.map((row) => [
        row.id,
        row.supplier_name,
        row.supplier_cui,
        row.invoice_number,
        row.message_type,
        row.details,
        row.download_id,
        row.received_at,
        row.created_at,
        Number(row.processed) ? "1" : "0",
        row.zip_path,
        row.xml_path,
        row.pdf_path
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="accounting-inbox-spv.csv"');
    res.send(csv);
  });

  app.get("/accounting/expenses", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const search = String(req.query?.search || "").trim();
    const paymentStatus = String(req.query?.payment_status || "").trim().toUpperCase();
    const category = String(req.query?.category || "").trim().toUpperCase();

    const where = ["company_id=?"];
    const params = [companyId];
    if (paymentStatus) {
      where.push("UPPER(COALESCE(payment_status,''))=?");
      params.push(paymentStatus);
    }
    if (category) {
      where.push("UPPER(COALESCE(category,''))=?");
      params.push(category);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(doc_number,'')) LIKE ?)");
      params.push(like, like, like);
    }
    const whereSql = where.join(" AND ");

    const rows = db.prepare(`
      SELECT id, expense_type, category, supplier_name, supplier_cui, doc_number, issue_date, due_date,
             payment_status, deductible_percent, currency, subtotal, vat_amount, total, attachment_path
      FROM accounting_expenses
      WHERE ${whereSql}
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))='PLATITA' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))<>'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};

    const rowsHtml = rows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.supplier_name || "—")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.supplier_cui || "—")}</div>
        </td>
        <td>${escapeHtml(row.doc_number || "—")}</td>
        <td>${escapeHtml(row.category || row.expense_type || "—")}</td>
        <td>${row.payment_status === "PLATITA" ? `<span class="crm-badge crm-badge-green">plătită</span>` : `<span class="crm-badge crm-badge-amber">${escapeHtml((row.payment_status || "neplătită").toLowerCase())}</span>`}</td>
        <td>${escapeHtml(row.issue_date || "—")}</td>
        <td>${escapeHtml(row.due_date || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.currency || "RON"))}</td>
        <td>${row.attachment_path ? `<a href="/${encodeURI(row.attachment_path)}" target="_blank">Document</a>` : `<span class="crm-muted">—</span>`}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Cheltuieli</title></head>
${crmShellStart("accounting-expenses", "Cheltuieli", "Înregistrare cheltuieli, facturi de furnizor și documente justificative.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Adaugă cheltuială</h3>
        <div class="crm-muted" style="margin-top:6px">Poți înregistra facturi de furnizor, bonuri fiscale și alte documente de cheltuială.</div>
      </div>
      <form method="post" action="/accounting/expenses/create" enctype="multipart/form-data" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Tip document</label><select class="crm-input" name="expense_type"><option value="FACTURA">Factură furnizor</option><option value="BON_FISCAL">Bon fiscal</option><option value="CHITANTA">Chitanță</option><option value="DECONT">Decont</option><option value="ALTA">Alta</option></select></div>
          <div><label class="crm-label">Categorie</label><select class="crm-input" name="category"><option value="UTILITATI">Utilități</option><option value="CHIRIE">Chirie</option><option value="MATERIALE">Materiale</option><option value="PROTOCOL">Protocol</option><option value="TRANSPORT">Transport</option><option value="SERVICII">Servicii</option><option value="SALARII">Salarii</option><option value="TAXE">Taxe</option><option value="ALTELE">Altele</option></select></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Furnizor</label><input class="crm-input" name="supplier_name" required></div>
          <div><label class="crm-label">CUI furnizor</label><input class="crm-input" name="supplier_cui"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Număr document</label><input class="crm-input" name="doc_number"></div>
          <div><label class="crm-label">Status plată</label><select class="crm-input" name="payment_status"><option value="NEPLATITA">Neplătită</option><option value="PLATITA">Plătită</option><option value="PARTIALA">Parțială</option></select></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Data emitere</label><input class="crm-input" type="date" name="issue_date"></div>
          <div><label class="crm-label">Scadență</label><input class="crm-input" type="date" name="due_date"></div>
        </div>
        <div class="crm-grid-4" style="overflow:visible">
          <div><label class="crm-label">Subtotal</label><input class="crm-input" name="subtotal" value="0"></div>
          <div><label class="crm-label">TVA</label><input class="crm-input" name="vat_amount" value="0"></div>
          <div><label class="crm-label">Total</label><input class="crm-input" name="total" value="0"></div>
          <div><label class="crm-label">Deductibil %</label><input class="crm-input" name="deductible_percent" value="100"></div>
        </div>
        <div><label class="crm-label">Document</label><input class="crm-input" type="file" name="attachment"></div>
        <div><label class="crm-label">Observații</label><textarea class="crm-input" name="notes" rows="3"></textarea></div>
        <div><button class="crm-btn" type="submit">Salvează cheltuiala</button></div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Sumar cheltuieli</h3>
        <div class="crm-muted" style="margin-top:6px">Panou rapid pentru cheltuielile companiei.</div>
      </div>
      <div class="crm-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">
        <div class="crm-kpi"><div class="crm-kpi-label">Total înregistrări</div><div class="crm-kpi-value">${escapeHtml(String(stats.total_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Valoare totală</div><div class="crm-kpi-value">${escapeHtml(fmtMoney(stats.total_amount || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Plătite</div><div class="crm-kpi-value">${escapeHtml(String(stats.paid_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Neplătite</div><div class="crm-kpi-value">${escapeHtml(String(stats.unpaid_count || 0))}</div></div>
      </div>
    </section>
  </div>

  <section class="crm-card" style="margin-top:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div><h3 style="margin:0;font-size:20px">Registru cheltuieli</h3><div class="crm-muted" style="margin-top:6px">Filtre rapide pentru lucru contabil curent.</div></div>
      <a class="crm-btn crm-btn-secondary" href="/accounting">Înapoi la contabilitate</a>
    </div>
    <form method="get" action="/accounting/expenses" class="crm-grid-4" style="margin-bottom:18px;overflow:visible">
      <div><label class="crm-label">Status plată</label><select class="crm-input" name="payment_status"><option value="">toate</option><option value="NEPLATITA" ${paymentStatus === "NEPLATITA" ? "selected" : ""}>neplătite</option><option value="PLATITA" ${paymentStatus === "PLATITA" ? "selected" : ""}>plătite</option><option value="PARTIALA" ${paymentStatus === "PARTIALA" ? "selected" : ""}>parțiale</option></select></div>
      <div><label class="crm-label">Categorie</label><input class="crm-input" name="category" value="${escapeHtml(category)}" placeholder="ex: UTILITATI"></div>
      <div style="grid-column:span 2"><label class="crm-label">Căutare</label><input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="furnizor, CUI, număr document"></div>
      <div style="grid-column:1 / -1;display:flex;gap:10px;flex-wrap:wrap"><button class="crm-btn" type="submit">Aplică</button><a class="crm-btn crm-btn-secondary" href="/accounting/expenses">Resetează</a></div>
    </form>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Furnizor</th><th>Document</th><th>Categorie</th><th>Status</th><th>Emitere</th><th>Scadență</th><th class="crm-right">Total</th><th>Fișier</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="8" class="crm-muted">Nu există cheltuieli înregistrate.</td></tr>`}</tbody>
      </table>
    </div>
  </section>
${crmShellEnd()}`);
  });

  app.post("/accounting/expenses/create", requireAuth, upload.single("attachment"), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: req.file, folderName: "expenses" });
    db.prepare(`
      INSERT INTO accounting_expenses (
        company_id, expense_type, category, supplier_name, supplier_cui, doc_number, issue_date, due_date,
        payment_status, deductible_percent, currency, subtotal, vat_amount, total, notes, attachment_path, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.expense_type || "FACTURA").trim().toUpperCase(),
      String(req.body?.category || "ALTELE").trim().toUpperCase(),
      String(req.body?.supplier_name || "").trim(),
      String(req.body?.supplier_cui || "").trim(),
      String(req.body?.doc_number || "").trim(),
      String(req.body?.issue_date || "").trim() || new Date().toISOString().slice(0, 10),
      String(req.body?.due_date || "").trim() || null,
      String(req.body?.payment_status || "NEPLATITA").trim().toUpperCase(),
      moneyInput(req.body?.deductible_percent || 100),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      moneyInput(req.body?.subtotal),
      moneyInput(req.body?.vat_amount),
      moneyInput(req.body?.total),
      String(req.body?.notes || "").trim(),
      attachmentPath || null,
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/accounting/expenses?ok=created" : "/accounting/expenses");
  });

  app.get("/accounting/declarations", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const typeFilter = String(req.query?.type || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim();
    const where = ["company_id=?"];
    const params = [companyId];

    if (statusFilter) {
      where.push("UPPER(COALESCE(status,''))=?");
      params.push(statusFilter);
    }
    if (typeFilter) {
      where.push("UPPER(COALESCE(declaration_type,''))=?");
      params.push(typeFilter);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(period_label,'')) LIKE ? OR LOWER(COALESCE(reference_number,'')) LIKE ? OR LOWER(COALESCE(declaration_type,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, declaration_type, period_label, period_start, period_end, due_date, status, submission_channel,
             reference_number, attachment_path, receipt_path, created_at, updated_at
      FROM accounting_declarations
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(due_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PREGATITA' THEN 1 ELSE 0 END) AS pregatita_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1 ELSE 0 END) AS trimisa_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='VALIDATA' THEN 1 ELSE 0 END) AS validata_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS respinsa_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};

    const rowsHtml = rows.map((row) => `
      <tr>
        <td><div style="font-weight:800"><a href="/accounting/declarations/${row.id}" style="text-decoration:none;color:inherit">${escapeHtml(row.declaration_type || "—")}</a></div><div class="crm-muted" style="margin-top:4px">${escapeHtml(row.period_label || "—")}</div></td>
        <td>${declarationStatusBadge(escapeHtml, row.status)}</td>
        <td>${escapeHtml(row.due_date || "—")}</td>
        <td>${escapeHtml(row.reference_number || "—")}</td>
        <td>${escapeHtml(row.submission_channel || "—")}</td>
        <td>${row.attachment_path ? `<a href="/${encodeURI(row.attachment_path)}" target="_blank">Declarație</a>` : `<span class="crm-muted">—</span>`} ${row.receipt_path ? `· <a href="/${encodeURI(row.receipt_path)}" target="_blank">Recipisă</a>` : ``}</td>
        <td><a class="crm-btn crm-btn-secondary" href="/accounting/declarations/${row.id}">Detalii</a></td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Declarații</title></head>
${crmShellStart("accounting-declarations", "Declarații", "Urmărire declarații fiscale, perioade, documente și recipise ANAF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Adaugă declarație</h3><div class="crm-muted" style="margin-top:6px">Ține evidența declarațiilor pregătite și trimise în SPV.</div></div>
      <form method="post" action="/accounting/declarations/create" enctype="multipart/form-data" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Tip declarație</label><select class="crm-input" name="declaration_type"><option>D100</option><option>D112</option><option>D300</option><option>D390</option><option>D394</option><option>SAF-T</option><option>BILANT</option><option>ALTA</option></select></div>
          <div><label class="crm-label">Perioadă</label><input class="crm-input" name="period_label" placeholder="ex: martie 2026"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Start perioadă</label><input class="crm-input" type="date" name="period_start"></div>
          <div><label class="crm-label">Sfârșit perioadă</label><input class="crm-input" type="date" name="period_end"></div>
        </div>
        <div class="crm-grid-3" style="overflow:visible">
          <div><label class="crm-label">Scadență</label><input class="crm-input" type="date" name="due_date"></div>
          <div><label class="crm-label">Status</label><select class="crm-input" name="status"><option value="PREGATITA">Pregătită</option><option value="TRIMISA">Trimisă</option><option value="VALIDATA">Validată</option><option value="RESPINSA">Respinsă</option></select></div>
          <div><label class="crm-label">Canal</label><select class="crm-input" name="submission_channel"><option value="MANUAL_SPV">Manual SPV</option><option value="E_GUVERNARE">e-Guvernare</option><option value="ALT_CANAL">Alt canal</option></select></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Număr referință ANAF</label><input class="crm-input" name="reference_number"></div>
          <div><label class="crm-label">Fișier declarație</label><input class="crm-input" type="file" name="attachment"></div>
        </div>
        <div><label class="crm-label">Recipisă / confirmare</label><input class="crm-input" type="file" name="receipt"></div>
        <div><label class="crm-label">Observații</label><textarea class="crm-input" name="notes" rows="3"></textarea></div>
        <div><button class="crm-btn" type="submit">Salvează declarația</button></div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Registru declarații</h3><div class="crm-muted" style="margin-top:6px">Poți urmări ce e pregătit, trimis și validat.</div></div>
      <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
        <div class="crm-kpi"><div class="crm-kpi-label">Pregătite</div><div class="crm-kpi-value">${escapeHtml(String(stats.pregatita_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Trimise</div><div class="crm-kpi-value">${escapeHtml(String(stats.trimisa_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Validate</div><div class="crm-kpi-value">${escapeHtml(String(stats.validata_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Respinse</div><div class="crm-kpi-value">${escapeHtml(String(stats.respinsa_count || 0))}</div></div>
      </div>
      <form method="get" action="/accounting/declarations" class="crm-grid-3" style="margin-bottom:18px;overflow:visible">
        <div><label class="crm-label">Status</label><select class="crm-input" name="status"><option value="">toate</option><option value="PREGATITA" ${statusFilter === "PREGATITA" ? "selected" : ""}>pregătite</option><option value="TRIMISA" ${statusFilter === "TRIMISA" ? "selected" : ""}>trimise</option><option value="VALIDATA" ${statusFilter === "VALIDATA" ? "selected" : ""}>validate</option><option value="RESPINSA" ${statusFilter === "RESPINSA" ? "selected" : ""}>respinse</option></select></div>
        <div><label class="crm-label">Tip</label><input class="crm-input" name="type" value="${escapeHtml(typeFilter)}" placeholder="ex: D112"></div>
        <div><label class="crm-label">Căutare</label><input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="perioadă / referință"></div>
        <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap"><button class="crm-btn" type="submit">Aplică</button><a class="crm-btn crm-btn-secondary" href="/accounting/declarations">Resetează</a></div>
      </form>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Declarație</th><th>Status</th><th>Scadență</th><th>Nr. înregistrare</th><th>Canal</th><th>Fișiere</th><th>Acțiuni</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" class="crm-muted">Nu există declarații înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </div>
${crmShellEnd()}`);
  });

  app.get("/accounting/declarations/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const row = db.prepare(`
      SELECT *
      FROM accounting_declarations
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!row) return res.status(404).send("Declarație inexistentă");

    function actionButton(nextStatus, label, extraFields = "") {
      return `
        <form method="post" action="/accounting/declarations/${id}/status" class="crm-stack" style="margin:0">
          <input type="hidden" name="status" value="${nextStatus}">
          ${extraFields}
          <button class="crm-btn ${nextStatus === "RESPINSA" ? "crm-btn-danger" : nextStatus === "VALIDATA" ? "" : "crm-btn-secondary"}" type="submit">${label}</button>
        </form>
      `;
    }

    const availableActions = String(row.status || "PREGATITA").toUpperCase() === "PREGATITA"
      ? `
        ${actionButton("TRIMISA", "Marchează trimisă")}
      `
      : String(row.status || "").toUpperCase() === "TRIMISA"
        ? `
          ${actionButton("VALIDATA", "Marchează validată")}
          ${actionButton("RESPINSA", "Marchează respinsă")}
        `
        : String(row.status || "").toUpperCase() === "RESPINSA"
          ? `${actionButton("PREGATITA", "Revino la pregătită")}`
          : `${actionButton("TRIMISA", "Retrimite / marchează trimisă")}`;

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(row.declaration_type || "Declarație")}</title></head>
${crmShellStart("accounting-declarations", row.declaration_type || "Declarație", "Flux de depunere ANAF, documente, recipisă și număr de înregistrare.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
        <div>
          <h3 style="margin:0;font-size:24px">${escapeHtml(row.declaration_type || "Declarație")} · ${escapeHtml(row.period_label || "fără perioadă")}</h3>
          <div class="crm-muted" style="margin-top:6px">Status curent: ${declarationStatusBadge(escapeHtml, row.status)}</div>
        </div>
        <a class="crm-btn crm-btn-secondary" href="/accounting/declarations">Înapoi la declarații</a>
      </div>

      <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
        <div class="crm-kpi"><div class="crm-kpi-label">Perioadă</div><div class="crm-kpi-value">${escapeHtml(row.period_label || "—")}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Scadență</div><div class="crm-kpi-value">${escapeHtml(row.due_date || "—")}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Nr. înregistrare</div><div class="crm-kpi-value">${escapeHtml(row.reference_number || "—")}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Canal</div><div class="crm-kpi-value">${escapeHtml(row.submission_channel || "—")}</div></div>
      </div>

      <div class="crm-table-wrap">
        <table class="crm-table">
          <tbody>
            <tr><th>Fișier depunere</th><td>${row.attachment_path ? `<a href="/${encodeURI(row.attachment_path)}" target="_blank">Deschide declarația</a>` : `<span class="crm-muted">Nu există</span>`}</td></tr>
            <tr><th>Recipisă</th><td>${row.receipt_path ? `<a href="/${encodeURI(row.receipt_path)}" target="_blank">Deschide recipisa</a>` : `<span class="crm-muted">Nu există</span>`}</td></tr>
            <tr><th>Actualizat la</th><td>${escapeHtml(row.updated_at || row.created_at || "—")}</td></tr>
            <tr><th>Observații</th><td>${escapeHtml(row.notes || "—")}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="crm-card">
      <div style="margin-bottom:18px">
        <h3 style="margin:0;font-size:20px">Actualizare depunere ANAF</h3>
        <div class="crm-muted" style="margin-top:6px">Aici actualizezi statusul, numărul de înregistrare și recipisa după depunere.</div>
      </div>

      <form method="post" action="/accounting/declarations/${id}/update" enctype="multipart/form-data" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Status</label><select class="crm-input" name="status"><option value="PREGATITA" ${String(row.status).toUpperCase()==="PREGATITA" ? "selected" : ""}>Pregătită</option><option value="TRIMISA" ${String(row.status).toUpperCase()==="TRIMISA" ? "selected" : ""}>Trimisă</option><option value="VALIDATA" ${String(row.status).toUpperCase()==="VALIDATA" ? "selected" : ""}>Validată</option><option value="RESPINSA" ${String(row.status).toUpperCase()==="RESPINSA" ? "selected" : ""}>Respinsă</option></select></div>
          <div><label class="crm-label">Număr de înregistrare ANAF</label><input class="crm-input" name="reference_number" value="${escapeHtml(row.reference_number || "")}"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Fișier depunere nou</label><input class="crm-input" type="file" name="attachment"></div>
          <div><label class="crm-label">Recipisă nouă</label><input class="crm-input" type="file" name="receipt"></div>
        </div>
        <div><label class="crm-label">Observații</label><textarea class="crm-input" name="notes" rows="4">${escapeHtml(row.notes || "")}</textarea></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="crm-btn" type="submit">Salvează actualizarea</button>
        </div>
      </form>

      <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
        ${availableActions}
      </div>
    </section>
  </div>
${crmShellEnd()}`);
  });

  app.post("/accounting/declarations/create", requireAuth, upload.fields([{ name: "attachment", maxCount: 1 }, { name: "receipt", maxCount: 1 }]), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const files = req.files || {};
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.attachment) ? files.attachment[0] : null, folderName: "declarations" });
    const receiptPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.receipt) ? files.receipt[0] : null, folderName: "declarations" });
    db.prepare(`
      INSERT INTO accounting_declarations (
        company_id, declaration_type, period_label, period_start, period_end, due_date, status,
        submission_channel, reference_number, attachment_path, receipt_path, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.declaration_type || "D112").trim().toUpperCase(),
      String(req.body?.period_label || "").trim(),
      String(req.body?.period_start || "").trim() || null,
      String(req.body?.period_end || "").trim() || null,
      String(req.body?.due_date || "").trim() || null,
      String(req.body?.status || "PREGATITA").trim().toUpperCase(),
      String(req.body?.submission_channel || "MANUAL_SPV").trim().toUpperCase(),
      String(req.body?.reference_number || "").trim(),
      attachmentPath || null,
      receiptPath || null,
      String(req.body?.notes || "").trim(),
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/accounting/declarations?ok=created" : "/accounting/declarations");
  });

  app.post("/accounting/declarations/:id/update", requireAuth, upload.fields([{ name: "attachment", maxCount: 1 }, { name: "receipt", maxCount: 1 }]), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const existing = db.prepare(`SELECT id, attachment_path, receipt_path FROM accounting_declarations WHERE id=? AND company_id=?`).get(id, companyId);
    if (!existing) return res.status(404).send("Declarație inexistentă");

    const files = req.files || {};
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.attachment) ? files.attachment[0] : null, folderName: "declarations" });
    const receiptPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.receipt) ? files.receipt[0] : null, folderName: "declarations" });

    db.prepare(`
      UPDATE accounting_declarations
      SET status=?,
          reference_number=?,
          attachment_path=COALESCE(?, attachment_path),
          receipt_path=COALESCE(?, receipt_path),
          notes=?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      String(req.body?.status || "PREGATITA").trim().toUpperCase(),
      String(req.body?.reference_number || "").trim(),
      attachmentPath || null,
      receiptPath || null,
      String(req.body?.notes || "").trim(),
      id,
      companyId
    );

    res.redirect(req.body?.return_to === "nexora" ? `/nexora/accounting/declarations/${id}?ok=updated` : `/accounting/declarations/${id}`);
  });

  app.post("/accounting/declarations/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const status = String(req.body?.status || "").trim().toUpperCase();
    const allowed = new Set(["PREGATITA", "TRIMISA", "VALIDATA", "RESPINSA"]);
    if (!allowed.has(status)) return res.status(400).send("Status invalid");

    const existing = db.prepare(`SELECT id FROM accounting_declarations WHERE id=? AND company_id=?`).get(id, companyId);
    if (!existing) return res.status(404).send("Declarație inexistentă");

    db.prepare(`
      UPDATE accounting_declarations
      SET status=?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, id, companyId);

    res.redirect(req.body?.return_to === "nexora" ? `/nexora/accounting/declarations/${id}?ok=updated` : `/accounting/declarations/${id}`);
  });

  app.get("/accounting/consumption", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const products = db.prepare(`
      SELECT id, code, name, unit, price
      FROM products
      WHERE company_id=? AND active=1
      ORDER BY name COLLATE NOCASE ASC
    `).all(companyId);

    const vouchers = db.prepare(`
      SELECT cv.id, cv.voucher_number, cv.issue_date, cv.department, cv.issued_to, cv.notes,
             IFNULL(SUM(cvi.line_total), 0) AS total_amount,
             COUNT(cvi.id) AS items_count
      FROM consumption_vouchers cv
      LEFT JOIN consumption_voucher_items cvi ON cvi.voucher_id = cv.id
      WHERE cv.company_id=?
      GROUP BY cv.id
      ORDER BY date(cv.issue_date) DESC, cv.id DESC
      LIMIT 150
    `).all(companyId);

    const productOptions = products.map((product) => `<option value="${escapeHtml(String(product.id))}" data-unit="${escapeHtml(product.unit || "buc")}" data-cost="${escapeHtml(String(product.price || 0))}">${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim())}</option>`).join("");
    const voucherRows = vouchers.map((row) => `
      <tr>
        <td><a href="/accounting/consumption/${row.id}">${escapeHtml(row.voucher_number || "—")}</a></td>
        <td>${escapeHtml(row.issue_date || "—")}</td>
        <td>${escapeHtml(row.department || "—")}</td>
        <td>${escapeHtml(row.issued_to || "—")}</td>
        <td class="crm-right">${escapeHtml(String(row.items_count || 0))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total_amount))} RON</td>
      </tr>
    `).join("");

    const lineTemplate = Array.from({ length: 4 }, (_, index) => `
      <div class="crm-grid-4" style="overflow:visible;padding:12px;border:1px solid var(--line);border-radius:16px;background:rgba(15,23,42,.03)">
        <div><label class="crm-label">Produs ${index + 1}</label><select class="crm-input" name="product_id">${`<option value="">Selectează</option>${productOptions}`}</select></div>
        <div><label class="crm-label">Cantitate</label><input class="crm-input" name="qty" value="0"></div>
        <div><label class="crm-label">UM</label><input class="crm-input" name="unit" placeholder="buc"></div>
        <div><label class="crm-label">Cost unitar</label><input class="crm-input" name="unit_cost" value="0"></div>
      </div>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Bonuri de consum</title></head>
${crmShellStart("accounting-consumption", "Bonuri de consum", "Evidență pentru consum intern de materiale și produse din firmă.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Creează bon de consum</h3><div class="crm-muted" style="margin-top:6px">Selectezi produse din catalog și înregistrezi consumul intern.</div></div>
      <form method="post" action="/accounting/consumption/create" class="crm-stack">
        <div class="crm-grid-3" style="overflow:visible">
          <div><label class="crm-label">Număr bon</label><input class="crm-input" name="voucher_number" required value="BC-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}"></div>
          <div><label class="crm-label">Data</label><input class="crm-input" type="date" name="issue_date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div><label class="crm-label">Departament</label><input class="crm-input" name="department" placeholder="ex: Administrativ"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Predat către</label><input class="crm-input" name="issued_to" placeholder="persoană / compartiment"></div>
          <div><label class="crm-label">Observații</label><input class="crm-input" name="notes"></div>
        </div>
        ${lineTemplate}
        <div><button class="crm-btn" type="submit">Salvează bonul</button></div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Registru bonuri</h3><div class="crm-muted" style="margin-top:6px">Ultimele bonuri de consum generate în sistem.</div></div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Bon</th><th>Data</th><th>Departament</th><th>Predat către</th><th class="crm-right">Poziții</th><th class="crm-right">Total</th></tr></thead>
          <tbody>${voucherRows || `<tr><td colspan="6" class="crm-muted">Nu există bonuri de consum.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </div>
${crmShellEnd()}`);
  });

  app.post("/accounting/consumption/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const productIds = Array.isArray(req.body?.product_id) ? req.body.product_id : [req.body?.product_id];
    const quantities = Array.isArray(req.body?.qty) ? req.body.qty : [req.body?.qty];
    const units = Array.isArray(req.body?.unit) ? req.body.unit : [req.body?.unit];
    const unitCosts = Array.isArray(req.body?.unit_cost) ? req.body.unit_cost : [req.body?.unit_cost];

    const items = [];
    for (let index = 0; index < productIds.length; index += 1) {
      const productId = Number(productIds[index] || 0);
      const qty = moneyInput(quantities[index]);
      if (!productId || qty <= 0) continue;
      const product = db.prepare(`SELECT id, name, unit, price FROM products WHERE id=? AND company_id=?`).get(productId, companyId);
      if (!product) continue;
      const unit = String(units[index] || product.unit || "buc").trim();
      const unitCost = moneyInput(unitCosts[index] || product.price || 0);
      items.push({
        productId,
        productName: product.name,
        unit,
        qty,
        unitCost,
        lineTotal: qty * unitCost
      });
    }

    if (!items.length) return res.status(400).send("Adaugă cel puțin o poziție în bon.");

    db.exec("BEGIN");
    try {
      const voucherResult = db.prepare(`
        INSERT INTO consumption_vouchers (company_id, voucher_number, issue_date, department, issued_to, notes, created_by_email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        String(req.body?.voucher_number || "").trim(),
        String(req.body?.issue_date || "").trim() || new Date().toISOString().slice(0, 10),
        String(req.body?.department || "").trim(),
        String(req.body?.issued_to || "").trim(),
        String(req.body?.notes || "").trim(),
        String(req.session.user.email || "").trim().toLowerCase()
      );

      const voucherId = Number(voucherResult.lastInsertRowid);
      const insertItem = db.prepare(`
        INSERT INTO consumption_voucher_items (voucher_id, product_id, product_name, qty, unit, unit_cost, line_total, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(voucherId, item.productId, item.productName, item.qty, item.unit, item.unitCost, item.lineTotal, companyId);
      }

      db.exec("COMMIT");
      res.redirect(`/accounting/consumption/${voucherId}`);
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      res.status(500).send(`Bonul de consum nu a putut fi salvat: ${String(error?.message || error)}`);
    }
  });

  app.get("/accounting/consumption/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const voucher = db.prepare(`
      SELECT id, voucher_number, issue_date, department, issued_to, notes, created_by_email, created_at
      FROM consumption_vouchers
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!voucher) return res.status(404).send("Bon inexistent");

    const items = db.prepare(`
      SELECT product_name, qty, unit, unit_cost, line_total
      FROM consumption_voucher_items
      WHERE voucher_id=? AND company_id=?
      ORDER BY id ASC
    `).all(id, companyId);

    const total = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const itemsHtml = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.product_name || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(item.qty))}</td>
        <td>${escapeHtml(item.unit || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(item.unit_cost))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(item.line_total))}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(voucher.voucher_number || "Bon de consum")}</title></head>
${crmShellStart("accounting-consumption", voucher.voucher_number || "Bon de consum", "Detaliu bon de consum și pozițiile sale.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h3 style="margin:0;font-size:22px">${escapeHtml(voucher.voucher_number || "Bon de consum")}</h3>
        <div class="crm-muted" style="margin-top:6px">Data: ${escapeHtml(voucher.issue_date || "—")} · Departament: ${escapeHtml(voucher.department || "—")} · Predat către: ${escapeHtml(voucher.issued_to || "—")}</div>
      </div>
      <a class="crm-btn crm-btn-secondary" href="/accounting/consumption">Înapoi</a>
    </div>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Produs</th><th class="crm-right">Cantitate</th><th>UM</th><th class="crm-right">Cost unitar</th><th class="crm-right">Total</th></tr></thead>
        <tbody>${itemsHtml || `<tr><td colspan="5" class="crm-muted">Nu există poziții.</td></tr>`}</tbody>
      </table>
    </div>
    <div style="margin-top:18px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div class="crm-muted">${escapeHtml(voucher.notes || "Fără observații")}</div>
      <div style="font-weight:800">Total bon: ${escapeHtml(fmtMoney(total))} RON</div>
    </div>
  </section>
${crmShellEnd()}`);
  });

  app.get("/accounting/receivables", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim().toLowerCase();

    const where = [
      "f.company_id=?",
      "UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')",
      "bp.id IS NULL"
    ];
    const params = [companyId];

    if (statusFilter) {
      if (statusFilter === "RESTANTE") {
        where.push("f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now')");
      } else if (statusFilter === "DESCHISE") {
        where.push("1=1");
      } else {
        where.push("UPPER(COALESCE(f.status,''))=?");
        params.push(statusFilter);
      }
    }

    if (search) {
      const like = `%${search}%`;
      where.push("(LOWER(COALESCE(f.factura_nr,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT
        f.id,
        f.factura_nr,
        f.status,
        f.total,
        f.moneda,
        f.data_emitere,
        f.scadenta,
        c.name AS client_name,
        c.cui AS client_cui
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      LEFT JOIN billing_payments bp ON bp.generated_factura_id = f.id
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE
          WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') THEN 0
          ELSE 1
        END,
        date(COALESCE(f.scadenta, f.data_emitere, f.created_at)) ASC,
        f.id DESC
      LIMIT 250
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(f.total), 0) AS total_amount,
        SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') THEN 1 ELSE 0 END) AS overdue_count,
        IFNULL(SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') THEN f.total ELSE 0 END), 0) AS overdue_amount
      FROM facturi f
      LEFT JOIN billing_payments bp ON bp.generated_factura_id = f.id
      WHERE f.company_id=?
        AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')
        AND bp.id IS NULL
    `).get(companyId) || {};

    const rowsHtml = rows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber(row))}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.client_name || "—")}</div>
          <div class="crm-muted">${escapeHtml(row.client_cui || "—")}</div>
        </td>
        <td><span class="crm-badge crm-badge-neutral">${escapeHtml(row.status || "—")}</span></td>
        <td>${escapeHtml(row.data_emitere || "—")}</td>
        <td>${escapeHtml(row.scadenta || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.moneda || "RON"))}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Facturi de urmărit la încasare</title></head>
${crmShellStart("accounting-receivables", "Facturi de urmărit la încasare", "Facturi deschise fără plată legată, utile pentru urmărirea încasărilor și restanțelor.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h3 style="margin:0;font-size:22px">Facturi fără plată legată</h3>
        <div class="crm-muted" style="margin-top:6px">Aici vezi facturile care sunt încă deschise și nu au nicio plată asociată în sistem.</div>
      </div>
    </div>

    <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
      <div class="crm-kpi"><div class="crm-kpi-label">Total facturi</div><div class="crm-kpi-value">${escapeHtml(String(stats.total_count || 0))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Valoare totală</div><div class="crm-kpi-value">${escapeHtml(fmtMoney(stats.total_amount || 0))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Restante</div><div class="crm-kpi-value">${escapeHtml(String(stats.overdue_count || 0))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Valoare restantă</div><div class="crm-kpi-value">${escapeHtml(fmtMoney(stats.overdue_amount || 0))}</div></div>
    </div>

    <form method="get" action="/accounting/receivables" class="crm-grid-3" style="margin-bottom:18px;overflow:visible">
      <div>
        <label class="crm-label">Status</label>
        <select class="crm-input" name="status">
          <option value="" ${statusFilter === "" ? "selected" : ""}>toate</option>
          <option value="DESCHISE" ${statusFilter === "DESCHISE" ? "selected" : ""}>deschise</option>
          <option value="RESTANTE" ${statusFilter === "RESTANTE" ? "selected" : ""}>restante</option>
          <option value="TRIMISA" ${statusFilter === "TRIMISA" ? "selected" : ""}>trimise</option>
          <option value="INTARZIATA" ${statusFilter === "INTARZIATA" ? "selected" : ""}>întârziate</option>
        </select>
      </div>
      <div style="grid-column:span 2">
        <label class="crm-label">Căutare</label>
        <input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="Număr factură, client sau CUI">
      </div>
      <div style="grid-column:1 / -1;display:flex;gap:10px;flex-wrap:wrap">
        <button class="crm-btn" type="submit">Aplică</button>
        <a class="crm-btn crm-btn-secondary" href="/accounting/receivables">Resetează</a>
      </div>
    </form>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Factură / client</th>
            <th>Status</th>
            <th>Emitere</th>
            <th>Scadență</th>
            <th class="crm-right">Total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" class="crm-muted">Nu există facturi de urmărit pentru filtrele selectate.</td></tr>`}</tbody>
      </table>
    </div>
  </section>
${crmShellEnd()}`);
  });

  app.get("/accounting", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const userEmail = req.session.user.email;
    const isAccountingUser = String(req.session.user.role || "").trim().toLowerCase() === "accounting";
    const canAccessSpvWorkspace = canAccessSpvUser(req.session.user);
    const filters = buildInvoiceFilterState(req.query);
    const { whereSql, params } = buildInvoiceWhereClause(filters, companyId);
    const exportQuery = invoiceExportQueryString(filters);
    const inboxFilters = buildInboxFilterState(req.query);
    const inboxExportQuery = new URLSearchParams();
    if (inboxFilters.processed) inboxExportQuery.set("processed", inboxFilters.processed);
    if (inboxFilters.dateFrom) inboxExportQuery.set("date_from", inboxFilters.dateFrom);
    if (inboxFilters.dateTo) inboxExportQuery.set("date_to", inboxFilters.dateTo);
    if (inboxFilters.search) inboxExportQuery.set("search", inboxFilters.search);
    const inboxExportHref = `/accounting/export/inbox-spv.csv${inboxExportQuery.toString() ? `?${inboxExportQuery.toString()}` : ""}`;

    const invoiceStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total), 0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'INCASATA' THEN 1 ELSE 0 END) AS paid_count,
        IFNULL(SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'INCASATA' THEN total ELSE 0 END), 0) AS paid_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS open_count,
        IFNULL(SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN total ELSE 0 END), 0) AS open_amount,
        SUM(CASE WHEN scadenta IS NOT NULL AND scadenta <> '' AND date(scadenta) < date('now') AND UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS overdue_count,
        IFNULL(SUM(CASE WHEN scadenta IS NOT NULL AND scadenta <> '' AND date(scadenta) < date('now') AND UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN total ELSE 0 END), 0) AS overdue_amount,
        SUM(CASE WHEN COALESCE(efactura_upload_index, efactura_message_id, '') <> '' AND COALESCE(efactura_download_id, '') = '' THEN 1 ELSE 0 END) AS spv_pending_count,
        SUM(CASE WHEN COALESCE(efactura_last_error, '') <> '' THEN 1 ELSE 0 END) AS efactura_error_count
      FROM facturi
      WHERE company_id=?
    `).get(companyId) || {};

    const invoiceMonth = db.prepare(`
      SELECT
        COUNT(*) AS issued_count,
        IFNULL(SUM(total), 0) AS issued_amount
      FROM facturi
      WHERE company_id=?
        AND substr(COALESCE(data_emitere, created_at, ''), 1, 7) = strftime('%Y-%m', 'now')
    `).get(companyId) || {};

    const paymentStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount,
        SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'paid' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN LOWER(COALESCE(status,'')) NOT IN ('paid', 'failed', 'cancelled', 'canceled') THEN 1 ELSE 0 END) AS pending_count,
        IFNULL(SUM(CASE WHEN LOWER(COALESCE(status,'')) NOT IN ('paid', 'failed', 'cancelled', 'canceled') THEN amount ELSE 0 END), 0) AS pending_amount
      FROM billing_payments
      WHERE company_id=?
    `).get(companyId) || {};

    const reconciliationStats = db.prepare(`
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' AND bp.generated_factura_id IS NOT NULL AND UPPER(COALESCE(f.status,''))='INCASATA' THEN 1 ELSE 0 END) AS matched_count,
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' AND bp.generated_factura_id IS NOT NULL AND UPPER(COALESCE(f.status,''))<>'INCASATA' THEN 1 ELSE 0 END) AS payment_not_marked_count,
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' AND bp.generated_factura_id IS NULL THEN 1 ELSE 0 END) AS payment_without_invoice_count,
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))<>'paid' AND bp.generated_factura_id IS NOT NULL THEN 1 ELSE 0 END) AS pending_link_count
      FROM billing_payments bp
      LEFT JOIN facturi f ON f.id = bp.generated_factura_id
      WHERE bp.company_id=?
    `).get(companyId) || {};

    const spvStats = db.prepare(`
      SELECT
        SUM(CASE WHEN environment='prod' THEN 1 ELSE 0 END) AS prod_connections,
        SUM(CASE WHEN environment='test' THEN 1 ELSE 0 END) AS test_connections,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <> '' AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END) AS active_connections
      FROM anaf_connections
      WHERE company_id=?
    `).get(companyId) || {};

    const inboxStats = db.prepare(`
      SELECT
        COUNT(*) AS inbox_count,
        SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS inbox_unprocessed_count,
        MAX(COALESCE(received_at, created_at)) AS last_received_at
      FROM anaf_inbox
      WHERE company_id=?
    `).get(companyId) || {};

    const messageStats = db.prepare(`
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(direction,''))='out' THEN 1 ELSE 0 END) AS outbox_count,
        SUM(CASE WHEN LOWER(COALESCE(direction,''))='out' AND LOWER(COALESCE(status,'')) IN ('error', 'eroare', 'failed') THEN 1 ELSE 0 END) AS outbox_error_count
      FROM anaf_messages
      WHERE company_id=?
    `).get(companyId) || {};

    const declarationStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PREGATITA' THEN 1 ELSE 0 END) AS pregatita_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1 ELSE 0 END) AS trimisa_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='VALIDATA' THEN 1 ELSE 0 END) AS validata_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS respinsa_count,
        SUM(CASE
          WHEN due_date IS NOT NULL
            AND due_date <> ''
            AND date(due_date) <= date('now', '+7 day')
            AND UPPER(COALESCE(status,'')) IN ('PREGATITA', 'RESPINSA')
          THEN 1 ELSE 0
        END) AS urgent_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};

    const expenseStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total), 0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count,
        IFNULL(SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN total ELSE 0 END), 0) AS unpaid_amount,
        IFNULL(SUM(CASE WHEN substr(COALESCE(issue_date, created_at, ''), 1, 7) = strftime('%Y-%m', 'now') THEN total ELSE 0 END), 0) AS month_amount
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};

    const consumptionStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN substr(COALESCE(issue_date, created_at, ''), 1, 7) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS month_count,
        MAX(COALESCE(issue_date, created_at)) AS last_issue_date
      FROM consumption_vouchers
      WHERE company_id=?
    `).get(companyId) || {};

    const recentInvoices = db.prepare(`
      SELECT
        f.id,
        f.factura_nr,
        f.status,
        f.total,
        f.moneda,
        f.data_emitere,
        f.scadenta,
        f.efactura_status,
        f.efactura_message_id,
        f.efactura_upload_index,
        f.efactura_download_id,
        f.efactura_last_error,
        c.name AS client_name
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE f.company_id=?
      ORDER BY f.id DESC
      LIMIT 5
    `).all(companyId);

    const recentInbox = db.prepare(`
      SELECT id, supplier_cui, invoice_number, received_at, processed, created_at
      FROM anaf_inbox
      WHERE company_id=?
      ORDER BY datetime(COALESCE(received_at, created_at)) DESC, id DESC
      LIMIT 8
    `).all(companyId);

    const recentPayments = db.prepare(`
      SELECT id, source, status, amount, currency, payer_name, payer_email, paid_at, created_at, reference_code
      FROM billing_payments
      WHERE company_id=?
      ORDER BY datetime(COALESCE(paid_at, created_at)) DESC, id DESC
      LIMIT 8
    `).all(companyId);

    const recentDeclarations = db.prepare(`
      SELECT id, declaration_type, period_label, due_date, status, reference_number
      FROM accounting_declarations
      WHERE company_id=?
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(status,'')) IN ('PREGATITA', 'RESPINSA') THEN 0
          WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1
          ELSE 2
        END,
        date(COALESCE(due_date, created_at)) ASC,
        id DESC
      LIMIT 5
    `).all(companyId);

    const declarationDeadlines = db.prepare(`
      SELECT id, declaration_type, period_label, due_date, status
      FROM accounting_declarations
      WHERE company_id=?
        AND due_date IS NOT NULL
        AND due_date <> ''
      ORDER BY
        CASE
          WHEN date(due_date) < date('now') THEN 0
          WHEN date(due_date) <= date('now', '+7 day') THEN 1
          ELSE 2
        END,
        date(due_date) ASC,
        id DESC
      LIMIT 6
    `).all(companyId);

    const recentExpenses = db.prepare(`
      SELECT id, supplier_name, expense_type, payment_status, total, currency, issue_date
      FROM accounting_expenses
      WHERE company_id=?
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 5
    `).all(companyId);

    const reconciliationRows = db.prepare(`
      SELECT
        bp.id,
        bp.source,
        bp.status,
        bp.amount,
        bp.currency,
        bp.payer_name,
        bp.payer_email,
        bp.reference_code,
        bp.paid_at,
        bp.created_at,
        bp.generated_factura_id,
        bp.invoice_generation_status,
        f.factura_nr,
        f.status AS factura_status,
        f.total AS factura_total
      FROM billing_payments bp
      LEFT JOIN facturi f ON f.id = bp.generated_factura_id
      WHERE bp.company_id=?
      ORDER BY datetime(COALESCE(bp.paid_at, bp.created_at)) DESC, bp.id DESC
      LIMIT 20
    `).all(companyId);

    const connection = db.prepare(`
      SELECT environment, scope, expires_at, refresh_expires_at, updated_at
      FROM anaf_connections
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId) || null;

    const accountingInvoiceRows = db.prepare(`
      SELECT
        f.id,
        f.factura_nr,
        f.status,
        f.moneda,
        f.subtotal,
        f.tva_valoare,
        f.total,
        f.data_emitere,
        f.scadenta,
        f.efactura_status,
        f.efactura_message_id,
        f.efactura_upload_index,
        f.efactura_download_id,
        f.efactura_last_error,
        c.name AS client_name,
        c.cui AS client_cui
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE ${whereSql}
      ORDER BY date(COALESCE(f.data_emitere, f.created_at)) DESC, f.id DESC
      LIMIT 120
    `).all(...params);

    const filteredInvoiceStats = db.prepare(`
      SELECT
        COUNT(*) AS invoice_count,
        IFNULL(SUM(f.total), 0) AS total_amount,
        SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS overdue_count,
        IFNULL(SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA') THEN f.total ELSE 0 END), 0) AS overdue_amount
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE ${whereSql}
    `).get(...params) || {};

    function badge(tone, label) {
      return `<span class="crm-badge ${tone}">${escapeHtml(label)}</span>`;
    }

    function efacturaBadge(row) {
      if (String(row?.efactura_last_error || "").trim()) return badge("crm-badge-red", "eroare");
      const status = String(row?.efactura_status || "").trim();
      if (status === "DEMO_LOCAL") return badge("crm-badge-blue", "demo simulat");
      if (status === "DEMO_CONFIRMAT") return badge("crm-badge-green", "demo confirmat");
      if (!status) return badge("crm-badge-neutral", "neinițiat");
      if (["RESPINS_VALIDARE", "RESPINSA_SPV"].includes(status.toUpperCase())) return badge("crm-badge-red", "respinsă");
      if (String(row?.efactura_download_id || "").trim()) return badge("crm-badge-green", status);
      if (String(row?.efactura_upload_index || row?.efactura_message_id || "").trim()) return badge("crm-badge-blue", status);
      return badge("crm-badge-neutral", status);
    }

    function paymentBadge(status) {
      const normalized = String(status || "").trim().toLowerCase();
      if (normalized === "paid") return badge("crm-badge-green", "plătită");
      if (["failed", "cancelled", "canceled"].includes(normalized)) return badge("crm-badge-red", normalized);
      return badge("crm-badge-blue", normalized || "în curs");
    }

    function reconciliationBadge(row) {
      const paymentStatus = String(row?.status || "").trim().toLowerCase();
      const facturaStatus = String(row?.factura_status || "").trim().toUpperCase();
      const hasInvoice = Number(row?.generated_factura_id || 0) > 0;

      if (paymentStatus === "paid" && hasInvoice && facturaStatus === "INCASATA") {
        return badge("crm-badge-green", "reconciliat");
      }
      if (paymentStatus === "paid" && hasInvoice) {
        return badge("crm-badge-amber", "plată confirmată, factură neîncasată");
      }
      if (paymentStatus === "paid" && !hasInvoice) {
        return badge("crm-badge-red", "plată fără factură");
      }
      if (hasInvoice) {
        return badge("crm-badge-blue", "factură legată, plată în curs");
      }
      return badge("crm-badge-neutral", "de verificat");
    }

    const invoiceRowsHtml = recentInvoices.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber(row))}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.client_name || "—")}</div>
        </td>
        <td>${badge("crm-badge-neutral", row.status || "—")}</td>
        <td>${efacturaBadge(row)}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.moneda || "RON"))}</td>
        <td>${escapeHtml(row.data_emitere || "—")}</td>
        <td>${escapeHtml(row.scadenta || "—")}</td>
      </tr>
    `).join("");

    const inboxRowsHtml = recentInbox.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.invoice_number || "Fără număr")}</div>
          <div class="crm-muted" style="margin-top:4px">Furnizor CUI: ${escapeHtml(row.supplier_cui || "—")}</div>
        </td>
        <td>${Number(row.processed) ? badge("crm-badge-green", "procesat") : badge("crm-badge-blue", "nou")}</td>
        <td>${escapeHtml(row.received_at || row.created_at || "—")}</td>
      </tr>
    `).join("");

    const paymentRowsHtml = recentPayments.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.payer_name || row.payer_email || row.reference_code || `Plată #${row.id}`)}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml((row.source || "").toUpperCase() || "—")}</div>
        </td>
        <td>${paymentBadge(row.status)}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.amount))} ${escapeHtml(String(row.currency || "EUR").toUpperCase())}</td>
        <td>${escapeHtml(row.paid_at || row.created_at || "—")}</td>
      </tr>
    `).join("");

    const reconciliationRowsHtml = reconciliationRows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.payer_name || row.payer_email || row.reference_code || `Plată #${row.id}`)}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml((row.source || "").toUpperCase() || "—")}</div>
        </td>
        <td>${paymentBadge(row.status)}</td>
        <td>${reconciliationBadge(row)}</td>
        <td>
          ${row.generated_factura_id
            ? `<div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber({ id: row.generated_factura_id, factura_nr: row.factura_nr }))}</div><div class="crm-muted" style="margin-top:4px">${escapeHtml(row.factura_status || "—")}</div>`
            : `<span class="crm-muted">Fără factură legată</span>`}
        </td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.amount))} ${escapeHtml(String(row.currency || "EUR").toUpperCase())}</td>
        <td>${escapeHtml(row.paid_at || row.created_at || "—")}</td>
      </tr>
    `).join("");

    const latestConnectionStatus = connection
      ? `${String(connection.environment || "test").toUpperCase()} · actualizat ${escapeHtml(connection.updated_at || "—")}`
      : "Nu există conexiune ANAF salvată";

    const accountingInvoiceRowsHtml = accountingInvoiceRows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber(row))}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.client_name || "—")}</div>
          <div class="crm-muted">${escapeHtml(row.client_cui || "—")}</div>
        </td>
        <td>${badge("crm-badge-neutral", row.status || "—")}</td>
        <td>${efacturaBadge(row)}</td>
        <td>${escapeHtml(row.data_emitere || "—")}</td>
        <td>${escapeHtml(row.scadenta || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.subtotal))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.tva_valoare))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.moneda || "RON"))}</td>
      </tr>
    `).join("");

    const launchCards = [
      {
        href: "/accounting/declarations",
        eyebrow: "ANAF",
        title: "Declarații și recipise",
        copy: "Pregătești, trimiți și urmărești statusul declarațiilor dintr-un singur loc.",
        meta: `${Number(declarationStats.pregatita_count || 0)} pregătite · ${Number(declarationStats.respinsa_count || 0)} respinse`,
        tone: "linear-gradient(135deg,#0f172a 0%,#1d4ed8 55%,#38bdf8 100%)",
        cta: "Deschide declarațiile",
        icon: "declarations"
      },
      canAccessSpvWorkspace ? {
        href: "/anaf/inbox",
        eyebrow: "SPV",
        title: "Inbox e-Factura",
        copy: "Vezi documentele noi din SPV, procesează-le și mergi direct la ce trebuie verificat.",
        meta: `${Number(inboxStats.inbox_unprocessed_count || 0)} neprocesate · ${Number(inboxStats.inbox_count || 0)} total`,
        tone: "linear-gradient(135deg,#052e16 0%,#15803d 55%,#34d399 100%)",
        cta: "Intră în inbox",
        icon: "spv"
      } : null,
      {
        href: "/accounting/expenses",
        eyebrow: "Cheltuieli",
        title: "Cheltuieli și documente",
        copy: "Înregistrezi facturi de intrare, bonuri și documente justificative pentru firmă.",
        meta: `${Number(expenseStats.unpaid_count || 0)} neplătite · ${escapeHtml(fmtMoney(expenseStats.month_amount || 0))} RON luna asta`,
        tone: "linear-gradient(135deg,#3f1d0d 0%,#b45309 55%,#f59e0b 100%)",
        cta: "Gestionează cheltuielile",
        icon: "expenses"
      },
      {
        href: "/accounting/consumption",
        eyebrow: "Stoc intern",
        title: "Bonuri de consum",
        copy: "Urmărești ieșirile interne, consumurile pe departamente și documentele de predare.",
        meta: `${Number(consumptionStats.month_count || 0)} bonuri luna asta · ${Number(consumptionStats.total_count || 0)} total`,
        tone: "linear-gradient(135deg,#3b0764 0%,#7c3aed 55%,#c084fc 100%)",
        cta: "Deschide bonurile",
        icon: "consumption"
      },
      {
        href: "/facturi",
        eyebrow: "Vânzări",
        title: "Registru facturi",
        copy: "Lucrezi cu facturile emise, scadențele, stările comerciale și statusul e-Factura.",
        meta: `${Number(invoiceStats.overdue_count || 0)} restante · ${Number(invoiceStats.open_count || 0)} deschise`,
        tone: "linear-gradient(135deg,#111827 0%,#374151 55%,#94a3b8 100%)",
        cta: "Vezi facturile",
        icon: "invoices"
      },
      {
        href: "/accounting#reconciliere",
        eyebrow: "Control",
        title: "Reconciliere plăți",
        copy: "Compari încasările, facturile legate și plățile care încă cer validare contabilă.",
        meta: `${Number(reconciliationStats.payment_not_marked_count || 0)} de verificat · ${Number(reconciliationStats.matched_count || 0)} reconciliate`,
        tone: "linear-gradient(135deg,#1f2937 0%,#0f766e 55%,#2dd4bf 100%)",
        cta: "Verifică reconcilierea",
        icon: "reconciliation"
      }
    ].filter(Boolean);

    function launchIcon(type) {
      if (type === "declarations") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>`;
      }
      if (type === "spv") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18"/><path d="M5 7l7 6 7-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>`;
      }
      if (type === "expenses") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18H7z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`;
      }
      if (type === "consumption") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8l7-4 7 4-7 4z"/><path d="M5 8v8l7 4 7-4V8"/><path d="M12 12v8"/></svg>`;
      }
      if (type === "invoices") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-5-3-5 3z"/><path d="M9 8h6"/><path d="M9 12h6"/></svg>`;
      }
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/><path d="M12 4v16"/><circle cx="12" cy="12" r="9"/></svg>`;
    }

    const launchCardsHtml = launchCards.map((card) => `
      <a href="${card.href}" class="accounting-launch-card" style="background:${card.tone}">
        <div class="accounting-launch-icon">${launchIcon(card.icon)}</div>
        <div class="accounting-launch-eyebrow">${escapeHtml(card.eyebrow)}</div>
        <div class="accounting-launch-title">${escapeHtml(card.title)}</div>
        <div class="accounting-launch-copy">${escapeHtml(card.copy)}</div>
        <div class="accounting-launch-meta">${card.meta}</div>
        <div class="accounting-launch-cta">${escapeHtml(card.cta)} <span aria-hidden="true">→</span></div>
      </a>
    `).join("");

    const focusItems = [
      Number(declarationStats.urgent_count || 0) > 0
        ? {
          title: "Declarații aproape de scadență",
          text: `${Number(declarationStats.urgent_count || 0)} declarații sunt pregătite sau respinse și au scadență în următoarele 7 zile.`,
          href: "/accounting/declarations",
          cta: "Intră în declarații",
          tone: "amber"
        }
        : null,
      canAccessSpvWorkspace && Number(inboxStats.inbox_unprocessed_count || 0) > 0
        ? {
          title: "Inbox SPV de procesat",
          text: `${Number(inboxStats.inbox_unprocessed_count || 0)} documente noi din SPV așteaptă verificare și clasificare.`,
          href: "/anaf/inbox",
          cta: "Deschide inboxul",
          tone: "blue"
        }
        : null,
      Number(invoiceStats.overdue_count || 0) > 0
        ? {
          title: "Facturi restante la încasare",
          text: `${Number(invoiceStats.overdue_count || 0)} facturi au depășit scadența, în valoare de ${escapeHtml(fmtMoney(invoiceStats.overdue_amount || 0))} RON.`,
          href: "/accounting",
          cta: "Vezi registrul",
          tone: "red"
        }
        : null,
      Number(expenseStats.unpaid_count || 0) > 0
        ? {
          title: "Cheltuieli neînchise",
          text: `${Number(expenseStats.unpaid_count || 0)} cheltuieli nu sunt marcate plătite și cer atenție contabilă.`,
          href: "/accounting/expenses",
          cta: "Mergi la cheltuieli",
          tone: "green"
        }
        : null
    ].filter(Boolean);

    const focusItemsHtml = focusItems.length
      ? focusItems.map((item) => `
        <div class="accounting-focus-card accounting-focus-${item.tone}">
          <div class="accounting-focus-title">${escapeHtml(item.title)}</div>
          <div class="accounting-focus-copy">${escapeHtml(item.text)}</div>
          <div class="accounting-focus-link">${escapeHtml(item.cta)}</div>
        </div>
      `).join("")
      : `
        <div class="accounting-focus-card accounting-focus-green">
          <div class="accounting-focus-title">Zi liniștită în contabilitate</div>
          <div class="accounting-focus-copy">Nu există alerte majore în acest moment. Poți merge direct în fluxul în care ai de lucrat.</div>
          <div class="accounting-focus-link">Totul este sub control</div>
        </div>
      `;

    const declarationPreviewHtml = recentDeclarations.map((row) => `
      <div class="accounting-mini-row">
        <div>
          <div style="font-weight:800">${escapeHtml(row.declaration_type || "Declarație")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.period_label || "fără perioadă")}</div>
        </div>
        <div style="text-align:right">
          <div>${declarationStatusBadge(escapeHtml, row.status)}</div>
          <div class="crm-muted" style="margin-top:6px">${escapeHtml(row.due_date || row.reference_number || "—")}</div>
        </div>
      </div>
    `).join("");

    const expensePreviewHtml = recentExpenses.map((row) => `
      <div class="accounting-mini-row">
        <div>
          <div style="font-weight:800">${escapeHtml(row.supplier_name || "Furnizor")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.expense_type || "cheltuială")} · ${escapeHtml(row.issue_date || "—")}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800">${escapeHtml(fmtMoney(row.total || 0))} ${escapeHtml(String(row.currency || "RON"))}</div>
          <div class="crm-muted" style="margin-top:6px">${escapeHtml(String(row.payment_status || "—").toLowerCase())}</div>
        </div>
      </div>
    `).join("");

    const deadlineRowsHtml = declarationDeadlines.map((row) => {
      const due = String(row.due_date || "").trim();
      const status = String(row.status || "PREGATITA").trim().toUpperCase();
      const toneClass = due && due < new Date().toISOString().slice(0, 10)
        ? "accounting-deadline-red"
        : due && due <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          ? "accounting-deadline-amber"
          : "accounting-deadline-blue";
      return `
        <div class="accounting-deadline-row ${toneClass}">
          <div>
            <div style="font-weight:800">${escapeHtml(row.declaration_type || "Declarație")}</div>
            <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.period_label || "fără perioadă")}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800">${escapeHtml(due || "fără scadență")}</div>
            <div style="margin-top:6px">${declarationStatusBadge(escapeHtml, status)}</div>
          </div>
        </div>
      `;
    }).join("");

    const onboardingSteps = [
      canAccessSpvWorkspace
        ? {
          title: "Verifică SPV și recipisele",
          copy: "Începe ziua cu inboxul SPV și cu declarațiile trimise care așteaptă validare sau recipisă.",
          href: "/anaf/inbox",
          cta: "Mergi la SPV"
        }
        : {
          title: "Verifică declarațiile și recipisele",
          copy: "Începe ziua cu declarațiile pregătite, recipisele primite și scadențele fiscale apropiate.",
          href: "/accounting/declarations",
          cta: "Mergi la declarații"
        },
      {
        title: "Înregistrează cheltuieli și documente",
        copy: "Adaugă facturile de intrare, bonurile fiscale și cheltuielile neînregistrate.",
        href: "/accounting/expenses",
        cta: "Deschide cheltuielile"
      },
      {
        title: "Închide ziua cu reconcilierea",
        copy: "Compară încasările, facturile și plățile rămase în verificare pentru control final.",
        href: "/accounting#reconciliere",
        cta: "Vezi reconcilierea"
      }
    ];

    const onboardingHtml = onboardingSteps.map((step, index) => `
      <div class="accounting-onboarding-step">
        <div class="accounting-onboarding-index">0${index + 1}</div>
        <div>
          <div class="accounting-onboarding-title">${escapeHtml(step.title)}</div>
          <div class="accounting-onboarding-copy">${escapeHtml(step.copy)}</div>
          <div class="accounting-onboarding-link">${escapeHtml(step.cta)}</div>
        </div>
      </div>
    `).join("");

    const pageIntro = isAccountingUser
      ? canAccessSpvWorkspace
        ? "Workspace premium pentru contabil, construit ca punct unic de lucru pentru ANAF, e-Factura, registre și verificări."
        : "Workspace premium pentru contabil, construit ca punct unic de lucru pentru declarații, registre și verificări contabile."
      : canAccessSpvWorkspace
        ? "Panou premium pentru facturi, e-Factura SPV, plăți și verificări contabile."
        : "Panou premium pentru facturi, plăți și verificări contabile.";

    res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Contabilitate</title>
<style>
  .accounting-premium-shell{
    display:grid;
    gap:14px;
  }
  .accounting-premium-hero{
    position:relative;
    overflow:hidden;
    border-radius:22px;
    padding:24px;
    color:#fff;
    background:
      radial-gradient(circle at top left, rgba(255,255,255,.2), transparent 34%),
      radial-gradient(circle at bottom right, rgba(45,212,191,.24), transparent 28%),
      linear-gradient(135deg,#0f172a 0%, #102a5c 38%, #0f766e 100%);
    box-shadow:0 20px 46px rgba(15,23,42,.22);
  }
  .accounting-premium-hero::after{
    content:"";
    position:absolute;
    inset:auto -80px -120px auto;
    width:280px;
    height:280px;
    border-radius:999px;
    background:rgba(255,255,255,.08);
    filter:blur(8px);
  }
  .accounting-premium-grid{
    display:grid;
    grid-template-columns:1.35fr .9fr;
    gap:14px;
    align-items:stretch;
  }
  .accounting-hero-top{
    display:flex;
    justify-content:space-between;
    gap:12px;
    align-items:flex-start;
    flex-wrap:wrap;
  }
  .accounting-hero-kpis{
    display:grid;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:10px;
    margin-top:18px;
  }
  .accounting-kpi-glass{
    border:1px solid rgba(255,255,255,.16);
    border-radius:16px;
    padding:12px 14px;
    background:rgba(255,255,255,.08);
    backdrop-filter:blur(10px);
  }
  .accounting-kpi-glass strong{
    display:block;
    font-size:22px;
    line-height:1.1;
    margin-top:6px;
  }
  .accounting-side-panel{
    border-radius:20px;
    padding:18px;
    background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(241,245,249,.94));
    border:1px solid rgba(148,163,184,.22);
    box-shadow:0 14px 30px rgba(15,23,42,.08);
  }
  .accounting-chip-row{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:6px;
    margin-top:10px;
  }
  .accounting-chip{
    display:flex;
    align-items:center;
    justify-content:center;
    min-width:0;
    padding:4px 8px;
    min-height:26px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.22);
    background:rgba(255,255,255,.92);
    color:#172033;
    font-weight:800;
    font-size:11px;
    letter-spacing:.01em;
    line-height:1.1;
    text-align:center;
    box-shadow:0 6px 14px rgba(15,23,42,.10);
  }
  .accounting-launch-grid{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:12px;
  }
  .accounting-launch-card{
    display:flex;
    flex-direction:column;
    gap:10px;
    min-height:190px;
    padding:18px;
    border-radius:20px;
    color:#fff;
    text-decoration:none;
    box-shadow:0 14px 28px rgba(15,23,42,.12);
    transition:transform .16s ease, box-shadow .16s ease;
  }
  .accounting-launch-card:hover{
    transform:translateY(-3px);
    box-shadow:0 18px 34px rgba(15,23,42,.16);
  }
  .accounting-launch-icon{
    width:44px;
    height:44px;
    border-radius:14px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    background:rgba(255,255,255,.12);
    border:1px solid rgba(255,255,255,.18);
  }
  .accounting-launch-icon svg{
    width:20px;
    height:20px;
    stroke:currentColor;
    fill:none;
    stroke-width:1.9;
    stroke-linecap:round;
    stroke-linejoin:round;
  }
  .accounting-launch-eyebrow{
    font-size:11px;
    font-weight:800;
    letter-spacing:.12em;
    text-transform:uppercase;
    opacity:.78;
  }
  .accounting-launch-title{
    font-size:21px;
    line-height:1.05;
    font-weight:800;
  }
  .accounting-launch-copy{
    color:rgba(255,255,255,.84);
    line-height:1.5;
  }
  .accounting-launch-meta{
    margin-top:auto;
    font-size:12px;
    color:rgba(255,255,255,.8);
  }
  .accounting-launch-cta{
    font-weight:800;
    letter-spacing:.01em;
  }
  .accounting-focus-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:12px;
  }
  .accounting-focus-card{
    display:block;
    border-radius:18px;
    padding:16px;
    text-decoration:none;
    border:1px solid rgba(148,163,184,.22);
    box-shadow:0 10px 22px rgba(15,23,42,.06);
    background:#fff;
  }
  .accounting-focus-blue{ background:linear-gradient(135deg,#eff6ff,#dbeafe); }
  .accounting-focus-amber{ background:linear-gradient(135deg,#fffbeb,#fef3c7); }
  .accounting-focus-red{ background:linear-gradient(135deg,#fff1f2,#ffe4e6); }
  .accounting-focus-green{ background:linear-gradient(135deg,#ecfdf5,#d1fae5); }
  .accounting-focus-title{
    font-size:16px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-focus-copy{
    margin-top:6px;
    color:#334155;
    line-height:1.5;
  }
  .accounting-focus-link{
    margin-top:12px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-mini-stack{
    display:grid;
    gap:8px;
  }
  .accounting-mini-row{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    padding:12px 14px;
    border-radius:14px;
    border:1px solid rgba(148,163,184,.16);
    background:rgba(255,255,255,.82);
    text-decoration:none;
    color:inherit;
  }
  .accounting-deadline-row{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    padding:12px 14px;
    border-radius:14px;
    text-decoration:none;
    color:inherit;
    border:1px solid rgba(148,163,184,.16);
  }
  .accounting-deadline-blue{ background:linear-gradient(135deg,#eff6ff,#f8fafc); }
  .accounting-deadline-amber{ background:linear-gradient(135deg,#fffbeb,#fef3c7); }
  .accounting-deadline-red{ background:linear-gradient(135deg,#fff1f2,#ffe4e6); }
  .accounting-onboarding{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:12px;
  }
  .accounting-onboarding-step{
    display:flex;
    gap:12px;
    align-items:flex-start;
    padding:14px;
    border-radius:18px;
    border:1px solid rgba(148,163,184,.18);
    background:linear-gradient(180deg,#ffffff,#f8fafc);
    text-decoration:none;
    color:inherit;
    box-shadow:0 10px 22px rgba(15,23,42,.05);
  }
  .accounting-onboarding-index{
    min-width:36px;
    height:36px;
    border-radius:12px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    background:linear-gradient(135deg,#0f172a,#2563eb);
    color:#fff;
    font-weight:800;
    letter-spacing:.04em;
  }
  .accounting-onboarding-title{
    font-size:16px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-onboarding-copy{
    margin-top:6px;
    line-height:1.5;
    color:#475569;
  }
  .accounting-onboarding-link{
    margin-top:10px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-section-head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    flex-wrap:wrap;
    margin-bottom:14px;
  }
  @media (max-width: 1440px), (max-height: 900px){
    .accounting-premium-hero{
      padding:20px;
    }
    .accounting-premium-grid{
      gap:12px;
    }
    .accounting-side-panel{
      padding:16px;
    }
    .accounting-launch-card{
      min-height:176px;
      padding:16px;
    }
    .accounting-kpi-glass strong{
      font-size:20px;
    }
  }
  @media (max-width: 1100px){
    .accounting-premium-grid,
    .accounting-launch-grid,
    .accounting-focus-grid,
    .accounting-onboarding{
      grid-template-columns:1fr;
    }
    .accounting-hero-kpis{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
  }
  @media (max-width: 720px){
    .accounting-premium-hero{
      padding:18px;
    }
    .accounting-hero-kpis{
      grid-template-columns:1fr;
    }
    .accounting-chip-row{
      grid-template-columns:1fr;
    }
  }
</style>
</head>
${crmShellStart("accounting-home", "Contabilitate", pageIntro, userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="accounting-premium-shell">
    <section class="accounting-premium-grid">
      <div class="accounting-premium-hero">
        <div class="accounting-hero-top">
          <div>
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${isAccountingUser ? "Premium Accounting Desk" : "Accounting Mission Control"}</div>
            <h2 style="margin:14px 0 8px 0;font-size:34px;line-height:1.02;max-width:740px">${isAccountingUser ? "Bun venit în cabinetul tău contabil." : "Tot ce contează pentru contabilitate, într-un singur loc."}</h2>
            <div style="max-width:740px;color:rgba(255,255,255,.82);font-size:14px;line-height:1.6">
              ${isAccountingUser
                ? canAccessSpvWorkspace
                  ? "Intră direct în declarații ANAF, e-Factura SPV, cheltuieli, bonuri de consum și reconciliere, fără să cauți prin meniuri. Pagina este gândită ca punctul tău zilnic de lucru."
                  : "Intră direct în declarații ANAF, cheltuieli, bonuri de consum și reconciliere, fără să cauți prin meniuri. Pagina este gândită ca punctul tău zilnic de lucru."
                : canAccessSpvWorkspace
                  ? "Vezi rapid ce facturi sunt de încasat, ce mai așteaptă confirmare din SPV, ce declarații sunt aproape de scadență și în ce zonă trebuie să intri mai întâi."
                  : "Vezi rapid ce facturi sunt de încasat, ce declarații sunt aproape de scadență și în ce zonă trebuie să intri mai întâi."}
            </div>
          </div>
          <div style="min-width:210px;max-width:236px;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px;background:rgba(255,255,255,.08);backdrop-filter:blur(8px)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.72);font-weight:800">${canAccessSpvWorkspace ? "Stare ANAF" : "Control contabil"}</div>
            <div style="margin-top:4px;font-size:20px;line-height:1.05;font-weight:800">${canAccessSpvWorkspace ? (Number(spvStats.active_connections || 0) > 0 ? "Conectat" : "Necesită conectare") : (Number(declarationStats.urgent_count || 0) > 0 ? "Ai scadențe aproape" : "Fără alerte urgente")}</div>
            <div style="margin-top:6px;color:rgba(255,255,255,.76);line-height:1.4;font-size:12px">${canAccessSpvWorkspace ? latestConnectionStatus : `${escapeHtml(String(declarationStats.urgent_count || 0))} declarații urgente · ${escapeHtml(String(invoiceStats.overdue_count || 0))} facturi restante`}</div>
            <div class="accounting-chip-row">
              ${canAccessSpvWorkspace
                ? `<span class="accounting-chip">${Number(inboxStats.inbox_unprocessed_count || 0)} SPV nou</span>
              <span class="accounting-chip">${Number(messageStats.outbox_error_count || 0)} erori</span>`
                : `<span class="accounting-chip">${Number(declarationStats.pregatita_count || 0)} declarații pregătite</span>
              <span class="accounting-chip">${Number(expenseStats.unpaid_count || 0)} cheltuieli neplătite</span>`}
            </div>
          </div>
        </div>

        <div class="accounting-hero-kpis">
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Facturi emise luna asta</div>
            <strong>${escapeHtml(String(invoiceMonth.issued_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(fmtMoney(invoiceMonth.issued_amount || 0))} RON</div>
          </div>
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Restanțe la încasare</div>
            <strong>${escapeHtml(String(invoiceStats.overdue_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(fmtMoney(invoiceStats.overdue_amount || 0))} RON</div>
          </div>
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Declarații pregătite</div>
            <strong>${escapeHtml(String(declarationStats.pregatita_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(String(declarationStats.urgent_count || 0))} urgente în 7 zile</div>
          </div>
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Cheltuieli neplătite</div>
            <strong>${escapeHtml(String(expenseStats.unpaid_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(fmtMoney(expenseStats.unpaid_amount || 0))} RON</div>
          </div>
        </div>
      </div>

      <section class="accounting-side-panel">
        <div class="accounting-section-head" style="margin-bottom:14px">
          <div>
            <div class="crm-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em">Control rapid</div>
            <h3 style="margin:6px 0 0 0;font-size:22px">Ce cere atenție acum</h3>
          </div>
        </div>
        <div class="accounting-focus-grid" style="grid-template-columns:1fr;max-height:none">
          ${focusItemsHtml}
        </div>
      </section>
    </section>

    <div class="crm-grid-2" style="align-items:start">
      <section class="crm-card">
        <div class="accounting-section-head">
          <div>
            <h3 style="margin:0;font-size:22px">Radar declarații ANAF</h3>
            <div class="crm-muted" style="margin-top:6px">Ultimele declarații și stadiul lor operațional.</div>
          </div>
        </div>
        <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px">
          <div class="crm-kpi"><div class="crm-kpi-label">Pregătite</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.pregatita_count || 0))}</div></div>
          <div class="crm-kpi"><div class="crm-kpi-label">Trimise</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.trimisa_count || 0))}</div></div>
          <div class="crm-kpi"><div class="crm-kpi-label">Validate</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.validata_count || 0))}</div></div>
          <div class="crm-kpi"><div class="crm-kpi-label">Respinse</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.respinsa_count || 0))}</div></div>
        </div>
        <div class="accounting-mini-stack">
          ${declarationPreviewHtml || `<div class="crm-muted">Nu există declarații înregistrate.</div>`}
        </div>
        <div style="margin-top:18px">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#64748b;margin-bottom:10px">Scadențe următoare</div>
          <div class="accounting-mini-stack">
            ${deadlineRowsHtml || `<div class="crm-muted">Nu există scadențe ANAF înregistrate.</div>`}
          </div>
        </div>
      </section>

      <section class="crm-card">
        <div class="accounting-section-head">
          <div>
            <h3 style="margin:0;font-size:22px">Cheltuieli și consumuri</h3>
            <div class="crm-muted" style="margin-top:6px">Documentele de intrare și consumul intern la zi.</div>
          </div>
        </div>
        <div class="crm-grid-2" style="margin-bottom:16px">
          <div class="crm-kpi">
            <div class="crm-kpi-label">Cheltuieli totale</div>
            <div class="crm-kpi-value">${escapeHtml(String(expenseStats.total_count || 0))}</div>
            <div class="crm-muted" style="margin-top:6px">${escapeHtml(fmtMoney(expenseStats.total_amount || 0))} RON</div>
          </div>
          <div class="crm-kpi">
            <div class="crm-kpi-label">Bonuri de consum</div>
            <div class="crm-kpi-value">${escapeHtml(String(consumptionStats.total_count || 0))}</div>
            <div class="crm-muted" style="margin-top:6px">Ultimul: ${escapeHtml(consumptionStats.last_issue_date || "—")}</div>
          </div>
        </div>
        <div class="accounting-mini-stack">
          ${expensePreviewHtml || `<div class="crm-muted">Nu există cheltuieli înregistrate.</div>`}
        </div>
      </section>
    </div>

  <div class="crm-grid-3" style="align-items:start">
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Ultimele facturi</h3>
          <div class="crm-muted" style="margin-top:6px">Status comercial și status e-Factura în aceeași vedere.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Factură</th>
              <th>Status</th>
              <th>e-Factura</th>
              <th class="crm-right">Total</th>
              <th>Emitere</th>
              <th>Scadență</th>
            </tr>
          </thead>
          <tbody>${invoiceRowsHtml || `<tr><td colspan="6" class="crm-muted">Nu există facturi înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    ${canAccessSpvWorkspace ? `
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Inbox SPV</h3>
          <div class="crm-muted" style="margin-top:6px">Facturi primite și elemente care mai trebuie procesate.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Status</th>
              <th>Primit la</th>
            </tr>
          </thead>
          <tbody>${inboxRowsHtml || `<tr><td colspan="3" class="crm-muted">Inboxul SPV este gol.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(15,23,42,.04);border:1px solid var(--line)">
        <div class="crm-muted" style="font-size:12px">Ultima factură primită</div>
        <div style="margin-top:6px;font-weight:800">${escapeHtml(inboxStats.last_received_at || "—")}</div>
      </div>
    </section>
    ` : ``}

    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Plăți și reconciliere</h3>
          <div class="crm-muted" style="margin-top:6px">Plăți înregistrate prin billing, utile pentru urmărirea încasărilor.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Plată</th>
              <th>Status</th>
              <th class="crm-right">Sumă</th>
              <th>Moment</th>
            </tr>
          </thead>
          <tbody>${paymentRowsHtml || `<tr><td colspan="4" class="crm-muted">Nu există plăți înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;display:grid;gap:10px">
        <div style="padding:14px 16px;border-radius:16px;background:rgba(15,23,42,.04);border:1px solid var(--line)">
          <div class="crm-muted" style="font-size:12px">Total plăți urmărite</div>
          <div style="margin-top:6px;font-weight:800">${escapeHtml(String(paymentStats.total_count || 0))}</div>
        </div>
        <div style="padding:14px 16px;border-radius:16px;background:rgba(15,23,42,.04);border:1px solid var(--line)">
          <div class="crm-muted" style="font-size:12px">${canAccessSpvWorkspace ? "Conexiuni ANAF salvate" : "Declarații urgente"}</div>
          <div style="margin-top:6px;font-weight:800">${escapeHtml(String(canAccessSpvWorkspace ? ((spvStats.prod_connections || 0) + (spvStats.test_connections || 0)) : (declarationStats.urgent_count || 0)))}</div>
        </div>
      </div>
    </section>
  </div>

  <section class="crm-card" id="reconciliere" style="margin-top:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h3 style="margin:0;font-size:20px">Reconciliere plăți / încasări</h3>
        <div class="crm-muted" style="margin-top:6px">Verificare rapidă între plățile urmărite în sistem și facturile interne generate pentru ele.</div>
      </div>
    </div>

    <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
      <div class="crm-kpi">
        <div class="crm-kpi-label">Reconciliate</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.matched_count || 0))}</div>
      </div>
      <div class="crm-kpi">
        <div class="crm-kpi-label">Plată fără încasare</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.payment_not_marked_count || 0))}</div>
      </div>
      <div class="crm-kpi">
        <div class="crm-kpi-label">Plată fără factură</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.payment_without_invoice_count || 0))}</div>
      </div>
      <div class="crm-kpi">
        <div class="crm-kpi-label">Factură legată, plată în curs</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.pending_link_count || 0))}</div>
      </div>
    </div>

    <section class="crm-card" style="background:rgba(15,23,42,.02)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:18px">Plăți urmărite</h3>
          <div class="crm-muted" style="margin-top:6px">Ultimele plăți și starea lor de reconciliere.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Plată</th>
              <th>Status plată</th>
              <th>Reconciliere</th>
              <th>Factură</th>
              <th class="crm-right">Sumă</th>
              <th>Moment</th>
            </tr>
          </thead>
          <tbody>${reconciliationRowsHtml || `<tr><td colspan="6" class="crm-muted">Nu există plăți pentru reconciliere.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </section>
</div>

${crmShellEnd()}
`);
  });
}
