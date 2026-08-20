import { renderNexoraShell } from "./nexora-shell.js";
import { stripQuotedEmailText } from "../../lib/email-reply-cleaner.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJsString(value = "") {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

const TABS = [
  ["Dashboard", "/nexora/travel/dashboard"],
  ["International", "/nexora/travel/international"],
  ["Lead-uri Proprietăți", "/nexora/travel/leads"],
  ["Kanban", "/nexora/travel/kanban"],
  ["Trevoro Leads", "/nexora/travel/leads?source=trevoro_landing"],
  ["OSM Leads", "/nexora/travel/leads?source=osm&contactable=1&min_score=40"],
  ["Registru oficial", "/nexora/travel/leads?source=official_tourism_registry"],
  ["Outreach", "/nexora/travel/outreach"],
  ["Facebook Leads", "/nexora/travel/facebook-leads"],
  ["Agenții", "/nexora/travel/agencies"],
  ["Parteneri locali", "/nexora/travel/local-partners"],
  ["Proprietăți", "/nexora/travel/properties"],
  ["Monitor Proprietari", "/nexora/travel/owners-monitor"],
  ["Cereri Site", "/nexora/travel/inquiries"],
  ["Inbox Support", "/nexora/travel/support"],
  ["Integrări", "/nexora/travel/integrations"],
  ["Recenzii", "/nexora/travel/reviews"],
  ["Content Factory", "/nexora/travel/content-factory"],
  ["Social Posts", "/nexora/travel/social-posts"],
  ["Grupuri Social", "/nexora/travel/social-groups"],
  ["Campanie 14 zile", "/nexora/travel/social-campaign"],
  ["SEO Pages", "/nexora/travel/seo-pages"],
  ["Campaigns", "/nexora/travel/campaigns"],
  ["Importuri", "/nexora/travel/imports"],
  ["Setări", "/nexora/travel/settings"]
];

function normalizeActivePath(activePath = "/nexora/travel/dashboard") {
  if (activePath === "/nexora/travel") return "/nexora/travel/dashboard";
  if (activePath === "/nexora/travel/international") return "/nexora/travel/international";
  if (activePath === "/nexora/travel/property-leads") return "/nexora/travel/leads";
  if (activePath === "/nexora/travel/outreach") return "/nexora/travel/outreach";
  if (activePath === "/nexora/travel/facebook-leads") return "/nexora/travel/facebook-leads";
  if (activePath === "/nexora/travel/agencies") return "/nexora/travel/agencies";
  if (activePath === "/nexora/travel/local-partners") return "/nexora/travel/local-partners";
  if (activePath === "/nexora/travel/integrations") return "/nexora/travel/integrations";
  if (activePath === "/nexora/travel/reviews") return "/nexora/travel/reviews";
  if (activePath === "/nexora/travel/owners-monitor") return "/nexora/travel/owners-monitor";
  if (activePath === "/nexora/travel/social-campaign") return "/nexora/travel/social-campaign";
  if (activePath === "/nexora/travel/social-groups") return "/nexora/travel/social-groups";
  if (activePath.startsWith("/nexora/travel/leads?source=osm")) return "/nexora/travel/leads?source=osm&contactable=1&min_score=40";
  if (activePath.startsWith("/nexora/travel/leads?source=official_tourism_registry")) return "/nexora/travel/leads?source=official_tourism_registry";
  if (activePath.startsWith("/nexora/travel/leads?")) return "/nexora/travel/leads?source=trevoro_landing";
  return activePath;
}

function tabs(activePath = "/nexora/travel/dashboard") {
  const normalizedPath = normalizeActivePath(activePath);
  return `<nav class="nx-module-tabs">${TABS.map(([label, href]) => `
    <a class="${normalizedPath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>
  `).join("")}</nav>`;
}

function outreachCountLine(report = {}) {
  const parts = [
    `Cazări RO: ${Number(report.ownersRomania?.sent || 0)}`,
    `Internațional: ${Number(report.ownersInternational?.sent || 0)}`,
    `Parteneri locali: ${Number(report.localPartners?.sent || 0)}`,
    `Agenții: ${Number(report.agencies?.sent || 0)}`
  ];
  const failed = Number(report.totalFailed || 0);
  if (failed) parts.push(`Eșecuri job: ${failed}`);
  return parts.join(" · ");
}

function outreachTopList(items = [], limit = 6) {
  return (Array.isArray(items) ? items : [])
    .slice(0, limit)
    .map((item) => `${item.label} (${Number(item.count || 0)})`)
    .join(", ");
}

function outreachOwnerDestinations(report = {}) {
  const domestic = Array.isArray(report.ownersRomania?.topDestinations) ? report.ownersRomania.topDestinations : [];
  const international = Array.isArray(report.ownersInternational?.topDestinations) ? report.ownersInternational.topDestinations : [];
  return domestic.length ? domestic : international;
}

function renderDailyOutreachBanner(summary = {}) {
  const report = summary.outreachReport || {};
  const outreachJob = summary.outreachJob || {};
  const jobStatus = String(outreachJob.status || "").trim();
  const jobPaused = Boolean(outreachJob.paused) || jobStatus === "paused" || jobStatus === "pause_requested";
  const reportSent = Number(report.totalSent || 0);
  const rawSentToday = Number(summary.sentToday || 0);
  const sentToday = Math.max(reportSent, rawSentToday);
  if (!sentToday && !jobPaused) return "";

  const dailyLimit = Math.max(1, Number(summary.dailyLimit || 100) || 100);
  const failedToday = Number(summary.failedToday || 0);
  const bouncedToday = Number(summary.bouncedToday || 0);
  const completed = sentToday > 0 && (reportSent ? Boolean(report.ok) : sentToday >= dailyLimit);
  const lastSentAt = dateValue(summary.lastSentAt || "");
  const dateLabel = summary.dateLabel || "";
  const tone = completed ? "success" : "warn";
  const title = !sentToday && jobPaused
    ? "Outreach Trevoro oprit: 0 emailuri trimise azi."
    : completed
      ? `Batch outreach complet: ${sentToday} emailuri trimise azi.`
      : `Outreach azi: ${sentToday}/${dailyLimit} emailuri trimise.`;
  const zoneLine = reportSent
    ? outreachCountLine(report)
    : sentToday
      ? `Cazari RO: 0 · International: ${sentToday} · Parteneri locali: 0 · Agentii: 0`
      : "";
  const topDestinations = outreachTopList(outreachOwnerDestinations(report));
  const localDestinations = outreachTopList(report.localPartners?.topDestinations || [], 8);
  const details = [
    jobPaused ? "Job controlat: pauza globala activa." : "",
    zoneLine,
    topDestinations ? `Destinații cazare: ${topDestinations}.` : "",
    localDestinations ? `Parteneri locali: ${localDestinations}.` : "",
    reportSent && rawSentToday > reportSent ? `Total SMTP azi: ${rawSentToday}/${dailyLimit}.` : "",
    lastSentAt ? `Ultima trimitere: ${lastSentAt} ora României.` : "",
    dateLabel ? `Data operațională: ${dateLabel}.` : "",
    failedToday ? `Eșecuri trimitere azi: ${failedToday}.` : "",
    bouncedToday ? `Bounce-uri azi: ${bouncedToday}.` : ""
  ].filter(Boolean).join(" ");

  return `
    <section class="nx-travel-daily-banner ${tone}" aria-label="Status outreach zilnic Trevoro">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(details || "Batch-ul zilnic este înregistrat în Nexora Travel.")}</span>
      </div>
      <a class="nx-btn" href="/nexora/travel/outreach">Vezi status</a>
    </section>
  `;
}

function renderSupportTicketBanner(summary = {}) {
  const unopened = Number(summary.unopenedCount || 0);
  if (!unopened) return "";
  return `
    <section class="nx-alert danger" style="border-width:2px;font-weight:950;margin-bottom:12px">
      Există ${escapeHtml(unopened)} tichete support nedeschise.
      <a class="nx-btn" href="/nexora/travel/support" style="margin-left:10px">Deschide Support</a>
    </section>
  `;
}

function compactTrafficList(items = [], labelKey = "path") {
  return (Array.isArray(items) ? items : [])
    .slice(0, 4)
    .map((item) => {
      const label = labelKey === "source"
        ? (item.source || "direct")
        : labelKey === "campaign"
          ? [item.campaign || "-", item.source || "", item.medium || ""].filter(Boolean).join(" / ")
          : (item.path || "-");
      return `${label}: ${Number(item.visitors || 0)} unici / ${Number(item.views || 0)} vizite`;
    })
    .join(" · ");
}

function renderTrevoroTrafficBanner(summary = {}) {
  const todayVisitors = Number(summary.todayVisitors || 0);
  const todayViews = Number(summary.todayViews || 0);
  const last7Visitors = Number(summary.last7Visitors || 0);
  const last7Views = Number(summary.last7Views || 0);
  const monthVisitors = Number(summary.monthVisitors || 0);
  const monthViews = Number(summary.monthViews || 0);
  const topPages = compactTrafficList(summary.topPages || [], "path");
  const topSources = compactTrafficList(summary.topSources || [], "source");
  const topCampaigns = compactTrafficList(summary.topCampaigns || [], "campaign");
  const lastVisitAt = dateValue(summary.lastVisitAt || "");
  const filterLabel = summary.excludedCurrentVisitor ? "IP-ul curent exclus" : "fără IP exclus";
  return `
    <section class="nx-travel-traffic-banner" aria-label="Trafic Trevoro.ro">
      <div class="nx-travel-traffic-head">
        <div>
          <strong>Trafic Trevoro.ro</strong>
          <span>${escapeHtml(filterLabel)}${lastVisitAt ? ` · ultima vizită: ${escapeHtml(lastVisitAt)}` : ""}</span>
        </div>
        <a class="nx-btn" href="/nexora/travel/inquiries">Cereri site</a>
      </div>
      <div class="nx-travel-traffic-kpis">
        <div><span>Azi</span><b>${escapeHtml(todayVisitors)}</b><small>${escapeHtml(todayViews)} vizite</small></div>
        <div><span>7 zile</span><b>${escapeHtml(last7Visitors)}</b><small>${escapeHtml(last7Views)} vizite</small></div>
        <div><span>Luna curentă</span><b>${escapeHtml(monthVisitors)}</b><small>${escapeHtml(monthViews)} vizite</small></div>
      </div>
      <div class="nx-travel-traffic-lines">
        <p><b>Top pagini:</b> ${escapeHtml(topPages || "traficul se va afișa după primele vizite.")}</p>
        <p><b>Surse:</b> ${escapeHtml(topSources || "direct / organic după colectare.")}</p>
        <p><b>Campanii:</b> ${escapeHtml(topCampaigns || "adaugă UTM-uri în postări ca să apară aici.")}</p>
      </div>
    </section>
  `;
}

function shell({ title, activePath, companyName, user, body }) {
  const currentPath = normalizeActivePath(activePath);
  const dailyOutreachBanner = renderDailyOutreachBanner(user?.travelDailyOutreachSummary || {});
  const supportTicketBanner = renderSupportTicketBanner(user?.travelSupportTicketSummary || {});
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath,
    eyebrow: "Nexora Travel",
    pageTitle: title,
    body: `${supportTicketBanner}${dailyOutreachBanner}${tabs(currentPath)}${body}`
  });
}

function emptyRows(colspan = 4, label = "Nu există înregistrări.") {
  return `<tr><td colspan="${escapeHtml(colspan)}"><div class="nx-empty-state">${escapeHtml(label)}</div></td></tr>`;
}

const TRAVEL_DISPLAY_TIME_ZONE = "Europe/Bucharest";
const TRAVEL_DATE_TIME_FORMAT = new Intl.DateTimeFormat("ro-RO", {
  timeZone: TRAVEL_DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23"
});

function utcDateFromValue(value = "") {
  const text = String(value || "").trim();
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const normalized = text.replace(" ", "T");
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = utcDateFromValue(text);
  if (!date) return text.replace("T", " ").slice(0, 16);
  const parts = Object.fromEntries(TRAVEL_DATE_TIME_FORMAT.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function inputDateTimeValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = utcDateFromValue(text);
  return date ? dateValue(text).replace(" ", "T") : text.replace(" ", "T").slice(0, 16);
}

function statusTone(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["activ", "interesat", "demo_programat", "rezolvat", "citit", "success"].includes(normalized)) return "success";
  if ([
    "nou",
    "contactat",
    "in_asteptare",
    "nerezolvat",
    "warning",
    "warn",
    "plata_necesara",
    "payment_required",
    "past_due",
    "unpaid",
    "expired"
  ].includes(normalized)) return "warn";
  if (["necitit", "error"].includes(normalized)) return "danger";
  if (["respins", "inactiv", "blocat", "sters", "deleted", "suspended"].includes(normalized)) return "danger";
  return "neutral";
}

function statusBadge(value = "") {
  const label = String(value || "-").replaceAll("_", " ");
  return `<span class="nx-status-pill ${statusTone(value)}">${escapeHtml(label)}</span>`;
}

function trevoroSignupSuccessMessage(mode = "") {
  if (String(mode || "") === "founding") {
    return "Mulțumim! Proprietatea a fost înscrisă gratuit pe Trevoro. Echipa va valida datele și va pregăti listarea.";
  }
  return "Mulțumim! Proprietatea a fost înscrisă pe Trevoro. Vei putea completa poze, calendar și detaliile proprietății din portalul de proprietar.";
}

function propertyPlanDisplay(row = {}) {
  const plan = String(row.partner_plan || "standard_monthly");
  const label = plan === "founding_partner" ? "Program lansare" : plan.replaceAll("_", " ");
  const freeUntil = row.free_until ? `până la ${dateValue(row.free_until)}` : "";
  return `
    <span class="nx-status-pill ${plan === "founding_partner" ? "success" : "neutral"}">${escapeHtml(label)}</span>
    <div class="nx-table-sub">${escapeHtml(freeUntil || "detalii interne")}</div>
  `;
}

function propertyDeleteAvailable(row = {}) {
  const status = String(row.status || "").trim().toLowerCase();
  const subscriptionStatus = String(row.subscription_status || "").trim().toLowerCase();
  if (["sters", "deleted"].includes(status) || row.deleted_at) return false;
  return ["activ", "plata_necesara"].includes(status)
    || ["payment_required", "past_due", "expired", "unpaid"].includes(subscriptionStatus);
}

function propertyDeleteForm(row = {}, { label = "Șterge" } = {}) {
  const id = Number(row.id || 0);
  if (!id || !propertyDeleteAvailable(row)) return `<span class="nx-table-sub">-</span>`;
  return `
    <form method="post" action="/nexora/travel/properties/${escapeHtml(id)}/delete" class="nx-inline-form compact" onsubmit="return confirm('Scoți proprietatea din public și suspenzi contul proprietarului?');">
      <input type="hidden" name="reason" value="manual_admin_delete">
      <button class="nx-btn danger" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function propertyFree12Active(row = {}) {
  const plan = String(row.partner_plan || "").trim().toLowerCase();
  const subscriptionStatus = String(row.subscription_status || "").trim().toLowerCase();
  const freeUntil = String(row.free_until || "").trim();
  return plan === "founding_partner"
    && ["free_12_months", "free_30_days", "active"].includes(subscriptionStatus)
    && (!freeUntil || freeUntil >= new Date().toISOString().slice(0, 10));
}

function propertyFree12Form(row = {}, { returnTo = "list", label = "Aplică" } = {}) {
  const id = Number(row.id || 0);
  if (!id) return "";
  if (propertyFree12Active(row)) {
    return `
      <div>
        <span class="nx-status-pill success">Gratis 12 luni activ</span>
        <div class="nx-table-sub">până la ${escapeHtml(dateValue(row.free_until) || "-")}</div>
      </div>
    `;
  }
  return `
    <form method="post" action="/nexora/travel/properties/${escapeHtml(id)}/free-12-months" class="nx-inline-form compact" onsubmit="return confirm('Activezi gratuit 12 luni pentru această proprietate?');">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      <label class="nx-check-field"><input type="checkbox" name="free_12_months" value="1" required><span>Gratis 12 luni</span></label>
      <button class="nx-btn" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function propertyPasswordResetForm(row = {}, { returnTo = "list", label = "Reset parolă" } = {}) {
  const id = Number(row.id || 0);
  if (!id) return "";
  const email = String(row.account_email || row.email || "").trim();
  if (!email) {
    return `<span class="nx-table-sub">fără email cont</span>`;
  }
  const confirmMessage = `Trimiți link de resetare parolă către ${email}?`;
  return `
    <form method="post" action="/nexora/travel/properties/${escapeHtml(id)}/password-reset" class="nx-inline-form compact" onsubmit="return confirm('${escapeHtml(escapeJsString(confirmMessage))}');">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      <button class="nx-btn" type="submit" title="Trimite link de resetare către ${escapeHtml(email)}">${escapeHtml(label)}</button>
    </form>
  `;
}

const OWNER_EVENT_LABELS = {
  owner_dashboard_opened: "A deschis contul",
  owner_login_code_requested: "Cod login cerut",
  owner_login_code_sent: "Cod login trimis",
  owner_login_code_error: "Eroare cod login",
  owner_password_reset_requested: "Resetare parolă cerută",
  owner_password_reset_email_sent: "Email resetare parolă trimis",
  owner_password_reset_email_error: "Eroare email resetare parolă",
  owner_password_reset_completed: "Parolă resetată",
  owner_billing_checkout_created: "Program proprietar actualizat",
  owner_billing_checkout_error: "Eroare program proprietar",
  owner_property_updated: "Date proprietate modificate",
  owner_property_update_error: "Eroare date proprietate",
  owner_billing_company_updated: "Date firmă modificate",
  owner_billing_company_error: "Eroare date firmă",
  owner_photo_uploaded: "Poze încărcate",
  owner_photo_upload_error: "Eroare încărcare poze",
  owner_photo_deleted: "Poză ștearsă",
  owner_photo_delete_error: "Eroare ștergere poză",
  owner_calendar_created: "Calendar adăugat",
  owner_calendar_create_error: "Eroare adăugare calendar",
  owner_calendar_synced: "Calendar sincronizat",
  owner_calendar_sync_error: "Eroare sincronizare calendar",
  owner_calendar_deleted: "Calendar șters",
  owner_calendar_delete_error: "Eroare ștergere calendar",
  owner_inquiry_status_updated: "Status cerere modificat",
  owner_inquiry_status_error: "Eroare status cerere",
  owner_booking_status_updated: "Status rezervare modificat",
  owner_booking_status_error: "Eroare status rezervare"
};

function ownerEventLabel(value = "") {
  const key = String(value || "").trim();
  return OWNER_EVENT_LABELS[key] || key.replaceAll("_", " ") || "-";
}

function ownerEventSeverityBadge(value = "") {
  const severity = String(value || "info").toLowerCase();
  const tone = severity === "error" ? "danger" : severity === "warning" ? "warn" : severity === "success" ? "success" : "neutral";
  const label = severity === "error" ? "eroare" : severity === "warning" ? "atenție" : severity === "success" ? "ok" : "info";
  return `<span class="nx-status-pill ${tone}">${escapeHtml(label)}</span>`;
}

function parseJsonObject(value = "") {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function ownerEventMetaSummary(row = {}) {
  const meta = parseJsonObject(row.metadata_json || "");
  const parts = [];
  if (Array.isArray(meta.changed_fields) && meta.changed_fields.length) {
    parts.push(`Câmpuri: ${meta.changed_fields.slice(0, 8).join(", ")}`);
  }
  if (Number(meta.saved_count || 0)) parts.push(`Poze salvate: ${Number(meta.saved_count || 0)}`);
  if (Number(meta.synced || 0)) parts.push(`Date calendar: ${Number(meta.synced || 0)}`);
  if (meta.status) parts.push(`Status: ${meta.status}`);
  if (meta.error) parts.push(`Eroare: ${meta.error}`);
  if (meta.calendar_id) parts.push(`Calendar #${meta.calendar_id}`);
  if (meta.photo_id) parts.push(`Poză #${meta.photo_id}`);
  if (meta.inquiry_id) parts.push(`Cerere #${meta.inquiry_id}`);
  if (meta.booking_id) parts.push(`Rezervare #${meta.booking_id}`);
  return parts.join(" · ");
}

function leadScoreTier(score = 0) {
  const value = Number(score || 0);
  if (value > 70) return { label: "Hot Lead", tone: "danger" };
  if (value >= 40) return { label: "Warm Lead", tone: "warn" };
  return { label: "Cold Lead", tone: "neutral" };
}

function leadScoreBadge(score = 0) {
  const tier = leadScoreTier(score);
  return `<span class="nx-status-pill ${tier.tone}">${escapeHtml(tier.label)}</span>`;
}

function leadScoreDisplay(score = 0) {
  return `<div class="nx-right"><b>${escapeHtml(score ?? 0)}</b><div style="margin-top:4px">${leadScoreBadge(score)}</div></div>`;
}

function rowsOrEmpty(rows = [], colspan = 4, mapper = () => "", empty = "Nu există înregistrări.") {
  return rows.length ? rows.map(mapper).join("") : emptyRows(colspan, empty);
}

function selected(actual = "", expected = "") {
  return String(actual || "") === String(expected || "") ? "selected" : "";
}

function checked(value = false) {
  return value ? "checked" : "";
}

function statusOptions(statuses = [], current = "", emptyLabel = "") {
  return [
    emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "",
    ...statuses.map((status) => `<option value="${escapeHtml(status)}" ${selected(current, status)}>${escapeHtml(status.replaceAll("_", " "))}</option>`)
  ].join("");
}

const TRAVEL_COUNTRY_OPTIONS = [
  ["Romania", "Romania"],
  ["Bulgaria", "Bulgaria"],
  ["Greece", "Grecia"],
  ["Albania", "Albania"],
  ["Turkey", "Turcia"],
  ["Cyprus", "Cipru"],
  ["Egypt", "Egipt"],
  ["Thailand", "Thailand"],
  ["Indonesia", "Indonezia"],
  ["Japan", "Japonia"],
  ["Vietnam", "Vietnam"],
  ["Malaysia", "Malaezia"],
  ["Singapore", "Singapore"],
  ["United Arab Emirates", "Emiratele Arabe Unite"],
  ["India", "India"],
  ["Sri Lanka", "Sri Lanka"],
  ["Maldives", "Maldive"],
  ["Philippines", "Filipine"],
  ["South Korea", "Coreea de Sud"],
  ["Morocco", "Maroc"],
  ["Tunisia", "Tunisia"],
  ["South Africa", "Africa de Sud"],
  ["Kenya", "Kenya"],
  ["Tanzania", "Tanzania"],
  ["Seychelles", "Seychelles"],
  ["Mauritius", "Mauritius"],
  ["Cape Verde", "Capul Verde"],
  ["Madagascar", "Madagascar"],
  ["Namibia", "Namibia"],
  ["Mexico", "Mexic"],
  ["Dominican Republic", "Republica Dominicana"],
  ["Costa Rica", "Costa Rica"],
  ["Brazil", "Brazilia"],
  ["Argentina", "Argentina"],
  ["Colombia", "Colombia"],
  ["Peru", "Peru"],
  ["Chile", "Chile"],
  ["Canada", "Canada"],
  ["Cuba", "Cuba"],
  ["Jamaica", "Jamaica"],
  ["Bahamas", "Bahamas"],
  ["Panama", "Panama"],
  ["United States", "Statele Unite"],
  ["Croatia", "Croatia"],
  ["Montenegro", "Muntenegru"],
  ["Italy", "Italia"],
  ["Spain", "Spania"],
  ["Portugal", "Portugalia"],
  ["France", "Franta"],
  ["Austria", "Austria"],
  ["Germany", "Germania"],
  ["United Kingdom", "Regatul Unit"],
  ["Ireland", "Irlanda"],
  ["Netherlands", "Olanda"],
  ["Belgium", "Belgia"],
  ["Switzerland", "Elvetia"],
  ["Slovenia", "Slovenia"],
  ["Serbia", "Serbia"],
  ["Bosnia and Herzegovina", "Bosnia si Hertegovina"],
  ["North Macedonia", "Macedonia de Nord"],
  ["Kosovo", "Kosovo"],
  ["Hungary", "Ungaria"],
  ["Czechia", "Cehia"],
  ["Slovakia", "Slovacia"],
  ["Poland", "Polonia"],
  ["Moldova", "Moldova"],
  ["Malta", "Malta"],
  ["Denmark", "Danemarca"],
  ["Sweden", "Suedia"],
  ["Norway", "Norvegia"],
  ["Finland", "Finlanda"],
  ["Iceland", "Islanda"],
  ["Estonia", "Estonia"],
  ["Latvia", "Letonia"],
  ["Lithuania", "Lituania"],
  ["Luxembourg", "Luxemburg"],
  ["Andorra", "Andorra"],
  ["Monaco", "Monaco"],
  ["San Marino", "San Marino"],
  ["Liechtenstein", "Liechtenstein"],
  ["Ukraine", "Ucraina"]
];

function travelCountryOptionsHtml(current = "Romania") {
  const selectedCountry = current || "Romania";
  return TRAVEL_COUNTRY_OPTIONS
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected(selectedCountry, value)}>${escapeHtml(label)}</option>`)
    .join("");
}

function roOutreachEmailExtra() {
  return [
    "Cum vă promovăm proprietatea:",
    "- proprietatea apare în căutarea Trevoro;",
    "- proprietățile selectate sunt promovate în campaniile de lansare și în conținut social;",
    "- construim pagini SEO pentru destinații și tipuri de proprietăți, ca turiștii să găsească mai ușor cazarea;",
    "- suportul este inclus pentru listare, poze, sincronizare calendar și cereri.",
    "",
    "Ce se întâmplă după înscriere:",
    "1. Primiți acces în contul de proprietar.",
    "2. Verificați datele proprietății și adăugați poze reale.",
    "3. Lipiți în Trevoro > Calendar linkul iCal/ICS din Google Calendar, Booking.com, Airbnb sau Outlook.",
    "4. Trevoro sincronizează zilele ocupate și vă ajută să pregătiți listarea pentru lansare."
  ].join("\n");
}

function enOutreachEmailExtra() {
  return [
    "How we promote your property:",
    "- your property is published in the Trevoro search experience;",
    "- selected properties are featured in launch campaigns and social content;",
    "- we create SEO-oriented property pages to help tourists find accommodation by destination and property type;",
    "- support is included for listing setup, photos, calendar sync and requests.",
    "",
    "What happens after registration:",
    "1. You receive access to the owner dashboard.",
    "2. You verify the property details and add real photos.",
    "3. You paste your iCal/ICS calendar link from Google Calendar, Booking.com, Airbnb or Outlook in Trevoro > Calendar.",
    "4. Trevoro syncs busy dates and helps you prepare the listing for launch."
  ].join("\n");
}

function outreachTemplates(lead = {}) {
  const name = String(lead.name || "proprietatea dvs.").trim();
  const city = String(lead.city || "zona dvs.").trim();
  const propertyType = String(lead.property_type || "proprietate").trim();
  const claimUrl = `https://www.trevoro.ro/proprietari#formular`;
  const internationalClaimUrl = `https://www.trevoro.ro/en/owners#form`;
  if (!isRomaniaLead(lead)) {
    return [
      {
        key: "telefon",
        label: "Telefon",
        message: `Hello, I am contacting you from Trevoro about ${name}, a ${propertyType} in ${city}. Trevoro is opening free owner registrations during launch. The account includes: ${TREVORO_OWNER_PLANS_EN}. We also offer support for publishing the property at ${TREVORO_SUPPORT_EMAIL}. Could we discuss for a few minutes?`
      },
      {
        key: "whatsapp",
        label: "WhatsApp",
        message: `Hello! I am contacting you from Trevoro. We found ${name}, ${propertyType} in ${city}, and we would like to invite you to prepare the property listing during our free launch program. Support: ${TREVORO_SUPPORT_EMAIL}. Register here: ${internationalClaimUrl}`
      },
      {
        key: "email",
        label: "Email",
        message: `Subject: Trevoro - free launch registration for ${name}\n\nHello,\n\nI am contacting you from Trevoro, a Romanian platform for hotels, guesthouses, villas, cabins and serviced apartments.\n\nWe found ${name}, a ${propertyType} in ${city}, and we would like to invite you to prepare your property listing on Trevoro.\n\nDuring the launch program, owner registration is free. The account includes: ${TREVORO_OWNER_PLANS_EN}.\n\n${enOutreachEmailExtra()}\n\nWe also offer support for publishing your property and preparing it for guests. If you need help, contact us directly at ${TREVORO_SUPPORT_EMAIL}.\n${TREVORO_SUPPORT_HOURS_EN}\n\nRegistration link: ${internationalClaimUrl}\n\nThank you,\nThe Trevoro Team`
      }
    ];
  }
  return [
    {
      key: "telefon",
      label: "Telefon",
      message: `Bună ziua, vă contactez din partea Trevoro în legătură cu ${name}, ${propertyType} din ${city}. Trevoro a deschis înscrierea gratuită a proprietarilor în programul de lansare. Contul include: ${TREVORO_OWNER_PLANS_RO}. Oferim suport la ${TREVORO_SUPPORT_EMAIL}. Putem discuta câteva minute?`
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      message: `Bună ziua! Sunt de la Trevoro. Am găsit ${name}, ${propertyType} din ${city}, și vrem să invităm proprietatea în programul de lansare Trevoro. Înscrierea proprietarilor este gratuită în această etapă. Suport: ${TREVORO_SUPPORT_EMAIL}. Înscriere aici: ${claimUrl}`
    },
      {
        key: "email",
        label: "Email",
      message: `Subiect: Trevoro - înscriere gratuită în programul de lansare pentru ${name}\n\nBună ziua,\n\nVă contactez din partea Trevoro, platformă românească pentru hoteluri, pensiuni, cabane, vile și apartamente.\n\nAm găsit ${name}, ${propertyType} din ${city}, și vrem să invităm proprietatea pe Trevoro.\n\nS-au deschis înscrierile pentru proprietari. În programul de lansare, proprietatea poate fi pregătită gratuit pe Trevoro. Contul include: ${TREVORO_OWNER_PLANS_RO}.\n\n${roOutreachEmailExtra()}\n\nOferim suport pentru publicarea proprietății, configurarea listării, fotografii și calendar. Pentru suport ne puteți scrie direct la ${TREVORO_SUPPORT_EMAIL}.\n${TREVORO_SUPPORT_HOURS_RO}\n\nÎnscrierea se face aici: ${claimUrl}\n\nDupă înscriere, echipa Trevoro confirmă datele și pregătește listarea.\n\nMulțumesc,\nEchipa Trevoro`
    }
  ];
}

const TREVORO_SUPPORT_EMAIL = "support@trevoro.ro";
const TREVORO_SUPPORT_HOURS_RO = "Program suport: 09:00-18:00, luni-vineri.";
const TREVORO_SUPPORT_HOURS_EN = "Support hours: 09:00-18:00, Monday-Friday, Romania time.";
const TREVORO_SUPPORT_MAILTO = `mailto:${TREVORO_SUPPORT_EMAIL}?subject=${encodeURIComponent("Am nevoie de suport pentru publicarea proprietății pe Trevoro")}`;
const TREVORO_AGENCY_SIGNUP_URL = "https://www.trevoro.ro/agentii#formular";
const TREVORO_AGENCY_SIGNUP_URL_EN = "https://www.trevoro.ro/en/agencies#form";
const TREVORO_OWNER_PLANS_RO = [
  "cont de proprietar",
  "pagină publică pregătită pentru validare",
  "poze, descriere, facilități, disponibilitate și calendar iCal/ICS",
  "contact direct și suport de publicare"
].join("; ");
const TREVORO_OWNER_PLANS_EN = [
  "owner dashboard account",
  "public page prepared for validation",
  "photos, description, amenities, availability and iCal/ICS calendar",
  "direct contact and publishing support"
].join("; ");

function isRomaniaLead(lead = {}) {
  return String(lead.country || "Romania").trim().toLowerCase() === "romania";
}

const WHATSAPP_COUNTRY_CODES = {
  romania: "40",
  bulgaria: "359",
  greece: "30",
  grecia: "30",
  albania: "355",
  turkey: "90",
  turcia: "90",
  turkiye: "90",
  cyprus: "357",
  cipru: "357",
  egypt: "20",
  egipt: "20",
  thailand: "66",
  thailanda: "66",
  indonesia: "62",
  indonezia: "62",
  japan: "81",
  japonia: "81",
  vietnam: "84",
  "viet nam": "84",
  malaysia: "60",
  malaezia: "60",
  singapore: "65",
  "united arab emirates": "971",
  "emiratele arabe unite": "971",
  uae: "971",
  india: "91",
  "sri lanka": "94",
  maldives: "960",
  maldive: "960",
  philippines: "63",
  filipine: "63",
  "south korea": "82",
  "koreea de sud": "82",
  morocco: "212",
  maroc: "212",
  tunisia: "216",
  "south africa": "27",
  "africa de sud": "27",
  kenya: "254",
  tanzania: "255",
  seychelles: "248",
  mauritius: "230",
  "cape verde": "238",
  "capul verde": "238",
  "cabo verde": "238",
  madagascar: "261",
  namibia: "264",
  mexico: "52",
  mexic: "52",
  "dominican republic": "1",
  "republica dominicana": "1",
  "costa rica": "506",
  brazil: "55",
  brazilia: "55",
  argentina: "54",
  colombia: "57",
  peru: "51",
  chile: "56",
  canada: "1",
  cuba: "53",
  jamaica: "1",
  bahamas: "1",
  panama: "507",
  "united states": "1",
  "statele unite": "1",
  sua: "1",
  usa: "1",
  croatia: "385",
  montenegro: "382",
  muntenegru: "382",
  portugal: "351",
  france: "33",
  franta: "33",
  switzerland: "41",
  elvetia: "41",
  belgium: "32",
  belgia: "32",
  netherlands: "31",
  olanda: "31",
  poland: "48",
  polonia: "48",
  czechia: "420",
  cehia: "420",
  slovakia: "421",
  slovacia: "421",
  ireland: "353",
  irlanda: "353",
  "united kingdom": "44",
  "regatul unit": "44",
  spain: "34",
  spania: "34",
  italy: "39",
  italia: "39",
  austria: "43",
  germany: "49",
  germania: "49",
  hungary: "36",
  ungaria: "36",
  slovenia: "386",
  serbia: "381",
  "bosnia and herzegovina": "387",
  "bosnia si hertegovina": "387",
  "north macedonia": "389",
  "macedonia de nord": "389",
  kosovo: "383",
  moldova: "373",
  malta: "356",
  denmark: "45",
  danemarca: "45",
  sweden: "46",
  suedia: "46",
  norway: "47",
  norvegia: "47",
  finland: "358",
  finlanda: "358",
  iceland: "354",
  islanda: "354",
  estonia: "372",
  latvia: "371",
  letonia: "371",
  lithuania: "370",
  lituania: "370",
  luxembourg: "352",
  luxemburg: "352",
  andorra: "376",
  monaco: "377",
  "san marino": "378",
  liechtenstein: "423",
  ukraine: "380",
  ucraina: "380"
};

const WHATSAPP_OPT_IN_LABELS = {
  unknown: "Opt-in necunoscut",
  manual: "Contact manual",
  confirmed: "Opt-in confirmat",
  declined: "Nu contacta"
};

const WHATSAPP_STATUS_LABELS = {
  manual: "Manual",
  manual_contacted: "Contactat manual",
  ready_for_api: "Pregătit API",
  do_not_contact: "Nu contacta"
};

function normalizeWhatsappCountryKey(country = "") {
  return String(country || "Romania")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeWhatsappPhone(value = "", country = "Romania") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  const countryCode = WHATSAPP_COUNTRY_CODES[normalizeWhatsappCountryKey(country)] || "";
  if (!raw.startsWith("+") && countryCode && !digits.startsWith(countryCode)) {
    digits = digits.startsWith("0") ? `${countryCode}${digits.slice(1)}` : `${countryCode}${digits}`;
  }
  return digits.length >= 8 ? digits : "";
}

function whatsappOptInStatus(lead = {}) {
  const status = String(lead.whatsapp_opt_in_status || "unknown").trim().toLowerCase();
  return WHATSAPP_OPT_IN_LABELS[status] ? status : "unknown";
}

function whatsappStatus(lead = {}) {
  const status = String(lead.whatsapp_status || "manual").trim().toLowerCase();
  return WHATSAPP_STATUS_LABELS[status] ? status : "manual";
}

function whatsappOptInBadge(lead = {}) {
  const status = whatsappOptInStatus(lead);
  const tone = status === "confirmed" ? "success" : status === "declined" ? "danger" : status === "manual" ? "warn" : "neutral";
  return `<span class="nx-status-pill ${tone}">${escapeHtml(WHATSAPP_OPT_IN_LABELS[status])}</span>`;
}

function whatsappLeadPhone(lead = {}) {
  return String(lead.whatsapp_phone || lead.phone || "").trim();
}

function whatsappMessageHref(lead = {}, message = "") {
  const phone = normalizeWhatsappPhone(whatsappLeadPhone(lead), lead.country || "Romania");
  if (!phone) return "";
  return `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message || "")}`;
}

function trevoroOutreachTemplates(lead = {}) {
  const name = String(lead.name || "proprietatea dvs.").trim();
  const city = String(lead.city || "zona dvs.").trim();
  const propertyType = String(lead.property_type || "proprietate").trim();
  const claimUrl = `https://www.trevoro.ro/proprietari#formular`;
  const internationalClaimUrl = `https://www.trevoro.ro/en/owners#form`;
  if (!isRomaniaLead(lead)) {
    return [
      {
        key: "email",
        label: "Email",
        message: `Subject: Trevoro - free launch registration for ${name}\n\nHello,\n\nI am contacting you from Trevoro, a Romanian platform for hotels, guesthouses, villas, cabins and serviced apartments.\n\nWe found ${name}, a ${propertyType} in ${city}, and we would like to invite you to prepare your property listing on Trevoro.\n\nDuring the launch program, owner registration is free. The account includes: ${TREVORO_OWNER_PLANS_EN}.\n\n${enOutreachEmailExtra()}\n\nWe also offer support for publishing your property and preparing it for guests. If you need help, contact us directly at ${TREVORO_SUPPORT_EMAIL}.\n${TREVORO_SUPPORT_HOURS_EN}\n\nRegistration link: ${internationalClaimUrl}\n\nThank you,\nThe Trevoro Team`
      },
      {
        key: "whatsapp",
        label: "WhatsApp",
        message: `Hello! I am contacting you from Trevoro. We found ${name}, ${propertyType} in ${city}, and we would like to invite you to prepare the property listing during our free launch program. Support: ${TREVORO_SUPPORT_EMAIL}. Register here: ${internationalClaimUrl}`
      },
      {
        key: "sms",
        label: "SMS",
        message: `Trevoro invites ${name}: free owner registration during launch. Support: ${TREVORO_SUPPORT_EMAIL}. Register: ${internationalClaimUrl}`
      }
    ];
  }
  return [
    {
      key: "email",
      label: "Email",
      message: `Subiect: Trevoro - înscriere gratuită în programul de lansare pentru ${name}\n\nBună ziua,\n\nVă contactez din partea Trevoro, platformă românească pentru hoteluri, pensiuni, cabane, vile și apartamente.\n\nAm găsit ${name}, ${propertyType} din ${city}, și vrem să invităm proprietatea pe Trevoro.\n\nS-au deschis înscrierile pentru proprietari. În programul de lansare, proprietatea poate fi pregătită gratuit pe Trevoro. Contul include: ${TREVORO_OWNER_PLANS_RO}.\n\n${roOutreachEmailExtra()}\n\nOferim suport pentru publicarea proprietății, configurarea listării, fotografii și calendar. Pentru suport ne puteți scrie direct la ${TREVORO_SUPPORT_EMAIL}.\n${TREVORO_SUPPORT_HOURS_RO}\n\nÎnscrierea se face aici: ${claimUrl}\n\nDupă înscriere, echipa Trevoro confirmă datele și pregătește listarea.\n\nMulțumesc,\nEchipa Trevoro`
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      message: `Bună ziua! Sunt de la Trevoro. Am găsit ${name}, ${propertyType} din ${city}, și vrem să invităm proprietatea în programul de lansare Trevoro. Înscrierea proprietarilor este gratuită în această etapă. Suport: ${TREVORO_SUPPORT_EMAIL}. Înscriere aici: ${claimUrl}`
    },
    {
      key: "sms",
      label: "SMS",
      message: `Trevoro invită ${name}: înscriere gratuită în programul de lansare. Suport: ${TREVORO_SUPPORT_EMAIL}. Înscriere: ${claimUrl}`
    }
  ];
}

function simpleOptions(values = [], current = "", emptyLabel = "toate") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}" ${selected(current, value)}>${escapeHtml(value)}</option>`)
  ].join("");
}

function leadQuery(filters = {}, overrides = {}) {
  const merged = { ...filters, ...overrides };
  const pairs = [
    ["status", merged.status],
    ["country", merged.country],
    ["county", merged.county],
    ["source", merged.source],
    ["min_score", merged.min_score],
    ["contactable", merged.contactable ? "1" : ""],
    ["q", merged.q]
  ].filter(([, value]) => String(value ?? "") !== "");
  const query = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  return query ? `?${query}` : "";
}

function agencyQuery(filters = {}, overrides = {}) {
  const merged = { ...filters, ...overrides };
  const pairs = [
    ["status", merged.status],
    ["country", merged.country],
    ["source", merged.source],
    ["contactable", merged.contactable ? "1" : ""],
    ["q", merged.q]
  ].filter(([, value]) => String(value ?? "") !== "");
  const query = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  return query ? `?${query}` : "";
}

function localPartnerQuery(filters = {}, overrides = {}) {
  const merged = { ...filters, ...overrides };
  const pairs = [
    ["status", merged.status],
    ["partner_type", merged.partner_type],
    ["region", merged.region],
    ["source", merged.source],
    ["contactable", merged.contactable ? "1" : ""],
    ["q", merged.q]
  ].filter(([, value]) => String(value ?? "") !== "");
  const query = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  return query ? `?${query}` : "";
}

function propertyQuery(filters = {}, overrides = {}) {
  const merged = { ...filters, ...overrides };
  const pairs = [
    ["country", merged.country],
    ["status", merged.status],
    ["q", merged.q]
  ].filter(([, value]) => String(value ?? "") !== "");
  const query = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  return query ? `?${query}` : "";
}

const IMPORT_COLUMNS = [
  ["name", "Name"],
  ["property_type", "Property type"],
  ["city", "City"],
  ["county", "County"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["website", "Website"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["source", "Source"],
  ["google_reviews", "Google reviews"]
];

const CONTENT_TYPE_LABELS = {
  seo_article: "Articol SEO",
  facebook_post: "Facebook post",
  facebook_gallery: "Facebook galerie",
  instagram_post: "Instagram post",
  tiktok_script: "TikTok script",
  newsletter: "Newsletter content"
};

const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  newsletter: "Newsletter"
};
const BLOG_CATEGORIES = [
  { label: "Cabane", slug: "cabane" },
  { label: "Hoteluri", slug: "hoteluri" },
  { label: "Pensiuni", slug: "pensiuni" },
  { label: "Destinații", slug: "destinatii" },
  { label: "Ghiduri", slug: "ghiduri" }
];

function contentTypeLabel(value = "") {
  return CONTENT_TYPE_LABELS[value] || String(value || "-").replaceAll("_", " ");
}

function platformLabel(value = "") {
  return PLATFORM_LABELS[value] || String(value || "-");
}

function socialMediaDisplay(value = "") {
  const text = String(value || "").trim();
  if (!text) return `<span class="nx-muted">-</span>`;
  if (/^https?:\/\//i.test(text)) {
    return `<a class="nx-link" href="${escapeHtml(text)}" target="_blank" rel="noreferrer">Media</a>`;
  }
  if (/^[\[{]/.test(text)) return `<span class="nx-status-pill neutral">Galerie</span>`;
  return `<span class="nx-muted">${escapeHtml(shortText(text, 32))}</span>`;
}

function shortText(value = "", limit = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function externalHref(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function plainText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function articleExcerpt(article = {}, limit = 170) {
  return shortText(plainText(article.meta_description || article.content || article.title || ""), limit);
}

function importColumnSelect(column, headers = [], mapping = {}) {
  const current = String(mapping[column] ?? "");
  return `
    <select name="map_${escapeHtml(column)}">
      <option value="">-- nemapat --</option>
      ${headers.map((header) => `
        <option value="${escapeHtml(header.index)}" ${selected(current, String(header.index))}>${escapeHtml(header.label || `Coloana ${Number(header.index || 0) + 1}`)}</option>
      `).join("")}
    </select>
  `;
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    status: "Lead-ul a fost actualizat.",
    converted: "Lead-ul a fost convertit în proprietate.",
	    contacted: "Lead-ul a fost marcat contactat și follow-up-ul a fost setat automat.",
	    inquiry_status: "Cererea din site a fost actualizată.",
	    property_photos: "Galeria proprietății a fost actualizată.",
	    property_calendar: "Calendarul proprietății a fost actualizat.",
	    property_deleted: "Proprietatea a fost scoasă din public, iar contul proprietarului a fost suspendat.",
	    property_free_12_months: "Proprietatea a fost activată gratuit pentru 12 luni.",
	    owner_password_reset_sent: "Emailul cu link de resetare parolă a fost trimis proprietarului.",
	    whatsapp_saved: "Setările WhatsApp au fost salvate.",
	    scoring: "Setările de scoring au fost salvate și lead-urile au fost recalculate.",
	    content_generated: "Conținutul a fost generat și salvat ca draft.",
	    social_account: "Contul social a fost salvat.",
	    social_media: "URL-ul media a fost salvat.",
	    social_queued: "Postarea a fost pusă în coada de publicare.",
	    social_processed: "Coada de publicare a fost procesată.",
	    social_processed_with_errors: "Coada a fost procesată, dar unele publicări au eșuat.",
	    facebook_connected: "Pagina Facebook a fost conectată și postările manuale au fost mutate în coadă.",
	    tiktok_connected: "Contul TikTok a fost conectat.",
	    email_synced: "Inbox-ul Trevoro a fost sincronizat.",
	    email_repaired: "Verificarea emailurilor eșuate a fost rulată.",
	    outreach_job_started: "Jobul de outreach a pornit controlat.",
	    outreach_job_paused: "Pauza a fost cerută. Trimiterea se oprește înainte de următorul email.",
	    outreach_job_stopped: "Jobul de outreach a fost oprit.",
    ticket_translated: "Traducerea conversației a fost actualizată.",
    ticket_reply_translated: "Draftul de răspuns a fost tradus în limba clientului.",
    ticket_replied: "Răspunsul a fost trimis.",
    whatsapp_settings: "Setările WhatsApp Business au fost salvate.",
    local_partner_enriched: "Enrichment-ul social pentru parteneri locali a fost rulat.",
    integration_saved: "Statusul integrării a fost salvat."
	  };
	  const errMessages = {
	    invalid: "Statusul trimis nu este valid.",
	    missing: "Lead-ul nu a fost găsit.",
	    already_converted: "Lead-ul este deja convertit în proprietate.",
	    missing_property: "Alege o proprietate pentru generare.",
	    content_failed: "Generarea de conținut nu a putut fi finalizată.",
	    missing_post: "Postarea socială nu a fost găsită.",
	    missing_social_account: "Contul social nu este configurat.",
	    unsupported_platform: "Platforma nu este suportată pentru publicare.",
	    publish_failed: "Publicarea nu a putut fi finalizată.",
	    invalid_media_url: "URL-ul media trebuie să fie HTTPS.",
	    facebook_config_missing: "Configurarea Facebook lipsește. Setează client id, client secret și redirect URI dacă este nevoie.",
	    facebook_oauth_denied: "Autorizarea Facebook a fost anulată sau respinsă.",
	    facebook_oauth_state: "Sesiunea Facebook a expirat. Pornește conectarea din nou.",
	    facebook_oauth_code: "Facebook nu a returnat codul de autorizare.",
	    facebook_oauth_failed: "Conectarea Facebook nu a putut fi finalizată.",
	    tiktok_config_missing: "Configurarea TikTok lipsește. Setează client key, client secret și redirect URI.",
	    tiktok_oauth_denied: "Autorizarea TikTok a fost anulată sau respinsă.",
	    tiktok_oauth_state: "Sesiunea TikTok a expirat. Pornește conectarea din nou.",
	    tiktok_oauth_code: "TikTok nu a returnat codul de autorizare.",
	    tiktok_oauth_failed: "Conectarea TikTok nu a putut fi finalizată.",
	    imap_not_configured: "IMAP nu este configurat pentru mailbox-ul Trevoro.",
	    email_sync_failed: "Sincronizarea inbox-ului nu a putut fi finalizată.",
	    email_repair_failed: "Verificarea emailurilor eșuate nu a putut fi finalizată.",
	    outreach_job_running: "Există deja un job de outreach în rulare.",
	    outreach_job_no_limit: "Setează cel puțin o limită mai mare de 0 înainte de Start.",
	    outreach_job_start_confirmation_required: "Pentru trimitere reală trebuie bifată confirmarea de pornire.",
	    outreach_job_start_failed: "Jobul de outreach nu a putut porni.",
	    outreach_job_control_failed: "Comanda de control nu a putut fi aplicată.",
    openai_missing: "OPENAI_API_KEY nu este configurat pentru traduceri.",
    google_translate_missing: "GOOGLE_TRANSLATE_API_KEY nu este configurat pentru traduceri.",
    translation_failed: "Traducerea nu a putut fi finalizată.",
    missing_message: "Scrie mesajul înainte de traducere sau trimitere.",
    missing_recipient: "Nu există destinatar pentru răspuns.",
    smtp_not_configured: "SMTP nu este configurat pentru trimiterea răspunsului.",
    reply_failed: "Răspunsul nu a putut fi trimis.",
    local_partner_enrichment_failed: "Enrichment-ul social pentru parteneri locali nu a putut fi finalizat.",
	    missing_inquiry: "Cererea din site nu a fost găsită.",
	    missing_property: "Proprietatea nu a fost găsită.",
	    missing_photo: "Alege cel puțin o poză.",
	    photo_limit: "Galeria poate avea maximum 30 de poze.",
	    file_too_large: "Poza este prea mare. Încarcă imagini de maximum 20 MB fiecare.",
	    unexpected_photo_field: "Câmpul de upload nu este valid.",
	    invalid_photo_type: "Pozele acceptate sunt JPG, PNG sau WebP.",
	    invalid_calendar_url: "Linkul de calendar trebuie să fie un URL valid.",
	    missing_calendar: "Calendarul nu a fost găsit.",
	    property_free_12_failed: "Nu am putut activa perioada gratuită de 12 luni.",
	    missing_owner_email: "Proprietatea nu are email pentru contul proprietarului.",
	    password_reset_failed: "Resetarea parolei nu a putut fi inițiată.",
    integration_missing: "Integrarea nu a fost găsită."
	  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function outreachJobLabel(status = "") {
  return ({
    idle: "oprit",
    running: "rulează",
    pause_requested: "pauză cerută",
    paused: "pauză activă",
    stopped: "oprit",
    finished: "finalizat"
  })[String(status || "idle")] || String(status || "oprit");
}

function outreachJobTone(status = "") {
  return ({
    running: "success",
    pause_requested: "warn",
    paused: "warn",
    stopped: "danger",
    finished: "neutral",
    idle: "neutral"
  })[String(status || "idle")] || "neutral";
}

function renderOutreachJobDashboardControl(outreachJob = {}) {
  const status = String(outreachJob.status || "idle");
  const options = outreachJob.options || {};
  const statusPill = `<span class="nx-status-pill ${outreachJobTone(status)}">${escapeHtml(outreachJobLabel(status))}</span>`;
  const pausedPill = outreachJob.paused ? `<span class="nx-status-pill warn">pauză globală activă</span>` : `<span class="nx-status-pill neutral">flag pauză inactiv</span>`;
  const canPause = outreachJob.running || !outreachJob.paused;
  const canStop = outreachJob.running || !outreachJob.paused;
  const latestReport = outreachJob.latest_report || {};
  const latestSummary = latestReport.summary || {};
  const sentInfo = latestReport.file_path
    ? `Ultimul raport: ${dateValue(latestReport.updated_at) || "-"} · trimise ${Number(latestSummary.sent || 0)} · eșuate ${Number(latestSummary.failed || 0)}.`
    : "Nu există încă raport de trimitere pentru jobul controlat.";

  return `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Control job email Trevoro</h1>
          <p>${statusPill} ${pausedPill}</p>
        </div>
        <div class="nx-right">
          <div class="nx-table-sub">PID: ${escapeHtml(outreachJob.pid || "-")}</div>
          <div class="nx-table-sub">Actualizat: ${escapeHtml(dateValue(outreachJob.updated_at) || "-")}</div>
        </div>
      </div>
      <div class="nx-empty-state" style="margin-bottom:12px">${escapeHtml(sentInfo)} Când pauza globală este activă, scripturile Trevoro ies înainte să trimită emailuri.</div>
      <form method="post" action="/nexora/travel/outreach/job/start" class="nx-inline-form">
        <label class="nx-field"><span>România</span><input type="number" name="romania_limit" min="0" max="400" value="${escapeHtml(options.romania_limit ?? 0)}"></label>
        <label class="nx-field"><span>International</span><input type="number" name="international_limit" min="0" max="400" value="${escapeHtml(options.international_limit ?? 0)}"></label>
        <input type="hidden" name="local_limit" value="0">
        <input type="hidden" name="daily_quota" value="${escapeHtml(options.daily_quota ?? 20)}">
        <input type="hidden" name="delay_seconds" value="${escapeHtml(options.delay_seconds ?? 45)}">
        <input type="hidden" name="min_score" value="${escapeHtml(options.min_score ?? 0)}">
        <input type="hidden" name="source" value="${escapeHtml(options.source || "all")}">
        <input type="hidden" name="dry_run" value="0">
        <label class="nx-check-field"><input type="checkbox" name="confirm_start" value="1" required><span>Confirm pornirea trimiterii reale</span></label>
        <button class="nx-btn primary" type="submit" ${outreachJob.running ? "disabled" : ""}>Pornește</button>
      </form>
      <div class="nx-form-actions" style="margin-top:12px">
        <form method="post" action="/nexora/travel/outreach/job/pause">
          <button class="nx-btn" type="submit" ${canPause ? "" : "disabled"}>Pauză</button>
        </form>
        <form method="post" action="/nexora/travel/outreach/job/stop" onsubmit="return confirm('Oprești jobul de outreach și blochezi trimiterile?');">
          <button class="nx-btn danger" type="submit" ${canStop ? "" : "disabled"}>Oprire</button>
        </form>
        <a class="nx-btn" href="/nexora/travel/outreach">Vezi mesaje și rapoarte</a>
      </div>
    </section>
  `;
}

function dashboardNumber(value = 0) {
  return new Intl.NumberFormat("ro-RO").format(Number(value || 0));
}

function dashboardPercent(value = 0, total = 0) {
  const totalNumber = Number(total || 0);
  if (!totalNumber) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / totalNumber) * 100)));
}

function dashboardBarWidth(value = 0, max = 0) {
  const maxNumber = Number(max || 0);
  if (!maxNumber) return 0;
  return Math.max(4, Math.min(100, Math.round((Number(value || 0) / maxNumber) * 100)));
}

function dashboardMoney(rows = []) {
  const items = (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row.amount || 0) > 0)
    .map((row) => {
      const currency = String(row.currency || "RON").toUpperCase();
      const amount = new Intl.NumberFormat("ro-RO", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(Number(row.amount || 0));
      return `${amount} ${currency}`;
    });
  return items.join(" / ") || "0";
}

function dashboardStatusLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();
  const labels = {
    paid: "plătite",
    failed: "eșuate",
    cancelled: "anulate",
    initiated: "pending",
    processing: "în procesare",
    pending: "pending",
    draft: "draft",
    ready: "ready",
    scheduled: "programate",
    published: "publicate",
    queued: "în coadă",
    manual_required: "manual",
    outbound: "trimise",
    outbound_failed: "eșuate",
    bounce: "bounce",
    inbound: "răspunsuri",
    nou: "noi",
    contactat: "contactate",
    interesat: "interesate",
    demo_programat: "demo programat",
    activ: "active",
    respins: "respinse"
  };
  return labels[key] || key.replaceAll("_", " ") || "-";
}

function renderDashboardBars(rows = [], {
  labelKey = "label",
  valueKey = "value",
  meta = () => "",
  empty = "Nu există date pentru grafic."
} = {}) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, __value: Number(row[valueKey] || 0) }))
    .filter((row) => row.__value > 0);
  const max = Math.max(0, ...normalized.map((row) => row.__value));
  if (!normalized.length) return `<div class="nx-dashboard-empty">${escapeHtml(empty)}</div>`;
  return `
    <div class="nx-dashboard-bars">
      ${normalized.map((row) => {
        const label = row[labelKey] || "-";
        const width = dashboardBarWidth(row.__value, max);
        const extra = meta(row);
        return `
          <div class="nx-dashboard-bar-row">
            <div class="nx-dashboard-bar-label"><span>${escapeHtml(label)}</span><b>${escapeHtml(dashboardNumber(row.__value))}</b></div>
            <div class="nx-dashboard-bar-track"><span style="width:${escapeHtml(width)}%"></span></div>
            ${extra ? `<div class="nx-dashboard-bar-meta">${escapeHtml(extra)}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboardDailyChart(rows = []) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => ({
    label: String(row.day || "").slice(5) || "-",
    views: Number(row.views || 0),
    visitors: Number(row.visitors || 0)
  }));
  const max = Math.max(0, ...normalized.map((row) => row.views));
  if (!normalized.length || !max) return `<div class="nx-dashboard-empty">Traficul se va afișa după colectarea vizitelor.</div>`;
  return `
    <div class="nx-dashboard-daily-chart">
      ${normalized.map((row) => {
        const height = Math.max(10, Math.round((row.views / max) * 100));
        return `
          <div class="nx-dashboard-day" title="${escapeHtml(row.label)}: ${escapeHtml(row.views)} vizite, ${escapeHtml(row.visitors)} vizitatori">
            <span style="height:${escapeHtml(height)}%"></span>
            <small>${escapeHtml(row.label)}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboardTable(rows = [], columns = [], empty = "Nu există date.") {
  if (!Array.isArray(rows) || !rows.length) return `<div class="nx-dashboard-empty">${escapeHtml(empty)}</div>`;
  return `
    <div class="nx-dashboard-table-wrap">
      <table class="nx-table compact">
        <thead><tr>${columns.map((column) => `<th class="${column.align === "right" ? "nx-right" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              ${columns.map((column) => {
                const raw = typeof column.value === "function" ? column.value(row) : row[column.key];
                return `<td class="${column.align === "right" ? "nx-right" : ""}">${column.html ? raw : escapeHtml(raw ?? "-")}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderNexoraTravelDashboardPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const analytics = options.analytics || {};
  const traffic = analytics.traffic || options.user?.travelTrafficSummary || {};
  const lotogenTraffic = options.lotogenTraffic || {};
  const payments = analytics.payments || {};
  const social = analytics.social || {};
  const emailZones = analytics.emailZones || {};
  const leadBreakdown = analytics.leadBreakdown || {};
  const outreachControl = renderOutreachJobDashboardControl(options.outreachJob || {});
  const leadTotal = Number(stats.totalLeads || 0);
  const contactedRate = dashboardPercent(stats.contactedLeads, leadTotal);
  const activeRate = dashboardPercent(stats.activeLeads, leadTotal);
  const trafficVisitors30 = Number(traffic.last30Visitors || traffic.monthVisitors || 0);
  const trafficViews30 = Number(traffic.last30Views || traffic.monthViews || 0);
  const paidPayments = Number(payments.paidPayments || 0);
  const pendingPayments = Number(payments.pendingPayments || 0);
  const failedPayments = Number(payments.failedPayments || 0);
  const facebookPublished = Number(social.facebookPublished || 0);
  const facebookTraffic = social.facebookTraffic || {};
  const leadFunnelRows = [
    { label: "Total lead-uri", value: stats.totalLeads || 0 },
    { label: "Contactate", value: stats.contactedLeads || 0 },
    { label: "Active", value: stats.activeLeads || 0 },
    { label: "Interesate / înscrieri", value: stats.interestedLeads || 0 }
  ];
  const paymentRows = [
    { label: "Confirmate", value: paidPayments },
    { label: "În așteptare", value: pendingPayments },
    { label: "Cu eroare", value: failedPayments }
  ];
  const facebookRows = [
    { label: "Publicate", value: facebookPublished },
    { label: "Ready", value: social.facebookReady || 0 },
    { label: "Draft", value: social.facebookDraft || 0 },
    { label: "Manual / coadă", value: social.facebookManualRequired || 0 }
  ];
  const emailRows = (emailZones.zones || []).slice(0, 8).map((row) => ({
    label: row.zone || "-",
    value: row.sent || 0,
    failed: row.failed || 0,
    bounced: row.bounced || 0,
    inbound: row.inbound || 0
  }));
  const sourceRows = (traffic.topSources || []).slice(0, 6).map((row) => ({
    label: row.source || "direct",
    value: row.visitors || 0,
    views: row.views || 0
  }));
  const lotogenSourceRows = (lotogenTraffic.topSources || []).slice(0, 6).map((row) => ({
    label: row.source || "direct", value: row.visitors || 0, views: row.views || 0
  }));
  const dashboardStyle = `
    <style>
      .nx-dashboard-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:14px;padding:18px 20px;border:1px solid #dbe3ef;border-radius:12px;background:#fff}
      .nx-dashboard-hero h1{margin:0;font-size:24px;line-height:1.15}
      .nx-dashboard-hero p{margin:6px 0 0;color:#5d6b82;max-width:760px}
      .nx-dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:14px}
      .nx-dashboard-panel{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:16px;box-shadow:0 14px 30px rgba(15,23,42,.05)}
      .nx-dashboard-panel.wide{grid-column:1/-1}
      .nx-dashboard-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      .nx-dashboard-panel-head h2{margin:0;font-size:17px}
      .nx-dashboard-panel-head p{margin:4px 0 0;color:#64748b;font-size:13px}
      .nx-dashboard-chip{display:inline-flex;align-items:center;border:1px solid #dbe3ef;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;background:#f8fafc;color:#0f172a;white-space:nowrap}
      .nx-dashboard-empty{padding:18px;border:1px dashed #ccd7e5;border-radius:10px;background:#f8fafc;color:#64748b;font-weight:700}
      .nx-dashboard-bars{display:grid;gap:10px}
      .nx-dashboard-bar-label{display:flex;justify-content:space-between;gap:10px;font-size:13px;font-weight:800}
      .nx-dashboard-bar-track{height:10px;border-radius:999px;background:#edf2f7;overflow:hidden}
      .nx-dashboard-bar-track span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#0f766e,#2563eb)}
      .nx-dashboard-bar-meta{margin-top:3px;color:#64748b;font-size:12px}
      .nx-dashboard-daily-chart{display:flex;align-items:end;gap:7px;height:190px;padding-top:12px;border-bottom:1px solid #dbe3ef}
      .nx-dashboard-day{flex:1;min-width:18px;height:160px;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:6px}
      .nx-dashboard-day span{display:block;width:100%;min-height:8px;border-radius:8px 8px 2px 2px;background:#0f766e}
      .nx-dashboard-day small{font-size:10px;color:#64748b;writing-mode:vertical-rl;transform:rotate(180deg)}
      .nx-dashboard-table-wrap{overflow:auto}
      .nx-table.compact th,.nx-table.compact td{padding:9px 10px}
      @media (max-width:980px){.nx-dashboard-grid{grid-template-columns:1fr}.nx-dashboard-hero{display:block}.nx-dashboard-hero .nx-form-actions{margin-top:12px}.nx-dashboard-panel.wide{grid-column:auto}}
    </style>
  `;
  const body = `
    ${dashboardStyle}
    <section class="nx-dashboard-hero">
      <div>
        <h1>Analiză operațională Trevoro</h1>
        <p>Date concrete pentru trafic, lead-uri, social media și email outreach. Fără liste recente, doar indicatori și agregări utile.</p>
      </div>
      <div class="nx-form-actions">
        <a class="nx-btn primary" href="/nexora/travel/dashboard/export.csv">Export dashboard CSV</a>
        <a class="nx-btn" href="/nexora/travel/properties">Proprietăți</a>
        <a class="nx-btn" href="/nexora/travel/social-posts">Social Posts</a>
        <a class="nx-btn" href="/nexora/travel/outreach">Outreach</a>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">L</div><div><div class="nx-kpi-label">Lead-uri totale</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(stats.totalLeads || 0))}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">C</div><div><div class="nx-kpi-label">Contactate</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(stats.contactedLeads || 0))}</div><div class="nx-table-sub">${escapeHtml(contactedRate)}% din total</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">A</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(stats.activeLeads || 0))}</div><div class="nx-table-sub">${escapeHtml(activeRate)}% din total</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">T</div><div><div class="nx-kpi-label">Trafic 30 zile</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(trafficVisitors30))}</div><div class="nx-table-sub">${escapeHtml(dashboardNumber(trafficViews30))} vizite</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">P</div><div><div class="nx-kpi-label">Program lansare</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(stats.activeLeads || 0))}</div><div class="nx-table-sub">proprietăți active</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">F</div><div><div class="nx-kpi-label">Postări Facebook</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(facebookPublished))}</div><div class="nx-table-sub">${escapeHtml(dashboardNumber(facebookTraffic.visitors || 0))} vizitatori Meta</div></div></div>
    </section>

    <section class="nx-dashboard-grid">
      <article class="nx-dashboard-panel wide">
        <div class="nx-dashboard-panel-head">
          <div><h2>Trafic LotoGen</h2><p>Vizite și vizitatori pentru lotogen.qr-lab.ro, fără boți.</p></div>
          <span class="nx-dashboard-chip">ultima vizită ${escapeHtml(dateValue(lotogenTraffic.lastVisitAt) || "-")}</span>
        </div>
        <section class="nx-kpi-grid">
          <div class="nx-kpi-card"><div class="nx-kpi-icon green">24</div><div><div class="nx-kpi-label">Vizite 24h</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(lotogenTraffic.views24h || 0))}</div><div class="nx-table-sub">${escapeHtml(dashboardNumber(lotogenTraffic.visitors24h || 0))} vizitatori</div></div></div>
          <div class="nx-kpi-card"><div class="nx-kpi-icon blue">30</div><div><div class="nx-kpi-label">Vizite 30 zile</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(lotogenTraffic.views30d || 0))}</div><div class="nx-table-sub">${escapeHtml(dashboardNumber(lotogenTraffic.visitors30d || 0))} vizitatori</div></div></div>
          <div class="nx-kpi-card"><div class="nx-kpi-icon purple">T</div><div><div class="nx-kpi-label">Vizite totale</div><div class="nx-kpi-value">${escapeHtml(dashboardNumber(lotogenTraffic.totalViews || 0))}</div><div class="nx-table-sub">${escapeHtml(dashboardNumber(lotogenTraffic.totalVisitors || 0))} vizitatori</div></div></div>
        </section>
        <div class="nx-dashboard-grid">
          <div><h3>Evoluție 14 zile</h3>${renderDashboardDailyChart(lotogenTraffic.dailySeries || [])}</div>
          <div><h3>Surse trafic</h3>${renderDashboardBars(lotogenSourceRows, {labelKey:"label",valueKey:"value",meta:(row)=>`${dashboardNumber(row.views || 0)} vizite`})}</div>
        </div>
      </article>
      <article class="nx-dashboard-panel">
        <div class="nx-dashboard-panel-head">
          <div><h2>Funnel lead-uri</h2><p>Total, contactate, active și înscrieri.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(stats.newLeads || 0))} noi</span>
        </div>
        ${renderDashboardBars(leadFunnelRows, { labelKey: "label", valueKey: "value" })}
      </article>

      <article class="nx-dashboard-panel">
        <div class="nx-dashboard-panel-head">
          <div><h2>Trafic Trevoro 14 zile</h2><p>Vizite și vizitatori unici, fără boți.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(traffic.totalVisitors || 0))} vizitatori total</span>
        </div>
        ${renderDashboardDailyChart(traffic.dailySeries || [])}
      </article>

      <article class="nx-dashboard-panel">
        <div class="nx-dashboard-panel-head">
          <div><h2>Program de lansare</h2><p>Monitorizare internă pentru proprietăți înscrise și activare.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(stats.activeLeads || 0))} active</span>
        </div>
        ${renderDashboardBars([
          { label: "Lead-uri noi", value: Number(stats.newLeads || 0) },
          { label: "Contactate", value: Number(stats.contactedLeads || 0) },
          { label: "Active", value: Number(stats.activeLeads || 0) }
        ], { labelKey: "label", valueKey: "value" })}
      </article>

      <article class="nx-dashboard-panel">
        <div class="nx-dashboard-panel-head">
          <div><h2>Facebook</h2><p>Postări și trafic venit din Meta/Facebook.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(facebookTraffic.views || 0))} vizite Meta</span>
        </div>
        ${renderDashboardBars(facebookRows, { labelKey: "label", valueKey: "value" })}
      </article>

      <article class="nx-dashboard-panel wide">
        <div class="nx-dashboard-panel-head">
          <div><h2>Emailuri trimise pe zone</h2><p>Zonele cu volum mare de outreach și reacții.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(emailZones.sent || 0))} trimise</span>
        </div>
        ${renderDashboardBars(emailRows, {
          labelKey: "label",
          valueKey: "value",
          meta: (row) => `eșuate ${dashboardNumber(row.failed || 0)} · bounce ${dashboardNumber(row.bounced || 0)} · răspunsuri ${dashboardNumber(row.inbound || 0)}`
        })}
      </article>

      <article class="nx-dashboard-panel">
        <div class="nx-dashboard-panel-head">
          <div><h2>Surse trafic</h2><p>Canalele care aduc vizitatori pe Trevoro.</p></div>
          <span class="nx-dashboard-chip">30 zile</span>
        </div>
        ${renderDashboardBars(sourceRows, {
          labelKey: "label",
          valueKey: "value",
          meta: (row) => `${dashboardNumber(row.views || 0)} vizite`
        })}
      </article>

      <article class="nx-dashboard-panel">
        <div class="nx-dashboard-panel-head">
          <div><h2>Lead-uri pe status</h2><p>Distribuție operațională în CRM.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(leadTotal))} total</span>
        </div>
        ${renderDashboardBars((leadBreakdown.statusRows || []).map((row) => ({
          label: dashboardStatusLabel(row.status),
          value: row.total
        })), { labelKey: "label", valueKey: "value" })}
      </article>

      <article class="nx-dashboard-panel wide">
        <div class="nx-dashboard-panel-head">
          <div><h2>Top pagini și trafic social</h2><p>Pagini cu vizibilitate mare și trafic venit din Facebook/Instagram.</p></div>
          <span class="nx-dashboard-chip">${escapeHtml(dashboardNumber(facebookTraffic.visitors || 0))} vizitatori Meta</span>
        </div>
        ${renderDashboardTable(traffic.topPages || [], [
          { label: "Pagină", value: (row) => row.path || "-" },
          { label: "Tip", value: (row) => row.page_type || "-" },
          { label: "Vizitatori", align: "right", value: (row) => dashboardNumber(row.visitors || 0) },
          { label: "Vizite", align: "right", value: (row) => dashboardNumber(row.views || 0) }
        ], "Nu există trafic pe pagini.")}
      </article>
    </section>

    <section style="margin-top:14px">
      ${outreachControl}
    </section>
  `;
  return shell({ title: "Nexora Travel", activePath: "/nexora/travel/dashboard", companyName, user: options.user, body });
}

function renderNexoraTravelInternationalDashboardPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const countryStats = Array.isArray(options.countryStats) ? options.countryStats : [];
  const recentLeads = Array.isArray(options.recentLeads) ? options.recentLeads : [];
  const recentMessages = Array.isArray(options.recentMessages) ? options.recentMessages : [];

  const countryRows = rowsOrEmpty(countryStats, 10, (row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/travel/leads?country=${encodeURIComponent(row.country || "")}">${escapeHtml(row.country || "-")}</a></td>
      <td class="nx-right">${escapeHtml(row.totalLeads || 0)}</td>
      <td class="nx-right">${escapeHtml(row.contactable || 0)}</td>
      <td class="nx-right">${escapeHtml(row.hotLeads || 0)}</td>
      <td class="nx-right">${escapeHtml(row.sent || 0)}</td>
      <td class="nx-right">${escapeHtml(row.failed || 0)}</td>
      <td class="nx-right">${escapeHtml(row.bounced || 0)}</td>
    </tr>
  `, "Nu există lead-uri internaționale încă.");

  const leadRows = rowsOrEmpty(recentLeads, 9, (row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a><div class="nx-table-sub">${escapeHtml(row.property_type || "-")}</div></td>
      <td>${escapeHtml(row.country || "-")}</td>
      <td>${escapeHtml(row.city || "-")}</td>
      <td>${escapeHtml(row.email || "-")}</td>
      <td>${escapeHtml(row.source || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${leadScoreDisplay(row.score ?? 0)}</td>
      <td>${escapeHtml(dateValue(row.next_follow_up_at) || "-")}</td>
      <td><a class="nx-btn" href="/nexora/travel/leads/${escapeHtml(row.id)}">Detalii</a></td>
    </tr>
  `, "Nu există lead-uri internaționale eligibile.");

  const messageRows = rowsOrEmpty(recentMessages, 7, (row) => `
    <tr>
      <td>${escapeHtml(dateValue(row.received_at || row.created_at) || "-")}</td>
      <td>${escapeHtml(row.country || "-")}</td>
      <td>${row.lead_id ? `<a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.lead_id)}">${escapeHtml(row.lead_name || `Lead #${row.lead_id}`)}</a>` : escapeHtml(row.lead_name || "-")}</td>
      <td>${escapeHtml(row.to_email || "-")}</td>
      <td>${escapeHtml(row.subject || "-")}</td>
      <td>${escapeHtml(row.direction || "-")}</td>
      <td>${escapeHtml(shortText(row.text_body || "", 90) || "-")}</td>
    </tr>
  `, "Nu există emailuri internaționale înregistrate.");

  const body = `
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">INT</div><div><div class="nx-kpi-label">Lead-uri internaționale</div><div class="nx-kpi-value">${escapeHtml(stats.totalLeads || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">@</div><div><div class="nx-kpi-label">Contactabile</div><div class="nx-kpi-value">${escapeHtml(stats.contactable || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">40+</div><div><div class="nx-kpi-label">Scor minim 40</div><div class="nx-kpi-value">${escapeHtml(stats.hotLeads || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">OUT</div><div><div class="nx-kpi-label">Emailuri trimise</div><div class="nx-kpi-value">${escapeHtml(stats.sent || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon red">ERR</div><div><div class="nx-kpi-label">Eșuate / bounce</div><div class="nx-kpi-value">${escapeHtml((Number(stats.failed || 0) + Number(stats.bounced || 0)) || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Outreach internațional</h1>
          <p>Dashboard separat pentru Bulgaria, Grecia, Albania și Turcia: lead-uri, contactabilitate și status emailuri.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/travel/leads?country=Bulgaria&source=osm&contactable=1&min_score=40">Bulgaria</a>
          <a class="nx-btn primary" href="/nexora/travel/leads?country=Greece&source=osm&contactable=1&min_score=40">Grecia</a>
          <a class="nx-btn primary" href="/nexora/travel/leads?country=Albania&source=osm&contactable=1&min_score=40">Albania</a>
          <a class="nx-btn primary" href="/nexora/travel/leads?country=Turkey&source=osm&contactable=1&min_score=40">Turcia</a>
          <a class="nx-btn" href="/nexora/travel/leads/export.csv?contactable=1&min_score=40">Export CSV</a>
        </div>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Țări internaționale</h1><p>Situație pe țări pentru lead-uri și emailuri.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Țară</th><th class="nx-right">Total</th><th class="nx-right">Contactabile</th><th class="nx-right">Scor 40+</th><th class="nx-right">Trimise</th><th class="nx-right">Eșuate</th><th class="nx-right">Bounce</th></tr></thead>
          <tbody>${countryRows}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Lead-uri internaționale prioritare</h1><p>Lead-uri contactabile, ordonate după status, follow-up și scor.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Name</th><th>Country</th><th>City</th><th>Email</th><th>Source</th><th>Status</th><th class="nx-right">Score</th><th>Follow-up</th><th>Acțiune</th></tr></thead>
          <tbody>${leadRows}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Ultimele emailuri internaționale</h1><p>Outbox/bounce/eșecuri legate de lead-uri din afara României.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Data</th><th>Țară</th><th>Lead</th><th>Destinatar</th><th>Subiect</th><th>Status</th><th>Detalii</th></tr></thead>
          <tbody>${messageRows}</tbody>
        </table>
      </div>
    </section>
  `;

  return shell({ title: "Travel International", activePath: "/nexora/travel/international", companyName, user: options.user, body });
}

function renderNexoraTravelLeadsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const filters = options.filters || {};
  const filterOptions = options.filterOptions || {};
  const leadStatuses = Array.isArray(options.leadStatuses) ? options.leadStatuses : [];
  const exportHref = `/nexora/travel/leads/export.csv${leadQuery(filters)}`;
  const activeFilters = [
    filters.country ? `Țară: ${filters.country}` : "",
    filters.county ? `Județ/regiune: ${filters.county}` : "",
    filters.source ? `Sursă: ${filters.source}` : "",
    filters.status ? `Status: ${filters.status}` : "",
    filters.min_score ? `Scor minim: ${filters.min_score}` : "",
    filters.contactable ? "Contactabil" : "",
    filters.q ? `Căutare: ${filters.q}` : ""
  ].filter(Boolean).join(" · ");
  const activePath = filters.source === "osm"
    ? "/nexora/travel/leads?source=osm&contactable=1&min_score=40"
    : filters.source === "trevoro_landing"
      ? "/nexora/travel/leads?source=trevoro_landing"
      : "/nexora/travel/leads";
  const rowsHtml = rowsOrEmpty(rows, 10, (row) => `
    <tr>
      <td><a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a><div class="nx-table-sub">${escapeHtml(row.notes || "")}</div></td>
      <td>${escapeHtml(row.country || "Romania")}</td>
      <td>${escapeHtml(row.city || "-")}</td>
      <td>${escapeHtml(row.county || "-")}</td>
      <td>${escapeHtml(row.property_type || "-")}</td>
      <td>${escapeHtml(row.phone || "-")}</td>
      <td>${escapeHtml(row.email || "-")}</td>
      <td>${escapeHtml(row.source || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${leadScoreDisplay(row.score ?? 0)}</td>
      <td>
        <form method="post" action="/nexora/travel/leads/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
          <input type="hidden" name="return_to" value="list">
          <label class="nx-field"><span>Status</span><select name="status">${statusOptions(leadStatuses, row.status)}</select></label>
          <label class="nx-field"><span>Notes</span><textarea name="notes" rows="2">${escapeHtml(row.notes || "")}</textarea></label>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există lead-uri Travel încă.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Filtre lead-uri</h1><p>Status, țară, județ/regiune și sursă pentru lista de lead-uri Travel.</p></div></div>
      <form method="get" action="/nexora/travel/leads" class="nx-inline-form">
        <label class="nx-field"><span>Status</span><select name="status">${statusOptions(leadStatuses, filters.status, "toate")}</select></label>
        <label class="nx-field"><span>Country</span><select name="country">${simpleOptions(filterOptions.countries || [], filters.country, "toate")}</select></label>
        <label class="nx-field"><span>County</span><select name="county">${simpleOptions(filterOptions.counties || [], filters.county, "toate")}</select></label>
        <label class="nx-field"><span>Source</span><select name="source">${simpleOptions(filterOptions.sources || [], filters.source, "toate")}</select></label>
        <label class="nx-field"><span>Min score</span><input type="number" min="0" max="100" name="min_score" value="${escapeHtml(filters.min_score || "")}"></label>
        <label class="nx-field" style="min-width:320px"><span>Search</span><input type="search" name="q" value="${escapeHtml(filters.q || "")}" placeholder="nume, oraș, telefon, email, website..."></label>
        <div class="nx-field"><span>Contact</span><label class="nx-check-field"><input type="checkbox" name="contactable" value="1" ${checked(filters.contactable)}><span>Telefon/email/site</span></label></div>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Aplică</button>
          <a class="nx-btn" href="/nexora/travel/leads">Reset</a>
          <a class="nx-btn" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </form>
      ${activeFilters ? `<div class="nx-empty-state" style="margin-top:12px">Filtre active: ${escapeHtml(activeFilters)} · rezultate: ${escapeHtml(rows.length)}</div>` : ""}
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Lead-uri Proprietăți</h1><p>Centralizare lead-uri pentru proprietăți hoteliere, vile, apartamente și parteneri Travel.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/leads?source=osm&contactable=1&min_score=40">Coada OSM</a>
          <a class="nx-btn primary" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Name</th><th>Country</th><th>City</th><th>County</th><th>Property type</th><th>Phone</th><th>Email</th><th>Source</th><th>Status</th><th class="nx-right">Score</th><th>Acțiune</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Lead-uri Proprietăți", activePath, companyName, user: options.user, body });
}

function agencyOutreachMessage(row = {}) {
  const isInternational = String(row.country || "").toLowerCase() !== "romania";
  const name = row.name || (isInternational ? "your travel agency" : "agentia dvs.");
  const city = row.city || (isInternational ? "your area" : "zona dvs.");
  const focus = row.offer_focus || (isInternational ? "travel packages and destinations" : "pachete turistice si destinatii");
  if (isInternational) {
    return `Subject: Trevoro partnership for travel agencies\n\nHello,\n\nI am contacting you from Trevoro, a Romanian travel platform where selected travel agencies can promote their packages and destinations.\n\nWe found ${name} in ${city} and would like to invite your agency to join the Trevoro launch program.\n\nThe launch program includes:\n- agency mini-site with logo, description, background image, WhatsApp, contact form, Facebook/Instagram links and custom URL\n- offers/listings for agency packages\n- up to 15 photos for each published offer\n- agency reviews and separate reviews for each listed offer\n- promotion for selected offers on the Trevoro platform\n- social media promotion through Trevoro content campaigns\n- support for onboarding and first publication\n\nYour agency can choose what you want to put in front: ${focus}.\n\nRegistration link:\n${TREVORO_AGENCY_SIGNUP_URL_EN}\n\nHow it works:\n1. Register the agency using the link above.\n2. Create the agency account with email and password.\n3. Open the agency dashboard and complete the logo, description, WhatsApp, Facebook/Instagram links and custom URL.\n4. Upload the background image and agency gallery.\n5. Add offers with destination, description, validity period and up to 15 photos per offer.\n6. Publish the agency page and the offers you want to promote.\n7. Travelers contact the agency directly by WhatsApp, email or the contact form.\n\nFor support, reply to this email or write to ${TREVORO_SUPPORT_EMAIL}.\n\nIf you do not want to receive messages from us, reply with "Stop" and we will not contact you again.\n\nThank you,\nThe Trevoro Team`;
  }
  return `Subiect: Parteneriat Trevoro pentru agentii de turism\n\nBuna ziua,\n\nVa contactez din partea Trevoro, platforma de turism unde agentiile isi pot promova ofertele si destinatiile.\n\nAm gasit ${name} din ${city} si vrem sa invitam agentia in programul de lansare Trevoro pentru agentii de turism.\n\nProgramul de lansare include:\n- mini-site cu logo, descriere, imagine de fundal, WhatsApp, formular de contact, link Facebook/Instagram si URL personalizat\n- listari pentru ofertele agentiei\n- pana la 15 poze pentru fiecare oferta publicata\n- recenzii pentru agentie si recenzii separate pentru fiecare oferta listata\n- promovare pentru ofertele selectate pe platforma Trevoro\n- promovare in social media prin continut Trevoro\n- suport pentru onboarding si prima publicare\n\nAgentia poate alege ce doreste sa puna in prim plan: ${focus}.\n\nInscrierea se face aici:\n${TREVORO_AGENCY_SIGNUP_URL}\n\nProcedura de la inscriere pana la publicare:\n1. Inscrieti agentia folosind linkul de mai sus.\n2. Creati contul agentiei cu email si parola.\n3. Intrati in dashboard si completati logo, descriere, WhatsApp, Facebook/Instagram si URL personalizat.\n4. Incarcati imaginea de fundal si galeria agentiei.\n5. Adaugati ofertele cu destinatie, descriere, perioada de valabilitate si pana la 15 poze pentru fiecare oferta.\n6. Publicati pagina agentiei si ofertele pe care doriti sa le promovati.\n7. Turistii contacteaza agentia direct prin WhatsApp, email sau formularul de contact.\n\nPentru suport, raspundeti la acest email sau scrieti la ${TREVORO_SUPPORT_EMAIL}.\n\nDaca nu doriti sa mai primiti mesaje de la noi, raspundeti cu Stop si nu va mai contactam.\n\nMultumesc,\nEchipa Trevoro`;
}

function renderNexoraTravelAgenciesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const filterOptions = options.filterOptions || {};
  const agencyStatuses = Array.isArray(options.agencyStatuses) ? options.agencyStatuses : [];
  const exportHref = `/nexora/travel/agencies/export.csv${agencyQuery(filters)}`;
  const activeFilters = [
    filters.country ? `Tara: ${filters.country}` : "",
    filters.source ? `Sursa: ${filters.source}` : "",
    filters.status ? `Status: ${filters.status}` : "",
    filters.contactable ? "Contactabil" : "",
    filters.q ? `Cautare: ${filters.q}` : ""
  ].filter(Boolean).join(" · ");
  const rowsHtml = rowsOrEmpty(rows, 11, (row) => {
    const textareaId = `travel-agency-outreach-${escapeHtml(row.id)}`;
    const listingLabel = Number(row.listing_limit || 0) > 0 ? `${Number(row.listing_limit)} listari` : "nelimitat";
    return `
      <tr>
        <td>
          <b>${escapeHtml(row.name || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(row.offer_focus || row.notes || "")}</div>
        </td>
        <td>${escapeHtml(row.country || "Romania")}</td>
        <td>${escapeHtml(row.city || "-")}</td>
        <td>${escapeHtml(row.phone || "-")}</td>
        <td>${escapeHtml(row.email || "-")}</td>
        <td>${row.website ? `<a class="nx-table-main-link" href="${escapeHtml(externalHref(row.website))}" target="_blank" rel="noreferrer">${escapeHtml(shortText(row.website, 34))}</a>` : "-"}</td>
        <td>${escapeHtml(row.source || "-")}</td>
        <td>
          ${statusBadge(row.status)}
          <div class="nx-table-sub">${escapeHtml(row.subscription_status || "lead")} · program lansare</div>
          <div class="nx-table-sub">Listari: ${escapeHtml(listingLabel)}</div>
        </td>
        <td>
          <b>${escapeHtml(row.offer_count || 0)}</b>
          <div class="nx-table-sub">${escapeHtml(row.promoted_offer_count || 0)} promovate</div>
        </td>
        <td>
          <textarea id="${textareaId}" rows="5" readonly>${escapeHtml(agencyOutreachMessage(row))}</textarea>
          <div class="nx-form-actions">
            <button class="nx-btn" type="button" data-travel-copy-target="${textareaId}">Copiaza email</button>
          </div>
        </td>
        <td>
          <form method="post" action="/nexora/travel/agencies/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
            <label class="nx-field"><span>Status</span><select name="status">${statusOptions(agencyStatuses, row.status)}</select></label>
            <label class="nx-field"><span>Follow-up</span><input type="datetime-local" name="next_follow_up_at" value="${escapeHtml(inputDateTimeValue(row.next_follow_up_at))}"></label>
            <label class="nx-field"><span>Notes</span><textarea name="notes" rows="2">${escapeHtml(row.notes || "")}</textarea></label>
            <button class="nx-btn primary" type="submit">Salveaza</button>
          </form>
        </td>
      </tr>
    `;
  }, "Nu exista agentii in Nexora Travel inca.");

  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">AG</div><div><div class="nx-kpi-label">Agentii</div><div class="nx-kpi-value">${escapeHtml(stats.totalAgencies || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">NOI</div><div><div class="nx-kpi-label">Noi</div><div class="nx-kpi-value">${escapeHtml(stats.newAgencies || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">ACT</div><div><div class="nx-kpi-label">Active</div><div class="nx-kpi-value">${escapeHtml(stats.activeAgencies || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">@</div><div><div class="nx-kpi-label">Cu email</div><div class="nx-kpi-value">${escapeHtml(stats.withEmail || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">RO</div><div><div class="nx-kpi-label">Program RO</div><div class="nx-kpi-value">${escapeHtml(stats.activeAgencies || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">OF</div><div><div class="nx-kpi-label">Oferte</div><div class="nx-kpi-value">${escapeHtml(stats.totalOffers || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Agentii de turism</h1>
          <p>Lead-uri si parteneri agentii pentru programul de lansare Trevoro, listari, promovare pe Trevoro si social media.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="${escapeHtml(TREVORO_AGENCY_SIGNUP_URL)}" target="_blank" rel="noreferrer">Pagina publica</a>
          <a class="nx-btn primary" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </div>
      <form method="get" action="/nexora/travel/agencies" class="nx-inline-form">
        <label class="nx-field"><span>Status</span><select name="status">${statusOptions(agencyStatuses, filters.status, "toate")}</select></label>
        <label class="nx-field"><span>Country</span><select name="country">${simpleOptions(filterOptions.countries || [], filters.country, "toate")}</select></label>
        <label class="nx-field"><span>Source</span><select name="source">${simpleOptions(filterOptions.sources || [], filters.source, "toate")}</select></label>
        <label class="nx-field" style="min-width:320px"><span>Search</span><input type="search" name="q" value="${escapeHtml(filters.q || "")}" placeholder="nume, oras, email, website, oferta..."></label>
        <div class="nx-field"><span>Contact</span><label class="nx-check-field"><input type="checkbox" name="contactable" value="1" ${checked(filters.contactable)}><span>Telefon/email/site</span></label></div>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Aplica</button>
          <a class="nx-btn" href="/nexora/travel/agencies">Reset</a>
          <a class="nx-btn" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </form>
      ${activeFilters ? `<div class="nx-empty-state" style="margin-top:12px">Filtre active: ${escapeHtml(activeFilters)} · rezultate: ${escapeHtml(rows.length)}</div>` : ""}
    </section>

    <section class="nx-content-card">
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Agentie</th><th>Country</th><th>City</th><th>Phone</th><th>Email</th><th>Website</th><th>Source</th><th>Status</th><th>Oferte</th><th>Email oferta</th><th>Actiune</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Agentii Travel", activePath: "/nexora/travel/agencies", companyName, user: options.user, body });
}

function localPartnerTypeLabel(value = "") {
  const labels = {
    tourist_info_center: "Centru informare",
    omd: "OMD",
    tourism_association: "Asociație turism",
    city_hall: "Primărie/CJ",
    facebook_group: "Grup Facebook",
    restaurant: "Restaurant",
    cafe: "Cafenea",
    guide: "Ghid local",
    activities: "Activități",
    transport: "Transport local",
    wellness: "Wellness",
    rental: "Închirieri",
    other: "Alt partener"
  };
  return labels[String(value || "").trim()] || String(value || "-").replaceAll("_", " ");
}

function localPartnerOutreachMessage(row = {}) {
  const name = row.name || "instituția dvs.";
  const area = row.city || row.region || "zona dvs.";
  const administrator = row.administrator ? ` (${row.administrator})` : "";
  return `Subiect: Parteneriat local pentru promovarea proprietăților turistice din ${area}\n\nBună ziua,\n\nVă contactez din partea Trevoro, platformă românească pentru promovarea proprietăților turistice.\n\nAm găsit ${name}${administrator} și credem că putem ajuta proprietarii locali din ${area} să fie mai vizibili online.\n\nPropunerea noastră este simplă:\n- creăm și promovăm pagini Trevoro pentru destinații locale;\n- proprietarii se pot lista direct, cu suport pentru poze, descriere și calendar;\n- înscrierea proprietarilor este gratuită în programul de lansare;\n- promovăm proprietățile selectate pe platforma Trevoro și în conținut social media.\n\nCe ne-ar ajuta de la dvs.:\n1. să trimiteți informația către proprietarii locali;\n2. să ne indicați o persoană de contact pentru colaborare;\n3. eventual să publicăm împreună o postare pentru zona ${area}.\n\nLink înscriere proprietăți:\nhttps://www.trevoro.ro/proprietari\n\nSuport Trevoro: ${TREVORO_SUPPORT_EMAIL}\nWhatsApp: 0774362975\n\nDacă nu sunteți persoana potrivită, vă rog să ne redirecționați către responsabilul de turism/promovare locală.\n\nMulțumesc,\nEchipa Trevoro`;
}

function renderNexoraTravelLocalPartnersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const filterOptions = options.filterOptions || {};
  const statuses = Array.isArray(options.statuses) ? options.statuses : [];
  const partnerTypes = Array.isArray(options.partnerTypes) ? options.partnerTypes : [];
  const enrichmentStats = options.socialEnrichmentStats || {};
  const exportHref = `/nexora/travel/local-partners/export.csv${localPartnerQuery(filters)}`;
  const activeFilters = [
    filters.status ? `Status: ${filters.status}` : "",
    filters.partner_type ? `Tip: ${localPartnerTypeLabel(filters.partner_type)}` : "",
    filters.region ? `Județ/zonă: ${filters.region}` : "",
    filters.source ? `Sursa: ${filters.source}` : "",
    filters.contactable ? "Contactabil" : "",
    filters.q ? `Căutare: ${filters.q}` : ""
  ].filter(Boolean).join(" · ");

  const rowsHtml = rowsOrEmpty(rows, 11, (row) => {
    const textareaId = `travel-local-partner-outreach-${escapeHtml(row.id)}`;
    const socialStatus = row.social_enrichment_status
      ? `<div class="nx-table-sub">Social: ${escapeHtml(String(row.social_enrichment_status).replaceAll("_", " "))}${row.social_enriched_at ? ` · ${escapeHtml(dateValue(row.social_enriched_at))}` : ""}</div>`
      : "";
    return `
      <tr>
        <td>
          <b>${escapeHtml(row.name || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(localPartnerTypeLabel(row.partner_type))}</div>
          ${row.administrator ? `<div class="nx-table-sub">${escapeHtml(row.administrator)}</div>` : ""}
        </td>
        <td>${escapeHtml(row.region || "-")}</td>
        <td>${escapeHtml(row.city || "-")}</td>
        <td>${escapeHtml(row.phone || "-")}</td>
        <td>${row.email ? `<a class="nx-table-main-link" href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>` : "-"}</td>
        <td>${row.website ? `<a class="nx-table-main-link" href="${escapeHtml(externalHref(row.website))}" target="_blank" rel="noreferrer">${escapeHtml(shortText(row.website, 34))}</a>` : "-"}</td>
        <td>
          ${escapeHtml(row.source || "-")}
          ${socialStatus}
        </td>
        <td>
          ${statusBadge(row.status)}
          <div class="nx-table-sub">Reach estimat: ${escapeHtml(row.potential_reach || 0)}</div>
          ${row.next_follow_up_at ? `<div class="nx-table-sub">Follow-up: ${escapeHtml(dateValue(row.next_follow_up_at))}</div>` : ""}
        </td>
        <td>${escapeHtml(shortText(row.notes || "", 120) || "-")}</td>
        <td>
          <textarea id="${textareaId}" rows="5" readonly>${escapeHtml(localPartnerOutreachMessage(row))}</textarea>
          <div class="nx-form-actions">
            <button class="nx-btn" type="button" data-travel-copy-target="${textareaId}">Copiază email</button>
          </div>
        </td>
        <td>
          <form method="post" action="/nexora/travel/local-partners/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
            <label class="nx-field"><span>Status</span><select name="status">${statusOptions(statuses, row.status)}</select></label>
            <label class="nx-field"><span>Follow-up</span><input type="datetime-local" name="next_follow_up_at" value="${escapeHtml(inputDateTimeValue(row.next_follow_up_at))}"></label>
            <label class="nx-field"><span>Reach</span><input type="number" min="0" name="potential_reach" value="${escapeHtml(row.potential_reach || 0)}"></label>
            <label class="nx-field"><span>Notes</span><textarea name="notes" rows="2">${escapeHtml(row.notes || "")}</textarea></label>
            <button class="nx-btn primary" type="submit">Salvează</button>
          </form>
        </td>
      </tr>
    `;
  }, "Nu există parteneri locali importați încă.");

  const typeOptions = [
    `<option value="">toate</option>`,
    ...partnerTypes.map((type) => `<option value="${escapeHtml(type)}" ${selected(filters.partner_type, type)}>${escapeHtml(localPartnerTypeLabel(type))}</option>`)
  ].join("");

  const body = `
    ${alertHtml(options.ok, options.err)}
    ${options.ok === "local_partner_enriched" ? `<div class="nx-alert success">Social enrichment: ${escapeHtml(enrichmentStats.checked || 0)} verificați, ${escapeHtml(enrichmentStats.updated || 0)} actualizați, ${escapeHtml(enrichmentStats.notFound || 0)} fără date găsite, ${escapeHtml(enrichmentStats.errors || 0)} erori.</div>` : ""}
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">PL</div><div><div class="nx-kpi-label">Parteneri locali</div><div class="nx-kpi-value">${escapeHtml(stats.totalPartners || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">NOI</div><div><div class="nx-kpi-label">Noi</div><div class="nx-kpi-value">${escapeHtml(stats.newPartners || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">@</div><div><div class="nx-kpi-label">Cu email</div><div class="nx-kpi-value">${escapeHtml(stats.withEmail || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">EN</div><div><div class="nx-kpi-label">Actualizați social</div><div class="nx-kpi-value">${escapeHtml(stats.socialUpdated || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">OMD</div><div><div class="nx-kpi-label">OMD-uri</div><div class="nx-kpi-value">${escapeHtml(stats.omdPartners || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">CN</div><div><div class="nx-kpi-label">Centre info</div><div class="nx-kpi-value">${escapeHtml(stats.touristInfoCenters || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">R</div><div><div class="nx-kpi-label">Reach estimat</div><div class="nx-kpi-value">${escapeHtml(stats.totalReach || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Parteneri locali</h1>
          <p>Centre turistice, OMD-uri, asociații, primării și administratori de comunități care pot distribui oferta Trevoro către proprietari locali.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="https://se.situr.gov.ro/OpenData/OpenDataMain" target="_blank" rel="noreferrer">SITUR</a>
          <a class="nx-btn primary" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </div>
      <form method="post" action="/nexora/travel/local-partners/enrich-social" class="nx-inline-form" style="margin-bottom:12px">
        <label class="nx-field"><span>Batch social</span><input type="number" min="1" max="100" name="limit" value="25"></label>
        <button class="nx-btn primary" type="submit">Extrage email/telefon din profil Facebook</button>
      </form>
      <form method="get" action="/nexora/travel/local-partners" class="nx-inline-form">
        <label class="nx-field"><span>Status</span><select name="status">${statusOptions(statuses, filters.status, "toate")}</select></label>
        <label class="nx-field"><span>Tip</span><select name="partner_type">${typeOptions}</select></label>
        <label class="nx-field"><span>Județ/zonă</span><select name="region">${simpleOptions(filterOptions.regions || [], filters.region, "toate")}</select></label>
        <label class="nx-field"><span>Source</span><select name="source">${simpleOptions(filterOptions.sources || [], filters.source, "toate")}</select></label>
        <label class="nx-field" style="min-width:320px"><span>Search</span><input type="search" name="q" value="${escapeHtml(filters.q || "")}" placeholder="nume, oraș, administrator, email, website..."></label>
        <div class="nx-field"><span>Contact</span><label class="nx-check-field"><input type="checkbox" name="contactable" value="1" ${checked(filters.contactable)}><span>Telefon/email/site</span></label></div>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Aplică</button>
          <a class="nx-btn" href="/nexora/travel/local-partners">Reset</a>
          <a class="nx-btn" href="${escapeHtml(exportHref)}">Export CSV</a>
        </div>
      </form>
      ${activeFilters ? `<div class="nx-empty-state" style="margin-top:12px">Filtre active: ${escapeHtml(activeFilters)} · rezultate: ${escapeHtml(rows.length)}</div>` : ""}
    </section>

    <section class="nx-content-card">
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Partener</th><th>Județ/zonă</th><th>Oraș</th><th>Telefon</th><th>Email</th><th>Website</th><th>Source</th><th>Status</th><th>Notes</th><th>Email parteneriat</th><th>Acțiune</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Parteneri locali", activePath: "/nexora/travel/local-partners", companyName, user: options.user, body });
}

const CHANNEL_MANAGER_PARTNERS = [
  {
    name: "PynBooking",
    kind: "PMS / booking engine",
    status: "contactat",
    method: "Email developer/partner",
    contactedAt: "2026-06-16",
    followUpAt: "2026-06-23",
    nextStep: "Așteptăm acces developer/sandbox și confirmare pentru disponibilitate, tarife, rezervări."
  },
  {
    name: "5StarDesk",
    kind: "Channel manager / PMS",
    status: "contactat",
    method: "Email API/partener",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm documentație API și condiții de acces."
  },
  {
    name: "Smoobu",
    kind: "PMS / channel manager",
    status: "contactat",
    method: "Email parteneriat",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm onboarding, API și eventual marketplace requirements."
  },
  {
    name: "Hostaway",
    kind: "PMS / channel manager",
    status: "aplicat",
    method: "Partner form",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm răspuns pentru Partner Channel/Public API."
  },
  {
    name: "Lodgify",
    kind: "PMS / channel manager",
    status: "aplicat",
    method: "Partner form",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm validare formular și acces la integrare."
  },
  {
    name: "Beds24",
    kind: "Marketplace / API partner",
    status: "aplicat",
    method: "Partner form",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm detalii despre marketplace/API și test account."
  },
  {
    name: "Guesty",
    kind: "Distribution partner",
    status: "aplicat",
    method: "Partner form",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm răspuns pentru Distribution partner OTA-style."
  },
  {
    name: "Rentals United",
    kind: "Vacation rental channel",
    status: "demo_programat",
    method: "Partner form / meeting",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-19",
    nextStep: "Discuție programată pe 2026-06-19 11:15 pentru API/distribution channel."
  },
  {
    name: "Avantio",
    kind: "Vacation rental PMS",
    status: "aplicat",
    method: "API integrations form",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm detalii despre API, sandbox și condiții comerciale."
  },
  {
    name: "OwnerRez",
    kind: "Channel API",
    status: "contactat",
    method: "Email partnerhelp",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm sandbox credentials și pașii de certificare Channel API."
  },
  {
    name: "Hostfully",
    kind: "Integration Zone / API",
    status: "contactat",
    method: "Email partnerships/API",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm onboarding, OAuth/production approval și documentație."
  },
  {
    name: "Uplisting",
    kind: "PMS / channel manager",
    status: "contactat",
    method: "Email support",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm confirmare dacă acceptă Trevoro ca distribution channel."
  },
  {
    name: "Hospitable",
    kind: "Platform API",
    status: "contactat",
    method: "Email platform team",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm invitație Partner Portal / Public API și cerințe OAuth."
  },
  {
    name: "Cloudbeds",
    kind: "Hospitality PMS",
    status: "contactat",
    method: "Email partners",
    contactedAt: "2026-06-17",
    followUpAt: "2026-06-24",
    nextStep: "Așteptăm marketplace/API onboarding pentru hoteluri și pensiuni."
  }
];

function channelPartnerStatusTone(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (["demo_programat", "aprobat", "activ"].includes(normalized)) return "success";
  if (["aplicat", "contactat", "in_asteptare"].includes(normalized)) return "warn";
  if (["respins", "blocat"].includes(normalized)) return "danger";
  return "neutral";
}

function channelPartnerStatusBadge(status = "") {
  const label = String(status || "-").replaceAll("_", " ");
  return `<span class="nx-status-pill ${channelPartnerStatusTone(status)}">${escapeHtml(label)}</span>`;
}

function renderNexoraTravelIntegrationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const partners = Array.isArray(options.partners) && options.partners.length
    ? options.partners
    : CHANNEL_MANAGER_PARTNERS;
  const statuses = Array.isArray(options.statuses) ? options.statuses : [
    "contactat",
    "aplicat",
    "demo_programat",
    "in_asteptare",
    "aprobat",
    "activ",
    "respins"
  ];
  const stats = partners.reduce((acc, row) => {
    const status = String(row.status || "unknown");
    acc.total += 1;
    acc[status] = Number(acc[status] || 0) + 1;
    return acc;
  }, { total: 0 });
  const rows = rowsOrEmpty(partners, 8, (row) => {
    const providerKey = row.provider_key || row.key || String(row.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const contactedAt = row.contacted_at || row.contactedAt || "";
    const followUpAt = row.follow_up_at || row.followUpAt || "";
    const nextStep = row.next_step || row.nextStep || "";
    return `
      <tr>
        <td>
          <strong>${escapeHtml(row.name)}</strong>
          <div class="nx-table-sub">${escapeHtml(row.kind)}</div>
        </td>
        <td>${channelPartnerStatusBadge(row.status)}</td>
        <td>${escapeHtml(row.method)}</td>
        <td>${escapeHtml(contactedAt || "-")}</td>
        <td>${escapeHtml(followUpAt || "-")}</td>
        <td>${escapeHtml(nextStep || "-")}</td>
        <td>${escapeHtml(row.notes || "-")}</td>
        <td>
          <form method="post" action="/nexora/travel/integrations/${escapeHtml(providerKey)}/status" class="nx-inline-form compact">
            <label class="nx-field"><span>Status</span><select name="status">${statusOptions(statuses, row.status)}</select></label>
            <label class="nx-field"><span>Follow-up</span><input type="date" name="follow_up_at" value="${escapeHtml(String(followUpAt || "").slice(0, 10))}"></label>
            <label class="nx-field"><span>Următorul pas</span><textarea name="next_step" rows="2">${escapeHtml(nextStep)}</textarea></label>
            <label class="nx-field"><span>Notes</span><textarea name="notes" rows="2">${escapeHtml(row.notes || "")}</textarea></label>
            <button class="nx-btn primary" type="submit">Salvează</button>
          </form>
        </td>
      </tr>
    `;
  }, "Nu există integrări urmărite.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-hero">
      <div>
        <p class="nx-kicker">Channel Manager CRM</p>
        <h1>Integrări PMS și channel manager</h1>
        <p>Status intern pentru platformele contactate. Actualizăm manual când primim răspuns, acces sandbox sau condiții comerciale.</p>
      </div>
      <div class="nx-hero-actions">
        <a class="nx-btn primary" href="/nexora/travel/properties">Vezi proprietăți</a>
        <a class="nx-btn" href="/nexora/travel/outreach">Outreach</a>
      </div>
    </section>

    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">API</div><div><div class="nx-kpi-label">Total</div><div class="nx-kpi-value">${escapeHtml(stats.total || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">AP</div><div><div class="nx-kpi-label">Aplicat</div><div class="nx-kpi-value">${escapeHtml(stats.aplicat || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">EM</div><div><div class="nx-kpi-label">Contactat</div><div class="nx-kpi-value">${escapeHtml(stats.contactat || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">DE</div><div><div class="nx-kpi-label">Demo</div><div class="nx-kpi-value">${escapeHtml(stats.demo_programat || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Pipeline integrări</h1>
          <p>Follow-up standard la 7 zile, cu excepția discuțiilor deja programate.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Status</th>
              <th>Metodă</th>
              <th>Contactat</th>
              <th>Follow-up</th>
              <th>Următorul pas</th>
              <th>Notes</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Integrări Travel", activePath: "/nexora/travel/integrations", companyName, user: options.user, body });
}

function reviewStatusOptions(current = "") {
  const statuses = [
    ["pending", "In asteptare"],
    ["approved", "Aprobat"],
    ["rejected", "Respins"]
  ];
  return statuses.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function reviewTypeLabel(type = "") {
  if (type === "offer") return "Oferta agentie";
  if (type === "property") return "Proprietate";
  return "Agentie";
}

function renderNexoraTravelReviewsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const filters = options.filters || {};
  const rowsHtml = rowsOrEmpty(rows, 7, (row) => {
    const targetHref = row.public_path ? `https://www.trevoro.ro${row.public_path}` : "";
    return `
      <tr>
        <td>
          <b>${escapeHtml(reviewTypeLabel(row.review_type))}</b>
          <div class="nx-table-sub">#${escapeHtml(row.id)}</div>
        </td>
        <td>
          <b>${escapeHtml(row.target_name || "-")}</b>
          ${row.parent_name ? `<div class="nx-table-sub">${escapeHtml(row.parent_name)}</div>` : ""}
          ${targetHref ? `<div class="nx-table-sub"><a href="${escapeHtml(targetHref)}" target="_blank" rel="noreferrer">Vezi public</a></div>` : ""}
        </td>
        <td>
          <b>${escapeHtml(row.reviewer_name || "Client Trevoro")}</b>
          <div class="nx-table-sub">${escapeHtml(shortText(row.comment || "", 220))}</div>
        </td>
        <td><b>${escapeHtml(row.rating || 0)} / 5</b></td>
        <td>${statusBadge(row.status || "pending")}</td>
        <td>${escapeHtml(dateValue(row.created_at || ""))}</td>
        <td>
          <form method="post" action="/nexora/travel/reviews/${escapeHtml(row.review_type)}/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
            <label class="nx-field"><span>Status</span><select name="status">${reviewStatusOptions(row.status || "pending")}</select></label>
            <button class="nx-btn primary" type="submit">Salveaza</button>
          </form>
        </td>
      </tr>
    `;
  }, "Nu exista recenzii pentru filtrul ales.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Recenzii Trevoro</h1>
          <p>Moderare pentru recenzii de agentie, recenzii pe fiecare oferta si recenzii pentru proprietati.</p>
        </div>
      </div>
      <form method="get" action="/nexora/travel/reviews" class="nx-inline-form">
        <label class="nx-field"><span>Status</span><select name="status">
          <option value="">Toate</option>
          <option value="pending" ${filters.status === "pending" ? "selected" : ""}>In asteptare</option>
          <option value="approved" ${filters.status === "approved" ? "selected" : ""}>Aprobate</option>
          <option value="rejected" ${filters.status === "rejected" ? "selected" : ""}>Respinse</option>
        </select></label>
        <label class="nx-field"><span>Tip</span><select name="type">
          <option value="">Toate</option>
          <option value="agency" ${filters.type === "agency" ? "selected" : ""}>Agentie</option>
          <option value="offer" ${filters.type === "offer" ? "selected" : ""}>Oferta agentie</option>
          <option value="property" ${filters.type === "property" ? "selected" : ""}>Proprietate</option>
        </select></label>
        <button class="nx-btn primary" type="submit">Filtreaza</button>
        <a class="nx-btn" href="/nexora/travel/reviews">Reset</a>
      </form>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Tip</th><th>Tinta</th><th>Recenzie</th><th>Rating</th><th>Status</th><th>Data</th><th>Actiune</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Recenzii Trevoro", activePath: "/nexora/travel/reviews", companyName, user: options.user, body });
}

function renderNexoraTravelOutreachPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const emailReplies = Array.isArray(options.emailReplies) ? options.emailReplies : [];
  const emailErrors = Array.isArray(options.emailErrors) ? options.emailErrors : [];
  const stats = options.stats || {};
  const today = options.today || "";
  const syncStats = options.emailSyncStats || {};
  const repairStats = options.emailRepairStats || {};
  const syncSummary = options.ok === "email_synced"
    ? `<div class="nx-alert success">Sincronizare: ${escapeHtml(syncStats.imported || 0)} mesaje noi, ${escapeHtml(syncStats.matched || 0)} potrivite cu lead-uri, ${escapeHtml(syncStats.statusChanged || 0)} statusuri schimbate, ${escapeHtml(syncStats.bounced || 0)} bounce-uri, ${escapeHtml(syncStats.stopRequested || 0)} stop-uri.</div>`
    : "";
  const repairSummary = options.ok === "email_repaired"
    ? `<div class="nx-alert success">Repair email: ${escapeHtml(repairStats.repaired || 0)} reparate, ${escapeHtml(repairStats.websiteCandidates || 0)} candidate găsite pe website, ${escapeHtml(repairStats.whatsappCandidates || 0)} fallback WhatsApp, ${escapeHtml(repairStats.manualReview || 0)} review manual.</div>`
    : "";
  const directionLabel = (value = "") => ({
    outbound: "Trimis",
    inbound: "Primit",
    bounce: "Eroare livrare",
    outbound_failed: "Eroare trimitere"
  })[String(value || "").trim()] || "Mesaj";
  const replyRows = emailReplies.length ? emailReplies.map((row) => `
    <tr>
      <td>${escapeHtml(directionLabel(row.direction))}</td>
      <td>${row.lead_id ? `<a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.lead_id)}">${escapeHtml(row.lead_name || `Lead #${row.lead_id}`)}</a>` : `<span class="nx-table-sub">Nepotrivit</span>`}</td>
      <td>${escapeHtml(row.from_email || "-")}</td>
      <td>${escapeHtml(row.subject || "-")}<div class="nx-table-sub">${escapeHtml(shortText(row.text_body || "", 150))}</div></td>
      <td>${escapeHtml(dateValue(row.received_at) || "-")}</td>
    </tr>
  `).join("") : `
    <tr><td colspan="5"><div class="nx-empty-state">Nu există mesaje email sincronizate.</div></td></tr>
  `;
  const errorRows = emailErrors.length ? emailErrors.map((row) => `
    <tr>
      <td>${escapeHtml(dateValue(row.received_at || row.created_at) || "-")}</td>
      <td>${escapeHtml(directionLabel(row.direction))}</td>
      <td>${row.lead_id ? `<a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.lead_id)}">${escapeHtml(row.lead_name || `Lead #${row.lead_id}`)}</a>` : `<span class="nx-table-sub">Nepotrivit</span>`}<div class="nx-table-sub">${escapeHtml([row.country, row.city].filter(Boolean).join(" · ") || "-")}</div></td>
      <td>${escapeHtml(row.to_email || row.lead_email || "-")}<div class="nx-table-sub">${escapeHtml(row.phone || "")}</div></td>
      <td>${row.website ? `<a class="nx-table-main-link" href="${escapeHtml(externalHref(row.website))}" target="_blank" rel="noreferrer">${escapeHtml(shortText(row.website, 46))}</a>` : "-"}</td>
      <td>${escapeHtml(shortText(row.text_body || row.subject || "", 150) || "-")}</td>
    </tr>
  `).join("") : `
    <tr><td colspan="6"><div class="nx-empty-state">Nu există erori email înregistrate.</div></td></tr>
  `;
  const outreachJob = options.outreachJob || {};
  const jobOptions = outreachJob.options || {};
  const jobStatus = String(outreachJob.status || "idle");
  const jobStatusLabels = {
    idle: "oprit",
    running: "rulează",
    pause_requested: "pauză cerută",
    paused: "pauză activă",
    stopped: "oprit",
    finished: "finalizat"
  };
  const jobStatusTone = {
    running: "success",
    pause_requested: "warn",
    paused: "warn",
    stopped: "danger",
    finished: "neutral",
    idle: "neutral"
  }[jobStatus] || "neutral";
  const jobStatusPill = `<span class="nx-status-pill ${jobStatusTone}">${escapeHtml(jobStatusLabels[jobStatus] || jobStatus)}</span>`;
  const latestReport = outreachJob.latest_report || {};
  const latestSummary = latestReport.summary || {};
  const reportStepRows = Array.isArray(latestSummary.steps) && latestSummary.steps.length
    ? latestSummary.steps.map((step) => `
      <tr>
        <td>${escapeHtml(step.name || "-")}</td>
        <td>${step.ok === null ? "-" : step.ok ? "ok" : "eroare"}</td>
        <td>${escapeHtml(step.planned_send_limit || 0)}</td>
        <td>${escapeHtml(step.skipped ? (step.reason || "sărit") : step.reason || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4"><div class="nx-empty-state">Nu există încă raport de trimitere.</div></td></tr>`;
  const latestReportHtml = latestReport.file_path ? `
    <div class="nx-table-sub">Ultimul raport: ${escapeHtml(dateValue(latestReport.updated_at) || "-")} · ${escapeHtml(latestReport.file_name || "")}</div>
    <div class="nx-table-wrap">
      <table class="nx-table">
        <thead><tr><th>Etapă</th><th>Status</th><th>Planificat</th><th>Observație</th></tr></thead>
        <tbody>${reportStepRows}</tbody>
      </table>
    </div>
  ` : `<div class="nx-empty-state">Nu există încă raport de outreach.</div>`;
  const logTailHtml = outreachJob.log_tail ? `
    <details class="nx-field" style="margin-top:12px">
      <summary>Ultimele linii din log</summary>
      <textarea rows="8" readonly>${escapeHtml(outreachJob.log_tail)}</textarea>
    </details>
  ` : "";
  const messageTemplates = Array.isArray(options.outreachMessageTemplates) ? options.outreachMessageTemplates : [];
  const messageTemplateCards = messageTemplates.map((template) => {
    const textareaId = `outreach-template-${escapeHtml(template.key || template.label || "message")}`;
    return `
      <div class="nx-field">
        <span>${escapeHtml(template.label || "Mesaj")}</span>
        <input value="${escapeHtml(template.subject || "")}" readonly>
        <textarea id="${textareaId}" rows="18" readonly>${escapeHtml(template.text || "")}</textarea>
        <button class="nx-btn" type="button" data-travel-copy-target="${textareaId}">Copiază mesaj</button>
      </div>
    `;
  }).join("");
  const cards = rows.map((row) => {
    const templates = trevoroOutreachTemplates(row).map((template) => {
      const textareaId = `travel-outreach-queue-${escapeHtml(template.key)}-${escapeHtml(row.id)}`;
      const isWhatsapp = template.key === "whatsapp";
      const whatsappHref = isWhatsapp ? whatsappMessageHref(row, template.message) : "";
      const whatsappPhone = isWhatsapp ? normalizeWhatsappPhone(whatsappLeadPhone(row), row.country || "Romania") : "";
      const whatsappDeclined = isWhatsapp && whatsappOptInStatus(row) === "declined";
      const canUse = template.key === "email"
        ? Boolean(row.email)
        : isWhatsapp
          ? Boolean(whatsappHref) && !whatsappDeclined
          : Boolean(row.phone);
      const unavailableLabel = whatsappDeclined ? " · nu contacta" : canUse ? "" : " · lipsă contact";
      return `
        <div class="nx-field">
          <span>${escapeHtml(template.label)}${escapeHtml(unavailableLabel)} ${isWhatsapp ? whatsappOptInBadge(row) : ""}</span>
          <textarea id="${textareaId}" rows="7" readonly>${escapeHtml(template.message)}</textarea>
          <div class="nx-form-actions">
            <button class="nx-btn" type="button" data-travel-copy-target="${textareaId}">Copiază mesaj</button>
            ${isWhatsapp && whatsappHref && !whatsappDeclined ? `<a class="nx-btn primary" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noreferrer">Deschide WhatsApp</a>` : ""}
            <a class="nx-btn" href="${escapeHtml(TREVORO_SUPPORT_MAILTO)}">Am nevoie de suport</a>
            <form method="post" action="/nexora/travel/leads/${escapeHtml(row.id)}/mark-contacted">
              <input type="hidden" name="channel" value="${escapeHtml(template.key)}">
              <input type="hidden" name="return_to" value="outreach">
              <button class="nx-btn ${isWhatsapp ? "" : "primary"}" type="submit" ${canUse ? "" : "disabled"}>Marchează contactat</button>
            </form>
          </div>
          ${isWhatsapp ? `<div class="nx-table-sub">WhatsApp manual${whatsappPhone ? `: +${escapeHtml(whatsappPhone)}` : ""}. Pentru API se folosesc doar contacte cu opt-in confirmat.</div>` : ""}
        </div>
      `;
    }).join("");
    return `
      <article class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1><a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a></h1>
            <p>${escapeHtml(row.property_type || "-")} · ${escapeHtml(row.city || "-")} · ${escapeHtml(row.county || "-")}</p>
          </div>
          <div class="nx-right">
            ${leadScoreBadge(row.score)}
            <div class="nx-table-sub">Follow-up: ${escapeHtml(dateValue(row.next_follow_up_at) || "-")}</div>
          </div>
        </div>
        <div class="nx-kpi-grid">
          <div class="nx-kpi-card"><div class="nx-kpi-icon blue">T</div><div><div class="nx-kpi-label">Telefon</div><div class="nx-kpi-value" style="font-size:18px">${escapeHtml(row.whatsapp_phone || row.phone || "-")}</div></div></div>
          <div class="nx-kpi-card"><div class="nx-kpi-icon green">E</div><div><div class="nx-kpi-label">Email</div><div class="nx-kpi-value" style="font-size:18px">${escapeHtml(row.email || "-")}</div></div></div>
          <div class="nx-kpi-card"><div class="nx-kpi-icon orange">S</div><div><div class="nx-kpi-label">Score</div><div class="nx-kpi-value">${escapeHtml(row.score || 0)}</div></div></div>
        </div>
        <div class="nx-two-column-grid">
          ${templates}
        </div>
      </article>
    `;
  }).join("");
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${syncSummary}
    ${repairSummary}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Outreach Trevoro</h1>
          <p>Campanii de contactare proprietari pentru programul de lansare, cu control manual al jobului.</p>
        </div>
        <div class="nx-form-actions">
          <form method="post" action="/nexora/travel/outreach/sync-email">
            <button class="nx-btn" type="submit">Sincronizează email</button>
          </form>
          <form method="post" action="/nexora/travel/outreach/repair-email-errors">
            <button class="nx-btn" type="submit">Caută emailuri bune</button>
          </form>
          <a class="nx-btn" href="/nexora/travel/leads?source=osm&contactable=1&min_score=40">Lead-uri OSM</a>
          <a class="nx-btn primary" href="/nexora/travel/leads/export.csv?source=osm&contactable=1&min_score=40">Export CSV</a>
        </div>
      </div>
      <section class="nx-two-column-grid">
        <div>
          <div class="nx-section-head">
            <div>
              <h1>Control campanie email</h1>
              <p>Status: ${jobStatusPill} ${outreachJob.paused ? `<span class="nx-status-pill warn">pauză globală activă</span>` : ""}</p>
            </div>
            <div class="nx-right">
              <div class="nx-table-sub">PID: ${escapeHtml(outreachJob.pid || "-")}</div>
              <div class="nx-table-sub">Pornit: ${escapeHtml(dateValue(outreachJob.started_at) || "-")}</div>
            </div>
          </div>
          <form method="post" action="/nexora/travel/outreach/job/start" class="nx-filter-bar">
            <label class="nx-field"><span>România</span><input type="number" name="romania_limit" min="0" max="400" value="${escapeHtml(jobOptions.romania_limit ?? 0)}"></label>
            <label class="nx-field"><span>International</span><input type="number" name="international_limit" min="0" max="400" value="${escapeHtml(jobOptions.international_limit ?? 0)}"></label>
            <input type="hidden" name="local_limit" value="0">
            <label class="nx-field"><span>Limită zi</span><input type="number" name="daily_quota" min="1" max="800" value="${escapeHtml(jobOptions.daily_quota ?? 20)}"></label>
            <label class="nx-field"><span>Pauză între emailuri</span><input type="number" name="delay_seconds" min="5" max="300" value="${escapeHtml(jobOptions.delay_seconds ?? 45)}"></label>
            <label class="nx-field"><span>Scor minim</span><input type="number" name="min_score" min="0" max="100" value="${escapeHtml(jobOptions.min_score ?? 0)}"></label>
            <label class="nx-field"><span>Sursă</span><select name="source">
              <option value="all" ${selected(jobOptions.source || "all", "all")}>Toate</option>
              <option value="osm" ${selected(jobOptions.source, "osm")}>OSM</option>
              <option value="website" ${selected(jobOptions.source, "website")}>Website</option>
              <option value="manual" ${selected(jobOptions.source, "manual")}>Manual</option>
            </select></label>
            <label class="nx-field"><span>Mod</span><select name="dry_run">
              <option value="0" ${selected(jobOptions.dry_run ? "1" : "0", "0")}>Trimitere reală</option>
              <option value="1" ${selected(jobOptions.dry_run ? "1" : "0", "1")}>Simulare</option>
            </select></label>
            <label class="nx-check-field"><input type="checkbox" name="confirm_start" value="1"><span>Confirm pornirea trimiterii reale</span></label>
            <button class="nx-btn primary" type="submit" ${outreachJob.running ? "disabled" : ""}>Start</button>
          </form>
          <div class="nx-form-actions" style="margin-top:12px">
            <form method="post" action="/nexora/travel/outreach/job/pause">
              <button class="nx-btn" type="submit" ${outreachJob.running || !outreachJob.paused ? "" : "disabled"}>Pauză</button>
            </form>
            <form method="post" action="/nexora/travel/outreach/job/stop" onsubmit="return confirm('Oprești jobul de outreach acum?');">
              <button class="nx-btn danger" type="submit" ${outreachJob.running || !outreachJob.paused ? "" : "disabled"}>Oprire</button>
            </form>
          </div>
          ${latestReportHtml}
          ${logTailHtml}
        </div>
        <div>
          <div class="nx-section-head">
            <div>
              <h1>Mesaje care vor fi trimise</h1>
              <p>Șabloanele active pentru România și international.</p>
            </div>
          </div>
          ${messageTemplateCards || `<div class="nx-empty-state">Nu există șabloane de mesaj.</div>`}
        </div>
      </section>
      <section class="nx-kpi-grid">
        <div class="nx-kpi-card"><div class="nx-kpi-icon blue">A</div><div><div class="nx-kpi-label">În coadă</div><div class="nx-kpi-value">${escapeHtml(stats.totalQueued || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon green">Z</div><div><div class="nx-kpi-label">Pentru azi</div><div class="nx-kpi-value">${escapeHtml(stats.dueToday || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon orange">E</div><div><div class="nx-kpi-label">Cu email</div><div class="nx-kpi-value">${escapeHtml(stats.withEmail || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon purple">T</div><div><div class="nx-kpi-label">Cu telefon</div><div class="nx-kpi-value">${escapeHtml(stats.withPhone || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon green">S</div><div><div class="nx-kpi-label">Email trimise 24h</div><div class="nx-kpi-value">${escapeHtml(stats.sent24h || 0)}</div></div></div>
        <div class="nx-kpi-card"><div class="nx-kpi-icon red">!</div><div><div class="nx-kpi-label">Erori 7 zile</div><div class="nx-kpi-value">${escapeHtml((Number(stats.failed7d || 0) + Number(stats.bounced7d || 0)) || 0)}</div></div></div>
      </section>
      <p class="nx-table-sub">Data operațională: ${escapeHtml(today || "-")}. Email total trimise: ${escapeHtml(stats.sentTotal || 0)}. Eșecuri trimitere: ${escapeHtml(stats.failedTotal || 0)}. Bounce-uri: ${escapeHtml(stats.bouncedTotal || 0)}.</p>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Erori email recente</h1>
          <p>Bounce-uri și eșecuri de trimitere. Butonul de repair caută emailuri publice pe website-ul proprietății și actualizează lead-ul doar când găsește o alternativă sigură.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Dată</th><th>Tip</th><th>Lead</th><th>Email / telefon</th><th>Website</th><th>Detalii eroare</th></tr></thead>
          <tbody>${errorRows}</tbody>
        </table>
      </div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Mesaje email</h1>
          <p>Ultimele mesaje trimise sau importate din mailbox-ul Trevoro.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Tip</th><th>Lead</th><th>De la</th><th>Subiect</th><th>Dată</th></tr></thead>
          <tbody>${replyRows}</tbody>
        </table>
      </div>
    </section>
    ${cards || `<section class="nx-content-card"><div class="nx-empty-state">Nu există lead-uri în coada de outreach.</div></section>`}
  `;
  return shell({ title: "Outreach Travel", activePath: "/nexora/travel/outreach", companyName, user: options.user, body });
}

function renderNexoraTravelKanbanPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const leadStatuses = Array.isArray(options.leadStatuses) ? options.leadStatuses : [];
  const labels = options.statusLabels || {};
  const board = leadStatuses.map((status) => {
    const statusRows = rows.filter((row) => String(row.status || "") === status);
    const cards = statusRows.map((row) => {
      const moveButtons = leadStatuses
        .filter((targetStatus) => targetStatus !== status)
        .map((targetStatus) => `
          <button class="nx-btn" type="submit" name="status" value="${escapeHtml(targetStatus)}">${escapeHtml(labels[targetStatus] || targetStatus.replaceAll("_", " "))}</button>
        `).join("");
      return `
        <article class="nx-crm-board-card">
          <div>
            <b><a class="nx-table-main-link" href="/nexora/travel/leads/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a></b>
            <span>${escapeHtml(row.property_type || "-")}</span>
          </div>
          <p>${escapeHtml(row.city || "-")}${row.county ? ` · ${escapeHtml(row.county)}` : ""}</p>
          <div class="nx-crm-board-meta">
            <span>${escapeHtml(row.phone || "-")}</span>
            <span>${escapeHtml(String(row.score ?? 0))}</span>
          </div>
          <div class="nx-form-actions">${leadScoreBadge(row.score)}</div>
          <p>Follow-up: ${escapeHtml(dateValue(row.next_follow_up_at) || "-")}</p>
          <form method="post" action="/nexora/travel/leads/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
            <input type="hidden" name="return_to" value="kanban">
            <div class="nx-form-actions">${moveButtons}</div>
          </form>
        </article>
      `;
    }).join("");
    return `
      <section class="nx-crm-board-column">
        <div class="nx-crm-board-head">
          <b>${escapeHtml(labels[status] || status.replaceAll("_", " "))}</b>
          <span>${escapeHtml(statusRows.length)} lead-uri</span>
        </div>
        ${cards || `<div class="nx-empty-state">Fără lead-uri.</div>`}
      </section>
    `;
  }).join("");

  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Kanban lead-uri Travel</h1><p>Mută lead-urile între statusuri folosind butoanele de pe carduri.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/leads">Listă</a>
          <a class="nx-btn primary" href="/nexora/travel/leads?source=trevoro_landing">Trevoro Leads</a>
        </div>
      </div>
      <div class="nx-crm-board">${board}</div>
    </section>
  `;

  return shell({ title: "Kanban Travel", activePath: "/nexora/travel/kanban", companyName, user: options.user, body });
}

function renderNexoraTravelLeadDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const lead = options.lead || {};
  const property = options.property || null;
  const leadStatuses = Array.isArray(options.leadStatuses) ? options.leadStatuses : [];
  const timeline = Array.isArray(options.timeline) ? options.timeline : [];
  const detailRows = [
    ["ID", lead.id],
    ["Name", lead.name],
    ["Property type", lead.property_type],
    ["Country", lead.country || "Romania"],
    ["City", lead.city],
    ["County", lead.county],
    ["Address", lead.address],
    ["Phone", lead.phone],
    ["WhatsApp phone", lead.whatsapp_phone || lead.phone],
    ["WhatsApp opt-in", WHATSAPP_OPT_IN_LABELS[whatsappOptInStatus(lead)]],
    ["WhatsApp status", WHATSAPP_STATUS_LABELS[whatsappStatus(lead)]],
    ["WhatsApp last contact", dateValue(lead.whatsapp_last_contacted_at)],
    ["Email", lead.email],
    ["Website", lead.website],
    ["Facebook", lead.facebook],
    ["Instagram", lead.instagram],
    ["Google rating", lead.google_rating],
    ["Google reviews", lead.google_reviews],
    ["Google Place ID", lead.google_place_id],
    ["Source", lead.source],
    ["Status", String(lead.status || "").replaceAll("_", " ")],
    ["Score", lead.score],
    ["Notes", lead.notes],
    ["Next follow-up", dateValue(lead.next_follow_up_at)],
    ["Created at", dateValue(lead.created_at)],
    ["Updated at", dateValue(lead.updated_at)]
  ].map(([label, value]) => {
    const displayValue = value === 0 ? "0" : value || "-";
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(displayValue)}</td>
      </tr>
    `;
  }).join("");
  const timelineHtml = timeline.length
    ? timeline.slice(0, 12).map((event) => `
      <div class="nx-timeline-item">
        <div class="nx-timeline-dot"></div>
        <div>
          <b>${escapeHtml(event.subject || event.activity_type || "Activitate")}</b>
          <span>${escapeHtml(dateValue(event.created_at) || "-")}${event.details ? ` · ${escapeHtml(event.details)}` : ""}</span>
        </div>
      </div>
    `).join("")
    : `<div class="nx-empty-state">Nu există timeline.</div>`;
  const currentWhatsappOptIn = whatsappOptInStatus(lead);
  const currentWhatsappStatus = whatsappStatus(lead);
  const whatsappPhoneValue = whatsappLeadPhone(lead);
  const normalizedWhatsappPhone = normalizeWhatsappPhone(whatsappPhoneValue, lead.country || "Romania");
  const whatsappOptInOptions = Object.entries(WHATSAPP_OPT_IN_LABELS).map(([value, label]) => `
    <option value="${escapeHtml(value)}" ${selected(currentWhatsappOptIn, value)}>${escapeHtml(label)}</option>
  `).join("");
  const whatsappStatusOptions = Object.entries(WHATSAPP_STATUS_LABELS).map(([value, label]) => `
    <option value="${escapeHtml(value)}" ${selected(currentWhatsappStatus, value)}>${escapeHtml(label)}</option>
  `).join("");
  const outreachHtml = outreachTemplates(lead).map((template) => {
    const textareaId = `travel-outreach-${escapeHtml(template.key)}-${escapeHtml(lead.id)}`;
    const isWhatsapp = template.key === "whatsapp";
    const whatsappHref = isWhatsapp ? whatsappMessageHref(lead, template.message) : "";
    const whatsappDeclined = isWhatsapp && currentWhatsappOptIn === "declined";
    const canUse = template.key === "email"
      ? Boolean(lead.email)
      : isWhatsapp
        ? Boolean(whatsappHref) && !whatsappDeclined
        : Boolean(lead.phone);
    return `
      <div class="nx-field">
        <span>${escapeHtml(template.label)} ${isWhatsapp ? whatsappOptInBadge(lead) : ""}</span>
        <textarea id="${textareaId}" rows="7" readonly>${escapeHtml(template.message)}</textarea>
        <div class="nx-form-actions">
          <button class="nx-btn" type="button" data-travel-copy-target="${textareaId}">Copiază mesaj</button>
          ${isWhatsapp && whatsappHref && !whatsappDeclined ? `<a class="nx-btn primary" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noreferrer">Deschide WhatsApp</a>` : ""}
          <a class="nx-btn" href="${escapeHtml(TREVORO_SUPPORT_MAILTO)}">Am nevoie de suport</a>
          <form method="post" action="/nexora/travel/leads/${escapeHtml(lead.id)}/mark-contacted">
            <input type="hidden" name="channel" value="${escapeHtml(template.key)}">
            <button class="nx-btn ${isWhatsapp ? "" : "primary"}" type="submit" ${canUse ? "" : "disabled"}>Marchează contactat</button>
          </form>
        </div>
        ${isWhatsapp ? `<div class="nx-table-sub">WhatsApp manual${normalizedWhatsappPhone ? `: +${escapeHtml(normalizedWhatsappPhone)}` : ""}. API doar pentru opt-in confirmat.</div>` : ""}
      </div>
    `;
  }).join("");
  const convertAction = property
    ? `<a class="nx-btn primary" href="/nexora/travel/properties">Proprietate creată</a>`
    : `<form method="post" action="/nexora/travel/leads/${escapeHtml(lead.id)}/convert-to-property">
        <button class="nx-btn primary" type="submit">Convert to Property</button>
      </form>`;

  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(lead.name || "Lead Travel")}</h1>
          <p>${escapeHtml([lead.city, lead.county, lead.property_type].filter(Boolean).join(" · ") || "Detaliu lead Travel")}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/leads">Înapoi la lead-uri</a>
          ${convertAction}
        </div>
      </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Detalii lead</h1><p>Status curent: ${statusBadge(lead.status)} ${leadScoreBadge(lead.score)}</p></div></div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead><tr><th>Câmp</th><th>Valoare</th></tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Edit lead</h1><p>Status și notes pentru follow-up.</p></div></div>
        <form method="post" action="/nexora/travel/leads/${escapeHtml(lead.id)}/status" class="nx-form">
          <input type="hidden" name="return_to" value="detail">
          <label class="nx-field"><span>Status</span><select name="status">${statusOptions(leadStatuses, lead.status)}</select></label>
          <label class="nx-field"><span>Notes</span><textarea name="notes" rows="6">${escapeHtml(lead.notes || "")}</textarea></label>
          <label class="nx-field"><span>Next follow-up</span><input type="datetime-local" name="next_follow_up_at" value="${escapeHtml(inputDateTimeValue(lead.next_follow_up_at))}"></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează</button></div>
        </form>
        ${property ? `
          <div class="nx-empty-state">Lead convertit în proprietatea #${escapeHtml(property.id)}.</div>
        ` : ""}
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>WhatsApp</h1>
            <p>Contact manual acum, pregătit pentru API după opt-in confirmat.</p>
          </div>
          ${whatsappOptInBadge(lead)}
        </div>
        <form method="post" action="/nexora/travel/leads/${escapeHtml(lead.id)}/whatsapp" class="nx-form">
          <label class="nx-field">
            <span>Număr WhatsApp</span>
            <input name="whatsapp_phone" value="${escapeHtml(whatsappPhoneValue)}" placeholder="+40774362975">
          </label>
          <label class="nx-field">
            <span>Opt-in</span>
            <select name="whatsapp_opt_in_status">${whatsappOptInOptions}</select>
          </label>
          <label class="nx-field">
            <span>Status WhatsApp</span>
            <select name="whatsapp_status">${whatsappStatusOptions}</select>
          </label>
          <label class="nx-field">
            <span>Sursă opt-in</span>
            <input name="whatsapp_opt_in_source" value="${escapeHtml(lead.whatsapp_opt_in_source || "")}" placeholder="formular site, email, telefon, contract">
          </label>
          <label class="nx-field">
            <span>Note WhatsApp</span>
            <textarea name="whatsapp_notes" rows="4">${escapeHtml(lead.whatsapp_notes || "")}</textarea>
          </label>
          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Salvează WhatsApp</button>
          </div>
        </form>
        <p class="nx-table-sub">Număr normalizat: ${normalizedWhatsappPhone ? `+${escapeHtml(normalizedWhatsappPhone)}` : "-"}. Nu folosim trimitere automată fără opt-in confirmat.</p>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Outreach</h1><p>Template-uri rapide pentru primul contact.</p></div></div>
      <div class="nx-two-column-grid">
        ${outreachHtml}
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Timeline</h1><p>Activități recente pentru lead-ul Travel.</p></div></div>
      <div class="nx-timeline">
        ${timelineHtml}
      </div>
    </section>
    <script>
      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-travel-copy-target]");
        if (!button) return;
        const textarea = document.getElementById(button.dataset.travelCopyTarget || "");
        if (!textarea) return;
        try {
          await navigator.clipboard.writeText(textarea.value || "");
        } catch {
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
        }
        const previousText = button.textContent;
        button.textContent = "Copiat";
        window.setTimeout(() => {
          button.textContent = previousText;
        }, 1400);
      });
    </script>
  `;

  return shell({ title: lead.name || "Lead Travel", activePath: "/nexora/travel/leads", companyName, user: options.user, body });
}

function renderNexoraTravelOwnersMonitorPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const events = Array.isArray(options.events) ? options.events : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const eventTypes = Array.isArray(options.eventTypes) ? options.eventTypes : [];
  const properties = Array.isArray(options.properties) ? options.properties : [];
  const severityOptions = ["error", "warning", "success", "info"];
  const propertyOptions = properties.map((property) => ({
    value: String(property.id),
    label: `#${property.id} · ${property.name || "-"}`
  }));
  const typeOptions = eventTypes.map((type) => ({
    value: type,
    label: ownerEventLabel(type)
  }));

  const optionHtml = (items = [], current = "", emptyLabel = "toate") => [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...items.map((item) => {
      const value = typeof item === "string" ? item : item.value;
      const label = typeof item === "string" ? item : item.label;
      return `<option value="${escapeHtml(value)}" ${selected(current, value)}>${escapeHtml(label)}</option>`;
    })
  ].join("");

  const ownerRows = rowsOrEmpty(rows, 11, (row) => {
    const lastError = row.last_error_at
      ? `<div class="nx-table-sub" style="color:#b91c1c;font-weight:850">Ultima eroare: ${escapeHtml(dateValue(row.last_error_at))}${row.last_error_details ? ` · ${escapeHtml(shortText(row.last_error_details, 90))}` : ""}</div>`
      : "";
    const calendarBadge = Number(row.calendar_error_count || 0)
      ? `<span class="nx-status-pill danger">${escapeHtml(row.calendar_error_count)} erori calendar</span>`
        : Number(row.calendar_count || 0)
        ? `<span class="nx-status-pill success">${escapeHtml(row.calendar_count)} calendare</span>`
        : `<span class="nx-status-pill warn">fără calendar</span>`;
    const hasPhotos = Number(row.photo_count || 0) > 0;
    const hasRoomPrices = Number(row.room_price_count || 0) > 0;
    const hasBasePrice = Number(row.price_per_night || 0) > 0;
    const contactReasons = [
      !hasPhotos ? "fără poze" : "",
      !hasRoomPrices ? "fără tarife pe camere" : "",
      !String(row.phone || "").trim() ? "fără telefon" : ""
    ].filter(Boolean);
    const needsContact = contactReasons.length > 0;
    const needsAttention = needsContact || Number(row.errors_7d || 0) || Number(row.calendar_error_count || 0);
    const normalizedPhone = normalizeWhatsappPhone(row.phone || "", row.country || "Romania");
    const phoneHref = normalizedPhone ? `tel:+${normalizedPhone}` : "";
    return `
      <tr>
        <td>
          <a class="nx-table-main-link" href="/nexora/travel/properties/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a>
          <div class="nx-table-sub">${escapeHtml([row.property_type, row.city, row.county, row.country || "Romania"].filter(Boolean).join(" · "))}</div>
          ${lastError}
        </td>
        <td>${escapeHtml(row.email || "-")}</td>
        <td>
          <b>${escapeHtml(row.phone || "-")}</b>
          <div class="nx-table-sub">${phoneHref ? `<a href="${escapeHtml(phoneHref)}">Sună</a>` : "telefon lipsă"}</div>
        </td>
        <td>${propertyPlanDisplay(row)}</td>
        <td>${statusBadge(row.status)}</td>
        <td>
          <b>${escapeHtml(row.photo_count || 0)}</b> poze
          <div class="nx-table-sub">${escapeHtml(row.photo_uploads_24h || 0)} încărcate în 24h</div>
        </td>
        <td>
          <b>${escapeHtml(row.room_price_count || 0)}/${escapeHtml(row.room_count || 0)}</b> camere cu tarif
          <div class="nx-table-sub">Tarif bază: ${escapeHtml(hasBasePrice ? `${row.price_per_night} ${row.price_currency || "RON"}` : "-")}</div>
        </td>
        <td>${calendarBadge}<div class="nx-table-sub">Ultim sync: ${escapeHtml(dateValue(row.last_calendar_sync_at) || "-")}</div></td>
        <td>
          <span class="nx-status-pill ${Number(row.pending_inquiries || 0) ? "warn" : "neutral"}">${escapeHtml(row.pending_inquiries || 0)} cereri noi</span>
          <div class="nx-table-sub">${escapeHtml(row.pending_booking_requests || 0)} rezervări pending</div>
        </td>
        <td>
          <b>${escapeHtml(row.events_24h || 0)}</b> evenimente/24h
          <div class="nx-table-sub">${escapeHtml(dateValue(row.last_event_at) || "fără activitate")}</div>
        </td>
        <td>
          ${needsContact ? `<span class="nx-status-pill danger">contactează</span>` : needsAttention ? `<span class="nx-status-pill warn">verifică</span>` : `<span class="nx-status-pill success">ok</span>`}
          <div class="nx-table-sub">${escapeHtml(contactReasons.length ? contactReasons.join(" · ") : `${row.errors_7d || 0} erori în 7 zile`)}</div>
          <a class="nx-btn" href="/nexora/travel/owners-monitor?property_id=${escapeHtml(row.id)}" style="margin-top:6px">Jurnal</a>
        </td>
      </tr>
    `;
  }, "Nu există proprietari/proprietăți de monitorizat.");

  const eventRows = rowsOrEmpty(events, 8, (row) => {
    const metaSummary = ownerEventMetaSummary(row);
    const details = [row.details, metaSummary].filter(Boolean).join(" · ");
    return `
      <tr>
        <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
        <td>${ownerEventSeverityBadge(row.severity)}</td>
        <td>
          <a class="nx-table-main-link" href="/nexora/travel/properties/${escapeHtml(row.property_id || "")}">${escapeHtml(row.property_name || `Proprietate #${row.property_id || "-"}`)}</a>
          <div class="nx-table-sub">${escapeHtml(row.actor_email || row.property_email || "-")}</div>
        </td>
        <td>${escapeHtml(ownerEventLabel(row.event_type))}<div class="nx-table-sub">${escapeHtml(row.subject || "")}</div></td>
        <td>${escapeHtml(shortText(details || "-", 220))}</td>
        <td>${escapeHtml(row.request_path || "-")}<div class="nx-table-sub">${escapeHtml(shortText(row.user_agent || "", 70))}</div></td>
        <td>${escapeHtml(row.ip_address || "-")}</td>
        <td><a class="nx-btn" href="/nexora/travel/owners-monitor?property_id=${escapeHtml(row.property_id || "")}">Filtrează</a></td>
      </tr>
    `;
  }, "Nu există evenimente în jurnal pentru filtrele curente.");

  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Monitor Proprietari</h1>
          <p>Urmărește ce modifică proprietarii în cont: autentificări, profil, poze, calendar, cereri, rezervări și erori.</p>
        </div>
        <div class="nx-section-actions">
          <a class="nx-btn" href="/nexora/travel/support">Inbox Support</a>
          <a class="nx-btn primary" href="/nexora/travel/properties">Proprietăți</a>
        </div>
      </div>
      <div class="nx-kpi-grid">
        <div class="nx-kpi-card"><span>Proprietăți</span><b>${escapeHtml(stats.totalProperties || 0)}</b></div>
        <div class="nx-kpi-card ${Number(stats.errorProperties || 0) ? "danger" : ""}"><span>Cu erori 7 zile</span><b>${escapeHtml(stats.errorProperties || 0)}</b></div>
        <div class="nx-kpi-card"><span>Evenimente 24h</span><b>${escapeHtml(stats.events24h || 0)}</b></div>
        <div class="nx-kpi-card"><span>Poze 24h</span><b>${escapeHtml(stats.photoUploads24h || 0)}</b></div>
        <div class="nx-kpi-card ${Number(stats.contactRecommended || 0) ? "danger" : ""}"><span>De contactat</span><b>${escapeHtml(stats.contactRecommended || 0)}</b></div>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Caută proprietari</h1><p>Filtrează lista de proprietari și jurnalul după proprietate, email, telefon, locație sau eroare.</p></div></div>
      <form method="get" action="/nexora/travel/owners-monitor" class="nx-inline-form">
        <label class="nx-field"><span>Severitate</span><select name="severity">${optionHtml(severityOptions, filters.severity, "toate")}</select></label>
        <label class="nx-field"><span>Acțiune</span><select name="event_type">${optionHtml(typeOptions, filters.event_type, "toate acțiunile")}</select></label>
        <label class="nx-field"><span>Proprietate</span><select name="property_id">${optionHtml(propertyOptions, String(filters.property_id || ""), "toate proprietățile")}</select></label>
        <label class="nx-field" style="min-width:280px"><span>Caută</span><input type="search" name="q" value="${escapeHtml(filters.q || "")}" placeholder="proprietate, email, eroare..."></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Caută</button>
          <a class="nx-btn" href="/nexora/travel/owners-monitor?severity=error">Doar erori</a>
          <a class="nx-btn" href="/nexora/travel/owners-monitor">Reset</a>
        </div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Status pe proprietar</h1><p>Prioritate: proprietăți fără poze, fără tarife pe camere, probleme calendar, erori recente și cereri noi.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Proprietate</th><th>Email</th><th>Telefon</th><th>Plan</th><th>Status</th><th>Poze</th><th>Tarife camere</th><th>Calendar</th><th>Cereri</th><th>Activitate</th><th>Intervenție</th></tr></thead>
          <tbody>${ownerRows}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Jurnal evenimente</h1><p>Cronologic: ultimele acțiuni și erori din conturile de proprietar.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Ora</th><th>Tip</th><th>Proprietar</th><th>Acțiune</th><th>Detalii</th><th>Endpoint</th><th>IP</th><th></th></tr></thead>
          <tbody>${eventRows}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Monitor Proprietari", activePath: "/nexora/travel/owners-monitor", companyName, user: options.user, body });
}

function renderNexoraTravelPropertiesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const filters = options.filters || {};
  const filterOptions = options.filterOptions || {};
  const propertyActionStats = options.propertyActionStats || {};
  const paymentRequiredCount = Number(propertyActionStats.paymentRequired || 0);
  const activeFilters = [
    filters.country ? `Țară: ${filters.country}` : "",
    filters.status ? `Status: ${filters.status}` : "",
    filters.q ? `Căutare: ${filters.q}` : ""
  ].filter(Boolean).join(" · ");
	  const rowsHtml = rowsOrEmpty(rows, 12, (row) => `
	    <tr>
	      <td><a class="nx-table-main-link" href="/nexora/travel/properties/${escapeHtml(row.id)}">${escapeHtml(row.name || "-")}</a><div class="nx-table-sub">${escapeHtml(row.property_type || "-")}</div></td>
	      <td>${escapeHtml(row.country || "Romania")}</td>
	      <td>${escapeHtml(row.city || "-")}</td>
      <td>${escapeHtml(row.county || "-")}</td>
      <td>${escapeHtml(row.address || "-")}</td>
      <td>${escapeHtml(row.phone || "-")}<div class="nx-table-sub">${escapeHtml(row.email || "")}</div></td>
      <td>${row.website ? `<a class="nx-table-main-link" href="${escapeHtml(externalHref(row.website))}">${escapeHtml(row.website)}</a>` : "-"}</td>
      <td>${escapeHtml(row.lead_name || "-")}</td>
	      <td>${propertyPlanDisplay(row)}</td>
	      <td>${statusBadge(row.status)}</td>
	      <td>${escapeHtml(dateValue(row.updated_at) || "-")}</td>
	      <td><div class="nx-form-actions">${propertyPasswordResetForm(row)} ${propertyFree12Form(row)} ${propertyDeleteForm(row)}</div></td>
	    </tr>
	  `, "Nu există proprietăți Travel încă.");
	  const body = `
	    ${alertHtml(options.ok, options.err)}
	    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Caută proprietăți</h1>
          <p>Implicit vezi proprietățile din România. Caută după nume, oraș, județ, adresă, telefon, email, website sau lead.</p>
        </div>
      </div>
      <div class="nx-alert success" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <span><b>Program lansare activ.</b> Proprietățile FOUNDING PARTNER sunt marcate separat pentru monitorizare.</span>
        <a class="nx-btn primary" href="/nexora/travel/properties?country=&status=plata_necesara">Deschide proprietăți de verificat</a>
      </div>
      ${paymentRequiredCount ? `
        <div class="nx-alert danger" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px">
          <span>${escapeHtml(paymentRequiredCount)} proprietăți trebuie verificate pentru programul de lansare.</span>
          <a class="nx-btn primary" href="/nexora/travel/properties?country=&status=plata_necesara">Vezi proprietăți</a>
        </div>
      ` : ""}
      <form method="get" action="/nexora/travel/properties" class="nx-inline-form">
        <label class="nx-field"><span>Țară</span><select name="country">${simpleOptions(filterOptions.countries || [], filters.country || "Romania", "toate țările")}</select></label>
        <label class="nx-field"><span>Status</span><select name="status">${simpleOptions(filterOptions.statuses || [], filters.status, "toate")}</select></label>
        <label class="nx-field" style="min-width:320px"><span>Search</span><input type="search" name="q" value="${escapeHtml(filters.q || "")}" placeholder="nume, oraș, telefon, email, website..."></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Caută</button>
          <a class="nx-btn" href="/nexora/travel/properties?country=Romania">România</a>
          <a class="nx-btn" href="/nexora/travel/properties?country=&status=plata_necesara">De verificat</a>
          <a class="nx-btn" href="/nexora/travel/properties">Reset</a>
        </div>
      </form>
      ${activeFilters ? `<div class="nx-empty-state" style="margin-top:12px">Filtre active: ${escapeHtml(activeFilters)} · rezultate: ${escapeHtml(rows.length)}</div>` : ""}
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Proprietăți active - control gratuitate 12 luni</h1><p>Listă pentru unități de cazare active, proprietari, locații și status operațional.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
	          <thead><tr><th>Proprietate</th><th>Country</th><th>City</th><th>County</th><th>Address</th><th>Contact</th><th>Website</th><th>Lead</th><th>Plan</th><th>Status</th><th>Actualizat</th><th>Acțiuni</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Proprietăți", activePath: "/nexora/travel/properties", companyName, user: options.user, body });
}

function renderNexoraTravelPropertyDetailPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const property = options.property || {};
  const photos = Array.isArray(options.photos) ? options.photos : [];
  const calendarLinks = Array.isArray(options.calendarLinks) ? options.calendarLinks : [];
  const calendarExportUrl = options.calendarExportUrl || "";
  const photoMaxSizeMb = Number(options.photoMaxSizeMb || 20);
  const photoLimit = Number(options.photoLimit || options.photo_limit || 30);
  const photoSlotsLeft = Math.max(0, photoLimit - photos.length);
  const photoRows = rowsOrEmpty(photos, 5, (photo) => `
    <tr>
      <td>
        <img src="${escapeHtml(photo.public_url || photo.file_path || "")}" alt="${escapeHtml(photo.caption || property.name || "Poză proprietate")}" style="width:120px;height:78px;object-fit:cover;border-radius:8px;border:1px solid #dbe3ef">
      </td>
      <td>${photo.is_cover ? `<span class="nx-status-pill success">cover</span>` : `<span class="nx-status-pill neutral">galerie</span>`}</td>
      <td>${escapeHtml(photo.caption || "-")}</td>
      <td>${escapeHtml(photo.sort_order || 0)}</td>
      <td>
        <form method="post" action="/nexora/travel/properties/${escapeHtml(property.id)}/photos/${escapeHtml(photo.id)}/delete" class="nx-inline-form compact">
          <button class="nx-btn" type="submit">Șterge</button>
        </form>
      </td>
    </tr>
  `, "Nu există poze încă.");
  const calendarRows = rowsOrEmpty(calendarLinks, 5, (row) => `
    <tr>
      <td>${escapeHtml(String(row.provider || "ical").toUpperCase())}</td>
      <td><a class="nx-table-main-link" href="${escapeHtml(externalHref(row.calendar_url || ""))}" target="_blank">${escapeHtml(shortText(row.calendar_url || "-", 80))}</a></td>
      <td>${statusBadge(row.sync_status || "pending")}</td>
      <td>${escapeHtml(dateValue(row.last_synced_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/travel/properties/${escapeHtml(property.id)}/calendar-links/${escapeHtml(row.id)}/delete" class="nx-inline-form compact">
          <button class="nx-btn" type="submit">Șterge</button>
        </form>
      </td>
    </tr>
  `, "Nu există calendar sincronizat încă.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(property.name || "Proprietate")}</h1>
          <p>${escapeHtml([property.property_type, property.country || "Romania", property.city, property.county].filter(Boolean).join(" · ") || "Detalii proprietate Trevoro")}</p>
        </div>
	        <div class="nx-section-actions">
	          <a class="nx-btn" href="/nexora/travel/properties">Înapoi</a>
	          <a class="nx-btn primary" href="${escapeHtml(`/properties/${property.public_slug || property.id || 0}`)}" target="_blank">Preview public</a>
	          ${propertyPasswordResetForm(property, { returnTo: "detail", label: "Trimite resetare parolă" })}
	          ${propertyFree12Form(property, { returnTo: "detail", label: "Activează" })}
	          ${propertyDeleteForm(property, { label: "Șterge proprietatea" })}
	        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <tbody>
            <tr><th>Status</th><td>${statusBadge(property.status)}</td></tr>
            <tr><th>Plan</th><td>${propertyPlanDisplay(property)}</td></tr>
            <tr><th>Country</th><td>${escapeHtml(property.country || "Romania")}</td></tr>
            <tr><th>Contact</th><td>${escapeHtml(property.phone || "-")}<div class="nx-table-sub">${escapeHtml(property.email || "")}</div></td></tr>
            <tr><th>Adresă</th><td>${escapeHtml([property.address, property.city, property.county].filter(Boolean).join(", ") || "-")}</td></tr>
            <tr><th>Website</th><td>${property.website ? `<a class="nx-table-main-link" href="${escapeHtml(externalHref(property.website))}" target="_blank">${escapeHtml(property.website)}</a>` : "-"}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Galerie foto</h1>
          <p>${escapeHtml(`${photos.length}/${photoLimit} poze încărcate. Pozele JPG, PNG și WebP sunt acceptate, maximum ${photoMaxSizeMb} MB fiecare.`)}</p>
        </div>
      </div>
      <form method="post" action="/nexora/travel/properties/${escapeHtml(property.id)}/photos" enctype="multipart/form-data" class="nx-inline-form">
        <label class="nx-field"><span>Adaugă poze</span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple ${photoSlotsLeft ? "" : "disabled"}></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit" ${photoSlotsLeft ? "" : "disabled"}>Încarcă</button></div>
      </form>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Poză</th><th>Tip</th><th>Caption</th><th>Ordine</th><th>Acțiuni</th></tr></thead>
          <tbody>${photoRows}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Calendar</h1>
          <p>Adaugă link iCal de la Google Calendar, Outlook, Airbnb/Booking sau alt calendar. Exportul Trevoro poate fi importat în Booking/Airbnb.</p>
        </div>
      </div>
      ${calendarExportUrl ? `
        <div class="nx-empty-state" style="margin-bottom:12px">
          Export Trevoro iCal:
          <a class="nx-table-main-link" href="${escapeHtml(calendarExportUrl)}" target="_blank">${escapeHtml(calendarExportUrl)}</a>
        </div>
      ` : ""}
      <form method="post" action="/nexora/travel/properties/${escapeHtml(property.id)}/calendar-links" class="nx-inline-form">
        <label class="nx-field"><span>Provider</span><select name="provider">
          <option value="booking">Booking.com</option>
          <option value="airbnb">Airbnb</option>
          <option value="ical">iCal</option>
          <option value="google">Google</option>
          <option value="outlook">Outlook</option>
          <option value="other">Altul</option>
        </select></label>
        <label class="nx-field"><span>Calendar URL</span><input type="url" name="calendar_url" placeholder="https://.../calendar.ics"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adaugă calendar</button></div>
      </form>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Provider</th><th>URL</th><th>Status</th><th>Ultima sincronizare</th><th>Acțiuni</th></tr></thead>
          <tbody>${calendarRows}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: property.name || "Proprietate", activePath: "/nexora/travel/properties", companyName, user: options.user, body });
}

function renderNexoraTravelInquiriesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const statuses = Array.isArray(options.statuses) ? options.statuses : ["nou", "contactat", "inchis"];
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => {
    const propertyName = row.property_name || row.linked_property_name || "-";
    const location = [row.property_city || row.city, row.property_county || row.county].filter(Boolean).join(", ");
    const period = [row.check_in, row.check_out].filter(Boolean).join(" - ") || "-";
    const contact = [
      row.phone ? escapeHtml(row.phone) : "",
      row.email ? escapeHtml(row.email) : ""
    ].filter(Boolean).join("<br>");
    const notificationHtml = row.notification_error
      ? `<span class="nx-status-pill danger">eroare</span><div class="nx-table-sub">${escapeHtml(shortText(row.notification_error, 80))}</div>`
      : row.notified_at
        ? `<span class="nx-status-pill success">trimis</span><div class="nx-table-sub">${escapeHtml(dateValue(row.notified_at))}</div>`
        : `<span class="nx-status-pill warn">în așteptare</span><div class="nx-table-sub">neanunțată</div>`;
    return `
      <tr>
        <td>
          <b>${escapeHtml(propertyName)}</b>
          <div class="nx-table-sub">${escapeHtml(location || `Proprietate #${row.property_id || "-"}`)}</div>
        </td>
        <td>
          <b>${escapeHtml(row.guest_name || "-")}</b>
          <div class="nx-table-sub">${escapeHtml(shortText(row.message || "", 90) || "-")}</div>
        </td>
        <td>${contact || "-"}</td>
        <td>${escapeHtml(period)}<div class="nx-table-sub">Oaspeți: ${escapeHtml(row.guests || 1)}</div></td>
        <td>${escapeHtml(row.source || "-")}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${notificationHtml}</td>
        <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
        <td>
          <form method="post" action="/nexora/travel/inquiries/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
            <select name="status">${statusOptions(statuses, row.status)}</select>
            <button class="nx-btn" type="submit">Salvează</button>
          </form>
        </td>
      </tr>
    `;
  }, "Nu există cereri din site încă.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Cereri din site</h1>
          <p>Cereri de disponibilitate trimise de clienți din paginile publice Trevoro.</p>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Proprietate</th>
              <th>Client</th>
              <th>Contact</th>
              <th>Perioadă</th>
              <th>Sursă</th>
              <th>Status</th>
              <th>Notificare</th>
              <th>Creată</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Cereri Site", activePath: "/nexora/travel/inquiries", companyName, user: options.user, body });
}

function renderNexoraTravelSupportPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const statuses = Array.isArray(options.statuses) ? options.statuses : ["nou", "in_asteptare", "rezolvat"];
  const stats = options.stats || {};
  const sync = options.syncStats || {};
  const filters = options.filters || {};
  const readFilter = String(filters.read || "");
  const resolutionFilter = String(filters.resolution || "");
  const searchFilter = String(filters.q || "");
  const filterHiddens = `
    <input type="hidden" name="read" value="${escapeHtml(readFilter)}">
    <input type="hidden" name="resolution" value="${escapeHtml(resolutionFilter)}">
    <input type="hidden" name="q" value="${escapeHtml(searchFilter)}">
  `;
  const unopened = Number(stats.unopenedCount || 0);
  const redBanner = unopened > 0
    ? `<section class="nx-alert danger" style="border-width:2px;font-weight:950">Atenție: există ${escapeHtml(unopened)} tichete support nedeschise. Deschide pagina și marchează-le ca preluate.</section>`
    : "";
  const syncHtml = options.ok === "support_synced"
    ? `<section class="nx-alert success">Support sincronizat: ${escapeHtml(sync.scanned || 0)} emailuri verificate, ${escapeHtml(sync.created || 0)} tichete noi, ${escapeHtml(sync.linked || 0)} mesaje legate.</section>`
    : "";
  const rowsHtml = rowsOrEmpty(rows, 9, (row) => {
    const related = [
      row.lead_id ? `Lead #${row.lead_id}${row.lead_name ? ` · ${row.lead_name}` : ""}` : "",
      row.property_id ? `Property #${row.property_id}${row.property_name ? ` · ${row.property_name}` : ""}` : "",
      row.inquiry_id ? `Cerere #${row.inquiry_id}` : ""
    ].filter(Boolean).join("<br>") || "-";
    const unopenedBadge = !row.opened_at
      ? `<span class="nx-status-pill danger">necitit</span>`
      : `<span class="nx-status-pill success">citit</span>`;
    const resolutionBadge = row.status === "rezolvat"
      ? `<span class="nx-status-pill success">rezolvat</span>`
      : `<span class="nx-status-pill warn">nerezolvat</span>`;
    const readAction = row.opened_at
      ? { label: "Necitit", value: "unread" }
      : { label: "Citit", value: "read" };
    const resolutionAction = row.status === "rezolvat"
      ? { label: "Redeschide", value: "unresolved" }
      : { label: "Rezolvat", value: "resolved" };
    const latestSource = String(row.last_message_direction || "").toLowerCase();
    const latestMessage = shortText(
      latestSource === "inbound" ? stripQuotedEmailText(row.last_message_body || "") : row.last_message_body || "",
      180
    );
    const translatedPreview = shortText(row.last_message_translation_ro || "", 180);
    const languagePreview = row.last_message_detected_language_name
      ? `<span class="nx-status-pill warn">${escapeHtml(row.last_message_detected_language_name)}</span>`
      : "";
    return `
      <tr>
        <td><b>${escapeHtml(row.ticket_number || `#${row.id}`)}</b><div class="nx-table-sub">${unopenedBadge} ${resolutionBadge}</div></td>
        <td>
          <a class="nx-table-main-link" href="/nexora/travel/support/${escapeHtml(row.id)}">${escapeHtml(row.subject || "-")}</a>
          <div class="nx-table-sub">${escapeHtml(shortText(row.requester_email || "-", 80))}</div>
          ${latestMessage ? `<div class="nx-table-sub">Ultimul mesaj: ${escapeHtml(latestMessage)}</div>` : ""}
          ${translatedPreview ? `<div class="nx-table-sub"><b>RO:</b> ${escapeHtml(translatedPreview)}</div>` : ""}
        </td>
        <td>${escapeHtml(row.country || "-")}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(row.message_count || 0)} mesaje ${languagePreview}<div class="nx-table-sub">${escapeHtml(shortText(row.last_message_from || row.requester_email || "-", 80))}</div></td>
        <td>${related}</td>
        <td>${escapeHtml(dateValue(row.last_activity_at || row.updated_at || row.created_at) || "-")}</td>
        <td>
          <form method="post" action="/nexora/travel/support/${escapeHtml(row.id)}/read" class="nx-inline-form compact">
            ${filterHiddens}
            <input type="hidden" name="read_status" value="${escapeHtml(readAction.value)}">
            <button class="nx-btn" type="submit">${escapeHtml(readAction.label)}</button>
          </form>
        </td>
        <td>
          <a class="nx-btn primary" href="/nexora/travel/support/${escapeHtml(row.id)}" style="margin-bottom:6px">Conversație</a>
          <form method="post" action="/nexora/travel/support/${escapeHtml(row.id)}/resolution" class="nx-inline-form compact" style="margin-bottom:6px">
            ${filterHiddens}
            <input type="hidden" name="resolution_status" value="${escapeHtml(resolutionAction.value)}">
            <button class="nx-btn ${resolutionAction.value === "resolved" ? "primary" : ""}" type="submit">${escapeHtml(resolutionAction.label)}</button>
          </form>
          <form method="post" action="/nexora/travel/support/${escapeHtml(row.id)}/status" class="nx-inline-form compact">
            ${filterHiddens}
            <select name="status">${statusOptions(statuses, row.status)}</select>
            <button class="nx-btn" type="submit">Status</button>
          </form>
        </td>
      </tr>
    `;
  }, "Nu există tichete support.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${redBanner}
    ${syncHtml}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Travel Support</h1>
          <p>Inbox cu tichete grupate pe conversație. Deschide ticketul pentru firul complet și răspuns direct.</p>
        </div>
        <form method="post" action="/nexora/travel/support/sync">
          <button class="nx-btn primary" type="submit">Sincronizează inbox</button>
        </form>
      </div>
      <div class="nx-kpi-grid">
        <div class="nx-kpi-card"><span>Total tichete</span><b>${escapeHtml(stats.totalCount || 0)}</b></div>
        <div class="nx-kpi-card ${unopened ? "danger" : ""}"><span>Necitite</span><b>${escapeHtml(unopened)}</b></div>
        <div class="nx-kpi-card"><span>Nerezolvate</span><b>${escapeHtml(stats.unresolvedCount || 0)}</b></div>
        <div class="nx-kpi-card"><span>Rezolvate</span><b>${escapeHtml(stats.resolvedCount || 0)}</b></div>
      </div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Lista tichete</h1><p>Prioritate: tichetele necitite și nerezolvate apar primele.</p></div>
      </div>
      <form method="get" action="/nexora/travel/support" class="nx-inline-form" style="margin-bottom:16px">
        <label><span>Citire</span><select name="read">
          <option value="" ${selected(readFilter, "")}>toate</option>
          <option value="unread" ${selected(readFilter, "unread")}>necitite</option>
          <option value="read" ${selected(readFilter, "read")}>citite</option>
        </select></label>
        <label><span>Rezolvare</span><select name="resolution">
          <option value="" ${selected(resolutionFilter, "")}>toate</option>
          <option value="unresolved" ${selected(resolutionFilter, "unresolved")}>nerezolvate</option>
          <option value="resolved" ${selected(resolutionFilter, "resolved")}>rezolvate</option>
        </select></label>
        <label><span>Caută</span><input name="q" value="${escapeHtml(searchFilter)}" placeholder="email, subiect, proprietate"></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Aplică</button>
          <a class="nx-btn" href="/nexora/travel/support">Reset</a>
        </div>
      </form>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Subiect / requester</th>
              <th>Țară</th>
              <th>Status</th>
              <th>Mesaje</th>
              <th>Legături</th>
              <th>Ultima activitate</th>
              <th>Citire</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Inbox Support", activePath: "/nexora/travel/support", companyName, user: options.user, body });
}

function renderNexoraTravelSupportTicketPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const ticket = options.ticket || {};
  const messages = Array.isArray(options.messages) ? options.messages : [];
  const replyLanguage = options.replyLanguage || { code: "ro", name: "română" };
  const replyDraft = options.replyDraft || null;
  const translationAvailable = options.translationAvailable !== false;
  const translationProvider = options.translationProvider || "Google Translate";
  const statuses = Array.isArray(options.statuses) ? options.statuses : ["nou", "in_asteptare", "rezolvat"];
  const readBadge = ticket.opened_at
    ? `<span class="nx-status-pill success">citit</span>`
    : `<span class="nx-status-pill danger">necitit</span>`;
  const resolutionBadge = ticket.status === "rezolvat"
    ? `<span class="nx-status-pill success">rezolvat</span>`
    : `<span class="nx-status-pill warn">nerezolvat</span>`;
  const related = [
    ticket.lead_id ? `Lead #${ticket.lead_id}${ticket.lead_name ? ` · ${ticket.lead_name}` : ""}` : "",
    ticket.property_id ? `Property #${ticket.property_id}${ticket.property_name ? ` · ${ticket.property_name}` : ""}` : "",
    ticket.inquiry_id ? `Cerere #${ticket.inquiry_id}` : ""
  ].filter(Boolean).join("<br>") || "-";
  const threadHtml = messages.length ? messages.map((message) => {
    const direction = String(message.direction || "").toLowerCase();
    const isOutbound = direction === "outbound";
    const isFailed = direction === "outbound_failed" || direction === "bounce";
    const isInbound = !isOutbound && !isFailed;
    const label = isOutbound ? "Trimis de noi" : isFailed ? "Eroare email" : "Primit de la proprietar";
    const tone = isOutbound ? "success" : isFailed ? "danger" : "warn";
    const align = isOutbound ? "margin-left:auto;background:#ecfdf5;border-color:#99f6e4" : isFailed ? "background:#fff1f2;border-color:#fecaca" : "background:#fff;border-color:#e2e8f0";
    const displayText = isOutbound || isFailed
      ? String(message.text_body || "")
      : stripQuotedEmailText(message.text_body || "");
    const body = escapeHtml(displayText).replace(/\n/g, "<br>");
    const languageBadge = isInbound && message.detected_language_name
      ? `<span class="nx-status-pill warn">${escapeHtml(message.detected_language_name)}</span>`
      : "";
    const translationHtml = isInbound && message.translation_ro
      ? `<div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px">
          <div class="nx-table-sub" style="margin-bottom:6px;font-weight:900">Traducere în română</div>
          <div style="font-size:13px;line-height:1.65;color:#0f172a;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">${escapeHtml(message.translation_ro).replace(/\n/g, "<br>")}</div>
        </div>`
      : isInbound && message.translation_status === "already_ro"
        ? `<div class="nx-table-sub" style="margin-top:10px">Mesaj detectat ca română.</div>`
        : "";
    return `
      <div class="nx-content-card" style="max-width:820px;${align}">
        <div class="nx-section-head" style="margin-bottom:10px">
          <div>
            <div>${statusBadge(label)} ${languageBadge} ${message.email_message_id ? `<span class="nx-table-sub">email #${escapeHtml(message.email_message_id)}</span>` : ""}</div>
            <h2 style="font-size:16px;margin-top:8px">${escapeHtml(message.subject || ticket.subject || "(fără subiect)")}</h2>
            <p>${escapeHtml(dateValue(message.activity_at || message.created_at) || "-")} · ${escapeHtml(shortText(message.from_email || "-", 90))} → ${escapeHtml(shortText(message.to_email || "-", 90))}</p>
          </div>
          <span class="nx-status-pill ${tone}">${escapeHtml(label)}</span>
        </div>
        <div style="font-size:13px;line-height:1.65;color:#334155;white-space:normal">${body || "<span class=\"nx-muted\">Fără conținut text.</span>"}</div>
        ${translationHtml}
      </div>
    `;
  }).join("") : `<div class="nx-content-card">Nu există mesaje pe acest ticket.</div>`;
  const replyDraftText = replyDraft?.translated || "";
  const replyDraftSource = replyDraft?.sourceRo || "";
  const replyLanguageLabel = `${replyLanguage.name || replyLanguage.code || "limba clientului"}${replyLanguage.code ? ` (${replyLanguage.code})` : ""}`;
  const translationNotice = translationAvailable
    ? `<div class="nx-empty-state">Traducerile sunt generate automat cu ${escapeHtml(translationProvider)} când deschizi ticketul. Poți forța retraducerea dacă mesajul s-a schimbat.</div>`
    : `<div class="nx-alert danger">GOOGLE_TRANSLATE_API_KEY nu este configurat. Mesajele rămân vizibile în original, dar traducerea automată nu poate porni.</div>`;
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(ticket.ticket_number || `Ticket #${ticket.id || ""}`)} · ${escapeHtml(ticket.subject || "Support Trevoro")}</h1>
          <p>${readBadge} ${resolutionBadge} ${statusBadge(ticket.status)} · Ultima activitate: ${escapeHtml(dateValue(ticket.last_activity_at || ticket.updated_at || ticket.created_at) || "-")}</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/support">Înapoi la inbox</a>
          <form method="post" action="/nexora/travel/support/${escapeHtml(ticket.id)}/resolution" class="nx-inline-form compact">
            <input type="hidden" name="return_to" value="detail">
            <input type="hidden" name="resolution_status" value="${ticket.status === "rezolvat" ? "unresolved" : "resolved"}">
            <button class="nx-btn ${ticket.status === "rezolvat" ? "" : "primary"}" type="submit">${ticket.status === "rezolvat" ? "Redeschide" : "Rezolvat"}</button>
          </form>
        </div>
      </div>
      <div class="nx-kpi-grid">
        <div class="nx-kpi-card"><span>Requester</span><b style="font-size:15px">${escapeHtml(shortText(ticket.requester_email || "-", 42))}</b></div>
        <div class="nx-kpi-card"><span>Țară</span><b>${escapeHtml(ticket.country || "-")}</b></div>
        <div class="nx-kpi-card"><span>Legături</span><b style="font-size:14px">${related}</b></div>
        <div class="nx-kpi-card"><span>Deschis</span><b>${escapeHtml(dateValue(ticket.opened_at) || "-")}</b></div>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Răspunde din Nexora</h1><p>Scrie în română, traduce în ${escapeHtml(replyLanguageLabel)}, apoi trimite mesajul tradus.</p></div>
        <form method="post" action="/nexora/travel/support/${escapeHtml(ticket.id)}/translate" class="nx-inline-form compact">
          <input type="hidden" name="force" value="1">
          <button class="nx-btn" type="submit">Retradu conversația</button>
        </form>
      </div>
      ${translationNotice}
      <form method="post" action="/nexora/travel/support/${escapeHtml(ticket.id)}/reply-draft" class="nx-form" style="margin-top:12px">
        <label class="nx-field nx-field-wide"><span>Draft în română</span><textarea name="message_ro" rows="5" placeholder="Scrie răspunsul în română, apoi apasă traducere...">${escapeHtml(replyDraftSource)}</textarea></label>
        <div class="nx-form-actions">
          <button class="nx-btn" type="submit">Tradu în ${escapeHtml(replyLanguageLabel)}</button>
        </div>
      </form>
      <form method="post" action="/nexora/travel/support/${escapeHtml(ticket.id)}/reply" class="nx-form">
        <input type="hidden" name="reply_language" value="${escapeHtml(replyLanguage.code || "ro")}">
        <label class="nx-field nx-field-wide"><span>Mesaj de trimis (${escapeHtml(replyLanguageLabel)})</span><textarea name="message" required rows="7" placeholder="Textul tradus sau mesajul final de trimis...">${escapeHtml(replyDraftText)}</textarea></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Trimite răspuns</button>
        </div>
      </form>
      <form method="post" action="/nexora/travel/support/${escapeHtml(ticket.id)}/status" class="nx-inline-form compact" style="margin-top:12px">
        <input type="hidden" name="return_to" value="detail">
        <select name="status">${statusOptions(statuses, ticket.status)}</select>
        <button class="nx-btn" type="submit">Salvează status</button>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Conversație</h1><p>Fir cronologic: emailurile trimise de noi și răspunsurile primite de la proprietar.</p></div>
      </div>
      <div style="display:grid;gap:12px">${threadHtml}</div>
    </section>
  `;
  return shell({ title: "Ticket Support", activePath: "/nexora/travel/support", companyName, user: options.user, body });
}

function renderNexoraTravelImportsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const report = options.report || null;
  const preview = options.preview || null;
  const errors = Array.isArray(report?.errors) ? report.errors : [];
  const errorRows = rowsOrEmpty(errors, 2, (row) => `
    <tr>
      <td>${escapeHtml(row.line || "-")}</td>
      <td>${escapeHtml(row.message || "-")}</td>
    </tr>
  `, "Nu există erori pentru importul curent.");
  const reportRows = Array.isArray(report?.rows) ? report.rows : [];
  const reportDetailRows = rowsOrEmpty(reportRows.slice(0, 50), 5, (row) => `
    <tr>
      <td>${escapeHtml(row.line || "-")}</td>
      <td>${escapeHtml(row.action || "-")}</td>
      <td>${escapeHtml(row.reason || "-")}</td>
      <td>${escapeHtml(row.name || "-")}</td>
      <td>${escapeHtml(row.city || "-")}</td>
    </tr>
  `, "Nu există rânduri în raport.");
  const reportHtml = report ? `
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">R</div><div><div class="nx-kpi-label">Rânduri import</div><div class="nx-kpi-value">${escapeHtml(report.totalRows || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">C</div><div><div class="nx-kpi-label">Create</div><div class="nx-kpi-value">${escapeHtml(report.created || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">D</div><div><div class="nx-kpi-label">Skipped duplicates</div><div class="nx-kpi-value">${escapeHtml(report.skippedDuplicates || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">E</div><div><div class="nx-kpi-label">Errors</div><div class="nx-kpi-value">${escapeHtml(errors.length)}</div></div></div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Raport import</h1><p>${escapeHtml(options.importedFileName || "Import finalizat")}</p></div>
        ${options.reportToken ? `<a class="nx-btn" href="/nexora/travel/imports/report.csv?token=${escapeHtml(options.reportToken)}">Export raport CSV</a>` : ""}
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Linie</th><th>Eroare</th></tr></thead>
          <tbody>${errorRows}</tbody>
        </table>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Linie</th><th>Acțiune</th><th>Motiv</th><th>Name</th><th>City</th></tr></thead>
          <tbody>${reportDetailRows}</tbody>
        </table>
      </div>
    </section>
  ` : "";
  const previewRows = preview?.rows?.length
    ? preview.rows.slice(0, 20).map((row) => `
      <tr>
        <td>${escapeHtml(row.line || "-")}</td>
        ${(preview.headers || []).map((header) => `<td>${escapeHtml(row.values?.[header.index] || "")}</td>`).join("")}
      </tr>
    `).join("")
    : "";
  const previewHtml = preview ? `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Preview import</h1>
          <p>${escapeHtml(preview.fileName || "import")} · ${escapeHtml(String(preview.rows?.length || 0))} rânduri detectate · primele 20 afișate</p>
        </div>
      </div>
      <form method="post" action="/nexora/travel/imports/confirm" class="nx-form">
        <input type="hidden" name="import_token" value="${escapeHtml(preview.token || "")}">
        <div class="nx-two-column-grid">
          ${IMPORT_COLUMNS.map(([column, label]) => `
            <label class="nx-field">
              <span>${escapeHtml(label)}</span>
              ${importColumnSelect(column, preview.headers || [], preview.mapping || {})}
            </label>
          `).join("")}
        </div>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Confirmă import</button>
          <a class="nx-btn" href="/nexora/travel/imports">Renunță</a>
        </div>
      </form>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead>
            <tr>
              <th>Linie</th>
              ${(preview.headers || []).map((header) => `<th>${escapeHtml(header.label || "-")}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${previewRows || emptyRows((preview.headers || []).length + 1, "Nu există rânduri pentru preview.")}</tbody>
        </table>
      </div>
    </section>
  ` : "";
  const body = `
    ${reportHtml}
    ${previewHtml}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Import CSV / XLSX</h1><p>Încarcă fișierul, verifică preview-ul, apoi confirmă mapping-ul coloanelor.</p></div></div>
      <form method="post" action="/nexora/travel/imports" enctype="multipart/form-data" class="nx-inline-form">
        <label class="nx-field nx-field-wide"><span>Fișier</span><input type="file" name="csv_file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Preview import</button></div>
      </form>
      <div class="nx-empty-state">Coloane acceptate: name, property_type, country, city, county, address, phone, email, website, facebook, instagram, source. Opțional, google_reviews poate fi folosit pentru scor.</div>
    </section>
  `;
  return shell({ title: "Importuri", activePath: "/nexora/travel/imports", companyName, user: options.user, body });
}

function renderNexoraTravelContentFactoryPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const properties = Array.isArray(options.properties) ? options.properties : [];
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const articles = Array.isArray(options.articles) ? options.articles : [];
  const posts = Array.isArray(options.posts) ? options.posts : [];
  const stats = options.stats || {};
  const propertyOptions = properties.map((property) => `
    <option value="${escapeHtml(property.id)}">${escapeHtml(property.name || "-")} · ${escapeHtml(property.city || "-")}</option>
  `).join("");
  const jobRows = rowsOrEmpty(jobs, 6, (row) => `
    <tr>
      <td>${escapeHtml(contentTypeLabel(row.job_type))}</td>
      <td>${escapeHtml(row.property_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.model || "-")}</td>
      <td>${escapeHtml(shortText(row.result_summary || row.error || "-", 120))}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
    </tr>
  `, "Nu există joburi de conținut încă.");
  const articleRows = rowsOrEmpty(articles, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.title || "-")}</b><div class="nx-table-sub">${escapeHtml(row.slug || "-")}</div></td>
      <td>${escapeHtml(row.property_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(shortText(row.meta_description || row.content || "-", 130))}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
    </tr>
  `, "Nu există articole SEO generate.");
  const postRows = rowsOrEmpty(posts, 5, (row) => `
    <tr>
      <td>${escapeHtml(platformLabel(row.platform))}<div class="nx-table-sub">${escapeHtml(contentTypeLabel(row.content_type))}</div></td>
      <td>${escapeHtml(row.property_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(shortText(row.caption || "-", 150))}<div class="nx-table-sub">${escapeHtml(row.hashtags || "")}</div></td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
    </tr>
  `, "Nu există postări generate.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-kpi-grid">
      <div class="nx-kpi-card"><div class="nx-kpi-icon blue">P</div><div><div class="nx-kpi-label">Proprietăți active</div><div class="nx-kpi-value">${escapeHtml(stats.properties || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon green">A</div><div><div class="nx-kpi-label">Articole SEO</div><div class="nx-kpi-value">${escapeHtml(stats.articles || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon purple">S</div><div><div class="nx-kpi-label">Social posts</div><div class="nx-kpi-value">${escapeHtml(stats.posts || 0)}</div></div></div>
      <div class="nx-kpi-card"><div class="nx-kpi-icon orange">J</div><div><div class="nx-kpi-label">Joburi generate</div><div class="nx-kpi-value">${escapeHtml(stats.jobs || 0)}</div></div></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Travel Content Factory</h1><p>Generează draft-uri pentru SEO, Facebook, Instagram, TikTok și newsletter pe baza unei proprietăți.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/social-posts">Social Posts</a>
          <a class="nx-btn" href="/nexora/travel/seo-pages">SEO Pages</a>
        </div>
      </div>
      <form method="post" action="/nexora/travel/content-factory/generate" class="nx-form">
        <label class="nx-field nx-field-wide">
          <span>Proprietate</span>
          <select name="property_id" required>
            <option value="">Alege proprietatea</option>
            ${propertyOptions}
          </select>
        </label>
        <div class="nx-two-column-grid">
          ${Object.entries(CONTENT_TYPE_LABELS).map(([type, label]) => `
            <label class="nx-field">
              <span>${escapeHtml(label)}</span>
              <select name="content_${escapeHtml(type)}">
                <option value="1">Generează</option>
                <option value="">Omite</option>
              </select>
            </label>
          `).join("")}
        </div>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Generează conținut</button></div>
      </form>
      <div class="nx-empty-state">Dacă OPENAI_API_KEY este configurat, se folosește OpenAI API. Altfel, Nexora salvează draft-uri locale pentru fluxul de lucru.</div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Joburi recente</h1><p>Istoricul generărilor de conținut pentru proprietăți Travel.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Tip</th><th>Proprietate</th><th>Status</th><th>Model</th><th>Rezumat</th><th>Creat</th></tr></thead>
          <tbody>${jobRows}</tbody>
        </table>
      </div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Articole SEO recente</h1><p>Draft-uri salvate în travel_blog_articles.</p></div></div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead><tr><th>Articol</th><th>Proprietate</th><th>Status</th><th>Meta</th><th>Creat</th></tr></thead>
            <tbody>${articleRows}</tbody>
          </table>
        </div>
      </section>
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Postări recente</h1><p>Draft-uri salvate în travel_social_posts.</p></div></div>
        <div class="nx-table-wrap">
          <table class="nx-table">
            <thead><tr><th>Platformă</th><th>Proprietate</th><th>Status</th><th>Conținut</th><th>Creat</th></tr></thead>
            <tbody>${postRows}</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
  return shell({ title: "Travel Content Factory", activePath: "/nexora/travel/content-factory", companyName, user: options.user, body });
}

function renderNexoraTravelSocialPostsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
	    const posts = Array.isArray(options.posts) ? options.posts : [];
	    const accounts = Array.isArray(options.accounts) ? options.accounts : [];
	    const publishJobs = Array.isArray(options.publishJobs) ? options.publishJobs : [];
	    const facebookConfig = options.facebookConfig || {};
	    const tiktokConfig = options.tiktokConfig || {};
	    const accountCards = accounts.map((account) => {
	      const isFacebook = account.platform === "facebook";
	      const isTikTok = account.platform === "tiktok";
	      const tokenCopy = account.has_access_token ? "Token salvat. Lasă gol ca să îl păstrezi." : isFacebook ? "OAuth recomandat; token manual doar ca rezervă." : "Adaugă token pentru publicare automată.";
	      const connectAction = isFacebook
	        ? `<a class="nx-btn ${facebookConfig.configured ? "primary" : ""}" href="/oauth/facebook/start">${account.has_access_token ? "Reconectează Facebook" : "Conectează Facebook"}</a>`
	        : isTikTok
	        ? `<a class="nx-btn ${tiktokConfig.configured ? "primary" : ""}" href="/oauth/tiktok/start">${account.has_access_token ? "Reconectează TikTok" : "Conectează TikTok"}</a>`
	        : "";
	      const facebookMeta = isFacebook
	        ? `<div class="nx-empty-state">OAuth Facebook: ${facebookConfig.configured ? "configurat" : "incomplet"} · Redirect: ${escapeHtml(facebookConfig.redirectUri || "-")} · Scopes: ${escapeHtml((facebookConfig.scopes || []).join(", ") || "-")}</div>`
	        : "";
	      const tiktokMeta = isTikTok
	        ? `<div class="nx-empty-state">OAuth: ${tiktokConfig.configured ? "configurat" : "incomplet"} · Redirect: ${escapeHtml(tiktokConfig.redirectUri || "-")} · Scopes: ${escapeHtml((tiktokConfig.scopes || []).join(", ") || "-")}</div>`
	        : "";
    return `
      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>${escapeHtml(platformLabel(account.platform))}</h1>
            <p>${escapeHtml(account.account_handle || "-")} · ${statusBadge(account.status)}</p>
          </div>
          <div class="nx-form-actions">${connectAction}</div>
        </div>
	        ${facebookMeta}
	        ${tiktokMeta}
	        <form method="post" action="/nexora/travel/social-accounts" class="nx-form">
          <input type="hidden" name="platform" value="${escapeHtml(account.platform)}">
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Nume cont</span><input name="account_name" value="${escapeHtml(account.account_name || "")}"></label>
            <label class="nx-field"><span>Handle / URL</span><input name="account_handle" value="${escapeHtml(account.account_handle || "")}"></label>
            <label class="nx-field"><span>${isFacebook ? "Page ID" : "External ID"}</span><input name="${isFacebook ? "page_id" : "external_id"}" value="${escapeHtml(isFacebook ? (account.page_id || account.external_id || "") : (account.external_id || ""))}"></label>
            <label class="nx-field"><span>Status</span><select name="status">
              <option value="setup_required" ${selected(account.status, "setup_required")}>setup required</option>
              <option value="active" ${selected(account.status, "active")}>active</option>
              <option value="paused" ${selected(account.status, "paused")}>paused</option>
            </select></label>
            <label class="nx-field"><span>Mod publicare</span><select name="posting_mode" ${account.platform === "tiktok" ? "disabled" : ""}>
              <option value="api" ${selected(account.posting_mode, "api")}>API oficial</option>
              <option value="draft" ${selected(account.posting_mode, "draft")}>Draft/manual</option>
            </select></label>
            <label class="nx-field"><span>Access token</span><input name="access_token" type="password" placeholder="${escapeHtml(tokenCopy)}"></label>
          </div>
          ${isTikTok ? `
            <input type="hidden" name="posting_mode" value="draft">
            <label class="nx-field"><span>Scopes salvate</span><input name="scopes" value="${escapeHtml(account.scopes || "")}" readonly></label>
          ` : ""}
          <label class="nx-field"><span><input type="checkbox" name="auto_publish" value="1" ${checked(Number(account.auto_publish || 0) === 1)}> Auto queue pentru postări noi</span></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează cont</button></div>
        </form>
      </section>
    `;
  }).join("");
  const rowsHtml = rowsOrEmpty(posts, 9, (row) => `
    <tr>
      <td>${escapeHtml(platformLabel(row.platform))}</td>
      <td>${escapeHtml(contentTypeLabel(row.content_type))}</td>
      <td>${escapeHtml(row.property_name || "-")}<div class="nx-table-sub">${escapeHtml([row.city, row.county].filter(Boolean).join(" · "))}</div></td>
      <td>${escapeHtml(shortText(row.caption || "-", 220))}</td>
      <td>
        ${socialMediaDisplay(row.media_url)}
        <form method="post" action="/nexora/travel/social-posts/${escapeHtml(row.id)}/media" class="nx-inline-form compact">
          <input name="media_url" value="${escapeHtml(row.media_url || "")}" placeholder="https://www.trevoro.ro/video.mp4">
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
      <td>${escapeHtml(row.hashtags || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.publish_status ? statusBadge(row.publish_status) : `<span class="nx-muted">-</span>`}<div class="nx-table-sub">${escapeHtml(shortText(row.publish_error || "", 80))}</div></td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
      <td>
        ${["facebook", "tiktok"].includes(String(row.platform || "")) ? `
          <form method="post" action="/nexora/travel/social-posts/${escapeHtml(row.id)}/queue" class="nx-inline-form compact">
            <input type="datetime-local" name="scheduled_at" value="">
            <button class="nx-btn" type="submit">Pune în coadă</button>
          </form>
        ` : `<span class="nx-muted">-</span>`}
      </td>
    </tr>
  `, "Nu există postări generate.");
  const jobRows = rowsOrEmpty(publishJobs, 8, (row) => `
    <tr>
      <td>${escapeHtml(platformLabel(row.platform))}</td>
      <td>${escapeHtml(row.account_name || "-")}<div class="nx-table-sub">${escapeHtml(row.account_handle || "")}</div></td>
      <td>${escapeHtml(row.property_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.scheduled_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.published_at) || "-")}</td>
      <td>${escapeHtml(row.external_post_id || "-")}</td>
      <td>${escapeHtml(shortText(row.error || "-", 140))}</td>
    </tr>
  `, "Nu există joburi de publicare.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Social Posts</h1><p>Draft-uri, coadă de publicare și conturi conectate pentru Trevoro România.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/social-campaign">Campanie 14 zile</a>
          <a class="nx-btn" href="/nexora/travel/content-factory">Generează</a>
          <form method="post" action="/nexora/travel/social-posts/process">
            <button class="nx-btn primary" type="submit">Procesează coada</button>
          </form>
        </div>
      </div>
	      <div class="nx-empty-state">Facebook publică automat prin Meta Graph API după conectarea paginii sau după salvarea unui Page Access Token. TikTok folosește Content Posting API cu upload draft prin <code>video.upload</code>; utilizatorul finalizează postarea din TikTok.</div>
	    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Campanie manuală Trevoro</h1>
          <p>Texte gata de copiat pentru Facebook, profil personal, grupuri și TikTok/Reels, fără cont developer.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn primary" href="/nexora/travel/social-campaign">Deschide butoanele de copiere</a>
        </div>
      </div>
	      <div class="nx-empty-state">Folosește această campanie în Meta Business Suite ca variantă de rezervă când API-ul este neconfigurat sau o postare are nevoie de verificare manuală.</div>
    </section>

    <div class="nx-two-column-grid">
      ${accountCards}
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Postări</h1><p>Postări generate pentru Facebook și TikTok, pregătite pentru publicare.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Platformă</th><th>Tip</th><th>Proprietate</th><th>Conținut</th><th>Media</th><th>Hashtags</th><th>Status</th><th>Publicare</th><th>Creat</th><th>Acțiune</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Publishing Queue</h1><p>Istoric și status pentru încercările de publicare.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Platformă</th><th>Cont</th><th>Proprietate</th><th>Status</th><th>Programat</th><th>Publicat</th><th>External ID</th><th>Eroare</th></tr></thead>
          <tbody>${jobRows}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Social Posts", activePath: "/nexora/travel/social-posts", companyName, user: options.user, body });
}

function renderFacebookLeadBadge(value = "", type = "neutral") {
  const normalized = String(value || "").replaceAll("_", " ");
  const tone = {
    created: "success",
    linked: "success",
    duplicate: "warn",
    irrelevant: "neutral",
    needs_review: "warn",
    task_created: "success",
    pending_manual: "warn",
    messenger_done: "success",
    phone_done: "success",
    email_done: "success",
    skipped: "neutral"
  }[value] || type;
  return `<span class="nx-status-pill ${tone}">${escapeHtml(normalized || "-")}</span>`;
}

function renderNexoraTravelFacebookLeadsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const stats = options.stats || {};
  const filters = options.filters || {};
  const recentSearches = Array.isArray(options.recentSearches) ? options.recentSearches : [];
  const expressions = Array.isArray(options.expressions) ? options.expressions : [
    "cabană",
    "pensiune",
    "vilă turistică",
    "hotel",
    "apartamente în regim hotelier"
  ];
  const okMessages = {
    facebook_search_done: `Căutarea a fost salvată: ${dashboardNumber(options.searchStats?.created || 0)} noi, ${dashboardNumber(options.searchStats?.duplicates || 0)} duplicate, ${dashboardNumber(options.searchStats?.irrelevant || 0)} nerelevante.`,
    facebook_import_done: `Importul a fost procesat: ${dashboardNumber(options.searchStats?.created || 0)} noi, ${dashboardNumber(options.searchStats?.duplicates || 0)} duplicate, ${dashboardNumber(options.searchStats?.irrelevant || 0)} nerelevante.`,
    facebook_task_created: "Taskul manual a fost creat.",
    facebook_status_saved: "Statusul a fost salvat."
  };
  const errMessages = {
    facebook_token_missing: "Tokenul Facebook pentru căutare pagini lipsește sau nu are acces.",
    facebook_search_failed: "Căutarea Facebook nu a putut fi finalizată.",
    facebook_import_empty: "Nu am găsit rânduri valide în import.",
    facebook_missing_lead: "Leadul Facebook nu a fost găsit.",
    facebook_task_failed: "Taskul nu a putut fi creat.",
    facebook_status_failed: "Statusul nu a putut fi salvat."
  };
  const flashHtml = [
    options.ok ? `<div class="nx-alert success">${escapeHtml(okMessages[options.ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    options.err ? `<div class="nx-alert danger">${escapeHtml(errMessages[options.err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
  const expressionOptions = expressions.map((expression) => `
    <option value="${escapeHtml(expression)}" ${selected(filters.query, expression)}>${escapeHtml(expression)}</option>
  `).join("");
  const contactStatuses = ["pending_manual", "task_created", "messenger_done", "phone_done", "email_done", "skipped"];
  const rowsHtml = rowsOrEmpty(rows, 8, (row) => {
    const leadId = Number(row.travel_lead_id || row.duplicate_travel_lead_id || 0);
    const hasLead = leadId > 0;
    const pageUrl = row.facebook_url || "";
    const website = row.website || "";
    const contactPieces = [
      row.email ? `<div>${escapeHtml(row.email)}</div>` : "",
      row.phone ? `<div>${escapeHtml(row.phone)}</div>` : "",
      website ? `<div><a class="nx-table-main-link" href="${escapeHtml(website.startsWith("http") ? website : `https://${website}`)}" target="_blank" rel="noreferrer">${escapeHtml(website)}</a></div>` : ""
    ].filter(Boolean).join("") || `<span class="nx-table-sub">fără contact public</span>`;
    const taskDisabled = hasLead ? "" : "disabled";
    return `
      <tr>
        <td>
          <b>${escapeHtml(row.property_name || row.page_name || "-")}</b>
          ${pageUrl ? `<div class="nx-table-sub"><a class="nx-table-main-link" href="${escapeHtml(pageUrl)}" target="_blank" rel="noreferrer">Pagina Facebook</a></div>` : ""}
          ${row.category ? `<div class="nx-table-sub">${escapeHtml(row.category)}</div>` : ""}
        </td>
        <td>
          ${renderFacebookLeadBadge(row.classification || "needs_review", row.classification === "nerelevanta" ? "neutral" : "success")}
          <div class="nx-table-sub">${escapeHtml(row.classification_reason || "-")}</div>
        </td>
        <td>
          <b>${escapeHtml(row.city || "-")}</b>
          <div class="nx-table-sub">${escapeHtml([row.county, row.country].filter(Boolean).join(", ") || "-")}</div>
        </td>
        <td>${contactPieces}</td>
        <td>
          ${renderFacebookLeadBadge(row.dedupe_status || "needs_review")}
          ${hasLead ? `<div class="nx-table-sub"><a class="nx-table-main-link" href="/nexora/travel/leads/${leadId}">Lead CRM #${escapeHtml(leadId)}</a></div>` : ""}
          ${row.duplicate_reason ? `<div class="nx-table-sub">${escapeHtml(row.duplicate_reason)}</div>` : ""}
        </td>
        <td>
          ${renderFacebookLeadBadge(row.contact_status || "pending_manual")}
          ${row.task_created_at ? `<div class="nx-table-sub">Task: ${escapeHtml(dateValue(row.task_created_at))}</div>` : ""}
        </td>
        <td>
          <details>
            <summary>Mesaj colaborare</summary>
            <textarea rows="8" readonly style="min-width:300px;margin-top:8px">${escapeHtml(row.collaboration_message || "")}</textarea>
          </details>
        </td>
        <td>
          <div class="nx-form-actions" style="justify-content:flex-start">
            <form method="post" action="/nexora/travel/facebook-leads/${escapeHtml(row.id || "")}/task">
              <button class="nx-btn primary" type="submit" ${taskDisabled}>Task</button>
            </form>
            <form method="post" action="/nexora/travel/facebook-leads/${escapeHtml(row.id || "")}/status">
              <select name="contact_status">${statusOptions(contactStatuses, row.contact_status || "pending_manual")}</select>
              <button class="nx-btn" type="submit">Salvează</button>
            </form>
          </div>
        </td>
      </tr>
    `;
  }, "Nu există leaduri Facebook salvate încă.");
  const searchesHtml = rowsOrEmpty(recentSearches, 6, (row) => `
    <tr>
      <td><b>${escapeHtml(row.query || "-")}</b><div class="nx-table-sub">${escapeHtml(row.location || "-")}</div></td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td>${renderFacebookLeadBadge(row.status || "-")}</td>
      <td>${dashboardNumber(row.results_found || 0)} rezultate</td>
      <td>${dashboardNumber(row.created_count || 0)} noi · ${dashboardNumber(row.duplicate_count || 0)} duplicate</td>
      <td>${escapeHtml(dateValue(row.created_at))}</td>
    </tr>
  `, "Nu există căutări recente.");
  const body = `
    ${flashHtml}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Facebook Property Leads</h1>
          <p>Facebook → Nexora CRM → contactare controlată. Nu se trimit mesaje automat din acest modul.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/leads?source=facebook_property_leads">Vezi în CRM</a>
          <a class="nx-btn" href="/nexora/travel/outreach">Outreach</a>
        </div>
      </div>
      <div class="nx-metric-grid">
        <div class="nx-metric-card"><span>Total</span><strong>${dashboardNumber(stats.total || 0)}</strong><small>pagini salvate</small></div>
        <div class="nx-metric-card"><span>Noi CRM</span><strong>${dashboardNumber(stats.created || 0)}</strong><small>în pipeline Trevoro</small></div>
        <div class="nx-metric-card"><span>Duplicate</span><strong>${dashboardNumber(stats.duplicates || 0)}</strong><small>față de contactele existente</small></div>
        <div class="nx-metric-card"><span>Taskuri</span><strong>${dashboardNumber(stats.tasks || 0)}</strong><small>contactare manuală</small></div>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Caută pagini</h1><p>Se folosesc API-ul Facebook și doar date publice permise.</p></div></div>
      <form method="post" action="/nexora/travel/facebook-leads/search" class="nx-filter-grid">
        <label class="nx-field"><span>Expresie</span><select name="query">${expressionOptions}</select></label>
        <label class="nx-field"><span>Localitate</span><input name="location" value="${escapeHtml(filters.location || "")}" placeholder="ex. Mamaia Nord"></label>
        <label class="nx-field"><span>Categorie</span><input name="category" value="${escapeHtml(filters.category || "")}" placeholder="ex. hotel, pensiune"></label>
        <label class="nx-field"><span>Denumire conține</span><input name="name_filter" value="${escapeHtml(filters.name || "")}" placeholder="opțional"></label>
        <label class="nx-field"><span>Limită</span><input type="number" min="1" max="50" name="limit" value="${escapeHtml(filters.limit || 10)}"></label>
        <div class="nx-field"><span>Clasificare</span><label class="nx-check-field"><input type="checkbox" name="ai_classify" value="1" checked><span>AI / fallback local</span></label></div>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Caută</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Import controlat</h1><p>Fallback când API-ul Facebook nu returnează căutarea publică.</p></div></div>
      <form method="post" action="/nexora/travel/facebook-leads/import" class="nx-stack">
        <textarea name="csv_text" rows="7" placeholder="name,facebook_url,city,county,category,website,phone,email"></textarea>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Procesează importul</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Filtre</h1><p>Localitate, categorie, denumire și status.</p></div></div>
      <form method="get" action="/nexora/travel/facebook-leads" class="nx-filter-grid">
        <label class="nx-field"><span>Caută</span><input name="q" value="${escapeHtml(filters.q || "")}" placeholder="nume, oraș, website"></label>
        <label class="nx-field"><span>Localitate</span><input name="city" value="${escapeHtml(filters.city || "")}"></label>
        <label class="nx-field"><span>Categorie</span><input name="category" value="${escapeHtml(filters.categoryFilter || "")}"></label>
        <label class="nx-field"><span>Dedupe</span><select name="dedupe_status">${statusOptions(["created", "linked", "duplicate", "irrelevant", "needs_review"], filters.dedupe_status || "", "toate")}</select></label>
        <label class="nx-field"><span>Contact</span><select name="contact_status">${statusOptions(contactStatuses, filters.contact_status || "", "toate")}</select></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Aplică</button><a class="nx-btn" href="/nexora/travel/facebook-leads">Reset</a></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Leaduri Facebook</h1><p>Deduplicare, mesaj generat și task manual pentru fiecare proprietate relevantă.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Proprietate</th><th>Clasificare</th><th>Localitate</th><th>Contact public</th><th>CRM</th><th>Task</th><th>Mesaj</th><th>Acțiuni</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Căutări recente</h1><p>Audit pentru ultimele rulări Facebook Property Leads.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Expresie / localitate</th><th>Categorie</th><th>Status</th><th>Rezultate</th><th>CRM</th><th>Data</th></tr></thead>
          <tbody>${searchesHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Facebook Property Leads", activePath: "/nexora/travel/facebook-leads", companyName, user: options.user, body });
}

function renderNexoraTravelSocialGroupsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const groups = Array.isArray(options.groups) ? options.groups : [];
  const summary = options.summary || {};
  const joinStatuses = ["de_verificat", "requested", "joined", "rejected", "left"];
  const ruleStatuses = ["de_verificat", "permis", "interzis", "doar_recomandari", "fara_linkuri"];
  const okMessages = {
    group_saved: "Grupul social a fost salvat."
  };
  const errMessages = {
    name_required: "Completeaza numele grupului.",
    invalid: "Datele grupului nu sunt valide.",
    missing: "Grupul nu a fost gasit.",
    group_failed: "Grupul nu a putut fi salvat."
  };
  const flashHtml = [
    options.ok ? `<div class="nx-alert success">${escapeHtml(okMessages[options.ok] || "Operatiunea a fost finalizata.")}</div>` : "",
    options.err ? `<div class="nx-alert danger">${escapeHtml(errMessages[options.err] || "Operatiunea nu a putut fi finalizata.")}</div>` : ""
  ].join("");
  const rowsHtml = rowsOrEmpty(groups, 11, (row) => {
    const formId = `social-group-${escapeHtml(row.id || "")}`;
    return `
    <tr>
      <td>
        <input form="${formId}" name="name" value="${escapeHtml(row.name || "")}" style="min-width:220px">
        <input form="${formId}" name="category" value="${escapeHtml(row.category || "")}" placeholder="categorie" style="margin-top:6px;min-width:220px">
      </td>
      <td>
        <input form="${formId}" name="country" value="${escapeHtml(row.country || "")}" placeholder="tara" style="width:120px">
        <input form="${formId}" name="language" value="${escapeHtml(row.language || "")}" placeholder="limba" style="width:70px;margin-top:6px">
      </td>
      <td><input form="${formId}" type="number" min="0" name="members_count" value="${escapeHtml(row.members_count || 0)}" style="width:110px"></td>
      <td><select form="${formId}" name="join_status">${statusOptions(joinStatuses, row.join_status || "de_verificat")}</select></td>
      <td><select form="${formId}" name="rules_status">${statusOptions(ruleStatuses, row.rules_status || "de_verificat")}</select></td>
      <td>
        <input form="${formId}" type="hidden" name="promotion_allowed" value="0">
        <label class="nx-check-field"><input form="${formId}" type="checkbox" name="promotion_allowed" value="1" ${checked(Number(row.promotion_allowed || 0) === 1)}><span>Permis</span></label>
      </td>
      <td>
        <input form="${formId}" name="url" value="${escapeHtml(row.url || "")}" placeholder="https://facebook.com/groups/..." style="min-width:240px">
        ${row.url ? `<div class="nx-table-sub"><a class="nx-table-main-link" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">Deschide link</a></div>` : ""}
      </td>
      <td><input form="${formId}" type="date" name="last_post_at" value="${escapeHtml(String(row.last_post_at || "").slice(0, 10))}" style="width:140px"></td>
      <td><input form="${formId}" name="result" value="${escapeHtml(row.result || "")}" placeholder="rezultat" style="min-width:180px"></td>
      <td><input form="${formId}" name="notes" value="${escapeHtml(row.notes || "")}" placeholder="note/reguli" style="min-width:220px"></td>
      <td>
        <form id="${formId}" method="post" action="/nexora/travel/social-groups/${escapeHtml(row.id || "")}">
          <button class="nx-btn primary" type="submit">Salveaza</button>
        </form>
      </td>
    </tr>
  `;
  }, "Nu exista grupuri in registru.");
  const body = `
    ${flashHtml}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Grupuri Social</h1>
          <p>Registru pentru grupuri Facebook si comunitati unde verificam regulile inainte de postare.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/travel/social-posts">Social Posts</a>
          <a class="nx-btn primary" href="/nexora/travel/social-groups/export.csv">Export CSV</a>
        </div>
      </div>
      <div class="nx-metric-grid">
        <div class="nx-metric-card"><span>Total</span><strong>${dashboardNumber(summary.total || 0)}</strong><small>grupuri / cautari</small></div>
        <div class="nx-metric-card"><span>De verificat</span><strong>${dashboardNumber(summary.toVerify || 0)}</strong><small>reguli si status join</small></div>
        <div class="nx-metric-card"><span>Promovare permisa</span><strong>${dashboardNumber(summary.allowed || 0)}</strong><small>doar dupa validare manuala</small></div>
        <div class="nx-metric-card"><span>Join facut</span><strong>${dashboardNumber(summary.joined || 0)}</strong><small>manual, fara automatizare</small></div>
      </div>
      <div class="nx-empty-state">Regula: nu automatizam join sau postari in grupuri externe. Nexora pregateste text, galerie, link UTM si variante RO/EN/IT/FR/DE; postam doar unde regulile permit.</div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Adauga grup / cautare</h1><p>Pastreaza aici comunitatile verificate inainte de postare.</p></div></div>
      <form method="post" action="/nexora/travel/social-groups" class="nx-filter-grid">
        <label class="nx-field"><span>Nume</span><input name="name" placeholder="ex. Cazare Romania - grup"></label>
        <label class="nx-field"><span>Tara</span><input name="country" placeholder="Romania"></label>
        <label class="nx-field"><span>Limba</span><input name="language" placeholder="ro"></label>
        <label class="nx-field"><span>Membri</span><input type="number" min="0" name="members_count" value="0"></label>
        <label class="nx-field"><span>Categorie</span><input name="category" placeholder="travel_ro"></label>
        <label class="nx-field" style="min-width:320px"><span>Link</span><input name="url" placeholder="https://www.facebook.com/groups/..."></label>
        <label class="nx-field"><span>Join</span><select name="join_status">${statusOptions(joinStatuses, "de_verificat")}</select></label>
        <label class="nx-field"><span>Reguli</span><select name="rules_status">${statusOptions(ruleStatuses, "de_verificat")}</select></label>
        <div class="nx-field"><span>Promovare</span><label class="nx-check-field"><input type="checkbox" name="promotion_allowed" value="1"><span>Permisa dupa verificare</span></label></div>
        <label class="nx-field"><span>Rezultat</span><input name="result" placeholder="ex. accepta postari saptamanale"></label>
        <label class="nx-field" style="min-width:320px"><span>Note</span><input name="notes" placeholder="reguli, ton recomandat, frecventa"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Adauga</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Registru grupuri</h1><p>Tara, limba, membri, link, status join, reguli, promovare si rezultat.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Grup / cautare</th><th>Tara / limba</th><th>Membri</th><th>Join</th><th>Reguli</th><th>Promovare</th><th>Link</th><th>Ultima postare</th><th>Rezultat</th><th>Note</th><th>Actiuni</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Grupuri Social", activePath: "/nexora/travel/social-groups", companyName, user: options.user, body });
}

function renderNexoraTravelSeoPagesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const articles = Array.isArray(options.articles) ? options.articles : [];
  const properties = Array.isArray(options.properties) ? options.properties : [];
  const articleRows = rowsOrEmpty(articles, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.title || "-")}</b><div class="nx-table-sub">${escapeHtml(row.slug || "-")}</div></td>
      <td>${escapeHtml(row.property_name || "-")}</td>
      <td>${escapeHtml(row.category || "Ghiduri")}</td>
      <td>${escapeHtml(shortText(row.meta_title || "-", 90))}</td>
      <td>${escapeHtml(shortText(row.meta_description || "-", 140))}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.keywords || "-")}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
    </tr>
  `, "Nu există articole SEO generate.");
  const propertyRows = rowsOrEmpty(properties, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.property_type || "-")}</div></td>
      <td>${escapeHtml(row.city || "-")}</td>
      <td>${escapeHtml(row.county || "-")}</td>
      <td><a class="nx-table-main-link" href="/properties/${escapeHtml(row.public_slug || row.id)}" target="_blank" rel="noreferrer">Pagina publică</a></td>
      <td>${escapeHtml(dateValue(row.updated_at) || "-")}</td>
    </tr>
  `, "Nu există proprietăți active pentru pagini publice.");
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>SEO Pages</h1><p>Articole draft și pagini publice de proprietăți cu meta tags și Schema.org.</p></div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/sitemap.xml" target="_blank">Sitemap XML</a>
          <a class="nx-btn primary" href="/nexora/travel/content-factory">Generează articol SEO</a>
        </div>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Articol</th><th>Proprietate</th><th>Categorie</th><th>Meta title</th><th>Meta description</th><th>Status</th><th>Keywords</th><th>Creat</th></tr></thead>
          <tbody>${articleRows}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Pagini publice proprietăți</h1><p>Fiecare proprietate activă are URL public inclus în sitemap.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Proprietate</th><th>City</th><th>County</th><th>URL</th><th>Actualizat</th></tr></thead>
          <tbody>${propertyRows}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "SEO Pages", activePath: "/nexora/travel/seo-pages", companyName, user: options.user, body });
}

function renderNexoraTravelCampaignsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const rowsHtml = rowsOrEmpty(jobs, 7, (row) => `
    <tr>
      <td>${escapeHtml(contentTypeLabel(row.job_type))}</td>
      <td>${escapeHtml(row.property_name || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.model || "-")}</td>
      <td>${escapeHtml(shortText(row.result_summary || row.error || "-", 180))}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.updated_at) || "-")}</td>
    </tr>
  `, "Nu există campanii sau joburi de conținut încă.");
  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div><h1>Campaigns</h1><p>Vedere simplă peste joburile Content Factory și fluxul social conectat la Social Posts.</p></div>
        <a class="nx-btn primary" href="/nexora/travel/content-factory">Generează conținut</a>
      </div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Tip</th><th>Proprietate</th><th>Status</th><th>Model</th><th>Rezumat</th><th>Creat</th><th>Actualizat</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="nx-empty-state">Programarea și publicarea se gestionează din Social Posts. Facebook folosește API oficial; TikTok rămâne draft până la aprobarea Direct Post.</div>
    </section>
  `;
  return shell({ title: "Campaigns", activePath: "/nexora/travel/campaigns", companyName, user: options.user, body });
}

function renderNexoraTravelSettingsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const scoring = options.scoringConfig || {};
  const whatsapp = options.whatsappConfig || {};
  const whatsappWebhookUrl = options.whatsappWebhookUrl || "https://www.trevoro.ro/api/whatsapp/webhook";
  const touristCities = Array.isArray(scoring.tourist_cities)
    ? scoring.tourist_cities.join("\n")
    : String(scoring.tourist_cities || "");
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Lead scoring</h1><p>Reguli automate pentru scor 0-100 și badge Hot/Warm/Cold.</p></div></div>
      <form method="post" action="/nexora/travel/settings/scoring" class="nx-form">
        <div class="nx-two-column-grid">
          <label class="nx-field"><span>Telefon</span><input type="number" min="0" max="100" name="phone_points" value="${escapeHtml(scoring.phone_points ?? 20)}"></label>
          <label class="nx-field"><span>Email</span><input type="number" min="0" max="100" name="email_points" value="${escapeHtml(scoring.email_points ?? 20)}"></label>
          <label class="nx-field"><span>Website</span><input type="number" min="0" max="100" name="website_points" value="${escapeHtml(scoring.website_points ?? 15)}"></label>
          <label class="nx-field"><span>Social media</span><input type="number" min="0" max="100" name="social_points" value="${escapeHtml(scoring.social_points ?? 10)}"></label>
          <label class="nx-field"><span>Google reviews peste 50</span><input type="number" min="0" max="100" name="google_reviews_50_points" value="${escapeHtml(scoring.google_reviews_50_points ?? 10)}"></label>
          <label class="nx-field"><span>Google reviews peste 200</span><input type="number" min="0" max="100" name="google_reviews_200_points" value="${escapeHtml(scoring.google_reviews_200_points ?? 20)}"></label>
          <label class="nx-field"><span>Oraș turistic important</span><input type="number" min="0" max="100" name="tourist_city_points" value="${escapeHtml(scoring.tourist_city_points ?? 10)}"></label>
        </div>
        <label class="nx-field nx-field-wide"><span>Orașe turistice importante</span><textarea name="tourist_cities" rows="7">${escapeHtml(touristCities)}</textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează scoring</button></div>
      </form>
      <div class="nx-empty-state">Badge-uri: Hot Lead peste 70, Warm Lead între 40 și 70, Cold Lead sub 40.</div>
    </section>
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>WhatsApp Business API</h1>
          <p>Configurare pentru Meta WhatsApp Cloud API, template-uri aprobate și webhook.</p>
        </div>
        ${statusBadge(whatsapp.configured ? "activ" : "inactiv")}
      </div>
      <form method="post" action="/nexora/travel/settings/whatsapp" class="nx-form">
        <div class="nx-two-column-grid">
          <label class="nx-field">
            <span>Activare API</span>
            <select name="travel_whatsapp_enabled">
              <option value="0" ${selected(whatsapp.travel_whatsapp_enabled, "0")}>Nu</option>
              <option value="1" ${selected(whatsapp.travel_whatsapp_enabled, "1")}>Da</option>
            </select>
          </label>
          <label class="nx-field"><span>Telefon afișat</span><input name="travel_whatsapp_display_phone" value="${escapeHtml(whatsapp.travel_whatsapp_display_phone || "")}" placeholder="+40774362975"></label>
          <label class="nx-field"><span>WhatsApp Business Account ID</span><input name="travel_whatsapp_waba_id" value="${escapeHtml(whatsapp.travel_whatsapp_waba_id || "")}"></label>
          <label class="nx-field"><span>Phone Number ID</span><input name="travel_whatsapp_phone_number_id" value="${escapeHtml(whatsapp.travel_whatsapp_phone_number_id || "")}"></label>
          <label class="nx-field"><span>Access token</span><input type="password" name="travel_whatsapp_access_token" value="${escapeHtml(whatsapp.travel_whatsapp_access_token || "")}"></label>
          <label class="nx-field"><span>App secret</span><input type="password" name="travel_whatsapp_app_secret" value="${escapeHtml(whatsapp.travel_whatsapp_app_secret || "")}"></label>
          <label class="nx-field"><span>Verify token webhook</span><input name="travel_whatsapp_verify_token" value="${escapeHtml(whatsapp.travel_whatsapp_verify_token || "")}"></label>
          <label class="nx-field"><span>Limbă implicită</span><input name="travel_whatsapp_default_language" value="${escapeHtml(whatsapp.travel_whatsapp_default_language || "ro")}"></label>
          <label class="nx-field"><span>Template proprietari RO</span><input name="travel_whatsapp_owner_template_ro" value="${escapeHtml(whatsapp.travel_whatsapp_owner_template_ro || "")}" placeholder="trevoro_owner_invite_ro"></label>
          <label class="nx-field"><span>Template proprietari EN</span><input name="travel_whatsapp_owner_template_en" value="${escapeHtml(whatsapp.travel_whatsapp_owner_template_en || "")}" placeholder="trevoro_owner_invite_en"></label>
        </div>
        <label class="nx-field nx-field-wide"><span>Webhook URL</span><input readonly value="${escapeHtml(whatsappWebhookUrl)}"></label>
        <label class="nx-field nx-field-wide"><span>Note interne</span><textarea name="travel_whatsapp_notes" rows="4">${escapeHtml(whatsapp.travel_whatsapp_notes || "")}</textarea></label>
        <div class="nx-form-actions">
          <button class="nx-btn primary" type="submit">Salvează WhatsApp</button>
        </div>
      </form>
      <div class="nx-empty-state">Trimiterea automată prin API trebuie folosită doar pentru contacte cu opt-in confirmat și template-uri aprobate în Meta.</div>
    </section>
  `;
  return shell({ title: "Setări Travel", activePath: "/nexora/travel/settings", companyName, user: options.user, body });
}

function formValue(form = {}, key = "") {
  return escapeHtml(form?.[key] || "");
}

function jsonLd(data = {}) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function blogArticlePath(article = {}) {
  return `/blog/${escapeHtml(article.slug || article.id || "")}`;
}

function blogCategoryPath(category = {}) {
  return `/blog/categorie/${escapeHtml(category.slug || "")}`;
}

function renderBlogBody(content = "") {
  const blocks = String(content || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length) return `<p>Articolul va fi completat în curând.</p>`;
  return blocks.map((block) => {
    const clean = escapeHtml(block.replace(/^#+\s*/, ""));
    if (/^#{1,3}\s/.test(block)) return `<h2>${clean}</h2>`;
    return `<p>${clean.replaceAll("\n", "<br>")}</p>`;
  }).join("");
}

function renderTrevoroBlogShell({ title, description, canonicalUrl, ogType = "website", schema, body }) {
  const ogImage = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80";
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/css/nexora-shell.css">
  <script type="application/ld+json">${jsonLd(schema || {})}</script>
  <style>
    :root{--trevoro-ink:#0f172a;--trevoro-muted:#475569;--trevoro-green:#0f766e;--trevoro-line:#e2e8f0;--trevoro-soft:#f8fafc}
    body{margin:0;background:#fff;color:var(--trevoro-ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .blog-nav{display:flex;justify-content:space-between;align-items:center;padding:20px clamp(18px,5vw,70px);border-bottom:1px solid var(--trevoro-line);background:#fff}
    .blog-brand{font-weight:950;font-size:20px;color:var(--trevoro-green);text-decoration:none}
    .blog-nav-links{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
    .blog-nav a{color:var(--trevoro-ink);font-weight:900;text-decoration:none}
    .blog-hero{min-height:46vh;display:grid;align-items:end;padding:86px clamp(18px,5vw,70px) 50px;background-image:linear-gradient(90deg,rgba(5,20,31,.76),rgba(5,20,31,.28)),url("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80");background-size:cover;background-position:center;color:#fff}
    .blog-hero h1{max-width:920px;margin:0 0 14px;font-size:clamp(34px,5vw,64px);line-height:1.03;letter-spacing:0}
    .blog-hero p{max-width:760px;margin:0;color:rgba(255,255,255,.9);font-size:clamp(16px,2vw,22px);line-height:1.48}
    .blog-band{padding:42px clamp(18px,5vw,70px);border-bottom:1px solid var(--trevoro-line)}
    .blog-band.soft{background:var(--trevoro-soft)}
    .blog-inner{max-width:1160px;margin:0 auto}
    .blog-categories{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}
    .blog-category{display:inline-flex;align-items:center;min-height:38px;padding:0 14px;border:1px solid var(--trevoro-line);border-radius:8px;color:var(--trevoro-ink);text-decoration:none;font-weight:900;background:#fff}
    .blog-category.active{border-color:#14b8a6;background:#ccfbf1;color:#134e4a}
    .blog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .blog-card{border:1px solid var(--trevoro-line);border-radius:8px;background:#fff;padding:20px;display:grid;gap:12px}
    .blog-card h2{font-size:21px;line-height:1.18;margin:0;letter-spacing:0}
    .blog-card p{margin:0;color:var(--trevoro-muted);line-height:1.5}
    .blog-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--trevoro-muted);font-size:14px}
    .blog-link{color:var(--trevoro-green);font-weight:950;text-decoration:none}
    .blog-article{max-width:840px;margin:0 auto}
    .blog-article h2{font-size:clamp(24px,3vw,34px);letter-spacing:0;margin:32px 0 12px}
    .blog-article p{font-size:18px;line-height:1.72;color:#1f2937}
    .blog-empty{border:1px dashed var(--trevoro-line);border-radius:8px;padding:22px;color:var(--trevoro-muted);background:#fff}
    .blog-footer{padding:26px clamp(18px,5vw,70px);background:#0f172a;color:#cbd5e1}
    @media(max-width:900px){.blog-grid{grid-template-columns:1fr}.blog-nav{align-items:flex-start;gap:12px;flex-direction:column}}
  </style>
</head>
<body>
  <nav class="blog-nav">
    <a class="blog-brand" href="/blog">Trevoro Blog</a>
    <div class="blog-nav-links">
      <a href="/trevoro/parteneri">Parteneri</a>
      <a href="/blog">Blog</a>
    </div>
  </nav>
  ${body}
  <footer class="blog-footer">Trevoro Blog · Idei, ghiduri și destinații pentru cazare în România</footer>
</body>
</html>`;
}

function renderTrevoroBlogIndexPage(options = {}) {
  const articles = Array.isArray(options.articles) ? options.articles : [];
  const categories = Array.isArray(options.categories) && options.categories.length ? options.categories : BLOG_CATEGORIES;
  const activeCategory = options.activeCategory || null;
  const canonicalUrl = options.canonicalUrl || "/blog";
  const title = activeCategory ? `${activeCategory.label} - Trevoro Blog` : "Trevoro Blog";
  const description = activeCategory
    ? `Articole Trevoro despre ${activeCategory.label.toLowerCase()}, cazare și destinații din România.`
    : "Trevoro Blog: cabane, hoteluri, pensiuni, destinații și ghiduri pentru cazare în România.";
  const categoryNav = `
    <div class="blog-categories">
      <a class="blog-category ${activeCategory ? "" : "active"}" href="/blog">Toate</a>
      ${categories.map((category) => `
        <a class="blog-category ${activeCategory?.slug === category.slug ? "active" : ""}" href="${blogCategoryPath(category)}">${escapeHtml(category.label)}</a>
      `).join("")}
    </div>
  `;
  const articleCards = articles.length
    ? articles.map((article) => `
      <article class="blog-card">
        <div class="blog-meta"><span>${escapeHtml(article.category || "Ghiduri")}</span><span>${escapeHtml(dateValue(article.updated_at || article.created_at) || "")}</span></div>
        <h2><a class="blog-link" href="${blogArticlePath(article)}">${escapeHtml(article.title || "-")}</a></h2>
        <p>${escapeHtml(articleExcerpt(article))}</p>
        <a class="blog-link" href="${blogArticlePath(article)}">Citește articolul</a>
      </article>
    `).join("")
    : `<div class="blog-empty">Nu există articole publicate în această categorie încă.</div>`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: title,
    description,
    url: canonicalUrl,
    publisher: { "@type": "Organization", name: "Trevoro" },
    blogPost: articles.slice(0, 12).map((article) => ({
      "@type": "BlogPosting",
      headline: article.title,
      url: `${options.baseUrl || ""}${blogArticlePath(article)}`,
      dateModified: article.updated_at || article.created_at || undefined
    }))
  };
  const body = `
    <header class="blog-hero">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </div>
    </header>
    <main class="blog-band soft">
      <div class="blog-inner">
        ${categoryNav}
        <div class="blog-grid">${articleCards}</div>
      </div>
    </main>
  `;
  return renderTrevoroBlogShell({ title, description, canonicalUrl, schema, body });
}

function renderTrevoroBlogArticlePage(options = {}) {
  const article = options.article || {};
  const relatedArticles = Array.isArray(options.relatedArticles) ? options.relatedArticles : [];
  const canonicalUrl = options.canonicalUrl || blogArticlePath(article);
  const title = article.meta_title || article.title || "Trevoro Blog";
  const description = article.meta_description || articleExcerpt(article, 180);
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title || title,
    description,
    articleSection: article.category || "Ghiduri",
    keywords: article.keywords || "",
    datePublished: article.created_at || undefined,
    dateModified: article.updated_at || article.created_at || undefined,
    url: canonicalUrl,
    author: { "@type": "Organization", name: "Trevoro" },
    publisher: { "@type": "Organization", name: "Trevoro" }
  };
  const relatedHtml = relatedArticles.length ? `
    <section class="blog-band soft">
      <div class="blog-inner">
        <div class="blog-grid">
          ${relatedArticles.map((item) => `
            <article class="blog-card">
              <div class="blog-meta"><span>${escapeHtml(item.category || "Ghiduri")}</span></div>
              <h2><a class="blog-link" href="${blogArticlePath(item)}">${escapeHtml(item.title || "-")}</a></h2>
              <p>${escapeHtml(articleExcerpt(item, 130))}</p>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  ` : "";
  const body = `
    <header class="blog-hero">
      <div>
        <h1>${escapeHtml(article.title || "Trevoro Blog")}</h1>
        <p>${escapeHtml(description)}</p>
      </div>
    </header>
    <main class="blog-band">
      <article class="blog-article">
        <div class="blog-meta"><span>${escapeHtml(article.category || "Ghiduri")}</span><span>${escapeHtml(dateValue(article.updated_at || article.created_at) || "")}</span></div>
        ${renderBlogBody(article.content)}
      </article>
    </main>
    ${relatedHtml}
  `;
  return renderTrevoroBlogShell({ title, description, canonicalUrl, ogType: "article", schema, body });
}

function renderTrevoroPartnersPage(options = {}) {
  const form = options.form || {};
  const errors = Array.isArray(options.errors) ? options.errors : [];
  const successMode = String(options.ok || "");
  const success = ["1", "founding"].includes(successMode);
  const canonicalUrl = options.canonicalUrl || "/trevoro/parteneri";
  const title = "Trevoro Parteneri - Alternativa românească la Booking";
  const description = "Înscrie gratuit proprietatea pe Trevoro în programul de lansare pentru proprietari.";
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonicalUrl,
    publisher: {
      "@type": "Organization",
      name: "Trevoro"
    }
  };
  const errorHtml = errors.length
    ? `<div class="nx-alert danger">${errors.map((error) => `<div>${escapeHtml(error)}</div>`).join("")}</div>`
    : "";
  const successHtml = success
    ? `<div class="nx-alert success">${escapeHtml(trevoroSignupSuccessMessage(successMode))}</div>`
    : "";

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/css/nexora-shell.css">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <style>
	    :root{--trevoro-ink:#0f172a;--trevoro-muted:#475569;--trevoro-green:#0f766e;--trevoro-line:#e2e8f0}
	    body{margin:0;background:#ffffff;color:var(--trevoro-ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
	    .trevoro-banner{background:#0f766e;color:#ecfeff;text-align:center;padding:10px 16px;font-weight:950}
	    .trevoro-nav{position:absolute;z-index:3;top:40px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:22px clamp(18px,5vw,70px);color:#fff}
    .trevoro-brand{font-weight:950;font-size:20px;letter-spacing:.02em}
    .trevoro-nav a{color:#fff;text-decoration:none;font-weight:900}
    .trevoro-hero{min-height:78vh;display:grid;align-items:end;position:relative;background-image:linear-gradient(90deg,rgba(5,20,31,.78),rgba(5,20,31,.34)),url("https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80");background-size:cover;background-position:center;padding:110px clamp(18px,5vw,70px) 64px;color:#fff}
    .trevoro-hero-content{max-width:850px}
    .trevoro-hero h1{font-size:clamp(34px,6vw,70px);line-height:1.02;margin:0 0 18px;font-weight:950;letter-spacing:0}
    .trevoro-hero p{font-size:clamp(17px,2.1vw,24px);line-height:1.45;max-width:720px;margin:0 0 28px;color:rgba(255,255,255,.9)}
    .trevoro-cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:8px;background:#14b8a6;color:#042f2e;text-decoration:none;font-weight:950}
    .trevoro-band{padding:52px clamp(18px,5vw,70px);border-bottom:1px solid var(--trevoro-line)}
    .trevoro-band.alt{background:#f8fafc}
    .trevoro-inner{max-width:1160px;margin:0 auto}
    .trevoro-section-head{display:grid;gap:8px;margin-bottom:22px}
    .trevoro-section-head h2{font-size:clamp(24px,3vw,38px);line-height:1.08;margin:0;letter-spacing:0}
    .trevoro-section-head p{margin:0;color:var(--trevoro-muted);font-size:16px}
    .trevoro-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .trevoro-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
    .trevoro-item{border:1px solid var(--trevoro-line);border-radius:8px;background:#fff;padding:18px;display:grid;gap:8px}
    .trevoro-item b{font-size:16px}
    .trevoro-item span{color:var(--trevoro-muted);line-height:1.45}
    .trevoro-highlight{background:#0f766e;color:#ecfeff;border-radius:8px;padding:24px;display:grid;gap:10px}
    .trevoro-highlight h2{margin:0;font-size:clamp(24px,3vw,34px);letter-spacing:0}
    .trevoro-highlight p{margin:0;color:#ccfbf1;font-size:17px;line-height:1.5}
    .trevoro-form-wrap{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:26px;align-items:start}
    .trevoro-form-card{border:1px solid var(--trevoro-line);border-radius:8px;background:#fff;padding:20px}
    .trevoro-footer{padding:26px clamp(18px,5vw,70px);background:#0f172a;color:#cbd5e1}
    @media(max-width:860px){.trevoro-grid,.trevoro-grid.two,.trevoro-form-wrap{grid-template-columns:1fr}.trevoro-hero{min-height:82vh}.trevoro-nav{position:absolute}}
  </style>
	</head>
	<body>
	  <div class="trevoro-banner">Trevoro pentru proprietari: înscriere gratuită în programul de lansare.</div>
	  <nav class="trevoro-nav">
    <div class="trevoro-brand">Trevoro</div>
    <a href="#formular">Înscrie proprietatea</a>
  </nav>
  <header class="trevoro-hero">
    <div class="trevoro-hero-content">
      <h1>Alternativa românească la Booking pentru hoteluri, pensiuni și apartamente.</h1>
	      <p>Înscrie proprietatea în programul de lansare Trevoro. Echipa validează datele și pregătește listarea pentru publicare.</p>
      <a class="trevoro-cta" href="#formular">Înscrie proprietatea</a>
    </div>
  </header>

  <section class="trevoro-band">
    <div class="trevoro-inner">
      <div class="trevoro-section-head"><h2>Problema</h2><p>Proprietarii locali au nevoie de vizibilitate și de un flux simplu de publicare.</p></div>
      <div class="trevoro-grid">
        <div class="trevoro-item"><b>Dependență de platforme mari</b><span>Este greu să construiești vizibilitate proprie când prezența online depinde de canale externe.</span></div>
        <div class="trevoro-item"><b>Vizibilitate greu de obținut</b><span>Este dificil să ieși în evidență când concurezi cu mii de proprietăți.</span></div>
        <div class="trevoro-item"><b>Lipsă suport local</b><span>Ai nevoie de oameni care înțeleg piața din România și răspund în limba română.</span></div>
      </div>
    </div>
  </section>

  <section class="trevoro-band alt">
    <div class="trevoro-inner">
      <div class="trevoro-section-head"><h2>Soluția Trevoro</h2><p>Un canal de promovare și publicare pentru proprietăți locale.</p></div>
      <div class="trevoro-grid two">
		        <div class="trevoro-item"><b>Înscriere simplă</b><span>${escapeHtml(TREVORO_OWNER_PLANS_RO)}.</span></div>
        <div class="trevoro-item"><b>Contact direct</b><span>Turistul poate ajunge mai ușor la proprietate după validarea listării.</span></div>
        <div class="trevoro-item"><b>Promovare pe social media</b><span>Proprietățile selectate pot intra în campaniile Trevoro și în conținut social.</span></div>
        <div class="trevoro-item"><b>Suport în limba română</b><span>Comunicare directă cu echipa locală.</span></div>
        <div class="trevoro-item"><b>Portal proprietar</b><span>Datele proprietății și cererile sunt gestionate într-un singur loc.</span></div>
        <div class="trevoro-item"><b>Funcții etapizate</b><span>Activăm treptat modulele suplimentare, după validarea fluxului de lansare.</span></div>
      </div>
    </div>
  </section>

  <section class="trevoro-band">
    <div class="trevoro-inner">
      <div class="trevoro-section-head"><h2>Pentru cine este</h2><p>Trevoro este deschis pentru proprietăți turistice din România.</p></div>
      <div class="trevoro-grid">
        <div class="trevoro-item"><b>Hoteluri</b><span>Unități urbane sau de vacanță.</span></div>
        <div class="trevoro-item"><b>Pensiuni</b><span>Proprietăți locale cu experiențe autentice.</span></div>
        <div class="trevoro-item"><b>Cabane</b><span>Locații montane, rurale sau de weekend.</span></div>
        <div class="trevoro-item"><b>Apartamente în regim hotelier</b><span>Gazde care vor vizibilitate locală.</span></div>
        <div class="trevoro-item"><b>Glamping</b><span>Concepte noi pentru turiști care caută experiențe.</span></div>
      </div>
    </div>
  </section>

  <section class="trevoro-band alt">
    <div class="trevoro-inner">
      <div class="trevoro-highlight">
        <h2>Program de lansare pentru proprietari</h2>
		        <p>Începem cu înscrierea gratuită, validarea datelor și pregătirea listării. Detaliile comerciale vor fi comunicate separat după finalizarea strategiei.</p>
      </div>
    </div>
  </section>

  <section class="trevoro-band" id="formular">
    <div class="trevoro-inner trevoro-form-wrap">
      <div class="trevoro-section-head">
        <h2>Înscrie proprietatea</h2>
        <p>După înscriere, proprietarul intră în portal pentru poze reale, calendar și detaliile proprietății.</p>
      </div>
      <div class="trevoro-form-card">
        ${successHtml}
        ${errorHtml}
        <form method="post" action="/trevoro/parteneri#formular" class="nx-form">
          <input type="hidden" name="plan_key" value="founding_partner">
          <label class="nx-field"><span>Nume proprietate</span><input name="name" value="${formValue(form, "name")}" required></label>
          <label class="nx-field"><span>Tip proprietate</span><input name="property_type" value="${formValue(form, "property_type")}" placeholder="hotel, pensiune, cabană..."></label>
          <label class="nx-field"><span>Țară</span><select name="country">
            ${travelCountryOptionsHtml(formValue(form, "country") || "Romania")}
          </select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Oraș</span><input name="city" value="${formValue(form, "city")}" required></label>
            <label class="nx-field"><span>Județ</span><input name="county" value="${formValue(form, "county")}"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Telefon</span><input name="phone" value="${formValue(form, "phone")}"></label>
            <label class="nx-field"><span>Email cont proprietar</span><input type="email" name="email" value="${formValue(form, "email")}" required></label>
          </div>
          <label class="nx-field"><span>Parolă cont proprietar</span><input type="password" name="password" minlength="8" required placeholder="Minimum 8 caractere, litere și cifre"></label>
          <label class="nx-field"><span>Website, opțional</span><input name="website" value="${formValue(form, "website")}"></label>
          <label class="nx-field"><span>Observații, opțional</span><textarea name="notes" rows="4">${formValue(form, "notes")}</textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Înscrie proprietatea</button></div>
        </form>
      </div>
    </div>
  </section>
  <footer class="trevoro-footer">Trevoro · Program parteneri pentru proprietăți turistice din România</footer>
</body>
</html>`;
}

function renderTrevoroLaunchPage(options = {}) {
  const form = options.form || {};
  const errors = Array.isArray(options.errors) ? options.errors : [];
  const successMode = String(options.ok || "");
  const success = ["1", "founding"].includes(successMode);
  const canonicalUrl = options.canonicalUrl || "/";
  const title = "Trevoro - program de lansare pentru proprietăți turistice";
  const description = "Înscrie gratuit proprietatea pe Trevoro în programul de lansare pentru proprietari.";
  const ogImage = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=82";
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonicalUrl,
    publisher: {
      "@type": "Organization",
      name: "Trevoro"
    }
  };
  const errorHtml = errors.length
    ? `<div class="nx-alert danger">${errors.map((error) => `<div>${escapeHtml(error)}</div>`).join("")}</div>`
    : "";
  const successHtml = success
    ? `<div class="nx-alert success">${escapeHtml(trevoroSignupSuccessMessage(successMode))}</div>`
    : "";

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/css/nexora-shell.css">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <style>
    :root{--trevoro-ink:#0f172a;--trevoro-muted:#475569;--trevoro-green:#0f766e;--trevoro-sea:#0e7490;--trevoro-sun:#f59e0b;--trevoro-coral:#fb7185;--trevoro-line:#e2e8f0;--trevoro-soft:#f8fafc}
    body{margin:0;background:#fff;color:var(--trevoro-ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .launch-banner{background:#0f766e;color:#ecfeff;text-align:center;padding:10px 16px;font-weight:950}
    .launch-nav{position:absolute;z-index:3;top:40px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:22px clamp(18px,5vw,70px);color:#fff}
    .launch-brand{font-weight:950;font-size:21px;letter-spacing:0}
    .launch-nav-links{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
    .launch-nav a{color:#fff;text-decoration:none;font-weight:900}
    .launch-hero{box-sizing:border-box;min-height:calc(100vh - 150px);display:grid;align-items:center;position:relative;background-image:linear-gradient(90deg,rgba(4,20,28,.84),rgba(4,20,28,.44) 52%,rgba(4,20,28,.12)),url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2200&q=82");background-size:cover;background-position:center 58%;padding:118px clamp(18px,5vw,70px) 38px;color:#fff}
    .launch-hero-content{max-width:900px}
    .launch-kicker{display:block;margin:0 0 12px;color:#fde68a;font-weight:950;font-size:14px;line-height:1.35;text-transform:uppercase;letter-spacing:0}
    .launch-hero h1{font-size:66px;line-height:1.02;margin:0 0 18px;font-weight:950;letter-spacing:0;text-wrap:balance}
    .launch-hero p{font-size:22px;line-height:1.46;max-width:780px;margin:0 0 28px;color:rgba(255,255,255,.92)}
    .launch-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .launch-cta{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 20px;border-radius:8px;background:#fde68a;color:#442006;text-decoration:none;font-weight:950}
    .launch-secondary{display:inline-flex;align-items:center;min-height:50px;color:#fff;text-decoration:none;font-weight:950}
    .launch-hero-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:820px;margin-top:34px}
    .launch-metric{border:1px solid rgba(255,255,255,.34);background:rgba(15,23,42,.28);border-radius:8px;padding:14px 16px;backdrop-filter:blur(5px)}
    .launch-metric b{display:block;font-size:24px;line-height:1.1;color:#fff}
    .launch-metric span{display:block;margin-top:5px;color:rgba(255,255,255,.82);font-weight:800}
    .launch-band{padding:52px clamp(18px,5vw,70px);border-bottom:1px solid var(--trevoro-line)}
    .launch-band.soft{background:var(--trevoro-soft)}
    .launch-inner{max-width:1160px;margin:0 auto}
    .launch-section-head{display:grid;gap:8px;margin-bottom:22px}
    .launch-section-head h2{font-size:38px;line-height:1.08;margin:0;letter-spacing:0;text-wrap:balance}
    .launch-section-head p{margin:0;color:var(--trevoro-muted);font-size:16px;line-height:1.55}
    .launch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .launch-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
    .launch-item{border:1px solid var(--trevoro-line);border-radius:8px;background:#fff;padding:18px;display:grid;gap:8px}
    .launch-item b{font-size:16px}
    .launch-item span{color:var(--trevoro-muted);line-height:1.45}
    .launch-step{display:grid;gap:10px}
    .launch-step-number{width:40px;height:40px;border-radius:8px;display:grid;place-items:center;background:#0e7490;color:#fff;font-weight:950}
    .launch-highlight{background:linear-gradient(135deg,#0f766e,#0e7490);color:#ecfeff;border-radius:8px;padding:26px;display:grid;gap:10px}
    .launch-highlight h2{margin:0;font-size:34px;letter-spacing:0}
    .launch-highlight p{margin:0;color:#ccfbf1;font-size:17px;line-height:1.5}
    .launch-season-strip{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:center}
    .launch-season-photo{min-height:240px;border-radius:8px;background-image:url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=82");background-size:cover;background-position:center;box-shadow:0 18px 40px rgba(15,23,42,.16)}
    .launch-form-wrap{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:26px;align-items:start}
    .launch-form-card{border:1px solid var(--trevoro-line);border-radius:8px;background:#fff;padding:20px}
    .launch-footer{padding:26px clamp(18px,5vw,70px);background:#0f172a;color:#cbd5e1}
    @media(max-width:980px){.launch-hero h1{font-size:48px}.launch-hero p{font-size:20px}.launch-season-strip{grid-template-columns:1fr}}
    @media(max-width:860px){.launch-grid,.launch-grid.two,.launch-form-wrap{grid-template-columns:1fr}.launch-hero{min-height:calc(100vh - 120px);padding-top:142px;padding-bottom:38px}.launch-nav{position:absolute;align-items:flex-start;gap:12px;flex-direction:column}.launch-nav-links{gap:12px}.launch-section-head h2{font-size:30px}.launch-highlight h2{font-size:28px}}
    @media(max-width:560px){.launch-hero h1{font-size:38px}.launch-hero p{font-size:18px}.launch-hero-metrics{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:22px}.launch-metric{padding:12px 10px}.launch-metric b{font-size:21px}.launch-metric span{font-size:13px;line-height:1.25}}
  </style>
</head>
<body>
  <div class="launch-banner">Trevoro primește proprietăți în programul de lansare.</div>
  <nav class="launch-nav">
    <div class="launch-brand">Trevoro</div>
    <div class="launch-nav-links">
      <a href="#beneficii">Beneficii</a>
      <a href="#cum-functioneaza">Cum funcționează</a>
      <a href="#formular">Înscriere</a>
      <a href="/blog">Blog</a>
    </div>
  </nav>
	  <header class="launch-hero">
	    <div class="launch-hero-content">
	      <span class="launch-kicker">Sezon de vară 2026 · Program de lansare Trevoro</span>
	      <h1>Înscrie proprietatea pe Trevoro.</h1>
		      <p>Hotelurile, pensiunile, cabanele și apartamentele pot intra gratuit în programul de lansare. Echipa validează datele și pregătește listarea pentru publicare.</p>
	      <div class="launch-actions">
	        <a class="launch-cta" href="#formular">Înscrie proprietatea</a>
	        <a class="launch-secondary" href="#beneficii">Vezi beneficiile</a>
	      </div>
	      <div class="launch-hero-metrics" aria-label="Beneficii cheie">
	        <div class="launch-metric"><b>Start</b><span>înscriere gratuită</span></div>
	        <div class="launch-metric"><b>SEO</b><span>pagini pregătite</span></div>
	        <div class="launch-metric"><b>Social</b><span>promovare lansare</span></div>
	      </div>
	    </div>
	  </header>

	  <section class="launch-band" id="beneficii">
	    <div class="launch-inner">
	      <div class="launch-section-head">
	        <h2>Beneficii pentru proprietari</h2>
	        <p>Trevoro este construit pentru proprietari care vor vizibilitate, suport local și un flux clar de publicare.</p>
	      </div>
	      <div class="launch-grid">
	        <div class="launch-item"><b>Înscriere gratuită</b><span>${escapeHtml(TREVORO_OWNER_PLANS_RO)}.</span></div>
	        <div class="launch-item"><b>Contact direct</b><span>Listarea este pregătită pentru ca turistul să ajungă simplu la proprietate.</span></div>
	        <div class="launch-item"><b>Listare rapidă</b><span>Completezi formularul, noi validăm datele și pregătim profilul proprietății.</span></div>
	        <div class="launch-item"><b>Promovare Trevoro</b><span>Proprietățile selectate pot intra în campaniile Trevoro pentru sezon și social media.</span></div>
	        <div class="launch-item"><b>Suport local</b><span>Comunicare în română, cu o echipă care înțelege piața de cazare din România.</span></div>
	        <div class="launch-item"><b>Creștere pe termen lung</b><span>SEO, blog, social content și cont proprietar în etapele următoare.</span></div>
	      </div>
	    </div>
	  </section>

	  <section class="launch-band soft" id="cum-functioneaza">
	    <div class="launch-inner">
	      <div class="launch-section-head">
	        <h2>Ce se întâmplă după înscriere</h2>
	        <p>Nu ai nimic complicat de instalat acum. Începem cu validarea proprietății și pregătirea prezenței Trevoro.</p>
	      </div>
	      <div class="launch-grid">
	        <div class="launch-item launch-step"><div class="launch-step-number">1</div><b>Trimiți datele</b><span>Nume, tip proprietate, localitate și o metodă de contact.</span></div>
	        <div class="launch-item launch-step"><div class="launch-step-number">2</div><b>Confirmăm rapid</b><span>Verificăm datele și pregătim contul de proprietar.</span></div>
	        <div class="launch-item launch-step"><div class="launch-step-number">3</div><b>Pregătim profilul</b><span>Pregătim pagina proprietății și promovarea Trevoro.</span></div>
	      </div>
	    </div>
	  </section>

	  <section class="launch-band">
	    <div class="launch-inner launch-season-strip">
	      <div class="launch-highlight">
	        <h2>Program de lansare pentru proprietari</h2>
	        <p>Începem cu înscrierea gratuită, validarea datelor și pregătirea listării. Detaliile comerciale vor fi comunicate separat după finalizarea strategiei.</p>
	      </div>
	      <div class="launch-season-photo" role="img" aria-label="Plajă însorită de sezon"></div>
	    </div>
	  </section>

	  <section class="launch-band soft" id="formular">
	    <div class="launch-inner launch-form-wrap">
	      <div class="launch-section-head">
	        <h2>Formular înscriere</h2>
	        <p>Completează formularul în mai puțin de un minut. După înscriere, intri în portal pentru poze, calendar și detaliile proprietății.</p>
	      </div>
      <div class="launch-form-card">
        ${successHtml}
        ${errorHtml}
        <form method="post" action="/#formular" class="nx-form">
          <input type="hidden" name="plan_key" value="founding_partner">
          <label class="nx-field"><span>Nume proprietate</span><input name="name" value="${formValue(form, "name")}" required></label>
          <label class="nx-field"><span>Tip proprietate</span><input name="property_type" value="${formValue(form, "property_type")}" placeholder="hotel, pensiune, cabană, apartament..."></label>
          <label class="nx-field"><span>Țară</span><select name="country">
            ${travelCountryOptionsHtml(formValue(form, "country") || "Romania")}
          </select></label>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Oraș</span><input name="city" value="${formValue(form, "city")}" required></label>
            <label class="nx-field"><span>Județ</span><input name="county" value="${formValue(form, "county")}"></label>
          </div>
          <div class="nx-two-column-grid compact">
            <label class="nx-field"><span>Telefon</span><input name="phone" value="${formValue(form, "phone")}"></label>
            <label class="nx-field"><span>Email cont proprietar</span><input type="email" name="email" value="${formValue(form, "email")}" required></label>
          </div>
          <label class="nx-field"><span>Parolă cont proprietar</span><input type="password" name="password" minlength="8" required placeholder="Minimum 8 caractere, litere și cifre"></label>
          <label class="nx-field"><span>Website, opțional</span><input name="website" value="${formValue(form, "website")}"></label>
          <label class="nx-field"><span>Observații, opțional</span><textarea name="notes" rows="4">${formValue(form, "notes")}</textarea></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Înscrie proprietatea</button></div>
        </form>
      </div>
    </div>
  </section>
  <footer class="launch-footer">Trevoro · Program de lansare pentru proprietăți turistice din România</footer>
</body>
</html>`;
}

function renderTrevoroPropertyPage(options = {}) {
  const property = options.property || {};
  const canonicalUrl = options.canonicalUrl || `/properties/${property.public_slug || property.id || ""}`;
  const location = [property.city, property.county].filter(Boolean).join(", ");
  const type = property.property_type || "proprietate turistică";
  const title = `${property.name || "Proprietate Trevoro"} - cazare ${property.city || "România"}`;
  const description = `${property.name || "Proprietate"} este o ${type} în ${location || "România"}, disponibilă pentru parteneriat Trevoro.`;
  const schema = {
    "@context": "https://schema.org",
    "@type": ["Hotel", "LodgingBusiness", "TouristAccommodation"],
    name: property.name || "Proprietate Trevoro",
    description,
    url: canonicalUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: property.address || "",
      addressLocality: property.city || "",
      addressRegion: property.county || "",
      addressCountry: "RO"
    },
    telephone: property.phone || "",
    email: property.email || "",
    sameAs: [property.website].filter(Boolean)
  };

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/css/nexora-shell.css">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <style>
    :root{--trevoro-ink:#0f172a;--trevoro-muted:#475569;--trevoro-green:#0f766e;--trevoro-line:#e2e8f0}
    body{margin:0;background:#fff;color:var(--trevoro-ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .trevoro-nav{display:flex;justify-content:space-between;align-items:center;padding:20px clamp(18px,5vw,70px);border-bottom:1px solid var(--trevoro-line)}
    .trevoro-brand{font-weight:950;font-size:20px;color:var(--trevoro-green);text-decoration:none}
    .trevoro-nav a{color:var(--trevoro-ink);font-weight:900;text-decoration:none}
    .trevoro-property-hero{min-height:54vh;display:grid;align-items:end;padding:90px clamp(18px,5vw,70px) 46px;background-image:linear-gradient(90deg,rgba(5,20,31,.74),rgba(5,20,31,.24)),url("https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1800&q=80");background-size:cover;background-position:center;color:#fff}
    .trevoro-property-hero h1{max-width:920px;margin:0 0 14px;font-size:clamp(32px,5vw,62px);line-height:1.02;letter-spacing:0}
    .trevoro-property-hero p{max-width:720px;margin:0;font-size:clamp(16px,2vw,22px);line-height:1.45;color:rgba(255,255,255,.9)}
    .trevoro-band{padding:44px clamp(18px,5vw,70px);border-bottom:1px solid var(--trevoro-line)}
    .trevoro-inner{max-width:1080px;margin:0 auto}
    .trevoro-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .trevoro-item{border:1px solid var(--trevoro-line);border-radius:8px;padding:18px;display:grid;gap:8px}
    .trevoro-item span{color:var(--trevoro-muted)}
    .trevoro-cta{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:8px;background:#14b8a6;color:#042f2e;text-decoration:none;font-weight:950}
    .trevoro-footer{padding:26px clamp(18px,5vw,70px);background:#0f172a;color:#cbd5e1}
    @media(max-width:760px){.trevoro-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <nav class="trevoro-nav">
    <a class="trevoro-brand" href="/trevoro/parteneri">Trevoro</a>
    <a href="/trevoro/parteneri#formular">Înscrie proprietatea</a>
  </nav>
  <header class="trevoro-property-hero">
    <div>
      <h1>${escapeHtml(property.name || "Proprietate Trevoro")}</h1>
      <p>${escapeHtml([property.property_type, property.city, property.county].filter(Boolean).join(" · ") || "Proprietate turistică din România")}</p>
    </div>
  </header>
  <main>
    <section class="trevoro-band">
      <div class="trevoro-inner">
        <div class="trevoro-grid">
          <div class="trevoro-item"><b>Oraș</b><span>${escapeHtml(property.city || "-")}</span></div>
          <div class="trevoro-item"><b>Județ</b><span>${escapeHtml(property.county || "-")}</span></div>
          <div class="trevoro-item"><b>Tip proprietate</b><span>${escapeHtml(property.property_type || "-")}</span></div>
          <div class="trevoro-item"><b>Adresă</b><span>${escapeHtml(property.address || "-")}</span></div>
          <div class="trevoro-item"><b>Telefon</b><span>${escapeHtml(property.phone || "-")}</span></div>
          <div class="trevoro-item"><b>Website</b><span>${property.website ? `<a href="${escapeHtml(externalHref(property.website))}" rel="nofollow">${escapeHtml(property.website)}</a>` : "-"}</span></div>
        </div>
      </div>
    </section>
    <section class="trevoro-band">
      <div class="trevoro-inner">
        <h2>${escapeHtml(property.name || "Proprietate")} pe Trevoro</h2>
        <p>${escapeHtml(description)}</p>
        <a class="trevoro-cta" href="/trevoro/parteneri#formular">Înscrie proprietatea</a>
      </div>
    </section>
  </main>
  <footer class="trevoro-footer">Trevoro · Pagini SEO pentru proprietăți turistice din România</footer>
</body>
</html>`;
}

export {
  renderNexoraTravelAgenciesPage,
  renderNexoraTravelCampaignsPage,
  renderNexoraTravelContentFactoryPage,
  renderNexoraTravelDashboardPage,
  renderNexoraTravelFacebookLeadsPage,
  renderNexoraTravelImportsPage,
  renderNexoraTravelInquiriesPage,
  renderNexoraTravelIntegrationsPage,
  renderNexoraTravelInternationalDashboardPage,
  renderNexoraTravelKanbanPage,
  renderNexoraTravelLeadDetailPage,
  renderNexoraTravelLeadsPage,
  renderNexoraTravelLocalPartnersPage,
  renderNexoraTravelOutreachPage,
  renderNexoraTravelOwnersMonitorPage,
  renderNexoraTravelPropertyDetailPage,
  renderNexoraTravelPropertiesPage,
  renderNexoraTravelReviewsPage,
  renderNexoraTravelSeoPagesPage,
  renderNexoraTravelSettingsPage,
  renderNexoraTravelSocialGroupsPage,
  renderNexoraTravelSocialPostsPage,
  renderNexoraTravelSupportPage,
  renderNexoraTravelSupportTicketPage,
  renderTrevoroBlogArticlePage,
  renderTrevoroBlogIndexPage,
  renderTrevoroLaunchPage,
  renderTrevoroPartnersPage,
  renderTrevoroPropertyPage
};
