#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { db } from "../db.js";
import {
  ensureEmarqetSocialSchema,
  seedEmarqetSocialDefaults
} from "../lib/emarqet-social-distribution.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const STAMP = "2026-07-07";
const CAMPAIGN = "emarqet_launch_pack";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "public", "uploads", "emarqet", "social", `launch-${STAMP}`);
const PUBLIC_PREFIX = `/uploads/emarqet/social/launch-${STAMP}`;
const REPORT_DIR = path.join(PROJECT_ROOT, "utile", "social-media", "emarqet");
const BRAND_LOGO = path.join(PROJECT_ROOT, "public", "brand", "emarqet-logo.svg");

function safeText(value = "") {
  return String(value ?? "").trim();
}

function publicUrl(pathname = "/") {
  const base = safeText(process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");
  return `${base}${String(pathname || "/").startsWith("/") ? pathname : `/${pathname}`}`;
}

function campaignUrl(pathname = "/", medium = "page", content = "") {
  const url = new URL(publicUrl(pathname));
  url.searchParams.set("utm_source", "facebook");
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", CAMPAIGN);
  if (content) url.searchParams.set("utm_content", content);
  return url.toString();
}

function companyIdFromDb() {
  const row = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()
    || db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(row?.id || 0);
}

const posts = [
  {
    id: "01",
    file: "emarqet-launch-01-publica-gratuit.png",
    themeFile: "theme-01-marketplace-categorii.png",
    eyebrow: "e-Marqet",
    title: "Publica gratuit primul tau anunt",
    subtitle: "Auto, imobiliare, servicii si produse locale intr-un singur loc.",
    cta: "e-marqet.com/publica",
    accent: "#0284c7",
    secondary: "#16a34a",
    pathname: "/publica",
    pageCaption: [
      "Am lansat e-Marqet, o platforma romaneasca de anunturi locale.",
      "",
      "Poti publica gratuit primul anunt pentru auto, imobiliare, servicii sau produse.",
      "",
      "Intra aici si pune primul anunt:",
      campaignUrl("/publica", "page", "publica_gratuit")
    ].join("\n"),
    groupCaption: [
      "Salut! Daca este permis in grup, lasam aici o platforma romaneasca noua de anunturi locale: e-Marqet.",
      "",
      "Se pot publica anunturi pentru masini, imobiliare, servicii si produse. Primul pas este gratuit.",
      "",
      campaignUrl("/publica", "manual_group", "publica_gratuit")
    ].join("\n")
  },
  {
    id: "02",
    file: "emarqet-launch-02-da-l-mai-departe.png",
    themeFile: "theme-02-distribuire-anunt.png",
    eyebrow: "Campanie referral",
    title: "Distribuie anuntul si castiga vizibilitate",
    subtitle: "3 clickuri pe linkul tau pot activa promovare gratuita 7 zile.",
    cta: "Publica, distribuie, creste vizibilitatea",
    accent: "#16a34a",
    secondary: "#f59e0b",
    pathname: "/cont",
    pageCaption: [
      "Campanie noua pe e-Marqet: Pune-l pe e-Marqet. Da-l mai departe.",
      "",
      "Publici un anunt, il distribui pe Facebook, iar la 3 clickuri unice primesti promovare gratuita 7 zile.",
      "",
      campaignUrl("/cont", "page", "referral")
    ].join("\n"),
    groupCaption: [
      "Pentru cei care vand ceva local: pe e-Marqet poti publica anuntul si primesti link de distribuit.",
      "",
      "La 3 clickuri unice pe link, anuntul primeste promovare gratuita 7 zile.",
      "",
      campaignUrl("/cont", "manual_group", "referral")
    ].join("\n")
  },
  {
    id: "03",
    file: "emarqet-launch-03-auto-imobiliare.png",
    themeFile: "theme-03-auto-imobiliare-servicii.png",
    eyebrow: "Anunturi locale",
    title: "Vinzi masina, casa sau un serviciu?",
    subtitle: "Adauga anuntul pe e-Marqet si trimite linkul direct celor interesati.",
    cta: "Auto · Imobiliare · Servicii",
    accent: "#0f766e",
    secondary: "#0284c7",
    pathname: "/anunturi",
    pageCaption: [
      "Ai o masina, o proprietate sau un serviciu de promovat?",
      "",
      "Pune anuntul pe e-Marqet si primesti o pagina publica simpla, cu link usor de distribuit.",
      "",
      campaignUrl("/anunturi", "page", "auto_imobiliare_servicii")
    ].join("\n"),
    groupCaption: [
      "Daca aveti anunturi auto, imobiliare sau servicii locale, e-Marqet poate fi un canal in plus pentru vizibilitate.",
      "",
      "Publicarea incepe simplu, cu anunt si link public.",
      "",
      campaignUrl("/anunturi", "manual_group", "auto_imobiliare_servicii")
    ].join("\n")
  },
  {
    id: "04",
    file: "emarqet-launch-04-firme-parteneri.png",
    themeFile: "theme-04-firme-parteneri.png",
    eyebrow: "Pentru firme",
    title: "Profil business pentru anunturi recurente",
    subtitle: "Dealeri auto, agentii imobiliare si servicii locale pot publica organizat.",
    cta: "Profil partener + import anunturi",
    accent: "#7c3aed",
    secondary: "#0284c7",
    pathname: "/parteneri",
    pageCaption: [
      "Pentru dealeri auto, agentii imobiliare si firme locale: e-Marqet are profil business si flux de import anunturi.",
      "",
      "Este util cand ai stoc, proprietati sau servicii de promovat constant.",
      "",
      campaignUrl("/parteneri", "page", "business_parteneri")
    ].join("\n"),
    groupCaption: [
      "Pentru firme care publica des anunturi: e-Marqet poate pregati profil business si import de anunturi.",
      "",
      "Potrivit pentru dealeri auto, agentii imobiliare si servicii locale.",
      "",
      campaignUrl("/parteneri", "manual_group", "business_parteneri")
    ].join("\n")
  },
  {
    id: "05",
    file: "emarqet-launch-05-marketplace-local.png",
    themeFile: "theme-05-marketplace-local.png",
    eyebrow: "Marketplace local",
    title: "Un canal nou pentru anunturile tale",
    subtitle: "Pagina curata, contact direct si distribuire usoara pe Facebook.",
    cta: "Cauta sau publica pe e-marqet.com",
    accent: "#ea580c",
    secondary: "#0f766e",
    pathname: "/",
    pageCaption: [
      "e-Marqet este un canal nou pentru anunturi locale, construit sa fie simplu de folosit si usor de distribuit.",
      "",
      "Publici anuntul, primesti link si il poti trimite mai departe pe Facebook.",
      "",
      campaignUrl("/", "page", "marketplace_local")
    ].join("\n"),
    groupCaption: [
      "Lasam aici o alternativa romaneasca pentru anunturi locale: e-Marqet.",
      "",
      "Este util pentru cei care vor un link public pentru anunt si apoi il distribuie unde este permis.",
      "",
      campaignUrl("/", "manual_group", "marketplace_local")
    ].join("\n")
  }
];

function logoDataUrl() {
  if (!fs.existsSync(BRAND_LOGO)) return "";
  const raw = fs.readFileSync(BRAND_LOGO, "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(raw).toString("base64")}`;
}

function themeUrl(post = {}) {
  if (!post.themeFile) return "";
  const filePath = path.join(OUTPUT_DIR, "themes", post.themeFile);
  if (!fs.existsSync(filePath)) return "";
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function cardHtml(post = {}) {
  const logo = logoDataUrl();
  const theme = themeUrl(post);
  const categoryChips = ["Telefoane", "Masini", "Joburi", "Electrocasnice", "Imobiliare", "Servicii"];
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1200px;
      height: 630px;
      font-family: Inter, Arial, sans-serif;
      background: #f6fbff;
      color: #0f172a;
    }
    .card {
      position: relative;
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background: linear-gradient(135deg, #ffffff 0%, #f3fbff 54%, #e8f7ff 100%);
      border: 1px solid #d7edf9;
    }
    .theme {
      position: absolute;
      inset: 0;
      z-index: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .veil {
      position: absolute;
      inset: 0;
      z-index: 1;
      background:
        linear-gradient(90deg, rgba(255,255,255,.98) 0%, rgba(255,255,255,.95) 38%, rgba(255,255,255,.68) 56%, rgba(255,255,255,.08) 100%),
        radial-gradient(circle at 14% 80%, ${post.accent}18 0, transparent 240px);
    }
    .card > :not(.theme):not(.veil) {
      z-index: 2;
    }
    .bar {
      position: absolute;
      left: 0;
      top: 0;
      width: 26px;
      height: 630px;
      background: ${post.accent};
    }
    .logo {
      position: absolute;
      left: 76px;
      top: 46px;
      width: 270px;
      height: 86px;
      object-fit: contain;
    }
    .eyebrow {
      position: absolute;
      left: 78px;
      top: 148px;
      display: inline-flex;
      min-height: 42px;
      align-items: center;
      padding: 0 20px;
      border-radius: 999px;
      background: #ffffff;
      border: 1px solid #bae6fd;
      color: ${post.accent};
      font-size: 24px;
      font-weight: 900;
    }
    h1 {
      position: absolute;
      left: 76px;
      top: 198px;
      width: 720px;
      margin: 0;
      font-size: 62px;
      line-height: 1.02;
      letter-spacing: 0;
      color: #0f172a;
      text-shadow: 0 2px 12px rgba(255,255,255,.66);
    }
    .subtitle {
      position: absolute;
      left: 80px;
      top: 352px;
      width: 650px;
      font-size: 29px;
      line-height: 1.22;
      font-weight: 700;
      color: #334155;
      text-shadow: 0 2px 12px rgba(255,255,255,.7);
    }
    .chips {
      position: absolute;
      left: 78px;
      top: 438px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      width: 660px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 0 13px;
      border-radius: 999px;
      background: rgba(255,255,255,.88);
      border: 1px solid #bae6fd;
      color: #075985;
      font-size: 16px;
      font-weight: 900;
      box-shadow: 0 8px 22px rgba(2, 132, 199, .08);
    }
    .cta {
      position: absolute;
      left: 78px;
      bottom: 38px;
      min-height: 56px;
      display: inline-flex;
      align-items: center;
      padding: 0 26px;
      border-radius: 8px;
      background: ${post.accent};
      color: #ffffff;
      font-size: 26px;
      font-weight: 900;
      box-shadow: 0 18px 42px rgba(2, 132, 199, .25);
    }
    .mini {
      position: absolute;
      right: 70px;
      top: 46px;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.82);
      border: 1px solid rgba(186,230,253,.9);
      color: #075985;
      font-size: 22px;
      font-weight: 900;
      box-shadow: 0 10px 26px rgba(2, 132, 199, .08);
    }
  </style>
</head>
<body>
  <main class="card">
    ${theme ? `<img class="theme" src="${theme}" alt="">` : ""}
    <div class="veil"></div>
    <div class="bar"></div>
    ${logo ? `<img class="logo" src="${logo}" alt="e-Marqet">` : ""}
    <div class="eyebrow">${post.eyebrow}</div>
    <h1>${post.title}</h1>
    <div class="subtitle">${post.subtitle}</div>
    <div class="chips">
      ${categoryChips.map((chip) => `<div class="chip">${chip}</div>`).join("")}
    </div>
    <div class="cta">${post.cta}</div>
    <div class="mini">e-marqet.com</div>
  </main>
</body>
</html>`;
}

async function renderAssets() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const post of posts) {
    await page.setContent(cardHtml(post), { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUTPUT_DIR, post.file), type: "png" });
  }
  await browser.close();
}

function ensureManualGroupTarget(db, companyId) {
  seedEmarqetSocialDefaults(db, companyId);
  db.prepare(`
    INSERT INTO emarqet_social_targets (
      company_id, platform, target_type, name, url, category, language, location,
      members_count, join_status, rules_status, promotion_allowed, marketplace_allowed,
      posting_mode, frequency_limit_per_week, notes, updated_at
    )
    VALUES (
      ?, 'facebook', 'group', 'Grupuri Facebook manual - campanie e-Marqet',
      'https://www.facebook.com/groups/feed/', 'launch', 'ro', 'Romania',
      0, 'joined', 'permis', 1, 0, 'manual', 1,
      'Target generic pentru postari manuale in grupuri unde regulile permit promovarea.',
      datetime('now')
    )
    ON CONFLICT(company_id, platform, target_type, name) DO UPDATE SET
      url=excluded.url,
      category=excluded.category,
      join_status='joined',
      rules_status='permis',
      promotion_allowed=1,
      posting_mode='manual',
      notes=excluded.notes,
      updated_at=datetime('now')
  `).run(companyId);
  return db.prepare(`
    SELECT *
    FROM emarqet_social_targets
    WHERE company_id=? AND platform='facebook' AND target_type='group'
      AND name='Grupuri Facebook manual - campanie e-Marqet'
    LIMIT 1
  `).get(companyId);
}

function pageTarget(db, companyId) {
  seedEmarqetSocialDefaults(db, companyId);
  return db.prepare(`
    SELECT *
    FROM emarqet_social_targets
    WHERE company_id=? AND platform='facebook' AND target_type='page'
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId);
}

function upsertPost(db, companyId, target, post, mode) {
  const isGroup = mode === "group";
  const publicImage = `${PUBLIC_PREFIX}/${post.file}`;
  const link = campaignUrl(post.pathname, isGroup ? "manual_group" : "page", `${post.id}_${mode}`);
  const caption = isGroup ? post.groupCaption : post.pageCaption;
  const hashtags = isGroup
    ? "#eMarqet #AnunturiLocale"
    : "#eMarqet #AnunturiLocale #MarketplaceRomanesc";
  const contentType = isGroup ? "launch_group_manual" : "launch_page";
  const existing = db.prepare(`
    SELECT id
    FROM emarqet_social_posts
    WHERE company_id=? AND platform='facebook' AND target_type=? AND content_type=? AND link_url=?
    LIMIT 1
  `).get(companyId, target.target_type, contentType, link);
  if (existing?.id) {
    db.prepare(`
      UPDATE emarqet_social_posts
      SET social_target_id=?,
          caption=?,
          hashtags=?,
          media_url=?,
          status='ready',
          updated_at=datetime('now')
      WHERE company_id=? AND id=?
    `).run(target.id, caption, hashtags, publicImage, companyId, existing.id);
    return { id: existing.id, updated: true };
  }
  const result = db.prepare(`
    INSERT INTO emarqet_social_posts (
      company_id, listing_id, partner_profile_id, social_target_id, platform, target_type,
      content_type, caption, hashtags, link_url, media_url, status, created_by, updated_at
    )
    VALUES (?, NULL, NULL, ?, 'facebook', ?, ?, ?, ?, ?, ?, 'ready', 'emarqet-launch-pack', datetime('now'))
  `).run(
    companyId,
    target.id,
    target.target_type,
    contentType,
    caption,
    hashtags,
    link,
    publicImage
  );
  return { id: result.lastInsertRowid, updated: false };
}

function writeReports(results = []) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, `emarqet-launch-pack-${STAMP}.json`);
  const mdPath = path.join(REPORT_DIR, `emarqet-launch-pack-${STAMP}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    outputDir: path.relative(PROJECT_ROOT, OUTPUT_DIR),
    posts: posts.map((post) => ({
      id: post.id,
      image: `${PUBLIC_PREFIX}/${post.file}`,
      theme: post.themeFile ? `${PUBLIC_PREFIX}/themes/${post.themeFile}` : "",
      pageCaption: post.pageCaption,
      groupCaption: post.groupCaption
    })),
    results
  }, null, 2));
  fs.writeFileSync(mdPath, [
    "# e-Marqet launch pack Facebook",
    "",
    "Campanie: Pune-l pe e-Marqet. Da-l mai departe.",
    "",
    "| ID | Imagine finala | Fundal tematic | Page post | Group manual |",
    "| --- | --- | --- | --- | --- |",
    ...posts.map((post) => `| ${post.id} | ${PUBLIC_PREFIX}/${post.file} | ${post.themeFile ? `${PUBLIC_PREFIX}/themes/${post.themeFile}` : ""} | ${post.pageCaption.replaceAll("\n", "<br>")} | ${post.groupCaption.replaceAll("\n", "<br>")} |`),
    "",
    "## Rezultat DB",
    "",
    "```json",
    JSON.stringify(results, null, 2),
    "```",
    ""
  ].join("\n"));
  return { jsonPath, mdPath };
}

async function main() {
  const companyId = Number(process.argv.find((arg) => arg.startsWith("--company-id="))?.split("=")[1] || "") || companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureEmarqetSocialSchema(db);
  seedEmarqetSocialDefaults(db, companyId);
  await renderAssets();
  const targets = {
    page: pageTarget(db, companyId),
    group: ensureManualGroupTarget(db, companyId)
  };
  if (!targets.page?.id || !targets.group?.id) throw new Error("Nu am gasit targeturile social necesare.");
  const results = [];
  for (const post of posts) {
    results.push({ post: post.id, mode: "page", ...upsertPost(db, companyId, targets.page, post, "page") });
    results.push({ post: post.id, mode: "group", ...upsertPost(db, companyId, targets.group, post, "group") });
  }
  const report = writeReports(results);
  console.log(JSON.stringify({
    companyId,
    assets: posts.length,
    socialPosts: results.length,
    outputDir: path.relative(PROJECT_ROOT, OUTPUT_DIR),
    report
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
