// db.js (ESM)
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { ALL_MODULE_KEYS, DEFAULT_PLAN_DEFINITIONS, parseModuleList, uniqueModuleKeys } from "./lib/app-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.db");
export const db = new Database(DB_PATH);

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

const TRAVEL_ACCESS_BACKFILL_BASELINE = ALL_MODULE_KEYS.filter((moduleKey) => !["travel", "emarqet"].includes(moduleKey));
const EMARQET_ACCESS_BACKFILL_BASELINE = ALL_MODULE_KEYS.filter((moduleKey) => moduleKey !== "emarqet");

function withTravelModuleForFullAccess(rawModuleList) {
  const modules = uniqueModuleKeys(parseModuleList(rawModuleList, []));
  if (!modules.length || modules.includes("travel")) return null;

  const moduleSet = new Set(modules);
  const hadFullAccessBeforeTravel = TRAVEL_ACCESS_BACKFILL_BASELINE.every((moduleKey) => moduleSet.has(moduleKey));
  return hadFullAccessBeforeTravel ? uniqueModuleKeys([...modules, "travel"]) : null;
}

function withEmarqetModuleForFullAccess(rawModuleList) {
  const modules = uniqueModuleKeys(parseModuleList(rawModuleList, []));
  if (!modules.length || modules.includes("emarqet")) return null;

  const moduleSet = new Set(modules);
  const hadFullAccessBeforeEmarqet = EMARQET_ACCESS_BACKFILL_BASELINE.every((moduleKey) => moduleSet.has(moduleKey));
  return hadFullAccessBeforeEmarqet ? uniqueModuleKeys([...modules, "emarqet"]) : null;
}

function backfillTravelModuleAccess() {
  const updateSubscription = db.prepare(`
    UPDATE company_subscriptions
    SET module_overrides=?
    WHERE id=?
  `);
  for (const subscription of db.prepare(`SELECT id, module_overrides FROM company_subscriptions`).all()) {
    const modules = withTravelModuleForFullAccess(subscription.module_overrides);
    if (modules) updateSubscription.run(JSON.stringify(modules), subscription.id);
  }

  const updateUser = db.prepare(`
    UPDATE users
    SET module_permissions=?
    WHERE id=?
  `);
  for (const user of db.prepare(`SELECT id, module_permissions FROM users`).all()) {
    const modules = withTravelModuleForFullAccess(user.module_permissions);
    if (modules) updateUser.run(JSON.stringify(modules), user.id);
  }
}

function backfillEmarqetModuleAccess() {
  const updateSubscription = db.prepare(`
    UPDATE company_subscriptions
    SET module_overrides=?
    WHERE id=?
  `);
  for (const subscription of db.prepare(`SELECT id, module_overrides FROM company_subscriptions`).all()) {
    const modules = withEmarqetModuleForFullAccess(subscription.module_overrides);
    if (modules) updateSubscription.run(JSON.stringify(modules), subscription.id);
  }

  const updateUser = db.prepare(`
    UPDATE users
    SET module_permissions=?
    WHERE id=?
  `);
  for (const user of db.prepare(`SELECT id, module_permissions FROM users`).all()) {
    const modules = withEmarqetModuleForFullAccess(user.module_permissions);
    if (modules) updateUser.run(JSON.stringify(modules), user.id);
  }
}

function tipizateRegisterYear(value) {
  const parsed = Number(String(value || "").slice(0, 4));
  return Number.isFinite(parsed) && parsed >= 2000 ? parsed : new Date().getFullYear();
}

function formatTipizateRegistrationNumber(year, seq) {
  return `IES-${year}-${String(seq).padStart(5, "0")}`;
}

function backfillTipizateRegister() {
  const docs = db.prepare(`
    SELECT d.id, d.company_id, d.title, d.category, d.file_name, d.file_path, d.created_at
    FROM tipizate_docs d
    WHERE COALESCE(d.company_id, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM tipizate_register r
        WHERE r.company_id=d.company_id
          AND r.doc_id=d.id
      )
    ORDER BY d.company_id ASC, COALESCE(d.created_at, ''), d.id ASC
  `).all();

  const syncRegisteredDocs = () => {
    db.exec(`
      UPDATE tipizate_docs
      SET registration_number = (
            SELECT r.registration_number FROM tipizate_register r
            WHERE r.company_id=tipizate_docs.company_id AND r.doc_id=tipizate_docs.id
          ),
          registration_year = (
            SELECT r.year FROM tipizate_register r
            WHERE r.company_id=tipizate_docs.company_id AND r.doc_id=tipizate_docs.id
          ),
          registration_seq = (
            SELECT r.seq FROM tipizate_register r
            WHERE r.company_id=tipizate_docs.company_id AND r.doc_id=tipizate_docs.id
          ),
          registered_at = (
            SELECT r.created_at FROM tipizate_register r
            WHERE r.company_id=tipizate_docs.company_id AND r.doc_id=tipizate_docs.id
          )
      WHERE registration_number IS NULL
        AND EXISTS (
          SELECT 1 FROM tipizate_register r
          WHERE r.company_id=tipizate_docs.company_id AND r.doc_id=tipizate_docs.id
        );
    `);
  };

  if (!docs.length) {
    syncRegisteredDocs();
    return;
  }

  const backfill = db.transaction((rows) => {
    const nextSeqStmt = db.prepare(`
      SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
      FROM tipizate_register
      WHERE company_id=? AND year=?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO tipizate_register (
        company_id, year, seq, registration_number, doc_id, doc_title,
        doc_category, file_name, file_path, issued_at, created_at, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), 'ACTIV')
    `);
    const updateDocStmt = db.prepare(`
      UPDATE tipizate_docs
      SET registration_number=?,
          registration_year=?,
          registration_seq=?,
          registered_at=?
      WHERE id=? AND company_id=?
    `);

    for (const doc of rows) {
      const year = tipizateRegisterYear(doc.created_at);
      const seq = Number(nextSeqStmt.get(doc.company_id, year)?.next_seq || 1);
      const registrationNumber = formatTipizateRegistrationNumber(year, seq);
      const issuedAt = doc.created_at || new Date().toISOString();
      insertStmt.run(
        doc.company_id,
        year,
        seq,
        registrationNumber,
        doc.id,
        String(doc.title || ""),
        String(doc.category || ""),
        String(doc.file_name || ""),
        String(doc.file_path || ""),
        issuedAt,
        issuedAt
      );
      updateDocStmt.run(registrationNumber, year, seq, issuedAt, doc.id, doc.company_id);
    }
  });

  backfill(docs);
  syncRegisteredDocs();
}

function getTableSql(tableName) {
  return db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(tableName)?.sql || "";
}

function repairLegacyClientForeignKeys() {
  const affectedTables = ["contracts", "contacts", "activities", "quotes", "facturi"];
  const needsRepair = affectedTables.some((tableName) => getTableSql(tableName).includes("clients_legacy_unique"));

  if (!needsRepair) return;

  db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;

    CREATE TABLE contracts__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      service_description TEXT NOT NULL,
      price REAL NOT NULL,
      duration TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      pdf_path TEXT,
      origin TEXT DEFAULT 'DIRECT',
      employee_id INTEGER,
      company_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    INSERT INTO contracts__fix (id, contract_number, year, seq, client_id, service_description, price, duration, created_at, pdf_path, origin, employee_id, company_id)
    SELECT id, contract_number, year, seq, client_id, service_description, price, duration, created_at, pdf_path, origin, employee_id, company_id
    FROM contracts;
    DROP TABLE contracts;
    ALTER TABLE contracts__fix RENAME TO contracts;

    CREATE TABLE contacts__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      position TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      company_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    INSERT INTO contacts__fix (id, client_id, name, email, phone, position, is_primary, created_at, company_id)
    SELECT id, client_id, name, email, phone, position, is_primary, created_at, company_id
    FROM contacts;
    DROP TABLE contacts;
    ALTER TABLE contacts__fix RENAME TO contacts;

    CREATE TABLE activities__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      contact_id INTEGER,
      type TEXT NOT NULL,
      subject TEXT,
      note TEXT,
      due_at TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      employee_id INTEGER,
      company_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );
    INSERT INTO activities__fix (id, client_id, contact_id, type, subject, note, due_at, done, created_at, employee_id, company_id)
    SELECT id, client_id, contact_id, type, subject, note, due_at, done, created_at, employee_id, company_id
    FROM activities;
    DROP TABLE activities;
    ALTER TABLE activities__fix RENAME TO activities;

    CREATE TABLE quotes__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      title TEXT,
      notes TEXT,
      currency TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      valid_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      pdf_path TEXT,
      contract_id INTEGER,
      company_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    INSERT INTO quotes__fix (id, quote_number, year, seq, client_id, status, title, notes, currency, subtotal, vat_rate, vat_amount, total, valid_until, created_at, pdf_path, contract_id, company_id)
    SELECT id, quote_number, year, seq, client_id, status, title, notes, currency, subtotal, vat_rate, vat_amount, total, valid_until, created_at, pdf_path, contract_id, company_id
    FROM quotes;
    DROP TABLE quotes;
    ALTER TABLE quotes__fix RENAME TO quotes;

    CREATE TABLE facturi__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_nr TEXT NOT NULL UNIQUE,
      an INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      contract_id INTEGER,
      quote_id INTEGER,
      status TEXT NOT NULL DEFAULT 'CIORNA',
      moneda TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      tva_procent REAL NOT NULL DEFAULT 0.19,
      tva_valoare REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      data_emitere TEXT NOT NULL DEFAULT (date('now')),
      scadenta TEXT,
      observatii TEXT,
      pdf_path TEXT,
      efactura_status TEXT,
      efactura_message_id TEXT,
      efactura_xml_path TEXT,
      efactura_last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      employee_id INTEGER,
      efactura_upload_index TEXT,
      efactura_download_id TEXT,
      efactura_response_zip_path TEXT,
      efactura_last_checked_at TEXT,
      company_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
    INSERT INTO facturi__fix (id, factura_nr, an, seq, client_id, contract_id, quote_id, status, moneda, subtotal, tva_procent, tva_valoare, total, data_emitere, scadenta, observatii, pdf_path, efactura_status, efactura_message_id, efactura_xml_path, efactura_last_error, created_at, employee_id, efactura_upload_index, efactura_download_id, efactura_response_zip_path, efactura_last_checked_at, company_id)
    SELECT id, factura_nr, an, seq, client_id, contract_id, quote_id, status, moneda, subtotal, tva_procent, tva_valoare, total, data_emitere, scadenta, observatii, pdf_path, efactura_status, efactura_message_id, efactura_xml_path, efactura_last_error, created_at, employee_id, efactura_upload_index, efactura_download_id, efactura_response_zip_path, efactura_last_checked_at, company_id
    FROM facturi;
    DROP TABLE facturi;
    ALTER TABLE facturi__fix RENAME TO facturi;

    COMMIT;
    PRAGMA foreign_keys=on;
  `);
}

function repairTravelCalendarProviderCheck() {
  const tableSql = getTableSql("travel_property_calendar_links");
  if (!tableSql || tableSql.includes("'booking'")) return;

  db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;

    CREATE TABLE travel_property_calendar_links__fix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'ical'
        CHECK (provider IN ('booking', 'airbnb', 'google', 'outlook', 'ical', 'other')),
      calendar_url TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'active', 'error', 'paused')),
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    INSERT INTO travel_property_calendar_links__fix (
      id, company_id, property_id, provider, calendar_url, sync_status,
      last_synced_at, last_error, created_at, updated_at
    )
    SELECT
      id, company_id, property_id, provider, calendar_url, sync_status,
      last_synced_at, last_error, created_at, updated_at
    FROM travel_property_calendar_links;

    DROP TABLE travel_property_calendar_links;
    ALTER TABLE travel_property_calendar_links__fix RENAME TO travel_property_calendar_links;

    COMMIT;
    PRAGMA foreign_keys=on;
  `);
}

export function migrate() {
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      cui TEXT,
      rc TEXT,
      address TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      bank TEXT,
      iban TEXT,
      representative TEXT,
      stripe_customer_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      max_users INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      demo_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      billing_period TEXT NOT NULL DEFAULT 'monthly',
      pricing_model TEXT NOT NULL DEFAULT 'flat',
      price_monthly REAL NOT NULL DEFAULT 0,
      max_users INTEGER NOT NULL DEFAULT 1,
      max_modules_per_user INTEGER NOT NULL DEFAULT 0,
      max_active_modules INTEGER NOT NULL DEFAULT 0,
      module_keys TEXT NOT NULL DEFAULT '[]',
      tagline TEXT,
      description TEXT,
      features_json TEXT NOT NULL DEFAULT '[]',
      support_copy TEXT,
      extra_dev_copy TEXT,
      image_path TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS company_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      seats_included INTEGER NOT NULL DEFAULT 1,
      seats_used INTEGER NOT NULL DEFAULT 0,
      module_overrides TEXT NOT NULL DEFAULT '[]',
      stripe_subscription_id TEXT,
      stripe_checkout_session_id TEXT,
      stripe_price_id TEXT,
      billing_currency TEXT DEFAULT 'eur',
      billing_email TEXT,
      current_period_end TEXT,
      last_payment_status TEXT,
      starts_at TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS company_admin_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      actor_user_id INTEGER,
      actor_email TEXT,
      event_type TEXT NOT NULL,
      status_from TEXT,
      status_to TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS billing_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      company_subscription_id INTEGER,
      source TEXT NOT NULL DEFAULT 'stripe',
      provider_event_type TEXT,
      payment_kind TEXT NOT NULL DEFAULT 'subscription',
      status TEXT NOT NULL DEFAULT 'initiated',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'eur',
      payer_name TEXT,
      payer_email TEXT,
      reference_code TEXT,
      stripe_checkout_session_id TEXT,
      stripe_subscription_id TEXT,
      stripe_invoice_id TEXT,
      stripe_payment_intent_id TEXT,
      paid_at TEXT,
      failure_reason TEXT,
      notes TEXT,
      metadata TEXT,
      created_by_user_id INTEGER,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (company_subscription_id) REFERENCES company_subscriptions(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cui TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      reg_com TEXT,
      caen TEXT,
      vat INTEGER DEFAULT 0,
      inactive INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      service_description TEXT NOT NULL,
      price REAL NOT NULL,
      duration TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      pdf_path TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL,
      unit TEXT DEFAULT 'buc',
      price REAL NOT NULL DEFAULT 0,
      tva_percent REAL NOT NULL DEFAULT 0,
      lot TEXT,
      kind TEXT NOT NULL DEFAULT 'SERVICIU',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      position TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      contact_id INTEGER,
      type TEXT NOT NULL,
      subject TEXT,
      note TEXT,
      due_at TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      employee_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crm_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      lead_number TEXT NOT NULL,
      name TEXT NOT NULL,
      company_name TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      status TEXT NOT NULL DEFAULT 'NOU',
      owner_email TEXT,
      estimated_value REAL NOT NULL DEFAULT 0,
      probability INTEGER NOT NULL DEFAULT 10,
      next_step TEXT,
      next_followup_date TEXT,
      notes TEXT,
      converted_client_id INTEGER,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (converted_client_id) REFERENCES clients(id) ON DELETE SET NULL,
      UNIQUE(company_id, lead_number)
    );

    CREATE TABLE IF NOT EXISTS crm_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      opportunity_number TEXT NOT NULL,
      client_id INTEGER,
      lead_id INTEGER,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'CALIFICARE',
      status TEXT NOT NULL DEFAULT 'DESCHISA',
      amount REAL NOT NULL DEFAULT 0,
      probability INTEGER NOT NULL DEFAULT 25,
      expected_close_date TEXT,
      owner_email TEXT,
      source TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL,
      UNIQUE(company_id, opportunity_number)
    );

    CREATE TABLE IF NOT EXISTS crm_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      lead_id INTEGER,
      opportunity_id INTEGER,
      activity_type TEXT NOT NULL DEFAULT 'TASK',
      subject TEXT NOT NULL,
      notes TEXT,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      status TEXT NOT NULL DEFAULT 'DESCHIS',
      completed_at TEXT,
      owner_email TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL,
      FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crm_email_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      lead_id INTEGER,
      opportunity_id INTEGER,
      direction TEXT NOT NULL DEFAULT 'OUT',
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PREGATIT',
      sent_at TEXT,
      opened_at TEXT,
      replied_at TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL,
      FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      title TEXT,
      notes TEXT,
      currency TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      valid_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      pdf_path TEXT,
      contract_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales_quote_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      registration_number TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'IMPORT',
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      extension TEXT,
      status TEXT NOT NULL DEFAULT 'IMPORTATA',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE(company_id, registration_number)
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      quote_id INTEGER,
      status TEXT NOT NULL DEFAULT 'NOUA',
      order_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT,
      delivery_address TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      currency TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
      UNIQUE(company_id, order_number)
    );

    CREATE TABLE IF NOT EXISTS sales_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      product_id INTEGER,
      item_name TEXT NOT NULL,
      sku TEXT,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales_price_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RON',
      valid_from TEXT,
      valid_to TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVA',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_price_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_list_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      unit TEXT,
      base_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      min_qty REAL NOT NULL DEFAULT 1,
      margin_percent REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (price_list_id) REFERENCES sales_price_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'PROCENT',
      discount_value REAL NOT NULL DEFAULT 0,
      target_type TEXT NOT NULL DEFAULT 'GLOBAL',
      target_ref TEXT,
      valid_from TEXT,
      valid_to TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      combinable INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      delivery_number TEXT NOT NULL,
      order_id INTEGER,
      client_id INTEGER,
      status TEXT NOT NULL DEFAULT 'PREGATITA',
      scheduled_date TEXT,
      delivered_at TEXT,
      courier TEXT,
      awb TEXT,
      delivery_address TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      UNIQUE(company_id, delivery_number)
    );

    CREATE TABLE IF NOT EXISTS order_lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      event_number TEXT NOT NULL,
      order_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'STATUS',
      event_date TEXT NOT NULL DEFAULT (datetime('now')),
      actor_email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
      UNIQUE(company_id, event_number)
    );

    CREATE TABLE IF NOT EXISTS order_fulfillment_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      task_number TEXT NOT NULL,
      order_id INTEGER NOT NULL,
      delivery_id INTEGER,
      task_type TEXT NOT NULL DEFAULT 'PICKING',
      warehouse_id INTEGER,
      assigned_to TEXT,
      planned_date TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (delivery_id) REFERENCES sales_deliveries(id) ON DELETE SET NULL,
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      UNIQUE(company_id, task_number)
    );

    CREATE TABLE IF NOT EXISTS order_tracking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      tracking_number TEXT NOT NULL,
      order_id INTEGER,
      delivery_id INTEGER,
      event_type TEXT NOT NULL DEFAULT 'STATUS',
      event_date TEXT NOT NULL DEFAULT (datetime('now')),
      location TEXT,
      courier TEXT,
      awb TEXT,
      status TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (delivery_id) REFERENCES sales_deliveries(id) ON DELETE CASCADE,
      UNIQUE(company_id, tracking_number)
    );

    CREATE TABLE IF NOT EXISTS sales_delivery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      order_item_id INTEGER,
      product_id INTEGER,
      item_name TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (delivery_id) REFERENCES sales_deliveries(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES sales_order_items(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS procurement_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      supplier_code TEXT NOT NULL,
      name TEXT NOT NULL,
      cui TEXT,
      registration_number TEXT,
      category TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      payment_terms_days INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, supplier_code)
    );

    CREATE TABLE IF NOT EXISTS procurement_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      approval_status TEXT NOT NULL DEFAULT 'NECESITA_APROBARE',
      order_date TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT,
      currency TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      requested_by_email TEXT,
      approved_by_email TEXT,
      approved_at TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES procurement_suppliers(id) ON DELETE CASCADE,
      UNIQUE(company_id, order_number)
    );

    CREATE TABLE IF NOT EXISTS procurement_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity REAL NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      vat_percent REAL NOT NULL DEFAULT 19,
      line_subtotal REAL NOT NULL DEFAULT 0,
      line_vat REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      received_quantity REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES procurement_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS procurement_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL,
      order_id INTEGER,
      supplier_id INTEGER,
      warehouse_id INTEGER,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      receipt_date TEXT NOT NULL DEFAULT (date('now')),
      document_number TEXT,
      inventory_receipt_id INTEGER,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES procurement_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (supplier_id) REFERENCES procurement_suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (inventory_receipt_id) REFERENCES inventory_receipts(id) ON DELETE SET NULL,
      UNIQUE(company_id, receipt_number)
    );

    CREATE TABLE IF NOT EXISTS procurement_receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      receipt_id INTEGER NOT NULL,
      order_item_id INTEGER,
      product_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity REAL NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      lot_number TEXT,
      serial_number TEXT,
      expiry_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (receipt_id) REFERENCES procurement_receipts(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES procurement_order_items(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS procurement_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      approval_number TEXT NOT NULL,
      order_id INTEGER,
      subject TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by_email TEXT,
      approver_email TEXT,
      due_date TEXT,
      decided_at TEXT,
      decision_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES procurement_orders(id) ON DELETE SET NULL,
      UNIQUE(company_id, approval_number)
    );

    CREATE TABLE IF NOT EXISTS procurement_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      supplier_id INTEGER,
      order_id INTEGER,
      receipt_id INTEGER,
      bill_id INTEGER,
      cost_type TEXT NOT NULL DEFAULT 'TRANSPORT',
      cost_date TEXT NOT NULL DEFAULT (date('now')),
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      allocation_method TEXT NOT NULL DEFAULT 'MANUAL',
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES procurement_suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES procurement_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (receipt_id) REFERENCES procurement_receipts(id) ON DELETE SET NULL,
      FOREIGN KEY (bill_id) REFERENCES procurement_bills(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS procurement_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bill_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL,
      order_id INTEGER,
      receipt_id INTEGER,
      expense_id INTEGER,
      doc_number TEXT,
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      payment_status TEXT NOT NULL DEFAULT 'NEPLATITA',
      currency TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      attachment_path TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES procurement_suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES procurement_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (receipt_id) REFERENCES procurement_receipts(id) ON DELETE SET NULL,
      FOREIGN KEY (expense_id) REFERENCES accounting_expenses(id) ON DELETE SET NULL,
      UNIQUE(company_id, bill_number)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_boms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bom_number TEXT NOT NULL,
      product_id INTEGER,
      product_code TEXT,
      product_name TEXT NOT NULL,
      revision TEXT NOT NULL DEFAULT 'A',
      batch_size REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'buc',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      UNIQUE(company_id, bom_number)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_bom_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bom_id INTEGER NOT NULL,
      component_product_id INTEGER,
      stock_item_id INTEGER,
      component_code TEXT,
      component_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity_per_batch REAL NOT NULL DEFAULT 1,
      scrap_percent REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      operation_step TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bom_id) REFERENCES manufacturing_boms(id) ON DELETE CASCADE,
      FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS manufacturing_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      bom_id INTEGER,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity_planned REAL NOT NULL DEFAULT 1,
      quantity_completed REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'buc',
      warehouse_id INTEGER,
      planned_start TEXT,
      planned_end TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      client_name TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bom_id) REFERENCES manufacturing_boms(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      UNIQUE(company_id, order_number)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_order_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      bom_item_id INTEGER,
      product_id INTEGER,
      stock_item_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      required_qty REAL NOT NULL DEFAULT 0,
      issued_qty REAL NOT NULL DEFAULT 0,
      consumed_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NEEMIS',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_item_id) REFERENCES manufacturing_bom_items(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS manufacturing_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      plan_number TEXT NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      demand_source TEXT NOT NULL DEFAULT 'FORECAST',
      period_start TEXT,
      period_end TEXT,
      required_date TEXT,
      demand_qty REAL NOT NULL DEFAULT 0,
      available_qty REAL NOT NULL DEFAULT 0,
      planned_qty REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      generated_order_id INTEGER,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (generated_order_id) REFERENCES manufacturing_orders(id) ON DELETE SET NULL,
      UNIQUE(company_id, plan_number)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_material_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      issue_number TEXT NOT NULL,
      order_id INTEGER,
      order_material_id INTEGER,
      warehouse_id INTEGER,
      stock_item_id INTEGER,
      product_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      planned_qty REAL NOT NULL DEFAULT 0,
      issued_qty REAL NOT NULL DEFAULT 0,
      consumed_qty REAL NOT NULL DEFAULT 0,
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES manufacturing_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (order_material_id) REFERENCES manufacturing_order_materials(id) ON DELETE SET NULL,
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      UNIQUE(company_id, issue_number)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      cost_number TEXT NOT NULL,
      order_id INTEGER,
      cost_date TEXT NOT NULL DEFAULT (date('now')),
      cost_type TEXT NOT NULL DEFAULT 'ESTIMAT',
      description TEXT,
      material_cost REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      overhead_cost REAL NOT NULL DEFAULT 0,
      subcontract_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      quantity_basis REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES manufacturing_orders(id) ON DELETE SET NULL,
      UNIQUE(company_id, cost_number)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      qc_number TEXT NOT NULL,
      order_id INTEGER,
      product_id INTEGER,
      check_date TEXT NOT NULL DEFAULT (date('now')),
      inspection_type TEXT NOT NULL DEFAULT 'FINAL',
      sample_size REAL NOT NULL DEFAULT 0,
      accepted_qty REAL NOT NULL DEFAULT 0,
      rejected_qty REAL NOT NULL DEFAULT 0,
      defect_type TEXT,
      result TEXT NOT NULL DEFAULT 'PENDING',
      inspector_email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES manufacturing_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      UNIQUE(company_id, qc_number)
    );

    CREATE TABLE IF NOT EXISTS horeca_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      table_code TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT 'Sală',
      seats INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'LIBERA',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, table_code)
    );

    CREATE TABLE IF NOT EXISTS horeca_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      reservation_number TEXT NOT NULL,
      table_id INTEGER,
      client_name TEXT NOT NULL,
      phone TEXT,
      guest_count INTEGER NOT NULL DEFAULT 2,
      reservation_date TEXT NOT NULL DEFAULT (date('now')),
      reservation_time TEXT,
      status TEXT NOT NULL DEFAULT 'CONFIRMATA',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES horeca_tables(id) ON DELETE SET NULL,
      UNIQUE(company_id, reservation_number)
    );

    CREATE TABLE IF NOT EXISTS horeca_menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      item_code TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Meniu',
      course_type TEXT NOT NULL DEFAULT 'Preparat',
      price REAL NOT NULL DEFAULT 0,
      vat_percent REAL NOT NULL DEFAULT 9,
      recipe_notes TEXT,
      allergen_notes TEXT,
      stock_policy TEXT NOT NULL DEFAULT 'CONSUM_RETETA',
      status TEXT NOT NULL DEFAULT 'ACTIV',
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, item_code)
    );

    CREATE TABLE IF NOT EXISTS horeca_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      table_id INTEGER,
      channel TEXT NOT NULL DEFAULT 'SALA',
      waiter_name TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'DESCHISA',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES horeca_tables(id) ON DELETE SET NULL,
      UNIQUE(company_id, order_number)
    );

    CREATE TABLE IF NOT EXISTS horeca_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      vat_percent REAL NOT NULL DEFAULT 9,
      line_subtotal REAL NOT NULL DEFAULT 0,
      line_vat REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      kitchen_status TEXT NOT NULL DEFAULT 'NOU',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES horeca_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES horeca_menu_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      property_type TEXT,
      tourist_zone TEXT,
      description TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      city TEXT,
      county TEXT,
      address TEXT,
      phone TEXT,
      whatsapp_phone TEXT,
      whatsapp_opt_in_status TEXT NOT NULL DEFAULT 'unknown',
      whatsapp_opt_in_source TEXT,
      whatsapp_opt_in_at TEXT,
      whatsapp_last_contacted_at TEXT,
      whatsapp_status TEXT NOT NULL DEFAULT 'manual',
      whatsapp_notes TEXT,
      email TEXT,
      website TEXT,
      facebook TEXT,
      instagram TEXT,
      linkedin TEXT,
      contact_page_url TEXT,
      contact_person TEXT,
      google_rating REAL,
      google_reviews INTEGER NOT NULL DEFAULT 0,
      google_place_id TEXT,
      source TEXT,
      enrichment_status TEXT NOT NULL DEFAULT 'pending',
      last_enriched_at TEXT,
      enrichment_error TEXT,
      enrichment_source_url TEXT,
      email_retry_priority INTEGER NOT NULL DEFAULT 0,
      email_retry_reason TEXT,
      email_retry_ready_at TEXT,
      status TEXT NOT NULL DEFAULT 'nou'
        CHECK (status IN ('nou', 'contactat', 'interesat', 'demo_programat', 'activ', 'respins')),
      score INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      next_follow_up_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      lead_id INTEGER,
      name TEXT NOT NULL,
      property_type TEXT,
      description TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      city TEXT,
      county TEXT,
      address TEXT,
	      phone TEXT,
	      email TEXT,
	      website TEXT,
	      google_place_id TEXT,
	      amenities TEXT,
	      meal_types TEXT,
	      promo_enabled INTEGER NOT NULL DEFAULT 0,
	      promo_badge TEXT,
	      promo_title TEXT,
	      promo_text TEXT,
	      promo_valid_until TEXT,
	      max_adults INTEGER NOT NULL DEFAULT 2,
	      max_children INTEGER NOT NULL DEFAULT 0,
	      child_free_age INTEGER NOT NULL DEFAULT 0,
	      child_paid_from_age INTEGER NOT NULL DEFAULT 0,
	      child_price_ron INTEGER NOT NULL DEFAULT 0,
	      price_per_night INTEGER NOT NULL DEFAULT 0,
	      price_currency TEXT NOT NULL DEFAULT 'RON',
	      status TEXT NOT NULL DEFAULT 'activ',
	      partner_plan TEXT NOT NULL DEFAULT 'standard_monthly',
	      subscription_status TEXT NOT NULL DEFAULT 'active',
	      monthly_price_ron INTEGER NOT NULL DEFAULT 0,
	      monthly_price_amount INTEGER NOT NULL DEFAULT 0,
	      monthly_price_currency TEXT NOT NULL DEFAULT 'RON',
	      free_until TEXT,
	      activation_source TEXT,
	      account_email TEXT,
	      password_salt TEXT,
	      password_hash TEXT,
		      account_status TEXT NOT NULL DEFAULT 'pending'
		        CHECK (account_status IN ('pending', 'active', 'suspended')),
		      last_login_at TEXT,
		      deletion_notice_sent_at TEXT,
		      deletion_scheduled_at TEXT,
		      deleted_at TEXT,
		      deletion_reason TEXT,
		      deleted_by_email TEXT,
		      created_at TEXT NOT NULL DEFAULT (datetime('now')),
		      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
		      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
		      FOREIGN KEY (lead_id) REFERENCES travel_leads(id) ON DELETE SET NULL
	    );

    CREATE TABLE IF NOT EXISTS travel_partner_property_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      external_property_id TEXT NOT NULL,
      property_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      payload_json TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, provider, external_property_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_partner_webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      property_id INTEGER,
      booking_request_id INTEGER,
      event_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      target_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'error', 'skipped')),
      attempts INTEGER NOT NULL DEFAULT 0,
      response_status INTEGER NOT NULL DEFAULT 0,
      response_body TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL,
      FOREIGN KEY (booking_request_id) REFERENCES travel_booking_requests(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_agency_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Romania',
      city TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      facebook TEXT,
      instagram TEXT,
      slug TEXT,
      display_name TEXT,
      contact_name TEXT,
      short_description TEXT,
      description TEXT,
      hero_image_url TEXT,
      logo_image_url TEXT,
      brand_color TEXT NOT NULL DEFAULT '#0f766e',
      public_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (public_status IN ('draft', 'published', 'hidden')),
      account_email TEXT,
      password_salt TEXT,
      password_hash TEXT,
      account_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending', 'active', 'suspended')),
      published_at TEXT,
      last_login_at TEXT,
      offer_focus TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'nou'
        CHECK (status IN ('nou', 'contactat', 'interesat', 'demo_programat', 'activ', 'respins')),
      subscription_status TEXT NOT NULL DEFAULT 'lead'
        CHECK (subscription_status IN ('lead', 'trial', 'active', 'paused', 'cancelled')),
      monthly_price_ron INTEGER NOT NULL DEFAULT 199,
      monthly_price_amount REAL NOT NULL DEFAULT 199,
      monthly_price_currency TEXT NOT NULL DEFAULT 'RON',
      listing_limit INTEGER NOT NULL DEFAULT 0,
      promotion_notes TEXT,
      notes TEXT,
      next_follow_up_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_agency_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      destination TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      city TEXT,
      category TEXT,
      amenities TEXT,
      slug TEXT,
      summary TEXT,
      description TEXT,
      image_url TEXT,
      gallery_json TEXT,
      departure_city TEXT,
      duration_days INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      includes TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      price_from REAL,
      currency TEXT NOT NULL DEFAULT 'RON',
      offer_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'promoted', 'paused')),
      promotion_priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (promotion_priority IN ('normal', 'priority', 'featured')),
      social_status TEXT NOT NULL DEFAULT 'neprogramat',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES travel_agency_leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_agency_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      offer_id INTEGER,
      url TEXT NOT NULL,
      caption TEXT,
      photo_type TEXT NOT NULL DEFAULT 'gallery'
        CHECK (photo_type IN ('hero', 'logo', 'gallery', 'offer')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_cover INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deleted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES travel_agency_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (offer_id) REFERENCES travel_agency_offers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_agency_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      offer_id INTEGER,
      requester_name TEXT NOT NULL,
      requester_email TEXT,
      requester_phone TEXT,
      subject TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'nou'
        CHECK (status IN ('nou', 'contactat', 'inchis')),
      source TEXT NOT NULL DEFAULT 'agency_public_page',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES travel_agency_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (offer_id) REFERENCES travel_agency_offers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_agency_offer_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      offer_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'trevoro_offer_click',
      target_url TEXT,
      referrer TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES travel_agency_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (offer_id) REFERENCES travel_agency_offers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_agency_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      offer_id INTEGER,
      reviewer_name TEXT NOT NULL,
      reviewer_email TEXT,
      rating INTEGER NOT NULL DEFAULT 5,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      source TEXT NOT NULL DEFAULT 'agency_public_page',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES travel_agency_leads(id) ON DELETE CASCADE,
      FOREIGN KEY (offer_id) REFERENCES travel_agency_offers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_local_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      partner_type TEXT NOT NULL DEFAULT 'tourist_info_center',
      country TEXT NOT NULL DEFAULT 'Romania',
      region TEXT,
      city TEXT,
      address TEXT,
      administrator TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      facebook TEXT,
      instagram TEXT,
      contact_name TEXT,
      ad_title TEXT,
      ad_summary TEXT,
      ad_image_url TEXT,
      ad_cta_url TEXT,
      ad_cta_label TEXT,
      promotion_tier TEXT NOT NULL DEFAULT 'standard',
      featured_until TEXT,
      potential_reach INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'nou'
        CHECK (status IN ('nou', 'contactat', 'interesat', 'partener', 'respins')),
      notes TEXT,
      social_enrichment_status TEXT NOT NULL DEFAULT 'pending',
      social_enrichment_source TEXT,
      social_enrichment_error TEXT,
      social_enriched_at TEXT,
      next_follow_up_at TEXT,
      last_contacted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      reviewer_name TEXT NOT NULL,
      reviewer_email TEXT,
      rating INTEGER NOT NULL DEFAULT 5,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      source TEXT NOT NULL DEFAULT 'property_public_page',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER,
      property_name TEXT,
      room_id INTEGER,
      room_name TEXT,
      room_price_per_night REAL NOT NULL DEFAULT 0,
      guest_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      check_in TEXT,
      check_out TEXT,
      guests INTEGER NOT NULL DEFAULT 1,
      message TEXT,
      source TEXT NOT NULL DEFAULT 'trevoro_site',
      status TEXT NOT NULL DEFAULT 'nou'
        CHECK (status IN ('nou', 'contactat', 'inchis')),
      notified_at TEXT,
      notification_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_booking_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      property_name TEXT,
      room_id INTEGER,
      room_name TEXT,
      room_quantity INTEGER NOT NULL DEFAULT 1,
      room_price_per_night REAL NOT NULL DEFAULT 0,
      guest_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL DEFAULT 1,
      guests INTEGER NOT NULL DEFAULT 1,
      adults INTEGER NOT NULL DEFAULT 1,
      children INTEGER NOT NULL DEFAULT 0,
      child_ages TEXT,
      meal_type TEXT,
      rate_package_id INTEGER,
      rate_package_title TEXT,
      rate_package_pricing_mode TEXT,
      rate_package_total REAL NOT NULL DEFAULT 0,
      rate_package_details TEXT,
      message TEXT,
      source TEXT NOT NULL DEFAULT 'trevoro_www',
      booking_channel TEXT NOT NULL DEFAULT 'manual_request',
      availability_provider TEXT NOT NULL DEFAULT 'trevoro',
      payment_flow TEXT NOT NULL DEFAULT 'owner_policy',
      external_provider TEXT,
      external_reservation_id TEXT,
      pynbooking_reservation_id TEXT,
      external_reservation_status TEXT,
      external_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'payment_pending', 'paid')),
      price_per_night REAL NOT NULL DEFAULT 0,
      estimated_total REAL NOT NULL DEFAULT 0,
      hold_expires_at TEXT,
      owner_notified_at TEXT,
      owner_email_status TEXT,
      owner_email_error TEXT,
      owner_whatsapp_status TEXT,
      owner_whatsapp_url TEXT,
      guest_notified_at TEXT,
      guest_email_status TEXT,
      guest_email_error TEXT,
      accepted_at TEXT,
      declined_at TEXT,
      payment_due_at TEXT,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      stripe_payment_status TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      room_id INTEGER,
      room_name TEXT,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_cover INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      beds TEXT,
      amenities TEXT,
      size_sqm INTEGER NOT NULL DEFAULT 0,
      max_adults INTEGER NOT NULL DEFAULT 2,
      max_children INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_per_night INTEGER NOT NULL DEFAULT 0,
      price_currency TEXT NOT NULL DEFAULT 'RON',
      external_provider TEXT,
      external_room_id TEXT,
      external_rate_plan_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_rate_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'mic-dejun',
      pricing_mode TEXT NOT NULL DEFAULT 'per_person'
        CHECK (pricing_mode IN ('per_person', 'per_room', 'package')),
      adult_price INTEGER NOT NULL DEFAULT 0,
      child_price INTEGER NOT NULL DEFAULT 0,
      room_price INTEGER NOT NULL DEFAULT 0,
      package_price INTEGER NOT NULL DEFAULT 0,
      min_nights INTEGER NOT NULL DEFAULT 1,
      included_nights INTEGER NOT NULL DEFAULT 0,
      includes_treatment INTEGER NOT NULL DEFAULT 0,
      child_paid_from_age INTEGER NOT NULL DEFAULT 0,
      max_adults INTEGER NOT NULL DEFAULT 0,
      max_children INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_room_rate_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      room_id INTEGER,
      room_name TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      price_per_night INTEGER NOT NULL DEFAULT 0,
      price_currency TEXT NOT NULL DEFAULT 'RON',
      available_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'blocked')),
      source TEXT NOT NULL DEFAULT 'manual',
      external_provider TEXT,
      external_room_id TEXT,
      external_rate_plan_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES travel_property_rooms(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_property_rate_plan_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      rate_package_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      rate_date TEXT NOT NULL,
      price_1p INTEGER NOT NULL DEFAULT 0,
      price_2p INTEGER NOT NULL DEFAULT 0,
      extra_bed_price INTEGER NOT NULL DEFAULT 0,
      child_price INTEGER NOT NULL DEFAULT 0,
      child_extra_bed_price INTEGER NOT NULL DEFAULT 0,
      available_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'blocked')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE,
      FOREIGN KEY (rate_package_id) REFERENCES travel_property_rate_packages(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES travel_property_rooms(id) ON DELETE CASCADE,
      UNIQUE (company_id, property_id, rate_package_id, room_id, rate_date)
    );

    CREATE TABLE IF NOT EXISTS travel_property_pynbooking_integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'pynbooking',
      provider_label TEXT,
      partner_status TEXT NOT NULL DEFAULT 'ready',
      hotel_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      api_key TEXT,
      api_base_url TEXT,
      default_plan_id TEXT,
      currency TEXT NOT NULL DEFAULT 'RON',
      language TEXT NOT NULL DEFAULT 'RO',
      sync_months INTEGER NOT NULL DEFAULT 6,
      sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'active', 'error', 'paused')),
      access_token TEXT,
      token_expires_at TEXT,
      last_tested_at TEXT,
      last_synced_at TEXT,
      last_imported_at TEXT,
      last_error TEXT,
      last_sync_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, property_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_calendar_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'ical'
        CHECK (provider IN ('booking', 'airbnb', 'google', 'outlook', 'ical', 'other')),
      calendar_url TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'active', 'error', 'paused')),
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_property_calendar_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      calendar_link_id INTEGER,
      booking_request_id INTEGER,
      block_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ical',
      summary TEXT,
      hold_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE,
      FOREIGN KEY (calendar_link_id) REFERENCES travel_property_calendar_links(id) ON DELETE CASCADE,
      FOREIGN KEY (booking_request_id) REFERENCES travel_booking_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_owner_account_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER,
      lead_id INTEGER,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'success', 'warning', 'error')),
      actor_email TEXT,
      actor_role TEXT NOT NULL DEFAULT 'owner',
      source TEXT NOT NULL DEFAULT 'owner_portal',
      subject TEXT,
      details TEXT,
      metadata_json TEXT,
      request_method TEXT,
      request_path TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL,
      FOREIGN KEY (lead_id) REFERENCES travel_leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_owner_password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      account_email TEXT NOT NULL,
      requested_by_email TEXT,
      requested_source TEXT NOT NULL DEFAULT 'owner_self_service',
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_site_pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      site TEXT NOT NULL DEFAULT 'trevoro.ro',
      path TEXT NOT NULL,
      page_type TEXT NOT NULL DEFAULT 'page',
      property_id INTEGER,
      visitor_hash TEXT NOT NULL,
      session_id TEXT,
      referrer TEXT,
      user_agent TEXT,
      country TEXT,
      source TEXT,
      medium TEXT,
      campaign TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_lead_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      lead_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (lead_id) REFERENCES travel_leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_email_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      lead_id INTEGER,
      mailbox TEXT NOT NULL DEFAULT 'contact@trevoro.ro',
      direction TEXT NOT NULL DEFAULT 'inbound',
      provider_message_id TEXT NOT NULL,
      from_email TEXT,
      to_email TEXT,
      subject TEXT,
      text_body TEXT,
      detected_language TEXT,
      detected_language_name TEXT,
      translation_ro TEXT,
      translation_status TEXT,
      translation_model TEXT,
      translation_updated_at TEXT,
      reply_language TEXT,
      reply_language_name TEXT,
      received_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (lead_id) REFERENCES travel_leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      ticket_number TEXT NOT NULL,
      lead_id INTEGER,
      property_id INTEGER,
      inquiry_id INTEGER,
      email_message_id INTEGER,
      requester_name TEXT,
      requester_email TEXT,
      country TEXT NOT NULL DEFAULT 'Romania',
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'nou'
        CHECK (status IN ('nou', 'in_asteptare', 'rezolvat')),
      priority TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL DEFAULT 'support_email',
      opened_at TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (lead_id) REFERENCES travel_leads(id) ON DELETE SET NULL,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL,
      FOREIGN KEY (inquiry_id) REFERENCES travel_property_inquiries(id) ON DELETE SET NULL,
      FOREIGN KEY (email_message_id) REFERENCES travel_email_messages(id) ON DELETE SET NULL,
      UNIQUE(company_id, ticket_number)
    );

    CREATE TABLE IF NOT EXISTS travel_support_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      ticket_id INTEGER NOT NULL,
      email_message_id INTEGER,
      direction TEXT NOT NULL DEFAULT 'inbound',
      from_email TEXT,
      to_email TEXT,
      subject TEXT,
      text_body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES travel_support_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (email_message_id) REFERENCES travel_email_messages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_whatsapp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      lead_id INTEGER,
      provider_message_id TEXT,
      direction TEXT NOT NULL DEFAULT 'webhook',
      event_type TEXT NOT NULL DEFAULT 'webhook',
      from_phone TEXT,
      to_phone TEXT,
      text_body TEXT,
      status TEXT,
      payload_json TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (lead_id) REFERENCES travel_leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_scoring_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      phone_points INTEGER NOT NULL DEFAULT 20,
      email_points INTEGER NOT NULL DEFAULT 20,
      website_points INTEGER NOT NULL DEFAULT 15,
      social_points INTEGER NOT NULL DEFAULT 10,
      google_reviews_50_points INTEGER NOT NULL DEFAULT 10,
      google_reviews_200_points INTEGER NOT NULL DEFAULT 20,
      tourist_city_points INTEGER NOT NULL DEFAULT 10,
      tourist_cities TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_content_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      template_type TEXT NOT NULL
        CHECK (template_type IN ('seo_article', 'facebook_post', 'instagram_post', 'tiktok_script', 'newsletter')),
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      tone TEXT,
      status TEXT NOT NULL DEFAULT 'activ',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_content_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER,
      job_type TEXT NOT NULL
        CHECK (job_type IN ('seo_article', 'facebook_post', 'instagram_post', 'tiktok_script', 'newsletter')),
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'queued', 'generated', 'error')),
      prompt TEXT,
      result_summary TEXT,
      model TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travel_blog_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER,
      job_id INTEGER,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      meta_title TEXT,
      meta_description TEXT,
      content TEXT NOT NULL,
      keywords TEXT,
      category TEXT NOT NULL DEFAULT 'Ghiduri',
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'published')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL,
      FOREIGN KEY (job_id) REFERENCES travel_content_jobs(id) ON DELETE SET NULL
    );

	    CREATE TABLE IF NOT EXISTS travel_social_posts (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      company_id INTEGER NOT NULL,
	      property_id INTEGER,
      job_id INTEGER,
      platform TEXT NOT NULL,
      content_type TEXT NOT NULL,
      caption TEXT NOT NULL,
      hashtags TEXT,
      media_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'scheduled', 'published')),
      scheduled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
	      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL,
	      FOREIGN KEY (job_id) REFERENCES travel_content_jobs(id) ON DELETE SET NULL
	    );

	    CREATE TABLE IF NOT EXISTS travel_social_accounts (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      company_id INTEGER NOT NULL,
	      platform TEXT NOT NULL
	        CHECK (platform IN ('facebook', 'tiktok')),
	      account_name TEXT NOT NULL,
	      account_handle TEXT,
	      external_id TEXT,
	      page_id TEXT,
	      posting_mode TEXT NOT NULL DEFAULT 'api'
	        CHECK (posting_mode IN ('api', 'draft')),
	      auto_publish INTEGER NOT NULL DEFAULT 0,
	      access_token TEXT,
	      refresh_token TEXT,
	      token_expires_at TEXT,
	      refresh_expires_at TEXT,
	      scopes TEXT,
	      profile_json TEXT,
	      last_sync_at TEXT,
	      status TEXT NOT NULL DEFAULT 'setup_required'
	        CHECK (status IN ('setup_required', 'active', 'paused')),
	      created_at TEXT NOT NULL DEFAULT (datetime('now')),
	      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
	      UNIQUE(company_id, platform)
	    );

	    CREATE TABLE IF NOT EXISTS travel_social_publish_jobs (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      company_id INTEGER NOT NULL,
	      social_post_id INTEGER NOT NULL,
	      account_id INTEGER,
	      platform TEXT NOT NULL
	        CHECK (platform IN ('facebook', 'tiktok')),
	      status TEXT NOT NULL DEFAULT 'queued'
	        CHECK (status IN ('queued', 'published', 'failed', 'manual_required')),
	      scheduled_at TEXT,
	      published_at TEXT,
	      external_post_id TEXT,
	      error TEXT,
	      response_json TEXT,
	      created_at TEXT NOT NULL DEFAULT (datetime('now')),
	      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
	      FOREIGN KEY (social_post_id) REFERENCES travel_social_posts(id) ON DELETE CASCADE,
	      FOREIGN KEY (account_id) REFERENCES travel_social_accounts(id) ON DELETE SET NULL
	    );

    CREATE TABLE IF NOT EXISTS mobile_app_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      device_code TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL DEFAULT 'Telefon',
      assigned_role TEXT NOT NULL DEFAULT 'Ospătar',
      pin_label TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      last_seen_at TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, device_code)
    );

    CREATE TABLE IF NOT EXISTS mobile_app_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      workflow_code TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      workflow_type TEXT NOT NULL DEFAULT 'COMENZI_SALA',
      target_role TEXT NOT NULL DEFAULT 'Ospătar',
      offline_enabled INTEGER NOT NULL DEFAULT 1,
      requires_pin INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, workflow_code)
    );

    CREATE TABLE IF NOT EXISTS mobile_app_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      task_number TEXT NOT NULL,
      workflow_type TEXT NOT NULL DEFAULT 'INVENTARIERE',
      title TEXT NOT NULL,
      location TEXT,
      assigned_role TEXT NOT NULL DEFAULT 'Operator',
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'DESCHIS',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, task_number)
    );

    CREATE TABLE IF NOT EXISTS mobile_app_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      session_number TEXT NOT NULL,
      device_id INTEGER,
      user_email TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVA',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (device_id) REFERENCES mobile_app_devices(id) ON DELETE SET NULL,
      UNIQUE(company_id, session_number)
    );

    CREATE TABLE IF NOT EXISTS scm_logistics_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      task_number TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'PICKING',
      warehouse_id INTEGER,
      source_location TEXT,
      destination_location TEXT,
      reference_doc TEXT,
      product_id INTEGER,
      product_name TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'buc',
      planned_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      responsible TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      UNIQUE(company_id, task_number)
    );

    CREATE TABLE IF NOT EXISTS scm_transport_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      transport_number TEXT NOT NULL,
      carrier_name TEXT,
      vehicle_number TEXT,
      driver_name TEXT,
      route_name TEXT,
      origin TEXT,
      destination TEXT,
      pickup_date TEXT,
      delivery_date TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      cost REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      client_name TEXT,
      tracking_code TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, transport_number)
    );

    CREATE TABLE IF NOT EXISTS scm_distribution_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      distribution_number TEXT NOT NULL,
      warehouse_id INTEGER,
      channel TEXT NOT NULL DEFAULT 'B2B',
      destination_region TEXT,
      route_name TEXT,
      planned_date TEXT NOT NULL DEFAULT (date('now')),
      delivery_window TEXT,
      orders_count INTEGER NOT NULL DEFAULT 0,
      parcels_count INTEGER NOT NULL DEFAULT 0,
      total_weight REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      UNIQUE(company_id, distribution_number)
    );

    CREATE TABLE IF NOT EXISTS scm_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      forecast_number TEXT NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      demand_source TEXT NOT NULL DEFAULT 'VANZARI',
      period_start TEXT,
      period_end TEXT,
      forecast_qty REAL NOT NULL DEFAULT 0,
      current_stock REAL NOT NULL DEFAULT 0,
      recommended_qty REAL NOT NULL DEFAULT 0,
      confidence_percent REAL NOT NULL DEFAULT 70,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      UNIQUE(company_id, forecast_number)
    );

    CREATE TABLE IF NOT EXISTS report_dashboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      dashboard_number TEXT NOT NULL,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'GENERAL',
      refresh_interval TEXT NOT NULL DEFAULT 'MANUAL',
      layout_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, dashboard_number)
    );

    CREATE TABLE IF NOT EXISTS report_kpis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      kpi_code TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      metric_key TEXT NOT NULL DEFAULT 'manual',
      target_value REAL NOT NULL DEFAULT 0,
      current_value REAL NOT NULL DEFAULT 0,
      unit TEXT,
      trend_direction TEXT NOT NULL DEFAULT 'STABIL',
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, kpi_code)
    );

    CREATE TABLE IF NOT EXISTS report_saved_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      report_number TEXT NOT NULL,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL DEFAULT 'VANZARI',
      source_module TEXT NOT NULL DEFAULT 'sales',
      period_start TEXT,
      period_end TEXT,
      filters_json TEXT NOT NULL DEFAULT '{}',
      format TEXT NOT NULL DEFAULT 'TABLE',
      status TEXT NOT NULL DEFAULT 'ACTIV',
      last_run_at TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, report_number)
    );

    CREATE TABLE IF NOT EXISTS report_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      export_number TEXT NOT NULL,
      report_id INTEGER,
      export_type TEXT NOT NULL DEFAULT 'RAPORT',
      file_format TEXT NOT NULL DEFAULT 'CSV',
      status TEXT NOT NULL DEFAULT 'GENERAT',
      row_count INTEGER NOT NULL DEFAULT 0,
      file_path TEXT,
      requested_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES report_saved_reports(id) ON DELETE SET NULL,
      UNIQUE(company_id, export_number)
    );

    CREATE TABLE IF NOT EXISTS facturi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_nr TEXT NOT NULL UNIQUE,
      an INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      contract_id INTEGER,
      quote_id INTEGER,
      status TEXT NOT NULL DEFAULT 'CIORNA',
      moneda TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      tva_procent REAL NOT NULL DEFAULT 0.19,
      tva_valoare REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      data_emitere TEXT NOT NULL DEFAULT (date('now')),
      scadenta TEXT,
      observatii TEXT,
      pdf_path TEXT,
      efactura_status TEXT,
      efactura_message_id TEXT,
      efactura_xml_path TEXT,
      efactura_last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      employee_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS facturi_linii (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL,
      denumire TEXT NOT NULL,
      descriere TEXT,
      cantitate REAL NOT NULL DEFAULT 1,
      unitate TEXT,
      pret_unitar REAL NOT NULL DEFAULT 0,
      total_linie REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (factura_id) REFERENCES facturi(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS tipizate_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      registration_number TEXT,
      registration_year INTEGER,
      registration_seq INTEGER,
      registered_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tipizate_register (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      registration_number TEXT NOT NULL,
      doc_id INTEGER,
      doc_title TEXT NOT NULL DEFAULT '',
      doc_category TEXT,
      file_name TEXT,
      file_path TEXT,
      issued_at TEXT,
      entry_type TEXT NOT NULL DEFAULT 'AUTO',
      recipient TEXT,
      notes TEXT,
      created_by_user_id INTEGER,
      created_by_email TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, registration_number),
      UNIQUE(company_id, doc_id)
    );

    CREATE TABLE IF NOT EXISTS dms_autofill_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      source_file_path TEXT NOT NULL,
      output_file_name TEXT NOT NULL,
      output_file_path TEXT NOT NULL,
      output_mime_type TEXT NOT NULL,
      template_type TEXT NOT NULL,
      matched_fields TEXT NOT NULL DEFAULT '[]',
      replacement_count INTEGER NOT NULL DEFAULT 0,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dms_client_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'ALTELE',
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      uploaded_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_code TEXT NOT NULL,
      title TEXT NOT NULL,
      client_id INTEGER,
      client_name TEXT,
      manager_name TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICARE',
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      start_date TEXT,
      due_date TEXT,
      completed_at TEXT,
      budget REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      progress INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      status TEXT NOT NULL DEFAULT 'DE_FACUT',
      due_date TEXT,
      completed_at TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'DOCUMENT',
      notes TEXT,
      uploaded_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'PLANIFICAT',
      notes TEXT,
      completed_at TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      details TEXT,
      actor_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      user_id INTEGER,
      actor_email TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS client_portal_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      ticket_number TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      status TEXT NOT NULL DEFAULT 'DESCHIS',
      created_by_user_id INTEGER,
      created_by_email TEXT,
      assigned_to_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(company_id, ticket_number)
    );

    CREATE TABLE IF NOT EXISTS client_portal_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      ticket_id INTEGER,
      project_id INTEGER,
      task_id INTEGER,
      entity_type TEXT NOT NULL DEFAULT 'MESSAGE',
      entity_id INTEGER,
      body TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'CLIENT',
      author_user_id INTEGER,
      author_email TEXT,
      author_role TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES client_portal_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS client_portal_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      ticket_id INTEGER,
      project_id INTEGER,
      task_id INTEGER,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'DOCUMENT',
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_by_user_id INTEGER,
      uploaded_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES client_portal_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      widget_config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(company_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      automation_number TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'RPA',
      source_module TEXT NOT NULL DEFAULT 'GENERAL',
      trigger_event TEXT NOT NULL DEFAULT 'MANUAL',
      action_type TEXT NOT NULL DEFAULT 'CREATE_NOTIFICATION',
      action_config_json TEXT NOT NULL DEFAULT '{}',
      schedule_label TEXT,
      owner_email TEXT,
      priority TEXT NOT NULL DEFAULT 'MEDIE',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, automation_number)
    );

    CREATE TABLE IF NOT EXISTS workflow_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      rule_number TEXT NOT NULL,
      name TEXT NOT NULL,
      applies_to TEXT NOT NULL DEFAULT 'GENERAL',
      trigger_event TEXT NOT NULL DEFAULT 'ON_CREATE',
      condition_field TEXT,
      condition_operator TEXT NOT NULL DEFAULT 'ALWAYS',
      condition_value TEXT,
      action_type TEXT NOT NULL DEFAULT 'CREATE_NOTIFICATION',
      action_target TEXT,
      severity TEXT NOT NULL DEFAULT 'MEDIE',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      stop_on_match INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, rule_number)
    );

    CREATE TABLE IF NOT EXISTS workflow_invoice_automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      automation_number TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger_event TEXT NOT NULL DEFAULT 'INVOICE_CREATED',
      invoice_status_filter TEXT,
      due_days INTEGER NOT NULL DEFAULT 0,
      client_filter TEXT,
      amount_min REAL NOT NULL DEFAULT 0,
      action_type TEXT NOT NULL DEFAULT 'CREATE_NOTIFICATION',
      notify_email TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      last_run_at TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, automation_number)
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      run_number TEXT NOT NULL,
      automation_id INTEGER,
      invoice_automation_id INTEGER,
      rule_id INTEGER,
      run_type TEXT NOT NULL DEFAULT 'MANUAL',
      status TEXT NOT NULL DEFAULT 'QUEUED',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      processed_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      actor_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (automation_id) REFERENCES workflow_automations(id) ON DELETE SET NULL,
      FOREIGN KEY (invoice_automation_id) REFERENCES workflow_invoice_automations(id) ON DELETE SET NULL,
      FOREIGN KEY (rule_id) REFERENCES workflow_rules(id) ON DELETE SET NULL,
      UNIQUE(company_id, run_number)
    );

    CREATE TABLE IF NOT EXISTS workflow_run_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      run_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL DEFAULT 1,
      step_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DONE',
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      approval_number TEXT NOT NULL,
      subject TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT 'GENERAL',
      entity_type TEXT,
      entity_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by_email TEXT,
      approver_email TEXT,
      due_date TEXT,
      decision_notes TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, approval_number)
    );

    CREATE TABLE IF NOT EXISTS workflow_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      notification_number TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'IN_APP',
      recipient TEXT,
      subject TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      related_module TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      scheduled_at TEXT,
      sent_at TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, notification_number)
    );

    CREATE TABLE IF NOT EXISTS anaf_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      message_id TEXT,
      factura_id INTEGER,
      direction TEXT,
      status TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anaf_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      environment TEXT NOT NULL DEFAULT 'test',
      access_token TEXT,
      refresh_token TEXT,
      token_type TEXT,
      scope TEXT,
      expires_at TEXT,
      refresh_expires_at TEXT,
      serial_certificate TEXT,
      raw_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anaf_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT,
      supplier_cui TEXT,
      buyer_cui TEXT,
      invoice_number TEXT,
      message_type TEXT,
      details TEXT,
      download_id TEXT,
      zip_path TEXT,
      xml_path TEXT,
      pdf_path TEXT,
      source_environment TEXT,
      received_at TEXT,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anaf_oauth_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      status TEXT,
      details TEXT,
      query_string TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anaf_oauth_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      environment TEXT NOT NULL DEFAULT 'test',
      invite_type TEXT NOT NULL DEFAULT 'REAUTHORIZE',
      code_hash TEXT NOT NULL,
      accountant_email TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      completed_at TEXT,
      last_error TEXT,
      created_by_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      position TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hr_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      contract_number TEXT NOT NULL,
      contract_type TEXT NOT NULL DEFAULT 'CIM',
      start_date TEXT NOT NULL DEFAULT (date('now')),
      end_date TEXT,
      salary_base REAL NOT NULL DEFAULT 0,
      work_norm TEXT NOT NULL DEFAULT '8h/zi',
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      document_path TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(company_id, contract_number)
    );

    CREATE TABLE IF NOT EXISTS hr_payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      run_number TEXT NOT NULL,
      period_label TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      payment_date TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      total_gross REAL NOT NULL DEFAULT 0,
      total_net REAL NOT NULL DEFAULT 0,
      total_taxes REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, run_number)
    );

    CREATE TABLE IF NOT EXISTS hr_payroll_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      run_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      base_salary REAL NOT NULL DEFAULT 0,
      gross_pay REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0,
      employer_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(company_id, run_id, employee_id)
    );

    CREATE TABLE IF NOT EXISTS hr_leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      leave_number TEXT NOT NULL,
      leave_type TEXT NOT NULL DEFAULT 'ODIHNA',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT,
      notes TEXT,
      created_by_email TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(company_id, leave_number)
    );

    CREATE TABLE IF NOT EXISTS hr_timesheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      work_date TEXT NOT NULL DEFAULT (date('now')),
      hours_worked REAL NOT NULL DEFAULT 8,
      overtime_hours REAL NOT NULL DEFAULT 0,
      leave_hours REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(company_id, employee_id, work_date)
    );

    CREATE TABLE IF NOT EXISTS hr_recruitment_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      candidate_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      position TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'APLICAT',
      source TEXT,
      expected_salary REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hr_performance_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      review_period TEXT NOT NULL,
      review_date TEXT NOT NULL DEFAULT (date('now')),
      reviewer TEXT,
      score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      strengths TEXT,
      goals TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS accounting_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      expense_type TEXT NOT NULL DEFAULT 'FACTURA',
      category TEXT,
      supplier_name TEXT NOT NULL,
      supplier_cui TEXT,
      doc_number TEXT,
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT,
      payment_status TEXT NOT NULL DEFAULT 'NEPLATITA',
      deductible_percent REAL NOT NULL DEFAULT 100,
      currency TEXT NOT NULL DEFAULT 'RON',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      attachment_path TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting_declarations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      declaration_type TEXT NOT NULL,
      period_label TEXT,
      period_start TEXT,
      period_end TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'PREGATITA',
      submission_channel TEXT NOT NULL DEFAULT 'MANUAL_SPV',
      reference_number TEXT,
      attachment_path TEXT,
      receipt_path TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting_cash_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      direction TEXT NOT NULL DEFAULT 'OUT',
      transaction_date TEXT NOT NULL DEFAULT (date('now')),
      partner_name TEXT,
      partner_cui TEXT,
      document_type TEXT,
      document_number TEXT,
      category TEXT,
      payment_method TEXT NOT NULL DEFAULT 'BANCA',
      bank_account TEXT,
      amount REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'NECORELATA',
      matched_document_type TEXT,
      matched_document_id INTEGER,
      notes TEXT,
      attachment_path TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      document_type TEXT,
      document_number TEXT,
      partner_name TEXT,
      account_debit TEXT NOT NULL,
      account_credit TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      tax_code TEXT,
      description TEXT,
      source_type TEXT NOT NULL DEFAULT 'MANUAL',
      source_id INTEGER,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      period_label TEXT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      budget_type TEXT NOT NULL DEFAULT 'CHELTUIALA',
      category TEXT NOT NULL,
      planned_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      owner TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting_bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bank_name TEXT,
      account_iban TEXT,
      transaction_date TEXT NOT NULL DEFAULT (date('now')),
      value_date TEXT,
      direction TEXT NOT NULL DEFAULT 'OUT',
      partner_name TEXT,
      description TEXT,
      reference TEXT,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RON',
      reconciliation_status TEXT NOT NULL DEFAULT 'NECORELATA',
      matched_cash_transaction_id INTEGER,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (matched_cash_transaction_id) REFERENCES accounting_cash_transactions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS consumption_vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      voucher_number TEXT NOT NULL,
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      department TEXT,
      issued_to TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consumption_voucher_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_cost REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      company_id INTEGER,
      FOREIGN KEY (voucher_id) REFERENCES consumption_vouchers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      asset_code TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'MOBIL',
      asset_type TEXT NOT NULL DEFAULT 'MIJLOC_FIX',
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity_scriptic REAL NOT NULL DEFAULT 1,
      minimum_quantity REAL NOT NULL DEFAULT 0,
      location TEXT,
      serial_number TEXT,
      purchase_date TEXT,
      purchase_value REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'IN_STOC',
      supplier_name TEXT,
      invoice_number TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_code TEXT NOT NULL,
      project_name TEXT NOT NULL,
      client_name TEXT,
      location TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_project_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      asset_id INTEGER,
      asset_code TEXT,
      asset_name TEXT NOT NULL,
      quantity_allocated REAL NOT NULL DEFAULT 1,
      quantity_returned REAL NOT NULL DEFAULT 0,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_by_email TEXT,
      notes TEXT,
      FOREIGN KEY (project_id) REFERENCES inventory_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES inventory_assets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      count_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'DRAFT',
      source_file_name TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      count_id INTEGER NOT NULL,
      asset_id INTEGER,
      stock_item_id INTEGER,
      warehouse_id INTEGER,
      asset_code TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      quantity_scriptic REAL NOT NULL DEFAULT 0,
      quantity_counted REAL NOT NULL DEFAULT 0,
      variance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      applied INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES inventory_assets(id) ON DELETE SET NULL,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL,
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      count_id INTEGER,
      asset_code TEXT NOT NULL,
      quantity_before REAL NOT NULL DEFAULT 0,
      quantity_after REAL NOT NULL DEFAULT 0,
      variance REAL NOT NULL DEFAULT 0,
      reason TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (asset_id) REFERENCES inventory_assets(id) ON DELETE CASCADE,
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      warehouse_code TEXT NOT NULL,
      name TEXT NOT NULL,
      warehouse_type TEXT NOT NULL DEFAULT 'DEPOZIT',
      address TEXT,
      manager_name TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, warehouse_code)
    );

    CREATE TABLE IF NOT EXISTS inventory_stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      warehouse_id INTEGER,
      product_id INTEGER,
      asset_id INTEGER,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'PRODUS',
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity REAL NOT NULL DEFAULT 0,
      reserved_quantity REAL NOT NULL DEFAULT 0,
      minimum_quantity REAL NOT NULL DEFAULT 0,
      bin_location TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (asset_id) REFERENCES inventory_assets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      warehouse_id INTEGER,
      product_id INTEGER,
      stock_item_id INTEGER,
      lot_number TEXT NOT NULL,
      serial_number TEXT,
      item_name TEXT NOT NULL,
      quantity_initial REAL NOT NULL DEFAULT 0,
      quantity_available REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'buc',
      received_at TEXT,
      expiry_date TEXT,
      supplier_name TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      transfer_number TEXT NOT NULL,
      from_warehouse_id INTEGER,
      to_warehouse_id INTEGER,
      transfer_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'DRAFT',
      requested_by TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (to_warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      UNIQUE(company_id, transfer_number)
    );

    CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      transfer_id INTEGER NOT NULL,
      stock_item_id INTEGER,
      product_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity REAL NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL,
      warehouse_id INTEGER,
      supplier_name TEXT,
      receipt_date TEXT NOT NULL DEFAULT (date('now')),
      document_number TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      UNIQUE(company_id, receipt_number)
    );

    CREATE TABLE IF NOT EXISTS inventory_receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      receipt_id INTEGER NOT NULL,
      product_id INTEGER,
      stock_item_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity REAL NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      lot_number TEXT,
      serial_number TEXT,
      expiry_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_pickings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      picking_number TEXT NOT NULL,
      warehouse_id INTEGER,
      client_name TEXT,
      project_name TEXT,
      scheduled_date TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      UNIQUE(company_id, picking_number)
    );

    CREATE TABLE IF NOT EXISTS inventory_picking_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      picking_id INTEGER NOT NULL,
      stock_item_id INTEGER,
      product_id INTEGER,
      item_code TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'buc',
      quantity_requested REAL NOT NULL DEFAULT 1,
      quantity_picked REAL NOT NULL DEFAULT 0,
      quantity_packed REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (picking_id) REFERENCES inventory_pickings(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES inventory_stock_items(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      product_id INTEGER,
      asset_id INTEGER,
      lot_id INTEGER,
      barcode_value TEXT NOT NULL,
      barcode_type TEXT NOT NULL DEFAULT 'CODE128',
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIV',
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (asset_id) REFERENCES inventory_assets(id) ON DELETE SET NULL,
      FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE SET NULL,
      UNIQUE(company_id, barcode_value)
    );

    CREATE INDEX IF NOT EXISTS idx_clients_cui ON clients(cui);
    CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_year_seq ON contracts(year, seq);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_activities_client_id ON activities(client_id);
    CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
    CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
    CREATE INDEX IF NOT EXISTS idx_activities_done ON activities(done);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_company_status ON crm_leads(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_company_created ON crm_leads(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_company_stage ON crm_opportunities(company_id, stage);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_client ON crm_opportunities(company_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_crm_followups_company_due ON crm_followups(company_id, due_date, status);
    CREATE INDEX IF NOT EXISTS idx_crm_followups_company_status ON crm_followups(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_company_status ON crm_email_events(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_company_created ON crm_email_events(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_year_seq ON quotes(year, seq);
    CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
    CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_imports_company_year_seq ON sales_quote_imports(company_id, year, seq);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_imports_client_id ON sales_quote_imports(company_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_imports_created_at ON sales_quote_imports(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_company_id ON sales_orders(company_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_client_id ON sales_orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON sales_orders(order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id ON sales_order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_sales_price_lists_company_id ON sales_price_lists(company_id);
    CREATE INDEX IF NOT EXISTS idx_sales_price_items_list_id ON sales_price_items(price_list_id);
    CREATE INDEX IF NOT EXISTS idx_sales_discounts_company_id ON sales_discounts(company_id);
    CREATE INDEX IF NOT EXISTS idx_sales_discounts_status ON sales_discounts(status);
    CREATE INDEX IF NOT EXISTS idx_sales_deliveries_company_id ON sales_deliveries(company_id);
    CREATE INDEX IF NOT EXISTS idx_sales_deliveries_order_id ON sales_deliveries(order_id);
    CREATE INDEX IF NOT EXISTS idx_sales_deliveries_status ON sales_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_order_lifecycle_company_order ON order_lifecycle_events(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_order_lifecycle_company_date ON order_lifecycle_events(company_id, event_date DESC);
    CREATE INDEX IF NOT EXISTS idx_order_fulfillment_company_order ON order_fulfillment_tasks(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_order_fulfillment_company_status ON order_fulfillment_tasks(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_order_tracking_company_order ON order_tracking_events(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_order_tracking_company_delivery ON order_tracking_events(company_id, delivery_id);
    CREATE INDEX IF NOT EXISTS idx_order_tracking_company_date ON order_tracking_events(company_id, event_date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_delivery_items_delivery_id ON sales_delivery_items(delivery_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_suppliers_company_status ON procurement_suppliers(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_orders_company_status ON procurement_orders(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_orders_supplier_id ON procurement_orders(company_id, supplier_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_order_items_order_id ON procurement_order_items(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_company_status ON procurement_receipts(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_order_id ON procurement_receipts(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipt_items_receipt_id ON procurement_receipt_items(company_id, receipt_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_approvals_company_status ON procurement_approvals(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_costs_company_date ON procurement_costs(company_id, cost_date DESC);
    CREATE INDEX IF NOT EXISTS idx_procurement_bills_company_status ON procurement_bills(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_bills_supplier_id ON procurement_bills(company_id, supplier_id);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_boms_company_status ON manufacturing_boms(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_boms_product ON manufacturing_boms(company_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_items_bom ON manufacturing_bom_items(company_id, bom_id);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_company_status ON manufacturing_orders(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_product ON manufacturing_orders(company_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_order_materials_order ON manufacturing_order_materials(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_plans_status ON manufacturing_plans(company_id, status, required_date);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_issues_order ON manufacturing_material_issues(company_id, order_id, status);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_costs_order ON manufacturing_costs(company_id, order_id, cost_date DESC);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_quality_order ON manufacturing_quality_checks(company_id, order_id, check_date DESC);
    CREATE INDEX IF NOT EXISTS idx_horeca_tables_status ON horeca_tables(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_horeca_reservations_date ON horeca_reservations(company_id, reservation_date, reservation_time);
    CREATE INDEX IF NOT EXISTS idx_horeca_menu_status ON horeca_menu_items(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_horeca_orders_status ON horeca_orders(company_id, status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_horeca_order_items_order ON horeca_order_items(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_travel_leads_company_status ON travel_leads(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_travel_leads_company_followup ON travel_leads(company_id, next_follow_up_at, status);
    CREATE INDEX IF NOT EXISTS idx_travel_leads_company_created ON travel_leads(company_id, created_at DESC);
	    CREATE INDEX IF NOT EXISTS idx_travel_properties_company_status ON travel_properties(company_id, status);
	    CREATE INDEX IF NOT EXISTS idx_travel_properties_company_lead ON travel_properties(company_id, lead_id);
	    CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_properties_company_lead_unique ON travel_properties(company_id, lead_id) WHERE lead_id IS NOT NULL;
	    CREATE INDEX IF NOT EXISTS idx_travel_properties_company_created ON travel_properties(company_id, created_at DESC);
	    CREATE INDEX IF NOT EXISTS idx_travel_agency_leads_company_status ON travel_agency_leads(company_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_leads_company_country ON travel_agency_leads(company_id, country, status);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_leads_company_email ON travel_agency_leads(company_id, email);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_leads_company_source ON travel_agency_leads(company_id, source, status);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_offers_company_agency ON travel_agency_offers(company_id, agency_id, status);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_offers_company_status ON travel_agency_offers(company_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_photos_agency ON travel_agency_photos(company_id, agency_id, photo_type, sort_order);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_inquiries_agency ON travel_agency_inquiries(company_id, agency_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_offer_clicks_agency ON travel_agency_offer_clicks(company_id, agency_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_offer_clicks_offer ON travel_agency_offer_clicks(company_id, offer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_reviews_agency ON travel_agency_reviews(company_id, agency_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_agency_reviews_offer ON travel_agency_reviews(company_id, offer_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_local_partners_status ON travel_local_partners(company_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_local_partners_type ON travel_local_partners(company_id, partner_type, status);
    CREATE INDEX IF NOT EXISTS idx_travel_local_partners_contact ON travel_local_partners(company_id, email, website);
    CREATE INDEX IF NOT EXISTS idx_travel_local_partners_region ON travel_local_partners(company_id, region, city);
    CREATE INDEX IF NOT EXISTS idx_travel_property_reviews_property ON travel_property_reviews(company_id, property_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_property_inquiries_company_status ON travel_property_inquiries(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_property_inquiries_company_created ON travel_property_inquiries(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_property_inquiries_property ON travel_property_inquiries(company_id, property_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_booking_requests_company_status ON travel_booking_requests(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_booking_requests_property_created ON travel_booking_requests(company_id, property_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_booking_requests_email ON travel_booking_requests(company_id, email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_booking_requests_room_period ON travel_booking_requests(company_id, property_id, room_id, status, check_in, check_out);
    CREATE INDEX IF NOT EXISTS idx_travel_property_photos_property_order ON travel_property_photos(company_id, property_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_travel_property_rooms_property_order ON travel_property_rooms(company_id, property_id, status, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_travel_property_rate_packages_property ON travel_property_rate_packages(company_id, property_id, status, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_travel_property_room_rate_periods_property_dates ON travel_property_room_rate_periods(company_id, property_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_travel_property_room_rate_periods_room_dates ON travel_property_room_rate_periods(company_id, property_id, room_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_travel_property_rate_plan_prices_lookup ON travel_property_rate_plan_prices(company_id, property_id, rate_package_id, room_id, rate_date);
    CREATE INDEX IF NOT EXISTS idx_travel_property_pynbooking_property ON travel_property_pynbooking_integrations(company_id, property_id, sync_status);
    CREATE INDEX IF NOT EXISTS idx_travel_property_calendar_links_property ON travel_property_calendar_links(company_id, property_id, sync_status);
    CREATE INDEX IF NOT EXISTS idx_travel_property_calendar_blocks_property_date ON travel_property_calendar_blocks(company_id, property_id, block_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_property_calendar_blocks_link_date ON travel_property_calendar_blocks(company_id, property_id, calendar_link_id, block_date) WHERE calendar_link_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_travel_owner_events_company_created ON travel_owner_account_events(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_owner_events_property_created ON travel_owner_account_events(company_id, property_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_owner_events_severity_created ON travel_owner_account_events(company_id, severity, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_owner_events_type_created ON travel_owner_account_events(company_id, event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_owner_password_reset_token ON travel_owner_password_reset_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_travel_owner_password_reset_property ON travel_owner_password_reset_tokens(company_id, property_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_owner_password_reset_email ON travel_owner_password_reset_tokens(company_id, account_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_site_pageviews_company_created ON travel_site_pageviews(company_id, site, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_site_pageviews_visitor_created ON travel_site_pageviews(company_id, visitor_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_site_pageviews_path_created ON travel_site_pageviews(company_id, path, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_site_pageviews_property_created ON travel_site_pageviews(company_id, property_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_lead_activities_lead_created ON travel_lead_activities(company_id, lead_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_lead_activities_type ON travel_lead_activities(company_id, activity_type, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_email_messages_provider_unique ON travel_email_messages(company_id, mailbox, provider_message_id);
    CREATE INDEX IF NOT EXISTS idx_travel_email_messages_company_received ON travel_email_messages(company_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_email_messages_lead_received ON travel_email_messages(company_id, lead_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_email_messages_lead_direction ON travel_email_messages(company_id, lead_id, direction, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_email_messages_direction_email_norm ON travel_email_messages(company_id, direction, lower(trim(to_email)));
    CREATE INDEX IF NOT EXISTS idx_travel_support_tickets_company_status ON travel_support_tickets(company_id, status, opened_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_support_tickets_company_email ON travel_support_tickets(company_id, requester_email, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_support_ticket_messages_ticket ON travel_support_ticket_messages(company_id, ticket_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_whatsapp_events_company_received ON travel_whatsapp_events(company_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_whatsapp_events_message ON travel_whatsapp_events(company_id, provider_message_id);
    CREATE INDEX IF NOT EXISTS idx_travel_whatsapp_events_phone ON travel_whatsapp_events(company_id, from_phone, to_phone);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_scoring_settings_company_unique ON travel_scoring_settings(company_id);
    CREATE INDEX IF NOT EXISTS idx_travel_content_templates_company_type ON travel_content_templates(company_id, template_type, status);
    CREATE INDEX IF NOT EXISTS idx_travel_content_jobs_company_created ON travel_content_jobs(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_travel_content_jobs_company_property ON travel_content_jobs(company_id, property_id, job_type);
	    CREATE INDEX IF NOT EXISTS idx_travel_blog_articles_company_property ON travel_blog_articles(company_id, property_id, status);
	    CREATE INDEX IF NOT EXISTS idx_travel_blog_articles_company_slug ON travel_blog_articles(company_id, slug);
	    CREATE INDEX IF NOT EXISTS idx_travel_social_posts_company_platform ON travel_social_posts(company_id, platform, status);
	    CREATE INDEX IF NOT EXISTS idx_travel_social_posts_company_property ON travel_social_posts(company_id, property_id, created_at DESC);
	    CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_social_accounts_company_platform_unique ON travel_social_accounts(company_id, platform);
	    CREATE INDEX IF NOT EXISTS idx_travel_social_publish_jobs_status ON travel_social_publish_jobs(company_id, status, scheduled_at);
	    CREATE INDEX IF NOT EXISTS idx_travel_social_publish_jobs_post ON travel_social_publish_jobs(company_id, social_post_id, created_at DESC);
	    CREATE INDEX IF NOT EXISTS idx_mobile_devices_status ON mobile_app_devices(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_mobile_workflows_type ON mobile_app_workflows(company_id, workflow_type, status);
    CREATE INDEX IF NOT EXISTS idx_mobile_tasks_status ON mobile_app_tasks(company_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_mobile_sessions_status ON mobile_app_sessions(company_id, status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scm_logistics_status ON scm_logistics_tasks(company_id, status, planned_date);
    CREATE INDEX IF NOT EXISTS idx_scm_logistics_warehouse ON scm_logistics_tasks(company_id, warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_scm_transport_status ON scm_transport_orders(company_id, status, pickup_date);
    CREATE INDEX IF NOT EXISTS idx_scm_distribution_status ON scm_distribution_plans(company_id, status, planned_date);
    CREATE INDEX IF NOT EXISTS idx_scm_distribution_warehouse ON scm_distribution_plans(company_id, warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_scm_forecasts_product ON scm_forecasts(company_id, product_id, period_start);
    CREATE INDEX IF NOT EXISTS idx_scm_forecasts_status ON scm_forecasts(company_id, status, period_start);
    CREATE INDEX IF NOT EXISTS idx_report_dashboards_status ON report_dashboards(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_report_kpis_category ON report_kpis(company_id, category, status);
    CREATE INDEX IF NOT EXISTS idx_report_saved_type ON report_saved_reports(company_id, report_type, status);
    CREATE INDEX IF NOT EXISTS idx_report_exports_report ON report_exports(company_id, report_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_facturi_client_id ON facturi(client_id);
    CREATE INDEX IF NOT EXISTS idx_facturi_an_seq ON facturi(an, seq);
    CREATE INDEX IF NOT EXISTS idx_facturi_status ON facturi(status);
    CREATE INDEX IF NOT EXISTS idx_facturi_linii_factura_id ON facturi_linii(factura_id);
    CREATE INDEX IF NOT EXISTS idx_anaf_connections_environment ON anaf_connections(environment);
    CREATE INDEX IF NOT EXISTS idx_anaf_inbox_received_at ON anaf_inbox(received_at);
    CREATE INDEX IF NOT EXISTS idx_tipizate_register_company_year_seq ON tipizate_register(company_id, year, seq);
    CREATE INDEX IF NOT EXISTS idx_tipizate_register_doc ON tipizate_register(company_id, doc_id);
    CREATE INDEX IF NOT EXISTS idx_dms_autofill_company_created ON dms_autofill_documents(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_projects_company_status ON projects(company_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_company_code_unique ON projects(company_id, project_code);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status ON project_tasks(company_id, project_id, status);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date ON project_tasks(company_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(company_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(company_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(company_id, project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created ON activity_logs(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_client_created ON activity_logs(company_id, client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(company_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_client_portal_tickets_client_status ON client_portal_tickets(company_id, client_id, status);
    CREATE INDEX IF NOT EXISTS idx_client_portal_tickets_created ON client_portal_tickets(company_id, client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_portal_comments_client_created ON client_portal_comments(company_id, client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_portal_comments_ticket ON client_portal_comments(company_id, ticket_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_client_portal_uploads_client_created ON client_portal_uploads(company_id, client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_portal_uploads_ticket ON client_portal_uploads(company_id, ticket_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dashboard_preferences_user ON dashboard_preferences(company_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_hr_contracts_employee ON hr_contracts(company_id, employee_id);
    CREATE INDEX IF NOT EXISTS idx_hr_contracts_status ON hr_contracts(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_payroll_runs_company_period ON hr_payroll_runs(company_id, period_label);
    CREATE INDEX IF NOT EXISTS idx_hr_payroll_items_run ON hr_payroll_items(company_id, run_id);
    CREATE INDEX IF NOT EXISTS idx_hr_leave_employee_status ON hr_leave_requests(company_id, employee_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_leave_dates ON hr_leave_requests(company_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_hr_timesheets_date ON hr_timesheets(company_id, work_date);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_stage ON hr_recruitment_candidates(company_id, stage);
    CREATE INDEX IF NOT EXISTS idx_hr_reviews_employee ON hr_performance_reviews(company_id, employee_id, review_date);
    CREATE INDEX IF NOT EXISTS idx_workflow_automations_status ON workflow_automations(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_rules_status ON workflow_rules(company_id, applies_to, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_invoice_automations_status ON workflow_invoice_automations(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(company_id, run_id, step_order);
    CREATE INDEX IF NOT EXISTS idx_workflow_approvals_status ON workflow_approvals(company_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_workflow_notifications_status ON workflow_notifications(company_id, status, scheduled_at);
  `);

  ensureColumn("users", "module_permissions", "TEXT");
  ensureColumn("users", "company_id", "INTEGER");
  ensureColumn("users", "status", "TEXT DEFAULT 'active'");
  ensureColumn("users", "is_company_admin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "client_id", "INTEGER");
  ensureColumn("users", "totp_secret", "TEXT");
  ensureColumn("users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "totp_confirmed_at", "TEXT");
  ensureColumn("users", "totp_last_used_step", "INTEGER");
  ensureColumn("users", "totp_failed_attempts", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "totp_locked_until", "TEXT");
  ensureColumn("users", "language", "TEXT NOT NULL DEFAULT 'ro'");
  ensureColumn("companies", "stripe_customer_id", "TEXT");
  ensureColumn("companies", "is_demo", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("companies", "demo_expires_at", "TEXT");
  ensureColumn("companies", "suspension_reason", "TEXT");
  ensureColumn("companies", "suspended_at", "TEXT");
  ensureColumn("companies", "suspended_by_email", "TEXT");
  ensureColumn("companies", "archived_at", "TEXT");
  ensureColumn("companies", "archived_by_email", "TEXT");
  ensureColumn("companies", "archived_previous_status", "TEXT");
  ensureColumn("companies", "archive_reason", "TEXT");
  ensureColumn("companies", "country", "TEXT NOT NULL DEFAULT 'Romania'");
  ensureColumn("travel_properties", "amenities", "TEXT");
  ensureColumn("travel_properties", "description", "TEXT");
  ensureColumn("travel_properties", "tourist_zone", "TEXT");
  ensureColumn("travel_properties", "meal_types", "TEXT");
  ensureColumn("travel_properties", "promo_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_properties", "promo_badge", "TEXT");
  ensureColumn("travel_properties", "promo_title", "TEXT");
  ensureColumn("travel_properties", "promo_text", "TEXT");
  ensureColumn("travel_properties", "promo_valid_until", "TEXT");
  ensureColumn("travel_properties", "max_adults", "INTEGER NOT NULL DEFAULT 2");
  ensureColumn("travel_properties", "max_children", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_properties", "child_free_age", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_properties", "child_paid_from_age", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_properties", "child_price_ron", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_properties", "price_per_night", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_properties", "price_currency", "TEXT NOT NULL DEFAULT 'RON'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS travel_partner_property_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      external_property_id TEXT NOT NULL,
      property_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      payload_json TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, provider, external_property_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS travel_partner_webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      property_id INTEGER,
      booking_request_id INTEGER,
      event_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      target_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'error', 'skipped')),
      attempts INTEGER NOT NULL DEFAULT 0,
      response_status INTEGER NOT NULL DEFAULT 0,
      response_body TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE SET NULL,
      FOREIGN KEY (booking_request_id) REFERENCES travel_booking_requests(id) ON DELETE SET NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_partner_mappings_property ON travel_partner_property_mappings(company_id, provider, property_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_partner_webhook_deliveries_booking ON travel_partner_webhook_deliveries(company_id, provider, booking_request_id, event_type)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS travel_property_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      beds TEXT,
      amenities TEXT,
      size_sqm INTEGER NOT NULL DEFAULT 0,
      max_adults INTEGER NOT NULL DEFAULT 2,
      max_children INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_per_night INTEGER NOT NULL DEFAULT 0,
      price_currency TEXT NOT NULL DEFAULT 'RON',
      external_provider TEXT,
      external_room_id TEXT,
      external_rate_plan_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_travel_property_rooms_property_order ON travel_property_rooms(company_id, property_id, status, sort_order, id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS travel_property_rate_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'mic-dejun',
      pricing_mode TEXT NOT NULL DEFAULT 'per_person'
        CHECK (pricing_mode IN ('per_person', 'per_room', 'package')),
      adult_price INTEGER NOT NULL DEFAULT 0,
      child_price INTEGER NOT NULL DEFAULT 0,
      room_price INTEGER NOT NULL DEFAULT 0,
      package_price INTEGER NOT NULL DEFAULT 0,
      min_nights INTEGER NOT NULL DEFAULT 1,
      included_nights INTEGER NOT NULL DEFAULT 0,
      includes_treatment INTEGER NOT NULL DEFAULT 0,
      child_paid_from_age INTEGER NOT NULL DEFAULT 0,
      max_adults INTEGER NOT NULL DEFAULT 0,
      max_children INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_travel_property_rate_packages_property ON travel_property_rate_packages(company_id, property_id, status, sort_order, id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS travel_property_rate_plan_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      rate_package_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      rate_date TEXT NOT NULL,
      price_1p INTEGER NOT NULL DEFAULT 0,
      price_2p INTEGER NOT NULL DEFAULT 0,
      extra_bed_price INTEGER NOT NULL DEFAULT 0,
      child_price INTEGER NOT NULL DEFAULT 0,
      child_extra_bed_price INTEGER NOT NULL DEFAULT 0,
      available_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'blocked')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES travel_properties(id) ON DELETE CASCADE,
      FOREIGN KEY (rate_package_id) REFERENCES travel_property_rate_packages(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES travel_property_rooms(id) ON DELETE CASCADE,
      UNIQUE (company_id, property_id, rate_package_id, room_id, rate_date)
    );
    CREATE INDEX IF NOT EXISTS idx_travel_property_rate_plan_prices_lookup ON travel_property_rate_plan_prices(company_id, property_id, rate_package_id, room_id, rate_date);
  `);
  ensureColumn("travel_property_rate_packages", "child_paid_from_age", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_property_rooms", "size_sqm", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_property_rooms", "external_provider", "TEXT");
  ensureColumn("travel_property_rooms", "external_room_id", "TEXT");
  ensureColumn("travel_property_rooms", "external_rate_plan_id", "TEXT");
  ensureColumn("travel_property_rate_packages", "external_provider", "TEXT");
  ensureColumn("travel_property_rate_packages", "external_rate_plan_id", "TEXT");
  ensureColumn("travel_property_rate_packages", "cancellation_policy_json", "TEXT");
  ensureColumn("travel_property_rate_packages", "payment_policy_json", "TEXT");
  ensureColumn("travel_property_room_rate_periods", "external_provider", "TEXT");
  ensureColumn("travel_property_room_rate_periods", "external_room_id", "TEXT");
  ensureColumn("travel_property_room_rate_periods", "external_rate_plan_id", "TEXT");
  ensureColumn("travel_booking_requests", "rate_package_id", "INTEGER");
  ensureColumn("travel_booking_requests", "rate_package_title", "TEXT");
  ensureColumn("travel_booking_requests", "rate_package_pricing_mode", "TEXT");
  ensureColumn("travel_booking_requests", "rate_package_total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("travel_booking_requests", "rate_package_details", "TEXT");
  ensureColumn("travel_booking_requests", "booking_channel", "TEXT NOT NULL DEFAULT 'manual_request'");
  ensureColumn("travel_booking_requests", "availability_provider", "TEXT NOT NULL DEFAULT 'trevoro'");
  ensureColumn("travel_booking_requests", "payment_flow", "TEXT NOT NULL DEFAULT 'owner_policy'");
  ensureColumn("travel_booking_requests", "external_provider", "TEXT");
  ensureColumn("travel_booking_requests", "external_reservation_id", "TEXT");
  ensureColumn("travel_booking_requests", "pynbooking_reservation_id", "TEXT");
  ensureColumn("travel_booking_requests", "external_reservation_status", "TEXT");
  ensureColumn("travel_booking_requests", "external_error", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_property_rooms_external ON travel_property_rooms(company_id, property_id, external_provider, external_room_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_room_rate_periods_external ON travel_property_room_rate_periods(company_id, property_id, external_provider, external_room_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_booking_requests_external ON travel_booking_requests(company_id, external_provider, external_reservation_id)");
  ensureColumn("travel_leads", "enrichment_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("travel_leads", "last_enriched_at", "TEXT");
  ensureColumn("travel_leads", "enrichment_error", "TEXT");
  ensureColumn("travel_leads", "enrichment_source_url", "TEXT");
  ensureColumn("travel_leads", "email_retry_priority", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("travel_leads", "email_retry_reason", "TEXT");
  ensureColumn("travel_leads", "email_retry_ready_at", "TEXT");
  ensureColumn("travel_leads", "whatsapp_phone", "TEXT");
  ensureColumn("travel_leads", "whatsapp_opt_in_status", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn("travel_leads", "whatsapp_opt_in_source", "TEXT");
  ensureColumn("travel_leads", "whatsapp_opt_in_at", "TEXT");
  ensureColumn("travel_leads", "whatsapp_last_contacted_at", "TEXT");
  ensureColumn("travel_leads", "whatsapp_status", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn("travel_leads", "whatsapp_notes", "TEXT");
  ensureColumn("travel_leads", "linkedin", "TEXT");
  ensureColumn("travel_leads", "contact_page_url", "TEXT");
  ensureColumn("travel_leads", "contact_person", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_travel_leads_enrichment ON travel_leads(company_id, enrichment_status, last_enriched_at);
    CREATE INDEX IF NOT EXISTS idx_travel_leads_retry_priority ON travel_leads(company_id, email_retry_priority DESC, email_retry_ready_at, status);
    CREATE INDEX IF NOT EXISTS idx_travel_leads_whatsapp ON travel_leads(company_id, whatsapp_opt_in_status, whatsapp_last_contacted_at);
  `);
  ensureColumn("travel_social_posts", "media_url", "TEXT");
  ensureColumn("travel_social_accounts", "refresh_expires_at", "TEXT");
  ensureColumn("travel_social_accounts", "scopes", "TEXT");
  ensureColumn("travel_social_accounts", "profile_json", "TEXT");
  ensureColumn("travel_social_accounts", "last_sync_at", "TEXT");
  ensureColumn("travel_email_messages", "detected_language", "TEXT");
  ensureColumn("travel_email_messages", "detected_language_name", "TEXT");
  ensureColumn("travel_email_messages", "translation_ro", "TEXT");
  ensureColumn("travel_email_messages", "translation_status", "TEXT");
  ensureColumn("travel_email_messages", "translation_model", "TEXT");
  ensureColumn("travel_email_messages", "translation_updated_at", "TEXT");
  ensureColumn("travel_email_messages", "reply_language", "TEXT");
  ensureColumn("travel_email_messages", "reply_language_name", "TEXT");
  ensureColumn("plans", "pricing_model", "TEXT NOT NULL DEFAULT 'flat'");
  ensureColumn("plans", "max_modules_per_user", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("plans", "max_active_modules", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("plans", "tagline", "TEXT");
  ensureColumn("plans", "description", "TEXT");
  ensureColumn("plans", "features_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("plans", "support_copy", "TEXT");
  ensureColumn("plans", "extra_dev_copy", "TEXT");
  ensureColumn("plans", "image_path", "TEXT");
  ensureColumn("plans", "is_public", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("plans", "sort_order", "INTEGER NOT NULL DEFAULT 100");
  ensureColumn("company_subscriptions", "stripe_subscription_id", "TEXT");
  ensureColumn("company_subscriptions", "stripe_checkout_session_id", "TEXT");
  ensureColumn("company_subscriptions", "stripe_price_id", "TEXT");
  ensureColumn("company_subscriptions", "billing_currency", "TEXT DEFAULT 'eur'");
  ensureColumn("company_subscriptions", "billing_email", "TEXT");
  ensureColumn("company_subscriptions", "current_period_end", "TEXT");
  ensureColumn("company_subscriptions", "last_payment_status", "TEXT");
  ensureColumn("billing_payments", "provider_event_type", "TEXT");
  ensureColumn("tipizate_docs", "client_id", "INTEGER");
  ensureColumn("dms_autofill_documents", "client_id", "INTEGER");
  ensureColumn("billing_payments", "payment_kind", "TEXT NOT NULL DEFAULT 'subscription'");
  ensureColumn("billing_payments", "payer_name", "TEXT");
  ensureColumn("billing_payments", "payer_email", "TEXT");
  ensureColumn("billing_payments", "reference_code", "TEXT");
  ensureColumn("billing_payments", "stripe_checkout_session_id", "TEXT");
  ensureColumn("billing_payments", "stripe_subscription_id", "TEXT");
  ensureColumn("billing_payments", "stripe_invoice_id", "TEXT");
  ensureColumn("billing_payments", "stripe_payment_intent_id", "TEXT");
  ensureColumn("billing_payments", "paid_at", "TEXT");
  ensureColumn("billing_payments", "failure_reason", "TEXT");
  ensureColumn("billing_payments", "notes", "TEXT");
  ensureColumn("billing_payments", "metadata", "TEXT");
  ensureColumn("billing_payments", "created_by_user_id", "INTEGER");
  ensureColumn("billing_payments", "created_by_email", "TEXT");
  ensureColumn("billing_payments", "generated_factura_id", "INTEGER");
  ensureColumn("billing_payments", "invoice_generation_status", "TEXT");
  ensureColumn("billing_payments", "invoice_generated_at", "TEXT");

  ensureColumn("clients", "email", "TEXT");
  ensureColumn("clients", "phone", "TEXT");
  ensureColumn("clients", "client_status", "TEXT DEFAULT 'verde'");
  ensureColumn("clients", "notes", "TEXT");
  ensureColumn("clients", "company_id", "INTEGER");
  ensureColumn("clients", "country", "TEXT NOT NULL DEFAULT 'Romania'");

  const legacyClientsUniqueIndex = db.prepare(`PRAGMA index_list('clients')`).all()
    .some((index) => index.name === "sqlite_autoindex_clients_1");

  if (legacyClientsUniqueIndex) {
    db.exec(`
      PRAGMA foreign_keys=off;
      BEGIN TRANSACTION;
      ALTER TABLE clients RENAME TO clients_legacy_unique;
      CREATE TABLE clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cui TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        reg_com TEXT,
        caen TEXT,
        vat INTEGER DEFAULT 0,
        inactive INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        email TEXT,
        phone TEXT,
        client_status TEXT DEFAULT 'verde',
        notes TEXT,
        company_id INTEGER
      );
      INSERT INTO clients (id, cui, name, address, reg_com, caen, vat, inactive, created_at, email, phone, client_status, notes, company_id)
      SELECT id, cui, name, address, reg_com, caen, vat, inactive, created_at, email, phone, client_status, notes, company_id
      FROM clients_legacy_unique;
      DROP TABLE clients_legacy_unique;
      COMMIT;
      PRAGMA foreign_keys=on;
    `);
  }

  ensureColumn("contracts", "origin", "TEXT DEFAULT 'DIRECT'");
  ensureColumn("contracts", "employee_id", "INTEGER");
  ensureColumn("contracts", "company_id", "INTEGER");

  ensureColumn("products", "company_id", "INTEGER");
  ensureColumn("products", "lot", "TEXT");
  ensureColumn("contacts", "company_id", "INTEGER");
  ensureColumn("activities", "employee_id", "INTEGER");
  ensureColumn("activities", "company_id", "INTEGER");
  ensureColumn("crm_leads", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_leads", "year", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_leads", "seq", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_leads", "lead_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_leads", "name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_leads", "company_name", "TEXT");
  ensureColumn("crm_leads", "contact_name", "TEXT");
  ensureColumn("crm_leads", "email", "TEXT");
  ensureColumn("crm_leads", "phone", "TEXT");
  ensureColumn("crm_leads", "source", "TEXT NOT NULL DEFAULT 'MANUAL'");
  ensureColumn("crm_leads", "status", "TEXT NOT NULL DEFAULT 'NOU'");
  ensureColumn("crm_leads", "owner_email", "TEXT");
  ensureColumn("crm_leads", "estimated_value", "REAL NOT NULL DEFAULT 0");
  ensureColumn("crm_leads", "probability", "INTEGER NOT NULL DEFAULT 10");
  ensureColumn("crm_leads", "next_step", "TEXT");
  ensureColumn("crm_leads", "next_followup_date", "TEXT");
  ensureColumn("crm_leads", "notes", "TEXT");
  ensureColumn("crm_leads", "converted_client_id", "INTEGER");
  ensureColumn("crm_leads", "created_by_email", "TEXT");
  ensureColumn("crm_leads", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("crm_opportunities", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_opportunities", "year", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_opportunities", "seq", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_opportunities", "opportunity_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_opportunities", "client_id", "INTEGER");
  ensureColumn("crm_opportunities", "lead_id", "INTEGER");
  ensureColumn("crm_opportunities", "title", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_opportunities", "stage", "TEXT NOT NULL DEFAULT 'CALIFICARE'");
  ensureColumn("crm_opportunities", "status", "TEXT NOT NULL DEFAULT 'DESCHISA'");
  ensureColumn("crm_opportunities", "amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("crm_opportunities", "probability", "INTEGER NOT NULL DEFAULT 25");
  ensureColumn("crm_opportunities", "expected_close_date", "TEXT");
  ensureColumn("crm_opportunities", "owner_email", "TEXT");
  ensureColumn("crm_opportunities", "source", "TEXT");
  ensureColumn("crm_opportunities", "notes", "TEXT");
  ensureColumn("crm_opportunities", "created_by_email", "TEXT");
  ensureColumn("crm_opportunities", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("crm_followups", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_followups", "client_id", "INTEGER");
  ensureColumn("crm_followups", "lead_id", "INTEGER");
  ensureColumn("crm_followups", "opportunity_id", "INTEGER");
  ensureColumn("crm_followups", "activity_type", "TEXT NOT NULL DEFAULT 'TASK'");
  ensureColumn("crm_followups", "subject", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_followups", "notes", "TEXT");
  ensureColumn("crm_followups", "due_date", "TEXT");
  ensureColumn("crm_followups", "priority", "TEXT NOT NULL DEFAULT 'MEDIE'");
  ensureColumn("crm_followups", "status", "TEXT NOT NULL DEFAULT 'DESCHIS'");
  ensureColumn("crm_followups", "completed_at", "TEXT");
  ensureColumn("crm_followups", "owner_email", "TEXT");
  ensureColumn("crm_followups", "created_by_email", "TEXT");
  ensureColumn("crm_followups", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("crm_email_events", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("crm_email_events", "client_id", "INTEGER");
  ensureColumn("crm_email_events", "lead_id", "INTEGER");
  ensureColumn("crm_email_events", "opportunity_id", "INTEGER");
  ensureColumn("crm_email_events", "direction", "TEXT NOT NULL DEFAULT 'OUT'");
  ensureColumn("crm_email_events", "recipient_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_email_events", "subject", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("crm_email_events", "status", "TEXT NOT NULL DEFAULT 'PREGATIT'");
  ensureColumn("crm_email_events", "sent_at", "TEXT");
  ensureColumn("crm_email_events", "opened_at", "TEXT");
  ensureColumn("crm_email_events", "replied_at", "TEXT");
  ensureColumn("crm_email_events", "notes", "TEXT");
  ensureColumn("crm_email_events", "created_by_email", "TEXT");
  ensureColumn("crm_email_events", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("quotes", "company_id", "INTEGER");
  ensureColumn("quote_items", "company_id", "INTEGER");
  ensureColumn("sales_quote_imports", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sales_quote_imports", "year", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sales_quote_imports", "seq", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sales_quote_imports", "registration_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_quote_imports", "client_id", "INTEGER");
  ensureColumn("sales_quote_imports", "title", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_quote_imports", "source_type", "TEXT NOT NULL DEFAULT 'IMPORT'");
  ensureColumn("sales_quote_imports", "original_file_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_quote_imports", "stored_file_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_quote_imports", "file_path", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_quote_imports", "mime_type", "TEXT");
  ensureColumn("sales_quote_imports", "file_size", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sales_quote_imports", "extension", "TEXT");
  ensureColumn("sales_quote_imports", "status", "TEXT NOT NULL DEFAULT 'IMPORTATA'");
  ensureColumn("sales_quote_imports", "notes", "TEXT");
  ensureColumn("sales_quote_imports", "created_by_email", "TEXT");
  ensureColumn("sales_quote_imports", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("sales_orders", "company_id", "INTEGER");
  ensureColumn("sales_orders", "order_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_orders", "client_id", "INTEGER");
  ensureColumn("sales_orders", "quote_id", "INTEGER");
  ensureColumn("sales_orders", "status", "TEXT NOT NULL DEFAULT 'NOUA'");
  ensureColumn("sales_orders", "order_date", "TEXT");
  ensureColumn("sales_orders", "due_date", "TEXT");
  ensureColumn("sales_orders", "delivery_address", "TEXT");
  ensureColumn("sales_orders", "contact_name", "TEXT");
  ensureColumn("sales_orders", "contact_phone", "TEXT");
  ensureColumn("sales_orders", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("sales_orders", "subtotal", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_orders", "discount_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_orders", "total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_orders", "notes", "TEXT");
  ensureColumn("sales_orders", "created_by_email", "TEXT");
  ensureColumn("sales_orders", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("sales_order_items", "order_id", "INTEGER");
  ensureColumn("sales_order_items", "company_id", "INTEGER");
  ensureColumn("sales_order_items", "product_id", "INTEGER");
  ensureColumn("sales_order_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_order_items", "sku", "TEXT");
  ensureColumn("sales_order_items", "qty", "REAL NOT NULL DEFAULT 1");
  ensureColumn("sales_order_items", "unit", "TEXT");
  ensureColumn("sales_order_items", "unit_price", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_order_items", "discount_percent", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_order_items", "line_total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_order_items", "notes", "TEXT");
  ensureColumn("sales_price_lists", "company_id", "INTEGER");
  ensureColumn("sales_price_lists", "name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_price_lists", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("sales_price_lists", "valid_from", "TEXT");
  ensureColumn("sales_price_lists", "valid_to", "TEXT");
  ensureColumn("sales_price_lists", "status", "TEXT NOT NULL DEFAULT 'ACTIVA'");
  ensureColumn("sales_price_lists", "notes", "TEXT");
  ensureColumn("sales_price_lists", "created_by_email", "TEXT");
  ensureColumn("sales_price_lists", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("sales_price_items", "price_list_id", "INTEGER");
  ensureColumn("sales_price_items", "company_id", "INTEGER");
  ensureColumn("sales_price_items", "product_id", "INTEGER");
  ensureColumn("sales_price_items", "product_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_price_items", "unit", "TEXT");
  ensureColumn("sales_price_items", "base_price", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_price_items", "sale_price", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_price_items", "min_qty", "REAL NOT NULL DEFAULT 1");
  ensureColumn("sales_price_items", "margin_percent", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_price_items", "notes", "TEXT");
  ensureColumn("sales_discounts", "company_id", "INTEGER");
  ensureColumn("sales_discounts", "name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_discounts", "discount_type", "TEXT NOT NULL DEFAULT 'PROCENT'");
  ensureColumn("sales_discounts", "discount_value", "REAL NOT NULL DEFAULT 0");
  ensureColumn("sales_discounts", "target_type", "TEXT NOT NULL DEFAULT 'GLOBAL'");
  ensureColumn("sales_discounts", "target_ref", "TEXT");
  ensureColumn("sales_discounts", "valid_from", "TEXT");
  ensureColumn("sales_discounts", "valid_to", "TEXT");
  ensureColumn("sales_discounts", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("sales_discounts", "combinable", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sales_discounts", "notes", "TEXT");
  ensureColumn("sales_discounts", "created_by_email", "TEXT");
  ensureColumn("sales_discounts", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("sales_deliveries", "company_id", "INTEGER");
  ensureColumn("sales_deliveries", "delivery_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_deliveries", "order_id", "INTEGER");
  ensureColumn("sales_deliveries", "client_id", "INTEGER");
  ensureColumn("sales_deliveries", "status", "TEXT NOT NULL DEFAULT 'PREGATITA'");
  ensureColumn("sales_deliveries", "scheduled_date", "TEXT");
  ensureColumn("sales_deliveries", "delivered_at", "TEXT");
  ensureColumn("sales_deliveries", "courier", "TEXT");
  ensureColumn("sales_deliveries", "awb", "TEXT");
  ensureColumn("sales_deliveries", "delivery_address", "TEXT");
  ensureColumn("sales_deliveries", "contact_name", "TEXT");
  ensureColumn("sales_deliveries", "contact_phone", "TEXT");
  ensureColumn("sales_deliveries", "notes", "TEXT");
  ensureColumn("sales_deliveries", "created_by_email", "TEXT");
  ensureColumn("sales_deliveries", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("order_lifecycle_events", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("order_lifecycle_events", "event_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("order_lifecycle_events", "order_id", "INTEGER");
  ensureColumn("order_lifecycle_events", "from_status", "TEXT");
  ensureColumn("order_lifecycle_events", "to_status", "TEXT NOT NULL DEFAULT 'NOUA'");
  ensureColumn("order_lifecycle_events", "event_type", "TEXT NOT NULL DEFAULT 'STATUS'");
  ensureColumn("order_lifecycle_events", "event_date", "TEXT");
  ensureColumn("order_lifecycle_events", "actor_email", "TEXT");
  ensureColumn("order_lifecycle_events", "notes", "TEXT");
  ensureColumn("order_fulfillment_tasks", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("order_fulfillment_tasks", "task_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("order_fulfillment_tasks", "order_id", "INTEGER");
  ensureColumn("order_fulfillment_tasks", "delivery_id", "INTEGER");
  ensureColumn("order_fulfillment_tasks", "task_type", "TEXT NOT NULL DEFAULT 'PICKING'");
  ensureColumn("order_fulfillment_tasks", "warehouse_id", "INTEGER");
  ensureColumn("order_fulfillment_tasks", "assigned_to", "TEXT");
  ensureColumn("order_fulfillment_tasks", "planned_date", "TEXT");
  ensureColumn("order_fulfillment_tasks", "status", "TEXT NOT NULL DEFAULT 'PLANIFICAT'");
  ensureColumn("order_fulfillment_tasks", "notes", "TEXT");
  ensureColumn("order_fulfillment_tasks", "created_by_email", "TEXT");
  ensureColumn("order_fulfillment_tasks", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("order_tracking_events", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("order_tracking_events", "tracking_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("order_tracking_events", "order_id", "INTEGER");
  ensureColumn("order_tracking_events", "delivery_id", "INTEGER");
  ensureColumn("order_tracking_events", "event_type", "TEXT NOT NULL DEFAULT 'STATUS'");
  ensureColumn("order_tracking_events", "event_date", "TEXT");
  ensureColumn("order_tracking_events", "location", "TEXT");
  ensureColumn("order_tracking_events", "courier", "TEXT");
  ensureColumn("order_tracking_events", "awb", "TEXT");
  ensureColumn("order_tracking_events", "status", "TEXT");
  ensureColumn("order_tracking_events", "notes", "TEXT");
  ensureColumn("order_tracking_events", "created_by_email", "TEXT");
  ensureColumn("order_tracking_events", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("sales_delivery_items", "delivery_id", "INTEGER");
  ensureColumn("sales_delivery_items", "company_id", "INTEGER");
  ensureColumn("sales_delivery_items", "order_item_id", "INTEGER");
  ensureColumn("sales_delivery_items", "product_id", "INTEGER");
  ensureColumn("sales_delivery_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("sales_delivery_items", "qty", "REAL NOT NULL DEFAULT 1");
  ensureColumn("sales_delivery_items", "unit", "TEXT");
  ensureColumn("sales_delivery_items", "notes", "TEXT");
  ensureColumn("procurement_suppliers", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_suppliers", "supplier_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_suppliers", "name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_suppliers", "cui", "TEXT");
  ensureColumn("procurement_suppliers", "registration_number", "TEXT");
  ensureColumn("procurement_suppliers", "category", "TEXT");
  ensureColumn("procurement_suppliers", "contact_name", "TEXT");
  ensureColumn("procurement_suppliers", "email", "TEXT");
  ensureColumn("procurement_suppliers", "phone", "TEXT");
  ensureColumn("procurement_suppliers", "address", "TEXT");
  ensureColumn("procurement_suppliers", "payment_terms_days", "INTEGER NOT NULL DEFAULT 30");
  ensureColumn("procurement_suppliers", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("procurement_suppliers", "notes", "TEXT");
  ensureColumn("procurement_suppliers", "created_by_email", "TEXT");
  ensureColumn("procurement_suppliers", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("procurement_orders", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_orders", "order_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_orders", "supplier_id", "INTEGER");
  ensureColumn("procurement_orders", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("procurement_orders", "approval_status", "TEXT NOT NULL DEFAULT 'NECESITA_APROBARE'");
  ensureColumn("procurement_orders", "order_date", "TEXT");
  ensureColumn("procurement_orders", "expected_date", "TEXT");
  ensureColumn("procurement_orders", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("procurement_orders", "subtotal", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_orders", "vat_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_orders", "total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_orders", "requested_by_email", "TEXT");
  ensureColumn("procurement_orders", "approved_by_email", "TEXT");
  ensureColumn("procurement_orders", "approved_at", "TEXT");
  ensureColumn("procurement_orders", "notes", "TEXT");
  ensureColumn("procurement_orders", "created_by_email", "TEXT");
  ensureColumn("procurement_orders", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("procurement_order_items", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_order_items", "order_id", "INTEGER");
  ensureColumn("procurement_order_items", "product_id", "INTEGER");
  ensureColumn("procurement_order_items", "item_code", "TEXT");
  ensureColumn("procurement_order_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_order_items", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("procurement_order_items", "quantity", "REAL NOT NULL DEFAULT 1");
  ensureColumn("procurement_order_items", "unit_cost", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_order_items", "vat_percent", "REAL NOT NULL DEFAULT 19");
  ensureColumn("procurement_order_items", "line_subtotal", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_order_items", "line_vat", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_order_items", "line_total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_order_items", "received_quantity", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_order_items", "notes", "TEXT");
  ensureColumn("procurement_receipts", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_receipts", "receipt_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_receipts", "order_id", "INTEGER");
  ensureColumn("procurement_receipts", "supplier_id", "INTEGER");
  ensureColumn("procurement_receipts", "warehouse_id", "INTEGER");
  ensureColumn("procurement_receipts", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("procurement_receipts", "receipt_date", "TEXT");
  ensureColumn("procurement_receipts", "document_number", "TEXT");
  ensureColumn("procurement_receipts", "inventory_receipt_id", "INTEGER");
  ensureColumn("procurement_receipts", "notes", "TEXT");
  ensureColumn("procurement_receipts", "created_by_email", "TEXT");
  ensureColumn("procurement_receipts", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("procurement_receipt_items", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_receipt_items", "receipt_id", "INTEGER");
  ensureColumn("procurement_receipt_items", "order_item_id", "INTEGER");
  ensureColumn("procurement_receipt_items", "product_id", "INTEGER");
  ensureColumn("procurement_receipt_items", "item_code", "TEXT");
  ensureColumn("procurement_receipt_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_receipt_items", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("procurement_receipt_items", "quantity", "REAL NOT NULL DEFAULT 1");
  ensureColumn("procurement_receipt_items", "unit_cost", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_receipt_items", "lot_number", "TEXT");
  ensureColumn("procurement_receipt_items", "serial_number", "TEXT");
  ensureColumn("procurement_receipt_items", "expiry_date", "TEXT");
  ensureColumn("procurement_receipt_items", "notes", "TEXT");
  ensureColumn("procurement_approvals", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_approvals", "approval_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_approvals", "order_id", "INTEGER");
  ensureColumn("procurement_approvals", "subject", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_approvals", "amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_approvals", "status", "TEXT NOT NULL DEFAULT 'PENDING'");
  ensureColumn("procurement_approvals", "requested_by_email", "TEXT");
  ensureColumn("procurement_approvals", "approver_email", "TEXT");
  ensureColumn("procurement_approvals", "due_date", "TEXT");
  ensureColumn("procurement_approvals", "decided_at", "TEXT");
  ensureColumn("procurement_approvals", "decision_notes", "TEXT");
  ensureColumn("procurement_approvals", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("procurement_costs", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_costs", "supplier_id", "INTEGER");
  ensureColumn("procurement_costs", "order_id", "INTEGER");
  ensureColumn("procurement_costs", "receipt_id", "INTEGER");
  ensureColumn("procurement_costs", "bill_id", "INTEGER");
  ensureColumn("procurement_costs", "cost_type", "TEXT NOT NULL DEFAULT 'TRANSPORT'");
  ensureColumn("procurement_costs", "cost_date", "TEXT");
  ensureColumn("procurement_costs", "description", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_costs", "amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_costs", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("procurement_costs", "allocation_method", "TEXT NOT NULL DEFAULT 'MANUAL'");
  ensureColumn("procurement_costs", "status", "TEXT NOT NULL DEFAULT 'PLANIFICAT'");
  ensureColumn("procurement_costs", "notes", "TEXT");
  ensureColumn("procurement_costs", "created_by_email", "TEXT");
  ensureColumn("procurement_costs", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("procurement_bills", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("procurement_bills", "bill_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("procurement_bills", "supplier_id", "INTEGER");
  ensureColumn("procurement_bills", "order_id", "INTEGER");
  ensureColumn("procurement_bills", "receipt_id", "INTEGER");
  ensureColumn("procurement_bills", "expense_id", "INTEGER");
  ensureColumn("procurement_bills", "doc_number", "TEXT");
  ensureColumn("procurement_bills", "issue_date", "TEXT");
  ensureColumn("procurement_bills", "due_date", "TEXT");
  ensureColumn("procurement_bills", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("procurement_bills", "payment_status", "TEXT NOT NULL DEFAULT 'NEPLATITA'");
  ensureColumn("procurement_bills", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("procurement_bills", "subtotal", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_bills", "vat_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_bills", "total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("procurement_bills", "attachment_path", "TEXT");
  ensureColumn("procurement_bills", "notes", "TEXT");
  ensureColumn("procurement_bills", "created_by_email", "TEXT");
  ensureColumn("procurement_bills", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("facturi", "employee_id", "INTEGER");
  ensureColumn("facturi", "company_id", "INTEGER");
  ensureColumn("facturi_linii", "descriere", "TEXT");
  ensureColumn("facturi_linii", "company_id", "INTEGER");
  ensureColumn("tipizate_docs", "company_id", "INTEGER");
  ensureColumn("tipizate_docs", "registration_number", "TEXT");
  ensureColumn("tipizate_docs", "registration_year", "INTEGER");
  ensureColumn("tipizate_docs", "registration_seq", "INTEGER");
  ensureColumn("tipizate_docs", "registered_at", "TEXT");
  ensureColumn("tipizate_register", "entry_type", "TEXT NOT NULL DEFAULT 'AUTO'");
  ensureColumn("tipizate_register", "recipient", "TEXT");
  ensureColumn("tipizate_register", "notes", "TEXT");
  ensureColumn("employees", "company_id", "INTEGER");
  ensureColumn("employees", "employee_code", "TEXT");
  ensureColumn("employees", "department", "TEXT");
  ensureColumn("employees", "hire_date", "TEXT");
  ensureColumn("employees", "salary", "REAL NOT NULL DEFAULT 0");
  ensureColumn("employees", "contract_type", "TEXT DEFAULT 'CIM'");
  ensureColumn("employees", "manager", "TEXT");
  ensureColumn("employees", "notes", "TEXT");
  ensureColumn("employees", "updated_at", "TEXT");
  ensureColumn("anaf_messages", "company_id", "INTEGER");
  ensureColumn("anaf_connections", "company_id", "INTEGER");
  ensureColumn("anaf_inbox", "company_id", "INTEGER");
  ensureColumn("anaf_inbox", "supplier_name", "TEXT");
  ensureColumn("anaf_inbox", "buyer_cui", "TEXT");
  ensureColumn("anaf_inbox", "message_type", "TEXT");
  ensureColumn("anaf_inbox", "details", "TEXT");
  ensureColumn("anaf_inbox", "download_id", "TEXT");
  ensureColumn("anaf_inbox", "zip_path", "TEXT");
  ensureColumn("anaf_inbox", "source_environment", "TEXT");
  ensureColumn("anaf_oauth_logs", "company_id", "INTEGER");
  ensureColumn("accounting_expenses", "company_id", "INTEGER");
  ensureColumn("accounting_expenses", "expense_type", "TEXT NOT NULL DEFAULT 'FACTURA'");
  ensureColumn("accounting_expenses", "category", "TEXT");
  ensureColumn("accounting_expenses", "supplier_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("accounting_expenses", "supplier_cui", "TEXT");
  ensureColumn("accounting_expenses", "doc_number", "TEXT");
  ensureColumn("accounting_expenses", "issue_date", "TEXT");
  ensureColumn("accounting_expenses", "due_date", "TEXT");
  ensureColumn("accounting_expenses", "payment_status", "TEXT NOT NULL DEFAULT 'NEPLATITA'");
  ensureColumn("accounting_expenses", "deductible_percent", "REAL NOT NULL DEFAULT 100");
  ensureColumn("accounting_expenses", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("accounting_expenses", "subtotal", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_expenses", "vat_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_expenses", "total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_expenses", "notes", "TEXT");
  ensureColumn("accounting_expenses", "attachment_path", "TEXT");
  ensureColumn("accounting_expenses", "created_by_email", "TEXT");
  ensureColumn("accounting_expenses", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("accounting_declarations", "company_id", "INTEGER");
  ensureColumn("accounting_declarations", "declaration_type", "TEXT NOT NULL DEFAULT 'D112'");
  ensureColumn("accounting_declarations", "period_label", "TEXT");
  ensureColumn("accounting_declarations", "period_start", "TEXT");
  ensureColumn("accounting_declarations", "period_end", "TEXT");
  ensureColumn("accounting_declarations", "due_date", "TEXT");
  ensureColumn("accounting_declarations", "status", "TEXT NOT NULL DEFAULT 'PREGATITA'");
  ensureColumn("accounting_declarations", "submission_channel", "TEXT NOT NULL DEFAULT 'MANUAL_SPV'");
  ensureColumn("accounting_declarations", "reference_number", "TEXT");
  ensureColumn("accounting_declarations", "attachment_path", "TEXT");
  ensureColumn("accounting_declarations", "receipt_path", "TEXT");
  ensureColumn("accounting_declarations", "notes", "TEXT");
  ensureColumn("accounting_declarations", "created_by_email", "TEXT");
  ensureColumn("accounting_declarations", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("accounting_cash_transactions", "company_id", "INTEGER");
  ensureColumn("accounting_cash_transactions", "direction", "TEXT NOT NULL DEFAULT 'OUT'");
  ensureColumn("accounting_cash_transactions", "transaction_date", "TEXT");
  ensureColumn("accounting_cash_transactions", "partner_name", "TEXT");
  ensureColumn("accounting_cash_transactions", "partner_cui", "TEXT");
  ensureColumn("accounting_cash_transactions", "document_type", "TEXT");
  ensureColumn("accounting_cash_transactions", "document_number", "TEXT");
  ensureColumn("accounting_cash_transactions", "category", "TEXT");
  ensureColumn("accounting_cash_transactions", "payment_method", "TEXT NOT NULL DEFAULT 'BANCA'");
  ensureColumn("accounting_cash_transactions", "bank_account", "TEXT");
  ensureColumn("accounting_cash_transactions", "amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_cash_transactions", "vat_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_cash_transactions", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("accounting_cash_transactions", "reference", "TEXT");
  ensureColumn("accounting_cash_transactions", "status", "TEXT NOT NULL DEFAULT 'NECORELATA'");
  ensureColumn("accounting_cash_transactions", "matched_document_type", "TEXT");
  ensureColumn("accounting_cash_transactions", "matched_document_id", "INTEGER");
  ensureColumn("accounting_cash_transactions", "notes", "TEXT");
  ensureColumn("accounting_cash_transactions", "attachment_path", "TEXT");
  ensureColumn("accounting_cash_transactions", "created_by_email", "TEXT");
  ensureColumn("accounting_cash_transactions", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("accounting_entries", "company_id", "INTEGER");
  ensureColumn("accounting_entries", "entry_date", "TEXT");
  ensureColumn("accounting_entries", "document_type", "TEXT");
  ensureColumn("accounting_entries", "document_number", "TEXT");
  ensureColumn("accounting_entries", "partner_name", "TEXT");
  ensureColumn("accounting_entries", "account_debit", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("accounting_entries", "account_credit", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("accounting_entries", "amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_entries", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("accounting_entries", "tax_code", "TEXT");
  ensureColumn("accounting_entries", "description", "TEXT");
  ensureColumn("accounting_entries", "source_type", "TEXT NOT NULL DEFAULT 'MANUAL'");
  ensureColumn("accounting_entries", "source_id", "INTEGER");
  ensureColumn("accounting_entries", "created_by_email", "TEXT");
  ensureColumn("accounting_entries", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("accounting_budgets", "company_id", "INTEGER");
  ensureColumn("accounting_budgets", "period_label", "TEXT");
  ensureColumn("accounting_budgets", "period_start", "TEXT");
  ensureColumn("accounting_budgets", "period_end", "TEXT");
  ensureColumn("accounting_budgets", "budget_type", "TEXT NOT NULL DEFAULT 'CHELTUIALA'");
  ensureColumn("accounting_budgets", "category", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("accounting_budgets", "planned_amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_budgets", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("accounting_budgets", "owner", "TEXT");
  ensureColumn("accounting_budgets", "notes", "TEXT");
  ensureColumn("accounting_budgets", "created_by_email", "TEXT");
  ensureColumn("accounting_budgets", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("accounting_bank_transactions", "company_id", "INTEGER");
  ensureColumn("accounting_bank_transactions", "bank_name", "TEXT");
  ensureColumn("accounting_bank_transactions", "account_iban", "TEXT");
  ensureColumn("accounting_bank_transactions", "transaction_date", "TEXT");
  ensureColumn("accounting_bank_transactions", "value_date", "TEXT");
  ensureColumn("accounting_bank_transactions", "direction", "TEXT NOT NULL DEFAULT 'OUT'");
  ensureColumn("accounting_bank_transactions", "partner_name", "TEXT");
  ensureColumn("accounting_bank_transactions", "description", "TEXT");
  ensureColumn("accounting_bank_transactions", "reference", "TEXT");
  ensureColumn("accounting_bank_transactions", "amount", "REAL NOT NULL DEFAULT 0");
  ensureColumn("accounting_bank_transactions", "currency", "TEXT NOT NULL DEFAULT 'RON'");
  ensureColumn("accounting_bank_transactions", "reconciliation_status", "TEXT NOT NULL DEFAULT 'NECORELATA'");
  ensureColumn("accounting_bank_transactions", "matched_cash_transaction_id", "INTEGER");
  ensureColumn("accounting_bank_transactions", "notes", "TEXT");
  ensureColumn("accounting_bank_transactions", "created_by_email", "TEXT");
  ensureColumn("accounting_bank_transactions", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("consumption_vouchers", "company_id", "INTEGER");
  ensureColumn("consumption_vouchers", "voucher_number", "TEXT");
  ensureColumn("consumption_vouchers", "issue_date", "TEXT");
  ensureColumn("consumption_vouchers", "department", "TEXT");
  ensureColumn("consumption_vouchers", "issued_to", "TEXT");
  ensureColumn("consumption_vouchers", "notes", "TEXT");
  ensureColumn("consumption_vouchers", "created_by_email", "TEXT");
  ensureColumn("consumption_voucher_items", "product_id", "INTEGER");
  ensureColumn("consumption_voucher_items", "product_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("consumption_voucher_items", "qty", "REAL NOT NULL DEFAULT 1");
  ensureColumn("consumption_voucher_items", "unit", "TEXT");
  ensureColumn("consumption_voucher_items", "unit_cost", "REAL NOT NULL DEFAULT 0");
  ensureColumn("consumption_voucher_items", "line_total", "REAL NOT NULL DEFAULT 0");
  ensureColumn("consumption_voucher_items", "notes", "TEXT");
  ensureColumn("consumption_voucher_items", "company_id", "INTEGER");
  ensureColumn("inventory_assets", "company_id", "INTEGER");
  ensureColumn("inventory_assets", "asset_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_assets", "asset_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_assets", "category", "TEXT NOT NULL DEFAULT 'MOBIL'");
  ensureColumn("inventory_assets", "asset_type", "TEXT NOT NULL DEFAULT 'MIJLOC_FIX'");
  ensureColumn("inventory_assets", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("inventory_assets", "quantity_scriptic", "REAL NOT NULL DEFAULT 1");
  ensureColumn("inventory_assets", "minimum_quantity", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_assets", "location", "TEXT");
  ensureColumn("inventory_assets", "serial_number", "TEXT");
  ensureColumn("inventory_assets", "purchase_date", "TEXT");
  ensureColumn("inventory_assets", "purchase_value", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_assets", "status", "TEXT NOT NULL DEFAULT 'IN_STOC'");
  ensureColumn("inventory_assets", "supplier_name", "TEXT");
  ensureColumn("inventory_assets", "invoice_number", "TEXT");
  ensureColumn("inventory_assets", "useful_life_months", "INTEGER NOT NULL DEFAULT 36");
  ensureColumn("inventory_assets", "residual_value", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_assets", "depreciation_method", "TEXT NOT NULL DEFAULT 'LINIARA'");
  ensureColumn("inventory_assets", "notes", "TEXT");
  ensureColumn("inventory_assets", "created_by_email", "TEXT");
  ensureColumn("inventory_assets", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_projects", "company_id", "INTEGER");
  ensureColumn("inventory_projects", "project_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_projects", "project_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_projects", "client_name", "TEXT");
  ensureColumn("inventory_projects", "location", "TEXT");
  ensureColumn("inventory_projects", "start_date", "TEXT");
  ensureColumn("inventory_projects", "end_date", "TEXT");
  ensureColumn("inventory_projects", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("inventory_projects", "notes", "TEXT");
  ensureColumn("inventory_projects", "created_by_email", "TEXT");
  ensureColumn("inventory_projects", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_project_items", "company_id", "INTEGER");
  ensureColumn("inventory_project_items", "project_id", "INTEGER");
  ensureColumn("inventory_project_items", "asset_id", "INTEGER");
  ensureColumn("inventory_project_items", "asset_code", "TEXT");
  ensureColumn("inventory_project_items", "asset_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_project_items", "quantity_allocated", "REAL NOT NULL DEFAULT 1");
  ensureColumn("inventory_project_items", "quantity_returned", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_project_items", "assigned_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_project_items", "assigned_by_email", "TEXT");
  ensureColumn("inventory_project_items", "notes", "TEXT");
  ensureColumn("inventory_counts", "company_id", "INTEGER");
  ensureColumn("inventory_counts", "title", "TEXT NOT NULL DEFAULT 'Inventar'");
  ensureColumn("inventory_counts", "count_date", "TEXT");
  ensureColumn("inventory_counts", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("inventory_counts", "source_file_name", "TEXT");
  ensureColumn("inventory_counts", "notes", "TEXT");
  ensureColumn("inventory_counts", "created_by_email", "TEXT");
  ensureColumn("inventory_counts", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_count_items", "company_id", "INTEGER");
  ensureColumn("inventory_count_items", "count_id", "INTEGER");
  ensureColumn("inventory_count_items", "asset_id", "INTEGER");
  ensureColumn("inventory_count_items", "stock_item_id", "INTEGER");
  ensureColumn("inventory_count_items", "warehouse_id", "INTEGER");
  ensureColumn("inventory_count_items", "asset_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_count_items", "asset_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_count_items", "quantity_scriptic", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_count_items", "quantity_counted", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_count_items", "variance", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_count_items", "notes", "TEXT");
  ensureColumn("inventory_count_items", "applied", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_adjustments", "company_id", "INTEGER");
  ensureColumn("inventory_adjustments", "asset_id", "INTEGER");
  ensureColumn("inventory_adjustments", "count_id", "INTEGER");
  ensureColumn("inventory_adjustments", "asset_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_adjustments", "quantity_before", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_adjustments", "quantity_after", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_adjustments", "variance", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_adjustments", "reason", "TEXT");
  ensureColumn("inventory_adjustments", "created_by_email", "TEXT");
  ensureColumn("inventory_warehouses", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_warehouses", "warehouse_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_warehouses", "name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_warehouses", "warehouse_type", "TEXT NOT NULL DEFAULT 'DEPOZIT'");
  ensureColumn("inventory_warehouses", "address", "TEXT");
  ensureColumn("inventory_warehouses", "manager_name", "TEXT");
  ensureColumn("inventory_warehouses", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("inventory_warehouses", "notes", "TEXT");
  ensureColumn("inventory_warehouses", "created_by_email", "TEXT");
  ensureColumn("inventory_warehouses", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_stock_items", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_stock_items", "warehouse_id", "INTEGER");
  ensureColumn("inventory_stock_items", "product_id", "INTEGER");
  ensureColumn("inventory_stock_items", "asset_id", "INTEGER");
  ensureColumn("inventory_stock_items", "item_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_stock_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_stock_items", "item_type", "TEXT NOT NULL DEFAULT 'PRODUS'");
  ensureColumn("inventory_stock_items", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("inventory_stock_items", "quantity", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_stock_items", "reserved_quantity", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_stock_items", "minimum_quantity", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_stock_items", "bin_location", "TEXT");
  ensureColumn("inventory_stock_items", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("inventory_stock_items", "notes", "TEXT");
  ensureColumn("inventory_stock_items", "created_by_email", "TEXT");
  ensureColumn("inventory_stock_items", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_lots", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_lots", "warehouse_id", "INTEGER");
  ensureColumn("inventory_lots", "product_id", "INTEGER");
  ensureColumn("inventory_lots", "stock_item_id", "INTEGER");
  ensureColumn("inventory_lots", "lot_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_lots", "serial_number", "TEXT");
  ensureColumn("inventory_lots", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_lots", "quantity_initial", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_lots", "quantity_available", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_lots", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("inventory_lots", "received_at", "TEXT");
  ensureColumn("inventory_lots", "expiry_date", "TEXT");
  ensureColumn("inventory_lots", "supplier_name", "TEXT");
  ensureColumn("inventory_lots", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("inventory_lots", "notes", "TEXT");
  ensureColumn("inventory_lots", "created_by_email", "TEXT");
  ensureColumn("inventory_lots", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_transfers", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_transfers", "transfer_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_transfers", "from_warehouse_id", "INTEGER");
  ensureColumn("inventory_transfers", "to_warehouse_id", "INTEGER");
  ensureColumn("inventory_transfers", "transfer_date", "TEXT");
  ensureColumn("inventory_transfers", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("inventory_transfers", "requested_by", "TEXT");
  ensureColumn("inventory_transfers", "notes", "TEXT");
  ensureColumn("inventory_transfers", "created_by_email", "TEXT");
  ensureColumn("inventory_transfers", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_transfer_items", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_transfer_items", "transfer_id", "INTEGER");
  ensureColumn("inventory_transfer_items", "stock_item_id", "INTEGER");
  ensureColumn("inventory_transfer_items", "product_id", "INTEGER");
  ensureColumn("inventory_transfer_items", "item_code", "TEXT");
  ensureColumn("inventory_transfer_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_transfer_items", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("inventory_transfer_items", "quantity", "REAL NOT NULL DEFAULT 1");
  ensureColumn("inventory_transfer_items", "notes", "TEXT");
  ensureColumn("inventory_receipts", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_receipts", "receipt_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_receipts", "warehouse_id", "INTEGER");
  ensureColumn("inventory_receipts", "supplier_name", "TEXT");
  ensureColumn("inventory_receipts", "receipt_date", "TEXT");
  ensureColumn("inventory_receipts", "document_number", "TEXT");
  ensureColumn("inventory_receipts", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("inventory_receipts", "notes", "TEXT");
  ensureColumn("inventory_receipts", "created_by_email", "TEXT");
  ensureColumn("inventory_receipts", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_receipt_items", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_receipt_items", "receipt_id", "INTEGER");
  ensureColumn("inventory_receipt_items", "product_id", "INTEGER");
  ensureColumn("inventory_receipt_items", "stock_item_id", "INTEGER");
  ensureColumn("inventory_receipt_items", "item_code", "TEXT");
  ensureColumn("inventory_receipt_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_receipt_items", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("inventory_receipt_items", "quantity", "REAL NOT NULL DEFAULT 1");
  ensureColumn("inventory_receipt_items", "unit_cost", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_receipt_items", "lot_number", "TEXT");
  ensureColumn("inventory_receipt_items", "serial_number", "TEXT");
  ensureColumn("inventory_receipt_items", "expiry_date", "TEXT");
  ensureColumn("inventory_receipt_items", "notes", "TEXT");
  ensureColumn("inventory_pickings", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_pickings", "picking_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_pickings", "warehouse_id", "INTEGER");
  ensureColumn("inventory_pickings", "client_name", "TEXT");
  ensureColumn("inventory_pickings", "project_name", "TEXT");
  ensureColumn("inventory_pickings", "scheduled_date", "TEXT");
  ensureColumn("inventory_pickings", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn("inventory_pickings", "notes", "TEXT");
  ensureColumn("inventory_pickings", "created_by_email", "TEXT");
  ensureColumn("inventory_pickings", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  ensureColumn("inventory_picking_items", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_picking_items", "picking_id", "INTEGER");
  ensureColumn("inventory_picking_items", "stock_item_id", "INTEGER");
  ensureColumn("inventory_picking_items", "product_id", "INTEGER");
  ensureColumn("inventory_picking_items", "item_code", "TEXT");
  ensureColumn("inventory_picking_items", "item_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_picking_items", "unit", "TEXT NOT NULL DEFAULT 'buc'");
  ensureColumn("inventory_picking_items", "quantity_requested", "REAL NOT NULL DEFAULT 1");
  ensureColumn("inventory_picking_items", "quantity_picked", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_picking_items", "quantity_packed", "REAL NOT NULL DEFAULT 0");
  ensureColumn("inventory_picking_items", "notes", "TEXT");
  ensureColumn("inventory_barcodes", "company_id", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("inventory_barcodes", "product_id", "INTEGER");
  ensureColumn("inventory_barcodes", "asset_id", "INTEGER");
  ensureColumn("inventory_barcodes", "lot_id", "INTEGER");
  ensureColumn("inventory_barcodes", "barcode_value", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_barcodes", "barcode_type", "TEXT NOT NULL DEFAULT 'CODE128'");
  ensureColumn("inventory_barcodes", "label", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inventory_barcodes", "status", "TEXT NOT NULL DEFAULT 'ACTIV'");
  ensureColumn("inventory_barcodes", "notes", "TEXT");
  ensureColumn("inventory_barcodes", "created_by_email", "TEXT");
  ensureColumn("inventory_barcodes", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
	  ensureColumn("travel_properties", "partner_plan", "TEXT NOT NULL DEFAULT 'standard_monthly'");
	  ensureColumn("travel_properties", "subscription_status", "TEXT NOT NULL DEFAULT 'active'");
	  ensureColumn("travel_properties", "monthly_price_ron", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn("travel_properties", "monthly_price_amount", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn("travel_properties", "monthly_price_currency", "TEXT NOT NULL DEFAULT 'RON'");
	  ensureColumn("travel_properties", "free_until", "TEXT");
	  ensureColumn("travel_properties", "activation_source", "TEXT");
	  ensureColumn("travel_properties", "billing_company_id", "INTEGER");
	  ensureColumn("travel_properties", "account_email", "TEXT");
	  ensureColumn("travel_properties", "password_salt", "TEXT");
		  ensureColumn("travel_properties", "password_hash", "TEXT");
		  ensureColumn("travel_properties", "account_status", "TEXT NOT NULL DEFAULT 'pending'");
		  ensureColumn("travel_properties", "last_login_at", "TEXT");
		  ensureColumn("travel_properties", "deletion_notice_sent_at", "TEXT");
		  ensureColumn("travel_properties", "deletion_scheduled_at", "TEXT");
		  ensureColumn("travel_properties", "deleted_at", "TEXT");
		  ensureColumn("travel_properties", "deletion_reason", "TEXT");
		  ensureColumn("travel_properties", "deleted_by_email", "TEXT");
		  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_properties_company_deletion ON travel_properties(company_id, deletion_scheduled_at, status)");
		  ensureColumn("travel_leads", "country", "TEXT NOT NULL DEFAULT 'Romania'");
	  ensureColumn("travel_properties", "country", "TEXT NOT NULL DEFAULT 'Romania'");
	  ensureColumn("travel_properties", "tourist_zone", "TEXT");
	  ensureColumn("travel_leads", "google_place_id", "TEXT");
	  ensureColumn("travel_properties", "google_place_id", "TEXT");
	  ensureColumn("travel_agency_leads", "country", "TEXT NOT NULL DEFAULT 'Romania'");
	  ensureColumn("travel_agency_leads", "slug", "TEXT");
	  ensureColumn("travel_agency_leads", "display_name", "TEXT");
	  ensureColumn("travel_agency_leads", "contact_name", "TEXT");
	  ensureColumn("travel_agency_leads", "short_description", "TEXT");
	  ensureColumn("travel_agency_leads", "description", "TEXT");
	  ensureColumn("travel_agency_leads", "hero_image_url", "TEXT");
	  ensureColumn("travel_agency_leads", "logo_image_url", "TEXT");
	  ensureColumn("travel_agency_leads", "brand_color", "TEXT NOT NULL DEFAULT '#0f766e'");
	  ensureColumn("travel_agency_leads", "public_status", "TEXT NOT NULL DEFAULT 'draft'");
	  ensureColumn("travel_agency_leads", "account_email", "TEXT");
	  ensureColumn("travel_agency_leads", "password_salt", "TEXT");
	  ensureColumn("travel_agency_leads", "password_hash", "TEXT");
	  ensureColumn("travel_agency_leads", "account_status", "TEXT NOT NULL DEFAULT 'pending'");
	  ensureColumn("travel_agency_leads", "published_at", "TEXT");
	  ensureColumn("travel_agency_leads", "last_login_at", "TEXT");
	  ensureColumn("travel_agency_leads", "offer_focus", "TEXT");
	  ensureColumn("travel_agency_leads", "subscription_status", "TEXT NOT NULL DEFAULT 'lead'");
	  ensureColumn("travel_agency_leads", "monthly_price_ron", "INTEGER NOT NULL DEFAULT 199");
	  ensureColumn("travel_agency_leads", "monthly_price_amount", "REAL NOT NULL DEFAULT 199");
	  ensureColumn("travel_agency_leads", "monthly_price_currency", "TEXT NOT NULL DEFAULT 'RON'");
	  ensureColumn("travel_agency_leads", "listing_limit", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn("travel_agency_leads", "promotion_notes", "TEXT");
	  ensureColumn("travel_agency_leads", "next_follow_up_at", "TEXT");
	  ensureColumn("travel_agency_offers", "slug", "TEXT");
	  ensureColumn("travel_agency_offers", "amenities", "TEXT");
	  ensureColumn("travel_agency_offers", "summary", "TEXT");
	  ensureColumn("travel_agency_offers", "description", "TEXT");
	  ensureColumn("travel_agency_offers", "image_url", "TEXT");
	  ensureColumn("travel_agency_offers", "gallery_json", "TEXT");
	  ensureColumn("travel_agency_offers", "departure_city", "TEXT");
	  ensureColumn("travel_agency_offers", "duration_days", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn("travel_agency_offers", "valid_from", "TEXT");
	  ensureColumn("travel_agency_offers", "valid_until", "TEXT");
	  ensureColumn("travel_agency_offers", "includes", "TEXT");
	  ensureColumn("travel_agency_offers", "contact_phone", "TEXT");
	  ensureColumn("travel_agency_offers", "contact_email", "TEXT");
	  ensureColumn("travel_agency_photos", "offer_id", "INTEGER");
    db.exec(`
      CREATE TABLE IF NOT EXISTS travel_agency_offer_clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        agency_id INTEGER NOT NULL,
        offer_id INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'trevoro_offer_click',
        target_url TEXT,
        referrer TEXT,
        user_agent TEXT,
        ip_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (agency_id) REFERENCES travel_agency_leads(id) ON DELETE CASCADE,
        FOREIGN KEY (offer_id) REFERENCES travel_agency_offers(id) ON DELETE CASCADE
      );
    `);
	  ensureColumn("travel_local_partners", "partner_type", "TEXT NOT NULL DEFAULT 'tourist_info_center'");
	  ensureColumn("travel_local_partners", "country", "TEXT NOT NULL DEFAULT 'Romania'");
	  ensureColumn("travel_local_partners", "region", "TEXT");
	  ensureColumn("travel_local_partners", "city", "TEXT");
	  ensureColumn("travel_local_partners", "address", "TEXT");
	  ensureColumn("travel_local_partners", "administrator", "TEXT");
	  ensureColumn("travel_local_partners", "phone", "TEXT");
	  ensureColumn("travel_local_partners", "email", "TEXT");
	  ensureColumn("travel_local_partners", "website", "TEXT");
	  ensureColumn("travel_local_partners", "facebook", "TEXT");
	  ensureColumn("travel_local_partners", "instagram", "TEXT");
	  ensureColumn("travel_local_partners", "contact_name", "TEXT");
	  ensureColumn("travel_local_partners", "ad_title", "TEXT");
	  ensureColumn("travel_local_partners", "ad_summary", "TEXT");
	  ensureColumn("travel_local_partners", "ad_image_url", "TEXT");
	  ensureColumn("travel_local_partners", "ad_cta_url", "TEXT");
	  ensureColumn("travel_local_partners", "ad_cta_label", "TEXT");
	  ensureColumn("travel_local_partners", "promotion_tier", "TEXT NOT NULL DEFAULT 'standard'");
	  ensureColumn("travel_local_partners", "featured_until", "TEXT");
	  ensureColumn("travel_local_partners", "potential_reach", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn("travel_local_partners", "source", "TEXT");
	  ensureColumn("travel_local_partners", "source_url", "TEXT");
	  ensureColumn("travel_local_partners", "status", "TEXT NOT NULL DEFAULT 'nou'");
	  ensureColumn("travel_local_partners", "notes", "TEXT");
	  ensureColumn("travel_local_partners", "social_enrichment_status", "TEXT NOT NULL DEFAULT 'pending'");
	  ensureColumn("travel_local_partners", "social_enrichment_source", "TEXT");
	  ensureColumn("travel_local_partners", "social_enrichment_error", "TEXT");
	  ensureColumn("travel_local_partners", "social_enriched_at", "TEXT");
	  ensureColumn("travel_local_partners", "next_follow_up_at", "TEXT");
	  ensureColumn("travel_local_partners", "last_contacted_at", "TEXT");
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_travel_properties_account_email ON travel_properties(company_id, account_email);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_agency_leads_company_slug ON travel_agency_leads(company_id, slug) WHERE slug IS NOT NULL AND slug <> '';
      CREATE INDEX IF NOT EXISTS idx_travel_agency_leads_account_email ON travel_agency_leads(company_id, account_email);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_leads_public ON travel_agency_leads(company_id, public_status, subscription_status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_agency_offers_company_agency_slug ON travel_agency_offers(company_id, agency_id, slug) WHERE slug IS NOT NULL AND slug <> '';
      CREATE INDEX IF NOT EXISTS idx_travel_agency_photos_agency ON travel_agency_photos(company_id, agency_id, photo_type, sort_order);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_photos_offer ON travel_agency_photos(company_id, agency_id, offer_id, status, sort_order);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_inquiries_agency ON travel_agency_inquiries(company_id, agency_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_offer_clicks_agency ON travel_agency_offer_clicks(company_id, agency_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_offer_clicks_offer ON travel_agency_offer_clicks(company_id, offer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_reviews_agency ON travel_agency_reviews(company_id, agency_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_travel_agency_reviews_offer ON travel_agency_reviews(company_id, offer_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_travel_local_partners_status ON travel_local_partners(company_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_travel_local_partners_type ON travel_local_partners(company_id, partner_type, status);
      CREATE INDEX IF NOT EXISTS idx_travel_local_partners_contact ON travel_local_partners(company_id, email, website);
      CREATE INDEX IF NOT EXISTS idx_travel_local_partners_region ON travel_local_partners(company_id, region, city);
      CREATE INDEX IF NOT EXISTS idx_travel_local_partners_public_ads ON travel_local_partners(company_id, status, promotion_tier, city);
      CREATE INDEX IF NOT EXISTS idx_travel_local_partners_social_enrichment ON travel_local_partners(company_id, social_enrichment_status, social_enriched_at);
      CREATE INDEX IF NOT EXISTS idx_travel_property_reviews_property ON travel_property_reviews(company_id, property_id, status, created_at DESC);
    `);
	  ensureColumn("travel_property_inquiries", "notified_at", "TEXT");
	  ensureColumn("travel_property_inquiries", "notification_error", "TEXT");
	  ensureColumn("travel_property_calendar_blocks", "booking_request_id", "INTEGER");
	  ensureColumn("travel_property_calendar_blocks", "hold_expires_at", "TEXT");
	  db.exec(`
	    CREATE TABLE IF NOT EXISTS travel_property_pynbooking_integrations (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      company_id INTEGER NOT NULL,
	      property_id INTEGER NOT NULL,
	      provider TEXT NOT NULL DEFAULT 'pynbooking',
	      provider_label TEXT,
	      partner_status TEXT NOT NULL DEFAULT 'ready',
	      hotel_id TEXT NOT NULL,
	      client_id TEXT NOT NULL,
	      client_secret TEXT NOT NULL,
	      api_key TEXT,
	      api_base_url TEXT,
	      default_plan_id TEXT,
	      currency TEXT NOT NULL DEFAULT 'RON',
	      language TEXT NOT NULL DEFAULT 'RO',
	      sync_months INTEGER NOT NULL DEFAULT 6,
	      sync_status TEXT NOT NULL DEFAULT 'pending',
	      access_token TEXT,
	      token_expires_at TEXT,
	      last_tested_at TEXT,
	      last_synced_at TEXT,
	      last_imported_at TEXT,
	      last_error TEXT,
	      last_sync_summary TEXT,
	      created_at TEXT NOT NULL DEFAULT (datetime('now')),
	      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	      UNIQUE(company_id, property_id)
	    );
	    CREATE INDEX IF NOT EXISTS idx_travel_property_pynbooking_property ON travel_property_pynbooking_integrations(company_id, property_id, sync_status);
	  `);
	  ensureColumn("travel_property_pynbooking_integrations", "provider", "TEXT NOT NULL DEFAULT 'pynbooking'");
	  ensureColumn("travel_property_pynbooking_integrations", "provider_label", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "partner_status", "TEXT NOT NULL DEFAULT 'ready'");
	  ensureColumn("travel_property_pynbooking_integrations", "api_key", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "api_base_url", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "default_plan_id", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "currency", "TEXT NOT NULL DEFAULT 'RON'");
	  ensureColumn("travel_property_pynbooking_integrations", "language", "TEXT NOT NULL DEFAULT 'RO'");
	  ensureColumn("travel_property_pynbooking_integrations", "sync_months", "INTEGER NOT NULL DEFAULT 6");
	  ensureColumn("travel_property_pynbooking_integrations", "sync_status", "TEXT NOT NULL DEFAULT 'pending'");
	  ensureColumn("travel_property_pynbooking_integrations", "access_token", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "token_expires_at", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "last_tested_at", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "last_synced_at", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "last_imported_at", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "last_error", "TEXT");
	  ensureColumn("travel_property_pynbooking_integrations", "last_sync_summary", "TEXT");
	  repairTravelCalendarProviderCheck();
	  ensureColumn("travel_property_photos", "room_id", "INTEGER");
	  ensureColumn("travel_property_photos", "room_name", "TEXT");
	  ensureColumn("travel_booking_requests", "room_id", "INTEGER");
	  ensureColumn("travel_booking_requests", "room_name", "TEXT");
	  ensureColumn("travel_booking_requests", "room_quantity", "INTEGER NOT NULL DEFAULT 1");
	  ensureColumn("travel_booking_requests", "room_price_per_night", "REAL NOT NULL DEFAULT 0");
	  ensureColumn("travel_booking_requests", "stripe_checkout_session_id", "TEXT");
	  ensureColumn("travel_booking_requests", "stripe_payment_intent_id", "TEXT");
	  ensureColumn("travel_booking_requests", "stripe_payment_status", "TEXT");
	  ensureColumn("travel_booking_requests", "paid_at", "TEXT");
	  ensureColumn("travel_booking_requests", "guest_notified_at", "TEXT");
	  ensureColumn("travel_booking_requests", "guest_email_status", "TEXT");
	  ensureColumn("travel_booking_requests", "guest_email_error", "TEXT");
	  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_booking_requests_room_period ON travel_booking_requests(company_id, property_id, room_id, status, check_in, check_out)");
	  ensureColumn("travel_support_tickets", "country", "TEXT NOT NULL DEFAULT 'Romania'");
	  ensureColumn("travel_support_tickets", "opened_at", "TEXT");
	  ensureColumn("travel_support_tickets", "resolved_at", "TEXT");
	  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_property_calendar_blocks_booking ON travel_property_calendar_blocks(company_id, property_id, booking_request_id)");
	  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_leads_company_country ON travel_leads(company_id, country, status)");
	  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_properties_company_country ON travel_properties(company_id, country, status)");
	  db.exec("CREATE INDEX IF NOT EXISTS idx_travel_leads_company_google_place ON travel_leads(company_id, google_place_id)");
	  ensureColumn("travel_blog_articles", "category", "TEXT NOT NULL DEFAULT 'Ghiduri'");
  ensureColumn("facturi", "efactura_upload_index", "TEXT");
  ensureColumn("facturi", "efactura_download_id", "TEXT");
  ensureColumn("facturi", "efactura_response_zip_path", "TEXT");
  ensureColumn("facturi", "efactura_last_checked_at", "TEXT");
  repairLegacyClientForeignKeys();
  ensureColumn("anaf_connections", "scope", "TEXT");
  ensureColumn("anaf_connections", "expires_at", "TEXT");
  ensureColumn("anaf_connections", "refresh_expires_at", "TEXT");
  ensureColumn("anaf_connections", "serial_certificate", "TEXT");
  ensureColumn("anaf_connections", "raw_response", "TEXT");
  ensureColumn("anaf_connections", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");
  ensureColumn("anaf_messages", "details", "TEXT");
  ensureColumn("anaf_oauth_invites", "accountant_email", "TEXT");
  ensureColumn("anaf_oauth_invites", "note", "TEXT");
  ensureColumn("anaf_oauth_invites", "status", "TEXT NOT NULL DEFAULT 'PENDING'");
  ensureColumn("anaf_oauth_invites", "expires_at", "TEXT");
  ensureColumn("anaf_oauth_invites", "consumed_at", "TEXT");
  ensureColumn("anaf_oauth_invites", "completed_at", "TEXT");
  ensureColumn("anaf_oauth_invites", "last_error", "TEXT");
  ensureColumn("anaf_oauth_invites", "created_by_email", "TEXT");
  ensureColumn("anaf_oauth_invites", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_anaf_oauth_logs_created_at ON anaf_oauth_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_anaf_connections_company_id ON anaf_connections(company_id);
    CREATE INDEX IF NOT EXISTS idx_anaf_inbox_company_id ON anaf_inbox(company_id);
    CREATE INDEX IF NOT EXISTS idx_anaf_inbox_download_id ON anaf_inbox(download_id);
    CREATE INDEX IF NOT EXISTS idx_anaf_messages_company_id ON anaf_messages(company_id);
    CREATE INDEX IF NOT EXISTS idx_anaf_oauth_logs_company_id ON anaf_oauth_logs(company_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_anaf_oauth_invites_code_hash ON anaf_oauth_invites(code_hash);
    CREATE INDEX IF NOT EXISTS idx_anaf_oauth_invites_company_id ON anaf_oauth_invites(company_id);
    CREATE INDEX IF NOT EXISTS idx_anaf_oauth_invites_status ON anaf_oauth_invites(status);
    CREATE INDEX IF NOT EXISTS idx_anaf_oauth_invites_expires_at ON anaf_oauth_invites(expires_at);
    CREATE INDEX IF NOT EXISTS idx_company_admin_events_company_id ON company_admin_events(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_admin_events_created_at ON company_admin_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_company_id ON billing_payments(company_id);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_status ON billing_payments(status);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_source ON billing_payments(source);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_created_at ON billing_payments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_stripe_checkout_session_id ON billing_payments(stripe_checkout_session_id);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_stripe_subscription_id ON billing_payments(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_stripe_invoice_id ON billing_payments(stripe_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_stripe_payment_intent_id ON billing_payments(stripe_payment_intent_id);
    CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id ON companies(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_companies_archived_at ON companies(archived_at);
    CREATE INDEX IF NOT EXISTS idx_company_subscriptions_stripe_subscription_id ON company_subscriptions(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_users_company_client_id ON users(company_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_id ON company_subscriptions(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status ON company_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_clients_cui ON clients(cui);
    CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_cui_unique ON clients(company_id, cui);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_company_status ON crm_leads(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_company_created ON crm_leads(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_company_stage ON crm_opportunities(company_id, stage);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_client ON crm_opportunities(company_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_crm_followups_company_due ON crm_followups(company_id, due_date, status);
    CREATE INDEX IF NOT EXISTS idx_crm_followups_company_status ON crm_followups(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_company_status ON crm_email_events(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_crm_email_events_company_created ON crm_email_events(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_imports_company_year_seq ON sales_quote_imports(company_id, year, seq);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_imports_client_id ON sales_quote_imports(company_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_imports_created_at ON sales_quote_imports(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tipizate_docs_client_id ON tipizate_docs(client_id);
    CREATE INDEX IF NOT EXISTS idx_dms_autofill_client_id ON dms_autofill_documents(client_id);
    CREATE INDEX IF NOT EXISTS idx_dms_client_files_company_client ON dms_client_files(company_id, client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_company_id ON accounting_expenses(company_id);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_issue_date ON accounting_expenses(issue_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_payment_status ON accounting_expenses(payment_status);
    CREATE INDEX IF NOT EXISTS idx_accounting_declarations_company_id ON accounting_declarations(company_id);
    CREATE INDEX IF NOT EXISTS idx_accounting_declarations_due_date ON accounting_declarations(due_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_declarations_status ON accounting_declarations(status);
    CREATE INDEX IF NOT EXISTS idx_accounting_cash_company_date ON accounting_cash_transactions(company_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_cash_direction ON accounting_cash_transactions(direction);
    CREATE INDEX IF NOT EXISTS idx_accounting_cash_status ON accounting_cash_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_accounting_entries_company_date ON accounting_entries(company_id, entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_entries_debit ON accounting_entries(account_debit);
    CREATE INDEX IF NOT EXISTS idx_accounting_entries_credit ON accounting_entries(account_credit);
    CREATE INDEX IF NOT EXISTS idx_accounting_budgets_company_period ON accounting_budgets(company_id, period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_accounting_bank_company_date ON accounting_bank_transactions(company_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_bank_status ON accounting_bank_transactions(reconciliation_status);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_company_date ON sales_orders(company_id, order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_company_status ON sales_orders(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_order_items_company_order ON sales_order_items(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_sales_price_lists_company_status ON sales_price_lists(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_price_items_company_list ON sales_price_items(company_id, price_list_id);
    CREATE INDEX IF NOT EXISTS idx_sales_discounts_company_status ON sales_discounts(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_deliveries_company_status ON sales_deliveries(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_order_lifecycle_company_order_status ON order_lifecycle_events(company_id, order_id, to_status);
    CREATE INDEX IF NOT EXISTS idx_order_fulfillment_company_date ON order_fulfillment_tasks(company_id, planned_date DESC);
    CREATE INDEX IF NOT EXISTS idx_order_tracking_company_status ON order_tracking_events(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_delivery_items_company_delivery ON sales_delivery_items(company_id, delivery_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_suppliers_company_code_unique ON procurement_suppliers(company_id, supplier_code);
    CREATE INDEX IF NOT EXISTS idx_procurement_suppliers_company_status ON procurement_suppliers(company_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_orders_company_number_unique ON procurement_orders(company_id, order_number);
    CREATE INDEX IF NOT EXISTS idx_procurement_orders_company_date ON procurement_orders(company_id, order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_procurement_orders_company_status ON procurement_orders(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_orders_supplier ON procurement_orders(company_id, supplier_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_order_items_company_order ON procurement_order_items(company_id, order_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_receipts_company_number_unique ON procurement_receipts(company_id, receipt_number);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_company_date ON procurement_receipts(company_id, receipt_date DESC);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_company_status ON procurement_receipts(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_order ON procurement_receipts(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_procurement_receipt_items_company_receipt ON procurement_receipt_items(company_id, receipt_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_approvals_company_number_unique ON procurement_approvals(company_id, approval_number);
    CREATE INDEX IF NOT EXISTS idx_procurement_approvals_company_status ON procurement_approvals(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_costs_company_date ON procurement_costs(company_id, cost_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_bills_company_number_unique ON procurement_bills(company_id, bill_number);
    CREATE INDEX IF NOT EXISTS idx_procurement_bills_company_status ON procurement_bills(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_procurement_bills_supplier ON procurement_bills(company_id, supplier_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_vouchers_company_id ON consumption_vouchers(company_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_vouchers_issue_date ON consumption_vouchers(issue_date DESC);
    CREATE INDEX IF NOT EXISTS idx_consumption_voucher_items_voucher_id ON consumption_voucher_items(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_assets_company_id ON inventory_assets(company_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_assets_code ON inventory_assets(asset_code);
    CREATE INDEX IF NOT EXISTS idx_inventory_assets_status ON inventory_assets(status);
    CREATE INDEX IF NOT EXISTS idx_inventory_projects_company_id ON inventory_projects(company_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_projects_status ON inventory_projects(status);
    CREATE INDEX IF NOT EXISTS idx_inventory_project_items_project_id ON inventory_project_items(project_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_counts_company_id ON inventory_counts(company_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count_id ON inventory_count_items(count_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_count_items_stock_item_id ON inventory_count_items(stock_item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_asset_id ON inventory_adjustments(asset_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_assets_company_code_unique ON inventory_assets(company_id, asset_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_projects_company_code_unique ON inventory_projects(company_id, project_code);
    CREATE INDEX IF NOT EXISTS idx_inventory_warehouses_company_status ON inventory_warehouses(company_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_warehouses_company_code_unique ON inventory_warehouses(company_id, warehouse_code);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_company_warehouse ON inventory_stock_items(company_id, warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_product ON inventory_stock_items(company_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock_status ON inventory_stock_items(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_inventory_lots_company_warehouse ON inventory_lots(company_id, warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_lots_product ON inventory_lots(company_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_lots_number ON inventory_lots(company_id, lot_number);
    CREATE INDEX IF NOT EXISTS idx_inventory_transfers_company_date ON inventory_transfers(company_id, transfer_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_transfers_company_number_unique ON inventory_transfers(company_id, transfer_number);
    CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_transfer ON inventory_transfer_items(company_id, transfer_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_receipts_company_date ON inventory_receipts(company_id, receipt_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_receipts_company_number_unique ON inventory_receipts(company_id, receipt_number);
    CREATE INDEX IF NOT EXISTS idx_inventory_receipt_items_receipt ON inventory_receipt_items(company_id, receipt_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_pickings_company_date ON inventory_pickings(company_id, scheduled_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_pickings_company_number_unique ON inventory_pickings(company_id, picking_number);
    CREATE INDEX IF NOT EXISTS idx_inventory_picking_items_picking ON inventory_picking_items(company_id, picking_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_barcodes_company_status ON inventory_barcodes(company_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_barcodes_company_value_unique ON inventory_barcodes(company_id, barcode_value);
    CREATE INDEX IF NOT EXISTS idx_travel_blog_articles_company_category ON travel_blog_articles(company_id, category, status);
  `);

  const legacyStarterPlan = db.prepare(`SELECT id FROM plans WHERE code='crm-starter'`).get();
  const currentStarterPlan = db.prepare(`SELECT id FROM plans WHERE code='start'`).get();
  if (legacyStarterPlan?.id && !currentStarterPlan?.id) {
    db.prepare(`
      UPDATE plans
      SET code='start',
          name='Start',
          updated_at=datetime('now')
      WHERE id=?
    `).run(legacyStarterPlan.id);
  } else if (legacyStarterPlan?.id && currentStarterPlan?.id) {
    db.prepare(`
      UPDATE plans
      SET status='inactive',
          updated_at=datetime('now')
      WHERE id=?
    `).run(legacyStarterPlan.id);
  }

  for (const plan of DEFAULT_PLAN_DEFINITIONS) {
    db.prepare(`
      INSERT INTO plans (
        code, name, billing_period, pricing_model, price_monthly, max_users,
        max_modules_per_user, max_active_modules, module_keys, tagline, description,
        features_json, support_copy, extra_dev_copy, image_path, is_public, sort_order, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      ON CONFLICT(code) DO UPDATE SET
        name=excluded.name,
        billing_period=excluded.billing_period,
        pricing_model=excluded.pricing_model,
        price_monthly=excluded.price_monthly,
        max_users=excluded.max_users,
        max_modules_per_user=excluded.max_modules_per_user,
        max_active_modules=excluded.max_active_modules,
        module_keys=excluded.module_keys,
        tagline=excluded.tagline,
        description=excluded.description,
        features_json=excluded.features_json,
        support_copy=excluded.support_copy,
        extra_dev_copy=excluded.extra_dev_copy,
        image_path=excluded.image_path,
        is_public=excluded.is_public,
        sort_order=excluded.sort_order,
        status='active',
        updated_at=datetime('now')
    `).run(
      plan.code,
      plan.name,
      plan.billing_period,
      plan.pricing_model || "flat",
      plan.price_monthly,
      plan.max_users,
      Number(plan.max_modules_per_user || 0),
      Number(plan.max_active_modules || 0),
      JSON.stringify(plan.module_keys),
      plan.tagline || null,
      plan.description || null,
      JSON.stringify(plan.features_json || []),
      plan.support_copy || null,
      plan.extra_dev_copy || null,
      plan.image_path || null,
      Number(plan.is_public ?? 1),
      Number(plan.sort_order || 100)
    );
  }

  backfillTravelModuleAccess();
  backfillEmarqetModuleAccess();

  const companyName = String(
    db.prepare(`SELECT value FROM app_settings WHERE key='company_name'`).get()?.value ||
    "Companie implicită"
  ).trim();
  const companyCui = String(db.prepare(`SELECT value FROM app_settings WHERE key='company_cui'`).get()?.value || "").trim();
  const companyRc = String(db.prepare(`SELECT value FROM app_settings WHERE key='company_rc'`).get()?.value || "").trim();
  const companyAddress = String(db.prepare(`SELECT value FROM app_settings WHERE key='company_address'`).get()?.value || "").trim();
  const companyBank = String(db.prepare(`SELECT value FROM app_settings WHERE key='company_bank'`).get()?.value || "").trim();
  const companyIban = String(db.prepare(`SELECT value FROM app_settings WHERE key='company_iban'`).get()?.value || "").trim();
  const companyRepresentative = String(db.prepare(`SELECT value FROM app_settings WHERE key='company_rep'`).get()?.value || "").trim();
  const companySlug = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "companie";

  let company = db.prepare(`SELECT id FROM companies ORDER BY id LIMIT 1`).get();
  if (!company) {
    db.prepare(`
      INSERT INTO companies (name, slug, cui, rc, address, bank, iban, representative, status, max_users)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      companyName,
      companySlug,
      companyCui,
      companyRc,
      companyAddress,
      companyBank,
      companyIban,
      companyRepresentative,
      10
    );
    company = db.prepare(`SELECT id FROM companies ORDER BY id LIMIT 1`).get();
  } else {
    db.prepare(`
      UPDATE companies
      SET name=?, cui=?, rc=?, address=?, bank=?, iban=?, representative=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      companyName,
      companyCui,
      companyRc,
      companyAddress,
      companyBank,
      companyIban,
      companyRepresentative,
      company.id
    );
  }

  if (company?.id) {
    db.prepare(`
      UPDATE users
      SET company_id=?,
          is_company_admin=CASE WHEN LOWER(role)='admin' THEN 1 ELSE is_company_admin END,
          status=COALESCE(NULLIF(status, ''), 'active')
      WHERE company_id IS NULL
    `).run(company.id);

    const userCount = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id=?`).get(company.id)?.n || 0;
    const subscription = db.prepare(`
      SELECT id
      FROM company_subscriptions
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(company.id);

    if (!subscription) {
      const enterprisePlan = db.prepare(`SELECT id, max_users FROM plans WHERE code='enterprise'`).get();
      if (enterprisePlan) {
        db.prepare(`
          INSERT INTO company_subscriptions (company_id, plan_id, status, seats_included, seats_used, module_overrides)
          VALUES (?, ?, 'active', ?, ?, ?)
        `).run(
          company.id,
          enterprisePlan.id,
          Math.max(enterprisePlan.max_users || 10, userCount || 1),
          userCount,
          JSON.stringify(ALL_MODULE_KEYS)
        );
      }
    } else {
      db.prepare(`
        UPDATE company_subscriptions
        SET seats_used=?,
            updated_at=datetime('now')
        WHERE id=?
      `).run(userCount, subscription.id);
    }

    db.prepare(`
      UPDATE companies
      SET max_users=COALESCE((
        SELECT seats_included
        FROM company_subscriptions
        WHERE company_id=companies.id
        ORDER BY id DESC
        LIMIT 1
      ), max_users),
      updated_at=datetime('now')
      WHERE id=?
    `).run(company.id);

    db.exec(`
      UPDATE clients SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE contracts SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE products SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE quotes SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE facturi SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE tipizate_docs SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE employees SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE anaf_messages SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE anaf_connections SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE anaf_inbox SET company_id=${company.id} WHERE company_id IS NULL;
      UPDATE anaf_oauth_logs SET company_id=${company.id} WHERE company_id IS NULL;
    `);

    db.exec(`
      UPDATE contacts
      SET company_id = (
        SELECT clients.company_id FROM clients WHERE clients.id = contacts.client_id
      )
      WHERE company_id IS NULL;

      UPDATE activities
      SET company_id = (
        SELECT clients.company_id FROM clients WHERE clients.id = activities.client_id
      )
      WHERE company_id IS NULL;

      UPDATE quote_items
      SET company_id = (
        SELECT quotes.company_id FROM quotes WHERE quotes.id = quote_items.quote_id
      )
      WHERE company_id IS NULL;

      UPDATE facturi_linii
      SET company_id = (
        SELECT facturi.company_id FROM facturi WHERE facturi.id = facturi_linii.factura_id
      )
      WHERE company_id IS NULL;
    `);
  }

}
