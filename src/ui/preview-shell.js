import fs from "fs";
import path from "path";
import { renderErpSidebar } from "./erp-sidebar.js";

const sidebar = renderErpSidebar({
  currentPath: "/facturi",
  appName: "Nexora ERP",
  companyName: "A&A Fast IT Solutions"
});

const html = `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP Shell Preview</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div style="font-size:13px;color:#6b7280;font-weight:700;">Dashboard</div>
          <div style="font-size:24px;font-weight:850;">Nexora ERP</div>
        </div>

        <div class="nx-search">
          <input placeholder="Caută clienți, facturi, produse, documente..." />
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/facturi">Facturi</a>
          <a class="nx-btn primary" href="/clients">Client nou</a>
        </div>
      </header>

      <section class="nx-content-card">
        <h1 style="margin:0 0 8px;font-size:28px;">UI Shell Preview</h1>
        <p style="margin:0;color:#6b7280;">
          Acesta este preview-ul noului layout Nexora ERP. Nu afectează încă aplicația live.
        </p>
      </section>
    </main>
  </div>
</body>
</html>`;

const outputPath = path.join(process.cwd(), "public", "nexora-preview.html");
fs.writeFileSync(outputPath, html);

console.log(`Preview generated: ${outputPath}`);
