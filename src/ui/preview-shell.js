import fs from "fs";
import path from "path";
import { renderErpSidebar } from "./erp-sidebar.js";

const sidebar = renderErpSidebar({
  currentPath: "/nexora-dashboard",
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
          <div class="nx-page-eyebrow">Dashboard</div>
          <div class="nx-page-title">Bună ziua, Valentin 👋</div>
        </div>

        <div class="nx-search">
          <input placeholder="Caută în ERP: clienți, facturi, produse, documente..." />
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/nexora/facturi">Facturi</a>
          <a class="nx-btn primary" href="/nexora/clients/new">Client nou</a>
          <form method="post" action="/logout" class="nx-logout-form">
            <button class="nx-btn nx-logout-btn" type="submit">Logout</button>
          </form>
        </div>
      </header>

      <section class="nx-kpi-grid">
        <div class="nx-kpi-card">
          <div class="nx-kpi-icon purple">↗</div>
          <div>
            <div class="nx-kpi-label">Venituri totale</div>
            <div class="nx-kpi-value">1.250.430 <span>RON</span></div>
            <div class="nx-kpi-trend up">↑ 12.5% față de luna trecută</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon green">₿</div>
          <div>
            <div class="nx-kpi-label">Profit net</div>
            <div class="nx-kpi-value">312.670 <span>RON</span></div>
            <div class="nx-kpi-trend up">↑ 8.7% față de luna trecută</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon blue">▣</div>
          <div>
            <div class="nx-kpi-label">Facturi emise</div>
            <div class="nx-kpi-value">124</div>
            <div class="nx-kpi-trend up">↑ 15.3% față de luna trecută</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon orange">▤</div>
          <div>
            <div class="nx-kpi-label">Comenzi în curs</div>
            <div class="nx-kpi-value">78</div>
            <div class="nx-kpi-trend warn">↑ 5.2% față de luna trecută</div>
          </div>
        </div>

        <div class="nx-kpi-card">
          <div class="nx-kpi-icon red">!</div>
          <div>
            <div class="nx-kpi-label">Stocuri alerte</div>
            <div class="nx-kpi-value">23</div>
            <div class="nx-kpi-trend down">↓ 3 față de luna trecută</div>
          </div>
        </div>
      </section>

      <section class="nx-dashboard-grid">
        <div class="nx-panel large">
          <div class="nx-panel-head">
            <h2>Evoluție venituri</h2>
            <span>Primele 6 luni</span>
          </div>
          <div class="nx-chart-line">
            <div class="nx-chart-grid"></div>
            <svg viewBox="0 0 600 220" preserveAspectRatio="none">
              <polyline points="0,180 120,145 240,118 360,92 480,58 600,28" fill="none" stroke="currentColor" stroke-width="5" />
              <circle cx="0" cy="180" r="7"></circle>
              <circle cx="120" cy="145" r="7"></circle>
              <circle cx="240" cy="118" r="7"></circle>
              <circle cx="360" cy="92" r="7"></circle>
              <circle cx="480" cy="58" r="7"></circle>
              <circle cx="600" cy="28" r="7"></circle>
            </svg>
          </div>
        </div>

        <div class="nx-panel">
          <div class="nx-panel-head">
            <h2>Activități recente</h2>
            <span>Live</span>
          </div>

          <div class="nx-activity-list">
            <div class="nx-activity"><b>Factură FCT-2026-1250 emisă</b><span>Client: ABC SRL · acum 5m</span></div>
            <div class="nx-activity"><b>Comandă CO-2026-0987 confirmată</b><span>Client: Mega Store · acum 25m</span></div>
            <div class="nx-activity"><b>Plată încasată 15.000 RON</b><span>Client: ABC SRL · acum 1h</span></div>
            <div class="nx-activity"><b>Recepție marfă RCP-2026-054</b><span>Furnizor: Office SRL · acum 2h</span></div>
          </div>
        </div>

        <div class="nx-panel">
          <div class="nx-panel-head">
            <h2>Scurtături rapide</h2>
            <span>Acțiuni</span>
          </div>

          <div class="nx-shortcuts">
            <a href="/nexora/facturi/new">Factură nouă</a>
            <a href="/nexora/quotes">Ofertă nouă</a>
            <a href="/nexora/clients/new">Client nou</a>
            <a href="/nexora/products">Produs nou</a>
            <a href="/nexora/employees">Angajat nou</a>
            <a href="/nexora/reports">Dashboard BI</a>
          </div>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;

const outputPath = path.join(process.cwd(), "public", "nexora-preview.html");
fs.writeFileSync(outputPath, html.replace(/[ \t]+$/gm, ""));

console.log(`Preview generated: ${outputPath}`);
