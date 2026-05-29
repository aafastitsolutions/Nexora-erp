import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import express from "express";
import session from "express-session";
import { db, migrate } from "../db.js";
import { verifyUser, verifyUserAttempt } from "../auth.js";
import { generateTotpCode, generateTotpSecret, verifyTotpCode } from "../lib/totp.js";
import { registerAuthRoutes } from "../routes/auth-routes.js";

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

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected session cookie");
  return setCookie.split(";")[0];
}

const secret = generateTotpSecret();
const now = Date.UTC(2026, 4, 29, 12, 0, 0);
const token = generateTotpCode(secret, { now });
const verified = verifyTotpCode(secret, token, { now, window: 0 });
assert.equal(verified.ok, true);
assert.equal(verifyTotpCode(secret, token, { now, window: 0, lastUsedCounter: verified.counter }).ok, false);

migrate();

const marker = `totp-test-${Date.now()}-${Math.round(Math.random() * 9999)}`;
const adminEmail = `admin-${marker}@test.local`;
const adminPassword = "AdminTotp123!";
const operatorEmail = `operator-${marker}@test.local`;
const operatorPassword = "OperatorTotp123!";

db.exec("BEGIN");

try {
  const companyId = Number(db.prepare(`
    INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
    VALUES (?, ?, 'active', 20, datetime('now'), datetime('now'))
  `).run(`TOTP Test ${marker}`, marker).lastInsertRowid);

  const adminId = Number(db.prepare(`
    INSERT INTO users (
      email, password_hash, role, company_id, status, is_company_admin,
      module_permissions, created_at
    )
    VALUES (?, ?, 'admin', ?, 'active', 1, ?, datetime('now'))
  `).run(
    adminEmail,
    bcrypt.hashSync(adminPassword, 12),
    companyId,
    JSON.stringify(["dashboard", "accounts"])
  ).lastInsertRowid);

  db.prepare(`
    INSERT INTO users (
      email, password_hash, role, company_id, status, is_company_admin,
      module_permissions, created_at
    )
    VALUES (?, ?, 'operator', ?, 'active', 0, ?, datetime('now'))
  `).run(
    operatorEmail,
    bcrypt.hashSync(operatorPassword, 12),
    companyId,
    JSON.stringify(["dashboard"])
  );

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: `totp-session-${marker}`,
    resave: false,
    saveUninitialized: false
  }));
  registerAuthRoutes(app, { db, verifyUser, verifyUserAttempt });

  const { server, baseUrl } = await listen(app);
  try {
    let res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: adminEmail, password: adminPassword })
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login/totp/setup");
    let cookie = cookieFrom(res);

    let state = db.prepare(`
      SELECT totp_secret, totp_enabled
      FROM users
      WHERE id=?
    `).get(adminId);
    assert.ok(state.totp_secret, "Admin should receive a TOTP secret before setup page");
    assert.equal(Number(state.totp_enabled), 0);

    res = await fetch(`${baseUrl}/login/totp/setup`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie
      },
      body: form({ token: generateTotpCode(state.totp_secret) })
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/nexora-dashboard");

    state = db.prepare(`
      SELECT totp_secret, totp_enabled, totp_confirmed_at
      FROM users
      WHERE id=?
    `).get(adminId);
    assert.equal(Number(state.totp_enabled), 1);
    assert.ok(state.totp_confirmed_at);

    db.prepare("UPDATE users SET totp_last_used_step=NULL WHERE id=?").run(adminId);

    res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: adminEmail, password: adminPassword })
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login/totp");
    cookie = cookieFrom(res);

    res = await fetch(`${baseUrl}/login/totp`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie
      },
      body: form({ token: generateTotpCode(state.totp_secret) })
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/nexora-dashboard");

    res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: operatorEmail, password: operatorPassword })
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/nexora-dashboard");
  } finally {
    await close(server);
  }

  console.log("totp auth tests passed");
} finally {
  db.exec("ROLLBACK");
}
