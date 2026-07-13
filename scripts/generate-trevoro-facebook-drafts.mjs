import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const puppeteer = require("/home/server/Trevoro/node_modules/puppeteer");
const sharp = require("/home/server/Trevoro/node_modules/sharp");

const DB_PATH = process.env.DB_PATH || "/home/server/Nexora/database.db";
const PUBLIC_DIR = "/home/server/Trevoro/public/social-drafts/2026-06-08";
const LOCAL_DIR = "/home/server/Nexora/utile/social-drafts/2026-06-08";
const PUBLIC_BASE_URL = "https://www.trevoro.ro/social-drafts/2026-06-08";

const drafts = [
  {
    key: "01-proprietari-cost-predictibil",
    url: "https://www.trevoro.ro/proprietari",
    propertyId: null,
    headline: "Inscrie-ti proprietatea pe Trevoro",
    subline: "Planuri fixe de la 99 lei/luna si 0% comision pe rezervari.",
    cta: "www.trevoro.ro/proprietari",
    caption: `Ai o pensiune, cabana, vila, apartament sau casa de vacanta?

Trevoro cauta proprietari parteneri care vor cost predictibil si promovare clara.

Modelul este transparent: Basic 99 lei/luna, Premium 149 lei/luna sau Business 249 lei/luna, fara comision la fiecare rezervare.

Ce primesti:
- listare online a proprietatii
- poze, descriere, facilitati si calendar
- suport la publicare
- promovare prin campanii online si social media

Inscrie proprietatea aici:
https://www.trevoro.ro/proprietari

WhatsApp suport: 0774362975`,
    hashtags: "#Trevoro #CazareRomania #PensiuniRomania #CabaneRomania #TurismRomania",
  },
  {
    key: "02-cazari-romania",
    url: "https://www.trevoro.ro/",
    propertyId: null,
    headline: "Trevoro aduce cazari romanesti mai aproape de turisti",
    subline: "Cereri clare, proprietati promovate si experiente care raman.",
    cta: "www.trevoro.ro",
    caption: `Trevoro este platforma romaneasca unde turistii descopera cazari, iar proprietarii isi pot promova mai simplu locatia.

Construim o comunitate pentru pensiuni, cabane, vile, apartamente si case de vacanta din Romania.

Fara comision la fiecare rezervare pentru proprietarii parteneri. Simplu, transparent si gandit pentru promovare pe termen lung.

Descopera Trevoro:
https://www.trevoro.ro`,
    hashtags: "#Trevoro #VacanteRomania #CazariRomania #TurismLocal #Romania",
  },
  {
    key: "03-listare-reala",
    url: "https://www.trevoro.ro/properties/1-casa-la-nea-gica-chitorani",
    propertyId: 1,
    headline: "Listari complete, gata de promovat",
    subline: "Poze, facilitati, calendar si cereri de rezervare intr-un singur loc.",
    cta: "Inscrie proprietatea",
    caption: `Asa poate arata o proprietate listata pe Trevoro.

Pagina include prezentarea proprietatii, detalii utile pentru turisti, poze, facilitati si flux pentru cereri de rezervare.

Pentru proprietari, scopul este simplu: o prezenta online clara si o metoda usoara de a primi cereri, fara comision la fiecare rezervare.

Inscrie proprietatea:
https://www.trevoro.ro/proprietari`,
    hashtags: "#Trevoro #ProprietariTurism #CazareRomania #Pensiuni #Rezervari",
  },
  {
    key: "04-aplicatie-android",
    url: "https://www.trevoro.ro/login",
    propertyId: null,
    headline: "Un singur cont pentru clienti si proprietari",
    subline: "Trevoro trimite automat utilizatorul in zona potrivita.",
    cta: "Autentifica-te",
    caption: `Trevoro are un flux simplu de autentificare pentru clienti si proprietari.

Clientii pot cauta cazari si trimite cereri de rezervare, iar proprietarii isi pot administra listarea si calendarul din contul lor.

Pentru proprietari, inscrierea incepe aici:
https://www.trevoro.ro/proprietari

Trevoro.ro - experiente care raman.`,
    hashtags: "#Trevoro #ContProprietar #CazariRomania #TurismRomania",
  },
];

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(value, maxChars) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function textLines(lines, { x, y, size, weight = 800, fill = "#ffffff", lineHeight = 1.12 }) {
  return lines.map((line, index) => {
    const dy = index === 0 ? 0 : size * lineHeight * index;
    return `<text x="${x}" y="${y + dy}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
  }).join("");
}

function overlaySvg(draft, width, height, variant) {
  const panelY = variant === "square" ? 610 : 360;
  const headlineSize = variant === "square" ? 48 : 38;
  const subSize = variant === "square" ? 26 : 20;
  const maxHeadline = variant === "square" ? 26 : 34;
  const top = variant === "square" ? 42 : 34;
  const headlineY = variant === "square" ? 710 : 448;
  const subY = variant === "square" ? 895 : 540;
  const ctaY = variant === "square" ? 1000 : 608;
  const ctaWidth = Math.min(width - 104, Math.max(220, draft.cta.length * 12 + 52));
  const headline = wrapText(draft.headline, maxHeadline);
  const subline = wrapText(draft.subline, variant === "square" ? 36 : 42).slice(0, variant === "square" ? 2 : 1);

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="topShade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#071311" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="#071311" stop-opacity="0.04"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${panelY}" fill="url(#topShade)"/>
      <rect y="${panelY}" width="${width}" height="${height - panelY}" fill="#0c2f2a"/>
      <rect x="52" y="${top}" width="172" height="46" rx="23" fill="#0f766e"/>
      <text x="82" y="${top + 30}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="2" fill="#ffffff">TREVORO</text>
      <text x="52" y="${panelY + 42}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" fill="#f7d36b">Experiente care raman</text>
      ${textLines(headline, { x: 52, y: headlineY, size: headlineSize })}
      ${textLines(subline, { x: 54, y: subY, size: subSize, weight: 700, fill: "#e6f4f1", lineHeight: 1.18 })}
      <rect x="52" y="${ctaY - 38}" width="${ctaWidth}" height="52" rx="26" fill="#f7d36b"/>
      <text x="80" y="${ctaY - 4}" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" fill="#14211f">${escapeXml(draft.cta)}</text>
    </svg>
  `);
}

async function renderAsset(rawPath, outPath, draft, variant) {
  const width = variant === "square" ? 1080 : 1200;
  const height = variant === "square" ? 1080 : 630;
  const screenshotHeight = variant === "square" ? 610 : 360;
  const screenshot = await sharp(rawPath)
    .resize(width, screenshotHeight, { fit: "cover", position: "top" })
    .modulate({ brightness: 0.98, saturation: 1 })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#0c2f2a",
    },
  })
    .composite([
      { input: screenshot, left: 0, top: 0 },
      { input: overlaySvg(draft, width, height, variant), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function ensureDatabaseColumn(db) {
  if (!hasColumn(db, "travel_social_posts", "media_url")) {
    db.exec("ALTER TABLE travel_social_posts ADD COLUMN media_url TEXT");
  }
}

function upsertDraftsInNexora(results) {
  const db = new Database(DB_PATH);
  ensureDatabaseColumn(db);
  const company = db.prepare("SELECT id FROM companies WHERE name LIKE ? ORDER BY id LIMIT 1").get("%A&A FAST IT SOLUTIONS%")
    || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  if (!company?.id) throw new Error("Nu am gasit compania pentru drafturi.");

  const find = db.prepare(`
    SELECT id
    FROM travel_social_posts
    WHERE company_id=? AND platform='facebook' AND content_type='facebook_post' AND media_url=?
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO travel_social_posts (
      company_id, property_id, platform, content_type, caption, hashtags, media_url, status, updated_at
    )
    VALUES (?, ?, 'facebook', 'facebook_post', ?, ?, ?, 'draft', datetime('now'))
  `);
  const update = db.prepare(`
    UPDATE travel_social_posts
    SET property_id=?, caption=?, hashtags=?, status='draft', updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `);

  const ids = [];
  for (const result of results) {
    const existing = find.get(company.id, result.mediaUrl);
    if (existing?.id) {
      update.run(result.propertyId, result.caption, result.hashtags, existing.id, company.id);
      ids.push(existing.id);
    } else {
      ids.push(Number(insert.run(
        company.id,
        result.propertyId,
        result.caption,
        result.hashtags,
        result.mediaUrl
      ).lastInsertRowid || 0));
    }
  }
  db.close();
  return ids.filter(Boolean);
}

async function main() {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });

    for (const draft of drafts) {
      const rawPath = path.join(LOCAL_DIR, `${draft.key}-site.png`);
      const facebookPath = path.join(PUBLIC_DIR, `${draft.key}-facebook.png`);
      const squarePath = path.join(PUBLIC_DIR, `${draft.key}-square.png`);

      await page.goto(draft.url, { waitUntil: "networkidle2", timeout: 45000 });
      await new Promise((resolve) => setTimeout(resolve, 900));
      await page.screenshot({ path: rawPath, fullPage: false });
      await renderAsset(rawPath, facebookPath, draft, "facebook");
      await renderAsset(rawPath, squarePath, draft, "square");

      const mediaUrl = `${PUBLIC_BASE_URL}/${draft.key}-facebook.png`;
      results.push({
        ...draft,
        rawPath,
        facebookPath,
        squarePath,
        mediaUrl,
      });
    }
  } finally {
    await browser.close();
  }

  const ids = upsertDraftsInNexora(results);
  const packPath = path.join(LOCAL_DIR, "drafturi-facebook-trevoro.md");
  const lines = [
    "# Drafturi Facebook Trevoro",
    "",
    `Generate: ${new Date().toISOString()}`,
    "",
    ...results.flatMap((result, index) => [
      `## ${index + 1}. ${result.headline}`,
      "",
      `Imagine Facebook: ${result.mediaUrl}`,
      `Imagine patrata: ${PUBLIC_BASE_URL}/${result.key}-square.png`,
      "",
      "Text:",
      "",
      result.caption,
      "",
      `Hashtags: ${result.hashtags}`,
      "",
    ]),
  ];
  fs.writeFileSync(packPath, lines.join("\n"), "utf8");

  console.log(JSON.stringify({
    createdOrUpdatedPostIds: ids,
    publicDir: PUBLIC_DIR,
    localDir: LOCAL_DIR,
    draftPack: packPath,
    mediaUrls: results.map((result) => result.mediaUrl),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
