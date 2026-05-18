function parseDate(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function safeText(value) {
  return String(value || "").trim();
}

function slugCodeFromName(value) {
  const cleaned = safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return cleaned || "ITEM";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function inventoryUploadDir(path, __dirname) {
  return path.join(__dirname, "public", "uploads", "inventory", "counts");
}

function saveUploadedFile({ fs, path, __dirname, file }) {
  if (!file) return "";
  const targetDir = inventoryUploadDir(path, __dirname);
  fs.mkdirSync(targetDir, { recursive: true });
  const safeBase = String(file.originalname || "inventar.csv").replace(/[^A-Za-z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeBase}`;
  const finalPath = path.join(targetDir, finalName);
  fs.renameSync(file.path, finalPath);
  return {
    relativePath: `uploads/inventory/counts/${finalName}`,
    fileName: safeBase,
    fullPath: finalPath
  };
}

function parseCountFile(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length) return [];
  const delimiter = rows[0].includes(";") ? ";" : ",";
  const header = rows[0].split(delimiter).map((value) => value.trim().toLowerCase());
  const codeIndex = header.findIndex((value) => ["asset_code", "cod", "code", "cod_articol", "cod_mijloc"].includes(value));
  const qtyIndex = header.findIndex((value) => ["quantity_counted", "counted_qty", "cantitate", "qty", "stoc_faptic"].includes(value));
  const notesIndex = header.findIndex((value) => ["notes", "observatii", "observații", "obs"].includes(value));
  const nameIndex = header.findIndex((value) => ["asset_name", "denumire", "nume", "descriere"].includes(value));
  if (codeIndex === -1 || qtyIndex === -1) return [];

  return rows.slice(1).map((line) => {
    const columns = line.split(delimiter).map((value) => value.trim());
    return {
      asset_code: safeText(columns[codeIndex]),
      quantity_counted: parseNumber(columns[qtyIndex], 0),
      notes: notesIndex >= 0 ? safeText(columns[notesIndex]) : "",
      asset_name: nameIndex >= 0 ? safeText(columns[nameIndex]) : ""
    };
  }).filter((row) => row.asset_code);
}

function inventoryStatusBadge(escapeHtml, value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "IN_STOC") return `<span class="crm-badge crm-badge-green">în stoc</span>`;
  if (normalized === "ALOCAT") return `<span class="crm-badge crm-badge-blue">alocat</span>`;
  if (normalized === "IN_SERVICE") return `<span class="crm-badge crm-badge-amber">în service</span>`;
  if (normalized === "CASAT") return `<span class="crm-badge crm-badge-red">casat</span>`;
  if (normalized === "ACTIV") return `<span class="crm-badge crm-badge-green">activ</span>`;
  if (normalized === "INCHIS") return `<span class="crm-badge crm-badge-neutral">închis</span>`;
  if (normalized === "DRAFT") return `<span class="crm-badge crm-badge-neutral">draft</span>`;
  if (normalized === "FINALIZAT") return `<span class="crm-badge crm-badge-blue">finalizat</span>`;
  if (normalized === "APPLIED") return `<span class="crm-badge crm-badge-green">corecții aplicate</span>`;
  return `<span class="crm-badge crm-badge-neutral">${escapeHtml(normalized || "—")}</span>`;
}

function assetTypeBadge(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "MIJLOC_FIX") return `<span class="crm-badge crm-badge-blue">mijloc fix</span>`;
  return `<span class="crm-badge crm-badge-amber">obiect mobil</span>`;
}

function buildAssetFilterState(query = {}) {
  return {
    type: safeText(query.type).toUpperCase(),
    status: safeText(query.status).toUpperCase(),
    search: safeText(query.search)
  };
}

function buildAssetWhere(filters, companyId) {
  const where = ["company_id=?"];
  const params = [companyId];
  if (filters.type) {
    where.push("UPPER(COALESCE(asset_type,''))=?");
    params.push(filters.type);
  }
  if (filters.status) {
    where.push("UPPER(COALESCE(status,''))=?");
    params.push(filters.status);
  }
  if (filters.search) {
    const like = `%${filters.search.toLowerCase()}%`;
    where.push("(LOWER(COALESCE(asset_code,'')) LIKE ? OR LOWER(COALESCE(asset_name,'')) LIKE ? OR LOWER(COALESCE(location,'')) LIKE ? OR LOWER(COALESCE(serial_number,'')) LIKE ?)");
    params.push(like, like, like, like);
  }
  return { whereSql: where.join(" AND "), params };
}

function countVarianceBadge(variance) {
  const value = Number(variance || 0);
  if (value > 0) return `<span class="crm-badge crm-badge-blue">plus ${value}</span>`;
  if (value < 0) return `<span class="crm-badge crm-badge-red">minus ${Math.abs(value)}</span>`;
  return `<span class="crm-badge crm-badge-green">ok</span>`;
}

function inventoryShell(crmShellStart, crmShellEnd, active, title, subtitle, req, body) {
  return `
    ${crmShellStart(active, title, subtitle, req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
    ${body}
    ${crmShellEnd()}
  `;
}

function createAssetRecord(db, req, companyId, payload = {}) {
  const name = safeText(payload.asset_name || payload.name);
  const generatedCode = `INV-${Date.now()}-${slugCodeFromName(name).slice(0, 12)}`;
  db.prepare(`
    INSERT INTO inventory_assets (
      company_id, asset_code, asset_name, category, asset_type, unit, quantity_scriptic,
      minimum_quantity, location, serial_number, purchase_date, purchase_value, status,
      supplier_name, invoice_number, notes, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    safeText(payload.asset_code) || generatedCode,
    name,
    safeText(payload.category) || "MOBIL",
    safeText(payload.asset_type) || "OBIECT_INVENTAR",
    safeText(payload.unit) || "buc",
    parseNumber(payload.quantity_scriptic, 1),
    parseNumber(payload.minimum_quantity, 0),
    safeText(payload.location),
    safeText(payload.serial_number),
    parseDate(payload.purchase_date),
    parseNumber(payload.purchase_value, 0),
    safeText(payload.status) || "IN_STOC",
    safeText(payload.supplier_name),
    safeText(payload.invoice_number),
    safeText(payload.notes),
    req.session.user.email
  );
}

function updateAssetRecord(db, req, companyId, assetId, payload = {}) {
  db.prepare(`
    UPDATE inventory_assets
    SET
      asset_code=?,
      asset_name=?,
      category=?,
      asset_type=?,
      unit=?,
      quantity_scriptic=?,
      minimum_quantity=?,
      location=?,
      serial_number=?,
      purchase_date=?,
      purchase_value=?,
      status=?,
      supplier_name=?,
      invoice_number=?,
      notes=?,
      updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    safeText(payload.asset_code),
    safeText(payload.asset_name),
    safeText(payload.category) || "MOBIL",
    safeText(payload.asset_type) || "MIJLOC_FIX",
    safeText(payload.unit) || "buc",
    parseNumber(payload.quantity_scriptic, 1),
    parseNumber(payload.minimum_quantity, 0),
    safeText(payload.location),
    safeText(payload.serial_number),
    parseDate(payload.purchase_date),
    parseNumber(payload.purchase_value, 0),
    safeText(payload.status) || "IN_STOC",
    safeText(payload.supplier_name),
    safeText(payload.invoice_number),
    safeText(payload.notes),
    assetId,
    companyId
  );
}

function createProjectRecord(db, req, companyId, payload = {}) {
  db.prepare(`
    INSERT INTO inventory_projects (
      company_id, project_code, project_name, client_name, location, start_date, end_date,
      status, notes, created_by_email, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(
    companyId,
    safeText(payload.project_code),
    safeText(payload.project_name),
    safeText(payload.client_name),
    safeText(payload.location),
    parseDate(payload.start_date),
    parseDate(payload.end_date),
    safeText(payload.status) || "ACTIV",
    safeText(payload.notes),
    req.session.user.email
  );
}

function updateProjectRecord(db, companyId, projectId, payload = {}) {
  db.prepare(`
    UPDATE inventory_projects
    SET
      project_code=?,
      project_name=?,
      client_name=?,
      location=?,
      start_date=?,
      end_date=?,
      status=?,
      notes=?,
      updated_at=datetime('now')
    WHERE id=? AND company_id=?
  `).run(
    safeText(payload.project_code),
    safeText(payload.project_name),
    safeText(payload.client_name),
    safeText(payload.location),
    parseDate(payload.start_date),
    parseDate(payload.end_date),
    safeText(payload.status) || "ACTIV",
    safeText(payload.notes),
    projectId,
    companyId
  );
}

export function registerInventoryRoutes(app, { db, requireAuth, escapeHtml, fmtMoney, crmShellStart, crmShellEnd, fs, path, __dirname, upload }) {
  app.get("/inventory", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_assets,
        SUM(CASE WHEN UPPER(COALESCE(asset_type,''))='MIJLOC_FIX' THEN 1 ELSE 0 END) AS fixed_assets,
        SUM(CASE WHEN UPPER(COALESCE(asset_type,''))='OBIECT_INVENTAR' THEN 1 ELSE 0 END) AS mobile_assets,
        SUM(CASE WHEN quantity_scriptic <= minimum_quantity THEN 1 ELSE 0 END) AS low_stock_assets,
        SUM(quantity_scriptic * purchase_value) AS total_value
      FROM inventory_assets
      WHERE company_id=?
    `).get(companyId) || {};
    const projectStats = db.prepare(`
      SELECT
        COUNT(*) AS total_projects,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='ACTIV' THEN 1 ELSE 0 END) AS active_projects
      FROM inventory_projects
      WHERE company_id=?
    `).get(companyId) || {};
    const countStats = db.prepare(`
      SELECT
        COUNT(*) AS total_counts,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='DRAFT' THEN 1 ELSE 0 END) AS draft_counts,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='APPLIED' THEN 1 ELSE 0 END) AS applied_counts
      FROM inventory_counts
      WHERE company_id=?
    `).get(companyId) || {};
    const lowStock = db.prepare(`
      SELECT asset_code, asset_name, quantity_scriptic, minimum_quantity, location
      FROM inventory_assets
      WHERE company_id=? AND quantity_scriptic <= minimum_quantity
      ORDER BY quantity_scriptic ASC, asset_name COLLATE NOCASE ASC
      LIMIT 8
    `).all(companyId);
    const recentProjects = db.prepare(`
      SELECT id, project_code, project_name, client_name, status, location
      FROM inventory_projects
      WHERE company_id=?
      ORDER BY updated_at DESC, id DESC
      LIMIT 6
    `).all(companyId);
    const latestCounts = db.prepare(`
      SELECT id, title, count_date, status, source_file_name
      FROM inventory_counts
      WHERE company_id=?
      ORDER BY count_date DESC, id DESC
      LIMIT 6
    `).all(companyId);
    const html = `
      <section class="crm-card" style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <div class="crm-page-kicker">Adăugare rapidă</div>
            <h2 style="margin:0">Introducere manuală active</h2>
            <div class="crm-muted">Pentru lucru rapid: denumire, cantitate și locație. Codul se generează automat.</div>
          </div>
          <a class="crm-btn crm-btn-secondary" href="/inventory/assets">Deschide registrul complet</a>
        </div>
        <form method="post" action="/inventory/assets/quick" class="crm-grid" style="grid-template-columns:1.2fr .8fr .9fr .8fr auto;margin-top:14px;align-items:end">
          <div><label>Denumire</label><input name="asset_name" required placeholder="Scaun birou / Laptop / Dulap metalic" /></div>
          <div><label>Cantitate</label><input type="number" step="0.01" name="quantity_scriptic" value="1" /></div>
          <div><label>Locație</label><input name="location" placeholder="Depozit / birou / proiect" /></div>
          <div><label>Tip</label><select name="asset_type"><option value="OBIECT_INVENTAR">Mobil</option><option value="MIJLOC_FIX">Fix</option></select></div>
          <div><button class="crm-btn" type="submit">Adaugă rapid</button></div>
        </form>
      </section>

      <div class="crm-grid" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:18px">
        <section class="crm-card"><div class="crm-muted">Active inventar</div><div style="font-size:28px;font-weight:800">${Number(stats.total_assets || 0)}</div><div class="crm-muted">toate pozițiile scriptice</div></section>
        <section class="crm-card"><div class="crm-muted">Mijloace fixe</div><div style="font-size:28px;font-weight:800">${Number(stats.fixed_assets || 0)}</div><div class="crm-muted">bunuri urmărite individual</div></section>
        <section class="crm-card"><div class="crm-muted">Obiecte mobile</div><div style="font-size:28px;font-weight:800">${Number(stats.mobile_assets || 0)}</div><div class="crm-muted">stocuri și echipamente mobile</div></section>
        <section class="crm-card"><div class="crm-muted">Proiecte active</div><div style="font-size:28px;font-weight:800">${Number(projectStats.active_projects || 0)}</div><div class="crm-muted">din ${Number(projectStats.total_projects || 0)} proiecte</div></section>
        <section class="crm-card"><div class="crm-muted">Valoare inventar</div><div style="font-size:28px;font-weight:800">${fmtMoney(stats.total_value || 0)}</div><div class="crm-muted">valoare scriptică estimată</div></section>
      </div>

      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <div class="crm-page-kicker">Quick Start</div>
              <h2 style="margin:0">Zone de lucru inventar</h2>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <a class="crm-btn" href="/inventory/assets">Active</a>
              <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Inventar pe proiect</a>
              <a class="crm-btn crm-btn-secondary" href="/inventory/counts">Numărare inventar</a>
            </div>
          </div>
          <div class="crm-grid-2" style="margin-top:16px">
            <div class="crm-card" style="margin:0">
              <div class="crm-page-kicker">Alerte</div>
              <div style="font-size:24px;font-weight:800">${Number(stats.low_stock_assets || 0)}</div>
              <div class="crm-muted">active sub minimul scriptic</div>
            </div>
            <div class="crm-card" style="margin:0">
              <div class="crm-page-kicker">Numărări</div>
              <div style="font-size:24px;font-weight:800">${Number(countStats.draft_counts || 0)}</div>
              <div class="crm-muted">${Number(countStats.applied_counts || 0)} inventare cu corecții aplicate</div>
            </div>
          </div>
        </section>

        <section class="crm-card">
          <div class="crm-page-kicker">Raport rapid</div>
          <h2 style="margin-top:0">Ce trebuie urmărit</h2>
          <div style="display:grid;gap:12px">
            <div style="padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#fff7ed">
              <strong>${Number(stats.low_stock_assets || 0)} active sunt sub minim</strong>
              <div class="crm-muted">Verifică reîncărcarea sau transferul între locații.</div>
            </div>
            <div style="padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#eff6ff">
              <strong>${Number(projectStats.active_projects || 0)} proiecte au consum/inventar activ</strong>
              <div class="crm-muted">Poți urmări pe proiect ce s-a alocat și ce trebuie returnat.</div>
            </div>
            <div style="padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#f8fafc">
              <strong>${Number(countStats.total_counts || 0)} sesiuni de numărare</strong>
              <div class="crm-muted">Importă un fișier CSV și compară scriptic vs faptic.</div>
            </div>
          </div>
        </section>
      </div>

      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <h3 style="margin:0">Active cu prag minim atins</h3>
            <a href="/inventory/reports" class="crm-btn crm-btn-secondary">Raport inventar</a>
          </div>
          <div class="crm-table-wrap" style="margin-top:12px">
            <table class="crm-table">
              <thead><tr><th>Cod</th><th>Denumire</th><th>Locație</th><th>Scriptic</th><th>Minim</th></tr></thead>
              <tbody>
                ${lowStock.length ? lowStock.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.asset_code || "—")}</td>
                    <td>${escapeHtml(row.asset_name || "—")}</td>
                    <td>${escapeHtml(row.location || "—")}</td>
                    <td>${Number(row.quantity_scriptic || 0)}</td>
                    <td>${Number(row.minimum_quantity || 0)}</td>
                  </tr>
                `).join("") : `<tr><td colspan="5" class="crm-muted">Nu există active sub minim în acest moment.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>

        <section class="crm-card">
          <h3 style="margin-top:0">Ultimele proiecte și numărări</h3>
          <div style="display:grid;gap:12px">
            ${recentProjects.map((row) => `
              <a href="/inventory/projects/${row.id}" style="display:block;padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#fff;text-decoration:none;color:inherit">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <strong>${escapeHtml(row.project_name || row.project_code || "Proiect")}</strong>
                  ${inventoryStatusBadge(escapeHtml, row.status)}
                </div>
                <div class="crm-muted">${escapeHtml(row.project_code || "—")} · ${escapeHtml(row.client_name || "client nesetat")} · ${escapeHtml(row.location || "fără locație")}</div>
              </a>
            `).join("")}
            ${latestCounts.map((row) => `
              <a href="/inventory/counts/${row.id}" style="display:block;padding:14px 16px;border-radius:18px;border:1px solid #e2e8f0;background:#f8fafc;text-decoration:none;color:inherit">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <strong>${escapeHtml(row.title || "Inventar")}</strong>
                  ${inventoryStatusBadge(escapeHtml, row.status)}
                </div>
                <div class="crm-muted">${escapeHtml(row.count_date || "—")} · ${escapeHtml(row.source_file_name || "fără fișier sursă")}</div>
              </a>
            `).join("")}
            ${!recentProjects.length && !latestCounts.length ? `<div class="crm-muted">Modulul este gata de lucru. Adaugă active, proiecte și prima sesiune de numărare.</div>` : ""}
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-home", "Inventar", "Administrare mijloace fixe, obiecte mobile, proiecte și numărări de inventar.", req, html));
  });

  app.get("/inventory/assets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildAssetFilterState(req.query);
    const { whereSql, params } = buildAssetWhere(filters, companyId);
    const rows = db.prepare(`
      SELECT *
      FROM inventory_assets
      WHERE ${whereSql}
      ORDER BY asset_name COLLATE NOCASE ASC, id DESC
      LIMIT 500
    `).all(...params);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <h2 style="margin-top:0">Active noi</h2>
          <div class="crm-muted" style="margin-bottom:12px">Poți folosi și varianta rapidă: doar denumire, cantitate și locație.</div>
          <form method="post" action="/inventory/assets">
            <div class="crm-grid-2">
              <div><label>Cod activ</label><input name="asset_code" required placeholder="INV-001" /></div>
              <div><label>Denumire</label><input name="asset_name" required placeholder="Laptop Dell Latitude" /></div>
              <div>
                <label>Tip</label>
                <select name="asset_type">
                  <option value="MIJLOC_FIX">Mijloc fix</option>
                  <option value="OBIECT_INVENTAR">Obiect mobil</option>
                </select>
              </div>
              <div>
                <label>Categorie</label>
                <select name="category">
                  <option value="MOBIL">Mobil</option>
                  <option value="IT">IT</option>
                  <option value="UTILAJ">Utilaj</option>
                  <option value="CONSUMABILE">Consumabile</option>
                </select>
              </div>
              <div><label>Unitate</label><input name="unit" value="buc" /></div>
              <div><label>Cantitate scriptică</label><input type="number" step="0.01" name="quantity_scriptic" value="1" /></div>
              <div><label>Prag minim</label><input type="number" step="0.01" name="minimum_quantity" value="0" /></div>
              <div><label>Status</label><input name="status" value="IN_STOC" /></div>
              <div><label>Locație</label><input name="location" placeholder="Depozit / birou / auto" /></div>
              <div><label>Serie / SN</label><input name="serial_number" /></div>
              <div><label>Data achiziției</label><input type="date" name="purchase_date" /></div>
              <div><label>Valoare achiziție</label><input type="number" step="0.01" name="purchase_value" value="0" /></div>
              <div><label>Furnizor</label><input name="supplier_name" /></div>
              <div><label>Nr. factură</label><input name="invoice_number" /></div>
            </div>
            <div style="margin-top:12px">
              <label>Observații</label>
              <textarea name="notes" rows="4" placeholder="Detalii utile despre activ, locație, utilizare..."></textarea>
            </div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Adaugă activ</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Registru inventar</h2>
              <div class="crm-muted">Mijloace fixe și obiecte mobile, cu stoc scriptic și praguri minime.</div>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/reports">Raport inventar</a>
          </div>
          <form method="get" action="/inventory/assets" class="crm-grid-2" style="margin-top:14px">
            <div><label>Căutare</label><input name="search" value="${escapeHtml(filters.search)}" placeholder="cod, denumire, locație, serie" /></div>
            <div><label>Tip</label><select name="type"><option value="">Toate</option><option value="MIJLOC_FIX" ${filters.type === "MIJLOC_FIX" ? "selected" : ""}>Mijloace fixe</option><option value="OBIECT_INVENTAR" ${filters.type === "OBIECT_INVENTAR" ? "selected" : ""}>Obiecte mobile</option></select></div>
            <div><label>Status</label><select name="status"><option value="">Toate</option><option value="IN_STOC" ${filters.status === "IN_STOC" ? "selected" : ""}>În stoc</option><option value="ALOCAT" ${filters.status === "ALOCAT" ? "selected" : ""}>Alocat</option><option value="IN_SERVICE" ${filters.status === "IN_SERVICE" ? "selected" : ""}>În service</option><option value="CASAT" ${filters.status === "CASAT" ? "selected" : ""}>Casat</option></select></div>
            <div style="display:flex;align-items:end;gap:10px"><button class="crm-btn" type="submit">Filtrează</button><a class="crm-btn crm-btn-secondary" href="/inventory/assets">Resetează</a></div>
          </form>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead>
                <tr><th>Cod</th><th>Denumire</th><th>Tip</th><th>Status</th><th>Locație</th><th>Scriptic</th><th>Minim</th><th>Valoare</th><th>Acțiuni</th></tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.asset_code || "—")}</td>
                    <td>
                      <strong>${escapeHtml(row.asset_name || "—")}</strong>
                      <div class="crm-muted">${escapeHtml(row.serial_number || row.notes || "fără serie / observații")}</div>
                    </td>
                    <td>${assetTypeBadge(row.asset_type)}</td>
                    <td>${inventoryStatusBadge(escapeHtml, row.status)}</td>
                    <td>${escapeHtml(row.location || "—")}</td>
                    <td>${Number(row.quantity_scriptic || 0)} ${escapeHtml(row.unit || "buc")}</td>
                    <td>${Number(row.minimum_quantity || 0)}</td>
                    <td>${fmtMoney(row.purchase_value || 0)}</td>
                    <td>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <a class="crm-btn crm-btn-secondary" href="/inventory/assets/${row.id}">Editează</a>
                        <form method="post" action="/inventory/assets/${row.id}/delete" onsubmit="return confirm('Ștergi activul din inventar?')" style="margin:0">
                          <button class="crm-btn crm-btn-danger" type="submit">Șterge</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="9" class="crm-muted">Nu există active înregistrate încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-assets", "Inventar", "Registrul complet al activelor fixe și mobile.", req, html));
  });

  app.post("/inventory/assets", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createAssetRecord(db, req, companyId, req.body);
    res.redirect("/inventory/assets");
  });

  app.post("/inventory/assets/quick", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createAssetRecord(db, req, companyId, {
      asset_name: req.body.asset_name,
      quantity_scriptic: req.body.quantity_scriptic,
      location: req.body.location,
      asset_type: req.body.asset_type,
      category: req.body.asset_type === "MIJLOC_FIX" ? "IMOBILIZARI" : "MOBIL",
      unit: "buc",
      status: "IN_STOC"
    });
    res.redirect("/inventory");
  });

  app.get("/inventory/assets/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const asset = db.prepare(`SELECT * FROM inventory_assets WHERE id=? AND company_id=?`).get(assetId, companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    const usage = db.prepare(`
      SELECT COUNT(*) AS project_links FROM inventory_project_items WHERE asset_id=? AND company_id=?
    `).get(assetId, companyId) || {};
    const adjustments = db.prepare(`
      SELECT COUNT(*) AS adjustment_links FROM inventory_adjustments WHERE asset_id=? AND company_id=?
    `).get(assetId, companyId) || {};
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <div class="crm-page-kicker">${escapeHtml(asset.asset_code || "ACTIV")}</div>
              <h2 style="margin:0">${escapeHtml(asset.asset_name || "Activ inventar")}</h2>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/assets">Înapoi la registru</a>
          </div>
          <form method="post" action="/inventory/assets/${asset.id}" style="margin-top:14px">
            <div class="crm-grid-2">
              <div><label>Cod activ</label><input name="asset_code" value="${escapeHtml(asset.asset_code || "")}" required /></div>
              <div><label>Denumire</label><input name="asset_name" value="${escapeHtml(asset.asset_name || "")}" required /></div>
              <div><label>Tip</label><select name="asset_type"><option value="MIJLOC_FIX" ${String(asset.asset_type) === "MIJLOC_FIX" ? "selected" : ""}>Mijloc fix</option><option value="OBIECT_INVENTAR" ${String(asset.asset_type) === "OBIECT_INVENTAR" ? "selected" : ""}>Obiect mobil</option></select></div>
              <div><label>Categorie</label><input name="category" value="${escapeHtml(asset.category || "")}" /></div>
              <div><label>Unitate</label><input name="unit" value="${escapeHtml(asset.unit || "buc")}" /></div>
              <div><label>Cantitate scriptică</label><input type="number" step="0.01" name="quantity_scriptic" value="${Number(asset.quantity_scriptic || 0)}" /></div>
              <div><label>Prag minim</label><input type="number" step="0.01" name="minimum_quantity" value="${Number(asset.minimum_quantity || 0)}" /></div>
              <div><label>Status</label><input name="status" value="${escapeHtml(asset.status || "IN_STOC")}" /></div>
              <div><label>Locație</label><input name="location" value="${escapeHtml(asset.location || "")}" /></div>
              <div><label>Serie / SN</label><input name="serial_number" value="${escapeHtml(asset.serial_number || "")}" /></div>
              <div><label>Data achiziției</label><input type="date" name="purchase_date" value="${escapeHtml(asset.purchase_date || "")}" /></div>
              <div><label>Valoare achiziție</label><input type="number" step="0.01" name="purchase_value" value="${Number(asset.purchase_value || 0)}" /></div>
              <div><label>Furnizor</label><input name="supplier_name" value="${escapeHtml(asset.supplier_name || "")}" /></div>
              <div><label>Nr. factură</label><input name="invoice_number" value="${escapeHtml(asset.invoice_number || "")}" /></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4">${escapeHtml(asset.notes || "")}</textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Salvează modificările</button></div>
          </form>
          <form method="post" action="/inventory/assets/${asset.id}/delete" onsubmit="return confirm('Ștergi activul din inventar?')" style="margin-top:10px">
            <button class="crm-btn crm-btn-danger" type="submit">Șterge activul</button>
          </form>
        </section>

        <section class="crm-card">
          <h3 style="margin-top:0">Legături active</h3>
          <div class="crm-grid-2">
            <div class="crm-card" style="margin:0"><div class="crm-muted">Alocări pe proiecte</div><div style="font-size:24px;font-weight:800">${Number(usage.project_links || 0)}</div></div>
            <div class="crm-card" style="margin:0"><div class="crm-muted">Corecții inventar</div><div style="font-size:24px;font-weight:800">${Number(adjustments.adjustment_links || 0)}</div></div>
          </div>
          <div class="crm-muted" style="margin-top:12px">Dacă activul are legături istorice, ștergerea este blocată pentru a păstra trasabilitatea.</div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-assets", "Editare activ", "Actualizează datele unui activ din inventar.", req, html));
  });

  app.post("/inventory/assets/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const asset = db.prepare(`SELECT id FROM inventory_assets WHERE id=? AND company_id=?`).get(assetId, companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    updateAssetRecord(db, req, companyId, assetId, req.body);
    res.redirect(`/inventory/assets/${assetId}`);
  });

  app.post("/inventory/assets/:id/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const assetId = Number(req.params.id || 0);
    const links = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM inventory_project_items WHERE asset_id=? AND company_id=?) AS project_links,
        (SELECT COUNT(*) FROM inventory_count_items WHERE asset_id=? AND company_id=?) AS count_links,
        (SELECT COUNT(*) FROM inventory_adjustments WHERE asset_id=? AND company_id=?) AS adjustment_links
    `).get(assetId, companyId, assetId, companyId, assetId, companyId) || {};
    if (Number(links.project_links || 0) || Number(links.count_links || 0) || Number(links.adjustment_links || 0)) {
      return res.status(400).send("Activul nu poate fi șters deoarece are alocări, numărări sau corecții deja înregistrate.");
    }
    db.prepare(`DELETE FROM inventory_assets WHERE id=? AND company_id=?`).run(assetId, companyId);
    res.redirect("/inventory/assets");
  });

  app.get("/inventory/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        p.*,
        COUNT(i.id) AS allocated_lines,
        COALESCE(SUM(i.quantity_allocated - i.quantity_returned), 0) AS active_quantity
      FROM inventory_projects p
      LEFT JOIN inventory_project_items i ON i.project_id = p.id
      WHERE p.company_id=?
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT 300
    `).all(companyId);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <h2 style="margin-top:0">Proiect nou</h2>
          <form method="post" action="/inventory/projects">
            <div class="crm-grid-2">
              <div><label>Cod proiect</label><input name="project_code" required placeholder="PRJ-001" /></div>
              <div><label>Denumire</label><input name="project_name" required placeholder="Sediu client X" /></div>
              <div><label>Client</label><input name="client_name" /></div>
              <div><label>Locație</label><input name="location" /></div>
              <div><label>Data start</label><input type="date" name="start_date" /></div>
              <div><label>Data final</label><input type="date" name="end_date" /></div>
              <div><label>Status</label><select name="status"><option value="ACTIV">Activ</option><option value="INCHIS">Închis</option></select></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4"></textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Creează proiect</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Inventar pe proiect</h2>
              <div class="crm-muted">Aici urmărești ce s-a luat pe fiecare proiect și ce trebuie returnat.</div>
            </div>
          </div>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead><tr><th>Proiect</th><th>Client</th><th>Status</th><th>Articole</th><th>Cantitate activă</th><th>Acțiuni</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.project_name || "—")}</strong><div class="crm-muted">${escapeHtml(row.project_code || "—")} · ${escapeHtml(row.location || "fără locație")}</div></td>
                    <td>${escapeHtml(row.client_name || "—")}</td>
                    <td>${inventoryStatusBadge(escapeHtml, row.status)}</td>
                    <td>${Number(row.allocated_lines || 0)}</td>
                    <td>${Number(row.active_quantity || 0)}</td>
                    <td>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <a class="crm-btn crm-btn-secondary" href="/inventory/projects/${row.id}">Deschide</a>
                        <a class="crm-btn crm-btn-secondary" href="/inventory/projects/${row.id}/edit">Editează</a>
                        <form method="post" action="/inventory/projects/${row.id}/delete" onsubmit="return confirm('Ștergi proiectul și alocările lui?')" style="margin:0">
                          <button class="crm-btn crm-btn-danger" type="submit">Șterge</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="crm-muted">Nu există proiecte de inventar încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-projects", "Inventar pe proiect", "Alocă active pe proiect și urmărește retururile.", req, html));
  });

  app.post("/inventory/projects", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    createProjectRecord(db, req, companyId, req.body);
    res.redirect("/inventory/projects");
  });

  app.get("/inventory/projects/:id/edit", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT * FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const allocationStats = db.prepare(`
      SELECT COUNT(*) AS total_lines, COALESCE(SUM(quantity_allocated - quantity_returned),0) AS active_qty
      FROM inventory_project_items
      WHERE project_id=? AND company_id=?
    `).get(projectId, companyId) || {};
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <div class="crm-page-kicker">${escapeHtml(project.project_code || "PROIECT")}</div>
              <h2 style="margin:0">${escapeHtml(project.project_name || "Editare proiect")}</h2>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Înapoi la proiecte</a>
          </div>
          <form method="post" action="/inventory/projects/${project.id}" style="margin-top:14px">
            <div class="crm-grid-2">
              <div><label>Cod proiect</label><input name="project_code" value="${escapeHtml(project.project_code || "")}" required /></div>
              <div><label>Denumire</label><input name="project_name" value="${escapeHtml(project.project_name || "")}" required /></div>
              <div><label>Client</label><input name="client_name" value="${escapeHtml(project.client_name || "")}" /></div>
              <div><label>Locație</label><input name="location" value="${escapeHtml(project.location || "")}" /></div>
              <div><label>Data start</label><input type="date" name="start_date" value="${escapeHtml(project.start_date || "")}" /></div>
              <div><label>Data final</label><input type="date" name="end_date" value="${escapeHtml(project.end_date || "")}" /></div>
              <div><label>Status</label><select name="status"><option value="ACTIV" ${String(project.status) === "ACTIV" ? "selected" : ""}>Activ</option><option value="INCHIS" ${String(project.status) === "INCHIS" ? "selected" : ""}>Închis</option></select></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4">${escapeHtml(project.notes || "")}</textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Salvează proiectul</button></div>
          </form>
          <form method="post" action="/inventory/projects/${project.id}/delete" onsubmit="return confirm('Ștergi proiectul și alocările lui?')" style="margin-top:10px">
            <button class="crm-btn crm-btn-danger" type="submit">Șterge proiectul</button>
          </form>
        </section>

        <section class="crm-card">
          <h3 style="margin-top:0">Rezumat proiect</h3>
          <div class="crm-grid-2">
            <div class="crm-card" style="margin:0"><div class="crm-muted">Linii inventar</div><div style="font-size:24px;font-weight:800">${Number(allocationStats.total_lines || 0)}</div></div>
            <div class="crm-card" style="margin:0"><div class="crm-muted">Cantitate activă</div><div style="font-size:24px;font-weight:800">${Number(allocationStats.active_qty || 0)}</div></div>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-projects", "Editare proiect", "Actualizează datele și statusul proiectului.", req, html));
  });

  app.post("/inventory/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT id FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    updateProjectRecord(db, companyId, projectId, req.body);
    res.redirect(`/inventory/projects/${projectId}/edit`);
  });

  app.post("/inventory/projects/:id/delete", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const linkedCount = db.prepare(`SELECT COUNT(*) AS total FROM inventory_project_items WHERE project_id=? AND company_id=?`).get(projectId, companyId) || {};
    if (Number(linkedCount.total || 0) > 0) {
      db.prepare(`DELETE FROM inventory_project_items WHERE project_id=? AND company_id=?`).run(projectId, companyId);
    }
    db.prepare(`DELETE FROM inventory_projects WHERE id=? AND company_id=?`).run(projectId, companyId);
    res.redirect("/inventory/projects");
  });

  app.get("/inventory/projects/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT * FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const allocations = db.prepare(`
      SELECT *
      FROM inventory_project_items
      WHERE project_id=? AND company_id=?
      ORDER BY assigned_at DESC, id DESC
    `).all(projectId, companyId);
    const assets = db.prepare(`
      SELECT id, asset_code, asset_name, quantity_scriptic, unit, status
      FROM inventory_assets
      WHERE company_id=? AND UPPER(COALESCE(status,'')) <> 'CASAT'
      ORDER BY asset_name COLLATE NOCASE ASC
      LIMIT 300
    `).all(companyId);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <div class="crm-page-kicker">${escapeHtml(project.project_code || "PROIECT")}</div>
          <h2 style="margin-top:0">${escapeHtml(project.project_name || "Inventar proiect")}</h2>
          <div class="crm-muted">${escapeHtml(project.client_name || "client nesetat")} · ${escapeHtml(project.location || "fără locație")}</div>
          <div style="margin:12px 0 18px 0">${inventoryStatusBadge(escapeHtml, project.status)}</div>
          <form method="post" action="/inventory/projects/${project.id}/items">
            <h3 style="margin-top:0">Adaugă inventar pe proiect</h3>
            <div>
              <label>Activ</label>
              <select name="asset_id" required>
                <option value="">Selectează activ</option>
                ${assets.map((asset) => `<option value="${asset.id}">${escapeHtml(asset.asset_code)} · ${escapeHtml(asset.asset_name)} · ${Number(asset.quantity_scriptic || 0)} ${escapeHtml(asset.unit || "buc")}</option>`).join("")}
              </select>
            </div>
            <div class="crm-grid-2" style="margin-top:12px">
              <div><label>Cantitate alocată</label><input type="number" step="0.01" name="quantity_allocated" value="1" /></div>
              <div><label>Cantitate returnată</label><input type="number" step="0.01" name="quantity_returned" value="0" /></div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4"></textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Adaugă pe proiect</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Alocări inventar</h2>
              <div class="crm-muted">Tot ce s-a luat pe acest proiect și ce mai este în teren.</div>
            </div>
            <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Înapoi la proiecte</a>
          </div>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead><tr><th>Activ</th><th>Alocat</th><th>Returnat</th><th>Rămas pe proiect</th><th>Data</th><th>Observații</th></tr></thead>
              <tbody>
                ${allocations.length ? allocations.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.asset_name || "—")}</strong><div class="crm-muted">${escapeHtml(row.asset_code || "—")}</div></td>
                    <td>${Number(row.quantity_allocated || 0)}</td>
                    <td>${Number(row.quantity_returned || 0)}</td>
                    <td>${Number((row.quantity_allocated || 0) - (row.quantity_returned || 0))}</td>
                    <td>${escapeHtml(row.assigned_at || "—")}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="crm-muted">Nu există active alocate încă pe proiect.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-projects", "Inventar pe proiect", "Detaliu proiect și active alocate.", req, html));
  });

  app.post("/inventory/projects/:id/items", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const projectId = Number(req.params.id || 0);
    const project = db.prepare(`SELECT id FROM inventory_projects WHERE id=? AND company_id=?`).get(projectId, companyId);
    if (!project) return res.status(404).send("Proiectul nu a fost găsit.");
    const asset = db.prepare(`SELECT * FROM inventory_assets WHERE id=? AND company_id=?`).get(Number(req.body.asset_id || 0), companyId);
    if (!asset) return res.status(404).send("Activul nu a fost găsit.");
    const allocated = parseNumber(req.body.quantity_allocated, 1);
    const returned = parseNumber(req.body.quantity_returned, 0);
    db.prepare(`
      INSERT INTO inventory_project_items (
        company_id, project_id, asset_id, asset_code, asset_name, quantity_allocated,
        quantity_returned, assigned_by_email, notes
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      companyId,
      projectId,
      asset.id,
      asset.asset_code,
      asset.asset_name,
      allocated,
      returned,
      req.session.user.email,
      safeText(req.body.notes)
    );
    db.prepare(`UPDATE inventory_assets SET status='ALOCAT', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(asset.id, companyId);
    db.prepare(`UPDATE inventory_projects SET updated_at=datetime('now') WHERE id=? AND company_id=?`).run(projectId, companyId);
    res.redirect(`/inventory/projects/${projectId}`);
  });

  app.get("/inventory/reports", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const byType = db.prepare(`
      SELECT asset_type, COUNT(*) AS total_items, SUM(quantity_scriptic) AS total_qty, SUM(quantity_scriptic * purchase_value) AS total_value
      FROM inventory_assets
      WHERE company_id=?
      GROUP BY asset_type
      ORDER BY asset_type
    `).all(companyId);
    const byLocation = db.prepare(`
      SELECT COALESCE(NULLIF(location,''), 'Fără locație') AS label, COUNT(*) AS total_items, SUM(quantity_scriptic) AS total_qty
      FROM inventory_assets
      WHERE company_id=?
      GROUP BY COALESCE(NULLIF(location,''), 'Fără locație')
      ORDER BY total_qty DESC, label ASC
      LIMIT 20
    `).all(companyId);
    const openProjects = db.prepare(`
      SELECT p.project_name, p.project_code, COALESCE(SUM(i.quantity_allocated - i.quantity_returned),0) AS qty
      FROM inventory_projects p
      LEFT JOIN inventory_project_items i ON i.project_id = p.id
      WHERE p.company_id=? AND UPPER(COALESCE(p.status,''))='ACTIV'
      GROUP BY p.id
      ORDER BY qty DESC, p.project_name COLLATE NOCASE ASC
      LIMIT 20
    `).all(companyId);
    const html = `
      <div class="crm-grid-2">
        <section class="crm-card">
          <h2 style="margin-top:0">Raport pe tip de activ</h2>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead><tr><th>Tip</th><th>Poziții</th><th>Cantitate</th><th>Valoare</th></tr></thead>
              <tbody>
                ${byType.length ? byType.map((row) => `
                  <tr>
                    <td>${assetTypeBadge(row.asset_type)}</td>
                    <td>${Number(row.total_items || 0)}</td>
                    <td>${Number(row.total_qty || 0)}</td>
                    <td>${fmtMoney(row.total_value || 0)}</td>
                  </tr>
                `).join("") : `<tr><td colspan="4" class="crm-muted">Nu există date încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
        <section class="crm-card">
          <h2 style="margin-top:0">Raport pe locații</h2>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead><tr><th>Locație</th><th>Poziții</th><th>Cantitate</th></tr></thead>
              <tbody>
                ${byLocation.length ? byLocation.map((row) => `
                  <tr><td>${escapeHtml(row.label || "—")}</td><td>${Number(row.total_items || 0)}</td><td>${Number(row.total_qty || 0)}</td></tr>
                `).join("") : `<tr><td colspan="3" class="crm-muted">Nu există date încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="crm-card">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <h2 style="margin:0">Inventar activ pe proiecte</h2>
            <div class="crm-muted">Cantități încă ieșite în teren, pe proiectele active.</div>
          </div>
          <a class="crm-btn crm-btn-secondary" href="/inventory/projects">Deschide proiectele</a>
        </div>
        <div class="crm-table-wrap" style="margin-top:14px">
          <table class="crm-table">
            <thead><tr><th>Proiect</th><th>Cod</th><th>Cantitate activă</th></tr></thead>
            <tbody>
              ${openProjects.length ? openProjects.map((row) => `
                <tr><td>${escapeHtml(row.project_name || "—")}</td><td>${escapeHtml(row.project_code || "—")}</td><td>${Number(row.qty || 0)}</td></tr>
              `).join("") : `<tr><td colspan="3" class="crm-muted">Nu există proiecte active cu inventar alocat.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-reports", "Raport inventar", "Rapoarte operaționale pentru active, locații și proiecte.", req, html));
  });

  app.get("/inventory/counts", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const rows = db.prepare(`
      SELECT
        c.*,
        COUNT(i.id) AS line_count,
        SUM(CASE WHEN ABS(COALESCE(i.variance,0)) > 0.0001 THEN 1 ELSE 0 END) AS variance_lines
      FROM inventory_counts c
      LEFT JOIN inventory_count_items i ON i.count_id = c.id
      WHERE c.company_id=?
      GROUP BY c.id
      ORDER BY c.count_date DESC, c.id DESC
      LIMIT 300
    `).all(companyId);
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <h2 style="margin-top:0">Numărare nouă</h2>
          <form method="post" action="/inventory/counts" enctype="multipart/form-data">
            <div><label>Titlu inventar</label><input name="title" value="Inventar lunar" required /></div>
            <div class="crm-grid-2" style="margin-top:12px">
              <div><label>Data numărării</label><input type="date" name="count_date" value="${escapeHtml(parseDate(new Date().toISOString().slice(0, 10)))}" /></div>
              <div><label>Status</label><select name="status"><option value="DRAFT">Draft</option><option value="FINALIZAT">Finalizat</option></select></div>
            </div>
            <div style="margin-top:12px">
              <label>Fișier numărare</label>
              <input type="file" name="count_file" accept=".csv,.txt" />
              <div class="crm-muted" style="margin-top:6px">CSV cu coloane <code>asset_code</code> și <code>quantity_counted</code>. Opțional: <code>notes</code>, <code>asset_name</code>.</div>
            </div>
            <div style="margin-top:12px"><label>Observații</label><textarea name="notes" rows="4"></textarea></div>
            <div style="margin-top:14px"><button class="crm-btn" type="submit">Creează sesiune de numărare</button></div>
          </form>
        </section>

        <section class="crm-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <h2 style="margin:0">Sesiuni de inventar</h2>
              <div class="crm-muted">Compară scriptic cu faptic și aplică corecțiile unde este nevoie.</div>
            </div>
          </div>
          <div class="crm-table-wrap" style="margin-top:14px">
            <table class="crm-table">
              <thead><tr><th>Titlu</th><th>Data</th><th>Status</th><th>Linii</th><th>Diferențe</th><th>Acțiuni</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.title || "Inventar")}</strong><div class="crm-muted">${escapeHtml(row.source_file_name || "fără fișier sursă")}</div></td>
                    <td>${escapeHtml(row.count_date || "—")}</td>
                    <td>${inventoryStatusBadge(escapeHtml, row.status)}</td>
                    <td>${Number(row.line_count || 0)}</td>
                    <td>${Number(row.variance_lines || 0)}</td>
                    <td><a class="crm-btn crm-btn-secondary" href="/inventory/counts/${row.id}">Deschide</a></td>
                  </tr>
                `).join("") : `<tr><td colspan="6" class="crm-muted">Nu există sesiuni de numărare încă.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-counts", "Numărare inventar", "Importă fișierul de numărare și compară scriptic cu faptic.", req, html));
  });

  app.post("/inventory/counts", requireAuth, upload.single("count_file"), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    let fileInfo = null;
    let parsedRows = [];
    if (req.file) {
      fileInfo = saveUploadedFile({ fs, path, __dirname, file: req.file });
      parsedRows = parseCountFile(fs.readFileSync(fileInfo.fullPath, "utf8"));
    }

    const insertCount = db.prepare(`
      INSERT INTO inventory_counts (
        company_id, title, count_date, status, source_file_name, notes, created_by_email, updated_at
      ) VALUES (?,?,?,?,?,?,?,datetime('now'))
    `).run(
      companyId,
      safeText(req.body.title) || "Inventar",
      parseDate(req.body.count_date) || new Date().toISOString().slice(0, 10),
      safeText(req.body.status) || "DRAFT",
      fileInfo?.fileName || "",
      safeText(req.body.notes),
      req.session.user.email
    );
    const countId = Number(insertCount.lastInsertRowid || 0);

    const insertItem = db.prepare(`
      INSERT INTO inventory_count_items (
        company_id, count_id, asset_id, asset_code, asset_name, quantity_scriptic, quantity_counted, variance, notes
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const assetsByCode = db.prepare(`SELECT id, asset_code, asset_name, quantity_scriptic FROM inventory_assets WHERE company_id=?`).all(companyId);
    const assetMap = new Map(assetsByCode.map((row) => [String(row.asset_code || "").trim().toLowerCase(), row]));
    if (parsedRows.length) {
      for (const row of parsedRows) {
        const asset = assetMap.get(String(row.asset_code || "").trim().toLowerCase()) || null;
        const scriptic = Number(asset?.quantity_scriptic || 0);
        const counted = Number(row.quantity_counted || 0);
        insertItem.run(
          companyId,
          countId,
          asset?.id || null,
          safeText(row.asset_code),
          safeText(row.asset_name) || safeText(asset?.asset_name),
          scriptic,
          counted,
          counted - scriptic,
          safeText(row.notes)
        );
      }
    } else {
      for (const asset of assetsByCode) {
        insertItem.run(
          companyId,
          countId,
          asset.id,
          asset.asset_code,
          asset.asset_name,
          Number(asset.quantity_scriptic || 0),
          Number(asset.quantity_scriptic || 0),
          0,
          ""
        );
      }
    }
    res.redirect(`/inventory/counts/${countId}`);
  });

  app.get("/inventory/counts/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const count = db.prepare(`SELECT * FROM inventory_counts WHERE id=? AND company_id=?`).get(countId, companyId);
    if (!count) return res.status(404).send("Sesiunea de inventar nu a fost găsită.");
    const items = db.prepare(`
      SELECT *
      FROM inventory_count_items
      WHERE count_id=? AND company_id=?
      ORDER BY ABS(COALESCE(variance,0)) DESC, asset_name COLLATE NOCASE ASC
      LIMIT 1000
    `).all(countId, companyId);
    const varianceCount = items.filter((row) => Math.abs(Number(row.variance || 0)) > 0.0001).length;
    const unappliedCount = items.filter((row) => Number(row.applied || 0) === 0 && Math.abs(Number(row.variance || 0)) > 0.0001).length;
    const html = `
      <div class="crm-grid-2" style="align-items:start">
        <section class="crm-card" style="position:sticky;top:20px">
          <div class="crm-page-kicker">Scriptic vs faptic</div>
          <h2 style="margin-top:0">${escapeHtml(count.title || "Inventar")}</h2>
          <div class="crm-muted">${escapeHtml(count.count_date || "—")} · ${escapeHtml(count.source_file_name || "fără fișier sursă")}</div>
          <div style="margin:14px 0">${inventoryStatusBadge(escapeHtml, count.status)}</div>
          <div class="crm-grid-2">
            <div class="crm-card" style="margin:0"><div class="crm-muted">Linii</div><div style="font-size:24px;font-weight:800">${items.length}</div></div>
            <div class="crm-card" style="margin:0"><div class="crm-muted">Diferențe</div><div style="font-size:24px;font-weight:800">${varianceCount}</div></div>
          </div>
          <div class="crm-grid-2" style="margin-top:12px">
            <form method="post" action="/inventory/counts/${count.id}/apply">
              <button class="crm-btn" type="submit" ${unappliedCount ? "" : "disabled"}>Aplică corecțiile</button>
            </form>
            <a class="crm-btn crm-btn-secondary" href="/inventory/counts/export/${count.id}.csv">Export CSV</a>
          </div>
          <div class="crm-muted" style="margin-top:12px">${escapeHtml(count.notes || "Fără observații.")}</div>
        </section>

        <section class="crm-card">
          <h2 style="margin-top:0">Linii de numărare</h2>
          <div class="crm-table-wrap">
            <table class="crm-table">
              <thead><tr><th>Cod</th><th>Activ</th><th>Scriptic</th><th>Faptic</th><th>Diferență</th><th>Aplicat</th><th>Observații</th></tr></thead>
              <tbody>
                ${items.length ? items.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.asset_code || "—")}</td>
                    <td>${escapeHtml(row.asset_name || "—")}</td>
                    <td>${Number(row.quantity_scriptic || 0)}</td>
                    <td>${Number(row.quantity_counted || 0)}</td>
                    <td>${countVarianceBadge(row.variance)}</td>
                    <td>${Number(row.applied || 0) ? `<span class="crm-badge crm-badge-green">da</span>` : `<span class="crm-badge crm-badge-neutral">nu</span>`}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                  </tr>
                `).join("") : `<tr><td colspan="7" class="crm-muted">Nu există linii în această sesiune.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    res.send(inventoryShell(crmShellStart, crmShellEnd, "inventory-counts", "Detaliu numărare", "Compară scriptic cu faptic și aplică diferențele.", req, html));
  });

  app.post("/inventory/counts/:id/apply", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const count = db.prepare(`SELECT * FROM inventory_counts WHERE id=? AND company_id=?`).get(countId, companyId);
    if (!count) return res.status(404).send("Sesiunea de inventar nu a fost găsită.");
    const rows = db.prepare(`
      SELECT *
      FROM inventory_count_items
      WHERE count_id=? AND company_id=? AND applied=0 AND ABS(COALESCE(variance,0)) > 0.0001
      ORDER BY id ASC
    `).all(countId, companyId);
    const insertAdjustment = db.prepare(`
      INSERT INTO inventory_adjustments (
        company_id, asset_id, count_id, asset_code, quantity_before, quantity_after, variance, reason, created_by_email
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const updateAsset = db.prepare(`
      UPDATE inventory_assets
      SET quantity_scriptic=?, status=?, updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `);
    const markApplied = db.prepare(`UPDATE inventory_count_items SET applied=1 WHERE id=? AND company_id=?`);

    for (const row of rows) {
      if (!row.asset_id) continue;
      const quantityAfter = Number(row.quantity_counted || 0);
      insertAdjustment.run(
        companyId,
        row.asset_id,
        countId,
        row.asset_code,
        Number(row.quantity_scriptic || 0),
        quantityAfter,
        Number(row.variance || 0),
        `Corecție inventar ${count.title || "Inventar"}`,
        req.session.user.email
      );
      updateAsset.run(
        quantityAfter,
        quantityAfter > 0 ? "IN_STOC" : "CASAT",
        row.asset_id,
        companyId
      );
      markApplied.run(row.id, companyId);
    }
    db.prepare(`UPDATE inventory_counts SET status='APPLIED', updated_at=datetime('now') WHERE id=? AND company_id=?`).run(countId, companyId);
    res.redirect(`/inventory/counts/${countId}`);
  });

  app.get("/inventory/counts/export/:id.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const countId = Number(req.params.id || 0);
    const rows = db.prepare(`
      SELECT asset_code, asset_name, quantity_scriptic, quantity_counted, variance, applied, notes
      FROM inventory_count_items
      WHERE count_id=? AND company_id=?
      ORDER BY asset_name COLLATE NOCASE ASC
    `).all(countId, companyId);
    const csv = [
      ["asset_code", "asset_name", "quantity_scriptic", "quantity_counted", "variance", "applied", "notes"].join(","),
      ...rows.map((row) => [
        row.asset_code,
        row.asset_name,
        row.quantity_scriptic,
        row.quantity_counted,
        row.variance,
        row.applied,
        row.notes
      ].map(csvEscape).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="inventory-count-${countId}.csv"`);
    res.send(csv);
  });
}
