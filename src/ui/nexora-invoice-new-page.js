import { renderErpSidebar } from "./erp-sidebar.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNexoraInvoiceNewPage(options = {}) {
  const user = options.user || {};
  const companyName = user.company_name || "Workspace";

  const sidebar = renderErpSidebar({
    currentPath: "/nexora/facturi",
    appName: "Nexora ERP",
    companyName
  });

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexora ERP - Factură nouă</title>
  <link rel="stylesheet" href="/css/nexora-shell.css">
</head>
<body>
  <div class="nx-app-shell">
    ${sidebar}

    <main class="nx-main">
      <header class="nx-topbar">
        <div>
          <div class="nx-page-eyebrow">Financiar / Facturi</div>
          <div class="nx-page-title">Factură nouă</div>
        </div>

        <div class="nx-actions">
          <a class="nx-btn" href="/nexora/facturi">Înapoi la facturi</a>
        </div>
      </header>

      <section class="nx-content-card">
        <div class="nx-section-head">
          <div>
            <h1>Creează factură</h1>
            <p>Introdu CUI-ul sau denumirea clientului. Dacă firma nu există, sistemul încearcă să o creeze folosind date ANAF.</p>
          </div>
        </div>

        <form class="nx-form-card" method="post" action="/facturi">
          <input type="hidden" name="return_to" value="nexora">

          <label class="nx-field nx-autocomplete-field">
            <span>Caută client după CUI sau denumire</span>
            <input id="nx-client-search" name="cui" required placeholder="Ex: 47446760 sau denumirea clientului" autocomplete="off">
            <div id="nx-client-results" class="nx-autocomplete-results"></div>
            <small class="nx-field-hint">Poți scrie și denumirea unui client deja salvat în Nexora.</small>
          </label>

          <div class="nx-client-preview-hint" id="nx-client-preview-hint">
            Introdu CUI-ul și verific automat datele firmei în ANAF sau în clienții salvați.
          </div>

          <div class="nx-alert danger" id="nx-client-preview-error" style="display:none"></div>

          <div class="nx-client-preview-box" id="nx-client-preview-box" style="display:none">
            <div class="nx-client-preview-head">
              <div>
                <strong id="nx-preview-name">—</strong>
                <span id="nx-preview-cui">—</span>
              </div>
              <em id="nx-preview-source">Verificare client</em>
            </div>

            <div class="nx-client-preview-grid">
              <div><span>Adresă</span><b id="nx-preview-address">—</b></div>
              <div><span>Registrul Comerțului</span><b id="nx-preview-regcom">—</b></div>
              <div><span>CAEN</span><b id="nx-preview-caen">—</b></div>
              <div><span>Status</span><b id="nx-preview-status">—</b></div>
            </div>
          </div>

          <label class="nx-field">
            <span>Scadență</span>
            <input name="scadenta" type="date">
          </label>

          <label class="nx-check-field">
            <input type="checkbox" name="aplica_tva" value="1">
            <span>Aplică TVA implicit</span>
          </label>

          <div class="nx-form-actions">
            <button class="nx-btn primary" type="submit">Creează factura</button>
            <a class="nx-btn" href="/nexora/facturi">Renunță</a>
          </div>
        </form>
      </section>
    </main>
  </div>
<script>
(function () {
  const input = document.getElementById("nx-client-search");
  const results = document.getElementById("nx-client-results");
  let timer = null;

  function escapeAttr(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function escapeText(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function clearResults() {
    results.innerHTML = "";
    results.style.display = "none";
  }

  const previewBox = document.getElementById("nx-client-preview-box");
  const previewHint = document.getElementById("nx-client-preview-hint");
  const previewError = document.getElementById("nx-client-preview-error");
  const previewName = document.getElementById("nx-preview-name");
  const previewCui = document.getElementById("nx-preview-cui");
  const previewSource = document.getElementById("nx-preview-source");
  const previewAddress = document.getElementById("nx-preview-address");
  const previewRegcom = document.getElementById("nx-preview-regcom");
  const previewCaen = document.getElementById("nx-preview-caen");
  const previewStatus = document.getElementById("nx-preview-status");

  function showPreview(item, sourceLabel) {
    previewError.style.display = "none";
    previewBox.style.display = "block";
    previewHint.style.display = "none";

    previewName.textContent = item.name || "Client fără nume";
    previewCui.textContent = item.cui ? "CUI " + item.cui : "CUI necunoscut";
    previewSource.textContent = sourceLabel || "Client salvat";
    previewAddress.textContent = item.address || "—";
    previewRegcom.textContent = item.reg_com || item.regCom || "—";
    previewCaen.textContent = item.caen || "—";
    previewStatus.textContent = item.inactive ? "Inactiv" : "Activ";
  }

  function showManualHint() {
    previewBox.style.display = "none";
    previewHint.style.display = "block";
    previewError.style.display = "none";
    previewHint.textContent = "Nu am găsit client salvat. Dacă introduci un CUI valid, sistemul va încerca să creeze clientul folosind ANAF.";
  }

  function renderResults(items) {
    if (!Array.isArray(items) || !items.length) {
      results.innerHTML = '<div class="nx-autocomplete-empty">Niciun client găsit. Poți introduce CUI-ul manual.</div>';
      results.style.display = "block";
      showManualHint();
      return;
    }

    showPreview(items[0], "Client salvat");

    results.innerHTML = items.map(function (item) {
      const name = item.name || "Client fără nume";
      const cui = item.cui || "";
      const address = item.address || "";

      return '<button type="button" class="nx-autocomplete-item" data-cui="' + escapeAttr(cui) + '" data-index="' + items.indexOf(item) + '">' +
        '<strong>' + escapeText(name) + '</strong>' +
        '<span>' + escapeText(cui + (address ? " · " + address : "")) + '</span>' +
      '</button>';
    }).join("");

    window.__nxClientSearchItems = items;
    results.style.display = "block";
  }

  input.addEventListener("input", function () {
    const q = input.value.trim();

    clearTimeout(timer);

    if (q.length < 2) {
      clearResults();
      return;
    }

    timer = setTimeout(async function () {
      try {
        const res = await fetch("/clients/search?q=" + encodeURIComponent(q));
        const data = await res.json();
        renderResults(data.items || data.clients || data || []);
      } catch (error) {
        results.innerHTML = '<div class="nx-autocomplete-empty">Nu am putut căuta clienți.</div>';
        results.style.display = "block";
      }
    }, 250);
  });

  results.addEventListener("click", function (event) {
    const item = event.target.closest(".nx-autocomplete-item");
    if (!item) return;

    input.value = item.dataset.cui || "";
    const selected = (window.__nxClientSearchItems || [])[Number(item.dataset.index || 0)];
    if (selected) showPreview(selected, "Client salvat");
    clearResults();
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".nx-autocomplete-field")) {
      clearResults();
    }
  });
})();
</script>
</body>
</html>`;
}

export {
  renderNexoraInvoiceNewPage
};
