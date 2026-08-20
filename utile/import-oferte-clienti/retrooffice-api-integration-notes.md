# RetroOffice External API - note integrare Trevoro/Nexora

Document analizat: `RetroOffice_External_API_v1.0_Final_Documentation.pdf`

## Ce permite API-ul

- `GET /rooms` - citire camere si paturi.
- `GET /availability` - verificare disponibilitate pe interval, cu `arrival_date`, `departure_date`, `no_people`.
- Preturi dinamice in raspunsul de disponibilitate: `price_per_bed_per_night`, `total_price`, `currency`.
- `POST /booking/create` - creare rezervare.
- `GET /booking/details/{uid}` - detalii rezervare si status.
- `POST /booking/cancel` - anulare rezervare.

Base URL documentat:

```text
https://retroffice.retro.ro/external/api/1.0/
```

Rate limit:

```text
5 requesturi / minut / partener
```

## Cum il mapam in Trevoro

- Provider nou in zona channel manager/API: `retrooffice`.
- Camerele/paturile din `/rooms` se importa in `travel_property_rooms`.
- `/availability` se foloseste pentru pagina publica Trevoro cand turistul selecteaza date + numar persoane.
- Pretul final venit de la RetroOffice trebuie tratat ca pret autoritar pentru acel interval.
- Rezervarea Trevoro se creeaza in RetroOffice prin `/booking/create`, apoi salvam `uid` in `travel_booking_requests.external_reservation_id`.
- Anularea din Trevoro trebuie sa cheme `/booking/cancel`.

## Lipsuri de clarificat cu hotelul/RetroOffice

1. Endpointul OAuth2 pentru token nu este documentat.
   - Avem nevoie de URL-ul exact, metoda, grant type, payload si exemplu de raspuns.

2. Nu este clar cum se transmite optiunea aleasa la rezervare.
   - `/availability` intoarce camere si paturi.
   - `/booking/create` nu are `room_id`, `bed_id` sau `option_id`.
   - Trebuie confirmat daca RetroOffice aloca automat camera/patul pentru `no_people`.

3. Avem nevoie de credentiale:
   - `Client ID`
   - `Client Secret`
   - `Partner Identifier`
   - sandbox/test sau confirmare ca folosim productie cu booking test anulabil.

4. Trebuie confirmat daca pretul include taxe, mic dejun sau alte servicii.

5. Trebuie confirmat daca exista webhooks pentru modificari/anulari facute direct in RetroOffice.
   - Daca nu exista, facem polling periodic pe rezervarile create de Trevoro.

## Propunere implementare

1. Adaugam provider `retrooffice` in lista de integrari Trevoro/Nexora.
2. Salvam credentialele pe proprietate in tabela existenta de integrari.
3. Implementam client API cu throttle minim 12 secunde intre requesturi pentru acel provider.
4. Implementam test conexiune: token + `/rooms`.
5. Implementam import camere: `/rooms` -> camere Trevoro.
6. Implementam availability live pentru pagina publica.
7. Implementam create booking + cancel booking.
8. Salvam loguri si erori in `last_sync_summary`, `last_error`, respectiv in booking request.
