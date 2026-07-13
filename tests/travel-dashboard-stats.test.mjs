import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-dashboard-stats-"));
process.env.DB_PATH = path.join(tmpDir, "travel-dashboard-stats.db");

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

function kpiValue(html, label) {
  const pattern = new RegExp(`<div class="nx-kpi-label">${label}</div><div class="nx-kpi-value">([^<]+)</div>`);
  const match = html.match(pattern);
  assert.ok(match, `KPI lipsa: ${label}`);
  return match[1];
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dashboardBarValue(html, label) {
  const pattern = new RegExp(`<div class="nx-dashboard-bar-label"><span>${escapeRegex(label)}</span><b>([^<]+)</b></div>`);
  const match = html.match(pattern);
  assert.ok(match, `Dashboard bar lipsa: ${label}`);
  return match[1];
}

migrate();

const companyId = Number(db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get()?.id || 0);
assert.ok(companyId > 0);

for (let index = 0; index < 5; index += 1) {
  db.prepare(`
    INSERT INTO travel_leads (company_id, name, city, email, source, status, score)
    VALUES (?, ?, 'Brasov', ?, 'osm', 'interesat', 80)
  `).run(companyId, `Lead Interesat ${index + 1}`, `interesat-${index + 1}@example.test`);
}

const founderLeadId = Number(db.prepare(`
  INSERT INTO travel_leads (company_id, name, city, email, source, status, score)
  VALUES (?, 'Pensiunea Fondator', 'Sibiu', 'fondator@example.test', 'trevoro_landing', 'activ', 70)
`).run(companyId).lastInsertRowid);

db.prepare(`
  INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details)
  VALUES (?, ?, 'landing_signup', 'Inscris din formular', 'Formular public Trevoro.')
`).run(companyId, founderLeadId);

db.prepare(`
  INSERT INTO travel_properties (
    company_id, lead_id, name, city, email, status, partner_plan, subscription_status,
    monthly_price_ron, free_until, activation_source
  )
  VALUES (?, ?, 'Pensiunea Fondator', 'Sibiu', 'fondator@example.test', 'activ',
    'founding_partner', 'free_12_months', 0, date('now', '+12 months'), 'trevoro_landing')
`).run(companyId, founderLeadId);

const signupLeadId = Number(db.prepare(`
  INSERT INTO travel_leads (company_id, name, city, email, source, status, score)
  VALUES (?, 'Pensiunea Formular', 'Cluj', 'formular@example.test', 'trevoro_www', 'nou', 65)
`).run(companyId).lastInsertRowid);

db.prepare(`
  INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details)
  VALUES (?, ?, 'landing_signup', 'Inscris din formular', 'Formular public Trevoro.')
`).run(companyId, signupLeadId);

const paidCompanyId = Number(db.prepare(`
  INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
  VALUES ('Proprietar platit', 'proprietar-platit', 'active', 1, datetime('now'), datetime('now'))
`).run().lastInsertRowid);
const planId = Number(db.prepare("SELECT id FROM plans ORDER BY id ASC LIMIT 1").get()?.id || 1);
const subscriptionId = Number(db.prepare(`
  INSERT INTO company_subscriptions (
    company_id, plan_id, status, seats_included, seats_used, module_overrides,
    billing_currency, billing_email, last_payment_status
  )
  VALUES (?, ?, 'active', 1, 1, '["travel"]', 'ron', 'paid@example.test', 'paid')
`).run(paidCompanyId, planId).lastInsertRowid);

db.prepare(`
  INSERT INTO billing_payments (
    company_id, company_subscription_id, source, payment_kind, status, amount, currency,
    payer_email, paid_at, notes
  )
  VALUES (?, ?, 'stripe', 'subscription', 'paid', 129, 'ron', 'paid@example.test', datetime('now'), 'Test plata activa')
`).run(paidCompanyId, subscriptionId);

db.prepare(`
  INSERT INTO travel_properties (
    company_id, name, city, email, status, partner_plan, subscription_status,
    monthly_price_ron, billing_company_id
  )
  VALUES (?, 'Hotel Platit', 'Oradea', 'paid@example.test', 'activ',
    'standard_monthly', 'active', 129, ?)
`).run(companyId, paidCompanyId);

db.prepare(`
  INSERT INTO travel_properties (
    company_id, name, city, email, status, partner_plan, subscription_status, monthly_price_ron
  )
  VALUES (?, 'Activ Manual', 'Iasi', 'manual@example.test', 'activ', 'manual_activation', 'active', 0)
`).run(companyId);

const staleCompanyId = Number(db.prepare(`
  INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
  VALUES ('Proprietar neachitat', 'proprietar-neachitat', 'active', 1, datetime('now'), datetime('now'))
`).run().lastInsertRowid);
const staleSubscriptionId = Number(db.prepare(`
  INSERT INTO company_subscriptions (
    company_id, plan_id, status, seats_included, seats_used, module_overrides,
    billing_currency, billing_email, last_payment_status
  )
  VALUES (?, ?, 'past_due', 1, 1, '["travel"]', 'ron', 'stale@example.test', 'payment_required')
`).run(staleCompanyId, planId).lastInsertRowid);

db.prepare(`
  INSERT INTO billing_payments (
    company_id, company_subscription_id, source, payment_kind, status, amount, currency,
    payer_email, paid_at, notes
  )
  VALUES (?, ?, 'stripe', 'subscription', 'paid', 129, 'ron', 'stale@example.test', datetime('now', '-3 days'), 'Plata istorica')
`).run(staleCompanyId, staleSubscriptionId);

db.prepare(`
  INSERT INTO travel_properties (
    company_id, name, city, email, status, partner_plan, subscription_status,
    monthly_price_ron, billing_company_id
  )
  VALUES (?, 'Hotel Neachitat Curent', 'Timisoara', 'stale@example.test', 'plata_necesara',
    'standard_monthly', 'payment_required', 129, ?)
`).run(companyId, staleCompanyId);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "travel-dashboard@test.local",
      company_id: companyId,
      company_name: "Travel Dashboard Test",
      module_permissions: ["travel"]
    }
  };
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  const response = await fetch(`${baseUrl}/nexora/travel/dashboard`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(dashboardBarValue(html, "Interesate / înscrieri"), "2");
  assert.equal(kpiValue(html, "Active"), "2");
  assert.equal(kpiValue(html, "Contactate"), "0");
  console.log("travel dashboard stats tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
