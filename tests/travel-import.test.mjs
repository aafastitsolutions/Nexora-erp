import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import PizZip from "pizzip";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-import-"));
process.env.DB_PATH = path.join(tmpDir, "travel-import.db");

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

function escapeXml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
}

function makeXlsxBuffer(rows = []) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

migrate();

const companyId = Number(db.prepare(`
  INSERT INTO companies (name, slug, status, max_users, created_at, updated_at)
  VALUES ('Travel Import Test', 'travel-import-test', 'active', 1, datetime('now'), datetime('now'))
`).run().lastInsertRowid);

db.prepare(`
  INSERT INTO travel_leads (company_id, name, city, phone, email, website, source, status, score)
  VALUES (?, 'Existing Hotel', 'Brasov', '0711111111', 'existing@example.test', 'https://existing.test', 'manual', 'nou', 0)
`).run(companyId);
db.prepare(`
  INSERT INTO travel_properties (company_id, name, city, phone, email, website, status)
  VALUES (?, 'Converted Hotel', 'Cluj', '0733333333', 'converted@example.test', 'https://converted.test', 'activ')
`).run(companyId);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  req.session = {
    user: {
      id: 1,
      email: "travel-import@test.local",
      company_id: companyId,
      company_name: "Travel Import Test",
      module_permissions: ["travel"]
    }
  };
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  const csv = [
    "Telefon,Nume,Oras,Judet,Tip,Adresa,Email,Website,Facebook,Instagram,Sursa,Reviews",
    "0722222222,Hotel Nou,Sibiu,Sibiu,hotel,Strada 1,nou@example.test,https://nou.test,https://facebook.test,,csv,72",
    "+40 711 111 111,Existing Phone Duplicate,Brasov,Brasov,hotel,Strada 2,alt@example.test,https://alt.test,,,csv,0",
    "0744444444,Existing Website Duplicate,Brasov,Brasov,hotel,Strada 3,webdup@example.test,https://www.existing.test/?utm=1,,,csv,0",
    "+40 733 333 333,Converted Property Duplicate,Cluj,Cluj,hotel,Strada 4,propertydup@example.test,https://other.test,,,csv,0",
    "0766666666,Hotel Nou,Sibiu,Sibiu,hotel,Strada 5,other@example.test,https://other2.test,,,csv,0",
    ",Fara contact,,,,,,,,,csv,0"
  ].join("\n");

  const body = new FormData();
  body.set("csv_file", new Blob([csv], { type: "text/csv" }), "travel.csv");

  let response = await fetch(`${baseUrl}/nexora/travel/imports`, {
    method: "POST",
    body
  });
  let html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Preview import/);
  assert.match(html, /Confirmă import/);
  assert.match(html, /Hotel Nou/);

  const token = html.match(/name="import_token" value="([^"]+)"/)?.[1];
  assert.ok(token);

  const confirmBody = new URLSearchParams({
    import_token: token,
    map_phone: "0",
    map_name: "1",
    map_city: "2",
    map_county: "3",
    map_property_type: "4",
    map_address: "5",
    map_email: "6",
    map_website: "7",
    map_facebook: "8",
    map_instagram: "9",
    map_source: "10",
    map_google_reviews: "11"
  });

  response = await fetch(`${baseUrl}/nexora/travel/imports/confirm`, {
    method: "POST",
    body: confirmBody
  });
  html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Raport import/);
  assert.match(html, /Skipped duplicates/);
  assert.match(html, /Lead invalid/);
  assert.match(html, /Export raport CSV/);
  assert.match(html, /Duplicat după phone/);
  assert.match(html, /Duplicat după website/);
  assert.match(html, /Duplicat după name\+city/);

  const created = db.prepare("SELECT * FROM travel_leads WHERE company_id=? AND email='nou@example.test'").get(companyId);
  assert.ok(created);
  assert.equal(created.status, "nou");
  assert.equal(Number(created.score), 85);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_leads WHERE company_id=?").get(companyId).n, 2);

  const reportToken = html.match(/report\.csv\?token=([a-f0-9]+)/)?.[1];
  assert.ok(reportToken);
  response = await fetch(`${baseUrl}/nexora/travel/imports/report.csv?token=${reportToken}`);
  const csvReport = await response.text();
  assert.equal(response.status, 200);
  assert.match(csvReport, /skipped_duplicate/);
  assert.match(csvReport, /created/);

  const xlsxBuffer = makeXlsxBuffer([
    ["name", "property_type", "city", "county", "address", "phone", "email", "website", "facebook", "instagram", "source", "google_reviews"],
    ["Hotel Excel", "hotel", "Oradea", "Bihor", "Strada Excel", "0777777777", "excel@example.test", "https://excel.test", "", "", "xlsx", 55]
  ]);

  const xlsxBody = new FormData();
  xlsxBody.set(
    "csv_file",
    new Blob([xlsxBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "travel.xlsx"
  );

  response = await fetch(`${baseUrl}/nexora/travel/imports`, {
    method: "POST",
    body: xlsxBody
  });
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Preview import/);
  assert.match(html, /travel\.xlsx/);

  const xlsxToken = html.match(/name="import_token" value="([^"]+)"/)?.[1];
  assert.ok(xlsxToken);
  response = await fetch(`${baseUrl}/nexora/travel/imports/confirm`, {
    method: "POST",
    body: new URLSearchParams({
      import_token: xlsxToken,
      map_name: "0",
      map_property_type: "1",
      map_city: "2",
      map_county: "3",
      map_address: "4",
      map_phone: "5",
      map_email: "6",
      map_website: "7",
      map_facebook: "8",
      map_instagram: "9",
      map_source: "10",
      map_google_reviews: "11"
    })
  });
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Raport import/);

  const excelCreated = db.prepare("SELECT * FROM travel_leads WHERE company_id=? AND email='excel@example.test'").get(companyId);
  assert.ok(excelCreated);
  assert.equal(excelCreated.status, "nou");
  assert.equal(Number(excelCreated.score), 75);

  console.log("travel import tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
