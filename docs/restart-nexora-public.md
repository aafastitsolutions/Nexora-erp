# Restart si deploy Nexora public

Nota rapida pentru chat-uri noi: domeniul public `https://nexora.aafastitsolutions.ro` nu ruleaza din instanta locala simpla pe care o vezi in `/home/server/Nexora`. Publicul ruleaza pe VPS-ul `trevoro-vps`, in `/home/server/Nexora`.

## Cand ai modificat cod/UI

Ruleaza din proiectul local:

```bash
npm run nexora:deploy-public
```

Acesta este pasul corect pentru modificari de UI, rute, lib-uri, scripturi sau CSS. Scriptul:

- sincronizeaza codul catre `trevoro-vps:/home/server/Nexora`;
- ruleaza verificari `node --check` pe VPS;
- reporneste `nexora.service` pe VPS;
- verifica public `https://nexora.aafastitsolutions.ro/login`.

Nu ajunge doar:

```bash
systemctl --user restart nexora.service
```

Restartul local nu actualizeaza ce vede utilizatorul pe domeniul public.

## Cand vrei doar restart pe public

Fara deploy de cod:

```bash
npm run nexora:restart-public
```

Scriptul detecteaza daca masina curenta nu este VPS-ul public si executa restartul prin SSH pe `trevoro-vps`.

## Verificarea obligatorie

Dupa deploy/restart, verifica:

```bash
npm run nexora:check-public
```

Trebuie sa vezi:

- status public `200` pe `https://nexora.aafastitsolutions.ro/login`;
- header `X-Nexora-Origin: nexora-vps-main`;
- textul `Nexora Login` in pagina.

Nu valida doar root-ul `/`. Root-ul poate fi fals pozitiv sau poate afisa alt continut.

## Verificare UI autentificata

Daca utilizatorul spune ca nu vede o modificare in panou, nu testa doar local cu `127.0.0.1:3000`. Creeaza user temporar pe VPS sau foloseste cont real si verifica prin domeniul public:

```bash
https://nexora.aafastitsolutions.ro/nexora/e-marqet
```

Pentru e-Marqet, dupa fixul din 2026-07-13, pagina trebuie sa contina:

- tabul `Email & Suport`;
- linkul `/nexora/e-marqet/email`;
- badge-ul `Email & Suport activ`.

## Comanda manuala echivalenta

Daca scriptul nu poate fi folosit:

```bash
ssh -o BatchMode=yes trevoro-vps "cd /home/server/Nexora && systemctl restart nexora.service && systemctl status nexora.service --no-pager -l | sed -n '1,50p'"
node scripts/check-nexora-public-origin.mjs
```

