PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE facturi_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  factura_nr TEXT UNIQUE,
  an INTEGER,
  seq INTEGER,

  client_id INTEGER NOT NULL,
  contract_id INTEGER,
  quote_id INTEGER,

  status TEXT NOT NULL DEFAULT 'DRAFT',     -- DRAFT | TRIMITERE_IN_ASTEPTARE | TRIMIS | TRIMIS_CONFIRMAT | EROARE_TRIMITERE | ANULATA
  moneda TEXT NOT NULL DEFAULT 'RON',

  subtotal REAL NOT NULL DEFAULT 0,
  tva_procent REAL NOT NULL DEFAULT 0.19,
  tva_valoare REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,

  data_emitere TEXT NOT NULL DEFAULT (date('now')),
  scadenta TEXT,
  observatii TEXT,

  pdf_path TEXT,
  pdf_generated_at TEXT,

  efactura_status TEXT,
  efactura_message_id TEXT,
  efactura_xml_path TEXT,
  efactura_last_error TEXT,
  efactura_sent_at TEXT,
  efactura_confirmed_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

INSERT INTO facturi_new (
  id, factura_nr, an, seq, client_id, contract_id, quote_id, status, moneda,
  subtotal, tva_procent, tva_valoare, total,
  data_emitere, scadenta, observatii,
  pdf_path, pdf_generated_at,
  efactura_status, efactura_message_id, efactura_xml_path, efactura_last_error,
  efactura_sent_at, efactura_confirmed_at,
  created_at
)
SELECT
  id,
  factura_nr,
  an,
  seq,
  client_id,
  contract_id,
  quote_id,
  CASE
    WHEN status='ANULATA' THEN 'ANULATA'
    WHEN efactura_status IN ('TRIMIS_CONFIRMAT','CONFIRMAT','ACCEPTAT') THEN 'TRIMIS_CONFIRMAT'
    WHEN efactura_status IS NOT NULL AND TRIM(efactura_status)<>'' AND efactura_status<>'PREGATIT_PENTRU_TRIMITERE' THEN 'TRIMIS'
    WHEN pdf_path IS NOT NULL AND TRIM(pdf_path)<>'' THEN 'TRIMITERE_IN_ASTEPTARE'
    ELSE 'DRAFT'
  END,
  moneda,
  subtotal,
  tva_procent,
  tva_valoare,
  total,
  data_emitere,
  scadenta,
  observatii,
  pdf_path,
  CASE WHEN pdf_path IS NOT NULL AND TRIM(pdf_path)<>'' THEN created_at ELSE NULL END,
  efactura_status,
  efactura_message_id,
  efactura_xml_path,
  efactura_last_error,
  CASE WHEN efactura_status IS NOT NULL AND TRIM(efactura_status)<>'' AND efactura_status<>'PREGATIT_PENTRU_TRIMITERE' THEN created_at ELSE NULL END,
  CASE WHEN efactura_status IN ('TRIMIS_CONFIRMAT','CONFIRMAT','ACCEPTAT') THEN created_at ELSE NULL END,
  created_at
FROM facturi;

DROP TABLE facturi;
ALTER TABLE facturi_new RENAME TO facturi;

CREATE INDEX idx_facturi_client_id ON facturi(client_id);
CREATE INDEX idx_facturi_an_seq ON facturi(an, seq);
CREATE INDEX idx_facturi_status ON facturi(status);
CREATE INDEX idx_facturi_pdf_generated_at ON facturi(pdf_generated_at);
CREATE INDEX idx_facturi_efactura_sent_at ON facturi(efactura_sent_at);

COMMIT;
PRAGMA foreign_keys=ON;
