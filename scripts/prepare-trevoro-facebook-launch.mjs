import fs from "fs";
import path from "path";
import { db, migrate } from "../db.js";

const OUT_DIR = path.join(process.cwd(), "utile", "rapoarte", "social");

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

function publicPropertyPath(property = {}) {
  const id = Number(property.id || 0);
  const slug = slugText(`${property.name || "proprietate"}-${property.city || "romania"}`) || `proprietate-${id}`;
  return `/properties/${id}-${slug}`;
}

function postTemplates(property = {}) {
  const name = safeText(property.name) || "o proprietate romaneasca";
  const city = safeText(property.city) || "Romania";
  const county = safeText(property.county);
  const type = safeText(property.property_type) || "cazare";
  const location = [city, county].filter(Boolean).join(", ");
  const url = `https://www.trevoro.ro${publicPropertyPath(property)}`;

  return [
    {
      caption: `Trevoro porneste cu proprietati romanesti listate clar si cereri directe. Azi punem in vitrina ${name}, ${type} in ${location}. Vezi listarea si trimite cerere de rezervare.`,
      hashtags: "#Trevoro #CazareRomania #VacanteRomania #TravelRomania",
      url
    },
    {
      caption: `Cauti o escapada de vara in Romania? ${name} din ${city} este una dintre listarile Trevoro pregatite pentru cereri rapide de rezervare. Platforma este in dezvoltare, dar incepem cu proprietati reale.`,
      hashtags: "#Trevoro #WeekendRomania #VacantaDeVara #Romania",
      url
    },
    {
      caption: `Pentru proprietari: Trevoro primeste inscrieri in programul de lansare, cu suport pentru validare, listare si promovare.`,
      hashtags: "#Trevoro #HoteluriRomania #PensiuniRomania #TurismRomanesc",
      url: "https://www.trevoro.ro/proprietari"
    },
    {
      caption: `Intrebare pentru comunitate: ce destinatii romanesti ar trebui sa apara primele pe Trevoro vara asta? Litoral, munte, Delta sau city break?`,
      hashtags: "#Trevoro #VacanteRomania #DestinatiiRomania #TurismLocal",
      url: "https://www.trevoro.ro/search"
    },
    {
      caption: `Ne plac proprietatile romanesti cu poveste. Daca ai hotel, pensiune, cabana, glamping sau apartament in regim hotelier, Trevoro iti poate aduce cereri directe de la clienti.`,
      hashtags: "#Trevoro #ParteneriTrevoro #CazariRomania #CereriDirecte",
      url: "https://www.trevoro.ro/proprietari"
    },
    {
      caption: `${name} este acum in Trevoro. Clientul cauta destinatia, verifica disponibilitatea si trimite cerere de rezervare catre proprietar. Simplu, romanesc, in crestere.`,
      hashtags: "#Trevoro #RezervariRomania #CazareDirecta #Vacante",
      url
    },
    {
      caption: `Construim o alternativa romaneasca pentru cazari verificate. Trevoro creste cu proprietari reali, listari clare si cereri directe.`,
      hashtags: "#Trevoro #TurismRomanesc #StartupRomanesc #CazareRomania",
      url: "https://www.trevoro.ro"
    }
  ];
}

function tiktokTemplates(property = {}) {
  const name = safeText(property.name) || "o cazare din Romania";
  const city = safeText(property.city) || "Romania";
  return [
    {
      caption: `Script TikTok: Daca vrei un weekend in Romania fara cautari interminabile, intra pe Trevoro. Azi descoperim ${name} din ${city}. Cadru 1: exterior. Cadru 2: camera. Cadru 3: zona de relaxare. Final: trimite cerere de rezervare.`,
      hashtags: "#Trevoro #TikTokRomania #VacanteRomania #CazareRomania"
    },
    {
      caption: `Script TikTok: 3 motive sa urmaresti Trevoro vara asta. 1: cazari romanesti. 2: cereri directe. 3: proprietati reale in programul de lansare. Exemplu: ${name}, ${city}.`,
      hashtags: "#Trevoro #TravelRomania #WeekendRomania #Vacanta"
    }
  ];
}

function insertPost(companyId, propertyId, platform, contentType, caption, hashtags) {
  const existing = db.prepare(`
    SELECT id
    FROM travel_social_posts
    WHERE company_id=? AND platform=? AND caption=?
    LIMIT 1
  `).get(companyId, platform, caption);
  if (existing?.id) return { created: false, id: Number(existing.id) };
  const result = db.prepare(`
    INSERT INTO travel_social_posts (
      company_id, property_id, platform, content_type, caption, hashtags, status, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'ready', datetime('now'))
  `).run(companyId, propertyId || null, platform, contentType, caption, hashtags);
  return { created: true, id: Number(result.lastInsertRowid || 0) };
}

migrate();
fs.mkdirSync(OUT_DIR, { recursive: true });

const company = db.prepare(`
  SELECT id, name
  FROM companies
  ORDER BY CASE WHEN id=1 THEN 0 ELSE 1 END, id ASC
  LIMIT 1
`).get();

if (!company?.id) {
  throw new Error("Nu exista companie pentru Trevoro launch.");
}

const properties = db.prepare(`
  SELECT *
  FROM travel_properties
  WHERE status='activ'
  ORDER BY updated_at DESC, id DESC
  LIMIT 10
`).all();

const fallbackProperty = {
  id: 0,
  name: "Trevoro",
  property_type: "platforma de cazari",
  city: "Romania",
  county: ""
};

const targets = properties.length ? properties : [fallbackProperty];
const created = [];
const skipped = [];

for (const property of targets.slice(0, 3)) {
  for (const item of postTemplates(property)) {
    const result = insertPost(company.id, property.id || null, "facebook", "facebook_post", `${item.caption}\n\n${item.url}`, item.hashtags);
    (result.created ? created : skipped).push({ ...result, platform: "facebook", property: property.name });
  }
  for (const item of tiktokTemplates(property)) {
    const result = insertPost(company.id, property.id || null, "tiktok", "tiktok_script", item.caption, item.hashtags);
    (result.created ? created : skipped).push({ ...result, platform: "tiktok", property: property.name });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  company_id: company.id,
  company_name: company.name,
  active_properties_used: targets.map((property) => ({
    id: property.id,
    name: property.name,
    city: property.city,
    county: property.county
  })),
  created: created.length,
  skipped_existing: skipped.length,
  next_steps: [
    "Intra in Nexora > Travel > Social Posts.",
    "Verifica postari ready pentru Facebook/TikTok.",
    "Dupa Page Access Token, foloseste Pune in coada sau Auto queue pentru Facebook.",
    "TikTok ramane draft/manual pana la aprobarea Direct Post."
  ]
};

const outPath = path.join(OUT_DIR, `trevoro-facebook-launch-pack-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
console.log(`Report: ${outPath}`);
