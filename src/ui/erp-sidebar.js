import { ERP_MODULES } from "../config/erp-modules.js";

const ICONS = {
  home: "⌂",
  "file-text": "▣",
  "trending-up": "↗",
  users: "◉",
  box: "□",
  "shopping-cart": "▤",
  "id-card": "☷",
  settings: "⚙",
  truck: "▱",
  folder: "▥",
  "bar-chart": "▦",
  "clipboard-list": "☑",
  files: "▧",
  workflow: "⟲",
  store: "▨",
  sliders: "⚙"
};

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
    const hasChildren = Array.isArray(module.children) && module.children.length > 0;
    const icon = ICONS[module.icon] || "•";

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
      <div class="nx-module ${isActive ? "active open" : ""}">
        <button class="nx-module-main" type="button" data-nx-toggle>
          <span class="nx-module-icon">${escapeHtml(icon)}</span>
          <span class="nx-module-label">${escapeHtml(module.label)}</span>
          ${hasChildren ? `<span class="nx-module-chevron">⌄</span>` : ""}
        </button>

        ${hasChildren ? `
          <div class="nx-submenu">
            <a class="nx-subitem nx-module-entry ${isActivePath(currentPath, module.path) ? "active" : ""}" href="${escapeHtml(module.path)}">
              <span>Deschide modulul</span>
            </a>
            ${childrenHtml}
          </div>
        ` : ""}
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

      <script>
        document.addEventListener("click", function(event) {
          const toggle = event.target.closest("[data-nx-toggle]");
          if (!toggle) return;

          const item = toggle.closest(".nx-module");
          if (!item) return;

          const wasOpen = item.classList.contains("open");

          document.querySelectorAll(".nx-module.open, .nx-module.active").forEach(function(openItem) {
            if (openItem !== item) {
              openItem.classList.remove("open");
              openItem.classList.remove("active");
            }
          });

          item.classList.toggle("open", !wasOpen);
          item.classList.toggle("active", !wasOpen);
        });
      </script>
    </aside>
  `;
}

export {
  renderErpSidebar
};
