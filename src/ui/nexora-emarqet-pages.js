import { renderNexoraShell } from "./nexora-shell.js";

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
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  return `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${escapeHtml(currency || "RON")}`;
}

function fmtInt(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("ro-RO") : "0";
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

function statusTone(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIV", "PUBLICAT", "CASTIGAT", "GENERAT", "FINALIZAT", "PLATIT", "PAID"].includes(normalized)) return "success";
  if (["TRIAL", "IN_REVIZIE", "CONTACTAT", "OFERTA", "PLANIFICAT", "DE_REVIZUIT", "NOU", "IN_LUCRU", "PENDING", "CHECKOUT_CREATED"].includes(normalized)) return "warn";
  if (["RESPINS", "PIERDUT", "ANULAT", "ESUAT"].includes(normalized)) return "danger";
  return "neutral";
}

function statusBadge(value = "") {
  const label = String(value || "-").toLowerCase().replaceAll("_", " ");
  return `<span class="emq-status ${statusTone(value)}">${escapeHtml(label)}</span>`;
}

function publicListingPath(row = {}) {
  return `https://e-marqet.com/anunt/${encodeURIComponent(row.slug || row.listing_code || row.id)}`;
}

function rowsOrEmpty(rows = [], colspan = 6, mapper = () => "", empty = "Nu există înregistrări.") {
  return rows.length
    ? rows.map(mapper).join("")
    : `<tr><td colspan="${escapeHtml(colspan)}"><div class="nx-empty-state">${escapeHtml(empty)}</div></td></tr>`;
}

const TABS = [
  ["Dashboard", "/nexora/e-marqet"],
  ["Listări", "/nexora/e-marqet/listings"],
  ["Parteneri", "/nexora/e-marqet/partners"],
  ["Lead-uri", "/nexora/e-marqet/leads"],
  ["Abonamente", "/nexora/e-marqet/subscriptions"],
  ["Servicii", "/nexora/e-marqet/services"],
  ["Social", "/nexora/e-marqet/social"],
  ["Integrări", "/nexora/e-marqet/integrations"],
  ["Verticale", "/nexora/e-marqet/verticals"],
  ["Setări", "/nexora/e-marqet/settings"]
];

const LISTING_STATUS_OPTIONS = [
  ["DRAFT", "Draft"],
  ["IN_REVIZIE", "În revizie"],
  ["PUBLICAT", "Publicat"],
  ["PAUZAT", "Pauzat"],
  ["RESPINS", "Respins"]
];

const LEAD_STATUS_OPTIONS = [
  ["NOU", "Nou"],
  ["CONTACTAT", "Contactat"],
  ["OFERTA", "Ofertă"],
  ["CASTIGAT", "Câștigat"],
  ["PIERDUT", "Pierdut"]
];

const SUBSCRIPTION_STATUS_OPTIONS = [
  ["TRIAL", "Trial"],
  ["ACTIV", "Activ"],
  ["PAUZAT", "Pauzat"],
  ["ANULAT", "Anulat"]
];

const VERTICAL_STATUS_OPTIONS = [
  ["ACTIV", "Activ"],
  ["PLANIFICAT", "Planificat"],
  ["PAUZAT", "Pauzat"]
];

const SERVICE_REQUEST_STATUS_OPTIONS = [
  ["NOU", "Nou"],
  ["IN_LUCRU", "În lucru"],
  ["FINALIZAT", "Finalizat"],
  ["ESUAT", "Eșuat"],
  ["ANULAT", "Anulat"]
];

const PARTNER_STATUS_OPTIONS = [
  ["IN_REVIZIE", "În revizie"],
  ["ACTIV", "Activ"],
  ["PAUZAT", "Pauzat"],
  ["RESPINS", "Respins"]
];

function emarqetStyles() {
  return `
    <style>
      .emq-shell {
        --emq-blue: #0284c7;
        --emq-blue-soft: #e0f2fe;
        --emq-blue-line: #bae6fd;
        --emq-ink: #0f172a;
        --emq-muted: #64748b;
      }

      .emq-shell .nx-content-card,
      .emq-shell .nx-kpi-card {
        border-color: #d6eefc;
        border-radius: 8px;
        box-shadow: 0 8px 22px rgba(2, 132, 199, 0.08);
      }

      .emq-shell .nx-module-tabs a {
        border-color: #cfe9fb;
        border-radius: 8px;
        background: #ffffff;
      }

      .emq-shell .nx-module-tabs a.active {
        background: var(--emq-blue);
        border-color: var(--emq-blue);
        color: #ffffff;
      }

      .emq-hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 16px;
        border: 1px solid var(--emq-blue-line);
        border-radius: 8px;
        background: #f8fcff;
        margin-bottom: 14px;
      }

      .emq-hero-main {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }

      .emq-logo {
        width: 180px;
        max-width: 42vw;
        height: 54px;
        object-fit: contain;
      }

      .emq-title-block h1 {
        margin: 0;
        color: var(--emq-ink);
        font-size: 24px;
        line-height: 1.15;
        letter-spacing: 0;
      }

      .emq-title-block p {
        margin: 5px 0 0;
        color: var(--emq-muted);
        font-size: 13px;
      }

      .emq-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .emq-shell .nx-btn.primary {
        background: var(--emq-blue);
        border-color: var(--emq-blue);
      }

      .emq-shell .nx-kpi-icon.blue {
        background: var(--emq-blue-soft);
        color: #0369a1;
      }

      .emq-status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid #dbeafe;
        background: #f8fafc;
        color: #334155;
        white-space: nowrap;
      }

      .emq-status.success {
        border-color: #bbf7d0;
        background: #f0fdf4;
        color: #166534;
      }

      .emq-status.warn {
        border-color: #fde68a;
        background: #fffbeb;
        color: #92400e;
      }

      .emq-status.danger {
        border-color: #fecaca;
        background: #fff1f2;
        color: #991b1b;
      }

      .emq-chip-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .emq-chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        border: 1px solid #cfe9fb;
        border-radius: 999px;
        background: #ffffff;
        color: #075985;
        font-weight: 800;
        font-size: 12px;
      }

      .emq-link-list {
        display: grid;
        gap: 8px;
      }

      .emq-link-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 44px;
        padding: 8px 10px;
        border: 1px solid #e0f2fe;
        border-radius: 8px;
        background: #ffffff;
        color: #0f172a;
        text-decoration: none;
      }

      .emq-link-row span:last-child {
        color: #0284c7;
        font-weight: 900;
      }

      .emq-roadmap {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .emq-roadmap-step {
        border: 1px solid #d6eefc;
        border-radius: 8px;
        padding: 12px;
        background: #ffffff;
      }

      .emq-roadmap-step b {
        display: block;
        margin-bottom: 6px;
        color: #0f172a;
      }

      .emq-roadmap-step span {
        color: #64748b;
        font-size: 13px;
        line-height: 1.35;
      }

      .emq-shell .nx-table-action-form {
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }

      .emq-shell .nx-table-action-form select {
        min-width: 120px;
      }

      .emq-copy-box {
        width: 100%;
        min-width: 260px;
        min-height: 118px;
        resize: vertical;
        border: 1px solid #d6eefc;
        border-radius: 8px;
        padding: 10px;
        color: #0f172a;
        background: #ffffff;
        font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }

      .emq-manual-share-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
      }

      .emq-manual-share-card {
        border: 1px solid #d6eefc;
        border-radius: 8px;
        background: #ffffff;
        padding: 12px;
        display: grid;
        gap: 10px;
      }

      .emq-manual-share-card h2 {
        margin: 0;
        font-size: 16px;
      }

      .emq-manual-share-card .emq-copy-box {
        min-width: 0;
        min-height: 170px;
      }

      .emq-copy-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .emq-manual-share-meter {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border: 1px solid #d6eefc;
        border-radius: 8px;
        background: #f8fdff;
        padding: 8px 10px;
      }

      .emq-share-count {
        color: #075985;
        font-weight: 900;
      }

      .emq-posted-groups {
        color: #475569;
        font-size: 12px;
        line-height: 1.45;
      }

      .emq-group-import-form {
        display: grid;
        gap: 10px;
      }

      .emq-group-import-form textarea {
        min-height: 112px;
      }

      .emq-suggested-groups {
        border: 1px solid #d6eefc;
        border-radius: 8px;
        background: #f8fdff;
        padding: 10px;
        display: grid;
        gap: 8px;
      }

      .emq-suggested-groups b {
        font-size: 13px;
        color: #0f172a;
      }

      .emq-suggested-group-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
      }

      .emq-suggested-group-row span {
        min-width: 0;
        color: #334155;
        font-size: 12px;
        line-height: 1.35;
      }

      .emq-manual-share-form {
        display: grid;
        grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr);
        gap: 8px;
        align-items: end;
      }

      .emq-manual-share-form .wide {
        grid-column: 1 / -1;
      }

      .emq-copy-toast {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 40;
        max-width: 280px;
        border: 1px solid #bae6fd;
        border-radius: 8px;
        background: #f0f9ff;
        color: #075985;
        box-shadow: 0 16px 34px rgba(2, 132, 199, 0.18);
        padding: 10px 12px;
        font-weight: 800;
      }

      .emq-social-target-form {
        display: grid;
        grid-template-columns: repeat(6, minmax(120px, 1fr));
        gap: 8px;
        align-items: end;
      }

      .emq-social-target-form .wide {
        grid-column: span 2;
      }

      .emq-social-card-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      @media (max-width: 980px) {
        .emq-hero,
        .emq-hero-main {
          align-items: flex-start;
          flex-direction: column;
        }

        .emq-actions {
          justify-content: flex-start;
        }

        .emq-roadmap {
          grid-template-columns: 1fr;
        }

        .emq-social-card-grid,
        .emq-social-target-form {
          grid-template-columns: 1fr;
        }

        .emq-manual-share-form {
          grid-template-columns: 1fr;
        }

        .emq-suggested-group-row {
          grid-template-columns: 1fr;
        }

        .emq-social-target-form .wide {
          grid-column: auto;
        }
      }
    </style>
  `;
}

function tabs(activePath = "/nexora/e-marqet") {
  return `<nav class="nx-module-tabs">${TABS.map(([label, href]) => `
    <a class="${activePath === href ? "active" : ""}" href="${href}">${escapeHtml(label)}</a>
  `).join("")}</nav>`;
}

function shell({ title, activePath, companyName, user, body }) {
  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    user,
    currentPath: activePath,
    eyebrow: "e-Marqet",
    pageTitle: title,
    body: `<div class="emq-shell">${emarqetStyles()}${tabs(activePath)}${body}${emarqetScripts()}</div>`
  });
}

function alertHtml(ok = "", err = "") {
  const okMessages = {
    created: "Înregistrarea a fost creată.",
    saved: "Modificarea a fost salvată.",
    status: "Statusul a fost actualizat.",
    social_account: "Contul social a fost salvat.",
    social_target: "Targetul social a fost salvat.",
    social_generated: "Pachetul de postări a fost generat.",
    social_generated_empty: "Nu s-au creat postări noi. Verifică listările publicate sau targeturile deja existente.",
    social_post: "Postarea a fost actualizată.",
    social_queued: "Postarea a fost pusă în flux.",
    social_manual_share: "Grupul a fost salvat pentru postarea manuală.",
    social_groups_imported: "Lista de grupuri a fost importată.",
    social_manual_published: "Postarea manuală a fost marcată ca publicată.",
    social_processed: "Coada socială a fost procesată.",
    social_processed_with_errors: "Coada socială a fost procesată, dar există erori de verificat.",
    integration_status: "Statusul integrării a fost salvat.",
    integration_config: "Configurarea integrării a fost salvată.",
    integration_credentials: "Credentialele au fost salvate criptat.",
    integration_test: "Testul integrării a fost rulat.",
    integration_report: "Raportul integrării a fost generat.",
    api_key_created: "Cheia API a fost creată. Copiaz-o acum, nu va mai fi afișată.",
    api_key_revoked: "Cheia API a fost revocată."
  };
  const errMessages = {
    required: "Completează câmpurile obligatorii.",
    invalid: "Datele trimise nu sunt valide.",
    group_required: "Completează numele grupului sau alege un grup salvat.",
    manual_duplicate: "Postarea este deja marcată în acel grup.",
    manual_limit: "Limita de 9 grupuri pentru această postare a fost atinsă.",
    missing: "Înregistrarea nu a fost găsită.",
    duplicate: "Codul există deja pentru acest workspace.",
    publish_failed: "Publicarea nu a putut fi procesată.",
    integration_failed: "Integrarea nu a putut fi actualizată.",
    api_key_failed: "Cheia API nu a putut fi creată."
  };
  return [
    ok ? `<div class="nx-alert success">${escapeHtml(okMessages[ok] || "Operațiunea a fost finalizată.")}</div>` : "",
    err ? `<div class="nx-alert danger">${escapeHtml(errMessages[err] || "Operațiunea nu a putut fi finalizată.")}</div>` : ""
  ].join("");
}

function emarqetScripts() {
  return `
    <script>
      (() => {
        const showToast = (message) => {
          const previous = document.querySelector("[data-emq-copy-toast]");
          if (previous) previous.remove();
          const toast = document.createElement("div");
          toast.className = "emq-copy-toast";
          toast.dataset.emqCopyToast = "1";
          toast.textContent = message;
          document.body.appendChild(toast);
          window.setTimeout(() => toast.remove(), 2200);
        };
        const fallbackCopy = (text) => {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        };
        document.addEventListener("click", async (event) => {
          const button = event.target.closest("[data-emq-copy-target]");
          if (!button) return;
          const target = document.getElementById(button.dataset.emqCopyTarget || "");
          const text = target ? target.value || target.textContent || "" : "";
          if (!text.trim()) return;
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(text);
            } else {
              fallbackCopy(text);
            }
            showToast("Text copiat. Îl poți lipi în grup.");
          } catch {
            fallbackCopy(text);
            showToast("Text copiat. Îl poți lipi în grup.");
          }
        });
      })();
    </script>
  `;
}

function heroHtml() {
  return `
    <section class="emq-hero">
      <div class="emq-hero-main">
        <img class="emq-logo" src="/brand/emarqet-logo.svg" alt="e-Marqet">
        <div class="emq-title-block">
          <h1>e-Marqet</h1>
          <p>Publici ușor. Gestionezi centralizat. Plătești transparent.</p>
        </div>
      </div>
      <div class="emq-actions">
        <a class="nx-btn" href="https://e-marqet.com/" target="_blank" rel="noopener">Platformă publică</a>
        <a class="nx-btn primary" href="/nexora/e-marqet/listings">Listare nouă</a>
        <a class="nx-btn" href="/nexora/e-marqet/partners">Parteneri</a>
        <a class="nx-btn" href="/nexora/e-marqet/leads">Lead nou</a>
        <a class="nx-btn" href="/nexora/e-marqet/subscriptions">Abonament</a>
        <a class="nx-btn" href="/nexora/e-marqet/services">Servicii</a>
      </div>
    </section>
  `;
}

function kpiCard(label, value, icon, tone = "blue") {
  return `
    <div class="nx-kpi-card">
      <div class="nx-kpi-icon ${escapeHtml(tone)}">${escapeHtml(icon)}</div>
      <div>
        <div class="nx-kpi-label">${escapeHtml(label)}</div>
        <div class="nx-kpi-value">${escapeHtml(value ?? 0)}</div>
      </div>
    </div>
  `;
}

function optionList(options = [], selectedValue = "") {
  return options.map(([value, label]) => `
    <option value="${escapeHtml(value)}" ${String(selectedValue) === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function selected(value = "", expected = "") {
  return String(value || "") === String(expected || "") ? "selected" : "";
}

function checked(value = false) {
  return value ? "checked" : "";
}

function shortText(value = "", max = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

function verticalOptions(verticals = [], selectedId = "") {
  return verticals.map((vertical) => `
    <option value="${escapeHtml(vertical.id)}" ${String(selectedId) === String(vertical.id) ? "selected" : ""}>${escapeHtml(vertical.name || "-")}</option>
  `).join("");
}

function listingOptions(listings = [], selectedId = "") {
  return [
    `<option value="">Fără listare</option>`,
    ...listings.map((listing) => `
      <option value="${escapeHtml(listing.id)}" ${String(selectedId) === String(listing.id) ? "selected" : ""}>
        ${escapeHtml(listing.listing_code || "-")} · ${escapeHtml(listing.title || "-")}
      </option>
    `)
  ].join("");
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
  if (limit === 0) return "-";
  return `${limit.toLocaleString("ro-RO")} anunțuri`;
}

function planTypeLabel(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "dedicated") return "Pachet dedicat";
  if (normalized === "founding") return "Founding Member";
  return "Abonament";
}

function planPriceHtml(row = {}) {
  const yearly = Number(row.yearly_price || 0);
  return [
    `<b>${fmtCatalogPrice(row.monthly_price, row.currency, "/lună")}</b>`,
    yearly > 0 ? `<div class="nx-table-sub">sau ${fmtCatalogPrice(yearly, row.currency, "/an")}</div>` : ""
  ].join("");
}

function featureSummary(row = {}, maxItems = 5) {
  const features = parseFeatureList(row.features_json);
  if (!features.length) return "-";
  const visible = features.slice(0, maxItems).join(" · ");
  return `${escapeHtml(visible)}${features.length > maxItems ? " · ..." : ""}`;
}

function pricingPlanRows(rows = []) {
  return rowsOrEmpty(rows, 6, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.code || "")}</div></td>
      <td>${escapeHtml(planTypeLabel(row.plan_type))}<div class="nx-table-sub">${escapeHtml(row.audience || "-")}</div></td>
      <td>${planPriceHtml(row)}</td>
      <td>${escapeHtml(limitLabel(row.listing_limit))}<div class="nx-table-sub">${escapeHtml(row.active_days || 0)} zile active</div></td>
      <td>${row.promotion_included ? statusBadge("ACTIV") : statusBadge("PAUZAT")}</td>
      <td>${featureSummary(row)}</td>
    </tr>
  `, "Nu există planuri în catalog.");
}

function addonRows(rows = []) {
  return rowsOrEmpty(rows, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.code || "")}</div></td>
      <td>${escapeHtml(row.category || "-")}</td>
      <td><b>${fmtCatalogPrice(row.price_amount, row.currency)}</b><div class="nx-table-sub">${escapeHtml(row.billing_unit || "")}</div></td>
      <td>${escapeHtml(row.included_in_plan || "-")}</td>
      <td>${escapeHtml(row.description || "-")}</td>
    </tr>
  `, "Nu există servicii suplimentare în catalog.");
}

function servicePriceLabel(row = {}) {
  if (row.price_amount === null || row.price_amount === undefined || row.price_amount === "") {
    if (row.pricing_model === "paid_or_affiliate") return "Plătit / afiliat";
    if (row.pricing_model === "commission") return "Comision";
    return "La cerere";
  }
  const amount = Number(row.price_amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    if (String(row.pricing_model || "").includes("commission")) return "Comision";
    if (String(row.pricing_model || "").includes("lead")) return "Lead gratuit";
    return "Gratuit";
  }
  return fmtCatalogPrice(amount, row.currency);
}

function serviceOptions(services = [], selected = "") {
  return services.map((service) => `
    <option value="${escapeHtml(service.code)}" ${String(selected) === String(service.code) ? "selected" : ""}>
      ${escapeHtml(service.name || service.code)} · ${escapeHtml(servicePriceLabel(service))}
    </option>
  `).join("");
}

function serviceRows(rows = []) {
  return rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.code || "")}</div></td>
      <td>${escapeHtml(row.vertical_code || "-")}<div class="nx-table-sub">${escapeHtml(row.category || "")}</div></td>
      <td>${escapeHtml(row.provider_key || "-")}<div class="nx-table-sub">${escapeHtml(row.fulfillment_type || "")}</div></td>
      <td><b>${escapeHtml(servicePriceLabel(row))}</b><div class="nx-table-sub">${escapeHtml(row.included_in_plan || "")}</div></td>
      <td>${row.requires_partner ? statusBadge("PLANIFICAT") : statusBadge("ACTIV")}</td>
      <td>${escapeHtml(row.cta_label || "-")}</td>
      <td>${escapeHtml(row.badge_label || "-")}</td>
      <td>${escapeHtml(row.description || "-")}</td>
    </tr>
  `, "Nu există servicii integrate în catalog.");
}

function requestRows(rows = []) {
  return rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.service_name || row.service_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.provider_key || "")}</div></td>
      <td>${escapeHtml(row.listing_title || "-")}<div class="nx-table-sub">${escapeHtml(row.listing_code || "")}</div></td>
      <td>${escapeHtml(row.requester_name || "-")}<div class="nx-table-sub">${escapeHtml(row.requester_email || "")}</div></td>
      <td>${escapeHtml(row.requester_phone || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${fmtAmount(row.amount, row.currency)}</td>
      <td>${row.requires_partner ? statusBadge("PLANIFICAT") : statusBadge("ACTIV")}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/services/requests/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(SERVICE_REQUEST_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există cereri de servicii integrate.");
}

const SOCIAL_ACCOUNT_STATUS_OPTIONS = [
  ["setup_required", "Setup required"],
  ["active", "Active"],
  ["paused", "Paused"]
];

const SOCIAL_TARGET_TYPE_OPTIONS = [
  ["page", "Pagină"],
  ["group", "Grup"],
  ["marketplace", "Marketplace"],
  ["profile", "Profil"]
];

const SOCIAL_JOIN_STATUS_OPTIONS = [
  ["de_verificat", "De verificat"],
  ["requested", "Cerere trimisă"],
  ["joined", "Membru"],
  ["rejected", "Respins"],
  ["left", "Ieșit"],
  ["not_applicable", "N/A"]
];

const SOCIAL_RULE_STATUS_OPTIONS = [
  ["de_verificat", "De verificat"],
  ["permis", "Permis"],
  ["interzis", "Interzis"],
  ["doar_recomandari", "Doar recomandări"],
  ["fara_linkuri", "Fără linkuri"]
];

const SOCIAL_POST_STATUS_OPTIONS = [
  ["draft", "Draft"],
  ["ready", "Ready"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["failed", "Failed"]
];

function socialTypeLabel(value = "") {
  const normalized = String(value || "");
  if (normalized === "page") return "Pagină";
  if (normalized === "group") return "Grup";
  if (normalized === "marketplace") return "Marketplace";
  if (normalized === "profile") return "Profil";
  return normalized || "-";
}

function boolBadge(value) {
  return Number(value || 0) ? statusBadge("ACTIV") : statusBadge("PAUZAT");
}

function socialAccountCards(accounts = []) {
  return accounts.map((account) => `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(account.account_name || "e-Marqet")}</h1>
          <p>${escapeHtml(account.account_handle || "-")} · ${statusBadge(account.status)}</p>
        </div>
      </div>
      <form method="post" action="/nexora/e-marqet/social/accounts" class="nx-form">
        <input type="hidden" name="id" value="${escapeHtml(account.id)}">
        <div class="nx-two-column-grid compact">
          <label class="nx-field"><span>Nume cont</span><input name="account_name" value="${escapeHtml(account.account_name || "")}"></label>
          <label class="nx-field"><span>URL / handle</span><input name="account_handle" value="${escapeHtml(account.account_handle || "")}"></label>
          <label class="nx-field"><span>Facebook Page ID</span><input name="page_id" value="${escapeHtml(account.page_id || account.external_id || "")}"></label>
          <label class="nx-field"><span>Status</span><select name="status">${optionList(SOCIAL_ACCOUNT_STATUS_OPTIONS, account.status)}</select></label>
          <label class="nx-field"><span>Mod publicare</span><select name="posting_mode">
            <option value="api" ${selected(account.posting_mode, "api")}>API oficial</option>
            <option value="draft" ${selected(account.posting_mode, "draft")}>Draft/manual</option>
          </select></label>
          <label class="nx-field"><span>Token expiră</span><input name="token_expires_at" value="${escapeHtml(account.token_expires_at || "")}" placeholder="YYYY-MM-DD"></label>
        </div>
        <label class="nx-field"><span>Page Access Token</span><input name="access_token" type="password" placeholder="${account.has_access_token ? "Token salvat. Lasă gol ca să îl păstrezi." : "Token pagină Facebook"}"></label>
        <label class="nx-field"><span>Scopes</span><input name="scopes" value="${escapeHtml(account.scopes || "")}" placeholder="pages_show_list,pages_read_engagement,pages_manage_posts"></label>
        <label class="nx-field"><span><input type="checkbox" name="auto_publish" value="1" ${checked(Number(account.auto_publish || 0) === 1)}> Auto queue pentru pagina Facebook</span></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează cont</button></div>
      </form>
    </section>
  `).join("");
}

function socialTargetRows(rows = []) {
  return rowsOrEmpty(rows, 12, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.url || "")}</div></td>
      <td>${escapeHtml(socialTypeLabel(row.target_type))}<div class="nx-table-sub">${escapeHtml(row.category || "")}</div></td>
      <td>${escapeHtml(row.location || "-")}<div class="nx-table-sub">${escapeHtml(row.language || "ro")}</div></td>
      <td>${Number(row.members_count || 0).toLocaleString("ro-RO")}</td>
      <td>${statusBadge(row.join_status)}</td>
      <td>${statusBadge(row.rules_status)}</td>
      <td>${boolBadge(row.promotion_allowed)}</td>
      <td>${escapeHtml(row.frequency_limit_per_week || 1)}/săpt.</td>
      <td>${escapeHtml(dateValue(row.last_post_at) || "-")}</td>
      <td>${escapeHtml(row.notes || "-")}</td>
      <td>${row.url ? `<a class="nx-btn" href="${escapeHtml(row.url)}" target="_blank" rel="noopener">Deschide</a>` : `<span class="nx-muted">-</span>`}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/social/targets/${escapeHtml(row.id)}" class="nx-table-action-form">
          <input type="hidden" name="name" value="${escapeHtml(row.name || "")}">
          <input type="hidden" name="url" value="${escapeHtml(row.url || "")}">
          <input type="hidden" name="target_type" value="${escapeHtml(row.target_type || "group")}">
          <input type="hidden" name="category" value="${escapeHtml(row.category || "")}">
          <input type="hidden" name="language" value="${escapeHtml(row.language || "ro")}">
          <input type="hidden" name="location" value="${escapeHtml(row.location || "")}">
          <input type="hidden" name="members_count" value="${escapeHtml(row.members_count || 0)}">
          <input type="hidden" name="frequency_limit_per_week" value="${escapeHtml(row.frequency_limit_per_week || 1)}">
          <input type="hidden" name="last_post_at" value="${escapeHtml(dateValue(row.last_post_at) || "")}">
          <input type="hidden" name="notes" value="${escapeHtml(row.notes || "")}">
          <select name="join_status">${optionList(SOCIAL_JOIN_STATUS_OPTIONS, row.join_status)}</select>
          <select name="rules_status">${optionList(SOCIAL_RULE_STATUS_OPTIONS, row.rules_status)}</select>
          <label><input type="checkbox" name="promotion_allowed" value="1" ${checked(Number(row.promotion_allowed || 0) === 1)}> permis</label>
          <button class="nx-btn" type="submit">Salvează</button>
        </form>
      </td>
    </tr>
  `, "Nu există targeturi sociale.");
}

function manualShareTitle(row = {}, index = 0) {
  const caption = String(row.caption || "").trim();
  if (/publica rapid anuntul/i.test(caption)) return "Publicare anunț";
  if (/cauti o masina|anunturile active/i.test(caption)) return "Căutare anunțuri";
  if (/marketplace simplu|mai multe categorii/i.test(caption)) return "Categorii e-Marqet";
  return row.target_name || `Postare manuală ${index + 1}`;
}

function manualShareText(row = {}) {
  return [row.caption, row.hashtags].map((item) => String(item || "").trim()).filter(Boolean).join("\n\n");
}

function manualGroupOptions(groups = []) {
  return [
    `<option value="">Alege grup salvat</option>`,
    ...groups.map((group) => `
      <option value="${escapeHtml(group.id)}">${escapeHtml(group.name || "Grup Facebook")}${group.last_post_at ? ` · postat ${escapeHtml(dateValue(group.last_post_at))}` : ""}</option>
    `)
  ].join("");
}

function manualShareSuggestionRows(row = {}, suggestions = [], limitReached = false) {
  if (limitReached) {
    return `<div class="emq-suggested-groups"><b>Limita de 9 grupuri este atinsă.</b></div>`;
  }
  if (!suggestions.length) {
    return `<div class="emq-suggested-groups"><b>Următoarele grupuri nefolosite</b><span class="nx-table-sub">Importă grupurile tale o singură dată ca să primești sugestii aici.</span></div>`;
  }
  return `
    <div class="emq-suggested-groups">
      <b>Următoarele grupuri nefolosite</b>
      ${suggestions.map((group) => `
        <form method="post" action="/nexora/e-marqet/social/posts/${escapeHtml(row.id)}/manual-share" class="emq-suggested-group-row">
          <input type="hidden" name="social_target_id" value="${escapeHtml(group.id)}">
          <span>${escapeHtml(group.name || "Grup Facebook")}${group.last_post_at ? `<br><small>Ultima postare: ${escapeHtml(dateValue(group.last_post_at))}</small>` : ""}</span>
          ${group.url ? `<a class="nx-btn" href="${escapeHtml(group.url)}" target="_blank" rel="noopener">Deschide</a>` : `<span></span>`}
          <button class="nx-btn" type="submit">Marchează postat</button>
        </form>
      `).join("")}
    </div>
  `;
}

function socialManualShareCards(rows = [], groups = [], suggestionsByPost = {}) {
  if (!rows.length) {
    return `<div class="nx-empty-state">Nu există postări manuale pregătite pentru grupuri.</div>`;
  }
  return `<div class="emq-manual-share-grid">${rows.map((row, index) => {
    const copyId = `emq-manual-share-${escapeHtml(row.id || index)}`;
    const text = manualShareText(row);
    const facebookGroupsUrl = row.target_url || "https://www.facebook.com/groups/feed/";
    const shareCount = Number(row.manual_share_count || 0);
    const shareLimit = 9;
    const limitReached = shareCount >= shareLimit;
    const suggestions = suggestionsByPost?.[row.id] || [];
    return `
      <article class="emq-manual-share-card">
        <div>
          <h2>${escapeHtml(manualShareTitle(row, index))}</h2>
          <div class="nx-table-sub">${escapeHtml(socialTypeLabel(row.target_type))} · ${statusBadge(row.status)}${row.publish_status ? ` · ${statusBadge(row.publish_status)}` : ""}</div>
        </div>
        <div class="emq-manual-share-meter">
          <span>Distribuire în grupuri</span>
          <span class="emq-share-count">${escapeHtml(shareCount)} / ${escapeHtml(shareLimit)}</span>
        </div>
        ${row.manual_share_targets ? `<div class="emq-posted-groups"><b>Deja postat:</b> ${escapeHtml(row.manual_share_targets)}</div>` : `<div class="emq-posted-groups">Încă nu ai marcat niciun grup pentru această postare.</div>`}
        <textarea id="${copyId}" class="emq-copy-box" readonly>${escapeHtml(text)}</textarea>
        <div class="emq-copy-actions">
          <button class="nx-btn primary" type="button" data-emq-copy-target="${copyId}">Copiază text</button>
          ${row.media_url ? `<a class="nx-btn" href="${escapeHtml(row.media_url)}" target="_blank" rel="noopener">Deschide imaginea</a>` : ""}
          <a class="nx-btn" href="${escapeHtml(facebookGroupsUrl)}" target="_blank" rel="noopener">Deschide grupuri</a>
        </div>
        ${manualShareSuggestionRows(row, suggestions, limitReached)}
        <form method="post" action="/nexora/e-marqet/social/posts/${escapeHtml(row.id)}/manual-share" class="emq-manual-share-form">
          <label class="nx-field wide"><span>Grup salvat</span><select name="social_target_id" ${limitReached ? "disabled" : ""}>${manualGroupOptions(groups)}</select></label>
          <label class="nx-field"><span>Sau grup nou</span><input name="group_name" placeholder="Nume grup Facebook" ${limitReached ? "disabled" : ""}></label>
          <label class="nx-field"><span>Link grup</span><input name="group_url" placeholder="https://www.facebook.com/groups/..." ${limitReached ? "disabled" : ""}></label>
          <label class="nx-field wide"><span>Note</span><input name="notes" placeholder="ex: postat azi, așteaptă aprobare" ${limitReached ? "disabled" : ""}></label>
          <div class="nx-form-actions wide">
            <button class="nx-btn" type="submit" ${limitReached ? "disabled" : ""}>Marchează postat în grup</button>
          </div>
        </form>
        ${row.publish_error ? `<div class="nx-table-sub">${escapeHtml(row.publish_error)}</div>` : ""}
      </article>
    `;
  }).join("")}</div>`;
}

function socialPostRows(rows = []) {
  return rowsOrEmpty(rows, 12, (row) => `
    <tr>
      <td>${escapeHtml(socialTypeLabel(row.target_type))}<div class="nx-table-sub">${escapeHtml(row.target_name || "-")}</div></td>
      <td>${escapeHtml(row.listing_code || "-")}<div class="nx-table-sub">${escapeHtml(row.vertical_name || "")}</div></td>
      <td>${escapeHtml(row.listing_title || "-")}<div class="nx-table-sub">${escapeHtml(row.listing_location || "")}</div></td>
      <td><textarea class="emq-copy-box" readonly>${escapeHtml([row.caption, row.hashtags].filter(Boolean).join("\n\n"))}</textarea></td>
      <td>${row.link_url ? `<a href="${escapeHtml(row.link_url)}" target="_blank" rel="noopener">${escapeHtml(row.link_url)}</a>` : "-"}</td>
      <td>${row.media_url ? `<a class="nx-btn" href="${escapeHtml(row.media_url)}" target="_blank" rel="noopener">Imagine</a>` : "-"}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.publish_status ? statusBadge(row.publish_status) : `<span class="nx-muted">-</span>`}<div class="nx-table-sub">${escapeHtml(row.publish_error || "")}</div></td>
      <td>${escapeHtml(dateValue(row.scheduled_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.published_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/social/posts/${escapeHtml(row.id)}/queue" class="nx-inline-form compact">
          <input type="datetime-local" name="scheduled_at">
          <button class="nx-btn primary" type="submit">${row.target_type === "page" ? "Pune în coadă" : "Pregătește manual"}</button>
        </form>
        ${row.target_url ? `<a class="nx-btn" href="${escapeHtml(row.target_url)}" target="_blank" rel="noopener">Target</a>` : ""}
      </td>
      <td>
        <form method="post" action="/nexora/e-marqet/social/posts/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(SOCIAL_POST_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există postări sociale generate.");
}

function socialJobRows(rows = []) {
  return rowsOrEmpty(rows, 10, (row) => `
    <tr>
      <td>${escapeHtml(socialTypeLabel(row.target_type))}</td>
      <td>${escapeHtml(row.target_name || row.account_name || "-")}<div class="nx-table-sub">${escapeHtml(row.target_url || row.account_handle || "")}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.scheduled_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.published_at) || "-")}</td>
      <td>${escapeHtml(row.external_post_id || "-")}</td>
      <td>${escapeHtml(shortText(row.error || "-", 180))}</td>
      <td>${row.target_url ? `<a class="nx-btn" href="${escapeHtml(row.target_url)}" target="_blank" rel="noopener">Deschide</a>` : `<span class="nx-muted">-</span>`}</td>
      <td>${row.media_url ? `<a class="nx-btn" href="${escapeHtml(row.media_url)}" target="_blank" rel="noopener">Imagine</a>` : "-"}</td>
      <td><textarea class="emq-copy-box" readonly>${escapeHtml(row.caption || "")}</textarea></td>
    </tr>
  `, "Nu există joburi sociale.");
}

function subscriptionPlanOptions(plans = [], selected = "start") {
  const fallback = [
    { code: "free", name: "Free", monthly_price: 0, currency: "RON", plan_type: "standard" },
    { code: "start", name: "Start", monthly_price: 29, currency: "RON", plan_type: "standard" },
    { code: "pro", name: "Pro", monthly_price: 79, currency: "RON", plan_type: "standard" },
    { code: "business", name: "Business", monthly_price: 199, currency: "RON", plan_type: "standard" },
    { code: "enterprise", name: "Enterprise", monthly_price: 499, currency: "RON", plan_type: "standard" }
  ];
  const rows = plans.length ? plans : fallback;
  return rows.map((plan) => `
    <option value="${escapeHtml(plan.code)}" ${String(selected) === String(plan.code) ? "selected" : ""}>
      ${escapeHtml(plan.name || plan.code)} · ${escapeHtml(planTypeLabel(plan.plan_type))} · ${fmtCatalogPrice(plan.monthly_price, plan.currency, "/lună")}
    </option>
  `).join("");
}

function paymentBadge(row = {}) {
  const status = String(row.stripe_checkout_status || "").toUpperCase();
  if (row.paid_at || status.startsWith("PAID")) return statusBadge("PLATIT");
  if (status === "CHECKOUT_CREATED") return statusBadge("CHECKOUT_CREATED");
  if (String(row.selected_plan_code || "free").toLowerCase() === "free") return statusBadge("FREE");
  return statusBadge(status || "PENDING");
}

function partnerTypeLabel(value = "") {
  const normalized = String(value || "").trim();
  if (normalized === "auto_dealer") return "Dealer auto";
  if (normalized === "real_estate_agency") return "Agenție imobiliară";
  return normalized || "-";
}

function listingRows(rows = []) {
  return rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.listing_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.vertical_name || "-")}</div></td>
      <td>${escapeHtml(row.title || "-")}<div class="nx-table-sub">${escapeHtml(row.location || "")}</div></td>
      <td>${escapeHtml(row.owner_name || "-")}<div class="nx-table-sub">${escapeHtml(row.owner_email || "")}</div></td>
      <td>${fmtAmount(row.price_amount, row.price_currency)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${paymentBadge(row)}<div class="nx-table-sub">${escapeHtml(row.selected_plan_code || "free")}</div></td>
      <td>${statusBadge(row.ai_status || "NEGENERAT")}</td>
      <td>${escapeHtml(dateValue(row.published_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/listings/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(LISTING_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
        ${String(row.status || "").toUpperCase() === "PUBLICAT" ? `<a class="nx-btn" href="${escapeHtml(publicListingPath(row))}" target="_blank" rel="noopener">Public</a>` : ""}
      </td>
    </tr>
  `, "Nu există listări e-Marqet.");
}

function partnerRows(rows = []) {
  return rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.display_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.legal_name || "")}</div></td>
      <td>
        ${escapeHtml(partnerTypeLabel(row.partner_type))}
        <div class="nx-table-sub">${escapeHtml(row.selected_plan_code || "-")}</div>
        ${Number(row.founder_badge_enabled || 0) ? `<div class="nx-table-sub"><b>${escapeHtml(row.founder_badge_label || "Dealer Fondator")}</b></div>` : ""}
      </td>
      <td>${escapeHtml(row.account_name || "-")}<div class="nx-table-sub">${escapeHtml(row.account_email || row.email || "")}</div></td>
      <td>${escapeHtml(row.cui || "-")}</td>
      <td>${escapeHtml(row.phone || "-")}<div class="nx-table-sub">${escapeHtml(row.city || "")}${row.county ? `, ${escapeHtml(row.county)}` : ""}</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.listing_count || 0)}<div class="nx-table-sub">${escapeHtml(row.review_count || 0)} revizie · ${escapeHtml(row.paid_count || 0)} plătite</div></td>
      <td>${escapeHtml(dateValue(row.verified_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/partners/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(PARTNER_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
        <details>
          <summary class="nx-btn">Fondator</summary>
          <form method="post" action="/nexora/e-marqet/partners/${escapeHtml(row.id)}/founder" class="nx-form" style="min-width:360px;margin-top:10px;text-align:left">
            <label class="nx-check-field"><input type="checkbox" name="founder_badge_enabled" value="1" ${checked(row.founder_badge_enabled)}><span>Badge Dealer Fondator</span></label>
            <label class="nx-check-field"><input type="checkbox" name="founder_benefits_enabled" value="1" ${checked(row.founder_benefits_enabled)}><span>Beneficii active</span></label>
            <label class="nx-field"><span>Etichetă badge</span><input name="founder_badge_label" value="${escapeHtml(row.founder_badge_label || "Dealer Fondator")}"></label>
            <div class="nx-inline-form">
              <label class="nx-field"><span>Start</span><input type="date" name="founder_benefits_start_at" value="${escapeHtml(dateValue(row.founder_benefits_start_at))}"></label>
              <label class="nx-field"><span>Sfârșit</span><input type="date" name="founder_benefits_end_at" value="${escapeHtml(dateValue(row.founder_benefits_end_at))}"></label>
            </div>
            <div class="nx-two-column-grid compact">
              ${[
                ["free_account", "cont gratuit"],
                ["free_publishing", "publicare gratuită"],
                ["free_import", "import gratuit"],
                ["setup_support", "suport configurare"],
                ["homepage_promotion", "promovare homepage"],
                ["social_promotion", "promovare social"],
                ["no_sales_commission", "fără comision"],
                ["stock_sync_priority", "sincronizare stoc"],
                ["early_features", "funcții noi"]
              ].map(([name, label]) => `<label class="nx-check-field"><input type="checkbox" name="${escapeHtml(name)}" value="1" checked><span>${escapeHtml(label)}</span></label>`).join("")}
            </div>
            <label class="nx-field"><span>Note</span><textarea name="founder_notes">${escapeHtml(row.founder_notes || "")}</textarea></label>
            <button class="nx-btn primary" type="submit">Salvează beneficii</button>
          </form>
          <form method="post" action="/nexora/e-marqet/partners/${escapeHtml(row.id)}/convert-subscription" class="nx-table-action-form" style="margin-top:8px">
            <input name="plan_key" value="${escapeHtml(row.selected_plan_code || "auto_business")}" style="max-width:150px">
            <button class="nx-btn" type="submit">Conversie abonament</button>
          </form>
        </details>
      </td>
    </tr>
  `, "Nu există profiluri business.");
}

function partnerPendingListingRows(rows = []) {
  return rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.listing_code || "-")}</b><div class="nx-table-sub">${escapeHtml(row.vertical_name || "-")}</div></td>
      <td>${escapeHtml(row.title || "-")}<div class="nx-table-sub">${escapeHtml(row.location || "")}</div></td>
      <td>${escapeHtml(row.partner_name || row.owner_name || "-")}<div class="nx-table-sub">${escapeHtml(partnerTypeLabel(row.partner_type))}</div></td>
      <td>${escapeHtml(row.owner_email || row.account_email || "-")}</td>
      <td>${fmtAmount(row.price_amount, row.price_currency)}</td>
      <td>${paymentBadge(row)}<div class="nx-table-sub">${escapeHtml(row.selected_plan_code || "free")}</div></td>
      <td>${statusBadge(row.ai_status || "DE_REVIZUIT")}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/listings/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <input type="hidden" name="status" value="PUBLICAT">
          <input type="hidden" name="return_to" value="/nexora/e-marqet/partners">
          <button class="nx-btn primary" type="submit">Aprobă</button>
        </form>
        <form method="post" action="/nexora/e-marqet/listings/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <input type="hidden" name="status" value="RESPINS">
          <input type="hidden" name="return_to" value="/nexora/e-marqet/partners">
          <button class="nx-btn" type="submit">Respinge</button>
        </form>
      </td>
    </tr>
  `, "Nu există anunțuri plătite în revizie.");
}

function partnerImportRows(rows = []) {
  return rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.partner_name || "-")}</b><div class="nx-table-sub">${escapeHtml(partnerTypeLabel(row.partner_type))}</div></td>
      <td>${escapeHtml(row.account_email || "-")}</td>
      <td>${escapeHtml(row.vertical_code || "-")}</td>
      <td>${escapeHtml(row.source_type || "-")}<div class="nx-table-sub">${escapeHtml(row.file_name || "")}</div></td>
      <td>${escapeHtml(row.total_rows || 0)}</td>
      <td>${escapeHtml(row.imported_count || 0)} create<div class="nx-table-sub">${escapeHtml(row.skipped_count || 0)} sărite · ${escapeHtml(row.error_count || 0)} erori</div></td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
    </tr>
  `, "Nu există importuri de la parteneri.");
}

function leadRows(rows = []) {
  return rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.requester_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.requester_email || "")}</div></td>
      <td>${escapeHtml(row.requester_phone || "-")}</td>
      <td>${escapeHtml(row.vertical_name || "-")}</td>
      <td>${escapeHtml(row.listing_title || "-")}<div class="nx-table-sub">${escapeHtml(row.listing_code || "")}</div></td>
      <td>${escapeHtml(row.source || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(dateValue(row.created_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/leads/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(LEAD_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există lead-uri e-Marqet.");
}

function subscriptionRows(rows = []) {
  return rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.customer_name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.customer_email || "")}</div></td>
      <td>${escapeHtml(row.plan_key || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(limitLabel(row.listing_limit))}</td>
      <td>${fmtAmount(row.amount, row.currency)}</td>
      <td>${escapeHtml(dateValue(row.started_at) || "-")}</td>
      <td>${escapeHtml(dateValue(row.next_billing_at) || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/subscriptions/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(SUBSCRIPTION_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există abonamente e-Marqet.");
}

function verticalRows(rows = []) {
  return rowsOrEmpty(rows, 8, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.code || "")}</div></td>
      <td>${escapeHtml(row.public_path || "-")}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.launch_stage || "-")}</td>
      <td>${escapeHtml(row.actual_listings || 0)} / ${escapeHtml(row.listing_count_goal || 0)}</td>
      <td>${escapeHtml(row.published_listings || 0)}</td>
      <td>${escapeHtml(row.notes || "-")}</td>
      <td>
        <form method="post" action="/nexora/e-marqet/verticals/${escapeHtml(row.id)}/status" class="nx-table-action-form">
          <select name="status">${optionList(VERTICAL_STATUS_OPTIONS, row.status)}</select>
          <button class="nx-btn" type="submit">Status</button>
        </form>
      </td>
    </tr>
  `, "Nu există verticale e-Marqet.");
}

function trafficDailyRows(rows = []) {
  return rowsOrEmpty(rows, 3, (row) => `
    <tr>
      <td>${escapeHtml(dateValue(row.day) || "-")}</td>
      <td>${fmtInt(row.views)}</td>
      <td>${fmtInt(row.visitors)}</td>
    </tr>
  `, "Nu există încă vizite înregistrate.");
}

function topPageRows(rows = []) {
  return rowsOrEmpty(rows, 4, (row) => `
    <tr>
      <td><b>${escapeHtml(row.route_name || "pagină")}</b><div class="nx-table-sub">${escapeHtml(shortText(row.path || "/", 90))}</div></td>
      <td>${fmtInt(row.views)}</td>
      <td>${fmtInt(row.visitors)}</td>
      <td>${row.path ? `<a class="nx-btn" href="https://e-marqet.com${escapeHtml(String(row.path).startsWith("/") ? row.path : `/${row.path}`)}" target="_blank" rel="noopener">Deschide</a>` : `<span class="nx-muted">-</span>`}</td>
    </tr>
  `, "Nu există încă top pagini.");
}

function analyticsPlanRows(rows = []) {
  return rowsOrEmpty(rows, 9, (row) => `
    <tr>
      <td><b>${escapeHtml(row.plan_name || row.plan_code || "Free")}</b><div class="nx-table-sub">${escapeHtml(row.plan_code || "free")}</div></td>
      <td>${fmtInt(row.customers_total)}</td>
      <td>${fmtInt(row.new_customers_30d)}</td>
      <td>${fmtInt(row.active_subscriptions)}</td>
      <td>${fmtInt(row.trial_subscriptions)}</td>
      <td>${fmtAmount(row.monthly_value, "RON")}</td>
      <td>${fmtInt(row.partner_profiles_total)}<div class="nx-table-sub">${fmtInt(row.pending_partner_profiles)} în revizie</div></td>
      <td>${fmtInt(row.listings_total)}<div class="nx-table-sub">${fmtInt(row.published_listings)} publicate</div></td>
      <td>${fmtInt(row.paid_listings)}</td>
    </tr>
  `, "Nu există încă date pe planuri.");
}

function renderEmarqetDashboardPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const analytics = options.analytics || {};
  const traffic = analytics.traffic || {};
  const customers = analytics.customers || {};
  const business = analytics.business || {};
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const leads = Array.isArray(options.leads) ? options.leads : [];
  const subscriptions = Array.isArray(options.subscriptions) ? options.subscriptions : [];
  const activeVerticals = verticals.filter((vertical) => String(vertical.status || "").toUpperCase() === "ACTIV");
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${heroHtml()}

    <section class="nx-kpi-grid">
      ${kpiCard("Verticale active", stats.activeVerticals || 0, "V", "blue")}
      ${kpiCard("Listări totale", stats.totalListings || 0, "L", "green")}
      ${kpiCard("Listări publicate", stats.publishedListings || 0, "P", "orange")}
      ${kpiCard("Lead-uri deschise", stats.openLeads || 0, "C", "purple")}
      ${kpiCard("Abonamente active", stats.activeSubscriptions || 0, "A", "blue")}
      ${kpiCard("Parteneri în revizie", stats.pendingPartners || 0, "B", "orange")}
      ${kpiCard("Plătite de aprobat", stats.paidPendingListings || 0, "R", "green")}
    </section>

    <section class="nx-kpi-grid">
      ${kpiCard("Vizite 24h", fmtInt(traffic.pageviews_24h), "24", "blue")}
      ${kpiCard("Vizite 30 zile", fmtInt(traffic.pageviews_30d), "30", "green")}
      ${kpiCard("Vizitatori 30 zile", fmtInt(traffic.visitors_30d), "U", "orange")}
      ${kpiCard("Vizite totale", fmtInt(traffic.total_pageviews), "T", "purple")}
      ${kpiCard("Clienți noi 7 zile", fmtInt(customers.customers_7d), "7", "blue")}
      ${kpiCard("Clienți noi 30 zile", fmtInt(customers.customers_30d), "N", "green")}
      ${kpiCard("Clienți total", fmtInt(customers.customers_total), "C", "orange")}
      ${kpiCard("Profiluri business noi", fmtInt(business.partner_profiles_30d), "B", "purple")}
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Trafic ultimele 14 zile</h1><p>Vizite și vizitatori unici pe e-marqet.com.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Zi</th><th>Vizite</th><th>Vizitatori</th></tr></thead><tbody>${trafficDailyRows(analytics.dailyTraffic || [])}</tbody></table></div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Top pagini 30 zile</h1><p>Paginile care aduc cel mai mult trafic.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Pagină</th><th>Vizite</th><th>Vizitatori</th><th></th></tr></thead><tbody>${topPageRows(analytics.topPages || [])}</tbody></table></div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Clienți și abonamente pe plan</h1><p>Împărțire după conturi, abonamente, profiluri business și listări.</p></div><a class="nx-btn" href="/nexora/e-marqet/subscriptions">Abonamente</a></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Plan</th><th>Clienți</th><th>Clienți noi 30z</th><th>Active</th><th>Trial</th><th>Valoare lunară</th><th>Profiluri</th><th>Listări</th><th>Plătite</th></tr></thead><tbody>${analyticsPlanRows(analytics.planRows || [])}</tbody></table></div>
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Verticale MVP</h1><p>Primele direcții pregătite în document.</p></div></div>
        <div class="emq-chip-row">
          ${activeVerticals.length ? activeVerticals.map((vertical) => `<span class="emq-chip">${escapeHtml(vertical.name)}</span>`).join("") : `<span class="emq-chip">În configurare</span>`}
        </div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Legături Nexora</h1><p>Zonele operaționale conectate la e-Marqet.</p></div></div>
        <div class="emq-link-list">
          <a class="emq-link-row" href="/nexora/travel/dashboard"><span>Trevoro / Turism</span><span>Deschide</span></a>
          <a class="emq-link-row" href="/nexora/clients"><span>Clienți & conturi</span><span>Deschide</span></a>
          <a class="emq-link-row" href="/nexora/facturi"><span>Facturi</span><span>Deschide</span></a>
          <a class="emq-link-row" href="/nexora/settings?tab=subscription"><span>Abonament workspace</span><span>Deschide</span></a>
        </div>
      </section>
    </div>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Listări recente</h1><p>Publicare pe verticale și status AI.</p></div><a class="nx-btn" href="/nexora/e-marqet/listings">Toate</a></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Titlu</th><th>Client</th><th>Preț</th><th>Status</th><th>AI</th><th>Publicat</th><th></th></tr></thead><tbody>${listingRows(listings)}</tbody></table></div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Lead-uri recente</h1><p>Cereri venite din listări și campanii.</p></div><a class="nx-btn" href="/nexora/e-marqet/leads">Toate</a></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Contact</th><th>Telefon</th><th>Vertical</th><th>Listare</th><th>Sursă</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>${leadRows(leads)}</tbody></table></div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Abonamente recente</h1><p>Planuri comerciale pentru conturi e-Marqet.</p></div><a class="nx-btn" href="/nexora/e-marqet/subscriptions">Toate</a></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Client</th><th>Plan</th><th>Status</th><th>Limită listări</th><th>Valoare</th><th>Start</th><th>Următoarea plată</th><th></th></tr></thead><tbody>${subscriptionRows(subscriptions)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "e-Marqet", activePath: "/nexora/e-marqet", companyName, user: options.user, body });
}

function renderEmarqetListingsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Listare nouă</h1><p>Înregistrare publicabilă pe unul dintre verticalele e-Marqet.</p></div></div>
      <form method="post" action="/nexora/e-marqet/listings/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Vertical</span><select name="vertical_id" required>${verticalOptions(verticals)}</select></label>
        <label class="nx-field"><span>Titlu</span><input name="title" required placeholder="Apartament central / Pensiune / Serviciu"></label>
        <label class="nx-field"><span>Client</span><input name="owner_name" placeholder="Nume client"></label>
        <label class="nx-field"><span>Email client</span><input type="email" name="owner_email" placeholder="client@email.ro"></label>
        <label class="nx-field"><span>Locație</span><input name="location" placeholder="Oraș, județ"></label>
        <label class="nx-field"><span>Preț</span><input name="price_amount" inputmode="decimal" placeholder="250"></label>
        <label class="nx-field"><span>Monedă</span><input name="price_currency" value="RON"></label>
        <label class="nx-field"><span>Status</span><select name="status">${optionList(LISTING_STATUS_OPTIONS, "DRAFT")}</select></label>
        <label class="nx-field"><span>Scor calitate</span><input type="number" name="quality_score" min="0" max="100" value="0"></label>
        <label class="nx-field"><span>Status AI</span><select name="ai_status"><option value="NEGENERAT">Negenerat</option><option value="GENERAT">Generat</option><option value="DE_REVIZUIT">De revizuit</option></select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează listare</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Listări e-Marqet</h1><p>Catalog intern pentru publicare, revizie și monetizare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Titlu</th><th>Client</th><th>Preț</th><th>Status</th><th>Plată</th><th>AI</th><th>Publicat</th><th></th></tr></thead><tbody>${listingRows(rows)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Listări e-Marqet", activePath: "/nexora/e-marqet/listings", companyName, user: options.user, body });
}

function renderEmarqetPartnersPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const partnerProfiles = Array.isArray(options.partnerProfiles) ? options.partnerProfiles : [];
  const partnerImports = Array.isArray(options.partnerImports) ? options.partnerImports : [];
  const pendingListings = Array.isArray(options.pendingListings) ? options.pendingListings : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Parteneri business</h1>
          <p>Dealerii auto și agențiile imobiliare intră aici pentru verificare, importuri și aprobare listări.</p>
        </div>
        <a class="nx-btn" href="https://e-marqet.com/cont/business" target="_blank" rel="noopener">Profil public</a>
      </div>
      <div class="nx-kpi-grid">
        ${kpiCard("Profiluri business", partnerProfiles.length, "B", "blue")}
        ${kpiCard("În revizie", partnerProfiles.filter((row) => String(row.status || "").toUpperCase() === "IN_REVIZIE").length, "R", "orange")}
        ${kpiCard("Anunțuri de aprobat", pendingListings.length, "A", "green")}
        ${kpiCard("Importuri", partnerImports.length, "I", "purple")}
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Aprobări anunțuri</h1><p>Anunțuri plătite sau venite de la parteneri, încă nepublicate.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Cod</th><th>Titlu</th><th>Partener</th><th>Email</th><th>Preț</th><th>Plată</th><th>AI</th><th>Creat</th><th></th></tr></thead><tbody>${partnerPendingListingRows(pendingListings)}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Profiluri business</h1><p>Statusul partenerilor care pot publica manual sau prin import.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Partener</th><th>Tip / plan</th><th>Cont</th><th>CUI</th><th>Contact</th><th>Status</th><th>Listări</th><th>Verificat</th><th></th></tr></thead><tbody>${partnerRows(partnerProfiles)}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Importuri parteneri</h1><p>CSV-uri și feed-uri procesate pentru dealerii auto și agențiile imobiliare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Partener</th><th>Cont</th><th>Vertical</th><th>Sursă</th><th>Total</th><th>Rezultat</th><th>Status</th><th>Dată</th></tr></thead><tbody>${partnerImportRows(partnerImports)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Parteneri e-Marqet", activePath: "/nexora/e-marqet/partners", companyName, user: options.user, body });
}

function renderEmarqetLeadsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Lead nou</h1><p>Cerere comercială asociată cu un vertical sau cu o listare.</p></div></div>
      <form method="post" action="/nexora/e-marqet/leads/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume contact</span><input name="requester_name" required></label>
        <label class="nx-field"><span>Email</span><input type="email" name="requester_email"></label>
        <label class="nx-field"><span>Telefon</span><input name="requester_phone"></label>
        <label class="nx-field"><span>Vertical</span><select name="vertical_id"><option value="">Alege vertical</option>${verticalOptions(verticals)}</select></label>
        <label class="nx-field nx-field-wide"><span>Listare</span><select name="listing_id">${listingOptions(listings)}</select></label>
        <label class="nx-field"><span>Sursă</span><input name="source" value="manual"></label>
        <label class="nx-field"><span>Status</span><select name="status">${optionList(LEAD_STATUS_OPTIONS, "NOU")}</select></label>
        <label class="nx-field nx-field-wide"><span>Mesaj</span><input name="message"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează lead</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Lead-uri e-Marqet</h1><p>Cereri primite din marketplace, campanii și introduceri manuale.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Contact</th><th>Telefon</th><th>Vertical</th><th>Listare</th><th>Sursă</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>${leadRows(rows)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Lead-uri e-Marqet", activePath: "/nexora/e-marqet/leads", companyName, user: options.user, body });
}

function renderEmarqetSubscriptionsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const pricingPlans = Array.isArray(options.pricingPlans) ? options.pricingPlans : [];
  const addons = Array.isArray(options.addons) ? options.addons : [];
  const today = new Date().toISOString().slice(0, 10);
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Abonament nou</h1><p>Plan comercial pentru conturile care publică pe e-Marqet.</p></div></div>
      <form method="post" action="/nexora/e-marqet/subscriptions/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Client</span><input name="customer_name" required></label>
        <label class="nx-field"><span>Email client</span><input type="email" name="customer_email"></label>
        <label class="nx-field nx-field-wide"><span>Plan</span><select name="plan_key" required>${subscriptionPlanOptions(pricingPlans, "start")}</select></label>
        <label class="nx-field"><span>Status</span><select name="status">${optionList(SUBSCRIPTION_STATUS_OPTIONS, "TRIAL")}</select></label>
        <label class="nx-field"><span>Limită listări</span><input type="number" name="listing_limit" min="-1" placeholder="automat din plan"></label>
        <label class="nx-field"><span>Valoare</span><input name="amount" inputmode="decimal" placeholder="automat din plan"></label>
        <label class="nx-field"><span>Monedă</span><input name="currency" value="RON"></label>
        <label class="nx-field"><span>Start</span><input type="date" name="started_at" value="${escapeHtml(today)}"></label>
        <label class="nx-field"><span>Următoarea plată</span><input type="date" name="next_billing_at"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează abonament</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Catalog abonamente și pachete</h1><p>Planuri standard, pachete dedicate și oferta Founding Member.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Plan</th><th>Tip / public</th><th>Preț</th><th>Limită</th><th>Promovare</th><th>Include</th></tr></thead><tbody>${pricingPlanRows(pricingPlans)}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Servicii suplimentare</h1><p>Promovări, distribuiri sociale și servicii AI vândute pe anunț sau campanie.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Serviciu</th><th>Categorie</th><th>Preț</th><th>Inclus în</th><th>Descriere</th></tr></thead><tbody>${addonRows(addons)}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Abonamente e-Marqet</h1><p>Limită listări, status comercial și următoarea plată.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Client</th><th>Plan</th><th>Status</th><th>Limită listări</th><th>Valoare</th><th>Start</th><th>Următoarea plată</th><th></th></tr></thead><tbody>${subscriptionRows(rows)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Abonamente e-Marqet", activePath: "/nexora/e-marqet/subscriptions", companyName, user: options.user, body });
}

function renderEmarqetServicesPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const services = Array.isArray(options.services) ? options.services : [];
  const requests = Array.isArray(options.requests) ? options.requests : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Marketplace Services / Servicii Integrate</h1>
          <p>Servicii care cresc încrederea și conversia pentru anunțurile publicate.</p>
        </div>
        <a class="nx-btn" href="https://e-marqet.com/anunturi?vertical=auto" target="_blank" rel="noopener">Vezi auto public</a>
      </div>
      <div class="emq-roadmap">
        <div class="emq-roadmap-step"><b>1. Date tehnice</b><span>VIN decode basic disponibil acum; decode complet după cheie API partener.</span></div>
        <div class="emq-roadmap-step"><b>2. Încredere</b><span>Rapoarte istoric/daune pot activa badge-uri precum Istoric verificat.</span></div>
        <div class="emq-roadmap-step"><b>3. Conversie</b><span>Test drive, service, leasing, asigurare și contract intră ca lead sau document.</span></div>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Cerere serviciu</h1><p>Leagă un serviciu integrat de o listare existentă.</p></div></div>
      <form method="post" action="/nexora/e-marqet/services/request" class="nx-inline-form nx-register-form">
        <label class="nx-field nx-field-wide"><span>Listare</span><select name="listing_id" required>${listingOptions(listings)}</select></label>
        <label class="nx-field nx-field-wide"><span>Serviciu</span><select name="service_code" required>${serviceOptions(services)}</select></label>
        <label class="nx-field"><span>Contact</span><input name="requester_name" placeholder="Nume client"></label>
        <label class="nx-field"><span>Email</span><input type="email" name="requester_email"></label>
        <label class="nx-field"><span>Telefon</span><input name="requester_phone"></label>
        <label class="nx-field"><span>Status</span><select name="status">${optionList(SERVICE_REQUEST_STATUS_OPTIONS, "NOU")}</select></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes" placeholder="VIN, preferință service, finanțare, observații"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează cerere</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Catalog servicii</h1><p>Ce este disponibil intern și ce necesită contract/API cu partener.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Serviciu</th><th>Vertical</th><th>Provider</th><th>Model bani</th><th>Partener</th><th>CTA</th><th>Badge</th><th>Descriere</th></tr></thead><tbody>${serviceRows(services)}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Cereri servicii</h1><p>Status operațional pentru servicii cerute din public sau introduse manual.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Serviciu</th><th>Listare</th><th>Contact</th><th>Telefon</th><th>Status</th><th>Valoare</th><th>Partener</th><th>Creat</th><th></th></tr></thead><tbody>${requestRows(requests)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Servicii Integrate e-Marqet", activePath: "/nexora/e-marqet/services", companyName, user: options.user, body });
}

function renderEmarqetSocialPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const summary = options.summary || {};
  const accounts = Array.isArray(options.accounts) ? options.accounts : [];
  const targets = Array.isArray(options.targets) ? options.targets : [];
  const posts = Array.isArray(options.posts) ? options.posts : [];
  const manualGroups = Array.isArray(options.manualGroups) ? options.manualGroups : [];
  const manualPosts = Array.isArray(options.manualPosts) ? options.manualPosts : [];
  const manualSuggestions = options.manualSuggestions && typeof options.manualSuggestions === "object" ? options.manualSuggestions : {};
  const publishJobs = Array.isArray(options.publishJobs) ? options.publishJobs : [];
  const listings = Array.isArray(options.listings) ? options.listings : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Distribuție socială</h1>
          <p>Pagina e-Marqet, targeturi Facebook, drafturi Marketplace și coadă de publicare.</p>
        </div>
        <div class="nx-form-actions">
          <a class="nx-btn" href="/nexora/e-marqet/social/marketplace-feed.csv">Feed Marketplace</a>
          <a class="nx-btn" href="/nexora/e-marqet/social/targets/export.csv">Export targeturi</a>
          <form method="post" action="/nexora/e-marqet/social/process">
            <button class="nx-btn primary" type="submit">Procesează coada</button>
          </form>
        </div>
      </div>
      <div class="emq-social-card-grid">
        ${kpiCard("Postări", summary.posts || 0, "P", "blue")}
        ${kpiCard("Publicate", summary.published || 0, "✓", "green")}
        ${kpiCard("În coadă", summary.queued || 0, "Q", "orange")}
        ${kpiCard("Manual", summary.manualRequired || 0, "M", "purple")}
        ${kpiCard("Grupuri", summary.groups || 0, "G", "blue")}
        ${kpiCard("Membru", summary.joinedGroups || 0, "J", "green")}
        ${kpiCard("Targeturi permise", summary.allowedTargets || 0, "A", "orange")}
        ${kpiCard("Listări publicate", listings.length || 0, "L", "purple")}
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Import rapid grupuri Facebook</h1>
          <p>Lipește lista o singură dată; Nexora ține evidența grupurilor folosite și îți propune următoarele 9 nefolosite pe fiecare postare.</p>
        </div>
      </div>
      <form method="post" action="/nexora/e-marqet/social/groups/import" class="emq-group-import-form">
        <label class="nx-field"><span>Grupuri, câte unul pe linie</span><textarea name="groups_text" placeholder="Vânzări cumpărări București | https://www.facebook.com/groups/...&#10;Auto Constanța | https://www.facebook.com/groups/..."></textarea></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Importă grupuri</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Postări manuale pentru grupuri</h1>
          <p>Copiază textul, deschide imaginea și publică manual în grupurile unde regulile permit promovarea.</p>
        </div>
        <a class="nx-btn" href="https://www.facebook.com/groups/feed/" target="_blank" rel="noopener">Deschide Facebook Groups</a>
      </div>
      ${socialManualShareCards(manualPosts, manualGroups, manualSuggestions)}
    </section>

    <div class="nx-two-column-grid">
      ${socialAccountCards(accounts)}
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Generează pachet</h1><p>Drafturi pentru listările publicate și targeturile active.</p></div></div>
        <form method="post" action="/nexora/e-marqet/social/generate" class="nx-form">
          <label class="nx-field"><span>Listări</span><input type="number" name="limit" min="1" max="50" value="10"></label>
          <label class="nx-field"><span><input type="checkbox" name="include_marketplace" value="1" checked> Include Marketplace</span></label>
          <label class="nx-field"><span><input type="checkbox" name="include_groups" value="1"> Include grupuri aprobate</span></label>
          <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Generează postări</button></div>
        </form>
        <div class="nx-empty-state">Marketplace automat se face doar prin Meta Marketplace Partner API sau catalog/feed aprobat. Fără aprobare Meta, Nexora pregătește feed-ul și drafturile, dar nu folosește bot de browser.</div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Target nou</h1><p>Adaugă pagină, grup, profil sau Marketplace manual în registru.</p></div></div>
      <form method="post" action="/nexora/e-marqet/social/targets" class="emq-social-target-form">
        <label class="nx-field wide"><span>Nume</span><input name="name" required placeholder="Grup auto București"></label>
        <label class="nx-field wide"><span>URL</span><input name="url" placeholder="https://www.facebook.com/groups/..."></label>
        <label class="nx-field"><span>Tip</span><select name="target_type">${optionList(SOCIAL_TARGET_TYPE_OPTIONS, "group")}</select></label>
        <label class="nx-field"><span>Categorie</span><input name="category" placeholder="auto"></label>
        <label class="nx-field"><span>Locație</span><input name="location" placeholder="București"></label>
        <label class="nx-field"><span>Membri</span><input type="number" name="members_count" min="0" value="0"></label>
        <label class="nx-field"><span>Join</span><select name="join_status">${optionList(SOCIAL_JOIN_STATUS_OPTIONS, "de_verificat")}</select></label>
        <label class="nx-field"><span>Reguli</span><select name="rules_status">${optionList(SOCIAL_RULE_STATUS_OPTIONS, "de_verificat")}</select></label>
        <label class="nx-field"><span>Frecvență</span><input type="number" name="frequency_limit_per_week" min="1" value="1"></label>
        <label class="nx-field wide"><span>Note</span><input name="notes"></label>
        <label class="nx-field"><span><input type="checkbox" name="promotion_allowed" value="1"> Promovare permisă</span></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Salvează target</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Targeturi Facebook</h1><p>Lista grupurilor și canalelor unde se poate lucra controlat.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Target</th><th>Tip</th><th>Locație</th><th>Membri</th><th>Join</th><th>Reguli</th><th>Promovare</th><th>Frecvență</th><th>Ultima postare</th><th>Note</th><th>Link</th><th>Acțiuni</th></tr></thead>
          <tbody>${socialTargetRows(targets)}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Postări pregătite</h1><p>Texte pentru pagina Facebook, Marketplace și grupuri aprobate.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Target</th><th>Listare</th><th>Titlu</th><th>Text</th><th>Link</th><th>Media</th><th>Status</th><th>Publicare</th><th>Programat</th><th>Publicat</th><th>Acțiune</th><th>Status</th></tr></thead>
          <tbody>${socialPostRows(posts)}</tbody>
        </table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Publishing Queue</h1><p>API pentru pagina proprie și flux manual pentru Marketplace/grupuri.</p></div></div>
      <div class="nx-table-wrap">
        <table class="nx-table">
          <thead><tr><th>Tip</th><th>Target</th><th>Status</th><th>Programat</th><th>Publicat</th><th>External ID</th><th>Eroare</th><th>Link</th><th>Media</th><th>Text</th></tr></thead>
          <tbody>${socialJobRows(publishJobs)}</tbody>
        </table>
      </div>
    </section>
  `;
  return shell({ title: "Social e-Marqet", activePath: "/nexora/e-marqet/social", companyName, user: options.user, body });
}

function renderEmarqetVerticalsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Vertical nou</h1><p>Categorie de marketplace administrată prin e-Marqet.</p></div></div>
      <form method="post" action="/nexora/e-marqet/verticals/create" class="nx-inline-form nx-register-form">
        <label class="nx-field"><span>Nume</span><input name="name" required placeholder="Joburi / Produse / Auto"></label>
        <label class="nx-field"><span>Cod</span><input name="code" placeholder="joburi"></label>
        <label class="nx-field"><span>Rută publică</span><input name="public_path" placeholder="/joburi"></label>
        <label class="nx-field"><span>Status</span><select name="status">${optionList(VERTICAL_STATUS_OPTIONS, "PLANIFICAT")}</select></label>
        <label class="nx-field"><span>Etapă</span><input name="launch_stage" value="Roadmap"></label>
        <label class="nx-field"><span>Țintă listări</span><input type="number" name="listing_count_goal" min="0" value="100"></label>
        <label class="nx-field nx-field-wide"><span>Note</span><input name="notes"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Creează vertical</button></div>
      </form>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Verticale e-Marqet</h1><p>Turism, imobiliare și extensiile marketplace-ului.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Vertical</th><th>Rută publică</th><th>Status</th><th>Etapă</th><th>Listări</th><th>Publicate</th><th>Note</th><th></th></tr></thead><tbody>${verticalRows(rows)}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Verticale e-Marqet", activePath: "/nexora/e-marqet/verticals", companyName, user: options.user, body });
}

function integrationFieldInputs(fields = [], values = {}, { secret = false, providerKey = "" } = {}) {
  if (!fields.length) return `<div class="nx-empty-state">Nu sunt câmpuri necesare pentru acest modul.</div>`;
  return fields.map((field) => `
    <label class="nx-field">
      <span>${escapeHtml(field.replaceAll("_", " "))}</span>
      <input
        type="${secret ? "password" : "text"}"
        name="${escapeHtml(field)}"
        value="${secret ? "" : escapeHtml(values[field] || "")}"
        placeholder="${secret && values[field] === "set" ? "setat - completează doar dacă schimbi" : ""}"
        autocomplete="off">
    </label>
  `).join("");
}

function integrationDocsList(docs = []) {
  if (!docs.length) return `<div class="nx-empty-state">Nu există linkuri documentate.</div>`;
  return `<div class="emq-link-list">${docs.map(([label, url]) => `
    <a class="emq-link-row" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      <span>${escapeHtml(label)}</span><span>Deschide</span>
    </a>
  `).join("")}</div>`;
}

function integrationChecklist(items = []) {
  return `<ul class="nx-clean-list">${(items || []).map((item) => `<li>□ ${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function integrationCards(integrations = []) {
  return rowsOrEmpty(integrations, 1, (row) => {
    const config = row.config || {};
    const merchantConfig = row.merchantConfig || {};
    const credentialsStatus = row.credentialsStatus || {};
    return `
      <tr>
        <td>
          <section class="nx-content-card" style="margin:0">
            <div class="nx-section-head">
              <div>
                <h1>${escapeHtml(row.name || row.display_name || row.provider_key)}</h1>
                <p>${escapeHtml(row.category || "")} · ${escapeHtml((row.capabilities || []).join(", "))}</p>
              </div>
              <div class="nx-form-actions">
                ${statusBadge(row.enabled ? "ACTIV" : "PAUZAT")}
                ${statusBadge(row.status || "not_configured")}
              </div>
            </div>
            <div class="nx-two-column-grid">
              <div>
                <form method="post" action="/nexora/e-marqet/integrations/${escapeHtml(row.provider_key)}/status" class="nx-inline-form compact">
                  <input type="hidden" name="enabled" value="0">
                  <label class="nx-field"><span>Activ</span><select name="enabled">
                    <option value="1" ${row.enabled ? "selected" : ""}>Activ</option>
                    <option value="0" ${!row.enabled ? "selected" : ""}>Oprit</option>
                  </select></label>
                  <label class="nx-field"><span>Mediu</span><select name="environment">
                    <option value="sandbox" ${String(row.environment || "sandbox") === "sandbox" ? "selected" : ""}>Sandbox</option>
                    <option value="production" ${String(row.environment || "") === "production" ? "selected" : ""}>Production</option>
                  </select></label>
                  <button class="nx-btn primary" type="submit">Salvează status</button>
                </form>
                <form method="post" action="/nexora/e-marqet/integrations/${escapeHtml(row.provider_key)}/credentials" class="nx-filter-grid" style="margin-top:14px">
                  ${integrationFieldInputs(row.credentialFields || [], credentialsStatus, { secret: true, providerKey: row.provider_key })}
                  <div class="nx-form-actions"><button class="nx-btn" type="submit">Salvează credentiale</button></div>
                </form>
                <form method="post" action="/nexora/e-marqet/integrations/${escapeHtml(row.provider_key)}/config" class="nx-filter-grid" style="margin-top:14px">
                  ${integrationFieldInputs(row.configFields || [], config)}
                  ${integrationFieldInputs(row.merchantFields || [], merchantConfig)}
                  <div class="nx-form-actions"><button class="nx-btn" type="submit">Salvează configurare</button></div>
                </form>
                <div class="nx-form-actions" style="justify-content:flex-start;margin-top:12px">
                  <form method="post" action="/nexora/e-marqet/integrations/${escapeHtml(row.provider_key)}/test">
                    <button class="nx-btn primary" type="submit">Testează</button>
                  </form>
                  <form method="post" action="/nexora/e-marqet/integrations/${escapeHtml(row.provider_key)}/report">
                    <button class="nx-btn" type="submit">Raport</button>
                  </form>
                </div>
                ${row.last_test_at ? `<div class="nx-empty-state" style="margin-top:12px">Ultimul test: ${escapeHtml(row.last_test_at)} · ${escapeHtml(row.last_test_status || "-")}${row.last_error ? ` · ${escapeHtml(row.last_error)}` : ""}</div>` : ""}
              </div>
              <div class="nx-stack">
                <details open>
                  <summary>Analiză</summary>
                  <div class="nx-empty-state" style="margin-top:8px">
                    <b>Oferă:</b> ${escapeHtml(row.analysis?.offers || "-")}<br>
                    <b>Beneficii utilizatori:</b> ${escapeHtml(row.analysis?.userBenefits || "-")}<br>
                    <b>Beneficii E-MARQET:</b> ${escapeHtml(row.analysis?.platformBenefits || "-")}<br>
                    <b>Limitări API:</b> ${escapeHtml(row.analysis?.limitations || "-")}
                  </div>
                </details>
                <details>
                  <summary>Activare, contracte și costuri</summary>
                  <div class="nx-empty-state" style="margin-top:8px">
                    <b>Contract:</b> ${escapeHtml(row.contract || "-")}<br>
                    <b>Costuri:</b> ${escapeHtml(row.costs || "-")}<br>
                    <b>Contact:</b> ${escapeHtml(row.contact || "-")}<br>
                    <b>Timp estimat:</b> ${escapeHtml(row.activationTime || "-")}
                  </div>
                </details>
                <details>
                  <summary>Checklist</summary>
                  ${integrationChecklist(row.checklist || [])}
                </details>
                <details>
                  <summary>Linkuri oficiale</summary>
                  ${integrationDocsList(row.docs || [])}
                </details>
              </div>
            </div>
          </section>
        </td>
      </tr>
    `;
  }, "Nu există integrări configurate.");
}

function renderEmarqetIntegrationsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const integrations = Array.isArray(options.integrations) ? options.integrations : [];
  const logs = Array.isArray(options.logs) ? options.logs : [];
  const reports = Array.isArray(options.reports) ? options.reports : [];
  const apiKeys = Array.isArray(options.apiKeys) ? options.apiKeys : [];
  const stats = options.stats || {};
  const apiToken = options.apiToken || "";
  const logsHtml = rowsOrEmpty(logs, 7, (row) => `
    <tr>
      <td>${escapeHtml(row.created_at || "")}</td>
      <td>${escapeHtml(row.provider_key || "-")}</td>
      <td>${escapeHtml(row.action || "-")}</td>
      <td>${statusBadge(row.status || "-")}</td>
      <td>${escapeHtml(row.message || "-")}</td>
      <td>${escapeHtml(row.error || "-")}</td>
      <td>${escapeHtml(row.request_id || "-")}</td>
    </tr>
  `, "Nu există loguri de integrare.");
  const reportHtml = rowsOrEmpty(reports, 5, (row) => `
    <tr>
      <td><b>${escapeHtml(row.title || "-")}</b><div class="nx-table-sub">${escapeHtml(row.provider_key || "")}</div></td>
      <td>${escapeHtml(row.created_at || "")}</td>
      <td>${statusBadge(row.status || "-")}</td>
      <td><textarea rows="6" readonly style="min-width:420px">${escapeHtml(row.markdown || "")}</textarea></td>
      <td><a class="nx-btn" href="/nexora/e-marqet/integrations/reports/${escapeHtml(row.id)}.md">Markdown</a></td>
    </tr>
  `, "Nu există rapoarte generate.");
  const apiKeysHtml = rowsOrEmpty(apiKeys, 6, (row) => `
    <tr>
      <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.token_prefix || "")}...</div></td>
      <td>${escapeHtml(row.scopes || "-")}</td>
      <td>${statusBadge(row.status || "-")}</td>
      <td>${escapeHtml(row.last_used_at || "-")}</td>
      <td>${escapeHtml(row.created_at || "-")}</td>
      <td>
        ${String(row.status || "").toUpperCase() === "ACTIVE" ? `
          <form method="post" action="/nexora/e-marqet/integrations/api-keys/${escapeHtml(row.id)}/revoke">
            <button class="nx-btn danger" type="submit">Revocă</button>
          </form>
        ` : ""}
      </td>
    </tr>
  `, "Nu există chei API.");
  const body = `
    ${alertHtml(options.ok, options.err)}
    ${apiToken ? `<section class="nx-content-card"><div class="nx-alert success"><b>Token API nou:</b><br><code style="word-break:break-all">${escapeHtml(apiToken)}</code><br>Copiază tokenul acum. După refresh rămâne salvat doar hash-ul.</div></section>` : ""}

    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Integrări E-MARQET</h1>
          <p>Module externe pe Adapter Pattern: curieri, plăți, social, Google, AI și Marketplace API.</p>
        </div>
        <img class="emq-logo" src="/brand/emarqet-logo.svg" alt="e-Marqet">
      </div>
      <div class="nx-kpi-grid">
        ${kpiCard("Module", stats.total || 0, "I", "blue")}
        ${kpiCard("Active", stats.enabled || 0, "A", "green")}
        ${kpiCard("Ready", stats.ready || 0, "R", "purple")}
        ${kpiCard("Erori", stats.errors || 0, "E", "orange")}
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Marketplace API</h1><p>Tokenuri Bearer pentru publicare anunțuri, stoc, prețuri și comenzi.</p></div></div>
      <div class="nx-empty-state">Base URL: <code>/api/e-marqet/v1</code> · Health: <code>/api/e-marqet/v1/health</code> · Autentificare: <code>Authorization: Bearer &lt;api_token&gt;</code></div>
      <form method="post" action="/nexora/e-marqet/integrations/api-keys" class="nx-filter-grid">
        <label class="nx-field"><span>Nume cheie</span><input name="name" placeholder="ERP client / magazin online"></label>
        <label class="nx-field nx-field-wide"><span>Scope-uri</span><input name="scopes" value="listings:write,stock:write,prices:write,orders:read"></label>
        <div class="nx-form-actions"><button class="nx-btn primary" type="submit">Generează token</button></div>
      </form>
      <div class="nx-table-wrap" style="margin-top:14px">
        <table class="nx-table"><thead><tr><th>Cheie</th><th>Scope-uri</th><th>Status</th><th>Ultima folosire</th><th>Creată</th><th></th></tr></thead><tbody>${apiKeysHtml}</tbody></table>
      </div>
    </section>

    <section>
      <div class="nx-table-wrap">
        <table class="nx-table"><tbody>${integrationCards(integrations)}</tbody></table>
      </div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Rapoarte generate</h1><p>Ce s-a implementat, limitări, conturi, contracte, costuri și pași de activare.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Raport</th><th>Data</th><th>Status</th><th>Conținut</th><th></th></tr></thead><tbody>${reportHtml}</tbody></table></div>
    </section>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Loguri</h1><p>Audit pentru configurări, teste, rapoarte și apeluri API.</p></div></div>
      <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Data</th><th>Provider</th><th>Acțiune</th><th>Status</th><th>Mesaj</th><th>Eroare</th><th>Request</th></tr></thead><tbody>${logsHtml}</tbody></table></div>
    </section>
  `;
  return shell({ title: "Integrări e-Marqet", activePath: "/nexora/e-marqet/integrations", companyName, user: options.user, body });
}

function renderEmarqetSettingsPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const stats = options.stats || {};
  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const body = `
    ${alertHtml(options.ok, options.err)}
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>Setări e-Marqet</h1>
          <p>Structura platformei, legături Nexora și pașii următori pentru lansare.</p>
        </div>
        <img class="emq-logo" src="/brand/emarqet-logo.svg" alt="e-Marqet">
      </div>
    </section>

    <section class="nx-kpi-grid">
      ${kpiCard("Verticale active", stats.activeVerticals || 0, "V", "blue")}
      ${kpiCard("Listări publicate", stats.publishedListings || 0, "P", "green")}
      ${kpiCard("Lead-uri deschise", stats.openLeads || 0, "L", "orange")}
      ${kpiCard("Abonamente active", stats.activeSubscriptions || 0, "A", "purple")}
    </section>

    <div class="nx-two-column-grid">
      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Verticale lansare</h1><p>Statusul verticalelor din MVP.</p></div></div>
        <div class="nx-table-wrap"><table class="nx-table"><thead><tr><th>Vertical</th><th>Status</th><th>Rută</th><th>Listări</th></tr></thead><tbody>
          ${rowsOrEmpty(verticals, 4, (row) => `
            <tr>
              <td><b>${escapeHtml(row.name || "-")}</b><div class="nx-table-sub">${escapeHtml(row.code || "")}</div></td>
              <td>${statusBadge(row.status)}</td>
              <td>${escapeHtml(row.public_path || "-")}</td>
              <td>${escapeHtml(row.actual_listings || 0)} / ${escapeHtml(row.listing_count_goal || 0)}</td>
            </tr>
          `, "Nu există verticale.")}
        </tbody></table></div>
      </section>

      <section class="nx-content-card">
        <div class="nx-section-head"><div><h1>Legături curente</h1><p>Module Nexora folosite ca motor operațional.</p></div></div>
        <div class="emq-link-list">
          <a class="emq-link-row" href="/nexora/crm/leads"><span>CRM lead-uri</span><span>Deschide</span></a>
          <a class="emq-link-row" href="/nexora/clients"><span>Clienți</span><span>Deschide</span></a>
          <a class="emq-link-row" href="/nexora/facturi"><span>Facturare</span><span>Deschide</span></a>
          <a class="emq-link-row" href="/nexora/travel/dashboard"><span>Trevoro ca vertical turism</span><span>Deschide</span></a>
        </div>
      </section>
    </div>

    <section class="nx-content-card">
      <div class="nx-section-head"><div><h1>Roadmap MVP</h1><p>Ordinea recomandată din documentul e-Marqet.</p></div></div>
      <div class="emq-roadmap">
        <div class="emq-roadmap-step"><b>1. Cont & profil</b><span>Login, profil companie/persoană și dashboard centralizat.</span></div>
        <div class="emq-roadmap-step"><b>2. Publicare</b><span>Listări pe turism și imobiliare, status publicare și lead-uri.</span></div>
        <div class="emq-roadmap-step"><b>3. Monetizare</b><span>Planuri, limite listări, facturi și plăți transparente.</span></div>
      </div>
    </section>
  `;
  return shell({ title: "Setări e-Marqet", activePath: "/nexora/e-marqet/settings", companyName, user: options.user, body });
}

export {
  renderEmarqetDashboardPage,
  renderEmarqetIntegrationsPage,
  renderEmarqetLeadsPage,
  renderEmarqetListingsPage,
  renderEmarqetPartnersPage,
  renderEmarqetServicesPage,
  renderEmarqetSettingsPage,
  renderEmarqetSocialPage,
  renderEmarqetSubscriptionsPage,
  renderEmarqetVerticalsPage
};
