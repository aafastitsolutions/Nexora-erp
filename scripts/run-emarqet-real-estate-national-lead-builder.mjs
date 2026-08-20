#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  createLeadBuilderJob,
  ensureLeadBuilderSchema,
  runLeadBuilderJob,
  safeText,
  seedLeadBuilderDefaults
} from "../lib/lead-builder.js";
import { ensureGooglePlacesSchema, googlePlacesAvailable } from "../lib/google-places-service.js";
import {
  ensureEmarqetOutboundSchema,
  normalizeEmail,
  safeText as outboundSafeText,
  upsertOutboundLead
} from "../lib/emarqet-outbound.js";

dotenv.config();

const CAMPAIGN_NAME = "Agentii Imobiliare Romania - Lansare E-MARQET";
const ACTOR_EMAIL = "emarqet-real-estate-national-lead-builder";
const CATEGORY = "real_estate_agencies";
const ACTIVITY_DOMAIN = "Imobiliare";
const SEGMENT_LABEL = "Agentii imobiliare";
const DEFAULT_KEYWORDS = [
  "agentie imobiliara",
  "agentii imobiliare",
  "imobiliare",
  "apartamente de vanzare",
  "apartamente de inchiriat",
  "case de vanzare",
  "terenuri de vanzare",
  "spatii comerciale"
].join(", ");

const ROMANIA_REAL_ESTATE_MARKETS = [
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
  { county: "Prahova", cities: ["Ploiesti", "Campina", "Baicoi", "Valenii de Munte", "Sinaia"] },
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
    ? ROMANIA_REAL_ESTATE_MARKETS.filter((row) => normalizeKey(row.county).includes(onlyCounty))
    : ROMANIA_REAL_ESTATE_MARKETS.slice(start);
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}

function ensureNationalCampaign(companyId, maxResults) {
  db.prepare(`
    INSERT OR IGNORE INTO lead_campaigns (
      company_id, name, target_product, domain, category, country, county,
      city_list, keywords, max_results, status, created_by_email
    ) VALUES (?, ?, 'E-MARQET', ?, ?, 'Romania', '', ?, ?, ?, 'active', ?)
  `).run(
    companyId,
    CAMPAIGN_NAME,
    ACTIVITY_DOMAIN,
    CATEGORY,
    ROMANIA_REAL_ESTATE_MARKETS.map((row) => row.county).join(", "),
    DEFAULT_KEYWORDS,
    maxResults,
    ACTOR_EMAIL
  );
  db.prepare(`
    UPDATE lead_campaigns
    SET target_product='E-MARQET',
        domain=?,
        category=?,
        country='Romania',
        county='',
        keywords=?,
        max_results=?,
        status='active',
        updated_at=datetime('now')
    WHERE company_id=? AND name=?
  `).run(ACTIVITY_DOMAIN, CATEGORY, DEFAULT_KEYWORDS, maxResults, companyId, CAMPAIGN_NAME);
  return db.prepare("SELECT * FROM lead_campaigns WHERE company_id=? AND name=?").get(companyId, CAMPAIGN_NAME);
}

function upsertCitySearch(companyId, campaignId, market, city, options = {}) {
  const name = `Cautare nationala - Agentii Imobiliare ${market.county} - ${city}`;
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
      ) VALUES (?, ?, ?, ?, ?, ?, 'Romania', ?, ?, ?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'ready', ?)
    `).run(
      companyId,
      campaignId,
      name,
      ACTIVITY_DOMAIN,
      CATEGORY,
      DEFAULT_KEYWORDS,
      market.county,
      city,
      options.radiusKm,
      options.maxResultsPerCity,
      json(options.sources),
      ACTOR_EMAIL
    );
    row = { id: result.lastInsertRowid };
  }
  db.prepare(`
    UPDATE lead_searches
    SET activity_domain=?,
        category=?,
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
  `).run(
    ACTIVITY_DOMAIN,
    CATEGORY,
    DEFAULT_KEYWORDS,
    market.county,
    city,
    options.radiusKm,
    options.maxResultsPerCity,
    json(options.sources),
    companyId,
    row.id
  );
  return db.prepare("SELECT * FROM lead_searches WHERE company_id=? AND id=?").get(companyId, row.id);
}

function campaignStats(companyId, campaignId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(c.primary_email,'')<>'' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN COALESCE(c.primary_phone,'')<>'' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN COALESCE(c.website,'')<>'' THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN COALESCE(l.do_not_contact,0)=1 THEN 1 ELSE 0 END) AS do_not_contact
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=? AND l.campaign_id=?
  `).get(companyId, campaignId) || {};
}

function syncCampaignToOutbound(companyId, campaignId, limit = 0) {
  ensureEmarqetOutboundSchema(db);
  const rows = db.prepare(`
    SELECT
      l.id AS lead_id,
      l.do_not_contact,
      c.commercial_name,
      c.legal_name,
      c.cui,
      c.registration_number,
      c.country,
      c.county,
      c.city,
      c.address,
      c.website,
      c.primary_email,
      c.primary_phone,
      c.facebook_url,
      c.google_maps_uri,
      c.source_url
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=?
      AND l.campaign_id=?
      AND COALESCE(l.do_not_contact,0)=0
      AND c.category=?
    ORDER BY
      CASE WHEN COALESCE(c.primary_email,'')<>'' THEN 1 ELSE 2 END,
      l.score DESC,
      l.id ASC
    ${limit ? "LIMIT ?" : ""}
  `).all(...[companyId, campaignId, CATEGORY, ...(limit ? [Number(limit)] : [])]);

  let synced = 0;
  let ready = 0;
  let withPhone = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.primary_email);
    const phone = outboundSafeText(row.primary_phone);
    if (email) ready += 1;
    if (phone) withPhone += 1;
    upsertOutboundLead(db, companyId, {
      lead_key: `lead_builder_real_estate:${campaignId}:${row.lead_id}`,
      source: "lead_builder",
      source_file: `lead_campaign:${CAMPAIGN_NAME}`,
      segment_key: "real_estate_agencies",
      segment_label: SEGMENT_LABEL,
      caen_code: "6831",
      caen_label: "Agentii imobiliare si administrarea imobilelor",
      cui: row.cui,
      registration_number: row.registration_number,
      company_name: outboundSafeText(row.commercial_name || row.legal_name),
      legal_form: "",
      status_firma: "",
      county: row.county,
      city: row.city,
      address: row.address,
      website: row.website,
      email,
      phone,
      facebook: row.facebook_url,
      google_business_url: row.google_maps_uri || row.source_url,
      contact_name: "",
      contact_status: email || phone || row.website ? "CONTACT_FOUND" : "CONTACT_NEEDED",
      outreach_status: email ? "READY" : "NOT_READY",
      notes: `Creat din Lead Builder imobiliare #${row.lead_id}.`,
      created_by: ACTOR_EMAIL
    });
    synced += 1;
  }
  return { scanned: rows.length, synced, ready, withPhone };
}

function outboundStats(companyId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(email,'')<>'' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN outreach_status='READY' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN outreach_status='EMAIL_SENT' THEN 1 ELSE 0 END) AS sent
    FROM emarqet_outbound_leads
    WHERE company_id=? AND segment_key='real_estate_agencies'
  `).get(companyId) || {};
}

async function main() {
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");

  process.env.GOOGLE_PLACES_ENABLED ??= process.env.GOOGLE_PLACES_API_KEY ? "true" : "";
  const maxResultsPerCity = Math.max(1, Math.min(100, Number(argValue("--max-results-per-city", "20")) || 20));
  const maxQueriesPerCity = Math.max(1, Math.min(20, Number(argValue("--max-queries-per-city", "5")) || 5));
  const radiusKm = Math.max(5, Math.min(80, Number(argValue("--radius-km", "25")) || 25));
  const maxJobs = Math.max(0, Number(argValue("--max-jobs", "0")) || 0);
  const syncLimit = Math.max(0, Number(argValue("--sync-limit", "0")) || 0);
  const sources = safeText(argValue("--sources"))
    ? safeText(argValue("--sources")).split(/[,;\s]+/).map(safeText).filter(Boolean)
    : (googlePlacesAvailable() ? ["google_places", "public_website", "openstreetmap"] : ["openstreetmap", "public_website"]);

  process.env.GOOGLE_PLACES_MAX_RESULTS_PER_JOB = String(maxResultsPerCity);
  process.env.GOOGLE_PLACES_MAX_QUERIES_PER_JOB = String(maxQueriesPerCity);
  ensureLeadBuilderSchema(db);
  ensureGooglePlacesSchema(db);
  ensureEmarqetOutboundSchema(db);
  seedLeadBuilderDefaults(db, companyId);

  const markets = selectedMarkets();
  if (!markets.length) throw new Error("Nu am gasit niciun judet pentru criteriul cerut.");
  const plannedSearches = markets.reduce((total, market) => total + market.cities.length, 0);
  const campaign = ensureNationalCampaign(companyId, plannedSearches * maxResultsPerCity);
  const jobs = [];
  let jobsRun = 0;
  for (const market of markets) {
    for (const city of market.cities) {
      if (maxJobs && jobsRun >= maxJobs) break;
      const search = upsertCitySearch(companyId, campaign.id, market, city, {
        radiusKm,
        maxResultsPerCity,
        sources
      });
      if (hasFlag("--no-run")) {
        jobs.push({ county: market.county, city, searchId: search.id, queued: false, skippedRun: true });
        continue;
      }
      const job = createLeadBuilderJob(db, companyId, search.id, "google_places_real_estate_national", ACTOR_EMAIL);
      const result = await runLeadBuilderJob(db, job.id, { maxGoogleResults: maxResultsPerCity });
      jobsRun += 1;
      jobs.push({ county: market.county, city, searchId: search.id, jobId: job.id, ...result });
      if (String(result.error || "").includes("google_places_daily_limit_reached")) break;
    }
    if (maxJobs && jobsRun >= maxJobs) break;
    if (jobs.some((job) => String(job.error || "").includes("google_places_daily_limit_reached"))) break;
  }

  const sync = syncCampaignToOutbound(companyId, campaign.id, syncLimit);
  const stats = campaignStats(companyId, campaign.id);
  const outbound = outboundStats(companyId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "utile", "rapoarte", "outreach", `emarqet-real-estate-national-lead-builder-report-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    companyId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    noRun: hasFlag("--no-run"),
    markets: markets.map((row) => row.county),
    sources,
    maxResultsPerCity,
    maxQueriesPerCity,
    radiusKm,
    maxJobs,
    jobsRun,
    jobs,
    sync,
    stats,
    outbound
  }, null, 2));
  console.log(JSON.stringify({
    ok: jobs.every((job) => job.ok !== false),
    reportPath,
    companyId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    noRun: hasFlag("--no-run"),
    searchedCounties: markets.length,
    jobsRun,
    sync,
    stats,
    outbound,
    jobs: jobs.slice(0, 20)
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(safeText(error?.message || error));
    process.exitCode = 1;
  })
  .finally(() => db.close());
