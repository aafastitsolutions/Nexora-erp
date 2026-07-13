# e-Marqet - distributie Facebook, grupuri si Marketplace

## Ce este implementat in Nexora

- Pagina noua: `/nexora/e-marqet/social`
- Cont social e-Marqet pentru Facebook Page.
- Targeturi sociale: pagina proprie, Facebook Marketplace manual, cautari de grupuri pe categorii.
- Generator de postari pentru listarile publicate.
- Queue de publicare:
  - `page` + cont conectat + token valid = publicare API pe pagina.
  - `group` / `marketplace` = flux manual, cu text gata de copiat si link target.

## Ce nu automatizam

- Nu facem bot pentru join masiv in grupuri.
- Nu postam automat in grupuri prin browser automation.
- Nu postam automat in Facebook Marketplace prin browser automation.
- Nu folosim conturi multiple pentru a ocoli limitele Facebook.

Motiv: Groups API a fost eliminat pentru publicare third-party, iar Marketplace listing API este disponibil doar in zona de parteneriat Meta. Automatizarile de browser pentru join/postare masiva risca blocarea contului, paginii sau domeniului.

## Ce trebuie configurat pentru publicare pe pagina

1. Pagina Facebook e-Marqet.
2. Meta Business Manager cu pagina e-Marqet administrata acolo.
3. Meta App pentru Nexora/e-Marqet.
4. Redirect URL valid catre Nexora, daca activam OAuth complet.
5. Permisiuni pentru Pages API:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
6. Page ID si Page Access Token salvate in `/nexora/e-marqet/social`.
7. Dupa token valid, postarea de tip `page` poate fi pusa in coada si procesata.

## Flux recomandat pentru grupuri

1. In `/nexora/e-marqet/social`, deschidem linkurile de cautare grupuri.
2. Alegem grupuri reale pe verticala: auto, imobiliare, joburi, electronice, servicii locale.
3. Intram manual in grupuri si citim regulile.
4. In Nexora marcam:
   - `Cerere trimisa`
   - `Membru`
   - `Promovare permisa`
   - `Reguli: permis / doar recomandari / fara linkuri`
5. Abia dupa asta bifam `Include grupuri aprobate` la generarea pachetului.
6. Se posteaza manual, cu text adaptat la regula grupului.

## Flux recomandat pentru Marketplace

1. Generam pachet social pentru listarile publicate.
2. Nexora creeaza text Marketplace cu titlu, pret, locatie si link.
3. Operatorul deschide targetul `Facebook Marketplace - publicare manuala`.
4. Completeaza manual campurile Marketplace si foloseste imaginile/listarea e-Marqet.

Pentru publicare API in Marketplace trebuie verificata eligibilitatea pentru Meta Marketplace Partner Seller/Item API.

## Strategie anti-blocare

- Maximum 1 postare/saptamana/grup la inceput.
- Variem textul, nu copiem acelasi mesaj in 20 de grupuri.
- Postam doar in grupuri unde anunturile sunt permise.
- Prioritizam postari utile: anunt real, locatie, pret, contact clar.
- Pagina e-Marqet publica constant, grupurile amplifica selectiv.
- Marketplace se foloseste pentru anunturi concrete, nu pentru reclama generala.

## Ordinea practica

1. Completeaza Page ID si Page Access Token pentru e-Marqet.
2. Proceseaza 1 postare de test pe pagina.
3. Alege 10 grupuri auto si 10 grupuri imobiliare.
4. Trimite cereri de join manual.
5. Marcheaza in Nexora grupurile acceptate.
6. Genereaza postari cu `Include grupuri aprobate`.
7. Posteaza manual in 3-5 grupuri/zi, cu rotatie pe verticala.
