import {
  renderNexoraManufacturingBomPage,
  renderNexoraManufacturingCostsPage,
  renderNexoraManufacturingHubPage,
  renderNexoraManufacturingMaterialsPage,
  renderNexoraManufacturingOrdersPage,
  renderNexoraManufacturingPlanningPage,
  renderNexoraManufacturingQualityPage
} from "../src/ui/nexora-manufacturing-pages.js";

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
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugCode(value = "") {
  const normalized = safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized || "PROD";
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    manufacturing_boms: "bom_number",
    manufacturing_orders: "order_number",
    manufacturing_plans: "plan_number",
    manufacturing_material_issues: "issue_number",
    manufacturing_costs: "cost_number",
    manufacturing_quality_checks: "qc_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported manufacturing sequence");
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

function loadStockItems(db, companyId) {
  return db.prepare(`
    SELECT
      s.id, s.warehouse_id, s.product_id, s.item_code, s.item_name, s.unit,
      s.quantity, s.reserved_quantity, s.minimum_quantity, s.unit AS stock_unit,
      w.name AS warehouse_name
    FROM inventory_stock_items s
    LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id AND w.company_id=s.company_id
    WHERE s.company_id=? AND UPPER(COALESCE(s.status,''))='ACTIV'
    ORDER BY s.item_name COLLATE NOCASE ASC
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

function getStockItem(db, companyId, stockItemId) {
  if (!Number(stockItemId)) return null;
  return db.prepare(`
    SELECT *
    FROM inventory_stock_items
    WHERE id=? AND company_id=?
  `).get(Number(stockItemId), companyId) || null;
}

function stockItemForProduct(db, companyId, productId) {
  if (!Number(productId)) return null;
  return db.prepare(`
    SELECT *
    FROM inventory_stock_items
    WHERE company_id=? AND product_id=? AND UPPER(COALESCE(status,''))='ACTIV'
    ORDER BY quantity DESC, id DESC
    LIMIT 1
  `).get(companyId, Number(productId)) || null;
}

function loadBoms(db, companyId, onlyActive = false) {
  const statusFilter = onlyActive ? "AND UPPER(COALESCE(b.status,''))='ACTIV'" : "";
  return db.prepare(`
    SELECT
      b.*,
      COUNT(i.id) AS items_count,
      COALESCE(SUM(i.quantity_per_batch * i.unit_cost),0) AS estimated_cost
    FROM manufacturing_boms b
    LEFT JOIN manufacturing_bom_items i ON i.bom_id=b.id AND i.company_id=b.company_id
    WHERE b.company_id=? ${statusFilter}
    GROUP BY b.id
    ORDER BY b.id DESC
    LIMIT 300
  `).all(companyId);
}

function getBom(db, companyId, bomId) {
  if (!Number(bomId)) return null;
  return db.prepare(`
    SELECT *
    FROM manufacturing_boms
    WHERE id=? AND company_id=?
  `).get(Number(bomId), companyId) || null;
}

function loadBomItems(db, companyId, bomId) {
  if (!Number(bomId)) return [];
  return db.prepare(`
    SELECT *
    FROM manufacturing_bom_items
    WHERE company_id=? AND bom_id=?
    ORDER BY id ASC
  `).all(companyId, Number(bomId));
}

function loadOrders(db, companyId, onlyOpen = false) {
  const statusFilter = onlyOpen ? "AND UPPER(COALESCE(o.status,'')) NOT IN ('FINALIZAT','ANULAT')" : "";
  return db.prepare(`
    SELECT
      o.*,
      b.bom_number,
      w.name AS warehouse_name,
      COALESCE((SELECT SUM(total_cost) FROM manufacturing_costs c WHERE c.company_id=o.company_id AND c.order_id=o.id),0) AS cost_total
    FROM manufacturing_orders o
    LEFT JOIN manufacturing_boms b ON b.id=o.bom_id AND b.company_id=o.company_id
    LEFT JOIN inventory_warehouses w ON w.id=o.warehouse_id AND w.company_id=o.company_id
    WHERE o.company_id=? ${statusFilter}
    ORDER BY o.id DESC
    LIMIT 300
  `).all(companyId);
}

function getOrder(db, companyId, orderId) {
  if (!Number(orderId)) return null;
  return db.prepare(`
    SELECT *
    FROM manufacturing_orders
    WHERE id=? AND company_id=?
  `).get(Number(orderId), companyId) || null;
}

function loadOrderMaterials(db, companyId, onlyOpen = false) {
  const statusFilter = onlyOpen ? "AND UPPER(COALESCE(m.status,'')) <> 'CONSUMAT'" : "";
  return db.prepare(`
    SELECT
      m.*,
      o.order_number,
      o.product_name AS order_product_name
    FROM manufacturing_order_materials m
    JOIN manufacturing_orders o ON o.id=m.order_id AND o.company_id=m.company_id
    WHERE m.company_id=? ${statusFilter}
    ORDER BY o.id DESC, m.id ASC
    LIMIT 500
  `).all(companyId);
}

function getOrderMaterial(db, companyId, orderMaterialId) {
  if (!Number(orderMaterialId)) return null;
  return db.prepare(`
    SELECT m.*, o.order_number
    FROM manufacturing_order_materials m
    JOIN manufacturing_orders o ON o.id=m.order_id AND o.company_id=m.company_id
    WHERE m.id=? AND m.company_id=?
  `).get(Number(orderMaterialId), companyId) || null;
}

function availableProductQty(db, companyId, productId) {
  if (!Number(productId)) return 0;
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity - reserved_quantity),0) AS qty
    FROM inventory_stock_items
    WHERE company_id=? AND product_id=? AND UPPER(COALESCE(status,''))='ACTIV'
  `).get(companyId, Number(productId));
  return Number(row?.qty || 0);
}

function loadPlans(db, companyId) {
  return db.prepare(`
    SELECT p.*, o.order_number
    FROM manufacturing_plans p
    LEFT JOIN manufacturing_orders o ON o.id=p.generated_order_id AND o.company_id=p.company_id
    WHERE p.company_id=?
    ORDER BY p.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadIssues(db, companyId) {
  return db.prepare(`
    SELECT
      i.*,
      o.order_number,
      w.name AS warehouse_name
    FROM manufacturing_material_issues i
    LEFT JOIN manufacturing_orders o ON o.id=i.order_id AND o.company_id=i.company_id
    LEFT JOIN inventory_warehouses w ON w.id=i.warehouse_id AND w.company_id=i.company_id
    WHERE i.company_id=?
    ORDER BY i.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadCosts(db, companyId) {
  return db.prepare(`
    SELECT c.*, o.order_number, o.product_name
    FROM manufacturing_costs c
    LEFT JOIN manufacturing_orders o ON o.id=c.order_id AND o.company_id=c.company_id
    WHERE c.company_id=?
    ORDER BY c.cost_date DESC, c.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadQualityChecks(db, companyId) {
  return db.prepare(`
    SELECT q.*, o.order_number, COALESCE(o.product_name, p.name) AS product_name
    FROM manufacturing_quality_checks q
    LEFT JOIN manufacturing_orders o ON o.id=q.order_id AND o.company_id=q.company_id
    LEFT JOIN products p ON p.id=q.product_id AND p.company_id=q.company_id
    WHERE q.company_id=?
    ORDER BY q.check_date DESC, q.id DESC
    LIMIT 300
  `).all(companyId);
}

function insertOrderMaterialsFromBom(db, companyId, orderId, bomId, quantityPlanned) {
  const bom = getBom(db, companyId, bomId);
  const batchSize = Math.max(Number(bom?.batch_size || 1), 1);
  const multiplier = Number(quantityPlanned || 0) / batchSize;
  const items = loadBomItems(db, companyId, bomId);
  const insert = db.prepare(`
    INSERT INTO manufacturing_order_materials (
      company_id, order_id, bom_item_id, product_id, stock_item_id, item_code, item_name,
      unit, required_qty, unit_cost, status, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEEMIS', ?)
  `);

  for (const item of items) {
    const stock = item.stock_item_id ? getStockItem(db, companyId, item.stock_item_id) : stockItemForProduct(db, companyId, item.component_product_id);
    const requiredQty = Number(item.quantity_per_batch || 0) * multiplier * (1 + Number(item.scrap_percent || 0) / 100);
    insert.run(
      companyId,
      orderId,
      item.id,
      item.component_product_id || stock?.product_id || null,
      item.stock_item_id || stock?.id || null,
      item.component_code || stock?.item_code || null,
      item.component_name,
      item.unit || stock?.unit || "buc",
      requiredQty,
      Number(item.unit_cost || 0),
      item.operation_step || item.notes || null
    );
  }
}

function createOrder(db, companyId, payload = {}) {
  const bom = getBom(db, companyId, payload.bom_id);
  const product = bom ? null : getProduct(db, companyId, payload.product_id);
  if (!bom && !product) return { ok: false, reason: "required" };

  const quantityPlanned = Math.max(parseNumber(payload.quantity_planned, 1), 0.001);
  const productName = bom?.product_name || product?.name || safeText(payload.product_name);
  const productId = bom?.product_id || product?.id || null;
  const unit = bom?.unit || product?.unit || "buc";
  const orderNumber = nextNumber(db, companyId, "manufacturing_orders", "order_number", "MO");

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO manufacturing_orders (
        company_id, order_number, bom_id, product_id, product_name, quantity_planned,
        unit, warehouse_id, planned_start, planned_end, due_date, status, priority,
        client_name, notes, created_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      orderNumber,
      bom?.id || null,
      productId,
      productName,
      quantityPlanned,
      unit,
      Number(payload.warehouse_id || 0) || null,
      parseDate(payload.planned_start),
      parseDate(payload.planned_end),
      parseDate(payload.due_date),
      safeText(payload.status) || "PLANIFICAT",
      safeText(payload.priority) || "MEDIE",
      safeText(payload.client_name),
      safeText(payload.notes),
      payload.created_by_email || null
    );

    const orderId = Number(result.lastInsertRowid);
    if (bom?.id) insertOrderMaterialsFromBom(db, companyId, orderId, bom.id, quantityPlanned);
    return orderId;
  });

  return { ok: true, orderId: create(), orderNumber };
}

function ensureFinishedGoodsStock(db, companyId, order) {
  if (!Number(order?.warehouse_id || 0)) return;
  const existing = order.product_id
    ? db.prepare(`
      SELECT id, quantity
      FROM inventory_stock_items
      WHERE company_id=? AND warehouse_id=? AND product_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, order.warehouse_id, order.product_id)
    : null;
  const qty = Number(order.quantity_completed || order.quantity_planned || 0);
  if (existing) {
    db.prepare(`
      UPDATE inventory_stock_items
      SET quantity=quantity+?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(qty, existing.id, companyId);
    return;
  }

  db.prepare(`
    INSERT INTO inventory_stock_items (
      company_id, warehouse_id, product_id, item_code, item_name, item_type, unit,
      quantity, minimum_quantity, status, notes, created_by_email
    )
    VALUES (?, ?, ?, ?, ?, 'PRODUS_FINIT', ?, ?, 0, 'ACTIV', ?, ?)
  `).run(
    companyId,
    order.warehouse_id,
    order.product_id || null,
    order.product_id ? `PF-${order.product_id}` : `PF-${slugCode(order.product_name)}`,
    order.product_name,
    order.unit || "buc",
    qty,
    `Intrare produs finit din ${order.order_number}`,
    order.created_by_email || null
  );
}

function materialCostForOrder(db, companyId, orderId) {
  if (!Number(orderId)) return 0;
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN consumed_qty > 0 THEN consumed_qty ELSE required_qty END * unit_cost
    ),0) AS cost
    FROM manufacturing_order_materials
    WHERE company_id=? AND order_id=?
  `).get(companyId, Number(orderId));
  return Number(row?.cost || 0);
}

export function registerManufacturingRoutes(app, { db, requireAuth }) {
  app.get("/nexora/manufacturing", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM manufacturing_boms WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS activeBoms,
        (SELECT COUNT(*) FROM manufacturing_orders WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('FINALIZAT','ANULAT')) AS openOrders,
        (SELECT COUNT(*) FROM manufacturing_plans WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('PLANIFICAT','DRAFT')) AS pendingPlans,
        (SELECT COUNT(*) FROM manufacturing_quality_checks WHERE company_id=?) AS qualityChecks
    `).get(companyId, companyId, companyId, companyId) || {};

    return res.type("html").send(renderNexoraManufacturingHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      recentOrders: loadOrders(db, companyId).slice(0, 6),
      recentPlans: loadPlans(db, companyId).slice(0, 6),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/manufacturing/bom", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const boms = loadBoms(db, companyId);
    const selectedBomId = Number(req.query?.bom_id || boms[0]?.id || 0);
    const selectedBom = boms.find((bom) => Number(bom.id) === selectedBomId) || boms[0] || null;
    return res.type("html").send(renderNexoraManufacturingBomPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      boms,
      selectedBom,
      items: selectedBom ? loadBomItems(db, companyId, selectedBom.id) : [],
      products: loadProducts(db, companyId),
      stockItems: loadStockItems(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/manufacturing/bom/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const product = getProduct(db, companyId, Number(req.body?.product_id || 0));
    if (!product) return res.redirect("/nexora/manufacturing/bom?err=required");
    const revision = safeText(req.body?.revision) || "A";
    const batchSize = Math.max(parseNumber(req.body?.batch_size, 1), 0.001);
    const bomNumber = nextNumber(db, companyId, "manufacturing_boms", "bom_number", "BOM");
    db.prepare(`
      INSERT INTO manufacturing_boms (
        company_id, bom_number, product_id, product_code, product_name, revision,
        batch_size, unit, status, notes, created_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      bomNumber,
      product.id,
      product.code || null,
      product.name,
      revision,
      batchSize,
      product.unit || "buc",
      safeText(req.body?.status) || "DRAFT",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/manufacturing/bom?ok=created");
  });

  app.post("/nexora/manufacturing/bom/items/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const bom = getBom(db, companyId, Number(req.body?.bom_id || 0));
    if (!bom) return res.redirect("/nexora/manufacturing/bom?err=missing");
    const product = getProduct(db, companyId, Number(req.body?.component_product_id || 0));
    const stock = getStockItem(db, companyId, Number(req.body?.stock_item_id || 0));
    const componentName = product?.name || stock?.item_name || safeText(req.body?.component_name);
    if (!componentName) return res.redirect(`/nexora/manufacturing/bom?bom_id=${bom.id}&err=required`);
    db.prepare(`
      INSERT INTO manufacturing_bom_items (
        company_id, bom_id, component_product_id, stock_item_id, component_code,
        component_name, unit, quantity_per_batch, scrap_percent, unit_cost,
        operation_step, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      bom.id,
      product?.id || stock?.product_id || null,
      stock?.id || null,
      product?.code || stock?.item_code || null,
      componentName,
      product?.unit || stock?.unit || safeText(req.body?.unit) || "buc",
      Math.max(parseNumber(req.body?.quantity_per_batch, 1), 0),
      Math.max(parseNumber(req.body?.scrap_percent, 0), 0),
      parseNumber(req.body?.unit_cost, Number(product?.price || 0)),
      safeText(req.body?.operation_step),
      safeText(req.body?.notes)
    );
    db.prepare("UPDATE manufacturing_boms SET updated_at=datetime('now') WHERE id=? AND company_id=?").run(bom.id, companyId);
    return res.redirect(`/nexora/manufacturing/bom?bom_id=${bom.id}&ok=created`);
  });

  app.post("/nexora/manufacturing/bom/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["DRAFT", "ACTIV", "BLOCAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/manufacturing/bom?err=invalid");
    db.prepare("UPDATE manufacturing_boms SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, id, companyId);
    return res.redirect(`/nexora/manufacturing/bom?bom_id=${id}&ok=status`);
  });

  app.get("/nexora/manufacturing/orders", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraManufacturingOrdersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadOrders(db, companyId),
      boms: loadBoms(db, companyId, true),
      products: loadProducts(db, companyId),
      warehouses: loadWarehouses(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/manufacturing/orders/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const result = createOrder(db, companyId, {
      ...req.body,
      created_by_email: currentUserEmail(req)
    });
    if (!result.ok) return res.redirect(`/nexora/manufacturing/orders?err=${result.reason || "invalid"}`);
    return res.redirect("/nexora/manufacturing/orders?ok=created");
  });

  app.post("/nexora/manufacturing/orders/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["PLANIFICAT", "IN_LUCRU", "LANSAT", "ANULAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/manufacturing/orders?err=invalid");
    db.prepare("UPDATE manufacturing_orders SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, id, companyId);
    return res.redirect("/nexora/manufacturing/orders?ok=launched");
  });

  app.post("/nexora/manufacturing/orders/:id/finish", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id);
    const order = getOrder(db, companyId, id);
    if (!order) return res.redirect("/nexora/manufacturing/orders?err=missing");
    const qty = Math.max(parseNumber(req.body?.quantity_completed, order.quantity_planned), 0);
    const finish = db.transaction(() => {
      db.prepare(`
        UPDATE manufacturing_orders
        SET quantity_completed=?,
            status='FINALIZAT',
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(qty, id, companyId);
      ensureFinishedGoodsStock(db, companyId, { ...order, quantity_completed: qty });
    });
    finish();
    return res.redirect("/nexora/manufacturing/orders?ok=finished");
  });

  app.get("/nexora/manufacturing/planning", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraManufacturingPlanningPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadPlans(db, companyId),
      products: loadProducts(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/manufacturing/planning/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const product = getProduct(db, companyId, Number(req.body?.product_id || 0));
    if (!product) return res.redirect("/nexora/manufacturing/planning?err=required");
    const demandQty = Math.max(parseNumber(req.body?.demand_qty, 0), 0);
    const availableQty = availableProductQty(db, companyId, product.id);
    const plannedQty = Math.max(demandQty - availableQty, 0);
    const planNumber = nextNumber(db, companyId, "manufacturing_plans", "plan_number", "MRP");
    db.prepare(`
      INSERT INTO manufacturing_plans (
        company_id, plan_number, product_id, product_name, demand_source,
        period_start, period_end, required_date, demand_qty, available_qty,
        planned_qty, status, notes, created_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      planNumber,
      product.id,
      product.name,
      safeText(req.body?.demand_source) || "FORECAST",
      parseDate(req.body?.period_start),
      parseDate(req.body?.period_end),
      parseDate(req.body?.required_date),
      demandQty,
      availableQty,
      plannedQty,
      plannedQty > 0 ? "PLANIFICAT" : "ACOPERIT",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/manufacturing/planning?ok=created");
  });

  app.post("/nexora/manufacturing/planning/:id/generate-order", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id);
    const plan = db.prepare("SELECT * FROM manufacturing_plans WHERE id=? AND company_id=?").get(id, companyId);
    if (!plan) return res.redirect("/nexora/manufacturing/planning?err=missing");
    if (Number(plan.generated_order_id || 0)) return res.redirect("/nexora/manufacturing/planning?err=invalid");
    const bom = db.prepare(`
      SELECT *
      FROM manufacturing_boms
      WHERE company_id=? AND product_id=? AND UPPER(COALESCE(status,''))='ACTIV'
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, plan.product_id);
    const result = createOrder(db, companyId, {
      bom_id: bom?.id || null,
      product_id: plan.product_id,
      quantity_planned: Number(plan.planned_qty || plan.demand_qty || 0),
      due_date: plan.required_date,
      priority: "MEDIE",
      notes: `Generat din ${plan.plan_number}`,
      status: "PLANIFICAT",
      created_by_email: currentUserEmail(req)
    });
    if (!result.ok) return res.redirect("/nexora/manufacturing/planning?err=invalid");
    db.prepare(`
      UPDATE manufacturing_plans
      SET generated_order_id=?,
          status='GENERAT',
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(result.orderId, id, companyId);
    return res.redirect("/nexora/manufacturing/planning?ok=generated");
  });

  app.get("/nexora/manufacturing/materials", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraManufacturingMaterialsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      issues: loadIssues(db, companyId),
      orderMaterials: loadOrderMaterials(db, companyId, true),
      orders: loadOrders(db, companyId, true),
      stockItems: loadStockItems(db, companyId),
      warehouses: loadWarehouses(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/manufacturing/materials/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderMaterial = getOrderMaterial(db, companyId, Number(req.body?.order_material_id || 0));
    const stock = getStockItem(db, companyId, Number(req.body?.stock_item_id || orderMaterial?.stock_item_id || 0))
      || stockItemForProduct(db, companyId, orderMaterial?.product_id);
    const orderId = Number(orderMaterial?.order_id || req.body?.order_id || 0) || null;
    const itemName = orderMaterial?.item_name || stock?.item_name || safeText(req.body?.item_name);
    if (!itemName) return res.redirect("/nexora/manufacturing/materials?err=required");
    const issuedQty = Math.max(parseNumber(req.body?.issued_qty, Number(orderMaterial?.required_qty || 1)), 0);
    const issueNumber = nextNumber(db, companyId, "manufacturing_material_issues", "issue_number", "MC");
    db.prepare(`
      INSERT INTO manufacturing_material_issues (
        company_id, issue_number, order_id, order_material_id, warehouse_id, stock_item_id,
        product_id, item_code, item_name, unit, planned_qty, issued_qty, issue_date,
        status, notes, created_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMIS', ?, ?)
    `).run(
      companyId,
      issueNumber,
      orderId,
      orderMaterial?.id || null,
      Number(req.body?.warehouse_id || stock?.warehouse_id || 0) || null,
      stock?.id || null,
      orderMaterial?.product_id || stock?.product_id || null,
      orderMaterial?.item_code || stock?.item_code || null,
      itemName,
      orderMaterial?.unit || stock?.unit || safeText(req.body?.unit) || "buc",
      Number(orderMaterial?.required_qty || issuedQty),
      issuedQty,
      parseDate(req.body?.issue_date) || todayIso(),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    if (orderMaterial?.id) {
      const newIssued = Number(orderMaterial.issued_qty || 0) + issuedQty;
      const status = newIssued >= Number(orderMaterial.required_qty || 0) ? "EMIS" : "EMIS_PARTIAL";
      db.prepare(`
        UPDATE manufacturing_order_materials
        SET issued_qty=?,
            status=?,
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(newIssued, status, orderMaterial.id, companyId);
    }
    return res.redirect("/nexora/manufacturing/materials?ok=created");
  });

  app.post("/nexora/manufacturing/materials/:id/consume", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id);
    const issue = db.prepare("SELECT * FROM manufacturing_material_issues WHERE id=? AND company_id=?").get(id, companyId);
    if (!issue) return res.redirect("/nexora/manufacturing/materials?err=missing");
    const qty = Number(issue.issued_qty || 0);
    const consume = db.transaction(() => {
      if (issue.stock_item_id) {
        const stock = getStockItem(db, companyId, issue.stock_item_id);
        if (!stock || Number(stock.quantity || 0) < qty) throw new Error("stock");
        db.prepare(`
          UPDATE inventory_stock_items
          SET quantity=quantity-?,
              updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(qty, issue.stock_item_id, companyId);
      }
      db.prepare(`
        UPDATE manufacturing_material_issues
        SET consumed_qty=?,
            status='CONSUMAT',
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(qty, id, companyId);
      if (issue.order_material_id) {
        const material = getOrderMaterial(db, companyId, issue.order_material_id);
        const consumed = Number(material?.consumed_qty || 0) + qty;
        const status = consumed >= Number(material?.required_qty || 0) ? "CONSUMAT" : "EMIS_PARTIAL";
        db.prepare(`
          UPDATE manufacturing_order_materials
          SET consumed_qty=?,
              status=?,
              updated_at=datetime('now')
          WHERE id=? AND company_id=?
        `).run(consumed, status, issue.order_material_id, companyId);
      }
    });
    try {
      consume();
    } catch (error) {
      if (error?.message === "stock") return res.redirect("/nexora/manufacturing/materials?err=stock");
      throw error;
    }
    return res.redirect("/nexora/manufacturing/materials?ok=consumed");
  });

  app.get("/nexora/manufacturing/costs", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraManufacturingCostsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadCosts(db, companyId),
      orders: loadOrders(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/manufacturing/costs/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const order = getOrder(db, companyId, Number(req.body?.order_id || 0));
    const orderId = order?.id || null;
    const materialCost = String(req.body?.auto_material_cost || "") === "1"
      ? materialCostForOrder(db, companyId, orderId)
      : parseNumber(req.body?.material_cost, 0);
    const laborCost = parseNumber(req.body?.labor_cost, 0);
    const overheadCost = parseNumber(req.body?.overhead_cost, 0);
    const subcontractCost = parseNumber(req.body?.subcontract_cost, 0);
    const totalCost = materialCost + laborCost + overheadCost + subcontractCost;
    const quantityBasis = parseNumber(req.body?.quantity_basis, Number(order?.quantity_completed || order?.quantity_planned || 0));
    const unitCost = quantityBasis > 0 ? totalCost / quantityBasis : 0;
    const costNumber = nextNumber(db, companyId, "manufacturing_costs", "cost_number", "CST");
    db.prepare(`
      INSERT INTO manufacturing_costs (
        company_id, cost_number, order_id, cost_date, cost_type, description,
        material_cost, labor_cost, overhead_cost, subcontract_cost, total_cost,
        quantity_basis, unit_cost, status, notes, created_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      costNumber,
      orderId,
      parseDate(req.body?.cost_date) || todayIso(),
      safeText(req.body?.cost_type) || "ESTIMAT",
      safeText(req.body?.description) || (order ? `Cost ${order.order_number}` : "Cost producție"),
      materialCost,
      laborCost,
      overheadCost,
      subcontractCost,
      totalCost,
      quantityBasis,
      unitCost,
      "APROBAT",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/manufacturing/costs?ok=created");
  });

  app.get("/nexora/manufacturing/quality", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraManufacturingQualityPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadQualityChecks(db, companyId),
      orders: loadOrders(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/manufacturing/quality/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const order = getOrder(db, companyId, Number(req.body?.order_id || 0));
    const qcNumber = nextNumber(db, companyId, "manufacturing_quality_checks", "qc_number", "QC");
    db.prepare(`
      INSERT INTO manufacturing_quality_checks (
        company_id, qc_number, order_id, product_id, check_date, inspection_type,
        sample_size, accepted_qty, rejected_qty, defect_type, result,
        inspector_email, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      qcNumber,
      order?.id || null,
      order?.product_id || null,
      parseDate(req.body?.check_date) || todayIso(),
      safeText(req.body?.inspection_type) || "FINAL",
      parseNumber(req.body?.sample_size, 0),
      parseNumber(req.body?.accepted_qty, 0),
      parseNumber(req.body?.rejected_qty, 0),
      safeText(req.body?.defect_type),
      safeText(req.body?.result) || "PENDING",
      currentUserEmail(req),
      safeText(req.body?.notes)
    );
    return res.redirect("/nexora/manufacturing/quality?ok=created");
  });
}
