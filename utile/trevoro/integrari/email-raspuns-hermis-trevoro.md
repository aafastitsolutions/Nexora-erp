# Email raspuns Hermis - integrare Trevoro

**Subiect:** Re: Integrare Trevoro cu Hermis - documentatie API / flux distributie

Buna ziua,

Va multumesc pentru raspuns si pentru deschiderea catre integrarea Trevoro cu Hermis.

Modelul propus de dumneavoastra este compatibil cu directia noastra: Hermis ramane sursa principala pentru proprietati, unitati, planuri tarifare, disponibilitate si tarife, iar Trevoro functioneaza ca un canal suplimentar de distributie si rezervare.

Pe scurt, pentru integrarea Trevoro - Hermis propunem urmatorul flux:

- Hermis transmite catre Trevoro proprietatile, unitatile/camerele, planurile tarifare si politicile comerciale;
- Hermis impinge catre Trevoro disponibilitatea, tarifele si restrictiile, la granularitate pe zi, unitate si plan tarifar;
- Trevoro afiseaza inventarul actualizat catre turisti;
- cand apare o rezervare, modificare sau anulare in Trevoro, transmitem evenimentul catre webhook-ul Hermis;
- Hermis raspunde cu ID-ul rezervarii din PMS, astfel incat pastram maparea intre Trevoro si Hermis.

Am pregatit si activat **Trevoro Partner API v1** pentru testare, care acopera:

- endpoint-uri pentru upsert proprietati, unitati si planuri tarifare;
- endpoint pentru push ARI: availability, rates, restrictions;
- structura evenimentelor de rezervare trimise catre webhook-ul Hermis;
- autentificare, idempotenta si format general de payload.

Date de conectare pentru test:

```text
Base URL: https://www.trevoro.ro/api/partner/v1
Authorization: Bearer 8b395b3c29b8093be51164fb3bf2d92588ea40f4f9ef1ec11aab1d9353413e84
Content-Type: application/json
```

Endpoint-urile sunt dedicate partenerilor si sunt separate de endpoint-urile interne de owner dashboard.

Pentru a finaliza sandbox-ul si payload-urile, ne-ar ajuta sa ne confirmati:

1. URL-ul de webhook Hermis pentru rezervari/modificari/anulari sau formatul asteptat pentru callback.
2. Metoda de autentificare preferata pentru webhook: Bearer token, Basic Auth sau semnatura HMAC.
3. Un exemplu de proprietate Hermis cu unitati, planuri tarifare si disponibilitate pe cateva zile.
4. Daca doriti ca rezervarile Trevoro sa fie trimise catre Hermis ca `pending_confirmation` sau direct `confirmed`, in functie de regulile proprietatii.
5. Ce restrictii ARI acceptati in fluxul standard: minimum stay, stop sell, closed to arrival/departure, ocupare diferentiata.

Dupa ce agream aceste detalii, conectam URL-ul vostru de webhook in configuratia Trevoro si putem trece de la proprietati de test inactive la proprietati reale active.

Multumesc,

Valentin Pita
Trevoro
https://www.trevoro.ro
