import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { db, DB_PATH } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
const MIME_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

function argValue(name, fallback = "") {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] || fallback;
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function safeText(value = "") {
  return String(value || "").trim();
}

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function safeFileName(value = "document") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "document";
}

function titleFromFileName(fileName = "") {
  return safeText(path.basename(fileName, path.extname(fileName)))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Oferta importata";
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function normalizeClientCuiFromName(clientName = "") {
  const base = slugify(clientName).slice(0, 42) || `CLIENT-${Date.now().toString(36).toUpperCase()}`;
  return `DOSAR-${base}`;
}

function findExistingClient(companyId, clientName) {
  return db.prepare(`
    SELECT id, name, cui
    FROM clients
    WHERE company_id=?
      AND LOWER(TRIM(name)) = LOWER(TRIM(?))
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId, clientName);
}

function ensureClient(companyId, clientName, commit) {
  const existingByName = findExistingClient(companyId, clientName);
  if (existingByName) return { ...existingByName, created: false };

  let cui = normalizeClientCuiFromName(clientName);
  let suffix = 2;
  while (db.prepare("SELECT id FROM clients WHERE company_id=? AND cui=?").get(companyId, cui)) {
    cui = `${normalizeClientCuiFromName(clientName).slice(0, 48)}-${suffix}`;
    suffix += 1;
  }

  if (!commit) {
    return { id: 0, name: clientName, cui, created: true };
  }

  const info = db.prepare(`
    INSERT INTO clients (cui, name, vat, inactive, client_status, notes, company_id)
    VALUES (?, ?, 0, 0, 'verde', ?, ?)
  `).run(cui, clientName, "Creat automat la importul bulk de dosare cu oferte.", companyId);

  return { id: info.lastInsertRowid, name: clientName, cui, created: true };
}

function formatQuoteImportRegistrationNumber(year, seq) {
  return `OFE-${year}-${String(seq).padStart(5, "0")}`;
}

function nextQuoteImportRegistration(companyId) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM sales_quote_imports
    WHERE company_id=? AND year=?
  `).get(companyId, year)?.next_seq || 1);
  let registrationNumber = "";

  do {
    registrationNumber = formatQuoteImportRegistrationNumber(year, seq);
    seq += 1;
  } while (db.prepare("SELECT id FROM sales_quote_imports WHERE company_id=? AND registration_number=?").get(companyId, registrationNumber));

  return { year, seq: seq - 1, registrationNumber };
}

function listFilesRecursive(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

function discoverCandidates(sourceDir, maxBytes) {
  const candidates = [];
  const skipped = [];

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const entryPath = path.join(sourceDir, entry.name);
    if (!entry.isDirectory()) {
      if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
      skipped.push({ reason: "root_file", path: entryPath });
      continue;
    }

    const clientName = safeText(entry.name);
    if (!clientName) continue;

    for (const filePath of listFilesRecursive(entryPath)) {
      const extension = path.extname(filePath).toLowerCase();
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(sourceDir, filePath);

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        skipped.push({ reason: "unsupported_extension", path: filePath });
        continue;
      }

      if (stat.size > maxBytes) {
        skipped.push({ reason: "file_too_large", path: filePath, size: stat.size });
        continue;
      }

      candidates.push({
        clientName,
        filePath,
        relativePath,
        originalFileName: path.basename(filePath),
        extension,
        size: stat.size,
      });
    }
  }

  candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "ro"));
  return { candidates, skipped };
}

function existingImport(companyId, clientId, originalFileName, fileSize, checksum) {
  const byChecksum = db.prepare(`
    SELECT id, registration_number
    FROM sales_quote_imports
    WHERE company_id=?
      AND client_id=?
      AND notes LIKE ?
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId, clientId, `%sha256=${checksum}%`);
  if (byChecksum) return byChecksum;

  if (!clientId) return null;
  return db.prepare(`
    SELECT id, registration_number
    FROM sales_quote_imports
    WHERE company_id=?
      AND client_id=?
      AND original_file_name=?
      AND file_size=?
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId, clientId, originalFileName, fileSize);
}

function destinationForFile(companyId, registrationNumber, originalFileName) {
  const directory = path.join(APP_ROOT, "uploads", "sales", "offers", `company-${companyId}`);
  const storedFileName = `${registrationNumber}-${safeFileName(originalFileName)}`;
  const destination = path.join(directory, storedFileName);
  const filePath = path.posix.join("uploads", "sales", "offers", `company-${companyId}`, storedFileName);
  return { directory, storedFileName, destination, filePath };
}

function importCandidate(candidate, options) {
  const checksum = sha256File(candidate.filePath);
  const client = ensureClient(options.companyId, candidate.clientName, options.commit);
  const duplicate = existingImport(options.companyId, client.id, candidate.originalFileName, candidate.size, checksum);
  if (duplicate) {
    return {
      action: "skip_duplicate",
      client,
      candidate,
      checksum,
      registrationNumber: duplicate.registration_number,
    };
  }

  if (!options.commit) {
    return {
      action: "would_import",
      client,
      candidate,
      checksum,
      registrationNumber: "(dry-run)",
    };
  }

  const registration = nextQuoteImportRegistration(options.companyId);
  const destination = destinationForFile(options.companyId, registration.registrationNumber, candidate.originalFileName);
  fs.mkdirSync(destination.directory, { recursive: true });
  fs.copyFileSync(candidate.filePath, destination.destination);

  const notes = [
    "Import bulk dosare oferte.",
    `client_folder=${candidate.clientName}`,
    `source_relative_path=${candidate.relativePath}`,
    `sha256=${checksum}`,
  ].join(" | ");

  db.prepare(`
    INSERT INTO sales_quote_imports (
      company_id, year, seq, registration_number, client_id, title,
      original_file_name, stored_file_name, file_path, mime_type, file_size,
      extension, status, notes, created_by_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IMPORTATA', ?, ?)
  `).run(
    options.companyId,
    registration.year,
    registration.seq,
    registration.registrationNumber,
    client.id,
    titleFromFileName(candidate.originalFileName),
    candidate.originalFileName,
    destination.storedFileName,
    destination.filePath,
    MIME_BY_EXTENSION.get(candidate.extension) || null,
    candidate.size,
    candidate.extension,
    notes,
    options.createdByEmail
  );

  return {
    action: "imported",
    client,
    candidate,
    checksum,
    registrationNumber: registration.registrationNumber,
  };
}

function printUsage() {
  console.log(`
Importa dosare de oferte in Nexora -> Vanzari -> Oferte importate.

Structura asteptata:
  <source>/
    CLIENT REAL 1/
      Oferta.pdf
      Anexa 2.docx
    CLIENT REAL 2/
      subfolder optional/
        Oferta.xlsx

Comenzi:
  node scripts/import-client-offer-folders.mjs --source utile/import-oferte-clienti
  node scripts/import-client-offer-folders.mjs --source utile/import-oferte-clienti --commit

Optiuni:
  --source <dir>          Folderul radacina cu dosare pe clienti.
  --company-id <id>      Implicit: 1.
  --created-by <email>   Implicit: bulk-import@nexora.local.
  --max-mb <nr>          Implicit: 30, la fel ca importul manual din UI.
  --commit               Fara acest flag ruleaza doar verificare dry-run.
`);
}

const sourceArg = argValue("--source", "");
if (hasFlag("--help") || !sourceArg) {
  printUsage();
  process.exit(sourceArg ? 0 : 1);
}

const sourceDir = path.resolve(APP_ROOT, sourceArg);
const companyId = Number(argValue("--company-id", "1") || 1);
const createdByEmail = safeText(argValue("--created-by", "bulk-import@nexora.local")) || "bulk-import@nexora.local";
const maxMb = Number(argValue("--max-mb", "30") || 30);
const maxBytes = Math.max(1, maxMb) * 1024 * 1024;
const commit = hasFlag("--commit");

if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  console.error(`Folderul sursa nu exista sau nu este director: ${sourceDir}`);
  process.exit(1);
}

if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error(`company-id invalid: ${companyId}`);
  process.exit(1);
}

const company = db.prepare("SELECT id, name FROM companies WHERE id=?").get(companyId);
if (!company) {
  console.error(`Nu exista companie cu id=${companyId}.`);
  process.exit(1);
}

const { candidates, skipped } = discoverCandidates(sourceDir, maxBytes);
const results = [];

const runImport = db.transaction(() => {
  for (const candidate of candidates) {
    results.push(importCandidate(candidate, { companyId, createdByEmail, commit }));
  }
});

try {
  runImport();
} catch (error) {
  console.error("Importul a esuat:", error);
  process.exit(1);
} finally {
  db.close();
}

const summary = results.reduce((acc, result) => {
  acc[result.action] = (acc[result.action] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  mode: commit ? "commit" : "dry-run",
  db: DB_PATH,
  company: { id: company.id, name: company.name },
  sourceDir,
  supportedExtensions: [...SUPPORTED_EXTENSIONS],
  candidates: candidates.length,
  skipped: skipped.length,
  summary,
}, null, 2));

for (const result of results) {
  const marker = result.action === "imported" ? "IMPORTAT"
    : result.action === "skip_duplicate" ? "DUPLICAT"
    : "AR_IMPORTA";
  const clientMarker = result.client.created ? "client nou" : "client existent";
  console.log(`${marker} | ${result.registrationNumber} | ${result.client.name} (${clientMarker}) | ${result.candidate.relativePath}`);
}

if (skipped.length) {
  console.log("\nFisiere sarite:");
  for (const item of skipped) {
    console.log(`${item.reason} | ${path.relative(sourceDir, item.path)}${item.size ? ` | ${item.size} bytes` : ""}`);
  }
}

if (!commit) {
  console.log("\nDry-run finalizat. Ruleaza din nou cu --commit pentru import real.");
}
