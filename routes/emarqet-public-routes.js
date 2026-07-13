import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import multer from "multer";
import Stripe from "stripe";
import readXlsxFile from "read-excel-file/node";
import {
  renderEmarqetAccountPage,
  renderEmarqetAuthPage,
  renderEmarqetBusinessPage,
  renderEmarqetContactPage,
  renderEmarqetCookiesPage,
  renderEmarqetDealerLandingPage,
  renderEmarqetGdprPage,
  renderEmarqetImportPage,
  renderEmarqetLegalInfoPage,
  renderEmarqetMarketplacePublishPage,
  renderEmarqetPartnersLandingPage,
  renderEmarqetPrivacyPage,
  renderEmarqetPublicHomePage,
  renderEmarqetPublicCheckoutPage,
  renderEmarqetPublicListingPage,
  renderEmarqetPublicListingsPage,
  renderEmarqetPublicNotFoundPage,
  renderEmarqetPublicPartnerPage,
  renderEmarqetPublicPricingPage,
  renderEmarqetPublicPublishPage,
  renderEmarqetPublicVerticalPage,
  renderEmarqetReferralSharePage,
  renderEmarqetSafetyPage,
  renderEmarqetTermsPage
} from "../src/ui/emarqet-public-pages.js";
import {
  emarqetDefaultVerticalRows,
  listingMatchesMetadataFilters,
  metadataFromBody,
  parseMetadata
} from "../lib/emarqet-categories.js";
import {
  ensureEmarqetAnalyticsSchema,
  recordEmarqetPageView
} from "../lib/emarqet-analytics.js";
import {
  createMarketplaceServiceRequest,
  decodeVinBasic,
  ensureMarketplaceServicesSchema,
  loadListingBadges,
  loadMarketplaceServices,
  marketplaceServicesPayload,
  seedMarketplaceServicesCatalog
} from "../lib/emarqet-marketplace-services.js";
import {
  emarqetStripeBillingDetails,
  finalizeEmarqetStripePayment,
  markEmarqetListingPaidAwaitingApproval,
  upsertEmarqetBillingPayment
} from "../lib/emarqet-billing.js";
import {
  emarqetPricingPayload,
  ensureEmarqetMonetizationSchema,
  loadEmarqetAddons,
  loadEmarqetPricingPlans,
  seedEmarqetMonetizationCatalog
} from "../lib/emarqet-monetization.js";
import {
  emarqetReferralShareKit,
  ensureEmarqetReferralSchema,
  ensureListingReferralCode,
  ensureUserReferralCode,
  loadEmarqetReferralStats,
  registerEmarqetReferralClick,
  registerEmarqetReferralShare
} from "../lib/emarqet-referral-campaign.js";

function safeText(value) {
  return String(value || "").trim();
}

const EMARQET_IMAGE_MIME_EXT = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const EMARQET_CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/octet-stream"
]);

function envEnabled(name, fallback = false) {
  const raw = safeText(process.env[name]).toLowerCase();
  if (!raw) return Boolean(fallback);
  return ["1", "true", "yes", "on"].includes(raw);
}

function emarqetUploadRoot() {
  const configured = safeText(process.env.EMARQET_UPLOAD_DIR);
  return path.resolve(configured || path.join(process.cwd(), "public", "uploads", "emarqet"));
}

function emarqetUploadPublicPrefix() {
  return safeText(process.env.EMARQET_UPLOAD_PUBLIC_PREFIX || "uploads/emarqet").replace(/^\/+|\/+$/g, "");
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function emarqetUploadSubdir() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return path.join("listings", year, month);
}

function uploadedImagePublicPath(file = {}) {
  if (!file?.filename || !file?.destination) return "";
  const relative = path.relative(emarqetUploadRoot(), file.path || path.join(file.destination, file.filename)).replaceAll(path.sep, "/");
  if (!relative || relative.startsWith("..")) return "";
  return `/${emarqetUploadPublicPrefix()}/${relative}`;
}

function cleanupUploadedFiles(files = []) {
  for (const file of files || []) {
    try {
      if (file?.path) fs.unlinkSync(file.path);
    } catch {
      // Upload cleanup is best effort.
    }
  }
}

const emarqetImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        cb(null, ensureDirectory(path.join(emarqetUploadRoot(), emarqetUploadSubdir())));
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const ext = EMARQET_IMAGE_MIME_EXT.get(String(file.mimetype || "").toLowerCase()) || "jpg";
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`);
    }
  }),
  limits: {
    fileSize: Number(process.env.EMARQET_UPLOAD_MAX_FILE_MB || 8) * 1024 * 1024,
    files: Number(process.env.EMARQET_UPLOAD_MAX_FILES || 12)
  },
  fileFilter: (req, file, cb) => {
    const allowed = EMARQET_IMAGE_MIME_EXT.has(String(file.mimetype || "").toLowerCase());
    cb(allowed ? null : new Error("invalid_image_type"), allowed);
  }
});

const emarqetCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.EMARQET_IMPORT_MAX_FILE_MB || 3) * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const name = safeText(file.originalname).toLowerCase();
    const allowed = name.endsWith(".csv") || name.endsWith(".xlsx") || EMARQET_CSV_MIME_TYPES.has(String(file.mimetype || "").toLowerCase());
    cb(allowed ? null : new Error("invalid_csv_type"), allowed);
  }
});

function handleEmarqetImageUpload(req, res, next) {
  return emarqetImageUpload.array("photos", Number(process.env.EMARQET_UPLOAD_MAX_FILES || 12))(req, res, (error) => {
    if (!error) return next();
    cleanupUploadedFiles(req.files || []);
    const message = String(error?.message || error || "");
    const code = error?.code === "LIMIT_FILE_SIZE"
      ? "file_too_large"
      : error?.code === "LIMIT_FILE_COUNT"
        ? "too_many_files"
        : message.includes("invalid_image_type")
          ? "invalid_image"
          : "upload";
    return res.redirect(`/publica?err=${encodeURIComponent(code)}`);
  });
}

function handleEmarqetCsvUpload(req, res, next) {
  return emarqetCsvUpload.single("import_file")(req, res, (error) => {
    if (!error) return next();
    const message = String(error?.message || error || "");
    const code = error?.code === "LIMIT_FILE_SIZE"
      ? "import_file_too_large"
      : message.includes("invalid_csv_type")
        ? "invalid_csv"
        : "import_upload";
    return res.redirect(`/cont/importuri?err=${encodeURIComponent(code)}`);
  });
}

function isEmarqetHost(req) {
  const host = safeText(req.get("host")).split(":")[0].toLowerCase();
  return ["e-marqet.com", "www.e-marqet.com", "emarqet.com", "www.emarqet.com"].includes(host);
}

function isWwwEmarqetHost(req) {
  const host = safeText(req.get("host")).split(":")[0].toLowerCase();
  return ["www.e-marqet.com", "www.emarqet.com", "emarqet.com"].includes(host);
}

function emarqetPublicBaseUrl() {
  return String(process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");
}

function emarqetHostOnly(req, res, next) {
  if (isEmarqetHost(req)) return next();
  return next("route");
}

function normalizePublicTarget(target = "/") {
  const safeTarget = safeText(target) || "/";
  return safeTarget.startsWith("/") ? safeTarget : `/${safeTarget}`;
}

function legacyPublicTarget(req) {
  const original = safeText(req.originalUrl || req.url || "/e-marqet");
  const stripped = original.replace(/^\/e-marqet(?=\/|\?|$)/, "") || "/";
  return stripped.startsWith("?") ? `/${stripped}` : normalizePublicTarget(stripped);
}

function canonicalPublicTarget(req) {
  const original = safeText(req.originalUrl || req.url || "/");
  if (original.startsWith("/e-marqet")) return legacyPublicTarget(req);
  return normalizePublicTarget(original || "/");
}

function redirectToDedicatedDomain(req, res, target = "/") {
  const status = ["GET", "HEAD"].includes(String(req.method || "").toUpperCase()) ? 301 : 308;
  const cleanTarget = normalizePublicTarget(target);
  const location = isEmarqetHost(req) ? cleanTarget : `${emarqetPublicBaseUrl()}${cleanTarget}`;
  return res.redirect(status, location);
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function normalizePhone(value = "") {
  let digits = safeText(value).replace(/\D+/g, "");
  if (digits.startsWith("0040")) digits = `40${digits.slice(4)}`;
  if (digits.startsWith("0") && digits.length === 10) digits = `40${digits.slice(1)}`;
  return digits;
}

function normalizePersonName(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const ROMANIAN_COUNTY_CODES = {
  ALBA: "RO-AB",
  ARAD: "RO-AR",
  ARGES: "RO-AG",
  "ARGES": "RO-AG",
  BACAU: "RO-BC",
  BIHOR: "RO-BH",
  "BISTRITA NASAUD": "RO-BN",
  BOTOSANI: "RO-BT",
  BRASOV: "RO-BV",
  BRAILA: "RO-BR",
  BUZAU: "RO-BZ",
  "CARAS SEVERIN": "RO-CS",
  CALARASI: "RO-CL",
  CLUJ: "RO-CJ",
  CONSTANTA: "RO-CT",
  COVASNA: "RO-CV",
  DAMBOVITA: "RO-DB",
  DOLJ: "RO-DJ",
  GALATI: "RO-GL",
  GIURGIU: "RO-GR",
  GORJ: "RO-GJ",
  HARGHITA: "RO-HR",
  HUNEDOARA: "RO-HD",
  IALOMITA: "RO-IL",
  IASI: "RO-IS",
  ILFOV: "RO-IF",
  MARAMURES: "RO-MM",
  MEHEDINTI: "RO-MH",
  MURES: "RO-MS",
  NEAMT: "RO-NT",
  OLT: "RO-OT",
  PRAHOVA: "RO-PH",
  "SATU MARE": "RO-SM",
  SALAJ: "RO-SJ",
  SIBIU: "RO-SB",
  SUCEAVA: "RO-SV",
  TELEORMAN: "RO-TR",
  TIMIS: "RO-TM",
  TULCEA: "RO-TL",
  VASLUI: "RO-VS",
  VALCEA: "RO-VL",
  VRANCEA: "RO-VN",
  BUCURESTI: "RO-B",
  AB: "RO-AB",
  AR: "RO-AR",
  AG: "RO-AG",
  BC: "RO-BC",
  BH: "RO-BH",
  BN: "RO-BN",
  BT: "RO-BT",
  BV: "RO-BV",
  BR: "RO-BR",
  BZ: "RO-BZ",
  CS: "RO-CS",
  CL: "RO-CL",
  CJ: "RO-CJ",
  CT: "RO-CT",
  CV: "RO-CV",
  DB: "RO-DB",
  DJ: "RO-DJ",
  GL: "RO-GL",
  GR: "RO-GR",
  GJ: "RO-GJ",
  HR: "RO-HR",
  HD: "RO-HD",
  IL: "RO-IL",
  IS: "RO-IS",
  IF: "RO-IF",
  MM: "RO-MM",
  MH: "RO-MH",
  MS: "RO-MS",
  NT: "RO-NT",
  OT: "RO-OT",
  PH: "RO-PH",
  SM: "RO-SM",
  SJ: "RO-SJ",
  SB: "RO-SB",
  SV: "RO-SV",
  TR: "RO-TR",
  TM: "RO-TM",
  TL: "RO-TL",
  VS: "RO-VS",
  VL: "RO-VL",
  VN: "RO-VN",
  B: "RO-B"
};

function normalizeRomanianLabel(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^JUD\.?\s+/i, "")
    .replace(/^JUDETUL\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function romanianCountyCode(value = "") {
  const normalized = normalizeRomanianLabel(value);
  if (!normalized) return "";
  if (/^RO-[A-Z]{1,2}$/i.test(normalized)) return normalized.toUpperCase();
  return ROMANIAN_COUNTY_CODES[normalized] || "";
}

function normalizeRomanianFiscalId(value = "") {
  return safeText(value).toUpperCase().replace(/^RO/i, "").replace(/[^0-9]/g, "");
}

function hasUsableRomanianFiscalId(value = "") {
  const raw = safeText(value).toUpperCase();
  if (!raw || /^(PF-|BILLING-COMPANY|BILLING-COMPANY-EXTERNAL|EXTERNAL-|CLIENT-)/i.test(raw)) return false;
  return /^\d{2,13}$/.test(normalizeRomanianFiscalId(raw));
}

function billingProfileFromSource(source = {}) {
  return {
    billing_name: safeText(source.billing_name || source.display_name || source.owner_name),
    billing_cui: normalizeRomanianFiscalId(source.billing_cui || source.cui || source.billing_tax_id),
    billing_address: safeText(source.billing_address || source.address),
    billing_city: safeText(source.billing_city || source.city),
    billing_county: safeText(source.billing_county || source.county),
    billing_country: safeText(source.billing_country || source.country || "Romania") || "Romania"
  };
}

function billingAddressForInvoice(profile = {}) {
  const address = safeText(profile.billing_address);
  const city = safeText(profile.billing_city);
  const county = safeText(profile.billing_county);
  const country = safeText(profile.billing_country || "Romania") || "Romania";
  if (!address && !city && !county) return "";
  return [address, city, county ? `Jud. ${county}` : "", country].filter(Boolean).join(", ");
}

function firstFilled(...values) {
  for (const value of values) {
    const text = safeText(value);
    if (text) return text;
  }
  return "";
}

function checkoutBillingProfile({ listing = {}, user = {}, body = {} } = {}) {
  return billingProfileFromSource({
    billing_name: firstFilled(body.billing_name, listing.billing_name, user.billing_name, listing.owner_name, user.display_name),
    billing_cui: firstFilled(body.billing_cui, body.billing_tax_id, listing.billing_cui, user.billing_cui),
    billing_address: firstFilled(body.billing_address, listing.billing_address, user.billing_address),
    billing_city: firstFilled(body.billing_city, listing.billing_city, user.billing_city, listing.location),
    billing_county: firstFilled(body.billing_county, listing.billing_county, user.billing_county),
    billing_country: firstFilled(body.billing_country, listing.billing_country, user.billing_country, "Romania")
  });
}

function validateBillingProfile(profile = {}) {
  const errors = [];
  const country = safeText(profile.billing_country || "Romania").toLowerCase();
  const isRomania = !country || ["romania", "ro", "rou"].includes(country);
  if (!safeText(profile.billing_name)) errors.push("numele pentru facturare");
  if (!safeText(profile.billing_address)) errors.push("adresa pentru facturare");
  if (!safeText(profile.billing_city)) errors.push("localitatea");
  if (isRomania) {
    if (!hasUsableRomanianFiscalId(profile.billing_cui)) errors.push("CUI/CNP valid");
    if (!romanianCountyCode(profile.billing_county)) errors.push("județul");
  }
  return { ok: errors.length === 0, errors };
}

function billingProfileErrorMessage(errors = []) {
  const list = (errors || []).filter(Boolean);
  if (!list.length) return "Completează datele de facturare înainte de plată.";
  return `Completează datele de facturare înainte de plată: ${list.join(", ")}.`;
}

function saveCheckoutBillingProfile(db, companyId, listing = {}, user = {}, profile = {}) {
  const payload = {
    ...billingProfileFromSource(profile),
    billing_address_full: billingAddressForInvoice(profile)
  };
  if (Number(user?.id || 0) > 0) {
    db.prepare(`
      UPDATE emarqet_users
      SET billing_name=@billing_name,
          billing_cui=@billing_cui,
          billing_address=@billing_address,
          billing_city=@billing_city,
          billing_county=@billing_county,
          billing_country=@billing_country,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=@company_id AND id=@user_id
    `).run({ ...payload, company_id: companyId, user_id: user.id });
  }
  if (Number(listing?.id || 0) > 0) {
    db.prepare(`
      UPDATE emarqet_listings
      SET billing_name=@billing_name,
          billing_cui=@billing_cui,
          billing_address=@billing_address,
          billing_city=@billing_city,
          billing_county=@billing_county,
          billing_country=@billing_country,
          updated_at=CURRENT_TIMESTAMP
      WHERE company_id=@company_id AND id=@listing_id
    `).run({ ...payload, company_id: companyId, listing_id: listing.id });
  }
  return payload;
}

function currentEmarqetUser(req) {
  return req.session?.emarqetUser || null;
}

function setEmarqetUserSession(req, user = {}) {
  req.session.emarqetUser = {
    id: Number(user.id || 0),
    email: normalizeEmail(user.email),
    display_name: safeText(user.display_name || user.email),
    phone: safeText(user.phone)
  };
}

function loginTarget(value = "") {
  return safeReturnTo(value, "/cont");
}

function requireEmarqetUser(req, res, next) {
  if (currentEmarqetUser(req)?.id) return next();
  return res.redirect(`/cont/login?return_to=${encodeURIComponent(req.originalUrl || "/cont")}`);
}

function findEmarqetUserByEmail(db, companyId, email = "") {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return db.prepare(`
    SELECT *
    FROM emarqet_users
    WHERE company_id=?
      AND LOWER(email)=?
      AND UPPER(COALESCE(status,''))='ACTIV'
    LIMIT 1
  `).get(companyId, normalized) || null;
}

function findEmarqetUserById(db, companyId, id = 0) {
  const userId = Number(id || 0);
  if (!userId) return null;
  return db.prepare(`
    SELECT *
    FROM emarqet_users
    WHERE company_id=?
      AND id=?
      AND UPPER(COALESCE(status,''))='ACTIV'
    LIMIT 1
  `).get(companyId, userId) || null;
}

function normalizedOrNull(value = "") {
  return value || null;
}

function findEmarqetDuplicateUser(db, companyId, data = {}) {
  const email = normalizeEmail(data.email);
  const phoneNormalized = normalizePhone(data.phone);
  const nameNormalized = normalizePersonName(data.display_name);

  if (email) {
    const user = findEmarqetUserByEmail(db, companyId, email);
    if (user) return { type: "email", user };
  }

  if (phoneNormalized) {
    const user = db.prepare(`
      SELECT *
      FROM emarqet_users
      WHERE company_id=?
        AND phone_normalized=?
        AND UPPER(COALESCE(status,''))='ACTIV'
      LIMIT 1
    `).get(companyId, phoneNormalized);
    if (user) return { type: "phone", user };
  }

  if (nameNormalized) {
    const user = db.prepare(`
      SELECT *
      FROM emarqet_users
      WHERE company_id=?
        AND name_normalized=?
        AND UPPER(COALESCE(status,''))='ACTIV'
      LIMIT 1
    `).get(companyId, nameNormalized);
    if (user) return { type: "name", user };
  }

  return null;
}

function createEmarqetUser(db, companyId, data = {}) {
  const email = normalizeEmail(data.email);
  const displayName = safeText(data.display_name);
  const phone = safeText(data.phone);
  const password = safeText(data.password);
  if (!email) return { ok: false, error: "required" };
  if (!displayName) return { ok: false, error: "name_required" };
  if (!phone) return { ok: false, error: "phone_required" };
  if (password.length < 6) return { ok: false, error: "password" };
  const duplicate = findEmarqetDuplicateUser(db, companyId, { email, display_name: displayName, phone });
  if (duplicate?.type === "email") return { ok: false, error: "exists_email" };
  if (duplicate?.type === "phone") return { ok: false, error: "exists_phone" };
  if (duplicate?.type === "name") return { ok: false, error: "exists_name" };
  const result = db.prepare(`
    INSERT INTO emarqet_users
      (company_id, email, password_hash, display_name, phone, name_normalized, phone_normalized, auth_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'email')
  `).run(
    companyId,
    email,
    bcrypt.hashSync(password, 12),
    displayName,
    phone,
    normalizedOrNull(normalizePersonName(displayName)),
    normalizedOrNull(normalizePhone(phone))
  );
  return { ok: true, user: findEmarqetUserById(db, companyId, result.lastInsertRowid) };
}

function verifyEmarqetUser(db, companyId, email = "", password = "") {
  const user = findEmarqetUserByEmail(db, companyId, email);
  if (!user?.password_hash) return null;
  if (!bcrypt.compareSync(safeText(password), user.password_hash)) return null;
  db.prepare("UPDATE emarqet_users SET last_login_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
  return user;
}

function parseAmount(value) {
  const normalized = safeText(value).replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function toStripeAmount(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function stripeSecretKey() {
  return safeText(process.env.EMARQET_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
}

function stripeClientForEmarqet() {
  const key = stripeSecretKey();
  if (!key) return null;
  const liveAllowed = envEnabled("EMARQET_ALLOW_LIVE_STRIPE", false);
  if (key.startsWith("sk_live_") && !liveAllowed) return null;
  return new Stripe(key);
}

function emarqetStripeMode() {
  const mode = safeText(process.env.EMARQET_STRIPE_MODE).toLowerCase();
  if (["stripe", "simulate"].includes(mode)) return mode;
  return stripeClientForEmarqet() ? "stripe" : "simulate";
}

function emarqetSimulatedPaymentsAllowed() {
  return envEnabled("EMARQET_ALLOW_SIMULATED_PAYMENTS", false);
}

function emarqetStripeAutomaticTaxEnabled() {
  return envEnabled("STRIPE_AUTOMATIC_TAX_ENABLED", false);
}

function emarqetStripeTaxIdCollectionEnabled() {
  return envEnabled("STRIPE_TAX_ID_COLLECTION_ENABLED", true);
}

function checkoutToken() {
  return crypto.randomBytes(24).toString("hex");
}

function safeJson(value = {}) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function imageUrlsFromBody(body = {}, files = []) {
  const localPrefix = `/${emarqetUploadPublicPrefix()}/`;
  const urls = [
    ...files.map(uploadedImagePublicPath),
    safeText(body.primary_image_url),
    ...safeText(body.image_urls)
      .split(/\r?\n|,/)
      .map((url) => safeText(url))
  ].filter((url, index, all) => url && (/^https?:\/\//i.test(url) || url.startsWith(localPrefix)) && all.indexOf(url) === index);
  return urls.slice(0, 12);
}

function ensureColumn(db, table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function backfillEmarqetUserIdentity(db) {
  const rows = db.prepare(`
    SELECT id, display_name, phone
    FROM emarqet_users
    WHERE name_normalized IS NULL OR phone_normalized IS NULL
  `).all();
  if (!rows.length) return;

  const update = db.prepare(`
    UPDATE emarqet_users
    SET
      name_normalized=@name_normalized,
      phone_normalized=@phone_normalized,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=@id
  `);
  const tx = db.transaction((items) => {
    for (const row of items) {
      update.run({
        id: row.id,
        name_normalized: normalizedOrNull(normalizePersonName(row.display_name)),
        phone_normalized: normalizedOrNull(normalizePhone(row.phone))
      });
    }
  });
  tx(rows);
}

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function escapeXml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function publicCompanyId(db) {
  const configured = Number(process.env.EMARQET_COMPANY_ID || process.env.NEXORA_PUBLIC_COMPANY_ID || 0);
  if (configured > 0) return configured;
  const activeCompany = db.prepare(`
    SELECT id
    FROM companies
    WHERE status='active'
    ORDER BY id ASC
    LIMIT 1
  `).get();
  if (activeCompany?.id) return Number(activeCompany.id);
  const anyCompany = db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(anyCompany?.id || 0);
}

function ensureEmarqetSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_verticals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      public_path TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      launch_stage TEXT,
      listing_count_goal INTEGER DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS emarqet_listings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      vertical_id INTEGER,
      listing_code TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT,
      owner_name TEXT,
      owner_email TEXT,
      location TEXT,
      price_amount REAL,
      price_currency TEXT DEFAULT 'RON',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      quality_score INTEGER DEFAULT 0,
      ai_status TEXT DEFAULT 'NEGENERAT',
      metadata_json TEXT,
      primary_image_url TEXT,
      image_urls_json TEXT,
      contact_phone TEXT,
      seller_type TEXT,
      selected_plan_code TEXT,
      promotion_level TEXT DEFAULT '',
      promotion_until TEXT,
      stripe_checkout_status TEXT DEFAULT 'PENDING',
      stripe_checkout_session_id TEXT,
      checkout_token TEXT,
      paid_at TEXT,
      published_at TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, listing_code)
    );

    CREATE TABLE IF NOT EXISTS emarqet_leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      listing_id INTEGER,
      vertical_id INTEGER,
      requester_name TEXT NOT NULL,
      requester_email TEXT,
      requester_phone TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'NOU',
      message TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      email TEXT NOT NULL,
      password_hash TEXT,
      display_name TEXT,
      phone TEXT,
      name_normalized TEXT,
      phone_normalized TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      auth_provider TEXT DEFAULT 'email',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT,
      UNIQUE(company_id, email)
    );

    CREATE TABLE IF NOT EXISTS emarqet_partner_profiles(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      emarqet_user_id INTEGER NOT NULL,
      partner_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      legal_name TEXT,
      cui TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      city TEXT,
      county TEXT,
      address TEXT,
      selected_plan_code TEXT,
      import_mode TEXT,
      status TEXT NOT NULL DEFAULT 'IN_REVIZIE',
      verified_at TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, emarqet_user_id, partner_type)
    );

    CREATE TABLE IF NOT EXISTS emarqet_partner_imports(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      partner_profile_id INTEGER NOT NULL,
      emarqet_user_id INTEGER NOT NULL,
      vertical_code TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'csv',
      file_name TEXT,
      status TEXT NOT NULL DEFAULT 'PROCESAT',
      total_rows INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      report_json TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_public_verticals ON emarqet_verticals(company_id, code, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_public_listings ON emarqet_listings(company_id, status, slug);
    CREATE INDEX IF NOT EXISTS idx_emarqet_public_leads ON emarqet_leads(company_id, source, created_at);
    CREATE INDEX IF NOT EXISTS idx_emarqet_public_users ON emarqet_users(company_id, email, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_partner_profiles_user ON emarqet_partner_profiles(company_id, emarqet_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_partner_profiles_cui ON emarqet_partner_profiles(company_id, cui, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_partner_imports_profile ON emarqet_partner_imports(company_id, partner_profile_id, created_at);
  `);
  ensureColumn(db, "emarqet_users", "name_normalized", "TEXT");
  ensureColumn(db, "emarqet_users", "phone_normalized", "TEXT");
  ensureColumn(db, "emarqet_users", "billing_name", "TEXT");
  ensureColumn(db, "emarqet_users", "billing_cui", "TEXT");
  ensureColumn(db, "emarqet_users", "billing_address", "TEXT");
  ensureColumn(db, "emarqet_users", "billing_city", "TEXT");
  ensureColumn(db, "emarqet_users", "billing_county", "TEXT");
  ensureColumn(db, "emarqet_users", "billing_country", "TEXT DEFAULT 'Romania'");
  backfillEmarqetUserIdentity(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_emarqet_public_users_phone ON emarqet_users(company_id, phone_normalized, status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_public_users_name ON emarqet_users(company_id, name_normalized, status);
  `);
  ensureColumn(db, "emarqet_listings", "emarqet_user_id", "INTEGER");
  ensureColumn(db, "emarqet_listings", "metadata_json", "TEXT");
  ensureColumn(db, "emarqet_listings", "primary_image_url", "TEXT");
  ensureColumn(db, "emarqet_listings", "image_urls_json", "TEXT");
  ensureColumn(db, "emarqet_listings", "contact_phone", "TEXT");
  ensureColumn(db, "emarqet_listings", "seller_type", "TEXT");
  ensureColumn(db, "emarqet_listings", "selected_plan_code", "TEXT");
  ensureColumn(db, "emarqet_listings", "promotion_level", "TEXT DEFAULT ''");
  ensureColumn(db, "emarqet_listings", "promotion_until", "TEXT");
  ensureColumn(db, "emarqet_listings", "stripe_checkout_status", "TEXT DEFAULT 'PENDING'");
  ensureColumn(db, "emarqet_listings", "stripe_checkout_session_id", "TEXT");
  ensureColumn(db, "emarqet_listings", "checkout_token", "TEXT");
  ensureColumn(db, "emarqet_listings", "paid_at", "TEXT");
  ensureColumn(db, "emarqet_listings", "partner_profile_id", "INTEGER");
  ensureColumn(db, "emarqet_listings", "billing_name", "TEXT");
  ensureColumn(db, "emarqet_listings", "billing_cui", "TEXT");
  ensureColumn(db, "emarqet_listings", "billing_address", "TEXT");
  ensureColumn(db, "emarqet_listings", "billing_city", "TEXT");
  ensureColumn(db, "emarqet_listings", "billing_county", "TEXT");
  ensureColumn(db, "emarqet_listings", "billing_country", "TEXT DEFAULT 'Romania'");
  ensureColumn(db, "emarqet_partner_profiles", "founder_badge_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_partner_profiles", "founder_badge_label", "TEXT DEFAULT 'Dealer Fondator'");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_start_at", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_end_at", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_benefits_json", "TEXT");
  ensureColumn(db, "emarqet_partner_profiles", "founder_converted_subscription_id", "INTEGER");
  ensureColumn(db, "emarqet_partner_profiles", "founder_notes", "TEXT");
  ensureEmarqetMonetizationSchema(db);
  ensureMarketplaceServicesSchema(db);
  ensureEmarqetReferralSchema(db);
}

function seedDefaultVerticals(db, companyId) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO emarqet_verticals
      (company_id, code, name, public_path, status, launch_stage, listing_count_goal, notes, created_by)
    VALUES
      (@company_id, @code, @name, @public_path, @status, @launch_stage, @listing_count_goal, @notes, 'emarqet-public')
  `);

  const update = db.prepare(`
    UPDATE emarqet_verticals
    SET
      name=@name,
      public_path=@public_path,
      status=@status,
      launch_stage=@launch_stage,
      listing_count_goal=@listing_count_goal,
      notes=@notes,
      updated_at=CURRENT_TIMESTAMP
    WHERE company_id=@company_id AND code=@code
  `);

  const trx = db.transaction((items) => {
    for (const row of items) {
      const payload = { ...row, company_id: companyId };
      const exists = db.prepare("SELECT id FROM emarqet_verticals WHERE company_id=? AND code=? LIMIT 1").get(companyId, row.code);
      if (exists?.id) {
        update.run(payload);
      } else {
        insert.run(payload);
      }
    }
  });
  trx(emarqetDefaultVerticalRows());
}

function loadVerticals(db, companyId, activeOnly = false) {
  const activeFilter = activeOnly ? "AND UPPER(COALESCE(v.status,''))='ACTIV'" : "";
  return db.prepare(`
    SELECT
      v.*,
      COUNT(l.id) AS actual_listings,
      SUM(CASE WHEN UPPER(COALESCE(l.status,''))='PUBLICAT' THEN 1 ELSE 0 END) AS published_listings
    FROM emarqet_verticals v
    LEFT JOIN emarqet_listings l ON l.vertical_id=v.id AND l.company_id=v.company_id
    WHERE v.company_id=? ${activeFilter}
    GROUP BY v.id
    ORDER BY
      CASE UPPER(COALESCE(v.status,''))
        WHEN 'ACTIV' THEN 1
        WHEN 'PLANIFICAT' THEN 2
        ELSE 3
      END,
      v.name COLLATE NOCASE ASC
  `).all(companyId);
}

function findVertical(db, companyId, codeOrId) {
  const key = safeText(codeOrId);
  if (!key) return null;
  const pathKey = key.startsWith("/") ? key : `/${key}`;
  return db.prepare(`
    SELECT *
    FROM emarqet_verticals
    WHERE company_id=?
      AND UPPER(COALESCE(status,''))='ACTIV'
      AND (code=? OR REPLACE(code, '_', '-')=? OR public_path=? OR id=?)
    LIMIT 1
  `).get(companyId, key, key, pathKey, Number(key || 0)) || null;
}

function listingSelectSql() {
  return `
    SELECT
      l.*,
      v.name AS vertical_name,
      v.code AS vertical_code,
      v.public_path AS vertical_public_path,
      p.display_name AS partner_display_name,
      p.partner_type AS partner_type,
      p.status AS partner_status,
      p.website AS partner_website,
      p.city AS partner_city,
      p.county AS partner_county,
      p.verified_at AS partner_verified_at
    FROM emarqet_listings l
    LEFT JOIN emarqet_verticals v ON v.id=l.vertical_id AND v.company_id=l.company_id
    LEFT JOIN emarqet_partner_profiles p ON p.id=l.partner_profile_id AND p.company_id=l.company_id
  `;
}

function requestFilters(query = {}) {
  const filters = {
    q: safeText(query.q),
    vertical: safeText(query.vertical),
    location: safeText(query.location),
    price_min: safeText(query.price_min),
    price_max: safeText(query.price_max)
  };
  for (const [key, value] of Object.entries(query || {})) {
    const normalizedKey = safeText(key);
    if (!normalizedKey || filters[normalizedKey] !== undefined) continue;
    const normalizedValue = safeText(value);
    if (normalizedValue) filters[normalizedKey] = normalizedValue;
  }
  return filters;
}

function loadListings(db, companyId, filters = {}, limit = 60) {
  const where = ["l.company_id=?", "UPPER(COALESCE(l.status,''))='PUBLICAT'"];
  const params = [companyId];
  const q = safeText(filters.q);
  const location = safeText(filters.location);
  const vertical = safeText(filters.vertical);
  const priceMin = parseAmount(filters.price_min);
  const priceMax = parseAmount(filters.price_max);

  if (q) {
    where.push("(l.title LIKE ? OR l.notes LIKE ? OR l.owner_name LIKE ? OR l.location LIKE ? OR l.listing_code LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (location) {
    where.push("l.location LIKE ?");
    params.push(`%${location}%`);
  }
  if (vertical) {
    const pathKey = vertical.startsWith("/") ? vertical : `/${vertical}`;
    where.push("(v.code=? OR REPLACE(v.code, '_', '-')=? OR v.public_path=? OR v.id=?)");
    params.push(vertical, vertical, pathKey, Number(vertical || 0));
  }
  if (priceMin !== null) {
    where.push("l.price_amount>=?");
    params.push(priceMin);
  }
  if (priceMax !== null) {
    where.push("l.price_amount<=?");
    params.push(priceMax);
  }

  const requestedLimit = Number(limit || 60);
  const rawLimit = Math.max(requestedLimit * 4, 240);
  const rows = db.prepare(`
    ${listingSelectSql()}
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE
        WHEN COALESCE(l.promotion_level,'') <> ''
          AND (l.promotion_until IS NULL OR l.promotion_until='' OR date(l.promotion_until) >= date('now'))
        THEN 0 ELSE 1
      END,
      COALESCE(l.published_at, l.created_at) DESC,
      l.id DESC
    LIMIT ?
  `).all(...params, rawLimit);
  return rows
    .filter((row) => listingMatchesMetadataFilters(row, filters))
    .slice(0, requestedLimit)
    .map((row) => ({ ...row, is_promoted: isListingPromoted(row) }));
}

function findListing(db, companyId, slugOrCode) {
  const key = safeText(slugOrCode);
  if (!key) return null;
  return db.prepare(`
    ${listingSelectSql()}
    WHERE l.company_id=?
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
      AND (l.slug=? OR l.listing_code=? OR l.id=?)
    LIMIT 1
  `).get(companyId, key, key, Number(key || 0)) || null;
}

function findCheckoutListing(db, companyId, slugOrCode) {
  const listing = findListing(db, companyId, slugOrCode);
  if (listing) return listing;
  const key = safeText(slugOrCode);
  if (!key) return null;
  return db.prepare(`
    ${listingSelectSql()}
    WHERE l.company_id=?
      AND (l.slug=? OR l.listing_code=? OR l.id=?)
    LIMIT 1
  `).get(companyId, key, key, Number(key || 0)) || null;
}

function loadUserListings(db, companyId, userId, filters = {}) {
  const where = ["l.company_id=?", "l.emarqet_user_id=?"];
  const params = [companyId, Number(userId || 0)];
  const status = safeText(filters.status);
  const q = safeText(filters.q);
  const vertical = safeText(filters.vertical);
  if (status) {
    if (status === "active") where.push("UPPER(COALESCE(l.status,''))='PUBLICAT'");
    else if (status === "pending") where.push("UPPER(COALESCE(l.status,'')) IN ('IN_REVIZIE','DRAFT')");
    else if (status === "pay") where.push("COALESCE(l.paid_at,'')='' AND UPPER(COALESCE(l.stripe_checkout_status,'')) NOT LIKE 'PAID%' AND COALESCE(l.selected_plan_code,'free') <> 'free'");
    else if (status === "inactive") where.push("UPPER(COALESCE(l.status,'')) IN ('PAUZAT','RESPINS')");
  }
  if (q) {
    where.push("(l.title LIKE ? OR l.location LIKE ? OR l.listing_code LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (vertical) {
    where.push("v.code=?");
    params.push(vertical);
  }
  return db.prepare(`
    ${listingSelectSql()}
    WHERE ${where.join(" AND ")}
    ORDER BY l.id DESC
    LIMIT 300
  `).all(...params).map((row) => ({ ...row, is_promoted: isListingPromoted(row) }));
}

function findUserListingForMarketplace(db, companyId, user = {}, slugOrCode = "") {
  const key = safeText(slugOrCode);
  if (!key) return null;
  const userId = Number(user?.id || 0);
  const email = normalizeEmail(user?.email);
  const ownerWhere = email
    ? "(l.emarqet_user_id=? OR LOWER(COALESCE(l.owner_email,''))=?)"
    : "l.emarqet_user_id=?";
  const params = email
    ? [companyId, userId, email, key, key, Number(key || 0)]
    : [companyId, userId, key, key, Number(key || 0)];
  return db.prepare(`
    ${listingSelectSql()}
    WHERE l.company_id=?
      AND ${ownerWhere}
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
      AND (l.slug=? OR l.listing_code=? OR l.id=?)
    LIMIT 1
  `).get(...params) || null;
}

function userListingStats(db, companyId, userId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='PUBLICAT' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('IN_REVIZIE','DRAFT') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN COALESCE(paid_at,'')='' AND UPPER(COALESCE(stripe_checkout_status,'')) NOT LIKE 'PAID%' AND COALESCE(selected_plan_code,'free') <> 'free' THEN 1 ELSE 0 END) AS to_pay,
      SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('PAUZAT','RESPINS') THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN UPPER(COALESCE(status,''))='PUBLICAT' AND COALESCE(promotion_level,'') <> '' THEN 1 ELSE 0 END) AS promoted
    FROM emarqet_listings
    WHERE company_id=? AND emarqet_user_id=?
  `).get(companyId, Number(userId || 0)) || {};
}

const EMARQET_PARTNER_TYPES = {
  auto_dealer: {
    label: "Dealer auto",
    verticalCode: "auto",
    defaultPlan: "auto_business",
    sellerType: "Dealer",
    importMode: "xml_api_excel"
  },
  real_estate_agency: {
    label: "Agenție imobiliară",
    verticalCode: "imobiliare",
    defaultPlan: "real_estate_business",
    sellerType: "Firma",
    importMode: "xml_crm"
  }
};

function partnerTypeConfig(value = "") {
  return EMARQET_PARTNER_TYPES[safeText(value)] || null;
}

function normalizeCui(value = "") {
  return safeText(value).toUpperCase().replace(/^RO\s*/i, "").replace(/[^0-9A-Z]/g, "");
}

function loadPartnerProfiles(db, companyId, userId) {
  return db.prepare(`
    SELECT *
    FROM emarqet_partner_profiles
    WHERE company_id=? AND emarqet_user_id=?
    ORDER BY
      CASE UPPER(COALESCE(status,''))
        WHEN 'ACTIV' THEN 1
        WHEN 'IN_REVIZIE' THEN 2
        ELSE 3
      END,
      id DESC
  `).all(companyId, Number(userId || 0));
}

function partnerIdFromKey(value = "") {
  const key = safeText(value);
  const match = key.match(/^(\d+)/);
  return Number(match?.[1] || key || 0);
}

function findPublicPartnerProfile(db, companyId, partnerKey = "") {
  const id = partnerIdFromKey(partnerKey);
  if (!id) return null;
  return db.prepare(`
    SELECT
      p.*,
      COUNT(l.id) AS published_count,
      MIN(l.price_amount) AS min_price,
      MAX(l.price_amount) AS max_price
    FROM emarqet_partner_profiles p
    LEFT JOIN emarqet_listings l ON l.partner_profile_id=p.id
      AND l.company_id=p.company_id
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
    WHERE p.company_id=?
      AND p.id=?
      AND UPPER(COALESCE(p.status,''))='ACTIV'
    GROUP BY p.id
    LIMIT 1
  `).get(companyId, id) || null;
}

function loadPublicPartnerProfiles(db, companyId, limit = 12) {
  return db.prepare(`
    SELECT
      p.*,
      COUNT(l.id) AS published_count
    FROM emarqet_partner_profiles p
    LEFT JOIN emarqet_listings l ON l.partner_profile_id=p.id
      AND l.company_id=p.company_id
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
    WHERE p.company_id=?
      AND UPPER(COALESCE(p.status,''))='ACTIV'
    GROUP BY p.id
    ORDER BY COUNT(l.id) DESC, p.id DESC
    LIMIT ?
  `).all(companyId, Math.max(1, Number(limit || 12)));
}

function loadPublicPartnerListings(db, companyId, partnerId, limit = 120) {
  return db.prepare(`
    ${listingSelectSql()}
    WHERE l.company_id=?
      AND l.partner_profile_id=?
      AND UPPER(COALESCE(l.status,''))='PUBLICAT'
    ORDER BY
      CASE
        WHEN COALESCE(l.promotion_level,'') <> ''
          AND (l.promotion_until IS NULL OR l.promotion_until='' OR date(l.promotion_until) >= date('now'))
        THEN 0 ELSE 1
      END,
      COALESCE(l.published_at, l.created_at) DESC,
      l.id DESC
    LIMIT ?
  `).all(companyId, Number(partnerId || 0), Math.max(1, Number(limit || 120)))
    .map((row) => ({ ...row, is_promoted: isListingPromoted(row) }));
}

function findPartnerProfile(db, companyId, userId, profileId = 0) {
  const id = Number(profileId || 0);
  if (!id) return null;
  return db.prepare(`
    SELECT *
    FROM emarqet_partner_profiles
    WHERE company_id=? AND emarqet_user_id=? AND id=?
    LIMIT 1
  `).get(companyId, Number(userId || 0), id) || null;
}

function loadPartnerImports(db, companyId, userId, limit = 30) {
  return db.prepare(`
    SELECT i.*, p.display_name AS partner_name, p.partner_type
    FROM emarqet_partner_imports i
    LEFT JOIN emarqet_partner_profiles p ON p.id=i.partner_profile_id AND p.company_id=i.company_id
    WHERE i.company_id=? AND i.emarqet_user_id=?
    ORDER BY i.id DESC
    LIMIT ?
  `).all(companyId, Number(userId || 0), Math.max(1, Number(limit || 30)));
}

function duplicatePartnerByCui(db, companyId, cui = "", currentUserId = 0) {
  const normalized = normalizeCui(cui);
  if (!normalized) return null;
  return db.prepare(`
    SELECT id, display_name, emarqet_user_id
    FROM emarqet_partner_profiles
    WHERE company_id=?
      AND UPPER(REPLACE(REPLACE(COALESCE(cui,''), 'RO', ''), ' ', ''))=?
      AND emarqet_user_id<>?
      AND UPPER(COALESCE(status,''))<>'RESPINS'
    LIMIT 1
  `).get(companyId, normalized, Number(currentUserId || 0)) || null;
}

function upsertPartnerProfile(db, companyId, user = {}, data = {}) {
  const partnerType = safeText(data.partner_type);
  const config = partnerTypeConfig(partnerType);
  if (!config) return { ok: false, error: "partner_type" };
  const displayName = safeText(data.display_name);
  const legalName = safeText(data.legal_name);
  const cui = normalizeCui(data.cui);
  const email = normalizeEmail(data.email || user.email);
  const phone = safeText(data.phone || user.phone);
  const city = safeText(data.city);
  const county = safeText(data.county);
  const address = safeText(data.address);
  if (!displayName || !legalName || !cui || !email || !phone || !city || !county || !address) {
    return { ok: false, error: "business_required" };
  }
  const duplicate = duplicatePartnerByCui(db, companyId, cui, user.id);
  if (duplicate) return { ok: false, error: "business_cui_exists" };

  const existing = db.prepare(`
    SELECT id
    FROM emarqet_partner_profiles
    WHERE company_id=? AND emarqet_user_id=? AND partner_type=?
    LIMIT 1
  `).get(companyId, user.id, partnerType);
  const payload = {
    company_id: companyId,
    emarqet_user_id: user.id,
    partner_type: partnerType,
    display_name: displayName,
    legal_name: legalName,
    cui,
    email,
    phone,
    website: safeText(data.website),
    city,
    county,
    address,
    selected_plan_code: safeText(data.selected_plan_code || config.defaultPlan).toLowerCase(),
    import_mode: safeText(data.import_mode || config.importMode),
    notes: safeText(data.notes)
  };

  if (existing?.id) {
    db.prepare(`
      UPDATE emarqet_partner_profiles
      SET display_name=@display_name,
          legal_name=@legal_name,
          cui=@cui,
          email=@email,
          phone=@phone,
          website=@website,
          city=@city,
          county=@county,
          address=@address,
          selected_plan_code=@selected_plan_code,
          import_mode=@import_mode,
          status=CASE WHEN UPPER(COALESCE(status,''))='RESPINS' THEN 'IN_REVIZIE' ELSE status END,
          notes=@notes,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=@id AND company_id=@company_id
    `).run({ ...payload, id: existing.id });
    return { ok: true, id: existing.id, updated: true };
  }

  const result = db.prepare(`
    INSERT INTO emarqet_partner_profiles
      (company_id, emarqet_user_id, partner_type, display_name, legal_name, cui, email, phone, website, city, county, address, selected_plan_code, import_mode, status, notes, created_by)
    VALUES
      (@company_id, @emarqet_user_id, @partner_type, @display_name, @legal_name, @cui, @email, @phone, @website, @city, @county, @address, @selected_plan_code, @import_mode, 'IN_REVIZIE', @notes, 'emarqet-public')
  `).run(payload);
  return { ok: true, id: Number(result.lastInsertRowid || 0), updated: false };
}

function detectCsvDelimiter(line = "") {
  const sample = String(line || "");
  const comma = (sample.match(/,/g) || []).length;
  const semicolon = (sample.match(/;/g) || []).length;
  return semicolon > comma ? ";" : ",";
}

function parseCsvLine(line = "", delimiter = ",") {
  const values = [];
  let current = "";
  let quoted = false;
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function normalizeImportHeader(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parsePartnerCsv(buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => safeText(line));
  if (lines.length < 2) return { headers: [], rows: [] };
  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeImportHeader);
  const rows = [];
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = safeText(values[index]);
    });
    if (Object.values(row).some(Boolean)) rows.push(row);
  }
  return { headers, rows };
}

async function parsePartnerImportFile(file = {}) {
  const name = safeText(file.originalname).toLowerCase();
  if (!name.endsWith(".xlsx")) return parsePartnerCsv(file.buffer || Buffer.alloc(0));
  const sheetRows = await readXlsxFile(file.buffer || Buffer.alloc(0));
  if (!sheetRows.length) return { headers: [], rows: [] };
  const headers = (sheetRows[0] || []).map((cell) => normalizeImportHeader(cell));
  const rows = [];
  for (const values of sheetRows.slice(1)) {
    const row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = safeText(values?.[index]);
    });
    if (Object.values(row).some(Boolean)) rows.push(row);
  }
  return { headers, rows };
}

function firstImportValue(row = {}, aliases = []) {
  for (const alias of aliases) {
    const value = safeText(row[normalizeImportHeader(alias)]);
    if (value) return value;
  }
  return "";
}

function importNumber(value = "") {
  const amount = Number(safeText(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function importMetadata(verticalCode = "", row = {}) {
  if (verticalCode === "auto") {
    return {
      brand: firstImportValue(row, ["brand", "marca"]),
      model: firstImportValue(row, ["model"]),
      year: importNumber(firstImportValue(row, ["year", "an", "an_fabricatie"])),
      fuel: firstImportValue(row, ["fuel", "combustibil"]),
      transmission: firstImportValue(row, ["transmission", "cutie"]),
      body_type: firstImportValue(row, ["body_type", "caroserie"]),
      mileage: importNumber(firstImportValue(row, ["mileage", "km", "kilometri"])),
      vin: firstImportValue(row, ["vin"])
    };
  }
  return {
    property_type: firstImportValue(row, ["property_type", "tip", "tip_proprietate"]),
    transaction_type: firstImportValue(row, ["transaction_type", "tranzactie"]),
    rooms: importNumber(firstImportValue(row, ["rooms", "camere"])),
    surface: importNumber(firstImportValue(row, ["surface", "suprafata", "mp"])),
    floor: firstImportValue(row, ["floor", "etaj"]),
    year_built: importNumber(firstImportValue(row, ["year_built", "an_constructie"]))
  };
}

function compactMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== "" && value !== null && value !== undefined));
}

function listingPayloadFromImportRow(row = {}, verticalCode = "", profile = {}, user = {}) {
  const title = firstImportValue(row, ["title", "titlu", "name", "nume"]);
  const description = firstImportValue(row, ["description", "descriere", "notes", "detalii"]);
  const location = firstImportValue(row, ["location", "locatie", "oras", "city"]);
  const price = importNumber(firstImportValue(row, ["price", "pret", "price_amount"]));
  const currency = firstImportValue(row, ["currency", "moneda", "price_currency"]) || "RON";
  const imageUrl = firstImportValue(row, ["image_url", "imagine", "poza", "primary_image_url"]);
  const phone = firstImportValue(row, ["phone", "telefon"]) || profile.phone || user.phone;
  return {
    title,
    notes: description,
    location,
    price_amount: price,
    price_currency: safeText(currency).toUpperCase() || "RON",
    primary_image_url: /^https?:\/\//i.test(imageUrl) ? imageUrl : "",
    contact_phone: phone,
    metadata: compactMetadata({
      ...importMetadata(verticalCode, row),
      seller_type: partnerTypeConfig(profile.partner_type)?.sellerType || "Firma",
      partner_profile_id: profile.id
    })
  };
}

async function createPartnerImport(db, companyId, user = {}, profile = {}, vertical = {}, file = {}) {
  const config = partnerTypeConfig(profile.partner_type);
  if (!config) return { ok: false, error: "partner_type" };
  const csv = await parsePartnerImportFile(file);
  const maxRows = Math.max(1, Number(process.env.EMARQET_PARTNER_IMPORT_MAX_ROWS || 250));
  const rows = csv.rows.slice(0, maxRows);
  const skipped = [];
  const inserted = [];
  const selectedPlan = safeText(profile.selected_plan_code || config.defaultPlan).toLowerCase();
  const tx = db.transaction(() => {
    for (const [index, row] of rows.entries()) {
      const payload = listingPayloadFromImportRow(row, vertical.code, profile, user);
      if (!payload.title) {
        skipped.push({ row: index + 2, reason: "titlu_lipsa" });
        continue;
      }
      const listingCode = nextListingCode(db, companyId);
      const slug = uniqueSlug(db, companyId, payload.title);
      const result = db.prepare(`
        INSERT INTO emarqet_listings
          (company_id, emarqet_user_id, partner_profile_id, vertical_id, listing_code, title, slug, owner_name, owner_email, location, price_amount, price_currency, status, quality_score, ai_status, metadata_json, primary_image_url, image_urls_json, contact_phone, seller_type, selected_plan_code, stripe_checkout_status, checkout_token, notes, created_by)
        VALUES
          (@company_id, @emarqet_user_id, @partner_profile_id, @vertical_id, @listing_code, @title, @slug, @owner_name, @owner_email, @location, @price_amount, @price_currency, 'IN_REVIZIE', 45, 'DE_REVIZUIT', @metadata_json, @primary_image_url, @image_urls_json, @contact_phone, @seller_type, @selected_plan_code, 'BUSINESS_IMPORT', '', @notes, 'emarqet-partner-import')
      `).run({
        company_id: companyId,
        emarqet_user_id: user.id,
        partner_profile_id: profile.id,
        vertical_id: vertical.id,
        listing_code: listingCode,
        title: payload.title,
        slug,
        owner_name: profile.display_name || user.display_name,
        owner_email: profile.email || user.email,
        location: payload.location,
        price_amount: payload.price_amount,
        price_currency: payload.price_currency,
        metadata_json: safeJson(payload.metadata),
        primary_image_url: payload.primary_image_url,
        image_urls_json: safeJson(payload.primary_image_url ? [payload.primary_image_url] : []),
        contact_phone: payload.contact_phone,
        seller_type: config.sellerType,
        selected_plan_code: selectedPlan,
        notes: payload.notes
      });
      inserted.push({ id: result.lastInsertRowid, code: listingCode, title: payload.title });
    }

    const importResult = db.prepare(`
      INSERT INTO emarqet_partner_imports
        (company_id, partner_profile_id, emarqet_user_id, vertical_code, source_type, file_name, status, total_rows, imported_count, skipped_count, error_count, report_json, created_by)
      VALUES
        (?, ?, ?, ?, ?, ?, 'PROCESAT', ?, ?, ?, 0, ?, 'emarqet-public')
    `).run(
      companyId,
      profile.id,
      user.id,
      vertical.code,
      safeText(file.originalname).toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
      safeText(file.originalname || "import.csv"),
      rows.length,
      inserted.length,
      skipped.length,
      safeJson({ inserted: inserted.slice(0, 20), skipped: skipped.slice(0, 50), headers: csv.headers })
    );
    createLead(db, companyId, {
      vertical_id: vertical.id,
      requester_name: profile.display_name || user.display_name,
      requester_email: profile.email || user.email,
      requester_phone: profile.phone || user.phone,
      source: "partner_csv_import",
      message: `Import CSV e-Marqet ${profile.display_name}: ${inserted.length} anunturi, ${skipped.length} sarite.`
    });
    return Number(importResult.lastInsertRowid || 0);
  });
  const importId = tx();
  return { ok: true, importId, imported: inserted.length, skipped: skipped.length, total: rows.length };
}

function findPricingPlanRow(db, companyId, code = "") {
  const normalized = safeText(code).toLowerCase() || "free";
  return db.prepare(`
    SELECT *
    FROM emarqet_pricing_plans
    WHERE company_id=?
      AND LOWER(code)=?
      AND UPPER(COALESCE(status,''))='ACTIV'
    LIMIT 1
  `).get(companyId, normalized) || null;
}

function planAmount(plan = {}) {
  const amount = Number(plan.monthly_price || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function paymentRequiredForPlan(plan = {}) {
  return planAmount(plan) > 0;
}

function checkoutTokenMatches(listing = {}, token = "") {
  const expected = safeText(listing.checkout_token);
  return expected && safeText(token) && expected === safeText(token);
}

function createEmarqetBillingPayment(db, companyId, listing = {}, plan = {}, payload = {}) {
  return upsertEmarqetBillingPayment(db, companyId, listing, plan, {
    amount: payload.amount ?? planAmount(plan),
    currency: payload.currency || plan.currency || listing.price_currency || "RON",
    ...payload
  });
}

function markListingPaidAwaitingApproval(db, companyId, listing = {}, payload = {}) {
  return markEmarqetListingPaidAwaitingApproval(db, companyId, listing, payload);
}

function stats(db, companyId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM emarqet_verticals WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS activeVerticals,
      (SELECT COUNT(*) FROM emarqet_listings WHERE company_id=? AND UPPER(COALESCE(status,''))='PUBLICAT') AS publishedListings,
      (SELECT COUNT(*) FROM emarqet_leads WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('NOU','CONTACTAT','OFERTA')) AS openLeads
  `).get(companyId, companyId, companyId) || {};
}

function nextListingCode(db, companyId) {
  const year = new Date().getFullYear();
  const stem = `EMQ-${year}-`;
  const latest = db.prepare(`
    SELECT listing_code
    FROM emarqet_listings
    WHERE company_id=? AND listing_code LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${stem}%`);
  const last = Number(String(latest?.listing_code || "").split("-").pop() || 0);
  return `${stem}${String(last + 1).padStart(4, "0")}`;
}

function uniqueSlug(db, companyId, title) {
  const base = slugify(title) || "anunt";
  let candidate = base;
  for (let index = 2; index < 100; index += 1) {
    const exists = db.prepare("SELECT id FROM emarqet_listings WHERE company_id=? AND slug=? LIMIT 1").get(companyId, candidate);
    if (!exists) return candidate;
    candidate = `${base}-${index}`;
  }
  return `${base}-${Date.now()}`;
}

function safeReturnTo(value = "", fallback = "/") {
  const target = safeText(value);
  if (target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/nexora") && !target.startsWith("/login")) return target;
  return fallback;
}

function tableExists(db, tableName = "") {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(safeText(tableName)));
}

function nextCrmLeadNumber(db, companyId) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare("SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM crm_leads WHERE company_id=? AND year=?").get(Number(companyId || 0), year)?.next_seq || 1);
  let number = "";
  do {
    number = `LD-${year}-${String(seq).padStart(4, "0")}`;
    seq += 1;
  } while (db.prepare("SELECT id FROM crm_leads WHERE company_id=? AND lead_number=?").get(Number(companyId || 0), number));
  return { year, seq: seq - 1, number };
}

function createCrmDealerRequest(db, companyId, payload = {}) {
  if (!tableExists(db, "crm_leads")) return { ok: false, error: "crm_missing" };
  const next = nextCrmLeadNumber(db, companyId);
  const notes = [
    "Cerere Dealer Fondator E-MARQET",
    `Firma: ${payload.company_name}`,
    `Persoana: ${payload.person_name}`,
    `Website: ${payload.website || "-"}`,
    `Masini estimate de dealer: ${payload.vehicle_count || "-"}`,
    `Import preferat: ${payload.import_mode || "-"}`,
    `Acord contact: ${payload.contact_consent ? "da" : "nu"}`,
    payload.notes ? `Observatii: ${payload.notes}` : ""
  ].filter(Boolean).join("\n");
  const result = db.prepare(`
    INSERT INTO crm_leads (
      company_id, year, seq, lead_number, name, company_name, contact_name,
      email, phone, source, status, owner_email, estimated_value, probability,
      next_step, next_followup_date, notes, created_by_email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMARQET_DEALER_FORM', 'NOU', ?, 1000, 70, ?, date('now', '+1 day'), ?, 'emarqet-public')
  `).run(
    Number(companyId || 0),
    next.year,
    next.seq,
    next.number,
    payload.company_name,
    payload.company_name,
    payload.person_name,
    payload.email,
    payload.phone,
    safeText(process.env.EMARQET_DEALER_OWNER_EMAIL || process.env.EMARQET_SUPPORT_EMAIL || "aafastitsolutions@gmail.com"),
    "Verifica cererea de Dealer Fondator si stabileste metoda de import.",
    notes
  );
  const crmLeadId = Number(result.lastInsertRowid || 0);
  if (crmLeadId && tableExists(db, "crm_followups")) {
    db.prepare(`
      INSERT INTO crm_followups (
        company_id, lead_id, activity_type, subject, notes, due_date, priority,
        status, owner_email, created_by_email
      ) VALUES (?, ?, 'TASK', 'Onboarding Dealer Fondator', ?, date('now', '+1 day'), 'RIDICATA', 'DESCHIS', ?, 'emarqet-public')
    `).run(
      Number(companyId || 0),
      crmLeadId,
      "Contacteaza dealerul, confirma firma, cere stocul si stabileste import CSV/XLSX/XML/API/feed.",
      safeText(process.env.EMARQET_DEALER_OWNER_EMAIL || process.env.EMARQET_SUPPORT_EMAIL || "aafastitsolutions@gmail.com")
    );
  }
  return { ok: true, crmLeadId };
}

function createLead(db, companyId, data = {}) {
  return db.prepare(`
    INSERT INTO emarqet_leads
      (company_id, listing_id, vertical_id, requester_name, requester_email, requester_phone, source, status, message, created_by)
    VALUES
      (@company_id, @listing_id, @vertical_id, @requester_name, @requester_email, @requester_phone, @source, 'NOU', @message, 'emarqet-public')
  `).run({
    company_id: companyId,
    listing_id: data.listing_id || null,
    vertical_id: data.vertical_id || null,
    requester_name: safeText(data.requester_name),
    requester_email: normalizeEmail(data.requester_email),
    requester_phone: safeText(data.requester_phone),
    source: safeText(data.source) || "public_contact",
    message: safeText(data.message)
  });
}

const DEALER_IMPORT_TEMPLATE_COLUMNS = [
  "marca",
  "model",
  "an",
  "kilometraj",
  "combustibil",
  "transmisie",
  "cilindree",
  "putere",
  "pret",
  "moneda",
  "descriere",
  "vin_optional",
  "culoare",
  "caroserie",
  "stare",
  "imagini",
  "locatie",
  "telefon",
  "finantare",
  "garantie"
];

function dealerImportTemplateCsv() {
  return [
    DEALER_IMPORT_TEMPLATE_COLUMNS.join(","),
    "Dacia,Duster,2022,48000,benzina,manuala,1332,130,13900,EUR,\"SUV verificat, garantie inclusa\",,alb,SUV,rulata,\"https://example.ro/poza1.jpg|https://example.ro/poza2.jpg\",Ploiesti,+40720000000,da,12 luni"
  ].join("\n");
}

function dealerRequestPayload(body = {}) {
  return {
    company_name: safeText(body.company_name),
    person_name: safeText(body.person_name),
    phone: safeText(body.phone),
    email: normalizeEmail(body.email),
    website: safeText(body.website),
    vehicle_count: safeText(body.vehicle_count),
    import_mode: safeText(body.import_mode),
    notes: safeText(body.notes),
    contact_consent: ["1", "on", "true", "da"].includes(safeText(body.contact_consent).toLowerCase())
  };
}

function bootstrap(db) {
  const companyId = publicCompanyId(db);
  ensureEmarqetSchema(db);
  ensureEmarqetAnalyticsSchema(db);
  if (companyId) {
    seedDefaultVerticals(db, companyId);
    seedEmarqetMonetizationCatalog(db, companyId);
    seedMarketplaceServicesCatalog(db, companyId);
  }
  return companyId;
}

function trackPublicView(db, companyId, req, context = {}) {
  try {
    recordEmarqetPageView(db, companyId, req, {
      userId: currentEmarqetUser(req)?.id || null,
      ...context
    });
  } catch (error) {
    console.warn("[EMARQET] Analytics pageview failed", error?.message || error);
  }
}

function isListingPromoted(row = {}) {
  const level = safeText(row.promotion_level);
  if (!level) return false;
  const until = safeText(row.promotion_until);
  if (!until) return true;
  return until >= new Date().toISOString().slice(0, 10);
}

function isEmarqetListingPaid(row = {}) {
  const checkoutStatus = safeText(row.stripe_checkout_status).toUpperCase();
  return checkoutStatus.startsWith("PAID") || Boolean(row.paid_at);
}

function paidListingRedirect(row = {}) {
  const status = safeText(row.status).toUpperCase();
  if (status === "PUBLICAT") return publicListingUrl(row, "?ok=paid");
  return "/cont?status=pending&ok=paid_pending";
}

function publicListingUrl(row = {}, suffix = "") {
  return `/anunt/${encodeURIComponent(row.slug || row.listing_code || row.id)}${suffix}`;
}

function publicPartnerPath(row = {}) {
  const id = row.partner_profile_id || row.id;
  if (!id) return "";
  const slug = slugify(row.partner_display_name || row.display_name || row.owner_name || "partener") || "partener";
  return `/parteneri/${encodeURIComponent(`${id}-${slug}`)}`;
}

function absolutePublicUrl(pathname = "/") {
  const path = String(pathname || "/").startsWith("/") ? pathname : `/${pathname}`;
  return `${emarqetPublicBaseUrl()}${path}`;
}

function sitemapEntry(pathname = "/", lastmod = "", changefreq = "weekly", priority = "0.7") {
  return [
    "  <url>",
    `    <loc>${escapeXml(absolutePublicUrl(pathname))}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(String(lastmod).slice(0, 10))}</lastmod>` : "",
    changefreq ? `    <changefreq>${escapeXml(changefreq)}</changefreq>` : "",
    priority ? `    <priority>${escapeXml(priority)}</priority>` : "",
    "  </url>"
  ].filter(Boolean).join("\n");
}

function loadSitemapListings(db, companyId, limit = 5000) {
  return db.prepare(`
    SELECT slug, listing_code, id, updated_at, published_at, created_at
    FROM emarqet_listings
    WHERE company_id=?
      AND UPPER(COALESCE(status,''))='PUBLICAT'
    ORDER BY COALESCE(published_at, updated_at, created_at) DESC, id DESC
    LIMIT ?
  `).all(companyId, Math.max(1, Number(limit || 5000)));
}

function loadSitemapPartners(db, companyId, limit = 1000) {
  return db.prepare(`
    SELECT id, display_name, updated_at, verified_at, created_at
    FROM emarqet_partner_profiles
    WHERE company_id=?
      AND UPPER(COALESCE(status,''))='ACTIV'
    ORDER BY COALESCE(verified_at, updated_at, created_at) DESC, id DESC
    LIMIT ?
  `).all(companyId, Math.max(1, Number(limit || 1000)));
}

function publicListingPayload(row = {}) {
  return {
    id: row.id,
    code: row.listing_code,
    title: row.title,
    slug: row.slug,
    vertical: {
      id: row.vertical_id,
      code: row.vertical_code,
      name: row.vertical_name
    },
    owner_name: row.owner_name,
    location: row.location,
    price_amount: row.price_amount,
    price_currency: row.price_currency,
    primary_image_url: row.primary_image_url,
    partner: row.partner_profile_id ? {
      id: row.partner_profile_id,
      name: row.partner_display_name,
      type: row.partner_type,
      status: row.partner_status
    } : null,
    metadata: parseMetadata(row.metadata_json),
    is_promoted: isListingPromoted(row),
    promotion_level: row.promotion_level,
    published_at: row.published_at,
    url: `/anunt/${row.slug || row.listing_code || row.id}`
  };
}

export function registerEmarqetPublicRoutes(app, { db, ensureFacturaXmlGenerated, transporter } = {}) {
  app.get("/emarqet", (req, res) => redirectToDedicatedDomain(req, res, "/"));
  app.use((req, res, next) => {
    if (!isWwwEmarqetHost(req)) return next();
    const status = ["GET", "HEAD"].includes(String(req.method || "").toUpperCase()) ? 301 : 308;
    return res.redirect(status, `${emarqetPublicBaseUrl()}${canonicalPublicTarget(req)}`);
  });

  const renderDealerLanding = (req, res, legacyPrefix = false) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "dealer_founder_landing" });
    return res.type("html").send(renderEmarqetDealerLandingPage({
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err),
      formAction: legacyPrefix ? "/e-marqet/dealeri-auto" : "/dealeri-auto",
      templatePath: legacyPrefix ? "/e-marqet/dealeri-auto/template-stoc.csv" : "/dealeri-auto/template-stoc.csv"
    }));
  };

  const handleDealerRequest = (req, res, legacyPrefix = false) => {
    const companyId = bootstrap(db);
    const payload = dealerRequestPayload(req.body || {});
    const target = legacyPrefix ? "/e-marqet/dealeri-auto" : "/dealeri-auto";
    if (!payload.company_name || !payload.person_name || !payload.phone || !payload.email || !payload.contact_consent) {
      return res.redirect(`${target}?err=${payload.contact_consent ? "required" : "consent_required"}`);
    }
    createLead(db, companyId, {
      requester_name: `${payload.company_name} - ${payload.person_name}`,
      requester_email: payload.email,
      requester_phone: payload.phone,
      source: "emarqet_dealer_founder_form",
      message: [
        `Cerere Dealer Fondator: ${payload.company_name}`,
        `Persoana: ${payload.person_name}`,
        `Website: ${payload.website || "-"}`,
        `Masini aproximative: ${payload.vehicle_count || "-"}`,
        `Import preferat: ${payload.import_mode || "-"}`,
        payload.notes ? `Observatii: ${payload.notes}` : ""
      ].filter(Boolean).join("\n")
    });
    createCrmDealerRequest(db, companyId, payload);
    return res.redirect(`${target}?ok=dealer_request`);
  };

  app.get("/e-marqet/dealeri-auto", (req, res) => renderDealerLanding(req, res, true));
  app.post("/e-marqet/dealeri-auto", (req, res) => handleDealerRequest(req, res, true));
  app.get("/e-marqet/dealeri-auto/template-stoc.csv", (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"template-stoc-auto-e-marqet.csv\"");
    return res.send(dealerImportTemplateCsv());
  });
  app.use("/e-marqet", (req, res) => redirectToDedicatedDomain(req, res, legacyPublicTarget(req)));

  app.get("/robots.txt", emarqetHostOnly, (req, res) => {
    return res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send([
        "User-agent: *",
        "Allow: /",
        `Sitemap: ${emarqetPublicBaseUrl()}/sitemap.xml`,
        ""
      ].join("\n"));
  });

  app.get("/dealeri-auto", emarqetHostOnly, (req, res) => renderDealerLanding(req, res, false));
  app.post("/dealeri-auto", emarqetHostOnly, (req, res) => handleDealerRequest(req, res, false));
  app.get("/dealeri-auto/template-stoc.csv", emarqetHostOnly, (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"template-stoc-auto-e-marqet.csv\"");
    return res.send(dealerImportTemplateCsv());
  });

  app.get("/sitemap.xml", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const staticPages = [
      ["/", "", "daily", "1.0"],
      ["/anunturi", "", "daily", "0.9"],
      ["/parteneri", "", "weekly", "0.8"],
      ["/dealeri-auto", "", "weekly", "0.8"],
      ["/preturi", "", "weekly", "0.8"],
      ["/publica", "", "weekly", "0.7"],
      ["/despre", "", "monthly", "0.5"],
      ["/contact", "", "monthly", "0.5"],
      ["/siguranta", "", "monthly", "0.4"],
      ["/termeni", "", "monthly", "0.3"],
      ["/confidentialitate", "", "monthly", "0.3"],
      ["/gdpr", "", "monthly", "0.3"],
      ["/cookies", "", "monthly", "0.3"]
    ];
    const verticalPages = loadVerticals(db, companyId, true)
      .map((row) => [row.public_path || `/${row.code}`, row.updated_at, "daily", "0.8"]);
    const listingPages = loadSitemapListings(db, companyId)
      .map((row) => [publicListingUrl(row), row.published_at || row.updated_at || row.created_at, "daily", "0.8"]);
    const partnerPages = loadSitemapPartners(db, companyId)
      .map((row) => [publicPartnerPath(row), row.verified_at || row.updated_at || row.created_at, "weekly", "0.7"]);
    const urls = [
      ...staticPages,
      ...verticalPages,
      ...listingPages,
      ...partnerPages
    ]
      .filter(([pathname]) => pathname)
      .map(([pathname, lastmod, changefreq, priority]) => sitemapEntry(pathname, lastmod, changefreq, priority))
      .join("\n");

    return res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        urls,
        "</urlset>",
        ""
      ].join("\n"));
  });

  app.get("/", (req, res, next) => {
    if (!isEmarqetHost(req)) return next();
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "home" });
    const verticals = loadVerticals(db, companyId);
    const filters = requestFilters(req.query || {});
    const listings = loadListings(db, companyId, filters, 18);
    return res.type("html").send(renderEmarqetPublicHomePage({
      verticals,
      listings,
      filters,
      stats: stats(db, companyId),
      services: loadMarketplaceServices(db, companyId, { publicOnly: true, verticalCode: safeText(filters.vertical) || "auto" }).slice(0, 6),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/anunturi", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "listings" });
    const filters = requestFilters(req.query || {});
    return res.type("html").send(renderEmarqetPublicListingsPage({
      verticals: loadVerticals(db, companyId),
      listings: loadListings(db, companyId, filters, 120),
      filters,
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/despre", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "about" });
    return res.type("html").send(renderEmarqetLegalInfoPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/contact", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "contact" });
    return res.type("html").send(renderEmarqetContactPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/termeni", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "terms" });
    return res.type("html").send(renderEmarqetTermsPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/confidentialitate", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "privacy" });
    return res.type("html").send(renderEmarqetPrivacyPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/gdpr", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "gdpr" });
    return res.type("html").send(renderEmarqetGdprPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/cookies", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "cookies" });
    return res.type("html").send(renderEmarqetCookiesPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/siguranta", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "safety" });
    return res.type("html").send(renderEmarqetSafetyPage({ user: currentEmarqetUser(req) }));
  });

  app.get("/parteneri", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "partners" });
    return res.type("html").send(renderEmarqetPartnersLandingPage({
      partners: loadPublicPartnerProfiles(db, companyId, 12),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/parteneri/:partnerKey", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const partner = findPublicPartnerProfile(db, companyId, req.params.partnerKey);
    if (!partner) return res.status(404).type("html").send(renderEmarqetPublicNotFoundPage({ user: currentEmarqetUser(req) }));
    trackPublicView(db, companyId, req, { routeName: "partner", partnerProfileId: partner.id });
    return res.type("html").send(renderEmarqetPublicPartnerPage({
      partner,
      listings: loadPublicPartnerListings(db, companyId, partner.id, 120),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/cont/login", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "account_login" });
    if (currentEmarqetUser(req)?.id) return res.redirect(loginTarget(req.query?.return_to));
    return res.type("html").send(renderEmarqetAuthPage({
      mode: "login",
      returnTo: loginTarget(req.query?.return_to),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/cont/login", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const returnTo = loginTarget(req.body?.return_to);
    const user = verifyEmarqetUser(db, companyId, req.body?.email, req.body?.password);
    if (!user) return res.redirect(`/cont/login?err=invalid&return_to=${encodeURIComponent(returnTo)}`);
    setEmarqetUserSession(req, user);
    return res.redirect(returnTo);
  });

  app.get("/cont/inregistrare", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "account_register" });
    if (currentEmarqetUser(req)?.id) return res.redirect(loginTarget(req.query?.return_to));
    return res.type("html").send(renderEmarqetAuthPage({
      mode: "register",
      returnTo: loginTarget(req.query?.return_to),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/cont/inregistrare", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const returnTo = loginTarget(req.body?.return_to);
    const created = createEmarqetUser(db, companyId, {
      email: req.body?.email,
      password: req.body?.password,
      display_name: req.body?.display_name,
      phone: req.body?.phone
    });
    if (!created.ok) return res.redirect(`/cont/inregistrare?err=${encodeURIComponent(created.error || "required")}&return_to=${encodeURIComponent(returnTo)}`);
    setEmarqetUserSession(req, created.user);
    return res.redirect(returnTo);
  });

  app.post("/cont/logout", emarqetHostOnly, (req, res) => {
    req.session.emarqetUser = null;
    return res.redirect("/");
  });

  app.get("/cont", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid");
    }
    trackPublicView(db, companyId, req, { routeName: "account", userId: user.id });
    const filters = {
      status: safeText(req.query?.status || "active"),
      q: safeText(req.query?.q),
      vertical: safeText(req.query?.vertical)
    };
    ensureUserReferralCode(db, companyId, user.id);
    const listings = loadUserListings(db, companyId, user.id, filters);
    for (const listing of listings) {
      if (safeText(listing.status).toUpperCase() === "PUBLICAT") {
        ensureListingReferralCode(db, companyId, listing);
      }
    }
    return res.type("html").send(renderEmarqetAccountPage({
      user,
      partnerProfiles: loadPartnerProfiles(db, companyId, user.id),
      verticals: loadVerticals(db, companyId),
      listings,
      stats: userListingStats(db, companyId, user.id),
      referralStats: loadEmarqetReferralStats(db, companyId, user.id),
      filters,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/cont/facturare", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid&return_to=/cont");
    }
    const billingProfile = checkoutBillingProfile({ user, body: req.body || {} });
    const billingValidation = validateBillingProfile(billingProfile);
    if (!billingValidation.ok) return res.redirect("/cont?err=billing_required");
    saveCheckoutBillingProfile(db, companyId, {}, user, billingProfile);
    return res.redirect("/cont?ok=billing_saved");
  });

  app.get("/cont/distribuie/:slugOrCode", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect(`/cont/login?err=invalid&return_to=${encodeURIComponent(req.originalUrl || "/cont")}`);
    }
    ensureUserReferralCode(db, companyId, user.id);
    const listing = findUserListingForMarketplace(db, companyId, user, req.params?.slugOrCode);
    if (!listing) return res.status(404).type("html").send(renderEmarqetPublicNotFoundPage({ user }));
    trackPublicView(db, companyId, req, { routeName: "account_share", userId: user.id, listingId: listing.id, verticalCode: listing.vertical_code });
    return res.type("html").send(renderEmarqetReferralSharePage({
      user,
      listing,
      shareKit: emarqetReferralShareKit(db, companyId, listing),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/cont/distribuie/:slugOrCode/share", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect(`/cont/login?err=invalid&return_to=${encodeURIComponent(req.originalUrl || "/cont")}`);
    }
    const listing = findUserListingForMarketplace(db, companyId, user, req.params?.slugOrCode);
    if (!listing) return res.redirect("/cont?err=missing");
    registerEmarqetReferralShare(db, companyId, listing, user, req.body?.channel || "facebook");
    return res.redirect(`/cont/distribuie/${encodeURIComponent(listing.slug || listing.listing_code || listing.id)}?ok=shared`);
  });

  app.get("/cont/marketplace/:slugOrCode", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect(`/cont/login?err=invalid&return_to=${encodeURIComponent(req.originalUrl || "/cont")}`);
    }
    const listing = findUserListingForMarketplace(db, companyId, user, req.params?.slugOrCode);
    if (!listing) {
      return res.status(404).type("html").send(renderEmarqetPublicNotFoundPage({ user }));
    }
    trackPublicView(db, companyId, req, { routeName: "account_marketplace", userId: user.id, listingId: listing.id, verticalCode: listing.vertical_code });
    return res.type("html").send(renderEmarqetMarketplacePublishPage({
      user,
      listing
    }));
  });

  app.get("/cont/business", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid&return_to=/cont/business");
    }
    trackPublicView(db, companyId, req, { routeName: "business_profile", userId: user.id });
    return res.type("html").send(renderEmarqetBusinessPage({
      user,
      profiles: loadPartnerProfiles(db, companyId, user.id),
      pricingPlans: loadEmarqetPricingPlans(db, companyId, true),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/cont/business", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid&return_to=/cont/business");
    }
    const result = upsertPartnerProfile(db, companyId, user, req.body || {});
    if (!result.ok) {
      return res.redirect(`/cont/business?err=${encodeURIComponent(result.error || "business_required")}`);
    }
    const config = partnerTypeConfig(req.body?.partner_type);
    createLead(db, companyId, {
      requester_name: safeText(req.body?.display_name || user.display_name),
      requester_email: normalizeEmail(req.body?.email || user.email),
      requester_phone: safeText(req.body?.phone || user.phone),
      source: "partner_profile_request",
      message: `Cerere profil business e-Marqet: ${config?.label || req.body?.partner_type} · ${safeText(req.body?.display_name)} · CUI ${normalizeCui(req.body?.cui)}`
    });
    return res.redirect("/cont/business?ok=business_saved");
  });

  app.get("/cont/importuri", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid&return_to=/cont/importuri");
    }
    trackPublicView(db, companyId, req, { routeName: "account_imports", userId: user.id });
    return res.type("html").send(renderEmarqetImportPage({
      user,
      profiles: loadPartnerProfiles(db, companyId, user.id),
      imports: loadPartnerImports(db, companyId, user.id),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err),
      imported: safeText(req.query?.imported),
      skipped: safeText(req.query?.skipped)
    }));
  });

  app.post("/cont/importuri", emarqetHostOnly, requireEmarqetUser, handleEmarqetCsvUpload, async (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid&return_to=/cont/importuri");
    }
    const profile = findPartnerProfile(db, companyId, user.id, req.body?.profile_id);
    if (!profile) return res.redirect("/cont/importuri?err=business_profile_missing");
    if (["RESPINS", "PAUZAT"].includes(safeText(profile.status).toUpperCase())) {
      return res.redirect("/cont/importuri?err=business_inactive");
    }
    if (!req.file?.buffer?.length) return res.redirect("/cont/importuri?err=import_file_missing");
    const config = partnerTypeConfig(profile.partner_type);
    const vertical = findVertical(db, companyId, config?.verticalCode);
    if (!config || !vertical) return res.redirect("/cont/importuri?err=partner_type");
    try {
      const result = await createPartnerImport(db, companyId, user, profile, vertical, req.file);
      if (!result.ok) return res.redirect(`/cont/importuri?err=${encodeURIComponent(result.error || "import_failed")}`);
      return res.redirect(`/cont/importuri?ok=imported&imported=${encodeURIComponent(result.imported)}&skipped=${encodeURIComponent(result.skipped)}`);
    } catch (error) {
      console.error("[EMARQET] Partner import failed", error?.message || error);
      return res.redirect("/cont/importuri?err=import_failed");
    }
  });

  app.get("/publica", emarqetHostOnly, requireEmarqetUser, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    trackPublicView(db, companyId, req, { routeName: "publish", userId: user?.id });
    return res.type("html").send(renderEmarqetPublicPublishPage({
      verticals: loadVerticals(db, companyId, true),
      pricingPlans: loadEmarqetPricingPlans(db, companyId, true),
      partnerProfiles: user ? loadPartnerProfiles(db, companyId, user.id) : [],
      user,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/publica", emarqetHostOnly, requireEmarqetUser, handleEmarqetImageUpload, (req, res) => {
    const companyId = bootstrap(db);
    const user = findEmarqetUserById(db, companyId, currentEmarqetUser(req)?.id);
    if (!user) {
      cleanupUploadedFiles(req.files || []);
      req.session.emarqetUser = null;
      return res.redirect("/cont/login?err=invalid&return_to=/publica");
    }
    const body = req.body || {};
    const partnerProfile = body.partner_profile_id
      ? findPartnerProfile(db, companyId, user.id, body.partner_profile_id)
      : null;
    const vertical = findVertical(db, companyId, body.vertical_id);
    const selectedPlan = findPricingPlanRow(db, companyId, body.plan_code || partnerProfile?.selected_plan_code) || findPricingPlanRow(db, companyId, "free") || {};
    const title = safeText(body.title);
    const ownerName = safeText(body.owner_name || partnerProfile?.display_name || user.display_name || user.email);
    const ownerEmail = normalizeEmail(body.owner_email || partnerProfile?.email || user.email);
    const notes = safeText(body.notes);
    const errors = [];

    if (body.partner_profile_id && !partnerProfile) errors.push("Profilul business nu este valid.");
    if (!vertical) errors.push("Alege un vertical activ.");
    if (!title) errors.push("Completează titlul anunțului.");
    if (!ownerName) errors.push("Completează numele.");
    if (!ownerEmail) errors.push("Completează emailul.");
    if (!notes) errors.push("Adaugă o descriere.");

    if (errors.length) {
      cleanupUploadedFiles(req.files || []);
      return res.status(400).type("html").send(renderEmarqetPublicPublishPage({
        verticals: loadVerticals(db, companyId, true),
        pricingPlans: loadEmarqetPricingPlans(db, companyId, true),
        partnerProfiles: loadPartnerProfiles(db, companyId, user.id),
        user,
        form: body,
        errors
      }));
    }

    const listingCode = nextListingCode(db, companyId);
    const slug = uniqueSlug(db, companyId, title);
    const ownerPhone = safeText(body.owner_phone || partnerProfile?.phone);
    const imageUrls = imageUrlsFromBody(body, req.files || []);
    const metadata = metadataFromBody(vertical.code, body);
    const sellerType = safeText(body.seller_type || partnerTypeConfig(partnerProfile?.partner_type)?.sellerType);
    if (sellerType) metadata.seller_type = sellerType;
    if (partnerProfile?.id) metadata.partner_profile_id = partnerProfile.id;
    const token = checkoutToken();
    const publicNotes = [
      notes,
      ownerPhone ? `Telefon contact: ${ownerPhone}` : ""
    ].filter(Boolean).join("\n\n");

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO emarqet_listings
          (company_id, emarqet_user_id, partner_profile_id, vertical_id, listing_code, title, slug, owner_name, owner_email, location, price_amount, price_currency, status, quality_score, ai_status, metadata_json, primary_image_url, image_urls_json, contact_phone, seller_type, selected_plan_code, stripe_checkout_status, checkout_token, notes, created_by)
        VALUES
          (@company_id, @emarqet_user_id, @partner_profile_id, @vertical_id, @listing_code, @title, @slug, @owner_name, @owner_email, @location, @price_amount, @price_currency, 'IN_REVIZIE', 35, 'DE_REVIZUIT', @metadata_json, @primary_image_url, @image_urls_json, @contact_phone, @seller_type, @selected_plan_code, 'PENDING', @checkout_token, @notes, 'emarqet-public')
      `).run({
        company_id: companyId,
        emarqet_user_id: user.id,
        partner_profile_id: partnerProfile?.id || null,
        vertical_id: vertical.id,
        listing_code: listingCode,
        title,
        slug,
        owner_name: ownerName,
        owner_email: ownerEmail,
        location: safeText(body.location),
        price_amount: parseAmount(body.price_amount),
        price_currency: safeText(body.price_currency).toUpperCase() || "RON",
        metadata_json: safeJson(metadata),
        primary_image_url: imageUrls[0] || "",
        image_urls_json: safeJson(imageUrls),
        contact_phone: ownerPhone,
        seller_type: sellerType,
        selected_plan_code: safeText(selectedPlan.code || body.plan_code).toLowerCase() || "free",
        checkout_token: token,
        notes: publicNotes
      });
      createLead(db, companyId, {
        listing_id: result.lastInsertRowid,
        vertical_id: vertical.id,
        requester_name: ownerName,
        requester_email: ownerEmail,
        requester_phone: ownerPhone,
        source: "public_publish_request",
        message: `Solicitare publicare e-Marqet: ${title}`
      });
    });
    tx();

    if (paymentRequiredForPlan(selectedPlan)) {
      return res.redirect(`/checkout/${encodeURIComponent(listingCode)}?token=${encodeURIComponent(token)}`);
    }
    return res.redirect("/cont?status=pending&ok=sent");
  });

  app.post("/contact", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const body = req.body || {};
    const listing = db.prepare(`
      SELECT id, vertical_id, slug, listing_code
      FROM emarqet_listings
      WHERE company_id=?
        AND id=?
        AND UPPER(COALESCE(status,''))='PUBLICAT'
      LIMIT 1
    `).get(companyId, Number(body.listing_id || 0));
    const fallback = listing ? `/anunt/${listing.slug || listing.listing_code || listing.id}` : "/anunturi";
    const returnTo = safeReturnTo(body.return_to, fallback);
    const name = safeText(body.requester_name);
    const email = normalizeEmail(body.requester_email);
    const phone = safeText(body.requester_phone);
    const message = safeText(body.message);

    if (!listing) return res.redirect(`${returnTo}?err=missing`);
    if (!name || (!email && !phone) || !message) return res.redirect(`${returnTo}?err=required`);

    createLead(db, companyId, {
      listing_id: listing.id,
      vertical_id: listing.vertical_id,
      requester_name: name,
      requester_email: email,
      requester_phone: phone,
      source: "public_contact",
      message
    });

    return res.redirect(`${returnTo}?ok=lead`);
  });

  app.post("/services/request", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const body = req.body || {};
    const listing = findListing(db, companyId, body.listing_id);
    const returnTo = safeReturnTo(body.return_to, listing ? `/anunt/${listing.slug || listing.listing_code || listing.id}` : "/anunturi");
    const serviceCode = safeText(body.service_code);
    const name = safeText(body.requester_name);
    const email = normalizeEmail(body.requester_email);
    const phone = safeText(body.requester_phone);
    if (!listing) return res.redirect(`${returnTo}?err=missing`);
    if (!serviceCode || !name || (!email && !phone)) return res.redirect(`${returnTo}?err=required`);

    try {
      createMarketplaceServiceRequest(db, companyId, {
        service_code: serviceCode,
        listing_id: listing.id,
        vertical_id: listing.vertical_id,
        requester_name: name,
        requester_email: email,
        requester_phone: phone,
        request_payload: {
          vin: safeText(body.vin),
          return_to: returnTo
        },
        notes: safeText(body.notes),
        created_by: "emarqet-public"
      });
      createLead(db, companyId, {
        listing_id: listing.id,
        vertical_id: listing.vertical_id,
        requester_name: name,
        requester_email: email,
        requester_phone: phone,
        source: `marketplace_service_${serviceCode}`,
        message: `Solicitare serviciu e-Marqet: ${serviceCode}${safeText(body.vin) ? ` · VIN ${safeText(body.vin)}` : ""}`
      });
    } catch (error) {
      if (String(error?.message || "").includes("marketplace_service_missing")) {
        return res.redirect(`${returnTo}?err=missing`);
      }
      throw error;
    }

    return res.redirect(`${returnTo}?ok=service`);
  });

  app.get("/checkout/:slugOrCode", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const listing = findCheckoutListing(db, companyId, req.params.slugOrCode);
    if (!listing || !checkoutTokenMatches(listing, req.query?.token)) {
      return res.status(404).type("html").send(renderEmarqetPublicNotFoundPage({ user: currentEmarqetUser(req) }));
    }
    if (isEmarqetListingPaid(listing)) return res.redirect(paidListingRedirect(listing));
    trackPublicView(db, companyId, req, { routeName: "checkout", listingId: listing.id, verticalCode: listing.vertical_code, partnerProfileId: listing.partner_profile_id });
    const plan = findPricingPlanRow(db, companyId, listing.selected_plan_code) || findPricingPlanRow(db, companyId, "free") || {};
    const stripeAvailable = Boolean(stripeClientForEmarqet());
    const listingUser = findEmarqetUserById(db, companyId, listing.emarqet_user_id || currentEmarqetUser(req)?.id);
    const billingProfile = checkoutBillingProfile({ listing, user: listingUser || {} });
    return res.type("html").send(renderEmarqetPublicCheckoutPage({
      listing,
      plan,
      token: safeText(req.query?.token),
      billingProfile,
      stripeMode: emarqetStripeMode(),
      stripeAvailable,
      simulateAvailable: !stripeAvailable && emarqetSimulatedPaymentsAllowed(),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/checkout/:slugOrCode/simulate", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const listing = findCheckoutListing(db, companyId, req.params.slugOrCode);
    const token = safeText(req.body?.token || req.query?.token);
    if (!listing || !checkoutTokenMatches(listing, token)) return res.redirect("/publica?err=missing");
    if (isEmarqetListingPaid(listing)) return res.redirect(paidListingRedirect(listing));
    if (!emarqetSimulatedPaymentsAllowed()) {
      return res.redirect(`/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=simulate_disabled`);
    }
    const plan = findPricingPlanRow(db, companyId, listing.selected_plan_code) || {};
    const listingUser = findEmarqetUserById(db, companyId, listing.emarqet_user_id || currentEmarqetUser(req)?.id);
    const billingProfile = checkoutBillingProfile({ listing, user: listingUser || {}, body: req.body || {} });
    const billingValidation = validateBillingProfile(billingProfile);
    if (!billingValidation.ok) {
      return res.status(400).type("html").send(renderEmarqetPublicCheckoutPage({
        listing,
        plan,
        token,
        billingProfile,
        billingErrors: billingValidation.errors,
        billingErrorMessage: billingProfileErrorMessage(billingValidation.errors),
        stripeMode: emarqetStripeMode(),
        stripeAvailable: Boolean(stripeClientForEmarqet()),
        simulateAvailable: emarqetSimulatedPaymentsAllowed(),
        user: currentEmarqetUser(req),
        err: "billing_required"
      }));
    }
    const savedBillingProfile = saveCheckoutBillingProfile(db, companyId, listing, listingUser || {}, billingProfile);
    const tx = db.transaction(() => {
      createEmarqetBillingPayment(db, companyId, listing, plan, {
        source: "emarqet_simulator",
        provider_event_type: "emarqet.payment.simulated",
        status: "paid",
        simulated: true,
        billing_profile: savedBillingProfile,
        notes: "Plata e-Marqet simulata pentru test."
      });
      markListingPaidAwaitingApproval(db, companyId, listing, { status: "PAID_SIMULATED" });
    });
    tx();
    return res.redirect("/cont?status=pending&ok=paid_pending");
  });

  app.post("/checkout/:slugOrCode/stripe", emarqetHostOnly, async (req, res) => {
    const companyId = bootstrap(db);
    const listing = findCheckoutListing(db, companyId, req.params.slugOrCode);
    const token = safeText(req.body?.token || req.query?.token);
    if (!listing || !checkoutTokenMatches(listing, token)) return res.redirect("/publica?err=missing");
    if (isEmarqetListingPaid(listing)) return res.redirect(paidListingRedirect(listing));
    const stripe = stripeClientForEmarqet();
    const plan = findPricingPlanRow(db, companyId, listing.selected_plan_code) || {};
    if (!stripe || !paymentRequiredForPlan(plan)) {
      return res.redirect(`/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=stripe_disabled`);
    }
    const listingUser = findEmarqetUserById(db, companyId, listing.emarqet_user_id || currentEmarqetUser(req)?.id);
    const billingProfile = checkoutBillingProfile({ listing, user: listingUser || {}, body: req.body || {} });
    const billingValidation = validateBillingProfile(billingProfile);
    if (!billingValidation.ok) {
      return res.status(400).type("html").send(renderEmarqetPublicCheckoutPage({
        listing,
        plan,
        token,
        billingProfile,
        billingErrors: billingValidation.errors,
        billingErrorMessage: billingProfileErrorMessage(billingValidation.errors),
        stripeMode: emarqetStripeMode(),
        stripeAvailable: Boolean(stripe),
        simulateAvailable: !stripe && emarqetSimulatedPaymentsAllowed(),
        user: currentEmarqetUser(req),
        err: "billing_required"
      }));
    }
    const savedBillingProfile = saveCheckoutBillingProfile(db, companyId, listing, listingUser || {}, billingProfile);

    try {
      const amount = planAmount(plan);
      const currency = safeText(plan.currency || "RON").toLowerCase();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: `${emarqetPublicBaseUrl()}/checkout/${encodeURIComponent(listing.listing_code || listing.id)}/success?token=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${emarqetPublicBaseUrl()}/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=cancelled`,
        customer_email: normalizeEmail(listing.owner_email) || undefined,
        client_reference_id: String(listing.id),
        billing_address_collection: "required",
        ...(emarqetStripeTaxIdCollectionEnabled() ? { tax_id_collection: { enabled: true } } : {}),
        ...(emarqetStripeAutomaticTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
        metadata: {
          emarqet_company_id: String(companyId),
          listing_id: String(listing.id),
          listing_code: String(listing.listing_code || ""),
          plan_code: String(plan.code || listing.selected_plan_code || ""),
          plan_name: String(plan.name || listing.selected_plan_code || ""),
          initiated_by_email: normalizeEmail(listing.owner_email),
          billing_name: savedBillingProfile.billing_name,
          billing_cui: savedBillingProfile.billing_cui,
          billing_city: savedBillingProfile.billing_city,
          billing_county: savedBillingProfile.billing_county,
          billing_country: savedBillingProfile.billing_country,
          source: "emarqet_public_checkout"
        },
        subscription_data: {
          metadata: {
            emarqet_company_id: String(companyId),
            listing_id: String(listing.id),
            listing_code: String(listing.listing_code || ""),
            plan_code: String(plan.code || listing.selected_plan_code || ""),
            plan_name: String(plan.name || listing.selected_plan_code || ""),
            initiated_by_email: normalizeEmail(listing.owner_email),
            billing_name: savedBillingProfile.billing_name,
            billing_cui: savedBillingProfile.billing_cui,
            billing_city: savedBillingProfile.billing_city,
            billing_county: savedBillingProfile.billing_county,
            billing_country: savedBillingProfile.billing_country,
            source: "emarqet_public_checkout"
          }
        },
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: toStripeAmount(amount),
              recurring: { interval: "month" },
              product_data: {
                name: `e-Marqet ${plan.name || listing.selected_plan_code || "abonament"}`,
                description: `Abonament e-Marqet pentru ${listing.title || listing.listing_code}`
              }
            },
            quantity: 1
          }
        ]
      });

      db.prepare(`
        UPDATE emarqet_listings
        SET stripe_checkout_status='CHECKOUT_CREATED',
            stripe_checkout_session_id=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE company_id=? AND id=?
      `).run(session.id, companyId, listing.id);
      createEmarqetBillingPayment(db, companyId, listing, plan, {
        source: "stripe",
        provider_event_type: "checkout.session.created",
        status: "initiated",
        stripe_checkout_session_id: session.id,
        reference_code: session.id,
        billing_profile: savedBillingProfile,
        notes: "Checkout Stripe e-Marqet creat."
      });
      return res.redirect(session.url);
    } catch (error) {
      console.error("[EMARQET] Stripe checkout failed", error?.message || error);
      return res.redirect(`/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=stripe`);
    }
  });

  app.get("/checkout/:slugOrCode/success", emarqetHostOnly, async (req, res) => {
    const companyId = bootstrap(db);
    const listing = findCheckoutListing(db, companyId, req.params.slugOrCode);
    const token = safeText(req.query?.token);
    if (!listing || !checkoutTokenMatches(listing, token)) return res.redirect("/publica?err=missing");
    const stripe = stripeClientForEmarqet();
    const sessionId = safeText(req.query?.session_id);
    if (!stripe || !sessionId) {
      return res.redirect(`/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=stripe`);
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (String(session?.payment_status || "").toLowerCase() !== "paid") {
        return res.redirect(`/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=unpaid`);
      }
      const plan = findPricingPlanRow(db, companyId, listing.selected_plan_code) || {};
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : safeText(session.subscription?.id);
      await finalizeEmarqetStripePayment(db, {
        companyId,
        listing,
        plan,
        providerEventType: "checkout.session.completed",
        status: "paid",
        amount: Number(session.amount_total || 0) > 0 ? Number(session.amount_total || 0) / 100 : planAmount(plan),
        currency: session.currency || plan.currency || "RON",
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId: subscriptionId,
        stripeInvoiceId: safeText(session.invoice),
        stripePaymentIntentId: safeText(session.payment_intent),
        referenceCode: session.id,
        paidAt: new Date(Number(session.created || 0) * 1000 || Date.now()).toISOString(),
        livemode: Boolean(session.livemode),
        stripeBillingDetails: emarqetStripeBillingDetails(session),
        metadata: {
          emarqet_company_id: String(companyId),
          listing_id: String(listing.id),
          listing_code: String(listing.listing_code || ""),
          plan_code: String(plan.code || listing.selected_plan_code || ""),
          plan_name: String(plan.name || listing.selected_plan_code || ""),
          source: "emarqet_public_success"
        },
        ensureFacturaXmlGenerated,
        transporter
      });
      return res.redirect("/cont?status=pending&ok=paid_pending");
    } catch (error) {
      console.error("[EMARQET] Stripe success sync failed", error?.message || error);
      return res.redirect(`/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(token)}&err=stripe`);
    }
  });

  app.get("/anunt/:slugOrCode", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    let listing = findListing(db, companyId, req.params.slugOrCode);
    if (!listing) return res.status(404).type("html").send(renderEmarqetPublicNotFoundPage({ user: currentEmarqetUser(req) }));
    trackPublicView(db, companyId, req, { routeName: "listing", listingId: listing.id, verticalCode: listing.vertical_code, partnerProfileId: listing.partner_profile_id });
    const ref = safeText(req.query?.ref);
    if (ref) {
      const tracked = registerEmarqetReferralClick(db, companyId, listing, ref, req);
      if (tracked?.reward) listing = findListing(db, companyId, req.params.slugOrCode) || listing;
    }
    return res.type("html").send(renderEmarqetPublicListingPage({
      listing: { ...listing, is_promoted: isListingPromoted(listing) },
      services: loadMarketplaceServices(db, companyId, { publicOnly: true, verticalCode: listing.vertical_code }),
      badges: loadListingBadges(db, companyId, listing.id),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/preturi", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    trackPublicView(db, companyId, req, { routeName: "pricing" });
    return res.type("html").send(renderEmarqetPublicPricingPage({
      pricingPlans: loadEmarqetPricingPlans(db, companyId, true),
      addons: loadEmarqetAddons(db, companyId, true),
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/:verticalCode", emarqetHostOnly, (req, res) => {
    const companyId = bootstrap(db);
    const vertical = findVertical(db, companyId, req.params.verticalCode);
    if (!vertical) return res.status(404).type("html").send(renderEmarqetPublicNotFoundPage({ user: currentEmarqetUser(req) }));
    trackPublicView(db, companyId, req, { routeName: "vertical", verticalCode: vertical.code });
    const filters = { ...requestFilters(req.query || {}), vertical: vertical.code };
    return res.type("html").send(renderEmarqetPublicVerticalPage({
      vertical,
      verticals: loadVerticals(db, companyId),
      listings: loadListings(db, companyId, filters, 120),
      filters,
      user: currentEmarqetUser(req),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/api/e-marqet/verticals", (req, res) => {
    const companyId = bootstrap(db);
    return res.json({
      ok: true,
      verticals: loadVerticals(db, companyId).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        status: row.status,
        public_path: row.public_path,
        listings: Number(row.published_listings || 0)
      }))
    });
  });

  app.get("/api/e-marqet/listings", (req, res) => {
    const companyId = bootstrap(db);
    const filters = requestFilters(req.query || {});
    return res.json({
      ok: true,
      listings: loadListings(db, companyId, filters, 120).map(publicListingPayload)
    });
  });

  app.get("/api/e-marqet/listings/:slugOrCode", (req, res) => {
    const companyId = bootstrap(db);
    const listing = findListing(db, companyId, req.params.slugOrCode);
    if (!listing) return res.status(404).json({ ok: false, error: "listing_not_found" });
    return res.json({ ok: true, listing: publicListingPayload(listing) });
  });

  app.get("/api/e-marqet/pricing", (req, res) => {
    const companyId = bootstrap(db);
    return res.json({
      ok: true,
      ...emarqetPricingPayload(
        loadEmarqetPricingPlans(db, companyId, true),
        loadEmarqetAddons(db, companyId, true)
      )
    });
  });

  app.get("/api/e-marqet/services", (req, res) => {
    const companyId = bootstrap(db);
    const verticalCode = safeText(req.query?.vertical || "auto");
    return res.json({
      ok: true,
      services: marketplaceServicesPayload(loadMarketplaceServices(db, companyId, { publicOnly: true, verticalCode }))
    });
  });

  app.post("/api/e-marqet/services/requests", (req, res) => {
    const companyId = bootstrap(db);
    const body = req.body || {};
    const listing = body.listing_id ? findListing(db, companyId, body.listing_id) : null;
    const serviceCode = safeText(body.service_code);
    const name = safeText(body.requester_name);
    const email = normalizeEmail(body.requester_email);
    const phone = safeText(body.requester_phone);
    if (!serviceCode || !name || (!email && !phone)) {
      return res.status(400).json({ ok: false, error: "required_fields" });
    }
    try {
      createMarketplaceServiceRequest(db, companyId, {
        service_code: serviceCode,
        listing_id: listing?.id || null,
        vertical_id: listing?.vertical_id || Number(body.vertical_id || 0) || null,
        requester_name: name,
        requester_email: email,
        requester_phone: phone,
        request_payload: body.payload || {},
        notes: safeText(body.notes),
        created_by: "emarqet-public-api"
      });
    } catch (error) {
      if (String(error?.message || "").includes("marketplace_service_missing")) {
        return res.status(404).json({ ok: false, error: "service_not_found" });
      }
      throw error;
    }
    return res.json({ ok: true });
  });

  app.post("/api/e-marqet/services/vin-decode", async (req, res) => {
    const companyId = bootstrap(db);
    const body = req.body || {};
    const listing = body.listing_id ? findListing(db, companyId, body.listing_id) : null;
    let decoded;
    try {
      decoded = await decodeVinBasic(body.vin, { modelYear: body.model_year });
    } catch (error) {
      decoded = {
        ok: false,
        error: "provider_unavailable",
        message: String(error?.message || "VIN provider unavailable")
      };
    }
    try {
      createMarketplaceServiceRequest(db, companyId, {
        service_code: "vin_decode_basic",
        listing_id: listing?.id || null,
        vertical_id: listing?.vertical_id || Number(body.vertical_id || 0) || null,
        requester_name: safeText(body.requester_name),
        requester_email: normalizeEmail(body.requester_email),
        requester_phone: safeText(body.requester_phone),
        status: decoded.ok ? "FINALIZAT" : "ESUAT",
        request_payload: {
          vin: safeText(body.vin),
          model_year: safeText(body.model_year)
        },
        result: decoded,
        created_by: "emarqet-vin-api"
      });
    } catch {
      // The decode response should still be returned even if logging the request fails.
    }
    return res.status(decoded.ok ? 200 : 400).json(decoded);
  });

  app.post("/api/e-marqet/leads", (req, res) => {
    const companyId = bootstrap(db);
    const body = req.body || {};
    const listing = body.listing_id ? findListing(db, companyId, body.listing_id) : null;
    const name = safeText(body.requester_name);
    const email = normalizeEmail(body.requester_email);
    const phone = safeText(body.requester_phone);
    const message = safeText(body.message);
    if (!name || (!email && !phone) || !message) {
      return res.status(400).json({ ok: false, error: "required_fields" });
    }
    createLead(db, companyId, {
      listing_id: listing?.id || null,
      vertical_id: listing?.vertical_id || Number(body.vertical_id || 0) || null,
      requester_name: name,
      requester_email: email,
      requester_phone: phone,
      source: "public_api",
      message
    });
    return res.json({ ok: true });
  });
}
