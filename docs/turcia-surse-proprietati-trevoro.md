# Turcia - surse proprietati pentru Trevoro

## Obiectiv

Turcia intra ca destinatie Trevoro pentru proprietari si turisti. Pentru lead-uri, pastram surse legale si verificabile: registru oficial, OSM/Overpass si API-uri comerciale unde avem termenii acceptati.

## Surse recomandate

1. Ministerul Culturii si Turismului din Turcia - proprietati licentiate
   - Bakanlik Belgeli Tesisler: https://www.ktb.gov.tr/genel/searchhotelgenel.aspx?lang=tr
   - Bakanlik Belgeli Konutlar: https://www.ktb.gov.tr/genel/bakanlikbelgelikonutlarAnasayfa.aspx
   - Sertifikali Tesisler: https://www.ktb.gov.tr/genel/sertifikalitesisler.aspx
   - Utilizare: validare si seed pentru hoteluri/cazari licentiate. Daca pagina nu expune export stabil, folosim verificare manuala sau cautam un endpoint oficial/public inainte de import automat.

2. OpenStreetMap / Overpass API
   - Documentatie: https://wiki.openstreetmap.org/wiki/Overpass_API
   - In repo exista deja importator cu suport pentru Turkey/TR:
     - scripts/import-osm-travel-leads.mjs
     - scripts/import-trevoro-expanded-sources.mjs
   - Comanda dry-run recomandata:

     ```bash
     node scripts/import-osm-travel-leads.mjs --country=Turkey --limit=100 --rows=8 --cols=8 --dry-run
     ```

   - Import controlat dupa verificare:

     ```bash
     node scripts/import-osm-travel-leads.mjs --country=Turkey --limit=250 --rows=8 --cols=8
     ```

3. Google Places API, doar cu API oficial si buget aprobat
   - Overview: https://developers.google.com/maps/documentation/places/web-service/overview
   - Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
   - Utilizare: imbogatire lead-uri cu place id, adresa, telefon, website, rating. Nu facem scraping Google Maps.
   - Atentie: folosim field mask minim ca sa controlam costul.

4. Asociatii si parteneriate locale
   - Cautam liste publice de membri pentru asociatii hoteliere regionale, mai ales Antalya, Istanbul, Cappadocia, Bodrum, Marmaris.
   - Folosire: parteneriate si outreach manual, nu scraping agresiv.

## Strategie de import

1. Pornim cu OSM dry-run pentru Turkey si verificam calitatea pe Antalya, Istanbul, Cappadocia, Bodrum, Marmaris.
2. Importam limitat in Nexora cu status nou si source=osm.
3. Validam top lead-uri cu registrul oficial KTB cand exista potrivire nume/oras.
4. Daca vrem date mai bune, adaugam un pas Google Places cu API key si buget.
5. Pentru proprietatile care raspund, le trimitem formularul Trevoro si le activam in modelul de abonament, fara comision pe rezervari.
