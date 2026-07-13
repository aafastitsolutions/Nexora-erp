import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-convert-"));
process.env.DB_PATH = path.join(tmpDir, "travel-convert.db");

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

const companyId = Number(db.prepare(`
  INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
  VALUES ('Travel Convert Test', 'travel-convert-test', 'active', 1, datetime('now'), datetime('now'))
`).run().lastInsertRowid);

const leadId = Number(db.prepare(`
  INSERT INTO travel_leads (
    company_id, name, property_type, city, county, address, phone, email, website, source, status, score
  )
  VALUES (?, 'Hotel Convert', 'hotel', 'Sibiu', 'Sibiu', 'Strada 1', '0722222222', 'convert@example.test', 'https://convert.test', 'manual', 'interesat', 40)
`).run(companyId).lastInsertRowid);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "travel-convert@test.local",
      company_id: companyId,
      company_name: "Travel Convert Test",
      module_permissions: ["travel"]
    }
  };
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Convert to Property/);

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}/convert-to-property`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /ok=converted/);

  const property = db.prepare("SELECT * FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, leadId);
	  assert.ok(property);
	  assert.equal(property.name, "Hotel Convert");
	  assert.equal(property.status, "activ");
	  assert.equal(property.partner_plan, "manual_activation");
	  assert.equal(property.subscription_status, "active");

  const lead = db.prepare("SELECT status FROM travel_leads WHERE id=? AND company_id=?").get(leadId, companyId);
  assert.equal(lead.status, "activ");

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}/convert-to-property`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /err=already_converted/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, leadId).n, 1);

  console.log("travel convert tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
