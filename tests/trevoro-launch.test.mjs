import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-trevoro-launch-"));
process.env.DB_PATH = path.join(tmpDir, "trevoro-launch.db");

const { db, migrate } = await import("../db.js");
const { registerTravelRoutes, registerTrevoroLaunchRoutes } = await import("../routes/travel-routes.js");

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
        email: "trevoro-launch@test.local",
        company_id: companyId,
        company_name: "Trevoro Launch Test",
        module_permissions: ["travel"]
      }
    };
  }
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
const sentEmails = [];
const transporter = {
  async sendMail(message) {
    sentEmails.push(message);
    return { messageId: `test-${sentEmails.length}` };
  }
};
process.env.SMTP_USER = "trevoro@test.local";
process.env.SMTP_PASS = "test-pass";
process.env.TREVORO_OWNER_API_SECRET = "test-owner-secret";
registerTrevoroLaunchRoutes(app, { db, transporter });
registerTravelRoutes(app, { db, requireAuth, transporter });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Înscrie proprietatea pe Trevoro\./);
  assert.match(html, /Beneficii pentru proprietari/);
  assert.match(html, /Cum funcționează/);
  assert.match(html, /Program de lansare/);
  assert.doesNotMatch(html, /99 lei\/lună/);
  assert.doesNotMatch(html, /0% comision/);
  assert.match(html, /Formular/);
  assert.doesNotMatch(html, /Pagina publică/);
  assert.doesNotMatch(html, /marketplace/i);

  response = await fetch(`${baseUrl}/`, {
    method: "POST",
    body: new URLSearchParams({
      name: "",
      city: "",
      phone: "",
      email: "",
      password: ""
    })
  });
  html = await response.text();
  assert.equal(response.status, 400);
  assert.match(html, /Numele proprietății este obligatoriu/);
  assert.match(html, /Telefonul sau emailul este obligatoriu/);

  response = await fetch(`${baseUrl}/`, {
    method: "POST",
    body: new URLSearchParams({
      name: "Pensiunea Launch",
      property_type: "pensiune",
      city: "Sibiu",
      county: "Sibiu",
      phone: "0722222222",
      email: "launch@example.test",
      password: "OwnerTest123",
      website: "https://launch.example.test",
      notes: "Lead din homepage launch."
    }),
    redirect: "manual"
	  });
	  assert.equal(response.status, 302);
	  assert.match(response.headers.get("location") || "", /\/\?ok=founding#formular/);

	  const lead = db.prepare("SELECT * FROM travel_leads WHERE company_id=? AND email='launch@example.test'").get(companyId);
	  assert.ok(lead);
	  assert.equal(lead.source, "trevoro_landing");
	  assert.equal(lead.status, "activ");
	  assert.equal(lead.notes, "Lead din homepage launch.");
	  const property = db.prepare("SELECT * FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, lead.id);
	  assert.ok(property);
	  assert.equal(property.name, "Pensiunea Launch");
	  assert.equal(property.status, "activ");
	  assert.equal(property.partner_plan, "founding_partner");
	  assert.equal(property.subscription_status, "free_12_months");
	  assert.equal(property.monthly_price_ron, 0);
	  assert.equal(property.monthly_price_amount, 0);
	  assert.equal(property.monthly_price_currency, "RON");
	  assert.equal(property.activation_source, "trevoro_landing");
	  assert.equal(property.account_email, "launch@example.test");
	  assert.equal(property.account_status, "active");
	  assert.ok(property.password_salt);
	  assert.ok(property.password_hash);
	  assert.ok(property.free_until);
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE company_id=? AND lead_id=? AND activity_type='converted_to_property'").get(companyId, lead.id).n,
	    1
	  );
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_social_posts WHERE company_id=? AND property_id=? AND platform='facebook' AND status='ready'").get(companyId, property.id).n,
	    1
	  );
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_social_posts WHERE company_id=? AND property_id=? AND platform='tiktok' AND status='ready'").get(companyId, property.id).n,
	    1
	  );
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_social_publish_jobs WHERE company_id=? AND status='manual_required'").get(companyId).n,
	    2
	  );
	  assert.equal(sentEmails.length, 1);
	  assert.equal(sentEmails[0].to, "launch@example.test");
	  assert.match(sentEmails[0].subject, /Pensiunea Launch este în programul de lansare/);
	  assert.match(sentEmails[0].text, /Pensiunea Launch/);
	  assert.doesNotMatch(sentEmails[0].text, /0 lei\/lună timp de 30 de zile/);
	  assert.doesNotMatch(sentEmails[0].text, /99 lei\/lună/);
	  assert.doesNotMatch(sentEmails[0].text, /Basic 99|Premium 149|Business 249/);
	  assert.doesNotMatch(sentEmails[0].text, /abonament/i);
	  assert.doesNotMatch(sentEmails[0].text, /plăți|plati/i);
	  assert.doesNotMatch(sentEmails[0].text, /Confirmă codul de verificare primit pe email/);
	  assert.doesNotMatch(sentEmails[0].text, /0% comision pe rezervări/);
	  assert.doesNotMatch(sentEmails[0].html, /99 lei\/lună/);
	  assert.doesNotMatch(sentEmails[0].html, /Basic 99|Premium 149|Business 249/);
	  assert.doesNotMatch(sentEmails[0].html, /abonament/i);
	  assert.doesNotMatch(sentEmails[0].html, /plăți|plati/i);
	  assert.doesNotMatch(sentEmails[0].html, /Confirmă codul de verificare primit pe email/);
	  assert.doesNotMatch(sentEmails[0].html, /0% comision pe rezervări/);
	  assert.match(sentEmails[0].text, /programul de lansare Trevoro/);
	  assert.match(sentEmails[0].text, /parola creată la înscriere/);
	  assert.match(sentEmails[0].text, /\/login\?next=%2Fdashboard%2Fpartner/);
	  assert.match(sentEmails[0].text, new RegExp(`/properties/${property.id}-`));
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_lead_activities WHERE company_id=? AND lead_id=? AND activity_type='welcome_email_sent'").get(companyId, lead.id).n,
	    1
	  );

  response = await fetch(`${baseUrl}/`, {
    method: "POST",
    body: new URLSearchParams({
      name: "Pensiunea Duplicat",
	      city: "Sibiu",
	      email: "launch@example.test",
	      password: "OwnerTest123"
	    }),
	    redirect: "manual"
		  });
		  assert.equal(response.status, 302);
		  assert.match(response.headers.get("location") || "", /\/\?ok=founding#formular/);
		  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_leads WHERE company_id=? AND email='launch@example.test'").get(companyId).n, 1);
		  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, lead.id).n, 1);

	  const insertActiveProperty = db.prepare(`
	    INSERT INTO travel_properties (
	      company_id, name, city, status, partner_plan, subscription_status, monthly_price_ron
	    )
	    VALUES (?, ?, 'Brașov', 'activ', 'founding_partner', 'free_12_months', 0)
	  `);
	  for (let index = 0; index < 99; index += 1) {
	    insertActiveProperty.run(companyId, `Founding Limit ${index + 1}`);
	  }

	  response = await fetch(`${baseUrl}/`, {
	    method: "POST",
	    body: new URLSearchParams({
	      name: "Pensiunea După Limită",
	      city: "Brașov",
	      phone: "0733333333",
	      email: "after-limit@example.test",
	      password: "OwnerTest123"
	    }),
	    redirect: "manual"
	  });
	  assert.equal(response.status, 302);
	  assert.match(response.headers.get("location") || "", /\/\?ok=founding#formular/);
	  const afterLimitLead = db.prepare("SELECT * FROM travel_leads WHERE company_id=? AND email='after-limit@example.test'").get(companyId);
	  assert.ok(afterLimitLead);
	  assert.equal(afterLimitLead.status, "activ");
	  const afterLimitProperty = db.prepare("SELECT * FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, afterLimitLead.id);
	  assert.ok(afterLimitProperty);
	  assert.equal(afterLimitProperty.status, "activ");
	  assert.equal(afterLimitProperty.partner_plan, "founding_partner");
	  assert.equal(afterLimitProperty.subscription_status, "free_12_months");
	  assert.equal(afterLimitProperty.monthly_price_ron, 0);
	  assert.ok(afterLimitProperty.free_until);
		  assert.equal(sentEmails.length, 3);
		  assert.equal(sentEmails[2].to, "after-limit@example.test");
		  assert.match(sentEmails[2].subject, /Pensiunea După Limită este în programul de lansare/);

	  response = await fetch(`${baseUrl}/api/trevoro/auth/account`, {
	    method: "POST",
	    headers: {
	      "Content-Type": "application/x-www-form-urlencoded",
	      "x-trevoro-owner-secret": "test-owner-secret"
	    },
	    body: new URLSearchParams({ email: "launch@example.test" })
	  });
	  const accountPayload = await response.json();
	  assert.equal(response.status, 200);
	  assert.equal(accountPayload.account.role, "owner");
	  assert.equal(accountPayload.account.email, "launch@example.test");
	  assert.equal(accountPayload.account.dashboard, "/dashboard/partner");
	  assert.match(accountPayload.account.propertySlug, new RegExp(`^${property.id}-`));
	  const updatedProperty = db.prepare("SELECT * FROM travel_properties WHERE company_id=? AND lead_id=?").get(companyId, lead.id);
	  assert.equal(accountPayload.account.passwordSalt, updatedProperty.password_salt);
	  assert.equal(accountPayload.account.passwordHash, updatedProperty.password_hash);

	  const monitorProperty = db.prepare("SELECT name FROM travel_properties WHERE company_id=? AND id=?").get(companyId, property.id);
	  response = await fetch(`${baseUrl}/nexora/travel/owners-monitor?q=${encodeURIComponent(monitorProperty.name)}`);
	  html = await response.text();
	  assert.equal(response.status, 200);
	  assert.match(html, /Caută proprietari/);
	  assert.match(html, />Caută</);
	  assert.match(html, new RegExp(monitorProperty.name));
	  assert.doesNotMatch(html, /nx-table-main-link" href="\/nexora\/travel\/properties\/\d+">Founding Limit 1</);

	  const emailsBeforePasswordReset = sentEmails.length;
	  response = await fetch(`${baseUrl}/api/trevoro/owner/password-reset/request`, {
	    method: "POST",
	    headers: {
	      "Content-Type": "application/x-www-form-urlencoded",
	      "x-trevoro-owner-secret": "test-owner-secret"
	    },
	    body: new URLSearchParams({ email: "launch@example.test" })
	  });
	  let resetPayload = await response.json();
	  assert.equal(response.status, 200);
	  assert.equal(resetPayload.ok, true);
	  assert.equal(sentEmails.length, emailsBeforePasswordReset + 1);
	  assert.match(sentEmails.at(-1).subject, new RegExp(`resetare parolă pentru ${monitorProperty.name}`));
	  const tokenMatch = sentEmails.at(-1).text.match(/\/login\/reset\?token=([A-Za-z0-9_-]+)/);
	  assert.ok(tokenMatch, "password reset token link");
	  const resetToken = tokenMatch[1];

	  response = await fetch(`${baseUrl}/api/trevoro/owner/password-reset/complete`, {
	    method: "POST",
	    headers: {
	      "Content-Type": "application/x-www-form-urlencoded",
	      "x-trevoro-owner-secret": "test-owner-secret"
	    },
	    body: new URLSearchParams({ token: resetToken, password: "short" })
	  });
	  resetPayload = await response.json();
	  assert.equal(response.status, 400);
	  assert.equal(resetPayload.error, "invalid_password");

	  response = await fetch(`${baseUrl}/api/trevoro/owner/password-reset/complete`, {
	    method: "POST",
	    headers: {
	      "Content-Type": "application/x-www-form-urlencoded",
	      "x-trevoro-owner-secret": "test-owner-secret"
	    },
	    body: new URLSearchParams({ token: resetToken, password: "OwnerReset123" })
	  });
	  resetPayload = await response.json();
	  assert.equal(response.status, 200);
	  assert.equal(resetPayload.ok, true);
	  const resetProperty = db.prepare("SELECT * FROM travel_properties WHERE company_id=? AND id=?").get(companyId, property.id);
	  assert.equal(resetProperty.account_email, "launch@example.test");
	  assert.equal(resetProperty.account_status, "active");
	  assert.notEqual(resetProperty.password_hash, updatedProperty.password_hash);
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_owner_password_reset_tokens WHERE company_id=? AND property_id=? AND used_at IS NOT NULL").get(companyId, property.id).n,
	    1
	  );

	  response = await fetch(`${baseUrl}/api/trevoro/owner/password-reset/complete`, {
	    method: "POST",
	    headers: {
	      "Content-Type": "application/x-www-form-urlencoded",
	      "x-trevoro-owner-secret": "test-owner-secret"
	    },
	    body: new URLSearchParams({ token: resetToken, password: "OwnerReset456" })
	  });
	  resetPayload = await response.json();
	  assert.equal(response.status, 400);
	  assert.equal(resetPayload.error, "invalid_or_expired_token");

	  const emailsBeforeAdminReset = sentEmails.length;
	  response = await fetch(`${baseUrl}/nexora/travel/properties/${property.id}/password-reset`, {
	    method: "POST",
	    body: new URLSearchParams({ return_to: "detail" }),
	    redirect: "manual"
	  });
	  assert.equal(response.status, 302);
	  assert.equal(response.headers.get("location"), `/nexora/travel/properties/${property.id}?ok=owner_password_reset_sent`);
	  assert.equal(sentEmails.length, emailsBeforeAdminReset + 1);

	  response = await fetch(`${baseUrl}/sitemap.xml`);
  const sitemap = await response.text();
  assert.equal(response.status, 200);
  assert.match(sitemap, /<loc>http:\/\/127\.0\.0\.1:\d+\/<\/loc>/);
  assert.match(sitemap, /\/blog/);

  console.log("trevoro launch tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
