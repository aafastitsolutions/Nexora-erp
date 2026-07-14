import { ensureEmarqetOutboundSchema } from "./emarqet-outbound.js";
import { ensureMarketplaceServicesSchema } from "./emarqet-marketplace-services.js";
import { emarqetMailboxSettings } from "./emarqet-mailboxes.js";

function safeCompanyId(companyId) {
  return Number(companyId || 0);
}

function safeText(value = "") {
  return String(value || "").trim();
}

function count(db, sql, params = []) {
  const row = db.prepare(sql).get(...params);
  return Number(row?.value || 0);
}

function scalar(db, sql, params = []) {
  const row = db.prepare(sql).get(...params);
  return safeText(row?.value);
}

function eventTime(row = {}) {
  return safeText(row.createdAt || row.created_at || row.sent_at || row.updated_at);
}

function ticketNumber(row = {}) {
  return safeText(row.ticket_number) || `EMQ-TIC-${String(Number(row.id || 0)).padStart(6, "0")}`;
}

export function loadEmarqetEmailDashboard(db, companyId, options = {}) {
  const safeId = safeCompanyId(companyId);
  const limit = Math.max(10, Number(options.limit || 80) || 80);
  ensureEmarqetOutboundSchema(db);
  ensureMarketplaceServicesSchema(db);

  const settings = emarqetMailboxSettings();
  const summary = {
    outboundSent: count(db, "SELECT COUNT(*) AS value FROM emarqet_outbound_email_events WHERE company_id=? AND UPPER(COALESCE(status,''))='TRIMIS'", [safeId]),
    outboundFailed: count(db, "SELECT COUNT(*) AS value FROM emarqet_outbound_email_events WHERE company_id=? AND UPPER(COALESCE(status,''))='ESUAT'", [safeId]),
    outboundSent7d: count(db, "SELECT COUNT(*) AS value FROM emarqet_outbound_email_events WHERE company_id=? AND UPPER(COALESCE(status,''))='TRIMIS' AND datetime(COALESCE(sent_at, created_at)) >= datetime('now', '-7 days')", [safeId]),
    inboundLeads: count(db, "SELECT COUNT(*) AS value FROM emarqet_leads WHERE company_id=?", [safeId]),
    inboundLeads7d: count(db, "SELECT COUNT(*) AS value FROM emarqet_leads WHERE company_id=? AND datetime(created_at) >= datetime('now', '-7 days')", [safeId]),
    openTickets: count(db, "SELECT COUNT(*) AS value FROM emarqet_service_requests WHERE company_id=? AND UPPER(COALESCE(status,'')) IN ('NOU','IN_LUCRU')", [safeId]),
    tickets7d: count(db, "SELECT COUNT(*) AS value FROM emarqet_service_requests WHERE company_id=? AND datetime(created_at) >= datetime('now', '-7 days')", [safeId]),
    lastOutboundAt: scalar(db, "SELECT MAX(COALESCE(sent_at, created_at)) AS value FROM emarqet_outbound_email_events WHERE company_id=?", [safeId]),
    lastInboundAt: scalar(db, "SELECT MAX(created_at) AS value FROM emarqet_leads WHERE company_id=?", [safeId]),
    lastTicketAt: scalar(db, "SELECT MAX(created_at) AS value FROM emarqet_service_requests WHERE company_id=?", [safeId])
  };

  const mailboxes = [
    {
      label: "Office E-MARQET",
      email: settings.officeEmail,
      role: "Sender pentru colaborări, parteneri, abonamente și facturi",
      direction: "OUT",
      primaryCount: summary.outboundSent,
      secondaryCount: summary.outboundFailed,
      lastActivityAt: summary.lastOutboundAt
    },
    {
      label: "Suport E-MARQET",
      email: settings.supportEmail,
      role: "Reply-To, suport clienți și tichete operaționale",
      direction: "IN",
      primaryCount: summary.openTickets,
      secondaryCount: summary.inboundLeads,
      lastActivityAt: summary.lastTicketAt || summary.lastInboundAt
    }
  ];

  const outbound = db.prepare(`
    SELECT
      e.*,
      COALESCE(NULLIF(e.from_email, ''), ?) AS from_email,
      COALESCE(NULLIF(e.reply_to_email, ''), ?) AS reply_to_email,
      COALESCE(NULLIF(e.cc_email, ''), ?) AS cc_email,
      COALESCE(NULLIF(e.mailbox, ''), ?) AS mailbox,
      l.company_name,
      l.segment_label,
      l.city,
      l.county
    FROM emarqet_outbound_email_events e
    LEFT JOIN emarqet_outbound_leads l ON l.id=e.outbound_lead_id AND l.company_id=e.company_id
    WHERE e.company_id=?
    ORDER BY datetime(COALESCE(e.sent_at, e.created_at)) DESC, e.id DESC
    LIMIT ?
  `).all(settings.officeEmail, settings.replyToEmail, settings.outreachCcEmails, settings.officeEmail, safeId, limit);

  const ticketRows = db.prepare(`
    SELECT
      r.*,
      COALESCE(NULLIF(r.mailbox, ''), ?) AS mailbox,
      s.name AS service_name,
      s.category AS service_category,
      l.title AS listing_title,
      l.listing_code
    FROM emarqet_service_requests r
    LEFT JOIN emarqet_marketplace_services s ON s.id=r.service_id AND s.company_id=r.company_id
    LEFT JOIN emarqet_listings l ON l.id=r.listing_id AND l.company_id=r.company_id
    WHERE r.company_id=?
    ORDER BY datetime(r.created_at) DESC, r.id DESC
    LIMIT ?
  `).all(settings.supportEmail, safeId, limit);

  const leadRows = db.prepare(`
    SELECT
      lead.*,
      l.title AS listing_title,
      l.listing_code,
      v.name AS vertical_name
    FROM emarqet_leads lead
    LEFT JOIN emarqet_listings l ON l.id=lead.listing_id AND l.company_id=lead.company_id
    LEFT JOIN emarqet_verticals v ON v.id=lead.vertical_id AND v.company_id=lead.company_id
    WHERE lead.company_id=?
    ORDER BY datetime(lead.created_at) DESC, lead.id DESC
    LIMIT ?
  `).all(safeId, limit);

  const inbound = [
    ...ticketRows.map((row) => ({
      type: "ticket",
      id: row.id,
      ticketNumber: ticketNumber(row),
      fromEmail: safeText(row.requester_email),
      toEmail: safeText(row.mailbox || settings.supportEmail),
      subject: safeText(row.email_subject || row.service_name || row.service_code || "Tichet suport"),
      contactName: safeText(row.requester_name),
      phone: safeText(row.requester_phone),
      status: safeText(row.status),
      details: [row.listing_title, row.listing_code, row.service_category, row.notes].map(safeText).filter(Boolean).join(" · "),
      createdAt: safeText(row.created_at),
      raw: row
    })),
    ...leadRows.map((row) => ({
      type: "lead",
      id: row.id,
      ticketNumber: "",
      fromEmail: safeText(row.requester_email),
      toEmail: safeText(settings.supportEmail),
      subject: safeText(row.source || "Lead e-Marqet"),
      contactName: safeText(row.requester_name),
      phone: safeText(row.requester_phone),
      status: safeText(row.status),
      details: [row.vertical_name, row.listing_title, row.listing_code].map(safeText).filter(Boolean).join(" · "),
      createdAt: safeText(row.created_at),
      raw: row
    }))
  ]
    .sort((a, b) => {
      const left = Date.parse(eventTime(b)) || 0;
      const right = Date.parse(eventTime(a)) || 0;
      return left - right;
    })
    .slice(0, limit);

  return {
    settings,
    summary,
    mailboxes,
    outbound,
    inbound,
    tickets: ticketRows
  };
}
