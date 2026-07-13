# Trevoro - surse pentru populare proprietati Europa + Egipt

Data: 2026-06-18

## Obiectiv

Construim o baza de proprietati/lead-uri pentru tarile turistice active in Trevoro, ca sa putem trimite mesaje catre proprietari si manageri de cazari.

Regula de lucru: folosim surse publice, cu URL de origine salvat in lead, apoi trimitem mesaje B2B clare, cu identificare Trevoro, motivul contactarii si opt-out.

## Prioritatea 1 - import imediat prin OSM/Overpass

Sursa: OpenStreetMap prin Overpass API.

De ce:
- acopera toate tarile din lista Trevoro;
- include frecvent nume, oras, adresa, telefon, website, email, Facebook/Instagram;
- scriptul nostru exista deja si salveaza lead-uri in `travel_leads`;
- poate fi rulat controlat pe tara, cu grid si limita.

Tag-uri folosite de script:
- `tourism=hotel`
- `tourism=guest_house`
- `tourism=apartment`
- `tourism=chalet`
- `tourism=camp_site`
- `tourism=caravan_site`
- `tourism=hostel`
- `tourism=motel`
- `tourism=alpine_hut`
- `tourism=wilderness_hut`
- `tourism=resort`

Comanda test, fara inserare:

```bash
node scripts/import-osm-travel-leads.mjs --country=Cyprus --rows=2 --cols=2 --limit=50 --dry-run
```

Comanda import real, cu volum mic:

```bash
node scripts/import-osm-travel-leads.mjs --country=Cyprus --rows=2 --cols=2 --limit=200
```

Comanda imbogatire contacte dupa import:

```bash
node scripts/enrich-travel-leads.mjs --country=Cyprus --limit=100
```

Comanda pregatire/trimitere outreach se ruleaza abia dupa verificarea calitatii lead-urilor:

```bash
node scripts/run-trevoro-outreach.mjs --romania-limit 0 --international-limit 50 --source all --min-score 0 --delay-ms 45000
```

Tarile suportate acum de importator:

Romania, Bulgaria, Greece, Albania, Turkey, Cyprus, Egypt, Croatia, Montenegro, Italy, Spain, Portugal, France, Austria, Germany, United Kingdom, Ireland, Netherlands, Belgium, Switzerland, Slovenia, Serbia, Bosnia and Herzegovina, North Macedonia, Kosovo, Hungary, Czechia, Slovakia, Poland, Moldova, Malta, Denmark, Sweden, Norway, Finland, Iceland, Estonia, Latvia, Lithuania, Luxembourg, Andorra, Monaco, San Marino, Liechtenstein, Ukraine.

## Prioritatea 2 - surse oficiale/directoare pe tari

Aceste surse sunt bune pentru importuri secundare sau verificare. Unele contin contacte directe, altele doar lista oficiala si trebuie completate cu website/enrichment.

### Romania

Sursa existenta in proiect:
- registrul oficial al structurilor de cazare de la Ministerul Turismului;
- importator: `scripts/import-official-tourism-registry-leads.mjs`;
- fisiere locale in `data/travel-sources/`.

Actiune: pastram Romania ca baza principala oficiala + imbogatire website/email.

### Bulgaria

Sursa oficiala:
- National Tourist Register / Ministry of Tourism.

Utilizare:
- verificare oficiala si selectie hoteluri/pensiuni;
- OSM ramane importul rapid, apoi completare manuala/API unde gasim acces public.

Observatie: Bulgaria foloseste UTIS/registru turistic national; cazari categorizate/inregistrate apar in registrul national.

### Grecia

Sursa oficiala:
- Hellenic Chamber of Hotels - Tourist Guide.

Utilizare:
- lista oficiala pentru hoteluri, moteluri, apartamente mobilate, campinguri;
- bun pentru validare si contact direct catre hotel.

### Cipru

Sursa oficiala:
- Deputy Ministry of Tourism / Visit Cyprus - Hotels and Other Tourist Establishments List.

Utilizare:
- foarte buna pentru import, deoarece fisierele PDF contin frecvent telefon, website/email, operator si manager;
- prioritate mare pentru outreach international.

### Egipt

Sursa recomandata:
- OSM/Overpass pentru baza rapida;
- Google Places API sau alte surse de business data pentru completare telefon/website;
- verificare manuala pe destinatii: Cairo, Giza, Luxor, Aswan, Hurghada, Sharm El Sheikh, Dahab, Alexandria, Marsa Alam.

Observatie: nu am identificat inca un registru oficial public la fel de usor de importat ca Cipru/Portugalia/Franta. Pentru Egipt incepem pragmatic cu OSM + enrich.

### Portugalia

Sursa oficiala:
- Turismo de Portugal - National Tourism Register, cu RNET, RNAL, RNAVT, RNAAT.

Utilizare:
- RNET pentru intreprinderi turistice;
- RNAL pentru local lodging;
- SIGTUR pentru analiza geografica;
- bun pentru import/validare, in special Algarve, Lisabona, Porto, Madeira/Azores daca extindem bbox-urile.

### Franta

Sursa oficiala/open data:
- data.gouv.fr - Hebergements touristiques classes en France, produs de Atout France.

Utilizare:
- CSV public pentru cazari clasificate: hoteluri, campinguri, sate de vacanta, rezidente de turism, parcuri rezidentiale, auberge collective;
- bun pentru import tehnic direct, apoi enrichment pentru email/website.

### Italia

Sursa oficiala/open data:
- dati.gov.it / Ministero del Turismo - Banca Dati Strutture Ricettive in Italia.

Utilizare:
- sursa oficiala pentru structuri ricettive/CIN;
- utila pentru validare si analiza pe regiuni;
- pentru contacte directe, completam cu OSM/website/enrichment si eventual seturi regionale, de exemplu Veneto/Roma.

### Spania

Sursa oficiala/open data:
- datos.gob.es si registre regionale.

Exemplu bun:
- Comunidad de Madrid - Alojamientos turisticos, disponibil CSV/JSON.

Utilizare:
- Spania se trateaza regional: Madrid, Catalonia, Valencia, Andalucia, Galicia, Canary Islands, Balearic Islands;
- OSM pentru baza nationala, apoi importuri regionale unde exista CSV/JSON.

### Malta

Sursa oficiala:
- Malta Tourism Authority - Licensed Establishments.

Utilizare:
- categorii clare: Hotels, Guest Houses, Hostels, Tourist Villages, Short-Let Rented Accommodation Malta/Gozo;
- prioritate buna, deoarece piata e mica si foarte turistica.

## Prioritatea 3 - API-uri utile pentru completare

### Google Places API

Utilizare:
- completare telefon, website, rating, localizare;
- bun pentru lead scoring si verificare daca proprietatea este activa.

Atentie:
- necesita cheie API si costuri;
- trebuie respectati termenii Google privind stocarea si folosirea datelor.

### OpenTripMap API

Utilizare:
- POI-uri turistice si locuri de cazare la nivel global;
- poate fi folosit pentru descoperire si completare descrieri/zone.

Atentie:
- nu este sursa principala de emailuri;
- bun mai mult pentru context turistic si validare locatie.

### Wikidata

Utilizare:
- completare website oficial, coordonate, date despre branduri/hoteluri cunoscute;
- bun pentru hoteluri mari si lanturi, mai slab pentru pensiuni/apartamente mici.

## Prioritatea de lucru recomandata

### Valul 1 - destinatii apropiate si cu sanse mari

1. Bulgaria
2. Grecia
3. Turcia
4. Cipru
5. Malta
6. Croatia
7. Montenegro
8. Albania
9. Egipt

Motiv: turism puternic, multi proprietari independenti, costuri de abonament usor de explicat, piata potrivita pentru Trevoro.

### Valul 2 - tari mari, dar necesita selectie pe regiuni

1. Italia
2. Spania
3. Portugalia
4. Franta
5. Austria
6. Germania
7. United Kingdom

Motiv: volum mare, dar trebuie filtrare pe zone turistice si calitate, altfel outreach-ul devine prea larg.

### Valul 3 - completare Europa

Poland, Czechia, Slovakia, Hungary, Slovenia, Serbia, Bosnia and Herzegovina, North Macedonia, Kosovo, Moldova, Netherlands, Belgium, Switzerland, Ireland, Denmark, Sweden, Norway, Finland, Iceland, Estonia, Latvia, Lithuania, Luxembourg, Andorra, Monaco, San Marino, Liechtenstein, Ukraine.

## Procedura operationala pe tara

1. Ruleaza dry-run OSM.
2. Verifica raportul generat in `utile/rapoarte/importuri/`.
3. Daca rata de lead-uri cu website/telefon/email este buna, ruleaza import real.
4. Ruleaza enrichment pentru lead-urile cu website.
5. Verifica in Nexora primele 20-30 lead-uri din tara respectiva.
6. Trimite outreach pe lot mic, maximum 50/zi/tara la inceput.
7. Monitorizeaza bounce, raspunsuri si tichete.
8. Creste treptat volumul doar daca livrarea e buna.

## Reguli pentru outreach international

- Nu trimitem catre adrese personale gasite intamplator daca nu sunt clar legate de businessul de cazare.
- Fiecare mesaj trebuie sa includa:
  - cine suntem;
  - de ce ii contactam;
  - ce beneficiu are proprietarul;
  - link direct de inregistrare;
  - opt-out clar.
- Pentru Europa, tratam datele ca B2B si pastram sursa lead-ului in DB.
- Nu folosim date copiate din platforme care interzic scraping-ul in termeni.

## Linkuri surse

- OpenStreetMap tourism tags: https://wiki.openstreetmap.org/wiki/Key:tourism
- OpenStreetMap hotel: https://wiki.openstreetmap.org/wiki/Tag:tourism%3Dhotel
- OpenStreetMap guest house: https://wiki.openstreetmap.org/wiki/Tag:tourism%3Dguest_house
- OpenStreetMap apartment: https://wiki.openstreetmap.org/wiki/Tag:tourism%3Dapartment
- Google Places API: https://developers.google.com/maps/documentation/places/web-service
- OpenTripMap API: https://dev.opentripmap.org/
- Portugal RNT: https://www.turismodeportugal.pt/en/Turismo_Portugal/Oferta_Turistica/Pages/default.aspx
- France Atout France open data: https://www.data.gouv.fr/datasets/hebergements-touristiques-classes-en-france
- Italy BDSR open data: https://www.dati.gov.it/node/view-dataset/dataset?id=260bc901-903b-4fe5-b96a-4badd3f2df4f
- Spain Madrid tourism accommodation CSV/JSON: https://datos.gob.es/es/catalogo/a13002908-alojamientos-turisticos-de-la-comunidad-de-madrid
- Malta licensed establishments: https://mta.com.mt/licensed-establishments/
- Cyprus hotels and tourist establishments: https://www.gov.cy/tourism/en/documents/hotels-and-other-tourist-establishments-list/
- Greece Hellenic Chamber of Hotels Tourist Guide: https://www.grhotels.gr/en/tourist-guide/
- Bulgaria Ministry/National Tourist Register reference: https://www.tourism.government.bg/en/kategorii/novini/important-information-ministry-tourism-accommodation-persons-ukraine-seeking
