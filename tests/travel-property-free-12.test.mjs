import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-free-12-"));
process.env.DB_PATH = path.join(tmpDir, "travel-free-12.db");

const { db, migrate } = await import("../db.js");
const { registerTravelRoutes } = await import("../routes/travel-routes.js");

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

migrate();

const companyId = Number(db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()?.id || 0);
assert.ok(companyId > 0);

const leadId = Number(db.prepare(`
  INSERT INTO travel_leads (company_id, name, property_type, city, county, phone, email, source, status, score)
  VALUES (?, 'Pensiunea Plata', 'pensiune', 'Sibiu', 'Sibiu', '0711111111', 'plata@example.test', 'trevoro_site', 'nou', 60)
`).run(companyId).lastInsertRowid);

const propertyId = Number(db.prepare(`
  INSERT INTO travel_properties (
    company_id, lead_id, name, property_type, country, city, county, phone, email,
    status, partner_plan, subscription_status, monthly_price_ron, monthly_price_amount,
    monthly_price_currency, activation_source
  )
  VALUES (?, ?, 'Pensiunea Plata', 'pensiune', 'Romania', 'Sibiu', 'Sibiu', '0711111111', 'plata@example.test',
    'plata_necesara', 'standard_monthly', 'payment_required', 99, 99, 'RON', 'trevoro_site')
`).run(companyId, leadId).lastInsertRowid);

assert.ok(propertyId > 0);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "admin-free-12@test.local",
      company_id: companyId,
      company_name: "Travel Free 12 Test",
      module_permissions: ["travel"]
    }
  };
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/nexora/travel/properties?country=Romania`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Pensiunea Plata/);
  assert.match(html, /Gratis 12 luni/);

  response = await fetch(`${baseUrl}/nexora/travel/properties/${propertyId}/free-12-months`, {
    method: "POST",
    body: new URLSearchParams({ free_12_months: "1", return_to: "detail" }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `/nexora/travel/properties/${propertyId}?ok=property_free_12_months`);

  const property = db.prepare("SELECT * FROM travel_properties WHERE id=? AND company_id=?").get(propertyId, companyId);
  assert.equal(property.status, "activ");
  assert.equal(property.partner_plan, "founding_partner");
  assert.equal(property.subscription_status, "free_12_months");
  assert.equal(property.monthly_price_ron, 0);
  assert.equal(property.monthly_price_amount, 0);
  assert.equal(property.monthly_price_currency, "RON");
  assert.match(property.free_until, /^\d{4}-\d{2}-\d{2}$/);

  const lead = db.prepare("SELECT status FROM travel_leads WHERE id=? AND company_id=?").get(leadId, companyId);
  assert.equal(lead.status, "activ");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE company_id=? AND lead_id=? AND activity_type='manual_free_12_months_granted'").get(companyId, leadId).n,
    1
  );

  response = await fetch(`${baseUrl}/nexora/travel/properties/${propertyId}`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Gratis 12 luni activ/);
  assert.doesNotMatch(html, /payment_required/);

  console.log("travel property free 12 tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
