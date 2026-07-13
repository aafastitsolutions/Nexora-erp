import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.join(process.cwd(), ".env");
const MAILBOX = "contact@trevoro.ro";

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input.trim()));
  });
}

function parseEnv(content = "") {
  const lines = content.split(/\r?\n/);
  const order = [];
  const values = new Map();

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      order.push({ type: "raw", value: line });
      continue;
    }
    const key = match[1];
    if (!values.has(key)) order.push({ type: "key", key });
    values.set(key, match[2]);
  }

  return { order, values };
}

function serializeValue(value = "") {
  const text = String(value || "");
  if (!/[#\s"'\\]/.test(text)) return text;
  return JSON.stringify(text);
}

function writeEnv({ order, values }) {
  const seen = new Set();
  const lines = [];

  for (const item of order) {
    if (item.type === "raw") {
      lines.push(item.value);
      continue;
    }
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    lines.push(`${item.key}=${values.get(item.key) ?? ""}`);
  }

  for (const key of values.keys()) {
    if (!seen.has(key)) lines.push(`${key}=${values.get(key) ?? ""}`);
  }

  fs.writeFileSync(ENV_PATH, `${lines.join("\n").replace(/\n+$/, "")}\n`);
}

async function main() {
  const password = process.argv[2] || process.env.TREVORO_MAILBOX_PASSWORD || await readStdin();
  if (!password || password.length < 4) {
    throw new Error("Parola mailbox-ului lipsește sau este prea scurtă.");
  }

  const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const env = parseEnv(current);
  const set = (key, value) => env.values.set(key, serializeValue(value));

  set("SMTP_HOST", "mail.zooku.ro");
  set("SMTP_PORT", "465");
  set("SMTP_SECURE", "true");
  set("SMTP_USER", MAILBOX);
  set("SMTP_PASS", password);
  set("MAIL_FROM", MAILBOX);
  set("TREVORO_MAIL_PASS", password);
  set("TREVORO_IMAP_HOST", "mail.zooku.ro");
  set("TREVORO_IMAP_PORT", "993");
  set("TREVORO_IMAP_SECURE", "true");
  set("TREVORO_IMAP_USER", MAILBOX);
  set("TREVORO_IMAP_PASS", password);
  set("TREVORO_IMAP_MAILBOX", "INBOX");
  set("TREVORO_REPLY_TO", MAILBOX);
  if (!env.values.has("TREVORO_OUTREACH_CC")) set("TREVORO_OUTREACH_CC", MAILBOX);

  writeEnv(env);

  console.log(JSON.stringify({
    ok: true,
    mailbox: MAILBOX,
    smtp: "mail.zooku.ro:465",
    imap: "mail.zooku.ro:993"
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
