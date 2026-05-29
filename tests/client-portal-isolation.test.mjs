import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { db, migrate } from "../db.js";
import { registerClientPortalRoutes } from "../routes/client-portal-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

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

const marker = `portal-test-${Date.now()}-${Math.round(Math.random() * 9999)}`;
const sessions = {};
let companyId;
let clientAId;
let clientBId;
let projectBId;
let invoiceBId;

db.exec("BEGIN");

try {
  const company = db.prepare(`
    INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
    VALUES (?, ?, 'active', 20, datetime('now'), datetime('now'))
  `).run(`Portal Test ${marker}`, marker);
  companyId = Number(company.lastInsertRowid);

  clientAId = Number(db.prepare(`
    INSERT INTO clients (cui, name, company_id, email)
    VALUES (?, ?, ?, ?)
  `).run(`${marker}-A`, `Client A ${marker}`, companyId, `a-${marker}@test.local`).lastInsertRowid);

  clientBId = Number(db.prepare(`
    INSERT INTO clients (cui, name, company_id, email)
    VALUES (?, ?, ?, ?)
  `).run(`${marker}-B`, `Client B ${marker}`, companyId, `b-${marker}@test.local`).lastInsertRowid);

  const userAId = Number(db.prepare(`
    INSERT INTO users (email, password_hash, role, company_id, status, is_company_admin, module_permissions, client_id)
    VALUES (?, 'hash', 'client', ?, 'active', 0, '[]', ?)
  `).run(`client-a-${marker}@test.local`, companyId, clientAId).lastInsertRowid);

  const userBId = Number(db.prepare(`
    INSERT INTO users (email, password_hash, role, company_id, status, is_company_admin, module_permissions, client_id)
    VALUES (?, 'hash', 'client', ?, 'active', 0, '[]', ?)
  `).run(`client-b-${marker}@test.local`, companyId, clientBId).lastInsertRowid);

  sessions.a = {
    id: userAId,
    email: `client-a-${marker}@test.local`,
    role: "client",
    company_id: companyId,
    client_id: clientAId,
    company_name: `Portal Test ${marker}`
  };
  sessions.b = {
    id: userBId,
    email: `client-b-${marker}@test.local`,
    role: "client",
    company_id: companyId,
    client_id: clientBId,
    company_name: `Portal Test ${marker}`
  };

  db.prepare(`
    INSERT INTO quotes (quote_number, year, seq, client_id, status, title, total, currency, company_id)
    VALUES (?, 2026, 1, ?, 'SENT', ?, 100, 'RON', ?)
  `).run(`QA-${marker}`, clientAId, `Offer A ${marker}`, companyId);
  db.prepare(`
    INSERT INTO quotes (quote_number, year, seq, client_id, status, title, total, currency, company_id)
    VALUES (?, 2026, 2, ?, 'SENT', ?, 200, 'RON', ?)
  `).run(`QB-${marker}`, clientBId, `Offer B ${marker}`, companyId);

  projectBId = Number(db.prepare(`
    INSERT INTO projects (company_id, project_code, title, client_id, status, priority)
    VALUES (?, ?, ?, ?, 'ACTIV', 'MEDIE')
  `).run(companyId, `PB-${marker}`, `Project B ${marker}`, clientBId).lastInsertRowid);

  invoiceBId = Number(db.prepare(`
    INSERT INTO facturi (factura_nr, an, seq, client_id, status, moneda, total, company_id, pdf_path)
    VALUES (?, 2026, 1, ?, 'EMISA', 'RON', 300, ?, 'contracts/missing.pdf')
  `).run(`FB-${marker}`, clientBId, companyId).lastInsertRowid);

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    req.session = { user: sessions[String(req.headers["x-test-client"] || "a")] };
    next();
  });
  const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
  registerClientPortalRoutes(app, { db, requireAuth, __dirname: appRoot });

  const { server, baseUrl } = await listen(app);
  try {
    const offersRes = await fetch(`${baseUrl}/client-portal/offers`, {
      headers: { "x-test-client": "a" }
    });
    const offersHtml = await offersRes.text();
    assert.equal(offersRes.status, 200);
    assert.match(offersHtml, new RegExp(`Offer A ${marker}`));
    assert.doesNotMatch(offersHtml, new RegExp(`Offer B ${marker}`));

    const projectRes = await fetch(`${baseUrl}/client-portal/projects/${projectBId}`, {
      headers: { "x-test-client": "a" }
    });
    assert.equal(projectRes.status, 404);

    const ticketSubject = `Ticket spoof ${marker}`;
    const ticketRes = await fetch(`${baseUrl}/client-portal/tickets`, {
      method: "POST",
      headers: {
        "x-test-client": "a",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form({ subject: ticketSubject, priority: "URGENTA", client_id: clientBId })
    });
    assert.equal(ticketRes.status, 200);
    const ticket = db.prepare(`
      SELECT client_id
      FROM client_portal_tickets
      WHERE company_id=? AND subject=?
    `).get(companyId, ticketSubject);
    assert.equal(Number(ticket.client_id), clientAId);

    const invoiceRes = await fetch(`${baseUrl}/client-portal/invoices/${invoiceBId}/download`, {
      headers: { "x-test-client": "a" }
    });
    assert.equal(invoiceRes.status, 404);
  } finally {
    await close(server);
  }

  console.log("client portal isolation tests passed");
} finally {
  db.exec("ROLLBACK");
}
