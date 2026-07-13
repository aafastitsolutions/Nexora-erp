import {
  renderNexoraProcurementApprovalsPage,
  renderNexoraProcurementBillsPage,
  renderNexoraProcurementCostsPage,
  renderNexoraProcurementHubPage,
  renderNexoraProcurementOpportunitiesPage,
  renderNexoraProcurementOrdersPage,
  renderNexoraProcurementReceiptsPage,
  renderNexoraProcurementSuppliersPage
} from "../src/ui/nexora-procurement-pages.js";
import {
  createCrmLeadFromProcurementOpportunity,
  ensureProcurementOpportunitiesSchema,
  loadProcurementOpportunities,
  syncEuOpportunityFinder,
  syncProcurementOpportunities,
  updateProcurementOpportunityStatus
} from "../lib/procurement-opportunities.js";

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function currentUserEmail(req) {
  return String(req.session.user.email || "").trim().toLowerCase();
}

function safeText(value) {
  return String(value || "").trim();
}

function parseNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function parseDate(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugCode(value) {
  const normalized = safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized || "FURNIZOR";
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    procurement_orders: "order_number",
    procurement_receipts: "receipt_number",
    procurement_approvals: "approval_number",
    procurement_bills: "bill_number",
    inventory_receipts: "receipt_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported procurement sequence");
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const latest = db.prepare(`
    SELECT ${columnName} AS number_value
    FROM ${tableName}
    WHERE company_id=? AND ${columnName} LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${stem}%`);
  const last = Number(String(latest?.number_value || "").split("-").pop() || 0);
  return `${stem}${String(last + 1).padStart(4, "0")}`;
}

function recalcOrderTotals(db, companyId, orderId) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(line_subtotal),0) AS subtotal,
      COALESCE(SUM(line_vat),0) AS vat_amount,
      COALESCE(SUM(line_total),0) AS total
    FROM procurement_order_items
    WHERE company_id=? AND order_id=?
  `).get(companyId, orderId) || {};
  db.prepare(`
    UPDATE procurement_orders
    SET subtotal=?, vat_amount=?, total=?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    Number(totals.subtotal || 0),
    Number(totals.vat_amount || 0),
    Number(totals.total || 0),
    orderId,
    companyId
  );
}

function saveUploadedAttachment({ fs, path, __dirname, file }) {
  if (!file) return "";
  const targetDir = path.join(__dirname, "public", "uploads", "procurement", "bills");
  fs.mkdirSync(targetDir, { recursive: true });
  const safeBase = String(file.originalname || "document").replace(/[^A-Za-z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeBase}`;
  const finalPath = path.join(targetDir, finalName);
  fs.renameSync(file.path, finalPath);
  return `uploads/procurement/bills/${finalName}`;
}

function loadSuppliers(db, companyId) {
  return db.prepare(`
    SELECT
      s.*,
      COUNT(DISTINCT o.id) AS orders_count,
      COUNT(DISTINCT b.id) AS bills_count
    FROM procurement_suppliers s
    LEFT JOIN procurement_orders o ON o.supplier_id = s.id AND o.company_id = s.company_id
    LEFT JOIN procurement_bills b ON b.supplier_id = s.id AND b.company_id = s.company_id
    WHERE s.company_id=?
    GROUP BY s.id
    ORDER BY s.status='ACTIV' DESC, s.name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadActiveSuppliers(db, companyId) {
  return db.prepare(`
    SELECT *
    FROM procurement_suppliers
    WHERE company_id=? AND UPPER(COALESCE(status,'')) <> 'BLOCAT'
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadProducts(db, companyId) {
  return db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, kind
    FROM products
    WHERE company_id=? AND COALESCE(active,1)=1
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadWarehouses(db, companyId) {
  return db.prepare(`
    SELECT id, warehouse_code, name
    FROM inventory_warehouses
    WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV'
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 300
  `).all(companyId);
}

function loadOrders(db, companyId, onlyOpen = false) {
  const statusFilter = onlyOpen ? "AND UPPER(COALESCE(o.status,'')) NOT IN ('ANULATA','RECEPTIONATA')" : "";
  return db.prepare(`
    SELECT o.*, s.name AS supplier_name, s.cui AS supplier_cui
    FROM procurement_orders o
    JOIN procurement_suppliers s ON s.id = o.supplier_id AND s.company_id = o.company_id
    WHERE o.company_id=? ${statusFilter}
    ORDER BY o.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadReceipts(db, companyId, onlyOpen = false) {
  const statusFilter = onlyOpen ? "AND UPPER(COALESCE(r.status,'')) NOT IN ('RECEPTIONATA','ANULATA')" : "";
  return db.prepare(`
    SELECT r.*, s.name AS supplier_name, o.order_number, w.name AS warehouse_name
    FROM procurement_receipts r
    LEFT JOIN procurement_suppliers s ON s.id = r.supplier_id AND s.company_id = r.company_id
    LEFT JOIN procurement_orders o ON o.id = r.order_id AND o.company_id = r.company_id
    LEFT JOIN inventory_warehouses w ON w.id = r.warehouse_id AND w.company_id = r.company_id
    WHERE r.company_id=? ${statusFilter}
    ORDER BY r.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadBills(db, companyId) {
  return db.prepare(`
    SELECT b.*, s.name AS supplier_name, s.cui AS supplier_cui, o.order_number, r.receipt_number
    FROM procurement_bills b
    JOIN procurement_suppliers s ON s.id = b.supplier_id AND s.company_id = b.company_id
    LEFT JOIN procurement_orders o ON o.id = b.order_id AND o.company_id = b.company_id
    LEFT JOIN procurement_receipts r ON r.id = b.receipt_id AND r.company_id = b.company_id
    WHERE b.company_id=?
    ORDER BY b.issue_date DESC, b.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadOpenOrderItems(db, companyId) {
  return db.prepare(`
    SELECT
      i.*,
      o.order_number,
      o.supplier_id,
      s.name AS supplier_name,
      MAX(0, i.quantity - COALESCE(i.received_quantity,0)) AS remaining_qty
    FROM procurement_order_items i
    JOIN procurement_orders o ON o.id = i.order_id AND o.company_id = i.company_id
    JOIN procurement_suppliers s ON s.id = o.supplier_id AND s.company_id = o.company_id
    WHERE i.company_id=?
      AND UPPER(COALESCE(o.status,'')) <> 'ANULATA'
      AND i.quantity > COALESCE(i.received_quantity,0)
    ORDER BY o.id DESC, i.id ASC
    LIMIT 500
  `).all(companyId);
}

function getProduct(db, companyId, productId) {
  if (!Number(productId)) return null;
  return db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, kind
    FROM products
    WHERE id=? AND company_id=?
  `).get(Number(productId), companyId) || null;
}

function getOrderItem(db, companyId, orderItemId) {
  if (!Number(orderItemId)) return null;
  return db.prepare(`
    SELECT i.*, o.order_number
    FROM procurement_order_items i
    JOIN procurement_orders o ON o.id = i.order_id AND o.company_id = i.company_id
    WHERE i.id=? AND i.company_id=?
  `).get(Number(orderItemId), companyId) || null;
}

function ensureInventoryStockItem(db, companyId, warehouseId, line, req) {
  const productId = Number(line.product_id || 0) || null;
  const itemCode = safeText(line.item_code) || `SKU-${Date.now()}`;
  const existing = productId
    ? db.prepare(`
        SELECT *
        FROM inventory_stock_items
        WHERE company_id=? AND warehouse_id=? AND product_id=?
        ORDER BY id DESC
        LIMIT 1
      `).get(companyId, warehouseId, productId)
    : db.prepare(`
        SELECT *
        FROM inventory_stock_items
        WHERE company_id=? AND warehouse_id=? AND item_code=?
        ORDER BY id DESC
        LIMIT 1
      `).get(companyId, warehouseId, itemCode);
  if (existing) return existing;

  const result = db.prepare(`
    INSERT INTO inventory_stock_items (
      company_id, warehouse_id, product_id, item_code, item_name, item_type, unit,
      quantity, reserved_quantity, minimum_quantity, status, notes, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    warehouseId || null,
    productId,
    itemCode,
    safeText(line.item_name) || itemCode,
    "PRODUS",
    safeText(line.unit) || "buc",
    0,
    0,
    0,
    "ACTIV",
    "Creat din recepție achiziții",
    currentUserEmail(req)
  );
  return db.prepare(`SELECT * FROM inventory_stock_items WHERE id=? AND company_id=?`).get(Number(result.lastInsertRowid), companyId);
}

function incrementInventoryStock(db, companyId, stockItemId, quantity) {
  db.prepare(`
    UPDATE inventory_stock_items
    SET quantity = quantity + ?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(quantity, stockItemId, companyId);
}

function finalizeProcurementReceipt(db, req, companyId, receipt) {
  const lines = db.prepare(`
    SELECT *
    FROM procurement_receipt_items
    WHERE company_id=? AND receipt_id=?
    ORDER BY id ASC
  `).all(companyId, receipt.id);
  const supplier = receipt.supplier_id
    ? db.prepare(`SELECT * FROM procurement_suppliers WHERE id=? AND company_id=?`).get(receipt.supplier_id, companyId)
    : null;

  let inventoryReceiptId = Number(receipt.inventory_receipt_id || 0);
  if (!inventoryReceiptId) {
    const inventoryNumber = nextNumber(db, companyId, "inventory_receipts", "receipt_number", "IR");
    const result = db.prepare(`
      INSERT INTO inventory_receipts (
        company_id, receipt_number, warehouse_id, supplier_name, receipt_date,
        document_number, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      inventoryNumber,
      receipt.warehouse_id || null,
      safeText(supplier?.name),
      parseDate(receipt.receipt_date) || todayIso(),
      safeText(receipt.document_number),
      "RECEPTIONAT",
      `Generată din recepția achiziții ${receipt.receipt_number}`,
      currentUserEmail(req)
    );
    inventoryReceiptId = Number(result.lastInsertRowid || 0);
  }

  for (const line of lines) {
    const qty = parseNumber(line.quantity, 0);
    if (qty <= 0) continue;
    const stockItem = ensureInventoryStockItem(db, companyId, receipt.warehouse_id, line, req);
    incrementInventoryStock(db, companyId, stockItem.id, qty);
    db.prepare(`
      INSERT INTO inventory_receipt_items (
        company_id, receipt_id, product_id, stock_item_id, item_code, item_name,
        unit, quantity, unit_cost, lot_number, serial_number, expiry_date, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      inventoryReceiptId,
      line.product_id || null,
      stockItem.id,
      safeText(line.item_code) || stockItem.item_code,
      safeText(line.item_name) || stockItem.item_name,
      safeText(line.unit) || stockItem.unit || "buc",
      qty,
      parseNumber(line.unit_cost, 0),
      safeText(line.lot_number),
      safeText(line.serial_number),
      parseDate(line.expiry_date),
      safeText(line.notes)
    );
    if (safeText(line.lot_number) || safeText(line.serial_number)) {
      db.prepare(`
        INSERT INTO inventory_lots (
          company_id, warehouse_id, product_id, stock_item_id, lot_number, serial_number,
          item_name, quantity_initial, quantity_available, unit, received_at, expiry_date,
          supplier_name, status, notes, created_by_email, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).run(
        companyId,
        receipt.warehouse_id || null,
        line.product_id || null,
        stockItem.id,
        safeText(line.lot_number) || `LOT-${receipt.receipt_number}-${line.id}`,
        safeText(line.serial_number),
        safeText(line.item_name) || stockItem.item_name,
        qty,
        qty,
        safeText(line.unit) || stockItem.unit || "buc",
        parseDate(receipt.receipt_date) || todayIso(),
        parseDate(line.expiry_date),
        safeText(supplier?.name),
        "ACTIV",
        safeText(line.notes),
        currentUserEmail(req)
      );
    }
    if (line.order_item_id) {
      db.prepare(`
        UPDATE procurement_order_items
        SET received_quantity = received_quantity + ?
        WHERE id=? AND company_id=?
      `).run(qty, line.order_item_id, companyId);
    }
  }

  db.prepare(`
    UPDATE procurement_receipts
    SET status='RECEPTIONATA', inventory_receipt_id=?, updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(inventoryReceiptId, receipt.id, companyId);

  if (receipt.order_id) {
    const remaining = db.prepare(`
      SELECT COUNT(*) AS remaining_lines
      FROM procurement_order_items
      WHERE company_id=? AND order_id=? AND quantity > COALESCE(received_quantity,0)
    `).get(companyId, receipt.order_id) || {};
    db.prepare(`
      UPDATE procurement_orders
      SET status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(Number(remaining.remaining_lines || 0) > 0 ? "PARTIAL_RECEPTIONATA" : "RECEPTIONATA", receipt.order_id, companyId);
  }
}

function createAccountingExpenseForBill(db, req, companyId, bill, supplier, attachmentPath) {
  const result = db.prepare(`
    INSERT INTO accounting_expenses (
      company_id, expense_type, category, supplier_name, supplier_cui, doc_number,
      issue_date, due_date, payment_status, deductible_percent, currency, subtotal,
      vat_amount, total, notes, attachment_path, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    "FACTURA",
    "ACHIZITII",
    safeText(supplier?.name),
    safeText(supplier?.cui),
    safeText(bill.doc_number || bill.bill_number),
    parseDate(bill.issue_date) || todayIso(),
    parseDate(bill.due_date),
    safeText(bill.payment_status) || "NEPLATITA",
    100,
    safeText(bill.currency) || "RON",
    parseNumber(bill.subtotal, 0),
    parseNumber(bill.vat_amount, 0),
    parseNumber(bill.total, 0),
    `Creată din modulul Achiziții: ${bill.bill_number}`,
    attachmentPath || "",
    currentUserEmail(req)
  );
  return Number(result.lastInsertRowid || 0);
}

export function registerProcurementRoutes(app, { db, requireAuth, fmtMoney, fs, path, __dirname, upload }) {
  ensureProcurementOpportunitiesSchema(db);

  app.get("/nexora/procurement", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = {
      ...(db.prepare(`
        SELECT SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active_suppliers
        FROM procurement_suppliers
        WHERE company_id=?
      `).get(companyId) || {}),
      ...(db.prepare(`
        SELECT SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('RECEPTIONATA','ANULATA') THEN 1 ELSE 0 END) AS open_orders
        FROM procurement_orders
        WHERE company_id=?
      `).get(companyId) || {}),
      ...(db.prepare(`
        SELECT SUM(CASE WHEN UPPER(COALESCE(status,''))='PENDING' THEN 1 ELSE 0 END) AS pending_approvals
        FROM procurement_approvals
        WHERE company_id=?
      `).get(companyId) || {}),
      ...(db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN total ELSE 0 END),0) AS unpaid_bills_amount
        FROM procurement_bills
        WHERE company_id=?
      `).get(companyId) || {})
    };
    const recentOrders = db.prepare(`
      SELECT o.id, o.order_number, o.status, o.order_date, o.total, s.name AS supplier_name
      FROM procurement_orders o
      JOIN procurement_suppliers s ON s.id = o.supplier_id AND s.company_id = o.company_id
      WHERE o.company_id=?
      ORDER BY o.id DESC
      LIMIT 8
    `).all(companyId);
    const recentBills = db.prepare(`
      SELECT b.id, b.bill_number, b.doc_number, b.payment_status, b.total, s.name AS supplier_name
      FROM procurement_bills b
      JOIN procurement_suppliers s ON s.id = b.supplier_id AND s.company_id = b.company_id
      WHERE b.company_id=?
      ORDER BY b.id DESC
      LIMIT 8
    `).all(companyId);
    return res.type("html").send(renderNexoraProcurementHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      recentOrders,
      recentBills,
      fmtMoney
    }));
  });

  app.get("/nexora/procurement/opportunities", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const filters = {
      eu_only: true,
      source: safeText(req.query?.source),
      status: safeText(req.query?.status) || "active",
      contract_type: safeText(req.query?.contract_type),
      source_type: safeText(req.query?.source_type),
      country: safeText(req.query?.country),
      funding_program: safeText(req.query?.funding_program),
      review_status: safeText(req.query?.review_status),
      min_score: parseNumber(req.query?.min_score, 0),
      publication_from: parseDate(req.query?.publication_from),
      publication_to: parseDate(req.query?.publication_to),
      deadline_from: parseDate(req.query?.deadline_from),
      deadline_to: parseDate(req.query?.deadline_to),
      q: safeText(req.query?.q)
    };
    const data = loadProcurementOpportunities(db, companyId, filters);
    const syncResults = (() => {
      try {
        return JSON.parse(String(req.session?.procurementOpportunitySyncResults || "[]"));
      } catch {
        return [];
      }
    })();
    req.session.procurementOpportunitySyncResults = null;
    return res.type("html").send(renderNexoraProcurementOpportunitiesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: data.rows,
      stats: data.stats,
      latestRuns: data.latestRuns,
      sources: data.sources,
      notifications: data.notifications,
      filters,
      syncResults,
      fmtMoney,
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/procurement/opportunities/sync", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req);
    try {
      const results = await syncEuOpportunityFinder(db, companyId, { limit: 40 });
      req.session.procurementOpportunitySyncResults = JSON.stringify(results);
      return res.redirect("/nexora/procurement/opportunities");
    } catch (error) {
      console.error("Procurement opportunities sync failed:", error);
      return res.redirect(`/nexora/procurement/opportunities?err=${encodeURIComponent("Sincronizarea a eșuat. Verifică logurile sau încearcă din nou.")}`);
    }
  });

  app.post("/nexora/procurement/opportunities/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    try {
      const result = updateProcurementOpportunityStatus(db, companyId, Number(req.params.id || 0), req.body?.review_status);
      return res.redirect(`/nexora/procurement/opportunities?${result.ok ? "ok=updated" : "err=missing"}`);
    } catch (error) {
      console.error("Procurement opportunity status update failed:", error);
      return res.redirect("/nexora/procurement/opportunities?err=status_failed");
    }
  });

  app.post("/nexora/procurement/opportunities/:id/create-lead", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    try {
      const result = createCrmLeadFromProcurementOpportunity(db, companyId, Number(req.params.id || 0), currentUserEmail(req));
      return res.redirect(`/nexora/procurement/opportunities?${result.ok ? "ok=lead_created" : "err=lead_failed"}`);
    } catch (error) {
      console.error("Create CRM lead from procurement opportunity failed:", error);
      return res.redirect("/nexora/procurement/opportunities?err=lead_failed");
    }
  });

  app.get("/nexora/procurement/suppliers", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const q = safeText(req.query?.q);
    const status = safeText(req.query?.status).toUpperCase();
    const where = ["s.company_id=?"];
    const params = [companyId];
    if (status) {
      where.push("UPPER(COALESCE(s.status,''))=?");
      params.push(status);
    }
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(s.name,'')) LIKE ? OR LOWER(COALESCE(s.cui,'')) LIKE ? OR LOWER(COALESCE(s.email,'')) LIKE ? OR LOWER(COALESCE(s.phone,'')) LIKE ?)");
      params.push(like, like, like, like);
    }
    const rows = db.prepare(`
      SELECT
        s.*,
        COUNT(DISTINCT o.id) AS orders_count,
        COUNT(DISTINCT b.id) AS bills_count
      FROM procurement_suppliers s
      LEFT JOIN procurement_orders o ON o.supplier_id = s.id AND o.company_id = s.company_id
      LEFT JOIN procurement_bills b ON b.supplier_id = s.id AND b.company_id = s.company_id
      WHERE ${where.join(" AND ")}
      GROUP BY s.id
      ORDER BY s.status='ACTIV' DESC, s.name COLLATE NOCASE ASC
      LIMIT 500
    `).all(...params);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active,
        (SELECT COUNT(DISTINCT supplier_id) FROM procurement_orders WHERE company_id=?) AS with_orders,
        (SELECT COUNT(DISTINCT supplier_id) FROM procurement_bills WHERE company_id=?) AS with_bills
      FROM procurement_suppliers
      WHERE company_id=?
    `).get(companyId, companyId, companyId) || {};
    return res.type("html").send(renderNexoraProcurementSuppliersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      filters: { q, status },
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/procurement/suppliers/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    const code = safeText(req.body?.supplier_code) || `FUR-${slugCode(name).slice(0, 12)}-${Date.now().toString().slice(-4)}`;
    db.prepare(`
      INSERT INTO procurement_suppliers (
        company_id, supplier_code, name, cui, registration_number, category, contact_name,
        email, phone, address, payment_terms_days, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(company_id, supplier_code) DO UPDATE SET
        name=excluded.name,
        cui=excluded.cui,
        registration_number=excluded.registration_number,
        category=excluded.category,
        contact_name=excluded.contact_name,
        email=excluded.email,
        phone=excluded.phone,
        address=excluded.address,
        payment_terms_days=excluded.payment_terms_days,
        status=excluded.status,
        notes=excluded.notes,
        updated_at=datetime('now')
    `).run(
      companyId,
      code,
      name || code,
      safeText(req.body?.cui),
      safeText(req.body?.registration_number),
      safeText(req.body?.category),
      safeText(req.body?.contact_name),
      safeText(req.body?.email),
      safeText(req.body?.phone),
      safeText(req.body?.address),
      Math.max(0, Math.round(parseNumber(req.body?.payment_terms_days, 30))),
      safeText(req.body?.status).toUpperCase() || "ACTIV",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/procurement/suppliers?ok=created");
  });

  app.get("/nexora/procurement/orders", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const q = safeText(req.query?.q);
    const status = safeText(req.query?.status).toUpperCase();
    const where = ["o.company_id=?"];
    const params = [companyId];
    if (status) {
      where.push("UPPER(COALESCE(o.status,''))=?");
      params.push(status);
    }
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(o.order_number,'')) LIKE ? OR LOWER(COALESCE(s.name,'')) LIKE ? OR LOWER(COALESCE(s.cui,'')) LIKE ?)");
      params.push(like, like, like);
    }
    const rows = db.prepare(`
      SELECT
        o.*,
        s.name AS supplier_name,
        s.cui AS supplier_cui,
        COUNT(i.id) AS line_count
      FROM procurement_orders o
      JOIN procurement_suppliers s ON s.id = o.supplier_id AND s.company_id = o.company_id
      LEFT JOIN procurement_order_items i ON i.order_id = o.id AND i.company_id = o.company_id
      WHERE ${where.join(" AND ")}
      GROUP BY o.id
      ORDER BY date(COALESCE(o.order_date, o.created_at)) DESC, o.id DESC
      LIMIT 300
    `).all(...params);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(total),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('RECEPTIONATA','ANULATA') THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PARTIAL_RECEPTIONATA' THEN 1 ELSE 0 END) AS partial_count
      FROM procurement_orders
      WHERE company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraProcurementOrdersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      openOrders: loadOrders(db, companyId, true),
      suppliers: loadActiveSuppliers(db, companyId),
      products: loadProducts(db, companyId),
      stats,
      filters: { q, status },
      fmtMoney,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/procurement/orders/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const supplierId = Number(req.body?.supplier_id || 0);
    const supplier = db.prepare(`SELECT id FROM procurement_suppliers WHERE id=? AND company_id=?`).get(supplierId, companyId);
    if (!supplier) return res.status(404).send("Furnizorul nu există.");
    const orderNumber = nextNumber(db, companyId, "procurement_orders", "order_number", "PO");
    db.prepare(`
      INSERT INTO procurement_orders (
        company_id, order_number, supplier_id, status, approval_status, order_date,
        expected_date, requested_by_email, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      orderNumber,
      supplierId,
      "DRAFT",
      "NECESITA_APROBARE",
      parseDate(req.body?.order_date) || todayIso(),
      parseDate(req.body?.expected_date),
      currentUserEmail(req),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/procurement/orders?ok=created");
  });

  app.post("/nexora/procurement/orders/items", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.body?.order_id || 0);
    const order = db.prepare(`SELECT id FROM procurement_orders WHERE id=? AND company_id=?`).get(orderId, companyId);
    if (!order) return res.status(404).send("Comanda nu există.");
    const product = getProduct(db, companyId, Number(req.body?.product_id || 0));
    const qty = parseNumber(req.body?.quantity, 1);
    const unitCost = parseNumber(req.body?.unit_cost, 0);
    const vatPercent = parseNumber(req.body?.vat_percent, 19);
    const subtotal = qty * unitCost;
    const vat = subtotal * vatPercent / 100;
    db.prepare(`
      INSERT INTO procurement_order_items (
        company_id, order_id, product_id, item_code, item_name, unit, quantity,
        unit_cost, vat_percent, line_subtotal, line_vat, line_total, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      orderId,
      product?.id || null,
      safeText(req.body?.item_code) || safeText(product?.code),
      safeText(req.body?.item_name) || safeText(product?.name) || "Articol achiziție",
      safeText(req.body?.unit) || safeText(product?.unit) || "buc",
      qty,
      unitCost,
      vatPercent,
      subtotal,
      vat,
      subtotal + vat,
      safeText(req.body?.notes)
    );
    recalcOrderTotals(db, companyId, orderId);
    res.redirect("/nexora/procurement/orders?ok=item_added");
  });

  app.post("/nexora/procurement/orders/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.params.id || 0);
    const order = db.prepare(`SELECT id FROM procurement_orders WHERE id=? AND company_id=?`).get(orderId, companyId);
    if (!order) return res.status(404).send("Comanda nu există.");
    db.prepare(`UPDATE procurement_orders SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(
      safeText(req.body?.status).toUpperCase() || "DRAFT",
      orderId,
      companyId
    );
    res.redirect("/nexora/procurement/orders?ok=status");
  });

  app.get("/nexora/procurement/receipts", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT
        r.*,
        s.name AS supplier_name,
        o.order_number,
        w.name AS warehouse_name,
        COUNT(i.id) AS line_count,
        COALESCE(SUM(i.quantity * i.unit_cost), 0) AS total_value
      FROM procurement_receipts r
      LEFT JOIN procurement_suppliers s ON s.id = r.supplier_id AND s.company_id = r.company_id
      LEFT JOIN procurement_orders o ON o.id = r.order_id AND o.company_id = r.company_id
      LEFT JOIN inventory_warehouses w ON w.id = r.warehouse_id AND w.company_id = r.company_id
      LEFT JOIN procurement_receipt_items i ON i.receipt_id = r.id AND i.company_id = r.company_id
      WHERE r.company_id=?
      GROUP BY r.id
      ORDER BY r.receipt_date DESC, r.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT r.id) AS total_count,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(r.status,'')) NOT IN ('RECEPTIONATA','ANULATA') THEN r.id END) AS open_count,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(r.status,''))='RECEPTIONATA' THEN r.id END) AS done_count,
        COALESCE(SUM(i.quantity * i.unit_cost), 0) AS total_value
      FROM procurement_receipts r
      LEFT JOIN procurement_receipt_items i ON i.receipt_id = r.id AND i.company_id = r.company_id
      WHERE r.company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraProcurementReceiptsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      openReceipts: loadReceipts(db, companyId, true),
      orders: loadOrders(db, companyId, true),
      suppliers: loadActiveSuppliers(db, companyId),
      warehouses: loadWarehouses(db, companyId),
      orderItems: loadOpenOrderItems(db, companyId),
      stats,
      fmtMoney,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/procurement/receipts/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.body?.order_id || 0) || null;
    const order = orderId ? db.prepare(`SELECT * FROM procurement_orders WHERE id=? AND company_id=?`).get(orderId, companyId) : null;
    const supplierId = Number(req.body?.supplier_id || order?.supplier_id || 0);
    const supplier = db.prepare(`SELECT id FROM procurement_suppliers WHERE id=? AND company_id=?`).get(supplierId, companyId);
    if (!supplier) return res.status(404).send("Furnizorul nu există.");
    const warehouseId = Number(req.body?.warehouse_id || 0) || null;
    const receiptNumber = nextNumber(db, companyId, "procurement_receipts", "receipt_number", "PRE");
    db.prepare(`
      INSERT INTO procurement_receipts (
        company_id, receipt_number, order_id, supplier_id, warehouse_id, status,
        receipt_date, document_number, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      receiptNumber,
      orderId,
      supplierId,
      warehouseId,
      "DRAFT",
      parseDate(req.body?.receipt_date) || todayIso(),
      safeText(req.body?.document_number),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/procurement/receipts?ok=created");
  });

  app.post("/nexora/procurement/receipts/items", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const receiptId = Number(req.body?.receipt_id || 0);
    const receipt = db.prepare(`SELECT * FROM procurement_receipts WHERE id=? AND company_id=?`).get(receiptId, companyId);
    if (!receipt) return res.status(404).send("Recepția nu există.");
    const orderItem = getOrderItem(db, companyId, Number(req.body?.order_item_id || 0));
    const product = getProduct(db, companyId, Number(orderItem?.product_id || 0));
    db.prepare(`
      INSERT INTO procurement_receipt_items (
        company_id, receipt_id, order_item_id, product_id, item_code, item_name, unit,
        quantity, unit_cost, lot_number, serial_number, expiry_date, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      receiptId,
      orderItem?.id || null,
      orderItem?.product_id || null,
      safeText(req.body?.item_code) || safeText(orderItem?.item_code) || safeText(product?.code),
      safeText(req.body?.item_name) || safeText(orderItem?.item_name) || "Articol recepționat",
      safeText(req.body?.unit) || safeText(orderItem?.unit) || "buc",
      parseNumber(req.body?.quantity, parseNumber(orderItem?.remaining_qty, 1)),
      parseNumber(req.body?.unit_cost, parseNumber(orderItem?.unit_cost, 0)),
      safeText(req.body?.lot_number),
      safeText(req.body?.serial_number),
      parseDate(req.body?.expiry_date),
      safeText(req.body?.notes)
    );
    res.redirect("/nexora/procurement/receipts?ok=item_added");
  });

  app.post("/nexora/procurement/receipts/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const receiptId = Number(req.params.id || 0);
    const receipt = db.prepare(`SELECT * FROM procurement_receipts WHERE id=? AND company_id=?`).get(receiptId, companyId);
    if (!receipt) return res.status(404).send("Recepția nu există.");
    const nextStatus = safeText(req.body?.status).toUpperCase() || "DRAFT";
    if (nextStatus === "RECEPTIONATA" && String(receipt.status || "").toUpperCase() !== "RECEPTIONATA") {
      finalizeProcurementReceipt(db, req, companyId, receipt);
    } else {
      db.prepare(`UPDATE procurement_receipts SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(nextStatus, receiptId, companyId);
    }
    res.redirect("/nexora/procurement/receipts?ok=status");
  });

  app.get("/nexora/procurement/approvals", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT a.*, o.order_number
      FROM procurement_approvals a
      LEFT JOIN procurement_orders o ON o.id = a.order_id AND o.company_id = a.company_id
      WHERE a.company_id=?
      ORDER BY a.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='APROBATA' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS rejected
      FROM procurement_approvals
      WHERE company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraProcurementApprovalsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      orders: loadOrders(db, companyId, true),
      stats,
      fmtMoney,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/procurement/approvals/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.body?.order_id || 0) || null;
    const order = orderId ? db.prepare(`SELECT * FROM procurement_orders WHERE id=? AND company_id=?`).get(orderId, companyId) : null;
    const approvalNumber = nextNumber(db, companyId, "procurement_approvals", "approval_number", "APR");
    db.prepare(`
      INSERT INTO procurement_approvals (
        company_id, approval_number, order_id, subject, amount, status,
        requested_by_email, approver_email, due_date, decision_notes, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      approvalNumber,
      order?.id || null,
      safeText(req.body?.subject) || `Aprobare ${order?.order_number || approvalNumber}`,
      parseNumber(req.body?.amount, parseNumber(order?.total, 0)),
      "PENDING",
      currentUserEmail(req),
      safeText(req.body?.approver_email),
      parseDate(req.body?.due_date),
      safeText(req.body?.decision_notes)
    );
    if (order) {
      db.prepare(`UPDATE procurement_orders SET approval_status='NECESITA_APROBARE', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(order.id, companyId);
    }
    res.redirect("/nexora/procurement/approvals?ok=created");
  });

  app.post("/nexora/procurement/approvals/:id/decision", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const approvalId = Number(req.params.id || 0);
    const approval = db.prepare(`SELECT * FROM procurement_approvals WHERE id=? AND company_id=?`).get(approvalId, companyId);
    if (!approval) return res.status(404).send("Aprobarea nu există.");
    const status = safeText(req.body?.status).toUpperCase() || "PENDING";
    db.prepare(`
      UPDATE procurement_approvals
      SET status=?, approver_email=COALESCE(NULLIF(approver_email,''), ?), decided_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, currentUserEmail(req), approvalId, companyId);
    if (approval.order_id) {
      db.prepare(`
        UPDATE procurement_orders
        SET approval_status=?, approved_by_email=?, approved_at=CASE WHEN ?='APROBATA' THEN datetime('now') ELSE approved_at END, updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(status, currentUserEmail(req), status, approval.order_id, companyId);
    }
    res.redirect("/nexora/procurement/approvals?ok=decision");
  });

  app.get("/nexora/procurement/costs", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT c.*, s.name AS supplier_name, o.order_number, r.receipt_number, b.bill_number
      FROM procurement_costs c
      LEFT JOIN procurement_suppliers s ON s.id = c.supplier_id AND s.company_id = c.company_id
      LEFT JOIN procurement_orders o ON o.id = c.order_id AND o.company_id = c.company_id
      LEFT JOIN procurement_receipts r ON r.id = c.receipt_id AND r.company_id = c.company_id
      LEFT JOIN procurement_bills b ON b.id = c.bill_id AND b.company_id = c.company_id
      WHERE c.company_id=?
      ORDER BY c.cost_date DESC, c.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(amount),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PLANIFICAT' THEN 1 ELSE 0 END) AS planned_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='FINALIZAT' THEN 1 ELSE 0 END) AS final_count
      FROM procurement_costs
      WHERE company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraProcurementCostsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      suppliers: loadActiveSuppliers(db, companyId),
      orders: loadOrders(db, companyId),
      receipts: loadReceipts(db, companyId),
      bills: loadBills(db, companyId),
      stats,
      fmtMoney,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/procurement/costs/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    db.prepare(`
      INSERT INTO procurement_costs (
        company_id, supplier_id, order_id, receipt_id, bill_id, cost_type, cost_date,
        description, amount, currency, allocation_method, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      Number(req.body?.supplier_id || 0) || null,
      Number(req.body?.order_id || 0) || null,
      Number(req.body?.receipt_id || 0) || null,
      Number(req.body?.bill_id || 0) || null,
      safeText(req.body?.cost_type) || "TRANSPORT",
      parseDate(req.body?.cost_date) || todayIso(),
      safeText(req.body?.description) || "Cost achiziție",
      parseNumber(req.body?.amount, 0),
      "RON",
      safeText(req.body?.allocation_method) || "MANUAL",
      safeText(req.body?.status).toUpperCase() || "PLANIFICAT",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/procurement/costs?ok=created");
  });

  app.get("/nexora/procurement/bills", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadBills(db, companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(total),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN total ELSE 0 END),0) AS unpaid_amount
      FROM procurement_bills
      WHERE company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraProcurementBillsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      suppliers: loadActiveSuppliers(db, companyId),
      orders: loadOrders(db, companyId),
      receipts: loadReceipts(db, companyId),
      stats,
      fmtMoney,
      ok: safeText(req.query?.ok)
    }));
  });

  app.post("/nexora/procurement/bills/create", requireAuth, upload.single("attachment"), (req, res) => {
    const companyId = companyIdFrom(req);
    const supplierId = Number(req.body?.supplier_id || 0);
    const supplier = db.prepare(`SELECT * FROM procurement_suppliers WHERE id=? AND company_id=?`).get(supplierId, companyId);
    if (!supplier) return res.status(404).send("Furnizorul nu există.");
    const attachmentPath = saveUploadedAttachment({ fs, path, __dirname, file: req.file });
    const billNumber = nextNumber(db, companyId, "procurement_bills", "bill_number", "BIL");
    const bill = {
      bill_number: billNumber,
      doc_number: safeText(req.body?.doc_number),
      issue_date: parseDate(req.body?.issue_date) || todayIso(),
      due_date: parseDate(req.body?.due_date),
      payment_status: safeText(req.body?.payment_status).toUpperCase() || "NEPLATITA",
      currency: "RON",
      subtotal: parseNumber(req.body?.subtotal, 0),
      vat_amount: parseNumber(req.body?.vat_amount, 0),
      total: parseNumber(req.body?.total, parseNumber(req.body?.subtotal, 0) + parseNumber(req.body?.vat_amount, 0))
    };
    const expenseId = createAccountingExpenseForBill(db, req, companyId, bill, supplier, attachmentPath);
    db.prepare(`
      INSERT INTO procurement_bills (
        company_id, bill_number, supplier_id, order_id, receipt_id, expense_id,
        doc_number, issue_date, due_date, status, payment_status, currency, subtotal,
        vat_amount, total, attachment_path, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      billNumber,
      supplierId,
      Number(req.body?.order_id || 0) || null,
      Number(req.body?.receipt_id || 0) || null,
      expenseId,
      bill.doc_number,
      bill.issue_date,
      bill.due_date,
      "DRAFT",
      bill.payment_status,
      bill.currency,
      bill.subtotal,
      bill.vat_amount,
      bill.total,
      attachmentPath,
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    res.redirect("/nexora/procurement/bills?ok=created");
  });

  app.post("/nexora/procurement/bills/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const billId = Number(req.params.id || 0);
    const bill = db.prepare(`SELECT * FROM procurement_bills WHERE id=? AND company_id=?`).get(billId, companyId);
    if (!bill) return res.status(404).send("Factura furnizor nu există.");
    db.prepare(`UPDATE procurement_bills SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(
      safeText(req.body?.status).toUpperCase() || "DRAFT",
      billId,
      companyId
    );
    res.redirect("/nexora/procurement/bills?ok=status");
  });

  app.post("/nexora/procurement/bills/:id/payment", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const billId = Number(req.params.id || 0);
    const bill = db.prepare(`SELECT * FROM procurement_bills WHERE id=? AND company_id=?`).get(billId, companyId);
    if (!bill) return res.status(404).send("Factura furnizor nu există.");
    const paymentStatus = safeText(req.body?.payment_status).toUpperCase() || "NEPLATITA";
    db.prepare(`UPDATE procurement_bills SET payment_status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(paymentStatus, billId, companyId);
    if (bill.expense_id) {
      db.prepare(`UPDATE accounting_expenses SET payment_status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(paymentStatus, bill.expense_id, companyId);
    }
    res.redirect("/nexora/procurement/bills?ok=payment");
  });
}
