import multer from "multer";
import { renderNexoraQuoteDetailPage, renderNexoraQuotesPage } from "../src/ui/nexora-quotes-page.js";

const QUOTE_IMPORT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
const QUOTE_IMPORT_ERROR_CODES = new Set([
  "client_required",
  "client_missing",
  "client_create_required",
  "file_size",
  "file_type",
  "no_file",
  "save_failed"
]);

function safeText(value = "") {
  return String(value || "").trim();
}

function quoteImportError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeFileName(value = "document") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_") || "document";
}

function decodeUploadedFileName(value = "", fallback = "document") {
  const original = safeText(value) || fallback;
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? original : decoded;
}

function normalizeClientIdentifier(value = "") {
  return safeText(value)
    .toUpperCase()
    .replace(/^RO\s*/i, "")
    .replace(/[^A-Z0-9-]/g, "");
}

function generatedClientIdentifier() {
  return `CLI-${Date.now().toString(36).toUpperCase()}`;
}

function formatQuoteImportRegistrationNumber(year, seq) {
  return `OFE-${year}-${String(seq).padStart(5, "0")}`;
}

function nextQuoteImportRegistration(db, companyId) {
  const year = new Date().getFullYear();
  let seq = Number(db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM sales_quote_imports
    WHERE company_id=? AND year=?
  `).get(companyId, year)?.next_seq || 1);
  let registrationNumber = "";
  do {
    registrationNumber = formatQuoteImportRegistrationNumber(year, seq);
    seq += 1;
  } while (db.prepare("SELECT id FROM sales_quote_imports WHERE company_id=? AND registration_number=?").get(companyId, registrationNumber));

  return { year, seq: seq - 1, registrationNumber };
}

function removeFileQuietly(fs, filePath = "") {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures after rejected uploads
  }
}

function quoteImportStorageDirectory(path, __dirname, companyId) {
  return path.join(__dirname, "uploads", "sales", "offers", `company-${companyId}`);
}

function resolveQuoteImportFilePath(path, __dirname, companyId, storedPath = "") {
  const normalized = safeText(storedPath).replaceAll("\\", "/").replace(/^\/+/, "");
  const prefix = `uploads/sales/offers/company-${companyId}/`;
  if (!normalized.startsWith(prefix)) return "";
  const appRoot = path.resolve(__dirname);
  const absolute = path.resolve(path.join(appRoot, normalized));
  return absolute.startsWith(appRoot + path.sep) ? absolute : "";
}

function resolveImportedQuoteClient(db, companyId, payload = {}) {
  const mode = safeText(payload.client_mode).toLowerCase();
  const existingClientId = Number(payload.client_id || 0);

  if (mode !== "nou") {
    if (existingClientId) {
      const client = db.prepare("SELECT id, name, cui FROM clients WHERE id=? AND company_id=?").get(existingClientId, companyId);
      if (!client) throw quoteImportError("client_missing");
      return client;
    }
    if (!safeText(payload.new_client_name)) throw quoteImportError("client_required");
  }

  const name = safeText(payload.new_client_name);
  if (!name) throw quoteImportError("client_create_required");

  const rawIdentifier = normalizeClientIdentifier(payload.new_client_cui);
  let identifier = rawIdentifier || generatedClientIdentifier();
  if (!rawIdentifier) {
    let suffix = 1;
    while (db.prepare("SELECT id FROM clients WHERE company_id=? AND cui=?").get(companyId, identifier)) {
      identifier = `${generatedClientIdentifier()}-${suffix}`;
      suffix += 1;
    }
  }

  const existing = db.prepare("SELECT id, name, cui FROM clients WHERE company_id=? AND cui=?").get(companyId, identifier);
  if (existing) return existing;

  try {
    const info = db.prepare(`
      INSERT INTO clients (cui, name, address, email, phone, vat, inactive, client_status, company_id)
      VALUES (?, ?, ?, ?, ?, 0, 0, 'verde', ?)
    `).run(
      identifier,
      name,
      safeText(payload.new_client_address) || null,
      safeText(payload.new_client_email) || null,
      safeText(payload.new_client_phone) || null,
      companyId
    );
    return { id: info.lastInsertRowid, name, cui: identifier };
  } catch (error) {
    const fallback = db.prepare("SELECT id, name, cui FROM clients WHERE company_id=? AND cui=?").get(companyId, identifier);
    if (fallback) return fallback;
    throw error;
  }
}

export function registerQuotesRoutes(app, deps) {
  const {
    COMPANY,
    Mustache,
    __dirname,
    db,
    escapeHtml,
    fmtMoney,
    hasModuleAccess,
    nextQuoteNumber,
    quoteTemplateHtml,
    recalcQuoteTotals,
    renderPdfBuffer,
    requireAuth,
    templateHtml,
    todayISO,
    crmShellStart,
    crmShellEnd,
    path,
    fs
  } = deps;

  const quoteImportTempDir = path.join(__dirname, "uploads", "quote-import-temp");
  fs.mkdirSync(quoteImportTempDir, { recursive: true });
  const quoteImportUpload = multer({ dest: quoteImportTempDir, limits: { fileSize: 30 * 1024 * 1024 } });

  function uploadQuoteImport(req, res, next) {
    quoteImportUpload.single("quote_file")(req, res, (error) => {
      if (error?.code === "LIMIT_FILE_SIZE") return res.redirect("/nexora/quotes?err=file_size");
      if (error) return res.redirect("/nexora/quotes?err=save_failed");
      return next();
    });
  }

  function redirectQuotesImport(res, params = {}) {
    const search = new URLSearchParams(params);
    const suffix = String(search) ? `?${search}` : "";
    return res.redirect(`/nexora/quotes${suffix}`);
  }

  function createQuote(req, res, redirectTo = "classic") {
    const companyId = Number(req.session.user.company_id || 0);
    const client_id = Number(req.body?.client_id);
    if (!Number.isFinite(client_id)) return res.status(400).send("client_id invalid");

    const title = String(req.body?.title || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const valid_until = String(req.body?.valid_until || "").trim();

    const vat_rate = Number(String(req.body?.vat_rate || "0").replace(",", "."));
    if (!Number.isFinite(vat_rate)) return res.status(400).send("vat_rate invalid");

    const n = nextQuoteNumber();

    const info = db.prepare(`
      INSERT INTO quotes (quote_number, year, seq, client_id, status, title, notes, vat_rate, valid_until, company_id)
      VALUES (?,?,?,?, 'DRAFT', ?, ?, ?, ?, ?)
    `).run(n.quote_number, n.year, n.seq, client_id, title || null, notes || null, vat_rate, valid_until || null, companyId);

    const id = info.lastInsertRowid;
    return res.redirect(redirectTo === "nexora" ? "/nexora/quotes/" + id : "/quote/" + id);
  }


  app.get("/nexora/quotes", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = String(req.query?.q || "").trim();
    const search = q ? `%${q}%` : null;

    const quotes = q
      ? db.prepare(`
          SELECT q.id, q.quote_number, q.status, q.total, q.valid_until, q.created_at,
                 cl.name AS client_name, cl.cui AS client_cui
          FROM quotes q
          JOIN clients cl ON cl.id = q.client_id AND cl.company_id = q.company_id
          WHERE q.company_id = ? AND (
            q.quote_number LIKE ?
            OR cl.name LIKE ?
            OR cl.cui LIKE ?
          )
          ORDER BY q.id DESC
          LIMIT 300
        `).all(companyId, search, search, search)
      : db.prepare(`
          SELECT q.id, q.quote_number, q.status, q.total, q.valid_until, q.created_at,
                 cl.name AS client_name, cl.cui AS client_cui
          FROM quotes q
          JOIN clients cl ON cl.id = q.client_id AND cl.company_id = q.company_id
          WHERE q.company_id = ?
          ORDER BY q.id DESC
          LIMIT 300
        `).all(companyId);

    const clients = db.prepare(`
      SELECT id, name, cui
      FROM clients
      WHERE company_id=?
      ORDER BY name COLLATE NOCASE ASC
    `).all(companyId);

    const importedQuotes = q
      ? db.prepare(`
          SELECT i.*, cl.name AS client_name, cl.cui AS client_cui
          FROM sales_quote_imports i
          JOIN clients cl ON cl.id=i.client_id AND cl.company_id=i.company_id
          WHERE i.company_id=? AND (
            i.registration_number LIKE ?
            OR i.title LIKE ?
            OR i.original_file_name LIKE ?
            OR cl.name LIKE ?
            OR cl.cui LIKE ?
          )
          ORDER BY i.id DESC
          LIMIT 200
        `).all(companyId, search, search, search, search, search)
      : db.prepare(`
          SELECT i.*, cl.name AS client_name, cl.cui AS client_cui
          FROM sales_quote_imports i
          JOIN clients cl ON cl.id=i.client_id AND cl.company_id=i.company_id
          WHERE i.company_id=?
          ORDER BY i.id DESC
          LIMIT 200
        `).all(companyId);

    return res.type("html").send(renderNexoraQuotesPage({
      currentPath: "/nexora/quotes",
      user: req.session.user,
      userEmail: req.session.user.email || "",
      companyName: req.session.user.company_name || "",
      quotes,
      importedQuotes,
      clients,
      q,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err),
      registrationNumber: safeText(req.query?.reg),
      fmtMoney
    }));
  });

  app.post("/nexora/quotes/import", requireAuth, uploadQuoteImport, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    if (!req.file) return redirectQuotesImport(res, { err: "no_file" });

    const tempPath = req.file.path;
    const extension = path.extname(String(req.file.originalname || "")).toLowerCase();
    if (!QUOTE_IMPORT_EXTENSIONS.has(extension)) {
      removeFileQuietly(fs, tempPath);
      return redirectQuotesImport(res, { err: "file_type" });
    }

    const incomingName = decodeUploadedFileName(req.file.originalname, `oferta${extension}`).replaceAll("\\", "/");
    const originalFileName = path.basename(incomingName).slice(0, 255) || `oferta${extension}`;
    const title = safeText(req.body?.title) || originalFileName.replace(/\.[^.]+$/, "") || "Oferta importata";
    const directory = quoteImportStorageDirectory(path, __dirname, companyId);
    fs.mkdirSync(directory, { recursive: true });

    const storedFileName = `${Date.now()}-${safeFileName(originalFileName)}`;
    const destination = path.join(directory, storedFileName);
    const filePath = `uploads/sales/offers/company-${companyId}/${storedFileName}`;

    try {
      fs.renameSync(tempPath, destination);

      const registerImport = db.transaction(() => {
        const client = resolveImportedQuoteClient(db, companyId, req.body || {});
        const registration = nextQuoteImportRegistration(db, companyId);
        const info = db.prepare(`
          INSERT INTO sales_quote_imports (
            company_id, year, seq, registration_number, client_id, title,
            original_file_name, stored_file_name, file_path, mime_type, file_size,
            extension, notes, created_by_email
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          companyId,
          registration.year,
          registration.seq,
          registration.registrationNumber,
          client.id,
          title,
          originalFileName,
          storedFileName,
          filePath,
          safeText(req.file.mimetype) || null,
          Number(req.file.size || 0),
          extension,
          safeText(req.body?.notes) || null,
          safeText(req.session.user.email)
        );
        return { id: info.lastInsertRowid, registrationNumber: registration.registrationNumber };
      });

      const result = registerImport();
      return redirectQuotesImport(res, { ok: "imported", reg: result.registrationNumber });
    } catch (error) {
      removeFileQuietly(fs, destination);
      removeFileQuietly(fs, tempPath);
      console.error("[Quotes] import failed", error);
      const code = QUOTE_IMPORT_ERROR_CODES.has(error?.code || error?.message) ? (error.code || error.message) : "save_failed";
      return redirectQuotesImport(res, { err: code });
    }
  });

  app.get("/nexora/quotes/imports/:id/download", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send("Bad id");

    const row = db.prepare(`
      SELECT *
      FROM sales_quote_imports
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!row) return res.status(404).send("Documentul nu a fost gasit.");

    const absolute = resolveQuoteImportFilePath(path, __dirname, companyId, row.file_path);
    if (!absolute || !fs.existsSync(absolute)) return res.status(404).send("Fisierul nu a fost gasit.");
    return res.download(absolute, row.original_file_name || row.stored_file_name || "oferta");
  });

  app.get("/nexora/quotes/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const quote = db.prepare(`
      SELECT q.*, cl.name AS client_name, cl.cui AS client_cui
      FROM quotes q
      JOIN clients cl ON cl.id=q.client_id AND cl.company_id=q.company_id
      WHERE q.id=? AND q.company_id=?
    `).get(id, companyId);

    if (!quote) return res.status(404).send("Quote not found");

    const items = db.prepare(`
      SELECT id, name, qty, unit, unit_price, line_total
      FROM quote_items
      WHERE quote_id=? AND company_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(id, companyId);

    recalcQuoteTotals(id, companyId);
    const totals = db.prepare("SELECT subtotal, vat_rate, vat_amount, total, currency FROM quotes WHERE id=? AND company_id=?").get(id, companyId);

    return res.type("html").send(renderNexoraQuoteDetailPage({
      user: req.session.user,
      quote,
      items,
      totals,
      companyName: req.session.user.company_name || "",
      currentPath: "/nexora/quotes",
      fmtMoney
    }));
  });

  app.post("/nexora/quotes/create", requireAuth, (req, res) => {
    return createQuote(req, res, "nexora");
  });

  app.get("/quotes", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const q = String(req.query?.q || "").trim();
    const search = q ? `%${q}%` : null;

    const quotes = q
      ? db.prepare(`
          SELECT q.id, q.quote_number, q.status, q.total, q.valid_until, q.created_at,
                 cl.name AS client_name, cl.cui AS client_cui
          FROM quotes q
          JOIN clients cl ON cl.id = q.client_id AND cl.company_id = q.company_id
          WHERE q.company_id = ? AND (
            q.quote_number LIKE ?
            OR cl.name LIKE ?
            OR cl.cui LIKE ?
          )
          ORDER BY q.id DESC
          LIMIT 300
        `).all(companyId, search, search, search)
      : db.prepare(`
          SELECT q.id, q.quote_number, q.status, q.total, q.valid_until, q.created_at,
                 cl.name AS client_name, cl.cui AS client_cui
          FROM quotes q
          JOIN clients cl ON cl.id = q.client_id AND cl.company_id = q.company_id
          WHERE q.company_id = ?
          ORDER BY q.id DESC
          LIMIT 300
        `).all(companyId);

    const clients = db.prepare(`
      SELECT id, name, cui
      FROM clients
      WHERE company_id=?
      ORDER BY name COLLATE NOCASE ASC
    `).all(companyId);

    function quoteBadge(status) {
      const s = String(status || "").toUpperCase();
      if (s === "ACCEPTED") return `<span class="crm-badge crm-badge-green">ACCEPTED</span>`;
      if (s === "REJECTED") return `<span class="crm-badge crm-badge-red">REJECTED</span>`;
      if (s === "SENT") return `<span class="crm-badge crm-badge-blue">SENT</span>`;
      return `<span class="crm-badge crm-badge-amber">DRAFT</span>`;
    }

    const htmlRows = quotes.map((x) => `
      <tr>
        <td><a href="/quote/${x.id}">${escapeHtml(x.quote_number || "")}</a></td>
        <td>
          <div style="font-weight:800">${escapeHtml(x.client_name || "")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(x.client_cui || "")}</div>
        </td>
        <td>${quoteBadge(x.status)}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(x.total))}</td>
        <td>${escapeHtml(x.valid_until || "") || `<span class="crm-muted">—</span>`}</td>
        <td>${escapeHtml(x.created_at || "")}</td>
      </tr>
    `).join("");

    const userEmail = req.session.user.email;

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
<title>Quotes</title>
</head>
${crmShellStart("quotes", "Quotes", "Oferte comerciale, creare rapidă și urmărirea statusului.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Create quote</h3>
        <div class="crm-muted" style="margin-top:6px">Creează o ofertă nouă pentru un client existent.</div>
      </div>

      <form method="post" action="/quotes/create" class="crm-stack">
        <div>
          <label class="crm-label">Client</label>
          <select class="crm-select" name="client_id" required>
            ${clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name || "")} (${escapeHtml(c.cui || "")})</option>`).join("")}
          </select>
        </div>

        <div>
          <label class="crm-label">Titlu</label>
          <input class="crm-input" name="title" placeholder="Ex: Oferta servicii QR-LAB" />
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">TVA rate</label>
            <select class="crm-select" name="vat_rate">
              <option value="0">0%</option>
              <option value="0.19" selected>19%</option>
            </select>
          </div>
          <div>
            <label class="crm-label">Valabil până la</label>
            <input class="crm-input" name="valid_until" placeholder="2026-03-31" />
          </div>
        </div>

        <div>
          <label class="crm-label">Note</label>
          <textarea class="crm-textarea" name="notes" rows="4"></textarea>
        </div>

        <div>
          <button class="crm-btn" type="submit">Create quote</button>
        </div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Search quotes</h3>
        <div class="crm-muted" style="margin-top:6px">Caută după număr ofertă, client sau CUI.</div>
      </div>

      <form method="get" action="/quotes" class="crm-stack">
        <div>
          <label class="crm-label">Search</label>
          <input class="crm-input" name="q" value="${escapeHtml(q)}" placeholder="Q-2026-0001 / client / CUI" />
        </div>
        <div class="crm-row">
          <button class="crm-btn" type="submit">Search</button>
          <a href="/quotes" style="text-decoration:none"><button class="crm-btn crm-btn-secondary" type="button">Reset</button></a>
        </div>
      </form>

      <div style="margin-top:18px">
        <span class="crm-badge crm-badge-blue">${escapeHtml(String(quotes.length))} rezultate</span>
      </div>
    </section>
  </div>

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <h3 style="margin:0;font-size:20px">Lista quotes</h3>
        <div class="crm-muted" style="margin-top:6px">Ultimele 300 de oferte.</div>
      </div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Quote</th>
            <th>Client</th>
            <th>Status</th>
            <th class="crm-right">Total</th>
            <th>Valid until</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${htmlRows || `<tr><td colspan="6"><em>Nu există quotes încă.</em></td></tr>`}</tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
  });

  app.post("/quotes/create", requireAuth, (req, res) => {
    return createQuote(req, res, req.body?.return_to === "nexora" ? "nexora" : "classic");
  });

  app.get("/quote/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    const quote = db.prepare(`
      SELECT q.*, cl.name AS client_name, cl.cui AS client_cui
      FROM quotes q
      JOIN clients cl ON cl.id=q.client_id AND cl.company_id=q.company_id
      WHERE q.id=? AND q.company_id=?
    `).get(id, companyId);

    if (!quote) return res.status(404).send("Quote not found");

    const items = db.prepare(`
      SELECT id, name, qty, unit, unit_price, line_total
      FROM quote_items
      WHERE quote_id=? AND company_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(id, companyId);

    recalcQuoteTotals(id, companyId);
    const q2 = db.prepare("SELECT subtotal, vat_rate, vat_amount, total FROM quotes WHERE id=? AND company_id=?").get(id, companyId);

    const userEmail = req.session.user.email;

    function quoteBadge(status) {
      const s = String(status || "").toUpperCase();
      if (s === "ACCEPTED") return `<span class="crm-badge crm-badge-green">ACCEPTED</span>`;
      if (s === "REJECTED") return `<span class="crm-badge crm-badge-red">REJECTED</span>`;
      if (s === "SENT") return `<span class="crm-badge crm-badge-blue">SENT</span>`;
      return `<span class="crm-badge crm-badge-amber">DRAFT</span>`;
    }

    const htmlItems = items.map((it) => `
      <tr>
        <td>${escapeHtml(it.name || "")}</td>
        <td class="crm-right">${escapeHtml(String(it.qty ?? ""))}</td>
        <td>${escapeHtml(it.unit || "") || `<span class="crm-muted">—</span>`}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(it.unit_price))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(it.line_total))}</td>
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
<title>${escapeHtml(quote.quote_number || "")}</title>
</head>
${crmShellStart("quotes", `Quote ${quote.quote_number || ""}`, "Administrare ofertă, linii, status și conversie în contract.", userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 10px 0;font-size:20px">Detalii ofertă</h3>
          <div class="crm-muted">Informațiile principale despre quote.</div>
        </div>
        <div>${quoteBadge(quote.status)}</div>
      </div>

      <div class="crm-stack" style="margin-top:16px;gap:10px">
        <div><b>Client:</b> <a href="/client/${quote.client_id}">${escapeHtml(quote.client_name || "")}</a> <span class="crm-muted">(${escapeHtml(quote.client_cui || "")})</span></div>
        <div><b>Valid until:</b> ${escapeHtml(quote.valid_until || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Title:</b> ${escapeHtml(quote.title || "") || `<span class="crm-muted">—</span>`}</div>
        <div><b>Notes:</b><br><span class="crm-muted">${escapeHtml(quote.notes || "") || "—"}</span></div>
      </div>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">PDF</h3>
        <div class="crm-muted" style="margin-top:6px">Generează sau deschide oferta în format PDF.</div>
      </div>

      <div class="crm-row">
        ${quote.pdf_path ? `<a href="/${encodeURI(quote.pdf_path)}" target="_blank" style="text-decoration:none"><button class="crm-btn crm-btn-secondary" type="button">Deschide PDF</button></a>` : `<span class="crm-muted">Fără PDF</span>`}
        <form method="post" action="/quote/${id}/generate-pdf" style="margin:0">
          <button class="crm-btn" type="submit">Generate PDF</button>
        </form>
      </div>
    </section>
  </div>

  <div class="crm-grid-2" style="overflow:visible" style="margin-bottom:18px">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Add item</h3>
        <div class="crm-muted" style="margin-top:6px">Adaugă produse sau servicii în ofertă.</div>
      </div>

      <form method="post" action="/quote/${id}/items/add" class="crm-stack">
        <div>
          <label class="crm-label">Denumire</label>
          <input class="crm-input" name="name" required placeholder="Ex: Servicii implementare / consultanță" />
        </div>

        <div class="crm-grid-2" style="overflow:visible">
          <div>
            <label class="crm-label">Cantitate</label>
            <input class="crm-input" name="qty" value="1" />
          </div>
          <div>
            <label class="crm-label">Unitate</label>
            <input class="crm-input" name="unit" placeholder="buc / ore / luni" />
          </div>
        </div>

        <div>
          <label class="crm-label">Preț unitar</label>
          <input class="crm-input" name="unit_price" value="0" />
        </div>

        <div>
          <button class="crm-btn" type="submit">Add item</button>
        </div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Status & conversion</h3>
        <div class="crm-muted" style="margin-top:6px">Gestionează fluxul comercial al ofertei.</div>
      </div>

      <form method="post" action="/quote/${id}/status" class="crm-stack">
        <div>
          <label class="crm-label">Set status</label>
          <select class="crm-select" name="status">
            ${["DRAFT","SENT","ACCEPTED","REJECTED"].map((st) => `<option value="${st}" ${String(quote.status || "") === st ? "selected" : ""}>${st}</option>`).join("")}
          </select>
        </div>
        <div>
          <button class="crm-btn" type="submit">Save</button>
        </div>
      </form>

      <form method="post" action="/quote/${id}/convert-to-contract" style="margin-top:14px">
        <button class="crm-btn ${String(quote.status || "").toUpperCase() === "ACCEPTED" ? "" : "crm-btn-secondary"}" type="submit" ${String(quote.status || "").toUpperCase() === "ACCEPTED" ? "" : "disabled"}>Convert → Contract</button>
      </form>

      <div class="crm-muted" style="font-size:13px;margin-top:8px">
        Creează contract + PDF din quote.
        ${String(quote.status || "").toUpperCase() === "ACCEPTED" ? "" : " (setează status = ACCEPTED ca să activezi)"}
      </div>

      <div style="margin-top:18px" class="crm-card">
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center">
          <div class="crm-muted">Subtotal</div>
          <div><b>${escapeHtml(fmtMoney(q2.subtotal))}</b> ${escapeHtml(quote.currency || "RON")}</div>

          <div class="crm-muted">VAT</div>
          <div><b>${escapeHtml(fmtMoney(q2.vat_amount))}</b> <span class="crm-muted">(rate ${escapeHtml(String(q2.vat_rate ?? ""))})</span></div>

          <div class="crm-muted">Total</div>
          <div><b>${escapeHtml(fmtMoney(q2.total))}</b></div>
        </div>
      </div>
    </section>
  </div>

  <section class="crm-card" style="position:sticky;top:20px;z-index:10">
    <div style="margin-bottom:14px">
      <h3 style="margin:0;font-size:20px">Items</h3>
      <div class="crm-muted" style="margin-top:6px">Liniile ofertei curente.</div>
    </div>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="crm-right">Qty</th>
            <th>Unit</th>
            <th class="crm-right">Unit price</th>
            <th class="crm-right">Line total</th>
          </tr>
        </thead>
        <tbody>${htmlItems || `<tr><td colspan="5"><em>No items yet.</em></td></tr>`}</tbody>
      </table>
    </div>
  </section>

${crmShellEnd()}
</html>`);
  });

  app.post("/quote/:id/items/add", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const quote_id = Number(req.params.id);
    if (!Number.isFinite(quote_id)) return res.status(400).send("Bad id");

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).send("name required");

    const qty = Number(String(req.body?.qty || "1").replace(",", "."));
    const unit_price = Number(String(req.body?.unit_price || "0").replace(",", "."));
    const unit = String(req.body?.unit || "").trim();

    if (!Number.isFinite(qty)) return res.status(400).send("qty invalid");
    if (!Number.isFinite(unit_price)) return res.status(400).send("unit_price invalid");

    const line_total = qty * unit_price;

    db.prepare(`
      INSERT INTO quote_items (quote_id, name, qty, unit, unit_price, line_total, sort_order, company_id)
      VALUES (?,?,?,?,?,?,0,?)
    `).run(quote_id, name, qty, unit || null, unit_price, line_total, companyId);

    recalcQuoteTotals(quote_id, companyId);

    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/quotes/" + quote_id : "/quote/" + quote_id);
  });

  app.post("/quote/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const quote_id = Number(req.params.id);
    if (!Number.isFinite(quote_id)) return res.status(400).send("Bad id");

    const status = String(req.body?.status || "").trim().toUpperCase();
    const allowed = new Set(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]);
    if (!allowed.has(status)) return res.status(400).send("status invalid");

    db.prepare("UPDATE quotes SET status=? WHERE id=? AND company_id=?").run(status, quote_id, companyId);
    return res.redirect(req.body?.return_to === "nexora" ? "/nexora/quotes/" + quote_id : "/quote/" + quote_id);
  });

  app.post("/quote/:id/generate-pdf", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Bad id");

    try {
      const quote = db.prepare(`
        SELECT q.*, cl.name AS client_name, cl.cui AS client_cui, cl.address AS client_address
        FROM quotes q
        JOIN clients cl ON cl.id=q.client_id AND cl.company_id=q.company_id
        WHERE q.id=? AND q.company_id=?
      `).get(id, companyId);

      if (!quote) return res.status(404).send("Quote not found");

      const items = db.prepare(`
        SELECT name, qty, unit, unit_price, line_total
        FROM quote_items
        WHERE quote_id=? AND company_id=?
        ORDER BY sort_order ASC, id ASC
      `).all(id, companyId);

      recalcQuoteTotals(id, companyId);
      const totals = db.prepare("SELECT subtotal, vat_rate, vat_amount, total, currency FROM quotes WHERE id=? AND company_id=?").get(id, companyId);

      const vm = {
        quote_number: quote.quote_number,
        quote_date: quote.created_at ? String(quote.created_at).slice(0, 10) : todayISO(),
        valid_until: quote.valid_until || "",
        title: quote.title || "",
        notes: quote.notes || "",
        client_name: quote.client_name || "",
        client_cui: quote.client_cui || "",
        client_address: quote.client_address || "",
        items: (items || []).map((it) => ({
          name: it.name || "",
          qty: String(it.qty ?? ""),
          unit: it.unit || "",
          unit_price: String(it.unit_price ?? ""),
          line_total: String(it.line_total ?? "")
        })),
        subtotal: String(totals?.subtotal ?? ""),
        vat_percent: String(Math.round((Number(totals?.vat_rate ?? 0) * 100) * 100) / 100),
        vat_amount: String(totals?.vat_amount ?? ""),
        total: String(totals?.total ?? ""),
        currency: String(totals?.currency ?? "RON"),
        company: COMPANY
      };

      const html = Mustache.render(quoteTemplateHtml, vm);
      const pdf = await renderPdfBuffer(html);

      const year = quote.year || new Date().getFullYear();
      const yearDir = new URL("./contracts/quotes/" + String(year) + "/", import.meta.url);
      fs.mkdirSync(yearDir, { recursive: true });

      const fileName = `${quote.quote_number}.pdf`;
      const absPath = new URL("./contracts/quotes/" + String(year) + "/" + fileName, import.meta.url);
      fs.writeFileSync(absPath, pdf);

      const pdf_path = `contracts/quotes/${year}/${fileName}`;
      db.prepare("UPDATE quotes SET pdf_path=? WHERE id=? AND company_id=?").run(pdf_path, id, companyId);

      return res.redirect(req.body?.return_to === "nexora" ? "/nexora/quotes/" + id : "/quote/" + id);
    } catch (error) {
      console.error(`[PDF] generate quote ${id} failed`, error);
      return res.status(error?.code === "PDF_BROWSER_MISSING" ? 503 : 500).send(String(error?.message || "Nu am putut genera PDF-ul ofertei."));
    }
  });

  app.post("/quote/:id/convert-to-contract", requireAuth, async (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const quote_id = Number(req.params.id);
    if (!Number.isFinite(quote_id)) return res.status(400).send("Bad id");

    try {
      const quote = db.prepare(`
        SELECT q.*, cl.id AS client_id, cl.cui AS client_cui, cl.name AS client_name,
               cl.address AS client_address, cl.reg_com AS client_reg_com
        FROM quotes q
        JOIN clients cl ON cl.id=q.client_id AND cl.company_id=q.company_id
        WHERE q.id=? AND q.company_id=?
      `).get(quote_id, companyId);

      if (!quote) return res.status(404).send("Quote not found");

      const st = String(quote.status || "").toUpperCase();
      if (st !== "ACCEPTED") return res.status(400).send("Quote must be ACCEPTED to convert.");

      const items = db.prepare(`
        SELECT name, qty, unit, unit_price, line_total
        FROM quote_items
        WHERE quote_id=? AND company_id=?
        ORDER BY sort_order ASC, id ASC
      `).all(quote_id, companyId);

      recalcQuoteTotals(quote_id, companyId);
      const totals = db.prepare("SELECT subtotal, vat_rate, vat_amount, total, currency FROM quotes WHERE id=? AND company_id=?").get(quote_id, companyId);

      const lines = (items || []).map((it) => {
        const qty = it.qty ?? "";
        const unit = it.unit ?? "";
        const price = it.unit_price ?? "";
        return `• ${it.name || ""} — ${qty}${unit ? " " + unit : ""} × ${price}`;
      });

      const service_description = [
        quote.title ? quote.title : "Servicii conform ofertă",
        "",
        ...lines,
        quote.notes ? ("\nNote: " + quote.notes) : ""
      ].filter(Boolean).join("\n");

      const year = new Date().getFullYear();
      const row = db.prepare("SELECT MAX(seq) AS maxSeq FROM contracts WHERE year=? AND company_id=?").get(year, companyId);
      const nextSeq = (row?.maxSeq || 0) + 1;
      const contract_number = `QR-${year}-${String(nextSeq).padStart(4, "0")}`;

      const priceNum = Number(totals?.total ?? 0);
      const duration = quote.valid_until ? `Valabil până la ${quote.valid_until}` : "Conform ofertă";
      const is_company = !String(quote.client_cui || "").startsWith("PF-");

      const vm = {
        contract_number,
        contract_date: todayISO(),
        is_company,
        pj_cui: is_company ? (quote.client_cui || "") : "",
        pj_legal_name: is_company ? (quote.client_name || "") : "",
        pj_address: is_company ? (quote.client_address || "") : "",
        pj_reg_com: is_company ? (quote.client_reg_com || "") : "",
        pj_representative_name: "",
        pf_full_name: !is_company ? (quote.client_name || "") : "",
        pf_address: !is_company ? (quote.client_address || "") : "",
        service_description,
        price_amount: String(Number.isFinite(priceNum) ? priceNum : 0),
        price_currency: String(totals?.currency || "RON"),
        payment_terms: "15 zile",
        start_date: todayISO(),
        duration,
        termination_notice_days: "30",
        jurisdiction_city: "București",
        privacy_policy_url: "https://qr-lab.ro",
        client_signer_name: is_company ? "" : (quote.client_name || ""),
        provider_signer_name: ""
      };

      const html = Mustache.render(templateHtml, { ...vm, company: COMPANY });
      const pdf = await renderPdfBuffer(html);

      const yearDir = path.join(__dirname, "contracts", String(year));
      fs.mkdirSync(yearDir, { recursive: true });
      const fileName = `${contract_number}.pdf`;
      const absPath = path.join(yearDir, fileName);
      fs.writeFileSync(absPath, pdf);
      const pdf_path = `contracts/${year}/${fileName}`;

      const tx = db.transaction(() => {
        const info = db.prepare(`
          INSERT INTO contracts (contract_number, year, seq, client_id, service_description, price, duration, pdf_path, origin, company_id)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(
          contract_number, year, nextSeq, quote.client_id,
          service_description, Number.isFinite(priceNum) ? priceNum : 0, duration, pdf_path, "QUOTE", companyId
        );

        const contract_id = info.lastInsertRowid;
        db.prepare("UPDATE quotes SET contract_id=? WHERE id=? AND company_id=?").run(contract_id, quote_id, companyId);
        return contract_id;
      });

      const contract_id = tx();
      const c = db.prepare("SELECT pdf_path FROM contracts WHERE id=? AND company_id=?").get(contract_id, companyId);
      if (req.body?.return_to === "nexora") {
        return res.redirect("/nexora/contracts/" + contract_id + "?ok=contract_generat");
      }
      if (c?.pdf_path) return res.redirect("/" + encodeURI(c.pdf_path));

      return res.redirect("/contract/" + contract_id);
    } catch (error) {
      console.error(`[PDF] convert quote ${quote_id} to contract failed`, error);
      return res.status(error?.code === "PDF_BROWSER_MISSING" ? 503 : 500).send(String(error?.message || "Nu am putut genera PDF-ul contractului."));
    }
  });
}
