import { db } from "../db.js";

const SOURCE_BASE_URL = "https://www.vacantepentrutotibuzau.ro";
const PRODUCTS_URL = `${SOURCE_BASE_URL}/wp-json/wc/store/v1/products`;
const AGENCY_SLUG = "vacante-pentru-toti-buzau";

const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");
const publish = args.has("--publish");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1] || 0) || 0) : 80;

const monthMap = new Map([
  ["ianuarie", "01"],
  ["ian", "01"],
  ["februarie", "02"],
  ["feb", "02"],
  ["martie", "03"],
  ["mar", "03"],
  ["aprilie", "04"],
  ["apr", "04"],
  ["mai", "05"],
  ["iunie", "06"],
  ["iun", "06"],
  ["iulie", "07"],
  ["iul", "07"],
  ["august", "08"],
  ["aug", "08"],
  ["septembrie", "09"],
  ["sep", "09"],
  ["octombrie", "10"],
  ["oct", "10"],
  ["noiembrie", "11"],
  ["noi", "11"],
  ["decembrie", "12"],
  ["dec", "12"],
]);

const countryHints = [
  ["Grecia", ["grecia", "paralia", "katerini", "meteora", "skiatos", "halkidiki"]],
  ["Turcia", ["turcia", "istanbul", "kusadasi", "canakkale", "bursa"]],
  ["Bulgaria", ["bulgaria", "kazanlak", "nisipurile", "varna", "balcic"]],
  ["Albania", ["albania", "saranda"]],
  ["Polonia", ["polonia", "cracovia", "varsovia"]],
  ["Austria", ["austria", "viena"]],
  ["Italia", ["italia", "roma", "venetia"]],
  ["Serbia", ["serbia", "belgrad"]],
  ["Ungaria", ["ungaria", "budapesta"]],
  ["Romania", ["romania", "delta", "maramures", "bucovina", "transalpina", "transfagarasan", "cazanele", "apuseni"]],
];

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&euro;|&#8364;/g, "€")
    .replace(/&icirc;/g, "î")
    .replace(/&acirc;/g, "â")
    .replace(/&ă|&#259;/g, "ă")
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value = "") {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "\n"))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "oferta";
}

function activeCompanyId() {
  const active = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  if (active?.id) return Number(active.id);
  const any = db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get();
  return Number(any?.id || 0);
}

function parseMoney(product = {}) {
  const html = decodeHtml(product.price_html || "");
  const currency = /lei|ron/i.test(html) ? "RON" : /€|eur/i.test(html) ? "EUR" : String(product.prices?.currency_code || "RON").toUpperCase();
  const match = html.match(/([0-9][0-9.\s]*(?:,[0-9]+)?)/);
  const price = match
    ? Number(match[1].replace(/\s+/g, "").replace(/\./g, "").replace(",", "."))
    : Number(product.prices?.price || 0);
  return { price: Number.isFinite(price) ? price : 0, currency: currency === "LEI" ? "RON" : currency };
}

function parseDateRange(title = "", description = "") {
  const titleText = decodeHtml(title).toLowerCase();
  const descriptionText = decodeHtml(description).toLowerCase();
  const day = "(0?[1-9]|[12]\\d|3[01])";
  const resolve = (text = "") => {
    const year = (text.match(/\b(2026|2027|2028)\b/) || titleText.match(/\b(2026|2027|2028)\b/) || [])[1] || "2026";
    const sameMonth = text.match(new RegExp(`\\b${day}\\s*[-–]\\s*${day}\\s+([a-zăâîșț]+)\\b`, "u"));
    if (sameMonth) {
      const month = monthMap.get(sameMonth[3]);
      if (month) {
        return {
          from: `${year}-${month}-${sameMonth[1].padStart(2, "0")}`,
          until: `${year}-${month}-${sameMonth[2].padStart(2, "0")}`,
        };
      }
    }
    const twoMonth = text.match(new RegExp(`\\b${day}\\s+([a-zăâîșț]+)\\s*[-–]\\s*${day}\\s+([a-zăâîșț]+)\\b`, "u"));
    if (twoMonth) {
      const fromMonth = monthMap.get(twoMonth[2]);
      const untilMonth = monthMap.get(twoMonth[4]);
      if (fromMonth && untilMonth) {
        const crossesYear = Number(fromMonth) > Number(untilMonth);
        const fromYear = crossesYear ? String(Number(year) - 1) : year;
        return {
          from: `${fromYear}-${fromMonth}-${twoMonth[1].padStart(2, "0")}`,
          until: `${year}-${untilMonth}-${twoMonth[3].padStart(2, "0")}`,
        };
      }
    }
    const single = text.match(new RegExp(`\\b${day}\\s+([a-zăâîșț]+)\\b`, "u"));
    if (single) {
      const month = monthMap.get(single[2]);
      if (month) return { from: `${year}-${month}-${single[1].padStart(2, "0")}`, until: `${year}-${month}-${single[1].padStart(2, "0")}` };
    }
    return null;
  };
  return resolve(titleText) || resolve(descriptionText) || { from: "", until: "" };
}

function daysBetween(from = "", until = "") {
  if (!from || !until) return 0;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function inferCountry(title = "", categories = []) {
  const haystack = `${title} ${categories.join(" ")}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [country, hints] of countryHints) {
    if (hints.some((hint) => haystack.includes(hint.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))) return country;
  }
  return "Romania";
}

function inferCategory(categories = []) {
  const text = categories.join(" ").toLowerCase();
  if (text.includes("pelerinaj")) return "pelerinaj";
  if (text.includes("sejur")) return "sejur";
  if (text.includes("externe")) return "circuit-extern";
  if (text.includes("interne")) return "circuit-intern";
  if (text.includes("1 zi")) return "excursie-1-zi";
  return "excursie";
}

function includesFromHtml(html = "") {
  const includedBlock = String(html || "").match(/<div[^>]*services-included[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const source = includedBlock || html;
  const items = [...String(source).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean)
    .slice(0, 12);
  return items.join("\n");
}

function cleanTitle(value = "") {
  return decodeHtml(value).replace(/\s+2026\s*$/i, "").trim();
}

function mapProduct(product = {}) {
  const title = cleanTitle(product.name || "");
  const categories = Array.isArray(product.categories) ? product.categories.map((category) => decodeHtml(category.name || "")).filter(Boolean) : [];
  const plain = stripHtml(product.description || product.short_description || "");
  const { price, currency } = parseMoney(product);
  const dates = parseDateRange(title, plain);
  const duration = daysBetween(dates.from, dates.until) || Number((plain.match(/(\d+)\s+nop/i) || [])[1] || 0) + 1 || 1;
  const image = product.images?.[0]?.src || product.images?.[0]?.thumbnail || "";
  return {
    title,
    destination: title.replace(/\s+[-–]\s+\d{1,2}.*$/u, "").slice(0, 180),
    country: inferCountry(title, categories),
    city: "",
    category: inferCategory(categories),
    amenities: "transport-autocar,ghid",
    slug: slugify(title),
    summary: plain.slice(0, 320),
    description: plain.slice(0, 2400),
    image_url: image,
    departure_city: "Buzau",
    duration_days: duration,
    valid_from: dates.from,
    valid_until: dates.until,
    includes: includesFromHtml(product.short_description || product.description || ""),
    contact_phone: "0764 407 184",
    contact_email: "vacantepentrutoti@yahoo.com",
    price_from: price,
    currency,
    offer_url: product.permalink,
    status: publish ? "ready" : "draft",
    promotion_priority: "normal",
    notes: `Import Vacante pentru Toti Buzau. WooCommerce product id: ${product.id}. Categories: ${categories.join(", ")}`,
  };
}

async function fetchProducts() {
  const products = [];
  for (let page = 1; products.length < limit && page <= 20; page += 1) {
    const url = `${PRODUCTS_URL}?per_page=100&page=${page}`;
    const response = await fetch(url, { headers: { "user-agent": "TrevoroAgencyOfferImport/1.0" } });
    if (!response.ok) throw new Error(`fetch_failed_${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch) || !batch.length) break;
    products.push(...batch);
  }
  return products.slice(0, limit);
}

function ensureAgency(companyId) {
  const existing = db.prepare("SELECT * FROM travel_agency_leads WHERE company_id=? AND slug=? LIMIT 1").get(companyId, AGENCY_SLUG);
  const values = {
    name: "Vacante pentru Toti SRL",
    display_name: "Vacante pentru Toti Buzau",
    country: "Romania",
    city: "Buzau",
    address: "Str. Unirii Nr. 195, Buzau",
    phone: "0764 407 184",
    email: "vacantepentrutoti@yahoo.com",
    website: SOURCE_BASE_URL,
    facebook: "https://www.facebook.com/profile.php?id=61553784650665",
    contact_name: "",
    short_description: "Agentie de turism din Buzau cu excursii cu autocar, circuite interne si externe, sejururi si pelerinaje.",
    description: "Parteneriat Trevoro pregatit pentru listarea ofertelor Vacante pentru Toti Buzau. Primele 12 luni sunt propuse fara costuri, cu lead-uri si click-uri masurate prin Trevoro.",
    offer_focus: "Excursii cu autocar din Buzau, circuite interne si externe, sejururi, pelerinaje si oferte de sezon.",
    source: "manual_partner_email",
    status: publish ? "activ" : "interesat",
    public_status: publish ? "published" : "draft",
    subscription_status: publish ? "trial" : "lead",
  };
  if (existing) {
    db.prepare(`
      UPDATE travel_agency_leads
      SET name=?, display_name=?, country=?, city=?, address=?, phone=?, email=?, website=?, facebook=?,
          contact_name=?, short_description=?, description=?, offer_focus=?, source=?, status=?,
          public_status=?, subscription_status=?, monthly_price_ron=0, monthly_price_amount=0,
          monthly_price_currency='RON', listing_limit=0,
          promotion_notes='Parteneriat propus: 12 luni fara costuri; tracking lead-uri si click-uri prin Trevoro.',
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      values.name,
      values.display_name,
      values.country,
      values.city,
      values.address,
      values.phone,
      values.email,
      values.website,
      values.facebook,
      values.contact_name,
      values.short_description,
      values.description,
      values.offer_focus,
      values.source,
      values.status,
      values.public_status,
      values.subscription_status,
      existing.id,
      companyId,
    );
    return Number(existing.id);
  }
  const result = db.prepare(`
    INSERT INTO travel_agency_leads (
      company_id, name, country, city, address, phone, email, website, facebook, slug,
      display_name, contact_name, short_description, description, offer_focus, source,
      status, public_status, subscription_status, monthly_price_ron, monthly_price_amount,
      monthly_price_currency, listing_limit, promotion_notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'RON', 0,
      'Parteneriat propus: 12 luni fara costuri; tracking lead-uri si click-uri prin Trevoro.',
      datetime('now'))
  `).run(
    companyId,
    values.name,
    values.country,
    values.city,
    values.address,
    values.phone,
    values.email,
    values.website,
    values.facebook,
    AGENCY_SLUG,
    values.display_name,
    values.contact_name,
    values.short_description,
    values.description,
    values.offer_focus,
    values.source,
    values.status,
    values.public_status,
    values.subscription_status,
  );
  return Number(result.lastInsertRowid || 0);
}

function upsertOffer(companyId, agencyId, offer) {
  const existing = db.prepare(`
    SELECT *
    FROM travel_agency_offers
    WHERE company_id=? AND agency_id=? AND (offer_url=? OR slug=?)
    ORDER BY CASE WHEN offer_url=? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(companyId, agencyId, offer.offer_url, offer.slug, offer.offer_url);
  const values = [
    offer.title,
    offer.destination,
    offer.country,
    offer.city,
    offer.category,
    offer.amenities,
    offer.slug,
    offer.summary,
    offer.description,
    offer.image_url,
    offer.departure_city,
    offer.duration_days,
    offer.valid_from,
    offer.valid_until,
    offer.includes,
    offer.contact_phone,
    offer.contact_email,
    offer.price_from,
    offer.currency,
    offer.offer_url,
    offer.status,
    offer.promotion_priority,
    offer.notes,
  ];
  if (existing) {
    db.prepare(`
      UPDATE travel_agency_offers
      SET title=?, destination=?, country=?, city=?, category=?, amenities=?, slug=?, summary=?, description=?,
          image_url=?, departure_city=?, duration_days=?, valid_from=?, valid_until=?, includes=?,
          contact_phone=?, contact_email=?, price_from=?, currency=?, offer_url=?, status=?,
          promotion_priority=?, notes=?, updated_at=datetime('now')
      WHERE id=? AND company_id=? AND agency_id=?
    `).run(...values, existing.id, companyId, agencyId);
    return { id: Number(existing.id), created: false };
  }
  const result = db.prepare(`
    INSERT INTO travel_agency_offers (
      company_id, agency_id, title, destination, country, city, category, amenities, slug, summary, description,
      image_url, departure_city, duration_days, valid_from, valid_until, includes, contact_phone, contact_email,
      price_from, currency, offer_url, status, promotion_priority, notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(companyId, agencyId, ...values);
  return { id: Number(result.lastInsertRowid || 0), created: true };
}

function ensureOfferPhoto(companyId, agencyId, offerId, offer) {
  if (!offer.image_url) return;
  const existing = db.prepare(`
    SELECT id
    FROM travel_agency_photos
    WHERE company_id=? AND agency_id=? AND offer_id=? AND url=? AND status='active'
    LIMIT 1
  `).get(companyId, agencyId, offerId, offer.image_url);
  if (existing) return;
  db.prepare(`
    INSERT INTO travel_agency_photos (
      company_id, agency_id, offer_id, url, caption, photo_type, sort_order, is_cover, status, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'offer', 0, 1, 'active', datetime('now'))
  `).run(companyId, agencyId, offerId, offer.image_url, offer.title);
}

const products = await fetchProducts();
const offers = products.map(mapProduct).filter((offer) => offer.title && offer.offer_url);

console.log(`Vacante pentru Toti Buzau import`);
console.log(`Mode: ${commit ? "commit" : "dry-run"}${publish ? " + publish" : ""}`);
console.log(`Products fetched: ${products.length}`);
console.log(`Offers mapped: ${offers.length}`);
for (const offer of offers.slice(0, 12)) {
  console.log(`- ${offer.title} | ${offer.valid_from || "-"} | ${offer.price_from || "-"} ${offer.currency} | ${offer.status}`);
}
if (!commit) {
  console.log("Dry-run only. Run with --commit to write. Add --publish only after partner approval.");
  process.exit(0);
}

const companyId = activeCompanyId();
if (!companyId) throw new Error("missing_company");
const run = db.transaction(() => {
  const agencyId = ensureAgency(companyId);
  let created = 0;
  let updated = 0;
  for (const offer of offers) {
    const result = upsertOffer(companyId, agencyId, offer);
    if (result.created) created += 1;
    else updated += 1;
    ensureOfferPhoto(companyId, agencyId, result.id, offer);
  }
  return { agencyId, created, updated };
});

const result = run();
console.log(`Committed agency_id=${result.agencyId}, created=${result.created}, updated=${result.updated}`);
console.log(`Public slug: /agentii/${AGENCY_SLUG}`);
