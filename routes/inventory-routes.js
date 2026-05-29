import {
  renderNexoraInventoryAssetDetailPage,
  renderNexoraInventoryAssetsPage,
  renderNexoraInventoryBarcodesPage,
  renderNexoraInventoryCountDetailPage,
  renderNexoraInventoryCountsPage,
  renderNexoraInventoryLotsPage,
  renderNexoraInventoryPickingPage,
  renderNexoraInventoryProjectDetailPage,
  renderNexoraInventoryProjectEditPage,
  renderNexoraInventoryProjectsPage,
  renderNexoraInventoryReceiptsPage,
  renderNexoraInventoryReportsPage,
  renderNexoraInventoryStockPage,
  renderNexoraInventoryTransfersPage,
  renderNexoraInventoryWarehousesPage
} from "../src/ui/nexora-inventory-pages.js";

function parseDate(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function safeText(value) {
  return String(value || "").trim();
}

function slugCodeFromName(value) {
  const cleaned = safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return cleaned || "ITEM";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function inventoryUploadDir(path, __dirname) {
  return path.join(__dirname, "public", "uploads", "inventory", "counts");
}

function saveUploadedFile({ fs, path, __dirname, file }) {
  if (!file) return "";
  const targetDir = inventoryUploadDir(path, __dirname);
  fs.mkdirSync(targetDir, { recursive: true });
  const safeBase = String(file.originalname || "inventar.csv").replace(/[^A-Za-z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeBase}`;
  const finalPath = path.join(targetDir, finalName);
  fs.renameSync(file.path, finalPath);
  return {
    relativePath: `uploads/inventory/counts/${finalName}`,
    fileName: safeBase,
    fullPath: finalPath
  };
}

function parseCountFile(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length) return [];
  const delimiter = rows[0].includes(";") ? ";" : ",";
  const header = rows[0].split(delimiter).map((value) => value.trim().toLowerCase());
  const codeIndex = header.findIndex((value) => ["asset_code", "cod", "code", "cod_articol", "cod_mijloc"].includes(value));
  const qtyIndex = header.findIndex((value) => ["quantity_counted", "counted_qty", "cantitate", "qty", "stoc_faptic"].includes(value));
  const notesIndex = header.findIndex((value) => ["notes", "observatii", "observații", "obs"].includes(value));
  const nameIndex = header.findIndex((value) => ["asset_name", "denumire", "nume", "descriere"].includes(value));
  if (codeIndex === -1 || qtyIndex === -1) return [];

  return rows.slice(1).map((line) => {
    const columns = line.split(delimiter).map((value) => value.trim());
    return {
      asset_code: safeText(columns[codeIndex]),
      quantity_counted: parseNumber(columns[qtyIndex], 0),
      notes: notesIndex >= 0 ? safeText(columns[notesIndex]) : "",
      asset_name: nameIndex >= 0 ? safeText(columns[nameIndex]) : ""
    };
  }).filter((row) => row.asset_code);
}

function inventoryStatusBadge(escapeHtml, value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "IN_STOC") return `<span class="crm-badge crm-badge-green">în stoc</span>`;
  if (normalized === "ALOCAT") return `<span class="crm-badge crm-badge-blue">alocat</span>`;
  if (normalized === "IN_SERVICE") return `<span class="crm-badge crm-badge-amber">în service</span>`;
  if (normalized === "CASAT") return `<span class="crm-badge crm-badge-red">casat</span>`;
  if (normalized === "ACTIV") return `<span class="crm-badge crm-badge-green">activ</span>`;
  if (normalized === "INCHIS") return `<span class="crm-badge crm-badge-neutral">închis</span>`;
  if (normalized === "DRAFT") return `<span class="crm-badge crm-badge-neutral">draft</span>`;
  if (normalized === "FINALIZAT") return `<span class="crm-badge crm-badge-blue">finalizat</span>`;
  if (normalized === "APPLIED") return `<span class="crm-badge crm-badge-green">corecții aplicate</span>`;
  return `<span class="crm-badge crm-badge-neutral">${escapeHtml(normalized || "—")}</span>`;
}

function assetTypeBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "MIJLOC_FIX") return `<span class="crm-badge crm-badge-blue">mijloc fix</span>`;
  return `<span class="crm-badge crm-badge-amber">obiect mobil</span>`;
}

function buildAssetFilterState(query = {}) {
  return {
    type: safeText(query.type).toUpperCase(),
    status: safeText(query.status).toUpperCase(),
    search: safeText(query.search)
  };
}

function buildAssetWhere(filters, companyId) {
  const where = ["company_id=?"];
  const params = [companyId];
  if (filters.type) {
    where.push("UPPER(COALESCE(asset_type,''))=?");
    params.push(filters.type);
  }
  if (filters.status) {
    where.push("UPPER(COALESCE(status,''))=?");
    params.push(filters.status);
  }
  if (filters.search) {
    const like = `%${filters.search.toLowerCase()}%`;
    where.push("(LOWER(COALESCE(asset_code,'')) LIKE ? OR LOWER(COALESCE(asset_name,'')) LIKE ? OR LOWER(COALESCE(location,'')) LIKE ? OR LOWER(COALESCE(serial_number,'')) LIKE ?)");
    params.push(like, like, like, like);
  }
  return { whereSql: where.join(" AND "), params };
}

function countVarianceBadge(variance) {
  const value = Number(variance || 0);
  if (value > 0) return `<span class="crm-badge crm-badge-blue">plus ${value}</span>`;
  if (value < 0) return `<span class="crm-badge crm-badge-red">minus ${Math.abs(value)}</span>`;
  return `<span class="crm-badge crm-badge-green">ok</span>`;
}

function inventoryShell(crmShellStart, crmShellEnd, active, title, subtitle, req, body) {
  return `
    ${crmShellStart(active, title, subtitle, req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
    ${body}
    ${crmShellEnd()}
  `;
}

function createAssetRecord(db, req, companyId, payload = {}) {
  const name = safeText(payload.asset_name || payload.name);
  const generatedCode = `INV-${Date.now()}-${slugCodeFromName(name).slice(0, 12)}`;
  db.prepare(`
    INSERT INTO inventory_assets (
      company_id, asset_code, asset_name, category, asset_type, unit, quantity_scriptic,
      minimum_quantity, location, serial_number, purchase_date, purchase_value, status,
      supplier_name, invoice_number, notes, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    safeText(payload.asset_code) || generatedCode,
    name,
    safeText(payload.category) || "MOBIL",
    safeText(payload.asset_type) || "OBIECT_INVENTAR",
    safeText(payload.unit) || "buc",
    parseNumber(payload.quantity_scriptic, 1),
    parseNumber(payload.minimum_quantity, 0),
    safeText(payload.location),
    safeText(payload.serial_number),
    parseDate(payload.purchase_date),
    parseNumber(payload.purchase_value, 0),
    safeText(payload.status) || "IN_STOC",
    safeText(payload.supplier_name),
    safeText(payload.invoice_number),
    safeText(payload.notes),
    req.session.user.email
  );
}

function updateAssetRecord(db, req, companyId, assetId, payload = {}) {
  db.prepare(`
    UPDATE inventory_assets
    SET
      asset_code=?,
      asset_name=?,
      category=?,
      asset_type=?,
      unit=?,
      quantity_scriptic=?,
      minimum_quantity=?,
      location=?,
      serial_number=?,
      purchase_date=?,
      purchase_value=?,
      status=?,
      supplier_name=?,
      invoice_number=?,
      notes=?,
      updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    safeText(payload.asset_code),
    safeText(payload.asset_name),
    safeText(payload.category) || "MOBIL",
    safeText(payload.asset_type) || "MIJLOC_FIX",
    safeText(payload.unit) || "buc",
    parseNumber(payload.quantity_scriptic, 1),
    parseNumber(payload.minimum_quantity, 0),
    safeText(payload.location),
    safeText(payload.serial_number),
    parseDate(payload.purchase_date),
    parseNumber(payload.purchase_value, 0),
    safeText(payload.status) || "IN_STOC",
    safeText(payload.supplier_name),
    safeText(payload.invoice_number),
    safeText(payload.notes),
    assetId,
    companyId
  );
}

function createProjectRecord(db, req, companyId, payload = {}) {
  db.prepare(`
    INSERT INTO inventory_projects (
      company_id, project_code, project_name, client_name, location, start_date, end_date,
      status, notes, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    safeText(payload.project_code),
    safeText(payload.project_name),
    safeText(payload.client_name),
    safeText(payload.location),
    parseDate(payload.start_date),
    parseDate(payload.end_date),
    safeText(payload.status) || "ACTIV",
    safeText(payload.notes),
    req.session.user.email
  );
}

function updateProjectRecord(db, companyId, projectId, payload = {}) {
  db.prepare(`
    UPDATE inventory_projects
    SET
      project_code=?,
      project_name=?,
      client_name=?,
      location=?,
      start_date=?,
      end_date=?,
      status=?,
      notes=?,
      updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    safeText(payload.project_code),
    safeText(payload.project_name),
    safeText(payload.client_name),
    safeText(payload.location),
    parseDate(payload.start_date),
    parseDate(payload.end_date),
    safeText(payload.status) || "ACTIV",
    safeText(payload.notes),
    projectId,
    companyId
  );
}

function nextInventoryNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    inventory_transfers: "transfer_number",
    inventory_receipts: "receipt_number",
    inventory_pickings: "picking_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported inventory sequence");
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const latest = db.prepare(`
    SELECT ${columnName} AS number
    FROM ${tableName}
    WHERE company_id=? AND ${columnName} LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${stem}%`);
  const last = Number(String(latest?.number || "").split("-").pop() || 0);
  return `${stem}${String(last + 1).padStart(4, "0")}`;
}

function generateBarcodeValue(companyId) {
  return `NXR-${companyId}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function loadWarehouses(db, companyId) {
  return db.prepare(`
    SELECT
      w.*,
      COUNT(s.id) AS stock_lines,
      COALESCE(SUM(s.quantity), 0) AS stock_qty
    FROM inventory_warehouses w
    LEFT JOIN inventory_stock_items s ON s.warehouse_id = w.id AND s.company_id = w.company_id
    WHERE w.company_id=?
    GROUP BY w.id
    ORDER BY w.status='ACTIV' DESC, w.name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadProducts(db, companyId) {
  return db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, lot, kind, active
    FROM products
    WHERE company_id=? AND COALESCE(active,1)=1
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadAssets(db, companyId) {
  return db.prepare(`
    SELECT id, asset_code, asset_name
    FROM inventory_assets
    WHERE company_id=?
    ORDER BY asset_name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadLots(db, companyId) {
  return db.prepare(`
    SELECT l.*, w.name AS warehouse_name
    FROM inventory_lots l
    LEFT JOIN inventory_warehouses w ON w.id = l.warehouse_id AND w.company_id = l.company_id
    WHERE l.company_id=?
    ORDER BY l.updated_at DESC, l.id DESC
    LIMIT 500
  `).all(companyId);
}

function loadStockItems(db, companyId, options = {}) {
  const onlyActive = options.onlyActive === false ? "" : "AND UPPER(COALESCE(s.status,'')) <> 'INACTIV'";
  return db.prepare(`
    SELECT
      s.*,
      w.name AS warehouse_name,
      w.warehouse_code,
      p.name AS product_name,
      p.code AS product_code
    FROM inventory_stock_items s
    LEFT JOIN inventory_warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
    LEFT JOIN products p ON p.id = s.product_id AND p.company_id = s.company_id
    WHERE s.company_id=? ${onlyActive}
    ORDER BY w.name COLLATE NOCASE ASC, s.item_name COLLATE NOCASE ASC, s.id DESC
    LIMIT 800
  `).all(companyId);
}

function getProduct(db, companyId, productId) {
  if (!Number(productId)) return null;
  return db.prepare(`
    SELECT id, code, name, unit, price, lot, kind
    FROM products
    WHERE id=? AND company_id=?
  `).get(Number(productId), companyId) || null;
}

function getStockItem(db, companyId, stockItemId) {
  if (!Number(stockItemId)) return null;
  return db.prepare(`SELECT * FROM inventory_stock_items WHERE id=? AND company_id=?`).get(Number(stockItemId), companyId) || null;
}

function createStockItemRecord(db, req, companyId, payload = {}) {
  const product = getProduct(db, companyId, Number(payload.product_id || 0));
  const name = safeText(payload.item_name) || safeText(product?.name);
  const code = safeText(payload.item_code) || safeText(product?.code) || `SKU-${Date.now()}`;
  const unit = safeText(payload.unit) || safeText(product?.unit) || "buc";
  return db.prepare(`
    INSERT INTO inventory_stock_items (
      company_id, warehouse_id, product_id, asset_id, item_code, item_name, item_type, unit,
      quantity, reserved_quantity, minimum_quantity, bin_location, status, notes, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    Number(payload.warehouse_id || 0) || null,
    product?.id || null,
    Number(payload.asset_id || 0) || null,
    code,
    name || code,
    safeText(payload.item_type) || safeText(product?.kind) || "PRODUS",
    unit,
    parseNumber(payload.quantity, 0),
    parseNumber(payload.reserved_quantity, 0),
    parseNumber(payload.minimum_quantity, 0),
    safeText(payload.bin_location),
    safeText(payload.status) || "ACTIV",
    safeText(payload.notes),
    req.session.user.email
  );
}

function findMatchingStockItem(db, companyId, warehouseId, productId, itemCode) {
  if (Number(productId)) {
    const byProduct = Number(warehouseId)
      ? db.prepare(`SELECT * FROM inventory_stock_items WHERE company_id=? AND warehouse_id=? AND product_id=? ORDER BY id DESC LIMIT 1`).get(companyId, Number(warehouseId), Number(productId))
      : db.prepare(`SELECT * FROM inventory_stock_items WHERE company_id=? AND warehouse_id IS NULL AND product_id=? ORDER BY id DESC LIMIT 1`).get(companyId, Number(productId));
    if (byProduct) return byProduct;
  }
  const code = safeText(itemCode);
  if (!code) return null;
  return Number(warehouseId)
    ? db.prepare(`SELECT * FROM inventory_stock_items WHERE company_id=? AND warehouse_id=? AND item_code=? ORDER BY id DESC LIMIT 1`).get(companyId, Number(warehouseId), code)
    : db.prepare(`SELECT * FROM inventory_stock_items WHERE company_id=? AND warehouse_id IS NULL AND item_code=? ORDER BY id DESC LIMIT 1`).get(companyId, code);
}

function ensureStockItemForWarehouse(db, req, companyId, warehouseId, payload = {}) {
  const selected = getStockItem(db, companyId, Number(payload.stock_item_id || 0));
  if (selected && (!Number(warehouseId) || Number(selected.warehouse_id || 0) === Number(warehouseId))) return selected;
  const product = getProduct(db, companyId, Number(payload.product_id || selected?.product_id || 0));
  const itemCode = safeText(payload.item_code) || safeText(selected?.item_code) || safeText(product?.code);
  const existing = findMatchingStockItem(db, companyId, warehouseId, product?.id || payload.product_id, itemCode);
  if (existing) return existing;
  const insert = createStockItemRecord(db, req, companyId, {
    warehouse_id: warehouseId,
    product_id: product?.id || Number(payload.product_id || selected?.product_id || 0) || null,
    item_code: itemCode,
    item_name: safeText(payload.item_name) || safeText(selected?.item_name) || safeText(product?.name) || itemCode,
    item_type: safeText(selected?.item_type) || safeText(product?.kind) || "PRODUS",
    unit: safeText(payload.unit) || safeText(selected?.unit) || safeText(product?.unit) || "buc",
    quantity: 0,
    reserved_quantity: 0,
    minimum_quantity: parseNumber(selected?.minimum_quantity, 0),
    bin_location: safeText(selected?.bin_location),
    notes: safeText(payload.notes)
  });
  return getStockItem(db, companyId, Number(insert.lastInsertRowid || 0));
}

function incrementStock(db, companyId, stockItemId, quantityDelta, reservedDelta = 0) {
  db.prepare(`
    UPDATE inventory_stock_items
    SET
      quantity = quantity + ?,
      reserved_quantity = MAX(0, reserved_quantity + ?),
      status = CASE WHEN quantity + ? > 0 THEN 'ACTIV' ELSE status END,
      updated_at = datetime('now')
    WHERE id=? AND company_id=?
  `).run(quantityDelta, reservedDelta, quantityDelta, stockItemId, companyId);
}

function finalizeTransfer(db, req, companyId, transfer) {
  const lines = db.prepare(`
    SELECT *
    FROM inventory_transfer_items
    WHERE transfer_id=? AND company_id=?
    ORDER BY id ASC
  `).all(transfer.id, companyId);
  for (const line of lines) {
    const source = getStockItem(db, companyId, line.stock_item_id);
    if (!source) continue;
    const qty = parseNumber(line.quantity, 0);
    incrementStock(db, companyId, source.id, -qty, 0);
    const destination = ensureStockItemForWarehouse(db, req, companyId, transfer.to_warehouse_id, {
      stock_item_id: source.id,
      product_id: line.product_id || source.product_id,
      item_code: line.item_code || source.item_code,
      item_name: line.item_name || source.item_name,
      unit: line.unit || source.unit
    });
    incrementStock(db, companyId, destination.id, qty, 0);
  }
}

function finalizeReceipt(db, req, companyId, receipt) {
  const lines = db.prepare(`
    SELECT *
    FROM inventory_receipt_items
    WHERE receipt_id=? AND company_id=?
    ORDER BY id ASC
  `).all(receipt.id, companyId);
  for (const line of lines) {
    const stockItem = ensureStockItemForWarehouse(db, req, companyId, receipt.warehouse_id, line);
    const qty = parseNumber(line.quantity, 0);
    incrementStock(db, companyId, stockItem.id, qty, 0);
    db.prepare(`UPDATE inventory_receipt_items SET stock_item_id=? WHERE id=? AND company_id=?`).run(stockItem.id, line.id, companyId);
    if (safeText(line.lot_number) || safeText(line.serial_number)) {
      db.prepare(`
        INSERT INTO inventory_lots (
          company_id, warehouse_id, product_id, stock_item_id, lot_number, serial_number, item_name,
          quantity_initial, quantity_available, unit, received_at, expiry_date, supplier_name, status,
          notes, created_by_email, updated_at
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
        parseDate(receipt.receipt_date) || new Date().toISOString().slice(0, 10),
        parseDate(line.expiry_date),
        safeText(receipt.supplier_name),
        "ACTIV",
        safeText(line.notes),
        req.session.user.email
      );
    }
  }
}

function deliverPicking(db, companyId, picking) {
  const lines = db.prepare(`
    SELECT *
    FROM inventory_picking_items
    WHERE picking_id=? AND company_id=?
    ORDER BY id ASC
  `).all(picking.id, companyId);
  for (const line of lines) {
    if (!line.stock_item_id) continue;
    const requested = parseNumber(line.quantity_requested, 0);
    const shipped = parseNumber(line.quantity_packed, 0) || parseNumber(line.quantity_picked, 0) || requested;
    incrementStock(db, companyId, line.stock_item_id, -shipped, -requested);
    if (!parseNumber(line.quantity_packed, 0)) {
      db.prepare(`UPDATE inventory_picking_items SET quantity_packed=? WHERE id=? AND company_id=?`).run(shipped, line.id, companyId);
    }
  }
}

export function registerInventoryRoutes(app, { db, requireAuth, escapeHtml, fmtMoney, crmShellStart, crmShellEnd, fs, path, __dirname, upload }) {
  app.get("/nexora/inventory", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = loadStockItems(db, companyId);
    const warehouses = loadWarehouses(db, companyId);
    const products = loadProducts(db, companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_items,
        COALESCE(SUM(quantity), 0) AS total_qty,
        COALESCE(SUM(reserved_quantity), 0) AS reserved_qty,
        SUM(CASE WHEN quantity <= minimum_quantity THEN 1 ELSE 0 END) AS low_stock
      FROM inventory_stock_items
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraInventoryStockPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      warehouses,
      products,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/stock/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createStockItemRecord(db, req, companyId, req.body);
    res.redirect("/nexora/inventory?ok=created");
  });

  app.get("/nexora/inventory/assets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildAssetFilterState(req.query);
    const { whereSql, params } = buildAssetWhere(filters, companyId);
    const rows = db.prepare(`
      SELECT *
      FROM inventory_assets
      WHERE ${whereSql}
      ORDER BY asset_name COLLATE NOCASE ASC, id DESC
      LIMIT 500
    `).all(...params);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_assets,
        SUM(CASE WHEN UPPER(COALESCE(asset_type,''))='MIJLOC_FIX' THEN 1 ELSE 0 END) AS fixed_assets,
        SUM(CASE WHEN UPPER(COALESCE(asset_type,''))='OBIECT_INVENTAR' THEN 1 ELSE 0 END) AS mobile_assets,
        SUM(CASE WHEN quantity_scriptic <= minimum_quantity THEN 1 ELSE 0 END) AS low_stock_assets,
        IFNULL(SUM(quantity_scriptic * purchase_value), 0) AS total_value
      FROM inventory_assets
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraInventoryAssetsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      filters,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.get("/nexora/inventory/assets/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const asset = db.prepare(`SELECT * FROM inventory_assets WHERE id=? AND company_id=?`).get(assetId, companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    const usage = db.prepare(`
      SELECT COUNT(*) AS project_links FROM inventory_project_items WHERE asset_id=? AND company_id=?
    `).get(assetId, companyId) || {};
    const adjustments = db.prepare(`
      SELECT COUNT(*) AS adjustment_links FROM inventory_adjustments WHERE asset_id=? AND company_id=?
    `).get(assetId, companyId) || {};

    return res.type("html").send(renderNexoraInventoryAssetDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      asset,
      usage,
      adjustments,
      ok: String(req.query?.ok || "")
    }));
  });

  app.get("/nexora/inventory/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        p.*,
        COUNT(i.id) AS allocated_lines,
        COALESCE(SUM(i.quantity_allocated - i.quantity_returned), 0) AS active_quantity
      FROM inventory_projects p
      LEFT JOIN inventory_project_items i ON i.project_id = p.id AND i.company_id = p.company_id
      WHERE p.company_id=?
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT p.id) AS total_projects,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.status,''))='ACTIV' THEN p.id END) AS active_projects,
        COUNT(i.id) AS allocated_lines,
        COALESCE(SUM(i.quantity_allocated - i.quantity_returned), 0) AS active_quantity
      FROM inventory_projects p
      LEFT JOIN inventory_project_items i ON i.project_id = p.id AND i.company_id = p.company_id
      WHERE p.company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraInventoryProjectsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.get("/nexora/inventory/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT * FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const allocations = db.prepare(`
      SELECT *
      FROM inventory_project_items
      WHERE project_id=? AND company_id=?
      ORDER BY assigned_at DESC, id DESC
    `).all(projectId, companyId);
    const assets = db.prepare(`
      SELECT id, asset_code, asset_name, quantity_scriptic, unit, status
      FROM inventory_assets
      WHERE company_id=? AND UPPER(COALESCE(status,'')) <> 'CASAT'
      ORDER BY asset_name COLLATE NOCASE ASC
      LIMIT 300
    `).all(companyId);

    return res.type("html").send(renderNexoraInventoryProjectDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      project,
      allocations,
      assets,
      ok: String(req.query?.ok || "")
    }));
  });

  app.get("/nexora/inventory/projects/:id/edit", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT * FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const allocationStats = db.prepare(`
      SELECT COUNT(*) AS total_lines, COALESCE(SUM(quantity_allocated - quantity_returned),0) AS active_qty
      FROM inventory_project_items
      WHERE project_id=? AND company_id=?
    `).get(projectId, companyId) || {};

    return res.type("html").send(renderNexoraInventoryProjectEditPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      project,
      allocationStats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.get("/nexora/inventory/warehouses", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = loadWarehouses(db, companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active,
        (SELECT COUNT(*) FROM inventory_stock_items WHERE company_id=?) AS stock_lines,
        (SELECT COALESCE(SUM(quantity),0) FROM inventory_stock_items WHERE company_id=?) AS stock_qty
      FROM inventory_warehouses
      WHERE company_id=?
    `).get(companyId, companyId, companyId) || {};
    return res.type("html").send(renderNexoraInventoryWarehousesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/warehouses/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const code = safeText(req.body.warehouse_code) || `DEP-${Date.now()}`;
    db.prepare(`
      INSERT INTO inventory_warehouses (
        company_id, warehouse_code, name, warehouse_type, address, manager_name,
        status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(company_id, warehouse_code) DO UPDATE SET
        name=excluded.name,
        warehouse_type=excluded.warehouse_type,
        address=excluded.address,
        manager_name=excluded.manager_name,
        status=excluded.status,
        notes=excluded.notes,
        updated_at=datetime('now')
    `).run(
      companyId,
      code,
      safeText(req.body.name) || code,
      safeText(req.body.warehouse_type) || "DEPOZIT",
      safeText(req.body.address),
      safeText(req.body.manager_name),
      safeText(req.body.status) || "ACTIV",
      safeText(req.body.notes),
      req.session.user.email
    );
    res.redirect("/nexora/inventory/warehouses?ok=created");
  });

  app.get("/nexora/inventory/lots", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    return res.type("html").send(renderNexoraInventoryLotsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadLots(db, companyId),
      products: loadProducts(db, companyId),
      warehouses: loadWarehouses(db, companyId),
      stockItems: loadStockItems(db, companyId),
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/lots/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const stockItem = ensureStockItemForWarehouse(db, req, companyId, Number(req.body.warehouse_id || 0) || null, req.body);
    db.prepare(`
      INSERT INTO inventory_lots (
        company_id, warehouse_id, product_id, stock_item_id, lot_number, serial_number,
        item_name, quantity_initial, quantity_available, unit, received_at, expiry_date,
        supplier_name, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      Number(req.body.warehouse_id || 0) || stockItem?.warehouse_id || null,
      Number(req.body.product_id || 0) || stockItem?.product_id || null,
      stockItem?.id || null,
      safeText(req.body.lot_number),
      safeText(req.body.serial_number),
      safeText(req.body.item_name) || stockItem?.item_name || safeText(req.body.lot_number),
      parseNumber(req.body.quantity_initial, 0),
      parseNumber(req.body.quantity_available, 0),
      safeText(req.body.unit) || stockItem?.unit || "buc",
      new Date().toISOString().slice(0, 10),
      parseDate(req.body.expiry_date),
      safeText(req.body.supplier_name),
      safeText(req.body.status) || "ACTIV",
      safeText(req.body.notes),
      req.session.user.email
    );
    res.redirect("/nexora/inventory/lots?ok=created");
  });

  app.get("/nexora/inventory/transfers", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        t.*,
        fw.name AS from_warehouse_name,
        tw.name AS to_warehouse_name,
        COUNT(i.id) AS line_count,
        COALESCE(SUM(i.quantity), 0) AS total_qty
      FROM inventory_transfers t
      LEFT JOIN inventory_warehouses fw ON fw.id = t.from_warehouse_id AND fw.company_id = t.company_id
      LEFT JOIN inventory_warehouses tw ON tw.id = t.to_warehouse_id AND tw.company_id = t.company_id
      LEFT JOIN inventory_transfer_items i ON i.transfer_id = t.id AND i.company_id = t.company_id
      WHERE t.company_id=?
      GROUP BY t.id
      ORDER BY t.transfer_date DESC, t.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT t.id) AS total,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(t.status,'')) NOT IN ('FINALIZAT','ANULAT') THEN t.id END) AS open,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(t.status,''))='FINALIZAT' THEN t.id END) AS done,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(t.status,''))='FINALIZAT' THEN i.quantity ELSE 0 END),0) AS qty
      FROM inventory_transfers t
      LEFT JOIN inventory_transfer_items i ON i.transfer_id = t.id AND i.company_id = t.company_id
      WHERE t.company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraInventoryTransfersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      openTransfers: rows.filter((row) => !["FINALIZAT", "ANULAT"].includes(String(row.status || "").toUpperCase())),
      warehouses: loadWarehouses(db, companyId),
      stockItems: loadStockItems(db, companyId),
      stats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/transfers/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const transferNumber = nextInventoryNumber(db, companyId, "inventory_transfers", "transfer_number", "TRF");
    db.prepare(`
      INSERT INTO inventory_transfers (
        company_id, transfer_number, from_warehouse_id, to_warehouse_id, transfer_date,
        status, requested_by, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      transferNumber,
      Number(req.body.from_warehouse_id || 0) || null,
      Number(req.body.to_warehouse_id || 0) || null,
      parseDate(req.body.transfer_date) || new Date().toISOString().slice(0, 10),
      "DRAFT",
      safeText(req.body.requested_by),
      safeText(req.body.notes),
      req.session.user.email
    );
    res.redirect("/nexora/inventory/transfers?ok=created");
  });

  app.post("/nexora/inventory/transfers/items", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const transferId = Number(req.body.transfer_id || 0);
    const transfer = db.prepare(`SELECT * FROM inventory_transfers WHERE id=? AND company_id=?`).get(transferId, companyId);
    if (!transfer) return res.status(404).send("Transferul nu a fost găsit.");
    const stockItem = getStockItem(db, companyId, Number(req.body.stock_item_id || 0));
    if (!stockItem) return res.status(404).send("Poziția de stoc nu a fost găsită.");
    db.prepare(`
      INSERT INTO inventory_transfer_items (
        company_id, transfer_id, stock_item_id, product_id, item_code, item_name, unit, quantity, notes
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      transfer.id,
      stockItem.id,
      stockItem.product_id || null,
      stockItem.item_code,
      stockItem.item_name,
      stockItem.unit || "buc",
      parseNumber(req.body.quantity, 1),
      safeText(req.body.notes)
    );
    db.prepare(`UPDATE inventory_transfers SET updated_at=datetime('now') WHERE id=? AND company_id=?`).run(transfer.id, companyId);
    res.redirect("/nexora/inventory/transfers?ok=item_added");
  });

  app.post("/nexora/inventory/transfers/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const transferId = Number(req.params.id || 0);
    const transfer = db.prepare(`SELECT * FROM inventory_transfers WHERE id=? AND company_id=?`).get(transferId, companyId);
    if (!transfer) return res.status(404).send("Transferul nu a fost găsit.");
    const nextStatus = safeText(req.body.status).toUpperCase() || "DRAFT";
    if (nextStatus === "FINALIZAT" && String(transfer.status || "").toUpperCase() !== "FINALIZAT") {
      finalizeTransfer(db, req, companyId, transfer);
    }
    db.prepare(`UPDATE inventory_transfers SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(nextStatus, transferId, companyId);
    res.redirect("/nexora/inventory/transfers?ok=status");
  });

  app.get("/nexora/inventory/receipts", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        r.*,
        w.name AS warehouse_name,
        COUNT(i.id) AS line_count,
        COALESCE(SUM(i.quantity), 0) AS total_qty,
        COALESCE(SUM(i.quantity * i.unit_cost), 0) AS total_value
      FROM inventory_receipts r
      LEFT JOIN inventory_warehouses w ON w.id = r.warehouse_id AND w.company_id = r.company_id
      LEFT JOIN inventory_receipt_items i ON i.receipt_id = r.id AND i.company_id = r.company_id
      WHERE r.company_id=?
      GROUP BY r.id
      ORDER BY r.receipt_date DESC, r.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT r.id) AS total,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(r.status,'')) NOT IN ('RECEPTIONAT','ANULAT') THEN r.id END) AS open,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(r.status,''))='RECEPTIONAT' THEN r.id END) AS done,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(r.status,''))='RECEPTIONAT' THEN i.quantity * i.unit_cost ELSE 0 END),0) AS value
      FROM inventory_receipts r
      LEFT JOIN inventory_receipt_items i ON i.receipt_id = r.id AND i.company_id = r.company_id
      WHERE r.company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraInventoryReceiptsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      openReceipts: rows.filter((row) => !["RECEPTIONAT", "ANULAT"].includes(String(row.status || "").toUpperCase())),
      warehouses: loadWarehouses(db, companyId),
      products: loadProducts(db, companyId),
      stockItems: loadStockItems(db, companyId),
      stats,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/receipts/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const receiptNumber = nextInventoryNumber(db, companyId, "inventory_receipts", "receipt_number", "REC");
    db.prepare(`
      INSERT INTO inventory_receipts (
        company_id, receipt_number, warehouse_id, supplier_name, receipt_date,
        document_number, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      receiptNumber,
      Number(req.body.warehouse_id || 0) || null,
      safeText(req.body.supplier_name),
      parseDate(req.body.receipt_date) || new Date().toISOString().slice(0, 10),
      safeText(req.body.document_number),
      "DRAFT",
      safeText(req.body.notes),
      req.session.user.email
    );
    res.redirect("/nexora/inventory/receipts?ok=created");
  });

  app.post("/nexora/inventory/receipts/items", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const receiptId = Number(req.body.receipt_id || 0);
    const receipt = db.prepare(`SELECT * FROM inventory_receipts WHERE id=? AND company_id=?`).get(receiptId, companyId);
    if (!receipt) return res.status(404).send("Recepția nu a fost găsită.");
    const stockItem = getStockItem(db, companyId, Number(req.body.stock_item_id || 0));
    const product = getProduct(db, companyId, Number(req.body.product_id || stockItem?.product_id || 0));
    const itemName = safeText(req.body.item_name) || safeText(stockItem?.item_name) || safeText(product?.name);
    const itemCode = safeText(req.body.item_code) || safeText(stockItem?.item_code) || safeText(product?.code);
    db.prepare(`
      INSERT INTO inventory_receipt_items (
        company_id, receipt_id, product_id, stock_item_id, item_code, item_name, unit,
        quantity, unit_cost, lot_number, serial_number, expiry_date, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      receipt.id,
      product?.id || null,
      stockItem?.id || null,
      itemCode,
      itemName || itemCode || "Articol recepționat",
      safeText(req.body.unit) || stockItem?.unit || product?.unit || "buc",
      parseNumber(req.body.quantity, 1),
      parseNumber(req.body.unit_cost, 0),
      safeText(req.body.lot_number),
      safeText(req.body.serial_number),
      parseDate(req.body.expiry_date),
      safeText(req.body.notes)
    );
    db.prepare(`UPDATE inventory_receipts SET updated_at=datetime('now') WHERE id=? AND company_id=?`).run(receipt.id, companyId);
    res.redirect("/nexora/inventory/receipts?ok=item_added");
  });

  app.post("/nexora/inventory/receipts/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const receiptId = Number(req.params.id || 0);
    const receipt = db.prepare(`SELECT * FROM inventory_receipts WHERE id=? AND company_id=?`).get(receiptId, companyId);
    if (!receipt) return res.status(404).send("Recepția nu a fost găsită.");
    const nextStatus = safeText(req.body.status).toUpperCase() || "DRAFT";
    if (nextStatus === "RECEPTIONAT" && String(receipt.status || "").toUpperCase() !== "RECEPTIONAT") {
      finalizeReceipt(db, req, companyId, receipt);
    }
    db.prepare(`UPDATE inventory_receipts SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(nextStatus, receiptId, companyId);
    res.redirect("/nexora/inventory/receipts?ok=status");
  });

  app.get("/nexora/inventory/picking", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        p.*,
        w.name AS warehouse_name,
        COUNT(i.id) AS line_count,
        COALESCE(SUM(i.quantity_requested), 0) AS requested_qty,
        COALESCE(SUM(i.quantity_packed), 0) AS packed_qty
      FROM inventory_pickings p
      LEFT JOIN inventory_warehouses w ON w.id = p.warehouse_id AND w.company_id = p.company_id
      LEFT JOIN inventory_picking_items i ON i.picking_id = p.id AND i.company_id = p.company_id
      WHERE p.company_id=?
      GROUP BY p.id
      ORDER BY p.scheduled_date DESC, p.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT p.id) AS total,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.status,''))='LIVRAT' THEN p.id END) AS done,
        COALESCE(SUM(i.quantity_requested), 0) AS qty,
        (SELECT COALESCE(SUM(reserved_quantity),0) FROM inventory_stock_items WHERE company_id=?) AS reserved
      FROM inventory_pickings p
      LEFT JOIN inventory_picking_items i ON i.picking_id = p.id AND i.company_id = p.company_id
      WHERE p.company_id=?
    `).get(companyId, companyId) || {};
    return res.type("html").send(renderNexoraInventoryPickingPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      openPickings: rows.filter((row) => !["LIVRAT", "ANULAT"].includes(String(row.status || "").toUpperCase())),
      warehouses: loadWarehouses(db, companyId),
      stockItems: loadStockItems(db, companyId),
      stats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/picking/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const pickingNumber = nextInventoryNumber(db, companyId, "inventory_pickings", "picking_number", "PCK");
    db.prepare(`
      INSERT INTO inventory_pickings (
        company_id, picking_number, warehouse_id, client_name, project_name,
        scheduled_date, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      pickingNumber,
      Number(req.body.warehouse_id || 0) || null,
      safeText(req.body.client_name),
      safeText(req.body.project_name),
      parseDate(req.body.scheduled_date) || new Date().toISOString().slice(0, 10),
      "DRAFT",
      safeText(req.body.notes),
      req.session.user.email
    );
    res.redirect("/nexora/inventory/picking?ok=created");
  });

  app.post("/nexora/inventory/picking/items", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const pickingId = Number(req.body.picking_id || 0);
    const picking = db.prepare(`SELECT * FROM inventory_pickings WHERE id=? AND company_id=?`).get(pickingId, companyId);
    if (!picking) return res.status(404).send("Picking-ul nu a fost găsit.");
    const stockItem = getStockItem(db, companyId, Number(req.body.stock_item_id || 0));
    if (!stockItem) return res.status(404).send("Poziția de stoc nu a fost găsită.");
    const requested = parseNumber(req.body.quantity_requested, 1);
    db.prepare(`
      INSERT INTO inventory_picking_items (
        company_id, picking_id, stock_item_id, product_id, item_code, item_name, unit,
        quantity_requested, quantity_picked, quantity_packed, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      picking.id,
      stockItem.id,
      stockItem.product_id || null,
      stockItem.item_code,
      stockItem.item_name,
      stockItem.unit || "buc",
      requested,
      parseNumber(req.body.quantity_picked, requested),
      parseNumber(req.body.quantity_packed, 0),
      safeText(req.body.notes)
    );
    incrementStock(db, companyId, stockItem.id, 0, requested);
    db.prepare(`UPDATE inventory_pickings SET updated_at=datetime('now') WHERE id=? AND company_id=?`).run(picking.id, companyId);
    res.redirect("/nexora/inventory/picking?ok=item_added");
  });

  app.post("/nexora/inventory/picking/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const pickingId = Number(req.params.id || 0);
    const picking = db.prepare(`SELECT * FROM inventory_pickings WHERE id=? AND company_id=?`).get(pickingId, companyId);
    if (!picking) return res.status(404).send("Picking-ul nu a fost găsit.");
    const nextStatus = safeText(req.body.status).toUpperCase() || "DRAFT";
    if (nextStatus === "AMBALAT") {
      db.prepare(`
        UPDATE inventory_picking_items
        SET quantity_packed = CASE WHEN quantity_packed > 0 THEN quantity_packed ELSE quantity_picked END
        WHERE picking_id=? AND company_id=?
      `).run(pickingId, companyId);
    }
    if (nextStatus === "LIVRAT" && String(picking.status || "").toUpperCase() !== "LIVRAT") {
      deliverPicking(db, companyId, picking);
    }
    db.prepare(`UPDATE inventory_pickings SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(nextStatus, pickingId, companyId);
    res.redirect("/nexora/inventory/picking?ok=status");
  });

  app.get("/nexora/inventory/barcodes", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        b.*,
        p.name AS product_name,
        a.asset_name,
        l.lot_number
      FROM inventory_barcodes b
      LEFT JOIN products p ON p.id = b.product_id AND p.company_id = b.company_id
      LEFT JOIN inventory_assets a ON a.id = b.asset_id AND a.company_id = b.company_id
      LEFT JOIN inventory_lots l ON l.id = b.lot_id AND l.company_id = b.company_id
      WHERE b.company_id=?
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 500
    `).all(companyId);
    return res.type("html").send(renderNexoraInventoryBarcodesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      products: loadProducts(db, companyId),
      assets: loadAssets(db, companyId),
      lots: loadLots(db, companyId),
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/barcodes/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    let value = safeText(req.body.barcode_value) || generateBarcodeValue(companyId);
    for (let i = 0; i < 5; i += 1) {
      const exists = db.prepare(`SELECT id FROM inventory_barcodes WHERE company_id=? AND barcode_value=?`).get(companyId, value);
      if (!exists) break;
      value = generateBarcodeValue(companyId);
    }
    db.prepare(`
      INSERT INTO inventory_barcodes (
        company_id, product_id, asset_id, lot_id, barcode_value, barcode_type,
        label, status, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      Number(req.body.product_id || 0) || null,
      Number(req.body.asset_id || 0) || null,
      Number(req.body.lot_id || 0) || null,
      value,
      safeText(req.body.barcode_type) || "CODE128",
      safeText(req.body.label) || value,
      "ACTIV",
      safeText(req.body.notes),
      req.session.user.email
    );
    res.redirect("/nexora/inventory/barcodes?ok=created");
  });

  app.get("/nexora/inventory/counts", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        c.*,
        COUNT(i.id) AS line_count,
        SUM(CASE WHEN ABS(COALESCE(i.variance,0)) > 0.0001 THEN 1 ELSE 0 END) AS variance_lines
      FROM inventory_counts c
      LEFT JOIN inventory_count_items i ON i.count_id = c.id AND i.company_id = c.company_id
      WHERE c.company_id=?
      GROUP BY c.id
      ORDER BY c.count_date DESC, c.id DESC
      LIMIT 300
    `).all(companyId);
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) AS total,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(c.status,''))='DRAFT' THEN c.id END) AS draft,
        COUNT(DISTINCT CASE WHEN UPPER(COALESCE(c.status,''))='APPLIED' THEN c.id END) AS applied,
        SUM(CASE WHEN ABS(COALESCE(i.variance,0)) > 0.0001 THEN 1 ELSE 0 END) AS variance_lines
      FROM inventory_counts c
      LEFT JOIN inventory_count_items i ON i.count_id = c.id AND i.company_id = c.company_id
      WHERE c.company_id=?
    `).get(companyId) || {};
    return res.type("html").send(renderNexoraInventoryCountsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      stats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/counts/create", requireAuth, upload.single("count_file"), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const scope = safeText(req.body.scope).toUpperCase() === "ACTIVE" ? "ACTIVE" : "STOCURI";
    let fileInfo = null;
    let parsedRows = [];
    if (req.file) {
      fileInfo = saveUploadedFile({ fs, path, __dirname, file: req.file });
      parsedRows = parseCountFile(fs.readFileSync(fileInfo.fullPath, "utf8"));
    }
    const insertCount = db.prepare(`
      INSERT INTO inventory_counts (
        company_id, title, count_date, status, source_file_name, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      safeText(req.body.title) || "Inventar",
      parseDate(req.body.count_date) || new Date().toISOString().slice(0, 10),
      "DRAFT",
      fileInfo?.fileName || `Generat din ${scope === "ACTIVE" ? "registru active" : "stocuri"}`,
      safeText(req.body.notes),
      req.session.user.email
    );
    const countId = Number(insertCount.lastInsertRowid || 0);
    const insertItem = db.prepare(`
      INSERT INTO inventory_count_items (
        company_id, count_id, asset_id, stock_item_id, warehouse_id, asset_code,
        asset_name, quantity_scriptic, quantity_counted, variance, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const seedRows = scope === "ACTIVE"
      ? db.prepare(`
          SELECT id AS asset_id, NULL AS stock_item_id, NULL AS warehouse_id, asset_code, asset_name,
                 quantity_scriptic, location AS notes
          FROM inventory_assets
          WHERE company_id=?
          ORDER BY asset_name COLLATE NOCASE ASC
        `).all(companyId)
      : db.prepare(`
          SELECT s.asset_id, s.id AS stock_item_id, s.warehouse_id, s.item_code AS asset_code,
                 s.item_name AS asset_name, s.quantity AS quantity_scriptic,
                 COALESCE(w.name, 'Fără depozit') AS notes
          FROM inventory_stock_items s
          LEFT JOIN inventory_warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
          WHERE s.company_id=?
          ORDER BY w.name COLLATE NOCASE ASC, s.item_name COLLATE NOCASE ASC
        `).all(companyId);
    const seedMap = new Map(seedRows.map((row) => [String(row.asset_code || "").trim().toLowerCase(), row]));
    const rowsToInsert = parsedRows.length
      ? parsedRows.map((row) => {
          const seed = seedMap.get(String(row.asset_code || "").trim().toLowerCase()) || {};
          const scriptic = parseNumber(seed.quantity_scriptic, 0);
          const counted = parseNumber(row.quantity_counted, 0);
          return {
            ...seed,
            asset_code: safeText(row.asset_code),
            asset_name: safeText(row.asset_name) || safeText(seed.asset_name),
            quantity_scriptic: scriptic,
            quantity_counted: counted,
            variance: counted - scriptic,
            notes: safeText(row.notes) || safeText(seed.notes)
          };
        })
      : seedRows.map((row) => ({
          ...row,
          quantity_counted: parseNumber(row.quantity_scriptic, 0),
          variance: 0
        }));
    for (const row of rowsToInsert) {
      insertItem.run(
        companyId,
        countId,
        row.asset_id || null,
        row.stock_item_id || null,
        row.warehouse_id || null,
        safeText(row.asset_code),
        safeText(row.asset_name) || safeText(row.asset_code),
        parseNumber(row.quantity_scriptic, 0),
        parseNumber(row.quantity_counted, 0),
        parseNumber(row.variance, 0),
        safeText(row.notes)
      );
    }
    res.redirect(`/nexora/inventory/counts/${countId}?ok=created`);
  });

  app.get("/nexora/inventory/counts/export/:id.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const rows = db.prepare(`
      SELECT asset_code, asset_name, quantity_scriptic, quantity_counted, variance, applied, notes
      FROM inventory_count_items
      WHERE count_id=? AND company_id=?
      ORDER BY asset_name COLLATE NOCASE ASC
    `).all(countId, companyId);
    const csv = [
      ["asset_code", "asset_name", "quantity_scriptic", "quantity_counted", "variance", "applied", "notes"].join(","),
      ...rows.map((row) => [
        row.asset_code,
        row.asset_name,
        row.quantity_scriptic,
        row.quantity_counted,
        row.variance,
        row.applied,
        row.notes
      ].map(csvEscape).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nexora-inventory-count-${countId}.csv"`);
    res.send(csv);
  });

  app.get("/nexora/inventory/counts/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const count = db.prepare(`SELECT * FROM inventory_counts WHERE id=? AND company_id=?`).get(countId, companyId);
    if (!count) return res.status(404).send("Sesiunea de inventar nu a fost găsită.");
    const items = db.prepare(`
      SELECT i.*, w.name AS warehouse_name
      FROM inventory_count_items i
      LEFT JOIN inventory_warehouses w ON w.id = i.warehouse_id AND w.company_id = i.company_id
      WHERE i.count_id=? AND i.company_id=?
      ORDER BY ABS(COALESCE(i.variance,0)) DESC, i.asset_name COLLATE NOCASE ASC
      LIMIT 1200
    `).all(countId, companyId);
    const stats = {
      lines: items.length,
      variance: items.filter((row) => Math.abs(Number(row.variance || 0)) > 0.0001).length,
      unapplied: items.filter((row) => Number(row.applied || 0) === 0 && Math.abs(Number(row.variance || 0)) > 0.0001).length,
      ok: items.filter((row) => Math.abs(Number(row.variance || 0)) <= 0.0001).length
    };
    return res.type("html").send(renderNexoraInventoryCountDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      count,
      items,
      stats,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/inventory/counts/:id/apply", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const count = db.prepare(`SELECT * FROM inventory_counts WHERE id=? AND company_id=?`).get(countId, companyId);
    if (!count) return res.status(404).send("Sesiunea de inventar nu a fost găsită.");
    const rows = db.prepare(`
      SELECT *
      FROM inventory_count_items
      WHERE count_id=? AND company_id=? AND applied=0 AND ABS(COALESCE(variance,0)) > 0.0001
      ORDER BY id ASC
    `).all(countId, companyId);
    const insertAdjustment = db.prepare(`
      INSERT INTO inventory_adjustments (
        company_id, asset_id, count_id, asset_code, quantity_before, quantity_after, variance, reason, created_by_email
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `);
    for (const row of rows) {
      const quantityAfter = parseNumber(row.quantity_counted, 0);
      if (row.stock_item_id) {
        db.prepare(`
          UPDATE inventory_stock_items
          SET quantity=?, updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(quantityAfter, row.stock_item_id, companyId);
      }
      if (row.asset_id) {
        insertAdjustment.run(
          companyId,
          row.asset_id,
          countId,
          row.asset_code,
          parseNumber(row.quantity_scriptic, 0),
          quantityAfter,
          parseNumber(row.variance, 0),
          `Corecție inventar ${count.title || "Inventar"}`,
          req.session.user.email
        );
        db.prepare(`
          UPDATE inventory_assets
          SET quantity_scriptic=?, status=?, updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(quantityAfter, quantityAfter > 0 ? "IN_STOC" : "CASAT", row.asset_id, companyId);
      }
      db.prepare(`UPDATE inventory_count_items SET applied=1 WHERE id=? AND company_id=?`).run(row.id, companyId);
    }
    db.prepare(`UPDATE inventory_counts SET status='APPLIED', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(countId, companyId);
    res.redirect(`/nexora/inventory/counts/${countId}?ok=applied`);
  });

  app.get("/nexora/inventory/reports", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const byWarehouse = db.prepare(`
      SELECT
        COALESCE(w.name, 'Fără depozit') AS warehouse_name,
        COUNT(s.id) AS lines,
        COALESCE(SUM(s.quantity), 0) AS qty,
        COALESCE(SUM(s.reserved_quantity), 0) AS reserved
      FROM inventory_stock_items s
      LEFT JOIN inventory_warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
      WHERE s.company_id=?
      GROUP BY COALESCE(w.name, 'Fără depozit')
      ORDER BY qty DESC, warehouse_name ASC
    `).all(companyId);
    const lowStock = db.prepare(`
      SELECT s.*, w.name AS warehouse_name
      FROM inventory_stock_items s
      LEFT JOIN inventory_warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
      WHERE s.company_id=? AND s.quantity <= s.minimum_quantity
      ORDER BY s.quantity ASC, s.item_name COLLATE NOCASE ASC
      LIMIT 50
    `).all(companyId);
    const expiringLots = db.prepare(`
      SELECT l.*, w.name AS warehouse_name
      FROM inventory_lots l
      LEFT JOIN inventory_warehouses w ON w.id = l.warehouse_id AND w.company_id = l.company_id
      WHERE l.company_id=? AND COALESCE(l.expiry_date,'') <> '' AND UPPER(COALESCE(l.status,'')) <> 'EXPIRAT'
      ORDER BY l.expiry_date ASC, l.item_name COLLATE NOCASE ASC
      LIMIT 50
    `).all(companyId);
    const movements = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM inventory_transfers WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('FINALIZAT','ANULAT')) AS open_transfers,
        (SELECT COUNT(*) FROM inventory_receipts WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('RECEPTIONAT','ANULAT')) AS open_receipts,
        (SELECT COUNT(*) FROM inventory_pickings WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('LIVRAT','ANULAT')) AS open_pickings
    `).get(companyId, companyId, companyId) || {};
    return res.type("html").send(renderNexoraInventoryReportsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      byWarehouse,
      lowStock,
      expiringLots,
      movements
    }));
  });

  app.get("/inventory", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_assets,
        SUM(CASE WHEN UPPER(COALESCE(asset_type,''))='MIJLOC_FIX' THEN 1 ELSE 0 END) AS fixed_assets,
        SUM(CASE WHEN UPPER(COALESCE(asset_type,''))='OBIECT_INVENTAR' THEN 1 ELSE 0 END) AS mobile_assets,
        SUM(CASE WHEN quantity_scriptic <= minimum_quantity THEN 1 ELSE 0 END) AS low_stock_assets,
        SUM(quantity_scriptic * purchase_value) AS total_value
      FROM inventory_assets
      WHERE company_id=?
    `).get(companyId) || {};
    const projectStats = db.prepare(`
      SELECT
        COUNT(*) AS total_projects,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active_projects
      FROM inventory_projects
      WHERE company_id=?
    `).get(companyId) || {};
    const countStats = db.prepare(`
      SELECT
        COUNT(*) AS total_counts,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='DRAFT' THEN 1 ELSE 0 END) AS draft_counts,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='APPLIED' THEN 1 ELSE 0 END) AS applied_counts
      FROM inventory_counts
      WHERE company_id=?
    `).get(companyId) || {};
    const lowStock = db.prepare(`
      SELECT asset_code, asset_name, quantity_scriptic, minimum_quantity, location
      FROM inventory_assets
      WHERE company_id=? AND quantity_scriptic <= minimum_quantity
      ORDER BY quantity_scriptic ASC, asset_name COLLATE NOCASE ASC
      LIMIT 8
    `).all(companyId);
    const recentProjects = db.prepare(`
      SELECT id, project_code, project_name, client_name, status, location
      FROM inventory_projects
      WHERE company_id=?
      ORDER BY updated_at DESC, id DESC
      LIMIT 6
    `).all(companyId);
    const latestCounts = db.prepare(`
      SELECT id, title, count_date, status, source_file_name
      FROM inventory_counts
      WHERE company_id=?
      ORDER BY count_date DESC, id DESC
      LIMIT 6
    `).all(companyId);
    const html = `
      <section class="crm-card" style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <div class="crm-page-kicker">Adăugare rapidă</div>
            <h2 style="margin:0">Introducere manuală active</h2>
            <div class="crm-muted">Pentru lucru rapid: denumire, cantitate și locație. Codul se generează automat.</div>
          </div>
          <a class="crm-btn crm-btn-secondary" href="/inventory/assets">Deschide registrul complet</a>
        </div>
        <form method="post" action="/inventory/assets/quick" class="crm-grid" style="grid-template-columns:1.2fr .8fr .9fr .8fr auto;margin-top:14px;align-items:end">
          <div><label>Denumire</label><input name="asset_name" required placeholder="Scaun birou / Laptop / Dulap metalic" /></div>
          <div><label>Cantitate</label><input type="number" step="0.01" name="quantity_scriptic" value="1" /></div>
          <div><label>Locație</label><input name="location" placeholder="Depozit / birou / proiect" /></div>
          <div><label>Tip</label><select name="asset_type"><option value="OBIECT_INVENTAR">Mobil</option><option value="MIJLOC_FIX">Fix</option></select></div>
          <div><button class="crm-btn" type="submit">Adaugă rapid</button></div>
        </form>
      </section>

      <div class="crm-grid" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:18px">
        <section class="crm-card"><div class="crm-muted">Active inventar</div><div style="font-size:28px;font-weight:800">${Number(stats.total_assets || 0)}</div><div class="crm-muted">toate pozițiile scriptice</div></section>
        <section class="crm-card"><div class="crm-muted">Mijloace fixe</div><div style="font-size:28px;font-weight:800">${Number(stats.fixed_assets || 0)}</div><div class="crm-muted">bunuri urmărite individual</div></section>
        <section class="crm-card"><div class="crm-muted">Obiecte mobile</div><div style="font-size:28px;font-weight:800">${Number(stats.mobile_assets || 0)}</div><div class="crm-muted">stocuri și echipamente mobile</div></section>
        <section class="crm-card"><div class="crm-muted">Proiecte active</div><div style="font-size:28px;font-weight:800">${Number(projectStats.active_projects || 0)}</div><div class="crm-muted">din ${Number(projectStats.total_projects || 0)} proiecte</div></section>
        <section class="crm-card"><div class="crm-muted">Valoare inventar</div><div style="font-size:28px;font-weight:800">${fmtMoney(stats.total_value || 0)}</div><div class="crm-muted">valoare scriptică estimată</div></section>
      </div>

      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <div class="crm-page-kicker">Quick Start</div>
              <h2 style="margin:0">Zone de lucru inventar</h2>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <a class="crm-btn" href="/inventory/assets">Active</a>
              <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Inventar pe proiect</a>
              <a class="crm-btn crm-btn-secondary" href="/inventory/counts">Numărare inventar</a>
            </div>
          </div>
          <div class="crm-grid-2" style="margin-top:16px">
            <div class="crm-card" style="margin:0">
              <div class="crm-page-kicker">Alerte</div>
              <div style="font-size:24px;font-weight:800">${Number(stats.low_stock_assets || 0)}</div>
              <div class="crm-muted">active sub minimul scriptic</div>
            </div>
            <div class="crm-card" style="margin:0">
              <div class="crm-page-kicker">Numărări</div>
              <div style="font-size:24px;font-weight:800">${Number(countStats.draft_counts || 0)}</div>
              <div class="crm-muted">${Number(countStats.applied_counts || 0)} inventare cu corecții aplicate</div>
            </div>
          </div>
        </section>

        <section class="crm-card">
          <div class="crm-page-kicker">Raport rapid</div>
          <h2 style="margin-top:0">Ce trebuie urmărit</h2>
          <div style="display:grid;gap:12px">
            <div style="padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#fff7ed">
              <strong>${Number(stats.low_stock_assets || 0)} active sunt sub minim</strong>
              <div class="crm-muted">Verifică reîncărcarea sau transferul între locații.</div>
            </div>
            <div style="padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#eff6ff">
              <strong>${Number(projectStats.active_projects || 0)} proiecte au consum/inventar activ</strong>
              <div class="crm-muted">Poți urmări pe proiect ce s-a alocat și ce trebuie returnat.</div>
            </div>
            <div style="padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#f8fafc">
              <strong>${Number(countStats.total_counts || 0)} sesiuni de numărare</strong>
              <div class="crm-muted">Importă un fișier CSV și compară scriptic vs faptic.</div>
            </div>
          </div>
        </section>
      </div>

      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <h3 style="margin:0">Active cu prag minim atins</h3>
            <a href="/inventory/reports" class="crm-btn crm-btn-secondary">Raport inventar</a>
          </div>
          <div class="crm-table-wrap" style="margin-top:12px">
            <table class="crm-table">
              <thead><tr><th>Cod</th><th>Denumire</th><th>Locație</th><th>Scriptic</th><th>Minim</th></tr></thead>
              <tbody>
                ${lowStock.length ? lowStock.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.asset_code || "—")}</td>
                    <td>${escapeHtml(row.asset_name || "—")}</td>
                    <td>${escapeHtml(row.location || "—")}</td>
                    <td>${Number(row.quantity_scriptic || 0)}</td>
                    <td>${Number(row.minimum_quantity || 0)}</td>
                  </tr>
                `).join("") : `<tr><td colspan="5" class="crm-muted">Nu există active sub minim în acest moment.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>

        <section class="crm-card">
          <h3 style="margin-top:0">Ultimele proiecte și numărări</h3>
          <div style="display:grid;gap:12px">
            ${recentProjects.map((row) => `
              <a href="/inventory/projects/${row.id}" style="display:block;padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#fff;text-decoration:none;color:inherit">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <strong>${escapeHtml(row.project_name || row.project_code || "Proiect")}</strong>
                  ${inventoryStatusBadge(escapeHtml, row.status)}
                </div>
                <div class="crm-muted">${escapeHtml(row.project_code || "—")} · ${escapeHtml(row.client_name || "client nesetat")} · ${escapeHtml(row.location || "fără locație")}</div>
              </a>
            `).join("")}
            ${latestCounts.map((row) => `
              <a href="/inventory/counts/${row.id}" style="display:block;padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#f8fafc;text-decoration:none;color:inherit">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <strong>${escapeHtml(row.title || "Inventar")}</strong>
                  ${inventoryStatusBadge(escapeHtml, row.status)}
                </div>
                <div class="crm-muted">${escapeHtml(row.count_date || "—")} · ${escapeHtml(row.source_file_name || "fără fișier sursă")}</div>
              </a>
            `).join("")}
            ${!recentProjects.length && !latestCounts.length ? `<div class="crm-muted">Modulul este gata de lucru. Adaugă active, proiecte și prima sesiune de numărare.</div>` : ""}
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-home", "Inventar", "Administrare mijloace fixe, obiecte mobile, proiecte și numărări de inventar.", req, html));
  });

  app.get("/inventory/assets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildAssetFilterState(req.query);
    const { whereSql, params } = buildAssetWhere(filters, companyId);
    const rows = db.prepare(`
      SELECT *
      FROM inventory_assets
      WHERE ${whereSql}
      ORDER BY asset_name COLLATE NOCASE ASC, id DESC
      LIMIT 500
    `).all(...params);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <h2 style="margin-top:0">Active noi</h2>
          <div class="crm-muted" style="margin-bottom:12px">Poți folosi și varianta rapidă: doar denumire, cantitate și locație.</div>
          <form method="post" action="/inventory/assets">
            <div class="crm-grid-2">
              <div><label>Cod activ</label><input name="asset_code" required placeholder="INV-001" /></div>
              <div><label>Denumire</label><input name="asset_name" required placeholder="Laptop Dell Latitude" /></div>
              <div>
                <label>Tip</label>
                <select name="asset_type">
                  <option value="MIJLOC_FIX">Mijloc fix</option>
                  <option value="OBIECT_INVENTAR">Obiect mobil</option>
                </select>
              </div>
              <div>
                <label>Categorie</label>
                <select name="category">
                  <option value="MOBIL">Mobil</option>
                  <option value="IT">IT</option>
                  <option value="UTILAJ">Utilaj</option>
                  <option value="CONSUMABILE">Consumabile</option>
                </select>
              </div>
              <div><label>Unitate</label><input name="unit" value="buc" /></div>
              <div><label>Cantitate scriptică</label><input type="number" step="0.01" name="quantity_scriptic" value="1" /></div>
              <div><label>Prag minim</label><input type="number" step="0.01" name="minimum_quantity" value="0" /></div>
              <div><label>Status</label><input name="status" value="IN_STOC" /></div>
              <div><label>Locație</label><input name="location" placeholder="Depozit / birou / auto" /></div>
              <div><label>Serie / SN</label><input name="serial_number" /></div>
              <div><label>Data achiziției</label><input type="date" name="purchase_date" /></div>
              <div><label>Valoare achiziție</label><input type="number" step="0.01" name="purchase_value" value="0" /></div>
              <div><label>Furnizor</label><input name="supplier_name" /></div>
              <div><label>Nr. factură</label><input name="invoice_number" /></div>
            </div>
            <div style="margin-top:12px">
              <label>Observații</label>
              <textarea name="notes" rows="4" placeholder="Detalii utile despre activ, locație, utilizare..."></textarea>
            </div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Adaugă activ</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Registru inventar</h2>
              <div class="crm-muted">Mijloace fixe și obiecte mobile, cu stoc scriptic și praguri minime.</div>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/reports">Raport inventar</a>
          </div>
          <form method="get" action="/inventory/assets" class="crm-grid-2" style="margin-top:14px">
            <div><label>Căutare</label><input name="search" value="${escapeHtml(filters.search)}" placeholder="cod, denumire, locație, serie" /></div>
            <div><label>Tip</label><select name="type"><option value="">Toate</option><option value="MIJLOC_FIX" ${filters.type === "MIJLOC_FIX" ? "selected" : ""}>Mijloace fixe</option><option value="OBIECT_INVENTAR" ${filters.type === "OBIECT_INVENTAR" ? "selected" : ""}>Obiecte mobile</option></select></div>
            <div><label>Status</label><select name="status"><option value="">Toate</option><option value="IN_STOC" ${filters.status === "IN_STOC" ? "selected" : ""}>În stoc</option><option value="ALOCAT" ${filters.status === "ALOCAT" ? "selected" : ""}>Alocat</option><option value="IN_SERVICE" ${filters.status === "IN_SERVICE" ? "selected" : ""}>În service</option><option value="CASAT" ${filters.status === "CASAT" ? "selected" : ""}>Casat</option></select></div>
            <div style="display:flex;align-items:end;gap:10px"><button class="crm-btn" type="submit">Filtrează</button><a class="crm-btn crm-btn-secondary" href="/inventory/assets">Resetează</a></div>
          </form>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead>
                <tr><th>Cod</th><th>Denumire</th><th>Tip</th><th>Status</th><th>Locație</th><th>Scriptic</th><th>Minim</th><th>Valoare</th><th>Acțiuni</th></tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.asset_code || "—")}</td>
                    <td>
                      <strong>${escapeHtml(row.asset_name || "—")}</strong>
                      <div class="crm-muted">${escapeHtml(row.serial_number || row.notes || "fără serie / observații")}</div>
                    </td>
                    <td>${assetTypeBadge(row.asset_type)}</td>
                    <td>${inventoryStatusBadge(escapeHtml, row.status)}</td>
                    <td>${escapeHtml(row.location || "—")}</td>
                    <td>${Number(row.quantity_scriptic || 0)} ${escapeHtml(row.unit || "buc")}</td>
                    <td>${Number(row.minimum_quantity || 0)}</td>
                    <td>${fmtMoney(row.purchase_value || 0)}</td>
                    <td>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <a class="crm-btn crm-btn-secondary" href="/inventory/assets/${row.id}">Editează</a>
                        <form method="post" action="/inventory/assets/${row.id}/delete" onsubmit="return confirm('Ștergi activul din inventar?')" style="margin:0">
                          <button class="crm-btn crm-btn-danger" type="submit">Șterge</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="9" class="crm-muted">Nu există active înregistrate încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-assets", "Inventar", "Registrul complet al activelor fixe și mobile.", req, html));
  });

  app.post("/inventory/assets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createAssetRecord(db, req, companyId, req.body);
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/inventory/assets?ok=created" : "/inventory/assets");
  });

  app.post("/inventory/assets/quick", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createAssetRecord(db, req, companyId, {
      asset_name: req.body.asset_name,
      quantity_scriptic: req.body.quantity_scriptic,
      location: req.body.location,
      asset_type: req.body.asset_type,
      category: req.body.asset_type === "MIJLOC_FIX" ? "IMOBILIZARI" : "MOBIL",
      unit: "buc",
      status: "IN_STOC"
    });
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/inventory/assets?ok=created" : "/inventory");
  });

  app.get("/inventory/assets/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const asset = db.prepare(`SELECT * FROM inventory_assets WHERE id=? AND company_id=?`).get(assetId, companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    const usage = db.prepare(`
      SELECT COUNT(*) AS project_links FROM inventory_project_items WHERE asset_id=? AND company_id=?
    `).get(assetId, companyId) || {};
    const adjustments = db.prepare(`
      SELECT COUNT(*) AS adjustment_links FROM inventory_adjustments WHERE asset_id=? AND company_id=?
    `).get(assetId, companyId) || {};
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <div class="crm-page-kicker">${escapeHtml(asset.asset_code || "ACTIV")}</div>
              <h2 style="margin:0">${escapeHtml(asset.asset_name || "Activ inventar")}</h2>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/assets">Înapoi la registru</a>
          </div>
          <form method="post" action="/inventory/assets/${asset.id}" style="margin-top:14px">
            <div class="crm-grid-2">
              <div><label>Cod activ</label><input name="asset_code" value="${escapeHtml(asset.asset_code || "")}" required /></div>
              <div><label>Denumire</label><input name="asset_name" value="${escapeHtml(asset.asset_name || "")}" required /></div>
              <div><label>Tip</label><select name="asset_type"><option value="MIJLOC_FIX" ${String(asset.asset_type) === "MIJLOC_FIX" ? "selected" : ""}>Mijloc fix</option><option value="OBIECT_INVENTAR" ${String(asset.asset_type) === "OBIECT_INVENTAR" ? "selected" : ""}>Obiect mobil</option></select></div>
              <div><label>Categorie</label><input name="category" value="${escapeHtml(asset.category || "")}" /></div>
              <div><label>Unitate</label><input name="unit" value="${escapeHtml(asset.unit || "buc")}" /></div>
              <div><label>Cantitate scriptică</label><input type="number" step="0.01" name="quantity_scriptic" value="${Number(asset.quantity_scriptic || 0)}" /></div>
              <div><label>Prag minim</label><input type="number" step="0.01" name="minimum_quantity" value="${Number(asset.minimum_quantity || 0)}" /></div>
              <div><label>Status</label><input name="status" value="${escapeHtml(asset.status || "IN_STOC")}" /></div>
              <div><label>Locație</label><input name="location" value="${escapeHtml(asset.location || "")}" /></div>
              <div><label>Serie / SN</label><input name="serial_number" value="${escapeHtml(asset.serial_number || "")}" /></div>
              <div><label>Data achiziției</label><input type="date" name="purchase_date" value="${escapeHtml(asset.purchase_date || "")}" /></div>
              <div><label>Valoare achiziție</label><input type="number" step="0.01" name="purchase_value" value="${Number(asset.purchase_value || 0)}" /></div>
              <div><label>Furnizor</label><input name="supplier_name" value="${escapeHtml(asset.supplier_name || "")}" /></div>
              <div><label>Nr. factură</label><input name="invoice_number" value="${escapeHtml(asset.invoice_number || "")}" /></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4">${escapeHtml(asset.notes || "")}</textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Salvează modificările</button></div>
          </form>
          <form method="post" action="/inventory/assets/${asset.id}/delete" onsubmit="return confirm('Ștergi activul din inventar?')" style="margin-top:10px">
            <button class="crm-btn crm-btn-danger" type="submit">Șterge activul</button>
          </form>
        </section>

        <section class="crm-card">
          <h3 style="margin-top:0">Legături active</h3>
          <div class="crm-grid-2">
            <div class="crm-card" style="margin:0"><div class="crm-muted">Alocări pe proiecte</div><div style="font-size:24px;font-weight:800">${Number(usage.project_links || 0)}</div></div>
            <div class="crm-card" style="margin:0"><div class="crm-muted">Corecții inventar</div><div style="font-size:24px;font-weight:800">${Number(adjustments.adjustment_links || 0)}</div></div>
          </div>
          <div class="crm-muted" style="margin-top:12px">Dacă activul are legături istorice, ștergerea este blocată pentru a păstra trasabilitatea.</div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-assets", "Editare activ", "Actualizează datele unui activ din inventar.", req, html));
  });

  app.post("/inventory/assets/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const asset = db.prepare(`SELECT id FROM inventory_assets WHERE id=? AND company_id=?`).get(assetId, companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    updateAssetRecord(db, req, companyId, assetId, req.body);
    res.redirect(req.body?.return_to === "nexora" ? `/nexora/inventory/assets/${assetId}?ok=saved` : `/inventory/assets/${assetId}`);
  });

  app.post("/inventory/assets/:id/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const links = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM inventory_project_items WHERE asset_id=? AND company_id=?) AS project_links,
        (SELECT COUNT(*) FROM inventory_count_items WHERE asset_id=? AND company_id=?) AS count_links,
        (SELECT COUNT(*) FROM inventory_adjustments WHERE asset_id=? AND company_id=?) AS adjustment_links
    `).get(assetId, companyId, assetId, companyId, assetId, companyId) || {};
    if (Number(links.project_links || 0) || Number(links.count_links || 0) || Number(links.adjustment_links || 0)) {
      return res.status(400).send("Activul nu poate fi șters deoarece are alocări, numărări sau corecții deja înregistrate.");
    }
    db.prepare(`DELETE FROM inventory_assets WHERE id=? AND company_id=?`).run(assetId, companyId);
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/inventory/assets?ok=deleted" : "/inventory/assets");
  });

  app.get("/inventory/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        p.*,
        COUNT(i.id) AS allocated_lines,
        COALESCE(SUM(i.quantity_allocated - i.quantity_returned), 0) AS active_quantity
      FROM inventory_projects p
      LEFT JOIN inventory_project_items i ON i.project_id = p.id AND i.company_id = p.company_id
      WHERE p.company_id=?
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT 300
    `).all(companyId);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <h2 style="margin-top:0">Proiect nou</h2>
          <form method="post" action="/inventory/projects">
            <div class="crm-grid-2">
              <div><label>Cod proiect</label><input name="project_code" required placeholder="PRJ-001" /></div>
              <div><label>Denumire</label><input name="project_name" required placeholder="Sediu client X" /></div>
              <div><label>Client</label><input name="client_name" /></div>
              <div><label>Locație</label><input name="location" /></div>
              <div><label>Data start</label><input type="date" name="start_date" /></div>
              <div><label>Data final</label><input type="date" name="end_date" /></div>
              <div><label>Status</label><select name="status"><option value="ACTIV">Activ</option><option value="INCHIS">Închis</option></select></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4"></textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Creează proiect</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Inventar pe proiect</h2>
              <div class="crm-muted">Aici urmărești ce s-a luat pe fiecare proiect și ce trebuie returnat.</div>
            </div>
          </div>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead><tr><th>Proiect</th><th>Client</th><th>Status</th><th>Articole</th><th>Cantitate activă</th><th>Acțiuni</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.project_name || "—")}</strong><div class="crm-muted">${escapeHtml(row.project_code || "—")} · ${escapeHtml(row.location || "fără locație")}</div></td>
                    <td>${escapeHtml(row.client_name || "—")}</td>
                    <td>${inventoryStatusBadge(escapeHtml, row.status)}</td>
                    <td>${Number(row.allocated_lines || 0)}</td>
                    <td>${Number(row.active_quantity || 0)}</td>
                    <td>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <a class="crm-btn crm-btn-secondary" href="/inventory/projects/${row.id}">Deschide</a>
                        <a class="crm-btn crm-btn-secondary" href="/inventory/projects/${row.id}/edit">Editează</a>
                        <form method="post" action="/inventory/projects/${row.id}/delete" onsubmit="return confirm('Ștergi proiectul și alocările lui?')" style="margin:0">
                          <button class="crm-btn crm-btn-danger" type="submit">Șterge</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="crm-muted">Nu există proiecte de inventar încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-projects", "Inventar pe proiect", "Alocă active pe proiect și urmărește retururile.", req, html));
  });

  app.post("/inventory/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createProjectRecord(db, req, companyId, req.body);
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/inventory/projects?ok=created" : "/inventory/projects");
  });

  app.get("/inventory/projects/:id/edit", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT * FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const allocationStats = db.prepare(`
      SELECT COUNT(*) AS total_lines, COALESCE(SUM(quantity_allocated - quantity_returned),0) AS active_qty
      FROM inventory_project_items
      WHERE project_id=? AND company_id=?
    `).get(projectId, companyId) || {};
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <div class="crm-page-kicker">${escapeHtml(project.project_code || "PROIECT")}</div>
              <h2 style="margin:0">${escapeHtml(project.project_name || "Editare proiect")}</h2>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Înapoi la proiecte</a>
          </div>
          <form method="post" action="/inventory/projects/${project.id}" style="margin-top:14px">
            <div class="crm-grid-2">
              <div><label>Cod proiect</label><input name="project_code" value="${escapeHtml(project.project_code || "")}" required /></div>
              <div><label>Denumire</label><input name="project_name" value="${escapeHtml(project.project_name || "")}" required /></div>
              <div><label>Client</label><input name="client_name" value="${escapeHtml(project.client_name || "")}" /></div>
              <div><label>Locație</label><input name="location" value="${escapeHtml(project.location || "")}" /></div>
              <div><label>Data start</label><input type="date" name="start_date" value="${escapeHtml(project.start_date || "")}" /></div>
              <div><label>Data final</label><input type="date" name="end_date" value="${escapeHtml(project.end_date || "")}" /></div>
              <div><label>Status</label><select name="status"><option value="ACTIV" ${String(project.status) === "ACTIV" ? "selected" : ""}>Activ</option><option value="INCHIS" ${String(project.status) === "INCHIS" ? "selected" : ""}>Închis</option></select></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4">${escapeHtml(project.notes || "")}</textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Salvează proiectul</button></div>
          </form>
          <form method="post" action="/inventory/projects/${project.id}/delete" onsubmit="return confirm('Ștergi proiectul și alocările lui?')" style="margin-top:10px">
            <button class="crm-btn crm-btn-danger" type="submit">Șterge proiectul</button>
          </form>
        </section>

        <section class="crm-card">
          <h3 style="margin-top:0">Rezumat proiect</h3>
          <div class="crm-grid-2">
            <div class="crm-card" style="margin:0"><div class="crm-muted">Linii inventar</div><div style="font-size:24px;font-weight:800">${Number(allocationStats.total_lines || 0)}</div></div>
            <div class="crm-card" style="margin:0"><div class="crm-muted">Cantitate activă</div><div style="font-size:24px;font-weight:800">${Number(allocationStats.active_qty || 0)}</div></div>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-projects", "Editare proiect", "Actualizează datele și statusul proiectului.", req, html));
  });

  app.post("/inventory/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT id FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    updateProjectRecord(db, companyId, projectId, req.body);
    res.redirect(req.body?.return_to === "nexora" ? `/nexora/inventory/projects/${projectId}/edit?ok=saved` : `/inventory/projects/${projectId}/edit`);
  });

  app.post("/inventory/projects/:id/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const linkedCount = db.prepare(`SELECT COUNT(*) AS total FROM inventory_project_items WHERE project_id=? AND company_id=?`).get(projectId, companyId) || {};
    if (Number(linkedCount.total || 0) > 0) {
      db.prepare(`DELETE FROM inventory_project_items WHERE project_id=? AND company_id=?`).run(projectId, companyId);
    }
    db.prepare(`DELETE FROM inventory_projects WHERE id=? AND company_id=?`).run(projectId, companyId);
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/inventory/projects?ok=deleted" : "/inventory/projects");
  });

  app.get("/inventory/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT * FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const allocations = db.prepare(`
      SELECT *
      FROM inventory_project_items
      WHERE project_id=? AND company_id=?
      ORDER BY assigned_at DESC, id DESC
    `).all(projectId, companyId);
    const assets = db.prepare(`
      SELECT id, asset_code, asset_name, quantity_scriptic, unit, status
      FROM inventory_assets
      WHERE company_id=? AND UPPER(COALESCE(status,'')) <> 'CASAT'
      ORDER BY asset_name COLLATE NOCASE ASC
      LIMIT 300
    `).all(companyId);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <div class="crm-page-kicker">${escapeHtml(project.project_code || "PROIECT")}</div>
          <h2 style="margin-top:0">${escapeHtml(project.project_name || "Inventar proiect")}</h2>
          <div class="crm-muted">${escapeHtml(project.client_name || "client nesetat")} · ${escapeHtml(project.location || "fără locație")}</div>
          <div style="margin:12px 0 18px 0">${inventoryStatusBadge(escapeHtml, project.status)}</div>
          <form method="post" action="/inventory/projects/${project.id}/items">
            <h3 style="margin-top:0">Adaugă inventar pe proiect</h3>
            <div>
              <label>Activ</label>
              <select name="asset_id" required>
                <option value="">Selectează activ</option>
                ${assets.map((asset) => `<option value="${asset.id}">${escapeHtml(asset.asset_code)} · ${escapeHtml(asset.asset_name)} · ${Number(asset.quantity_scriptic || 0)} ${escapeHtml(asset.unit || "buc")}</option>`).join("")}
              </select>
            </div>
            <div class="crm-grid-2" style="margin-top:12px">
              <div><label>Cantitate alocată</label><input type="number" step="0.01" name="quantity_allocated" value="1" /></div>
              <div><label>Cantitate returnată</label><input type="number" step="0.01" name="quantity_returned" value="0" /></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4"></textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Adaugă pe proiect</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Alocări inventar</h2>
              <div class="crm-muted">Tot ce s-a luat pe acest proiect și ce mai este în teren.</div>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Înapoi la proiecte</a>
          </div>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead><tr><th>Activ</th><th>Alocat</th><th>Returnat</th><th>Rămas pe proiect</th><th>Data</th><th>Observații</th></tr></thead>
              <tbody>
                ${allocations.length ? allocations.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.asset_name || "—")}</strong><div class="crm-muted">${escapeHtml(row.asset_code || "—")}</div></td>
                    <td>${Number(row.quantity_allocated || 0)}</td>
                    <td>${Number(row.quantity_returned || 0)}</td>
                    <td>${Number((row.quantity_allocated || 0) - (row.quantity_returned || 0))}</td>
                    <td>${escapeHtml(row.assigned_at || "—")}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="crm-muted">Nu există active alocate încă pe proiect.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-projects", "Inventar pe proiect", "Detaliu proiect și active alocate.", req, html));
  });

  app.post("/inventory/projects/:id/items", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT id FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const asset = db.prepare(`SELECT * FROM inventory_assets WHERE id=? AND company_id=?`).get(Number(req.body.asset_id || 0), companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    const allocated = parseNumber(req.body.quantity_allocated, 1);
    const returned = parseNumber(req.body.quantity_returned, 0);
    db.prepare(`
      INSERT INTO inventory_project_items (
        company_id, project_id, asset_id, asset_code, asset_name, quantity_allocated,
        quantity_returned, assigned_by_email, notes
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      projectId,
      asset.id,
      asset.asset_code,
      asset.asset_name,
      allocated,
      returned,
      req.session.user.email,
      safeText(req.body.notes)
    );
    db.prepare(`UPDATE inventory_assets SET status='ALOCAT', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(asset.id, companyId);
    db.prepare(`UPDATE inventory_projects SET updated_at=datetime('now') WHERE id=? AND company_id=?`).run(projectId, companyId);
    res.redirect(req.body?.return_to === "nexora" ? `/nexora/inventory/projects/${projectId}?ok=item_added` : `/inventory/projects/${projectId}`);
  });

  app.get("/inventory/reports", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const byType = db.prepare(`
      SELECT asset_type, COUNT(*) AS total_items, SUM(quantity_scriptic) AS total_qty, SUM(quantity_scriptic * purchase_value) AS total_value
      FROM inventory_assets
      WHERE company_id=?
      GROUP BY asset_type
      ORDER BY asset_type
    `).all(companyId);
    const byLocation = db.prepare(`
      SELECT COALESCE(NULLIF(location,''), 'Fără locație') AS label, COUNT(*) AS total_items, SUM(quantity_scriptic) AS total_qty
      FROM inventory_assets
      WHERE company_id=?
      GROUP BY COALESCE(NULLIF(location,''), 'Fără locație')
      ORDER BY total_qty DESC, label ASC
      LIMIT 20
    `).all(companyId);
    const openProjects = db.prepare(`
      SELECT p.project_name, p.project_code, COALESCE(SUM(i.quantity_allocated - i.quantity_returned),0) AS qty
      FROM inventory_projects p
      LEFT JOIN inventory_project_items i ON i.project_id = p.id AND i.company_id = p.company_id
      WHERE p.company_id=? AND UPPER(COALESCE(p.status,''))='ACTIV'
      GROUP BY p.id
      ORDER BY qty DESC, p.project_name COLLATE NOCASE ASC
      LIMIT 20
    `).all(companyId);
    const html = `
      <div class="crm-grid-2">
        <section class="crm-card">
          <h2 style="margin-top:0">Raport pe tip de activ</h2>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead><tr><th>Tip</th><th>Poziții</th><th>Cantitate</th><th>Valoare</th></tr></thead>
              <tbody>
                ${byType.length ? byType.map((row) => `
                  <tr>
                    <td>${assetTypeBadge(row.asset_type)}</td>
                    <td>${Number(row.total_items || 0)}</td>
                    <td>${Number(row.total_qty || 0)}</td>
                    <td>${fmtMoney(row.total_value || 0)}</td>
                  </tr>
                `).join("") : `<tr><td colspan="4" class="crm-muted">Nu există date încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="crm-card">
          <h2 style="margin-top:0">Raport pe locații</h2>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead><tr><th>Locație</th><th>Poziții</th><th>Cantitate</th></tr></thead>
              <tbody>
                ${byLocation.length ? byLocation.map((row) => `
                  <tr><td>${escapeHtml(row.label || "—")}</td><td>${Number(row.total_items || 0)}</td><td>${Number(row.total_qty || 0)}</td></tr>
                `).join("") : `<tr><td colspan="3" class="crm-muted">Nu există date încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="crm-card">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <h2 style="margin:0">Inventar activ pe proiecte</h2>
            <div class="crm-muted">Cantități încă ieșite în teren, pe proiectele active.</div>
          </div>
          <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Deschide proiectele</a>
        </div>
        <div class="crm-table-wrap" style="margin-top:14px">
          <table class="crm-table">
            <thead><tr><th>Proiect</th><th>Cod</th><th>Cantitate activă</th></tr></thead>
            <tbody>
              ${openProjects.length ? openProjects.map((row) => `
                <tr><td>${escapeHtml(row.project_name || "—")}</td><td>${escapeHtml(row.project_code || "—")}</td><td>${Number(row.qty || 0)}</td></tr>
              `).join("") : `<tr><td colspan="3" class="crm-muted">Nu există proiecte active cu inventar alocat.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-reports", "Raport inventar", "Rapoarte operaționale pentru active, locații și proiecte.", req, html));
  });

  app.get("/inventory/counts", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        c.*,
        COUNT(i.id) AS line_count,
        SUM(CASE WHEN ABS(COALESCE(i.variance,0)) > 0.0001 THEN 1 ELSE 0 END) AS variance_lines
      FROM inventory_counts c
      LEFT JOIN inventory_count_items i ON i.count_id = c.id
      WHERE c.company_id=?
      GROUP BY c.id
      ORDER BY c.count_date DESC, c.id DESC
      LIMIT 300
    `).all(companyId);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <h2 style="margin-top:0">Numărare nouă</h2>
          <form method="post" action="/inventory/counts" enctype="multipart/form-data">
            <div><label>Titlu inventar</label><input name="title" value="Inventar lunar" required /></div>
            <div class="crm-grid-2" style="margin-top:12px">
              <div><label>Data numărării</label><input type="date" name="count_date" value="${escapeHtml(parseDate(new Date().toISOString().slice(0, 10)))}" /></div>
              <div><label>Status</label><select name="status"><option value="DRAFT">Draft</option><option value="FINALIZAT">Finalizat</option></select></div>
            </div>
            <div style="margin-top:12px">
              <label>Fișier numărare</label>
              <input type="file" name="count_file" accept=".csv,.txt" />
              <div class="crm-muted" style="margin-top:6px">CSV cu coloane <code>asset_code</code> și <code>quantity_counted</code>. Opțional: <code>notes</code>, <code>asset_name</code>.</div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4"></textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Creează sesiune de numărare</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Sesiuni de inventar</h2>
              <div class="crm-muted">Compară scriptic cu faptic și aplică corecțiile unde este nevoie.</div>
            </div>
          </div>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead><tr><th>Titlu</th><th>Data</th><th>Status</th><th>Linii</th><th>Diferențe</th><th>Acțiuni</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.title || "Inventar")}</strong><div class="crm-muted">${escapeHtml(row.source_file_name || "fără fișier sursă")}</div></td>
                    <td>${escapeHtml(row.count_date || "—")}</td>
                    <td>${inventoryStatusBadge(escapeHtml, row.status)}</td>
                    <td>${Number(row.line_count || 0)}</td>
                    <td>${Number(row.variance_lines || 0)}</td>
                    <td><a class="crm-btn crm-btn-secondary" href="/inventory/counts/${row.id}">Deschide</a></td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="crm-muted">Nu există sesiuni de numărare încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-counts", "Numărare inventar", "Importă fișierul de numărare și compară scriptic cu faptic.", req, html));
  });

  app.post("/inventory/counts", requireAuth, upload.single("count_file"), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    let fileInfo = null;
    let parsedRows = [];
    if (req.file) {
      fileInfo = saveUploadedFile({ fs, path, __dirname, file: req.file });
      parsedRows = parseCountFile(fs.readFileSync(fileInfo.fullPath, "utf8"));
    }

    const insertCount = db.prepare(`
      INSERT INTO inventory_counts (
        company_id, title, count_date, status, source_file_name, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      safeText(req.body.title) || "Inventar",
      parseDate(req.body.count_date) || new Date().toISOString().slice(0, 10),
      safeText(req.body.status) || "DRAFT",
      fileInfo?.fileName || "",
      safeText(req.body.notes),
      req.session.user.email
    );
    const countId = Number(insertCount.lastInsertRowid || 0);

    const insertItem = db.prepare(`
      INSERT INTO inventory_count_items (
        company_id, count_id, asset_id, asset_code, asset_name, quantity_scriptic, quantity_counted, variance, notes
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const assetsByCode = db.prepare(`SELECT id, asset_code, asset_name, quantity_scriptic FROM inventory_assets WHERE company_id=?`).all(companyId);
    const assetMap = new Map(assetsByCode.map((row) => [String(row.asset_code || "").trim().toLowerCase(), row]));
    if (parsedRows.length) {
      for (const row of parsedRows) {
        const asset = assetMap.get(String(row.asset_code || "").trim().toLowerCase()) || null;
        const scriptic = Number(asset?.quantity_scriptic || 0);
        const counted = Number(row.quantity_counted || 0);
        insertItem.run(
          companyId,
          countId,
          asset?.id || null,
          safeText(row.asset_code),
          safeText(row.asset_name) || safeText(asset?.asset_name),
          scriptic,
          counted,
          counted - scriptic,
          safeText(row.notes)
        );
      }
    } else {
      for (const asset of assetsByCode) {
        insertItem.run(
          companyId,
          countId,
          asset.id,
          asset.asset_code,
          asset.asset_name,
          Number(asset.quantity_scriptic || 0),
          Number(asset.quantity_scriptic || 0),
          0,
          ""
        );
      }
    }
    res.redirect(`/inventory/counts/${countId}`);
  });

  app.get("/inventory/counts/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const count = db.prepare(`SELECT * FROM inventory_counts WHERE id=? AND company_id=?`).get(countId, companyId);
    if (!count) return res.status(404).send("Sesiunea de inventar nu a fost găsită.");
    const items = db.prepare(`
      SELECT *
      FROM inventory_count_items
      WHERE count_id=? AND company_id=?
      ORDER BY ABS(COALESCE(variance,0)) DESC, asset_name COLLATE NOCASE ASC
      LIMIT 1000
    `).all(countId, companyId);
    const varianceCount = items.filter((row) => Math.abs(Number(row.variance || 0)) > 0.0001).length;
    const unappliedCount = items.filter((row) => Number(row.applied || 0) === 0 && Math.abs(Number(row.variance || 0)) > 0.0001).length;
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <div class="crm-page-kicker">Scriptic vs faptic</div>
          <h2 style="margin-top:0">${escapeHtml(count.title || "Inventar")}</h2>
          <div class="crm-muted">${escapeHtml(count.count_date || "—")} · ${escapeHtml(count.source_file_name || "fără fișier sursă")}</div>
          <div style="margin:14px 0">${inventoryStatusBadge(escapeHtml, count.status)}</div>
          <div class="crm-grid-2">
            <div class="crm-card" style="margin:0"><div class="crm-muted">Linii</div><div style="font-size:24px;font-weight:800">${items.length}</div></div>
            <div class="crm-card" style="margin:0"><div class="crm-muted">Diferențe</div><div style="font-size:24px;font-weight:800">${varianceCount}</div></div>
          </div>
          <div class="crm-grid-2" style="margin-top:12px">
            <form method="post" action="/inventory/counts/${count.id}/apply">
              <button class="crm-btn" type="submit" ${unappliedCount ? "" : "disabled"}>Aplică corecțiile</button>
            </form>
            <a class="crm-btn crm-btn-secondary" href="/inventory/counts/export/${count.id}.csv">Export CSV</a>
          </div>
          <div class="crm-muted" style="margin-top:12px">${escapeHtml(count.notes || "Fără observații.")}</div>
        </section>

        <section class="crm-card">
          <h2 style="margin-top:0">Linii de numărare</h2>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead><tr><th>Cod</th><th>Activ</th><th>Scriptic</th><th>Faptic</th><th>Diferență</th><th>Aplicat</th><th>Observații</th></tr></thead>
              <tbody>
                ${items.length ? items.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.asset_code || "—")}</td>
                    <td>${escapeHtml(row.asset_name || "—")}</td>
                    <td>${Number(row.quantity_scriptic || 0)}</td>
                    <td>${Number(row.quantity_counted || 0)}</td>
                    <td>${countVarianceBadge(row.variance)}</td>
                    <td>${Number(row.applied || 0) ? `<span class="crm-badge crm-badge-green">da</span>` : `<span class="crm-badge crm-badge-neutral">nu</span>`}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                  </tr>
                `).join("") : `<tr><td colspan="7" class="crm-muted">Nu există linii în această sesiune.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-counts", "Detaliu numărare", "Compară scriptic cu faptic și aplică diferențele.", req, html));
  });

  app.post("/inventory/counts/:id/apply", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const count = db.prepare(`SELECT * FROM inventory_counts WHERE id=? AND company_id=?`).get(countId, companyId);
    if (!count) return res.status(404).send("Sesiunea de inventar nu a fost găsită.");
    const rows = db.prepare(`
      SELECT *
      FROM inventory_count_items
      WHERE count_id=? AND company_id=? AND applied=0 AND ABS(COALESCE(variance,0)) > 0.0001
      ORDER BY id ASC
    `).all(countId, companyId);
    const insertAdjustment = db.prepare(`
      INSERT INTO inventory_adjustments (
        company_id, asset_id, count_id, asset_code, quantity_before, quantity_after, variance, reason, created_by_email
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const updateAsset = db.prepare(`
      UPDATE inventory_assets
      SET quantity_scriptic=?, status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `);
    const markApplied = db.prepare(`UPDATE inventory_count_items SET applied=1 WHERE id=? AND company_id=?`);

    for (const row of rows) {
      if (!row.asset_id) continue;
      const quantityAfter = Number(row.quantity_counted || 0);
      insertAdjustment.run(
        companyId,
        row.asset_id,
        countId,
        row.asset_code,
        Number(row.quantity_scriptic || 0),
        quantityAfter,
        Number(row.variance || 0),
        `Corecție inventar ${count.title || "Inventar"}`,
        req.session.user.email
      );
      updateAsset.run(
        quantityAfter,
        quantityAfter > 0 ? "IN_STOC" : "CASAT",
        row.asset_id,
        companyId
      );
      markApplied.run(row.id, companyId);
    }
    db.prepare(`UPDATE inventory_counts SET status='APPLIED', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(countId, companyId);
    res.redirect(`/inventory/counts/${countId}`);
  });

  app.get("/inventory/counts/export/:id.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const rows = db.prepare(`
      SELECT asset_code, asset_name, quantity_scriptic, quantity_counted, variance, applied, notes
      FROM inventory_count_items
      WHERE count_id=? AND company_id=?
      ORDER BY asset_name COLLATE NOCASE ASC
    `).all(countId, companyId);
    const csv = [
      ["asset_code", "asset_name", "quantity_scriptic", "quantity_counted", "variance", "applied", "notes"].join(","),
      ...rows.map((row) => [
        row.asset_code,
        row.asset_name,
        row.quantity_scriptic,
        row.quantity_counted,
        row.variance,
        row.applied,
        row.notes
      ].map(csvEscape).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="inventory-count-${countId}.csv"`);
    res.send(csv);
  });
}
