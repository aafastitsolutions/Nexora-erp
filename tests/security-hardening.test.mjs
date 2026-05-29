import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { setupAppMiddleware } from "../lib/bootstrap.js";

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

const app = express();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-session-"));
app.set("trust proxy", 1);
app.disable("x-powered-by");
setupAppMiddleware({
  app,
  dirname: tmpDir,
  sessionSecret: "security-hardening-test-secret",
  isProduction: true
});
app.get("/ping", (req, res) => {
  req.session.count = Number(req.session.count || 0) + 1;
  res.type("json").send(JSON.stringify({ count: req.session.count }));
});

const { server, baseUrl } = await listen(app);
try {
  const res = await fetch(`${baseUrl}/ping`);
  const cookie = res.headers.get("set-cookie");
  const firstPayload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(firstPayload.count, 1);
  assert.match(cookie || "", /HttpOnly/);
  assert.match(cookie || "", /SameSite=Lax/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(res.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.equal(res.headers.get("x-powered-by"), null);

  const secondRes = await fetch(`${baseUrl}/ping`, {
    headers: { cookie: String(cookie || "").split(";")[0] }
  });
  const secondPayload = await secondRes.json();
  assert.equal(secondPayload.count, 2);

  console.log("security hardening tests passed");
} finally {
  await close(server);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
