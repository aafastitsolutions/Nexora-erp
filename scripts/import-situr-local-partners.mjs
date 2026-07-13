#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { db, migrate } from "../db.js";

const CENTERS_URL = "https://se.situr.gov.ro/OpenData/ExportToExcel?type=listaCentreInformare";
const CENTERS_SOURCE_URL = "https://se.situr.gov.ro/OpenData/OpenDataList?type=listaCentreInformare";
const OMD_URL = "https://se.situr.gov.ro/StaticCustom/Asset?filename=Lista-organizatiilor-de-management-al-destinatiei-avizate.xlsx";
const OMD_SOURCE_URL = "https://se.situr.gov.ro/OpenData/OpenDataMain";

function parseArgs(argv = []) {
  const args = {
    companyId: 0,
    dryRun: false,
    skipCenters: false,
    skipOmd: false,
    timeoutMs: 60_000
  };
  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (item === "--skip-centers") {
      args.skipCenters = true;
      continue;
    }
    if (item === "--skip-omd") {
      args.skipOmd = true;
      continue;
    }
    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "timeout-ms") args.timeoutMs = Math.max(10_000, Number(rawValue) || args.timeoutMs);
  }
  return args;
}

function safeText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripDiacritics(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șȘ]/g, "s")
    .replace(/[țȚ]/g, "t");
}

function normalizeKey(value = "") {
  return stripDiacritics(safeText(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const text = safeText(value).toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function normalizeWebsite(value = "") {
  const text = safeText(value);
  if (!text || text.toLowerCase() === "www.") return "";
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./i, "").toLowerCase() + url.pathname.replace(/\/+$/, "");
  } catch {
    return text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

function decodeXml(value = "") {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function colIndex(ref = "") {
  const letters = (safeText(ref).match(/[A-Z]+/) || [""])[0];
  let result = 0;
  for (const char of letters) result = result * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, result - 1);
}

function parseAttrs(value = "") {
  return Object.fromEntries([...String(value || "").matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Nu pot citi arhiva XLSX: EOCD lipsă.");
}

function zipEntryBuffer(filePath, entryName) {
  const buffer = fs.readFileSync(filePath);
  const eocd = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end && buffer.readUInt32LE(offset) === 0x02014b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error(`Header XLSX invalid pentru ${entryName}.`);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Metodă ZIP nesuportată (${compressionMethod}) pentru ${entryName}.`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Intrarea XLSX nu există: ${entryName}`);
}

function unzipText(filePath, entry) {
  return zipEntryBuffer(filePath, entry).toString("utf8");
}

function parseXlsx(filePath) {
  let sharedStrings = [];
  try {
    const sharedXml = unzipText(filePath, "xl/sharedStrings.xml");
    sharedStrings = [...sharedXml.matchAll(/<[^:>]*(?::)?si>([\s\S]*?)<\/[^:>]*(?::)?si>/g)]
      .map((match) => decodeXml(
        [...match[1].matchAll(/<[^:>]*(?::)?t[^>]*>([\s\S]*?)<\/[^:>]*(?::)?t>/g)]
          .map((textMatch) => textMatch[1])
          .join("")
      ));
  } catch {
    sharedStrings = [];
  }

  const sheetXml = unzipText(filePath, "xl/worksheets/sheet1.xml");
  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<[^:>]*(?::)?row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/[^:>]*(?::)?row>/g)) {
    const cells = [];
    const rowBody = rowMatch[2];
    for (const cellMatch of rowBody.matchAll(/<[^:>]*(?::)?c\b([^>]*?)\/>|<[^:>]*(?::)?c\b([^>]*)>([\s\S]*?)<\/[^:>]*(?::)?c>/g)) {
      const attrs = parseAttrs(cellMatch[1] || cellMatch[2] || "");
      const body = cellMatch[3] || "";
      const index = colIndex(attrs.r || "");
      const type = attrs.t || "";
      const valueMatch = body.match(/<[^:>]*(?::)?v>([\s\S]*?)<\/[^:>]*(?::)?v>/);
      let value = "";
      if (valueMatch) {
        value = decodeXml(valueMatch[1]);
        if (type === "s") value = sharedStrings[Number(value)] || "";
      } else {
        value = decodeXml(
          [...body.matchAll(/<[^:>]*(?::)?t[^>]*>([\s\S]*?)<\/[^:>]*(?::)?t>/g)]
            .map((textMatch) => textMatch[1])
            .join("")
        );
      }
      cells[index] = value;
    }
    if (cells.some((value) => safeText(value))) rows.push(cells.map((value) => safeText(value)));
  }
  return rows;
}

async function downloadXlsx(url, fileName, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Nexora/Trevoro local partner importer"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trevoro-local-partners-"));
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } finally {
    clearTimeout(timeout);
  }
}

function extractRegionCity(address = "", fallbackName = "") {
  const text = safeText(address);
  const parts = text.split(",").map(safeText).filter(Boolean);
  const region = parts[0] || "";
  let city = "";
  const localityPattern = /\b(?:Mun\.|Oraş|Oraș|Com\.|Sat|Loc\.)\s+([^,]+)/i;
  const match = text.match(localityPattern);
  if (match) city = safeText(match[1]);
  if (!city && fallbackName) {
    city = safeText(fallbackName
      .replace(/Centrul (?:Național|National|Local) de Informare (?:și|si) Promovare Turistică/i, "")
      .replace(/Centrul (?:Național|National|Local) de Informare (?:și|si) Promovare Turistică al județului/i, "")
      .replace(/în municipiul/i, "")
    );
  }
  return { region, city };
}

function potentialReachForCenter({ administrator = "", city = "", region = "" } = {}) {
  const adminKey = normalizeKey(administrator);
  if (adminKey.includes("consiliul judetean")) return 200;
  if (normalizeKey(city) === normalizeKey(region)) return 100;
  return 60;
}

function potentialReachForOmd(type = "") {
  const key = normalizeKey(type);
  if (key.includes("regional")) return 300;
  if (key.includes("judetean")) return 200;
  return 100;
}

function centerRowsToPartners(rows = []) {
  return rows
    .filter((row) => normalizeKey(row[0]).startsWith("centrul "))
    .map((row) => {
      const name = safeText(row[0]);
      const administrator = safeText(row[2]);
      const address = safeText(row[3]);
      const { region, city } = extractRegionCity(address, name);
      return {
        name,
        partner_type: "tourist_info_center",
        country: "Romania",
        region,
        city,
        address,
        administrator,
        phone: safeText(row[4]),
        email: normalizeEmail(row[6]),
        website: safeText(row[7]),
        potential_reach: potentialReachForCenter({ administrator, city, region }),
        source: "situr_tourist_info_centers",
        source_url: CENTERS_SOURCE_URL,
        notes: row[1] ? `Certificat: ${safeText(row[1])}` : ""
      };
    });
}

function omdRowsToPartners(rows = []) {
  return rows
    .filter((row) => safeText(row[9]) && normalizeKey(row[9]) !== "denumirea omd ului")
    .map((row) => {
      const name = safeText(row[9]);
      const region = safeText(row[10]);
      const omdType = safeText(row[11]);
      return {
        name,
        partner_type: "omd",
        country: "Romania",
        region,
        city: region,
        address: "",
        administrator: "",
        phone: "",
        email: "",
        website: "",
        potential_reach: potentialReachForOmd(omdType),
        source: "situr_omd",
        source_url: OMD_SOURCE_URL,
        notes: [`Tip OMD: ${omdType || "-"}`, row[7] ? `Aviz nr. ${safeText(row[7])}` : ""].filter(Boolean).join(" · ")
      };
    });
}

function partnerKeys(partner = {}) {
  const keys = [];
  const email = normalizeEmail(partner.email);
  const website = normalizeWebsite(partner.website);
  if (email) keys.push(`email:${email}`);
  if (website) keys.push(`website:${website}`);
  const nameKey = normalizeKey([partner.name, partner.city, partner.region, partner.partner_type].join(" "));
  if (nameKey) keys.push(`name:${nameKey}`);
  return keys;
}

function loadExistingPartnerKeyMap(companyId) {
  const rows = db.prepare(`
    SELECT id, name, partner_type, region, city, email, website
    FROM travel_local_partners
    WHERE company_id=?
  `).all(companyId);
  const map = new Map();
  for (const row of rows) {
    for (const key of partnerKeys(row)) {
      if (!map.has(key)) map.set(key, row.id);
    }
  }
  return map;
}

function upsertPartners(companyId, partners = [], { dryRun = false } = {}) {
  const existingMap = loadExistingPartnerKeyMap(companyId);
  const insert = db.prepare(`
    INSERT INTO travel_local_partners (
      company_id, name, partner_type, country, region, city, address, administrator,
      phone, email, website, facebook, instagram, potential_reach, source, source_url,
      status, notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, 'nou', ?, datetime('now'))
  `);
  const update = db.prepare(`
    UPDATE travel_local_partners
    SET name=?,
        country=?,
        region=?,
        city=?,
        address=?,
        administrator=?,
        phone=?,
        email=?,
        website=?,
        potential_reach=CASE WHEN COALESCE(potential_reach, 0)=0 THEN ? ELSE potential_reach END,
        source=?,
        source_url=?,
        notes=CASE WHEN COALESCE(notes, '')='' THEN ? ELSE notes END,
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `);

  const stats = { created: 0, updated: 0, skipped: 0, examples: [] };
  if (dryRun) {
    for (const partner of partners) {
      const keys = partnerKeys(partner);
      if (!safeText(partner.name) || !keys.length) {
        stats.skipped += 1;
        continue;
      }
      const existingId = keys.map((key) => existingMap.get(key)).find(Boolean);
      if (existingId) {
        stats.updated += 1;
      } else {
        stats.created += 1;
        if (stats.examples.length < 8) {
          stats.examples.push({ id: null, name: partner.name, type: partner.partner_type, region: partner.region, email: partner.email });
        }
      }
    }
    return stats;
  }
  const run = db.transaction((items) => {
    for (const partner of items) {
      const keys = partnerKeys(partner);
      if (!safeText(partner.name) || !keys.length) {
        stats.skipped += 1;
        continue;
      }
      const existingId = keys.map((key) => existingMap.get(key)).find(Boolean);
      if (existingId) {
        update.run(
          partner.name,
          partner.country || "Romania",
          partner.region,
          partner.city,
          partner.address,
          partner.administrator,
          partner.phone,
          partner.email,
          partner.website,
          Number(partner.potential_reach || 0),
          partner.source,
          partner.source_url,
          partner.notes,
          existingId,
          companyId
        );
        stats.updated += 1;
      } else {
        const result = insert.run(
          companyId,
          partner.name,
          partner.partner_type,
          partner.country || "Romania",
          partner.region,
          partner.city,
          partner.address,
          partner.administrator,
          partner.phone,
          partner.email,
          partner.website,
          Number(partner.potential_reach || 0),
          partner.source,
          partner.source_url,
          partner.notes
        );
        const id = Number(result.lastInsertRowid || 0);
        for (const key of keys) existingMap.set(key, id);
        stats.created += 1;
        if (stats.examples.length < 8) stats.examples.push({ id, name: partner.name, type: partner.partner_type, region: partner.region, email: partner.email });
      }
    }
  });

  if (!dryRun) run(partners);
  return stats;
}

function ensureReportDir() {
  const dir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();
  const companyId = args.companyId || Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
  if (!companyId) throw new Error("Nu exista companie pentru import.");

  const partners = [];
  const sourceStats = {};
  if (!args.skipCenters) {
    const centersPath = await downloadXlsx(CENTERS_URL, "situr-centre-informare.xlsx", args.timeoutMs);
    const rows = parseXlsx(centersPath);
    const centerPartners = centerRowsToPartners(rows);
    partners.push(...centerPartners);
    sourceStats.centers = { rows: rows.length, partners: centerPartners.length };
  }
  if (!args.skipOmd) {
    const omdPath = await downloadXlsx(OMD_URL, "situr-omd.xlsx", args.timeoutMs);
    const rows = parseXlsx(omdPath);
    const omdPartners = omdRowsToPartners(rows);
    partners.push(...omdPartners);
    sourceStats.omd = { rows: rows.length, partners: omdPartners.length };
  }

  const result = upsertPartners(companyId, partners, { dryRun: args.dryRun });
  const report = {
    createdAt: new Date().toISOString(),
    companyId,
    dryRun: args.dryRun,
    sources: sourceStats,
    totalCandidates: partners.length,
    ...result
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(ensureReportDir(), `situr-local-partners-import-report-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main()
  .catch((error) => {
    console.error(`[situr-local-partners-import] ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
