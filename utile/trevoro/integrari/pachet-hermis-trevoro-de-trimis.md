# Pachet de trimis catre Hermis - Trevoro Partner API v1

## 1. Mesaj scurt pentru email

Buna ziua,

Am pregatit endpoint-urile Trevoro Partner API v1 pentru integrarea cu Hermis, conform modelului propus de dumneavoastra: Hermis trimite proprietati, unitati, planuri tarifare, disponibilitate si tarife catre Trevoro, iar Trevoro trimite inapoi rezervarile/modificarile/anularile catre Hermis.

Date de conectare:

```text
Base URL: https://www.trevoro.ro/api/partner/v1
Authorization: Bearer 8b395b3c29b8093be51164fb3bf2d92588ea40f4f9ef1ec11aab1d9353413e84
Content-Type: application/json
```

Pentru inceput, puteti testa cu proprietati trimise cu `status: "inactive"`; acestea se salveaza in Trevoro, dar nu apar public in listari. Cand validam payload-urile, proprietatile reale se pot trimite cu `status: "active"`.

Pana ne transmiteti URL-ul de webhook Hermis pentru rezervari, aveti si fallback de polling:

```http
GET /reservations?updated_since=2026-06-24T00:00:00Z
```

Pentru activarea livrarii automate prin webhook, avem nevoie de:

1. URL webhook Hermis pentru `reservation.created`, `reservation.modified`, `reservation.cancelled`.
2. Metoda de autentificare preferata pentru webhook: Bearer token, Basic Auth sau HMAC.
3. Confirmare daca rezervarile Trevoro trebuie create in Hermis ca `pending_confirmation` sau direct `confirmed`.
4. Un exemplu real de proprietate Hermis cu unitati, planuri tarifare si ARI pentru cateva zile.

Mai jos sunt endpoint-urile si exemplele de payload.

Multumesc,
Valentin Pita
Trevoro
https://www.trevoro.ro

---

## 2. Endpoint-uri disponibile

### Health check

```http
GET https://www.trevoro.ro/api/partner/v1/health
Authorization: Bearer 8b395b3c29b8093be51164fb3bf2d92588ea40f4f9ef1ec11aab1d9353413e84
```

Raspuns:

```json
{
  "ok": true,
  "service": "trevoro-partner-api",
  "version": "v1",
  "provider": "hermis"
}
```

### Upsert proprietate

```http
PUT /properties/{external_property_id}
```

Exemplu:

```json
{
  "name": "Hotel Exemplu",
  "type": "hotel",
  "status": "inactive",
  "country": "Romania",
  "county": "Brasov",
  "city": "Brasov",
  "address": "Str. Exemplu nr. 1",
  "phone": "+40700000000",
  "email": "rezervari@example.ro",
  "website": "https://example.ro",
  "description": "Descriere publica a proprietatii.",
  "amenities": ["wifi", "parcare"],
  "photos": [
    {
      "url": "https://example.ro/photo1.jpg",
      "caption": "Exterior",
      "is_cover": true
    }
  ]
}
```

### Citire/export proprietate din Trevoro

```http
GET /properties/{external_property_id}
```

Returneaza proprietatea mapata in Trevoro, camerele/unitatile, planurile tarifare, pozele si datele publice.

### Upsert unitate/camera

```http
PUT /properties/{external_property_id}/units/{external_unit_id}
```

Exemplu:

```json
{
  "name": "Camera dubla",
  "quantity": 10,
  "max_adults": 2,
  "max_children": 1,
  "base_price": 300,
  "currency": "RON",
  "beds": "1 pat matrimonial",
  "amenities": ["wifi", "tv"]
}
```

### Upsert plan tarifar

```http
PUT /properties/{external_property_id}/rate-plans/{external_rate_plan_id}
```

Exemplu:

```json
{
  "name": "Mic dejun inclus",
  "meal_type": "breakfast",
  "pricing_mode": "per_room",
  "room_price": 350,
  "currency": "RON",
  "cancellation_policy": {
    "type": "free_until_days_before_arrival",
    "days": 3
  },
  "payment_policy": {
    "type": "property_policy"
  }
}
```

### Push ARI bulk

```http
POST /ari/bulk
```

Granularitate acceptata: per proprietate, per unitate, per plan tarifar, per zi.

Exemplu:

```json
{
  "external_property_id": "HERMIS-PROP-1001",
  "items": [
    {
      "date": "2026-07-01",
      "external_unit_id": "ROOM-DBL",
      "external_rate_plan_id": "BB",
      "available": 2,
      "currency": "RON",
      "prices": {
        "occupancy_1": 320,
        "occupancy_2": 380,
        "extra_bed": 80,
        "child": 50
      },
      "restrictions": {
        "min_stay": 1,
        "stop_sell": false,
        "closed_to_arrival": false,
        "closed_to_departure": false
      }
    }
  ]
}
```

Raspuns:

```json
{
  "ok": true,
  "provider": "hermis",
  "external_property_id": "HERMIS-PROP-1001",
  "processed": 1,
  "rate_rows_saved": 1,
  "periods_saved": 1,
  "errors": []
}
```

### Polling rezervari

```http
GET /reservations
GET /reservations?external_property_id=HERMIS-PROP-1001
GET /reservations?updated_since=2026-06-24T00:00:00Z&limit=100
```

Raspuns:

```json
{
  "ok": true,
  "provider": "hermis",
  "reservations": [
    {
      "trevoro_reservation_id": "TRV-90001",
      "trevoro_booking_request_id": 90001,
      "external_property_id": "HERMIS-PROP-1001",
      "external_unit_id": "ROOM-DBL",
      "external_rate_plan_id": "BB",
      "status": "pending",
      "check_in": "2026-07-01",
      "check_out": "2026-07-04",
      "nights": 3,
      "rooms": 1,
      "guests": {
        "adults": 2,
        "children": 1,
        "child_ages": [7]
      },
      "guest": {
        "full_name": "Ion Popescu",
        "email": "ion.popescu@example.com",
        "phone": "+40700000000"
      },
      "pricing": {
        "currency": "RON",
        "total": 1140,
        "price_per_night": 380,
        "payment_status": "not_collected_by_trevoro"
      },
      "source": "trevoro_www"
    }
  ]
}
```

---

## 3. Webhook rezervari catre Hermis

Trevoro este pregatit sa trimita automat evenimentele catre Hermis dupa ce primim URL-ul de webhook.

Evenimente:

```text
reservation.created
reservation.modified
reservation.cancelled
```

Header-e trimise:

```http
Content-Type: application/json
X-Trevoro-Event: reservation.created
X-Trevoro-Delivery-Id: trv_evt_reservation_created_123_...
Authorization: Bearer <tokenul-furnizat-de-Hermis>        optional
X-Trevoro-Signature: sha256=<hmac>                         optional
```

Payload:

```json
{
  "event": "reservation.created",
  "event_id": "trv_evt_reservation_created_123",
  "created_at": "2026-06-24T12:00:00Z",
  "reservation": {
    "trevoro_reservation_id": "TRV-123",
    "external_property_id": "HERMIS-PROP-1001",
    "external_unit_id": "ROOM-DBL",
    "external_rate_plan_id": "BB",
    "status": "pending",
    "check_in": "2026-07-01",
    "check_out": "2026-07-04",
    "guests": {
      "adults": 2,
      "children": 0,
      "child_ages": []
    },
    "guest": {
      "full_name": "Ion Popescu",
      "email": "ion.popescu@example.com",
      "phone": "+40700000000"
    },
    "pricing": {
      "currency": "RON",
      "total": 1140,
      "payment_status": "not_collected_by_trevoro"
    },
    "source": "trevoro_www"
  }
}
```

Raspuns asteptat de la Hermis:

```json
{
  "ok": true,
  "external_reservation_id": "HERMIS-RES-7788",
  "status": "accepted"
}
```

Trevoro salveaza `external_reservation_id` primit de la Hermis pentru maparea ulterioara.

---

## 4. Test facut pe Trevoro

Test local/production service efectuat cu proprietate sandbox inactiva:

```text
external_property_id: HERMIS-SANDBOX-001
external_unit_id: ROOM-DBL
external_rate_plan_id: BB
ARI: 2026-07-01, available=2, occupancy_2=380 RON
```

Rezultat:

```text
health: ok
property upsert: ok
unit upsert: ok
rate plan upsert: ok
ARI bulk: ok, processed=1, rate_rows_saved=1, periods_saved=1
reservations polling: ok
property export: ok, camera + plan tarifar + poza externa returnate corect
```
