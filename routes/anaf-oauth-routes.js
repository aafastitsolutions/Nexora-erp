import crypto from "crypto";

const DEFAULT_ANAF_REDIRECT_URI = "https://minicrm.qr-lab.ro/oauth/anaf/callback";
const DEFAULT_ANAF_AUTHORIZE_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/authorize";
const DEFAULT_ANAF_TOKEN_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/token";
const DEFAULT_INVITE_TTL_HOURS = 24;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_RAW_LENGTH = 16;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildRedirectUrl(basePath, status, message) {
  const url = new URL(basePath, "http://localhost");
  if (status) url.searchParams.set("oauth", status);
  if (message) url.searchParams.set("message", message);
  return `${url.pathname}${url.search}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function logOauthEvent(db, companyId, eventType, status, details, query) {
  db.prepare(`
    INSERT INTO anaf_oauth_logs (company_id, event_type, status, details, query_string)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    companyId || null,
    String(eventType || ""),
    String(status || ""),
    typeof details === "string" ? details : safeJson(details),
    typeof query === "string" ? query : safeJson(query)
  );
}

function safeInternalRedirect(targetPath, fallbackPath = "/anaf/status") {
  const value = String(targetPath || "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallbackPath;
  return value;
}

function appBaseUrl(req) {
  const envUrl = String(process.env.APP_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const forwardedProto = String(req.get("x-forwarded-proto") || req.protocol || "https")
    .split(",")[0]
    .trim();
  return `${forwardedProto}://${req.get("host")}`;
}

function safeIsoFromNow(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(Date.now() + value * 1000).toISOString();
}

function normalizeEnvironment(environment) {
  return String(environment || "").trim().toLowerCase() === "prod" ? "prod" : "test";
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseJwtExpiry(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return "";
  return new Date(Number(payload.exp) * 1000).toISOString();
}

function extractSerial(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(
    payload.serial_number ||
    payload.serialNumber ||
    payload.serial ||
    payload.cert_sn ||
    payload.certificate_serial ||
    ""
  ).trim();
}

function latestAnafConnection(db, companyId, environment) {
  return db.prepare(`
    SELECT environment, serial_certificate, expires_at, refresh_expires_at, updated_at
    FROM anaf_connections
    WHERE company_id = ? AND environment = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId || null, normalizeEnvironment(environment));
}

function summarizeConnection(connection) {
  if (!connection) return null;
  return {
    environment: String(connection.environment || "").trim(),
    serial_certificate: String(connection.serial_certificate || "").trim(),
    expires_at: String(connection.expires_at || "").trim(),
    refresh_expires_at: String(connection.refresh_expires_at || "").trim(),
    updated_at: String(connection.updated_at || "").trim()
  };
}

function buildAccessDeniedMessage({ connection, environment, redirectUri }) {
  const parts = [
    "ANAF a respins autorizarea (access_denied).",
    "Verificati certificatul digital calificat folosit la autentificare, rolul SPV PJ si faptul ca aprobarea nu a fost anulata in fereastra ANAF.",
    `Redirect URI-ul configurat la ANAF trebuie sa fie exact ${redirectUri}.`
  ];

  if (connection) {
    const details = [];
    if (connection.updated_at) details.push(`salvata la ${connection.updated_at}`);
    if (connection.expires_at) details.push(`token acces pana la ${connection.expires_at}`);
    if (connection.refresh_expires_at) details.push(`refresh pana la ${connection.refresh_expires_at}`);
    if (connection.serial_certificate) details.push(`serial ${connection.serial_certificate.slice(0, 24)}`);
    parts.push(`Conexiunea ${normalizeEnvironment(environment).toUpperCase()} existenta ramane disponibila${details.length ? ` (${details.join(", ")})` : ""}.`);
  }

  return parts.join(" ");
}

function upsertAnafConnection(db, companyId, environment, tokenPayload, rawResponse) {
  const accessToken = tokenPayload?.access_token || "";
  const refreshToken = tokenPayload?.refresh_token || "";
  const tokenType = tokenPayload?.token_type || "";
  const scope = tokenPayload?.scope || "";
  const normalizedEnvironment = normalizeEnvironment(environment);
  const expiresAt = safeIsoFromNow(tokenPayload?.expires_in) || parseJwtExpiry(accessToken) || "";
  const refreshExpiresAt = safeIsoFromNow(
    tokenPayload?.refresh_token_expires_in || tokenPayload?.refresh_expires_in
  );
  const jwtPayload = decodeJwtPayload(accessToken);
  const serialCertificate = extractSerial(jwtPayload);
  const existing = db.prepare(`
    SELECT id
    FROM anaf_connections
    WHERE environment = ? AND company_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(normalizedEnvironment, companyId);

  if (existing?.id) {
    db.prepare(`
      UPDATE anaf_connections
      SET access_token = ?,
          refresh_token = ?,
          token_type = ?,
          scope = ?,
          expires_at = ?,
          refresh_expires_at = ?,
          serial_certificate = ?,
          raw_response = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      accessToken,
      refreshToken,
      tokenType,
      scope,
      expiresAt,
      refreshExpiresAt,
      serialCertificate,
      rawResponse,
      existing.id
    );
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO anaf_connections (
      company_id,
      environment,
      access_token,
      refresh_token,
      token_type,
      scope,
      expires_at,
      refresh_expires_at,
      serial_certificate,
      raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId || null,
    normalizedEnvironment,
    accessToken,
    refreshToken,
    tokenType,
    scope,
    expiresAt,
    refreshExpiresAt,
    serialCertificate,
    rawResponse
  );

  return result.lastInsertRowid;
}

function normalizeInviteCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function formatInviteCode(code) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return "";
  const chunks = normalized.match(/.{1,4}/g);
  return chunks ? chunks.join("-") : normalized;
}

function hashInviteCode(code) {
  return crypto.createHash("sha256").update(normalizeInviteCode(code)).digest("hex");
}

function generateInviteCode() {
  let raw = "";
  while (raw.length < INVITE_RAW_LENGTH) {
    const bytes = crypto.randomBytes(INVITE_RAW_LENGTH);
    for (const byte of bytes) {
      raw += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      if (raw.length >= INVITE_RAW_LENGTH) break;
    }
  }
  return formatInviteCode(raw.slice(0, INVITE_RAW_LENGTH));
}

function findAnafOauthInviteByCode(db, code) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) return null;
  return db.prepare(`
    SELECT i.*, c.name AS company_name, c.cui AS company_cui
    FROM anaf_oauth_invites i
    LEFT JOIN companies c ON c.id = i.company_id
    WHERE i.code_hash = ?
    LIMIT 1
  `).get(hashInviteCode(normalizedCode));
}

function inviteUrl(req, code) {
  return `${appBaseUrl(req)}/anaf/reautorizare/${encodeURIComponent(formatInviteCode(code))}`;
}

function invitePortalUrl(req) {
  return `${appBaseUrl(req)}/anaf/reautorizare`;
}

function isInviteExpired(invite) {
  const expiresMs = invite?.expires_at ? Date.parse(String(invite.expires_at)) : NaN;
  return Number.isFinite(expiresMs) && expiresMs <= Date.now();
}

function invalidatePendingInvites(db, companyId, environment) {
  db.prepare(`
    UPDATE anaf_oauth_invites
    SET status = 'REPLACED',
        updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
      AND environment = ?
      AND UPPER(COALESCE(status, '')) = 'PENDING'
  `).run(companyId, normalizeEnvironment(environment));
}

function createAnafOauthInvite(db, {
  accountantEmail,
  companyId,
  createdByEmail,
  environment,
  note,
  ttlHours = DEFAULT_INVITE_TTL_HOURS
}) {
  invalidatePendingInvites(db, companyId, environment);

  let code = "";
  let codeHash = "";
  do {
    code = generateInviteCode();
    codeHash = hashInviteCode(code);
  } while (db.prepare("SELECT 1 FROM anaf_oauth_invites WHERE code_hash = ? LIMIT 1").get(codeHash));

  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlHours || DEFAULT_INVITE_TTL_HOURS)) * 60 * 60 * 1000).toISOString();
  const result = db.prepare(`
    INSERT INTO anaf_oauth_invites (
      company_id,
      environment,
      invite_type,
      code_hash,
      accountant_email,
      note,
      status,
      expires_at,
      created_by_email
    ) VALUES (?, ?, 'REAUTHORIZE', ?, ?, ?, 'PENDING', ?, ?)
  `).run(
    companyId,
    normalizeEnvironment(environment),
    codeHash,
    accountantEmail || null,
    note || null,
    expiresAt,
    createdByEmail || null
  );

  return {
    id: result.lastInsertRowid,
    code: formatInviteCode(code),
    expiresAt
  };
}

function saveInviteError(db, inviteId, message) {
  if (!inviteId) return;
  db.prepare(`
    UPDATE anaf_oauth_invites
    SET last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(String(message || "").trim() || null, inviteId);
}

function completeInvite(db, inviteId) {
  if (!inviteId) return;
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE anaf_oauth_invites
    SET status = 'COMPLETED',
        consumed_at = COALESCE(consumed_at, ?),
        completed_at = COALESCE(completed_at, ?),
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nowIso, nowIso, inviteId);
}

function transporterConfigured(transporter) {
  return Boolean(transporter) &&
    Boolean(String(process.env.SMTP_USER || "").trim()) &&
    Boolean(String(process.env.SMTP_PASS || "").trim());
}

async function maybeSendInviteEmail({
  accountantEmail,
  companyName,
  environment,
  expiresAt,
  inviteCode,
  inviteLink,
  portalLink,
  transporter
}) {
  const trimmedEmail = String(accountantEmail || "").trim().toLowerCase();
  if (!trimmedEmail) return { attempted: false, ok: false, message: "" };
  if (!transporterConfigured(transporter)) {
    return {
      attempted: true,
      ok: false,
      message: "SMTP nu este configurat pe server, asa ca linkul nu a fost trimis automat prin email."
    };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: trimmedEmail,
      subject: `Reautorizare SPV pentru ${companyName || "firma"}`,
      text: [
        `Buna ziua,`,
        ``,
        `A fost generat un cod de reautorizare SPV pentru ${companyName || "firma"} (${normalizeEnvironment(environment).toUpperCase()}).`,
        `Cod reautorizare: ${inviteCode}`,
        `Link direct: ${inviteLink}`,
        `Portal cod: ${portalLink}`,
        `Expira la: ${expiresAt}`,
        ``,
        `Dupa deschiderea linkului, folositi certificatul digital si confirmati autorizarea ANAF.`,
        ``,
        `Mesaj trimis automat din MiniCRM.`
      ].join("\n")
    });

    return { attempted: true, ok: true, message: `Linkul a fost trimis la ${trimmedEmail}.` };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: `Linkul a fost generat, dar emailul catre ${trimmedEmail} nu a putut fi trimis (${String(error?.message || error)}).`
    };
  }
}

function connectionSummaryLine(connection) {
  if (!connection) return "Nu exista inca o conexiune ANAF salvata pentru aceasta firma.";
  const parts = [];
  if (connection.updated_at) parts.push(`actualizata la ${connection.updated_at}`);
  if (connection.serial_certificate) parts.push(`serial ${connection.serial_certificate.slice(0, 24)}`);
  if (connection.expires_at) parts.push(`token acces pana la ${connection.expires_at}`);
  if (connection.refresh_expires_at) parts.push(`refresh pana la ${connection.refresh_expires_at}`);
  return parts.join(" / ");
}

function renderPublicPage({ title, body }) {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      color-scheme: light;
      --bg:#f4f6fb;
      --card:#ffffff;
      --text:#122033;
      --muted:#607089;
      --line:#dbe3ef;
      --accent:#0f62fe;
      --accent-soft:#eff6ff;
      --success:#15803d;
      --success-soft:#f0fdf4;
      --warn:#a16207;
      --warn-soft:#fffbeb;
      --danger:#b91c1c;
      --danger-soft:#fef2f2;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:radial-gradient(circle at top right,#ffffff 0,#f4f6fb 45%,#eef3ff 100%);
      color:var(--text);
    }
    .wrap{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:32px 16px;
    }
    .card{
      width:min(720px,100%);
      background:var(--card);
      border:1px solid var(--line);
      border-radius:24px;
      box-shadow:0 24px 60px rgba(15,35,95,.12);
      padding:28px;
    }
    h1{margin:0 0 10px;font-size:30px;line-height:1.1}
    p{margin:0 0 12px;line-height:1.55}
    .muted{color:var(--muted)}
    .stack{display:grid;gap:14px}
    .panel{
      border:1px solid var(--line);
      border-radius:18px;
      padding:18px;
      background:#fbfdff;
    }
    .panel-success{border-color:#86efac;background:var(--success-soft)}
    .panel-warn{border-color:#fcd34d;background:var(--warn-soft)}
    .panel-danger{border-color:#fecaca;background:var(--danger-soft)}
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      min-height:48px;
      padding:0 18px;
      border-radius:14px;
      background:var(--accent);
      color:#fff;
      text-decoration:none;
      border:none;
      font-size:15px;
      font-weight:700;
      cursor:pointer;
    }
    .btn-secondary{
      background:#fff;
      color:var(--text);
      border:1px solid var(--line);
    }
    .input{
      width:100%;
      min-height:48px;
      border-radius:14px;
      border:1px solid var(--line);
      padding:0 14px;
      font-size:15px;
      color:var(--text);
      background:#fff;
    }
    .code{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:10px 14px;
      border-radius:14px;
      border:1px solid var(--line);
      background:#fff;
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      font-size:18px;
      font-weight:700;
      letter-spacing:.08em;
    }
    .actions{
      display:flex;
      gap:12px;
      flex-wrap:wrap;
      margin-top:6px;
    }
    form{margin:0}
    label{display:block;margin-bottom:8px;font-weight:700}
    .meta{display:grid;gap:8px}
    .meta b{display:inline-block;min-width:120px}
  </style>
</head>
<body>
  <div class="wrap">
    <main class="card">
      ${body}
    </main>
  </div>
</body>
</html>`;
}

function renderInvitePortal({ appUrl, code = "", message = "" }) {
  const normalizedCode = formatInviteCode(code);
  return renderPublicPage({
    title: "Reautorizare SPV",
    body: `
      <div class="stack">
        <div>
          <div class="muted" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">MiniCRM · SPV</div>
          <h1>Introdu codul de reautorizare</h1>
          <p class="muted">Daca ai primit doar codul de la firma sau de la super admin, il poti introduce aici pentru a continua autorizarea ANAF.</p>
        </div>
        ${message ? `<section class="panel panel-danger"><p>${escapeHtml(message)}</p></section>` : ``}
        <section class="panel">
          <form method="get" action="/anaf/reautorizare" class="stack">
            <div>
              <label for="code">Cod reautorizare</label>
              <input class="input" id="code" name="code" placeholder="ABCD-EFGH-IJKL-MNOP" value="${escapeHtml(normalizedCode)}" autocomplete="off">
            </div>
            <div class="actions">
              <button class="btn" type="submit">Continua</button>
            </div>
          </form>
        </section>
        <section class="panel">
          <p><b>Link portal:</b> ${escapeHtml(appUrl)}</p>
          <p class="muted">Daca ai primit deja linkul direct, il poti deschide fara sa mai introduci codul manual.</p>
        </section>
      </div>
    `
  });
}

function renderInvitePage({ code, db, invite, oauthMessage, oauthState }) {
  const normalizedCode = formatInviteCode(code);
  const environmentLabel = normalizeEnvironment(invite?.environment).toUpperCase();
  const latestConnection = invite ? latestAnafConnection(db, invite.company_id, invite.environment) : null;
  const completed = invite && String(invite.status || "").toUpperCase() === "COMPLETED";
  const expired = invite && isInviteExpired(invite);
  const replaced = invite && String(invite.status || "").toUpperCase() === "REPLACED";
  const canStart = invite && !completed && !expired && !replaced;

  const banner = oauthState
    ? `
      <section class="panel ${oauthState === "success" ? "panel-success" : "panel-danger"}">
        <p><b>${oauthState === "success" ? "Autorizare realizata cu succes" : "Autorizare esuata"}</b></p>
        <p>${escapeHtml(oauthMessage || (oauthState === "success" ? "Conexiunea ANAF a fost salvata." : "A aparut o eroare la autorizare."))}</p>
      </section>
    `
    : invite?.last_error
      ? `
        <section class="panel panel-danger">
          <p><b>Ultima eroare</b></p>
          <p>${escapeHtml(invite.last_error)}</p>
        </section>
      `
      : "";

  const statePanel = completed
    ? `
      <section class="panel panel-success">
        <p><b>Conexiune SPV activa</b></p>
        <p>Codul a fost deja folosit cu succes pentru autorizarea firmei in ANAF.</p>
        <p class="muted">${escapeHtml(connectionSummaryLine(latestConnection))}</p>
      </section>
    `
    : expired
      ? `
        <section class="panel panel-warn">
          <p><b>Cod expirat</b></p>
          <p>Acest cod nu mai poate fi folosit. Cere firmei sau super adminului sa genereze un cod nou.</p>
        </section>
      `
      : replaced
        ? `
          <section class="panel panel-warn">
            <p><b>Cod inlocuit</b></p>
            <p>Pentru aceasta firma exista deja un cod mai nou. Foloseste ultimul cod primit.</p>
          </section>
        `
        : `
          <section class="panel">
            <p><b>Pasul urmator</b></p>
            <p>Apasa butonul de mai jos si continua in ANAF cu certificatul digital care are acces SPV pe firma respectiva.</p>
            <div class="actions">
              <form method="post" action="/anaf/reautorizare/${encodeURIComponent(normalizedCode)}/start">
                <button class="btn" type="submit">Continua spre ANAF</button>
              </form>
            </div>
          </section>
        `;

  return renderPublicPage({
    title: "Reautorizare SPV",
    body: `
      <div class="stack">
        <div>
          <div class="muted" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">MiniCRM · SPV</div>
          <h1>Autorizare SPV prin contabil</h1>
          <p class="muted">Acest cod sau link a fost generat pentru autorizarea conexiunii ANAF in cadrul aplicatiei.</p>
        </div>
        <section class="panel">
          <div class="meta">
            <div><b>Firma:</b> ${escapeHtml(invite?.company_name || "Firma necunoscuta")}</div>
            <div><b>CUI:</b> ${escapeHtml(invite?.company_cui || "—")}</div>
            <div><b>Mediu:</b> ${escapeHtml(environmentLabel)}</div>
            <div><b>Cod:</b> <span class="code">${escapeHtml(normalizedCode)}</span></div>
            <div><b>Expira la:</b> ${escapeHtml(invite?.expires_at || "—")}</div>
          </div>
        </section>
        ${banner}
        ${statePanel}
        ${canStart ? `` : `
          <section class="panel">
            <p><b>Ai primit doar codul?</b></p>
            <p class="muted">Il poti deschide din nou din portalul public de reautorizare:</p>
            <p><a href="/anaf/reautorizare">/anaf/reautorizare</a></p>
          </section>
        `}
      </div>
    `
  });
}

function beginOauthAuthorization(req, res, {
  companyId,
  environment,
  inviteCode = "",
  onMissingConfigPath = "/anaf/status",
  returnTo = "",
  getSetting,
  db
}) {
  const clientId = String(getSetting("anaf_client_id", "") || "").trim();
  const clientSecret = String(getSetting("anaf_client_secret", "") || "").trim();
  const authorizeUrl = String(getSetting("anaf_authorize_url", DEFAULT_ANAF_AUTHORIZE_URL) || DEFAULT_ANAF_AUTHORIZE_URL).trim();
  const redirectUri = String(getSetting("anaf_redirect_uri", DEFAULT_ANAF_REDIRECT_URI) || DEFAULT_ANAF_REDIRECT_URI).trim();
  const scope = String(getSetting("anaf_scope", "") || "").trim();
  const formattedInviteCode = formatInviteCode(inviteCode);

  if (!clientId || !clientSecret) {
    logOauthEvent(db, companyId, formattedInviteCode ? "invite_start" : "start", "error", "Lipsesc Client ID sau Client Secret pentru ANAF.", req.query);
    return res.redirect(buildRedirectUrl(onMissingConfigPath, "error", "Lipsesc Client ID sau Client Secret pentru ANAF."));
  }

  const state = crypto.randomBytes(24).toString("hex");
  req.session.anafOAuthState = state;
  req.session.anafOAuthStartedAt = Date.now();
  req.session.anafOAuthInviteCode = formattedInviteCode;
  req.session.anafOAuthReturnTo = returnTo === "nexora" ? "nexora" : "";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    token_content_type: "jwt"
  });

  if (scope) params.set("scope", scope);
  const authorizationRequestUrl = `${authorizeUrl}?${params.toString()}`;
  logOauthEvent(db, companyId, formattedInviteCode ? "invite_start" : "start", "redirect", {
    environment,
    redirect_uri: redirectUri,
    authorize_url: authorizeUrl,
    authorization_request_url: authorizationRequestUrl,
    requested_scope: scope || "",
    invite_code: formattedInviteCode || ""
  }, req.query);

  res.redirect(authorizationRequestUrl);
}

export function registerAnafOAuthRoutes(app, {
  canAccessSpvUser,
  db,
  getSetting,
  requireAuth,
  requireSpvAccess,
  setSetting,
  transporter
}) {
  if (!getSetting("anaf_redirect_uri", "")) {
    setSetting("anaf_redirect_uri", DEFAULT_ANAF_REDIRECT_URI);
  }

  app.get("/anaf/reautorizare", (req, res) => {
    const code = formatInviteCode(req.query?.code || "");
    if (code) {
      return res.redirect(`/anaf/reautorizare/${encodeURIComponent(code)}`);
    }

    res.type("html").send(renderInvitePortal({
      appUrl: invitePortalUrl(req)
    }));
  });

  app.get("/anaf/reautorizare/:code", (req, res) => {
    const code = formatInviteCode(req.params.code || "");
    const invite = findAnafOauthInviteByCode(db, code);
    const oauthState = String(req.query.oauth || "").trim();
    const oauthMessage = String(req.query.message || "").trim();

    if (!invite) {
      return res.type("html").send(renderInvitePortal({
        appUrl: invitePortalUrl(req),
        code,
        message: "Codul de reautorizare nu exista sau nu mai este valabil."
      }));
    }

    return res.type("html").send(renderInvitePage({
      code,
      db,
      invite,
      oauthMessage,
      oauthState
    }));
  });

  app.post("/anaf/reautorizare-link", requireAuth, requireSpvAccess, async (req, res) => {
    const companyId = Number(req.session?.user?.company_id || 0);
    const redirectTo = safeInternalRedirect(req.body?.redirect_to || "/anaf/status?reauth=needed", "/anaf/status?reauth=needed");
    const accountantEmail = String(req.body?.accountant_email || "").trim().toLowerCase();
    const note = String(req.body?.note || "").trim();
    const environment = normalizeEnvironment(getSetting("anaf_environment", "test") || "test");
    const company = db.prepare(`
      SELECT name, cui
      FROM companies
      WHERE id = ?
      LIMIT 1
    `).get(companyId) || {};

    if (accountantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountantEmail)) {
      req.session.anafInviteFlash = {
        status: "error",
        message: "Adresa de email pentru contabil nu este valida."
      };
      return res.redirect(redirectTo);
    }

    const invite = createAnafOauthInvite(db, {
      accountantEmail,
      companyId,
      createdByEmail: String(req.session?.user?.email || "").trim().toLowerCase(),
      environment,
      note
    });

    const link = inviteUrl(req, invite.code);
    const portalLink = invitePortalUrl(req);
    const emailResult = await maybeSendInviteEmail({
      accountantEmail,
      companyName: company.name || req.session?.user?.company_name || "firma",
      environment,
      expiresAt: invite.expiresAt,
      inviteCode: invite.code,
      inviteLink: link,
      portalLink,
      transporter
    });

    req.session.anafInviteFlash = {
      status: emailResult.attempted && !emailResult.ok ? "warning" : "success",
      message: emailResult.attempted
        ? emailResult.message
        : "Codul de reautorizare a fost generat. Il poti trimite contabilului prin link sau manual, folosind codul.",
      code: invite.code,
      invite_link: link,
      portal_link: portalLink,
      expires_at: invite.expiresAt,
      accountant_email: accountantEmail,
      company_name: company.name || req.session?.user?.company_name || "firma",
      environment
    };

    logOauthEvent(db, companyId, "invite_create", "success", {
      environment,
      expires_at: invite.expiresAt,
      accountant_email: accountantEmail || "",
      note,
      email_status: emailResult.attempted ? (emailResult.ok ? "sent" : "failed") : "not_requested"
    }, req.body);

    return res.redirect(redirectTo);
  });

  app.post("/anaf/reautorizare/:code/start", (req, res) => {
    const code = formatInviteCode(req.params.code || "");
    const invite = findAnafOauthInviteByCode(db, code);
    if (!invite) {
      return res.redirect(buildRedirectUrl("/anaf/reautorizare", "error", "Codul de reautorizare nu exista sau nu mai este valabil."));
    }

    if (String(invite.status || "").toUpperCase() === "COMPLETED") {
      return res.redirect(buildRedirectUrl(`/anaf/reautorizare/${encodeURIComponent(code)}`, "success", "Firma este deja reautorizata cu acest cod."));
    }

    if (String(invite.status || "").toUpperCase() === "REPLACED") {
      return res.redirect(buildRedirectUrl(`/anaf/reautorizare/${encodeURIComponent(code)}`, "error", "Acest cod a fost inlocuit cu unul mai nou."));
    }

    if (isInviteExpired(invite)) {
      return res.redirect(buildRedirectUrl(`/anaf/reautorizare/${encodeURIComponent(code)}`, "error", "Codul de reautorizare a expirat."));
    }

    return beginOauthAuthorization(req, res, {
      companyId: Number(invite.company_id || 0),
      environment: normalizeEnvironment(invite.environment),
      inviteCode: code,
      onMissingConfigPath: `/anaf/reautorizare/${encodeURIComponent(code)}`,
      getSetting,
      db
    });
  });

  app.get("/oauth/anaf/start", requireAuth, requireSpvAccess, (req, res) => {
    const companyId = Number(req.session?.user?.company_id || 0);
    const environment = normalizeEnvironment(getSetting("anaf_environment", "test") || "test");
    const returnTo = String(req.query?.return_to || "").trim().toLowerCase() === "nexora" ? "nexora" : "";
    delete req.session.anafOAuthInviteCode;
    return beginOauthAuthorization(req, res, {
      companyId,
      environment,
      inviteCode: "",
      onMissingConfigPath: returnTo === "nexora" ? "/nexora/anaf/status" : "/anaf/status",
      returnTo,
      getSetting,
      db
    });
  });

  app.get("/oauth/anaf/callback", async (req, res) => {
    const sessionInviteCode = formatInviteCode(req.session?.anafOAuthInviteCode || "");
    const sessionReturnTo = String(req.session?.anafOAuthReturnTo || "");
    const expectedState = req.session?.anafOAuthState;
    delete req.session.anafOAuthState;
    delete req.session.anafOAuthStartedAt;
    delete req.session.anafOAuthInviteCode;
    delete req.session.anafOAuthReturnTo;

    const user = req.session?.user || null;
    const invite = sessionInviteCode ? findAnafOauthInviteByCode(db, sessionInviteCode) : null;
    const inviteFlow = Boolean(sessionInviteCode);

    if (!inviteFlow && !user) {
      return res.redirect("/login");
    }

    if (!inviteFlow && !canAccessSpvUser(user)) {
      return res.status(403).send("Forbidden");
    }

    if (inviteFlow && !invite) {
      return res.redirect(buildRedirectUrl("/anaf/reautorizare", "error", "Codul de reautorizare nu mai este valabil."));
    }

    const companyId = inviteFlow ? Number(invite.company_id || 0) : Number(user?.company_id || 0);
    const incomingState = String(req.query.state || "");
    const authCode = String(req.query.code || "");
    const authError = String(req.query.error || "");
    const authErrorDescription = String(req.query.error_description || "");
    const redirectUri = String(getSetting("anaf_redirect_uri", DEFAULT_ANAF_REDIRECT_URI) || DEFAULT_ANAF_REDIRECT_URI).trim();
    const environment = inviteFlow
      ? normalizeEnvironment(invite.environment)
      : normalizeEnvironment(getSetting("anaf_environment", "test") || "test");
    const currentConnection = latestAnafConnection(db, companyId, environment);
    const redirectBasePath = inviteFlow
      ? `/anaf/reautorizare/${encodeURIComponent(sessionInviteCode)}`
      : sessionReturnTo === "nexora" ? "/nexora/anaf/status" : "/anaf/status";

    if (inviteFlow && String(invite.status || "").toUpperCase() === "REPLACED") {
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", "Acest cod a fost inlocuit cu unul mai nou."));
    }

    if (inviteFlow && isInviteExpired(invite)) {
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", "Codul de reautorizare a expirat."));
    }

    if (authError) {
      const message = authError === "access_denied"
        ? buildAccessDeniedMessage({ connection: summarizeConnection(currentConnection), environment, redirectUri })
        : (authErrorDescription || authError);
      if (inviteFlow) saveInviteError(db, invite.id, message);
      logOauthEvent(db, companyId, inviteFlow ? "invite_callback" : "callback", "error", {
        error: authError,
        error_description: authErrorDescription,
        environment,
        redirect_uri: redirectUri,
        current_connection: summarizeConnection(currentConnection),
        invite_code: sessionInviteCode || ""
      }, req.query);
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", message));
    }

    if (!expectedState || !incomingState || expectedState !== incomingState) {
      if (inviteFlow) saveInviteError(db, invite.id, "State OAuth invalid sau expirat.");
      logOauthEvent(db, companyId, inviteFlow ? "invite_callback" : "callback", "error", "State OAuth invalid sau expirat.", req.query);
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", "State OAuth invalid sau expirat."));
    }

    if (!authCode) {
      if (inviteFlow) saveInviteError(db, invite.id, "ANAF nu a returnat codul de autorizare.");
      logOauthEvent(db, companyId, inviteFlow ? "invite_callback" : "callback", "error", "ANAF nu a returnat codul de autorizare.", req.query);
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", "ANAF nu a returnat codul de autorizare."));
    }

    const clientId = String(getSetting("anaf_client_id", "") || "").trim();
    const clientSecret = String(getSetting("anaf_client_secret", "") || "").trim();
    const tokenUrl = String(getSetting("anaf_token_url", DEFAULT_ANAF_TOKEN_URL) || DEFAULT_ANAF_TOKEN_URL).trim();

    if (!clientId || !clientSecret) {
      if (inviteFlow) saveInviteError(db, invite.id, "Configuratia ANAF este incompleta.");
      logOauthEvent(db, companyId, inviteFlow ? "invite_callback" : "callback", "error", "Configuratia ANAF este incompleta.", req.query);
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", "Configuratia ANAF este incompleta."));
    }

    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
        token_content_type: "jwt"
      });

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      const rawText = await response.text();
      let tokenPayload = null;

      try {
        tokenPayload = JSON.parse(rawText);
      } catch {
        tokenPayload = { raw_text: rawText };
      }

      if (!response.ok || !tokenPayload?.access_token) {
        const message = tokenPayload?.error_description || tokenPayload?.error || `Token ANAF invalid (${response.status})`;
        if (inviteFlow) saveInviteError(db, invite.id, message);
        logOauthEvent(db, companyId, inviteFlow ? "invite_token_exchange" : "token_exchange", "error", {
          message,
          status: response.status,
          body: tokenPayload,
          invite_code: sessionInviteCode || ""
        }, req.query);
        return res.redirect(buildRedirectUrl(redirectBasePath, "error", message));
      }

      upsertAnafConnection(db, companyId, environment, tokenPayload, rawText);
      if (inviteFlow) completeInvite(db, invite.id);
      logOauthEvent(db, companyId, inviteFlow ? "invite_token_exchange" : "token_exchange", "success", {
        environment,
        token_type: tokenPayload?.token_type || "",
        scope: tokenPayload?.scope || "",
        invite_code: sessionInviteCode || ""
      }, req.query);
      return res.redirect(buildRedirectUrl(redirectBasePath, "success", "Conexiunea ANAF a fost salvata cu succes."));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Eroare necunoscuta la conectarea ANAF.";
      if (inviteFlow) saveInviteError(db, invite.id, message);
      logOauthEvent(db, companyId, inviteFlow ? "invite_token_exchange" : "token_exchange", "error", message, req.query);
      return res.redirect(buildRedirectUrl(redirectBasePath, "error", message));
    }
  });
}
