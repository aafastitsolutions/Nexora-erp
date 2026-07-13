import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function safeText(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function jsonParse(value, fallback = {}) {
  const text = safeText(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function jsonString(value) {
  return JSON.stringify(value || {});
}

function credentialSecret() {
  return safeText(
    process.env.EMARQET_CREDENTIAL_SECRET ||
    process.env.NEXORA_CREDENTIAL_SECRET ||
    process.env.APP_SECRET ||
    process.env.SESSION_SECRET ||
    "nexora-emarqet-local-credential-secret"
  );
}

function encryptionKey() {
  return createHash("sha256").update(credentialSecret()).digest();
}

function encryptJson(value = {}) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(value || {}), "utf8"),
    cipher.final()
  ]);
  return JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: payload.toString("base64")
  });
}

function decryptJson(value = "") {
  const payload = jsonParse(value, null);
  if (!payload?.data || !payload?.iv || !payload?.tag) return {};
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const data = Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final()
    ]).toString("utf8");
    return jsonParse(data, {});
  } catch {
    return {};
  }
}

function provider(
  key,
  category,
  name,
  {
    capabilities = [],
    credentialFields = [],
    configFields = [],
    merchantFields = [],
    docs = [],
    analysis = {},
    checklist = [],
    sandbox = "",
    production = "",
    activationTime = "",
    contract = "",
    costs = "",
    contact = ""
  } = {}
) {
  return {
    key,
    category,
    name,
    capabilities,
    credentialFields,
    configFields,
    merchantFields,
    docs,
    analysis,
    checklist,
    sandbox,
    production,
    activationTime,
    contract,
    costs,
    contact
  };
}

const DEFAULT_CHECKLIST = [
  "Creeaza cont",
  "Solicita acces API",
  "Obtine API Key",
  "Configureaza webhook",
  "Testeaza Sandbox",
  "Testeaza productia",
  "Activeaza in platforma"
];

const COURIER_CHECKLIST = [
  "Semneaza contract comercial cu furnizorul",
  "Solicita acces API si cont de test",
  "Obtine credentiale sandbox",
  "Configureaza punctul de pickup",
  "Testeaza generare AWB",
  "Testeaza tracking",
  "Testeaza retur si ramburs",
  "Activeaza productia"
];

export const EMARQET_INTEGRATION_PROVIDERS = [
  provider("fan_courier", "courier", "FAN Courier", {
    capabilities: ["AWB", "tracking", "pickup", "retur", "ramburs", "FANbox/PUDO"],
    credentialFields: ["client_id", "username", "password"],
    configFields: ["api_base_url", "sandbox_base_url", "default_pickup_point", "default_service", "sample_awb"],
    merchantFields: ["sender_name", "sender_phone", "sender_email", "sender_address", "cod_iban"],
    sandbox: "Contul si endpointurile de test se solicita de la FAN Courier.",
    production: "https://api.fancourier.ro",
    contract: "Contract comercial FAN Courier pentru servicii de curierat, ramburs si PUDO/FANbox.",
    costs: "Costurile sunt cele din contractul FAN Courier: transport, ramburs, retur, servicii optionale si eventuale taxe combustibil.",
    contact: "FAN Courier, managerul comercial sau formularul de contact din fancourier.ro.",
    docs: [
      ["API documentation FAN Courier", "https://www.fancourier.ro/wp-content/uploads/2025/09/EN_FANCourier_API_130825-1.pdf"],
      ["FAN Courier", "https://www.fancourier.ro/"]
    ],
    analysis: {
      offers: "Genereaza AWB, urmareste expeditii, pregateste pickup, retur, ramburs si puncte FANbox/PUDO.",
      userBenefits: "Comerciantul poate livra rapid si poate urmari comenzile direct din E-MARQET.",
      platformBenefits: "E-MARQET devine operational pentru e-commerce cu livrare si ramburs integrate.",
      limitations: "Necesita contract si credentiale FAN; formatul AWB si optiunile depind de serviciile activate pe cont."
    },
    checklist: COURIER_CHECKLIST,
    activationTime: "2-10 zile lucratoare, in functie de contract si acces API."
  }),
  provider("sameday", "courier", "Sameday", {
    capabilities: ["AWB", "easybox", "tracking", "pickup", "retur", "ramburs"],
    credentialFields: ["username", "password"],
    configFields: ["api_base_url", "sandbox_base_url", "default_pickup_point", "default_service", "sample_awb"],
    merchantFields: ["sender_name", "sender_phone", "sender_email", "sender_address", "easybox_enabled"],
    sandbox: "Contul demo si URL-ul sandbox se solicita de la Sameday.",
    production: "URL-ul de productie este furnizat de Sameday la activarea contractului.",
    contract: "Contract Sameday pentru livrare, easybox, ramburs si servicii aditionale.",
    costs: "Costurile sunt pe oferta comerciala Sameday: livrare, easybox, ramburs, retur, asigurare si servicii aditionale.",
    contact: "Sameday sales/support; pentru plugin WooCommerce apare si plugineasybox@sameday.ro.",
    docs: [
      ["Sameday PHP SDK", "https://github.com/sameday-courier/php-sdk"],
      ["Sameday Courier", "https://sameday.ro/?lang=en"],
      ["Sameday easybox", "https://sameday.ro/easybox/vreau-sa-utilizez-serviciul-easybox/"]
    ],
    analysis: {
      offers: "AWB, easybox, tracking, pickup, retur si ramburs pentru comenzi marketplace.",
      userBenefits: "Comerciantul poate oferi easybox si livrare moderna fara operare manuala.",
      platformBenefits: "Creste conversia pentru marketplace prin metode de livrare familiare cumparatorilor.",
      limitations: "Endpointurile si credentialele sunt furnizate pe baza de cont/contract; easybox necesita configurarea punctelor si serviciilor disponibile."
    },
    checklist: COURIER_CHECKLIST,
    activationTime: "2-10 zile lucratoare, in functie de contract si contul easybox."
  }),
  provider("dpd", "courier_future", "DPD", {
    capabilities: ["AWB", "tracking", "label", "pickup", "retur"],
    credentialFields: ["username", "password"],
    configFields: ["api_base_url", "sandbox_base_url", "default_service", "sample_awb"],
    merchantFields: ["sender_name", "sender_phone", "sender_address"],
    sandbox: "https://api.dpd.ro",
    production: "https://api.dpd.ro",
    contract: "Contract DPD Romania si acces Web API.",
    costs: "Costuri contractuale DPD pentru expeditii, retur si servicii aditionale.",
    contact: "DPD Romania, suport comercial/API.",
    docs: [
      ["DPD Romania Web API", "https://api.dpd.ro/api/docs/"],
      ["DPD API FAQ", "https://www.dpd.com/ro/en/faq/unde-este-documentatia-de-api/"]
    ],
    analysis: {
      offers: "Arhitectura pregatita pentru AWB, etichete, tracking si retur.",
      userBenefits: "Comerciantii pot alege DPD cand contractul lor este mai bun.",
      platformBenefits: "E-MARQET nu ramane dependent de un singur curier.",
      limitations: "Activarea necesita cont DPD si validarea serviciilor disponibile."
    },
    checklist: COURIER_CHECKLIST,
    activationTime: "3-10 zile lucratoare."
  }),
  provider("cargus", "courier_future", "Cargus", {
    capabilities: ["AWB", "tracking", "pickup", "retur", "ramburs", "click&collect"],
    credentialFields: ["subscription_key", "username", "password"],
    configFields: ["api_base_url", "sandbox_base_url", "default_pickup_location", "sample_awb"],
    merchantFields: ["sender_name", "sender_phone", "sender_address"],
    sandbox: "Mediul de test gratuit este solicitat de la Cargus.",
    production: "https://urgentcargus.azure-api.net/api",
    contract: "Contract Cargus si acces in portalul/developer API.",
    costs: "Costuri contractuale Cargus pentru livrare, ramburs si servicii optionale.",
    contact: "Cargus sales/support sau portalul developer Azure API Management.",
    docs: [
      ["Cargus tools and solutions", "https://www.cargus.ro/en/entrepreneurs/tools-and-solutions/"],
      ["Cargus developer portal", "https://urgentcargus.developer.azure-api.net/"],
      ["Cargus API V3 documentation", "https://www.cargus.ro/wp-content/uploads/DocumentatieAPIV3-2.0-EN.pdf"]
    ],
    analysis: {
      offers: "Pregateste AWB, nomenclatoare, pickup, ramburs, retur si click&collect.",
      userBenefits: "Comerciantii cu contract Cargus pot activa livrarea fara schimbari in platforma.",
      platformBenefits: "Extinde acoperirea nationala si optiunile de negociere.",
      limitations: "Necesita subscription key si cont WebExpress/API; nomenclatoarele trebuie sincronizate."
    },
    checklist: COURIER_CHECKLIST,
    activationTime: "3-10 zile lucratoare."
  }),
  provider("gls", "courier_future", "GLS", {
    capabilities: ["AWB", "tracking", "label", "pickup", "retur"],
    credentialFields: ["username", "password", "client_number"],
    configFields: ["api_base_url", "sandbox_base_url", "default_service", "sample_awb"],
    merchantFields: ["sender_name", "sender_phone", "sender_address"],
    sandbox: "Acces sandbox/developer prin GLS.",
    production: "URL-ul de productie se confirma in portalul GLS.",
    contract: "Contract GLS Romania si acces MyGLS/API.",
    costs: "Costuri contractuale GLS pentru expedieri si servicii aditionale.",
    contact: "it@gls-romania.ro sau portalul GLS Developer.",
    docs: [
      ["GLS Developer Portal", "https://dev-portal.gls-group.net/"],
      ["MyGLS API", "https://api.mygls.hu/index_en.html"]
    ],
    analysis: {
      offers: "Arhitectura pregatita pentru AWB, etichete si tracking GLS.",
      userBenefits: "Comerciantii pot folosi contracte GLS existente.",
      platformBenefits: "Adauga redundanta de curierat si negociere de cost.",
      limitations: "API-ul si accesul difera pe tara; trebuie confirmate credentialele pentru Romania."
    },
    checklist: COURIER_CHECKLIST,
    activationTime: "3-15 zile lucratoare."
  }),
  provider("stripe", "payment", "Stripe", {
    capabilities: ["plati", "abonamente", "webhook-uri", "facturi", "refund"],
    credentialFields: ["publishable_key", "secret_key", "webhook_secret"],
    configFields: ["success_url", "cancel_url", "price_ids_json", "invoice_enabled"],
    merchantFields: ["stripe_account_id", "billing_email", "vat_behavior"],
    sandbox: "Test mode din Stripe Dashboard.",
    production: "Live mode din Stripe Dashboard.",
    contract: "Acceptarea termenilor Stripe si verificarea contului/business.",
    costs: "Stripe are pricing pay-as-you-go; platile, Billing si Invoicing se taxeaza conform paginii oficiale si tarii contului.",
    contact: "Stripe Dashboard support sau stripe.com/contact.",
    docs: [
      ["Stripe API", "https://docs.stripe.com/api"],
      ["Stripe Webhooks", "https://docs.stripe.com/webhooks"],
      ["Stripe Subscriptions", "https://docs.stripe.com/billing/subscriptions/overview"],
      ["Stripe Pricing", "https://stripe.com/pricing"],
      ["Stripe Invoicing Pricing", "https://stripe.com/invoicing/pricing"]
    ],
    analysis: {
      offers: "Checkout, plati card, abonamente, webhooks, facturi Stripe si refunduri.",
      userBenefits: "Comerciantii pot plati abonamente si servicii rapid, cu card.",
      platformBenefits: "Automatizeaza monetizarea, incasarea si statusurile de abonament.",
      limitations: "Necesita webhook corect, chei test/live separate, verificare business si reconciliere cu facturarea ANAF."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "1-3 zile daca verificarea Stripe este aprobata."
  }),
  provider("whatsapp_business", "messaging", "WhatsApp Business", {
    capabilities: ["notificari", "chat", "template messages", "webhook", "raspunsuri post-opt-in"],
    credentialFields: ["access_token", "app_secret", "verify_token"],
    configFields: ["business_account_id", "phone_number_id", "webhook_url", "default_language"],
    merchantFields: ["notification_opt_in_enabled", "support_phone_label"],
    sandbox: "Meta App + WhatsApp test number.",
    production: "WhatsApp Business Platform Cloud API.",
    contract: "Meta Business Account, Business Verification, WhatsApp Business Account si acceptarea politicilor WhatsApp.",
    costs: "WhatsApp Business Platform se taxeaza pe mesaj livrat, in functie de tara si categoria mesajului.",
    contact: "Meta Business Help / Meta Developer support.",
    docs: [
      ["WhatsApp Business Platform", "https://developers.facebook.com/documentation/business-messaging/whatsapp/overview"],
      ["WhatsApp Pricing", "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing"],
      ["WhatsApp Platform Pricing", "https://whatsappbusiness.com/products/platform-pricing/"]
    ],
    analysis: {
      offers: "Trimite notificari aprobate, primeste mesaje si gestioneaza chat in fereastra permisa.",
      userBenefits: "Comerciantii au canal rapid pentru status comenzi si suport.",
      platformBenefits: "Creste rata de raspuns si reduce suportul manual.",
      limitations: "Mesajele proactive necesita template aprobat si opt-in; raspunsurile libere sunt limitate de fereastra de conversatie si politici Meta."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "3-15 zile, in functie de Business Verification si aprobarea template-urilor."
  }),
  provider("facebook", "social", "Facebook", {
    capabilities: ["publicare anunturi", "postari automate", "promovare", "Messenger", "Page search"],
    credentialFields: ["app_id", "app_secret", "page_access_token", "system_user_token"],
    configFields: ["page_id", "ad_account_id", "webhook_url", "default_utm_source"],
    merchantFields: ["facebook_page_url", "allow_auto_posts"],
    sandbox: "Meta App in Development Mode.",
    production: "Meta App Live Mode + App Review.",
    contract: "Meta Developer Terms, Business Verification si aprobari App Review pentru permisiuni avansate.",
    costs: "API-ul Pages/Graph nu are taxa per call; reclamele costa buget Meta Ads; WhatsApp are tarif separat.",
    contact: "Meta Developer Support / Business Help.",
    docs: [
      ["Facebook Pages API", "https://developers.facebook.com/documentation/pages-api"],
      ["Meta Permissions", "https://developers.facebook.com/docs/permissions/"],
      ["Meta Marketing API", "https://developers.facebook.com/documentation/ads-commerce/marketing-api"],
      ["Messenger Platform", "https://developers.facebook.com/documentation/business-messaging/messenger-platform"]
    ],
    analysis: {
      offers: "Publicare pe pagina proprie, pregatire anunturi, promovare prin Marketing API si Messenger dupa permisiuni.",
      userBenefits: "Comerciantii pot distribui listari si campanii dintr-un singur loc.",
      platformBenefits: "E-MARQET poate genera trafic social si audit pentru postarile efectuate.",
      limitations: "Cautarea si accesul la continut public al paginilor necesita permisiuni/feature access; Messenger permite mesaje doar in limitele politicilor si dupa interactiune/opt-in."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "7-30 zile pentru App Review, uneori mai mult pentru permisiuni avansate."
  }),
  provider("instagram", "social", "Instagram", {
    capabilities: ["postari", "Reels", "Stories unde API-ul permite", "programare", "insights"],
    credentialFields: ["page_access_token", "app_id", "app_secret"],
    configFields: ["instagram_business_account_id", "facebook_page_id", "default_utm_source"],
    merchantFields: ["instagram_profile_url", "allow_auto_posts"],
    sandbox: "Instagram Business/Creator conectat la Facebook Page in Meta App test.",
    production: "Instagram Graph API cu App Review.",
    contract: "Meta Developer Terms, cont Instagram Professional si pagina Facebook conectata.",
    costs: "Nu are taxa per call; costurile apar la promovare Meta Ads sau tooluri auxiliare.",
    contact: "Meta Developer Support / Business Help.",
    docs: [
      ["Instagram Content Publishing", "https://developers.facebook.com/documentation/instagram-platform/content-publishing"],
      ["Instagram Stories Publishing", "https://developers.facebook.com/blog/post/2023/05/16/introducing-stories-publishing-to-the-content-publishing-api-on-instagram/"],
      ["Meta Permissions", "https://developers.facebook.com/docs/permissions/"]
    ],
    analysis: {
      offers: "Publicare foto/video, Reels si Stories unde API-ul permite, plus programare din E-MARQET.",
      userBenefits: "Comerciantii castiga prezenta sociala fara sa rescrie manual descrieri.",
      platformBenefits: "Creste traficul catre listari si ajuta verticalele vizuale.",
      limitations: "Necesita cont profesional, pagina Facebook conectata, media public accesibila la URL si limite de publicare Meta."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "7-30 zile pentru App Review daca sunt necesare permisiuni avansate."
  }),
  provider("google_merchant", "google", "Google Merchant Center", {
    capabilities: ["produse", "inventar", "promotii", "rapoarte", "free listings/Shopping"],
    credentialFields: ["service_account_json", "oauth_client_id", "oauth_client_secret"],
    configFields: ["merchant_id", "feed_label", "content_language", "target_country"],
    merchantFields: ["google_merchant_account_id", "shipping_policy_url", "return_policy_url"],
    sandbox: "Google Cloud project + Merchant test/config.",
    production: "Merchant Center + Merchant API.",
    contract: "Cont Google Merchant Center, acceptarea politicilor Shopping/free listings si verificarea website-ului.",
    costs: "Merchant API nu are taxa separata mentionata; Google Ads/Shopping si servicii conexe pot avea costuri.",
    contact: "Google Merchant Center support.",
    docs: [
      ["Merchant API", "https://developers.google.com/merchant/api"],
      ["Merchant API reference", "https://developers.google.com/merchant/api/reference/rest"],
      ["Merchant API access", "https://support.google.com/merchants/answer/14173602?hl=en"]
    ],
    analysis: {
      offers: "Sincronizare produse, preturi, inventar si rapoarte Merchant Center.",
      userBenefits: "Produsele pot ajunge in Google surfaces fara upload manual.",
      platformBenefits: "E-MARQET devine sursa de feed pentru Google Shopping/free listings.",
      limitations: "Necesita verificare domeniu, politici comerciale, date produs curate si OAuth/service account configurat."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "2-14 zile, in functie de verificarea Merchant Center."
  }),
  provider("google_maps", "google", "Google Maps", {
    capabilities: ["geocoding", "places", "maps", "distante", "adrese"],
    credentialFields: ["api_key"],
    configFields: ["cloud_project_id", "allowed_domains", "billing_account_id"],
    merchantFields: ["store_address", "store_place_id"],
    sandbox: "Google Cloud project cu restrictii pe API key.",
    production: "Google Maps Platform cu billing activ.",
    contract: "Google Cloud/Maps Platform terms si billing account.",
    costs: "Google Maps este pay-as-you-go sau abonamente/subscriptii, cu preturi per eveniment facturabil.",
    contact: "Google Cloud support.",
    docs: [
      ["Google Maps Platform pricing", "https://developers.google.com/maps/billing-and-pricing/pricing"],
      ["Google Maps pricing plans", "https://mapsplatform.google.com/pricing/"],
      ["Google Cloud API Library", "https://console.cloud.google.com/apis/library"]
    ],
    analysis: {
      offers: "Validare adrese, localizare comercianti, distante si harti.",
      userBenefits: "Adrese mai corecte si experienta mai buna pentru livrare/ridicare.",
      platformBenefits: "Reduce erorile de curierat si imbunatateste cautarea locala.",
      limitations: "Necesita billing activ, restrictii pe cheie si control de cost."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "1 zi daca billing-ul Google este activ."
  }),
  provider("google_analytics", "google", "Google Analytics", {
    capabilities: ["GA4 reports", "trafic", "conversii", "dashboard"],
    credentialFields: ["service_account_json"],
    configFields: ["property_id", "measurement_id"],
    merchantFields: ["merchant_ga4_property_id"],
    sandbox: "GA4 property de test.",
    production: "GA4 Data API.",
    contract: "Google Analytics/Cloud terms; acces service account sau OAuth.",
    costs: "GA4 standard este gratuit; costuri pot exista pentru Google Cloud/BigQuery/Analytics 360.",
    contact: "Google Analytics support.",
    docs: [
      ["Analytics Data API quickstart", "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart"],
      ["Analytics Admin API quickstart", "https://developers.google.com/analytics/devguides/config/admin/v1/quickstart"]
    ],
    analysis: {
      offers: "Preia trafic si conversii GA4 in dashboardul E-MARQET.",
      userBenefits: "Comerciantii vad performanta listarii fara sa intre in GA4.",
      platformBenefits: "Masoara cresterea marketplace-ului si ROI-ul campaniilor.",
      limitations: "Necesita proprietate GA4, service account autorizat si mapping corect de evenimente."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "1-3 zile."
  }),
  provider("google_search_console", "google", "Google Search Console", {
    capabilities: ["search analytics", "sitemaps", "URL inspection", "indexare"],
    credentialFields: ["service_account_json"],
    configFields: ["site_url", "sitemap_url"],
    merchantFields: ["merchant_site_url"],
    sandbox: "Proprietate Search Console verificata.",
    production: "Search Console API.",
    contract: "Cont Google si proprietate verificata in Search Console.",
    costs: "Search Console API este gratuit, supus cotelor si limitelor Google.",
    contact: "Google Search Central / Search Console help.",
    docs: [
      ["Search Console API", "https://developers.google.com/webmaster-tools"],
      ["Search Console API reference", "https://developers.google.com/webmaster-tools/v1/api_reference_index"],
      ["Search Console", "https://search.google.com/search-console/about"]
    ],
    analysis: {
      offers: "Interogheaza performanta SEO, sitemapuri si status indexare.",
      userBenefits: "Comerciantii primesc feedback SEO pentru listari.",
      platformBenefits: "Ajuta E-MARQET sa optimizeze paginile publice pe Google.",
      limitations: "Necesita verificare site si permisiuni; URL Inspection are cote stricte."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "1-3 zile dupa verificarea domeniului."
  }),
  provider("openai", "ai", "ChatGPT / OpenAI", {
    capabilities: ["titlu", "descriere", "SEO", "hashtag-uri", "traduceri", "optimizare imagini"],
    credentialFields: ["api_key"],
    configFields: ["text_model", "image_model", "default_language", "max_tokens"],
    merchantFields: ["ai_tone", "ai_language", "auto_generate_enabled"],
    sandbox: "Cheie OpenAI separata sau limita de test in acelasi proiect.",
    production: "OpenAI API project cu billing activ.",
    contract: "OpenAI API terms si cont cu billing activ.",
    costs: "Costuri pe token si pe imagine conform pricingului OpenAI curent.",
    contact: "OpenAI Platform support.",
    docs: [
      ["OpenAI API pricing", "https://developers.openai.com/api/docs/pricing"],
      ["OpenAI image generation", "https://developers.openai.com/api/docs/guides/image-generation"],
      ["OpenAI images and vision", "https://developers.openai.com/api/docs/guides/images-vision"]
    ],
    analysis: {
      offers: "Genereaza continut pentru listari, SEO, social, traduceri si optimizare vizuala.",
      userBenefits: "Comerciantul publica mai repede si mai profesionist.",
      platformBenefits: "Creste calitatea listarii si sansele de conversie.",
      limitations: "Necesita control costuri, moderare umana si verificarea faptelor generate."
    },
    checklist: DEFAULT_CHECKLIST,
    activationTime: "Sub 1 zi dupa activarea billingului OpenAI."
  }),
  provider("marketplace_api", "api", "Marketplace API", {
    capabilities: ["publicare anunturi", "stoc", "produse", "preturi", "comenzi", "webhook"],
    credentialFields: [],
    configFields: ["rate_limit_per_minute", "webhook_secret", "allowed_ips"],
    merchantFields: ["api_key_name", "allowed_scopes"],
    sandbox: "/api/e-marqet/v1 in mediul test.",
    production: "/api/e-marqet/v1 in productie.",
    contract: "Termeni API E-MARQET si DPA daca partenerul trimite date personale.",
    costs: "Inclus in abonamentul E-MARQET sau tarifat ca addon API, in functie de plan.",
    contact: "Suport E-MARQET / Nexora.",
    docs: [
      ["API local", "/api/e-marqet/v1/health"]
    ],
    analysis: {
      offers: "Permite partenerilor sa publice listari, sa actualizeze stocuri/preturi si sa sincronizeze comenzi.",
      userBenefits: "Comerciantii pot conecta ERP, magazin online sau PIM fara import manual.",
      platformBenefits: "Transforma E-MARQET intr-un hub integrabil, nu doar interfata web.",
      limitations: "Necesita tokenuri Bearer, rate limits, mapping de categorii si validare de date."
    },
    checklist: [
      "Creeaza cheia API",
      "Alege scope-urile",
      "Configureaza webhook partener",
      "Testeaza publicare anunt",
      "Testeaza sincronizare stoc",
      "Testeaza sincronizare pret",
      "Testeaza comenzi",
      "Activeaza productia"
    ],
    activationTime: "Sub 1 zi dupa generarea cheii API."
  })
];

export function providerByKey(key = "") {
  const normalized = normalizeKey(key);
  return EMARQET_INTEGRATION_PROVIDERS.find((item) => item.key === normalized) || null;
}

export function ensureEmarqetIntegrationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emarqet_external_integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      provider_key TEXT NOT NULL,
      provider_category TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      environment TEXT NOT NULL DEFAULT 'sandbox',
      status TEXT NOT NULL DEFAULT 'not_configured',
      encrypted_credentials TEXT,
      config_json TEXT,
      merchant_config_json TEXT,
      last_test_status TEXT,
      last_test_at TEXT,
      last_error TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, provider_key)
    );

    CREATE TABLE IF NOT EXISTS emarqet_integration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      provider_key TEXT NOT NULL,
      action TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'internal',
      status TEXT NOT NULL DEFAULT 'info',
      request_id TEXT,
      http_status INTEGER,
      message TEXT,
      metadata_json TEXT,
      error TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_integration_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      provider_key TEXT NOT NULL,
      report_type TEXT NOT NULL DEFAULT 'activation',
      status TEXT NOT NULL DEFAULT 'generated',
      title TEXT,
      summary_json TEXT,
      markdown TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS emarqet_marketplace_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      token_prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT 'listings:write,stock:write,prices:write,orders:read',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_used_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      UNIQUE(company_id, token_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_emq_integrations_company_status
      ON emarqet_external_integrations(company_id, provider_category, enabled, status);
    CREATE INDEX IF NOT EXISTS idx_emq_integration_logs_company
      ON emarqet_integration_logs(company_id, provider_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_emq_integration_reports_company
      ON emarqet_integration_reports(company_id, provider_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_emq_marketplace_api_keys_hash
      ON emarqet_marketplace_api_keys(token_hash, status);
  `);
}

export function seedEmarqetIntegrations(db, companyId, createdBy = "") {
  ensureEmarqetIntegrationSchema(db);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO emarqet_external_integrations (
      company_id, provider_key, provider_category, display_name, config_json,
      merchant_config_json, created_by, updated_by
    )
    VALUES (?, ?, ?, ?, '{}', '{}', ?, ?)
  `);
  const update = db.prepare(`
    UPDATE emarqet_external_integrations
    SET provider_category=?,
        display_name=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND provider_key=?
  `);
  const run = db.transaction(() => {
    for (const item of EMARQET_INTEGRATION_PROVIDERS) {
      insert.run(companyId, item.key, item.category, item.name, createdBy, createdBy);
      update.run(item.category, item.name, companyId, item.key);
    }
  });
  run();
}

function filteredPayload(payload = {}, fields = []) {
  const result = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      result[field] = safeText(payload[field]);
    }
  }
  return result;
}

function credentialsStatus(providerDef, encrypted = "") {
  const credentials = decryptJson(encrypted);
  return Object.fromEntries((providerDef?.credentialFields || []).map((field) => [field, safeText(credentials[field]) ? "set" : "missing"]));
}

function rowToIntegration(row = {}) {
  const def = providerByKey(row.provider_key) || {};
  return {
    ...def,
    id: row.id,
    provider_key: row.provider_key,
    enabled: Number(row.enabled || 0) === 1,
    environment: row.environment || "sandbox",
    status: row.status || "not_configured",
    config: jsonParse(row.config_json, {}),
    merchantConfig: jsonParse(row.merchant_config_json, {}),
    credentialsStatus: credentialsStatus(def, row.encrypted_credentials),
    last_test_status: row.last_test_status,
    last_test_at: row.last_test_at,
    last_error: row.last_error,
    updated_at: row.updated_at
  };
}

export function loadEmarqetIntegrations(db, companyId) {
  seedEmarqetIntegrations(db, companyId);
  const rows = db.prepare(`
    SELECT *
    FROM emarqet_external_integrations
    WHERE company_id=?
    ORDER BY
      CASE provider_category
        WHEN 'courier' THEN 1
        WHEN 'payment' THEN 2
        WHEN 'messaging' THEN 3
        WHEN 'social' THEN 4
        WHEN 'google' THEN 5
        WHEN 'ai' THEN 6
        WHEN 'api' THEN 7
        ELSE 8
      END,
      display_name COLLATE NOCASE ASC
  `).all(companyId);
  return rows.map(rowToIntegration);
}

export function loadEmarqetIntegration(db, companyId, providerKey) {
  seedEmarqetIntegrations(db, companyId);
  const row = db.prepare(`
    SELECT *
    FROM emarqet_external_integrations
    WHERE company_id=? AND provider_key=?
    LIMIT 1
  `).get(companyId, normalizeKey(providerKey));
  return row ? rowToIntegration(row) : null;
}

export function loadEmarqetIntegrationStats(db, companyId) {
  ensureEmarqetIntegrationSchema(db);
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END), 0) AS enabled,
      COALESCE(SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END), 0) AS ready,
      COALESCE(SUM(CASE WHEN COALESCE(last_error, '')<>'' THEN 1 ELSE 0 END), 0) AS errors
    FROM emarqet_external_integrations
    WHERE company_id=?
  `).get(companyId) || {};
}

export function loadEmarqetIntegrationLogs(db, companyId, limit = 80) {
  ensureEmarqetIntegrationSchema(db);
  return db.prepare(`
    SELECT *
    FROM emarqet_integration_logs
    WHERE company_id=?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(companyId, Math.max(1, Math.min(300, Number(limit || 80) || 80)));
}

export function loadEmarqetIntegrationReports(db, companyId, limit = 40) {
  ensureEmarqetIntegrationSchema(db);
  return db.prepare(`
    SELECT *
    FROM emarqet_integration_reports
    WHERE company_id=?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(companyId, Math.max(1, Math.min(200, Number(limit || 40) || 40)));
}

export function logEmarqetIntegrationEvent(db, companyId, providerKey, event = {}) {
  ensureEmarqetIntegrationSchema(db);
  const requestId = safeText(event.requestId) || randomBytes(8).toString("hex");
  db.prepare(`
    INSERT INTO emarqet_integration_logs (
      company_id, provider_key, action, direction, status, request_id,
      http_status, message, metadata_json, error, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    normalizeKey(providerKey),
    safeText(event.action || "event"),
    safeText(event.direction || "internal"),
    safeText(event.status || "info"),
    requestId,
    Number(event.httpStatus || 0) || null,
    safeText(event.message),
    jsonString(event.metadata || {}),
    safeText(event.error),
    safeText(event.createdBy)
  );
  return requestId;
}

export function updateEmarqetIntegrationStatus(db, companyId, providerKey, payload = {}, actor = "") {
  const key = normalizeKey(providerKey);
  const enabled = ["1", "true", "on", "yes"].includes(String(payload.enabled || "").toLowerCase()) ? 1 : 0;
  const environment = safeText(payload.environment) === "production" ? "production" : "sandbox";
  const result = db.prepare(`
    UPDATE emarqet_external_integrations
    SET enabled=?,
        environment=?,
        status=CASE
          WHEN ?=0 THEN 'disabled'
          WHEN status='disabled' THEN 'not_configured'
          ELSE status
        END,
        updated_by=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND provider_key=?
  `).run(enabled, environment, enabled, actor, companyId, key);
  logEmarqetIntegrationEvent(db, companyId, key, {
    action: "status_update",
    status: result.changes ? "ok" : "missing",
    message: enabled ? `Activat in ${environment}.` : "Dezactivat.",
    createdBy: actor
  });
  return { ok: result.changes > 0 };
}

export function saveEmarqetIntegrationConfig(db, companyId, providerKey, payload = {}, actor = "") {
  const key = normalizeKey(providerKey);
  const def = providerByKey(key);
  if (!def) return { ok: false, error: "missing_provider" };
  const config = filteredPayload(payload, def.configFields);
  const merchantConfig = filteredPayload(payload, def.merchantFields);
  const result = db.prepare(`
    UPDATE emarqet_external_integrations
    SET config_json=?,
        merchant_config_json=?,
        updated_by=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND provider_key=?
  `).run(jsonString(config), jsonString(merchantConfig), actor, companyId, key);
  logEmarqetIntegrationEvent(db, companyId, key, {
    action: "config_save",
    status: result.changes ? "ok" : "missing",
    message: "Configurarea a fost salvata.",
    createdBy: actor
  });
  return { ok: result.changes > 0 };
}

export function saveEmarqetIntegrationCredentials(db, companyId, providerKey, payload = {}, actor = "") {
  const key = normalizeKey(providerKey);
  const def = providerByKey(key);
  if (!def) return { ok: false, error: "missing_provider" };
  const existing = db.prepare(`
    SELECT encrypted_credentials
    FROM emarqet_external_integrations
    WHERE company_id=? AND provider_key=?
  `).get(companyId, key);
  const credentials = {
    ...decryptJson(existing?.encrypted_credentials),
    ...Object.fromEntries(Object.entries(filteredPayload(payload, def.credentialFields)).filter(([, value]) => safeText(value)))
  };
  const missing = def.credentialFields.filter((field) => !safeText(credentials[field]));
  const status = missing.length ? "partial" : "configured";
  const result = db.prepare(`
    UPDATE emarqet_external_integrations
    SET encrypted_credentials=?,
        status=?,
        last_error='',
        updated_by=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND provider_key=?
  `).run(encryptJson(credentials), status, actor, companyId, key);
  logEmarqetIntegrationEvent(db, companyId, key, {
    action: "credentials_save",
    status: result.changes ? "ok" : "missing",
    message: missing.length ? `Credentiale partiale. Lipsesc: ${missing.join(", ")}.` : "Credentiale salvate criptat.",
    createdBy: actor
  });
  return { ok: result.changes > 0, missing };
}

class BaseIntegrationAdapter {
  constructor(def, state = {}) {
    this.def = def;
    this.state = state;
    this.credentials = decryptJson(state.encrypted_credentials);
    this.config = jsonParse(state.config_json, {});
  }

  requiredMissing() {
    return (this.def.credentialFields || []).filter((field) => !safeText(this.credentials[field]));
  }

  async testConnection() {
    const missing = this.requiredMissing();
    if (missing.length) {
      return {
        ok: false,
        status: "config_missing",
        message: `Lipsesc credentiale: ${missing.join(", ")}.`
      };
    }
    return {
      ok: true,
      status: "ready",
      message: "Configurarea este completa. Testul live se face cu date reale de sandbox/productie."
    };
  }
}

class StripeAdapter extends BaseIntegrationAdapter {
  async testConnection() {
    const missing = this.requiredMissing();
    if (missing.length) return { ok: false, status: "config_missing", message: `Lipsesc credentiale: ${missing.join(", ")}.` };
    if (!safeText(this.credentials.secret_key) || typeof fetch !== "function") {
      return { ok: true, status: "ready", message: "Cheia Stripe este salvata; testul HTTP nu a fost rulat." };
    }
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${this.credentials.secret_key}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, status: "error", message: data?.error?.message || `Stripe HTTP ${response.status}` };
    }
    return { ok: true, status: "ready", message: `Stripe conectat: ${data.id || "account valid"}.` };
  }
}

class OpenAiAdapter extends BaseIntegrationAdapter {
  async testConnection() {
    const missing = this.requiredMissing();
    if (missing.length) return { ok: false, status: "config_missing", message: `Lipsesc credentiale: ${missing.join(", ")}.` };
    if (typeof fetch !== "function") return { ok: true, status: "ready", message: "Cheia OpenAI este salvata." };
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${this.credentials.api_key}` }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { ok: false, status: "error", message: data?.error?.message || `OpenAI HTTP ${response.status}` };
    }
    return { ok: true, status: "ready", message: "OpenAI API raspunde corect." };
  }
}

function adapterFor(def, state) {
  if (def.key === "stripe") return new StripeAdapter(def, state);
  if (def.key === "openai") return new OpenAiAdapter(def, state);
  return new BaseIntegrationAdapter(def, state);
}

export async function testEmarqetIntegration(db, companyId, providerKey, actor = "") {
  const key = normalizeKey(providerKey);
  const def = providerByKey(key);
  if (!def) return { ok: false, error: "missing_provider" };
  const row = db.prepare(`
    SELECT *
    FROM emarqet_external_integrations
    WHERE company_id=? AND provider_key=?
  `).get(companyId, key);
  if (!row) return { ok: false, error: "missing_provider" };
  let testResult;
  try {
    testResult = await adapterFor(def, row).testConnection();
  } catch (error) {
    testResult = { ok: false, status: "error", message: error?.message || "Test esuat." };
  }
  db.prepare(`
    UPDATE emarqet_external_integrations
    SET last_test_status=?,
        last_test_at=CURRENT_TIMESTAMP,
        last_error=?,
        status=?,
        updated_by=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND provider_key=?
  `).run(
    testResult.status || (testResult.ok ? "ready" : "error"),
    testResult.ok ? "" : safeText(testResult.message),
    testResult.ok ? "ready" : (testResult.status || "error"),
    actor,
    companyId,
    key
  );
  logEmarqetIntegrationEvent(db, companyId, key, {
    action: "test_connection",
    status: testResult.ok ? "ok" : "error",
    message: testResult.message,
    createdBy: actor
  });
  return testResult;
}

function checklistMarkdown(items = []) {
  return (items.length ? items : DEFAULT_CHECKLIST)
    .map((item) => `□ ${item}`)
    .join("\n");
}

export function generateEmarqetIntegrationReport(db, companyId, providerKey, actor = "") {
  const key = normalizeKey(providerKey);
  const integration = loadEmarqetIntegration(db, companyId, key);
  if (!integration) return { ok: false, error: "missing_provider" };
  const summary = {
    implemented: [
      "Modul independent cu activare/dezactivare.",
      "Credentiale criptate.",
      "Configurare Admin si comerciant.",
      "Loguri si test de configurare.",
      "Raport de activare si checklist."
    ],
    works: integration.status === "ready" ? "Configurarea este testata si marcata ready." : "Structura este disponibila; lipsesc credentiale sau testul live.",
    limitations: integration.analysis?.limitations || "-",
    nextSteps: integration.checklist || DEFAULT_CHECKLIST,
    accounts: integration.contract || "-",
    costs: integration.costs || "-",
    activationTime: integration.activationTime || "-"
  };
  const docs = (integration.docs || []).map(([label, url]) => `- ${label}: ${url}`).join("\n") || "-";
  const credentialList = (integration.credentialFields || []).map((field) => `- ${field}: ${integration.credentialsStatus?.[field] || "missing"}`).join("\n") || "-";
  const markdown = [
    `# Raport integrare ${integration.name}`,
    "",
    "✅ Ce s-a implementat",
    ...summary.implemented.map((item) => `- ${item}`),
    "",
    "✅ Ce funcționează",
    `- ${summary.works}`,
    "",
    "⚠️ Ce limitări există",
    `- ${summary.limitations}`,
    "",
    "📋 Ce trebuie să faci tu",
    checklistMarkdown(summary.nextSteps),
    "",
    "🔑 Ce conturi / chei sunt necesare",
    credentialList,
    "",
    "📄 Ce contracte trebuie semnate",
    `- ${summary.accounts}`,
    "",
    "🌐 Link-uri oficiale",
    docs,
    "",
    "💰 Costuri",
    `- ${summary.costs}`,
    "",
    "⏳ Timp estimat pentru activare",
    `- ${summary.activationTime}`,
    "",
    "🧪 Cum se testează integrarea",
    "- Se salveaza credentialele in Sandbox.",
    "- Se ruleaza Test din Nexora.",
    "- Se genereaza o operatiune mica: AWB test, checkout test, mesaj template test, postare draft sau request API.",
    "- Se verifica logurile din pagina Integrari.",
    "",
    "🚀 Beneficii platforma si utilizatori",
    `- Utilizatori: ${integration.analysis?.userBenefits || "-"}`,
    `- E-MARQET: ${integration.analysis?.platformBenefits || "-"}`
  ].join("\n");
  const id = Number(db.prepare(`
    INSERT INTO emarqet_integration_reports (
      company_id, provider_key, report_type, status, title, summary_json, markdown, created_by
    )
    VALUES (?, ?, 'activation', 'generated', ?, ?, ?, ?)
  `).run(companyId, key, `Raport integrare ${integration.name}`, jsonString(summary), markdown, actor).lastInsertRowid || 0);
  logEmarqetIntegrationEvent(db, companyId, key, {
    action: "report_generate",
    status: "ok",
    message: `Raport #${id} generat.`,
    createdBy: actor
  });
  return { ok: true, id, markdown };
}

export function ensureEmarqetIntegrationReports(db, companyId, actor = "") {
  ensureEmarqetIntegrationSchema(db);
  const created = [];
  for (const item of EMARQET_INTEGRATION_PROVIDERS) {
    const exists = db.prepare(`
      SELECT id
      FROM emarqet_integration_reports
      WHERE company_id=? AND provider_key=? AND report_type='activation'
      LIMIT 1
    `).get(companyId, item.key);
    if (!exists?.id) {
      const result = generateEmarqetIntegrationReport(db, companyId, item.key, actor);
      if (result.ok) created.push(item.key);
    }
  }
  return created;
}

export function tokenHash(token = "") {
  return createHash("sha256").update(safeText(token)).digest("hex");
}

export function createMarketplaceApiKey(db, companyId, payload = {}, actor = "") {
  ensureEmarqetIntegrationSchema(db);
  const name = safeText(payload.name) || "Marketplace API";
  const scopes = safeText(payload.scopes) || "listings:write,stock:write,prices:write,orders:read";
  const token = `emq_${randomBytes(32).toString("hex")}`;
  const prefix = token.slice(0, 12);
  const id = Number(db.prepare(`
    INSERT INTO emarqet_marketplace_api_keys (
      company_id, name, token_prefix, token_hash, scopes, status, created_by
    )
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(companyId, name, prefix, tokenHash(token), scopes, actor).lastInsertRowid || 0);
  logEmarqetIntegrationEvent(db, companyId, "marketplace_api", {
    action: "api_key_create",
    status: "ok",
    message: `Cheie API #${id} creata.`,
    createdBy: actor
  });
  return { ok: true, id, token, prefix };
}

export function loadMarketplaceApiKeys(db, companyId) {
  ensureEmarqetIntegrationSchema(db);
  return db.prepare(`
    SELECT id, name, token_prefix, scopes, status, last_used_at, created_by, created_at, revoked_at
    FROM emarqet_marketplace_api_keys
    WHERE company_id=?
    ORDER BY created_at DESC, id DESC
  `).all(companyId);
}

export function revokeMarketplaceApiKey(db, companyId, id, actor = "") {
  const result = db.prepare(`
    UPDATE emarqet_marketplace_api_keys
    SET status='REVOKED',
        revoked_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=? AND status='ACTIVE'
  `).run(companyId, Number(id || 0));
  logEmarqetIntegrationEvent(db, companyId, "marketplace_api", {
    action: "api_key_revoke",
    status: result.changes ? "ok" : "missing",
    message: `Cheie API #${id} revocata.`,
    createdBy: actor
  });
  return { ok: result.changes > 0 };
}

export function authenticateMarketplaceApiToken(db, token = "") {
  ensureEmarqetIntegrationSchema(db);
  const hash = tokenHash(token);
  const row = db.prepare(`
    SELECT *
    FROM emarqet_marketplace_api_keys
    WHERE token_hash=? AND status='ACTIVE'
    LIMIT 1
  `).get(hash);
  if (!row) return null;
  db.prepare(`
    UPDATE emarqet_marketplace_api_keys
    SET last_used_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(row.id);
  return row;
}
