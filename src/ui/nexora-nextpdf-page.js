import { renderNexoraShell } from "./nexora-shell.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateLabel(value = "") {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })
    : String(value);
}

function moneyMinor(value = 0, currency = "RON") {
  return `${(Number(value || 0) / 100).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${String(currency || "RON").toUpperCase()}`;
}

function badge(label = "", tone = "neutral") {
  return `<span class="np-badge ${escapeHtml(tone)}">${escapeHtml(label || "—")}</span>`;
}

function planBadge(user = {}) {
  if (user.disabled) return badge("Dezactivat", "danger");
  if (user.plan === "admin") return badge("Admin", "blue");
  if (user.plan === "premium_monthly") return badge("Premium lunar", "success");
  if (user.plan === "premium_annual") return badge("Premium anual", "success");
  return badge("Free", "neutral");
}

function alertHtml(options = {}) {
  if (options.error) return `<div class="nx-alert danger">${escapeHtml(options.error)}</div>`;
  if (options.temporaryPassword) {
    return `<div class="nx-alert warn np-temp-password"><div><b>Parolă temporară generată</b><br><code id="np-temp-password">${escapeHtml(options.temporaryPassword)}</code><br><small>Copiaz-o acum și transmite-o clientului printr-un canal sigur. Nu va mai fi afișată.</small></div><button class="nx-btn" type="button" onclick="navigator.clipboard.writeText(document.getElementById('np-temp-password').textContent)">Copiază</button></div>`;
  }
  const messages = {
    sessions_revoked: "Sesiunile utilizatorului au fost revocate.",
    user_disabled: "Contul NextPDF a fost dezactivat și sesiunile au fost închise.",
    user_enabled: "Contul NextPDF a fost reactivat.",
    subscription_cancellation_scheduled: "Anularea abonamentului Stripe a fost programată la sfârșitul perioadei plătite.",
    password_reset: "Parola a fost resetată.",
    payments_synced: "Plățile NextPDF au fost sincronizate din Stripe."
  };
  return options.ok ? `<div class="nx-alert success">${escapeHtml(messages[options.ok] || "Operațiunea a fost finalizată.")}</div>` : "";
}

function cancellationAction(user = {}) {
  if (!user.subscriptionId) return "";
  if (user.cancelAtPeriodEnd) return `<button class="nx-btn" type="button" disabled>Anulare programată</button>`;
  if (!["active", "trialing", "past_due", "unpaid"].includes(String(user.subscriptionStatus || ""))) return "";
  const intervalLabel = user.plan === "premium_annual" ? "anual" : "lunar";
  const periodEnd = dateLabel(user.currentPeriodEnd);
  const confirmation = `Abonamentul ${intervalLabel} rămâne activ până la ${periodEnd}, apoi nu se mai reînnoiește și Stripe nu va mai face debitări recurente. Programezi anularea?`;
  return `<form method="post" action="/nexora/super-admin/nextpdf/users/${escapeHtml(user.id)}/cancel-subscription" onsubmit="return confirm(${escapeHtml(JSON.stringify(confirmation))})"><button class="nx-btn danger" type="submit">Anulează abonamentul</button></form>`;
}

function renderUsers(users = []) {
  if (!users.length) return `<div class="nx-empty-state">Nu există încă utilizatori NextPDF sau serviciul nu a furnizat date.</div>`;
  return `<div class="nx-table-wrap"><table class="np-table"><thead><tr><th>Utilizator</th><th>Plan / status</th><th>Activitate</th><th>Stripe</th><th>Acțiuni</th></tr></thead><tbody>${users.map((user) => `
    <tr data-user-row data-search="${escapeHtml(`${user.email} ${user.plan} ${user.subscriptionStatus}`.toLowerCase())}">
      <td><b>${escapeHtml(user.email)}</b><div class="np-sub">#${escapeHtml(user.id)} · creat ${escapeHtml(dateLabel(user.createdAt))}</div></td>
      <td>${planBadge(user)}<div class="np-sub">${escapeHtml(user.subscriptionStatus || "free")}${user.cancelAtPeriodEnd ? " · anulare programată" : ""}</div></td>
      <td><b>${escapeHtml(user.activeSessions || 0)} sesiuni</b><div class="np-sub">Ultima utilizare: ${escapeHtml(dateLabel(user.lastSeenAt))}</div><div class="np-sub">Ultimul login: ${escapeHtml(dateLabel(user.lastLoginAt))}</div></td>
      <td><div>${escapeHtml(user.stripeCustomerId || "—")}</div><div class="np-sub">${escapeHtml(user.subscriptionId || "fără abonament")}</div></td>
      <td><div class="np-actions">
        <form method="post" action="/nexora/super-admin/nextpdf/users/${escapeHtml(user.id)}/reset-password" onsubmit="return confirm('Resetezi parola și închizi toate sesiunile?')"><button class="nx-btn" type="submit">Reset parolă</button></form>
        <form method="post" action="/nexora/super-admin/nextpdf/users/${escapeHtml(user.id)}/revoke-sessions"><button class="nx-btn" type="submit">Închide sesiuni</button></form>
        ${cancellationAction(user)}
        <form method="post" action="/nexora/super-admin/nextpdf/users/${escapeHtml(user.id)}/status"><input type="hidden" name="disabled" value="${user.disabled ? "0" : "1"}"><button class="nx-btn ${user.disabled ? "primary" : "danger"}" type="submit">${user.disabled ? "Reactivează" : "Dezactivează"}</button></form>
      </div></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function renderPayments(payments = []) {
  if (!payments.length) return `<div class="nx-empty-state">Nicio plată NextPDF înregistrată încă.</div>`;
  return `<div class="nx-table-wrap"><table class="np-table"><thead><tr><th>Data</th><th>Client</th><th>Sumă</th><th>Status</th><th>Stripe</th><th>Mediu</th></tr></thead><tbody>${payments.map((payment) => `
    <tr>
      <td>${escapeHtml(dateLabel(payment.paidAt || payment.createdAt))}</td>
      <td><b>${escapeHtml(payment.payerName || payment.accountEmail || "—")}</b><div class="np-sub">${escapeHtml(payment.payerEmail || payment.accountEmail || "")}</div></td>
      <td><b>${escapeHtml(moneyMinor(payment.amountMinor, payment.currency))}</b></td>
      <td>${badge(payment.status, payment.status === "paid" ? "success" : payment.status === "failed" ? "danger" : "warn")}</td>
      <td>${escapeHtml(payment.stripeInvoiceId || payment.stripePaymentIntentId || "—")}<div class="np-sub">${escapeHtml(payment.eventType || "")}</div></td>
      <td>${badge(payment.livemode ? "LIVE" : "TEST", payment.livemode ? "success" : "warn")}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function styles() {
  return `<style>
    .np-page{--np:#1598da;display:grid;gap:14px}.np-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px;border:1px solid #cde7f6;border-radius:10px;background:linear-gradient(135deg,#f8fcff,#edf8ff)}.np-hero h1{margin:0;font-size:24px}.np-hero p,.np-sub{margin:4px 0 0;color:#64748b;font-size:12px}.np-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;background:#1598da;color:#fff;font-weight:900}.np-brand{display:flex;align-items:center;gap:12px}.np-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.np-kpi{padding:14px;border:1px solid #d7e9f4;border-radius:9px;background:#fff}.np-kpi span{display:block;color:#64748b;font-size:12px;font-weight:700}.np-kpi strong{display:block;margin-top:5px;font-size:22px}.np-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.np-toolbar input{min-width:280px;padding:10px 12px;border:1px solid #cbdfea;border-radius:8px}.np-table{width:100%;border-collapse:collapse}.np-table th,.np-table td{padding:11px;border-bottom:1px solid #e4eef4;text-align:left;vertical-align:top;font-size:13px}.np-table th{color:#52677b;font-size:11px;text-transform:uppercase}.np-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#eef2f6;color:#475569;font-size:11px;font-weight:800}.np-badge.success{background:#dcfce7;color:#166534}.np-badge.warn{background:#fef3c7;color:#92400e}.np-badge.danger{background:#fee2e2;color:#991b1b}.np-badge.blue{background:#dbeafe;color:#1d4ed8}.np-actions{display:flex;flex-wrap:wrap;gap:6px}.np-actions form{margin:0}.nx-btn.danger{border-color:#fecaca;color:#b91c1c}.np-temp-password{display:flex;align-items:center;justify-content:space-between;gap:14px}.np-temp-password code{display:inline-block;margin:7px 0;padding:6px 9px;border-radius:6px;background:#fff;font-size:16px}@media(max-width:980px){.np-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.np-hero,.np-toolbar{align-items:stretch;flex-direction:column}.np-toolbar input{width:100%;min-width:0}}@media(max-width:620px){.np-kpis{grid-template-columns:1fr}.np-table{min-width:900px}}
  </style>`;
}

export function renderNextPdfAdminPage(options = {}) {
  const overview = options.overview || {};
  const stats = overview.stats || {};
  const paidTotal = (stats.paidTotals || []).map((row) => moneyMinor(row.amountMinor, row.currency)).join(" / ") || "0,00 RON";
  const body = `<div class="np-page">${styles()}${alertHtml(options)}
    <section class="np-hero"><div class="np-brand"><div class="np-mark">PDF</div><div><h1>NextPDF Admin</h1><p>Utilizatori, licențe, sesiuni, încasări și operațiuni de suport.</p></div></div><div><a class="nx-btn" href="https://apps.microsoft.com/detail/9P04XH5WV3WL" target="_blank" rel="noreferrer">Microsoft Store</a> <a class="nx-btn primary" href="/nexora/super-admin/nextpdf">Actualizează</a></div></section>
    <section class="np-kpis"><div class="np-kpi"><span>Utilizatori</span><strong>${escapeHtml(stats.usersTotal || 0)}</strong></div><div class="np-kpi"><span>Activi în 30 zile</span><strong>${escapeHtml(stats.recentUsers30d || 0)}</strong></div><div class="np-kpi"><span>Premium / admin</span><strong>${escapeHtml(stats.premiumUsers || 0)}</strong></div><div class="np-kpi"><span>Sesiuni valide</span><strong>${escapeHtml(stats.activeSessions || 0)}</strong></div><div class="np-kpi"><span>Încasări confirmate</span><strong>${escapeHtml(paidTotal)}</strong></div></section>
    <section class="nx-content-card"><div class="np-toolbar"><div><h2>Utilizatori NextPDF</h2><div class="np-sub">Statusul licenței și ultima activitate raportată de aplicație.</div></div><input id="np-user-search" type="search" placeholder="Caută email, plan sau status"></div>${renderUsers(overview.users || [])}</section>
    <section class="nx-content-card"><div class="np-toolbar"><div><h2>Plăți NextPDF</h2><div class="np-sub">Evenimente Stripe live și test asociate conturilor NextPDF.</div></div><div class="np-actions"><form method="post" action="/nexora/super-admin/nextpdf/payments/sync"><button class="nx-btn" type="submit">Sincronizează Stripe</button></form><a class="nx-btn" href="/nexora/super-admin/stripe-reconciliation?brand=nextpdf">Reconciliere Stripe</a></div></div>${renderPayments(overview.payments || [])}</section>
    <script>document.getElementById('np-user-search')?.addEventListener('input',function(){const q=this.value.trim().toLowerCase();document.querySelectorAll('[data-user-row]').forEach(function(row){row.hidden=q&&!row.dataset.search.includes(q)})})</script>
  </div>`;
  return renderNexoraShell({ title: "NextPDF Admin", appName: "Nexora ERP", companyName: options.companyName || "Workspace", user: options.user, currentPath: "/nexora/super-admin/nextpdf", eyebrow: "Administrare platformă", pageTitle: "NextPDF", body });
}
