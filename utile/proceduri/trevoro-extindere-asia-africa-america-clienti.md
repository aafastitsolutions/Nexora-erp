# Trevoro - extindere Asia, Africa, America si plan clienti

Data: 2026-06-24

## Decizie operationala

Pentru extinderea internationala folosim proprietatile gasite ca lead-uri B2B in `travel_leads`, nu ca listari publice activate automat. O proprietate devine publica in `travel_properties` doar dupa confirmarea proprietarului/managerului, verificarea datelor si acceptarea termenilor Trevoro.

Sursa principala pentru seed este OpenStreetMap prin Overpass API. Fiecare lead importat pastreaza sursa `osm` si URL-ul OSM in `notes`, pentru audit si atribuire.

## Ce a fost adaugat tehnic

- Tari noi in normalizarea backend Trevoro: Asia, Africa si America.
- Tari noi in dropdown-ul public de inscriere proprietar.
- Prefixe telefon/WhatsApp pentru tarile noi.
- Import OSM cu hotspot-uri turistice pe tara, ca sa evitam scanari nationale lente.
- Optiune `--no-area-filter` pentru tari unde filtrul OSM pe arie intoarce 0 rezultate, confirmat util pentru Singapore.
- Optiune `--spread-hotspots` pentru importuri distribuite pe mai multe zone turistice.

## Importuri rulate

Comenzi de baza:

```bash
node scripts/run-trevoro-osm-country-imports.mjs --countries=global-tourism --target=80 --max-per-country=80 --preset=hotspots --timeout-ms=45000 --delay-ms=500
node scripts/run-trevoro-osm-country-imports.mjs --countries=africa --target=80 --max-per-country=80 --preset=hotspots --timeout-ms=45000 --delay-ms=500
node scripts/run-trevoro-osm-country-imports.mjs --countries=america --target=80 --max-per-country=80 --preset=hotspots --timeout-ms=45000 --delay-ms=500
node scripts/import-osm-travel-leads.mjs --country=Singapore --preset=hotspots --no-area-filter --limit=80 --timeout-ms=90000 --endpoint=https://overpass.kumi.systems/api/interpreter
```

Rezultat DB dupa seed:

| Regiune | Lead-uri | Email | Telefon | Website |
|---|---:|---:|---:|---:|
| Asia | 910 | 181 | 482 | 451 |
| Africa | 767 | 216 | 374 | 410 |
| America | 1003 | 235 | 577 | 492 |
| Total | 2680 | 632 | 1433 | 1353 |

Top tari dupa emailuri disponibile:

1. Cuba - 38 emailuri, dar necesita verificare legala/plati inainte de onboarding platit.
2. Seychelles - 37 emailuri.
3. Colombia - 34 emailuri.
4. United Arab Emirates - 29 emailuri.
5. Morocco - 27 emailuri.
6. Indonesia - 26 emailuri.
7. Thailand - 26 emailuri.
8. Dominican Republic - 25 emailuri.
9. Egypt - 25 emailuri.
10. Tanzania - 25 emailuri.
11. Vietnam - 23 emailuri.
12. Tunisia - 22 emailuri.

## Prioritate pentru clienti proprietari

Valul 1 outreach international:

- United Arab Emirates
- Morocco
- Thailand
- Indonesia
- Dominican Republic
- Colombia
- Seychelles
- Tanzania
- Egypt
- Vietnam
- Tunisia

Motiv: au volum bun de email/website si sunt piete turistice unde un mesaj in engleza despre listare fara comision pe rezervare poate fi inteles rapid.

Valul 2 dupa enrichment:

- Singapore
- South Africa
- Canada
- United States
- Mexico
- Peru
- Chile
- Mauritius
- Cape Verde

Motiv: multe website-uri/telefoane, dar emailul direct necesita completare.

Valul 3 / doar dupa verificare:

- Cuba: multe emailuri, dar verificam restrictii de plata, furnizori si riscuri legale.
- Kenya, Sri Lanka, Philippines, South Korea, Japan, India: importate, dar rata de email este mai mica.
- Jamaica, Bahamas, Madagascar: volum mic sau contactabilitate slaba in OSM.

## Cum aducem mai multi clienti pe platforma

1. Outreach B2B pe loturi mici:
   - 30-50 emailuri/zi/tara la inceput.
   - Mesaj in engleza, scurt, cu opt-out clar.
   - Prima promisiune: listare internationala cu plan fix, fara comision pe rezervare, pagina proprie si promovare social.

2. Enrichment inainte de trimitere:
   - Rulam `scripts/enrich-travel-leads.mjs` pe tarile cu multe website-uri.
   - Prioritam lead-urile cu website + email sau website + telefon.
   - Nu trimitem catre contacte personale care nu par legate de businessul de cazare.

3. Pagini SEO pe destinatii:
   - Construim pagini publice de tip `stays in Thailand`, `hotels in Morocco`, `guest houses in Seychelles`.
   - Initial afisam doar proprietati confirmate, iar pentru restul folosim continut editorial/destinatii.
   - Nu publicam lead-uri brute ca listari reale.

4. Social media:
   - TikTok/Instagram/Reels pe destinatii: "Founding stays wanted in Thailand/Morocco/UAE".
   - Postari separate pentru proprietari si pentru turisti.
   - Dupa ce avem proprietati confirmate, promovam fiecare proprietate cu material real aprobat de owner.

5. Parteneriate locale:
   - Contactam mici agentii de turism, tur operatori locali, ghizi, asociatii turistice si grupuri de proprietari.
   - Le oferim pagina de partener/agentie si posibilitatea de a aduce proprietari in Trevoro.

6. Oferta comerciala simpla:
   - International founding plan: perioada gratuita limitata pentru primele proprietati validate.
   - Dupa perioada gratuita, abonament fix in EUR, fara comision pe fiecare rezervare.
   - Pentru tari cu plata complicata, incepem cu lead capture si confirmari, nu cu incasare imediata.

## Urmatorii pasi recomandati

1. Ruleaza enrichment pe tarile Val 1:

```bash
node scripts/enrich-travel-leads.mjs --country="United Arab Emirates" --limit=100
node scripts/enrich-travel-leads.mjs --country=Morocco --limit=100
node scripts/enrich-travel-leads.mjs --country=Thailand --limit=100
node scripts/enrich-travel-leads.mjs --country=Indonesia --limit=100
```

2. Verifica manual 20 lead-uri din fiecare tara Val 1 in Nexora Travel.
3. Pregateste template email international pentru proprietari.
4. Ruleaza outreach dry-run pe 20-30 lead-uri.
5. Daca bounce/rate-limit e ok, crestem treptat la 50/zi/tara.
6. In paralel, facem pagini SEO si continut social pentru cerere turistica.
