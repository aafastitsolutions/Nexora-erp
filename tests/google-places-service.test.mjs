import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureLeadBuilderSchema } from "../lib/lead-builder.js";
import {
  GooglePlacesService,
  autoParkFitScore,
  ensureGooglePlacesSchema,
  googlePlaceToLeadCandidate,
  upsertLeadGooglePlaceMatch
} from "../lib/google-places-service.js";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
`);
const companyId = Number(db.prepare("INSERT INTO companies (name, slug) VALUES ('Google Places Test', 'google-places-test')").run().lastInsertRowid);
ensureLeadBuilderSchema(db);
ensureGooglePlacesSchema(db);

const leadCompanyId = Number(db.prepare(`
  INSERT INTO lead_companies (
    company_id, commercial_name, category, country, county, city,
    verification_status, confidence_score, dedupe_hash
  ) VALUES (?, 'RusWagen', 'auto_dealers', 'Romania', 'Prahova', 'Ploiesti', 'neverificat', 0, 'ruswagen-test')
`).run(companyId).lastInsertRowid);
const leadId = Number(db.prepare(`
  INSERT INTO leads (
    company_id, lead_company_id, title, stage, status, priority, score, score_category, created_by_email
  ) VALUES (?, ?, 'RusWagen', 'nou', 'nou', 'medie', 0, 'necalificat', 'test')
`).run(companyId, leadCompanyId).lastInsertRowid);

const googlePlace = {
  id: "places-ruswagen-test",
  displayName: { text: "RusWagen Parc Auto" },
  formattedAddress: "Strada Test 1, Ploiesti, Prahova",
  addressComponents: [
    { longText: "Ploiesti", shortText: "Ploiesti", types: ["locality"] },
    { longText: "Prahova", shortText: "PH", types: ["administrative_area_level_1"] }
  ],
  location: { latitude: 44.94, longitude: 26.03 },
  primaryType: "car_dealer",
  types: ["car_dealer", "establishment"],
  nationalPhoneNumber: "0722 000 000",
  websiteUri: "https://ruswagen.example/",
  rating: 4.7,
  userRatingCount: 42,
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=ruswagen"
};

let requestCount = 0;
const service = new GooglePlacesService({
  db,
  companyId,
  enabled: true,
  apiKey: "test-google-key",
  fetchImpl: async (_url, options = {}) => {
    requestCount += 1;
    assert.equal(options.headers["X-Goog-Api-Key"], "test-google-key");
    assert.ok(String(options.headers["X-Goog-FieldMask"]).includes("places.id"));
    return new Response(JSON.stringify({ places: [googlePlace] }), { status: 200 });
  }
});

const places = await service.searchText("RusWagen Prahova", { pageSize: 1, includedType: "car_dealer" });
assert.equal(requestCount, 1);
assert.equal(places.length, 1);
assert.equal(places[0].id, "places-ruswagen-test");

const cached = await service.searchText("RusWagen Prahova", { pageSize: 1, includedType: "car_dealer" });
assert.equal(cached.length, 1);
assert.equal(requestCount, 1);

const match = service.matchLeadToPlace({
  commercial_name: "RusWagen",
  city: "Ploiesti",
  category: "auto_dealers"
}, googlePlace);
assert.ok(match.score >= 70);
assert.equal(match.status, "needs_review");

const candidate = googlePlaceToLeadCandidate(googlePlace, { category: "auto_dealers", county: "Prahova" }, { query: "parc auto Prahova" });
assert.equal(candidate.google_place_id, "places-ruswagen-test");
assert.ok(autoParkFitScore(candidate, "parc auto Prahova").score > 0);

const saved = upsertLeadGooglePlaceMatch(db, companyId, {
  leadId,
  leadCompanyId,
  place: googlePlace,
  score: 95,
  status: "confirmed",
  query: "RusWagen Prahova"
});
assert.equal(saved.ok, true);
const company = db.prepare("SELECT * FROM lead_companies WHERE id=?").get(leadCompanyId);
assert.equal(company.google_place_id, "places-ruswagen-test");
assert.equal(company.primary_phone, "+40722000000");
assert.equal(company.website, "https://ruswagen.example/");
assert.equal(db.prepare("SELECT COUNT(*) AS total FROM lead_field_provenance WHERE company_id=? AND lead_company_id=?").get(companyId, leadCompanyId).total > 0, true);

db.close();
console.log("google places service tests passed");
