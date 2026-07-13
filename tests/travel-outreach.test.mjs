import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-outreach-"));
process.env.DB_PATH = path.join(tmpDir, "travel-outreach.db");

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
  INSERT INTO travel_leads (
    company_id, name, property_type, city, county, phone, email, website,
    source, status, score, next_follow_up_at
  )
  VALUES (?, 'Pensiunea Outreach', 'pensiune', 'Bran', 'Brașov', '0711111111', 'outreach@example.test', 'https://outreach.example.test', 'osm', 'nou', 75, datetime('now'))
`).run(companyId).lastInsertRowid);
assert.ok(leadId > 0);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "travel-outreach@test.local",
      company_id: companyId,
      company_name: "Travel Outreach Test",
      module_permissions: ["travel"]
    }
  };
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/nexora/travel/outreach`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Outreach Trevoro/);
  assert.match(html, /Pensiunea Outreach/);
  assert.match(html, /Control campanie email/);
  assert.match(html, /Mesaje care vor fi trimise/);
  assert.match(html, /Publicati proprietatea pe Trevoro/);
  assert.match(html, /fixed monthly plan/);
  assert.match(html, /99 lei\/luna/);
  assert.match(html, /19 EUR\/month/);
  assert.match(html, /0% comision/);
  assert.match(html, /Start/);
  assert.match(html, /Pauză/);
  assert.match(html, /Oprire/);
  assert.match(html, /Sincronizează email/);
  assert.match(html, /Mesaje email/);
  assert.match(html, /Copiază mesaj/);
  assert.match(html, /Marchează contactat/);

  response = await fetch(`${baseUrl}/nexora/travel/outreach/sync-email`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/nexora/travel/outreach?err=imap_not_configured");

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}/mark-contacted`, {
    method: "POST",
    body: new URLSearchParams({ channel: "whatsapp", return_to: "outreach" }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/nexora/travel/outreach?ok=contacted");

  const lead = db.prepare("SELECT status, next_follow_up_at FROM travel_leads WHERE id=?").get(leadId);
  assert.equal(lead.status, "contactat");
  assert.match(String(lead.next_follow_up_at || ""), /^\d{4}-\d{2}-\d{2}/);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE lead_id=? AND activity_type='outreach_contacted'").get(leadId).n,
    1
  );

  console.log("travel outreach tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
