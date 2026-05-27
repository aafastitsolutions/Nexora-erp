function readInvoiceSeriesSetting(db, companyId = null) {
  const normalizedCompanyId = Number(companyId || 0);
  const raw = normalizedCompanyId > 0
    ? (db.prepare(`
        SELECT value
        FROM app_settings
        WHERE key=?
        LIMIT 1
      `).get(`company:${normalizedCompanyId}:invoice_series`)?.value ?? db.prepare(`
        SELECT value
        FROM app_settings
        WHERE key='invoice_series'
        LIMIT 1
      `).get()?.value)
    : db.prepare(`
        SELECT value
        FROM app_settings
        WHERE key='invoice_series'
        LIMIT 1
      `).get()?.value;

  return String(raw || "INV").trim() || "INV";
}

const DRAFT_INVOICE_PREFIX = "DRAFT-";

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSeededPattern(rawValue) {
  const match = String(rawValue || "").match(/^(.*?)(\d+)$/);
  if (!match) return null;

  const prefix = match[1] || "";
  const digits = match[2] || "";
  const seed = Number.parseInt(digits, 10);

  if (!prefix || !Number.isFinite(seed) || seed <= 0) return null;

  return {
    prefix,
    padLength: digits.length,
    seed
  };
}

function nextLegacyInvoiceNumber(db, prefix, year, companyId = null) {
  const normalizedCompanyId = Number(companyId || 0);
  const row = normalizedCompanyId > 0
    ? db.prepare(`
        SELECT seq
        FROM facturi
        WHERE an=? AND company_id=?
        ORDER BY seq DESC
        LIMIT 1
      `).get(year, normalizedCompanyId)
    : db.prepare(`
        SELECT seq
        FROM facturi
        WHERE an=?
        ORDER BY seq DESC
        LIMIT 1
      `).get(year);

  const seq = (Number(row?.seq || 0) || 0) + 1;
  return {
    an: year,
    seq,
    factura_nr: `${prefix}-${year}-${String(seq).padStart(4, "0")}`
  };
}

function nextSeededInvoiceNumber(db, pattern, year, companyId = null) {
  const suffixRegex = new RegExp(`^${escapeRegExp(pattern.prefix)}(\\d+)$`);
  const normalizedCompanyId = Number(companyId || 0);
  const rows = normalizedCompanyId > 0
    ? db.prepare(`
        SELECT factura_nr
        FROM facturi
        WHERE company_id=?
        ORDER BY id ASC
      `).all(normalizedCompanyId)
    : db.prepare(`
        SELECT factura_nr
        FROM facturi
        ORDER BY id ASC
      `).all();

  let maxSeq = 0;
  for (const row of rows) {
    const match = String(row?.factura_nr || "").trim().match(suffixRegex);
    if (!match) continue;
    const numericPart = Number.parseInt(match[1], 10);
    if (Number.isFinite(numericPart)) {
      maxSeq = Math.max(maxSeq, numericPart);
    }
  }

  const seq = maxSeq > 0 ? maxSeq + 1 : pattern.seed;
  return {
    an: year,
    seq,
    factura_nr: `${pattern.prefix}${String(seq).padStart(pattern.padLength, "0")}`
  };
}

export function nextConfiguredInvoiceNumber(db, options = {}) {
  const currentYear = Number(options.year || new Date().getFullYear()) || new Date().getFullYear();
  const companyId = Number(options.companyId || 0) || null;
  const configuredSeries = readInvoiceSeriesSetting(db, companyId);
  const seededPattern = parseSeededPattern(configuredSeries);

  if (seededPattern) {
    return nextSeededInvoiceNumber(db, seededPattern, currentYear, companyId);
  }

  const prefix = configuredSeries.replace(/[-\s]+$/g, "").trim() || "INV";
  return nextLegacyInvoiceNumber(db, prefix, currentYear, companyId);
}

export function buildDraftInvoiceNumber(id) {
  const numericId = Number(id || 0);
  return `${DRAFT_INVOICE_PREFIX}${numericId > 0 ? numericId : "TEMP"}`;
}

export function isDraftInvoiceNumber(value) {
  return String(value || "").trim().toUpperCase().startsWith(DRAFT_INVOICE_PREFIX);
}

export function formatInvoiceDisplayNumber(invoice) {
  const rawNumber = String(invoice?.factura_nr || "").trim();
  if (!rawNumber) {
    return invoice?.id ? `Factura #${invoice.id}` : "Factura";
  }

  if (!isDraftInvoiceNumber(rawNumber)) return rawNumber;

  const fallbackId = Number(invoice?.id || 0);
  const draftId = Number(rawNumber.replace(/\D/g, "")) || fallbackId;
  return draftId > 0 ? `Ciorna #${draftId}` : "Ciorna";
}

export function ensureOfficialInvoiceNumber(db, facturaId, options = {}) {
  const id = Number(facturaId || 0);
  const companyId = Number(options.companyId || 0) || null;
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Factura invalidă pentru alocarea numărului final.");
  }

  const tx = db.transaction(() => {
    const row = companyId
      ? db.prepare(`
          SELECT id, an, seq, factura_nr
          FROM facturi
          WHERE id=? AND company_id=?
        `).get(id, companyId)
      : db.prepare(`
          SELECT id, an, seq, factura_nr
          FROM facturi
          WHERE id=?
        `).get(id);

    if (!row) {
      throw new Error("Factura nu există.");
    }

    if (!isDraftInvoiceNumber(row.factura_nr) && Number(row.seq || 0) > 0) {
      return {
        changed: false,
        an: Number(row.an || options.year || new Date().getFullYear()),
        seq: Number(row.seq || 0),
        factura_nr: String(row.factura_nr || "")
      };
    }

    const number = nextConfiguredInvoiceNumber(db, {
      year: Number(row.an || options.year || new Date().getFullYear()),
      companyId
    });

    if (companyId) {
      db.prepare(`
        UPDATE facturi
        SET factura_nr=?, an=?, seq=?
        WHERE id=? AND company_id=?
      `).run(number.factura_nr, number.an, number.seq, id, companyId);
    } else {
      db.prepare(`
        UPDATE facturi
        SET factura_nr=?, an=?, seq=?
        WHERE id=?
      `).run(number.factura_nr, number.an, number.seq, id);
    }

    return {
      changed: true,
      an: number.an,
      seq: number.seq,
      factura_nr: number.factura_nr
    };
  });

  return tx();
}
