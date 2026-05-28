// db.js (ESM)
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { ALL_MODULE_KEYS, DEFAULT_PLAN_DEFINITIONS } from "./lib/app-config.js";

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
      asset_code TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      quantity_scriptic REAL NOT NULL DEFAULT 0,
      quantity_counted REAL NOT NULL DEFAULT 0,
      variance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      applied INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES inventory_assets(id) ON DELETE SET NULL
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
    CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_year_seq ON quotes(year, seq);
    CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
    CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
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
  `);

  ensureColumn("users", "module_permissions", "TEXT");
  ensureColumn("users", "company_id", "INTEGER");
  ensureColumn("users", "status", "TEXT DEFAULT 'active'");
  ensureColumn("users", "is_company_admin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "client_id", "INTEGER");
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
  ensureColumn("quotes", "company_id", "INTEGER");
  ensureColumn("quote_items", "company_id", "INTEGER");
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
    CREATE INDEX IF NOT EXISTS idx_tipizate_docs_client_id ON tipizate_docs(client_id);
    CREATE INDEX IF NOT EXISTS idx_dms_autofill_client_id ON dms_autofill_documents(client_id);
    CREATE INDEX IF NOT EXISTS idx_dms_client_files_company_client ON dms_client_files(company_id, client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_company_id ON accounting_expenses(company_id);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_issue_date ON accounting_expenses(issue_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_payment_status ON accounting_expenses(payment_status);
    CREATE INDEX IF NOT EXISTS idx_accounting_declarations_company_id ON accounting_declarations(company_id);
    CREATE INDEX IF NOT EXISTS idx_accounting_declarations_due_date ON accounting_declarations(due_date DESC);
    CREATE INDEX IF NOT EXISTS idx_accounting_declarations_status ON accounting_declarations(status);
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
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_asset_id ON inventory_adjustments(asset_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_assets_company_code_unique ON inventory_assets(company_id, asset_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_projects_company_code_unique ON inventory_projects(company_id, project_code);
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
