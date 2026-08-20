# Handoff chat nou - Trevoro public

Trimite textul de mai jos intr-un chat nou cand ai de modificat sau reparat Trevoro public:

```text
Lucrezi in /home/server/Nexora, dar site-ul public Trevoro ruleaza din /home/server/Trevoro prin user services:
- trevoro-site.service pe http://127.0.0.1:3100
- cloudflared-trevoro.service cu /home/server/.cloudflared/trevoro.yml

Citeste intai /home/server/Nexora/ops/TREVORO_PUBLICARE.md.

Pentru site Trevoro:
cd /home/server/Trevoro
npm run build
systemctl --user restart trevoro-site.service

Pentru login Trevoro:
- /home/server/Trevoro/.env trebuie sa aiba TREVORO_AUTH_SECRET la build.
- TREVORO_OWNER_API_SECRET din /home/server/Trevoro/.env si din user service trebuie sa fie acelasi cu secretul Nexora public.
- Daca lipseste TREVORO_AUTH_SECRET la build, login_challenge devine invalid si utilizatorii primesc error=1.
- Daca TREVORO_OWNER_API_SECRET difera, conturile de proprietar apar ca negasite.

Nexora public este separat pe trevoro-vps pentru https://nexora.aafastitsolutions.ro. Pentru rute API Nexora modificate, sincronizeaza fisierul pe trevoro-vps si reporneste nexora.service.
```
