import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-trevoro-blog-"));
process.env.DB_PATH = path.join(tmpDir, "trevoro-blog.db");

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

const propertyId = Number(db.prepare(`
  INSERT INTO travel_properties (
    company_id, name, property_type, city, county, phone, email, website, status
  )
  VALUES (?, 'Cabana Blog Verde', 'cabană', 'Bran', 'Brașov', '0711111111', 'blog@example.test', 'https://blog.example.test', 'activ')
`).run(companyId).lastInsertRowid);
assert.ok(propertyId > 0);

const articleId = Number(db.prepare(`
  INSERT INTO travel_blog_articles (
    company_id, property_id, title, slug, meta_title, meta_description, content, keywords, category, status
  )
  VALUES (
    ?, ?, 'Top cabane cu jacuzzi în Bran', 'top-cabane-cu-jacuzzi-bran',
    'Top cabane cu jacuzzi în Bran | Trevoro',
    'Ghid Trevoro pentru cabane cu jacuzzi în Bran și idei de weekend la munte.',
    'Top cabane cu jacuzzi în Bran\n\nBran rămâne una dintre cele mai căutate destinații pentru weekenduri la munte.\n\nAlege o cabană cu facilități clare și comunicare locală.',
    'cabane Bran, jacuzzi, Trevoro', 'Cabane', 'published'
  )
`).run(companyId, propertyId).lastInsertRowid);
assert.ok(articleId > 0);

db.prepare(`
  INSERT INTO travel_blog_articles (
    company_id, title, slug, meta_description, content, keywords, category, status
  )
  VALUES (?, 'Draft ascuns', 'draft-ascuns', 'Nu trebuie public', 'Draft intern', 'draft', 'Ghiduri', 'draft')
`).run(companyId);

const app = express();
const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/blog`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Trevoro Blog/);
  assert.match(html, /Cabane/);
  assert.match(html, /Hoteluri/);
  assert.match(html, /Pensiuni/);
  assert.match(html, /Destinații/);
  assert.match(html, /Ghiduri/);
  assert.match(html, /Top cabane cu jacuzzi în Bran/);
  assert.doesNotMatch(html, /Draft ascuns/);
  assert.match(html, /<meta name="description"/);
  assert.match(html, /og:title/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /Blog/);

  response = await fetch(`${baseUrl}/blog/categorie/cabane`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Cabane - Trevoro Blog/);
  assert.match(html, /Top cabane cu jacuzzi în Bran/);
  assert.match(html, /canonical/);

  response = await fetch(`${baseUrl}/blog/top-cabane-cu-jacuzzi-bran`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Top cabane cu jacuzzi în Bran/);
  assert.match(html, /BlogPosting/);
  assert.match(html, /og:type" content="article/);
  assert.match(html, /Ghid Trevoro pentru cabane cu jacuzzi/);
  assert.match(html, /Bran rămâne una dintre cele mai căutate destinații/);

  response = await fetch(`${baseUrl}/blog/draft-ascuns`);
  html = await response.text();
  assert.equal(response.status, 404);
  assert.match(html, /Articolul nu a fost găsit/);

  response = await fetch(`${baseUrl}/sitemap.xml`);
  const sitemap = await response.text();
  assert.equal(response.status, 200);
  assert.match(sitemap, /\/blog/);
  assert.match(sitemap, /\/blog\/categorie\/cabane/);
  assert.match(sitemap, /\/blog\/categorie\/hoteluri/);
  assert.match(sitemap, /\/blog\/top-cabane-cu-jacuzzi-bran/);
  assert.doesNotMatch(sitemap, /draft-ascuns/);

  console.log("trevoro blog tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
