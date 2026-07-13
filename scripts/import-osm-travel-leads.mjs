#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { db, migrate } from "../db.js";

const TOURISM_TAGS = [
  "hotel",
  "guest_house",
  "apartment",
  "chalet",
  "camp_site",
  "caravan_site",
  "hostel",
  "motel",
  "alpine_hut",
  "wilderness_hut",
  "resort"
];

const PROPERTY_TYPES = {
  hotel: "hotel",
  guest_house: "pensiune",
  apartment: "apartament",
  chalet: "cabana",
  camp_site: "camping",
  caravan_site: "camping",
  hostel: "hostel",
  motel: "motel",
  alpine_hut: "cabana",
  wilderness_hut: "cabana",
  resort: "resort"
};

const DEFAULT_TOURIST_CITIES = [
  "Bucuresti",
  "Brasov",
  "Sibiu",
  "Cluj-Napoca",
  "Timisoara",
  "Constanta",
  "Mamaia",
  "Oradea",
  "Iasi",
  "Sinaia",
  "Predeal",
  "Busteni",
  "Bran",
  "Sighisoara",
  "Vama Veche",
  "Eforie Nord",
  "Baile Felix",
  "Suceava",
  "Tulcea",
  "Delta Dunarii"
];

const DEFAULT_SCORING_CONFIG = {
  phone_points: 20,
  email_points: 20,
  website_points: 15,
  social_points: 10,
  google_reviews_50_points: 10,
  google_reviews_200_points: 20,
  tourist_city_points: 10,
  tourist_cities: DEFAULT_TOURIST_CITIES
};

const ROMANIA_BOUNDS = {
  south: 43.55,
  west: 20.15,
  north: 48.35,
  east: 29.85
};
function rawArgValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const COUNTRY_ALIASES = {
  ad: "Andorra",
  albania: "Albania",
  andorra: "Andorra",
  al: "Albania",
  at: "Austria",
  austria: "Austria",
  ba: "Bosnia and Herzegovina",
  be: "Belgium",
  belgia: "Belgium",
  belgium: "Belgium",
  bg: "Bulgaria",
  "bosnia and herzegovina": "Bosnia and Herzegovina",
  "bosnia si hertegovina": "Bosnia and Herzegovina",
  bosnia: "Bosnia and Herzegovina",
  ch: "Switzerland",
  cy: "Cyprus",
  cz: "Czechia",
  danemarca: "Denmark",
  denmark: "Denmark",
  de: "Germany",
  dk: "Denmark",
  ee: "Estonia",
  eg: "Egypt",
  egipt: "Egypt",
  egypt: "Egypt",
  ae: "United Arab Emirates",
  ar: "Argentina",
  argentina: "Argentina",
  bahamas: "Bahamas",
  br: "Brazil",
  brazil: "Brazil",
  brazilia: "Brazil",
  bs: "Bahamas",
  ca: "Canada",
  canada: "Canada",
  "cape verde": "Cape Verde",
  "cabo verde": "Cape Verde",
  "capul verde": "Cape Verde",
  chile: "Chile",
  cl: "Chile",
  co: "Colombia",
  colombia: "Colombia",
  "costa rica": "Costa Rica",
  cr: "Costa Rica",
  cuba: "Cuba",
  cu: "Cuba",
  cv: "Cape Verde",
  do: "Dominican Republic",
  "dominican republic": "Dominican Republic",
  "republica dominicana": "Dominican Republic",
  estonia: "Estonia",
  es: "Spain",
  fi: "Finland",
  finlanda: "Finland",
  finland: "Finland",
  fr: "France",
  germania: "Germany",
  germany: "Germany",
  gb: "United Kingdom",
  grecia: "Greece",
  greece: "Greece",
  gr: "Greece",
  id: "Indonesia",
  in: "India",
  india: "India",
  indonesia: "Indonesia",
  indonezia: "Indonesia",
  jamaica: "Jamaica",
  jm: "Jamaica",
  jp: "Japan",
  japan: "Japan",
  japonia: "Japan",
  ke: "Kenya",
  kenya: "Kenya",
  kr: "South Korea",
  "koreea de sud": "South Korea",
  bulgaria: "Bulgaria",
  cipru: "Cyprus",
  croatia: "Croatia",
  cyprus: "Cyprus",
  cehia: "Czechia",
  "czech republic": "Czechia",
  czechia: "Czechia",
  france: "France",
  franta: "France",
  hr: "Croatia",
  hu: "Hungary",
  hungary: "Hungary",
  ie: "Ireland",
  iceland: "Iceland",
  irlanda: "Ireland",
  ireland: "Ireland",
  islanda: "Iceland",
  is: "Iceland",
  it: "Italy",
  ungaria: "Hungary",
  italy: "Italy",
  italia: "Italy",
  lk: "Sri Lanka",
  kosovo: "Kosovo",
  li: "Liechtenstein",
  lt: "Lithuania",
  lu: "Luxembourg",
  lv: "Latvia",
  latvia: "Latvia",
  letonia: "Latvia",
  liechtenstein: "Liechtenstein",
  lithuania: "Lithuania",
  lituania: "Lithuania",
  luxembourg: "Luxembourg",
  luxemburg: "Luxembourg",
  madagascar: "Madagascar",
  ma: "Morocco",
  malaysia: "Malaysia",
  malaezia: "Malaysia",
  maldives: "Maldives",
  maldive: "Maldives",
  maroc: "Morocco",
  mauritius: "Mauritius",
  mc: "Monaco",
  mexico: "Mexico",
  mexic: "Mexico",
  mg: "Madagascar",
  md: "Moldova",
  me: "Montenegro",
  "macedonia de nord": "North Macedonia",
  macedonia: "North Macedonia",
  malta: "Malta",
  monaco: "Monaco",
  moldova: "Moldova",
  montenegro: "Montenegro",
  mk: "North Macedonia",
  mt: "Malta",
  mu: "Mauritius",
  muntenegru: "Montenegro",
  mv: "Maldives",
  mx: "Mexico",
  my: "Malaysia",
  na: "Namibia",
  namibia: "Namibia",
  netherlands: "Netherlands",
  nl: "Netherlands",
  no: "Norway",
  "north macedonia": "North Macedonia",
  norvegia: "Norway",
  norway: "Norway",
  olanda: "Netherlands",
  "tarile de jos": "Netherlands",
  poland: "Poland",
  polonia: "Poland",
  pl: "Poland",
  panama: "Panama",
  pa: "Panama",
  peru: "Peru",
  pe: "Peru",
  ph: "Philippines",
  philippines: "Philippines",
  filipine: "Philippines",
  pt: "Portugal",
  portugal: "Portugal",
  portugalia: "Portugal",
  "regatul unit": "United Kingdom",
  ro: "Romania",
  romania: "Romania",
  rs: "Serbia",
  "san marino": "San Marino",
  serbia: "Serbia",
  se: "Sweden",
  si: "Slovenia",
  sk: "Slovakia",
  sm: "San Marino",
  slovacia: "Slovakia",
  slovakia: "Slovakia",
  slovenia: "Slovenia",
  sg: "Singapore",
  singapore: "Singapore",
  seychelles: "Seychelles",
  sc: "Seychelles",
  "south africa": "South Africa",
  "africa de sud": "South Africa",
  "south korea": "South Korea",
  "sri lanka": "Sri Lanka",
  spain: "Spain",
  spania: "Spain",
  suedia: "Sweden",
  sweden: "Sweden",
  switzerland: "Switzerland",
  elvetia: "Switzerland",
  tanzania: "Tanzania",
  th: "Thailand",
  thailand: "Thailand",
  thailanda: "Thailand",
  tn: "Tunisia",
  tunisia: "Tunisia",
  turkey: "Turkey",
  turcia: "Turkey",
  tr: "Turkey",
  tz: "Tanzania",
  ucraina: "Ukraine",
  ua: "Ukraine",
  "united arab emirates": "United Arab Emirates",
  uae: "United Arab Emirates",
  "emiratele arabe unite": "United Arab Emirates",
  "united states": "United States",
  us: "United States",
  usa: "United States",
  "statele unite": "United States",
  sua: "United States",
  ukraine: "Ukraine",
  uk: "United Kingdom",
  "marea britanie": "United Kingdom",
  "united kingdom": "United Kingdom",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
  vn: "Vietnam",
  xk: "Kosovo"
};

function normalizeImportCountry(value = "") {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  return COUNTRY_ALIASES[key] || raw || "Romania";
}

const IMPORT_COUNTRY = normalizeImportCountry(rawArgValue("--country", process.env.TRAVEL_IMPORT_COUNTRY || "Romania"));
const COUNTRY_BOUNDS = {
  Romania: ROMANIA_BOUNDS,
  Albania: { south: 39.6, west: 19.2, north: 42.75, east: 21.1 },
  Andorra: { south: 42.4, west: 1.35, north: 42.7, east: 1.8 },
  Austria: { south: 46.35, west: 9.5, north: 49.1, east: 17.2 },
  Belgium: { south: 49.45, west: 2.5, north: 51.55, east: 6.45 },
  "Bosnia and Herzegovina": { south: 42.5, west: 15.7, north: 45.3, east: 19.7 },
  Bulgaria: { south: 41.2, west: 22.35, north: 44.25, east: 28.65 },
  Croatia: { south: 42.3, west: 13.0, north: 46.6, east: 19.45 },
  Cyprus: { south: 34.55, west: 32.2, north: 35.75, east: 34.7 },
  Czechia: { south: 48.5, west: 12.0, north: 51.1, east: 18.9 },
  Denmark: { south: 54.5, west: 7.9, north: 57.9, east: 15.3 },
  Egypt: { south: 22.0, west: 24.7, north: 31.8, east: 36.9 },
  Estonia: { south: 57.5, west: 21.7, north: 59.8, east: 28.3 },
  Finland: { south: 59.7, west: 20.5, north: 70.1, east: 31.6 },
  France: { south: 41.25, west: -5.2, north: 51.2, east: 9.7 },
  Germany: { south: 47.2, west: 5.5, north: 55.1, east: 15.1 },
  Greece: { south: 34.7, west: 19.25, north: 41.75, east: 29.75 },
  Hungary: { south: 45.7, west: 16.1, north: 48.7, east: 22.9 },
  Iceland: { south: 63.2, west: -24.7, north: 66.7, east: -13.4 },
  Ireland: { south: 51.35, west: -10.7, north: 55.45, east: -5.8 },
  Italy: { south: 36.5, west: 6.6, north: 47.2, east: 18.6 },
  Kosovo: { south: 41.8, west: 20.0, north: 43.3, east: 21.85 },
  Latvia: { south: 55.6, west: 20.8, north: 58.1, east: 28.3 },
  Liechtenstein: { south: 47.03, west: 9.47, north: 47.28, east: 9.65 },
  Lithuania: { south: 53.9, west: 20.9, north: 56.5, east: 26.9 },
  Luxembourg: { south: 49.4, west: 5.7, north: 50.2, east: 6.6 },
  Malta: { south: 35.75, west: 14.15, north: 36.1, east: 14.65 },
  Moldova: { south: 45.45, west: 26.6, north: 48.6, east: 30.2 },
  Monaco: { south: 43.72, west: 7.4, north: 43.76, east: 7.44 },
  Montenegro: { south: 41.8, west: 18.4, north: 43.6, east: 20.4 },
  Netherlands: { south: 50.7, west: 3.2, north: 53.65, east: 7.25 },
  "North Macedonia": { south: 40.8, west: 20.45, north: 42.4, east: 23.05 },
  Norway: { south: 57.8, west: 4.5, north: 71.3, east: 31.4 },
  Poland: { south: 49.0, west: 14.1, north: 54.9, east: 24.2 },
  Portugal: { south: 36.9, west: -9.6, north: 42.2, east: -6.1 },
  "San Marino": { south: 43.88, west: 12.38, north: 43.99, east: 12.52 },
  Serbia: { south: 42.2, west: 18.8, north: 46.25, east: 23.1 },
  Slovakia: { south: 47.7, west: 16.75, north: 49.65, east: 22.6 },
  Slovenia: { south: 45.4, west: 13.35, north: 46.9, east: 16.65 },
  Spain: { south: 35.8, west: -9.6, north: 43.9, east: 4.4 },
  Sweden: { south: 55.0, west: 10.9, north: 69.1, east: 24.3 },
  Switzerland: { south: 45.75, west: 5.95, north: 47.85, east: 10.55 },
  Turkey: { south: 35.8, west: 25.6, north: 42.2, east: 44.9 },
  Ukraine: { south: 44.2, west: 22.1, north: 52.4, east: 40.2 },
  "United Kingdom": { south: 49.9, west: -8.7, north: 58.7, east: 1.9 },
  Argentina: { south: -55.1, west: -73.6, north: -21.8, east: -53.6 },
  Bahamas: { south: 20.9, west: -80.5, north: 27.3, east: -72.5 },
  Brazil: { south: -33.8, west: -74.0, north: 5.3, east: -34.8 },
  Canada: { south: 41.7, west: -141.1, north: 83.2, east: -52.6 },
  "Cape Verde": { south: 14.8, west: -25.4, north: 17.3, east: -22.6 },
  Chile: { south: -56.0, west: -75.7, north: -17.5, east: -66.4 },
  Colombia: { south: -4.3, west: -79.1, north: 13.5, east: -66.8 },
  "Costa Rica": { south: 8.0, west: -85.95, north: 11.3, east: -82.5 },
  Cuba: { south: 19.6, west: -85.0, north: 23.4, east: -74.0 },
  "Dominican Republic": { south: 17.4, west: -72.1, north: 19.95, east: -68.2 },
  India: { south: 6.5, west: 68.1, north: 35.7, east: 97.4 },
  Indonesia: { south: -11.2, west: 94.7, north: 6.3, east: 141.1 },
  Jamaica: { south: 17.6, west: -78.5, north: 18.6, east: -76.2 },
  Japan: { south: 24.0, west: 122.9, north: 45.6, east: 153.9 },
  Kenya: { south: -4.8, west: 33.9, north: 5.2, east: 41.9 },
  Madagascar: { south: -25.7, west: 43.2, north: -11.9, east: 50.5 },
  Malaysia: { south: 0.85, west: 99.6, north: 7.4, east: 119.3 },
  Maldives: { south: -0.8, west: 72.5, north: 7.2, east: 73.8 },
  Mauritius: { south: -20.6, west: 57.2, north: -19.9, east: 57.9 },
  Mexico: { south: 14.4, west: -118.4, north: 32.8, east: -86.7 },
  Morocco: { south: 27.6, west: -13.3, north: 35.95, east: -1.0 },
  Namibia: { south: -29.0, west: 11.7, north: -16.9, east: 25.3 },
  Panama: { south: 7.1, west: -83.1, north: 9.7, east: -77.1 },
  Peru: { south: -18.4, west: -81.4, north: -0.03, east: -68.65 },
  Philippines: { south: 4.5, west: 116.8, north: 21.2, east: 127.0 },
  Seychelles: { south: -10.3, west: 46.2, north: -3.7, east: 56.3 },
  Singapore: { south: 1.15, west: 103.55, north: 1.5, east: 104.1 },
  "South Africa": { south: -34.9, west: 16.3, north: -22.1, east: 32.9 },
  "South Korea": { south: 33.0, west: 124.5, north: 38.7, east: 131.9 },
  "Sri Lanka": { south: 5.8, west: 79.5, north: 9.9, east: 81.95 },
  Tanzania: { south: -11.8, west: 29.3, north: -0.9, east: 40.7 },
  Thailand: { south: 5.6, west: 97.3, north: 20.5, east: 105.7 },
  Tunisia: { south: 30.2, west: 7.5, north: 37.6, east: 11.7 },
  "United Arab Emirates": { south: 22.6, west: 51.5, north: 26.1, east: 56.5 },
  "United States": { south: 18.8, west: -160.4, north: 49.4, east: -66.9 },
  Vietnam: { south: 8.2, west: 102.1, north: 23.4, east: 109.5 }
};
const COUNTRY_ISO = {
  Albania: "AL",
  Andorra: "AD",
  Austria: "AT",
  Belgium: "BE",
  "Bosnia and Herzegovina": "BA",
  Bulgaria: "BG",
  Croatia: "HR",
  Cyprus: "CY",
  Czechia: "CZ",
  Denmark: "DK",
  Egypt: "EG",
  Estonia: "EE",
  Finland: "FI",
  France: "FR",
  Germany: "DE",
  Greece: "GR",
  Hungary: "HU",
  Iceland: "IS",
  Ireland: "IE",
  Italy: "IT",
  Kosovo: "XK",
  Latvia: "LV",
  Liechtenstein: "LI",
  Lithuania: "LT",
  Luxembourg: "LU",
  Malta: "MT",
  Moldova: "MD",
  Monaco: "MC",
  Montenegro: "ME",
  Netherlands: "NL",
  "North Macedonia": "MK",
  Norway: "NO",
  Poland: "PL",
  Portugal: "PT",
  Romania: "RO",
  "San Marino": "SM",
  Serbia: "RS",
  Slovakia: "SK",
  Slovenia: "SI",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Turkey: "TR",
  Ukraine: "UA",
  "United Kingdom": "GB",
  Argentina: "AR",
  Bahamas: "BS",
  Brazil: "BR",
  Canada: "CA",
  "Cape Verde": "CV",
  Chile: "CL",
  Colombia: "CO",
  "Costa Rica": "CR",
  Cuba: "CU",
  "Dominican Republic": "DO",
  India: "IN",
  Indonesia: "ID",
  Jamaica: "JM",
  Japan: "JP",
  Kenya: "KE",
  Madagascar: "MG",
  Malaysia: "MY",
  Maldives: "MV",
  Mauritius: "MU",
  Mexico: "MX",
  Morocco: "MA",
  Namibia: "NA",
  Panama: "PA",
  Peru: "PE",
  Philippines: "PH",
  Seychelles: "SC",
  Singapore: "SG",
  "South Africa": "ZA",
  "South Korea": "KR",
  "Sri Lanka": "LK",
  Tanzania: "TZ",
  Thailand: "TH",
  Tunisia: "TN",
  "United Arab Emirates": "AE",
  "United States": "US",
  Vietnam: "VN"
};

const HOTSPOT_BBOXES = [
  { name: "Bucuresti-Ilfov", south: 44.25, west: 25.75, north: 44.7, east: 26.35 },
  { name: "Brasov-Bran-Sinaia", south: 45.25, west: 25.0, north: 45.9, east: 26.15 },
  { name: "Sibiu", south: 45.55, west: 23.65, north: 46.15, east: 24.45 },
  { name: "Cluj", south: 46.55, west: 23.25, north: 47.0, east: 24.1 },
  { name: "Constanta-Litoral", south: 43.65, west: 28.35, north: 44.35, east: 29.05 },
  { name: "Oradea-Baile-Felix", south: 46.85, west: 21.75, north: 47.25, east: 22.25 },
  { name: "Iasi", south: 46.9, west: 27.15, north: 47.45, east: 27.85 },
  { name: "Suceava-Bucovina", south: 47.2, west: 25.45, north: 47.95, east: 26.6 },
  { name: "Maramures", south: 47.45, west: 23.2, north: 48.1, east: 24.55 },
  { name: "Delta-Dunarii", south: 44.65, west: 28.45, north: 45.35, east: 29.75 },
  { name: "Timisoara", south: 45.55, west: 20.9, north: 46.0, east: 21.6 },
  { name: "Sighisoara-Targu-Mures", south: 46.0, west: 24.35, north: 46.75, east: 25.1 },
  { name: "Alba-Hunedoara", south: 45.65, west: 22.6, north: 46.35, east: 23.9 }
];

const COUNTRY_HOTSPOT_BBOXES = {
  Romania: HOTSPOT_BBOXES,
  Argentina: [
    { name: "Buenos Aires", south: -34.75, west: -58.65, north: -34.45, east: -58.25 },
    { name: "Bariloche", south: -41.25, west: -71.55, north: -40.95, east: -71.15 },
    { name: "Mendoza", south: -33.05, west: -68.95, north: -32.75, east: -68.65 },
    { name: "Ushuaia", south: -54.95, west: -68.45, north: -54.75, east: -68.15 },
    { name: "Iguazu", south: -25.8, west: -54.65, north: -25.55, east: -54.45 }
  ],
  Bahamas: [
    { name: "Nassau", south: 25.0, west: -77.55, north: 25.15, east: -77.25 },
    { name: "Freeport", south: 26.45, west: -78.8, north: 26.6, east: -78.55 },
    { name: "Exuma", south: 23.45, west: -76.0, north: 23.75, east: -75.6 }
  ],
  Brazil: [
    { name: "Rio de Janeiro", south: -23.05, west: -43.8, north: -22.7, east: -43.1 },
    { name: "Sao Paulo", south: -23.75, west: -46.85, north: -23.35, east: -46.35 },
    { name: "Salvador", south: -13.1, west: -38.65, north: -12.8, east: -38.35 },
    { name: "Florianopolis", south: -27.85, west: -48.75, north: -27.35, east: -48.35 },
    { name: "Foz do Iguacu", south: -25.65, west: -54.65, north: -25.35, east: -54.35 }
  ],
  Canada: [
    { name: "Vancouver", south: 49.05, west: -123.35, north: 49.4, east: -122.9 },
    { name: "Toronto", south: 43.55, west: -79.7, north: 43.85, east: -79.15 },
    { name: "Montreal", south: 45.4, west: -73.75, north: 45.65, east: -73.45 },
    { name: "Banff", south: 51.05, west: -115.75, north: 51.3, east: -115.45 },
    { name: "Quebec City", south: 46.7, west: -71.35, north: 46.95, east: -71.1 }
  ],
  "Cape Verde": [
    { name: "Sal", south: 16.55, west: -22.95, north: 16.85, east: -22.85 },
    { name: "Boa Vista", south: 15.95, west: -22.95, north: 16.25, east: -22.65 },
    { name: "Santiago", south: 14.85, west: -23.75, north: 15.35, east: -23.4 }
  ],
  Chile: [
    { name: "Santiago", south: -33.65, west: -70.85, north: -33.25, east: -70.45 },
    { name: "Valparaiso", south: -33.15, west: -71.75, north: -32.9, east: -71.45 },
    { name: "Atacama", south: -23.05, west: -68.4, north: -22.75, east: -68.1 },
    { name: "Puerto Varas", south: -41.45, west: -73.1, north: -41.25, east: -72.85 }
  ],
  Colombia: [
    { name: "Bogota", south: 4.45, west: -74.25, north: 4.85, east: -73.95 },
    { name: "Cartagena", south: 10.25, west: -75.65, north: 10.55, east: -75.35 },
    { name: "Medellin", south: 6.1, west: -75.7, north: 6.4, east: -75.45 },
    { name: "Santa Marta", south: 11.1, west: -74.35, north: 11.35, east: -74.1 }
  ],
  "Costa Rica": [
    { name: "San Jose", south: 9.8, west: -84.2, north: 10.05, east: -83.9 },
    { name: "Guanacaste", south: 10.2, west: -85.9, north: 10.75, east: -85.35 },
    { name: "Manuel Antonio", south: 9.25, west: -84.25, north: 9.55, east: -83.95 },
    { name: "Arenal", south: 10.3, west: -84.85, north: 10.6, east: -84.55 }
  ],
  Cuba: [
    { name: "Havana", south: 23.0, west: -82.55, north: 23.25, east: -82.25 },
    { name: "Varadero", south: 23.05, west: -81.45, north: 23.25, east: -81.1 },
    { name: "Trinidad", south: 21.7, west: -80.1, north: 21.9, east: -79.85 }
  ],
  "Dominican Republic": [
    { name: "Punta Cana", south: 18.45, west: -68.6, north: 18.85, east: -68.25 },
    { name: "Santo Domingo", south: 18.35, west: -70.1, north: 18.65, east: -69.75 },
    { name: "Puerto Plata", south: 19.65, west: -70.85, north: 19.9, east: -70.55 },
    { name: "Samana", south: 19.15, west: -69.45, north: 19.35, east: -69.1 }
  ],
  Egypt: [
    { name: "Cairo-Giza", south: 29.85, west: 30.8, north: 30.25, east: 31.45 },
    { name: "Alexandria", south: 31.05, west: 29.75, north: 31.35, east: 30.15 },
    { name: "Luxor", south: 25.55, west: 32.45, north: 25.85, east: 32.8 },
    { name: "Aswan", south: 23.9, west: 32.75, north: 24.25, east: 33.1 },
    { name: "Hurghada", south: 27.0, west: 33.65, north: 27.35, east: 34.0 },
    { name: "Sharm El Sheikh", south: 27.75, west: 34.1, north: 28.1, east: 34.45 },
    { name: "Dahab", south: 28.4, west: 34.35, north: 28.65, east: 34.65 },
    { name: "Marsa Alam", south: 25.0, west: 34.75, north: 25.25, east: 35.05 }
  ],
  India: [
    { name: "Goa", south: 15.0, west: 73.65, north: 15.8, east: 74.25 },
    { name: "Delhi", south: 28.35, west: 76.85, north: 28.9, east: 77.45 },
    { name: "Mumbai", south: 18.85, west: 72.75, north: 19.35, east: 73.1 },
    { name: "Jaipur", south: 26.75, west: 75.65, north: 27.05, east: 76.05 },
    { name: "Kochi", south: 9.8, west: 76.15, north: 10.15, east: 76.45 }
  ],
  Indonesia: [
    { name: "Bali", south: -8.9, west: 114.4, north: -8.05, east: 115.75 },
    { name: "Jakarta", south: -6.45, west: 106.6, north: -6.05, east: 107.05 },
    { name: "Yogyakarta", south: -8.05, west: 110.2, north: -7.55, east: 110.6 },
    { name: "Lombok", south: -8.95, west: 115.8, north: -8.15, east: 116.7 },
    { name: "Labuan Bajo", south: -8.75, west: 119.75, north: -8.35, east: 120.15 }
  ],
  Jamaica: [
    { name: "Montego Bay", south: 18.35, west: -77.95, north: 18.6, east: -77.75 },
    { name: "Negril", south: 18.25, west: -78.45, north: 18.35, east: -78.25 },
    { name: "Kingston", south: 17.9, west: -76.9, north: 18.1, east: -76.7 }
  ],
  Japan: [
    { name: "Tokyo", south: 35.45, west: 139.45, north: 35.9, east: 139.95 },
    { name: "Kyoto-Osaka", south: 34.55, west: 135.25, north: 35.15, east: 136.05 },
    { name: "Sapporo", south: 42.85, west: 141.1, north: 43.25, east: 141.6 },
    { name: "Okinawa", south: 26.0, west: 127.55, north: 26.45, east: 128.1 },
    { name: "Fuji-Hakone", south: 35.0, west: 138.7, north: 35.45, east: 139.2 }
  ],
  Kenya: [
    { name: "Nairobi", south: -1.45, west: 36.65, north: -1.15, east: 37.0 },
    { name: "Mombasa", south: -4.15, west: 39.55, north: -3.9, east: 39.85 },
    { name: "Diani", south: -4.45, west: 39.45, north: -4.2, east: 39.65 },
    { name: "Masai Mara", south: -1.8, west: 34.8, north: -1.0, east: 35.6 }
  ],
  Madagascar: [
    { name: "Antananarivo", south: -18.95, west: 47.4, north: -18.75, east: 47.65 },
    { name: "Nosy Be", south: -13.45, west: 48.15, north: -13.2, east: 48.4 },
    { name: "Toamasina", south: -18.25, west: 49.3, north: -18.05, east: 49.45 }
  ],
  Malaysia: [
    { name: "Kuala Lumpur", south: 2.9, west: 101.45, north: 3.35, east: 101.85 },
    { name: "Penang", south: 5.25, west: 100.15, north: 5.55, east: 100.45 },
    { name: "Langkawi", south: 6.2, west: 99.65, north: 6.55, east: 100.0 },
    { name: "Kota Kinabalu", south: 5.85, west: 115.95, north: 6.15, east: 116.25 }
  ],
  Maldives: [
    { name: "Male", south: 4.0, west: 73.35, north: 4.3, east: 73.65 },
    { name: "Ari Atoll", south: 3.55, west: 72.65, north: 4.35, east: 73.05 },
    { name: "Baa Atoll", south: 5.05, west: 72.8, north: 5.45, east: 73.15 }
  ],
  Mauritius: [
    { name: "North Coast", south: -20.1, west: 57.45, north: -19.95, east: 57.65 },
    { name: "Port Louis", south: -20.25, west: 57.4, north: -20.1, east: 57.6 },
    { name: "Flic en Flac", south: -20.35, west: 57.3, north: -20.25, east: 57.4 },
    { name: "Le Morne", south: -20.5, west: 57.25, north: -20.35, east: 57.4 }
  ],
  Mexico: [
    { name: "Cancun-Riviera Maya", south: 20.2, west: -87.6, north: 21.3, east: -86.65 },
    { name: "Mexico City", south: 19.2, west: -99.35, north: 19.6, east: -98.9 },
    { name: "Los Cabos", south: 22.85, west: -109.95, north: 23.15, east: -109.55 },
    { name: "Puerto Vallarta", south: 20.55, west: -105.4, north: 20.8, east: -105.15 },
    { name: "Oaxaca", south: 16.9, west: -97.0, north: 17.2, east: -96.6 }
  ],
  Morocco: [
    { name: "Marrakech", south: 31.45, west: -8.15, north: 31.75, east: -7.75 },
    { name: "Casablanca", south: 33.45, west: -7.8, north: 33.75, east: -7.45 },
    { name: "Agadir", south: 30.25, west: -9.75, north: 30.55, east: -9.35 },
    { name: "Fes", south: 33.9, west: -5.15, north: 34.15, east: -4.85 },
    { name: "Essaouira", south: 31.35, west: -9.9, north: 31.65, east: -9.6 }
  ],
  Namibia: [
    { name: "Windhoek", south: -22.75, west: 17.0, north: -22.45, east: 17.25 },
    { name: "Swakopmund", south: -22.75, west: 14.45, north: -22.55, east: 14.6 },
    { name: "Etosha", south: -19.4, west: 14.9, north: -18.5, east: 17.2 }
  ],
  Panama: [
    { name: "Panama City", south: 8.85, west: -79.65, north: 9.1, east: -79.35 },
    { name: "Bocas del Toro", south: 9.25, west: -82.35, north: 9.45, east: -82.15 },
    { name: "Boquete", south: 8.65, west: -82.55, north: 8.85, east: -82.35 }
  ],
  Peru: [
    { name: "Lima", south: -12.25, west: -77.25, north: -11.85, east: -76.85 },
    { name: "Cusco", south: -13.65, west: -72.1, north: -13.4, east: -71.8 },
    { name: "Machu Picchu", south: -13.25, west: -72.65, north: -13.05, east: -72.45 },
    { name: "Arequipa", south: -16.55, west: -71.65, north: -16.25, east: -71.35 }
  ],
  Philippines: [
    { name: "Manila", south: 14.35, west: 120.85, north: 14.8, east: 121.15 },
    { name: "Cebu", south: 10.15, west: 123.75, north: 10.45, east: 124.05 },
    { name: "Boracay", south: 11.9, west: 121.85, north: 12.05, east: 122.1 },
    { name: "El Nido", south: 11.0, west: 119.2, north: 11.35, east: 119.6 },
    { name: "Siargao", south: 9.7, west: 125.85, north: 10.1, east: 126.2 }
  ],
  Seychelles: [
    { name: "Mahe", south: -4.85, west: 55.35, north: -4.55, east: 55.55 },
    { name: "Praslin", south: -4.4, west: 55.65, north: -4.25, east: 55.85 },
    { name: "La Digue", south: -4.4, west: 55.8, north: -4.3, east: 55.9 }
  ],
  Singapore: [
    { name: "Singapore", south: 1.15, west: 103.55, north: 1.5, east: 104.1 }
  ],
  "South Africa": [
    { name: "Cape Town", south: -34.2, west: 18.25, north: -33.75, east: 18.75 },
    { name: "Johannesburg", south: -26.35, west: 27.8, north: -25.95, east: 28.25 },
    { name: "Durban", south: -30.05, west: 30.85, north: -29.75, east: 31.15 },
    { name: "Garden Route", south: -34.1, west: 22.2, north: -33.7, east: 23.2 },
    { name: "Kruger", south: -25.6, west: 30.8, north: -24.8, east: 32.2 }
  ],
  "South Korea": [
    { name: "Seoul", south: 37.35, west: 126.75, north: 37.75, east: 127.2 },
    { name: "Busan", south: 35.0, west: 128.9, north: 35.35, east: 129.25 },
    { name: "Jeju", south: 33.2, west: 126.1, north: 33.6, east: 126.95 }
  ],
  "Sri Lanka": [
    { name: "Colombo", south: 6.75, west: 79.75, north: 7.05, east: 80.0 },
    { name: "Galle", south: 5.95, west: 80.05, north: 6.2, east: 80.35 },
    { name: "Kandy", south: 7.15, west: 80.5, north: 7.45, east: 80.8 },
    { name: "Ella", south: 6.75, west: 80.95, north: 7.0, east: 81.15 }
  ],
  Tanzania: [
    { name: "Zanzibar", south: -6.4, west: 39.15, north: -5.7, east: 39.55 },
    { name: "Dar es Salaam", south: -7.0, west: 39.0, north: -6.6, east: 39.45 },
    { name: "Arusha", south: -3.55, west: 36.55, north: -3.25, east: 36.9 },
    { name: "Serengeti", south: -3.0, west: 34.5, north: -1.5, east: 35.5 }
  ],
  Thailand: [
    { name: "Bangkok", south: 13.55, west: 100.3, north: 13.95, east: 100.9 },
    { name: "Phuket", south: 7.75, west: 98.2, north: 8.25, east: 98.55 },
    { name: "Chiang Mai", south: 18.6, west: 98.8, north: 19.05, east: 99.15 },
    { name: "Pattaya", south: 12.75, west: 100.8, north: 13.1, east: 101.1 },
    { name: "Koh Samui", south: 9.35, west: 99.85, north: 9.65, east: 100.1 }
  ],
  Tunisia: [
    { name: "Tunis", south: 36.65, west: 10.05, north: 36.95, east: 10.35 },
    { name: "Sousse", south: 35.75, west: 10.45, north: 36.0, east: 10.75 },
    { name: "Djerba", south: 33.65, west: 10.65, north: 33.95, east: 11.05 },
    { name: "Hammamet", south: 36.35, west: 10.45, north: 36.55, east: 10.75 }
  ],
  "United Arab Emirates": [
    { name: "Dubai", south: 24.8, west: 54.9, north: 25.35, east: 55.6 },
    { name: "Abu Dhabi", south: 24.25, west: 54.25, north: 24.65, east: 54.75 },
    { name: "Ras Al Khaimah", south: 25.65, west: 55.85, north: 26.05, east: 56.15 }
  ],
  "United States": [
    { name: "New York", south: 40.5, west: -74.25, north: 40.95, east: -73.7 },
    { name: "Orlando", south: 28.25, west: -81.6, north: 28.7, east: -81.15 },
    { name: "Miami", south: 25.6, west: -80.45, north: 26.05, east: -80.1 },
    { name: "Las Vegas", south: 35.95, west: -115.35, north: 36.35, east: -114.95 },
    { name: "Los Angeles", south: 33.75, west: -118.7, north: 34.25, east: -118.15 },
    { name: "Honolulu", south: 21.2, west: -158.1, north: 21.45, east: -157.65 }
  ],
  Vietnam: [
    { name: "Hanoi", south: 20.85, west: 105.65, north: 21.15, east: 106.05 },
    { name: "Ho Chi Minh City", south: 10.55, west: 106.45, north: 10.95, east: 106.95 },
    { name: "Da Nang-Hoi An", south: 15.8, west: 107.85, north: 16.2, east: 108.45 },
    { name: "Nha Trang", south: 12.15, west: 109.05, north: 12.35, east: 109.35 },
    { name: "Phu Quoc", south: 10.0, west: 103.8, north: 10.45, east: 104.1 }
  ]
};

const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

function parseArgs(argv = []) {
  const args = {
    bbox: null,
    cols: 5,
    companyId: 0,
    dryRun: false,
    endpoints: DEFAULT_ENDPOINTS,
    limit: 0,
    maxCells: 0,
    noAreaFilter: false,
    preset: "",
    rows: 5,
    spreadHotspots: false,
    timeoutMs: 90_000
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (item === "--spread-hotspots") {
      args.spreadHotspots = true;
      continue;
    }
    if (item === "--no-area-filter") {
      args.noAreaFilter = true;
      continue;
    }

    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "bbox") args.bbox = rawValue;
    if (key === "cols") args.cols = Math.max(1, Number(rawValue) || args.cols);
    if (key === "company-id") args.companyId = Number(rawValue) || 0;
    if (key === "endpoint") args.endpoints = rawValue ? [rawValue] : args.endpoints;
    if (key === "limit") args.limit = Math.max(0, Number(rawValue) || 0);
    if (key === "max-cells") args.maxCells = Math.max(0, Number(rawValue) || 0);
    if (key === "preset") args.preset = safeText(rawValue).toLowerCase();
    if (key === "rows") args.rows = Math.max(1, Number(rawValue) || args.rows);
    if (key === "timeout-ms") args.timeoutMs = Math.max(10_000, Number(rawValue) || args.timeoutMs);
  }

  return args;
}

function safeText(value = "") {
  return String(value ?? "").trim();
}

function stripDiacritics(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șȘ]/g, "s")
    .replace(/[țȚ]/g, "t");
}

function normalizeKey(value = "") {
  return stripDiacritics(safeText(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value = "") {
  let digits = safeText(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("40") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function normalizeWebsite(value = "") {
  let text = safeText(value).toLowerCase();
  if (!text) return "";
  try {
    const parsed = new URL(text.startsWith("http") ? text : `https://${text}`);
    text = `${parsed.hostname}${parsed.pathname || ""}`;
  } catch {
    text = text.replace(/^https?:\/\//, "");
  }
  return stripDiacritics(text)
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, "");
}

function firstTag(tags = {}, names = []) {
  for (const name of names) {
    const value = safeText(tags[name]);
    if (value) return value.split(";").map(safeText).find(Boolean) || value;
  }
  return "";
}

function parseTouristCities(value = DEFAULT_TOURIST_CITIES) {
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(safeText).filter(Boolean);
    } catch {}
  }
  return String(value || "")
    .split(/[\n,;]/)
    .map(safeText)
    .filter(Boolean);
}

function loadScoringConfig(companyId) {
  const row = db.prepare("SELECT * FROM travel_scoring_settings WHERE company_id=?").get(companyId);
  if (!row) return DEFAULT_SCORING_CONFIG;
  return {
    phone_points: Number(row.phone_points) || DEFAULT_SCORING_CONFIG.phone_points,
    email_points: Number(row.email_points) || DEFAULT_SCORING_CONFIG.email_points,
    website_points: Number(row.website_points) || DEFAULT_SCORING_CONFIG.website_points,
    social_points: Number(row.social_points) || DEFAULT_SCORING_CONFIG.social_points,
    google_reviews_50_points: Number(row.google_reviews_50_points) || DEFAULT_SCORING_CONFIG.google_reviews_50_points,
    google_reviews_200_points: Number(row.google_reviews_200_points) || DEFAULT_SCORING_CONFIG.google_reviews_200_points,
    tourist_city_points: Number(row.tourist_city_points) || DEFAULT_SCORING_CONFIG.tourist_city_points,
    tourist_cities: parseTouristCities(row.tourist_cities || DEFAULT_SCORING_CONFIG.tourist_cities)
  };
}

function calculateScore(candidate, config) {
  let score = 0;
  const touristCities = new Set(config.tourist_cities.map(normalizeKey));
  const reviews = Number(candidate.google_reviews || 0);
  if (candidate.phone) score += config.phone_points;
  if (candidate.email) score += config.email_points;
  if (candidate.website) score += config.website_points;
  if (candidate.facebook || candidate.instagram) score += config.social_points;
  if (reviews > 200) score += config.google_reviews_200_points;
  else if (reviews > 50) score += config.google_reviews_50_points;
  if (candidate.city && touristCities.has(normalizeKey(candidate.city))) score += config.tourist_city_points;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function addressFromTags(tags = {}) {
  const street = firstTag(tags, ["addr:street"]);
  const houseNumber = firstTag(tags, ["addr:housenumber"]);
  const postcode = firstTag(tags, ["addr:postcode"]);
  const city = firstTag(tags, ["addr:city", "addr:town", "addr:village", "addr:municipality", "addr:place"]);
  return [
    [street, houseNumber].filter(Boolean).join(" "),
    postcode,
    city
  ].filter(Boolean).join(", ");
}

function latLonFromElement(element = {}) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  return {
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lon: Number.isFinite(Number(lon)) ? Number(lon) : null
  };
}

function normalizeOsmElement(element = {}, scoringConfig) {
  const tags = element.tags || {};
  const tourism = safeText(tags.tourism);
  const name = firstTag(tags, ["name", "name:ro", "official_name", "brand"]);
  const city = firstTag(tags, [
    "addr:city",
    "addr:town",
    "addr:village",
    "addr:municipality",
    "addr:place",
    "is_in:city",
    "is_in:town",
    "is_in:village"
  ]);
  const county = firstTag(tags, ["addr:county", "is_in:county", "addr:district", "addr:region"]);
  const phone = firstTag(tags, ["contact:phone", "phone", "mobile", "contact:mobile"]);
  const email = firstTag(tags, ["contact:email", "email"]);
  const website = firstTag(tags, ["contact:website", "website", "url"]);
  const facebook = firstTag(tags, ["contact:facebook", "facebook", "facebook:page", "contact:facebook:page"]);
  const instagram = firstTag(tags, ["contact:instagram", "instagram"]);
  const address = addressFromTags(tags);
  const { lat, lon } = latLonFromElement(element);

  if (!name) return { error: "missing_name" };
  if (!city && !phone && !email && !website && !facebook && !instagram) {
    return { error: "missing_city_or_contact" };
  }

  const osmPath = `${element.type}/${element.id}`;
  const notes = [
    "Import OpenStreetMap",
    `osm=${osmPath}`,
    `osm_url=https://www.openstreetmap.org/${osmPath}`,
    tourism ? `tourism=${tourism}` : "",
    lat !== null ? `lat=${lat}` : "",
    lon !== null ? `lon=${lon}` : ""
  ].filter(Boolean).join("; ");

  const candidate = {
    name,
    property_type: PROPERTY_TYPES[tourism] || tourism || "cazare",
    country: IMPORT_COUNTRY,
    city,
    county,
    address,
    phone,
    email,
    website,
    facebook,
    instagram,
    google_rating: null,
    google_reviews: 0,
    source: "osm",
    status: "nou",
    notes,
    next_follow_up_at: null,
    osm_key: osmPath
  };
  candidate.score = calculateScore(candidate, scoringConfig);
  return { candidate };
}

function loadKeySets(companyId) {
  const keySets = {
    email: new Set(),
    nameCity: new Set(),
    osm: new Set(),
    phone: new Set(),
    website: new Set()
  };

  const rows = db.prepare(`
    SELECT name, country, city, phone, email, website, notes
    FROM travel_leads
    WHERE company_id=?
    UNION ALL
    SELECT name, country, city, phone, email, website, NULL AS notes
    FROM travel_properties
    WHERE company_id=?
  `).all(companyId, companyId);

  for (const row of rows) addKeys(keySets, row);
  return keySets;
}

function addKeys(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const nameCity = normalizeNameCity(row.name, row.city, row.country);
  if (phone) keySets.phone.add(phone);
  if (email) keySets.email.add(email);
  if (website) keySets.website.add(website);
  if (nameCity) keySets.nameCity.add(nameCity);
  const osmMatch = safeText(row.notes).match(/osm=(node|way|relation)\/(\d+)/);
  if (osmMatch) keySets.osm.add(`${osmMatch[1]}/${osmMatch[2]}`);
  if (row.osm_key) keySets.osm.add(row.osm_key);
}

function normalizeNameCity(name = "", city = "", country = IMPORT_COUNTRY) {
  const normalizedName = normalizeKey(name);
  const normalizedCity = normalizeKey(city);
  const normalizedCountry = normalizeKey(country || IMPORT_COUNTRY);
  return normalizedName && normalizedCity ? `${normalizedCountry}|${normalizedName}|${normalizedCity}` : "";
}

function duplicateReason(keySets, row = {}) {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const nameCity = normalizeNameCity(row.name, row.city, row.country);
  if (row.osm_key && keySets.osm.has(row.osm_key)) return "osm_id";
  if (phone && keySets.phone.has(phone)) return "phone";
  if (email && keySets.email.has(email)) return "email";
  if (website && keySets.website.has(website)) return "website";
  if (nameCity && keySets.nameCity.has(nameCity)) return "name_city";
  return "";
}

function parseBbox(value = "") {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [south, west, north, east] = parts;
  return { south, west, north, east };
}

function buildGrid(bounds, rows, cols) {
  const cells = [];
  const latStep = (bounds.north - bounds.south) / rows;
  const lonStep = (bounds.east - bounds.west) / cols;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        south: Number((bounds.south + row * latStep).toFixed(5)),
        west: Number((bounds.west + col * lonStep).toFixed(5)),
        north: Number((bounds.south + (row + 1) * latStep).toFixed(5)),
        east: Number((bounds.west + (col + 1) * lonStep).toFixed(5))
      });
    }
  }
  return cells;
}

function overpassQuery(cell, { noAreaFilter = false } = {}) {
  const tagPattern = TOURISM_TAGS.join("|");
  const bbox = `${cell.south},${cell.west},${cell.north},${cell.east}`;
  const iso = noAreaFilter ? "" : COUNTRY_ISO[IMPORT_COUNTRY];
  const areaPrefix = iso ? `area["ISO3166-1"="${iso}"][admin_level=2]->.searchArea;\n` : "";
  const areaFilter = iso ? "(area.searchArea)" : "";
  return `[out:json][timeout:80];
${areaPrefix}
(
  node["tourism"~"^(${tagPattern})$"]${areaFilter}(${bbox});
  way["tourism"~"^(${tagPattern})$"]${areaFilter}(${bbox});
  relation["tourism"~"^(${tagPattern})$"]${areaFilter}(${bbox});
);
out tags center qt;`;
}

async function fetchOverpass(query, endpoints, timeoutMs) {
  const errors = [];
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestUrl = `${endpoint}?${new URLSearchParams({ data: query }).toString()}`;
      const response = await fetch(requestUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "NexoraTravelOSMImport/1.0"
        },
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 240)}`);
      }
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(errors.join(" | "));
}

function selectCompany(companyId) {
  if (companyId) {
    const selected = db.prepare("SELECT id, name FROM companies WHERE id=?").get(companyId);
    if (selected) return selected;
  }
  return db.prepare(`
    SELECT id, name
    FROM companies
    WHERE status='active'
    ORDER BY id
    LIMIT 1
  `).get() || db.prepare("SELECT id, name FROM companies ORDER BY id LIMIT 1").get();
}

function insertCandidates(companyId, candidates = []) {
  const insert = db.prepare(`
    INSERT INTO travel_leads (
      company_id, name, property_type, country, city, county, address, phone, email, website,
      facebook, instagram, google_rating, google_reviews, source, status, score,
      notes, next_follow_up_at, created_at, updated_at
    )
    VALUES (
      @company_id, @name, @property_type, @country, @city, @county, @address, @phone, @email, @website,
      @facebook, @instagram, @google_rating, @google_reviews, @source, @status, @score,
      @notes, @next_follow_up_at, datetime('now'), datetime('now')
    )
  `);

  const run = db.transaction((rows) => {
    const ids = [];
    for (const row of rows) {
      const result = insert.run({ company_id: companyId, ...row });
      ids.push(result.lastInsertRowid);
    }
    return ids;
  });

  return run(candidates);
}

function writeReport(report) {
  const reportDir = path.join(process.cwd(), "utile", "rapoarte", "importuri");
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `osm-travel-import-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  migrate();

  const company = selectCompany(args.companyId);
  if (!company) throw new Error("Nu exista nicio companie in baza de date.");

  const scoringConfig = loadScoringConfig(company.id);
  const keySets = loadKeySets(company.id);
  const customBbox = args.bbox ? parseBbox(args.bbox) : null;
  let cells = customBbox ? [customBbox] : buildGrid(COUNTRY_BOUNDS[IMPORT_COUNTRY] || ROMANIA_BOUNDS, args.rows, args.cols);
  if (!customBbox && args.preset === "hotspots") {
    const hotspotCells = COUNTRY_HOTSPOT_BBOXES[IMPORT_COUNTRY] || [];
    if (hotspotCells.length) cells = hotspotCells;
  }
  if (args.maxCells) cells = cells.slice(0, args.maxCells);

  const stats = {
    company_id: company.id,
    company_name: company.name,
    country: IMPORT_COUNTRY,
    source: "osm",
    dry_run: args.dryRun,
    no_area_filter: args.noAreaFilter,
    spread_hotspots: args.spreadHotspots,
    cells_total: cells.length,
    cells_ok: 0,
    cells_failed: 0,
    fetched: 0,
    normalized: 0,
    created: 0,
    skipped_duplicates: 0,
    skipped_invalid: 0,
    duplicate_reasons: {},
    invalid_reasons: {},
    errors: [],
    samples: []
  };

  const candidates = [];
  const seenElements = new Set();
  const perCellCandidateLimit = args.spreadHotspots && args.limit && args.preset === "hotspots"
    ? Math.max(1, Math.ceil(args.limit / Math.max(1, cells.length)))
    : 0;

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (args.limit && candidates.length >= args.limit) break;
    const label = `${index + 1}/${cells.length} ${cell.south},${cell.west},${cell.north},${cell.east}`;
    console.log(`OSM cell ${label}`);
    let cellCandidates = 0;
    try {
      const data = await fetchOverpass(overpassQuery(cell, { noAreaFilter: args.noAreaFilter }), args.endpoints, args.timeoutMs);
      const elements = Array.isArray(data.elements) ? data.elements : [];
      stats.cells_ok += 1;
      stats.fetched += elements.length;

      for (const element of elements) {
        const elementKey = `${element.type}/${element.id}`;
        if (seenElements.has(elementKey)) continue;
        seenElements.add(elementKey);

        const { candidate, error } = normalizeOsmElement(element, scoringConfig);
        if (error) {
          stats.skipped_invalid += 1;
          stats.invalid_reasons[error] = (stats.invalid_reasons[error] || 0) + 1;
          continue;
        }

        const reason = duplicateReason(keySets, candidate);
        if (reason) {
          stats.skipped_duplicates += 1;
          stats.duplicate_reasons[reason] = (stats.duplicate_reasons[reason] || 0) + 1;
          continue;
        }

        candidates.push(candidate);
        cellCandidates += 1;
        addKeys(keySets, candidate);
        stats.normalized += 1;
        if (stats.samples.length < 20) {
          stats.samples.push({
            name: candidate.name,
            city: candidate.city,
            county: candidate.county,
            property_type: candidate.property_type,
            phone: candidate.phone,
            email: candidate.email,
            website: candidate.website,
            score: candidate.score
          });
        }
        if (args.limit && candidates.length >= args.limit) break;
        if (perCellCandidateLimit && cellCandidates >= perCellCandidateLimit) break;
      }
    } catch (error) {
      stats.cells_failed += 1;
      stats.errors.push({ cell, error: error.message });
      console.error(`OSM cell failed: ${label}`);
      console.error(error.message);
    }
  }

  if (!args.dryRun && candidates.length) {
    const insertedIds = insertCandidates(company.id, candidates);
    stats.created = insertedIds.length;
    stats.first_inserted_id = insertedIds[0] || null;
    stats.last_inserted_id = insertedIds.at(-1) || null;
  }

  const reportPath = writeReport(stats);
  stats.report_path = reportPath;

  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
