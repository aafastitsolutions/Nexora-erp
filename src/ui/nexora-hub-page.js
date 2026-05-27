import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNexoraHubPage(options = {}) {
  const companyName = options.companyName || "Workspace";
  const currentPath = options.currentPath || "/nexora-dashboard";
  const title = options.title || "Modul";
  const eyebrow = options.eyebrow || "Nexora ERP";
  const description = options.description || "";
  const stats = Array.isArray(options.stats) ? options.stats : [];
  const links = Array.isArray(options.links) ? options.links : [];
  const panels = Array.isArray(options.panels) ? options.panels : [];

  const statHtml = stats.map((stat, index) => {
    const colors = ["blue", "green", "orange", "purple", "red"];
    return `
      <div class="nx-kpi-card">
        <div class="nx-kpi-icon ${colors[index % colors.length]}">${escapeHtml(stat.icon || String(index + 1))}</div>
        <div>
          <div class="nx-kpi-label">${escapeHtml(stat.label || "")}</div>
          <div class="nx-kpi-value">${escapeHtml(stat.value ?? "-")}</div>
          ${stat.hint ? `<div class="nx-kpi-trend ${escapeHtml(stat.trend || "")}">${escapeHtml(stat.hint)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");

  const linksHtml = links.map((link) => `
    <a href="${escapeHtml(link.href || "#")}">${escapeHtml(link.label || "")}</a>
  `).join("");

  const panelHtml = panels.map((panel) => `
    <section class="nx-panel">
      <div class="nx-panel-head">
        <div>
          <h2>${escapeHtml(panel.title || "")}</h2>
          <span>${escapeHtml(panel.badge || "")}</span>
        </div>
      </div>
      ${panel.html || ""}
    </section>
  `).join("");

  const body = `
    <section class="nx-content-card">
      <div class="nx-section-head">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="nx-form-actions">
          ${links.slice(0, 3).map((link, index) => `<a class="nx-btn ${index === 0 ? "primary" : ""}" href="${escapeHtml(link.href || "#")}">${escapeHtml(link.label || "")}</a>`).join("")}
        </div>
      </div>
    </section>

    ${stats.length ? `<section class="nx-kpi-grid invoice-kpis">${statHtml}</section>` : ""}

    <div class="nx-two-column-grid">
      <section class="nx-panel">
        <div class="nx-panel-head">
          <div>
            <h2>Scurtături</h2>
            <span>${escapeHtml(links.length)} acțiuni</span>
          </div>
        </div>
        <div class="nx-shortcuts">${linksHtml}</div>
      </section>
      ${panelHtml}
    </div>
  `;

  return renderNexoraShell({
    title,
    appName: "Nexora ERP",
    companyName,
    currentPath,
    eyebrow,
    pageTitle: title,
    body
  });
}

export {
  renderNexoraHubPage
};
