import {
  renderNexoraHorecaHubPage,
  renderNexoraHorecaMenuPage,
  renderNexoraHorecaOperationalPage,
  renderNexoraHorecaOrdersPage,
  renderNexoraHorecaReportsPage,
  renderNexoraHorecaReservationsPage,
  renderNexoraHorecaTablesPage
} from "../src/ui/nexora-horeca-pages.js";

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

function money(value, currency = "RON") {
  return `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function parseTime(value) {
  const normalized = safeText(value);
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : "";
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
  return normalized || "HORECA";
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    horeca_tables: "table_code",
    horeca_reservations: "reservation_number",
    horeca_menu_items: "item_code",
    horeca_orders: "order_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported Horeca sequence");
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

function loadTables(db, companyId) {
  return db.prepare(`
    SELECT
      t.*,
      COUNT(o.id) AS open_orders
    FROM horeca_tables t
    LEFT JOIN horeca_orders o ON o.table_id=t.id
      AND o.company_id=t.company_id
      AND UPPER(COALESCE(o.status,'')) NOT IN ('ACHITATA','ANULATA')
    WHERE t.company_id=?
    GROUP BY t.id
    ORDER BY t.area COLLATE NOCASE ASC, t.table_code COLLATE NOCASE ASC
    LIMIT 300
  `).all(companyId);
}

function loadReservations(db, companyId, upcomingOnly = false) {
  const dateFilter = upcomingOnly ? "AND r.reservation_date >= date('now')" : "";
  return db.prepare(`
    SELECT r.*, t.table_code, t.area
    FROM horeca_reservations r
    LEFT JOIN horeca_tables t ON t.id=r.table_id AND t.company_id=r.company_id
    WHERE r.company_id=? ${dateFilter}
    ORDER BY r.reservation_date ASC, r.reservation_time ASC, r.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadMenuItems(db, companyId, activeOnly = false) {
  const activeFilter = activeOnly ? "AND UPPER(COALESCE(status,''))='ACTIV'" : "";
  return db.prepare(`
    SELECT *
    FROM horeca_menu_items
    WHERE company_id=? ${activeFilter}
    ORDER BY category COLLATE NOCASE ASC, name COLLATE NOCASE ASC
    LIMIT 500
  `).all(companyId);
}

function loadOrders(db, companyId, openOnly = false) {
  const openFilter = openOnly ? "AND UPPER(COALESCE(o.status,'')) NOT IN ('ACHITATA','ANULATA')" : "";
  return db.prepare(`
    SELECT
      o.*,
      t.table_code,
      t.area,
      COUNT(i.id) AS items_count
    FROM horeca_orders o
    LEFT JOIN horeca_tables t ON t.id=o.table_id AND t.company_id=o.company_id
    LEFT JOIN horeca_order_items i ON i.order_id=o.id AND i.company_id=o.company_id
    WHERE o.company_id=? ${openFilter}
    GROUP BY o.id
    ORDER BY o.id DESC
    LIMIT 300
  `).all(companyId);
}

function loadOrderItems(db, companyId) {
  return db.prepare(`
    SELECT i.*, o.order_number, o.channel, t.table_code, m.category
    FROM horeca_order_items i
    JOIN horeca_orders o ON o.id=i.order_id AND o.company_id=i.company_id
    LEFT JOIN horeca_tables t ON t.id=o.table_id AND t.company_id=o.company_id
    LEFT JOIN horeca_menu_items m ON m.id=i.menu_item_id AND m.company_id=i.company_id
    WHERE i.company_id=?
    ORDER BY i.id DESC
    LIMIT 500
  `).all(companyId);
}

function getMenuItem(db, companyId, itemId) {
  if (!Number(itemId)) return null;
  return db.prepare("SELECT * FROM horeca_menu_items WHERE id=? AND company_id=?").get(Number(itemId), companyId) || null;
}

function getOrder(db, companyId, orderId) {
  if (!Number(orderId)) return null;
  return db.prepare("SELECT * FROM horeca_orders WHERE id=? AND company_id=?").get(Number(orderId), companyId) || null;
}

function recalcOrderTotals(db, companyId, orderId) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(line_subtotal),0) AS subtotal,
      COALESCE(SUM(line_vat),0) AS vat_amount,
      COALESCE(SUM(line_total),0) AS total
    FROM horeca_order_items
    WHERE company_id=? AND order_id=?
  `).get(companyId, orderId) || {};
  db.prepare(`
    UPDATE horeca_orders
    SET subtotal=?,
        vat_amount=?,
        total=?,
        updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    Number(totals.subtotal || 0),
    Number(totals.vat_amount || 0),
    Number(totals.total || 0),
    orderId,
    companyId
  );
}

function dashboardStats(db, companyId) {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM horeca_tables WHERE company_id=? AND UPPER(COALESCE(status,''))='LIBERA') AS freeTables,
      (SELECT COUNT(*) FROM horeca_reservations WHERE company_id=? AND reservation_date=date('now') AND UPPER(COALESCE(status,'')) <> 'ANULATA') AS todayReservations,
      (SELECT COUNT(*) FROM horeca_orders WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('ACHITATA','ANULATA')) AS openOrders,
      (SELECT COALESCE(SUM(total),0) FROM horeca_orders WHERE company_id=? AND date(opened_at)=date('now') AND UPPER(COALESCE(status,'')) <> 'ANULATA') AS todaySales
  `).get(companyId, companyId, companyId, companyId) || {};
  return row;
}

function reportsStats(db, companyId) {
  const base = dashboardStats(db, companyId);
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM horeca_order_items WHERE company_id=? AND UPPER(COALESCE(kitchen_status,'')) IN ('SERVIT','GATA')) AS servedItems,
      (SELECT COUNT(*) FROM horeca_tables WHERE company_id=?) AS totalTables,
      (SELECT COUNT(*) FROM horeca_tables WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('OCUPATA','REZERVATA')) AS occupiedTables,
      (SELECT COUNT(*) FROM horeca_orders WHERE company_id=? AND date(opened_at)=date('now') AND UPPER(COALESCE(status,'')) <> 'ANULATA') AS tickets
  `).get(companyId, companyId, companyId, companyId) || {};
  const totalTables = Number(totals.totalTables || 0);
  const occupiedTables = Number(totals.occupiedTables || 0);
  const tickets = Number(totals.tickets || 0);
  return {
    ...base,
    servedItems: Number(totals.servedItems || 0),
    occupiedRate: totalTables ? Math.round((occupiedTables / totalTables) * 100) : 0,
    avgTicket: tickets ? Number(base.todaySales || 0) / tickets : 0
  };
}

function topMenuItems(db, companyId) {
  return db.prepare(`
    SELECT
      i.item_name,
      COALESCE(m.category, '-') AS category,
      COALESCE(SUM(i.quantity),0) AS qty,
      COALESCE(SUM(i.line_total),0) AS total
    FROM horeca_order_items i
    LEFT JOIN horeca_menu_items m ON m.id=i.menu_item_id AND m.company_id=i.company_id
    WHERE i.company_id=?
    GROUP BY i.item_name, m.category
    ORDER BY total DESC
    LIMIT 20
  `).all(companyId);
}

function loadKitchenStock(db, companyId) {
  return db.prepare(`
    SELECT
      s.item_code,
      s.item_name,
      s.quantity,
      s.unit,
      s.minimum_quantity,
      s.status,
      w.name AS warehouse_name
    FROM inventory_stock_items s
    LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id AND w.company_id=s.company_id
    WHERE s.company_id=?
      AND (
        lower(COALESCE(w.name,'')) LIKE '%bucatar%'
        OR lower(COALESCE(w.name,'')) LIKE '%bucăt%'
        OR lower(COALESCE(w.name,'')) LIKE '%bar%'
        OR lower(COALESCE(s.item_name,'')) LIKE '%ingredient%'
      )
    ORDER BY w.name COLLATE NOCASE ASC, s.item_name COLLATE NOCASE ASC
    LIMIT 300
  `).all(companyId);
}

function loadOrderChecks(db, companyId, channel = "") {
  const channelFilter = channel ? "AND UPPER(COALESCE(o.channel,''))=?" : "";
  const params = channel ? [companyId, channel] : [companyId];
  return db.prepare(`
    SELECT
      o.*,
      t.table_code,
      t.area,
      COUNT(i.id) AS items_count
    FROM horeca_orders o
    LEFT JOIN horeca_tables t ON t.id=o.table_id AND t.company_id=o.company_id
    LEFT JOIN horeca_order_items i ON i.order_id=o.id AND i.company_id=o.company_id
    WHERE o.company_id=? ${channelFilter}
    GROUP BY o.id
    ORDER BY o.id DESC
    LIMIT 300
  `).all(...params);
}

export function registerHorecaRoutes(app, { db, requireAuth }) {
  app.get("/nexora/horeca", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: dashboardStats(db, companyId),
      orders: loadOrders(db, companyId, true).slice(0, 8),
      reservations: loadReservations(db, companyId, true).slice(0, 8),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/horeca/tables", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaTablesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadTables(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/horeca/tables/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const tableCode = safeText(req.body?.table_code) || nextNumber(db, companyId, "horeca_tables", "table_code", "M");
    db.prepare(`
      INSERT INTO horeca_tables (company_id, table_code, area, seats, status, notes, created_by_email, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      tableCode,
      safeText(req.body?.area) || "Sală",
      Math.max(1, Math.round(parseNumber(req.body?.seats, 2))),
      safeText(req.body?.status) || "LIBERA",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/horeca/tables?ok=created");
  });

  app.post("/nexora/horeca/tables/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["LIBERA", "OCUPATA", "REZERVATA", "INDISPONIBILA"]);
    if (!allowed.has(status)) return res.redirect("/nexora/horeca/tables?err=invalid");
    db.prepare("UPDATE horeca_tables SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/horeca/tables?ok=status");
  });

  app.get("/nexora/horeca/reservations", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaReservationsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadReservations(db, companyId),
      tables: loadTables(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/horeca/reservations/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const clientName = safeText(req.body?.client_name);
    if (!clientName) return res.redirect("/nexora/horeca/reservations?err=required");
    const reservationNumber = nextNumber(db, companyId, "horeca_reservations", "reservation_number", "RSV");
    db.prepare(`
      INSERT INTO horeca_reservations (
        company_id, reservation_number, table_id, client_name, phone, guest_count,
        reservation_date, reservation_time, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      reservationNumber,
      Number(req.body?.table_id || 0) || null,
      clientName,
      safeText(req.body?.phone),
      Math.max(1, Math.round(parseNumber(req.body?.guest_count, 2))),
      parseDate(req.body?.reservation_date) || todayIso(),
      parseTime(req.body?.reservation_time),
      safeText(req.body?.status) || "CONFIRMATA",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    if (Number(req.body?.table_id || 0)) {
      db.prepare("UPDATE horeca_tables SET status='REZERVATA', updated_at=datetime('now') WHERE id=? AND company_id=?").run(Number(req.body.table_id), companyId);
    }
    return res.redirect("/nexora/horeca/reservations?ok=created");
  });

  app.post("/nexora/horeca/reservations/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["CONFIRMATA", "IN_ASTEPTARE", "FINALIZATA", "ANULATA"]);
    if (!allowed.has(status)) return res.redirect("/nexora/horeca/reservations?err=invalid");
    db.prepare("UPDATE horeca_reservations SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/horeca/reservations?ok=status");
  });

  app.get("/nexora/horeca/menu", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaMenuPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadMenuItems(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/horeca/menu/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/horeca/menu?err=required");
    const itemCode = safeText(req.body?.item_code) || `${slugCode(name).slice(0, 10)}-${nextNumber(db, companyId, "horeca_menu_items", "item_code", "HMI").split("-").pop()}`;
    db.prepare(`
      INSERT INTO horeca_menu_items (
        company_id, item_code, name, category, course_type, price, vat_percent,
        recipe_notes, allergen_notes, stock_policy, status, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      itemCode,
      name,
      safeText(req.body?.category) || "Meniu",
      safeText(req.body?.course_type) || "Preparat",
      Math.max(0, parseNumber(req.body?.price, 0)),
      Math.max(0, parseNumber(req.body?.vat_percent, 9)),
      safeText(req.body?.recipe_notes),
      safeText(req.body?.allergen_notes),
      safeText(req.body?.stock_policy) || "CONSUM_RETETA",
      safeText(req.body?.status) || "ACTIV",
      currentUserEmail(req)
    );
    return res.redirect("/nexora/horeca/menu?ok=created");
  });

  app.get("/nexora/horeca/orders", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaOrdersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      orders: loadOrders(db, companyId),
      orderItems: loadOrderItems(db, companyId),
      tables: loadTables(db, companyId),
      menuItems: loadMenuItems(db, companyId, true),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/horeca/pos", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaOrdersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "POS vânzare rapidă",
      activePath: "/nexora/horeca/pos",
      intro: "Deschide rapid comandă, adaugă produse din meniu și marchează plata cash/card.",
      orders: loadOrders(db, companyId),
      orderItems: loadOrderItems(db, companyId),
      tables: loadTables(db, companyId),
      menuItems: loadMenuItems(db, companyId, true),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/horeca/takeaway", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaOrdersPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Livrări / Takeaway",
      activePath: "/nexora/horeca/takeaway",
      intro: "Comenzi pe canale takeaway, delivery și room service, cu același flux de preparare.",
      orders: loadOrders(db, companyId),
      orderItems: loadOrderItems(db, companyId),
      tables: loadTables(db, companyId),
      menuItems: loadMenuItems(db, companyId, true),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/horeca/recipes", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaMenuPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Rețetare",
      activePath: "/nexora/horeca/recipes",
      intro: "Ingrediente, alergeni și regula de scădere din stoc pentru fiecare preparat.",
      rows: loadMenuItems(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/horeca/orders/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const orderNumber = nextNumber(db, companyId, "horeca_orders", "order_number", "HCO");
    const tableId = Number(req.body?.table_id || 0) || null;
    db.prepare(`
      INSERT INTO horeca_orders (
        company_id, order_number, table_id, channel, waiter_name, status,
        payment_method, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'DESCHISA', ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      orderNumber,
      tableId,
      safeText(req.body?.channel) || "SALA",
      safeText(req.body?.waiter_name),
      safeText(req.body?.payment_method),
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    if (tableId) {
      db.prepare("UPDATE horeca_tables SET status='OCUPATA', updated_at=datetime('now') WHERE id=? AND company_id=?").run(tableId, companyId);
    }
    return res.redirect("/nexora/horeca/orders?ok=created");
  });

  app.post("/nexora/horeca/order-items/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const order = getOrder(db, companyId, Number(req.body?.order_id || 0));
    const item = getMenuItem(db, companyId, Number(req.body?.menu_item_id || 0));
    if (!order || !item) return res.redirect("/nexora/horeca/orders?err=missing");
    const quantity = Math.max(0.01, parseNumber(req.body?.quantity, 1));
    const gross = Math.round(Number(item.price || 0) * quantity * 100) / 100;
    const vatRate = Number(item.vat_percent || 0) / 100;
    const lineSubtotal = vatRate > 0 ? Math.round((gross / (1 + vatRate)) * 100) / 100 : gross;
    const lineVat = Math.round((gross - lineSubtotal) * 100) / 100;
    db.prepare(`
      INSERT INTO horeca_order_items (
        company_id, order_id, menu_item_id, item_name, quantity, unit_price,
        vat_percent, line_subtotal, line_vat, line_total, kitchen_status, notes,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOU', ?, datetime('now'))
    `).run(
      companyId,
      order.id,
      item.id,
      item.name,
      quantity,
      Number(item.price || 0),
      Number(item.vat_percent || 0),
      lineSubtotal,
      lineVat,
      gross,
      safeText(req.body?.notes)
    );
    recalcOrderTotals(db, companyId, order.id);
    return res.redirect("/nexora/horeca/orders?ok=item");
  });

  app.post("/nexora/horeca/orders/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const id = Number(req.params.id);
    const status = safeText(req.body?.status).toUpperCase();
    const allowed = new Set(["DESCHISA", "IN_PREPARARE", "SERVITA", "ACHITATA", "ANULATA"]);
    if (!allowed.has(status)) return res.redirect("/nexora/horeca/orders?err=invalid");
    const order = getOrder(db, companyId, id);
    if (!order) return res.redirect("/nexora/horeca/orders?err=missing");
    db.prepare(`
      UPDATE horeca_orders
      SET status=?,
          closed_at=CASE WHEN ? IN ('ACHITATA','ANULATA') THEN datetime('now') ELSE closed_at END,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, status, id, companyId);
    if (order.table_id && ["ACHITATA", "ANULATA"].includes(status)) {
      db.prepare("UPDATE horeca_tables SET status='LIBERA', updated_at=datetime('now') WHERE id=? AND company_id=?").run(order.table_id, companyId);
    }
    return res.redirect("/nexora/horeca/orders?ok=status");
  });

  app.get("/nexora/horeca/consumption", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = db.prepare(`
      SELECT
        i.item_name,
        i.quantity,
        i.kitchen_status,
        o.order_number,
        o.channel,
        t.table_code,
        m.recipe_notes,
        m.stock_policy
      FROM horeca_order_items i
      JOIN horeca_orders o ON o.id=i.order_id AND o.company_id=i.company_id
      LEFT JOIN horeca_tables t ON t.id=o.table_id AND t.company_id=o.company_id
      LEFT JOIN horeca_menu_items m ON m.id=i.menu_item_id AND m.company_id=i.company_id
      WHERE i.company_id=?
      ORDER BY i.id DESC
      LIMIT 300
    `).all(companyId);
    return res.type("html").send(renderNexoraHorecaOperationalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Consum ingrediente",
      activePath: "/nexora/horeca/consumption",
      description: "Urmărește consumul estimat din rețetele preparatelor comandate. Legarea completă cu stocul se face prin politica de rețetă.",
      cards: [
        { icon: "C", label: "Linii comandă", value: rows.length, tone: "blue" },
        { icon: "R", label: "Cu rețetă", value: rows.filter((row) => row.recipe_notes).length, tone: "green" }
      ],
      columns: [
        { label: "Comandă", html: (row) => `${row.order_number || "-"} / ${row.table_code || row.channel || "-"}` },
        { label: "Preparat", key: "item_name" },
        { label: "Cant.", key: "quantity", right: true },
        { label: "Politică stoc", key: "stock_policy" },
        { label: "Rețetă / ingrediente", key: "recipe_notes" },
        { label: "Status", key: "kitchen_status" }
      ],
      rows,
      empty: "Nu există consum estimat."
    }));
  });

  app.get("/nexora/horeca/stock", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadKitchenStock(db, companyId);
    return res.type("html").send(renderNexoraHorecaOperationalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Stoc bucătărie/bar",
      activePath: "/nexora/horeca/stock",
      description: "Vedere rapidă peste stocurile din depozite/zone de bucătărie și bar. Gestiunea completă rămâne în Inventar & Gestiune.",
      actionsHtml: `<a class="nx-btn primary" href="/nexora/inventory">Deschide Inventar</a>`,
      cards: [
        { icon: "S", label: "Articole găsite", value: rows.length, tone: "blue" },
        { icon: "M", label: "Sub minim", value: rows.filter((row) => Number(row.quantity || 0) <= Number(row.minimum_quantity || 0)).length, tone: "orange" }
      ],
      columns: [
        { label: "Cod", key: "item_code" },
        { label: "Ingredient / produs", key: "item_name" },
        { label: "Depozit", key: "warehouse_name" },
        { label: "Cantitate", html: (row) => `${row.quantity || 0} ${row.unit || ""}`, right: true },
        { label: "Minim", key: "minimum_quantity", right: true },
        { label: "Status", key: "status" }
      ],
      rows,
      empty: "Nu există încă stocuri marcate ca bucătărie/bar."
    }));
  });

  app.get("/nexora/horeca/checks", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadOrderChecks(db, companyId);
    return res.type("html").send(renderNexoraHorecaOperationalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Note de plată",
      activePath: "/nexora/horeca/checks",
      description: "Totaluri pe comandă, metodă de plată și status pentru emiterea notei.",
      columns: [
        { label: "Notă / comandă", key: "order_number" },
        { label: "Masă / canal", html: (row) => row.table_code || row.channel || "-" },
        { label: "Linii", key: "items_count", right: true },
        { label: "Subtotal", html: (row) => money(row.subtotal), right: true },
        { label: "TVA", html: (row) => money(row.vat_amount), right: true },
        { label: "Total", html: (row) => money(row.total), right: true },
        { label: "Plată", key: "payment_method" },
        { label: "Status", key: "status" }
      ],
      rows,
      empty: "Nu există note de plată."
    }));
  });

  app.get("/nexora/horeca/split-bill", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadOrderChecks(db, companyId);
    return res.type("html").send(renderNexoraHorecaOperationalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Split bill",
      activePath: "/nexora/horeca/split-bill",
      description: "Împarte nota rapid pe 2, 3 sau 4 persoane. Următorul pas va fi split pe produse selectate.",
      columns: [
        { label: "Comandă", key: "order_number" },
        { label: "Masă / canal", html: (row) => row.table_code || row.channel || "-" },
        { label: "Total", html: (row) => money(row.total), right: true },
        { label: "2 persoane", html: (row) => money(Number(row.total || 0) / 2), right: true },
        { label: "3 persoane", html: (row) => money(Number(row.total || 0) / 3), right: true },
        { label: "4 persoane", html: (row) => money(Number(row.total || 0) / 4), right: true },
        { label: "Status", key: "status" }
      ],
      rows,
      empty: "Nu există note pentru split bill."
    }));
  });

  app.get("/nexora/horeca/tips", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadOrderChecks(db, companyId);
    return res.type("html").send(renderNexoraHorecaOperationalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Bacșiș",
      activePath: "/nexora/horeca/tips",
      description: "Vedere pentru urmărirea bacșișului pe ospătar și metodă de plată. Persistența pe notă va fi legată de POS.",
      columns: [
        { label: "Comandă", key: "order_number" },
        { label: "Ospătar", key: "waiter_name" },
        { label: "Masă / canal", html: (row) => row.table_code || row.channel || "-" },
        { label: "Total notă", html: (row) => money(row.total), right: true },
        { label: "10% sugerat", html: (row) => money(Number(row.total || 0) * 0.1), right: true },
        { label: "Plată", key: "payment_method" },
        { label: "Status", key: "status" }
      ],
      rows,
      empty: "Nu există note pentru bacșiș."
    }));
  });

  app.get("/nexora/horeca/fiscal", requireAuth, (req, res) => {
    return res.type("html").send(renderNexoraHorecaOperationalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      title: "Casă de marcat & e-Factura",
      activePath: "/nexora/horeca/fiscal",
      description: "Punctul de legătură pentru fiscalizare: casă de marcat, bon fiscal, factură la cerere și e-Factura unde este cazul.",
      actionsHtml: `<a class="nx-btn" href="/nexora/anaf/status">ANAF / e-Factura</a><a class="nx-btn primary" href="/nexora/facturi">Facturi</a>`,
      cards: [
        { icon: "B", label: "Bon fiscal", value: "pregătit pentru integrare", tone: "blue", copy: "Conectorul casei de marcat se configurează separat." },
        { icon: "F", label: "Factură la cerere", value: "prin modul Facturi", tone: "green", copy: "Comanda Horeca poate fi legată ulterior de factura fiscală." },
        { icon: "A", label: "e-Factura", value: "prin ANAF", tone: "orange", copy: "Se folosește integrarea ANAF existentă când factura intră în flux e-Factura." }
      ]
    }));
  });

  app.post("/nexora/horeca/order-items/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.kitchen_status).toUpperCase();
    const allowed = new Set(["NOU", "IN_PREPARARE", "GATA", "SERVIT"]);
    if (!allowed.has(status)) return res.redirect("/nexora/horeca/orders?err=invalid");
    db.prepare("UPDATE horeca_order_items SET kitchen_status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/horeca/orders?ok=status");
  });

  app.get("/nexora/horeca/reports", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraHorecaReportsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: reportsStats(db, companyId),
      topItems: topMenuItems(db, companyId)
    }));
  });
}
