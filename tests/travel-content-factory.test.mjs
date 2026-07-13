import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

process.env.OPENAI_API_KEY = "";
process.env.OPENAI_MODEL = "";
process.env.FACEBOOK_CLIENT_ID = "facebook-client-test";
process.env.FACEBOOK_CLIENT_SECRET = "facebook-secret-test";
process.env.NEXORA_FACEBOOK_REDIRECT_URI = "http://127.0.0.1/oauth/facebook/callback";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-travel-content-factory-"));
process.env.DB_PATH = path.join(tmpDir, "travel-content-factory.db");

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
    company_id, name, property_type, city, county, address, phone, email, website, status
  )
  VALUES (?, 'Cabana Munte Verde', 'cabană', 'Bran', 'Brașov', 'Strada Principală 10', '0711111111', 'verde@example.test', 'https://verde.example.test', 'activ')
`).run(companyId).lastInsertRowid);
assert.ok(propertyId > 0);

const testSession = {
  user: {
    id: 1,
    email: "travel-content@test.local",
    company_id: companyId,
    company_name: "Travel Content Factory Test",
    module_permissions: ["travel"]
  }
};

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  if (req.path.startsWith("/nexora") || req.path.startsWith("/oauth")) {
    req.session = testSession;
  }
  next();
});

const requireAuth = (req, res, next) => req.session?.user ? next() : res.status(401).send("No auth");
registerTravelRoutes(app, { db, requireAuth });

const { server, baseUrl } = await listen(app);

try {
  let response = await fetch(`${baseUrl}/nexora/travel/content-factory`);
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Travel Content Factory/);
  assert.match(html, /Cabana Munte Verde/);

  response = await fetch(`${baseUrl}/nexora/travel/content-factory/generate`, {
    method: "POST",
    body: new URLSearchParams({
      property_id: String(propertyId),
      content_seo_article: "1",
      content_facebook_post: "1",
      content_instagram_post: "1",
      content_tiktok_script: "1",
      content_newsletter: "1"
    }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /\/nexora\/travel\/content-factory\?ok=content_generated/);

  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_content_jobs WHERE company_id=?").get(companyId).n, 5);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_blog_articles WHERE company_id=? AND status='draft'").get(companyId).n, 1);
  assert.equal(db.prepare("SELECT category FROM travel_blog_articles WHERE company_id=?").get(companyId).category, "Cabane");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_social_posts WHERE company_id=? AND status='draft'").get(companyId).n, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_social_posts WHERE company_id=? AND platform='tiktok'").get(companyId).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM travel_social_posts WHERE company_id=? AND platform='newsletter'").get(companyId).n, 1);

	  response = await fetch(`${baseUrl}/nexora/travel/social-posts`);
	  html = await response.text();
	  assert.equal(response.status, 200);
	  assert.match(html, /Social Posts/);
		  assert.match(html, /TikTok/);
		  assert.match(html, /Procesează coada/);
		  assert.match(html, /Trevoro România/);
		  assert.match(html, /Conectează Facebook/);
		  assert.match(html, /OAuth Facebook: configurat/);

		  response = await fetch(`${baseUrl}/oauth/facebook/start`, { redirect: "manual" });
		  assert.equal(response.status, 302);
		  const facebookLocation = response.headers.get("location") || "";
		  assert.match(facebookLocation, /^https:\/\/www\.facebook\.com\/dialog\/oauth/);
		  const facebookAuthUrl = new URL(facebookLocation);
		  assert.equal(facebookAuthUrl.searchParams.get("client_id"), "facebook-client-test");
		  assert.equal(facebookAuthUrl.searchParams.get("redirect_uri"), "http://127.0.0.1/oauth/facebook/callback");
		  assert.match(facebookAuthUrl.searchParams.get("scope") || "", /pages_manage_posts/);

	  const facebookPost = db.prepare("SELECT id FROM travel_social_posts WHERE company_id=? AND platform='facebook' LIMIT 1").get(companyId);
	  assert.ok(facebookPost?.id);
	  response = await fetch(`${baseUrl}/nexora/travel/social-posts/${facebookPost.id}/queue`, {
	    method: "POST",
	    body: new URLSearchParams({}),
	    redirect: "manual"
	  });
	  assert.equal(response.status, 302);
	  assert.match(response.headers.get("location") || "", /\/nexora\/travel\/social-posts\?ok=social_queued/);
	  assert.equal(
	    db.prepare("SELECT COUNT(*) AS n FROM travel_social_publish_jobs WHERE company_id=? AND social_post_id=? AND status='manual_required'").get(companyId, facebookPost.id).n,
	    1
	  );

	  response = await fetch(`${baseUrl}/nexora/travel/social-accounts`, {
	    method: "POST",
	    body: new URLSearchParams({
	      platform: "facebook",
	      account_name: "Trevoro România",
	      account_handle: "facebook.com/profile.php?id=61590311832249",
	      page_id: "61590311832249",
	      access_token: "fake-token-for-test",
	      status: "active",
	      auto_publish: "1"
	    }),
	    redirect: "manual"
	  });
	  assert.equal(response.status, 302);
	  assert.match(response.headers.get("location") || "", /\/nexora\/travel\/social-posts\?ok=social_account/);
	  assert.equal(db.prepare("SELECT status FROM travel_social_accounts WHERE company_id=? AND platform='facebook'").get(companyId).status, "active");
  assert.equal(
    db.prepare("SELECT status FROM travel_social_publish_jobs WHERE company_id=? AND social_post_id=?").get(companyId, facebookPost.id).status,
    "queued"
  );

  const tiktokPost = db.prepare("SELECT id FROM travel_social_posts WHERE company_id=? AND platform='tiktok' LIMIT 1").get(companyId);
  assert.ok(tiktokPost?.id);
  response = await fetch(`${baseUrl}/nexora/travel/social-posts/${tiktokPost.id}/media`, {
    method: "POST",
    body: new URLSearchParams({ media_url: "https://www.trevoro.ro/media/test-video.mp4" }),
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /\/nexora\/travel\/social-posts\?ok=social_media/);
  assert.equal(
    db.prepare("SELECT media_url FROM travel_social_posts WHERE company_id=? AND id=?").get(companyId, tiktokPost.id).media_url,
    "https://www.trevoro.ro/media/test-video.mp4"
  );

	  response = await fetch(`${baseUrl}/nexora/travel/seo-pages`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /SEO Pages/);
  assert.match(html, /Sitemap XML/);

  response = await fetch(`${baseUrl}/nexora/travel/campaigns`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Campaigns/);
  assert.match(html, /local_fallback/);

  response = await fetch(`${baseUrl}/sitemap.xml`);
  const sitemap = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/xml/);
  assert.match(sitemap, /\/trevoro\/parteneri/);
  assert.match(sitemap, new RegExp(`/properties/${propertyId}-cabana-munte-verde-bran`));

  response = await fetch(`${baseUrl}/trevoro/proprietati/${propertyId}-cabana-munte-verde-bran`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Cabana Munte Verde/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /Hotel/);
  assert.match(html, /LodgingBusiness/);
  assert.match(html, /TouristAccommodation/);
  assert.match(html, /<meta name="description"/);

  response = await fetch(`${baseUrl}/trevoro/parteneri`);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<link rel="canonical"/);
  assert.match(html, /application\/ld\+json/);

  console.log("travel content factory tests passed");
} finally {
  await close(server);
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
