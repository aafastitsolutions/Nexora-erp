import { parseModuleList } from "./app-config.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parsePlanFeatures(plan) {
  return parseModuleList(plan?.features_json, []);
}

function parsePlanModules(plan) {
  return parseModuleList(plan?.module_keys, []);
}

function planAccent(code = "") {
  const normalizedCode = String(code || "").trim().toLowerCase();
  if (normalizedCode === "start") return "linear-gradient(135deg,#0f172a,#1d4ed8)";
  if (normalizedCode === "business") return "linear-gradient(135deg,#022c22,#0f766e)";
  if (normalizedCode === "enterprise") return "linear-gradient(135deg,#3b0764,#7c3aed)";
  return "linear-gradient(135deg,#111827,#2563eb)";
}

function planBadgeLabel(plan) {
  const normalizedCode = String(plan?.code || "").trim().toLowerCase();
  if (normalizedCode === "start") return "Essentials";
  if (normalizedCode === "business") return "Operational";
  if (normalizedCode === "enterprise") return "Full Custom";
  return "Plan";
}

function planPriceCopy(plan) {
  const price = Number(plan?.price_monthly || 0);
  if (String(plan?.pricing_model || "flat").trim().toLowerCase() === "per_user") {
    return `${price} EUR / utilizator / luna`;
  }
  return `${price} EUR / luna`;
}

function planSeatCopy(plan) {
  const seatLimit = Number(plan?.max_users || 0);
  if (!seatLimit) return "Numar de utilizatori configurabil";
  return `${seatLimit} utilizator${seatLimit === 1 ? "" : "i"} inclus${seatLimit === 1 ? "" : "i"}`;
}

function planModuleCopy(plan) {
  const companyLimit = Number(plan?.max_active_modules || 0);
  const perUserLimit = Number(plan?.max_modules_per_user || 0);
  const moduleCount = parsePlanModules(plan).length;
  if (companyLimit > 0) {
    return `Dashboard inclus, plus pana la ${companyLimit} module operationale active`;
  }
  if (perUserLimit > 0) {
    return `Maximum ${perUserLimit} module operationale pe utilizator`;
  }
  if (moduleCount > 0) {
    return `${moduleCount} module incluse in pachet`;
  }
  return "Acces complet la toate modulele operationale si administrative";
}

export function renderPlanCards(plans, { selectedPlanId = 0, allowSelection = true } = {}) {
  return plans.map((plan, index) => {
    const features = parsePlanFeatures(plan);
    const imagePath = escapeHtml(plan.image_path || "");
    const selected = allowSelection && (
      Number(selectedPlanId || 0) === Number(plan.id || 0) || (!selectedPlanId && index === 0)
    );
    const rootTag = allowSelection ? "label" : "article";
    const tagline = String(plan?.tagline || "").trim() || planModuleCopy(plan);
    const description = String(plan?.description || "").trim() || "Pachet configurat direct in MiniCRM, cu module si acces adaptate pe business.";
    const featureItems = (features.length ? features : [
      planSeatCopy(plan),
      planModuleCopy(plan),
      planPriceCopy(plan)
    ]).map((feature) => `<span class="pricing-feature">${escapeHtml(feature)}</span>`).join("");

    return `
      <${rootTag} class="pricing-card ${selected ? "selected" : ""}" style="--plan-accent:${planAccent(plan.code)}">
        ${allowSelection ? `<input class="pricing-radio" type="radio" name="plan_id" value="${plan.id}" ${selected ? "checked" : ""}>` : ""}
        <div class="pricing-media-wrap">
          ${imagePath ? `<img class="pricing-media" src="${imagePath}" alt="${escapeHtml(plan.name || "Plan")}">` : `<div class="pricing-media pricing-media-placeholder"></div>`}
          <div class="pricing-chip">${escapeHtml(planBadgeLabel(plan))}</div>
        </div>
        <div class="pricing-body">
          <div class="pricing-heading">
            <div>
              <div class="pricing-title">${escapeHtml(plan.name || "")}</div>
              <div class="pricing-tagline">${escapeHtml(tagline)}</div>
            </div>
            <div class="pricing-price">${escapeHtml(planPriceCopy(plan))}</div>
          </div>
          <div class="pricing-meta">
            <span>${escapeHtml(planSeatCopy(plan))}</span>
            <span>${escapeHtml(planModuleCopy(plan))}</span>
          </div>
          <div class="pricing-description">${escapeHtml(description)}</div>
          <div class="pricing-feature-list">
            ${featureItems}
          </div>
          <div class="pricing-footnotes">
            <div><strong>Suport inclus:</strong> ${escapeHtml(plan.support_copy || "Da, pentru modulele active.")}</div>
            <div><strong>Dezvoltare extra:</strong> ${escapeHtml(plan.extra_dev_copy || "Se estimeaza separat.")}</div>
          </div>
        </div>
      </${rootTag}>
    `;
  }).join("");
}
