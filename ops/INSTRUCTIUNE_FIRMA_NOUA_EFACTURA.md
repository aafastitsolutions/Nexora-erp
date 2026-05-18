# Instructiune de lucru pentru o firma noua - modul facturare si e-Factura

## Scop

Acest document explica pasii minimi pentru o firma noua care vrea sa emita facturi din aplicatie si sa le transmita prin SPV / RO e-Factura.

## Regula practica importanta

Daca firma a mai folosit deja e-Factura prin alta aplicatie (de exemplu SmartBill) si contabilul are in continuare certificat digital valid cu acces SPV pe CUI-ul firmei, de regula nu mai este nevoie de o noua inrolare la ANAF.

In acest caz, este suficienta conectarea SPV din aplicatia noastra pentru firma respectiva.

## Ce trebuie sa existe inainte de activare

1. Firma sa aiba cont activ in aplicatie.
2. Firma sa aiba completate corect datele de facturare:
   - denumire firma
   - CUI
   - nr. Reg. Com.
   - adresa
   - IBAN / banca, daca apar pe factura
3. Sa existe un utilizator cu acces la modulul SPV:
   - super admin
   - sau utilizator cu rol `accounting`
4. Contabilul sau reprezentantul firmei sa aiba:
   - certificat digital valid
   - acces SPV activ pentru CUI-ul firmei
   - posibilitatea de autentificare la ANAF pentru firma respectiva

## Procedura de activare pentru o firma noua

### Pasul 1 - Verificarea dreptului ANAF

Firma confirma cu contabilul urmatorul lucru:

"Puteti intra in SPV / e-Factura pentru CUI-ul acestei firme cu certificatul digital actual?"

Daca raspunsul este `da`, se continua direct cu conectarea in aplicatie.

Daca raspunsul este `nu`, firma trebuie mai intai sa rezolve accesul SPV la ANAF pentru acel CUI.

### Pasul 2 - Completarea datelor firmei in aplicatie

Inainte de prima factura se verifica:

- CUI-ul firmei este introdus corect
- seria facturilor este setata corect
- datele firmei care apar pe factura sunt complete si actualizate

Fara CUI corect, trimiterea prin SPV nu trebuie pornita.

### Pasul 3 - Conectarea SPV in aplicatie

Un utilizator cu acces la SPV intra in aplicatie si deschide modulul SPV.

De acolo:

1. apasa pe conectarea contului ANAF / SPV
2. contabilul finalizeaza autentificarea cu certificatul digital
3. aplicatia salveaza conexiunea ANAF pentru firma curenta

Important:

Conectarea se face separat pentru fiecare firma din aplicatie. Faptul ca un certificat functioneaza pentru o firma nu inseamna automat ca este autorizat si pentru toate celelalte firme.

## Prima emitere de factura

Dupa conectarea SPV:

1. se creeaza factura in modulul de facturare
2. se verifica datele clientului si liniile facturii
3. se emite factura
4. se trimite in e-Factura din actiunile documentului
5. se urmareste statusul pana apare confirmarea ANAF
6. se descarca raspunsul SPV / arhiva ZIP, daca este necesar

## Regula operationala recomandata

La prima folosire pentru o firma noua, se recomanda:

1. emiterea unei facturi reale mici sau a primei facturi disponibile
2. verificarea statusului pana la confirmare in ANAF
3. confirmarea ca raspunsul SPV se poate descarca din aplicatie

Abia dupa aceasta verificare fluxul se considera activat complet pentru firma respectiva.

## Cand trebuie refacuta partea ANAF

Firma trebuie sa revina la contabil / ANAF daca apare una dintre situatiile de mai jos:

- certificatul digital a expirat
- certificatul digital a fost reinnoit sau schimbat
- contabilul nu mai vede CUI-ul firmei in SPV
- conectarea esueaza deoarece certificatul nu are drepturi pe firma respectiva

## Dupa reinnoirea certificatului digital

Daca firma isi reinnoieste certificatul digital, recomandarea operationala este:

1. contabilul confirma mai intai ca noul certificat este valid in SPV pentru CUI-ul firmei
2. in aplicatie se deschide modulul SPV
3. daca apare mesajul de reautorizare, se genereaza un cod / link pentru contabil
4. contabilul deschide linkul primit sau intra in portalul public de reautorizare si introduce codul
5. contabilul continua autorizarea ANAF cu noul certificat digital
6. dupa autorizare, firma poate relua trimiterea si sincronizarea SPV

### Flux nou disponibil in aplicatie

Aplicatia poate genera acum un cod securizat de reautorizare, valabil temporar, care poate fi trimis contabilului.

Contabilul are doua variante:

- deschide direct linkul primit
- intra in portalul public de reautorizare si introduce manual codul

Portalul public pentru cod este:

- `/anaf/reautorizare`

Acest flux este util in special dupa:

- reinnoirea certificatului digital
- schimbarea certificatului digital
- pierderea valabilitatii conexiunii SPV din aplicatie
- erori de tip token expirat / refresh token invalid

## Mesaj scurt pentru client

Pentru a activa facturarea cu e-Factura in aplicatia noastra, avem nevoie doar ca firma sa aiba datele de facturare complete si ca persoana care gestioneaza relatia cu ANAF sa aiba certificat digital valid si acces SPV pe CUI-ul firmei. Daca firma a folosit deja e-Factura in alta aplicatie si acel acces ANAF este inca activ, nu mai este necesara o noua inrolare; facem doar conectarea SPV in platforma noastra si putem emite factura.
