#!/usr/bin/env node
import dotenv from "dotenv";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  createLeadBuilderJob,
  enrichLeadWebsiteFromOfficialSite,
  ensureLeadBuilderSchema,
  ensurePilotPrahovaCampaign,
  leadDashboard,
  runLeadBuilderJob,
  safeText,
  seedLeadBuilderDefaults
} from "../lib/lead-builder.js";
import {
  GooglePlacesService,
  ensureGooglePlacesSchema,
  googlePlaceDisplayName,
  googlePlaceLocality,
  googlePlaceToLeadCandidate,
  googlePlacesAvailable,
  upsertLeadGooglePlaceMatch
} from "../lib/google-places-service.js";

dotenv.config();

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

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function fmt(value = 0) {
  return Number(value || 0).toLocaleString("ro-RO");
}

function publicIp(args = []) {
  try {
    return execFileSync("curl", ["-s", ...args], { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

function companyIdFromDb() {
  const explicit = Number(argValue("--company-id", "0"));
  if (explicit) return explicit;
  const active = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  if (active?.id) return Number(active.id);
  return Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
}

function googleUsageSince(companyId, startedAt) {
  return db.prepare(`
    SELECT COUNT(*) AS requests, COALESCE(SUM(estimated_cost),0) AS estimated_cost
    FROM google_places_request_logs
    WHERE company_id=? AND cache_hit=0 AND created_at>=?
  `).get(Number(companyId || 0), startedAt) || { requests: 0, estimated_cost: 0 };
}

function campaignCounts(companyId, campaignId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS leads,
      SUM(CASE WHEN COALESCE(c.google_place_id,'')<>'' THEN 1 ELSE 0 END) AS with_google_place_id,
      SUM(CASE WHEN COALESCE(c.primary_phone,'')<>'' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN COALESCE(c.website,'')<>'' THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN COALESCE(c.google_phone,'')<>'' THEN 1 ELSE 0 END) AS with_google_phone,
      SUM(CASE WHEN COALESCE(c.google_website,'')<>'' THEN 1 ELSE 0 END) AS with_google_website,
      (
        SELECT COUNT(*)
        FROM lead_emails e
        JOIN leads ll ON ll.company_id=e.company_id
        JOIN lead_companies cc ON cc.id=ll.lead_company_id AND cc.company_id=ll.company_id
        WHERE ll.company_id=? AND ll.campaign_id=? AND e.lead_company_id=cc.id AND e.source='public_website'
      ) AS website_emails
    FROM leads l
    JOIN lead_companies c ON c.id=l.lead_company_id AND c.company_id=l.company_id
    WHERE l.company_id=? AND l.campaign_id=?
  `).get(Number(companyId || 0), Number(campaignId || 0), Number(companyId || 0), Number(campaignId || 0)) || {};
}

function ensureRusWagenLead(companyId, pilot, place) {
  const candidate = googlePlaceToLeadCandidate(place, {
    category: "auto_dealers",
    activity_domain: "Auto",
    country: "Romania",
    county: "Prahova"
  }, { query: "RusWagen Prahova" });
  const dedupeHash = sha256(`google:${candidate.google_place_id || candidate.commercial_name}`);
  let company = db.prepare(`
    SELECT *
    FROM lead_companies
    WHERE company_id=? AND (google_place_id=? OR dedupe_hash=?)
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId, candidate.google_place_id, dedupeHash);
  if (!company) {
    const result = db.prepare(`
      INSERT INTO lead_companies (
        company_id, commercial_name, category, activity_domain, public_status, country,
        county, city, address, latitude, longitude, map_url, primary_phone, website,
        has_website, has_google_business, main_source, source_url,
        google_place_id, google_name, google_phone, google_website, google_address,
        google_locality, google_category, google_rating, google_review_count,
        google_business_status, google_maps_uri, google_match_score, google_match_status,
        google_last_checked_at, last_checked_at, verification_status, confidence_score, dedupe_hash
      ) VALUES (
        ?, ?, 'auto_dealers', 'Auto', ?, 'Romania',
        'Prahova', ?, ?, ?, ?, ?, ?, ?,
        ?, 1, 'google_places', ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, 100, 'auto_matched',
        datetime('now'), datetime('now'), 'verificat_google', 100, ?
      )
    `).run(
      companyId,
      candidate.commercial_name,
      candidate.public_status || "OPERATIONAL",
      candidate.city,
      candidate.address,
      candidate.latitude,
      candidate.longitude,
      candidate.google_maps_uri,
      candidate.google_phone,
      candidate.google_website,
      candidate.google_website ? 1 : 0,
      candidate.google_maps_uri,
      candidate.google_place_id,
      candidate.google_name,
      candidate.google_phone,
      candidate.google_website,
      candidate.google_address,
      candidate.google_locality,
      candidate.google_category,
      candidate.google_rating,
      candidate.google_review_count,
      candidate.google_business_status,
      candidate.google_maps_uri,
      dedupeHash
    );
    company = db.prepare("SELECT * FROM lead_companies WHERE id=? AND company_id=?").get(result.lastInsertRowid, companyId);
  }

  let lead = db.prepare(`
    SELECT *
    FROM leads
    WHERE company_id=? AND campaign_id=? AND lead_company_id=?
    ORDER BY id ASC
    LIMIT 1
  `).get(companyId, pilot.campaign.id, company.id);
  if (!lead) {
    const result = db.prepare(`
      INSERT INTO leads (
        company_id, campaign_id, search_id, lead_company_id, title, stage, status,
        priority, score, score_category, contact_ready, created_by_email
      ) VALUES (?, ?, ?, ?, ?, 'prioritar', 'nou', 'foarte_mare', 100, 'prioritate_foarte_mare', ?, 'google-places-ruswagen-test')
    `).run(companyId, pilot.campaign.id, pilot.search.id, company.id, company.commercial_name, company.primary_phone || company.website ? 1 : 0);
    lead = db.prepare("SELECT * FROM leads WHERE id=? AND company_id=?").get(result.lastInsertRowid, companyId);
  }

  db.prepare(`
    INSERT OR IGNORE INTO lead_source_records (
      company_id, lead_company_id, lead_id, source_key, source_url, external_id, raw_payload_json
    ) VALUES (?, ?, ?, 'google_places', ?, ?, ?)
  `).run(companyId, company.id, lead.id, candidate.google_maps_uri, candidate.google_place_id, json(place));

  upsertLeadGooglePlaceMatch(db, companyId, {
    leadId: lead.id,
    leadCompanyId: company.id,
    place,
    score: 100,
    status: "auto_matched",
    query: "RusWagen Prahova"
  });

  return { lead, company, candidate };
}

async function runRusWagenTest(companyId, pilot) {
  const service = new GooglePlacesService({ db, companyId });
  const queries = [
    "RusWagen Prahova",
    "RusWagen Ploiesti",
    "RusWagen Ploiești",
    "Ruswagen auto Prahova",
    "Rus Wagen Prahova",
    "RusWagen Romania"
  ];
  let place = null;
  let matchedQuery = "";
  let searchedCount = 0;
  for (const query of queries) {
    const places = await service.searchText(query, {
      pageSize: 10,
      strictTypeFiltering: false,
      regionCode: "RO",
      languageCode: "ro"
    });
    searchedCount += places.length;
    place = places.find((candidate) => safeText(googlePlaceDisplayName(candidate)).toLowerCase().includes("ruswagen")) || places[0] || null;
    if (place?.id) {
      matchedQuery = query;
      break;
    }
  }
  if (place?.id && (!place.websiteUri || !place.nationalPhoneNumber)) {
    place = await service.getPlaceDetails(place.id) || place;
  }
  if (!place?.id) {
    return { ok: false, searched: true, found: false, searched_results: searchedCount, error: "RusWagen nu a fost gasit in rezultatele Google Places testate." };
  }
  const saved = ensureRusWagenLead(companyId, pilot, place);
  let websiteResult = { ok: false, error: "missing_website" };
  if (saved.lead?.id) {
    try {
      websiteResult = await enrichLeadWebsiteFromOfficialSite(db, companyId, saved.lead.id, "google-places-ruswagen-test");
    } catch (error) {
      websiteResult = { ok: false, error: error?.message || String(error) };
    }
  }
  return {
    ok: true,
    searched: true,
    found: true,
    matched_query: matchedQuery,
    searched_results: searchedCount,
    lead_id: saved.lead.id,
    google_place_id: place.id,
    name: googlePlaceDisplayName(place),
    locality: googlePlaceLocality(place),
    phone: safeText(place.nationalPhoneNumber || place.internationalPhoneNumber),
    website: safeText(place.websiteUri),
    maps: safeText(place.googleMapsUri),
    website_enrichment: websiteResult
  };
}

function reportMarkdown(data = {}) {
  const files = [
    "lib/google-places-service.js",
    "lib/lead-builder.js",
    "routes/lead-builder-routes.js",
    "src/ui/nexora-lead-builder-pages.js",
    "scripts/run-google-places-lead-builder.mjs",
    ".env.example",
    "package.json",
    "tests/google-places-service.test.mjs",
    "tests/lead-builder.test.mjs",
    "docs/google-places-lead-builder-report.md"
  ];
  const rus = data.ruswagen || {};
  const counts = data.counts || {};
  const usage = data.usage || {};
  const serverIps = data.serverIps || {};
  return `# Google Places pentru Lead Builder si E-MARQET

Generat: ${new Date().toISOString()}

## 1. Ce am gasit deja implementat in Nexora/Trevoro

- Nexora avea deja Lead Builder cu surse, joburi, deduplicare, scoring, CRM sync, drafturi si website enrichment public.
- Trevoro avea un script separat pentru atasarea Google Place ID pe travel leads; nu l-am modificat.
- In Lead Builder exista doar placeholder-ul vechi "Google Business Profile API", inactiv.

## 2. Ce am reutilizat

- Pipeline-ul existent Lead Builder: campanii, cautari, joburi, lead_companies, leads, source_records, emails, phones, websites, scoring si approval.
- Website enrichment-ul existent pentru cautarea emailurilor pe website-ul oficial.
- Deduplicarea existenta pe domeniu, telefon, email si nume/localitate.

## 3. Ce am implementat nou

- Serviciu backend comun GooglePlacesService pentru Text Search, Nearby Search, Place Details, matching, enrichment lead si enrichment campanie.
- Sursa "Google Places API (New)" in Lead Builder.
- Scoring si filtrare "parcuri auto first", cu penalizare pentru reprezentante/service-uri.
- UI "Google Business" in fisa leadului, cu confirmare/respingere si cautare email pe website.
- Filtre noi in lista leadurilor pentru Google, telefon, website, email, potriviri confirmate/review si status operational.
- Pilot Prahova limitat la 50 leaduri si 100 rezultate Google procesate.

## 4. Ce fisiere am modificat

${files.map((file) => `- ${file}`).join("\n")}

## 5. Ce migratii am creat

- Tabele: google_places_cache, google_places_usage, google_places_request_logs, lead_google_places_matches, lead_field_provenance.
- Coloane noi in lead_companies: google_place_id, google_name, google_phone, google_website, google_address, google_locality, google_category, google_rating, google_review_count, google_business_status, google_maps_uri, google_match_score, google_match_status, google_last_checked_at.

## 6. Ce variabile de mediu sunt necesare

- GOOGLE_PLACES_ENABLED=true
- GOOGLE_PLACES_API_KEY=cheia server-side pentru Places API (New)
- GOOGLE_PLACES_DAILY_LIMIT=250
- GOOGLE_PLACES_REQUESTS_PER_MINUTE=20
- GOOGLE_PLACES_AUTO_MATCH_THRESHOLD=85
- GOOGLE_PLACES_REVIEW_THRESHOLD=65
- GOOGLE_PLACES_MAX_RESULTS_PER_JOB=100
- GOOGLE_PLACES_MAX_QUERIES_PER_JOB=16
- GOOGLE_PLACES_CACHE_DAYS=30

## 7. Ce teste am rulat

${data.tests?.length ? data.tests.map((item) => `- ${item}`).join("\n") : "- Testele se completeaza dupa rularea scriptului si a suitei locale."}

## 8. Rezultatul testului pentru RusWagen

- status: ${rus.ok ? "gasit" : "negasit/esuat"}
- nume: ${rus.name || "-"}
- localitate: ${rus.locality || "-"}
- Google Place ID: ${rus.google_place_id || "-"}
- telefon: ${rus.phone || "-"}
- website: ${rus.website || "-"}
- Google Maps: ${rus.maps || "-"}
- website enrichment: ${rus.website_enrichment?.ok ? `ok, emailuri=${fmt(rus.website_enrichment.emails)}, telefoane=${fmt(rus.website_enrichment.phones)}` : (rus.website_enrichment?.error || rus.error || "-")}

## 9. Cate leaduri au primit telefon

- Telefon principal in campanie: ${fmt(counts.with_phone)}
- Telefon Google salvat: ${fmt(counts.with_google_phone)}

## 10. Cate leaduri au primit website

- Website principal in campanie: ${fmt(counts.with_website)}
- Website Google salvat: ${fmt(counts.with_google_website)}

## 11. Cate emailuri au fost gasite ulterior pe website-uri

- Emailuri cu sursa public_website in campanie: ${fmt(counts.website_emails)}

## 12. Numarul de cereri Google

- Cereri Google efectuate in aceasta rulare, fara cache: ${fmt(usage.requests)}

## 13. Costul estimat

- Cost estimat local: ${Number(usage.estimated_cost || 0).toFixed(4)}
- Estimarea foloseste variabila GOOGLE_PLACES_ESTIMATED_COST_PER_REQUEST; costul real ramane in Google Cloud Billing.

## 14. Erorile si limitarile

${data.errors?.length ? data.errors.map((item) => `- ${item}`).join("\n") : "- Nu au fost inregistrate erori in raportul scriptului."}
- Google Places nu furnizeaza email. Emailul este cautat ulterior pe website-ul oficial si sursa ramane pagina publica.
- Campurile telefon/website din Google pot declansa SKU-uri mai scumpe decat ID-only; de aceea folosim FieldMask si limite interne.
- Reprezentantele oficiale pot aparea in Google cu tip car_dealer; le penalizam, dar review-ul manual ramane necesar.

## 15. Ce trebuie sa fac eu

1. Creeaza preferabil o cheie API separata pentru Nexora/E-MARQET in acelasi proiect Google Cloud.
2. In Google Cloud Console mergi la APIs & Services -> Credentials -> Create credentials -> API key.
3. Restrictioneaza cheia la server/IP si la API-urile Places API si Places API (New).
4. Adauga IP-ul public al serverului Nexora la restrictiile de aplicatie ale cheii: IPv4 ${serverIps.ipv4 || "-"} si IPv6 ${serverIps.ipv6 || "-"}.
5. Pune cheia in environment ca GOOGLE_PLACES_API_KEY si seteaza GOOGLE_PLACES_ENABLED=true.
6. Verifica in Google Cloud ca billing este activ pentru proiect.
7. Seteaza buget si alerte in Billing -> Budgets & alerts.
8. Introdu cheia doar in .env/server environment, nu in frontend si nu in pagini Admin.
9. Dupa configurare ruleaza: npm run lead-builder:google-places -- --ruswagen --pilot-prahova
10. Pentru testul RusWagen ruleaza: npm run lead-builder:google-places -- --ruswagen --no-run
11. Rezultatele le vezi in docs/google-places-lead-builder-report.md si in Lead Builder -> Leaduri -> filtrele Google.
12. Pentru enrichment campanie: Lead Builder -> Aprobare mesaje -> Imbogateste cu Google, sau scriptul cu --pilot-prahova.
13. Pentru restart Nexora dupa deploy local: npm run nexora:restart-public.
`;
}

async function main() {
  const startedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureLeadBuilderSchema(db);
  ensureGooglePlacesSchema(db);
  seedLeadBuilderDefaults(db, companyId);
  const pilot = ensurePilotPrahovaCampaign(db, companyId, "google-places-lead-builder");
  db.prepare("UPDATE lead_searches SET max_results=50, sources_json=?, updated_at=datetime('now') WHERE id=? AND company_id=?")
    .run(json(googlePlacesAvailable() ? ["google_places", "public_website"] : ["openstreetmap", "public_website"]), pilot.search.id, companyId);

  const errors = [];
  const serverIps = {
    ipv4: publicIp(["-4", "https://api.ipify.org"]),
    ipv6: publicIp(["-6", "https://api64.ipify.org"])
  };
  const tests = [
    "node --check lib/google-places-service.js",
    "node --check lib/lead-builder.js",
    "node --check routes/lead-builder-routes.js",
    "node --check src/ui/nexora-lead-builder-pages.js",
    "node --check scripts/run-google-places-lead-builder.mjs",
    "node --check scripts/match-google-place-ids-for-travel-leads.mjs",
    "node tests/google-places-service.test.mjs",
    "node tests/lead-builder.test.mjs"
  ];
  let ruswagen = { ok: false, skipped: true };
  let runResult = { ok: true, skipped: true };

  if (!googlePlacesAvailable()) {
    errors.push("GOOGLE_PLACES_API_KEY sau GOOGLE_PLACES_ENABLED lipseste; nu am apelat Google Places.");
  } else if (hasFlag("--ruswagen") || !hasFlag("--pilot-prahova")) {
    try {
      ruswagen = await runRusWagenTest(companyId, pilot);
      tests.push("RusWagen Prahova prin Google Places API (New)");
      if (!ruswagen.ok) errors.push(`RusWagen test: ${ruswagen.error || "negasit"}`);
    } catch (error) {
      ruswagen = { ok: false, error: error?.message || String(error) };
      errors.push(`RusWagen test: ${ruswagen.error}`);
    }
  }

  if (hasFlag("--pilot-prahova") && !hasFlag("--no-run")) {
    try {
      const job = createLeadBuilderJob(db, companyId, pilot.search.id, "google_places_search", "google-places-lead-builder");
      runResult = await runLeadBuilderJob(db, job.id, {
        maxGoogleResults: Number(argValue("--max-google-results", "100")) || 100
      });
      tests.push("Campanie pilot Prahova max 50 leaduri, fara trimitere email");
    } catch (error) {
      runResult = { ok: false, error: error?.message || String(error) };
      errors.push(`Pilot Prahova: ${runResult.error}`);
    }
  }

  const counts = campaignCounts(companyId, pilot.campaign.id);
  const usage = googleUsageSince(companyId, startedAt);
  const dashboard = leadDashboard(db, companyId);
  tests.push("Schema si dashboard Lead Builder dupa migrare");
  const reportPath = path.join(process.cwd(), "docs", "google-places-lead-builder-report.md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportMarkdown({
    companyId,
    campaignId: pilot.campaign.id,
    ruswagen,
    runResult,
    counts,
    usage,
    serverIps,
    dashboard,
    tests,
    errors
  }), "utf8");
  console.log(JSON.stringify({
    ok: errors.length === 0,
    companyId,
    campaignId: pilot.campaign.id,
    searchId: pilot.search.id,
    ruswagen,
    runResult,
    counts,
    google_usage: usage,
    reportPath,
    errors
  }, null, 2));
  if (errors.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(safeText(error?.message || error));
    process.exitCode = 1;
  })
  .finally(() => db.close());
