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
  sliders: "⚙",
  shield: "▰"
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
  const current = String(currentPath || "").split(/[?#]/)[0];
  const item = String(itemPath || "").split(/[?#]/)[0];
  if (!current || !item) return false;
  if (current === item) return true;
  return item !== "/" && current.startsWith(item + "/");
}

function renderErpSidebar(options = {}) {
  const currentPath = options.currentPath || "/";
  const appName = options.appName || "Nexora";
  const companyName = options.companyName || "Workspace";
  const isSuperAdmin = Number(options.isSuperAdmin || 0) === 1;

  const visibleModules = ERP_MODULES.filter((module) => !module.superAdminOnly || isSuperAdmin);

  const modulesHtml = visibleModules.map((module) => {
    const hasActiveChild = (module.children || []).some((child) =>
      isActivePath(currentPath, child.path) ||
      (child.children || []).some((nestedChild) => isActivePath(currentPath, nestedChild.path))
    );

    const isActive = isActivePath(currentPath, module.path) || hasActiveChild;
    const hasChildren = Array.isArray(module.children) && module.children.length > 0;
    const icon = ICONS[module.icon] || "•";

    const childrenHtml = (module.children || [])
      .map((child) => {
        const childActive = isActivePath(currentPath, child.path);

        const hasNestedChildren = Array.isArray(child.children) && child.children.length > 0;
        const hasActiveNestedChild = (child.children || []).some((nestedChild) =>
          isActivePath(currentPath, nestedChild.path)
        );
        const childIsActive = childActive || hasActiveNestedChild;

        const nestedHtml = (child.children || [])
          .map((nestedChild) => {
            const nestedActive = isActivePath(currentPath, nestedChild.path);

            return `
              <a class="nx-subitem nx-subitem-nested ${nestedActive ? "active" : ""}" href="${escapeHtml(nestedChild.path)}">
                <span>${escapeHtml(nestedChild.label)}</span>
              </a>
            `;
          })
          .join("");

        return `
          <div class="nx-subgroup ${childIsActive ? "nx-nested-open" : ""}">
            <a
              class="nx-subitem ${childIsActive ? "active" : ""}"
              href="${hasNestedChildren ? "#" : escapeHtml(child.path)}"
              ${hasNestedChildren ? 'onclick="event.preventDefault(); this.parentElement.classList.toggle(\'nx-nested-open\')"' : ""}
            >
              <span>${escapeHtml(child.label)}</span>
              ${hasNestedChildren ? `<span class="nx-subitem-chevron">⌄</span>` : ""}
            </a>
            ${hasNestedChildren ? nestedHtml : ""}
          </div>
        `;
      })
      .join("");

    return `
      <div class="nx-module ${isActive ? "active open" : ""}">
        ${hasChildren ? `
          <button class="nx-module-main" type="button" data-nx-toggle>
            <span class="nx-module-icon">${escapeHtml(icon)}</span>
            <span class="nx-module-label">${escapeHtml(module.label)}</span>
            <span class="nx-module-chevron">⌄</span>
          </button>
        ` : `
          <a class="nx-module-main" href="${escapeHtml(module.path)}">
            <span class="nx-module-icon">${escapeHtml(icon)}</span>
            <span class="nx-module-label">${escapeHtml(module.label)}</span>
          </a>
        `}

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

          document.querySelectorAll(".nx-module.open").forEach(function(openItem) {
            if (openItem !== item) {
              openItem.classList.remove("open");
            }
          });

          item.classList.toggle("open", !wasOpen);

          if (item.classList.contains("active")) {
            item.classList.add("open");
          }
        });
      </script>
    </aside>
  `;
}

export {
  renderErpSidebar
};
