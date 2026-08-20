import { emarqetSupportEmail } from "./emarqet-mailboxes.js";

const SERVICE_CATALOG = [
  {
    code: "vin_decode_basic",
    name: "VIN decode basic",
    vertical_code: "auto",
    category: "date_tehnice",
    provider_key: "nhtsa_vpic",
    fulfillment_type: "instant_api",
    pricing_model: "free",
    price_amount: 0,
    included_in_plan: "Free",
    requires_partner: 0,
    cta_label: "Decodează VIN",
    badge_label: "",
    description: "Completează automat date tehnice de bază: marcă, model, an, caroserie și motor, unde datele sunt disponibile.",
    sort_order: 10
  },
  {
    code: "vin_decode_full",
    name: "VIN decode complet",
    vertical_code: "auto",
    category: "date_tehnice",
    provider_key: "vincario_or_vehicle_databases",
    fulfillment_type: "partner_api",
    pricing_model: "included",
    price_amount: 0,
    included_in_plan: "Pro/Business",
    requires_partner: 1,
    cta_label: "Decodează complet",
    badge_label: "",
    description: "Date tehnice extinse, dotări și validări VIN prin furnizor business.",
    sort_order: 20
  },
  {
    code: "vehicle_history_report",
    name: "Raport istoric auto carVertical",
    vertical_code: "auto",
    category: "raport",
    provider_key: "carvertical_affiliate",
    fulfillment_type: "affiliate_link",
    pricing_model: "paid_or_affiliate",
    price_amount: null,
    included_in_plan: "",
    requires_partner: 1,
    cta_label: "Verifică pe carVertical",
    badge_label: "Istoric verificat",
    description: "Verifică istoricul mașinii pe carVertical și folosește codul EMARQET20 pentru 20% reducere.",
    sort_order: 30
  },
  {
    code: "damage_mileage_report",
    name: "Raport daună / kilometri",
    vertical_code: "auto",
    category: "raport",
    provider_key: "carvertical_autodna_rar",
    fulfillment_type: "partner_api_or_manual",
    pricing_model: "paid",
    price_amount: null,
    included_in_plan: "",
    requires_partner: 1,
    cta_label: "Verifică daune/km",
    badge_label: "Km/daune verificate",
    description: "Verificare dedicată pentru kilometraj, daune declarate și semnale de risc.",
    sort_order: 40
  },
  {
    code: "leasing_calculator",
    name: "Calculator leasing",
    vertical_code: "auto",
    category: "finantare",
    provider_key: "nexora_internal",
    fulfillment_type: "internal_calculator",
    pricing_model: "lead_commission",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 0,
    cta_label: "Calculează leasing",
    badge_label: "",
    description: "Estimare rată lunară și lead către partener de finanțare.",
    sort_order: 50
  },
  {
    code: "market_price_estimate",
    name: "Estimare preț piață",
    vertical_code: "auto",
    category: "ai",
    provider_key: "nexora_ai",
    fulfillment_type: "internal_ai",
    pricing_model: "included_or_paid",
    price_amount: 0,
    included_in_plan: "Pro/Business",
    requires_partner: 0,
    cta_label: "Estimează prețul",
    badge_label: "Preț estimat AI",
    description: "Compară anunțul cu listări similare și estimează poziționarea de preț.",
    sort_order: 60
  },
  {
    code: "itp_rca_check",
    name: "Verificare RCA / ITP",
    vertical_code: "auto",
    category: "legal",
    provider_key: "rar_or_insurance_partner",
    fulfillment_type: "partner_api_or_manual",
    pricing_model: "partner_lead",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 1,
    cta_label: "Verifică RCA/ITP",
    badge_label: "ITP verificat",
    description: "Verificare legală doar prin surse și acorduri permise.",
    sort_order: 70
  },
  {
    code: "test_drive_booking",
    name: "Programare test drive",
    vertical_code: "auto",
    category: "programare",
    provider_key: "nexora_crm",
    fulfillment_type: "crm_lead",
    pricing_model: "free_lead",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 0,
    cta_label: "Solicită test drive",
    badge_label: "",
    description: "Creează lead direct în CRM pentru vânzător sau dealer.",
    sort_order: 80
  },
  {
    code: "service_inspection_booking",
    name: "Programare service/verificare",
    vertical_code: "auto",
    category: "programare",
    provider_key: "local_service_partners",
    fulfillment_type: "partner_lead",
    pricing_model: "commission",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 1,
    cta_label: "Programează verificare",
    badge_label: "Verificare service",
    description: "Lead către service-uri locale partenere pentru verificare pre-achiziție.",
    sort_order: 90
  },
  {
    code: "sale_contract",
    name: "Contract vânzare-cumpărare",
    vertical_code: "auto",
    category: "document",
    provider_key: "nexora_documents",
    fulfillment_type: "document_template",
    pricing_model: "free_or_paid",
    price_amount: 9,
    included_in_plan: "",
    requires_partner: 0,
    cta_label: "Generează contract",
    badge_label: "",
    description: "Șablon completat automat cu datele vehiculului și ale părților.",
    sort_order: 100
  },
  {
    code: "insurance_lead",
    name: "Asigurare RCA/CASCO",
    vertical_code: "auto",
    category: "asigurari",
    provider_key: "insurance_broker",
    fulfillment_type: "partner_lead",
    pricing_model: "commission",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 1,
    cta_label: "Cere ofertă asigurare",
    badge_label: "",
    description: "Lead către broker/asigurator pentru RCA sau CASCO.",
    sort_order: 110
  },
  {
    code: "financing_lead",
    name: "Leasing / finanțare",
    vertical_code: "auto",
    category: "finantare",
    provider_key: "financing_partner",
    fulfillment_type: "partner_lead",
    pricing_model: "commission",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 1,
    cta_label: "Cere finanțare",
    badge_label: "",
    description: "Lead către parteneri de leasing sau credit auto.",
    sort_order: 120
  },
  {
    code: "verified_listing_promo",
    name: "Promovare anunț verificat",
    vertical_code: "auto",
    category: "promovare",
    provider_key: "nexora_promotion",
    fulfillment_type: "internal_promotion",
    pricing_model: "paid",
    price_amount: 39,
    included_in_plan: "",
    requires_partner: 0,
    cta_label: "Promovează verificat",
    badge_label: "Anunț verificat",
    description: "Promovare premium pentru mașini cu raport sau verificare completată.",
    sort_order: 130
  },
  {
    code: "support_email",
    name: "Tichet suport email",
    vertical_code: "general",
    category: "suport",
    provider_key: "nexora_mailbox",
    fulfillment_type: "internal_ticket",
    pricing_model: "free",
    price_amount: 0,
    included_in_plan: "",
    requires_partner: 0,
    cta_label: "Deschide tichet",
    badge_label: "",
    description: "Cereri primite pe mailbox-ul support@e-marqet.com și urmărite în panoul e-Marqet.",
    sort_order: 900
  }
];

const REQUEST_STATUSES = ["NOU", "IN_LUCRU", "FINALIZAT", "ESUAT", "ANULAT"];

function safeCompanyId(companyId) {
  return Number(companyId || 0);
}

function safeText(value = "") {
  return String(value || "").trim();
}

function safeJson(value = {}) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function ensureColumn(db, table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function serviceRequestTicketNumber(id) {
  return `EMQ-TIC-${String(Number(id || 0)).padStart(6, "0")}`;
}

export function parseJsonObject(value = "") {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeMarketplaceServiceStatus(value = "", fallback = "NOU") {
  const normalized = safeText(value).toUpperCase();
  return REQUEST_STATUSES.includes(normalized) ? normalized : fallback;
}

export function normalizeVin(value = "") {
  return safeText(value).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
}

export function ensureMarketplaceServicesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_marketplace_services(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      vertical_code TEXT DEFAULT 'auto',
      category TEXT,
      provider_key TEXT,
      fulfillment_type TEXT,
      pricing_model TEXT,
      price_amount REAL,
      currency TEXT DEFAULT 'RON',
      included_in_plan TEXT,
      requires_partner INTEGER DEFAULT 0,
      cta_label TEXT,
      badge_label TEXT,
      description TEXT,
      config_json TEXT,
      status TEXT DEFAULT 'ACTIV',
      is_public INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS emarqet_service_requests(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      service_id INTEGER,
      listing_id INTEGER,
      vertical_id INTEGER,
      service_code TEXT NOT NULL,
      provider_key TEXT,
      requester_name TEXT,
      requester_email TEXT,
      requester_phone TEXT,
      status TEXT DEFAULT 'NOU',
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'RON',
      request_payload_json TEXT,
      result_json TEXT,
      notes TEXT,
      mailbox TEXT,
      channel TEXT DEFAULT 'service_request',
      ticket_number TEXT,
      last_email_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_listing_badges(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      listing_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      source TEXT,
      status TEXT DEFAULT 'ACTIV',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, listing_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_emq_services_company ON emarqet_marketplace_services(company_id, vertical_code, status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_emq_service_requests_company ON emarqet_service_requests(company_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_emq_service_requests_listing ON emarqet_service_requests(company_id, listing_id, service_code);
    CREATE INDEX IF NOT EXISTS idx_emq_listing_badges_listing ON emarqet_listing_badges(company_id, listing_id, status);
  `);
  ensureColumn(db, "emarqet_service_requests", "mailbox", "TEXT");
  ensureColumn(db, "emarqet_service_requests", "channel", "TEXT DEFAULT 'service_request'");
  ensureColumn(db, "emarqet_service_requests", "ticket_number", "TEXT");
  ensureColumn(db, "emarqet_service_requests", "last_email_at", "TEXT");
  ensureColumn(db, "emarqet_service_requests", "email_message_id", "TEXT");
  ensureColumn(db, "emarqet_service_requests", "email_uid", "TEXT");
  ensureColumn(db, "emarqet_service_requests", "email_subject", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_emq_service_requests_mailbox
      ON emarqet_service_requests(company_id, mailbox, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_emq_service_requests_email_message
      ON emarqet_service_requests(company_id, email_message_id);
    CREATE INDEX IF NOT EXISTS idx_emq_service_requests_email_uid
      ON emarqet_service_requests(company_id, mailbox, email_uid);
  `);
}

export function seedMarketplaceServicesCatalog(db, companyId) {
  const safeId = safeCompanyId(companyId);
  if (!safeId) return;
  ensureMarketplaceServicesSchema(db);

  const insert = db.prepare(`
    INSERT INTO emarqet_marketplace_services
      (company_id, code, name, vertical_code, category, provider_key, fulfillment_type, pricing_model, price_amount, currency, included_in_plan, requires_partner, cta_label, badge_label, description, config_json, status, is_public, sort_order)
    VALUES
      (@company_id, @code, @name, @vertical_code, @category, @provider_key, @fulfillment_type, @pricing_model, @price_amount, 'RON', @included_in_plan, @requires_partner, @cta_label, @badge_label, @description, @config_json, 'ACTIV', 1, @sort_order)
    ON CONFLICT(company_id, code) DO UPDATE SET
      name=excluded.name,
      vertical_code=excluded.vertical_code,
      category=excluded.category,
      provider_key=excluded.provider_key,
      fulfillment_type=excluded.fulfillment_type,
      pricing_model=excluded.pricing_model,
      price_amount=excluded.price_amount,
      currency=excluded.currency,
      included_in_plan=excluded.included_in_plan,
      requires_partner=excluded.requires_partner,
      cta_label=excluded.cta_label,
      badge_label=excluded.badge_label,
      description=excluded.description,
      config_json=excluded.config_json,
      status=excluded.status,
      is_public=excluded.is_public,
      sort_order=excluded.sort_order,
      updated_at=CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const service of SERVICE_CATALOG) {
      insert.run({
        ...service,
        company_id: safeId,
        config_json: safeJson(service.code === "vehicle_history_report"
          ? {
              partner: "carVertical",
              integration_status: "active",
              coupon_code: "EMARQET20",
              discount_percent: 20,
              tracking_url: "https://www.carvertical.deal/2NGMLPR/66RQ8Q/?source_id=AFF&sub1=emarqet20",
              tracking_url_with_vin: "https://www.carvertical.deal/2NGMLPR/66RQ8Q/?uid=69&source_id=AFF&sub1=emarqet20&sub3=VIN"
            }
          : {
              public_note: service.requires_partner ? "Necesită contract/cheie partener înainte de automatizare completă." : "Disponibil în Nexora fără contract extern."
            })
      });
    }
  });
  tx();
}

export function loadMarketplaceServices(db, companyId, options = {}) {
  ensureMarketplaceServicesSchema(db);
  const where = ["company_id=?", "UPPER(COALESCE(status,''))='ACTIV'"];
  const params = [safeCompanyId(companyId)];
  if (options.publicOnly) where.push("COALESCE(is_public,1)=1");
  if (options.verticalCode) {
    where.push("LOWER(COALESCE(vertical_code,''))=?");
    params.push(safeText(options.verticalCode).toLowerCase());
  }
  return db.prepare(`
    SELECT *
    FROM emarqet_marketplace_services
    WHERE ${where.join(" AND ")}
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `).all(...params);
}

export function findMarketplaceService(db, companyId, code) {
  ensureMarketplaceServicesSchema(db);
  const normalized = safeText(code).toLowerCase();
  if (!normalized) return null;
  return db.prepare(`
    SELECT *
    FROM emarqet_marketplace_services
    WHERE company_id=? AND LOWER(code)=?
    LIMIT 1
  `).get(safeCompanyId(companyId), normalized) || null;
}

export function loadMarketplaceServiceRequests(db, companyId, limit = 300) {
  ensureMarketplaceServicesSchema(db);
  return db.prepare(`
    SELECT
      r.*,
      s.name AS service_name,
      s.category AS service_category,
      s.requires_partner,
      s.badge_label,
      l.title AS listing_title,
      l.listing_code,
      v.name AS vertical_name,
      v.code AS vertical_code
    FROM emarqet_service_requests r
    LEFT JOIN emarqet_marketplace_services s ON s.id=r.service_id AND s.company_id=r.company_id
    LEFT JOIN emarqet_listings l ON l.id=r.listing_id AND l.company_id=r.company_id
    LEFT JOIN emarqet_verticals v ON v.id=r.vertical_id AND v.company_id=r.company_id
    WHERE r.company_id=?
    ORDER BY
      CASE UPPER(COALESCE(r.status,''))
        WHEN 'NOU' THEN 1
        WHEN 'IN_LUCRU' THEN 2
        WHEN 'FINALIZAT' THEN 3
        ELSE 4
      END,
      r.id DESC
    LIMIT ?
  `).all(safeCompanyId(companyId), Number(limit || 300));
}

export function loadListingBadges(db, companyId, listingId) {
  ensureMarketplaceServicesSchema(db);
  if (!listingId) return [];
  return db.prepare(`
    SELECT *
    FROM emarqet_listing_badges
    WHERE company_id=? AND listing_id=? AND UPPER(COALESCE(status,''))='ACTIV'
    ORDER BY id ASC
  `).all(safeCompanyId(companyId), Number(listingId || 0));
}

export function createMarketplaceServiceRequest(db, companyId, data = {}) {
  ensureMarketplaceServicesSchema(db);
  const service = data.service || findMarketplaceService(db, companyId, data.service_code);
  if (!service) throw new Error("marketplace_service_missing");
  const result = db.prepare(`
    INSERT INTO emarqet_service_requests
      (company_id, service_id, listing_id, vertical_id, service_code, provider_key, requester_name, requester_email, requester_phone, status, amount, currency, request_payload_json, result_json, notes, mailbox, channel, ticket_number, last_email_at, created_by)
    VALUES
      (@company_id, @service_id, @listing_id, @vertical_id, @service_code, @provider_key, @requester_name, @requester_email, @requester_phone, @status, @amount, @currency, @request_payload_json, @result_json, @notes, @mailbox, @channel, @ticket_number, @last_email_at, @created_by)
  `).run({
    company_id: safeCompanyId(companyId),
    service_id: service.id,
    listing_id: data.listing_id || null,
    vertical_id: data.vertical_id || null,
    service_code: service.code,
    provider_key: service.provider_key || "",
    requester_name: safeText(data.requester_name),
    requester_email: safeText(data.requester_email).toLowerCase(),
    requester_phone: safeText(data.requester_phone),
    status: normalizeMarketplaceServiceStatus(data.status, "NOU"),
    amount: Number(data.amount ?? service.price_amount ?? 0) || 0,
    currency: safeText(data.currency || service.currency || "RON").toUpperCase(),
    request_payload_json: safeJson(data.request_payload || {}),
    result_json: safeJson(data.result || {}),
    notes: safeText(data.notes),
    mailbox: safeText(data.mailbox || emarqetSupportEmail()).toLowerCase(),
    channel: safeText(data.channel || "service_request"),
    ticket_number: safeText(data.ticket_number),
    last_email_at: safeText(data.last_email_at),
    created_by: safeText(data.created_by)
  });
  if (result.lastInsertRowid && !safeText(data.ticket_number)) {
    db.prepare(`
      UPDATE emarqet_service_requests
      SET ticket_number=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=?
    `).run(serviceRequestTicketNumber(result.lastInsertRowid), result.lastInsertRowid, safeCompanyId(companyId));
  }
  return result.lastInsertRowid;
}

export function upsertListingBadge(db, companyId, listingId, code, label, source = "") {
  ensureMarketplaceServicesSchema(db);
  if (!listingId || !code || !label) return;
  db.prepare(`
    INSERT INTO emarqet_listing_badges
      (company_id, listing_id, code, label, source, status)
    VALUES
      (?, ?, ?, ?, ?, 'ACTIV')
    ON CONFLICT(company_id, listing_id, code) DO UPDATE SET
      label=excluded.label,
      source=excluded.source,
      status='ACTIV',
      updated_at=CURRENT_TIMESTAMP
  `).run(safeCompanyId(companyId), Number(listingId || 0), safeText(code), safeText(label), safeText(source));
}

export function updateMarketplaceServiceRequestStatus(db, companyId, requestId, status) {
  ensureMarketplaceServicesSchema(db);
  const normalized = normalizeMarketplaceServiceStatus(status, "");
  if (!normalized) return 0;
  const request = db.prepare(`
    SELECT r.*, s.badge_label
    FROM emarqet_service_requests r
    LEFT JOIN emarqet_marketplace_services s ON s.id=r.service_id AND s.company_id=r.company_id
    WHERE r.company_id=? AND r.id=?
    LIMIT 1
  `).get(safeCompanyId(companyId), Number(requestId || 0));
  if (!request) return 0;
  const result = db.prepare(`
    UPDATE emarqet_service_requests
    SET status=?, updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=?
  `).run(normalized, safeCompanyId(companyId), Number(requestId || 0));
  if (result.changes && normalized === "FINALIZAT" && request.listing_id && request.badge_label) {
    upsertListingBadge(db, companyId, request.listing_id, request.service_code, request.badge_label, `service_request:${request.id}`);
  }
  return result.changes;
}

export function marketplaceServicesPayload(services = []) {
  return services.map((service) => ({
    code: service.code,
    name: service.name,
    vertical_code: service.vertical_code,
    category: service.category,
    provider_key: service.provider_key,
    fulfillment_type: service.fulfillment_type,
    pricing_model: service.pricing_model,
    price_amount: service.price_amount,
    currency: service.currency || "RON",
    included_in_plan: service.included_in_plan,
    requires_partner: Boolean(service.requires_partner),
    cta_label: service.cta_label,
    badge_label: service.badge_label,
    description: service.description
  }));
}

function pickVinField(result = {}, names = []) {
  for (const name of names) {
    const value = safeText(result[name]);
    if (value && value.toLowerCase() !== "not applicable") return value;
  }
  return "";
}

export async function decodeVinBasic(vin, { fetchImpl = globalThis.fetch, modelYear = "" } = {}) {
  const normalizedVin = normalizeVin(vin);
  if (normalizedVin.length !== 17) {
    return { ok: false, error: "invalid_vin", vin: normalizedVin };
  }
  if (!fetchImpl) {
    return { ok: false, error: "fetch_unavailable", vin: normalizedVin };
  }

  const url = new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(normalizedVin)}`);
  url.searchParams.set("format", "json");
  if (safeText(modelYear)) url.searchParams.set("modelyear", safeText(modelYear));

  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    return { ok: false, error: "provider_error", status: response.status, vin: normalizedVin };
  }
  const body = await response.json();
  const result = Array.isArray(body?.Results) ? body.Results[0] || {} : {};
  const vehicle = {
    vin: normalizedVin,
    make: pickVinField(result, ["Make"]),
    model: pickVinField(result, ["Model"]),
    year: pickVinField(result, ["ModelYear"]),
    trim: pickVinField(result, ["Trim", "Series"]),
    body_class: pickVinField(result, ["BodyClass"]),
    engine: [
      pickVinField(result, ["EngineModel"]),
      pickVinField(result, ["DisplacementL"]) ? `${pickVinField(result, ["DisplacementL"])}L` : "",
      pickVinField(result, ["EngineCylinders"]) ? `${pickVinField(result, ["EngineCylinders"])} cilindri` : ""
    ].filter(Boolean).join(" · "),
    fuel_type: pickVinField(result, ["FuelTypePrimary"]),
    transmission: pickVinField(result, ["TransmissionStyle", "TransmissionSpeeds"]),
    drive_type: pickVinField(result, ["DriveType"]),
    manufacturer: pickVinField(result, ["Manufacturer", "ManufacturerName"]),
    plant_country: pickVinField(result, ["PlantCountry"])
  };
  const hasCoreData = Boolean(vehicle.make || vehicle.model || vehicle.year);
  return {
    ok: hasCoreData,
    error: hasCoreData ? "" : "no_vehicle_data",
    provider: "nhtsa_vpic",
    vin: normalizedVin,
    vehicle,
    provider_message: pickVinField(result, ["ErrorText"]),
    raw: result
  };
}
