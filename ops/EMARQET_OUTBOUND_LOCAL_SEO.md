# e-Marqet - outbound local, CAEN si vizibilitate

## Surse pentru leaduri

- ONRC / data.gov.ro: folosim setul lunar `Firme inregistrate la Registrul Comertului`; la verificarea din 06.07.2026 era publicata inclusiv arhiva pana la 03.06.2026.
- Din arhiva luam fisierele `OD_FIRME.CSV`, `OD_CAEN_AUTORIZAT.CSV`, `OD_STARE_FIRMA.CSV`, impreuna cu nomenclatoarele CAEN/stare firma.
- Nomenclatoare ONRC: folosim fisierul separat de nomenclatoare ca sa decodam starea firmei, obiectul de activitate si versiunea CAEN.
- ONRC informatii grupate: pentru cereri oficiale pe criterii, ONRC afiseaza serviciu cu tarif per firma si reduceri pe volum.
- Imbogatire contact: dupa filtrarea CAEN, cautam site-ul public al firmei, email generic, telefon, Facebook/Google Business. Nu folosim emailuri personale gasite intamplator.

## Segmente CAEN prioritare

| Segment | CAEN initial | De ce este prioritar |
| --- | --- | --- |
| Dealeri auto | 4511, 4519 | Au stoc recurent si pot folosi profil business, import CSV/XML/API si promovare. |
| Service si piese auto | 4520, 4532 | Pot publica servicii, piese, verificari, parteneriate pentru leaduri. |
| Agentii imobiliare | 6831, 6832 | Au multe anunturi, nevoie de import, pagini de partener si leaduri. |
| Cazare si turism | 5510, 5520, 5530, 5590, 7911, 7912 | Le putem lega cu Trevoro si distributie social/Google Business. |
| Magazine online si retail | 4791, 4719, 4741, 4742, 4754, 4759 | Pot lista produse si folosi promovare + newsletter. |
| Servicii locale | 8121, 8122, 8130, 9602, 9609 | Au nevoie de vizibilitate locala si leaduri. |

Inainte de import verificam codurile in nomenclatorul ONRC descarcat, pentru ca datasetul poate avea versiune CAEN diferita.

## Flux outbound

1. Descarcam ultima arhiva ONRC de pe data.gov.ro.
2. Selectam firme active pe judet/localitate si CAEN.
3. Eliminam duplicatele dupa CUI, domeniu, telefon, email.
4. Cautam contact business public: site, Facebook, Google Business, email generic.
5. Marcaj in Nexora: `lead nou`, `contact gasit`, `email trimis`, `raspuns`, `demo`, `partener activ`.
6. Trimitem secvente scurte, cu opt-out clar.
7. Pentru cei interesati cream cont partener si pagina publica pe e-Marqet.

## Enrichment contacte

Scriptul de imbogatire ruleaza implicit in dry-run si verifica loturi mici, de 50-100 firme. Marcheaza `READY` doar cand gaseste email business generic public pe site oficial sau pagina publica verificabila.

Dry-run:

```bash
npm run emarqet:enrich:contacts -- --segment auto_dealers --county Prahova --limit 50
```

Salvare contacte curate:

```bash
npm run emarqet:enrich:contacts -- --segment auto_dealers --county Prahova --limit 50 --save
```

Dupa enrichment:

```bash
npm run emarqet:outreach -- --segment auto_dealers --county Prahova --limit 10 --dry-run
npm run emarqet:outreach -- --segment auto_dealers --county Prahova --limit 10 --send
```

## Email 1 - dealer auto

Subiect: Stocul auto poate fi publicat automat pe e-Marqet

Buna ziua,

Am lansat e-Marqet, o platforma romaneasca de anunturi conectata la Nexora, gandita si pentru dealeri auto.

Pentru un parc auto, putem pregati:
- profil public de partener;
- publicare manuala sau import CSV/XML/API;
- pagina cu toate masinile din stoc;
- promovare in categorie si pe social media;
- servicii extra: VIN, leasing, test drive, contract, verificare service.

Putem porni cu un cont Business si configuram impreuna primele anunturi.

Daca doriti, va trimit un link de activare si un exemplu de pagina de partener.

Cu respect,
Echipa e-Marqet
aafastitsolutions@gmail.com
https://e-marqet.com/parteneri

## Email 1 - agentie imobiliara

Subiect: Publicare anunturi imobiliare pe e-Marqet

Buna ziua,

Lucram la e-Marqet, o platforma de anunturi cu profil dedicat pentru parteneri si posibilitate de import pentru agentii.

Pentru o agentie imobiliara putem activa:
- pagina publica a agentiei;
- toate anunturile grupate sub acelasi profil;
- filtre clare pentru apartamente, case, terenuri si spatii comerciale;
- promovare in categorie si distribuire social media;
- cereri si leaduri urmarite in Nexora.

Daca este util, va putem pregati gratuit o prima pagina de prezentare si un set de anunturi test.

Cu respect,
Echipa e-Marqet
aafastitsolutions@gmail.com
https://e-marqet.com/parteneri

## Email 1 - turism si cazare

Subiect: Vizibilitate noua pentru unitatea dvs. de cazare

Buna ziua,

e-Marqet poate promova anunturi de turism si cazare, iar ecosistemul nostru include si Trevoro pentru administrarea proprietatilor turistice.

Putem ajuta cu:
- pagina publica pentru proprietate sau companie;
- anunturi pentru camere, apartamente, pachete sau servicii;
- distributie pe Facebook, Instagram si Google Business;
- leaduri centralizate in Nexora;
- continut generat si ajustat cu AI.

Daca doriti, putem pregati un profil demo cu datele publice ale unitatii si il validam impreuna.

Cu respect,
Echipa e-Marqet
aafastitsolutions@gmail.com
https://e-marqet.com/parteneri

## Email 1 - magazine si servicii locale

Subiect: Un canal nou pentru anunturile si ofertele dvs.

Buna ziua,

Am lansat e-Marqet, o platforma pentru anunturi, produse si servicii locale.

Pentru firme putem oferi:
- profil public de partener;
- listare produse sau servicii;
- promovare in categorie;
- distributie automata pe canale social;
- leaduri urmarite in Nexora.

Putem incepe cu un cont Business si cateva anunturi initiale, apoi optimizam ce functioneaza.

Cu respect,
Echipa e-Marqet
aafastitsolutions@gmail.com
https://e-marqet.com/parteneri

## Follow-up scurt

Subiect: Revin cu e-Marqet

Buna ziua,

Revin scurt cu mesajul despre e-Marqet. Cred ca profilul de partener ar putea fi util pentru anunturile si ofertele dvs., mai ales daca aveti publicari recurente.

Pot sa va trimit un exemplu de pagina si pasii de activare?

Cu respect,
Echipa e-Marqet
aafastitsolutions@gmail.com

## SEO si vizibilitate

- Indexare tehnica: `robots.txt`, `sitemap.xml`, canonical, OpenGraph, favicon, schema.org pentru anunturi si organizatii.
- Pagini locale: `/auto/bucuresti`, `/auto/prahova`, `/imobiliare/cluj`, `/servicii/brasov`, generate doar cand exista continut real.
- Pagini de partener: fiecare dealer/agentie are pagina indexabila cu nume, localitate, categorie si anunturi.
- Continut recurent: ghiduri scurte pentru vanzare auto, verificare VIN, acte vanzare-cumparare, inchiriere, cumparare locuinta, servicii locale.
- Social: postari saptamanale cu anunturi promovate, parteneri noi, categorii si oferte locale.
- Masurare: Search Console, sitemap submit, conversii din formular, clic pe telefon/email, conturi create, plati.

## Implementare in Nexora

Am separat outbound-ul e-Marqet de Trevoro:

- `lib/emarqet-outbound.js` tine segmentele CAEN, schema SQLite, parserul CSV si generatorul de email.
- `scripts/import-emarqet-onrc-caen-leads.mjs` importa firme din ONRC dupa CAEN.
- `scripts/import-emarqet-partner-leads.mjs` importa CSV-uri deja imbogatite cu email/site/telefon.
- `scripts/send-emarqet-partner-outreach-emails.mjs` trimite secventa de email catre leadurile eligibile.
- Leadurile brute stau in `emarqet_outbound_leads`.
- Emailurile trimise/esuate stau in `emarqet_outbound_email_events`.
- Cand un email pleaca real, scriptul creeaza/actualizeaza si un rand in `emarqet_leads` cu sursa `outbound_caen`, ca sa fie vizibil in modulul e-Marqet din Nexora.

Comenzi npm:

```bash
npm run emarqet:import:onrc -- --firme /cale/OD_FIRME.csv --caen /cale/OD_CAEN_AUTORIZAT.csv --segment auto_dealers --county Prahova --limit 500 --dry-run
npm run emarqet:import:partners -- --file /cale/contacte-emarqet.csv --segment auto_dealers --dry-run
npm run emarqet:outreach -- --segment auto_dealers --county Prahova --limit 10 --dry-run
```

Trimiterea reala cere explicit `--send`:

```bash
npm run emarqet:outreach -- --segment auto_dealers --county Prahova --limit 10 --send
```

Oprire rapida trimitere:

```bash
touch utile/flags/emarqet-email-sending-paused
```

Reluare:

```bash
rm utile/flags/emarqet-email-sending-paused
```

## Import ONRC pe CAEN

Scriptul ONRC foloseste legatura:

- `OD_CAEN_AUTORIZAT.csv`: `COD_INMATRICULARE` + `COD_CAEN_AUTORIZAT`
- `OD_FIRME.csv`: `COD_INMATRICULARE` + `CUI` + `DENUMIRE` + adresa

Exemple:

```bash
# Dealeri auto Prahova, test fara import real
npm run emarqet:import:onrc -- --firme data/onrc/OD_FIRME.csv --caen data/onrc/OD_CAEN_AUTORIZAT.csv --segment auto_dealers --county Prahova --dry-run --limit 50

# Agentii imobiliare Bucuresti, import real
npm run emarqet:import:onrc -- --firme data/onrc/OD_FIRME.csv --caen data/onrc/OD_CAEN_AUTORIZAT.csv --segment real_estate_agencies --county Bucuresti --limit 1000

# Mai multe segmente si judete intr-o singura trecere prin CSV-urile ONRC mari
npm run emarqet:import:onrc -- --firme data/onrc/2026-06-03/OD_FIRME.csv --caen data/onrc/2026-06-03/OD_CAEN_AUTORIZAT.csv --segments auto_dealers,real_estate_agencies,auto_services_parts --counties Prahova,Bucuresti --dry-run
```

Leadurile importate din ONRC intra cu:

- `contact_status = CONTACT_NEEDED`
- `outreach_status = NOT_READY`

Nu trimitem emailuri direct din ONRC, pentru ca datasetul nu contine contact business valid pentru outbound.

## CSV de imbogatire contact

Fisierul de imbogatire poate avea coloane in romana sau engleza. Cele recomandate:

```csv
company_name,cui,caen,segment,email,phone,website,facebook,google_business_url,county,city,contact_name,notes
```

Exemplu:

```bash
npm run emarqet:import:partners -- --file data/emarqet/contacte-parteneri.csv --source manual_enrichment --segment auto_dealers --dry-run
npm run emarqet:import:partners -- --file data/emarqet/contacte-parteneri.csv --source manual_enrichment --segment auto_dealers
```

Leadurile cu email intra cu:

- `contact_status = CONTACT_FOUND`
- `outreach_status = READY`

Expeditorul evita implicit adresele free-mail neclare sau personale. Pentru exceptii verificate manual se poate folosi:

```bash
npm run emarqet:outreach -- --segment auto_dealers --limit 10 --send --allow-non-generic
```

## Secventa email

Prima secventa este personalizata dupa segment:

- `auto_dealers`: stoc auto, pagina partener, import CSV/XML/API, VIN, leasing, test drive.
- `auto_services_parts`: servicii, piese, verificari, leaduri locale.
- `real_estate_agencies`: pagina agentie, import, filtre imobiliare, cereri in Nexora.
- `tourism_accommodation`: e-Marqet + Trevoro, proprietati, social media, leaduri.
- `retail_online`: produse, oferte, categorii, promovare.
- `local_services`: profil public, listare servicii, cereri locale.

Fiecare email include opt-out:

```text
Daca nu doriti sa mai primiti mesaje de la noi, raspundeti cu Stop si nu va mai contactam.
```

## Surse oficiale

- Organizatia ONRC pe data.gov.ro: `https://data.gov.ro/en/organization/onrc`
- Dataset ONRC firme: `https://data.gov.ro/dataset?organization=onrc&res_format=csv`
- Pagina ONRC statistici/date deschise: `https://www.onrc.ro/index.php/ro/statistici`

La verificarea din 07.07.2026, pagina data.gov.ro pentru ONRC lista seturi CSV lunare si resurse de tip `OD_FIRME.csv`, `OD_CAEN_AUTORIZAT.csv`, `OD_STARE_FIRMA.csv` si nomenclatoare. Inainte de un import mare, descarcam cel mai nou pachet disponibil si pastram arhiva sursa in `data/onrc/`.
