import {
  AUTO_BRAND_MODELS,
  EMARQET_CATEGORY_DEFINITIONS,
  EMARQET_CATEGORY_SUGGESTION_RULES,
  EMARQET_DEPENDENT_OPTIONS,
  categoryByCode,
  categoryByVerticalRow,
  listingMetadata,
  metadataSummary,
  publishFieldsFor,
  searchFieldsFor
} from "../../lib/emarqet-categories.js";
import {
  emarqetOfficeEmail,
  emarqetSupportEmail
} from "../../lib/emarqet-mailboxes.js";

const EMARQET_OFFICE_EMAIL = emarqetOfficeEmail();
const EMARQET_SUPPORT_EMAIL = emarqetSupportEmail();
const EMARQET_PUBLIC_BASE_URL = String(process.env.EMARQET_PUBLIC_URL || "https://e-marqet.com").replace(/\/+$/, "");

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateValue(value = "") {
  return String(value || "").slice(0, 10);
}

function fmtAmount(value, currency = "RON") {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Preț la cerere";
  return `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${escapeHtml(currency || "RON")}`;
}

function currencyLabel(currency = "RON") {
  return String(currency || "RON").toUpperCase() === "RON" ? "lei" : String(currency || "RON").toUpperCase();
}

function fmtCatalogPrice(value, currency = "RON", suffix = "") {
  if (value === null || value === undefined || value === "") return "La cerere";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "La cerere";
  return `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${escapeHtml(currencyLabel(currency))}${escapeHtml(suffix)}`;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function phoneHref(value = "") {
  const firstPhone = cleanText(value).split(/[;,/|]/)[0] || "";
  let digits = firstPhone.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("0040")) digits = `40${digits.slice(4)}`;
  if (digits.startsWith("0") && digits.length >= 10) digits = `40${digits.slice(1)}`;
  return `tel:+${digits}`;
}

function parseJsonArray(value = "") {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function listingImageUrls(listing = {}) {
  return [
    listing.primary_image_url,
    ...parseJsonArray(listing.image_urls_json)
  ]
    .map((url) => cleanText(url))
    .filter((url, index, all) => url && (/^https?:\/\//i.test(url) || url.startsWith("/")) && all.indexOf(url) === index)
    .slice(0, 12);
}

function publicDescriptionLines(listing = {}) {
  const technicalLabels = new Set(["an", "km", "combustibil", "cutie"]);
  return String(listing.notes || "")
    .split(/\r?\n+/)
    .map(cleanText)
    .map((line) => line
      .replace(/\s*Afla rapid daca poti cumpara aceasta masina in rate.*$/i, "")
      .replace(/\s*\*Nume\s*\/\s*Prenume.*$/i, "")
      .replace(/\s*Trade in form.*$/i, "")
      .replace(/\s*Make an offer price.*$/i, "")
      .trim())
    .filter(Boolean)
    .filter((line) => !/^import automat din site partener aprobat:/i.test(line))
    .filter((line) => {
      const label = cleanText(line.split(":")[0] || "").toLowerCase();
      return !technicalLabels.has(label);
    });
}

function publicDescriptionText(listing = {}) {
  const lines = publicDescriptionLines(listing);
  if (lines.length) return lines.join("\n\n");
  const owner = cleanText(listing.partner_display_name || listing.owner_name || "partenerul e-Marqet");
  const category = categoryByCode(listing.vertical_code || "");
  if (category?.code === "auto") {
    return `Autoturism listat de ${owner}. Datele tehnice sunt afișate mai jos, iar disponibilitatea se confirmă direct cu vânzătorul.`;
  }
  return `Anunț publicat de ${owner}. Detaliile principale sunt afișate mai jos, iar disponibilitatea se confirmă direct cu vânzătorul.`;
}

function formatSpecValue(key = "", value = "") {
  const raw = cleanText(value);
  if (!raw) return "";
  if (key === "mileage") {
    const amount = Number(String(raw).replace(/[^\d.]/g, ""));
    return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString("ro-RO")} km` : raw;
  }
  if (key === "engine_capacity" && /^\d+$/.test(raw)) return `${raw} cmc`;
  return raw;
}

function listingTechnicalRows(listing = {}) {
  const metadata = listingMetadata(listing);
  const fields = [
    ["brand", "Marcă"],
    ["model", "Model"],
    ["year", "An fabricație"],
    ["mileage", "Kilometri"],
    ["fuel", "Combustibil"],
    ["transmission", "Cutie"],
    ["body_type", "Caroserie"],
    ["power", "Putere"],
    ["engine_capacity", "Capacitate cilindrică"],
    ["color", "Culoare"],
    ["euro_norm", "Normă Euro"],
    ["origin_country", "Țară origine"],
    ["seats", "Locuri"],
    ["vin", "VIN"],
    ["stock_code", "Cod stoc"]
  ];
  return fields
    .map(([key, label]) => ({ key, label, value: formatSpecValue(key, metadata[key]) }))
    .filter((item) => item.value);
}

function listingDescriptionHtml(listing = {}) {
  const description = publicDescriptionText(listing);
  const specs = listingTechnicalRows(listing);
  return `
    <section class="emq-listing-section">
      <h2>Descriere</h2>
      <div class="emq-description">${description.split(/\n{2,}/).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
    </section>
    ${specs.length ? `
      <section class="emq-listing-section">
        <h2>Date tehnice</h2>
        <div class="emq-spec-grid">
          ${specs.map((item) => `
            <div class="emq-spec">
              <span>${escapeHtml(item.label)}</span>
              <b>${escapeHtml(item.value)}</b>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `;
}

function publicPath(pathname = "/") {
  return String(pathname || "/").startsWith("/") ? pathname : "/";
}

function absolutePublicPath(pathname = "/") {
  const value = String(pathname || "/");
  if (/^https?:\/\//i.test(value)) return value;
  return `${EMARQET_PUBLIC_BASE_URL}${publicPath(value)}`;
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    sent: "Anunțul s-a publicat cu succes.",
    lead: "Mesajul a fost trimis.",
    service: "Solicitarea de serviciu a ajuns la echipa e-Marqet.",
    paid: "Plata a fost confirmată.",
    paid_pending: "Plata a fost confirmată. Anunțul este în revizie.",
    business_saved: "Profilul business a fost trimis pentru verificare.",
    dealer_request: "Cererea a fost înregistrată. Revenim pentru configurarea importului.",
    billing_saved: "Datele de facturare au fost salvate.",
    imported: "Importul a fost procesat.",
    shared: "Distribuirea a fost înregistrată. Când linkul strânge 3 clickuri unice, anunțul primește promovare gratuită 7 zile.",
    listing_updated: "Anunțul a fost actualizat.",
    listing_paused: "Anunțul a fost dezactivat.",
    listing_published: "Anunțul a fost reactivat.",
    listing_deleted: "Anunțul a fost șters.",
    promotion_paid: "Promovarea a fost achitată. Cererea a intrat în Nexora."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    missing: "Anunțul nu a fost găsit.",
    invalid: "Datele trimise nu sunt valide.",
    exists: "Există deja un cont cu acest email.",
    exists_email: "Există deja un cont cu acest email.",
    exists_phone: "Există deja un cont cu acest număr de telefon.",
    exists_name: "Există deja un cont cu acest nume. Verifică datele înainte de creare.",
    name_required: "Completează numele.",
    phone_required: "Completează numărul de telefon.",
    password: "Parola trebuie să aibă minim 6 caractere.",
    upload: "Pozele nu au putut fi încărcate.",
    file_too_large: "O poză depășește limita permisă. Încarcă poze de maximum 20 MB fiecare.",
    too_many_files: "Ai selectat prea multe poze. Poți încărca maximum 10 poze.",
    invalid_image: "Pozele trebuie să fie JPG, PNG sau WebP.",
    simulate_disabled: "Simularea plății nu este activă.",
    stripe_disabled: "Stripe nu este activ pentru acest checkout.",
    billing_required: "Completează datele de facturare înainte de plată: nume, CUI/CNP, adresă, localitate și județ.",
    cancelled: "Plata a fost anulată.",
    unpaid: "Plata nu este confirmată.",
    stripe: "Sesiunea Stripe nu a putut fi verificată.",
    no_promotions: "Nu există pachete de promovare active.",
    business_required: "Completează datele partenerului: CUI/CNP, localitate, județ și adresă.",
    business_cui_exists: "Există deja un profil business cu acest CUI.",
    business_profile_missing: "Alege un profil business valid.",
    business_inactive: "Profilul business nu este activ pentru importuri.",
    partner_type: "Alege tipul de partener.",
    import_file_missing: "Alege un fișier CSV.",
    invalid_csv: "Fișierul trebuie să fie CSV sau XLSX.",
    consent_required: "Bifează acordul pentru contact.",
    import_file_too_large: "Fișierul CSV este prea mare.",
    import_upload: "Fișierul CSV nu a putut fi încărcat.",
    import_failed: "Importul nu a putut fi procesat.",
    partner_email: "Mesajul a fost salvat, dar emailul către partener nu a putut fi trimis. Folosește telefonul afișat sau încearcă din nou.",
    listing_action: "Acțiunea pe anunț nu a putut fi finalizată."
  };
  return [
    ok ? `<div class="emq-public-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="emq-public-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function layout({ title, description, canonicalPath = "/", body, user = null, robots = "", structuredData = [], headHtml = "", socialImage = "" }) {
  const safeTitle = title || "e-Marqet";
  const safeDescription = description || "Marketplace pentru anunțuri, servicii și parteneri verificați.";
  const safeCanonicalUrl = absolutePublicPath(canonicalPath);
  const socialImageUrl = socialImage ? absolutePublicPath(socialImage) : absolutePublicPath("/brand/emarqet-facebook-profile.png");
  const canonicalRoute = String(canonicalPath || "/");
  const autoRobots = /^(\/cont|\/checkout)(\/|$)/.test(canonicalRoute) || canonicalRoute === "/publica"
    ? "noindex,follow"
    : "";
  const safeRobots = String(robots || autoRobots || "").trim();
  const jsonLd = (Array.isArray(structuredData) ? structuredData : [structuredData])
    .filter(Boolean)
    .map((item) => `<script type="application/ld+json">${JSON.stringify(item).replaceAll("<", "\\u003c")}</script>`)
    .join("\n  ");
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(safeTitle)}</title>
  <meta name="description" content="${escapeHtml(safeDescription)}">
  ${safeRobots ? `<meta name="robots" content="${escapeHtml(safeRobots)}">` : ""}
  <link rel="canonical" href="${escapeHtml(safeCanonicalUrl)}">
  <link rel="icon" href="/brand/emarqet-facebook-profile.png" type="image/png">
  <link rel="apple-touch-icon" href="/brand/emarqet-facebook-profile.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="e-Marqet">
  <meta property="og:title" content="${escapeHtml(safeTitle)}">
  <meta property="og:description" content="${escapeHtml(safeDescription)}">
  <meta property="og:url" content="${escapeHtml(safeCanonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(socialImageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(safeTitle)}">
  <meta name="twitter:description" content="${escapeHtml(safeDescription)}">
  <meta name="twitter:image" content="${escapeHtml(socialImageUrl)}">
  ${jsonLd}
  ${headHtml}
  <style>
    :root {
      --emq-bg: #f6fbff;
      --emq-surface: #ffffff;
      --emq-text: #0f172a;
      --emq-muted: #64748b;
      --emq-border: #d7edf9;
      --emq-blue: #0284c7;
      --emq-blue-dark: #075985;
      --emq-blue-soft: #e0f2fe;
      --emq-green: #15803d;
      --emq-amber: #b45309;
      --emq-shadow: 0 12px 30px rgba(2, 132, 199, 0.08);
      --emq-shadow-strong: 0 20px 44px rgba(2, 132, 199, 0.16);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--emq-text);
      background: var(--emq-bg);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    a { color: inherit; }

    .emq-header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, 0.94);
      border-bottom: 1px solid var(--emq-border);
      backdrop-filter: blur(12px);
    }

    .emq-header-inner,
    .emq-main,
    .emq-footer-inner {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }

    .emq-header-inner {
      min-height: 70px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .emq-brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      min-width: 0;
    }

    .emq-brand-mark {
      width: 48px;
      height: 48px;
      object-fit: contain;
      display: block;
      border-radius: 50%;
    }

    .emq-brand-copy {
      display: grid;
      gap: 1px;
      min-width: 0;
    }

    .emq-brand-name {
      color: #0f172a;
      font-size: 18px;
      font-weight: 950;
      line-height: 1;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .emq-brand-tagline {
      color: #0284c7;
      font-size: 8px;
      font-weight: 850;
      line-height: 1.15;
      white-space: nowrap;
    }

    .emq-nav {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .emq-nav a,
    .emq-btn,
    .emq-btn-secondary {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      padding: 0 13px;
      font-weight: 850;
      font-size: 13px;
      text-decoration: none;
      border: 1px solid var(--emq-border);
      background: #ffffff;
      color: #075985;
      white-space: nowrap;
    }

    .emq-btn,
    .emq-nav a.primary {
      background: var(--emq-blue);
      border-color: var(--emq-blue);
      color: #ffffff;
    }

    .emq-btn-secondary {
      color: #0f172a;
    }

    .emq-main {
      padding: 22px 0 42px;
    }

    .emq-panel {
      background: var(--emq-surface);
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      box-shadow: var(--emq-shadow);
      padding: 16px;
    }

    .emq-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
      gap: 18px;
      align-items: stretch;
      margin-bottom: 18px;
    }

    .emq-hero-copy {
      min-height: 365px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
      background: linear-gradient(135deg, rgba(224, 242, 254, 0.94), rgba(255, 255, 255, 0.96));
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      padding: 24px;
      box-shadow: var(--emq-shadow);
    }

    .emq-eyebrow {
      color: var(--emq-blue-dark);
      font-weight: 900;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .emq-hero h1 {
      margin: 0;
      max-width: 820px;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 1.02;
      letter-spacing: 0;
    }

    .emq-hero p {
      margin: 0;
      max-width: 690px;
      color: #334155;
      font-size: 17px;
      line-height: 1.55;
    }

    .emq-search {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(150px, 0.7fr) minmax(150px, 0.7fr) auto;
      gap: 8px;
      align-items: end;
      margin-top: 4px;
    }

    .emq-search.expanded {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      align-items: end;
    }

    .emq-search.expanded .wide {
      grid-column: span 2;
    }

    .emq-search.expanded .submit {
      grid-column: span 1;
    }

    .emq-category-fields {
      display: none;
      grid-column: 1 / -1;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }

    .emq-category-fields.active {
      display: grid;
    }

    .emq-category-suggestion {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid #7dd3fc;
      border-radius: 8px;
      background: #f0f9ff;
      color: #0c4a6e;
      padding: 11px 13px;
      font-size: 13px;
      line-height: 1.4;
    }

    .emq-category-suggestion[hidden] {
      display: none;
    }

    .emq-category-suggestion button {
      min-height: 34px;
      flex: 0 0 auto;
      border: 1px solid #0284c7;
      border-radius: 8px;
      background: #0284c7;
      color: #ffffff;
      padding: 0 12px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
    }

    .emq-field {
      display: grid;
      gap: 5px;
    }

    .emq-field span {
      color: var(--emq-muted);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .emq-input,
    .emq-select,
    .emq-textarea {
      width: 100%;
      min-height: 40px;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      background: #ffffff;
      color: var(--emq-text);
      padding: 9px 11px;
      font: inherit;
      font-size: 14px;
      outline: none;
    }

    .emq-input:focus,
    .emq-select:focus,
    .emq-textarea:focus {
      border-color: var(--emq-blue);
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
    }

    .emq-textarea {
      min-height: 100px;
      resize: vertical;
    }

    .emq-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 4px;
    }

    .emq-entry-promo {
      display: grid;
      gap: 10px;
      margin-bottom: 18px;
    }

    .emq-free-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
      gap: 16px;
      align-items: stretch;
      color: #ffffff;
      background: #064e3b;
      border: 1px solid rgba(15, 118, 110, 0.46);
      border-radius: 8px;
      box-shadow: 0 20px 44px rgba(6, 78, 59, 0.2);
      padding: 22px;
      overflow: hidden;
    }

    .emq-free-hero-main {
      display: grid;
      align-content: start;
      gap: 14px;
    }

    .emq-hero-search {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      max-width: 720px;
    }

    .emq-hero-search input {
      min-height: 46px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.44);
      background: rgba(255, 255, 255, 0.94);
      color: #0f172a;
      padding: 0 14px;
      font: inherit;
      font-weight: 800;
      outline: none;
    }

    .emq-hero-search input:focus {
      border-color: #fbbf24;
      box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.2);
    }

    .emq-promo-eyebrow {
      display: inline-flex;
      min-height: 30px;
      align-items: center;
      border-radius: 8px;
      padding: 0 10px;
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.24);
      color: #bbf7d0;
      font-size: 12px;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .emq-free-hero h1 {
      max-width: 760px;
      margin: 10px 0 0;
      font-size: 42px;
      line-height: 1.03;
      letter-spacing: 0;
    }

    .emq-free-hero p {
      max-width: 660px;
      margin: 12px 0 0;
      color: #d1fae5;
      font-size: 16px;
      line-height: 1.5;
    }

    .emq-promo-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }

    .emq-free-hero .emq-btn {
      background: #ffffff;
      border-color: #ffffff;
      color: #075985;
    }

    .emq-free-hero .emq-btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.35);
      color: #ffffff;
    }

    .emq-free-kpis {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .emq-free-kpis.client {
      align-content: start;
    }

    .emq-free-kpi {
      min-height: 92px;
      display: grid;
      align-content: center;
      gap: 4px;
      padding: 14px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.13);
      border: 1px solid rgba(255, 255, 255, 0.24);
    }

    .emq-free-kpi b {
      color: #ffffff;
      font-size: 28px;
      line-height: 1;
    }

    .emq-free-kpi span {
      color: #dcfce7;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.25;
    }

    .emq-free-kpi small {
      color: #a7f3d0;
      font-size: 12px;
      line-height: 1.3;
    }

    .emq-promo-card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .emq-promo-card {
      display: grid;
      gap: 6px;
      min-height: 112px;
      padding: 14px;
      border-radius: 8px;
      background: #ffffff;
      border: 1px solid var(--emq-border);
      border-left: 5px solid var(--promo-accent, var(--emq-blue));
      box-shadow: var(--emq-shadow);
    }

    .emq-promo-card strong {
      font-size: 16px;
      line-height: 1.2;
    }

    .emq-promo-card span {
      color: var(--emq-muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .emq-featured-rail {
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: var(--emq-shadow);
      padding: 14px;
      margin-bottom: 18px;
      overflow: hidden;
    }

    .emq-featured-head {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: end;
      margin-bottom: 12px;
    }

    .emq-featured-head h1,
    .emq-featured-head h2 {
      margin: 0;
      font-size: clamp(24px, 4vw, 34px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .emq-featured-head p {
      margin: 5px 0 0;
      color: var(--emq-muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .emq-featured-track {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(300px, 36%);
      gap: 12px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x mandatory;
      scroll-padding: 2px;
      padding: 2px 2px 10px;
      scrollbar-width: thin;
    }

    .emq-featured-card {
      min-height: 285px;
      position: relative;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      color: inherit;
      overflow: hidden;
      text-decoration: none;
      box-shadow: var(--emq-shadow);
      scroll-snap-align: start;
      display: grid;
      grid-template-rows: minmax(170px, 1fr) auto;
    }

    .emq-featured-media {
      position: relative;
      min-height: 170px;
      background: linear-gradient(135deg, #dbeafe, #ffffff);
      display: grid;
      place-items: center;
      color: var(--emq-blue-dark);
      font-size: 42px;
      font-weight: 950;
      overflow: hidden;
    }

    .emq-featured-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .emq-featured-body {
      padding: 12px;
      display: grid;
      gap: 8px;
    }

    .emq-featured-body h3 {
      margin: 0;
      font-size: 20px;
      line-height: 1.18;
      letter-spacing: 0;
    }

    .emq-featured-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }

    .emq-featured-rail.compact {
      padding: 12px;
    }

    .emq-featured-rail.compact .emq-featured-head {
      margin-bottom: 10px;
    }

    .emq-featured-rail.compact .emq-featured-head h1,
    .emq-featured-rail.compact .emq-featured-head h2 {
      font-size: clamp(22px, 3vw, 28px);
    }

    .emq-featured-rail.compact .emq-featured-track {
      grid-auto-flow: row;
      grid-auto-columns: unset;
      grid-template-columns: repeat(auto-fill, minmax(210px, 260px));
      align-items: start;
      overflow: visible;
      scroll-snap-type: none;
      padding: 2px;
    }

    .emq-featured-rail.compact .emq-featured-card {
      min-height: 0;
      grid-template-rows: 130px auto;
      box-shadow: none;
    }

    .emq-featured-rail.compact .emq-featured-media {
      min-height: 130px;
      font-size: 30px;
    }

    .emq-featured-rail.compact .emq-featured-body {
      padding: 10px;
      gap: 6px;
    }

    .emq-featured-rail.compact .emq-featured-body h3 {
      font-size: 16px;
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .emq-featured-rail.compact .emq-featured-meta {
      align-items: flex-start;
    }

    .emq-featured-rail.compact .emq-price {
      font-size: 18px;
    }

    .emq-featured-rail.compact .emq-chip-row {
      display: none;
    }

    .emq-stat {
      min-height: 82px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
    }

    .emq-stat b {
      display: block;
      font-size: 26px;
      color: var(--emq-blue-dark);
      line-height: 1;
    }

    .emq-stat span {
      display: block;
      margin-top: 7px;
      color: var(--emq-muted);
      font-size: 12px;
      font-weight: 800;
    }

    .emq-category-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: 12px 10px;
      align-items: start;
    }

    .emq-category-tile {
      min-height: 96px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      padding: 8px 6px;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      text-align: center;
      transition: transform .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease;
    }

    .emq-category-tile:hover {
      transform: translateY(-5px);
      background: #ffffff;
      border-color: var(--emq-border);
      box-shadow: var(--emq-shadow);
    }

    .emq-category-tile strong {
      display: block;
      font-size: 13px;
      line-height: 1.2;
    }

    .emq-category-icon {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--cat-bg, var(--emq-blue-soft));
      color: #0f172a;
      font-size: 28px;
      font-weight: 950;
      box-shadow: 0 16px 34px rgba(2, 132, 199, 0.13);
      transition: transform .2s ease, box-shadow .2s ease;
    }

    .emq-category-tile:hover .emq-category-icon {
      transform: rotate(-3deg) scale(1.05);
      box-shadow: 0 22px 40px rgba(2, 132, 199, 0.18);
    }

    .emq-search-band {
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: var(--emq-shadow);
      padding: 12px;
      margin: 8px 0 16px;
    }

    .emq-search-band.collapsed {
      display: none;
    }

    .emq-home-categories {
      padding: 2px 0 6px;
    }

    .emq-side-list {
      display: grid;
      gap: 10px;
    }

    .emq-side-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 10px;
      text-decoration: none;
    }

    .emq-side-icon {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--emq-blue-soft);
      color: var(--emq-blue-dark);
      font-weight: 900;
    }

    .emq-side-row b,
    .emq-card b {
      display: block;
      color: #0f172a;
    }

    .emq-side-row span,
    .emq-card span,
    .emq-muted {
      color: var(--emq-muted);
      font-size: 13px;
      line-height: 1.4;
    }

    .emq-section-head {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: end;
      margin: 22px 0 10px;
    }

    .emq-section-head h2 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }

    .emq-section-head p {
      margin: 5px 0 0;
      color: var(--emq-muted);
    }

    .emq-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .emq-grid.two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .emq-card {
      min-height: 170px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      justify-content: space-between;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
      box-shadow: var(--emq-shadow);
      text-decoration: none;
    }

    .emq-listing-card {
      min-height: 100%;
      overflow: hidden;
      padding: 0;
    }

    .emq-listing-link {
      color: inherit;
      text-decoration: none;
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    .emq-listing-media {
      position: relative;
      aspect-ratio: 16 / 10;
      background: linear-gradient(135deg, #e0f2fe, #ffffff);
      border-bottom: 1px solid var(--emq-border);
      display: grid;
      place-items: center;
      color: var(--emq-blue-dark);
      font-weight: 950;
    }

    .emq-listing-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .emq-listing-body {
      padding: 13px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 205px;
      justify-content: space-between;
    }

    .emq-listing-partner {
      border-top: 1px solid var(--emq-border);
      padding: 10px 13px 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: #f8fcff;
    }

    .emq-listing-partner a,
    .emq-partner-link {
      color: #075985;
      font-weight: 900;
      text-decoration: none;
    }

    .emq-promo-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      width: 92px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: linear-gradient(180deg, #fde68a 0%, #fbbf24 56%, #d97706 100%);
      color: #3b2500;
      padding: 12px 10px 7px;
      font-size: 12px;
      font-weight: 950;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0;
      border: 1px solid rgba(146, 64, 14, 0.34);
      box-shadow: 0 10px 22px rgba(146, 64, 14, 0.28);
      clip-path: polygon(0 28%, 16% 28%, 22% 0, 38% 28%, 50% 0, 62% 28%, 78% 0, 84% 28%, 100% 28%, 100% 100%, 0 100%);
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
      z-index: 2;
    }

    .emq-promo-badge::before {
      content: "";
      position: absolute;
      inset: 5px 8px auto;
      height: 1px;
      background: rgba(255, 255, 255, 0.6);
    }

    .emq-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .emq-chip {
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid #dbeafe;
      background: #f8fafc;
      color: #334155;
      padding: 0 8px;
      font-size: 12px;
      font-weight: 800;
    }

    .emq-card h3 {
      margin: 10px 0 6px;
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .emq-pricing-card {
      min-height: 300px;
    }

    .emq-price-line {
      color: var(--emq-green);
      font-size: 26px;
      line-height: 1.1;
      font-weight: 950;
    }

    .emq-price-note {
      margin-top: 4px;
      color: var(--emq-muted);
      font-size: 12px;
      font-weight: 800;
    }

    .emq-feature-list {
      display: grid;
      gap: 6px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      color: #334155;
      font-size: 13px;
      line-height: 1.35;
    }

    .emq-feature-list li {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      gap: 7px;
    }

    .emq-feature-list li::before {
      content: "•";
      color: var(--emq-blue);
      font-weight: 950;
    }

    .emq-addon-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .emq-addon-grid.compact {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .emq-addon-card {
      min-height: 120px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
      box-shadow: var(--emq-shadow);
    }

    .emq-addon-card b {
      display: block;
      color: #0f172a;
      line-height: 1.25;
    }

    .emq-addon-card span {
      display: block;
      margin-top: 5px;
    }

    .emq-badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 0;
    }

    .emq-trust-badge {
      min-height: 30px;
      display: inline-flex;
      align-items: center;
      border: 1px solid #bbf7d0;
      border-radius: 999px;
      background: #f0fdf4;
      color: #166534;
      padding: 0 10px;
      font-size: 12px;
      font-weight: 950;
    }

    .emq-service-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .emq-service-banner-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }

    .emq-service-banner {
      min-height: 104px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 10px;
      box-shadow: var(--emq-shadow);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-decoration: none;
    }

    .emq-service-visual {
      font-size: 24px;
      line-height: 1;
      margin-bottom: 7px;
      transition: transform .18s ease;
    }

    .emq-service-banner:hover .emq-service-visual {
      transform: translateY(-2px) rotate(-4deg);
    }

    .emq-service-banner h3 {
      margin: 7px 0 0;
      font-size: 15px;
      line-height: 1.16;
    }

    .emq-service-card {
      min-height: 250px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
      box-shadow: var(--emq-shadow);
      display: flex;
      flex-direction: column;
      gap: 10px;
      justify-content: space-between;
    }

    .emq-service-card h3 {
      margin: 8px 0 5px;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .emq-service-card.carvertical {
      border-color: #9ec5ff;
      background: linear-gradient(145deg, #ffffff 0%, #f1f7ff 100%);
    }

    .emq-coupon-box {
      border: 1px dashed #1682e8;
      border-radius: 8px;
      background: #ffffff;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .emq-coupon-code {
      font-weight: 950;
      letter-spacing: 0.6px;
      color: #0f355d;
    }

    .emq-affiliate-note {
      color: #64748b;
      font-size: 11px;
      line-height: 1.35;
    }

    .emq-carvertical-logo {
      display: block;
      width: min(190px, 70%);
      height: auto;
    }

    .emq-carvertical-partner-banner {
      position: relative;
      overflow: hidden;
      border: 1px solid #0875e1;
      border-radius: 12px;
      background: linear-gradient(120deg, #005fbd 0%, #0875e1 52%, #1494ed 100%);
      color: #ffffff;
      padding: 24px 28px;
      box-shadow: 0 18px 42px rgba(8, 117, 225, 0.2);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 26px;
    }

    .emq-carvertical-partner-banner::after {
      content: "";
      position: absolute;
      width: 250px;
      height: 250px;
      right: -90px;
      top: -120px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      pointer-events: none;
    }

    .emq-carvertical-partner-banner h2 {
      color: #ffffff;
      margin: 12px 0 7px;
      font-size: clamp(23px, 3vw, 34px);
      line-height: 1.08;
      max-width: 760px;
    }

    .emq-carvertical-partner-banner p {
      margin: 0;
      color: #eaf5ff;
      max-width: 780px;
      line-height: 1.5;
    }

    .emq-carvertical-partner-kicker {
      display: inline-flex;
      margin-bottom: 10px;
      color: #dceeff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }

    .emq-carvertical-partner-action {
      position: relative;
      z-index: 1;
      min-width: 220px;
      display: grid;
      gap: 9px;
    }

    .emq-carvertical-partner-action .emq-btn {
      background: #ffffff;
      border-color: #ffffff;
      color: #075fae;
      text-align: center;
    }

    .emq-carvertical-partner-action .emq-coupon-box {
      color: #0f355d;
    }

    .emq-carvertical-partner-banner .emq-affiliate-note {
      color: #dceeff;
      text-align: center;
    }

    .emq-carvertical-contact-integration {
      margin-top: 22px;
      padding-top: 20px;
      border-top: 1px solid var(--emq-border);
    }

    .emq-carvertical-contact-integration h3 {
      margin: 0 0 6px;
      font-size: 18px;
      line-height: 1.25;
    }

    .emq-carvertical-contact-integration > p {
      margin: 0 0 14px;
      color: var(--emq-muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .emq-carvertical-widget-frame {
      width: min(100%, 300px);
      margin: 0 auto;
    }

    .emq-carvertical-button-frame {
      width: min(100%, 250px);
      min-height: 72px;
    }

    .emq-carvertical-widget-frame [data-cvaff] {
      max-width: 100%;
    }

    .emq-carvertical-official-banner {
      margin-top: 18px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 16px;
      box-shadow: var(--emq-shadow);
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      align-items: center;
      gap: 18px;
    }

    .emq-carvertical-official-banner h2 {
      margin: 0 0 7px;
      font-size: 22px;
    }

    .emq-carvertical-official-banner p {
      margin: 0;
      color: var(--emq-muted);
      line-height: 1.5;
    }

    .emq-carvertical-contact-integration .emq-affiliate-note {
      display: block;
      margin: 10px auto 0;
      width: min(100%, 300px);
    }

    .emq-service-form {
      display: grid;
      gap: 8px;
    }

    .emq-service-form.compact {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .emq-service-result {
      grid-column: 1 / -1;
      min-height: 34px;
      border-radius: 8px;
      padding: 8px 10px;
      background: #f8fafc;
      color: #334155;
      font-size: 13px;
      line-height: 1.4;
      display: none;
    }

    .emq-service-result.visible {
      display: block;
    }

    .emq-card-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: start;
    }

    .emq-pill {
      min-height: 26px;
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid #bae6fd;
      background: #f0f9ff;
      color: #075985;
      padding: 0 8px;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .emq-price {
      color: var(--emq-green);
      font-size: 18px;
      font-weight: 900;
    }

    .emq-empty {
      border: 1px dashed #93c5fd;
      border-radius: 8px;
      background: #ffffff;
      padding: 24px;
      color: var(--emq-muted);
      text-align: center;
    }

    .emq-detail {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 0.4fr);
      gap: 16px;
      align-items: start;
    }

    .emq-detail-media {
      position: relative;
      margin: -16px -16px 16px;
      aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, #e0f2fe, #ffffff);
      border-bottom: 1px solid var(--emq-border);
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 8px 8px 0 0;
      color: var(--emq-blue-dark);
      font-weight: 950;
    }

    .emq-detail-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .emq-detail-gallery {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      margin: -4px 0 16px;
    }

    .emq-detail-gallery a {
      aspect-ratio: 4 / 3;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      overflow: hidden;
      background: #ffffff;
      display: block;
    }

    .emq-detail-gallery img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .emq-detail h1 {
      margin: 0 0 10px;
      font-size: clamp(30px, 4vw, 46px);
      letter-spacing: 0;
      line-height: 1.05;
    }

    .emq-detail-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0;
    }

    .emq-listing-section {
      display: grid;
      gap: 10px;
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--emq-border);
    }

    .emq-listing-section h2 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .emq-description {
      display: grid;
      gap: 10px;
      color: #334155;
      font-size: 15px;
      line-height: 1.65;
    }

    .emq-description p {
      margin: 0;
    }

    .emq-spec-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .emq-spec {
      display: grid;
      gap: 3px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #f8fcff;
      padding: 10px 12px;
      min-width: 0;
    }

    .emq-spec span {
      color: var(--emq-muted);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .emq-spec b {
      color: #0f172a;
      font-size: 14px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .emq-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .emq-form-grid .wide {
      grid-column: 1 / -1;
    }

    .emq-account-nav {
      display: flex;
      gap: 22px;
      align-items: center;
      overflow-x: auto;
      border-bottom: 1px solid var(--emq-border);
      margin-bottom: 16px;
    }

    .emq-account-nav a,
    .emq-account-nav button {
      min-height: 54px;
      border: 0;
      background: transparent;
      color: #45606c;
      font: inherit;
      font-weight: 800;
      text-decoration: none;
      white-space: nowrap;
      border-bottom: 3px solid transparent;
    }

    .emq-account-nav .active {
      color: #001f27;
      border-bottom-color: #003b44;
    }

    .emq-account-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin-bottom: 14px;
    }

    .emq-account-summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .emq-account-summary .emq-stat {
      min-height: 74px;
    }

    .emq-account-toolbar {
      display: grid;
      grid-template-columns: auto minmax(240px, 1fr) minmax(180px, .4fr) minmax(180px, .4fr);
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
    }

    .emq-account-list {
      display: grid;
      gap: 12px;
    }

    .emq-account-row {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) 182px;
      gap: 16px;
      align-items: start;
      background: #ffffff;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      padding: 12px;
      box-shadow: var(--emq-shadow);
      overflow: hidden;
    }

    .emq-account-row h3 {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.2;
    }

    .emq-account-details {
      min-width: 0;
      position: relative;
      z-index: 1;
      background: #ffffff;
      padding: 4px 0;
    }

    .emq-account-details .emq-chip-row {
      align-items: flex-start;
      max-width: 100%;
    }

    .emq-account-thumb {
      width: 220px;
      max-width: 100%;
      aspect-ratio: 4 / 3;
      border-radius: 8px;
      background: var(--cat-bg, #e0f2fe);
      display: grid;
      place-items: center;
      overflow: hidden;
      font-size: 32px;
    }

    .emq-account-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .emq-account-actions {
      display: grid;
      gap: 8px;
      align-content: center;
      min-width: 0;
      width: 182px;
    }

    .emq-account-actions form {
      margin: 0;
    }

    .emq-account-actions .emq-btn,
    .emq-account-actions .emq-btn-secondary {
      width: 100%;
      min-height: 42px;
      line-height: 1.15;
      text-align: center;
      white-space: normal;
    }

    .emq-btn-danger {
      background: #fff1f2;
      color: #be123c;
      border-color: #fecdd3;
    }

    .emq-btn-danger:hover {
      background: #ffe4e6;
      color: #9f1239;
    }

    @media (max-width: 1180px) {
      .emq-account-row {
        grid-template-columns: 180px minmax(0, 1fr) 170px;
      }

      .emq-account-thumb {
        width: 180px;
      }

      .emq-account-actions {
        width: 170px;
      }
    }

    .emq-copy-box {
      width: 100%;
      min-height: 150px;
      resize: vertical;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      padding: 12px;
      color: var(--emq-text);
      background: #ffffff;
      font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    .emq-marketplace-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }

    .emq-business-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }

    .emq-business-card {
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
      box-shadow: var(--emq-shadow);
      display: grid;
      gap: 10px;
    }

    .emq-business-card h3 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
    }

    .emq-business-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .emq-business-contact {
      display: grid;
      gap: 4px;
      color: var(--emq-muted);
      font-size: 14px;
      line-height: 1.35;
    }

    .emq-business-contact a {
      color: #075985;
      font-weight: 900;
      text-decoration: none;
      overflow-wrap: anywhere;
    }

    .emq-table-wrap {
      overflow-x: auto;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
    }

    .emq-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      font-size: 13px;
    }

    .emq-table th,
    .emq-table td {
      padding: 11px 12px;
      border-bottom: 1px solid var(--emq-border);
      text-align: left;
      vertical-align: top;
    }

    .emq-table th {
      color: #075985;
      background: #f0f9ff;
      font-weight: 900;
    }

    .emq-auth-shell {
      min-height: 68vh;
      display: grid;
      place-items: center;
    }

    .emq-auth-card {
      width: min(520px, 100%);
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: var(--emq-shadow-strong);
      padding: 18px;
    }

    .emq-auth-card h1 {
      margin: 0 0 14px;
      font-size: 30px;
      line-height: 1.1;
    }

    .emq-auth-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 12px;
    }

    .emq-publish-shell {
      display: grid;
      gap: 14px;
    }

    .emq-publish-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 16px;
      box-shadow: var(--emq-shadow);
    }

    .emq-publish-head h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1.05;
    }

    .emq-publish-form {
      display: grid;
      gap: 14px;
    }

    .emq-form-section {
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 16px;
      box-shadow: var(--emq-shadow);
    }

    .emq-form-section h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }

    .emq-upload-zone {
      min-height: 170px;
      border: 1px dashed #93c5fd;
      border-radius: 8px;
      background: #f8fbff;
      display: grid;
      gap: 12px;
      padding: 18px;
    }

    .emq-upload-zone input {
      width: 100%;
    }

    .emq-upload-button {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      justify-self: start;
      border-radius: 8px;
      border: 1px solid var(--emq-blue);
      background: #ffffff;
      color: var(--emq-blue-dark);
      padding: 0 14px;
      font-weight: 900;
      cursor: pointer;
    }

    .emq-upload-button input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .emq-upload-preview {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }

    .emq-upload-preview span,
    .emq-upload-preview img {
      aspect-ratio: 1;
      border-radius: 8px;
      border: 1px solid var(--emq-border);
      background: #ffffff;
      display: grid;
      place-items: center;
      object-fit: cover;
      width: 100%;
      min-width: 0;
      color: var(--emq-blue-dark);
      font-size: 12px;
      font-weight: 900;
      overflow: hidden;
    }

    .emq-current-gallery {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .emq-current-gallery img {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid var(--emq-border);
      background: #f8fafc;
    }

    .emq-publish-fields {
      display: none;
      grid-column: 1 / -1;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .emq-publish-fields.active {
      display: grid;
    }

    .emq-plan-option {
      min-height: 96px;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
      display: grid;
      gap: 8px;
    }

    .emq-plan-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .emq-checkout-actions {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .emq-plan-option input {
      margin: 0 8px 0 0;
    }

    .emq-public-alert {
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      font-weight: 850;
      border: 1px solid var(--emq-border);
      background: #ffffff;
    }

    .emq-public-alert[hidden] {
      display: none;
    }

    .emq-public-alert.success {
      color: #166534;
      border-color: #bbf7d0;
      background: #f0fdf4;
    }

    .emq-public-alert.danger {
      color: #991b1b;
      border-color: #fecaca;
      background: #fff1f2;
    }

    .emq-legal-shell {
      display: grid;
      gap: 14px;
    }

    .emq-legal-hero h1 {
      margin: 8px 0;
      font-size: clamp(30px, 5vw, 54px);
      line-height: 0.98;
    }

    .emq-legal-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .emq-legal-card {
      min-height: 150px;
      display: grid;
      gap: 8px;
      align-content: start;
      border: 1px solid var(--emq-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 16px;
      box-shadow: var(--emq-shadow);
    }

    .emq-legal-card h2 {
      margin: 0;
      font-size: 18px;
    }

    .emq-legal-card p,
    .emq-legal-card li {
      color: var(--emq-muted);
      line-height: 1.55;
      font-size: 14px;
    }

    .emq-legal-card ul {
      margin: 0;
      padding-left: 18px;
    }

    .emq-footer {
      border-top: 1px solid var(--emq-border);
      background: #ffffff;
      color: var(--emq-muted);
    }

    .emq-footer-inner {
      min-height: 142px;
      display: grid;
      grid-template-columns: minmax(190px, 0.8fr) minmax(320px, 1.4fr) minmax(220px, 0.8fr);
      align-items: start;
      gap: 24px;
      padding: 24px 0;
      font-size: 13px;
    }

    .emq-footer b {
      color: var(--emq-text);
      display: block;
      font-size: 16px;
      margin-bottom: 8px;
    }

    .emq-footer a {
      color: #075985;
      font-weight: 800;
      text-decoration: none;
    }

    .emq-footer-links {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 9px 18px;
    }

    .emq-footer-support {
      display: grid;
      justify-items: end;
      gap: 8px;
      text-align: right;
    }

    @media (max-width: 980px) {
      .emq-hero,
      .emq-detail,
      .emq-grid,
      .emq-grid.two,
      .emq-addon-grid,
      .emq-service-grid,
      .emq-service-banner-grid,
      .emq-business-grid,
      .emq-free-hero,
      .emq-promo-card-grid,
      .emq-account-summary,
      .emq-account-toolbar,
      .emq-account-row,
      .emq-account-head,
      .emq-publish-head,
      .emq-carvertical-partner-banner,
      .emq-carvertical-official-banner {
        grid-template-columns: 1fr;
      }

      .emq-carvertical-partner-banner {
        padding: 21px;
      }

      .emq-carvertical-partner-action {
        width: 100%;
        min-width: 0;
      }

      .emq-category-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .emq-featured-head {
        display: grid;
        align-items: start;
      }

      .emq-featured-track {
        grid-auto-columns: minmax(260px, 88%);
      }

      .emq-service-banner-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .emq-detail-gallery,
      .emq-spec-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .emq-free-hero {
        padding: 18px;
      }

      .emq-free-hero h1 {
        font-size: 30px;
      }

      .emq-search,
      .emq-search.expanded,
      .emq-hero-search,
      .emq-category-fields,
      .emq-category-fields.active,
      .emq-form-grid,
      .emq-publish-fields,
      .emq-publish-fields.active,
      .emq-plan-grid,
      .emq-upload-preview,
      .emq-service-form.compact {
        grid-template-columns: 1fr;
      }

      .emq-current-gallery {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .emq-search.expanded .wide,
      .emq-search.expanded .submit {
        grid-column: auto;
      }

      .emq-account-thumb {
        width: min(100%, 360px);
      }

      .emq-account-actions {
        width: 100%;
      }

      .emq-stats {
        grid-template-columns: 1fr;
      }

      .emq-legal-grid,
      .emq-footer-inner,
      .emq-footer-links {
        grid-template-columns: 1fr;
      }

      .emq-header-inner,
      .emq-footer-inner {
        align-items: flex-start;
        padding: 12px 0;
      }

      .emq-header-inner {
        display: grid;
        grid-template-columns: 1fr;
      }

      .emq-brand {
        width: 100%;
      }

      .emq-nav {
        width: 100%;
      }

      .emq-footer-support {
        justify-items: start;
        text-align: left;
      }

      .emq-nav {
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <header class="emq-header">
    <div class="emq-header-inner">
      <a class="emq-brand" href="/" aria-label="e-Marqet">
        <img class="emq-brand-mark" src="/brand/emarqet-facebook-profile.png" alt="" aria-hidden="true">
        <span class="emq-brand-copy">
          <span class="emq-brand-name">e-Marqet</span>
          <span class="emq-brand-tagline">marketplace pentru anunțuri și parteneri verificați</span>
        </span>
      </a>
      <nav class="emq-nav" aria-label="Navigare e-Marqet">
        <a href="/anunturi">Anunțuri</a>
        <a href="/auto">Auto</a>
        <a href="/verificare-istoric-auto-carvertical">Istoric auto</a>
        <a href="/imobiliare">Imobiliare</a>
        <a href="/parteneri">Parteneri</a>
        <a href="/preturi">Prețuri</a>
        <a href="/publica" class="primary">Publică anunț</a>
        ${user?.id ? `<a href="/cont">Contul meu</a>` : `<a href="/cont/login">Intră în cont</a>`}
      </nav>
    </div>
  </header>
  <main class="emq-main">
    ${body}
  </main>
  <footer class="emq-footer">
    <div class="emq-footer-inner">
      <div class="emq-account-details">
        <b>e-Marqet</b>
        <span>Marketplace pentru anunțuri, abonamente, servicii și parteneri verificați.</span>
      </div>
      <nav class="emq-footer-links" aria-label="Linkuri e-Marqet">
        <a href="/anunturi">Anunțuri</a>
        <a href="/verificare-istoric-auto-carvertical">Verificare istoric auto</a>
        <a href="/parteneri">Parteneri</a>
        <a href="/preturi">Prețuri</a>
        <a href="/publica">Publică anunț</a>
        <a href="/despre">Despre</a>
        <a href="/contact">Contact</a>
        <a href="/siguranta">Siguranță</a>
        <a href="/termeni">Termeni</a>
        <a href="/confidentialitate">Confidențialitate</a>
        <a href="/gdpr">GDPR</a>
        <a href="/cookies">Cookies</a>
      </nav>
      <div class="emq-footer-support">
        <span>Suport</span>
        <a href="mailto:${escapeHtml(EMARQET_SUPPORT_EMAIL)}">${escapeHtml(EMARQET_SUPPORT_EMAIL)}</a>
        <span>© ${new Date().getFullYear()} e-Marqet</span>
      </div>
    </div>
  </footer>
  <script>
    const EMQ_AUTO_BRAND_MODELS = ${JSON.stringify(AUTO_BRAND_MODELS)};
    const EMQ_DEPENDENT_SELECT_OPTIONS = ${JSON.stringify(EMARQET_DEPENDENT_OPTIONS)};
    const EMQ_CATEGORY_SUGGESTION_RULES = ${JSON.stringify(EMARQET_CATEGORY_SUGGESTION_RULES)};
    const EMQ_CATEGORY_LABELS = ${JSON.stringify(Object.fromEntries(EMARQET_CATEGORY_DEFINITIONS.map((category) => [category.code, category.name])))};
    const EMQ_UPLOAD_MAX_FILES = 10;
    const EMQ_UPLOAD_MAX_FILE_BYTES = 20 * 1024 * 1024;
    const EMQ_UPLOAD_MAX_TOTAL_BYTES = 45 * 1024 * 1024;

    function emqAutoModelOptions(brand) {
      if (brand && EMQ_AUTO_BRAND_MODELS[brand]) return EMQ_AUTO_BRAND_MODELS[brand];
      return [...new Set(Object.values(EMQ_AUTO_BRAND_MODELS).flat())].sort((a, b) => a.localeCompare(b, "ro", { numeric: true }));
    }

    function syncEmarqetAutoModels(root) {
      const scope = root || document;
      scope.querySelectorAll("[data-emq-category-form]").forEach((form) => {
        const brandSelect = form.querySelector("[data-emq-auto-brand-select]");
        const modelSelect = form.querySelector("[data-emq-auto-model-select]");
        if (!brandSelect || !modelSelect) return;
        const previous = modelSelect.value || modelSelect.dataset.selected || "";
        modelSelect.replaceChildren(new Option("", ""));
        emqAutoModelOptions(brandSelect.value).forEach((model) => modelSelect.add(new Option(model, model)));
        modelSelect.value = emqAutoModelOptions(brandSelect.value).includes(previous) ? previous : "";
        modelSelect.dataset.selected = modelSelect.value;
      });
    }

    function syncEmarqetDependentFields(root) {
      const scope = root || document;
      scope.querySelectorAll("[data-emq-dependent-key]").forEach((control) => {
        const config = EMQ_DEPENDENT_SELECT_OPTIONS[control.dataset.emqDependentKey];
        const block = control.closest("[data-emq-category-fields]") || control.closest("form");
        if (!config || !block) return;
        const source = block.querySelector('[name="' + config.source + '"]');
        const options = source?.value ? config.options?.[source.value] || [] : [];
        const listId = control.getAttribute("list");
        const datalist = listId ? document.getElementById(listId) : null;
        if (datalist) {
          datalist.replaceChildren(...options.map((value) => {
            const option = document.createElement("option");
            option.value = value;
            return option;
          }));
        }
      });
    }

    function normalizeEmarqetSuggestionText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function suggestedEmarqetCategory(value) {
      const text = " " + normalizeEmarqetSuggestionText(value) + " ";
      if (text.trim().length < 4) return null;
      const scored = EMQ_CATEGORY_SUGGESTION_RULES.map((rule) => {
        const matches = rule.keywords
          .map(normalizeEmarqetSuggestionText)
          .filter((keyword) => keyword && text.includes(" " + keyword + " "));
        const score = matches.reduce((total, keyword) => {
          if (keyword.includes(" ")) return total + 4;
          return total + (keyword.length >= 6 ? 2 : 1);
        }, 0);
        return { code: rule.code, score, matches };
      }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || b.matches.join("").length - a.matches.join("").length);
      if (!scored.length || scored[0].score < 2) return null;
      return scored[0];
    }

    function syncEmarqetCategorySuggestion(form) {
      if (!form) return;
      const box = form.querySelector("[data-emq-category-suggestion]");
      const select = form.querySelector("[data-emq-category-select]");
      if (!box || !select) return;
      const title = form.querySelector('[name="title"]')?.value || "";
      const notes = form.querySelector('[name="notes"]')?.value || "";
      const suggestion = suggestedEmarqetCategory(title + " " + notes);
      if (!suggestion || ![...select.options].some((option) => option.value === suggestion.code)) {
        box.hidden = true;
        box.dataset.suggestedCode = "";
        return;
      }
      const label = EMQ_CATEGORY_LABELS[suggestion.code] || suggestion.code;
      const text = box.querySelector("[data-emq-category-suggestion-text]");
      const button = box.querySelector("button");
      box.hidden = false;
      box.dataset.suggestedCode = suggestion.code;
      if (text) text.textContent = select.value === suggestion.code
        ? "Categoria selectată pare potrivită: " + label + "."
        : "Categorie sugerată după titlu și descriere: " + label + ".";
      if (button) button.hidden = select.value === suggestion.code;
    }

    function syncEmarqetCategoryFields(root) {
      const scope = root || document;
      scope.querySelectorAll("[data-emq-category-form]").forEach((form) => {
        const select = form.querySelector("[data-emq-category-select]");
        const selected = select ? select.value : "";
        form.querySelectorAll("[data-emq-category-fields]").forEach((block) => {
          const active = selected && block.dataset.emqCategoryFields === selected;
          block.classList.toggle("active", Boolean(active));
          block.querySelectorAll("input, select, textarea").forEach((control) => {
            control.disabled = !active;
          });
        });
      });
      syncEmarqetAutoModels(scope);
      syncEmarqetDependentFields(scope);
      scope.querySelectorAll("form[data-emq-category-form]").forEach(syncEmarqetCategorySuggestion);
    }
    function showEmarqetFormError(form, message) {
      if (!form) return;
      const box = form.querySelector("[data-emq-form-error]");
      if (!box) return;
      box.textContent = message || "Completează câmpurile obligatorii evidențiate.";
      box.hidden = false;
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    document.addEventListener("DOMContentLoaded", () => syncEmarqetCategoryFields(document));
    document.addEventListener("invalid", (event) => {
      const form = event.target.closest("form[data-emq-category-form]");
      if (!form) return;
      const label = event.target.closest("label")?.querySelector("span")?.textContent || event.target.name || "câmp";
      showEmarqetFormError(form, "Completează câmpul: " + label + ".");
    }, true);
    document.addEventListener("change", (event) => {
      if (event.target.closest("[data-emq-category-select]")) {
        syncEmarqetCategoryFields(document);
      }
      if (event.target.closest("[data-emq-auto-brand-select]")) {
        syncEmarqetAutoModels(document);
      }
      if (event.target.closest("[data-emq-auto-model-select]")) {
        event.target.dataset.selected = event.target.value || "";
      }
      if (event.target.closest("[data-emq-category-fields] select")) {
        syncEmarqetDependentFields(event.target.closest("[data-emq-category-fields]"));
      }
      const photoInput = event.target.closest("[data-emq-photo-input]");
      if (photoInput) {
        const preview = document.querySelector(photoInput.dataset.emqPhotoInput || "");
        const files = [...photoInput.files];
        const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
        const oversized = files.find((file) => file.size > EMQ_UPLOAD_MAX_FILE_BYTES);
        const invalidType = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type));
        const form = photoInput.closest("form[data-emq-category-form]");
        if (files.length > EMQ_UPLOAD_MAX_FILES || totalBytes > EMQ_UPLOAD_MAX_TOTAL_BYTES || oversized || invalidType) {
          photoInput.value = "";
          const reason = invalidType
            ? "Încarcă doar poze JPG, PNG sau WebP."
            : oversized
              ? "O poză este prea mare. Limita este 20 MB per poză."
              : files.length > EMQ_UPLOAD_MAX_FILES
                ? "Ai selectat prea multe poze. Limita este 10 poze."
                : "Pozele selectate sunt prea mari împreună. Alege mai puține poze sau poze mai mici.";
          showEmarqetFormError(form, reason);
          if (preview) preview.innerHTML = "<span>+</span><span>+</span><span>+</span><span>+</span><span>+</span><span>+</span>";
          return;
        }
        if (preview) {
          preview.innerHTML = "";
          files.slice(0, EMQ_UPLOAD_MAX_FILES).forEach((file) => {
            const image = document.createElement("img");
            image.alt = file.name;
            image.src = URL.createObjectURL(file);
            image.onload = () => URL.revokeObjectURL(image.src);
            preview.appendChild(image);
          });
          if (!preview.children.length) {
            preview.innerHTML = "<span>+</span><span>+</span><span>+</span><span>+</span><span>+</span><span>+</span>";
          }
        }
      }
    });
    document.addEventListener("input", (event) => {
      if (!event.target.matches('[name="title"], [name="notes"]')) return;
      syncEmarqetCategorySuggestion(event.target.closest("form[data-emq-category-form]"));
    });
    document.addEventListener("click", (event) => {
      const categoryTile = event.target.closest("[data-emq-home-category]");
      if (categoryTile) {
        event.preventDefault();
        const code = categoryTile.dataset.emqHomeCategory || "";
        const band = document.querySelector("[data-emq-home-search-band]");
        const form = document.querySelector("[data-emq-advanced-search]");
        const select = form?.querySelector("[data-emq-category-select]");
        if (band) band.classList.remove("collapsed");
        if (select) {
          select.value = code;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        (band || form || categoryTile).scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const button = event.target.closest("[data-emq-apply-category-suggestion]");
      if (!button) return;
      const box = button.closest("[data-emq-category-suggestion]");
      const form = button.closest("form[data-emq-category-form]");
      const select = form?.querySelector("[data-emq-category-select]");
      if (!box?.dataset.suggestedCode || !select) return;
      select.value = box.dataset.suggestedCode;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncEmarqetCategorySuggestion(form);
    });
    document.querySelectorAll("[data-emq-featured-carousel]").forEach((track) => {
      let paused = false;
      const pause = () => { paused = true; };
      const resume = () => { paused = false; };
      track.addEventListener("pointerenter", pause);
      track.addEventListener("pointerleave", resume);
      track.addEventListener("focusin", pause);
      track.addEventListener("focusout", resume);
      window.setInterval(() => {
        if (paused || track.scrollWidth <= track.clientWidth) return;
        const step = Math.max(280, Math.round(track.clientWidth * 0.72));
        const nearEnd = track.scrollLeft + track.clientWidth + step >= track.scrollWidth;
        track.scrollTo({ left: nearEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
      }, 4200);
    });
    document.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-vin-decode-form]");
      if (!form) return;
      event.preventDefault();
      const result = form.querySelector("[data-vin-result]");
      if (result) {
        result.classList.add("visible");
        result.textContent = "Se verifică VIN-ul...";
      }
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        const response = await fetch("/api/e-marqet/services/vin-decode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || "VIN invalid");
        const vehicle = data.vehicle || {};
        const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine].filter(Boolean);
        result.textContent = parts.length ? parts.join(" · ") : "VIN decodat, dar datele sunt limitate.";
      } catch (error) {
        if (result) result.textContent = "Nu am putut decoda VIN-ul. Verifică seria și încearcă din nou.";
      }
    });
  </script>
</body>
</html>`;
}

function verticalOptions(verticals = [], selected = "", defaultCode = "auto") {
  const selectedDefinition = categoryByCode(selected);
  const selectedCode = selectedDefinition?.code || String(selected || defaultCode || "");
  return [
    `<option value="">Toate categoriile</option>`,
    ...verticals.map((vertical) => `
      <option value="${escapeHtml(vertical.code)}" ${String(selectedCode) === String(vertical.code) ? "selected" : ""}>${escapeHtml(vertical.name || vertical.code)}</option>
    `)
  ].join("");
}

function verticalIdOptions(verticals = [], selected = "") {
  const selectedCode = selectedVerticalCode(verticals, selected);
  return verticals.map((vertical) => `
    <option value="${escapeHtml(vertical.code || vertical.id)}" ${String(selectedCode) === String(vertical.code) ? "selected" : ""}>${escapeHtml(vertical.name || vertical.code)}</option>
  `).join("");
}

function selectedVerticalCode(verticals = [], selected = "") {
  const raw = String(selected || "");
  if (!raw) return "auto";
  const byDefinition = categoryByCode(raw);
  if (byDefinition) return byDefinition.code;
  const found = verticals.find((vertical) => String(vertical.id) === raw || String(vertical.code) === raw);
  return found?.code || raw;
}

function categoriesWithRows(verticals = []) {
  const rowsByCode = new Map(verticals.map((vertical) => [vertical.code, vertical]));
  return EMARQET_CATEGORY_DEFINITIONS.map((definition) => ({
    ...definition,
    ...(rowsByCode.get(definition.code) || {}),
    code: definition.code,
    name: rowsByCode.get(definition.code)?.name || definition.name,
    public_path: rowsByCode.get(definition.code)?.public_path || definition.public_path
  }));
}

function listingUrl(listing = {}) {
  return `/anunt/${encodeURIComponent(listing.slug || listing.listing_code || listing.id)}`;
}

function partnerPublicPath(partner = {}) {
  const id = partner.partner_profile_id || partner.id;
  if (!id) return "";
  const name = partner.partner_display_name || partner.display_name || partner.owner_name || "partener";
  const slug = slugify(name) || "partener";
  return `/parteneri/${encodeURIComponent(`${id}-${slug}`)}`;
}

function verticalUrl(vertical = {}) {
  const definition = categoryByVerticalRow(vertical);
  return definition?.public_path || vertical.public_path || `/${encodeURIComponent(vertical.code || vertical.id)}`;
}

const CATEGORY_VISUALS = {
  auto: { icon: "🚗", bg: "#ffe05c" },
  imobiliare: { icon: "🏠", bg: "#b8e2ff" },
  turism: { icon: "🏖️", bg: "#b8f7ef" },
  joburi: { icon: "💼", bg: "#c7d2fe" },
  servicii: { icon: "🛠️", bg: "#fed7aa" },
  produse: { icon: "📦", bg: "#fbcfe8" },
  jucarii: { icon: "🧸", bg: "#fde68a" },
  electronice_electrocasnice: { icon: "📱", bg: "#99f6e4" },
  pc_laptopuri_it: { icon: "💻", bg: "#bfdbfe" },
  telefoane_accesorii: { icon: "☎️", bg: "#fecdd3" },
  audio_video: { icon: "🎧", bg: "#ddd6fe" },
  moda_frumusete: { icon: "👗", bg: "#fbcfe8" },
  casa_gradina: { icon: "🪴", bg: "#bbf7d0" },
  mama_copilul: { icon: "👶", bg: "#fef3c7" },
  sport_timp_liber_arta: { icon: "🚲", bg: "#bae6fd" },
  animale_companie: { icon: "🐾", bg: "#fed7aa" },
  agro_industrie: { icon: "🚜", bg: "#d9f99d" },
  echipamente_profesionale: { icon: "🏗️", bg: "#cbd5e1" },
  inchirieri: { icon: "🔑", bg: "#c4b5fd" }
};

function categoryVisual(category = {}) {
  return CATEGORY_VISUALS[category.code] || { icon: "◼", bg: "#e0f2fe" };
}

function servicePriceLabel(service = {}) {
  if (service.price_amount === null || service.price_amount === undefined || service.price_amount === "") {
    if (service.pricing_model === "paid_or_affiliate") return "plătit / afiliat";
    if (service.pricing_model === "commission") return "comision partener";
    return "la cerere";
  }
  const amount = Number(service.price_amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    if (String(service.pricing_model || "").includes("commission")) return "comision partener";
    if (String(service.pricing_model || "").includes("lead")) return "lead gratuit";
    return "gratuit";
  }
  return fmtCatalogPrice(amount, service.currency);
}

function trustBadges(badges = []) {
  if (!badges.length) return "";
  return `<div class="emq-badge-row">${badges.map((badge) => `<span class="emq-trust-badge">${escapeHtml(badge.label || badge.code || "Verificat")}</span>`).join("")}</div>`;
}

function optionHtml(options = [], selected = "") {
  const selectedValue = String(selected || "");
  const normalizedOptions = options.map((option) => String(option));
  const fullOptions = selectedValue && !normalizedOptions.includes(selectedValue)
    ? [selectedValue, ...options]
    : options;
  return [
    `<option value=""></option>`,
    ...fullOptions.map((option) => `<option value="${escapeHtml(option)}" ${selectedValue === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`)
  ].join("");
}

function fieldControl(field = {}, value = "", extraClass = "", context = {}) {
  const type = field.type === "number" ? "number" : "text";
  const disabledAttr = context._disabled ? " disabled" : "";
  const dependent = field.dependentKey ? EMARQET_DEPENDENT_OPTIONS[field.dependentKey] : null;
  const dependentSourceValue = dependent ? context[dependent.source] : "";
  const dependentOptions = dependentSourceValue ? dependent?.options?.[dependentSourceValue] || [] : [];
  const contextualOptions = dependent ? dependentOptions : field.options || [];
  if (field.type === "select") {
    const options = field.autoRole === "model" && context.brand && AUTO_BRAND_MODELS[context.brand]
      ? AUTO_BRAND_MODELS[context.brand]
      : contextualOptions;
    const autoAttr = field.autoRole === "brand"
      ? " data-emq-auto-brand-select"
      : field.autoRole === "model"
        ? ` data-emq-auto-model-select data-selected="${escapeHtml(value || "")}"`
        : "";
    return `
      <label class="emq-field ${escapeHtml(extraClass)}">
        <span>${escapeHtml(field.label || field.name)}</span>
        <select class="emq-select" name="${escapeHtml(field.name)}"${autoAttr}${disabledAttr}>${optionHtml(options, value)}</select>
      </label>
    `;
  }
  if (field.type === "datalist") {
    const listId = `emq-list-${String(context._categoryCode || "category")}-${String(context._block || "fields")}-${String(field.name || "value")}`
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    const dependentAttr = field.dependentKey
      ? ` data-emq-dependent-key="${escapeHtml(field.dependentKey)}"`
      : "";
    return `
      <label class="emq-field ${escapeHtml(extraClass)}">
        <span>${escapeHtml(field.label || field.name)}</span>
        <input class="emq-input" type="text" name="${escapeHtml(field.name)}" value="${escapeHtml(value || "")}" list="${escapeHtml(listId)}"${dependentAttr}${disabledAttr}>
        <datalist id="${escapeHtml(listId)}">${contextualOptions.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist>
      </label>
    `;
  }
  return `
    <label class="emq-field ${escapeHtml(extraClass)}">
      <span>${escapeHtml(field.label || field.name)}</span>
      <input class="emq-input" type="${escapeHtml(type)}" name="${escapeHtml(field.name)}" value="${escapeHtml(value || "")}"${disabledAttr}>
    </label>
  `;
}

function categoryFilterBlocks({ verticals = [], filters = {} } = {}) {
  const activeCode = selectedVerticalCode(verticals, filters.vertical);
  return categoriesWithRows(verticals).map((category) => {
    const fields = searchFieldsFor(category.code);
    if (!fields.length) return "";
    return `
      <div class="emq-category-fields ${activeCode === category.code ? "active" : ""}" data-emq-category-fields="${escapeHtml(category.code)}">
        ${fields.map((field) => fieldControl(field, filters[field.name] || "", "", { ...filters, _categoryCode: category.code, _block: "filters", _disabled: activeCode !== category.code })).join("")}
      </div>
    `;
  }).join("");
}

function publishFieldBlocks({ verticals = [], form = {} } = {}) {
  const activeCode = selectedVerticalCode(verticals, form.vertical_id);
  return categoriesWithRows(verticals).map((category) => {
    const fields = publishFieldsFor(category.code);
    if (!fields.length) return "";
    return `
      <div class="emq-publish-fields ${activeCode === category.code ? "active" : ""}" data-emq-category-fields="${escapeHtml(category.code)}">
        ${fields.map((field) => fieldControl(field, form[field.name] || "", "", { ...form, _categoryCode: category.code, _block: "publish", _disabled: activeCode !== category.code })).join("")}
      </div>
    `;
  }).join("");
}

function vinDecodeServiceCard(service = {}, listing = {}) {
  return `
    <article class="emq-service-card">
      <div>
        <span class="emq-pill">${escapeHtml(servicePriceLabel(service))}</span>
        <h3>${escapeHtml(service.name || "VIN decode")}</h3>
        <span>${escapeHtml(service.description || "")}</span>
      </div>
      <form class="emq-service-form compact" data-vin-decode-form>
        <input type="hidden" name="listing_id" value="${escapeHtml(listing.id || "")}">
        <input class="emq-input" name="vin" maxlength="17" minlength="17" required placeholder="VIN / serie șasiu">
        <button class="emq-btn" type="submit">${escapeHtml(service.cta_label || "Decodează VIN")}</button>
        <div class="emq-service-result" data-vin-result></div>
      </form>
    </article>
  `;
}

function requestServiceCard(service = {}, listing = {}) {
  const returnTo = listingUrl(listing);
  return `
    <article class="emq-service-card">
      <div>
        <div class="emq-card-top">
          <span class="emq-pill">${escapeHtml(servicePriceLabel(service))}</span>
          ${service.requires_partner ? `<span class="emq-muted">partener</span>` : `<span class="emq-muted">e-Marqet</span>`}
        </div>
        <h3>${escapeHtml(service.name || "Serviciu")}</h3>
        <span>${escapeHtml(service.description || "")}</span>
      </div>
      <form method="post" action="/services/request" class="emq-service-form">
        <input type="hidden" name="listing_id" value="${escapeHtml(listing.id || "")}">
        <input type="hidden" name="service_code" value="${escapeHtml(service.code || "")}">
        <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
        <input class="emq-input" name="requester_name" required placeholder="Nume">
        <input class="emq-input" name="requester_email" type="email" placeholder="Email">
        <input class="emq-input" name="requester_phone" placeholder="Telefon">
        ${String(service.code || "").includes("vin") ? `<input class="emq-input" name="vin" maxlength="17" placeholder="VIN">` : ""}
        <button class="emq-btn" type="submit">${escapeHtml(service.cta_label || "Solicită")}</button>
      </form>
    </article>
  `;
}

function carVerticalAffiliateSdkHead() {
  return `<script>
    (function(w,d,u,h,s){
      h=d.getElementsByTagName('head')[0];
      s=d.createElement('script');
      s.async=1;
      s.src=u+'/sdk.js';
      h.appendChild(s);
    })(window,document,'https://aff.carvertical.com');
  </script>`;
}

function carVerticalWidgetVin(listing = {}) {
  const metadata = listingMetadata(listing);
  const vin = [listing.vin, metadata.vin, metadata.vin_optional]
    .map((value) => cleanText(value).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ""))
    .find((value) => /^[A-HJ-NPR-Z0-9]{17}$/.test(value));
  return vin || "";
}

function carVerticalContactButton(listing = {}) {
  const vin = carVerticalWidgetVin(listing);
  return `
    <section class="emq-carvertical-contact-integration" aria-label="Verificare istoric auto carVertical">
      <h3>Verifică istoricul înainte să contactezi vânzătorul</h3>
      <p>${vin ? "VIN-ul anunțului este transmis automat către carVertical." : "Deschide verificarea carVertical și introdu seria VIN a mașinii."}</p>
      <div class="emq-carvertical-widget-frame emq-carvertical-button-frame">
        <div
          data-cvaff
          data-platform="everflow"
          data-locale="ro"
          data-partner-id="2NGMLPR"
          data-offer-id="66RQ8Q"
          data-uid="01"
          data-chan="website"
          data-voucher="emarqet20"
          ${vin ? `data-vin="${escapeHtml(vin)}"` : ""}
          data-animated="true"
          data-variant="variant-2"
          data-integration-type="button"
          style="width:250px;height:72px">
        </div>
      </div>
      <span class="emq-affiliate-note">Folosește codul EMARQET20 pentru 20% reducere. Link afiliat, fără cost suplimentar.</span>
    </section>
  `;
}

function carVerticalOfficialBanner() {
  return `
    <section class="emq-carvertical-official-banner" aria-label="Banner oficial carVertical">
      <div>
        <span class="emq-pill">Partener oficial</span>
        <h2>Verifică istoricul mașinii înainte de cumpărare</h2>
        <p>Introdu VIN-ul în bannerul carVertical și folosește codul <strong>EMARQET20</strong> pentru 20% reducere.</p>
        <span class="emq-affiliate-note">e-Marqet poate primi un comision din achizițiile eligibile, fără cost suplimentar pentru tine.</span>
      </div>
      <div class="emq-carvertical-widget-frame">
        <div
          data-cvaff
          data-platform="everflow"
          data-locale="ro"
          data-partner-id="2NGMLPR"
          data-offer-id="66RQ8Q"
          data-uid="01"
          data-chan="website"
          data-voucher="emarqet20"
          data-integration-type="banner"
          data-variant="drowned"
          data-background="lightblue"
          style="width:300px;height:250px">
        </div>
      </div>
    </section>
  `;
}

function carVerticalTrackingHref(listing = {}, placement = "listing_services") {
  const params = new URLSearchParams();
  if (listing.id) params.set("listing_id", String(listing.id));
  params.set("placement", placement);
  return `/partener/carvertical?${params.toString()}`;
}

function carVerticalServiceCard(service = {}, listing = {}) {
  return `
    <article class="emq-service-card carvertical">
      <div>
        <div class="emq-card-top">
          <img class="emq-carvertical-logo" src="/assets/partners/carvertical-logo-blue.png" alt="carVertical">
          <span class="emq-pill">Partener oficial</span>
        </div>
        <h3>${escapeHtml(service.name || "Raport istoric auto")}</h3>
        <span>${escapeHtml(service.description || "Verifică istoricul mașinii înainte de cumpărare.")}</span>
      </div>
      <div class="emq-service-form">
        <div class="emq-coupon-box">
          <span>20% reducere</span>
          <span class="emq-coupon-code">EMARQET20</span>
        </div>
        <a class="emq-btn" href="${escapeHtml(carVerticalTrackingHref(listing))}" target="_blank" rel="sponsored noopener noreferrer">${escapeHtml(service.cta_label || "Verifică pe carVertical")}</a>
        <a class="emq-btn-secondary" href="/verificare-istoric-auto-carvertical">Cum funcționează raportul</a>
        <span class="emq-affiliate-note">Link afiliat. e-Marqet poate primi un comision, fără cost suplimentar pentru tine.</span>
      </div>
    </article>
  `;
}

function carVerticalPartnerBanner({ listing = {}, placement = "partner_banner" } = {}) {
  return `
    <section class="emq-carvertical-partner-banner" aria-label="Parteneriat e-Marqet și carVertical">
      <div>
        <span class="emq-carvertical-partner-kicker">e-Marqet × carVertical · parteneriat activ</span>
        <img class="emq-carvertical-logo" src="/assets/partners/carvertical-logo-white.png" alt="carVertical">
        <h2>Verifică istoricul mașinii înainte să o cumperi</h2>
        <p>Accesează raportul carVertical prin e-Marqet și folosește codul <strong>EMARQET20</strong> pentru 20% reducere.</p>
      </div>
      <div class="emq-carvertical-partner-action">
        <div class="emq-coupon-box">
          <span>Cod reducere</span>
          <span class="emq-coupon-code">EMARQET20</span>
        </div>
        <a class="emq-btn" href="/verificare-istoric-auto-carvertical">Verifică istoricul auto</a>
        <span class="emq-affiliate-note">Link afiliat. Fără cost suplimentar pentru tine.</span>
      </div>
    </section>
  `;
}

function servicesSection(services = [], listing = {}) {
  if (!services.length) return "";
  const cards = services.map((service) => {
    if (service.code === "vin_decode_basic") return vinDecodeServiceCard(service, listing);
    if (service.code === "vehicle_history_report") return carVerticalServiceCard(service, listing);
    return requestServiceCard(service, listing);
  }).join("");
  return `
    <section>
      <div class="emq-section-head">
        <div><h2>Servicii disponibile</h2></div>
      </div>
      <div class="emq-service-grid">${cards}</div>
    </section>
  `;
}

function partnerListingBox(listing = {}) {
  const partnerUrl = partnerPublicPath(listing);
  const partnerName = listing.partner_display_name || "";
  if (!partnerUrl || !partnerName) return "";
  const partnerEmail = cleanText(listing.partner_email || listing.owner_email);
  const partnerPhone = cleanText(listing.partner_phone || listing.contact_phone);
  const partnerPhoneHref = phoneHref(partnerPhone);
  const mailSubject = encodeURIComponent(`Cerere e-Marqet: ${listing.title || listing.listing_code || "anunt"}`);
  return `
    <article class="emq-business-card">
      <div class="emq-card-top">
        <span class="emq-pill">Partener verificat</span>
        <span class="emq-muted">${escapeHtml(partnerTypeLabel(listing.partner_type))}</span>
      </div>
      <div>
        <h3>${escapeHtml(partnerName)}</h3>
        <span class="emq-muted">${escapeHtml([listing.partner_city, listing.partner_county].filter(Boolean).join(", ") || "e-Marqet")}</span>
      </div>
      ${partnerPhone || partnerEmail ? `
        <div class="emq-business-contact">
          ${partnerPhone ? `<span>Telefon: ${partnerPhoneHref ? `<a href="${escapeHtml(partnerPhoneHref)}">${escapeHtml(partnerPhone)}</a>` : escapeHtml(partnerPhone)}</span>` : ""}
          ${partnerEmail ? `<span>Email: <a href="mailto:${escapeHtml(partnerEmail)}?subject=${escapeHtml(mailSubject)}">${escapeHtml(partnerEmail)}</a></span>` : ""}
        </div>
      ` : ""}
      <div class="emq-business-meta">
        <a class="emq-btn-secondary" href="${escapeHtml(partnerUrl)}">Toate anunțurile</a>
        ${listing.partner_website ? `<a class="emq-btn-secondary" href="${escapeHtml(listing.partner_website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ""}
        ${partnerPhoneHref ? `<a class="emq-btn-secondary" href="${escapeHtml(partnerPhoneHref)}">Telefon</a>` : ""}
        ${partnerEmail ? `<a class="emq-btn-secondary" href="mailto:${escapeHtml(partnerEmail)}?subject=${escapeHtml(mailSubject)}">Email</a>` : ""}
      </div>
    </article>
  `;
}

function serviceIcon(service = {}) {
  const code = String(service.code || "");
  if (code.includes("vin")) return "🔎";
  if (code === "vehicle_history_report") return "📋";
  if (code.includes("leasing")) return "💶";
  if (code.includes("price")) return "📈";
  if (code.includes("damage")) return "🛡";
  return "⚙";
}

function serviceBanners(services = []) {
  if (!services.length) return "";
  return `
    <section>
      <div class="emq-section-head">
        <div><h2>Servicii integrate</h2></div>
        <a class="emq-btn-secondary" href="/auto">Auto</a>
      </div>
      <div class="emq-service-banner-grid">
        ${services.map((service) => `
          <a class="emq-service-banner" href="${service.code === "vehicle_history_report" ? "/verificare-istoric-auto-carvertical" : "/auto"}">
            <div>
              <div class="emq-service-visual" aria-hidden="true">${escapeHtml(serviceIcon(service))}</div>
              <span class="emq-pill">${escapeHtml(service.code === "vehicle_history_report" ? "20% reducere · EMARQET20" : service.requires_partner ? "Partener" : "e-Marqet")}</span>
              <h3>${escapeHtml(service.name || "Serviciu")}</h3>
            </div>
            <span class="emq-muted">${escapeHtml(servicePriceLabel(service))}</span>
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

function parseFeatureList(value = "") {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function limitLabel(value) {
  const limit = Number(value || 0);
  if (limit < 0) return "Nelimitat";
  if (limit === 0) return "La cerere";
  return `${limit.toLocaleString("ro-RO")} anunțuri`;
}

function planTypeLabel(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "dedicated") return "Pachet dedicat";
  if (normalized === "founding") return "Founding Member";
  return "Abonament";
}

function planRadioOptions(plans = [], selected = "") {
  const publicPlans = plans.filter((plan) => String(plan.plan_type || "standard").toLowerCase() === "standard");
  const rows = publicPlans.length ? publicPlans : [
    { code: "free", name: "Free", monthly_price: 0, yearly_price: 0, currency: "RON", listing_limit: 3 },
    { code: "start", name: "Start", monthly_price: 29, yearly_price: 290, currency: "RON", listing_limit: 10 },
    { code: "pro", name: "Pro", monthly_price: 79, yearly_price: 790, currency: "RON", listing_limit: 100 }
  ];
  const selectedCode = String(selected || rows[0]?.code || "free").toLowerCase();
  return rows.map((plan) => `
    <label class="emq-plan-option">
      <span><input type="radio" name="plan_code" value="${escapeHtml(plan.code)}" ${String(plan.code).toLowerCase() === selectedCode ? "checked" : ""}>${escapeHtml(plan.name || plan.code)}</span>
      <strong>${fmtCatalogPrice(plan.monthly_price, plan.currency, "/lună")}</strong>
      <span class="emq-muted">${escapeHtml(limitLabel(plan.listing_limit))}</span>
    </label>
  `).join("");
}

function partnerTypeLabel(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "auto_dealer") return "Dealer auto";
  if (normalized === "real_estate_agency") return "Agenție imobiliară";
  return "Partener business";
}

function partnerStatusLabel(value = "") {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "ACTIV") return "Verificat";
  if (normalized === "IN_REVIZIE") return "În verificare";
  if (normalized === "PAUZAT") return "Pauzat";
  if (normalized === "RESPINS") return "Respins";
  return value || "Nou";
}

function businessPlanOptions(plans = [], selected = "") {
  const wanted = new Set(["business", "enterprise", "auto_business", "real_estate_business", "founding_business", "founding_enterprise"]);
  const rows = plans.filter((plan) => wanted.has(String(plan.code || "").toLowerCase()));
  const fallback = [
    { code: "business", name: "Business", monthly_price: 199, currency: "RON" },
    { code: "auto_business", name: "Auto Business", monthly_price: 299, currency: "RON" },
    { code: "real_estate_business", name: "Real Estate Business", monthly_price: 299, currency: "RON" }
  ];
  const options = rows.length ? rows : fallback;
  const selectedCode = String(selected || "").toLowerCase();
  return options.map((plan) => `
    <option value="${escapeHtml(plan.code)}" ${String(plan.code || "").toLowerCase() === selectedCode ? "selected" : ""}>
      ${escapeHtml(plan.name || plan.code)} · ${fmtCatalogPrice(plan.monthly_price, plan.currency, "/lună")}
    </option>
  `).join("");
}

function partnerProfileOptions(profiles = [], selected = "") {
  if (!profiles.length) return `<option value="">Creează profil business</option>`;
  const selectedId = String(selected || "");
  return profiles.map((profile) => `
    <option value="${escapeHtml(profile.id)}" ${String(profile.id) === selectedId ? "selected" : ""}>
      ${escapeHtml(profile.display_name || partnerTypeLabel(profile.partner_type))} · ${escapeHtml(partnerTypeLabel(profile.partner_type))}
    </option>
  `).join("");
}

function partnerProfileCard(profile = {}) {
  return `
    <article class="emq-business-card">
      <div class="emq-card-top">
        <span class="emq-pill">${escapeHtml(partnerTypeLabel(profile.partner_type))}</span>
        <span class="emq-pill">${escapeHtml(partnerStatusLabel(profile.status))}</span>
      </div>
      <div>
        <h3>${escapeHtml(profile.display_name || "Profil business")}</h3>
        <span class="emq-muted">${escapeHtml(profile.legal_name || "")}</span>
      </div>
      <div class="emq-business-meta">
        <span class="emq-chip">CUI ${escapeHtml(profile.cui || "-")}</span>
        <span class="emq-chip">${escapeHtml(profile.city || "Oraș")}</span>
        <span class="emq-chip">${escapeHtml(profile.selected_plan_code || "business")}</span>
      </div>
      <div class="emq-business-meta">
        ${profile.website ? `<a class="emq-btn-secondary" href="${escapeHtml(profile.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ""}
        <a class="emq-btn-secondary" href="/cont/importuri">Importuri</a>
      </div>
    </article>
  `;
}

function partnerProfileSummary(profiles = []) {
  if (!profiles.length) {
    return `
      <div class="emq-empty">
        <a class="emq-btn" href="/cont/business">Activează profil business</a>
      </div>
    `;
  }
  return `<div class="emq-business-grid">${profiles.map(partnerProfileCard).join("")}</div>`;
}

function importRows(imports = []) {
  if (!imports.length) return `<tr><td colspan="7"><div class="emq-empty">Nu există importuri încă.</div></td></tr>`;
  return imports.map((row) => `
    <tr>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
      <td>${escapeHtml(row.partner_name || "-")}</td>
      <td>${escapeHtml(row.vertical_code || "-")}</td>
      <td>${escapeHtml(row.file_name || "-")}</td>
      <td>${escapeHtml(row.imported_count || 0)}</td>
      <td>${escapeHtml(row.skipped_count || 0)}</td>
      <td>${escapeHtml(row.status || "-")}</td>
    </tr>
  `).join("");
}

function pricingCard(plan = {}) {
  const features = parseFeatureList(plan.features_json);
  const yearly = Number(plan.yearly_price || 0);
  return `
    <article class="emq-card emq-pricing-card">
      <div>
        <div class="emq-card-top">
          <span class="emq-pill">${escapeHtml(planTypeLabel(plan.plan_type))}</span>
          <span class="emq-muted">${escapeHtml(limitLabel(plan.listing_limit))}</span>
        </div>
        <h3>${escapeHtml(plan.name || "Plan e-Marqet")}</h3>
        <span>${escapeHtml(plan.audience || "Conturi e-Marqet")}</span>
        <ul class="emq-feature-list">
          ${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
        </ul>
      </div>
      <div>
        <div class="emq-price-line">${fmtCatalogPrice(plan.monthly_price, plan.currency, "/lună")}</div>
        ${yearly > 0 ? `<div class="emq-price-note">sau ${fmtCatalogPrice(yearly, plan.currency, "/an")}</div>` : ""}
      </div>
    </article>
  `;
}

function addonCard(addon = {}) {
  return `
    <article class="emq-addon-card">
      <b>${escapeHtml(addon.name || "Serviciu e-Marqet")}</b>
      <span class="emq-muted">${escapeHtml(addon.description || addon.category || "")}</span>
      <div class="emq-price" style="margin-top:10px">${fmtCatalogPrice(addon.price_amount, addon.currency)}</div>
      <span class="emq-muted">${escapeHtml(addon.included_in_plan ? `Inclus în ${addon.included_in_plan}` : addon.billing_unit || "")}</span>
    </article>
  `;
}

function addonGroupTitle(category = "") {
  const normalized = String(category || "").toLowerCase();
  if (normalized === "promovare") return "Promovare";
  if (normalized === "distributie") return "Social";
  if (normalized === "ai") return "AI & media";
  return category || "Servicii";
}

function addonGroups(addons = []) {
  const groups = new Map();
  for (const addon of addons) {
    const key = addon.category || "servicii";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(addon);
  }
  return [...groups.entries()];
}

function pricingSection({ pricingPlans = [], addons = [] } = {}) {
  const standard = pricingPlans.filter((plan) => String(plan.plan_type || "standard").toLowerCase() === "standard");
  const dedicated = pricingPlans.filter((plan) => String(plan.plan_type || "").toLowerCase() === "dedicated");
  const founding = pricingPlans.filter((plan) => String(plan.plan_type || "").toLowerCase() === "founding");
  if (!pricingPlans.length) {
    return `
      <section id="preturi">
        <div class="emq-section-head">
          <div><h2>Planuri</h2></div>
        </div>
        <div class="emq-grid">
          <div class="emq-card"><div><span class="emq-pill">Start</span><h3>Persoane fizice</h3><span>Publicare controlată și statistici de bază.</span></div><div class="emq-price-line">29 lei/lună</div></div>
          <div class="emq-card"><div><span class="emq-pill">Pro</span><h3>Firme active</h3><span>Profil verificat, promovare în categorie și import Excel.</span></div><div class="emq-price-line">79 lei/lună</div></div>
          <div class="emq-card"><div><span class="emq-pill">Business</span><h3>Agenții & volume</h3><span>Anunțuri nelimitate, CRM și importuri avansate.</span></div><div class="emq-price-line">199 lei/lună</div></div>
        </div>
      </section>
    `;
  }
  return `
    <section id="preturi">
      <div class="emq-section-head">
        <div><h2>Abonamente</h2></div>
        <a class="emq-btn-secondary" href="/publica">Publică anunț</a>
      </div>
      <div class="emq-grid">${standard.map(pricingCard).join("")}</div>
    </section>

    ${dedicated.length ? `
      <section>
        <div class="emq-section-head">
          <div><h2>Pachete dedicate</h2></div>
        </div>
        <div class="emq-grid">${dedicated.map(pricingCard).join("")}</div>
      </section>
    ` : ""}

    ${founding.length ? `
      <section>
        <div class="emq-section-head">
          <div><h2>Founding Member</h2></div>
        </div>
        <div class="emq-grid two">${founding.map(pricingCard).join("")}</div>
      </section>
    ` : ""}

    ${addonGroups(addons).map(([category, rows]) => `
      <section>
        <div class="emq-section-head">
          <div><h2>${escapeHtml(addonGroupTitle(category))}</h2></div>
        </div>
        <div class="emq-addon-grid compact">${rows.map(addonCard).join("")}</div>
      </section>
    `).join("")}
  `;
}

function listingCard(listing = {}) {
  const promoted = Boolean(listing.is_promoted);
  const category = categoryByCode(listing.vertical_code || "");
  const summary = metadataSummary(listing, 4);
  const partnerUrl = partnerPublicPath(listing);
  const partnerName = listing.partner_display_name || "";
  const image = listing.primary_image_url
    ? `<img src="${escapeHtml(listing.primary_image_url)}" alt="${escapeHtml(listing.title || "Anunț e-Marqet")}" loading="lazy">`
    : `<span>${escapeHtml(category?.icon || "EM")}</span>`;
  return `
    <article class="emq-card emq-listing-card">
      <a class="emq-listing-link" href="${escapeHtml(listingUrl(listing))}">
        <div class="emq-listing-media">
          ${image}
          ${promoted ? `<span class="emq-promo-badge">Promovat</span>` : ""}
        </div>
        <div class="emq-listing-body">
          <div>
          <div class="emq-card-top">
            <span class="emq-pill">${escapeHtml(listing.vertical_name || "e-Marqet")}</span>
            <span class="emq-muted">${escapeHtml(dateValue(listing.published_at || listing.created_at) || "nou")}</span>
          </div>
          <h3>${escapeHtml(listing.title || "Anunț e-Marqet")}</h3>
          <span>${escapeHtml(listing.location || "Locație disponibilă la cerere")}</span>
          ${summary.length ? `<div class="emq-chip-row">${summary.map((item) => `<span class="emq-chip">${escapeHtml(item.value)}</span>`).join("")}</div>` : ""}
        </div>
        <div>
          <div class="emq-price">${fmtAmount(listing.price_amount, listing.price_currency)}</div>
          <span>${escapeHtml(partnerName || listing.owner_name || "Publicat prin e-Marqet")}</span>
        </div>
        </div>
      </a>
      ${partnerUrl && partnerName ? `
        <div class="emq-listing-partner">
          <span class="emq-muted">Partener verificat</span>
          <a href="${escapeHtml(partnerUrl)}">${escapeHtml(partnerName)}</a>
        </div>
      ` : ""}
    </article>
  `;
}

function listingsGrid(listings = []) {
  if (!listings.length) {
    return `<div class="emq-empty">Nu sunt anunțuri în acest filtru.</div>`;
  }
  return `<div class="emq-grid">${listings.map(listingCard).join("")}</div>`;
}

function featuredListingCard(listing = {}) {
  const category = categoryByCode(listing.vertical_code || "");
  const summary = metadataSummary(listing, 2);
  const image = listing.primary_image_url
    ? `<img src="${escapeHtml(listing.primary_image_url)}" alt="${escapeHtml(listing.title || "Anunț e-Marqet")}" loading="lazy">`
    : `<span>${escapeHtml(category?.icon || "EM")}</span>`;
  return `
    <a class="emq-featured-card" href="${escapeHtml(listingUrl(listing))}">
      <div class="emq-featured-media">
        ${image}
        <span class="emq-promo-badge">${listing.is_promoted ? "Promovat" : "Recomandat"}</span>
      </div>
      <div class="emq-featured-body">
        <div class="emq-featured-meta">
          <span class="emq-pill">${escapeHtml(listing.vertical_name || category?.name || "e-Marqet")}</span>
          <span class="emq-muted">${escapeHtml(dateValue(listing.published_at || listing.created_at) || "nou")}</span>
        </div>
        <h3>${escapeHtml(listing.title || "Anunț e-Marqet")}</h3>
        <span class="emq-muted">${escapeHtml(listing.location || "Locație la cerere")}</span>
        ${summary.length ? `<div class="emq-chip-row">${summary.map((item) => `<span class="emq-chip">${escapeHtml(item.value)}</span>`).join("")}</div>` : ""}
        <div class="emq-price">${fmtAmount(listing.price_amount, listing.price_currency)}</div>
      </div>
    </a>
  `;
}

function featuredListingsRail(listings = [], options = {}) {
  if (!listings.length) return "";
  const title = options.title || "Anunțuri promovate";
  const description = options.description || "Galerie cu anunțurile împinse în față. Când activezi promovarea, apar automat aici.";
  const ctaHref = options.ctaHref || "/publica";
  const ctaLabel = options.ctaLabel || "Publică anunț";
  const ariaLabel = options.ariaLabel || title;
  const compactClass = options.compact ? " compact" : "";
  return `
    <section class="emq-featured-rail${compactClass}" aria-label="${escapeHtml(ariaLabel)}">
      <div class="emq-featured-head">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <a class="emq-btn" href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel)}</a>
      </div>
      <div class="emq-featured-track" data-emq-featured-carousel>
        ${listings.map(featuredListingCard).join("")}
      </div>
    </section>
  `;
}

function homePromoBanners(stats = {}) {
  return `
    <section class="emq-entry-promo" aria-label="Promoții e-Marqet">
      <div class="emq-free-hero">
        <div class="emq-free-hero-main">
          <span class="emq-promo-eyebrow">Start gratuit pe e-Marqet</span>
          <h1>Publică anunțuri gratuit. Ai 3 anunțuri gratuite pe utilizator.</h1>
          <p>Adaugă mașini, imobiliare, servicii sau produse și primești imediat link public pe care îl poți distribui.</p>
          <form class="emq-hero-search" action="/anunturi" method="get">
            <input name="q" placeholder="Caută anunț, oraș, marcă sau serviciu">
            <button class="emq-btn" type="submit">Caută</button>
          </form>
          <div class="emq-promo-actions">
            <a class="emq-btn" href="/cont/inregistrare?return_to=/publica">Publică gratuit</a>
            <a class="emq-btn-secondary" href="/anunturi">Vezi anunțuri</a>
          </div>
        </div>
        <div class="emq-free-kpis client" aria-label="Statistici e-Marqet">
          <div class="emq-free-kpi"><b>${escapeHtml(stats.publishedListings || 0)}</b><span>anunțuri publicate</span><small>ofertă activă pe marketplace</small></div>
          <div class="emq-free-kpi"><b>${escapeHtml(stats.openLeads || 0)}</b><span>cereri active</span><small>interes primit de la clienți</small></div>
          <div class="emq-free-kpi"><b>${escapeHtml(stats.activeVerticals || 0)}</b><span>categorii active</span><small>auto, servicii, produse și locale</small></div>
        </div>
      </div>
    </section>
  `;
}

function statusLabel(value = "") {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "PUBLICAT") return "Activ";
  if (normalized === "IN_REVIZIE") return "În așteptare";
  if (normalized === "DRAFT") return "Draft";
  if (normalized === "PAUZAT") return "Pauzat";
  if (normalized === "RESPINS") return "Respins";
  return value || "Nou";
}

function accountTabUrl(status = "all") {
  return `/cont?status=${encodeURIComponent(status)}`;
}

function accountStatusTabs(stats = {}, active = "all") {
  const tabs = [
    ["all", `Toate (${Number(stats.total || 0)})`],
    ["active", `Active (${Number(stats.active || 0)})`],
    ["pending", `În așteptare (${Number(stats.pending || 0)})`],
    ["pay", `De plătit (${Number(stats.to_pay || 0)})`],
    ["inactive", `Dezactivate (${Number(stats.inactive || 0)})`]
  ];
  return `
    <nav class="emq-account-nav" aria-label="Anunțuri cont">
      ${tabs.map(([key, label]) => `<a class="${active === key ? "active" : ""}" href="${escapeHtml(accountTabUrl(key))}">${escapeHtml(label)}</a>`).join("")}
    </nav>
  `;
}

function accountListingRow(listing = {}) {
  const category = categoryByCode(listing.vertical_code || "");
  const visual = categoryVisual({ ...category, code: category?.code || listing.vertical_code });
  const image = listing.primary_image_url
    ? `<img src="${escapeHtml(listing.primary_image_url)}" alt="${escapeHtml(listing.title || "Anunț")}" loading="lazy">`
    : `<span>${escapeHtml(visual.icon)}</span>`;
  const summary = metadataSummary(listing, 5);
  const isPublic = String(listing.status || "").toUpperCase() === "PUBLICAT";
  const isPaused = String(listing.status || "").toUpperCase() === "PAUZAT";
  const checkoutStatus = String(listing.stripe_checkout_status || "").toUpperCase();
  const needsPay = !listing.paid_at
    && !checkoutStatus.startsWith("PAID")
    && String(listing.selected_plan_code || "free").toLowerCase() !== "free"
    && listing.checkout_token;
  const slug = listing.slug || listing.listing_code || listing.id;
  return `
    <article class="emq-account-row">
      <div class="emq-account-thumb" style="--cat-bg:${escapeHtml(visual.bg)}">${image}</div>
      <div>
        <div class="emq-card-top">
          <span class="emq-pill">${escapeHtml(statusLabel(listing.status))}</span>
          ${listing.is_promoted ? `<span class="emq-promo-badge" style="position:static">Promovat</span>` : `<span class="emq-muted">${escapeHtml(dateValue(listing.created_at) || "nou")}</span>`}
        </div>
        <h3>${escapeHtml(listing.title || "Anunț e-Marqet")}</h3>
        <div class="emq-chip-row">
          <span class="emq-chip">${escapeHtml(listing.vertical_name || category?.name || "Categorie")}</span>
          <span class="emq-chip">${escapeHtml(listing.location || "Locație")}</span>
          <span class="emq-chip">${fmtAmount(listing.price_amount, listing.price_currency)}</span>
          ${summary.map((item) => `<span class="emq-chip">${escapeHtml(item.value)}</span>`).join("")}
        </div>
        <p class="emq-muted">ID: ${escapeHtml(listing.listing_code || listing.id || "-")}</p>
      </div>
      <div class="emq-account-actions">
        ${isPublic ? `<a class="emq-btn-secondary" href="${escapeHtml(listingUrl(listing))}">Vezi</a>` : ""}
        <a class="emq-btn-secondary" href="/cont/anunt/${encodeURIComponent(slug)}/edit">Editează</a>
        ${isPublic ? `<a class="emq-btn" href="/cont/distribuie/${encodeURIComponent(slug)}">Distribuie pe Facebook</a>` : ""}
        ${needsPay ? `<a class="emq-btn" href="/checkout/${encodeURIComponent(listing.listing_code || listing.id)}?token=${encodeURIComponent(listing.checkout_token)}">Finalizează plata</a>` : ""}
        ${isPublic ? `
          <form method="post" action="/cont/anunt/${encodeURIComponent(slug)}/status">
            <input type="hidden" name="action" value="deactivate">
            <button class="emq-btn-secondary" type="submit">Dezactivează</button>
          </form>
        ` : ""}
        ${isPaused ? `
          <form method="post" action="/cont/anunt/${encodeURIComponent(slug)}/status">
            <input type="hidden" name="action" value="reactivate">
            <button class="emq-btn" type="submit">Reactivează</button>
          </form>
        ` : ""}
        <form method="post" action="/cont/anunt/${encodeURIComponent(slug)}/delete" onsubmit="return confirm('Ștergi acest anunț din contul e-Marqet?');">
          <button class="emq-btn-secondary emq-btn-danger" type="submit">Șterge</button>
        </form>
        <a class="emq-btn-secondary" href="/cont/anunt/${encodeURIComponent(slug)}/promoveaza">Promovează</a>
      </div>
    </article>
  `;
}

function accountListings(listings = []) {
  if (!listings.length) return `<div class="emq-empty">Nu sunt anunțuri în acest filtru.</div>`;
  return `<div class="emq-account-list">${listings.map(accountListingRow).join("")}</div>`;
}

function renderEmarqetAuthPage(options = {}) {
  const isRegister = options.mode === "register";
  const returnTo = options.returnTo || "/cont";
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-auth-shell">
      <article class="emq-auth-card">
        <h1>${isRegister ? "Creează cont" : "Intră în cont"}</h1>
        <form method="post" action="${isRegister ? "/cont/inregistrare" : "/cont/login"}" class="emq-form-grid">
          <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
          ${isRegister ? `<label class="emq-field wide"><span>Nume</span><input class="emq-input" name="display_name" autocomplete="name" required></label>` : ""}
          <label class="emq-field wide"><span>Email</span><input class="emq-input" type="email" name="email" autocomplete="email" required></label>
          ${isRegister ? `<label class="emq-field wide"><span>Telefon</span><input class="emq-input" name="phone" autocomplete="tel" required></label>` : ""}
          <label class="emq-field wide"><span>Parolă</span><input class="emq-input" type="password" name="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required minlength="6"></label>
          <div class="wide emq-auth-actions">
            <button class="emq-btn" type="submit">${isRegister ? "Creează cont" : "Intră în cont"}</button>
            <a class="emq-btn-secondary" href="${isRegister ? `/cont/login?return_to=${encodeURIComponent(returnTo)}` : `/cont/inregistrare?return_to=${encodeURIComponent(returnTo)}`}">${isRegister ? "Am deja cont" : "Creează cont"}</a>
          </div>
        </form>
      </article>
    </section>
  `;
  return layout({
    title: `${isRegister ? "Creează cont" : "Intră în cont"} - e-Marqet`,
    description: "Cont e-Marqet.",
    canonicalPath: isRegister ? "/cont/inregistrare" : "/cont/login",
    body,
    user: options.user
  });
}

function renderEmarqetAccountPage(options = {}) {
  const user = options.user || {};
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const partnerProfiles = Array.isArray(options.partnerProfiles) ? options.partnerProfiles : [];
  const stats = options.stats || {};
  const referralStats = options.referralStats || {};
  const filters = options.filters || {};
  const activeStatus = filters.status || "all";
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-panel">
      <div class="emq-account-head">
        <div>
          <span class="emq-pill">${escapeHtml(user.email || "cont e-Marqet")}</span>
          <h1 style="margin:10px 0 0">${escapeHtml(user.display_name || "Contul meu")}</h1>
        </div>
        <div class="emq-auth-actions" style="margin:0">
          <a class="emq-btn" href="/publica">Publică anunț</a>
          <a class="emq-btn-secondary" href="/cont/business">Profil business</a>
          <a class="emq-btn-secondary" href="/cont/importuri">Importuri</a>
          <form method="post" action="/cont/logout"><button class="emq-btn-secondary" type="submit">Ieșire</button></form>
        </div>
      </div>
      <div class="emq-account-summary">
        <div class="emq-stat"><b>${escapeHtml(stats.active || 0)}</b><span>active</span></div>
        <div class="emq-stat"><b>${escapeHtml(stats.pending || 0)}</b><span>în așteptare</span></div>
        <div class="emq-stat"><b>${escapeHtml(stats.to_pay || 0)}</b><span>de plătit</span></div>
        <div class="emq-stat"><b>${escapeHtml(stats.promoted || 0)}</b><span>promovate</span></div>
        <div class="emq-stat"><b>${escapeHtml(stats.total || 0)}</b><span>total</span></div>
      </div>
      <section class="emq-panel" style="box-shadow:none; margin:14px 0; background:#f8fdff">
        <div class="emq-card-top">
          <div>
            <span class="emq-pill">Pune-l pe e-Marqet. Dă-l mai departe.</span>
            <h2 style="margin:8px 0 0">Promovare gratuită prin distribuire</h2>
          </div>
          <a class="emq-btn-secondary" href="/cont?status=active">Alege un anunț activ</a>
        </div>
        <div class="emq-account-summary">
          <div class="emq-stat"><b>${escapeHtml(referralStats.shares || 0)}</b><span>share-uri</span></div>
          <div class="emq-stat"><b>${escapeHtml(referralStats.listing_clicks || referralStats.total_clicks || 0)}</b><span>clickuri</span></div>
          <div class="emq-stat"><b>${escapeHtml(referralStats.rewarded || referralStats.total_rewards || 0)}</b><span>premii</span></div>
          <div class="emq-stat"><b>${escapeHtml(referralStats.threshold || 3)}</b><span>clickuri pentru boost</span></div>
        </div>
      </section>
      ${partnerProfileSummary(partnerProfiles)}
      <section class="emq-panel" style="box-shadow:none; margin:14px 0; background:#ffffff">
        <div class="emq-card-top">
          <div>
            <span class="emq-pill">Facturare</span>
            <h2 style="margin:8px 0 0">Date pentru factură</h2>
          </div>
        </div>
        <form method="post" action="/cont/facturare" class="emq-form-grid">
          <label class="emq-field wide"><span>Nume facturare</span><input class="emq-input" name="billing_name" value="${escapeHtml(user.billing_name || user.display_name || "")}" required></label>
          <label class="emq-field"><span>CUI / CNP</span><input class="emq-input" name="billing_cui" value="${escapeHtml(user.billing_cui || "")}" required inputmode="numeric" autocomplete="off"></label>
          <label class="emq-field"><span>Țară</span><input class="emq-input" name="billing_country" value="${escapeHtml(user.billing_country || "Romania")}" required></label>
          <label class="emq-field wide"><span>Adresă facturare</span><input class="emq-input" name="billing_address" value="${escapeHtml(user.billing_address || "")}" required></label>
          <label class="emq-field"><span>Localitate</span><input class="emq-input" name="billing_city" value="${escapeHtml(user.billing_city || "")}" required></label>
          <label class="emq-field"><span>Județ</span><input class="emq-input" name="billing_county" value="${escapeHtml(user.billing_county || "")}" required placeholder="Prahova sau RO-PH"></label>
          <button class="emq-btn" type="submit">Salvează datele</button>
        </form>
      </section>
      ${accountStatusTabs(stats, activeStatus)}
      <form class="emq-account-toolbar" method="get" action="/cont">
        <input type="hidden" name="status" value="${escapeHtml(activeStatus)}">
        <a class="emq-btn-secondary" href="/cont">Filtre</a>
        <input class="emq-input" name="q" value="${escapeHtml(filters.q || "")}" placeholder="Caută după titlu, ID sau locație">
        <select class="emq-select" name="vertical">${verticalOptions(verticals, filters.vertical, "")}</select>
        <button class="emq-btn" type="submit">Caută</button>
      </form>
      ${accountListings(listings)}
    </section>
  `;
  return layout({
    title: "Contul meu - e-Marqet",
    description: "Cont utilizator e-Marqet.",
    canonicalPath: "/cont",
    body,
    user
  });
}

function marketplaceCopyDescription(listing = {}) {
  const detailsUrl = absolutePublicPath(listingUrl(listing));
  return [
    listing.title || "Anunț e-Marqet",
    "",
    `Categorie: ${listing.vertical_name || listing.vertical_code || "e-Marqet"}`,
    listing.location ? `Locație: ${listing.location}` : "",
    `Preț: ${fmtAmount(listing.price_amount, listing.price_currency)}`,
    "",
    String(listing.notes || "").trim(),
    "",
    "Detalii și contact:",
    detailsUrl
  ].filter((line) => line !== null && line !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderEmarqetMarketplacePublishPage(options = {}) {
  const listing = options.listing || {};
  const title = listing.title || "Anunț e-Marqet";
  const price = Number(listing.price_amount || 0) > 0
    ? Number(listing.price_amount || 0).toLocaleString("ro-RO", { maximumFractionDigits: 2 })
    : "";
  const detailsUrl = absolutePublicPath(listingUrl(listing));
  const description = marketplaceCopyDescription(listing);
  const marketplaceCreateUrl = "https://www.facebook.com/marketplace/create/item";
  const imageUrl = listing.primary_image_url || "";
  const body = `
    <section class="emq-publish-shell">
      <div class="emq-publish-head">
        <div>
          <span class="emq-pill">Marketplace</span>
          <h1>Postează în Marketplace</h1>
        </div>
        <div class="emq-auth-actions" style="margin:0">
          <a class="emq-btn-secondary" href="/cont">Contul meu</a>
          <a class="emq-btn-secondary" href="${escapeHtml(listingUrl(listing))}">Vezi anunțul</a>
        </div>
      </div>

      <section class="emq-form-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="emq-chip-row">
          <span class="emq-chip">${escapeHtml(listing.vertical_name || "Categorie")}</span>
          <span class="emq-chip">${escapeHtml(listing.location || "Locație")}</span>
          <span class="emq-chip">${fmtAmount(listing.price_amount, listing.price_currency)}</span>
        </div>
        <div class="emq-marketplace-actions" style="margin-top:12px">
          <a class="emq-btn" href="${escapeHtml(marketplaceCreateUrl)}" target="_blank" rel="noopener">Deschide Facebook Marketplace</a>
          <a class="emq-btn-secondary" href="${escapeHtml(detailsUrl)}" target="_blank" rel="noopener">Link public</a>
          ${imageUrl ? `<a class="emq-btn-secondary" href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener">Deschide poza</a>` : ""}
        </div>
      </section>

      <section class="emq-form-section">
        <h2>Date de copiat</h2>
        <div class="emq-form-grid">
          <label class="emq-field wide">
            <span>Titlu</span>
            <input class="emq-input" data-copy-source="marketplace-title" value="${escapeHtml(title)}" readonly>
          </label>
          <label class="emq-field">
            <span>Preț</span>
            <input class="emq-input" data-copy-source="marketplace-price" value="${escapeHtml(price)}" readonly>
          </label>
          <label class="emq-field">
            <span>Link</span>
            <input class="emq-input" data-copy-source="marketplace-link" value="${escapeHtml(detailsUrl)}" readonly>
          </label>
          <label class="emq-field wide">
            <span>Descriere</span>
            <textarea class="emq-copy-box" data-copy-source="marketplace-description" readonly>${escapeHtml(description)}</textarea>
          </label>
        </div>
        <div class="emq-marketplace-actions">
          <button class="emq-btn-secondary" type="button" data-copy-target="marketplace-title">Copiază titlul</button>
          <button class="emq-btn-secondary" type="button" data-copy-target="marketplace-price">Copiază prețul</button>
          <button class="emq-btn-secondary" type="button" data-copy-target="marketplace-description">Copiază descrierea</button>
          <button class="emq-btn-secondary" type="button" data-copy-target="marketplace-link">Copiază linkul</button>
        </div>
      </section>
    </section>
    <script>
      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", async () => {
          const key = button.getAttribute("data-copy-target");
          const source = document.querySelector("[data-copy-source='" + key + "']");
          if (!source) return;
          try {
            await navigator.clipboard.writeText(source.value || source.textContent || "");
            const previous = button.textContent;
            button.textContent = "Copiat";
            window.setTimeout(() => { button.textContent = previous; }, 1400);
          } catch (error) {
            source.focus();
            source.select();
          }
        });
      });
    </script>
  `;
  return layout({
    title: "Postează în Marketplace - e-Marqet",
    description: "Pregătire anunț e-Marqet pentru Facebook Marketplace.",
    canonicalPath: `/cont/marketplace/${encodeURIComponent(listing.slug || listing.listing_code || listing.id || "")}`,
    body,
    user: options.user
  });
}

function renderEmarqetReferralSharePage(options = {}) {
  const listing = options.listing || {};
  const shareKit = options.shareKit || {};
  const title = listing.title || "Anunț e-Marqet";
  const progress = Math.min(Number(shareKit.clicks || 0), Number(shareKit.threshold || 3));
  const slug = listing.slug || listing.listing_code || listing.id || "";
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-publish-shell">
      <div class="emq-publish-head">
        <div>
          <span class="emq-pill">Campanie referral</span>
          <h1>Pune-l pe e-Marqet. Dă-l mai departe.</h1>
        </div>
        <div class="emq-auth-actions" style="margin:0">
          <a class="emq-btn-secondary" href="/cont">Contul meu</a>
          <a class="emq-btn-secondary" href="${escapeHtml(listingUrl(listing))}">Vezi anunțul</a>
        </div>
      </div>

      <section class="emq-form-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="emq-chip-row">
          <span class="emq-chip">${escapeHtml(listing.vertical_name || "Categorie")}</span>
          <span class="emq-chip">${escapeHtml(listing.location || "Locație")}</span>
          <span class="emq-chip">${fmtAmount(listing.price_amount, listing.price_currency)}</span>
          <span class="emq-chip">${escapeHtml(progress)}/${escapeHtml(shareKit.threshold || 3)} clickuri</span>
        </div>
        <p class="emq-muted">La ${escapeHtml(shareKit.threshold || 3)} clickuri unice pe linkul tău, anunțul primește promovare gratuită ${escapeHtml(shareKit.rewardDays || 7)} zile.</p>
        ${shareKit.reward ? `<div class="emq-public-alert success">Promovarea gratuită este activă până la ${escapeHtml(dateValue(shareKit.reward.expires_at) || "-")}.</div>` : ""}
      </section>

      <section class="emq-form-section">
        <h2>Distribuie linkul pe Facebook</h2>
        <p class="emq-muted">Pe PC, Facebook poate bloca dialogul direct de share. Varianta stabilă este să copiezi linkul, să deschizi Facebook și să îl lipești într-o postare.</p>
        <div class="emq-form-grid">
          <label class="emq-field wide">
            <span>Link anunț</span>
            <input class="emq-input" data-copy-source="referral-link" value="${escapeHtml(shareKit.shareUrl || "")}" readonly>
          </label>
          <label class="emq-field wide">
            <span>Text postare</span>
            <textarea class="emq-copy-box" data-copy-source="referral-caption" readonly>${escapeHtml(shareKit.caption || "")}</textarea>
          </label>
        </div>
        <div class="emq-marketplace-actions">
          <button class="emq-btn" type="button" data-copy-target="referral-link">Copiază linkul</button>
          <a class="emq-btn-secondary" href="https://www.facebook.com/" target="_blank" rel="noopener">Deschide Facebook</a>
          <button class="emq-btn-secondary" type="button" data-copy-target="referral-caption">Copiază textul</button>
          <a class="emq-btn-secondary" href="${escapeHtml(shareKit.facebookShareUrl || "#")}" target="_blank" rel="noopener">Share direct pe telefon</a>
          <form method="post" action="/cont/distribuie/${encodeURIComponent(slug)}/share">
            <input type="hidden" name="channel" value="facebook">
            <button class="emq-btn-secondary" type="submit">Am distribuit</button>
          </form>
        </div>
      </section>
    </section>
    <script>
      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", async () => {
          const key = button.getAttribute("data-copy-target");
          const source = document.querySelector("[data-copy-source='" + key + "']");
          if (!source) return;
          try {
            await navigator.clipboard.writeText(source.value || source.textContent || "");
            const previous = button.textContent;
            button.textContent = "Copiat";
            window.setTimeout(() => { button.textContent = previous; }, 1400);
          } catch (error) {
            source.focus();
            source.select();
          }
        });
      });
    </script>
  `;
  return layout({
    title: "Distribuie pe Facebook - e-Marqet",
    description: "Distribuie linkul anunțului pe Facebook cu preview din prima poză.",
    canonicalPath: `/cont/distribuie/${encodeURIComponent(slug)}`,
    body,
    user: options.user
  });
}

function renderEmarqetBusinessPage(options = {}) {
  const user = options.user || {};
  const profiles = Array.isArray(options.profiles) ? options.profiles : [];
  const pricingPlans = Array.isArray(options.pricingPlans) ? options.pricingPlans : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-publish-shell">
      <div class="emq-publish-head">
        <h1>Profil business</h1>
        <div class="emq-auth-actions" style="margin:0">
          <a class="emq-btn-secondary" href="/cont">Contul meu</a>
          <a class="emq-btn-secondary" href="/cont/importuri">Importuri</a>
        </div>
      </div>

      ${profiles.length ? `<section>${partnerProfileSummary(profiles)}</section>` : ""}

      <form method="post" action="/cont/business" class="emq-publish-form">
        <section class="emq-form-section">
          <h2>Date firmă</h2>
          <div class="emq-form-grid">
            <label class="emq-field">
              <span>Tip partener</span>
              <select class="emq-select" name="partner_type" required>
                <option value="auto_dealer">Dealer auto</option>
                <option value="real_estate_agency">Agenție imobiliară</option>
              </select>
            </label>
            <label class="emq-field">
              <span>Nume public</span>
              <input class="emq-input" name="display_name" required value="${escapeHtml(user.display_name || "")}">
            </label>
            <label class="emq-field">
              <span>Denumire firmă / persoană</span>
              <input class="emq-input" name="legal_name" required>
            </label>
            <label class="emq-field">
              <span>CUI / CNP</span>
              <input class="emq-input" name="cui" required inputmode="numeric" autocomplete="off">
            </label>
            <label class="emq-field">
              <span>Email</span>
              <input class="emq-input" type="email" name="email" required value="${escapeHtml(user.email || "")}">
            </label>
            <label class="emq-field">
              <span>Telefon</span>
              <input class="emq-input" name="phone" required value="${escapeHtml(user.phone || "")}">
            </label>
            <label class="emq-field">
              <span>Localitate</span>
              <input class="emq-input" name="city" required>
            </label>
            <label class="emq-field">
              <span>Județ</span>
              <input class="emq-input" name="county" required placeholder="Prahova sau RO-PH">
            </label>
            <label class="emq-field wide">
              <span>Adresă</span>
              <input class="emq-input" name="address" required>
            </label>
            <label class="emq-field">
              <span>Website</span>
              <input class="emq-input" name="website" placeholder="https://">
            </label>
            <label class="emq-field">
              <span>Plan</span>
              <select class="emq-select" name="selected_plan_code">${businessPlanOptions(pricingPlans, "auto_business")}</select>
            </label>
          </div>
        </section>

        <section class="emq-form-section">
          <h2>Importuri</h2>
          <div class="emq-business-grid">
            <div class="emq-business-card">
              <span class="emq-pill">Auto</span>
              <h3>CSV / Excel pregătit ca CSV</h3>
              <div class="emq-chip-row">
                <span class="emq-chip">title</span><span class="emq-chip">brand</span><span class="emq-chip">model</span><span class="emq-chip">year</span><span class="emq-chip">price</span>
              </div>
            </div>
            <div class="emq-business-card">
              <span class="emq-pill">Imobiliare</span>
              <h3>CSV / feed CRM</h3>
              <div class="emq-chip-row">
                <span class="emq-chip">title</span><span class="emq-chip">property_type</span><span class="emq-chip">rooms</span><span class="emq-chip">surface</span><span class="emq-chip">price</span>
              </div>
            </div>
          </div>
        </section>

        <button class="emq-btn" type="submit">Salvează profilul</button>
      </form>
    </section>
  `;
  return layout({
    title: "Profil business - e-Marqet",
    description: "Profil business e-Marqet.",
    canonicalPath: "/cont/business",
    body,
    user
  });
}

function renderEmarqetImportPage(options = {}) {
  const user = options.user || {};
  const profiles = Array.isArray(options.profiles) ? options.profiles : [];
  const imports = Array.isArray(options.imports) ? options.imports : [];
  const imported = Number(options.imported || 0);
  const skipped = Number(options.skipped || 0);
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${options.ok === "imported" ? `<div class="emq-public-alert success">Import procesat: ${escapeHtml(imported)} anunțuri create, ${escapeHtml(skipped)} rânduri sărite.</div>` : ""}
    <section class="emq-publish-shell">
      <div class="emq-publish-head">
        <h1>Importuri</h1>
        <div class="emq-auth-actions" style="margin:0">
          <a class="emq-btn-secondary" href="/cont">Contul meu</a>
          <a class="emq-btn-secondary" href="/cont/business">Profil business</a>
        </div>
      </div>

      <form method="post" action="/cont/importuri" enctype="multipart/form-data" class="emq-publish-form">
        <section class="emq-form-section">
          <h2>Import CSV / XLSX</h2>
          <div class="emq-form-grid">
            <label class="emq-field">
              <span>Profil</span>
              <select class="emq-select" name="profile_id" required>${partnerProfileOptions(profiles)}</select>
            </label>
            <label class="emq-field">
              <span>Fișier CSV sau Excel</span>
              <input class="emq-input" type="file" name="import_file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required>
            </label>
          </div>
          <div class="emq-auth-actions" style="margin-top:12px">
            <a class="emq-btn-secondary" href="/dealeri-auto/template-stoc.csv">Template stoc auto</a>
          </div>
        </section>
        <button class="emq-btn" type="submit">Încarcă import</button>
      </form>

      <section class="emq-form-section">
        <h2>Istoric importuri</h2>
        <div class="emq-table-wrap">
          <table class="emq-table">
            <thead><tr><th>Dată</th><th>Profil</th><th>Categorie</th><th>Fișier</th><th>Create</th><th>Sărite</th><th>Status</th></tr></thead>
            <tbody>${importRows(imports)}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
  return layout({
    title: "Importuri - e-Marqet",
    description: "Importuri business e-Marqet.",
    canonicalPath: "/cont/importuri",
    body,
    user
  });
}

function verticalCard(vertical = {}) {
  const definition = categoryByVerticalRow(vertical);
  const visual = categoryVisual({ ...vertical, code: definition?.code || vertical.code });
  const code = vertical.code || definition?.code || "";
  return `
    <a class="emq-category-tile" href="#cautare-avansata" data-emq-home-category="${escapeHtml(code)}" style="--cat-bg:${escapeHtml(visual.bg)}">
      <div>
        <span class="emq-category-icon">${escapeHtml(visual.icon)}</span>
        <strong>${escapeHtml(vertical.name || definition?.name || vertical.code || "Categorie")}</strong>
      </div>
      <div>
        <span class="emq-muted">${escapeHtml(vertical.published_listings || 0)} anunțuri</span>
      </div>
    </a>
  `;
}

function searchForm({ verticals = [], filters = {} } = {}) {
  const activeCategory = categoryByCode(filters.vertical || "") || EMARQET_CATEGORY_DEFINITIONS[0];
  return `
    <form class="emq-search expanded" action="/anunturi" method="get" data-emq-category-form data-emq-advanced-search>
      <label class="emq-field wide">
        <span>Caută</span>
        <input class="emq-input" name="q" value="${escapeHtml(filters.q || "")}" placeholder="${escapeHtml(activeCategory?.searchPlaceholder || "cauta anunturi")}">
      </label>
      <label class="emq-field">
        <span>Categorie</span>
        <select class="emq-select" name="vertical" data-emq-category-select>${verticalOptions(verticals, filters.vertical)}</select>
      </label>
      <label class="emq-field">
        <span>Locație</span>
        <input class="emq-input" name="location" value="${escapeHtml(filters.location || "")}" placeholder="Oraș">
      </label>
      <label class="emq-field">
        <span>Preț min.</span>
        <input class="emq-input" name="price_min" value="${escapeHtml(filters.price_min || "")}" inputmode="decimal">
      </label>
      <label class="emq-field">
        <span>Preț max.</span>
        <input class="emq-input" name="price_max" value="${escapeHtml(filters.price_max || "")}" inputmode="decimal">
      </label>
      ${categoryFilterBlocks({ verticals, filters })}
      <button class="emq-btn submit" type="submit">Caută</button>
    </form>
  `;
}

function renderEmarqetPublicHomePage(options = {}) {
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const services = Array.isArray(options.services) ? options.services : [];
  const stats = options.stats || {};
  const promotedListings = listings.filter((listing) => listing.is_promoted);
  const regularListings = listings.filter((listing) => !listing.is_promoted);
  const promotedAutoListings = promotedListings.filter((listing) => String(listing.vertical_code || "").toLowerCase() === "auto").slice(0, 8);
  const promotedOtherListings = promotedListings.filter((listing) => String(listing.vertical_code || "").toLowerCase() !== "auto").slice(0, 8);
  const fallbackFeaturedListings = promotedListings.length ? [] : listings.slice(0, 8);
  const categoryRows = categoriesWithRows(verticals);
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${homePromoBanners(stats)}

    <section class="emq-home-categories">
      <div class="emq-section-head">
        <div><h2>Categorii principale</h2></div>
        <div class="emq-actions">
          <a class="emq-btn-secondary" href="/masini-second-hand">Mașini second-hand</a>
          <a class="emq-btn-secondary" href="/anunturi">Vezi anunțuri</a>
        </div>
      </div>
      <div class="emq-category-strip">${categoryRows.map(verticalCard).join("")}</div>
    </section>

    <section class="emq-search-band collapsed" id="cautare-avansata" data-emq-home-search-band>
      ${searchForm({ verticals, filters: options.filters || {} })}
    </section>

    ${carVerticalPartnerBanner({ placement: "homepage_banner" })}
    ${featuredListingsRail(promotedAutoListings, {
      title: "Anunțuri auto promovate",
      description: "Mașini și vehicule promovate, afișate separat de restul categoriilor.",
      ctaHref: "/publica?vertical=auto",
      ctaLabel: "Publică anunț auto",
      ariaLabel: "Anunțuri auto promovate"
    })}
    ${featuredListingsRail(promotedOtherListings, {
      title: "Promovate din alte categorii",
      description: "Produse, servicii, imobiliare, mama și copilul și alte anunțuri promovate, fără să se amestece în zona auto.",
      ctaHref: "/publica",
      ctaLabel: "Publică anunț",
      ariaLabel: "Anunțuri promovate din alte categorii",
      compact: true
    })}
    ${featuredListingsRail(fallbackFeaturedListings, {
      title: "Anunțuri recomandate",
      description: "Anunțuri recente de pe e-Marqet, afișate până când există promovări active.",
      ctaHref: "/publica",
      ctaLabel: "Publică anunț",
      ariaLabel: "Anunțuri recomandate"
    })}

    ${serviceBanners(services)}
  `;
  return layout({
    title: "e-Marqet - marketplace pentru anunțuri și servicii",
    description: "Publică și găsește anunțuri comerciale în mai multe categorii, cu parteneri verificați și contact direct.",
    canonicalPath: "/",
    body,
    user: options.user
  });
}

function renderEmarqetPublicListingsPage(options = {}) {
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const filters = options.filters || {};
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-panel">
      <div class="emq-section-head" style="margin-top:0">
        <div><h1>Anunțuri</h1></div>
        <a class="emq-btn" href="/publica">Publică anunț</a>
      </div>
      ${searchForm({ verticals, filters })}
    </section>
    <section>
      <div class="emq-section-head">
        <div><h2>Rezultate</h2></div>
        <span class="emq-pill">${escapeHtml(listings.length)} anunțuri</span>
      </div>
      ${listingsGrid(listings)}
    </section>
  `;
  return layout({
    title: "Anunțuri e-Marqet",
    description: "Anunțuri comerciale publicate prin e-Marqet, cu parteneri verificați și contact direct.",
    canonicalPath: "/anunturi",
    body,
    user: options.user
  });
}

function renderEmarqetPublicVerticalPage(options = {}) {
  const vertical = options.vertical || {};
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const filters = options.filters || { vertical: vertical.code || "" };
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-panel">
      <div class="emq-section-head" style="margin-top:0">
        <div>
          <h1>${escapeHtml(vertical.name || "Vertical e-Marqet")}</h1>
          ${vertical.code === "auto" ? `<p class="emq-muted">Cauți un autoturism? Vezi pagina dedicată <a href="/masini-second-hand"><strong>mașinilor second-hand</strong></a>, organizată și pe mărci.</p>` : ""}
        </div>
        <a class="emq-btn" href="/publica">Publică anunț</a>
      </div>
      ${searchForm({ verticals, filters })}
    </section>
    ${vertical.code === "auto" ? carVerticalPartnerBanner({ placement: "auto_vertical_banner" }) : ""}
    <section>
      <div class="emq-section-head">
        <div><h2>Anunțuri</h2></div>
        <span class="emq-pill">${escapeHtml(listings.length)} publicate</span>
      </div>
      ${listingsGrid(listings)}
    </section>
  `;
  return layout({
    title: `${vertical.name || "Vertical"} - e-Marqet`,
    description: vertical.notes || "Categorie e-Marqet pentru anunțuri și servicii.",
    canonicalPath: verticalUrl(vertical),
    body,
    user: options.user
  });
}

function renderEmarqetSeoAutoPage(options = {}) {
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const brands = Array.isArray(options.brands) ? options.brands : [];
  const brand = options.brand || null;
  const brandName = brand?.name || "";
  const canonicalPath = brand ? `/masini-second-hand/${brand.slug}` : "/masini-second-hand";
  const heading = brand ? `Mașini ${brandName} second-hand` : "Mașini second-hand de vânzare";
  const title = brand
    ? `Mașini ${brandName} second-hand de vânzare | e-Marqet`
    : "Mașini second-hand de vânzare în România | e-Marqet";
  const description = brand
    ? `Descoperă anunțuri cu mașini ${brandName} second-hand publicate pe e-Marqet. Compară prețuri, dotări și datele oferite de vânzători.`
    : "Descoperă mașini second-hand de vânzare în România. Compară anunțuri auto, prețuri și informațiile publicate de vânzători pe e-Marqet.";
  const itemList = listings.slice(0, 100).map((listing, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: absolutePublicPath(listingUrl(listing)),
    name: listing.title || "Anunț auto"
  }));
  const faq = [
    {
      question: "Ce trebuie să verific înainte de cumpărarea unei mașini second-hand?",
      answer: "Verifică identitatea vânzătorului, actele, seria VIN, istoricul de service, kilometrajul, starea tehnică și eventualele daune. O inspecție realizată de un specialist independent este recomandată."
    },
    {
      question: "e-Marqet vinde sau garantează mașinile din anunțuri?",
      answer: "Nu. e-Marqet este o platformă de publicare și contact. Informațiile și tranzacția trebuie verificate direct de cumpărător și vânzător."
    },
    {
      question: "Cum compar anunțurile auto?",
      answer: "Compară prețul cu vehicule similare și urmărește anul, kilometrajul, motorizarea, transmisia, dotările, istoricul și costurile probabile de întreținere."
    }
  ];
  const body = `
    <nav class="emq-muted" aria-label="Fir de navigare" style="margin-bottom:16px">
      <a href="/">Acasă</a> · ${brand ? `<a href="/masini-second-hand">Mașini second-hand</a> · ${escapeHtml(brandName)}` : "Mașini second-hand"}
    </nav>
    <section class="emq-panel">
      <div class="emq-section-head" style="margin-top:0">
        <div>
          <span class="emq-pill">Anunțuri auto</span>
          <h1>${escapeHtml(heading)}</h1>
          <p class="emq-muted">${escapeHtml(description)}</p>
        </div>
        <a class="emq-btn" href="/publica?vertical=auto">Publică anunț auto</a>
      </div>
      <div class="emq-business-meta">
        <span class="emq-chip">${escapeHtml(listings.length)} anunțuri disponibile</span>
        <span class="emq-chip">contact direct cu vânzătorul</span>
        <span class="emq-chip">filtre și date tehnice</span>
      </div>
    </section>

    ${carVerticalPartnerBanner({ placement: brand ? "auto_brand_banner" : "auto_seo_banner" })}

    ${brands.length ? `<section>
      <div class="emq-section-head"><div><h2>Caută după marcă</h2></div></div>
      <div class="emq-business-meta">
        <a class="emq-chip" href="/masini-second-hand">Toate mărcile</a>
        ${brands.map((item) => `<a class="emq-chip" href="/masini-second-hand/${escapeHtml(item.slug)}">${escapeHtml(item.name)} (${escapeHtml(item.count)})</a>`).join("")}
      </div>
    </section>` : ""}

    <section>
      <div class="emq-section-head">
        <div><h2>${brand ? `Anunțuri ${escapeHtml(brandName)}` : "Anunțuri auto recente"}</h2></div>
        <span class="emq-pill">${escapeHtml(listings.length)} rezultate</span>
      </div>
      ${listingsGrid(listings)}
    </section>

    <section class="emq-business-grid" style="margin-top:32px">
      <article class="emq-business-card">
        <h2>Cum alegi o mașină rulată</h2>
        <p class="emq-muted">Stabilește bugetul total, inclusiv înmatriculare, asigurare și reparații. Compară vehicule cu an, motorizare și kilometraj apropiate, apoi verifică mașina într-un service independent.</p>
      </article>
      <article class="emq-business-card">
        <h2>Verificări înainte de plată</h2>
        <p class="emq-muted">Confirmă seria VIN în acte și pe vehicul, istoricul, dreptul de proprietate și identitatea vânzătorului. Nu trimite bani în avans înainte de verificări și de un document contractual clar.</p>
      </article>
    </section>

    <section class="emq-panel" style="margin-top:32px">
      <h2>Întrebări frecvente</h2>
      ${faq.map((item) => `<details><summary><strong>${escapeHtml(item.question)}</strong></summary><p class="emq-muted">${escapeHtml(item.answer)}</p></details>`).join("")}
    </section>
  `;
  return layout({
    title,
    description,
    canonicalPath,
    body,
    user: options.user,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: heading,
        description,
        url: absolutePublicPath(canonicalPath),
        mainEntity: { "@type": "ItemList", numberOfItems: listings.length, itemListElement: itemList }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Acasă", item: absolutePublicPath("/") },
          { "@type": "ListItem", position: 2, name: "Mașini second-hand", item: absolutePublicPath("/masini-second-hand") },
          ...(brand ? [{ "@type": "ListItem", position: 3, name: brandName, item: absolutePublicPath(canonicalPath) }] : [])
        ]
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    ]
  });
}

function renderEmarqetCarVerticalSeoPage(options = {}) {
  const canonicalPath = "/verificare-istoric-auto-carvertical";
  const title = "Verificare istoric auto carVertical | Reducere 20%";
  const description = "Verifică istoricul unei mașini după seria VIN prin carVertical. Folosește oferta e-Marqet și primești 20% reducere cu codul EMARQET20.";
  const faq = [
    {
      question: "Ce este seria VIN și unde o găsesc?",
      answer: "VIN-ul este seria unică de identificare a vehiculului, formată în mod obișnuit din 17 caractere. O poți găsi în documentele mașinii și în zonele marcate de producător pe vehicul."
    },
    {
      question: "Ce informații poate conține un raport de istoric auto?",
      answer: "În funcție de datele disponibile pentru vehicul, raportul poate include înregistrări despre kilometraj, daune, accidente, furt, înmatriculări, inspecții, utilizări anterioare sau fotografii istorice."
    },
    {
      question: "Care este diferența dintre decodarea VIN și raportul de istoric?",
      answer: "Decodarea VIN prezintă în principal datele de identificare și configurația vehiculului. Raportul de istoric caută evenimente înregistrate pe parcursul utilizării mașinii, în limita datelor disponibile."
    },
    {
      question: "Cum folosesc reducerea EMARQET20?",
      answer: "Pornește verificarea folosind butonul de pe această pagină. Linkul de partener e-Marqet transmite automat voucherul EMARQET20 pentru reducerea de 20%."
    },
    {
      question: "Raportul înlocuiește inspecția tehnică a mașinii?",
      answer: "Nu. Raportul este o etapă utilă de documentare, dar este recomandată și verificarea documentelor, identității vânzătorului și stării mașinii într-un service independent."
    }
  ];
  const body = `
    <nav class="emq-muted" aria-label="Fir de navigare" style="margin-bottom:16px">
      <a href="/">Acasă</a> · <a href="/masini-second-hand">Mașini second-hand</a> · Verificare istoric auto
    </nav>

    <section class="emq-detail">
      <article class="emq-panel">
        <span class="emq-pill">Parteneriat e-Marqet × carVertical</span>
        <h1>Verificare istoric auto carVertical după VIN</h1>
        <p class="emq-muted">Verifică informațiile disponibile despre trecutul unei mașini înainte de cumpărare. Introdu seria VIN, continuă pe carVertical și folosește reducerea oferită comunității e-Marqet.</p>
        <div class="emq-business-meta">
          <span class="emq-chip">verificare după VIN</span>
          <span class="emq-chip">raport istoric auto</span>
          <span class="emq-chip">20% reducere</span>
        </div>
        <p class="emq-affiliate-note" style="margin-top:16px">Transparență: acesta este un parteneriat afiliat. e-Marqet poate primi un comision pentru o achiziție eligibilă, fără cost suplimentar pentru tine.</p>
      </article>
      <aside class="emq-service-card carvertical">
        <div>
          <img class="emq-carvertical-logo" src="/assets/partners/carvertical-logo-blue.png" alt="carVertical">
          <h2>Introdu seria VIN</h2>
          <p class="emq-muted">VIN-ul trebuie să conțină 17 caractere. Literele I, O și Q nu sunt utilizate.</p>
        </div>
        ${options.err === "vin_invalid" ? `<div class="emq-public-alert danger">Verifică seria VIN. Trebuie să conțină exact 17 caractere valide.</div>` : ""}
        <form class="emq-service-form" method="post" action="/partener/carvertical" target="_blank">
          <input type="hidden" name="placement" value="seo_history_page">
          <label class="emq-field">
            <span>Seria de șasiu (VIN)</span>
            <input class="emq-input" name="vin" minlength="17" maxlength="17" pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}" required autocomplete="off" placeholder="Exemplu: WVWZZZ1JZXW000001">
          </label>
          <div class="emq-coupon-box">
            <span>Reducere 20%</span>
            <span class="emq-coupon-code">EMARQET20</span>
          </div>
          <button class="emq-btn" type="submit">Verifică istoricul pe carVertical</button>
          <span class="emq-affiliate-note">Vei continua pe site-ul carVertical, într-o filă nouă.</span>
        </form>
      </aside>
    </section>

    <section>
      <div class="emq-section-head"><div><h2>Ce poate indica raportul de istoric auto</h2></div></div>
      <div class="emq-business-grid">
        <article class="emq-business-card"><h3>Kilometraj</h3><p class="emq-muted">Citiri de kilometraj disponibile și posibile neconcordanțe între înregistrări.</p></article>
        <article class="emq-business-card"><h3>Daune și accidente</h3><p class="emq-muted">Evenimente, estimări sau imagini istorice, atunci când acestea există în sursele consultate.</p></article>
        <article class="emq-business-card"><h3>Furt și statut</h3><p class="emq-muted">Posibile raportări de furt, înmatriculări, inspecții sau utilizări comerciale anterioare.</p></article>
      </div>
      <p class="emq-affiliate-note" style="margin-top:12px">Conținutul raportului diferă în funcție de vehicul și de datele disponibile în țările și sursele consultate de furnizor.</p>
    </section>

    <section class="emq-panel">
      <h2>Cum verifici istoricul unei mașini</h2>
      <ol style="line-height:1.75;margin-bottom:0">
        <li>Solicită VIN-ul și compară seria din documente cu seria înscrisă pe vehicul.</li>
        <li>Introdu cele 17 caractere în formularul de mai sus.</li>
        <li>Continuă pe carVertical și verifică dacă reducerea <strong>EMARQET20</strong> este aplicată.</li>
        <li>Analizează raportul împreună cu actele și cu o inspecție tehnică independentă.</li>
      </ol>
    </section>

    <section class="emq-business-grid">
      <article class="emq-business-card">
        <h2>Decodare VIN sau raport complet?</h2>
        <p class="emq-muted">Decodarea VIN confirmă în principal identitatea și specificațiile de bază ale vehiculului. Pentru evenimente din exploatare este necesară verificarea istoricului disponibil.</p>
      </article>
      <article class="emq-business-card">
        <h2>Verifică și mașina fizic</h2>
        <p class="emq-muted">Un raport nu garantează starea actuală și nu înlocuiește verificarea tehnică, juridică sau confirmarea informațiilor direct cu vânzătorul.</p>
        <a class="emq-btn-secondary" href="/masini-second-hand">Vezi anunțuri auto</a>
      </article>
    </section>

    <section class="emq-panel">
      <h2>Întrebări frecvente despre verificarea istoricului auto</h2>
      ${faq.map((item) => `<details><summary><strong>${escapeHtml(item.question)}</strong></summary><p class="emq-muted">${escapeHtml(item.answer)}</p></details>`).join("")}
    </section>
  `;
  return layout({
    title,
    description,
    canonicalPath,
    body,
    user: options.user,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Verificare istoric auto carVertical după VIN",
        description,
        url: absolutePublicPath(canonicalPath),
        inLanguage: "ro-RO",
        isPartOf: { "@type": "WebSite", name: "e-Marqet", url: absolutePublicPath("/") },
        about: ["verificare istoric auto", "verificare VIN", "raport istoric auto"]
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Acasă", item: absolutePublicPath("/") },
          { "@type": "ListItem", position: 2, name: "Mașini second-hand", item: absolutePublicPath("/masini-second-hand") },
          { "@type": "ListItem", position: 3, name: "Verificare istoric auto", item: absolutePublicPath(canonicalPath) }
        ]
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    ]
  });
}

function publicPartnerCard(partner = {}) {
  const url = partnerPublicPath(partner);
  return `
    <article class="emq-business-card">
      <div class="emq-card-top">
        <span class="emq-pill">${escapeHtml(partnerTypeLabel(partner.partner_type))}</span>
        <span class="emq-pill">Verificat</span>
      </div>
      <div>
        <h3>${escapeHtml(partner.display_name || "Partener e-Marqet")}</h3>
        <span class="emq-muted">${escapeHtml([partner.city, partner.county].filter(Boolean).join(", ") || partner.legal_name || "")}</span>
      </div>
      <div class="emq-business-meta">
        <span class="emq-chip">${escapeHtml(partner.published_count || 0)} anunțuri</span>
        <span class="emq-chip">${escapeHtml(partner.selected_plan_code || "business")}</span>
      </div>
      <div class="emq-business-meta">
        <a class="emq-btn-secondary" href="${escapeHtml(url)}">Vezi pagina</a>
      </div>
    </article>
  `;
}

function renderEmarqetPartnersLandingPage(options = {}) {
  const partners = Array.isArray(options.partners) ? options.partners : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-detail">
      <article class="emq-panel">
        <span class="emq-pill">Parteneri e-Marqet</span>
        <h1>Vinde prin profil business</h1>
        <div class="emq-detail-meta">
          <span class="emq-pill">Dealer auto</span>
          <span class="emq-pill">Agenție imobiliară</span>
          <span class="emq-pill">Import CSV / XML / API</span>
        </div>
        <div class="emq-business-grid">
          <article class="emq-business-card">
            <h3>Cont business</h3>
            <span class="emq-muted">Partenerul are pagină publică, anunțuri grupate și importuri administrate din cont.</span>
          </article>
          <article class="emq-business-card">
            <h3>Aprobări rapide</h3>
            <span class="emq-muted">Anunțurile plătite se publică automat după confirmarea plății și verificarea tehnică.</span>
          </article>
        </div>
        <div class="emq-auth-actions">
          <a class="emq-btn" href="/cont/inregistrare?return_to=/cont/business">Creează cont business</a>
          <a class="emq-btn-secondary" href="/cont/login?return_to=/cont/business">Am deja cont</a>
        </div>
      </article>
      <aside class="emq-panel">
        <h2>Ce primește partenerul</h2>
        <div class="emq-business-meta">
          <span class="emq-chip">pagină publică</span>
          <span class="emq-chip">toate anunțurile într-un loc</span>
          <span class="emq-chip">importuri</span>
          <span class="emq-chip">lead-uri</span>
          <span class="emq-chip">facturare</span>
          <span class="emq-chip">promovare</span>
        </div>
      </aside>
    </section>

    <section>
      <div class="emq-section-head">
        <div><h2>Parteneri activi</h2></div>
        <span class="emq-pill">${escapeHtml(partners.length)} profiluri</span>
      </div>
      ${partners.length ? `<div class="emq-business-grid">${partners.map(publicPartnerCard).join("")}</div>` : `<div class="emq-empty">Profilurile business active vor apărea aici.</div>`}
    </section>
  `;
  return layout({
    title: "Parteneri e-Marqet",
    description: "Pagină pentru dealeri auto, agenții imobiliare și parteneri business e-Marqet.",
    canonicalPath: "/parteneri",
    body,
    user: options.user
  });
}

function renderEmarqetDealerLandingPage(options = {}) {
  const formAction = options.formAction || "/dealeri-auto";
  const templatePath = options.templatePath || "/dealeri-auto/template-stoc.csv";
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-detail">
      <article class="emq-panel">
        <span class="emq-pill">Dealer Fondator E-MARQET</span>
        <h1>Publicare gratuită pentru dealerii auto din perioada de lansare</h1>
        <p class="emq-muted">E-MARQET este platforma de anunțuri și parteneri business pentru vânzători verificați. Pentru primii dealeri auto pregătim contul, importul stocului și publicarea fără cost în lansare.</p>
        <div class="emq-detail-meta">
          <span class="emq-pill">Import gratuit stoc</span>
          <span class="emq-pill">Fără comision</span>
          <span class="emq-pill">Badge Dealer Fondator</span>
          <span class="emq-pill">Sincronizare posibilă</span>
        </div>
        <div class="emq-auth-actions">
          <a class="emq-btn" href="#dealer-fondator-form">Vreau să devin Dealer Fondator</a>
          <a class="emq-btn-secondary" href="#dealer-fondator-form">Solicită importul gratuit al stocului</a>
        </div>
      </article>
      <aside class="emq-panel">
        <img src="/brand/emarqet-logo.svg" alt="E-MARQET" style="width:min(260px,100%);height:auto;margin-bottom:18px">
        <h2>Ce primește dealerul</h2>
        <div class="emq-business-meta">
          <span class="emq-chip">cont gratuit</span>
          <span class="emq-chip">publicare gratuită</span>
          <span class="emq-chip">import CSV / XLSX / XML / JSON</span>
          <span class="emq-chip">API sau feed</span>
          <span class="emq-chip">promovare social media</span>
          <span class="emq-chip">CRM parteneri</span>
          <span class="emq-chip">Sameday / FAN Courier unde se aplică</span>
        </div>
      </aside>
    </section>

    <section class="emq-business-grid">
      <article class="emq-business-card">
        <h3>Nu introduceți manual mașinile</h3>
        <span class="emq-muted">Stocul poate fi preluat din CSV, XLSX, XML, JSON, API, feed sau manual asistat. Pentru site-uri existente verificăm metoda potrivită înainte de import.</span>
      </article>
      <article class="emq-business-card">
        <h3>Publicare fără comision</h3>
        <span class="emq-muted">În etapa de lansare nu percepem comision la vânzare. Scopul este să validăm primele conturi și primele anunțuri reale.</span>
      </article>
      <article class="emq-business-card">
        <h3>Integrare operațională</h3>
        <span class="emq-muted">Cererile intră în CRM, importurile au jurnal, iar anunțurile pot fi urmărite până la publicare și activare dealer.</span>
      </article>
    </section>

    <section class="emq-publish-shell" id="dealer-fondator-form">
      <div class="emq-publish-head">
        <h1>Solicitare Dealer Fondator</h1>
        <a class="emq-btn-secondary" href="${escapeHtml(templatePath)}">Descarcă template stoc</a>
      </div>
      <form method="post" action="${escapeHtml(formAction)}" class="emq-publish-form">
        <section class="emq-form-section">
          <h2>Date dealer</h2>
          <div class="emq-form-grid">
            <label class="emq-field">
              <span>Numele firmei</span>
              <input class="emq-input" name="company_name" required>
            </label>
            <label class="emq-field">
              <span>Numele persoanei</span>
              <input class="emq-input" name="person_name" required>
            </label>
            <label class="emq-field">
              <span>Telefon</span>
              <input class="emq-input" name="phone" required>
            </label>
            <label class="emq-field">
              <span>Email</span>
              <input class="emq-input" type="email" name="email" required>
            </label>
            <label class="emq-field">
              <span>Website</span>
              <input class="emq-input" name="website" placeholder="https://">
            </label>
            <label class="emq-field">
              <span>Număr aproximativ de mașini</span>
              <input class="emq-input" type="number" min="0" name="vehicle_count">
            </label>
            <label class="emq-field">
              <span>Modalitate preferată de import</span>
              <select class="emq-select" name="import_mode">
                <option value="csv_xlsx">CSV / Excel</option>
                <option value="xml">XML</option>
                <option value="json">JSON</option>
                <option value="api">API</option>
                <option value="feed">Feed</option>
                <option value="website">Preluare din website</option>
                <option value="manual_asistat">Manual asistat</option>
              </select>
            </label>
            <label class="emq-field wide">
              <span>Observații</span>
              <textarea class="emq-input" name="notes" rows="4"></textarea>
            </label>
            <label class="emq-field wide" style="display:flex;gap:10px;align-items:flex-start">
              <input type="checkbox" name="contact_consent" value="1" required style="margin-top:4px">
              <span>Sunt de acord să fiu contactat pentru configurarea contului, importului și publicării stocului în E-MARQET.</span>
            </label>
          </div>
        </section>
        <button class="emq-btn" type="submit">Vreau să devin Dealer Fondator</button>
      </form>
    </section>
  `;
  return layout({
    title: "Dealeri auto - Dealer Fondator E-MARQET",
    description: "Programul Dealer Fondator E-MARQET pentru dealeri auto: publicare gratuită, import gratuit de stoc și profil business.",
    canonicalPath: "/dealeri-auto",
    body,
    user: options.user
  });
}

function renderEmarqetPublicPartnerPage(options = {}) {
  const partner = options.partner || {};
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-detail">
      <article class="emq-panel">
        <span class="emq-pill">Partener verificat</span>
        <h1>${escapeHtml(partner.display_name || "Partener e-Marqet")}</h1>
        <div class="emq-detail-meta">
          <span class="emq-pill">${escapeHtml(partnerTypeLabel(partner.partner_type))}</span>
          <span class="emq-pill">${escapeHtml([partner.city, partner.county].filter(Boolean).join(", ") || "România")}</span>
          <span class="emq-pill">${escapeHtml(listings.length)} anunțuri active</span>
        </div>
        <p class="emq-muted">${escapeHtml(partner.legal_name || "")}${partner.cui ? ` · CUI ${escapeHtml(partner.cui)}` : ""}</p>
        <div class="emq-auth-actions">
          ${partner.website ? `<a class="emq-btn-secondary" href="${escapeHtml(partner.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ""}
          <a class="emq-btn" href="#anunturi-partener">Vezi anunțuri</a>
        </div>
      </article>
      <aside class="emq-panel">
        <h2>Profil</h2>
        <div class="emq-business-meta">
          <span class="emq-chip">verificat</span>
          <span class="emq-chip">${escapeHtml(partner.selected_plan_code || "business")}</span>
          <span class="emq-chip">${escapeHtml(partner.import_mode || "publicare manuală")}</span>
        </div>
      </aside>
    </section>

    <section id="anunturi-partener">
      <div class="emq-section-head">
        <div><h2>Anunțurile partenerului</h2></div>
        <span class="emq-pill">${escapeHtml(listings.length)} publicate</span>
      </div>
      ${listingsGrid(listings)}
    </section>
  `;
  return layout({
    title: `${partner.display_name || "Partener"} - e-Marqet`,
    description: `Anunțuri publicate de ${partner.display_name || "partener e-Marqet"}.`,
    canonicalPath: partnerPublicPath(partner) || "/parteneri",
    body,
    user: options.user
  });
}

function renderEmarqetPublicListingPage(options = {}) {
  const listing = options.listing || {};
  const services = Array.isArray(options.services) ? options.services : [];
  const badges = Array.isArray(options.badges) ? options.badges : [];
  const returnTo = listingUrl(listing);
  const category = categoryByCode(listing.vertical_code || "");
  const isAutoListing = category?.code === "auto";
  const images = listingImageUrls(listing);
  const image = images[0]
    ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(listing.title || "Anunț e-Marqet")}">`
    : `<span>${escapeHtml(category?.icon || "EM")}</span>`;
  const gallery = images.length > 1
    ? `<div class="emq-detail-gallery">${images.map((url, index) => `
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="Poza ${index + 1} pentru ${escapeHtml(listing.title || "anunț")}">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(`${listing.title || "Anunț"} - poza ${index + 1}`)}" loading="lazy">
        </a>
      `).join("")}</div>`
    : "";
  const summary = metadataSummary(listing, 10);
  const promoted = Boolean(listing.is_promoted);
  const description = publicDescriptionText(listing);
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-detail">
      <article class="emq-panel">
        <div class="emq-detail-media">${image}${promoted ? `<span class="emq-promo-badge">Promovat</span>` : ""}</div>
        ${gallery}
        <span class="emq-pill">${escapeHtml(listing.vertical_name || "e-Marqet")}</span>
        <h1>${escapeHtml(listing.title || "Anunț e-Marqet")}</h1>
        <div class="emq-detail-meta">
          <span class="emq-pill">${escapeHtml(listing.location || "Locație la cerere")}</span>
          <span class="emq-pill">${fmtAmount(listing.price_amount, listing.price_currency)}</span>
          <span class="emq-pill">${escapeHtml(listing.owner_name || "Publicat prin e-Marqet")}</span>
        </div>
        ${summary.length ? `<div class="emq-chip-row">${summary.map((item) => `<span class="emq-chip">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>`).join("")}</div>` : ""}
        ${trustBadges(badges)}
        ${listingDescriptionHtml(listing)}
        <p class="emq-muted">Cod anunț: ${escapeHtml(listing.listing_code || "-")} · Publicat: ${escapeHtml(dateValue(listing.published_at || listing.created_at) || "-")}</p>
      </article>
      <aside class="emq-panel">
        ${partnerListingBox(listing)}
        <h2>Contact</h2>
        <form method="post" action="/contact" class="emq-form-grid">
          <input type="hidden" name="listing_id" value="${escapeHtml(listing.id || "")}">
          <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
          <label class="emq-field wide"><span>Nume</span><input class="emq-input" name="requester_name" required></label>
          <label class="emq-field"><span>Email</span><input class="emq-input" type="email" name="requester_email"></label>
          <label class="emq-field"><span>Telefon</span><input class="emq-input" name="requester_phone"></label>
          <label class="emq-field wide"><span>Mesaj</span><textarea class="emq-textarea" name="message" required>Vreau detalii despre acest anunț.</textarea></label>
          <button class="emq-btn wide" type="submit">Trimite mesaj</button>
        </form>
        ${isAutoListing ? carVerticalContactButton(listing) : ""}
      </aside>
    </section>
    ${servicesSection(services, listing)}
    ${isAutoListing ? carVerticalOfficialBanner() : ""}
  `;
  return layout({
    title: `${listing.title || "Anunț"} - e-Marqet`,
    description,
    canonicalPath: returnTo,
    body,
    user: options.user,
    socialImage: images[0] || "",
    headHtml: isAutoListing ? carVerticalAffiliateSdkHead() : ""
  });
}

function renderEmarqetPublicCheckoutPage(options = {}) {
  const listing = options.listing || {};
  const plan = options.plan || {};
  const token = options.token || "";
  const amount = Number(plan.monthly_price || 0);
  const billing = options.billingProfile || {};
  const billingErrors = Array.isArray(options.billingErrors) ? options.billingErrors : [];
  const billingFields = `
    <div class="emq-form-grid">
      <label class="emq-field wide">
        <span>Nume facturare</span>
        <input class="emq-input" name="billing_name" value="${escapeHtml(billing.billing_name || listing.owner_name || "")}" required autocomplete="name">
      </label>
      <label class="emq-field">
        <span>CUI / CNP</span>
        <input class="emq-input" name="billing_cui" value="${escapeHtml(billing.billing_cui || "")}" required inputmode="numeric" autocomplete="off">
      </label>
      <label class="emq-field">
        <span>Țară</span>
        <input class="emq-input" name="billing_country" value="${escapeHtml(billing.billing_country || "Romania")}" required autocomplete="country-name">
      </label>
      <label class="emq-field wide">
        <span>Adresă facturare</span>
        <input class="emq-input" name="billing_address" value="${escapeHtml(billing.billing_address || "")}" required autocomplete="street-address">
      </label>
      <label class="emq-field">
        <span>Localitate</span>
        <input class="emq-input" name="billing_city" value="${escapeHtml(billing.billing_city || listing.location || "")}" required autocomplete="address-level2">
      </label>
      <label class="emq-field">
        <span>Județ</span>
        <input class="emq-input" name="billing_county" value="${escapeHtml(billing.billing_county || "")}" required placeholder="Prahova sau RO-PH" autocomplete="address-level1">
      </label>
    </div>
  `;
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${billingErrors.length ? `<div class="emq-public-alert danger">${escapeHtml(options.billingErrorMessage || "Completează datele de facturare înainte de plată.")}</div>` : ""}
    <section class="emq-detail">
      <article class="emq-panel">
        <span class="emq-pill">${escapeHtml(listing.listing_code || "e-Marqet")}</span>
        <h1>Checkout</h1>
        <div class="emq-detail-meta">
          <span class="emq-pill">${escapeHtml(plan.name || listing.selected_plan_code || "Free")}</span>
          <span class="emq-pill">${fmtCatalogPrice(amount, plan.currency || "RON", amount > 0 ? "/lună" : "")}</span>
          <span class="emq-pill">${escapeHtml(listing.title || "Anunț e-Marqet")}</span>
        </div>
        <div class="emq-chip-row">
          <span class="emq-chip">${escapeHtml(listing.owner_name || "-")}</span>
          <span class="emq-chip">${escapeHtml(listing.owner_email || "-")}</span>
          <span class="emq-chip">${escapeHtml(listing.location || "-")}</span>
        </div>
      </article>
      <aside class="emq-panel">
        <h2>Plată</h2>
        <div class="emq-price-line">${fmtCatalogPrice(amount, plan.currency || "RON", amount > 0 ? "/lună" : "")}</div>
        <div class="emq-checkout-actions">
          ${options.simulateAvailable ? `
            <form method="post" action="/checkout/${encodeURIComponent(listing.listing_code || listing.id)}/simulate">
              <input type="hidden" name="token" value="${escapeHtml(token)}">
              <h3 style="margin:0">Date pentru factură</h3>
              ${billingFields}
              <button class="emq-btn" type="submit">Simulează plata</button>
            </form>
          ` : ""}
          ${options.stripeAvailable ? `
            <form method="post" action="/checkout/${encodeURIComponent(listing.listing_code || listing.id)}/stripe">
              <input type="hidden" name="token" value="${escapeHtml(token)}">
              <h3 style="margin:0">Date pentru factură</h3>
              ${billingFields}
              <button class="emq-btn" type="submit">Plătește cu cardul</button>
            </form>
          ` : ""}
          <a class="emq-btn-secondary" href="/publica">Înapoi</a>
        </div>
      </aside>
    </section>
  `;
  return layout({
    title: "Checkout - e-Marqet",
    description: "Checkout e-Marqet.",
    canonicalPath: `/checkout/${listing.listing_code || listing.id}`,
    body,
    user: options.user
  });
}

function renderEmarqetPublicPublishPage(options = {}) {
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const pricingPlans = Array.isArray(options.pricingPlans) ? options.pricingPlans : [];
  const partnerProfiles = Array.isArray(options.partnerProfiles) ? options.partnerProfiles : [];
  const form = options.form || {};
  const user = options.user || {};
  const errors = Array.isArray(options.errors) ? options.errors : [];
  const editMode = options.mode === "edit";
  const actionPath = options.actionPath || (editMode ? "/cont" : "/publica");
  const pageTitle = editMode ? "Editează anunț" : "Publică anunț";
  const submitLabel = editMode ? "Salvează modificările" : "Publică anunțul";
  const ownerName = form.owner_name ?? user.display_name ?? "";
  const ownerEmail = form.owner_email ?? user.email ?? "";
  const ownerPhone = form.owner_phone ?? user.phone ?? "";
  const existingImages = Array.isArray(form.existing_image_urls)
    ? form.existing_image_urls.filter(Boolean).slice(0, 12)
    : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${errors.length ? `<div class="emq-public-alert danger">${errors.map(escapeHtml).join("<br>")}</div>` : ""}
    <section class="emq-publish-shell">
      <div class="emq-publish-head">
        <h1>${escapeHtml(pageTitle)}</h1>
        <a class="emq-btn-secondary" href="/cont">Contul meu</a>
      </div>
      <form method="post" action="${escapeHtml(actionPath)}" class="emq-publish-form" enctype="multipart/form-data" data-emq-category-form>
        <div class="emq-public-alert danger" data-emq-form-error hidden></div>
        <section class="emq-form-section">
          <h2>Date anunț</h2>
          <div class="emq-form-grid">
            <label class="emq-field">
              <span>Categorie</span>
              <select class="emq-select" name="vertical_id" required data-emq-category-select>${verticalIdOptions(verticals, form.vertical_id)}</select>
            </label>
            <label class="emq-field">
              <span>Titlu</span>
              <input class="emq-input" name="title" value="${escapeHtml(form.title || "")}" required>
            </label>
            <div class="emq-category-suggestion wide" data-emq-category-suggestion hidden>
              <span data-emq-category-suggestion-text></span>
              <button type="button" data-emq-apply-category-suggestion>Folosește categoria sugerată</button>
            </div>
            <label class="emq-field">
              <span>Locație</span>
              <input class="emq-input" name="location" value="${escapeHtml(form.location || "")}">
            </label>
            <label class="emq-field">
              <span>Preț</span>
              <input class="emq-input" name="price_amount" value="${escapeHtml(form.price_amount || "")}" inputmode="decimal">
            </label>
            <label class="emq-field">
              <span>Monedă</span>
              <input class="emq-input" name="price_currency" value="${escapeHtml(form.price_currency || "RON")}">
            </label>
            <label class="emq-field">
              <span>Vânzător</span>
              <select class="emq-select" name="seller_type">${optionHtml(["Persoana fizica", "PFA", "Firma", "Dealer"], form.seller_type || "")}</select>
            </label>
            ${partnerProfiles.length ? `
              <label class="emq-field">
                <span>Profil business</span>
                <select class="emq-select" name="partner_profile_id">
                  <option value="">Fără profil business</option>
                  ${partnerProfileOptions(partnerProfiles, form.partner_profile_id)}
                </select>
              </label>
            ` : ""}
            ${publishFieldBlocks({ verticals, form })}
          </div>
        </section>

        <section class="emq-form-section">
          <h2>Imagini</h2>
          ${existingImages.length ? `
            <div class="emq-current-gallery" aria-label="Pozele actuale">
              ${existingImages.map((url) => `<img src="${escapeHtml(url)}" alt="Poză anunț" loading="lazy">`).join("")}
            </div>
          ` : ""}
          <div class="emq-upload-zone">
            <label class="emq-upload-button">
            ${editMode ? "Adaugă poze noi" : "Adaugă poze"}
            <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple data-emq-photo-input="#emq-photo-preview">
          </label>
          <p class="emq-muted" style="margin:8px 0 0">Maximum 10 poze, 20 MB per poză, 45 MB total.</p>
          <div class="emq-upload-preview" id="emq-photo-preview">
              <span>+</span><span>+</span><span>+</span><span>+</span><span>+</span><span>+</span>
            </div>
          </div>
          <div class="emq-form-grid" style="margin-top:12px">
            <label class="emq-field">
              <span>URL imagine</span>
              <input class="emq-input" name="primary_image_url" value="${escapeHtml(form.primary_image_url || "")}">
            </label>
            <label class="emq-field">
              <span>Galerie URL</span>
              <textarea class="emq-textarea" name="image_urls">${escapeHtml(form.image_urls || "")}</textarea>
            </label>
          </div>
        </section>

        <section class="emq-form-section">
          <h2>Descriere</h2>
          <label class="emq-field">
            <span>Descriere</span>
            <textarea class="emq-textarea" name="notes" required>${escapeHtml(form.notes || "")}</textarea>
          </label>
        </section>

        <section class="emq-form-section">
          <h2>Contact</h2>
          <div class="emq-form-grid">
            <label class="emq-field">
              <span>Nume</span>
              <input class="emq-input" name="owner_name" value="${escapeHtml(ownerName)}" required>
            </label>
            <label class="emq-field">
              <span>Email</span>
              <input class="emq-input" type="email" name="owner_email" value="${escapeHtml(ownerEmail)}" required>
            </label>
            <label class="emq-field">
              <span>Telefon</span>
              <input class="emq-input" name="owner_phone" value="${escapeHtml(ownerPhone)}">
            </label>
          </div>
        </section>

        ${editMode ? "" : `
          <section class="emq-form-section">
            <h2>Abonament</h2>
            <div class="emq-plan-grid">${planRadioOptions(pricingPlans, form.plan_code)}</div>
          </section>
        `}

        <button class="emq-btn" type="submit">${escapeHtml(submitLabel)}</button>
      </form>
    </section>
  `;
  return layout({
    title: `${pageTitle} - e-Marqet`,
    description: editMode ? "Actualizează anunțul din contul e-Marqet." : "Trimite un anunț spre verificare în e-Marqet.",
    canonicalPath: editMode ? actionPath.replace(/\/edit$/, "/edit") : "/publica",
    body,
    user
  });
}

function renderEmarqetPublicPricingPage(options = {}) {
  const pricingPlans = Array.isArray(options.pricingPlans) ? options.pricingPlans : [];
  const addons = Array.isArray(options.addons) ? options.addons : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="emq-panel">
      <div class="emq-section-head" style="margin-top:0">
        <div><h1>Prețuri</h1></div>
        <a class="emq-btn" href="/publica">Publică anunț</a>
      </div>
    </section>
    ${pricingSection({ pricingPlans, addons })}
  `;
  return layout({
    title: "Prețuri - e-Marqet",
    description: "Abonamente si servicii e-Marqet.",
    canonicalPath: "/preturi",
    body,
    user: options.user
  });
}

function promotionAddonCard(addon = {}, listing = {}, stripeAvailable = false) {
  const slug = listing.slug || listing.listing_code || listing.id;
  return `
    <article class="emq-addon-card">
      <div class="emq-card-top">
        <span class="emq-pill">${escapeHtml(addon.category || "promovare")}</span>
        <span class="emq-muted">${escapeHtml(addon.billing_unit || "campanie")}</span>
      </div>
      <b>${escapeHtml(addon.name || addon.code || "Promovare e-Marqet")}</b>
      <span class="emq-muted">${escapeHtml(addon.description || "Pachet de promovare pentru anunț.")}</span>
      <div class="emq-price" style="margin-top:10px">${fmtCatalogPrice(addon.price_amount, addon.currency)}</div>
      <form method="post" action="/cont/anunt/${encodeURIComponent(slug)}/promoveaza/${encodeURIComponent(addon.code || "")}/stripe" style="margin-top:12px">
        <button class="emq-btn" type="submit" ${stripeAvailable ? "" : "disabled"}>Alege și plătește</button>
      </form>
    </article>
  `;
}

function renderEmarqetPromotionPage(options = {}) {
  const listing = options.listing || {};
  const addons = Array.isArray(options.addons) ? options.addons : [];
  const stripeAvailable = Boolean(options.stripeAvailable);
  const slug = listing.slug || listing.listing_code || listing.id;
  const promotedUntil = listing.is_promoted
    ? `<span class="emq-promo-badge" style="position:static">Promovat${listing.promotion_until ? ` până la ${escapeHtml(dateValue(listing.promotion_until))}` : ""}</span>`
    : `<span class="emq-pill">Disponibil pentru promovare</span>`;
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${!stripeAvailable ? `<div class="emq-public-alert danger">Plata Stripe nu este activă momentan.</div>` : ""}
    <section class="emq-panel">
      <div class="emq-section-head" style="margin-top:0">
        <div>
          <span class="emq-pill">${escapeHtml(listing.listing_code || "e-Marqet")}</span>
          <h1>Promovează anunțul</h1>
          <p class="emq-muted">${escapeHtml(listing.title || "Anunț e-Marqet")}</p>
        </div>
        <div class="emq-actions">
          ${promotedUntil}
          <a class="emq-btn-secondary" href="/cont">Înapoi în cont</a>
        </div>
      </div>
      <div class="emq-chip-row">
        <span class="emq-chip">${escapeHtml(listing.vertical_name || "Categorie")}</span>
        <span class="emq-chip">${escapeHtml(listing.location || "Locație")}</span>
        <span class="emq-chip">${fmtAmount(listing.price_amount, listing.price_currency)}</span>
      </div>
    </section>
    <section>
      <div class="emq-section-head">
        <div><h2>Pachete disponibile</h2></div>
      </div>
      ${addons.length
        ? `<div class="emq-addon-grid compact">${addons.map((addon) => promotionAddonCard(addon, listing, stripeAvailable)).join("")}</div>`
        : `<div class="emq-empty">Nu există pachete de promovare active.</div>`}
    </section>
  `;
  return layout({
    title: "Promovează anunțul - e-Marqet",
    description: "Alege un pachet de promovare e-Marqet pentru anunț.",
    canonicalPath: `/cont/anunt/${slug}/promoveaza`,
    body,
    user: options.user
  });
}

function legalCards(sections = []) {
  return `<div class="emq-legal-grid">${sections.map((section) => `
    <article class="emq-legal-card">
      <h2>${escapeHtml(section.title || "")}</h2>
      ${section.items?.length ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${section.text ? `<p>${escapeHtml(section.text)}</p>` : ""}
    </article>
  `).join("")}</div>`;
}

function renderEmarqetInfoPage({ title, eyebrow, description, canonicalPath, sections, user }) {
  return layout({
    title: `${title} - e-Marqet`,
    description,
    canonicalPath,
    user,
    body: `
      <section class="emq-legal-shell">
        <article class="emq-panel emq-legal-hero">
          <span class="emq-pill">${escapeHtml(eyebrow || "e-Marqet")}</span>
          <h1>${escapeHtml(title)}</h1>
          <p class="emq-muted">${escapeHtml(description)}</p>
        </article>
        ${legalCards(sections)}
      </section>
    `
  });
}

function renderEmarqetLegalInfoPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "Despre e-Marqet",
    eyebrow: "Platformă",
    description: "e-Marqet este un marketplace pentru anunțuri, abonamente, parteneri și servicii integrate.",
    canonicalPath: "/despre",
    user: options.user,
    sections: [
      { title: "Marketplace", text: "Platforma permite publicarea de anunțuri pe categorii precum auto, imobiliare, servicii, produse, joburi și turism." },
      { title: "Administrare", text: "Aprobarea anunțurilor, cererile, plățile, facturile și partenerii sunt administrate centralizat de echipa e-Marqet." },
      { title: "Suport", text: `Pentru solicitări curente, suportul este disponibil la ${EMARQET_SUPPORT_EMAIL}.` }
    ]
  });
}

function renderEmarqetContactPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "Contact",
    eyebrow: "Suport",
    description: "Pentru conturi, plăți, anunțuri, parteneriate și raportări, folosește adresele oficiale e-Marqet.",
    canonicalPath: "/contact",
    user: options.user,
    sections: [
      { title: "Email office", text: EMARQET_OFFICE_EMAIL },
      { title: "Email suport", text: EMARQET_SUPPORT_EMAIL },
      { title: "Parteneriate", text: "Dealerii auto, agențiile imobiliare și comercianții pot solicita profil business și importuri în contul e-Marqet." },
      { title: "Plăți și facturi", text: "Solicitările legate de plăți, abonamente și facturi sunt preluate prin office sau suport, în funcție de situație." }
    ]
  });
}

function renderEmarqetTermsPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "Termeni și condiții",
    eyebrow: "Legal",
    description: "Regulile generale pentru folosirea platformei e-Marqet și pentru publicarea anunțurilor.",
    canonicalPath: "/termeni",
    user: options.user,
    sections: [
      { title: "Conturi", items: ["Datele de cont trebuie să fie reale.", "Un utilizator poate avea un singur cont activ pentru aceeași identitate.", "Conturile business pot intra în verificare înainte de activare."] },
      { title: "Anunțuri", items: ["Anunțurile Free se publică după verificarea tehnică automată a apariției în categorie.", "Anunțurile plătite se publică automat după confirmarea plății.", "Anunțurile incomplete, duplicate sau neconforme pot fi respinse.", "Utilizatorul răspunde pentru informațiile și imaginile încărcate."] },
      { title: "Plăți", items: ["Abonamentele și serviciile plătite sunt procesate prin Stripe.", "Factura se emite pe datele disponibile la plată.", "Publicarea poate fi amânată până la verificarea conținutului."] }
    ]
  });
}

function renderEmarqetPrivacyPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "Politica de confidențialitate",
    eyebrow: "Date personale",
    description: "Informații despre datele folosite pentru conturi, anunțuri, plăți, facturi și comunicare.",
    canonicalPath: "/confidentialitate",
    user: options.user,
    sections: [
      { title: "Date colectate", items: ["Nume, email și telefon pentru cont.", "Date de contact și localizare pentru anunț.", "Date de facturare și plată procesate prin furnizori autorizați."] },
      { title: "Scopuri", items: ["Administrarea contului și a anunțurilor.", "Procesarea plăților și emiterea facturilor.", "Prevenirea duplicatelor, fraudei și conținutului neconform."] },
      { title: "Păstrare", text: "Datele sunt păstrate atât timp cât contul, obligațiile comerciale sau obligațiile legale justifică păstrarea lor." }
    ]
  });
}

function renderEmarqetGdprPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "GDPR",
    eyebrow: "Drepturi",
    description: "Drepturile utilizatorilor privind datele personale folosite în e-Marqet.",
    canonicalPath: "/gdpr",
    user: options.user,
    sections: [
      { title: "Drepturi", items: ["Acces la date.", "Rectificare date incorecte.", "Ștergere sau restricționare, unde legea permite.", "Portabilitate și opoziție la anumite prelucrări."] },
      { title: "Cereri", text: `Cererile GDPR se trimit la ${EMARQET_SUPPORT_EMAIL} cu date suficiente pentru identificarea contului.` },
      { title: "Securitate", text: "Accesul la datele operaționale este limitat pe conturi și roluri interne." }
    ]
  });
}

function renderEmarqetCookiesPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "Politica de cookies",
    eyebrow: "Cookies",
    description: "Cookies și stocări locale folosite pentru sesiune, autentificare și funcționarea platformei.",
    canonicalPath: "/cookies",
    user: options.user,
    sections: [
      { title: "Esențiale", text: "Cookies esențiale mențin sesiunea utilizatorului, autentificarea și securitatea formularelor." },
      { title: "Plăți", text: "Stripe poate folosi propriile mecanisme de securitate și antifraudă în timpul checkout-ului." },
      { title: "Control", text: "Browserul permite ștergerea sau blocarea cookies, însă unele funcții ale contului pot să nu mai funcționeze corect." }
    ]
  });
}

function renderEmarqetSafetyPage(options = {}) {
  return renderEmarqetInfoPage({
    title: "Siguranță",
    eyebrow: "Încredere",
    description: "Reguli și recomandări pentru anunțuri, vânzători, cumpărători și parteneri.",
    canonicalPath: "/siguranta",
    user: options.user,
    sections: [
      { title: "Verificare", items: ["Publicarea este confirmată tehnic prin apariția anunțului în categoria publică.", "Profilurile business pot primi status activ după verificare.", "Anunțurile auto pot avea servicii suplimentare de istoric, VIN sau verificare."] },
      { title: "Comunicare", items: ["Evită transferurile fără documente.", "Verifică datele vânzătorului înainte de întâlnire.", "Raportează anunțurile suspecte la suport."] },
      { title: "Suport", text: `Raportările se trimit la ${EMARQET_SUPPORT_EMAIL}.` }
    ]
  });
}

function renderEmarqetPublicNotFoundPage(options = {}) {
  return layout({
    title: "Nu am găsit pagina - e-Marqet",
    description: "Pagina e-Marqet nu a fost găsită.",
    canonicalPath: "/",
    body: `
      <section class="emq-panel">
        <h1>Nu am găsit pagina.</h1>
        <p class="emq-muted">Anunțul poate fi încă în revizie sau verticala nu este activă.</p>
        <a class="emq-btn" href="/">Înapoi la e-Marqet</a>
      </section>
    `,
    user: options.user
  });
}

export {
  renderEmarqetAccountPage,
  renderEmarqetAuthPage,
  renderEmarqetBusinessPage,
  renderEmarqetCarVerticalSeoPage,
  renderEmarqetContactPage,
  renderEmarqetCookiesPage,
  renderEmarqetDealerLandingPage,
  renderEmarqetGdprPage,
  renderEmarqetImportPage,
  renderEmarqetLegalInfoPage,
  renderEmarqetMarketplacePublishPage,
  renderEmarqetPartnersLandingPage,
  renderEmarqetPrivacyPage,
  renderEmarqetPublicCheckoutPage,
  renderEmarqetPublicHomePage,
  renderEmarqetPublicListingPage,
  renderEmarqetPublicListingsPage,
  renderEmarqetPublicNotFoundPage,
  renderEmarqetPublicPartnerPage,
  renderEmarqetPublicPricingPage,
  renderEmarqetPublicPublishPage,
  renderEmarqetSeoAutoPage,
  renderEmarqetPublicVerticalPage,
  renderEmarqetPromotionPage,
  renderEmarqetReferralSharePage,
  renderEmarqetSafetyPage,
  renderEmarqetTermsPage
};
