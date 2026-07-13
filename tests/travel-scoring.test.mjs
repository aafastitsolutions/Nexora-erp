import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-scoring-"));
process.env.DB_PATH = path.join(tmpDir, "travel-scoring.db");

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
  VALUES ('Travel Scoring Test', 'travel-scoring-test', 'active', 1, datetime('now'), datetime('now'))
`).run().lastInsertRowid);

db.prepare(`
  INSERT INTO travel_leads (
    company_id, name, property_type, city, phone, email, website, facebook, google_reviews, source, status, score
  )
  VALUES (?, 'Hot Hotel', 'hotel', 'Brașov', '0700000001', 'hot@example.test', 'https://hot.test', 'https://facebook.test/hot', 260, 'manual', 'nou', 0)
`).run(companyId);
db.prepare(`
  INSERT INTO travel_leads (company_id, name, property_type, city, phone, email, source, status, score)
  VALUES (?, 'Warm Hotel', 'hotel', 'Ploiești', '0700000002', 'warm@example.test', 'manual', 'nou', 0)
`).run(companyId);
db.prepare(`
  INSERT INTO travel_leads (company_id, name, property_type, city, phone, source, status, score)
  VALUES (?, 'Cold Hotel', 'hotel', 'Ploiești', '0700000003', 'manual', 'nou', 0)
`).run(companyId);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "travel-scoring@test.local",
      company_id: companyId,
      company_name: "Travel Scoring Test",
      module_permissions: ["travel"]
    }
  };
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/nexora/travel/settings`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Lead scoring/);
  assert.match(html, /Google reviews peste 200/);

  response = await fetch(`${baseUrl}/nexora/travel/settings/scoring`, {
    method: "POST",
    body: new URLSearchParams({
      phone_points: "20",
      email_points: "20",
      website_points: "15",
      social_points: "10",
      google_reviews_50_points: "10",
      google_reviews_200_points: "20",
      tourist_city_points: "10",
      tourist_cities: "Brașov"
    }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /ok=scoring/);

  const scores = db.prepare("SELECT name, score FROM travel_leads WHERE company_id=? ORDER BY name").all(companyId);
  assert.deepEqual(scores.map((row) => [row.name, row.score]), [
    ["Cold Hotel", 20],
    ["Hot Hotel", 95],
    ["Warm Hotel", 40]
  ]);

  response = await fetch(`${baseUrl}/nexora/travel/leads`);
  html = await response.text();
  assert.match(html, /Hot Lead/);
  assert.match(html, /Warm Lead/);
  assert.match(html, /Cold Lead/);

  console.log("travel scoring tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
