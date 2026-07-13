# Handoff chat nou - restart/deploy Nexora public

Trimite textul de mai jos intr-un chat nou ca sa nu se mai piarda contextul:

```text
Lucrezi in /home/server/Nexora. Inainte sa faci restart/deploy pentru Nexora public, citeste nota:
docs/restart-nexora-public.md

Important: domeniul public https://nexora.aafastitsolutions.ro ruleaza pe trevoro-vps, nu pe instanta locala. Pentru modificari de cod/UI foloseste:
npm run nexora:deploy-public

Pentru restart simplu:
npm run nexora:restart-public

Verificarea publica:
npm run nexora:check-public
```

Varianta ultra-scurta:

```text
Vezi /home/server/Nexora/docs/restart-nexora-public.md. Nexora public se deployeaza pe trevoro-vps cu npm run nexora:deploy-public.
```

