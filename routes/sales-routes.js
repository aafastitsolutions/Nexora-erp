import {
  renderNexoraSalesDeliveryDetailPage,
  renderNexoraSalesDeliveriesPage,
  renderNexoraSalesDiscountsPage,
  renderNexoraSalesHubPage,
  renderNexoraSalesOrderDetailPage,
  renderNexoraSalesOrdersPage,
  renderNexoraSalesPricesPage
} from "../src/ui/nexora-sales-pages.js";
import {
  renderNexoraOrderDeliveryStatusPage,
  renderNexoraOrderFulfillmentPage,
  renderNexoraOrderLifecyclePage,
  renderNexoraOrderTrackingPage
} from "../src/ui/nexora-order-management-pages.js";

function moneyInput(value) {
  const normalized = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateTimeInput(value) {
  const raw = String(value || "").trim();
  if (raw) return raw.replace("T", " ");
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function normalizeStatus(value, fallback) {
  return String(value || fallback || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function nextNumber(db, tableName, columnName, companyId, prefix) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const row = db.prepare(`
    SELECT ${columnName} AS number_value
    FROM ${tableName}
    WHERE company_id=? AND ${columnName} LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, like);
  const current = String(row?.number_value || "");
  const lastSeq = Number(current.split("-").pop() || 0);
  const seq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

function recalcOrderTotals(db, orderId, companyId) {
  const totals = db.prepare(`
    SELECT IFNULL(SUM(line_total),0) AS subtotal
    FROM sales_order_items
    WHERE order_id=? AND company_id=?
  `).get(orderId, companyId) || {};
  const subtotal = Number(totals.subtotal || 0);
  db.prepare(`
    UPDATE sales_orders
    SET subtotal=?,
        total=? - COALESCE(discount_amount,0),
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(subtotal, subtotal, orderId, companyId);
}

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function currentUserEmail(req) {
  return String(req.session.user.email || "").trim().toLowerCase();
}

function loadProducts(db, companyId) {
  return db.prepare(`
    SELECT id, code, name, unit, price
    FROM products
    WHERE company_id=? AND active=1
    ORDER BY name COLLATE NOCASE ASC
  `).all(companyId);
}

function loadClients(db, companyId) {
  return db.prepare(`
    SELECT id, name, cui, address, phone
    FROM clients
    WHERE company_id=?
    ORDER BY name COLLATE NOCASE ASC
  `).all(companyId);
}

function loadOrderManagementOrders(db, companyId, openOnly = false) {
  const where = ["so.company_id=?"];
  const params = [companyId];
  if (openOnly) where.push("UPPER(COALESCE(so.status,'')) NOT IN ('LIVRATA','ANULATA')");
  return db.prepare(`
    SELECT so.id, so.order_number, so.status, so.total, so.due_date, cl.name AS client_name
    FROM sales_orders so
    JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
    WHERE ${where.join(" AND ")}
    ORDER BY date(COALESCE(so.due_date, so.order_date, so.created_at)) ASC, so.id DESC
    LIMIT 250
  `).all(...params);
}

function loadOrderManagementDeliveries(db, companyId, openOnly = false) {
  const where = ["sd.company_id=?"];
  const params = [companyId];
  if (openOnly) where.push("UPPER(COALESCE(sd.status,'')) NOT IN ('LIVRATA','ANULATA')");
  return db.prepare(`
    SELECT sd.id, sd.delivery_number, sd.status, sd.order_id, sd.courier, sd.awb,
           COALESCE(cl.name, order_client.name) AS client_name,
           so.order_number
    FROM sales_deliveries sd
    LEFT JOIN sales_orders so ON so.id=sd.order_id AND so.company_id=sd.company_id
    LEFT JOIN clients cl ON cl.id=sd.client_id AND cl.company_id=sd.company_id
    LEFT JOIN clients order_client ON order_client.id=so.client_id AND order_client.company_id=so.company_id
    WHERE ${where.join(" AND ")}
    ORDER BY date(COALESCE(sd.scheduled_date, sd.created_at)) DESC, sd.id DESC
    LIMIT 250
  `).all(...params);
}

function loadOrderManagementWarehouses(db, companyId) {
  return db.prepare(`
    SELECT id, warehouse_code, name
    FROM inventory_warehouses
    WHERE company_id=? AND UPPER(COALESCE(status,'')) <> 'INACTIV'
    ORDER BY name COLLATE NOCASE ASC
  `).all(companyId);
}

export function registerSalesRoutes(app, { db, requireAuth, fmtMoney }) {
  app.get("/nexora/sales", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = {
      ...(db.prepare(`
        SELECT
          SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('ACCEPTED','REJECTED') THEN 1 ELSE 0 END) AS quotes_open
        FROM quotes
        WHERE company_id=?
      `).get(companyId) || {}),
      ...(db.prepare(`
        SELECT COUNT(*) AS orders_count, IFNULL(SUM(total),0) AS orders_amount
        FROM sales_orders
        WHERE company_id=?
      `).get(companyId) || {}),
      ...(db.prepare(`
        SELECT SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('LIVRATA','ANULATA') THEN 1 ELSE 0 END) AS deliveries_open
        FROM sales_deliveries
        WHERE company_id=?
      `).get(companyId) || {})
    };
    const recentOrders = db.prepare(`
      SELECT so.id, so.order_number, so.status, so.total, cl.name AS client_name
      FROM sales_orders so
      JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
      WHERE so.company_id=?
      ORDER BY so.id DESC
      LIMIT 8
    `).all(companyId);
    const recentDeliveries = db.prepare(`
      SELECT sd.id, sd.delivery_number, sd.status, sd.awb, cl.name AS client_name
      FROM sales_deliveries sd
      LEFT JOIN clients cl ON cl.id=sd.client_id AND cl.company_id=sd.company_id
      WHERE sd.company_id=?
      ORDER BY sd.id DESC
      LIMIT 8
    `).all(companyId);

    res.type("html").send(renderNexoraSalesHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      recentOrders,
      recentDeliveries,
      fmtMoney
    }));
  });

  app.get("/nexora/orders", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toUpperCase();
    const where = ["so.company_id=?"];
    const params = [companyId];
    if (status) {
      where.push("UPPER(COALESCE(so.status,''))=?");
      params.push(status);
    }
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(so.order_number,'')) LIKE ? OR LOWER(COALESCE(cl.name,'')) LIKE ? OR LOWER(COALESCE(cl.cui,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT so.id, so.order_number, so.status, so.order_date, so.due_date, so.total,
             cl.id AS client_id, cl.name AS client_name, cl.cui AS client_cui
      FROM sales_orders so
      JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(so.order_date, so.created_at)) DESC, so.id DESC
      LIMIT 250
    `).all(...params);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total_count,
             IFNULL(SUM(total),0) AS total_amount,
             SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('LIVRATA','ANULATA') THEN 1 ELSE 0 END) AS open_count,
             (SELECT COUNT(DISTINCT order_id) FROM sales_deliveries WHERE company_id=? AND order_id IS NOT NULL) AS delivery_count
      FROM sales_orders
      WHERE company_id=?
    `).get(companyId, companyId) || {};
    const quotes = db.prepare(`
      SELECT q.id, q.quote_number, q.total, cl.name AS client_name
      FROM quotes q
      JOIN clients cl ON cl.id=q.client_id AND cl.company_id=q.company_id
      WHERE q.company_id=? AND UPPER(COALESCE(q.status,'')) IN ('ACCEPTED','SENT','DRAFT')
      ORDER BY q.id DESC
      LIMIT 100
    `).all(companyId);

    res.type("html").send(renderNexoraSalesOrdersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      clients: loadClients(db, companyId),
      quotes,
      stats,
      filters: { q, status },
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/orders/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const clientId = Number(req.body?.client_id || 0);
    const quoteId = Number(req.body?.quote_id || 0) || null;
    const client = db.prepare(`SELECT id, address, phone FROM clients WHERE id=? AND company_id=?`).get(clientId, companyId);
    if (!client) return res.status(404).send("Clientul nu există.");

    const orderNumber = nextNumber(db, "sales_orders", "order_number", companyId, "SO");
    const result = db.prepare(`
      INSERT INTO sales_orders (
        company_id, order_number, client_id, quote_id, status, order_date, due_date,
        delivery_address, contact_name, contact_phone, currency, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, 'NOUA', ?, ?, ?, ?, ?, 'RON', ?, ?, datetime('now'))
    `).run(
      companyId,
      orderNumber,
      clientId,
      quoteId,
      String(req.body?.order_date || "").trim() || todayIso(),
      String(req.body?.due_date || "").trim() || null,
      String(req.body?.delivery_address || client.address || "").trim(),
      String(req.body?.contact_name || "").trim(),
      String(req.body?.contact_phone || client.phone || "").trim(),
      String(req.body?.notes || "").trim(),
      currentUserEmail(req)
    );

    const orderId = Number(result.lastInsertRowid);
    if (quoteId) {
      const quoteItems = db.prepare(`
        SELECT name, qty, unit, unit_price, line_total
        FROM quote_items
        WHERE quote_id=? AND company_id=?
        ORDER BY sort_order ASC, id ASC
      `).all(quoteId, companyId);
      const insertItem = db.prepare(`
        INSERT INTO sales_order_items (order_id, company_id, item_name, qty, unit, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of quoteItems) {
        insertItem.run(orderId, companyId, item.name, item.qty, item.unit, item.unit_price, item.line_total);
      }
      recalcOrderTotals(db, orderId, companyId);
    }

    res.redirect(`/nexora/orders/${orderId}?ok=created`);
  });

  app.get("/nexora/orders/lifecycle", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = db.prepare(`
      SELECT
        SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('LIVRATA','ANULATA') THEN 1 ELSE 0 END) AS open_orders,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='CONFIRMATA' THEN 1 ELSE 0 END) AS confirmed_orders,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='IN_LUCRU' THEN 1 ELSE 0 END) AS in_progress_orders,
        (SELECT COUNT(*) FROM order_lifecycle_events WHERE company_id=?) AS events_count
      FROM sales_orders
      WHERE company_id=?
    `).get(companyId, companyId) || {};
    const events = db.prepare(`
      SELECT ole.*, so.order_number, cl.name AS client_name
      FROM order_lifecycle_events ole
      JOIN sales_orders so ON so.id=ole.order_id AND so.company_id=ole.company_id
      JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
      WHERE ole.company_id=?
      ORDER BY datetime(COALESCE(ole.event_date, ole.created_at)) DESC, ole.id DESC
      LIMIT 250
    `).all(companyId);

    res.type("html").send(renderNexoraOrderLifecyclePage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      events,
      orders: loadOrderManagementOrders(db, companyId),
      ok: String(req.query?.ok || ""),
      err: String(req.query?.err || "")
    }));
  });

  app.post("/nexora/orders/lifecycle/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.body?.order_id || 0);
    const order = db.prepare(`SELECT id, status FROM sales_orders WHERE id=? AND company_id=?`).get(orderId, companyId);
    if (!order) return res.redirect("/nexora/orders/lifecycle?err=missing");
    const toStatus = normalizeStatus(req.body?.to_status, order.status || "NOUA");
    const allowed = new Set(["NOUA", "CONFIRMATA", "IN_LUCRU", "LIVRATA", "ANULATA", "BLOCAT"]);
    if (!allowed.has(toStatus)) return res.redirect("/nexora/orders/lifecycle?err=invalid");

    const eventNumber = nextNumber(db, "order_lifecycle_events", "event_number", companyId, "OLC");
    db.prepare(`
      INSERT INTO order_lifecycle_events (
        company_id, event_number, order_id, from_status, to_status, event_type, event_date, actor_email, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      eventNumber,
      orderId,
      order.status || "",
      toStatus,
      normalizeStatus(req.body?.event_type, "STATUS"),
      dateTimeInput(req.body?.event_date),
      currentUserEmail(req),
      String(req.body?.notes || "").trim()
    );
    db.prepare(`UPDATE sales_orders SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(toStatus, orderId, companyId);
    res.redirect("/nexora/orders/lifecycle?ok=created");
  });

  app.get("/nexora/orders/fulfillment", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='IN_LUCRU' THEN 1 ELSE 0 END) AS running_tasks,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='FINALIZAT' THEN 1 ELSE 0 END) AS done_tasks,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='BLOCAT' THEN 1 ELSE 0 END) AS blocked_tasks
      FROM order_fulfillment_tasks
      WHERE company_id=?
    `).get(companyId) || {};
    const tasks = db.prepare(`
      SELECT oft.*, so.order_number, sd.delivery_number, cl.name AS client_name, iw.name AS warehouse_name
      FROM order_fulfillment_tasks oft
      JOIN sales_orders so ON so.id=oft.order_id AND so.company_id=oft.company_id
      JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
      LEFT JOIN sales_deliveries sd ON sd.id=oft.delivery_id AND sd.company_id=oft.company_id
      LEFT JOIN inventory_warehouses iw ON iw.id=oft.warehouse_id AND iw.company_id=oft.company_id
      WHERE oft.company_id=?
      ORDER BY date(COALESCE(oft.planned_date, oft.created_at)) ASC, oft.id DESC
      LIMIT 250
    `).all(companyId);

    res.type("html").send(renderNexoraOrderFulfillmentPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      tasks,
      orders: loadOrderManagementOrders(db, companyId, true),
      deliveries: loadOrderManagementDeliveries(db, companyId, true),
      warehouses: loadOrderManagementWarehouses(db, companyId),
      ok: String(req.query?.ok || ""),
      err: String(req.query?.err || "")
    }));
  });

  app.post("/nexora/orders/fulfillment/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.body?.order_id || 0);
    const deliveryId = Number(req.body?.delivery_id || 0) || null;
    const warehouseId = Number(req.body?.warehouse_id || 0) || null;
    const order = db.prepare(`SELECT id FROM sales_orders WHERE id=? AND company_id=?`).get(orderId, companyId);
    if (!order) return res.redirect("/nexora/orders/fulfillment?err=missing");
    if (deliveryId) {
      const delivery = db.prepare(`SELECT id, order_id FROM sales_deliveries WHERE id=? AND company_id=?`).get(deliveryId, companyId);
      if (!delivery || (delivery.order_id && Number(delivery.order_id) !== orderId)) return res.redirect("/nexora/orders/fulfillment?err=invalid");
    }
    if (warehouseId) {
      const warehouse = db.prepare(`SELECT id FROM inventory_warehouses WHERE id=? AND company_id=?`).get(warehouseId, companyId);
      if (!warehouse) return res.redirect("/nexora/orders/fulfillment?err=invalid");
    }

    const taskNumber = nextNumber(db, "order_fulfillment_tasks", "task_number", companyId, "OF");
    db.prepare(`
      INSERT INTO order_fulfillment_tasks (
        company_id, task_number, order_id, delivery_id, task_type, warehouse_id, assigned_to,
        planned_date, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      taskNumber,
      orderId,
      deliveryId,
      normalizeStatus(req.body?.task_type, "PICKING"),
      warehouseId,
      String(req.body?.assigned_to || "").trim(),
      String(req.body?.planned_date || "").trim() || null,
      normalizeStatus(req.body?.status, "PLANIFICAT"),
      String(req.body?.notes || "").trim(),
      currentUserEmail(req)
    );
    res.redirect("/nexora/orders/fulfillment?ok=created");
  });

  app.post("/nexora/orders/fulfillment/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, "PLANIFICAT");
    const allowed = new Set(["PLANIFICAT", "IN_LUCRU", "FINALIZAT", "BLOCAT", "ANULAT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/orders/fulfillment?err=invalid");
    const result = db.prepare(`
      UPDATE order_fulfillment_tasks
      SET status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, id, companyId);
    res.redirect(`/nexora/orders/fulfillment?${result.changes ? "ok=status" : "err=missing"}`);
  });

  app.get("/nexora/orders/tracking", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS events_count,
        SUM(CASE WHEN TRIM(COALESCE(awb,'')) <> '' THEN 1 ELSE 0 END) AS awb_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='IN_TRANZIT' THEN 1 ELSE 0 END) AS in_transit_count,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('LIVRAT','LIVRATA') THEN 1 ELSE 0 END) AS delivered_count
      FROM order_tracking_events
      WHERE company_id=?
    `).get(companyId) || {};
    const events = db.prepare(`
      SELECT ote.*, so.order_number, sd.delivery_number,
             COALESCE(delivery_client.name, order_client.name) AS client_name
      FROM order_tracking_events ote
      LEFT JOIN sales_orders so ON so.id=ote.order_id AND so.company_id=ote.company_id
      LEFT JOIN sales_deliveries sd ON sd.id=ote.delivery_id AND sd.company_id=ote.company_id
      LEFT JOIN clients order_client ON order_client.id=so.client_id AND order_client.company_id=so.company_id
      LEFT JOIN clients delivery_client ON delivery_client.id=sd.client_id AND delivery_client.company_id=sd.company_id
      WHERE ote.company_id=?
      ORDER BY datetime(COALESCE(ote.event_date, ote.created_at)) DESC, ote.id DESC
      LIMIT 250
    `).all(companyId);

    res.type("html").send(renderNexoraOrderTrackingPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      events,
      orders: loadOrderManagementOrders(db, companyId),
      deliveries: loadOrderManagementDeliveries(db, companyId),
      ok: String(req.query?.ok || ""),
      err: String(req.query?.err || "")
    }));
  });

  app.post("/nexora/orders/tracking/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const deliveryId = Number(req.body?.delivery_id || 0) || null;
    let orderId = Number(req.body?.order_id || 0) || null;
    const delivery = deliveryId
      ? db.prepare(`SELECT id, order_id FROM sales_deliveries WHERE id=? AND company_id=?`).get(deliveryId, companyId)
      : null;
    if (deliveryId && !delivery) return res.redirect("/nexora/orders/tracking?err=missing");
    if (!orderId && delivery?.order_id) orderId = Number(delivery.order_id);
    if (orderId) {
      const order = db.prepare(`SELECT id FROM sales_orders WHERE id=? AND company_id=?`).get(orderId, companyId);
      if (!order) return res.redirect("/nexora/orders/tracking?err=missing");
    }
    if (!orderId && !deliveryId) return res.redirect("/nexora/orders/tracking?err=required");

    const status = normalizeStatus(req.body?.status, "PREGATITA");
    const courier = String(req.body?.courier || "").trim();
    const awb = String(req.body?.awb || "").trim();
    const eventDate = dateTimeInput(req.body?.event_date);
    const trackingNumber = nextNumber(db, "order_tracking_events", "tracking_number", companyId, "OTR");
    db.prepare(`
      INSERT INTO order_tracking_events (
        company_id, tracking_number, order_id, delivery_id, event_type, event_date,
        location, courier, awb, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      trackingNumber,
      orderId,
      deliveryId,
      normalizeStatus(req.body?.event_type, "STATUS"),
      eventDate,
      String(req.body?.location || "").trim(),
      courier,
      awb,
      status,
      String(req.body?.notes || "").trim(),
      currentUserEmail(req)
    );

    if (deliveryId) {
      db.prepare(`
        UPDATE sales_deliveries
        SET status=?,
            courier=CASE WHEN ? <> '' THEN ? ELSE courier END,
            awb=CASE WHEN ? <> '' THEN ? ELSE awb END,
            delivered_at=CASE WHEN ? IN ('LIVRAT','LIVRATA') THEN COALESCE(delivered_at, date(?)) ELSE delivered_at END,
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(status, courier, courier, awb, awb, status, eventDate, deliveryId, companyId);
    }
    if (orderId && ["LIVRAT", "LIVRATA"].includes(status)) {
      db.prepare(`UPDATE sales_orders SET status='LIVRATA', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(orderId, companyId);
    }

    res.redirect("/nexora/orders/tracking?ok=created");
  });

  app.get("/nexora/orders/delivery-status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_deliveries,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('LIVRATA','ANULATA') THEN 1 ELSE 0 END) AS open_deliveries,
        SUM(CASE WHEN TRIM(COALESCE(awb,'')) <> '' THEN 1 ELSE 0 END) AS awb_deliveries,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='LIVRATA' THEN 1 ELSE 0 END) AS done_deliveries
      FROM sales_deliveries
      WHERE company_id=?
    `).get(companyId) || {};
    const rows = db.prepare(`
      SELECT sd.id, sd.delivery_number, sd.status, sd.scheduled_date, sd.delivered_at, sd.courier, sd.awb,
             sd.order_id, so.order_number, COALESCE(cl.name, order_client.name) AS client_name,
             (SELECT COUNT(*) FROM sales_delivery_items sdi WHERE sdi.company_id=sd.company_id AND sdi.delivery_id=sd.id) AS items_count,
             (SELECT ote.status FROM order_tracking_events ote WHERE ote.company_id=sd.company_id AND ote.delivery_id=sd.id ORDER BY datetime(COALESCE(ote.event_date, ote.created_at)) DESC, ote.id DESC LIMIT 1) AS last_tracking_status,
             (SELECT ote.event_date FROM order_tracking_events ote WHERE ote.company_id=sd.company_id AND ote.delivery_id=sd.id ORDER BY datetime(COALESCE(ote.event_date, ote.created_at)) DESC, ote.id DESC LIMIT 1) AS last_tracking_date
      FROM sales_deliveries sd
      LEFT JOIN sales_orders so ON so.id=sd.order_id AND so.company_id=sd.company_id
      LEFT JOIN clients cl ON cl.id=sd.client_id AND cl.company_id=sd.company_id
      LEFT JOIN clients order_client ON order_client.id=so.client_id AND order_client.company_id=so.company_id
      WHERE sd.company_id=?
      ORDER BY
        CASE WHEN UPPER(COALESCE(sd.status,'')) IN ('LIVRATA','ANULATA') THEN 1 ELSE 0 END,
        date(COALESCE(sd.scheduled_date, sd.created_at)) ASC,
        sd.id DESC
      LIMIT 250
    `).all(companyId);

    res.type("html").send(renderNexoraOrderDeliveryStatusPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats,
      rows,
      ok: String(req.query?.ok || ""),
      err: String(req.query?.err || "")
    }));
  });

  app.post("/nexora/orders/delivery-status/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const deliveryId = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, "PREGATITA");
    const allowed = new Set(["PREGATITA", "PREDAT_CURIER", "IN_TRANZIT", "LIVRATA", "INTARZIATA", "ANULATA"]);
    if (!allowed.has(status)) return res.redirect("/nexora/orders/delivery-status?err=invalid");
    const delivery = db.prepare(`SELECT id, order_id FROM sales_deliveries WHERE id=? AND company_id=?`).get(deliveryId, companyId);
    if (!delivery) return res.redirect("/nexora/orders/delivery-status?err=missing");

    const courier = String(req.body?.courier || "").trim();
    const awb = String(req.body?.awb || "").trim();
    db.prepare(`
      UPDATE sales_deliveries
      SET status=?,
          courier=?,
          awb=?,
          delivered_at=CASE WHEN ?='LIVRATA' THEN COALESCE(delivered_at, date('now')) ELSE delivered_at END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, courier, awb, status, deliveryId, companyId);

    const trackingNumber = nextNumber(db, "order_tracking_events", "tracking_number", companyId, "OTR");
    db.prepare(`
      INSERT INTO order_tracking_events (
        company_id, tracking_number, order_id, delivery_id, event_type, event_date,
        courier, awb, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, 'STATUS_LIVRARE', datetime('now'), ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      trackingNumber,
      delivery.order_id || null,
      deliveryId,
      courier,
      awb,
      status,
      "Status actualizat din Order Management.",
      currentUserEmail(req)
    );

    if (delivery.order_id && status === "LIVRATA") {
      db.prepare(`UPDATE sales_orders SET status='LIVRATA', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(delivery.order_id, companyId);
    }
    res.redirect("/nexora/orders/delivery-status?ok=status");
  });

  app.get("/nexora/orders/:id", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id || 0);
    const order = db.prepare(`
      SELECT so.*, cl.name AS client_name, cl.cui AS client_cui, cl.address AS client_address
      FROM sales_orders so
      JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
      WHERE so.id=? AND so.company_id=?
    `).get(id, companyId);
    if (!order) return res.status(404).send("Comanda nu există.");
    const items = db.prepare(`
      SELECT *
      FROM sales_order_items
      WHERE order_id=? AND company_id=?
      ORDER BY id ASC
    `).all(id, companyId);
    const deliveries = db.prepare(`
      SELECT id, delivery_number, status, scheduled_date, courier, awb
      FROM sales_deliveries
      WHERE order_id=? AND company_id=?
      ORDER BY id DESC
    `).all(id, companyId);

    res.type("html").send(renderNexoraSalesOrderDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      order,
      items,
      deliveries,
      products: loadProducts(db, companyId),
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/orders/:id/items", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.params.id || 0);
    const order = db.prepare(`SELECT id FROM sales_orders WHERE id=? AND company_id=?`).get(orderId, companyId);
    if (!order) return res.status(404).send("Comanda nu există.");
    const productId = Number(req.body?.product_id || 0) || null;
    const product = productId ? db.prepare(`SELECT id, code, name, unit, price FROM products WHERE id=? AND company_id=?`).get(productId, companyId) : null;
    const qty = Math.max(0, moneyInput(req.body?.qty || 1));
    const unitPrice = moneyInput(req.body?.unit_price || product?.price || 0);
    const discountPercent = Math.max(0, moneyInput(req.body?.discount_percent || 0));
    const lineTotal = Math.max(0, qty * unitPrice * (1 - discountPercent / 100));
    const itemName = String(req.body?.item_name || product?.name || "").trim();
    if (!itemName) return res.status(400).send("Completează denumirea poziției.");

    db.prepare(`
      INSERT INTO sales_order_items (
        order_id, company_id, product_id, item_name, sku, qty, unit, unit_price, discount_percent, line_total, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      companyId,
      product?.id || null,
      itemName,
      product?.code || null,
      qty,
      String(req.body?.unit || product?.unit || "buc").trim(),
      unitPrice,
      discountPercent,
      lineTotal,
      String(req.body?.notes || "").trim()
    );
    recalcOrderTotals(db, orderId, companyId);
    res.redirect(`/nexora/orders/${orderId}?ok=item_added`);
  });

  app.post("/nexora/orders/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, "NOUA");
    const allowed = new Set(["NOUA", "CONFIRMATA", "IN_LUCRU", "LIVRATA", "ANULATA"]);
    if (!allowed.has(status)) return res.status(400).send("Status invalid.");
    db.prepare(`UPDATE sales_orders SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?`).run(status, orderId, companyId);
    res.redirect(`/nexora/orders/${orderId}?ok=status`);
  });

  app.get("/nexora/sales/prices", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const lists = db.prepare(`
      SELECT pl.*, COUNT(pi.id) AS items_count
      FROM sales_price_lists pl
      LEFT JOIN sales_price_items pi ON pi.price_list_id=pl.id AND pi.company_id=pl.company_id
      WHERE pl.company_id=?
      GROUP BY pl.id
      ORDER BY pl.id DESC
      LIMIT 100
    `).all(companyId);
    const items = db.prepare(`
      SELECT pi.*, pl.name AS list_name
      FROM sales_price_items pi
      JOIN sales_price_lists pl ON pl.id=pi.price_list_id AND pl.company_id=pi.company_id
      WHERE pi.company_id=?
      ORDER BY pi.id DESC
      LIMIT 250
    `).all(companyId);
    res.type("html").send(renderNexoraSalesPricesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      lists,
      items,
      products: loadProducts(db, companyId),
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/sales/prices/lists/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    db.prepare(`
      INSERT INTO sales_price_lists (company_id, name, currency, valid_from, valid_to, status, notes, created_by_email, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.name || "").trim(),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      String(req.body?.valid_from || "").trim() || null,
      String(req.body?.valid_to || "").trim() || null,
      normalizeStatus(req.body?.status, "ACTIVA"),
      String(req.body?.notes || "").trim(),
      currentUserEmail(req)
    );
    res.redirect("/nexora/sales/prices?ok=list_created");
  });

  app.post("/nexora/sales/prices/items/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const priceListId = Number(req.body?.price_list_id || 0);
    const productId = Number(req.body?.product_id || 0);
    const list = db.prepare(`SELECT id FROM sales_price_lists WHERE id=? AND company_id=?`).get(priceListId, companyId);
    const product = db.prepare(`SELECT id, name, unit, price FROM products WHERE id=? AND company_id=?`).get(productId, companyId);
    if (!list || !product) return res.status(404).send("Lista sau produsul nu există.");
    const salePrice = moneyInput(req.body?.sale_price);
    const basePrice = Number(product.price || 0);
    const margin = salePrice > 0 ? ((salePrice - basePrice) / salePrice) * 100 : 0;
    db.prepare(`
      INSERT INTO sales_price_items (
        price_list_id, company_id, product_id, product_name, unit, base_price, sale_price, min_qty, margin_percent, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      priceListId,
      companyId,
      product.id,
      product.name,
      product.unit || "buc",
      basePrice,
      salePrice,
      Math.max(1, moneyInput(req.body?.min_qty || 1)),
      margin,
      String(req.body?.notes || "").trim()
    );
    res.redirect("/nexora/sales/prices?ok=item_created");
  });

  app.get("/nexora/sales/discounts", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT *
      FROM sales_discounts
      WHERE company_id=?
      ORDER BY
        CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 0 ELSE 1 END,
        date(COALESCE(valid_to, created_at)) DESC,
        id DESC
      LIMIT 250
    `).all(companyId);
    res.type("html").send(renderNexoraSalesDiscountsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      fmtMoney,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/sales/discounts/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    db.prepare(`
      INSERT INTO sales_discounts (
        company_id, name, discount_type, discount_value, target_type, target_ref,
        valid_from, valid_to, status, combinable, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.name || "").trim(),
      normalizeStatus(req.body?.discount_type, "PROCENT"),
      moneyInput(req.body?.discount_value),
      normalizeStatus(req.body?.target_type, "GLOBAL"),
      String(req.body?.target_ref || "").trim(),
      String(req.body?.valid_from || "").trim() || null,
      String(req.body?.valid_to || "").trim() || null,
      normalizeStatus(req.body?.status, "ACTIV"),
      req.body?.combinable ? 1 : 0,
      String(req.body?.notes || "").trim(),
      currentUserEmail(req)
    );
    res.redirect("/nexora/sales/discounts?ok=created");
  });

  app.get("/nexora/deliveries", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toUpperCase();
    const orderId = Number(req.query?.order_id || 0);
    const where = ["sd.company_id=?"];
    const params = [companyId];
    if (status) {
      where.push("UPPER(COALESCE(sd.status,''))=?");
      params.push(status);
    }
    if (orderId) {
      where.push("sd.order_id=?");
      params.push(orderId);
    }
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(sd.delivery_number,'')) LIKE ? OR LOWER(COALESCE(so.order_number,'')) LIKE ? OR LOWER(COALESCE(cl.name,'')) LIKE ? OR LOWER(COALESCE(sd.awb,'')) LIKE ?)");
      params.push(like, like, like, like);
    }
    const rows = db.prepare(`
      SELECT sd.id, sd.delivery_number, sd.status, sd.scheduled_date, sd.courier, sd.awb,
             so.order_number, cl.name AS client_name
      FROM sales_deliveries sd
      LEFT JOIN sales_orders so ON so.id=sd.order_id AND so.company_id=sd.company_id
      LEFT JOIN clients cl ON cl.id=sd.client_id AND cl.company_id=sd.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(sd.scheduled_date, sd.created_at)) DESC, sd.id DESC
      LIMIT 250
    `).all(...params);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('LIVRATA','ANULATA') THEN 1 ELSE 0 END) AS open_count,
             SUM(CASE WHEN UPPER(COALESCE(status,''))='LIVRATA' THEN 1 ELSE 0 END) AS done_count,
             SUM(CASE WHEN TRIM(COALESCE(awb,'')) <> '' THEN 1 ELSE 0 END) AS awb_count
      FROM sales_deliveries
      WHERE company_id=?
    `).get(companyId) || {};
    const orders = db.prepare(`
      SELECT so.id, so.order_number, so.total, cl.name AS client_name
      FROM sales_orders so
      JOIN clients cl ON cl.id=so.client_id AND cl.company_id=so.company_id
      WHERE so.company_id=? AND UPPER(COALESCE(so.status,'')) NOT IN ('LIVRATA','ANULATA')
      ORDER BY so.id DESC
      LIMIT 150
    `).all(companyId);

    res.type("html").send(renderNexoraSalesDeliveriesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      orders,
      clients: loadClients(db, companyId),
      stats,
      filters: { q, status },
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/deliveries/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderId = Number(req.body?.order_id || 0) || null;
    const order = orderId ? db.prepare(`SELECT * FROM sales_orders WHERE id=? AND company_id=?`).get(orderId, companyId) : null;
    const clientId = order?.client_id || Number(req.body?.client_id || 0) || null;
    if (!clientId) return res.status(400).send("Alege client sau comandă.");
    const client = db.prepare(`SELECT id, address, phone FROM clients WHERE id=? AND company_id=?`).get(clientId, companyId);
    if (!client) return res.status(404).send("Clientul nu există.");
    const deliveryNumber = nextNumber(db, "sales_deliveries", "delivery_number", companyId, "DLV");
    const result = db.prepare(`
      INSERT INTO sales_deliveries (
        company_id, delivery_number, order_id, client_id, status, scheduled_date, courier, awb,
        delivery_address, contact_name, contact_phone, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      deliveryNumber,
      orderId,
      clientId,
      normalizeStatus(req.body?.status, "PREGATITA"),
      String(req.body?.scheduled_date || "").trim() || null,
      String(req.body?.courier || "").trim(),
      String(req.body?.awb || "").trim(),
      String(req.body?.delivery_address || order?.delivery_address || client.address || "").trim(),
      String(req.body?.contact_name || order?.contact_name || "").trim(),
      String(req.body?.contact_phone || order?.contact_phone || client.phone || "").trim(),
      String(req.body?.notes || "").trim(),
      currentUserEmail(req)
    );
    res.redirect(`/nexora/deliveries/${Number(result.lastInsertRowid)}?ok=created`);
  });

  app.get("/nexora/deliveries/:id", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const deliveryId = Number(req.params.id || 0);
    const delivery = db.prepare(`
      SELECT sd.*, so.order_number, cl.name AS client_name
      FROM sales_deliveries sd
      LEFT JOIN sales_orders so ON so.id=sd.order_id AND so.company_id=sd.company_id
      LEFT JOIN clients cl ON cl.id=sd.client_id AND cl.company_id=sd.company_id
      WHERE sd.id=? AND sd.company_id=?
    `).get(deliveryId, companyId);
    if (!delivery) return res.status(404).send("Livrarea nu există.");
    const items = db.prepare(`
      SELECT *
      FROM sales_delivery_items
      WHERE delivery_id=? AND company_id=?
      ORDER BY id ASC
    `).all(deliveryId, companyId);
    const orderItems = delivery.order_id
      ? db.prepare(`
          SELECT id, item_name, qty, unit, product_id
          FROM sales_order_items
          WHERE order_id=? AND company_id=?
          ORDER BY id ASC
        `).all(delivery.order_id, companyId)
      : [];

    res.type("html").send(renderNexoraSalesDeliveryDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      delivery,
      items,
      orderItems,
      ok: String(req.query?.ok || "")
    }));
  });

  app.post("/nexora/deliveries/:id/update", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const deliveryId = Number(req.params.id || 0);
    const status = normalizeStatus(req.body?.status, "PREGATITA");
    db.prepare(`
      UPDATE sales_deliveries
      SET status=?, scheduled_date=?, delivered_at=?, courier=?, awb=?, delivery_address=?, notes=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      status,
      String(req.body?.scheduled_date || "").trim() || null,
      String(req.body?.delivered_at || "").trim() || null,
      String(req.body?.courier || "").trim(),
      String(req.body?.awb || "").trim(),
      String(req.body?.delivery_address || "").trim(),
      String(req.body?.notes || "").trim(),
      deliveryId,
      companyId
    );
    res.redirect(`/nexora/deliveries/${deliveryId}?ok=updated`);
  });

  app.post("/nexora/deliveries/:id/items", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const deliveryId = Number(req.params.id || 0);
    const delivery = db.prepare(`SELECT id, order_id FROM sales_deliveries WHERE id=? AND company_id=?`).get(deliveryId, companyId);
    if (!delivery) return res.status(404).send("Livrarea nu există.");
    const orderItemId = Number(req.body?.order_item_id || 0) || null;
    const orderItem = orderItemId ? db.prepare(`SELECT * FROM sales_order_items WHERE id=? AND company_id=?`).get(orderItemId, companyId) : null;
    const itemName = String(req.body?.item_name || orderItem?.item_name || "").trim();
    if (!itemName) return res.status(400).send("Completează denumirea poziției.");
    db.prepare(`
      INSERT INTO sales_delivery_items (
        delivery_id, company_id, order_item_id, product_id, item_name, qty, unit, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      companyId,
      orderItem?.id || null,
      orderItem?.product_id || null,
      itemName,
      moneyInput(req.body?.qty || orderItem?.qty || 1),
      String(req.body?.unit || orderItem?.unit || "buc").trim(),
      String(req.body?.notes || "").trim()
    );
    res.redirect(`/nexora/deliveries/${deliveryId}?ok=item_added`);
  });
}
