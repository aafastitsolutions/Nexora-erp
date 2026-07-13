import crypto from "node:crypto";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CACHE_DAYS = 30;
const DEFAULT_DAILY_LIMIT = 250;
const DEFAULT_RPM_LIMIT = 20;
const DEFAULT_AUTO_THRESHOLD = 85;
const DEFAULT_REVIEW_THRESHOLD = 65;

export const GOOGLE_PLACES_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "nextPageToken"
].join(",");

export const GOOGLE_PLACES_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "primaryType",
  "types",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "googleMapsUri"
].join(",");

const GOOGLE_PLACES_NEARBY_FIELD_MASK = GOOGLE_PLACES_SEARCH_FIELD_MASK.replace(",nextPageToken", "");

const AUTO_PARK_POSITIVE = [
  "parc auto",
  "parcuri auto",
  "autorulate",
  "auto rulate",
  "masini rulate",
  "masina rulata",
  "autoturisme rulate",
  "second hand",
  "second-hand",
  "sh auto",
  "vanzari auto",
  "vanzare auto",
  "auto in rate",
  "autoturisme in rate",
  "import auto"
];

const AUTO_OFFICIAL_DEALER_HINTS = [
  "reprezentanta",
  "reprezentanță",
  "dealer autorizat",
  "service autorizat",
  "showroom",
  "autoklass",
  "tiriac auto",
  "radacini",
  "eurial",
  "proleasing",
  "serus",
  "dacia",
  "renault",
  "volkswagen",
  "vw",
  "skoda",
  "mercedes",
  "mercedes benz",
  "bmw",
  "audi",
  "toyota",
  "ford",
  "hyundai",
  "kia",
  "peugeot",
  "citroen",
  "opel",
  "suzuki",
  "seat",
  "mazda",
  "honda",
  "nissan",
  "fiat",
  "jeep",
  "land rover",
  "volvo",
  "porsche"
];

const AUTO_SERVICE_ONLY_HINTS = [
  "dezmembr",
  "itp",
  "vulcaniz",
  "anvelope",
  "piese auto",
  "car wash",
  "spalatorie",
  "rent a car",
  "inchirieri auto",
  "tractari",
  "tinichigerie",
  "vopsitorie"
];

function safeText(value = "") {
  return String(value ?? "").trim();
}

function truthy(value) {
  return ["1", "true", "yes", "on", "da"].includes(String(value ?? "").trim().toLowerCase());
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeKey(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excludeOfficialAutoReps() {
  return !["0", "false", "no", "nu"].includes(String(process.env.EMARQET_AUTO_EXCLUDE_OFFICIAL_REPS ?? "true").trim().toLowerCase());
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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

function normalizePhone(value = "", country = "Romania") {
  const original = safeText(value);
  if (!original) return "";
  let digits = original.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) return `+${digits.replace(/\D/g, "")}`;
  const onlyDigits = digits.replace(/\D/g, "");
  if (!onlyDigits) return "";
  if (normalizeKey(country).includes("romania")) {
    if (onlyDigits.startsWith("40")) return `+${onlyDigits}`;
    if (onlyDigits.startsWith("0") && onlyDigits.length >= 10) return `+40${onlyDigits.slice(1)}`;
  }
  return onlyDigits.length >= 8 ? `+${onlyDigits}` : "";
}

function normalizeWebsite(value = "") {
  const raw = safeText(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
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

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  if (!tableExists(db, tableName) || columnExists(db, tableName, columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function expiryIso(days = DEFAULT_CACHE_DAYS) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Math.max(1, Number(days || DEFAULT_CACHE_DAYS)));
  return date.toISOString();
}

function sanitizeError(message = "", apiKey = "") {
  let text = safeText(message);
  if (apiKey) text = text.replaceAll(apiKey, "[redacted-google-api-key]");
  return text.slice(0, 1000);
}

export function googlePlacesConfigFromEnv(env = process.env) {
  const apiKey = safeText(env.GOOGLE_PLACES_API_KEY);
  const enabledRaw = safeText(env.GOOGLE_PLACES_ENABLED);
  return {
    enabled: enabledRaw ? truthy(enabledRaw) : Boolean(apiKey),
    apiKey,
    dailyLimit: clampNumber(env.GOOGLE_PLACES_DAILY_LIMIT, DEFAULT_DAILY_LIMIT, 1, 100000),
    requestsPerMinute: clampNumber(env.GOOGLE_PLACES_REQUESTS_PER_MINUTE, DEFAULT_RPM_LIMIT, 1, 1000),
    autoMatchThreshold: clampNumber(env.GOOGLE_PLACES_AUTO_MATCH_THRESHOLD, DEFAULT_AUTO_THRESHOLD, 1, 100),
    reviewThreshold: clampNumber(env.GOOGLE_PLACES_REVIEW_THRESHOLD, DEFAULT_REVIEW_THRESHOLD, 1, 100),
    timeoutMs: clampNumber(env.GOOGLE_PLACES_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 60000),
    cacheDays: clampNumber(env.GOOGLE_PLACES_CACHE_DAYS, DEFAULT_CACHE_DAYS, 1, 365),
    maxResultsPerJob: clampNumber(env.GOOGLE_PLACES_MAX_RESULTS_PER_JOB, 100, 1, 500),
    maxQueriesPerJob: clampNumber(env.GOOGLE_PLACES_MAX_QUERIES_PER_JOB, 16, 1, 100),
    estimatedCostPerRequest: clampNumber(env.GOOGLE_PLACES_ESTIMATED_COST_PER_REQUEST, 0, 0, 1000)
  };
}

export function googlePlacesAvailable(env = process.env) {
  const config = googlePlacesConfigFromEnv(env);
  return Boolean(config.enabled && config.apiKey);
}

export function ensureGooglePlacesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_places_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      cache_key TEXT NOT NULL,
      request_type TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      field_mask TEXT,
      response_json TEXT NOT NULL DEFAULT '{}',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, cache_key)
    );

    CREATE TABLE IF NOT EXISTS google_places_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      usage_date TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, usage_date)
    );

    CREATE TABLE IF NOT EXISTS google_places_request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      request_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      cache_hit INTEGER NOT NULL DEFAULT 0,
      query TEXT,
      place_id TEXT,
      field_mask TEXT,
      estimated_cost REAL NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_google_places_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER,
      lead_company_id INTEGER,
      google_place_id TEXT NOT NULL,
      google_name TEXT,
      google_phone TEXT,
      google_website TEXT,
      google_address TEXT,
      google_locality TEXT,
      google_category TEXT,
      google_rating REAL,
      google_review_count INTEGER NOT NULL DEFAULT 0,
      google_business_status TEXT,
      google_maps_uri TEXT,
      latitude REAL,
      longitude REAL,
      match_score INTEGER NOT NULL DEFAULT 0,
      match_status TEXT NOT NULL DEFAULT 'needs_review',
      verification_status TEXT NOT NULL DEFAULT 'neverificat',
      request_query TEXT,
      source_json TEXT NOT NULL DEFAULT '{}',
      last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      rejected_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, lead_id, google_place_id)
    );

    CREATE TABLE IF NOT EXISTS lead_field_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_company_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      field_value TEXT,
      source_key TEXT NOT NULL,
      source_url TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      is_manual_confirmed INTEGER NOT NULL DEFAULT 0,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      UNIQUE(company_id, lead_company_id, field_name, source_key, field_value)
    );

    CREATE INDEX IF NOT EXISTS idx_google_places_cache_company_expires ON google_places_cache(company_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_google_places_logs_company_created ON google_places_request_logs(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_google_matches_lead ON lead_google_places_matches(company_id, lead_id, match_status);
    CREATE INDEX IF NOT EXISTS idx_google_matches_company_record ON lead_google_places_matches(company_id, lead_company_id);
  `);

  for (const [name, definition] of [
    ["google_place_id", "TEXT"],
    ["google_name", "TEXT"],
    ["google_phone", "TEXT"],
    ["google_website", "TEXT"],
    ["google_address", "TEXT"],
    ["google_locality", "TEXT"],
    ["google_category", "TEXT"],
    ["google_rating", "REAL"],
    ["google_review_count", "INTEGER NOT NULL DEFAULT 0"],
    ["google_business_status", "TEXT"],
    ["google_maps_uri", "TEXT"],
    ["google_match_score", "INTEGER NOT NULL DEFAULT 0"],
    ["google_match_status", "TEXT"],
    ["google_last_checked_at", "TEXT"]
  ]) {
    addColumnIfMissing(db, "lead_companies", name, definition);
  }

  if (tableExists(db, "lead_companies")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_lead_companies_google_place ON lead_companies(company_id, google_place_id)");
  }
}

function addressComponent(place = {}, types = []) {
  const wanted = new Set(types);
  for (const component of place.addressComponents || []) {
    const componentTypes = new Set(component.types || []);
    if ([...wanted].some((type) => componentTypes.has(type))) {
      return safeText(component.longText || component.shortText);
    }
  }
  return "";
}

export function googlePlaceDisplayName(place = {}) {
  return safeText(place.displayName?.text || place.displayName || place.name);
}

export function googlePlaceLocality(place = {}) {
  return addressComponent(place, ["locality", "postal_town"]) ||
    addressComponent(place, ["administrative_area_level_2"]) ||
    addressComponent(place, ["administrative_area_level_1"]);
}

function googlePlacePhone(place = {}) {
  return safeText(place.nationalPhoneNumber || place.internationalPhoneNumber);
}

function googlePlaceWebsite(place = {}) {
  return normalizeWebsite(place.websiteUri);
}

function autoText(placeOrCandidate = {}) {
  return normalizeKey([
    googlePlaceDisplayName(placeOrCandidate),
    placeOrCandidate.commercial_name,
    placeOrCandidate.google_name,
    placeOrCandidate.formattedAddress,
    placeOrCandidate.google_address,
    placeOrCandidate.google_category,
    placeOrCandidate.primaryType,
    placeOrCandidate.website,
    placeOrCandidate.google_website,
    placeOrCandidate.source_url,
    ...(placeOrCandidate.types || [])
  ].filter(Boolean).join(" "));
}

export function autoParkFitScore(placeOrCandidate = {}, query = "") {
  const key = autoText(placeOrCandidate);
  const queryKey = normalizeKey(query);
  const primaryType = safeText(placeOrCandidate.primaryType || placeOrCandidate.google_category || placeOrCandidate.description);
  let score = 0;
  const reasons = [];
  for (const token of AUTO_PARK_POSITIVE) {
    if (key.includes(normalizeKey(token))) {
      score += token.includes("parc auto") ? 35 : 22;
      reasons.push(token);
    }
  }
  if (queryKey.includes("parc auto")) score += 12;
  if (queryKey.includes("rulate") || queryKey.includes("second")) score += 8;
  if (primaryType === "car_dealer" || (placeOrCandidate.types || []).includes("car_dealer")) {
    score += 10;
    reasons.push("car_dealer");
  }
  if (Number(placeOrCandidate.userRatingCount || placeOrCandidate.google_review_count || 0) >= 10) score += 4;
  if (googlePlaceWebsite(placeOrCandidate) || placeOrCandidate.google_website || placeOrCandidate.website) score += 4;
  if (AUTO_OFFICIAL_DEALER_HINTS.some((token) => key.includes(normalizeKey(token)))) {
    score -= excludeOfficialAutoReps() ? 80 : 18;
    reasons.push("reprezentanta_penalty");
  }
  if (AUTO_SERVICE_ONLY_HINTS.some((token) => key.includes(normalizeKey(token)))) {
    score -= 30;
    reasons.push("service_only_penalty");
  }
  if (["car_repair", "car_wash", "tire_shop", "car_rental"].includes(primaryType)) {
    score -= 35;
    reasons.push(`${primaryType}_penalty`);
  }
  return { score, reasons };
}

export function isLikelyAutoParkCandidate(placeOrCandidate = {}, query = "") {
  const fit = autoParkFitScore(placeOrCandidate, query);
  const key = autoText(placeOrCandidate);
  const primaryType = safeText(placeOrCandidate.primaryType || placeOrCandidate.google_category || placeOrCandidate.description);
  const hasStrongParkSignal = AUTO_PARK_POSITIVE.some((token) => key.includes(normalizeKey(token)));
  const officialHint = AUTO_OFFICIAL_DEALER_HINTS.some((token) => key.includes(normalizeKey(token)));
  const officialOnly = officialHint && (excludeOfficialAutoReps() || !hasStrongParkSignal);
  const serviceOnly = AUTO_SERVICE_ONLY_HINTS.some((token) => key.includes(normalizeKey(token)));
  const wrongGoogleType = ["car_repair", "car_wash", "tire_shop", "car_rental"].includes(primaryType) && !hasStrongParkSignal;
  return fit.score >= 6 && !serviceOnly && !officialOnly && !wrongGoogleType;
}

export function buildAutoParkGoogleQueries(search = {}, limit = 16) {
  const county = safeText(search.county);
  const country = safeText(search.country || "Romania");
  const rawCities = safeText(search.city)
    .split(/[,;\n]+/)
    .map(safeText)
    .filter(Boolean);
  const cities = rawCities.length ? rawCities : [county].filter(Boolean);
  const queries = [];
  const add = (value) => {
    const text = safeText(value).replace(/\s+/g, " ");
    if (!text) return;
    if (!queries.some((item) => normalizeKey(item) === normalizeKey(text))) queries.push(text);
  };

  if (normalizeKey(county).includes("prahova")) {
    [
      "parc auto Prahova",
      "parcuri auto Prahova",
      "auto rulate Prahova",
      "masini rulate Prahova",
      "autoturisme rulate Prahova",
      "auto second hand Prahova",
      "parc auto Ploiesti",
      "masini rulate Ploiesti",
      "parc auto Blejoi",
      "auto rulate Blejoi",
      "parc auto Campina",
      "auto rulate Campina",
      "parc auto Baicoi",
      "autoturisme in rate Prahova"
    ].forEach(add);
  }

  const keywords = safeText(search.keywords)
    .split(/[,;\n]+/)
    .map(safeText)
    .filter(Boolean);
  const preferredKeywords = [
    ...keywords.filter((keyword) => /parc|rulate|second|autorulate|rate/i.test(normalizeKey(keyword))),
    "parc auto",
    "auto rulate",
    "masini rulate",
    "autoturisme second hand"
  ];
  for (const keyword of preferredKeywords) {
    if (queries.length >= limit) break;
    for (const city of cities.slice(0, 8)) {
      if (queries.length >= limit) break;
      add([keyword, city, county, country].filter(Boolean).join(" "));
    }
  }
  return queries.slice(0, Math.max(1, Number(limit || 16)));
}

export function googlePlaceToLeadCandidate(place = {}, search = {}, meta = {}) {
  const name = googlePlaceDisplayName(place);
  const locality = googlePlaceLocality(place);
  const phone = googlePlacePhone(place);
  const website = googlePlaceWebsite(place);
  const fit = autoParkFitScore(place, meta.query || "");
  return {
    source_key: "google_places",
    source_name: "Google Places API (New)",
    external_id: safeText(place.id || place.name),
    source_url: safeText(place.googleMapsUri || ""),
    commercial_name: name,
    legal_name: "",
    category: safeText(search.category || "auto_dealers"),
    activity_domain: safeText(search.activity_domain || "Auto"),
    description: safeText(place.primaryType || (place.types || [])[0]),
    public_status: safeText(place.businessStatus || "OPERATIONAL"),
    country: safeText(search.country || "Romania"),
    county: safeText(search.county),
    city: locality || safeText(meta.city || search.city),
    address: safeText(place.formattedAddress),
    latitude: Number(place.location?.latitude) || null,
    longitude: Number(place.location?.longitude) || null,
    map_url: safeText(place.googleMapsUri || ""),
    phone,
    website,
    has_google_business: 1,
    google_place_id: safeText(place.id || place.name),
    google_name: name,
    google_phone: phone,
    google_website: website,
    google_address: safeText(place.formattedAddress),
    google_locality: locality,
    google_category: safeText(place.primaryType || (place.types || [])[0]),
    google_rating: Number(place.rating || 0) || null,
    google_review_count: Number(place.userRatingCount || 0),
    google_business_status: safeText(place.businessStatus || ""),
    google_maps_uri: safeText(place.googleMapsUri || ""),
    google_match_score: Math.max(0, Math.min(100, fit.score + 55)),
    google_match_status: "google_discovery",
    google_fit_score: fit.score,
    google_fit_reasons: fit.reasons,
    raw_payload: { ...place, google_query: meta.query || "" }
  };
}

function fieldValue(place = {}, field = "") {
  if (field === "google_place_id") return safeText(place.id || place.google_place_id || place.name);
  if (field === "google_name") return googlePlaceDisplayName(place) || safeText(place.google_name);
  if (field === "google_phone") return googlePlacePhone(place) || safeText(place.google_phone);
  if (field === "google_website") return googlePlaceWebsite(place) || normalizeWebsite(place.google_website);
  if (field === "google_address") return safeText(place.formattedAddress || place.google_address);
  if (field === "google_locality") return googlePlaceLocality(place) || safeText(place.google_locality);
  if (field === "google_category") return safeText(place.primaryType || place.google_category || (place.types || [])[0]);
  if (field === "google_rating") return Number(place.rating ?? place.google_rating ?? 0) || null;
  if (field === "google_review_count") return Number(place.userRatingCount ?? place.google_review_count ?? 0) || 0;
  if (field === "google_business_status") return safeText(place.businessStatus || place.google_business_status);
  if (field === "google_maps_uri") return safeText(place.googleMapsUri || place.google_maps_uri);
  return "";
}

export function upsertLeadGooglePlaceMatch(db, companyId = 0, data = {}) {
  ensureGooglePlacesSchema(db);
  const place = data.place || {};
  const leadId = Number(data.leadId || data.lead_id || 0) || null;
  const leadCompanyId = Number(data.leadCompanyId || data.lead_company_id || 0) || null;
  const googlePlaceId = fieldValue(place, "google_place_id");
  if (!googlePlaceId) return { ok: false, error: "missing_google_place_id" };
  const score = Math.max(0, Math.min(100, Math.round(Number(data.score ?? place.google_match_score ?? 0) || 0)));
  const status = safeText(data.status || place.google_match_status || "needs_review");
  const values = {
    company_id: Number(companyId || 0),
    lead_id: leadId,
    lead_company_id: leadCompanyId,
    google_place_id: googlePlaceId,
    google_name: fieldValue(place, "google_name"),
    google_phone: fieldValue(place, "google_phone"),
    google_website: fieldValue(place, "google_website"),
    google_address: fieldValue(place, "google_address"),
    google_locality: fieldValue(place, "google_locality"),
    google_category: fieldValue(place, "google_category"),
    google_rating: fieldValue(place, "google_rating"),
    google_review_count: fieldValue(place, "google_review_count"),
    google_business_status: fieldValue(place, "google_business_status"),
    google_maps_uri: fieldValue(place, "google_maps_uri"),
    latitude: Number(place.location?.latitude ?? place.latitude ?? 0) || null,
    longitude: Number(place.location?.longitude ?? place.longitude ?? 0) || null,
    match_score: score,
    match_status: status,
    verification_status: status === "confirmed" ? "confirmat_manual" : status === "auto_matched" ? "verificat_google" : "needs_review",
    request_query: safeText(data.query || place.raw_payload?.google_query || ""),
    source_json: json(place.raw_payload || place)
  };

  db.prepare(`
    INSERT INTO lead_google_places_matches (
      company_id, lead_id, lead_company_id, google_place_id, google_name, google_phone,
      google_website, google_address, google_locality, google_category, google_rating,
      google_review_count, google_business_status, google_maps_uri, latitude, longitude,
      match_score, match_status, verification_status, request_query, source_json, last_checked_at
    ) VALUES (
      @company_id, @lead_id, @lead_company_id, @google_place_id, @google_name, @google_phone,
      @google_website, @google_address, @google_locality, @google_category, @google_rating,
      @google_review_count, @google_business_status, @google_maps_uri, @latitude, @longitude,
      @match_score, @match_status, @verification_status, @request_query, @source_json, datetime('now')
    )
    ON CONFLICT(company_id, lead_id, google_place_id)
    DO UPDATE SET
      lead_company_id=COALESCE(excluded.lead_company_id, lead_google_places_matches.lead_company_id),
      google_name=excluded.google_name,
      google_phone=excluded.google_phone,
      google_website=excluded.google_website,
      google_address=excluded.google_address,
      google_locality=excluded.google_locality,
      google_category=excluded.google_category,
      google_rating=excluded.google_rating,
      google_review_count=excluded.google_review_count,
      google_business_status=excluded.google_business_status,
      google_maps_uri=excluded.google_maps_uri,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      match_score=excluded.match_score,
      match_status=excluded.match_status,
      verification_status=excluded.verification_status,
      request_query=excluded.request_query,
      source_json=excluded.source_json,
      last_checked_at=datetime('now'),
      updated_at=datetime('now')
  `).run(values);

  if (leadCompanyId) {
    db.prepare(`
      UPDATE lead_companies
      SET google_place_id=?,
          google_name=?,
          google_phone=?,
          google_website=?,
          google_address=?,
          google_locality=?,
          google_category=?,
          google_rating=?,
          google_review_count=?,
          google_business_status=?,
          google_maps_uri=?,
          google_match_score=?,
          google_match_status=?,
          google_last_checked_at=datetime('now'),
          has_google_business=1,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      values.google_place_id,
      values.google_name,
      values.google_phone,
      values.google_website,
      values.google_address,
      values.google_locality,
      values.google_category,
      values.google_rating,
      values.google_review_count,
      values.google_business_status,
      values.google_maps_uri,
      values.match_score,
      values.match_status,
      leadCompanyId,
      Number(companyId || 0)
    );

    const existing = db.prepare("SELECT primary_phone, website, verification_status FROM lead_companies WHERE id=? AND company_id=?")
      .get(leadCompanyId, Number(companyId || 0)) || {};
    const canUpdatePublicFields = ["auto_matched", "confirmed"].includes(status) &&
      !normalizeKey(existing.verification_status).includes("confirmat manual");
    if (canUpdatePublicFields && values.google_phone && !safeText(existing.primary_phone)) {
      db.prepare("UPDATE lead_companies SET primary_phone=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(normalizePhone(values.google_phone), leadCompanyId, Number(companyId || 0));
      db.prepare(`
        INSERT OR IGNORE INTO lead_phones (company_id, lead_company_id, phone_original, phone_normalized, phone_type, is_primary, source, source_url)
        VALUES (?, ?, ?, ?, ?, 1, 'google_places', ?)
      `).run(Number(companyId || 0), leadCompanyId, values.google_phone, normalizePhone(values.google_phone), normalizePhone(values.google_phone).startsWith("+407") ? "mobil" : "necunoscut", values.google_maps_uri);
    }
    if (canUpdatePublicFields && values.google_website && !safeText(existing.website)) {
      db.prepare("UPDATE lead_companies SET website=?, has_website=1, updated_at=datetime('now') WHERE id=? AND company_id=?")
        .run(values.google_website, leadCompanyId, Number(companyId || 0));
      db.prepare(`
        INSERT OR IGNORE INTO lead_websites (company_id, lead_company_id, url, domain, source, availability_status, checked_at)
        VALUES (?, ?, ?, ?, 'google_places', 'neverificat', datetime('now'))
      `).run(Number(companyId || 0), leadCompanyId, values.google_website, websiteDomain(values.google_website));
    }

    for (const [field, value] of Object.entries({
      google_place_id: values.google_place_id,
      google_name: values.google_name,
      google_phone: values.google_phone,
      google_website: values.google_website,
      google_address: values.google_address,
      google_locality: values.google_locality,
      google_category: values.google_category,
      google_maps_uri: values.google_maps_uri
    })) {
      if (!safeText(value)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO lead_field_provenance (
          company_id, lead_company_id, field_name, field_value, source_key, source_url, confidence_score, is_manual_confirmed
        ) VALUES (?, ?, ?, ?, 'google_places', ?, ?, ?)
      `).run(Number(companyId || 0), leadCompanyId, field, String(value), values.google_maps_uri, score, status === "confirmed" ? 1 : 0);
    }
  }

  return { ok: true, google_place_id: googlePlaceId, match_score: score, match_status: status };
}

export class GooglePlacesService {
  constructor(options = {}) {
    const envConfig = googlePlacesConfigFromEnv(options.env || process.env);
    this.db = options.db || null;
    this.companyId = Number(options.companyId || options.company_id || 0);
    this.enabled = options.enabled ?? envConfig.enabled;
    this.apiKey = safeText(options.apiKey || envConfig.apiKey);
    this.dailyLimit = Number(options.dailyLimit || envConfig.dailyLimit);
    this.requestsPerMinute = Number(options.requestsPerMinute || envConfig.requestsPerMinute);
    this.autoMatchThreshold = Number(options.autoMatchThreshold || envConfig.autoMatchThreshold);
    this.reviewThreshold = Number(options.reviewThreshold || envConfig.reviewThreshold);
    this.timeoutMs = Number(options.timeoutMs || envConfig.timeoutMs);
    this.cacheDays = Number(options.cacheDays || envConfig.cacheDays);
    this.estimatedCostPerRequest = Number(options.estimatedCostPerRequest ?? envConfig.estimatedCostPerRequest);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.logger = options.logger || null;
  }

  assertReady() {
    if (!this.enabled) throw new Error("google_places_disabled");
    if (!this.apiKey) throw new Error("google_places_missing_api_key");
    if (typeof this.fetchImpl !== "function") throw new Error("fetch_unavailable");
    if (this.db) ensureGooglePlacesSchema(this.db);
  }

  cacheGet(cacheKey) {
    if (!this.db) return null;
    const row = this.db.prepare(`
      SELECT response_json
      FROM google_places_cache
      WHERE company_id=? AND cache_key=? AND (expires_at IS NULL OR expires_at>datetime('now'))
    `).get(this.companyId, cacheKey);
    return row ? parseJson(row.response_json, null) : null;
  }

  cacheSet(cacheKey, requestType, requestHash, fieldMask, payload) {
    if (!this.db) return;
    this.db.prepare(`
      INSERT INTO google_places_cache (
        company_id, cache_key, request_type, request_hash, field_mask, response_json, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(company_id, cache_key)
      DO UPDATE SET response_json=excluded.response_json, expires_at=excluded.expires_at,
        field_mask=excluded.field_mask, updated_at=datetime('now')
    `).run(this.companyId, cacheKey, requestType, requestHash, fieldMask, json(payload), expiryIso(this.cacheDays));
  }

  estimatedCost() {
    return Number(this.estimatedCostPerRequest || 0);
  }

  checkLimits() {
    if (!this.db) return;
    const usage = this.db.prepare(`
      SELECT request_count
      FROM google_places_usage
      WHERE company_id=? AND usage_date=?
    `).get(this.companyId, todayIso());
    if (Number(usage?.request_count || 0) >= this.dailyLimit) throw new Error("google_places_daily_limit_reached");
    const rpm = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM google_places_request_logs
      WHERE company_id=? AND cache_hit=0 AND created_at>=datetime('now','-60 seconds')
    `).get(this.companyId);
    if (Number(rpm?.total || 0) >= this.requestsPerMinute) throw new Error("google_places_rate_limit_reached");
  }

  logRequest(requestType, status, data = {}) {
    if (!this.db) return;
    const estimatedCost = data.cacheHit ? 0 : this.estimatedCost();
    this.db.prepare(`
      INSERT INTO google_places_request_logs (
        company_id, request_type, status, cache_hit, query, place_id, field_mask, estimated_cost, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.companyId,
      safeText(requestType),
      safeText(status || "ok"),
      data.cacheHit ? 1 : 0,
      safeText(data.query),
      safeText(data.placeId),
      safeText(data.fieldMask),
      estimatedCost,
      sanitizeError(data.error || "", this.apiKey)
    );
    if (!data.cacheHit) {
      this.db.prepare(`
        INSERT INTO google_places_usage (company_id, usage_date, request_count, estimated_cost, updated_at)
        VALUES (?, ?, 1, ?, datetime('now'))
        ON CONFLICT(company_id, usage_date)
        DO UPDATE SET request_count=request_count+1,
          estimated_cost=estimated_cost+excluded.estimated_cost,
          updated_at=datetime('now')
      `).run(this.companyId, todayIso(), estimatedCost);
    }
  }

  async requestJson(requestType, url, options = {}) {
    this.assertReady();
    const method = options.method || "POST";
    const body = options.body || null;
    const fieldMask = safeText(options.fieldMask);
    const requestHash = sha256(`${method}:${url}:${fieldMask}:${JSON.stringify(body || {})}`);
    const cacheKey = `${requestType}:${requestHash}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) {
      this.logRequest(requestType, "ok", { ...options.log, cacheHit: true, fieldMask });
      return { ...cached, _cacheHit: true };
    }
    this.checkLimits();

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": fieldMask
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        const text = await response.text();
        const payload = parseJson(text, {});
        if (!response.ok) {
          const message = payload?.error?.message || `${response.status} ${response.statusText}: ${text.slice(0, 240)}`;
          const retryable = [408, 429, 500, 502, 503, 504].includes(Number(response.status));
          if (retryable && attempt < 2) {
            lastError = new Error(message);
            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1) ** 2));
            continue;
          }
          throw new Error(message);
        }
        this.cacheSet(cacheKey, requestType, requestHash, fieldMask, payload);
        this.logRequest(requestType, "ok", { ...options.log, cacheHit: false, fieldMask });
        return payload;
      } catch (error) {
        lastError = error;
        if (attempt < 2 && !["google_places_daily_limit_reached", "google_places_rate_limit_reached"].includes(error?.message)) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1) ** 2));
          continue;
        }
        break;
      }
    }
    const message = sanitizeError(lastError?.message || String(lastError), this.apiKey);
    this.logRequest(requestType, "error", { ...options.log, cacheHit: false, fieldMask, error: message });
    this.logger?.("error", "Google Places request failed", { requestType, error: message });
    throw new Error(message);
  }

  async searchText(query = "", location = {}) {
    const textQuery = safeText(query);
    if (!textQuery) return [];
    const pageSize = clampNumber(location.pageSize || location.maxResultCount, 10, 1, 20);
    const body = {
      textQuery,
      languageCode: safeText(location.languageCode || "ro"),
      regionCode: safeText(location.regionCode || "RO"),
      pageSize,
      includePureServiceAreaBusinesses: Boolean(location.includePureServiceAreaBusinesses || false)
    };
    if (safeText(location.includedType)) body.includedType = safeText(location.includedType);
    if (location.strictTypeFiltering != null) body.strictTypeFiltering = Boolean(location.strictTypeFiltering);
    if (safeText(location.pageToken)) body.pageToken = safeText(location.pageToken);
    if (Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
      body.locationBias = {
        circle: {
          center: { latitude: Number(location.latitude), longitude: Number(location.longitude) },
          radius: clampNumber(location.radius, 15000, 500, 50000)
        }
      };
    }
    const payload = await this.requestJson("text_search", TEXT_SEARCH_URL, {
      method: "POST",
      fieldMask: safeText(location.fieldMask || GOOGLE_PLACES_SEARCH_FIELD_MASK),
      body,
      log: { query: textQuery }
    });
    const places = Array.isArray(payload.places) ? payload.places : [];
    Object.defineProperty(places, "nextPageToken", { value: safeText(payload.nextPageToken), enumerable: false });
    Object.defineProperty(places, "cacheHit", { value: Boolean(payload._cacheHit), enumerable: false });
    return places;
  }

  async searchNearby(latitude, longitude, radius = 10000, categories = []) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const includedTypes = (Array.isArray(categories) ? categories : [categories]).map(safeText).filter(Boolean);
    const body = {
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: clampNumber(radius, 10000, 100, 50000)
        }
      }
    };
    if (includedTypes.length) body.includedTypes = includedTypes.slice(0, 50);
    const payload = await this.requestJson("nearby_search", NEARBY_SEARCH_URL, {
      method: "POST",
      fieldMask: GOOGLE_PLACES_NEARBY_FIELD_MASK,
      body,
      log: { query: includedTypes.join(","), placeId: "" }
    });
    return Array.isArray(payload.places) ? payload.places : [];
  }

  async getPlaceDetails(placeId = "") {
    const id = safeText(placeId).replace(/^places\//, "");
    if (!id) return null;
    return this.requestJson("place_details", `${PLACE_DETAILS_URL}/${encodeURIComponent(id)}`, {
      method: "GET",
      fieldMask: GOOGLE_PLACES_DETAILS_FIELD_MASK,
      log: { placeId: id }
    });
  }

  async findOfficialWebsite(placeId = "") {
    const place = await this.getPlaceDetails(placeId);
    return googlePlaceWebsite(place || {});
  }

  calculateMatchScore(lead = {}, place = {}) {
    let score = 0;
    const reasons = [];
    const add = (key, points, ok) => {
      if (!ok) return;
      score += points;
      reasons.push(key);
    };
    const leadName = normalizeKey(lead.commercial_name || lead.name || lead.title);
    const placeName = normalizeKey(googlePlaceDisplayName(place));
    const leadCity = normalizeKey(lead.city || lead.locality);
    const placeCity = normalizeKey(googlePlaceLocality(place));
    const leadAddress = normalizeKey(lead.address);
    const placeAddress = normalizeKey(place.formattedAddress || place.google_address);
    const leadCategory = normalizeKey(lead.category);
    const placeCategory = normalizeKey(place.primaryType || place.google_category || (place.types || [])[0]);
    const leadWebsite = websiteDomain(lead.website || lead.google_website);
    const placeWebsite = websiteDomain(googlePlaceWebsite(place) || place.google_website);
    const leadPhone = normalizePhone(lead.primary_phone || lead.phone || lead.google_phone);
    const placePhone = normalizePhone(googlePlacePhone(place) || place.google_phone);
    add("nume_foarte_apropiat", 40, leadName && placeName && (leadName === placeName || placeName.includes(leadName) || leadName.includes(placeName)));
    add("aceeasi_localitate", 20, leadCity && placeCity && (leadCity === placeCity || placeCity.includes(leadCity) || leadCity.includes(placeCity)));
    add("aceeasi_adresa", 15, leadAddress && placeAddress && (placeAddress.includes(leadAddress) || leadAddress.includes(placeAddress)));
    add("aceeasi_categorie", 10, leadCategory && placeCategory && (leadCategory.includes("auto") ? placeCategory.includes("car dealer") || placeCategory.includes("car") : placeCategory.includes(leadCategory)));
    add("acelasi_website", 10, leadWebsite && placeWebsite && leadWebsite === placeWebsite);
    add("acelasi_telefon", 5, leadPhone && placePhone && leadPhone === placePhone);
    return { score: Math.max(0, Math.min(100, score)), reasons };
  }

  matchLeadToPlace(lead = {}, place = {}) {
    const result = this.calculateMatchScore(lead, place);
    const status = result.score >= this.autoMatchThreshold
      ? "auto_matched"
      : result.score >= this.reviewThreshold
        ? "needs_review"
        : "rejected";
    return { ...result, status };
  }

  buildLeadQuery(lead = {}) {
    return [
      lead.commercial_name || lead.title || lead.name,
      lead.city,
      lead.county,
      lead.category,
      lead.country || "Romania"
    ].map(safeText).filter(Boolean).join(" ");
  }

  async enrichLead(leadId = 0, options = {}) {
    this.assertReady();
    const lead = this.db?.prepare(`
      SELECT l.id AS lead_id, l.lead_company_id, c.*
      FROM leads l
      JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
      WHERE l.id=? AND l.company_id=?
    `).get(Number(leadId || 0), this.companyId);
    if (!lead) return { ok: false, error: "missing_lead" };
    const query = safeText(options.query) || this.buildLeadQuery(lead);
    const places = await this.searchText(query, {
      pageSize: clampNumber(options.pageSize, 5, 1, 20),
      includedType: safeText(options.includedType || ""),
      strictTypeFiltering: false
    });
    let best = null;
    for (const place of places) {
      const match = this.matchLeadToPlace(lead, place);
      const fit = autoParkFitScore(place, query).score;
      const weighted = match.score + Math.max(-20, Math.min(20, Math.round(fit / 3)));
      if (!best || weighted > best.weighted) best = { place, match, weighted };
    }
    if (!best?.place) return { ok: true, found: 0, updated: 0, query };
    const saved = upsertLeadGooglePlaceMatch(this.db, this.companyId, {
      leadId: lead.lead_id,
      leadCompanyId: lead.lead_company_id,
      place: best.place,
      score: best.match.score,
      status: best.match.status,
      query
    });
    if (best.match.status === "rejected") {
      return { ok: true, found: places.length, updated: 0, query, best_match: saved, status: "rejected" };
    }
    this.db.prepare(`
      INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
      VALUES (?, ?, ?, 'google_places_enrich', 'Google Places verificat', ?, ?)
    `).run(this.companyId, lead.lead_id, lead.lead_company_id, `${googlePlaceDisplayName(best.place)} · scor ${best.match.score}`, safeText(options.actorEmail || "google-places"));
    return { ok: true, found: places.length, updated: best.match.status === "auto_matched" ? 1 : 0, query, best_match: saved, status: best.match.status };
  }

  async enrichCampaign(campaignId = 0, options = {}) {
    this.assertReady();
    const limit = clampNumber(options.limit, 50, 1, 200);
    const rows = this.db?.prepare(`
      SELECT l.id
      FROM leads l
      JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
      WHERE l.company_id=?
        AND l.campaign_id=?
        AND (COALESCE(c.primary_phone, '')='' OR COALESCE(c.website, '')='')
      ORDER BY l.score DESC, l.id ASC
      LIMIT ?
    `).all(this.companyId, Number(campaignId || 0), limit) || [];
    const stats = { ok: true, campaign_id: Number(campaignId || 0), requested: rows.length, enriched: 0, needs_review: 0, rejected: 0, errors: [] };
    for (const row of rows) {
      try {
        const result = await this.enrichLead(row.id, options);
        if (result.status === "auto_matched") stats.enriched += 1;
        if (result.status === "needs_review") stats.needs_review += 1;
        if (result.status === "rejected") stats.rejected += 1;
      } catch (error) {
        stats.errors.push({ lead_id: row.id, error: sanitizeError(error?.message || String(error), this.apiKey) });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return stats;
  }
}
