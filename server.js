import { renderNexoraAnafInboxPage } from "./src/ui/nexora-anaf-inbox-page.js";
import { renderNexoraAnafOutboxPage } from "./src/ui/nexora-anaf-outbox-page.js";
import { renderNexoraAnafStatusPage } from "./src/ui/nexora-anaf-status-page.js";
import { renderNexoraClientPortalPage, renderNexoraClientPortalProjectPage } from "./src/ui/nexora-client-portal-page.js";
import { renderNexoraClientDossierDetailPage, renderNexoraClientDossiersPage, renderNexoraDocumentsPage, renderNexoraDocumentsRegisterPage } from "./src/ui/nexora-documents-page.js";
import { renderNexoraEmployeesPage } from "./src/ui/nexora-employees-page.js";
import { renderNexoraHubPage } from "./src/ui/nexora-hub-page.js";
import { renderNexoraProductEditPage, renderNexoraProductsPage } from "./src/ui/nexora-products-page.js";
import { renderNexoraSettingsPage } from "./src/ui/nexora-settings-page.js";
import {
  renderNexoraSuperAdminCompaniesPage,
  renderNexoraSuperAdminCompanyDetailPage,
  renderNexoraSuperAdminDashboardPage,
  renderNexoraSuperAdminPaymentsPage
} from "./src/ui/nexora-super-admin-page.js";
import { renderNexoraUserEditPage, renderNexoraUsersPage } from "./src/ui/nexora-users-page.js";
import express from "express";
import dotenv from "dotenv";
dotenv.config();
import Mustache from "mustache";
import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "async_hooks";
import { fileURLToPath } from "url";
import { renderPdfBuffer } from "./pdf.js";

import { fetchAnafCompany } from "./lib/anaf.js";
import { anafCheckUploadStatus, anafDownloadMessage, anafUploadFactura, syncAnafInbox } from "./lib/anaf-efactura.js";
import { COMPANY, CORE_ALWAYS_INCLUDED_MODULES, MODULE_DEFINITIONS, MODULE_GROUPS, ROLE_MODULES, hasModuleKeyAccess, normalizeCompanyModules, normalizeUserModules, planChargeAmount, planChargeQuantity, registerRoleModules } from "./lib/app-config.js";
import { createTransporter, initApplication, loadTemplates, setupAppMiddleware } from "./lib/bootstrap.js";
import { maybeGenerateBillingInvoice } from "./lib/billing-invoices.js";
import { processDmsTemplate } from "./lib/dms-autofill.js";
import { buildDraftInvoiceNumber, ensureOfficialInvoiceNumber, formatInvoiceDisplayNumber, nextConfiguredInvoiceNumber } from "./lib/invoice-numbering.js";
import { escapeHtml, fmt2, fmtMoney, hasModuleAccess, normalizeCui, todayISO } from "./lib/helpers.js";
import { renderPlanCards } from "./lib/plan-cards.js";
import { registerAccountingRoutes } from "./routes/accounting-routes.js";
import { registerAnafRoutes } from "./routes/anaf-routes.js";
import { registerAnafOAuthRoutes } from "./routes/anaf-oauth-routes.js";
import { createWorkspace, registerAuthRoutes } from "./routes/auth-routes.js";
import { registerBillingRoutes, registerBillingWebhook } from "./routes/billing-routes.js";
import { registerClientsRoutes } from "./routes/clients-routes.js";
import { registerContractsRoutes } from "./routes/contracts-routes.js";
import { registerDashboardRoutes } from "./routes/dashboard-routes.js";
import { registerFacturiRoutes } from "./routes/facturi-routes.js";
import { registerInventoryRoutes } from "./routes/inventory-routes.js";
import { registerProjectsRoutes } from "./routes/projects-routes.js";
import { registerQuotesRoutes } from "./routes/quotes-routes.js";
import { db, migrate } from "./db.js";
import bcrypt from "bcrypt";
import { canAccessSpvUser, requireAuth, requireRole, requireModule, requireSpvAccess, requireSuperAdmin, seedAdminFromEnv, verifyUser, verifyUserAttempt } from "./auth.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const requestContext = new AsyncLocalStorage();
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-me";
const transporter = createTransporter();

registerRoleModules();
initApplication({ app, isProduction, sessionSecret, migrate, seedAdminFromEnv });
registerBillingWebhook(app, { db });
setupAppMiddleware({ app, dirname: __dirname, sessionSecret });
app.use((req, res, next) => requestContext.run({ req }, next));
registerAnafRoutes(app, { fetchAnafCompany, normalizeCui });
registerAnafOAuthRoutes(app, { canAccessSpvUser, db, getSetting, requireAuth, requireSpvAccess, setSetting, transporter });
registerAuthRoutes(app, { db, verifyUser, verifyUserAttempt });
registerBillingRoutes(app, { db, requireAuth, requireRole, getSetting, refreshSessionCompanyAccess });
registerDashboardRoutes(app, { db, requireAuth, todayISO, escapeHtml, fmtMoney, crmShellStart, crmShellEnd });

const { templateHtml, invoiceTemplateHtml, quoteTemplateHtml, uiHtml } = loadTemplates(__dirname);
registerQuotesRoutes(app, {
  COMPANY,
  Mustache,
  __dirname,
  db,
  escapeHtml,
  fmtMoney,
  hasModuleAccess,
  nextQuoteNumber,
  quoteTemplateHtml,
  recalcQuoteTotals,
  renderPdfBuffer,
  requireAuth,
  templateHtml,
  todayISO,
  crmShellStart,
  crmShellEnd,
  path,
  fs
});
registerFacturiRoutes(app, {
  COMPANY,
  Mustache,
  __dirname,
  crmShellEnd,
  crmShellStart,
  db,
  escapeHtml,
  ensureFacturaXmlGenerated,
  anafCheckUploadStatus,
  anafDownloadMessage,
  anafUploadFactura,
  buildDraftInvoiceNumber,
  fetchAnafCompany,
  formatInvoiceDisplayNumber,
  fmt2,
  fmtMoney,
  fs,
  getInvoiceLogoDataUri,
  getInvoiceTheme,
  getSetting,
  invoiceTemplateHtml,
  nextFacturaNumber,
  normalizeCui,
  path,
  recalcFacturaTotals,
  renderPdfBuffer,
  requireAuth,
  ensureOfficialInvoiceNumber,
  transporter
});
registerContractsRoutes(app, {
  COMPANY,
  Mustache,
  __dirname,
  crmShellEnd,
  crmShellStart,
  db,
  escapeHtml,
  fs,
  path,
  renderPdfBuffer,
  requireAuth,
  templateHtml,
  todayISO
});
registerClientsRoutes(app, {
  crmShellEnd,
  crmShellStart,
  db,
  escapeHtml,
  fetchAnafCompany,
  normalizeCui,
  requireAuth
});

function nextQuoteNumber(){
  const year = new Date().getFullYear();

  const row = db.prepare(`
    SELECT seq
    FROM quotes
    WHERE year=?
    ORDER BY seq DESC
    LIMIT 1
  `).get(year);

  const seq = (row?.seq || 0) + 1;
  const num = "Q-" + year + "-" + String(seq).padStart(4,"0");

  return { year, seq, quote_number:num };
}


function nextFacturaNumber(){
  return nextConfiguredInvoiceNumber(db, {
    year: new Date().getFullYear(),
    companyId: currentRequestCompanyId()
  });
}


// =========================
// Quotes / Offers (v1)
// =========================

function recalcQuoteTotals(quote_id, companyId = null){
  const hasTenantScope = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
  const items = hasTenantScope
    ? db.prepare(`
        SELECT id, qty, unit_price
        FROM quote_items
        WHERE quote_id=? AND company_id=?
      `).all(quote_id, Number(companyId))
    : db.prepare(`
        SELECT id, qty, unit_price
        FROM quote_items
        WHERE quote_id=?
      `).all(quote_id);

  let subtotal = 0;
  for (const it of items) {
    const q = Number(it.qty ?? 0);
    const p = Number(it.unit_price ?? 0);
    const line = (Number.isFinite(q) ? q : 0) * (Number.isFinite(p) ? p : 0);
    subtotal += line;
    if (hasTenantScope) {
      db.prepare("UPDATE quote_items SET line_total=? WHERE id=? AND company_id=?").run(line, it.id, Number(companyId));
    } else {
      db.prepare("UPDATE quote_items SET line_total=? WHERE id=?").run(line, it.id);
    }
  }

  const qrow = hasTenantScope
    ? db.prepare("SELECT vat_rate FROM quotes WHERE id=? AND company_id=?").get(quote_id, Number(companyId))
    : db.prepare("SELECT vat_rate FROM quotes WHERE id=?").get(quote_id);
  const vat_rate = Number(qrow?.vat_rate ?? 0);
  const vat_amount = subtotal * (Number.isFinite(vat_rate) ? vat_rate : 0);
  const total = subtotal + vat_amount;

  if (hasTenantScope) {
    db.prepare(`
      UPDATE quotes
      SET subtotal=?, vat_amount=?, total=?
      WHERE id=? AND company_id=?
    `).run(subtotal, vat_amount, total, quote_id, Number(companyId));
  } else {
    db.prepare(`
      UPDATE quotes
      SET subtotal=?, vat_amount=?, total=?
      WHERE id=?
    `).run(subtotal, vat_amount, total, quote_id);
  }

  return { subtotal, vat_rate, vat_amount, total };
}

app.get("/export/contracts.csv", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const rows = db.prepare(`
    SELECT c.id, c.contract_number, c.created_at, c.year, c.seq,
           c.service_description, c.price, c.duration, c.pdf_path,
           cl.cui AS client_cui, cl.name AS client_name
    FROM contracts c
    JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
    WHERE c.company_id=?
    ORDER BY c.id DESC
    LIMIT 5000
  `).all(companyId);

  function csvEscape(v){
    const s = String(v ?? "");
    if (/[",\n\r;]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
    return s;
  }

  const header = [
    "id","contract_number","created_at","year","seq",
    "client_cui","client_name",
    "service_description","price","duration","pdf_path"
  ].join(",");

  const lines = rows.map(r => [
    r.id, r.contract_number, r.created_at, r.year, r.seq,
    r.client_cui, r.client_name,
    r.service_description, r.price, r.duration, r.pdf_path
  ].map(csvEscape).join(","));

  const csv = [header, ...lines].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=contracts.csv");
  res.send(csv);
});


function uiShellStyles(){
  return `
  <style>
    :root{
      --bg:#eff3f8;
      --bg-accent:rgba(15,23,42,.08);
      --panel:rgba(255,255,255,.88);
      --panel-2:#f8fafc;
      --line:rgba(148,163,184,.22);
      --line-2:rgba(148,163,184,.34);
      --text:#0f172a;
      --muted:#64748b;
      --nav:#0f172a;
      --nav-2:#172033;
      --nav-line:rgba(255,255,255,.08);
      --nav-text:#cbd5e1;
      --nav-muted:#7f8ea3;
      --nav-active-bg:linear-gradient(135deg,#2463eb,#1637a3);
      --nav-active-text:#ffffff;
      --primary:#2563eb;
      --primary-2:#1d4ed8;
      --success:#15803d;
      --danger:#be123c;
      --warning:#b45309;
      --radius:18px;
      --shadow:0 16px 40px rgba(15,23,42,.10);
      --shadow-soft:0 8px 24px rgba(15,23,42,.07);
      --topbar:rgba(255,255,255,.78);
      --topbar-border:rgba(255,255,255,.7);
      --kpi-bg:linear-gradient(180deg,rgba(255,255,255,.96) 0%, rgba(248,250,252,.88) 100%);
      --table-head:#f8fafc;
      --hover:#f8fbff;
      --theme-ring:rgba(37,99,235,.18);
      --hero-start:#1e293b;
      --hero-mid:#1d4ed8;
      --hero-end:#38bdf8;
    }

    body.crm-body[data-theme="ivory-gold"]{
      --bg:#f6f0e4;
      --bg-accent:rgba(146,109,44,.12);
      --panel:rgba(255,250,244,.9);
      --panel-2:#fffaf0;
      --line:rgba(146,109,44,.18);
      --line-2:rgba(146,109,44,.28);
      --text:#332316;
      --muted:#7a6146;
      --nav:#2f2218;
      --nav-2:#473324;
      --nav-line:rgba(255,242,218,.10);
      --nav-text:#f1dfc2;
      --nav-muted:#bea37d;
      --nav-active-bg:linear-gradient(135deg,#b88a44,#8d6420);
      --primary:#9f6d25;
      --primary-2:#80541b;
      --success:#3d7a3d;
      --danger:#a23b34;
      --warning:#9b5d00;
      --topbar:rgba(255,248,239,.75);
      --topbar-border:rgba(255,245,226,.72);
      --kpi-bg:linear-gradient(180deg,rgba(255,251,246,.98) 0%, rgba(252,245,233,.92) 100%);
      --table-head:#f8eee0;
      --hover:#fff8ef;
      --theme-ring:rgba(184,138,68,.18);
      --hero-start:#4a3118;
      --hero-mid:#9f6d25;
      --hero-end:#d9b36a;
    }

    body.crm-body[data-theme="forest-ledger"]{
      --bg:#e8f2ec;
      --bg-accent:rgba(29,78,59,.10);
      --panel:rgba(250,255,252,.9);
      --panel-2:#f4fbf7;
      --line:rgba(58,110,88,.18);
      --line-2:rgba(58,110,88,.28);
      --text:#163127;
      --muted:#537567;
      --nav:#11251d;
      --nav-2:#193429;
      --nav-line:rgba(214,255,235,.08);
      --nav-text:#d4efe1;
      --nav-muted:#86a899;
      --nav-active-bg:linear-gradient(135deg,#1f7a55,#14523a);
      --primary:#1e7b57;
      --primary-2:#155a40;
      --success:#146c43;
      --danger:#a22c48;
      --warning:#a16207;
      --topbar:rgba(245,255,250,.76);
      --topbar-border:rgba(232,247,239,.7);
      --kpi-bg:linear-gradient(180deg,rgba(250,255,252,.98) 0%, rgba(239,248,243,.92) 100%);
      --table-head:#eef8f1;
      --hover:#f4fcf7;
      --theme-ring:rgba(30,123,87,.18);
      --hero-start:#123126;
      --hero-mid:#1e7b57;
      --hero-end:#4ecb95;
    }

    body.crm-body[data-theme="midnight-neon"]{
      --bg:#0a1020;
      --bg-accent:rgba(0,229,255,.12);
      --panel:rgba(14,21,42,.82);
      --panel-2:#101935;
      --line:rgba(82,109,173,.28);
      --line-2:rgba(82,109,173,.38);
      --text:#e5eefb;
      --muted:#95a7c6;
      --nav:#060b17;
      --nav-2:#0c1428;
      --nav-line:rgba(96,165,250,.10);
      --nav-text:#c2d7ff;
      --nav-muted:#6881ad;
      --nav-active-bg:linear-gradient(135deg,#00c2ff,#3b82f6);
      --primary:#22c1ff;
      --primary-2:#1095cb;
      --success:#34d399;
      --danger:#fb7185;
      --warning:#fbbf24;
      --topbar:rgba(10,16,32,.62);
      --topbar-border:rgba(38,56,102,.8);
      --kpi-bg:linear-gradient(180deg,rgba(16,25,53,.94) 0%, rgba(10,16,32,.84) 100%);
      --table-head:#101935;
      --hover:#121d3a;
      --theme-ring:rgba(34,193,255,.18);
      --hero-start:#07111f;
      --hero-mid:#0f4fa8;
      --hero-end:#22c1ff;
    }

    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body.crm-body{
      font-family:"Plus Jakarta Sans","Segoe UI",sans-serif;
      background:var(--bg);
      color:var(--text);
      position:relative;
      overflow-x:hidden;
    }

    body.crm-body::before,
    body.crm-body::after{
      content:"";
      position:fixed;
      inset:auto;
      border-radius:999px;
      pointer-events:none;
      z-index:0;
      filter:blur(12px);
    }

    body.crm-body::before{
      width:440px;
      height:440px;
      top:-120px;
      right:-120px;
      background:radial-gradient(circle,var(--bg-accent) 0%, rgba(255,255,255,0) 70%);
    }

    body.crm-body::after{
      width:380px;
      height:380px;
      left:-140px;
      bottom:-120px;
      background:radial-gradient(circle,var(--theme-ring) 0%, rgba(255,255,255,0) 72%);
    }

    .crm-layout{
      min-height:100vh;
      display:grid;
      position:relative;
      z-index:1;
      gap:0;
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="visible"] .crm-layout{
      grid-template-columns:236px minmax(0,1fr) 280px;
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="visible"] .crm-sidebar-left{
      grid-column:1;
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="visible"] .crm-main{
      grid-column:2;
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="visible"] .crm-sidebar-right{
      grid-column:3;
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="hidden"] .crm-layout{
      grid-template-columns:236px minmax(0,1fr);
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="hidden"] .crm-sidebar-left{
      grid-column:1;
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="hidden"] .crm-main{
      grid-column:2;
    }

    body.crm-body[data-left-sidebar="hidden"][data-right-sidebar="visible"] .crm-layout{
      grid-template-columns:minmax(0,1fr) 280px;
    }

    body.crm-body[data-left-sidebar="hidden"][data-right-sidebar="visible"] .crm-main{
      grid-column:1;
    }

    body.crm-body[data-left-sidebar="hidden"][data-right-sidebar="visible"] .crm-sidebar-right{
      grid-column:2;
    }

    body.crm-body[data-left-sidebar="hidden"][data-right-sidebar="hidden"] .crm-layout{
      grid-template-columns:minmax(0,1fr);
    }

    body.crm-body[data-left-sidebar="hidden"][data-right-sidebar="hidden"] .crm-main{
      grid-column:1;
    }

    .crm-sidebar{
      background:
        radial-gradient(circle at top right, rgba(255,255,255,.08), transparent 34%),
        linear-gradient(180deg,var(--nav) 0%, var(--nav-2) 100%);
      color:var(--nav-text);
      padding:18px 14px;
      border-right:1px solid var(--nav-line);
      position:sticky;
      top:0;
      height:100vh;
      overflow:auto;
      grid-row:1;
    }

    .crm-sidebar-left{
      border-right:1px solid var(--nav-line);
      border-left:none;
    }

    .crm-sidebar-right{
      border-left:1px solid var(--nav-line);
      border-right:none;
      background:
        radial-gradient(circle at top left, rgba(255,255,255,.08), transparent 34%),
        linear-gradient(180deg,var(--nav) 0%, var(--nav-2) 100%);
    }

    .crm-sidebar-right .crm-brand-badge{
      background:linear-gradient(135deg,#14b8a6,#0f766e);
      box-shadow:0 10px 25px rgba(20,184,166,.28);
    }

    .crm-brand{
      display:flex;
      align-items:center;
      gap:10px;
      margin-bottom:18px;
      padding:4px 2px 14px 2px;
      border-bottom:1px solid var(--nav-line);
    }

    .crm-brand-copy{
      min-width:0;
    }

    .crm-brand-badge{
      width:38px;
      height:38px;
      border-radius:12px;
      background:linear-gradient(135deg,#3b82f6,#1d4ed8);
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:800;
      box-shadow:0 10px 25px rgba(37,99,235,.35);
      flex:0 0 auto;
    }

    .crm-brand-title{
      color:#fff;
      font-size:15px;
      font-weight:800;
      line-height:1.15;
      margin:0;
    }

    .crm-brand-sub{
      color:#94a3b8;
      font-size:11px;
      margin-top:3px;
    }

    .crm-app-menubar{
      position:sticky;
      top:0;
      z-index:50;
      display:flex;
      align-items:center;
      gap:12px;
      width:100%;
      min-height:58px;
      margin:0 0 16px 0;
      padding:9px 12px;
      border:1px solid var(--topbar-border);
      border-radius:16px;
      background:var(--topbar);
      backdrop-filter:blur(10px);
      box-shadow:var(--shadow);
    }

    .crm-menu-brand{
      display:inline-flex;
      align-items:center;
      gap:10px;
      min-width:max-content;
      color:var(--text);
      text-decoration:none;
      padding:4px 8px 4px 4px;
      border-radius:12px;
    }

    .crm-menu-brand:hover{
      background:rgba(148,163,184,.14);
    }

    .crm-menu-brand .crm-brand{
      margin:0;
      padding:0;
      border:0;
    }

    .crm-menu-brand .crm-brand-title{
      color:var(--text);
    }

    .crm-menu-brand .crm-brand-sub{
      color:var(--muted);
    }

    .crm-menu-strip{
      display:flex;
      align-items:center;
      gap:4px;
      flex:1 1 auto;
      min-width:0;
    }

    .crm-menu{
      position:relative;
      flex:0 0 auto;
    }

    .crm-menu[open]{
      z-index:80;
    }

    .crm-menu summary{
      list-style:none;
      display:inline-flex;
      align-items:center;
      gap:8px;
      height:38px;
      padding:0 12px;
      border:1px solid transparent;
      border-radius:10px;
      cursor:pointer;
      color:var(--text);
      font-size:13px;
      font-weight:800;
      user-select:none;
      white-space:nowrap;
      transition:background .14s ease, border-color .14s ease, color .14s ease;
    }

    .crm-menu summary::-webkit-details-marker{
      display:none;
    }

    .crm-menu summary:hover,
    .crm-menu[open] summary{
      background:rgba(148,163,184,.16);
      border-color:var(--line);
    }

    .crm-menu.active summary{
      background:var(--primary);
      border-color:var(--primary);
      color:#fff;
      box-shadow:0 8px 18px rgba(37,99,235,.22);
    }

    .crm-menu-caret{
      width:14px;
      height:14px;
      stroke:currentColor;
      fill:none;
      stroke-width:2;
      stroke-linecap:round;
      stroke-linejoin:round;
      transition:transform .14s ease;
    }

    .crm-menu[open] .crm-menu-caret{
      transform:rotate(180deg);
    }

    .crm-classic-menu-dropdown{
      position:absolute;
      top:calc(100% + 8px);
      left:0;
      width:min(360px, calc(100vw - 28px));
      max-height:min(72vh, 680px);
      overflow:auto;
      padding:10px;
      border:1px solid var(--line);
      border-radius:14px;
      background:var(--panel-2);
      box-shadow:0 22px 55px rgba(15,23,42,.18);
      z-index:90;
    }

    .crm-menu-align-right .crm-classic-menu-dropdown{
      left:auto;
      right:0;
    }

    .crm-classic-menu-section + .crm-classic-menu-section{
      margin-top:8px;
      padding-top:8px;
      border-top:1px solid var(--line);
    }

    .crm-classic-menu-section-title{
      margin:2px 4px 6px;
      color:var(--muted);
      font-size:10px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
    }

    .crm-classic-menu-list{
      display:grid;
      gap:3px;
    }

    .crm-classic-menu-link{
      display:flex;
      align-items:center;
      gap:9px;
      min-height:36px;
      padding:8px 10px;
      border:1px solid transparent;
      border-radius:10px;
      color:var(--text);
      text-decoration:none;
      font-size:13px;
      font-weight:700;
    }

    .crm-classic-menu-link:hover{
      background:rgba(148,163,184,.14);
      border-color:var(--line);
    }

    .crm-classic-menu-link.active{
      background:rgba(37,99,235,.12);
      border-color:rgba(37,99,235,.22);
      color:var(--primary-2);
    }

    .crm-classic-favorite-row{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:6px;
      align-items:center;
    }

    .crm-classic-favorite-row .crm-favorite-toggle{
      width:34px;
      height:34px;
      border-radius:10px;
      background:rgba(148,163,184,.12);
      border-color:var(--line);
      color:var(--muted);
      box-shadow:none;
    }

    .crm-classic-favorite-row .crm-favorite-toggle:hover{
      background:rgba(148,163,184,.18);
      color:var(--text);
    }

    .crm-classic-favorite-row .crm-favorite-toggle.active{
      background:rgba(245,158,11,.16);
      border-color:rgba(245,158,11,.32);
      color:#b45309;
    }

    .crm-menu-tools{
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:8px;
      flex:0 0 auto;
      min-width:0;
      margin-left:auto;
    }

    .crm-menu-meta{
      display:flex;
      align-items:center;
      gap:6px;
      min-width:0;
    }

    .crm-menu-chip{
      display:inline-flex;
      align-items:center;
      max-width:190px;
      min-height:32px;
      padding:6px 9px;
      border:1px solid var(--line);
      border-radius:10px;
      background:rgba(255,255,255,.62);
      color:var(--text);
      font-size:11px;
      font-weight:800;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .crm-menu-chip-status{
      color:var(--muted);
    }

    .crm-app-menubar .crm-theme-select-wrap{
      width:138px;
      margin:0;
    }

    .crm-app-menubar .crm-theme-select{
      height:36px;
      padding:8px 30px 8px 10px;
      font-size:12px;
      font-weight:800;
      background:rgba(255,255,255,.72);
    }

    .crm-nav{
      display:flex;
      flex-direction:column;
      gap:6px;
      margin-top:10px;
    }

    .crm-nav-section{
      margin:14px 6px 6px 6px;
      font-size:10px;
      font-weight:700;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--nav-muted);
    }

    .crm-nav-group{
      border:1px solid rgba(255,255,255,.05);
      background:rgba(255,255,255,.03);
      border-radius:14px;
      padding:8px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.02);
    }

    .crm-nav-section-spotlight{
      color:#bbf7d0;
    }

    .crm-nav-group-spotlight{
      border-color:rgba(74,222,128,.34);
      background:
        radial-gradient(circle at top right, rgba(45,212,191,.2), transparent 34%),
        linear-gradient(135deg, rgba(5,46,22,.9) 0%, rgba(6,95,70,.78) 100%);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.06),
        0 18px 36px rgba(3, 105, 80, .2);
    }

    .crm-nav-group-spotlight .crm-nav-group-sub{
      color:rgba(220,252,231,.82);
    }

    .crm-nav-group-spotlight .crm-nav-pill{
      background:rgba(187,247,208,.18);
      color:#dcfce7;
    }

    .crm-nav-group-head{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:8px;
      padding:3px 4px 6px 4px;
    }

    .crm-nav-group-title{
      font-size:13px;
      font-weight:800;
      color:#fff;
    }

    .crm-nav-group-sub{
      margin-top:2px;
      color:var(--nav-muted);
      font-size:10px;
      line-height:1.35;
    }

    .crm-nav-pill{
      flex:0 0 auto;
      padding:3px 8px;
      border-radius:999px;
      font-size:9px;
      font-weight:800;
      letter-spacing:.06em;
      text-transform:uppercase;
      color:#fff;
      background:rgba(255,255,255,.08);
    }

    .crm-nav a{
      text-decoration:none;
      color:var(--nav-text);
      display:flex;
      align-items:center;
      gap:9px;
      padding:9px 10px;
      border-radius:12px;
      border:1px solid transparent;
      transition:all .16s ease;
      font-weight:600;
      font-size:13px;
    }

    .crm-nav-icon{
      width:16px;
      height:16px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:currentColor;
      opacity:.95;
    }

    .crm-nav-icon svg{
      width:16px;
      height:16px;
      stroke:currentColor;
      fill:none;
      stroke-width:1.9;
      stroke-linecap:round;
      stroke-linejoin:round;
    }

    .crm-nav a:hover{
      background:rgba(255,255,255,.06);
      color:#fff;
      border-color:rgba(255,255,255,.06);
    }

    .crm-nav a.active{
      background:var(--nav-active-bg);
      color:var(--nav-active-text);
      box-shadow:0 8px 22px rgba(37,99,235,.35);
    }

    .crm-nav-subnav{
      margin:-1px 0 2px 12px;
      padding-left:10px;
      border-left:1px solid rgba(255,255,255,.10);
      display:flex;
      flex-direction:column;
      gap:4px;
    }

    .crm-nav-subnav-title{
      margin:4px 0 0 12px;
      padding-left:10px;
      color:#e2e8f0;
      font-size:11px;
      font-weight:800;
      letter-spacing:.04em;
      text-transform:uppercase;
    }

    .crm-nav-subnav a{
      padding:7px 10px;
      font-size:12px;
      border-radius:10px;
      background:rgba(255,255,255,.02);
    }

    .crm-sidebar-footer{
      margin-top:14px;
      padding-top:12px;
      border-top:1px solid var(--nav-line);
    }

    .crm-sidebar-footer-title{
      margin:0 6px 8px 6px;
      font-size:10px;
      font-weight:700;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--nav-muted);
    }

    .crm-sidebar-select-wrap{
      margin:0 6px;
      padding:8px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.05);
      background:rgba(255,255,255,.03);
    }

    .crm-sidebar-select-title{
      margin:0 0 6px 2px;
      font-size:10px;
      font-weight:700;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--nav-muted);
    }

    .crm-sidebar .crm-theme-select-wrap{
      margin:0 6px;
    }

    .crm-sidebar .crm-theme-select,
    .crm-sidebar .crm-sidebar-select{
      background:rgba(255,255,255,.06);
      border-color:rgba(255,255,255,.10);
      color:var(--nav-text);
      font-size:12px;
      font-weight:700;
      padding-right:34px;
    }

    .crm-sidebar .crm-theme-select:focus,
    .crm-sidebar .crm-sidebar-select:focus{
      border-color:rgba(147,197,253,.72);
      box-shadow:0 0 0 3px rgba(37,99,235,.16);
    }

    .crm-sidebar .crm-theme-select option,
    .crm-sidebar .crm-sidebar-select option{
      color:#0f172a;
      background:#ffffff;
    }

    .crm-sidebar-meta{
      margin:10px 4px 0 4px;
      display:grid;
      gap:6px;
    }

    .crm-sidebar-meta-chip{
      display:grid;
      gap:4px;
      padding:8px 10px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.05);
      color:var(--nav-text);
    }

    .crm-sidebar-meta-chip strong{
      font-size:10px;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--nav-muted);
      font-weight:800;
    }

    .crm-sidebar-meta-chip span{
      font-size:12px;
      font-weight:700;
      color:#fff;
      word-break:break-word;
    }

    .crm-main{
      min-width:0;
      padding:18px;
      grid-row:1;
    }

    .login-shell::before{
    content:"";
    position:absolute;
    inset:10% -8% auto -8%;
    height:220px;
    background:radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,0) 70%);
    filter:blur(10px);
    pointer-events:none;
    }

    .crm-topbar{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:12px;
      margin-bottom:16px;
      background:var(--topbar);
      backdrop-filter:blur(8px);
      border:1px solid var(--topbar-border);
      border-radius:18px;
      padding:14px 16px;
      box-shadow:var(--shadow);
    }

    .crm-topbar.crm-topbar-compact{
      flex-direction:column;
      justify-content:flex-start;
      align-items:flex-end;
      gap:6px;
      margin-bottom:10px;
      padding:0;
      background:transparent;
      border:none;
      box-shadow:none;
      backdrop-filter:none;
    }

    .crm-topbar-meta{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:4px;
      width:auto;
      max-width:100%;
    }

    .crm-topbar-meta-row{
      display:flex;
      gap:4px;
      flex-wrap:wrap;
      justify-content:flex-end;
    }

    .crm-topbar-chip{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:6px 10px;
      border-radius:12px;
      border:1px solid rgba(148,163,184,.22);
      background:rgba(255,255,255,.78);
      box-shadow:0 8px 20px rgba(15,23,42,.05);
      font-size:11px;
      color:#0f172a;
      max-width:100%;
    }

    .crm-topbar-chip strong{
      font-size:10px;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:#6b7280;
      font-weight:800;
    }

    .crm-topbar-chip span{
      font-weight:600;
      color:#1f2937;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      max-width:220px;
    }

    .crm-topbar-chip-status-active{
      background:rgba(240,253,244,.95);
      border-color:rgba(134,239,172,.55);
    }

    .crm-topbar-chip-status-trial{
      background:rgba(239,246,255,.95);
      border-color:rgba(147,197,253,.5);
    }

    .crm-topbar-chip-status-past_due{
      background:rgba(255,251,235,.96);
      border-color:rgba(252,211,77,.55);
    }

    .crm-page-kicker{
      color:var(--muted);
      font-size:11px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.08em;
      margin:0 0 6px 0;
    }

    .crm-page-title{
      margin:0;
      font-size:26px;
      line-height:1.1;
      font-weight:800;
      color:var(--text);
    }

    .crm-page-subtitle{
      margin-top:4px;
      color:var(--muted);
      font-size:13px;
    }

    .crm-user{
      color:var(--muted);
      font-size:12px;
      margin-top:4px;
    }

    .crm-actions{
      display:flex;
      gap:8px;
      align-items:center;
      flex-wrap:wrap;
    }

    .crm-content{
      min-width:0;
    }

    .crm-card{
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:var(--radius);
      box-shadow:var(--shadow-soft);
      backdrop-filter:blur(8px);
      padding:16px;
    }

    .crm-card + .crm-card{ margin-top:14px; }

    .crm-grid{
      display:grid;
      gap:14px;
    }

    .crm-grid-2{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
    }

    .crm-kpis{
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:12px;
    }

    .crm-kpi{
      background:var(--kpi-bg);
      border:1px solid var(--line);
      border-radius:16px;
      padding:14px;
      box-shadow:var(--shadow-soft);
    }

    .crm-kpi-label{
      color:var(--muted);
      font-size:12px;
      font-weight:600;
      margin-bottom:6px;
    }

    .crm-kpi-value{
      font-size:24px;
      font-weight:800;
      color:var(--text);
      line-height:1;
    }

    .crm-hero-grid{
      display:grid;
      grid-template-columns:1.35fr .95fr;
      gap:0;
    }

    .crm-hero-panel{
      padding:22px;
      background:linear-gradient(135deg,var(--hero-start) 0%,var(--hero-mid) 54%,var(--hero-end) 100%);
      color:#fff;
    }

    .crm-hero-side{
      padding:22px;
      background:linear-gradient(180deg,rgba(255,255,255,.96) 0%, rgba(248,250,252,.92) 100%);
      border-left:1px solid var(--line);
    }

    .crm-hero-metrics{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:10px;
      margin-top:18px;
    }

    .crm-table-wrap{
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:14px;
      overflow:hidden;
      box-shadow:var(--shadow-soft);
    }

    table.crm-table{
      width:100%;
      border-collapse:collapse;
      background:transparent;
    }

    .crm-table th,
    .crm-table td{
      padding:11px 12px;
      border-bottom:1px solid #eef2f7;
      text-align:left;
      vertical-align:top;
    }

    .crm-table th{
      background:var(--table-head);
      color:var(--muted);
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:.05em;
      font-weight:800;
    }

    .crm-table tbody tr:hover td{
      background:var(--hover);
    }

    .crm-input,
    .crm-select,
    .crm-textarea{
      width:100%;
      padding:9px 11px;
      border:1px solid var(--line-2);
      border-radius:10px;
      background:rgba(255,255,255,.88);
      color:var(--text);
      font-size:13px;
      line-height:1.35;
      outline:none;
      transition:border-color .15s ease, box-shadow .15s ease, background .15s ease;
    }

    body.crm-body[data-theme="midnight-neon"] .crm-input,
    body.crm-body[data-theme="midnight-neon"] .crm-select,
    body.crm-body[data-theme="midnight-neon"] .crm-textarea{
      background:rgba(10,16,32,.82);
      color:var(--text);
    }

    .crm-input:focus,
    .crm-select:focus,
    .crm-textarea:focus{
      border-color:#93c5fd;
      box-shadow:0 0 0 4px rgba(37,99,235,.12);
    }

    .crm-label{
      display:block;
      margin-bottom:6px;
      font-weight:700;
      color:#334155;
      font-size:13px;
    }

    .crm-btn{
      appearance:none;
      border:none;
      background:var(--primary);
      color:#fff;
      padding:8px 12px;
      border-radius:10px;
      font-weight:700;
      font-size:13px;
      line-height:1.2;
      cursor:pointer;
      box-shadow:0 8px 18px rgba(37,99,235,.18);
      transition:transform .12s ease, box-shadow .12s ease, background .12s ease;
    }

    .crm-btn:hover{
      background:var(--primary-2);
      transform:translateY(-1px);
      box-shadow:0 12px 24px rgba(37,99,235,.22);
    }

    .crm-btn-secondary{
      background:rgba(148,163,184,.18);
      color:var(--text);
      box-shadow:none;
      border:1px solid var(--line);
    }

    .crm-btn-secondary:hover{
      background:rgba(148,163,184,.28);
      box-shadow:none;
    }

    .crm-btn-danger{
      background:#fff1f2;
      color:var(--danger);
      border:1px solid #fecdd3;
      box-shadow:none;
    }

    .crm-btn-danger:hover{
      background:#ffe4e6;
      box-shadow:none;
    }

    .crm-icon-btn{
      appearance:none;
      border:1px solid var(--line);
      background:var(--panel);
      color:var(--text);
      width:38px;
      height:38px;
      border-radius:12px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      box-shadow:var(--shadow-soft);
      transition:transform .12s ease, border-color .12s ease, background .12s ease;
    }

    .crm-icon-btn:hover{
      transform:translateY(-1px);
      border-color:var(--primary);
    }

    .crm-icon-btn svg{
      width:16px;
      height:16px;
      stroke:currentColor;
      fill:none;
      stroke-width:2;
      stroke-linecap:round;
      stroke-linejoin:round;
    }

    .crm-badge{
      display:inline-flex;
      align-items:center;
      gap:5px;
      padding:5px 8px;
      border-radius:999px;
      font-size:11px;
      font-weight:800;
      border:1px solid transparent;
    }

    .crm-badge-neutral{background:#f1f5f9;color:#334155;border-color:#e2e8f0}
    .crm-badge-blue{background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe}
    .crm-badge-green{background:#dcfce7;color:#166534;border-color:#bbf7d0}
    .crm-badge-amber{background:#fef3c7;color:#92400e;border-color:#fde68a}
    .crm-badge-red{background:#ffe4e6;color:#be123c;border-color:#fecdd3}

    .crm-muted{color:var(--muted)}
    .crm-right{text-align:right}
    .crm-stack{display:flex;flex-direction:column;gap:14px}
    .crm-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}

    .crm-mobile-nav{
      display:none;
      margin:0 0 14px 0;
      padding:12px;
      background:linear-gradient(180deg,var(--nav) 0%, var(--nav-2) 100%);
      border-radius:18px;
      box-shadow:var(--shadow);
    }

    .crm-mobile-nav .crm-nav{
      gap:6px;
    }

    .crm-mobile-nav a{
      color:#cbd5e1;
    }

    .crm-mobile-nav a.active{
      background:#2563eb;
      color:#fff;
    }

    .crm-theme-switcher{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      justify-content:flex-end;
      margin-bottom:10px;
    }

    .crm-card .crm-theme-switcher{
      justify-content:flex-start;
      margin-bottom:0;
    }

    .crm-theme-chip{
      appearance:none;
      border:1px solid var(--line);
      background:var(--panel);
      color:var(--text);
      border-radius:999px;
      padding:6px 10px;
      display:flex;
      align-items:center;
      gap:8px;
      cursor:pointer;
      font:inherit;
      font-size:11px;
      font-weight:800;
      box-shadow:var(--shadow-soft);
      transition:transform .14s ease, border-color .14s ease, box-shadow .14s ease;
    }

    .crm-theme-chip:hover{
      transform:translateY(-1px);
      border-color:var(--primary);
    }

    .crm-theme-chip.active{
      border-color:var(--primary);
      box-shadow:0 0 0 4px var(--theme-ring);
    }

    .crm-theme-dot{
      width:12px;
      height:12px;
      border-radius:999px;
      flex:0 0 auto;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="hidden"][data-sidebar="collapsed"] .crm-layout{
      grid-template-columns:84px minmax(0,1fr);
    }

    body.crm-body[data-left-sidebar="visible"][data-right-sidebar="visible"][data-sidebar="collapsed"] .crm-layout{
      grid-template-columns:84px minmax(0,1fr) 280px;
    }

    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left{
      padding-left:10px;
      padding-right:10px;
    }

    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-brand{
      justify-content:center;
    }

    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-brand-copy,
    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-nav-section,
    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-nav-group-head,
    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-nav-subnav{
      display:none;
    }

    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-nav-group{
      padding:4px;
      background:transparent;
      border-color:transparent;
      box-shadow:none;
    }

    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-nav a{
      justify-content:center;
      padding:10px;
    }

    body.crm-body[data-sidebar="collapsed"] .crm-sidebar-left .crm-nav a span:last-child{
      display:none;
    }

    .crm-favorite-row{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:8px;
      align-items:center;
    }

    .crm-favorite-row + .crm-nav-subnav{
      margin-top:2px;
    }

    .crm-favorite-toggle{
      appearance:none;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.04);
      color:var(--nav-text);
      width:36px;
      height:36px;
      border-radius:12px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      transition:transform .14s ease, background .14s ease, border-color .14s ease, color .14s ease;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
    }

    .crm-favorite-toggle:hover{
      transform:translateY(-1px);
      background:rgba(255,255,255,.08);
      color:#fff;
    }

    .crm-favorite-toggle.active{
      background:rgba(250,204,21,.18);
      border-color:rgba(250,204,21,.32);
      color:#fde68a;
    }

    .crm-favorite-toggle svg{
      width:18px;
      height:18px;
      stroke:currentColor;
      fill:none;
      stroke-width:1.8;
      stroke-linecap:round;
      stroke-linejoin:round;
    }

    .crm-favorite-toggle.active svg{
      fill:currentColor;
    }

    .crm-favorite-empty{
      padding:10px;
      border-radius:12px;
      border:1px dashed rgba(255,255,255,.12);
      background:rgba(255,255,255,.03);
      color:var(--nav-muted);
      font-size:12px;
      line-height:1.5;
    }

    .top{margin-bottom:0 !important}

    @media (max-width: 1440px), (max-height: 900px){
      body.crm-body[data-left-sidebar="visible"][data-right-sidebar="visible"] .crm-layout{
        grid-template-columns:220px minmax(0,1fr) 260px;
      }
      body.crm-body[data-left-sidebar="visible"][data-right-sidebar="hidden"] .crm-layout{
        grid-template-columns:220px minmax(0,1fr);
      }
      body.crm-body[data-left-sidebar="hidden"][data-right-sidebar="visible"] .crm-layout{
        grid-template-columns:minmax(0,1fr) 260px;
      }
      .crm-sidebar{padding:14px 12px}
      .crm-main{padding:14px}
      .crm-topbar{padding:12px 14px;margin-bottom:14px}
      .crm-app-menubar{margin-bottom:14px}
      .crm-page-title{font-size:24px}
      .crm-card{padding:14px}
      .crm-kpi{padding:12px}
      .crm-hero-panel,.crm-hero-side{padding:18px}
      .crm-table th,.crm-table td{padding:10px 12px}
      .crm-nav a{padding:8px 10px}
      .crm-nav-subnav a{padding:6px 9px}
      .crm-topbar-chip span{max-width:190px}
    }

    @media (max-width: 1100px){
      .crm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      .crm-grid-2{grid-template-columns:1fr}
      .crm-hero-grid{grid-template-columns:1fr}
      .crm-hero-side{border-left:none;border-top:1px solid var(--line)}
      .crm-layout{grid-template-columns:1fr}
      .crm-sidebar{display:none}
      .crm-mobile-nav{display:block}
      .crm-main{grid-column:1 !important}
      .crm-main{padding:14px}
      .crm-app-menubar{
        position:relative;
        flex-wrap:wrap;
        align-items:stretch;
      }
      .crm-menu-brand{
        flex:1 1 auto;
      }
      .crm-menu-strip{
        order:3;
        width:100%;
        flex:1 0 100%;
        overflow:visible;
        flex-wrap:wrap;
        padding-bottom:2px;
      }
      .crm-menu-tools{
        flex:0 1 auto;
      }
      .crm-menu-meta{
        display:none;
      }
      .crm-topbar{padding:12px 14px}
      .crm-page-title{font-size:22px}
      .crm-sidebar .crm-theme-select-wrap{max-width:none}
    }

    @media (max-width: 720px){
      .crm-kpis{grid-template-columns:1fr}
      .crm-hero-metrics{grid-template-columns:1fr}
      .crm-topbar{
        flex-direction:column;
        align-items:stretch;
      }
      .crm-actions{
        width:100%;
      }
      .crm-app-menubar .crm-theme-select-wrap{
        width:118px;
      }
      .crm-sidebar .crm-theme-select-wrap{
        width:100%;
      }
    }
  </style>`;
}

function crmThemeSelect(){
  const themes = [
    ["executive-slate", "Executive"],
    ["ivory-gold", "Ivory Gold"],
    ["forest-ledger", "Forest"],
    ["midnight-neon", "Midnight"]
  ];
  return `
    <div class="crm-theme-select-wrap">
      <select class="crm-select crm-theme-select" data-crm-theme-select aria-label="Alege tema">
        ${themes.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}
      </select>
    </div>
  `;
}

function crmSpvSelect(activeKey = ""){
  const selectedHref = activeKey === "accounting-spv-inbox"
    ? "/anaf/inbox"
    : activeKey === "accounting-spv-outbox"
      ? "/anaf/outbox"
      : "/anaf/status";
  const options = [
    ["/anaf/status", "Status conexiune"],
    ["/anaf/inbox", "Inbox e-Factura"],
    ["/anaf/outbox", "Outbox e-Factura"]
  ];
  return `
    <div class="crm-sidebar-select-wrap">
      <div class="crm-sidebar-select-title">SPV / e-Factura</div>
      <select class="crm-select crm-sidebar-select" data-nav-select aria-label="Navigare SPV">
        ${options.map(([href, label]) => `<option value="${href}" ${selectedHref === href ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </div>
  `;
}

function crmMenuIcon(name){
  const icons = {
    dashboard: `<svg viewBox="0 0 24 24"><path d="M4 5h7v6H4z"/><path d="M13 5h7v10h-7z"/><path d="M4 13h7v6H4z"/><path d="M13 17h7v2h-7z"/></svg>`,
    clients: `<svg viewBox="0 0 24 24"><path d="M16 19a4 4 0 0 0-8 0"/><circle cx="12" cy="9" r="3"/><path d="M5 19a3 3 0 0 1 3-3"/><path d="M19 19a3 3 0 0 0-3-3"/></svg>`,
    quotes: `<svg viewBox="0 0 24 24"><path d="M7 4h10l3 3v13H7z"/><path d="M17 4v4h4"/><path d="M10 12h7"/><path d="M10 16h5"/></svg>`,
    contracts: `<svg viewBox="0 0 24 24"><path d="M8 3h8l4 4v14H8z"/><path d="M16 3v4h4"/><path d="M11 13h6"/><path d="M11 17h6"/><path d="M11 9h2"/></svg>`,
    form: `<svg viewBox="0 0 24 24"><path d="M4 6h10"/><path d="M4 12h16"/><path d="M4 18h9"/><path d="M18 17l2 2 3-4"/></svg>`,
    produse: `<svg viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></svg>`,
    facturi: `<svg viewBox="0 0 24 24"><path d="M7 3h10v18l-3-2-2 2-2-2-3 2z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
    inventory: `<svg viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>`,
    accounting: `<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M15 13h1"/><path d="M8 17h8"/></svg>`,
    spv: `<svg viewBox="0 0 24 24"><path d="M3 7h18"/><path d="M5 7l7 6 7-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>`,
    tipizate: `<svg viewBox="0 0 24 24"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
    employees: `<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M4 19a5 5 0 0 1 10 0"/><path d="M16 8h4"/><path d="M18 6v4"/></svg>`,
    accounts: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M19 8h1"/><path d="M18.5 5.5l.7.7"/><path d="M18.5 10.5l.7-.7"/></svg>`,
    setari: `<svg viewBox="0 0 24 24"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5z"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z"/></svg>`,
    superadmin: `<svg viewBox="0 0 24 24"><path d="M3 10l9-6 9 6v10H3z"/><path d="M8 14h8"/><path d="M8 18h5"/><path d="M12 4v16"/></svg>`,
    anaf: `<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`
  };
  return icons[name] || icons.dashboard;
}

function crmStarIcon() {
  return `<svg viewBox="0 0 24 24"><path d="M12 3.5l2.75 5.57 6.15.89-4.45 4.34 1.05 6.13L12 17.55 6.5 20.43l1.05-6.13L3.1 9.96l6.15-.89L12 3.5z"/></svg>`;
}

function isSuperAdminUser(userEmail = "") {
  return String(process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(userEmail || "").trim().toLowerCase());
}

function getUserRoleByEmail(userEmail = "") {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return "";

  const row = db.prepare(`
    SELECT role
    FROM users
    WHERE lower(email)=?
    ORDER BY id DESC
    LIMIT 1
  `).get(normalizedEmail);

  return String(row?.role || "").trim().toLowerCase();
}

function canAccessSpvSidebar(userEmail = "") {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return false;

  const userRow = db.prepare(`
    SELECT u.role, u.is_company_admin, c.is_demo
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE lower(u.email)=?
    ORDER BY u.id DESC
    LIMIT 1
  `).get(normalizedEmail);

  return canAccessSpvUser({
    email: normalizedEmail,
    role: String(userRow?.role || "").trim().toLowerCase(),
    company_is_demo: Number(userRow?.is_demo || 0),
    is_company_admin: Number(userRow?.is_company_admin || 0),
    is_super_admin: isSuperAdminUser(normalizedEmail) ? 1 : 0
  });
}

function workspaceNavItem({ href, label, iconKey, isActive = false, extraClass = "", extraStyle = "", dataAttrs = "" }) {
  const classes = ["crm-nav-link", isActive ? "active" : "", extraClass].filter(Boolean).join(" ");
  return `<a href="${href}" class="${classes}" style="${extraStyle}" title="${label}" ${dataAttrs}><span class="crm-nav-icon">${crmMenuIcon(iconKey)}</span><span>${label}</span></a>`;
}

function workspaceNavGroup(title, subtitle, pill, itemsHtml, navAttrs = "", groupClass = "") {
  return `
      <section class="crm-nav-group ${groupClass}">
        <div class="crm-nav-group-head">
          <div>
            <div class="crm-nav-group-title">${title}</div>
            <div class="crm-nav-group-sub">${subtitle}</div>
          </div>
          <div class="crm-nav-pill">${pill}</div>
        </div>
        <nav class="crm-nav" ${navAttrs}>${itemsHtml}</nav>
      </section>
    `;
}

function getErpWorkspaceModules(active, userModules = []) {
  const activeKey = String(active || "");
  const inventoryOpen = [
    "inventory",
    "inventory-home",
    "inventory-assets",
    "inventory-projects",
    "inventory-reports",
    "inventory-counts"
  ].includes(activeKey);
  const accountingOpen = [
    "accounting",
    "accounting-home",
    "accounting-expenses",
    "accounting-declarations",
    "accounting-consumption",
    "accounting-receivables",
    "accounting-reconciliation"
  ].includes(activeKey);
  const tipizateOpen = ["tipizate", "tipizate-registru"].includes(activeKey);

  const modules = [];

  if (hasModuleAccess(userModules, "produse")) {
    modules.push({
      moduleKey: "produse",
      href: "/produse",
      label: "Produse / Servicii",
      iconKey: "produse",
      isActive: activeKey === "produse",
      subnavHtml: ""
    });
  }

  if (hasModuleAccess(userModules, "facturi")) {
    modules.push({
      moduleKey: "facturi",
      href: "/facturi",
      label: "Facturi",
      iconKey: "facturi",
      isActive: activeKey === "facturi",
      subnavHtml: ""
    });
  }

  if (hasModuleAccess(userModules, "inventory")) {
    modules.push({
      moduleKey: "inventory",
      href: "/inventory",
      label: "Inventar",
      iconKey: "inventory",
      isActive: inventoryOpen,
      subnavHtml: inventoryOpen ? `
        <div class="crm-nav-subnav">
          ${workspaceNavItem({ href: "/inventory/assets", label: "Active", iconKey: "inventory", isActive: activeKey === "inventory-assets" })}
          ${workspaceNavItem({ href: "/inventory/projects", label: "Inventar pe proiect", iconKey: "inventory", isActive: activeKey === "inventory-projects" })}
          ${workspaceNavItem({ href: "/inventory/reports", label: "Raport inventar", iconKey: "inventory", isActive: activeKey === "inventory-reports" })}
          ${workspaceNavItem({ href: "/inventory/counts", label: "Numărare inventar", iconKey: "inventory", isActive: activeKey === "inventory-counts" })}
        </div>
      ` : ""
    });
  }

  if (hasModuleAccess(userModules, "accounting")) {
    modules.push({
      moduleKey: "accounting",
      href: "/accounting",
      label: "Contabilitate",
      iconKey: "accounting",
      isActive: accountingOpen,
      subnavHtml: accountingOpen ? `
        <div class="crm-nav-subnav">
          ${workspaceNavItem({ href: "/accounting/declarations", label: "Declarații ANAF", iconKey: "accounting", isActive: activeKey === "accounting-declarations" })}
          ${workspaceNavItem({ href: "/accounting/expenses", label: "Cheltuieli", iconKey: "accounting", isActive: activeKey === "accounting-expenses" })}
          ${workspaceNavItem({ href: "/accounting/consumption", label: "Bonuri de consum", iconKey: "accounting", isActive: activeKey === "accounting-consumption" })}
          ${hasModuleAccess(userModules, "facturi") ? workspaceNavItem({ href: "/accounting/receivables", label: "Facturi de urmărit", iconKey: "facturi", isActive: activeKey === "accounting-receivables" }) : ""}
          ${workspaceNavItem({ href: "/accounting#reconciliere", label: "Reconciliere plăți", iconKey: "accounting", isActive: activeKey === "accounting-reconciliation" })}
        </div>
      ` : ""
    });
  }

  if (hasModuleAccess(userModules, "tipizate")) {
    modules.push({
      moduleKey: "tipizate",
      href: "/tipizate",
      label: "Tipizate",
      iconKey: "tipizate",
      isActive: tipizateOpen,
      subnavHtml: tipizateOpen ? `
        <div class="crm-nav-subnav">
          ${workspaceNavItem({ href: "/tipizate", label: "Documente", iconKey: "tipizate", isActive: activeKey === "tipizate" })}
          ${workspaceNavItem({ href: "/tipizate/registru", label: "Registru evidență", iconKey: "tipizate", isActive: activeKey === "tipizate-registru" })}
        </div>
      ` : ""
    });
  }

  if (hasModuleAccess(userModules, "employees")) {
    modules.push({
      moduleKey: "employees",
      href: "/employees",
      label: "Angajați",
      iconKey: "employees",
      isActive: activeKey === "employees",
      subnavHtml: ""
    });
  }

  return modules;
}

function buildWorkspaceNavigation(active, userModules = [], userEmail = "") {
  const activeKey = String(active || "");
  const contractsOpen = ["contracts", "form"].includes(activeKey);
  const isSuperAdmin = isSuperAdminUser(userEmail);
  const canAccessSpv = canAccessSpvSidebar(userEmail);
  const erpModules = getErpWorkspaceModules(activeKey, userModules);
  const erpModuleKeys = erpModules.map((module) => module.moduleKey);
  const favoriteModules = getUserFavoriteModules(userEmail, erpModuleKeys);
  const favoriteSet = new Set(favoriteModules);
  const favoriteMap = new Map(erpModules.map((module) => [module.moduleKey, module]));

  const crmItems = [
    hasModuleAccess(userModules, "dashboard") ? workspaceNavItem({ href: "/dashboard", label: "Dashboard", iconKey: "dashboard", isActive: activeKey === "dashboard" }) : "",
    hasModuleAccess(userModules, "clients") ? workspaceNavItem({ href: "/clients", label: "Clienți", iconKey: "clients", isActive: activeKey === "clients" }) : "",
    hasModuleAccess(userModules, "quotes") ? workspaceNavItem({ href: "/quotes", label: "Oferte", iconKey: "quotes", isActive: activeKey === "quotes" }) : "",
    hasModuleAccess(userModules, "contracts") ? workspaceNavItem({ href: "/contracte", label: "Contracte", iconKey: "contracts", isActive: activeKey === "contracts" }) : "",
    contractsOpen ? `
      <div class="crm-nav-subnav">
        ${workspaceNavItem({ href: "/contract-form", label: "Form contract", iconKey: "form", isActive: activeKey === "form" })}
      </div>
    ` : ""
  ].join("");

  const settingsItems = [
    hasModuleAccess(userModules, "accounts") ? workspaceNavItem({ href: "/accounts", label: "Utilizatori", iconKey: "accounts", isActive: activeKey === "accounts" }) : "",
    hasModuleAccess(userModules, "setari") ? workspaceNavItem({ href: "/nexora/settings", label: "Setări", iconKey: "setari", isActive: activeKey === "setari" }) : "",
    isSuperAdmin ? workspaceNavItem({ href: "/nexora/super-admin/companies", label: "Companii", iconKey: "superadmin", isActive: activeKey === "superadmin" }) : "",
    isSuperAdmin ? workspaceNavItem({ href: "/nexora/super-admin/payments", label: "Plăți", iconKey: "facturi", isActive: activeKey === "superadmin-payments" }) : ""
  ].join("");

  const favoriteLinksHtml = favoriteModules
    .map((moduleKey) => favoriteMap.get(moduleKey))
    .filter(Boolean)
    .map((module) => workspaceNavItem({
      href: module.href,
      label: module.label,
      iconKey: module.iconKey,
      isActive: module.isActive,
      dataAttrs: `data-favorite-link="${module.moduleKey}"`
    }))
    .join("");

  const erpItems = erpModules.map((module) => `
      <div class="crm-favorite-row" data-favorite-item="${module.moduleKey}">
        ${workspaceNavItem({
          href: module.href,
          label: module.label,
          iconKey: module.iconKey,
          isActive: module.isActive,
          dataAttrs: `data-favorite-link="${module.moduleKey}"`
        })}
        <button
          class="crm-favorite-toggle ${favoriteSet.has(module.moduleKey) ? "active" : ""}"
          type="button"
          data-favorite-toggle
          data-module-key="${module.moduleKey}"
          aria-pressed="${favoriteSet.has(module.moduleKey) ? "true" : "false"}"
          title="${favoriteSet.has(module.moduleKey) ? "Elimină din favorite" : "Adaugă la favorite"}"
        >
          ${crmStarIcon()}
        </button>
      </div>
      ${module.subnavHtml || ""}
    `).join("");

  const leftSections = [
    crmItems ? `<div class="crm-nav-section">CRM</div>${workspaceNavGroup("CRM", "Lead-uri, relații comerciale și documente de vânzare.", "CRM", crmItems)}` : "",
    settingsItems ? `<div class="crm-nav-section">Setări</div>${workspaceNavGroup("Setări", "Utilizatori și configurări de companie.", "SET", settingsItems)}` : ""
  ].join("");

  const favoriteEmptyState = `<div class="crm-favorite-empty">Nu ai favorite salvate încă. Marchează modulele ERP pe care le folosești cel mai des.</div>`;
  const favoriteSection = erpItems
    ? `<div class="crm-nav-section">Favorite</div>${workspaceNavGroup("Favorite", "Scurtături ERP salvate de utilizatorul curent.", "PIN", favoriteLinksHtml || favoriteEmptyState, `data-favorites-menu`)}`
    : "";
  const erpSection = erpItems
    ? `<div class="crm-nav-section">ERP</div>${workspaceNavGroup("ERP", "Catalog, facturare, contabilitate, tipizate și echipă internă.", "ERP", erpItems)}`
    : "";
  const spvSection = canAccessSpv
    ? `<div class="crm-nav-section">SPV</div>${crmSpvSelect(activeKey)}`
    : "";

  return {
    hasLeftSidebar: Boolean(leftSections.trim()),
    hasRightSidebar: Boolean((favoriteSection + erpSection + spvSection).trim()),
    leftSidebarHtml: leftSections,
    rightSidebarHtml: `${favoriteSection}${erpSection}${spvSection}`,
    mobileNavHtml: `${leftSections}${favoriteSection}${erpSection}${spvSection}`,
    favoriteModules
  };
}

function classicMenuLink({ href, label, iconKey, isActive = false, extraClass = "", dataAttrs = "" }) {
  const classes = ["crm-classic-menu-link", isActive ? "active" : "", extraClass].filter(Boolean).join(" ");
  return `<a href="${href}" class="${classes}" title="${escapeHtml(label)}" ${dataAttrs}><span class="crm-nav-icon">${crmMenuIcon(iconKey)}</span><span>${escapeHtml(label)}</span></a>`;
}

function classicMenuSection(title, itemsHtml) {
  const html = String(itemsHtml || "").trim();
  if (!html) return "";
  return `
    <section class="crm-classic-menu-section">
      <div class="crm-classic-menu-section-title">${escapeHtml(title)}</div>
      <div class="crm-classic-menu-list">${html}</div>
    </section>
  `;
}

function classicMenuDropdown({ label, iconKey, isActive = false, itemsHtml = "", align = "left" }) {
  const html = String(itemsHtml || "").trim();
  if (!html) return "";
  const classes = ["crm-menu", isActive ? "active" : "", align === "right" ? "crm-menu-align-right" : ""].filter(Boolean).join(" ");
  return `
    <details class="${classes}" data-menu-details>
      <summary>
        <span class="crm-nav-icon">${crmMenuIcon(iconKey)}</span>
        <span>${escapeHtml(label)}</span>
        <svg class="crm-menu-caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="crm-classic-menu-dropdown">${html}</div>
    </details>
  `;
}

function classicFavoriteRow(module, favoriteSet) {
  return `
    <div class="crm-classic-favorite-row" data-favorite-item="${module.moduleKey}">
      ${classicMenuLink({
        href: module.href,
        label: module.label,
        iconKey: module.iconKey,
        isActive: module.isActive,
        dataAttrs: `data-favorite-link="${module.moduleKey}"`
      })}
      <button
        class="crm-favorite-toggle ${favoriteSet.has(module.moduleKey) ? "active" : ""}"
        type="button"
        data-favorite-toggle
        data-module-key="${module.moduleKey}"
        aria-pressed="${favoriteSet.has(module.moduleKey) ? "true" : "false"}"
        title="${favoriteSet.has(module.moduleKey) ? "Elimină din favorite" : "Adaugă la favorite"}"
      >
        ${crmStarIcon()}
      </button>
    </div>
  `;
}

function buildClassicNavigation(active, userModules = [], userEmail = "") {
  const activeKey = String(active || "");
  const isSuperAdmin = isSuperAdminUser(userEmail);
  const canAccessSpv = canAccessSpvSidebar(userEmail);
  const erpModules = getErpWorkspaceModules(activeKey, userModules);
  const erpModuleKeys = erpModules.map((module) => module.moduleKey);
  const favoriteModules = getUserFavoriteModules(userEmail, erpModuleKeys);
  const favoriteSet = new Set(favoriteModules);
  const favoriteMap = new Map(erpModules.map((module) => [module.moduleKey, module]));

  const crmCore = [
    hasModuleAccess(userModules, "dashboard") ? classicMenuLink({ href: "/dashboard", label: "Dashboard", iconKey: "dashboard", isActive: activeKey === "dashboard" }) : "",
    hasModuleAccess(userModules, "clients") ? classicMenuLink({ href: "/clients", label: "Clienți", iconKey: "clients", isActive: activeKey === "clients" }) : "",
    hasModuleAccess(userModules, "quotes") ? classicMenuLink({ href: "/quotes", label: "Oferte", iconKey: "quotes", isActive: activeKey === "quotes" }) : "",
    hasModuleAccess(userModules, "contracts") ? classicMenuLink({ href: "/contracte", label: "Contracte", iconKey: "contracts", isActive: activeKey === "contracts" }) : ""
  ].join("");

  const crmDocuments = [
    hasModuleAccess(userModules, "contracts") ? classicMenuLink({ href: "/contract-form", label: "Form contract", iconKey: "form", isActive: activeKey === "form" }) : ""
  ].join("");

  const crmMenu = classicMenuDropdown({
    label: "CRM",
    iconKey: "clients",
    isActive: ["dashboard", "clients", "quotes", "contracts", "form"].includes(activeKey),
    itemsHtml: [
      classicMenuSection("General", crmCore),
      classicMenuSection("Documente", crmDocuments)
    ].join("")
  });

  const erpOverview = erpModules.map((module) => classicFavoriteRow(module, favoriteSet)).join("");
  const inventoryMenu = hasModuleAccess(userModules, "inventory") ? [
    classicMenuLink({ href: "/inventory", label: "Dashboard inventar", iconKey: "inventory", isActive: ["inventory", "inventory-home"].includes(activeKey) }),
    classicMenuLink({ href: "/inventory/assets", label: "Active", iconKey: "inventory", isActive: activeKey === "inventory-assets" }),
    classicMenuLink({ href: "/inventory/projects", label: "Inventar pe proiect", iconKey: "inventory", isActive: activeKey === "inventory-projects" }),
    classicMenuLink({ href: "/inventory/reports", label: "Raport inventar", iconKey: "inventory", isActive: activeKey === "inventory-reports" }),
    classicMenuLink({ href: "/inventory/counts", label: "Numărare inventar", iconKey: "inventory", isActive: activeKey === "inventory-counts" })
  ].join("") : "";

  const accountingMenu = hasModuleAccess(userModules, "accounting") ? [
    classicMenuLink({ href: "/accounting", label: "Dashboard contabil", iconKey: "accounting", isActive: ["accounting", "accounting-home"].includes(activeKey) }),
    classicMenuLink({ href: "/accounting/declarations", label: "Declarații ANAF", iconKey: "accounting", isActive: activeKey === "accounting-declarations" }),
    classicMenuLink({ href: "/accounting/expenses", label: "Cheltuieli", iconKey: "accounting", isActive: activeKey === "accounting-expenses" }),
    classicMenuLink({ href: "/accounting/consumption", label: "Bonuri de consum", iconKey: "accounting", isActive: activeKey === "accounting-consumption" }),
    hasModuleAccess(userModules, "facturi") ? classicMenuLink({ href: "/accounting/receivables", label: "Facturi de urmărit", iconKey: "facturi", isActive: activeKey === "accounting-receivables" }) : "",
    classicMenuLink({ href: "/accounting#reconciliere", label: "Reconciliere plăți", iconKey: "accounting", isActive: activeKey === "accounting-reconciliation" })
  ].join("") : "";

  const tipizateMenu = hasModuleAccess(userModules, "tipizate") ? [
    classicMenuLink({ href: "/tipizate", label: "Documente", iconKey: "tipizate", isActive: activeKey === "tipizate" }),
    classicMenuLink({ href: "/tipizate/registru", label: "Registru evidență", iconKey: "tipizate", isActive: activeKey === "tipizate-registru" }),
    classicMenuLink({ href: "/tipizate/proces-verbal", label: "Proces verbal", iconKey: "tipizate" }),
    classicMenuLink({ href: "/tipizate/adeverinta", label: "Adeverință salariat", iconKey: "tipizate" }),
    classicMenuLink({ href: "/tipizate/decizie-interna", label: "Decizie internă", iconKey: "tipizate" }),
    classicMenuLink({ href: "/tipizate/notificare-client", label: "Notificare client", iconKey: "tipizate" }),
    classicMenuLink({ href: "/tipizate/cerere-concediu", label: "Cerere concediu", iconKey: "tipizate" }),
    classicMenuLink({ href: "/tipizate/ordin-deplasare", label: "Ordin de deplasare", iconKey: "tipizate" }),
    classicMenuLink({ href: "/tipizate/fisa-hr", label: "Fișă HR", iconKey: "tipizate" })
  ].join("") : "";

  const erpMenu = classicMenuDropdown({
    label: "ERP",
    iconKey: "produse",
    isActive: [
      "produse",
      "facturi",
      "inventory",
      "inventory-home",
      "inventory-assets",
      "inventory-projects",
      "inventory-reports",
      "inventory-counts",
      "accounting",
      "accounting-home",
      "accounting-expenses",
      "accounting-declarations",
      "accounting-consumption",
      "accounting-receivables",
      "accounting-reconciliation",
      "tipizate",
      "tipizate-registru",
      "employees"
    ].includes(activeKey),
    itemsHtml: [
      classicMenuSection("Module", erpOverview),
      classicMenuSection("Inventar", inventoryMenu),
      classicMenuSection("Contabilitate", accountingMenu),
      classicMenuSection("Tipizate", tipizateMenu)
    ].join("")
  });

  const spvMenu = classicMenuDropdown({
    label: "SPV / e-Factura",
    iconKey: "spv",
    isActive: ["accounting-spv", "accounting-spv-inbox", "accounting-spv-outbox"].includes(activeKey),
    itemsHtml: canAccessSpv ? classicMenuSection("ANAF", [
      classicMenuLink({ href: "/anaf/status", label: "Status conexiune", iconKey: "spv", isActive: activeKey === "accounting-spv" }),
      classicMenuLink({ href: "/anaf/inbox", label: "Inbox e-Factura", iconKey: "spv", isActive: activeKey === "accounting-spv-inbox" }),
      classicMenuLink({ href: "/anaf/outbox", label: "Outbox e-Factura", iconKey: "spv", isActive: activeKey === "accounting-spv-outbox" })
    ].join("")) : ""
  });

  const adminMenu = classicMenuDropdown({
    label: "Setări",
    iconKey: "setari",
    isActive: ["accounts", "setari", "superadmin", "superadmin-payments"].includes(activeKey),
    align: "right",
    itemsHtml: [
      classicMenuSection("Administrare", [
        hasModuleAccess(userModules, "accounts") ? classicMenuLink({ href: "/accounts", label: "Utilizatori", iconKey: "accounts", isActive: activeKey === "accounts" }) : "",
        hasModuleAccess(userModules, "setari") ? classicMenuLink({ href: "/nexora/settings", label: "Setări companie", iconKey: "setari", isActive: activeKey === "setari" }) : ""
      ].join("")),
      classicMenuSection("Super admin", [
        isSuperAdmin ? classicMenuLink({ href: "/nexora/super-admin/companies", label: "Companii", iconKey: "superadmin", isActive: activeKey === "superadmin" }) : "",
        isSuperAdmin ? classicMenuLink({ href: "/nexora/super-admin/payments", label: "Plăți", iconKey: "facturi", isActive: activeKey === "superadmin-payments" }) : ""
      ].join(""))
    ].join("")
  });

  const favoriteLinksHtml = favoriteModules
    .map((moduleKey) => favoriteMap.get(moduleKey))
    .filter(Boolean)
    .map((module) => classicMenuLink({
      href: module.href,
      label: module.label,
      iconKey: module.iconKey,
      isActive: module.isActive,
      dataAttrs: `data-favorite-link="${module.moduleKey}"`
    }))
    .join("");

  const favoritesMenu = erpModules.length ? classicMenuDropdown({
    label: "Favorite",
    iconKey: "dashboard",
    align: "right",
    itemsHtml: classicMenuSection("Scurtături", `<div data-favorites-menu>${favoriteLinksHtml || `<div class="crm-favorite-empty">Nu ai favorite salvate încă.</div>`}</div>`)
  }) : "";

  return {
    menuHtml: [crmMenu, erpMenu, spvMenu, favoritesMenu, adminMenu].join(""),
    favoriteModules
  };
}

function crmShellStart(active, title, subtitle="", userEmail="", userModules=[], companyStatus="", companyName=""){
  const isAccountingDashboardShell = String(active || "") === "accounting-home";
  const navigation = buildClassicNavigation(active, userModules, userEmail);
  const normalizedStatus = String(companyStatus || "").toLowerCase();
  const compactStatusLabel = normalizedStatus === "active"
    ? "Abonament activ"
    : normalizedStatus === "trial"
      ? "Cont în trial"
      : normalizedStatus === "past_due"
        ? "Plată restantă"
        : normalizedStatus
          ? normalizedStatus
          : "Fără status";
  const bannerConfig = normalizedStatus === "trial"
    ? {
        tone: "rgba(30,64,175,.18)",
        border: "rgba(96,165,250,.48)",
        title: "Cont în trial",
        message: `${companyName ? escapeHtml(companyName) : "Compania"} este în perioada de test. Verifică planul și activează abonamentul înainte de expirare.`
      }
    : normalizedStatus === "past_due"
      ? {
          tone: "rgba(146,64,14,.18)",
          border: "rgba(251,191,36,.48)",
          title: "Abonament restant",
          message: `${companyName ? escapeHtml(companyName) : "Compania"} are abonamentul în status past due. Verifică plata și evită suspendarea accesului.`
        }
      : normalizedStatus === "active"
        ? {
            tone: "rgba(22,101,52,.16)",
            border: "rgba(74,222,128,.42)",
            title: "Abonament activ",
            message: `${companyName ? escapeHtml(companyName) : "Compania"} are acces activ. Workspace-ul rulează normal și toate modulele aprobate sunt disponibile.`
          }
        : null;
  const statusBanner = bannerConfig && !isAccountingDashboardShell ? `
        <div style="margin:0 0 18px 0;padding:18px 20px;border-radius:20px;border:1px solid ${bannerConfig.border};background:${bannerConfig.tone};box-shadow:0 10px 30px rgba(15,23,42,.06)">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Subscription Status</div>
          <div style="font-size:20px;font-weight:800;margin-bottom:6px">${bannerConfig.title}</div>
          <div class="crm-muted" style="font-size:14px;line-height:1.6">${bannerConfig.message}</div>
        </div>
  ` : "";
  return `
  ${uiShellStyles()}
  <script>
    (function(){
      if(!document.querySelector('meta[name="viewport"]')){
        const meta = document.createElement("meta");
        meta.name = "viewport";
        meta.content = "width=device-width, initial-scale=1";
        document.head.appendChild(meta);
      }
    })();
  </script>
  <body class="crm-body" data-shell="${escapeHtml(String(active || ""))}" data-left-sidebar="hidden" data-right-sidebar="hidden" data-favorite-modules="${escapeHtml(JSON.stringify(navigation.favoriteModules))}">
    <div class="crm-layout">
      <main class="crm-main">
        <header class="crm-app-menubar">
          <a class="crm-menu-brand" href="/dashboard" aria-label="MiniCRM dashboard">
            <div class="crm-brand-badge">Q</div>
            <div class="crm-brand-copy">
              <div class="crm-brand-title">QR-LAB MiniCRM</div>
              <div class="crm-brand-sub">Workspace</div>
            </div>
          </a>
          <nav class="crm-menu-strip" aria-label="Meniu principal">
            ${navigation.menuHtml}
          </nav>
          <div class="crm-menu-tools">
            <div class="crm-menu-meta">
              ${companyName ? `<span class="crm-menu-chip">${escapeHtml(companyName)}</span>` : userEmail ? `<span class="crm-menu-chip">${escapeHtml(userEmail)}</span>` : ``}
            </div>
            ${crmThemeSelect()}
            <form method="post" action="/logout" style="margin:0">
              <button class="crm-btn crm-btn-secondary" type="submit">Logout</button>
            </form>
          </div>
        </header>

        ${isAccountingDashboardShell ? `` : `
        <div class="crm-topbar">
          <div>
            <div class="crm-page-kicker">MiniCRM</div>
            <h1 class="crm-page-title">${escapeHtml(title || "Dashboard")}</h1>
            <div class="crm-page-subtitle">${escapeHtml(subtitle || "")}</div>
            ${userEmail ? `<div class="crm-user">Logat: ${escapeHtml(userEmail)}</div>` : ``}
          </div>
        </div>
        `}

        <div class="crm-content">
          ${statusBanner}
  `;
}

function crmShellEnd(){
  return `
        </div>
      </main>
    </div>
    <script>
      (function(){
        const storageKey = "minicrm-theme";
        const defaultTheme = "executive-slate";
        const body = document.body;
        const buttons = Array.from(document.querySelectorAll("[data-crm-theme]"));
        const selects = Array.from(document.querySelectorAll("[data-crm-theme-select]"));
        const menuDetails = Array.from(document.querySelectorAll("[data-menu-details]"));
        const favoriteButtons = Array.from(document.querySelectorAll("[data-favorite-toggle]"));
        const favoriteMenus = Array.from(document.querySelectorAll("[data-favorites-menu]"));
        let favoriteState = [];

        try {
          const parsedFavorites = JSON.parse(body.getAttribute("data-favorite-modules") || "[]");
          favoriteState = Array.isArray(parsedFavorites) ? parsedFavorites.map(String) : [];
        } catch {
          favoriteState = [];
        }

        function applyTheme(theme){
          const nextTheme = theme || defaultTheme;
          body.dataset.theme = nextTheme;
          buttons.forEach((button) => {
            button.classList.toggle("active", button.getAttribute("data-crm-theme") === nextTheme);
          });
          selects.forEach((select) => {
            if(select.value !== nextTheme){
              select.value = nextTheme;
            }
          });
        }

        const savedTheme = localStorage.getItem(storageKey) || defaultTheme;
        applyTheme(savedTheme);

        buttons.forEach((button) => {
          button.addEventListener("click", () => {
            const theme = button.getAttribute("data-crm-theme") || defaultTheme;
            localStorage.setItem(storageKey, theme);
            applyTheme(theme);
          });
        });

        selects.forEach((select) => {
          select.addEventListener("change", () => {
            const theme = select.value || defaultTheme;
            localStorage.setItem(storageKey, theme);
            applyTheme(theme);
          });
        });

        menuDetails.forEach((details) => {
          details.addEventListener("toggle", () => {
            if(!details.open) return;
            menuDetails.forEach((entry) => {
              if(entry !== details) entry.open = false;
            });
          });
        });

        document.addEventListener("click", (event) => {
          if(event.target.closest(".crm-menu")) return;
          menuDetails.forEach((details) => { details.open = false; });
        });

        document.addEventListener("keydown", (event) => {
          if(event.key !== "Escape") return;
          menuDetails.forEach((details) => { details.open = false; });
        });

        function syncFavoriteButtons(){
          favoriteButtons.forEach((button) => {
            const moduleKey = button.getAttribute("data-module-key") || "";
            const isActive = favoriteState.includes(moduleKey);
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
            button.setAttribute("title", isActive ? "Elimină din favorite" : "Adaugă la favorite");
          });
        }

        function buildFavoritesMarkup(){
          if(!favoriteState.length){
            return '<div class="crm-favorite-empty">Nu ai favorite salvate încă. Marchează modulele ERP pe care le folosești cel mai des.</div>';
          }

          return favoriteState.map((moduleKey) => {
            const link = document.querySelector('[data-favorite-item="' + moduleKey + '"] [data-favorite-link]');
            return link ? link.outerHTML : "";
          }).filter(Boolean).join("");
        }

        function renderFavoriteMenus(){
          const html = buildFavoritesMarkup();
          favoriteMenus.forEach((menu) => {
            menu.innerHTML = html;
          });
        }

        async function saveFavorites(nextFavorites){
          const response = await fetch("/ui/favorites", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({ favorites: nextFavorites })
          });

          if(!response.ok){
            throw new Error("Nu am putut salva favoritele.");
          }

          const payload = await response.json();
          favoriteState = Array.isArray(payload?.favorites) ? payload.favorites.map(String) : nextFavorites;
          body.setAttribute("data-favorite-modules", JSON.stringify(favoriteState));
          syncFavoriteButtons();
          renderFavoriteMenus();
        }

        syncFavoriteButtons();
        renderFavoriteMenus();

        favoriteButtons.forEach((button) => {
          button.addEventListener("click", async () => {
            const moduleKey = String(button.getAttribute("data-module-key") || "").trim();
            if(!moduleKey) return;

            const nextFavorites = favoriteState.includes(moduleKey)
              ? favoriteState.filter((key) => key !== moduleKey)
              : [...favoriteState, moduleKey];

            favoriteButtons.forEach((entry) => { entry.disabled = true; });
            try {
              await saveFavorites(nextFavorites);
            } catch (error) {
              alert(error instanceof Error ? error.message : "Nu am putut salva favoritele.");
            } finally {
              favoriteButtons.forEach((entry) => { entry.disabled = false; });
            }
          });
        });
      })();
    </script>
  </body>`;
}

function topMenu(active){
  return `
  <div style="margin:0 0 18px 0;padding:16px 18px;border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(180deg,#0f172a 0%,#111827 100%);box-shadow:0 10px 30px rgba(15,23,42,.10)">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${[
        ["/dashboard","Dashboard","dashboard"],
        ["/clients","Clients","clients"],
        ["/quotes","Quotes","quotes"],
        ["/produse","Produse","produse"],
        ["/contracte","Contracte","contracts"],
        ["/facturi","Facturi","facturi"],
        ["/nexora/settings","Setări","setari"],
        ["/contract-form","Form contract","form"]
      ].map(([href,label,key])=>{
        const isActive = String(active||"") === String(key||"");
        const style = isActive
          ? "background:#2563eb;color:#fff;border:1px solid #3b82f6;box-shadow:0 8px 18px rgba(37,99,235,.35)"
          : "background:rgba(255,255,255,.04);color:#cbd5e1;border:1px solid rgba(255,255,255,.08)";
        return `<a href="${href}" style="text-decoration:none;padding:10px 14px;border-radius:12px;display:inline-flex;align-items:center;gap:6px;transition:all .15s ease;font-weight:700;${style}">${label}</a>`;
      }).join("")}
    </div>
  </div>`;
}


app.get("/produse", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const rows = db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, kind, active, created_at
    FROM products
    WHERE company_id=?
    ORDER BY active DESC, name COLLATE NOCASE ASC, id DESC
    LIMIT 500
  `).all(companyId);

  const htmlRows = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.code || "") || `<span class="crm-muted">—</span>`}</td>
      <td>
        <div style="font-weight:800">${escapeHtml(r.name || "")}</div>
      </td>
      <td>${escapeHtml(r.kind || "")}</td>
      <td>${escapeHtml(r.unit || "") || `<span class="crm-muted">—</span>`}</td>
      <td class="crm-right">${escapeHtml(String(Number(r.price || 0).toFixed(2)))}</td>
      <td class="crm-right">${escapeHtml(String(r.tva_percent ?? 0))}%</td>
      <td>${Number(r.active) ? `<span class="crm-badge crm-badge-green">activ</span>` : `<span class="crm-badge crm-badge-neutral">inactiv</span>`}</td>
      <td>${escapeHtml(r.created_at || "") || `<span class="crm-muted">—</span>`}</td>
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/produse/${r.id}/edit" style="text-decoration:none">
            <button class="crm-btn crm-btn-secondary" type="button">Editează</button>
          </a>
          <form method="post" action="/produse/${r.id}/toggle" style="margin:0">
            <button class="crm-btn ${Number(r.active) ? "crm-btn-danger" : ""}" type="submit">${Number(r.active) ? "Dezactivează" : "Activează"}</button>
          </form>
        </div>
      </td>
    </tr>
  `).join("");

  res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Produse</title>
</head>
${crmShellStart("produse", "Produse / Servicii", "Catalog intern pentru linii de quote și factură.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Adaugă produs / serviciu</h3>
        <div class="crm-muted" style="margin-top:6px">Definește produse și servicii reutilizabile în documente.</div>
      </div>

      <form method="post" action="/produse/create" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Cod</label>
            <input class="crm-input" name="code" placeholder="ex: SVC-001">
          </div>
          <div>
            <label class="crm-label">Denumire</label>
            <input class="crm-input" name="name" required placeholder="ex: Mentenanță lunară">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Tip</label>
            <select class="crm-select" name="kind">
              <option value="SERVICIU">SERVICIU</option>
              <option value="PRODUS">PRODUS</option>
            </select>
          </div>
          <div>
            <label class="crm-label">UM</label>
            <input class="crm-input" name="unit" value="buc" placeholder="buc / ora / abon">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Preț</label>
            <input class="crm-input" name="price" value="0" placeholder="0.00">
          </div>
          <div>
            <label class="crm-label">TVA %</label>
            <input class="crm-input" name="tva_percent" value="19" placeholder="19">
          </div>
        </div>

        <div>
          <label class="crm-label">Activ</label>
          <select class="crm-select" name="active">
            <option value="1">DA</option>
            <option value="0">NU</option>
          </select>
        </div>

        <div>
          <button class="crm-btn" type="submit">Salvează produsul</button>
        </div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Sumar</h3>
        <div class="crm-muted" style="margin-top:6px">Vedere rapidă a catalogului de produse.</div>
      </div>

      <div class="crm-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">
        <div class="crm-kpi">
          <div class="crm-kpi-label">Total produse</div>
          <div class="crm-kpi-value">${escapeHtml(String(rows.length))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Active</div>
          <div class="crm-kpi-value">${escapeHtml(String(rows.filter(x => Number(x.active)).length))}</div>
        </div>
      </div>
    </section>
  </div>

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="margin-bottom:14px">
      <h3 style="margin:0;font-size:20px">Listă produse</h3>
      <div class="crm-muted" style="margin-top:6px">Ultimele 500 produse / servicii.</div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Cod</th>
            <th>Denumire</th>
            <th>Tip</th>
            <th>UM</th>
            <th class="crm-right">Preț</th>
            <th class="crm-right">TVA</th>
            <th>Activ</th>
            <th>Creat la</th>
            <th>Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          ${htmlRows || '<tr><td colspan="9"><em>Nu există produse.</em></td></tr>'}
        </tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
});

app.get("/nexora/products", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const q = String(req.query?.q || "").trim();
  const ok = String(req.query?.ok || "").trim();
  const search = q ? `%${q}%` : null;

  const rows = q
    ? db.prepare(`
        SELECT id, code, name, unit, price, tva_percent, kind, active, created_at
        FROM products
        WHERE company_id=?
          AND (code LIKE ? OR name LIKE ? OR kind LIKE ?)
        ORDER BY active DESC, name COLLATE NOCASE ASC, id DESC
        LIMIT 500
      `).all(companyId, search, search, search)
    : db.prepare(`
        SELECT id, code, name, unit, price, tva_percent, kind, active, created_at
        FROM products
        WHERE company_id=?
        ORDER BY active DESC, name COLLATE NOCASE ASC, id DESC
        LIMIT 500
      `).all(companyId);

  return res.type("html").send(renderNexoraProductsPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    rows,
    q,
    ok
  }));
});

app.get("/nexora/products/:id/edit", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("Bad id");

  const row = db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, kind, active, created_at
    FROM products
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!row) return res.status(404).send("Produs inexistent");

  return res.type("html").send(renderNexoraProductEditPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    product: row,
    ok: String(req.query?.ok || "")
  }));
});

app.post("/produse/:id/toggle", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("Bad id");

  const row = db.prepare("SELECT id, active FROM products WHERE id=? AND company_id=?").get(id, companyId);
  if (!row) return res.status(404).send("Produs inexistent");

  const nextActive = Number(row.active) ? 0 : 1;
  db.prepare("UPDATE products SET active=? WHERE id=? AND company_id=?").run(nextActive, id, companyId);

  return res.redirect(req.body?.return_to === "nexora" ? "/nexora/products?ok=toggled" : "/produse");
});


app.get("/produse/:id/edit", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("Bad id");

  const row = db.prepare(`
    SELECT id, code, name, unit, price, tva_percent, kind, active, created_at
    FROM products
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!row) return res.status(404).send("Produs inexistent");

  res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Edit produs</title>
<style>
body{font-family:system-ui,Arial;margin:30px}
.card{border:1px solid #ddd;border-radius:10px;padding:14px;margin-bottom:16px;max-width:900px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px}
label{font-weight:600}
input,select{width:100%;padding:8px;box-sizing:border-box}
button{padding:8px 12px}
a{color:#0b57d0;text-decoration:none}
a:hover{text-decoration:underline}
@media (max-width: 640px){ .grid{grid-template-columns:1fr} }
</style>
</head>
<body>
  <h2 style="margin-top:0">Edit produs / serviciu</h2>
  ${topMenu("produse")}

  <div class="card">
    <form method="post" action="/produse/${row.id}/edit">
      <div class="grid">
        <div>
          <label>Cod</label>
          <input name="code" value="${escapeHtml(row.code || "")}">
        </div>
        <div>
          <label>Denumire</label>
          <input name="name" required value="${escapeHtml(row.name || "")}">
        </div>
        <div>
          <label>Tip</label>
          <select name="kind">
            <option value="SERVICIU" ${String(row.kind||"").toUpperCase()==="SERVICIU" ? "selected" : ""}>SERVICIU</option>
            <option value="PRODUS" ${String(row.kind||"").toUpperCase()==="PRODUS" ? "selected" : ""}>PRODUS</option>
          </select>
        </div>
        <div>
          <label>UM</label>
          <input name="unit" value="${escapeHtml(row.unit || "buc")}">
        </div>
        <div>
          <label>Preț</label>
          <input name="price" value="${escapeHtml(String(row.price ?? 0))}">
        </div>
        <div>
          <label>TVA %</label>
          <input name="tva_percent" value="${escapeHtml(String(row.tva_percent ?? 19))}">
        </div>
        <div>
          <label>Activ</label>
          <select name="active">
            <option value="1" ${Number(row.active) ? "selected" : ""}>DA</option>
            <option value="0" ${Number(row.active) ? "" : "selected"}>NU</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button type="submit">Salvează modificările</button>
        <a href="/produse">Înapoi la produse</a>
      </div>
    </form>
  </div>
</body>
</html>`);
});

app.post("/produse/:id/edit", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("Bad id");

  const row = db.prepare("SELECT id FROM products WHERE id=? AND company_id=?").get(id, companyId);
  if (!row) return res.status(404).send("Produs inexistent");

  const code = String(req.body?.code || "").trim();
  const name = String(req.body?.name || "").trim();
  const unit = String(req.body?.unit || "buc").trim() || "buc";
  const price = Number(String(req.body?.price || "0").replace(",", "."));
  const tva_percent = Number(String(req.body?.tva_percent || "19").replace(",", "."));
  const kindRaw = String(req.body?.kind || "SERVICIU").trim().toUpperCase();
  const active = String(req.body?.active || "1") === "1" ? 1 : 0;

  const allowedKinds = new Set(["SERVICIU","PRODUS"]);
  const kind = allowedKinds.has(kindRaw) ? kindRaw : "SERVICIU";

  if (!name) return res.status(400).send("Denumire required");
  if (!Number.isFinite(price) || price < 0) return res.status(400).send("Preț invalid");
  if (!Number.isFinite(tva_percent) || tva_percent < 0 || tva_percent > 100) return res.status(400).send("TVA invalid");

  db.prepare(`
    UPDATE products
    SET code=?, name=?, unit=?, price=?, tva_percent=?, kind=?, active=?
    WHERE id=? AND company_id=?
  `).run(code || null, name, unit, price, tva_percent, kind, active, id, companyId);

  return res.redirect(req.body?.return_to === "nexora" ? `/nexora/products/${id}/edit?ok=saved` : "/produse");
});


app.post("/produse/create", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const code = String(req.body?.code || "").trim();
  const name = String(req.body?.name || "").trim();
  const unit = String(req.body?.unit || "buc").trim() || "buc";
  const price = Number(String(req.body?.price || "0").replace(",", "."));
  const tva_percent = Number(String(req.body?.tva_percent || "19").replace(",", "."));
  const kindRaw = String(req.body?.kind || "SERVICIU").trim().toUpperCase();
  const active = String(req.body?.active || "1") === "1" ? 1 : 0;

  const allowedKinds = new Set(["SERVICIU","PRODUS"]);
  const kind = allowedKinds.has(kindRaw) ? kindRaw : "SERVICIU";

  if (!name) return res.status(400).send("Denumire required");
  if (!Number.isFinite(price) || price < 0) return res.status(400).send("Preț invalid");
  if (!Number.isFinite(tva_percent) || tva_percent < 0 || tva_percent > 100) return res.status(400).send("TVA invalid");

  db.prepare(`
    INSERT INTO products (code, name, unit, price, tva_percent, kind, active, company_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(code || null, name, unit, price, tva_percent, kind, active, companyId);

  return res.redirect(req.body?.return_to === "nexora" ? "/nexora/products?ok=created" : "/produse");
});


function recalcFacturaTotals(factura_id, companyId = null){
  const hasTenantScope = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
  // subtotal = SUM(total_linie)
  const row = hasTenantScope
    ? db.prepare("SELECT COALESCE(SUM(total_linie),0) AS subtotal FROM facturi_linii WHERE factura_id=? AND company_id=?").get(factura_id, Number(companyId))
    : db.prepare("SELECT COALESCE(SUM(total_linie),0) AS subtotal FROM facturi_linii WHERE factura_id=?").get(factura_id);
  const f = hasTenantScope
    ? db.prepare("SELECT tva_procent FROM facturi WHERE id=? AND company_id=?").get(factura_id, Number(companyId))
    : db.prepare("SELECT tva_procent FROM facturi WHERE id=?").get(factura_id);

  const subtotal = Number(row?.subtotal ?? 0) || 0;
  const tva_procent = Number(f?.tva_procent ?? 0) || 0;
  const tva_valoare = Math.round(subtotal * tva_procent * 100) / 100;
  const total = Math.round((subtotal + tva_valoare) * 100) / 100;

  if (hasTenantScope) {
    db.prepare("UPDATE facturi SET subtotal=?, tva_valoare=?, total=? WHERE id=? AND company_id=?")
      .run(subtotal, tva_valoare, total, factura_id, Number(companyId));
  } else {
    db.prepare("UPDATE facturi SET subtotal=?, tva_valoare=?, total=? WHERE id=?")
      .run(subtotal, tva_valoare, total, factura_id);
  }

  return { subtotal, tva_procent, tva_valoare, total };
}



function getInvoiceTheme(){
  const theme = String(getSetting("invoice_color", "#39a935") || "#39a935").trim();

  function hexToLight(hex){
    const m = String(hex || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
    if(!m) return "#d9f0d5";
    const raw = m[1];
    const r = parseInt(raw.slice(0,2), 16);
    const g = parseInt(raw.slice(2,4), 16);
    const b = parseInt(raw.slice(4,6), 16);

    const mix = (v) => Math.round(v + (255 - v) * 0.82);
    const rr = mix(r).toString(16).padStart(2,"0");
    const gg = mix(g).toString(16).padStart(2,"0");
    const bb = mix(b).toString(16).padStart(2,"0");
    return "#" + rr + gg + bb;
  }

  const light = hexToLight(theme);
  return { theme, light };
}

function getInvoiceLogoDataUri(){
  const companyId = currentRequestCompanyId();
  const scopedCandidates = companyId > 0
    ? ["png", "jpg", "jpeg", "webp"].map((ext) => path.join(__dirname, "public", "uploads", "company-logos", `company-${companyId}.${ext}`))
    : [];
  const p = scopedCandidates.find((candidate) => fs.existsSync(candidate))
    || path.join(__dirname, "public", "invoice-logo.png");
  try{
    if(!fs.existsSync(p)) return "";
    const buf = fs.readFileSync(p);
    const ext = (p.split(".").pop() || "").toLowerCase();
    const mime = ext==="jpg"||ext==="jpeg" ? "image/jpeg" : (ext==="webp" ? "image/webp" : "image/png");
    return "data:" + mime + ";base64," + buf.toString("base64");
  }catch(e){
    console.warn("Logo read failed:", String(e?.message ?? e));
    return "";
  }
}

function resolveWorkspaceHome(user = {}) {
  if (Number(user?.is_super_admin || 0) === 1) {
    return "/nexora/super-admin";
  }

  const modules = Array.isArray(user?.effective_module_permissions)
    ? user.effective_module_permissions
    : Array.isArray(user?.module_permissions)
      ? user.module_permissions
      : [];
  const role = String(user?.role || "").trim().toLowerCase();

  if (role === "accounting" && hasModuleKeyAccess(modules, "finance")) {
    return "/nexora/accounting";
  }

  return [
    ["dashboard", "/nexora-dashboard"],
    ["finance", "/nexora/accounting"],
    ["sales", "/nexora/quotes"],
    ["crm", "/nexora/clients"],
    ["inventory", "/nexora/inventory"],
    ["projects", "/nexora/projects"],
    ["documents", "/nexora/documents"],
    ["hr", "/nexora/employees"],
    ["reports", "/nexora/reports"],
    ["settings", "/nexora/settings"]
  ].find(([moduleKey]) => hasModuleKeyAccess(modules, moduleKey))?.[1] || "/nexora-dashboard";
}

function renderPublicLandingPage(req, res) {
  const plans = db.prepare(`
    SELECT
      id, code, name, pricing_model, price_monthly, max_users, max_modules_per_user,
      max_active_modules, features_json, tagline, description, support_copy, extra_dev_copy, image_path
    FROM plans
    WHERE status='active'
      AND COALESCE(is_public, 1)=1
    ORDER BY COALESCE(sort_order, 100) ASC, price_monthly ASC, id ASC
  `).all();

  const moduleCopy = {
    dashboard: "Tablou de bord pentru prioritati, activitate si pulsul operational.",
    clients: "Baza de clienti cu istoric clar, cautare rapida si fise complete.",
    quotes: "Oferte comerciale construite rapid si usor de urmarit.",
    contracts: "Contracte generate si administrate direct din acelasi workspace.",
    produse: "Catalog de produse si servicii gata pentru quote si factura.",
    facturi: "Facturare operationala, PDF si flux e-Factura cu traseu complet.",
    inventory: "Inventar, alocari si urmarire pentru active si proiecte.",
    accounting: "Zona contabila pentru declaratii, cheltuieli si reconciliere.",
    tipizate: "Tipizate si documente interne generate direct din platforma.",
    employees: "Administrare angajati si documente recurente de HR."
  };

  const moduleCards = MODULE_DEFINITIONS
    .filter((item) => !["dashboard", "settings"].includes(item.key))
    .map((item) => `
      <article class="landing-module-card">
        <div class="landing-module-chip">${escapeHtml(item.group.toUpperCase())}</div>
        <h3>${escapeHtml(item.label)}</h3>
        <p>${escapeHtml(moduleCopy[item.key] || "Modul customizabil in functie de nevoia business-ului.")}</p>
      </article>
    `).join("");

  const planCards = renderPlanCards(plans, { allowSelection: false });

  const primaryCtaHref = req.session?.user ? resolveWorkspaceHome(req.session.user) : "/signup/company";
  const primaryCtaLabel = req.session?.user ? "Intră în aplicație" : "Alege pachetul potrivit";

  res.type("html").send(`<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="MiniCRM este un CRM + ERP modular, cu pachete Start, Business si Enterprise, demo separat si module customizabile pentru fiecare business.">
  <title>MiniCRM | CRM + ERP modular pentru companii care vor control si claritate</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;500;600;700;800&display=swap');
    :root{
      --bg:#f7f0e6;
      --bg-2:#fffaf4;
      --surface:#fffdf9;
      --surface-2:#fff;
      --ink:#142334;
      --muted:#5e6b78;
      --line:rgba(20,35,52,.12);
      --brand:#0f766e;
      --brand-2:#0f4fa8;
      --accent:#e58a2b;
      --shadow:0 28px 80px rgba(20,35,52,.10);
      --radius-xl:34px;
      --radius-lg:24px;
      --radius-md:18px;
    }
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{
      margin:0;
      color:var(--ink);
      font-family:"Manrope", system-ui, sans-serif;
      background:
        radial-gradient(circle at top right, rgba(15,118,110,.14), transparent 28%),
        radial-gradient(circle at left 18%, rgba(229,138,43,.12), transparent 24%),
        linear-gradient(180deg, var(--bg-2) 0%, var(--bg) 100%);
    }
    a{color:inherit}
    img{max-width:100%;display:block}
    .landing-shell{
      width:min(1220px, calc(100% - 32px));
      margin:0 auto;
    }
    .landing-header{
      position:sticky;
      top:0;
      z-index:20;
      backdrop-filter:blur(18px);
      background:rgba(255,250,244,.76);
      border-bottom:1px solid rgba(20,35,52,.08);
    }
    .landing-header-inner{
      width:min(1220px, calc(100% - 32px));
      margin:0 auto;
      min-height:78px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
    }
    .landing-brand{
      display:flex;
      align-items:center;
      gap:12px;
      text-decoration:none;
      font-family:"Space Grotesk", sans-serif;
      font-weight:700;
      letter-spacing:.02em;
    }
    .landing-brand-mark{
      width:42px;
      height:42px;
      border-radius:14px;
      display:grid;
      place-items:center;
      color:#fff;
      background:linear-gradient(135deg,var(--brand-2),var(--brand));
      box-shadow:0 12px 24px rgba(15,79,168,.24);
    }
    .landing-brand-mark::before{
      content:"M";
      font-size:18px;
      font-weight:700;
    }
    .landing-nav{
      display:flex;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
    }
    .landing-nav a{
      text-decoration:none;
      color:var(--muted);
      font-size:14px;
      font-weight:700;
    }
    .landing-cta-row{
      display:flex;
      gap:12px;
      flex-wrap:wrap;
      align-items:center;
    }
    .landing-btn,
    .landing-btn-secondary,
    .landing-btn-ghost{
      appearance:none;
      border:none;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:10px;
      padding:14px 20px;
      border-radius:999px;
      font-family:"Space Grotesk", sans-serif;
      font-weight:700;
      text-decoration:none;
      cursor:pointer;
      transition:transform .18s ease, box-shadow .18s ease, background .18s ease;
    }
    .landing-btn{
      color:#fff;
      background:linear-gradient(135deg,var(--brand-2),var(--brand));
      box-shadow:0 18px 34px rgba(15,79,168,.22);
    }
    .landing-btn-secondary{
      color:#fff;
      background:linear-gradient(135deg,#18283d,#314561);
      box-shadow:0 18px 34px rgba(20,35,52,.16);
    }
    .landing-btn-ghost{
      color:var(--ink);
      background:rgba(255,255,255,.75);
      border:1px solid var(--line);
    }
    .landing-btn:hover,
    .landing-btn-secondary:hover,
    .landing-btn-ghost:hover{
      transform:translateY(-1px);
    }
    .landing-hero{
      padding:56px 0 34px;
    }
    .landing-hero-grid{
      display:grid;
      grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);
      gap:28px;
      align-items:stretch;
    }
    .landing-hero-copy,
    .landing-hero-visual{
      border-radius:var(--radius-xl);
      overflow:hidden;
      box-shadow:var(--shadow);
      border:1px solid rgba(20,35,52,.10);
    }
    .landing-hero-copy{
      padding:42px;
      background:
        linear-gradient(145deg, rgba(255,255,255,.94) 0%, rgba(255,248,241,.94) 100%);
      position:relative;
    }
    .landing-hero-copy::after{
      content:"";
      position:absolute;
      inset:auto -80px -90px auto;
      width:240px;
      height:240px;
      border-radius:50%;
      background:radial-gradient(circle, rgba(15,118,110,.16), rgba(15,118,110,0));
      pointer-events:none;
    }
    .landing-kicker{
      display:inline-flex;
      align-items:center;
      gap:10px;
      padding:9px 14px;
      border-radius:999px;
      color:var(--brand-2);
      background:rgba(15,79,168,.08);
      font-size:12px;
      letter-spacing:.08em;
      text-transform:uppercase;
      font-weight:800;
    }
    .landing-hero h1{
      margin:18px 0 14px;
      font-family:"Space Grotesk", sans-serif;
      font-size:clamp(38px, 5vw, 66px);
      line-height:1;
      letter-spacing:-.03em;
      max-width:12ch;
    }
    .landing-hero p{
      margin:0;
      font-size:17px;
      line-height:1.7;
      color:var(--muted);
      max-width:62ch;
    }
    .landing-hero-actions{
      margin-top:28px;
      display:flex;
      gap:12px;
      flex-wrap:wrap;
    }
    .landing-hero-note{
      margin-top:18px;
      color:var(--muted);
      font-size:14px;
      line-height:1.6;
    }
    .landing-metrics{
      margin-top:28px;
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:12px;
    }
    .landing-metric{
      padding:18px;
      border-radius:20px;
      background:#fff;
      border:1px solid var(--line);
    }
    .landing-metric strong{
      display:block;
      font-family:"Space Grotesk", sans-serif;
      font-size:28px;
      margin-bottom:6px;
    }
    .landing-metric span{
      color:var(--muted);
      font-size:13px;
      line-height:1.5;
    }
    .landing-hero-visual{
      padding:28px;
      background:
        linear-gradient(160deg,#0f172a 0%, #0f4fa8 52%, #67e8f9 100%);
      color:#fff;
      position:relative;
    }
    .landing-hero-visual::before{
      content:"";
      position:absolute;
      inset:22px;
      border-radius:28px;
      border:1px solid rgba(255,255,255,.14);
      pointer-events:none;
    }
    .landing-hero-panel{
      position:relative;
      z-index:1;
      display:grid;
      gap:18px;
    }
    .landing-visual-card{
      border-radius:26px;
      padding:22px;
      background:rgba(255,255,255,.14);
      border:1px solid rgba(255,255,255,.18);
      backdrop-filter:blur(14px);
    }
    .landing-visual-card h3{
      margin:0 0 10px;
      font-family:"Space Grotesk", sans-serif;
      font-size:22px;
    }
    .landing-visual-card p{
      margin:0;
      color:rgba(255,255,255,.82);
      line-height:1.65;
    }
    .landing-visual-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:12px;
    }
    .landing-visual-tile{
      min-height:132px;
      border-radius:22px;
      padding:18px;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      background:rgba(255,255,255,.12);
      border:1px solid rgba(255,255,255,.16);
    }
    .landing-visual-tile strong{
      font-family:"Space Grotesk", sans-serif;
      font-size:22px;
    }
    .landing-visual-tile span{
      color:rgba(255,255,255,.78);
      font-size:13px;
      line-height:1.5;
    }
    .landing-section{
      padding:34px 0;
    }
    .landing-section-head{
      display:flex;
      justify-content:space-between;
      gap:18px;
      align-items:flex-end;
      flex-wrap:wrap;
      margin-bottom:20px;
    }
    .landing-section-head h2{
      margin:0;
      font-family:"Space Grotesk", sans-serif;
      font-size:clamp(30px, 4vw, 44px);
      line-height:1.02;
      letter-spacing:-.03em;
      max-width:14ch;
    }
    .landing-section-head p{
      margin:0;
      max-width:60ch;
      color:var(--muted);
      line-height:1.7;
      font-size:15px;
    }
    .landing-proof-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:16px;
    }
    .landing-proof-card,
    .landing-module-card,
    .landing-process-card,
    .landing-support-card{
      border-radius:28px;
      padding:24px;
      background:rgba(255,255,255,.86);
      border:1px solid var(--line);
      box-shadow:0 16px 40px rgba(20,35,52,.06);
    }
    .landing-proof-card h3,
    .landing-process-card h3,
    .landing-support-card h3,
    .landing-module-card h3{
      margin:0 0 10px;
      font-family:"Space Grotesk", sans-serif;
      font-size:24px;
    }
    .landing-proof-card p,
    .landing-process-card p,
    .landing-support-card p,
    .landing-module-card p{
      margin:0;
      color:var(--muted);
      line-height:1.65;
    }
    .landing-module-chip{
      display:inline-flex;
      align-items:center;
      padding:7px 10px;
      border-radius:999px;
      background:rgba(15,118,110,.10);
      color:var(--brand);
      font-size:11px;
      letter-spacing:.08em;
      text-transform:uppercase;
      font-weight:800;
      margin-bottom:14px;
    }
    .landing-module-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:16px;
    }
    .landing-plan-grid{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(340px,1fr));
      gap:18px;
    }
    .pricing-card{
      position:relative;
      display:grid;
      grid-template-columns:minmax(0,220px) minmax(0,1fr);
      gap:0;
      min-height:100%;
      border-radius:28px;
      overflow:hidden;
      border:1px solid rgba(15,23,42,.10);
      background:linear-gradient(180deg,rgba(20,83,45,.92) 0%, rgba(21,128,61,.88) 100%);
      box-shadow:0 20px 48px rgba(20,35,52,.12);
    }
    .pricing-media-wrap{
      position:relative;
      min-height:220px;
      background:var(--plan-accent);
    }
    .pricing-media{
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    }
    .pricing-media-placeholder{
      min-height:220px;
    }
    .pricing-chip{
      position:absolute;
      top:16px;
      left:16px;
      display:inline-flex;
      align-items:center;
      padding:8px 12px;
      border-radius:999px;
      background:rgba(255,255,255,.16);
      border:1px solid rgba(255,255,255,.18);
      color:#fff;
      font-size:11px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .pricing-body{
      padding:22px 22px 20px;
    }
    .pricing-heading{
      display:flex;
      justify-content:space-between;
      gap:16px;
      align-items:flex-start;
      flex-wrap:wrap;
    }
    .pricing-title{
      font-family:"Space Grotesk", sans-serif;
      font-size:24px;
      font-weight:700;
      color:#fff;
    }
    .pricing-tagline{
      margin:8px 0 0;
      color:rgba(255,255,255,.8);
      line-height:1.55;
      font-size:13px;
    }
    .pricing-price{
      font-family:"Space Grotesk", sans-serif;
      font-size:17px;
      font-weight:700;
      color:#fff;
      white-space:nowrap;
    }
    .pricing-meta,
    .pricing-feature-list{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin-top:16px;
    }
    .pricing-meta span{
      display:inline-flex;
      align-items:center;
      padding:8px 12px;
      border-radius:999px;
      font-size:12px;
      background:rgba(255,255,255,.12);
      border:1px solid rgba(255,255,255,.14);
      color:#e2e8f0;
    }
    .pricing-description{
      margin-top:14px;
      color:#f0fdf4;
      line-height:1.6;
      font-size:14px;
    }
    .pricing-feature{
      display:inline-flex;
      align-items:center;
      padding:9px 12px;
      border-radius:14px;
      background:rgba(15,23,42,.22);
      border:1px solid rgba(255,255,255,.12);
      color:#f8fafc;
      font-size:12px;
      line-height:1.4;
    }
    .pricing-footnotes{
      display:grid;
      gap:8px;
      margin-top:16px;
      color:rgba(219,234,254,.92);
      font-size:12px;
      line-height:1.5;
    }
    .pricing-footnotes strong{color:#fff}
    .landing-process-grid,
    .landing-support-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:16px;
    }
    .landing-process-number{
      display:inline-grid;
      place-items:center;
      width:42px;
      height:42px;
      border-radius:14px;
      margin-bottom:14px;
      color:#fff;
      font-family:"Space Grotesk", sans-serif;
      font-size:18px;
      font-weight:700;
      background:linear-gradient(135deg,var(--brand-2),var(--brand));
      box-shadow:0 12px 24px rgba(15,79,168,.22);
    }
    .landing-support-card strong{
      display:block;
      margin-top:14px;
      font-size:13px;
      color:var(--brand-2);
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .landing-final{
      padding:36px;
      border-radius:36px;
      background:linear-gradient(145deg,#122236 0%, #0f766e 100%);
      color:#fff;
      box-shadow:0 26px 64px rgba(20,35,52,.18);
    }
    .landing-final h2{
      margin:0 0 14px;
      font-family:"Space Grotesk", sans-serif;
      font-size:clamp(30px, 4vw, 48px);
      line-height:1.02;
      max-width:12ch;
    }
    .landing-final p{
      margin:0;
      max-width:58ch;
      color:rgba(255,255,255,.82);
      font-size:16px;
      line-height:1.7;
    }
    .landing-final-actions{
      margin-top:24px;
      display:flex;
      gap:12px;
      flex-wrap:wrap;
    }
    .landing-footer{
      padding:24px 0 48px;
      color:var(--muted);
      font-size:14px;
    }
    @media (max-width: 1080px){
      .landing-hero-grid,
      .pricing-card{grid-template-columns:1fr}
      .landing-proof-grid,
      .landing-module-grid,
      .landing-process-grid,
      .landing-support-grid{grid-template-columns:1fr 1fr}
      .pricing-media-wrap{min-height:220px}
    }
    @media (max-width: 760px){
      .landing-header-inner{padding:12px 0}
      .landing-nav{display:none}
      .landing-hero{padding-top:28px}
      .landing-hero-copy,
      .landing-hero-visual,
      .landing-final{padding:24px}
      .landing-metrics,
      .landing-proof-grid,
      .landing-module-grid,
      .landing-process-grid,
      .landing-support-grid,
      .landing-visual-grid{grid-template-columns:1fr}
      .landing-plan-grid{grid-template-columns:1fr}
      .pricing-body{padding:22px}
    }
  </style>
</head>
<body>
  <header class="landing-header">
    <div class="landing-header-inner">
      <a class="landing-brand" href="/">
        <span class="landing-brand-mark"></span>
        <span>MiniCRM</span>
      </a>
      <nav class="landing-nav">
        <a href="#module">Module</a>
        <a href="#pachete">Pachete</a>
        <a href="#suport">Suport</a>
      </nav>
      <div class="landing-cta-row">
        <a class="landing-btn-ghost" href="/login">Login</a>
        <a class="landing-btn" href="${primaryCtaHref}">${primaryCtaLabel}</a>
      </div>
    </div>
  </header>

  <main class="landing-shell">
    <section class="landing-hero">
      <div class="landing-hero-grid">
        <div class="landing-hero-copy">
          <div class="landing-kicker">CRM + ERP modular pentru companii care vor claritate</div>
          <h1>Un workspace profesionist, construit pe bune pentru felul în care lucrează firma ta.</h1>
          <p>MiniCRM îți aduce într-un singur loc relația cu clienții, contractele, facturarea, contabilitatea operațională, inventarul, documentele interne și administrarea echipei. Fiecare companie primește date separate, module configurabile și un traseu clar de creștere de la demo la pachet complet.</p>
          <div class="landing-hero-actions">
            <a class="landing-btn" href="/signup/company">Vezi pachetele</a>
            <a class="landing-btn-secondary" href="/login">Intră în platformă</a>
            <form method="post" action="/signup/demo" style="margin:0">
              <button class="landing-btn-ghost" type="submit">Creează cont demo</button>
            </form>
          </div>
          <div class="landing-hero-note">Demo-ul este separat de datele live, rulează 7 zile și îți arată aproape tot ce poate face aplicația. Modulul de setări nu este expus în demo, iar e-Factura rămâne simulată, fără trimitere reală în SPV.</div>
          <div class="landing-metrics">
            <div class="landing-metric">
              <strong>10+</strong>
              <span>module operaționale pe care le poți combina în funcție de business</span>
            </div>
            <div class="landing-metric">
              <strong>3</strong>
              <span>pachete comerciale clare, de la start simplu la full access enterprise</span>
            </div>
            <div class="landing-metric">
              <strong>100%</strong>
              <span>tenant separat pentru fiecare companie, cu control pe roluri și module</span>
            </div>
          </div>
        </div>

        <aside class="landing-hero-visual">
          <div class="landing-hero-panel">
            <div class="landing-visual-card">
              <h3>MiniCRM nu este un șablon generic.</h3>
              <p>Modulele sunt custom și se pot adapta în funcție de nevoia de business. Suportul este inclus pe toate pachetele, iar dezvoltarea nouă sau specială se taxează separat, transparent.</p>
            </div>
            <div class="landing-visual-grid">
              <div class="landing-visual-tile">
                <strong>Tenant separat</strong>
                <span>Date, utilizatori și documente izolate pe fiecare companie.</span>
              </div>
              <div class="landing-visual-tile">
                <strong>e-Factura ready</strong>
                <span>Flux dedicat pentru XML, status și lucru în SPV sau demo simulat.</span>
              </div>
              <div class="landing-visual-tile">
                <strong>Control pe roluri</strong>
                <span>Acces limitat pe utilizator, conform pachetului și modulelor active.</span>
              </div>
              <div class="landing-visual-tile">
                <strong>Upgrade clar</strong>
                <span>Crești de la Start la Business sau Enterprise fără să schimbi platforma.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-section-head">
        <h2>De ce merită să intri în MiniCRM</h2>
        <p>Nu împachetezi zece aplicații diferite. Îți construiești un workspace coerent, cu fluxuri comerciale, operaționale și interne care vorbesc între ele.</p>
      </div>
      <div class="landing-proof-grid">
        <article class="landing-proof-card">
          <h3>Date separate, fără improvizații</h3>
          <p>Fiecare companie lucrează pe propriul tenant, cu utilizatori, documente și trasee complet separate de restul platformei.</p>
        </article>
        <article class="landing-proof-card">
          <h3>Pachete comerciale ușor de explicat</h3>
          <p>Știi clar câți utilizatori ai, ce module poți activa și când are sens să faci upgrade, fără surprize în exploatare.</p>
        </article>
        <article class="landing-proof-card">
          <h3>Custom acolo unde chiar contează</h3>
          <p>Modulele sunt adaptabile pe business, dar schimbările noi rămân estimate și taxate separat, ca să existe predictibilitate și profesionalism.</p>
        </article>
      </div>
    </section>

    <section class="landing-section" id="module">
      <div class="landing-section-head">
        <h2>Module pe care le activezi în funcție de cum lucrezi</h2>
        <p>Poți porni simplu și poți crește controlat. MiniCRM combină CRM, ERP și administrare internă în același nucleu, fără să-ți complice onboardingul.</p>
      </div>
      <div class="landing-module-grid">
        ${moduleCards}
      </div>
    </section>

    <section class="landing-section" id="pachete">
      <div class="landing-section-head">
        <h2>Pachete construite clar, fără ambiguități</h2>
        <p>Dashboard-ul este inclus, suportul este inclus, iar diferențierea reală vine din numărul de utilizatori și din nivelul de acces pe module. Dezvoltarea extra se bugetează separat.</p>
      </div>
      <div class="landing-plan-grid">
        ${planCards}
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-section-head">
        <h2>Flux simplu de pornire</h2>
        <p>Poți intra repede în aplicație fără să sari direct într-un proiect mare de implementare. Începi cu demo, alegi pachetul și apoi rafinăm modulele de care chiar ai nevoie.</p>
      </div>
      <div class="landing-process-grid">
        <article class="landing-process-card">
          <div class="landing-process-number">1</div>
          <h3>Testezi în demo</h3>
          <p>Îți creezi cont demo direct din site, vezi aproape tot fluxul aplicației și înțelegi ce module îți sunt utile.</p>
        </article>
        <article class="landing-process-card">
          <div class="landing-process-number">2</div>
          <h3>Alegi pachetul potrivit</h3>
          <p>Start pentru setup compact, Business pentru control pe utilizator și Enterprise pentru acces complet și scalare.</p>
        </article>
        <article class="landing-process-card">
          <div class="landing-process-number">3</div>
          <h3>Adaptăm pe business</h3>
          <p>Activezi modulele potrivite și, dacă ai nevoie de dezvoltări suplimentare, le estimăm și le planificăm separat.</p>
        </article>
      </div>
    </section>

    <section class="landing-section" id="suport">
      <div class="landing-section-head">
        <h2>Suport inclus, dezvoltare extra tratată profesionist</h2>
        <p>Toate pachetele includ suport pentru modulele active. Când apare o nevoie nouă de business, nu o mascăm sub abonament: o definim clar, o estimăm și o facturăm separat.</p>
      </div>
      <div class="landing-support-grid">
        <article class="landing-support-card">
          <h3>Suport pe modulele active</h3>
          <p>Primești suport operațional pentru ceea ce rulează deja în platformă, fără să-ți lași echipa blocată în utilizarea de zi cu zi.</p>
          <strong>Practic</strong>
        </article>
        <article class="landing-support-card">
          <h3>Module customizabile</h3>
          <p>Structura este flexibilă și se poate adapta în jurul proceselor reale ale companiei, nu invers.</p>
          <strong>Adaptabil</strong>
        </article>
        <article class="landing-support-card">
          <h3>Dezvoltare extra separată</h3>
          <p>Cererea nouă, integrarea nouă sau funcționalitatea specială se tratează ca proiect separat, cu estimare și cost clar.</p>
          <strong>Transparent</strong>
        </article>
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-final">
        <h2>Vrei să vezi exact cum ar arăta MiniCRM în business-ul tău?</h2>
        <p>Poți intra acum în demo, poți porni direct cu un workspace nou sau poți reveni în contul tău existent. Landing page-ul acesta este deja legat direct în site-ul aplicației, pe ruta principală.</p>
        <div class="landing-final-actions">
          <form method="post" action="/signup/demo" style="margin:0">
            <button class="landing-btn-ghost" type="submit">Creează cont demo</button>
          </form>
          <a class="landing-btn" href="/signup/company">Configurează companie nouă</a>
          <a class="landing-btn-secondary" href="/login">Login</a>
        </div>
      </div>
    </section>

    <footer class="landing-footer">
      MiniCRM combină CRM, ERP și administrare internă într-un singur workspace modular, cu tenant separat pe companie, pachete clare și posibilitate reală de adaptare pe business.
    </footer>
  </main>
</body>
</html>`);
}

app.get(["/", "/landing"], (req, res) => {
  if (req.path === "/" && req.session?.user) {
    return res.redirect(resolveWorkspaceHome(req.session.user));
  }
  return renderPublicLandingPage(req, res);
});

app.get("/contract-form", requireAuth, (req, res) => {
  const uiStyleMatch = uiHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const uiBodyMatch = uiHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const uiStyles = uiStyleMatch ? uiStyleMatch[1] : "";
  const uiBody = uiBodyMatch ? uiBodyMatch[1] : uiHtml;

  res.type("html").send(`
<!doctype html>
<html lang="ro">
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Form contract</title>
  <style>
    ${uiStyles}

    .crm-content body{background:transparent}
    .crm-content .card{
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:18px;
      padding:20px;
      box-shadow:0 2px 10px rgba(15,23,42,.05);
      margin:0;
    }
    .crm-content .card + .card{margin-top:16px}
    .crm-content .row{display:flex;gap:12px;flex-wrap:wrap}
    .crm-content label{
      display:block;
      font-size:13px;
      font-weight:700;
      color:#334155;
      margin:0 0 8px 0;
    }
    .crm-content input,
    .crm-content select,
    .crm-content textarea{
      width:100%;
      padding:11px 13px;
      border:1px solid #dbe2ea;
      border-radius:12px;
      background:#fff;
      color:#0f172a;
      outline:none;
      box-sizing:border-box;
    }
    .crm-content input:focus,
    .crm-content select:focus,
    .crm-content textarea:focus{
      border-color:#93c5fd;
      box-shadow:0 0 0 4px rgba(37,99,235,.12);
    }
    .crm-content textarea{min-height:120px}
    .crm-content .primary{
      background:#2563eb;
      color:#fff;
      border:none;
      padding:10px 14px;
      border-radius:12px;
      cursor:pointer;
      font-weight:700;
      box-shadow:0 8px 18px rgba(37,99,235,.18);
    }
    .crm-content .primary:hover{background:#1d4ed8}
    .crm-content .muted{color:#64748b;font-size:13px}
    .crm-content .hidden{display:none}
    .crm-content h2,
    .crm-content h3{color:#0f172a}
    .crm-form-wrap{max-width:1200px}
  </style>
</head>

${crmShellStart("form", "Form contract", "Generator contract PDF integrat în același workspace MiniCRM.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="crm-form-wrap">
    ${uiBody}
  </div>

${crmShellEnd()}
</html>`);
});


app.post("/api/contract/pdf", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session?.user?.company_id || 0);
    const body = req.body || {};

    const provider = {
      provider_legal_name: "QR-LAB SRL",
      provider_address: "Completează adresa prestatorului",
      provider_cui: "ROXXXXXXX",
      provider_reg_com: "Jxx/xxxx/xxxx",
      provider_iban: "ROxxBANKxxxxxxxxxxxxxx",
      provider_bank: "Banca",
      provider_representative_name: "Nume Reprezentant",
      provider_representative_role: "Administrator",
    };

    const is_company = body.is_company === "true" || body.is_company === true;
    const year = new Date().getFullYear();

    function normCui(cui) {
      return String(cui || "").toUpperCase().replace(/^RO/, "").replace(/\D/g, "");
    }
    function makePfKey(name, addr) {
      const raw = (String(name || "") + "|" + String(addr || "")).trim().toLowerCase();
      let h = 0;
      for (let k = 0; k < raw.length; k++) h = ((h << 5) - h + raw.charCodeAt(k)) | 0;
      return "PF-" + String(Math.abs(h));
    }

    let client_cui = "";
    let client_name = "";
    let client_addr = "";
    let client_reg = "";
    let client_caen = "";

    const pj_cui = normCui(body.pj_cui);
    const pj_name = String(body.pj_legal_name || "").trim();
    const pj_address = String(body.pj_address || "").trim();
    const pj_reg_com = String(body.pj_reg_com || "").trim();

    const pf_name = String(body.pf_full_name || "").trim();
    const pf_address = String(body.pf_address || "").trim();

    if (is_company) {
      client_cui = pj_cui;
      client_name = pj_name;
      client_addr = pj_address;
      client_reg = pj_reg_com;
      client_caen = String(body.caen || "").trim();
      if (!client_cui) return res.status(400).json({ error: "CUI lipsă/invalid" });
      if (!client_name) return res.status(400).json({ error: "Denumire firmă lipsă" });
    } else {
      client_cui = makePfKey(pf_name, pf_address);
      client_name = pf_name;
      client_addr = pf_address;
      client_reg = "";
      client_caen = "";
      if (!client_name) return res.status(400).json({ error: "Nume PF lipsă" });
    }

    const vat = body.vat ? 1 : 0;
    const inactive = body.inactive ? 1 : 0;

    const existingClient = db.prepare("SELECT id FROM clients WHERE cui=? AND company_id=?").get(client_cui, companyId);
    let client_id;
    if (existingClient?.id) {
      client_id = existingClient.id;
      db.prepare(`
        UPDATE clients
        SET name=?, address=?, reg_com=?, caen=?, vat=?, inactive=?
        WHERE id=? AND company_id=?
      `).run(client_name, client_addr, client_reg, client_caen, vat, inactive, client_id, companyId);
    } else {
      const r = db.prepare(`
        INSERT INTO clients (cui, name, address, reg_com, caen, vat, inactive, company_id)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(client_cui, client_name, client_addr, client_reg, client_caen, vat, inactive, companyId);
      client_id = r.lastInsertRowid;
    }

    const row = db.prepare("SELECT MAX(seq) AS maxSeq FROM contracts WHERE year=? AND company_id=?").get(year, companyId);
    const nextSeq = (row?.maxSeq || 0) + 1;
    const contract_number = `QR-${year}-${String(nextSeq).padStart(4, "0")}`;

    const vm = {
      ...provider,
      contract_number,
      contract_date: body.contract_date || todayISO(),
      is_company,

      contact_email: body.contact_email || "",
      contact_phone: body.contact_phone || "",

      pj_cui: is_company ? (client_cui || "") : "",
      pj_legal_name: is_company ? (client_name || "") : "",
      pj_address: is_company ? (client_addr || "") : "",
      pj_reg_com: is_company ? (client_reg || "") : "",
      pj_representative_name: body.pj_representative_name || "",
      pj_representative_role: body.pj_representative_role || "Administrator",

      pf_full_name: !is_company ? (client_name || "") : "",
      pf_address: !is_company ? (client_addr || "") : "",

      service_description: body.service_description || "",
      price_amount: body.price_amount || "",
      price_currency: body.price_currency || "RON",
      payment_terms: body.payment_terms || "15 zile",
      start_date: body.start_date || todayISO(),
      duration: body.duration || "12 luni",
      termination_notice_days: body.termination_notice_days || "30",
      jurisdiction_city: body.jurisdiction_city || "București",
      privacy_policy_url: body.privacy_policy_url || "https://qr-lab.ro",

      client_signer_name: is_company ? (body.pj_representative_name || "") : (client_name || ""),
      provider_signer_name: provider.provider_representative_name,
    };

    const html = Mustache.render(templateHtml, { ...vm, company: COMPANY });
    const pdf = await renderPdfBuffer(html);

    const yearDir = path.join(__dirname, "contracts", String(year));
    fs.mkdirSync(yearDir, { recursive: true });
    const fileName = `${contract_number}.pdf`;
    const absPath = path.join(yearDir, fileName);
    fs.writeFileSync(absPath, pdf);
    const pdf_path = `contracts/${year}/${fileName}`;

    const priceNum = Number(String(body.price_amount || "").replace(",", "."));
    db.prepare(`
      INSERT INTO contracts (contract_number, year, seq, client_id, service_description, price, duration, pdf_path, company_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      contract_number,
      year,
      nextSeq,
      client_id,
      String(body.service_description || ""),
      Number.isFinite(priceNum) ? priceNum : 0,
      String(body.duration || "12 luni"),
      pdf_path,
      companyId
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: "PDF/CRM error", details: String(e?.message ?? e) });
  }
});
app.listen(3000, "0.0.0.0", () => console.log("MiniCRM running on :3000"));




function buildFacturaXmlContent(id, companyId = null){
  const hasTenantScope = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
  const f = db.prepare(`
    SELECT f.*, c.name AS client_name, c.cui AS client_cui, c.address AS client_address, c.reg_com AS client_reg_com, c.vat AS client_vat
    FROM facturi f
    JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
    WHERE f.id=?${hasTenantScope ? " AND f.company_id=?" : ""}
  `).get(...(hasTenantScope ? [id, Number(companyId)] : [id]));

  if(!f) return { error: "Factura nu exista" };

  const lines = db.prepare(`
    SELECT denumire, descriere, cantitate, unitate, pret_unitar, total_linie
    FROM facturi_linii
    WHERE factura_id=?
    ORDER BY sort_order ASC, id ASC
  `).all(id);

  const totals = recalcFacturaTotals(id, companyId);

  const company_name = getSetting("company_name", COMPANY.name);
  const company_cui = getSetting("company_cui", COMPANY.cui);
  const company_rc = getSetting("company_rc", COMPANY.rc || "");
  const company_address = getSetting("company_address", COMPANY.address);
  const company_iban = String(getSetting("company_iban", COMPANY.iban || "") || "").trim();
  const company_bank = String(getSetting("company_bank", COMPANY.bank || "") || "").trim();
  const company_rep = String(getSetting("company_rep", COMPANY.rep || COMPANY.representative || "") || "").trim();
  const company_phone = String(getSetting("company_phone", COMPANY.phone || "") || "").trim();
  const company_email = String(getSetting("company_email", COMPANY.email || "") || "").trim();
  const companyVatSettingRaw = String(getSetting("company_vat", "") || "").trim();

  const esc = (v) => escapeHtml(String(v ?? ""));
  const normalizeKey = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
  const countyCodeMap = {
    ALBA: "RO-AB",
    ARAD: "RO-AR",
    ARGES: "RO-AG",
    BACAU: "RO-BC",
    BIHOR: "RO-BH",
    "BISTRITA NASAUD": "RO-BN",
    BOTOSANI: "RO-BT",
    BRASOV: "RO-BV",
    BRAILA: "RO-BR",
    BUZAU: "RO-BZ",
    "CARAS SEVERIN": "RO-CS",
    CALARASI: "RO-CL",
    CLUJ: "RO-CJ",
    CONSTANTA: "RO-CT",
    COVASNA: "RO-CV",
    DAMBOVITA: "RO-DB",
    DOLJ: "RO-DJ",
    GALATI: "RO-GL",
    GIURGIU: "RO-GR",
    GORJ: "RO-GJ",
    HARGHITA: "RO-HR",
    HUNEDOARA: "RO-HD",
    IALOMITA: "RO-IL",
    IASI: "RO-IS",
    ILFOV: "RO-IF",
    MARAMURES: "RO-MM",
    MEHEDINTI: "RO-MH",
    MURES: "RO-MS",
    NEAMT: "RO-NT",
    OLT: "RO-OT",
    PRAHOVA: "RO-PH",
    "SATU MARE": "RO-SM",
    SALAJ: "RO-SJ",
    SIBIU: "RO-SB",
    SUCEAVA: "RO-SV",
    TELEORMAN: "RO-TR",
    TIMIS: "RO-TM",
    TULCEA: "RO-TL",
    VASLUI: "RO-VS",
    VALCEA: "RO-VL",
    VRANCEA: "RO-VN",
    BUCURESTI: "RO-B",
    "MUNICIPIUL BUCURESTI": "RO-B"
  };
  const countyCodeByAbbrev = {
    AB: "RO-AB",
    AR: "RO-AR",
    AG: "RO-AG",
    BC: "RO-BC",
    BH: "RO-BH",
    BN: "RO-BN",
    BT: "RO-BT",
    BV: "RO-BV",
    BR: "RO-BR",
    BZ: "RO-BZ",
    CS: "RO-CS",
    CL: "RO-CL",
    CJ: "RO-CJ",
    CT: "RO-CT",
    CV: "RO-CV",
    DB: "RO-DB",
    DJ: "RO-DJ",
    GL: "RO-GL",
    GR: "RO-GR",
    GJ: "RO-GJ",
    HR: "RO-HR",
    HD: "RO-HD",
    IL: "RO-IL",
    IS: "RO-IS",
    IF: "RO-IF",
    MM: "RO-MM",
    MH: "RO-MH",
    MS: "RO-MS",
    NT: "RO-NT",
    OT: "RO-OT",
    PH: "RO-PH",
    SM: "RO-SM",
    SJ: "RO-SJ",
    SB: "RO-SB",
    SV: "RO-SV",
    TR: "RO-TR",
    TM: "RO-TM",
    TL: "RO-TL",
    VS: "RO-VS",
    VL: "RO-VL",
    VN: "RO-VN",
    B: "RO-B"
  };
  const lookupCountyCode = (value) => {
    const normalized = normalizeKey(value);
    if (!normalized) return "";
    return countyCodeMap[normalized] || countyCodeByAbbrev[normalized] || "";
  };
  const parseRomanianAddress = (value) => {
    const raw = String(value || "").trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
    if (!raw) {
      return { streetName: "", cityName: "", countrySubentity: "" };
    }

    const segments = raw.split(/\s*,\s*/).filter(Boolean);
    let countySegmentIndex = -1;
    let countyLabel = "";

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const judMatch = segment.match(/^(?:JUD\.?|JUDETUL)\s+(.+)$/i);
      if (judMatch) {
        countySegmentIndex = index;
        countyLabel = judMatch[1];
        break;
      }
      if (/^(?:MUNICIPIUL\s+BUCURESTI|BUCURESTI)$/i.test(normalizeKey(segment))) {
        countySegmentIndex = index;
        countyLabel = "BUCURESTI";
        break;
      }
      const shortJudMatch = segment.match(/\bJUD\.?\s*([A-Z]{1,2})\b/i);
      if (shortJudMatch) {
        countyLabel = shortJudMatch[1];
      }
    }

    const streetSegments = countySegmentIndex >= 0
      ? segments.filter((_, index) => index !== countySegmentIndex)
      : [...segments];

    let cityName = "";
    for (const segment of streetSegments) {
      const satComMatch = segment.match(/^SAT\s+(.+?)\s+COM\.?\s+(.+)$/i);
      if (satComMatch) {
        cityName = satComMatch[1].trim();
        break;
      }
      const localityMatch = segment.match(/^(?:ORS\.?|ORAS\.?|ORAŞ\.?|ORŞ\.?|MUN\.?|MUNICIPIUL|COM\.?)\s+(.+)$/i);
      if (localityMatch) {
        cityName = localityMatch[1].trim();
        break;
      }
      const sectorMatch = segment.match(/^SECTOR(?:UL)?\s*([1-6])$/i);
      if (sectorMatch) {
        cityName = `SECTOR${sectorMatch[1]}`;
        break;
      }
    }

    if (!cityName && streetSegments.length > 1) {
      const firstSegment = streetSegments[0];
      if (!/^(?:STR\.?|STRADA|SOS\.?|CALEA|BD\.?|BULEVARDUL|NR\.?|BLOC|BL\.?|AP\.?|SC\.?|ET\.?)/i.test(firstSegment)) {
        cityName = firstSegment.trim();
      }
    }

    const countrySubentity = lookupCountyCode(countyLabel);
    const streetName = streetSegments.join(", ") || raw;
    return {
      streetName,
      cityName,
      countrySubentity
    };
  };
  const mapUnitCode = (unit) => {
    const normalized = String(unit || "").trim().toLowerCase();
    if (!normalized) return "C62";
    if (["buc", "bucata", "bucati", "pcs", "piece", "pieces"].includes(normalized)) return "C62";
    if (["h", "hr", "ora", "ore"].includes(normalized)) return "HUR";
    if (["zi", "zile", "day", "days"].includes(normalized)) return "DAY";
    if (["luna", "luni", "month", "months"].includes(normalized)) return "MON";
    if (["kg", "kilogram", "kilograme"].includes(normalized)) return "KGM";
    if (["m", "metru", "metri", "meter", "meters"].includes(normalized)) return "MTR";
    return "C62";
  };
  const taxRatePercent = Number((totals.tva_procent || 0) * 100);
  const companyVatConfigured = companyVatSettingRaw === "0" || companyVatSettingRaw === "1";
  const sellerVatRegistered = companyVatConfigured
    ? companyVatSettingRaw === "1"
    : taxRatePercent > 0;
  const supplierRegistration = String(company_rc || "").trim();
  const customerRegistration = String(f.client_reg_com || "").trim();
  const supplierAddress = parseRomanianAddress(company_address);
  const customerAddress = parseRomanianAddress(f.client_address || "");
  const supplierBankCode = company_iban.length >= 8 ? company_iban.slice(4, 8).toUpperCase() : "";
  const bankBranchIdByCode = {
    BACX: "BACXROBU",
    BREL: "BRELROBU",
    BRDE: "BRDEROBU",
    BTRL: "BTRLRO22",
    INGB: "INGBROBU",
    PIRB: "PIRBROBU",
    RNCB: "RNCBROBU",
    UGBI: "UGBIROBU"
  };
  const taxCategoryCode = taxRatePercent > 0 ? "S" : (sellerVatRegistered ? "E" : "O");
  const exemptionReasonCode = taxCategoryCode === "O" ? "VATEX-EU-O" : "";
  const exemptionReasonText = taxCategoryCode === "O"
    ? "Nu face obiectul TVA"
    : (taxRatePercent <= 0 ? String(getSetting("company_vat_exemption_reason", "Scutit de TVA conform legislatiei aplicabile.") || "").trim() : "");
  const invoiceNote = taxCategoryCode === "O"
    ? "REGIM SPECIAL DE SCUTIRE PENTRU INTREPRINDERILE MICI"
    : "";
  const supplierPartyTaxSchemeXml = sellerVatRegistered && String(company_cui || "").trim()
    ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>RO${esc(company_cui)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : (taxCategoryCode === "O" && String(company_cui || "").trim()
      ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(company_cui)}</cbc:CompanyID>
        <cac:TaxScheme/>
      </cac:PartyTaxScheme>`
      : "");
  const customerPartyTaxSchemeXml = taxCategoryCode !== "O" && Number(f.client_vat || 0) === 1 && String(f.client_cui || "").trim()
    ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>RO${esc(f.client_cui)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : "";
  const supplierPartyIdentificationValue = String(company_cui || "").trim();
  const customerPartyIdentificationValue = String(customerRegistration || f.client_cui || "").trim();
  const supplierLegalCompanyId = String(supplierRegistration || company_cui || "").trim();
  const customerLegalCompanyId = String(f.client_cui || customerRegistration || "").trim();
  const supplierContactXml = (company_rep || company_phone || company_email)
    ? `
      <cac:Contact>
        ${company_rep ? `<cbc:Name>${esc(company_rep)}</cbc:Name>` : ""}
        ${company_phone ? `<cbc:Telephone>${esc(company_phone)}</cbc:Telephone>` : ""}
        ${company_email ? `<cbc:ElectronicMail>${esc(company_email)}</cbc:ElectronicMail>` : ""}
      </cac:Contact>`
    : "";
  const normalizedBankName = company_bank
    ? company_bank
      .replace(/\s*S\.?\s*A\.?$/i, "")
      .replace(/-/g, " - ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
    : "";
  const paymentReference = Number.isFinite(Number(f.seq || 0)) && Number(f.seq || 0) > 0
    ? `${String(f.factura_nr || "").split("-")[0] || "INV"} nr. ${String(Number(f.seq || 0)).padStart(4, "0")}`
    : String(f.factura_nr || "").trim();
  const paymentAccountName = normalizedBankName
    ? `CONT ${normalizedBankName} IN ${String(f.moneda || "RON").toUpperCase()}`
    : `CONT ${String(f.moneda || "RON").toUpperCase()}`;
  const paymentMeansXml = company_iban
    ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>42</cbc:PaymentMeansCode>
    ${paymentReference ? `<cbc:PaymentID>${esc(paymentReference)}</cbc:PaymentID>` : ""}
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(company_iban)}</cbc:ID>
      ${paymentAccountName ? `<cbc:Name>${esc(paymentAccountName)}</cbc:Name>` : ""}
      ${bankBranchIdByCode[supplierBankCode] ? `
      <cac:FinancialInstitutionBranch>
        <cbc:ID>${esc(bankBranchIdByCode[supplierBankCode])}</cbc:ID>
      </cac:FinancialInstitutionBranch>` : ""}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`
    : "";
  const subtotalTaxCategoryXml = taxCategoryCode === "S"
    ? `
      <cac:TaxCategory>
        <cbc:ID>${taxCategoryCode}</cbc:ID>
        <cbc:Percent>${taxRatePercent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>`
    : `
      <cac:TaxCategory>
        <cbc:ID>${taxCategoryCode}</cbc:ID>
        ${taxCategoryCode === "E" ? `<cbc:Percent>${taxRatePercent.toFixed(2)}</cbc:Percent>` : ""}
        ${exemptionReasonCode ? `<cbc:TaxExemptionReasonCode>${esc(exemptionReasonCode)}</cbc:TaxExemptionReasonCode>` : ""}
        ${exemptionReasonText ? `<cbc:TaxExemptionReason>${esc(exemptionReasonText)}</cbc:TaxExemptionReason>` : ""}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>`;
  const lineTaxCategoryXml = taxCategoryCode === "S"
    ? `
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCategoryCode}</cbc:ID>
        <cbc:Percent>${taxRatePercent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>`
    : `
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCategoryCode}</cbc:ID>
        ${taxCategoryCode === "E" ? `<cbc:Percent>${taxRatePercent.toFixed(2)}</cbc:Percent>` : ""}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>`;

  const linesXml = (lines||[]).map((l,i)=>`
  <cac:InvoiceLine>
    <cbc:ID>${i+1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${mapUnitCode(l.unitate)}">${Number(l.cantitate || 0)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">${Number(l.total_linie || 0).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      ${String(l.descriere || "").trim() ? `<cbc:Description>${esc(l.descriere)}</cbc:Description>` : ""}
      <cbc:Name>${esc(l.denumire)}</cbc:Name>
      ${lineTaxCategoryXml}
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="RON">${Number(l.pret_unitar || 0).toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(f.factura_nr)}</cbc:ID>
  <cbc:IssueDate>${String(f.data_emitere).slice(0,10)}</cbc:IssueDate>
  <cbc:DueDate>${f.scadenta ? String(f.scadenta).slice(0,10) : String(f.data_emitere).slice(0,10)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${invoiceNote ? `<cbc:Note>${esc(invoiceNote)}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${esc(f.moneda || "RON")}</cbc:DocumentCurrencyCode>

  <cac:AccountingSupplierParty>
    <cac:Party>
      ${supplierPartyIdentificationValue ? `
      <cac:PartyIdentification>
        <cbc:ID>${esc(supplierPartyIdentificationValue)}</cbc:ID>
      </cac:PartyIdentification>` : ""}
      <cac:PartyName>
        <cbc:Name>${esc(company_name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(supplierAddress.streetName || company_address)}</cbc:StreetName>
        ${supplierAddress.cityName ? `<cbc:CityName>${esc(supplierAddress.cityName)}</cbc:CityName>` : ""}
        ${supplierAddress.countrySubentity ? `<cbc:CountrySubentity>${esc(supplierAddress.countrySubentity)}</cbc:CountrySubentity>` : ""}
        <cac:Country>
          <cbc:IdentificationCode>RO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${supplierPartyTaxSchemeXml}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(company_name)}</cbc:RegistrationName>
        ${supplierLegalCompanyId ? `<cbc:CompanyID>${esc(supplierLegalCompanyId)}</cbc:CompanyID>` : ""}
      </cac:PartyLegalEntity>
      ${supplierContactXml}
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      ${customerPartyIdentificationValue ? `
      <cac:PartyIdentification>
        <cbc:ID>${esc(customerPartyIdentificationValue)}</cbc:ID>
      </cac:PartyIdentification>` : ""}
      <cac:PartyName>
        <cbc:Name>${esc(f.client_name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(customerAddress.streetName || f.client_address || "")}</cbc:StreetName>
        ${customerAddress.cityName ? `<cbc:CityName>${esc(customerAddress.cityName)}</cbc:CityName>` : ""}
        ${customerAddress.countrySubentity ? `<cbc:CountrySubentity>${esc(customerAddress.countrySubentity)}</cbc:CountrySubentity>` : ""}
        <cac:Country>
          <cbc:IdentificationCode>RO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${customerPartyTaxSchemeXml}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(f.client_name)}</cbc:RegistrationName>
        ${customerLegalCompanyId ? `<cbc:CompanyID>${esc(customerLegalCompanyId)}</cbc:CompanyID>` : ""}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  ${paymentMeansXml}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.tva_valoare || 0).toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.subtotal || 0).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.tva_valoare || 0).toFixed(2)}</cbc:TaxAmount>
      ${subtotalTaxCategoryXml}
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.subtotal || 0).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.subtotal || 0).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.total || 0).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(f.moneda || "RON")}">${Number(totals.total || 0).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  ${linesXml}

</Invoice>`;

  return { f, lines, totals, xml };
}

function ensureFacturaXmlGenerated(id, companyId = null){
  const built = buildFacturaXmlContent(id, companyId);
  if(built.error) return built;

  const xmlDir = path.join(__dirname, "efactura_xml");
  fs.mkdirSync(xmlDir, { recursive:true });

  const xmlFile = `${built.f.factura_nr}.xml`;
  const absPath = path.join(xmlDir, xmlFile);
  fs.writeFileSync(absPath, built.xml);

  db.prepare(`
    UPDATE facturi
    SET efactura_xml_path=?,
        efactura_status=CASE
          WHEN efactura_status='PREGATIT_PENTRU_TRIMITERE' THEN efactura_status
          ELSE 'GENERAT'
        END
    WHERE id=?
  `).run(`efactura_xml/${xmlFile}`, id);

  return {
    ok: true,
    xmlFile,
    absPath,
    xmlPath: `efactura_xml/${xmlFile}`,
    xml: built.xml,
    f: built.f
  };
}

/* ================================
   SETTINGS MODULE
================================ */

import multer from "multer";
const upload = multer({ dest: "uploads/" });
const dmsAutofillUpload = multer({ dest: "uploads/", limits: { fileSize: 20 * 1024 * 1024 } });
const dmsClientUpload = multer({ dest: "uploads/", limits: { fileSize: 30 * 1024 * 1024 } });

registerAccountingRoutes(app, { db, requireAuth, requireSpvAccess, canAccessSpvUser, escapeHtml, fmtMoney, crmShellStart, crmShellEnd, fs, path, __dirname, upload });
registerInventoryRoutes(app, { db, requireAuth, escapeHtml, fmtMoney, crmShellStart, crmShellEnd, fs, path, __dirname, upload });
registerProjectsRoutes(app, { db, requireAuth, fs, path, __dirname });

db.prepare(`
CREATE TABLE IF NOT EXISTS app_settings(
key TEXT PRIMARY KEY,
value TEXT
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS tipizate_docs(
id INTEGER PRIMARY KEY AUTOINCREMENT,
title TEXT NOT NULL,
category TEXT,
file_name TEXT NOT NULL,
file_path TEXT NOT NULL,
mime_type TEXT,
registration_number TEXT,
registration_year INTEGER,
registration_seq INTEGER,
registered_at TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS tipizate_register(
id INTEGER PRIMARY KEY AUTOINCREMENT,
company_id INTEGER NOT NULL,
year INTEGER NOT NULL,
seq INTEGER NOT NULL,
registration_number TEXT NOT NULL,
doc_id INTEGER,
doc_title TEXT NOT NULL DEFAULT '',
doc_category TEXT,
file_name TEXT,
file_path TEXT,
issued_at TEXT,
entry_type TEXT NOT NULL DEFAULT 'AUTO',
recipient TEXT,
notes TEXT,
created_by_user_id INTEGER,
created_by_email TEXT,
status TEXT NOT NULL DEFAULT 'ACTIV',
created_at TEXT NOT NULL DEFAULT (datetime('now')),
UNIQUE(company_id, registration_number),
UNIQUE(company_id, doc_id)
)`).run();

function currentRequestCompanyId() {
  const req = requestContext.getStore()?.req;
  return Number(req?.session?.user?.company_id || 0) || 0;
}

function isTenantScopedSettingKey(k = "") {
  const key = String(k || "").trim();
  return key.startsWith("company_")
    || key.startsWith("invoice_")
    || key.startsWith("anaf_")
    || key === "capital_social";
}

function canFallbackToGlobalSetting(k = "") {
  const key = String(k || "").trim();
  return key.startsWith("anaf_");
}

function companySettingKey(companyId, k) {
  return `company:${Number(companyId)}:${String(k || "").trim()}`;
}

const COMPANY_SETTING_COLUMNS = {
  company_name: "name",
  company_cui: "cui",
  company_rc: "rc",
  company_address: "address",
  company_bank: "bank",
  company_iban: "iban",
  company_rep: "representative"
};

function readGlobalSetting(k, def = "") {
  const r = db.prepare("SELECT value FROM app_settings WHERE key=?").get(k);
  return r ? r.value : def;
}

function resolvePrimaryCompanyIdForGlobalSettings() {
  const globalCui = String(readGlobalSetting("company_cui", "") || "").trim();
  if (globalCui) {
    const byCui = db.prepare("SELECT id FROM companies WHERE cui=? ORDER BY id ASC LIMIT 1").get(globalCui);
    if (byCui?.id) return Number(byCui.id);
  }

  return Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
}

function backfillGlobalTenantSettings() {
  const companyId = resolvePrimaryCompanyIdForGlobalSettings();
  if (!companyId) return;

  const rows = db.prepare(`
    SELECT key, value
    FROM app_settings
    WHERE key NOT LIKE 'company:%'
  `).all().filter((row) => isTenantScopedSettingKey(row.key));

  const insert = db.prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES(?,?)");
  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run(companySettingKey(companyId, row.key), String(row.value || ""));
    }
  });
  tx();
}

backfillGlobalTenantSettings();

function getCompanySetting(companyId, k, def = "") {
  const normalizedCompanyId = Number(companyId || 0);
  if (normalizedCompanyId > 0 && isTenantScopedSettingKey(k)) {
    const scoped = db.prepare("SELECT value FROM app_settings WHERE key=?")
      .get(companySettingKey(normalizedCompanyId, k));
    if (scoped) return scoped.value;

    const companyColumn = COMPANY_SETTING_COLUMNS[String(k || "").trim()];
    if (companyColumn) {
      const companyValue = db.prepare(`SELECT ${companyColumn} AS value FROM companies WHERE id=?`)
        .get(normalizedCompanyId)?.value;
      if (companyValue !== null && companyValue !== undefined && String(companyValue).trim() !== "") {
        return companyValue;
      }
    }

    if (canFallbackToGlobalSetting(k)) {
      return readGlobalSetting(k, def);
    }

    return def;
  }
  return readGlobalSetting(k, def);
}

function setCompanySetting(companyId, k, v) {
  const normalizedCompanyId = Number(companyId || 0);
  const key = normalizedCompanyId > 0 && isTenantScopedSettingKey(k)
    ? companySettingKey(normalizedCompanyId, k)
    : String(k || "").trim();
  if (!key) return;
  db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)").run(key, String(v || ""));
}

function getSetting(k, def=""){
  return getCompanySetting(currentRequestCompanyId(), k, def);
}

function setSetting(k,v){
  setCompanySetting(currentRequestCompanyId(), k, v);
}

function tipizateRegisterYear(value) {
  const parsed = Number(String(value || "").slice(0, 4));
  return Number.isFinite(parsed) && parsed >= 2000 ? parsed : new Date().getFullYear();
}

function formatTipizateRegistrationNumber(year, seq) {
  return `IES-${year}-${String(seq).padStart(5, "0")}`;
}

function tipizateRegisterStatusBadge(status) {
  const normalized = String(status || "ACTIV").trim().toUpperCase();
  if (normalized === "STERS") return `<span class="crm-badge crm-badge-neutral">șters</span>`;
  return `<span class="crm-badge crm-badge-green">activ</span>`;
}

function tipizateRegisterTypeBadge(entryType) {
  const normalized = String(entryType || "AUTO").trim().toUpperCase();
  if (normalized === "MANUAL") return `<span class="crm-badge crm-badge-amber">manual</span>`;
  return `<span class="crm-badge crm-badge-blue">automat</span>`;
}

function stampTipizateRegistrationHtml(html, registration) {
  const number = escapeHtml(registration?.registration_number || "");
  if (!number) return html;
  const issuedAt = escapeHtml(String(registration?.issued_at || registration?.created_at || "").slice(0, 19));
  const stamp = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.3;text-align:right;border-bottom:1px solid #ddd;margin:0 0 8px 0;padding:0 0 6px 0;color:#111">
      Nr. înregistrare: <b>${number}</b>${issuedAt ? ` &nbsp;|&nbsp; Data: ${issuedAt}` : ""}
    </div>`;
  const source = String(html || "");
  if (/<body[^>]*>/i.test(source)) {
    return source.replace(/<body([^>]*)>/i, `<body$1>${stamp}`);
  }
  return `${stamp}${source}`;
}

const registerTipizateDocumentTx = db.transaction(({ docId, companyId, userId = null, userEmail = "" }) => {
  const normalizedDocId = Number(docId || 0);
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedDocId || !normalizedCompanyId) return null;

  const existing = db.prepare(`
    SELECT id, company_id, year, seq, registration_number, doc_id, doc_title,
           doc_category, file_name, file_path, issued_at, status, created_at
    FROM tipizate_register
    WHERE company_id=? AND doc_id=?
  `).get(normalizedCompanyId, normalizedDocId);

  if (existing) {
    db.prepare(`
      UPDATE tipizate_docs
      SET registration_number=?,
          registration_year=?,
          registration_seq=?,
          registered_at=?
      WHERE id=? AND company_id=?
    `).run(
      existing.registration_number,
      existing.year,
      existing.seq,
      existing.created_at || existing.issued_at || new Date().toISOString(),
      normalizedDocId,
      normalizedCompanyId
    );
    return existing;
  }

  const doc = db.prepare(`
    SELECT id, title, category, file_name, file_path, created_at
    FROM tipizate_docs
    WHERE id=? AND company_id=?
  `).get(normalizedDocId, normalizedCompanyId);
  if (!doc) return null;

  const year = tipizateRegisterYear(doc.created_at);
  const seq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM tipizate_register
    WHERE company_id=? AND year=?
  `).get(normalizedCompanyId, year)?.next_seq || 1);
  const registrationNumber = formatTipizateRegistrationNumber(year, seq);
  const issuedAt = doc.created_at || new Date().toISOString();

  db.prepare(`
    INSERT INTO tipizate_register (
      company_id, year, seq, registration_number, doc_id, doc_title,
      doc_category, file_name, file_path, issued_at, entry_type, created_by_user_id,
      created_by_email, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', ?, ?, 'ACTIV', COALESCE(?, datetime('now')))
  `).run(
    normalizedCompanyId,
    year,
    seq,
    registrationNumber,
    normalizedDocId,
    String(doc.title || ""),
    String(doc.category || ""),
    String(doc.file_name || ""),
    String(doc.file_path || ""),
    issuedAt,
    userId || null,
    String(userEmail || ""),
    issuedAt
  );

  db.prepare(`
    UPDATE tipizate_docs
    SET registration_number=?,
        registration_year=?,
        registration_seq=?,
        registered_at=?
    WHERE id=? AND company_id=?
  `).run(registrationNumber, year, seq, issuedAt, normalizedDocId, normalizedCompanyId);

  return db.prepare(`
    SELECT id, company_id, year, seq, registration_number, doc_id, doc_title,
           doc_category, file_name, file_path, issued_at, entry_type, recipient,
           notes, created_by_email, status, created_at
    FROM tipizate_register
    WHERE company_id=? AND doc_id=?
  `).get(normalizedCompanyId, normalizedDocId);
});

function registerTipizateDocument(docId, companyId, req) {
  return registerTipizateDocumentTx({
    docId,
    companyId,
    userId: Number(req?.session?.user?.id || 0) || null,
    userEmail: String(req?.session?.user?.email || "")
  });
}

const createManualTipizateRegisterEntryTx = db.transaction(({ companyId, title, category, issuedAt, recipient, notes, fileName, filePath, userId = null, userEmail = "" }) => {
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) return null;

  const normalizedIssuedAt = String(issuedAt || "").trim() || todayISO();
  const year = tipizateRegisterYear(normalizedIssuedAt);
  const seq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM tipizate_register
    WHERE company_id=? AND year=?
  `).get(normalizedCompanyId, year)?.next_seq || 1);
  const registrationNumber = formatTipizateRegistrationNumber(year, seq);

  db.prepare(`
    INSERT INTO tipizate_register (
      company_id, year, seq, registration_number, doc_id, doc_title,
      doc_category, file_name, file_path, issued_at, entry_type, recipient,
      notes, created_by_user_id, created_by_email, status, created_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, ?, 'ACTIV', datetime('now'))
  `).run(
    normalizedCompanyId,
    year,
    seq,
    registrationNumber,
    String(title || ""),
    String(category || "MANUAL"),
    String(fileName || ""),
    String(filePath || ""),
    normalizedIssuedAt,
    String(recipient || ""),
    String(notes || ""),
    userId || null,
    String(userEmail || "")
  );

  return db.prepare(`
    SELECT id, company_id, year, seq, registration_number, doc_id, doc_title,
           doc_category, file_name, file_path, issued_at, entry_type, recipient,
           notes, created_by_email, status, created_at
    FROM tipizate_register
    WHERE company_id=? AND registration_number=?
  `).get(normalizedCompanyId, registrationNumber);
});

function createManualTipizateRegisterEntry(values, req) {
  return createManualTipizateRegisterEntryTx({
    ...values,
    userId: Number(req?.session?.user?.id || 0) || null,
    userEmail: String(req?.session?.user?.email || "")
  });
}

function safeStoredFileName(originalName, fallback = "document") {
  const raw = path.basename(String(originalName || fallback));
  return raw.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_") || fallback;
}

function getDmsAutofillProfile(companyId) {
  const normalizedCompanyId = Number(companyId || 0);
  const company = db.prepare(`
    SELECT name, cui, rc, address, bank, iban, representative
    FROM companies
    WHERE id=?
  `).get(normalizedCompanyId) || {};

  return {
    company_name: String(company.name || getCompanySetting(normalizedCompanyId, "company_name", "") || "").trim(),
    company_cui: String(company.cui || getCompanySetting(normalizedCompanyId, "company_cui", "") || "").trim(),
    company_rc: String(company.rc || getCompanySetting(normalizedCompanyId, "company_rc", "") || "").trim(),
    company_address: String(company.address || getCompanySetting(normalizedCompanyId, "company_address", "") || "").trim(),
    company_bank: String(company.bank || getCompanySetting(normalizedCompanyId, "company_bank", "") || "").trim(),
    company_iban: String(company.iban || getCompanySetting(normalizedCompanyId, "company_iban", "") || "").trim(),
    company_phone: String(getCompanySetting(normalizedCompanyId, "company_phone", "") || "").trim(),
    company_email: String(getCompanySetting(normalizedCompanyId, "company_email", "") || "").trim(),
    capital_social: String(getCompanySetting(normalizedCompanyId, "capital_social", "") || "").trim(),
    legal_representative: String(company.representative || getCompanySetting(normalizedCompanyId, "company_rep", "") || "").trim(),
    legal_representative_ci_series: String(getCompanySetting(normalizedCompanyId, "company_rep_ci_series", "") || "").trim(),
    legal_representative_ci_number: String(getCompanySetting(normalizedCompanyId, "company_rep_ci_number", "") || "").trim(),
    legal_representative_ci_issued_by: String(getCompanySetting(normalizedCompanyId, "company_rep_ci_issued_by", "") || "").trim()
  };
}

function dmsAutofillStorageDirectory(companyId) {
  return path.join(__dirname, "uploads", "dms-autofill", `company-${Number(companyId || 0)}`);
}

function resolveDmsAutofillStoredPath(companyId, relativePath = "") {
  const companyFolder = `company-${Number(companyId || 0)}`;
  const normalizedRelativePath = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalizedRelativePath.startsWith(`${companyFolder}/`)) return "";

  const storageRoot = path.resolve(path.join(__dirname, "uploads", "dms-autofill"));
  const absolutePath = path.resolve(storageRoot, normalizedRelativePath);
  return absolutePath.startsWith(storageRoot + path.sep) ? absolutePath : "";
}

function removeDmsAutofillStoredFile(companyId, relativePath) {
  const absolutePath = resolveDmsAutofillStoredPath(companyId, relativePath);
  if (absolutePath && fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
}

function isCompanyAdminUser(user) {
  return Number(user?.company_id || 0) > 0 && (
    String(user?.role || "").trim().toLowerCase() === "admin"
    || Number(user?.is_company_admin || 0) === 1
  );
}

function requireCompanyAdmin(req, res, next) {
  if (!isCompanyAdminUser(req.session?.user)) return res.status(403).send("Forbidden");
  return next();
}

function dmsClientStorageDirectory(companyId, clientId) {
  return path.join(__dirname, "uploads", "client-files", `company-${Number(companyId || 0)}`, `client-${Number(clientId || 0)}`);
}

function resolveDmsClientStoredPath(companyId, clientId, relativePath = "") {
  const expectedPrefix = `company-${Number(companyId || 0)}/client-${Number(clientId || 0)}/`;
  const normalizedRelativePath = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalizedRelativePath.startsWith(expectedPrefix)) return "";

  const storageRoot = path.resolve(path.join(__dirname, "uploads", "client-files"));
  const absolutePath = path.resolve(storageRoot, normalizedRelativePath);
  return absolutePath.startsWith(storageRoot + path.sep) ? absolutePath : "";
}

function isClientRoleUser(user) {
  return String(user?.role || "").trim().toLowerCase() === "client";
}

function requireClientPortal(req, res, next) {
  if (!isClientRoleUser(req.session?.user)) return res.status(403).send("Forbidden");
  return next();
}

function getClientPortalContext(user = {}) {
  const companyId = Number(user.company_id || 0);
  const clientId = Number(user.client_id || 0);
  if (!companyId || !clientId) {
    return { companyId, clientId, client: null };
  }
  const client = db.prepare(`
    SELECT id, name, cui, address
    FROM clients
    WHERE id=? AND company_id=?
  `).get(clientId, companyId) || null;
  return { companyId, clientId, client };
}

function resolveAppDocumentPath(relativePath = "") {
  const normalized = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized) return "";

  const allowedPrefixes = ["contracts/", "uploads/", "public/uploads/"];
  if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) return "";

  const appRoot = path.resolve(__dirname);
  const publicRoot = path.resolve(path.join(__dirname, "public"));
  const candidates = normalized.startsWith("uploads/")
    ? [path.resolve(path.join(publicRoot, normalized)), path.resolve(path.join(appRoot, normalized))]
    : [path.resolve(path.join(appRoot, normalized)), path.resolve(path.join(publicRoot, normalized))];
  return candidates.find((candidate) =>
    (candidate === appRoot || candidate.startsWith(appRoot + path.sep)) && fs.existsSync(candidate)
  ) || "";
}

function resolveProjectStoredPath(companyId, projectId, storedPath = "") {
  const expectedPrefix = `company-${Number(companyId || 0)}/project-${Number(projectId || 0)}/`;
  const normalizedRelativePath = String(storedPath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalizedRelativePath.startsWith(expectedPrefix)) return "";

  const storageRoot = path.resolve(path.join(__dirname, "uploads", "projects"));
  const absolutePath = path.resolve(storageRoot, normalizedRelativePath);
  return absolutePath.startsWith(storageRoot + path.sep) && fs.existsSync(absolutePath) ? absolutePath : "";
}

function collectClientPortalDocuments(companyId, clientId) {
  const documents = [];

  db.prepare(`
    SELECT id, title, category, original_file_name, created_at
    FROM dms_client_files
    WHERE client_id=? AND company_id=? AND archived_at IS NULL
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: row.category || "ALTELE",
    title: row.title,
    kind: "Fișier încărcat",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    downloadHref: `/nexora/client-portal/dms-files/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, contract_number, pdf_path, created_at
    FROM contracts
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "CONTRACTE",
    title: `Contract ${row.contract_number || ""}`,
    kind: "Contract",
    fileName: row.pdf_path,
    createdAt: row.created_at,
    downloadHref: `/nexora/client-portal/contracts/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, quote_number, title, pdf_path, created_at
    FROM quotes
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "OFERTE",
    title: row.title || `Ofertă ${row.quote_number || ""}`,
    kind: "Ofertă",
    fileName: row.pdf_path,
    createdAt: row.created_at,
    downloadHref: `/nexora/client-portal/quotes/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, factura_nr, pdf_path, created_at
    FROM facturi
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "FACTURI",
    title: `Factură ${row.factura_nr || ""}`,
    kind: "Factură",
    fileName: row.pdf_path,
    createdAt: row.created_at,
    downloadHref: `/nexora/client-portal/invoices/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, title, category, file_name, file_path, created_at
    FROM tipizate_docs
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(file_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "TIPIZATE",
    title: row.title,
    kind: row.category || "Tipizat",
    fileName: row.file_name,
    createdAt: row.created_at,
    downloadHref: `/nexora/client-portal/tipizate/${row.id}/download`
  }));

  db.prepare(`
    SELECT id, title, output_file_name, template_type, created_at
    FROM dms_autofill_documents
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(output_file_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "FORMULARE",
    title: row.title,
    kind: row.template_type || "Completat automat",
    fileName: row.output_file_name,
    createdAt: row.created_at,
    downloadHref: `/nexora/client-portal/autofill/${row.id}/download`
  }));

  db.prepare(`
    SELECT pf.id, pf.project_id, pf.original_file_name, pf.category, pf.created_at, p.title AS project_title
    FROM project_files pf
    JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id
    WHERE pf.company_id=? AND p.client_id=?
  `).all(companyId, clientId).forEach((row) => documents.push({
    category: "PROIECTE",
    title: `${row.project_title || "Proiect"} - ${row.original_file_name || "Fișier"}`,
    kind: row.category || "Proiect",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    openHref: `/nexora/client-portal/projects/${row.project_id}`,
    downloadHref: `/nexora/client-portal/projects/${row.project_id}/files/${row.id}/download`
  }));

  return documents.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

function sendClientPortalFile(res, absolutePath, downloadName = "document") {
  if (!absolutePath || !fs.existsSync(absolutePath)) return res.status(404).send("Fișierul nu a fost găsit.");
  return res.download(absolutePath, String(downloadName || "document"));
}

function backfillTipizateRegisterForCompany(companyId, req) {
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) return;

  const docs = db.prepare(`
    SELECT d.id
    FROM tipizate_docs d
    WHERE d.company_id=?
      AND NOT EXISTS (
        SELECT 1 FROM tipizate_register r
        WHERE r.company_id=d.company_id AND r.doc_id=d.id
      )
    ORDER BY COALESCE(d.created_at, ''), d.id ASC
  `).all(normalizedCompanyId);

  for (const doc of docs) {
    registerTipizateDocument(doc.id, normalizedCompanyId, req);
  }
}

function getTipizateRegisterSummary(companyId) {
  const normalizedCompanyId = Number(companyId || 0);
  const year = new Date().getFullYear();
  const total = db.prepare(`
    SELECT COUNT(*) AS n
    FROM tipizate_register
    WHERE company_id=?
  `).get(normalizedCompanyId)?.n || 0;
  const active = db.prepare(`
    SELECT COUNT(*) AS n
    FROM tipizate_register
    WHERE company_id=? AND COALESCE(status, 'ACTIV') <> 'STERS'
  `).get(normalizedCompanyId)?.n || 0;
  const nextSeq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM tipizate_register
    WHERE company_id=? AND year=?
  `).get(normalizedCompanyId, year)?.next_seq || 1);
  return {
    total,
    active,
    year,
    nextSeq,
    nextNumber: formatTipizateRegistrationNumber(year, nextSeq)
  };
}

function renderTipizateRegisterRows(rows, emptyColspan = 11) {
  if (!rows.length) {
    return `<tr><td colspan="${emptyColspan}"><em>Nu există înregistrări.</em></td></tr>`;
  }

  return rows.map((row) => {
    const canOpen = row.file_path && String(row.status || "ACTIV").toUpperCase() !== "STERS";
    return `
      <tr>
        <td><span class="crm-badge crm-badge-blue">${escapeHtml(row.registration_number || "")}</span></td>
        <td>${escapeHtml(row.issued_at || row.created_at || "")}</td>
        <td>${tipizateRegisterTypeBadge(row.entry_type)}</td>
        <td>${escapeHtml(row.doc_title || "")}</td>
        <td>${escapeHtml(row.doc_category || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(row.recipient || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(row.file_name || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(row.notes || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${tipizateRegisterStatusBadge(row.status)}</td>
        <td>${escapeHtml(row.created_by_email || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${canOpen ? `<a href="/${encodeURI(row.file_path)}" target="_blank">Deschide</a>` : `<span class="crm-muted">—</span>`}</td>
      </tr>
    `;
  }).join("");
}

function parseJsonArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [...fallback];
  } catch {
    return [...fallback];
  }
}

function getUserFavoriteModules(userEmail, allowedModules = []) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return [];

  const allowedSet = new Set((allowedModules || []).map(String));
  const saved = parseJsonArray(getSetting(`user_erp_favorites:${normalizedEmail}`, "[]"), []);
  return saved.filter((moduleKey) => allowedSet.has(moduleKey));
}

function setUserFavoriteModules(userEmail, favoriteModules = []) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return [];

  const nextFavorites = [...new Set((favoriteModules || []).map((moduleKey) => String(moduleKey || "").trim()).filter(Boolean))];
  setSetting(`user_erp_favorites:${normalizedEmail}`, JSON.stringify(nextFavorites));
  return nextFavorites;
}

function getCompanySubscriptionContext(companyId) {
  const company = db.prepare(`
    SELECT id, name, cui, rc, address, bank, iban, representative, status, max_users, is_demo, demo_expires_at
    FROM companies
    WHERE id=?
  `).get(companyId) || null;

  const subscription = db.prepare(`
    SELECT
      cs.id,
      cs.company_id,
      cs.plan_id,
      cs.status,
      cs.seats_included,
      cs.seats_used,
      cs.module_overrides,
      cs.stripe_subscription_id,
      cs.stripe_checkout_session_id,
      cs.stripe_price_id,
      cs.billing_currency,
      cs.billing_email,
      cs.current_period_end,
      cs.last_payment_status,
      p.code AS plan_code,
      p.name AS plan_name,
      p.pricing_model,
      p.price_monthly,
      p.max_users AS plan_max_users,
      p.max_modules_per_user,
      p.max_active_modules,
      p.module_keys AS plan_module_keys,
      p.tagline,
      p.description,
      p.features_json,
      p.support_copy,
      p.extra_dev_copy,
      p.image_path
    FROM company_subscriptions cs
    JOIN plans p ON p.id = cs.plan_id
    WHERE cs.company_id=?
    ORDER BY cs.id DESC
    LIMIT 1
  `).get(companyId) || null;

  const plans = db.prepare(`
    SELECT
      id, code, name, billing_period, pricing_model, price_monthly, max_users,
      max_modules_per_user, max_active_modules, module_keys, tagline, description,
      features_json, support_copy, extra_dev_copy, image_path
    FROM plans
    WHERE status='active'
      AND COALESCE(is_public, 1) = 1
    ORDER BY COALESCE(sort_order, 100) ASC, price_monthly ASC, id ASC
  `).all();

  const companyIsDemo = Number(company?.is_demo || 0) === 1;
  const rawPlanModules = parseJsonArray(subscription?.plan_module_keys, MODULE_DEFINITIONS.map((item) => item.key));
  const planModules = normalizeCompanyModules(rawPlanModules, rawPlanModules, { max_active_modules: 0 }, { companyIsDemo });
  const moduleOverrides = parseJsonArray(subscription?.module_overrides, planModules);
  const activeModules = normalizeCompanyModules(
    moduleOverrides.length ? moduleOverrides : planModules,
    planModules,
    subscription || {},
    { companyIsDemo }
  );

  return { company, subscription, plans, planModules, moduleOverrides, activeModules };
}

const MODULE_GROUP_META = {
  core: ["Bază workspace", "Dashboard și administrarea minimă a companiei."],
  operations: ["Module operaționale", "Zonele de lucru activate prin contractul companiei."],
  advanced: ["Extensii Nexora", "Module avansate, automatizări și zone pregătite pentru extindere."]
};

function isCoreCompanyModule(moduleKey = "") {
  return CORE_ALWAYS_INCLUDED_MODULES.includes(String(moduleKey || "").trim());
}

function countOptionalCompanyModules(moduleKeys = []) {
  return (moduleKeys || []).filter((moduleKey) => !isCoreCompanyModule(moduleKey)).length;
}

function buildCompanyModuleGroups(companyContext = {}) {
  const activeModuleSet = new Set(companyContext.activeModules || []);
  const planModuleSet = new Set(companyContext.planModules || []);

  return Object.entries(MODULE_GROUPS).map(([groupKey, moduleKeys]) => {
    const [label, description] = MODULE_GROUP_META[groupKey] || [groupKey, ""];
    const modules = moduleKeys.map((moduleKey) => {
      const def = MODULE_DEFINITIONS.find((item) => item.key === moduleKey);
      const includedByPlan = planModuleSet.has(moduleKey);
      const active = activeModuleSet.has(moduleKey);
      const isCoreModule = isCoreCompanyModule(moduleKey);

      return {
        key: moduleKey,
        label: def?.label || moduleKey,
        includedByPlan,
        active,
        isCoreModule,
        copy: includedByPlan
          ? (isCoreModule ? "Inclus implicit pentru administrarea workspace-ului." : "Disponibil în contractul companiei.")
          : "Indisponibil în planul curent."
      };
    });

    return {
      key: groupKey,
      label,
      description,
      modules,
      activeCount: modules.filter((item) => item.active).length,
      totalCount: modules.length
    };
  });
}

function refreshSessionCompanyAccess(req) {
  const companyId = Number(req.session?.user?.company_id || 0);
  const userId = Number(req.session?.user?.id || 0);
  if (!companyId || !userId) return;

  const userRow = db.prepare(`
    SELECT role, module_permissions, is_company_admin, client_id
    FROM users
    WHERE id=? AND company_id=?
  `).get(userId, companyId);
  if (!userRow) return;

  const { company, subscription, activeModules } = getCompanySubscriptionContext(companyId);
  const assignedModules = parseJsonArray(userRow.module_permissions, []);
  const effectiveModules = Number(req.session?.user?.is_super_admin || 0)
    ? MODULE_DEFINITIONS.map((item) => item.key)
    : normalizeUserModules(
        assignedModules,
        activeModules,
        subscription || {},
        ROLE_MODULES[String(userRow.role || "").trim().toLowerCase()] || [],
        { companyIsDemo: Number(company?.is_demo || 0) === 1 }
      );

  req.session.user.company_name = company?.name || req.session.user.company_name || null;
  req.session.user.client_id = userRow.client_id || null;
  req.session.user.company_is_demo = Number(company?.is_demo || 0);
  req.session.user.demo_expires_at = company?.demo_expires_at || null;
  req.session.user.is_company_admin = Number(userRow.is_company_admin || 0);
  req.session.user.module_permissions = effectiveModules;
  req.session.user.effective_module_permissions = effectiveModules;
  req.session.user.subscription = subscription ? {
    id: subscription.id,
    plan_code: subscription.plan_code,
    plan_name: subscription.plan_name,
    pricing_model: subscription.pricing_model,
    price_monthly: subscription.price_monthly,
    max_modules_per_user: subscription.max_modules_per_user,
    max_active_modules: subscription.max_active_modules,
    seats_included: subscription.seats_included,
    seats_used: subscription.seats_used
  } : null;
}

function syncCompanySeatUsage(companyId) {
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) return;

  db.prepare(`
    UPDATE company_subscriptions
    SET seats_used=(SELECT COUNT(*) FROM users WHERE company_id=?),
        updated_at=datetime('now')
    WHERE id = (
      SELECT id
      FROM company_subscriptions
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 1
    )
  `).run(normalizedCompanyId, normalizedCompanyId);
}

function companySeatSummary(companyId) {
  const companyContext = getCompanySubscriptionContext(companyId);
  const seatsUsed = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id=?`).get(companyId)?.n || 0;
  const seatsIncluded = Math.max(Number(companyContext.subscription?.seats_included ?? companyContext.company?.max_users ?? 1), 1);
  return {
    ...companyContext,
    seatsUsed,
    seatsIncluded
  };
}

function loadCompanyClients(companyId) {
  return db.prepare(`
    SELECT id, name, cui
    FROM clients
    WHERE company_id=? AND COALESCE(inactive, 0)=0
    ORDER BY name COLLATE NOCASE ASC
    LIMIT 1000
  `).all(Number(companyId || 0));
}

function resolveUserClientAssignment(companyId, roleKey, rawClientId) {
  if (String(roleKey || "").trim().toLowerCase() !== "client") return { ok: true, clientId: null };
  const clientId = Number(rawClientId || 0);
  if (!Number.isFinite(clientId) || clientId < 1) {
    return { ok: false, message: "Selecteaza clientul asociat pentru rolul Client." };
  }
  const client = db.prepare("SELECT id FROM clients WHERE id=? AND company_id=?").get(clientId, Number(companyId || 0));
  if (!client) {
    return { ok: false, message: "Clientul asociat nu exista in compania curenta." };
  }
  return { ok: true, clientId: Number(client.id) };
}

function resyncCompanyUserModules(companyId) {
  const companyContext = getCompanySubscriptionContext(companyId);
  const users = db.prepare(`
    SELECT id, role, module_permissions
    FROM users
    WHERE company_id=?
  `).all(companyId);

  const syncUsers = db.transaction(() => {
    for (const user of users) {
      const roleKey = String(user.role || "").trim().toLowerCase();
      const roleModules = Array.isArray(ROLE_MODULES[roleKey]) ? ROLE_MODULES[roleKey] : [];
      const requestedModules = roleKey === "admin"
        ? roleModules
        : parseJsonArray(user.module_permissions, roleModules);
      const effectiveModules = normalizeUserModules(
        requestedModules.length ? requestedModules : roleModules,
        companyContext.activeModules,
        companyContext.subscription || {},
        roleModules,
        { companyIsDemo: Number(companyContext.company?.is_demo || 0) === 1 }
      );

      db.prepare(`
        UPDATE users
        SET module_permissions=?,
            is_company_admin=?
        WHERE id=?
      `).run(JSON.stringify(effectiveModules), roleKey === "admin" ? 1 : 0, user.id);
    }
  });

  syncUsers();
}

function removeStoredCompanyFile(relativePath) {
  const normalized = String(relativePath || "").trim().replace(/^\/+/, "");
  if (!normalized) return;

  const candidatePaths = [
    path.join(__dirname, normalized),
    path.join(__dirname, "public", normalized)
  ];

  for (const absolutePath of candidatePaths) {
    if (!fs.existsSync(absolutePath)) continue;
    try {
      if (fs.statSync(absolutePath).isFile()) {
        fs.unlinkSync(absolutePath);
      }
    } catch {
      // Ignore missing or locked files during tenant cleanup.
    }
  }
}

function deleteCompanyWorkspace(companyId) {
  const normalizedCompanyId = Number(companyId || 0);
  if (!normalizedCompanyId) return;

  const fileSources = [
    { table: "contracts", columns: ["pdf_path"] },
    { table: "quotes", columns: ["pdf_path"] },
    { table: "facturi", columns: ["pdf_path", "efactura_xml_path", "efactura_response_zip_path"] },
    { table: "tipizate_docs", columns: ["file_path"] },
    { table: "accounting_expenses", columns: ["attachment_path"] },
    { table: "accounting_declarations", columns: ["attachment_path", "receipt_path"] },
    { table: "anaf_inbox", columns: ["xml_path", "pdf_path", "zip_path"] }
  ];

  for (const source of fileSources) {
    const availableColumns = db.prepare(`PRAGMA table_info(${source.table})`).all().map((column) => column.name);
    const selectedColumns = source.columns.filter((columnName) => availableColumns.includes(columnName));
    if (!selectedColumns.length) continue;

    const rows = db.prepare(`
      SELECT ${selectedColumns.join(", ")}
      FROM ${source.table}
      WHERE company_id=?
    `).all(normalizedCompanyId);

    for (const row of rows) {
      for (const columnName of selectedColumns) {
        removeStoredCompanyFile(row?.[columnName]);
      }
    }
  }

  const anafInboxDir = path.join(__dirname, "public", "uploads", "anaf", "inbox", `company-${normalizedCompanyId}`);
  if (fs.existsSync(anafInboxDir)) {
    fs.rmSync(anafInboxDir, { recursive: true, force: true });
  }
  const dmsAutofillDir = dmsAutofillStorageDirectory(normalizedCompanyId);
  if (fs.existsSync(dmsAutofillDir)) {
    fs.rmSync(dmsAutofillDir, { recursive: true, force: true });
  }
  const projectsDir = path.join(__dirname, "uploads", "projects", `company-${normalizedCompanyId}`);
  if (fs.existsSync(projectsDir)) {
    fs.rmSync(projectsDir, { recursive: true, force: true });
  }
  const clientFilesDir = path.join(__dirname, "uploads", "client-files", `company-${normalizedCompanyId}`);
  if (fs.existsSync(clientFilesDir)) {
    fs.rmSync(clientFilesDir, { recursive: true, force: true });
  }

  const companyScopedTables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
      AND name <> 'companies'
      AND name <> 'plans'
      AND name <> 'app_settings'
  `).all()
    .map((row) => row.name)
    .filter((tableName) => db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === "company_id"));

  db.exec("PRAGMA foreign_keys=off");
  try {
    const cleanupTenant = db.transaction(() => {
      for (const tableName of companyScopedTables) {
        db.prepare(`DELETE FROM ${tableName} WHERE company_id=?`).run(normalizedCompanyId);
      }
      db.prepare(`DELETE FROM companies WHERE id=?`).run(normalizedCompanyId);
    });
    cleanupTenant();
  } finally {
    db.exec("PRAGMA foreign_keys=on");
  }
}

app.post("/ui/favorites", requireAuth, (req, res) => {
  const userEmail = String(req.session?.user?.email || "").trim().toLowerCase();
  if (!userEmail) {
    return res.status(400).json({ ok: false, error: "Utilizator invalid." });
  }

  const availableErpModules = getErpWorkspaceModules("", req.session?.user?.module_permissions || []).map((module) => module.moduleKey);
  const allowedSet = new Set(availableErpModules);
  const requestedFavorites = Array.isArray(req.body?.favorites)
    ? req.body.favorites
    : typeof req.body?.favorites === "string"
      ? [req.body.favorites]
      : [];
  const nextFavorites = requestedFavorites
    .map((moduleKey) => String(moduleKey || "").trim())
    .filter((moduleKey) => allowedSet.has(moduleKey));

  const savedFavorites = setUserFavoriteModules(userEmail, nextFavorites);
  return res.json({ ok: true, favorites: savedFavorites });
});

function logCompanyAdminEvent({ companyId, actorUserId, actorEmail, eventType, statusFrom = "", statusTo = "", reason = "" }) {
  if (!companyId || !eventType) return;
  db.prepare(`
    INSERT INTO company_admin_events (company_id, actor_user_id, actor_email, event_type, status_from, status_to, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    actorUserId || null,
    String(actorEmail || ""),
    String(eventType || ""),
    String(statusFrom || ""),
    String(statusTo || ""),
    String(reason || "").trim()
  );
}

function findCompanyByCui(cui) {
  const normalizedCui = normalizeCui(cui);
  if (!normalizedCui) return null;
  return db.prepare(`
    SELECT id, name, cui
    FROM companies
    WHERE COALESCE(cui, '') <> ''
    ORDER BY id DESC
  `).all().find((company) => normalizeCui(company.cui) === normalizedCui) || null;
}

function companyStatusBadge(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return `<span class="crm-badge crm-badge-green">active</span>`;
  if (value === "trial") return `<span class="crm-badge crm-badge-blue">trial</span>`;
  if (value === "past_due") return `<span class="crm-badge crm-badge-amber">past due</span>`;
  if (value === "suspended") return `<span class="crm-badge crm-badge-red">suspended</span>`;
  return `<span class="crm-badge crm-badge-neutral">${escapeHtml(status || "—")}</span>`;
}

function paymentSourceBadge(source) {
  const value = String(source || "").toLowerCase();
  if (value === "stripe") return `<span class="crm-badge crm-badge-blue">Stripe</span>`;
  if (value === "op") return `<span class="crm-badge crm-badge-amber">OP</span>`;
  return `<span class="crm-badge crm-badge-neutral">${escapeHtml(source || "—")}</span>`;
}

function paymentStatusBadge(status) {
  const value = String(status || "").toLowerCase();
  if (value === "paid") return `<span class="crm-badge crm-badge-green">reușită</span>`;
  if (value === "failed") return `<span class="crm-badge crm-badge-red">eșuată</span>`;
  if (value === "processing") return `<span class="crm-badge crm-badge-blue">în procesare</span>`;
  if (value === "pending_verification") return `<span class="crm-badge crm-badge-amber">așteaptă verificare</span>`;
  if (value === "initiated") return `<span class="crm-badge crm-badge-neutral">inițiată</span>`;
  return `<span class="crm-badge crm-badge-neutral">${escapeHtml(status || "—")}</span>`;
}

function syncManualPaymentToSubscription(companyId, paymentStatus) {
  const normalizedStatus = String(paymentStatus || "").trim().toLowerCase();
  if (!companyId || !normalizedStatus) return;

  const currentSubscription = db.prepare(`
    SELECT id
    FROM company_subscriptions
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);

  if (!currentSubscription) return;

  if (normalizedStatus === "paid") {
    db.prepare(`
      UPDATE company_subscriptions
      SET status='active',
          last_payment_status='manual_paid',
          updated_at=datetime('now')
      WHERE id=?
    `).run(currentSubscription.id);

    db.prepare(`
      UPDATE companies
      SET status='active',
          updated_at=datetime('now')
      WHERE id=? AND archived_at IS NULL
    `).run(companyId);
    return;
  }

  if (normalizedStatus === "failed") {
    db.prepare(`
      UPDATE company_subscriptions
      SET status='past_due',
          last_payment_status='manual_failed',
          updated_at=datetime('now')
      WHERE id=?
    `).run(currentSubscription.id);

    db.prepare(`
      UPDATE companies
      SET status='past_due',
          updated_at=datetime('now')
      WHERE id=? AND archived_at IS NULL
    `).run(companyId);
    return;
  }

  if (normalizedStatus === "pending_verification") {
    db.prepare(`
      UPDATE company_subscriptions
      SET last_payment_status='manual_pending_verification',
          updated_at=datetime('now')
      WHERE id=?
    `).run(currentSubscription.id);
  }
}


app.get("/tipizate", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const docs = db.prepare(`
    SELECT id, title, category, file_name, file_path, mime_type,
           registration_number, registered_at, created_at
    FROM tipizate_docs
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 300
  `).all(companyId);
  const registerSummary = getTipizateRegisterSummary(companyId);

  let employees = [];
  const hasEmployeesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'").get();
  if (hasEmployeesTable) {
    employees = db.prepare(`
      SELECT id, name, email, phone, position
      FROM employees
      WHERE active=1 AND company_id=?
      ORDER BY name COLLATE NOCASE ASC
    `).all(companyId);
  }

  const employeeOptions = employees.map(e => `<option value="${e.id}">${escapeHtml(e.name || "")}${e.position ? ` — ${escapeHtml(e.position)}` : ""}</option>`).join("");

  const htmlRows = docs.map(d => `
    <tr>
      <td>
        <div style="font-weight:800">${escapeHtml(d.title || "")}</div>
      </td>
      <td>${d.registration_number ? `<span class="crm-badge crm-badge-blue">${escapeHtml(d.registration_number)}</span>` : `<span class="crm-muted">—</span>`}</td>
      <td>${escapeHtml(d.category || "") || `<span class="crm-muted">—</span>`}</td>
      <td>${escapeHtml(d.file_name || "")}</td>
      <td>${escapeHtml(d.created_at || "")}</td>
      <td>${escapeHtml(d.registered_at || "") || `<span class="crm-muted">—</span>`}</td>
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/${encodeURI(d.file_path)}" target="_blank">Deschide</a>
          <form method="post" action="/tipizate/${d.id}/delete" style="margin:0" onsubmit="return confirm('Ștergi documentul? Numărul din registru rămâne păstrat.');">
            <button class="crm-btn crm-btn-danger" type="submit">Șterge</button>
          </form>
        </div>
      </td>
    </tr>
  `).join("");

  res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Tipizate</title>
</head>
${crmShellStart("tipizate", "Tipizate", "Template-uri interne, documente PDF și registru de evidență pentru acte ieșite.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <section class="crm-card" style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0;font-size:20px">Registru de evidență</h3>
        <div class="crm-muted" style="margin-top:6px">Următorul număr disponibil: <b>${escapeHtml(registerSummary.nextNumber)}</b>. Registrul complet este în submeniul Tipizate.</div>
      </div>
      <a class="crm-btn crm-btn-secondary" href="/tipizate/registru">Deschide registrul</a>
    </div>
  </section>

  <div class="crm-grid-2" style="overflow:visible;margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Modele generate</h3>
        <div class="crm-muted" style="margin-top:6px">Documente generate direct din aplicație.</div>
      </div>

      <div class="crm-stack">

        <a href="/tipizate/proces-verbal" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Proces verbal</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru proces verbal.</div>
          </div>
        </a>

        <a href="/tipizate/adeverinta" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Adeverință salariat</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru adeverință.</div>
          </div>
        </a>

        <a href="/tipizate/decizie-interna" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Decizie internă</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru decizie internă.</div>
          </div>
        </a>

        <a href="/tipizate/notificare-client" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Notificare client</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru notificare client.</div>
          </div>
        </a>

        <a href="/tipizate/cerere-concediu" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Cerere concediu</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru cerere concediu.</div>
          </div>
        </a>

        <a href="/tipizate/ordin-deplasare" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Ordin de deplasare</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru ordin de deplasare.</div>
          </div>
        </a>

        <a href="/tipizate/fisa-hr" style="text-decoration:none">
          <div class="crm-card">
            <div style="font-weight:800">Fișă HR</div>
            <div class="crm-muted" style="margin-top:6px">Deschide formularul editabil pentru fișă HR.</div>
          </div>
        </a>

      </div>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Încarcă PDF</h3>
        <div class="crm-muted" style="margin-top:6px">Adaugă manual documente PDF în biblioteca de tipizate.</div>
      </div>

      <form method="post" action="/tipizate/upload" enctype="multipart/form-data" class="crm-stack">
        <div>
          <label class="crm-label">Titlu document</label>
          <input class="crm-input" name="title" required placeholder="Ex: Proces verbal recepție">
        </div>

        <div>
          <label class="crm-label">Categorie</label>
          <select class="crm-select" name="category">
            <option value="PROCES_VERBAL">PROCES_VERBAL</option>
            <option value="ADEVERINTA">ADEVERINTA</option>
            <option value="DECIZIE_INTERNA">DECIZIE_INTERNA</option>
            <option value="NOTIFICARE_CLIENT">NOTIFICARE_CLIENT</option>
            <option value="CERERE_CONCEDIU">CERERE_CONCEDIU</option>
            <option value="ORDIN_DE_DEPLASARE">ORDIN_DE_DEPLASARE</option>
            <option value="FISE_HR">FISE_HR</option>
            <option value="CONTRACT">CONTRACT</option>
            <option value="HR">HR</option>
            <option value="ALTELE">ALTELE</option>
          </select>
        </div>

        <div>
          <label class="crm-label">Fișier PDF</label>
          <input class="crm-input" type="file" name="pdf" accept="application/pdf,.pdf" required>
        </div>

        <div>
          <button class="crm-btn" type="submit">Upload PDF</button>
        </div>
      </form>
    </section>
  </div>

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">PDF-uri încărcate</h3>
        <div class="crm-muted" style="margin-top:6px">Biblioteca documentelor tipizate încărcate manual sau generate.</div>
      </div>
      <div class="crm-badge crm-badge-blue">${escapeHtml(String(docs.length))} documente</div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Titlu</th>
            <th>Nr. înregistrare</th>
            <th>Categorie</th>
            <th>Fișier</th>
            <th>Creat</th>
            <th>Înregistrat</th>
            <th>Acțiune</th>
          </tr>
        </thead>
        <tbody>${htmlRows || `<tr><td colspan="7"><em>Nu există documente încărcate.</em></td></tr>`}</tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
});

app.get("/nexora/documents", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const isCompanyAdmin = isCompanyAdminUser(req.session.user);
  const docs = db.prepare(`
    SELECT id, title, category, file_name, file_path, mime_type,
           registration_number, registered_at, created_at
    FROM tipizate_docs
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 300
  `).all(companyId);
  const autofillDocuments = db.prepare(`
    SELECT d.id, d.title, d.source_file_name, d.output_file_name, d.output_mime_type,
           d.template_type, d.matched_fields, d.replacement_count, d.created_by_email,
           d.created_at, r.registration_number
    FROM dms_autofill_documents d
    LEFT JOIN tipizate_register r
      ON r.company_id=d.company_id
     AND r.file_path=('nexora/documents/autofill/' || d.id || '/download')
     AND COALESCE(r.status, 'ACTIV') <> 'STERS'
    WHERE d.company_id=?
    ORDER BY d.id DESC
    LIMIT 100
  `).all(companyId).map((document) => ({
    ...document,
    matchedFields: parseJsonArray(document.matched_fields, [])
  }));
  const summary = getTipizateRegisterSummary(companyId);
  const clients = isCompanyAdmin ? db.prepare(`
    SELECT id, name, cui
    FROM clients
    WHERE company_id=?
    ORDER BY name COLLATE NOCASE ASC
  `).all(companyId) : [];

  return res.type("html").send(renderNexoraDocumentsPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    docs,
    autofillDocuments,
    autofillProfile: getDmsAutofillProfile(companyId),
    isCompanyAdmin,
    clients,
    summary,
    ok: String(req.query?.ok || ""),
    err: String(req.query?.err || "")
  }));
});

app.get("/nexora/documents/client-files", requireAuth, requireCompanyAdmin, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const q = String(req.query?.q || "").trim();
  const params = [companyId];
  const searchSql = q ? "AND (LOWER(cl.name) LIKE ? OR LOWER(COALESCE(cl.cui,'')) LIKE ?)" : "";
  if (q) {
    const token = `%${q.toLowerCase()}%`;
    params.push(token, token);
  }
  const rows = db.prepare(`
    SELECT cl.id, cl.name, cl.cui,
      (SELECT COUNT(*) FROM contracts ct WHERE ct.company_id=cl.company_id AND ct.client_id=cl.id AND TRIM(COALESCE(ct.pdf_path,'')) <> '') AS contracts_count,
      (SELECT COUNT(*) FROM quotes qt WHERE qt.company_id=cl.company_id AND qt.client_id=cl.id AND TRIM(COALESCE(qt.pdf_path,'')) <> '') AS quotes_count,
      (SELECT COUNT(*) FROM facturi f WHERE f.company_id=cl.company_id AND f.client_id=cl.id AND TRIM(COALESCE(f.pdf_path,'')) <> '') AS invoices_count,
      (
        (SELECT COUNT(*) FROM dms_client_files df WHERE df.company_id=cl.company_id AND df.client_id=cl.id AND df.archived_at IS NULL)
        + (SELECT COUNT(*) FROM tipizate_docs td WHERE td.company_id=cl.company_id AND td.client_id=cl.id)
        + (SELECT COUNT(*) FROM dms_autofill_documents da WHERE da.company_id=cl.company_id AND da.client_id=cl.id)
        + (SELECT COUNT(*) FROM project_files pf JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id WHERE pf.company_id=cl.company_id AND p.client_id=cl.id)
      ) AS files_count,
      (
        (SELECT COUNT(*) FROM contracts ct WHERE ct.company_id=cl.company_id AND ct.client_id=cl.id AND TRIM(COALESCE(ct.pdf_path,'')) <> '')
        + (SELECT COUNT(*) FROM quotes qt WHERE qt.company_id=cl.company_id AND qt.client_id=cl.id AND TRIM(COALESCE(qt.pdf_path,'')) <> '')
        + (SELECT COUNT(*) FROM facturi f WHERE f.company_id=cl.company_id AND f.client_id=cl.id AND TRIM(COALESCE(f.pdf_path,'')) <> '')
        + (SELECT COUNT(*) FROM dms_client_files df WHERE df.company_id=cl.company_id AND df.client_id=cl.id AND df.archived_at IS NULL)
        + (SELECT COUNT(*) FROM tipizate_docs td WHERE td.company_id=cl.company_id AND td.client_id=cl.id)
        + (SELECT COUNT(*) FROM dms_autofill_documents da WHERE da.company_id=cl.company_id AND da.client_id=cl.id)
        + (SELECT COUNT(*) FROM project_files pf JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id WHERE pf.company_id=cl.company_id AND p.client_id=cl.id)
      ) AS documents_count
    FROM clients cl
    WHERE cl.company_id=? ${searchSql}
    ORDER BY cl.name COLLATE NOCASE ASC
  `).all(...params);

  return res.type("html").send(renderNexoraClientDossiersPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    rows,
    q
  }));
});

app.get("/nexora/client-portal", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) {
    return res.type("html").send(renderNexoraClientPortalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      missingAssignment: true
    }));
  }

  const projects = db.prepare(`
    SELECT p.*,
           COUNT(t.id) AS total_tasks,
           SUM(CASE WHEN t.id IS NOT NULL AND t.status <> 'FINALIZAT' THEN 1 ELSE 0 END) AS open_tasks
    FROM projects p
    LEFT JOIN project_tasks t ON t.project_id=p.id AND t.company_id=p.company_id
    WHERE p.company_id=? AND p.client_id=?
    GROUP BY p.id
    ORDER BY
      CASE p.status WHEN 'BLOCAT' THEN 0 WHEN 'ACTIV' THEN 1 WHEN 'PLANIFICARE' THEN 2 ELSE 3 END,
      COALESCE(p.due_date, '9999-12-31') ASC, p.id DESC
  `).all(companyId, clientId);
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM projects WHERE company_id=? AND client_id=?) AS projects,
      (SELECT COUNT(*) FROM projects WHERE company_id=? AND client_id=? AND status IN ('ACTIV','IN_REVIZUIRE')) AS activeProjects,
      (SELECT COUNT(*) FROM project_tasks t JOIN projects p ON p.id=t.project_id AND p.company_id=t.company_id WHERE t.company_id=? AND p.client_id=? AND t.status <> 'FINALIZAT') AS openTasks
  `).get(companyId, clientId, companyId, clientId, companyId, clientId) || {};
  const documents = collectClientPortalDocuments(companyId, clientId);

  return res.type("html").send(renderNexoraClientPortalPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    client,
    projects,
    documents,
    stats
  }));
});

app.get("/nexora/client-portal/projects/:id", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const projectId = Number(req.params.id || 0);
  const project = db.prepare(`
    SELECT *
    FROM projects
    WHERE id=? AND company_id=? AND client_id=?
  `).get(projectId, companyId, clientId);
  if (!project) return res.status(404).send("Proiectul nu a fost găsit.");

  const tasks = db.prepare(`
    SELECT *
    FROM project_tasks
    WHERE project_id=? AND company_id=?
    ORDER BY CASE status WHEN 'BLOCAT' THEN 0 WHEN 'IN_LUCRU' THEN 1 WHEN 'DE_FACUT' THEN 2 ELSE 3 END,
             COALESCE(due_date, '9999-12-31'), id DESC
  `).all(projectId, companyId);
  const milestones = db.prepare(`
    SELECT *
    FROM project_milestones
    WHERE project_id=? AND company_id=?
    ORDER BY COALESCE(due_date, '9999-12-31'), id DESC
  `).all(projectId, companyId);
  const files = db.prepare(`
    SELECT *
    FROM project_files
    WHERE project_id=? AND company_id=?
    ORDER BY id DESC
  `).all(projectId, companyId);

  return res.type("html").send(renderNexoraClientPortalProjectPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    project,
    tasks,
    milestones,
    files
  }));
});

app.get("/nexora/client-portal/dms-files/:fileId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const fileId = Number(req.params.fileId || 0);
  const file = db.prepare(`
    SELECT original_file_name, stored_path
    FROM dms_client_files
    WHERE id=? AND client_id=? AND company_id=? AND archived_at IS NULL
  `).get(fileId, clientId, companyId);
  if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveDmsClientStoredPath(companyId, clientId, file.stored_path), file.original_file_name);
});

app.get("/nexora/client-portal/contracts/:contractId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const row = db.prepare(`
    SELECT contract_number, pdf_path
    FROM contracts
    WHERE id=? AND client_id=? AND company_id=?
  `).get(Number(req.params.contractId || 0), clientId, companyId);
  if (!row?.pdf_path) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveAppDocumentPath(row.pdf_path), `${safeStoredFileName(row.contract_number, "contract")}.pdf`);
});

app.get("/nexora/client-portal/quotes/:quoteId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const row = db.prepare(`
    SELECT quote_number, pdf_path
    FROM quotes
    WHERE id=? AND client_id=? AND company_id=?
  `).get(Number(req.params.quoteId || 0), clientId, companyId);
  if (!row?.pdf_path) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveAppDocumentPath(row.pdf_path), `${safeStoredFileName(row.quote_number, "oferta")}.pdf`);
});

app.get("/nexora/client-portal/invoices/:invoiceId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const row = db.prepare(`
    SELECT factura_nr, pdf_path
    FROM facturi
    WHERE id=? AND client_id=? AND company_id=?
  `).get(Number(req.params.invoiceId || 0), clientId, companyId);
  if (!row?.pdf_path) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveAppDocumentPath(row.pdf_path), `${safeStoredFileName(row.factura_nr, "factura")}.pdf`);
});

app.get("/nexora/client-portal/tipizate/:docId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const row = db.prepare(`
    SELECT file_name, file_path
    FROM tipizate_docs
    WHERE id=? AND client_id=? AND company_id=?
  `).get(Number(req.params.docId || 0), clientId, companyId);
  if (!row?.file_path) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveAppDocumentPath(row.file_path), row.file_name || "document");
});

app.get("/nexora/client-portal/autofill/:docId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const row = db.prepare(`
    SELECT output_file_name, output_file_path
    FROM dms_autofill_documents
    WHERE id=? AND client_id=? AND company_id=?
  `).get(Number(req.params.docId || 0), clientId, companyId);
  if (!row?.output_file_path) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveDmsAutofillStoredPath(companyId, row.output_file_path), row.output_file_name || "document");
});

app.get("/nexora/client-portal/projects/:projectId/files/:fileId/download", requireAuth, requireClientPortal, (req, res) => {
  const { companyId, clientId, client } = getClientPortalContext(req.session.user);
  if (!client) return res.status(403).send("Contul nu este asociat unui client.");
  const projectId = Number(req.params.projectId || 0);
  const fileId = Number(req.params.fileId || 0);
  const file = db.prepare(`
    SELECT pf.original_file_name, pf.stored_path
    FROM project_files pf
    JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id
    WHERE pf.id=? AND pf.project_id=? AND pf.company_id=? AND p.client_id=?
  `).get(fileId, projectId, companyId, clientId);
  if (!file) return res.status(404).send("Fișierul nu a fost găsit.");
  return sendClientPortalFile(res, resolveProjectStoredPath(companyId, projectId, file.stored_path), file.original_file_name || "document");
});

app.get("/nexora/documents/client-files/:clientId", requireAuth, requireCompanyAdmin, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const clientId = Number(req.params.clientId || 0);
  const client = db.prepare("SELECT id, name, cui, address FROM clients WHERE id=? AND company_id=?").get(clientId, companyId);
  if (!client) return res.status(404).send("Clientul nu a fost gasit.");

  const documents = [];
  db.prepare(`
    SELECT id, title, category, original_file_name, created_at
    FROM dms_client_files
    WHERE client_id=? AND company_id=? AND archived_at IS NULL
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: row.category || "ALTELE",
    title: row.title,
    kind: "Fișier încărcat",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    downloadHref: `/nexora/documents/client-files/${clientId}/uploads/${row.id}/download`
  }));
  db.prepare(`
    SELECT id, contract_number, pdf_path, created_at
    FROM contracts
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "CONTRACTE",
    title: `Contract ${row.contract_number || ""}`,
    kind: "Contract",
    fileName: row.pdf_path,
    createdAt: row.created_at,
    downloadHref: `/${row.pdf_path}`,
    openHref: `/nexora/contracts/${row.id}`
  }));
  db.prepare(`
    SELECT id, quote_number, title, pdf_path, created_at
    FROM quotes
    WHERE client_id=? AND company_id=? AND TRIM(COALESCE(pdf_path,'')) <> ''
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "OFERTE",
    title: row.title || `Ofertă ${row.quote_number || ""}`,
    kind: "Ofertă",
    fileName: row.pdf_path,
    createdAt: row.created_at,
    downloadHref: `/${row.pdf_path}`,
    openHref: `/nexora/quotes/${row.id}`
  }));
  db.prepare(`
    SELECT id, factura_nr, pdf_path, efactura_xml_path, efactura_response_zip_path, created_at
    FROM facturi
    WHERE client_id=? AND company_id=?
  `).all(clientId, companyId).forEach((row) => {
    if (row.pdf_path) documents.push({
      category: "FACTURI",
      title: `Factură ${row.factura_nr || ""}`,
      kind: "Factură PDF",
      fileName: row.pdf_path,
      createdAt: row.created_at,
      downloadHref: `/${row.pdf_path}`,
      openHref: `/nexora/facturi/${row.id}`
    });
    if (row.efactura_xml_path) documents.push({
      category: "E-FACTURA",
      title: `XML ${row.factura_nr || ""}`,
      kind: "XML e-Factura",
      fileName: row.efactura_xml_path,
      createdAt: row.created_at,
      downloadHref: `/nexora/documents/client-files/${clientId}/invoices/${row.id}/xml/download`,
      openHref: `/nexora/facturi/${row.id}`
    });
    if (row.efactura_response_zip_path) documents.push({
      category: "E-FACTURA",
      title: `Răspuns ANAF ${row.factura_nr || ""}`,
      kind: "Arhivă ANAF",
      fileName: row.efactura_response_zip_path,
      createdAt: row.created_at,
      downloadHref: `/nexora/facturi/${row.id}/efactura/raspuns`,
      openHref: `/nexora/facturi/${row.id}`
    });
  });
  db.prepare(`
    SELECT id, title, category, file_name, file_path, created_at
    FROM tipizate_docs
    WHERE client_id=? AND company_id=?
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "TIPIZATE",
    title: row.title,
    kind: row.category || "Tipizat",
    fileName: row.file_name,
    createdAt: row.created_at,
    downloadHref: `/${row.file_path}`
  }));
  db.prepare(`
    SELECT id, title, output_file_name, template_type, created_at
    FROM dms_autofill_documents
    WHERE client_id=? AND company_id=?
  `).all(clientId, companyId).forEach((row) => documents.push({
    category: "FORMULARE",
    title: row.title,
    kind: row.template_type || "Completat automat",
    fileName: row.output_file_name,
    createdAt: row.created_at,
    downloadHref: `/nexora/documents/autofill/${row.id}/download`
  }));
  db.prepare(`
    SELECT pf.id, pf.project_id, pf.original_file_name, pf.category, pf.created_at, p.title AS project_title
    FROM project_files pf
    JOIN projects p ON p.id=pf.project_id AND p.company_id=pf.company_id
    WHERE pf.company_id=? AND p.client_id=?
  `).all(companyId, clientId).forEach((row) => documents.push({
    category: "PROIECTE",
    title: `${row.project_title || "Proiect"} - ${row.original_file_name || "Fișier"}`,
    kind: row.category || "Proiect",
    fileName: row.original_file_name,
    createdAt: row.created_at,
    downloadHref: `/nexora/projects/${row.project_id}/files/${row.id}/download`,
    openHref: `/nexora/projects/${row.project_id}`
  }));

  documents.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  return res.type("html").send(renderNexoraClientDossierDetailPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    client,
    documents,
    ok: String(req.query?.ok || ""),
    err: String(req.query?.err || "")
  }));
});

app.get("/nexora/documents/client-files/:clientId/invoices/:invoiceId/xml/download", requireAuth, requireCompanyAdmin, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const clientId = Number(req.params.clientId || 0);
  const invoiceId = Number(req.params.invoiceId || 0);
  const invoice = db.prepare(`
    SELECT factura_nr, efactura_xml_path
    FROM facturi
    WHERE id=? AND client_id=? AND company_id=?
  `).get(invoiceId, clientId, companyId);
  if (!invoice?.efactura_xml_path) return res.status(404).send("XML-ul nu a fost gasit.");

  const storageRoot = path.resolve(__dirname);
  const absolutePath = path.resolve(__dirname, String(invoice.efactura_xml_path));
  if (!absolutePath.startsWith(storageRoot + path.sep) || !fs.existsSync(absolutePath)) {
    return res.status(404).send("XML-ul nu a fost gasit.");
  }
  return res.download(absolutePath, `${safeStoredFileName(invoice.factura_nr, "factura")}.xml`);
});

app.post("/nexora/documents/client-files/:clientId/upload", requireAuth, requireCompanyAdmin, dmsClientUpload.single("file"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const clientId = Number(req.params.clientId || 0);
  const client = db.prepare("SELECT id FROM clients WHERE id=? AND company_id=?").get(clientId, companyId);
  const file = req.file;
  if (!client) {
    if (file) { try { fs.unlinkSync(file.path); } catch {} }
    return res.status(404).send("Clientul nu a fost gasit.");
  }
  if (!file) return res.redirect(`/nexora/documents/client-files/${clientId}?err=no_file`);

  const title = String(req.body?.title || "").trim();
  if (!title) {
    try { fs.unlinkSync(file.path); } catch {}
    return res.redirect(`/nexora/documents/client-files/${clientId}?err=missing_title`);
  }
  const allowedCategories = new Set(["CONTRACTE", "OFERTE", "FACTURI", "TIPIZATE", "FORMULARE", "PROIECTE", "CORESPONDENTA", "ALTELE"]);
  const requestedCategory = String(req.body?.category || "ALTELE").trim().toUpperCase();
  const category = allowedCategories.has(requestedCategory) ? requestedCategory : "ALTELE";
  const safeOriginalName = safeStoredFileName(file.originalname, "document");
  const storedFileName = `${Date.now()}-${safeOriginalName}`;
  const relativePath = `company-${companyId}/client-${clientId}/${storedFileName}`;
  const directory = dmsClientStorageDirectory(companyId, clientId);
  const destinationPath = path.join(directory, storedFileName);

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.renameSync(file.path, destinationPath);
    db.prepare(`
      INSERT INTO dms_client_files (
        company_id, client_id, title, category, original_file_name, stored_file_name,
        stored_path, mime_type, file_size, notes, uploaded_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      clientId,
      title,
      category,
      String(file.originalname || safeOriginalName),
      storedFileName,
      relativePath,
      String(file.mimetype || "application/octet-stream"),
      Number(file.size || 0),
      String(req.body?.notes || "").trim() || null,
      String(req.session.user.email || "")
    );
    return res.redirect(`/nexora/documents/client-files/${clientId}?ok=uploaded`);
  } catch (error) {
    console.error("DMS client file upload failed:", error);
    try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    try { if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath); } catch {}
    return res.redirect(`/nexora/documents/client-files/${clientId}?err=upload`);
  }
});

app.get("/nexora/documents/client-files/:clientId/uploads/:fileId/download", requireAuth, requireCompanyAdmin, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const clientId = Number(req.params.clientId || 0);
  const fileId = Number(req.params.fileId || 0);
  const file = db.prepare(`
    SELECT original_file_name, stored_path
    FROM dms_client_files
    WHERE id=? AND client_id=? AND company_id=? AND archived_at IS NULL
  `).get(fileId, clientId, companyId);
  if (!file) return res.status(404).send("Fisierul nu a fost gasit.");
  const absolutePath = resolveDmsClientStoredPath(companyId, clientId, file.stored_path);
  if (!absolutePath || !fs.existsSync(absolutePath)) return res.status(404).send("Fisierul nu a fost gasit.");
  return res.download(absolutePath, String(file.original_file_name || "document"));
});

app.post("/nexora/documents/autofill", requireAuth, dmsAutofillUpload.single("template"), async (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const file = req.file;
  const requestedClientId = Number(req.body?.client_id || 0) || null;
  let sourcePath = "";
  let outputPath = "";

  if (!file) return res.redirect(`/nexora/documents?err=no_file#autofill`);
  if (requestedClientId && !db.prepare("SELECT id FROM clients WHERE id=? AND company_id=?").get(requestedClientId, companyId)) {
    try { fs.unlinkSync(file.path); } catch {}
    return res.status(400).send("Client invalid.");
  }

  const originalName = String(file.originalname || "formular");
  const extension = path.extname(originalName).toLowerCase();
  if (![".docx", ".pdf"].includes(extension)) {
    try { fs.unlinkSync(file.path); } catch {}
    return res.redirect(`/nexora/documents?err=unsupported_type#autofill`);
  }

  try {
    const completed = await processDmsTemplate({
      buffer: fs.readFileSync(file.path),
      extension,
      profile: getDmsAutofillProfile(companyId)
    });
    const safeBase = safeStoredFileName(path.basename(originalName, extension), "formular");
    const requestedTitle = String(req.body?.title || "").trim();
    const title = requestedTitle || safeBase.replaceAll("_", " ");
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const directory = dmsAutofillStorageDirectory(companyId);
    const sourceStoredName = `${stamp}-${safeBase}${extension}`;
    const outputDownloadName = `${safeBase}-completat${completed.extension}`;
    const outputStoredName = `${stamp}-${outputDownloadName}`;
    const sourceRelativePath = `company-${companyId}/${sourceStoredName}`;
    const outputRelativePath = `company-${companyId}/${outputStoredName}`;

    fs.mkdirSync(directory, { recursive: true });
    sourcePath = path.join(directory, sourceStoredName);
    outputPath = path.join(directory, outputStoredName);
    fs.renameSync(file.path, sourcePath);
    fs.writeFileSync(outputPath, completed.buffer);

    db.prepare(`
      INSERT INTO dms_autofill_documents (
        company_id, title, source_file_name, source_file_path, output_file_name,
        output_file_path, output_mime_type, template_type, matched_fields,
        replacement_count, created_by_email, client_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      title,
      safeStoredFileName(originalName, `formular${extension}`),
      sourceRelativePath,
      outputDownloadName,
      outputRelativePath,
      completed.mimeType,
      extension.slice(1).toUpperCase(),
      JSON.stringify(completed.matchedFields),
      Number(completed.replacementCount || 0),
      String(req.session.user.email || ""),
      requestedClientId
    );

    return res.redirect(`/nexora/documents?ok=autofilled#autofill`);
  } catch (error) {
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      if (sourcePath && fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
      if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
    const errorCode = ["invalid_docx", "invalid_pdf", "no_fields", "unsupported_type"].includes(String(error?.code || ""))
      ? String(error.code)
      : "processing";
    if (errorCode === "processing") console.error("DMS autofill failed:", error);
    return res.redirect(`/nexora/documents?err=${encodeURIComponent(errorCode)}#autofill`);
  }
});

app.get("/nexora/documents/autofill/:id/download", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id || 0);
  const document = db.prepare(`
    SELECT output_file_name, output_file_path, output_mime_type
    FROM dms_autofill_documents
    WHERE id=? AND company_id=?
  `).get(id, companyId);
  if (!document) return res.status(404).send("Documentul nu a fost gasit.");

  const absolutePath = resolveDmsAutofillStoredPath(companyId, document.output_file_path);
  if (!absolutePath || !fs.existsSync(absolutePath)) return res.status(404).send("Fisierul nu a fost gasit.");

  res.setHeader("Content-Type", String(document.output_mime_type || "application/octet-stream"));
  return res.download(absolutePath, String(document.output_file_name || "document-completat"));
});

app.post("/nexora/documents/autofill/:id/delete", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id || 0);
  const document = db.prepare(`
    SELECT source_file_path, output_file_path
    FROM dms_autofill_documents
    WHERE id=? AND company_id=?
  `).get(id, companyId);
  if (!document) return res.status(404).send("Documentul nu a fost gasit.");

  removeDmsAutofillStoredFile(companyId, document.source_file_path);
  removeDmsAutofillStoredFile(companyId, document.output_file_path);
  db.prepare(`
    UPDATE tipizate_register
    SET status='STERS',
        file_path=NULL
    WHERE company_id=? AND file_path=?
  `).run(companyId, `nexora/documents/autofill/${id}/download`);
  db.prepare("DELETE FROM dms_autofill_documents WHERE id=? AND company_id=?").run(id, companyId);
  return res.redirect("/nexora/documents?ok=autofill_deleted#autofill");
});

app.get("/nexora/documents/register", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const rows = db.prepare(`
    SELECT id, registration_number, year, seq, doc_id, doc_title, doc_category,
           file_name, file_path, issued_at, entry_type, recipient, notes,
           created_by_email, status, created_at
    FROM tipizate_register
    WHERE company_id=?
    ORDER BY year DESC, seq DESC
    LIMIT 1000
  `).all(companyId);
  const summary = getTipizateRegisterSummary(companyId);

  return res.type("html").send(renderNexoraDocumentsRegisterPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    isCompanyAdmin: isCompanyAdminUser(req.session.user),
    rows,
    summary,
    ok: String(req.query?.ok || "")
  }));
});

app.get("/tipizate/registru", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const rows = db.prepare(`
    SELECT id, registration_number, year, seq, doc_id, doc_title, doc_category,
           file_name, file_path, issued_at, entry_type, recipient, notes,
           created_by_email, status, created_at
    FROM tipizate_register
    WHERE company_id=?
    ORDER BY year DESC, seq DESC
    LIMIT 1000
  `).all(companyId);
  const summary = getTipizateRegisterSummary(companyId);
  const htmlRows = renderTipizateRegisterRows(rows);

  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Registru Tipizate</title>
</head>
${crmShellStart("tipizate-registru", "Registru evidență acte ieșite", "Numere de înregistrare automate și manuale pentru documentele care ies din firmă.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <section class="crm-card" style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">Registru de evidență</h3>
        <div class="crm-muted" style="margin-top:6px">Numerotare anuală automată pentru actele care ies din firmă: IES-AN-NUMĂR.</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="crm-btn crm-btn-secondary" href="/tipizate/registru/fisa-nr-inregistrare.xls">Fisa nr Inregistrare.xls</a>
        <a class="crm-btn crm-btn-secondary" href="/tipizate">Înapoi la Tipizate</a>
      </div>
    </div>

    <div class="crm-kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">
      <div class="crm-kpi"><div class="crm-kpi-label">Înregistrări totale</div><div class="crm-kpi-value">${escapeHtml(String(summary.total))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Documente active</div><div class="crm-kpi-value">${escapeHtml(String(summary.active))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Următorul număr ${escapeHtml(String(summary.year))}</div><div class="crm-kpi-value" style="font-size:22px">${escapeHtml(summary.nextNumber)}</div></div>
    </div>
  </section>

  <section class="crm-card" style="margin-bottom:18px">
    <div style="margin-bottom:14px">
      <h3 style="margin:0;font-size:20px">Adaugă înregistrare manuală</h3>
      <div class="crm-muted" style="margin-top:6px">Pentru documente care nu sunt generate în Tipizate. Atașamentul este opțional.</div>
    </div>
    <form method="post" action="/tipizate/registru/manual" enctype="multipart/form-data" class="crm-grid-3" style="overflow:visible">
      <div>
        <label class="crm-label">Denumire document</label>
        <input class="crm-input" name="title" required placeholder="Ex: Adresă către client">
      </div>
      <div>
        <label class="crm-label">Categorie</label>
        <input class="crm-input" name="category" value="MANUAL" placeholder="Ex: ADRESA / CERERE / ALTELE">
      </div>
      <div>
        <label class="crm-label">Data documentului</label>
        <input class="crm-input" type="date" name="issued_at" value="${todayISO()}">
      </div>
      <div>
        <label class="crm-label">Destinatar</label>
        <input class="crm-input" name="recipient" placeholder="Ex: client / instituție">
      </div>
      <div>
        <label class="crm-label">Atașament opțional</label>
        <input class="crm-input" type="file" name="attachment" accept=".pdf,.xls,.xlsx,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      </div>
      <div>
        <label class="crm-label">Observații</label>
        <input class="crm-input" name="notes" placeholder="Detalii interne">
      </div>
      <div style="grid-column:1/-1">
        <button class="crm-btn" type="submit">Alocă număr de înregistrare</button>
      </div>
    </form>
  </section>

  <section class="crm-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">Înregistrări</h3>
        <div class="crm-muted" style="margin-top:6px">Ultimele 1000 de poziții din registru.</div>
      </div>
      <div class="crm-badge crm-badge-blue">${escapeHtml(String(rows.length))} poziții afișate</div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Nr. înregistrare</th>
            <th>Dată</th>
            <th>Tip</th>
            <th>Document</th>
            <th>Categorie</th>
            <th>Destinatar</th>
            <th>Fișier</th>
            <th>Observații</th>
            <th>Status</th>
            <th>Operator</th>
            <th>Acțiune</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
});

app.post(["/tipizate/registru/manual", "/nexora/documents/register/manual"], requireAuth, upload.single("attachment"), (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const title = String(req.body?.title || "").trim();
    const category = String(req.body?.category || "MANUAL").trim().toUpperCase() || "MANUAL";
    const issuedAt = String(req.body?.issued_at || "").trim() || todayISO();
    const recipient = String(req.body?.recipient || "").trim();
    const notes = String(req.body?.notes || "").trim();

    if (!title) return res.status(400).send("Denumirea documentului este obligatorie.");

    let fileName = "";
    let filePath = "";
    if (req.file) {
      const allowedExtensions = new Set([".pdf", ".xls", ".xlsx", ".doc", ".docx"]);
      const ext = path.extname(String(req.file.originalname || "")).toLowerCase();
      if (!allowedExtensions.has(ext)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).send("Atașamentul poate fi PDF, Excel sau Word.");
      }
      const uploadsDir = path.join(__dirname, "public", "uploads", "tipizate", "registru");
      fs.mkdirSync(uploadsDir, { recursive: true });
      fileName = `${Date.now()}-${safeStoredFileName(req.file.originalname, "document" + ext)}`;
      const finalPath = path.join(uploadsDir, fileName);
      fs.renameSync(req.file.path, finalPath);
      filePath = `uploads/tipizate/registru/${fileName}`;
    }

    createManualTipizateRegisterEntry({
      companyId,
      title,
      category,
      issuedAt,
      recipient,
      notes,
      fileName,
      filePath
    }, req);

    return res.redirect(req.path.startsWith("/nexora/") || req.body?.return_to === "nexora" ? "/nexora/documents/register?ok=manual" : "/tipizate/registru");
  } catch (e) {
    return res.status(500).send("Înregistrare manuală eșuată: " + String(e?.message || e));
  }
});

app.get(["/tipizate/registru/fisa-nr-inregistrare.xls", "/nexora/documents/register/export.xls"], requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const rows = db.prepare(`
    SELECT registration_number, issued_at, entry_type, doc_title, doc_category,
           recipient, file_name, notes, created_by_email, status
    FROM tipizate_register
    WHERE company_id=?
    ORDER BY year ASC, seq ASC
    LIMIT 5000
  `).all(companyId);

  const cell = (value) => escapeHtml(String(value || ""));
  const dataRows = rows.map((row) => `
    <tr>
      <td>${cell(row.registration_number)}</td>
      <td>${cell(row.issued_at)}</td>
      <td>${cell(row.entry_type)}</td>
      <td>${cell(row.doc_title)}</td>
      <td>${cell(row.doc_category)}</td>
      <td>${cell(row.recipient)}</td>
      <td>${cell(row.file_name)}</td>
      <td>${cell(row.notes)}</td>
      <td>${cell(row.created_by_email)}</td>
      <td>${cell(row.status)}</td>
    </tr>
  `).join("");
  let blankRows = "";
  for (let i = 0; i < 20; i++) {
    blankRows += "<tr><td></td><td></td><td>MANUAL</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>";
  }

  const html = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Fisa nr Inregistrare</title></head>
<body>
  <table border="1">
    <thead>
      <tr>
        <th>Nr. înregistrare</th>
        <th>Data</th>
        <th>Tip</th>
        <th>Denumire document</th>
        <th>Categorie</th>
        <th>Destinatar</th>
        <th>Fișier atașat</th>
        <th>Observații</th>
        <th>Operator</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${dataRows}${blankRows}</tbody>
  </table>
</body>
</html>`;

  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Fisa nr Inregistrare.xls"');
  return res.send("\ufeff" + html);
});

app.get("/tipizate/proces-verbal", requireAuth, (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Proces verbal</title>
</head>

${crmShellStart("tipizate", "Proces verbal", "Completează formularul și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:900px">

  <form method="post" action="/tipizate/proces-verbal/generate" class="crm-stack">

    <div>
      <label class="crm-label">Titlu document</label>
      <input class="crm-input" name="title" required placeholder="Ex: Proces verbal recepție lucrări">
    </div>

    <div class="crm-grid-2">
      <div>
        <label class="crm-label">Data</label>
        <input class="crm-input" type="date" name="doc_date" value="${todayISO()}">
      </div>
      <div>
        <label class="crm-label">Locația</label>
        <input class="crm-input" name="location">
      </div>
    </div>

    <div>
      <label class="crm-label">Participanți</label>
      <input class="crm-input" name="participants">
    </div>

    <div>
      <label class="crm-label">Subiect</label>
      <input class="crm-input" name="subject">
    </div>

    <div>
      <label class="crm-label">Conținut</label>
      <textarea class="crm-textarea" name="content" rows="8" required></textarea>
    </div>

    <div>
      <label class="crm-label">Întocmit de</label>
      <input class="crm-input" name="prepared_by">
    </div>

    <div>


    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

${crmShellEnd()}
</html>
`);
});


app.get("/tipizate/adeverinta", requireAuth, (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Adeverință salariat</title>
</head>

${crmShellStart("tipizate", "Adeverință salariat", "Completează formularul și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:900px">
  <form method="post" action="/tipizate/adeverinta/generate" class="crm-stack">

    <div>
      <label class="crm-label">Titlu document</label>
      <input class="crm-input" name="title" value="Adeverință salariat" required>
    </div>

    <div class="crm-grid-2" style="overflow:visible">
      <div>
        <label class="crm-label">Nume salariat</label>
        <input class="crm-input" name="employee_name" required placeholder="Ex: Popescu Ion">
      </div>
      <div>
        <label class="crm-label">Funcție</label>
        <input class="crm-input" name="position" required placeholder="Ex: Tehnician">
      </div>
    </div>

    <div class="crm-grid-2" style="overflow:visible">
      <div>
        <label class="crm-label">Data</label>
        <input class="crm-input" type="date" name="doc_date" value="${todayISO()}">
      </div>
      <div>
        <label class="crm-label">Întocmit de</label>
        <input class="crm-input" name="prepared_by" placeholder="Ex: Administrator">
      </div>
    </div>

    <div>
      <label class="crm-label">Conținut / observații</label>
      <textarea class="crm-textarea" name="content" rows="6" placeholder="Text suplimentar pentru adeverință"></textarea>
    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

${crmShellEnd()}
</html>
`);
});


app.get("/tipizate/decizie-interna", requireAuth, (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Decizie internă</title>
</head>

${crmShellStart("tipizate", "Decizie internă", "Completează formularul și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:900px">
  <form method="post" action="/tipizate/decizie-interna/generate" class="crm-stack">

    <div>
      <label class="crm-label">Titlu document</label>
      <input class="crm-input" name="title" required placeholder="Ex: Decizie internă nr. 1">
    </div>

    <div class="crm-grid-2">
      <div>
        <label class="crm-label">Data</label>
        <input class="crm-input" type="date" name="doc_date" value="${todayISO()}">
      </div>
      <div>
        <label class="crm-label">Emitent</label>
        <input class="crm-input" name="issuer" placeholder="Ex: Administrator">
      </div>
    </div>

    <div>
      <label class="crm-label">Subiect</label>
      <input class="crm-input" name="subject" required>
    </div>

    <div>
      <label class="crm-label">Conținut</label>
      <textarea class="crm-textarea" name="content" rows="7" required></textarea>
    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

${crmShellEnd()}
</html>
`);
});

app.get("/tipizate/notificare-client", requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const clients = db.prepare(`
    SELECT id, name, cui
    FROM clients
    WHERE company_id=?
    ORDER BY name COLLATE NOCASE ASC
  `).all(companyId);
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Notificare client</title>
</head>

${crmShellStart("tipizate", "Notificare client", "Completează formularul și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:900px">
  <form method="post" action="/tipizate/notificare-client/generate" class="crm-stack">

    <div>
      <label class="crm-label">Titlu document</label>
      <input class="crm-input" name="title" required placeholder="Ex: Notificare client">
    </div>

    <div class="crm-grid-2">
      <div>
        <label class="crm-label">Client</label>
        <select class="crm-input" name="client_id" required>
          <option value="">Selectează clientul</option>
          ${clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}${client.cui ? ` (${escapeHtml(client.cui)})` : ""}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="crm-label">Data</label>
        <input class="crm-input" type="date" name="doc_date" value="${todayISO()}">
      </div>
    </div>

    <div>
      <label class="crm-label">Subiect</label>
      <input class="crm-input" name="subject" required>
    </div>

    <div>
      <label class="crm-label">Mesaj</label>
      <textarea class="crm-textarea" name="content" rows="7" required></textarea>
    </div>

    <div>
      <label class="crm-label">Semnat de</label>
      <input class="crm-input" name="prepared_by" placeholder="Ex: QR-LAB SRL">
    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

${crmShellEnd()}
</html>
`);
});

app.get("/tipizate/cerere-concediu", requireAuth, (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Cerere concediu</title>
</head>

${crmShellStart("tipizate", "Cerere concediu", "Completează formularul și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:900px">
  <form method="post" action="/tipizate/cerere-concediu/generate" class="crm-stack">

    <div>
      <label class="crm-label">Nume salariat</label>
      <input class="crm-input" name="employee_name" required>
    </div>

    <div class="crm-grid-2">
      <div>
        <label class="crm-label">Perioada</label>
        <input class="crm-input" name="period" required placeholder="Ex: 10.03.2026 - 15.03.2026">
      </div>
      <div>
        <label class="crm-label">Tip concediu</label>
        <input class="crm-input" name="leave_type" required placeholder="Ex: odihnă">
      </div>
    </div>

    <div>
      <label class="crm-label">Motiv / observații</label>
      <textarea class="crm-textarea" name="content" rows="5"></textarea>
    </div>

    <div>
      <label class="crm-label">Data cererii</label>
      <input class="crm-input" type="date" name="doc_date" value="${todayISO()}">
    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

${crmShellEnd()}
</html>
`);
});



app.get("/tipizate/ordin-deplasare", requireAuth, (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ordin de deplasare</title>
</head>

${crmShellStart("tipizate", "Ordin de deplasare", "Completează formularul în formatul tipizatului și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:1400px">
  <form method="post" action="/tipizate/ordin-deplasare/generate" class="crm-stack">

    <div class="crm-grid-2" style="overflow:visible">
      <div>
        <label class="crm-label">Titlu document</label>
        <input class="crm-input" name="title" required value="Ordin de deplasare">
      </div>
      <div>
        <label class="crm-label">Data</label>
        <input class="crm-input" type="date" name="doc_date" value="${todayISO()}">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">

      <div class="crm-card" style="margin:0">
        <div class="crm-label" style="font-size:16px;font-weight:800;margin-bottom:10px">Partea stângă — Decont cheltuieli</div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Unitatea / compartimentul</label>
            <input class="crm-input" name="department" placeholder="Ex: Service">
          </div>
          <div>
            <label class="crm-label">Număr ordin</label>
            <input class="crm-input" name="order_number" placeholder="Ex: 15">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Ziua plecării</label>
            <input class="crm-input" type="date" name="departure_date">
          </div>
          <div>
            <label class="crm-label">Ora plecării</label>
            <input class="crm-input" name="departure_time" placeholder="Ex: 08:00">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Ziua sosirii</label>
            <input class="crm-input" type="date" name="return_date">
          </div>
          <div>
            <label class="crm-label">Ora sosirii</label>
            <input class="crm-input" name="return_time" placeholder="Ex: 18:30">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Avans spre decontare</label>
            <input class="crm-input" name="advance_amount" placeholder="Ex: 500">
          </div>
          <div>
            <label class="crm-label">Observații</label>
            <input class="crm-input" name="expenses_notes" placeholder="Ex: cazare, transport, diurnă">
          </div>
        </div>

        <div style="margin-top:12px">
          <label class="crm-label">Cheltuieli</label>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f5f5f5">
              <th style="border:1px solid #ccc;padding:6px;width:50%">Felul actului și emitent</th>
              <th style="border:1px solid #ccc;padding:6px;width:28%">Nr. și data actului</th>
              <th style="border:1px solid #ccc;padding:6px;width:22%">Sumă</th>
            </tr>

            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[0][type]" placeholder="Ex: Factură / Bon fiscal / Diurnă"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[0][doc]" placeholder="Ex: 23/24.03.2026"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[0][amount]" placeholder="Ex: 458.50"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[1][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[1][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[1][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[2][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[2][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[2][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[3][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[3][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[3][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[4][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[4][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[4][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[5][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[5][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[5][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[6][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[6][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[6][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[7][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[7][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[7][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[8][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[8][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[8][amount]"></td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[9][type]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input" name="expense_rows[9][doc]"></td>
              <td style="border:1px solid #ccc"><input class="crm-input amount-field" name="expense_rows[9][amount]"></td>
            </tr>
          </table>

          <div style="margin-top:10px;text-align:right">
            <b>Total cheltuieli: <span id="total_expenses">0.00</span> lei</b>
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible;margin-top:12px">
          <div>
            <label class="crm-label">Diferență de restituit</label>
            <input class="crm-input" name="difference_returned" placeholder="Ex: 0">
          </div>
          <div>
            <label class="crm-label">Diferență de primit</label>
            <input class="crm-input" name="difference_received" placeholder="Ex: 0">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Aprobat de</label>
            <input class="crm-input" name="approved_by" placeholder="Ex: Administrator">
          </div>
          <div>
            <label class="crm-label">Semnătura delegatului</label>
            <input class="crm-input" name="employee_sign" placeholder="Ex: Popescu Ion">
          </div>
        </div>
      </div>

      <div class="crm-card" style="margin:0">
        <div class="crm-label" style="font-size:16px;font-weight:800;margin-bottom:10px">Partea dreaptă — Ordin de deplasare</div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Angajat / delegat</label>
            <input class="crm-input" name="employee_name" required placeholder="Ex: Popescu Ion">
          </div>
          <div>
            <label class="crm-label">Funcție</label>
            <input class="crm-input" name="position" placeholder="Ex: Tehnician">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Localitatea delegării</label>
            <input class="crm-input" name="destination" required placeholder="Ex: Cluj-Napoca">
          </div>
          <div>
            <label class="crm-label">Scopul deplasării</label>
            <input class="crm-input" name="purpose" placeholder="Ex: Intervenție tehnică / întâlnire client">
          </div>
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Mijloc transport</label>
            <input class="crm-input" name="transport" placeholder="Ex: auto propriu / tren / avion">
          </div>
          <div>
            <label class="crm-label">Seria CI</label>
            <input class="crm-input" name="ci_series" placeholder="Ex: RX 123456">
          </div>
        </div>

        <div style="margin-top:14px">
          <div class="crm-label" style="font-size:15px;font-weight:800;margin-bottom:10px">Sosit / Plecat / Cu-fără cazare</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="crm-card" style="margin:0">
              <label class="crm-label">Sosit 1</label>
              <input class="crm-input" name="stamp_1_in">
              <label class="crm-label">Plecat 1</label>
              <input class="crm-input" name="stamp_1_out">
              <label class="crm-label">Cu / fără cazare 1</label>
              <input class="crm-input" name="stamp_1_cazare" placeholder="Ex: cu cazare">
            </div>
            <div class="crm-card" style="margin:0">
              <label class="crm-label">Sosit 2</label>
              <input class="crm-input" name="stamp_2_in">
              <label class="crm-label">Plecat 2</label>
              <input class="crm-input" name="stamp_2_out">
              <label class="crm-label">Cu / fără cazare 2</label>
              <input class="crm-input" name="stamp_2_cazare" placeholder="Ex: fără cazare">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div class="crm-card" style="margin:0">
              <label class="crm-label">Sosit 3</label>
              <input class="crm-input" name="stamp_3_in">
              <label class="crm-label">Plecat 3</label>
              <input class="crm-input" name="stamp_3_out">
              <label class="crm-label">Cu / fără cazare 3</label>
              <input class="crm-input" name="stamp_3_cazare">
            </div>
            <div class="crm-card" style="margin:0">
              <label class="crm-label">Sosit 4</label>
              <input class="crm-input" name="stamp_4_in">
              <label class="crm-label">Plecat 4</label>
              <input class="crm-input" name="stamp_4_out">
              <label class="crm-label">Cu / fără cazare 4</label>
              <input class="crm-input" name="stamp_4_cazare">
            </div>
          </div>
        </div>
      </div>

    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

<script>
(function(){
  function calcTotal(){
    let total = 0;
    document.querySelectorAll(".amount-field").forEach(function(i){
      const val = parseFloat((i.value || "").replace(",", "."));
      if(!isNaN(val)) total += val;
    });
    const target = document.getElementById("total_expenses");
    if(target) target.textContent = total.toFixed(2);
  }
  document.addEventListener("input", function(e){
    if(e.target && e.target.classList.contains("amount-field")) calcTotal();
  });
  calcTotal();
})();
</script>

${crmShellEnd()}
</html>
`);
});

app.get("/tipizate/fisa-hr", requireAuth, (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Fișă HR</title>
</head>

${crmShellStart("tipizate", "Fișă HR", "Completează formularul și generează PDF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<div class="crm-card" style="max-width:900px">
  <form method="post" action="/tipizate/fisa-hr/generate" class="crm-stack">

    <div>
      <label class="crm-label">Nume salariat</label>
      <input class="crm-input" name="employee_name" required>
    </div>

    <div class="crm-grid-2" style="overflow:visible">
      <div>
        <label class="crm-label">Funcție</label>
        <input class="crm-input" name="position" required>
      </div>
      <div>
        <label class="crm-label">Departament</label>
        <input class="crm-input" name="department">
      </div>
    </div>

    <div>
      <label class="crm-label">Data angajării</label>
      <input class="crm-input" type="date" name="hire_date">
    </div>

    <div>
      <label class="crm-label">Observații</label>
      <textarea class="crm-textarea" name="content" rows="6"></textarea>
    </div>

    <div>
      <button class="crm-btn" type="submit">Generează PDF</button>
    </div>

  </form>
</div>

${crmShellEnd()}
</html>
`);
});

app.post("/tipizate/proces-verbal/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const title = String(req.body?.title || "").trim();
    const doc_date = String(req.body?.doc_date || "").trim() || todayISO();
    const location = String(req.body?.location || "").trim();
    const participants = String(req.body?.participants || "").trim();
    const subject = String(req.body?.subject || "").trim();
    const content = String(req.body?.content || "").trim();
    const prepared_by = String(req.body?.prepared_by || "").trim();

    if (!title) return res.status(400).send("Titlul este obligatoriu.");
    if (!content) return res.status(400).send("Conținutul este obligatoriu.");

    const esc = (v) => escapeHtml(String(v || ""));

    let total = 0;
    if (Array.isArray(expense_rows)) {
      expense_rows.forEach(r => {
        const val = parseFloat(r.amount || 0);
        if (!isNaN(val)) total += val;
      });
    }
const html = `
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;color:#111;line-height:1.45;margin:32px}
  h1{font-size:24px;margin:0 0 16px 0}
  .meta{margin-bottom:20px;padding:14px;border:1px solid #ddd;border-radius:10px;background:#fafafa}
  .meta div{margin:4px 0}
  .content{white-space:pre-wrap;border:1px solid #ddd;border-radius:10px;padding:16px;min-height:280px}
  .sign{margin-top:32px;display:flex;justify-content:space-between;gap:24px}
  .sign-box{width:45%}
  .line{margin-top:48px;border-top:1px solid #222;padding-top:8px}
</style>
</head>
<body>
  <h1>${esc(title)}</h1>

  <div class="meta">
    <div><b>Data:</b> ${esc(doc_date)}</div>
    <div><b>Locația:</b> ${esc(location)}</div>
    <div><b>Părți / participanți:</b> ${esc(participants)}</div>
    <div><b>Subiect:</b> ${esc(subject)}</div>
  </div>

  <div class="content">${esc(content)}</div>

  <div class="sign">
    <div class="sign-box">
      <div><b>Întocmit de</b></div>
      <div class="line">${esc(prepared_by || "-")}</div>
    </div>
    <div class="sign-box">
      <div><b>Semnătură / Confirmare</b></div>
      <div class="line">&nbsp;</div>
    </div>
  </div>
</body>
</html>`;

    const pdf = await renderPdfBuffer(html);

    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });










    const safeBase = title
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "proces-verbal";

    const finalName = `${Date.now()}-${safeBase}.pdf`;
    const absPath = path.join(dir, finalName);
    fs.writeFileSync(absPath, pdf);

    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id)
      VALUES (?,?,?,?,?,?)
    `).run(
      title,
      "PROCES_VERBAL",
      finalName,
      file_path,
      "application/pdf",
      companyId
    );
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Proces verbal failed: " + String(e?.message || e));
  }
});

app.post("/tipizate/adeverinta/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const title = String(req.body?.title || "").trim() || "Adeverință salariat";
    const employee_name = String(req.body?.employee_name || "").trim();
    const position = String(req.body?.position || "").trim();
    const employee_id = String(req.body?.employee_id || "").trim();
    const doc_date = String(req.body?.doc_date || "").trim() || todayISO();
    const content = String(req.body?.content || "").trim();
    const prepared_by = String(req.body?.prepared_by || "").trim();

    if (!employee_name) return res.status(400).send("Numele salariatului este obligatoriu.");
    if (!position) return res.status(400).send("Funcția este obligatorie.");

    const esc = (v) => escapeHtml(String(v || ""));
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body{
    margin:0;
    font-family: Arial, Helvetica, sans-serif;
    color:#000;
    font-size:10px;
    line-height:1.15;
  }
  .page{
    width:100%;
    box-sizing:border-box;
    padding:2mm 1mm;
  }
  .wrap{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:18mm;
    align-items:start;
  }
  .col{
    min-height:180mm;
    position:relative;
  }
  .col.right{
    border-left:1px solid #000;
    padding-left:12mm;
  }
  .small{
    font-size:9px;
  }
  .topline{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    margin-bottom:8mm;
    min-height:18px;
  }
  .mutedline{
    border-bottom:1px dotted #666;
    min-width:110px;
    display:inline-block;
    padding:0 3px 1px 3px;
    vertical-align:bottom;
  }
  .title{
    text-align:center;
    font-size:18px;
    font-weight:700;
    margin:10mm 0 8mm 0;
  }
  .row{
    margin:2.5mm 0;
  }
  .line{
    display:inline-block;
    border-bottom:1px dotted #666;
    min-width:120px;
    padding:0 3px 1px 3px;
    vertical-align:bottom;
  }
  .line.sm{ min-width:70px; }
  .line.md{ min-width:120px; }
  .line.lg{ min-width:200px; }
  .line.xl{ min-width:280px; }
  .tight{ margin-top:1mm; }
  table{
    width:100%;
    border-collapse:collapse;
    table-layout:fixed;
  }
  th, td{
    border:1px solid #000;
    padding:3px 4px;
    vertical-align:top;
    word-wrap:break-word;
  }
  th{
    font-weight:700;
    text-align:center;
  }
  .no-border td, .no-border th{
    border:none;
    padding:0;
  }
  .expenses-meta{
    margin-bottom:4mm;
  }
  .expenses-meta table td{
    border:1px solid #000;
    padding:2px 4px;
    font-size:9px;
  }
  .expenses-table{
    margin-top:2mm;
    font-size:9px;
  }
  .expenses-table td{
    height:16px;
  }
  .total-row td{
    font-weight:700;
  }
  .footer-table{
    margin-top:2mm;
    font-size:8px;
  }
  .footer-table td{
    height:26px;
    vertical-align:top;
  }
  .sign-col{
    text-align:center;
    margin-top:7mm;
  }
  .sign-line{
    border-top:1px solid #000;
    margin-top:9mm;
    padding-top:2mm;
  }
  .stamp{
    text-align:center;
    margin-top:4mm;
  }
  .mini-boxes{
    margin-top:5mm;
  }
  .mini-boxes td{
    height:34px;
    font-size:8px;
  }
  .bottom-note{
    margin-top:4mm;
    font-size:8px;
  }
</style>
</head>
<body>
<div class="page">
  <div class="wrap">

    <div class="col left">
      <div class="topline small">
        <div>
          <span class="mutedline">${esc(department || "")}</span><br>
          <span style="margin-left:18px">(unitatea)</span>
        </div>
        <div>
          Depus decontul (numărul și data)<br>
          <span class="mutedline" style="min-width:150px">&nbsp;</span>
        </div>
      </div>

      <div class="expenses-meta">
        <table>
          <tr>
            <td style="width:48%">
              Ziua și ora plecării <span class="line sm">${esc(departure_date || "")} ${esc(departure_time || "")}</span><br>
              Ziua și ora sosirii <span class="line sm">${esc(return_date || "")} ${esc(return_time || "")}</span><br>
              Data depunerii decontului <span class="line sm">&nbsp;</span><br>
              Penalizări calculate <span class="line sm">&nbsp;</span>
            </td>
            <td>
              Avans spre decontare <span class="line sm">${esc(advance_amount || "")}</span><br>
              Primit la plecare <span class="line sm">&nbsp;</span> lei<br>
              Primit în timpul deplasării <span class="line sm">&nbsp;</span> lei<br>
              TOTAL <span class="line sm">${esc(advance_amount || "")}</span> lei
            </td>
          </tr>
        </table>
      </div>

      <table class="expenses-table">
        <tr>
          <th style="width:48%">Felul actului și emitentul</th>
          <th style="width:27%">Nr. și data actului</th>
          <th style="width:25%">Suma</th>
        </tr>
        ${(() => {
          const rows = Array.isArray(expense_rows) ? expense_rows : [];
          let out = "";
          for (let i = 0; i < 14; i++) {
            const r = rows[i] || {};
            const left = esc(r.type || "");
            const mid = esc(r.doc || ((r.date || "") ? String(r.date) : ""));
            const amt = esc(r.amount || "");
            out += `<tr><td>${left}</td><td>${mid}</td><td>${amt}</td></tr>`;
          }
          return out;
        })()}
        <tr class="total-row">
          <td colspan="2" style="text-align:center">TOTAL CHELTUIELI</td>
          <td>${Array.isArray(expense_rows) ? expense_rows.reduce((sum, r) => sum + (parseFloat(r.amount || 0) || 0), 0).toFixed(2) : "0.00"}</td>
        </tr>
      </table>

      <table class="footer-table">
        <tr>
          <td style="width:34%">
            Diferență de restituit - s-a depus<br>
            cu chitanța nr. <span class="line sm">&nbsp;</span> din <span class="line sm">&nbsp;</span>
          </td>
          <td style="width:28%">
            Diferență de primit<br>
            <span class="line sm">&nbsp;</span> lei
          </td>
          <td style="width:12%; text-align:center; writing-mode:vertical-rl; transform:rotate(180deg);">Semnătura</td>
          <td style="width:26%">&nbsp;</td>
        </tr>
      </table>

      <table class="footer-table">
        <tr>
          <td style="text-align:center">Control aprobat,<br>conducătorul unității</td>
          <td style="text-align:center">Control financiar preventiv</td>
          <td style="text-align:center">Verificat<br>decont</td>
          <td style="text-align:center">Șef<br>compartiment</td>
          <td style="text-align:center">Titular<br>avans</td>
        </tr>
        <tr>
          <td style="height:26px"></td>
          <td></td>
          <td></td>
          <td></td>
          <td>${esc(employee_sign || employee_name || "")}</td>
        </tr>
      </table>
    </div>

    <div class="col right">
      <div class="topline small">
        <div>
          <span class="mutedline">${esc(department || "")}</span><br>
          <span style="margin-left:18px">(unitatea)</span>
        </div>
        <div>&nbsp;</div>
      </div>

      <div class="title">Ordin de deplasare (delegație) nr. <span class="line sm">${esc(order_number || "")}</span></div>

      <div class="row">
        Domnul <span class="line xl">${esc(employee_name || "")}</span>
      </div>
      <div class="row">
        având funcția de <span class="line lg">${esc(position || "")}</span>
      </div>
      <div class="row">
        este delegat pentru <span class="line xl">${esc(purpose || "")}</span>
      </div>
      <div class="row">
        <span class="line xl">&nbsp;</span>
      </div>
      <div class="row">
        la <span class="line xl">${esc(destination || "")}</span>
      </div>
      <div class="row">
        <span class="line xl">&nbsp;</span>
      </div>

      <div class="row" style="margin-top:6mm">
        Durata deplasării de la <span class="line md">${esc(departure_date || "")}</span>
        la <span class="line md">${esc(return_date || "")}</span>
      </div>
      <div class="row">
        se legitimează cu <span class="line xl">${esc(transport || "")}</span>
      </div>

      <div class="stamp">Ștampila unității și semnătura</div>

      <div class="row" style="margin-top:4mm">
        Data <span class="line md">${esc(doc_date || "")}</span>
      </div>

      <table class="mini-boxes">
        <tr>
          <td>
            Sosit* <span class="line sm">&nbsp;</span><br>
            Plecat* <span class="line sm">&nbsp;</span><br>
            Cu / fără cazare <span class="line sm">&nbsp;</span>
          </td>
          <td>
            Sosit* <span class="line sm">&nbsp;</span><br>
            Plecat* <span class="line sm">&nbsp;</span><br>
            Cu / fără cazare <span class="line sm">&nbsp;</span>
          </td>
        </tr>
        <tr>
          <td style="text-align:center; vertical-align:bottom">
            Ștampila unității<br>și semnătura
          </td>
          <td style="text-align:center; vertical-align:bottom">
            Ștampila unității<br>și semnătura
          </td>
        </tr>
        <tr>
          <td>
            Sosit* <span class="line sm">&nbsp;</span><br>
            Plecat* <span class="line sm">&nbsp;</span><br>
            Cu / fără cazare <span class="line sm">&nbsp;</span>
          </td>
          <td>
            Sosit* <span class="line sm">&nbsp;</span><br>
            Plecat* <span class="line sm">&nbsp;</span><br>
            Cu / fără cazare <span class="line sm">&nbsp;</span>
          </td>
        </tr>
        <tr>
          <td style="text-align:center; vertical-align:bottom">
            Ștampila unității<br>și semnătura
          </td>
          <td style="text-align:center; vertical-align:bottom">
            Ștampila unității<br>și semnătura
          </td>
        </tr>
      </table>

      <div class="bottom-note">*) Se va completa ziua, luna, anul și ora</div>
    </div>

  </div>
</div>
</body>
</html>`;

    const pdf = await renderPdfBuffer(html);
    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });

    const finalName = `${Date.now()}-adeverinta-salariat.pdf`;
    fs.writeFileSync(path.join(dir, finalName), pdf);
    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id)
      VALUES (?,?,?,?,?,?)
    `).run(title, "ADEVERINTA", finalName, file_path, "application/pdf", companyId);
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Adeverinta failed: " + String(e?.message || e));
  }
});

app.post("/tipizate/decizie-interna/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const title = String(req.body?.title || "").trim();
    const doc_date = String(req.body?.doc_date || "").trim() || todayISO();
    const issuer = String(req.body?.issuer || "").trim();
    const subject = String(req.body?.subject || "").trim();
    const content = String(req.body?.content || "").trim();

    if (!title) return res.status(400).send("Titlul este obligatoriu.");
    if (!subject) return res.status(400).send("Subiectul este obligatoriu.");
    if (!content) return res.status(400).send("Conținutul este obligatoriu.");

    const esc = (v) => escapeHtml(String(v || ""));
    const html = `
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<style>
body{font-family:Arial,sans-serif;color:#111;line-height:1.5;margin:36px}
h1{text-align:center;margin-bottom:16px}
.meta{margin-bottom:20px}
.content{white-space:pre-wrap;border:1px solid #ddd;padding:16px;border-radius:10px}
.line{margin-top:60px;border-top:1px solid #222;padding-top:8px;width:280px}
</style>
</head><body>
  <h1>${esc(title)}</h1>
  <div class="meta"><b>Data:</b> ${esc(doc_date)}<br><b>Emitent:</b> ${esc(issuer)}</div>
  <p><b>Subiect:</b> ${esc(subject)}</p>
  <div class="content">${esc(content)}</div>
  <div class="line">${esc(issuer || "-")}</div>
</body></html>`;

    const pdf = await renderPdfBuffer(html);
    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });

    const finalName = `${Date.now()}-decizie-interna.pdf`;
    fs.writeFileSync(path.join(dir, finalName), pdf);
    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id)
      VALUES (?,?,?,?,?,?)
    `).run(title, "DECIZIE_INTERNA", finalName, file_path, "application/pdf", companyId);
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Decizie interna failed: " + String(e?.message || e));
  }
});

app.post("/tipizate/notificare-client/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const title = String(req.body?.title || "").trim();
    const clientId = Number(req.body?.client_id || 0) || null;
    const client = clientId ? db.prepare("SELECT id, name FROM clients WHERE id=? AND company_id=?").get(clientId, companyId) : null;
    const client_name = String(client?.name || req.body?.client_name || "").trim();
    const doc_date = String(req.body?.doc_date || "").trim() || todayISO();
    const subject = String(req.body?.subject || "").trim();
    const content = String(req.body?.content || "").trim();
    const prepared_by = String(req.body?.prepared_by || "").trim();

    if (!title) return res.status(400).send("Titlul este obligatoriu.");
    if (!clientId || !client) return res.status(400).send("Selectează un client valid.");
    if (!subject) return res.status(400).send("Subiectul este obligatoriu.");
    if (!content) return res.status(400).send("Mesajul este obligatoriu.");

    const esc = (v) => escapeHtml(String(v || ""));
    const html = `
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<style>
body{font-family:Arial,sans-serif;color:#111;line-height:1.5;margin:36px}
h1{margin-bottom:20px}
.content{white-space:pre-wrap;border:1px solid #ddd;padding:16px;border-radius:10px}
.line{margin-top:60px;border-top:1px solid #222;padding-top:8px;width:280px}
</style>
</head><body>
  <h1>${esc(title)}</h1>
  <p><b>Către:</b> ${esc(client_name)}</p>
  <p><b>Data:</b> ${esc(doc_date)}</p>
  <p><b>Subiect:</b> ${esc(subject)}</p>
  <div class="content">${esc(content)}</div>
  <div class="line">${esc(prepared_by || "-")}</div>
</body></html>`;

    const pdf = await renderPdfBuffer(html);
    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });

    const finalName = `${Date.now()}-notificare-client.pdf`;
    fs.writeFileSync(path.join(dir, finalName), pdf);
    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id, client_id)
      VALUES (?,?,?,?,?,?,?)
    `).run(title, "NOTIFICARE_CLIENT", finalName, file_path, "application/pdf", companyId, clientId);
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Notificare client failed: " + String(e?.message || e));
  }
});

app.post("/tipizate/cerere-concediu/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const employee_name = String(req.body?.employee_name || "").trim();
    const period = String(req.body?.period || "").trim();
    const leave_type = String(req.body?.leave_type || "").trim();
    const content = String(req.body?.content || "").trim();
    const doc_date = String(req.body?.doc_date || "").trim() || todayISO();

    if (!employee_name) return res.status(400).send("Numele salariatului este obligatoriu.");
    if (!period) return res.status(400).send("Perioada este obligatorie.");
    if (!leave_type) return res.status(400).send("Tipul concediului este obligatoriu.");

    const title = `Cerere concediu - ${employee_name}`;
    const esc = (v) => escapeHtml(String(v || ""));
    const html = `
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<style>
body{font-family:Arial,sans-serif;color:#111;line-height:1.5;margin:36px}
h1{text-align:center;margin-bottom:20px}
.content{white-space:pre-wrap}
.line{margin-top:60px;border-top:1px solid #222;padding-top:8px;width:280px}
</style>
</head><body>
  <h1>${esc(title)}</h1>
  <p>Subsemnatul(a) <b>${esc(employee_name)}</b> solicit acordarea unui concediu de tip <b>${esc(leave_type)}</b>, pentru perioada <b>${esc(period)}</b>.</p>
  <div class="content">${esc(content || "")}</div>
  <p>Data cererii: ${esc(doc_date)}</p>
  <div class="line">${esc(employee_name)}</div>
</body></html>`;

    const pdf = await renderPdfBuffer(html);
    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });

    const finalName = `${Date.now()}-cerere-concediu.pdf`;
    fs.writeFileSync(path.join(dir, finalName), pdf);
    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id)
      VALUES (?,?,?,?,?,?)
    `).run(title, "CERERE_CONCEDIU", finalName, file_path, "application/pdf", companyId);
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Cerere concediu failed: " + String(e?.message || e));
  }
});

app.post("/tipizate/ordin-deplasare/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const title = String(req.body?.title || "").trim() || "ORDIN DE DEPLASARE";
    const doc_date = String(req.body?.doc_date || "").trim() || todayISO();
    const order_number = String(req.body?.order_number || "").trim();
    const employee_name = String(req.body?.employee_name || "").trim();
    const position = String(req.body?.position || "").trim();
    const department = String(req.body?.department || "").trim();
    const destination = String(req.body?.destination || "").trim();
    const purpose = String(req.body?.purpose || "").trim();
    const departure_date = String(req.body?.departure_date || "").trim();
    const return_date = String(req.body?.return_date || "").trim();
    const departure_time = String(req.body?.departure_time || "").trim();
    const return_time = String(req.body?.return_time || "").trim();
    const ci_series = String(req.body?.ci_series || "").trim();
    const transport = String(req.body?.transport || "").trim();
    const advance_amount = String(req.body?.advance_amount || "").trim();
    const expenses_notes = String(req.body?.expenses_notes || "").trim();
    const expense_rows = req.body?.expense_rows || [];
    const approved_by = String(req.body?.approved_by || "").trim();
    const advance_num = parseFloat(String(advance_amount || "0").replace(",", ".")) || 0;
    const total_num = Array.isArray(expense_rows)
      ? expense_rows.reduce((sum, r) => sum + (parseFloat(String(r?.amount || "0").replace(",", ".")) || 0), 0)
      : 0;
    const difference_returned = advance_num > total_num ? (advance_num - total_num).toFixed(2) : "";
    const difference_received = total_num > advance_num ? (total_num - advance_num).toFixed(2) : "";
    const employee_sign = String(req.body?.employee_sign || "").trim();
    const stamp_1_in = String(req.body?.stamp_1_in || "").trim();
    const stamp_1_out = String(req.body?.stamp_1_out || "").trim();
    const stamp_1_cazare = String(req.body?.stamp_1_cazare || "").trim();
    const stamp_2_in = String(req.body?.stamp_2_in || "").trim();
    const stamp_2_out = String(req.body?.stamp_2_out || "").trim();
    const stamp_2_cazare = String(req.body?.stamp_2_cazare || "").trim();
    const stamp_3_in = String(req.body?.stamp_3_in || "").trim();
    const stamp_3_out = String(req.body?.stamp_3_out || "").trim();
    const stamp_3_cazare = String(req.body?.stamp_3_cazare || "").trim();
    const stamp_4_in = String(req.body?.stamp_4_in || "").trim();
    const stamp_4_out = String(req.body?.stamp_4_out || "").trim();
    const stamp_4_cazare = String(req.body?.stamp_4_cazare || "").trim();

    if (!employee_name) return res.status(400).send("Numele delegatului este obligatoriu.");
    if (!destination) return res.status(400).send("Localitatea delegării este obligatorie.");

    const esc = (v) => escapeHtml(String(v || ""));
    const line = (v, n = 24) => esc(v || "_".repeat(n));

    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body{
    margin:0;
    font-family: Arial, Helvetica, sans-serif;
    color:#000;
    font-size:10px;
    line-height:1.15;
  }
  .page{ width:100%; box-sizing:border-box; }
  .wrap{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:14mm;
    align-items:start;
  }
  .col{
    min-height:180mm;
    position:relative;
  }
  .col.right{
    border-left:1px solid #000;
    padding-left:10mm;
  }
  .top{
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    margin-bottom:5mm;
    font-size:9px;
  }
  .unit{
    min-width:140px;
  }
  .fill{
    display:inline-block;
    border-bottom:1px dotted #666;
    min-width:80px;
    padding:0 6px 1px 6px; text-align:center;
    vertical-align:bottom;
  }
  .fill.sm{ min-width:55px; }
  .fill.md{ min-width:110px; }
  .fill.lg{ min-width:180px; }
  .fill.xl{ min-width:250px; }
  .title{
    text-align:center;
    font-size:17px;
    font-weight:700;
    margin:8mm 0 6mm 0;
  }
  .row{ margin:2.5mm 0; }
  table{
    width:100%;
    border-collapse:collapse;
    table-layout:fixed;
  }
  th, td{
    border:1px solid #000;
    padding:3px 4px;
    vertical-align:top;
    word-wrap:break-word;
  }
  th{
    text-align:center;
    font-weight:700;
  }
  .t9{ font-size:9px; }
  .t8{ font-size:8px; }
  .expenses td{ height:15px; }
  .signrow td{ height:26px; }
  .center{ text-align:center; }
  .mt2{ margin-top:2mm; }
  .mt4{ margin-top:4mm; }
  .mt6{ margin-top:6mm; }
</style>
</head>
<body>
<div class="page">
  <div class="wrap">

    <div class="col left">
      <div class="top">
        <div class="unit">
          <span class="fill lg">${esc(department || "")}</span><br>
          <span style="margin-left:18px">(unitatea)</span>
        </div>
        <div>
          Depus decontul<br>
          <span class="fill md">&nbsp;</span>
        </div>
      </div>

      <table class="t9">
        <tr>
          <td style="width:52%">
            Ziua și ora plecării <span class="fill sm">${esc(departure_date || "")}</span> <span class="fill sm">${esc(departure_time || "")}</span><br>
            Ziua și ora sosirii <span class="fill sm">${esc(return_date || "")}</span> <span class="fill sm">${esc(return_time || "")}</span><br>
            Data depunerii decontului <span class="fill sm">&nbsp;</span><br>
            Penalizări calculate <span class="fill sm">&nbsp;</span>
          </td>
          <td>
            Avans spre decontare <span class="fill sm">${esc(advance_amount || "")}</span><br>
            Primit la plecare <span class="fill sm">&nbsp;</span> lei<br>
            Primit în timpul deplasării <span class="fill sm">&nbsp;</span> lei<br>
            TOTAL <span class="fill sm">${esc(advance_amount || "")}</span> lei
          </td>
        </tr>
      </table>

      <table class="expenses t9 mt2">
        <tr>
          <th style="width:50%">Felul actului și emitentul</th>
          <th style="width:28%">Nr. și data actului</th>
          <th style="width:22%">Suma</th>
        </tr>
        ${(() => {
          const rows = Array.isArray(expense_rows) ? expense_rows : [];
          let out = "";
          for (let i = 0; i < 14; i++) {
            const r = rows[i] || {};
            const c1 = esc(r.type || "");
            const c2 = esc(r.doc || "");
            const c3 = esc(r.amount || "");
            out += `<tr><td>${c1}</td><td>${c2}</td><td>${c3}</td></tr>`;
          }
          return out;
        })()}
        <tr>
          <td colspan="2" class="center"><b>TOTAL CHELTUIELI</b></td>
          <td><b>${Array.isArray(expense_rows) ? expense_rows.reduce((sum, r) => sum + (parseFloat(r.amount || 0) || 0), 0).toFixed(2) : "0.00"}</b></td>
        </tr>
      </table>

      <table class="t8 mt2">
        <tr>
          <td style="width:40%">
            Diferență de restituit<br>
            <span class="fill sm">${esc(difference_returned || "")}</span> lei
          </td>
          <td style="width:28%">
            Diferență de primit<br>
            <span class="fill sm">${esc(difference_received || "")}</span> lei
          </td>
          <td style="width:12%" class="center">Semnătura</td>
          <td>&nbsp;</td>
        </tr>
      </table>

      <table class="t8 signrow mt2">
        <tr>
          <td class="center">Control aprobat,<br>conducătorul unității</td>
          <td class="center">Control financiar<br>preventiv</td>
          <td class="center">Verificat<br>decont</td>
          <td class="center">Șef<br>compartiment</td>
          <td class="center">Titular<br>avans</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td>${esc(employee_sign || employee_name || "")}</td>
        </tr>
      </table>
    </div>

    <div class="col right">
      <div class="top">
        <div class="unit">
          <span class="fill lg">${esc(department || "")}</span><br>
          <span style="margin-left:18px">(unitatea)</span>
        </div>
        <div>&nbsp;</div>
      </div>

      <div class="title">Ordin de deplasare (delegație) nr. <span class="fill sm">${esc(order_number || "")}</span></div>

      <div class="row">Domnul <span class="fill xl">${esc(employee_name || "")}</span></div>
      <div class="row">având funcția de <span class="fill lg">${esc(position || "")}</span></div>
      <div class="row">este delegat pentru <span class="fill xl">${esc(purpose || "")}</span></div>
      <div class="row"><span class="fill xl">&nbsp;</span></div>
      <div class="row">la <span class="fill xl">${esc(destination || "")}</span></div>
      <div class="row"><span class="fill xl">&nbsp;</span></div>

      <div class="row mt6">
        Durata deplasării de la <span class="fill md">${esc(departure_date || "")}</span>
        până la <span class="fill md">${esc(return_date || "")}</span>
      </div>

      <div class="row">se legitimează cu <span class="fill lg">${esc(transport || "")}</span> seria CI <span class="fill md">${esc(ci_series || "")}</span></div>

      <div class="center mt6">Ștampila unității și semnătura</div>
      <div class="row mt4">Data <span class="fill md">${esc(doc_date || "")}</span></div>

      <table class="t8 mt4">
        <tr>
          <td>
            Sosit* <span class="fill sm">${esc(stamp_1_in || "")}</span><br>
            Plecat* <span class="fill sm">${esc(stamp_1_out || "")}</span><br>
            Cu / fără cazare <span class="fill sm">${esc(stamp_1_cazare || "")}</span>
          </td>
          <td>
            Sosit* <span class="fill sm">${esc(stamp_2_in || "")}</span><br>
            Plecat* <span class="fill sm">${esc(stamp_2_out || "")}</span><br>
            Cu / fără cazare <span class="fill sm">${esc(stamp_2_cazare || "")}</span>
          </td>
        </tr>
        <tr>
          <td class="center" style="height:28px; vertical-align:bottom">Ștampila unității și semnătura</td>
          <td class="center" style="height:28px; vertical-align:bottom">Ștampila unității și semnătura</td>
        </tr>
        <tr>
          <td>
            Sosit* <span class="fill sm">${esc(stamp_3_in || "")}</span><br>
            Plecat* <span class="fill sm">${esc(stamp_3_out || "")}</span><br>
            Cu / fără cazare <span class="fill sm">${esc(stamp_3_cazare || "")}</span>
          </td>
          <td>
            Sosit* <span class="fill sm">${esc(stamp_4_in || "")}</span><br>
            Plecat* <span class="fill sm">${esc(stamp_4_out || "")}</span><br>
            Cu / fără cazare <span class="fill sm">${esc(stamp_4_cazare || "")}</span>
          </td>
        </tr>
        <tr>
          <td class="center" style="height:28px; vertical-align:bottom">Ștampila unității și semnătura</td>
          <td class="center" style="height:28px; vertical-align:bottom">Ștampila unității și semnătura</td>
        </tr>
      </table>

      <div class="t8 mt2">*) Se va completa ziua, luna, anul și ora</div>
    </div>

  </div>
</div>
</body>
</html>`;
    const pdf = await renderPdfBuffer(html);
    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });

    const finalName = `${Date.now()}-ordin-de-deplasare.pdf`;
    fs.writeFileSync(path.join(dir, finalName), pdf);
    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id)
      VALUES (?,?,?,?,?,?)
    `).run(title, "ORDIN_DE_DEPLASARE", finalName, file_path, "application/pdf", companyId);
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Ordin de deplasare failed: " + String(e?.message || e));
  }
});


app.post("/tipizate/fisa-hr/generate", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.session.user.company_id || 0);
    const employee_name = String(req.body?.employee_name || "").trim();
    const position = String(req.body?.position || "").trim();
    const hire_date = String(req.body?.hire_date || "").trim();
    const department = String(req.body?.department || "").trim();
    const content = String(req.body?.content || "").trim();

    if (!employee_name) return res.status(400).send("Numele salariatului este obligatoriu.");
    if (!position) return res.status(400).send("Funcția este obligatorie.");

    const title = `Fișă HR - ${employee_name}`;
    const esc = (v) => escapeHtml(String(v || ""));
    const html = `
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<style>
body{font-family:Arial,sans-serif;color:#111;line-height:1.5;margin:36px}
h1{margin-bottom:20px}
.box{border:1px solid #ddd;border-radius:10px;padding:16px}
.content{white-space:pre-wrap;margin-top:16px}
</style>
</head><body>
  <h1>${esc(title)}</h1>
  <div class="box">
    <div><b>Nume:</b> ${esc(employee_name)}</div>
    <div><b>Funcție:</b> ${esc(position)}</div>
    <div><b>Data angajării:</b> ${esc(hire_date)}</div>
    <div><b>Departament:</b> ${esc(department)}</div>
  </div>
  <div class="content">${esc(content || "")}</div>
</body></html>`;

    const pdf = await renderPdfBuffer(html);
    const dir = path.join(__dirname, "public", "uploads", "tipizate");
    fs.mkdirSync(dir, { recursive: true });

    const finalName = `${Date.now()}-fisa-hr.pdf`;
    fs.writeFileSync(path.join(dir, finalName), pdf);
    const file_path = `uploads/tipizate/${finalName}`;

    const insertInfo = db.prepare(`
      INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id)
      VALUES (?,?,?,?,?,?)
    `).run(title, "FISE_HR", finalName, file_path, "application/pdf", companyId);
    const registration = registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);
    if (registration?.registration_number) {
      fs.writeFileSync(path.join(dir, finalName), await renderPdfBuffer(stampTipizateRegistrationHtml(html, registration)));
    }

    return res.redirect("/" + encodeURI(file_path));
  } catch (e) {
    return res.status(500).send("Fisa HR failed: " + String(e?.message || e));
  }
});

app.post(["/tipizate/upload", "/nexora/documents/upload"], requireAuth, upload.single("pdf"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  if (!req.file) return res.status(400).send("Fișier PDF obligatoriu.");

  const title = String(req.body?.title || "").trim();
  const category = String(req.body?.category || "ALTELE").trim().toUpperCase();
  const clientId = Number(req.body?.client_id || 0) || null;
  if (!title) return res.status(400).send("Titlul documentului este obligatoriu.");
  if (clientId && !db.prepare("SELECT id FROM clients WHERE id=? AND company_id=?").get(clientId, companyId)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).send("Client invalid.");
  }

  const uploadsDir = path.join(__dirname, "public", "uploads", "tipizate");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const safeBase = String(req.file.originalname || "document.pdf").replace(/[^A-Za-z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeBase.endsWith(".pdf") ? safeBase : `${safeBase}.pdf`}`;
  const finalPath = path.join(uploadsDir, finalName);
  fs.renameSync(req.file.path, finalPath);

  const insertInfo = db.prepare(`
    INSERT INTO tipizate_docs (title, category, file_name, file_path, mime_type, company_id, client_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    category,
    finalName,
    `uploads/tipizate/${finalName}`,
    req.file.mimetype || "application/pdf",
    companyId,
    clientId
  );
  registerTipizateDocument(insertInfo.lastInsertRowid, companyId, req);

  return res.redirect(req.path.startsWith("/nexora/") || req.body?.return_to === "nexora" ? "/nexora/documents?ok=uploaded" : "/tipizate");
});

app.post(["/tipizate/:id/delete", "/nexora/documents/:id/delete"], requireAuth, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("Bad id");

  const doc = db.prepare(`
    SELECT id, file_path
    FROM tipizate_docs
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!doc) return res.status(404).send("Document not found");

  if (doc.file_path) {
    const absPath = path.join(__dirname, "public", String(doc.file_path || "").replace(/^\/+/, ""));
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
  }

  db.prepare(`
    UPDATE tipizate_register
    SET status='STERS',
        file_path=NULL
    WHERE doc_id=? AND company_id=?
  `).run(id, companyId);

  db.prepare("DELETE FROM tipizate_docs WHERE id=? AND company_id=?").run(id, companyId);
  return res.redirect(req.path.startsWith("/nexora/") || req.body?.return_to === "nexora" ? "/nexora/documents?ok=deleted" : "/tipizate");
});


app.get("/nexora/roles", requireAuth, requireRole("admin"), (req, res) => {
  res.redirect("/nexora/users");
});

app.get("/nexora/users", requireAuth, requireRole("admin"), (req, res) => {
  const companyId = Number(req.session?.user?.company_id || 0);
  const seatContext = companySeatSummary(companyId);
  const clients = loadCompanyClients(companyId);
  const users = db.prepare(`
    SELECT u.id, u.email, u.role, u.status, u.is_company_admin, u.client_id,
           u.module_permissions, u.created_at, cl.name AS client_name, cl.cui AS client_cui
    FROM users u
    LEFT JOIN clients cl ON cl.id=u.client_id AND cl.company_id=u.company_id
    WHERE u.company_id=?
    ORDER BY u.id DESC
  `).all(companyId).map((user) => {
    const roleKey = String(user.role || "").trim().toLowerCase();
    const roleModules = ROLE_MODULES[roleKey] || [];
    const storedModules = parseJsonArray(user.module_permissions, roleModules);
    return {
      ...user,
      modules: normalizeUserModules(
        storedModules.length ? storedModules : roleModules,
        seatContext.activeModules,
        seatContext.subscription || {},
        roleModules,
        { companyIsDemo: Number(seatContext.company?.is_demo || 0) === 1 }
      )
    };
  });

  return res.type("html").send(renderNexoraUsersPage({
    companyName: req.session.user.company_name || "",
    currentUser: req.session.user,
    users,
    clients,
    seatContext,
    roleModules: ROLE_MODULES,
    moduleDefinitions: MODULE_DEFINITIONS,
    currentUserId: Number(req.session.user.id || 0),
    isSuperAdmin: Number(req.session.user.is_super_admin || 0),
    ok: String(req.query?.ok || "")
  }));
});

app.get("/nexora/users/:id/edit", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const companyId = Number(req.session?.user?.company_id || 0);

  const user = db.prepare(`
    SELECT id, email, role, module_permissions, client_id
    FROM users
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!user) {
    return res.status(404).send("User not found");
  }

  const seatContext = companySeatSummary(companyId);
  const roleKey = String(user.role || "").trim().toLowerCase();
  const roleModules = Array.isArray(ROLE_MODULES[roleKey]) ? ROLE_MODULES[roleKey] : [];
  const activeModuleSet = new Set(seatContext.activeModules);
  const selectableModules = MODULE_DEFINITIONS
    .filter((item) => roleModules.includes(item.key) && activeModuleSet.has(item.key));
  const storedModules = parseJsonArray(user.module_permissions, roleModules);
  const assignedModules = normalizeUserModules(
    storedModules.length ? storedModules : roleModules,
    seatContext.activeModules,
    seatContext.subscription || {},
    roleModules,
    { companyIsDemo: Number(seatContext.company?.is_demo || 0) === 1 }
  );
  const perUserModuleLimit = Number(seatContext.subscription?.max_modules_per_user || 0);

  return res.type("html").send(renderNexoraUserEditPage({
    companyName: req.session.user.company_name || "",
    currentUser: req.session.user,
    user,
    clients: loadCompanyClients(companyId),
    selectableModules,
    assignedModules,
    seatContext,
    perUserModuleLimit,
    ok: String(req.query?.ok || "")
  }));
});

app.post("/accounts/create", requireAuth, requireRole("admin"), (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const requestedRole = String(req.body?.role || "operator").trim().toLowerCase();
  const role = Object.prototype.hasOwnProperty.call(ROLE_MODULES, requestedRole) ? requestedRole : "operator";
  const companyId = Number(req.session?.user?.company_id || 0);

  if (!email || !password) {
    return res.status(400).send("Email si parola obligatorii.");
  }
  if (!companyId) {
    return res.status(400).send("Compania utilizatorului curent nu este configurata.");
  }

  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (existing) {
    return res.status(400).send("Utilizatorul exista deja.");
  }

  const seatContext = companySeatSummary(companyId);
  if (seatContext.seatsUsed >= seatContext.seatsIncluded) {
    return res.status(400).send(`Planul curent permite maximum ${seatContext.seatsIncluded} utilizatori.`);
  }

  const roleKey = String(role || "").trim().toLowerCase();
  const clientAssignment = resolveUserClientAssignment(companyId, roleKey, req.body?.client_id);
  if (!clientAssignment.ok) return res.status(400).send(clientAssignment.message);
  const defaultRoleModules = Array.isArray(ROLE_MODULES[roleKey]) ? ROLE_MODULES[roleKey] : [];
  const effectiveModules = normalizeUserModules(
    defaultRoleModules,
    seatContext.activeModules,
    seatContext.subscription || {},
    defaultRoleModules,
    { companyIsDemo: Number(seatContext.company?.is_demo || 0) === 1 }
  );
  const hash = bcrypt.hashSync(password, 12);

  db.prepare(`
    INSERT INTO users (email,password_hash,role,company_id,status,is_company_admin,module_permissions,client_id)
    VALUES (?,?,?,?, 'active', ?, ?, ?)
  `).run(
    email,
    hash,
    role,
    companyId,
    roleKey === "admin" ? 1 : 0,
    JSON.stringify(effectiveModules),
    clientAssignment.clientId
  );

  syncCompanySeatUsage(companyId);
  res.redirect(req.body?.return_to === "nexora" ? "/nexora/users?ok=created" : "/accounts");
});

app.post("/accounts/:id/edit", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const requestedRole = String(req.body?.role || "operator").trim().toLowerCase();
  const role = Object.prototype.hasOwnProperty.call(ROLE_MODULES, requestedRole) ? requestedRole : "operator";
  const password = String(req.body?.password || "");
  const companyId = Number(req.session?.user?.company_id || 0);
  const currentUserId = Number(req.session?.user?.id || 0);

  let modules = req.body.modules || [];
  if (!Array.isArray(modules)) modules = [modules];

  const existingUser = db.prepare(`
    SELECT id
    FROM users
    WHERE id=? AND company_id=?
  `).get(id, companyId);
  if (!existingUser) {
    return res.status(404).send("User not found");
  }

  if (!email) {
    return res.status(400).send("Email obligatoriu.");
  }

  const emailOwner = db.prepare(`
    SELECT id
    FROM users
    WHERE email=? AND id<>?
  `).get(email, id);
  if (emailOwner) {
    return res.status(400).send("Exista deja un utilizator cu acest email.");
  }

  if (currentUserId === id && role !== "admin") {
    return res.status(400).send("Contul conectat trebuie sa ramana admin.");
  }

  const companyContext = getCompanySubscriptionContext(companyId);
  const roleKey = String(role || "").trim().toLowerCase();
  const clientAssignment = resolveUserClientAssignment(companyId, roleKey, req.body?.client_id);
  if (!clientAssignment.ok) return res.status(400).send(clientAssignment.message);
  const roleModules = Array.isArray(ROLE_MODULES[roleKey]) ? ROLE_MODULES[roleKey] : [];
  const effectiveModules = normalizeUserModules(
    modules,
    companyContext.activeModules,
    companyContext.subscription || {},
    roleModules,
    { companyIsDemo: Number(companyContext.company?.is_demo || 0) === 1 }
  );
  const modulesJson = JSON.stringify(effectiveModules);

  if (password) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(`
      UPDATE users
      SET email=?, role=?, password_hash=?, module_permissions=?, is_company_admin=?, client_id=?
      WHERE id=?
    `).run(email, role, hash, modulesJson, roleKey === "admin" ? 1 : 0, clientAssignment.clientId, id);
  } else {
    db.prepare(`
      UPDATE users
      SET email=?, role=?, module_permissions=?, is_company_admin=?, client_id=?
      WHERE id=?
    `).run(email, role, modulesJson, roleKey === "admin" ? 1 : 0, clientAssignment.clientId, id);
  }

  if (currentUserId === id) {
    req.session.user.email = email;
    req.session.user.client_id = clientAssignment.clientId;
  }

  res.redirect(req.body?.return_to === "nexora" ? "/nexora/users?ok=saved" : "/accounts");
});

app.post("/accounts/:id/delete", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const companyId = Number(req.session?.user?.company_id || 0);
  const currentUserId = Number(req.session?.user?.id || 0);

  const user = db.prepare(`
    SELECT id, role
    FROM users
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!user) {
    return res.status(404).send("User not found");
  }

  if (id === currentUserId) {
    return res.status(400).send("Nu iti poti sterge contul conectat.");
  }

  if (String(user.role || "").toLowerCase() === "admin") {
    const adminsCount = db.prepare(`
      SELECT COUNT(*) AS n
      FROM users
      WHERE company_id=? AND LOWER(COALESCE(role,''))='admin'
    `).get(companyId)?.n || 0;

    if (adminsCount <= 1) {
      return res.status(400).send("Nu poti sterge ultimul administrator al companiei.");
    }
  }

  db.prepare(`
    DELETE FROM users
    WHERE id=? AND company_id=?
  `).run(id, companyId);

  syncCompanySeatUsage(companyId);
  res.redirect(req.body?.return_to === "nexora" ? "/nexora/users?ok=deleted" : "/accounts");
});

app.get("/accounts/:id/edit", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const companyId = Number(req.session?.user?.company_id || 0);

  const user = db.prepare(`
    SELECT id,email,role,module_permissions,client_id
    FROM users
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!user) {
    return res.status(404).send("User not found");
  }

  const companyContext = getCompanySubscriptionContext(companyId);
  const roleKey = String(user.role || "").trim().toLowerCase();
  const roleModules = Array.isArray(ROLE_MODULES[roleKey]) ? ROLE_MODULES[roleKey] : [];
  const activeModuleSet = new Set(companyContext.activeModules);
  const selectableModules = MODULE_DEFINITIONS
    .filter((item) => roleModules.includes(item.key) && activeModuleSet.has(item.key));
  const storedModules = parseJsonArray(user.module_permissions, roleModules);
  const assignedModules = normalizeUserModules(
    storedModules.length ? storedModules : roleModules,
    companyContext.activeModules,
    companyContext.subscription || {},
    roleModules,
    { companyIsDemo: Number(companyContext.company?.is_demo || 0) === 1 }
  );
  const perUserModuleLimit = Number(companyContext.subscription?.max_modules_per_user || 0);
  const clients = loadCompanyClients(companyId);
  const clientSelectHtml = [
    `<option value="">Fara client asociat</option>`,
    ...clients.map((client) => `
      <option value="${escapeHtml(client.id)}" ${String(user.client_id || "") === String(client.id || "") ? "selected" : ""}>
        ${escapeHtml(client.name || "-")}${client.cui ? ` - ${escapeHtml(client.cui)}` : ""}
      </option>
    `)
  ].join("");

  const modulesHtml = selectableModules.map((item) => {
    const isCoreModule = isCoreCompanyModule(item.key);
    const isChecked = assignedModules.includes(item.key) || isCoreModule;
    return `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff">
        <input
          type="checkbox"
          name="modules"
          value="${item.key}"
          ${isChecked ? "checked" : ""}
          ${isCoreModule ? "disabled" : ""}
          ${!isCoreModule ? `data-limited-module="1"` : ""}
        >
        ${isCoreModule ? `<input type="hidden" name="modules" value="${item.key}">` : ``}
        <span>
          <span style="display:block;font-weight:700">${escapeHtml(item.label)}</span>
          <span class="crm-muted" style="display:block;margin-top:4px;font-size:12px">${isCoreModule ? "Modul inclus implicit in acest rol / plan." : "Disponibil pe baza planului si a modulelor active in companie."}</span>
        </span>
      </label>
    `;
  }).join("");

  const html = `
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Edit user</title>
</head>

${crmShellStart("accounts","Edit user","Modificare rol, parola si module utilizator.",req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<section class="crm-card" style="max-width:860px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:18px">
    <div>
      <h3 style="margin:0;font-size:20px">Permisiuni utilizator</h3>
      <div class="crm-muted" style="margin-top:6px">Rolul si planul companiei controleaza direct ce module pot fi salvate.</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div class="crm-badge crm-badge-blue">${escapeHtml(companyContext.subscription?.plan_name || "Plan activ")}</div>
      ${perUserModuleLimit > 0 ? `<div class="crm-badge crm-badge-amber">max ${escapeHtml(String(perUserModuleLimit))} module operationale / utilizator</div>` : `<div class="crm-badge crm-badge-green">fara limita pe module / utilizator</div>`}
    </div>
  </div>

  <form method="post" action="/accounts/${user.id}/edit" class="crm-stack">
    <div>
      <label class="crm-label">Email</label>
      <input class="crm-input" type="email" name="email" value="${escapeHtml(user.email)}" required>
    </div>

    <div>
      <label class="crm-label">Rol</label>
      <select class="crm-input" name="role">
        <option value="admin" ${user.role==="admin"?"selected":""}>admin</option>
        <option value="manager" ${user.role==="manager"?"selected":""}>manager</option>
        <option value="operator" ${user.role==="operator"?"selected":""}>operator</option>
        <option value="hr" ${user.role==="hr"?"selected":""}>hr</option>
        <option value="accounting" ${user.role==="accounting"?"selected":""}>accounting</option>
        <option value="client" ${user.role==="client"?"selected":""}>client</option>
      </select>
      <div class="crm-muted" style="margin-top:6px">Dupa schimbarea rolului, salveaza si revino daca vrei sa selectezi alta combinatie de module.</div>
    </div>

    <div>
      <label class="crm-label">Client asociat</label>
      <select class="crm-input" name="client_id">${clientSelectHtml}</select>
      <div class="crm-muted" style="margin-top:6px">Obligatoriu pentru rolul client.</div>
    </div>

    <div>
      <label class="crm-label">Module permise</label>
      <div class="crm-muted" style="margin-bottom:10px">Vezi doar modulele active in companie si disponibile pentru rolul curent.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        ${modulesHtml || `<div class="crm-muted">Nu exista module active disponibile pentru acest rol.</div>`}
      </div>
    </div>

    <div>
      <label class="crm-label">Parola noua (optional)</label>
      <input class="crm-input" type="password" name="password">
    </div>

    <div>
      <button class="crm-btn" type="submit">Salveaza</button>
    </div>
  </form>

  <form method="post" action="/accounts/${user.id}/delete" onsubmit="return confirm('Stergi acest utilizator?');" style="margin-top:12px">
    <button class="crm-btn crm-btn-danger" type="submit">Sterge utilizatorul</button>
  </form>
</section>

<script>
  const maxOperationalModules = ${Number.isFinite(perUserModuleLimit) ? perUserModuleLimit : 0};
  const limitedCheckboxes = Array.from(document.querySelectorAll('input[data-limited-module="1"]'));
  function syncLimitedModules() {
    if (!maxOperationalModules || maxOperationalModules < 1) return;
    const checkedCount = limitedCheckboxes.filter((input) => input.checked).length;
    for (const input of limitedCheckboxes) {
      input.disabled = !input.checked && checkedCount >= maxOperationalModules;
    }
  }
  limitedCheckboxes.forEach((input) => input.addEventListener("change", syncLimitedModules));
  syncLimitedModules();
</script>

${crmShellEnd()}
</html>
`;

  res.send(html);
});

app.get("/accounts", requireAuth, requireRole("admin"), (req, res) => {
  const companyId = Number(req.session?.user?.company_id || 0);
  const seatContext = companySeatSummary(companyId);
  const clients = loadCompanyClients(companyId);
  const users = db.prepare(`
    SELECT u.id, u.email, u.role, u.created_at, cl.name AS client_name, cl.cui AS client_cui
    FROM users u
    LEFT JOIN clients cl ON cl.id=u.client_id AND cl.company_id=u.company_id
    WHERE u.company_id=?
    ORDER BY u.id DESC
  `).all(companyId);

  const seatLimitReached = seatContext.seatsUsed >= seatContext.seatsIncluded;
  const perUserModuleLimit = Number(seatContext.subscription?.max_modules_per_user || 0);
  const clientCreateOptionsHtml = [
    `<option value="">Fara client asociat</option>`,
    ...clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name || "-")}${client.cui ? ` - ${escapeHtml(client.cui)}` : ""}</option>`)
  ].join("");

  const rows = users.map((u) => `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.email || "")}</td>
      <td>${escapeHtml(u.role || "")}</td>
      <td>${escapeHtml(u.client_name || "")}${u.client_cui ? `<div class="crm-muted">${escapeHtml(u.client_cui)}</div>` : ""}</td>
      <td>${escapeHtml(u.created_at || "")}</td>
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/accounts/${u.id}/edit">Edit</a>
          <form method="post" action="/accounts/${u.id}/delete" style="margin:0" onsubmit="return confirm('Stergi acest utilizator?');">
            <button type="submit" class="crm-btn crm-btn-danger" style="padding:6px 10px">Sterge</button>
          </form>
        </div>
      </td>
    </tr>
  `).join("");

  const html = `
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Accounts</title>
</head>

${crmShellStart("accounts", "Accounts", "Administrare utilizatori si roluri.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">Utilizatori</h3>
        <div class="crm-muted" style="margin-top:6px">Planul curent controleaza atat numarul de locuri, cat si nivelul de acces pe module.</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="crm-badge crm-badge-blue">${escapeHtml(seatContext.subscription?.plan_name || "Plan activ")}</div>
        <div class="crm-badge ${seatLimitReached ? "crm-badge-red" : "crm-badge-green"}">${escapeHtml(String(seatContext.seatsUsed))}/${escapeHtml(String(seatContext.seatsIncluded))} utilizatori</div>
        ${perUserModuleLimit > 0 ? `<div class="crm-badge crm-badge-amber">max ${escapeHtml(String(perUserModuleLimit))} module operationale / utilizator</div>` : `<div class="crm-badge crm-badge-green">fara limita pe module / utilizator</div>`}
      </div>
    </div>

    ${Number(seatContext.company?.is_demo || 0) === 1 ? `
      <div class="crm-card" style="margin-bottom:18px;border:1px solid #bfdbfe;background:#eff6ff">
        <div style="font-weight:800;color:#1d4ed8;margin-bottom:6px">Workspace demo</div>
        <div class="crm-muted">Contul demo ramane separat, nu are SPV live si este limitat la un singur utilizator pe durata celor 7 zile.</div>
      </div>
    ` : ``}

    <form method="post" action="/accounts/create" class="crm-grid-3" style="margin-bottom:18px">
      <div>
        <label class="crm-label">Email</label>
        <input class="crm-input" type="email" name="email" required ${seatLimitReached ? "disabled" : ""}>
      </div>
      <div>
        <label class="crm-label">Parola</label>
        <input class="crm-input" type="password" name="password" required ${seatLimitReached ? "disabled" : ""}>
      </div>
      <div>
        <label class="crm-label">Rol</label>
        <select class="crm-input" name="role" ${seatLimitReached ? "disabled" : ""}>
          <option value="admin">admin</option>
          <option value="manager">manager</option>
          <option value="operator" selected>operator</option>
          <option value="hr">hr</option>
          <option value="accounting">accounting</option>
          <option value="client">client</option>
        </select>
      </div>
      <div>
        <label class="crm-label">Client asociat</label>
        <select class="crm-input" name="client_id" ${seatLimitReached ? "disabled" : ""}>
          ${clientCreateOptionsHtml}
        </select>
        <div class="crm-muted" style="margin-top:6px">Obligatoriu pentru rolul client.</div>
      </div>
      <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="crm-btn" type="submit" ${seatLimitReached ? "disabled" : ""}>Adauga utilizator</button>
        ${seatLimitReached ? `<span class="crm-muted">Ai atins limita de utilizatori din planul curent.</span>` : `<span class="crm-muted">La creare, modulele se acorda automat dupa rol, plan si modulele active in companie.</span>`}
      </div>
    </form>

    <div style="overflow:auto">
      <table class="crm-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Client</th>
            <th>Creat la</th>
            <th>Actiuni</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" class="crm-muted">Nu exista utilizatori.</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>
`;
  res.send(html);
});

function redirectToNexoraSuperAdmin(req, res, targetPath) {
  const queryIndex = String(req.originalUrl || "").indexOf("?");
  const query = queryIndex >= 0 ? String(req.originalUrl || "").slice(queryIndex) : "";
  return res.redirect(302, `${targetPath}${query}`);
}

app.get("/super-admin/companies", requireAuth, requireSuperAdmin, (req, res) => {
  return redirectToNexoraSuperAdmin(req, res, "/nexora/super-admin/companies");
});

app.get("/super-admin/companies/:id", requireAuth, requireSuperAdmin, (req, res) => {
  return redirectToNexoraSuperAdmin(req, res, `/nexora/super-admin/companies/${encodeURIComponent(req.params.id)}`);
});

app.get("/super-admin/companies-legacy", requireAuth, requireSuperAdmin, (req, res) => {
  const q = String(req.query?.q || "").trim();
  const status = String(req.query?.status || "").trim().toLowerCase();
  const plan = String(req.query?.plan || "").trim().toLowerCase();

  const where = [];
  const params = [];
  if (q) {
    where.push("(LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.slug,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
    const token = `%${q.toLowerCase()}%`;
    params.push(token, token, token);
  }
  if (status && status !== "all") {
    where.push("LOWER(COALESCE(c.status,'active')) = ?");
    params.push(status);
  }
  if (plan && plan !== "all") {
    where.push("LOWER(COALESCE(p.code,'')) = ?");
    params.push(plan);
  }

  const rows = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.cui,
      c.status,
      c.is_demo,
      c.demo_expires_at,
      c.suspension_reason,
      c.created_at,
      c.max_users,
      p.name AS plan_name,
      p.price_monthly,
      cs.status AS subscription_status,
      cs.seats_included,
      cs.seats_used,
      (
        SELECT COUNT(*) FROM users u
        WHERE u.company_id = c.id
      ) AS users_count,
      (
        SELECT COUNT(*) FROM clients cl
        WHERE cl.company_id = c.id
      ) AS clients_count,
      (
        SELECT COUNT(*) FROM contracts ct
        WHERE ct.company_id = c.id
      ) AS contracts_count,
      (
        SELECT COUNT(*) FROM facturi f
        WHERE f.company_id = c.id
      ) AS facturi_count
    FROM companies c
    LEFT JOIN company_subscriptions cs
      ON cs.company_id = c.id
     AND cs.id = (
       SELECT cs2.id
       FROM company_subscriptions cs2
       WHERE cs2.company_id = c.id
       ORDER BY cs2.id DESC
       LIMIT 1
     )
    LEFT JOIN plans p ON p.id = cs.plan_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY c.id DESC
  `).all(...params);

  const planOptions = db.prepare(`
    SELECT code, name
    FROM plans
    WHERE status='active'
    ORDER BY price_monthly ASC, id ASC
  `).all();

  const htmlRows = rows.map((row) => {
    const statusBadge = companyStatusBadge(row.status);
    const demoMeta = Number(row.is_demo || 0) === 1
      ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span class="crm-badge crm-badge-blue">demo</span><span class="crm-muted">${escapeHtml(row.demo_expires_at || "fara data expirare")}</span></div>`
      : "";

    return `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.name || "")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.slug || "")}</div>
          ${demoMeta}
        </td>
        <td>${escapeHtml(row.cui || "—")}</td>
        <td>${escapeHtml(row.plan_name || "Fără plan")}</td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(String(row.users_count || 0))} / ${escapeHtml(String(row.seats_included || row.max_users || 0))}</td>
        <td>${escapeHtml(String(row.clients_count || 0))}</td>
        <td>${escapeHtml(String(row.contracts_count || 0))}</td>
        <td>${escapeHtml(String(row.facturi_count || 0))}</td>
        <td>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="crm-btn crm-btn-secondary" href="/super-admin/companies/${row.id}">Audit</a>
            <div class="crm-muted">${escapeHtml(row.subscription_status || row.status || "—")}</div>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Super Admin - Companii</title>
</head>
${crmShellStart("superadmin", "Companii", "Control global pentru tenant-uri, planuri și status operațional.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div>
        <h3 style="margin:0;font-size:20px">Companii active în platformă</h3>
        <div class="crm-muted" style="margin-top:6px">Vezi rapid planul, capacitatea, statusul și intri în auditul fiecărui tenant.</div>
      </div>
      <div class="crm-badge crm-badge-blue">${escapeHtml(String(rows.length))} companii</div>
    </div>

    <form method="get" action="/super-admin/companies" class="crm-grid-3" style="margin-bottom:18px;overflow:visible">
      <div>
        <label class="crm-label">Căutare</label>
        <input class="crm-input" type="text" name="q" value="${escapeHtml(q)}" placeholder="nume, slug sau CUI">
      </div>
      <div>
        <label class="crm-label">Status</label>
        <select class="crm-input" name="status">
          <option value="all" ${!status || status === "all" ? "selected" : ""}>Toate</option>
          <option value="trial" ${status === "trial" ? "selected" : ""}>Trial</option>
          <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
          <option value="past_due" ${status === "past_due" ? "selected" : ""}>Past due</option>
          <option value="suspended" ${status === "suspended" ? "selected" : ""}>Suspendate</option>
        </select>
      </div>
      <div>
        <label class="crm-label">Plan</label>
        <select class="crm-input" name="plan">
          <option value="all" ${!plan || plan === "all" ? "selected" : ""}>Toate planurile</option>
          ${planOptions.map((item) => `<option value="${escapeHtml(item.code || "")}" ${plan === String(item.code || "").toLowerCase() ? "selected" : ""}>${escapeHtml(item.name || item.code || "")}</option>`).join("")}
        </select>
      </div>
      <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap">
        <button class="crm-btn" type="submit">Aplică filtrele</button>
        <a class="crm-btn crm-btn-secondary" href="/super-admin/companies">Resetează</a>
      </div>
    </form>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Companie</th>
            <th>CUI</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Utilizatori</th>
            <th>Clienți</th>
            <th>Contracte</th>
            <th>Facturi</th>
            <th>Acțiuni</th>
          </tr>
        </thead>
        <tbody>
          ${htmlRows || `<tr><td colspan="9" class="crm-muted">Nu există companii.</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>
${crmShellEnd()}
</html>
`;

  res.send(html);
});

app.get("/super-admin/companies-legacy/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");

  const company = db.prepare(`
    SELECT
      c.*,
      p.name AS plan_name,
      p.price_monthly,
      cs.seats_included,
      cs.seats_used,
      cs.status AS subscription_status
    FROM companies c
    LEFT JOIN company_subscriptions cs
      ON cs.company_id = c.id
     AND cs.id = (
       SELECT cs2.id
       FROM company_subscriptions cs2
       WHERE cs2.company_id = c.id
       ORDER BY cs2.id DESC
       LIMIT 1
     )
    LEFT JOIN plans p ON p.id = cs.plan_id
    WHERE c.id=?
  `).get(companyId);

  if (!company) return res.status(404).send("Company not found");

  const users = db.prepare(`
    SELECT id, email, role, status, created_at
    FROM users
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 25
  `).all(companyId);

  const recentClients = db.prepare(`
    SELECT id, name, cui, created_at
    FROM clients
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 10
  `).all(companyId);

  const recentFacturi = db.prepare(`
    SELECT id, factura_nr, status, total, created_at
    FROM facturi
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 10
  `).all(companyId);

  const recentPayments = db.prepare(`
    SELECT bp.source, bp.status, bp.amount, bp.currency, bp.payer_name, bp.payer_email, bp.reference_code, bp.created_at, bp.paid_at,
           bp.invoice_generation_status, bp.generated_factura_id, f.factura_nr
    FROM billing_payments bp
    LEFT JOIN facturi f ON f.id = bp.generated_factura_id
    WHERE bp.company_id=?
    ORDER BY bp.id DESC
    LIMIT 10
  `).all(companyId);

  const adminEvents = db.prepare(`
    SELECT actor_email, event_type, status_from, status_to, reason, created_at
    FROM company_admin_events
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 12
  `).all(companyId);

  const stats = {
    users: db.prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id=?`).get(companyId)?.n || 0,
    clients: db.prepare(`SELECT COUNT(*) AS n FROM clients WHERE company_id=?`).get(companyId)?.n || 0,
    quotes: db.prepare(`SELECT COUNT(*) AS n FROM quotes WHERE company_id=?`).get(companyId)?.n || 0,
    contracts: db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE company_id=?`).get(companyId)?.n || 0,
    facturi: db.prepare(`SELECT COUNT(*) AS n FROM facturi WHERE company_id=?`).get(companyId)?.n || 0,
    tipizate: db.prepare(`SELECT COUNT(*) AS n FROM tipizate_docs WHERE company_id=?`).get(companyId)?.n || 0
  };

  const usersRows = users.map((user) => `
    <tr>
      <td>${escapeHtml(user.email || "")}</td>
      <td>${escapeHtml(user.role || "")}</td>
      <td>${escapeHtml(user.status || "")}</td>
      <td>${escapeHtml(user.created_at || "")}</td>
    </tr>
  `).join("");

  const clientsRows = recentClients.map((client) => `
    <tr>
      <td>${escapeHtml(client.name || "")}</td>
      <td>${escapeHtml(client.cui || "—")}</td>
      <td>${escapeHtml(client.created_at || "")}</td>
    </tr>
  `).join("");

  const facturiRows = recentFacturi.map((factura) => `
    <tr>
      <td>${escapeHtml(factura.factura_nr || "")}</td>
      <td>${escapeHtml(factura.status || "")}</td>
      <td>${fmtMoney(factura.total || 0)}</td>
      <td>${escapeHtml(factura.created_at || "")}</td>
    </tr>
  `).join("");

  const adminEventRows = adminEvents.map((event) => `
    <tr>
      <td>${escapeHtml(event.created_at || "")}</td>
      <td>${escapeHtml(event.actor_email || "—")}</td>
      <td>${escapeHtml(event.event_type || "")}</td>
      <td>${escapeHtml(event.status_from || "—")} -> ${escapeHtml(event.status_to || "—")}</td>
      <td>${escapeHtml(event.reason || "—")}</td>
    </tr>
  `).join("");

  const paymentRows = recentPayments.map((payment) => `
    <tr>
      <td>${paymentSourceBadge(payment.source)}</td>
      <td>${paymentStatusBadge(payment.status)}</td>
      <td>${fmtMoney(payment.amount || 0)} ${escapeHtml(String(payment.currency || "").toUpperCase() || "")}</td>
      <td>${escapeHtml(payment.payer_name || payment.payer_email || "—")}</td>
      <td>${escapeHtml(payment.reference_code || payment.factura_nr || "—")}</td>
      <td>${escapeHtml(payment.paid_at || payment.created_at || "—")}</td>
    </tr>
  `).join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Audit companie</title>
</head>
${crmShellStart("superadmin", `Audit ${company.name || ""}`, "Audit rapid pentru o companie: utilizatori, documente și volum de lucru.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card" style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div>
        <a href="/super-admin/companies" class="crm-btn crm-btn-secondary" style="margin-bottom:14px">Înapoi la companii</a>
        <h3 style="margin:0;font-size:24px">${escapeHtml(company.name || "")}</h3>
        <div class="crm-muted" style="margin-top:8px">Slug: ${escapeHtml(company.slug || "")} • CUI: ${escapeHtml(company.cui || "—")} • Status: ${escapeHtml(company.status || "")}</div>
        ${company.suspension_reason ? `<div class="crm-muted" style="margin-top:8px">Motiv curent: ${escapeHtml(company.suspension_reason)}</div>` : ``}
        ${Number(company.is_demo || 0) === 1 ? `<div class="crm-muted" style="margin-top:8px">Tenant demo activ pana la: ${escapeHtml(company.demo_expires_at || "neconfigurat")}</div>` : ``}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="crm-badge crm-badge-blue">${escapeHtml(company.plan_name || "Fără plan")}</div>
        ${Number(company.is_demo || 0) === 1 ? `<div class="crm-badge crm-badge-amber">demo</div>` : ``}
        ${companyStatusBadge(company.status)}
      </div>
    </div>

    <div class="crm-grid-3" style="margin-top:18px;overflow:visible">
      <div class="crm-card">
        <div class="crm-muted">Utilizatori</div>
        <div style="font-size:28px;font-weight:800;margin-top:8px">${escapeHtml(String(stats.users))}</div>
      </div>
      <div class="crm-card">
        <div class="crm-muted">Clienți / Oferte / Contracte</div>
        <div style="font-size:28px;font-weight:800;margin-top:8px">${escapeHtml(String(stats.clients))} / ${escapeHtml(String(stats.quotes))} / ${escapeHtml(String(stats.contracts))}</div>
      </div>
      <div class="crm-card">
        <div class="crm-muted">Facturi / Tipizate</div>
        <div style="font-size:28px;font-weight:800;margin-top:8px">${escapeHtml(String(stats.facturi))} / ${escapeHtml(String(stats.tipizate))}</div>
      </div>
    </div>
  </section>

  <section class="crm-card" style="margin-bottom:18px">
    <h3 style="margin:0 0 14px 0;font-size:18px">Control status companie</h3>
    <form method="post" action="/super-admin/companies/${company.id}/status" class="crm-stack" style="max-width:720px">
      <div class="crm-grid-2" style="overflow:visible">
        <div>
          <label class="crm-label">Status nou</label>
          <select class="crm-input" name="status">
            <option value="trial" ${String(company.status || "").toLowerCase() === "trial" ? "selected" : ""}>trial</option>
            <option value="active" ${String(company.status || "").toLowerCase() === "active" ? "selected" : ""}>active</option>
            <option value="past_due" ${String(company.status || "").toLowerCase() === "past_due" ? "selected" : ""}>past_due</option>
            <option value="suspended" ${String(company.status || "").toLowerCase() === "suspended" ? "selected" : ""}>suspended</option>
          </select>
        </div>
        <div>
          <label class="crm-label">Motiv</label>
          <input class="crm-input" name="reason" value="${escapeHtml(company.suspension_reason || "")}" placeholder="motiv suspendare / reactivare">
        </div>
      </div>
      <div>
        <button class="crm-btn" type="submit">Salvează statusul</button>
      </div>
    </form>
    ${Number(company.is_demo || 0) === 1 ? `
      <form method="post" action="/super-admin/companies/${company.id}/delete" style="margin-top:16px" onsubmit="return confirm('Stergi definitiv tenantul demo si toate datele lui?');">
        <button class="crm-btn crm-btn-danger" type="submit">Sterge tenantul demo</button>
      </form>
    ` : ``}
  </section>

  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card">
      <h3 style="margin:0 0 14px 0;font-size:18px">Utilizatori companie</h3>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Email</th><th>Rol</th><th>Status</th><th>Creat la</th></tr></thead>
          <tbody>${usersRows || `<tr><td colspan="4" class="crm-muted">Nu există utilizatori.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <section class="crm-card">
      <h3 style="margin:0 0 14px 0;font-size:18px">Ultimii clienți</h3>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Client</th><th>CUI</th><th>Creat la</th></tr></thead>
          <tbody>${clientsRows || `<tr><td colspan="3" class="crm-muted">Nu există clienți.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="crm-card" style="margin-top:18px">
    <h3 style="margin:0 0 14px 0;font-size:18px">Ultimele facturi</h3>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Factură</th><th>Status</th><th>Total</th><th>Creat la</th></tr></thead>
        <tbody>${facturiRows || `<tr><td colspan="4" class="crm-muted">Nu există facturi.</td></tr>`}</tbody>
      </table>
    </div>
  </section>

  <section class="crm-card" style="margin-top:18px">
    <h3 style="margin:0 0 14px 0;font-size:18px">Ultimele plăți</h3>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Sursă</th><th>Status</th><th>Sumă</th><th>Plătitor</th><th>Referință</th><th>Moment</th></tr></thead>
        <tbody>${paymentRows || `<tr><td colspan="6" class="crm-muted">Nu există plăți înregistrate.</td></tr>`}</tbody>
      </table>
    </div>
  </section>

  <section class="crm-card" style="margin-top:18px">
    <h3 style="margin:0 0 14px 0;font-size:18px">Istoric acțiuni super-admin</h3>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Data</th><th>Actor</th><th>Eveniment</th><th>Status</th><th>Motiv</th></tr></thead>
        <tbody>${adminEventRows || `<tr><td colspan="5" class="crm-muted">Nu există evenimente încă.</td></tr>`}</tbody>
      </table>
    </div>
  </section>
${crmShellEnd()}
</html>
`;

  res.send(html);
});

app.post(["/super-admin/companies/:id/status", "/nexora/super-admin/companies/:id/status"], requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  const nextStatus = String(req.body?.status || "").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");
  if (!["trial", "active", "past_due", "suspended"].includes(nextStatus)) return res.status(400).send("Status invalid");

  const existingCompany = db.prepare(`
    SELECT id, status, suspension_reason, archived_at
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!existingCompany) return res.status(404).send("Company not found");
  if (existingCompany.archived_at || String(existingCompany.status || "").toLowerCase() === "archived") {
    return req.path.startsWith("/nexora/")
      ? res.redirect(`/nexora/super-admin/companies/${companyId}?err=archived`)
      : res.status(400).send("Compania arhivata trebuie restaurata inainte de schimbarea statusului.");
  }

  db.prepare(`
    UPDATE companies
    SET status=?,
        suspension_reason=?,
        suspended_at=CASE WHEN ?='suspended' THEN datetime('now') ELSE NULL END,
        suspended_by_email=CASE WHEN ?='suspended' THEN ? ELSE NULL END,
        updated_at=datetime('now')
    WHERE id=?
  `).run(
    nextStatus,
    reason || null,
    nextStatus,
    nextStatus,
    String(req.session.user.email || ""),
    companyId
  );

  db.prepare(`
    UPDATE company_subscriptions
    SET status=?,
        updated_at=datetime('now')
    WHERE company_id=?
  `).run(nextStatus, companyId);

  logCompanyAdminEvent({
    companyId,
    actorUserId: Number(req.session.user.id || 0),
    actorEmail: req.session.user.email,
    eventType: "company_status_updated",
    statusFrom: existingCompany.status || "",
    statusTo: nextStatus,
    reason
  });

  res.redirect(req.path.startsWith("/nexora/") ? `/nexora/super-admin/companies/${companyId}?ok=status` : "/super-admin/companies");
});

app.post(["/super-admin/companies/:id/archive", "/nexora/super-admin/companies/:id/archive"], requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");

  const company = db.prepare(`
    SELECT id, status, suspension_reason, archived_at
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!company) return res.status(404).send("Company not found");
  if (company.archived_at || String(company.status || "").toLowerCase() === "archived") {
    return res.redirect(`/nexora/super-admin/companies/${companyId}?err=already_archived`);
  }

  const previousStatus = String(company.status || "active").toLowerCase();
  if (!["suspended", "past_due"].includes(previousStatus)) {
    return res.redirect(`/nexora/super-admin/companies/${companyId}?err=archive_status`);
  }

  const archiveReason = reason || String(company.suspension_reason || "").trim() || "Arhivat de super admin.";
  db.prepare(`
    UPDATE companies
    SET archived_previous_status=status,
        status='archived',
        archived_at=datetime('now'),
        archived_by_email=?,
        archive_reason=?,
        updated_at=datetime('now')
    WHERE id=? AND archived_at IS NULL
  `).run(String(req.session.user.email || ""), archiveReason, companyId);

  logCompanyAdminEvent({
    companyId,
    actorUserId: Number(req.session.user.id || 0),
    actorEmail: req.session.user.email,
    eventType: "company_archived",
    statusFrom: previousStatus,
    statusTo: "archived",
    reason: archiveReason
  });

  return res.redirect(`/nexora/super-admin/companies/${companyId}?ok=archived`);
});

app.post(["/super-admin/companies/:id/restore", "/nexora/super-admin/companies/:id/restore"], requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");

  const company = db.prepare(`
    SELECT id, status, archived_at, archived_previous_status, archive_reason
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!company) return res.status(404).send("Company not found");
  if (!company.archived_at && String(company.status || "").toLowerCase() !== "archived") {
    return res.redirect(`/nexora/super-admin/companies/${companyId}?err=not_archived`);
  }

  const requestedStatus = String(company.archived_previous_status || "").toLowerCase();
  const restoredStatus = ["trial", "active", "past_due", "suspended"].includes(requestedStatus)
    ? requestedStatus
    : "suspended";

  db.prepare(`
    UPDATE companies
    SET status=?,
        archived_at=NULL,
        archived_by_email=NULL,
        archived_previous_status=NULL,
        archive_reason=NULL,
        updated_at=datetime('now')
    WHERE id=?
  `).run(restoredStatus, companyId);

  logCompanyAdminEvent({
    companyId,
    actorUserId: Number(req.session.user.id || 0),
    actorEmail: req.session.user.email,
    eventType: "company_restored",
    statusFrom: "archived",
    statusTo: restoredStatus,
    reason: String(company.archive_reason || "")
  });

  return res.redirect(`/nexora/super-admin/companies/${companyId}?ok=restored`);
});

app.post(["/super-admin/companies/:id/delete", "/nexora/super-admin/companies/:id/delete"], requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");

  const company = db.prepare(`
    SELECT id, name, is_demo
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!company) return res.status(404).send("Company not found");
  if (Number(company.is_demo || 0) !== 1) {
    return res.status(400).send("Doar tenantii demo pot fi stersi din aceasta actiune.");
  }

  deleteCompanyWorkspace(companyId);
  res.redirect(req.path.startsWith("/nexora/") ? "/nexora/super-admin/companies?ok=deleted" : "/super-admin/companies");
});

app.get("/super-admin/payments", requireAuth, requireSuperAdmin, (req, res) => {
  return redirectToNexoraSuperAdmin(req, res, "/nexora/super-admin/payments");
});

app.get("/super-admin/payments-legacy", requireAuth, requireSuperAdmin, (req, res) => {
  const q = String(req.query?.q || "").trim();
  const status = String(req.query?.status || "").trim().toLowerCase();
  const source = String(req.query?.source || "").trim().toLowerCase();
  const plan = String(req.query?.plan || "").trim().toLowerCase();
  const companyFilter = Number(req.query?.company_id || 0) || 0;

  const where = [];
  const params = [];

  if (q) {
    where.push("(LOWER(c.name) LIKE ? OR LOWER(COALESCE(bp.payer_email,'')) LIKE ? OR LOWER(COALESCE(bp.payer_name,'')) LIKE ? OR LOWER(COALESCE(bp.reference_code,'')) LIKE ?)");
    const token = `%${q.toLowerCase()}%`;
    params.push(token, token, token, token);
  }
  if (status && status !== "all") {
    where.push("LOWER(COALESCE(bp.status,'')) = ?");
    params.push(status);
  }
  if (source && source !== "all") {
    where.push("LOWER(COALESCE(bp.source,'')) = ?");
    params.push(source);
  }
  if (plan && plan !== "all") {
    where.push("LOWER(COALESCE(p.code,'')) = ?");
    params.push(plan);
  }
  if (companyFilter) {
    where.push("bp.company_id = ?");
    params.push(companyFilter);
  }

  const payments = db.prepare(`
    SELECT
      bp.*,
      c.name AS company_name,
      c.slug AS company_slug,
      c.status AS company_status,
      cs.status AS subscription_status,
      p.code AS plan_code,
      p.name AS plan_name,
      f.factura_nr AS generated_factura_nr
    FROM billing_payments bp
    JOIN companies c ON c.id = bp.company_id
    LEFT JOIN company_subscriptions cs ON cs.id = bp.company_subscription_id
    LEFT JOIN plans p ON p.id = cs.plan_id
    LEFT JOIN facturi f ON f.id = bp.generated_factura_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY bp.id DESC
    LIMIT 300
  `).all(...params);

  const stats = payments.reduce((acc, row) => {
    acc.total += 1;
    if (String(row.status || "").toLowerCase() === "paid") acc.paid += 1;
    if (String(row.status || "").toLowerCase() === "failed") acc.failed += 1;
    if (String(row.status || "").toLowerCase() === "pending_verification") acc.pending += 1;
    if (String(row.source || "").toLowerCase() === "stripe") acc.stripe += 1;
    if (String(row.source || "").toLowerCase() === "op") acc.op += 1;
    return acc;
  }, { total: 0, paid: 0, failed: 0, pending: 0, stripe: 0, op: 0 });

  const planBreakdown = db.prepare(`
    SELECT
      p.name AS plan_name,
      p.code AS plan_code,
      COUNT(bp.id) AS payments_count,
      SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' THEN 1 ELSE 0 END) AS paid_count
    FROM billing_payments bp
    JOIN companies c ON c.id = bp.company_id
    LEFT JOIN company_subscriptions cs ON cs.id = bp.company_subscription_id
    LEFT JOIN plans p ON p.id = cs.plan_id
    GROUP BY p.id, p.name, p.code
    ORDER BY payments_count DESC, p.name ASC
  `).all();

  const companies = db.prepare(`
    SELECT id, name
    FROM companies
    ORDER BY name COLLATE NOCASE ASC
  `).all();

  const planOptions = db.prepare(`
    SELECT code, name
    FROM plans
    WHERE status='active'
    ORDER BY price_monthly ASC, id ASC
  `).all();

  const paymentRows = payments.map((row) => `
    <tr>
      <td>
        <div style="font-weight:800">${escapeHtml(row.company_name || "")}</div>
        <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.plan_name || "Fără plan")}</div>
      </td>
      <td>${paymentSourceBadge(row.source)}</td>
      <td>${paymentStatusBadge(row.status)}</td>
      <td>${fmtMoney(row.amount || 0)} ${escapeHtml(String(row.currency || "").toUpperCase() || "")}</td>
      <td>
        <div>${escapeHtml(row.payer_name || "—")}</div>
        <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.payer_email || "—")}</div>
      </td>
      <td>
        <div>${escapeHtml(row.created_by_email || "—")}</div>
        <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.provider_event_type || "manual")}</div>
      </td>
      <td>${escapeHtml(row.reference_code || row.stripe_invoice_id || row.stripe_checkout_session_id || "—")}</td>
      <td>${escapeHtml(row.paid_at || "—")}</td>
      <td>
        <div>${row.generated_factura_id ? `<a href="/factura/${row.generated_factura_id}">${escapeHtml(row.generated_factura_nr || `Factura #${row.generated_factura_id}`)}</a>` : "—"}</div>
        <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.invoice_generation_status || "neprocesată")}</div>
      </td>
      <td>${escapeHtml(row.failure_reason || row.notes || "—")}</td>
    </tr>
  `).join("");

  const planRows = planBreakdown.map((row) => `
    <tr>
      <td>${escapeHtml(row.plan_name || row.plan_code || "Fără plan")}</td>
      <td>${escapeHtml(String(row.payments_count || 0))}</td>
      <td>${escapeHtml(String(row.paid_count || 0))}</td>
    </tr>
  `).join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Super Admin - Plăți</title>
</head>
${crmShellStart("superadmin-payments", "Plăți", "Monitorizare centrală pentru Stripe și înregistrări manuale prin OP.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card" style="margin-bottom:18px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">
      <div class="crm-card"><div class="crm-muted">Plăți urmărite</div><div style="font-size:30px;font-weight:800;margin-top:8px">${escapeHtml(String(stats.total))}</div></div>
      <div class="crm-card"><div class="crm-muted">Stripe</div><div style="font-size:30px;font-weight:800;margin-top:8px;color:#1d4ed8">${escapeHtml(String(stats.stripe))}</div></div>
      <div class="crm-card"><div class="crm-muted">OP</div><div style="font-size:30px;font-weight:800;margin-top:8px;color:#b45309">${escapeHtml(String(stats.op))}</div></div>
      <div class="crm-card"><div class="crm-muted">Reușite</div><div style="font-size:30px;font-weight:800;margin-top:8px;color:#15803d">${escapeHtml(String(stats.paid))}</div></div>
      <div class="crm-card"><div class="crm-muted">Eșuate</div><div style="font-size:30px;font-weight:800;margin-top:8px;color:#b91c1c">${escapeHtml(String(stats.failed))}</div></div>
      <div class="crm-card"><div class="crm-muted">Așteaptă verificare</div><div style="font-size:30px;font-weight:800;margin-top:8px;color:#b45309">${escapeHtml(String(stats.pending))}</div></div>
    </div>
  </section>

  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Flux plăți</h3>
          <div class="crm-muted" style="margin-top:6px">Vezi cine a inițiat plata, cine a plătit și unde au apărut eșecuri.</div>
        </div>
        <div class="crm-badge crm-badge-blue">${escapeHtml(String(payments.length))} rezultate</div>
      </div>

      <form method="get" action="/super-admin/payments" class="crm-grid-3" style="margin-bottom:18px;overflow:visible">
        <div>
          <label class="crm-label">Căutare</label>
          <input class="crm-input" type="text" name="q" value="${escapeHtml(q)}" placeholder="companie, plătitor, referință">
        </div>
        <div>
          <label class="crm-label">Status</label>
          <select class="crm-input" name="status">
            <option value="all" ${!status || status === "all" ? "selected" : ""}>Toate</option>
            <option value="initiated" ${status === "initiated" ? "selected" : ""}>inițiată</option>
            <option value="processing" ${status === "processing" ? "selected" : ""}>în procesare</option>
            <option value="pending_verification" ${status === "pending_verification" ? "selected" : ""}>așteaptă verificare</option>
            <option value="paid" ${status === "paid" ? "selected" : ""}>reușită</option>
            <option value="failed" ${status === "failed" ? "selected" : ""}>eșuată</option>
          </select>
        </div>
        <div>
          <label class="crm-label">Sursă</label>
          <select class="crm-input" name="source">
            <option value="all" ${!source || source === "all" ? "selected" : ""}>Toate</option>
            <option value="stripe" ${source === "stripe" ? "selected" : ""}>Stripe</option>
            <option value="op" ${source === "op" ? "selected" : ""}>OP</option>
          </select>
        </div>
        <div>
          <label class="crm-label">Plan</label>
          <select class="crm-input" name="plan">
            <option value="all" ${!plan || plan === "all" ? "selected" : ""}>Toate planurile</option>
            ${planOptions.map((item) => `<option value="${escapeHtml(item.code || "")}" ${plan === String(item.code || "").toLowerCase() ? "selected" : ""}>${escapeHtml(item.name || item.code || "")}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="crm-label">Companie</label>
          <select class="crm-input" name="company_id">
            <option value="0" ${!companyFilter ? "selected" : ""}>Toate companiile</option>
            ${companies.map((item) => `<option value="${escapeHtml(String(item.id))}" ${companyFilter === Number(item.id) ? "selected" : ""}>${escapeHtml(item.name || "")}</option>`).join("")}
          </select>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <button class="crm-btn" type="submit">Aplică filtrele</button>
          <a class="crm-btn crm-btn-secondary" href="/super-admin/payments">Resetează</a>
        </div>
      </form>

      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Companie</th>
              <th>Sursă</th>
              <th>Status</th>
              <th>Sumă</th>
              <th>Plătitor</th>
              <th>Inițiat de</th>
              <th>Referință</th>
              <th>Plătită la</th>
              <th>Factură</th>
              <th>Detalii</th>
            </tr>
          </thead>
          <tbody>${paymentRows || `<tr><td colspan="10" class="crm-muted">Nu există plăți înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <section class="crm-card">
      <h3 style="margin:0 0 14px 0;font-size:20px">Înregistrează plată OP</h3>
      <div class="crm-muted" style="margin-bottom:14px">Folosește acest formular pentru companiile care plătesc prin ordin de plată și păstrezi evidența manuală în platformă.</div>
      <form method="post" action="/super-admin/payments/op" class="crm-stack">
        <div>
          <label class="crm-label">Companie</label>
          <select class="crm-input" name="company_id" required>
            <option value="">Alege compania</option>
            ${companies.map((item) => `<option value="${escapeHtml(String(item.id))}">${escapeHtml(item.name || "")}</option>`).join("")}
          </select>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Sumă</label>
            <input class="crm-input" type="number" step="0.01" min="0" name="amount" required>
          </div>
          <div>
            <label class="crm-label">Monedă</label>
            <input class="crm-input" type="text" name="currency" value="RON" maxlength="8">
          </div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Plătitor</label>
            <input class="crm-input" type="text" name="payer_name" placeholder="nume firmă / persoană">
          </div>
          <div>
            <label class="crm-label">Email plătitor</label>
            <input class="crm-input" type="email" name="payer_email" placeholder="billing@companie.ro">
          </div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Referință OP</label>
            <input class="crm-input" type="text" name="reference_code" placeholder="nr. OP / explicație plată">
          </div>
          <div>
            <label class="crm-label">Status</label>
            <select class="crm-input" name="status">
              <option value="pending_verification">așteaptă verificare</option>
              <option value="paid">reușită</option>
              <option value="failed">eșuată</option>
            </select>
          </div>
        </div>
        <div>
          <label class="crm-label">Data plății</label>
          <input class="crm-input" type="datetime-local" name="paid_at">
        </div>
        <div>
          <label class="crm-label">Notițe</label>
          <textarea class="crm-input" name="notes" rows="4" placeholder="detalii OP, bancă, confirmări, extras"></textarea>
        </div>
        <div>
          <button class="crm-btn" type="submit">Salvează plata OP</button>
        </div>
      </form>

      <section class="crm-card" style="margin-top:18px">
        <h4 style="margin:0 0 12px 0;font-size:17px">Distribuție pe planuri</h4>
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead><tr><th>Plan</th><th>Plăți</th><th>Reușite</th></tr></thead>
            <tbody>${planRows || `<tr><td colspan="3" class="crm-muted">Nu există încă plăți agregate pe planuri.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </section>
  </div>
${crmShellEnd()}
</html>
`;

  res.send(html);
});

app.post(["/super-admin/payments/op", "/nexora/super-admin/payments/op"], requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.body?.company_id || 0);
  const amount = Number(req.body?.amount || 0);
  const currency = String(req.body?.currency || "RON").trim().toUpperCase();
  const payerName = String(req.body?.payer_name || "").trim();
  const payerEmail = String(req.body?.payer_email || "").trim().toLowerCase();
  const referenceCode = String(req.body?.reference_code || "").trim();
  const status = String(req.body?.status || "pending_verification").trim().toLowerCase();
  const notes = String(req.body?.notes || "").trim();
  const paidAtRaw = String(req.body?.paid_at || "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw).toISOString() : (status === "paid" ? new Date().toISOString() : null);

  if (!Number.isFinite(companyId) || companyId <= 0) return res.status(400).send("Companie invalidă");
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).send("Sumă invalidă");
  if (!["pending_verification", "paid", "failed"].includes(status)) return res.status(400).send("Status invalid");

  const company = db.prepare(`
    SELECT id, name
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!company) return res.status(404).send("Company not found");

  const subscription = db.prepare(`
    SELECT id
    FROM company_subscriptions
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);

  const insertResult = db.prepare(`
    INSERT INTO billing_payments (
      company_id, company_subscription_id, source, provider_event_type, payment_kind, status,
      amount, currency, payer_name, payer_email, reference_code, paid_at, notes,
      created_by_user_id, created_by_email, created_at, updated_at
    )
    VALUES (?, ?, 'op', 'manual_op_entry', 'subscription', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    companyId,
    subscription?.id || null,
    status,
    amount,
    currency,
    payerName || null,
    payerEmail || null,
    referenceCode || null,
    paidAt,
    notes || null,
    Number(req.session.user.id || 0) || null,
    String(req.session.user.email || "")
  );
  const paymentId = Number(insertResult.lastInsertRowid || 0);

  syncManualPaymentToSubscription(companyId, status);
  if (paymentId && status === "paid") {
    maybeGenerateBillingInvoice(db, paymentId, { livemode: 1 });
  }
  logCompanyAdminEvent({
    companyId,
    actorUserId: Number(req.session.user.id || 0),
    actorEmail: req.session.user.email,
    eventType: "manual_payment_recorded",
    statusFrom: "",
    statusTo: status,
    reason: `OP ${referenceCode || "fără referință"}${notes ? ` | ${notes}` : ""}`
  });

  res.redirect(req.path.startsWith("/nexora/") ? "/nexora/super-admin/payments" : "/super-admin/payments");
});

app.get("/nexora/super-admin", requireAuth, requireSuperAdmin, (req, res) => {
  const stats = {
    activeCompanies: db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE archived_at IS NULL AND LOWER(COALESCE(status,'active'))='active'`).get()?.n || 0,
    trialCompanies: db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE archived_at IS NULL AND LOWER(COALESCE(status,''))='trial'`).get()?.n || 0,
    pastDueCompanies: db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE archived_at IS NULL AND LOWER(COALESCE(status,''))='past_due'`).get()?.n || 0,
    suspendedCompanies: db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE archived_at IS NULL AND LOWER(COALESCE(status,''))='suspended'`).get()?.n || 0,
    archivedCompanies: db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE archived_at IS NOT NULL OR LOWER(COALESCE(status,''))='archived'`).get()?.n || 0,
    totalCompanies: db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE archived_at IS NULL`).get()?.n || 0,
    totalUsers: db.prepare(`SELECT COUNT(*) AS n FROM users`).get()?.n || 0,
    totalPayments: db.prepare(`SELECT COUNT(*) AS n FROM billing_payments`).get()?.n || 0
  };

  const latestCompanies = db.prepare(`
    SELECT c.id, c.name, c.slug, c.cui, c.status, c.created_at, p.name AS plan_name,
           (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id) AS users_count
    FROM companies c
    LEFT JOIN company_subscriptions cs
      ON cs.company_id=c.id
     AND cs.id=(SELECT cs2.id FROM company_subscriptions cs2 WHERE cs2.company_id=c.id ORDER BY cs2.id DESC LIMIT 1)
    LEFT JOIN plans p ON p.id=cs.plan_id
    WHERE c.archived_at IS NULL
    ORDER BY c.id DESC
    LIMIT 10
  `).all();

  const planUsage = db.prepare(`
    SELECT p.name, p.code, COUNT(cs.id) AS companies_count,
           IFNULL(SUM(cs.seats_used), 0) AS users_count,
           IFNULL(SUM(cs.seats_included), 0) AS seats_total
    FROM plans p
    LEFT JOIN company_subscriptions cs
      ON cs.plan_id=p.id
     AND cs.id=(SELECT cs2.id FROM company_subscriptions cs2 WHERE cs2.company_id=cs.company_id ORDER BY cs2.id DESC LIMIT 1)
    WHERE p.status='active'
    GROUP BY p.id, p.name, p.code
    ORDER BY p.price_monthly ASC, p.id ASC
  `).all();

  const recentPayments = db.prepare(`
    SELECT bp.status, bp.amount, bp.currency, bp.payer_name, bp.payer_email, bp.created_at, bp.paid_at,
           c.name AS company_name, p.name AS plan_name
    FROM billing_payments bp
    JOIN companies c ON c.id=bp.company_id
    LEFT JOIN company_subscriptions cs ON cs.id=bp.company_subscription_id
    LEFT JOIN plans p ON p.id=cs.plan_id
    ORDER BY bp.id DESC
    LIMIT 10
  `).all();

  return res.type("html").send(renderNexoraSuperAdminDashboardPage({
    stats,
    latestCompanies,
    planUsage,
    recentPayments
  }));
});

app.get("/nexora/super-admin/companies", requireAuth, requireSuperAdmin, async (req, res) => {
  const q = String(req.query?.q || "").trim();
  const status = String(req.query?.status || "").trim().toLowerCase();
  const plan = String(req.query?.plan || "").trim().toLowerCase();
  const lookupInput = String(req.query?.lookup_cui || "").trim();
  const lookupCui = normalizeCui(lookupInput);
  const lookup = { cui: lookupCui || lookupInput };
  let lookupError = "";

  if (lookupInput) {
    if (!lookupCui) {
      lookupError = "invalid_cui";
    } else {
      try {
        lookup.company = await fetchAnafCompany(lookupCui);
        lookup.existingCompany = findCompanyByCui(lookupCui);
      } catch (error) {
        const details = String(error?.message || error || "");
        lookupError = /raspuns invalid|not found|neg[aă]sit/i.test(details)
          ? "anaf_not_found"
          : "anaf_unavailable";
      }
    }
  }

  const where = [];
  const params = [];
  if (status === "archived") {
    where.push("(c.archived_at IS NOT NULL OR LOWER(COALESCE(c.status,''))='archived')");
  } else {
    where.push("c.archived_at IS NULL");
  }
  if (q) {
    where.push("(LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.slug,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
    const token = `%${q.toLowerCase()}%`;
    params.push(token, token, token);
  }
  if (status && status !== "all" && status !== "archived") {
    where.push("LOWER(COALESCE(c.status,'active')) = ?");
    params.push(status);
  }
  if (plan && plan !== "all") {
    where.push("LOWER(COALESCE(p.code,'')) = ?");
    params.push(plan);
  }

  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug, c.cui, c.status, c.is_demo, c.demo_expires_at,
           c.suspension_reason, c.archived_at, c.archived_by_email, c.archive_reason,
           c.created_at, c.max_users, p.name AS plan_name,
           cs.status AS subscription_status, cs.seats_included, cs.seats_used,
           (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id) AS users_count,
           (SELECT COUNT(*) FROM clients cl WHERE cl.company_id=c.id) AS clients_count,
           (SELECT COUNT(*) FROM contracts ct WHERE ct.company_id=c.id) AS contracts_count,
           (SELECT COUNT(*) FROM facturi f WHERE f.company_id=c.id) AS facturi_count
    FROM companies c
    LEFT JOIN company_subscriptions cs
      ON cs.company_id=c.id
     AND cs.id=(SELECT cs2.id FROM company_subscriptions cs2 WHERE cs2.company_id=c.id ORDER BY cs2.id DESC LIMIT 1)
    LEFT JOIN plans p ON p.id=cs.plan_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY c.id DESC
  `).all(...params);

  const plans = db.prepare(`
    SELECT code, name
    FROM plans
    WHERE status='active'
    ORDER BY price_monthly ASC, id ASC
  `).all();
  const createPlans = db.prepare(`
    SELECT id, code, name
    FROM plans
    WHERE status='active'
      AND COALESCE(is_public, 1)=1
    ORDER BY COALESCE(sort_order, 100) ASC, price_monthly ASC, id ASC
  `).all();

  return res.type("html").send(renderNexoraSuperAdminCompaniesPage({
    rows,
    plans,
    createPlans,
    filters: { q, status: status || "all", plan: plan || "all" },
    lookup,
    ok: String(req.query?.ok || ""),
    err: String(req.query?.err || lookupError)
  }));
});

app.post("/nexora/super-admin/companies/create-from-anaf", requireAuth, requireSuperAdmin, async (req, res) => {
  const cui = normalizeCui(req.body?.company_cui);
  const adminEmail = String(req.body?.admin_email || "").trim().toLowerCase();
  const adminPassword = String(req.body?.admin_password || "");
  const companyRep = String(req.body?.company_rep || "").trim();
  const planId = Number(req.body?.plan_id || 0);
  const redirectWithError = (code) => {
    const query = new URLSearchParams({ lookup_cui: cui || String(req.body?.company_cui || "").trim(), err: code });
    return res.redirect(`/nexora/super-admin/companies?${query.toString()}#anaf-create`);
  };

  if (!cui) return redirectWithError("invalid_cui");
  if (!adminEmail || !adminPassword || !Number.isFinite(planId) || planId < 1) {
    return redirectWithError("missing_fields");
  }
  if (adminPassword.length < 8) return redirectWithError("short_password");
  if (findCompanyByCui(cui)) return redirectWithError("company_exists");
  if (db.prepare("SELECT id FROM users WHERE LOWER(email)=?").get(adminEmail)) {
    return redirectWithError("user_exists");
  }

  const selectedPlan = db.prepare(`
    SELECT id, name, code, max_users, pricing_model, price_monthly,
           max_modules_per_user, max_active_modules, module_keys
    FROM plans
    WHERE id=? AND status='active' AND COALESCE(is_public, 1)=1
  `).get(planId);
  if (!selectedPlan) return redirectWithError("invalid_plan");

  let anafCompany;
  try {
    anafCompany = await fetchAnafCompany(cui);
  } catch (error) {
    const details = String(error?.message || error || "");
    return redirectWithError(/raspuns invalid|not found|neg[aă]sit/i.test(details) ? "anaf_not_found" : "anaf_unavailable");
  }

  if (!anafCompany?.name || findCompanyByCui(anafCompany.cui)) {
    return redirectWithError(anafCompany?.name ? "company_exists" : "anaf_not_found");
  }

  try {
    const created = createWorkspace(db, {
      companyName: String(anafCompany.name || "").trim(),
      companyCui: String(anafCompany.cui || cui).trim(),
      companyRc: String(anafCompany.reg_com || "").trim(),
      companyRep,
      companyAddress: String(anafCompany.address || "").trim(),
      adminEmail,
      adminPassword,
      plan: selectedPlan,
      isDemo: false
    });
    logCompanyAdminEvent({
      companyId: created.companyId,
      actorUserId: Number(req.session.user.id || 0),
      actorEmail: req.session.user.email,
      eventType: "company_created_from_anaf",
      statusTo: "trial",
      reason: `CUI ${String(anafCompany.cui || cui)} verificat in ANAF`
    });

    const query = new URLSearchParams({ ok: "created", q: String(anafCompany.cui || cui) });
    return res.redirect(`/nexora/super-admin/companies?${query.toString()}`);
  } catch (error) {
    console.error("Super admin ANAF company creation failed:", error);
    return redirectWithError("create_failed");
  }
});

app.get("/nexora/super-admin/companies/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");

  const company = db.prepare(`
    SELECT c.*, p.name AS plan_name, p.price_monthly, cs.seats_included, cs.seats_used, cs.status AS subscription_status
    FROM companies c
    LEFT JOIN company_subscriptions cs
      ON cs.company_id=c.id
     AND cs.id=(SELECT cs2.id FROM company_subscriptions cs2 WHERE cs2.company_id=c.id ORDER BY cs2.id DESC LIMIT 1)
    LEFT JOIN plans p ON p.id=cs.plan_id
    WHERE c.id=?
  `).get(companyId);
  if (!company) return res.status(404).send("Company not found");

  const users = db.prepare(`
    SELECT id, email, role, status, created_at
    FROM users
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 25
  `).all(companyId);
  const clients = db.prepare(`
    SELECT id, name, cui, created_at
    FROM clients
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 10
  `).all(companyId);
  const invoices = db.prepare(`
    SELECT id, factura_nr, status, total, moneda, created_at
    FROM facturi
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 10
  `).all(companyId);
  const payments = db.prepare(`
    SELECT source, status, amount, currency, payer_name, payer_email, reference_code, created_at, paid_at
    FROM billing_payments
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 10
  `).all(companyId);
  const events = db.prepare(`
    SELECT actor_email, event_type, status_from, status_to, reason, created_at
    FROM company_admin_events
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 12
  `).all(companyId);
  const stats = {
    users: db.prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id=?`).get(companyId)?.n || 0,
    clients: db.prepare(`SELECT COUNT(*) AS n FROM clients WHERE company_id=?`).get(companyId)?.n || 0,
    quotes: db.prepare(`SELECT COUNT(*) AS n FROM quotes WHERE company_id=?`).get(companyId)?.n || 0,
    contracts: db.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE company_id=?`).get(companyId)?.n || 0,
    facturi: db.prepare(`SELECT COUNT(*) AS n FROM facturi WHERE company_id=?`).get(companyId)?.n || 0,
    tipizate: db.prepare(`SELECT COUNT(*) AS n FROM tipizate_docs WHERE company_id=?`).get(companyId)?.n || 0
  };
  const companyContext = getCompanySubscriptionContext(companyId);
  const moduleGroups = buildCompanyModuleGroups(companyContext);

  return res.type("html").send(renderNexoraSuperAdminCompanyDetailPage({
    company,
    subscription: companyContext.subscription || {},
    moduleGroups,
    companyModuleLimit: Number(companyContext.subscription?.max_active_modules || 0),
    stats,
    users,
    clients,
    invoices,
    payments,
    events,
    ok: String(req.query?.ok || ""),
    err: String(req.query?.err || "")
  }));
});

app.post("/nexora/super-admin/companies/:id/modules", requireAuth, requireSuperAdmin, (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) return res.status(400).send("Bad id");

  let moduleKeys = req.body?.module_keys || [];
  if (!Array.isArray(moduleKeys)) moduleKeys = [moduleKeys];

  const { company, subscription, planModules } = getCompanySubscriptionContext(companyId);
  if (!company) return res.status(404).send("Company not found");
  if (!subscription) return res.redirect(`/nexora/super-admin/companies/${companyId}?err=subscription`);

  const nextModules = normalizeCompanyModules(moduleKeys.map(String), planModules, subscription, {
    companyIsDemo: Number(company.is_demo || 0) === 1
  });

  db.prepare(`
    UPDATE company_subscriptions
    SET module_overrides=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(JSON.stringify(nextModules), subscription.id);

  resyncCompanyUserModules(companyId);
  logCompanyAdminEvent({
    companyId,
    actorUserId: Number(req.session.user.id || 0),
    actorEmail: req.session.user.email,
    eventType: "company_modules_updated",
    reason: `Module active: ${nextModules.join(", ")}`
  });

  return res.redirect(`/nexora/super-admin/companies/${companyId}?ok=modules`);
});

app.get("/nexora/super-admin/payments", requireAuth, requireSuperAdmin, (req, res) => {
  const q = String(req.query?.q || "").trim();
  const status = String(req.query?.status || "").trim().toLowerCase();
  const source = String(req.query?.source || "").trim().toLowerCase();
  const plan = String(req.query?.plan || "").trim().toLowerCase();
  const companyId = Number(req.query?.company_id || 0) || 0;

  const where = [];
  const params = [];
  if (q) {
    where.push("(LOWER(c.name) LIKE ? OR LOWER(COALESCE(bp.payer_email,'')) LIKE ? OR LOWER(COALESCE(bp.payer_name,'')) LIKE ? OR LOWER(COALESCE(bp.reference_code,'')) LIKE ?)");
    const token = `%${q.toLowerCase()}%`;
    params.push(token, token, token, token);
  }
  if (status && status !== "all") {
    where.push("LOWER(COALESCE(bp.status,'')) = ?");
    params.push(status);
  }
  if (source && source !== "all") {
    where.push("LOWER(COALESCE(bp.source,'')) = ?");
    params.push(source);
  }
  if (plan && plan !== "all") {
    where.push("LOWER(COALESCE(p.code,'')) = ?");
    params.push(plan);
  }
  if (companyId) {
    where.push("bp.company_id = ?");
    params.push(companyId);
  }

  const rows = db.prepare(`
    SELECT bp.*, c.name AS company_name, c.slug AS company_slug, c.status AS company_status,
           cs.status AS subscription_status, p.code AS plan_code, p.name AS plan_name,
           f.factura_nr AS generated_factura_nr
    FROM billing_payments bp
    JOIN companies c ON c.id=bp.company_id
    LEFT JOIN company_subscriptions cs ON cs.id=bp.company_subscription_id
    LEFT JOIN plans p ON p.id=cs.plan_id
    LEFT JOIN facturi f ON f.id=bp.generated_factura_id AND f.company_id=bp.company_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY bp.id DESC
    LIMIT 300
  `).all(...params);

  const stats = rows.reduce((acc, row) => {
    acc.total += 1;
    const rowStatus = String(row.status || "").toLowerCase();
    const rowSource = String(row.source || "").toLowerCase();
    if (rowStatus === "paid") acc.paid += 1;
    if (rowStatus === "failed") acc.failed += 1;
    if (rowStatus === "pending_verification") acc.pending += 1;
    if (rowSource === "stripe") acc.stripe += 1;
    if (rowSource === "op") acc.op += 1;
    return acc;
  }, { total: 0, paid: 0, failed: 0, pending: 0, stripe: 0, op: 0 });

  const companies = db.prepare(`
    SELECT id, name
    FROM companies
    WHERE archived_at IS NULL
    ORDER BY name COLLATE NOCASE ASC
  `).all();
  const plans = db.prepare(`
    SELECT code, name
    FROM plans
    WHERE status='active'
    ORDER BY price_monthly ASC, id ASC
  `).all();

  return res.type("html").send(renderNexoraSuperAdminPaymentsPage({
    rows,
    companies,
    plans,
    stats,
    filters: { q, status: status || "all", source: source || "all", plan: plan || "all", companyId }
  }));
});


app.get("/nexora/settings", requireAuth, (req, res) => {
const companyId = Number(req.session.user.company_id || 0);
const isCompanyAdmin = String(req.session.user.role || "").toLowerCase() === "admin" || Number(req.session.user.is_company_admin || 0) === 1;
const canAccessSpvSettings = canAccessSpvUser(req.session.user);
const companyContext = getCompanySubscriptionContext(companyId);
const companyDetails = companyContext.company || {};
const activeSubscription = companyContext.subscription || null;
const companyStatus = String(companyDetails.status || activeSubscription?.status || "active").toLowerCase();
const stripeBillingConfigured = Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
const stripeWebhookConfigured = Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim());
const activeUserCount = Number(activeSubscription?.seats_used ?? 1) || 1;
const companyModuleLimit = Number(activeSubscription?.max_active_modules || 0);
const activeOptionalModuleCount = countOptionalCompanyModules(companyContext.activeModules);
const settings = {
  company_name: companyDetails.name || getSetting("company_name", "QR-LAB SRL"),
  company_cui: companyDetails.cui || getSetting("company_cui", ""),
  company_rc: companyDetails.rc || getSetting("company_rc", ""),
  company_address: companyDetails.address || getSetting("company_address", ""),
  company_iban: companyDetails.iban || getSetting("company_iban", ""),
  company_bank: companyDetails.bank || getSetting("company_bank", ""),
  company_rep: companyDetails.representative || getSetting("company_rep", ""),
  company_rep_ci_series: getSetting("company_rep_ci_series", ""),
  company_rep_ci_number: getSetting("company_rep_ci_number", ""),
  company_rep_ci_issued_by: getSetting("company_rep_ci_issued_by", ""),
  company_phone: getSetting("company_phone", ""),
  company_email: getSetting("company_email", ""),
  company_vat: getSetting("company_vat", "0"),
  company_vat_exemption_reason: getSetting("company_vat_exemption_reason", "Nu face obiectul TVA"),
  invoice_series: getSetting("invoice_series", "INV"),
  invoice_color: getSetting("invoice_color", "#39a935"),
  capital_social: getSetting("capital_social", ""),
  invoice_footer: getSetting("invoice_footer", "Factura este valabila fara semnatura conform legii."),
  anaf_environment: getSetting("anaf_environment", "test"),
  anaf_redirect_uri: getSetting("anaf_redirect_uri", "https://minicrm.qr-lab.ro/oauth/anaf/callback"),
  anaf_client_id: getSetting("anaf_client_id", ""),
  anaf_client_secret: getSetting("anaf_client_secret", "")
};
const plans = companyContext.plans.map((plan) => {
  const pricingModel = String(plan.pricing_model || "flat").trim().toLowerCase();
  const chargePreview = planChargeAmount(plan, activeUserCount);
  const chargeQuantity = planChargeQuantity(plan, activeUserCount);
  const moduleLimitCopy = Number(plan.max_active_modules || 0) > 0
    ? `Până la ${String(plan.max_active_modules)} module operaționale`
    : Number(plan.max_modules_per_user || 0) > 0
      ? `Maximum ${String(plan.max_modules_per_user)} module / utilizator`
      : "Acces complet la module";
  return {
    ...plan,
    features: parseJsonArray(plan.features_json, []),
    pricingLabel: pricingModel === "per_user"
      ? `${String(plan.price_monthly)} EUR / utilizator / lună`
      : `${String(plan.price_monthly)} EUR / lună`,
    moduleLimitCopy,
    chargeCopy: `${String(chargePreview)} EUR estimat / lună${pricingModel === "per_user" ? ` pentru ${String(chargeQuantity)} utilizatori` : ""}`
  };
});
const moduleGroups = buildCompanyModuleGroups(companyContext);

res.type("html").send(renderNexoraSettingsPage({
  companyName: req.session.user.company_name || companyDetails.name || "",
  user: req.session.user,
  company: companyDetails,
  subscription: activeSubscription || {},
  settings,
  plans,
  moduleGroups,
  isCompanyAdmin,
  canAccessSpvSettings,
  companyStatus,
  activeUserCount,
  companyModuleLimit,
  activeOptionalModuleCount,
  stripeBillingConfigured,
  stripeWebhookConfigured,
  activeTab: String(req.query?.tab || "company"),
  ok: String(req.query?.ok || ""),
  err: String(req.query?.err || "")
}));
});


app.get("/setari", requireAuth,(req,res)=>{
const companyId = Number(req.session.user.company_id || 0);
const isCompanyAdmin = String(req.session.user.role || "").toLowerCase() === "admin" || Number(req.session.user.is_company_admin || 0) === 1;
const canAccessSpvSettings = canAccessSpvUser(req.session.user);
const companyContext = getCompanySubscriptionContext(companyId);
const companyDetails = companyContext.company || {};
const activeSubscription = companyContext.subscription || null;
const companyStatus = String(companyDetails.status || activeSubscription?.status || "active").toLowerCase();
const stripeBillingConfigured = Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
const stripeWebhookConfigured = Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim());
const activeUserCount = Number(activeSubscription?.seats_used ?? 1) || 1;
const companyModuleLimit = Number(activeSubscription?.max_active_modules || 0);
const activeOptionalModuleCount = countOptionalCompanyModules(companyContext.activeModules);
const planOptions = companyContext.plans.map((plan) => {
  const planFeatures = parseJsonArray(plan.features_json, []);
  const pricingLabel = String(plan.pricing_model || "flat").trim().toLowerCase() === "per_user"
    ? `${escapeHtml(String(plan.price_monthly))} EUR / utilizator / luna`
    : `${escapeHtml(String(plan.price_monthly))} EUR / luna`;
  const chargePreview = planChargeAmount(plan, activeUserCount);
  const chargeQuantity = planChargeQuantity(plan, activeUserCount);
  const moduleLimitCopy = Number(plan.max_active_modules || 0) > 0
    ? `Pana la ${escapeHtml(String(plan.max_active_modules))} module operationale active`
    : Number(plan.max_modules_per_user || 0) > 0
      ? `Maximum ${escapeHtml(String(plan.max_modules_per_user))} module operationale / utilizator`
      : "Acces complet la toate modulele";
  return `
    <label style="display:grid;grid-template-columns:minmax(0,170px) minmax(0,1fr);gap:0;border:1px solid ${activeSubscription?.plan_id === plan.id ? "var(--primary)" : "var(--line)"};border-radius:22px;background:${activeSubscription?.plan_id === plan.id ? "rgba(255,255,255,.98)" : "rgba(255,255,255,.82)"};box-shadow:${activeSubscription?.plan_id === plan.id ? "0 0 0 3px var(--theme-ring)" : "none"};overflow:hidden">
      <div style="position:relative;min-height:180px;background:linear-gradient(135deg,#0f172a,#1d4ed8)">
        ${plan.image_path ? `<img src="${escapeHtml(plan.image_path)}" alt="${escapeHtml(plan.name || "Plan")}" style="width:100%;height:100%;object-fit:cover;display:block">` : ``}
        <div style="position:absolute;top:14px;left:14px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(String(plan.code || "plan").replaceAll("-", " "))}</div>
      </div>
      <div style="padding:18px 18px 16px">
        <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
          <div>
            <span style="display:block;font-weight:800;font-size:20px">${escapeHtml(plan.name)}</span>
            <span class="crm-muted" style="display:block;margin-top:6px;line-height:1.5">${escapeHtml(plan.tagline || "")}</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="text-align:right">
              <div style="font-size:18px;font-weight:800">${pricingLabel}</div>
              <div class="crm-muted" style="margin-top:4px;font-size:12px">${escapeHtml(String(plan.max_users || 0))} utilizatori max</div>
            </div>
            <input type="radio" name="plan_id" value="${plan.id}" ${activeSubscription?.plan_id === plan.id ? "checked" : ""} ${isCompanyAdmin ? "" : "disabled"}>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <span class="crm-badge crm-badge-blue">${moduleLimitCopy}</span>
          <span class="crm-badge crm-badge-green">${escapeHtml(String(chargePreview))} EUR estimat / luna${String(plan.pricing_model || "flat").trim().toLowerCase() === "per_user" ? ` pentru ${escapeHtml(String(chargeQuantity))} utilizatori activi` : ""}</span>
        </div>
        <div class="crm-muted" style="margin-top:14px;line-height:1.6">${escapeHtml(plan.description || "")}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
          ${planFeatures.map((feature) => `<span style="display:inline-flex;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(15,23,42,.04);border:1px solid var(--line);font-size:12px">${escapeHtml(feature)}</span>`).join("")}
        </div>
        <div style="display:grid;gap:8px;margin-top:14px" class="crm-muted">
          <div><b>Suport inclus:</b> ${escapeHtml(plan.support_copy || "Da, pentru modulele active din plan.")}</div>
          <div><b>Dezvoltare extra:</b> ${escapeHtml(plan.extra_dev_copy || "Se estimeaza si se taxeaza separat.")}</div>
        </div>
      </div>
    </label>
  `;
}).join("");
const groupedModuleCards = buildCompanyModuleGroups(companyContext).map((group) => {
  const moduleItems = (group.modules || []).map((module) => {
    return `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:${module.active ? "rgba(255,255,255,.96)" : "rgba(248,250,252,.92)"};opacity:${module.includedByPlan ? "1" : ".65"}">
        <input type="checkbox" name="module_keys" value="${module.key}" ${module.active ? "checked" : ""} disabled ${module.includedByPlan && !module.isCoreModule ? `data-company-module="1"` : ""}>
        ${module.includedByPlan && module.isCoreModule ? `<input type="hidden" name="module_keys" value="${module.key}">` : ``}
        <span>
          <span style="display:block;font-weight:700">${escapeHtml(module.label || module.key)}</span>
          <span class="crm-muted" style="display:block;margin-top:4px;font-size:12px">${escapeHtml(module.copy || "")}</span>
        </span>
      </label>
    `;
  }).join("");
  return `
    <div style="padding:16px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.7)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-weight:800">${escapeHtml(group.label)}</div>
          <div class="crm-muted" style="margin-top:4px;font-size:13px">${escapeHtml(group.description)}</div>
        </div>
        <div class="crm-badge crm-badge-blue">${escapeHtml(group.activeCount)}/${escapeHtml(group.totalCount)}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        ${moduleItems}
      </div>
    </div>
  `;
}).join("");

const html = `
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.settings-launcher{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:14px;
  margin-bottom:18px;
}
.settings-tab{
  appearance:none;
  border:1px solid var(--line);
  background:linear-gradient(180deg,rgba(255,255,255,.96) 0%, rgba(248,250,252,.88) 100%);
  color:var(--text);
  border-radius:22px;
  padding:18px 18px;
  text-align:left;
  cursor:pointer;
  box-shadow:var(--shadow-soft);
  position:relative;
  overflow:hidden;
  transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease,background .14s ease;
}
.settings-tab::before{
  content:"";
  position:absolute;
  inset:0 auto 0 0;
  width:4px;
  background:linear-gradient(180deg,var(--primary) 0%, var(--primary-2) 100%);
  opacity:.18;
  transition:opacity .14s ease, width .14s ease;
}
.settings-tab:hover{
  transform:translateY(-1px);
  border-color:var(--primary);
  box-shadow:0 14px 34px rgba(15,23,42,.10);
}
.settings-tab.active{
  border-color:var(--primary);
  box-shadow:0 0 0 4px var(--theme-ring), 0 18px 40px rgba(15,23,42,.10);
  background:linear-gradient(180deg,rgba(255,255,255,.99) 0%, rgba(242,248,255,.94) 100%);
}
.settings-tab.active::before{
  opacity:1;
  width:6px;
}
.settings-tab-head{
  display:flex;
  align-items:flex-start;
  gap:12px;
}
.settings-tab-icon{
  width:42px;
  height:42px;
  border-radius:14px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  background:linear-gradient(135deg,var(--primary),var(--primary-2));
  color:#fff;
  box-shadow:0 10px 22px rgba(37,99,235,.22);
}
.settings-tab-icon svg{
  width:18px;
  height:18px;
  stroke:currentColor;
  fill:none;
  stroke-width:2;
  stroke-linecap:round;
  stroke-linejoin:round;
}
.settings-tab-copy{
  min-width:0;
}
.settings-tab-title{
  font-size:16px;
  font-weight:800;
}
.settings-tab-sub{
  margin-top:6px;
  color:var(--muted);
  font-size:13px;
  line-height:1.45;
}
.settings-panel{
  display:none;
}
.settings-panel.active{
  display:block;
  animation:settingsPanelIn .18s ease;
}
@keyframes settingsPanelIn{
  from{opacity:0;transform:translateY(4px)}
  to{opacity:1;transform:translateY(0)}
}
@media (max-width: 1100px){
  .settings-launcher{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width: 720px){
  .settings-launcher{grid-template-columns:1fr}
}
</style>
<meta charset="utf-8">
<title>Setări firmă</title>
</head>

${crmShellStart("setari", "Setări", "Configurare firmă, facturi și identitate vizuală.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="settings-launcher">
    <button class="settings-tab active" type="button" data-settings-target="company">
      <div class="settings-tab-head">
        <span class="settings-tab-icon">
          <svg viewBox="0 0 24 24"><path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-5h6v5"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>
        </span>
        <span class="settings-tab-copy">
          <div class="settings-tab-title">Date firmă</div>
          <div class="settings-tab-sub">Date comerciale, facturare și informațiile de bază ale companiei.</div>
        </span>
      </div>
    </button>
    <button class="settings-tab" type="button" data-settings-target="subscription">
      <div class="settings-tab-head">
        <span class="settings-tab-icon">
          <svg viewBox="0 0 24 24"><path d="M5 7h14"/><path d="M7 4h10v16H7z"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>
        </span>
        <span class="settings-tab-copy">
          <div class="settings-tab-title">Abonament & module</div>
          <div class="settings-tab-sub">Planul companiei, modulele active CRM/ERP și limitele de utilizatori.</div>
        </span>
      </div>
    </button>
    <button class="settings-tab" type="button" data-settings-target="theme">
      <div class="settings-tab-head">
        <span class="settings-tab-icon">
          <svg viewBox="0 0 24 24"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2.1 2.1"/><path d="M16.3 16.3l2.1 2.1"/><path d="M18.4 5.6l-2.1 2.1"/><path d="M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>
        </span>
        <span class="settings-tab-copy">
          <div class="settings-tab-title">Temă interfață</div>
          <div class="settings-tab-sub">Alegi stilul vizual al aplicației și look-ul shell-ului.</div>
        </span>
      </div>
    </button>
    <button class="settings-tab" type="button" data-settings-target="logo">
      <div class="settings-tab-head">
        <span class="settings-tab-icon">
          <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20 16l-4.5-4.5L7 20"/></svg>
        </span>
        <span class="settings-tab-copy">
          <div class="settings-tab-title">Logo factură</div>
          <div class="settings-tab-sub">Upload pentru logo-ul folosit în PDF-urile de factură.</div>
        </span>
      </div>
    </button>
    ${canAccessSpvSettings ? `
    <button class="settings-tab" type="button" data-settings-target="spv">
      <div class="settings-tab-head">
        <span class="settings-tab-icon">
          <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>
        </span>
        <span class="settings-tab-copy">
          <div class="settings-tab-title">Conectare SPV / e-Factura</div>
          <div class="settings-tab-sub">Setări ANAF, OAuth și acces rapid la inbox / outbox.</div>
        </span>
      </div>
    </button>
    ` : ``}
  </div>

  <div class="crm-grid" style="margin-bottom:18px">
    <section class="crm-card settings-panel active" data-settings-panel="company">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Date firmă</h3>
        <div class="crm-muted" style="margin-top:6px">Informațiile folosite în documente și facturi.</div>
      </div>

      <form method="post" action="/setari" class="crm-stack">
        <div>
          <label class="crm-label">Nume firmă</label>
          <input class="crm-input" name="company_name" value="${escapeHtml(companyDetails.name || getSetting("company_name","QR-LAB SRL"))}">
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">CUI</label>
            <input class="crm-input" name="company_cui" value="${escapeHtml(companyDetails.cui || getSetting("company_cui",""))}">
          </div>
          <div>
            <label class="crm-label">RC</label>
            <input class="crm-input" name="company_rc" value="${escapeHtml(companyDetails.rc || getSetting("company_rc",""))}">
          </div>
        </div>

        <div>
          <label class="crm-label">Adresă</label>
          <input class="crm-input" name="company_address" value="${escapeHtml(companyDetails.address || getSetting("company_address",""))}">
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">IBAN</label>
            <input class="crm-input" name="company_iban" value="${escapeHtml(companyDetails.iban || getSetting("company_iban",""))}">
          </div>
          <div>
            <label class="crm-label">Banca</label>
            <input class="crm-input" name="company_bank" value="${escapeHtml(companyDetails.bank || getSetting("company_bank",""))}">
          </div>
        </div>

        <div>
          <label class="crm-label">Reprezentant</label>
          <input class="crm-input" name="company_rep" value="${escapeHtml(companyDetails.representative || getSetting("company_rep",""))}">
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Serie / număr de pornire facturi</label>
            <input class="crm-input" name="invoice_series" value="${getSetting("invoice_series","INV")}">
            <div class="crm-muted" style="margin-top:6px">Exemple: <code>INV</code> pentru formatul clasic sau <code>FITS-049</code> pentru numerotare directă dintr-un număr ales.</div>
          </div>
          <div>
            <label class="crm-label">Culoare temă</label>
            <input class="crm-input" type="color" name="invoice_color" value="${getSetting("invoice_color","#39a935")}" style="min-height:46px;padding:6px">
          </div>
        </div>

        <div>
          <label class="crm-label">Capital social</label>
          <input class="crm-input" name="capital_social" value="${getSetting("capital_social","")}">
        </div>

        <div>
          <label class="crm-label">Text footer factură</label>
          <textarea class="crm-textarea" name="invoice_footer" rows="5">${getSetting("invoice_footer","Factura este valabila fara semnatura conform legii.")}</textarea>
        </div>

        <div>
          <button class="crm-btn" type="submit">Salvează setările</button>
        </div>
      </form>
    </section>

    <section class="crm-card settings-panel" data-settings-panel="subscription">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Abonament & module</h3>
        <div class="crm-muted" style="margin-top:6px">Controlezi planul lunar și modulele active pentru compania curentă.</div>
      </div>

      <div class="crm-grid-2" style="overflow:visible;align-items:start">
        <div class="crm-stack">
          <div style="padding:18px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.72)">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
              <div>
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Companie</div>
                <div style="font-size:20px;font-weight:800;margin-top:6px">${escapeHtml(companyDetails.name || req.session.user.company_name || "Companie")}</div>
                <div class="crm-muted" style="margin-top:6px">CUI ${escapeHtml(companyDetails.cui || "neconfigurat")} • ${escapeHtml(companyStatus)}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <div class="crm-badge crm-badge-green">${escapeHtml(activeSubscription?.plan_name || "Fără plan")}</div>
                ${companyStatusBadge(companyStatus)}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:16px">
              <div style="padding:14px;border-radius:14px;background:rgba(248,250,252,.92)">
                <div class="crm-muted" style="font-size:12px">Utilizatori activi</div>
                <div style="font-size:24px;font-weight:800;margin-top:6px">${escapeHtml(String(activeSubscription?.seats_used ?? 0))}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(248,250,252,.92)">
                <div class="crm-muted" style="font-size:12px">Locuri incluse</div>
                <div style="font-size:24px;font-weight:800;margin-top:6px">${escapeHtml(String(activeSubscription?.seats_included ?? companyDetails.max_users ?? 0))}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(248,250,252,.92)">
                <div class="crm-muted" style="font-size:12px">Module active</div>
                <div style="font-size:24px;font-weight:800;margin-top:6px">${escapeHtml(String(activeOptionalModuleCount))}${companyModuleLimit > 0 ? ` / ${escapeHtml(String(companyModuleLimit))}` : ""}</div>
                <div class="crm-muted" style="margin-top:6px;font-size:12px">${companyModuleLimit > 0 ? "module operationale active" : "module operationale active fara plafon de plan"}</div>
              </div>
            </div>
          </div>

          <form method="post" action="/setari/subscription" class="crm-stack">
            <div>
              <label class="crm-label">Planuri disponibile</label>
              <div class="crm-stack">${planOptions}</div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="crm-btn" type="submit" ${isCompanyAdmin ? "" : "disabled"}>Salvează abonamentul</button>
              ${!isCompanyAdmin ? `<span class="crm-muted">Doar administratorul companiei poate modifica abonamentul.</span>` : ``}
            </div>
          </form>

          <div style="padding:18px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.72)">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
              <div>
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Stripe Billing</div>
                <div style="font-size:20px;font-weight:800;margin-top:6px">Plată abonament</div>
                <div class="crm-muted" style="margin-top:6px">Checkout securizat pentru planul curent și sincronizare automată în MiniCRM.</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${stripeBillingConfigured ? `<span class="crm-badge crm-badge-green">Stripe conectat</span>` : `<span class="crm-badge crm-badge-red">Stripe neconfigurat</span>`}
                ${stripeWebhookConfigured ? `<span class="crm-badge crm-badge-blue">Webhook OK</span>` : `<span class="crm-badge crm-badge-amber">Webhook lipsă</span>`}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px">
              <div style="padding:14px;border-radius:14px;background:rgba(248,250,252,.92)">
                <div class="crm-muted" style="font-size:12px">Status plată</div>
                <div style="font-size:20px;font-weight:800;margin-top:6px">${escapeHtml(activeSubscription?.last_payment_status || "neinițiat")}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(248,250,252,.92)">
                <div class="crm-muted" style="font-size:12px">Monedă billing</div>
                <div style="font-size:20px;font-weight:800;margin-top:6px">${escapeHtml(String(activeSubscription?.billing_currency || process.env.STRIPE_CURRENCY || "eur").toUpperCase())}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(248,250,252,.92)">
                <div class="crm-muted" style="font-size:12px">Perioadă curentă până la</div>
                <div style="font-size:20px;font-weight:800;margin-top:6px">${escapeHtml(activeSubscription?.current_period_end || "—")}</div>
              </div>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
              <a class="crm-btn" href="/billing/checkout">Plătește cu Stripe</a>
              <a class="crm-btn crm-btn-secondary" href="/billing/portal">Portal facturare</a>
              <a class="crm-btn crm-btn-secondary" href="/billing/status" target="_blank">Status JSON</a>
            </div>

            <div style="margin-top:14px" class="crm-muted">
              Estimarea de mai sus foloseste ${escapeHtml(String(activeUserCount))} utilizatori activi. Configureaza in server: <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>, optional <code>STRIPE_CURRENCY</code> si <code>APP_URL</code>.
            </div>
          </div>
        </div>

        <form method="post" action="/setari/modules" class="crm-stack" data-company-module-form>
          <div>
            <label class="crm-label">Module active pentru companie</label>
            <div class="crm-muted" style="margin-bottom:12px">Modulele companiei sunt stabilite de super admin prin contract. Drepturile pe utilizator raman in <code>Utilizatori</code>.</div>
            ${companyModuleLimit > 0 ? `<div class="crm-card" style="margin-bottom:12px;border:1px solid #bfdbfe;background:#eff6ff"><div style="font-weight:800;color:#1d4ed8;margin-bottom:6px">Limita plan</div><div class="crm-muted">Planul curent permite maximum ${escapeHtml(String(companyModuleLimit))} module operationale active. Dashboard si Setari raman incluse separat.</div></div>` : ``}
            <div class="crm-stack">
              ${groupedModuleCards}
            </div>
          </div>
          <div style="padding:16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc">
            <div style="font-weight:800;margin-bottom:8px">Cum funcționează</div>
            <div class="crm-muted">
              Abonamentul defineste plafonul de module disponibile. Aici alegi ce ramane activ pentru companie, iar apoi in <code>Utilizatori</code> controlezi ce vede fiecare persoana din echipa.
            </div>
          </div>
          <div>
            <button class="crm-btn" type="submit" disabled>Salvează modulele active</button>
            <a class="crm-btn crm-btn-secondary" href="/nexora/users">Utilizatori & roluri</a>
          </div>
        </form>
      </div>
    </section>

    <section class="crm-card settings-panel" data-settings-panel="theme">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Temă interfață</h3>
        <div class="crm-muted" style="margin-top:6px">Alegerea se salvează local în browser și schimbă rapid look-ul shell-ului vechi.</div>
      </div>

      <div class="crm-theme-switcher" style="justify-content:flex-start">
        <button class="crm-theme-chip" type="button" data-crm-theme="executive-slate">
          <span class="crm-theme-dot" style="background:linear-gradient(135deg,#2563eb,#16a34a)"></span>
          Executive
        </button>
        <button class="crm-theme-chip" type="button" data-crm-theme="ivory-gold">
          <span class="crm-theme-dot" style="background:linear-gradient(135deg,#b8860b,#f5e6c8)"></span>
          Ivory Gold
        </button>
        <button class="crm-theme-chip" type="button" data-crm-theme="forest-ledger">
          <span class="crm-theme-dot" style="background:linear-gradient(135deg,#166534,#86efac)"></span>
          Forest
        </button>
        <button class="crm-theme-chip" type="button" data-crm-theme="midnight-neon">
          <span class="crm-theme-dot" style="background:linear-gradient(135deg,#0f172a,#22c1ff)"></span>
          Midnight
        </button>
      </div>

      <div style="margin-top:18px;padding:16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc">
        <div style="font-weight:800;margin-bottom:8px">Observație</div>
        <div class="crm-muted">Nexora folosește shell-ul nou. Tema de aici rămâne pentru ecranele vechi până le migrăm complet.</div>
      </div>
    </section>

    <section class="crm-card settings-panel" data-settings-panel="logo">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Logo factură</h3>
        <div class="crm-muted" style="margin-top:6px">Fișierul va fi salvat ca <code>public/invoice-logo.png</code>.</div>
      </div>

      <form method="post" action="/setari/logo" enctype="multipart/form-data" class="crm-stack">
        <div>
          <label class="crm-label">Selectează logo</label>
          <input class="crm-input" type="file" name="logo">
        </div>
        <div>
          <button class="crm-btn" type="submit">Upload logo</button>
        </div>
      </form>

      <div style="margin-top:18px;padding:16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc">
        <div style="font-weight:800;margin-bottom:8px">Recomandare</div>
        <div class="crm-muted">
          Pentru rezultat bun în PDF, folosește un PNG cu fundal transparent și lățime rezonabilă.
        </div>
      </div>
    </section>

    ${canAccessSpvSettings ? `
    <section class="crm-card settings-panel" data-settings-panel="spv">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Conectare SPV / e-Factura</h3>
        <div class="crm-muted" style="margin-top:6px">Pregătire integrare directă ANAF pentru autorizare SPV, trimitere și recepție e-Factura.</div>
      </div>

      <form method="post" action="/setari" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Mediu ANAF</label>
            <select class="crm-input" name="anaf_environment">
              <option value="test" ${getSetting("anaf_environment","test") === "test" ? "selected" : ""}>test</option>
              <option value="prod" ${getSetting("anaf_environment","test") === "prod" ? "selected" : ""}>prod</option>
            </select>
          </div>
          <div>
            <label class="crm-label">Redirect URI</label>
            <input class="crm-input" name="anaf_redirect_uri" value="${escapeHtml(getSetting("anaf_redirect_uri","https://minicrm.qr-lab.ro/oauth/anaf/callback"))}">
          </div>
        </div>

        <div>
          <label class="crm-label">Client ID aplicație</label>
          <input class="crm-input" name="anaf_client_id" value="${escapeHtml(getSetting("anaf_client_id",""))}" placeholder="Client ID primit de la ANAF">
        </div>

        <div>
          <label class="crm-label">Client Secret aplicație</label>
          <input class="crm-input" type="password" name="anaf_client_secret" value="${escapeHtml(getSetting("anaf_client_secret",""))}" placeholder="Client Secret primit de la ANAF">
        </div>

        <div style="padding:16px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc">
          <div style="font-weight:800;margin-bottom:8px">Status infrastructură</div>
          <div class="crm-muted">
            Modulul e-Factura are acum fluxul OAuth SPV pregătit. După configurarea aplicației în ANAF, poți porni autorizarea direct din MiniCRM.
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="crm-btn" type="submit">Salvează setările ANAF</button>
          <a class="crm-btn" href="/oauth/anaf/start">Conectează SPV</a>
          <a class="crm-btn crm-btn-secondary" href="/anaf/status">Status ANAF</a>
          <a class="crm-btn crm-btn-secondary" href="/anaf/inbox">Inbox e-Factura</a>
          <a class="crm-btn crm-btn-secondary" href="/anaf/outbox">Outbox e-Factura</a>
        </div>
      </form>
    </section>
    ` : ``}
  </div>

${crmShellEnd()}
<script>
  (function(){
    const tabs = Array.from(document.querySelectorAll("[data-settings-target]"));
    const panels = Array.from(document.querySelectorAll("[data-settings-panel]"));
    const companyModuleLimit = ${Number.isFinite(companyModuleLimit) ? companyModuleLimit : 0};
    const moduleCheckboxes = Array.from(document.querySelectorAll('input[data-company-module="1"]'));

    function openPanel(target){
      tabs.forEach((tab) => {
        tab.classList.toggle("active", tab.getAttribute("data-settings-target") === target);
      });
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.getAttribute("data-settings-panel") === target);
      });
    }

    function syncCompanyModuleLimit(){
      if (!companyModuleLimit || companyModuleLimit < 1) return;
      const checkedCount = moduleCheckboxes.filter((input) => input.checked).length;
      moduleCheckboxes.forEach((input) => {
        input.disabled = !input.checked && checkedCount >= companyModuleLimit;
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => openPanel(tab.getAttribute("data-settings-target")));
    });
    moduleCheckboxes.forEach((input) => input.addEventListener("change", syncCompanyModuleLimit));
    syncCompanyModuleLimit();
  })();
</script>
</html>
`;

res.send(html);
});


app.post("/setari", requireAuth,(req,res)=>{
const companyId = Number(req.session.user.company_id || 0);
const canManageSpvSettings = canAccessSpvUser(req.session.user);
const wantsNexora = String(req.body?.return_to || "") === "nexora";
const requestedTab = String(req.body?.settings_tab || "company").trim().toLowerCase();
const nextTab = ["company", "invoice", "spv"].includes(requestedTab) ? requestedTab : "company";
const companyPayloadKeys = ["company_name", "company_cui", "company_rc", "company_address", "company_bank", "company_iban", "company_rep"];
const hasCompanyPayload = companyPayloadKeys.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));

for(const k of Object.keys(req.body)){
if(["return_to", "settings_tab"].includes(k)) continue;
if(!canManageSpvSettings && String(k || "").startsWith("anaf_")) continue;
setSetting(k,req.body[k]);
}

if (companyId && hasCompanyPayload) {
  db.prepare(`
    UPDATE companies
    SET name=?,
        cui=?,
        rc=?,
        address=?,
        bank=?,
        iban=?,
        representative=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(
    String(req.body?.company_name || "").trim(),
    String(req.body?.company_cui || "").trim(),
    String(req.body?.company_rc || "").trim(),
    String(req.body?.company_address || "").trim(),
    String(req.body?.company_bank || "").trim(),
    String(req.body?.company_iban || "").trim(),
    String(req.body?.company_rep || "").trim(),
    companyId
  );
  refreshSessionCompanyAccess(req);
}

res.redirect(wantsNexora ? `/nexora/settings?tab=${encodeURIComponent(nextTab)}&ok=saved` : "/setari");
});

app.post("/setari/subscription", requireAuth, requireRole("admin"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const planId = Number(req.body?.plan_id);
  if (!companyId || !Number.isFinite(planId)) return res.status(400).send("Plan invalid");

  const plan = db.prepare(`
    SELECT id, max_users, pricing_model, price_monthly, max_modules_per_user, max_active_modules, module_keys
    FROM plans
    WHERE id=? AND status='active' AND COALESCE(is_public, 1) = 1
  `).get(planId);
  if (!plan) return res.status(404).send("Plan not found");

  const currentSubscription = db.prepare(`
    SELECT id, module_overrides
    FROM company_subscriptions
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);
  if (!currentSubscription) return res.status(404).send("Subscription not found");

  const currentUsers = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE company_id=?`).get(companyId)?.n || 0;
  if (currentUsers > Math.max(Number(plan.max_users || 1), 1)) {
    return res.status(400).send(`Compania are deja ${currentUsers} utilizatori. Planul selectat permite maximum ${Math.max(Number(plan.max_users || 1), 1)}.`);
  }

  const planModules = parseJsonArray(plan.module_keys, []);
  const existingOverrides = parseJsonArray(currentSubscription?.module_overrides, planModules);
  const nextOverrides = normalizeCompanyModules(existingOverrides, planModules, plan, { companyIsDemo: false });

  db.prepare(`
    UPDATE company_subscriptions
    SET plan_id=?,
        seats_included=?,
        module_overrides=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(
    plan.id,
    Math.max(Number(plan.max_users || 1), 1),
    JSON.stringify(nextOverrides),
    currentSubscription?.id
  );

  db.prepare(`
    UPDATE companies
    SET max_users=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(Math.max(Number(plan.max_users || 1), 1), companyId);

  resyncCompanyUserModules(companyId);
  syncCompanySeatUsage(companyId);
  refreshSessionCompanyAccess(req);
  res.redirect(req.body?.return_to === "nexora" ? "/nexora/settings?tab=subscription&ok=subscription" : "/setari");
});

app.post("/setari/modules", requireAuth, requireRole("admin"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  if (!companyId) return res.status(400).send("Companie invalidă");
  if (!Number(req.session.user.is_super_admin || 0)) {
    return res.redirect(req.body?.return_to === "nexora"
      ? "/nexora/settings?tab=subscription&err=modules_contract"
      : "/setari");
  }

  let moduleKeys = req.body?.module_keys || [];
  if (!Array.isArray(moduleKeys)) moduleKeys = [moduleKeys];
  moduleKeys = moduleKeys.map(String);

  const { company, subscription, planModules } = getCompanySubscriptionContext(companyId);
  if (!subscription) return res.status(404).send("Subscription not found");

  const nextModules = normalizeCompanyModules(moduleKeys, planModules, subscription, {
    companyIsDemo: Number(company?.is_demo || 0) === 1
  });

  db.prepare(`
    UPDATE company_subscriptions
    SET module_overrides=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(JSON.stringify(nextModules), subscription.id);

  resyncCompanyUserModules(companyId);
  refreshSessionCompanyAccess(req);
  res.redirect(req.body?.return_to === "nexora" ? "/nexora/settings?tab=subscription&ok=modules" : "/setari");
});


app.post("/setari/logo", requireAuth, upload.single("logo"),(req,res)=>{

const wantsNexora = String(req.body?.return_to || "") === "nexora";
if(!req.file) return res.redirect(wantsNexora ? "/nexora/settings?tab=logo&err=no_file" : "/setari");

const companyId = Number(req.session.user.company_id || 0);
const logoDir = companyId > 0
  ? path.join(__dirname, "public", "uploads", "company-logos")
  : path.join(__dirname, "public");
fs.mkdirSync(logoDir, { recursive: true });
const ext = String(req.file.mimetype || "").toLowerCase().includes("webp")
  ? "webp"
  : String(req.file.mimetype || "").toLowerCase().includes("jpeg") || String(req.file.mimetype || "").toLowerCase().includes("jpg")
    ? "jpg"
    : "png";
const dest = companyId > 0
  ? path.join(logoDir, `company-${companyId}.${ext}`)
  : path.join(logoDir, "invoice-logo.png");
if (companyId > 0) {
  for (const oldExt of ["png", "jpg", "jpeg", "webp"]) {
    const oldPath = path.join(logoDir, `company-${companyId}.${oldExt}`);
    if (oldPath !== dest && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
}

fs.renameSync(req.file.path,dest);

res.redirect(wantsNexora ? "/nexora/settings?tab=logo&ok=logo" : "/setari");

});


app.get("/nexora/anaf/status", requireAuth, requireSpvAccess, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const oauthState = String(req.query.oauth || "");
  const oauthMessage = String(req.query.message || "");
  const reauthRequested = String(req.query.reauth || "").trim() === "needed";
  const environment = String(getSetting("anaf_environment","test") || "test").trim() || "test";
  const redirectUri = String(getSetting("anaf_redirect_uri","https://minicrm.qr-lab.ro/oauth/anaf/callback") || "").trim();
  const efacturaApiBase = `https://api.anaf.ro/${environment === "prod" ? "prod" : "test"}/FCTEL/rest`;
  const inviteFlash = req.session?.anafInviteFlash && typeof req.session.anafInviteFlash === "object"
    ? { ...req.session.anafInviteFlash }
    : null;
  delete req.session.anafInviteFlash;

  const latestConnections = db.prepare(`
    SELECT environment, serial_certificate, expires_at, refresh_expires_at, updated_at
    FROM anaf_connections
    WHERE company_id=?
    ORDER BY id DESC
  `).all(companyId);

  const latestTestConnection = latestConnections.find((row) => String(row.environment || "").trim() === "test") || null;
  const latestProdConnection = latestConnections.find((row) => String(row.environment || "").trim() === "prod") || null;

  const isAccessTokenActive = (row) => {
    if (!row) return false;
    const expiresMs = row.expires_at ? Date.parse(String(row.expires_at)) : NaN;
    return !Number.isFinite(expiresMs) || expiresMs > Date.now();
  };

  const isRefreshTokenActive = (row) => {
    if (!row) return false;
    const expiresMs = row.refresh_expires_at ? Date.parse(String(row.refresh_expires_at)) : NaN;
    return !Number.isFinite(expiresMs) || expiresMs > Date.now();
  };

  const normalizeConnection = (row) => row ? {
    ...row,
    accessActive: isAccessTokenActive(row),
    refreshActive: isRefreshTokenActive(row)
  } : null;

  const lastOauthLog = db.prepare(`
    SELECT event_type, status, details, created_at
    FROM anaf_oauth_logs
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);

  res.send(renderNexoraAnafStatusPage({
    user: req.session.user,
    environment,
    efacturaApiBase,
    redirectUri,
    oauthState,
    oauthMessage,
    reauthRequested,
    inviteFlash,
    latestTestConnection: normalizeConnection(latestTestConnection),
    latestProdConnection: normalizeConnection(latestProdConnection),
    lastOauthLog
  }));
});

app.get("/anaf/status", requireAuth, requireSpvAccess, (req,res)=>{
  const companyId = Number(req.session.user.company_id || 0);
  const oauthState = String(req.query.oauth || "");
  const oauthMessage = String(req.query.message || "");
  const reauthRequested = String(req.query.reauth || "").trim() === "needed";
  const environment = String(getSetting("anaf_environment","test") || "test").trim() || "test";
  const oauthScope = String(getSetting("anaf_scope","") || "").trim();
  const redirectUri = String(getSetting("anaf_redirect_uri","https://minicrm.qr-lab.ro/oauth/anaf/callback") || "").trim();
  const authorizeUrl = String(getSetting("anaf_authorize_url","https://logincert.anaf.ro/anaf-oauth2/v1/authorize") || "https://logincert.anaf.ro/anaf-oauth2/v1/authorize").trim();
  const tokenUrl = String(getSetting("anaf_token_url","https://logincert.anaf.ro/anaf-oauth2/v1/token") || "https://logincert.anaf.ro/anaf-oauth2/v1/token").trim();
  const efacturaApiBase = `https://api.anaf.ro/${environment === "prod" ? "prod" : "test"}/FCTEL/rest`;
  const appUrlBase = (String(process.env.APP_URL || "").trim() || `${String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim()}://${req.get("host")}`).replace(/\/+$/, "");
  const inviteFlash = req.session?.anafInviteFlash && typeof req.session.anafInviteFlash === "object"
    ? { ...req.session.anafInviteFlash }
    : null;
  delete req.session.anafInviteFlash;
  const connectionCounts = db.prepare(`
    SELECT environment, COUNT(*) c
    FROM anaf_connections
    WHERE company_id=?
    GROUP BY environment
  `).all(companyId);
  const connectionCountMap = Object.fromEntries(
    connectionCounts.map((row) => [String(row.environment || "").trim(), Number(row.c || 0)])
  );
  const latestConnections = db.prepare(`
    SELECT environment, serial_certificate, expires_at, refresh_expires_at, updated_at
    FROM anaf_connections
    WHERE company_id=?
    ORDER BY id DESC
  `).all(companyId);
  const latestTestConnection = latestConnections.find((row) => String(row.environment || "").trim() === "test");
  const latestProdConnection = latestConnections.find((row) => String(row.environment || "").trim() === "prod");
  const lastOauthLog = db.prepare(`
    SELECT event_type, status, details, created_at
    FROM anaf_oauth_logs
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);
  const parseJsonObject = (value) => {
    try {
      const parsed = JSON.parse(String(value || ""));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };
  const isAccessTokenActive = (row) => {
    if (!row) return false;
    const expiresMs = row.expires_at ? Date.parse(String(row.expires_at)) : NaN;
    return !Number.isFinite(expiresMs) || expiresMs > Date.now();
  };
  const isRefreshTokenActive = (row) => {
    if (!row) return false;
    const expiresMs = row.refresh_expires_at ? Date.parse(String(row.refresh_expires_at)) : NaN;
    return !Number.isFinite(expiresMs) || expiresMs > Date.now();
  };
  const isConnectionUsable = (row) => isAccessTokenActive(row) || isRefreshTokenActive(row);
  const connectionStateBadge = (row) => {
    if (!row) return "";
    if (isAccessTokenActive(row)) return ' <span class="crm-badge crm-badge-green" style="margin-left:8px">activă</span>';
    if (isRefreshTokenActive(row)) return ' <span class="crm-badge crm-badge-blue" style="margin-left:8px">refresh disponibil</span>';
    return ' <span class="crm-badge" style="margin-left:8px">reautorizare necesară</span>';
  };
  const formatConnectionSummary = (row) => {
    if (!row) return "niciuna";
    const parts = [];
    if (row.updated_at) parts.push(escapeHtml(row.updated_at));
    if (row.serial_certificate) parts.push(`serial ${escapeHtml(String(row.serial_certificate).slice(0, 24))}`);
    if (row.expires_at) parts.push(`token acces până la ${escapeHtml(row.expires_at)}`);
    if (row.refresh_expires_at) parts.push(`refresh până la ${escapeHtml(row.refresh_expires_at)}`);
    return parts.join(" / ");
  };
  const lastOauthDetails = parseJsonObject(lastOauthLog?.details || "");
  const showAccessDeniedHint = String(lastOauthDetails?.error || "").trim() === "access_denied" || /access_denied/i.test(oauthMessage);
  const activeEnvironmentConnection = environment === "prod" ? latestProdConnection : latestTestConnection;
  const activeEnvironmentLabel = environment === "prod" ? "PRODUCȚIE" : "TEST";
  const oauthSuggestsReauth = /refresh token|token anaf invalid|access_denied|expirat|autorizat|conexiune anaf/i.test(oauthMessage);
  const lastLogSuggestsReauth = /refresh token|token anaf invalid|access_denied|expirat/i.test(String(lastOauthLog?.details || ""));
  const hasSavedConnection = Boolean(activeEnvironmentConnection);
  const needsConnectionSetup = !hasSavedConnection;
  const needsManualReauth = reauthRequested || oauthSuggestsReauth || lastLogSuggestsReauth || (hasSavedConnection && !isConnectionUsable(activeEnvironmentConnection));
  const activeConnectionBanner = activeEnvironmentConnection && isConnectionUsable(activeEnvironmentConnection)
    ? `
      <div class="crm-card" style="margin-bottom:16px;border:1px solid #86efac;background:#f0fdf4">
        <div style="font-weight:800;margin-bottom:6px">Conexiune ${activeEnvironmentLabel} disponibilă</div>
        <div>Există deja o conexiune ANAF salvată pentru mediul curent: ${formatConnectionSummary(activeEnvironmentConnection)}. Facturile pot fi trimise în continuare cât timp tokenul de acces sau refresh-ul rămân valabile.</div>
      </div>
    `
    : "";
  const setupBanner = (needsConnectionSetup || needsManualReauth)
    ? `
      <div class="crm-card" style="margin-bottom:16px;border:1px solid #fcd34d;background:#fffbeb">
        <div style="font-weight:800;margin-bottom:6px">${needsConnectionSetup ? "Conectare SPV necesară" : "Reautorizare SPV necesară"}</div>
        <div>${needsConnectionSetup
          ? "Nu există încă o conexiune salvată pentru acest workspace. Poți conecta direct contul ANAF în acest browser sau poți genera un cod / link pentru contabil."
          : "Conexiunea SPV trebuie refăcută. Generează un cod pentru contabil, mai ales după reînnoirea certificatului digital sau când refresh tokenul nu mai este acceptat."}</div>
      </div>
    `
    : "";
  const accessDeniedHelp = showAccessDeniedHint
    ? `
      <div class="crm-card" style="margin-bottom:16px;border:1px solid #fcd34d;background:#fffbeb">
        <div style="font-weight:800;margin-bottom:6px">Diagnostic rapid pentru access_denied</div>
        <div>ANAF a respins autorizarea înainte de emiterea codului OAuth. Cauzele uzuale sunt: autentificare cu alt certificat digital, lipsa rolului SPV PJ, închiderea ferestrei de aprobare sau Redirect URI diferit față de aplicația înrolată în portal.</div>
        <div style="margin-top:8px">Redirect URI-ul care trebuie să existe identic în ANAF este: <b>${escapeHtml(redirectUri)}</b></div>
      </div>
    `
    : "";
  const oauthBanner = oauthState
    ? `
      <div class="crm-card" style="margin-bottom:16px;border:${oauthState === "success" ? "1px solid #86efac;background:#f0fdf4" : "1px solid #fecaca;background:#fef2f2"}">
        <div style="font-weight:800;margin-bottom:6px">${oauthState === "success" ? "Conectare ANAF reușită" : "Conectare ANAF eșuată"}</div>
        <div>${escapeHtml(oauthMessage || (oauthState === "success" ? "Conexiunea a fost salvată." : "A apărut o eroare la autorizare."))}</div>
      </div>
    `
    : "";
  const inviteFlashTone = inviteFlash?.status === "error"
    ? { border: "#fecaca", background: "#fef2f2", title: "Generare eșuată" }
    : inviteFlash?.status === "warning"
      ? { border: "#fcd34d", background: "#fffbeb", title: "Cod generat cu avertisment" }
      : { border: "#86efac", background: "#f0fdf4", title: "Cod pentru contabil generat" };
  const inviteFlashCard = inviteFlash
    ? `
      <section class="crm-card" style="margin-bottom:16px;border:1px solid ${inviteFlashTone.border};background:${inviteFlashTone.background}">
        <div style="font-weight:800;margin-bottom:6px">${inviteFlashTone.title}</div>
        <div class="crm-muted" style="margin-bottom:12px">${escapeHtml(String(inviteFlash.message || "").trim() || "Codul de reautorizare este pregătit.")}</div>
        ${inviteFlash.code ? `
          <div class="crm-stack" style="gap:10px">
            <div>
              <div style="font-weight:700;margin-bottom:6px">Cod pentru contabil</div>
              <input class="crm-input" readonly onclick="this.select()" value="${escapeHtml(inviteFlash.code)}">
            </div>
            <div>
              <div style="font-weight:700;margin-bottom:6px">Link direct</div>
              <input class="crm-input" readonly onclick="this.select()" value="${escapeHtml(inviteFlash.invite_link || "")}">
            </div>
            <div class="crm-muted">Dacă nu folosește linkul direct, contabilul poate deschide <b>${escapeHtml(inviteFlash.portal_link || `${appUrlBase}/anaf/reautorizare`)}</b> și introduce manual codul de mai sus.</div>
            <div><b>Expiră la:</b> ${escapeHtml(inviteFlash.expires_at || "—")}</div>
            ${inviteFlash.accountant_email ? `<div><b>Email contabil:</b> ${escapeHtml(inviteFlash.accountant_email)}</div>` : ``}
            <div><b>Mediu:</b> ${escapeHtml(String(inviteFlash.environment || environment).toUpperCase())}</div>
          </div>
        ` : ``}
      </section>
    `
    : "";
  const environmentBanner = environment === "prod"
    ? `
      <div class="crm-card" style="margin-bottom:16px;border:1px solid #86efac;background:#f0fdf4">
        <div style="font-weight:800;margin-bottom:6px">Mediu activ: PRODUCȚIE</div>
        <div>Aplicația este setată pe producție. Trimiterile e-Factura sunt reale și pot ajunge în SPV producție.</div>
      </div>
    `
    : `
      <div class="crm-card" style="margin-bottom:16px;border:1px solid #93c5fd;background:#eff6ff">
        <div style="font-weight:800;margin-bottom:6px">Mediu activ: TEST</div>
        <div>Aplicația este setată pe test. Facturile trimise din acest mod nu trebuie considerate trimiteri reale în SPV producție.</div>
      </div>
    `;
  const accountantSection = `
    <section class="crm-card" style="margin-bottom:16px">
      <h3 style="margin:0 0 12px 0;font-size:20px">${needsConnectionSetup ? "Conectare prin contabil" : "Reautorizare prin contabil"}</h3>
      <div class="crm-muted" style="margin-bottom:14px">${needsConnectionSetup
        ? "Generezi un cod securizat valabil 24 de ore. Contabilul poate deschide linkul primit sau poate introduce codul manual pentru a autoriza firma în ANAF."
        : "Folosește această secțiune când certificatul contabilului a fost reînnoit sau când ANAF nu mai acceptă conexiunea curentă."}</div>
      <form method="post" action="/anaf/reautorizare-link" class="crm-stack">
        <input type="hidden" name="redirect_to" value="/anaf/status?reauth=needed">
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Email contabil (opțional)</label>
            <input class="crm-input" type="email" name="accountant_email" placeholder="contabil@firma.ro">
          </div>
          <div>
            <label class="crm-label">Notă internă (opțional)</label>
            <input class="crm-input" name="note" placeholder="reautorizare după certificat nou">
          </div>
        </div>
        <div class="crm-row">
          <button class="crm-btn" type="submit">${needsConnectionSetup ? "Generează link de conectare" : "Generează link de reautorizare"}</button>
          <a class="crm-btn crm-btn-secondary" href="/oauth/anaf/start">Conectează direct în acest browser</a>
        </div>
      </form>
      <div class="crm-muted" style="margin-top:12px">Portal public pentru cod: <b>${escapeHtml(`${appUrlBase}/anaf/reautorizare`)}</b></div>
    </section>
  `;
  const html = `
  <!doctype html>
  <html>
  <head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
  <meta charset="utf-8">
  <title>Status ANAF</title>
  </head>
  ${crmShellStart("accounting-spv", "Status ANAF", "Stare integrare SPV și e-Factura.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

    ${oauthBanner}
    ${inviteFlashCard}
    ${environmentBanner}
    ${activeConnectionBanner}
    ${setupBanner}
    ${accessDeniedHelp}
    ${accountantSection}

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <h3 style="margin:0 0 12px 0;font-size:20px">Status integrare</h3>
      <div class="crm-stack">
        <div><b>Mediu activ:</b> ${escapeHtml(environment)} ${environment === "test" ? '<span class="crm-badge crm-badge-blue" style="margin-left:8px">TEST</span>' : '<span class="crm-badge crm-badge-green" style="margin-left:8px">PROD</span>'}</div>
        <div><b>Redirect URI:</b> ${escapeHtml(redirectUri)}</div>
        <div><b>Scope OAuth:</b> ${oauthScope ? escapeHtml(oauthScope) : "necompletat"}</div>
        <div><b>Client ID:</b> ${getSetting("anaf_client_id","") ? "configurat" : "neconfigurat"}</div>
        <div><b>Client Secret:</b> ${getSetting("anaf_client_secret","") ? "configurat" : "neconfigurat"}</div>
        <div><b>Conexiuni SPV salvate:</b> ${db.prepare("SELECT COUNT(*) c FROM anaf_connections WHERE company_id=?").get(companyId).c}</div>
        <div><b>Conexiuni SPV test:</b> ${connectionCountMap.test || 0}</div>
        <div><b>Conexiuni SPV producție:</b> ${connectionCountMap.prod || 0}</div>
        <div><b>Endpoint autorizare OAuth:</b> ${escapeHtml(authorizeUrl)}</div>
        <div><b>Endpoint token OAuth:</b> ${escapeHtml(tokenUrl)}</div>
        <div><b>Endpoint e-Factura:</b> ${escapeHtml(efacturaApiBase)}</div>
        <div><b>Ultima conexiune test:</b> ${formatConnectionSummary(latestTestConnection)}${connectionStateBadge(latestTestConnection)}</div>
        <div><b>Ultima conexiune producție:</b> ${formatConnectionSummary(latestProdConnection)}${connectionStateBadge(latestProdConnection)}</div>
        <div><b>Ultimul eveniment OAuth:</b> ${lastOauthLog ? `${escapeHtml(lastOauthLog.event_type || "-")} / ${escapeHtml(lastOauthLog.status || "-")} / ${escapeHtml(lastOauthLog.created_at || "-")}` : "niciunul"}</div>
        <div><b>Detaliu:</b> ${lastOauthLog?.details ? escapeHtml(String(lastOauthLog.details).slice(0, 500)) : "—"}</div>
        <div style="padding-top:12px">
          <a class="crm-btn" href="/oauth/anaf/start">Conectează contul ANAF</a>
        </div>
      </div>
    </section>

  ${crmShellEnd()}
  </html>`;
  res.send(html);
});

function buildAnafInboxRedirect(targetPath, extraParams = {}) {
  const rawTarget = String(targetPath || "").trim();
  const safeTarget = rawTarget.startsWith("/anaf/inbox") || rawTarget.startsWith("/nexora/anaf/inbox")
    ? rawTarget
    : "/anaf/inbox";

  const targetUrl = new URL(safeTarget, "http://localhost");
  for (const [key, value] of Object.entries(extraParams || {})) {
    if (value == null || value === "") continue;
    targetUrl.searchParams.set(key, String(value));
  }

  return `${targetUrl.pathname}${targetUrl.search ? targetUrl.search : ""}`;
}

function spvNeedsManualReauthorizationMessage(message) {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("refresh token") ||
    normalized.includes("token anaf invalid") ||
    normalized.includes("access_denied") ||
    normalized.includes("conexiune anaf") ||
    normalized.includes("autorizata pentru mediul selectat") ||
    normalized.includes("expirat");
}

app.post("/anaf/inbox/sync", requireAuth, requireSpvAccess, async (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const redirectTo = String(req.body?.redirect_to || "/anaf/inbox").trim();
  const environment = String(getSetting("anaf_environment", "test") || "test").trim();
  const companyCui = String(getSetting("company_cui", COMPANY.cui || "") || "").replace(/^RO/i, "").trim();
  const days = Math.min(60, Math.max(1, Number.parseInt(String(req.body?.days || "60"), 10) || 60));

  if (!companyCui) {
    return res.redirect(buildAnafInboxRedirect(redirectTo, {
      err: "sync_inbox",
      message: "CUI-ul companiei nu este configurat."
    }));
  }

  try {
    const result = await syncAnafInbox({
      cif: companyCui,
      companyId,
      db,
      environment,
      getSetting,
      days,
      storageDir: path.join(__dirname, "public", "uploads", "anaf", "inbox", `company-${companyId}`),
      publicBasePath: `uploads/anaf/inbox/company-${companyId}`
    });

    return res.redirect(buildAnafInboxRedirect(redirectTo, {
      ok: "sync_inbox",
      imported: result.importedCount + result.updatedCount,
      new_count: result.importedCount,
      updated: result.updatedCount,
      ignored: result.skippedExistingCount + result.skippedNonInvoiceCount + result.skippedOwnDocumentsCount,
      failed: result.failedCount
    }));
  } catch (error) {
    const message = String(error?.message || error).slice(0, 220);
    return res.redirect(buildAnafInboxRedirect(redirectTo, {
      err: "sync_inbox",
      message,
      reauth: spvNeedsManualReauthorizationMessage(message) ? "needed" : ""
    }));
  }
});

app.post("/anaf/inbox/:id/process", requireAuth, requireSpvAccess, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).send("ID invalid");

  const row = db.prepare(`
    SELECT id, processed
    FROM anaf_inbox
    WHERE id=? AND company_id=?
  `).get(id, companyId);

  if (!row) return res.status(404).send("Mesajul nu exista");

  const nextProcessed = String(req.body?.processed || "") === "1" ? 1 : 0;
  db.prepare(`
    UPDATE anaf_inbox
    SET processed=?
    WHERE id=? AND company_id=?
  `).run(nextProcessed, id, companyId);

  const redirectTo = String(req.body?.redirect_to || "").trim();
  if (redirectTo && redirectTo.startsWith("/")) return res.redirect(redirectTo);
  return res.redirect("/anaf/inbox");
});

app.get("/nexora/anaf/inbox", requireAuth, requireSpvAccess, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const ok = String(req.query?.ok || "").trim();
  const err = String(req.query?.err || "").trim();
  const reauth = String(req.query?.reauth || "").trim();

  const syncImported = Number.parseInt(String(req.query?.imported || "0"), 10) || 0;
  const syncNew = Number.parseInt(String(req.query?.new_count || "0"), 10) || 0;
  const syncUpdated = Number.parseInt(String(req.query?.updated || "0"), 10) || 0;
  const syncIgnored = Number.parseInt(String(req.query?.ignored || "0"), 10) || 0;
  const syncFailed = Number.parseInt(String(req.query?.failed || "0"), 10) || 0;

  const processedFilter = String(req.query?.processed || "").trim().toLowerCase();
  const search = String(req.query?.search || "").trim();
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date_from || "").trim()) ? String(req.query.date_from).trim() : "";
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date_to || "").trim()) ? String(req.query.date_to).trim() : "";

  const where = ["company_id=?"];
  const params = [companyId];

  if (processedFilter === "processed") {
    where.push("processed=1");
  } else if (processedFilter === "new") {
    where.push("processed=0");
  }

  if (dateFrom) {
    where.push("date(COALESCE(received_at, created_at)) >= date(?)");
    params.push(dateFrom);
  }

  if (dateTo) {
    where.push("date(COALESCE(received_at, created_at)) <= date(?)");
    params.push(dateTo);
  }

  if (search) {
    const like = `%${search.toLowerCase()}%`;
    where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(invoice_number,'')) LIKE ? OR LOWER(COALESCE(details,'')) LIKE ? OR LOWER(COALESCE(xml_path,'')) LIKE ? OR LOWER(COALESCE(pdf_path,'')) LIKE ? OR LOWER(COALESCE(zip_path,'')) LIKE ?)");
    params.push(like, like, like, like, like, like, like);
  }

  const whereSql = where.join(" AND ");

  const rows = db.prepare(`
    SELECT id, supplier_name, supplier_cui, invoice_number, message_type, details, zip_path, xml_path, pdf_path, received_at, processed, created_at
    FROM anaf_inbox
    WHERE ${whereSql}
    ORDER BY COALESCE(received_at, created_at) DESC, id DESC
    LIMIT 200
  `).all(...params);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN processed=1 THEN 1 ELSE 0 END) AS processed_count
    FROM anaf_inbox
    WHERE company_id=?
  `).get(companyId) || {};

  const filteredStats = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS new_count
    FROM anaf_inbox
    WHERE ${whereSql}
  `).get(...params) || {};

  res.send(renderNexoraAnafInboxPage({
    user: req.session.user,
    rows,
    stats,
    filteredStats,
    processedFilter,
    search,
    dateFrom,
    dateTo,
    ok,
    err,
    reauth,
    sync: {
      imported: syncImported,
      newCount: syncNew,
      updated: syncUpdated,
      ignored: syncIgnored,
      failed: syncFailed
    }
  }));
});

app.get("/anaf/inbox", requireAuth, requireSpvAccess, (req,res)=>{
  const companyId = Number(req.session.user.company_id || 0);
  const ok = String(req.query?.ok || "").trim();
  const err = String(req.query?.err || "").trim();
  const reauth = String(req.query?.reauth || "").trim();
  const syncMessage = String(req.query?.message || "").trim();
  const syncImported = Number.parseInt(String(req.query?.imported || "0"), 10) || 0;
  const syncNew = Number.parseInt(String(req.query?.new_count || "0"), 10) || 0;
  const syncUpdated = Number.parseInt(String(req.query?.updated || "0"), 10) || 0;
  const syncIgnored = Number.parseInt(String(req.query?.ignored || "0"), 10) || 0;
  const syncFailed = Number.parseInt(String(req.query?.failed || "0"), 10) || 0;
  const processedFilter = String(req.query?.processed || "").trim().toLowerCase();
  const search = String(req.query?.search || "").trim();
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date_from || "").trim()) ? String(req.query.date_from).trim() : "";
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date_to || "").trim()) ? String(req.query.date_to).trim() : "";

  const where = ["company_id=?"];
  const params = [companyId];

  if (processedFilter === "processed") {
    where.push("processed=1");
  } else if (processedFilter === "new") {
    where.push("processed=0");
  }

  if (dateFrom) {
    where.push("date(COALESCE(received_at, created_at)) >= date(?)");
    params.push(dateFrom);
  }

  if (dateTo) {
    where.push("date(COALESCE(received_at, created_at)) <= date(?)");
    params.push(dateTo);
  }

  if (search) {
    const like = `%${search.toLowerCase()}%`;
    where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(invoice_number,'')) LIKE ? OR LOWER(COALESCE(details,'')) LIKE ? OR LOWER(COALESCE(xml_path,'')) LIKE ? OR LOWER(COALESCE(pdf_path,'')) LIKE ? OR LOWER(COALESCE(zip_path,'')) LIKE ?)");
    params.push(like, like, like, like, like, like, like);
  }

  const whereSql = where.join(" AND ");

  const rows = db.prepare(`
    SELECT id, supplier_name, supplier_cui, invoice_number, message_type, details, zip_path, xml_path, pdf_path, received_at, processed, created_at
    FROM anaf_inbox
    WHERE ${whereSql}
    ORDER BY COALESCE(received_at, created_at) DESC, id DESC
    LIMIT 200
  `).all(...params);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN processed=1 THEN 1 ELSE 0 END) AS processed_count
    FROM anaf_inbox
    WHERE company_id=?
  `).get(companyId) || {};

  const filteredStats = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS new_count
    FROM anaf_inbox
    WHERE ${whereSql}
  `).get(...params) || {};

  const currentQuery = new URLSearchParams();
  if (processedFilter) currentQuery.set("processed", processedFilter);
  if (search) currentQuery.set("search", search);
  if (dateFrom) currentQuery.set("date_from", dateFrom);
  if (dateTo) currentQuery.set("date_to", dateTo);
  const currentPath = `/anaf/inbox${currentQuery.toString() ? `?${currentQuery.toString()}` : ""}`;
  const syncNeedsReauth = reauth === "needed" || spvNeedsManualReauthorizationMessage(syncMessage);

  function processedBadge(value){
    return Number(value)
      ? `<span class="crm-badge crm-badge-green">procesată</span>`
      : `<span class="crm-badge crm-badge-blue">nouă</span>`;
  }

  function filterBtn(label, value){
    const active = (value === "" && !processedFilter) || value === processedFilter;
    const next = new URLSearchParams();
    if (value) next.set("processed", value);
    if (search) next.set("search", search);
    if (dateFrom) next.set("date_from", dateFrom);
    if (dateTo) next.set("date_to", dateTo);
    const href = `/anaf/inbox${next.toString() ? `?${next.toString()}` : ""}`;
    return `<a class="${active ? "crm-btn" : "crm-btn crm-btn-secondary"}" href="${href}">${escapeHtml(label)}</a>`;
  }

  const htmlRows = rows.map(r => `
    <tr>
      <td>${escapeHtml(String(r.id))}</td>
      <td>
        <div style="font-weight:800">${escapeHtml(r.invoice_number || "Fără număr")}</div>
        <div class="crm-muted" style="margin-top:4px">${escapeHtml(r.supplier_name || "Furnizor necunoscut")}${r.supplier_cui ? ` · ${escapeHtml(r.supplier_cui)}` : ""}</div>
        ${r.message_type ? `<div class="crm-muted" style="margin-top:6px">${escapeHtml(r.message_type)}</div>` : ``}
        ${r.details ? `<div class="crm-muted" style="margin-top:6px;font-size:12px">${escapeHtml(String(r.details).slice(0, 180))}</div>` : ``}
      </td>
      <td>${escapeHtml(r.received_at || r.created_at || "")}</td>
      <td>${processedBadge(r.processed)}</td>
      <td>
        <div style="display:grid;gap:6px">
          ${r.xml_path ? `<a href="/${encodeURI(r.xml_path)}" target="_blank">XML</a>` : `<span class="crm-muted">XML lipsă</span>`}
          ${r.zip_path ? `<a href="/${encodeURI(r.zip_path)}" target="_blank">ZIP</a>` : `<span class="crm-muted">ZIP lipsă</span>`}
          ${r.pdf_path ? `<a href="/${encodeURI(r.pdf_path)}" target="_blank">PDF</a>` : `<span class="crm-muted">PDF lipsă</span>`}
        </div>
      </td>
      <td>
        <form method="post" action="/anaf/inbox/${r.id}/process" style="margin:0;display:flex;gap:8px;flex-wrap:wrap">
          <input type="hidden" name="processed" value="${Number(r.processed) ? "0" : "1"}">
          <input type="hidden" name="redirect_to" value="${escapeHtml(currentPath)}">
          <button class="crm-btn ${Number(r.processed) ? "crm-btn-secondary" : ""}" type="submit">${Number(r.processed) ? "Marchează nouă" : "Marchează procesată"}</button>
          ${r.xml_path ? `<a class="crm-btn crm-btn-secondary" href="/${encodeURI(r.xml_path)}" target="_blank">Deschide XML</a>` : ``}
        </form>
      </td>
    </tr>
  `).join("");

  const html = `
  <!doctype html>
  <html>
  <head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
  <meta charset="utf-8">
  <title>Inbox e-Factura</title>
  </head>
  ${crmShellStart("accounting-spv-inbox", "Inbox e-Factura", "Facturi primite din ANAF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

    ${ok === "sync_inbox" ? `
      <div class="crm-card" style="margin-bottom:18px;border:1px solid #bbf7d0;background:#f0fdf4">
        <div style="font-weight:800;color:#166534;margin-bottom:6px">Sincronizare finalizată</div>
        <div class="crm-muted">${escapeHtml(String(syncImported))} facturi sincronizate, dintre care ${escapeHtml(String(syncNew))} noi și ${escapeHtml(String(syncUpdated))} actualizate. ${escapeHtml(String(syncIgnored))} mesaje au fost ignorate și ${escapeHtml(String(syncFailed))} au eșuat.</div>
      </div>
    ` : ``}

    ${err === "sync_inbox" ? `
      <div class="crm-card" style="margin-bottom:18px;border:1px solid #fecaca;background:#fef2f2">
        <div style="font-weight:800;color:#991b1b;margin-bottom:6px">Sincronizare eșuată</div>
        <div class="crm-muted">${escapeHtml(syncMessage || "Inbox-ul SPV nu a putut fi sincronizat.")}</div>
      </div>
    ` : ``}

    ${syncNeedsReauth ? `
      <div class="crm-card" style="margin-bottom:18px;border:1px solid #fcd34d;background:#fffbeb">
        <div style="font-weight:800;color:#92400e;margin-bottom:6px">Reautorizare SPV necesară</div>
        <div class="crm-muted">Sincronizarea inboxului nu poate continua până când conexiunea ANAF nu este refăcută. Mergi în Status ANAF și generează un cod / link pentru contabil sau reconectează direct în browserul curent.</div>
        <div class="crm-row" style="margin-top:12px">
          <a class="crm-btn" href="/anaf/status?reauth=needed">Status ANAF</a>
        </div>
      </div>
    ` : ``}

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Inbox e-Factura</h3>
          <div class="crm-muted" style="margin-top:6px">Mesaje/facturi primite prin integrarea ANAF, cu status operațional pentru lucru contabil.</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <form method="post" action="/anaf/inbox/sync" style="margin:0">
            <input type="hidden" name="redirect_to" value="${escapeHtml(currentPath)}">
            <input type="hidden" name="days" value="60">
            <button class="crm-btn" type="submit">Sincronizează inbox SPV</button>
          </form>
          <a class="crm-btn crm-btn-secondary" href="/accounting">Contabilitate</a>
          <a class="crm-btn crm-btn-secondary" href="/anaf/status">Status ANAF</a>
        </div>
      </div>

      <div class="crm-kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px">
        <div class="crm-kpi">
          <div class="crm-kpi-label">Total inbox</div>
          <div class="crm-kpi-value">${escapeHtml(String(stats.total_count || 0))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Noi</div>
          <div class="crm-kpi-value">${escapeHtml(String(stats.new_count || 0))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">În selecție</div>
          <div class="crm-kpi-value">${escapeHtml(String(filteredStats.total_count || 0))}</div>
          <div class="crm-muted" style="margin-top:6px">${escapeHtml(String(filteredStats.new_count || 0))} noi</div>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        ${filterBtn("Toate", "")}
        ${filterBtn("Noi", "new")}
        ${filterBtn("Procesate", "processed")}
      </div>

      <form method="get" action="/anaf/inbox" class="crm-grid-4" style="margin-bottom:18px;overflow:visible">
        <input type="hidden" name="processed" value="${escapeHtml(processedFilter)}">
        <div>
          <label class="crm-label">De la</label>
          <input class="crm-input" type="date" name="date_from" value="${escapeHtml(dateFrom)}">
        </div>
        <div>
          <label class="crm-label">Până la</label>
          <input class="crm-input" type="date" name="date_to" value="${escapeHtml(dateTo)}">
        </div>
        <div style="grid-column:span 2">
          <label class="crm-label">Căutare</label>
          <input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="Furnizor, CUI, nr. factură sau fișier">
        </div>
        <div style="grid-column:1 / -1;display:flex;gap:10px;flex-wrap:wrap">
          <button class="crm-btn" type="submit">Aplică filtrele</button>
          <a class="crm-btn crm-btn-secondary" href="/anaf/inbox">Resetează</a>
        </div>
      </div>

      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Document</th>
              <th>Recepționată</th>
              <th>Status</th>
              <th>Fișiere</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows || `<tr><td colspan="6" class="crm-muted">Nu există mesaje în inbox pentru filtrele selectate.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

  ${crmShellEnd()}
  </html>`;
  res.send(html);
});

app.get("/nexora/anaf/outbox", requireAuth, requireSpvAccess, (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);
  const statusFilter = String(req.query?.status || "").trim().toUpperCase();

  const rows = db.prepare(`
    WITH latest_responses AS (
      SELECT MAX(m.id) AS id
      FROM anaf_messages m
      WHERE m.company_id = ?
        AND UPPER(COALESCE(m.direction,'')) = 'OUT'
        AND m.factura_id IS NOT NULL
        AND UPPER(COALESCE(m.status,'')) IN ('RASPUNS_DISPONIBIL', 'RESPINS_VALIDARE', 'RESPINSA_SPV')
      GROUP BY m.factura_id
    )
    SELECT
      m.id,
      m.message_id,
      m.factura_id,
      m.direction,
      m.status,
      m.created_at,
      f.factura_nr,
      f.efactura_xml_path
    FROM latest_responses lr
    JOIN anaf_messages m ON m.id = lr.id
    LEFT JOIN facturi f ON f.id = m.factura_id AND f.company_id = m.company_id
    WHERE m.company_id = ?
      AND (
        ? = ''
        OR (? = 'RASPUNS_DISPONIBIL' AND UPPER(COALESCE(m.status,'')) = 'RASPUNS_DISPONIBIL')
        OR (? = 'RESPINSE' AND UPPER(COALESCE(m.status,'')) IN ('RESPINS_VALIDARE', 'RESPINSA_SPV'))
      )
    ORDER BY m.id DESC
    LIMIT 100
  `).all(companyId, companyId, statusFilter, statusFilter, statusFilter);

  res.send(renderNexoraAnafOutboxPage({
    user: req.session.user,
    rows,
    statusFilter
  }));
});

app.get("/anaf/outbox", requireAuth, requireSpvAccess, (req,res)=>{
  const companyId = Number(req.session.user.company_id || 0);
  const responseStatuses = ["RASPUNS_DISPONIBIL", "RESPINS_VALIDARE", "RESPINSA_SPV"];
  const statusFilter = String(req.query?.status || "").trim().toUpperCase();
  const hasAcceptedFilter = statusFilter === "RASPUNS_DISPONIBIL";
  const hasRejectedFilter = statusFilter === "RESPINSE";

  const rows = db.prepare(`
    WITH latest_responses AS (
      SELECT MAX(m.id) AS id
      FROM anaf_messages m
      WHERE m.company_id = ?
        AND UPPER(COALESCE(m.direction,'')) = 'OUT'
        AND m.factura_id IS NOT NULL
        AND UPPER(COALESCE(m.status,'')) IN ('RASPUNS_DISPONIBIL', 'RESPINS_VALIDARE', 'RESPINSA_SPV')
      GROUP BY m.factura_id
    )
    SELECT
      m.id,
      m.message_id,
      m.factura_id,
      m.direction,
      m.status,
      m.created_at,
      f.factura_nr,
      f.efactura_xml_path
    FROM latest_responses lr
    JOIN anaf_messages m ON m.id = lr.id
    LEFT JOIN facturi f ON f.id = m.factura_id AND f.company_id = m.company_id
    WHERE m.company_id = ?
      AND (
        ? = ''
        OR (? = 'RASPUNS_DISPONIBIL' AND UPPER(COALESCE(m.status,'')) = 'RASPUNS_DISPONIBIL')
        OR (? = 'RESPINSE' AND UPPER(COALESCE(m.status,'')) IN ('RESPINS_VALIDARE', 'RESPINSA_SPV'))
      )
    ORDER BY m.id DESC
    LIMIT 100
  `).all(companyId, companyId, statusFilter, statusFilter, statusFilter);

  function outboxDirectionBadge(direction){
    const v = String(direction || "").toUpperCase();
    if(v === "OUT") return `<span class="crm-badge crm-badge-blue">OUT</span>`;
    if(v === "IN") return `<span class="crm-badge crm-badge-green">IN</span>`;
    return `<span class="crm-badge crm-badge-neutral">${escapeHtml(direction || "—")}</span>`;
  }

  function outboxStatusBadge(status){
    const v = String(status || "").toUpperCase();
    if(v === "RASPUNS_DISPONIBIL") return `<span class="crm-badge crm-badge-green">răspuns SPV</span>`;
    if(responseStatuses.includes(v)) return `<span class="crm-badge crm-badge-red">respinsă</span>`;
    return `<span class="crm-badge crm-badge-neutral">${escapeHtml(status || "—")}</span>`;
  }

  function filterBtn(label, status){
    const active = (status === "" && !hasAcceptedFilter && !hasRejectedFilter) || (status === statusFilter);
    const href = status ? `/anaf/outbox?status=${encodeURIComponent(status)}` : `/anaf/outbox`;
    const cls = active ? "crm-btn" : "crm-btn crm-btn-secondary";
    return `<a class="${cls}" href="${href}">${escapeHtml(label)}</a>`;
  }

  const htmlRows = rows.map(r => `
    <tr>
      <td>${r.factura_id ? `<a href="/factura/${r.factura_id}">${escapeHtml(r.factura_nr || ("#" + String(r.factura_id)))}</a>` : `<span class="crm-muted">—</span>`}</td>
      <td>${outboxDirectionBadge(r.direction)}</td>
      <td>${outboxStatusBadge(r.status)}</td>
      <td>${escapeHtml(r.message_id || "")}</td>
      <td>${escapeHtml(r.created_at || "")}</td>
      <td>${r.efactura_xml_path ? escapeHtml(r.efactura_xml_path) : `<span class="crm-muted">—</span>`}</td>
    </tr>
  `).join("");

  const html = `
  <!doctype html>
  <html>
  <head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
  <meta charset="utf-8">
  <title>Outbox e-Factura</title>
  </head>
  ${crmShellStart("accounting-spv-outbox", "Outbox e-Factura", "Facturile trimise care au primit deja un răspuns din SPV.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Outbox e-Factura</h3>
          <div class="crm-muted" style="margin-top:6px">O singură intrare per factură, doar după ce există răspuns în SPV.</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${filterBtn("Toate", "")}
        ${filterBtn("Acceptate", "RASPUNS_DISPONIBIL")}
        ${filterBtn("Respinse", "RESPINSE")}
      </div>

      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Factură</th>
              <th>Direcție</th>
              <th>Status</th>
              <th>Message ID</th>
              <th>Creat la</th>
              <th>XML</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows || `<tr><td colspan="6" class="crm-muted">Nu există facturi cu răspuns SPV pentru filtrele selectate.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

  ${crmShellEnd()}
  </html>`;
  res.send(html);
});




/* =========================
   EMPLOYEES MODULE
========================= */

app.get("/employees", requireAuth, requireModule("employees"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);

  const rows = db.prepare(`
    SELECT id, name, email, phone, position, active, created_at
    FROM employees
    WHERE company_id=?
    ORDER BY active DESC, name COLLATE NOCASE ASC
  `).all(companyId);

  const htmlRows = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name || "")}</td>
      <td>${escapeHtml(r.email || "")}</td>
      <td>${escapeHtml(r.phone || "")}</td>
      <td>${escapeHtml(r.position || "")}</td>
      <td>${Number(r.active) ? `<span class="crm-badge crm-badge-green">activ</span>` : `<span class="crm-badge crm-badge-neutral">inactiv</span>`}</td>
      <td>${escapeHtml(r.created_at || "")}</td>
    </tr>
  `).join("");

  res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Angajați</title>
</head>

${crmShellStart("employees","Angajați","Administrare personal și operatori.",req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

<section class="crm-card" style="position:sticky;top:20px;z-index:10">

<div style="margin-bottom:14px">
<h3 style="margin:0;font-size:20px">Adaugă angajat</h3>
</div>

<form method="post" action="/employees/create" class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">

<div>
<label class="crm-label">Nume</label>
<input class="crm-input" name="name" required>
</div>

<div>
<label class="crm-label">Email</label>
<input class="crm-input" name="email">
</div>

<div>
<label class="crm-label">Telefon</label>
<input class="crm-input" name="phone">
</div>

<div>
<label class="crm-label">Funcție</label>
<input class="crm-input" name="position">
</div>

<div>
<label class="crm-label">Activ</label>
<select class="crm-input" name="active">
<option value="1">DA</option>
<option value="0">NU</option>
</select>
</div>

<div style="grid-column:1/-1">
<button class="crm-btn" type="submit">Adaugă angajat</button>
</div>

</form>

<div style="overflow:auto">

<table class="crm-table">
<thead>
<tr>
<th>Nume</th>
<th>Email</th>
<th>Telefon</th>
<th>Funcție</th>
<th>Status</th>
<th>Creat</th>
</tr>
</thead>

<tbody>
${htmlRows || `<tr><td colspan="6" class="crm-muted">Nu există angajați.</td></tr>`}
</tbody>

</table>

</div>

</section>

${crmShellEnd()}

</html>
`);
});

app.get("/nexora/employees", requireAuth, requireModule("employees"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);

  const rows = db.prepare(`
    SELECT id, name, email, phone, position, active, created_at
    FROM employees
    WHERE company_id=?
    ORDER BY active DESC, name COLLATE NOCASE ASC
  `).all(companyId);

  return res.type("html").send(renderNexoraEmployeesPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    rows,
    ok: String(req.query?.ok || "")
  }));
});


app.post("/employees/create", requireAuth, requireModule("employees"), (req, res) => {
  const companyId = Number(req.session.user.company_id || 0);

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const position = String(req.body?.position || "").trim();
  const active = String(req.body?.active || "1") === "1" ? 1 : 0;

  if(!name){
    return res.status(400).send("Nume obligatoriu");
  }

  db.prepare(`
    INSERT INTO employees (name,email,phone,position,active,company_id)
    VALUES (?,?,?,?,?,?)
  `).run(name,email,phone,position,active,companyId);

  res.redirect(req.body?.return_to === "nexora" ? "/nexora/employees?ok=created" : "/employees");

});

const NEXORA_FALLBACK_MODULES = {
  accounting: ["Financiar & Contabilitate", "/nexora/accounting"],
  sales: ["Vânzări", "/nexora/quotes"],
  crm: ["CRM", "/nexora/clients"],
  inventory: ["Inventar & Gestiune", "/nexora/inventory"],
  procurement: ["Achiziții", "/nexora/procurement"],
  hr: ["Resurse Umane", "/nexora/employees"],
  manufacturing: ["Producție / MRP", "/nexora/manufacturing"],
  "supply-chain": ["Supply Chain", "/nexora/supply-chain"],
  projects: ["Proiecte", "/nexora/projects"],
  reports: ["Rapoarte & BI", "/nexora/reports"],
  orders: ["Order Management", "/nexora/orders"],
  documents: ["Documente / DMS", "/nexora/documents"],
  workflow: ["Workflow & Automatizări", "/nexora/workflow"],
  ecommerce: ["eCommerce & POS", "/nexora/ecommerce"],
  pos: ["POS", "/nexora/ecommerce"],
  deliveries: ["Livrări", "/nexora/deliveries"],
  "super-admin": ["Administrare platformă", "/nexora/super-admin"]
};

function titleFromPathSegment(value = "") {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

app.get(/^\/nexora\/.+/, requireAuth, (req, res) => {
  const pathParts = String(req.path || "")
    .replace(/^\/nexora\/?/, "")
    .split("/")
    .filter(Boolean);
  const root = pathParts[0] || "reports";
  if (root === "super-admin" && !Number(req.session.user.is_super_admin || 0)) {
    return res.status(403).send("Forbidden");
  }
  const [moduleTitle, moduleHome] = NEXORA_FALLBACK_MODULES[root] || [titleFromPathSegment(root) || "Nexora", "/nexora-dashboard"];
  const leafTitle = pathParts.length > 1
    ? titleFromPathSegment(pathParts[pathParts.length - 1])
    : moduleTitle;

  return res.type("html").send(renderNexoraHubPage({
    companyName: req.session.user.company_name || "",
    user: req.session.user,
    currentPath: req.path,
    eyebrow: moduleTitle,
    title: leafTitle,
    description: "Secțiunea rămâne în interfața Nexora și va fi extinsă pe măsură ce migrăm fluxurile operaționale.",
    links: [
      { label: "Dashboard", href: "/nexora-dashboard" },
      { label: moduleTitle, href: moduleHome }
    ]
  }));
});
