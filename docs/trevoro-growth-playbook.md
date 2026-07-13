# Trevoro growth playbook

Ultima actualizare: 2026-06-18

## Obiectiv

Trevoro trebuie sa creasca prin trei canale care se sustin reciproc:

- SEO: pagini indexabile pentru proprietati, orase, judete, regiuni si ghiduri.
- Distributie: Facebook, TikTok, newsletter, email catre proprietari si parteneriate.
- Oferta: mai multe proprietati publice active, cu poze, preturi si calendar actualizat.

## Ce este deja activ

- Sitemap public: `https://www.trevoro.ro/sitemap.xml`.
- Robots public cu sitemap declarat: `https://www.trevoro.ro/robots.txt`.
- Pagini proprietate: `/properties/[slug]`.
- Pagini locatie:
  - `/cazare/oras/[slug]`
  - `/cazare/judet/[slug]`
  - `/cazare/regiune/[slug]`
- Hub locatie: `/cazare`.
- Blog:
  - `/blog`
  - `/blog/[slug]`
- Feed ghiduri: `/feed.xml`.
- Analytics propriu in Nexora Travel pentru trafic Trevoro.

## Actiuni imediate manuale

1. Google Search Console
   - Verifica proprietatea `https://www.trevoro.ro`.
   - Trimite sitemap-ul: `https://www.trevoro.ro/sitemap.xml`.
   - Inspecteaza manual:
     - `https://www.trevoro.ro/`
     - `https://www.trevoro.ro/cazare`
     - `https://www.trevoro.ro/cazare/oras/hateg`
     - o pagina de proprietate activa.

2. Bing Webmaster Tools
   - Adauga domeniul `www.trevoro.ro`.
   - Trimite sitemap-ul.
   - IndexNow este configurat cu cheia publica:
     - `https://www.trevoro.ro/4928e2f5fed0b2fa5cd216caadbee8ba.txt`
   - Dupa publicari mari, retrimite URL-urile principale prin IndexNow.

3. Social media
   - Publica 1 postare/zi timp de 30 zile:
     - luni: proprietate activa;
     - marti: ghid de calatorie;
     - miercuri: destinatie/oras;
     - joi: beneficiu pentru proprietari;
     - vineri: proprietate cu poze bune;
     - sambata: idee de weekend;
     - duminica: recapitulare + link catre `/cazare`.

4. Proprietari
   - Prioritate: proprietatile active fara poze.
   - A doua prioritate: proprietatile fara preturi/camere actualizate.
   - A treia prioritate: proprietatile fara calendar sau iCal sincronizat.

5. Lead-uri importate
   - Nu se publica automat toate lead-urile.
   - Se convertesc in proprietati publice doar cele validate, cu date suficiente si contact real.
   - Pentru fiecare conversie valida, Trevoro castiga automat:
     - pagina proprietate;
     - includere in oras;
     - includere in judet;
     - includere in regiune;
     - includere in sitemap.

## Mesaje sociale scurte

### Pentru turisti

Descopera cazari in Romania si destinatii apropiate pe Trevoro. Alege dupa oras, judet sau regiune si trimite cerere directa catre proprietar.

Link: https://www.trevoro.ro/cazare

### Pentru proprietari

Ai hotel, pensiune, cabana, vila sau apartament? Inscrie proprietatea pe Trevoro si primesti pagina publica, vizibilitate in cautari locale si promovare in perioada de lansare.

Link: https://www.trevoro.ro/proprietari

### Pentru ghiduri

Am publicat ghiduri Trevoro pentru litoral, munte, Delta Dunarii, Turcia si administrarea proprietatilor. Le folosim ca resursa pentru turisti si proprietari.

Link: https://www.trevoro.ro/blog

## KPI saptamanali

- Vizitatori unici pe Trevoro.
- Pagini indexate in Google Search Console.
- Clickuri organice.
- Proprietati active cu minimum 5 poze.
- Proprietati active cu preturi actualizate.
- Proprietati cu calendar sincronizat.
- Lead-uri convertite in proprietati publice.
- Cereri turist primite.

## IndexNow

Cheia publica:

```text
4928e2f5fed0b2fa5cd216caadbee8ba
```

URL de verificare:

```text
https://www.trevoro.ro/4928e2f5fed0b2fa5cd216caadbee8ba.txt
```

Endpoint recomandat:

```text
https://api.indexnow.org/indexnow
```

Comanda din proiectul Trevoro:

```bash
npm run indexnow
```

Trimitem prin IndexNow doar URL-uri publice reale:

- homepage;
- `/cazare`;
- pagini de proprietati active;
- pagini de oras/judet/regiune;
- articole blog.

## Urmatorul sprint recomandat

1. Conversie asistata pentru lead-uri validate in `travel_properties`.
2. Dashboard Nexora: lista "Lead-uri bune pentru publicare".
3. Generator postari social din proprietatile active.
4. Automatizare IndexNow din sitemap dupa publicari importante.
5. Pagini noi de ghid pe baza cautarilor reale din analytics.
