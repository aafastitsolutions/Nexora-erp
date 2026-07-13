# Nexora publicare

Traseul canonic pentru `nexora.aafastitsolutions.ro` este:

1. Cloudflare DNS: `A nexora.aafastitsolutions.ro -> 46.225.237.185`, `proxied=true`
2. VPS: Nginx pe `80/443`
3. Nginx proxy: `http://127.0.0.1:3000`
4. Aplicatie: `systemctl --user nexora.service`

Nu se mai foloseste un Cloudflare Tunnel pentru `nexora.aafastitsolutions.ro`.

## Verificarea obligatorie

Dupa orice restart, publicare sau schimbare Cloudflare, ruleaza:

```bash
scripts/restart-nexora-public.sh
```

Scriptul reporneste `nexora.service` si verifica public:

- status `200` pe `https://nexora.aafastitsolutions.ro/login`
- header `X-Nexora-Origin: nexora-vps-main`
- continutul `Nexora Login`

Daca acest check pica, nu debug-ui-ul este prima pista. Intai trebuie reparat traseul public: DNS Cloudflare, Nginx sau serviciul user `nexora.service`.

## Verificari manuale rapide

```bash
systemctl --user status nexora.service --no-pager -l
curl -sS -D /tmp/nexora.headers https://nexora.aafastitsolutions.ro/login -o /tmp/nexora.html
grep -i 'x-nexora-origin\|cf-cache-status\|server:' /tmp/nexora.headers
grep -c 'Nexora Login' /tmp/nexora.html
```

Verificare Cloudflare DNS, doar daca ai tokenul in shell:

```bash
CF_API_TOKEN='...' node scripts/check-nexora-public-origin.mjs --cloudflare
```

Nu salva tokenul Cloudflare in repository.

## Ce nu mai folosim pentru Nexora

- `cloudflared-nexora.service`
- `aafastitsolutions-tunnel.service`
- orice CNAME catre `*.cfargotunnel.com` pentru `nexora.aafastitsolutions.ro`
- verificari doar pe `/` sau doar pe `HTTP 200`

## Separare fata de Trevoro

Trevoro ramane separat si poate folosi propriul tunnel/config. Nu amesteca traseul Trevoro cu `nexora.aafastitsolutions.ro`.
