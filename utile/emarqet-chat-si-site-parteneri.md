# E-MARQET: chat, mini-site parteneri si actiuni pe anunt

Data nota: 2026-07-14

## Context

Acest task trebuie reluat dupa campania catre parcurile auto.

Cerinta: e-Marqet trebuie sa functioneze mai aproape de OLX pentru clientul final, dar cu avantajul Nexora pentru parteneri:
- clientul poate discuta cu vanzatorul direct din cont;
- clientul poate atasa poze sau documente in conversatie;
- partenerii cu multe anunturi, de exemplu parcuri auto sau agentii imobiliare, primesc o pagina publica proprie;
- pagina partenerului arata ca un mini-site cu anunturile lui, cautare, filtre si butoane de contact;
- pe anunt trebuie sa existe butoane diferite pentru contact, WhatsApp, programare vizionare si rezervare.

## Directie de produs

Anuntul trebuie sa ramana in e-Marqet pentru tracking, lead-uri si chat.

Cand anuntul apartine unui partener, pagina anuntului trebuie sa afiseze clar brandingul partenerului si link catre pagina lui:
- nume partener;
- logo/coperta;
- oras/judet;
- telefon/email/WhatsApp daca sunt publice;
- buton "Vezi toate anunturile partenerului".

Clickul pe un anunt din cautarea e-Marqet nu trebuie sa scoata utilizatorul direct din platforma. Deschide anuntul in e-Marqet, dar cu sectiune puternica de partener si link catre mini-site-ul lui.

## Faza 1: mini-site partener

Extindere peste ce exista deja:
- route public: `/parteneri/:partnerKey`;
- tabela existenta: `emarqet_partner_profiles`;
- anunturi legate prin `emarqet_listings.partner_profile_id`;
- render existent: `renderEmarqetPublicPartnerPage`.

De facut:
- pagina partenerului sa aiba layout de mini-site, nu doar profil simplu;
- cautare in anunturile partenerului;
- filtre dupa verticala, pret, locatie si campuri specifice auto/imobiliare;
- sortare: cele mai noi, pret crescator, pret descrescator;
- grid de anunturi mai clar;
- butoane contact/WhatsApp pe pagina partenerului;
- analytics pe pagina partenerului.

## Faza 2: butoane pe anunt

Pe pagina anuntului trebuie butoane separate:
- Contacteaza proprietar;
- WhatsApp;
- Programeaza vizionare;
- Rezerva auto / Rezerva proprietate.

Implementare recomandata:
- extindere peste POST `/contact`;
- se adauga `action_type` sau `source` diferit:
  - `contact_seller`;
  - `schedule_viewing`;
  - `reserve_listing`;
  - `whatsapp_click`;
- fiecare actiune creeaza lead in `emarqet_leads`;
- mesajul trebuie sa includa datele formularului si intentia clientului;
- partenerul primeste email pe adresa lui, iar Nexora/e-Marqet pastreaza copia in dashboard.

Formular programare vizionare:
- nume;
- telefon;
- email optional;
- data dorita;
- interval orar;
- mesaj.

Formular rezervare:
- nume;
- telefon;
- email;
- tip rezervare;
- mesaj;
- accept termen: rezervarea este cerere, nu plata confirmata.

## Faza 3: chat client-vanzator

Chatul se face dupa ce fazele 1 si 2 sunt stabile.

Functional:
- client logat poate porni conversatie din anunt;
- vanzator/partener vede conversatiile in cont;
- mesajele raman in e-Marqet;
- atasamente: imagini si documente;
- notificari email la mesaj nou;
- status citit/necitit;
- blocare/raportare conversatie;
- mesajele trebuie legate de listing si partener.

Tabele propuse:
- `emarqet_conversations`
  - id, company_id, listing_id, partner_profile_id, buyer_user_id, seller_user_id, status, created_at, updated_at
- `emarqet_conversation_messages`
  - id, conversation_id, sender_user_id, body, created_at, read_at
- `emarqet_conversation_attachments`
  - id, message_id, file_name, file_path, mime_type, file_size, created_at

Reguli:
- doar participantii conversatiei si adminul Nexora pot vedea mesajele;
- limitare dimensiune fisiere;
- tipuri permise initial: jpg, png, webp, pdf, doc, docx;
- mai tarziu: scanare antivirus.

## Faza 4: dashboard partener

Partenerul trebuie sa poata:
- vedea propriile anunturi;
- incarca manual anunturi;
- importa CSV/XLSX;
- vedea lead-uri primite;
- vedea programari si rezervari;
- raspunde la chat;
- vedea statistici pentru mini-site si anunturi.

## Ordinea recomandata

1. Mini-site partener cu filtre si cautare.
2. Butoane separate pe anunt: contact, WhatsApp, programare, rezervare.
3. Email notificare catre partener + evidenta in Nexora.
4. Chat simplu fara atasamente.
5. Atasamente in chat.
6. Dashboard partener complet.

## Fisiere de pornire

- `routes/emarqet-public-routes.js`
- `src/ui/emarqet-public-pages.js`
- `routes/emarqet-routes.js`
- `lib/emarqet-email-dashboard.js`
- `lib/emarqet-marketplace-services.js`

## Observatie importanta

Nu construi doar chatul izolat. Valoarea comerciala pentru parcuri auto si agentii vine din pachet:
mini-site partener + anunturi + lead-uri + programari + rezervari + chat.
