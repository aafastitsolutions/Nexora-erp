#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import { createTransporter } from "../lib/bootstrap.js";
import { db, migrate } from "../db.js";
import { exitIfTrevoroEmailSendingPaused } from "./lib/trevoro-email-pause.mjs";
import {
  buildTrevoroOwnerWelcomeEmail,
  sendTrevoroOwnerWelcomeEmail
} from "../routes/travel-routes.js";

function safeText(value = "") {
  return String(value ?? "").trim();
}

function parseArgs(argv = []) {
  const args = {
    dryRun: false,
    leadId: 0,
    normalizeFounding: false,
    propertyId: 0,
    to: ""
  };
  for (const item of argv) {
    if (item === "--dry-run") args.dryRun = true;
    if (item === "--normalize-founding") args.normalizeFounding = true;
    const [key, rawValue = ""] = item.replace(/^--/, "").split("=");
    if (key === "lead-id") args.leadId = Number(rawValue) || 0;
    if (key === "property-id") args.propertyId = Number(rawValue) || 0;
    if (key === "to") args.to = safeText(rawValue);
  }
  return args;
}

function publicBaseUrl() {
  return safeText(process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "https://beta.trevoro.ro").replace(/\/+$/, "");
}

function addMonthsDateValue(months = 12, fromValue = "") {
  const date = fromValue ? new Date(String(fromValue).replace(" ", "T")) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function loadTarget(args = {}) {
  let lead = null;
  let property = null;

  if (args.leadId) {
    lead = db.prepare("SELECT * FROM travel_leads WHERE id=?").get(args.leadId) || null;
    property = db.prepare("SELECT * FROM travel_properties WHERE lead_id=? ORDER BY id DESC LIMIT 1").get(args.leadId) || null;
  } else if (args.propertyId) {
    property = db.prepare("SELECT * FROM travel_properties WHERE id=?").get(args.propertyId) || null;
    if (property?.lead_id) lead = db.prepare("SELECT * FROM travel_leads WHERE id=?").get(property.lead_id) || null;
  } else {
    property = db.prepare(`
      SELECT p.*
      FROM travel_properties p
      JOIN travel_leads l ON l.id=p.lead_id
      WHERE l.source='trevoro_landing'
        AND p.status='activ'
        AND COALESCE(l.email, p.email, '') <> ''
      ORDER BY p.id DESC
      LIMIT 1
    `).get() || null;
    if (property?.lead_id) lead = db.prepare("SELECT * FROM travel_leads WHERE id=?").get(property.lead_id) || null;
  }

  if (!lead && property) lead = { ...property, id: property.lead_id || 0, source: property.activation_source || "" };
  if (!property && lead) property = null;
  return { lead, property };
}

function normalizeFoundingPartnerIfNeeded(lead = {}, property = {}) {
  if (!lead?.id || !property?.id || safeText(lead.source) !== "trevoro_landing") return { changed: false, property };
  if (property.partner_plan === "founding_partner" && property.subscription_status === "free_12_months") {
    return { changed: false, property };
  }

  const freeUntil = safeText(property.free_until) || addMonthsDateValue(12, lead.created_at || property.created_at);
  db.prepare(`
    UPDATE travel_properties
    SET partner_plan='founding_partner',
        subscription_status='free_12_months',
        monthly_price_ron=0,
        free_until=?,
        activation_source='trevoro_landing',
        updated_at=datetime('now')
    WHERE id=?
  `).run(freeUntil || null, property.id);

  const updated = db.prepare("SELECT * FROM travel_properties WHERE id=?").get(property.id) || property;
  db.prepare(`
    INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
    VALUES (?, ?, 'commercial_exception_normalized', 'Proprietate normalizată cu excepție comercială', ?, datetime('now'))
	  `).run(
	    Number(lead.company_id || property.company_id || 0),
	    lead.id,
	    `Program lansare Trevoro activ până la ${updated.free_until || "-"}. Detaliile comerciale vor fi comunicate separat după finalizarea strategiei.`
	  );
  return { changed: true, property: updated };
}

async function main() {
  exitIfTrevoroEmailSendingPaused("scripts/send-trevoro-owner-welcome-email.mjs");
  const args = parseArgs(process.argv.slice(2));
  migrate();

  let { lead, property } = loadTarget(args);
  if (!lead?.id && !property?.id) throw new Error("Nu am găsit lead/proprietate pentru email.");
  if (args.normalizeFounding && !args.dryRun) {
    const normalized = normalizeFoundingPartnerIfNeeded(lead, property);
    property = normalized.property;
  } else if (args.normalizeFounding && property) {
    property = {
      ...property,
      partner_plan: "founding_partner",
      subscription_status: "free_12_months",
      monthly_price_ron: 0,
      free_until: safeText(property.free_until) || addMonthsDateValue(12, lead.created_at || property.created_at),
      activation_source: "trevoro_landing"
    };
  }

  const baseUrl = publicBaseUrl();
  const to = safeText(args.to || lead.email || property?.email);
  if (!to) throw new Error("Lead-ul/proprietatea nu are email. Folosește --to=email@test.ro pentru test.");

  const activation = property?.partner_plan === "founding_partner"
    ? { type: "founding_partner", propertyId: property.id, freeUntil: property.free_until }
    : null;
  const message = buildTrevoroOwnerWelcomeEmail({ lead, property, activation, baseUrl });

  if (args.dryRun) {
    console.log(JSON.stringify({
      dry_run: true,
      to,
      subject: message.subject,
      text: message.text
    }, null, 2));
    return;
  }

  const transporter = createTransporter();
  const result = await sendTrevoroOwnerWelcomeEmail({
    db,
    transporter,
    companyId: Number(lead.company_id || property?.company_id || 0),
    lead,
    property,
    activation,
    baseUrl,
    to
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
