# Trevoro Partner API v1 - Draft tehnic pentru integrarea Hermis

Document de lucru pentru discutia Trevoro - Hermis. Scopul este integrarea Hermis ca sursa de inventar, disponibilitate si tarife, iar Trevoro ca platforma de distributie si rezervare.

## 1. Model de integrare

Hermis trimite catre Trevoro:

- proprietati;
- unitati/camere;
- planuri tarifare;
- disponibilitate, tarife si restrictii, denumite generic ARI;
- actualizari in timp real sau batch, in functie de evenimentele din PMS.

Trevoro trimite catre Hermis:

- rezervari create in Trevoro;
- modificari de rezervare;
- anulari;
- statusuri relevante pentru sincronizarea cu PMS.

Pentru MVP, Trevoro nu proceseaza plata in numele proprietatii, daca nu se stabileste separat. Payload-ul de rezervare include campuri pentru valoare, moneda si status plata, dar `payment_status` poate ramane `not_collected_by_trevoro`.

## 2. Base URL propus

Test / productie:

```text
https://www.trevoro.ro/api/partner/v1
```

Token test:

```text
Authorization: Bearer 8b395b3c29b8093be51164fb3bf2d92588ea40f4f9ef1ec11aab1d9353413e84
```

Observatie: pentru test se pot trimite proprietati cu `status: "inactive"`, ca sa nu apara public in Trevoro. Pentru proprietatile reale se foloseste `status: "active"`.

## 3. Autentificare

Autentificarea propusa este Bearer Token per partener:

```http
Authorization: Bearer <partner_api_token>
Content-Type: application/json
```

Pentru request-uri critice se recomanda si idempotenta:

```http
Idempotency-Key: hermis-<event-id-or-operation-id>
```

Pentru webhook-urile trimise de Trevoro catre Hermis se poate folosi:

- Bearer token furnizat de Hermis;
- Basic Auth;
- semnatura HMAC pe payload, daca Hermis prefera acest model.

## 4. Conventii generale

- Datele calendaristice sunt in format `YYYY-MM-DD`.
- Datele cu ora sunt in ISO 8601.
- Sumele sunt numere, iar moneda este cod ISO, de exemplu `RON` sau `EUR`.
- Toate entitatile trimise de Hermis trebuie sa includa un ID extern stabil.
- Trevoro pastreaza maparea intre ID-urile Hermis si ID-urile interne Trevoro.

Exemplu raspuns standard:

```json
{
  "ok": true,
  "data": {},
  "request_id": "trv_req_123"
}
```

Exemplu eroare:

```json
{
  "ok": false,
  "error": "validation_error",
  "message": "Missing external_property_id",
  "request_id": "trv_req_123"
}
```

## 5. Endpoint-uri propuse

### 5.1 Health check

```http
GET /health
```

Raspuns:

```json
{
  "ok": true,
  "service": "trevoro-partner-api",
  "version": "v1"
}
```

### 5.2 Upsert proprietate

```http
PUT /properties/{external_property_id}
```

Payload:

```json
{
  "external_property_id": "HERMIS-PROP-1001",
  "name": "Hotel Exemplu",
  "type": "hotel",
  "status": "active",
  "description": "Descriere publica a proprietatii.",
  "country": "Romania",
  "county": "Brasov",
  "city": "Brasov",
  "address": "Str. Exemplu nr. 1",
  "latitude": 45.6427,
  "longitude": 25.5887,
  "phone": "+40700000000",
  "email": "rezervari@example.ro",
  "website": "https://example.ro",
  "amenities": ["wifi", "parcare", "mic_dejun"],
  "check_in_time": "15:00",
  "check_out_time": "11:00",
  "photos": [
    {
      "url": "https://example.ro/photo1.jpg",
      "caption": "Exterior",
      "is_cover": true
    }
  ]
}
```

Raspuns:

```json
{
  "ok": true,
  "property": {
    "trevoro_property_id": 123,
    "external_property_id": "HERMIS-PROP-1001",
    "slug": "hotel-exemplu-brasov"
  }
}
```

### 5.3 Upsert unitate/camera

```http
PUT /properties/{external_property_id}/units/{external_unit_id}
```

Payload:

```json
{
  "external_unit_id": "HERMIS-ROOM-DBL",
  "name": "Camera dubla",
  "status": "active",
  "description": "Camera dubla cu pat matrimonial.",
  "quantity": 10,
  "max_adults": 2,
  "max_children": 1,
  "size_sqm": 22,
  "beds": "1 pat matrimonial",
  "amenities": ["wifi", "baie_privata", "tv"],
  "photos": [
    {
      "url": "https://example.ro/room-dbl.jpg",
      "caption": "Camera dubla"
    }
  ]
}
```

Raspuns:

```json
{
  "ok": true,
  "unit": {
    "trevoro_unit_id": 456,
    "external_unit_id": "HERMIS-ROOM-DBL"
  }
}
```

### 5.4 Upsert plan tarifar

```http
PUT /properties/{external_property_id}/rate-plans/{external_rate_plan_id}
```

Payload:

```json
{
  "external_rate_plan_id": "HERMIS-BB",
  "name": "Mic dejun inclus",
  "status": "active",
  "meal_type": "breakfast",
  "pricing_mode": "per_room",
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

### 5.5 Push ARI bulk

```http
POST /ari/bulk
```

Granularitate: per proprietate, per unitate, per plan tarifar, per zi. Optional se pot transmite preturi diferentiate pe ocupare.

Payload:

```json
{
  "external_property_id": "HERMIS-PROP-1001",
  "items": [
    {
      "date": "2026-07-01",
      "external_unit_id": "HERMIS-ROOM-DBL",
      "external_rate_plan_id": "HERMIS-BB",
      "available": 4,
      "status": "available",
      "currency": "RON",
      "prices": {
        "occupancy_1": 320,
        "occupancy_2": 380,
        "extra_bed": 80,
        "child": 50
      },
      "restrictions": {
        "min_stay": 1,
        "max_stay": 14,
        "closed_to_arrival": false,
        "closed_to_departure": false,
        "stop_sell": false
      }
    },
    {
      "date": "2026-07-02",
      "external_unit_id": "HERMIS-ROOM-DBL",
      "external_rate_plan_id": "HERMIS-BB",
      "available": 0,
      "status": "blocked",
      "currency": "RON",
      "prices": {
        "occupancy_2": 380
      },
      "restrictions": {
        "stop_sell": true
      }
    }
  ]
}
```

Raspuns:

```json
{
  "ok": true,
  "processed": 2,
  "created": 1,
  "updated": 1,
  "errors": []
}
```

## 6. Rezervari trimise de Trevoro catre Hermis

Hermis expune un webhook, iar Trevoro trimite evenimente catre acesta.

Evenimente propuse:

- `reservation.created`
- `reservation.modified`
- `reservation.cancelled`

Header-e propuse:

```http
Content-Type: application/json
X-Trevoro-Event: reservation.created
X-Trevoro-Delivery-Id: trv_evt_123
X-Trevoro-Signature: sha256=<hmac_signature>
```

Payload `reservation.created`:

```json
{
  "event": "reservation.created",
  "event_id": "trv_evt_123",
  "created_at": "2026-06-24T12:00:00Z",
  "reservation": {
    "trevoro_reservation_id": "TRV-90001",
    "external_property_id": "HERMIS-PROP-1001",
    "external_unit_id": "HERMIS-ROOM-DBL",
    "external_rate_plan_id": "HERMIS-BB",
    "status": "pending_confirmation",
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
      "first_name": "Ion",
      "last_name": "Popescu",
      "full_name": "Ion Popescu",
      "email": "ion.popescu@example.com",
      "phone": "+40700000000",
      "country": "RO"
    },
    "pricing": {
      "currency": "RON",
      "total": 1140,
      "payment_status": "not_collected_by_trevoro"
    },
    "special_requests": "Camera linistita, daca este posibil.",
    "source": "trevoro.ro"
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

Daca Hermis returneaza eroare temporara, Trevoro va reincerca livrarea evenimentului conform unei politici de retry agreate.

## 7. Intrebari deschise pentru Hermis

1. Ce format preferati pentru autentificarea webhook-ului: Bearer, Basic Auth sau HMAC?
2. Doriti ca rezervarile Trevoro sa intre in Hermis ca `pending_confirmation` sau `confirmed`?
3. Ce restrictii ARI sunt obligatorii in modelul Hermis: min stay, max stay, stop sell, closed to arrival/departure, ocupare diferentiata?
4. Preferati ca fotografiile sa fie preluate prin URL-uri externe sau prin upload separat?
5. Ce statusuri de anulare/modificare folositi in PMS?
6. Ce timp de raspuns este asteptat pentru webhook si ce politica de retry recomandati?

## 8. Mapping intern Trevoro existent

Trevoro are deja model intern pentru:

- proprietati publice;
- fotografii;
- camere/unitati;
- pachete tarifare;
- preturi pe plan tarifar si camera;
- perioade de disponibilitate si pret;
- cereri de rezervare;
- statusuri pentru acceptare, refuz si anulare.

Pentru integrarea Hermis, aceste structuri vor fi expuse prin endpoint-uri partner API dedicate, pentru a evita dependenta de endpoint-urile de owner dashboard.
