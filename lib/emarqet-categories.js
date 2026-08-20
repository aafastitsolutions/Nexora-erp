import {
  APPLIANCE_BRANDS,
  APPLIANCE_PRODUCT_TYPES,
  AUDIO_VIDEO_BRAND_MODELS,
  EMARQET_CATEGORY_SUGGESTION_RULES,
  EMARQET_DEPENDENT_OPTIONS,
  IT_BRAND_MODELS,
  PHONE_BRAND_MODELS,
  REAL_ESTATE_SUBTYPES
} from "./emarqet-taxonomy.js";

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

export const AUTO_BRAND_MODELS = {
  Abarth: ["124 Spider", "500", "595", "695", "Grande Punto", "Punto Evo"],
  "Alfa Romeo": ["145", "146", "147", "156", "159", "166", "4C", "Brera", "Giulia", "Giulietta", "GT", "MiTo", "Spider", "Stelvio", "Tonale"],
  "Aston Martin": ["DB7", "DB9", "DB11", "DB12", "DBS", "DBX", "Rapide", "Vantage", "Vanquish", "Virage"],
  Audi: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q4 e-tron", "Q5", "Q7", "Q8", "R8", "RS3", "RS4", "RS5", "RS6", "RS7", "S3", "S4", "S5", "S6", "S7", "S8", "TT", "e-tron"],
  Bentley: ["Arnage", "Bentayga", "Brooklands", "Continental", "Flying Spur", "Mulsanne"],
  BMW: ["Seria 1", "Seria 2", "Seria 3", "Seria 4", "Seria 5", "Seria 6", "Seria 7", "Seria 8", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "Z3", "Z4", "i3", "i4", "i5", "i7", "i8", "iX", "M2", "M3", "M4", "M5", "M8"],
  BYD: ["Atto 3", "Dolphin", "Han", "Seal", "Seal U", "Tang"],
  Cadillac: ["ATS", "BLS", "CTS", "Escalade", "Seville", "SRX", "STS", "XT4", "XT5", "XT6"],
  Chevrolet: ["Aveo", "Camaro", "Captiva", "Corvette", "Cruze", "Epica", "Kalos", "Lacetti", "Malibu", "Matiz", "Orlando", "Spark", "Tahoe", "Trax"],
  Chrysler: ["300C", "Crossfire", "Grand Voyager", "Pacifica", "PT Cruiser", "Sebring", "Voyager"],
  Citroen: ["Ami", "Berlingo", "C1", "C2", "C3", "C3 Aircross", "C4", "C4 Cactus", "C4 Picasso", "C5", "C5 Aircross", "C6", "C8", "DS3", "DS4", "DS5", "Jumper", "Jumpy", "Saxo", "Spacetourer", "Xsara", "Xsara Picasso"],
  Cupra: ["Ateca", "Born", "Formentor", "Leon", "Tavascan"],
  Dacia: ["Dokker", "Duster", "Jogger", "Lodgy", "Logan", "Logan MCV", "Pick-Up", "Sandero", "Sandero Stepway", "Solenza", "Spring", "Supernova"],
  Daewoo: ["Cielo", "Espero", "Kalos", "Lacetti", "Lanos", "Leganza", "Matiz", "Nexia", "Nubira", "Tacuma", "Tico"],
  Daihatsu: ["Cuore", "Feroza", "Materia", "Rocky", "Sirion", "Terios"],
  Dodge: ["Avenger", "Caliber", "Challenger", "Charger", "Durango", "Journey", "Nitro", "Ram", "Viper"],
  "DS Automobiles": ["DS 3", "DS 4", "DS 5", "DS 7", "DS 9"],
  Ferrari: ["296", "360", "458", "488", "599", "812", "California", "F12", "F8", "Portofino", "Roma", "SF90"],
  Fiat: ["124 Spider", "500", "500C", "500L", "500X", "Albea", "Bravo", "Cinquecento", "Doblo", "Ducato", "Fiorino", "Freemont", "Grande Punto", "Linea", "Multipla", "Panda", "Punto", "Qubo", "Scudo", "Sedici", "Seicento", "Stilo", "Tipo", "Ulysse"],
  Ford: ["B-Max", "Bronco", "C-Max", "EcoSport", "Edge", "Escort", "Explorer", "Fiesta", "Focus", "Fusion", "Galaxy", "Ka", "Kuga", "Maverick", "Mondeo", "Mustang", "Mustang Mach-E", "Puma", "Ranger", "S-Max", "Tourneo", "Transit"],
  Honda: ["Accord", "CR-V", "CR-Z", "Civic", "Crosstour", "FR-V", "HR-V", "Insight", "Jazz", "Legend", "Prelude", "S2000", "Stream"],
  Hyundai: ["Accent", "Atos", "Bayon", "Coupe", "Elantra", "Galloper", "Genesis", "Getz", "H-1", "H350", "Ioniq", "Ioniq 5", "Ioniq 6", "Kona", "Matrix", "Santa Fe", "Sonata", "Terracan", "Trajet", "Tucson", "Veloster", "i10", "i20", "i30", "i40", "ix20", "ix35"],
  Infiniti: ["EX", "FX", "G", "M", "Q30", "Q50", "Q60", "Q70", "QX30", "QX50", "QX70"],
  Isuzu: ["D-Max", "Trooper"],
  Jaguar: ["E-Pace", "F-Pace", "F-Type", "I-Pace", "S-Type", "XE", "XF", "XJ", "XK", "X-Type"],
  Jeep: ["Avenger", "Cherokee", "Commander", "Compass", "Grand Cherokee", "Patriot", "Renegade", "Wrangler"],
  Kia: ["Carens", "Carnival", "Ceed", "Cerato", "EV3", "EV6", "EV9", "Niro", "Optima", "Picanto", "ProCeed", "Rio", "Sorento", "Soul", "Sportage", "Stinger", "Stonic", "Venga", "XCeed"],
  Lada: ["110", "111", "112", "Niva", "Priora", "Samara", "Vesta"],
  Lamborghini: ["Aventador", "Gallardo", "Huracan", "Murcielago", "Urus"],
  Lancia: ["Delta", "Musa", "Phedra", "Thema", "Thesis", "Ypsilon"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Freelander", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
  Lexus: ["CT", "ES", "GS", "GX", "IS", "LC", "LS", "LX", "NX", "RC", "RX", "RZ", "UX"],
  Maserati: ["Ghibli", "GranCabrio", "GranTurismo", "Grecale", "Levante", "Quattroporte"],
  Mazda: ["2", "3", "5", "6", "BT-50", "CX-3", "CX-30", "CX-5", "CX-60", "CX-7", "CX-80", "MX-30", "MX-5", "Premacy", "RX-8", "Tribute"],
  "Mercedes-Benz": ["190", "Atego", "Citan", "CLA", "CLC", "CLK", "CLS", "Clasa A", "Clasa B", "Clasa C", "Clasa E", "Clasa G", "Clasa M", "Clasa R", "Clasa S", "Clasa V", "E-Klasse", "EQA", "EQB", "EQC", "EQE", "EQS", "GL", "GLA", "GLB", "GLC", "GLE", "GLK", "GLS", "ML", "SL", "SLC", "SLK", "Sprinter", "Viano", "Vito"],
  MG: ["3", "4", "5", "HS", "Marvel R", "MGF", "TF", "ZS"],
  Mini: ["Cabrio", "Clubman", "Cooper", "Countryman", "Coupe", "One", "Paceman", "Roadster"],
  Mitsubishi: ["ASX", "Carisma", "Colt", "Eclipse Cross", "Galant", "Grandis", "L200", "Lancer", "Outlander", "Pajero", "Space Star"],
  Nissan: ["350Z", "370Z", "Almera", "Ariya", "GT-R", "Juke", "Leaf", "Micra", "Murano", "Navara", "Note", "Pathfinder", "Patrol", "Primastar", "Primera", "Pulsar", "Qashqai", "Terrano", "Tiida", "X-Trail"],
  Opel: ["Adam", "Agila", "Ampera", "Antara", "Astra", "Combo", "Corsa", "Crossland", "Frontera", "Grandland", "Insignia", "Karl", "Meriva", "Mokka", "Movano", "Omega", "Signum", "Tigra", "Vectra", "Vivaro", "Zafira"],
  Peugeot: ["1007", "106", "107", "108", "2008", "206", "207", "208", "3008", "306", "307", "308", "4007", "4008", "406", "407", "5008", "508", "607", "807", "Bipper", "Boxer", "Expert", "Partner", "Rifter", "RCZ", "Traveller"],
  Polestar: ["2", "3", "4"],
  Porsche: ["718", "911", "Boxster", "Cayenne", "Cayman", "Macan", "Panamera", "Taycan"],
  Renault: ["Arkana", "Austral", "Captur", "Clio", "Espace", "Fluence", "Kadjar", "Kangoo", "Koleos", "Laguna", "Latitude", "Master", "Megane", "Modus", "Rafale", "Scenic", "Symbol", "Talisman", "Trafic", "Twingo", "Vel Satis", "Zoe"],
  "Rolls-Royce": ["Cullinan", "Dawn", "Ghost", "Phantom", "Wraith"],
  Rover: ["25", "45", "75", "Streetwise"],
  Saab: ["9-3", "9-5", "900", "9000"],
  Seat: ["Alhambra", "Altea", "Arona", "Arosa", "Ateca", "Cordoba", "Exeo", "Ibiza", "Leon", "Mii", "Tarraco", "Toledo"],
  Skoda: ["Citigo", "Enyaq", "Fabia", "Kamiq", "Karoq", "Kodiaq", "Octavia", "Rapid", "Roomster", "Scala", "Superb", "Yeti"],
  Smart: ["Forfour", "Fortwo", "Roadster"],
  SsangYong: ["Actyon", "Korando", "Kyron", "Musso", "Rexton", "Tivoli"],
  Subaru: ["BRZ", "Forester", "Impreza", "Justy", "Legacy", "Levorg", "Outback", "Tribeca", "WRX", "XV"],
  Suzuki: ["Across", "Alto", "Baleno", "Grand Vitara", "Ignis", "Jimny", "Kizashi", "S-Cross", "Splash", "Swift", "SX4", "Vitara", "Wagon R"],
  Tesla: ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y", "Roadster"],
  Toyota: ["Auris", "Avensis", "Aygo", "C-HR", "Camry", "Celica", "Corolla", "GT86", "Highlander", "Hilux", "Land Cruiser", "Prius", "Proace", "RAV4", "Supra", "Urban Cruiser", "Verso", "Yaris", "Yaris Cross"],
  Volkswagen: ["Amarok", "Arteon", "Beetle", "Bora", "Caddy", "CC", "Crafter", "Eos", "Fox", "Golf", "Golf Plus", "ID.3", "ID.4", "ID.5", "ID.7", "Jetta", "Lupo", "Passat", "Phaeton", "Polo", "Scirocco", "Sharan", "T-Cross", "T-Roc", "Taigo", "Tiguan", "Touareg", "Touran", "Transporter", "Up"],
  Volvo: ["C30", "C70", "EX30", "EX90", "S40", "S60", "S80", "S90", "V40", "V50", "V60", "V70", "V90", "XC40", "XC60", "XC70", "XC90"]
};

const AUTO_BRAND_ALIASES = {
  BMW: ["BMW", "Bayerische Motoren Werke"],
  Citroen: ["Citroen", "Citroën"],
  "DS Automobiles": ["DS", "DS Automobiles"],
  "Land Rover": ["Land Rover", "Range Rover"],
  "Mercedes-Benz": ["Mercedes-Benz", "Mercedes Benz", "Mercedes"],
  Mini: ["Mini", "MINI"],
  Skoda: ["Skoda", "Škoda"],
  Volkswagen: ["Volkswagen", "VW"]
};

const AUTO_MODEL_ALIASES = {
  BMW: { "1er": "Seria 1", "2er": "Seria 2", "3er": "Seria 3", "4er": "Seria 4", "5er": "Seria 5", "6er": "Seria 6", "7er": "Seria 7", "8er": "Seria 8" },
  "Mercedes-Benz": { "A-Klasse": "Clasa A", "B-Klasse": "Clasa B", "C-Klasse": "Clasa C", "E-Klasse": "Clasa E", "S-Klasse": "Clasa S", "M-Klasse": "Clasa M", "V-Klasse": "Clasa V" },
  Volkswagen: { VW: "Volkswagen" }
};

export const AUTO_BRANDS = Object.keys(AUTO_BRAND_MODELS).sort((a, b) => a.localeCompare(b, "ro"));
export const AUTO_MODEL_OPTIONS = [...new Set(Object.values(AUTO_BRAND_MODELS).flat())].sort((a, b) => a.localeCompare(b, "ro", { numeric: true }));

const PHONE_BRANDS = Object.keys(PHONE_BRAND_MODELS);
const IT_BRANDS = Object.keys(IT_BRAND_MODELS);
const AUDIO_VIDEO_BRANDS = Object.keys(AUDIO_VIDEO_BRAND_MODELS);
const REAL_ESTATE_PROPERTY_TYPES = Object.keys(REAL_ESTATE_SUBTYPES);
const CONDITION_OPTIONS = ["Nou", "Ca nou", "Foarte bun", "Bun", "Acceptabil"];
const YES_NO = ["Da", "Nu"];

export { EMARQET_CATEGORY_SUGGESTION_RULES, EMARQET_DEPENDENT_OPTIONS };

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
      { name: "vehicle_type", label: "Categorie vehicul", type: "select", options: ["Autoturism", "Autoutilitară", "Motocicletă / ATV", "Rulotă / Autorulotă", "Ambarcațiune", "Piese și accesorii"], target: "vehicle_type", match: "exact" },
      { name: "brand", label: "Marca", type: "select", options: AUTO_BRANDS, target: "brand", match: "exact", autoRole: "brand" },
      { name: "model", label: "Model", type: "select", options: AUTO_MODEL_OPTIONS, target: "model", match: "contains", autoRole: "model" },
      { name: "year_min", label: "An de la", type: "number", target: "year", match: "min" },
      { name: "year_max", label: "An pana la", type: "number", target: "year", match: "max" },
      { name: "fuel", label: "Combustibil", type: "select", options: ["Benzina", "Diesel", "Hibrid", "Plug-in hybrid", "Electric", "GPL"], target: "fuel", match: "exact" },
      { name: "transmission", label: "Cutie", type: "select", options: ["Manuala", "Automata"], target: "transmission", match: "exact" },
      { name: "body_type", label: "Caroserie", type: "select", options: ["Berlina", "Break", "Hatchback", "SUV", "Coupe", "Cabrio", "Monovolum", "Utilitara"], target: "body_type", match: "exact" },
      { name: "mileage_max", label: "Km max.", type: "number", target: "mileage", match: "max" },
      { name: "seller_type", label: "Vanzator", type: "select", options: ["Persoana fizica", "Dealer", "Firma"], target: "seller_type", match: "exact" }
    ],
    publishFields: [
      { name: "vehicle_type", label: "Categorie vehicul", type: "select", options: ["Autoturism", "Autoutilitară", "Motocicletă / ATV", "Rulotă / Autorulotă", "Ambarcațiune", "Piese și accesorii"] },
      { name: "brand", label: "Marca", type: "select", options: AUTO_BRANDS, autoRole: "brand" },
      { name: "model", label: "Model", type: "select", options: AUTO_MODEL_OPTIONS, autoRole: "model" },
      { name: "year", label: "An fabricatie", type: "number" },
      { name: "fuel", label: "Combustibil", type: "select", options: ["Benzina", "Diesel", "Hibrid", "Plug-in hybrid", "Electric", "GPL"] },
      { name: "transmission", label: "Cutie", type: "select", options: ["Manuala", "Automata"] },
      { name: "body_type", label: "Caroserie", type: "select", options: ["Berlina", "Break", "Hatchback", "SUV", "Coupe", "Cabrio", "Monovolum", "Utilitara"] },
      { name: "mileage", label: "Kilometri", type: "number" },
      { name: "vin", label: "VIN", type: "text" }
    ],
    displayFields: ["vehicle_type", "brand", "model", "year", "fuel", "mileage"]
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
      { name: "property_type", label: "Tip", type: "select", options: REAL_ESTATE_PROPERTY_TYPES, target: "property_type", match: "exact" },
      { name: "property_subtype", label: "Subtip", type: "datalist", dependentKey: "property_subtype", target: "property_subtype", match: "exact" },
      { name: "transaction_type", label: "Tranzacție", type: "select", options: ["Vânzare", "Închiriere", "Schimb"], target: "transaction_type", match: "exact" },
      { name: "rooms_min", label: "Camere min.", type: "number", target: "rooms", match: "min" },
      { name: "surface_min", label: "Suprafață min.", type: "number", target: "surface", match: "min" },
      { name: "construction_state", label: "Stare", type: "select", options: ["Nou", "Renovat", "Necesită renovare", "În construcție"], target: "construction_state", match: "exact" }
    ],
    publishFields: [
      { name: "property_type", label: "Tip proprietate", type: "select", options: REAL_ESTATE_PROPERTY_TYPES },
      { name: "property_subtype", label: "Subtip proprietate", type: "datalist", dependentKey: "property_subtype" },
      { name: "transaction_type", label: "Tranzacție", type: "select", options: ["Vânzare", "Închiriere", "Schimb"] },
      { name: "rooms", label: "Camere", type: "number" },
      { name: "surface", label: "Suprafață utilă mp", type: "number" },
      { name: "land_surface", label: "Suprafață teren mp", type: "number" },
      { name: "floor", label: "Etaj", type: "text" },
      { name: "year_built", label: "An construcție", type: "number" },
      { name: "construction_state", label: "Stare", type: "select", options: ["Nou", "Renovat", "Necesită renovare", "În construcție"] },
      { name: "furnished", label: "Mobilat", type: "select", options: ["Complet", "Parțial", "Nemobilat"] },
      { name: "seller_type_property", label: "Publicat de", type: "select", options: ["Proprietar", "Agenție", "Dezvoltator"] }
    ],
    displayFields: ["property_type", "property_subtype", "transaction_type", "rooms", "surface", "land_surface"]
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
      { name: "accommodation_type", label: "Tip cazare", type: "select", options: ["Hotel", "Pensiune", "Apartament în regim hotelier", "Cabană", "Vilă", "Casă de vacanță", "Camping", "Glamping", "Hostel", "Complex turistic"], target: "accommodation_type", match: "exact" },
      { name: "guests_min", label: "Persoane min.", type: "number", target: "guests", match: "min" },
      { name: "stars_min", label: "Stele min.", type: "number", target: "stars", match: "min" },
      { name: "tourism_offer", label: "Tip ofertă", type: "select", options: ["Cazare", "Sejur", "Circuit", "Experiență", "Excursie", "Bilet / Transport"], target: "tourism_offer", match: "exact" }
    ],
    publishFields: [
      { name: "tourism_offer", label: "Tip ofertă", type: "select", options: ["Cazare", "Sejur", "Circuit", "Experiență", "Excursie", "Bilet / Transport"] },
      { name: "accommodation_type", label: "Tip cazare", type: "select", options: ["Hotel", "Pensiune", "Apartament în regim hotelier", "Cabană", "Vilă", "Casă de vacanță", "Camping", "Glamping", "Hostel", "Complex turistic"] },
      { name: "guests", label: "Capacitate persoane", type: "number" },
      { name: "rooms", label: "Camere", type: "number" },
      { name: "stars", label: "Stele", type: "number" },
      { name: "facilities", label: "Facilități principale", type: "text" },
      { name: "trevoro_sync", label: "Trevoro", type: "select", options: YES_NO }
    ],
    displayFields: ["tourism_offer", "accommodation_type", "guests", "rooms", "stars"]
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
      { name: "job_domain", label: "Domeniu", type: "select", options: ["Administrativ", "Auto / Curierat", "Construcții", "Educație", "Financiar", "HoReCa", "IT / Telecom", "Medical", "Producție", "Retail", "Securitate", "Transport / Logistică", "Vânzări", "Altele"], target: "job_domain", match: "exact" },
      { name: "job_type", label: "Contract", type: "select", options: ["Full-time", "Part-time", "Contract", "Sezonier", "Internship"], target: "job_type", match: "exact" },
      { name: "work_mode", label: "Mod lucru", type: "select", options: ["La sediu", "Hibrid", "Remote"], target: "work_mode", match: "exact" },
      { name: "salary_min", label: "Salariu min.", type: "number", target: "salary", match: "min" }
    ],
    publishFields: [
      { name: "job_domain", label: "Domeniu", type: "select", options: ["Administrativ", "Auto / Curierat", "Construcții", "Educație", "Financiar", "HoReCa", "IT / Telecom", "Medical", "Producție", "Retail", "Securitate", "Transport / Logistică", "Vânzări", "Altele"] },
      { name: "job_type", label: "Contract", type: "select", options: ["Full-time", "Part-time", "Contract", "Sezonier", "Internship"] },
      { name: "work_mode", label: "Mod lucru", type: "select", options: ["La sediu", "Hibrid", "Remote"] },
      { name: "salary", label: "Salariu", type: "number" },
      { name: "experience", label: "Experiență", type: "select", options: ["Fără experiență", "Entry", "Mid", "Senior", "Manager"] },
      { name: "education", label: "Studii", type: "select", options: ["Fără cerințe", "Medii", "Postliceale", "Superioare"] }
    ],
    displayFields: ["job_domain", "job_type", "work_mode", "salary", "experience"]
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
      { name: "service_type", label: "Tip serviciu", type: "select", options: ["Construcții și amenajări", "Reparații electrocasnice", "Reparații auto", "Curățenie", "IT și electronice", "Marketing și publicitate", "Transport și mutări", "Evenimente", "Educație și cursuri", "Sănătate și îngrijire", "Consultanță", "Servicii juridice", "Servicii financiare", "Croitorie și înfrumusețare", "Altele"], target: "service_type", match: "exact" },
      { name: "availability", label: "Disponibilitate", type: "select", options: ["Azi", "Saptamana aceasta", "Programare"], target: "availability", match: "exact" }
    ],
    publishFields: [
      { name: "service_type", label: "Tip serviciu", type: "select", options: ["Construcții și amenajări", "Reparații electrocasnice", "Reparații auto", "Curățenie", "IT și electronice", "Marketing și publicitate", "Transport și mutări", "Evenimente", "Educație și cursuri", "Sănătate și îngrijire", "Consultanță", "Servicii juridice", "Servicii financiare", "Croitorie și înfrumusețare", "Altele"] },
      { name: "availability", label: "Disponibilitate", type: "select", options: ["Azi", "Saptamana aceasta", "Programare"] },
      { name: "coverage", label: "Zona acoperită", type: "text" },
      { name: "provider_type", label: "Prestator", type: "select", options: ["Persoană fizică", "PFA", "Firmă"] }
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
      { name: "product_type", label: "Tip produs", type: "select", options: ["Casă și grădină", "Modă", "Sport", "Cărți", "Artă și colecții", "Instrumente muzicale", "Piese și accesorii", "Produse handmade", "Diverse"], target: "product_type", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "product_type", label: "Tip produs", type: "select", options: ["Casă și grădină", "Modă", "Sport", "Cărți", "Artă și colecții", "Instrumente muzicale", "Piese și accesorii", "Produse handmade", "Diverse"] },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO },
      { name: "brand", label: "Brand", type: "text" }
    ],
    displayFields: ["product_type", "condition", "warranty", "brand"]
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
      { name: "toy_type", label: "Tip", type: "select", options: ["LEGO și construcții", "Păpuși", "Mașinuțe", "Jocuri și puzzle", "Jucării educative", "Jucării de exterior", "Plușuri", "Console și jocuri copii", "Altele"], target: "toy_type", match: "exact" },
      { name: "age_group", label: "Varsta", type: "select", options: ["0-2 ani", "3-5 ani", "6-9 ani", "10+ ani"], target: "age_group", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "toy_type", label: "Tip", type: "select", options: ["LEGO și construcții", "Păpuși", "Mașinuțe", "Jocuri și puzzle", "Jucării educative", "Jucării de exterior", "Plușuri", "Console și jocuri copii", "Altele"] },
      { name: "age_group", label: "Varsta", type: "select", options: ["0-2 ani", "3-5 ani", "6-9 ani", "10+ ani"] },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "brand", label: "Brand", type: "datalist", options: ["LEGO", "Barbie", "Fisher-Price", "Hasbro", "Mattel", "Nerf", "Playmobil", "Ravensburger", "VTech", "Chicco"] }
    ],
    displayFields: ["toy_type", "age_group", "condition", "brand"]
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
      { name: "product_group", label: "Grupă", type: "select", options: ["Electrocasnice mari", "Electrocasnice mici", "TV", "Console", "Îngrijire personală", "Smart home", "Aparate medicale și wellness", "Altele"], target: "product_group", match: "exact" },
      { name: "appliance_type", label: "Tip aparat", type: "select", options: APPLIANCE_PRODUCT_TYPES, target: "appliance_type", match: "exact" },
      { name: "brand", label: "Brand", type: "select", options: APPLIANCE_BRANDS, target: "brand", match: "exact" },
      { name: "model", label: "Model / gamă", type: "datalist", dependentKey: "appliance_model", target: "model", match: "contains" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "product_group", label: "Grupă", type: "select", options: ["Electrocasnice mari", "Electrocasnice mici", "TV", "Console", "Îngrijire personală", "Smart home", "Aparate medicale și wellness", "Altele"] },
      { name: "appliance_type", label: "Tip aparat", type: "select", options: APPLIANCE_PRODUCT_TYPES },
      { name: "brand", label: "Brand", type: "select", options: APPLIANCE_BRANDS },
      { name: "model", label: "Model / gamă", type: "datalist", dependentKey: "appliance_model" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO },
      { name: "energy_class", label: "Clasă energetică", type: "select", options: ["A", "B", "C", "D", "E", "F", "G", "Nu se aplică"] }
    ],
    displayFields: ["product_group", "appliance_type", "brand", "model", "condition", "warranty"]
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
      { name: "it_type", label: "Tip", type: "select", options: ["Laptop", "Desktop", "All-in-One", "Componentă", "Monitor", "Server / NAS", "Rețelistică", "Imprimantă / Scanner", "Periferic", "Gaming"], target: "it_type", match: "exact" },
      { name: "brand", label: "Brand", type: "select", options: IT_BRANDS, target: "brand", match: "exact" },
      { name: "model", label: "Model / serie", type: "datalist", dependentKey: "it_model", target: "model", match: "contains" },
      { name: "processor", label: "Procesor", type: "text", target: "processor", match: "contains" },
      { name: "ram_min", label: "RAM min. GB", type: "number", target: "ram", match: "min" },
      { name: "storage_min", label: "Stocare min. GB", type: "number", target: "storage", match: "min" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "it_type", label: "Tip", type: "select", options: ["Laptop", "Desktop", "All-in-One", "Componentă", "Monitor", "Server / NAS", "Rețelistică", "Imprimantă / Scanner", "Periferic", "Gaming"] },
      { name: "brand", label: "Brand", type: "select", options: IT_BRANDS },
      { name: "model", label: "Model / serie", type: "datalist", dependentKey: "it_model" },
      { name: "processor", label: "Procesor", type: "text" },
      { name: "ram", label: "RAM GB", type: "number" },
      { name: "storage", label: "Stocare GB", type: "number" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["it_type", "brand", "model", "processor", "ram", "storage"]
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
      { name: "phone_type", label: "Tip", type: "select", options: ["Telefon", "Tabletă / eReader", "Smartwatch / Wearable", "Accesoriu", "Piese"], target: "phone_type", match: "exact" },
      { name: "phone_brand", label: "Brand", type: "select", options: PHONE_BRANDS, target: "phone_brand", match: "exact" },
      { name: "model", label: "Model / serie", type: "datalist", dependentKey: "phone_model", target: "model", match: "contains" },
      { name: "storage_min", label: "Stocare min. GB", type: "number", target: "storage", match: "min" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "phone_type", label: "Tip", type: "select", options: ["Telefon", "Tabletă / eReader", "Smartwatch / Wearable", "Accesoriu", "Piese"] },
      { name: "phone_brand", label: "Brand", type: "select", options: PHONE_BRANDS },
      { name: "model", label: "Model / serie", type: "datalist", dependentKey: "phone_model" },
      { name: "storage", label: "Stocare GB", type: "number" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO }
    ],
    displayFields: ["phone_type", "phone_brand", "model", "storage", "condition"]
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
      { name: "av_type", label: "Tip", type: "select", options: ["Aparat foto", "Cameră video", "Obiectiv", "Dronă", "Căști", "Boxe", "Home cinema", "Audio Hi-Fi", "Audio profesional", "Microfon", "Videoproiector", "Accesoriu"], target: "av_type", match: "exact" },
      { name: "brand", label: "Brand", type: "select", options: AUDIO_VIDEO_BRANDS, target: "brand", match: "exact" },
      { name: "model", label: "Model / serie", type: "datalist", dependentKey: "av_model", target: "model", match: "contains" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO, target: "warranty", match: "exact" }
    ],
    publishFields: [
      { name: "av_type", label: "Tip", type: "select", options: ["Aparat foto", "Cameră video", "Obiectiv", "Dronă", "Căști", "Boxe", "Home cinema", "Audio Hi-Fi", "Audio profesional", "Microfon", "Videoproiector", "Accesoriu"] },
      { name: "brand", label: "Brand", type: "select", options: AUDIO_VIDEO_BRANDS },
      { name: "model", label: "Model / serie", type: "datalist", dependentKey: "av_model" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garantie", type: "select", options: YES_NO },
      { name: "year", label: "An fabricație", type: "number" }
    ],
    displayFields: ["av_type", "brand", "model", "condition", "warranty"]
  },
  {
    code: "moda_frumusete",
    name: "Modă și frumusețe",
    public_path: "/moda-frumusete",
    launch_stage: "Activ",
    listing_count_goal: 250,
    notes: "Îmbrăcăminte, încălțăminte, accesorii și cosmetice.",
    icon: "MF",
    searchPlaceholder: "rochie, pantofi, parfum, brand",
    filters: [
      { name: "fashion_type", label: "Tip", type: "select", options: ["Haine femei", "Haine bărbați", "Încălțăminte", "Genți", "Ceasuri", "Bijuterii", "Cosmetice", "Parfumuri", "Accesorii"], target: "fashion_type", match: "exact" },
      { name: "size", label: "Mărime", type: "text", target: "size", match: "contains" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "fashion_type", label: "Tip", type: "select", options: ["Haine femei", "Haine bărbați", "Încălțăminte", "Genți", "Ceasuri", "Bijuterii", "Cosmetice", "Parfumuri", "Accesorii"] },
      { name: "brand", label: "Brand", type: "text" },
      { name: "size", label: "Mărime", type: "text" },
      { name: "color", label: "Culoare", type: "text" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["fashion_type", "brand", "size", "condition"]
  },
  {
    code: "casa_gradina",
    name: "Casă și grădină",
    public_path: "/casa-gradina",
    launch_stage: "Activ",
    listing_count_goal: 300,
    notes: "Mobilier, decorațiuni, materiale și produse pentru grădină.",
    icon: "CG",
    searchPlaceholder: "mobilă, canapea, grădină, decorațiuni",
    filters: [
      { name: "home_type", label: "Tip", type: "select", options: ["Mobilier", "Decorațiuni", "Iluminat", "Textile", "Bucătărie", "Baie", "Scule", "Materiale construcții", "Grădină", "Plante"], target: "home_type", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "home_type", label: "Tip", type: "select", options: ["Mobilier", "Decorațiuni", "Iluminat", "Textile", "Bucătărie", "Baie", "Scule", "Materiale construcții", "Grădină", "Plante"] },
      { name: "brand", label: "Brand / Producător", type: "text" },
      { name: "material", label: "Material", type: "text" },
      { name: "dimensions", label: "Dimensiuni", type: "text" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["home_type", "brand", "material", "dimensions", "condition"]
  },
  {
    code: "mama_copilul",
    name: "Mama și copilul",
    public_path: "/mama-copilul",
    launch_stage: "Activ",
    listing_count_goal: 220,
    notes: "Produse pentru bebeluși, copii și părinți.",
    icon: "MC",
    searchPlaceholder: "cărucior, pătuț, haine copil",
    filters: [
      { name: "child_type", label: "Tip", type: "select", options: ["Cărucioare", "Scaune auto", "Mobilier copii", "Haine și încălțăminte", "Îngrijire", "Alimentație", "Siguranță", "Produse pentru mame"], target: "child_type", match: "exact" },
      { name: "age_group", label: "Vârstă", type: "select", options: ["Nou-născut", "0-2 ani", "3-5 ani", "6-9 ani", "10+ ani"], target: "age_group", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "child_type", label: "Tip", type: "select", options: ["Cărucioare", "Scaune auto", "Mobilier copii", "Haine și încălțăminte", "Îngrijire", "Alimentație", "Siguranță", "Produse pentru mame"] },
      { name: "age_group", label: "Vârstă", type: "select", options: ["Nou-născut", "0-2 ani", "3-5 ani", "6-9 ani", "10+ ani"] },
      { name: "brand", label: "Brand", type: "text" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["child_type", "age_group", "brand", "condition"]
  },
  {
    code: "sport_timp_liber_arta",
    name: "Sport, timp liber și artă",
    public_path: "/sport-timp-liber-arta",
    launch_stage: "Activ",
    listing_count_goal: 250,
    notes: "Sport, biciclete, hobby, cărți, muzică și artă.",
    icon: "SP",
    searchPlaceholder: "bicicletă, fitness, pescuit, chitară",
    filters: [
      { name: "hobby_type", label: "Tip", type: "select", options: ["Biciclete", "Fitness", "Sporturi de iarnă", "Pescuit", "Vânătoare", "Camping", "Instrumente muzicale", "Cărți", "Artă", "Colecții", "Bilete"], target: "hobby_type", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "hobby_type", label: "Tip", type: "select", options: ["Biciclete", "Fitness", "Sporturi de iarnă", "Pescuit", "Vânătoare", "Camping", "Instrumente muzicale", "Cărți", "Artă", "Colecții", "Bilete"] },
      { name: "brand", label: "Brand / Autor", type: "text" },
      { name: "model", label: "Model / Titlu", type: "text" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["hobby_type", "brand", "model", "condition"]
  },
  {
    code: "animale_companie",
    name: "Animale de companie",
    public_path: "/animale-companie",
    launch_stage: "Activ",
    listing_count_goal: 180,
    notes: "Animale, adopții, hrană și accesorii.",
    icon: "AN",
    searchPlaceholder: "câine, pisică, adopție, hrană",
    filters: [
      { name: "pet_type", label: "Tip", type: "select", options: ["Câini", "Pisici", "Păsări", "Pești", "Rozătoare", "Reptile", "Adopții", "Hrană", "Accesorii"], target: "pet_type", match: "exact" },
      { name: "pedigree", label: "Pedigree", type: "select", options: YES_NO, target: "pedigree", match: "exact" }
    ],
    publishFields: [
      { name: "pet_type", label: "Tip", type: "select", options: ["Câini", "Pisici", "Păsări", "Pești", "Rozătoare", "Reptile", "Adopții", "Hrană", "Accesorii"] },
      { name: "breed", label: "Rasă", type: "text" },
      { name: "age", label: "Vârstă", type: "text" },
      { name: "pedigree", label: "Pedigree", type: "select", options: YES_NO },
      { name: "vaccinated", label: "Vaccinat", type: "select", options: YES_NO }
    ],
    displayFields: ["pet_type", "breed", "age", "pedigree"]
  },
  {
    code: "agro_industrie",
    name: "Agro și industrie",
    public_path: "/agro-industrie",
    launch_stage: "Activ",
    listing_count_goal: 180,
    notes: "Utilaje agricole, produse, materii prime și industrie.",
    icon: "AG",
    searchPlaceholder: "tractor, utilaj, semințe, furaje",
    filters: [
      { name: "agro_type", label: "Tip", type: "select", options: ["Tractoare", "Utilaje agricole", "Remorci", "Piese", "Semințe și plante", "Cereale", "Furaje", "Animale fermă", "Silvicultură", "Materii prime"], target: "agro_type", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "agro_type", label: "Tip", type: "select", options: ["Tractoare", "Utilaje agricole", "Remorci", "Piese", "Semințe și plante", "Cereale", "Furaje", "Animale fermă", "Silvicultură", "Materii prime"] },
      { name: "brand", label: "Brand / Producător", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "year", label: "An", type: "number" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS }
    ],
    displayFields: ["agro_type", "brand", "model", "year", "condition"]
  },
  {
    code: "echipamente_profesionale",
    name: "Echipamente profesionale",
    public_path: "/echipamente-profesionale",
    launch_stage: "Activ",
    listing_count_goal: 160,
    notes: "Echipamente HoReCa, comerciale, industriale și pentru firme.",
    icon: "EP",
    searchPlaceholder: "echipament, utilaj, horeca, industrial",
    filters: [
      { name: "equipment_type", label: "Tip", type: "select", options: ["HoReCa", "Comercial", "Industrial", "Construcții", "Medical", "Service auto", "Tipografie", "Depozitare", "Scule profesionale"], target: "equipment_type", match: "exact" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS, target: "condition", match: "exact" }
    ],
    publishFields: [
      { name: "equipment_type", label: "Tip", type: "select", options: ["HoReCa", "Comercial", "Industrial", "Construcții", "Medical", "Service auto", "Tipografie", "Depozitare", "Scule profesionale"] },
      { name: "brand", label: "Brand / Producător", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "year", label: "An", type: "number" },
      { name: "condition", label: "Stare", type: "select", options: CONDITION_OPTIONS },
      { name: "warranty", label: "Garanție", type: "select", options: YES_NO }
    ],
    displayFields: ["equipment_type", "brand", "model", "condition", "warranty"]
  },
  {
    code: "inchirieri",
    name: "Închirieri bunuri și vehicule",
    public_path: "/inchirieri",
    launch_stage: "Activ",
    listing_count_goal: 150,
    notes: "Închirieri auto, utilaje, scule, echipamente și articole pentru evenimente.",
    icon: "IN",
    searchPlaceholder: "închiriere auto, utilaj, scule, evenimente",
    filters: [
      { name: "rental_type", label: "Tip", type: "select", options: ["Auto", "Utilitare", "Rulote", "Utilaje", "Scule", "Echipamente evenimente", "Echipamente sportive", "Altele"], target: "rental_type", match: "exact" },
      { name: "rental_period", label: "Perioadă", type: "select", options: ["Oră", "Zi", "Săptămână", "Lună"], target: "rental_period", match: "exact" }
    ],
    publishFields: [
      { name: "rental_type", label: "Tip", type: "select", options: ["Auto", "Utilitare", "Rulote", "Utilaje", "Scule", "Echipamente evenimente", "Echipamente sportive", "Altele"] },
      { name: "brand", label: "Brand", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "rental_period", label: "Preț pentru", type: "select", options: ["Oră", "Zi", "Săptămână", "Lună"] },
      { name: "deposit", label: "Garanție solicitată", type: "number" }
    ],
    displayFields: ["rental_type", "brand", "model", "rental_period", "deposit"]
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

function normalizeAutoText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function autoTextIncludes(haystack = "", needle = "") {
  const normalizedNeedle = normalizeAutoText(needle);
  if (!normalizedNeedle) return false;
  return ` ${normalizeAutoText(haystack)} `.includes(` ${normalizedNeedle} `);
}

function autoModelCandidates(brand = "") {
  const direct = (AUTO_BRAND_MODELS[brand] || []).map((model) => ({ value: model, alias: model }));
  const aliases = Object.entries(AUTO_MODEL_ALIASES[brand] || {}).map(([alias, value]) => ({ value, alias }));
  return [...aliases, ...direct]
    .filter((item) => item.value && item.alias && item.value !== brand)
    .sort((a, b) => normalizeAutoText(b.alias).length - normalizeAutoText(a.alias).length);
}

export function detectAutoBrandModel(value = "") {
  const text = safeText(value);
  if (!text) return {};
  const brandCandidates = AUTO_BRANDS.flatMap((brand) => {
    const aliases = AUTO_BRAND_ALIASES[brand] || [brand];
    return aliases.map((alias) => ({ brand, alias }));
  }).sort((a, b) => normalizeAutoText(b.alias).length - normalizeAutoText(a.alias).length);
  const foundBrand = brandCandidates.find((candidate) => autoTextIncludes(text, candidate.alias))?.brand || "";
  if (!foundBrand) return {};
  const foundModel = autoModelCandidates(foundBrand).find((candidate) => autoTextIncludes(text, candidate.alias))?.value || "";
  return { brand: foundBrand, model: foundModel };
}

export function listingMetadata(row = {}) {
  const metadata = parseMetadata(row.metadata_json);
  const nested = metadata.vehicle && typeof metadata.vehicle === "object" && !Array.isArray(metadata.vehicle)
    ? metadata.vehicle
    : {};
  const base = { ...nested, ...metadata };
  const inferred = detectAutoBrandModel([
    base.brand,
    base.model,
    row.title,
    row.listing_code
  ].filter(Boolean).join(" "));
  return {
    ...base,
    brand: base.brand || inferred.brand || "",
    model: base.model || inferred.model || ""
  };
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

function autoModelMatches(brand = "", value = "", filterValue = "") {
  if (!safeText(value)) return false;
  if (normalizeComparable(value).includes(normalizeComparable(filterValue))) return true;
  if (normalizeComparable(filterValue).includes(normalizeComparable(value))) return true;
  return autoModelCandidates(brand).some((candidate) => {
    const sameValue = normalizeComparable(candidate.value) === normalizeComparable(value);
    const filterIsAlias = normalizeComparable(candidate.alias) === normalizeComparable(filterValue);
    const filterIsValue = normalizeComparable(candidate.value) === normalizeComparable(filterValue);
    return sameValue && (filterIsAlias || filterIsValue);
  });
}

function fieldMatches(metadata = {}, field = {}, rawFilter = "") {
  const filterValue = safeText(rawFilter);
  if (!filterValue) return true;
  const value = metadata[field.target || field.name];
  if ((field.target || field.name) === "model") {
    return autoModelMatches(metadata.brand, value, filterValue);
  }
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
  const metadata = listingMetadata(row);
  for (const field of definition.filters || []) {
    if (!fieldMatches(metadata, field, filters[field.name])) return false;
  }
  return true;
}

export function metadataSummary(row = {}, maxItems = 5) {
  const definition = categoryByCode(row.vertical_code || row.code || "");
  if (!definition) return [];
  const metadata = listingMetadata(row);
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
