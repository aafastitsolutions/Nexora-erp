function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const AUTO_BRANDS = [
  "Audi",
  "BMW",
  "Citroen",
  "Dacia",
  "Fiat",
  "Ford",
  "Hyundai",
  "Kia",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Renault",
  "Seat",
  "Skoda",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo"
];

const PHONE_BRANDS = ["Apple", "Samsung", "Xiaomi", "Huawei", "Honor", "Motorola", "Google", "OnePlus", "Oppo", "Realme"];
const CONDITION_OPTIONS = ["Nou", "Ca nou", "Foarte bun", "Bun", "Acceptabil"];
const YES_NO = ["Da", "Nu"];

export const EMARQET_CATEGORY_DEFINITIONS = [
  {
    code: "auto",
    name: "Auto",
    public_path: "/auto",
    launch_stage: "Activ",
    listing_count_goal: 500,
    notes: "Autoturisme, utilitare, dealeri si servicii auto.",
    icon: "AU",
    searchPlaceholder: "marca, model, oras",
    filters: [
      { name: "brand", label: "Marca", type: "select", options: AUTO_BRANDS, target: "brand", match: "exact" },
      { name: "model", label: "Model", type: "text", target: "model", match: "contains" },
      { name: "year_min", label: "An de la", type: "number", target: "year", match: "min" },
      { name: "year_max", label: "An pana la", type: "number", target: "year", match: "max" },
      { name: "fuel", label: "Combustibil", type: "select", options: ["Benzina", "Diesel", "Hibrid", "Plug-in hybrid", "Electric", "GPL"], target: "fuel", match: "exact" },
      { name: "transmission", label: "Cutie", type: "select", options: ["Manuala", "Automata"], target: "transmission", match: "exact" },
      { name: "body_type", label: "Caroserie", type: "select", options: ["Berlina", "Break", "Hatchback", "SUV", "Coupe", "Cabrio", "Monovolum", "Utilitara"], target: "body_type", match: "exact" },
      { name: "mileage_max", label: "Km max.", type: "number", target: "mileage", match: "max" },
      { name: "seller_type", label: "Vanzator", type: "select", options: ["Persoana fizica", "Dealer", "Firma"], target: "seller_type", match: "exact" }
    ],
    publishFields: [
      { name: "brand", label: "Marca", type: "select", options: AUTO_BRANDS },
      { name: "model", label: "Model", type: "text" },
      { name: "year", label: "An fabricatie", type: "number" },
      { name: "fuel", label: "Combustibil", type: "select", options: ["Benzina", "Diesel", "Hibrid", "Plug-in hybrid", "Electric", "GPL"] },
      { name: "transmission", label: "Cutie", type: "select", options: ["Manuala", "Automata"] },
      { name: "body_type", label: "Caroserie", type: "select", options: ["Berlina", "Break", "Hatchback", "SUV", "Coupe", "Cabrio", "Monovolum", "Utilitara"] },
      { name: "mileage", label: "Kilometri", type: "number" },
      { name: "vin", label: "VIN", type: "text" }
    ],
    displayFields: ["brand", "model", "year", "fuel", "mileage"]
  },
  {
    code: "imobiliare",
    name: "Imobiliare",
    public_path: "/imobiliare",
    launch_stage: "Activ",
    listing_count_goal: 350,
    notes: "Apartamente, case, terenuri si spatii comerciale.",
    icon: "IM",
    searchPlaceholder: "apartament, casa, zona",
    filters: [
      { name: "property_type", label: "Tip", type: "select", options: ["Apartament", "Casa", "Teren", "Spatiu comercial", "Birou", "Hala"], target: "property_type", match: "exact" },
      { name: "transaction_type", label: "Tranzactie", type: "select", options: ["Vanzare", "Inchiriere"], target: "transaction_type", match: "exact" },
      { name: "rooms_min", label: "Camere min.", type: "number", target: "rooms", match: "min" },
      { name: "surface_min", label: "Suprafata min.", type: "number", target: "surface", match: "min" }
    ],
    publishFields: [
      { name: "property_type", label: "Tip proprietate", type: "select", options: ["Apartament", "Casa", "Teren", "Spatiu comercial", "Birou", "Hala"] },
      { name: "transaction_type", label: "Tranzactie", type: "select", options: ["Vanzare", "Inchiriere"] },
      { name: "rooms", label: "Camere", type: "number" },
      { name: "surface", label: "Suprafata mp", type: "number" },
      { name: "floor", label: "Etaj", type: "text" },
      { name: "year_built", label: "An constructie", type: "number" }
    ],
    displayFields: ["property_type", "transaction_type", "rooms", "surface"]
  },
  {
    code: "turism",
    name: "Turism",
    public_path: "/turism",
    launch_stage: "Activ",
    listing_count_goal: 300,
    notes: "Cazari, pensiuni, hoteluri si experiente turistice.",
    icon: "TR",
    searchPlaceholder: "cazare, destinatie, statiune",
    filters: [
      { name: "accommodation_type", label: "Tip cazare", type: "select", options: ["Hotel", "Pensiune", "Apartament", "Cabana", "Vila", "Camping"], target: "accommodation_type", match: "exact" },
      { name: "guests_min", label: "Persoane min.", type: "number", target: "guests", match: "min" },
      { name: "stars_min", label: "Stele min.", type: "number", target: "stars", match: "min" }
    ],
    publishFields: [
      { name: "accommodation_type", label: "Tip cazare", type: "select", options: ["Hotel", "Pensiune", "Apartament", "Cabana", "Vila", "Camping"] },
      { name: "guests", label: "Capacitate persoane", type: "number" },
      { name: "rooms", label: "Camere", type: "number" },
      { name: "stars", label: "Stele", type: "number" },
      { name: "trevoro_sync", label: "Trevoro", type: "select", options: YES_NO }
    ],
    displayFields: ["accommodation_type", "guests", "rooms", "stars"]
  },
  {
    code: "joburi",
    name: "Joburi",
    public_path: "/joburi",
    launch_stage: "Activ",
    listing_count_goal: 200,
    notes: "Locuri de munca, colaborari si recrutare.",
    icon: "JB",
    searchPlaceholder: "functie, oras, domeniu",
    filters: [
      { name: "job_type", label: "Contract", type: "select", options: ["Full-time", "Part-time", "Contract", "Sezonier", "Internship"], target: "job_type", match: "exact" },
      { name: "work_mode", label: "Mod lucru", type: "select", options: ["La sediu", "Hibrid", "Remote"], target: "work_mode", match: "exact" },
      { name: "salary_min", label: "Salariu min.", type: "number", target: "salary", match: "min" }
    ],
    publishFields: [
      { name: "job_type", label: "Contract", type: "select", options: ["Full-time", "Part-time", "Contract", "Sezonier", "Internship"] },
      { name: "work_mode", label: "Mod lucru", type: "select", options: ["La sediu", "Hibrid", "Remote"] },
      { name: "salary", label: "Salariu", type: "number" },
      { name: "experience", label: "Experienta", type: "select", options: ["Entry", "Mid", "Senior", "Manager"] }
    ],
    displayFields: ["job_type", "work_mode", "salary", "experience"]
  },
  {
    code: "servicii",
    name: "Servicii",
    public_path: "/servicii",
    launch_stage: "Activ",
    listing_count_goal: 250,
    notes: "Servicii locale, profesionale si specializate.",
    icon: "SV",
    searchPlaceholder: "serviciu, oras, domeniu",
    filters: [
      { name: "service_type", label: "Tip serviciu", type: "select", options: ["Constructii", "Reparatii", "Curatenie", "IT", "Marketing", "Transport", "Consultanta"], target: "service_type", match: "exact" },
      { name: "availability", label: "Disponibilitate", type: "select", options: ["Azi", "Saptamana aceasta", "Programare"], target: "availability", match: "exact" }
    ],
    publishFields: [
      { name: "service_type", label: "Tip serviciu", type: "select", options: ["Constructii", "Reparatii", "Curatenie", "IT", "Marketing", "Transport", "Consultanta"] },
      { name: "availability", label: "Disponibilitate", type: "select", options: ["Azi", "Saptamana aceasta", "Programare"] },
      { name: "coverage", label: "Zona acoperita", type: "text" }
    ],
    displayFields: ["service_type", "availability", "coverage"]
  },
  {
    code: "produse",
    name: "Produse",
    public_path: "/produse",
    launch_stage: "Activ",
    listing_count_goal: 300,
    notes: "Produse noi si second-hand.",
    icon: "PR",
    searchPlaceholder: "produs, brand, oras",
    filters: [
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO },
      { name: "brand", label: "Brand", type: "text" }
    ],
    displayFields: ["condition", "warranty", "brand"]
  },
  {
    code: "jucarii",
    name: "Jucarii",
    public_path: "/jucarii",
    launch_stage: "Activ",
    listing_count_goal: 150,
    notes: "Jucarii, jocuri si produse pentru copii.",
    icon: "JU",
    searchPlaceholder: "jucarie, varsta, brand",
    filters: [
      { name: "age_group", label: "Varsta", type: "select", options: ["0-2 ani", "3-5 ani", "6-9 ani", "10+ ani"], target: "age_group", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "age_group", label: "Varsta", type: "select", options: ["0-2 ani", "3-5 ani", "6-9 ani", "10+ ani"] },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "brand", label: "Brand", type: "text" }
    ],
    displayFields: ["age_group", "condition", "brand"]
  },
  {
    code: "electronice_electrocasnice",
    name: "Electronice si electrocasnice",
    public_path: "/electronice-electrocasnice",
    launch_stage: "Activ",
    listing_count_goal: 300,
    notes: "Electronice, electrocasnice si accesorii.",
    icon: "EL",
    searchPlaceholder: "frigider, TV, consola",
    filters: [
      { name: "product_group", label: "Grupa", type: "select", options: ["TV", "Electrocasnice mari", "Electrocasnice mici", "Console", "Smart home", "Altele"], target: "product_group", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "product_group", label: "Grupa", type: "select", options: ["TV", "Electrocasnice mari", "Electrocasnice mici", "Console", "Smart home", "Altele"] },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO },
      { name: "brand", label: "Brand", type: "text" }
    ],
    displayFields: ["product_group", "condition", "warranty", "brand"]
  },
  {
    code: "pc_laptopuri_it",
    name: "PC, laptopuri si echipamente IT",
    public_path: "/pc-laptopuri-it",
    launch_stage: "Activ",
    listing_count_goal: 250,
    notes: "Laptopuri, PC-uri, servere, componente si periferice.",
    icon: "IT",
    searchPlaceholder: "laptop, placa video, server",
    filters: [
      { name: "it_type", label: "Tip", type: "select", options: ["Laptop", "Desktop", "Componenta", "Monitor", "Server", "Periferic"], target: "it_type", match: "exact" },
      { name: "processor", label: "Procesor", type: "text", target: "processor", match: "contains" },
      { name: "ram_min", label: "RAM min. GB", type: "number", target: "ram", match: "min" },
      { name: "storage_min", label: "Stocare min. GB", type: "number", target: "storage", match: "min" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "it_type", label: "Tip", type: "select", options: ["Laptop", "Desktop", "Componenta", "Monitor", "Server", "Periferic"] },
      { name: "processor", label: "Procesor", type: "text" },
      { name: "ram", label: "RAM GB", type: "number" },
      { name: "storage", label: "Stocare GB", type: "number" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["it_type", "processor", "ram", "storage"]
  },
  {
    code: "telefoane_accesorii",
    name: "Telefoane si accesorii",
    public_path: "/telefoane-accesorii",
    launch_stage: "Activ",
    listing_count_goal: 250,
    notes: "Telefoane, tablete, wearables si accesorii.",
    icon: "TF",
    searchPlaceholder: "iPhone, Samsung, accesorii",
    filters: [
      { name: "phone_brand", label: "Brand", type: "select", options: PHONE_BRANDS, target: "phone_brand", match: "exact" },
      { name: "storage_min", label: "Stocare min. GB", type: "number", target: "storage", match: "min" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "phone_brand", label: "Brand", type: "select", options: PHONE_BRANDS },
      { name: "model", label: "Model", type: "text" },
      { name: "storage", label: "Stocare GB", type: "number" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO }
    ],
    displayFields: ["phone_brand", "model", "storage", "condition"]
  },
  {
    code: "audio_video",
    name: "Audio / Video",
    public_path: "/audio-video",
    launch_stage: "Activ",
    listing_count_goal: 180,
    notes: "Echipamente audio, video, foto si accesorii.",
    icon: "AV",
    searchPlaceholder: "boxe, camera, obiectiv",
    filters: [
      { name: "av_type", label: "Tip", type: "select", options: ["Audio", "Video", "Foto", "Proiectoare", "Accesorii"], target: "av_type", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "av_type", label: "Tip", type: "select", options: ["Audio", "Video", "Foto", "Proiectoare", "Accesorii"] },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO },
      { name: "brand", label: "Brand", type: "text" }
    ],
    displayFields: ["av_type", "condition", "warranty", "brand"]
  }
];

const CATEGORY_BY_CODE = new Map();
for (const definition of EMARQET_CATEGORY_DEFINITIONS) {
  CATEGORY_BY_CODE.set(definition.code, definition);
  CATEGORY_BY_CODE.set(definition.public_path.replace(/^\//, ""), definition);
  CATEGORY_BY_CODE.set(definition.code.replaceAll("_", "-"), definition);
}

export function emarqetDefaultVerticalRows() {
  return EMARQET_CATEGORY_DEFINITIONS.map((definition) => ({
    code: definition.code,
    name: definition.name,
    public_path: definition.public_path,
    status: "ACTIV",
    launch_stage: definition.launch_stage,
    listing_count_goal: definition.listing_count_goal,
    notes: definition.notes
  }));
}

export function categoryByCode(value = "") {
  const key = safeText(value).replace(/^\//, "");
  return CATEGORY_BY_CODE.get(key) || CATEGORY_BY_CODE.get(normalizeKey(key)) || null;
}

export function categoryByVerticalRow(row = {}) {
  return categoryByCode(row.code || row.vertical_code || row.public_path || "");
}

export function searchFieldsFor(value = "") {
  return categoryByCode(value)?.filters || [];
}

export function publishFieldsFor(value = "") {
  return categoryByCode(value)?.publishFields || [];
}

export function parseMetadata(value = "") {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function metadataFromBody(verticalCode = "", body = {}) {
  const fields = publishFieldsFor(verticalCode);
  const metadata = {};
  for (const field of fields) {
    const value = safeText(body[field.name]);
    if (!value) continue;
    if (field.type === "number") {
      const numberValue = Number(value.replace(",", "."));
      if (Number.isFinite(numberValue)) metadata[field.name] = numberValue;
      continue;
    }
    metadata[field.name] = value;
  }
  return metadata;
}

function normalizeComparable(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function fieldMatches(metadata = {}, field = {}, rawFilter = "") {
  const filterValue = safeText(rawFilter);
  if (!filterValue) return true;
  const value = metadata[field.target || field.name];
  if (field.match === "contains") {
    return normalizeComparable(value).includes(normalizeComparable(filterValue));
  }
  if (field.match === "min") {
    const listingNumber = numberValue(value);
    const filterNumber = numberValue(filterValue);
    if (filterNumber === null) return true;
    return listingNumber !== null && listingNumber >= filterNumber;
  }
  if (field.match === "max") {
    const listingNumber = numberValue(value);
    const filterNumber = numberValue(filterValue);
    if (filterNumber === null) return true;
    return listingNumber !== null && listingNumber <= filterNumber;
  }
  return normalizeComparable(value) === normalizeComparable(filterValue);
}

export function listingMatchesMetadataFilters(row = {}, filters = {}) {
  const definition = categoryByCode(row.vertical_code || filters.vertical || "");
  if (!definition) return true;
  const metadata = parseMetadata(row.metadata_json);
  for (const field of definition.filters || []) {
    if (!fieldMatches(metadata, field, filters[field.name])) return false;
  }
  return true;
}

export function metadataSummary(row = {}, maxItems = 5) {
  const definition = categoryByCode(row.vertical_code || row.code || "");
  if (!definition) return [];
  const metadata = parseMetadata(row.metadata_json);
  const fieldsByName = new Map((definition.publishFields || []).map((field) => [field.name, field]));
  const items = [];
  for (const key of definition.displayFields || []) {
    const value = metadata[key];
    if (value === null || value === undefined || value === "") continue;
    const field = fieldsByName.get(key);
    items.push({ label: field?.label || key, value: String(value) });
    if (items.length >= maxItems) break;
  }
  return items;
}
