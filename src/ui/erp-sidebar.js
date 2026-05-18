import { ERP_MODULES } from "../config/erp-modules.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isActivePath(currentPath = "", itemPath = "") {
  if (!currentPath || !itemPath) return false;
  if (currentPath === itemPath) return true;
  return itemPath !== "/" && currentPath.startsWith(itemPath + "/");
}

function renderErpSidebar(options = {}) {
  const currentPath = options.currentPath || "/";
  const appName = options.appName || "Nexora";
  const companyName = options.companyName || "Workspace";

  const modulesHtml = ERP_MODULES.map((module) => {
    const hasActiveChild = (module.children || []).some((child) =>
      isActivePath(currentPath, child.path)
    );

    const isActive = isActivePath(currentPath, module.path) || hasActiveChild;

    const childrenHtml = (module.children || [])
      .map((child) => {
        const childActive = isActivePath(currentPath, child.path);

        return `
          <a class="nx-subitem ${childActive ? "active" : ""}" href="${escapeHtml(child.path)}">
            <span>${escapeHtml(child.label)}</span>
          </a>
        `;
      })
      .join("");

    return `
      <div class="nx-module ${isActive ? "active" : ""}">
        <a class="nx-module-main" href="${escapeHtml(module.path)}">
          <span class="nx-module-icon">${escapeHtml(module.icon)}</span>
          <span class="nx-module-label">${escapeHtml(module.label)}</span>
        </a>
        ${childrenHtml ? `<div class="nx-submenu">${childrenHtml}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <aside class="nx-sidebar">
      <div class="nx-brand">
        <div class="nx-brand-mark">N</div>
        <div>
          <div class="nx-brand-title">${escapeHtml(appName)}</div>
          <div class="nx-brand-subtitle">${escapeHtml(companyName)}</div>
        </div>
      </div>

      <nav class="nx-nav">
        ${modulesHtml}
      </nav>
    </aside>
  `;
}

export {
  renderErpSidebar
};
