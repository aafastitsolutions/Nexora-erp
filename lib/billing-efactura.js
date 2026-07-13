import { anafUploadFactura } from "./anaf-efactura.js";

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeEnvironment(value) {
  return String(value || "").trim().toLowerCase() === "prod" ? "prod" : "test";
}

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

function logAnafMessage(db, { companyId, messageId, facturaId, status, payload, details }) {
  db.prepare(`
    INSERT INTO anaf_messages(company_id, account_id, message_id, factura_id, direction, status, payload, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(companyId || 0),
    null,
    String(messageId || ""),
    Number(facturaId || 0) || null,
    "OUT",
    String(status || ""),
    String(payload || ""),
    String(details || "")
  );
}

function updateInvoiceError(db, facturaId, companyId, status, message) {
  db.prepare(`
    UPDATE facturi
    SET efactura_status=?,
        efactura_last_error=?,
        efactura_last_checked_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=?
  `).run(String(status || "EROARE"), String(message || ""), Number(facturaId || 0), Number(companyId || 0));
}

function normalizeRomanianFiscalId(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^RO/i, "")
    .replace(/[^0-9]/g, "");
}

function hasUsableRomanianBuyerFiscalId(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return false;
  if (/^(PF-|BILLING-COMPANY|BILLING-COMPANY-EXTERNAL|EXTERNAL-|CLIENT-)/i.test(raw)) return false;
  const normalized = normalizeRomanianFiscalId(raw);
  return /^\d{2,13}$/.test(normalized);
}

function productionAllowed() {
  return enabled(process.env.EFACTURA_PRODUCTION_ENABLED);
}

function autoEfacturaEnabled() {
  return enabled(process.env.BILLING_AUTO_EFACTURA_ENABLED);
}

function includeInternationalEfactura() {
  return enabled(process.env.BILLING_AUTO_EFACTURA_INCLUDE_INTERNATIONAL);
}

function testSimulationEnabled() {
  return enabled(process.env.BILLING_EFACTURA_TEST_SIMULATION_ENABLED);
}

export async function maybeSendBillingInvoiceToEfactura(db, facturaId, options = {}) {
  const normalizedFacturaId = Number(facturaId || 0);
  if (!normalizedFacturaId || !autoEfacturaEnabled()) {
    return { ok: false, skipped: true, reason: "auto_efactura_disabled" };
  }

  const factura = db.prepare(`
    SELECT
      f.id,
      f.company_id,
      f.factura_nr,
      f.efactura_status,
      c.country AS client_country,
      c.cui AS client_cui,
      c.reg_com AS client_reg_com
    FROM facturi f
    JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
    WHERE f.id=?
    LIMIT 1
  `).get(normalizedFacturaId);
  if (!factura) return { ok: false, skipped: true, reason: "invoice_not_found" };

  const clientCountry = String(factura.client_country || "Romania").trim().toLowerCase();
  const isRomaniaClient = !clientCountry || clientCountry === "romania" || clientCountry === "ro";
  if (!isRomaniaClient && !includeInternationalEfactura()) {
    db.prepare(`
      UPDATE facturi
      SET efactura_status='NEAPLICABIL_INTERNATIONAL',
          efactura_last_error=NULL,
          efactura_last_checked_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).run(factura.id, factura.company_id);
    return { ok: false, skipped: true, reason: "international_client_skipped", environment: null, facturaId: factura.id, clientCountry: factura.client_country };
  }

  if (isRomaniaClient && !hasUsableRomanianBuyerFiscalId(factura.client_cui)) {
    const message = "e-Factura nu a fost trimisa automat: cumparatorul nu are CUI/CNP valid in fisa clientului.";
    updateInvoiceError(db, factura.id, factura.company_id, "NEAPLICABIL_CUMPARATOR_FARA_CUI", message);
    return {
      ok: false,
      skipped: true,
      reason: "buyer_fiscal_id_missing",
      facturaId: factura.id,
      clientCui: factura.client_cui
    };
  }

  const companyId = Number(factura.company_id || 0);
  const environment = normalizeEnvironment(
    process.env.EFACTURA_ENVIRONMENT ||
    readSetting(db, companyId, "anaf_environment", "test")
  );

  if (environment === "prod" && !productionAllowed()) {
    const message = "Trimiterea e-Factura PROD este blocata: EFACTURA_PRODUCTION_ENABLED nu este activ.";
    updateInvoiceError(db, factura.id, companyId, "BLOCAT_PROD", message);
    return { ok: false, skipped: true, reason: "production_blocked", environment };
  }

  const ensureFacturaXmlGenerated = options.ensureFacturaXmlGenerated;
  if (typeof ensureFacturaXmlGenerated !== "function") {
    updateInvoiceError(db, factura.id, companyId, "EROARE_AUTOMATIZARE", "Lipseste generatorul XML e-Factura.");
    return { ok: false, skipped: false, reason: "missing_xml_generator" };
  }

  const generated = ensureFacturaXmlGenerated(factura.id, companyId);
  if (!generated?.ok || !generated.xml) {
    const message = generated?.error || "XML e-Factura nu a putut fi generat.";
    updateInvoiceError(db, factura.id, companyId, "EROARE_XML", message);
    return { ok: false, skipped: false, reason: "xml_generation_failed", error: message };
  }

  if (environment === "test" && testSimulationEnabled()) {
    const uploadIndex = `TEST-SIM-${factura.id}-${Date.now()}`;
    logAnafMessage(db, {
      companyId,
      messageId: uploadIndex,
      facturaId: factura.id,
      status: "TEST_SIMULAT",
      payload: generated.xml,
      details: "Automatizare e-Factura TEST simulata local. Nu s-a trimis nimic catre ANAF productie."
    });

    db.prepare(`
      UPDATE facturi
      SET status='TRIMIS_EFACTURA',
          efactura_status='TEST_SIMULAT',
          efactura_message_id=?,
          efactura_upload_index=?,
          efactura_download_id=NULL,
          efactura_response_zip_path=NULL,
          efactura_last_error=NULL,
          efactura_last_checked_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).run(uploadIndex, uploadIndex, factura.id, companyId);

    return { ok: true, simulated: true, environment, facturaId: factura.id, uploadIndex };
  }

  const companyCui = String(readSetting(db, companyId, "company_cui", "") || "").replace(/^RO/i, "").trim();
  const getScopedSetting = (key, fallback = "") => readSetting(db, companyId, key, fallback);
  try {
    const uploaded = await anafUploadFactura({
      cif: companyCui,
      companyId,
      db,
      environment,
      getSetting: getScopedSetting,
      xml: generated.xml
    });

    if (!uploaded.ok) {
      const errorMessage = uploaded.message || uploaded.rawText || `ANAF upload error (${uploaded.httpStatus})`;
      updateInvoiceError(db, factura.id, companyId, "EROARE_UPLOAD", errorMessage);
      logAnafMessage(db, {
        companyId,
        messageId: uploaded.uploadIndex || "",
        facturaId: factura.id,
        status: "EROARE",
        payload: generated.xml,
        details: uploaded.rawText || errorMessage
      });
      return { ok: false, skipped: false, reason: "anaf_upload_failed", environment, error: errorMessage };
    }

    logAnafMessage(db, {
      companyId,
      messageId: uploaded.uploadIndex,
      facturaId: factura.id,
      status: "TRIMIS",
      payload: generated.xml,
      details: uploaded.rawText || ""
    });

    db.prepare(`
      UPDATE facturi
      SET status='TRIMIS_EFACTURA',
          efactura_status='TRIMIS',
          efactura_message_id=?,
          efactura_upload_index=?,
          efactura_download_id=NULL,
          efactura_response_zip_path=NULL,
          efactura_last_error=NULL,
          efactura_last_checked_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).run(uploaded.uploadIndex, uploaded.uploadIndex, factura.id, companyId);

    return { ok: true, simulated: false, environment, facturaId: factura.id, uploadIndex: uploaded.uploadIndex };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nu exista conexiune ANAF activa.";
    updateInvoiceError(db, factura.id, companyId, "FARA_CONEXIUNE", message);
    return { ok: false, skipped: false, reason: "anaf_connection_failed", environment, error: message };
  }
}
