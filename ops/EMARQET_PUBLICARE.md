# e-Marqet publicare

## Status 2026-07-06

- Domeniu: `e-marqet.com`
- Nameservere active observate public: `elaine.ns.cloudflare.com`, `kayden.ns.cloudflare.com`.
- Propagare DNS: majoritatea resolverelor vad Cloudflare; `1.0.0.1` poate ramane temporar cu NS vechi Zooku pana expira cache-ul.
- VPS/Nginx este pregatit pentru `e-marqet.com` si `www.e-marqet.com` prin `/etc/nginx/sites-available/emarqet.conf`.
- Aplicatia Nexora serveste e-Marqet la root `/` cand `Host` este `e-marqet.com` sau `www.e-marqet.com`.
- `https://e-marqet.com/` si `https://www.e-marqet.com/` raspund 200 prin Cloudflare, cu `X-Nexora-Origin: nexora-vps-main`.
- `www.e-marqet.com` este redirectionat canonic catre `https://e-marqet.com/` cand ajunge la Nexora.
- Daca un browser vede `Index of /` cu `cgi-bin`, resolverul acelui client inca are cache DNS vechi catre hostingul Zooku/IP vechi, nu catre Cloudflare. Autoritativ Cloudflare raspunde cu IP-uri Cloudflare.
- Certificat origin VPS instalat cu Certbot/Let's Encrypt:
  - domenii: `e-marqet.com`, `www.e-marqet.com`
  - path: `/etc/letsencrypt/live/e-marqet.com/fullchain.pem`
  - expirare curenta: 2026-10-04
  - reînnoire automata prin `certbot.timer`
  - Cloudflare poate fi trecut pe `Full strict`.
- Platforma publica foloseste domeniul dedicat:
  - `/`
  - `/anunturi`
  - `/publica`
  - `/anunt/:slugOrCode`
  - `/:verticalCode`
- Vechiul URL public `https://nexora.aafastitsolutions.ro/e-marqet...` face redirect permanent catre `https://e-marqet.com...`.

## Verificari efectuate

```bash
curl -H 'Host: e-marqet.com' http://46.225.237.185/
curl -k -H 'Host: e-marqet.com' https://46.225.237.185/
curl -H 'Host: e-marqet.com' http://46.225.237.185/api/e-marqet/verticals
curl -I https://e-marqet.com/
curl -I https://www.e-marqet.com/
curl -I https://nexora.aafastitsolutions.ro/e-marqet
curl -I https://nexora.aafastitsolutions.ro/e-marqet/anunturi
curl https://e-marqet.com/api/e-marqet/pricing
curl https://e-marqet.com/api/e-marqet/services?vertical=auto
```

Toate raspund din `nexora-vps-main`.

## Monetizare 2026-07-06

- Catalog abonamente seed-uit in DB:
  - `Free`: 0 lei, 3 anunturi active, 30 zile.
  - `Start`: 29 lei/luna sau 290 lei/an, 10 anunturi.
  - `Pro`: 79 lei/luna sau 790 lei/an, 100 anunturi, profil verificat, promovare categorie, import Excel, AI inclus.
  - `Business`: 199 lei/luna sau 1.990 lei/an, anunturi nelimitate, CSV/XML/API, CRM, statistici complete.
  - `Enterprise`: 499 lei/luna sau 4.990 lei/an, multi-user, API complet, ERP, AI, suport prioritar.
- Pachete dedicate:
  - `Auto Business`: 299 lei/luna.
  - `Real Estate Business`: 299 lei/luna.
  - `Turism + Trevoro`: integrare directa cu Trevoro, pret la cerere.
- Oferta `Founding Member`:
  - Business: 99 lei/luna pe viata.
  - Enterprise: 249 lei/luna pe viata.
  - Valabila pentru primii 100 de clienti cat timp abonamentul ramane activ.
- Servicii suplimentare seed-uite: promovare homepage 7/30 zile, top categorie, evidentiere, distributii Facebook/Instagram/TikTok/YouTube, AI rescriere/descriere, video din imagini si eliminare fundal AI.
- Rute de verificat dupa deploy:
  - `/nexora/e-marqet/subscriptions`
  - `https://e-marqet.com/#preturi`
  - `/api/e-marqet/pricing`

## Marketplace Services 2026-07-06

- Modul intern nou: `/nexora/e-marqet/services`.
- Tabele noi:
  - `emarqet_marketplace_services` pentru catalog servicii integrate.
  - `emarqet_service_requests` pentru cereri venite din public sau introduse manual.
  - `emarqet_listing_badges` pentru badge-uri de incredere pe anunt.
- Servicii auto seed-uite:
  - VIN decode basic, gratuit, prin fallback public NHTSA vPIC.
  - VIN decode complet, necesita API partener.
  - Raport istoric auto, raport dauna/km, necesita carVertical/autoDNA/Cebia/RAR/alt partener.
  - Calculator leasing, estimare pret piata, test drive, programare service, contract, asigurare, finantare si promovare anunt verificat.
- Rute publice noi:
  - `/api/e-marqet/services?vertical=auto`
  - `/api/e-marqet/services/requests`
  - `/api/e-marqet/services/vin-decode`
  - `POST /services/request`
- Pe pagina publica a unui anunt auto apar carduri de servicii. VIN decode ruleaza instant; restul creeaza cereri in Nexora/CRM.
- Pentru badge `Istoric verificat`, marcheaza cererea de raport ca `FINALIZAT`; sistemul creeaza automat badge-ul pe listare.

## Pasi ramasi pentru Cloudflare

1. Confirma in Cloudflare ca zona `e-marqet.com` apare `Active`.
2. Pastreaza DNS:
   - `A @ -> 46.225.237.185`, proxied=true
   - `CNAME www -> e-marqet.com`, proxied=true
3. SSL/TLS Cloudflare: poate fi setat pe `Full strict`, deoarece origin-ul are certificat Let's Encrypt valid pentru `e-marqet.com` si `www.e-marqet.com`.
4. Dupa propagare verifica:

```bash
curl -I https://e-marqet.com/
curl -sS https://e-marqet.com/ | grep -i 'e-Marqet'
```
