# Trevoro publicare

Trevoro publica domeniile printr-un tunnel Cloudflare dedicat:

- aplicatie publica: `trevoro-site.service`
- tunnel public: `cloudflared-trevoro.service`
- config tunnel: `/home/server/.cloudflared/trevoro.yml`
- tunnel ID: `d25ebfd1-1d3b-4e2e-80d3-3498389db2ba`
- origin Trevoro: `http://127.0.0.1:3100`
- origin beta Nexora: `http://127.0.0.1:3000`

Hosturi publice:

- `trevoro.ro` -> `trevoro-site.service`
- `www.trevoro.ro` -> `trevoro-site.service`
- `beta.trevoro.ro` -> `nexora.service`

Restart standard:

```bash
scripts/restart-trevoro-public.sh
```

Pentru modificari de cod in site-ul public Trevoro:

```bash
cd /home/server/Trevoro
npm run build
systemctl --user restart trevoro-site.service
```

Important pentru login:

- Build-ul Next trebuie rulat cu aceleasi secrete ca runtime-ul. Verifica sa existe in `/home/server/Trevoro/.env` cel putin `TREVORO_AUTH_SECRET` si `TREVORO_OWNER_API_SECRET`.
- `TREVORO_AUTH_SECRET` semneaza `login_challenge`; daca lipseste la build dar exista in systemd la runtime, pagina genereaza challenge invalid si login-ul cade in `error=1`.
- `TREVORO_OWNER_API_SECRET` trebuie sa fie acelasi cu secretul Nexora public; daca difera, Trevoro nu gaseste conturile de proprietar si afiseaza cont negasit.
- Nexora public ramane pe `trevoro-vps` pentru `https://nexora.aafastitsolutions.ro`; daca modifici rutele API din `/home/server/Nexora`, sincronizeaza codul pe VPS si reporneste `nexora.service`.

Verificari rapide:

```bash
systemctl --user status trevoro-site.service cloudflared-trevoro.service nexora.service --no-pager -l
curl -I https://trevoro.ro/
curl -I https://www.trevoro.ro/
curl -I https://beta.trevoro.ro/login
```

Tunelul vechi Cloudflare `nexora` nu mai trebuie folosit pentru Trevoro sau Nexora. Trevoro ramane pe `cloudflared-trevoro.service`, iar Nexora ramane pe `cloudflared-aafast.service`.

Nota operationala: in zona Cloudflare `aafastitsolutions.ro` pot exista inregistrari accidentale cu nume de forma `trevoro.ro.aafastitsolutions.ro`; acestea nu sunt hosturile reale Trevoro. Se pot sterge cand exista un token Cloudflare cu acces la zona `aafastitsolutions.ro`.
