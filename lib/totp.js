import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(value = "") {
  const clean = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter, digits = 6) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

function timingSafeEqualText(left = "", right = "") {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

export function formatTotpSecret(secret = "") {
  return String(secret || "").replace(/(.{4})/g, "$1 ").trim();
}

export function buildTotpUri({ secret, accountName, issuer = "Nexora ERP" }) {
  const label = `${issuer}:${String(accountName || "").trim()}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateTotpCode(secret, { now = Date.now(), stepSeconds = 30, digits = 6 } = {}) {
  const counter = Math.floor(now / 1000 / stepSeconds);
  return hotp(secret, counter, digits);
}

export function verifyTotpCode(secret, token, {
  now = Date.now(),
  stepSeconds = 30,
  digits = 6,
  window = 1,
  lastUsedCounter = null
} = {}) {
  const normalized = String(token || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(normalized)) return { ok: false, reason: "format" };
  const counter = Math.floor(now / 1000 / stepSeconds);

  for (let drift = -window; drift <= window; drift += 1) {
    const candidateCounter = counter + drift;
    if (candidateCounter < 0) continue;
    const expected = hotp(secret, candidateCounter, digits);
    if (!timingSafeEqualText(expected, normalized)) continue;
    if (lastUsedCounter != null && Number(lastUsedCounter) >= candidateCounter) {
      return { ok: false, reason: "replay", counter: candidateCounter };
    }
    return { ok: true, counter: candidateCounter };
  }

  return { ok: false, reason: "invalid" };
}
