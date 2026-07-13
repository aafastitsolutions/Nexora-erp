import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-detail-"));
process.env.DB_PATH = path.join(tmpDir, "travel-detail.db");

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
  VALUES ('Travel Detail Test', 'travel-detail-test', 'active', 1, datetime('now'), datetime('now'))
`).run().lastInsertRowid);

const leadId = Number(db.prepare(`
  INSERT INTO travel_leads (
    company_id, name, property_type, city, county, address, phone, email, website,
    facebook, instagram, google_rating, google_reviews, source, status, score, notes
  )
  VALUES (
    ?, 'Hotel Detail', 'hotel', 'Cluj-Napoca', 'Cluj', 'Strada 10', '0733333333',
    'detail@example.test', 'https://detail.test', 'https://facebook.test/detail',
    'https://instagram.test/detail', 4.8, 91, 'manual', 'nou', 70, ''
  )
`).run(companyId).lastInsertRowid);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "travel-detail@test.local",
      company_id: companyId,
      company_name: "Travel Detail Test",
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
  assert.match(html, /Hotel Detail/);
  assert.match(html, /Google rating/);
  assert.match(html, /Next follow-up/);
  assert.match(html, /Convert to Property/);
  assert.match(html, /Outreach/);
  assert.match(html, /Telefon/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /Email/);
  assert.match(html, /Copiază mesaj/);
  assert.match(html, /Marchează contactat/);
  assert.match(html, /Hotel Detail, hotel din Cluj-Napoca/);
  assert.match(html, /Timeline/);
  assert.match(html, /Lead creat/);

  const beforeContact = Date.now();
  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}/mark-contacted`, {
    method: "POST",
    body: new URLSearchParams({ channel: "whatsapp" }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", new RegExp(`/nexora/travel/leads/${leadId}\\?ok=contacted`));

  let lead = db.prepare("SELECT status, next_follow_up_at FROM travel_leads WHERE id=? AND company_id=?").get(leadId, companyId);
  assert.equal(lead.status, "contactat");
  assert.ok(lead.next_follow_up_at);
  const followUpMs = new Date(`${lead.next_follow_up_at.replace(" ", "T")}Z`).getTime();
  assert.ok(followUpMs >= beforeContact + (2.9 * 24 * 60 * 60 * 1000));
  assert.ok(followUpMs <= beforeContact + (3.1 * 24 * 60 * 60 * 1000));
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE company_id=? AND lead_id=? AND activity_type='outreach_contacted'").get(companyId, leadId).n,
    1
  );

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}`);
  html = await response.text();
  assert.match(html, /Marcat contactat/);
  assert.match(html, /Canal: WhatsApp/);

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}/status`, {
    method: "POST",
    body: new URLSearchParams({
      return_to: "detail",
      status: "interesat",
      notes: "Am discutat cu proprietarul.",
      next_follow_up_at: "2026-06-10T09:30"
    }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", new RegExp(`/nexora/travel/leads/${leadId}\\?ok=status`));

  lead = db.prepare("SELECT status, notes, next_follow_up_at FROM travel_leads WHERE id=? AND company_id=?").get(leadId, companyId);
  assert.equal(lead.status, "interesat");
  assert.equal(lead.notes, "Am discutat cu proprietarul.");
  assert.equal(lead.next_follow_up_at, "2026-06-10 06:30");

  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE company_id=? AND lead_id=? AND activity_type='status_changed'").get(companyId, leadId).n,
    2
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE company_id=? AND lead_id=? AND activity_type='note_added'").get(companyId, leadId).n,
    1
  );

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}`);
  html = await response.text();
  assert.match(html, /2026-06-10 09:30/);
  assert.match(html, /Status schimbat/);
  assert.match(html, /Notă adăugată/);

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}/convert-to-property`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(response.status, 302);

  response = await fetch(`${baseUrl}/nexora/travel/leads/${leadId}`);
  html = await response.text();
  assert.match(html, /Convertit în proprietate/);

  console.log("travel lead detail tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
