import dotenv from "dotenv";

dotenv.config();

const API_BASE = "https://api.cloudflare.com/client/v4";
const ZONE_NAME = "trevoro.ro";

const DNS_RECORDS = [
  { type: "MX", name: "@", content: "fake-mx.myhost.ro", priority: 5 },
  { type: "MX", name: "@", content: "mx.zooku.net", priority: 10 },
  { type: "MX", name: "@", content: "mx.zooku.ro", priority: 10 },
  { type: "MX", name: "@", content: "mx.myhost.ro", priority: 10 },
  { type: "MX", name: "@", content: "tar-mx.myhost.ro", priority: 15 },
  { type: "TXT", name: "@", content: "v=spf1 include:myhost.ro -all" },
  { type: "TXT", name: "_dmarc", content: "v=DMARC1; p=none;" },
  { type: "CNAME", name: "mail", content: "mp-gts.zooku.ro", proxied: false },
  { type: "CNAME", name: "webmail", content: "webmail1.zooku.ro", proxied: false },
  { type: "CNAME", name: "_domainkey", content: "_domainkey.myhost.ro", proxied: false },
  { type: "CNAME", name: "_ssp._domainkey", content: "_ssp._domainkey.myhost.ro", proxied: false },
  { type: "CNAME", name: "myp2009._domainkey", content: "myp2009._domainkey.myhost.ro", proxied: false },
  { type: "CNAME", name: "myw2009._domainkey", content: "myw2009._domainkey.myhost.ro", proxied: false },
  { type: "CNAME", name: "autoconfig", content: "autoconfig.zooku.ro", proxied: false },
  { type: "CNAME", name: "autodiscover", content: "autoconfig.zooku.ro", proxied: false },
  { type: "SRV", name: "_submission._tcp", data: { priority: 0, weight: 1, port: 587, target: "mp-gts.zooku.ro" } },
  { type: "SRV", name: "_imaps._tcp", data: { priority: 0, weight: 1, port: 993, target: "mp-gts.zooku.ro" } },
  { type: "SRV", name: "_imap._tcp", data: { priority: 5, weight: 1, port: 143, target: "mp-gts.zooku.ro" } },
  { type: "SRV", name: "_pop3s._tcp", data: { priority: 10, weight: 1, port: 995, target: "mp-gts.zooku.ro" } },
  { type: "SRV", name: "_pop3._tcp", data: { priority: 15, weight: 1, port: 110, target: "mp-gts.zooku.ro" } },
  { type: "SRV", name: "_autodiscover._tcp", data: { priority: 0, weight: 0, port: 443, target: "autoconfig.zooku.ro" } }
];

function token() {
  return String(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "").trim();
}

function absoluteName(name) {
  if (name === "@") return ZONE_NAME;
  return `${name}.${ZONE_NAME}`;
}

function normalizeTarget(value = "") {
  return String(value || "").trim().replace(/\.$/, "");
}

function recordPayload(record) {
  const payload = {
    type: record.type,
    name: absoluteName(record.name),
    ttl: 1
  };

  if (record.type === "SRV") {
    payload.data = {
      ...record.data,
      target: normalizeTarget(record.data.target)
    };
  } else {
    payload.content = normalizeTarget(record.content);
  }

  if (record.type === "MX") payload.priority = record.priority;
  if (record.type === "CNAME") payload.proxied = Boolean(record.proxied);
  return payload;
}

async function cf(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = body.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`Cloudflare API error ${response.status}: ${message}`);
  }
  return body.result;
}

async function zoneId() {
  const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
  const zone = Array.isArray(zones) ? zones.find((item) => item.name === ZONE_NAME) : null;
  if (!zone?.id) throw new Error(`Nu am găsit zona Cloudflare ${ZONE_NAME}.`);
  return zone.id;
}

async function listRecords(zone) {
  const all = [];
  let page = 1;
  for (;;) {
    const result = await cf(`/zones/${zone}/dns_records?per_page=100&page=${page}`);
    all.push(...result);
    if (result.length < 100) break;
    page += 1;
  }
  return all;
}

function sameRecord(left, right) {
  if (left.type !== right.type) return false;
  if (normalizeTarget(left.name) !== normalizeTarget(right.name)) return false;
  if (left.type === "MX") {
    return normalizeTarget(left.content) === normalizeTarget(right.content) &&
      Number(left.priority || 0) === Number(right.priority || 0);
  }
  if (left.type === "SRV") {
    return normalizeTarget(left.data?.target) === normalizeTarget(right.data?.target) &&
      Number(left.data?.priority || 0) === Number(right.data?.priority || 0) &&
      Number(left.data?.weight || 0) === Number(right.data?.weight || 0) &&
      Number(left.data?.port || 0) === Number(right.data?.port || 0);
  }
  return true;
}

async function main() {
  if (!token()) throw new Error("Lipsește CLOUDFLARE_API_TOKEN sau CF_API_TOKEN.");

  const zone = await zoneId();
  const existing = await listRecords(zone);
  const report = [];

  for (const record of DNS_RECORDS) {
    const payload = recordPayload(record);
    const matches = existing.filter((item) => sameRecord(item, payload));
    const exact = matches.find((item) => {
      if (record.type === "SRV") return true;
      return normalizeTarget(item.content) === normalizeTarget(payload.content);
    });

    if (exact) {
      report.push({ action: "kept", type: payload.type, name: payload.name, content: payload.content || payload.data?.target });
      continue;
    }

    const sameTypeName = existing.find((item) => item.type === payload.type && normalizeTarget(item.name) === normalizeTarget(payload.name));
    if (sameTypeName && payload.type !== "MX") {
      await cf(`/zones/${zone}/dns_records/${sameTypeName.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      report.push({ action: "updated", type: payload.type, name: payload.name, content: payload.content || payload.data?.target });
      continue;
    }

    await cf(`/zones/${zone}/dns_records`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    report.push({ action: "created", type: payload.type, name: payload.name, content: payload.content || payload.data?.target });
  }

  console.log(JSON.stringify({ zone: ZONE_NAME, changed: report.filter((item) => item.action !== "kept").length, report }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
