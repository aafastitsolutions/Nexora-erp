import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { db, migrate } from "../db.js";
import { registerManufacturingRoutes } from "../routes/manufacturing-routes.js";

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function form(payload = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) params.set(key, String(value));
  return params;
}

migrate();

const marker = `mrp-test-${Date.now()}-${Math.round(Math.random() * 9999)}`;

db.exec("BEGIN");

try {
  const companyId = Number(db.prepare(`
    INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
    VALUES (?, ?, 'active', 20, datetime('now'), datetime('now'))
  `).run(`MRP Test ${marker}`, marker).lastInsertRowid);

  const finishedProductId = Number(db.prepare(`
    INSERT INTO products (code, name, unit, price, tva_percent, kind, active, company_id)
    VALUES (?, ?, 'buc', 100, 21, 'PRODUS', 1, ?)
  `).run(`PF-${marker}`, `Produs finit ${marker}`, companyId).lastInsertRowid);

  const materialProductId = Number(db.prepare(`
    INSERT INTO products (code, name, unit, price, tva_percent, kind, active, company_id)
    VALUES (?, ?, 'kg', 5, 21, 'PRODUS', 1, ?)
  `).run(`MAT-${marker}`, `Materie primă ${marker}`, companyId).lastInsertRowid);

  const warehouseId = Number(db.prepare(`
    INSERT INTO inventory_warehouses (company_id, warehouse_code, name, warehouse_type, status, created_by_email)
    VALUES (?, ?, ?, 'DEPOZIT', 'ACTIV', ?)
  `).run(companyId, `WH-${marker}`, `Depozit ${marker}`, `test-${marker}@local`).lastInsertRowid);

  const stockItemId = Number(db.prepare(`
    INSERT INTO inventory_stock_items (
      company_id, warehouse_id, product_id, item_code, item_name, item_type,
      unit, quantity, reserved_quantity, status, created_by_email
    )
    VALUES (?, ?, ?, ?, ?, 'MATERIE_PRIMA', 'kg', 100, 0, 'ACTIV', ?)
  `).run(companyId, warehouseId, materialProductId, `ST-${marker}`, `Materie primă ${marker}`, `test-${marker}@local`).lastInsertRowid);

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    req.session = {
      user: {
        id: 1,
        email: `operator-${marker}@local`,
        role: "admin",
        company_id: companyId,
        company_name: `MRP Test ${marker}`,
        module_permissions: ["manufacturing"]
      }
    };
    next();
  });
  const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
  registerManufacturingRoutes(app, { db, requireAuth });

  const { server, baseUrl } = await listen(app);
  try {
    const pages = [
      "/nexora/manufacturing",
      "/nexora/manufacturing/bom",
      "/nexora/manufacturing/orders",
      "/nexora/manufacturing/planning",
      "/nexora/manufacturing/materials",
      "/nexora/manufacturing/costs",
      "/nexora/manufacturing/quality"
    ];

    for (const page of pages) {
      const res = await fetch(`${baseUrl}${page}`);
      assert.equal(res.status, 200, page);
    }

    let res = await fetch(`${baseUrl}/nexora/manufacturing/bom/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ product_id: finishedProductId, revision: "A", batch_size: 1, status: "ACTIV" })
    });
    assert.equal(res.status, 302);

    const bom = db.prepare("SELECT * FROM manufacturing_boms WHERE company_id=?").get(companyId);
    assert.ok(bom);

    res = await fetch(`${baseUrl}/nexora/manufacturing/bom/items/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        bom_id: bom.id,
        component_product_id: materialProductId,
        stock_item_id: stockItemId,
        quantity_per_batch: 2,
        scrap_percent: 0,
        unit_cost: 5,
        operation_step: "Asamblare"
      })
    });
    assert.equal(res.status, 302);

    res = await fetch(`${baseUrl}/nexora/manufacturing/orders/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ bom_id: bom.id, quantity_planned: 3, warehouse_id: warehouseId, priority: "RIDICATA" })
    });
    assert.equal(res.status, 302);

    const order = db.prepare("SELECT * FROM manufacturing_orders WHERE company_id=?").get(companyId);
    assert.ok(order);
    const material = db.prepare("SELECT * FROM manufacturing_order_materials WHERE company_id=? AND order_id=?")
      .get(companyId, order.id);
    assert.equal(Number(material.required_qty), 6);

    res = await fetch(`${baseUrl}/nexora/manufacturing/materials/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ order_material_id: material.id, issued_qty: 6 })
    });
    assert.equal(res.status, 302);

    const issue = db.prepare("SELECT * FROM manufacturing_material_issues WHERE company_id=?").get(companyId);
    assert.ok(issue);

    res = await fetch(`${baseUrl}/nexora/manufacturing/materials/${issue.id}/consume`, {
      method: "POST",
      redirect: "manual"
    });
    assert.equal(res.status, 302);
    const stockAfter = db.prepare("SELECT quantity FROM inventory_stock_items WHERE id=?").get(stockItemId);
    assert.equal(Number(stockAfter.quantity), 94);

    res = await fetch(`${baseUrl}/nexora/manufacturing/costs/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        order_id: order.id,
        auto_material_cost: 1,
        labor_cost: 12,
        overhead_cost: 3,
        quantity_basis: 3,
        cost_type: "REALIZAT"
      })
    });
    assert.equal(res.status, 302);
    const cost = db.prepare("SELECT * FROM manufacturing_costs WHERE company_id=?").get(companyId);
    assert.equal(Number(cost.total_cost), 45);
    assert.equal(Number(cost.unit_cost), 15);

    res = await fetch(`${baseUrl}/nexora/manufacturing/quality/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ order_id: order.id, sample_size: 3, accepted_qty: 3, rejected_qty: 0, result: "PASS" })
    });
    assert.equal(res.status, 302);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM manufacturing_quality_checks WHERE company_id=?").get(companyId).n, 1);

    res = await fetch(`${baseUrl}/nexora/manufacturing/planning/create`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ product_id: finishedProductId, demand_source: "FORECAST", demand_qty: 5 })
    });
    assert.equal(res.status, 302);
    const plan = db.prepare("SELECT * FROM manufacturing_plans WHERE company_id=?").get(companyId);
    assert.equal(Number(plan.planned_qty), 5);

    res = await fetch(`${baseUrl}/nexora/manufacturing/planning/${plan.id}/generate-order`, {
      method: "POST",
      redirect: "manual"
    });
    assert.equal(res.status, 302);
    const generatedPlan = db.prepare("SELECT status, generated_order_id FROM manufacturing_plans WHERE id=?").get(plan.id);
    assert.equal(generatedPlan.status, "GENERAT");
    assert.ok(Number(generatedPlan.generated_order_id) > 0);

    res = await fetch(`${baseUrl}/nexora/manufacturing/orders/${order.id}/finish`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ quantity_completed: 3 })
    });
    assert.equal(res.status, 302);
    const finishedStock = db.prepare(`
      SELECT quantity
      FROM inventory_stock_items
      WHERE company_id=? AND product_id=? AND warehouse_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, finishedProductId, warehouseId);
    assert.equal(Number(finishedStock.quantity), 3);
  } finally {
    await close(server);
  }

  console.log("manufacturing smoke tests passed");
} finally {
  db.exec("ROLLBACK");
}
