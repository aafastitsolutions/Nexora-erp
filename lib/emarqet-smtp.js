import nodemailer from "nodemailer";
import { emarqetOfficeEmail } from "./emarqet-mailboxes.js";

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function truthyEnv(value = "") {
  return ["1", "true", "yes", "on"].includes(safeText(value).toLowerCase());
}

export function emarqetSmtpSettings() {
  const hasDedicatedUser = Boolean(safeText(process.env.EMARQET_SMTP_USER));
  const hasDedicatedPass = Boolean(safeText(process.env.EMARQET_SMTP_PASS || process.env.EMARQET_MAIL_PASS));
  const hasDedicatedHost = Boolean(safeText(process.env.EMARQET_SMTP_HOST));
  const usesDedicated = hasDedicatedUser || hasDedicatedPass || hasDedicatedHost;
  const host = safeText(process.env.EMARQET_SMTP_HOST || process.env.SMTP_HOST);
  const port = Number(process.env.EMARQET_SMTP_PORT || process.env.SMTP_PORT || 587);
  const secureValue = safeText(process.env.EMARQET_SMTP_SECURE || process.env.SMTP_SECURE).toLowerCase();
  const secure = secureValue ? ["1", "true", "yes", "ssl"].includes(secureValue) : port === 465;
  const user = safeText(process.env.EMARQET_SMTP_USER || (!usesDedicated ? process.env.SMTP_USER : ""));
  const pass = safeText(
    process.env.EMARQET_SMTP_PASS
    || process.env.EMARQET_MAIL_PASS
    || (!usesDedicated ? (process.env.SMTP_PASS || process.env.TREVORO_MAIL_PASS) : "")
  );
  const tlsServername = safeText(process.env.EMARQET_SMTP_TLS_SERVERNAME || process.env.SMTP_TLS_SERVERNAME || host);
  return {
    host,
    port,
    secure,
    user,
    pass,
    tlsServername,
    usesDedicated
  };
}

export function requireEmarqetSmtpConfig(fromEmail = emarqetOfficeEmail(), options = {}) {
  const settings = emarqetSmtpSettings();
  if (!settings.host || !settings.user || !settings.pass) {
    throw new Error("SMTP E-MARQET nu este configurat complet. Seteaza EMARQET_SMTP_HOST, EMARQET_SMTP_USER si EMARQET_SMTP_PASS.");
  }
  const allowMismatch = Boolean(options.allowSenderMismatch)
    || truthyEnv(process.env.EMARQET_ALLOW_SENDER_MISMATCH);
  const from = normalizeEmail(fromEmail);
  const user = normalizeEmail(settings.user);
  if (!allowMismatch && from && user && from !== user) {
    throw new Error(`SMTP E-MARQET blocat: From ${from} nu corespunde cu userul SMTP ${user}. Seteaza credentiale EMARQET_SMTP_USER/EMARQET_SMTP_PASS pentru mailboxul ${from}.`);
  }
  return settings;
}

export function createEmarqetTransporter(fromEmail = emarqetOfficeEmail(), options = {}) {
  const settings = requireEmarqetSmtpConfig(fromEmail, options);
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    tls: {
      servername: settings.tlsServername || settings.host
    },
    auth: {
      user: settings.user,
      pass: settings.pass
    }
  });
}
