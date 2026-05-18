import express from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

export function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

export function initApplication({ app, isProduction, sessionSecret, migrate, seedAdminFromEnv }) {
  if (isProduction && sessionSecret === "dev-secret-change-me") {
    console.warn("SESSION_SECRET is using the development fallback. Set a strong secret in production.");
  }

  app.set("trust proxy", 1);

  migrate();
  const seed = seedAdminFromEnv();
  if (!seed.ok) console.warn("Admin seed skipped:", seed.reason);
}

export function setupAppMiddleware({ app, dirname, sessionSecret }) {
  const SQLiteStore = connectSqlite3(session);

  app.use(session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: dirname
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
      maxAge: 1000 * 60 * 60 * 12
    }
  }));

  app.use("/contracts", express.static(path.join(dirname, "contracts")));
  app.use(express.static(path.join(dirname, "public")));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
}

export function loadTemplates(dirname) {
  return {
    templateHtml: fs.readFileSync(path.join(dirname, "template.html"), "utf8"),
    invoiceTemplateHtml: fs.readFileSync(path.join(dirname, "invoice_template.html"), "utf8"),
    quoteTemplateHtml: fs.readFileSync(path.join(dirname, "quote_template.html"), "utf8"),
    uiHtml: fs.readFileSync(path.join(dirname, "ui.html"), "utf8")
  };
}
