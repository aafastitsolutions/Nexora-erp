#!/usr/bin/env node
import crypto from "node:crypto";
import dotenv from "dotenv";
import { db, migrate } from "../db.js";
import { seedEmarqetSocialDefaults } from "../lib/emarqet-social-distribution.js";

dotenv.config();

const ACTOR = "emarqet-auto-site-sync";
const USER_AGENT = "NexoraEmarqetImporter/1.0 (+https://e-marqet.com)";
const DEFAULT_DELAY_MS = Number(process.env.EMARQET_AUTO_SYNC_DELAY_MS || 250);
const FETCH_TIMEOUT_MS = Number(process.env.EMARQET_AUTO_SYNC_TIMEOUT_MS || 25000);

const PARTNERS = [
  {
    key: "auto-geist",
    codePrefix: "AG",
    email: "office@autogeist.ro",
    sourceLabel: "Auto Geist REST car API",
    sourceUrl: "https://autogeist.ro/wp-json/wp/v2/car",
    websiteUrl: "https://www.autogeist.ro/",
    locationFallback: "Galati, Galati",
    phoneFallback: "+40 756 093 505; 0236 449 018",
    loader: loadAutoGeistListings
  },
  {
    key: "san-auto",
    codePrefix: "SAI",
    email: "office@sanautoimport.ro",
    sourceLabel: "SAN AUTO masini-stoc",
    sourceUrl: "https://www.sanautoimport.ro/?masini=masini-stoc",
    websiteUrl: "https://www.sanautoimport.ro/",
    locationFallback: "Iasi, Iasi",
    phoneFallback: "0787 434 555",
    loader: loadSanAutoListings
  },
  {
    key: "sebal-auto",
    codePrefix: "SBA",
    email: "sebalautomobile@gmail.com",
    displayName: "SEBAL Automobile",
    legalName: "SEBAL Automobile",
    sourceLabel: "SEBAL Automobile listings sitemap",
    sourceUrl: "https://sebal-auto.ro/wp-sitemap-posts-listings-1.xml",
    websiteUrl: "https://sebal-auto.ro/",
    facebookUrl: "https://www.facebook.com/sebalautomobile",
    instagramUrl: "https://instagram.com/sebalautomobile",
    tiktokUrl: "https://tiktok.com/@sebalautomobile",
    locationFallback: "Romania",
    phoneFallback: "+40 720 757 401",
    autoCreatePartner: true,
    promoteImported: true,
    promotionLevel: "partner_featured",
    promotionUntil: "2099-12-31",
    prepareFacebookPromotion: true,
    facebookCreatedBy: "sebal-facebook-promo",
    loader: loadSebalAutoListings
  }
];

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function safeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function decodeHtml(value = "") {
  return safeText(value)
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(
    safeText(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function safeJson(value = {}) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJson(value = "{}") {
  try {
    return JSON.parse(value || "{}") || {};
  } catch {
    return {};
  }
}

function parseNumber(value = "") {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value)
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function hashValue(value = "") {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function stableListingCode(prefix = "", sourceUrl = "") {
  return `EMQ-${prefix}-${hashValue(sourceUrl).slice(0, 10).toUpperCase()}`;
}

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "anunt";
}

function uniqueSlug(companyId, title, listingCode = "") {
  const existing = db.prepare("SELECT slug FROM emarqet_listings WHERE company_id=? AND listing_code=? LIMIT 1").get(companyId, listingCode);
  if (existing?.slug) return existing.slug;

  const base = slugify(title);
  let candidate = base;
  for (let index = 2; index < 1000; index += 1) {
    const found = db.prepare("SELECT id FROM emarqet_listings WHERE company_id=? AND slug=? LIMIT 1").get(companyId, candidate);
    if (!found) return candidate;
    candidate = `${base}-${index}`;
  }
  return `${base}-${Date.now()}`;
}

function absoluteUrl(value = "", baseUrl = "") {
  const raw = safeText(value);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

function sleep(ms = DEFAULT_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: options.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { body, response };
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { json: JSON.parse(body), response };
}

function companyIdFromDb() {
  const explicit = Number(argValue("--company-id", "0"));
  if (explicit) return explicit;
  const row = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(row?.id || 0);
}

function loadPartner(companyId, email = "") {
  return db.prepare(`
    SELECT *
    FROM emarqet_partner_profiles
    WHERE company_id=? AND lower(COALESCE(email,''))=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, normalizeEmail(email));
}

function loadEmarqetUser(companyId, email = "") {
  return db.prepare(`
    SELECT *
    FROM emarqet_users
    WHERE company_id=? AND lower(COALESCE(email,''))=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, normalizeEmail(email));
}

function partnerFromConfig(companyId, config = {}, user = {}) {
  const location = safeText(config.locationFallback);
  const [city = "", county = ""] = location.split(",").map(safeText);
  return {
    id: 0,
    company_id: companyId,
    emarqet_user_id: Number(user.id || 0),
    partner_type: "auto_dealer",
    display_name: config.displayName || config.sourceLabel,
    legal_name: config.legalName || config.displayName || config.sourceLabel,
    email: normalizeEmail(config.email),
    phone: config.phoneFallback || "",
    website: config.websiteUrl || "",
    city,
    county,
    address: "",
    selected_plan_code: "auto_business",
    import_mode: "website_preluare_aprobata",
    status: "ACTIV",
    founder_badge_enabled: 1,
    founder_badge_label: "Partener verificat"
  };
}

function loadOrCreatePartner(companyId, config = {}, commit = false) {
  const existing = loadPartner(companyId, config.email);
  if (existing?.id) return existing;
  if (!config.autoCreatePartner) return null;

  let user = loadEmarqetUser(companyId, config.email);
  const virtual = partnerFromConfig(companyId, config, user);
  if (!commit) return virtual;

  const created = db.transaction(() => {
    user = loadEmarqetUser(companyId, config.email);
    if (!user?.id) {
      const userResult = db.prepare(`
        INSERT INTO emarqet_users
          (company_id, email, password_hash, display_name, phone, status, auth_provider, created_at, updated_at)
        VALUES
          (?, ?, NULL, ?, ?, 'ACTIV', 'website_import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        companyId,
        normalizeEmail(config.email),
        config.displayName || config.sourceLabel,
        config.phoneFallback || ""
      );
      user = loadEmarqetUser(companyId, config.email) || { id: userResult.lastInsertRowid };
    }

    const payload = partnerFromConfig(companyId, config, user);
    const result = db.prepare(`
      INSERT INTO emarqet_partner_profiles
        (company_id, emarqet_user_id, partner_type, display_name, legal_name, cui, email, phone, website, city, county, address, selected_plan_code, import_mode, status, verified_at, notes, created_by, founder_badge_enabled, founder_badge_label, founder_benefits_enabled, founder_notes)
      VALUES
        (@company_id, @emarqet_user_id, @partner_type, @display_name, @legal_name, '', @email, @phone, @website, @city, @county, @address, @selected_plan_code, @import_mode, @status, CURRENT_TIMESTAMP, @notes, @created_by, 1, @founder_badge_label, 1, @founder_notes)
    `).run({
      ...payload,
      notes: `Profil creat automat dupa confirmarea de preluare anunturi de pe ${config.websiteUrl}.`,
      created_by: ACTOR,
      founder_notes: "Partener auto aprobat pentru import website-sync si expunere promovata in e-Marqet."
    });
    return loadPartner(companyId, config.email) || { ...payload, id: result.lastInsertRowid };
  })();
  return created;
}

function loadVertical(companyId) {
  return db.prepare("SELECT * FROM emarqet_verticals WHERE company_id=? AND code='auto' LIMIT 1").get(companyId)
    || db.prepare("SELECT * FROM emarqet_verticals WHERE code='auto' ORDER BY company_id DESC LIMIT 1").get();
}

function publicLocation(profile = {}, config = {}) {
  return [profile.city, profile.county].map(safeText).filter(Boolean).join(", ") || config.locationFallback || "";
}

function sourceMetadata(config = {}, listing = {}, extra = {}) {
  return {
    ...extra,
    seller_type: "Dealer auto",
    partner_profile_id: listing.partner_profile_id,
    source: {
      partner_key: config.key,
      source_label: config.sourceLabel,
      source_url: listing.source_url,
      source_id: listing.source_id || "",
      source_hash: listing.source_hash,
      source_last_modified: listing.source_last_modified || "",
      partner_website: config.websiteUrl || "",
      partner_facebook: config.facebookUrl || "",
      partner_instagram: config.instagramUrl || "",
      partner_tiktok: config.tiktokUrl || "",
      synced_at: new Date().toISOString()
    }
  };
}

function listingNotes(config = {}, listing = {}) {
  const specs = listing.specs || {};
  const parts = [
    listing.description,
    specs.year ? `An: ${specs.year}` : "",
    specs.mileage ? `Km: ${specs.mileage}` : "",
    specs.fuel ? `Combustibil: ${specs.fuel}` : "",
    specs.transmission ? `Cutie: ${specs.transmission}` : "",
    `Import automat din site partener aprobat: ${listing.source_url}`
  ].map(safeText).filter(Boolean);
  return parts.join("\n");
}

function fmtAmount(value, currency = "EUR") {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Pret la cerere";
  const label = String(currency || "EUR").toUpperCase() === "RON" ? "lei" : String(currency || "EUR").toUpperCase();
  return `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${label}`;
}

function publicBaseUrl() {
  return safeText(process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");
}

function publicListingUrl(row = {}, campaign = "emarqet_social_distribution") {
  const slug = safeText(row.slug || row.listing_code || row.id);
  const url = new URL(`/anunt/${encodeURIComponent(slug)}`, publicBaseUrl());
  url.searchParams.set("utm_source", "facebook");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", safeText(row.listing_code || `listing_${row.id}`));
  return url.toString();
}

function facebookCaptionFor(row = {}, target = {}, config = {}) {
  const title = safeText(row.title) || "Anunt auto";
  const partnerName = config.displayName || row.owner_name || "Partener e-Marqet";
  const priceLine = `Pret: ${fmtAmount(row.price_amount, row.price_currency)}`;
  const locationLine = row.location ? `Locatie: ${row.location}` : "";
  const url = publicListingUrl(row, config.facebookCampaign || `${config.key}_launch`);
  if (target.target_type === "marketplace") {
    return [
      title,
      "",
      priceLine,
      locationLine,
      `Partener verificat: ${partnerName}`,
      "",
      "Galerie foto si contact direct:",
      url
    ].filter(Boolean).join("\n");
  }
  return [
    `Nou pe e-Marqet: ${title}`,
    "",
    priceLine,
    locationLine,
    `Partener verificat: ${partnerName}`,
    "",
    "Vezi detalii, galerie foto si contact direct:",
    url
  ].filter(Boolean).join("\n");
}

function prepareFacebookPromotionDrafts({ companyId, profile, config, commit }) {
  if (!commit || !config.prepareFacebookPromotion) return null;
  seedEmarqetSocialDefaults(db, companyId);
  const targets = db.prepare(`
    SELECT *
    FROM emarqet_social_targets
    WHERE company_id=?
      AND platform='facebook'
      AND target_type IN ('page','marketplace')
    ORDER BY CASE target_type WHEN 'page' THEN 1 ELSE 2 END, id ASC
  `).all(companyId);
  const listings = db.prepare(`
    SELECT *
    FROM emarqet_listings
    WHERE company_id=?
      AND partner_profile_id=?
      AND UPPER(COALESCE(status,''))='PUBLICAT'
      AND listing_code LIKE ?
    ORDER BY price_amount DESC, id ASC
  `).all(companyId, profile.id, `EMQ-${config.codePrefix}-%`);
  const exists = db.prepare(`
    SELECT id
    FROM emarqet_social_posts
    WHERE company_id=?
      AND listing_id=?
      AND COALESCE(social_target_id, 0)=?
      AND target_type=?
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO emarqet_social_posts (
      company_id, listing_id, partner_profile_id, social_target_id, platform, target_type,
      content_type, caption, hashtags, link_url, media_url, status, created_by, updated_at
    )
    VALUES (?, ?, ?, ?, 'facebook', ?, ?, ?, ?, ?, ?, 'ready', ?, datetime('now'))
  `);
  let created = 0;
  let skipped = 0;
  const createdBy = safeText(config.facebookCreatedBy || `${config.key}-facebook-promo`);
  const hashtags = safeText(config.facebookHashtags || "#eMarqet #Auto #MasiniRulate #SebalAutomobile");
  const tx = db.transaction(() => {
    for (const listing of listings) {
      for (const target of targets) {
        if (exists.get(companyId, listing.id, target.id, target.target_type)?.id) {
          skipped += 1;
          continue;
        }
        insert.run(
          companyId,
          listing.id,
          listing.partner_profile_id || null,
          target.id,
          target.target_type,
          target.target_type === "marketplace" ? "marketplace_listing_copy" : "listing_post",
          facebookCaptionFor(listing, target, config),
          hashtags,
          publicListingUrl(listing, config.facebookCampaign || `${config.key}_launch`),
          safeText(listing.primary_image_url),
          createdBy
        );
        created += 1;
      }
    }
  });
  tx();
  return { listings: listings.length, targets: targets.length, created, skipped };
}

function existingSourceHash(row = {}) {
  const metadata = parseJson(row.metadata_json);
  return safeText(metadata?.source?.source_hash);
}

function upsertListing({ companyId, vertical, profile, config, listing, commit }) {
  const listingCode = stableListingCode(config.codePrefix, listing.source_url);
  const existing = db.prepare("SELECT * FROM emarqet_listings WHERE company_id=? AND listing_code=? LIMIT 1").get(companyId, listingCode);
  if (existing) {
    const existingMetadata = parseJson(existing.metadata_json);
    if (existingMetadata?.source?.owner_deleted_at) {
      return { action: "owner_deleted", id: existing.id, code: listingCode, title: listing.title };
    }
    if (existingMetadata?.source?.owner_edited_at) {
      return { action: "owner_edited", id: existing.id, code: listingCode, title: listing.title };
    }
    if (existingMetadata?.source?.owner_paused_at && safeText(existing.status).toUpperCase() === "PAUZAT") {
      return { action: "owner_paused", id: existing.id, code: listingCode, title: listing.title };
    }
  }
  const slug = uniqueSlug(companyId, listing.title, listingCode);
  const status = listing.availability === "sold" ? "PAUZAT" : "PUBLICAT";
  const promotedImport = Boolean(config.promoteImported && status === "PUBLICAT");
  const promotionLevel = promotedImport ? safeText(config.promotionLevel || "partner_featured") : safeText(existing?.promotion_level || "");
  const promotionUntil = promotedImport ? safeText(config.promotionUntil || "2099-12-31") : (existing?.promotion_until || null);
  const metadata = sourceMetadata(config, { ...listing, partner_profile_id: profile.id }, {
    availability: listing.availability || "available",
    vehicle: listing.specs || {},
    source_partner_key: config.key,
    source_import_key: config.key
  });
  const payload = {
    company_id: companyId,
    emarqet_user_id: Number(profile.emarqet_user_id || 0),
    partner_profile_id: Number(profile.id),
    vertical_id: Number(vertical.id),
    listing_code: listingCode,
    title: listing.title,
    slug,
    owner_name: profile.display_name || listing.owner_name || config.sourceLabel,
    owner_email: profile.email || config.email,
    location: listing.location || publicLocation(profile, config),
    price_amount: listing.price_amount,
    price_currency: listing.price_currency || "EUR",
    status,
    quality_score: listing.quality_score || 72,
    ai_status: "IMPORT_AUTOMAT",
    metadata_json: safeJson(metadata),
    primary_image_url: listing.primary_image_url || "",
    image_urls_json: safeJson((listing.image_urls || []).filter(Boolean).slice(0, 12)),
    contact_phone: listing.contact_phone || profile.phone || config.phoneFallback || "",
    seller_type: "Firma",
    selected_plan_code: profile.selected_plan_code || "auto_business",
    stripe_checkout_status: "BUSINESS_IMPORT",
    checkout_token: "",
    promotion_level: promotionLevel,
    promotion_until: promotionUntil,
    notes: listingNotes(config, listing),
    created_by: ACTOR
  };

  const promotionUnchanged = !promotedImport
    || (safeText(existing?.promotion_level || "") === promotionLevel && safeText(existing?.promotion_until || "") === safeText(promotionUntil || ""));
  const unchanged = existing && existingSourceHash(existing) === listing.source_hash && safeText(existing.status) === status && promotionUnchanged;
  if (unchanged) return { action: "unchanged", id: existing.id, code: listingCode, title: listing.title };
  if (!commit) return { action: existing ? "would_update" : "would_insert", id: existing?.id || 0, code: listingCode, title: listing.title };

  if (existing) {
    db.prepare(`
      UPDATE emarqet_listings
      SET
        emarqet_user_id=@emarqet_user_id,
        partner_profile_id=@partner_profile_id,
        vertical_id=@vertical_id,
        title=@title,
        slug=@slug,
        owner_name=@owner_name,
        owner_email=@owner_email,
        location=@location,
        price_amount=@price_amount,
        price_currency=@price_currency,
        status=@status,
        quality_score=@quality_score,
        ai_status=@ai_status,
        metadata_json=@metadata_json,
        primary_image_url=@primary_image_url,
        image_urls_json=@image_urls_json,
        contact_phone=@contact_phone,
        seller_type=@seller_type,
        selected_plan_code=@selected_plan_code,
        stripe_checkout_status=@stripe_checkout_status,
        checkout_token=@checkout_token,
        promotion_level=@promotion_level,
        promotion_until=@promotion_until,
        notes=@notes,
        published_at=CASE WHEN @status='PUBLICAT' THEN COALESCE(published_at, date('now')) ELSE published_at END,
        updated_at=datetime('now')
      WHERE company_id=@company_id AND listing_code=@listing_code
    `).run(payload);
    return { action: "updated", id: existing.id, code: listingCode, title: listing.title };
  }

  const result = db.prepare(`
    INSERT INTO emarqet_listings
      (company_id, emarqet_user_id, partner_profile_id, vertical_id, listing_code, title, slug, owner_name, owner_email, location, price_amount, price_currency, status, quality_score, ai_status, metadata_json, primary_image_url, image_urls_json, contact_phone, seller_type, selected_plan_code, stripe_checkout_status, checkout_token, promotion_level, promotion_until, paid_at, published_at, notes, created_by)
    VALUES
      (@company_id, @emarqet_user_id, @partner_profile_id, @vertical_id, @listing_code, @title, @slug, @owner_name, @owner_email, @location, @price_amount, @price_currency, @status, @quality_score, @ai_status, @metadata_json, @primary_image_url, @image_urls_json, @contact_phone, @seller_type, @selected_plan_code, @stripe_checkout_status, @checkout_token, @promotion_level, @promotion_until, datetime('now'), CASE WHEN @status='PUBLICAT' THEN date('now') ELSE NULL END, @notes, @created_by)
  `).run(payload);
  return { action: "inserted", id: result.lastInsertRowid, code: listingCode, title: listing.title };
}

function pauseMissingImportedListings({ companyId, profile, config, activeCodes, commit }) {
  if (hasFlag("--skip-pause")) return [];
  const rows = db.prepare(`
    SELECT id, listing_code, title, metadata_json, status
    FROM emarqet_listings
    WHERE company_id=? AND partner_profile_id=? AND created_by=?
  `).all(companyId, profile.id, ACTOR);
  const missing = rows.filter((row) => !activeCodes.has(row.listing_code) && safeText(row.status).toUpperCase() === "PUBLICAT");
  if (!commit) return missing.map((row) => ({ id: row.id, code: row.listing_code, title: row.title, action: "would_pause" }));

  const update = db.prepare(`
    UPDATE emarqet_listings
    SET status='PAUZAT', metadata_json=?, notes=?, updated_at=datetime('now')
    WHERE id=?
  `);
  for (const row of missing) {
    const metadata = parseJson(row.metadata_json);
    metadata.availability = "missing_from_source";
    metadata.source = {
      ...(metadata.source || {}),
      partner_key: config.key,
      missing_from_source_at: new Date().toISOString()
    };
    const notes = `${safeText(row.notes)}\nPauzat automat: nu mai apare in sursa activa ${config.sourceLabel}.`.trim();
    update.run(safeJson(metadata), notes, row.id);
  }
  return missing.map((row) => ({ id: row.id, code: row.listing_code, title: row.title, action: "paused" }));
}

function dedupeListingsBySourceUrl(listings = []) {
  const byUrl = new Map();
  const duplicates = [];
  for (const listing of listings) {
    const key = safeText(listing.source_url).toLowerCase();
    if (!key) continue;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, listing);
      continue;
    }
    const existingModified = Date.parse(existing.source_last_modified || "") || 0;
    const currentModified = Date.parse(listing.source_last_modified || "") || 0;
    if (currentModified > existingModified) byUrl.set(key, listing);
    duplicates.push({
      source_url: listing.source_url,
      source_id: listing.source_id,
      reason: "duplicate_source_url"
    });
  }
  return { listings: [...byUrl.values()], duplicates };
}

function recordImport({ companyId, profile, vertical, config, total, results, skipped, errors, commit }) {
  if (!commit) return 0;
  const inserted = results.filter((item) => item.action === "inserted").length;
  const updated = results.filter((item) => item.action === "updated").length;
  const unchanged = results.filter((item) => item.action === "unchanged").length;
  const paused = results.filter((item) => item.action === "paused").length;
  const status = errors.length ? "CU_ERORI" : "PROCESAT";
  const report = {
    partner_key: config.key,
    source_url: config.sourceUrl,
    inserted,
    updated,
    unchanged,
    paused,
    skipped: skipped.slice(0, 80),
    errors: errors.slice(0, 40),
    sample: results.slice(0, 40)
  };
  const row = db.prepare(`
    INSERT INTO emarqet_partner_imports
      (company_id, partner_profile_id, emarqet_user_id, vertical_code, source_type, file_name, status, total_rows, imported_count, skipped_count, error_count, report_json, created_by)
    VALUES
      (?, ?, ?, ?, 'website_sync', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    profile.id,
    profile.emarqet_user_id,
    vertical.code,
    config.sourceLabel,
    status,
    total,
    inserted + updated + paused,
    skipped.length + unchanged,
    errors.length,
    safeJson(report),
    ACTOR
  );
  return Number(row.lastInsertRowid || 0);
}

async function loadAutoGeistListings(config) {
  const max = Number(argValue("--max-autogeist", process.env.EMARQET_AUTO_GEIST_MAX || "0"));
  const perPage = Number(process.env.EMARQET_AUTO_GEIST_PER_PAGE || 20);
  const listings = [];
  const skipped = [];
  const mediaIds = new Set();
  let page = 1;
  let totalPages = 1;

  do {
    const url = `https://autogeist.ro/wp-json/wp/v2/car?per_page=${perPage}&page=${page}`;
    const { json, response } = await fetchJson(url);
    totalPages = Number(response.headers.get("x-wp-totalpages") || totalPages || 1);
    for (const item of Array.isArray(json) ? json : []) {
      if (max && listings.length >= max) break;
      const acf = item.acf || {};
      if (acf.marcheaza_ca_vandut) {
        skipped.push({ source_id: item.id, title: stripTags(item.title?.rendered), reason: "sold" });
        continue;
      }
      const gallery = [item.featured_media, ...(Array.isArray(acf.galerie) ? acf.galerie : [])].map(Number).filter(Boolean);
      for (const id of gallery.slice(0, 8)) mediaIds.add(id);
      const title = stripTags(item.title?.rendered);
      const specs = {
        year: Number(acf.anul_fabricatiei || 0) || null,
        mileage: Number(acf.rulaj || 0) || null,
        fuel: safeText(acf.combustibil),
        transmission: safeText(acf.cutie_de_viteze),
        body_type: safeText(acf.caroserie),
        power: safeText(acf.putere),
        engine_capacity: safeText(acf.cilindree),
        vin: safeText(acf.vin_ss),
        color: safeText(acf.culoare),
        euro_norm: safeText(acf.norma_euro),
        origin_country: safeText(acf.tara_de_origine),
        stock_id: safeText(acf.id_stoc)
      };
      const sourceHash = hashValue(safeJson({
        modified: item.modified,
        title,
        price: acf.pret,
        reserved: acf.marcheaza_ca_rezervat,
        acf
      }));
      listings.push({
        source_id: safeText(item.id),
        source_url: absoluteUrl(item.link, config.websiteUrl),
        source_last_modified: safeText(item.modified),
        source_hash: sourceHash,
        title,
        description: stripTags(item.excerpt?.rendered || item.content?.rendered).slice(0, 1200),
        price_amount: parseNumber(acf.pret),
        price_currency: "EUR",
        location: "Galati, Galati",
        contact_phone: config.phoneFallback,
        availability: acf.marcheaza_ca_rezervat ? "reserved" : "available",
        specs,
        media_ids: gallery
      });
    }
    page += 1;
    await sleep();
  } while (page <= totalPages && (!max || listings.length < max));

  const mediaMap = await loadAutoGeistMediaMap([...mediaIds]);
  for (const listing of listings) {
    const images = (listing.media_ids || []).map((id) => mediaMap.get(Number(id))).filter(Boolean);
    listing.image_urls = [...new Set(images)].slice(0, 12);
    listing.primary_image_url = listing.image_urls[0] || "";
    delete listing.media_ids;
  }
  return { listings, skipped, partial: Boolean(max) };
}

async function loadAutoGeistMediaMap(ids = []) {
  const mediaMap = new Map();
  const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))];
  for (let index = 0; index < uniqueIds.length; index += 80) {
    const chunk = uniqueIds.slice(index, index + 80);
    if (!chunk.length) continue;
    const url = `https://autogeist.ro/wp-json/wp/v2/media?per_page=100&include=${chunk.join(",")}`;
    try {
      const { json } = await fetchJson(url);
      for (const item of Array.isArray(json) ? json : []) {
        if (item?.id && item?.source_url) mediaMap.set(Number(item.id), item.source_url);
      }
    } catch (error) {
      console.warn(`Nu am putut citi media Auto Geist: ${error.message}`);
    }
    await sleep();
  }
  return mediaMap;
}

async function loadSanAutoListings(config) {
  const pages = await discoverSanAutoStockPages();
  const urls = [];
  const seen = new Set();
  for (const pageUrl of pages) {
    const { body } = await fetchText(pageUrl);
    for (const url of extractSanAutoLinks(body)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    await sleep();
  }

  const max = Number(argValue("--max-san-details", process.env.EMARQET_SAN_AUTO_MAX_DETAILS || "0"));
  const selectedUrls = max ? urls.slice(0, max) : urls;
  const listings = [];
  const skipped = [];
  for (const url of selectedUrls) {
    try {
      const { body, response } = await fetchText(url);
      const listing = parseSanAutoDetail(body, response.url || url, config);
      if (!listing.title) {
        skipped.push({ url, reason: "missing_title" });
      } else {
        listings.push(listing);
      }
    } catch (error) {
      skipped.push({ url, reason: error.message });
    }
    await sleep();
  }
  if (max && urls.length > max) {
    skipped.push({ reason: "max_san_details_limit", total: urls.length, processed: max });
  }
  return { listings, skipped, partial: Boolean(max) };
}

async function discoverSanAutoStockPages() {
  const startUrl = "https://www.sanautoimport.ro/?masini=masini-stoc";
  const { body } = await fetchText(startUrl);
  const pageNumbers = [...body.matchAll(/href="([^"]*\/page\/(\d+)\/\?masini=masini-stoc[^"]*)"/g)]
    .map((match) => Number(match[2]))
    .filter(Boolean);
  const maxPage = Math.max(1, ...pageNumbers);
  const configuredMax = Number(process.env.EMARQET_SAN_AUTO_MAX_STOCK_PAGES || "10");
  const cappedMax = Math.min(maxPage, Math.max(1, configuredMax));
  const pages = [startUrl];
  for (let page = 2; page <= cappedMax; page += 1) {
    pages.push(`https://www.sanautoimport.ro/page/${page}/?masini=masini-stoc`);
  }
  return pages;
}

function extractSanAutoLinks(html = "") {
  const urls = new Set();
  const regex = /https:\/\/www\.sanautoimport\.ro\/autoturisme\/[^"'<>\s)]+/g;
  for (const match of html.matchAll(regex)) {
    const url = absoluteUrl(match[0], "https://www.sanautoimport.ro/");
    if (!url.includes("/attachment/")) urls.add(url);
  }
  return [...urls];
}

function metaContent(html = "", property = "") {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  return decodeHtml(html.match(regex)?.[1] || "");
}

function parseDetailTable(html = "") {
  const fields = {};
  const regex = /<td class="t-label">([\s\S]*?)<\/td>\s*<td class="t-value h6">([\s\S]*?)<\/td>/g;
  for (const match of html.matchAll(regex)) {
    const key = stripTags(match[1]).toLowerCase();
    const value = stripTags(match[2]);
    if (key) fields[key] = value;
  }
  return fields;
}

function extractImagesFromHtml(html = "", title = "", primary = "", baseUrl = "https://www.sanautoimport.ro/") {
  const images = new Set();
  const addImage = (value = "") => {
    const src = absoluteUrl(value, baseUrl);
    if (!src.includes("/wp-content/uploads/")) return;
    if (/logo|favicon|cropped|placeholder/i.test(src)) return;
    images.add(src.replace(/-\d+x\d+(?=\.[a-z]{3,4}$)/i, ""));
  };
  if (primary && /^https?:\/\//i.test(primary)) addImage(primary);
  const anchorRegex = /<a\b[^>]*>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const tag = match[0];
    if (!/\bstm_light_gallery\b|lightgallery|gallery/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
    addImage(href);
    if (images.size >= 12) break;
  }
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  for (const match of html.matchAll(imgRegex)) {
    const tag = match[0];
    const src = absoluteUrl(match[1], baseUrl);
    if (!src.includes("/wp-content/uploads/")) continue;
    if (/logo|favicon|cropped|placeholder/i.test(src)) continue;
    const alt = decodeHtml(tag.match(/alt="([^"]*)"/i)?.[1] || "");
    if (title && alt && !alt.toLowerCase().includes(title.toLowerCase().slice(0, 18))) continue;
    images.add(src.replace(/-\d+x\d+(?=\.[a-z]{3,4}$)/i, ""));
    if (images.size >= 12) break;
  }
  return [...images];
}

function parseSanAutoDetail(html = "", url = "", config = {}) {
  const titleRaw = stripTags(html.match(/<h1[^>]*class="[^"]*stm_listing_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    || metaContent(html, "og:title").replace(/\s*\*\s*SAN AUTO\s*$/i, "");
  const title = decodeHtml(titleRaw).replace(/\s*\*\s*SAN AUTO\s*$/i, "").trim();
  const table = parseDetailTable(html);
  const vinPrice = html.match(/data-cg-vin="([^"]*)"\s+data-cg-price="([^"]*)"/i);
  const price = parseNumber(vinPrice?.[2]) || parseNumber(html.match(/<div[^>]+class="[^"]*price[^"]*"[\s\S]*?(\d[\d\s.]*\s*€)/i)?.[1]);
  const primary = metaContent(html, "og:image");
  const code = stripTags(html.match(/<div class="stock-num[^"]*"[^>]*>[\s\S]*?<span>cod #\s*<\/span>([\s\S]*?)<\/div>/i)?.[1] || "");
  const textBeforeTable = stripTags(html.slice(0, html.indexOf("<table>") > 0 ? html.indexOf("<table>") : html.length));
  const availability = /\bSOLD\b|\bVANDUT\b/i.test(textBeforeTable) ? "sold" : (/\bREZERVAT\b/i.test(textBeforeTable) ? "reserved" : "available");
  const specs = {
    year: parseNumber(table["an fabricatie"] || table["prima inmatriculare"]),
    mileage: parseNumber(table["kilometri"]),
    fuel: table["carburant"] || "",
    transmission: table["cutie de viteze"] || "",
    body_type: table["caroserie"] || "",
    power: table["putere"] || "",
    engine_capacity: table["capacitate cilindrica"] || "",
    vin: safeText(vinPrice?.[1] || table["vin"]),
    color: table["culoare"] || "",
    euro_norm: table["norma poluare"] || "",
    origin_country: table["tara de origine"] || "",
    seats: table["scaune"] || "",
    stock_code: code
  };
  const description = stripTags(html.match(/<div[^>]+class="[^"]*wpb_wrapper[^"]*"[^>]*>([\s\S]{0,6000}?)<table>/i)?.[1] || "").slice(0, 1200);
  const images = extractImagesFromHtml(html, title, primary, config.websiteUrl);
  const sourceLastModified = metaContent(html, "article:modified_time");
  const sourceHash = hashValue(safeJson({ title, price, table, primary, code, availability, sourceLastModified }));
  return {
    source_id: code || slugify(url),
    source_url: absoluteUrl(url, config.websiteUrl),
    source_last_modified: sourceLastModified,
    source_hash: sourceHash,
    title,
    description,
    price_amount: price,
    price_currency: "EUR",
    location: "Iasi, Iasi",
    contact_phone: config.phoneFallback,
    availability,
    specs,
    primary_image_url: images[0] || primary || "",
    image_urls: images
  };
}

async function loadSebalAutoListings(config) {
  const urls = await discoverSebalListingUrls(config);
  const max = Number(argValue("--max-sebal-details", process.env.EMARQET_SEBAL_AUTO_MAX_DETAILS || "0"));
  const selectedUrls = max ? urls.slice(0, max) : urls;
  const listings = [];
  const skipped = [];
  for (const url of selectedUrls) {
    try {
      const { body, response } = await fetchText(url);
      const listing = parseSebalAutoDetail(body, response.url || url, config);
      if (!listing.title) {
        skipped.push({ url, reason: "missing_title" });
      } else {
        listings.push(listing);
      }
    } catch (error) {
      skipped.push({ url, reason: error.message });
    }
    await sleep();
  }
  if (max && urls.length > max) {
    skipped.push({ reason: "max_sebal_details_limit", total: urls.length, processed: max });
  }
  return { listings, skipped, partial: Boolean(max) };
}

async function discoverSebalListingUrls(config = {}) {
  const { body } = await fetchText(config.sourceUrl);
  const urls = [];
  const seen = new Set();
  for (const match of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = absoluteUrl(decodeHtml(match[1]), config.websiteUrl);
    if (!/\/listings\/[^/]+\/?$/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function fallbackAutoDescription(title = "", specs = {}, config = {}) {
  const details = [
    specs.make,
    specs.model,
    specs.year ? `an ${specs.year}` : "",
    specs.mileage ? `${specs.mileage} km` : "",
    specs.fuel,
    specs.transmission,
    specs.engine_capacity ? `motorizare ${specs.engine_capacity}` : "",
    specs.body_type,
    specs.color
  ].map(safeText).filter(Boolean);
  const firstLine = details.length ? `${title}: ${details.join(", ")}.` : title;
  return [
    firstLine,
    `Anunt importat automat de la partenerul aprobat ${config.displayName || config.sourceLabel}.`
  ].filter(Boolean).join("\n");
}

function parseSebalAutoDetail(html = "", url = "", config = {}) {
  const titleRaw = stripTags(html.match(/<h2[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "")
    || stripTags(html.match(/<h1[^>]*class="[^"]*stm_listing_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    || metaContent(html, "og:title").replace(/\s*[-|–]\s*SEBAL Automobile\s*$/i, "");
  const title = decodeHtml(titleRaw).replace(/\s*[-|–]\s*SEBAL Automobile\s*$/i, "").trim();
  const table = parseDetailTable(html);
  const price = parseNumber(html.match(/<div[^>]+class="[^"]*single-car-prices[^"]*"[\s\S]*?(\d[\d\s.]*\s*€)/i)?.[1])
    || parseNumber(html.match(/<span[^>]+class="[^"]*\bh3\b[^"]*"[^>]*>\s*€?\s*([\d\s.]+)\s*<\/span>/i)?.[1]);
  const primary = metaContent(html, "og:image");
  const textBeforeGallery = stripTags(html.slice(0, html.indexOf("stm-gallery-actions") > 0 ? html.indexOf("stm-gallery-actions") : html.length));
  const availability = /\bSOLD\b|\bVANDUT\b/i.test(textBeforeGallery) ? "sold" : (/\bREZERVAT\b/i.test(textBeforeGallery) ? "reserved" : "available");
  const specs = {
    make: table["marca"] || "",
    model: table["model"] || "",
    condition: table["conditie"] || "",
    year: parseNumber(table["an"] || table["an fabricatie"] || table["prima inmatriculare"]),
    mileage: parseNumber(table["kilometraj"] || table["kilometri"]),
    fuel: table["combustibil"] || table["carburant"] || "",
    transmission: table["transmisie"] || table["cutie de viteze"] || "",
    body_type: table["caroserie"] || "",
    power: table["putere"] || "",
    engine_capacity: table["motorizare"] || table["capacitate cilindrica"] || "",
    vin: table["vin"] || "",
    color: table["culoare"] || "",
    euro_norm: table["norma poluare"] || "",
    origin_country: table["tara de origine"] || ""
  };
  const contentDescription = stripTags(html.match(/<div[^>]+class="[^"]*stm_single_car_content[^"]*"[^>]*>[\s\S]*?<div[^>]+class="[^"]*wpb_wrapper[^"]*"[^>]*>([\s\S]{0,6000}?)<\/div>/i)?.[1] || "").slice(0, 1200);
  const description = contentDescription || fallbackAutoDescription(title, specs, config);
  const images = extractImagesFromHtml(html, title, primary, config.websiteUrl);
  const sourceLastModified = metaContent(html, "article:modified_time");
  const sourceHash = hashValue(safeJson({ title, price, table, primary, availability, images: images.slice(0, 4), sourceLastModified }));
  return {
    source_id: slugify(url),
    source_url: absoluteUrl(url, config.websiteUrl),
    source_last_modified: sourceLastModified,
    source_hash: sourceHash,
    title,
    description,
    price_amount: price,
    price_currency: "EUR",
    location: config.locationFallback,
    contact_phone: config.phoneFallback,
    availability,
    specs,
    primary_image_url: images[0] || primary || "",
    image_urls: images
  };
}

async function syncPartner({ companyId, vertical, config, commit }) {
  const profile = loadOrCreatePartner(companyId, config, commit);
  if (!profile) {
    return {
      partner: config.key,
      ok: false,
      errors: [`Nu exista profil partener pentru ${config.email}`],
      results: [],
      skipped: []
    };
  }
  const errors = [];
  const skipped = [];
  const results = [];
  let listings = [];
  let partial = false;
  try {
    const loaded = await config.loader(config);
    listings = loaded.listings || [];
    partial = Boolean(loaded.partial);
    skipped.push(...(loaded.skipped || []));
  } catch (error) {
    errors.push(error.message);
  }
  const deduped = dedupeListingsBySourceUrl(listings);
  listings = deduped.listings;
  skipped.push(...deduped.duplicates);

  const activeCodes = new Set();
  if (listings.length) {
    const run = () => {
      for (const listing of listings) {
        if (!safeText(listing.title) || !safeText(listing.source_url)) {
          skipped.push({ source_url: listing.source_url, title: listing.title, reason: "missing_title_or_url" });
          continue;
        }
        const result = upsertListing({ companyId, vertical, profile, config, listing, commit });
        activeCodes.add(result.code);
        results.push(result);
      }
      if (!partial && !errors.length) {
        results.push(...pauseMissingImportedListings({ companyId, profile, config, activeCodes, commit }));
      }
      return true;
    };
    if (commit) db.transaction(run)();
    else run();
  }

  const importId = recordImport({
    companyId,
    profile,
    vertical,
    config,
    total: listings.length,
    results,
    skipped,
    errors,
    commit
  });
  const facebookPromotion = prepareFacebookPromotionDrafts({ companyId, profile, config, commit });
  return { partner: config.key, ok: !errors.length, importId, total: listings.length, results, skipped, errors, facebookPromotion };
}

async function main() {
  migrate();
  const commit = hasFlag("--commit");
  const onlyPartner = safeText(argValue("--partner", ""));
  const companyId = companyIdFromDb();
  const vertical = loadVertical(companyId);
  if (!companyId) throw new Error("Nu am gasit companie pentru import.");
  if (!vertical) throw new Error("Nu am gasit verticala auto in e-Marqet.");

  const selected = PARTNERS.filter((partner) => !onlyPartner || partner.key === onlyPartner);
  if (!selected.length) throw new Error(`Partener necunoscut: ${onlyPartner}`);

  const summaries = [];
  for (const config of selected) {
    const summary = await syncPartner({ companyId, vertical, config, commit });
    summaries.push(summary);
    const counts = summary.results.reduce((acc, item) => {
      acc[item.action] = (acc[item.action] || 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({
      mode: commit ? "commit" : "dry-run",
      partner: summary.partner,
      total: summary.total,
      counts,
      facebookPromotion: summary.facebookPromotion || undefined,
      skipped: summary.skipped.length,
      errors: summary.errors
    }, null, 2));
  }

  const hasErrors = summaries.some((summary) => summary.errors.length);
  if (hasErrors) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
