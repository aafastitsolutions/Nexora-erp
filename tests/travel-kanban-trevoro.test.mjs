import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-kanban-trevoro-"));
process.env.DB_PATH = path.join(tmpDir, "travel-kanban-trevoro.db");

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

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  if (req.path.startsWith("/nexora")) {
    req.session = {
      user: {
        id: 1,
        email: "travel-kanban@test.local",
        company_id: companyId,
        company_name: "Travel Kanban Trevoro Test",
        module_permissions: ["travel"]
      }
    };
  }
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/trevoro/parteneri`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Alternativa românească la Booking/);
  assert.match(html, /Înscrie proprietatea/);

  response = await fetch(`${baseUrl}/trevoro/parteneri`, {
    method: "POST",
    body: new URLSearchParams({
      name: "",
      city: "",
      phone: "",
      email: ""
    })
  });
  html = await response.text();
  assert.equal(response.status, 400);
  assert.match(html, /Numele proprietății este obligatoriu/);
  assert.match(html, /Telefonul sau emailul este obligatoriu/);

  response = await fetch(`${baseUrl}/trevoro/parteneri`, {
    method: "POST",
    body: new URLSearchParams({
      name: "Cabana Trevoro",
      property_type: "cabană",
      city: "Brașov",
      county: "Brașov",
	      phone: "0712345678",
	      email: "cabana@example.test",
	      account_email: "cabana@example.test",
	      password: "Trevoro2026",
	      website: "https://cabana.example.test",
	      notes: "Vrea lansare early partner."
	    }),
    redirect: "manual"
	  });
	  assert.equal(response.status, 302);
	  assert.match(response.headers.get("location") || "", /\/trevoro\/parteneri\?ok=1#formular/);

	  const lead = db.prepare("SELECT * FROM travel_leads WHERE company_id=? AND email='cabana@example.test'").get(companyId);
	  assert.ok(lead);
	  assert.equal(lead.source, "trevoro_landing");
	  assert.equal(lead.status, "nou");
	  assert.equal(lead.notes, "Vrea lansare early partner.");
	  assert.equal(Number(lead.score), 65);
	  const property = db.prepare("SELECT * FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, lead.id);
		  assert.ok(property);
		  assert.equal(property.status, "plata_necesara");
		  assert.equal(property.partner_plan, "basic_monthly");
		  assert.equal(property.subscription_status, "payment_required");
		  assert.equal(property.account_email, "cabana@example.test");
		  assert.equal(property.account_status, "active");
		  assert.ok(property.password_hash);

  response = await fetch(`${baseUrl}/trevoro/parteneri`, {
    method: "POST",
    body: new URLSearchParams({
      name: "Cabana Duplicat",
      property_type: "cabană",
	      city: "Brașov",
	      phone: "0799999999",
		      email: "cabana@example.test",
		      account_email: "cabana@example.test",
		      password: "Trevoro2026"
			    }),
	    redirect: "manual"
			  });
	  assert.equal(response.status, 302);
	  assert.match(response.headers.get("location") || "", /\/trevoro\/parteneri\?ok=1#formular/);
	  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_leads WHERE company_id=?").get(companyId).n, 1);
	  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_properties WHERE company_id=?").get(companyId).n, 1);

  response = await fetch(`${baseUrl}/nexora/travel/leads?source=trevoro_landing`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Cabana Duplicat/);

  response = await fetch(`${baseUrl}/nexora/travel/kanban`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Kanban lead-uri Travel/);
  assert.match(html, /Nou/);
  assert.match(html, /Contactat/);
  assert.match(html, /Demo Programat/);
  assert.match(html, /Cabana Duplicat/);

  response = await fetch(`${baseUrl}/nexora/travel/leads/${lead.id}/status`, {
    method: "POST",
    body: new URLSearchParams({
      return_to: "kanban",
      status: "contactat"
    }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /\/nexora\/travel\/kanban\?ok=status/);

  const movedLead = db.prepare("SELECT status, notes FROM travel_leads WHERE id=? AND company_id=?").get(lead.id, companyId);
  assert.equal(movedLead.status, "contactat");
  assert.equal(movedLead.notes, "Vrea lansare early partner.");

  console.log("travel kanban trevoro tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
