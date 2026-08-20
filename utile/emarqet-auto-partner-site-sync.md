# e-Marqet - import automat anunturi parteneri auto

Script:

```bash
cd /home/server/Nexora
node scripts/sync-emarqet-approved-auto-partner-sites.mjs
node scripts/sync-emarqet-approved-auto-partner-sites.mjs --commit
```

Parteneri configurati:

- Auto Geist Galati: `https://autogeist.ro/wp-json/wp/v2/car`
- SAN AUTO Import: `https://www.sanautoimport.ro/?masini=masini-stoc`
- SEBAL Automobile: `https://sebal-auto.ro/wp-sitemap-posts-listings-1.xml`

Reguli:

- `dry-run` implicit fara `--commit`;
- `--commit` scrie in `emarqet_listings` si logheaza in `emarqet_partner_imports`;
- codul de anunt este stabil pe URL sursa: `EMQ-AG-*` si `EMQ-SAI-*`;
- refresh-ul actualizeaza acelasi anunt daca se schimba pret, poze sau detalii;
- anunturile importate care dispar din sursa activa sunt puse pe `PAUZAT`, dar numai la sincronizare completa;
- rularile de test cu `--max-autogeist` sau `--max-san-details` nu pun pe pauza restul anunturilor.
- Sebal poate fi rulat separat cu `--partner sebal-auto`; codurile sunt `EMQ-SBA-*`.
- Anunturile Sebal intra publicate si promovate automat cu `promotion_level=partner_featured`.
- Pentru Facebook, drafturile pregatite din importurile Sebal sunt in modulul e-Marqet Social, create_by `sebal-facebook-promo`.

Systemd:

```bash
systemctl status emarqet-auto-partner-site-sync.timer --no-pager -l
systemctl status emarqet-auto-partner-site-sync.service --no-pager -l
journalctl -u emarqet-auto-partner-site-sync.service -n 80 --no-pager
systemctl list-timers --all | grep emarqet-auto-partner
```

Unitati:

- `/etc/systemd/system/emarqet-auto-partner-site-sync.service`
- `/etc/systemd/system/emarqet-auto-partner-site-sync.timer`

Timer:

- ruleaza la boot dupa aproximativ 3 minute;
- apoi ruleaza din 30 in 30 de minute.
