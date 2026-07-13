#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const COUNTRY = "Portugal";
const SOURCE = "official_portugal_rnt";
const BASE_URL = "https://webservices.turismodeportugal.pt/RNT_External/rest/RNT";

const DEFAULT_CONCELHOS = [
  "Lisboa",
  "Porto",
  "Faro",
  "Albufeira",
  "Lagos",
  "Portimão",
  "Cascais",
  "Sintra",
  "Funchal",
  "Loulé",
  "Tavira",
  "Olhão",
  "Lagoa",
  "Silves",
  "Vila Real de Santo António",
  "Aljezur",
  "Sesimbra",
  "Setúbal",
  "Odemira",
  "Nazaré",
  "Peniche",
  "Óbidos",
  "Aveiro",
  "Braga",
  "Coimbra",
  "Évora",
  "Leiria",
  "Mafra",
  "Matosinhos",
  "Vila Nova de Gaia",
  "Ponta Delgada",
  "Angra do Heroísmo",
  "Horta",
  "Ribeira Grande",
  "Calheta",
  "Santa Cruz",
  "Câmara de Lobos",
  "Machico",
  "Santana",
  "Porto Santo"
];

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasArg(name) {
  return process.argv.includes(name) || process.argv.some((item) => item.startsWith(`${name}=`));
}

function safeText(value = "") {
  return String(value ?? "").trim();
}

function stripDiacritics(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

function normalizePhone(value = "") {
  let digits = safeText(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `351${digits}`;
  return digits;
}

function parseList(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function propertyType(value = "") {
  const normalized = normalizeKey(value);
  if (normalized.includes("hotel")) return "hotel";
  if (normalized.includes("apartamento")) return "apartament";
  if (normalized.includes("moradia")) return "vila";
  if (normalized.includes("quartos")) return "camere de inchiriat";
  if (normalized.includes("hospedagem")) return "guest house";
  if (normalized.includes("campismo")) return "camping";
  if (normalized.includes("aldeamento")) return "resort";
  return safeText(value).toLowerCase() || "cazare";
}

function selectCompany(companyId) {
  if (companyId) {
    const selected = db.prepare("SELECT id, name FROM companies WHERE id=?").get(companyId);
    if (selected) return selected;
  }
  return db.prepare(`
    SELECT id, name
    FROM companies
    WHERE status='active'
    ORDER BY id
    LIMIT 1
  `).get() || db.prepare("SELECT id, name FROM companies ORDER BY id LIMIT 1").get();
}

function loadKeySets(companyId) {
  const keySets = { email: new Set(), nameCity: new Set(), phone: new Set() };
  const rows = db.prepare(`
    SELECT name, country, city, phone, email
    FROM travel_leads
    WHERE company_id=?
    UNION ALL
    SELECT name, country, city, phone, email
    FROM travel_properties
    WHERE company_id=?
  `).all(companyId, companyId);

  for (const row of rows) addKeys(keySets, row);
  return keySets;
}

function addKeys(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const name = normalizeKey(row.name);
  const city = normalizeKey(row.city);
  const country = normalizeKey(row.country || COUNTRY);
  if (phone) keySets.phone.add(phone);
  if (email) keySets.email.add(email);
  if (name && city) keySets.nameCity.add(`${country}|${name}|${city}`);
}

function duplicateReason(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const name = normalizeKey(row.name);
  const city = normalizeKey(row.city);
  const country = normalizeKey(row.country || COUNTRY);
  if (email && keySets.email.has(email)) return "email";
  if (phone && keySets.phone.has(phone)) return "phone";
  if (name && city && keySets.nameCity.has(`${country}|${name}|${city}`)) return "name_city";
  return "";
}

function scoreCandidate(candidate) {
  let score = 0;
  if (candidate.phone) score += 20;
  if (candidate.email) score += 20;
  if (candidate.website) score += 15;
  return score;
}

function candidateFromRnal(record = {}, sourceUrl = "") {
  const holder = record.TitulardaExploracao || {};
  const name = safeText(record.NomeAlojamento || holder.Nome);
  const city = safeText(record.Localidade || record.Concelho);
  const phone = safeText(holder.Telemovel || holder.Telefone || record.Telefone);
  const email = normalizeEmail(holder.Email || record.Email);
  if (!name || !city) return { error: "missing_name_or_city" };
  if (!phone && !email) return { error: "missing_contact" };

  const notes = [
    "Import Portugal RNAL",
    `source_url=${sourceUrl}`,
    record.NrRegisto ? `registo=${record.NrRegisto}` : "",
    record.DataRegisto ? `data_registo=${record.DataRegisto}` : "",
    record.Modalidade ? `modalidade=${record.Modalidade}` : "",
    record.NrUtentes ? `utentes=${record.NrUtentes}` : "",
    holder.Tipo ? `titular_tipo=${holder.Tipo}` : "",
    holder.Nome ? `titular=${holder.Nome}` : ""
  ].filter(Boolean).join("; ");

  const candidate = {
    name,
    property_type: propertyType(record.Modalidade),
    country: COUNTRY,
    city,
    county: safeText(record.Distrito),
    address: [safeText(record.Endereco), safeText(record.CodPostal), city].filter(Boolean).join(", "),
    phone,
    email,
    website: "",
    facebook: "",
    instagram: "",
    google_rating: null,
    google_reviews: 0,
    source: SOURCE,
    status: "nou",
    score: 0,
    notes,
    next_follow_up_at: null
  };
  candidate.score = scoreCandidate(candidate);
  return { candidate };
}

function candidateFromRnet(record = {}, sourceUrl = "") {
  const name = safeText(record.Nome || record.Marca || record.EntidadeExploradora);
  const city = safeText(record.Localidade || record.Concelho);
  const phone = safeText(record.Telefone || record.Telemovel);
  const email = normalizeEmail(record.Email);
  if (!name || !city) return { error: "missing_name_or_city" };
  if (!phone && !email) return { error: "missing_contact" };

  const notes = [
    "Import Portugal RNET",
    `source_url=${sourceUrl}`,
    record.NrRegisto ? `registo=${record.NrRegisto}` : "",
    record.DataRegisto ? `data_registo=${record.DataRegisto}` : "",
    record.Tipologia ? `tipologia=${record.Tipologia}` : "",
    record.Categoria ? `categoria=${record.Categoria}` : "",
    record.Capacidade ? `capacidade=${record.Capacidade}` : "",
    record.EntidadeExploradora ? `entidade_exploradora=${record.EntidadeExploradora}` : ""
  ].filter(Boolean).join("; ");

  const candidate = {
    name,
    property_type: propertyType(record.Tipologia),
    country: COUNTRY,
    city,
    county: safeText(record.Distrito),
    address: [safeText(record.Endereco), safeText(record.CodPostal), city].filter(Boolean).join(", "),
    phone,
    email,
    website: "",
    facebook: "",
    instagram: "",
    google_rating: null,
    google_reviews: 0,
    source: SOURCE,
    status: "nou",
    score: 0,
    notes,
    next_follow_up_at: null
  };
  candidate.score = scoreCandidate(candidate);
  return { candidate };
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "NexoraTravelPortugalRNTImport/1.0"
      },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function insertCandidates(companyId, candidates = []) {
  const insert = db.prepare(`
    INSERT INTO travel_leads (
      company_id, name, property_type, country, city, county, address, phone, email, website,
      facebook, instagram, google_rating, google_reviews, source, status, score,
      notes, next_follow_up_at, created_at, updated_at
    )
    VALUES (
      @company_id, @name, @property_type, @country, @city, @county, @address, @phone, @email, @website,
      @facebook, @instagram, @google_rating, @google_reviews, @source, @status, @score,
      @notes, @next_follow_up_at, datetime('now'), datetime('now')
    )
  `);

  const run = db.transaction((rows) => {
    const ids = [];
    for (const row of rows) {
      const result = insert.run({ company_id: companyId, ...row });
      ids.push(result.lastInsertRowid);
    }
    return ids;
  });

  return run(candidates);
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `portugal-rnt-accommodations-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  migrate();
  const args = {
    companyId: Number(argValue("--company-id", "0")) || 0,
    dryRun: hasArg("--dry-run"),
    limit: Math.max(0, Number(argValue("--limit", "0")) || 0),
    timeoutMs: Math.max(10_000, Number(argValue("--timeout-ms", "60000")) || 60_000),
    concelhos: parseList(argValue("--concelhos", "")).length
      ? parseList(argValue("--concelhos", ""))
      : DEFAULT_CONCELHOS
  };

  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");

  const keySets = loadKeySets(company.id);
  const candidates = [];
  const stats = {
    company_id: company.id,
    company_name: company.name,
    country: COUNTRY,
    source: SOURCE,
    dry_run: args.dryRun,
    concelhos_requested: args.concelhos,
    fetched: 0,
    normalized: 0,
    created: 0,
    skipped_duplicates: 0,
    skipped_invalid: 0,
    duplicate_reasons: {},
    invalid_reasons: {},
    errors: [],
    samples: []
  };

  for (const concelho of args.concelhos) {
    for (const registry of ["RNAL", "RNET"]) {
      if (args.limit && candidates.length >= args.limit) break;
      const url = `${BASE_URL}/list_${registry}?Concelho=${encodeURIComponent(concelho)}`;
      try {
        console.log(`Portugal ${registry} ${concelho}`);
        const rows = await fetchJson(url, args.timeoutMs);
        const list = Array.isArray(rows) ? rows : [];
        stats.fetched += list.length;
        for (const item of list) {
          const record = registry === "RNAL" ? item.RNAL_Registo : item.RNET_Registo;
          const { candidate, error } = registry === "RNAL"
            ? candidateFromRnal(record, url)
            : candidateFromRnet(record, url);
          if (error) {
            stats.skipped_invalid += 1;
            stats.invalid_reasons[error] = (stats.invalid_reasons[error] || 0) + 1;
            continue;
          }
          const reason = duplicateReason(keySets, candidate);
          if (reason) {
            stats.skipped_duplicates += 1;
            stats.duplicate_reasons[reason] = (stats.duplicate_reasons[reason] || 0) + 1;
            continue;
          }
          addKeys(keySets, candidate);
          candidates.push(candidate);
          stats.normalized += 1;
          if (stats.samples.length < 20) {
            stats.samples.push({
              name: candidate.name,
              city: candidate.city,
              property_type: candidate.property_type,
              phone: candidate.phone,
              email: candidate.email,
              score: candidate.score
            });
          }
          if (args.limit && candidates.length >= args.limit) break;
        }
      } catch (error) {
        stats.errors.push({ registry, concelho, error: error.message });
        console.error(`Portugal ${registry} ${concelho} failed: ${error.message}`);
      }
    }
  }

  if (!args.dryRun && candidates.length) {
    const insertedIds = insertCandidates(company.id, candidates);
    stats.created = insertedIds.length;
    stats.first_inserted_id = insertedIds[0] || null;
    stats.last_inserted_id = insertedIds.at(-1) || null;
  }

  stats.report_path = writeReport(stats);
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
