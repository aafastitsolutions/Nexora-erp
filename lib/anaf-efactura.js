import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const DEFAULT_TOKEN_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/token";

function normalizeEnvironment(environment) {
  return String(environment || "").trim().toLowerCase() === "prod" ? "prod" : "test";
}

function getApiBase(environment) {
  return `https://api.anaf.ro/${normalizeEnvironment(environment)}/FCTEL/rest`;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseJwtExpiry(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return "";
  return new Date(Number(payload.exp) * 1000).toISOString();
}

function safeIsoFromNow(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(Date.now() + value * 1000).toISOString();
}

function latestConnection(db, { companyId, environment }) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const normalizedCompanyId = Number(companyId || 0);

  if (Number.isFinite(normalizedCompanyId) && normalizedCompanyId > 0) {
    return db.prepare(`
      SELECT *
      FROM anaf_connections
      WHERE environment = ? AND company_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(normalizedEnvironment, normalizedCompanyId);
  }

  return db.prepare(`
    SELECT *
    FROM anaf_connections
    WHERE environment = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(normalizedEnvironment);
}

function updateConnectionTokens(db, connectionId, tokenPayload, rawResponse) {
  const accessToken = String(tokenPayload?.access_token || "").trim();
  const refreshToken = String(tokenPayload?.refresh_token || "").trim();
  const tokenType = String(tokenPayload?.token_type || "").trim();
  const scope = String(tokenPayload?.scope || "").trim();
  const expiresAt = safeIsoFromNow(tokenPayload?.expires_in) || parseJwtExpiry(accessToken) || "";
  const refreshExpiresAt = safeIsoFromNow(tokenPayload?.refresh_token_expires_in || tokenPayload?.refresh_expires_in);

  db.prepare(`
    UPDATE anaf_connections
    SET access_token = ?,
        refresh_token = ?,
        token_type = ?,
        scope = ?,
        expires_at = ?,
        refresh_expires_at = ?,
        raw_response = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    accessToken,
    refreshToken,
    tokenType,
    scope,
    expiresAt,
    refreshExpiresAt,
    rawResponse,
    connectionId
  );
}

function parseStructuredPayload(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {}

  if (text.startsWith("<")) {
    const attrs = {};
    const attrRegex = /([A-Za-z_][A-Za-z0-9_\-]*)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(text))) {
      attrs[match[1]] = match[2];
    }
    return { xml: text, attrs };
  }

  if (text.includes("=") && text.includes("&")) {
    const params = new URLSearchParams(text);
    const parsed = {};
    for (const [key, value] of params.entries()) parsed[key] = value;
    return parsed;
  }

  return { raw: text };
}

function getValue(source, keys) {
  for (const key of keys) {
    if (source == null) continue;
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null && source[key] !== "") {
      return source[key];
    }
  }
  return "";
}

function summarizeStatus(payload) {
  const attrs = payload?.attrs || {};
  const container = { ...(payload || {}), ...attrs };
  const uploadIndex = getValue(container, ["index_incarcare", "indexIncarcare", "uploadIndex", "id_incarcare"]);
  const downloadId = getValue(container, ["id_descarcare", "idDescarcare", "downloadId", "id"]);
  const executionStatus = getValue(container, ["ExecutionStatus", "executionStatus", "status", "stare"]);
  const message = getValue(container, ["Errors", "error", "message", "Mesaj", "detalii", "details"]);

  return {
    uploadIndex: uploadIndex ? String(uploadIndex) : "",
    downloadId: downloadId ? String(downloadId) : "",
    executionStatus: executionStatus ? String(executionStatus) : "",
    message: message ? String(message) : ""
  };
}

function normalizeCompanyCui(value) {
  return String(value || "").replace(/^RO/i, "").replace(/[^0-9A-Za-z]/g, "").trim().toUpperCase();
}

function formatAnafMessageTimestamp(value) {
  const text = String(value || "").trim();
  if (/^\d{12}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}:00`;
  }
  if (/^\d{14}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`;
  }
  return text;
}

function normalizeMessageList(payload) {
  const messages = Array.isArray(payload?.mesaje)
    ? payload.mesaje
    : Array.isArray(payload?.mesaj)
      ? payload.mesaj
      : payload?.mesaje && typeof payload.mesaje === "object"
        ? [payload.mesaje]
        : payload?.mesaj && typeof payload.mesaj === "object"
          ? [payload.mesaj]
          : [];

  return messages.map((message) => ({
    downloadId: String(getValue(message, ["id", "downloadId", "idDescarcare", "id_descarcare"]) || "").trim(),
    uploadIndex: String(getValue(message, ["id_solicitare", "idSolicitare", "uploadIndex", "index_incarcare"]) || "").trim(),
    details: String(getValue(message, ["detalii", "details", "message", "Mesaj"]) || "").trim(),
    type: String(getValue(message, ["tip", "type", "categoria"]) || "").trim(),
    cif: normalizeCompanyCui(getValue(message, ["cif", "cui"])),
    createdAt: formatAnafMessageTimestamp(getValue(message, ["data_creare", "created_at", "createdAt", "date", "data"])),
    raw: message
  })).filter((message) => message.downloadId);
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(Number.parseInt(dec, 10));
      } catch {
        return "";
      }
    });
}

function safeFilePart(value) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return normalized || "document";
}

function extractXmlBlock(xmlText, tagName) {
  const source = String(xmlText || "");
  const startMatch = new RegExp(`<(?:(?:\\w+):)?${tagName}\\b`, "i").exec(source);
  if (!startMatch) return "";
  const fromStart = source.slice(startMatch.index);
  const endMatch = new RegExp(`</(?:(?:\\w+):)?${tagName}>`, "i").exec(fromStart);
  if (!endMatch) return "";
  return fromStart.slice(0, endMatch.index + endMatch[0].length);
}

function extractXmlTagValue(xmlText, tagName) {
  const match = new RegExp(`<(?:(?:\\w+):)?${tagName}(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*</(?:(?:\\w+):)?${tagName}>`, "i").exec(String(xmlText || ""));
  if (!match) return "";
  return decodeXmlEntities(String(match[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractInvoiceNumber(xmlText) {
  const supplierIndex = String(xmlText || "").search(/<(?:(?:\w+):)?AccountingSupplierParty\b/i);
  const headerBlock = supplierIndex > 0 ? String(xmlText || "").slice(0, supplierIndex) : String(xmlText || "").slice(0, 5000);
  const simplifiedHeader = headerBlock.replace(/<(?:(?:\w+):)?(?:UBLVersionID|CustomizationID|ProfileID|CopyIndicator|UUID)(?:\s[^>]*)?>[\s\S]*?<\/(?:(?:\w+):)?(?:UBLVersionID|CustomizationID|ProfileID|CopyIndicator|UUID)>/gi, " ");
  return extractXmlTagValue(simplifiedHeader, "ID");
}

function parseInvoiceMetadata(xmlText) {
  const source = String(xmlText || "");
  const isInvoice = /<(?:(?:\w+):)?Invoice\b/i.test(source);
  const supplierBlock = extractXmlBlock(source, "AccountingSupplierParty");
  const customerBlock = extractXmlBlock(source, "AccountingCustomerParty");

  return {
    isInvoice,
    invoiceNumber: extractInvoiceNumber(source),
    supplierName: extractXmlTagValue(supplierBlock, "RegistrationName") || extractXmlTagValue(supplierBlock, "Name"),
    supplierCui: normalizeCompanyCui(extractXmlTagValue(supplierBlock, "CompanyID")),
    buyerCui: normalizeCompanyCui(extractXmlTagValue(customerBlock, "CompanyID"))
  };
}

function listZipEntries(absZipPath) {
  try {
    const output = execFileSync("unzip", ["-Z1", absZipPath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    });
    return String(output || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.toLowerCase().includes("enoent")) {
      throw new Error("Utilitarul unzip nu este instalat pe server.");
    }
    throw error;
  }
}

function readZipEntryBuffer(absZipPath, entryName) {
  return execFileSync("unzip", ["-p", absZipPath, entryName], {
    maxBuffer: 20 * 1024 * 1024
  });
}

async function refreshAccessToken({ db, getSetting, environment, connection }) {
  const clientId = String(getSetting("anaf_client_id", "") || "").trim();
  const clientSecret = String(getSetting("anaf_client_secret", "") || "").trim();
  const tokenUrl = String(getSetting("anaf_token_url", DEFAULT_TOKEN_URL) || DEFAULT_TOKEN_URL).trim();
  const refreshToken = String(connection?.refresh_token || "").trim();

  if (!clientId || !clientSecret) throw new Error("Configuratia ANAF este incompleta.");
  if (!refreshToken) throw new Error("Nu exista refresh token ANAF pentru reconectare.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    token_content_type: "jwt"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const rawText = await response.text();
  let tokenPayload = {};
  try {
    tokenPayload = JSON.parse(rawText);
  } catch {
    tokenPayload = { raw: rawText };
  }

  if (!response.ok || !tokenPayload?.access_token) {
    const message = tokenPayload?.error_description || tokenPayload?.error || `Refresh token ANAF invalid (${response.status})`;
    throw new Error(message);
  }

  updateConnectionTokens(db, connection.id, tokenPayload, rawText);
  return String(tokenPayload.access_token || "").trim();
}

export async function getValidAnafAccessToken({ companyId, db, getSetting, environment }) {
  const connection = latestConnection(db, { companyId, environment });
  if (!connection) throw new Error("Nu exista conexiune ANAF autorizata pentru mediul selectat.");

  const accessToken = String(connection.access_token || "").trim();
  const expiresAt = String(connection.expires_at || "").trim();
  const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const stillValid = accessToken && Number.isFinite(expiresMs) ? expiresMs - Date.now() > 5 * 60 * 1000 : Boolean(accessToken);

  if (stillValid) return accessToken;
  return refreshAccessToken({ db, getSetting, environment, connection });
}

export async function anafUploadFactura({ cif, companyId, db, environment, getSetting, xml }) {
  const accessToken = await getValidAnafAccessToken({ companyId, db, getSetting, environment });
  const base = getApiBase(environment);
  const params = new URLSearchParams({ standard: "UBL" });
  if (cif) params.set("cif", String(cif).trim());

  const response = await fetch(`${base}/upload?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json, application/xml, text/plain, */*",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: xml
  });

  const rawText = await response.text();
  const payload = parseStructuredPayload(rawText);
  const summary = summarizeStatus(payload);

  return {
    ok: response.ok && !!summary.uploadIndex,
    httpStatus: response.status,
    rawText,
    payload,
    ...summary
  };
}

export async function anafListMessages({ cif, companyId, db, environment, getSetting, days = 60 }) {
  const accessToken = await getValidAnafAccessToken({ companyId, db, getSetting, environment });
  const base = getApiBase(environment);
  const normalizedDays = Math.min(60, Math.max(1, Number.parseInt(String(days || "60"), 10) || 60));
  const params = new URLSearchParams({ zile: String(normalizedDays) });
  if (cif) params.set("cif", normalizeCompanyCui(cif));

  const response = await fetch(`${base}/listaMesajeFactura?${params.toString()}`, {
    headers: {
      Accept: "application/json, application/xml, text/plain, */*",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const rawText = await response.text();
  const payload = parseStructuredPayload(rawText);

  return {
    ok: response.ok,
    httpStatus: response.status,
    rawText,
    payload,
    title: String(getValue(payload, ["titlu", "title"]) || "").trim(),
    serial: String(getValue(payload, ["serial"]) || "").trim(),
    cui: String(getValue(payload, ["cui"]) || "").trim(),
    messages: normalizeMessageList(payload)
  };
}

export async function anafCheckUploadStatus({ companyId, db, environment, getSetting, uploadIndex }) {
  const accessToken = await getValidAnafAccessToken({ companyId, db, getSetting, environment });
  const base = getApiBase(environment);
  const url = `${base}/stareMesaj?id_incarcare=${encodeURIComponent(String(uploadIndex || "").trim())}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json, application/xml, text/plain, */*",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const rawText = await response.text();
  const payload = parseStructuredPayload(rawText);
  const summary = summarizeStatus(payload);

  return {
    ok: response.ok,
    httpStatus: response.status,
    rawText,
    payload,
    ...summary
  };
}

export async function anafDownloadMessage({ companyId, db, environment, getSetting, downloadId }) {
  const accessToken = await getValidAnafAccessToken({ companyId, db, getSetting, environment });
  const base = getApiBase(environment);
  const url = `${base}/descarcare?id=${encodeURIComponent(String(downloadId || "").trim())}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream, application/zip, */*",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const arrayBuffer = await response.arrayBuffer();
  return {
    ok: response.ok,
    httpStatus: response.status,
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "",
    contentDisposition: response.headers.get("content-disposition") || ""
  };
}

export async function syncAnafInbox({
  cif,
  companyId,
  db,
  environment,
  getSetting,
  days = 60,
  storageDir,
  publicBasePath
}) {
  const normalizedCompanyCui = normalizeCompanyCui(cif);
  if (!normalizedCompanyCui) throw new Error("CUI-ul companiei nu este configurat.");
  if (!storageDir || !publicBasePath) throw new Error("Configurația de stocare pentru inbox-ul ANAF este incompletă.");

  const listed = await anafListMessages({
    cif: normalizedCompanyCui,
    companyId,
    db,
    environment,
    getSetting,
    days
  });

  if (!listed.ok) {
    throw new Error(listed.rawText || `ANAF listaMesajeFactura error (${listed.httpStatus})`);
  }

  fs.mkdirSync(storageDir, { recursive: true });

  const selectExisting = db.prepare(`
    SELECT id, processed, xml_path, pdf_path, zip_path
    FROM anaf_inbox
    WHERE company_id=? AND download_id=?
    ORDER BY id DESC
    LIMIT 1
  `);

  const insertInboxRow = db.prepare(`
    INSERT INTO anaf_inbox (
      supplier_name,
      supplier_cui,
      buyer_cui,
      invoice_number,
      message_type,
      details,
      download_id,
      zip_path,
      xml_path,
      pdf_path,
      source_environment,
      received_at,
      processed,
      company_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const updateInboxRow = db.prepare(`
    UPDATE anaf_inbox
    SET supplier_name=?,
        supplier_cui=?,
        buyer_cui=?,
        invoice_number=?,
        message_type=?,
        details=?,
        zip_path=?,
        xml_path=?,
        pdf_path=?,
        source_environment=?,
        received_at=?,
        processed=?
    WHERE id=? AND company_id=?
  `);

  const summary = {
    listedCount: listed.messages.length,
    importedCount: 0,
    updatedCount: 0,
    skippedExistingCount: 0,
    skippedNonInvoiceCount: 0,
    skippedOwnDocumentsCount: 0,
    failedCount: 0,
    errors: []
  };

  for (const message of listed.messages) {
    const existing = selectExisting.get(companyId, message.downloadId);
    if (existing?.xml_path && existing?.zip_path) {
      summary.skippedExistingCount += 1;
      continue;
    }

    try {
      const downloaded = await anafDownloadMessage({
        companyId,
        db,
        environment,
        getSetting,
        downloadId: message.downloadId
      });

      if (!downloaded.ok || !downloaded.buffer?.length) {
        summary.failedCount += 1;
        summary.errors.push(`${message.downloadId}: descărcarea a eșuat (${downloaded.httpStatus})`);
        continue;
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anaf-inbox-"));
      try {
        const tempZipPath = path.join(tempDir, `${safeFilePart(message.downloadId)}.zip`);
        fs.writeFileSync(tempZipPath, downloaded.buffer);

        const zipEntries = listZipEntries(tempZipPath);
        const xmlEntry = zipEntries.find((entry) => entry.toLowerCase().endsWith(".xml") && !entry.toLowerCase().includes("semnatura"))
          || zipEntries.find((entry) => entry.toLowerCase().endsWith(".xml"));

        if (!xmlEntry) {
          summary.skippedNonInvoiceCount += 1;
          continue;
        }

        const xmlBuffer = readZipEntryBuffer(tempZipPath, xmlEntry);
        const xmlText = xmlBuffer.toString("utf8");
        const metadata = parseInvoiceMetadata(xmlText);

        if (!metadata.isInvoice) {
          summary.skippedNonInvoiceCount += 1;
          continue;
        }

        if ((metadata.supplierCui && metadata.supplierCui === normalizedCompanyCui)
          || (metadata.buyerCui && metadata.buyerCui !== normalizedCompanyCui)) {
          summary.skippedOwnDocumentsCount += 1;
          continue;
        }

        const pdfEntry = zipEntries.find((entry) => entry.toLowerCase().endsWith(".pdf"));
        const pdfBuffer = pdfEntry ? readZipEntryBuffer(tempZipPath, pdfEntry) : null;

        const fileBase = safeFilePart(`${message.downloadId}-${metadata.invoiceNumber || metadata.supplierCui || "inbox"}`);
        const zipFileName = `${fileBase}.zip`;
        const xmlFileName = `${fileBase}.xml`;
        const pdfFileName = pdfEntry ? `${fileBase}.pdf` : "";

        const zipAbsolutePath = path.join(storageDir, zipFileName);
        const xmlAbsolutePath = path.join(storageDir, xmlFileName);
        const pdfAbsolutePath = pdfFileName ? path.join(storageDir, pdfFileName) : "";

        fs.writeFileSync(zipAbsolutePath, downloaded.buffer);
        fs.writeFileSync(xmlAbsolutePath, xmlBuffer);
        if (pdfBuffer && pdfAbsolutePath) {
          fs.writeFileSync(pdfAbsolutePath, pdfBuffer);
        }

        const zipPath = path.posix.join(publicBasePath, zipFileName);
        const xmlPath = path.posix.join(publicBasePath, xmlFileName);
        const pdfPath = pdfAbsolutePath ? path.posix.join(publicBasePath, pdfFileName) : "";
        const receivedAt = message.createdAt || "";
        const processed = Number(existing?.processed) ? 1 : 0;

        if (existing?.id) {
          updateInboxRow.run(
            metadata.supplierName || "",
            metadata.supplierCui || "",
            metadata.buyerCui || "",
            metadata.invoiceNumber || message.uploadIndex || message.downloadId,
            message.type || "FACTURA PRIMITA",
            message.details || "",
            zipPath,
            xmlPath,
            pdfPath || null,
            normalizeEnvironment(environment),
            receivedAt,
            processed,
            existing.id,
            companyId
          );
          summary.updatedCount += 1;
        } else {
          insertInboxRow.run(
            metadata.supplierName || "",
            metadata.supplierCui || "",
            metadata.buyerCui || "",
            metadata.invoiceNumber || message.uploadIndex || message.downloadId,
            message.type || "FACTURA PRIMITA",
            message.details || "",
            message.downloadId,
            zipPath,
            xmlPath,
            pdfPath || null,
            normalizeEnvironment(environment),
            receivedAt,
            processed,
            companyId
          );
          summary.importedCount += 1;
        }
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      summary.failedCount += 1;
      summary.errors.push(`${message.downloadId}: ${String(error?.message || error)}`);
    }
  }

  return {
    ok: true,
    environment: normalizeEnvironment(environment),
    title: listed.title,
    serial: listed.serial,
    ...summary
  };
}
