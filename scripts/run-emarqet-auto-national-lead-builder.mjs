#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  createLeadBuilderJob,
  ensureLeadBuilderSchema,
  prepareCampaignForApproval,
  runLeadBuilderJob,
  safeText,
  seedLeadBuilderDefaults
} from "../lib/lead-builder.js";
import { ensureGooglePlacesSchema, googlePlacesAvailable } from "../lib/google-places-service.js";

dotenv.config();

const CAMPAIGN_NAME = "Parcuri Auto Romania - Lansare E-MARQET";
const ACTOR_EMAIL = "emarqet-auto-national-lead-builder";
const DEFAULT_KEYWORDS = [
  "parc auto",
  "parcuri auto",
  "auto rulate",
  "masini rulate",
  "autoturisme rulate",
  "auto second hand",
  "masini second hand",
  "autorulate",
  "auto in rate",
  "import auto"
].join(", ");

const OFFICIAL_REP_HINTS = [
  "reprezentanta",
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

const ROMANIA_AUTO_MARKETS = [
  { county: "Alba", cities: ["Alba Iulia", "Sebes", "Aiud", "Blaj"] },
  { county: "Arad", cities: ["Arad", "Ineu", "Lipova", "Curtici"] },
  { county: "Arges", cities: ["Pitesti", "Mioveni", "Campulung", "Curtea de Arges"] },
  { county: "Bacau", cities: ["Bacau", "Onesti", "Moinesti", "Comanesti"] },
  { county: "Bihor", cities: ["Oradea", "Salonta", "Marghita", "Alesd"] },
  { county: "Bistrita-Nasaud", cities: ["Bistrita", "Beclean", "Nasaud", "Sangeorz-Bai"] },
  { county: "Botosani", cities: ["Botosani", "Dorohoi", "Darabani", "Saveni"] },
  { county: "Brasov", cities: ["Brasov", "Sacele", "Fagaras", "Codlea"] },
  { county: "Braila", cities: ["Braila", "Ianca", "Faurei", "Insuratei"] },
  { county: "Bucuresti", cities: ["Bucuresti", "Sector 1", "Sector 2", "Sector 3", "Sector 4", "Sector 5", "Sector 6"] },
  { county: "Buzau", cities: ["Buzau", "Ramnicu Sarat", "Nehoiu", "Patarlagele"] },
  { county: "Calarasi", cities: ["Calarasi", "Oltenita", "Lehliu Gara", "Budesti"] },
  { county: "Caras-Severin", cities: ["Resita", "Caransebes", "Bocsa", "Oravita"] },
  { county: "Cluj", cities: ["Cluj-Napoca", "Turda", "Dej", "Campia Turzii"] },
  { county: "Constanta", cities: ["Constanta", "Mangalia", "Medgidia", "Navodari"] },
  { county: "Covasna", cities: ["Sfantu Gheorghe", "Targu Secuiesc", "Covasna", "Baraolt"] },
  { county: "Dambovita", cities: ["Targoviste", "Moreni", "Gaesti", "Pucioasa"] },
  { county: "Dolj", cities: ["Craiova", "Bailesti", "Calafat", "Filiasi"] },
  { county: "Galati", cities: ["Galati", "Tecuci", "Targu Bujor", "Beresti"] },
  { county: "Giurgiu", cities: ["Giurgiu", "Bolintin-Vale", "Mihailesti", "Comana"] },
  { county: "Gorj", cities: ["Targu Jiu", "Motru", "Rovinari", "Targu Carbunesti"] },
  { county: "Harghita", cities: ["Miercurea Ciuc", "Odorheiu Secuiesc", "Gheorgheni", "Toplita"] },
  { county: "Hunedoara", cities: ["Deva", "Hunedoara", "Petrosani", "Orastie"] },
  { county: "Ialomita", cities: ["Slobozia", "Fetesti", "Urziceni", "Tandarei"] },
  { county: "Iasi", cities: ["Iasi", "Pascani", "Harlau", "Targu Frumos"] },
  { county: "Ilfov", cities: ["Voluntari", "Otopeni", "Chiajna", "Popesti-Leordeni", "Bragadiru", "Pantelimon"] },
  { county: "Maramures", cities: ["Baia Mare", "Sighetu Marmatiei", "Borsa", "Viseu de Sus"] },
  { county: "Mehedinti", cities: ["Drobeta-Turnu Severin", "Orsova", "Strehaia", "Vanju Mare"] },
  { county: "Mures", cities: ["Targu Mures", "Reghin", "Sighisoara", "Tarnaveni"] },
  { county: "Neamt", cities: ["Piatra Neamt", "Roman", "Targu Neamt", "Roznov"] },
  { county: "Olt", cities: ["Slatina", "Caracal", "Bals", "Corabia"] },
  { county: "Prahova", cities: ["Ploiesti", "Blejoi", "Campina", "Baicoi", "Valenii de Munte"] },
  { county: "Satu Mare", cities: ["Satu Mare", "Carei", "Negresti-Oas", "Tasnad"] },
  { county: "Salaj", cities: ["Zalau", "Simleu Silvaniei", "Jibou", "Cehu Silvaniei"] },
  { county: "Sibiu", cities: ["Sibiu", "Medias", "Cisnadie", "Agnita"] },
  { county: "Suceava", cities: ["Suceava", "Falticeni", "Radauti", "Campulung Moldovenesc"] },
  { county: "Teleorman", cities: ["Alexandria", "Rosiori de Vede", "Turnu Magurele", "Zimnicea"] },
  { county: "Timis", cities: ["Timisoara", "Lugoj", "Sannicolau Mare", "Jimbolia"] },
  { county: "Tulcea", cities: ["Tulcea", "Macin", "Babadag", "Isaccea"] },
  { county: "Valcea", cities: ["Ramnicu Valcea", "Dragasani", "Horezu", "Calimanesti"] },
  { county: "Vaslui", cities: ["Vaslui", "Barlad", "Husi", "Negresti"] },
  { county: "Vrancea", cities: ["Focsani", "Adjud", "Marasesti", "Odobesti"] }
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

function json(value) {
  return JSON.stringify(value ?? null);
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

function companyIdFromDb() {
  const explicit = Number(argValue("--company-id", "0"));
  if (explicit) return explicit;
  const active = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  if (active?.id) return Number(active.id);
  return Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
}

function selectedMarkets() {
  const onlyCounty = normalizeKey(argValue("--county"));
  const start = Math.max(0, Number(argValue("--start-index", "0")) || 0);
  const limit = Number(argValue("--limit-counties", "0")) || 0;
  let rows = onlyCounty
    ? ROMANIA_AUTO_MARKETS.filter((row) => normalizeKey(row.county).includes(onlyCounty))
    : ROMANIA_AUTO_MARKETS.slice(start);
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}

function ensureNationalCampaign(companyId, maxResults) {
  db.prepare(`
    INSERT OR IGNORE INTO lead_campaigns (
      company_id, name, target_product, domain, category, country, county,
      city_list, keywords, max_results, status, created_by_email
    ) VALUES (?, ?, 'E-MARQET', 'Auto', 'auto_dealers', 'Romania', '', ?, ?, ?, 'active', ?)
  `).run(companyId, CAMPAIGN_NAME, ROMANIA_AUTO_MARKETS.map((row) => row.county).join(", "), DEFAULT_KEYWORDS, maxResults, ACTOR_EMAIL);
  db.prepare(`
    UPDATE lead_campaigns
    SET target_product='E-MARQET',
        domain='Auto',
        category='auto_dealers',
        country='Romania',
        county='',
        keywords=?,
        max_results=?,
        status='active',
        updated_at=datetime('now')
    WHERE company_id=? AND name=?
  `).run(DEFAULT_KEYWORDS, maxResults, companyId, CAMPAIGN_NAME);
  return db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND name=?").get(companyId, CAMPAIGN_NAME);
}

function upsertCountySearch(companyId, campaignId, market, options = {}) {
  const name = `Cautare nationala - Parcuri Auto ${market.county}`;
  const city = market.cities.join(", ");
  const sources = options.sources;
  let row = db.prepare(`
    SELECT *
    FROM lead_searches
    WHERE company_id=? AND campaign_id=? AND name=?
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId, campaignId, name);
  if (!row?.id) {
    const result = db.prepare(`
      INSERT INTO lead_searches (
        company_id, campaign_id, name, activity_domain, category, keywords, country, county, city,
        radius_km, max_results, sources_json, collect_email, collect_phone, collect_website,
        collect_facebook, collect_instagram, collect_linkedin, collect_address,
        identify_contact_person, identify_external_platforms, check_online_store,
        check_existing_crm, check_existing_emarqet, auto_sync_crm, status, created_by_email
      ) VALUES (?, ?, ?, 'Auto', 'auto_dealers', ?, 'Romania', ?, ?, ?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'ready', ?)
    `).run(
      companyId,
      campaignId,
      name,
      DEFAULT_KEYWORDS,
      market.county,
      city,
      options.radiusKm,
      options.maxResultsPerCounty,
      json(sources),
      ACTOR_EMAIL
    );
    row = { id: result.lastInsertRowid };
  }
  db.prepare(`
    UPDATE lead_searches
    SET activity_domain='Auto',
        category='auto_dealers',
        keywords=?,
        country='Romania',
        county=?,
        city=?,
        radius_km=?,
        max_results=?,
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
  `).run(DEFAULT_KEYWORDS, market.county, city, options.radiusKm, options.maxResultsPerCounty, json(sources), companyId, row.id);
  return db.prepare("SELECT * FROM lead_searches WHERE company_id=? AND id=?").get(companyId, row.id);
}

function isOfficialRepresentativeText(value = "") {
  const key = normalizeKey(value);
  return OFFICIAL_REP_HINTS.some((token) => key.includes(normalizeKey(token)));
}

function markOfficialRepresentatives(companyId, campaignId) {
  if (["0", "false", "no", "nu"].includes(String(process.env.EMARQET_AUTO_EXCLUDE_OFFICIAL_REPS ?? "true").trim().toLowerCase())) {
    return { marked: 0, rows: [] };
  }
  const rows = db.prepare(`
    SELECT l.id AS lead_id, c.id AS lead_company_id, c.commercial_name, c.legal_name, c.website, c.source_url
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=? AND l.campaign_id=? AND COALESCE(l.do_not_contact,0)=0
  `).all(companyId, campaignId);
  const matches = rows.filter((row) => isOfficialRepresentativeText([
    row.commercial_name,
    row.legal_name,
    row.website,
    row.source_url
  ].join(" ")));
  const tx = db.transaction(() => {
    for (const row of matches) {
      db.prepare(`
        UPDATE leads
        SET do_not_contact=1, status='nu_mai_contacta', stage='nu_mai_contacta', updated_at=datetime('now')
        WHERE company_id=? AND id=?
      `).run(companyId, row.lead_id);
      db.prepare(`
        INSERT INTO lead_activities (company_id, lead_id, lead_company_id, activity_type, subject, details, actor_email)
        VALUES (?, ?, ?, 'filter', 'Reprezentanta auto exclusa', ?, ?)
      `).run(companyId, row.lead_id, row.lead_company_id, row.commercial_name, ACTOR_EMAIL);
    }
  });
  tx();
  return { marked: matches.length, rows: matches.map((row) => ({ leadId: row.lead_id, company: row.commercial_name })) };
}

function campaignStats(companyId, campaignId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(l.do_not_contact,0)=1 THEN 1 ELSE 0 END) AS do_not_contact,
      SUM(CASE WHEN COALESCE(c.primary_email,'')<>'' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN COALESCE(c.primary_phone,'')<>'' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN COALESCE(c.primary_email,'')<>'' AND COALESCE(c.primary_phone,'')<>'' THEN 1 ELSE 0 END) AS with_email_and_phone,
      SUM(CASE WHEN COALESCE(c.website,'')<>'' THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN COALESCE(c.google_place_id,'')<>'' THEN 1 ELSE 0 END) AS with_google,
      SUM(CASE WHEN COALESCE(m.status,'')='sent' THEN 1 ELSE 0 END) AS messages_sent
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    LEFT JOIN lead_messages m ON m.company_id=l.company_id AND m.lead_id=l.id AND m.message_type='email_initial'
    WHERE l.company_id=? AND l.campaign_id=?
  `).get(companyId, campaignId) || {};
}

function byCountyStats(companyId, campaignId) {
  return db.prepare(`
    SELECT
      COALESCE(NULLIF(c.county,''), '-') AS county,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(c.primary_email,'')<>'' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN COALESCE(c.primary_phone,'')<>'' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN COALESCE(c.primary_email,'')<>'' AND COALESCE(c.primary_phone,'')<>'' THEN 1 ELSE 0 END) AS with_email_and_phone
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=? AND l.campaign_id=?
    GROUP BY COALESCE(NULLIF(c.county,''), '-')
    ORDER BY total DESC, county ASC
  `).all(companyId, campaignId);
}

function googleUsageToday(companyId) {
  return db.prepare(`
    SELECT request_count, estimated_cost
    FROM google_places_usage
    WHERE company_id=? AND usage_date=date('now')
  `).get(companyId) || { request_count: 0, estimated_cost: 0 };
}

async function main() {
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");

  process.env.EMARQET_AUTO_EXCLUDE_OFFICIAL_REPS ??= "true";
  process.env.GOOGLE_PLACES_ENABLED ??= process.env.GOOGLE_PLACES_API_KEY ? "true" : "";
  const maxResultsPerCounty = Math.max(1, Math.min(100, Number(argValue("--max-results-per-county", "25")) || 25));
  const maxQueriesPerCounty = Math.max(1, Math.min(20, Number(argValue("--max-queries-per-county", "5")) || 5));
  const radiusKm = Math.max(5, Math.min(80, Number(argValue("--radius-km", "30")) || 30));
  const prepareLimit = Math.max(1, Math.min(1000, Number(argValue("--prepare-limit", "300")) || 300));
  const sources = safeText(argValue("--sources"))
    ? safeText(argValue("--sources")).split(/[,;\s]+/).map(safeText).filter(Boolean)
    : (googlePlacesAvailable() ? ["google_places", "public_website"] : ["openstreetmap", "public_website"]);

  process.env.GOOGLE_PLACES_MAX_RESULTS_PER_JOB = String(maxResultsPerCounty);
  process.env.GOOGLE_PLACES_MAX_QUERIES_PER_JOB = String(maxQueriesPerCounty);
  ensureLeadBuilderSchema(db);
  ensureGooglePlacesSchema(db);
  seedLeadBuilderDefaults(db, companyId);

  const markets = selectedMarkets();
  if (!markets.length) throw new Error("Nu am gasit niciun judet pentru criteriul cerut.");
  const campaign = ensureNationalCampaign(companyId, markets.length * maxResultsPerCounty);
  const jobs = [];
  for (const market of markets) {
    const search = upsertCountySearch(companyId, campaign.id, market, {
      radiusKm,
      maxResultsPerCounty,
      sources
    });
    if (hasFlag("--no-run")) {
      jobs.push({ county: market.county, searchId: search.id, queued: false, skippedRun: true });
      continue;
    }
    const job = createLeadBuilderJob(db, companyId, search.id, "google_places_auto_national", ACTOR_EMAIL);
    const result = await runLeadBuilderJob(db, job.id, { maxGoogleResults: maxResultsPerCounty });
    jobs.push({ county: market.county, searchId: search.id, jobId: job.id, ...result });
    if (String(result.error || "").includes("google_places_daily_limit_reached")) break;
  }

  const official = markOfficialRepresentatives(companyId, campaign.id);
  const approval = prepareCampaignForApproval(db, companyId, campaign.id, ACTOR_EMAIL, prepareLimit);
  const stats = campaignStats(companyId, campaign.id);
  const byCounty = byCountyStats(companyId, campaign.id);
  const googleUsage = googleUsageToday(companyId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "outreach", `emarqet-auto-national-lead-builder-report-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    companyId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    noRun: hasFlag("--no-run"),
    markets: markets.map((row) => row.county),
    sources,
    maxResultsPerCounty,
    maxQueriesPerCounty,
    radiusKm,
    officialRepresentativeFilter: process.env.EMARQET_AUTO_EXCLUDE_OFFICIAL_REPS,
    jobs,
    official,
    approval,
    stats,
    byCounty,
    googleUsage
  }, null, 2));
  console.log(JSON.stringify({
    ok: jobs.every((job) => job.ok !== false),
    reportPath,
    companyId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    noRun: hasFlag("--no-run"),
    searchedCounties: markets.length,
    jobsRun: jobs.filter((job) => job.jobId).length,
    officialExcluded: official.marked,
    approval,
    stats,
    googleUsage,
    byCounty: byCounty.slice(0, 12),
    jobs
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(safeText(error?.message || error));
    process.exitCode = 1;
  })
  .finally(() => db.close());
