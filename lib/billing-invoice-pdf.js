import fs from "fs";
import Mustache from "mustache";
import path from "path";
import { fileURLToPath } from "url";
import { renderPdfBuffer } from "../pdf.js";
import { fmt2 } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function settingKey(companyId, key) {
  return `company:${Number(companyId || 0)}:${String(key || "").trim()}`;
}

function readSetting(db, companyId, key, fallback = "") {
  const normalizedCompanyId = Number(companyId || 0);
  if (normalizedCompanyId > 0) {
    const scoped = db.prepare("SELECT value FROM app_settings WHERE key=?").get(settingKey(normalizedCompanyId, key));
    if (scoped) return scoped.value;
  }
  const global = db.prepare("SELECT value FROM app_settings WHERE key=?").get(key);
  return global ? global.value : fallback;
}

function invoiceTheme(db, companyId) {
  const theme = String(readSetting(db, companyId, "invoice_color", "#0f766e") || "#0f766e").trim();
  const match = theme.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return { theme: "#0f766e", light: "#d9f0d5" };
  const raw = match[1];
  const mix = (hex) => {
    const value = parseInt(hex, 16);
    return Math.round(value + (255 - value) * 0.82).toString(16).padStart(2, "0");
  };
  return {
    theme: `#${raw}`,
    light: `#${mix(raw.slice(0, 2))}${mix(raw.slice(2, 4))}${mix(raw.slice(4, 6))}`,
  };
}

function invoiceLogoDataUri(companyId) {
  const scopedCandidates = ["png", "jpg", "jpeg", "webp"].map((ext) =>
    path.join(rootDir, "public", "uploads", "company-logos", `company-${Number(companyId || 0)}.${ext}`),
  );
  const candidate = scopedCandidates.find((file) => fs.existsSync(file)) ||
    path.join(rootDir, "public", "invoice-logo.png");
  try {
    if (!fs.existsSync(candidate)) return "";
    const buffer = fs.readFileSync(candidate);
    const ext = path.extname(candidate).replace(".", "").toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

function safeFileName(value) {
  return String(value || "factura").replace(/[^A-Za-z0-9._-]/g, "_");
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = value ? JSON.parse(String(value)) : fallback;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function invoiceBrand(db, facturaId) {
  const payment = db.prepare(`
    SELECT payment_kind, metadata
    FROM billing_payments
    WHERE generated_factura_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(Number(facturaId || 0));
  const metadata = parseJson(payment?.metadata, {});
  return String(metadata.invoice_brand || (String(payment?.payment_kind || "") === "emarqet_subscription" ? "e-Marqet" : "Trevoro")).trim() || "Trevoro";
}

export async function maybeGenerateBillingInvoicePdf(db, facturaId) {
  const normalizedFacturaId = Number(facturaId || 0);
  if (!normalizedFacturaId) return { ok: false, skipped: true, reason: "missing_invoice_id" };

  const invoice = db.prepare(`
    SELECT f.*, c.name AS client_name, c.cui AS client_cui, c.address AS client_address, c.country AS client_country, c.reg_com AS client_reg_com
    FROM facturi f
    JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
    WHERE f.id=?
    LIMIT 1
  `).get(normalizedFacturaId);
  if (!invoice) return { ok: false, skipped: true, reason: "invoice_not_found" };

  if (invoice.pdf_path && fs.existsSync(path.join(rootDir, invoice.pdf_path))) {
    return { ok: true, skipped: true, reason: "pdf_already_exists", pdfPath: invoice.pdf_path };
  }

  const companyId = Number(invoice.company_id || 0);
  const lines = db.prepare(`
    SELECT denumire, descriere, cantitate, unitate, pret_unitar, total_linie
    FROM facturi_linii
    WHERE factura_id=? AND company_id=?
    ORDER BY sort_order ASC, id ASC
  `).all(invoice.id, companyId);
  const brand = invoiceBrand(db, invoice.id);

  const templateHtml = fs.readFileSync(path.join(rootDir, "invoice_template.html"), "utf8");
  const theme = invoiceTheme(db, companyId);
  const html = Mustache.render(templateHtml, {
    theme_color: theme.theme,
    theme_color_light: theme.light,
    logo_data_uri: invoiceLogoDataUri(companyId),
    serie: String(invoice.factura_nr || "INV").split("-")[0] || "INV",
    numar: String(invoice.factura_nr || ""),
    factura_nr: invoice.factura_nr,
    data_emitere: String(invoice.data_emitere || "").slice(0, 10),
    scadenta: invoice.scadenta ? String(invoice.scadenta).slice(0, 10) : "",
    status: invoice.status || "INCASATA",
    moneda: invoice.moneda || "RON",
    subtotal: fmt2(invoice.subtotal),
    tva_percent: Math.round(Number(invoice.tva_procent || 0) * 100),
    tva_valoare: fmt2(invoice.tva_valoare),
    total: fmt2(invoice.total),
    observatii: invoice.observatii || "",
    app_name: brand,
    doc_code: "-",
    intocmit_de: readSetting(db, companyId, "company_rep", "-") || "-",
    invoice_footer: readSetting(db, companyId, "invoice_footer", "Factura este valabila fara semnatura conform legii."),
    spv_index: invoice.efactura_upload_index || invoice.efactura_message_id || "",
    spv_date: invoice.efactura_last_checked_at || "",
    show_tva: Number(invoice.tva_procent || 0) > 0,
    furnizor: {
      name: readSetting(db, companyId, "company_name", "Trevoro"),
      cui: readSetting(db, companyId, "company_cui", ""),
      rc: readSetting(db, companyId, "company_rc", ""),
      address: readSetting(db, companyId, "company_address", ""),
      judet: "-",
      iban: readSetting(db, companyId, "company_iban", ""),
      bank: readSetting(db, companyId, "company_bank", ""),
    },
    client: {
      name: invoice.client_name || "",
      cui: invoice.client_cui || "",
      address: invoice.client_address || "",
      reg_com: invoice.client_reg_com || "",
      judet: "-",
      tara: invoice.client_country || "Romania",
    },
    lines: lines.map((line, index) => ({
      idx: index + 1,
      denumire: line.denumire || "",
      descriere: line.descriere || "",
      cantitate: String(line.cantitate ?? ""),
      unitate: line.unitate || "",
      pret_unitar: fmt2(line.pret_unitar),
      total_linie: fmt2(line.total_linie),
    })),
  });

  const pdf = await renderPdfBuffer(html);
  const year = Number(invoice.an || new Date().getUTCFullYear());
  const yearDir = path.join(rootDir, "contracts", "invoices", String(year));
  fs.mkdirSync(yearDir, { recursive: true });

  const fileName = `${safeFileName(invoice.factura_nr)}.pdf`;
  const absPath = path.join(yearDir, fileName);
  const pdfPath = `contracts/invoices/${year}/${fileName}`;
  fs.writeFileSync(absPath, pdf);

  db.prepare(`
    UPDATE facturi
    SET pdf_path=?,
        status=CASE
          WHEN UPPER(COALESCE(status,'')) IN ('CIORNA','DRAFT') THEN 'FACTURA_GENERATA'
          ELSE status
        END
    WHERE id=? AND company_id=?
  `).run(pdfPath, invoice.id, companyId);

  return { ok: true, pdfPath, absPath };
}
