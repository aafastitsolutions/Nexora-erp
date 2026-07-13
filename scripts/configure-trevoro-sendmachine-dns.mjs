import dotenv from "dotenv";

dotenv.config();

const API_BASE = "https://api.cloudflare.com/client/v4";
const ZONE_NAME = "trevoro.ro";
const SPF_RECORD = "v=spf1 include:myhost.ro include:spf.sendmachine.info -all";
const DKIM_NAME = `smkey._domainkey.${ZONE_NAME}`;
const DKIM_TARGET = "dkim.sendmachine.info";

function arg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : "";
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

function token() {
  return String(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "").trim();
}

function sendmachineVerifyRecord() {
  const raw = String(arg("verify") || process.env.SENDMACHINE_VERIFY || "").trim();
  if (!raw) return "";
  return raw.startsWith("sm-verify=") ? raw : `sm-verify=${raw}`;
}

function normalizeTarget(value = "") {
  return String(value || "").trim().replace(/\.$/, "");
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
  if (!zone?.id) throw new Error(`Nu am gasit zona Cloudflare ${ZONE_NAME}.`);
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

async function saveRecord(zone, action, payload) {
  if (isDryRun()) return { action: `dry-${action}`, ...payload };

  if (action === "create") {
    await cf(`/zones/${zone}/dns_records`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } else if (action === "update") {
    await cf(`/zones/${zone}/dns_records/${payload.id}`, {
      method: "PUT",
      body: JSON.stringify(payload.record)
    });
  }

  return { action, ...(payload.record || payload) };
}

async function upsertRootVerification(zone, records, content) {
  const existing = records.find((record) =>
    record.type === "TXT" &&
    normalizeTarget(record.name) === ZONE_NAME &&
    String(record.content || "") === content
  );
  if (existing) return { action: "kept", type: "TXT", name: ZONE_NAME, content };

  return saveRecord(zone, "create", {
    type: "TXT",
    name: ZONE_NAME,
    content,
    ttl: 1
  });
}

async function upsertSpf(zone, records) {
  const existing = records.find((record) =>
    record.type === "TXT" &&
    normalizeTarget(record.name) === ZONE_NAME &&
    String(record.content || "").trim().toLowerCase().startsWith("v=spf1")
  );

  if (existing?.content === SPF_RECORD) {
    return { action: "kept", type: "TXT", name: ZONE_NAME, content: SPF_RECORD };
  }

  const payload = {
    type: "TXT",
    name: ZONE_NAME,
    content: SPF_RECORD,
    ttl: 1
  };

  if (existing) {
    return saveRecord(zone, "update", { id: existing.id, record: payload });
  }

  return saveRecord(zone, "create", payload);
}

async function upsertDkim(zone, records) {
  const existing = records.find((record) =>
    record.type === "CNAME" && normalizeTarget(record.name) === DKIM_NAME
  );

  const payload = {
    type: "CNAME",
    name: DKIM_NAME,
    content: DKIM_TARGET,
    ttl: 1,
    proxied: false
  };

  if (existing?.content === DKIM_TARGET && existing.proxied === false) {
    return { action: "kept", ...payload };
  }

  if (existing) {
    return saveRecord(zone, "update", { id: existing.id, record: payload });
  }

  return saveRecord(zone, "create", payload);
}

async function main() {
  if (!token()) throw new Error("Lipseste CLOUDFLARE_API_TOKEN sau CF_API_TOKEN.");

  const verify = sendmachineVerifyRecord();
  if (!verify) {
    throw new Error("Lipseste valoarea Sendmachine. Ruleaza cu --verify=sm-verify=VALOAREA_EXACTA.");
  }

  const zone = await zoneId();
  const records = await listRecords(zone);
  const report = [];

  report.push(await upsertRootVerification(zone, records, verify));
  report.push(await upsertDkim(zone, records));
  report.push(await upsertSpf(zone, records));

  console.log(JSON.stringify({
    zone: ZONE_NAME,
    dryRun: isDryRun(),
    changed: report.filter((item) => !["kept", "dry-kept"].includes(item.action)).length,
    report
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
