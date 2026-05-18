import { renderNexoraClientDetailPage } from "../src/ui/nexora-client-detail-page.js";
import { renderNexoraClientsPage, renderNexoraClientNewPage } from "../src/ui/nexora-clients-page.js";
import { formatInvoiceDisplayNumber } from "../lib/invoice-numbering.js";

export function registerClientsRoutes(app, deps) {
  const {
    crmShellEnd,
    crmShellStart,
    db,
    escapeHtml,
    fetchAnafCompany,
    normalizeCui,
    requireAuth
  } = deps;

  function activityBadge(type) {
    const t = String(type || "").toLowerCase();
    if (t === "task") return `<span class="crm-badge crm-badge-amber">task</span>`;
    if (t === "meeting") return `<span class="crm-badge crm-badge-blue">meeting</span>`;
    if (t === "call") return `<span class="crm-badge crm-badge-green">call</span>`;
    if (t === "email") return `<span class="crm-badge crm-badge-neutral">email</span>`;
    return `<span class="crm-badge crm-badge-neutral">note</span>`;
  }

  function localFmtMoney(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  }

  app.get("/nexora/clients/new", requireAuth, (req, res) => {
    res.send(renderNexoraClientNewPage({
      user: req.session.user
    }));
  });

  app.get("/nexora/clients", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = String(req.query?.q || "").trim();

    let clients = [];
    if (q) {
      const like = `%${q}%`;
      clients = db.prepare(`
        SELECT DISTINCT cl.id, cl.cui, cl.name, cl.address, cl.reg_com, cl.created_at
        FROM clients cl
        LEFT JOIN contacts ct ON ct.client_id = cl.id
        WHERE cl.company_id = ?
          AND (
            cl.name LIKE ?
            OR cl.cui LIKE ?
            OR cl.reg_com LIKE ?
            OR ct.email LIKE ?
            OR ct.phone LIKE ?
          )
        ORDER BY cl.id DESC
        LIMIT 100
      `).all(companyId, like, like, like, like, like);
    } else {
      clients = db.prepare(`
        SELECT id, cui, name, address, reg_com, created_at
        FROM clients
        WHERE company_id = ?
        ORDER BY id DESC
        LIMIT 100
      `).all(companyId);
    }

    res.send(renderNexoraClientsPage({
      user: req.session.user,
      clients,
      q
    }));
  });

  app.get("/clients", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = String(req.query?.q || "").trim();
    const ok = String(req.query?.ok || "").trim();
    const err = String(req.query?.err || "").trim();

    let rows = [];
    if (q) {
      const like = `%${q}%`;
      rows = db.prepare(`
        SELECT DISTINCT cl.id, cl.cui, cl.name, cl.address, cl.reg_com, cl.created_at
        FROM clients cl
        LEFT JOIN contacts ct ON ct.client_id = cl.id
        WHERE
          cl.company_id = ? AND (
          cl.cui LIKE ? OR cl.name LIKE ?
          OR ct.name LIKE ? OR ct.email LIKE ? OR ct.phone LIKE ?
          )
        ORDER BY cl.id DESC
        LIMIT 300
      `).all(companyId, like, like, like, like, like);
    } else {
      rows = db.prepare(`
        SELECT id, cui, name, address, reg_com, created_at
        FROM clients
        WHERE company_id=?
        ORDER BY id DESC
        LIMIT 300
      `).all(companyId);
    }

    const userEmail = req.session.user.email;
    let flashHtml = "";
    if (ok === "added") {
      flashHtml = `<div class="crm-card" style="margin-bottom:18px;border:1px solid #bbf7d0;background:#ecfdf5;color:#166534">Client adăugat/actualizat cu succes din ANAF.</div>`;
    } else if (ok === "exists") {
      flashHtml = `<div class="crm-card" style="margin-bottom:18px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8">Clientul există deja și a fost actualizat din ANAF.</div>`;
    } else if (err === "invalid_cui") {
      flashHtml = `<div class="crm-card" style="margin-bottom:18px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b">CUI invalid.</div>`;
    } else if (err === "save_failed") {
      flashHtml = `<div class="crm-card" style="margin-bottom:18px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b">Nu am putut salva clientul.</div>`;
    }

    const htmlRows = rows.map((r) => `
      <tr>
        <td><a href="/client/${r.id}">${escapeHtml(r.cui || "")}</a></td>
        <td>
          <div style="font-weight:800"><a href="/client/${r.id}">${escapeHtml(r.name || "")}</a></div>
          <div class="crm-muted" style="margin-top:4px">Client ID: ${escapeHtml(String(r.id))}</div>
        </td>
        <td>${escapeHtml(r.reg_com || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(r.address || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(r.created_at || "") || `<span class="crm-muted">—</span>`}</td>
      </tr>`).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  .clients-shell{
    display:grid;
    gap:12px;
  }
  .clients-top-grid{
    margin-bottom:12px;
    overflow:visible;
  }
  .clients-card{
    padding:14px;
  }
  .clients-card-head,
  .clients-list-head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    flex-wrap:wrap;
    margin-bottom:10px;
  }
  .clients-card-title{
    margin:0 0 4px 0;
    font-size:18px;
    line-height:1.12;
  }
  .clients-card-copy{
    font-size:12px;
    line-height:1.45;
  }
  .clients-search-form,
  .clients-preview-row{
    margin-top:12px;
    align-items:flex-end;
    gap:10px;
  }
  .clients-preview-box{
    margin-top:12px;
    padding:12px 14px;
    background:#f8fafc;
    display:none;
  }
  .clients-preview-title{
    margin-bottom:8px;
    font-size:14px;
    font-weight:800;
  }
  .clients-preview-stack{
    gap:6px;
  }
  .clients-preview-error{
    margin-top:12px;
    padding:10px 12px;
    border:1px solid #fecaca;
    background:#fef2f2;
    color:#991b1b;
    display:none;
  }
  .clients-actions{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
  }
  .clients-shell .crm-table th,
  .clients-shell .crm-table td{
    padding:9px 10px;
  }
  @media (max-width: 720px){
    .clients-search-form > div,
    .clients-preview-row > div{
      min-width:100% !important;
    }
    .clients-actions{
      width:100%;
    }
    .clients-actions .crm-btn{
      flex:1 1 150px;
    }
  }
</style>
<meta charset="utf-8">
<title>Clienți</title>
</head>
${crmShellStart("clients", "Clients", "Bază de clienți, căutare rapidă și acces direct la fișa clientului.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="clients-shell">
  ${flashHtml}

  <div class="crm-grid-2 clients-top-grid">
    <section class="crm-card clients-card">
      <div class="clients-card-head">
        <div>
          <h3 class="clients-card-title">Caută client</h3>
          <div class="crm-muted clients-card-copy">Poți căuta după CUI, nume, persoană de contact, email sau telefon.</div>
        </div>
        <div class="crm-badge crm-badge-blue">${escapeHtml(String(rows.length))} rezultate</div>
      </div>

      <form method="get" action="/clients" class="crm-row clients-search-form">
        <div style="flex:1;min-width:280px">
          <label class="crm-label">Search</label>
          <input class="crm-input" name="q" value="${escapeHtml(q)}" placeholder="Ex: 47446760 / Nume firmă / email..." />
        </div>
        <div>
          <button class="crm-btn" type="submit">Caută</button>
        </div>
        <div>
          <a href="/clients" style="text-decoration:none"><button class="crm-btn crm-btn-secondary" type="button">Reset</button></a>
        </div>
      </form>
    </section>

    <section class="crm-card clients-card">
      <div class="clients-card-head" style="margin-bottom:0">
        <div>
          <h3 class="clients-card-title">Adaugă client după CUI</h3>
          <div class="crm-muted clients-card-copy">Caută mai întâi firma în ANAF, verifică datele din preview, apoi apasă „Adaugă client”.</div>
        </div>
      </div>

      <div class="crm-row clients-preview-row">
        <div style="flex:1;min-width:220px">
          <label class="crm-label">CUI</label>
          <input class="crm-input" id="client-cui-preview-input" placeholder="Ex: RO12345678 / 12345678" />
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="crm-btn crm-btn-secondary" type="button" id="client-cui-preview-btn">Search</button>
        </div>
      </div>

      <div id="client-cui-preview-box" class="crm-card clients-preview-box">
        <div class="clients-preview-title">Preview client</div>
        <div class="crm-stack clients-preview-stack">
          <div><strong>CUI:</strong> <span id="preview-cui">—</span></div>
          <div><strong>Nume:</strong> <span id="preview-name">—</span></div>
          <div><strong>Adresă:</strong> <span id="preview-address">—</span></div>
          <div><strong>RC:</strong> <span id="preview-regcom">—</span></div>
          <div><strong>CAEN:</strong> <span id="preview-caen">—</span></div>
          <div><strong>TVA:</strong> <span id="preview-vat">—</span></div>
          <div><strong>Inactiv:</strong> <span id="preview-inactive">—</span></div>
        </div>
      </div>

      <div id="client-cui-preview-error" class="crm-card clients-preview-error"></div>

      <form method="post" action="/clients/add-by-cui" style="margin-top:12px" id="client-cui-add-form">
        <input type="hidden" name="cui" id="client-cui-hidden" />
        <div class="clients-actions">
          <button class="crm-btn" type="submit" id="client-cui-add-btn" disabled>Adaugă client</button>
          <button class="crm-btn crm-btn-secondary" type="submit" id="client-cui-update-btn" disabled style="display:none">Actualizează din ANAF</button>
        </div>
      </form>

      <script>
      (() => {
        const input = document.getElementById("client-cui-preview-input");
        const btn = document.getElementById("client-cui-preview-btn");
        const addBtn = document.getElementById("client-cui-add-btn");
        const updateBtn = document.getElementById("client-cui-update-btn");
        const hidden = document.getElementById("client-cui-hidden");
        const box = document.getElementById("client-cui-preview-box");
        const err = document.getElementById("client-cui-preview-error");

        const fields = {
          cui: document.getElementById("preview-cui"),
          name: document.getElementById("preview-name"),
          address: document.getElementById("preview-address"),
          reg_com: document.getElementById("preview-regcom"),
          caen: document.getElementById("preview-caen"),
          vat: document.getElementById("preview-vat"),
          inactive: document.getElementById("preview-inactive"),
        };

        function resetPreview() {
          box.style.display = "none";
          err.style.display = "none";
          err.textContent = "";
          hidden.value = "";
          addBtn.disabled = true;
          if (updateBtn) {
            updateBtn.disabled = true;
            updateBtn.style.display = "none";
          }
          addBtn.style.display = "";
          Object.values(fields).forEach(el => el.textContent = "—");
        }

        async function doPreview() {
          const cui = String(input.value || "").trim();
          resetPreview();
          if (!cui) {
            err.textContent = "Introdu un CUI.";
            err.style.display = "block";
            return;
          }

          btn.disabled = true;
          btn.textContent = "Searching...";
          try {
            const r = await fetch("/api/company?cui=" + encodeURIComponent(cui), {
              headers: { "Accept": "application/json" }
            });
            const data = await r.json().catch(() => ({}));

            if (!r.ok || data.error) {
              throw new Error(data.error || "CUI negăsit în ANAF.");
            }

            fields.cui.textContent = data.normalized_cui || data.cui || "—";
            fields.name.textContent = data.legal_name || data.name || "—";
            fields.address.textContent = data.address || "—";
            fields.reg_com.textContent = data.reg_com || "—";
            fields.caen.textContent = data.caen || "—";
            fields.vat.innerHTML = Number(data.vat) ? '<span style="color:#166534;font-weight:700">TVA</span>' : '<span style="color:#991b1b;font-weight:700">Fără TVA</span>';
            fields.inactive.innerHTML = Number(data.inactive) ? '<span style="color:#991b1b;font-weight:700">INACTIV</span>' : '<span style="color:#166534;font-weight:700">Activ</span>';

            hidden.value = data.normalized_cui || data.cui || cui;
            box.style.display = "block";

            try {
              const existsRes = await fetch("/clients/check-exists?cui=" + encodeURIComponent(data.cui || data.normalized_cui));
              const existsData = await existsRes.json();
              if (existsData.exists) {
                err.textContent = "Clientul există deja în lista ta de clienți.";
                err.style.display = "block";
                addBtn.disabled = true;
                addBtn.style.display = "none";
                if (updateBtn) {
                  updateBtn.disabled = false;
                  updateBtn.style.display = "";
                }
                return;
              }
            } catch {}

            if (Number(data.inactive)) {
              box.style.border = "2px solid #ef4444";
              box.style.background = "#fef2f2";
            } else {
              box.style.border = "1px solid #e5e7eb";
              box.style.background = "#f8fafc";
            }

            addBtn.disabled = false;
          } catch (e) {
            err.textContent = String(e && e.message ? e.message : e);
            err.style.display = "block";
          } finally {
            btn.disabled = false;
            btn.textContent = "Search";
          }
        }

        btn?.addEventListener("click", doPreview);
        input?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            doPreview();
          }
        });
      })();
      </script>
    </section>
  </div>

  <section class="crm-card clients-card">
    <div class="clients-list-head">
      <div>
        <h3 class="clients-card-title" style="margin-bottom:0">Lista clienți</h3>
        <div class="crm-muted clients-card-copy" style="margin-top:4px">Ultimii 300 de clienți din sistem.</div>
      </div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>CUI</th>
            <th>Nume</th>
            <th>RC</th>
            <th>Adresă</th>
            <th>Creat</th>
          </tr>
        </thead>
        <tbody>${htmlRows || `<tr><td colspan="5"><em>Nu există clienți în DB.</em></td></tr>`}</tbody>
      </table>
    </div>
  </section>
  </div>

${crmShellEnd()}
</html>`);
  });

  app.get("/clients/check-exists", requireAuth, (req, res) => {
    try {
      const companyId = Number(req.session.user.company_id || 0);
      const cui = normalizeCui(req.query?.cui);
      if (!cui) return res.json({ exists: false });

      const row = db.prepare("SELECT id FROM clients WHERE cui=? AND company_id=?").get(cui, companyId);
      return res.json({ exists: !!row });
    } catch (e) {
      return res.json({ exists: false });
    }
  });

  app.get("/clients/search", requireAuth, (req, res) => {
    try {
      const companyId = Number(req.session.user.company_id || 0);
      const rawQuery = String(req.query?.q || "").trim();
      if (rawQuery.length < 2) return res.json({ clients: [] });

      const normalized = normalizeCui(rawQuery);
      const nameLike = `%${rawQuery}%`;
      const namePrefix = `${rawQuery}%`;
      const cuiLike = `%${normalized || "__no_match__"}%`;
      const cuiPrefix = `${normalized || "__no_match__"}%`;

      const rows = db.prepare(`
        SELECT id, cui, name, address, reg_com, caen, vat, inactive
        FROM clients
        WHERE company_id=? AND (
          LOWER(name) LIKE LOWER(?)
          OR (? <> '' AND cui LIKE ?)
        )
        ORDER BY
          CASE
            WHEN LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 0
            WHEN (? <> '' AND cui = ?) THEN 1
            WHEN LOWER(name) LIKE LOWER(?) THEN 2
            WHEN (? <> '' AND cui LIKE ?) THEN 3
            ELSE 4
          END,
          name COLLATE NOCASE ASC,
          id DESC
        LIMIT 8
      `).all(
        companyId,
        nameLike,
        normalized,
        cuiLike,
        rawQuery,
        normalized,
        normalized,
        namePrefix,
        normalized,
        cuiPrefix
      );

      return res.json({
        clients: rows.map((row) => ({
          id: row.id,
          cui: row.cui,
          name: row.name,
          address: row.address,
          reg_com: row.reg_com,
          caen: row.caen,
          vat: row.vat,
          inactive: row.inactive
        }))
      });
    } catch (e) {
      return res.json({ clients: [] });
    }
  });

  app.post("/clients/add-by-cui", requireAuth, async (req, res) => {
    try {
      const companyId = Number(req.session.user.company_id || 0);
      const cui = normalizeCui(req.body?.cui);
      if (!cui) return res.redirect("/clients?err=invalid_cui");

      let anaf = null;
      try {
        anaf = await fetchAnafCompany(cui);
      } catch (e) {
        console.warn("ANAF client add failed:", String(e?.message ?? e));
      }

      let client = db.prepare("SELECT id FROM clients WHERE cui=? AND company_id=?").get(cui, companyId);
      const existed = !!client;

      if (!client) {
        if (anaf) {
          db.prepare(`
            INSERT INTO clients (cui,name,address,reg_com,caen,vat,inactive,company_id)
            VALUES (?,?,?,?,?,?,?,?)
          `).run(
            anaf.cui || cui,
            anaf.name || ("Client " + cui),
            anaf.address || null,
            anaf.reg_com || null,
            anaf.caen || null,
            anaf.vat || 0,
            anaf.inactive || 0,
            companyId
          );
        } else {
          db.prepare(`
            INSERT INTO clients (cui,name,vat,inactive,company_id)
            VALUES (?,?,0,0,?)
          `).run(cui, "Client " + cui, companyId);
        }
      } else if (anaf) {
        db.prepare(`
          UPDATE clients
          SET name=?, address=?, reg_com=?, caen=?, vat=?, inactive=?
          WHERE cui=? AND company_id=?
        `).run(
          anaf.name || ("Client " + cui),
          anaf.address || null,
          anaf.reg_com || null,
          anaf.caen || null,
          anaf.vat || 0,
          anaf.inactive || 0,
          cui,
          companyId
        );
      }

      const saved = db.prepare("SELECT id FROM clients WHERE cui=? AND company_id=?").get(cui, companyId);
      if (!saved?.id) return res.redirect("/clients?err=save_failed");

      if (req.body?.return_to === "nexora") {
        return res.redirect("/nexora/clients/" + saved.id);
      }

      return res.redirect(existed ? "/clients?ok=exists" : "/clients?ok=added");
    } catch (e) {
      console.error("clients/add-by-cui failed:", e);
      return res.redirect("/clients?err=save_failed");
    }
  });

  app.get("/nexora/clients/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const client = db.prepare(`
      SELECT id, cui, name, address, reg_com, caen, vat, inactive, created_at,
             email, phone, client_status, notes
      FROM clients
      WHERE id=? AND company_id=?
    `).get(id, companyId);

    if (!client) return res.status(404).send("Client not found");

    const contacts = db.prepare(`
      SELECT id, name, email, phone, position, is_primary, created_at
      FROM contacts
      WHERE client_id=? AND company_id=?
      ORDER BY is_primary DESC, id DESC
      LIMIT 200
    `).all(id, companyId);

    const activities = db.prepare(`
      SELECT a.id, a.type, a.subject, a.note, a.due_at, a.done, a.created_at,
             c.name AS contact_name
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.client_id=? AND a.company_id=?
      ORDER BY a.id DESC
      LIMIT 200
    `).all(id, companyId);

    const contracts = db.prepare(`
      SELECT id, contract_number, created_at, price, duration, pdf_path
      FROM contracts
      WHERE client_id=? AND company_id=?
      ORDER BY id DESC
      LIMIT 200
    `).all(id, companyId);

    const quotes = db.prepare(`
      SELECT id, quote_number, status, total, currency, created_at, pdf_path
      FROM quotes
      WHERE client_id=? AND company_id=?
      ORDER BY id DESC
      LIMIT 200
    `).all(id, companyId);

    const facturi = db.prepare(`
      SELECT id, factura_nr, status, total, moneda, created_at, pdf_path
      FROM facturi
      WHERE client_id=? AND company_id=?
      ORDER BY id DESC
      LIMIT 200
    `).all(id, companyId);

    const timeline = [];
    activities.forEach((a) => {
      timeline.push({ type: "activity", date: a.created_at, subject: a.subject, note: a.note });
    });
    quotes.forEach((q) => {
      timeline.push({ type: "quote", date: q.created_at, number: q.quote_number, total: q.total, currency: q.currency, status: q.status });
    });
    contracts.forEach((c) => {
      timeline.push({ type: "contract", date: c.created_at, number: c.contract_number, total: c.price });
    });
    facturi.forEach((f) => {
      timeline.push({ type: "invoice", date: f.created_at, number: formatInvoiceDisplayNumber(f), total: f.total, currency: f.moneda, status: f.status });
    });
    timeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.send(renderNexoraClientDetailPage({
      user: req.session.user,
      client,
      contacts,
      activities,
      contracts,
      quotes,
      facturi,
      timeline
    }));
  });

  app.get("/client/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const client = db.prepare(`
      SELECT id, cui, name, address, reg_com, caen, vat, inactive, created_at,
             email, phone, client_status, notes
      FROM clients
      WHERE id=? AND company_id=?
    `).get(id, companyId);

    if (!client) return res.status(404).send("Client not found");

    const contacts = db.prepare(`
      SELECT id, name, email, phone, position, is_primary, created_at
      FROM contacts
      WHERE client_id=? AND company_id=?
      ORDER BY is_primary DESC, id DESC
      LIMIT 200
    `).all(id, companyId);

    const activities = db.prepare(`
      SELECT a.id, a.type, a.subject, a.note, a.due_at, a.done, a.created_at,
             c.name AS contact_name
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.client_id=? AND a.company_id=?
      ORDER BY a.id DESC
      LIMIT 200
    `).all(id, companyId);

    const contracts = db.prepare(`
      SELECT id, contract_number, created_at, price, duration, pdf_path
      FROM contracts
      WHERE client_id=? AND company_id=?
      ORDER BY id DESC
      LIMIT 200
    `).all(id, companyId);

    const quotes = db.prepare(`
      SELECT id, quote_number, status, total, currency, created_at, pdf_path
      FROM quotes
      WHERE client_id=? AND company_id=?
      ORDER BY id DESC
      LIMIT 200
    `).all(id, companyId);

    const facturi = db.prepare(`
      SELECT id, factura_nr, status, total, moneda, created_at, pdf_path
      FROM facturi
      WHERE client_id=? AND company_id=?
      ORDER BY id DESC
      LIMIT 200
    `).all(id, companyId);

    const timeline = [];
    activities.forEach((a) => {
      timeline.push({ type: "activity", date: a.created_at, subject: a.subject, note: a.note });
    });
    quotes.forEach((q) => {
      timeline.push({ type: "quote", date: q.created_at, number: q.quote_number, total: q.total, currency: q.currency, status: q.status });
    });
    contracts.forEach((c) => {
      timeline.push({ type: "contract", date: c.created_at, number: c.contract_number, total: c.price });
    });
    facturi.forEach((f) => {
      timeline.push({ type: "invoice", date: f.created_at, number: formatInvoiceDisplayNumber(f), total: f.total, currency: f.moneda, status: f.status });
    });
    timeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const userEmail = req.session.user.email;

    const htmlContacts = contacts.map((x) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(x.name || "")}</div>
          ${x.is_primary ? `<div style="margin-top:4px"><span class="crm-badge crm-badge-blue">principal</span></div>` : ``}
        </td>
        <td>${escapeHtml(x.position || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(x.email || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(x.phone || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(x.created_at || "") || `<span class="crm-muted">—</span>`}</td>
      </tr>
    `).join("");

    const htmlActivities = activities.map((a) => `
      <tr>
        <td>${activityBadge(a.type)}</td>
        <td>
          <div style="font-weight:700">${escapeHtml(a.subject || "") || `<span class="crm-muted">—</span>`}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(a.contact_name || "")}</div>
        </td>
        <td>${escapeHtml(a.note || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(a.due_at || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${a.done ? `<span class="crm-badge crm-badge-green">done</span>` : `<span class="crm-badge crm-badge-amber">open</span>`}</td>
        <td>${escapeHtml(a.created_at || "")}</td>
        <td>
          <form method="post" action="/client/${id}/activities/${a.id}/toggle" style="margin:0">
            <button class="crm-btn crm-btn-secondary" type="submit">${a.done ? "Reopen" : "Done"}</button>
          </form>
        </td>
      </tr>
    `).join("");

    const htmlContracts = contracts.map((c) => `
      <tr>
        <td><a href="/contract/${c.id}">${escapeHtml(c.contract_number || "")}</a></td>
        <td>${escapeHtml(c.created_at || "")}</td>
        <td class="crm-right">${escapeHtml(localFmtMoney(c.price))}</td>
        <td>${escapeHtml(c.duration || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${c.pdf_path ? `<a href="/${encodeURI(c.pdf_path)}" target="_blank">PDF</a>` : `<span class="crm-muted">—</span>`}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head>
<style>
  position:sticky;
  top:10px;
  z-index:20;
  background:#fff;
  padding:10px;
  border-radius:12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
</style>
<meta charset="utf-8">
<title>Client ${escapeHtml(client.name || "")}</title>
</head>
${crmShellStart("clients", client.name || "Client", "Fișa clientului, contacte, activități și contracte.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 10px 0;font-size:20px">Date client</h3>
          <div class="crm-muted">Informații generale despre companie.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${client.vat ? `<span class="crm-badge crm-badge-green">TVA</span>` : `<span class="crm-badge crm-badge-neutral">fără TVA</span>`}
          ${client.inactive ? `<span class="crm-badge crm-badge-red">inactiv</span>` : `<span class="crm-badge crm-badge-blue">activ</span>`}
        </div>
      </div>

      <div class="crm-stack" style="margin-top:16px;gap:10px">
        <div><b>Nume:</b> ${escapeHtml(client.name || "")}</div>
        <div><b>CUI:</b> <a href="/dashboard?q=${encodeURIComponent(client.cui || "")}">${escapeHtml(client.cui || "")}</a></div>
        <div><b>RC:</b> ${escapeHtml(client.reg_com || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>CAEN:</b> ${escapeHtml(client.caen || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Adresă:</b> ${escapeHtml(client.address || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Email:</b> ${escapeHtml(client.email || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Telefon:</b> ${escapeHtml(client.phone || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Status client:</b> ${
          client.client_status === "rosu"
            ? `<span class="crm-badge crm-badge-red">roșu</span>`
            : client.client_status === "galben"
              ? `<span class="crm-badge crm-badge-amber">galben</span>`
              : `<span class="crm-badge crm-badge-green">verde</span>`
        }</div>
        <div><b>Observații:</b> ${escapeHtml(client.notes || "") || `<span class="crm-muted">—</span>`}</div>
        <div class="crm-muted">Creat: ${escapeHtml(client.created_at || "")}</div>
      </div>

      <form method="post" action="/client/${id}/profile/save" class="crm-stack" style="margin-top:18px">
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Adresă email</label>
            <input class="crm-input" type="email" name="email" value="${escapeHtml(client.email || "")}" />
          </div>
          <div>
            <label class="crm-label">Număr telefon</label>
            <input class="crm-input" name="phone" value="${escapeHtml(client.phone || "")}" />
          </div>
        </div>

        <div>
          <label class="crm-label">Status client</label>
          <select class="crm-select" name="client_status">
            <option value="verde" ${client.client_status === "verde" ? "selected" : ""}>verde - toate facturile achitate</option>
            <option value="galben" ${client.client_status === "galben" ? "selected" : ""}>galben - restante la plată</option>
            <option value="rosu" ${client.client_status === "rosu" ? "selected" : ""}>roșu - mai mult de 2 facturi neplătite</option>
          </select>
        </div>

        <div>
          <label class="crm-label">Observații</label>
          <textarea class="crm-textarea" name="notes" rows="5">${escapeHtml(client.notes || "")}</textarea>
        </div>

        <div>
          <button class="crm-btn" type="submit">Salvează fișa clientului</button>
        </div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Snapshot</h3>
        <div class="crm-muted" style="margin-top:6px">Rezumat rapid pentru clientul curent.</div>
      </div>

      <div class="crm-kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">
        <div class="crm-kpi">
          <div class="crm-kpi-label">Contacte</div>
          <div class="crm-kpi-value">${escapeHtml(String(contacts.length))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Activități</div>
          <div class="crm-kpi-value">${escapeHtml(String(activities.length))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Contracte</div>
          <div class="crm-kpi-value">${escapeHtml(String(contracts.length))}</div>
        </div>
      </div>
    </section>
  </div>

      <h3 style="margin:0;font-size:20px">Timeline</h3>
      <div class="crm-muted" style="margin-top:6px">Istoric complet client.</div>
    </div>

    <div class="crm-stack">
      ${
        (timeline || []).map((e) => {
          if (e.type === "contract") {
            return `
              <div style="padding:10px;border-bottom:1px solid #eee">
                <b>Contract</b> ${escapeHtml(e.number || "")}
                <div class="crm-muted">${escapeHtml(e.date || "")} • ${escapeHtml(String(e.total || ""))}</div>
              </div>`;
          }

          if (e.type === "quote") {
            return `
              <div style="padding:10px;border-bottom:1px solid #eee">
                <b>Quote</b> ${escapeHtml(e.number || "")}
                <div class="crm-muted">${escapeHtml(e.date || "")} • ${escapeHtml(String(e.total || ""))} ${escapeHtml(e.currency || "")}</div>
              </div>`;
          }

          if (e.type === "invoice") {
            return `
              <div style="padding:10px;border-bottom:1px solid #eee">
                <b>Factură</b> ${escapeHtml(e.number || "")}
                <div class="crm-muted">${escapeHtml(e.date || "")} • ${escapeHtml(String(e.total || ""))} ${escapeHtml(e.currency || "")}</div>
              </div>`;
          }

          return `
            <div style="padding:10px;border-bottom:1px solid #eee">
              <b>Activity</b> ${escapeHtml(e.subject || "")}
              <div class="crm-muted">${escapeHtml(e.date || "")}</div>
            </div>`;
        }).join("")
      }
    </div>
  </section>

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Contacts</h3>
        <div class="crm-muted" style="margin-top:6px">Persoane de contact asociate acestui client.</div>
      </div>

      <form method="post" action="/client/${id}/contacts/add" class="crm-stack">
        <div>
          <label class="crm-label">Nume</label>
          <input class="crm-input" name="name" required />
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Funcție</label>
            <input class="crm-input" name="position" />
          </div>
          <div>
            <label class="crm-label">Telefon</label>
            <input class="crm-input" name="phone" />
          </div>
        </div>

        <div>
          <label class="crm-label">Email</label>
          <input class="crm-input" name="email" type="email" />
        </div>

        <div>
          <label class="crm-label" style="display:flex;align-items:center;gap:10px;margin:0">
            <input type="checkbox" name="is_primary" value="1" style="width:auto">
            Contact principal
          </label>
        </div>

        <div>
          <button class="crm-btn" type="submit">Adaugă contact</button>
        </div>
      </form>

      <div style="margin-top:16px" class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Nume</th><th>Funcție</th><th>Email</th><th>Telefon</th><th>Creat</th></tr></thead>
          <tbody>${htmlContacts || `<tr><td colspan="5"><em>Nu există contacte.</em></td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Activities</h3>
        <div class="crm-muted" style="margin-top:6px">Task-uri, apeluri, emailuri și note.</div>
      </div>

      <form method="post" action="/client/${id}/activities/add" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Tip</label>
            <select class="crm-select" name="type" required>
              <option value="call">call</option>
              <option value="meeting">meeting</option>
              <option value="email">email</option>
              <option value="note" selected>note</option>
              <option value="task">task</option>
            </select>
          </div>
          <div>
            <label class="crm-label">Contact</label>
            <select class="crm-select" name="contact_id">
              <option value="">—</option>
              ${contacts.map((c) => `<option value="${c.id}">${escapeHtml(c.name || "")}</option>`).join("")}
            </select>
          </div>
        </div>

        <div>
          <label class="crm-label">Subject</label>
          <input class="crm-input" name="subject" />
        </div>

        <div>
          <label class="crm-label">Note</label>
          <textarea class="crm-textarea" name="note" rows="4"></textarea>
        </div>

        <div>
          <label class="crm-label">Due at</label>
          <input class="crm-input" name="due_at" placeholder="2026-03-10" />
        </div>

        <div>
          <button class="crm-btn" type="submit">Adaugă activity</button>
        </div>
      </form>

      <div style="margin-top:16px" class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Tip</th><th>Subject</th><th>Note</th><th>Due</th><th>Done</th><th>Creat</th><th></th></tr></thead>
          <tbody>${htmlActivities || `<tr><td colspan="7"><em>Nu există activități.</em></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="margin-bottom:14px">
      <h3 style="margin:0;font-size:20px">Contracts</h3>
      <div class="crm-muted" style="margin-top:6px">Contractele asociate acestui client.</div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Contract</th><th>Creat</th><th class="crm-right">Preț</th><th>Durată</th><th>PDF</th></tr></thead>
        <tbody>${htmlContracts || `<tr><td colspan="5"><em>Nu există contracte pentru acest client.</em></td></tr>`}</tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
  });

  app.post("/client/:id/profile/save", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const client_status_raw = String(req.body?.client_status || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim();

    const allowed = new Set(["verde", "galben", "rosu"]);
    const client_status = allowed.has(client_status_raw) ? client_status_raw : "verde";

    db.prepare(`
      UPDATE clients
      SET email=?, phone=?, client_status=?, notes=?
      WHERE id=? AND company_id=?
    `).run(email || null, phone || null, client_status, notes || null, id, companyId);

    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/clients/" + id : "/client/" + id);
  });

  app.post("/client/:id/contacts/add", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const client_id = Number(req.params.id);
    if (!Number.isFinite(client_id)) return res.status(400).send("Bad id");

    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const position = String(req.body?.position || "").trim();
    const is_primary = req.body?.is_primary ? 1 : 0;

    if (!name) return res.status(400).send("name required");

    const tx = db.transaction(() => {
      if (is_primary) db.prepare("UPDATE contacts SET is_primary=0 WHERE client_id=? AND company_id=?").run(client_id, companyId);
      db.prepare(`
        INSERT INTO contacts (client_id, name, email, phone, position, is_primary, company_id)
        VALUES (?,?,?,?,?,?,?)
      `).run(client_id, name, email || null, phone || null, position || null, is_primary, companyId);
    });

    tx();
    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/clients/" + client_id : "/client/" + client_id);
  });

  app.post("/client/:id/activities/add", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const client_id = Number(req.params.id);
    if (!Number.isFinite(client_id)) return res.status(400).send("Bad id");

    const type = String(req.body?.type || "").trim().toLowerCase();
    const subject = String(req.body?.subject || "").trim();
    const note = String(req.body?.note || "").trim();
    const due_at = String(req.body?.due_at || "").trim();
    const contact_id_raw = String(req.body?.contact_id || "").trim();
    const contact_id = contact_id_raw ? Number(contact_id_raw) : null;

    const allowed = new Set(["call", "meeting", "email", "note", "task"]);
    if (!allowed.has(type)) return res.status(400).send("type invalid");
    if (contact_id_raw && !Number.isFinite(contact_id)) return res.status(400).send("contact_id invalid");

    db.prepare(`
      INSERT INTO activities (client_id, contact_id, type, subject, note, due_at, company_id)
      VALUES (?,?,?,?,?,?,?)
    `).run(client_id, contact_id, type, subject || null, note || null, due_at || null, companyId);

    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/clients/" + client_id : "/client/" + client_id);
  });

  app.post("/client/:id/activities/:aid/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const client_id = Number(req.params.id);
    const aid = Number(req.params.aid);

    if (!Number.isFinite(client_id) || !Number.isFinite(aid)) {
      return res.status(400).send("Bad id");
    }

    db.prepare(`
      DELETE FROM activities
      WHERE id = ? AND client_id = ? AND company_id = ?
    `).run(aid, client_id, companyId);

    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/clients/" + client_id : "/client/" + client_id);
  });

  app.post("/client/:id/activities/:aid/toggle", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const client_id = Number(req.params.id);
    const aid = Number(req.params.aid);
    if (!Number.isFinite(client_id) || !Number.isFinite(aid)) return res.status(400).send("Bad id");

    const row = db.prepare("SELECT done FROM activities WHERE id=? AND client_id=? AND company_id=?").get(aid, client_id, companyId);
    if (!row) return res.status(404).send("Not found");

    const next = row.done ? 0 : 1;
    db.prepare("UPDATE activities SET done=? WHERE id=? AND client_id=? AND company_id=?").run(next, aid, client_id, companyId);
    return res.redirect("/client/" + client_id);
  });
}
