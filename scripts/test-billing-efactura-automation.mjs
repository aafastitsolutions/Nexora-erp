import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { db, migrate } from "../db.js";
import { maybeSendBillingInvoiceToEfactura } from "../lib/billing-efactura.js";
import { maybeEmailBillingInvoice } from "../lib/billing-invoice-email.js";
import { maybeGenerateBillingInvoicePdf } from "../lib/billing-invoice-pdf.js";
import { maybeGenerateBillingInvoice } from "../lib/billing-invoices.js";
import { createTransporter } from "../lib/bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });

process.env.BILLING_AUTO_INVOICE_ENABLED = "true";
process.env.BILLING_AUTO_INVOICE_LIVE_ONLY = "false";
process.env.BILLING_AUTO_EFACTURA_ENABLED = "true";
process.env.BILLING_EFACTURA_TEST_SIMULATION_ENABLED = "true";
process.env.BILLING_AUTO_INVOICE_EMAIL_ENABLED = "true";
process.env.BILLING_INVOICE_EMAIL_CC = "contact@trevoro.ro";
process.env.EFACTURA_ENVIRONMENT = "test";
process.env.EFACTURA_PRODUCTION_ENABLED = "false";
process.env.SMTP_HOST ||= "mail.zooku.ro";
process.env.SMTP_PORT ||= "465";
process.env.SMTP_SECURE ||= "true";
process.env.SMTP_USER ||= "contact@trevoro.ro";
process.env.MAIL_FROM ||= "contact@trevoro.ro";
process.env.SMTP_PASS ||= process.env.TREVORO_MAIL_PASS || process.env.TREVORO_IMAP_PASS || "";

function safeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function ensureTestFacturaXmlGenerated(facturaId, companyId) {
  const factura = db.prepare(`
    SELECT f.*, c.name AS client_name, c.cui AS client_cui
    FROM facturi f
    JOIN clients c ON c.id=f.client_id
    WHERE f.id=? AND f.company_id=?
  `).get(Number(facturaId || 0), Number(companyId || 0));

  if (!factura) return { ok: false, error: "Factura de test nu exista." };

  const lines = db.prepare(`
    SELECT denumire, cantitate, unitate, pret_unitar, total_linie
    FROM facturi_linii
    WHERE factura_id=? AND company_id=?
    ORDER BY sort_order ASC, id ASC
  `).all(factura.id, companyId);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>${safeXml(factura.factura_nr)}</ID>
  <IssueDate>${safeXml(String(factura.data_emitere || "").slice(0, 10))}</IssueDate>
  <DocumentCurrencyCode>${safeXml(factura.moneda || "RON")}</DocumentCurrencyCode>
  <AccountingSupplierParty>
    <Party>
      <PartyName><Name>A&amp;A FAST IT SOLUTIONS S.R.L.</Name></PartyName>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyName><Name>${safeXml(factura.client_name || "")}</Name></PartyName>
      <PartyLegalEntity><CompanyID>${safeXml(factura.client_cui || "")}</CompanyID></PartyLegalEntity>
    </Party>
  </AccountingCustomerParty>
  ${lines.map((line, index) => `
  <InvoiceLine>
    <ID>${index + 1}</ID>
    <InvoicedQuantity unitCode="${safeXml(line.unitate || "luna")}">${Number(line.cantitate || 1).toFixed(2)}</InvoicedQuantity>
    <LineExtensionAmount currencyID="${safeXml(factura.moneda || "RON")}">${Number(line.total_linie || 0).toFixed(2)}</LineExtensionAmount>
    <Item><Name>${safeXml(line.denumire || "")}</Name></Item>
    <Price><PriceAmount currencyID="${safeXml(factura.moneda || "RON")}">${Number(line.pret_unitar || 0).toFixed(2)}</PriceAmount></Price>
  </InvoiceLine>`).join("")}
</Invoice>`;

  const xmlDir = path.join(rootDir, "efactura_xml");
  fs.mkdirSync(xmlDir, { recursive: true });
  const xmlFile = `${String(factura.factura_nr || `test-${factura.id}`).replace(/[^A-Za-z0-9._-]/g, "_")}-auto-test.xml`;
  const absPath = path.join(xmlDir, xmlFile);
  fs.writeFileSync(absPath, xml);
  const xmlPath = `efactura_xml/${xmlFile}`;
  db.prepare(`
    UPDATE facturi
    SET efactura_xml_path=?,
        efactura_status='GENERAT'
    WHERE id=? AND company_id=?
  `).run(xmlPath, factura.id, companyId);

  return { ok: true, xmlFile, absPath, xmlPath, xml, f: factura };
}

function ensurePayerCompany() {
  const existing = db.prepare(`
    SELECT id
    FROM companies
    WHERE id<>1
    ORDER BY id ASC
    LIMIT 1
  `).get();
  if (existing?.id) return Number(existing.id);

  const result = db.prepare(`
    INSERT INTO companies (name, slug, cui, rc, address, status, max_users)
    VALUES ('Trevoro Test Partner', 'trevoro-test-partner', '99999999', 'J00/1/2026', 'Adresa test', 'active', 1)
  `).run();
  return Number(result.lastInsertRowid);
}

migrate();

db.prepare(`
  INSERT INTO app_settings(key,value) VALUES('anaf_environment','test')
  ON CONFLICT(key) DO UPDATE SET value='test'
`).run();
db.prepare(`
  UPDATE app_settings
  SET value='test'
  WHERE key LIKE 'company:%:anaf_environment'
`).run();

const payerCompanyId = ensurePayerCompany();
const reference = `trevoro-efactura-test-${Date.now()}`;
const paymentResult = db.prepare(`
  INSERT INTO billing_payments (
    company_id, source, provider_event_type, payment_kind, status,
    amount, currency, payer_name, payer_email, reference_code,
    stripe_invoice_id, stripe_payment_intent_id, paid_at, notes, metadata
  )
  VALUES (?, 'stripe', 'invoice.paid.test', 'subscription', 'paid',
    99, 'ron', 'Trevoro Test Partner', 'owner.test@trevoro.ro', ?,
    ?, ?, datetime('now'), 'Test automatizare e-Factura TEST', ?)
`).run(
  payerCompanyId,
  reference,
  `in_test_${Date.now()}`,
  `pi_test_${Date.now()}`,
  JSON.stringify({ test: true, efactura_environment: "test" })
);

const paymentId = Number(paymentResult.lastInsertRowid);
const invoiceResult = maybeGenerateBillingInvoice(db, paymentId, { livemode: 0 });
if (!invoiceResult?.facturaId) {
  console.log(JSON.stringify({ ok: false, stage: "invoice", paymentId, invoiceResult }, null, 2));
  process.exitCode = 1;
} else {
  const efacturaResult = await maybeSendBillingInvoiceToEfactura(db, invoiceResult.facturaId, {
    ensureFacturaXmlGenerated: ensureTestFacturaXmlGenerated
  });
  const pdfResult = await maybeGenerateBillingInvoicePdf(db, invoiceResult.facturaId);
  const emailResult = await maybeEmailBillingInvoice(db, invoiceResult.facturaId, {
    transporter: createTransporter()
  });
  const finalInvoice = db.prepare(`
    SELECT id, factura_nr, status, efactura_status, efactura_upload_index, efactura_last_error, efactura_xml_path
    FROM facturi
    WHERE id=?
  `).get(invoiceResult.facturaId);
  console.log(JSON.stringify({
    ok: Boolean(efacturaResult?.ok),
    paymentId,
    facturaId: invoiceResult.facturaId,
    invoiceResult,
    efacturaResult,
    pdfResult,
    emailResult,
    finalInvoice
  }, null, 2));
  if (!efacturaResult?.ok || !pdfResult?.ok || !emailResult?.ok) process.exitCode = 1;
}
