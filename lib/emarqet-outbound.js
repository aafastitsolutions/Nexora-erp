import fs from "node:fs";
import readline from "node:readline";

export const EMARQET_OUTBOUND_SEGMENTS = [
  {
    key: "auto_dealers",
    label: "Dealeri auto",
    caen: ["4511", "4519"],
    verticalCode: "auto",
    partnerType: "auto_dealer",
    templateKey: "auto_dealer"
  },
  {
    key: "auto_services_parts",
    label: "Service si piese auto",
    caen: ["4520", "4532"],
    verticalCode: "piese_auto",
    partnerType: "auto_services",
    templateKey: "auto_services"
  },
  {
    key: "real_estate_agencies",
    label: "Agentii imobiliare",
    caen: ["6831", "6832"],
    verticalCode: "imobiliare",
    partnerType: "real_estate_agency",
    templateKey: "real_estate"
  },
  {
    key: "tourism_accommodation",
    label: "Cazare si turism",
    caen: ["5510", "5520", "5530", "5590", "7911", "7912"],
    verticalCode: "turism",
    partnerType: "tourism_partner",
    templateKey: "tourism"
  },
  {
    key: "retail_online",
    label: "Magazine online si retail",
    caen: ["4791", "4719", "4741", "4742", "4754", "4759"],
    verticalCode: "produse",
    partnerType: "merchant",
    templateKey: "retail"
  },
  {
    key: "local_services",
    label: "Servicii locale",
    caen: ["8121", "8122", "8130", "9602", "9609"],
    verticalCode: "servicii",
    partnerType: "local_services",
    templateKey: "services"
  }
];

export const EMARQET_BUSINESS_EMAIL_ROLES = [
  "admin",
  "asistenta",
  "booking",
  "comenzi",
  "contact",
  "hello",
  "info",
  "marketing",
  "office",
  "programari",
  "receptie",
  "rezervari",
  "sales",
  "secretariat",
  "suport",
  "support",
  "vanzari"
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.ro",
  "icloud.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "proton.me",
  "protonmail.com"
]);

export function safeText(value = "") {
  return String(value ?? "").trim();
}

export function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

export function normalizeCui(value = "") {
  return safeText(value).toUpperCase().replace(/^RO\s*/i, "").replace(/[^0-9A-Z]/g, "");
}

export function normalizeCaen(value = "") {
  const digits = safeText(value).replace(/\D+/g, "");
  return digits.length > 4 ? digits.slice(0, 4) : digits.padStart(digits.length ? 4 : 0, "0");
}

export function normalizeKey(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugKey(value = "") {
  return normalizeKey(value).replace(/\s+/g, "-");
}

export function targetCaenCodes(segment = "all") {
  const selected = safeText(segment);
  const rows = selected && selected !== "all"
    ? EMARQET_OUTBOUND_SEGMENTS.filter((item) => item.key === selected || item.templateKey === selected)
    : EMARQET_OUTBOUND_SEGMENTS;
  return new Set(rows.flatMap((item) => item.caen.map(normalizeCaen)));
}

export function segmentForCaen(caenCode = "") {
  const code = normalizeCaen(caenCode);
  return EMARQET_OUTBOUND_SEGMENTS.find((segment) => segment.caen.map(normalizeCaen).includes(code)) || null;
}

export function segmentByKey(value = "") {
  const key = safeText(value);
  return EMARQET_OUTBOUND_SEGMENTS.find((segment) => segment.key === key || segment.templateKey === key) || null;
}

export function ensureEmarqetOutboundSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      listing_id INTEGER,
      vertical_id INTEGER,
      requester_name TEXT NOT NULL,
      requester_email TEXT,
      requester_phone TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'NOU',
      message TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_outbound_leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_key TEXT NOT NULL,
      source TEXT,
      source_file TEXT,
      segment_key TEXT,
      segment_label TEXT,
      caen_code TEXT,
      caen_label TEXT,
      cui TEXT,
      registration_number TEXT,
      company_name TEXT NOT NULL,
      legal_form TEXT,
      status_firma TEXT,
      county TEXT,
      city TEXT,
      address TEXT,
      website TEXT,
      email TEXT,
      phone TEXT,
      facebook TEXT,
      google_business_url TEXT,
      contact_name TEXT,
      contact_status TEXT NOT NULL DEFAULT 'CONTACT_NEEDED',
      outreach_status TEXT NOT NULL DEFAULT 'NOT_READY',
      last_contacted_at TEXT,
      next_follow_up_at TEXT,
      opt_out_at TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, lead_key)
    );

    CREATE TABLE IF NOT EXISTS emarqet_outbound_email_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      outbound_lead_id INTEGER NOT NULL,
      direction TEXT NOT NULL DEFAULT 'OUT',
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      template_key TEXT,
      status TEXT NOT NULL DEFAULT 'PREGATIT',
      provider_message_id TEXT,
      error TEXT,
      sent_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emarqet_outbound_status
      ON emarqet_outbound_leads(company_id, segment_key, contact_status, outreach_status);
    CREATE INDEX IF NOT EXISTS idx_emarqet_outbound_email
      ON emarqet_outbound_leads(company_id, email);
    CREATE INDEX IF NOT EXISTS idx_emarqet_outbound_cui
      ON emarqet_outbound_leads(company_id, cui);
    CREATE INDEX IF NOT EXISTS idx_emarqet_outbound_events_lead
      ON emarqet_outbound_email_events(company_id, outbound_lead_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_emarqet_outbound_emarqet_leads
      ON emarqet_leads(company_id, source, created_at);
  `);
}

export function detectCsvSeparator(line = "") {
  const candidates = ["^", ";", ",", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const separator of candidates) {
    const count = String(line || "").split(separator).length;
    if (count > bestCount) {
      best = separator;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsvLine(line = "", separator = ",") {
  const cells = [];
  let cell = "";
  let inQuotes = false;
  const raw = String(line || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function normalizeHeader(value = "") {
  return safeText(value)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function* csvRows(filePath, options = {}) {
  const input = fs.createReadStream(filePath, { encoding: options.encoding || "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let separator = options.separator || "";
  for await (const line of rl) {
    if (!safeText(line)) continue;
    if (!headers) {
      separator = separator || detectCsvSeparator(line);
      headers = parseCsvLine(line, separator).map(normalizeHeader);
      continue;
    }
    const values = parseCsvLine(line, separator);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    yield row;
  }
}

export function firstValue(row = {}, aliases = []) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (safeText(value)) return safeText(value);
  }
  return "";
}

export function buildAddress(row = {}) {
  const street = firstValue(row, ["ADR_DEN_STRADA", "strada", "address", "adresa"]);
  const number = firstValue(row, ["ADR_DEN_NR_STRADA", "numar", "nr"]);
  const block = firstValue(row, ["ADR_BLOC"]);
  const extra = firstValue(row, ["ADR_COMPLETARE"]);
  return [street, number, block ? `bl. ${block}` : "", extra].filter(Boolean).join(" ");
}

export function makeOutboundLeadKey(payload = {}) {
  const cui = normalizeCui(payload.cui);
  if (cui) return `cui:${cui}`;
  const registration = safeText(payload.registration_number).toUpperCase();
  if (registration) return `reg:${registration}`;
  const email = normalizeEmail(payload.email);
  if (email) return `email:${email}`;
  const website = safeText(payload.website).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (website) return `web:${website}`;
  return `name:${slugKey([payload.company_name, payload.city, payload.county].filter(Boolean).join(" "))}`;
}

export function mapPreparedLeadRow(row = {}, defaults = {}) {
  const caenCode = normalizeCaen(firstValue(row, ["CAEN", "CAEN_CODE", "COD_CAEN", "COD_CAEN_AUTORIZAT"]) || defaults.caen_code);
  const segment = segmentByKey(firstValue(row, ["SEGMENT", "SEGMENT_KEY"]) || defaults.segment_key) || segmentForCaen(caenCode);
  const email = normalizeEmail(firstValue(row, ["EMAIL", "MAIL", "E_MAIL", "ADRESA_EMAIL"]));
  const phone = firstValue(row, ["PHONE", "TELEFON", "MOBIL"]);
  return {
    source: defaults.source || firstValue(row, ["SOURCE", "SURSA"]) || "manual_enrichment",
    source_file: defaults.source_file || "",
    segment_key: segment?.key || defaults.segment_key || "",
    segment_label: segment?.label || defaults.segment_label || "",
    caen_code: caenCode,
    caen_label: firstValue(row, ["CAEN_LABEL", "DENUMIRE_CAEN", "DESCRIERE_CAEN"]),
    cui: normalizeCui(firstValue(row, ["CUI", "COD_FISCAL", "CIF"])),
    registration_number: firstValue(row, ["COD_INMATRICULARE", "REGISTRATION_NUMBER", "NR_REG_COM"]),
    company_name: firstValue(row, ["DENUMIRE", "COMPANY_NAME", "NUME_FIRMA", "NAME", "NUME"]),
    legal_form: firstValue(row, ["FORMA_JURIDICA", "LEGAL_FORM"]),
    status_firma: firstValue(row, ["STARE", "STATUS_FIRMA", "STATUS"]),
    county: firstValue(row, ["ADR_JUDET", "JUDET", "COUNTY"]),
    city: firstValue(row, ["ADR_LOCALITATE", "LOCALITATE", "ORAS", "CITY"]),
    address: firstValue(row, ["ADRESA", "ADDRESS"]) || buildAddress(row),
    website: firstValue(row, ["WEBSITE", "SITE", "URL"]),
    email,
    phone,
    facebook: firstValue(row, ["FACEBOOK", "FACEBOOK_URL"]),
    google_business_url: firstValue(row, ["GOOGLE_BUSINESS", "GOOGLE_BUSINESS_URL", "GOOGLE_MAPS"]),
    contact_name: firstValue(row, ["CONTACT_NAME", "PERSOANA_CONTACT"]),
    contact_status: email || phone || firstValue(row, ["WEBSITE", "SITE", "URL"]) ? "CONTACT_FOUND" : "CONTACT_NEEDED",
    outreach_status: email ? "READY" : "NOT_READY",
    notes: firstValue(row, ["NOTES", "NOTE", "OBSERVATII"]) || defaults.notes || "",
    created_by: defaults.created_by || "emarqet-outbound"
  };
}

export function mapOnrcFirmRow(row = {}, caenCode = "", defaults = {}) {
  const segment = segmentByKey(defaults.segment_key) || segmentForCaen(caenCode);
  return {
    source: defaults.source || "onrc_open_data",
    source_file: defaults.source_file || "",
    segment_key: segment?.key || "",
    segment_label: segment?.label || "",
    caen_code: normalizeCaen(caenCode),
    caen_label: defaults.caen_label || "",
    cui: normalizeCui(firstValue(row, ["CUI"])),
    registration_number: firstValue(row, ["COD_INMATRICULARE"]),
    company_name: firstValue(row, ["DENUMIRE"]) || "Firma ONRC",
    legal_form: firstValue(row, ["FORMA_JURIDICA"]),
    status_firma: defaults.status_firma || firstValue(row, ["STARE", "STATUS_FIRMA"]),
    county: firstValue(row, ["ADR_JUDET"]),
    city: firstValue(row, ["ADR_LOCALITATE"]),
    address: buildAddress(row),
    website: "",
    email: "",
    phone: "",
    facebook: "",
    google_business_url: "",
    contact_name: "",
    contact_status: "CONTACT_NEEDED",
    outreach_status: "NOT_READY",
    notes: defaults.notes || "Import ONRC pe CAEN; necesita imbogatire contact business public.",
    created_by: defaults.created_by || "emarqet-onrc-import"
  };
}

export function upsertOutboundLead(db, companyId, payload = {}) {
  const lead = {
    ...payload,
    company_id: Number(companyId || 0),
    lead_key: payload.lead_key || makeOutboundLeadKey(payload),
    company_name: safeText(payload.company_name) || "Lead e-Marqet",
    email: normalizeEmail(payload.email),
    cui: normalizeCui(payload.cui),
    caen_code: normalizeCaen(payload.caen_code)
  };
  if (!lead.company_id || !lead.lead_key || !lead.company_name) return { ok: false, error: "invalid_lead" };
  const result = db.prepare(`
    INSERT INTO emarqet_outbound_leads (
      company_id, lead_key, source, source_file, segment_key, segment_label,
      caen_code, caen_label, cui, registration_number, company_name, legal_form,
      status_firma, county, city, address, website, email, phone, facebook,
      google_business_url, contact_name, contact_status, outreach_status, notes, created_by
    )
    VALUES (
      @company_id, @lead_key, @source, @source_file, @segment_key, @segment_label,
      @caen_code, @caen_label, @cui, @registration_number, @company_name, @legal_form,
      @status_firma, @county, @city, @address, @website, @email, @phone, @facebook,
      @google_business_url, @contact_name, @contact_status, @outreach_status, @notes, @created_by
    )
    ON CONFLICT(company_id, lead_key) DO UPDATE SET
      source=excluded.source,
      source_file=COALESCE(NULLIF(excluded.source_file, ''), emarqet_outbound_leads.source_file),
      segment_key=COALESCE(NULLIF(excluded.segment_key, ''), emarqet_outbound_leads.segment_key),
      segment_label=COALESCE(NULLIF(excluded.segment_label, ''), emarqet_outbound_leads.segment_label),
      caen_code=COALESCE(NULLIF(excluded.caen_code, ''), emarqet_outbound_leads.caen_code),
      caen_label=COALESCE(NULLIF(excluded.caen_label, ''), emarqet_outbound_leads.caen_label),
      cui=COALESCE(NULLIF(excluded.cui, ''), emarqet_outbound_leads.cui),
      registration_number=COALESCE(NULLIF(excluded.registration_number, ''), emarqet_outbound_leads.registration_number),
      company_name=COALESCE(NULLIF(excluded.company_name, ''), emarqet_outbound_leads.company_name),
      legal_form=COALESCE(NULLIF(excluded.legal_form, ''), emarqet_outbound_leads.legal_form),
      status_firma=COALESCE(NULLIF(excluded.status_firma, ''), emarqet_outbound_leads.status_firma),
      county=COALESCE(NULLIF(excluded.county, ''), emarqet_outbound_leads.county),
      city=COALESCE(NULLIF(excluded.city, ''), emarqet_outbound_leads.city),
      address=COALESCE(NULLIF(excluded.address, ''), emarqet_outbound_leads.address),
      website=COALESCE(NULLIF(excluded.website, ''), emarqet_outbound_leads.website),
      email=COALESCE(NULLIF(excluded.email, ''), emarqet_outbound_leads.email),
      phone=COALESCE(NULLIF(excluded.phone, ''), emarqet_outbound_leads.phone),
      facebook=COALESCE(NULLIF(excluded.facebook, ''), emarqet_outbound_leads.facebook),
      google_business_url=COALESCE(NULLIF(excluded.google_business_url, ''), emarqet_outbound_leads.google_business_url),
      contact_name=COALESCE(NULLIF(excluded.contact_name, ''), emarqet_outbound_leads.contact_name),
      contact_status=CASE WHEN excluded.email <> '' THEN 'CONTACT_FOUND' ELSE emarqet_outbound_leads.contact_status END,
      outreach_status=CASE WHEN excluded.email <> '' AND emarqet_outbound_leads.outreach_status='NOT_READY' THEN 'READY' ELSE emarqet_outbound_leads.outreach_status END,
      notes=trim(COALESCE(emarqet_outbound_leads.notes, '') || char(10) || COALESCE(NULLIF(excluded.notes, ''), '')),
      updated_at=datetime('now')
  `).run(lead);
  return { ok: true, id: result.lastInsertRowid, changes: result.changes, lead_key: lead.lead_key };
}

export function isGenericBusinessEmail(email = "") {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return false;
  const role = local.split(/[.+_-]/)[0];
  if (EMARQET_BUSINESS_EMAIL_ROLES.includes(role) || EMARQET_BUSINESS_EMAIL_ROLES.includes(local)) return true;
  return !FREE_EMAIL_DOMAINS.has(domain);
}

function escapeHtml(value = "") {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function segmentPitch(templateKey = "") {
  const key = safeText(templateKey);
  if (key === "auto_dealer") {
    return [
      "Pentru un parc auto putem activa profil public de partener, pagina cu toate masinile din stoc, import CSV/XML/API, promovare in categorie si distribuire social media.",
      "In zona auto pregatim si servicii utile: VIN, leasing, test drive, contract si verificare service."
    ];
  }
  if (key === "auto_services") {
    return [
      "Pentru service-uri si magazine de piese putem lista servicii, piese, verificari, oferte si cereri directe din platforma.",
      "Leadurile intra centralizat in Nexora, iar anunturile pot fi promovate local."
    ];
  }
  if (key === "real_estate") {
    return [
      "Pentru agentii imobiliare putem activa pagina publica a agentiei, toate anunturile grupate sub acelasi profil, import CSV/XML si filtre dedicate pentru apartamente, case, terenuri si spatii comerciale.",
      "Cererile venite din anunturi se pot urmari in Nexora."
    ];
  }
  if (key === "tourism") {
    return [
      "Pentru turism putem conecta vizibilitatea e-Marqet cu Trevoro, pagini publice pentru proprietati sau servicii, distributie social media si leaduri centralizate.",
      "Putem pregati continutul si primele anunturi impreuna."
    ];
  }
  if (key === "retail") {
    return [
      "Pentru magazine putem lista produse, categorii, oferte recurente, importuri si promovare in pagina principala sau in categorie.",
      "Platforma poate deveni un canal suplimentar de vanzare si vizibilitate locala."
    ];
  }
  return [
    "Pentru servicii locale putem activa profil public, listare servicii, promovare pe categorie si cereri urmarite in Nexora.",
    "Putem incepe cu cateva anunturi initiale si optimizam dupa primele rezultate."
  ];
}

export function buildEmarqetOutboundMessage(lead = {}, options = {}) {
  const publicBaseUrl = safeText(options.publicBaseUrl || process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");
  const supportEmail = safeText(options.supportEmail || process.env.EMARQET_SUPPORT_EMAIL || "aafastitsolutions@gmail.com");
  const companyName = safeText(lead.company_name) || "firma dvs.";
  const city = safeText(lead.city || lead.county);
  const segment = segmentByKey(lead.segment_key) || segmentForCaen(lead.caen_code);
  const templateKey = segment?.templateKey || safeText(lead.template_key) || "services";
  const subjectMap = {
    auto_dealer: "Stocul auto poate fi publicat pe e-Marqet",
    auto_services: "Un canal nou pentru servicii si piese auto",
    real_estate: "Publicare anunturi imobiliare pe e-Marqet",
    tourism: "Vizibilitate noua pentru turism si cazare",
    retail: "Un canal nou pentru produsele si ofertele dvs.",
    services: "Un canal nou pentru serviciile dvs. locale"
  };
  const intro = city
    ? `Am identificat ${companyName} in ${city} si credem ca e-Marqet poate fi un canal util pentru anunturi si leaduri locale.`
    : `Am identificat ${companyName} si credem ca e-Marqet poate fi un canal util pentru anunturi si leaduri locale.`;
  const pitch = segmentPitch(templateKey);
  const text = [
    "Buna ziua,",
    "",
    "Va contactam din partea e-Marqet, o platforma romaneasca de anunturi si parteneri business conectata la Nexora.",
    "",
    intro,
    "",
    ...pitch,
    "",
    "Putem porni cu un profil de partener si cateva anunturi initiale, apoi activam importul sau promovarea in functie de ce aveti nevoie.",
    "",
    "Daca doriti, va trimit un link de activare si un exemplu de pagina de partener.",
    "",
    "Daca nu doriti sa mai primiti mesaje de la noi, raspundeti cu Stop si nu va mai contactam.",
    "",
    "Cu respect,",
    "Echipa e-Marqet",
    supportEmail,
    `${publicBaseUrl}/parteneri`
  ].join("\n");
  const htmlPitch = pitch.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
      <p>Buna ziua,</p>
      <p>Va contactam din partea <strong>e-Marqet</strong>, o platforma romaneasca de anunturi si parteneri business conectata la Nexora.</p>
      <p>${escapeHtml(intro)}</p>
      ${htmlPitch}
      <p>Putem porni cu un profil de partener si cateva anunturi initiale, apoi activam importul sau promovarea in functie de ce aveti nevoie.</p>
      <p>Daca doriti, va trimit un link de activare si un exemplu de pagina de partener.</p>
      <p style="font-size:13px;color:#64748b">Daca nu doriti sa mai primiti mesaje de la noi, raspundeti cu Stop si nu va mai contactam.</p>
      <p>Cu respect,<br>Echipa e-Marqet<br><a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a><br><a href="${escapeHtml(`${publicBaseUrl}/parteneri`)}">${escapeHtml(`${publicBaseUrl}/parteneri`)}</a></p>
    </div>
  `;
  return {
    subject: subjectMap[templateKey] || subjectMap.services,
    text,
    html,
    templateKey
  };
}
