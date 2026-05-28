# Jurnal Modificari MiniCRM

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

### ANAF / SPV pe domeniul Nexora
- Redirect-ul OAuth ANAF implicit a fost mutat pe `https://nexora.aafastitsolutions.ro/oauth/anaf/callback`.
- Setarile salvate in `app_settings` pentru `anaf_redirect_uri` si pentru companiile configurate au fost actualizate pe domeniul Nexora.
- Aplicatia Nexora a fost repornita dupa actualizarea redirect-ului.
- Observatie operationala: aceeasi adresa trebuie trecuta si in aplicatia din contul ANAF/SPV, altfel ANAF va respinge callback-ul OAuth.

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
