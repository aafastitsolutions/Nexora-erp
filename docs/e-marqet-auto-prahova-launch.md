# Lansare campanie pilot E-MARQET Auto Prahova

Generat: 2026-07-13T11:15:44.148Z

Campanie: Dealeri Auto Prahova – Lansare E-MARQET
Tara: Romania
Judet: Prahova
Categorie: Dealeri auto si parcuri auto
Limita initiala: 200 leaduri

## Ce a facut sistemul

- A verificat schema Lead Builder, sursele, joburile, deduplicarea, validarea emailurilor, filtrarea pe Prahova, exportul, drafturile, sincronizarea CRM si faptul ca mesajele raman doar drafturi pana la aprobare.
- A rulat/pregatit cautarea pilot pentru dealerii auto din Prahova.
- A pregatit pagina de aprobare pentru pana la primele 50 de leaduri eligibile.
- A generat taskuri onboarding pentru leadurile eligibile selectate.
- A pastrat trimiterea automata oprita: nu s-a trimis niciun email automat.

## Rezultat job

- job: #3
- status job: completed
- procesate in ultima rulare: 13
- salvate cu succes in ultima rulare: 13
- esuate in ultima rulare: 0
- duplicate in ultima rulare noua: 5

## Cifre reale in campanie

- firme identificate: 88
- cu email: 7
- cu telefon: 19
- cu website: 12
- cu stoc public detectat: 2
- prioritare: 1
- duplicate: 7
- sincronizate in CRM: 88
- mesaje aprobate: 0
- mesaje draft: 88
- leaduri eligibile selectate pentru aprobare top 50: 8
- taskuri onboarding pregatite: 104

## Functii testate

- creare campanie pilot;
- rulare job Lead Builder;
- salvare rezultate in CRM;
- deduplicare pe lead/company;
- validare email prin format si domeniu/MX cand exista date;
- filtrare dupa judetul Prahova;
- export CSV/JSON din Lead Builder;
- generare mesaje email/WhatsApp/Facebook/call script/follow-up;
- pagina Campanie -> Aprobare mesaje;
- pipeline onboarding cu taskuri;
- formular public /dealeri-auto si /e-marqet/dealeri-auto;
- import stoc CSV/XLSX.

## Functii functionale

- Colectarea publica prin OpenStreetMap/Overpass si website-uri publice.
- Lead Intelligence local, fara sa inventeze informatii lipsa.
- Drafturi comerciale pentru Dealer Fondator.
- Sincronizare CRM si follow-up intern.
- Pagina de aprobare cu editare, aprobare, respingere, amanare, schimbare canal, suna telefonic si nu contacta.
- Oferta Dealer Fondator poate fi activata manual in admin E-MARQET pe profilul partenerului.

## Erori gasite si reparate

- Campania veche avea nume si limita generica. A fost aliniata la "Dealeri Auto Prahova – Lansare E-MARQET", limita 200 si lista completa de orase/cuvinte-cheie.
- Fluxul de aprobare nu avea pagina dedicata top 50. A fost adaugata.
- Importul public era doar CSV. A fost extins la XLSX si template stoc auto.

## Limitari existente

- Datele publice depind de acoperirea OpenStreetMap si de website-urile disponibile public.
- Numarul de masini in stoc este estimare doar daca sistemul gaseste indicii publice; nu trebuie tratat ca cifra contractuala.
- Nu exista trimitere automata de emailuri in aceasta etapa.
- Feedurile XML/API ale dealerilor se configureaza dupa ce dealerul raspunde si ofera acces.
- Statusurile de livrare email, raspuns si conversie se vor popula dupa aprobare si contact manual.

## Ce trebuie sa fac eu

1. Deschide Nexora -> CRM -> Lead Builder -> Aprobare mesaje.
2. Verifica leadurile eligibile selectate: emailul, sursa emailului, telefonul, website-ul si motivul selectarii.
3. Editeaza mesajele unde vrei un ton mai personal.
4. Apasa Aproba doar pentru firmele pe care vrei sa le contactezi.
5. Marcheaza "Suna telefonic" pentru dealerii cu telefon si fara email bun.
6. Marcheaza "Nu contacta" pentru firme irelevante, service-uri fara vanzari sau firme inactive.
7. Pentru dealerii care raspund, creeaza/activeaza contul E-MARQET si profilul business.
8. Cere dealerului metoda de import: CSV/XLSX, XML, JSON, API, feed, website sau manual asistat.
9. Descarca template-ul de stoc din /dealeri-auto/template-stoc.csv daca dealerul nu are feed.
10. Dupa import, verifica anunturile in E-MARQET -> Parteneri -> Aprobari anunturi.
11. Acorda badge-ul din E-MARQET -> Parteneri -> Fondator.
12. Urmareste conversiile: Lead -> Contactat -> Raspuns -> Interesat -> Cont creat -> Stoc importat -> Dealer activ.

## Top leaduri

1. Service Auto Serus Ploiești
   - email: contact@serus.ro
   - telefon: +40214443335
   - website: https://www.serus.ro/
   - localitate: Blejoi
   - scor: 55
   - motiv: email comercial disponibil, telefon disponibil, website activ/verificabil, catalog online detectat
   - actiune recomandata: email (contact@serus.ro); Dealer Fondator + preluare stoc din website/feed

2. Imaxim
   - email: office@imaxim.ro
   - telefon: +40244545019
   - website: http://www.imaxim.ro/
   - localitate: Ploiești
   - scor: 50
   - motiv: email comercial disponibil, telefon disponibil, website activ/verificabil
   - actiune recomandata: email (office@imaxim.ro); Dealer Fondator + preluare stoc din website/feed

3. Acar Auto
   - email: office@acarauto.ro
   - telefon: +40722141081
   - website: https://www.acarauto.ro/
   - localitate: Blejoi
   - scor: 50
   - motiv: email comercial disponibil, telefon disponibil, website activ/verificabil
   - actiune recomandata: email (office@acarauto.ro); Dealer Fondator + preluare stoc din website/feed

4. Mobel Auto- Service Skoda
   - email: vanzari@mobel.ro
   - telefon: +40244599995
   - website: https://www.mobel.ro/
   - localitate: Ploiești
   - scor: 50
   - motiv: email comercial disponibil, telefon disponibil, website activ/verificabil
   - actiune recomandata: email (vanzari@mobel.ro); Dealer Fondator + preluare stoc din website/feed

5. PEX Auto
   - email: office@pex.ro
   - telefon: +40733020427
   - website: https://www.pex.ro/
   - localitate: Blejoi
   - scor: 45
   - motiv: email comercial disponibil, telefon disponibil, website activ/verificabil, catalog online detectat
   - actiune recomandata: email (office@pex.ro); Dealer Fondator + preluare stoc din website/feed

6. Pyter Auto
   - email: -
   - telefon: +40723582317
   - website: https://www.pyterauto.ro/
   - localitate: Câmpina
   - scor: 15
   - motiv: telefon disponibil, website activ/verificabil
   - actiune recomandata: telefon (+40723582317); Dealer Fondator + preluare stoc din website/feed

7. Mercedes
   - email: dan.serbanescu@autoklass.ro
   - telefon: +40344710313
   - website: https://www.autoklass-market.ro/
   - localitate: Blejoi
   - scor: 10
   - motiv: email comercial disponibil, telefon disponibil, website activ/verificabil
   - actiune recomandata: email (dan.serbanescu@autoklass.ro); Dealer Fondator + preluare stoc din website/feed

8. KLP Autorulate
   - email: -
   - telefon: +40737150665
   - website: -
   - localitate: Boldești-Scăeni
   - scor: 5
   - motiv: telefon disponibil
   - actiune recomandata: telefon (+40737150665); Dealer Fondator + publicare gratuita asistata
