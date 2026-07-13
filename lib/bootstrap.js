import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

const TREVORO_EMAIL_PAUSE_FILE = process.env.TREVORO_EMAIL_PAUSE_FILE
  || path.join(process.cwd(), "utile", "flags", "trevoro-email-sending-paused");

function trevoroEmailSendingPaused() {
  return fs.existsSync(TREVORO_EMAIL_PAUSE_FILE);
}

function mailValueText(value = "") {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(mailValueText).join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value || "");
}

function isTrevoroMailPayload(message = {}) {
  const text = [
    message.from,
    message.to,
    message.cc,
    message.bcc,
    message.replyTo,
    message.subject,
    message.text,
    message.html
  ].map(mailValueText).join(" ").toLowerCase();
  return text.includes("trevoro") || text.includes("@trevoro.ro");
}

function withTrevoroEmailPauseGuard(transporter) {
  if (!transporter || typeof transporter.sendMail !== "function") return transporter;
  const sendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = async (message = {}, ...args) => {
    const allowWhenPaused = Boolean(message?.allowWhenTrevoroEmailPaused);
    const cleanMessage = { ...message };
    delete cleanMessage.allowWhenTrevoroEmailPaused;
    if (!allowWhenPaused && trevoroEmailSendingPaused() && isTrevoroMailPayload(cleanMessage)) {
      const error = new Error("trevoro_email_sending_paused");
      error.code = "TREVORO_EMAIL_SENDING_PAUSED";
      error.pauseFile = TREVORO_EMAIL_PAUSE_FILE;
      throw error;
    }
    return sendMail(cleanMessage, ...args);
  };
  return transporter;
}

class BetterSqliteSessionStore extends session.Store {
  constructor({ filename, ttlMs = 1000 * 60 * 60 * 12 } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nexora_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nexora_sessions_expired_at
        ON nexora_sessions(expired_at);
    `);
    this.getStmt = this.db.prepare("SELECT sess, expired_at FROM nexora_sessions WHERE sid=?");
    this.setStmt = this.db.prepare(`
      INSERT INTO nexora_sessions (sid, sess, expired_at)
      VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET
        sess=excluded.sess,
        expired_at=excluded.expired_at
    `);
    this.destroyStmt = this.db.prepare("DELETE FROM nexora_sessions WHERE sid=?");
    this.pruneStmt = this.db.prepare("DELETE FROM nexora_sessions WHERE expired_at <= ?");
  }

  expiryFromSession(sess = {}) {
    const maxAge = Number(sess?.cookie?.originalMaxAge || sess?.cookie?.maxAge || 0);
    return Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : this.ttlMs);
  }

  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return callback(null, null);
      if (Number(row.expired_at || 0) <= Date.now()) {
        this.destroyStmt.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      this.setStmt.run(sid, JSON.stringify(sess || {}), this.expiryFromSession(sess));
      if (Math.random() < 0.02) this.pruneStmt.run(Date.now());
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    return this.set(sid, sess, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStmt.run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }
}

export function createTransporter() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS;
  if (host) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secureValue = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
    const secure = secureValue
      ? ["1", "true", "yes", "ssl"].includes(secureValue)
      : port === 465;

    return withTrevoroEmailPauseGuard(nodemailer.createTransport({
      host,
      port,
      secure,
      tls: {
        servername: String(process.env.SMTP_TLS_SERVERNAME || host).trim() || host
      },
      auth: {
        user,
        pass
      }
    }));
  }

  return withTrevoroEmailPauseGuard(nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass
    }
  }));
}

export function initApplication({ app, isProduction, sessionSecret, migrate, seedAdminFromEnv }) {
  if (isProduction && sessionSecret === "dev-secret-change-me") {
    console.warn("SESSION_SECRET is using the development fallback. Set a strong secret in production.");
  }

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  migrate();
  const seed = seedAdminFromEnv();
  if (!seed.ok) console.warn("Admin seed skipped:", seed.reason);
}

export function applySecurityHeaders({ app, isProduction = false } = {}) {
  app.use((req, res, next) => {
    res.setHeader("X-Nexora-Origin", "nexora-vps-main");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isProduction || req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https")) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
}

export function setupAppMiddleware({ app, dirname, sessionSecret, isProduction = false }) {
  const sessionMaxAge = 1000 * 60 * 60 * 12;

  applySecurityHeaders({ app, isProduction });

  app.use(session({
    store: new BetterSqliteSessionStore({
      filename: path.join(dirname, "sessions.db"),
      ttlMs: sessionMaxAge
    }),
    name: "minicrm.sid",
    secret: sessionSecret,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: sessionMaxAge
    }
  }));

  app.use("/contracts", express.static(path.join(dirname, "contracts")));
  app.use(express.static(path.join(dirname, "public")));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb", parameterLimit: 1000 }));
}

export function loadTemplates(dirname) {
  return {
    templateHtml: fs.readFileSync(path.join(dirname, "template.html"), "utf8"),
    invoiceTemplateHtml: fs.readFileSync(path.join(dirname, "invoice_template.html"), "utf8"),
    quoteTemplateHtml: fs.readFileSync(path.join(dirname, "quote_template.html"), "utf8"),
    uiHtml: fs.readFileSync(path.join(dirname, "ui.html"), "utf8")
  };
}
