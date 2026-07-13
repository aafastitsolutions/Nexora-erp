#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const CAMPAIGN_KEY = "trevoro_photo_property_launch_2026_07_03";
const DEFAULT_LIMIT = 4;
const OUT_DIR = path.join(process.cwd(), "utile", "rapoarte", "social");

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
  return String(value || "").trim();
}

function slugText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicBaseUrl() {
  return safeText(process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "https://www.trevoro.ro").replace(/\/+$/, "");
}

function publicAssetUrl(value = "") {
  const raw = safeText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${publicBaseUrl()}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function publicPropertyUrl(property = {}) {
  const slug = `${Number(property.id || 0)}-${slugText(`${property.name || "proprietate"}-${property.city || "romania"}`)}`;
  const url = new URL(`/properties/${slug}`, publicBaseUrl());
  url.searchParams.set("utm_source", "facebook");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", CAMPAIGN_KEY);
  url.searchParams.set("utm_content", `property_${Number(property.id || 0)}`);
  return url.toString();
}

function locationLine(property = {}) {
  return [property.city, property.county, property.country || "Romania"].map(safeText).filter(Boolean).join(", ");
}

function propertyTypeLabel(property = {}) {
  return safeText(property.property_type) || "cazare";
}

function captionFor(property = {}) {
  const name = safeText(property.name) || "o proprietate Trevoro";
  const type = propertyTypeLabel(property);
  const location = locationLine(property);
  const url = publicPropertyUrl(property);
  const price = Number(property.price_per_night || 0);
  const priceLine = price > 0
    ? `Tarif orientativ: de la ${Math.round(price)} ${safeText(property.price_currency || "RON")}/noapte.`
    : "Tarifele finale se confirma direct cu proprietarul.";
  return [
    `Descopera ${name}, ${type} in ${location}.`,
    "",
    "Am pregatit o galerie cu poze reale si pagina de prezentare pe Trevoro, pentru cereri directe catre proprietar.",
    priceLine,
    "",
    `Rezerva acum / Book now: ${url}`,
    "",
    "Trevoro are 0% comision pe rezervari. Plata si conditiile se stabilesc direct cu proprietarul.",
    "",
    "#Trevoro #CazareRomania #VacanteRomania #TurismRomanesc #BookNow"
  ].join("\n");
}

function loadTargets(limit = DEFAULT_LIMIT) {
  return db.prepare(`
    WITH photo_counts AS (
      SELECT property_id, COUNT(*) AS photo_count
      FROM travel_property_photos
      WHERE COALESCE(public_url, file_path, '') <> ''
      GROUP BY property_id
    )
    SELECT p.*, pc.photo_count
    FROM travel_properties p
    JOIN photo_counts pc ON pc.property_id=p.id AND pc.photo_count>0
    WHERE p.status='activ'
      AND lower(trim(COALESCE(p.partner_plan, '')))='founding_partner'
      AND NOT EXISTS (
        SELECT 1
        FROM travel_social_posts sp
        WHERE sp.company_id=p.company_id
          AND sp.property_id=p.id
          AND sp.platform='facebook'
          AND COALESCE(sp.media_url, '') LIKE '%' || ? || '%'
      )
    ORDER BY
      CASE WHEN COALESCE(p.price_per_night, 0)>0 THEN 0 ELSE 1 END ASC,
      pc.photo_count DESC,
      p.updated_at DESC,
      p.id DESC
    LIMIT ?
  `).all(CAMPAIGN_KEY, Number(limit || DEFAULT_LIMIT));
}

function loadPhotos(companyId, propertyId, limit = 5) {
  return db.prepare(`
    SELECT COALESCE(public_url, file_path) AS url
    FROM travel_property_photos
    WHERE company_id=? AND property_id=?
      AND COALESCE(public_url, file_path, '') <> ''
    ORDER BY is_cover DESC, sort_order ASC, id ASC
    LIMIT ?
  `).all(Number(companyId || 0), Number(propertyId || 0), Number(limit || 5))
    .map((row) => publicAssetUrl(row.url))
    .filter((url) => /^https?:\/\//i.test(url));
}

function facebookAccount(companyId) {
  return db.prepare(`
    SELECT *
    FROM travel_social_accounts
    WHERE company_id=? AND platform='facebook'
    LIMIT 1
  `).get(Number(companyId || 0)) || null;
}

function insertOrUpdatePost(companyId, property, photos) {
  const media = JSON.stringify({
    campaign: CAMPAIGN_KEY,
    format: "property_photo_gallery",
    property_id: Number(property.id || 0),
    public_url: publicPropertyUrl(property),
    items: photos.map((url, index) => ({ url, image_url: url, sort_order: index + 1 }))
  });
  const caption = captionFor(property);
  const existing = db.prepare(`
    SELECT id
    FROM travel_social_posts
    WHERE company_id=? AND property_id=? AND platform='facebook' AND COALESCE(media_url, '') LIKE '%' || ? || '%'
    LIMIT 1
  `).get(companyId, property.id, CAMPAIGN_KEY);
  if (existing?.id) {
    db.prepare(`
      UPDATE travel_social_posts
      SET content_type='facebook_gallery',
          caption=?,
          hashtags=?,
          media_url=?,
          status='ready',
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(caption, "#Trevoro #CazareRomania #VacanteRomania #BookNow", media, existing.id, companyId);
    return { id: Number(existing.id), created: false };
  }
  const result = db.prepare(`
    INSERT INTO travel_social_posts (
      company_id, property_id, platform, content_type, caption, hashtags, media_url, status, updated_at
    )
    VALUES (?, ?, 'facebook', 'facebook_gallery', ?, ?, ?, 'ready', datetime('now'))
  `).run(companyId, property.id, caption, "#Trevoro #CazareRomania #VacanteRomania #BookNow", media);
  return { id: Number(result.lastInsertRowid || 0), created: true };
}

function queuePost(companyId, postId, account, index = 0) {
  const canQueue = account?.status === "active" && safeText(account.access_token) && safeText(account.page_id);
  const status = canQueue ? "queued" : "manual_required";
  const scheduledAt = db.prepare(`SELECT datetime('now', ?) AS scheduled_at`).get(`+${index * 90} minutes`)?.scheduled_at || "";
  const error = canQueue ? "" : "Page Access Token lipsa in Nexora. Postarea este pregatita, dar necesita conectarea Facebook.";
  const existing = db.prepare(`
    SELECT id
    FROM travel_social_publish_jobs
    WHERE company_id=? AND social_post_id=? AND platform='facebook' AND status IN ('queued', 'manual_required')
    LIMIT 1
  `).get(companyId, postId);
  if (existing?.id) {
    db.prepare(`
      UPDATE travel_social_publish_jobs
      SET account_id=?,
          status=?,
          scheduled_at=?,
          error=?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(account?.id || null, status, scheduledAt, error, existing.id, companyId);
    return { id: Number(existing.id), status, created: false, scheduled_at: scheduledAt, error };
  }
  const result = db.prepare(`
    INSERT INTO travel_social_publish_jobs (
      company_id, social_post_id, account_id, platform, status, scheduled_at, error, updated_at
    )
    VALUES (?, ?, ?, 'facebook', ?, ?, ?, datetime('now'))
  `).run(companyId, postId, account?.id || null, status, scheduledAt, error);
  return { id: Number(result.lastInsertRowid || 0), status, created: true, scheduled_at: scheduledAt, error };
}

function writeReport(report) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filePath = path.join(OUT_DIR, `trevoro-facebook-photo-property-posts-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify({ ...report, report_path: filePath }, null, 2)}\n`);
  return filePath;
}

migrate();
const limit = Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT);
const dryRun = hasFlag("--dry-run");
const shouldQueue = hasFlag("--queue");
const company = db.prepare(`SELECT id, name FROM companies ORDER BY CASE WHEN id=1 THEN 0 ELSE 1 END, id ASC LIMIT 1`).get();
if (!company?.id) throw new Error("Nu exista companie Nexora pentru Travel.");
const account = facebookAccount(company.id);
const targets = loadTargets(limit);
const rows = [];

if (!dryRun) {
  const tx = db.transaction(() => {
    for (const [index, property] of targets.entries()) {
      const photos = loadPhotos(company.id, property.id, 5);
      if (!photos.length) continue;
      const post = insertOrUpdatePost(company.id, property, photos);
      const queue = shouldQueue ? queuePost(company.id, post.id, account, index) : null;
      rows.push({
        property_id: property.id,
        property_name: property.name,
        city: property.city,
        photo_count: photos.length,
        price_per_night: property.price_per_night,
        post_id: post.id,
        post_created: post.created,
        queue
      });
    }
  });
  tx();
} else {
  for (const property of targets) {
    const photos = loadPhotos(company.id, property.id, 5);
    rows.push({
      property_id: property.id,
      property_name: property.name,
      city: property.city,
      photo_count: photos.length,
      price_per_night: property.price_per_night,
      caption_preview: captionFor(property).split("\n").slice(0, 8),
      first_photo: photos[0] || ""
    });
  }
}

const report = {
  ok: true,
  dry_run: dryRun,
  queue_requested: shouldQueue,
  campaign: CAMPAIGN_KEY,
  company_id: company.id,
  company_name: company.name,
  facebook_account: account ? {
    id: account.id,
    status: account.status,
    page_id: account.page_id,
    has_token: Boolean(safeText(account.access_token))
  } : null,
  selected: targets.length,
  rows
};
const reportPath = writeReport(report);
console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2));
db.close();
