#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { db } from "../db.js";

dotenv.config();

function safeText(value = "") {
  return String(value || "").trim();
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashTrevoroPassword(password = "", salt = "") {
  return base64Url(pbkdf2Sync(String(password || ""), String(salt || ""), 120_000, 32, "sha256"));
}

function createPasswordCredentials(password = "") {
  const salt = base64Url(randomBytes(18));
  return { salt, hash: hashTrevoroPassword(password, salt) };
}

function temporaryPassword() {
  return `Trevoro${randomBytes(4).toString("hex")}A1`;
}

function publicBaseUrl() {
  return safeText(process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "https://www.trevoro.ro").replace(/\/+$/, "");
}

function slugify(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function publicPropertySlug(property = {}) {
  return `${Number(property.id || 0)}-${slugify([property.name, property.city].filter(Boolean).join(" "))}`;
}

function csvEscape(value = "") {
  const text = safeText(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const dryRun = process.argv.includes("--dry-run");
const company = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
const companyId = Number(company?.id || 0);
if (!companyId) throw new Error("Nu am gasit companie activa.");

const rows = db.prepare(`
  SELECT *
  FROM travel_properties
  WHERE company_id=?
    AND status='activ'
    AND COALESCE(email, '')<>''
    AND (
      COALESCE(account_email, '')=''
      OR COALESCE(password_hash, '')=''
      OR COALESCE(password_salt, '')=''
      OR COALESCE(account_status, '')<>'active'
    )
  ORDER BY id ASC
`).all(companyId);

const output = [];
const update = db.prepare(`
  UPDATE travel_properties
  SET account_email=?,
      password_salt=?,
      password_hash=?,
      account_status='active',
      updated_at=datetime('now')
  WHERE id=? AND company_id=?
`);

const site = publicBaseUrl();
for (const property of rows) {
  const password = temporaryPassword();
  const credentials = createPasswordCredentials(password);
  const accountEmail = safeText(property.account_email || property.email).toLowerCase();
  if (!dryRun) {
    update.run(accountEmail, credentials.salt, credentials.hash, property.id, companyId);
  }
  output.push({
    id: Number(property.id || 0),
    name: safeText(property.name),
    email: accountEmail,
    password,
    login_url: `${site}/login?next=%2Fdashboard%2Fpartner`,
    property_url: `${site}/properties/${publicPropertySlug(property)}`
  });
}

const reportDir = path.join(process.cwd(), "utile", "rapoarte", "conturi");
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportDir, `trevoro-owner-temporary-passwords-${stamp}.csv`);
const columns = ["id", "name", "email", "password", "login_url", "property_url"];
fs.writeFileSync(
  reportPath,
  `${columns.join(",")}\n${output.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`,
  "utf8"
);

console.log(JSON.stringify({
  ok: true,
  dryRun,
  prepared: output.length,
  reportPath,
  rows: output.map((row) => ({ id: row.id, name: row.name, email: row.email.replace(/(^..).+(@.*$)/, "$1***$2"), login_url: row.login_url }))
}, null, 2));

db.close();
