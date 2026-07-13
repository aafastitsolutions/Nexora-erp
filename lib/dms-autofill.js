import PizZip from "pizzip";
import { PDFBool, PDFDocument, PDFName, PDFTextField } from "pdf-lib";

class DmsAutofillError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DmsAutofillError";
    this.code = code;
  }
}

const PROFILE_FIELDS = [
  {
    key: "company_name",
    label: "Denumire companie",
    tokens: ["company_name", "company.name", "firma_denumire", "firma_nume"],
    pdfAliases: ["company_name", "company name", "firma denumire", "firma nume", "denumire firma", "denumire societate", "nume societate", "societate emitenta", "prestator denumire"]
  },
  {
    key: "company_cui",
    label: "CUI",
    tokens: ["company_cui", "company.cui", "firma_cui"],
    pdfAliases: ["company_cui", "company cui", "firma cui", "societate cui", "cui", "cif", "cod fiscal", "cod unic de inregistrare"]
  },
  {
    key: "company_rc",
    label: "Registrul Comertului",
    tokens: ["company_rc", "company.rc", "firma_rc"],
    pdfAliases: ["company_rc", "company rc", "firma rc", "societate rc", "reg com", "registrul comertului", "nr registrul comertului", "j"]
  },
  {
    key: "company_address",
    label: "Adresa companie",
    tokens: ["company_address", "company.address", "firma_adresa"],
    pdfAliases: ["company_address", "company address", "firma adresa", "adresa firma", "societate adresa", "sediu social", "adresa sediu"]
  },
  {
    key: "company_bank",
    label: "Banca",
    tokens: ["company_bank", "company.bank", "firma_banca"],
    pdfAliases: ["company_bank", "company bank", "firma banca", "banca firma", "banca"]
  },
  {
    key: "company_iban",
    label: "IBAN",
    tokens: ["company_iban", "company.iban", "firma_iban"],
    pdfAliases: ["company_iban", "company iban", "firma iban", "iban firma", "iban", "cont bancar"]
  },
  {
    key: "company_phone",
    label: "Telefon companie",
    tokens: ["company_phone", "company.phone", "firma_telefon"],
    pdfAliases: ["company_phone", "company phone", "firma telefon", "telefon firma", "telefon societate"]
  },
  {
    key: "company_email",
    label: "Email companie",
    tokens: ["company_email", "company.email", "firma_email"],
    pdfAliases: ["company_email", "company email", "firma email", "email firma", "email societate"]
  },
  {
    key: "capital_social",
    label: "Capital social",
    tokens: ["capital_social", "company.capital_social"],
    pdfAliases: ["capital_social", "capital social"]
  },
  {
    key: "legal_representative",
    label: "Reprezentant legal",
    tokens: ["legal_representative", "company_representative", "company.representative", "reprezentant_legal", "reprezentant_legal_nume", "nume_prenume_reprezentant", "nume_prenume_semnatar"],
    pdfAliases: ["legal_representative", "legal representative", "company representative", "reprezentant legal", "reprezentant firma", "reprezentant societate", "administrator societate", "administrator firma", "nume prenume reprezentant", "nume prenume semnatar"]
  },
  {
    key: "legal_representative_cnp",
    label: "CNP reprezentant",
    tokens: ["legal_representative_cnp", "representative_cnp", "company_rep_cnp", "cnp_reprezentant", "cnp_semnatar"],
    pdfAliases: ["legal_representative_cnp", "representative cnp", "company rep cnp", "cnp reprezentant", "cnp semnatar", "cnp"]
  },
  {
    key: "legal_representative_role",
    label: "Functie reprezentant",
    tokens: ["legal_representative_role", "representative_role", "company_rep_role", "functie_reprezentant", "functie_semnatar"],
    pdfAliases: ["legal_representative_role", "representative role", "company rep role", "functie reprezentant", "functie semnatar", "calitate reprezentant", "calitate semnatar"]
  },
  {
    key: "legal_representative_ci_series",
    label: "Serie CI reprezentant",
    tokens: ["legal_representative_ci_series", "representative_ci_series", "company_rep_ci_series"],
    pdfAliases: ["legal_representative_ci_series", "representative ci series", "serie ci reprezentant", "seria ci reprezentant"]
  },
  {
    key: "legal_representative_ci_number",
    label: "Numar CI reprezentant",
    tokens: ["legal_representative_ci_number", "representative_ci_number", "company_rep_ci_number"],
    pdfAliases: ["legal_representative_ci_number", "representative ci number", "numar ci reprezentant", "nr ci reprezentant"]
  },
  {
    key: "legal_representative_ci_issued_by",
    label: "Emitent CI reprezentant",
    tokens: ["legal_representative_ci_issued_by", "representative_ci_issued_by", "company_rep_ci_issued_by"],
    pdfAliases: ["legal_representative_ci_issued_by", "representative ci issued by", "emitent ci reprezentant", "eliberat de"]
  }
];

const DOCX_SUPPORTED_TOKENS = PROFILE_FIELDS.flatMap((field) => field.tokens);
const DOCX_BLANK_PATTERN = "(?:[._\u2026][ \\t]*){2,}[._\u2026]";
const DOCX_COMPANY_ID_HINT_PATTERN = "(?:\\(\\s*)?denumir(?:ea|e)\\s*,?\\s*(?:cod(?:ul)?\\s+(?:de\\s+(?:i|î)nregistrare\\s+)?fiscal(?:a|ă)?|CUI|CIF)\\s*,?\\s*adres(?:a|ă)(?:\\s*\\))?";
const DOCX_COMPANY_LABEL_PATTERN = "(?:OFERTANT(?:\\s*\\/\\s*ASOCIAT)?|ASOCIAT|FURNIZOR|PRESTATOR|BENEFICIAR|SOLICITANT|OPERATOR\\s+ECONOMIC)(?:\\s*\\((?!\\s*denumir)[^)]*\\))?";
const DOCX_AUTHORIZED_SIGNER_HINT_PATTERN = "\\(\\s*numele\\s+(?:si|și|şi)\\s+func(?:t|\\u021B|\\u0163)ia(?:\\s+persoanei\\s+autorizate)?\\s*\\)";
const DOCX_CONTEXTUAL_FIELDS = [
  {
    label: "Date identificare companie",
    value(profile) {
      return [
        profileValue(profile, "company_name"),
        profileValue(profile, "company_cui") ? `codul de înregistrare fiscală ${profileValue(profile, "company_cui")}` : "",
        profileValue(profile, "company_address") ? `adresa ${profileValue(profile, "company_address")}` : ""
      ].filter(Boolean).join(", ");
    },
    patterns: [
      `Beneficiar\\s*:\\s*(${DOCX_BLANK_PATTERN}\\s*${DOCX_COMPANY_ID_HINT_PATTERN})`,
      `Beneficiar\\s*:\\s*(${DOCX_BLANK_PATTERN})\\s*(?=${DOCX_COMPANY_ID_HINT_PATTERN})`,
      `${DOCX_COMPANY_LABEL_PATTERN}\\s*:?\\s*(${DOCX_BLANK_PATTERN}\\s*${DOCX_COMPANY_ID_HINT_PATTERN})`,
      `${DOCX_COMPANY_LABEL_PATTERN}\\s*:?\\s*(${DOCX_COMPANY_ID_HINT_PATTERN})`
    ]
  },
  {
    key: "legal_representative",
    label: "Reprezentant legal",
    patterns: [
      `Subsemnat(?:ul|a)(?:\\s*\\/\\s*a|\\s*\\(\\s*a\\s*\\))?\\s*,?\\s*(${DOCX_BLANK_PATTERN})`,
      `Nume\\s+(?:si|și)\\s+prenume\\s+semnatar\\s*:\\s*(${DOCX_BLANK_PATTERN})`,
      `Nume\\s*,?\\s*Prenume\\s*:?,?\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    key: "legal_representative_cnp",
    label: "CNP reprezentant",
    patterns: [
      `\\bCNP\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    label: "CNP reprezentant",
    value(profile) {
      const cnp = profileValue(profile, "legal_representative_cnp");
      return cnp ? `${cnp} (` : "";
    },
    patterns: [
      `\\bCNP\\s*\\/\\s*pa(?:s|ș|ş)?aport\\s+nr\\.?\\s*(\\()`
    ]
  },
  {
    key: "legal_representative_role",
    label: "Functie reprezentant",
    patterns: [
      `Func(?:t|\\u021B|\\u0163)ia\\s*,?\\s*(${DOCX_BLANK_PATTERN})`,
      `Functie\\s+semnatar\\s*:?\\s*(${DOCX_BLANK_PATTERN})`,
      `Calitate\\s+semnatar\\s*:?\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    key: "legal_representative_ci_series",
    label: "Serie CI reprezentant",
    leadingSpaceIfAdjacent: true,
    patterns: [
      `CI\\s*(?:\\/\\s*BI\\s*)?seria\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    key: "legal_representative_ci_number",
    label: "Numar CI reprezentant",
    patterns: [
      `\\bnr\\s*\\.?\\s*(${DOCX_BLANK_PATTERN})\\s*(?=,?\\s*eliberat)`
    ]
  },
  {
    key: "legal_representative_ci_issued_by",
    label: "Emitent CI reprezentant",
    patterns: [
      `eliberat(?:\\s*\\((?:a|ă)\\)|a|ă)?\\s+de\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    key: "company_name",
    label: "Denumire companie",
    patterns: [
      `reprezentant\\s+legal\\s+al\\s*(${DOCX_BLANK_PATTERN})`,
      `ofertantului\\s*(${DOCX_BLANK_PATTERN})`,
      `(?:ofertantul|solicitantul)\\s*,\\s*(${DOCX_BLANK_PATTERN}(?:\\s*S\\.?\\s*A\\.?\\s*\\/\\s*S\\.?\\s*R\\.?\\s*L\\.?)?)\\s*,\\s*pe\\s+care\\s+(?:i|î)l\\s+reprezint`,
      `solicitantul\\s*\\/\\s*beneficiarul\\s*,\\s*(${DOCX_BLANK_PATTERN}\\s*S\\.?\\s*A\\.?\\s*\\/\\s*S\\.?\\s*R\\.?\\s*L\\.?)`,
      `solicitantul\\s*\\/\\s*beneficiarul\\s*,\\s*(${DOCX_BLANK_PATTERN})`,
      `derulat(?:a|ă)\\s+de\\s+c(?:a|ă)tre\\s+(${DOCX_BLANK_PATTERN}\\s*S\\.?\\s*R\\.?\\s*L\\.?)`,
      `derulat(?:a|ă)\\s+de\\s+c(?:a|ă)tre\\s+(${DOCX_BLANK_PATTERN}\\s*S\\.?\\s*A\\.?\\s*\\/\\s*S\\.?\\s*R\\.?\\s*L\\.?)`
    ]
  },
  {
    label: "Denumire companie",
    value(profile) {
      const companyName = profileValue(profile, "company_name");
      return companyName ? `${companyName},` : "";
    },
    patterns: [
      `reprezentant\\s+legal\\s*\\/\\s*persoan(?:ă|a)\\s+(?:î|i)mputernicit(?:ă|a)\\s+al\\s*(,)\\s*CNP`
    ]
  },
  {
    key: "company_address",
    label: "Adresa companie",
    patterns: [
      `sediul\\s+social\\s+(?:i|î)n\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    key: "company_cui",
    label: "CUI",
    patterns: [
      `cod(?:ul)?\\s+de\\s+(?:i|î)nregistrare\\s+fiscal(?:a|ă)\\s*(${DOCX_BLANK_PATTERN})`
    ]
  },
  {
    label: "Semnatar autorizat",
    value(profile) {
      return [
        profileValue(profile, "legal_representative"),
        profileValue(profile, "legal_representative_role")
      ].filter(Boolean).join(", ");
    },
    patterns: [
      `(${DOCX_BLANK_PATTERN}\\s*${DOCX_AUTHORIZED_SIGNER_HINT_PATTERN})`
    ]
  }
];
const BLOCKED_PDF_CONTEXTS = new Set([
  "beneficiar",
  "client",
  "cumparator",
  "destinatar",
  "furnizor",
  "salariat",
  "angajat"
]);

function normalizeFieldName(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function profileValue(profile, key) {
  return String(profile?.[key] || "").trim();
}

function repairDocxTextArtifacts(value = "") {
  return String(value || "")
    .replaceAll("昀", "f")
    .replaceAll("椀", "i")
    .replaceAll("琀", "t");
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function regexEscape(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addDocxReplacement(matches, candidate) {
  const overlaps = matches.some((existing) =>
    candidate.start < existing.end && existing.start < candidate.end
  );
  if (!overlaps) matches.push(candidate);
}

function findDocxContextualMatches(plainText, profile) {
  const matches = [];

  for (const definition of DOCX_CONTEXTUAL_FIELDS) {
    const value = definition.value
      ? definition.value(profile)
      : profileValue(profile, definition.key);
    if (!value) continue;

    for (const pattern of definition.patterns) {
      const expression = new RegExp(pattern, "giu");
      let match;
      while ((match = expression.exec(plainText)) !== null) {
        const placeholder = match[1] || "";
        const offset = match[0].lastIndexOf(placeholder);
        if (!placeholder || offset < 0) continue;
        const start = match.index + offset;
        const escapedValue = escapeXml(value);
        const replacementValue = definition.leadingSpaceIfAdjacent
          && start > 0
          && !/\s/.test(plainText[start - 1])
          ? ` ${escapedValue}`
          : escapedValue;
        addDocxReplacement(matches, {
          start,
          end: start + placeholder.length,
          label: definition.label,
          value: replacementValue
        });
      }
    }
  }

  return matches;
}

function replaceDocxMarkersInXml(xml, profile) {
  const nodes = [];
  const textNodePattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
  let plainText = "";
  let nodeMatch;

  while ((nodeMatch = textNodePattern.exec(xml)) !== null) {
    const openTagEnd = nodeMatch.index + nodeMatch[0].indexOf(">") + 1;
    const closeTagStart = nodeMatch.index + nodeMatch[0].lastIndexOf("</w:t>");
    const text = repairDocxTextArtifacts(nodeMatch[1] || "");
    nodes.push({
      contentStart: openTagEnd,
      contentEnd: closeTagStart,
      start: plainText.length,
      end: plainText.length + text.length,
      text
    });
    plainText += text;
  }

  if (!nodes.length) return { xml, matches: [] };

  const matches = [];
  for (const definition of PROFILE_FIELDS) {
    const value = profileValue(profile, definition.key);
    if (!value) continue;

    for (const token of definition.tokens) {
      const expression = new RegExp(
        `(\\{\\{\\s*${regexEscape(token)}\\s*\\}\\}|\\[\\[\\s*${regexEscape(token)}\\s*\\]\\])`,
        "gi"
      );
      let match;
      while ((match = expression.exec(plainText)) !== null) {
        const candidate = {
          start: match.index,
          end: match.index + match[0].length,
          label: definition.label,
          value: escapeXml(value)
        };
        addDocxReplacement(matches, candidate);
      }
    }
  }

  for (const candidate of findDocxContextualMatches(plainText, profile)) {
    addDocxReplacement(matches, candidate);
  }

  for (const match of matches.sort((left, right) => right.start - left.start)) {
    const firstIndex = nodes.findIndex((node) => match.start < node.end);
    const lastIndex = nodes.findIndex((node) => match.end <= node.end);
    if (firstIndex < 0 || lastIndex < 0) continue;

    const firstOffset = match.start - nodes[firstIndex].start;
    const lastOffset = match.end - nodes[lastIndex].start;
    if (firstIndex === lastIndex) {
      nodes[firstIndex].text = nodes[firstIndex].text.slice(0, firstOffset)
        + match.value
        + nodes[firstIndex].text.slice(lastOffset);
      continue;
    }

    nodes[firstIndex].text = nodes[firstIndex].text.slice(0, firstOffset) + match.value;
    for (let index = firstIndex + 1; index < lastIndex; index += 1) {
      nodes[index].text = "";
    }
    nodes[lastIndex].text = nodes[lastIndex].text.slice(lastOffset);
  }

  if (!matches.length) return { xml, matches };
  let rebuilt = "";
  let cursor = 0;
  for (const node of nodes) {
    rebuilt += xml.slice(cursor, node.contentStart) + node.text;
    cursor = node.contentEnd;
  }
  rebuilt += xml.slice(cursor);
  return { xml: rebuilt, matches };
}

function findPdfFieldDefinition(fieldName = "") {
  const normalized = normalizeFieldName(fieldName);
  const parts = normalized.split(" ");
  if (parts.some((part) => BLOCKED_PDF_CONTEXTS.has(part))) return null;

  for (const definition of PROFILE_FIELDS) {
    for (const alias of definition.pdfAliases) {
      const normalizedAlias = normalizeFieldName(alias);
      if (
        normalized === normalizedAlias ||
        normalized.startsWith(`${normalizedAlias} `) ||
        normalized.endsWith(` ${normalizedAlias}`) ||
        normalized.includes(` ${normalizedAlias} `)
      ) {
        return definition;
      }
    }
  }

  return null;
}

function fillDocxTemplate(buffer, profile) {
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new DmsAutofillError("invalid_docx", "Fisierul DOCX nu poate fi citit.");
  }

  const xmlParts = Object.keys(zip.files).filter((fileName) =>
    /^word\/(document|header[0-9]+|footer[0-9]+)\.xml$/i.test(fileName)
  );
  const matchedFields = new Set();
  let replacementCount = 0;

  for (const fileName of xmlParts) {
    const filled = replaceDocxMarkersInXml(zip.file(fileName)?.asText() || "", profile);
    for (const match of filled.matches) {
      matchedFields.add(match.label);
      replacementCount += 1;
    }
    zip.file(fileName, filled.xml);
  }

  if (!replacementCount) {
    throw new DmsAutofillError(
      "no_fields",
      "DOCX-ul nu contine markeri recunoscuti pentru datele companiei."
    );
  }

  return {
    buffer: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
    matchedFields: [...matchedFields],
    replacementCount
  };
}

async function fillPdfTemplate(buffer, profile) {
  let pdfDocument;
  try {
    pdfDocument = await PDFDocument.load(buffer);
  } catch {
    throw new DmsAutofillError("invalid_pdf", "Fisierul PDF nu poate fi citit.");
  }

  const form = pdfDocument.getForm();
  const matchedFields = new Set();
  let replacementCount = 0;

  for (const field of form.getFields()) {
    const definition = findPdfFieldDefinition(field.getName());
    const value = definition && profileValue(profile, definition.key);
    if (!definition || !value || !(field instanceof PDFTextField)) continue;
    if (String(field.getText() || "").trim()) continue;

    field.setText(value);
    matchedFields.add(definition.label);
    replacementCount += 1;
  }

  if (!replacementCount) {
    throw new DmsAutofillError(
      "no_fields",
      "PDF-ul nu are campuri editabile goale recunoscute pentru companie sau reprezentant."
    );
  }

  // PDF viewers can regenerate appearances, including Romanian characters unavailable in Helvetica.
  pdfDocument.getForm().acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  const savedBytes = await pdfDocument.save({ updateFieldAppearances: false });
  return {
    buffer: Buffer.from(savedBytes),
    mimeType: "application/pdf",
    extension: ".pdf",
    matchedFields: [...matchedFields],
    replacementCount
  };
}

async function processDmsTemplate({ buffer, extension, profile }) {
  const normalizedExtension = String(extension || "").trim().toLowerCase();
  if (normalizedExtension === ".docx") return fillDocxTemplate(buffer, profile);
  if (normalizedExtension === ".pdf") return fillPdfTemplate(buffer, profile);
  throw new DmsAutofillError("unsupported_type", "Sunt acceptate doar fisiere DOCX sau PDF.");
}

export {
  DOCX_SUPPORTED_TOKENS,
  DmsAutofillError,
  PROFILE_FIELDS,
  processDmsTemplate
};
