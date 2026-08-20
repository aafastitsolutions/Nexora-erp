const SUPPORT_EMAIL = "support@trevoro.ro";
const SUPPORT_WHATSAPP_DISPLAY = "+40 774 362 975";
const SUPPORT_WHATSAPP_URL = "https://wa.me/40774362975";

const ROMANIA_OWNER_PLANS = [
  {
    name: "Inscriere proprietar",
    includes: [
      "pagina publica pe Trevoro",
      "poze, descriere si facilitati",
      "disponibilitate si calendar iCal/ICS",
      "contact direct cu turistii"
    ]
  },
  {
    name: "Suport publicare",
    includes: [
      "verificarea datelor proprietatii",
      "pregatirea listarii pentru publicare",
      "suport pentru calendar si continut"
    ]
  },
  {
    name: "Promovare lansare",
    includes: [
      "continut dedicat pentru Facebook, Instagram, TikTok si YouTube",
      "campanii pentru proprietati selectate",
      "badge Partener Verificat unde se potriveste"
    ]
  }
];

const INTERNATIONAL_OWNER_PLANS = [
  {
    name: "Owner registration",
    includes: [
      "public page on Trevoro",
      "photos, description and amenities",
      "availability and iCal/ICS calendar",
      "direct guest requests"
    ]
  },
  {
    name: "Publishing support",
    includes: [
      "property data review",
      "listing preparation before publication",
      "calendar and content support"
    ]
  },
  {
    name: "Launch promotion",
    includes: [
      "dedicated content for Facebook, Instagram, TikTok and YouTube",
      "campaigns for selected properties",
      "Verified Partner badge where relevant"
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
    `- ${plan.name}: ${plan.includes.join("; ")}.`
  ]);
}

function planHtmlRows(plans = []) {
  return plans.map((plan) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold">${escapeHtml(plan.name)}</td>
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
  const subject = "Inscrieri deschise pe Trevoro: program de lansare gratuit";
  const text = [
    "Buna ziua,",
    "",
    "Va contactam din partea Trevoro, platforma romaneasca pentru promovarea cazarilor si vacantelor.",
    "",
    "Am dat drumul inscrierilor pentru proprietari si vrem sa aducem cat mai multe unitati de cazare intr-un singur loc, prezentate frumos, cu poze, disponibilitate si contact direct intre turist si proprietar.",
    "Haideti alaturi de noi sa promovam turismul din Romania si sa oferim proprietatilor locale o alternativa clara si simpla.",
    "",
    intro,
    "",
    "Pentru lansare, oferim inscrierea gratuita in programul Trevoro.",
    "Turistii va contacteaza direct, iar echipa Trevoro va ajuta sa pregatiti listarea.",
    "",
    "Programul de lansare include:",
    "",
    ...planTextLines(ROMANIA_OWNER_PLANS),
    "",
    "Contul gratuit de proprietar include administrarea paginii proprietatii, poze, disponibilitate si sincronizare calendar externa prin iCal/ICS pentru Booking.com, Airbnb, Google Calendar, Outlook sau alte calendare compatibile.",
    "",
    "Dupa inscriere, proprietarul este trimis direct in portalul de administrare, unde poate completa datele reale ale proprietatii si poate pregati listarea pentru publicare.",
    "",
    "Detaliile comerciale vor fi comunicate separat dupa finalizarea strategiei de monetizare.",
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
      <p>Am dat drumul inscrierilor pentru proprietari si vrem sa aducem cat mai multe unitati de cazare intr-un singur loc, prezentate frumos, cu poze, disponibilitate si contact direct intre turist si proprietar.</p>
      <p><strong>Haideti alaturi de noi sa promovam turismul din Romania</strong> si sa oferim proprietatilor locale o alternativa clara si simpla.</p>
      <p>${escapeHtml(intro)}</p>
      <p>Pentru lansare, oferim <strong>inscrierea gratuita in programul Trevoro</strong>. Turistii va contacteaza direct, iar echipa Trevoro va ajuta sa pregatiti listarea.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Optiune</th>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Ce include</th>
          </tr>
        </thead>
        <tbody>${planHtmlRows(ROMANIA_OWNER_PLANS)}</tbody>
      </table>
      <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:16px 0">
        <strong>Listarea gratuita include cont de proprietar</strong>
        <ul style="margin:10px 0 0;padding-left:18px">
          <li>Administrarea paginii proprietatii.</li>
          <li>Poze, descriere si disponibilitate.</li>
          <li>Sincronizare calendar externa prin iCal/ICS pentru Booking.com, Airbnb, Google Calendar, Outlook sau alte calendare compatibile.</li>
          <li>Suport pentru pregatirea listarii inainte de publicare.</li>
        </ul>
      </div>
      <p>Dupa inscriere, proprietarul este trimis direct in portalul de administrare, unde poate completa datele reale ale proprietatii.</p>
      <p>Detaliile comerciale vor fi comunicate separat dupa finalizarea strategiei de monetizare.</p>
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
  const subject = "Trevoro registrations are open: free launch program";
  const text = [
    "Hello,",
    "",
    "Trevoro is an accommodation platform for owners and property managers who want direct visibility and publishing support.",
    "",
    "Registrations are now open. We are bringing accommodation listings together in a clean, direct platform where guests can discover properties and contact owners.",
    "",
    intro,
    "",
    "For our launch phase, owner registration is free.",
    "Guests contact your property directly, and the Trevoro team helps you prepare the listing.",
    "",
    "The launch program includes:",
    "",
    ...planTextLines(INTERNATIONAL_OWNER_PLANS),
    "",
    "The free owner account includes listing management, photos, availability and external calendar synchronization through iCal/ICS for Booking.com, Airbnb, Google Calendar, Outlook or other compatible calendars.",
    "",
    "After registration, the owner is taken directly to the owner dashboard, where the property can be completed with real photos and availability before publication.",
    "",
    "Commercial details will be communicated separately after the monetization strategy is finalized.",
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
      <p><strong>Trevoro</strong> is an accommodation platform for owners and property managers who want direct visibility and publishing support.</p>
      <p>Registrations are now open. We are bringing accommodation listings together in a clean, direct platform where guests can discover properties and contact owners.</p>
      <p>${escapeHtml(intro)}</p>
      <p>For our launch phase, owner registration is <strong>free</strong>. Guests contact your property directly, and the Trevoro team helps you prepare the listing.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Option</th>
            <th style="padding:9px 10px;background:#f8fafc;text-align:left;border-bottom:1px solid #e2e8f0">Included</th>
          </tr>
        </thead>
        <tbody>${planHtmlRows(INTERNATIONAL_OWNER_PLANS)}</tbody>
      </table>
      <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:16px 0">
        <strong>The free listing includes an owner account</strong>
        <ul style="margin:10px 0 0;padding-left:18px">
          <li>Listing management.</li>
          <li>Photos, description and availability.</li>
          <li>External calendar synchronization through iCal/ICS for Booking.com, Airbnb, Google Calendar, Outlook or other compatible calendars.</li>
          <li>Support for preparing the property before publication.</li>
        </ul>
      </div>
      <p>After registration, the owner is taken directly to the owner dashboard, where the property can be completed with real photos and availability before publication.</p>
      <p>Commercial details will be communicated separately after the monetization strategy is finalized.</p>
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
