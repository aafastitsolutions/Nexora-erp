import {
  emarqetOfficeEmail,
  emarqetSupportEmail
} from "./emarqet-mailboxes.js";

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value, currency = "RON") {
  return `${Number(value || 0).toFixed(2)} ${String(currency || "RON").toUpperCase()}`;
}

function autoEmailEnabled() {
  return enabled(process.env.BILLING_AUTO_INVOICE_EMAIL_ENABLED);
}

function invoiceCc(brand = "") {
  if (String(brand || "").trim().toLowerCase() === "e-marqet" && process.env.EMARQET_INVOICE_EMAIL_CC !== undefined) {
    return String(process.env.EMARQET_INVOICE_EMAIL_CC || "").trim();
  }
  return String(process.env.BILLING_INVOICE_EMAIL_CC || "contact@trevoro.ro").trim();
}

function fromAddress(brand = "") {
  if (String(brand || "").trim().toLowerCase() === "e-marqet") return emarqetOfficeEmail();
  return String(process.env.MAIL_FROM || process.env.SMTP_USER || "contact@trevoro.ro").trim();
}

function invoiceUrl(facturaId) {
  const baseUrl = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/factura/${encodeURIComponent(String(facturaId))}` : "";
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = value ? JSON.parse(String(value)) : fallback;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function recordInvoiceEmailMetadata(db, paymentId, paymentMetadata = {}, patch = {}) {
  const normalizedPaymentId = Number(paymentId || 0);
  if (!normalizedPaymentId) return;
  const metadata = paymentMetadata && typeof paymentMetadata === "object" && !Array.isArray(paymentMetadata)
    ? { ...paymentMetadata }
    : {};
  const previous = metadata.invoice_email && typeof metadata.invoice_email === "object" && !Array.isArray(metadata.invoice_email)
    ? metadata.invoice_email
    : {};
  metadata.invoice_email = {
    ...previous,
    ...patch
  };
  try {
    db.prepare(`
      UPDATE billing_payments
      SET metadata=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(JSON.stringify(metadata), normalizedPaymentId);
  } catch (error) {
    console.error("Billing invoice email metadata update failed:", error?.message || error);
  }
}

export async function maybeEmailBillingInvoice(db, facturaId, { transporter } = {}) {
  const normalizedFacturaId = Number(facturaId || 0);
  if (!normalizedFacturaId || !autoEmailEnabled()) {
    return { ok: false, skipped: true, reason: "auto_invoice_email_disabled" };
  }
  if (!transporter) {
    return { ok: false, skipped: true, reason: "mail_transporter_missing" };
  }

  const invoice = db.prepare(`
    SELECT f.*, c.name AS client_name, c.cui AS client_cui, c.address AS client_address
    FROM facturi f
    JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
    WHERE f.id=?
    LIMIT 1
  `).get(normalizedFacturaId);
  if (!invoice) return { ok: false, skipped: true, reason: "invoice_not_found" };

  const payment = db.prepare(`
    SELECT id, payer_email, payer_name, reference_code, payment_kind, metadata
    FROM billing_payments
    WHERE generated_factura_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(normalizedFacturaId);

  const to = String(payment?.payer_email || "").trim();
  if (!to) return { ok: false, skipped: true, reason: "payer_email_missing" };

  const lines = db.prepare(`
    SELECT denumire, cantitate, unitate, pret_unitar, total_linie
    FROM facturi_linii
    WHERE factura_id=? AND company_id=?
    ORDER BY sort_order ASC, id ASC
  `).all(invoice.id, invoice.company_id);

  const paymentMetadata = parseJson(payment?.metadata, {});
  const brand = String(paymentMetadata.invoice_brand || (String(payment?.payment_kind || "") === "emarqet_subscription" ? "e-Marqet" : "Trevoro")).trim() || "Trevoro";
  const supportEmail = String(paymentMetadata.support_email || (brand === "e-Marqet" ? emarqetSupportEmail() : "") || process.env.MAIL_FROM || "contact@trevoro.ro").trim();
  const cc = invoiceCc(brand);
  const displayNumber = String(invoice.factura_nr || `Factura ${invoice.id}`);
  const subject = `Factura ${displayNumber} - abonament ${brand}`;
  const link = invoiceUrl(invoice.id);
  const pdfPath = String(invoice.pdf_path || "").trim();
  const absPdfPath = pdfPath ? path.join(rootDir, pdfPath) : "";
  const hasPdf = Boolean(absPdfPath && fs.existsSync(absPdfPath));
  const attachmentName = `${displayNumber.replace(/[^A-Za-z0-9._ -]/g, "_")}.pdf`;
  const rows = lines.map((line) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(line.denumire || "")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(String(line.cantitate || "1"))}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(line.unitate || "luna")}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(formatMoney(line.pret_unitar, invoice.moneda))}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(formatMoney(line.total_linie, invoice.moneda))}</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f6f8fb;padding:24px;color:#10201c">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dde5ee;border-radius:14px;overflow:hidden">
        <div style="background:#0f766e;color:#ffffff;padding:22px 24px">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">${escapeHtml(brand)}</div>
          <h1 style="margin:8px 0 0;font-size:26px">Factura abonament</h1>
        </div>
        <div style="padding:24px">
          <p>Buna ziua,</p>
          <p>Dorim sa va informam ca a fost emisa factura pentru abonamentul dumneavoastra.</p>
          <p>Va multumim pentru colaborare.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0">
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase">Factura</div>
              <strong>${escapeHtml(displayNumber)}</strong>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase">Total</div>
              <strong>${escapeHtml(formatMoney(invoice.total, invoice.moneda))}</strong>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase">Client</div>
              <strong>${escapeHtml(invoice.client_name || "")}</strong>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase">Status e-Factura</div>
              <strong>${escapeHtml(invoice.efactura_status || "netrimis")}</strong>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <thead>
              <tr>
                <th style="text-align:left;padding:10px;border-bottom:2px solid #dbe3ea">Serviciu</th>
                <th style="text-align:right;padding:10px;border-bottom:2px solid #dbe3ea">Cant.</th>
                <th style="text-align:left;padding:10px;border-bottom:2px solid #dbe3ea">UM</th>
                <th style="text-align:right;padding:10px;border-bottom:2px solid #dbe3ea">Pret</th>
                <th style="text-align:right;padding:10px;border-bottom:2px solid #dbe3ea">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${link ? `<p style="margin-top:22px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:700">Deschide factura in Nexora</a></p>` : ""}
          <p style="margin-top:24px;color:#64748b;font-size:13px">Acesta este un mesaj automat. Pentru suport: ${escapeHtml(supportEmail)}.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    "Buna ziua,",
    "Dorim sa va informam ca a fost emisa factura pentru abonamentul dumneavoastra.",
    "Va multumim pentru colaborare.",
    "",
    `Factura ${displayNumber} - abonament ${brand}`,
    `Client: ${invoice.client_name || ""}`,
    `Total: ${formatMoney(invoice.total, invoice.moneda)}`,
    `Status e-Factura: ${invoice.efactura_status || "netrimis"}`,
    link ? `Link: ${link}` : ""
  ].filter(Boolean).join("\n");

  let info;
  try {
    info = await transporter.sendMail({
      from: fromAddress(brand),
      to,
      cc: cc || undefined,
      replyTo: supportEmail || undefined,
      subject,
      text,
      html,
      attachments: hasPdf ? [{ filename: attachmentName, path: absPdfPath }] : undefined,
      allowWhenTrevoroEmailPaused: true
    });
  } catch (error) {
    recordInvoiceEmailMetadata(db, payment?.id, paymentMetadata, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error: String(error?.message || error || "email_failed"),
      code: String(error?.code || ""),
      to,
      cc,
      subject,
      factura_id: invoice.id
    });
    throw error;
  }

  const result = {
    ok: true,
    messageId: String(info?.messageId || ""),
    to,
    cc,
    attachment: hasPdf ? attachmentName : "",
    facturaId: invoice.id
  };
  recordInvoiceEmailMetadata(db, payment?.id, paymentMetadata, {
    status: "sent",
    sent_at: new Date().toISOString(),
    message_id: result.messageId,
    to,
    cc,
    subject,
    attachment: result.attachment,
    factura_id: invoice.id
  });
  return result;
}
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
