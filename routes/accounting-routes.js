import { formatInvoiceDisplayNumber } from "../lib/invoice-numbering.js";
import {
  renderNexoraAccountingDeclarationDetailPage,
  renderNexoraAccountingDeclarationsPage,
  renderNexoraAccountingExpensesPage
} from "../src/ui/nexora-accounting-pages.js";
import { renderNexoraHubPage } from "../src/ui/nexora-hub-page.js";

function parseDateFilter(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseStatusFilter(value) {
  return String(value || "").trim().toUpperCase();
}

function parseEfacturaFilter(value) {
  return String(value || "").trim().toLowerCase();
}

function buildInvoiceFilterState(query = {}) {
  return {
    dateFrom: parseDateFilter(query.date_from),
    dateTo: parseDateFilter(query.date_to),
    status: parseStatusFilter(query.status),
    efactura: parseEfacturaFilter(query.efactura),
    search: String(query.search || "").trim()
  };
}

function buildInvoiceWhereClause(filters, companyId) {
  const where = ["f.company_id=?"];
  const params = [companyId];

  if (filters.dateFrom) {
    where.push("date(COALESCE(f.data_emitere, f.created_at)) >= date(?)");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push("date(COALESCE(f.data_emitere, f.created_at)) <= date(?)");
    params.push(filters.dateTo);
  }

  if (filters.status) {
    if (filters.status === "RESTANTE") {
      where.push("f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')");
    } else if (filters.status === "DESCHISE") {
      where.push("UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')");
    } else {
      where.push("UPPER(COALESCE(f.status,'')) = ?");
      params.push(filters.status);
    }
  }

  if (filters.efactura === "pending") {
    where.push("COALESCE(f.efactura_upload_index, f.efactura_message_id, '') <> '' AND COALESCE(f.efactura_download_id, '') = ''");
  } else if (filters.efactura === "error") {
    where.push("COALESCE(f.efactura_last_error, '') <> ''");
  } else if (filters.efactura === "sent") {
    where.push("COALESCE(f.efactura_upload_index, f.efactura_message_id, '') <> ''");
  } else if (filters.efactura === "downloaded") {
    where.push("COALESCE(f.efactura_download_id, '') <> ''");
  } else if (filters.efactura === "none") {
    where.push("COALESCE(f.efactura_status, f.efactura_upload_index, f.efactura_message_id, '') = ''");
  }

  if (filters.search) {
    where.push("(LOWER(COALESCE(f.factura_nr,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
    const like = `%${filters.search.toLowerCase()}%`;
    params.push(like, like, like);
  }

  return { whereSql: where.join(" AND "), params };
}

function invoiceExportQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  if (filters.efactura) params.set("efactura", filters.efactura);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function uploadDirPath(path, __dirname, folderName) {
  return path.join(__dirname, "public", "uploads", "accounting", folderName);
}

function saveUploadedFile({ fs, path, __dirname, file, folderName }) {
  if (!file) return "";
  const targetDir = uploadDirPath(path, __dirname, folderName);
  fs.mkdirSync(targetDir, { recursive: true });
  const safeBase = String(file.originalname || "document.bin").replace(/[^A-Za-z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeBase}`;
  const finalPath = path.join(targetDir, finalName);
  fs.renameSync(file.path, finalPath);
  return `uploads/accounting/${folderName}/${finalName}`;
}

function moneyInput(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function declarationStatusBadge(escapeHtml, status) {
  const normalized = String(status || "PREGATITA").trim().toUpperCase();
  if (normalized === "VALIDATA") return `<span class="crm-badge crm-badge-green">validată</span>`;
  if (normalized === "TRIMISA") return `<span class="crm-badge crm-badge-blue">trimisă</span>`;
  if (normalized === "RESPINSA") return `<span class="crm-badge crm-badge-red">respinsă</span>`;
  return `<span class="crm-badge crm-badge-amber">${escapeHtml(normalized.toLowerCase())}</span>`;
}

function buildInboxFilterState(query = {}) {
  return {
    processed: String(query.processed || "").trim().toLowerCase(),
    dateFrom: parseDateFilter(query.inbox_date_from || query.date_from),
    dateTo: parseDateFilter(query.inbox_date_to || query.date_to),
    search: String(query.inbox_search || query.search || "").trim()
  };
}

function buildInboxWhereClause(filters, companyId) {
  const where = ["company_id=?"];
  const params = [companyId];

  if (filters.processed === "processed") {
    where.push("processed=1");
  } else if (filters.processed === "new") {
    where.push("processed=0");
  }

  if (filters.dateFrom) {
    where.push("date(COALESCE(received_at, created_at)) >= date(?)");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push("date(COALESCE(received_at, created_at)) <= date(?)");
    params.push(filters.dateTo);
  }

  if (filters.search) {
    const like = `%${filters.search.toLowerCase()}%`;
    where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(invoice_number,'')) LIKE ? OR LOWER(COALESCE(details,'')) LIKE ? OR LOWER(COALESCE(xml_path,'')) LIKE ? OR LOWER(COALESCE(pdf_path,'')) LIKE ? OR LOWER(COALESCE(zip_path,'')) LIKE ?)");
    params.push(like, like, like, like, like, like, like);
  }

  return { whereSql: where.join(" AND "), params };
}

export function registerAccountingRoutes(app, { db, requireAuth, requireSpvAccess, canAccessSpvUser, escapeHtml, fmtMoney, crmShellStart, crmShellEnd, fs, path, __dirname, upload }) {
  app.get("/nexora/accounting", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const invoiceStats = db.prepare(`
      SELECT COUNT(*) AS total_count,
             IFNULL(SUM(total), 0) AS total_amount,
             SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS open_count
      FROM facturi
      WHERE company_id=?
    `).get(companyId) || {};
    const expenses = db.prepare(`
      SELECT COUNT(*) AS total_count, IFNULL(SUM(total), 0) AS total_amount
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};
    const declarations = db.prepare(`
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('DEPUSA', 'FINALIZATA', 'ANULATA') THEN 1 ELSE 0 END) AS open_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};
    const inbox = db.prepare(`
      SELECT COUNT(*) AS total_count,
             SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS new_count
      FROM anaf_inbox
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraHubPage({
      companyName: req.session.user.company_name || "",
      currentPath: "/nexora/accounting",
      eyebrow: "Financiar & Contabilitate",
      title: "Contabilitate",
      description: "Hub Nexora pentru facturi, cheltuieli, declarații, bonuri de consum și e-Factura.",
      stats: [
        { icon: "F", label: "Facturi", value: invoiceStats.total_count || 0, hint: `${fmtMoney(invoiceStats.total_amount || 0)} total` },
        { icon: "O", label: "Deschise", value: invoiceStats.open_count || 0 },
        { icon: "C", label: "Cheltuieli", value: expenses.total_count || 0, hint: `${fmtMoney(expenses.total_amount || 0)} total` },
        { icon: "D", label: "Declarații deschise", value: declarations.open_count || 0 },
        { icon: "SPV", label: "Inbox nou", value: inbox.new_count || 0 }
      ],
      links: [
        { label: "Facturi Nexora", href: "/nexora/facturi" },
        { label: "ANAF Status", href: "/nexora/anaf/status" },
        { label: "Inbox e-Factura", href: "/nexora/anaf/inbox" },
        { label: "Cheltuieli", href: "/nexora/accounting/expenses" },
        { label: "Declarații", href: "/nexora/accounting/declarations" },
        { label: "Bonuri de consum", href: "/nexora/accounting/consumption" },
        { label: "Receivables", href: "/nexora/accounting/receivables" }
      ]
    }));
  });

  app.get("/nexora/accounting/expenses", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const search = String(req.query?.search || "").trim();
    const paymentStatus = String(req.query?.payment_status || "").trim().toUpperCase();
    const category = String(req.query?.category || "").trim().toUpperCase();

    const where = ["company_id=?"];
    const params = [companyId];
    if (paymentStatus) {
      where.push("UPPER(COALESCE(payment_status,''))=?");
      params.push(paymentStatus);
    }
    if (category) {
      where.push("UPPER(COALESCE(category,''))=?");
      params.push(category);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(doc_number,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, expense_type, category, supplier_name, supplier_cui, doc_number, issue_date, due_date,
             payment_status, deductible_percent, currency, subtotal, vat_amount, total, attachment_path
      FROM accounting_expenses
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))='PLATITA' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))<>'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingExpensesPage({
      companyName: req.session.user.company_name || "",
      rows,
      stats,
      fmtMoney,
      ok: String(req.query?.ok || ""),
      filters: { search, paymentStatus, category }
    }));
  });

  app.get("/nexora/accounting/declarations", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const typeFilter = String(req.query?.type || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim();
    const where = ["company_id=?"];
    const params = [companyId];

    if (statusFilter) {
      where.push("UPPER(COALESCE(status,''))=?");
      params.push(statusFilter);
    }
    if (typeFilter) {
      where.push("UPPER(COALESCE(declaration_type,''))=?");
      params.push(typeFilter);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(period_label,'')) LIKE ? OR LOWER(COALESCE(reference_number,'')) LIKE ? OR LOWER(COALESCE(declaration_type,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, declaration_type, period_label, period_start, period_end, due_date, status, submission_channel,
             reference_number, attachment_path, receipt_path, created_at, updated_at
      FROM accounting_declarations
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(due_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PREGATITA' THEN 1 ELSE 0 END) AS pregatita_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1 ELSE 0 END) AS trimisa_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='VALIDATA' THEN 1 ELSE 0 END) AS validata_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS respinsa_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};

    return res.type("html").send(renderNexoraAccountingDeclarationsPage({
      companyName: req.session.user.company_name || "",
      rows,
      stats,
      ok: String(req.query?.ok || ""),
      filters: { statusFilter, typeFilter, search }
    }));
  });

  app.get("/nexora/accounting/declarations/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const row = db.prepare(`
      SELECT *
      FROM accounting_declarations
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!row) return res.status(404).send("Declarație inexistentă");

    return res.type("html").send(renderNexoraAccountingDeclarationDetailPage({
      companyName: req.session.user.company_name || "",
      row,
      ok: String(req.query?.ok || "")
    }));
  });

  app.get("/accounting/export/facturi.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildInvoiceFilterState(req.query);
    const { whereSql, params } = buildInvoiceWhereClause(filters, companyId);

    const rows = db.prepare(`
      SELECT
        f.factura_nr,
        c.name AS client_name,
        c.cui AS client_cui,
        f.status,
        f.efactura_status,
        f.data_emitere,
        f.scadenta,
        f.moneda,
        f.subtotal,
        f.tva_valoare,
        f.total,
        f.efactura_upload_index,
        f.efactura_download_id,
        f.efactura_last_error
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE ${whereSql}
      ORDER BY date(COALESCE(f.data_emitere, f.created_at)) DESC, f.id DESC
      LIMIT 5000
    `).all(...params);

    const header = [
      "factura_nr",
      "client_name",
      "client_cui",
      "status",
      "efactura_status",
      "data_emitere",
      "scadenta",
      "moneda",
      "subtotal",
      "tva_valoare",
      "total",
      "efactura_upload_index",
      "efactura_download_id",
      "efactura_last_error"
    ].join(",");

    const csv = [
      header,
      ...rows.map((row) => [
        row.factura_nr,
        row.client_name,
        row.client_cui,
        row.status,
        row.efactura_status,
        row.data_emitere,
        row.scadenta,
        row.moneda,
        fmtMoney(row.subtotal),
        fmtMoney(row.tva_valoare),
        fmtMoney(row.total),
        row.efactura_upload_index,
        row.efactura_download_id,
        row.efactura_last_error
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="accounting-facturi.csv"');
    res.send(csv);
  });

  app.get("/accounting/export/reconciliere.csv", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);

    const rows = db.prepare(`
      SELECT
        bp.id,
        bp.source,
        bp.status,
        bp.amount,
        bp.currency,
        bp.payer_name,
        bp.payer_email,
        bp.reference_code,
        bp.paid_at,
        bp.created_at,
        bp.generated_factura_id,
        bp.invoice_generation_status,
        f.factura_nr,
        f.status AS factura_status,
        f.total AS factura_total
      FROM billing_payments bp
      LEFT JOIN facturi f ON f.id = bp.generated_factura_id
      WHERE bp.company_id=?
      ORDER BY datetime(COALESCE(bp.paid_at, bp.created_at)) DESC, bp.id DESC
      LIMIT 5000
    `).all(companyId);

    const header = [
      "payment_id",
      "source",
      "payment_status",
      "amount",
      "currency",
      "payer_name",
      "payer_email",
      "reference_code",
      "paid_at",
      "created_at",
      "generated_factura_id",
      "invoice_generation_status",
      "factura_nr",
      "factura_status",
      "factura_total",
      "reconciliation_status"
    ].join(",");

    function reconciliationStatus(row) {
      const paymentStatus = String(row?.status || "").trim().toLowerCase();
      const facturaStatus = String(row?.factura_status || "").trim().toUpperCase();
      const hasInvoice = Number(row?.generated_factura_id || 0) > 0;

      if (paymentStatus === "paid" && hasInvoice && facturaStatus === "INCASATA") return "reconciliat";
      if (paymentStatus === "paid" && hasInvoice) return "plata_confirmata_factura_neincasata";
      if (paymentStatus === "paid" && !hasInvoice) return "plata_fara_factura";
      if (hasInvoice) return "factura_legata_plata_in_curs";
      return "de_verificat";
    }

    const csv = [
      header,
      ...rows.map((row) => [
        row.id,
        row.source,
        row.status,
        fmtMoney(row.amount),
        String(row.currency || "").toUpperCase(),
        row.payer_name,
        row.payer_email,
        row.reference_code,
        row.paid_at,
        row.created_at,
        row.generated_factura_id,
        row.invoice_generation_status,
        row.factura_nr,
        row.factura_status,
        fmtMoney(row.factura_total),
        reconciliationStatus(row)
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="accounting-reconciliere.csv"');
    res.send(csv);
  });

  app.get("/accounting/export/inbox-spv.csv", requireAuth, requireSpvAccess, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const filters = buildInboxFilterState(req.query);
    const { whereSql, params } = buildInboxWhereClause(filters, companyId);

    const rows = db.prepare(`
      SELECT
        id,
        supplier_name,
        supplier_cui,
        invoice_number,
        message_type,
        details,
        download_id,
        zip_path,
        xml_path,
        pdf_path,
        received_at,
        created_at,
        processed
      FROM anaf_inbox
      WHERE ${whereSql}
      ORDER BY datetime(COALESCE(received_at, created_at)) DESC, id DESC
      LIMIT 5000
    `).all(...params);

    const header = [
      "id",
      "supplier_name",
      "supplier_cui",
      "invoice_number",
      "message_type",
      "details",
      "download_id",
      "received_at",
      "created_at",
      "processed",
      "zip_path",
      "xml_path",
      "pdf_path"
    ].join(",");

    const csv = [
      header,
      ...rows.map((row) => [
        row.id,
        row.supplier_name,
        row.supplier_cui,
        row.invoice_number,
        row.message_type,
        row.details,
        row.download_id,
        row.received_at,
        row.created_at,
        Number(row.processed) ? "1" : "0",
        row.zip_path,
        row.xml_path,
        row.pdf_path
      ].map(csvEscape).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="accounting-inbox-spv.csv"');
    res.send(csv);
  });

  app.get("/accounting/expenses", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const search = String(req.query?.search || "").trim();
    const paymentStatus = String(req.query?.payment_status || "").trim().toUpperCase();
    const category = String(req.query?.category || "").trim().toUpperCase();

    const where = ["company_id=?"];
    const params = [companyId];
    if (paymentStatus) {
      where.push("UPPER(COALESCE(payment_status,''))=?");
      params.push(paymentStatus);
    }
    if (category) {
      where.push("UPPER(COALESCE(category,''))=?");
      params.push(category);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(supplier_name,'')) LIKE ? OR LOWER(COALESCE(supplier_cui,'')) LIKE ? OR LOWER(COALESCE(doc_number,'')) LIKE ?)");
      params.push(like, like, like);
    }
    const whereSql = where.join(" AND ");

    const rows = db.prepare(`
      SELECT id, expense_type, category, supplier_name, supplier_cui, doc_number, issue_date, due_date,
             payment_status, deductible_percent, currency, subtotal, vat_amount, total, attachment_path
      FROM accounting_expenses
      WHERE ${whereSql}
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total),0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))='PLATITA' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,''))<>'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};

    const rowsHtml = rows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.supplier_name || "—")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.supplier_cui || "—")}</div>
        </td>
        <td>${escapeHtml(row.doc_number || "—")}</td>
        <td>${escapeHtml(row.category || row.expense_type || "—")}</td>
        <td>${row.payment_status === "PLATITA" ? `<span class="crm-badge crm-badge-green">plătită</span>` : `<span class="crm-badge crm-badge-amber">${escapeHtml((row.payment_status || "neplătită").toLowerCase())}</span>`}</td>
        <td>${escapeHtml(row.issue_date || "—")}</td>
        <td>${escapeHtml(row.due_date || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.currency || "RON"))}</td>
        <td>${row.attachment_path ? `<a href="/${encodeURI(row.attachment_path)}" target="_blank">Document</a>` : `<span class="crm-muted">—</span>`}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Cheltuieli</title></head>
${crmShellStart("accounting-expenses", "Cheltuieli", "Înregistrare cheltuieli, facturi de furnizor și documente justificative.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Adaugă cheltuială</h3>
        <div class="crm-muted" style="margin-top:6px">Poți înregistra facturi de furnizor, bonuri fiscale și alte documente de cheltuială.</div>
      </div>
      <form method="post" action="/accounting/expenses/create" enctype="multipart/form-data" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Tip document</label><select class="crm-input" name="expense_type"><option value="FACTURA">Factură furnizor</option><option value="BON_FISCAL">Bon fiscal</option><option value="CHITANTA">Chitanță</option><option value="DECONT">Decont</option><option value="ALTA">Alta</option></select></div>
          <div><label class="crm-label">Categorie</label><select class="crm-input" name="category"><option value="UTILITATI">Utilități</option><option value="CHIRIE">Chirie</option><option value="MATERIALE">Materiale</option><option value="PROTOCOL">Protocol</option><option value="TRANSPORT">Transport</option><option value="SERVICII">Servicii</option><option value="SALARII">Salarii</option><option value="TAXE">Taxe</option><option value="ALTELE">Altele</option></select></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Furnizor</label><input class="crm-input" name="supplier_name" required></div>
          <div><label class="crm-label">CUI furnizor</label><input class="crm-input" name="supplier_cui"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Număr document</label><input class="crm-input" name="doc_number"></div>
          <div><label class="crm-label">Status plată</label><select class="crm-input" name="payment_status"><option value="NEPLATITA">Neplătită</option><option value="PLATITA">Plătită</option><option value="PARTIALA">Parțială</option></select></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Data emitere</label><input class="crm-input" type="date" name="issue_date"></div>
          <div><label class="crm-label">Scadență</label><input class="crm-input" type="date" name="due_date"></div>
        </div>
        <div class="crm-grid-4" style="overflow:visible">
          <div><label class="crm-label">Subtotal</label><input class="crm-input" name="subtotal" value="0"></div>
          <div><label class="crm-label">TVA</label><input class="crm-input" name="vat_amount" value="0"></div>
          <div><label class="crm-label">Total</label><input class="crm-input" name="total" value="0"></div>
          <div><label class="crm-label">Deductibil %</label><input class="crm-input" name="deductible_percent" value="100"></div>
        </div>
        <div><label class="crm-label">Document</label><input class="crm-input" type="file" name="attachment"></div>
        <div><label class="crm-label">Observații</label><textarea class="crm-input" name="notes" rows="3"></textarea></div>
        <div><button class="crm-btn" type="submit">Salvează cheltuiala</button></div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px">
        <h3 style="margin:0;font-size:20px">Sumar cheltuieli</h3>
        <div class="crm-muted" style="margin-top:6px">Panou rapid pentru cheltuielile companiei.</div>
      </div>
      <div class="crm-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">
        <div class="crm-kpi"><div class="crm-kpi-label">Total înregistrări</div><div class="crm-kpi-value">${escapeHtml(String(stats.total_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Valoare totală</div><div class="crm-kpi-value">${escapeHtml(fmtMoney(stats.total_amount || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Plătite</div><div class="crm-kpi-value">${escapeHtml(String(stats.paid_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Neplătite</div><div class="crm-kpi-value">${escapeHtml(String(stats.unpaid_count || 0))}</div></div>
      </div>
    </section>
  </div>

  <section class="crm-card" style="margin-top:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div><h3 style="margin:0;font-size:20px">Registru cheltuieli</h3><div class="crm-muted" style="margin-top:6px">Filtre rapide pentru lucru contabil curent.</div></div>
      <a class="crm-btn crm-btn-secondary" href="/accounting">Înapoi la contabilitate</a>
    </div>
    <form method="get" action="/accounting/expenses" class="crm-grid-4" style="margin-bottom:18px;overflow:visible">
      <div><label class="crm-label">Status plată</label><select class="crm-input" name="payment_status"><option value="">toate</option><option value="NEPLATITA" ${paymentStatus === "NEPLATITA" ? "selected" : ""}>neplătite</option><option value="PLATITA" ${paymentStatus === "PLATITA" ? "selected" : ""}>plătite</option><option value="PARTIALA" ${paymentStatus === "PARTIALA" ? "selected" : ""}>parțiale</option></select></div>
      <div><label class="crm-label">Categorie</label><input class="crm-input" name="category" value="${escapeHtml(category)}" placeholder="ex: UTILITATI"></div>
      <div style="grid-column:span 2"><label class="crm-label">Căutare</label><input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="furnizor, CUI, număr document"></div>
      <div style="grid-column:1 / -1;display:flex;gap:10px;flex-wrap:wrap"><button class="crm-btn" type="submit">Aplică</button><a class="crm-btn crm-btn-secondary" href="/accounting/expenses">Resetează</a></div>
    </form>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Furnizor</th><th>Document</th><th>Categorie</th><th>Status</th><th>Emitere</th><th>Scadență</th><th class="crm-right">Total</th><th>Fișier</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="8" class="crm-muted">Nu există cheltuieli înregistrate.</td></tr>`}</tbody>
      </table>
    </div>
  </section>
${crmShellEnd()}`);
  });

  app.post("/accounting/expenses/create", requireAuth, upload.single("attachment"), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: req.file, folderName: "expenses" });
    db.prepare(`
      INSERT INTO accounting_expenses (
        company_id, expense_type, category, supplier_name, supplier_cui, doc_number, issue_date, due_date,
        payment_status, deductible_percent, currency, subtotal, vat_amount, total, notes, attachment_path, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.expense_type || "FACTURA").trim().toUpperCase(),
      String(req.body?.category || "ALTELE").trim().toUpperCase(),
      String(req.body?.supplier_name || "").trim(),
      String(req.body?.supplier_cui || "").trim(),
      String(req.body?.doc_number || "").trim(),
      String(req.body?.issue_date || "").trim() || new Date().toISOString().slice(0, 10),
      String(req.body?.due_date || "").trim() || null,
      String(req.body?.payment_status || "NEPLATITA").trim().toUpperCase(),
      moneyInput(req.body?.deductible_percent || 100),
      String(req.body?.currency || "RON").trim().toUpperCase(),
      moneyInput(req.body?.subtotal),
      moneyInput(req.body?.vat_amount),
      moneyInput(req.body?.total),
      String(req.body?.notes || "").trim(),
      attachmentPath || null,
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/accounting/expenses?ok=created" : "/accounting/expenses");
  });

  app.get("/accounting/declarations", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const typeFilter = String(req.query?.type || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim();
    const where = ["company_id=?"];
    const params = [companyId];

    if (statusFilter) {
      where.push("UPPER(COALESCE(status,''))=?");
      params.push(statusFilter);
    }
    if (typeFilter) {
      where.push("UPPER(COALESCE(declaration_type,''))=?");
      params.push(typeFilter);
    }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      where.push("(LOWER(COALESCE(period_label,'')) LIKE ? OR LOWER(COALESCE(reference_number,'')) LIKE ? OR LOWER(COALESCE(declaration_type,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT id, declaration_type, period_label, period_start, period_end, due_date, status, submission_channel,
             reference_number, attachment_path, receipt_path, created_at, updated_at
      FROM accounting_declarations
      WHERE ${where.join(" AND ")}
      ORDER BY date(COALESCE(due_date, created_at)) DESC, id DESC
      LIMIT 200
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PREGATITA' THEN 1 ELSE 0 END) AS pregatita_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1 ELSE 0 END) AS trimisa_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='VALIDATA' THEN 1 ELSE 0 END) AS validata_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS respinsa_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};

    const rowsHtml = rows.map((row) => `
      <tr>
        <td><div style="font-weight:800"><a href="/accounting/declarations/${row.id}" style="text-decoration:none;color:inherit">${escapeHtml(row.declaration_type || "—")}</a></div><div class="crm-muted" style="margin-top:4px">${escapeHtml(row.period_label || "—")}</div></td>
        <td>${declarationStatusBadge(escapeHtml, row.status)}</td>
        <td>${escapeHtml(row.due_date || "—")}</td>
        <td>${escapeHtml(row.reference_number || "—")}</td>
        <td>${escapeHtml(row.submission_channel || "—")}</td>
        <td>${row.attachment_path ? `<a href="/${encodeURI(row.attachment_path)}" target="_blank">Declarație</a>` : `<span class="crm-muted">—</span>`} ${row.receipt_path ? `· <a href="/${encodeURI(row.receipt_path)}" target="_blank">Recipisă</a>` : ``}</td>
        <td><a class="crm-btn crm-btn-secondary" href="/accounting/declarations/${row.id}">Detalii</a></td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Declarații</title></head>
${crmShellStart("accounting-declarations", "Declarații", "Urmărire declarații fiscale, perioade, documente și recipise ANAF.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Adaugă declarație</h3><div class="crm-muted" style="margin-top:6px">Ține evidența declarațiilor pregătite și trimise în SPV.</div></div>
      <form method="post" action="/accounting/declarations/create" enctype="multipart/form-data" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Tip declarație</label><select class="crm-input" name="declaration_type"><option>D100</option><option>D112</option><option>D300</option><option>D390</option><option>D394</option><option>SAF-T</option><option>BILANT</option><option>ALTA</option></select></div>
          <div><label class="crm-label">Perioadă</label><input class="crm-input" name="period_label" placeholder="ex: martie 2026"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Start perioadă</label><input class="crm-input" type="date" name="period_start"></div>
          <div><label class="crm-label">Sfârșit perioadă</label><input class="crm-input" type="date" name="period_end"></div>
        </div>
        <div class="crm-grid-3" style="overflow:visible">
          <div><label class="crm-label">Scadență</label><input class="crm-input" type="date" name="due_date"></div>
          <div><label class="crm-label">Status</label><select class="crm-input" name="status"><option value="PREGATITA">Pregătită</option><option value="TRIMISA">Trimisă</option><option value="VALIDATA">Validată</option><option value="RESPINSA">Respinsă</option></select></div>
          <div><label class="crm-label">Canal</label><select class="crm-input" name="submission_channel"><option value="MANUAL_SPV">Manual SPV</option><option value="E_GUVERNARE">e-Guvernare</option><option value="ALT_CANAL">Alt canal</option></select></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Număr referință ANAF</label><input class="crm-input" name="reference_number"></div>
          <div><label class="crm-label">Fișier declarație</label><input class="crm-input" type="file" name="attachment"></div>
        </div>
        <div><label class="crm-label">Recipisă / confirmare</label><input class="crm-input" type="file" name="receipt"></div>
        <div><label class="crm-label">Observații</label><textarea class="crm-input" name="notes" rows="3"></textarea></div>
        <div><button class="crm-btn" type="submit">Salvează declarația</button></div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Registru declarații</h3><div class="crm-muted" style="margin-top:6px">Poți urmări ce e pregătit, trimis și validat.</div></div>
      <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
        <div class="crm-kpi"><div class="crm-kpi-label">Pregătite</div><div class="crm-kpi-value">${escapeHtml(String(stats.pregatita_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Trimise</div><div class="crm-kpi-value">${escapeHtml(String(stats.trimisa_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Validate</div><div class="crm-kpi-value">${escapeHtml(String(stats.validata_count || 0))}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Respinse</div><div class="crm-kpi-value">${escapeHtml(String(stats.respinsa_count || 0))}</div></div>
      </div>
      <form method="get" action="/accounting/declarations" class="crm-grid-3" style="margin-bottom:18px;overflow:visible">
        <div><label class="crm-label">Status</label><select class="crm-input" name="status"><option value="">toate</option><option value="PREGATITA" ${statusFilter === "PREGATITA" ? "selected" : ""}>pregătite</option><option value="TRIMISA" ${statusFilter === "TRIMISA" ? "selected" : ""}>trimise</option><option value="VALIDATA" ${statusFilter === "VALIDATA" ? "selected" : ""}>validate</option><option value="RESPINSA" ${statusFilter === "RESPINSA" ? "selected" : ""}>respinse</option></select></div>
        <div><label class="crm-label">Tip</label><input class="crm-input" name="type" value="${escapeHtml(typeFilter)}" placeholder="ex: D112"></div>
        <div><label class="crm-label">Căutare</label><input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="perioadă / referință"></div>
        <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap"><button class="crm-btn" type="submit">Aplică</button><a class="crm-btn crm-btn-secondary" href="/accounting/declarations">Resetează</a></div>
      </form>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Declarație</th><th>Status</th><th>Scadență</th><th>Nr. înregistrare</th><th>Canal</th><th>Fișiere</th><th>Acțiuni</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" class="crm-muted">Nu există declarații înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </div>
${crmShellEnd()}`);
  });

  app.get("/accounting/declarations/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const row = db.prepare(`
      SELECT *
      FROM accounting_declarations
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!row) return res.status(404).send("Declarație inexistentă");

    function actionButton(nextStatus, label, extraFields = "") {
      return `
        <form method="post" action="/accounting/declarations/${id}/status" class="crm-stack" style="margin:0">
          <input type="hidden" name="status" value="${nextStatus}">
          ${extraFields}
          <button class="crm-btn ${nextStatus === "RESPINSA" ? "crm-btn-danger" : nextStatus === "VALIDATA" ? "" : "crm-btn-secondary"}" type="submit">${label}</button>
        </form>
      `;
    }

    const availableActions = String(row.status || "PREGATITA").toUpperCase() === "PREGATITA"
      ? `
        ${actionButton("TRIMISA", "Marchează trimisă")}
      `
      : String(row.status || "").toUpperCase() === "TRIMISA"
        ? `
          ${actionButton("VALIDATA", "Marchează validată")}
          ${actionButton("RESPINSA", "Marchează respinsă")}
        `
        : String(row.status || "").toUpperCase() === "RESPINSA"
          ? `${actionButton("PREGATITA", "Revino la pregătită")}`
          : `${actionButton("TRIMISA", "Retrimite / marchează trimisă")}`;

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(row.declaration_type || "Declarație")}</title></head>
${crmShellStart("accounting-declarations", row.declaration_type || "Declarație", "Flux de depunere ANAF, documente, recipisă și număr de înregistrare.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
        <div>
          <h3 style="margin:0;font-size:24px">${escapeHtml(row.declaration_type || "Declarație")} · ${escapeHtml(row.period_label || "fără perioadă")}</h3>
          <div class="crm-muted" style="margin-top:6px">Status curent: ${declarationStatusBadge(escapeHtml, row.status)}</div>
        </div>
        <a class="crm-btn crm-btn-secondary" href="/accounting/declarations">Înapoi la declarații</a>
      </div>

      <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
        <div class="crm-kpi"><div class="crm-kpi-label">Perioadă</div><div class="crm-kpi-value">${escapeHtml(row.period_label || "—")}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Scadență</div><div class="crm-kpi-value">${escapeHtml(row.due_date || "—")}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Nr. înregistrare</div><div class="crm-kpi-value">${escapeHtml(row.reference_number || "—")}</div></div>
        <div class="crm-kpi"><div class="crm-kpi-label">Canal</div><div class="crm-kpi-value">${escapeHtml(row.submission_channel || "—")}</div></div>
      </div>

      <div class="crm-table-wrap">
        <table class="crm-table">
          <tbody>
            <tr><th>Fișier depunere</th><td>${row.attachment_path ? `<a href="/${encodeURI(row.attachment_path)}" target="_blank">Deschide declarația</a>` : `<span class="crm-muted">Nu există</span>`}</td></tr>
            <tr><th>Recipisă</th><td>${row.receipt_path ? `<a href="/${encodeURI(row.receipt_path)}" target="_blank">Deschide recipisa</a>` : `<span class="crm-muted">Nu există</span>`}</td></tr>
            <tr><th>Actualizat la</th><td>${escapeHtml(row.updated_at || row.created_at || "—")}</td></tr>
            <tr><th>Observații</th><td>${escapeHtml(row.notes || "—")}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="crm-card">
      <div style="margin-bottom:18px">
        <h3 style="margin:0;font-size:20px">Actualizare depunere ANAF</h3>
        <div class="crm-muted" style="margin-top:6px">Aici actualizezi statusul, numărul de înregistrare și recipisa după depunere.</div>
      </div>

      <form method="post" action="/accounting/declarations/${id}/update" enctype="multipart/form-data" class="crm-stack">
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Status</label><select class="crm-input" name="status"><option value="PREGATITA" ${String(row.status).toUpperCase()==="PREGATITA" ? "selected" : ""}>Pregătită</option><option value="TRIMISA" ${String(row.status).toUpperCase()==="TRIMISA" ? "selected" : ""}>Trimisă</option><option value="VALIDATA" ${String(row.status).toUpperCase()==="VALIDATA" ? "selected" : ""}>Validată</option><option value="RESPINSA" ${String(row.status).toUpperCase()==="RESPINSA" ? "selected" : ""}>Respinsă</option></select></div>
          <div><label class="crm-label">Număr de înregistrare ANAF</label><input class="crm-input" name="reference_number" value="${escapeHtml(row.reference_number || "")}"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Fișier depunere nou</label><input class="crm-input" type="file" name="attachment"></div>
          <div><label class="crm-label">Recipisă nouă</label><input class="crm-input" type="file" name="receipt"></div>
        </div>
        <div><label class="crm-label">Observații</label><textarea class="crm-input" name="notes" rows="4">${escapeHtml(row.notes || "")}</textarea></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="crm-btn" type="submit">Salvează actualizarea</button>
        </div>
      </form>

      <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
        ${availableActions}
      </div>
    </section>
  </div>
${crmShellEnd()}`);
  });

  app.post("/accounting/declarations/create", requireAuth, upload.fields([{ name: "attachment", maxCount: 1 }, { name: "receipt", maxCount: 1 }]), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const files = req.files || {};
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.attachment) ? files.attachment[0] : null, folderName: "declarations" });
    const receiptPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.receipt) ? files.receipt[0] : null, folderName: "declarations" });
    db.prepare(`
      INSERT INTO accounting_declarations (
        company_id, declaration_type, period_label, period_start, period_end, due_date, status,
        submission_channel, reference_number, attachment_path, receipt_path, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      String(req.body?.declaration_type || "D112").trim().toUpperCase(),
      String(req.body?.period_label || "").trim(),
      String(req.body?.period_start || "").trim() || null,
      String(req.body?.period_end || "").trim() || null,
      String(req.body?.due_date || "").trim() || null,
      String(req.body?.status || "PREGATITA").trim().toUpperCase(),
      String(req.body?.submission_channel || "MANUAL_SPV").trim().toUpperCase(),
      String(req.body?.reference_number || "").trim(),
      attachmentPath || null,
      receiptPath || null,
      String(req.body?.notes || "").trim(),
      String(req.session.user.email || "").trim().toLowerCase()
    );
    res.redirect(req.body?.return_to === "nexora" ? "/nexora/accounting/declarations?ok=created" : "/accounting/declarations");
  });

  app.post("/accounting/declarations/:id/update", requireAuth, upload.fields([{ name: "attachment", maxCount: 1 }, { name: "receipt", maxCount: 1 }]), (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const existing = db.prepare(`SELECT id, attachment_path, receipt_path FROM accounting_declarations WHERE id=? AND company_id=?`).get(id, companyId);
    if (!existing) return res.status(404).send("Declarație inexistentă");

    const files = req.files || {};
    const attachmentPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.attachment) ? files.attachment[0] : null, folderName: "declarations" });
    const receiptPath = saveUploadedFile({ fs, path, __dirname, file: Array.isArray(files.receipt) ? files.receipt[0] : null, folderName: "declarations" });

    db.prepare(`
      UPDATE accounting_declarations
      SET status=?,
          reference_number=?,
          attachment_path=COALESCE(?, attachment_path),
          receipt_path=COALESCE(?, receipt_path),
          notes=?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(
      String(req.body?.status || "PREGATITA").trim().toUpperCase(),
      String(req.body?.reference_number || "").trim(),
      attachmentPath || null,
      receiptPath || null,
      String(req.body?.notes || "").trim(),
      id,
      companyId
    );

    res.redirect(req.body?.return_to === "nexora" ? `/nexora/accounting/declarations/${id}?ok=updated` : `/accounting/declarations/${id}`);
  });

  app.post("/accounting/declarations/:id/status", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const status = String(req.body?.status || "").trim().toUpperCase();
    const allowed = new Set(["PREGATITA", "TRIMISA", "VALIDATA", "RESPINSA"]);
    if (!allowed.has(status)) return res.status(400).send("Status invalid");

    const existing = db.prepare(`SELECT id FROM accounting_declarations WHERE id=? AND company_id=?`).get(id, companyId);
    if (!existing) return res.status(404).send("Declarație inexistentă");

    db.prepare(`
      UPDATE accounting_declarations
      SET status=?,
          updated_at=datetime('now')
      WHERE id=? AND company_id=?
    `).run(status, id, companyId);

    res.redirect(req.body?.return_to === "nexora" ? `/nexora/accounting/declarations/${id}?ok=updated` : `/accounting/declarations/${id}`);
  });

  app.get("/accounting/consumption", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const products = db.prepare(`
      SELECT id, code, name, unit, price
      FROM products
      WHERE company_id=? AND active=1
      ORDER BY name COLLATE NOCASE ASC
    `).all(companyId);

    const vouchers = db.prepare(`
      SELECT cv.id, cv.voucher_number, cv.issue_date, cv.department, cv.issued_to, cv.notes,
             IFNULL(SUM(cvi.line_total), 0) AS total_amount,
             COUNT(cvi.id) AS items_count
      FROM consumption_vouchers cv
      LEFT JOIN consumption_voucher_items cvi ON cvi.voucher_id = cv.id
      WHERE cv.company_id=?
      GROUP BY cv.id
      ORDER BY date(cv.issue_date) DESC, cv.id DESC
      LIMIT 150
    `).all(companyId);

    const productOptions = products.map((product) => `<option value="${escapeHtml(String(product.id))}" data-unit="${escapeHtml(product.unit || "buc")}" data-cost="${escapeHtml(String(product.price || 0))}">${escapeHtml(`${product.code || ""} ${product.name || ""}`.trim())}</option>`).join("");
    const voucherRows = vouchers.map((row) => `
      <tr>
        <td><a href="/accounting/consumption/${row.id}">${escapeHtml(row.voucher_number || "—")}</a></td>
        <td>${escapeHtml(row.issue_date || "—")}</td>
        <td>${escapeHtml(row.department || "—")}</td>
        <td>${escapeHtml(row.issued_to || "—")}</td>
        <td class="crm-right">${escapeHtml(String(row.items_count || 0))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total_amount))} RON</td>
      </tr>
    `).join("");

    const lineTemplate = Array.from({ length: 4 }, (_, index) => `
      <div class="crm-grid-4" style="overflow:visible;padding:12px;border:1px solid var(--line);border-radius:16px;background:rgba(15,23,42,.03)">
        <div><label class="crm-label">Produs ${index + 1}</label><select class="crm-input" name="product_id">${`<option value="">Selectează</option>${productOptions}`}</select></div>
        <div><label class="crm-label">Cantitate</label><input class="crm-input" name="qty" value="0"></div>
        <div><label class="crm-label">UM</label><input class="crm-input" name="unit" placeholder="buc"></div>
        <div><label class="crm-label">Cost unitar</label><input class="crm-input" name="unit_cost" value="0"></div>
      </div>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Bonuri de consum</title></head>
${crmShellStart("accounting-consumption", "Bonuri de consum", "Evidență pentru consum intern de materiale și produse din firmă.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <div class="crm-grid-2" style="overflow:visible">
    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Creează bon de consum</h3><div class="crm-muted" style="margin-top:6px">Selectezi produse din catalog și înregistrezi consumul intern.</div></div>
      <form method="post" action="/accounting/consumption/create" class="crm-stack">
        <div class="crm-grid-3" style="overflow:visible">
          <div><label class="crm-label">Număr bon</label><input class="crm-input" name="voucher_number" required value="BC-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}"></div>
          <div><label class="crm-label">Data</label><input class="crm-input" type="date" name="issue_date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div><label class="crm-label">Departament</label><input class="crm-input" name="department" placeholder="ex: Administrativ"></div>
        </div>
        <div class="crm-grid-2" style="overflow:visible">
          <div><label class="crm-label">Predat către</label><input class="crm-input" name="issued_to" placeholder="persoană / compartiment"></div>
          <div><label class="crm-label">Observații</label><input class="crm-input" name="notes"></div>
        </div>
        ${lineTemplate}
        <div><button class="crm-btn" type="submit">Salvează bonul</button></div>
      </form>
    </section>

    <section class="crm-card" style="position:sticky;top:20px;z-index:10">
      <div style="margin-bottom:14px"><h3 style="margin:0;font-size:20px">Registru bonuri</h3><div class="crm-muted" style="margin-top:6px">Ultimele bonuri de consum generate în sistem.</div></div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead><tr><th>Bon</th><th>Data</th><th>Departament</th><th>Predat către</th><th class="crm-right">Poziții</th><th class="crm-right">Total</th></tr></thead>
          <tbody>${voucherRows || `<tr><td colspan="6" class="crm-muted">Nu există bonuri de consum.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </div>
${crmShellEnd()}`);
  });

  app.post("/accounting/consumption/create", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const productIds = Array.isArray(req.body?.product_id) ? req.body.product_id : [req.body?.product_id];
    const quantities = Array.isArray(req.body?.qty) ? req.body.qty : [req.body?.qty];
    const units = Array.isArray(req.body?.unit) ? req.body.unit : [req.body?.unit];
    const unitCosts = Array.isArray(req.body?.unit_cost) ? req.body.unit_cost : [req.body?.unit_cost];

    const items = [];
    for (let index = 0; index < productIds.length; index += 1) {
      const productId = Number(productIds[index] || 0);
      const qty = moneyInput(quantities[index]);
      if (!productId || qty <= 0) continue;
      const product = db.prepare(`SELECT id, name, unit, price FROM products WHERE id=? AND company_id=?`).get(productId, companyId);
      if (!product) continue;
      const unit = String(units[index] || product.unit || "buc").trim();
      const unitCost = moneyInput(unitCosts[index] || product.price || 0);
      items.push({
        productId,
        productName: product.name,
        unit,
        qty,
        unitCost,
        lineTotal: qty * unitCost
      });
    }

    if (!items.length) return res.status(400).send("Adaugă cel puțin o poziție în bon.");

    db.exec("BEGIN");
    try {
      const voucherResult = db.prepare(`
        INSERT INTO consumption_vouchers (company_id, voucher_number, issue_date, department, issued_to, notes, created_by_email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        String(req.body?.voucher_number || "").trim(),
        String(req.body?.issue_date || "").trim() || new Date().toISOString().slice(0, 10),
        String(req.body?.department || "").trim(),
        String(req.body?.issued_to || "").trim(),
        String(req.body?.notes || "").trim(),
        String(req.session.user.email || "").trim().toLowerCase()
      );

      const voucherId = Number(voucherResult.lastInsertRowid);
      const insertItem = db.prepare(`
        INSERT INTO consumption_voucher_items (voucher_id, product_id, product_name, qty, unit, unit_cost, line_total, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(voucherId, item.productId, item.productName, item.qty, item.unit, item.unitCost, item.lineTotal, companyId);
      }

      db.exec("COMMIT");
      res.redirect(`/accounting/consumption/${voucherId}`);
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      res.status(500).send(`Bonul de consum nu a putut fi salvat: ${String(error?.message || error)}`);
    }
  });

  app.get("/accounting/consumption/:id", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const id = Number(req.params.id || 0);
    const voucher = db.prepare(`
      SELECT id, voucher_number, issue_date, department, issued_to, notes, created_by_email, created_at
      FROM consumption_vouchers
      WHERE id=? AND company_id=?
    `).get(id, companyId);
    if (!voucher) return res.status(404).send("Bon inexistent");

    const items = db.prepare(`
      SELECT product_name, qty, unit, unit_cost, line_total
      FROM consumption_voucher_items
      WHERE voucher_id=? AND company_id=?
      ORDER BY id ASC
    `).all(id, companyId);

    const total = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const itemsHtml = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.product_name || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(item.qty))}</td>
        <td>${escapeHtml(item.unit || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(item.unit_cost))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(item.line_total))}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(voucher.voucher_number || "Bon de consum")}</title></head>
${crmShellStart("accounting-consumption", voucher.voucher_number || "Bon de consum", "Detaliu bon de consum și pozițiile sale.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h3 style="margin:0;font-size:22px">${escapeHtml(voucher.voucher_number || "Bon de consum")}</h3>
        <div class="crm-muted" style="margin-top:6px">Data: ${escapeHtml(voucher.issue_date || "—")} · Departament: ${escapeHtml(voucher.department || "—")} · Predat către: ${escapeHtml(voucher.issued_to || "—")}</div>
      </div>
      <a class="crm-btn crm-btn-secondary" href="/accounting/consumption">Înapoi</a>
    </div>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead><tr><th>Produs</th><th class="crm-right">Cantitate</th><th>UM</th><th class="crm-right">Cost unitar</th><th class="crm-right">Total</th></tr></thead>
        <tbody>${itemsHtml || `<tr><td colspan="5" class="crm-muted">Nu există poziții.</td></tr>`}</tbody>
      </table>
    </div>
    <div style="margin-top:18px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div class="crm-muted">${escapeHtml(voucher.notes || "Fără observații")}</div>
      <div style="font-weight:800">Total bon: ${escapeHtml(fmtMoney(total))} RON</div>
    </div>
  </section>
${crmShellEnd()}`);
  });

  app.get("/accounting/receivables", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim().toLowerCase();

    const where = [
      "f.company_id=?",
      "UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')",
      "bp.id IS NULL"
    ];
    const params = [companyId];

    if (statusFilter) {
      if (statusFilter === "RESTANTE") {
        where.push("f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now')");
      } else if (statusFilter === "DESCHISE") {
        where.push("1=1");
      } else {
        where.push("UPPER(COALESCE(f.status,''))=?");
        params.push(statusFilter);
      }
    }

    if (search) {
      const like = `%${search}%`;
      where.push("(LOWER(COALESCE(f.factura_nr,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(COALESCE(c.cui,'')) LIKE ?)");
      params.push(like, like, like);
    }

    const rows = db.prepare(`
      SELECT
        f.id,
        f.factura_nr,
        f.status,
        f.total,
        f.moneda,
        f.data_emitere,
        f.scadenta,
        c.name AS client_name,
        c.cui AS client_cui
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      LEFT JOIN billing_payments bp ON bp.generated_factura_id = f.id
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE
          WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') THEN 0
          ELSE 1
        END,
        date(COALESCE(f.scadenta, f.data_emitere, f.created_at)) ASC,
        f.id DESC
      LIMIT 250
    `).all(...params);

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(f.total), 0) AS total_amount,
        SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') THEN 1 ELSE 0 END) AS overdue_count,
        IFNULL(SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') THEN f.total ELSE 0 END), 0) AS overdue_amount
      FROM facturi f
      LEFT JOIN billing_payments bp ON bp.generated_factura_id = f.id
      WHERE f.company_id=?
        AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA')
        AND bp.id IS NULL
    `).get(companyId) || {};

    const rowsHtml = rows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber(row))}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.client_name || "—")}</div>
          <div class="crm-muted">${escapeHtml(row.client_cui || "—")}</div>
        </td>
        <td><span class="crm-badge crm-badge-neutral">${escapeHtml(row.status || "—")}</span></td>
        <td>${escapeHtml(row.data_emitere || "—")}</td>
        <td>${escapeHtml(row.scadenta || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.moneda || "RON"))}</td>
      </tr>
    `).join("");

    res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Facturi de urmărit la încasare</title></head>
${crmShellStart("accounting-receivables", "Facturi de urmărit la încasare", "Facturi deschise fără plată legată, utile pentru urmărirea încasărilor și restanțelor.", req.session.user.email, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}
  <section class="crm-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h3 style="margin:0;font-size:22px">Facturi fără plată legată</h3>
        <div class="crm-muted" style="margin-top:6px">Aici vezi facturile care sunt încă deschise și nu au nicio plată asociată în sistem.</div>
      </div>
    </div>

    <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
      <div class="crm-kpi"><div class="crm-kpi-label">Total facturi</div><div class="crm-kpi-value">${escapeHtml(String(stats.total_count || 0))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Valoare totală</div><div class="crm-kpi-value">${escapeHtml(fmtMoney(stats.total_amount || 0))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Restante</div><div class="crm-kpi-value">${escapeHtml(String(stats.overdue_count || 0))}</div></div>
      <div class="crm-kpi"><div class="crm-kpi-label">Valoare restantă</div><div class="crm-kpi-value">${escapeHtml(fmtMoney(stats.overdue_amount || 0))}</div></div>
    </div>

    <form method="get" action="/accounting/receivables" class="crm-grid-3" style="margin-bottom:18px;overflow:visible">
      <div>
        <label class="crm-label">Status</label>
        <select class="crm-input" name="status">
          <option value="" ${statusFilter === "" ? "selected" : ""}>toate</option>
          <option value="DESCHISE" ${statusFilter === "DESCHISE" ? "selected" : ""}>deschise</option>
          <option value="RESTANTE" ${statusFilter === "RESTANTE" ? "selected" : ""}>restante</option>
          <option value="TRIMISA" ${statusFilter === "TRIMISA" ? "selected" : ""}>trimise</option>
          <option value="INTARZIATA" ${statusFilter === "INTARZIATA" ? "selected" : ""}>întârziate</option>
        </select>
      </div>
      <div style="grid-column:span 2">
        <label class="crm-label">Căutare</label>
        <input class="crm-input" name="search" value="${escapeHtml(search)}" placeholder="Număr factură, client sau CUI">
      </div>
      <div style="grid-column:1 / -1;display:flex;gap:10px;flex-wrap:wrap">
        <button class="crm-btn" type="submit">Aplică</button>
        <a class="crm-btn crm-btn-secondary" href="/accounting/receivables">Resetează</a>
      </div>
    </form>

    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Factură / client</th>
            <th>Status</th>
            <th>Emitere</th>
            <th>Scadență</th>
            <th class="crm-right">Total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" class="crm-muted">Nu există facturi de urmărit pentru filtrele selectate.</td></tr>`}</tbody>
      </table>
    </div>
  </section>
${crmShellEnd()}`);
  });

  app.get("/accounting", requireAuth, (req, res) => {
    const companyId = Number(req.session.user.company_id || 0);
    const userEmail = req.session.user.email;
    const isAccountingUser = String(req.session.user.role || "").trim().toLowerCase() === "accounting";
    const canAccessSpvWorkspace = canAccessSpvUser(req.session.user);
    const filters = buildInvoiceFilterState(req.query);
    const { whereSql, params } = buildInvoiceWhereClause(filters, companyId);
    const exportQuery = invoiceExportQueryString(filters);
    const inboxFilters = buildInboxFilterState(req.query);
    const inboxExportQuery = new URLSearchParams();
    if (inboxFilters.processed) inboxExportQuery.set("processed", inboxFilters.processed);
    if (inboxFilters.dateFrom) inboxExportQuery.set("date_from", inboxFilters.dateFrom);
    if (inboxFilters.dateTo) inboxExportQuery.set("date_to", inboxFilters.dateTo);
    if (inboxFilters.search) inboxExportQuery.set("search", inboxFilters.search);
    const inboxExportHref = `/accounting/export/inbox-spv.csv${inboxExportQuery.toString() ? `?${inboxExportQuery.toString()}` : ""}`;

    const invoiceStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total), 0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'INCASATA' THEN 1 ELSE 0 END) AS paid_count,
        IFNULL(SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'INCASATA' THEN total ELSE 0 END), 0) AS paid_amount,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS open_count,
        IFNULL(SUM(CASE WHEN UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN total ELSE 0 END), 0) AS open_amount,
        SUM(CASE WHEN scadenta IS NOT NULL AND scadenta <> '' AND date(scadenta) < date('now') AND UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS overdue_count,
        IFNULL(SUM(CASE WHEN scadenta IS NOT NULL AND scadenta <> '' AND date(scadenta) < date('now') AND UPPER(COALESCE(status,'')) NOT IN ('INCASATA', 'ANULATA') THEN total ELSE 0 END), 0) AS overdue_amount,
        SUM(CASE WHEN COALESCE(efactura_upload_index, efactura_message_id, '') <> '' AND COALESCE(efactura_download_id, '') = '' THEN 1 ELSE 0 END) AS spv_pending_count,
        SUM(CASE WHEN COALESCE(efactura_last_error, '') <> '' THEN 1 ELSE 0 END) AS efactura_error_count
      FROM facturi
      WHERE company_id=?
    `).get(companyId) || {};

    const invoiceMonth = db.prepare(`
      SELECT
        COUNT(*) AS issued_count,
        IFNULL(SUM(total), 0) AS issued_amount
      FROM facturi
      WHERE company_id=?
        AND substr(COALESCE(data_emitere, created_at, ''), 1, 7) = strftime('%Y-%m', 'now')
    `).get(companyId) || {};

    const paymentStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount,
        SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'paid' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN LOWER(COALESCE(status,'')) NOT IN ('paid', 'failed', 'cancelled', 'canceled') THEN 1 ELSE 0 END) AS pending_count,
        IFNULL(SUM(CASE WHEN LOWER(COALESCE(status,'')) NOT IN ('paid', 'failed', 'cancelled', 'canceled') THEN amount ELSE 0 END), 0) AS pending_amount
      FROM billing_payments
      WHERE company_id=?
    `).get(companyId) || {};

    const reconciliationStats = db.prepare(`
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' AND bp.generated_factura_id IS NOT NULL AND UPPER(COALESCE(f.status,''))='INCASATA' THEN 1 ELSE 0 END) AS matched_count,
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' AND bp.generated_factura_id IS NOT NULL AND UPPER(COALESCE(f.status,''))<>'INCASATA' THEN 1 ELSE 0 END) AS payment_not_marked_count,
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))='paid' AND bp.generated_factura_id IS NULL THEN 1 ELSE 0 END) AS payment_without_invoice_count,
        SUM(CASE WHEN LOWER(COALESCE(bp.status,''))<>'paid' AND bp.generated_factura_id IS NOT NULL THEN 1 ELSE 0 END) AS pending_link_count
      FROM billing_payments bp
      LEFT JOIN facturi f ON f.id = bp.generated_factura_id
      WHERE bp.company_id=?
    `).get(companyId) || {};

    const spvStats = db.prepare(`
      SELECT
        SUM(CASE WHEN environment='prod' THEN 1 ELSE 0 END) AS prod_connections,
        SUM(CASE WHEN environment='test' THEN 1 ELSE 0 END) AS test_connections,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <> '' AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END) AS active_connections
      FROM anaf_connections
      WHERE company_id=?
    `).get(companyId) || {};

    const inboxStats = db.prepare(`
      SELECT
        COUNT(*) AS inbox_count,
        SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) AS inbox_unprocessed_count,
        MAX(COALESCE(received_at, created_at)) AS last_received_at
      FROM anaf_inbox
      WHERE company_id=?
    `).get(companyId) || {};

    const messageStats = db.prepare(`
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(direction,''))='out' THEN 1 ELSE 0 END) AS outbox_count,
        SUM(CASE WHEN LOWER(COALESCE(direction,''))='out' AND LOWER(COALESCE(status,'')) IN ('error', 'eroare', 'failed') THEN 1 ELSE 0 END) AS outbox_error_count
      FROM anaf_messages
      WHERE company_id=?
    `).get(companyId) || {};

    const declarationStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='PREGATITA' THEN 1 ELSE 0 END) AS pregatita_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1 ELSE 0 END) AS trimisa_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='VALIDATA' THEN 1 ELSE 0 END) AS validata_count,
        SUM(CASE WHEN UPPER(COALESCE(status,''))='RESPINSA' THEN 1 ELSE 0 END) AS respinsa_count,
        SUM(CASE
          WHEN due_date IS NOT NULL
            AND due_date <> ''
            AND date(due_date) <= date('now', '+7 day')
            AND UPPER(COALESCE(status,'')) IN ('PREGATITA', 'RESPINSA')
          THEN 1 ELSE 0
        END) AS urgent_count
      FROM accounting_declarations
      WHERE company_id=?
    `).get(companyId) || {};

    const expenseStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        IFNULL(SUM(total), 0) AS total_amount,
        SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN 1 ELSE 0 END) AS unpaid_count,
        IFNULL(SUM(CASE WHEN UPPER(COALESCE(payment_status,'')) <> 'PLATITA' THEN total ELSE 0 END), 0) AS unpaid_amount,
        IFNULL(SUM(CASE WHEN substr(COALESCE(issue_date, created_at, ''), 1, 7) = strftime('%Y-%m', 'now') THEN total ELSE 0 END), 0) AS month_amount
      FROM accounting_expenses
      WHERE company_id=?
    `).get(companyId) || {};

    const consumptionStats = db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN substr(COALESCE(issue_date, created_at, ''), 1, 7) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS month_count,
        MAX(COALESCE(issue_date, created_at)) AS last_issue_date
      FROM consumption_vouchers
      WHERE company_id=?
    `).get(companyId) || {};

    const recentInvoices = db.prepare(`
      SELECT
        f.id,
        f.factura_nr,
        f.status,
        f.total,
        f.moneda,
        f.data_emitere,
        f.scadenta,
        f.efactura_status,
        f.efactura_message_id,
        f.efactura_upload_index,
        f.efactura_download_id,
        f.efactura_last_error,
        c.name AS client_name
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE f.company_id=?
      ORDER BY f.id DESC
      LIMIT 5
    `).all(companyId);

    const recentInbox = db.prepare(`
      SELECT id, supplier_cui, invoice_number, received_at, processed, created_at
      FROM anaf_inbox
      WHERE company_id=?
      ORDER BY datetime(COALESCE(received_at, created_at)) DESC, id DESC
      LIMIT 8
    `).all(companyId);

    const recentPayments = db.prepare(`
      SELECT id, source, status, amount, currency, payer_name, payer_email, paid_at, created_at, reference_code
      FROM billing_payments
      WHERE company_id=?
      ORDER BY datetime(COALESCE(paid_at, created_at)) DESC, id DESC
      LIMIT 8
    `).all(companyId);

    const recentDeclarations = db.prepare(`
      SELECT id, declaration_type, period_label, due_date, status, reference_number
      FROM accounting_declarations
      WHERE company_id=?
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(status,'')) IN ('PREGATITA', 'RESPINSA') THEN 0
          WHEN UPPER(COALESCE(status,''))='TRIMISA' THEN 1
          ELSE 2
        END,
        date(COALESCE(due_date, created_at)) ASC,
        id DESC
      LIMIT 5
    `).all(companyId);

    const declarationDeadlines = db.prepare(`
      SELECT id, declaration_type, period_label, due_date, status
      FROM accounting_declarations
      WHERE company_id=?
        AND due_date IS NOT NULL
        AND due_date <> ''
      ORDER BY
        CASE
          WHEN date(due_date) < date('now') THEN 0
          WHEN date(due_date) <= date('now', '+7 day') THEN 1
          ELSE 2
        END,
        date(due_date) ASC,
        id DESC
      LIMIT 6
    `).all(companyId);

    const recentExpenses = db.prepare(`
      SELECT id, supplier_name, expense_type, payment_status, total, currency, issue_date
      FROM accounting_expenses
      WHERE company_id=?
      ORDER BY date(COALESCE(issue_date, created_at)) DESC, id DESC
      LIMIT 5
    `).all(companyId);

    const reconciliationRows = db.prepare(`
      SELECT
        bp.id,
        bp.source,
        bp.status,
        bp.amount,
        bp.currency,
        bp.payer_name,
        bp.payer_email,
        bp.reference_code,
        bp.paid_at,
        bp.created_at,
        bp.generated_factura_id,
        bp.invoice_generation_status,
        f.factura_nr,
        f.status AS factura_status,
        f.total AS factura_total
      FROM billing_payments bp
      LEFT JOIN facturi f ON f.id = bp.generated_factura_id
      WHERE bp.company_id=?
      ORDER BY datetime(COALESCE(bp.paid_at, bp.created_at)) DESC, bp.id DESC
      LIMIT 20
    `).all(companyId);

    const connection = db.prepare(`
      SELECT environment, scope, expires_at, refresh_expires_at, updated_at
      FROM anaf_connections
      WHERE company_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId) || null;

    const accountingInvoiceRows = db.prepare(`
      SELECT
        f.id,
        f.factura_nr,
        f.status,
        f.moneda,
        f.subtotal,
        f.tva_valoare,
        f.total,
        f.data_emitere,
        f.scadenta,
        f.efactura_status,
        f.efactura_message_id,
        f.efactura_upload_index,
        f.efactura_download_id,
        f.efactura_last_error,
        c.name AS client_name,
        c.cui AS client_cui
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE ${whereSql}
      ORDER BY date(COALESCE(f.data_emitere, f.created_at)) DESC, f.id DESC
      LIMIT 120
    `).all(...params);

    const filteredInvoiceStats = db.prepare(`
      SELECT
        COUNT(*) AS invoice_count,
        IFNULL(SUM(f.total), 0) AS total_amount,
        SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA') THEN 1 ELSE 0 END) AS overdue_count,
        IFNULL(SUM(CASE WHEN f.scadenta IS NOT NULL AND f.scadenta <> '' AND date(f.scadenta) < date('now') AND UPPER(COALESCE(f.status,'')) NOT IN ('INCASATA', 'ANULATA') THEN f.total ELSE 0 END), 0) AS overdue_amount
      FROM facturi f
      JOIN clients c ON c.id = f.client_id AND c.company_id = f.company_id
      WHERE ${whereSql}
    `).get(...params) || {};

    function badge(tone, label) {
      return `<span class="crm-badge ${tone}">${escapeHtml(label)}</span>`;
    }

    function efacturaBadge(row) {
      if (String(row?.efactura_last_error || "").trim()) return badge("crm-badge-red", "eroare");
      const status = String(row?.efactura_status || "").trim();
      if (status === "DEMO_LOCAL") return badge("crm-badge-blue", "demo simulat");
      if (status === "DEMO_CONFIRMAT") return badge("crm-badge-green", "demo confirmat");
      if (!status) return badge("crm-badge-neutral", "neinițiat");
      if (["RESPINS_VALIDARE", "RESPINSA_SPV"].includes(status.toUpperCase())) return badge("crm-badge-red", "respinsă");
      if (String(row?.efactura_download_id || "").trim()) return badge("crm-badge-green", status);
      if (String(row?.efactura_upload_index || row?.efactura_message_id || "").trim()) return badge("crm-badge-blue", status);
      return badge("crm-badge-neutral", status);
    }

    function paymentBadge(status) {
      const normalized = String(status || "").trim().toLowerCase();
      if (normalized === "paid") return badge("crm-badge-green", "plătită");
      if (["failed", "cancelled", "canceled"].includes(normalized)) return badge("crm-badge-red", normalized);
      return badge("crm-badge-blue", normalized || "în curs");
    }

    function reconciliationBadge(row) {
      const paymentStatus = String(row?.status || "").trim().toLowerCase();
      const facturaStatus = String(row?.factura_status || "").trim().toUpperCase();
      const hasInvoice = Number(row?.generated_factura_id || 0) > 0;

      if (paymentStatus === "paid" && hasInvoice && facturaStatus === "INCASATA") {
        return badge("crm-badge-green", "reconciliat");
      }
      if (paymentStatus === "paid" && hasInvoice) {
        return badge("crm-badge-amber", "plată confirmată, factură neîncasată");
      }
      if (paymentStatus === "paid" && !hasInvoice) {
        return badge("crm-badge-red", "plată fără factură");
      }
      if (hasInvoice) {
        return badge("crm-badge-blue", "factură legată, plată în curs");
      }
      return badge("crm-badge-neutral", "de verificat");
    }

    const invoiceRowsHtml = recentInvoices.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber(row))}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.client_name || "—")}</div>
        </td>
        <td>${badge("crm-badge-neutral", row.status || "—")}</td>
        <td>${efacturaBadge(row)}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.moneda || "RON"))}</td>
        <td>${escapeHtml(row.data_emitere || "—")}</td>
        <td>${escapeHtml(row.scadenta || "—")}</td>
      </tr>
    `).join("");

    const inboxRowsHtml = recentInbox.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.invoice_number || "Fără număr")}</div>
          <div class="crm-muted" style="margin-top:4px">Furnizor CUI: ${escapeHtml(row.supplier_cui || "—")}</div>
        </td>
        <td>${Number(row.processed) ? badge("crm-badge-green", "procesat") : badge("crm-badge-blue", "nou")}</td>
        <td>${escapeHtml(row.received_at || row.created_at || "—")}</td>
      </tr>
    `).join("");

    const paymentRowsHtml = recentPayments.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.payer_name || row.payer_email || row.reference_code || `Plată #${row.id}`)}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml((row.source || "").toUpperCase() || "—")}</div>
        </td>
        <td>${paymentBadge(row.status)}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.amount))} ${escapeHtml(String(row.currency || "EUR").toUpperCase())}</td>
        <td>${escapeHtml(row.paid_at || row.created_at || "—")}</td>
      </tr>
    `).join("");

    const reconciliationRowsHtml = reconciliationRows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(row.payer_name || row.payer_email || row.reference_code || `Plată #${row.id}`)}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml((row.source || "").toUpperCase() || "—")}</div>
        </td>
        <td>${paymentBadge(row.status)}</td>
        <td>${reconciliationBadge(row)}</td>
        <td>
          ${row.generated_factura_id
            ? `<div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber({ id: row.generated_factura_id, factura_nr: row.factura_nr }))}</div><div class="crm-muted" style="margin-top:4px">${escapeHtml(row.factura_status || "—")}</div>`
            : `<span class="crm-muted">Fără factură legată</span>`}
        </td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.amount))} ${escapeHtml(String(row.currency || "EUR").toUpperCase())}</td>
        <td>${escapeHtml(row.paid_at || row.created_at || "—")}</td>
      </tr>
    `).join("");

    const latestConnectionStatus = connection
      ? `${String(connection.environment || "test").toUpperCase()} · actualizat ${escapeHtml(connection.updated_at || "—")}`
      : "Nu există conexiune ANAF salvată";

    const accountingInvoiceRowsHtml = accountingInvoiceRows.map((row) => `
      <tr>
        <td>
          <div style="font-weight:800">${escapeHtml(formatInvoiceDisplayNumber(row))}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.client_name || "—")}</div>
          <div class="crm-muted">${escapeHtml(row.client_cui || "—")}</div>
        </td>
        <td>${badge("crm-badge-neutral", row.status || "—")}</td>
        <td>${efacturaBadge(row)}</td>
        <td>${escapeHtml(row.data_emitere || "—")}</td>
        <td>${escapeHtml(row.scadenta || "—")}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.subtotal))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.tva_valoare))}</td>
        <td class="crm-right">${escapeHtml(fmtMoney(row.total))} ${escapeHtml(String(row.moneda || "RON"))}</td>
      </tr>
    `).join("");

    const launchCards = [
      {
        href: "/accounting/declarations",
        eyebrow: "ANAF",
        title: "Declarații și recipise",
        copy: "Pregătești, trimiți și urmărești statusul declarațiilor dintr-un singur loc.",
        meta: `${Number(declarationStats.pregatita_count || 0)} pregătite · ${Number(declarationStats.respinsa_count || 0)} respinse`,
        tone: "linear-gradient(135deg,#0f172a 0%,#1d4ed8 55%,#38bdf8 100%)",
        cta: "Deschide declarațiile",
        icon: "declarations"
      },
      canAccessSpvWorkspace ? {
        href: "/anaf/inbox",
        eyebrow: "SPV",
        title: "Inbox e-Factura",
        copy: "Vezi documentele noi din SPV, procesează-le și mergi direct la ce trebuie verificat.",
        meta: `${Number(inboxStats.inbox_unprocessed_count || 0)} neprocesate · ${Number(inboxStats.inbox_count || 0)} total`,
        tone: "linear-gradient(135deg,#052e16 0%,#15803d 55%,#34d399 100%)",
        cta: "Intră în inbox",
        icon: "spv"
      } : null,
      {
        href: "/accounting/expenses",
        eyebrow: "Cheltuieli",
        title: "Cheltuieli și documente",
        copy: "Înregistrezi facturi de intrare, bonuri și documente justificative pentru firmă.",
        meta: `${Number(expenseStats.unpaid_count || 0)} neplătite · ${escapeHtml(fmtMoney(expenseStats.month_amount || 0))} RON luna asta`,
        tone: "linear-gradient(135deg,#3f1d0d 0%,#b45309 55%,#f59e0b 100%)",
        cta: "Gestionează cheltuielile",
        icon: "expenses"
      },
      {
        href: "/accounting/consumption",
        eyebrow: "Stoc intern",
        title: "Bonuri de consum",
        copy: "Urmărești ieșirile interne, consumurile pe departamente și documentele de predare.",
        meta: `${Number(consumptionStats.month_count || 0)} bonuri luna asta · ${Number(consumptionStats.total_count || 0)} total`,
        tone: "linear-gradient(135deg,#3b0764 0%,#7c3aed 55%,#c084fc 100%)",
        cta: "Deschide bonurile",
        icon: "consumption"
      },
      {
        href: "/facturi",
        eyebrow: "Vânzări",
        title: "Registru facturi",
        copy: "Lucrezi cu facturile emise, scadențele, stările comerciale și statusul e-Factura.",
        meta: `${Number(invoiceStats.overdue_count || 0)} restante · ${Number(invoiceStats.open_count || 0)} deschise`,
        tone: "linear-gradient(135deg,#111827 0%,#374151 55%,#94a3b8 100%)",
        cta: "Vezi facturile",
        icon: "invoices"
      },
      {
        href: "/accounting#reconciliere",
        eyebrow: "Control",
        title: "Reconciliere plăți",
        copy: "Compari încasările, facturile legate și plățile care încă cer validare contabilă.",
        meta: `${Number(reconciliationStats.payment_not_marked_count || 0)} de verificat · ${Number(reconciliationStats.matched_count || 0)} reconciliate`,
        tone: "linear-gradient(135deg,#1f2937 0%,#0f766e 55%,#2dd4bf 100%)",
        cta: "Verifică reconcilierea",
        icon: "reconciliation"
      }
    ].filter(Boolean);

    function launchIcon(type) {
      if (type === "declarations") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>`;
      }
      if (type === "spv") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18"/><path d="M5 7l7 6 7-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>`;
      }
      if (type === "expenses") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18H7z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`;
      }
      if (type === "consumption") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8l7-4 7 4-7 4z"/><path d="M5 8v8l7 4 7-4V8"/><path d="M12 12v8"/></svg>`;
      }
      if (type === "invoices") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-5-3-5 3z"/><path d="M9 8h6"/><path d="M9 12h6"/></svg>`;
      }
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/><path d="M12 4v16"/><circle cx="12" cy="12" r="9"/></svg>`;
    }

    const launchCardsHtml = launchCards.map((card) => `
      <a href="${card.href}" class="accounting-launch-card" style="background:${card.tone}">
        <div class="accounting-launch-icon">${launchIcon(card.icon)}</div>
        <div class="accounting-launch-eyebrow">${escapeHtml(card.eyebrow)}</div>
        <div class="accounting-launch-title">${escapeHtml(card.title)}</div>
        <div class="accounting-launch-copy">${escapeHtml(card.copy)}</div>
        <div class="accounting-launch-meta">${card.meta}</div>
        <div class="accounting-launch-cta">${escapeHtml(card.cta)} <span aria-hidden="true">→</span></div>
      </a>
    `).join("");

    const focusItems = [
      Number(declarationStats.urgent_count || 0) > 0
        ? {
          title: "Declarații aproape de scadență",
          text: `${Number(declarationStats.urgent_count || 0)} declarații sunt pregătite sau respinse și au scadență în următoarele 7 zile.`,
          href: "/accounting/declarations",
          cta: "Intră în declarații",
          tone: "amber"
        }
        : null,
      canAccessSpvWorkspace && Number(inboxStats.inbox_unprocessed_count || 0) > 0
        ? {
          title: "Inbox SPV de procesat",
          text: `${Number(inboxStats.inbox_unprocessed_count || 0)} documente noi din SPV așteaptă verificare și clasificare.`,
          href: "/anaf/inbox",
          cta: "Deschide inboxul",
          tone: "blue"
        }
        : null,
      Number(invoiceStats.overdue_count || 0) > 0
        ? {
          title: "Facturi restante la încasare",
          text: `${Number(invoiceStats.overdue_count || 0)} facturi au depășit scadența, în valoare de ${escapeHtml(fmtMoney(invoiceStats.overdue_amount || 0))} RON.`,
          href: "/accounting",
          cta: "Vezi registrul",
          tone: "red"
        }
        : null,
      Number(expenseStats.unpaid_count || 0) > 0
        ? {
          title: "Cheltuieli neînchise",
          text: `${Number(expenseStats.unpaid_count || 0)} cheltuieli nu sunt marcate plătite și cer atenție contabilă.`,
          href: "/accounting/expenses",
          cta: "Mergi la cheltuieli",
          tone: "green"
        }
        : null
    ].filter(Boolean);

    const focusItemsHtml = focusItems.length
      ? focusItems.map((item) => `
        <div class="accounting-focus-card accounting-focus-${item.tone}">
          <div class="accounting-focus-title">${escapeHtml(item.title)}</div>
          <div class="accounting-focus-copy">${escapeHtml(item.text)}</div>
          <div class="accounting-focus-link">${escapeHtml(item.cta)}</div>
        </div>
      `).join("")
      : `
        <div class="accounting-focus-card accounting-focus-green">
          <div class="accounting-focus-title">Zi liniștită în contabilitate</div>
          <div class="accounting-focus-copy">Nu există alerte majore în acest moment. Poți merge direct în fluxul în care ai de lucrat.</div>
          <div class="accounting-focus-link">Totul este sub control</div>
        </div>
      `;

    const declarationPreviewHtml = recentDeclarations.map((row) => `
      <div class="accounting-mini-row">
        <div>
          <div style="font-weight:800">${escapeHtml(row.declaration_type || "Declarație")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.period_label || "fără perioadă")}</div>
        </div>
        <div style="text-align:right">
          <div>${declarationStatusBadge(escapeHtml, row.status)}</div>
          <div class="crm-muted" style="margin-top:6px">${escapeHtml(row.due_date || row.reference_number || "—")}</div>
        </div>
      </div>
    `).join("");

    const expensePreviewHtml = recentExpenses.map((row) => `
      <div class="accounting-mini-row">
        <div>
          <div style="font-weight:800">${escapeHtml(row.supplier_name || "Furnizor")}</div>
          <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.expense_type || "cheltuială")} · ${escapeHtml(row.issue_date || "—")}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800">${escapeHtml(fmtMoney(row.total || 0))} ${escapeHtml(String(row.currency || "RON"))}</div>
          <div class="crm-muted" style="margin-top:6px">${escapeHtml(String(row.payment_status || "—").toLowerCase())}</div>
        </div>
      </div>
    `).join("");

    const deadlineRowsHtml = declarationDeadlines.map((row) => {
      const due = String(row.due_date || "").trim();
      const status = String(row.status || "PREGATITA").trim().toUpperCase();
      const toneClass = due && due < new Date().toISOString().slice(0, 10)
        ? "accounting-deadline-red"
        : due && due <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          ? "accounting-deadline-amber"
          : "accounting-deadline-blue";
      return `
        <div class="accounting-deadline-row ${toneClass}">
          <div>
            <div style="font-weight:800">${escapeHtml(row.declaration_type || "Declarație")}</div>
            <div class="crm-muted" style="margin-top:4px">${escapeHtml(row.period_label || "fără perioadă")}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800">${escapeHtml(due || "fără scadență")}</div>
            <div style="margin-top:6px">${declarationStatusBadge(escapeHtml, status)}</div>
          </div>
        </div>
      `;
    }).join("");

    const onboardingSteps = [
      canAccessSpvWorkspace
        ? {
          title: "Verifică SPV și recipisele",
          copy: "Începe ziua cu inboxul SPV și cu declarațiile trimise care așteaptă validare sau recipisă.",
          href: "/anaf/inbox",
          cta: "Mergi la SPV"
        }
        : {
          title: "Verifică declarațiile și recipisele",
          copy: "Începe ziua cu declarațiile pregătite, recipisele primite și scadențele fiscale apropiate.",
          href: "/accounting/declarations",
          cta: "Mergi la declarații"
        },
      {
        title: "Înregistrează cheltuieli și documente",
        copy: "Adaugă facturile de intrare, bonurile fiscale și cheltuielile neînregistrate.",
        href: "/accounting/expenses",
        cta: "Deschide cheltuielile"
      },
      {
        title: "Închide ziua cu reconcilierea",
        copy: "Compară încasările, facturile și plățile rămase în verificare pentru control final.",
        href: "/accounting#reconciliere",
        cta: "Vezi reconcilierea"
      }
    ];

    const onboardingHtml = onboardingSteps.map((step, index) => `
      <div class="accounting-onboarding-step">
        <div class="accounting-onboarding-index">0${index + 1}</div>
        <div>
          <div class="accounting-onboarding-title">${escapeHtml(step.title)}</div>
          <div class="accounting-onboarding-copy">${escapeHtml(step.copy)}</div>
          <div class="accounting-onboarding-link">${escapeHtml(step.cta)}</div>
        </div>
      </div>
    `).join("");

    const pageIntro = isAccountingUser
      ? canAccessSpvWorkspace
        ? "Workspace premium pentru contabil, construit ca punct unic de lucru pentru ANAF, e-Factura, registre și verificări."
        : "Workspace premium pentru contabil, construit ca punct unic de lucru pentru declarații, registre și verificări contabile."
      : canAccessSpvWorkspace
        ? "Panou premium pentru facturi, e-Factura SPV, plăți și verificări contabile."
        : "Panou premium pentru facturi, plăți și verificări contabile.";

    res.type("html").send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Contabilitate</title>
<style>
  .accounting-premium-shell{
    display:grid;
    gap:14px;
  }
  .accounting-premium-hero{
    position:relative;
    overflow:hidden;
    border-radius:22px;
    padding:24px;
    color:#fff;
    background:
      radial-gradient(circle at top left, rgba(255,255,255,.2), transparent 34%),
      radial-gradient(circle at bottom right, rgba(45,212,191,.24), transparent 28%),
      linear-gradient(135deg,#0f172a 0%, #102a5c 38%, #0f766e 100%);
    box-shadow:0 20px 46px rgba(15,23,42,.22);
  }
  .accounting-premium-hero::after{
    content:"";
    position:absolute;
    inset:auto -80px -120px auto;
    width:280px;
    height:280px;
    border-radius:999px;
    background:rgba(255,255,255,.08);
    filter:blur(8px);
  }
  .accounting-premium-grid{
    display:grid;
    grid-template-columns:1.35fr .9fr;
    gap:14px;
    align-items:stretch;
  }
  .accounting-hero-top{
    display:flex;
    justify-content:space-between;
    gap:12px;
    align-items:flex-start;
    flex-wrap:wrap;
  }
  .accounting-hero-kpis{
    display:grid;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:10px;
    margin-top:18px;
  }
  .accounting-kpi-glass{
    border:1px solid rgba(255,255,255,.16);
    border-radius:16px;
    padding:12px 14px;
    background:rgba(255,255,255,.08);
    backdrop-filter:blur(10px);
  }
  .accounting-kpi-glass strong{
    display:block;
    font-size:22px;
    line-height:1.1;
    margin-top:6px;
  }
  .accounting-side-panel{
    border-radius:20px;
    padding:18px;
    background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(241,245,249,.94));
    border:1px solid rgba(148,163,184,.22);
    box-shadow:0 14px 30px rgba(15,23,42,.08);
  }
  .accounting-chip-row{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:6px;
    margin-top:10px;
  }
  .accounting-chip{
    display:flex;
    align-items:center;
    justify-content:center;
    min-width:0;
    padding:4px 8px;
    min-height:26px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.22);
    background:rgba(255,255,255,.92);
    color:#172033;
    font-weight:800;
    font-size:11px;
    letter-spacing:.01em;
    line-height:1.1;
    text-align:center;
    box-shadow:0 6px 14px rgba(15,23,42,.10);
  }
  .accounting-launch-grid{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:12px;
  }
  .accounting-launch-card{
    display:flex;
    flex-direction:column;
    gap:10px;
    min-height:190px;
    padding:18px;
    border-radius:20px;
    color:#fff;
    text-decoration:none;
    box-shadow:0 14px 28px rgba(15,23,42,.12);
    transition:transform .16s ease, box-shadow .16s ease;
  }
  .accounting-launch-card:hover{
    transform:translateY(-3px);
    box-shadow:0 18px 34px rgba(15,23,42,.16);
  }
  .accounting-launch-icon{
    width:44px;
    height:44px;
    border-radius:14px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    background:rgba(255,255,255,.12);
    border:1px solid rgba(255,255,255,.18);
  }
  .accounting-launch-icon svg{
    width:20px;
    height:20px;
    stroke:currentColor;
    fill:none;
    stroke-width:1.9;
    stroke-linecap:round;
    stroke-linejoin:round;
  }
  .accounting-launch-eyebrow{
    font-size:11px;
    font-weight:800;
    letter-spacing:.12em;
    text-transform:uppercase;
    opacity:.78;
  }
  .accounting-launch-title{
    font-size:21px;
    line-height:1.05;
    font-weight:800;
  }
  .accounting-launch-copy{
    color:rgba(255,255,255,.84);
    line-height:1.5;
  }
  .accounting-launch-meta{
    margin-top:auto;
    font-size:12px;
    color:rgba(255,255,255,.8);
  }
  .accounting-launch-cta{
    font-weight:800;
    letter-spacing:.01em;
  }
  .accounting-focus-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:12px;
  }
  .accounting-focus-card{
    display:block;
    border-radius:18px;
    padding:16px;
    text-decoration:none;
    border:1px solid rgba(148,163,184,.22);
    box-shadow:0 10px 22px rgba(15,23,42,.06);
    background:#fff;
  }
  .accounting-focus-blue{ background:linear-gradient(135deg,#eff6ff,#dbeafe); }
  .accounting-focus-amber{ background:linear-gradient(135deg,#fffbeb,#fef3c7); }
  .accounting-focus-red{ background:linear-gradient(135deg,#fff1f2,#ffe4e6); }
  .accounting-focus-green{ background:linear-gradient(135deg,#ecfdf5,#d1fae5); }
  .accounting-focus-title{
    font-size:16px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-focus-copy{
    margin-top:6px;
    color:#334155;
    line-height:1.5;
  }
  .accounting-focus-link{
    margin-top:12px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-mini-stack{
    display:grid;
    gap:8px;
  }
  .accounting-mini-row{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    padding:12px 14px;
    border-radius:14px;
    border:1px solid rgba(148,163,184,.16);
    background:rgba(255,255,255,.82);
    text-decoration:none;
    color:inherit;
  }
  .accounting-deadline-row{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    padding:12px 14px;
    border-radius:14px;
    text-decoration:none;
    color:inherit;
    border:1px solid rgba(148,163,184,.16);
  }
  .accounting-deadline-blue{ background:linear-gradient(135deg,#eff6ff,#f8fafc); }
  .accounting-deadline-amber{ background:linear-gradient(135deg,#fffbeb,#fef3c7); }
  .accounting-deadline-red{ background:linear-gradient(135deg,#fff1f2,#ffe4e6); }
  .accounting-onboarding{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:12px;
  }
  .accounting-onboarding-step{
    display:flex;
    gap:12px;
    align-items:flex-start;
    padding:14px;
    border-radius:18px;
    border:1px solid rgba(148,163,184,.18);
    background:linear-gradient(180deg,#ffffff,#f8fafc);
    text-decoration:none;
    color:inherit;
    box-shadow:0 10px 22px rgba(15,23,42,.05);
  }
  .accounting-onboarding-index{
    min-width:36px;
    height:36px;
    border-radius:12px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    background:linear-gradient(135deg,#0f172a,#2563eb);
    color:#fff;
    font-weight:800;
    letter-spacing:.04em;
  }
  .accounting-onboarding-title{
    font-size:16px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-onboarding-copy{
    margin-top:6px;
    line-height:1.5;
    color:#475569;
  }
  .accounting-onboarding-link{
    margin-top:10px;
    font-weight:800;
    color:#0f172a;
  }
  .accounting-section-head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    flex-wrap:wrap;
    margin-bottom:14px;
  }
  @media (max-width: 1440px), (max-height: 900px){
    .accounting-premium-hero{
      padding:20px;
    }
    .accounting-premium-grid{
      gap:12px;
    }
    .accounting-side-panel{
      padding:16px;
    }
    .accounting-launch-card{
      min-height:176px;
      padding:16px;
    }
    .accounting-kpi-glass strong{
      font-size:20px;
    }
  }
  @media (max-width: 1100px){
    .accounting-premium-grid,
    .accounting-launch-grid,
    .accounting-focus-grid,
    .accounting-onboarding{
      grid-template-columns:1fr;
    }
    .accounting-hero-kpis{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
  }
  @media (max-width: 720px){
    .accounting-premium-hero{
      padding:18px;
    }
    .accounting-hero-kpis{
      grid-template-columns:1fr;
    }
    .accounting-chip-row{
      grid-template-columns:1fr;
    }
  }
</style>
</head>
${crmShellStart("accounting-home", "Contabilitate", pageIntro, userEmail, req.session.user.module_permissions, req.session.user.subscription?.status || "", req.session.user.company_name || "")}

  <div class="accounting-premium-shell">
    <section class="accounting-premium-grid">
      <div class="accounting-premium-hero">
        <div class="accounting-hero-top">
          <div>
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${isAccountingUser ? "Premium Accounting Desk" : "Accounting Mission Control"}</div>
            <h2 style="margin:14px 0 8px 0;font-size:34px;line-height:1.02;max-width:740px">${isAccountingUser ? "Bun venit în cabinetul tău contabil." : "Tot ce contează pentru contabilitate, într-un singur loc."}</h2>
            <div style="max-width:740px;color:rgba(255,255,255,.82);font-size:14px;line-height:1.6">
              ${isAccountingUser
                ? canAccessSpvWorkspace
                  ? "Intră direct în declarații ANAF, e-Factura SPV, cheltuieli, bonuri de consum și reconciliere, fără să cauți prin meniuri. Pagina este gândită ca punctul tău zilnic de lucru."
                  : "Intră direct în declarații ANAF, cheltuieli, bonuri de consum și reconciliere, fără să cauți prin meniuri. Pagina este gândită ca punctul tău zilnic de lucru."
                : canAccessSpvWorkspace
                  ? "Vezi rapid ce facturi sunt de încasat, ce mai așteaptă confirmare din SPV, ce declarații sunt aproape de scadență și în ce zonă trebuie să intri mai întâi."
                  : "Vezi rapid ce facturi sunt de încasat, ce declarații sunt aproape de scadență și în ce zonă trebuie să intri mai întâi."}
            </div>
          </div>
          <div style="min-width:210px;max-width:236px;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px;background:rgba(255,255,255,.08);backdrop-filter:blur(8px)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.72);font-weight:800">${canAccessSpvWorkspace ? "Stare ANAF" : "Control contabil"}</div>
            <div style="margin-top:4px;font-size:20px;line-height:1.05;font-weight:800">${canAccessSpvWorkspace ? (Number(spvStats.active_connections || 0) > 0 ? "Conectat" : "Necesită conectare") : (Number(declarationStats.urgent_count || 0) > 0 ? "Ai scadențe aproape" : "Fără alerte urgente")}</div>
            <div style="margin-top:6px;color:rgba(255,255,255,.76);line-height:1.4;font-size:12px">${canAccessSpvWorkspace ? latestConnectionStatus : `${escapeHtml(String(declarationStats.urgent_count || 0))} declarații urgente · ${escapeHtml(String(invoiceStats.overdue_count || 0))} facturi restante`}</div>
            <div class="accounting-chip-row">
              ${canAccessSpvWorkspace
                ? `<span class="accounting-chip">${Number(inboxStats.inbox_unprocessed_count || 0)} SPV nou</span>
              <span class="accounting-chip">${Number(messageStats.outbox_error_count || 0)} erori</span>`
                : `<span class="accounting-chip">${Number(declarationStats.pregatita_count || 0)} declarații pregătite</span>
              <span class="accounting-chip">${Number(expenseStats.unpaid_count || 0)} cheltuieli neplătite</span>`}
            </div>
          </div>
        </div>

        <div class="accounting-hero-kpis">
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Facturi emise luna asta</div>
            <strong>${escapeHtml(String(invoiceMonth.issued_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(fmtMoney(invoiceMonth.issued_amount || 0))} RON</div>
          </div>
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Restanțe la încasare</div>
            <strong>${escapeHtml(String(invoiceStats.overdue_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(fmtMoney(invoiceStats.overdue_amount || 0))} RON</div>
          </div>
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Declarații pregătite</div>
            <strong>${escapeHtml(String(declarationStats.pregatita_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(String(declarationStats.urgent_count || 0))} urgente în 7 zile</div>
          </div>
          <div class="accounting-kpi-glass">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:800">Cheltuieli neplătite</div>
            <strong>${escapeHtml(String(expenseStats.unpaid_count || 0))}</strong>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">${escapeHtml(fmtMoney(expenseStats.unpaid_amount || 0))} RON</div>
          </div>
        </div>
      </div>

      <section class="accounting-side-panel">
        <div class="accounting-section-head" style="margin-bottom:14px">
          <div>
            <div class="crm-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em">Control rapid</div>
            <h3 style="margin:6px 0 0 0;font-size:22px">Ce cere atenție acum</h3>
          </div>
        </div>
        <div class="accounting-focus-grid" style="grid-template-columns:1fr;max-height:none">
          ${focusItemsHtml}
        </div>
      </section>
    </section>

    <div class="crm-grid-2" style="align-items:start">
      <section class="crm-card">
        <div class="accounting-section-head">
          <div>
            <h3 style="margin:0;font-size:22px">Radar declarații ANAF</h3>
            <div class="crm-muted" style="margin-top:6px">Ultimele declarații și stadiul lor operațional.</div>
          </div>
        </div>
        <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px">
          <div class="crm-kpi"><div class="crm-kpi-label">Pregătite</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.pregatita_count || 0))}</div></div>
          <div class="crm-kpi"><div class="crm-kpi-label">Trimise</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.trimisa_count || 0))}</div></div>
          <div class="crm-kpi"><div class="crm-kpi-label">Validate</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.validata_count || 0))}</div></div>
          <div class="crm-kpi"><div class="crm-kpi-label">Respinse</div><div class="crm-kpi-value">${escapeHtml(String(declarationStats.respinsa_count || 0))}</div></div>
        </div>
        <div class="accounting-mini-stack">
          ${declarationPreviewHtml || `<div class="crm-muted">Nu există declarații înregistrate.</div>`}
        </div>
        <div style="margin-top:18px">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#64748b;margin-bottom:10px">Scadențe următoare</div>
          <div class="accounting-mini-stack">
            ${deadlineRowsHtml || `<div class="crm-muted">Nu există scadențe ANAF înregistrate.</div>`}
          </div>
        </div>
      </section>

      <section class="crm-card">
        <div class="accounting-section-head">
          <div>
            <h3 style="margin:0;font-size:22px">Cheltuieli și consumuri</h3>
            <div class="crm-muted" style="margin-top:6px">Documentele de intrare și consumul intern la zi.</div>
          </div>
        </div>
        <div class="crm-grid-2" style="margin-bottom:16px">
          <div class="crm-kpi">
            <div class="crm-kpi-label">Cheltuieli totale</div>
            <div class="crm-kpi-value">${escapeHtml(String(expenseStats.total_count || 0))}</div>
            <div class="crm-muted" style="margin-top:6px">${escapeHtml(fmtMoney(expenseStats.total_amount || 0))} RON</div>
          </div>
          <div class="crm-kpi">
            <div class="crm-kpi-label">Bonuri de consum</div>
            <div class="crm-kpi-value">${escapeHtml(String(consumptionStats.total_count || 0))}</div>
            <div class="crm-muted" style="margin-top:6px">Ultimul: ${escapeHtml(consumptionStats.last_issue_date || "—")}</div>
          </div>
        </div>
        <div class="accounting-mini-stack">
          ${expensePreviewHtml || `<div class="crm-muted">Nu există cheltuieli înregistrate.</div>`}
        </div>
      </section>
    </div>

  <div class="crm-grid-3" style="align-items:start">
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Ultimele facturi</h3>
          <div class="crm-muted" style="margin-top:6px">Status comercial și status e-Factura în aceeași vedere.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Factură</th>
              <th>Status</th>
              <th>e-Factura</th>
              <th class="crm-right">Total</th>
              <th>Emitere</th>
              <th>Scadență</th>
            </tr>
          </thead>
          <tbody>${invoiceRowsHtml || `<tr><td colspan="6" class="crm-muted">Nu există facturi înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    ${canAccessSpvWorkspace ? `
    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Inbox SPV</h3>
          <div class="crm-muted" style="margin-top:6px">Facturi primite și elemente care mai trebuie procesate.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Status</th>
              <th>Primit la</th>
            </tr>
          </thead>
          <tbody>${inboxRowsHtml || `<tr><td colspan="3" class="crm-muted">Inboxul SPV este gol.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(15,23,42,.04);border:1px solid var(--line)">
        <div class="crm-muted" style="font-size:12px">Ultima factură primită</div>
        <div style="margin-top:6px;font-weight:800">${escapeHtml(inboxStats.last_received_at || "—")}</div>
      </div>
    </section>
    ` : ``}

    <section class="crm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:20px">Plăți și reconciliere</h3>
          <div class="crm-muted" style="margin-top:6px">Plăți înregistrate prin billing, utile pentru urmărirea încasărilor.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Plată</th>
              <th>Status</th>
              <th class="crm-right">Sumă</th>
              <th>Moment</th>
            </tr>
          </thead>
          <tbody>${paymentRowsHtml || `<tr><td colspan="4" class="crm-muted">Nu există plăți înregistrate.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;display:grid;gap:10px">
        <div style="padding:14px 16px;border-radius:16px;background:rgba(15,23,42,.04);border:1px solid var(--line)">
          <div class="crm-muted" style="font-size:12px">Total plăți urmărite</div>
          <div style="margin-top:6px;font-weight:800">${escapeHtml(String(paymentStats.total_count || 0))}</div>
        </div>
        <div style="padding:14px 16px;border-radius:16px;background:rgba(15,23,42,.04);border:1px solid var(--line)">
          <div class="crm-muted" style="font-size:12px">${canAccessSpvWorkspace ? "Conexiuni ANAF salvate" : "Declarații urgente"}</div>
          <div style="margin-top:6px;font-weight:800">${escapeHtml(String(canAccessSpvWorkspace ? ((spvStats.prod_connections || 0) + (spvStats.test_connections || 0)) : (declarationStats.urgent_count || 0)))}</div>
        </div>
      </div>
    </section>
  </div>

  <section class="crm-card" id="reconciliere" style="margin-top:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h3 style="margin:0;font-size:20px">Reconciliere plăți / încasări</h3>
        <div class="crm-muted" style="margin-top:6px">Verificare rapidă între plățile urmărite în sistem și facturile interne generate pentru ele.</div>
      </div>
    </div>

    <div class="crm-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px">
      <div class="crm-kpi">
        <div class="crm-kpi-label">Reconciliate</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.matched_count || 0))}</div>
      </div>
      <div class="crm-kpi">
        <div class="crm-kpi-label">Plată fără încasare</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.payment_not_marked_count || 0))}</div>
      </div>
      <div class="crm-kpi">
        <div class="crm-kpi-label">Plată fără factură</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.payment_without_invoice_count || 0))}</div>
      </div>
      <div class="crm-kpi">
        <div class="crm-kpi-label">Factură legată, plată în curs</div>
        <div class="crm-kpi-value">${escapeHtml(String(reconciliationStats.pending_link_count || 0))}</div>
      </div>
    </div>

    <section class="crm-card" style="background:rgba(15,23,42,.02)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <div>
          <h3 style="margin:0;font-size:18px">Plăți urmărite</h3>
          <div class="crm-muted" style="margin-top:6px">Ultimele plăți și starea lor de reconciliere.</div>
        </div>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Plată</th>
              <th>Status plată</th>
              <th>Reconciliere</th>
              <th>Factură</th>
              <th class="crm-right">Sumă</th>
              <th>Moment</th>
            </tr>
          </thead>
          <tbody>${reconciliationRowsHtml || `<tr><td colspan="6" class="crm-muted">Nu există plăți pentru reconciliere.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  </section>
</div>

${crmShellEnd()}
`);
  });
}
