export const COMPANY = {
  name: "QR-LAB SRL",
  cui: "47446760",
  rc: "J29/XXXX/2023",
  bank: "Banca Transilvania",
  representative: "Pita Valentin"
};

export const MODULE_GROUPS = {
  crm: [
    "dashboard",
    "clients",
    "quotes",
    "contracts"
  ],
  erp: [
    "produse",
    "facturi",
    "inventory",
    "accounting",
    "tipizate",
    "employees"
  ],
  admin: [
    "accounts",
    "setari"
  ]
};

export const ALL_MODULE_KEYS = Object.values(MODULE_GROUPS).flat();
export const CORE_ALWAYS_INCLUDED_MODULES = ["dashboard", "accounts", "setari"];
export const DEMO_PLAN_CODE = "demo";

export const MODULE_DEFINITIONS = [
  { key: "dashboard", label: "Dashboard", group: "crm" },
  { key: "clients", label: "Clienți", group: "crm" },
  { key: "quotes", label: "Oferte", group: "crm" },
  { key: "contracts", label: "Contracte", group: "crm" },
  { key: "produse", label: "Produse / Servicii", group: "erp" },
  { key: "facturi", label: "Facturi", group: "erp" },
  { key: "inventory", label: "Inventar", group: "erp" },
  { key: "accounting", label: "Contabilitate", group: "erp" },
  { key: "tipizate", label: "Tipizate", group: "erp" },
  { key: "employees", label: "Angajați", group: "erp" },
  { key: "accounts", label: "Utilizatori", group: "admin" },
  { key: "setari", label: "Setări", group: "admin" }
];

export const DEFAULT_PLAN_DEFINITIONS = [
  {
    code: DEMO_PLAN_CODE,
    name: "Demo 7 zile",
    billing_period: "monthly",
    pricing_model: "flat",
    price_monthly: 0,
    max_users: 1,
    max_modules_per_user: 0,
    max_active_modules: 0,
    module_keys: ALL_MODULE_KEYS.filter((key) => key !== "setari"),
    tagline: "Workspace demo cu date complet separate si expirare automata dupa 7 zile.",
    description: "Cont demo intern pentru prezentari si testare ghidata, cu experienta aproape completa in MiniCRM.",
    features_json: [
      "1 utilizator inclus",
      "Acces aproape complet in aplicatie",
      "Fara setari de companie si fara SPV live",
      "Date demo izolate pe tenant separat"
    ],
    support_copy: "Suportul standard este inclus pe toata durata demo-ului.",
    extra_dev_copy: "Orice dezvoltare noua sau adaptare custom se estimeaza si se taxeaza separat.",
    image_path: "/assets/pricing/demo-plan.svg",
    is_public: 0,
    sort_order: 0
  },
  {
    code: "start",
    name: "Start",
    billing_period: "monthly",
    pricing_model: "flat",
    price_monthly: 5,
    max_users: 1,
    max_modules_per_user: 5,
    max_active_modules: 5,
    module_keys: ALL_MODULE_KEYS,
    tagline: "Pentru antreprenori si echipe foarte compacte care vor un workspace clar si controlat.",
    description: "Dashboard inclus, 1 utilizator si pana la 5 module operationale active, alese in functie de business.",
    features_json: [
      "1 utilizator inclus",
      "Dashboard inclus implicit",
      "Pana la 5 module operationale active",
      "Suport inclus pentru modulele active"
    ],
    support_copy: "Toate modulele active vin cu suport inclus.",
    extra_dev_copy: "Dezvoltarea extra si adaptarile noi se taxeaza separat.",
    image_path: "/assets/pricing/start-plan.svg",
    is_public: 1,
    sort_order: 10
  },
  {
    code: "business",
    name: "Business",
    billing_period: "monthly",
    pricing_model: "per_user",
    price_monthly: 5,
    max_users: 5,
    max_modules_per_user: 3,
    max_active_modules: 0,
    module_keys: ALL_MODULE_KEYS,
    tagline: "Structura potrivita pentru companii care impart procesele pe roluri si vor cost predictibil pe utilizator.",
    description: "Pana la 5 utilizatori, fiecare cu acces la maximum 3 module operationale, plus dashboard si administrare.",
    features_json: [
      "Pana la 5 utilizatori",
      "5 EUR / utilizator / luna",
      "Maximum 3 module operationale / utilizator",
      "Suport inclus pentru toate modulele folosite"
    ],
    support_copy: "Suportul operational este inclus pentru toate modulele din plan.",
    extra_dev_copy: "Modulele sunt customizabile, iar dezvoltarea extra se taxeaza separat.",
    image_path: "/assets/pricing/business-plan.svg",
    is_public: 1,
    sort_order: 20
  },
  {
    code: "enterprise",
    name: "Enterprise",
    billing_period: "monthly",
    pricing_model: "per_user",
    price_monthly: 6,
    max_users: 100,
    max_modules_per_user: 0,
    max_active_modules: 0,
    module_keys: ALL_MODULE_KEYS,
    tagline: "Acces complet la toate modulele pentru companii care vor flexibilitate maxima si procese adaptate.",
    description: "Full access la toate modulele, cost pe utilizator si arhitectura pregatita pentru adaptari avansate de business.",
    features_json: [
      "Acces complet la toate modulele",
      "6 EUR / utilizator / luna",
      "Scalare pana la 100 utilizatori",
      "Suport inclus, adaptare pe nevoi de business"
    ],
    support_copy: "Suportul este inclus pentru toate modulele active si pentru fluxurile standard.",
    extra_dev_copy: "Dezvoltarea extra, integrari noi si cerintele speciale se taxeaza separat.",
    image_path: "/assets/pricing/enterprise-plan.svg",
    is_public: 1,
    sort_order: 30
  }
];

export const ROLE_MODULES = {
  admin: ALL_MODULE_KEYS,
  manager: [
    "dashboard",
    "clients",
    "quotes",
    "produse",
    "contracts",
    "facturi",
    "inventory",
    "employees"
  ],
  operator: [
    "dashboard",
    "clients",
    "quotes"
  ],
  hr: [
    "dashboard",
    "tipizate",
    "employees"
  ],
  accounting: [
    "dashboard",
    "accounting",
    "facturi",
    "inventory",
    "contracts",
    "employees",
    "setari"
  ]
};

function orderedModuleUniverse(allowedModules = ALL_MODULE_KEYS) {
  const allowedSet = new Set((allowedModules || []).map(String));
  return ALL_MODULE_KEYS.filter((key) => allowedSet.has(key));
}

export function parseModuleList(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value.trim()) return [...fallback];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function uniqueModuleKeys(values = []) {
  const seen = new Set();
  const result = [];

  for (const rawValue of values || []) {
    const value = String(rawValue || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

export function moduleCountsTowardLimit(moduleKey) {
  return !CORE_ALWAYS_INCLUDED_MODULES.includes(String(moduleKey || "").trim());
}

export function orderModules(moduleKeys = [], allowedModules = ALL_MODULE_KEYS) {
  const allowedSet = new Set((allowedModules || []).map(String));
  const requestedSet = new Set(uniqueModuleKeys(moduleKeys).filter((key) => allowedSet.has(key)));
  return orderedModuleUniverse(allowedModules).filter((key) => requestedSet.has(key));
}

export function applyOptionalModuleLimit(moduleKeys = [], limit = 0) {
  const maxOptional = Number(limit || 0);
  if (!Number.isFinite(maxOptional) || maxOptional < 1) {
    return uniqueModuleKeys(moduleKeys);
  }

  let optionalCount = 0;
  const result = [];

  for (const moduleKey of uniqueModuleKeys(moduleKeys)) {
    if (!moduleCountsTowardLimit(moduleKey)) {
      result.push(moduleKey);
      continue;
    }
    if (optionalCount >= maxOptional) continue;
    optionalCount += 1;
    result.push(moduleKey);
  }

  return result;
}

function baseAccessibleModules(allowedModules = ALL_MODULE_KEYS, { companyIsDemo = false } = {}) {
  const allowedSet = new Set((allowedModules || []).map(String));
  return CORE_ALWAYS_INCLUDED_MODULES.filter((moduleKey) => {
    if (companyIsDemo && moduleKey === "setari") return false;
    return allowedSet.has(moduleKey);
  });
}

export function normalizeCompanyModules(requestedModules, allowedModules = ALL_MODULE_KEYS, plan = {}, { companyIsDemo = false } = {}) {
  const orderedAllowed = orderedModuleUniverse(allowedModules);
  const requested = Array.isArray(requestedModules) && requestedModules.length
    ? orderModules(requestedModules, allowedModules)
    : orderedAllowed;
  const baseModules = baseAccessibleModules(allowedModules, { companyIsDemo });
  const baseSet = new Set(baseModules);
  const remainingModules = requested.filter((moduleKey) => !baseSet.has(moduleKey) && (!companyIsDemo || moduleKey !== "setari"));
  const limitedModules = applyOptionalModuleLimit(remainingModules, Number(plan?.max_active_modules || 0));
  return uniqueModuleKeys([...baseModules, ...limitedModules]);
}

export function normalizeUserModules(requestedModules, activeCompanyModules = ALL_MODULE_KEYS, plan = {}, roleModules = ALL_MODULE_KEYS, { companyIsDemo = false } = {}) {
  const roleAllowedModules = orderModules(roleModules, activeCompanyModules);
  const requested = Array.isArray(requestedModules) && requestedModules.length
    ? orderModules(requestedModules, roleAllowedModules)
    : roleAllowedModules;
  const baseModules = baseAccessibleModules(roleAllowedModules, { companyIsDemo });
  const baseSet = new Set(baseModules);
  const remainingModules = requested.filter((moduleKey) => !baseSet.has(moduleKey) && (!companyIsDemo || moduleKey !== "setari"));
  const limitedModules = applyOptionalModuleLimit(remainingModules, Number(plan?.max_modules_per_user || 0));
  return uniqueModuleKeys([...baseModules, ...limitedModules]);
}

export function planChargeQuantity(plan = {}, seatsUsed = 1) {
  if (String(plan?.pricing_model || "flat").trim().toLowerCase() !== "per_user") {
    return 1;
  }
  const quantity = Number(seatsUsed || 0);
  return Math.max(Number.isFinite(quantity) ? quantity : 0, 1);
}

export function planChargeAmount(plan = {}, seatsUsed = 1) {
  const price = Number(plan?.price_monthly || 0);
  return price * planChargeQuantity(plan, seatsUsed);
}

export function isDemoExpired(value, now = new Date()) {
  const expiresAt = typeof value === "string" ? value : value?.demo_expires_at;
  if (!expiresAt) return false;
  const expiresAtTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtTime)) return false;
  return expiresAtTime <= now.getTime();
}

export function registerRoleModules() {
  globalThis.ROLE_MODULES = ROLE_MODULES;
  globalThis.MODULE_GROUPS = MODULE_GROUPS;
  globalThis.ALL_MODULE_KEYS = ALL_MODULE_KEYS;
}
