# Google Places pentru Lead Builder si E-MARQET

Generat: 2026-07-13T11:53:27.811Z

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

- lib/google-places-service.js
- lib/lead-builder.js
- routes/lead-builder-routes.js
- src/ui/nexora-lead-builder-pages.js
- scripts/run-google-places-lead-builder.mjs
- .env.example
- package.json
- tests/google-places-service.test.mjs
- tests/lead-builder.test.mjs
- docs/google-places-lead-builder-report.md

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

- node --check lib/google-places-service.js
- node --check lib/lead-builder.js
- node --check routes/lead-builder-routes.js
- node --check src/ui/nexora-lead-builder-pages.js
- node --check scripts/run-google-places-lead-builder.mjs
- node --check scripts/match-google-place-ids-for-travel-leads.mjs
- node tests/google-places-service.test.mjs
- node tests/lead-builder.test.mjs
- RusWagen Prahova prin Google Places API (New)
- Campanie pilot Prahova max 50 leaduri, fara trimitere email
- Schema si dashboard Lead Builder dupa migrare

## 8. Rezultatul testului pentru RusWagen

- status: gasit
- nume: RusWagen
- localitate: Țânțăreni
- Google Place ID: ChIJoUway2tLskARew3jLokJxxs
- telefon: 0722 908 970
- website: https://ruswagen.ro/
- Google Maps: https://maps.google.com/?cid=2001579044191276411&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA
- website enrichment: ok, emailuri=2, telefoane=4

## 9. Cate leaduri au primit telefon

- Telefon principal in campanie: 49
- Telefon Google salvat: 31

## 10. Cate leaduri au primit website

- Website principal in campanie: 36
- Website Google salvat: 25

## 11. Cate emailuri au fost gasite ulterior pe website-uri

- Emailuri cu sursa public_website in campanie: 56

## 12. Numarul de cereri Google

- Cereri Google efectuate in aceasta rulare, fara cache: 0

## 13. Costul estimat

- Cost estimat local: 0.0000
- Estimarea foloseste variabila GOOGLE_PLACES_ESTIMATED_COST_PER_REQUEST; costul real ramane in Google Cloud Billing.

## 14. Erorile si limitarile

- Nu au fost inregistrate erori in raportul scriptului.
- Google Places nu furnizeaza email. Emailul este cautat ulterior pe website-ul oficial si sursa ramane pagina publica.
- Campurile telefon/website din Google pot declansa SKU-uri mai scumpe decat ID-only; de aceea folosim FieldMask si limite interne.
- Reprezentantele oficiale pot aparea in Google cu tip car_dealer; le penalizam, dar review-ul manual ramane necesar.

## 15. Ce trebuie sa fac eu

1. Creeaza preferabil o cheie API separata pentru Nexora/E-MARQET in acelasi proiect Google Cloud.
2. In Google Cloud Console mergi la APIs & Services -> Credentials -> Create credentials -> API key.
3. Restrictioneaza cheia la server/IP si la API-urile Places API si Places API (New).
4. Adauga IP-ul public al serverului Nexora la restrictiile de aplicatie ale cheii: IPv4 86.126.174.53 si IPv6 2a02:2f01:7c11:f900:da9e:f3ff:fe82:cf6b.
5. Pune cheia in environment ca GOOGLE_PLACES_API_KEY si seteaza GOOGLE_PLACES_ENABLED=true.
6. Verifica in Google Cloud ca billing este activ pentru proiect.
7. Seteaza buget si alerte in Billing -> Budgets & alerts.
8. Introdu cheia doar in .env/server environment, nu in frontend si nu in pagini Admin.
9. Dupa configurare ruleaza: npm run lead-builder:google-places -- --ruswagen --pilot-prahova
10. Pentru testul RusWagen ruleaza: npm run lead-builder:google-places -- --ruswagen --no-run
11. Rezultatele le vezi in docs/google-places-lead-builder-report.md si in Lead Builder -> Leaduri -> filtrele Google.
12. Pentru enrichment campanie: Lead Builder -> Aprobare mesaje -> Imbogateste cu Google, sau scriptul cu --pilot-prahova.
13. Pentru restart Nexora dupa deploy local: npm run nexora:restart-public.
