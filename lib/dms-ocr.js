import { execFile, execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import PizZip from "pizzip";
import { PROFILE_FIELDS } from "./dms-autofill.js";

const execFileAsync = promisify(execFile);
const MAX_OCR_PDF_PAGES = Number(process.env.DMS_OCR_MAX_PAGES || 5);
const MAX_BUFFER = 30 * 1024 * 1024;
const MIN_NATIVE_PDF_TEXT_LENGTH = 40;

class DmsOcrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DmsOcrError";
    this.code = code;
  }
}

function hasBinary(name) {
  try {
    execFileSync("which", [name], { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function getTesseractLanguages() {
  if (!hasBinary("tesseract")) return [];
  try {
    const output = execFileSync("tesseract", ["--list-langs"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 5000
    });
    return output
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !/^list of available languages/i.test(line));
  } catch {
    return [];
  }
}

function getDmsOcrRuntimeStatus() {
  const tesseractAvailable = hasBinary("tesseract");
  const tesseractLanguages = tesseractAvailable ? getTesseractLanguages() : [];
  return {
    pdftotextAvailable: hasBinary("pdftotext"),
    pdftoppmAvailable: hasBinary("pdftoppm"),
    tesseractAvailable,
    tesseractLanguages,
    romanianLanguageAvailable: tesseractLanguages.includes("ron"),
    englishLanguageAvailable: tesseractLanguages.includes("eng"),
    maxPdfPages: MAX_OCR_PDF_PAGES
  };
}

function repairDocxTextArtifacts(value = "") {
  return String(value || "")
    .replaceAll("昀", "f")
    .replaceAll("椀", "i")
    .replaceAll("琀", "t");
}

function decodeXmlText(value = "") {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalizeExtractedText(value = "") {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\r?\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function normalizeSearchText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nexora-ocr-"));
}

function writeTempFile(directory, buffer, extension) {
  const safeExtension = String(extension || ".bin").replace(/[^a-z0-9.]/gi, "") || ".bin";
  const filePath = path.join(directory, `input${safeExtension.startsWith(".") ? safeExtension : `.${safeExtension}`}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function runCommand(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      timeout: options.timeout || 60000
    });
  } catch (error) {
    const stderr = String(error?.stderr || error?.message || "");
    throw new DmsOcrError(options.errorCode || "ocr_failed", stderr || `Comanda ${command} a eșuat.`);
  }
}

function extractDocxText(buffer) {
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new DmsOcrError("invalid_docx", "Fișierul DOCX nu poate fi citit.");
  }

  const xmlParts = Object.keys(zip.files).filter((fileName) =>
    /^word\/(document|header[0-9]+|footer[0-9]+)\.xml$/i.test(fileName)
  );
  const lines = [];
  const textNodePattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
  const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/gi;

  const extractTextNodes = (xml = "") => {
    const pieces = [];
    let match;
    textNodePattern.lastIndex = 0;
    while ((match = textNodePattern.exec(xml)) !== null) {
      pieces.push(decodeXmlText(repairDocxTextArtifacts(match[1] || "")));
    }
    return pieces.join("");
  };

  for (const fileName of xmlParts) {
    const xml = zip.file(fileName)?.asText() || "";
    let paragraphMatch;
    let foundParagraph = false;
    while ((paragraphMatch = paragraphPattern.exec(xml)) !== null) {
      foundParagraph = true;
      const line = extractTextNodes(paragraphMatch[0]);
      if (line.trim()) lines.push(line);
    }
    if (!foundParagraph) {
      const line = extractTextNodes(xml);
      if (line.trim()) lines.push(line);
    }
  }

  return normalizeExtractedText(lines.join("\n"));
}

async function extractNativePdfText(inputPath) {
  const status = getDmsOcrRuntimeStatus();
  if (!status.pdftotextAvailable) {
    throw new DmsOcrError("ocr_unavailable", "pdftotext nu este instalat pe server.");
  }

  const result = await runCommand(
    "pdftotext",
    ["-layout", "-enc", "UTF-8", inputPath, "-"],
    { timeout: 45000, errorCode: "invalid_pdf" }
  );
  return normalizeExtractedText(result.stdout || "");
}

function pickTesseractLanguage(status) {
  const preferred = String(process.env.DMS_OCR_LANG || "ron+eng")
    .split("+")
    .map((language) => language.trim())
    .filter(Boolean);
  const available = preferred.filter((language) => status.tesseractLanguages.includes(language));
  if (available.length) return available.join("+");
  if (status.tesseractLanguages.includes("eng")) return "eng";
  return "";
}

async function runTesseractOnImage(imagePath, status) {
  if (!status.tesseractAvailable) {
    throw new DmsOcrError("ocr_unavailable", "Tesseract OCR nu este instalat pe server.");
  }
  const language = pickTesseractLanguage(status);
  const args = [imagePath, "stdout"];
  if (language) args.push("-l", language);
  args.push("--psm", "6");
  const result = await runCommand("tesseract", args, { timeout: 90000, errorCode: "ocr_failed" });
  return normalizeExtractedText(result.stdout || "");
}

async function extractOcrPdfText(inputPath, directory, status) {
  if (!status.pdftoppmAvailable || !status.tesseractAvailable) {
    throw new DmsOcrError(
      "ocr_unavailable",
      "Pentru PDF scanat sunt necesare pdftoppm și Tesseract OCR pe server."
    );
  }

  const prefix = path.join(directory, "page");
  await runCommand(
    "pdftoppm",
    ["-f", "1", "-l", String(status.maxPdfPages || MAX_OCR_PDF_PAGES), "-r", "220", "-png", inputPath, prefix],
    { timeout: 90000, errorCode: "invalid_pdf" }
  );

  const images = fs.readdirSync(directory)
    .filter((fileName) => /^page-\d+\.png$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((fileName) => path.join(directory, fileName));

  if (!images.length) {
    throw new DmsOcrError("empty_text", "Nu am putut transforma PDF-ul în imagini pentru OCR.");
  }

  const pages = [];
  for (const imagePath of images) {
    pages.push(await runTesseractOnImage(imagePath, status));
  }
  return normalizeExtractedText(pages.filter(Boolean).join("\n\n"));
}

async function extractPdfText(buffer, extension) {
  const directory = createTempDirectory();
  try {
    const inputPath = writeTempFile(directory, buffer, extension);
    const status = getDmsOcrRuntimeStatus();
    const nativeText = status.pdftotextAvailable
      ? await extractNativePdfText(inputPath)
      : "";
    if (nativeText.length >= MIN_NATIVE_PDF_TEXT_LENGTH) {
      return {
        method: "pdf_text",
        text: nativeText,
        warnings: []
      };
    }

    const ocrText = await extractOcrPdfText(inputPath, directory, status);
    return {
      method: "pdf_ocr",
      text: ocrText,
      warnings: nativeText ? ["PDF-ul avea foarte puțin text selectabil; a fost folosit OCR."] : []
    };
  } finally {
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
  }
}

async function extractImageText(buffer, extension) {
  const directory = createTempDirectory();
  try {
    const inputPath = writeTempFile(directory, buffer, extension);
    const status = getDmsOcrRuntimeStatus();
    const text = await runTesseractOnImage(inputPath, status);
    return {
      method: "image_ocr",
      text,
      warnings: []
    };
  } finally {
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
  }
}

function profileValue(profile, key) {
  return String(profile?.[key] || "").trim();
}

function fieldKeywords(field) {
  const keywords = [
    field.label,
    ...(field.pdfAliases || []),
    ...(field.tokens || [])
  ];
  if (field.key === "company_name") keywords.push("ofertant", "asociat", "solicitant", "operator economic");
  if (field.key === "company_cui") keywords.push("cod de inregistrare fiscala", "cod unic de inregistrare", "cif");
  if (field.key === "company_address") keywords.push("sediul social", "adresa sediu", "adresa ofertant");
  if (field.key === "legal_representative") keywords.push("subsemnatul", "subsemnata", "reprezentant legal");
  if (field.key === "legal_representative_cnp") keywords.push("cnp", "pasaport");
  if (field.key === "legal_representative_ci_series") keywords.push("seria ci", "serie ci", "ci seria");
  if (field.key === "legal_representative_ci_number") keywords.push("nr ci", "numar ci", "ci nr");
  if (field.key === "legal_representative_ci_issued_by") keywords.push("eliberat de", "emis de");
  return [...new Set(keywords.map(normalizeSearchText).filter(Boolean))];
}

function suggestDmsOcrProfileFields(text, profile) {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return [];

  return PROFILE_FIELDS.map((field) => {
    const value = profileValue(profile, field.key);
    if (!value) return null;

    const normalizedValue = normalizeSearchText(value);
    const valueAlreadyPresent = normalizedValue.length >= 3 && normalizedText.includes(normalizedValue);
    const matchedKeyword = fieldKeywords(field).find((keyword) => normalizedText.includes(keyword));
    if (!valueAlreadyPresent && !matchedKeyword) return null;

    return {
      key: field.key,
      label: field.label,
      value,
      reason: valueAlreadyPresent ? "valoare găsită în document" : `etichetă detectată: ${matchedKeyword}`
    };
  }).filter(Boolean);
}

async function extractDmsOcrText({ buffer, extension }) {
  const normalizedExtension = String(extension || "").toLowerCase();
  let result;

  if (normalizedExtension === ".docx") {
    result = {
      method: "docx_text",
      text: extractDocxText(buffer),
      warnings: []
    };
  } else if (normalizedExtension === ".pdf") {
    result = await extractPdfText(buffer, normalizedExtension);
  } else if ([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"].includes(normalizedExtension)) {
    result = await extractImageText(buffer, normalizedExtension);
  } else {
    throw new DmsOcrError("unsupported_type", "Sunt acceptate DOCX, PDF sau imagini.");
  }

  if (!result.text) {
    throw new DmsOcrError("empty_text", "Nu am putut extrage text din document.");
  }

  return {
    ...result,
    textLength: result.text.length
  };
}

export {
  DmsOcrError,
  extractDmsOcrText,
  getDmsOcrRuntimeStatus,
  suggestDmsOcrProfileFields
};
