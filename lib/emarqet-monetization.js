const PRICING_PLANS = [
  {
    code: "free",
    name: "Free",
    plan_type: "standard",
    audience: "Persoane fizice",
    monthly_price: 0,
    yearly_price: 0,
    listing_limit: 3,
    active_days: 30,
    promotion_included: 0,
    import_level: "manual",
    sort_order: 10,
    features: ["3 anunturi active", "Valabilitate 30 zile", "Fara promovare"]
  },
  {
    code: "start",
    name: "Start",
    plan_type: "standard",
    audience: "Persoane fizice si mici comercianti",
    monthly_price: 29,
    yearly_price: 290,
    listing_limit: 10,
    active_days: 30,
    promotion_included: 0,
    import_level: "manual",
    sort_order: 20,
    features: ["10 anunturi", "Statistici de baza", "Reinnoire automata"]
  },
  {
    code: "pro",
    name: "Pro",
    plan_type: "standard",
    audience: "PFA si firme mici",
    monthly_price: 79,
    yearly_price: 790,
    listing_limit: 100,
    active_days: 30,
    promotion_included: 1,
    import_level: "excel",
    sort_order: 30,
    features: ["100 anunturi", "Profil verificat", "Promovare in categorie", "Import Excel", "AI rescriere si descriere incluse"]
  },
  {
    code: "business",
    name: "Business",
    plan_type: "standard",
    audience: "Dealeri auto, agentii, magazine",
    monthly_price: 199,
    yearly_price: 1990,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "csv_xml_api",
    sort_order: 40,
    features: ["Anunturi nelimitate", "Import CSV/XML/API", "CRM", "Statistici complete", "Marketplace feed pregatit pentru canale eligibile"]
  },
  {
    code: "enterprise",
    name: "Enterprise",
    plan_type: "standard",
    audience: "Companii mari",
    monthly_price: 499,
    yearly_price: 4990,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "api_erp_ai",
    sort_order: 50,
    features: ["Multi-user", "API complet", "Sincronizare ERP", "AI", "Suport prioritar", "Pregatire Meta Marketplace Partner API daca este eligibil"]
  },
  {
    code: "auto_business",
    name: "Auto Business",
    plan_type: "dedicated",
    audience: "Dealeri auto si parcuri auto",
    monthly_price: 299,
    yearly_price: null,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "xml_api_excel",
    sort_order: 110,
    features: ["Anunturi nelimitate", "Import XML/API/Excel", "VIN Decoder", "Calculator leasing", "CRM", "Statistici", "Promovare automata pe pagina/canale eligibile", "Marketplace feed", "AI descrieri", "Generare video"]
  },
  {
    code: "real_estate_business",
    name: "Real Estate Business",
    plan_type: "dedicated",
    audience: "Agentii imobiliare si dezvoltatori",
    monthly_price: 299,
    yearly_price: null,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "xml_crm",
    sort_order: 120,
    features: ["Proprietati nelimitate", "Import XML", "Sincronizare CRM", "Google Maps", "Programare vizionari", "Tur virtual", "AI"]
  },
  {
    code: "tourism_trevoro",
    name: "Turism + Trevoro",
    plan_type: "dedicated",
    audience: "Hoteluri, pensiuni si operatori turistici",
    monthly_price: null,
    yearly_price: null,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "trevoro",
    sort_order: 130,
    features: ["Integrare directa cu Trevoro", "Administrare din acelasi ecosistem", "Lead-uri si proprietati urmarite in Nexora"]
  },
  {
    code: "founding_business",
    name: "Founding Business",
    plan_type: "founding",
    audience: "Primii 100 de clienti",
    monthly_price: 99,
    yearly_price: null,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "csv_xml_api",
    sort_order: 210,
    features: ["Pret pe viata pentru Business", "Valabil cat abonamentul ramane activ", "Oferta limitata la primii 100 de clienti"]
  },
  {
    code: "founding_enterprise",
    name: "Founding Enterprise",
    plan_type: "founding",
    audience: "Primii 100 de clienti",
    monthly_price: 249,
    yearly_price: null,
    listing_limit: -1,
    active_days: 30,
    promotion_included: 1,
    import_level: "api_erp_ai",
    sort_order: 220,
    features: ["Pret pe viata pentru Enterprise", "Valabil cat abonamentul ramane activ", "Oferta limitata la primii 100 de clienti"]
  }
];

const ADDONS = [
  {
    code: "homepage_7",
    name: "Promovare Homepage 7 zile",
    category: "promovare",
    price_amount: 39,
    billing_unit: "7 zile",
    included_in_plan: "",
    description: "Afisare prioritara pe homepage timp de 7 zile.",
    sort_order: 10
  },
  {
    code: "homepage_30",
    name: "Promovare Homepage 30 zile",
    category: "promovare",
    price_amount: 99,
    billing_unit: "30 zile",
    included_in_plan: "",
    description: "Afisare prioritara pe homepage timp de 30 zile.",
    sort_order: 20
  },
  {
    code: "top_category",
    name: "Top categorie",
    category: "promovare",
    price_amount: 29,
    billing_unit: "campanie",
    included_in_plan: "",
    description: "Pozitionare superioara in categoria relevanta.",
    sort_order: 30
  },
  {
    code: "highlight_listing",
    name: "Evidentiere anunt",
    category: "promovare",
    price_amount: 19,
    billing_unit: "anunt",
    included_in_plan: "",
    description: "Stil vizual evidentiat pentru anunt.",
    sort_order: 40
  },
  {
    code: "distribution_facebook",
    name: "Distribuire Facebook",
    category: "distributie",
    price_amount: 19,
    billing_unit: "campanie",
    included_in_plan: "",
    description: "Pregatire si distribuire postare Facebook.",
    sort_order: 50
  },
  {
    code: "distribution_facebook_instagram",
    name: "Distribuire Facebook + Instagram",
    category: "distributie",
    price_amount: 29,
    billing_unit: "campanie",
    included_in_plan: "",
    description: "Pregatire continut si distribuire pe Facebook si Instagram.",
    sort_order: 60
  },
  {
    code: "distribution_social_premium",
    name: "Distribuire Social Premium",
    category: "distributie",
    price_amount: 59,
    billing_unit: "campanie",
    included_in_plan: "",
    description: "Facebook Page + Instagram/TikTok/YouTube in flux asistat sau API, in functie de eligibilitate.",
    sort_order: 70
  },
  {
    code: "distribution_marketplace_partner",
    name: "Distribuire Marketplace",
    category: "distributie",
    price_amount: 39,
    billing_unit: "campanie",
    included_in_plan: "Business/Enterprise eligibil",
    description: "Publicare prin Meta Marketplace Partner API/catalog feed doar pentru conturi si categorii aprobate de Meta; altfel pregatire feed si flux asistat.",
    sort_order: 75
  },
  {
    code: "ai_rewrite",
    name: "AI Rescriere anunt",
    category: "ai",
    price_amount: 0,
    billing_unit: "inclus",
    included_in_plan: "Pro",
    description: "Inclus in planul Pro.",
    sort_order: 80
  },
  {
    code: "ai_description",
    name: "AI Generare descriere",
    category: "ai",
    price_amount: 0,
    billing_unit: "inclus",
    included_in_plan: "Pro",
    description: "Inclus in planul Pro.",
    sort_order: 90
  },
  {
    code: "video_from_images",
    name: "Video automat din imagini",
    category: "ai",
    price_amount: 29,
    billing_unit: "anunt",
    included_in_plan: "",
    description: "Video scurt generat automat din imaginile anuntului.",
    sort_order: 100
  },
  {
    code: "ai_background_removal",
    name: "Eliminare fundal AI",
    category: "ai",
    price_amount: 9,
    billing_unit: "anunt",
    included_in_plan: "",
    description: "Eliminare fundal pentru imaginea anuntului.",
    sort_order: 110
  }
];

function safeCompanyId(companyId) {
  return Number(companyId || 0);
}

function featuresJson(features = []) {
  return JSON.stringify(Array.isArray(features) ? features : []);
}

export function ensureEmarqetMonetizationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_pricing_plans(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      plan_type TEXT NOT NULL DEFAULT 'standard',
      audience TEXT,
      monthly_price REAL,
      yearly_price REAL,
      currency TEXT DEFAULT 'RON',
      listing_limit INTEGER DEFAULT 0,
      active_days INTEGER DEFAULT 0,
      promotion_included INTEGER DEFAULT 0,
      import_level TEXT,
      features_json TEXT,
      status TEXT DEFAULT 'ACTIV',
      is_public INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS emarqet_addons(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      price_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'RON',
      billing_unit TEXT,
      included_in_plan TEXT,
      description TEXT,
      status TEXT DEFAULT 'ACTIV',
      is_public INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_pricing_company ON emarqet_pricing_plans(company_id, plan_type, status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_emarqet_addons_company ON emarqet_addons(company_id, category, status, sort_order);
  `);
}

export function seedEmarqetMonetizationCatalog(db, companyId) {
  const safeId = safeCompanyId(companyId);
  if (!safeId) return;
  ensureEmarqetMonetizationSchema(db);

  const insertPlan = db.prepare(`
    INSERT INTO emarqet_pricing_plans
      (company_id, code, name, plan_type, audience, monthly_price, yearly_price, currency, listing_limit, active_days, promotion_included, import_level, features_json, status, is_public, sort_order)
    VALUES
      (@company_id, @code, @name, @plan_type, @audience, @monthly_price, @yearly_price, 'RON', @listing_limit, @active_days, @promotion_included, @import_level, @features_json, 'ACTIV', 1, @sort_order)
    ON CONFLICT(company_id, code) DO UPDATE SET
      name=excluded.name,
      plan_type=excluded.plan_type,
      audience=excluded.audience,
      monthly_price=excluded.monthly_price,
      yearly_price=excluded.yearly_price,
      currency=excluded.currency,
      listing_limit=excluded.listing_limit,
      active_days=excluded.active_days,
      promotion_included=excluded.promotion_included,
      import_level=excluded.import_level,
      features_json=excluded.features_json,
      status=excluded.status,
      is_public=excluded.is_public,
      sort_order=excluded.sort_order,
      updated_at=CURRENT_TIMESTAMP
  `);

  const insertAddon = db.prepare(`
    INSERT INTO emarqet_addons
      (company_id, code, name, category, price_amount, currency, billing_unit, included_in_plan, description, status, is_public, sort_order)
    VALUES
      (@company_id, @code, @name, @category, @price_amount, 'RON', @billing_unit, @included_in_plan, @description, 'ACTIV', 1, @sort_order)
    ON CONFLICT(company_id, code) DO UPDATE SET
      name=excluded.name,
      category=excluded.category,
      price_amount=excluded.price_amount,
      currency=excluded.currency,
      billing_unit=excluded.billing_unit,
      included_in_plan=excluded.included_in_plan,
      description=excluded.description,
      status=excluded.status,
      is_public=excluded.is_public,
      sort_order=excluded.sort_order,
      updated_at=CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const plan of PRICING_PLANS) {
      insertPlan.run({
        ...plan,
        company_id: safeId,
        features_json: featuresJson(plan.features)
      });
    }
    for (const addon of ADDONS) {
      insertAddon.run({ ...addon, company_id: safeId });
    }
  });
  tx();
}

export function loadEmarqetPricingPlans(db, companyId, publicOnly = false) {
  ensureEmarqetMonetizationSchema(db);
  const where = ["company_id=?", "UPPER(COALESCE(status,''))='ACTIV'"];
  if (publicOnly) where.push("COALESCE(is_public,1)=1");
  return db.prepare(`
    SELECT *
    FROM emarqet_pricing_plans
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE LOWER(COALESCE(plan_type,'standard'))
        WHEN 'standard' THEN 1
        WHEN 'dedicated' THEN 2
        WHEN 'founding' THEN 3
        ELSE 4
      END,
      sort_order ASC,
      monthly_price ASC,
      name COLLATE NOCASE ASC
  `).all(safeCompanyId(companyId));
}

export function loadEmarqetAddons(db, companyId, publicOnly = false) {
  ensureEmarqetMonetizationSchema(db);
  const where = ["company_id=?", "UPPER(COALESCE(status,''))='ACTIV'"];
  if (publicOnly) where.push("COALESCE(is_public,1)=1");
  return db.prepare(`
    SELECT *
    FROM emarqet_addons
    WHERE ${where.join(" AND ")}
    ORDER BY
      sort_order ASC,
      name COLLATE NOCASE ASC
  `).all(safeCompanyId(companyId));
}

export function findEmarqetAddon(db, companyId, code, publicOnly = false) {
  ensureEmarqetMonetizationSchema(db);
  const normalized = String(code || "").trim().toLowerCase();
  if (!normalized) return null;
  const where = ["company_id=?", "LOWER(code)=?"];
  if (publicOnly) {
    where.push("UPPER(COALESCE(status,''))='ACTIV'");
    where.push("COALESCE(is_public,1)=1");
  }
  return db.prepare(`
    SELECT *
    FROM emarqet_addons
    WHERE ${where.join(" AND ")}
    LIMIT 1
  `).get(safeCompanyId(companyId), normalized) || null;
}

export function findEmarqetPricingPlan(db, companyId, code) {
  ensureEmarqetMonetizationSchema(db);
  const normalized = String(code || "").trim().toLowerCase();
  if (!normalized) return null;
  return db.prepare(`
    SELECT *
    FROM emarqet_pricing_plans
    WHERE company_id=? AND LOWER(code)=?
    LIMIT 1
  `).get(safeCompanyId(companyId), normalized) || null;
}

export function emarqetPricingPayload(plans = [], addons = []) {
  return {
    plans: plans.map((plan) => ({
      code: plan.code,
      name: plan.name,
      type: plan.plan_type,
      audience: plan.audience,
      monthly_price: plan.monthly_price,
      yearly_price: plan.yearly_price,
      currency: plan.currency || "RON",
      listing_limit: plan.listing_limit,
      active_days: plan.active_days,
      promotion_included: Boolean(plan.promotion_included),
      import_level: plan.import_level,
      features: parseFeatures(plan.features_json)
    })),
    addons: addons.map((addon) => ({
      code: addon.code,
      name: addon.name,
      category: addon.category,
      price_amount: addon.price_amount,
      currency: addon.currency || "RON",
      billing_unit: addon.billing_unit,
      included_in_plan: addon.included_in_plan,
      description: addon.description
    }))
  };
}

export function parseFeatures(value = "") {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}
