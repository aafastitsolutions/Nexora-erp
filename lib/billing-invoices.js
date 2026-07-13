import { nextConfiguredInvoiceNumber, recordIssuedInvoiceNumber } from "./invoice-numbering.js";

function normalizeCompanyCui(value, country = "Romania") {
  const normalizedCountry = String(country || "Romania").trim();
  const raw = String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  return normalizedCountry === "Romania" ? raw.replace(/^RO/i, "") : raw;
}

function isRomanianCountry(value = "") {
  const normalized = String(value || "Romania").trim().toLowerCase();
  return !normalized || ["romania", "ro", "rou"].includes(normalized);
}

function hasUsableRomanianFiscalId(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || /^(PF-|BILLING-COMPANY|BILLING-COMPANY-EXTERNAL|EXTERNAL-|CLIENT-)/i.test(raw)) return false;
  const normalized = raw.replace(/^RO/i, "").replace(/[^0-9]/g, "");
  return /^\d{2,13}$/.test(normalized);
}

function todayDateISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(String(value)) : fallback;
  } catch {
    return fallback;
  }
}

function stripeBillingDetailsFromPayment(payment = {}) {
  const metadata = parseJson(payment.metadata, {});
  const details = metadata?.stripe_billing_details || {};
  return {
    name: String(details.name || "").trim(),
    cui: String(details.tax_id || "").replace(/\s+/g, "").trim().toUpperCase(),
    address: String(details.address || "").trim(),
    country: String(details.country || "").trim(),
    email: String(details.email || "").trim().toLowerCase()
  };
}

function autoInvoiceEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.BILLING_AUTO_INVOICE_ENABLED || "").trim().toLowerCase());
}

function liveOnlyMode() {
  const raw = String(process.env.BILLING_AUTO_INVOICE_LIVE_ONLY || "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function resolveBillingIssuerCompanyId(db) {
  const explicitId = Number(process.env.BILLING_ISSUER_COMPANY_ID || 0);
  if (explicitId > 0) return explicitId;

  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (adminEmail) {
    const adminUser = db.prepare(`
      SELECT company_id
      FROM users
      WHERE LOWER(email)=?
        AND company_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1
    `).get(adminEmail);
    if (Number(adminUser?.company_id || 0) > 0) return Number(adminUser.company_id);
  }

  const firstCompany = db.prepare(`
    SELECT id
    FROM companies
    ORDER BY id ASC
    LIMIT 1
  `).get();

  return Number(firstCompany?.id || 0) || null;
}

function resolveIssuerClient(db, issuerCompanyId, payerCompany) {
  const payerCountry = String(payerCompany?.country || "Romania").trim() || "Romania";
  const payerCui = normalizeCompanyCui(payerCompany?.cui || "", payerCountry);
  const payerName = String(payerCompany?.name || "").trim() || `Companie ${payerCompany?.id || ""}`.trim();
  const payerAddress = String(payerCompany?.address || "").trim();
  const payerRc = String(payerCompany?.rc || "").trim();
  const payerId = String(payerCompany?.id || Date.now()).trim();
  const fallbackClientCui = /^external-/i.test(payerId)
    ? `PF-${payerId}`
    : `billing-company-${payerId || Date.now()}`;

  let client = null;
  if (payerCui) {
    client = db.prepare(`
      SELECT id
      FROM clients
      WHERE company_id=?
        AND cui=?
      ORDER BY id DESC
      LIMIT 1
    `).get(issuerCompanyId, payerCui);
  }

  if (!client) {
    client = db.prepare(`
      SELECT id
      FROM clients
      WHERE company_id=?
        AND LOWER(name)=LOWER(?)
      ORDER BY id DESC
      LIMIT 1
    `).get(issuerCompanyId, payerName);
  }

  if (!client) {
    const result = db.prepare(`
      INSERT INTO clients (cui, name, address, country, reg_com, vat, inactive, company_id)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      payerCui || fallbackClientCui,
      payerName,
      payerAddress || null,
      payerCountry,
      payerRc || null,
      issuerCompanyId
    );
    return Number(result.lastInsertRowid);
  }

  db.prepare(`
    UPDATE clients
    SET cui=?,
        name=?,
        address=?,
        country=?,
        reg_com=?,
        inactive=0
    WHERE id=?
  `).run(
    payerCui || fallbackClientCui,
    payerName,
    payerAddress || null,
    payerCountry,
    payerRc || null,
    client.id
  );

  return Number(client.id);
}

export function maybeGenerateBillingInvoice(db, paymentId, options = {}) {
  const normalizedPaymentId = Number(paymentId || 0);
  if (!normalizedPaymentId || !autoInvoiceEnabled()) {
    return { ok: false, skipped: true, reason: "auto_invoice_disabled" };
  }

  const payment = db.prepare(`
    SELECT
      bp.*,
      c.name AS payer_company_name,
      c.slug AS payer_company_slug,
      c.cui AS payer_company_cui,
      c.rc AS payer_company_rc,
      c.address AS payer_company_address,
      c.country AS payer_company_country,
      cs.plan_id,
      p.name AS plan_name,
      p.code AS plan_code
    FROM billing_payments bp
    JOIN companies c ON c.id = bp.company_id
    LEFT JOIN company_subscriptions cs ON cs.id = bp.company_subscription_id
    LEFT JOIN plans p ON p.id = cs.plan_id
    WHERE bp.id=?
    LIMIT 1
  `).get(normalizedPaymentId);

  if (!payment) return { ok: false, skipped: true, reason: "payment_not_found" };
  if (String(payment.status || "").toLowerCase() !== "paid") return { ok: false, skipped: true, reason: "payment_not_paid" };
  if (Number(payment.generated_factura_id || 0) > 0) {
    return { ok: true, skipped: true, reason: "invoice_already_generated", facturaId: Number(payment.generated_factura_id) };
  }

  const source = String(payment.source || "").toLowerCase();
  const sourceLivemode = Number(options.livemode || 0) === 1;
  if (source === "stripe" && liveOnlyMode() && !sourceLivemode) {
    db.prepare(`
      UPDATE billing_payments
      SET invoice_generation_status='waiting_live_mode',
          updated_at=datetime('now')
      WHERE id=?
    `).run(normalizedPaymentId);
    return { ok: false, skipped: true, reason: "waiting_live_mode" };
  }

  const issuerCompanyId = resolveBillingIssuerCompanyId(db);
  if (!issuerCompanyId) return { ok: false, skipped: true, reason: "issuer_company_missing" };
  const paymentMetadata = parseJson(payment.metadata, {});
  const isExternalPayer = Boolean(paymentMetadata.external_payer || paymentMetadata.emarqet_external_payer);
  if (issuerCompanyId === Number(payment.company_id || 0) && !isExternalPayer) {
    db.prepare(`
      UPDATE billing_payments
      SET invoice_generation_status='skipped_same_company',
          updated_at=datetime('now')
      WHERE id=?
    `).run(normalizedPaymentId);
    return { ok: false, skipped: true, reason: "issuer_matches_payer" };
  }

  const stripeBillingDetails = stripeBillingDetailsFromPayment(payment);
  const payerCountry = paymentMetadata.payer_country || stripeBillingDetails.country || (isExternalPayer ? "Romania" : payment.payer_company_country) || "Romania";
  const payerCui = paymentMetadata.payer_cui || stripeBillingDetails.cui || (isExternalPayer ? "" : payment.payer_company_cui);
  const payerName = paymentMetadata.payer_name || stripeBillingDetails.name || payment.payer_name || (isExternalPayer ? "" : payment.payer_company_name) || payment.payer_email || "Client";
  const payerAddress = paymentMetadata.payer_address || stripeBillingDetails.address || (isExternalPayer ? "" : payment.payer_company_address);

  if (isExternalPayer && isRomanianCountry(payerCountry) && !hasUsableRomanianFiscalId(payerCui)) {
    db.prepare(`
      UPDATE billing_payments
      SET invoice_generation_status='blocked_missing_fiscal_id',
          failure_reason=CASE
            WHEN failure_reason IS NULL OR failure_reason=''
              THEN 'Lipseste CUI/CNP valid pentru factura e-Marqet.'
            ELSE failure_reason || ' | Lipseste CUI/CNP valid pentru factura e-Marqet.'
          END,
          updated_at=datetime('now')
      WHERE id=?
    `).run(normalizedPaymentId);
    return { ok: false, skipped: true, reason: "external_payer_fiscal_id_missing" };
  }

  const clientId = resolveIssuerClient(db, issuerCompanyId, {
    id: isExternalPayer ? `external-${payment.id}` : payment.company_id,
    name: payerName,
    cui: payerCui,
    rc: payment.payer_company_rc,
    address: payerAddress,
    country: payerCountry
  });

  if (!clientId) return { ok: false, skipped: true, reason: "client_resolution_failed" };

  const number = nextConfiguredInvoiceNumber(db, { year: new Date().getUTCFullYear(), companyId: issuerCompanyId });
  const invoiceDate = todayDateISO();
  const currency = String(payment.currency || "RON").toUpperCase();
  const amount = Number(payment.amount || 0);
  const propertyCount = Math.max(1, Math.round(Number(paymentMetadata.property_count || 1) || 1));
  const unitAmount = Math.max(0, Number(paymentMetadata.unit_amount || 0) || 0);
  const canUsePropertyQuantity = propertyCount > 1 && unitAmount > 0 && Math.abs(unitAmount * propertyCount - amount) < 0.01;
  const lineQuantity = canUsePropertyQuantity ? propertyCount : 1;
  const lineUnitPrice = canUsePropertyQuantity ? unitAmount : amount;
  const invoiceLabelPrefix = String(paymentMetadata.invoice_label_prefix || process.env.BILLING_INVOICE_LABEL_PREFIX || "Abonament Trevoro").trim() || "Abonament Trevoro";
  const label = paymentMetadata.invoice_line_label
    ? String(paymentMetadata.invoice_line_label)
    : canUsePropertyQuantity
      ? `${invoiceLabelPrefix} - ${propertyCount} proprietăți Trevoro`
      : `${invoiceLabelPrefix} - ${payment.plan_name || payment.plan_code || "plan activ"}`;
  const invoiceUnit = String(paymentMetadata.invoice_unit || (canUsePropertyQuantity ? "proprietate/luna" : "luna")).trim();
  const notes = [
    `Factură generată automat pentru plata ${source === "stripe" ? "Stripe" : "OP"}.`,
    payment.reference_code ? `Referință: ${payment.reference_code}` : "",
    payment.stripe_invoice_id ? `Stripe invoice: ${payment.stripe_invoice_id}` : "",
    paymentMetadata.listing_code ? `Anunț e-Marqet: ${paymentMetadata.listing_code}` : "",
    payerCui ? `Cod fiscal/VAT ID: ${payerCui}` : "",
    payment.payer_email ? `Plătitor: ${payment.payer_email}` : ""
  ].filter(Boolean).join(" ");

  const insertInvoice = db.prepare(`
    INSERT INTO facturi (
      factura_nr, an, seq, client_id, status, moneda, subtotal,
      tva_procent, tva_valoare, total, data_emitere, scadenta, observatii, company_id, created_at
    )
    VALUES (?, ?, ?, ?, 'INCASATA', ?, ?, 0, 0, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertLine = db.prepare(`
    INSERT INTO facturi_linii (
      factura_id, denumire, cantitate, unitate, pret_unitar, total_linie, sort_order, company_id
    )
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);

  try {
    db.exec("BEGIN");

    const invoiceResult = insertInvoice.run(
      number.factura_nr,
      number.an,
      number.seq,
      clientId,
      currency,
      amount,
      amount,
      invoiceDate,
      invoiceDate,
      notes || null,
      issuerCompanyId
    );

    const facturaId = Number(invoiceResult.lastInsertRowid);
    insertLine.run(
      facturaId,
      label,
      lineQuantity,
      invoiceUnit,
      lineUnitPrice,
      amount,
      issuerCompanyId
    );

    if (payment.payer_email || paymentMetadata.payer_phone) {
      db.prepare(`
        UPDATE clients
        SET email=CASE WHEN ? <> '' THEN ? ELSE email END,
            phone=CASE WHEN ? <> '' THEN ? ELSE phone END
        WHERE id=? AND company_id=?
      `).run(
        payment.payer_email || "",
        payment.payer_email || "",
        paymentMetadata.payer_phone || "",
        paymentMetadata.payer_phone || "",
        clientId,
        issuerCompanyId
      );
    }

    db.prepare(`
      UPDATE billing_payments
      SET generated_factura_id=?,
          invoice_generation_status='generated',
          invoice_generated_at=datetime('now'),
          updated_at=datetime('now')
      WHERE id=?
    `).run(facturaId, normalizedPaymentId);

    recordIssuedInvoiceNumber(db, number.factura_nr, issuerCompanyId);

    db.exec("COMMIT");
    return { ok: true, facturaId };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}

    db.prepare(`
      UPDATE billing_payments
      SET invoice_generation_status='failed',
          failure_reason=CASE
            WHEN failure_reason IS NULL OR failure_reason=''
              THEN ?
            ELSE failure_reason || ' | auto-invoice: ' || ?
          END,
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      String(error?.message || "invoice_generation_failed"),
      String(error?.message || "invoice_generation_failed"),
      normalizedPaymentId
    );

    return { ok: false, skipped: false, reason: "invoice_generation_failed", error };
  }
}
