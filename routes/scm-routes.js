import {
  renderNexoraScmDistributionPage,
  renderNexoraScmForecastingPage,
  renderNexoraScmHubPage,
  renderNexoraScmLogisticsPage,
  renderNexoraScmTransportPage
} from "../src/ui/nexora-scm-pages.js";

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

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    scm_logistics_tasks: "task_number",
    scm_transport_orders: "transport_number",
    scm_distribution_plans: "distribution_number",
    scm_forecasts: "forecast_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported SCM sequence");
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

function loadWarehouses(db, companyId) {
  return db.prepare(`
    SELECT id, warehouse_code, name
    FROM inventory_warehouses
    WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV'
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 300
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

function getProduct(db, companyId, productId) {
  if (!Number(productId)) return null;
  return db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, kind
    FROM products
    WHERE id=? AND company_id=?
  `).get(Number(productId), companyId) || null;
}

function stockForProduct(db, companyId, productId) {
  if (!Number(productId)) return 0;
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity),0) AS qty
    FROM inventory_stock_items
    WHERE company_id=? AND product_id=? AND UPPER(COALESCE(status,''))='ACTIV'
  `).get(companyId, Number(productId)) || {};
  return Number(row.qty || 0);
}

function loadLogistics(db, companyId, onlyOpen = false) {
  const openFilter = onlyOpen ? "AND UPPER(COALESCE(l.status,'')) NOT IN ('FINALIZAT','ANULAT')" : "";
  return db.prepare(`
    SELECT l.*, w.name AS warehouse_name, w.warehouse_code
    FROM scm_logistics_tasks l
    LEFT JOIN inventory_warehouses w ON w.id=l.warehouse_id AND w.company_id=l.company_id
    WHERE l.company_id=? ${openFilter}
    ORDER BY l.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadTransports(db, companyId, onlyOpen = false) {
  const openFilter = onlyOpen ? "AND UPPER(COALESCE(status,'')) NOT IN ('LIVRAT','ANULAT')" : "";
  return db.prepare(`
    SELECT *
    FROM scm_transport_orders
    WHERE company_id=? ${openFilter}
    ORDER BY id DESC
    LIMIT 300
  `).all(companyId);
}

function loadDistributions(db, companyId) {
  return db.prepare(`
    SELECT d.*, w.name AS warehouse_name, w.warehouse_code
    FROM scm_distribution_plans d
    LEFT JOIN inventory_warehouses w ON w.id=d.warehouse_id AND w.company_id=d.company_id
    WHERE d.company_id=?
    ORDER BY d.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadForecasts(db, companyId) {
  return db.prepare(`
    SELECT *
    FROM scm_forecasts
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 300
  `).all(companyId);
}

function dashboardStats(db, companyId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM scm_logistics_tasks WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('FINALIZAT','ANULAT')) AS openLogistics,
      (SELECT COUNT(*) FROM scm_transport_orders WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('LIVRAT','ANULAT')) AS activeTransports,
      (SELECT COUNT(*) FROM scm_distribution_plans WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('PLANIFICAT','PREGATIRE','IN_TRANZIT')) AS plannedDistributions,
      (SELECT COUNT(*) FROM scm_forecasts WHERE company_id=? AND UPPER(COALESCE(status,''))='RISC_STOC') AS riskForecasts
  `).get(companyId, companyId, companyId, companyId) || {};
}

export function registerScmRoutes(app, { db, requireAuth }) {
  app.get("/nexora/supply-chain", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraScmHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: dashboardStats(db, companyId),
      logistics: loadLogistics(db, companyId, true).slice(0, 8),
      transports: loadTransports(db, companyId, true).slice(0, 8),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/supply-chain/logistics", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraScmLogisticsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadLogistics(db, companyId),
      warehouses: loadWarehouses(db, companyId),
      products: loadProducts(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/supply-chain/logistics/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const product = getProduct(db, companyId, Number(req.body?.product_id || 0));
    const productName = product?.name || safeText(req.body?.product_name);
    if (!productName && !safeText(req.body?.reference_doc)) return res.redirect("/nexora/supply-chain/logistics?err=required");
    const taskNumber = nextNumber(db, companyId, "scm_logistics_tasks", "task_number", "LOG");
    db.prepare(`
      INSERT INTO scm_logistics_tasks (
        company_id, task_number, task_type, warehouse_id, source_location,
        destination_location, reference_doc, product_id, product_name, quantity,
        unit, planned_date, status, responsible, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANIFICAT', ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      taskNumber,
      safeText(req.body?.task_type) || "PICKING",
      Number(req.body?.warehouse_id || 0) || null,
      safeText(req.body?.source_location),
      safeText(req.body?.destination_location),
      safeText(req.body?.reference_doc),
      product?.id || null,
      productName,
      Math.max(0, parseNumber(req.body?.quantity, 0)),
      product?.unit || safeText(req.body?.unit) || "buc",
      parseDate(req.body?.planned_date) || todayIso(),
      safeText(req.body?.responsible),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/supply-chain/logistics?ok=created");
  });

  app.post("/nexora/supply-chain/logistics/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["PLANIFICAT", "IN_LUCRU", "FINALIZAT", "ANULAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/supply-chain/logistics?err=invalid");
    db.prepare("UPDATE scm_logistics_tasks SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/supply-chain/logistics?ok=status");
  });

  app.get("/nexora/supply-chain/transport", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraScmTransportPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadTransports(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/supply-chain/transport/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const transportNumber = nextNumber(db, companyId, "scm_transport_orders", "transport_number", "TRN");
    db.prepare(`
      INSERT INTO scm_transport_orders (
        company_id, transport_number, carrier_name, vehicle_number, driver_name,
        route_name, origin, destination, pickup_date, delivery_date, status,
        cost, currency, client_name, tracking_code, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANIFICAT', ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      transportNumber,
      safeText(req.body?.carrier_name),
      safeText(req.body?.vehicle_number),
      safeText(req.body?.driver_name),
      safeText(req.body?.route_name),
      safeText(req.body?.origin),
      safeText(req.body?.destination),
      parseDate(req.body?.pickup_date),
      parseDate(req.body?.delivery_date),
      Math.max(0, parseNumber(req.body?.cost, 0)),
      safeText(req.body?.currency) || "RON",
      safeText(req.body?.client_name),
      safeText(req.body?.tracking_code),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/supply-chain/transport?ok=created");
  });

  app.post("/nexora/supply-chain/transport/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["PLANIFICAT", "IN_TRANZIT", "LIVRAT", "INTARZIAT", "ANULAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/supply-chain/transport?err=invalid");
    db.prepare("UPDATE scm_transport_orders SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/supply-chain/transport?ok=status");
  });

  app.get("/nexora/supply-chain/distribution", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraScmDistributionPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadDistributions(db, companyId),
      warehouses: loadWarehouses(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/supply-chain/distribution/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const distributionNumber = nextNumber(db, companyId, "scm_distribution_plans", "distribution_number", "DST");
    db.prepare(`
      INSERT INTO scm_distribution_plans (
        company_id, distribution_number, warehouse_id, channel, destination_region,
        route_name, planned_date, delivery_window, orders_count, parcels_count,
        total_weight, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANIFICAT', ?, ?, datetime('now'))
    `).run(
      companyId,
      distributionNumber,
      Number(req.body?.warehouse_id || 0) || null,
      safeText(req.body?.channel) || "B2B",
      safeText(req.body?.destination_region),
      safeText(req.body?.route_name),
      parseDate(req.body?.planned_date) || todayIso(),
      safeText(req.body?.delivery_window),
      Math.max(0, Math.round(parseNumber(req.body?.orders_count, 0))),
      Math.max(0, Math.round(parseNumber(req.body?.parcels_count, 0))),
      Math.max(0, parseNumber(req.body?.total_weight, 0)),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/supply-chain/distribution?ok=created");
  });

  app.post("/nexora/supply-chain/distribution/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["PLANIFICAT", "PREGATIRE", "IN_TRANZIT", "LIVRAT", "ANULAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/supply-chain/distribution?err=invalid");
    db.prepare("UPDATE scm_distribution_plans SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/supply-chain/distribution?ok=status");
  });

  app.get("/nexora/supply-chain/forecasting", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraScmForecastingPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadForecasts(db, companyId),
      products: loadProducts(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/supply-chain/forecasting/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const product = getProduct(db, companyId, Number(req.body?.product_id || 0));
    const productName = product?.name || safeText(req.body?.product_name);
    if (!productName) return res.redirect("/nexora/supply-chain/forecasting?err=required");
    const forecastQty = Math.max(0, parseNumber(req.body?.forecast_qty, 0));
    const currentStock = product?.id ? stockForProduct(db, companyId, product.id) : 0;
    const recommendedQty = Math.max(0, forecastQty - currentStock);
    const forecastNumber = nextNumber(db, companyId, "scm_forecasts", "forecast_number", "FRC");
    db.prepare(`
      INSERT INTO scm_forecasts (
        company_id, forecast_number, product_id, product_name, demand_source,
        period_start, period_end, forecast_qty, current_stock, recommended_qty,
        confidence_percent, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      forecastNumber,
      product?.id || null,
      productName,
      safeText(req.body?.demand_source) || "VANZARI",
      parseDate(req.body?.period_start),
      parseDate(req.body?.period_end),
      forecastQty,
      currentStock,
      recommendedQty,
      Math.max(0, Math.min(100, parseNumber(req.body?.confidence_percent, 70))),
      recommendedQty > 0 ? "RISC_STOC" : "ACOPERIT",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/supply-chain/forecasting?ok=created");
  });
}
