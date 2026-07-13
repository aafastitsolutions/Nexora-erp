import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { cleanEmailBodyPreview } from "./email-reply-cleaner.js";

const DEFAULT_MAILBOX = "contact@trevoro.ro";

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function envBoolean(value = "", fallback = false) {
  const normalized = safeText(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "ssl"].includes(normalized);
}

function envNumber(value = "", fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function dateDaysAgo(days = 14) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, Number(days || 14)));
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function extractEmail(address = {}) {
  return normalizeEmail(address.address || "");
}

function uniqueEmails(list = []) {
  return [...new Set(list.map(extractEmail).filter(Boolean))];
}

function bodyPreview(value = "", limit = 900) {
  return cleanEmailBodyPreview(value, limit);
}

function textContainsStop(value = "") {
  const visibleReplyStart = safeText(value)
    .split(/\n\s*(>|on .+wrote:|în .+ a scris:|from:|de la:)/i)[0]
    .slice(0, 400);
  return /\b(stop|unsubscribe|dezabon|nu ma contacta|nu mă contacta)\b/i.test(visibleReplyStart);
}

function isBounceMessage({ subject = "", body = "", fromEmails = [] } = {}) {
  const from = fromEmails.join(" ").toLowerCase();
  const haystack = `${subject}\n${body}`.toLowerCase();
  return from.includes("mailer-daemon")
    || from.includes("postmaster")
    || haystack.includes("delivery status notification")
    || haystack.includes("mail delivery failed")
    || haystack.includes("undeliverable")
    || haystack.includes("returned mail")
    || haystack.includes("message not delivered")
    || haystack.includes("delivery has failed");
}

function extractEmailsFromText(value = "") {
  return [...new Set(safeText(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])]
    .map(normalizeEmail)
    .filter(Boolean);
}

function configuredSenderEmails(config = {}) {
  return new Set([
    config.user,
    process.env.MAIL_FROM,
    process.env.EMAIL_FROM,
    process.env.SMTP_USER,
    process.env.TREVORO_REPLY_TO,
    "contact@trevoro.ro",
    "support@trevoro.ro"
  ].map(normalizeEmail).filter(Boolean));
}

function messageIdFor(message = {}, parsed = {}) {
  return safeText(parsed.messageId || message.envelope?.messageId || `uid:${message.uid}`);
}

function compactConfig(config = {}) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    mailbox: config.mailbox,
    configured: Boolean(config.configured)
  };
}

function buildTravelEmailSyncConfig({
  host,
  port,
  secure,
  user,
  pass,
  mailbox
} = {}) {
  const resolvedPort = envNumber(port, 993);
  return {
    host: safeText(host || "mail.zooku.ro"),
    port: resolvedPort,
    secure: envBoolean(secure, resolvedPort === 993),
    user: safeText(user),
    pass: safeText(pass),
    mailbox: safeText(mailbox || "INBOX"),
    configured: Boolean(host && resolvedPort && user && pass)
  };
}

export function travelEmailSyncConfigs() {
  const primary = buildTravelEmailSyncConfig({
    host: process.env.TREVORO_IMAP_HOST || process.env.IMAP_HOST || "mail.zooku.ro",
    port: process.env.TREVORO_IMAP_PORT || process.env.IMAP_PORT || 993,
    secure: process.env.TREVORO_IMAP_SECURE || process.env.IMAP_SECURE,
    user: process.env.TREVORO_IMAP_USER || process.env.IMAP_USER || process.env.SMTP_USER || DEFAULT_MAILBOX,
    pass: process.env.TREVORO_IMAP_PASS || process.env.IMAP_PASS || process.env.TREVORO_MAIL_PASS || "",
    mailbox: process.env.TREVORO_IMAP_MAILBOX || process.env.IMAP_MAILBOX || "INBOX"
  });
  const support = buildTravelEmailSyncConfig({
    host: process.env.TREVORO_SUPPORT_IMAP_HOST || process.env.SUPPORT_IMAP_HOST || primary.host,
    port: process.env.TREVORO_SUPPORT_IMAP_PORT || process.env.SUPPORT_IMAP_PORT || primary.port,
    secure: process.env.TREVORO_SUPPORT_IMAP_SECURE || process.env.SUPPORT_IMAP_SECURE || String(primary.secure),
    user: process.env.TREVORO_SUPPORT_IMAP_USER || process.env.SUPPORT_IMAP_USER || "",
    pass: process.env.TREVORO_SUPPORT_IMAP_PASS || process.env.SUPPORT_IMAP_PASS || "",
    mailbox: process.env.TREVORO_SUPPORT_IMAP_MAILBOX || process.env.SUPPORT_IMAP_MAILBOX || "INBOX"
  });
  const configs = [primary, support].filter((config) => config.user);
  const seen = new Set();
  return configs.filter((config) => {
    const key = `${config.host}:${config.port}:${config.user}:${config.mailbox}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function travelEmailSyncConfig() {
  const configs = travelEmailSyncConfigs();
  const configured = configs.filter((config) => config.configured);
  const primary = configs[0] || buildTravelEmailSyncConfig({
    host: process.env.TREVORO_IMAP_HOST || process.env.IMAP_HOST || "mail.zooku.ro",
    port: process.env.TREVORO_IMAP_PORT || process.env.IMAP_PORT || 993,
    secure: process.env.TREVORO_IMAP_SECURE || process.env.IMAP_SECURE,
    user: process.env.TREVORO_IMAP_USER || process.env.IMAP_USER || process.env.SMTP_USER || DEFAULT_MAILBOX,
    pass: process.env.TREVORO_IMAP_PASS || process.env.IMAP_PASS || process.env.TREVORO_MAIL_PASS || "",
    mailbox: process.env.TREVORO_IMAP_MAILBOX || process.env.IMAP_MAILBOX || "INBOX"
  });
  return {
    ...primary,
    configured: Boolean(configured.length),
    mailboxes: configs.map(compactConfig)
  };
}

function findLeadByEmail(db, companyId, emails = []) {
  const normalized = emails.map(normalizeEmail).filter(Boolean);
  if (!normalized.length) return null;
  const placeholders = normalized.map(() => "lower(email)=?").join(" OR ");
  return db.prepare(`
    SELECT *
    FROM travel_leads
    WHERE company_id=?
      AND COALESCE(email, '')<>''
      AND (${placeholders})
    ORDER BY
      CASE status
        WHEN 'contactat' THEN 1
        WHEN 'nou' THEN 2
        WHEN 'interesat' THEN 3
        ELSE 4
      END ASC,
      updated_at DESC,
      id DESC
    LIMIT 1
	  `).get(companyId, ...normalized) || null;
}

function findLeadByAnyEmail(db, companyId, emails = []) {
  const normalized = emails.map(normalizeEmail).filter(Boolean);
  if (!normalized.length) return null;
  const placeholders = normalized.map(() => "lower(email)=?").join(" OR ");
  return db.prepare(`
    SELECT *
    FROM travel_leads
    WHERE company_id=?
      AND COALESCE(email, '')<>''
      AND (${placeholders})
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(companyId, ...normalized) || null;
}

function messageExists(db, companyId, mailbox, providerMessageId) {
  return Boolean(db.prepare(`
    SELECT id
    FROM travel_email_messages
    WHERE company_id=? AND mailbox=? AND provider_message_id=?
    LIMIT 1
  `).get(companyId, mailbox, providerMessageId));
}

function messageExistsInAnyMailbox(db, companyId, providerMessageId) {
  return Boolean(db.prepare(`
    SELECT id
    FROM travel_email_messages
    WHERE company_id=? AND provider_message_id=?
    LIMIT 1
  `).get(companyId, providerMessageId));
}

function similarEmailMessageExists(db, companyId, {
  direction = "",
  lead = null,
  fromEmails = [],
  toEmails = [],
  subject = ""
} = {}) {
  const fromEmail = normalizeEmail(fromEmails[0] || "");
  const toEmail = normalizeEmail(toEmails[0] || "");
  if (!direction || !fromEmail || !toEmail || !subject) return false;
  const row = db.prepare(`
    SELECT id
    FROM travel_email_messages
    WHERE company_id=?
      AND direction=?
      AND lower(trim(COALESCE(from_email, '')))=?
      AND lower(trim(COALESCE(to_email, '')))=?
      AND trim(COALESCE(subject, ''))=?
      AND (? IS NULL OR lead_id=?)
    LIMIT 1
  `).get(
    companyId,
    safeText(direction),
    fromEmail,
    toEmail,
    safeText(subject),
    lead?.id ? Number(lead.id) : null,
    lead?.id ? Number(lead.id) : null
  );
  return Boolean(row?.id);
}

function saveMessage(db, companyId, lead, mailbox, message, parsed, fromEmails, toEmails, { direction = "inbound", bounce = false, stopRequest = false } = {}) {
  const providerMessageId = messageIdFor(message, parsed);
  const subject = safeText(parsed.subject || message.envelope?.subject || "(fără subiect)");
  const textBody = bodyPreview(parsed.text || parsed.html || "");
  const receivedAt = isoDate(parsed.date || message.envelope?.date);

  const save = db.transaction(() => {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO travel_email_messages (
        company_id, lead_id, mailbox, direction, provider_message_id,
        from_email, to_email, subject, text_body, received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      lead?.id || null,
      mailbox,
      direction,
      providerMessageId,
      fromEmails.join(", "),
      toEmails.join(", "),
      subject,
      textBody,
      receivedAt
    );

    if (!insert.changes || !lead?.id) {
      return { inserted: Boolean(insert.changes), matched: Boolean(lead?.id), statusChanged: false };
    }

    if (bounce) {
      db.prepare(`
        INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
        VALUES (?, ?, 'outreach_email_bounced', 'Email respins de server', ?, datetime('now'))
      `).run(
        companyId,
        lead.id,
        `De la: ${fromEmails.join(", ") || "-"}; subiect: ${subject}; ${textBody}`
      );
      return { inserted: true, matched: true, statusChanged: false, bounced: true };
    }

    if (stopRequest) {
      db.prepare(`
        UPDATE travel_leads
        SET status='respins',
            next_follow_up_at=NULL,
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(lead.id, companyId);
      db.prepare(`
        INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
        VALUES (?, ?, 'outreach_stop_requested', 'Stop contactare', ?, datetime('now'))
      `).run(companyId, lead.id, `Subiect: ${subject}; ${textBody}`);
      return { inserted: true, matched: true, statusChanged: lead.status !== "respins", stopRequested: true };
    }

    let statusChanged = false;
    if (!["interesat", "demo_programat", "activ", "respins"].includes(safeText(lead.status))) {
      db.prepare(`
        UPDATE travel_leads
        SET status='interesat',
            updated_at=datetime('now')
        WHERE id=? AND company_id=?
      `).run(lead.id, companyId);
      statusChanged = true;
      db.prepare(`
        INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
        VALUES (?, ?, 'status_changed', 'Status schimbat', ?, datetime('now'))
      `).run(companyId, lead.id, `${lead.status || "-"} -> interesat`);
    }

    db.prepare(`
      INSERT INTO travel_lead_activities (company_id, lead_id, activity_type, subject, details, created_at)
      VALUES (?, ?, 'email_reply_received', 'Răspuns email primit', ?, datetime('now'))
    `).run(
      companyId,
      lead.id,
      `De la: ${fromEmails.join(", ") || "-"}; subiect: ${subject}; ${textBody}`
    );

    return { inserted: true, matched: true, statusChanged };
  });

  return save();
}

function emptySyncStats(mailboxes = []) {
  return {
    ok: true,
    scanned: 0,
    imported: 0,
    matched: 0,
    statusChanged: 0,
    bounced: 0,
    stopRequested: 0,
    skippedExisting: 0,
    unmatched: 0,
    mailbox: mailboxes.join(", "),
    mailboxResults: [],
    mailboxErrors: []
  };
}

function mergeSyncStats(total, item) {
  for (const key of ["scanned", "imported", "matched", "statusChanged", "bounced", "stopRequested", "skippedExisting", "unmatched"]) {
    total[key] += Number(item?.[key] || 0);
  }
  if (item?.mailboxResult) total.mailboxResults.push(item.mailboxResult);
  if (item?.mailboxError) total.mailboxErrors.push(item.mailboxError);
  return total;
}

async function syncTravelEmailRepliesForConfig({ db, companyId, sinceDays = 14, limit = 50, config } = {}) {
  if (!config.configured) {
    return {
      ...emptySyncStats([config.user].filter(Boolean)),
      ok: false,
      error: "imap_not_configured",
      mailboxError: { ...compactConfig(config), error: "imap_not_configured" }
    };
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    logger: false
  });

  const stats = {
    ...emptySyncStats([config.user]),
    mailboxResult: { ...compactConfig(config), scanned: 0, imported: 0 }
  };

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);
  try {
    const search = await client.search({ since: dateDaysAgo(sinceDays) });
    const ids = Array.isArray(search) ? search.slice(-Math.max(1, Number(limit || 50))) : [];
    if (!ids.length) return stats;

    for await (const message of client.fetch(ids, { uid: true, envelope: true, source: true })) {
      stats.scanned += 1;
      const parsed = await simpleParser(message.source);
      const providerMessageId = messageIdFor(message, parsed);
      if (messageExists(db, companyId, config.user, providerMessageId)) {
        stats.skippedExisting += 1;
        continue;
      }
      if (messageExistsInAnyMailbox(db, companyId, providerMessageId)) {
        stats.skippedExisting += 1;
        continue;
      }

      const fromEmails = uniqueEmails(parsed.from?.value || message.envelope?.from || []);
      const replyToEmails = uniqueEmails(parsed.replyTo?.value || message.envelope?.replyTo || []);
      const toEmails = uniqueEmails([
        ...(parsed.to?.value || []),
        ...(message.envelope?.to || [])
      ]);
      const subject = safeText(parsed.subject || message.envelope?.subject || "(fără subiect)");
      const rawBody = safeText(parsed.text || parsed.html || "");
      const bounce = isBounceMessage({ subject, body: rawBody, fromEmails });
      const senderEmails = configuredSenderEmails(config);
      const fromIsOurs = fromEmails.some((email) => senderEmails.has(normalizeEmail(email)));
      const toIsOurs = toEmails.some((email) => senderEmails.has(normalizeEmail(email)));
      const direction = bounce ? "bounce" : fromIsOurs && !toIsOurs ? "outbound" : "inbound";
      const stopRequest = direction === "inbound" && !bounce && textContainsStop(`${subject}\n${rawBody}`);
      const lead = bounce
        ? findLeadByAnyEmail(db, companyId, extractEmailsFromText(rawBody))
        : direction === "outbound"
          ? findLeadByEmail(db, companyId, toEmails)
          : findLeadByEmail(db, companyId, [...fromEmails, ...replyToEmails]);
      if (direction === "outbound" && similarEmailMessageExists(db, companyId, { direction, lead, fromEmails, toEmails, subject })) {
        stats.skippedExisting += 1;
        continue;
      }
      if (direction === "inbound" && similarEmailMessageExists(db, companyId, { direction, lead, fromEmails, toEmails, subject })) {
        stats.skippedExisting += 1;
        continue;
      }
      const result = saveMessage(db, companyId, lead, config.user, message, parsed, fromEmails, toEmails, {
        direction,
        bounce,
        stopRequest
      });

      if (result.inserted) stats.imported += 1;
      if (result.matched) stats.matched += 1;
      if (result.statusChanged) stats.statusChanged += 1;
      if (result.bounced) stats.bounced += 1;
      if (result.stopRequested) stats.stopRequested += 1;
      if (!result.matched) stats.unmatched += 1;
    }
    stats.mailboxResult.scanned = stats.scanned;
    stats.mailboxResult.imported = stats.imported;
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  return stats;
}

export async function syncTravelEmailReplies({ db, companyId, sinceDays = 14, limit = 50 } = {}) {
  const configs = travelEmailSyncConfigs();
  const configuredConfigs = configs.filter((config) => config.configured);
  if (!configuredConfigs.length) {
    return {
      ok: false,
      error: "imap_not_configured",
      config: { ...travelEmailSyncConfig(), pass: "" }
    };
  }

  const total = emptySyncStats(configs.map((config) => config.user).filter(Boolean));
  for (const config of configuredConfigs) {
    try {
      const result = await syncTravelEmailRepliesForConfig({ db, companyId, sinceDays, limit, config });
      mergeSyncStats(total, result);
    } catch (error) {
      total.mailboxErrors.push({
        ...compactConfig(config),
        error: safeText(error?.message || error || "imap_sync_failed")
      });
    }
  }
  total.ok = total.mailboxErrors.length < configuredConfigs.length;
  if (!total.ok) total.error = "imap_sync_failed";
  return total;
}
