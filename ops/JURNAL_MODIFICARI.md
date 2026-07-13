# Jurnal Modificari MiniCRM

## 2026-07-07 - e-Marqet: pachet postari Facebook launch

### Ce s-a schimbat
- A fost adaugat scriptul `scripts/create-emarqet-social-launch-pack.mjs`.
- Scriptul genereaza 5 imagini PNG pentru campania e-Marqet in `public/uploads/emarqet/social/launch-2026-07-07/`, folosind fundaluri tematice cu telefoane, masini, joburi/listari, electrocasnice, imobiliare si servicii.
- Fundalurile tematice sunt salvate in `public/uploads/emarqet/social/launch-2026-07-07/themes/`.
- Au fost create 10 postari pregatite in `emarqet_social_posts`: 5 pentru pagina Facebook si 5 pentru distribuire manuala in grupuri.
- Postarile includ texte separate pentru pagina si grupuri, linkuri UTM si atasamente media.
- Modulul Social Distribution afiseaza acum buton `Imagine` pentru postarile pregatite si pentru coada de publicare.
- Publicarea automata pe Facebook Page foloseste endpoint-ul de poze cand postarea are `media_url`; grupurile raman manuale, prin butonul `Pregateste manual`.

### Comenzi
- Generare pachet: `npm run emarqet:social:launch-pack`
- Raport postari: `utile/social-media/emarqet/emarqet-launch-pack-2026-07-07.md`

### Verificare
- `node --check scripts/create-emarqet-social-launch-pack.mjs`
- `node --check lib/emarqet-social-distribution.js`
- `node --check src/ui/nexora-emarqet-pages.js`
- `npm run emarqet:social:launch-pack`

## 2026-07-07 - e-Marqet: campanie referral Facebook

### Ce s-a schimbat
- A fost adaugata campania `Pune-l pe e-Marqet. Da-l mai departe.`
- Utilizatorii cu anunturi publicate primesc butonul `Da-l mai departe` in contul e-Marqet.
- Pagina de share genereaza link referral cu UTM, text gata de copiat si buton pentru Facebook Share.
- Sistemul inregistreaza share-uri si clickuri unice pe linkul referral.
- La 3 clickuri unice, anuntul primeste automat promovare gratuita 7 zile prin `promotion_level='referral_boost'`.
- Au fost adaugate tabelele `emarqet_referral_events` si `emarqet_referral_rewards`, plus campuri referral pe `emarqet_users` si `emarqet_listings`.

### Verificare
- `node --check lib/emarqet-referral-campaign.js`
- `node --check routes/emarqet-public-routes.js`
- `node --check src/ui/emarqet-public-pages.js`
- Proba DB: schema referral a creat tabelele si coloanele necesare.

## 2026-07-07 - e-Marqet enrichment si EU Opportunity Finder

### Ce s-a schimbat
- A fost adaugat scriptul `scripts/enrich-emarqet-outbound-contacts.mjs` pentru imbogatirea contactelor e-Marqet in loturi mici, cu dry-run implicit si salvare doar cu `--save`.
- Scriptul cauta site oficial, Facebook/Google Business si emailuri business publice, apoi marcheaza `READY` doar contactele cu email generic curat.
- Modulul existent de oportunitati achizitii a fost extins in `EU Opportunity Finder`, fara integrare SEAP/SICAP in fluxul nou.
- Au fost adaugate surse configurabile in DB si seed initial din `config/eu-opportunity-sources.json` pentru PNRR, ADR, Interreg, CORDIS, Horizon, EIT, universitati si beneficiari privati.
- Oportunitatile primesc tara, program, descriere, documente, keyword-uri detectate, scor de relevanta 0-100, status de analiza si legatura optionala catre lead CRM.
- Documentele publice PDF/DOC/DOCX/XLS/XLSX sunt descarcate best-effort in `data/procurement/eu-documents/`, hash-uite si folosite la filtrare/scor cand textul poate fi extras.
- Pagina `/nexora/procurement/opportunities` afiseaza acum `EU Opportunity Finder`, filtre noi, documente, actiuni de status si buton `Creeaza lead`.
- Dashboard-ul principal Nexora afiseaza notificari pentru oportunitatile EU noi cu scor peste 70.
- A fost adaugat jobul CLI `npm run procurement:sync:eu` si unit-uri systemd pregatite pentru sincronizare zilnica.

### Comenzi
- Enrichment e-Marqet dry-run: `npm run emarqet:enrich:contacts -- --segment auto_dealers --county Prahova --limit 50`
- Enrichment cu salvare: `npm run emarqet:enrich:contacts -- --segment auto_dealers --county Prahova --limit 50 --save`
- EU Opportunity Finder manual: `npm run procurement:sync:eu -- --limit 40`
- EU Opportunity Finder cron/due: `npm run procurement:sync:eu -- --due-only --limit 40`

### Verificare
- `node --check lib/procurement-opportunities.js`
- `node --check routes/procurement-routes.js`
- `node --check src/ui/nexora-procurement-pages.js`
- `node --check routes/dashboard-routes.js`
- `node --check src/ui/nexora-dashboard-page.js`
- `node --check scripts/enrich-emarqet-outbound-contacts.mjs`
- `node --check scripts/sync-eu-opportunity-finder.mjs`

## 2026-07-03 - Nexora Travel: reminder fondatori si pregatire Facebook

### Ce s-a schimbat
- A fost trimis un email punctual catre proprietatile fondatoare fara poze sau preturi, pentru completarea listarii in vederea promovarii pe site si social media.
- Emailul mentioneaza explicit ca proprietatile sunt membri fondatori si nu au nimic de platit catre Trevoro.
- Jobul general de email/outreach ramane pe pauza prin `utile/flags/trevoro-email-sending-paused`; trimiterea de azi a folosit doar aprobarea punctuala `--allow-while-paused`.
- Au fost pregatite 4 postari Facebook profesioniste pentru proprietati cu poze reale, link Trevoro cu UTM si text de rezervare.
- Postarile au ramas in status `manual_required`, deoarece pe VPS contul Facebook nu are inca Page Access Token valid.
- Contul Facebook din Nexora a fost aliniat la pagina Trevoro `1164872880043948`, iar fallback-ul vechi `61590311832249` a fost eliminat din cod.
- A fost adaugata sectiunea `Grupuri Social` in Nexora Travel, cu registru pentru grupuri Facebook relevante, formular de adaugare, editare pe fiecare rand, status join, reguli, promovare permisa, rezultat si export CSV.
- Au fost seed-uite 16 intrari initiale pentru cautari/grupuri RO si internationale: cazare Romania, vacante Romania, cabane, munte, litoral, Travel Europe, Visit Romania, IT/FR/DE.

### Verificare
- `node --check routes/travel-routes.js` - OK.
- `node --check scripts/seed-trevoro-social-groups.mjs` - OK.
- `npm run nexora:deploy-public` - OK.
- VPS: `travel_social_groups` are 16 intrari pentru compania 1.
- VPS: contul Facebook este `Trevoro`, `page_id=1164872880043948`, `status=setup_required`, `token_len=0`.
- VPS: cele 4 joburi Facebook noi sunt `manual_required`, deci nu au fost publicate automat fara token.
- Public origin check: `/login` raspunde 200 cu `x-nexora-origin: nexora-vps-main`.

## 2026-07-03 - Nexora Travel: SMTP reply Inbox Support reparat

### Ce s-a schimbat
- Configurarea SMTP existenta din `/home/server/Nexora/.env` a fost sincronizata in `/home/server/.config/nexora/runtime.env`, fisierul citit de `nexora.service` pe VPS.
- `Inbox Support` poate trimite raspunsuri manuale chiar daca joburile/campaniile email Trevoro sunt puse pe pauza.
- Fișierul de pauza `utile/flags/trevoro-email-sending-paused` ramane activ pentru campanii si trimiteri automate, deci oprirea outreach-ului nu a fost anulata.

### Verificare
- `node --check lib/bootstrap.js` - OK.
- `node --check routes/travel-routes.js` - OK.
- `npm run nexora:deploy-public` - OK.
- SMTP live pe VPS: configurat cu `mail.zooku.ro`, utilizator `contact@trevoro.ro`, `transporter.verify()` - OK.
- `nexora.service` este activ si ruta publica `/login` raspunde 200 cu `x-nexora-origin: nexora-vps-main`.

## 2026-07-02 - Nexora Travel: analiza mutata in primul ecran

### Ce s-a schimbat
- Sectiunea `Analiza operationala Trevoro` a fost mutata la inceputul dashboard-ului Travel.
- KPI-urile si graficele apar acum in primul ecran, inaintea controlului pentru jobul de email.
- Bannerul vechi `Trafic Trevoro.ro` a fost scos din partea de sus pentru a evita confuzia cu vechiul dashboard.
- Controlul jobului de email ramane disponibil in aceeasi pagina, dar sub analiza operationala.
- Pentru `/nexora/travel/*` au fost adaugate headere `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` si `Surrogate-Control: no-store`, ca dashboardurile autentificate sa nu ramana blocate in HTML vechi.
- Dashboard-ul trimite headerul `X-Nexora-Travel-Dashboard: analytics-v20260702-1848` pentru verificare rapida a versiunii livrate.

### Verificare
- `node --check src/ui/nexora-travel-pages.js` - OK.
- `node --check routes/travel-routes.js` - OK.
- `npm run nexora:restart-public` - OK.
- Public origin check:
  - `https://nexora.aafastitsolutions.ro/login` raspunde 200;
  - `x-nexora-origin: nexora-vps-main`;
  - pagina publica este login-ul Nexora.

## 2026-07-02 - Nexora Travel: dashboard analitic Trevoro

### Ce s-a schimbat
- Dashboard-ul `Nexora Travel` nu mai afiseaza sectiunea de ultime lead-uri.
- A fost transformat intr-un panou de analiza operationala cu:
  - KPI-uri pentru lead-uri totale, contactate si active;
  - trafic Trevoro pe 30 zile si grafic pe ultimele 14 zile;
  - status plati abonamente proprietari: total, platite, pending, esuate si anulate;
  - suma incasata pe monede pentru platile confirmate;
  - postari Facebook: total, publicate, ready, draft si manual/coada;
  - trafic Meta/Facebook catre Trevoro;
  - emailuri trimise pe zone, cu esecuri, bounce-uri si raspunsuri;
  - top surse trafic si top pagini Trevoro.
- A fost adaugat exportul:
  - `/nexora/travel/dashboard/export.csv`;
  - exporta lead-uri agregate, trafic, plati, Facebook si emailuri pe zone.

### Observatii de date
- Platile sunt calculate doar pentru companiile de billing legate de proprietatile Trevoro prin `travel_properties.billing_company_id`.
- Traficul Facebook este calculat din `travel_site_pageviews`, pe surse/referrere Meta, Facebook sau Instagram.
- Emailurile pe zone folosesc tara pentru international, iar pentru Romania folosesc judet/oras cand exista.

### Verificare si deploy
- `node --check routes/travel-routes.js` - OK.
- `node --check src/ui/nexora-travel-pages.js` - OK.
- SQL-ul pentru trafic, plati, social si emailuri pe zone a fost executat pe baza live fara erori.
- `npm run nexora:restart-public` - OK.
- Verificare publica Nexora:
  - `https://nexora.aafastitsolutions.ro/login` raspunde 200;
  - header-ul `x-nexora-origin` confirma `nexora-vps-main`;
  - pagina publica este login-ul Nexora.

## 2026-07-02 - Trevoro: verificare factura si email dupa plata Stripe proprietar

### Ce s-a verificat
- Fluxul Stripe pentru abonamentul proprietarului trece prin `routes/billing-routes.js` la evenimentele:
  - `checkout.session.completed`;
  - `invoice.paid`.
- Pentru platile Stripe cu status `paid`, Nexora:
  - actualizeaza abonamentul companiei la `active`;
  - reactiveaza proprietatile legate de `billing_company_id`;
  - genereaza factura prin `maybeGenerateBillingInvoice`;
  - incearca trimiterea in e-Factura prin `maybeSendBillingInvoiceToEfactura`;
  - genereaza PDF prin `maybeGenerateBillingInvoicePdf`;
  - trimite emailul de factura prin `maybeEmailBillingInvoice`.
- Setarile live de pe VPS confirma:
  - `BILLING_AUTO_INVOICE_ENABLED=true`;
  - `BILLING_AUTO_INVOICE_EMAIL_ENABLED=true`;
  - `BILLING_AUTO_EFACTURA_ENABLED=true`;
  - `EFACTURA_ENVIRONMENT=prod`;
  - `EFACTURA_PRODUCTION_ENABLED=true`;
  - `APP_URL=https://nexora.aafastitsolutions.ro`;
  - Stripe live si webhook secret sunt configurate.

### Rezultat
- In baza live exista o sesiune Stripe creata pentru proprietar, dar nu exista inca eveniment de plata finalizata pentru ea; de aceea nu exista factura reala generata pentru acea sesiune.
- A fost rulata o simulare pe copie temporara a bazei, fara modificari in baza live si fara trimitere email real:
  - factura creata cu status `INCASATA`;
  - PDF generat si atasat in emailul construit;
  - emailul de factura are destinatarul proprietarului platitor si CC catre `contact@trevoro.ro`;
  - fisierul PDF de test a fost sters dupa verificare.
- Validari rulate:
  - `node --check routes/billing-routes.js`;
  - `node --check lib/billing-invoices.js`;
  - `node --check lib/billing-invoice-pdf.js`;
  - `node --check lib/billing-invoice-email.js`.

### Regula de lucru
- Orice schimbare pe Stripe, abonamente proprietari, facturare, e-Factura sau emailuri de factura trebuie verificata pe flux complet si consemnata in jurnal.
- Verificarea minima trebuie sa acopere: eveniment Stripe platit, `billing_payments.generated_factura_id`, factura in `facturi`, PDF, email catre proprietar si setarile relevante din env.

## 2026-06-18 - Trevoro: international owner billing EUR/RON si Stripe fiscal

### Ce s-a schimbat
- Pagina publica `https://www.trevoro.ro/en/owners` este acum verificata ca experienta EN: topbar, footer, formular si planuri de publicare.
- Middleware-ul Trevoro seteaza automat `trevoro_language=en` pentru rutele `/en/*`, ca prima incarcare sa nu mai afiseze topbar/footer in romana.
- Planurile internationale de proprietar sunt salvate in Nexora pe `monthly_price_amount` si `monthly_price_currency`, nu doar pe `monthly_price_ron`.
- Inscrierile din `trevoro_site_en` sau din tari diferite de Romania intra pe `payment_required`, cu plan EUR pe tip de proprietate:
  - Apartment / Studio / Room: 19 EUR/month;
  - Villa / Holiday Home / Cabin / Bungalow: 29 EUR/month;
  - Guesthouse / B&B / Hostel / Small Pension: 39 EUR/month;
  - Hotel / Aparthotel / Resort: 59 EUR/month;
  - Multiple properties / Property manager: 119 EUR/month.
- Stripe Checkout pentru abonamentul proprietarului foloseste moneda planului, colecteaza adresa de facturare si permite colectarea VAT/Tax ID.
- Facturarea automata Nexora pastreaza tara clientului si codurile fiscale internationale cu prefixul de tara.
- Webhook-ul Stripe nu mai rescrie abonamentele EUR cu fallback-ul vechi `129 RON`.

### Verificare si deploy
- Trevoro:
  - `npm run lint -- --no-cache` - OK, doar warning-uri vechi in `src/lib/sample-data.ts`;
  - `npm run build` - OK;
  - `npm run deploy:vps` - OK;
  - `/en/owners` raspunde 200, seteaza cookie `trevoro_language=en` si nu mai afiseaza textele RO verificate in topbar/footer.
- Nexora:
  - backup VPS rulat inainte de publicare;
  - sincronizate tintit: `db.js`, `routes/travel-routes.js`, `routes/billing-routes.js`, `lib/billing-invoices.js`, `lib/billing-invoice-pdf.js`;
  - `node --check` pe fisierele publicate - OK;
  - migrarea VPS confirma coloanele `companies.country`, `clients.country`, `travel_properties.monthly_price_amount`, `travel_properties.monthly_price_currency`;
  - `nexora.service`, `trevoro-site.service` si `cloudflared-trevoro.service` sunt active.

### Stripe observat
- Cont Stripe live: tara RO, moneda implicita RON, `charges_enabled=true`, `payouts_enabled=true`.
- Nexora VPS are `STRIPE_SECRET_KEY` si `STRIPE_WEBHOOK_SECRET` configurate.
- Nu exista produse/preturi Stripe persistente; checkout-ul creeaza price data dinamic.
- Nu exista tax IDs configurate la nivel de cont Stripe in API (`tax_ids=[]`).
- API-ul folosit nu are permisiune pentru citirea conturilor bancare externe; conturile RON/EUR trebuie verificate/adaugate din Stripe Dashboard > Payout settings.

### Pas urmator
- In Stripe Dashboard, adaugare/verificare conturi de payout RON si EUR.
- In Stripe Dashboard > Billing invoice settings > Tax, adaugare cod TVA/cod fiscal al A&A FAST IT SOLUTIONS S.R.L. ca tax ID implicit pentru facturile Stripe.
- Confirmare cu contabilul pentru tratamentul TVA international: B2B UE cu VAT valid, B2C UE/OSS, non-UE si obligatiile e-Factura.

## 2026-06-18 - Trevoro: mesaj international paid listing si job email pentru 2026-06-19

### Ce s-a schimbat
- Mesajul international de outreach Trevoro a fost schimbat pe model paid listing:
  - contul de proprietar se poate crea gratuit;
  - publicarea proprietatii se face pe abonament lunar, in functie de tipul proprietatii;
  - Trevoro nu incaseaza comision din rezervari si nu gestioneaza platile turist-proprietar.
- Planurile propuse in email:
  - Apartment / Studio / Room: 19 EUR / month;
  - Villa / Holiday Home / Cabin / Bungalow: 29 EUR / month;
  - Guesthouse / B&B / Hostel / Small Pension: 39 EUR / month;
  - Hotel / Aparthotel / Resort: 59 EUR / month;
  - Multiple properties / Property manager: 119 EUR / month.
- Emailul mentioneaza explicit ca proprietarii au instructiuni in cont pentru:
  - completarea listarii;
  - adaugarea pozelor;
  - setarea preturilor si disponibilitatii;
  - sincronizarea calendarelor externe prin iCal/ICS, inclusiv Booking.com, Airbnb si Google Calendar.
- Mesajul este semnat generic `The Trevoro Team`, fara nume personal.
- A fost eliminata din sender varianta veche internationala cu `30 EUR/month`, ca sa nu mai existe ambiguitate.
- Sursele `official_portugal_rnt` si `official_france_atout_france` sunt incluse in lista de surse pentru outreach/prospecting.
- A fost adaugat indexul `idx_travel_email_messages_direction_email_norm` pentru selectie mai rapida si deduplicare dupa email.

### Job pregatit pentru maine
- Fisiere pregatite:
  - `ops/hetzner/trevoro-international-paid-outreach.service`;
  - `ops/hetzner/trevoro-international-paid-outreach.timer`.
- Unit-urile au fost copiate si in `/etc/systemd/system/` pe VPS.
- Programare propusa: 2026-06-19, ora 09:30 Europe/Bucharest.
- Primul lot propus: Portugalia, sursa `official_portugal_rnt`, maxim 80 emailuri.
- Pauza intre trimiteri: 45 secunde.
- Jobul foloseste `--stop-on-throttle`, deci se opreste daca providerul SMTP raporteaza limitare/quota.
- Timerul este `disabled` si `inactive`; jobul nu a fost activat pana la confirmarea textului final.

### Verificare
- `node --check scripts/send-trevoro-outreach-emails.mjs` a trecut local si pe VPS.
- `systemd-analyze verify` a trecut pentru service si timer.
- `systemd-analyze calendar '2026-06-19 09:30:00 Europe/Bucharest'` normalizeaza corect la 2026-06-19 06:30 UTC.
- Dry-run pe VPS pentru Portugalia:
  - report: `/home/server/Nexora/utile/rapoarte/outreach/trevoro-outreach-email-report-2026-06-18T15-42-19-734Z.json`;
  - attempted: 3;
  - sent: 0;
  - failed: 0;
  - claim URL: `https://www.trevoro.ro/en/owners#form`.

### Pas urmator
- Confirmare text final de email.
- Dupa confirmare, se activeaza timerul pe VPS sau se ruleaza manual primul lot controlat.
- Dupa primul lot, verificam bounces/replies in Nexora inainte sa marim volumul.

## 2026-06-18 - Trevoro: import masiv lead-uri internationale

### Ce s-a schimbat
- Au fost adaugate importatoare noi pentru surse oficiale:
  - `scripts/import-france-atout-accommodations.mjs`;
  - `scripts/import-portugal-rnt-accommodations.mjs`;
  - `scripts/run-trevoro-osm-country-imports.mjs`.
- Importatorul OSM extins ramane disponibil pentru toate tarile Trevoro.
- Importurile au fost rulate pe VPS, in baza de productie Nexora.

### Importuri efectuate
- Franta / Atout France:
  - 20.856 randuri oficiale citite;
  - 20.614 lead-uri noi create;
  - 20.436 lead-uri noi cu website;
  - raport: `/home/server/Nexora/utile/rapoarte/importuri/france-atout-accommodations-import-report-2026-06-18T14-10-42-070Z.json`.
- Portugalia / Turismo de Portugal RNT, RNAL + RNET:
  - 73.156 randuri citite din municipii turistice principale;
  - 38.334 lead-uri noi create;
  - 38.334 lead-uri noi cu email;
  - 8.402 lead-uri noi cu telefon;
  - Lisboa RNAL a dat timeout si ramane de reluat separat;
  - raport: `/home/server/Nexora/utile/rapoarte/importuri/portugal-rnt-accommodations-import-report-2026-06-18T14-25-26-628Z.json`.
- Malta / OSM:
  - 211 lead-uri noi create;
  - 57 cu email, 123 cu telefon, 160 cu website.
- Egipt / OSM hotspot-uri:
  - 97 lead-uri noi create;
  - 25 cu email, 63 cu telefon, 53 cu website;
  - Hurghada, Luxor si Aswan au importat date;
  - Sharm El Sheikh, Cairo si Marsa Alam au prins 429/timeout si raman de reluat.
- Andorra / OSM:
  - 138 lead-uri noi create;
  - 32 cu email, 66 cu telefon, 115 cu website.
- Monaco / OSM:
  - 11 lead-uri noi create;
  - 7 cu email, 8 cu telefon, 11 cu website.
- Liechtenstein / OSM:
  - 34 lead-uri noi create;
  - 10 cu email, 17 cu telefon, 20 cu website.

### Stare dupa import
- Total lead-uri principale dupa import:
  - Portugal: 38.534 total, 38.400 cu email;
  - Romania: 21.943 total, 12.908 cu email;
  - France: 20.814 total, 20.595 cu website;
  - Albania: 866 total;
  - Greece: 429 total;
  - Bulgaria: 280 total;
  - Malta: 211 total.
- Baza Trevoro/Nexora are acum 86.569 lead-uri de cazari.

### Observatii
- Pentru Portugalia putem incepe outreach controlat imediat, deoarece lead-urile au email oficial din registrul RNT.
- Pentru Franta trebuie rulat enrichment pe website-uri pentru a extrage emailuri inainte de outreach masiv.
- Overpass/OSM a raspuns intermitent cu `429 Too Many Requests` si `504 Gateway Timeout`; importurile OSM trebuie rulate in loturi mici, cu pauze.
- Google Places nu a fost folosit pentru import masiv ca sa evitam costuri API fara aprobare explicita.

### Pas urmator
- Pregatim coada de outreach pentru Portugalia in loturi mici, maxim 50-100 emailuri/zi la inceput.
- Rulam enrichment pentru Franta in loturi de 500-1000 website-uri.
- Reluam separat Lisboa RNAL, Sharm El Sheikh, Cairo, Marsa Alam, San Marino si Luxembourg.
- Cautam/importam surse oficiale similare pentru Spania, Italia, Cipru, Malta si Grecia.

## 2026-06-18 - Trevoro: surse populare proprietati Europa si Egipt

### Ce s-a schimbat
- A fost documentata strategia de populare lead-uri/proprietati pentru tarile turistice extinse in Trevoro:
  - `utile/proceduri/trevoro-surse-populare-proprietati-europa-egipt.md`.
- Documentul separa sursele in:
  - import imediat prin OSM/Overpass;
  - registre oficiale/directoare nationale;
  - API-uri utile pentru completare si validare;
  - valuri de prioritizare pentru outreach international.
- Importatorul OSM `scripts/import-osm-travel-leads.mjs` accepta acum toate cele 45 de tari/destinatii active in Trevoro, inclusiv Cipru si Egipt.
- Au fost adaugate bbox-uri, coduri ISO si aliasuri RO/EN pentru tarile noi, inclusiv coduri scurte de tip `CY`, `EG`, `MT`, `PT`, `GB`.

### Surse prioritare identificate
- OSM/Overpass pentru baza rapida pe toate tarile.
- Cipru: Deputy Ministry of Tourism / Visit Cyprus - liste oficiale cu hoteluri si unitati turistice.
- Grecia: Hellenic Chamber of Hotels - Tourist Guide.
- Portugalia: Turismo de Portugal - National Tourism Register, RNET/RNAL.
- Franta: data.gouv.fr / Atout France - cazari turistice clasificate.
- Italia: dati.gov.it / Ministero del Turismo - BDSR.
- Spania: datos.gob.es si registre regionale, exemplu Madrid CSV/JSON.
- Malta: Malta Tourism Authority - Licensed Establishments.
- Bulgaria: National Tourist Register / Ministry of Tourism.
- Egipt: OSM/Overpass + enrichment Google Places/website, pe destinatii precum Hurghada, Sharm El Sheikh, Cairo/Giza.

### Verificare
- `node --check scripts/import-osm-travel-leads.mjs` - OK.
- `node --check scripts/enrich-travel-leads.mjs` - OK.
- `node --check scripts/run-trevoro-country-outreach.mjs` - OK.
- Dry-run Cipru:
  - bbox Paphos;
  - 577 elemente gasite;
  - 5 lead-uri normalizate in limita testului;
  - exemple cu website/email/telefon.
- Dry-run Egipt:
  - bbox Hurghada;
  - 346 elemente gasite;
  - 5 lead-uri normalizate in limita testului;
  - exemple cu website/email/telefon.

### Pas urmator
- Incepem cu loturi mici pe Cipru, Malta, Grecia, Bulgaria si Egipt.
- Pentru fiecare tara: dry-run, import real limitat, enrichment, verificare manuala in Nexora, apoi outreach de maximum 50/zi/tara la inceput.

## 2026-06-18 - Trevoro: extindere lista tari turistice

### Ce s-a schimbat
- Catalogul de tari Trevoro a fost extins la 45 destinatii turistice europene si apropiate, inclusiv Cipru si Egipt.
- Homepage-ul Trevoro afiseaza noile tari in filtrarea principala dupa destinatie, cu steagurile generate din catalogul comun.
- Formularele RO/EN pentru proprietari si agentii folosesc aceeasi lista extinsa de tari.
- Dashboardul proprietarului foloseste catalogul comun pentru selectarea tarii proprietatii.
- Nexora normalizeaza aliasuri pentru tarile noi, inclusiv variante RO/EN si coduri scurte.
- Formularele legacy Trevoro randate din Nexora folosesc lista extinsa.
- Codurile WhatsApp pentru outreach international au fost extinse pentru tarile noi.

### Verificare
- Nexora local:
  - `node --check routes/travel-routes.js` - OK;
  - `node --check src/ui/nexora-travel-pages.js` - OK.
- Trevoro local:
  - `npm run lint` - OK, doar warning-urile vechi din `src/lib/sample-data.ts`;
  - `npm run build` - OK.
- Deploy Trevoro pe VPS: OK.
- VPS:
  - `trevoro-site.service`, `nexora.service` si `cloudflared-trevoro.service` sunt active;
  - paginile Nexora `/` si `/trevoro/parteneri` contin Cipru, Egipt si Macedonia de Nord.
- Verificari publice:
  - homepage-ul Trevoro contine Cipru, Egipt, Croatia, Muntenegru, Macedonia de Nord, Malta si Ucraina;
  - `/proprietari` contine Cipru, Egipt, Malta, Regatul Unit si Macedonia de Nord;
  - `/en/owners` contine Cyprus, Egypt, Malta, United Kingdom si North Macedonia.

### Pas urmator
- Pe masura ce apar proprietati reale in tarile noi, paginile de destinatie vor deveni mai puternice pentru SEO si promovare.
- Pentru tarile fara proprietati inca, pastram afisarea ca semnal de extindere si folosim lista in formularele de inscriere.

## 2026-06-18 - Trevoro: pachet promovare Facebook si TikTok fara API

### Ce s-a schimbat
- A fost creat un pachet de promovare Trevoro pentru 14 zile, potrivit pentru postare manuala sau programare in Meta Business Suite.
- Fisiere create:
  - `utile/social-media/planuri/trevoro-campanie-promovare-14-zile.md`;
  - `utile/social-media/planuri/trevoro-campanie-promovare-14-zile.csv`;
  - `utile/social-media/planuri/trevoro-campanie-promovare-14-zile.html`.
- Pachetul include:
  - calendar de postare pe 14 zile;
  - texte pentru Facebook Page, profil personal si grupuri;
  - scripturi scurte pentru TikTok/Reels;
  - linkuri catre `/cazare`, `/proprietari`, blog si proprietati reale;
  - recomandari pentru grupuri Facebook fara spam;
  - doua campanii ads minime: turisti si proprietari.
- Au fost generate 14 imagini social media, cate una pentru fiecare zi de campanie.
- Imaginile sunt PNG 1080x1080 si sunt salvate in:
  - `utile/social-media/assets/campanie-14-zile/`.
- A fost adaugat scriptul reutilizabil:
  - `scripts/generate-trevoro-social-campaign-images.mjs`.
- Pagina campaniei afiseaza acum imaginea aferenta fiecarei zile si are buton `Descarca imagine`.
- Textele copiate din pagina campaniei includ automat UTM-uri pentru masurarea traficului:
  - `utm_source=facebook`;
  - `utm_medium=social`;
  - `utm_campaign=trevoro_launch_14_days`;
  - `utm_content=day_01`, `day_02` etc.
- Campania este accesibila acum si din Nexora:
  - `Nexora Travel > Social Posts > Campanie 14 zile`;
  - ruta directa: `/nexora/travel/social-campaign`.
- In meniul lateral Travel a fost adaugat linkul `Campanie 14 zile`.
- Imaginile sunt servite securizat prin ruta:
  - `/nexora/travel/social-campaign-assets/:fileName`.
- Bannerul `Trafic Trevoro.ro` afiseaza acum si `Campanii`, pe baza campului `utm_campaign`.
- A fost creat playbook-ul de raspunsuri rapide pentru comentarii si mesaje:
  - `utile/social-media/planuri/trevoro-social-response-playbook.md`;
  - ruta directa: `/nexora/travel/social-responses`.

### Observatie
- Nu este necesar cont developer Facebook pentru postare manuala sau programare prin Meta Business Suite.
- Contul developer/API ramane necesar doar pentru publicare automata din Nexora/Trevoro.
- TikTok poate fi folosit manual pana cand aplicatia ramane in review.

### Pas urmator
- Programam primele 7 postari in Meta Business Suite.
- Publicam 1 video scurt TikTok/Reels din scripturile pregatite.
- Monitorizam traficul in Nexora Travel si ajustam mesajele dupa primele 7 zile.

### Verificare
- `node --check routes/travel-routes.js` - OK.
- `node --check src/ui/nexora-travel-pages.js` - OK.
- `node --check src/config/erp-modules.js` - OK.
- Pagina campaniei contine 14 referinte la imagini si link catre raspunsurile rapide.
- `node scripts/generate-trevoro-social-campaign-images.mjs` - OK, 14 PNG-uri regenerate.
- VPS: `nexora.service` repornit si activ.
- Ruta `/nexora/travel/social-campaign` este disponibila si protejata de login.
- VPS: 14 fisiere PNG sincronizate in `utile/social-media/assets/campanie-14-zile/`, toate confirmate 1080x1080.

## 2026-06-18 - Trevoro: verificare Google Search Console

### Ce s-a schimbat
- A fost adaugat fisierul de verificare Google Search Console in site-ul public Trevoro:
  - `public/google0190d47e3639421f.html`.
- Continutul fisierului este:
  - `google-site-verification: google0190d47e3639421f.html`.

### Verificare
- Deploy Trevoro pe VPS: OK.
- URL public verificat:
  - `https://www.trevoro.ro/google0190d47e3639421f.html` - 200 OK.
- `trevoro-site.service` si `cloudflared-trevoro.service` sunt active.

### Pas urmator
- In Google Search Console se poate apasa `Verifica`.
- Dupa confirmare, se trimite sitemap-ul:
  - `https://www.trevoro.ro/sitemap.xml`.

## 2026-06-18 - Trevoro: pachet initial de growth si SEO public

### Ce s-a schimbat
- A fost adaugat hub-ul public `/cazare`, cu acces rapid catre pagini pe oras, judet si regiune.
- Au fost publicate 6 articole SEO in blogul Trevoro:
  - `/blog/cazare-litoral-vara`
  - `/blog/cabane-cu-jacuzzi`
  - `/blog/cazare-delta-dunarii`
  - `/blog/turcia-cazare-antalya-istanbul`
  - `/blog/cum-inscrii-o-proprietate-pe-trevoro`
  - `/blog/sincronizare-calendar-fara-overbooking`
- Fiecare articol are canonical, Open Graph, Twitter metadata si JSON-LD `Article`.
- A fost adaugat feed RSS public: `/feed.xml`.
- Header-ul Trevoro trimite acum turistii catre `/cazare` pentru prima filtrare dupa destinatie.
- Footer-ul Trevoro include link intern catre toate cazarile si destinatii principale.
- Sitemap-ul public include acum hub-ul `/cazare` si articolele SEO din blog.
- A fost creat playbook-ul operational `docs/trevoro-growth-playbook.md` cu pasii pentru Search Console, Bing, social media si conversia lead-urilor.
- A fost configurat IndexNow cu cheia publica `4928e2f5fed0b2fa5cd216caadbee8ba`.
- URL-ul cheii este public la `https://www.trevoro.ro/4928e2f5fed0b2fa5cd216caadbee8ba.txt`.
- A fost adaugata comanda reutilizabila `npm run indexnow` in proiectul Trevoro pentru retrimiterea sitemap-ului catre IndexNow.

### Verificare
- Trevoro local:
  - `npm run lint` - OK, doar warning-urile vechi din `src/lib/sample-data.ts`;
  - `npm run build` - OK.
- Deploy Trevoro pe VPS:
  - `npm run deploy:vps` - OK;
  - `trevoro-site.service`, `nexora.service` si `cloudflared-trevoro.service` sunt active.
- Verificari publice:
  - `https://www.trevoro.ro/cazare` - 200 OK, canonical si JSON-LD prezente;
  - `https://www.trevoro.ro/blog/cazare-litoral-vara` - 200 OK, canonical si JSON-LD `Article` prezente;
  - `https://www.trevoro.ro/feed.xml` - 200 OK, RSS valid cu 6 articole;
  - `https://www.trevoro.ro/sitemap.xml` - 148 URL-uri, include `/cazare` si cele 6 articole SEO.
- IndexNow:
  - au fost trimise 148 URL-uri catre `https://api.indexnow.org/indexnow`;
  - raspuns initial primit: `202 Accepted`;
  - comanda `npm run indexnow` a fost verificata si pe VPS, cu raspuns `200 OK`.

### Pas urmator
- Trimitem manual sitemap-ul in Google Search Console si Bing Webmaster Tools.
- Incepem publicarea zilnica pe social media folosind articolele si paginile de destinatie.
- Convertim treptat lead-urile validate in proprietati publice reale, ca sa creasca natural numarul de pagini indexabile.
- Urmarim traficul din bannerul `Trafic Trevoro.ro` din Nexora Travel.

## 2026-06-18 - SEO programatic Trevoro pentru proprietati si locatii

### Ce s-a schimbat
- Trevoro genereaza acum pagini SEO dinamice pentru locatii publice:
  - `/cazare/oras/[slug]`
  - `/cazare/judet/[slug]`
  - `/cazare/regiune/[slug]`
- Paginile de locatie au title, description, canonical, Open Graph, Twitter metadata si JSON-LD `CollectionPage`, `BreadcrumbList`, `ItemList`.
- Paginile afiseaza proprietatile reale din Nexora si linkuri catre cautari apropiate.
- Sitemap-ul Trevoro include acum proprietatile publice active si paginile SEO pe oras/judet/regiune.
- Footer-ul Trevoro include linkuri interne catre destinatii importante si pagini locale.
- Nexora expune endpoint-uri interne pentru SEO:
  - `GET /api/trevoro/seo-index`
  - `GET /api/trevoro/seo-locations/:locationType/:locationSlug`

### Observatie importanta
- Pe VPS exista 27.130 inregistrari in `travel_leads`, dar doar 26 proprietati publice active in `travel_properties`.
- Pentru SEO indexam doar `travel_properties.status='activ'`, adica pagini publice reale.
- Cele 27k lead-uri pot deveni trafic dupa conversie/publicare; nu este recomandat sa cream pagini indexabile fara proprietate reala.

### Verificare
- Local Trevoro:
  - `npm run lint` - fara erori, doar warning-urile vechi din `src/lib/sample-data.ts`
  - `npm run build` - OK
- Local Nexora:
  - `node --check routes/travel-routes.js` - OK
- VPS:
  - `routes/travel-routes.js` sincronizat pe VPS si `nexora.service` repornit
  - `npm run deploy:vps` pentru Trevoro - OK
  - `/sitemap.xml` public: 140 URL-uri, 44 pagini `/cazare/...`, 26 proprietati
  - `/cazare/oras/hateg` public: 200 OK, canonical si JSON-LD prezente
  - `/properties/8-casa-cristian-4-wellness-spa-hateg` public: canonical si JSON-LD `LodgingBusiness` prezente

### Pas urmator
- Construim flux de conversie din `travel_leads` in `travel_properties` pentru lead-urile validate si cu date suficiente.
- Dupa cresterea numarului de proprietati active, sitemap-ul va include automat noile pagini de proprietate si locatii.

## 2026-06-18 - Trevoro: reminder proprietari fara poze

### Ce s-a schimbat
- Scriptul `scripts/send-trevoro-owner-photo-price-reminder-email.mjs` a fost actualizat cu un mesaj mai complet pentru proprietarii fara poze.
- Emailul include acum:
  - linkul de login in contul de proprietar;
  - emailul cu care proprietarul se conecteaza;
  - clarificarea ca parola este cea creata la inscriere si nu este trimisa pe email;
  - mentiunea despre codul de verificare primit pe email la autentificare;
  - linkuri catre ghidul din cont, sectiunea Poze si sectiunea Calendar;
  - beneficiul de membru fondator: 0 lei/luna timp de 12 luni, listare pe Trevoro si promovare social media;
  - faptul ca Trevoro nu percepe comision pe rezervari.

### Trimitere
- Au fost gasite pe VPS 26 proprietati active.
- 17 proprietati active nu aveau poze.
- 16 emailuri au fost trimise cu succes catre proprietarii fara poze.
- 1 proprietate a fost sarita deoarece emailul este invalid: `pensiuneteo@gmail` pentru `PENSIUNEA TEO`.
- Subiect folosit: `Trevoro - completare poze si ghiduri pentru contul de proprietar`.

### Trasabilitate
- Trimiterile sunt inregistrate in `travel_email_messages`.
- Evenimentele sunt inregistrate in `travel_owner_account_events`:
  - `owner_photo_price_reminder_email_sent`: 16;
  - `owner_photo_price_reminder_skipped`: 1.
- Raport VPS: `/home/server/Nexora/utile/rapoarte/outreach/trevoro-owner-photo-price-reminder-report-2026-06-18T08-00-02-078Z.json`.

### Pas urmator
- Corectam adresa pentru `PENSIUNEA TEO` inainte de retrimitere.
- Monitorizam daca proprietarii incarca poze si actualizeaza preturile in cont.

## 2026-06-18 - Trevoro: analytics propriu in Nexora Travel

### Ce s-a schimbat
- A fost adaugata tabela `travel_site_pageviews` in Nexora pentru traficul public Trevoro.
- Site-ul public Trevoro trimite automat pageview-uri catre Nexora prin endpointul public `POST /api/trevoro/analytics/pageview`.
- In dashboardul `Nexora Travel` a fost adaugat un banner `Trafic Trevoro.ro` cu:
  - vizitatori unici si vizite azi;
  - vizitatori unici si vizite in ultimele 7 zile;
  - vizitatori unici si vizite in luna curenta;
  - top pagini si top surse.
- IP-urile nu sunt salvate in clar. Nexora salveaza doar hash HMAC pentru identificarea vizitatorilor unici.
- Dashboardul exclude din statistici IP-ul curent al utilizatorului care vede raportul, astfel incat Valentin sa poata vedea traficul diferit de al lui.

### Verificari
- Nexora: `node --check db.js`, `node --check routes/travel-routes.js`, `node --check src/ui/nexora-travel-pages.js`.
- Nexora: `node tests/travel-schema.test.mjs` a trecut.
- Trevoro: `npm run lint` a trecut cu warning-urile existente din `src/lib/sample-data.ts`.
- Trevoro: `npm run build` a trecut local si pe VPS.
- VPS: `nexora.service`, `trevoro-site.service` si `cloudflared-trevoro.service` sunt active.
- Endpointul analytics raspunde public cu `204` si accepta origin `https://www.trevoro.ro`.
- O vizita reala din browser pe `https://www.trevoro.ro` a inserat un pageview nou in baza de date Nexora de pe VPS.

### Pas urmator
- Dupa cateva ore/zile de trafic real, verificam valorile din banner si ajustam daca vrem filtre suplimentare: tara, pagina, sursa, proprietate sau excludere IP-uri fixe prin `TREVORO_ANALYTICS_EXCLUDED_IPS`.

## 2026-06-17 - Trevoro: OwnerRez in asteptare clarificari contractuale

### Context
- OwnerRez a raspuns pozitiv pentru integrare prin Channel API si a trimis link Zoho Sign pentru NDA + Partnership Agreement.
- OwnerRez a cerut alegerea unui mod de integrare dintre Redirect, Read Only, Quote Only, Full Booking cu card sau MOR.
- Pentru modelul Trevoro, varianta potrivita este `Read Only mode` in faza 1, eventual `Quote Only mode` in faza 2.

### Decizie
- Nu semnam inca Partnership Agreement-ul pana nu primim clarificari scrise.
- Trevoro nu alege Full Booking si nu alege MOR, deoarece nu proceseaza carduri si nu incaseaza plata turist-proprietar.
- Modelul comercial potrivit este rev-share doar din venitul Trevoro obtinut de la utilizatori OwnerRez, nu procent din valoarea bruta a rezervarilor.

### Pas urmator
- A fost trimis email catre Paul / OwnerRez pentru confirmare:
  - Read Only mode acceptat ca Phase 1;
  - fara obligatii PCI daca nu colectam/transmitem carduri;
  - rev-share aplicat doar la abonamentul/listing revenue Trevoro obtinut de la utilizatori OwnerRez;
  - confirmare fara taxe minime, upfront fees, exclusivitate sau deadline-uri ascunse;
  - pasii pentru sandbox si test data dupa NDA.
- Dupa raspuns, descarcam PDF-urile din Zoho Sign si le verificam inainte de semnare.

## 2026-06-17 - Trevoro: procedura completa in contul proprietarului

### Ce s-a schimbat
- Pagina `Proceduri` din contul proprietarului Trevoro a fost extinsa cu procedura completa de publicare si administrare a proprietatii.
- Ghidul include acum pasii pentru:
  - autentificare si verificare email;
  - completare/adaugare proprietate;
  - incarcare poze reale;
  - configurare camere si tarife de baza;
  - setare preturi sezoniere si disponibilitate;
  - sincronizare calendar extern iCal/ICS;
  - copiere link iCal din Booking.com, Airbnb, Google Calendar, Outlook sau PMS/channel manager;
  - verificare dupa sincronizare;
  - conectare PMS/Channel Manager;
  - gestionare cereri si reguli de plata proprietar-client;
  - contact suport prin email sau WhatsApp.
- In pagina `Proceduri` a fost adaugat un checklist de stare pentru proprietar:
  - Date listare;
  - Poze;
  - Camere si tarife;
  - Sincronizare calendar.
- Checklist-ul arata daca pasul este `Gata` sau `De facut` si trimite direct catre sectiunea potrivita din dashboard.

### Verificare
- Nexora: `node --check routes/travel-routes.js`.
- Trevoro: `npm run lint` a trecut cu warning-urile existente din `src/lib/sample-data.ts`.
- Trevoro: `npm run build` a trecut.

## 2026-06-17 - Trevoro: ascundere randuri tehnice rate_plan_grid din cont proprietar

### Problema
- In contul proprietarului, sectiunea Calendar afisa zeci de randuri generate automat din grila de preturi pe plan tarifar.
- Randurile aveau note de tip `Plan tarifar #...` si buton `Sterge`, ceea ce le facea sa para perioade manuale introduse de proprietar.
- Cauza era dubla:
  - frontendul lista toate intrarile din `room_rate_periods`, inclusiv cele tehnice cu `source='rate_plan_grid'`;
  - backendul adauga cate un rand tehnic la fiecare salvare a grilei, fara sa stearga randul vechi echivalent.

### Ce s-a schimbat
- Dashboardul proprietarului Trevoro filtreaza acum intrarile cu `source='rate_plan_grid'` din lista de perioade manuale.
- Calendarul proprietarului foloseste doar perioadele vizibile/manuale sau sincronizarile externe relevante pentru afisarea din cont.
- Salvarea grilei de preturi sterge randul tehnic generat anterior pentru aceeasi proprietate, camera, data si plan tarifar inainte sa insereze valoarea noua.
- Pe VPS au fost curatate duplicatele existente din `travel_property_room_rate_periods` pentru `source='rate_plan_grid'`, pastrand ultimul rand pentru fiecare combinatie.

### Verificare
- Trevoro: `npm run lint` a trecut cu warning-urile existente din `src/lib/sample-data.ts`.
- Trevoro: `npm run build` a trecut.
- Deploy Trevoro pe VPS finalizat cu succes.
- Nexora: `node --check routes/travel-routes.js` a trecut pe VPS.
- Curatare VPS: 135 randuri tehnice gasite, 16 duplicate sterse, 119 randuri tehnice pastrate pentru calcule.
- Verificare dashboard proprietar pe VPS: textul `Plan tarifar #` nu mai apare in pagina, iar grila `Salveaza preturile` ramane disponibila.

## 2026-06-17 - Trevoro: Booking.com si Airbnb ca piste strategice

### Ce s-a schimbat
- Au fost adaugate `Booking.com` si `Airbnb` in lista de provideri/piste strategice Trevoro/Nexora.
- In dashboardul proprietarului Trevoro, cele doua apar cu status `iCal activ / strategic`.
- In Nexora, cele doua apar in pagina interna `/nexora/travel/integrations` pentru urmarire separata.
- Documentul `utile/trevoro-integrari-romania-contacte.md` include acum:
  - abordarea recomandata pentru Booking.com;
  - abordarea recomandata pentru Airbnb;
  - mesaj intern pentru Booking.com Connectivity;
  - mesaj intern pentru Airbnb Software Partner;
  - clarificarea ca iCal este activ acum, iar API-ul direct ramane obiectiv strategic.

### Directie
- Booking.com:
  - iCal/ICS este folosit imediat pentru disponibilitate;
  - affiliate poate fi analizat ca monetizare secundara;
  - Connectivity API ramane obiectiv strategic, in functie de onboarding-ul Booking.com pentru provideri noi;
  - integrarea realista ramane si prin PMS/channel manageri deja conectati la Booking.com.
- Airbnb:
  - iCal/ICS este folosit imediat pentru disponibilitate;
  - Software Partner/API ramane obiectiv strategic, dupa cresterea volumului Trevoro;
  - integrarea realista ramane prin PMS/channel manageri aprobati Airbnb.

## 2026-06-17 - Trevoro: prioritizare integrari Romania

### Ce s-a schimbat
- Au fost adaugati in lista tehnica de provideri Trevoro/Nexora:
  - Previo;
  - Travelminit;
  - Hermis;
  - Vilicotel;
  - Google Hotel Center.
- Providerii relevanti pentru Romania apar acum in zona `Integrari / Channel Manager` din dashboardul proprietarului Trevoro.
- In Nexora, providerii au fost adaugati in jurnalul intern `/nexora/travel/integrations`, cu status initial si follow-up.
- A fost creat fisierul utilitar `utile/trevoro-integrari-romania-contacte.md`, cu adrese de contact si texte de email pentru platformele prioritare din Romania.

### Directie
- Pentru Romania, prioritatea nu mai este e-Factura sau calendarul simplu, deoarece Trevoro/Nexora acopera deja aceste zone.
- Prioritatea devine accesul la PMS/Channel Manager si canale locale:
  - PynBooking;
  - 5StarDesk;
  - Previo;
  - Travelminit;
  - Hermis;
  - Vilicotel;
  - Google Hotel Center.
- Obiectivul tehnic ramane sincronizarea disponibilitatii, tarifelor si rezervarilor, fara ca Trevoro sa proceseze plata turist-proprietar.

## 2026-06-17 - Trevoro: integrare Channel Manager si jurnal parteneri

### Ce s-a schimbat
- Zona din contul proprietarului Trevoro pentru `PynBooking OpenAPI` a fost extinsa intr-o zona generala `Integrari / Channel Manager`.
- Lista de provideri acceptati in Trevoro/Nexora include acum:
  - PynBooking;
  - 5StarDesk;
  - Smoobu;
  - Hostaway;
  - Lodgify;
  - Beds24;
  - Guesty;
  - Rentals United;
  - Avantio;
  - OwnerRez;
  - Hostfully;
  - Uplisting;
  - Hospitable;
  - Cloudbeds;
  - Calendar iCal/ICS;
  - Other.
- In Trevoro, providerii sunt afisati cu status comercial/tehnic:
  - `Aplicat` pentru platformele unde a fost completata cererea;
  - `Contactat` pentru platformele unde a fost trimis email sau cerere initiala;
  - `Discutie programata` pentru discutiile planificate;
  - `Disponibil acum` pentru fallback-ul iCal/ICS.
- In Nexora a fost adaugata pagina interna `/nexora/travel/integrations` pentru urmarirea parteneriatelor Channel Manager/PMS.
- Pagina de integrari din Nexora salveaza in baza de date:
  - provider;
  - status;
  - metoda de contact;
  - data contactarii;
  - data follow-up;
  - urmatorul pas;
  - notite interne.
- Backendul Nexora normalizeaza acum aliasurile providerilor, inclusiv `5stardesk`, `rentalsunited`, `ownerrez`, `cloudbeds`, `ical` si `ics`.
- iCal/ICS ramane fallback-ul disponibil imediat pentru sincronizarea disponibilitatii, in timp ce integrarile API complete se activeaza dupa aprobarea partenerilor.

### Verificare
- Trevoro: `npm run lint` a trecut cu warning-uri existente in `src/lib/sample-data.ts`.
- Trevoro: `npm run build` a trecut.
- Deploy Trevoro pe VPS: finalizat cu restart `trevoro-site.service`.
- Verificare publica Trevoro: `https://www.trevoro.ro/` raspunde `HTTP 200`.
- Verificare VPS Trevoro: dashboardul proprietarului contine `Cloudbeds`, `Rentals United` si `Integrari / Channel Manager`.
- Nexora: `node --check` a trecut pentru:
  - `routes/travel-routes.js`;
  - `src/ui/nexora-travel-pages.js`;
  - `src/config/erp-modules.js`.
- Nexora VPS: `nexora.service` este activ.
- Nexora VPS: ruta `/nexora/travel/integrations` exista si este protejata prin login.
- Nexora VPS: randarea paginii de integrari confirma versiunea editabila cu formular de salvare.

### Pasi urmatori
- Cand raspund platformele contactate, actualizam statusul in `/nexora/travel/integrations`.
- Pentru fiecare partener aprobat, cerem:
  - acces sandbox/developer;
  - documentatie API;
  - model de autentificare;
  - reguli comerciale si conditii de listare;
  - demo/test credentials.
- Implementam providerii pe rand, in acelasi model generic:
  - test conexiune;
  - import camere/proprietati;
  - mapare camere externe;
  - citire disponibilitate live;
  - citire tarife live;
  - creare rezervare externa;
  - salvare `external_reservation_id`;
  - sincronizare modificari/anulari prin webhook sau polling.
- Pastram suport complet pentru proprietarii fara Channel Manager:
  - editare manuala disponibilitate;
  - preturi manuale;
  - calendar intern Trevoro;
  - fallback iCal/ICS unde exista calendar extern.
- Pentru clienti/proprietari, mesajul comercial ramane clar: Trevoro nu proceseaza plata turist-proprietar; Trevoro factureaza doar abonamentul lunar catre proprietar.
- Follow-up comercial recomandat: verificare raspunsuri la 7 zile pentru platformele fara reactie.

## 2026-06-05 - Nexora Travel: repair erori email outreach

### Ce s-a schimbat
- Am verificat erorile de trimitere din `travel_email_messages`: bounce-uri si `outbound_failed`.
- Am extins `scripts/repair-trevoro-failed-email-leads.mjs`:
  - pastreaza verificarea existenta in registrul oficial pentru Romania;
  - cauta acum emailuri publice pe website-ul proprietatii, inclusiv pagini uzuale de contact, rezervari si despre;
  - actualizeaza lead-ul doar cand gaseste o alternativa suficient de sigura si care nu a mai esuat in istoricul nostru;
  - marcheaza separat cazurile pentru retry SMTP, fallback WhatsApp si review manual.
- Am adaugat in `/nexora/travel/outreach`:
  - tabel `Erori email recente`;
  - buton `Cauta emailuri bune` care ruleaza repair-ul;
  - sumar dupa rulare: reparate, candidate gasite pe website, WhatsApp fallback si review manual.
- Am rulat repair real pentru ultimele 7 zile, limita 50:
  - 40 lead-uri verificate;
  - 8 emailuri corectate din website;
  - 9 retry dupa cooldown SMTP;
  - 14 fallback WhatsApp;
  - 9 review manual.

### Verificare
- `node --check scripts/repair-trevoro-failed-email-leads.mjs`
- `node --check routes/travel-routes.js`
- `node --check src/ui/nexora-travel-pages.js`
- `for f in tests/travel-*.test.mjs; do node "$f" || exit 1; done`

## 2026-05-29

### Modul Productie / MRP Nexora
- A fost implementat modulul `Productie / MRP` in interfata Nexora.
- Au fost facute functionale meniurile:
  - `Dashboard`;
  - `BOM`;
  - `Ordine productie`;
  - `Planificare`;
  - `Consum materiale`;
  - `Cost productie`;
  - `Quality control`.
- Au fost adaugate tabele dedicate pentru:
  - BOM-uri si componente BOM;
  - ordine de productie;
  - materiale necesare pe ordin;
  - planuri MRP;
  - bonuri de consum materiale;
  - costuri productie;
  - verificari quality control.
- `BOM` permite creare reteta pentru produs finit, revizie, lot standard si componente din catalog sau din stoc.
- `Ordine productie` permite creare ordin din BOM sau produs manual, generare automata necesar materiale si finalizare cu intrare produs finit in stoc.
- `Planificare` calculeaza necesarul MRP din cerere, stoc disponibil si cantitate planificata, apoi poate genera ordin de productie.
- `Consum materiale` permite emiterea materialelor pe ordin si confirmarea consumului cu scadere din stoc.
- `Cost productie` permite calcul estimat/realizat pe ordin, cu preluare automata a costului materialelor din BOM/consum.
- `Quality control` permite inregistrarea inspectiilor pe ordin, eșantion, cantitati acceptate/respinse si rezultat.
- Toate datele sunt filtrate pe compania autentificata.
- Validare:
  - au fost rulate verificarile `node --check` pentru `db.js`, `server.js`, `routes/manufacturing-routes.js`, `src/ui/nexora-manufacturing-pages.js` si testul nou;
  - a fost adaugat si rulat testul `tests/manufacturing-smoke.test.mjs`;
  - smoke testul creeaza produs finit, materie prima, stoc, BOM, ordin productie, consum cu scadere din stoc, cost, QC si plan MRP cu generare ordin;
  - testul ruleaza in tranzactie si se finalizeaza cu `ROLLBACK`.

### Securitate conturi Admin - TOTP
- A fost implementata autentificarea TOTP obligatorie pentru conturile `admin` si `super admin`.
- La primul login dupa activare, adminul este trimis in setup TOTP si primeste cheia pentru Google Authenticator, Microsoft Authenticator sau 1Password.
- Setup-ul TOTP afiseaza acum cod QR generat local in Nexora, plus cheia manuala ca varianta de rezerva.
- Dupa activare, loginul admin cere codul TOTP de 6 cifre inainte de accesul in workspace.
- Backendul pastreaza secretul TOTP, statusul de activare, data confirmarii, ultimul interval folosit si contorul de incercari esuate.
- Au fost adaugate protectii pentru:
  - replay de cod TOTP deja folosit;
  - sesiune intermediara TOTP expirata dupa 10 minute;
  - blocare temporara 5 minute dupa 5 coduri gresite.
- In `Utilizatori & roluri` se afiseaza starea 2FA pentru fiecare user si exista buton `Reset 2FA` pentru conturile admin.
- Resetarea 2FA sterge cheia TOTP si forteaza un setup nou la urmatorul login admin.
- Validare:
  - au fost rulate verificarile `node --check` pentru `db.js`, `server.js`, `routes/auth-routes.js`, `lib/totp.js`, `src/ui/nexora-users-page.js` si testul nou;
  - a fost adaugat si rulat testul `tests/totp-auth.test.mjs`;
  - a fost rulat si testul existent `tests/client-portal-isolation.test.mjs`.

### Hardening securitate autentificare si sesiuni
- A fost adaugat rate limit pentru `/login`: maximum 10 incercari gresite pe IP + email in 15 minute.
- Mesajul de eroare pentru blocare temporara este afisat in pagina de login.
- Au fost adaugate headere HTTP de protectie:
  - `X-Content-Type-Options: nosniff`;
  - `X-Frame-Options: SAMEORIGIN`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy` pentru dezactivare camera, microfon si geolocatie;
  - `Strict-Transport-Security` pe HTTPS / productie.
- A fost dezactivat headerul `X-Powered-By`.
- Store-ul de sesiuni a fost mutat de pe `connect-sqlite3/sqlite3` pe un store intern cu `better-sqlite3`, folosind tabela `nexora_sessions`.
- Au fost aplicate update-uri automate de securitate npm si eliminata dependenta vulnerabila `connect-sqlite3`.
- Validare:
  - `npm audit --omit=dev` raporteaza `found 0 vulnerabilities`;
  - au fost rulate verificarile `node --check` pentru fisierele modificate;
  - a fost adaugat si rulat testul `tests/security-hardening.test.mjs`;
  - au fost rulate din nou `tests/totp-auth.test.mjs` si `tests/client-portal-isolation.test.mjs`.

### Modul Workflow & Automatizari / RPA Nexora
- A fost implementat modulul `Workflow & Automatizari` ca zona RPA in Nexora.
- Meniul modulului a fost extins cu:
  - `RPA Dashboard`;
  - `RPA Studio`;
  - `Automatizare facturi`;
  - `Reguli business`;
  - `Aprobari`;
  - `Notificari`;
  - `Istoric rulari`.
- Au fost adaugate tabele pentru roboti RPA, reguli business, automatizari facturi, rulari, pasi de executie, aprobari si notificari.
- `RPA Studio` permite definirea de roboti cu trigger, modul sursa, actiune, responsabil, status si configuratie JSON.
- `Automatizare facturi` permite reguli pentru:
  - facturi scadente in curand;
  - facturi cu scadenta depasita;
  - facturi create/status schimbat;
  - pregatire reminder client;
  - creare notificare interna;
  - cerere aprobare/verificare;
  - pregatire e-Factura fara trimitere automata catre ANAF.
- `Reguli business` permite configurarea de conditii si actiuni reutilizabile.
- `Aprobari` si `Notificari` pot fi create manual sau generate de automatizari.
- `Istoric rulari` pastreaza auditul executiilor RPA si pasii executati.
- Toate datele sunt filtrate pe compania autentificata.
- Validare:
  - au fost rulate verificarile `node --check` pentru `db.js`, `server.js`, `routes/workflow-routes.js`, `src/ui/nexora-workflow-pages.js` si `src/config/erp-modules.js`;
  - a fost rulat un smoke test local care creeaza robot RPA, regula, automatizare facturi, aprobare si notificare, ruleaza automatizarile si verifica toate paginile cu raspuns `200`;
  - testul a fost finalizat cu `ROLLBACK`.

### Fix Tipizate in Documente / DMS
- Linkul `Tipizate` din meniul `Documente / DMS` a fost mutat de pe ruta veche `/tipizate` pe `/nexora/documents/templates`.
- A fost adaugata pagina Nexora pentru tipizate, cu aceeasi structura vizuala ca restul modulului DMS.
- Modelele de documente din DMS folosesc acum rute Nexora:
  - `/nexora/documents/templates/proces-verbal`;
  - `/nexora/documents/templates/adeverinta`;
  - `/nexora/documents/templates/decizie-interna`;
  - `/nexora/documents/templates/notificare-client`;
  - `/nexora/documents/templates/cerere-concediu`;
  - `/nexora/documents/templates/ordin-deplasare`;
  - `/nexora/documents/templates/fisa-hr`.
- Au fost pastrate aliasurile vechi pentru compatibilitate, dar meniul Nexora nu mai trimite utilizatorul in interfata veche.
- Validare:
  - au fost rulate verificarile `node --check` pentru `server.js` si `src/ui/nexora-documents-page.js`;
  - a fost rulat un smoke test de randare care confirma ca pagina Tipizate DMS nu mai contine linkuri vechi `/tipizate`.
  - a fost verificat sidebar-ul DMS: linkul `Tipizate` indica `/nexora/documents/templates`.

### Modul Resurse Umane Nexora
- A fost extins modulul Resurse Umane cu backend si UI functional pentru toate meniurile active:
  - `Angajati`;
  - `Contracte`;
  - `Payroll`;
  - `Concedii`;
  - `Pontaj`;
  - `Recrutare`;
  - `Evaluari`.
- Au fost adaugate tabele dedicate pentru contracte HR, state payroll, linii payroll, cereri de concediu, pontaje, candidati si evaluari de performanta.
- `Angajati` permite acum date HR extinse: cod angajat, departament, data angajarii, salariu, tip contract, manager si observatii.
- `Contracte` permite inregistrarea contractelor/actelor aditionale cu numar automat si legare la angajat.
- `Payroll` permite creare stat lunar, generare automata de linii pentru angajatii activi si calcul brut/net/taxe estimate.
- `Concedii` permite creare cereri, calcul zile si aprobare/respingere.
- `Pontaj` permite salvare sau actualizare pontaj zilnic pe angajat.
- `Recrutare` permite introducere candidati si mutarea lor intre etape.
- `Evaluari` permite inregistrarea evaluarilor de performanta cu scor, obiective si feedback.
- Toate listele si actiunile sunt filtrate pe compania autentificata.
- Validare:
  - au fost rulate verificarile `node --check` pentru `db.js`, `server.js`, `routes/hr-routes.js` si `src/ui/nexora-employees-page.js`;
  - a fost rulat un smoke test local care creeaza in tranzactie angajat, contract, payroll, concediu, pontaj, candidat si evaluare, apoi verifica toate cele 7 pagini HR cu raspuns `200`;
  - testul a fost finalizat cu `ROLLBACK`.

### Setari Dashboard Nexora
- A fost adaugat meniul `Setari dashboard` pe `/nexora-dashboard/settings`.
- Preferintele sunt salvate per utilizator in tabela `dashboard_preferences`.
- Utilizatorul poate alege:
  - KPI-urile afisate in partea de sus;
  - panourile principale vizibile pe dashboard;
  - scurtaturile rapide afisate in panoul de actiuni.
- Dashboardul citeste configuratia salvata inainte de randare si pastreaza valorile implicite daca nu exista preferinte.
- Validare:
  - au fost rulate verificarile `node --check` pentru `db.js`, `routes/dashboard-routes.js` si `src/ui/nexora-dashboard-page.js`;
  - a fost testata salvarea preferintelor in tranzactie cu `ROLLBACK`.

### Compactare UI si Dashboard Nexora
- UI-ul Nexora a fost compactat global:
  - sidebar mai ingust, cu `height: 100vh` si scroll propriu;
  - topbar, butoane, carduri, KPI-uri si meniuri cu padding/inaltimi reduse;
  - radius si umbre mai discrete pentru un aspect mai dens si mai utilitar.
- Dashboardul a fost refacut intr-un layout mai compact:
  - KPI-urile sunt mai joase si pastreaza cele 5 metrici pe desktop;
  - graficul business este mai mic;
  - activitatile recente sunt limitate vizual la primele 3;
  - e-Factura si scurtaturile rapide au fost combinate intr-un panou compact;
  - lista de facturi recente ramane limitata la ultimele 3 facturi.

### Ajustare login Nexora
- Pagina de login a fost simplificata:
  - a fost scos panoul informativ din stanga;
  - a fost eliminata zona `Creeaza cont demo`;
  - formularul de login este acum intr-un card mai mic, centrat pe pagina.

### Customer Portal Nexora
- A fost implementat portalul separat pentru rolul `client`, cu intrare pe `/client-portal/dashboard`.
- Rolul `client` este legat de `users.client_id`, iar accesul pe backend este limitat la rutele `/client-portal/*`.
- Pentru utilizatorii cu rol `client`, datele se filtreaza exclusiv dupa `client_id` din sesiunea autentificata; portalul nu foloseste `client_id` primit din frontend.
- Au fost adaugate meniurile dedicate portalului:
  - `Dashboard`;
  - `Proiecte`;
  - `Task-uri`;
  - `Oferte`;
  - `Contracte`;
  - `Facturi`;
  - `Documente`;
  - `Suport`;
  - `Mesaje`.
- Au fost create rute backend pentru dashboard, proiecte, task-uri, oferte, contracte, facturi, documente, ticketuri, comentarii si uploaduri.
- Pagina interna de client are acum buton `Creeaza cont client`, care creeaza utilizator cu rol `client` si `client_id` setat pe clientul curent.
- Au fost adaugate tabele pentru `activity_logs`, `client_portal_tickets`, `client_portal_comments` si `client_portal_uploads`.
- Se logheaza actiunile clientului pentru acceptare oferta, creare ticket, comentariu, upload document si descarcare factura.
- Validare:
  - au fost rulate verificarile `node --check` pentru rutele/UI-urile modificate si pentru `server.js`;
  - a fost adaugat si rulat testul `tests/client-portal-isolation.test.mjs`;
  - testul confirma izolarea datelor intre clienti si faptul ca `client_id` trimis fortat din formular nu este folosit.

### Modul Achizitii Nexora
- A fost adaugat modulul dedicat Achizitii pe `/nexora/procurement`.
- Au fost facute functionale meniurile:
  - `Furnizori`;
  - `Comenzi achizitie`;
  - `Receptii`;
  - `Aprobari achizitii`;
  - `Costuri`;
  - `Facturi furnizori`.
- Au fost adaugate tabele dedicate pentru furnizori, comenzi de achizitie, linii de comanda, receptii, linii de receptie, aprobari, costuri si facturi furnizori.
- `Furnizori` permite inregistrare furnizori, date fiscale/contact, termene de plata si filtrare.
- `Comenzi achizitie` permite creare comenzi catre furnizori, adaugare linii de produse/servicii, totalizare cu TVA si schimbare status.
- `Aprobari achizitii` permite creare cereri de aprobare, aprobare/respingere si actualizarea statusului de aprobare pe comanda.
- `Receptii` permite creare receptii pe furnizor/comanda/depozit, adaugare linii, loturi/serii si finalizare cu intrare efectiva in gestiune.
- `Costuri` permite inregistrarea costurilor aditionale de achizitie, legate de furnizor, comanda, receptie sau factura.
- `Facturi furnizori` permite inregistrarea documentelor furnizor cu atasament, status de plata si oglindire automata in `Cheltuieli`.
- Fluxul de facturi furnizori este intern, fara integrare ANAF/e-Factura.
- Validare:
  - au fost rulate verificarile `node --check` pentru `db.js`, `routes/procurement-routes.js`, `src/ui/nexora-procurement-pages.js` si `server.js`;
  - migratia SQLite a fost rulata local si tabelele `procurement_*` au fost create;
  - toate paginile Nexora ale modulului au fost randate local cu raspuns `200`;
  - fluxul furnizor + comanda + aprobare + receptie in stoc + factura furnizor oglindita in cheltuieli a fost testat in tranzactie cu `ROLLBACK`.

### Modul Inventar & Gestiune Nexora
- Punctul principal al modulului Inventar & Gestiune afiseaza acum pagina functionala `Stocuri`, nu un hub static.
- Au fost facute functionale meniurile:
  - `Stocuri`;
  - `Registru active`;
  - `Proiecte inventar`;
  - `Produse`;
  - `Depozite`;
  - `Loturi / Serii`;
  - `Transferuri`;
  - `Inventar`;
  - `Receptii`;
  - `Picking / Packing`;
  - `Coduri de bare`.
- Au fost adaugate tabele operationale pentru depozite, pozitii de stoc, loturi/serii, transferuri, receptii, picking/packing si coduri de bare.
- `Stocuri` permite creare de pozitii pe depozit, produs sau linie manuala, cu cantitate, rezervare si prag minim.
- `Depozite` permite creare/actualizare locatii de stoc si afiseaza cantitati agregate pe depozit.
- `Loturi / Serii` permite urmarirea trasabilitatii pe lot, serie, depozit, produs si expirare.
- `Transferuri` permite creare document de transfer, adaugare linii si finalizare cu mutarea cantitatilor intre depozite.
- `Receptii` permite creare receptie, adaugare linii, costuri, loturi si finalizare cu intrare efectiva in stoc.
- `Picking / Packing` permite creare picking, rezervare cantitati, ambalare si livrare cu scadere din stoc.
- `Inventar` permite creare sesiuni de numarare din stocuri sau active, import CSV optional, export CSV si aplicarea diferentelor.
- `Coduri de bare` permite generarea de coduri pentru produse, active sau loturi si pregatirea etichetelor pentru tiparire.
- `Rapoarte inventar` afiseaza stoc pe depozite, pozitii sub minim, loturi cu expirare si documente operationale deschise.
- Validare:
  - au fost rulate verificarile `node --check` pentru `routes/inventory-routes.js`, `src/ui/nexora-inventory-pages.js`, `db.js` si `server.js`;
  - migratia SQLite a fost rulata local si noile tabele/coloane au fost create;
  - toate paginile Nexora ale modulului au fost randate local cu raspuns `200`;
  - fluxurile depozit + transfer, receptie + picking si inventar + aplicare diferente au fost testate in tranzactii cu `ROLLBACK`.

### Modul CRM Nexora
- A fost mutat punctul principal al modulului CRM pe `/nexora/crm`.
- Au fost facute functionale meniurile:
  - `Lead-uri`;
  - `Pipeline`;
  - `Follow-up`;
  - `Activitati`;
  - `Email tracking`;
  - `Relatii clienti`.
- Au fost adaugate tabele CRM dedicate pentru lead-uri, oportunitati, follow-up-uri si evenimente de email.
- `Lead-uri` permite creare lead, filtrare, schimbare status si conversie in client.
- `Pipeline` permite creare oportunitati si mutarea lor intre etape comerciale.
- `Follow-up` permite programarea actiunilor CRM pe client, lead sau oportunitate si marcarea lor ca realizate.
- `Activitati` centralizeaza activitatile CRM si activitatile existente din fisa clientului.
- `Email tracking` permite inregistrarea emailurilor comerciale si actualizarea statusului: pregatit, trimis, deschis, raspuns sau esuat.
- Pagina `Relatii clienti` ramane conectata la portofoliul existent de clienti si primeste navigatia interna CRM.

### Modul Vanzari Nexora
- A fost mutat punctul principal al modulului Vanzari pe `/nexora/sales`.
- Meniul `Facturare` a fost scos din submeniul Vanzari, pentru ca acest modul sa ramana separat de facturi.
- Au fost pastrate ca functionale meniurile existente:
  - `Oferte`;
  - `Clienti`;
  - `Contracte`.
- Au fost facute functionale meniurile lipsa:
  - `Comenzi`;
  - `Preturi`;
  - `Discounturi`;
  - `Livrari`.
- Au fost adaugate tabele dedicate pentru:
  - comenzi de vanzare si pozitii de comanda;
  - liste de pret si pozitii de pret;
  - reguli/campanii de discount;
  - livrari si pozitii livrate.
- `Comenzi` permite creare comanda din client sau oferta, adaugare pozitii, totalizare si schimbare status, fara generare factura.
- `Preturi` permite definirea listelor de pret si a preturilor comerciale pe produs.
- `Discounturi` permite definirea campaniilor/regulilor comerciale pe global, client, produs sau categorie.
- `Livrari` permite creare livrare din comanda sau client, urmarire curier/AWB/status si pozitii livrate.
- `Oferte` permite acum import de documente PDF, Word (`.doc`, `.docx`) si Excel (`.xls`, `.xlsx`).
- La importul unei oferte se aloca automat un numar de inregistrare de tip `OFE-YYYY-00001`.
- Documentul importat poate fi atribuit unui client existent sau unui client nou creat direct din formularul de import.
- Ofertele importate sunt listate intr-un registru separat, cu numar de inregistrare, client, document si actiune de descarcare.
- Validare:
  - au fost rulate verificarile `node --check` pentru schema, rute si pagini UI;
  - migratia SQLite a fost rulata local si noile tabele `sales_*` au fost create;
  - render-ele pentru paginile noi de Vanzari au fost verificate local.

### Modul Financiar & Contabilitate Nexora
- A fost mutat punctul principal al modulului Financiar & Contabilitate pe `/nexora/accounting`, fara modificari pe fluxurile de facturi si e-Factura/ANAF.
- Au fost adaugate tabele contabile dedicate pentru:
  - plati si incasari operationale;
  - note contabile / registre;
  - bugete;
  - tranzactii bancare pentru reconciliere.
- Au fost facute functionale meniurile:
  - `Cheltuieli`;
  - `Declaratii`;
  - `Plati`;
  - `Incasari`;
  - `Registre`;
  - `Bonuri de consum`;
  - `Balanta`;
  - `Cashflow`;
  - `Bugete`;
  - `Reconciliere bancara`;
  - `TVA`;
  - `Active fixe`.
- `Declaratii` include acum catalog rapid pentru modelele uzuale ANAF (`D100`, `D101`, `D112`, `D300`, `D390`, `D394`, `D406`, `D700`, `D710`, `D212`) cu link catre sursa oficiala ANAF pentru descarcarea PDF-urilor inteligente.
- Fluxul de declaratii ramane local/manual pana la rezolvarea accesului OAuth/SPV ANAF: se pot pregati, incarca fisiere, urmari statusuri si recipise, dar nu s-a activat trimiterea automata catre ANAF.
- `TVA` centralizeaza informativ TVA colectata din facturi existente si TVA deductibila din cheltuieli, fara sa modifice modulul Facturi.
- `Active fixe` foloseste registrul de inventar existent si adauga calcul informativ de amortizare liniara.
- Validare:
  - au fost rulate verificarile `node --check` pentru `routes/accounting-routes.js`, `src/ui/nexora-accounting-pages.js`, `db.js` si `src/config/erp-modules.js`;
  - migratia SQLite a fost rulata local si noile tabele au fost create.

## 2026-05-28

### Modul Dashboard Nexora
- Lista `Facturi recente` de pe `/nexora-dashboard` a fost curatata vizual si limitata la ultimele 3 facturi.
- Statusul facturilor nu mai este afisat in cardul de dashboard; randurile arata acum numarul, clientul, data emiterii si totalul.
- Searchbar-ul din dashboard este functional si trimite catre `/nexora/search`.
- A fost adaugata pagina de rezultate pentru cautare globala peste clienti, facturi, produse si documente DMS.
- Verificare modul Client:
  - exista deja listare `/nexora/clients`, cautare server-side, adaugare client dupa CUI, fisa client, contacte, activitati, contracte, oferte, facturi si timeline;
  - endpoint-ul `/clients/search` exista deja pentru autocomplete in fluxurile care au nevoie de selectare client.

### Infrastructura Cloudflare Nexora
- A fost creat tunnel-ul Cloudflare dedicat `nexora` pentru hostname-ul `https://nexora.aafastitsolutions.ro`.
- Hostname-ul nou a fost conectat la aplicatia locala Nexora de pe `127.0.0.1:3000`.
- Serviciul user systemd `cloudflared-nexora.service` a fost creat si activat.
- Variabila operationala `APP_URL` a fost setata la `https://nexora.aafastitsolutions.ro`.
- Ruta veche `crm.qr-lab.ro` a fost scoasa din ingress-ul local `qr-lab`; domeniul raspunde acum cu `404`.
- Tunnel-ul Cloudflare vechi `minicrm` a fost sters; domeniul vechi `minicrm.qr-lab.ro` raspunde acum cu `1033`.
- Landing-ul public vechi MiniCRM de pe ruta `/` si `/landing` a fost dezactivat; utilizatorii neautentificati sunt trimisi direct la login, iar utilizatorii autentificati la workspace-ul lor.
- Pagina de login a fost rebotezata vizual pe Nexora (`Nexora Login`, `Nexora ERP Cloud`), ca pe domeniul nou sa nu mai apara identitatea MiniCRM.

### ANAF / SPV pe domeniul Nexora
- Redirect-ul OAuth ANAF implicit a fost mutat pe `https://nexora.aafastitsolutions.ro/oauth/anaf/callback`.
- Setarile salvate in `app_settings` pentru `anaf_redirect_uri` si pentru companiile configurate au fost actualizate pe domeniul Nexora.
- Aplicatia Nexora a fost repornita dupa actualizarea redirect-ului.
- Observatie operationala: aceeasi adresa trebuie trecuta si in aplicatia din contul ANAF/SPV, altfel ANAF va respinge callback-ul OAuth.
- De reluat in portalul ANAF OAuth:
  - accesare `https://www.anaf.ro/InregOauth`;
  - autentificare cu certificatul digital;
  - intrare in `Editare profil OAuth` -> `Gestionare aplicatii`;
  - editarea aplicatiei existente Nexora/MiniCRM sau crearea unei aplicatii noi;
  - setarea campului `Callback URL` / `Redirect URI` la `https://nexora.aafastitsolutions.ro/oauth/anaf/callback`;
  - daca ANAF genereaza un `Client ID` si `Client Secret` nou, acestea trebuie actualizate in setarile Nexora pentru ANAF/SPV.

## 2026-03-30

### Identitate si infrastructura
- Numele proiectului a fost aliniat la `MiniCRM` in `package.json` si `package-lock.json`.
- Brandingul tehnic ramas pe vechiul nume a fost actualizat in `server.js`.
- Aplicatia a fost publicata pe `https://minicrm.qr-lab.ro` prin `nginx` si `Cloudflare Tunnel`.
- Serviciul systemd activ a fost migrat de la `contracts-app` la `minicrm`.
- Directorul aplicatiei a fost redenumit din `/home/server/contracts-app` in `/home/server/minicrm`.
- Automatizarea de backup a fost activata prin `minicrm-backup.timer`.

### Curatare si siguranta proiect
- Au fost mutate fisierele reziduale si backupurile istorice din radacina in `_project_archive`.
- A fost verificata integritatea bazelor SQLite principale.
- Au fost reparate migrarile din `db.js` pentru a crea schema reala folosita de aplicatie.
- Au fost adaugate tabelele si coloanele lipsa pentru zona ANAF:
  - `anaf_connections`
  - `anaf_inbox`
  - `anaf_oauth_logs`
  - coloane noi in `facturi` pentru trasabilitatea e-Factura
  - coloana `details` in `anaf_messages`

### Hardening aplicatie
- Sesiunile au fost intarite:
  - `trust proxy`
  - cookie dedicat `minicrm.sid`
  - `httpOnly`
  - `sameSite`
  - `secure: auto`
  - regenerare sesiune la login
- Logout-ul sterge explicit cookie-ul de sesiune.

### Refactorizare cod
- Configuratia si helper-ele comune au fost extrase in:
  - `lib/app-config.js`
  - `lib/helpers.js`
  - `lib/bootstrap.js`
  - `lib/anaf.js`
  - `lib/anaf-efactura.js`
- Rutele au fost extrase din monolitul `server.js` in module dedicate:
  - `routes/auth-routes.js`
  - `routes/anaf-routes.js`
  - `routes/anaf-oauth-routes.js`
  - `routes/dashboard-routes.js`
  - `routes/quotes-routes.js`
  - `routes/facturi-routes.js`
  - `routes/contracts-routes.js`
  - `routes/clients-routes.js`

### ANAF / OAuth / e-Factura
- Redirect URI activ in aplicatie:
  - `https://minicrm.qr-lab.ro/oauth/anaf/callback`
- A fost implementat fluxul OAuth ANAF:
  - start autorizare
  - callback
  - salvare token-uri in `anaf_connections`
  - refresh automat al token-ului
  - jurnalizare evenimente OAuth in `anaf_oauth_logs`
- A fost implementata integrarea initiala e-Factura cu endpointurile ANAF:
  - upload XML factura
  - verificare status mesaj
  - descarcare raspuns SPV atunci cand este disponibil
- In UI facturii sunt afisate acum:
  - status e-Factura
  - index incarcare
  - id descarcare
  - ultima verificare
  - ultima eroare
  - link catre arhiva raspunsului SPV, cand exista

### Backupuri create manual pentru siguranta
- Backup SQLite:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-03-30T15-10-05Z.db`
  - SHA256: `4ecd5ec9f27fcf8e4ae58066d9c50cf12fe86dfe2c234b05bedb642560795e82`
- Snapshot complet aplicatie:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-03-30T15-10-05Z.tar.gz`
  - SHA256: `0bc5853055e4945aefd6286159dd03346e4545e84b7794f9aeaac8e31f072502`
  - continut: cod sursa, baza de date, documente generate, configurari locale, fisiere operationale
  - excluse din arhiva: `node_modules`, `backups`

### Operatiuni finale dupa migrare
- A fost eliminat serviciul vechi `contracts-app` din `systemd`, inclusiv fisierul de backup asociat.
- Configuratia activa `systemd` foloseste acum exclusiv:
  - `/etc/systemd/system/minicrm.service`
  - `/etc/systemd/system/minicrm-backup.service`
  - `/etc/systemd/system/minicrm-backup.timer`
- A fost confirmat ca directorul vechi `/home/server/contracts-app` nu mai exista pe server.
- A fost creat un backup SQLite suplimentar dupa curatarea finala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-03-30T16-57-55Z.db`
  - SHA256: `4ecd5ec9f27fcf8e4ae58066d9c50cf12fe86dfe2c234b05bedb642560795e82`
  - moment UTC: `2026-03-30T16:57:55Z`
- A fost creat un snapshot complet suplimentar al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-03-30T17-42-51Z.tar.gz`
  - SHA256: `27c9dd9cda3c3292842a3a854753cd56f0054dd6e40f605c89b77c817a772816`
  - continut: cod sursa, baza de date, documente generate, configurari locale, fisiere operationale
  - excluse din arhiva: `node_modules`, `backups`
  - moment UTC: `2026-03-30T17:42:51Z`

### Verificari efectuate
- Verificare sintaxa:
  - `node --check server.js`
  - `node --check db.js`
  - `node --check` pentru modulele si rutele nou create
- Verificare disponibilitate aplicatie:
  - raspuns `200 OK` pe `https://minicrm.qr-lab.ro/login`
- Verificare backup:
  - fisierele de backup exista in `backups/` si `backups/sqlite/`
  - checksum-urile au fost calculate si notate mai sus

### Observatii operationale
- Fluxul complet ANAF nu poate fi testat end-to-end pana la activarea certificatului digital calificat in SPV.
- In momentul activarii certificatului, ordinea de test recomandata este:
  1. `Conecteaza contul ANAF`
  2. creeaza factura de test
  3. `Trimite e-Factura`
  4. `Verifica status SPV`
  5. verifica aparitia confirmarii si a raspunsului descarcat din ANAF

### Billing, companii si plati
- A fost extins modelul multi-company pentru onboarding comercial:
  - signup companie noua din UI
  - planuri de abonament
  - statusuri comerciale `trial`, `active`, `past_due`, `suspended`
  - panou `Super Admin > Companii` cu filtre, audit si control status
- Dashboard-ul super-admin a fost separat de dashboard-ul tenant-urilor si afiseaza indicatori de platforma:
  - companii active
  - companii restante
  - companii suspendate
  - distributie pe planuri
- A fost adaugat modulul `Plati` in super-admin pentru evidenta centralizata a platilor.
- A fost introdus registrul unic `billing_payments` pentru:
  - Stripe
  - OP / plati manuale
  - statusuri de plata
  - initiatorul platii
  - referinte Stripe
  - legatura cu factura generata intern
- Webhook-urile Stripe actualizeaza acum registrul de plati pentru:
  - checkout initiat
  - checkout finalizat
  - `invoice.paid`
  - `invoice.payment_failed`
- In UI-ul de admin se poate vedea acum:
  - cine a initiat plata
  - cine a platit
  - ce plati au reusit
  - ce plati au esuat
  - ce plati prin OP asteapta verificare
- A fost adaugat formular pentru inregistrarea manuala a platilor prin OP.
- Auditul pe companie afiseaza si ultimele plati cunoscute in sistem.

### Auto-facturare billing
- A fost pregatit fluxul de auto-facturare pentru abonamentele platite, folosind modulul intern de facturi al aplicatiei.
- Factura se va genera automat pe numele companiei care a facut plata, in compania emitenta a platformei.
- Auto-facturarea este controlata prin variabilele de mediu:
  - `BILLING_AUTO_INVOICE_ENABLED`
  - `BILLING_AUTO_INVOICE_LIVE_ONLY`
  - `BILLING_ISSUER_COMPANY_ID`
- In modulul de plati se afiseaza statusul generarii facturii si, cand exista, link catre factura generata.
- A fost corectata schema `clients` pentru a permite unicitate per companie:
  - index unic nou pe `(company_id, cui)`
  - eliminarea constrangerii vechi care forta unicitate globala pe `cui`

### Backupuri suplimentare dupa modulul de billing
- Backup SQLite:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-03-30T20-06-26Z.db`
  - marime: `340K`
  - SHA256: `39e8d85d16c369caecf9c58c19b869c212c20c8a8b4a659553128e2540de3a6f`
  - moment UTC: `2026-03-30T20-06-26Z`
- Snapshot complet aplicatie:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-03-30T20-06-38Z.tar.gz`
  - marime: `8.0M`
  - SHA256: `43db3f098be17f96f472ec265215a81521567aabcb6e869bd9372395ec4def57`
  - excluse din arhiva: `node_modules`, `backups`
  - moment UTC: `2026-03-30T20-06-38Z`

## 2026-04-01

### Backupuri noi inainte de modulul contabil
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-01T10-44-45Z.db`
  - SHA256: `74ae2c6e21463a9bcb1149195cadebe253d7355b2b860684066dd419163cd663`
  - moment UTC: `2026-04-01T10-44-45Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-01T10-44-45Z.tar.gz`
  - SHA256: `925f0be3853e3648708deac2e5e982d21a9fb188da2efae6152c0205d3f0769f`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-01T10-44-45Z`
- Verificare operationala:
  - ultimul snapshot complet anterior era mai vechi decat modificarile din `server.js` si `sessions.db`
  - dupa aceasta operatiune exista din nou backup complet actualizat al proiectului

### Backupuri noi inainte de modulul inventar
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-01T13-05-27Z.db`
  - marime: `396K`
  - SHA256: `706892805f6560e18afd30abd9c285a7170d9cf07dd7c19814e9fa82c7c08fb3`
  - moment UTC: `2026-04-01T13-05-27Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-01T13-05-27Z.tar.gz`
  - marime: `8.0M`
  - SHA256: `b3fcce840748a0d3b6b2326c32a3cd359276566e265413a2e0217997ec5fba7c`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-01T13-05-27Z`
- Context:
  - backupul a fost facut dupa rafinarile recente ale dashboardului contabil si ale navigatiei dedicate pentru rolul `accounting`
  - acesta este punctul de revenire inainte de inceperea modulului `Inventar`

### Backupuri noi dupa extinderea modulului inventar
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-01T14-11-50Z.db`
  - marime: `396KB`
  - SHA256: `c1bf10ca48d504ee66100d284b91fc9793e942e1bdb0043b0501f7c50694820a`
  - moment UTC: `2026-04-01T14-11-50Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-01T14-11-50Z.tar.gz`
  - marime: `8.0MB`
  - SHA256: `404e8d256d8e2e4139bacc5465acd1b9a1a84d294feeb9e5054266704b0c1f1f`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-01T14-11-50Z`
- Context:
  - backupul a fost facut dupa implementarea modulului `Inventar`
  - include dashboardul de inventar, registrul de active, inventarul pe proiect, rapoartele, numararea de inventar si administrarea de baza pentru active si proiecte

### Urmatorul pas planificat pentru modulul inventar
- La urmatoarea sesiune vom continua cu fluxurile de miscare a inventarului:
  - transfer active intre locatii
  - alocare si retur pe proiect
  - jurnal de miscari pentru trasabilitate
- Optional, dupa aceste fluxuri:
  - exporturi mai avansate
  - documente PDF pentru inventar / proces verbal / fise

## 2026-04-08

### Backup manual aplicatie
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-08T10-48-47Z.db`
  - marime: `496K`
  - SHA256: `f4d1fd72f7769c3c2971e19cfd6f26e1695b2a5f04bc2aba6fcfd03b5c4a89c1`
  - moment UTC: `2026-04-08T10-48-47Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-08T10-48-47Z.tar.gz`
  - marime: `7.6M`
  - SHA256: `b7f072affccb38c3524f7323a5a116f88f04be70e86d23ca5e459ad1e586f7a3`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-08T10-48-47Z`
- Context:
  - backupul a fost facut manual, la cerere, pentru a avea un punct de revenire actualizat
  - snapshotul complet include codul sursa, bazele SQLite si fisierele operationale din proiect

### Validare SPV in productie
- A fost confirmat ca fluxul SPV / e-Factura functioneaza corect in mediul de productie.
- Au inceput sa fie receptionate facturile recente, ceea ce confirma sincronizarea corecta cu SPV.
- A fost emisa cu succes o factura in productie.
- Concluzie operationala:
  - validarea end-to-end pentru fluxul live este acum confirmata
  - observatia mai veche despre imposibilitatea testarii complete pana la activarea in productie nu mai este valabila

### Corectie descarcare raspuns SPV
- A fost corectat bugul in care linkul catre arhiva raspunsului ANAF returna `Cannot GET /efactura_responses/...` desi fisierul ZIP exista pe server.
- Aplicatia expune acum o ruta dedicata pentru descarcarea raspunsului SPV din pagina facturii:
  - `/factura/:id/efactura/raspuns`
- A fost pastrata si compatibilitatea pentru linkurile deja salvate in formatul vechi:
  - `/efactura_responses/:fileName`
- Verificare:
  - arhiva `FITS-049-7142361706.zip` raspunde acum cu `200 OK` prin ambele rute protejate

### Confirmare descarcare raspuns SPV din UI
- A fost confirmat din browser ca arhiva SPV se descarca efectiv dupa fix.
- Utilizatorul a primit fisierul ZIP care contine ID-ul si semnatura aferente raspunsului ANAF.
- Validare operationala:
  - fluxul complet pentru descarcare raspuns SPV este functional in productie
  - fixul pentru linkul de raspuns SPV este confirmat si la nivel de utilizare reala, nu doar prin test tehnic

### Instructiune operationala pentru firme noi - facturare si e-Factura
- A fost adaugat documentul:
  - `/home/server/minicrm/ops/INSTRUCTIUNE_FIRMA_NOUA_EFACTURA.md`
- Scop:
  - standardizarea pasilor pentru onboarding-ul unei firme noi care vrea sa emita facturi si sa foloseasca SPV / RO e-Factura in aplicatie
- Continut:
  - preconditiile minime pentru activare
  - pasii practici pentru conectarea SPV
  - regula operationala pentru prima factura
  - cazurile in care trebuie refacuta partea de acces ANAF

### Flux reautorizare SPV prin contabil
- A fost implementat un flux nou pentru refacerea conexiunii SPV dupa expirare, invalidare token sau reinnoirea certificatului digital.
- Aplicatia poate genera acum un cod securizat si un link temporar pentru contabil, valabile 24 de ore.
- A fost adaugat un portal public pentru introducerea manuala a codului:
  - `/anaf/reautorizare`
- Fluxul este integrat in:
  - `Status ANAF`
  - pagina facturii, atunci cand apare lipsa conexiunii SPV
  - `Inbox e-Factura`, atunci cand sincronizarea esueaza din cauza autorizarii
- Comportament:
  - codul / linkul pot fi trimise contabilului
  - contabilul continua autorizarea ANAF din browserul lui
  - la succes, conexiunea se salveaza pe firma curenta
  - linkurile vechi sunt invalidate automat cand se genereaza unul nou

### Backup manual aplicatie
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-08T12-42-47Z.db`
  - marime: `520KiB`
  - SHA256: `0fd17e00b5efd667f97dda3ad4539e37ff57291abc09b66b25fb501766e980c6`
  - moment UTC: `2026-04-08T12-42-47Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-08T12-42-47Z.tar.gz`
  - marime: `7.6MiB`
  - SHA256: `b5d4db0d2dd9cfb19135aa95c227ef68201f0f5dcb3d029c2a75496eb5ccdc01`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-08T12-42-47Z`
- Context:
  - backupul a fost facut manual, la cerere, pentru a avea un punct de revenire actualizat
  - snapshotul complet include codul sursa, bazele SQLite si fisierele operationale din proiect

### Backup manual si polish auth / pachete
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-08T18-33-54Z.db`
  - marime: `520KiB`
  - SHA256: `ce8c05b7967b1bfd05ec688d3a8269fc994eb26894045423785d37c312d46ad4`
  - moment UTC: `2026-04-08T18-33-54Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-08T18-33-54Z.tar.gz`
  - marime: `7.7MiB`
  - SHA256: `a3622314b1e19b58395187574c1cc75344fe6e8dc56ada1d99866c5eb4927b13`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-08T18-33-54Z`
- Modificari functionale si vizuale:
  - a fost extras un renderer comun pentru cardurile de pachete in `lib/plan-cards.js`
  - landing page-ul public foloseste acum aceeasi randare de pachete ca signup-ul, in locul variantei vechi separate
  - sectiunea de pachete din signup a fost refacuta pe orizontala, cu carduri mai compacte si mai curate vizual
  - pagina de login / signup a fost aliniata la tema MiniCRM, cu fundal mai apropiat de interfata principala si carduri light mai clare
  - contrastul si greutatea textelor au fost crescute pentru titluri, etichete, descrieri si cardurile de pachete, pentru a elimina aspectul prea "spalat"
  - CTA-ul din login catre abonamente a fost generalizat la `Vezi pachetele disponibile`
- Fisiere atinse:
  - `/home/server/minicrm/lib/plan-cards.js`
  - `/home/server/minicrm/server.js`
  - `/home/server/minicrm/routes/auth-routes.js`
- Validare:
  - serverul MiniCRM a fost repornit dupa modificari
  - au fost verificate rutele `/`, `/login` si `/signup/company`

### Fix numerotare facturi si compactare UI workspace
- A fost corectat fluxul de emitere pentru facturi:
  - numarul oficial de factura se aloca acum inainte de PDF / XML / e-Factura
  - a fost eliminat comportamentul in care factura ramanea cu identificator provizoriu de tip `DRAFT-*`
  - factura existenta `7` a fost corectata din starea provizorie la numerotare finala
- Navigatia si shell-ul aplicatiei au fost compacte pentru ecrane mai mici:
  - meniurile laterale, topbar-ul, cardurile, tabelele si controalele globale au primit spacing redus
  - selectorul de tema din sidebar a fost refacut ca dropdown
  - in sidebar-ul din dreapta, zona `SPV / e-Factura` a fost refacuta ca dropdown de navigare
- Paginile ajustate vizual in mod special:
  - `Dashboard`
  - `Facturi`
  - `Clienți`
  - `Contabilitate`
- Dashboardul de super-admin a fost simplificat:
  - a fost eliminat panoul mare de tip hero din partea superioara
  - au ramas doar blocurile utile, mai compacte si mai potrivite pentru laptopuri mici
- Fisiere atinse in aceasta serie de modificari:
  - `/home/server/minicrm/server.js`
  - `/home/server/minicrm/routes/dashboard-routes.js`
  - `/home/server/minicrm/routes/facturi-routes.js`
  - `/home/server/minicrm/routes/clients-routes.js`
  - `/home/server/minicrm/routes/accounting-routes.js`
- Validare:
  - au fost rulate verificari de sintaxa cu `node --check` pentru fisierele modificate
  - serviciul `minicrm` a fost repornit dupa actualizari

### Backup manual aplicatie dupa ajustarile UI
- A fost creat un backup SQLite nou pentru baza principala:
  - fisier: `/home/server/minicrm/backups/sqlite/database-2026-04-20T18-16-43Z.db`
  - marime: `532K`
  - SHA256: `eb633efdcea7f0ae584653ad43b4683756e634f752700e3ec243412b398c71a8`
  - moment UTC: `2026-04-20T18-16-43Z`
- A fost creat un snapshot complet nou al aplicatiei:
  - fisier: `/home/server/minicrm/backups/minicrm-full-2026-04-20T18-16-43Z.tar.gz`
  - marime: `7.8M`
  - SHA256: `e37b37a7363026863e139a128c350ae367f22c2eebf1bf15ed6656dcf6a504f8`
  - excluse din arhiva: `node_modules`, `backups`, `.git`
  - moment UTC: `2026-04-20T18-16-43Z`
- Context:
  - backupul a fost facut manual, dupa fixurile de facturare si dupa compactarea UI-ului
  - snapshotul complet include codul sursa, bazele SQLite si fisierele operationale din proiect

## 2026-06-03 - Trevoro / Nexora Travel

### Legare site public Trevoro la proprietatea de test
- A fost legata proprietatea activa din Nexora Travel:
  - nume: `Casa la Nea Gica`
  - slug public: `1-casa-la-nea-gica-chitorani`
  - URL listare: `https://www.trevoro.ro/properties/1-casa-la-nea-gica-chitorani`
- Site-ul public `ROTravel` foloseste API-ul Nexora pentru proprietatile active.
- Cautarea publica gaseste proprietatea de test prin filtre:
  - `https://www.trevoro.ro/search?destination=chitorani&guests=2`
- Cardurile din cautare pastreaza parametrii de sejur relevanti:
  - `checkin`
  - `checkout`
  - `guests`

### Conturi test proprietar si client
- Contul de proprietar test a fost legat explicit de `Casa la Nea Gica`.
- Contul de client test are `Casa la Nea Gica` ca proprietate favorita.
- Credentialele si linkurile utile sunt documentate in:
  - `/home/server/Nexora/utile/trevoro-conturi-test.txt`
- Dashboard proprietar:
  - `https://www.trevoro.ro/dashboard/partner`
  - afiseaza listarea reala, statusul activ, tariful estimat, capacitatea si galeria pregatita pentru maximum 20 poze
- Dashboard client:
  - `https://www.trevoro.ro/dashboard/user`
  - afiseaza proprietatea favorita, actiuni de filtrare si intrare in checkout

### Checkout client pregatit
- A fost adaugata ruta protejata:
  - `https://www.trevoro.ro/checkout/1-casa-la-nea-gica-chitorani?checkin=2026-07-10&checkout=2026-07-12&guests=2`
- Accesul la checkout este permis doar pentru rolul `client`.
- Daca utilizatorul nu este autentificat, este trimis la login si se pastreaza URL-ul complet de revenire.
- Checkout-ul calculeaza:
  - perioada
  - numar nopti
  - numar oaspeti
  - total estimat
  - comision Trevoro `0 lei`
- Plata reala este dezactivata intentionat pana la configurarea Stripe si a modelului de rezervari.

### Validare
- Pentru `ROTravel` au fost rulate:
  - `npm run lint`
  - `npm run build`
- Build-ul Next.js a trecut cu succes.
- Serviciul `trevoro-site.service` a fost repornit si este activ.
- Serviciul `cloudflared-nexora.service` este activ.
- Verificari live:
  - cautarea publica pe `www.trevoro.ro` gaseste `Casa la Nea Gica`
  - checkout-ul fara login redirectioneaza corect catre `/login`
  - redirectul pastreaza query-ul de checkout
  - contul de proprietar vede `Casa la Nea Gica` in dashboard
  - contul de client vede proprietatea si poate accesa checkout-ul
  - contul de proprietar nu poate accesa checkout-ul de client

### Fisiere modificate in aceasta etapa
- In `/home/server/ROTravel`:
  - `src/lib/auth.ts`
  - `src/lib/nexora-api.ts`
  - `src/proxy.ts`
  - `src/app/login/page.tsx`
  - `src/app/api/auth/login/route.ts`
  - `src/components/property-card.tsx`
  - `src/app/search/page.tsx`
  - `src/app/properties/[slug]/page.tsx`
  - `src/app/dashboard/partner/page.tsx`
  - `src/app/dashboard/user/page.tsx`
  - `src/app/checkout/[slug]/page.tsx`
- In `/home/server/Nexora`:
  - `utile/trevoro-conturi-test.txt`
  - `ops/JURNAL_MODIFICARI.md`

### Pasii urmatori recomandati
- Implementare rezervari in baza de date:
  - tabela rezervari
  - statusuri: cerere, confirmata, platita, anulata
  - legatura cu proprietate, client si perioada
- Activare Stripe Checkout:
  - creare sesiune plata
  - webhook pentru confirmarea platii
  - salvarea tranzactiei si statusului rezervarii
- Disponibilitate si calendar:
  - blocare intervale ocupate
  - sincronizare iCal Google / Outlook / Booking / Airbnb
  - prevenire suprapuneri
- Cont proprietar real:
  - editare date proprietate
  - upload poze direct din dashboard proprietar
  - administrare preturi si disponibilitate
  - vizualizare cereri si rezervari
- Cont client real:
  - istoric rezervari
  - favorite persistente
  - mesaje / cereri catre proprietar
  - facturi sau confirmari dupa plata
- Integrare completa cu Nexora Travel:
  - creare cont proprietar dupa inscriere
  - asociere automata lead -> proprietate -> cont proprietar
  - sincronizare statusuri intre site si Nexora

### Automatizare follow-up pentru lead-uri interesate
- A fost adaugat scriptul:
  - `scripts/follow-up-interested-travel-replies.mjs`
- Scop:
  - proceseaza lead-urile `interesat` care au primit raspuns email
  - cauta adrese email alternative mentionate in corpul raspunsului
  - trimite automat un mesaj de clarificare catre contactul alternativ
  - salveaza mesajul outbound in `travel_email_messages`
  - adauga activitate in timeline cu tipul `interested_alt_followup_sent`
  - evita retrimiterea pentru acelasi lead si aceeasi adresa alternativa
- Jobul zilnic `scripts/run-trevoro-daily-outreach.mjs` ruleaza acum acest pas:
  - dupa `sync_before`
  - dupa `sync_after`
- A fost procesat cazul real:
  - lead `3380` / `Lyra`
  - raspuns primit de la `office@hotel-lyra.ro`
  - contact alternativ detectat: `corina.bacioiu@plastor.ro`
  - follow-up trimis cu subiectul `Trevoro - clarificare pentru Lyra`
- Validare:
  - `node --check scripts/follow-up-interested-travel-replies.mjs`
  - `node --check scripts/run-trevoro-daily-outreach.mjs`
  - `node scripts/follow-up-interested-travel-replies.mjs --dry-run --limit 20`
  - `node scripts/follow-up-interested-travel-replies.mjs --limit 20`
  - `node scripts/run-trevoro-daily-outreach.mjs --dry-run --limit 1 --delay-ms 0`
  - `node --test tests/*.mjs`

### Verificare erori outreach si pagina proprietar Trevoro
- Verificare operationala emailuri pentru 2026-06-04:
  - outbound: `101`
  - inbound: `2`
  - bounce: `11`
  - outbound_failed: `0`
- Batch-ul zilnic de outreach a rulat cu succes:
  - `trevoro-daily-outreach.service`
  - 100 emailuri trimise
  - 0 esecuri in raportul de trimitere
- Timerul zilnic este activ:
  - `trevoro-daily-outreach.timer`
  - programare: zilnic la 09:30 Europe/Bucharest, cu RandomizedDelaySec 10m
- Timerul de sincronizare email este activ:
  - `trevoro-email-sync.timer`
  - ruleaza la fiecare 5 minute
- Verificarea/repararea erorilor este inclusa in jobul zilnic:
  - `repair_failed_emails`
  - verifica bounce/outbound_failed
  - cauta email alternativ in registrul turistic oficial
  - marcheaza fallback WhatsApp daca nu gaseste email si exista telefon
- Nota operationala a fost actualizata:
  - `utile/trevoro-daily-outreach-job.txt`

### API proprietar Trevoro conectat la Nexora Travel
- Au fost adaugate endpoint-uri API server-to-server pentru pagina proprietarului:
  - `GET /api/trevoro/owner/properties/:propertySlug/dashboard`
  - `POST /api/trevoro/owner/properties/:propertySlug`
  - `POST /api/trevoro/owner/properties/:propertySlug/photos`
  - `POST /api/trevoro/owner/properties/:propertySlug/photos/:photoId/delete`
  - `POST /api/trevoro/owner/properties/:propertySlug/calendar-links`
  - `POST /api/trevoro/owner/properties/:propertySlug/calendar-links/:calendarId/delete`
  - `POST /api/trevoro/owner/properties/:propertySlug/inquiries/:inquiryId/status`
- Endpoint-urile sunt protejate cu `TREVORO_OWNER_API_SECRET`.
- Secretul server-to-server a fost adaugat in:
  - `/home/server/.config/nexora/runtime.env`
  - `/home/server/.config/systemd/user/trevoro-site.service`

### Pagina proprietar ROTravel
- Dashboard-ul proprietarului din `ROTravel` a fost conectat la date reale din Nexora:
  - editare date listare
  - upload poze, maximum 20
  - stergere poze
  - adaugare/stergere calendar iCal/Google/Outlook
  - afisare cereri clienti
  - schimbare status cerere
- A fost incarcata o poza reala pentru proprietatea de test:
  - `Casa la Nea Gica`
  - galeria are acum 1/20 poze
- A fost creata o cerere de test pentru proprietate:
  - client: `Client Test Trevoro`
  - status schimbat din pagina proprietarului la `contactat`
- Pagina publica a proprietatii afiseaza poza incarcata din Nexora:
  - `https://www.trevoro.ro/properties/1-casa-la-nea-gica-chitorani`

### Fisiere modificate in aceasta etapa
- In `/home/server/Nexora`:
  - `routes/travel-routes.js`
  - `utile/trevoro-daily-outreach-job.txt`
  - `ops/JURNAL_MODIFICARI.md`
- In `/home/server/ROTravel`:
  - `src/lib/owner-api.ts`
  - `src/app/dashboard/partner/page.tsx`
  - `src/app/api/dashboard/partner/property/route.ts`
  - `src/app/api/dashboard/partner/photos/route.ts`
  - `src/app/api/dashboard/partner/photos/[photoId]/route.ts`
  - `src/app/api/dashboard/partner/calendar/route.ts`
  - `src/app/api/dashboard/partner/calendar/[calendarId]/route.ts`
  - `src/app/api/dashboard/partner/inquiries/[inquiryId]/route.ts`
- Configurari systemd/env:
  - `/home/server/.config/nexora/runtime.env`
  - `/home/server/.config/systemd/user/trevoro-site.service`

### Validare
- Nexora:
  - `node --check routes/travel-routes.js`
  - `node --check scripts/run-trevoro-daily-outreach.mjs`
  - `node --check scripts/follow-up-interested-travel-replies.mjs`
  - `node --test tests/*.mjs`
- ROTravel:
  - `npm run lint`
  - `npm run build`

## 2026-06-05 - Test sandbox Stripe rezervari Trevoro

### Ce s-a reparat
- Ruta Trevoro `POST /api/booking-requests` trimite acum payload-ul catre Nexora ca `application/x-www-form-urlencoded`, ca backend-ul Express sa primeasca datele corect in `req.body`.
- Redirect-ul de eroare/succes din aceeasi ruta foloseste URL absolut, conform cerintei Next pentru `NextResponse.redirect`.

### Test efectuat
- Login client test: reusit.
- Cerere rezervare test pentru Casa la Nea Gica: creata in Nexora.
- Acceptare cerere ca proprietar: reusita.
- Creare Stripe Checkout Session sandbox: reusita.
- Verificare sesiune in Stripe API: reusita.
- Webhook Stripe semnat pentru `checkout.session.completed`: acceptat de `/api/stripe/webhook`.
- Rezervarea a ajuns in Nexora cu `status=paid`, `stripe_payment_status=paid` si `paid_at` setat.

### Verificare
- Trevoro:
  - `npm run build`
- Verificare live:
  - login proprietar test redirectioneaza la `/dashboard/partner`
  - dashboard-ul afiseaza bannerul `abonament necesar`
  - `POST /api/dashboard/partner/billing/checkout` redirectioneaza catre Stripe Checkout
  - in DB s-a creat plata `initiated` de `129 RON`, fara plata finalizata

### Fix dupa test plata
- Corectat `success_url` pentru abonamentul proprietar: foloseste explicit `https://www.trevoro.ro`, nu `APP_URL` Nexora.
- Adaugat redirect de siguranta in Nexora: `/dashboard/partner` -> `https://www.trevoro.ro/dashboard/partner`.
- `checkout.session.completed` cu `payment_status=paid` activeaza imediat proprietatea si genereaza factura/PDF/email, fara sa depinda exclusiv de `invoice.paid`.
- Plata de test pentru `Casa la Nea Gica` a fost procesata retroactiv:
  - proprietate: `active`
  - plata: `paid`
  - factura: `FITS-057`
  - PDF: `contracts/invoices/2026/FITS-057.pdf`
  - email factura trimis catre proprietar, CC `contact@trevoro.ro`

### Fix status listare la plata necesara
- Cand un checkout de abonament proprietar este initiat, `travel_properties.status` devine `plata_necesara`, nu ramane `activ`.
- Cand plata Stripe este confirmata, webhook-ul seteaza inapoi `travel_properties.status='activ'` si `subscription_status='active'`.
- Endpoint-urile owner pot incarca proprietatea si cand nu este publica, ca proprietarul sa poata plati/administra listarea.
- Site-ul Trevoro nu mai foloseste fallback demo pentru un slug pe care Nexora il returneaza 404.
- Verificare controlata:
  - dashboard proprietar: afiseaza `Plata necesara` + `Activeaza abonamentul`
  - API public proprietate: 404 cat timp statusul este `plata_necesara`
  - pagina publica proprietate: 404 cat timp statusul este `plata_necesara`
  - proprietatea de test a fost restaurata la `activ` / `active`

### Revenire e-Factura pe productie si curatare teste
- e-Factura a fost trecuta pe productie:
  - `EFACTURA_ENVIRONMENT=prod`
  - `EFACTURA_PRODUCTION_ENABLED=true`
  - `BILLING_EFACTURA_TEST_SIMULATION_ENABLED=false`
  - `anaf_environment=prod` in `app_settings`
- Au fost sterse facturile de test cu total `129 RON`:
  - `FITS-053`
  - `FITS-054`
  - `FITS-055`
  - `FITS-056`
  - `FITS-057`
  - `FITS-058`
- Au fost sterse liniile de factura, logurile e-Factura si fisierele PDF/XML aferente.
- Platile Stripe test aferente au ramas in istoric, dar fara `generated_factura_id`, marcate cu `invoice_generation_status='test_invoice_deleted'`.
- Verificare:
  - `facturi_129_ron = 0`
  - `linii_orfane = 0`
  - `anaf_orfane = 0`

### Stripe live
- Stripe a fost trecut de pe chei test pe chei live in:
  - Nexora runtime env
  - Trevoro service env
  - Trevoro `.env`
- Serviciile `nexora.service` si `trevoro-site.service` au fost repornite.
- ID-urile Stripe sandbox vechi de pe compania proprietatii test au fost curatate.
- Proprietatea `Casa la Nea Gica` a fost pusa in `plata_necesara` / `payment_required` pentru testul live.
- Verificare API Stripe live:
  - `charges_enabled=true`
  - `payouts_enabled=true`
  - `details_submitted=true`
- Verificare checkout live:
  - sesiune `cs_live_...`
  - `livemode=true`
  - `mode=subscription`
  - `amount_total=12900`
  - `currency=ron`
  - `success_url` si `cancel_url` pe `www.trevoro.ro`

### Test live Stripe fara trimitere e-Factura
- Pentru testul live real, trimiterea automata e-Factura catre ANAF a fost oprita:
  - `BILLING_AUTO_EFACTURA_ENABLED=false`
  - `EFACTURA_PRODUCTION_ENABLED=false`
  - `billing_auto_efactura_enabled=false` in `app_settings`
  - `efactura_production_enabled=false` in `app_settings`
- Factura se genereaza in Nexora si se trimite PDF pe email, dar nu se trimite la ANAF.
- Dupa verificarea emailului, factura de test live va fi stearsa manual.

### Date facturare proprietar
- Contul proprietarului are acum sectiune `Facturare` in dashboard.
- Sectiunea permite salvarea datelor firmei:
  - firma
  - CUI
  - nr. inregistrare
  - sediu social
  - banca
  - IBAN
  - reprezentant
- Datele sunt salvate in `companies`, pe compania de facturare legata prin `travel_properties.billing_company_id`.
- Pentru contul test, compania de facturare a fost completata:
  - `FLOVAL ITCONS S.R.L.`
  - `49083700`
  - `J2023002531293`
  - `Jud. Prahova, Sat Chitorani`
- Verificare:
  - `npm run build` in Trevoro
  - `node --check routes/travel-routes.js`
  - dashboard-ul afiseaza datele FLOVAL
  - `POST /api/dashboard/partner/billing-company` salveaza si redirectioneaza cu `ok=billing_company_saved`

### Abonament temporar 10 RON pentru test live
- Pretul abonamentului proprietar este configurabil prin `TREVORO_OWNER_MONTHLY_PRICE_RON`.
- Pentru testul live curent a fost setat `TREVORO_OWNER_MONTHLY_PRICE_RON=10`.
- Planul `trevoro-owner-monthly` si proprietatea test au fost aliniate la `10 RON`.
- Verificare Stripe live:
  - sesiune `cs_live_...`
  - `livemode=true`
  - `mode=subscription`
  - `amount_total=1000`
  - `currency=ron`
- e-Factura ramane oprita pentru acest test; se genereaza doar factura PDF pe email.

### Amanare test plata live
- Testul live cu plata de 10 RON a fost amanat pana exista un proprietar real.
- Nu exista plata live finalizata, abonament live creat sau factura noua de sters.
- Sesiunile live initiate au fost marcate intern `cancelled` cu `failure_reason='live_test_postponed'`.
- Pretul abonamentului proprietar a fost readus la `129 RON`:
  - `TREVORO_OWNER_MONTHLY_PRICE_RON=129`
  - plan `trevoro-owner-monthly` = `129`
  - proprietate test `monthly_price_ron=129`
- Stripe ramane configurat live.
- e-Factura ramane oprita pana la primul proprietar real:
  - `BILLING_AUTO_EFACTURA_ENABLED=false`
  - `EFACTURA_PRODUCTION_ENABLED=false`

### e-Factura productie reactivata
- e-Factura a fost trecuta inapoi pe productie:
  - `BILLING_AUTO_EFACTURA_ENABLED=true`
  - `BILLING_EFACTURA_TEST_SIMULATION_ENABLED=false`
  - `EFACTURA_ENVIRONMENT=prod`
  - `EFACTURA_PRODUCTION_ENABLED=true`
- Setarile globale din DB au fost aliniate:
  - `anaf_environment=prod`
  - `billing_auto_efactura_enabled=true`
  - `efactura_production_enabled=true`
- Nexora a fost repornit.
- Verificare: nu exista facturi de test `129 RON` ramase.

### Search in Nexora Travel
- In `Travel > Proprietati` a fost adaugat search in Nexora:
  - implicit filtreaza Romania
  - cauta dupa nume, tip, oras, judet, adresa, telefon, email, website si lead
  - filtre suplimentare: tara si status
- In `Travel > Lead-uri Proprietati` a fost adaugat search:
  - cauta dupa nume, tip, tara, oras, judet, adresa, telefon, email, website, sursa si notes
  - exportul CSV pastreaza filtrul de search
- Verificare:
  - `node --check routes/travel-routes.js`
  - `node --check src/ui/nexora-travel-pages.js`
  - randare UI verificata pentru ambele pagini
  - Nexora repornit
- Nexora:
  - `node --check routes/travel-routes.js`
  - `node --check db.js`

## 2026-06-05 - e-Factura TEST pentru abonamente Trevoro

### Ce s-a schimbat
- e-Factura a fost trecuta pe mediul `test` in `app_settings`, inclusiv pentru companiile existente.
- Serviciul Nexora are acum guard explicit:
  - `EFACTURA_ENVIRONMENT=test`
  - `EFACTURA_PRODUCTION_ENABLED=false`
- Automatizarea dupa plata abonamentului este activa:
  - plata Stripe abonament -> `billing_payments`
  - factura automata -> `facturi`
  - XML e-Factura -> `efactura_xml`
  - status e-Factura TEST simulat -> `TEST_SIMULAT`
- Productia e-Factura ramane blocata pana la confirmare explicita.
- Reminder operational: `utile/efactura-test-mode-reminder.txt`.

### Test efectuat
- Script: `node scripts/test-billing-efactura-automation.mjs`
- Rezultat:
  - plata abonament test creata
  - factura generata automat
  - XML e-Factura generat
  - status final factura: `TRIMIS_EFACTURA`
  - status e-Factura: `TEST_SIMULAT`
  - productie ANAF neatinsa

### Verificare
- `node --check lib/billing-efactura.js`
- `node --check lib/billing-invoices.js`
- `node --check routes/billing-routes.js`
- `node --check server.js`
- `node --check scripts/test-billing-efactura-automation.mjs`

## 2026-06-05 - PDF atasat automat la factura abonament

### Ce s-a schimbat
- Facturile automate de abonament genereaza acum PDF inainte de email.
- Emailul de factura ataseaza PDF-ul generat.
- Flux complet dupa plata abonamentului:
  - plata Stripe
  - factura in Nexora
  - e-Factura TEST
  - PDF factura
  - email factura cu PDF atasat si CC `contact@trevoro.ro`

### Test efectuat
- Script: `node scripts/test-billing-efactura-automation.mjs`
- Rezultat:
  - factura generata: `FITS-055`
  - PDF generat: `contracts/invoices/2026/FITS-055.pdf`
  - email trimis catre `owner.test@trevoro.ro`
  - CC: `contact@trevoro.ro`
  - atasament: `FITS-055.pdf`

### Verificare
- `node --check lib/billing-invoice-pdf.js`
- `node --check lib/billing-invoice-email.js`
- `node --check routes/billing-routes.js`
- `node --check scripts/test-billing-efactura-automation.mjs`

## 2026-06-05 - Mesaj email factura abonament

### Ce s-a schimbat
- Emailul facturii de abonament include mesajul:
  - "Buna ziua,"
  - "Dorim sa va informam ca a fost emisa factura pentru abonamentul dumneavoastra."
  - "Va multumim pentru colaborare."
- PDF-ul facturii ramane atasat automat.

### Test efectuat
- Script: `node scripts/test-billing-efactura-automation.mjs`
- Rezultat:
  - factura generata: `FITS-056`
  - PDF atasat: `FITS-056.pdf`
  - email trimis catre `owner.test@trevoro.ro`
  - CC: `contact@trevoro.ro`

### Verificare
- `node --check lib/billing-invoice-email.js`
- `node --check scripts/test-billing-efactura-automation.mjs`

## 2026-06-05 - Email automat factura abonament Trevoro

### Ce s-a schimbat
- Dupa plata abonamentului si generarea facturii, Nexora trimite automat emailul de factura.
- Emailul include sumarul facturii, liniile de factura si link intern catre factura din Nexora.
- CC operational setat pe `contact@trevoro.ro`.
- Setari active in serviciul Nexora:
  - `BILLING_AUTO_INVOICE_EMAIL_ENABLED=true`
  - `BILLING_INVOICE_EMAIL_CC=contact@trevoro.ro`

### Test efectuat
- Script: `node scripts/test-billing-efactura-automation.mjs`
- Rezultat:
  - plata test creata
  - factura generata automat: `FITS-054`
  - e-Factura TEST simulata: `TEST_SIMULAT`
  - email trimis catre `owner.test@trevoro.ro`
  - CC: `contact@trevoro.ro`

### Verificare
- `node --check lib/billing-invoice-email.js`
- `node --check routes/billing-routes.js`
- `node --check server.js`
- `node --check scripts/test-billing-efactura-automation.mjs`

## 2026-06-04 - Trevoro EN quick search si listari

### Ce s-a schimbat
- Selectorul de limba afiseaza acum mini-steag si eticheta `Limba` / `Language`.
- Selectorul de moneda afiseaza acum mini-steag si eticheta `Moneda` / `Currency`.
- Selectorul limba/moneda a fost mutat in dreapta headerului, dupa CTA-ul de listare proprietate, si impartit in doua controale aerisite.
- Steagurile din selector nu mai depind de emoji/fontul browserului; sunt randate ca elemente grafice colorate in UI.
- Headerul foloseste un container mai lat pe desktop ca sa ocupe mai bine spatiul disponibil.
- Pagina publica `/en` foloseste acelasi formular de cautare rapida ca pagina romana:
  - destinatie;
  - check-in;
  - check-out;
  - numar nopti;
  - adulti;
  - copii si varste copii;
  - tip cazare;
  - tip masa.
- Pagina `/en` afiseaza acum si listarile de proprietati, cu etichetele UI in engleza.
- Structura paginii `/en` a fost aliniata cu homepage-ul romanesc:
  - beneficii scurte sub hero;
  - recomandari de sezon;
  - destinatii rapide;
  - sectiune finala pentru turisti si proprietari.

### Verificare
- Trevoro:
  - `npm install -D @playwright/test`
  - `npm run lint`
  - `npm run build`
  - `systemctl --user restart trevoro-site.service`
  - verificare locala `http://127.0.0.1:3100/en`
  - screenshot Playwright pentru header EN: `utile/screenshots/trevoro-en-header.png`
  - screenshot Playwright pentru header RO: `utile/screenshots/trevoro-ro-header.png`

## 2026-06-04 - Travel International Dashboard si outreach international

### Ce s-a schimbat
- A fost pornit manual batch-ul `trevoro-daily-outreach.service` cu flag `--international`.
- Jobul ruleaza prin systemd si trimite maximum 100 emailuri internationale cu delay de 45 secunde intre trimiteri.
- A fost adaugata pagina separata:
  - `/nexora/travel/international`
- Pagina International include:
  - KPI-uri pentru lead-uri internationale, contactabile, scor 40+, emailuri trimise si erori/bounce;
  - tabel pe tari pentru Bulgaria, Greece si Albania;
  - lista de lead-uri internationale prioritare;
  - ultimele emailuri internationale din outbox/bounce/esecuri.
- A fost adaugat tabul `International` in meniul intern Nexora Travel.
- A fost adaugata intrarea `International` in sidebar-ul modulului Travel.

### Verificare
- `node --check routes/travel-routes.js`
- `node --check src/ui/nexora-travel-pages.js`
- `node --check src/config/erp-modules.js`
- `systemctl --user restart nexora.service`
- `curl http://127.0.0.1:3000/nexora/travel/international` confirma ruta protejata prin redirect la `/login`.

## 2026-06-05 - Job outreach Romania separat

### Ce s-a verificat
- Jobul zilnic existent `trevoro-daily-outreach.service` ruleaza cu `--international`, deci trimite doar lead-uri din afara Romaniei.
- Azi, pana la verificare, emailurile trimise au fost doar internationale.
- Nu exista un job separat pentru Romania in systemd.

### Ce s-a schimbat
- A fost creat serviciul:
  - `trevoro-daily-outreach-romania.service`
- A fost creat timerul:
  - `trevoro-daily-outreach-romania.timer`
- Timerul este programat zilnic la `12:00 Europe/Bucharest`, cu `RandomizedDelaySec=10m`, ca sa nu se suprapuna cu batch-ul international.
- `scripts/run-trevoro-daily-outreach.mjs` transmite acum mai departe argumentul `--country`, astfel incat jobul Romania ruleaza strict cu:
  - `--country Romania`
  - `--limit 100`
  - `--min-score 40`
  - `--delay-ms 45000`

### Verificare
- `node --check scripts/run-trevoro-daily-outreach.mjs`
- Dry-run:
  - `node scripts/run-trevoro-daily-outreach.mjs --country Romania --limit 3 --source all --min-score 40 --delay-ms 0 --dry-run`
- Raportul dry-run confirma ca scriptul efectiv este apelat cu `--country Romania` si selecteaza doar lead-uri din Romania.
- `systemctl --user enable --now trevoro-daily-outreach-romania.timer`

## 2026-06-05 - Protecție anti-dubluri outreach email

### Ce s-a verificat
- Scriptul de outreach excludea deja adresele care au avut email `outbound` sau `bounce` în `travel_email_messages`.
- Au fost găsite 2 dubluri vechi în istoric, înainte de această întărire.

### Ce s-a schimbat
- `scripts/send-trevoro-outreach-emails.mjs` exclude acum și lead-ul după `lead_id`, nu doar după `to_email`.
- Protecția curentă evită:
  - același lead trimis din nou;
  - alt lead cu aceeași adresă email;
  - lead-uri cu bounce anterior;
  - retry prea rapid după eșec SMTP temporar.

### Verificare
- `node --check scripts/send-trevoro-outreach-emails.mjs`
- Dry-run Romania, 5 candidați: niciun candidat nu avea outbound anterior.
- Dry-run international, 5 candidați: niciun candidat nu avea outbound anterior.

## 2026-06-04 - Trevoro site polish si redenumire folder

### Ce s-a schimbat
- Folderul site-ului public a fost redenumit din `/home/server/ROTravel` in `/home/server/Trevoro`.
- Serviciul `trevoro-site.service` foloseste acum `WorkingDirectory=/home/server/Trevoro`.
- Homepage-ul Trevoro nu mai afiseaza sectiuni care sugereaza ca site-ul este in constructie.
- Textele din homepage, pagina clienti, pagina proprietari, detaliu proprietate si checkout au fost reformulate ca flux activ: cautare, cerere, confirmare proprietar si suport.
- Scriptul demo TikTok foloseste noua cale `/home/server/Trevoro`.

### Verificare
- Trevoro:
  - `npm run lint`
  - `npm run build`
- Nexora:
  - `node --check scripts/create-tiktok-review-demo-video.mjs`
- Runtime:
  - `systemctl --user restart trevoro-site.service`
  - `curl -I http://127.0.0.1:3100/`

## 2026-06-04 - Trevoro selector limba si moneda

### Ce s-a schimbat
- Header-ul public Trevoro afiseaza in dreapta sus selector pentru:
  - limba: RO / EN
  - moneda: RON / EUR / BGN / USD / GBP
- Preferintele se salveaza in cookie-uri:
  - `trevoro_language`
  - `trevoro_currency`
- Schimbarea limbii redirectioneaza catre pagina echivalenta unde exista:
  - `/` -> `/en`
  - `/proprietari` -> `/en/owners`
  - `/en/owners` -> `/proprietari`
- Preturile publice principale se afiseaza in moneda aleasa:
  - homepage
  - cautare
  - card proprietate
  - detaliu proprietate
  - checkout
  - dashboard client/proprietar
- Conversia porneste de la preturile in RON si foloseste cursul BNR din `https://www.bnr.ro/nbrfxrates.xml`, cu fallback local daca BNR nu raspunde.
- Atributul HTML `lang` urmeaza limba selectata.

### Verificare
- Trevoro:
  - `npm run lint`
  - `npm run build`
- Runtime:
  - `curl -I http://127.0.0.1:3100/`
  - `curl /api/preferences?...` seteaza cookie-urile si redirectioneaza corect.
  - test cu cookie `trevoro_currency=EUR` afiseaza preturi in EUR.
  - test cu cookie `trevoro_currency=BGN` afiseaza preturi in BGN.

## 2026-06-04 - Trevoro traduceri UI EN

### Ce s-a schimbat
- Selectorul de limba nu mai schimba doar ruta/preferinta; UI-ul public citeste `trevoro_language`.
- Header-ul public afiseaza textele in romana sau engleza.
- Cardurile de proprietati traduc etichetele UI:
  - gazda verificata / verified host
  - de la / from
  - noapte / night
  - camere / rooms
  - mesaje de disponibilitate
- Pagina `/search` traduce textele principale:
  - titlu, subtitlu, filtre, butoane, statistici, selectie curenta, empty state
- Pagina de detaliu proprietate traduce:
  - back link, detalii, facilitati, formular cerere, mesaje de disponibilitate si plata
- Pagina de checkout traduce:
  - titlu, sumar plata, detalii sejur, stari de indisponibilitate si CTA-uri

### Observatii
- Textele salvate ca date in Nexora/DB, cum sunt nume de facilitati, descrieri sau categorii ale proprietatilor, raman in limba in care sunt stocate. Pentru acestea trebuie adaugat ulterior model de continut multilingual in baza de date.

### Verificare
- Trevoro:
  - `npm run lint`
  - `npm run build`
- Runtime:
  - test cu cookie `trevoro_language=en; trevoro_currency=EUR` pe `/search`
  - `trevoro-site.service` repornit si activ

### Ajustare ulterioara homepage EN
- Pagina `/en` nu mai foloseste formularul quick search vechi.
- Formularul quick search EN are aceeasi structura ca homepage-ul RO:
  - destinatie
  - check-in
  - check-out
  - nopti
  - adulti
  - copii
  - varste copii
  - tip cazare
  - tip masa
- Header-ul `/en` foloseste acum header-ul public comun, cu limba fortata pe EN, ca structura vizuala sa ramana identica.
- Imaginea hero `/en` a fost aliniata cu imaginea hero RO.
- Servicii:
  - `nexora.service` activ
  - `trevoro-site.service` activ
  - `cloudflared-nexora.service` activ

## 2026-06-04 - Sincronizare calendar proprietar Trevoro

### Ce s-a implementat
- Nexora Travel stocheaza acum zile ocupate sincronizate din calendare iCal/Google:
  - tabela `travel_property_calendar_blocks`
  - sync din `travel_property_calendar_links`
  - expunere `unavailable_dates` in API-ul public Trevoro
- API proprietar:
  - calendarul se sincronizeaza automat la adaugare
  - endpoint separat pentru resincronizare manuala
  - dashboard-ul proprietarului returneaza `availability_blocks`
- Sincronizare automata:
  - script `scripts/sync-travel-calendars.mjs`
  - timer systemd `trevoro-calendar-sync.timer`
  - ruleaza aproximativ o data pe ora
  - marcheaza eroare pentru URL-uri care nu returneaza calendar iCal real
- ROTravel:
  - dashboard proprietar afiseaza calendar vizual pe luni
  - linkurile de calendar au status, ultima sincronizare, eroare si buton `Sync`
  - pagina proprietatii blocheaza cererea si checkout-ul cand intervalul include date ocupate
  - checkout-ul clientului afiseaza `Perioada indisponibila` pentru intervale ocupate
  - detaliul proprietatii ia date proaspete din API-ul individual, fara cache pentru disponibilitate

### Test efectuat
- A fost adaugat un calendar de test pentru `Casa la Nea Gica`:
  - `https://trevoro.ro/uploads/travel/test/casa-la-nea-gica-calendar.ics`
  - zile ocupate: `2026-06-05`, `2026-06-06`
- API public confirma:
  - `unavailable_dates: ["2026-06-05", "2026-06-06"]`
- Cerere client pentru `2026-06-05` - `2026-06-07`:
  - respinsa cu HTTP 400
  - mesaj: `Perioada selectată nu este disponibilă (2026-06-05, 2026-06-06).`
- Cerere client pentru `2026-06-08` - `2026-06-10`:
  - acceptata cu HTTP 201
- Pagina proprietatii si checkout-ul afiseaza perioada indisponibila pentru `2026-06-05` - `2026-06-07`.

### Instructiuni utile
- Procedura Google Calendar a fost documentata in:
  - `/home/server/Nexora/utile/trevoro-google-calendar-sync.txt`

### Fisiere modificate in aceasta etapa
- In `/home/server/Nexora`:
  - `db.js`
  - `routes/travel-routes.js`
  - `scripts/sync-travel-calendars.mjs`
  - `public/uploads/travel/test/casa-la-nea-gica-calendar.ics`
  - `utile/trevoro-google-calendar-sync.txt`
  - `ops/JURNAL_MODIFICARI.md`
- In `/home/server/ROTravel`:
  - `src/lib/sample-data.ts`
  - `src/lib/nexora-api.ts`
  - `src/lib/owner-api.ts`
  - `src/app/dashboard/partner/page.tsx`
  - `src/app/api/dashboard/partner/calendar/[calendarId]/sync/route.ts`
  - `src/app/properties/[slug]/page.tsx`
  - `src/app/checkout/[slug]/page.tsx`

### Validare
- Nexora:
  - `node --check routes/travel-routes.js`
  - `node --test tests/*.mjs`
- ROTravel:
  - `npm run lint`
  - `npm run build`
- Servicii:
  - `nexora.service` activ
  - `trevoro-site.service` activ
  - `trevoro-calendar-sync.timer` activ

## 2026-06-04 - Disponibilitate in cautarea client Trevoro

### Ce s-a implementat
- Pagina publica `/search` verifica disponibilitatea pentru fiecare proprietate pe intervalul cautat.
- Cardurile de proprietate afiseaza:
  - `Disponibil pentru perioada aleasa`
  - `Indisponibil pentru perioada aleasa`
  - mesaj explicit: `Proprietatea nu are disponibilitate pentru datele rezervate`
  - prima perioada libera imediata, calculata din calendarul sincronizat
- Cand exista date cautate, proprietatile disponibile sunt afisate primele.
- Statistica de cautare afiseaza cate proprietati sunt disponibile pentru perioada selectata.

### Test efectuat
- URL test ocupat:
  - `/search?destination=chitorani&checkin=2026-06-05&checkout=2026-06-07&guests=2`
  - afiseaza `Indisponibil pentru perioada aleasa`
  - afiseaza `Proprietatea nu are disponibilitate pentru datele rezervate: 2026-06-05, 2026-06-06.`
  - afiseaza `Prima perioada libera: 2026-06-07 - 2026-06-09`
- URL test liber:
  - `/search?destination=chitorani&checkin=2026-06-08&checkout=2026-06-10&guests=2`
  - afiseaza `Disponibil pentru perioada aleasa`
- Testul a fost verificat si cu sesiune de client `client.test@trevoro.ro`.

### Fisiere modificate in aceasta etapa
- In `/home/server/ROTravel`:
  - `src/app/search/page.tsx`
  - `src/components/property-card.tsx`

### Validare
- ROTravel:
  - `npm run lint`
  - `npm run build`
- Nexora:
  - `node --test tests/*.mjs`
- Servicii:
  - `trevoro-site.service` activ

### Ajustare ulterioara
- Pozele proprietatilor din contul de client folosesc acum baza publica de asset-uri `https://trevoro.ro`, nu baza API interna.
- Mesajul pentru disponibilitate in cautare a fost simplificat:
  - disponibil: `Disponibil`
  - indisponibil: `Urmatoarea perioada libera: ...`
- Verificare:
  - imaginea proprietatii `Casa la Nea Gica` raspunde cu HTTP 200 pe URL public
  - cautarea pentru perioada libera nu mai afiseaza textul `liber in calendar`

### Formular cautare rapida extins
- Formularul de pe homepage trimite acum:
  - destinatie
  - check-in
  - check-out
  - numar nopti optional
  - adulti
  - copii
  - varste copii
  - tip cazare
  - tip masa
- Pagina `/search` accepta aceleasi campuri si calculeaza check-out-ul din `check-in + nopti` daca nu este ales check-out.
- Capacitatea folosita la filtrare devine totalul `adulti + copii`, daca nu se trimite explicit `guests`.
- Verificare:
  - cautarea cu `checkout=2026-06-07` marcheaza Casa la Nea Gica indisponibila pentru 5-6 iunie
  - cautarea cu `nights=2` calculeaza acelasi interval `2026-06-05 - 2026-06-07`
  - filtrele afiseaza adulti, copii, varste copii si tip masa

## 2026-06-04 - TikTok Developer site verification

### Ce s-a implementat
- A fost adaugat meta tag global pentru verificarea TikTok Developer:
  - `tiktok-developers-site-verification`
- Cod verificare:
  - `66ziIZ3caDmobH4To8vllCu6CVNEMGJv`

### Verificare
- Meta tag-ul apare public pe:
  - `https://www.trevoro.ro/`
  - `https://www.trevoro.ro/privacy`
- ROTravel:
  - `npm run lint`
  - `npm run build`
- Serviciu:
  - `trevoro-site.service` activ

### Fisiere modificate
- In `/home/server/ROTravel`:
  - `src/app/layout.tsx`

## 2026-06-04 - Demo video TikTok App Review

### Ce s-a generat
- Video demo pentru TikTok App Review:
  - `/home/server/Nexora/utile/tiktok-demo/trevoro-tiktok-review-demo.mp4`
  - `https://www.trevoro.ro/trevoro-tiktok-review-demo.mp4`
- Video-ul arata:
  - site-ul public Trevoro
  - Terms/Privacy pe domeniul verificat
  - Nexora Travel > Social Posts
  - conectare TikTok prin OAuth sandbox
  - review script/caption/hashtags
  - starea `manual_required` pana la aprobarea Direct Post
- Textul pentru formularul TikTok App Review a fost salvat in:
  - `/home/server/Nexora/utile/tiktok-demo/tiktok-app-submission-text.txt`

### Date demo create
- Au fost adaugate drafturi social pentru proprietatea de test `Casa la Nea Gica`:
  - TikTok script
  - Facebook post
- A fost creat un job TikTok `manual_required`, reprezentand starea corecta pana la aprobarea API.

### Validare
- MP4 public raspunde cu HTTP 200:
  - `https://www.trevoro.ro/trevoro-tiktok-review-demo.mp4`
- ROTravel:
  - `npm run lint`
  - `npm run build`
- Script:
  - `node --check scripts/create-tiktok-review-demo-video.mjs`

### Fisiere modificate
- In `/home/server/Nexora`:
  - `scripts/create-tiktok-review-demo-video.mjs`
  - `utile/tiktok-demo/trevoro-tiktok-review-demo.mp4`
  - `utile/tiktok-demo/trevoro-tiktok-review-demo.html`
  - `utile/tiktok-demo/tiktok-app-submission-text.txt`
  - `ops/JURNAL_MODIFICARI.md`
- In `/home/server/ROTravel`:
  - `public/trevoro-tiktok-review-demo.mp4`
  - `package.json`
  - `package-lock.json`

## 2026-06-04 - Trevoro booking request engine

### Ce s-a implementat
- Tabela `travel_booking_requests` pentru cereri de rezervare.
- Status initial `pending`; proprietarul poate accepta sau refuza din dashboard.
- La creare se blocheaza temporar calendarul prin `travel_property_calendar_blocks`.
- La acceptare blocarea ramane confirmata si plata devine pasul urmator.
- La refuz blocarea temporara se sterge.
- Email imediat catre proprietar pentru cererea noua.
- Link WhatsApp pregatit pentru proprietar, pana la conectarea unui provider WhatsApp Business.
- Pagina publica a proprietatii trimite acum "cerere de rezervare", nu plata directa.
- Dashboard proprietar afiseaza separat "cereri de rezervare" cu Accepta / Refuza.

### Verificare
- Nexora:
  - `node --check routes/travel-routes.js`
  - `node --check db.js`
  - `node --test tests/*.mjs`
- ROTravel:
  - `npm run lint`
  - `npm run build`

### Observatii deploy
- Migrarea locala a rulat cu succes.
- Restartul `nexora.service` si `trevoro-site.service` necesita autentificare systemd interactiva in sesiunea curenta.

### Fisiere modificate
- In `/home/server/Nexora`:
  - `db.js`
  - `routes/travel-routes.js`
  - `tests/travel-schema.test.mjs`
  - `ops/JURNAL_MODIFICARI.md`
- In `/home/server/ROTravel`:
  - `src/lib/owner-api.ts`
  - `src/app/properties/[slug]/page.tsx`
  - `src/app/checkout/[slug]/page.tsx`
  - `src/app/dashboard/partner/page.tsx`
  - `src/app/api/dashboard/partner/bookings/[bookingId]/route.ts`

## 2026-06-04 - Trevoro Facebook launch pack

### Ce s-a pregatit
- Script reutilizabil pentru generarea postărilor inițiale Facebook/TikTok.
- Au fost create 9 postări noi:
  - 7 Facebook posts
  - 2 TikTok scripts
- Total curent în Nexora Social Posts:
  - 8 Facebook ready
  - 3 TikTok ready
- A fost adăugat planul de lucru pentru grupuri Facebook și promovare fără spam.

### Unde se vede
- Nexora > Travel > Social Posts
- Fișier plan:
  - `utile/trevoro-facebook-grupuri-plan.txt`
- Raport generare:
  - `utile/trevoro-facebook-launch-pack-2026-06-04T14-35-54-107Z.json`

### Verificare
- `node --check scripts/prepare-trevoro-facebook-launch.mjs`
- `node scripts/prepare-trevoro-facebook-launch.mjs`

### Fisiere modificate
- `scripts/prepare-trevoro-facebook-launch.mjs`
- `utile/trevoro-facebook-grupuri-plan.txt`
- `utile/trevoro-facebook-launch-pack-2026-06-04T14-35-54-107Z.json`
- `ops/JURNAL_MODIFICARI.md`

## 2026-06-04 - Trevoro multi-country sourcing

### Ce s-a implementat
- Adaugat camp `country` pe:
  - `travel_leads`
  - `travel_properties`
- Valori initiale suportate:
  - Romania
  - Bulgaria
  - Greece
  - Albania
- Toate datele existente au ramas cu `country = Romania`.
- Import CSV/XLSX accepta acum coloana `country`.
- Filtrele si listele Travel afiseaza tara.
- Conversia lead -> proprietate pastreaza tara.
- ROTravel primeste si trimite `country` pentru proprietari.
- Scriptul OSM poate importa pe tari prin `TRAVEL_IMPORT_COUNTRY`.
- Directoare de organizare create:
  - `data/travel-sources/romania`
  - `data/travel-sources/bulgaria`
  - `data/travel-sources/greece`
  - `data/travel-sources/albania`

### Surse documentate
- `utile/trevoro-surse-cazari-internationale.txt`

### Verificare
- `node -e "import('./db.js').then(({migrate}) => { migrate(); console.log('migrated'); })"`
- `node --check db.js`
- `node --check routes/travel-routes.js`
- `node --check scripts/import-osm-travel-leads.mjs`
- `node --check scripts/import-official-tourism-registry-leads.mjs`
- `node --test tests/*.mjs`
- ROTravel:
  - `npm run lint`
  - `npm run build`

### Fisiere modificate/adaugate
- `db.js`
- `routes/travel-routes.js`
- `src/ui/nexora-travel-pages.js`
- `scripts/import-osm-travel-leads.mjs`
- `scripts/import-official-tourism-registry-leads.mjs`
- `tests/travel-schema.test.mjs`
- `utile/trevoro-surse-cazari-internationale.txt`
- `data/travel-sources/*/README.md`
- In `/home/server/ROTravel`:
  - `src/lib/nexora-api.ts`
  - `src/lib/owner-api.ts`
  - `src/app/dashboard/partner/page.tsx`
  - `src/app/api/dashboard/partner/property/route.ts`
  - `src/app/proprietari/page.tsx`

## 2026-06-04 - Import OSM Bulgaria / Greece / Albania

### Ce s-a importat in DB
- Bulgaria:
  - 280 lead-uri OSM
  - 226 contactabile
  - 68 cu scor >= 40
- Greece:
  - 429 lead-uri OSM
  - 326 contactabile
  - 120 cu scor >= 40
- Albania:
  - 866 lead-uri OSM
  - 569 contactabile
  - 177 cu scor >= 40

### Observatii
- Primul bbox Albania a prins si Corfu/Grecia.
- Cele 1069 randuri contaminate au fost sterse din DB.
- Raportul contaminat a fost pastrat ca respins:
  - `utile/travel-sources/albania/rejected-overlap-greece-osm-report-2026-06-04T17-21-22-119Z.json`

### Rapoarte valide
- `utile/travel-sources/bulgaria/osm-bulgaria-black-sea-report-2026-06-04.json`
- `utile/travel-sources/greece/osm-greece-attica-aegean-report-2026-06-04.json`
- `utile/travel-sources/albania/osm-albania-central-north-report-2026-06-04.json`
- `utile/travel-sources/albania/osm-albania-south-ksamil-report-2026-06-04.json`

### Verificare
- `node --check scripts/import-osm-travel-leads.mjs`
- `node --test tests/travel-import.test.mjs tests/travel-schema.test.mjs`

## 2026-06-04 - Mesaje Outreach Trevoro multi-tara

### Ce s-a schimbat
- Lead-urile din Romania pastreaza mesajul in romana cu 129 lei/luna dupa perioada Early Partners.
- Lead-urile din afara Romaniei primesc mesaje in engleza cu abonament fix 30 EUR/luna, fara comision suplimentar indiferent de rezervari.
- Toate mesajele mentioneaza suport pentru publicarea proprietatii pe Trevoro.
- In UI-ul Outreach exista buton direct catre `support@trevoro.ro`.

### Verificare
- `node --check src/ui/nexora-travel-pages.js`
- `node --check scripts/send-trevoro-outreach-emails.mjs`
- `node --check scripts/follow-up-interested-travel-replies.mjs`
- `node --test tests/travel-outreach.test.mjs tests/travel-lead-detail.test.mjs`

## 2026-06-05 - Trevoro quick search sincronizat cu datele proprietarului

### Ce s-a schimbat
- Formularul quick search de pe homepage foloseste aceeasi structura in romana si engleza.
- Numarul de nopti este calculat automat din check-in/check-out si nu mai este editabil, pentru a evita cautari contradictorii.
- Campurile pentru varsta copiilor apar dinamic dupa numarul de copii selectat:
  - 0 copii = 0 campuri de varsta
  - 2 copii = 2 campuri de varsta
- Proprietarul poate declara in dashboard:
  - tip cazare
  - tipuri de masa oferite
  - beneficii/facilitati
  - capacitate adulti/copii
  - varsta pana la care copilul este gratuit
  - varsta de la care se plateste copilul
  - pret copil/noapte in RON
- API-ul Nexora salveaza aceste campuri in `travel_properties`.
- Site-ul Trevoro citeste aceste campuri din Nexora si le foloseste la filtrarea cautarii publice.

### Verificare
- Nexora:
  - `node -e "import('./db.js').then((m) => { m.migrate(); console.log('migrated'); })"`
  - `node --check db.js`
  - `node --check routes/travel-routes.js`
- Trevoro:
  - `npm run lint`
  - `npm run build`
  - Playwright: quick search are 0 campuri pentru 0 copii si 2 campuri pentru 2 copii.
  - Playwright: 2026-07-12 - 2026-07-15 afiseaza 3 nopti si trimite `nights=3`.
  - Playwright: `/search?destination=mare...` afiseaza rezultate, statistici compacte si 3 nopti calculate.

### Ajustare pagina rezultate
- Cardurile mari `Rezultate`, `Pret mediu`, `Disponibile` au fost inlocuite cu statistici compacte.
- Filtrul din stanga nu mai are `Persoane total` editabil; totalul se calculeaza din adulti + copii.
- `Nopti` este afisat calculat din check-in/check-out si trimis ca hidden field.
- Cautarea pe destinatie include aliasuri/categorii pentru mare, litoral, Marea Neagra, munte, camping, glamping, Romania, Bulgaria, Grecia si Albania.

### Autentificare obligatorie la rezervare
- Header-ul public are link vizibil `Autentifica-te`.
- CTA-ul pentru proprietari este `Inregistreaza proprietatea`.
- Clientii pot intra cu orice adresa personala de email, inclusiv Gmail/Yahoo/Outlook.
- Pagina `/login` are un singur formular pentru clienti si proprietari.
- Hinturile cu adrese demo au fost eliminate din UI.
- Autentificarea cere email si parola pentru clienti si proprietari.
- Rolul contului este determinat dupa autentificarea cu parola.
- Formularul de cerere rezervare este afisat doar pentru sesiuni de client autentificat.
- Cererile de rezervare trec prin `/api/booking-requests`, ruta locala care verifica sesiunea clientului inainte de trimiterea catre Nexora.
- Emailul clientului autentificat este precompletat si blocat in formularul de rezervare pentru trasabilitate.

### Verificare autentificare rezervare
- `npm run lint`
- `npm run build`
- Playwright: fara sesiune apare blocajul de autentificare; dupa login cu `client.test.gmail@gmail.com` apare formularul de rezervare cu email precompletat.
- Playwright: `/login` are un singur formular si nu mai afiseaza `proprietar.test@trevoro.ro` / `client.test@trevoro.ro`.
- Playwright: `/login` nu mai are camp `name`, parola este obligatorie si textul despre parola optionala a fost eliminat.

### Imagini sezoniere pe cautare si login
- Pagina `/search` are hero cu imagine de mare/plaja/soare si overlay pentru contrast.
- Pagina `/login` are imagine noua de plaja ca fundal full-page, cu overlay pentru lizibilitate.
- Playwright: `/search?destination=mare` si `/login` incarca fiecare cate o imagine sezoniera, iar login ramane cu un singur formular.

## 2026-06-05 - Stripe Checkout pentru rezervari Trevoro

### Ce s-a schimbat
- Trevoro are pachetul `stripe` instalat.
- Nexora `travel_booking_requests` pastreaza:
  - `stripe_checkout_session_id`
  - `stripe_payment_intent_id`
  - `stripe_payment_status`
  - `paid_at`
- Nexora expune endpoint-uri interne protejate pentru:
  - citire cerere rezervare
  - atasare Checkout Session Stripe
  - marcare rezervare ca `paid` dupa webhook Stripe
- Trevoro are rute:
  - `POST /api/stripe/checkout`
  - `POST /api/stripe/webhook`
- Checkout-ul Trevoro este protejat: fara sesiune client, redirectioneaza la `/login`.
- Plata este disponibila doar pentru rezervari `accepted` sau `payment_pending`.
- Plata nu se marcheaza dupa redirect-ul de success, ci dupa webhook `checkout.session.completed`.
- Document setup: `/home/server/Trevoro/utile/stripe-setup.md`.

### Verificare
- Nexora:
  - `node -e "import('./db.js').then((m) => { m.migrate(); console.log('migrated'); })"`
  - `node --check db.js`
  - `node --check routes/travel-routes.js`
- Trevoro:
  - `npm run lint`
  - `npm run build`
  - Playwright: `/checkout/...` fara sesiune redirectioneaza la login.
  - Rutele Stripe raspund `405` pe GET, fiind POST-only.

### Configurare sandbox Stripe
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY`, `TREVORO_SITE_URL` si `NEXT_PUBLIC_TREVORO_SITE_URL` au fost configurate in serviciul user `trevoro-site.service`.
- Aceleasi valori au fost adaugate in `.env` local Trevoro pentru build/dev.
- API Stripe testat prin `stripe.accounts.retrieve()`: cheia este valida.
- Observatie: contul Stripe raporteaza `charges_enabled=false` si `details_submitted=false`; pentru live trebuie finalizata activarea business profile in Stripe.

## 2026-06-05 - Plata abonament proprietar Trevoro

### Ce s-a schimbat
- Plata abonamentului proprietar este fortata in dashboard-ul proprietarului cand proprietatea are `subscription_status=payment_required`.
- Proprietatea de test `Casa la Nea Gica` a fost trecuta pe `standard_monthly`, `payment_required`, `129 RON/luna`.
- In dashboard-ul proprietarului apare bannerul de abonament si butonul `Activeaza abonamentul`.
- Checkout-ul de abonament creeaza sesiune Stripe de tip subscription pentru `129 RON/luna`.
- Nexora creeaza/lega automat compania de facturare pentru proprietate prin `billing_company_id`.
- Webhook-ul Stripe primit pe Trevoro este redirectionat intern catre Nexora, ca plata sa actualizeze abonamentul si sa declanseze factura automata.
- Dupa `invoice.paid`, Nexora marcheaza proprietatea ca `subscription_status=active`.
- e-Factura ramane in modul TEST pentru proba fizica; productia nu este activata inca.

### Verificare
- Nexora:
  - `node --check db.js`
  - `node --check routes/travel-routes.js`
  - `node --check routes/billing-routes.js`
  - `node -e "import('./db.js').then(({migrate}) => { migrate(); console.log('migrated'); })"`
- Trevoro:
  - `npm run build`

## 2026-06-04 - Outreach international, site EN si Travel Support

### Ce s-a schimbat
- Jobul `trevoro-daily-outreach.service` ruleaza acum cu `--international`, maximum 100 emailuri/zi, excluzand Romania.
- Emailurile internationale trimit catre pagina engleza `https://www.trevoro.ro/en/owners#form`.
- ROTravel are acum pagini publice in engleza:
  - `/en`
  - `/en/owners`
- Nexora Travel are modul `Support`:
  - ruta `/nexora/travel/support`
  - tichete cu status `nou`, `in_asteptare`, `rezolvat`
  - KPI-uri pentru tichete noi, in asteptare, rezolvate si nedeschise
  - banner rosu in Travel cand exista tichete nedeschise
- Timerul `trevoro-email-sync.timer` ruleaza la 5 minute scriptul `scripts/sync-trevoro-support-tickets.mjs`, care sincronizeaza emailurile si creeaza tichete din mesajele catre `support@trevoro.ro`.

### Verificare
- `node -e "import('./db.js').then(({migrate}) => { migrate(); console.log('migrated'); })"`
- `node --check db.js`
- `node --check routes/travel-routes.js`
- `node --check src/ui/nexora-travel-pages.js`
- `node --check scripts/send-trevoro-outreach-emails.mjs`
- `node --check scripts/run-trevoro-daily-outreach.mjs`
- `node --check scripts/sync-trevoro-support-tickets.mjs`
- `node --check scripts/follow-up-interested-travel-replies.mjs`
- `node --test tests/travel-outreach.test.mjs tests/travel-schema.test.mjs tests/travel-lead-detail.test.mjs`
- ROTravel:
  - `npm run lint`
  - `npm run build`
