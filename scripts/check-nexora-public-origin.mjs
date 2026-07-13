#!/usr/bin/env node

const publicUrl = process.env.NEXORA_PUBLIC_URL || "https://nexora.aafastitsolutions.ro/login";
const expectedOrigin = process.env.NEXORA_EXPECTED_ORIGIN || "nexora-vps-main";
const expectedText = process.env.NEXORA_EXPECTED_TEXT || "Nexora Login";
const expectedIp = process.env.NEXORA_EXPECTED_IP || "46.225.237.185";
const zoneName = process.env.NEXORA_CF_ZONE || "aafastitsolutions.ro";
const recordName = process.env.NEXORA_CF_RECORD || "nexora.aafastitsolutions.ro";
const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "";
const requireCloudflare = process.argv.includes("--cloudflare");

function ok(message) {
  console.log(`OK ${message}`);
}

function fail(message, detail = "") {
  console.error(`FAIL ${message}`);
  if (detail) console.error(detail);
  process.exitCode = 1;
}

async function checkPublicRoute() {
  let response;
  try {
    response = await fetch(publicUrl, {
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });
  } catch (error) {
    fail(`nu pot accesa ${publicUrl}`, error?.message || String(error));
    return;
  }

  const body = await response.text().catch(() => "");
  const origin = response.headers.get("x-nexora-origin") || "";

  if (response.status !== 200) {
    fail(`status public gresit: ${response.status}`, `URL: ${publicUrl}`);
  } else {
    ok(`status public 200 pentru ${publicUrl}`);
  }

  if (origin !== expectedOrigin) {
    fail(
      `origin public gresit: ${origin || "(lipsa header)"}`,
      `Asteptat: X-Nexora-Origin: ${expectedOrigin}`
    );
  } else {
    ok(`origin public confirmat: ${origin}`);
  }

  if (!body.includes(expectedText)) {
    fail(`text lipsa in pagina publica: ${expectedText}`);
  } else {
    ok(`pagina publica este Nexora login: ${expectedText}`);
  }
}

async function cloudflareRequest(pathname, params = {}) {
  const url = new URL(`https://api.cloudflare.com/client/v4/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${cfToken}`,
      "Content-Type": "application/json"
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload?.errors?.[0]?.message || `Cloudflare API ${response.status}`);
  }
  return payload;
}

async function checkCloudflareDns() {
  if (!cfToken) {
    if (requireCloudflare) fail("lipseste CLOUDFLARE_API_TOKEN/CF_API_TOKEN pentru verificarea DNS");
    return;
  }

  try {
    const zones = await cloudflareRequest("zones", { name: zoneName });
    const zoneId = zones.result?.[0]?.id;
    if (!zoneId) throw new Error(`zona Cloudflare lipsa: ${zoneName}`);

    const records = await cloudflareRequest(`zones/${zoneId}/dns_records`, { name: recordName });
    const record = (records.result || []).find((item) => item.name === recordName);
    if (!record) throw new Error(`record DNS lipsa: ${recordName}`);

    const expected = { type: "A", content: expectedIp, proxied: true };
    if (record.type !== expected.type || record.content !== expected.content || record.proxied !== expected.proxied) {
      fail(
        `DNS Cloudflare gresit pentru ${recordName}`,
        `Gasit: ${record.type} ${record.content} proxied=${record.proxied}; asteptat: A ${expectedIp} proxied=true`
      );
      return;
    }

    ok(`DNS Cloudflare confirmat: ${record.type} ${record.name} -> ${record.content} proxied=${record.proxied}`);
  } catch (error) {
    fail("nu pot verifica DNS Cloudflare", error?.message || String(error));
  }
}

await checkPublicRoute();
await checkCloudflareDns();

if (process.exitCode) process.exit(process.exitCode);
