# Jurnal module Nexora

## 2026-07-06 - e-Marqet public deploy

### e-Marqet
- Modulul e-Marqet se vede in Nexora public doar dupa deploy pe `trevoro-vps`; restartul local `systemctl --user restart nexora.service` din `/home/server/Nexora` nu actualizeaza instanta publica.
- Calea corecta pentru public este sync/deploy catre `/home/server/Nexora` pe `trevoro-vps`, verificari `node --check`, apoi `systemctl restart nexora.service` pe VPS.
- Verificarea publica trebuie facuta pe `https://nexora.aafastitsolutions.ro/login` cu `scripts/check-nexora-public-origin.mjs`; root-ul poate fi fals pozitiv.
- La 2026-07-06 au fost deployate fișierele e-Marqet, creat schema `emarqet_*` pe VPS si adaugat `emarqet` in permisiunile conturilor full-access.
- Platforma publica e-Marqet ruleaza pe `/e-marqet`, cu liste pe `/e-marqet/anunturi`, verticale pe `/e-marqet/:verticalCode`, detalii pe `/e-marqet/anunt/:slugOrCode` si formular public pe `/e-marqet/publica`.
- Formularul public creeaza in Nexora o listare `IN_REVIZIE` si un lead `public_publish_request`; formularul de contact de pe anunt creeaza lead `public_contact`.
- API public disponibil: `/api/e-marqet/verticals`, `/api/e-marqet/listings`, `/api/e-marqet/listings/:slugOrCode`, `/api/e-marqet/leads`.
- Smoke test VPS 2026-07-06: home public 200, API 200, publicare 302 cu listare/lead create, contact anunt 302 cu lead creat; randurile de test au fost sterse.
- Pentru domeniul dedicat `e-marqet.com`, VPS/Nginx este pregatit si aplicatia serveste e-Marqet la root cand Host este `e-marqet.com`; Cloudflare nu a putut crea zona cu tokenul local deoarece lipseste permisiunea `account.zone.create`.
- Dupa activarea DNS Cloudflare, platforma publica a fost mutata pe domeniul dedicat `https://e-marqet.com/` cu rute curate (`/anunturi`, `/publica`, `/anunt/:slugOrCode`, `/:verticalCode`), iar vechiul `/e-marqet...` de pe domeniul Nexora redirectioneaza permanent catre `https://e-marqet.com...`.
- Instalat certificat origin Let’s Encrypt pe VPS pentru `e-marqet.com` si `www.e-marqet.com`, inlocuind certificatul temporar snakeoil din Nginx; Cloudflare poate folosi `Full strict`.
- Refacut UI-ul public e-Marqet pe `https://e-marqet.com/`:
  - pagina principala afiseaza cautarea cu filtre pe categorie, categorii clare, anunturi promovate inaintea celor normale si carduri de servicii integrate/afiliere;
  - pagina separata `/preturi` afiseaza abonamentele, pachetele dedicate, Founding Member si servicii suplimentare grupate in Promovare, Social si AI/media;
  - formularul `/publica` salveaza planul ales, imagine principala, galerie URL, telefon, tip vanzator si metadata structurata pentru categoria aleasa;
  - seed activeaza 11 categorii: auto, imobiliare, turism, joburi, servicii, produse, jucarii, electronice/electrocasnice, PC/laptopuri/IT, telefoane/accesorii si audio/video;
  - anunturile folosesc coloane noi optionale `metadata_json`, `primary_image_url`, `image_urls_json`, `contact_phone`, `seller_type`, `selected_plan_code`, `promotion_level`, `promotion_until`, `stripe_checkout_status`;
  - smoke public 2026-07-06: `https://e-marqet.com/`, `/preturi`, `/auto`, `/publica`, `/telefoane-accesorii` 200; `www.e-marqet.com` 301 catre apex; API verticale raporteaza 11 categorii active.
- Adaugat upload local si checkout e-Marqet:
  - formularul `/publica` accepta poze JPG/PNG/WebP prin `multipart/form-data`, cu limita implicita 8 MB/fisier si 12 fisiere;
  - pozele se salveaza implicit in `public/uploads/emarqet/listings/YYYY/MM`, servite public prin `/uploads/emarqet/...`; pentru NAS se poate monta direct `public/uploads/emarqet` sau seta `EMARQET_UPLOAD_DIR` plus prefix public;
  - planurile platite redirectioneaza la `/checkout/:listingCode?token=...`; tokenul `checkout_token` protejeaza simularea/checkout-ul;
  - simularea platii marcheaza listarea `PUBLICAT`, `stripe_checkout_status='PAID_SIMULATED'`, seteaza `paid_at`/`published_at` si creeaza rand `billing_payments.payment_kind='emarqet_subscription'`;
  - checkout-ul Stripe real este pregatit pe ruta `/checkout/:listingCode/stripe`, dar pe VPS cheia existenta este live, deci e-Marqet nu foloseste Stripe real decat daca se seteaza explicit `EMARQET_ALLOW_LIVE_STRIPE=1` sau se pune o cheie `sk_test_`;
  - metadata Stripe e-Marqet foloseste `emarqet_company_id`, nu `company_id`, ca webhook-ul global Nexora/Trevoro sa nu trateze o sesiune e-Marqet ca abonament principal.
- Adaugat cont public e-Marqet:
  - `/publica` este protejat de login si redirectioneaza la `/cont/login?return_to=/publica`;
  - utilizatorii se pot inregistra pe `/cont/inregistrare` cu nume, telefon, email si parola, inclusiv adrese Gmail; Google OAuth real necesita credențiale Google dedicate;
  - regula cont nou: emailul, telefonul normalizat si numele normalizat sunt verificate inainte de creare, ca sa nu se creeze doua conturi pentru aceeasi persoana;
  - dealerii auto, agentiile imobiliare si magazinele folosesc contul public e-Marqet, nu adminul Nexora; Nexora ramane zona interna pentru verificare, plati, facturi, lead-uri si importuri;
  - `/cont` afiseaza anunturile utilizatorului pe statusuri, filtre, statistici si actiuni de plata/promovare;
  - adaugat flux business pentru dealeri auto si agentii imobiliare: profiluri in `emarqet_partner_profiles`, importuri CSV in `emarqet_partner_imports`, rute publice protejate `/cont/business` si `/cont/importuri`;
  - importul CSV creeaza anunturi `IN_REVIZIE`, legate de `partner_profile_id`, iar Nexora pastreaza raport cu randuri create/sarite;
  - pagina home are grila animata cu pictograme pentru categorii, iar formularul de publicare este impartit pe sectiuni: date anunt, campuri categoria aleasa, imagini, descriere, contact si abonament.
- Activat flux real de plata e-Marqet:
  - checkout-ul public foloseste Stripe real cand `EMARQET_ALLOW_LIVE_STRIPE=1` si ascunde simularea daca Stripe este disponibil;
  - sesiunile Stripe e-Marqet colecteaza adresa de facturare si CUI/VAT prin `tax_id_collection`;
  - succesul Stripe si webhook-ul `/stripe/webhook` proceseaza metadata `emarqet_*`, publica anuntul, creeaza `billing_payments.payment_kind='emarqet_subscription'`, genereaza factura, PDF-ul si emailul automat;
  - facturile/emailurile folosesc brandul `e-Marqet` prin metadata, dar reutilizeaza mecanismul Trevoro/Nexora de facturare.
  - fix dupa prima plata live: eroarea de email/factura nu mai poate intoarce clientul cu `Sesiunea Stripe nu a putut fi verificata` dupa ce Stripe a confirmat plata; automatizarea se logheaza separat.
  - e-Marqet poate folosi chei Stripe separate prin `EMARQET_STRIPE_SECRET_KEY` si `EMARQET_STRIPE_WEBHOOK_SECRET`; fara ele, foloseste contul Stripe existent, iar in Stripe Checkout apare brandingul contului curent.
- Adaugat catalog monetizare e-Marqet:
  - tabel `emarqet_pricing_plans` pentru Free, Start, Pro, Business, Enterprise, pachete dedicate si Founding Member;
  - tabel `emarqet_addons` pentru promovari, distributii sociale si servicii AI;
  - pagina interna `/nexora/e-marqet/subscriptions` afiseaza catalogul si foloseste planurile reale in formular;
  - pagina publica `/e-marqet` afiseaza preturile, pachetele dedicate si oferta Founding Member;
  - API public nou: `/api/e-marqet/pricing`.
- Adaugat modul `Marketplace Services / Servicii Integrate` pentru e-Marqet:
  - tabele `emarqet_marketplace_services`, `emarqet_service_requests`, `emarqet_listing_badges`;
  - pagina interna `/nexora/e-marqet/services` pentru catalog servicii, cereri si statusuri;
  - catalog auto seed-uit: VIN decode basic, VIN decode complet, rapoarte istoric/daune/km, leasing, estimare pret, RCA/ITP, test drive, service, contract, asigurari, finantare si promovare anunt verificat;
  - pagina publica de anunt auto afiseaza servicii disponibile si formulare de cerere;
  - API public nou: `/api/e-marqet/services`, `/api/e-marqet/services/requests`, `/api/e-marqet/services/vin-decode`;
  - VIN decode basic functioneaza prin fallback public NHTSA vPIC; serviciile carVertical/autoDNA/Cebia/Vincario/Vehicle Databases/RAR/asigurari/leasing sunt marcate ca necesitand partener/API.

## 2026-05-29 - Mapare ERP si module Horeca

### Productie / plan necesar
- Tradus conceptele din UI:
  - MRP este afisat ca "Plan necesar materiale".
  - BOM este afisat ca "Retetar / lista materiale".
  - Quality control este afisat ca "Control calitate".
- Adaugata explicatie in dashboardul de productie pentru retetar, plan necesar, ordin de productie si control calitate.

### Financiar & Contabilitate
- Mapat "Trezorerie" in modulul existent Financiar & Contabilitate.
- Grupate in Trezorerie meniurile: Plati, Incasari, Cashflow / lichiditati, Bugete si Reconciliere bancara.

### Imobilizari
- Mapate imobilizarile peste functionalitatile existente:
  - Financiar & Contabilitate > Active fixe / Imobilizari.
  - Inventar & Gestiune > Registru active / Imobilizari.

### Restaurant / Horeca
- Creat modul nou cu meniuri functionale:
  - Dashboard sala.
  - Sala & mese.
  - Rezervari.
  - Meniu & retete.
  - Comenzi & KDS.
  - Rapoarte Horeca.
- Adaugate tabele dedicate pentru mese, rezervari, meniu, comenzi si linii de comanda.

### Aplicatii mobile
- Creat modul nou cu meniuri functionale:
  - Dashboard mobil.
  - Dispozitive.
  - Fluxuri mobile.
  - Task-uri mobile.
  - Sesiuni & PIN.
- Adaugate tabele dedicate pentru dispozitive, fluxuri, task-uri si sesiuni mobile.

## 2026-05-29 - Detaliere meniuri Horeca si Mobile

### Restaurant / Horeca
- Extins meniul ca sa acopere explicit fluxurile operationale:
  - Mese & sala restaurant.
  - Comenzi pe masa.
  - POS vanzare rapida.
  - Meniuri & produse.
  - Retetare.
  - Consum ingrediente.
  - Stoc bucatarie/bar.
  - Note de plata.
  - Split bill.
  - Bacsis.
  - Rezervari.
  - Livrari / Takeaway.
  - Rapoarte ospatar/masa/produs/zi.
  - Casa de marcat & e-Factura.
- Adaugate rute dedicate pentru POS, retetare, consum, stoc, note de plata, split bill, bacsis, takeaway si fiscalizare.

### Aplicatii mobile
- Extins meniul ca sa acopere explicit extensiile mobile:
  - Agenti vanzari.
  - Tehnicieni / interventii.
  - Manager dashboard.
  - Scanare coduri bare / QR.
  - Notificari push.
  - Aprobari documente.
  - Poze & semnaturi teren.
  - Pontaj / geolocatie.
  - Comenzi rapide.
  - Inventar mobil.
  - Clienti / facturi / stocuri.
- Legate aceste zone la task-uri mobile, fluxuri, dashboarduri si pagini operationale dedicate.

## 2026-05-29 - Supply Chain

### Supply Chain
- Creat modul functional cu pagini dedicate:
  - Dashboard Supply Chain.
  - Logistica.
  - Transport.
  - Distributie.
  - Forecasting / previziuni.
- Adaugate tabele dedicate:
  - `scm_logistics_tasks` pentru picking, receptie, transfer, cross-dock si retur.
  - `scm_transport_orders` pentru transportatori, vehicule, rute, tracking si costuri.
  - `scm_distribution_plans` pentru planuri de distributie pe depozit, canal, zona si ruta.
  - `scm_forecasts` pentru previziuni de cerere, stoc curent si cantitate recomandata.
- Legat forecasting-ul de produsele si stocurile existente, ca sa calculeze automat recomandarea fata de stoc.

## 2026-05-29 - Rapoarte & BI

### Rapoarte & BI (Business Intelligence)
- Redenumit modulul in meniu ca `Rapoarte & BI (Business Intelligence)`.
- Creat modul functional cu pagini dedicate:
  - Dashboard BI.
  - Dashboard-uri.
  - KPI.
  - Rapoarte salvate.
  - Export Excel / PDF.
  - Analytics.
- Adaugate tabele dedicate:
  - `report_dashboards` pentru dashboard-uri BI configurabile.
  - `report_kpis` pentru indicatori manuali sau calculati automat.
  - `report_saved_reports` pentru rapoarte reutilizabile pe module.
  - `report_exports` pentru fisiere generate.
- Adaugate exporturi CSV pentru Excel si PDF pentru rapoartele salvate.
- Adaugate analize rapide pentru venit lunar, top clienti, alerte stoc si pipeline oferte.

## 2026-05-29 - Order Management

### Order Management (Management comenzi)
- Extins modulul peste comenzile si livrarile existente, fara modificari pe facturare.
- Adaugate pagini functionale:
  - Comenzi.
  - Lifecycle comanda.
  - Fulfillment.
  - Tracking.
  - Status livrare.
- Adaugate tabele dedicate:
  - `order_lifecycle_events` pentru auditul schimbarilor de status pe comenzi.
  - `order_fulfillment_tasks` pentru picking, packing, verificare si expediere.
  - `order_tracking_events` pentru curier, AWB, locatie si status transport.
- Legat statusul de livrare la livrarile existente, cu actualizare AWB/curier si tracking automat.

## 2026-05-29 - Internationalizare

### Limba romana / engleza
- Adaugata preferinta `users.language`, cu valori `ro` si `en`.
- Adaugat selector de limba in topbar si in `Setari > Interfata`.
- Adaugat middleware global de traducere HTML pentru paginile randate server-side.
- Traduse in dictionarul global meniurile ERP, actiunile comune, statusurile, formularele si modulele noi.
- Resincronizate companiile cu plan nelimitat si utilizatorii admin, ca modulele noi sa fie vizibile utilizatorilor care au acces la ele prin plan/rol.

## 2026-06-02 - ANAF e-Factura

### Configurare OAuth Nexora
- Eliminat redirectul care trimitea `Setari > SPV / e-Factura` direct in pagina de status ANAF.
- Facut tabul `SPV / e-Factura` editabil pentru `Client ID`, `Client Secret`, `Redirect URI` si mediul ANAF.
- Actualizat meniul Setari ca sa deschida formularul de configurare OAuth.
- Adaugate linkuri din pagina `Status ANAF` catre configurarea credentelor OAuth.
- Adaugata pagina intermediara `Deschide ANAF`, cu link vizibil catre logincert ANAF, pentru situatiile in care ANAF intoarce instant `access_denied` si utilizatorul nu vede selectia certificatului.
- Mutata pagina intermediara `Deschide ANAF` in shell-ul Nexora cand fluxul este pornit din aplicatie, ca sa nu mai afiseze UI-ul public vechi.
- Schimbat butonul principal de autorizare ANAF sa deschida ANAF in aceeasi fila, pentru a pastra mai clar sesiunea Nexora; optiunea de fila noua ramane secundara.
- Ajustat statusul cardurilor de conexiuni ANAF: doar mediul curent apare `activ`, iar mediile cu token salvat dar nefolosite apar `inactiv`.

## 2026-06-02 - UI formulare Nexora

### Optimizare globala formulare
- Compactate stilurile comune pentru formularele din meniuri: inputuri, selecturi, textarea-uri, upload file si butoane.
- Aliniate formularele inline pe grid de 4 coloane desktop, 2 coloane pe ecrane medii si 1 coloana pe mobil.
- Micsorate etichetele si textul din controale pentru un aspect mai profesional si mai dens.
- Ajustate actiunile din formulare ca butoanele sa stea aliniate la dreapta pe formularele inline.
- Compactate tabelele asociate formularelor pentru aceeasi densitate vizuala in liste si istorice.
- Aplicat acelasi tratament pe formularele legacy `crm-*`, folosite in meniuri mai vechi precum Cheltuieli, Declaratii, Tipizate, Inventar si Oferte.
