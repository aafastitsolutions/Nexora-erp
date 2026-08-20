import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtInt(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("ro-RO") : "0";
}

function fmtBytes(value = 0) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value || 0);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toLocaleString("ro-RO", { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

function dateLabel(value = "") {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 19).replace("T", " ");
  return date.toLocaleString("ro-RO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function planLabel(row = {}) {
  const plan = String(row.plan_code || "trial").toLowerCase();
  const status = String(row.subscription_status || "trial").toLowerCase();
  if (String(row.role || "").toLowerCase() === "admin") return "Admin QR-Lab";
  if (plan === "free_unlimited") return "Gratuit nelimitat";
  if (plan === "monthly") return status === "active" ? "Lunar activ" : "Lunar";
  if (plan === "annual") return status === "active" ? "Anual activ" : "Anual";
  if (status === "inactive") return "Inactiv";
  return "Trial";
}

function statusTone(row = {}) {
  const status = String(row.subscription_status || "").toLowerCase();
  const plan = String(row.plan_code || "").toLowerCase();
  if (String(row.role || "").toLowerCase() === "admin" || plan === "free_unlimited") return "success";
  if (status === "active") return "success";
  if (status === "trial") return "warn";
  return "danger";
}

function badge(label = "", tone = "neutral") {
  return `<span class="qrlab-badge ${escapeHtml(tone)}">${escapeHtml(label || "-")}</span>`;
}

function endLabel(row = {}) {
  if (String(row.plan_code || "").toLowerCase() === "free_unlimited") return "nelimitat";
  if (String(row.role || "").toLowerCase() === "admin") return "nelimitat";
  return dateLabel(row.subscription_period_end || row.trial_ends_at);
}

function navTabs(activePath = "/nexora/qr-lab") {
  const tabs = [
    ["Dashboard", "/nexora/qr-lab"],
    ["Utilizatori", "/nexora/qr-lab/users"],
    ["Granturi gratuite", "/nexora/qr-lab/grants"],
    ["Statistici", "/nexora/qr-lab/stats"]
  ];
  return `
    <nav class="nx-module-tabs qrlab-tabs">
      ${tabs.map(([label, path]) => `<a href="${escapeHtml(path)}" class="${activePath === path ? "active" : ""}">${escapeHtml(label)}</a>`).join("")}
    </nav>
  `;
}

function qrlabStyles() {
  return `
    <style>
      .qrlab-shell {
        --qrlab-blue: #0787d8;
        --qrlab-teal: #14b8a6;
        --qrlab-line: #cfe8fa;
      }

      .qrlab-shell .nx-content-card,
      .qrlab-shell .nx-kpi-card {
        border-color: var(--qrlab-line);
        border-radius: 8px;
        box-shadow: 0 10px 28px rgba(7, 135, 216, .08);
      }

      .qrlab-hero {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: center;
        margin-bottom: 14px;
        padding: 16px;
        border: 1px solid var(--qrlab-line);
        border-radius: 8px;
        background: linear-gradient(135deg, #f8fcff, #eefaff);
      }

      .qrlab-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .qrlab-mark {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        color: #fff;
        background: linear-gradient(135deg, var(--qrlab-blue), var(--qrlab-teal));
        font-weight: 900;
        font-size: 22px;
      }

      .qrlab-hero h1 {
        margin: 0;
        font-size: 24px;
      }

      .qrlab-hero p {
        margin: 4px 0 0;
        color: #64748b;
      }

      .qrlab-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .qrlab-tabs {
        margin-bottom: 14px;
      }

      .qrlab-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 14px;
      }

      .qrlab-kpi {
        border: 1px solid var(--qrlab-line);
        border-radius: 8px;
        background: #fff;
        padding: 14px;
      }

      .qrlab-kpi span {
        display: block;
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      .qrlab-kpi strong {
        display: block;
        margin-top: 4px;
        font-size: 24px;
      }

      .qrlab-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(360px, .8fr);
        gap: 14px;
      }

      .qrlab-two-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 14px;
      }

      .qrlab-wide-grid {
        display: grid;
        gap: 14px;
      }

      .qrlab-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid #dbeafe;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .qrlab-badge.success {
        border-color: #bbf7d0;
        background: #f0fdf4;
        color: #166534;
      }

      .qrlab-badge.warn {
        border-color: #fde68a;
        background: #fffbeb;
        color: #92400e;
      }

      .qrlab-badge.danger {
        border-color: #fecaca;
        background: #fff1f2;
        color: #991b1b;
      }

      .qrlab-table {
        width: 100%;
        border-collapse: collapse;
      }

      .qrlab-table th,
      .qrlab-table td {
        padding: 10px;
        border-bottom: 1px solid #e2edf6;
        text-align: left;
        vertical-align: top;
      }

      .qrlab-table th {
        color: #475569;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .02em;
      }

      .qrlab-sub {
        margin-top: 4px;
        color: #64748b;
        font-size: 12px;
      }

      .qrlab-grant-form {
        display: grid;
        gap: 6px;
        min-width: 260px;
      }

      .qrlab-grant-form select,
      .qrlab-grant-form input {
        width: 100%;
        border: 1px solid #cfe8fa;
        border-radius: 8px;
        padding: 8px 10px;
      }

      .qrlab-mini-list {
        display: grid;
        gap: 10px;
      }

      .qrlab-mini-item {
        padding: 10px;
        border: 1px solid #e2edf6;
        border-radius: 8px;
        background: #f8fcff;
      }

      .qrlab-stat-list {
        display: grid;
        gap: 10px;
      }

      .qrlab-stat-row {
        display: grid;
        grid-template-columns: minmax(160px, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 10px;
        border: 1px solid #e2edf6;
        border-radius: 8px;
        background: #fbfdff;
      }

      .qrlab-meter {
        height: 8px;
        margin-top: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e2edf6;
      }

      .qrlab-meter span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--qrlab-blue), var(--qrlab-teal));
      }

      .qrlab-alert {
        margin-bottom: 12px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        background: #eff6ff;
        padding: 10px 12px;
        color: #1e3a8a;
        font-weight: 700;
      }

      .qrlab-alert.err {
        border-color: #fecaca;
        background: #fff1f2;
        color: #991b1b;
      }

      @media (max-width: 1100px) {
        .qrlab-kpis,
        .qrlab-grid,
        .qrlab-two-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}

function alerts(ok = "", err = "") {
  if (ok) return `<div class="qrlab-alert">Actualizare salvată.</div>`;
  if (err) return `<div class="qrlab-alert err">${escapeHtml(err)}</div>`;
  return "";
}

function grantForm(row = {}, currentPath = "/nexora/qr-lab/users") {
  return `
    <form class="qrlab-grant-form" method="post" action="/nexora/qr-lab/users/${escapeHtml(row.id)}/grant">
      <input type="hidden" name="return_to" value="${escapeHtml(currentPath)}">
      <select name="grant_type" aria-label="Alege grant">
        <option value="free_1_month">Plan gratuit 1 lună</option>
        <option value="free_12_months">Plan gratuit 12 luni</option>
        <option value="free_unlimited">Plan gratuit nelimitat</option>
        <option value="trial_14">Resetează trial 14 zile</option>
        <option value="revoke">Revocă acces plătit</option>
      </select>
      <input name="note" placeholder="Notă internă, opțional">
      <button class="nx-btn primary" type="submit">Aplică plan</button>
    </form>
  `;
}

function usersTable(rows = [], currentPath = "/nexora/qr-lab/users") {
  if (!rows.length) {
    return `<div class="nx-empty-state">Nu există utilizatori QR-Lab.</div>`;
  }
  return `
    <div class="nx-table-wrap">
      <table class="qrlab-table">
        <thead>
          <tr>
            <th>Utilizator</th>
            <th>Plan</th>
            <th>Utilizare</th>
            <th>Fișiere</th>
            <th>Grant rapid</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.email)}</strong>
                <div class="qrlab-sub">ID ${escapeHtml(row.id)} · creat ${dateLabel(row.created_at)}</div>
                ${row.stripe_subscription_id ? `<div class="qrlab-sub">Stripe: ${escapeHtml(row.stripe_subscription_id)}</div>` : ""}
              </td>
              <td>
                ${badge(planLabel(row), statusTone(row))}
                <div class="qrlab-sub">status: ${escapeHtml(row.subscription_status || "-")}</div>
                <div class="qrlab-sub">până la: ${escapeHtml(endLabel(row))}</div>
              </td>
              <td>
                <strong>${fmtInt(row.qr_count)} QR</strong>
                <div class="qrlab-sub">${fmtInt(row.card_count)} cărți · ${fmtInt(row.scan_count)} scanări</div>
              </td>
              <td>
                <strong>${fmtInt(row.file_count)}</strong>
                <div class="qrlab-sub">${fmtBytes(row.file_bytes)}</div>
              </td>
              <td>${grantForm(row, currentPath)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function grantsList(rows = []) {
  if (!rows.length) return `<div class="nx-empty-state">Nu există granturi aplicate din Nexora încă.</div>`;
  return `
    <div class="qrlab-mini-list">
      ${rows.map((row) => `
        <div class="qrlab-mini-item">
          <strong>${escapeHtml(row.email || `User #${row.qrlab_user_id}`)}</strong>
          <div class="qrlab-sub">${escapeHtml(row.grant_type)} · ${escapeHtml(row.plan_code)} · ${escapeHtml(row.subscription_status)}</div>
          <div class="qrlab-sub">până la: ${escapeHtml(row.subscription_period_end || "nelimitat")} · ${dateLabel(row.created_at)}</div>
          ${row.note ? `<div class="qrlab-sub">Notă: ${escapeHtml(row.note)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function topUsersByUsage(users = [], limit = 8) {
  return [...users]
    .sort((a, b) =>
      Number(b.scan_count || 0) - Number(a.scan_count || 0) ||
      Number(b.qr_count || 0) - Number(a.qr_count || 0) ||
      Number(b.file_bytes || 0) - Number(a.file_bytes || 0)
    )
    .slice(0, limit);
}

function recentUsers(users = [], limit = 8) {
  return [...users]
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .slice(0, limit);
}

function compactUsersTable(rows = []) {
  if (!rows.length) return `<div class="nx-empty-state">Nu există utilizatori QR-Lab.</div>`;
  return `
    <div class="nx-table-wrap">
      <table class="qrlab-table">
        <thead>
          <tr>
            <th>Utilizator</th>
            <th>Plan</th>
            <th>QR</th>
            <th>Scanări</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.email)}</strong>
                <div class="qrlab-sub">ID ${escapeHtml(row.id)} · ${dateLabel(row.created_at)}</div>
              </td>
              <td>${badge(planLabel(row), statusTone(row))}</td>
              <td>${fmtInt(row.qr_count)}</td>
              <td>${fmtInt(row.scan_count)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function grantUsersTable(rows = [], currentPath = "/nexora/qr-lab/grants") {
  if (!rows.length) return `<div class="nx-empty-state">Nu există utilizatori QR-Lab.</div>`;
  return `
    <div class="nx-table-wrap">
      <table class="qrlab-table">
        <thead>
          <tr>
            <th>Utilizator</th>
            <th>Plan curent</th>
            <th>Grant</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.email)}</strong>
                <div class="qrlab-sub">ID ${escapeHtml(row.id)}</div>
              </td>
              <td>
                ${badge(planLabel(row), statusTone(row))}
                <div class="qrlab-sub">${escapeHtml(endLabel(row))}</div>
              </td>
              <td>${grantForm(row, currentPath)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function planDistribution(users = []) {
  if (!users.length) return `<div class="nx-empty-state">Nu există date.</div>`;
  const counts = new Map();
  users.forEach((user) => {
    const label = planLabel(user);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const total = Math.max(users.length, 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return `
    <div class="qrlab-stat-list">
      ${rows.map(([label, count]) => {
        const pct = Math.round((count / total) * 100);
        return `
          <div class="qrlab-stat-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <div class="qrlab-meter"><span style="width:${pct}%"></span></div>
            </div>
            <strong>${fmtInt(count)}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function usageStatsList(users = []) {
  const rows = topUsersByUsage(users, 10);
  if (!rows.length) return `<div class="nx-empty-state">Nu există date.</div>`;
  return `
    <div class="nx-table-wrap">
      <table class="qrlab-table">
        <thead>
          <tr>
            <th>Utilizator</th>
            <th>QR</th>
            <th>Cărți</th>
            <th>Scanări</th>
            <th>Fișiere</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.email)}</strong>
                <div class="qrlab-sub">${escapeHtml(planLabel(row))}</div>
              </td>
              <td>${fmtInt(row.qr_count)}</td>
              <td>${fmtInt(row.card_count)}</td>
              <td>${fmtInt(row.scan_count)}</td>
              <td>${fmtInt(row.file_count)} · ${fmtBytes(row.file_bytes)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function kpis(stats = {}) {
  return `
    <section class="qrlab-kpis">
      <div class="qrlab-kpi"><span>Utilizatori</span><strong>${fmtInt(stats.users_total)}</strong></div>
      <div class="qrlab-kpi"><span>Active / gratuite</span><strong>${fmtInt(stats.active_users)}</strong></div>
      <div class="qrlab-kpi"><span>QR-uri generate</span><strong>${fmtInt(stats.qr_total)}</strong></div>
      <div class="qrlab-kpi"><span>Scanări totale</span><strong>${fmtInt(stats.scan_total)}</strong></div>
    </section>
  `;
}

function hero() {
  return `
    <section class="qrlab-hero">
      <div class="qrlab-brand">
        <div class="qrlab-mark">Q</div>
        <div>
          <h1>QR-Lab Admin</h1>
          <p>Control pentru utilizatori, planuri și usage QR-Lab.</p>
        </div>
      </div>
      <div class="qrlab-actions">
        <a class="nx-btn" href="https://qr-lab.ro" target="_blank" rel="noreferrer">Deschide QR-Lab</a>
        <a class="nx-btn" href="/nexora/qr-lab/users">Utilizatori</a>
      </div>
    </section>
  `;
}

function renderDashboardTab({ users = [], grants = [], stats = {}, dbPath = "" }) {
  return `
    ${hero()}
    ${kpis(stats)}
    <div class="qrlab-grid">
      <section class="nx-content-card">
        <div class="nx-card-header">
          <div>
            <div class="nx-card-title">Activitate recentă</div>
            <div class="nx-card-subtitle">Ultimele conturi create și usage-ul lor curent.</div>
          </div>
        </div>
        ${compactUsersTable(recentUsers(users, 8))}
      </section>

      <aside class="nx-content-card">
        <div class="nx-card-header">
          <div>
            <div class="nx-card-title">Ultimele granturi</div>
            <div class="nx-card-subtitle">Rezumat rapid din Nexora.</div>
          </div>
        </div>
        ${grantsList(grants.slice(0, 8))}
        <div class="qrlab-sub" style="margin-top:12px">Sursă QR-Lab: ${escapeHtml(dbPath || "-")}</div>
      </aside>
    </div>
  `;
}

function renderUsersTab({ users = [], stats = {}, currentPath = "/nexora/qr-lab/users" }) {
  return `
    ${kpis(stats)}
    <section class="nx-content-card">
      <div class="nx-card-header">
        <div>
          <div class="nx-card-title">Utilizatori QR-Lab</div>
          <div class="nx-card-subtitle">Plan curent, status, usage și grant rapid.</div>
        </div>
      </div>
      ${usersTable(users, currentPath)}
    </section>
  `;
}

function renderGrantsTab({ users = [], grants = [], currentPath = "/nexora/qr-lab/grants" }) {
  return `
    <div class="qrlab-grid">
      <section class="nx-content-card">
        <div class="nx-card-header">
          <div>
            <div class="nx-card-title">Acordare plan gratuit</div>
            <div class="nx-card-subtitle">Alege utilizatorul și durata grantului.</div>
          </div>
        </div>
        ${grantUsersTable(users, currentPath)}
      </section>

      <aside class="nx-content-card">
        <div class="nx-card-header">
          <div>
            <div class="nx-card-title">Istoric granturi</div>
            <div class="nx-card-subtitle">Auditul granturilor aplicate din Nexora.</div>
          </div>
        </div>
        ${grantsList(grants)}
      </aside>
    </div>
  `;
}

function renderStatsTab({ users = [], stats = {}, dbPath = "" }) {
  return `
    ${kpis(stats)}
    <div class="qrlab-two-grid">
      <section class="nx-content-card">
        <div class="nx-card-header">
          <div>
            <div class="nx-card-title">Distribuție planuri</div>
            <div class="nx-card-subtitle">Utilizatori grupați după planul curent.</div>
          </div>
        </div>
        ${planDistribution(users)}
      </section>

      <section class="nx-content-card">
        <div class="nx-card-header">
          <div>
            <div class="nx-card-title">Stocare și fișiere</div>
            <div class="nx-card-subtitle">Totaluri agregate din QR-Lab.</div>
          </div>
        </div>
        <div class="qrlab-stat-list">
          <div class="qrlab-stat-row"><strong>Fișiere</strong><strong>${fmtInt(stats.file_total)}</strong></div>
          <div class="qrlab-stat-row"><strong>Stocare</strong><strong>${fmtBytes(stats.file_bytes)}</strong></div>
          <div class="qrlab-stat-row"><strong>Cărți de vizită</strong><strong>${fmtInt(stats.card_total)}</strong></div>
          <div class="qrlab-stat-row"><strong>Trialuri</strong><strong>${fmtInt(stats.trial_users)}</strong></div>
          <div class="qrlab-stat-row"><strong>Granturi nelimitate</strong><strong>${fmtInt(stats.unlimited_users)}</strong></div>
        </div>
        <div class="qrlab-sub" style="margin-top:12px">Sursă QR-Lab: ${escapeHtml(dbPath || "-")}</div>
      </section>
    </div>

    <section class="nx-content-card" style="margin-top:14px">
      <div class="nx-card-header">
        <div>
          <div class="nx-card-title">Top utilizatori după usage</div>
          <div class="nx-card-subtitle">Sortare după scanări, coduri și stocare.</div>
        </div>
      </div>
      ${usageStatsList(users)}
    </section>
  `;
}

function renderQrlabPage(options = {}) {
  const currentPath = options.currentPath || "/nexora/qr-lab";
  const stats = options.stats || {};
  const users = options.users || [];
  const grants = options.grants || [];
  const tabContent = currentPath === "/nexora/qr-lab/users"
    ? renderUsersTab({ users, stats, currentPath })
    : currentPath === "/nexora/qr-lab/grants"
      ? renderGrantsTab({ users, grants, currentPath })
      : currentPath === "/nexora/qr-lab/stats"
        ? renderStatsTab({ users, stats, dbPath: options.dbPath })
        : renderDashboardTab({ users, grants, stats, dbPath: options.dbPath });
  const body = `
    <div class="qrlab-shell">
      ${qrlabStyles()}
      ${navTabs(currentPath)}
      ${alerts(options.ok, options.err)}
      ${tabContent}
    </div>
  `;

  return renderNexoraShell({
    title: "QR-Lab Admin",
    appName: "Nexora ERP",
    companyName: options.companyName || "Workspace",
    user: options.user,
    currentPath,
    eyebrow: "QR-Lab",
    pageTitle: "QR-Lab Admin",
    body
  });
}

export {
  renderQrlabPage
};
