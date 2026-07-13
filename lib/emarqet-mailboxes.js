const DEFAULT_OFFICE_EMAIL = "office@e-marqet.com";
const DEFAULT_SUPPORT_EMAIL = "suport@e-marqet.com";

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function normalizeEmailList(value = "") {
  return String(value || "")
    .split(/[;,\s]+/)
    .map(normalizeEmail)
    .filter(Boolean)
    .join(", ");
}

export function emarqetOfficeEmail() {
  return normalizeEmail(
    process.env.EMARQET_OFFICE_EMAIL
    || process.env.EMARQET_OUTBOUND_FROM_EMAIL
    || DEFAULT_OFFICE_EMAIL
  ) || DEFAULT_OFFICE_EMAIL;
}

export function emarqetSupportEmail() {
  return normalizeEmail(process.env.EMARQET_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL) || DEFAULT_SUPPORT_EMAIL;
}

export function emarqetReplyToEmail() {
  return normalizeEmail(
    process.env.EMARQET_REPLY_TO
    || process.env.EMARQET_REPLY_TO_EMAIL
    || process.env.MAIL_REPLY_TO
    || process.env.REPLY_TO
    || emarqetSupportEmail()
  ) || emarqetSupportEmail();
}

export function emarqetOutreachCcEmails() {
  const configured = Object.hasOwn(process.env, "EMARQET_OUTREACH_CC")
    ? process.env.EMARQET_OUTREACH_CC
    : emarqetOfficeEmail();
  return normalizeEmailList(configured);
}

export function emarqetMailboxSettings() {
  const officeEmail = emarqetOfficeEmail();
  const supportEmail = emarqetSupportEmail();
  const replyToEmail = emarqetReplyToEmail();
  const outreachCcEmails = emarqetOutreachCcEmails();
  return {
    officeEmail,
    supportEmail,
    replyToEmail,
    outreachCcEmails,
    outboundSenderEmail: officeEmail,
    supportTicketEmail: supportEmail,
    inboundSupportEmail: supportEmail
  };
}
