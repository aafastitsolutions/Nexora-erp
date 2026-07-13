const SUPPORT_EMAIL = "support@trevoro.ro";
const SUPPORT_WHATSAPP_DISPLAY = "+40 774 362 975";
const SUPPORT_WHATSAPP_URL = "https://wa.me/40774362975";

const ROMANIA_OWNER_PLANS = [
  {
    name: "Basic",
    price: "99 lei/luna",
    includes: [
      "pagina publica pe Trevoro",
      "poze, descriere, facilitati si preturi",
      "disponibilitate si calendar iCal/ICS",
      "contact direct cu turistii",
      "0% comision pe rezervari"
    ]
  },
  {
    name: "Premium",
    price: "149 lei/luna",
    includes: [
      "tot din Basic",
      "afisare prioritara in cautari si destinatii",
      "optimizare SEO pentru listare",
      "evidentiere in continut Trevoro",
      "suport prioritar"
    ]
  },
  {
    name: "Business",
    price: "249 lei/luna",
    includes: [
      "tot din Premium",
      "promovare in campanii social media",
      "continut dedicat pentru Facebook, Instagram, TikTok si YouTube",
      "badge Partener Verificat",
      "prioritate maxima"
    ]
  }
];

const INTERNATIONAL_OWNER_PLANS = [
  {
    name: "Basic",
    price: "19 EUR/month",
    includes: [
      "public page on Trevoro",
      "photos, description, amenities and prices",
      "availability and iCal/ICS calendar",
      "direct guest requests",
      "0% booking commission"
    ]
  },
  {
    name: "Premium",
    price: "29 EUR/month",
    includes: [
      "everything in Basic",
      "priority placement in search and destinations",
      "SEO optimization for the listing",
      "featured in Trevoro content",
      "priority support"
    ]
  },
  {
    name: "Business",
    price: "59 EUR/month",
    includes: [
      "everything in Premium",
      "promotion in social media campaigns",
      "dedicated content for Facebook, Instagram, TikTok and YouTube",
      "Verified Partner badge",
      "maximum priority"
    ]
  }
];

function safeText(value = "") {
  return String(value || "").trim();
}

function escapeHtml(value = "") {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizedBaseUrl(publicBaseUrl = "") {
  const baseUrl = safeText(publicBaseUrl || process.env.TREVORO_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "https://www.trevoro.ro")
    .replace(/\/+$/, "")
    .replace("https://trevoro.ro", "https://www.trevoro.ro");
  return baseUrl || "https://www.trevoro.ro";
}

function ownerUrl(publicBaseUrl = "", language = "ro") {
  const baseUrl = normalizedBaseUrl(publicBaseUrl);
  return language === "en" ? `${baseUrl}/en/owners#form` : `${baseUrl}/proprietari#formular`;
}

function isRomaniaLead(lead = {}) {
  return safeText(lead.country || "Romania").toLowerCase() === "romania";
}

function planTextLines(plans = []) {
  return plans.flatMap((plan) => [
    `- ${plan.name}: ${plan.price}`,
    `  Include: ${plan.includes.join("; ")}.`
  ]);
}

function planHtmlRows(plans = []) {
  return plans.map((plan) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold">${escapeHtml(plan.name)}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-weight:bold;color:#0f766e">${escapeHtml(plan.price)}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0">${escapeHtml(plan.includes.join("; "))}.</td>
    </tr>
  `).join("");
}

function romanianIntro(lead = {}) {
  const name = safeText(lead.name) || "proprietatea dumneavoastra";
  const city = safeText(lead.city);
  return city
    ? `Am gasit ${name} in ${city} si vrem sa va invitam sa creati contul de proprietar pe Trevoro.`
    : `Am gasit ${name} si vrem sa va invitam sa creati contul de proprietar pe Trevoro.`;
}

function internationalIntro(lead = {}) {
  const name = safeText(lead.name) || "your property";
  const city = safeText(lead.city);
  return city
    ? `We found ${name} in ${city} and would like to invite your team to create an owner account on Trevoro.`
    : `We found ${name} and would like to invite your team to create an owner account on Trevoro.`;
}

function buildRomanianOutreachMessage(lead = {}, options = {}) {
  const claimUrl = ownerUrl(options.publicBaseUrl, "ro");
  const intro = romanianIntro(lead);
  const subject = "Publicati proprietatea pe Trevoro - plan fix, 0% comision";
  const text = [
    "Buna ziua,",
    "",
    "Va contactam din partea Trevoro, platforma romaneasca pentru promovarea cazarilor si vacantelor.",
    "",
    intro,
    "",
    "Trevoro functioneaza cu abonament lunar fix si 0% comision pe rezervari:",
    "",
    ...planTextLines(ROMANIA_OWNER_PLANS),
    "",
    "Contul de proprietar include administrarea paginii proprietatii, poze, preturi, disponibilitate si sincronizare calendar externa prin iCal/ICS pentru Booking.com, Airbnb, Google Calendar, Outlook sau alte calendare compatibile.",
    "",
    "Dupa inscriere, proprietarul este trimis direct in portalul de administrare, unde poate completa datele reale ale proprietatii si poate pregati listarea pentru publicare.",
    "",
    "Trevoro nu incaseaza platile turistilor si nu retine comision din fiecare rezervare. Plata si regulile rezervarii raman intre turist si proprietate.",
    "",
    "Inscriere proprietate:",
    claimUrl,
    "",
    `Pentru intrebari sau suport tehnic, ne puteti contacta la ${SUPPORT_EMAIL} sau pe WhatsApp la ${SUPPORT_WHATSAPP_DISPLAY}.`,
    "Program suport: 09:00-18:00, luni-vineri.",
    "",
    "Daca nu doriti sa mai primiti mesaje de la noi, raspundeti cu Stop si nu va mai contactam.",
    "",
    "Cu stima,",
    "Echipa Trevoro",
    SUPPORT_EMAIL,
    "https://www.trevoro.ro"
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
      <p>Buna ziua,</p>
      <p>Va contactam din partea <strong>Trevoro</strong>, platforma romaneasca pentru promovarea cazarilor si vacantelor.</p>
      <p>${escapeHtml(intro)}</p>
      <p>Trevoro functioneaza cu <strong>abonament lunar fix</strong> si <strong>0% comision pe rezervari</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Plan</th>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Cost publicare</th>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Ce include</th>
          </tr>
        </thead>
        <tbody>${planHtmlRows(ROMANIA_OWNER_PLANS)}</tbody>
      </table>
      <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:16px 0">
        <strong>Toate planurile includ cont de proprietar</strong>
        <ul style="margin:10px 0 0;padding-left:18px">
          <li>Administrarea paginii proprietatii.</li>
          <li>Poze, preturi si disponibilitate.</li>
          <li>Sincronizare calendar externa prin iCal/ICS pentru Booking.com, Airbnb, Google Calendar, Outlook sau alte calendare compatibile.</li>
          <li>Suport pentru pregatirea listarii inainte de publicare.</li>
        </ul>
      </div>
      <p>Dupa inscriere, proprietarul este trimis direct in portalul de administrare, unde poate completa datele reale ale proprietatii.</p>
      <p>Trevoro nu incaseaza platile turistilor si nu retine comision din fiecare rezervare. Plata si regulile rezervarii raman intre turist si proprietate.</p>
      <p><strong>Inscriere proprietate:</strong><br><a href="${escapeHtml(claimUrl)}">${escapeHtml(claimUrl)}</a></p>
      <p>Pentru intrebari sau suport tehnic, ne puteti contacta la <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> sau pe WhatsApp la <a href="${SUPPORT_WHATSAPP_URL}">${SUPPORT_WHATSAPP_DISPLAY}</a>.</p>
      <p><strong>Program suport:</strong> 09:00-18:00, luni-vineri.</p>
      <p style="font-size:13px;color:#64748b">Daca nu doriti sa mai primiti mesaje de la noi, raspundeti cu Stop si nu va mai contactam.</p>
      <p>Cu stima,<br>Echipa Trevoro<br><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a><br><a href="https://www.trevoro.ro">https://www.trevoro.ro</a></p>
    </div>
  `;

  return { subject, text, html, claimUrl, language: "ro" };
}

function buildInternationalOutreachMessage(lead = {}, options = {}) {
  const claimUrl = ownerUrl(options.publicBaseUrl, "en");
  const intro = internationalIntro(lead);
  const subject = "List your property on Trevoro - fixed monthly plan, 0% booking commission";
  const text = [
    "Hello,",
    "",
    "Trevoro is an accommodation platform for owners and property managers who want direct visibility, predictable costs and no booking commission.",
    "",
    intro,
    "",
    "Trevoro works with a fixed monthly publication plan and 0% booking commission:",
    "",
    ...planTextLines(INTERNATIONAL_OWNER_PLANS),
    "",
    "The owner account includes listing management, photos, prices, availability and external calendar synchronization through iCal/ICS for Booking.com, Airbnb, Google Calendar, Outlook or other compatible calendars.",
    "",
    "After registration, the owner is taken directly to the owner dashboard, where the property can be completed with real photos, prices and availability before publication.",
    "",
    "Trevoro does not collect guest payments and does not take commission from each booking. Payment and booking rules remain between the guest and the property.",
    "",
    "Create your owner account:",
    claimUrl,
    "",
    `If you have any questions, you can contact us by email at ${SUPPORT_EMAIL} or WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}.`,
    "Support hours: 09:00-18:00, Monday-Friday, Romania time.",
    "",
    "If you do not want to receive messages from us, reply with \"Stop\" and we will not contact you again.",
    "",
    "Best regards,",
    "The Trevoro Team",
    SUPPORT_EMAIL,
    "https://www.trevoro.ro"
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
      <p>Hello,</p>
      <p><strong>Trevoro</strong> is an accommodation platform for owners and property managers who want direct visibility, predictable costs and no booking commission.</p>
      <p>${escapeHtml(intro)}</p>
      <p>Trevoro works with a <strong>fixed monthly publication plan</strong> and <strong>0% booking commission</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Plan</th>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Publication cost</th>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Included</th>
          </tr>
        </thead>
        <tbody>${planHtmlRows(INTERNATIONAL_OWNER_PLANS)}</tbody>
      </table>
      <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:16px 0">
        <strong>Every plan includes an owner account</strong>
        <ul style="margin:10px 0 0;padding-left:18px">
          <li>Listing management.</li>
          <li>Photos, prices and availability.</li>
          <li>External calendar synchronization through iCal/ICS for Booking.com, Airbnb, Google Calendar, Outlook or other compatible calendars.</li>
          <li>Support for preparing the property before publication.</li>
        </ul>
      </div>
      <p>After registration, the owner is taken directly to the owner dashboard, where the property can be completed with real photos, prices and availability before publication.</p>
      <p>Trevoro does not collect guest payments and does not take commission from each booking. Payment and booking rules remain between the guest and the property.</p>
      <p><strong>Create your owner account:</strong><br><a href="${escapeHtml(claimUrl)}">${escapeHtml(claimUrl)}</a></p>
      <p>If you have any questions, you can contact us by email at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> or by WhatsApp at <a href="${SUPPORT_WHATSAPP_URL}">${SUPPORT_WHATSAPP_DISPLAY}</a>.</p>
      <p><strong>Support hours:</strong> 09:00-18:00, Monday-Friday, Romania time.</p>
      <p style="font-size:13px;color:#64748b">If you do not want to receive messages from us, reply with "Stop" and we will not contact you again.</p>
      <p>Best regards,<br>The Trevoro Team<br><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a><br><a href="https://www.trevoro.ro">https://www.trevoro.ro</a></p>
    </div>
  `;

  return { subject, text, html, claimUrl, language: "en" };
}

export function buildTrevoroOutreachMessage(lead = {}, options = {}) {
  return isRomaniaLead(lead)
    ? buildRomanianOutreachMessage(lead, options)
    : buildInternationalOutreachMessage(lead, options);
}

export function trevoroOutreachMessageSamples(options = {}) {
  return [
    {
      key: "romania",
      label: "Romania",
      ...buildRomanianOutreachMessage({
        name: "Pensiunea Exemplu",
        city: "Brasov",
        country: "Romania"
      }, options)
    },
    {
      key: "international",
      label: "International",
      ...buildInternationalOutreachMessage({
        name: "Sample Boutique Hotel",
        city: "Lisbon",
        country: "Portugal"
      }, options)
    }
  ];
}

export {
  ROMANIA_OWNER_PLANS,
  INTERNATIONAL_OWNER_PLANS,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY
};
