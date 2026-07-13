# Lead Builder - implementation report

Data: 2026-07-13

## Ce am implementat

### Backend

- Modul nou `Lead Builder` in CRM, pe rutele `/nexora/lead-builder`.
- Serviciu central in `lib/lead-builder.js` pentru:
  - schema bazei de date;
  - surse/adaptoare;
  - cautari;
  - joburi;
  - deduplicare;
  - validare email/telefon/website;
  - scor automat;
  - Lead Intelligence;
  - drafturi de mesaje;
  - export;
  - import CSV;
  - sincronizare CRM.
- Rute Express in `routes/lead-builder-routes.js`.
- Script CLI in `scripts/run-lead-builder-job.mjs`.
- Script npm:
  - `npm run lead-builder:pilot:prahova`

### Frontend

- Pagini noi in `src/ui/nexora-lead-builder-pages.js`:
  - Dashboard;
  - Cautare noua;
  - Lista leaduri;
  - Fisa lead;
  - Surse;
  - Scoring.
- Modulul apare in meniul CRM ca `Lead Builder`.
- CRM tabs includ link spre `Lead Builder`.

### Baze de date

Tabele create automat prin `ensureLeadBuilderSchema()`:

- `lead_campaigns`
- `lead_searches`
- `lead_sources`
- `lead_source_configs`
- `lead_companies`
- `leads`
- `lead_contacts`
- `lead_emails`
- `lead_phones`
- `lead_addresses`
- `lead_social_profiles`
- `lead_websites`
- `lead_source_records`
- `lead_scores`
- `lead_score_configs`
- `lead_insights`
- `lead_tags`
- `lead_status_history`
- `lead_duplicates`
- `lead_activities`
- `lead_messages`
- `lead_exports`
- `lead_imports`
- `lead_jobs`
- `lead_job_logs`
- `lead_suppression_list`

Tabele CRM folosite prin relatie:

- `crm_leads`
- `crm_followups`
- `crm_opportunities`

### Surse

Surse seed-uite:

- OpenStreetMap / Overpass, activa;
- Site-uri publice ale firmelor, activa;
- Import manual CSV / Excel, activa pentru CSV text;
- Google Business Profile API, inactiva pana la cheie/API oficial;
- Facebook Pages API, inactiva pana la app/token permis;
- LinkedIn Company Pages, inactiva pana la acces permis.

### Validare

Implementat:

- email:
  - format;
  - clasificare rol: vanzari, marketing, office, contact, suport, contabilitate, personal public;
  - DNS/MX best-effort;
  - filtrare email personal free-mail necunoscut;
- telefon:
  - normalizare pentru Romania in `+40...`;
  - detectare mobil/fix unde este posibil;
  - pastrare original in `lead_phones`;
- website:
  - protocol allowlist HTTP/HTTPS;
  - blocare host intern/local;
  - DNS lookup si blocare IP privat;
  - timeout;
  - limita dimensiune pagina;
  - robots.txt;
  - status HTTP, HTTPS, redirect, parked-domain best-effort.

### Deduplicare

Implementat dupa:

- CUI;
- domeniu website;
- email;
- telefon;
- combinatie nume + oras;
- hash intern `dedupe_hash`.

Duplicatele nu creeaza automat companie noua; datele lipsa sunt completate unde este sigur.

### CRM

Leadurile pot fi sincronizate in CRM.

In pilotul public VPS, sincronizarea automata CRM a fost activa:

- 13 leaduri Lead Builder;
- 13 leaduri CRM create/legate;
- follow-up CRM creat pentru contactare manuala.

### AI / Lead Intelligence

Implementat:

- generator local factual, fara inventare;
- foloseste `LEAD_AI_API_KEY` sau `OPENAI_API_KEY` doar daca exista;
- daca API-ul lipseste sau esueaza, ramane fallback local marcat ca atare.

### Campanii

Implementat:

- campanii Lead Builder;
- cautari legate de campanie;
- status/pipeline intern;
- drafturi de mesaje;
- sincronizare in CRM.

Nu exista trimitere automata masiva. Mesajele sunt drafturi.

### Export

Implementat:

- CSV: `/nexora/lead-builder/leads/export.csv`
- JSON: `/nexora/lead-builder/leads/export.json`

Exporturile sunt logate in `lead_exports`.

### Import

Implementat:

- import CSV text din UI;
- mapare automata dupa headere uzuale:
  - `Company Name` / `Denumire companie`;
  - `Email Address` / `Email`;
  - `Phone` / `Telefon`;
  - `Website URL` / `Website`;
  - `County` / `Judet`;
  - `City` / `Oras`.

Importul trece prin deduplicare, scoring, drafturi si CRM sync.

## Ce functioneaza

- Modulul apare in meniul CRM.
- Ruta publica `/nexora/lead-builder` raspunde si redirectioneaza la login cand nu exista sesiune.
- Dashboard-ul Lead Builder se poate incarca dupa autentificare.
- Se poate crea o cautare noua.
- Se poate porni job de colectare.
- Joburile au status, progres, procesate, reusite, erori si loguri.
- OpenStreetMap/Overpass colecteaza date publice.
- Exista fallback Nominatim pentru timeouts punctuale.
- Website enrichment respecta limitele si protectiile implementate.
- Se salveaza sursa fiecarei informatii.
- Emailurile sunt validate si clasificate.
- Telefoanele sunt normalizate.
- Duplicatele sunt marcate.
- Scorul este calculat si configurabil in `Surse`.
- Lead Intelligence este generat local sau prin AI daca exista cheie.
- Mesajele sunt drafturi, nu trimiteri automate.
- Leadurile pot fi trimise in CRM.
- Export CSV/JSON functioneaza.
- Import CSV text functioneaza.
- Campania pilot `Dealeri auto Prahova - E-MARQET` a fost creata pe VPS.

## Ce nu functioneaza inca

- Import Excel/XLSX, XML si API nu sunt implementate in UI pentru Lead Builder.
- PDF report export nu este implementat inca.
- Google Business nu este activ pana nu exista API key si configurare Google Cloud.
- Facebook Pages nu este activ pana nu exista Meta app/token si permisiuni.
- LinkedIn nu este activ pana nu exista acces API permis.
- AI extern nu ruleaza fara `LEAD_AI_API_KEY` sau `OPENAI_API_KEY`; fallback local functioneaza.
- Numarul de rezultate depinde de acoperirea surselor publice. In pilotul VPS, sursa publica a returnat 13 leaduri, nu 500.
- Unele leaduri din OSM pot avea date incomplete si necesita verificare manuala.

## Campania pilot Prahova

Pe VPS:

- job: `completed`;
- procesate: 13;
- reusite: 13;
- erori: 0;
- duplicate: 0;
- sincronizate CRM: 13;
- cu email: 3;
- cu telefon: 4;
- cu website: 3;
- prioritare scor peste 60: 2.

Exemple gasite:

- Serus Auto Ploiesti;
- PEX Auto;
- Mercedes / Autoklass;
- KLP Autorulate;
- ProLeasing Motors;
- Toyota;
- Suzuki;
- Opel Dibas.

## Ce trebuie sa faci tu

### OpenStreetMap / Overpass

- Nu trebuie cont.
- Nu trebuie API key.
- Limita: sursa poate raspunde greu sau incomplet.
- Unde verifici: `Lead Builder -> Surse`, sursa `OpenStreetMap / Overpass`.
- Cum verifici: pornesti o cautare si verifici `Lead Builder -> Joburi recente`.

### Site-uri publice

- Nu trebuie cont.
- Nu trebuie API key.
- Trebuie pastrat un user-agent clar in `LEAD_USER_AGENT`.
- Limite: robots.txt poate bloca unele pagini; unele site-uri nu publica email.
- Unde verifici: fisa leadului, sectiunile emailuri, telefoane, website si surse.

### Google Business

- Trebuie cont Google Cloud.
- Trebuie API oficial relevant si billing activ.
- Trebuie respectati termenii Google.
- Cheia se introduce in `Lead Builder -> Surse`, dupa ce activam adaptorul complet.
- Costuri: conform Google Maps/Business pricing curent.

### Facebook Pages

- Trebuie Meta Developer App.
- Trebuie token pentru pagina si permisiuni aprobate.
- Nu folosim scraping, conturi false sau ocolire login.
- Costuri: de obicei fara cost direct API, dar depinde de Meta si permisiuni.

### LinkedIn

- Trebuie acces LinkedIn API permis pentru Company Pages.
- Nu se face scraping.
- Costuri/contract: depind de programul LinkedIn aprobat.

### AI

- Optional: `LEAD_AI_API_KEY`.
- Alternativ poate folosi `OPENAI_API_KEY`.
- Daca lipseste cheia, sistemul foloseste generator local factual.
- Costuri: costuri API pe token, daca se activeaza OpenAI.

## Variabile de mediu

Folosite efectiv:

```text
LEAD_BUILDER_ENABLED=true
LEAD_ENCRYPTION_KEY=
LEAD_AI_API_KEY=
LEAD_MAX_CONCURRENT_JOBS=1
LEAD_MAX_REQUESTS_PER_MINUTE=30
LEAD_USER_AGENT=NexoraLeadBuilder/1.0 (+https://nexora.aafastitsolutions.ro; public business discovery)
OPENAI_API_KEY=
OPENAI_MODEL=
```

Nu sunt folosite in implementarea curenta:

```text
LEAD_SEARCH_API_KEY=
LEAD_EMAIL_VALIDATION_API_KEY=
```

## Teste si comenzi

### Migrare / seed local

```bash
node scripts/run-lead-builder-job.mjs --pilot-prahova --no-run
```

### Test backend

```bash
node tests/lead-builder.test.mjs
```

### Test frontend / sintaxa UI

```bash
node --check src/ui/nexora-lead-builder-pages.js
```

### Test rute backend

```bash
node --check routes/lead-builder-routes.js
```

### Test serviciu Lead Builder

```bash
node --check lib/lead-builder.js
```

### Test job

```bash
node scripts/run-lead-builder-job.mjs --pilot-prahova --max-results 500
```

### Test import

```bash
node tests/lead-builder.test.mjs
```

Testul include import CSV.

### Test export

Dupa autentificare in Nexora:

```text
/nexora/lead-builder/leads/export.csv
/nexora/lead-builder/leads/export.json
```

### Test deduplicare

```bash
node tests/lead-builder.test.mjs
```

Testul include creare lead, CRM sync si import CSV care trece prin acelasi flux.

### Test campanie pilot pe VPS

```bash
ssh trevoro-vps "cd /home/server/Nexora && node scripts/run-lead-builder-job.mjs --pilot-prahova --max-results 500"
```

### Restart / deploy public

Restart canonic:

```bash
npm run nexora:restart-public
```

Deploy canonic:

```bash
npm run nexora:deploy-public
```

Verificare publica:

```bash
node scripts/check-nexora-public-origin.mjs
curl -I https://nexora.aafastitsolutions.ro/nexora/lead-builder
```

## Verificari rulate azi

Local:

```bash
node tests/lead-builder.test.mjs
node --check lib/lead-builder.js
node --check routes/lead-builder-routes.js
node --check src/ui/nexora-lead-builder-pages.js
node --check scripts/run-lead-builder-job.mjs
node --check server.js
```

Public VPS:

```bash
npm run nexora:deploy-public
ssh trevoro-vps "cd /home/server/Nexora && node --check lib/lead-builder.js && node --check routes/lead-builder-routes.js && node --check src/ui/nexora-lead-builder-pages.js && node --check scripts/run-lead-builder-job.mjs"
ssh trevoro-vps "cd /home/server/Nexora && node scripts/run-lead-builder-job.mjs --pilot-prahova --max-results 500"
node scripts/check-nexora-public-origin.mjs
curl -I https://nexora.aafastitsolutions.ro/nexora/lead-builder
```

Rezultat public:

- `/login`: 200 OK;
- `X-Nexora-Origin: nexora-vps-main`;
- `/nexora/lead-builder`: 302 catre `/login` fara sesiune, corect.
