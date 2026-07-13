import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const SICAP_BASE_URL = "https://e-licitatie.ro";
const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";
const OPORTUNITATI_BASE_URL = "https://oportunitati-ue.gov.ro";
const PNRR_BASE_URL = "https://proiecte.pnrr.gov.ro";
const PNRR_ANNOUNCEMENTS_URL = `${PNRR_BASE_URL}/#/anunturi-proceduri`;
const PNRR_ANNOUNCEMENTS_API = `${PNRR_BASE_URL}/api/acquisition-announcement-transparency/anunt-achizitie/filter`;
const BENEFICIAR_FONDURI_UE_BASE_URL = "https://beneficiar.fonduri-ue.ro:8080";
const BENEFICIAR_FONDURI_UE_ANNOUNCEMENTS_URL = `${BENEFICIAR_FONDURI_UE_BASE_URL}/anunturi`;
const DEFAULT_PAGE_SIZE = 50;
const OPORTUNITATI_PAGE_SIZE = 10;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const EU_OPPORTUNITY_SOURCES_FILE = path.join(PROJECT_ROOT, "config", "eu-opportunity-sources.json");
const EU_OPPORTUNITY_DOCS_DIR = path.join(PROJECT_ROOT, "data", "procurement", "eu-documents");

const OPORTUNITATI_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6",
  "user-agent": "Mozilla/5.0 NexoraBot/1.0 (+https://nexora.local)"
};

const PNRR_HEADERS = {
  accept: "application/json, text/plain, */*",
  "content-type": "application/json;charset=UTF-8",
  origin: PNRR_BASE_URL,
  referer: PNRR_ANNOUNCEMENTS_URL,
  "user-agent": "Mozilla/5.0 NexoraBot/1.0 (+https://nexora.local)"
};

const BENEFICIAR_FONDURI_UE_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6",
  "user-agent": "Mozilla/5.0 NexoraBot/1.0 (+https://nexora.local)"
};

function safeText(value = "") {
  return String(value || "").trim();
}

function stripDiacritics(value = "") {
  return safeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTextKey(value = "") {
  return stripDiacritics(decodeHtml(stripTags(value)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const IT_SOFTWARE_KEYWORDS = [
  "software",
  "dezvoltare software",
  "dezvoltare soft",
  "dezvoltare aplicatie",
  "dezvoltare aplicatii",
  "dezvoltare platforma",
  "programare",
  "aplicatie software",
  "aplicatii software",
  "aplicatie informatica",
  "aplicatii informatice",
  "aplicatie web",
  "aplicatii web",
  "aplicatie mobila",
  "aplicatii mobile",
  "platforma online",
  "platforma digitala",
  "platforma informatica",
  "platforma software",
  "platforma web",
  "portal",
  "website",
  "web site",
  "site web",
  "pagina web",
  "chatbot",
  "crm",
  "erp",
  "cms",
  "e commerce",
  "ecommerce",
  "solutie ecommerce",
  "magazin online",
  "platforma turism",
  "soft turism",
  "sistem informatic",
  "sisteme informatice",
  "solutie informatica",
  "solutii informatice",
  "licenta software",
  "licente software",
  "mentenanta software",
  "suport software",
  "implementare software",
  "configurare software",
  "integrare software",
  "baza de date",
  "baze de date",
  "database",
  "hardware",
  "echipamente it",
  "audit it",
  "management retea",
  "retea date",
  "cloud",
  "saas",
  "hosting",
  "servicii it",
  "mentenanta it",
  "server",
  "integrare",
  "integrare api",
  "digitalizare imm",
  "digitalizarea imm",
  "digitalizarea intreprinderilor",
  "digitalizarea sectorului",
  "digitalizarea autoritatilor",
  "transformare digitala",
  "hub de inovare digitala",
  "hub uri de inovare digitala",
  "tehnologii digitale",
  "tehnologia informatiei",
  "tic",
  "ict",
  "cyber",
  "cybersecurity",
  "securitate cibernetica",
  "inteligenta artificiala",
  "machine learning",
  "automatizare procese",
  "rpa",
  "api",
  "interoperabilitate",
  "document management",
  "helpdesk",
  "ticketing",
  "competente digitale",
  "gis"
].map(normalizeTextKey);

const IT_SOFTWARE_CPV_PREFIXES = [
  "48",
  "72"
];

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedPhrase(haystack = "", phrase = "") {
  if (!phrase) return false;
  if (phrase.length <= 3 || !phrase.includes(" ")) {
    return new RegExp(`(^|\\s)${escapeRegExp(phrase)}(\\s|$)`).test(haystack);
  }
  return haystack.includes(phrase);
}

function cpvLooksItSoftware(value = "") {
  const matches = safeText(value).match(/\b\d{2,8}\b/g) || [];
  return matches.some((code) => IT_SOFTWARE_CPV_PREFIXES.some((prefix) => code.startsWith(prefix)));
}

function rawJsonSearchText(item = {}) {
  const raw = safeText(item.raw_json);
  if (!raw) return "";
  if (item.source === "OPORTUNITATI_UE") {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed.fields || {});
    } catch {
      return raw.replace(/"source_context"\s*:\s*"[^"]*"/g, "");
    }
  }
  return raw;
}

function isItSoftwareOpportunity(item = {}) {
  if (cpvLooksItSoftware(item.cpv_code)) return true;
  const haystack = normalizeTextKey([
    item.notice_no,
    item.title,
    item.buyer_name,
    item.cpv_code,
    item.contract_type,
    item.procedure_type,
    item.notice_type,
    item.status,
    rawJsonSearchText(item)
  ].filter(Boolean).join(" "));
  return IT_SOFTWARE_KEYWORDS.some((keyword) => containsNormalizedPhrase(haystack, keyword));
}

function isItSoftwareSummaryOpportunity(item = {}) {
  if (cpvLooksItSoftware(item.cpv_code)) return true;
  const haystack = normalizeTextKey([
    item.notice_no,
    item.title,
    item.buyer_name,
    item.cpv_code,
    item.procedure_type,
    item.notice_type,
    item.status
  ].filter(Boolean).join(" "));
  return IT_SOFTWARE_KEYWORDS.some((keyword) => containsNormalizedPhrase(haystack, keyword));
}

function daysAgo(days = 30) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date;
}

function startOfToday() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateInput(value) {
  const raw = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function toIsoDate(value) {
  if (!value) return "";
  let normalized = value instanceof Date ? value : safeText(value);
  if (typeof normalized === "string" && /^\d{4}-\d{2}-\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    normalized = normalized.replace(/^(\d{4}-\d{2}-\d{2})(.*)$/, "$1T00:00:00$2");
  }
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function hasExplicitTime(value = "") {
  return /\d{1,2}:\d{2}/.test(safeText(value)) || /T\d{2}:\d{2}/.test(safeText(value));
}

function endOfDayIso(iso = "") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}

function toIsoDeadline(value) {
  const iso = toIsoDate(value);
  if (!iso) return "";
  return hasExplicitTime(value) ? iso : endOfDayIso(iso);
}

function parseRomanianDate(value) {
  const raw = decodeHtml(value).replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const iso = toIsoDate(raw);
  if (iso) return iso;

  const months = {
    ianuarie: 0,
    februarie: 1,
    martie: 2,
    aprilie: 3,
    mai: 4,
    iunie: 5,
    iulie: 6,
    august: 7,
    septembrie: 8,
    octombrie: 9,
    noiembrie: 10,
    decembrie: 11
  };
  const roMatch = raw.match(/(\d{1,2})\s+([a-zăâîșşțţ]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (roMatch) {
    const monthKey = stripDiacritics(roMatch[2]).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(months, monthKey)) {
      const date = new Date(Date.UTC(
        Number(roMatch[3]),
        months[monthKey],
        Number(roMatch[1]),
        Number(roMatch[4] || 0),
        Number(roMatch[5] || 0),
        0
      ));
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }

  const numericMatch = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (numericMatch) {
    const date = new Date(Date.UTC(
      Number(numericMatch[3]),
      Number(numericMatch[2]) - 1,
      Number(numericMatch[1]),
      Number(numericMatch[4] || 0),
      Number(numericMatch[5] || 0),
      0
    ));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  return "";
}

function parseRomanianDeadline(value) {
  const iso = parseRomanianDate(value);
  if (!iso) return "";
  return hasExplicitTime(value) ? iso : endOfDayIso(iso);
}

function tedDateToken(date = new Date()) {
  const iso = toIsoDate(date).slice(0, 10);
  return iso.replaceAll("-", "");
}

function firstArrayValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function localizedValue(value, preferred = ["ron", "eng"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return safeText(value[0]);
  if (typeof value === "object") {
    for (const key of preferred) {
      const candidate = value[key] || value[key.toUpperCase()];
      if (Array.isArray(candidate) && candidate.length) return safeText(candidate[0]);
      if (candidate) return safeText(candidate);
    }
    const first = Object.values(value)[0];
    if (Array.isArray(first)) return safeText(first[0]);
    return safeText(first);
  }
  return safeText(value);
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(String(value).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function parseFundingAmount(value) {
  const raw = decodeHtml(value);
  const match = raw.match(/(\d[\d\s.,]*)\s*(?:EUR|EURO|RON|LEI)?/i);
  if (!match) return null;
  let normalized = match[1].replace(/\s+/g, "");
  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");
  if (commaIndex > dotIndex) {
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else if ((normalized.match(/\./g) || []).length > 1) {
    normalized = normalized.replaceAll(".", "");
  } else if ((normalized.match(/,/g) || []).length > 1) {
    normalized = normalized.replaceAll(",", "");
  } else {
    normalized = normalized.replace(",", ".");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function activeStatus(status = "", deadline = "") {
  const normalized = safeText(status) || "Activ";
  const deadlineDate = deadline ? new Date(deadline) : null;
  if (deadlineDate && !Number.isNaN(deadlineDate.getTime()) && deadlineDate < startOfToday()) return "Expirat";
  return normalized;
}

function seapHeaders(referer) {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    origin: SICAP_BASE_URL,
    referer
  };
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Raspuns JSON invalid de la ${url}`);
  }
}

async function getText(url, headers = {}) {
  const response = await fetch(url, {
    headers: { ...OPORTUNITATI_HEADERS, ...headers },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  return text;
}

async function getTextWithTimeout(url, headers = {}, timeoutMs = 30000) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  return text;
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...OPORTUNITATI_HEADERS, ...headers },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Raspuns JSON invalid de la ${url}`);
  }
}

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    hellip: "...",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"'
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}

function stripTags(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|li|div|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function textFromHtml(value = "") {
  return decodeHtml(stripTags(value)).replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values) {
  return values.map((value) => safeText(value)).find(Boolean) || "";
}

function shortHash(value = "") {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, 8).toUpperCase();
}

function absoluteUrl(value = "", baseUrl = "") {
  const raw = decodeHtml(value);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function titleFromUrlSlug(url = "") {
  const pathname = safeText(url).split("?")[0].replace(/\/+$/, "");
  const slug = pathname.split("/").pop() || "";
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceStatusLooksActive(status = "") {
  const normalized = normalizeTextKey(status);
  if (!normalized) return true;
  return ![
    "atribuit",
    "anulat",
    "anulata",
    "expirat",
    "finalizat",
    "finalizata",
    "inchis",
    "inchisa",
    "respins",
    "respinsa",
    "suspendat",
    "suspendata"
  ].some((token) => containsNormalizedPhrase(normalized, token));
}

function isDeadlineActive(deadline = "") {
  const deadlineDate = deadline ? new Date(deadline) : null;
  return deadlineDate && !Number.isNaN(deadlineDate.getTime()) && deadlineDate >= startOfToday();
}

function seapNoticeUrl(row = {}) {
  const id = Number(row.cNoticeId || row.noticeId || 0);
  if (!id) return `${SICAP_BASE_URL}/pub/notices/contract-notices/list/2/1`;
  const version = Number(row.sysNoticeVersionId || 2) === 1 ? "v1" : "v2";
  const type = Number(row.sysNoticeTypeId || 0);
  if (type === 17) return `${SICAP_BASE_URL}/pub/notices/simplified-notice/${version}/view/${id}`;
  if (type === 12) return `${SICAP_BASE_URL}/pub/notices/rfq-invitation/${version}/view/${id}`;
  return `${SICAP_BASE_URL}/pub/notices/c-notice/${version}/view/${id}`;
}

function mapSeapProcedure(row = {}) {
  const deadline = toIsoDate(row.minTenderReceiptDeadline || row.maxTenderReceiptDeadline);
  const publicationDate = toIsoDate(row.noticeStateDate);
  return {
    source: "SICAP_PROCEDURI",
    source_id: safeText(row.noticeNo || row.cNoticeId || row.noticeId),
    notice_no: safeText(row.noticeNo),
    title: safeText(row.contractTitle),
    buyer_name: safeText(row.contractingAuthorityNameAndFN),
    cpv_code: safeText(row.cpvCodeAndName),
    contract_type: safeText(row.sysAcquisitionContractType?.text),
    procedure_type: safeText(row.sysProcedureType?.text),
    notice_type: safeText(row.sysNoticeTypeId === 17 ? "Anunț simplificat" : row.sysNoticeTypeId === 12 ? "Invitație de participare" : "Anunț de participare"),
    status: activeStatus(row.sysProcedureState?.text || row.sysNoticeState?.text, deadline),
    publication_date: publicationDate,
    submission_deadline: deadline,
    estimated_value: parseAmount(row.estimatedValueRon),
    currency: "RON",
    detail_url: seapNoticeUrl(row),
    is_active: deadline ? Number(new Date(deadline) >= startOfToday()) : 1,
    raw_json: JSON.stringify(row)
  };
}

function mapSeapAdvertising(row = {}) {
  const deadline = toIsoDate(row.tenderReceiptDeadline);
  return {
    source: "SICAP_PUBLICITATE",
    source_id: safeText(row.noticeNo || row.advNoticeId),
    notice_no: safeText(row.noticeNo),
    title: safeText(row.contractObject),
    buyer_name: safeText(row.contractingAuthority),
    cpv_code: safeText(row.cpvCode),
    contract_type: safeText(row.sysAcquisitionContractType),
    procedure_type: safeText(row.sysAdvertisingNotice),
    notice_type: "Anunț publicitar / achiziție directă",
    status: activeStatus(row.sysNoticeState?.text || "Publicat", deadline),
    publication_date: toIsoDate(row.publicationDate || row.createDate),
    submission_deadline: deadline,
    estimated_value: parseAmount(row.estimatedValue || row.maxEstimatedValue || row.minEstimatedValue),
    currency: "RON",
    detail_url: row.advNoticeId ? `${SICAP_BASE_URL}/pub/notices/adv-notices/view/${row.advNoticeId}` : `${SICAP_BASE_URL}/pub/adv-notices/list/1`,
    is_active: deadline ? Number(new Date(deadline) >= startOfToday()) : 1,
    raw_json: JSON.stringify(row)
  };
}

function mapTedNotice(row = {}) {
  const publicationNumber = safeText(row["publication-number"]);
  const deadline = toIsoDate(firstArrayValue(row["deadline-receipt-tender-date-lot"]));
  const htmlLinks = row.links?.html || {};
  const detailUrl = htmlLinks.RON || htmlLinks.ENG || Object.values(htmlLinks)[0] || (publicationNumber ? `https://ted.europa.eu/ro/notice/-/detail/${publicationNumber}` : "https://ted.europa.eu");
  const contractTypeMap = {
    supplies: "Furnizare",
    services: "Servicii",
    works: "Lucrări"
  };
  const contractNature = safeText(row["contract-nature-main-proc"]);
  return {
    source: "TED_RO",
    source_id: publicationNumber,
    notice_no: publicationNumber,
    title: localizedValue(row["title-proc"]),
    buyer_name: localizedValue(row["organisation-name-buyer"]),
    cpv_code: safeText(firstArrayValue(row["classification-cpv"])),
    contract_type: contractTypeMap[contractNature] || contractNature,
    procedure_type: safeText(row["procedure-type"] || row["notice-type"]),
    notice_type: safeText(row["notice-type"]),
    status: activeStatus("Activ TED", deadline),
    publication_date: toIsoDate(row["publication-date"]),
    submission_deadline: deadline,
    estimated_value: parseAmount(row["estimated-value-proc"]),
    currency: "EUR",
    detail_url: safeText(detailUrl),
    is_active: deadline ? Number(new Date(deadline) >= startOfToday()) : 1,
    raw_json: JSON.stringify(row)
  };
}

function mapPnrrAnnouncement(row = {}) {
  const id = safeText(row.anuntAchizitieId || row.id || row.proiectId || shortHash(JSON.stringify(row)));
  const deadline = toIsoDeadline(row.dataLimitaDepunereOferta);
  const statusText = safeText(row.stare || "Publicat");
  const active = sourceStatusLooksActive(statusText) && isDeadlineActive(deadline);
  const location = [row.judet, row.localitate].filter(Boolean).join(", ");
  const contact = [row.nume, row.prenume, row.email, row.telefon].filter(Boolean).join(" ");
  const title = firstNonEmpty(row.descriere, row.numeProiect, `Anunț PNRR ${id}`);
  return {
    source: "PNRR_PROCEDURI",
    source_id: id,
    notice_no: `PNRR-${shortHash(id)}`,
    title,
    buyer_name: firstNonEmpty(row.numeProiect, row.cui ? `CUI ${row.cui}` : "", "PNRR"),
    cpv_code: firstNonEmpty(row.cpvCode, row.cpv),
    contract_type: firstNonEmpty(row.tipContract, "PNRR"),
    procedure_type: firstNonEmpty(row.tipProceduraAchizitie, "Anunț procedură PNRR"),
    notice_type: "PNRR anunț procedură",
    status: activeStatus(statusText, deadline),
    publication_date: toIsoDate(row.dataPublicare || row.dataPublicareInitiala),
    submission_deadline: deadline,
    estimated_value: parseAmount(row.valoareBuget),
    currency: "RON",
    detail_url: id ? `${PNRR_ANNOUNCEMENTS_URL}/detalii/${encodeURIComponent(id)}` : PNRR_ANNOUNCEMENTS_URL,
    is_active: active ? 1 : 0,
    raw_json: JSON.stringify({
      ...row,
      contact,
      location,
      detail_url: id ? `${PNRR_ANNOUNCEMENTS_URL}/detalii/${id}` : PNRR_ANNOUNCEMENTS_URL
    })
  };
}

function parseDateNearLabel(text = "", labels = [], options = {}) {
  const compact = decodeHtml(text).replace(/\s+/g, " ").trim();
  for (const label of labels) {
    const escaped = escapeRegExp(label).replace(/\\ /g, "\\s+");
    const regex = new RegExp(`${escaped}[^\\d]{0,80}(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}(?:\\s+\\d{1,2}:\\d{2})?)`, "i");
    const match = compact.match(regex);
    if (match) {
      const parsed = options.deadline ? parseRomanianDeadline(match[1]) : parseRomanianDate(match[1]);
      if (parsed) return parsed;
    }
  }
  return "";
}

function parseBeneficiarList(html = "") {
  const resultsByUrl = new Map();
  const linkRegex = /<a\b[^>]*href=["']([^"']*\/anunturi\/details\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html))) {
    const detailUrl = absoluteUrl(match[1], BENEFICIAR_FONDURI_UE_BASE_URL);
    if (!detailUrl || resultsByUrl.has(detailUrl)) continue;
    const title = firstNonEmpty(textFromHtml(match[2]), titleFromUrlSlug(detailUrl));
    resultsByUrl.set(detailUrl, { title, detail_url: detailUrl });
  }
  return Array.from(resultsByUrl.values());
}

function parseBeneficiarDetail(html = "", candidate = {}) {
  const text = textFromHtml(html);
  const title = firstNonEmpty(
    textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""),
    textFromHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
    candidate.title,
    titleFromUrlSlug(candidate.detail_url)
  );
  const publicationDate = parseDateNearLabel(text, [
    "Data publicării",
    "Data publicare",
    "Publicare anunț",
    "Publicare anunt",
    "Data anunțului",
    "Data anuntului"
  ]);
  const deadline = parseDateNearLabel(text, [
    "Termen limită de depunere a ofertelor",
    "Termen limita de depunere a ofertelor",
    "Data limită depunere ofertă",
    "Data limita depunere oferta",
    "Termen limită de depunere",
    "Termen limita de depunere",
    "Depunere oferte"
  ], { deadline: true });
  const sourceId = safeText(candidate.detail_url).match(/\/details\/\d+\/(\d+)\//)?.[1]
    || safeText(candidate.detail_url).match(/\/details\/\d+\/(\d+)$/)?.[1]
    || shortHash(candidate.detail_url || title);
  const active = isDeadlineActive(deadline);
  return {
    source: "BENEFICIAR_FONDURI_UE",
    source_id: sourceId,
    notice_no: `BFUE-${sourceId}`,
    title,
    buyer_name: "Achiziții beneficiari privați",
    cpv_code: "",
    contract_type: "Fonduri europene",
    procedure_type: "Procedură achiziție beneficiar privat",
    notice_type: "Anunț procedură beneficiar privat",
    status: active ? "Publicat" : activeStatus("Expirat", deadline),
    publication_date: publicationDate,
    submission_deadline: deadline,
    estimated_value: null,
    currency: "RON",
    detail_url: candidate.detail_url || BENEFICIAR_FONDURI_UE_ANNOUNCEMENTS_URL,
    is_active: active ? 1 : 0,
    raw_json: JSON.stringify({
      source_context: "beneficiar.fonduri-ue.ro anunturi",
      text_excerpt: text.slice(0, 4000)
    })
  };
}

function extractMetaFields(html = "") {
  const fields = {};
  const blockRegex = /<div[^>]*class=["'][^"']*col-[^"']*["'][^>]*>\s*<p[^>]*class=["']label["'][^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = blockRegex.exec(html))) {
    const key = normalizeTextKey(match[1]).replace(/\s+$/, "");
    const value = textFromHtml(match[2]);
    if (key && value) fields[key] = fields[key] ? `${fields[key]} | ${value}` : value;
  }
  return fields;
}

function getMeta(fields = {}, keys = []) {
  for (const key of keys) {
    const normalized = normalizeTextKey(key);
    if (fields[normalized]) return fields[normalized];
  }
  return "";
}

function buildOportunitatiListUrl(params = {}, page = 1) {
  const url = new URL(`${OPORTUNITATI_BASE_URL}/apeluri/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  if (page > 1) url.searchParams.set("sf_paged", String(page));
  return url.toString();
}

function parseOportunitatiList(html = "") {
  const results = [];
  const chunks = html.split(/<div\s+class=["']item["']>/i).slice(1);
  for (const chunk of chunks) {
    const titleMatch = chunk.match(/<h4>\s*<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h4>/i);
    if (!titleMatch) continue;
    const fields = extractMetaFields(chunk);
    results.push({
      title: textFromHtml(titleMatch[2]),
      detail_url: decodeHtml(titleMatch[1]),
      fields,
      status_hint: getMeta(fields, ["Status"]),
      publication_date_hint: parseRomanianDate(getMeta(fields, ["Data deschiderii"])),
      submission_deadline_hint: parseRomanianDeadline(firstNonEmpty(
        getMeta(fields, ["Data închiderii"]),
        getMeta(fields, ["Data limită"])
      )),
      source_context: "lista apeluri active"
    });
  }
  return results;
}

function parseOportunitatiDetail(html = "") {
  const fields = extractMetaFields(html);
  const postId = firstNonEmpty(
    html.match(/postid-(\d+)/)?.[1],
    html.match(/pvc_stats_(\d+)/)?.[1],
    html.match(/wp-json\/wp\/v2\/apel\/(\d+)/)?.[1]
  );
  const title = textFromHtml(html.match(/<h1[^>]*class=["'][^"']*\bh2\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const datePublished = firstNonEmpty(
    html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1],
    html.match(/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i)?.[1]
  );
  return {
    post_id: postId,
    title: title || "",
    fields,
    publication_date_hint: toIsoDate(datePublished),
    submission_deadline_hint: parseRomanianDeadline(firstNonEmpty(
      getMeta(fields, ["Data închiderii"]),
      getMeta(fields, ["Data limită"])
    )),
    opening_date_hint: parseRomanianDate(getMeta(fields, ["Data deschiderii"]))
  };
}

function isOportunitatiApelUrl(url = "") {
  return safeText(url).startsWith(`${OPORTUNITATI_BASE_URL}/apel/`);
}

function mergeFundingCandidate(candidate = {}, detail = {}) {
  const fields = { ...(candidate.fields || {}), ...(detail.fields || {}) };
  const budgetEu = parseFundingAmount(getMeta(fields, ["Buget UE", "Bugetul UE"]));
  const budgetNational = parseFundingAmount(getMeta(fields, ["Buget național", "Buget national"]));
  const budgetTotal = parseFundingAmount(getMeta(fields, ["Buget total", "Buget"]));
  const estimatedValue = [budgetEu, budgetNational].filter((value) => value !== null).reduce((sum, value) => sum + value, 0) || budgetTotal;
  const program = firstNonEmpty(
    getMeta(fields, ["Program de finanțare", "Program de finantare"]),
    getMeta(fields, ["Programe pentru care se aplică apelul", "Programe pentru care se aplica apelul"])
  );
  const beneficiaries = getMeta(fields, ["Beneficiari eligibili"]);
  const domains = getMeta(fields, ["Domenii"]);
  const zones = getMeta(fields, ["Zone"]);
  const type = firstNonEmpty(
    getMeta(fields, ["Tip Apel", "Tip apel"]),
    getMeta(fields, ["Tipul de acțiune", "Tipul de actiune"]),
    getMeta(fields, ["Model de termen limită", "Model de termen limita"])
  );
  const title = firstNonEmpty(detail.title, candidate.title);
  const normalizedCombined = normalizeTextKey(`${title} ${program} ${beneficiaries} ${domains} ${zones} ${type}`);
  const isPnrr = normalizedCombined.includes("pnrr") || normalizedCombined.includes("redresare si rezilienta");
  const isDigitalFunding = IT_SOFTWARE_KEYWORDS.some((keyword) => containsNormalizedPhrase(normalizedCombined, keyword));
  const contractType = isPnrr ? "PNRR" : isDigitalFunding ? "Digitalizare" : "Fonduri europene";
  const deadline = firstNonEmpty(detail.submission_deadline_hint, candidate.submission_deadline_hint);
  const openingDate = firstNonEmpty(detail.opening_date_hint, candidate.publication_date_hint);
  const publicationDate = firstNonEmpty(detail.publication_date_hint, openingDate);
  const statusHint = firstNonEmpty(candidate.status_hint, getMeta(fields, ["Status"]), "Activ");
  const normalizedStatus = stripDiacritics(statusHint).toLowerCase();
  const deadlineDate = deadline ? new Date(deadline) : null;
  const active = normalizedStatus.includes("inactiv")
    ? 0
    : deadlineDate && !Number.isNaN(deadlineDate.getTime())
      ? Number(deadlineDate >= startOfToday())
      : 1;
  const status = active ? (normalizedStatus.includes("urmeaza") ? "Urmează" : "Activ") : "Expirat";
  const detailUrl = candidate.detail_url || "";
  const sourceId = detail.post_id || candidate.source_id_hint || detailUrl || shortHash(title);

  return {
    source: "OPORTUNITATI_UE",
    source_id: String(sourceId),
    notice_no: detail.post_id ? `OPUE-${detail.post_id}` : `OPUE-${shortHash(detailUrl || title)}`,
    title,
    buyer_name: program || "Oportunități de finanțare UE",
    cpv_code: [
      beneficiaries ? `Beneficiari: ${beneficiaries}` : "",
      domains ? `Domenii: ${domains}` : "",
      zones ? `Zone: ${zones}` : ""
    ].filter(Boolean).join(" | "),
    contract_type: contractType,
    procedure_type: type || "Apel de finanțare",
    notice_type: "Apel finanțare",
    status,
    publication_date: publicationDate,
    submission_deadline: deadline,
    estimated_value: estimatedValue,
    currency: estimatedValue ? "EUR" : "EUR",
    detail_url: detailUrl || `${OPORTUNITATI_BASE_URL}/apeluri/?_sfm_status=activ`,
    is_active: active,
    raw_json: JSON.stringify({
      source_context: candidate.source_context,
      fields,
      detail_error: detail.detail_error || ""
    })
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function fetchOportunitatiWpApels(search, limit = 40) {
  const url = new URL(`${OPORTUNITATI_BASE_URL}/wp-json/wp/v2/apel`);
  url.searchParams.set("search", search);
  url.searchParams.set("per_page", String(Math.min(100, Math.max(1, Number(limit || 40)))));
  url.searchParams.set("_fields", "id,date,modified,link,title");
  const rows = await getJson(url.toString());
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    title: textFromHtml(row.title?.rendered || ""),
    detail_url: row.link,
    source_id_hint: row.id,
    publication_date_hint: toIsoDate(row.date),
    source_context: `wp search: ${search}`,
    fields: {}
  })).filter((row) => row.title && row.detail_url);
}

async function fetchOportunitatiFunding({ limit = 80 } = {}) {
  const candidatesByUrl = new Map();
  const addCandidates = (items = []) => {
    for (const item of items) {
      if (!item.detail_url || candidatesByUrl.has(item.detail_url)) continue;
      candidatesByUrl.set(item.detail_url, item);
    }
  };

  const listTargets = [
    { params: { _sfm_status: "activ" }, pages: Math.max(1, Math.ceil(Number(limit || 80) / OPORTUNITATI_PAGE_SIZE)) },
    { params: { _sfm_status: "activ", _sft_domeniu: "digitalizare" }, pages: 3 }
  ];
  for (const target of listTargets) {
    for (let page = 1; page <= target.pages; page += 1) {
      const html = await getText(buildOportunitatiListUrl(target.params, page));
      const parsed = parseOportunitatiList(html);
      if (!parsed.length) break;
      addCandidates(parsed);
    }
  }

  const supplementalSearches = ["PNRR digitalizare", "software", "CRM", "ERP", "website", "platforma turism", "platformă turism"];
  for (const search of supplementalSearches) {
    try {
      addCandidates(await fetchOportunitatiWpApels(search, 30));
    } catch {
      // Lista activa ramane sursa principala; cautarile sunt suplimentare.
    }
  }

  const maxCandidates = Math.max(Number(limit || 80) + 60, 120);
  const candidates = Array.from(candidatesByUrl.values()).slice(0, maxCandidates);
  const enriched = await mapWithConcurrency(candidates, 5, async (candidate) => {
    if (!isOportunitatiApelUrl(candidate.detail_url)) return mergeFundingCandidate(candidate, {});
    try {
      const html = await getText(candidate.detail_url);
      return mergeFundingCandidate(candidate, parseOportunitatiDetail(html));
    } catch (error) {
      return mergeFundingCandidate(candidate, { detail_error: error?.message || String(error) });
    }
  });

  return enriched
    .filter((item) => item.title && item.detail_url)
    .filter((item) => {
      let sourceContext = "";
      try {
        sourceContext = JSON.parse(item.raw_json || "{}").source_context || "";
      } catch {
        sourceContext = "";
      }
      if (sourceContext.startsWith("wp search")) {
        return Boolean(item.submission_deadline) && item.is_active && isItSoftwareSummaryOpportunity(item);
      }
      return item.is_active && isItSoftwareOpportunity(item);
    });
}

async function fetchPnrrAnnouncements({ limit = 100 } = {}) {
  const pageSize = Math.min(DEFAULT_PAGE_SIZE, Math.max(5, Number(limit || DEFAULT_PAGE_SIZE)));
  const maxPages = Math.max(1, Math.ceil(Number(limit || pageSize) / pageSize));
  const today = toIsoDate(startOfToday()).slice(0, 10);
  const rows = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const url = new URL(PNRR_ANNOUNCEMENTS_API);
    url.searchParams.set("page", String(pageIndex));
    url.searchParams.set("size", String(pageSize));
    const data = await postJson(url.toString(), {
      dataLimitaDepunereOfertaBegin: today,
      orderBy: "dataLimitaDepunereOferta",
      orderDir: "ASC"
    }, PNRR_HEADERS);
    const content = Array.isArray(data.content) ? data.content : [];
    rows.push(...content);
    if (!content.length || rows.length >= Number(data.totalElements || 0)) break;
  }
  return rows
    .slice(0, limit)
    .map(mapPnrrAnnouncement)
    .filter((item) => item.is_active && isItSoftwareOpportunity(item));
}

async function fetchBeneficiarFonduriUeAnnouncements({ limit = 60 } = {}) {
  const html = await getTextWithTimeout(
    BENEFICIAR_FONDURI_UE_ANNOUNCEMENTS_URL,
    BENEFICIAR_FONDURI_UE_HEADERS,
    15000
  );
  const candidates = parseBeneficiarList(html).slice(0, Math.max(1, Number(limit || 60)));
  if (!candidates.length) {
    throw new Error("Lista beneficiar.fonduri-ue.ro nu a returnat linkuri de detaliu pentru anunturi.");
  }
  const enriched = await mapWithConcurrency(candidates, 3, async (candidate) => {
    try {
      const detailHtml = await getTextWithTimeout(candidate.detail_url, BENEFICIAR_FONDURI_UE_HEADERS, 15000);
      return parseBeneficiarDetail(detailHtml, candidate);
    } catch (error) {
      return {
        ...parseBeneficiarDetail("", candidate),
        raw_json: JSON.stringify({
          source_context: "beneficiar.fonduri-ue.ro anunturi",
          detail_error: error?.message || String(error)
        })
      };
    }
  });
  return enriched
    .filter((item) => item.title && item.detail_url && item.submission_deadline)
    .filter((item) => item.is_active && isItSoftwareOpportunity(item));
}

function pruneNonItSoftwareOpportunities(db, companyId) {
  const normalizedCompanyId = Number(companyId || 0);
  const rows = db.prepare(`
    SELECT id, source, notice_no, title, buyer_name, cpv_code, contract_type, procedure_type, notice_type, status, submission_deadline, raw_json
    FROM procurement_opportunities
    WHERE company_id=?
      AND source IN ('SICAP_PROCEDURI','SICAP_PUBLICITATE','TED_RO','OPORTUNITATI_UE','PNRR_PROCEDURI','BENEFICIAR_FONDURI_UE')
  `).all(normalizedCompanyId);
  const ids = rows.filter((row) => {
    const raw = safeText(row.raw_json);
    const supplementalFunding = row.source === "OPORTUNITATI_UE" && raw.includes("wp search");
    if (supplementalFunding) {
      return !safeText(row.submission_deadline) || !isItSoftwareSummaryOpportunity(row);
    }
    return !isItSoftwareOpportunity(row);
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const removeChunk = db.transaction((chunk) => {
    const placeholders = chunk.map(() => "?").join(",");
    db.prepare(`DELETE FROM procurement_opportunities WHERE company_id=? AND id IN (${placeholders})`).run(normalizedCompanyId, ...chunk);
  });
  for (let index = 0; index < ids.length; index += 200) {
    removeChunk(ids.slice(index, index + 200));
  }
  return ids.length;
}

function tableColumns(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  } catch {
    return [];
  }
}

function ensureTableColumn(db, tableName, columnName, definition) {
  const columns = tableColumns(db, tableName);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureProcurementOpportunitiesSchema(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS procurement_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      notice_no TEXT,
      title TEXT NOT NULL DEFAULT '',
      buyer_name TEXT,
      cpv_code TEXT,
      contract_type TEXT,
      procedure_type TEXT,
      notice_type TEXT,
      status TEXT,
      publication_date TEXT,
      submission_deadline TEXT,
      estimated_value REAL,
      currency TEXT NOT NULL DEFAULT 'RON',
      detail_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      raw_json TEXT NOT NULL DEFAULT '{}',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, source, source_id)
    )
  `).run();

  ensureTableColumn(db, "procurement_opportunities", "source_config_id", "INTEGER");
  ensureTableColumn(db, "procurement_opportunities", "source_type", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "country", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "funding_program", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "description", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "detected_keywords", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "documents_json", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "relevance_score", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(db, "procurement_opportunities", "review_status", "TEXT NOT NULL DEFAULT 'nou'");
  ensureTableColumn(db, "procurement_opportunities", "content_hash", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "document_hash", "TEXT");
  ensureTableColumn(db, "procurement_opportunities", "crm_lead_id", "INTEGER");

  db.prepare(`
    CREATE TABLE IF NOT EXISTS procurement_opportunity_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      imported_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    )
  `).run();

  ensureTableColumn(db, "procurement_opportunity_sync_runs", "source_id", "INTEGER");
  ensureTableColumn(db, "procurement_opportunity_sync_runs", "pages_scanned", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(db, "procurement_opportunity_sync_runs", "opportunities_found", "INTEGER NOT NULL DEFAULT 0");
  ensureTableColumn(db, "procurement_opportunity_sync_runs", "new_count", "INTEGER NOT NULL DEFAULT 0");

  db.prepare(`
    CREATE TABLE IF NOT EXISTS procurement_opportunity_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      source_type TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'RO',
      check_frequency_minutes INTEGER NOT NULL DEFAULT 1440,
      status TEXT NOT NULL DEFAULT 'activ',
      last_checked_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, name, url)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS procurement_opportunity_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      opportunity_id INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      mime_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      extracted_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, opportunity_id, source_url)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS procurement_opportunity_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      opportunity_id INTEGER NOT NULL,
      notification_type TEXT NOT NULL DEFAULT 'high_score',
      status TEXT NOT NULL DEFAULT 'new',
      message TEXT,
      email_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, opportunity_id, notification_type)
    )
  `).run();

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_procurement_opportunities_company_active_deadline
    ON procurement_opportunities(company_id, is_active, submission_deadline)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_procurement_opportunities_eu_filters
    ON procurement_opportunities(company_id, source_type, country, review_status, relevance_score)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_procurement_sources_due
    ON procurement_opportunity_sources(company_id, status, last_checked_at)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_procurement_documents_hash
    ON procurement_opportunity_documents(company_id, content_hash)
  `).run();
}

function jsonField(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function fullHash(value = "") {
  return createHash("sha1").update(Buffer.isBuffer(value) ? value : String(value || "")).digest("hex");
}

function upsertOpportunity(db, companyId, item) {
  if (!item.source || !item.source_id || !safeText(item.title)) return "skipped";
  const existing = db.prepare(`
    SELECT id
    FROM procurement_opportunities
    WHERE company_id=?
      AND (
        (source=? AND source_id=?)
        OR (COALESCE(detail_url,'')<>'' AND COALESCE(detail_url,'')=?)
        OR (
          LOWER(TRIM(COALESCE(title,'')))=LOWER(TRIM(?))
          AND LOWER(TRIM(COALESCE(buyer_name,'')))=LOWER(TRIM(?))
        )
      )
    ORDER BY CASE WHEN source=? AND source_id=? THEN 1 WHEN COALESCE(detail_url,'')=? THEN 2 ELSE 3 END
    LIMIT 1
  `).get(
    companyId,
    item.source,
    item.source_id,
    safeText(item.detail_url),
    safeText(item.title),
    safeText(item.buyer_name),
    item.source,
    item.source_id,
    safeText(item.detail_url)
  );

  if (existing) {
    db.prepare(`
      UPDATE procurement_opportunities
      SET notice_no=?, title=?, buyer_name=?, cpv_code=?, contract_type=?, procedure_type=?,
          notice_type=?, status=?, publication_date=?, submission_deadline=?, estimated_value=?,
          currency=?, detail_url=?, is_active=?, raw_json=?,
          source_config_id=COALESCE(?, source_config_id),
          source_type=COALESCE(NULLIF(?, ''), source_type),
          country=COALESCE(NULLIF(?, ''), country),
          funding_program=COALESCE(NULLIF(?, ''), funding_program),
          description=COALESCE(NULLIF(?, ''), description),
          detected_keywords=COALESCE(NULLIF(?, ''), detected_keywords),
          documents_json=COALESCE(NULLIF(?, ''), documents_json),
          relevance_score=MAX(COALESCE(relevance_score,0), ?),
          review_status=COALESCE(NULLIF(review_status, ''), 'nou'),
          content_hash=COALESCE(NULLIF(?, ''), content_hash),
          document_hash=COALESCE(NULLIF(?, ''), document_hash),
          last_seen_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      item.notice_no,
      item.title,
      item.buyer_name,
      item.cpv_code,
      item.contract_type,
      item.procedure_type,
      item.notice_type,
      item.status,
      item.publication_date,
      item.submission_deadline,
      item.estimated_value,
      item.currency || "RON",
      item.detail_url,
      Number(item.is_active ? 1 : 0),
      item.raw_json || "{}",
      Number(item.source_config_id || 0) || null,
      safeText(item.source_type),
      safeText(item.country),
      safeText(item.funding_program),
      safeText(item.description),
      jsonField(item.detected_keywords),
      jsonField(item.documents_json),
      Math.max(0, Math.min(100, Number(item.relevance_score || 0))),
      safeText(item.content_hash),
      safeText(item.document_hash),
      existing.id,
      companyId
    );
    return "updated";
  }

  db.prepare(`
    INSERT INTO procurement_opportunities (
      company_id, source, source_id, notice_no, title, buyer_name, cpv_code, contract_type,
      procedure_type, notice_type, status, publication_date, submission_deadline,
      estimated_value, currency, detail_url, is_active, raw_json, source_config_id,
      source_type, country, funding_program, description, detected_keywords, documents_json,
      relevance_score, review_status, content_hash, document_hash
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    companyId,
    item.source,
    item.source_id,
    item.notice_no,
    item.title,
    item.buyer_name,
    item.cpv_code,
    item.contract_type,
    item.procedure_type,
    item.notice_type,
    item.status,
    item.publication_date,
    item.submission_deadline,
    item.estimated_value,
    item.currency || "RON",
    item.detail_url,
    Number(item.is_active ? 1 : 0),
    item.raw_json || "{}",
    Number(item.source_config_id || 0) || null,
    safeText(item.source_type),
    safeText(item.country),
    safeText(item.funding_program),
    safeText(item.description),
    jsonField(item.detected_keywords),
    jsonField(item.documents_json),
    Math.max(0, Math.min(100, Number(item.relevance_score || 0))),
    safeText(item.review_status || "nou") || "nou",
    safeText(item.content_hash),
    safeText(item.document_hash)
  );
  return "inserted";
}

function writeSyncRun(db, companyId, source, status, importedCount, updatedCount, errorMessage = "") {
  db.prepare(`
    INSERT INTO procurement_opportunity_sync_runs (
      company_id, source, status, finished_at, imported_count, updated_count, error_message
    ) VALUES (?,?,?,datetime('now'),?,?,?)
  `).run(companyId, source, status, importedCount, updatedCount, safeText(errorMessage).slice(0, 1000));
}

function writeEuSyncRun(db, companyId, sourceRow, status, metrics = {}, errorMessage = "") {
  db.prepare(`
    INSERT INTO procurement_opportunity_sync_runs (
      company_id, source, source_id, status, finished_at, imported_count, updated_count,
      pages_scanned, opportunities_found, new_count, error_message
    ) VALUES (?,?,?,?,datetime('now'),?,?,?,?,?,?)
  `).run(
    companyId,
    sourceRow?.name || sourceRow?.source || "EU Opportunity Finder",
    Number(sourceRow?.id || 0) || null,
    status,
    Number(metrics.imported || 0),
    Number(metrics.updated || 0),
    Number(metrics.pagesScanned || 0),
    Number(metrics.found || 0),
    Number(metrics.imported || 0),
    safeText(errorMessage).slice(0, 1000)
  );
}

function readEuOpportunitySourceConfig() {
  if (!fs.existsSync(EU_OPPORTUNITY_SOURCES_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(EU_OPPORTUNITY_SOURCES_FILE, "utf8"));
    return Array.isArray(parsed?.sources) ? parsed.sources : [];
  } catch {
    return [];
  }
}

function seedEuOpportunitySources(db, companyId) {
  ensureProcurementOpportunitiesSchema(db);
  const sources = readEuOpportunitySourceConfig();
  if (!sources.length) return 0;
  const insert = db.prepare(`
    INSERT INTO procurement_opportunity_sources (
      company_id, name, url, source_type, country, check_frequency_minutes, status, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'eu-opportunity-config')
    ON CONFLICT(company_id, name, url) DO UPDATE SET
      source_type=excluded.source_type,
      country=excluded.country,
      check_frequency_minutes=excluded.check_frequency_minutes,
      status=CASE
        WHEN procurement_opportunity_sources.status IN ('inactiv','inactive') THEN procurement_opportunity_sources.status
        ELSE excluded.status
      END,
      updated_at=datetime('now')
  `);
  let count = 0;
  for (const source of sources) {
    const name = safeText(source.name);
    const url = safeText(source.url || source.main_url);
    if (!name || !url) continue;
    insert.run(
      companyId,
      name,
      url,
      safeText(source.source_type || source.type || "Beneficiar privat"),
      safeText(source.country || "RO"),
      Math.max(60, Number(source.check_frequency_minutes || source.frequency_minutes || 1440)),
      safeText(source.status || "activ")
    );
    count += 1;
  }
  return count;
}

function loadEuOpportunitySources(db, companyId, options = {}) {
  ensureProcurementOpportunitiesSchema(db);
  if (options.seed !== false) seedEuOpportunitySources(db, companyId);
  const where = ["company_id=?"];
  const params = [Number(companyId || 0)];
  if (options.activeOnly !== false) {
    where.push("LOWER(COALESCE(status,'')) IN ('activ','active')");
  }
  if (options.dueOnly) {
    where.push(`(
      last_checked_at IS NULL
      OR datetime(last_checked_at, '+' || check_frequency_minutes || ' minutes') <= datetime('now')
    )`);
  }
  if (safeText(options.type)) {
    where.push("UPPER(source_type)=UPPER(?)");
    params.push(safeText(options.type));
  }
  return db.prepare(`
    SELECT *
    FROM procurement_opportunity_sources
    WHERE ${where.join(" AND ")}
    ORDER BY source_type COLLATE NOCASE ASC, name COLLATE NOCASE ASC
  `).all(...params);
}

function sourceCodeFromRow(sourceRow = {}) {
  const type = safeText(sourceRow.source_type || "EU").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `EU_${type || "SOURCE"}`;
}

function sourceProgramFromRow(sourceRow = {}) {
  const text = normalizeTextKey(`${sourceRow.name || ""} ${sourceRow.url || ""} ${sourceRow.source_type || ""}`);
  if (text.includes("pnrr")) return "PNRR";
  if (text.includes("interreg")) return "Interreg";
  if (text.includes("cordis")) return "CORDIS";
  if (text.includes("horizon")) return "Horizon Europe";
  if (text.includes("eit")) return "EIT";
  if (text.includes("adr")) return "Program regional / ADR";
  if (text.includes("fonduri ue")) return "Fonduri europene";
  return safeText(sourceRow.source_type || "Fonduri europene");
}

function extractLinksFromHtml(html = "", baseUrl = "") {
  const links = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = absoluteUrl(match[1], baseUrl);
    const label = textFromHtml(match[2]);
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    links.push({ url: href, label });
  }
  return links;
}

function extractDocumentLinks(html = "", baseUrl = "") {
  const seen = new Set();
  const docs = [];
  for (const link of extractLinksFromHtml(html, baseUrl)) {
    const clean = link.url.split("#")[0];
    if (!/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    docs.push({
      url: clean,
      title: link.label || path.basename(clean.split("?")[0]) || "document"
    });
  }
  return docs.slice(0, 12);
}

function looksLikeOpportunityLink(link = {}, sourceRow = {}) {
  const normalized = normalizeTextKey(`${link.url || ""} ${link.label || ""} ${sourceRow.name || ""}`);
  if (!normalized) return false;
  const positiveTokens = [
    "achizitii",
    "achizitie",
    "licitatii",
    "licitatie",
    "anunturi",
    "anunt",
    "proceduri",
    "procedura",
    "fonduri europene",
    "proiecte europene",
    "proiecte",
    "pnrr",
    "contractare",
    "procurement",
    "tenders",
    "calls",
    "news"
  ];
  const negativeTokens = [
    "facebook",
    "linkedin",
    "instagram",
    "youtube",
    "cookie",
    "privacy",
    "gdpr",
    "contact",
    "login",
    "wp admin"
  ];
  if (negativeTokens.some((token) => containsNormalizedPhrase(normalized, token))) return false;
  if (/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(link.url || "")) return true;
  return positiveTokens.some((token) => containsNormalizedPhrase(normalized, normalizeTextKey(token)));
}

function titleFromHtml(html = "", fallbackUrl = "") {
  return firstNonEmpty(
    textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""),
    textFromHtml(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || ""),
    textFromHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
    titleFromUrlSlug(fallbackUrl)
  );
}

function detectOpportunityKeywords(text = "") {
  const normalized = normalizeTextKey(text);
  const found = [];
  for (const keyword of IT_SOFTWARE_KEYWORDS) {
    if (containsNormalizedPhrase(normalized, keyword)) found.push(keyword);
  }
  return Array.from(new Set(found)).slice(0, 30);
}

function relevanceScore(text = "", docsCount = 0) {
  const normalized = normalizeTextKey(text);
  const weights = new Map([
    ["software", 20],
    ["aplicatie web", 18],
    ["platforma digitala", 18],
    ["platforma", 14],
    ["crm", 20],
    ["erp", 20],
    ["saas", 16],
    ["ai", 18],
    ["inteligenta artificiala", 22],
    ["machine learning", 20],
    ["website", 15],
    ["site web", 15],
    ["automatizare", 18],
    ["digitalizare", 18],
    ["cloud", 14],
    ["api", 14],
    ["cybersecurity", 14],
    ["securitate cibernetica", 16],
    ["servicii it", 12],
    ["mentenanta it", 12],
    ["echipamente it", 8],
    ["server", 8],
    ["hosting", 8]
  ]);
  let score = 0;
  for (const [phrase, weight] of weights) {
    if (containsNormalizedPhrase(normalized, normalizeTextKey(phrase))) score += weight;
  }
  const keywordHits = detectOpportunityKeywords(text).length;
  score += Math.min(20, keywordHits * 3);
  if (docsCount) score += Math.min(10, docsCount * 2);
  if (containsNormalizedPhrase(normalized, "achizitie") || containsNormalizedPhrase(normalized, "procedura")) score += 8;
  return Math.max(0, Math.min(100, score));
}

function inferBeneficiaryFromText(text = "", sourceRow = {}) {
  const labels = [
    "Beneficiar",
    "Autoritate contractantă",
    "Autoritate contractanta",
    "Achizitor",
    "Contracting authority",
    "Buyer"
  ];
  for (const label of labels) {
    const regex = new RegExp(`${escapeRegExp(label)}\\s*[:\\-]\\s*([^\\n\\|]{3,140})`, "i");
    const match = text.match(regex);
    if (match) return safeText(match[1]).replace(/\s+/g, " ");
  }
  return safeText(sourceRow.name || "");
}

function buildGenericEuOpportunity(sourceRow = {}, detailUrl = "", html = "", listLabel = "") {
  const text = textFromHtml(html);
  const docs = extractDocumentLinks(html, detailUrl);
  const title = titleFromHtml(html, detailUrl) || listLabel || sourceRow.name;
  const combinedText = `${title}\n${listLabel}\n${text}`;
  const deadline = parseDateNearLabel(combinedText, [
    "Termen limită",
    "Termen limita",
    "Data limită",
    "Data limita",
    "Depunere oferte",
    "Deadline"
  ], { deadline: true });
  const publicationDate = parseDateNearLabel(combinedText, [
    "Data publicării",
    "Data publicare",
    "Publicat",
    "Published"
  ]);
  const score = relevanceScore(combinedText, docs.length);
  const keywords = detectOpportunityKeywords(combinedText);
  const sourceCode = sourceCodeFromRow(sourceRow);
  const sourceId = shortHash(`${sourceRow.id || sourceRow.name}|${detailUrl || title}`);
  return {
    source: sourceCode,
    source_id: sourceId,
    notice_no: `${sourceCode.replace(/^EU_/, "EU-")}-${sourceId}`,
    title,
    buyer_name: inferBeneficiaryFromText(combinedText, sourceRow),
    cpv_code: "",
    contract_type: sourceProgramFromRow(sourceRow),
    procedure_type: safeText(sourceRow.source_type || "Sursă publică"),
    notice_type: "Anunț public EU Opportunity Finder",
    status: deadline ? activeStatus("Publicat", deadline) : "Publicat",
    publication_date: publicationDate,
    submission_deadline: deadline,
    estimated_value: parseFundingAmount(combinedText),
    currency: combinedText.match(/\b(EUR|EURO)\b/i) ? "EUR" : "RON",
    detail_url: detailUrl || sourceRow.url,
    is_active: deadline ? Number(isDeadlineActive(deadline)) : 1,
    raw_json: JSON.stringify({
      source_config_id: sourceRow.id,
      source_name: sourceRow.name,
      text_excerpt: combinedText.slice(0, 5000),
      documents: docs
    }),
    source_config_id: Number(sourceRow.id || 0) || null,
    source_type: safeText(sourceRow.source_type),
    country: safeText(sourceRow.country || "RO"),
    funding_program: sourceProgramFromRow(sourceRow),
    description: combinedText.slice(0, 700),
    detected_keywords: keywords,
    documents_json: docs,
    relevance_score: score,
    review_status: "nou",
    content_hash: fullHash(`${title}|${inferBeneficiaryFromText(combinedText, sourceRow)}|${combinedText.slice(0, 3000)}`)
  };
}

async function fetchGenericEuSource(sourceRow = {}, options = {}) {
  const limit = Math.max(1, Number(options.limit || 30));
  const rootHtml = await getTextWithTimeout(sourceRow.url, OPORTUNITATI_HEADERS, 20000);
  const rootLinks = extractLinksFromHtml(rootHtml, sourceRow.url)
    .filter((link) => looksLikeOpportunityLink(link, sourceRow));
  const candidates = [{ url: sourceRow.url, label: sourceRow.name }, ...rootLinks]
    .filter((link, index, array) => array.findIndex((item) => item.url === link.url) === index)
    .slice(0, limit);
  const items = [];
  let pagesScanned = 0;
  for (const candidate of candidates) {
    try {
      if (/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(candidate.url)) {
        const title = candidate.label || titleFromUrlSlug(candidate.url) || path.basename(candidate.url);
        const text = `${title} ${sourceRow.name} ${sourceRow.source_type}`;
        const keywords = detectOpportunityKeywords(text);
        const score = relevanceScore(text, 1);
        if (!keywords.length && score < 20) continue;
        const sourceCode = sourceCodeFromRow(sourceRow);
        const sourceId = shortHash(`${sourceRow.id}|${candidate.url}`);
        items.push({
          source: sourceCode,
          source_id: sourceId,
          notice_no: `${sourceCode.replace(/^EU_/, "EU-")}-${sourceId}`,
          title,
          buyer_name: safeText(sourceRow.name),
          cpv_code: "",
          contract_type: sourceProgramFromRow(sourceRow),
          procedure_type: safeText(sourceRow.source_type || "Document public"),
          notice_type: "Document procedură",
          status: "Publicat",
          publication_date: "",
          submission_deadline: "",
          estimated_value: null,
          currency: "RON",
          detail_url: candidate.url,
          is_active: 1,
          raw_json: JSON.stringify({ source_config_id: sourceRow.id, source_name: sourceRow.name, documents: [{ url: candidate.url, title }] }),
          source_config_id: Number(sourceRow.id || 0) || null,
          source_type: safeText(sourceRow.source_type),
          country: safeText(sourceRow.country || "RO"),
          funding_program: sourceProgramFromRow(sourceRow),
          description: text,
          detected_keywords: keywords,
          documents_json: [{ url: candidate.url, title }],
          relevance_score: score,
          review_status: "nou",
          content_hash: fullHash(`${title}|${candidate.url}`)
        });
        continue;
      }
      const html = candidate.url === sourceRow.url ? rootHtml : await getTextWithTimeout(candidate.url, OPORTUNITATI_HEADERS, 20000);
      pagesScanned += 1;
      const item = buildGenericEuOpportunity(sourceRow, candidate.url, html, candidate.label);
      if (item.relevance_score >= 20 || item.detected_keywords?.length) items.push(item);
    } catch {
      // Un link problematic nu trebuie sa opreasca intreaga sursa.
    }
  }
  return { items: items.slice(0, limit), pagesScanned: Math.max(1, pagesScanned) };
}

function extractXmlText(xml = "") {
  return decodeHtml(String(xml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractDocumentText(buffer, fileName = "") {
  const lowerName = safeText(fileName).toLowerCase();
  try {
    if (lowerName.endsWith(".docx")) {
      const zip = new PizZip(buffer);
      return extractXmlText(zip.file("word/document.xml")?.asText() || "");
    }
    if (lowerName.endsWith(".xlsx")) {
      const zip = new PizZip(buffer);
      const shared = zip.file("xl/sharedStrings.xml")?.asText() || "";
      return extractXmlText(shared);
    }
    if (lowerName.endsWith(".pdf")) {
      return buffer.toString("latin1").replace(/[^\x20-\x7E\u00A0-\u024F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120000);
    }
  } catch {
    return "";
  }
  return "";
}

async function downloadDocumentsForOpportunity(db, companyId, opportunityId, documents = []) {
  const normalizedDocs = Array.isArray(documents) ? documents : [];
  if (!normalizedDocs.length || !opportunityId) return { downloaded: 0, hashes: [] };
  const targetDir = path.join(EU_OPPORTUNITY_DOCS_DIR, String(companyId));
  fs.mkdirSync(targetDir, { recursive: true });
  let downloaded = 0;
  const hashes = [];
  for (const doc of normalizedDocs.slice(0, 8)) {
    const sourceUrl = safeText(doc.url || doc.href || doc);
    if (!sourceUrl) continue;
    try {
      const response = await fetch(sourceUrl, {
        headers: OPORTUNITATI_HEADERS,
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const hash = fullHash(buffer);
      hashes.push(hash);
      const baseName = path.basename(new URL(sourceUrl).pathname) || `${hash}.bin`;
      const safeName = `${hash.slice(0, 12)}-${decodeURIComponent(baseName).replace(/[^A-Za-z0-9._-]+/g, "_")}`;
      const filePath = path.join(targetDir, safeName);
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer);
      const extractedText = extractDocumentText(buffer, safeName);
      db.prepare(`
        INSERT INTO procurement_opportunity_documents (
          company_id, opportunity_id, source_url, file_name, file_path, mime_type,
          file_size, content_hash, extracted_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, opportunity_id, source_url) DO UPDATE SET
          file_name=excluded.file_name,
          file_path=excluded.file_path,
          mime_type=excluded.mime_type,
          file_size=excluded.file_size,
          content_hash=excluded.content_hash,
          extracted_text=COALESCE(NULLIF(excluded.extracted_text, ''), procurement_opportunity_documents.extracted_text)
      `).run(
        companyId,
        opportunityId,
        sourceUrl,
        safeName,
        path.relative(PROJECT_ROOT, filePath),
        response.headers.get("content-type") || "",
        buffer.length,
        hash,
        extractedText.slice(0, 200000)
      );
      downloaded += 1;
      if (extractedText) {
        const row = db.prepare("SELECT title, description, relevance_score FROM procurement_opportunities WHERE id=? AND company_id=?").get(opportunityId, companyId);
        const combined = `${row?.title || ""}\n${row?.description || ""}\n${extractedText.slice(0, 12000)}`;
        const score = Math.max(Number(row?.relevance_score || 0), relevanceScore(combined, normalizedDocs.length));
        db.prepare(`
          UPDATE procurement_opportunities
          SET detected_keywords=?, relevance_score=?, document_hash=?, updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(jsonField(detectOpportunityKeywords(combined)), score, hash, opportunityId, companyId);
      }
    } catch {
      // Documentele inaccesibile raman linkuri; nu blocam sincronizarea.
    }
  }
  return { downloaded, hashes };
}

function findOpportunityId(db, companyId, item = {}) {
  const row = db.prepare(`
    SELECT id
    FROM procurement_opportunities
    WHERE company_id=?
      AND (
        (source=? AND source_id=?)
        OR (COALESCE(detail_url,'')<>'' AND COALESCE(detail_url,'')=?)
        OR (
          LOWER(TRIM(COALESCE(title,'')))=LOWER(TRIM(?))
          AND LOWER(TRIM(COALESCE(buyer_name,'')))=LOWER(TRIM(?))
        )
      )
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, item.source, item.source_id, safeText(item.detail_url), safeText(item.title), safeText(item.buyer_name));
  return Number(row?.id || 0);
}

function createHighScoreNotification(db, companyId, opportunityId, item = {}) {
  if (Number(item.relevance_score || 0) < 70 || !opportunityId) return;
  db.prepare(`
    INSERT OR IGNORE INTO procurement_opportunity_notifications (
      company_id, opportunity_id, notification_type, status, message
    ) VALUES (?, ?, 'high_score', 'new', ?)
  `).run(
    companyId,
    opportunityId,
    `Oportunitate EU cu scor ${Number(item.relevance_score || 0)}: ${safeText(item.title).slice(0, 160)}`
  );
}

function parseItemDocuments(item = {}) {
  if (Array.isArray(item.documents_json)) return item.documents_json;
  try {
    const parsed = JSON.parse(safeText(item.documents_json || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function enrichLegacyFundingItem(item = {}, sourceRow = {}) {
  const rawText = rawJsonSearchText(item);
  const docs = parseItemDocuments(item);
  const combined = [
    item.title,
    item.buyer_name,
    item.cpv_code,
    item.contract_type,
    item.procedure_type,
    item.notice_type,
    rawText
  ].filter(Boolean).join("\n");
  return {
    ...item,
    source_config_id: Number(sourceRow.id || 0) || null,
    source_type: safeText(sourceRow.source_type),
    country: safeText(sourceRow.country || "RO"),
    funding_program: sourceProgramFromRow(sourceRow),
    description: textFromHtml(combined).slice(0, 700),
    detected_keywords: detectOpportunityKeywords(combined),
    documents_json: docs,
    relevance_score: relevanceScore(combined, docs.length),
    review_status: "nou",
    content_hash: fullHash(`${item.title || ""}|${item.buyer_name || ""}|${combined.slice(0, 3000)}`)
  };
}

async function fetchEuItemsForSource(sourceRow = {}, options = {}) {
  const type = safeText(sourceRow.source_type).toUpperCase();
  const limit = Math.max(1, Number(options.limit || 40));
  if (type === "PNRR" || normalizeTextKey(sourceRow.url).includes("proiecte pnrr")) {
    const items = await fetchPnrrAnnouncements({ limit: Math.min(limit, 120) });
    return { items: items.map((item) => enrichLegacyFundingItem(item, sourceRow)), pagesScanned: Math.max(1, Math.ceil(items.length / DEFAULT_PAGE_SIZE)) };
  }
  if (normalizeTextKey(sourceRow.url).includes("beneficiar fonduri ue")) {
    const items = await fetchBeneficiarFonduriUeAnnouncements({ limit: Math.min(limit, 80) });
    return { items: items.map((item) => enrichLegacyFundingItem(item, sourceRow)), pagesScanned: 1 };
  }
  if (normalizeTextKey(sourceRow.url).includes("oportunitati ue")) {
    const items = await fetchOportunitatiFunding({ limit: Math.min(limit, 100) });
    return { items: items.map((item) => enrichLegacyFundingItem(item, sourceRow)), pagesScanned: Math.max(1, Math.ceil(items.length / OPORTUNITATI_PAGE_SIZE)) };
  }
  return fetchGenericEuSource(sourceRow, { limit });
}

async function syncEuSource(db, companyId, sourceRow, options = {}) {
  let imported = 0;
  let updated = 0;
  let pagesScanned = 0;
  let found = 0;
  try {
    const { items, pagesScanned: pages } = await fetchEuItemsForSource(sourceRow, options);
    pagesScanned = pages;
    found = items.length;
    for (const item of items) {
      const outcome = upsertOpportunity(db, companyId, item);
      if (outcome === "inserted") imported += 1;
      if (outcome === "updated") updated += 1;
      const opportunityId = findOpportunityId(db, companyId, item);
      const docs = parseItemDocuments(item);
      if (docs.length) await downloadDocumentsForOpportunity(db, companyId, opportunityId, docs);
      const refreshed = db.prepare("SELECT relevance_score, title FROM procurement_opportunities WHERE id=? AND company_id=?").get(opportunityId, companyId) || item;
      createHighScoreNotification(db, companyId, opportunityId, { ...item, ...refreshed });
    }
    db.prepare("UPDATE procurement_opportunity_sources SET last_checked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(sourceRow.id, companyId);
    writeEuSyncRun(db, companyId, sourceRow, "OK", { imported, updated, pagesScanned, found });
    return { source: sourceRow.name, type: sourceRow.source_type, status: "OK", imported, updated, found, pagesScanned };
  } catch (error) {
    writeEuSyncRun(db, companyId, sourceRow, "EROARE", { imported, updated, pagesScanned, found }, error?.message || error);
    return { source: sourceRow.name, type: sourceRow.source_type, status: "EROARE", imported, updated, found, pagesScanned, error: error?.message || String(error) };
  }
}

async function syncEuOpportunityFinder(db, companyId, options = {}) {
  ensureProcurementOpportunitiesSchema(db);
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) throw new Error("Companie invalida pentru EU Opportunity Finder.");
  const limit = Math.max(5, Number(options.limit || 40));
  const sources = loadEuOpportunitySources(db, normalizedCompanyId, {
    activeOnly: true,
    dueOnly: Boolean(options.dueOnly)
  });
  const selected = safeText(options.source);
  const rows = (selected
    ? sources.filter((source) => normalizeTextKey(source.name).includes(normalizeTextKey(selected)) || normalizeTextKey(source.source_type) === normalizeTextKey(selected))
    : sources)
    .slice(0, Math.max(1, Number(options.sourceLimit || options.sourcesLimit || 200)));
  const results = [];
  for (const sourceRow of rows) {
    results.push(await syncEuSource(db, normalizedCompanyId, sourceRow, { limit }));
  }
  db.prepare(`
    UPDATE procurement_opportunities
    SET is_active=0, status='Expirat', updated_at=datetime('now')
    WHERE company_id=?
      AND source LIKE 'EU_%'
      AND submission_deadline IS NOT NULL
      AND submission_deadline <> ''
      AND datetime(submission_deadline) < datetime('now')
  `).run(normalizedCompanyId);
  return results;
}

async function fetchSeapProcedures({ publicationDays = 30, limit = 150 } = {}) {
  const pageSize = Math.min(DEFAULT_PAGE_SIZE, Math.max(5, Number(limit || DEFAULT_PAGE_SIZE)));
  const maxPages = Math.max(1, Math.ceil(Number(limit || pageSize) / pageSize));
  const items = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = {
      pageIndex,
      pageSize,
      sortProperties: [],
      sysProcedureStateId: 2,
      startPublicationDate: toIsoDate(daysAgo(publicationDays)),
      startTenderReceiptDeadline: toIsoDate(startOfToday()),
      sysNoticeTypeIds: []
    };
    const data = await postJson(
      `${SICAP_BASE_URL}/api-pub/NoticeCommon/GetCNoticeList/`,
      payload,
      seapHeaders(`${SICAP_BASE_URL}/pub/notices/contract-notices/list/2/1`)
    );
    items.push(...(Array.isArray(data.items) ? data.items : []));
    if (!data.items?.length || items.length >= Number(data.total || 0)) break;
  }
  return items.slice(0, limit).map(mapSeapProcedure).filter((item) => item.is_active && isItSoftwareOpportunity(item));
}

async function fetchSeapAdvertising({ publicationDays = 7, limit = 150 } = {}) {
  const pageSize = Math.min(DEFAULT_PAGE_SIZE, Math.max(5, Number(limit || DEFAULT_PAGE_SIZE)));
  const maxPages = Math.max(1, Math.ceil(Number(limit || pageSize) / pageSize));
  const items = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = {
      pageIndex,
      pageSize,
      publicationDateStart: toIsoDate(daysAgo(publicationDays)),
      sysNoticeStateId: 2
    };
    const data = await postJson(
      `${SICAP_BASE_URL}/api-pub/AdvNoticeCommon/GetAdvNoticeList/`,
      payload,
      seapHeaders(`${SICAP_BASE_URL}/pub/adv-notices/list/1`)
    );
    items.push(...(Array.isArray(data.items) ? data.items : []));
    if (!data.items?.length || items.length >= Number(data.total || 0)) break;
  }
  return items.slice(0, limit).map(mapSeapAdvertising).filter((item) => item.is_active && isItSoftwareOpportunity(item));
}

async function fetchTedRomania({ limit = 80 } = {}) {
  const data = await postJson(TED_SEARCH_URL, {
    query: `place-of-performance IN (ROU) AND deadline-receipt-tender-date-lot >= ${tedDateToken(startOfToday())}`,
    fields: [
      "publication-number",
      "publication-date",
      "place-of-performance",
      "notice-type",
      "contract-nature-main-proc",
      "deadline-receipt-tender-date-lot",
      "organisation-name-buyer",
      "title-proc",
      "estimated-value-proc",
      "classification-cpv"
    ],
    page: 1,
    limit: Math.min(250, Math.max(1, Number(limit || 80))),
    scope: "ACTIVE",
    paginationMode: "PAGE_NUMBER"
  }, { "content-type": "application/json" });
  return (Array.isArray(data.notices) ? data.notices : []).map(mapTedNotice).filter((item) => item.is_active && isItSoftwareOpportunity(item));
}

async function syncSource(db, companyId, source, loader) {
  let imported = 0;
  let updated = 0;
  try {
    const items = await loader();
    for (const item of items) {
      const outcome = upsertOpportunity(db, companyId, item);
      if (outcome === "inserted") imported += 1;
      if (outcome === "updated") updated += 1;
    }
    writeSyncRun(db, companyId, source, "OK", imported, updated);
    return { source, status: "OK", imported, updated };
  } catch (error) {
    writeSyncRun(db, companyId, source, "EROARE", imported, updated, error?.message || error);
    return { source, status: "EROARE", imported, updated, error: error?.message || String(error) };
  }
}

async function syncProcurementOpportunities(db, companyId, options = {}) {
  ensureProcurementOpportunitiesSchema(db);
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) throw new Error("Companie invalida pentru sincronizare oportunitati.");

  const limit = Math.max(10, Number(options.limit || 150));
  const publicationDays = Math.max(1, Number(options.publicationDays || 30));
  const results = [];
  results.push(await syncSource(db, normalizedCompanyId, "SICAP_PROCEDURI", () => fetchSeapProcedures({ publicationDays, limit })));
  results.push(await syncSource(db, normalizedCompanyId, "SICAP_PUBLICITATE", () => fetchSeapAdvertising({ publicationDays: Math.min(publicationDays, 7), limit })));
  results.push(await syncSource(db, normalizedCompanyId, "TED_RO", () => fetchTedRomania({ limit: Math.min(limit, 100) })));
  results.push(await syncSource(db, normalizedCompanyId, "OPORTUNITATI_UE", () => fetchOportunitatiFunding({ limit: Math.min(limit, 100) })));
  results.push(await syncSource(db, normalizedCompanyId, "PNRR_PROCEDURI", () => fetchPnrrAnnouncements({ limit: Math.min(limit, 120) })));
  results.push(await syncSource(db, normalizedCompanyId, "BENEFICIAR_FONDURI_UE", () => fetchBeneficiarFonduriUeAnnouncements({ limit: Math.min(limit, 80) })));
  const removed = pruneNonItSoftwareOpportunities(db, normalizedCompanyId);
  writeSyncRun(db, normalizedCompanyId, "FILTRU_IT_SOFTWARE", "OK", 0, removed);
  results.push({ source: "FILTRU_IT_SOFTWARE", status: "OK", imported: 0, updated: removed });

  db.prepare(`
    UPDATE procurement_opportunities
    SET is_active=0, status='Expirat', updated_at=datetime('now')
    WHERE company_id=?
      AND submission_deadline IS NOT NULL
      AND submission_deadline <> ''
      AND datetime(submission_deadline) < datetime('now')
  `).run(normalizedCompanyId);

  return results;
}

function loadProcurementOpportunities(db, companyId, filters = {}) {
  ensureProcurementOpportunitiesSchema(db);
  const where = ["company_id=?"];
  const params = [Number(companyId || 0)];
  const source = safeText(filters.source);
  const q = safeText(filters.q).toLowerCase();
  const status = safeText(filters.status);
  const contractType = safeText(filters.contract_type);
  const sourceType = safeText(filters.source_type);
  const country = safeText(filters.country);
  const program = safeText(filters.program || filters.funding_program);
  const reviewStatus = safeText(filters.review_status);
  const minScore = Number(filters.min_score || 0);
  const euOnly = filters.eu_only !== false;
  const publicationFrom = toDateInput(filters.publication_from);
  const publicationTo = toDateInput(filters.publication_to);
  const deadlineFrom = toDateInput(filters.deadline_from);
  const deadlineTo = toDateInput(filters.deadline_to);

  if (euOnly) where.push("(source LIKE 'EU_%' OR source IN ('OPORTUNITATI_UE','PNRR_PROCEDURI','BENEFICIAR_FONDURI_UE'))");
  if (source) {
    where.push("source=?");
    params.push(source);
  }
  if (sourceType) {
    where.push("UPPER(COALESCE(source_type,''))=UPPER(?)");
    params.push(sourceType);
  }
  if (country) {
    where.push("UPPER(COALESCE(country,''))=UPPER(?)");
    params.push(country);
  }
  if (program) {
    where.push("LOWER(COALESCE(funding_program,'')) LIKE ?");
    params.push(`%${program.toLowerCase()}%`);
  }
  if (reviewStatus) {
    where.push("LOWER(COALESCE(review_status,''))=LOWER(?)");
    params.push(reviewStatus);
  }
  if (Number.isFinite(minScore) && minScore > 0) {
    where.push("COALESCE(relevance_score,0) >= ?");
    params.push(Math.max(0, Math.min(100, minScore)));
  }
  if (status === "active") where.push("is_active=1");
  if (status === "expired") where.push("is_active=0");
  if (contractType) {
    where.push("LOWER(COALESCE(contract_type,'')) LIKE ?");
    params.push(`%${contractType.toLowerCase()}%`);
  }
  if (publicationFrom) {
    where.push("date(publication_date) >= date(?)");
    params.push(publicationFrom);
  }
  if (publicationTo) {
    where.push("date(publication_date) <= date(?)");
    params.push(publicationTo);
  }
  if (deadlineFrom) {
    where.push("date(submission_deadline) >= date(?)");
    params.push(deadlineFrom);
  }
  if (deadlineTo) {
    where.push("date(submission_deadline) <= date(?)");
    params.push(deadlineTo);
  }
  if (q) {
    where.push(`(
      LOWER(COALESCE(title,'')) LIKE ?
      OR LOWER(COALESCE(buyer_name,'')) LIKE ?
      OR LOWER(COALESCE(cpv_code,'')) LIKE ?
      OR LOWER(COALESCE(notice_no,'')) LIKE ?
      OR LOWER(COALESCE(description,'')) LIKE ?
      OR LOWER(COALESCE(detected_keywords,'')) LIKE ?
    )`);
    const token = `%${q}%`;
    params.push(token, token, token, token, token, token);
  }

  const rows = db.prepare(`
    SELECT *
    FROM procurement_opportunities
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(relevance_score,0) DESC, is_active DESC, datetime(submission_deadline) ASC, datetime(publication_date) DESC
    LIMIT 500
  `).all(...params);

  if (rows.length) {
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    const docs = db.prepare(`
      SELECT *
      FROM procurement_opportunity_documents
      WHERE company_id=? AND opportunity_id IN (${placeholders})
      ORDER BY id ASC
    `).all(Number(companyId || 0), ...ids);
    const byOpportunity = new Map();
    for (const doc of docs) {
      const list = byOpportunity.get(doc.opportunity_id) || [];
      list.push(doc);
      byOpportunity.set(doc.opportunity_id, list);
    }
    for (const row of rows) {
      const linked = byOpportunity.get(row.id) || [];
      let jsonDocs = [];
      try {
        jsonDocs = JSON.parse(row.documents_json || "[]");
      } catch {
        jsonDocs = [];
      }
      row.documents = linked.length ? linked : (Array.isArray(jsonDocs) ? jsonDocs : []);
    }
  }

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN source='SICAP_PROCEDURI' THEN 1 ELSE 0 END) AS sicap_procedures,
      SUM(CASE WHEN source='SICAP_PUBLICITATE' THEN 1 ELSE 0 END) AS sicap_advertising,
      SUM(CASE WHEN source='TED_RO' THEN 1 ELSE 0 END) AS ted,
      SUM(CASE WHEN source='OPORTUNITATI_UE' THEN 1 ELSE 0 END) AS oportunitati_ue,
      SUM(CASE WHEN source='PNRR_PROCEDURI' THEN 1 ELSE 0 END) AS pnrr_procedures,
      SUM(CASE WHEN source='BENEFICIAR_FONDURI_UE' THEN 1 ELSE 0 END) AS beneficiar_fonduri_ue,
      SUM(CASE WHEN source IN ('OPORTUNITATI_UE','PNRR_PROCEDURI','BENEFICIAR_FONDURI_UE') THEN 1 ELSE 0 END) AS eu_funding,
      SUM(CASE WHEN LOWER(COALESCE(contract_type,'')) LIKE '%pnrr%' THEN 1 ELSE 0 END) AS pnrr,
      SUM(CASE WHEN LOWER(COALESCE(contract_type,'')) LIKE '%digitalizare%' THEN 1 ELSE 0 END) AS digitalizare,
      SUM(CASE WHEN COALESCE(relevance_score,0) >= 70 THEN 1 ELSE 0 END) AS high_score,
      SUM(CASE WHEN LOWER(COALESCE(review_status,''))='nou' THEN 1 ELSE 0 END) AS new_review,
      SUM(CASE WHEN LOWER(COALESCE(review_status,''))='interesant' THEN 1 ELSE 0 END) AS interesting,
      SUM(CASE WHEN crm_lead_id IS NOT NULL THEN 1 ELSE 0 END) AS crm_leads,
      MIN(CASE WHEN is_active=1 THEN submission_deadline ELSE NULL END) AS next_deadline
    FROM procurement_opportunities
    WHERE company_id=?
      ${euOnly ? "AND (source LIKE 'EU_%' OR source IN ('OPORTUNITATI_UE','PNRR_PROCEDURI','BENEFICIAR_FONDURI_UE'))" : ""}
  `).get(Number(companyId || 0)) || {};

  const latestRuns = db.prepare(`
    SELECT *
    FROM procurement_opportunity_sync_runs
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 8
  `).all(Number(companyId || 0));

  const sources = loadEuOpportunitySources(db, companyId, { seed: true, activeOnly: false });
  const notifications = db.prepare(`
    SELECT n.*, o.title, o.relevance_score
    FROM procurement_opportunity_notifications n
    JOIN procurement_opportunities o ON o.id=n.opportunity_id AND o.company_id=n.company_id
    WHERE n.company_id=? AND n.status='new'
    ORDER BY n.id DESC
    LIMIT 10
  `).all(Number(companyId || 0));

  return { rows, stats, latestRuns, sources, notifications };
}

function normalizeOpportunityReviewStatus(value = "") {
  const normalized = safeText(value).toLowerCase();
  return ["nou", "analizat", "interesant", "respins", "aplicat"].includes(normalized) ? normalized : "nou";
}

function updateProcurementOpportunityStatus(db, companyId, opportunityId, reviewStatus) {
  ensureProcurementOpportunitiesSchema(db);
  const status = normalizeOpportunityReviewStatus(reviewStatus);
  const result = db.prepare(`
    UPDATE procurement_opportunities
    SET review_status=?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(status, Number(opportunityId || 0), Number(companyId || 0));
  if (status !== "nou") {
    db.prepare(`
      UPDATE procurement_opportunity_notifications
      SET status='read'
      WHERE company_id=? AND opportunity_id=?
    `).run(Number(companyId || 0), Number(opportunityId || 0));
  }
  return { ok: result.changes > 0, status };
}

function nextCrmLeadNumber(db, companyId) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM crm_leads
    WHERE company_id=? AND year=?
  `).get(companyId, year)?.next_seq || 1);
  let number = "";
  do {
    number = `LD-${year}-${String(seq).padStart(4, "0")}`;
    seq += 1;
  } while (db.prepare("SELECT id FROM crm_leads WHERE company_id=? AND lead_number=?").get(companyId, number));
  return { year, seq: seq - 1, number };
}

function createCrmLeadFromProcurementOpportunity(db, companyId, opportunityId, createdByEmail = "") {
  ensureProcurementOpportunitiesSchema(db);
  const opportunity = db.prepare(`
    SELECT *
    FROM procurement_opportunities
    WHERE id=? AND company_id=?
  `).get(Number(opportunityId || 0), Number(companyId || 0));
  if (!opportunity) return { ok: false, error: "missing_opportunity" };
  if (opportunity.crm_lead_id) return { ok: true, existing: true, leadId: opportunity.crm_lead_id };

  const docs = db.prepare(`
    SELECT source_url, file_name, file_path
    FROM procurement_opportunity_documents
    WHERE company_id=? AND opportunity_id=?
    ORDER BY id ASC
    LIMIT 20
  `).all(Number(companyId || 0), opportunity.id);
  let linkedDocs = docs;
  if (!linkedDocs.length) {
    try {
      const parsed = JSON.parse(opportunity.documents_json || "[]");
      linkedDocs = Array.isArray(parsed) ? parsed.map((doc) => ({ source_url: doc.url || doc.href || "", file_name: doc.title || "", file_path: "" })) : [];
    } catch {
      linkedDocs = [];
    }
  }
  const next = nextCrmLeadNumber(db, Number(companyId || 0));
  const notes = [
    `Sursa oportunitate: ${opportunity.source || "-"}`,
    `Program: ${opportunity.funding_program || opportunity.contract_type || "-"}`,
    `Link procedura: ${opportunity.detail_url || "-"}`,
    `Termen limita: ${opportunity.submission_deadline || "-"}`,
    `Scor relevanta: ${opportunity.relevance_score || 0}/100`,
    opportunity.description ? `Descriere: ${opportunity.description}` : "",
    linkedDocs.length ? `Documente:\n${linkedDocs.map((doc) => `- ${doc.source_url || doc.file_path || doc.file_name}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");

  const insert = db.prepare(`
    INSERT INTO crm_leads (
      company_id, year, seq, lead_number, name, company_name, contact_name,
      email, phone, source, status, owner_email, estimated_value, probability,
      next_step, next_followup_date, notes, created_by_email
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'CAMPANIE', 'NOU', ?, ?, 25, ?, ?, ?, ?)
  `).run(
    Number(companyId || 0),
    next.year,
    next.seq,
    next.number,
    opportunity.title || `Oportunitate EU ${opportunity.id}`,
    opportunity.buyer_name || null,
    safeText(createdByEmail) || null,
    Number(opportunity.estimated_value || 0),
    "Analizeaza procedura si contacteaza beneficiarul.",
    opportunity.submission_deadline ? opportunity.submission_deadline.slice(0, 10) : null,
    notes,
    safeText(createdByEmail) || null
  );
  const leadId = insert.lastInsertRowid;
  db.prepare(`
    UPDATE procurement_opportunities
    SET crm_lead_id=?, review_status='interesant', updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(leadId, opportunity.id, Number(companyId || 0));
  return { ok: true, leadId, leadNumber: next.number };
}

export {
  createCrmLeadFromProcurementOpportunity,
  ensureProcurementOpportunitiesSchema,
  loadEuOpportunitySources,
  loadProcurementOpportunities,
  syncEuOpportunityFinder,
  syncProcurementOpportunities,
  updateProcurementOpportunityStatus
};
