import crypto from "node:crypto";
import { lookup, resolve4, resolve6, resolveMx } from "node:dns/promises";
import net from "node:net";
import {
  GooglePlacesService,
  buildAutoParkGoogleQueries,
  ensureGooglePlacesSchema,
  googlePlaceToLeadCandidate,
  googlePlacesAvailable,
  isLikelyAutoParkCandidate,
  upsertLeadGooglePlaceMatch
} from "./google-places-service.js";
import {
  emarqetOfficeEmail,
  emarqetSupportEmail
} from "./emarqet-mailboxes.js";

const DEFAULT_USER_AGENT = "NexoraLeadBuilder/1.0 (+https://nexora.aafastitsolutions.ro; public business discovery)";
const DEFAULT_COUNTRY = "Romania";
const MAX_FETCH_BYTES = 750_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_SEARCH_TIMEOUT_MS = 30000;
export const LEAD_PILOT_CAMPAIGN_NAME = "Dealeri Auto Prahova – Lansare E-MARQET";

const PRAHOVA_AUTO_PILOT_KEYWORDS = [
  "parc auto Prahova",
  "parcuri auto Prahova",
  "mașini rulate Prahova",
  "auto rulate Prahova",
  "autoturisme second-hand Prahova",
  "parc auto Ploiești",
  "mașini rulate Ploiești",
  "parc auto Blejoi",
  "auto rulate Blejoi",
  "parc auto Câmpina",
  "parc auto Băicoi",
  "vânzări auto Prahova",
  "autoturisme în rate Prahova"
];

const PRAHOVA_AUTO_PILOT_CITIES = [
  "Ploiești",
  "Blejoi",
  "Bucov",
  "Câmpina",
  "Băicoi",
  "Boldești-Scăeni",
  "Vălenii de Munte",
  "Urlați",
  "Mizil",
  "Breaza",
  "Sinaia"
];

const ONBOARDING_STAGES = [
  { key: "dealer_contactat", label: "Dealer contactat", dueDays: 0, priority: "RIDICATA" },
  { key: "raspuns_primit", label: "Raspuns primit", dueDays: 1, priority: "RIDICATA" },
  { key: "interes_confirmat", label: "Interes confirmat", dueDays: 2, priority: "RIDICATA" },
  { key: "cont_creat", label: "Cont creat", dueDays: 3, priority: "RIDICATA" },
  { key: "verificare_firma", label: "Verificare firma", dueDays: 4, priority: "MEDIE" },
  { key: "metoda_import_stabilita", label: "Metoda de import stabilita", dueDays: 5, priority: "MEDIE" },
  { key: "stoc_primit", label: "Stoc primit", dueDays: 6, priority: "MEDIE" },
  { key: "import_test", label: "Import test", dueDays: 7, priority: "MEDIE" },
  { key: "import_validat", label: "Import validat", dueDays: 8, priority: "MEDIE" },
  { key: "anunturi_publicate", label: "Anunturi publicate", dueDays: 9, priority: "RIDICATA" },
  { key: "dealer_activ", label: "Dealer activ", dueDays: 10, priority: "RIDICATA" },
  { key: "followup_7_zile", label: "Follow-up dupa 7 zile", dueDays: 17, priority: "MEDIE" },
  { key: "followup_30_zile", label: "Follow-up dupa 30 de zile", dueDays: 40, priority: "MEDIE" }
];

const PRAHOVA_CITY_COORDS = {
  ploiesti: { lat: 44.9361, lon: 26.0300 },
  "ploiesti municipiul": { lat: 44.9361, lon: 26.0300 },
  blejoi: { lat: 45.0006, lon: 26.0207 },
  bucov: { lat: 44.9667, lon: 26.0833 },
  campina: { lat: 45.1262, lon: 25.7349 },
  baicoi: { lat: 45.0333, lon: 25.8500 },
  "boldesti scaeni": { lat: 45.0333, lon: 26.0333 },
  "valenii de munte": { lat: 45.1833, lon: 26.0333 },
  valenii: { lat: 45.1833, lon: 26.0333 },
  urlati: { lat: 44.9833, lon: 26.2333 },
  mizil: { lat: 44.9994, lon: 26.4447 },
  breaza: { lat: 45.1833, lon: 25.6667 },
  sinaia: { lat: 45.3500, lon: 25.5500 }
};

const LEAD_PIPELINE_STAGES = [
  "nou",
  "date_incomplete",
  "verificat",
  "prioritar",
  "pregatit_contact",
  "email_trimis",
  "contactat_telefonic",
  "raspuns_primit",
  "interesat",
  "demo_programat",
  "cont_creat",
  "dealer_contactat",
  "interes_confirmat",
  "verificare_firma",
  "metoda_import_stabilita",
  "stoc_primit",
  "import_test",
  "import_validat",
  "anunturi_publicate",
  "dealer_activ",
  "followup_7_zile",
  "followup_30_zile",
  "import_in_curs",
  "client_activ",
  "refuzat",
  "fara_raspuns",
  "nu_mai_contacta"
];

const EMAIL_ROLE_PRIORITY = {
  vanzari: 1,
  sales: 1,
  marketing: 2,
  office: 3,
  contact: 4,
  general: 5,
  suport: 6,
  support: 6,
  contabilitate: 7,
  personal_public: 8
};

const GENERIC_BUSINESS_EMAIL_ROLES = new Set([
  "admin",
  "asistenta",
  "comenzi",
  "contact",
  "hello",
  "info",
  "marketing",
  "office",
  "programari",
  "receptie",
  "secretariat",
  "sales",
  "suport",
  "support",
  "vanzari"
]);

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.ro",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "proton.me",
  "protonmail.com"
]);

const DEFAULT_SCORE_CONFIG = {
  email_valid_points: 15,
  phone_valid_points: 10,
  website_active_points: 10,
  catalog_online_points: 15,
  items_over_20_points: 15,
  active_social_points: 10,
  contact_person_points: 10,
  exact_campaign_fit_points: 15,
  website_unavailable_penalty: -10,
  stale_data_penalty: -10,
  duplicate_penalty: -20,
  inactive_company_penalty: -50,
  missing_contact_penalty: -20
};

const CATEGORY_PRESETS = {
  auto_dealers: {
    label: "Parcuri auto / Dealeri auto",
    domain: "Auto",
    keywords: ["parc auto", "parcuri auto", "masini rulate", "auto rulate", "autoturisme second-hand"],
    osmSelectors: [
      '["shop"="car"]',
      '["amenity"="car_rental"]'
    ],
    nameRegex: "parc auto|dealer auto|auto rulate|masini rulate|mașini rulate|autoturisme|second hand|second-hand"
  },
  real_estate_agencies: {
    label: "Agentii imobiliare",
    domain: "Imobiliare",
    keywords: ["agentie imobiliara", "imobiliare"],
    osmSelectors: ['["office"="estate_agent"]'],
    nameRegex: "imobiliare|agentie imobiliara|agenție imobiliară"
  },
  hotels_guesthouses: {
    label: "Hoteluri si pensiuni",
    domain: "Turism",
    keywords: ["hotel", "pensiune", "cazare"],
    osmSelectors: ['["tourism"~"hotel|guest_house|apartment|chalet"]'],
    nameRegex: "hotel|pensiune|cazare"
  },
  restaurants: {
    label: "Restaurante",
    domain: "HoReCa",
    keywords: ["restaurant", "bistro"],
    osmSelectors: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'],
    nameRegex: "restaurant|bistro|trattoria|pizzerie"
  },
  b2b: {
    label: "Firme B2B",
    domain: "B2B",
    keywords: ["servicii", "distributie"],
    osmSelectors: ['["office"="company"]'],
    nameRegex: "servicii|distributie|distribuție|consultanta|consultanță"
  }
};

function nowIso() {
  return new Date().toISOString();
}

export function safeText(value = "") {
  return String(value ?? "").trim();
}

export function normalizeKey(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugKey(value = "") {
  return normalizeKey(value).replace(/\s+/g, "-");
}

function truthy(value) {
  return ["1", "true", "yes", "on", "da"].includes(String(value ?? "").trim().toLowerCase());
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseJson(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  const text = safeText(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function encryptionKey() {
  const raw = safeText(process.env.LEAD_ENCRYPTION_KEY || process.env.SESSION_SECRET);
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptLeadSecret(value = "") {
  const text = safeText(value);
  if (!text) return "";
  const key = encryptionKey();
  if (!key) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `gcm:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptLeadSecret(value = "") {
  const text = safeText(value);
  const key = encryptionKey();
  if (!text || !key || !text.startsWith("gcm:")) return "";
  const [, ivRaw, tagRaw, encryptedRaw] = text.split(":");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function normalizeEmail(value = "") {
  return safeText(value).toLowerCase().replace(/^mailto:/i, "").replace(/[.,;:)]+$/g, "");
}

export function emailDomain(email = "") {
  return normalizeEmail(email).split("@")[1] || "";
}

export function classifyEmail(email = "") {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) return "invalid";
  const local = normalizeKey(localPart.replace(/[._-]+/g, " "));
  if (["vanzari", "vanzare", "sales", "comercial"].some((token) => local.includes(token))) return "vanzari";
  if (local.includes("marketing")) return "marketing";
  if (local.includes("support") || local.includes("suport")) return "suport";
  if (local.includes("contabil") || local.includes("factur")) return "contabilitate";
  if (local.includes("office") || local.includes("birou")) return "office";
  if (local.includes("contact")) return "contact";
  if (GENERIC_BUSINESS_EMAIL_ROLES.has(localPart)) return "general";
  if (/^[a-z]+[._-][a-z]+$/.test(localPart) && !FREE_EMAIL_DOMAINS.has(domain)) return "personal_public";
  return FREE_EMAIL_DOMAINS.has(domain) ? "free_personal_unknown" : "general";
}

function isCollectableEmail(email = "") {
  const role = classifyEmail(email);
  if (role === "invalid" || role === "free_personal_unknown") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

export async function validateEmail(email = "") {
  const normalized = normalizeEmail(email);
  const role = classifyEmail(normalized);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return { email: normalized, role, status: "invalid", reason: "format" };
  }
  const domain = emailDomain(normalized);
  try {
    const mxRows = await resolveMx(domain);
    if (Array.isArray(mxRows) && mxRows.length) {
      return { email: normalized, role, status: "valid", reason: "mx" };
    }
  } catch {
    // Fall through to A/AAAA lookup; some smaller domains receive on root records.
  }
  try {
    const [a, aaaa] = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
    if ((a.status === "fulfilled" && a.value.length) || (aaaa.status === "fulfilled" && aaaa.value.length)) {
      return { email: normalized, role, status: "probabil_valid", reason: "domain_resolves_no_mx" };
    }
  } catch {
    // ignored
  }
  return { email: normalized, role, status: "invalid", reason: "dns" };
}

export function normalizePhone(value = "", country = DEFAULT_COUNTRY) {
  const original = safeText(value);
  if (!original) return "";
  let digits = original.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    return `+${digits.replace(/\D/g, "")}`;
  }
  const onlyDigits = digits.replace(/\D/g, "");
  if (!onlyDigits) return "";
  if (normalizeKey(country).includes("romania")) {
    if (onlyDigits.startsWith("40")) return `+${onlyDigits}`;
    if (onlyDigits.startsWith("0") && onlyDigits.length >= 10) return `+40${onlyDigits.slice(1)}`;
  }
  return onlyDigits.length >= 8 ? `+${onlyDigits}` : "";
}

function phoneKind(phone = "") {
  const normalized = normalizePhone(phone);
  if (/^\+407/.test(normalized)) return "mobil";
  if (/^\+402|^\+403/.test(normalized)) return "fix";
  return normalized ? "necunoscut" : "";
}

export function normalizeWebsite(value = "") {
  const raw = safeText(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    if (url.pathname === "/") url.pathname = "/";
    return url.toString();
  } catch {
    return "";
  }
}

function websiteOrigin(value = "") {
  try {
    const url = new URL(normalizeWebsite(value));
    return url.origin;
  } catch {
    return "";
  }
}

function websiteDomain(value = "") {
  try {
    return new URL(normalizeWebsite(value)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function scoreCategory(score = 0) {
  const value = clampNumber(score, 0, 0, 100);
  if (value >= 80) return "prioritate_foarte_mare";
  if (value >= 60) return "prioritate_mare";
  if (value >= 40) return "prioritate_medie";
  if (value >= 20) return "prioritate_mica";
  return "necalificat";
}

export function ensureLeadBuilderSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      target_product TEXT NOT NULL DEFAULT 'E-MARQET',
      domain TEXT,
      category TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      county TEXT,
      city_list TEXT,
      keywords TEXT,
      max_results INTEGER NOT NULL DEFAULT 500,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, name)
    );

    CREATE TABLE IF NOT EXISTS lead_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER,
      name TEXT NOT NULL,
      activity_domain TEXT,
      category TEXT,
      keywords TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      county TEXT,
      city TEXT,
      radius_km REAL NOT NULL DEFAULT 20,
      max_results INTEGER NOT NULL DEFAULT 500,
      sources_json TEXT NOT NULL DEFAULT '[]',
      collect_email INTEGER NOT NULL DEFAULT 1,
      collect_phone INTEGER NOT NULL DEFAULT 1,
      collect_website INTEGER NOT NULL DEFAULT 1,
      collect_facebook INTEGER NOT NULL DEFAULT 1,
      collect_instagram INTEGER NOT NULL DEFAULT 1,
      collect_linkedin INTEGER NOT NULL DEFAULT 1,
      collect_address INTEGER NOT NULL DEFAULT 1,
      identify_contact_person INTEGER NOT NULL DEFAULT 0,
      identify_external_platforms INTEGER NOT NULL DEFAULT 1,
      check_online_store INTEGER NOT NULL DEFAULT 1,
      check_existing_crm INTEGER NOT NULL DEFAULT 1,
      check_existing_emarqet INTEGER NOT NULL DEFAULT 1,
      auto_sync_crm INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      progress INTEGER NOT NULL DEFAULT 0,
      result_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_by_email TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lead_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      source_key TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'public_api',
      is_active INTEGER NOT NULL DEFAULT 1,
      access_method TEXT,
      api_key_encrypted TEXT,
      limits_json TEXT NOT NULL DEFAULT '{}',
      last_sync_at TEXT,
      result_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      respects_robots INTEGER NOT NULL DEFAULT 1,
      terms_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, source_key)
    );

    CREATE TABLE IF NOT EXISTS lead_source_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      source_id INTEGER NOT NULL,
      config_key TEXT NOT NULL,
      config_value_encrypted TEXT,
      is_secret INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, source_id, config_key),
      FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lead_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      commercial_name TEXT NOT NULL,
      legal_name TEXT,
      cui TEXT,
      registration_number TEXT,
      activity_domain TEXT,
      category TEXT,
      description TEXT,
      founded_year INTEGER,
      public_status TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      county TEXT,
      city TEXT,
      address TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      map_url TEXT,
      primary_email TEXT,
      sales_email TEXT,
      marketing_email TEXT,
      support_email TEXT,
      primary_phone TEXT,
      secondary_phone TEXT,
      whatsapp_phone TEXT,
      contact_person TEXT,
      contact_position TEXT,
      contact_form_url TEXT,
      website TEXT,
      facebook_url TEXT,
      instagram_url TEXT,
      linkedin_url TEXT,
      tiktok_url TEXT,
      youtube_url TEXT,
      has_website INTEGER NOT NULL DEFAULT 0,
      has_online_store INTEGER NOT NULL DEFAULT 0,
      has_facebook INTEGER NOT NULL DEFAULT 0,
      has_instagram INTEGER NOT NULL DEFAULT 0,
      has_google_business INTEGER NOT NULL DEFAULT 0,
      publishes_auto_ads INTEGER NOT NULL DEFAULT 0,
      has_online_catalog INTEGER NOT NULL DEFAULT 0,
      estimated_items_count INTEGER NOT NULL DEFAULT 0,
      external_platforms_json TEXT NOT NULL DEFAULT '[]',
      offers_financing INTEGER NOT NULL DEFAULT 0,
      offers_warranty INTEGER NOT NULL DEFAULT 0,
      offers_delivery INTEGER NOT NULL DEFAULT 0,
      offers_buyback INTEGER NOT NULL DEFAULT 0,
      offers_leasing INTEGER NOT NULL DEFAULT 0,
      main_source TEXT,
      source_url TEXT,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_checked_at TEXT,
      verification_status TEXT NOT NULL DEFAULT 'neverificat',
      confidence_score INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      dedupe_hash TEXT NOT NULL,
      crm_client_id INTEGER,
      crm_lead_id INTEGER,
      emarqet_partner_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, dedupe_hash)
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER,
      search_id INTEGER,
      lead_company_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'nou',
      status TEXT NOT NULL DEFAULT 'nou',
      priority TEXT NOT NULL DEFAULT 'medie',
      score INTEGER NOT NULL DEFAULT 0,
      score_category TEXT NOT NULL DEFAULT 'necalificat',
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      duplicate_of_lead_id INTEGER,
      crm_lead_id INTEGER,
      crm_opportunity_id INTEGER,
      contact_ready INTEGER NOT NULL DEFAULT 0,
      do_not_contact INTEGER NOT NULL DEFAULT 0,
      contacted_at TEXT,
      replied_at TEXT,
      converted_client_id INTEGER,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES lead_campaigns(id) ON DELETE SET NULL,
      FOREIGN KEY (search_id) REFERENCES lead_searches(id) ON DELETE SET NULL,
      FOREIGN KEY (lead_company_id) REFERENCES lead_companies(id) ON DELETE CASCADE,
      UNIQUE(company_id, campaign_id, lead_company_id)
    );

    CREATE TABLE IF NOT EXISTS lead_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      name TEXT,
      position TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_company_id, name, email, phone)
    );

    CREATE TABLE IF NOT EXISTS lead_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      email_type TEXT,
      validation_status TEXT NOT NULL DEFAULT 'neverificat',
      validation_reason TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_company_id, email)
    );

    CREATE TABLE IF NOT EXISTS lead_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      phone_original TEXT,
      phone_normalized TEXT NOT NULL,
      phone_type TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_company_id, phone_normalized)
    );

    CREATE TABLE IF NOT EXISTS lead_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      country TEXT,
      county TEXT,
      city TEXT,
      address TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      map_url TEXT,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_social_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_company_id, platform, url)
    );

    CREATE TABLE IF NOT EXISTS lead_websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      domain TEXT,
      http_status INTEGER,
      https_enabled INTEGER NOT NULL DEFAULT 0,
      redirect_url TEXT,
      availability_status TEXT NOT NULL DEFAULT 'neverificat',
      is_parked INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_company_id, url)
    );

    CREATE TABLE IF NOT EXISTS lead_source_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER,
      lead_id INTEGER,
      source_key TEXT NOT NULL,
      source_url TEXT,
      external_id TEXT,
      raw_payload_json TEXT NOT NULL DEFAULT '{}',
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, source_key, external_id)
    );

    CREATE TABLE IF NOT EXISTS lead_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'necalificat',
      rules_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_score_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      config_key TEXT NOT NULL,
      config_value TEXT NOT NULL,
      updated_by_email TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, config_key)
    );

    CREATE TABLE IF NOT EXISTS lead_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local_fallback',
      model TEXT,
      analysis_text TEXT,
      recommendation_text TEXT,
      best_contact_method TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_id, tag)
    );

    CREATE TABLE IF NOT EXISTS lead_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER NOT NULL,
      status_from TEXT,
      status_to TEXT NOT NULL,
      changed_by_email TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_duplicates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER NOT NULL,
      duplicate_lead_id INTEGER,
      duplicate_company_id INTEGER,
      match_type TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      resolution_status TEXT NOT NULL DEFAULT 'needs_review',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER,
      lead_company_id INTEGER,
      activity_type TEXT NOT NULL,
      subject TEXT,
      details TEXT,
      actor_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER NOT NULL,
      message_type TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      template_key TEXT,
      generated_by TEXT,
      sent_at TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_id, message_type)
    );

    CREATE TABLE IF NOT EXISTS lead_onboarding_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER,
      lead_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      stage_label TEXT NOT NULL,
      responsible_email TEXT,
      due_date TEXT,
      notification_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      note_required INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_by_email TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_id, stage_key)
    );

    CREATE TABLE IF NOT EXISTS lead_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      export_type TEXT NOT NULL,
      filters_json TEXT NOT NULL DEFAULT '{}',
      row_count INTEGER NOT NULL DEFAULT 0,
      file_name TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'csv',
      file_name TEXT,
      mapping_json TEXT NOT NULL DEFAULT '{}',
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      error TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      search_id INTEGER,
      campaign_id INTEGER,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      error_reason TEXT,
      stop_requested INTEGER NOT NULL DEFAULT 0,
      concurrency_limit INTEGER NOT NULL DEFAULT 1,
      request_limit_per_minute INTEGER NOT NULL DEFAULT 30,
      created_by_email TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      job_id INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_suppression_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      phone TEXT,
      domain TEXT,
      reason TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, email, phone, domain)
    );

    CREATE INDEX IF NOT EXISTS idx_lead_campaigns_company_status ON lead_campaigns(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_searches_company_status ON lead_searches(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_companies_company_category ON lead_companies(company_id, category, county, city);
    CREATE INDEX IF NOT EXISTS idx_lead_companies_company_email ON lead_companies(company_id, primary_email);
    CREATE INDEX IF NOT EXISTS idx_lead_companies_company_phone ON lead_companies(company_id, primary_phone);
    CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status, score DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_company_campaign ON leads(company_id, campaign_id, score DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_company_search ON leads(company_id, search_id, score DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_jobs_company_status ON lead_jobs(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_messages_company_status ON lead_messages(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_onboarding_tasks_company_status ON lead_onboarding_tasks(company_id, campaign_id, status, due_date);
  `);

  ensureGooglePlacesSchema(db);

  for (const [key, value] of Object.entries(DEFAULT_SCORE_CONFIG)) {
    db.prepare(`
      INSERT OR IGNORE INTO lead_score_configs (company_id, config_key, config_value)
      VALUES (0, ?, ?)
    `).run(key, String(value));
  }
}

export function seedLeadBuilderDefaults(db, companyId = 0) {
  ensureLeadBuilderSchema(db);
  const normalizedCompanyId = Number(companyId || 0);
  const sources = [
    {
      key: "openstreetmap",
      name: "OpenStreetMap / Overpass",
      type: "public_api",
      active: 1,
      access: "Public Overpass API",
      terms: "https://operations.osmfoundation.org/policies/nominatim/",
      limits: { requests_per_minute: 10, max_results: 500 },
      notes: "Public POI data. Good for discovery, usually weak on email."
    },
    {
      key: "public_website",
      name: "Site-uri publice ale firmelor",
      type: "public_web",
      active: 1,
      access: "HTTP public cu robots.txt",
      terms: "",
      limits: { requests_per_minute: 30, max_pages_per_company: 5 },
      notes: "Fetch controlat pentru homepage, contact, despre noi si termeni."
    },
    {
      key: "manual_import",
      name: "Import manual CSV / Excel",
      type: "manual_file",
      active: 1,
      access: "Fisier incarcat de utilizator",
      terms: "",
      limits: { max_rows: 5000 },
      notes: "Pentru liste obtinute legal din fisiere proprii sau parteneri."
    },
    {
      key: "google_places",
      name: "Google Places API (New)",
      type: "partner_api",
      active: googlePlacesAvailable() ? 1 : 0,
      access: "API oficial Google Places (New), server-side",
      terms: "https://developers.google.com/maps/terms",
      limits: {
        requires_api_key: true,
        daily_limit: Number(process.env.GOOGLE_PLACES_DAILY_LIMIT || 250),
        requests_per_minute: Number(process.env.GOOGLE_PLACES_REQUESTS_PER_MINUTE || 20),
        field_mask_required: true
      },
      notes: "Foloseste GOOGLE_PLACES_API_KEY pe backend. Nu expune cheia si nu cauta emailuri in Google; emailul se cauta ulterior pe website-ul oficial."
    },
    {
      key: "google_business",
      name: "Google Business Profile API",
      type: "partner_api",
      active: 0,
      access: "API oficial Google",
      terms: "https://developers.google.com/maps/terms",
      limits: { requires_api_key: true },
      notes: "Necesita cont Google Cloud, API key si respectarea termenilor."
    },
    {
      key: "facebook_pages",
      name: "Facebook Pages API",
      type: "partner_api",
      active: 0,
      access: "Meta Graph API",
      terms: "https://developers.facebook.com/terms/",
      limits: { requires_app_review: true },
      notes: "Doar date permise de Graph API; fara conturi false sau scraping."
    },
    {
      key: "linkedin_company",
      name: "LinkedIn Company Pages",
      type: "partner_api",
      active: 0,
      access: "API / acces permis",
      terms: "https://www.linkedin.com/legal/l/api-terms-of-use",
      limits: { restricted_access: true },
      notes: "Activare doar dupa aprobare si acces legal."
    }
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO lead_sources (
      company_id, source_key, name, type, is_active, access_method,
      limits_json, respects_robots, terms_url, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE lead_sources
    SET name=?, type=?, access_method=?, limits_json=?, respects_robots=1,
        terms_url=?, notes=?, updated_at=datetime('now')
    WHERE company_id=? AND source_key=?
  `);
  for (const source of sources) {
    insert.run(
      normalizedCompanyId,
      source.key,
      source.name,
      source.type,
      source.active,
      source.access,
      json(source.limits),
      source.terms,
      source.notes
    );
    update.run(
      source.name,
      source.type,
      source.access,
      json(source.limits),
      source.terms,
      source.notes,
      normalizedCompanyId,
      source.key
    );
    if (source.key === "google_places") {
      db.prepare(`
        UPDATE lead_sources
        SET is_active=?, updated_at=datetime('now')
        WHERE company_id=? AND source_key='google_places'
      `).run(source.active, normalizedCompanyId);
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_SCORE_CONFIG)) {
    db.prepare(`
      INSERT OR IGNORE INTO lead_score_configs (company_id, config_key, config_value)
      VALUES (?, ?, ?)
    `).run(normalizedCompanyId, key, String(value));
  }
}

export function loadLeadScoreConfig(db, companyId = 0) {
  ensureLeadBuilderSchema(db);
  const config = { ...DEFAULT_SCORE_CONFIG };
  const rows = db.prepare(`
    SELECT config_key, config_value
    FROM lead_score_configs
    WHERE company_id IN (0, ?)
    ORDER BY company_id ASC
  `).all(Number(companyId || 0));
  for (const row of rows) {
    if (!Object.prototype.hasOwnProperty.call(config, row.config_key)) continue;
    const parsed = Number(row.config_value);
    if (Number.isFinite(parsed)) config[row.config_key] = parsed;
  }
  return config;
}

export function saveLeadScoreConfig(db, companyId = 0, values = {}, actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const upsert = db.prepare(`
    INSERT INTO lead_score_configs (company_id, config_key, config_value, updated_by_email, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(company_id, config_key)
    DO UPDATE SET config_value=excluded.config_value, updated_by_email=excluded.updated_by_email, updated_at=datetime('now')
  `);
  const tx = db.transaction(() => {
    for (const key of Object.keys(DEFAULT_SCORE_CONFIG)) {
      const value = clampNumber(values[key], DEFAULT_SCORE_CONFIG[key], -100, 100);
      upsert.run(Number(companyId || 0), key, String(value), safeText(actorEmail));
    }
  });
  tx();
  return loadLeadScoreConfig(db, companyId);
}

export function categoryOptions() {
  return Object.entries(CATEGORY_PRESETS).map(([key, value]) => ({ key, label: value.label }));
}

function normalizeCategory(value = "") {
  const raw = safeText(value);
  if (CATEGORY_PRESETS[raw]) return raw;
  const key = normalizeKey(raw);
  if (key.includes("auto") || key.includes("dealer")) return "auto_dealers";
  if (key.includes("imobil")) return "real_estate_agencies";
  if (key.includes("hotel") || key.includes("pensi")) return "hotels_guesthouses";
  if (key.includes("restaurant")) return "restaurants";
  return raw || "b2b";
}

function defaultKeywordsForCategory(category = "") {
  const preset = CATEGORY_PRESETS[normalizeCategory(category)];
  return preset?.keywords?.join(", ") || "";
}

function defaultCitiesForSearch(search = {}) {
  const county = normalizeKey(search.county);
  const category = normalizeCategory(search.category);
  if (county.includes("prahova") && category === "auto_dealers") {
    return PRAHOVA_AUTO_PILOT_CITIES;
  }
  return [];
}

function splitList(value = "") {
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean);
  return safeText(value)
    .split(/[,;\n]+/)
    .map((item) => safeText(item))
    .filter(Boolean);
}

export function ensurePilotPrahovaCampaign(db, companyId = 0, actorEmail = "system") {
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);
  const normalizedCompanyId = Number(companyId || 0);
  const name = LEAD_PILOT_CAMPAIGN_NAME;
  const oldName = "Dealeri auto Prahova - E-MARQET";
  const cityList = PRAHOVA_AUTO_PILOT_CITIES.join(", ");
  const keywords = PRAHOVA_AUTO_PILOT_KEYWORDS.join(", ");
  const pilotSources = googlePlacesAvailable()
    ? ["google_places", "public_website"]
    : ["openstreetmap", "public_website"];
  const existingExact = db.prepare("SELECT id FROM lead_campaigns WHERE company_id=? AND name=?").get(normalizedCompanyId, name);
  const existingOld = db.prepare("SELECT id FROM lead_campaigns WHERE company_id=? AND name=?").get(normalizedCompanyId, oldName);
  if (!existingExact && existingOld?.id) {
    db.prepare(`
      UPDATE lead_campaigns
      SET name=?, city_list=?, keywords=?, max_results=50, status='active', updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(name, cityList, keywords, existingOld.id, normalizedCompanyId);
  }
  db.prepare(`
    INSERT OR IGNORE INTO lead_campaigns (
      company_id, name, target_product, domain, category, country, county,
      city_list, keywords, max_results, status, created_by_email
    ) VALUES (?, ?, 'E-MARQET', 'Auto', 'auto_dealers', 'Romania', 'Prahova', ?, ?, 50, 'active', ?)
  `).run(normalizedCompanyId, name, cityList, keywords, safeText(actorEmail));
  db.prepare(`
    UPDATE lead_campaigns
    SET target_product='E-MARQET',
        domain='Auto',
        category='auto_dealers',
        country='Romania',
        county='Prahova',
        city_list=?,
        keywords=?,
        max_results=50,
        status='active',
        updated_at=datetime('now')
    WHERE company_id=? AND name=?
  `).run(cityList, keywords, normalizedCompanyId, name);
  const campaign = db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND name=?").get(normalizedCompanyId, name);

  const searchName = "Cautare initiala - Parcuri Auto Prahova";
  let existingSearch = db.prepare(`
    SELECT id
    FROM lead_searches
    WHERE company_id=? AND campaign_id=? AND name IN (?, 'Cautare initiala - Dealeri Auto Prahova')
    ORDER BY id ASC
    LIMIT 1
  `).get(normalizedCompanyId, campaign.id, searchName);
  if (!existingSearch?.id) {
    const inserted = db.prepare(`
      INSERT INTO lead_searches (
        company_id, campaign_id, name, activity_domain, category, keywords, country, county, city,
        radius_km, max_results, sources_json, collect_email, collect_phone, collect_website,
        collect_facebook, collect_instagram, collect_linkedin, collect_address,
        identify_contact_person, identify_external_platforms, check_online_store,
        check_existing_crm, check_existing_emarqet, auto_sync_crm, status, created_by_email
      ) VALUES (?, ?, ?, 'Auto', 'auto_dealers', ?, 'Romania', 'Prahova', ?, 22, 50, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'ready', ?)
    `).run(
      normalizedCompanyId,
      campaign.id,
      searchName,
      keywords,
      cityList,
      json(pilotSources),
      safeText(actorEmail)
    );
    existingSearch = { id: inserted.lastInsertRowid };
  }
  db.prepare(`
    UPDATE lead_searches
    SET name=?,
        keywords=?,
        city=?,
        radius_km=22,
        max_results=50,
        sources_json=?,
        collect_email=1,
        collect_phone=1,
        collect_website=1,
        collect_facebook=1,
        collect_instagram=1,
        collect_linkedin=1,
        collect_address=1,
        identify_contact_person=1,
        identify_external_platforms=1,
        check_online_store=1,
        check_existing_crm=1,
        check_existing_emarqet=1,
        auto_sync_crm=1,
        status='ready',
        updated_at=datetime('now')
    WHERE company_id=? AND id=?
  `).run(searchName, keywords, cityList, json(pilotSources), normalizedCompanyId, existingSearch.id);
  const search = db.prepare(`
    SELECT *
    FROM lead_searches
    WHERE company_id=? AND id=?
  `).get(normalizedCompanyId, existingSearch.id);
  return { campaign, search };
}

export function createLeadSearch(db, companyId = 0, actorEmail = "", data = {}) {
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);
  const category = normalizeCategory(data.category || data.activity_domain);
  const name = safeText(data.name || data.campaign_name) || `Cautare ${CATEGORY_PRESETS[category]?.label || category}`;
  const campaignName = safeText(data.campaign_name) || name;
  const keywords = safeText(data.keywords) || defaultKeywordsForCategory(category);
  const city = safeText(data.city || data.cities) || defaultCitiesForSearch({ county: data.county, category }).join(", ");
  const sources = splitList(data.sources || data.sources_json).length
    ? splitList(data.sources || data.sources_json)
    : (category === "auto_dealers" && googlePlacesAvailable()
      ? ["google_places", "public_website", "openstreetmap"]
      : ["openstreetmap", "public_website"]);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO lead_campaigns (
        company_id, name, target_product, domain, category, country, county,
        city_list, keywords, max_results, status, created_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      Number(companyId || 0),
      campaignName,
      safeText(data.target_product) || "E-MARQET",
      safeText(data.activity_domain) || CATEGORY_PRESETS[category]?.domain || "",
      category,
      safeText(data.country) || DEFAULT_COUNTRY,
      safeText(data.county),
      city,
      keywords,
      clampNumber(data.max_results, 500, 1, 5000),
      safeText(actorEmail)
    );
    const campaign = db.prepare(`
      SELECT id
      FROM lead_campaigns
      WHERE company_id=? AND name=?
    `).get(Number(companyId || 0), campaignName);
    const result = db.prepare(`
      INSERT INTO lead_searches (
        company_id, campaign_id, name, activity_domain, category, keywords, country, county, city,
        radius_km, max_results, sources_json, collect_email, collect_phone, collect_website,
        collect_facebook, collect_instagram, collect_linkedin, collect_address,
        identify_contact_person, identify_external_platforms, check_online_store,
        check_existing_crm, check_existing_emarqet, auto_sync_crm, status, created_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)
    `).run(
      Number(companyId || 0),
      Number(campaign?.id || 0) || null,
      name,
      safeText(data.activity_domain) || CATEGORY_PRESETS[category]?.domain || "",
      category,
      keywords,
      safeText(data.country) || DEFAULT_COUNTRY,
      safeText(data.county),
      city,
      clampNumber(data.radius_km, 20, 1, 100),
      clampNumber(data.max_results, 500, 1, 5000),
      json(sources),
      truthy(data.collect_email ?? "1") ? 1 : 0,
      truthy(data.collect_phone ?? "1") ? 1 : 0,
      truthy(data.collect_website ?? "1") ? 1 : 0,
      truthy(data.collect_facebook ?? "1") ? 1 : 0,
      truthy(data.collect_instagram ?? "1") ? 1 : 0,
      truthy(data.collect_linkedin ?? "1") ? 1 : 0,
      truthy(data.collect_address ?? "1") ? 1 : 0,
      truthy(data.identify_contact_person) ? 1 : 0,
      truthy(data.identify_external_platforms ?? "1") ? 1 : 0,
      truthy(data.check_online_store ?? "1") ? 1 : 0,
      truthy(data.check_existing_crm ?? "1") ? 1 : 0,
      truthy(data.check_existing_emarqet ?? "1") ? 1 : 0,
      truthy(data.auto_sync_crm ?? "1") ? 1 : 0,
      safeText(actorEmail)
    );
    return Number(result.lastInsertRowid || 0);
  });
  return tx();
}

export function createLeadBuilderJob(db, companyId = 0, searchId = 0, jobType = "search_companies", actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const search = db.prepare("SELECT * FROM lead_searches WHERE id=? AND company_id=?").get(Number(searchId || 0), Number(companyId || 0));
  if (!search) return null;
  const maxConcurrent = clampNumber(process.env.LEAD_MAX_CONCURRENT_JOBS || 1, 1, 1, 5);
  const requestLimit = clampNumber(process.env.LEAD_MAX_REQUESTS_PER_MINUTE || 30, 30, 5, 120);
  const result = db.prepare(`
    INSERT INTO lead_jobs (
      company_id, search_id, campaign_id, job_type, status, concurrency_limit,
      request_limit_per_minute, created_by_email
    ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)
  `).run(Number(companyId || 0), search.id, search.campaign_id || null, jobType, maxConcurrent, requestLimit, safeText(actorEmail));
  return db.prepare("SELECT * FROM lead_jobs WHERE id=? AND company_id=?").get(Number(result.lastInsertRowid || 0), Number(companyId || 0));
}

function recordJobLog(db, companyId, jobId, level, message, details = {}) {
  db.prepare(`
    INSERT INTO lead_job_logs (company_id, job_id, level, message, details_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(companyId || 0), Number(jobId || 0), safeText(level) || "info", safeText(message), json(details));
}

function selectedSourceKeys(search = {}) {
  const values = parseJson(search.sources_json, []);
  return Array.isArray(values) && values.length ? values.map(safeText).filter(Boolean) : ["openstreetmap", "public_website"];
}

function loadActiveSources(db, companyId, search = {}) {
  const selected = new Set(selectedSourceKeys(search));
  return db.prepare(`
    SELECT *
    FROM lead_sources
    WHERE company_id=? AND is_active=1
    ORDER BY source_key ASC
  `).all(Number(companyId || 0)).filter((source) => selected.has(source.source_key));
}

function userAgent() {
  return safeText(process.env.LEAD_USER_AGENT) || DEFAULT_USER_AGENT;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeOverpassRegex(value = "") {
  return safeText(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": userAgent(),
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || DEFAULT_SEARCH_TIMEOUT_MS)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.remark || data?.error || `${response.status} ${response.statusText}`);
  return data;
}

async function geocodeCity(city = "", county = "", country = DEFAULT_COUNTRY) {
  const key = normalizeKey(city);
  if (PRAHOVA_CITY_COORDS[key]) return PRAHOVA_CITY_COORDS[key];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", [city, county, country].filter(Boolean).join(", "));
  const rows = await fetchJson(url.toString(), { timeoutMs: DEFAULT_SEARCH_TIMEOUT_MS });
  const row = Array.isArray(rows) ? rows[0] : null;
  const lat = Number(row?.lat);
  const lon = Number(row?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function buildOverpassQuery(search = {}, coords = {}, limit = 100) {
  const radiusMeters = Math.round(clampNumber(search.radius_km, 20, 1, 100) * 1000);
  const category = normalizeCategory(search.category);
  const preset = CATEGORY_PRESETS[category] || CATEGORY_PRESETS.b2b;
  const keywordRegex = splitList(search.keywords)
    .map(escapeOverpassRegex)
    .filter(Boolean)
    .join("|");
  const nameRegex = keywordRegex || preset.nameRegex || escapeOverpassRegex(category);
  const selectors = preset.osmSelectors || [];
  const includeNameRegex = !selectors.length || truthy(search.include_name_regex);
  const selectorLines = [
    ...selectors.map((selector) => `nwr${selector}(around:${radiusMeters},${coords.lat},${coords.lon});`),
    includeNameRegex && nameRegex ? `nwr["name"~"${nameRegex}",i](around:${radiusMeters},${coords.lat},${coords.lon});` : ""
  ].filter(Boolean);
  return `[out:json][timeout:25];(${selectorLines.join("")});out center tags ${Math.max(1, Math.min(500, Number(limit || 100)))};`;
}

function addressFromTags(tags = {}) {
  return [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:unit"]
  ].filter(Boolean).join(" ");
}

function osmTag(tags = {}, names = []) {
  for (const name of names) {
    if (safeText(tags[name])) return safeText(tags[name]);
  }
  return "";
}

function socialFromTags(tags = {}, platform = "") {
  const key = platform.toLowerCase();
  return osmTag(tags, [
    `contact:${key}`,
    key,
    `${key}:url`,
    `social:${key}`
  ]);
}

function osmElementToCandidate(element = {}, search = {}, city = "") {
  const tags = element.tags || {};
  const name = safeText(tags.name || tags.brand || tags.operator);
  if (!name) return null;
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const website = normalizeWebsite(osmTag(tags, ["contact:website", "website", "url"]));
  return {
    source_key: "openstreetmap",
    source_name: "OpenStreetMap",
    external_id: `${element.type}:${element.id}`,
    source_url: sourceUrl,
    commercial_name: name,
    legal_name: "",
    category: normalizeCategory(search.category),
    activity_domain: search.activity_domain || CATEGORY_PRESETS[normalizeCategory(search.category)]?.domain || "",
    description: osmTag(tags, ["description", "operator:type"]) || "",
    country: osmTag(tags, ["addr:country"]) || search.country || DEFAULT_COUNTRY,
    county: osmTag(tags, ["addr:county", "is_in:county"]) || search.county || "",
    city: osmTag(tags, ["addr:city", "addr:town", "addr:village"]) || city || search.city || "",
    address: addressFromTags(tags),
    postal_code: osmTag(tags, ["addr:postcode"]),
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
    map_url: sourceUrl,
    email: osmTag(tags, ["contact:email", "email"]),
    phone: osmTag(tags, ["contact:phone", "phone"]),
    website,
    facebook_url: socialFromTags(tags, "facebook"),
    instagram_url: socialFromTags(tags, "instagram"),
    linkedin_url: socialFromTags(tags, "linkedin"),
    raw_payload: element
  };
}

function nominatimRowToCandidate(row = {}, search = {}, city = "") {
  const tags = row.extratags || {};
  const address = row.address || {};
  const name = safeText(row.name || row.namedetails?.name || String(row.display_name || "").split(",")[0]);
  if (!name) return null;
  const osmType = safeText(row.osm_type).toLowerCase();
  const osmId = safeText(row.osm_id || row.place_id);
  const typePath = osmType.startsWith("node") ? "node" : osmType.startsWith("way") ? "way" : osmType.startsWith("relation") ? "relation" : "";
  const sourceUrl = typePath && osmId ? `https://www.openstreetmap.org/${typePath}/${osmId}` : safeText(row.licence) || "https://www.openstreetmap.org";
  return {
    source_key: "openstreetmap",
    source_name: "OpenStreetMap Nominatim",
    external_id: `nominatim:${osmType || "place"}:${osmId || row.place_id}`,
    source_url: sourceUrl,
    commercial_name: name,
    legal_name: "",
    category: normalizeCategory(search.category),
    activity_domain: search.activity_domain || CATEGORY_PRESETS[normalizeCategory(search.category)]?.domain || "",
    description: safeText(row.type || row.category),
    country: address.country || search.country || DEFAULT_COUNTRY,
    county: address.county || search.county || "",
    city: address.city || address.town || address.village || city || "",
    address: [address.road, address.house_number].filter(Boolean).join(" "),
    postal_code: address.postcode || "",
    latitude: Number(row.lat) || null,
    longitude: Number(row.lon) || null,
    map_url: sourceUrl,
    email: osmTag(tags, ["contact:email", "email"]),
    phone: osmTag(tags, ["contact:phone", "phone"]),
    website: normalizeWebsite(osmTag(tags, ["contact:website", "website", "url"])),
    facebook_url: socialFromTags(tags, "facebook"),
    instagram_url: socialFromTags(tags, "instagram"),
    linkedin_url: socialFromTags(tags, "linkedin"),
    raw_payload: row
  };
}

async function nominatimBusinessSearch(search = {}, city = "", limit = 30, options = {}) {
  const category = normalizeCategory(search.category);
  const preset = CATEGORY_PRESETS[category] || CATEGORY_PRESETS.b2b;
  const keywords = splitList(search.keywords).length ? splitList(search.keywords) : (preset.keywords || [preset.label]);
  const queries = keywords.slice(0, 4).map((keyword) =>
    [keyword, city, search.county, search.country || DEFAULT_COUNTRY].filter(Boolean).join(", ")
  );
  const candidates = [];
  const seen = new Set();
  for (const query of queries) {
    if (candidates.length >= limit) break;
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(Math.min(20, Math.max(1, limit - candidates.length))));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("q", query);
    try {
      const rows = await fetchJson(url.toString(), { timeoutMs: DEFAULT_SEARCH_TIMEOUT_MS });
      for (const row of Array.isArray(rows) ? rows : []) {
        const candidate = nominatimRowToCandidate(row, search, city);
        if (!candidate) continue;
        const key = candidate.external_id || `${normalizeKey(candidate.commercial_name)}|${normalizeKey(candidate.city)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate);
        if (candidates.length >= limit) break;
      }
    } catch (error) {
      options.onLog?.("warn", "Nominatim nu a raspuns pentru interogare.", { city, query, error: error?.message || String(error) });
    }
    await sleep(1200);
  }
  return candidates;
}

export class LeadSourceAdapter {
  async search() {
    return [];
  }
  async fetchCompany(candidate) {
    return candidate;
  }
  extractContacts() {
    return {};
  }
  normalize(candidate) {
    return candidate;
  }
  validate(candidate) {
    return candidate;
  }
  getSourceName() {
    return "Generic Lead Source";
  }
  getSourceUrl() {
    return "";
  }
}

export class OpenStreetMapLeadSourceAdapter extends LeadSourceAdapter {
  getSourceName() {
    return "OpenStreetMap / Overpass";
  }
  getSourceUrl() {
    return "https://www.openstreetmap.org";
  }
  async search(search = {}, options = {}) {
    const maxResults = Math.max(1, Math.min(Number(search.max_results || 500), 500));
    const explicitCities = splitList(search.city);
    const cities = explicitCities.length ? explicitCities : defaultCitiesForSearch(search);
    if (!cities.length) cities.push(search.county || search.country || DEFAULT_COUNTRY);
    const candidates = [];
    const seen = new Set();
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter"
    ];

    for (const city of cities) {
      if (candidates.length >= maxResults) break;
      const coords = await geocodeCity(city, search.county, search.country);
      if (!coords) {
        options.onLog?.("warn", "Nu am gasit coordonate pentru localitate.", { city });
        continue;
      }
      const query = buildOverpassQuery(search, coords, Math.min(maxResults - candidates.length, 150));
      let data = null;
      let lastError = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
              "user-agent": userAgent()
            },
            body: new URLSearchParams({ data: query }),
            signal: AbortSignal.timeout(DEFAULT_SEARCH_TIMEOUT_MS)
          });
          data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.remark || `${response.status} ${response.statusText}`);
          break;
        } catch (error) {
          lastError = error;
          data = null;
        }
      }
      if (!data) {
        options.onLog?.("error", "Overpass nu a raspuns pentru localitate.", { city, error: lastError?.message || String(lastError) });
        const fallback = await nominatimBusinessSearch(search, city, Math.min(maxResults - candidates.length, 40), options);
        for (const candidate of fallback) {
          const key = `${candidate.source_key}:${candidate.external_id}`;
          const nameCityKey = `${normalizeKey(candidate.commercial_name)}|${normalizeKey(candidate.city)}`;
          if (seen.has(key) || seen.has(nameCityKey)) continue;
          seen.add(key);
          seen.add(nameCityKey);
          candidates.push(candidate);
          if (candidates.length >= maxResults) break;
        }
        continue;
      }
      for (const element of data.elements || []) {
        const candidate = osmElementToCandidate(element, search, city);
        if (!candidate) continue;
        const key = `${candidate.source_key}:${candidate.external_id}`;
        const nameCityKey = `${normalizeKey(candidate.commercial_name)}|${normalizeKey(candidate.city)}`;
        if (seen.has(key) || seen.has(nameCityKey)) continue;
        seen.add(key);
        seen.add(nameCityKey);
        candidates.push(candidate);
        if (candidates.length >= maxResults) break;
      }
      await sleep(1100);
    }
    return candidates.slice(0, maxResults);
  }
}

export class GooglePlacesLeadSourceAdapter extends LeadSourceAdapter {
  constructor(db, companyId = 0) {
    super();
    this.db = db;
    this.companyId = Number(companyId || 0);
  }
  getSourceName() {
    return "Google Places API (New)";
  }
  getSourceUrl() {
    return "https://places.googleapis.com";
  }
  async search(search = {}, options = {}) {
    const maxResults = Math.max(1, Math.min(
      Number(options.maxGoogleResults || process.env.GOOGLE_PLACES_MAX_RESULTS_PER_JOB || search.max_results || 100),
      100
    ));
    const maxQueries = Math.max(1, Math.min(Number(process.env.GOOGLE_PLACES_MAX_QUERIES_PER_JOB || 16), 40));
    const service = new GooglePlacesService({
      db: this.db,
      companyId: this.companyId,
      logger: (level, message, details) => options.onLog?.(level, message, details)
    });
    const category = normalizeCategory(search.category);
    const queries = category === "auto_dealers"
      ? buildAutoParkGoogleQueries(search, maxQueries)
      : splitList(search.keywords).slice(0, maxQueries).map((keyword) =>
        [keyword, search.city || search.county, search.country || DEFAULT_COUNTRY].filter(Boolean).join(" ")
      );
    const candidates = [];
    const seen = new Set();

    for (const query of queries) {
      if (candidates.length >= maxResults) break;
      try {
        const places = await service.searchText(query, {
          pageSize: Math.min(10, Math.max(1, maxResults - candidates.length)),
          includedType: "",
          strictTypeFiltering: false,
          regionCode: "RO",
          languageCode: "ro"
        });
        for (const place of places) {
          const candidate = googlePlaceToLeadCandidate(place, search, { query });
          if (!candidate.commercial_name) continue;
          if (category === "auto_dealers" && !isLikelyAutoParkCandidate(candidate, query)) continue;
          const idKey = candidate.google_place_id ? `google:${candidate.google_place_id}` : "";
          const nameCityKey = `${normalizeKey(candidate.commercial_name)}|${normalizeKey(candidate.city)}`;
          const domainKey = candidate.website ? `domain:${websiteDomain(candidate.website)}` : "";
          if ((idKey && seen.has(idKey)) || seen.has(nameCityKey) || (domainKey && seen.has(domainKey))) continue;
          if (idKey) seen.add(idKey);
          if (domainKey) seen.add(domainKey);
          seen.add(nameCityKey);
          candidates.push(candidate);
          if (candidates.length >= maxResults) break;
        }
        options.onLog?.("info", "Google Places a returnat rezultate.", { query, count: places.length, accepted: candidates.length });
      } catch (error) {
        options.onLog?.("warn", "Google Places nu a raspuns pentru interogare.", { query, error: error?.message || String(error) });
      }
      await sleep(250);
    }

    return candidates
      .sort((a, b) => Number(b.google_fit_score || 0) - Number(a.google_fit_score || 0))
      .slice(0, maxResults);
  }
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;|&apos;/gi, "'");
}

function textFromHtml(html = "") {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractLinks(html = "", baseUrl = "") {
  const links = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl).toString();
      links.push({ url, label: textFromHtml(match[2]) });
    } catch {
      // ignore invalid links
    }
  }
  return links;
}

function extractEmails(text = "") {
  const emails = new Set();
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let match;
  while ((match = regex.exec(text))) {
    const email = normalizeEmail(match[0]);
    if (!email.match(/\.(png|jpe?g|gif|webp|svg|pdf)$/i) && isCollectableEmail(email)) emails.add(email);
  }
  return Array.from(emails);
}

function extractPhones(text = "") {
  const phones = new Set();
  const regex = /(?:\+4|004)?0?\s*(?:2|3|7)\d(?:[\s().-]*\d){7,9}/g;
  let match;
  while ((match = regex.exec(text))) {
    const phone = normalizePhone(match[0]);
    if (phone) phones.add(phone);
  }
  return Array.from(phones);
}

function socialLinksFromHtml(html = "", baseUrl = "") {
  const socials = {};
  for (const link of extractLinks(html, baseUrl)) {
    const url = link.url;
    const host = websiteDomain(url);
    if (!host) continue;
    if (!socials.facebook_url && host.includes("facebook.com") && !url.includes("/sharer")) socials.facebook_url = url;
    if (!socials.instagram_url && host.includes("instagram.com")) socials.instagram_url = url;
    if (!socials.linkedin_url && host.includes("linkedin.com")) socials.linkedin_url = url;
    if (!socials.tiktok_url && host.includes("tiktok.com")) socials.tiktok_url = url;
    if (!socials.youtube_url && (host.includes("youtube.com") || host.includes("youtu.be"))) socials.youtube_url = url;
  }
  return socials;
}

function isPrivateIp(ip = "") {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0;
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

async function assertPublicHttpUrl(rawUrl = "") {
  const normalized = normalizeWebsite(rawUrl);
  if (!normalized) throw new Error("invalid_url");
  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid_protocol");
  if (url.username || url.password) throw new Error("url_credentials_blocked");
  const host = url.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".local")) throw new Error("internal_host_blocked");
  const rows = await lookup(host, { all: true, verbatim: false });
  if (!rows.length || rows.some((row) => isPrivateIp(row.address))) throw new Error("private_address_blocked");
  return normalized;
}

async function readResponseTextLimited(response, maxBytes = MAX_FETCH_BYTES) {
  if (!response.body?.getReader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - maxBytes))));
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function robotsRulesFor(content = "", targetAgent = userAgent()) {
  const lines = String(content || "").split(/\r?\n/);
  const groups = [];
  let group = { agents: [], disallow: [], allow: [] };
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      if (group.agents.length || group.disallow.length || group.allow.length) groups.push(group);
      group = { agents: [], disallow: [], allow: [] };
      continue;
    }
    const [keyRaw, ...rest] = line.split(":");
    const key = normalizeKey(keyRaw);
    const value = rest.join(":").trim();
    if (key === "user agent") group.agents.push(value.toLowerCase());
    if (key === "disallow") group.disallow.push(value);
    if (key === "allow") group.allow.push(value);
  }
  if (group.agents.length || group.disallow.length || group.allow.length) groups.push(group);
  const agent = targetAgent.toLowerCase();
  return groups.filter((item) => item.agents.some((candidate) => candidate === "*" || agent.includes(candidate)));
}

async function robotsAllowed(rawUrl = "") {
  const normalized = await assertPublicHttpUrl(rawUrl);
  const url = new URL(normalized);
  const robotsUrl = `${url.origin}/robots.txt`;
  let content = "";
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": userAgent(), accept: "text/plain,*/*" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return true;
    content = await readResponseTextLimited(response, 200_000);
  } catch {
    return true;
  }
  const groups = robotsRulesFor(content);
  const path = `${url.pathname || "/"}${url.search || ""}`;
  for (const group of groups) {
    const allowed = group.allow.some((rule) => rule && path.startsWith(rule));
    if (allowed) return true;
    const blocked = group.disallow.some((rule) => rule && path.startsWith(rule));
    if (blocked) return false;
  }
  return true;
}

async function fetchPublicText(rawUrl = "", timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const normalized = await assertPublicHttpUrl(rawUrl);
  const allowed = await robotsAllowed(normalized);
  if (!allowed) throw new Error("robots_disallowed");
  const response = await fetch(normalized, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
      "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6",
      "user-agent": userAgent()
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await readResponseTextLimited(response);
  const contentType = safeText(response.headers.get("content-type"));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  if (contentType && !/(text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml)/i.test(contentType)) {
    throw new Error("unsupported_content_type");
  }
  return {
    url: normalized,
    finalUrl: response.url || normalized,
    status: response.status,
    contentType,
    text
  };
}

function contactPageCandidates(html = "", baseUrl = "") {
  const baseOrigin = websiteOrigin(baseUrl);
  const candidates = [];
  for (const link of extractLinks(html, baseUrl)) {
    const label = normalizeKey(link.label);
    const href = normalizeKey(link.url);
    const sameOrigin = websiteOrigin(link.url) === baseOrigin;
    if (!sameOrigin) continue;
    if (/(contact|contacte|despre|about|termeni|confidentialitate|privacy|vanzari|sales|echipa)/.test(`${label} ${href}`)) {
      candidates.push(link.url);
    }
  }
  return Array.from(new Set(candidates)).slice(0, 4);
}

function detectCommerceSignals(text = "", html = "") {
  const normalized = normalizeKey(`${text} ${html.slice(0, 12000)}`);
  const estimatedMatches = [...String(text || "").matchAll(/(\d{1,4})\s+(?:autoturisme|masini|mașini|anunturi|anunțuri|vehicule|produse)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  const estimatedItems = estimatedMatches.length ? Math.max(...estimatedMatches) : 0;
  return {
    has_online_store: /\b(cos|adauga in cos|checkout|magazin online|cumpara online|comanda online)\b/.test(normalized) ? 1 : 0,
    has_online_catalog: /\b(stoc|catalog|auto rulate|masini in stoc|mașini in stoc|anunturi|anunțuri|produse disponibile)\b/.test(normalized) ? 1 : 0,
    publishes_auto_ads: /\b(auto rulate|masini rulate|mașini rulate|autoturisme|leasing auto|finantare auto)\b/.test(normalized) ? 1 : 0,
    estimated_items_count: estimatedItems,
    offers_financing: /\b(finantare|finanțare|leasing|credit auto)\b/.test(normalized) ? 1 : 0,
    offers_warranty: /\b(garantie|garanție)\b/.test(normalized) ? 1 : 0,
    offers_delivery: /\b(livrare|transport)\b/.test(normalized) ? 1 : 0,
    offers_buyback: /\b(buy back|buy-back|buyback)\b/.test(normalized) ? 1 : 0,
    offers_leasing: /\b(leasing)\b/.test(normalized) ? 1 : 0
  };
}

function looksParked(text = "") {
  const normalized = normalizeKey(text).slice(0, 5000);
  return /\b(domain for sale|buy this domain|parcare domeniu|parked domain|sedo parking)\b/.test(normalized);
}

export class PublicWebsiteLeadSourceAdapter extends LeadSourceAdapter {
  getSourceName() {
    return "Site-uri publice ale firmelor";
  }
  getSourceUrl() {
    return "";
  }
  async fetchCompany(candidate = {}, search = {}) {
    const website = normalizeWebsite(candidate.website);
    if (!website) return { ...candidate, website_status: "missing" };
    const pages = [];
    const emails = new Set();
    const phones = new Set();
    const socials = {};
    let websiteStatus = "neverificat";
    let httpStatus = 0;
    let finalUrl = "";
    let parked = 0;
    let commerce = {};
    try {
      const home = await fetchPublicText(website);
      pages.push(home);
      httpStatus = home.status;
      finalUrl = home.finalUrl;
      websiteStatus = "activ";
      const homeText = textFromHtml(home.text);
      parked = looksParked(homeText) ? 1 : 0;
      Object.assign(socials, socialLinksFromHtml(home.text, home.finalUrl));
      for (const email of extractEmails(`${home.text} ${homeText}`)) emails.add(email);
      for (const phone of extractPhones(homeText)) phones.add(phone);
      commerce = detectCommerceSignals(homeText, home.text);
      for (const contactUrl of contactPageCandidates(home.text, home.finalUrl)) {
        if (pages.length >= 5) break;
        try {
          await sleep(350);
          const page = await fetchPublicText(contactUrl);
          pages.push(page);
          const text = textFromHtml(page.text);
          Object.assign(socials, socialLinksFromHtml(page.text, page.finalUrl));
          for (const email of extractEmails(`${page.text} ${text}`)) emails.add(email);
          for (const phone of extractPhones(text)) phones.add(phone);
          commerce = { ...commerce, ...detectCommerceSignals(text, page.text) };
        } catch {
          // Individual contact pages may fail; keep homepage results.
        }
      }
    } catch (error) {
      websiteStatus = error?.message === "robots_disallowed" ? "blocat_robots" : "indisponibil";
      return {
        ...candidate,
        website,
        website_status: websiteStatus,
        website_error: error?.message || String(error),
        website_http_status: httpStatus,
        website_final_url: finalUrl
      };
    }
    return {
      ...candidate,
      website,
      website_status: websiteStatus,
      website_http_status: httpStatus,
      website_final_url: finalUrl,
      website_is_parked: parked,
      extracted_emails: Array.from(emails),
      extracted_phones: Array.from(phones),
      ...socials,
      ...commerce,
      pages_checked: pages.map((page) => page.finalUrl || page.url)
    };
  }
}

function candidateDedupeKeys(candidate = {}) {
  const keys = [];
  const cui = safeText(candidate.cui).toUpperCase();
  const domain = websiteDomain(candidate.website);
  const email = normalizeEmail(candidate.primary_email || candidate.email);
  const phone = normalizePhone(candidate.primary_phone || candidate.phone, candidate.country);
  const name = normalizeKey(candidate.commercial_name || candidate.name);
  const city = normalizeKey(candidate.city);
  if (cui) keys.push(`cui:${cui}`);
  if (domain) keys.push(`domain:${domain}`);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  if (name && city) keys.push(`name_city:${name}|${city}`);
  if (!keys.length && name) keys.push(`name:${name}`);
  return keys;
}

function dedupeHashFor(candidate = {}) {
  const keys = candidateDedupeKeys(candidate);
  return sha256(keys[0] || `${candidate.source_key || "lead"}:${candidate.external_id || candidate.commercial_name || nowIso()}`);
}

function findDuplicateCompany(db, companyId, candidate = {}) {
  const dedupeHash = dedupeHashFor(candidate);
  const exact = db.prepare("SELECT * FROM lead_companies WHERE company_id=? AND dedupe_hash=?").get(Number(companyId || 0), dedupeHash);
  if (exact) return { company: exact, matchType: "dedupe_hash", confidence: 100 };

  const rows = db.prepare(`
    SELECT *
    FROM lead_companies
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 5000
  `).all(Number(companyId || 0));
  const candidateKeys = new Set(candidateDedupeKeys(candidate));
  for (const row of rows) {
    const rowKeys = candidateDedupeKeys({
      cui: row.cui,
      website: row.website,
      primary_email: row.primary_email,
      primary_phone: row.primary_phone,
      commercial_name: row.commercial_name,
      city: row.city,
      country: row.country
    });
    for (const key of rowKeys) {
      if (candidateKeys.has(key)) {
        const type = key.split(":")[0];
        return { company: row, matchType: type, confidence: type === "name_city" ? 82 : 96 };
      }
    }
  }
  return null;
}

function choosePrimaryEmail(emailRows = []) {
  const rows = emailRows
    .filter((row) => isCollectableEmail(row.email))
    .map((row) => ({
      ...row,
      email: normalizeEmail(row.email),
      email_type: row.email_type || classifyEmail(row.email),
      priority: EMAIL_ROLE_PRIORITY[row.email_type || classifyEmail(row.email)] || 9
    }))
    .sort((a, b) => a.priority - b.priority || String(a.email).localeCompare(String(b.email)));
  return rows[0] || null;
}

async function normalizeCandidateContacts(candidate = {}, search = {}) {
  const country = candidate.country || search.country || DEFAULT_COUNTRY;
  const emailCandidates = [];
  if (candidate.email) emailCandidates.push({ email: candidate.email, source: candidate.source_key, source_url: candidate.source_url });
  for (const email of candidate.extracted_emails || []) {
    emailCandidates.push({ email, source: "public_website", source_url: candidate.website_final_url || candidate.website });
  }
  const uniqueEmails = [];
  const seenEmails = new Set();
  for (const row of emailCandidates) {
    const email = normalizeEmail(row.email);
    if (!email || seenEmails.has(email) || !isCollectableEmail(email)) continue;
    seenEmails.add(email);
    const validation = await validateEmail(email);
    uniqueEmails.push({ ...row, ...validation, email_type: validation.role });
  }

  const phoneCandidates = [];
  if (candidate.phone) phoneCandidates.push({ phone_original: candidate.phone, source: candidate.source_key, source_url: candidate.source_url });
  for (const phone of candidate.extracted_phones || []) {
    phoneCandidates.push({ phone_original: phone, source: "public_website", source_url: candidate.website_final_url || candidate.website });
  }
  const uniquePhones = [];
  const seenPhones = new Set();
  for (const row of phoneCandidates) {
    const normalized = normalizePhone(row.phone_original, country);
    if (!normalized || seenPhones.has(normalized)) continue;
    seenPhones.add(normalized);
    uniquePhones.push({ ...row, phone_normalized: normalized, phone_type: phoneKind(normalized) });
  }

  const primaryEmail = choosePrimaryEmail(uniqueEmails);
  const primaryPhone = uniquePhones[0] || null;
  return { emails: uniqueEmails, phones: uniquePhones, primaryEmail, primaryPhone };
}

function crmExistingLead(db, companyId, candidate = {}) {
  if (!tableExists(db, "crm_leads")) return null;
  const email = normalizeEmail(candidate.primary_email || candidate.email);
  const phone = normalizePhone(candidate.primary_phone || candidate.phone, candidate.country);
  const name = normalizeKey(candidate.commercial_name || candidate.name);
  const rows = db.prepare(`
    SELECT id, name, company_name, email, phone
    FROM crm_leads
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 5000
  `).all(Number(companyId || 0));
  return rows.find((row) => (
    (email && normalizeEmail(row.email) === email) ||
    (phone && normalizePhone(row.phone) === phone) ||
    (name && normalizeKey(row.company_name || row.name) === name)
  )) || null;
}

function emarqetExistingPartner(db, companyId, candidate = {}) {
  const tables = ["emarqet_outbound_leads", "emarqet_partner_profiles", "emarqet_leads"];
  if (!tables.some((table) => tableExists(db, table))) return null;
  const email = normalizeEmail(candidate.primary_email || candidate.email);
  const phone = normalizePhone(candidate.primary_phone || candidate.phone, candidate.country);
  const name = normalizeKey(candidate.commercial_name || candidate.name);
  if (tableExists(db, "emarqet_outbound_leads")) {
    const rows = db.prepare(`
      SELECT id, company_name, email, phone
      FROM emarqet_outbound_leads
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 5000
    `).all(Number(companyId || 0));
    const found = rows.find((row) => (
      (email && normalizeEmail(row.email) === email) ||
      (phone && normalizePhone(row.phone) === phone) ||
      (name && normalizeKey(row.company_name) === name)
    ));
    if (found) return { table: "emarqet_outbound_leads", id: found.id };
  }
  return null;
}

function scoreLeadCandidate(candidate = {}, contacts = {}, duplicate = null, search = {}, config = DEFAULT_SCORE_CONFIG) {
  let score = 0;
  const rules = [];
  const add = (key, points, ok) => {
    if (!ok) return;
    score += Number(points || 0);
    rules.push({ key, points });
  };
  const primaryEmail = contacts.primaryEmail;
  const primaryPhone = contacts.primaryPhone;
  add("email_valid", config.email_valid_points, primaryEmail && ["valid", "probabil_valid"].includes(primaryEmail.status));
  add("phone_valid", config.phone_valid_points, Boolean(primaryPhone?.phone_normalized));
  add("website_active", config.website_active_points, candidate.website && candidate.website_status !== "indisponibil" && candidate.website_status !== "blocat_robots");
  add("catalog_online", config.catalog_online_points, Number(candidate.has_online_catalog || 0) === 1);
  add("items_over_20", config.items_over_20_points, Number(candidate.estimated_items_count || 0) >= 20);
  add("active_social", config.active_social_points, Boolean(candidate.facebook_url || candidate.instagram_url || candidate.linkedin_url));
  add("contact_person", config.contact_person_points, Boolean(candidate.contact_person));
  add("exact_campaign_fit", config.exact_campaign_fit_points, normalizeCategory(candidate.category) === normalizeCategory(search.category));
  add("website_unavailable", config.website_unavailable_penalty, candidate.website && candidate.website_status === "indisponibil");
  add("duplicate", config.duplicate_penalty, Boolean(duplicate));
  add("inactive_company", config.inactive_company_penalty, normalizeKey(candidate.public_status).includes("inactiv"));
  add("missing_contact", config.missing_contact_penalty, !primaryEmail && !primaryPhone);
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return { score: finalScore, category: scoreCategory(finalScore), rules };
}

function buildLocalInsight(candidate = {}, lead = {}, contacts = {}) {
  const cityCounty = [candidate.city, candidate.county].filter(Boolean).join(", ");
  const stock = Number(candidate.estimated_items_count || 0);
  const channels = [
    candidate.website ? "website" : "",
    candidate.facebook_url ? "Facebook" : "",
    candidate.instagram_url ? "Instagram" : "",
    candidate.linkedin_url ? "LinkedIn" : ""
  ].filter(Boolean).join(", ") || "canale neconfirmate";
  const contactMethod = contacts.primaryEmail?.email
    ? `email (${contacts.primaryEmail.email})`
    : contacts.primaryPhone?.phone_normalized
      ? `telefon (${contacts.primaryPhone.phone_normalized})`
      : "verificare manuala";
  const relevance = normalizeCategory(candidate.category) === "auto_dealers"
    ? "Poate fi relevant pentru E-MARQET deoarece poate aduce anunturi auto si un stoc publicat centralizat."
    : "Poate fi relevant pentru serviciile Nexora daca exista interes pentru prezenta online, CRM sau automatizari.";
  const stockLine = stock
    ? `Am identificat un indiciu de aproximativ ${stock} produse sau anunturi.`
    : "Nu am gasit inca un volum public clar de produse sau anunturi.";
  return {
    provider: "local_fallback",
    model: "rules",
    analysis_text: [
      `${candidate.commercial_name || lead.title} este incadrat la ${CATEGORY_PRESETS[normalizeCategory(candidate.category)]?.label || candidate.category || "lead B2B"}.`,
      cityCounty ? `Zona: ${cityCounty}.` : "",
      candidate.website ? `Website verificat: ${candidate.website}.` : "Website neconfirmat.",
      `Canale online: ${channels}.`,
      stockLine,
      relevance
    ].filter(Boolean).join("\n"),
    recommendation_text: [
      normalizeCategory(candidate.category) === "auto_dealers"
        ? "Propunere recomandata: import gratuit al stocului auto, promovare gratuita in perioada de lansare si cont Partener Fondator pentru parcuri auto si auto rulate."
        : "Propunere recomandata: audit rapid al prezentei online, CRM pentru follow-up si automatizari de vanzari.",
      `Metoda recomandata de contact: ${contactMethod}.`
    ].join("\n"),
    best_contact_method: contactMethod
  };
}

async function maybeOpenAiInsight(candidate = {}, lead = {}, contacts = {}) {
  const apiKey = safeText(process.env.LEAD_AI_API_KEY || process.env.OPENAI_API_KEY);
  if (!apiKey || typeof fetch !== "function") return null;
  const model = safeText(process.env.OPENAI_MODEL || process.env.NEXORA_OPENAI_MODEL) || "gpt-4o-mini";
  const payload = {
    company: candidate.commercial_name,
    category: candidate.category,
    city: candidate.city,
    county: candidate.county,
    website: candidate.website,
    email: contacts.primaryEmail?.email || "",
    phone: contacts.primaryPhone?.phone_normalized || "",
    estimated_items_count: candidate.estimated_items_count || 0,
    channels: {
      facebook: candidate.facebook_url || "",
      instagram: candidate.instagram_url || "",
      linkedin: candidate.linkedin_url || ""
    },
    score: lead.score
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Genereaza analiza de lead in romana, factual, fara sa inventezi informatii. Foloseste doar datele JSON primite. Returneaza JSON cu analysis_text, recommendation_text, best_contact_method."
        },
        { role: "user", content: JSON.stringify(payload) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  const text = safeText(data?.choices?.[0]?.message?.content);
  if (!text) return null;
  const parsed = parseJson(text, {});
  return {
    provider: "openai",
    model,
    analysis_text: safeText(parsed.analysis_text),
    recommendation_text: safeText(parsed.recommendation_text),
    best_contact_method: safeText(parsed.best_contact_method)
  };
}

function messageDrafts(candidate = {}, lead = {}, insight = {}) {
  const name = candidate.commercial_name || lead.title || "compania dumneavoastra";
  const city = candidate.city || "zona dumneavoastra";
  const officeEmail = emarqetOfficeEmail();
  const supportEmail = emarqetSupportEmail();
  const stock = Number(candidate.estimated_items_count || 0);
  const stockText = stock ? ` Am observat si indicii publice ca aveti aproximativ ${stock} autoturisme/anunturi publice.` : "";
  const websiteText = candidate.website ? ` Am vazut si website-ul ${candidate.website}.` : "";
  const sourceLine = `${stockText}${websiteText}`.trim();
  const subject = `Propunere colaborare E-MARQET - ${name}`;
  const shortEmail = [
    "Buna ziua,",
    "",
    `Va scriem din partea E-MARQET pentru ca vrem sa construim o colaborare cu parcuri auto si dealeri de autorulate din Prahova, iar ${name} din ${city} pare potrivit pentru prima etapa.${sourceLine ? ` ${sourceLine}` : ""}`,
    "",
    "Ideea este simpla: daca sunteti de acord, noi va ajutam sa publicati stocul pe E-MARQET fara sa introduceti manual anunturile. Putem prelua masinile din site-ul dumneavoastra, dintr-un CSV/XML/feed sau dintr-o varianta pe care o aveti deja.",
    "",
    "In perioada de lansare oferim gratuit importul initial, publicarea anunturilor si suportul de configurare. Nu percepem comision la vanzare, iar dealerii care intra primii primesc statut de Dealer Fondator si promovare initiala.",
    "",
    "Ne-ar placea sa vedem daca putem colabora. Putem discuta cateva minute sau ne puteti trimite linkul paginii de stoc, iar noi va spunem concret cum putem prelua anunturile.",
    "",
    `Ne puteti raspunde direct la acest email. Pentru parteneriate: ${officeEmail}. Pentru suport, importuri sau tichete tehnice: ${supportEmail}.`,
    "",
    "Cu respect,",
    "Echipa E-MARQET",
    officeEmail,
    supportEmail
  ].join("\n");
  const detailedEmail = [
    shortEmail,
    "",
    "Cum propunem sa lucram:",
    "1. Ne confirmati ca sunteti de acord sa preluam anunturile si pozele de pe site/feed.",
    "2. Facem noi importul initial in E-MARQET si pastram legatura cu sursa anuntului.",
    "3. Va trimitem listarea la verificare, ca sa aprobati ce apare public.",
    "4. Dupa publicare, putem actualiza periodic stocul: masini noi, preturi schimbate, masini vandute.",
    "",
    "Nu va cerem acces in WordPress pentru inceput. Daca aveti export CSV/XML sau un feed, il folosim. Daca nu, putem lucra cu paginile publice ale site-ului, pe baza acordului dumneavoastra.",
    "",
    insight.recommendation_text || ""
  ].filter(Boolean).join("\n");
  return [
    { message_type: "email_initial", channel: "email", subject, body: shortEmail },
    { message_type: "email_short", channel: "email", subject, body: shortEmail },
    { message_type: "email_detailed", channel: "email", subject, body: detailedEmail },
    { message_type: "whatsapp", channel: "whatsapp", subject: "", body: `Buna ziua! Va scriem din partea E-MARQET. Vrem sa colaboram cu ${name} pentru publicarea stocului auto fara introducere manuala: noi putem prelua anunturile din site/feed/CSV, cu acordul dumneavoastra. Importul initial si publicarea sunt gratuite in lansare, fara comision la vanzare.` },
    { message_type: "facebook", channel: "facebook", subject: "", body: `Buna ziua! E-MARQET cauta parcuri auto partenere pentru etapa de lansare. Ne-ar placea sa colaboram cu ${name}: importam noi stocul din site/feed/CSV, publicam gratuit in lansare si va oferim statut de Dealer Fondator.` },
    { message_type: "messenger", channel: "messenger", subject: "", body: `Buna ziua! Vrem sa colaboram cu ${name} in E-MARQET. Putem prelua noi stocul auto din site/feed/CSV, cu acordul dumneavoastra, si il publicam gratuit in perioada de lansare.` },
    { message_type: "call_script", channel: "phone", subject: "Scenariu apel", body: `Salutati, confirmati ca discutati cu ${name}, apoi propuneti colaborarea: E-MARQET poate prelua stocul auto din website/feed/CSV, cu acordul dealerului, fara introducere manuala. Explicati ca importul initial, publicarea in lansare si configurarea sunt gratuite, fara comision la vanzare. Intrebati care este metoda potrivita: site public, CSV/XML/feed sau trimitere manuala asistata. Nu mentionati un numar de masini daca nu este confirmat public.` },
    { message_type: "followup_3_days", channel: "email", subject: `Revenire colaborare E-MARQET - ${name}`, body: `Buna ziua,\n\nRevin cu propunerea de colaborare E-MARQET pentru parcuri auto si dealeri de autorulate.\n\nDaca sunteti deschisi, putem face noi partea grea: preluam stocul din website/feed/CSV, pregatim anunturile si vi le trimitem la verificare inainte de publicare. Importul initial si publicarea sunt gratuite in etapa de lansare, fara comision la vanzare.\n\nPutem porni cu un test pe cateva anunturi, ca sa vedeti cum arata.\n\nParteneriate: ${officeEmail}\nSuport/importuri/tichete: ${supportEmail}\n\nCu respect,\nEchipa E-MARQET` },
    { message_type: "followup_7_days", channel: "email", subject: `Mai lasam propunerea de colaborare E-MARQET`, body: `Buna ziua,\n\nMai las aici propunerea noastra de colaborare: E-MARQET poate publica stocul dumneavoastra auto fara introducere manuala, pe baza acordului si a sursei pe care o preferati: website, CSV, XML, feed sau import asistat.\n\nNu dorim sa va mutam munca in alta parte, ci sa va aducem un canal suplimentar de vizibilitate pentru anunturi.\n\nDaca nu este momentul potrivit, ne spuneti si nu va mai deranjam.\n\nParteneriate: ${officeEmail}\nSuport/importuri/tichete: ${supportEmail}\n\nCu respect,\nEchipa E-MARQET` },
    { message_type: "followup_30_days", channel: "email", subject: `Reluam discutia E-MARQET - ${name}`, body: `Buna ziua,\n\nRevenim dupa perioada initiala de lansare E-MARQET. In continuare cautam dealeri auto cu care sa colaboram pentru publicarea stocului, fara lucru manual din partea lor.\n\nDaca doriti, putem face un test gratuit: preluam cateva anunturi din site/feed/CSV, le pregatim in E-MARQET si vi le aratam inainte de publicare.\n\nParteneriate: ${officeEmail}\nSuport/importuri/tichete: ${supportEmail}\n\nCu respect,\nEchipa E-MARQET` }
  ];
}

function sparsePatch(existing = {}, next = {}, fields = []) {
  const patch = {};
  for (const field of fields) {
    const current = existing[field];
    const value = next[field];
    if ((current == null || current === "" || current === 0) && value != null && value !== "" && value !== 0) {
      patch[field] = value;
    }
  }
  return patch;
}

function updateLeadCompanyMissingFields(db, companyId, companyIdRow, patch = {}) {
  const entries = Object.entries(patch).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return;
  const sets = entries.map(([field]) => `${field}=?`).join(", ");
  db.prepare(`
    UPDATE lead_companies
    SET ${sets}, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(...entries.map(([, value]) => value), Number(companyIdRow || 0), Number(companyId || 0));
}

async function persistCandidate(db, companyId, search = {}, candidate = {}, actorEmail = "system") {
  const websiteAdapter = new PublicWebsiteLeadSourceAdapter();
  const shouldEnrichWebsite = Number(search.collect_website || 0) === 1 && candidate.website && selectedSourceKeys(search).includes("public_website");
  let enriched = candidate;
  if (shouldEnrichWebsite) {
    enriched = await websiteAdapter.fetchCompany(candidate, search);
  }
  const contacts = await normalizeCandidateContacts(enriched, search);
  enriched.primary_email = contacts.primaryEmail?.email || "";
  enriched.primary_phone = contacts.primaryPhone?.phone_normalized || "";
  enriched.website = normalizeWebsite(enriched.website);
  enriched.has_website = enriched.website ? 1 : 0;
  enriched.has_facebook = enriched.facebook_url ? 1 : 0;
  enriched.has_instagram = enriched.instagram_url ? 1 : 0;
  enriched.verification_status = contacts.primaryEmail || contacts.primaryPhone || enriched.website_status === "activ" ? "verificat_partial" : "neverificat";

  const crmExisting = Number(search.check_existing_crm || 0) === 1 ? crmExistingLead(db, companyId, enriched) : null;
  const emarqetExisting = Number(search.check_existing_emarqet || 0) === 1 ? emarqetExistingPartner(db, companyId, enriched) : null;
  const duplicate = findDuplicateCompany(db, companyId, enriched);
  const score = scoreLeadCandidate(enriched, contacts, duplicate, search, loadLeadScoreConfig(db, companyId));
  const dedupeHash = dedupeHashFor(enriched);
  const companyFields = {
    commercial_name: safeText(enriched.commercial_name || enriched.name),
    legal_name: safeText(enriched.legal_name),
    cui: safeText(enriched.cui).toUpperCase(),
    registration_number: safeText(enriched.registration_number),
    activity_domain: safeText(enriched.activity_domain || search.activity_domain),
    category: normalizeCategory(enriched.category || search.category),
    description: safeText(enriched.description),
    public_status: safeText(enriched.public_status),
    country: safeText(enriched.country || search.country || DEFAULT_COUNTRY),
    county: safeText(enriched.county || search.county),
    city: safeText(enriched.city),
    address: safeText(enriched.address),
    postal_code: safeText(enriched.postal_code),
    latitude: enriched.latitude ?? null,
    longitude: enriched.longitude ?? null,
    map_url: safeText(enriched.map_url),
    primary_email: contacts.primaryEmail?.email || "",
    sales_email: contacts.emails.find((row) => row.email_type === "vanzari")?.email || "",
    marketing_email: contacts.emails.find((row) => row.email_type === "marketing")?.email || "",
    support_email: contacts.emails.find((row) => row.email_type === "suport")?.email || "",
    primary_phone: contacts.primaryPhone?.phone_normalized || "",
    secondary_phone: contacts.phones[1]?.phone_normalized || "",
    whatsapp_phone: contacts.phones.find((row) => row.phone_type === "mobil")?.phone_normalized || "",
    contact_person: safeText(enriched.contact_person),
    contact_position: safeText(enriched.contact_position),
    contact_form_url: safeText(enriched.contact_form_url),
    website: normalizeWebsite(enriched.website),
    facebook_url: safeText(enriched.facebook_url),
    instagram_url: safeText(enriched.instagram_url),
    linkedin_url: safeText(enriched.linkedin_url),
    tiktok_url: safeText(enriched.tiktok_url),
    youtube_url: safeText(enriched.youtube_url),
    has_website: enriched.website ? 1 : 0,
    has_online_store: Number(enriched.has_online_store || 0),
    has_facebook: enriched.facebook_url ? 1 : 0,
    has_instagram: enriched.instagram_url ? 1 : 0,
    has_google_business: Number(enriched.has_google_business || 0),
    publishes_auto_ads: Number(enriched.publishes_auto_ads || 0),
    has_online_catalog: Number(enriched.has_online_catalog || 0),
    estimated_items_count: Number(enriched.estimated_items_count || 0),
    external_platforms_json: json(enriched.external_platforms || []),
    offers_financing: Number(enriched.offers_financing || 0),
    offers_warranty: Number(enriched.offers_warranty || 0),
    offers_delivery: Number(enriched.offers_delivery || 0),
    offers_buyback: Number(enriched.offers_buyback || 0),
    offers_leasing: Number(enriched.offers_leasing || 0),
    main_source: safeText(enriched.source_key),
    source_url: safeText(enriched.source_url),
    google_place_id: safeText(enriched.google_place_id),
    google_name: safeText(enriched.google_name),
    google_phone: safeText(enriched.google_phone),
    google_website: normalizeWebsite(enriched.google_website),
    google_address: safeText(enriched.google_address),
    google_locality: safeText(enriched.google_locality),
    google_category: safeText(enriched.google_category),
    google_rating: Number(enriched.google_rating || 0) || null,
    google_review_count: Number(enriched.google_review_count || 0),
    google_business_status: safeText(enriched.google_business_status),
    google_maps_uri: safeText(enriched.google_maps_uri),
    google_match_score: clampNumber(enriched.google_match_score || enriched.google_fit_score, 0, 0, 100),
    google_match_status: safeText(enriched.google_match_status || (enriched.google_place_id ? "google_discovery" : "")),
    google_last_checked_at: enriched.google_place_id ? nowIso() : "",
    last_checked_at: nowIso(),
    verification_status: enriched.verification_status,
    confidence_score: score.score,
    notes: [crmExisting ? `Exista deja in CRM lead #${crmExisting.id}.` : "", emarqetExisting ? `Exista deja in E-MARQET (${emarqetExisting.table} #${emarqetExisting.id}).` : ""].filter(Boolean).join(" "),
    dedupe_hash: dedupeHash,
    crm_lead_id: crmExisting?.id || null,
    emarqet_partner_id: emarqetExisting?.id || null
  };

  let leadCompanyId = duplicate?.company?.id || 0;
  let insertedCompany = false;
  const tx = db.transaction(() => {
    if (!leadCompanyId) {
      const result = db.prepare(`
        INSERT INTO lead_companies (
          company_id, commercial_name, legal_name, cui, registration_number, activity_domain, category,
          description, public_status, country, county, city, address, postal_code, latitude, longitude,
          map_url, primary_email, sales_email, marketing_email, support_email, primary_phone, secondary_phone,
          whatsapp_phone, contact_person, contact_position, contact_form_url, website, facebook_url,
          instagram_url, linkedin_url, tiktok_url, youtube_url, has_website, has_online_store, has_facebook,
          has_instagram, has_google_business, publishes_auto_ads, has_online_catalog, estimated_items_count,
          external_platforms_json, offers_financing, offers_warranty, offers_delivery, offers_buyback,
          offers_leasing, main_source, source_url, google_place_id, google_name, google_phone,
          google_website, google_address, google_locality, google_category, google_rating,
          google_review_count, google_business_status, google_maps_uri, google_match_score,
          google_match_status, google_last_checked_at, last_checked_at, verification_status, confidence_score,
          notes, dedupe_hash, crm_lead_id, emarqet_partner_id
        ) VALUES (
          @company_id, @commercial_name, @legal_name, @cui, @registration_number, @activity_domain, @category,
          @description, @public_status, @country, @county, @city, @address, @postal_code, @latitude, @longitude,
          @map_url, @primary_email, @sales_email, @marketing_email, @support_email, @primary_phone, @secondary_phone,
          @whatsapp_phone, @contact_person, @contact_position, @contact_form_url, @website, @facebook_url,
          @instagram_url, @linkedin_url, @tiktok_url, @youtube_url, @has_website, @has_online_store, @has_facebook,
          @has_instagram, @has_google_business, @publishes_auto_ads, @has_online_catalog, @estimated_items_count,
          @external_platforms_json, @offers_financing, @offers_warranty, @offers_delivery, @offers_buyback,
          @offers_leasing, @main_source, @source_url, @google_place_id, @google_name, @google_phone,
          @google_website, @google_address, @google_locality, @google_category, @google_rating,
          @google_review_count, @google_business_status, @google_maps_uri, @google_match_score,
          @google_match_status, @google_last_checked_at, @last_checked_at, @verification_status, @confidence_score,
          @notes, @dedupe_hash, @crm_lead_id, @emarqet_partner_id
        )
      `).run({ ...companyFields, company_id: Number(companyId || 0) });
      leadCompanyId = Number(result.lastInsertRowid || 0);
      insertedCompany = true;
    } else {
      const patch = sparsePatch(duplicate.company, companyFields, Object.keys(companyFields).filter((field) => field !== "dedupe_hash"));
      updateLeadCompanyMissingFields(db, companyId, leadCompanyId, patch);
    }

    const existingLead = db.prepare(`
      SELECT *
      FROM leads
      WHERE company_id=? AND campaign_id IS ? AND lead_company_id=?
      LIMIT 1
    `).get(Number(companyId || 0), search.campaign_id || null, leadCompanyId);
    let leadId = Number(existingLead?.id || 0);
    if (!leadId) {
      const result = db.prepare(`
        INSERT INTO leads (
          company_id, campaign_id, search_id, lead_company_id, title, stage, status, priority,
          score, score_category, is_duplicate, contact_ready, created_by_email, crm_lead_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(companyId || 0),
        search.campaign_id || null,
        search.id || null,
        leadCompanyId,
        companyFields.commercial_name,
        score.score >= 60 ? "prioritar" : "verificat",
        "nou",
        score.score >= 80 ? "foarte_mare" : score.score >= 60 ? "mare" : score.score >= 40 ? "medie" : "mica",
        score.score,
        score.category,
        duplicate ? 1 : 0,
        contacts.primaryEmail || contacts.primaryPhone ? 1 : 0,
        safeText(actorEmail),
        crmExisting?.id || null
      );
      leadId = Number(result.lastInsertRowid || 0);
      db.prepare(`
        INSERT INTO lead_status_history (company_id, lead_id, status_to, changed_by_email, note)
        VALUES (?, ?, 'nou', ?, 'Lead creat din Lead Builder')
      `).run(Number(companyId || 0), leadId, safeText(actorEmail));
    } else {
      db.prepare(`
        UPDATE leads
        SET search_id=?, score=?, score_category=?, is_duplicate=?,
            contact_ready=?, crm_lead_id=COALESCE(crm_lead_id, ?), updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(
        search.id || null,
        score.score,
        score.category,
        duplicate ? 1 : 0,
        contacts.primaryEmail || contacts.primaryPhone ? 1 : 0,
        crmExisting?.id || null,
        leadId,
        Number(companyId || 0)
      );
    }

    db.prepare(`
      INSERT OR IGNORE INTO lead_source_records (
        company_id, lead_company_id, lead_id, source_key, source_url, external_id, raw_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(companyId || 0),
      leadCompanyId,
      leadId,
      safeText(enriched.source_key || "unknown"),
      safeText(enriched.source_url),
      safeText(enriched.external_id || `${enriched.source_key}:${leadCompanyId}`),
      json(enriched.raw_payload || enriched)
    );

    if (enriched.google_place_id) {
      upsertLeadGooglePlaceMatch(db, companyId, {
        leadId,
        leadCompanyId,
        place: enriched,
        score: enriched.google_match_score || score.score,
        status: enriched.google_match_status || "google_discovery",
        query: enriched.raw_payload?.google_query || ""
      });
    }

    for (const email of contacts.emails) {
      db.prepare(`
        INSERT INTO lead_emails (
          company_id, lead_company_id, email, email_type, validation_status,
          validation_reason, is_primary, source, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, lead_company_id, email)
        DO UPDATE SET validation_status=excluded.validation_status, validation_reason=excluded.validation_reason,
          email_type=excluded.email_type, is_primary=max(lead_emails.is_primary, excluded.is_primary),
          updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        leadCompanyId,
        email.email,
        email.email_type,
        email.status,
        email.reason,
        contacts.primaryEmail?.email === email.email ? 1 : 0,
        safeText(email.source),
        safeText(email.source_url)
      );
    }

    for (const phone of contacts.phones) {
      db.prepare(`
        INSERT INTO lead_phones (
          company_id, lead_company_id, phone_original, phone_normalized, phone_type, is_primary, source, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, lead_company_id, phone_normalized)
        DO UPDATE SET phone_type=excluded.phone_type, is_primary=max(lead_phones.is_primary, excluded.is_primary), updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        leadCompanyId,
        safeText(phone.phone_original),
        phone.phone_normalized,
        phone.phone_type,
        contacts.primaryPhone?.phone_normalized === phone.phone_normalized ? 1 : 0,
        safeText(phone.source),
        safeText(phone.source_url)
      );
    }

    if (companyFields.address || companyFields.city || companyFields.latitude) {
      db.prepare(`
        INSERT INTO lead_addresses (
          company_id, lead_company_id, country, county, city, address, postal_code, latitude, longitude, map_url, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(companyId || 0),
        leadCompanyId,
        companyFields.country,
        companyFields.county,
        companyFields.city,
        companyFields.address,
        companyFields.postal_code,
        companyFields.latitude,
        companyFields.longitude,
        companyFields.map_url,
        companyFields.main_source
      );
    }

    const socials = [
      ["facebook", companyFields.facebook_url],
      ["instagram", companyFields.instagram_url],
      ["linkedin", companyFields.linkedin_url],
      ["tiktok", companyFields.tiktok_url],
      ["youtube", companyFields.youtube_url]
    ];
    for (const [platform, url] of socials) {
      if (!url) continue;
      db.prepare(`
        INSERT OR IGNORE INTO lead_social_profiles (company_id, lead_company_id, platform, url, source)
        VALUES (?, ?, ?, ?, ?)
      `).run(Number(companyId || 0), leadCompanyId, platform, url, safeText(enriched.source_key));
    }

    if (companyFields.website) {
      db.prepare(`
        INSERT INTO lead_websites (
          company_id, lead_company_id, url, domain, http_status, https_enabled,
          redirect_url, availability_status, is_parked, source, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, lead_company_id, url)
        DO UPDATE SET http_status=excluded.http_status, redirect_url=excluded.redirect_url,
          availability_status=excluded.availability_status, is_parked=excluded.is_parked,
          checked_at=excluded.checked_at, updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        leadCompanyId,
        companyFields.website,
        websiteDomain(companyFields.website),
        Number(enriched.website_http_status || 0),
        companyFields.website.startsWith("https://") ? 1 : 0,
        safeText(enriched.website_final_url),
        safeText(enriched.website_status || "neverificat"),
        Number(enriched.website_is_parked || 0),
        "public_website",
        nowIso()
      );
    }

    db.prepare(`
      INSERT INTO lead_scores (company_id, lead_id, score, category, rules_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(Number(companyId || 0), leadId, score.score, score.category, json(score.rules));

    if (duplicate) {
      const duplicateLead = db.prepare(`
        SELECT id
        FROM leads
        WHERE company_id=? AND lead_company_id=?
        ORDER BY id ASC
        LIMIT 1
      `).get(Number(companyId || 0), duplicate.company.id);
      db.prepare(`
        INSERT INTO lead_duplicates (
          company_id, lead_id, duplicate_lead_id, duplicate_company_id, match_type, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(Number(companyId || 0), leadId, duplicateLead?.id || null, duplicate.company.id, duplicate.matchType, duplicate.confidence);
    }

    db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, ?, 'collect', ?, ?, ?)
    `).run(
      Number(companyId || 0),
      leadId,
      leadCompanyId,
      insertedCompany ? "Lead colectat" : "Lead actualizat",
      safeText(enriched.source_url),
      safeText(actorEmail)
    );
  });
  tx();

  const lead = db.prepare("SELECT * FROM leads WHERE company_id=? AND lead_company_id=? ORDER BY id DESC LIMIT 1").get(Number(companyId || 0), leadCompanyId);
  let insight = buildLocalInsight(enriched, lead, contacts);
  try {
    insight = await maybeOpenAiInsight(enriched, lead, contacts) || insight;
  } catch {
    // Keep the deterministic fallback.
  }
  db.prepare(`
    INSERT INTO lead_insights (
      company_id, lead_id, provider, model, analysis_text, recommendation_text, best_contact_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(companyId || 0),
    lead.id,
    insight.provider,
    insight.model,
    insight.analysis_text,
    insight.recommendation_text,
    insight.best_contact_method
  );

  for (const draft of messageDrafts(enriched, lead, insight)) {
    db.prepare(`
      INSERT INTO lead_messages (
        company_id, lead_id, message_type, channel, subject, body, status,
        template_key, generated_by, created_by_email, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, datetime('now'))
      ON CONFLICT(company_id, lead_id, message_type)
      DO UPDATE SET subject=excluded.subject, body=excluded.body, generated_by=excluded.generated_by, updated_at=datetime('now')
    `).run(
      Number(companyId || 0),
      lead.id,
      draft.message_type,
      draft.channel,
      draft.subject,
      draft.body,
      "auto_dealer_founder",
      insight.provider,
      safeText(actorEmail)
    );
  }

  if (Number(search.auto_sync_crm || 0) === 1 && !lead.crm_lead_id) {
    syncLeadToCrm(db, companyId, lead.id, actorEmail, { createOpportunity: false });
  }

  return {
    leadId: lead.id,
    leadCompanyId,
    duplicate: Boolean(duplicate),
    score: lead.score
  };
}

export async function runLeadBuilderJob(db, jobId = 0, options = {}) {
  ensureLeadBuilderSchema(db);
  const job = db.prepare("SELECT * FROM lead_jobs WHERE id=?").get(Number(jobId || 0));
  if (!job) return { ok: false, error: "missing_job" };
  if (["running"].includes(String(job.status || ""))) return { ok: false, error: "job_running" };
  const companyId = Number(job.company_id || 0);
  const search = db.prepare("SELECT * FROM lead_searches WHERE id=? AND company_id=?").get(Number(job.search_id || 0), companyId);
  if (!search) return { ok: false, error: "missing_search" };

  db.prepare(`
    UPDATE lead_jobs
    SET status='running', progress=1, started_at=datetime('now'), updated_at=datetime('now'), error_reason=NULL
    WHERE id=? AND company_id=?
  `).run(job.id, companyId);
  db.prepare(`
    UPDATE lead_searches
    SET status='running', progress=1, started_at=COALESCE(started_at, datetime('now')), updated_at=datetime('now'), last_error=NULL
    WHERE id=? AND company_id=?
  `).run(search.id, companyId);
  recordJobLog(db, companyId, job.id, "info", "Job pornit.", { search_id: search.id, job_type: job.job_type });

  let candidates = [];
  let processed = 0;
  let success = 0;
  let failed = 0;
  let duplicates = 0;
  try {
    const sources = loadActiveSources(db, companyId, search);
    if (!sources.length) throw new Error("Nu exista surse active pentru cautare.");
    const seenCandidates = new Set();
    const appendCandidates = (rows = []) => {
      for (const candidate of rows) {
        const key = candidate.google_place_id
          ? `google:${candidate.google_place_id}`
          : `${candidate.source_key || "source"}:${candidate.external_id || ""}`;
        const nameCityKey = `${normalizeKey(candidate.commercial_name || candidate.name)}|${normalizeKey(candidate.city)}`;
        const domainKey = candidate.website ? `domain:${websiteDomain(candidate.website)}` : "";
        if ((key && seenCandidates.has(key)) || seenCandidates.has(nameCityKey) || (domainKey && seenCandidates.has(domainKey))) continue;
        if (key) seenCandidates.add(key);
        if (domainKey) seenCandidates.add(domainKey);
        seenCandidates.add(nameCityKey);
        candidates.push(candidate);
      }
    };
    const hasGoogle = sources.some((source) => source.source_key === "google_places");
    if (hasGoogle) {
      const adapter = new GooglePlacesLeadSourceAdapter(db, companyId);
      const googleCandidates = await adapter.search(search, {
        onLog: (level, message, details) => recordJobLog(db, companyId, job.id, level, message, details)
      });
      appendCandidates(googleCandidates);
      recordJobLog(db, companyId, job.id, "info", "Google Places a returnat candidati.", { count: googleCandidates.length });
    }
    const hasOsm = sources.some((source) => source.source_key === "openstreetmap");
    if (hasOsm) {
      const adapter = new OpenStreetMapLeadSourceAdapter();
      const osmCandidates = await adapter.search(search, {
        onLog: (level, message, details) => recordJobLog(db, companyId, job.id, level, message, details)
      });
      appendCandidates(osmCandidates);
      recordJobLog(db, companyId, job.id, "info", "OpenStreetMap a returnat candidati.", { count: osmCandidates.length });
    }
    const maxResults = Math.min(Number(search.max_results || 500), candidates.length);
    for (const candidate of candidates.slice(0, maxResults)) {
      const stop = db.prepare("SELECT stop_requested FROM lead_jobs WHERE id=? AND company_id=?").get(job.id, companyId);
      if (Number(stop?.stop_requested || 0) === 1) {
        recordJobLog(db, companyId, job.id, "warn", "Job oprit manual.", { processed });
        break;
      }
      processed += 1;
      try {
        const result = await persistCandidate(db, companyId, search, candidate, job.created_by_email || "lead-builder");
        success += 1;
        if (result.duplicate) duplicates += 1;
      } catch (error) {
        failed += 1;
        recordJobLog(db, companyId, job.id, "error", "Candidatul nu a putut fi procesat.", {
          company: candidate.commercial_name,
          error: error?.message || String(error)
        });
      }
      const progress = Math.min(99, Math.round((processed / Math.max(1, maxResults)) * 100));
      db.prepare(`
        UPDATE lead_jobs
        SET progress=?, processed_count=?, success_count=?, failed_count=?, updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(progress, processed, success, failed, job.id, companyId);
      db.prepare(`
        UPDATE lead_searches
        SET progress=?, result_count=?, duplicate_count=?, error_count=?, updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(progress, success, duplicates, failed, search.id, companyId);
      await sleep(250);
    }
    const stopped = Number(db.prepare("SELECT stop_requested FROM lead_jobs WHERE id=? AND company_id=?").get(job.id, companyId)?.stop_requested || 0) === 1;
    const finalStatus = stopped ? "stopped" : "completed";
    db.prepare(`
      UPDATE lead_jobs
      SET status=?, progress=100, processed_count=?, success_count=?, failed_count=?,
          finished_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(finalStatus, processed, success, failed, job.id, companyId);
    db.prepare(`
      UPDATE lead_searches
      SET status=?, progress=100, result_count=?, duplicate_count=?, error_count=?,
          finished_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(finalStatus, success, duplicates, failed, search.id, companyId);
    recordJobLog(db, companyId, job.id, "info", "Job finalizat.", { processed, success, failed, duplicates, stopped });
    return { ok: true, processed, success, failed, duplicates, stopped };
  } catch (error) {
    const message = error?.message || String(error);
    db.prepare(`
      UPDATE lead_jobs
      SET status='failed', error_reason=?, finished_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(message, job.id, companyId);
    db.prepare(`
      UPDATE lead_searches
      SET status='failed', last_error=?, finished_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(message, search.id, companyId);
    recordJobLog(db, companyId, job.id, "error", "Job esuat.", { error: message });
    options.onError?.(error);
    return { ok: false, error: message, processed, success, failed, duplicates };
  }
}

function nextCrmNumber(db, companyId, tableName, numberColumn, prefix) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare(`SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM ${tableName} WHERE company_id=? AND year=?`).get(Number(companyId || 0), year)?.next_seq || 1);
  let number = "";
  do {
    number = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
    seq += 1;
  } while (db.prepare(`SELECT id FROM ${tableName} WHERE company_id=? AND ${numberColumn}=?`).get(Number(companyId || 0), number));
  return { year, seq: seq - 1, number };
}

export function syncLeadToCrm(db, companyId = 0, leadId = 0, actorEmail = "", options = {}) {
  ensureLeadBuilderSchema(db);
  if (!tableExists(db, "crm_leads")) return { ok: false, error: "crm_missing" };
  const row = db.prepare(`
    SELECT l.*, c.*
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.id=? AND l.company_id=?
  `).get(Number(leadId || 0), Number(companyId || 0));
  if (!row) return { ok: false, error: "missing_lead" };
  if (row.crm_lead_id) return { ok: true, crmLeadId: row.crm_lead_id, existing: true };

  const existing = crmExistingLead(db, companyId, {
    commercial_name: row.commercial_name,
    primary_email: row.primary_email,
    primary_phone: row.primary_phone,
    country: row.country
  });
  let crmLeadId = existing?.id || 0;
  const tx = db.transaction(() => {
    if (!crmLeadId) {
      const next = nextCrmNumber(db, companyId, "crm_leads", "lead_number", "LD");
      const result = db.prepare(`
        INSERT INTO crm_leads (
          company_id, year, seq, lead_number, name, company_name, contact_name,
          email, phone, source, status, owner_email, estimated_value, probability,
          next_step, next_followup_date, notes, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'LEAD_BUILDER', 'NOU', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(companyId || 0),
        next.year,
        next.seq,
        next.number,
        row.commercial_name,
        row.legal_name || row.commercial_name,
        row.contact_person || null,
        row.primary_email || null,
        row.primary_phone || null,
        safeText(actorEmail),
        row.score >= 80 ? 1000 : row.score >= 60 ? 500 : 0,
        row.score || 10,
        "Verifica draftul Lead Builder si contacteaza manual.",
        "",
        [
          `Lead Builder #${leadId}`,
          row.website ? `Website: ${row.website}` : "",
          row.source_url ? `Sursa: ${row.source_url}` : ""
        ].filter(Boolean).join("\n"),
        safeText(actorEmail)
      );
      crmLeadId = Number(result.lastInsertRowid || 0);
    }
    db.prepare("UPDATE leads SET crm_lead_id=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(crmLeadId, Number(leadId || 0), Number(companyId || 0));
    db.prepare("UPDATE lead_companies SET crm_lead_id=COALESCE(crm_lead_id, ?), updated_at=datetime('now') WHERE id=? AND company_id=?").run(crmLeadId, row.lead_company_id, Number(companyId || 0));
    db.prepare(`
      INSERT INTO crm_followups (
        company_id, lead_id, activity_type, subject, notes, due_date, priority,
        status, owner_email, created_by_email
      ) VALUES (?, ?, 'TASK', ?, ?, date('now', '+1 day'), 'RIDICATA', 'DESCHIS', ?, ?)
    `).run(
      Number(companyId || 0),
      crmLeadId,
      `Contactare ${row.commercial_name}`,
      "Creat automat din Lead Builder. Mesajele sunt drafturi, trimiterea se face manual/controlat.",
      safeText(actorEmail),
      safeText(actorEmail)
    );

    if (options.createOpportunity && tableExists(db, "crm_opportunities")) {
      const nextOpp = nextCrmNumber(db, companyId, "crm_opportunities", "opportunity_number", "OPP");
      const opp = db.prepare(`
        INSERT INTO crm_opportunities (
          company_id, year, seq, opportunity_number, lead_id, title, stage, status,
          amount, probability, owner_email, source, notes, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, 'CALIFICARE', 'DESCHISA', ?, ?, ?, 'LEAD_BUILDER', ?, ?)
      `).run(
        Number(companyId || 0),
        nextOpp.year,
        nextOpp.seq,
        nextOpp.number,
        crmLeadId,
        `E-MARQET - ${row.commercial_name}`,
        row.score >= 80 ? 1000 : 500,
        Math.max(10, Math.min(90, Number(row.score || 10))),
        safeText(actorEmail),
        `Oportunitate creata din Lead Builder #${leadId}.`,
        safeText(actorEmail)
      );
      db.prepare("UPDATE leads SET crm_opportunity_id=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(Number(opp.lastInsertRowid || 0), Number(leadId || 0), Number(companyId || 0));
    }
    db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, ?, 'crm_sync', 'Trimis in CRM', ?, ?)
    `).run(Number(companyId || 0), Number(leadId || 0), row.lead_company_id, `CRM lead #${crmLeadId}`, safeText(actorEmail));
  });
  tx();
  return { ok: true, crmLeadId, existing: Boolean(existing) };
}

export function updateLeadStatus(db, companyId = 0, leadId = 0, status = "", actorEmail = "", note = "") {
  ensureLeadBuilderSchema(db);
  const normalized = LEAD_PIPELINE_STAGES.includes(safeText(status)) ? safeText(status) : "nou";
  const row = db.prepare("SELECT status FROM leads WHERE id=? AND company_id=?").get(Number(leadId || 0), Number(companyId || 0));
  if (!row) return { ok: false, error: "missing_lead" };
  db.prepare("UPDATE leads SET status=?, stage=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
    .run(normalized, normalized, Number(leadId || 0), Number(companyId || 0));
  db.prepare(`
    INSERT INTO lead_status_history (company_id, lead_id, status_from, status_to, changed_by_email, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Number(companyId || 0), Number(leadId || 0), row.status, normalized, safeText(actorEmail), safeText(note));
  return { ok: true };
}

export function leadDashboard(db, companyId = 0) {
  ensureLeadBuilderSchema(db);
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_leads,
      SUM(CASE WHEN c.verification_status LIKE 'verificat%' THEN 1 ELSE 0 END) AS verified_leads,
      SUM(CASE WHEN c.primary_email <> '' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN c.primary_phone <> '' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN l.score >= 60 THEN 1 ELSE 0 END) AS priority_leads,
      SUM(CASE WHEN l.is_duplicate=1 THEN 1 ELSE 0 END) AS duplicate_leads,
      SUM(CASE WHEN l.contacted_at IS NOT NULL THEN 1 ELSE 0 END) AS contacted,
      SUM(CASE WHEN l.replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replies,
      SUM(CASE WHEN l.converted_client_id IS NOT NULL THEN 1 ELSE 0 END) AS conversions,
      SUM(CASE WHEN l.status='client_activ' THEN 1 ELSE 0 END) AS active_clients
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=?
  `).get(Number(companyId || 0)) || {};
  const byCounty = db.prepare(`
    SELECT COALESCE(NULLIF(c.county,''), '-') AS label, COUNT(*) AS total
    FROM leads l JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=?
    GROUP BY label
    ORDER BY total DESC
    LIMIT 12
  `).all(Number(companyId || 0));
  const byCategory = db.prepare(`
    SELECT COALESCE(NULLIF(c.category,''), '-') AS label, COUNT(*) AS total
    FROM leads l JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=?
    GROUP BY label
    ORDER BY total DESC
    LIMIT 12
  `).all(Number(companyId || 0));
  const byScore = db.prepare(`
    SELECT score_category AS label, COUNT(*) AS total
    FROM leads
    WHERE company_id=?
    GROUP BY score_category
    ORDER BY total DESC
  `).all(Number(companyId || 0));
  const daily = db.prepare(`
    SELECT substr(created_at, 1, 10) AS label, COUNT(*) AS total
    FROM leads
    WHERE company_id=?
    GROUP BY substr(created_at, 1, 10)
    ORDER BY label DESC
    LIMIT 14
  `).all(Number(companyId || 0));
  const campaigns = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM leads l WHERE l.company_id=c.company_id AND l.campaign_id=c.id) AS lead_count
    FROM lead_campaigns c
    WHERE c.company_id=?
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT 10
  `).all(Number(companyId || 0));
  const jobs = db.prepare(`
    SELECT j.*, s.name AS search_name
    FROM lead_jobs j
    LEFT JOIN lead_searches s ON s.id=j.search_id AND s.company_id=j.company_id
    WHERE j.company_id=?
    ORDER BY j.id DESC
    LIMIT 10
  `).all(Number(companyId || 0));
  return { stats, byCounty, byCategory, byScore, daily, campaigns, jobs };
}

export function listLeadRows(db, companyId = 0, filters = {}) {
  ensureLeadBuilderSchema(db);
  const where = ["l.company_id=?"];
  const params = [Number(companyId || 0)];
  const q = safeText(filters.q);
  if (q) {
    const like = `%${q}%`;
    where.push("(c.commercial_name LIKE ? OR c.legal_name LIKE ? OR c.primary_email LIKE ? OR c.primary_phone LIKE ? OR c.website LIKE ?)");
    params.push(like, like, like, like, like);
  }
  for (const [field, column] of [
    ["category", "c.category"],
    ["county", "c.county"],
    ["city", "c.city"],
    ["status", "l.status"],
    ["source", "c.main_source"]
  ]) {
    const value = safeText(filters[field]);
    if (value) {
      where.push(`${column}=?`);
      params.push(value);
    }
  }
  if (truthy(filters.has_email)) where.push("c.primary_email <> ''");
  if (truthy(filters.has_phone)) where.push("c.primary_phone <> ''");
  if (truthy(filters.has_website)) where.push("c.website <> ''");
  if (truthy(filters.google_found)) where.push("COALESCE(c.google_place_id, '') <> ''");
  if (truthy(filters.google_confirmed)) where.push("c.google_match_status IN ('confirmed','auto_matched')");
  if (truthy(filters.google_needs_review)) where.push("c.google_match_status='needs_review'");
  if (safeText(filters.google_business_status)) {
    where.push("c.google_business_status=?");
    params.push(safeText(filters.google_business_status));
  }
  if (safeText(filters.google_category)) {
    where.push("c.google_category=?");
    params.push(safeText(filters.google_category));
  }
  if (truthy(filters.verified)) where.push("c.verification_status LIKE 'verificat%'");
  if (truthy(filters.contacted)) where.push("l.contacted_at IS NOT NULL");
  if (truthy(filters.duplicate)) where.push("l.is_duplicate=1");
  if (safeText(filters.min_score)) {
    where.push("l.score>=?");
    params.push(clampNumber(filters.min_score, 0, 0, 100));
  }
  return db.prepare(`
    SELECT l.*, c.commercial_name, c.legal_name, c.category, c.country, c.county, c.city,
      c.primary_email, c.primary_phone, c.website, c.facebook_url, c.estimated_items_count,
      c.main_source, c.source_url, c.last_checked_at, c.verification_status,
      c.google_place_id, c.google_name, c.google_phone, c.google_website,
      c.google_category, c.google_business_status, c.google_match_score, c.google_match_status
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE ${where.join(" AND ")}
    ORDER BY l.score DESC, l.id DESC
    LIMIT 1000
  `).all(...params);
}

export function getLeadDetail(db, companyId = 0, leadId = 0) {
  ensureLeadBuilderSchema(db);
  const lead = db.prepare(`
    SELECT
      l.id AS lead_id,
      l.company_id,
      l.campaign_id,
      l.search_id,
      l.lead_company_id,
      l.title,
      l.stage,
      l.status,
      l.priority,
      l.score,
      l.score_category,
      l.is_duplicate,
      l.duplicate_of_lead_id,
      l.crm_lead_id,
      l.crm_opportunity_id,
      l.contact_ready,
      l.do_not_contact,
      l.contacted_at,
      l.replied_at,
      l.converted_client_id,
      l.created_by_email,
      l.created_at AS lead_created_at,
      l.updated_at AS lead_updated_at,
      c.id AS company_record_id,
      c.commercial_name,
      c.legal_name,
      c.cui,
      c.registration_number,
      c.activity_domain,
      c.category,
      c.description,
      c.founded_year,
      c.public_status,
      c.country,
      c.county,
      c.city,
      c.address,
      c.postal_code,
      c.latitude,
      c.longitude,
      c.map_url,
      c.primary_email,
      c.sales_email,
      c.marketing_email,
      c.support_email,
      c.primary_phone,
      c.secondary_phone,
      c.whatsapp_phone,
      c.contact_person,
      c.contact_position,
      c.contact_form_url,
      c.website,
      c.facebook_url,
      c.instagram_url,
      c.linkedin_url,
      c.tiktok_url,
      c.youtube_url,
      c.has_website,
      c.has_online_store,
      c.has_facebook,
      c.has_instagram,
      c.has_google_business,
      c.publishes_auto_ads,
      c.has_online_catalog,
      c.estimated_items_count,
      c.external_platforms_json,
      c.offers_financing,
      c.offers_warranty,
      c.offers_delivery,
      c.offers_buyback,
      c.offers_leasing,
      c.main_source,
      c.source_url,
      c.google_place_id,
      c.google_name,
      c.google_phone,
      c.google_website,
      c.google_address,
      c.google_locality,
      c.google_category,
      c.google_rating,
      c.google_review_count,
      c.google_business_status,
      c.google_maps_uri,
      c.google_match_score,
      c.google_match_status,
      c.google_last_checked_at,
      c.collected_at,
      c.last_checked_at,
      c.verification_status,
      c.confidence_score,
      c.notes,
      c.dedupe_hash,
      c.crm_client_id,
      c.emarqet_partner_id
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.id=? AND l.company_id=?
  `).get(Number(leadId || 0), Number(companyId || 0));
  if (!lead) return null;
  const leadCompanyId = Number(lead.lead_company_id || lead.company_record_id);
  return {
    lead,
    emails: db.prepare("SELECT * FROM lead_emails WHERE company_id=? AND lead_company_id=? ORDER BY is_primary DESC, email_type ASC").all(Number(companyId || 0), leadCompanyId),
    phones: db.prepare("SELECT * FROM lead_phones WHERE company_id=? AND lead_company_id=? ORDER BY is_primary DESC, phone_type ASC").all(Number(companyId || 0), leadCompanyId),
    socials: db.prepare("SELECT * FROM lead_social_profiles WHERE company_id=? AND lead_company_id=? ORDER BY platform ASC").all(Number(companyId || 0), leadCompanyId),
    websites: db.prepare("SELECT * FROM lead_websites WHERE company_id=? AND lead_company_id=? ORDER BY checked_at DESC").all(Number(companyId || 0), leadCompanyId),
    sources: db.prepare("SELECT * FROM lead_source_records WHERE company_id=? AND lead_company_id=? ORDER BY collected_at DESC").all(Number(companyId || 0), leadCompanyId),
    googleMatches: db.prepare("SELECT * FROM lead_google_places_matches WHERE company_id=? AND lead_id=? ORDER BY match_score DESC, id DESC").all(Number(companyId || 0), Number(leadId || 0)),
    fieldProvenance: db.prepare("SELECT * FROM lead_field_provenance WHERE company_id=? AND lead_company_id=? ORDER BY collected_at DESC").all(Number(companyId || 0), leadCompanyId),
    insights: db.prepare("SELECT * FROM lead_insights WHERE company_id=? AND lead_id=? ORDER BY id DESC LIMIT 5").all(Number(companyId || 0), Number(leadId || 0)),
    scores: db.prepare("SELECT * FROM lead_scores WHERE company_id=? AND lead_id=? ORDER BY id DESC LIMIT 10").all(Number(companyId || 0), Number(leadId || 0)),
    messages: db.prepare("SELECT * FROM lead_messages WHERE company_id=? AND lead_id=? ORDER BY message_type ASC").all(Number(companyId || 0), Number(leadId || 0)),
    history: db.prepare("SELECT * FROM lead_status_history WHERE company_id=? AND lead_id=? ORDER BY id DESC").all(Number(companyId || 0), Number(leadId || 0)),
    activities: db.prepare("SELECT * FROM lead_activities WHERE company_id=? AND lead_id=? ORDER BY id DESC LIMIT 30").all(Number(companyId || 0), Number(leadId || 0))
  };
}

export async function searchGooglePlacesForLead(db, companyId = 0, leadId = 0, actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const service = new GooglePlacesService({ db, companyId });
  return service.enrichLead(leadId, { actorEmail });
}

export async function enrichCampaignWithGooglePlaces(db, companyId = 0, campaignId = 0, actorEmail = "", options = {}) {
  ensureLeadBuilderSchema(db);
  const service = new GooglePlacesService({ db, companyId });
  return service.enrichCampaign(campaignId, {
    limit: clampNumber(options.limit, 50, 1, 200),
    actorEmail: safeText(actorEmail)
  });
}

export function updateGooglePlaceMatchStatus(db, companyId = 0, leadId = 0, matchId = 0, status = "", actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const nextStatus = safeText(status);
  if (!["confirmed", "rejected", "needs_review"].includes(nextStatus)) return { ok: false, error: "invalid_status" };
  const match = db.prepare(`
    SELECT *
    FROM lead_google_places_matches
    WHERE id=? AND company_id=? AND lead_id=?
  `).get(Number(matchId || 0), Number(companyId || 0), Number(leadId || 0));
  if (!match) return { ok: false, error: "missing_match" };
  const place = parseJson(match.source_json, {});
  const result = upsertLeadGooglePlaceMatch(db, companyId, {
    leadId,
    leadCompanyId: match.lead_company_id,
    place: {
      ...place,
      google_place_id: match.google_place_id,
      google_name: match.google_name,
      google_phone: match.google_phone,
      google_website: match.google_website,
      google_address: match.google_address,
      google_locality: match.google_locality,
      google_category: match.google_category,
      google_rating: match.google_rating,
      google_review_count: match.google_review_count,
      google_business_status: match.google_business_status,
      google_maps_uri: match.google_maps_uri
    },
    score: match.match_score,
    status: nextStatus,
    query: match.request_query
  });
  db.prepare(`
    UPDATE lead_google_places_matches
    SET match_status=?,
        verification_status=?,
        confirmed_at=CASE WHEN ?='confirmed' THEN datetime('now') ELSE confirmed_at END,
        rejected_at=CASE WHEN ?='rejected' THEN datetime('now') ELSE rejected_at END,
        updated_at=datetime('now')
    WHERE id=? AND company_id=? AND lead_id=?
  `).run(
    nextStatus,
    nextStatus === "confirmed" ? "confirmat_manual" : nextStatus === "rejected" ? "respins_manual" : "needs_review",
    nextStatus,
    nextStatus,
    Number(matchId || 0),
    Number(companyId || 0),
    Number(leadId || 0)
  );
  db.prepare(`
    INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
    VALUES (?, ?, ?, 'google_places_match', ?, ?, ?)
  `).run(
    Number(companyId || 0),
    Number(leadId || 0),
    match.lead_company_id,
    nextStatus === "confirmed" ? "Potrivire Google confirmata" : nextStatus === "rejected" ? "Potrivire Google respinsa" : "Potrivire Google marcata pentru review",
    match.google_place_id,
    safeText(actorEmail)
  );
  return { ...result, ok: true, status: nextStatus };
}

export async function enrichLeadWebsiteFromOfficialSite(db, companyId = 0, leadId = 0, actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const detail = getLeadDetail(db, companyId, leadId);
  if (!detail?.lead) return { ok: false, error: "missing_lead" };
  const lead = detail.lead;
  const website = normalizeWebsite(lead.google_website || lead.website);
  if (!website) return { ok: false, error: "missing_website" };
  const adapter = new PublicWebsiteLeadSourceAdapter();
  const enriched = await adapter.fetchCompany({
    commercial_name: lead.commercial_name,
    website,
    source_key: "public_website",
    source_url: website,
    country: lead.country || DEFAULT_COUNTRY
  }, lead);
  const contacts = await normalizeCandidateContacts(enriched, lead);
  const leadCompanyId = Number(lead.lead_company_id || lead.company_record_id);
  const tx = db.transaction(() => {
    if (contacts.primaryEmail?.email && !safeText(lead.primary_email)) {
      db.prepare("UPDATE lead_companies SET primary_email=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(contacts.primaryEmail.email, leadCompanyId, Number(companyId || 0));
    }
    if (contacts.primaryPhone?.phone_normalized && !safeText(lead.primary_phone)) {
      db.prepare("UPDATE lead_companies SET primary_phone=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(contacts.primaryPhone.phone_normalized, leadCompanyId, Number(companyId || 0));
    }
    for (const email of contacts.emails) {
      db.prepare(`
        INSERT INTO lead_emails (
          company_id, lead_company_id, email, email_type, validation_status,
          validation_reason, is_primary, source, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, lead_company_id, email)
        DO UPDATE SET validation_status=excluded.validation_status, validation_reason=excluded.validation_reason,
          email_type=excluded.email_type, is_primary=max(lead_emails.is_primary, excluded.is_primary),
          source=excluded.source, source_url=excluded.source_url, updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        leadCompanyId,
        email.email,
        email.email_type,
        email.status,
        email.reason,
        contacts.primaryEmail?.email === email.email ? 1 : 0,
        safeText(email.source || "public_website"),
        safeText(email.source_url || enriched.website_final_url || website)
      );
    }
    for (const phone of contacts.phones) {
      db.prepare(`
        INSERT INTO lead_phones (
          company_id, lead_company_id, phone_original, phone_normalized, phone_type, is_primary, source, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, lead_company_id, phone_normalized)
        DO UPDATE SET phone_type=excluded.phone_type, is_primary=max(lead_phones.is_primary, excluded.is_primary),
          source=excluded.source, source_url=excluded.source_url, updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        leadCompanyId,
        safeText(phone.phone_original),
        phone.phone_normalized,
        phone.phone_type,
        contacts.primaryPhone?.phone_normalized === phone.phone_normalized ? 1 : 0,
        safeText(phone.source || "public_website"),
        safeText(phone.source_url || enriched.website_final_url || website)
      );
    }
    for (const [platform, url] of Object.entries({
      facebook: enriched.facebook_url,
      instagram: enriched.instagram_url,
      linkedin: enriched.linkedin_url
    })) {
      if (!safeText(url)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO lead_social_profiles (company_id, lead_company_id, platform, url, source)
        VALUES (?, ?, ?, ?, 'public_website')
      `).run(Number(companyId || 0), leadCompanyId, platform, url);
    }
    db.prepare(`
      INSERT INTO lead_websites (
        company_id, lead_company_id, url, domain, http_status, https_enabled,
        redirect_url, availability_status, is_parked, source, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'public_website', datetime('now'))
      ON CONFLICT(company_id, lead_company_id, url)
      DO UPDATE SET http_status=excluded.http_status, redirect_url=excluded.redirect_url,
        availability_status=excluded.availability_status, is_parked=excluded.is_parked,
        checked_at=excluded.checked_at, updated_at=datetime('now')
    `).run(
      Number(companyId || 0),
      leadCompanyId,
      website,
      websiteDomain(website),
      Number(enriched.website_http_status || 0),
      website.startsWith("https://") ? 1 : 0,
      safeText(enriched.website_final_url),
      safeText(enriched.website_status || "neverificat"),
      Number(enriched.website_is_parked || 0)
    );
    db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, ?, 'website_enrich', 'Email cautat pe website oficial', ?, ?)
    `).run(
      Number(companyId || 0),
      Number(leadId || 0),
      leadCompanyId,
      `${website}; emails=${contacts.emails.length}; phones=${contacts.phones.length}`,
      safeText(actorEmail)
    );
  });
  tx();
  return { ok: true, emails: contacts.emails.length, phones: contacts.phones.length, website_status: enriched.website_status || "neverificat" };
}

export function regenerateLeadDrafts(db, companyId = 0, leadId = 0, actorEmail = "") {
  const detail = getLeadDetail(db, companyId, leadId);
  if (!detail?.lead) return { ok: false, error: "missing_lead" };
  const lead = detail.lead;
  const insight = detail.insights?.[0] || buildLocalInsight(lead, lead, {
    primaryEmail: lead.primary_email ? { email: lead.primary_email } : null,
    primaryPhone: lead.primary_phone ? { phone_normalized: lead.primary_phone } : null
  });
  const drafts = messageDrafts(lead, lead, insight);
  const tx = db.transaction(() => {
    for (const draft of drafts) {
      db.prepare(`
        INSERT INTO lead_messages (
          company_id, lead_id, message_type, channel, subject, body, status,
          template_key, generated_by, created_by_email, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, datetime('now'))
        ON CONFLICT(company_id, lead_id, message_type)
        DO UPDATE SET subject=excluded.subject, body=excluded.body, generated_by=excluded.generated_by, updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        Number(leadId || 0),
        draft.message_type,
        draft.channel,
        draft.subject,
        draft.body,
        "auto_dealer_founder",
        insight.provider || "local_fallback",
        safeText(actorEmail)
      );
    }
    db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, ?, 'message_draft', 'Drafturi regenerate', '', ?)
    `).run(Number(companyId || 0), Number(leadId || 0), lead.lead_company_id, safeText(actorEmail));
  });
  tx();
  return { ok: true, count: drafts.length };
}

function dueDateFromNow(days = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function ensureLeadOnboardingTasks(db, companyId = 0, leadId = 0, actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const lead = db.prepare(`
    SELECT id, campaign_id
    FROM leads
    WHERE id=? AND company_id=?
  `).get(Number(leadId || 0), Number(companyId || 0));
  if (!lead) return { ok: false, error: "missing_lead" };
  const responsible = safeText(actorEmail) || "lead-builder";
  const tx = db.transaction(() => {
    for (const stage of ONBOARDING_STAGES) {
      db.prepare(`
        INSERT INTO lead_onboarding_tasks (
          company_id, campaign_id, lead_id, stage_key, stage_label, responsible_email,
          due_date, notification_status, status, priority, note_required, created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'open', ?, 1, ?)
        ON CONFLICT(company_id, lead_id, stage_key)
        DO UPDATE SET
          stage_label=excluded.stage_label,
          responsible_email=COALESCE(NULLIF(lead_onboarding_tasks.responsible_email, ''), excluded.responsible_email),
          due_date=COALESCE(lead_onboarding_tasks.due_date, excluded.due_date),
          priority=excluded.priority,
          updated_at=datetime('now')
      `).run(
        Number(companyId || 0),
        lead.campaign_id || null,
        Number(leadId || 0),
        stage.key,
        stage.label,
        responsible,
        dueDateFromNow(stage.dueDays),
        stage.priority,
        responsible
      );
    }
    db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, 'onboarding_tasks', 'Taskuri onboarding pregatite', ?, ?)
    `).run(Number(companyId || 0), Number(leadId || 0), `${ONBOARDING_STAGES.length} etape`, responsible);
  });
  tx();
  return { ok: true, count: ONBOARDING_STAGES.length };
}

function leadSelectionReason(row = {}) {
  const reasons = [];
  if (Number(row.score || 0) >= 80) reasons.push("scor foarte mare");
  else if (Number(row.score || 0) >= 60) reasons.push("scor mare");
  if (row.primary_email) reasons.push("email comercial disponibil");
  if (row.primary_phone) reasons.push("telefon disponibil");
  if (row.website) reasons.push("website activ/verificabil");
  if (Number(row.estimated_items_count || 0) >= 20) reasons.push("stoc public peste 20 anunturi");
  else if (Number(row.estimated_items_count || 0) >= 10) reasons.push("stoc public peste 10 anunturi");
  if (row.has_online_catalog) reasons.push("catalog online detectat");
  return reasons.join(", ") || "selectat pentru verificare manuala";
}

function recommendedBenefit(row = {}) {
  const stock = Number(row.estimated_items_count || 0);
  if (stock >= 20) return "Partener Fondator + import gratuit stoc + promovare initiala";
  if (row.website) return "Partener Fondator + preluare stoc din website/feed";
  if (row.primary_email || row.primary_phone) return "Partener Fondator + publicare gratuita asistata";
  return "Verificare manuala inainte de oferta";
}

function isLikelyAutoSalesLead(row = {}) {
  const key = normalizeKey([
    row.commercial_name,
    row.legal_name,
    row.website,
    row.source_url
  ].filter(Boolean).join(" "));
  const hasContact = Boolean(row.primary_email || row.primary_phone || row.website);
  if (!hasContact) return false;
  const positive = [
    "dealer",
    "parc auto",
    "autorulate",
    "auto rulate",
    "masini rulate",
    "vanzari auto",
    "vanzari",
    "motors",
    "auto center",
    "dacia",
    "skoda",
    "mercedes",
    "autoklass",
    "toyota",
    "suzuki",
    "citroen",
    "peugeot",
    "eurial",
    "opel",
    "dibas",
    "genova",
    "proleasing",
    "pex",
    "acar",
    "mobel",
    "serus",
    "dsa",
    "pyter",
    "royal auto",
    "klp"
  ].some((token) => key.includes(token));
  const excluded = [
    "dezmembr",
    "itp",
    "vulcaniz",
    "parbriz",
    "spalator",
    "anvelope",
    "piese",
    "plast",
    "mecan",
    "electromotoare",
    "alternatoare",
    "volane",
    "freon",
    "tyres",
    "tires"
  ].some((token) => key.includes(token));
  const serviceOnly = key.includes("service") && !positive;
  if ((excluded || serviceOnly) && !positive) return false;
  return positive || Number(row.score || 0) >= 40 || Number(row.estimated_items_count || 0) >= 10;
}

function approvalDedupeKey(row = {}) {
  const email = normalizeEmail(row.primary_email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(row.primary_phone, "Romania");
  if (phone) return `phone:${phone}`;
  const website = safeText(row.website).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (website) return `web:${website}`;
  return `name:${normalizeKey([row.commercial_name, row.city, row.county].filter(Boolean).join(" "))}`;
}

function uniqueApprovalRows(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = approvalDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export function listCampaignApprovalRows(db, companyId = 0, campaignId = 0, limit = 50) {
  ensureLeadBuilderSchema(db);
  const capped = Math.max(1, Math.min(200, Number(limit || 50)));
  return db.prepare(`
    SELECT
      l.id AS lead_id,
      l.campaign_id,
      l.status AS lead_status,
      l.score,
      l.score_category,
      l.priority,
      l.do_not_contact,
      c.commercial_name,
      c.legal_name,
      c.city,
      c.county,
      c.website,
      c.facebook_url,
      c.primary_email,
      c.primary_phone,
      c.estimated_items_count,
      c.has_online_catalog,
      c.main_source,
      c.source_url,
      e.validation_status AS email_validation_status,
      e.source_url AS email_source_url,
      i.best_contact_method,
      i.recommendation_text,
      m.id AS message_id,
      m.message_type,
      m.channel,
      m.subject,
      m.body,
      m.status AS message_status,
      m.updated_at AS message_updated_at,
      (SELECT COUNT(*) FROM lead_onboarding_tasks t WHERE t.company_id=l.company_id AND t.lead_id=l.id) AS onboarding_task_count
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    LEFT JOIN lead_emails e ON e.company_id=c.company_id AND e.lead_company_id=c.id AND e.is_primary=1
    LEFT JOIN lead_insights i ON i.id=(
      SELECT ii.id FROM lead_insights ii
      WHERE ii.company_id=l.company_id AND ii.lead_id=l.id
      ORDER BY ii.id DESC LIMIT 1
    )
    LEFT JOIN lead_messages m ON m.id=(
      SELECT mm.id FROM lead_messages mm
      WHERE mm.company_id=l.company_id
        AND mm.lead_id=l.id
        AND mm.message_type IN ('email_initial','email_short','email_detailed')
      ORDER BY
        CASE mm.message_type
          WHEN 'email_initial' THEN 1
          WHEN 'email_short' THEN 2
          ELSE 3
        END,
        mm.id DESC
      LIMIT 1
    )
    WHERE l.company_id=?
      AND l.campaign_id=?
      AND COALESCE(l.do_not_contact,0)=0
      AND c.category='auto_dealers'
      AND c.county='Prahova'
    ORDER BY l.score DESC, c.primary_email <> '' DESC, c.primary_phone <> '' DESC, l.id ASC
    LIMIT 500
  `).all(Number(companyId || 0), Number(campaignId || 0))
    .filter(isLikelyAutoSalesLead)
    .reduce((items, row) => uniqueApprovalRows([...items, row]), [])
    .slice(0, capped)
    .map((row) => ({
      ...row,
      selection_reason: leadSelectionReason(row),
      recommended_benefit: recommendedBenefit(row),
      preferred_contact_method: row.best_contact_method || (row.primary_email ? `email (${row.primary_email})` : row.primary_phone ? `telefon (${row.primary_phone})` : "verificare manuala")
    }));
}

export function prepareCampaignForApproval(db, companyId = 0, campaignId = 0, actorEmail = "", limit = 50) {
  ensureLeadBuilderSchema(db);
  const rows = listCampaignApprovalRows(db, companyId, campaignId, limit);
  let drafts = 0;
  let tasks = 0;
  for (const row of rows) {
    const existingMessage = Number(row.message_id || 0);
    if (!existingMessage) {
      const result = regenerateLeadDrafts(db, companyId, row.lead_id, actorEmail);
      if (result.ok) drafts += Number(result.count || 0);
    }
    const taskResult = ensureLeadOnboardingTasks(db, companyId, row.lead_id, actorEmail);
    if (taskResult.ok) tasks += Number(taskResult.count || 0);
    if (String(row.lead_status || "") === "nou") {
      updateLeadStatus(db, companyId, row.lead_id, "pregatit_contact", actorEmail, "Pregatit pentru aprobare mesaje pilot");
    }
  }
  return { ok: true, selected: rows.length, drafts, tasks };
}

export function updateLeadMessageApproval(db, companyId = 0, messageId = 0, data = {}, actorEmail = "") {
  ensureLeadBuilderSchema(db);
  const message = db.prepare("SELECT * FROM lead_messages WHERE id=? AND company_id=?").get(Number(messageId || 0), Number(companyId || 0));
  if (!message) return { ok: false, error: "missing_message" };
  const action = safeText(data.action || "save");
  const statusMap = {
    save: safeText(data.status) || message.status || "draft",
    approve: "approved",
    reject: "rejected",
    defer: "deferred",
    call: "call_requested",
    do_not_contact: "do_not_contact"
  };
  const nextStatus = statusMap[action] || statusMap.save;
  const nextChannel = safeText(data.channel || message.channel) || "email";
  const subject = safeText(data.subject ?? message.subject);
  const body = safeText(data.body ?? message.body);
  const note = safeText(data.note);
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE lead_messages
      SET channel=?, subject=?, body=?, status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(nextChannel, subject, body, nextStatus, Number(messageId || 0), Number(companyId || 0));

    if (action === "approve") {
      updateLeadStatus(db, companyId, message.lead_id, "pregatit_contact", actorEmail, note || "Mesaj aprobat manual");
    } else if (action === "call") {
      updateLeadStatus(db, companyId, message.lead_id, "pregatit_contact", actorEmail, note || "Marcat pentru apel telefonic");
    } else if (action === "do_not_contact") {
      db.prepare("UPDATE leads SET do_not_contact=1, status='nu_mai_contacta', stage='nu_mai_contacta', updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(message.lead_id, Number(companyId || 0));
    }

    db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, 'message_approval', ?, ?, ?)
    `).run(
      Number(companyId || 0),
      message.lead_id,
      `Mesaj ${nextStatus}`,
      [nextChannel, note].filter(Boolean).join(" · "),
      safeText(actorEmail)
    );
  });
  tx();
  return { ok: true, status: nextStatus };
}

export function campaignLaunchReportData(db, companyId = 0, campaignId = 0) {
  ensureLeadBuilderSchema(db);
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS identified,
      SUM(CASE WHEN c.primary_email <> '' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN c.primary_phone <> '' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN c.website <> '' THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN c.has_online_catalog=1 OR c.estimated_items_count>0 THEN 1 ELSE 0 END) AS with_public_stock,
      SUM(CASE WHEN l.score>=60 THEN 1 ELSE 0 END) AS priority,
      SUM(CASE WHEN l.is_duplicate=1 THEN 1 ELSE 0 END) AS duplicates,
      SUM(CASE WHEN m.status='approved' THEN 1 ELSE 0 END) AS approved_messages,
      SUM(CASE WHEN m.status='draft' THEN 1 ELSE 0 END) AS draft_messages,
      SUM(CASE WHEN l.crm_lead_id IS NOT NULL THEN 1 ELSE 0 END) AS crm_synced
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    LEFT JOIN lead_messages m ON m.id=(
      SELECT mm.id FROM lead_messages mm
      WHERE mm.company_id=l.company_id AND mm.lead_id=l.id AND mm.message_type IN ('email_initial','email_short')
      ORDER BY mm.id DESC LIMIT 1
    )
    WHERE l.company_id=? AND l.campaign_id=?
  `).get(Number(companyId || 0), Number(campaignId || 0)) || {};
  const topLeads = listCampaignApprovalRows(db, companyId, campaignId, 20);
  const top50 = listCampaignApprovalRows(db, companyId, campaignId, 50);
  const campaign = db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND id=?").get(Number(companyId || 0), Number(campaignId || 0));
  const jobs = db.prepare(`
    SELECT *
    FROM lead_jobs
    WHERE company_id=? AND campaign_id=?
    ORDER BY id DESC
    LIMIT 5
  `).all(Number(companyId || 0), Number(campaignId || 0));
  return { campaign, stats, topLeads, top50, jobs };
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function leadsToCsv(rows = []) {
  const columns = [
    "id",
    "companie",
    "categorie",
    "oras",
    "judet",
    "email",
    "telefon",
    "website",
    "facebook",
    "numar_estimativ_anunturi",
    "scor",
    "status",
    "sursa",
    "url_sursa",
    "ultima_verificare"
  ];
  return [
    columns.join(","),
    ...rows.map((row) => [
      row.id,
      row.commercial_name,
      row.category,
      row.city,
      row.county,
      row.primary_email,
      row.primary_phone,
      row.website,
      row.facebook_url,
      row.estimated_items_count,
      row.score,
      row.status,
      row.main_source,
      row.source_url,
      row.last_checked_at
    ].map(csvEscape).join(","))
  ].join("\n");
}

function parseCsvLine(line = "", delimiter = ",") {
  const cells = [];
  let cell = "";
  let inQuotes = false;
  const raw = String(line || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function detectCsvDelimiter(line = "") {
  const candidates = [",", ";", "\t", "^"];
  return candidates
    .map((delimiter) => ({ delimiter, count: String(line || "").split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function normalizeHeader(value = "") {
  return safeText(value)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvText(text = "") {
  const lines = String(text || "").split(/\r?\n/).filter((line) => safeText(line));
  if (!lines.length) return [];
  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line, delimiter);
    const row = { _line: index + 2 };
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
    });
    return row;
  });
}

function firstMapped(row = {}, aliases = []) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (safeText(value)) return safeText(value);
  }
  return "";
}

export async function importLeadCsvText(db, companyId = 0, csvText = "", options = {}) {
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);
  const rows = parseCsvText(csvText);
  if (!rows.length) return { ok: false, error: "empty_csv", imported: 0, skipped: 0, errors: [] };
  const campaignName = safeText(options.campaign_name) || "Import manual Lead Builder";
  const category = normalizeCategory(options.category || "b2b");
  db.prepare(`
    INSERT OR IGNORE INTO lead_campaigns (
      company_id, name, target_product, domain, category, country, county,
      city_list, keywords, max_results, status, created_by_email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(
    Number(companyId || 0),
    campaignName,
    safeText(options.target_product) || "Nexora",
    safeText(options.activity_domain) || CATEGORY_PRESETS[category]?.domain || "",
    category,
    safeText(options.country) || DEFAULT_COUNTRY,
    safeText(options.county),
    safeText(options.city),
    safeText(options.keywords),
    rows.length,
    safeText(options.actor_email)
  );
  const campaign = db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND name=?").get(Number(companyId || 0), campaignName);
  const importId = Number(db.prepare(`
    INSERT INTO lead_imports (
      company_id, source_type, file_name, mapping_json, row_count, status, created_by_email
    ) VALUES (?, 'csv_text', ?, ?, ?, 'processing', ?)
  `).run(
    Number(companyId || 0),
    safeText(options.file_name || "lead-builder-import.csv"),
    json({ mode: "auto_headers" }),
    rows.length,
    safeText(options.actor_email)
  ).lastInsertRowid || 0);

  let imported = 0;
  let skipped = 0;
  const errors = [];
  const search = {
    id: null,
    campaign_id: campaign?.id || null,
    category,
    activity_domain: safeText(options.activity_domain) || CATEGORY_PRESETS[category]?.domain || "",
    country: safeText(options.country) || DEFAULT_COUNTRY,
    county: safeText(options.county),
    city: safeText(options.city),
    sources_json: json(["manual_import", options.enrich_websites ? "public_website" : ""].filter(Boolean)),
    collect_email: 1,
    collect_phone: 1,
    collect_website: options.enrich_websites ? 1 : 0,
    collect_facebook: 1,
    collect_instagram: 1,
    collect_linkedin: 1,
    collect_address: 1,
    check_online_store: options.enrich_websites ? 1 : 0,
    check_existing_crm: 1,
    check_existing_emarqet: 1,
    auto_sync_crm: 1
  };

  for (const row of rows) {
    const companyName = firstMapped(row, ["Company Name", "Denumire companie", "Denumire", "Firma", "Name", "Nume"]);
    if (!companyName) {
      skipped += 1;
      errors.push({ line: row._line, error: "missing_company_name" });
      continue;
    }
    const candidate = {
      source_key: "manual_import",
      source_name: "Import manual CSV",
      external_id: `import:${importId}:${row._line}`,
      source_url: firstMapped(row, ["Source URL", "Sursa", "URL sursa"]),
      commercial_name: companyName,
      legal_name: firstMapped(row, ["Legal Name", "Denumire juridica"]),
      cui: firstMapped(row, ["CUI", "CIF", "Cod fiscal"]),
      registration_number: firstMapped(row, ["Registration Number", "Nr Reg Com", "Reg Com"]),
      category,
      activity_domain: search.activity_domain,
      country: firstMapped(row, ["Country", "Tara"]) || search.country,
      county: firstMapped(row, ["County", "Judet"]) || search.county,
      city: firstMapped(row, ["City", "Oras", "Localitate"]) || search.city,
      address: firstMapped(row, ["Address", "Adresa"]),
      email: firstMapped(row, ["Email Address", "Email", "Mail"]),
      phone: firstMapped(row, ["Phone", "Telefon", "Mobil"]),
      website: normalizeWebsite(firstMapped(row, ["Website URL", "Website", "Site", "URL"])),
      facebook_url: firstMapped(row, ["Facebook", "Facebook URL"]),
      instagram_url: firstMapped(row, ["Instagram", "Instagram URL"]),
      linkedin_url: firstMapped(row, ["LinkedIn", "LinkedIn URL"]),
      contact_person: firstMapped(row, ["Contact Name", "Persoana contact"]),
      raw_payload: row
    };
    try {
      await persistCandidate(db, companyId, search, candidate, safeText(options.actor_email || "lead-builder-import"));
      imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push({ line: row._line, company: companyName, error: error?.message || String(error) });
    }
  }

  db.prepare(`
    UPDATE lead_imports
    SET imported_count=?, skipped_count=?, status=?, error=?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    imported,
    skipped,
    errors.length ? "completed_with_errors" : "completed",
    errors.length ? JSON.stringify(errors.slice(0, 20)) : "",
    importId,
    Number(companyId || 0)
  );
  return { ok: true, importId, totalRows: rows.length, imported, skipped, errors };
}

export function leadSources(db, companyId = 0) {
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);
  return db.prepare("SELECT * FROM lead_sources WHERE company_id=? ORDER BY source_key ASC").all(Number(companyId || 0));
}

export function updateLeadSource(db, companyId = 0, sourceId = 0, data = {}) {
  ensureLeadBuilderSchema(db);
  const encrypted = safeText(data.api_key) ? encryptLeadSecret(data.api_key) : undefined;
  const source = db.prepare("SELECT * FROM lead_sources WHERE id=? AND company_id=?").get(Number(sourceId || 0), Number(companyId || 0));
  if (!source) return { ok: false, error: "missing_source" };
  db.prepare(`
    UPDATE lead_sources
    SET is_active=?, access_method=?, api_key_encrypted=COALESCE(?, api_key_encrypted),
      limits_json=?, respects_robots=?, terms_url=?, notes=?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    truthy(data.is_active) ? 1 : 0,
    safeText(data.access_method || source.access_method),
    encrypted ?? null,
    safeText(data.limits_json) || source.limits_json || "{}",
    truthy(data.respects_robots ?? "1") ? 1 : 0,
    safeText(data.terms_url || source.terms_url),
    safeText(data.notes || source.notes),
    Number(sourceId || 0),
    Number(companyId || 0)
  );
  return { ok: true };
}

export { LEAD_PIPELINE_STAGES, DEFAULT_SCORE_CONFIG };
