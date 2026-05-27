import { renderNexoraContractDetailPage, renderNexoraContractsPage } from "../src/ui/nexora-contracts-page.js";

export function registerContractsRoutes(app, deps) {
  const {
    COMPANY,
    Mustache,
    __dirname,
    crmShellEnd,
    crmShellStart,
    db,
    escapeHtml,
    fs,
    path,
    renderPdfBuffer,
    requireAuth,
    templateHtml,
    todayISO
  } = deps;

  function originBadge(origin) {
    const o = String(origin || "").toUpperCase();
    if (o === "QUOTE") return `<span class="crm-badge crm-badge-blue">QUOTE</span>`;
    return `<span class="crm-badge crm-badge-green">DIRECT</span>`;
  }

  function localFmtMoney(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  }

  function contractRedirect(req, id, ok = "") {
    const suffix = ok ? `?ok=${encodeURIComponent(ok)}` : "";
    return req.body?.return_to === "nexora" ? `/nexora/contracts/${id}${suffix}` : `/contract/${id}`;
  }

  app.get("/nexora/contracts", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = String(req.query?.q || "").trim();
    const search = q ? `%${q}%` : null;

    const rows = q
      ? db.prepare(`
          SELECT c.id, c.contract_number, c.created_at, c.price, c.duration,
                 IFNULL(c.origin,'DIRECT') AS origin,
                 cl.id AS client_id, cl.name AS client_name, cl.cui AS client_cui,
                 c.pdf_path
          FROM contracts c
          JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
          WHERE c.company_id=?
            AND (c.contract_number LIKE ? OR cl.name LIKE ? OR cl.cui LIKE ?)
          ORDER BY c.id DESC
          LIMIT 500
        `).all(companyId, search, search, search)
      : db.prepare(`
          SELECT c.id, c.contract_number, c.created_at, c.price, c.duration,
                 IFNULL(c.origin,'DIRECT') AS origin,
                 cl.id AS client_id, cl.name AS client_name, cl.cui AS client_cui,
                 c.pdf_path
          FROM contracts c
          JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
          WHERE c.company_id=?
          ORDER BY c.id DESC
          LIMIT 500
        `).all(companyId);

    return res.type("html").send(renderNexoraContractsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      q,
      fmtMoney: (value) => `${localFmtMoney(value)} RON`
    }));
  });

  app.get("/nexora/contracts/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const row = db.prepare(`
      SELECT c.*, cl.name AS client_name, cl.cui AS client_cui, cl.address AS client_address, cl.reg_com AS client_reg_com
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
      WHERE c.id=? AND c.company_id=?
    `).get(id, companyId);

    if (!row) return res.status(404).send("Not found");

    return res.type("html").send(renderNexoraContractDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      contract: row,
      ok: String(req.query?.ok || ""),
      fmtMoney: (value) => `${localFmtMoney(value)} RON`
    }));
  });

  app.get("/contracte", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT c.id, c.contract_number, c.created_at, c.price, c.duration,
             IFNULL(c.origin,'DIRECT') AS origin,
             cl.name AS client_name, cl.cui AS client_cui,
             c.pdf_path
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
      WHERE c.company_id=?
      ORDER BY c.id DESC
      LIMIT 500
    `).all(companyId);

    const userEmail = req.session.user.email;
    const htmlRows = rows.map((r) => `
      <tr>
        <td><a href="/contract/${r.id}">${escapeHtml(r.contract_number || "")}</a></td>
        <td>
          <div style="font-weight:800">${escapeHtml(r.client_name || "")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(r.client_cui || "")}</div>
        </td>
        <td class="crm-right">${escapeHtml(localFmtMoney(r.price))}</td>
        <td>${escapeHtml(r.duration || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${originBadge(r.origin)}</td>
        <td>${escapeHtml(r.created_at || "")}</td>
        <td>${r.pdf_path ? `<a href="/${encodeURI(r.pdf_path)}" target="_blank">PDF</a>` : `<span class="crm-muted">—</span>`}</td>
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
<title>Contracts</title>
</head>
${crmShellStart("contracts", "Contracts", "Toate contractele generate din MiniCRM.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">Lista contracte</h3>
        <div class="crm-muted" style="margin-top:6px">Ultimele 500 contracte din sistem.</div>
      </div>
      <div class="crm-badge crm-badge-blue">${escapeHtml(String(rows.length))} contracte</div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Nr. contract</th>
            <th>Client</th>
            <th class="crm-right">Preț</th>
            <th>Durată</th>
            <th>Origin</th>
            <th>Creat la</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          ${htmlRows || '<tr><td colspan="7"><em>Nu există contracte.</em></td></tr>'}
        </tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
  });

  app.get("/contract/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const row = db.prepare(`
      SELECT c.*, cl.name AS client_name, cl.cui AS client_cui, cl.address AS client_address, cl.reg_com AS client_reg_com
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
      WHERE c.id=? AND c.company_id=?
    `).get(id, companyId);

    if (!row) return res.status(404).send("Not found");

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
<title>Contract ${escapeHtml(row.contract_number || "")}</title>
</head>
${crmShellStart("contracts", `Contract ${row.contract_number || ""}`, "Detalii contract, PDF și editare de bază.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="crm-grid-2" style="overflow:visible;margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 10px 0;font-size:20px">Client</h3>
          <div class="crm-muted">Datele clientului asociat contractului.</div>
        </div>
        <div>${originBadge(row.origin)}</div>
      </div>

      <div class="crm-stack" style="margin-top:16px;gap:10px">
        <div><b>Nume:</b> ${escapeHtml(row.client_name || "")}</div>
        <div><b>CUI:</b> ${escapeHtml(row.client_cui || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>RC:</b> ${escapeHtml(row.client_reg_com || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Adresă:</b> ${escapeHtml(row.client_address || "") || `<span class="crm-muted">—</span>`}</div>
        <div class="crm-muted">ID: ${escapeHtml(String(row.id))} · Creat: ${escapeHtml(row.created_at || "")}</div>
      </div>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Sumar</h3>
        <div class="crm-muted" style="margin-top:6px">Vedere rapidă asupra contractului.</div>
      </div>

      <div class="crm-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">
        <div class="crm-kpi">
          <div class="crm-kpi-label">Preț</div>
          <div class="crm-kpi-value" style="font-size:24px">${escapeHtml(localFmtMoney(row.price))}</div>
        </div>
        <div class="crm-kpi">
          <div class="crm-kpi-label">Durată</div>
          <div class="crm-kpi-value" style="font-size:18px;line-height:1.2">${escapeHtml(row.duration || "—")}</div>
        </div>
      </div>
    </section>
  </div>

  <div class="crm-grid-2" style="overflow:visible;margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">PDF</h3>
        <div class="crm-muted" style="margin-top:6px">Deschide documentul sau regenerează-l din datele curente.</div>
      </div>

      <div class="crm-row">
        ${row.pdf_path ? `<a href="/${encodeURI(row.pdf_path)}" target="_blank" style="text-decoration:none"><button class="crm-btn crm-btn-secondary" type="button">Deschide PDF</button></a>` : `<span class="crm-muted">Fără PDF</span>`}
        <form method="post" action="/contract/${row.id}/regenerate-pdf" style="margin:0">
          <button class="crm-btn" type="submit">Regenerate PDF</button>
        </form>
      </div>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Info</h3>
        <div class="crm-muted" style="margin-top:6px">Editarea actualizează datele din CRM. PDF-ul existent poate fi regenerat separat.</div>
      </div>

      <div class="crm-stack" style="gap:10px">
        <div><b>Contract:</b> ${escapeHtml(row.contract_number || "")}</div>
        <div><b>Origin:</b> ${escapeHtml(String(row.origin || "DIRECT"))}</div>
        <div><b>Fișier PDF:</b> ${row.pdf_path ? escapeHtml(row.pdf_path) : `<span class="crm-muted">—</span>`}</div>
      </div>
    </section>
  </div>

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="margin-bottom:14px">
      <h3 style="margin:0;font-size:20px">Edit (basic)</h3>
      <div class="crm-muted" style="margin-top:6px">Editare rapidă pentru descriere servicii, preț și durată.</div>
    </div>

    <form method="post" action="/contract/${row.id}/edit" class="crm-stack">
      <div>
        <label class="crm-label">Descriere servicii</label>
        <textarea class="crm-textarea" name="service_description" rows="8">${escapeHtml(row.service_description || "")}</textarea>
      </div>

      <div class="crm-grid-2" style="overflow:visible">
        <div>
          <label class="crm-label">Preț</label>
          <input class="crm-input" name="price" value="${escapeHtml(String(row.price ?? ""))}" />
        </div>
        <div>
          <label class="crm-label">Durată</label>
          <input class="crm-input" name="duration" value="${escapeHtml(row.duration || "")}" />
        </div>
      </div>

      <div>
        <button class="crm-btn" type="submit">Salvează</button>
      </div>
    </form>
  </section>

${crmShellEnd()}
</html>`);
  });

  app.post("/contract/:id/edit", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const service_description = String(req.body?.service_description || "").trim();
    const duration = String(req.body?.duration || "").trim();
    const priceNum = Number(String(req.body?.price || "").replace(",", "."));

    if (!service_description) return res.status(400).send("service_description required");
    if (!duration) return res.status(400).send("duration required");
    if (!Number.isFinite(priceNum)) return res.status(400).send("price invalid");

    const info = db.prepare(`
      UPDATE contracts
      SET service_description=?, price=?, duration=?
      WHERE id=? AND company_id=?
    `).run(service_description, priceNum, duration, id, companyId);

    if (info.changes === 0) return res.status(404).send("Not found");
    return res.redirect(contractRedirect(req, id, "salvat"));
  });

  app.post("/contract/:id/regenerate-pdf", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    try {
      const row = db.prepare(`
        SELECT c.*, cl.cui AS client_cui, cl.name AS client_name, cl.address AS client_address, cl.reg_com AS client_reg_com
        FROM contracts c
        JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
        WHERE c.id=? AND c.company_id=?
      `).get(id, companyId);

      if (!row) return res.status(404).send("Not found");

      const is_company = !String(row.client_cui || "").startsWith("PF-");
      const vm = {
        contract_number: row.contract_number,
        contract_date: row.created_at ? String(row.created_at).slice(0, 10) : todayISO(),
        is_company,
        pj_cui: is_company ? (row.client_cui || "") : "",
        pj_legal_name: is_company ? (row.client_name || "") : "",
        pj_address: is_company ? (row.client_address || "") : "",
        pj_reg_com: is_company ? (row.client_reg_com || "") : "",
        pj_representative_name: "",
        pf_full_name: !is_company ? (row.client_name || "") : "",
        pf_address: !is_company ? (row.client_address || "") : "",
        service_description: row.service_description || "",
        price_amount: String(row.price ?? ""),
        price_currency: "RON",
        payment_terms: "15 zile",
        start_date: todayISO(),
        duration: row.duration || "",
        termination_notice_days: "30",
        jurisdiction_city: "București",
        privacy_policy_url: "https://qr-lab.ro",
        client_signer_name: is_company ? "" : (row.client_name || ""),
        provider_signer_name: ""
      };

      const html = Mustache.render(templateHtml, { ...vm, company: COMPANY });
      const pdf = await renderPdfBuffer(html);

      const year = row.year || new Date().getFullYear();
      const yearDir = path.join(__dirname, "contracts", String(year));
      fs.mkdirSync(yearDir, { recursive: true });

      const fileName = `${row.contract_number}.pdf`;
      const absPath = path.join(yearDir, fileName);
      fs.writeFileSync(absPath, pdf);

      const pdf_path = `contracts/${year}/${fileName}`;
      db.prepare("UPDATE contracts SET pdf_path=? WHERE id=? AND company_id=?").run(pdf_path, id, companyId);

      return res.redirect(contractRedirect(req, id, "pdf_generat"));
    } catch (error) {
      console.error(`[PDF] regenerate contract ${id} failed`, error);
      return res.status(error?.code === "PDF_BROWSER_MISSING" ? 503 : 500).send(String(error?.message || "Nu am putut genera PDF-ul contractului."));
    }
  });
}
