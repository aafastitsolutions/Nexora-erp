import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  renderNexoraAnalyticsPage,
  renderNexoraReportDashboardsPage,
  renderNexoraReportExportsPage,
  renderNexoraReportKpisPage,
  renderNexoraReportsHubPage,
  renderNexoraSavedReportsPage
} from "../src/ui/nexora-reports-pages.js";

function companyIdFrom(req) {
  return Number(req.session.user.company_id || 0);
}

function currentUserEmail(req) {
  return String(req.session.user.email || "").trim().toLowerCase();
}

function safeText(value) {
  return String(value || "").trim();
}

function parseNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function parseDate(value) {
  const normalized = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function nextNumber(db, companyId, tableName, columnName, prefix) {
  const allowed = {
    report_dashboards: "dashboard_number",
    report_kpis: "kpi_code",
    report_saved_reports: "report_number",
    report_exports: "export_number"
  };
  if (allowed[tableName] !== columnName) throw new Error("Unsupported reports sequence");
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const latest = db.prepare(`
    SELECT ${columnName} AS number_value
    FROM ${tableName}
    WHERE company_id=? AND ${columnName} LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, `${stem}%`);
  const last = Number(String(latest?.number_value || "").split("-").pop() || 0);
  return `${stem}${String(last + 1).padStart(4, "0")}`;
}

function metricValue(db, companyId, metricKey = "", fallback = 0) {
  const key = safeText(metricKey);
  if (key === "invoice_revenue") {
    return Number(db.prepare("SELECT COALESCE(SUM(total),0) AS value FROM facturi WHERE company_id=?").get(companyId)?.value || 0);
  }
  if (key === "sales_orders") {
    return Number(db.prepare("SELECT COUNT(*) AS value FROM sales_orders WHERE company_id=?").get(companyId)?.value || 0);
  }
  if (key === "active_clients") {
    return Number(db.prepare("SELECT COUNT(*) AS value FROM clients WHERE company_id=? AND COALESCE(inactive,0)=0").get(companyId)?.value || 0);
  }
  if (key === "stock_alerts") {
    return Number(db.prepare(`
      SELECT COUNT(*) AS value
      FROM inventory_stock_items
      WHERE company_id=? AND quantity <= minimum_quantity AND UPPER(COALESCE(status,''))='ACTIV'
    `).get(companyId)?.value || 0);
  }
  if (key === "open_tasks") {
    return Number(db.prepare(`
      SELECT COUNT(*) AS value
      FROM project_tasks
      WHERE company_id=? AND UPPER(COALESCE(status,'')) NOT IN ('FINALIZAT','DONE','ANULAT')
    `).get(companyId)?.value || 0);
  }
  return Number(fallback || 0);
}

function trendFor(currentValue, targetValue) {
  const current = Number(currentValue || 0);
  const target = Number(targetValue || 0);
  if (!target) return "STABIL";
  if (current >= target) return "PESTE_TINTA";
  return "SUB_TINTA";
}

function loadKpis(db, companyId) {
  const rows = db.prepare(`
    SELECT *
    FROM report_kpis
    WHERE company_id=?
    ORDER BY status='ACTIV' DESC, category COLLATE NOCASE ASC, name COLLATE NOCASE ASC
    LIMIT 300
  `).all(companyId);
  return rows.map((row) => {
    const current = row.metric_key === "manual"
      ? Number(row.current_value || 0)
      : metricValue(db, companyId, row.metric_key, row.current_value);
    return {
      ...row,
      current_value: current,
      trend_direction: trendFor(current, row.target_value)
    };
  });
}

function reportStats(db, companyId) {
  return db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(total),0) FROM facturi WHERE company_id=?) AS invoiceRevenue,
      (SELECT COUNT(*) FROM sales_orders WHERE company_id=?) AS salesOrders,
      (SELECT COUNT(*) FROM inventory_stock_items WHERE company_id=? AND quantity <= minimum_quantity AND UPPER(COALESCE(status,''))='ACTIV') AS stockAlerts,
      (SELECT COUNT(*) FROM report_kpis WHERE company_id=? AND UPPER(COALESCE(status,''))='ACTIV') AS activeKpis
  `).get(companyId, companyId, companyId, companyId) || {};
}

function loadDashboards(db, companyId) {
  return db.prepare(`
    SELECT *
    FROM report_dashboards
    WHERE company_id=?
    ORDER BY status='ACTIV' DESC, id DESC
    LIMIT 300
  `).all(companyId);
}

function loadSavedReports(db, companyId) {
  return db.prepare(`
    SELECT *
    FROM report_saved_reports
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 300
  `).all(companyId);
}

function getSavedReport(db, companyId, reportId) {
  if (!Number(reportId)) return null;
  return db.prepare(`
    SELECT *
    FROM report_saved_reports
    WHERE id=? AND company_id=?
  `).get(Number(reportId), companyId) || null;
}

function loadExports(db, companyId) {
  return db.prepare(`
    SELECT e.*, r.name AS report_name, r.report_number
    FROM report_exports e
    LEFT JOIN report_saved_reports r ON r.id=e.report_id AND r.company_id=e.company_id
    WHERE e.company_id=?
    ORDER BY e.id DESC
    LIMIT 300
  `).all(companyId);
}

function dateFilter(columnName, report = {}) {
  const clauses = [];
  const params = [];
  const start = parseDate(report.period_start);
  const end = parseDate(report.period_end);
  if (start) {
    clauses.push(`${columnName} >= ?`);
    params.push(start);
  }
  if (end) {
    clauses.push(`${columnName} <= ?`);
    params.push(end);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params };
}

function reportData(db, companyId, report = {}, limit = 500) {
  const type = safeText(report.report_type || "VANZARI").toUpperCase();
  if (type === "FACTURI") {
    const filter = dateFilter("f.data_emitere", report);
    return {
      columns: [
        { key: "factura_nr", label: "Factură" },
        { key: "client_name", label: "Client" },
        { key: "status", label: "Status" },
        { key: "data_emitere", label: "Data" },
        { key: "total", label: "Total", right: true }
      ],
      rows: db.prepare(`
        SELECT f.factura_nr, COALESCE(c.name,'-') AS client_name, f.status, f.data_emitere, f.total
        FROM facturi f
        LEFT JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
        WHERE f.company_id=? ${filter.sql}
        ORDER BY f.data_emitere DESC, f.id DESC
        LIMIT ?
      `).all(companyId, ...filter.params, limit)
    };
  }
  if (type === "STOCURI") {
    return {
      columns: [
        { key: "item_code", label: "Cod" },
        { key: "item_name", label: "Articol" },
        { key: "warehouse_name", label: "Depozit" },
        { key: "quantity", label: "Cant.", right: true },
        { key: "minimum_quantity", label: "Minim", right: true },
        { key: "status", label: "Status" }
      ],
      rows: db.prepare(`
        SELECT s.item_code, s.item_name, COALESCE(w.name,'-') AS warehouse_name, s.quantity, s.minimum_quantity, s.status
        FROM inventory_stock_items s
        LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id AND w.company_id=s.company_id
        WHERE s.company_id=?
        ORDER BY s.item_name COLLATE NOCASE ASC
        LIMIT ?
      `).all(companyId, limit)
    };
  }
  if (type === "CLIENTI") {
    return {
      columns: [
        { key: "name", label: "Client" },
        { key: "cui", label: "CUI" },
        { key: "invoice_count", label: "Facturi", right: true },
        { key: "invoice_total", label: "Total facturat", right: true },
        { key: "created_at", label: "Creat" }
      ],
      rows: db.prepare(`
        SELECT c.name, c.cui, c.created_at,
          COUNT(f.id) AS invoice_count,
          COALESCE(SUM(f.total),0) AS invoice_total
        FROM clients c
        LEFT JOIN facturi f ON f.client_id=c.id AND f.company_id=c.company_id
        WHERE c.company_id=?
        GROUP BY c.id
        ORDER BY invoice_total DESC, c.name COLLATE NOCASE ASC
        LIMIT ?
      `).all(companyId, limit)
    };
  }
  if (type === "PROIECTE") {
    return {
      columns: [
        { key: "project_code", label: "Cod" },
        { key: "title", label: "Proiect" },
        { key: "client_name", label: "Client" },
        { key: "status", label: "Status" },
        { key: "progress", label: "Progres", right: true },
        { key: "due_date", label: "Termen" }
      ],
      rows: db.prepare(`
        SELECT p.project_code, p.title, COALESCE(c.name, p.client_name, '-') AS client_name, p.status, p.progress, p.due_date
        FROM projects p
        LEFT JOIN clients c ON c.id=p.client_id AND c.company_id=p.company_id
        WHERE p.company_id=?
        ORDER BY p.id DESC
        LIMIT ?
      `).all(companyId, limit)
    };
  }
  if (type === "ACHIZITII") {
    const filter = dateFilter("o.order_date", report);
    return {
      columns: [
        { key: "order_number", label: "Comandă" },
        { key: "supplier_name", label: "Furnizor" },
        { key: "status", label: "Status" },
        { key: "order_date", label: "Data" },
        { key: "total", label: "Total", right: true }
      ],
      rows: db.prepare(`
        SELECT o.order_number, COALESCE(s.name,'-') AS supplier_name, o.status, o.order_date, o.total
        FROM procurement_orders o
        LEFT JOIN procurement_suppliers s ON s.id=o.supplier_id AND s.company_id=o.company_id
        WHERE o.company_id=? ${filter.sql}
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT ?
      `).all(companyId, ...filter.params, limit)
    };
  }
  if (type === "SUPPLY_CHAIN") {
    return {
      columns: [
        { key: "transport_number", label: "Transport" },
        { key: "carrier_name", label: "Transportator" },
        { key: "route", label: "Rută" },
        { key: "status", label: "Status" },
        { key: "delivery_date", label: "Livrare" },
        { key: "cost", label: "Cost", right: true }
      ],
      rows: db.prepare(`
        SELECT transport_number, carrier_name, (COALESCE(origin,'') || ' - ' || COALESCE(destination,'')) AS route, status, delivery_date, cost
        FROM scm_transport_orders
        WHERE company_id=?
        ORDER BY id DESC
        LIMIT ?
      `).all(companyId, limit)
    };
  }
  const filter = dateFilter("o.order_date", report);
  return {
    columns: [
      { key: "order_number", label: "Comandă" },
      { key: "client_name", label: "Client" },
      { key: "status", label: "Status" },
      { key: "order_date", label: "Data" },
      { key: "total", label: "Total", right: true }
    ],
    rows: db.prepare(`
      SELECT o.order_number, COALESCE(c.name,'-') AS client_name, o.status, o.order_date, o.total
      FROM sales_orders o
      LEFT JOIN clients c ON c.id=o.client_id AND c.company_id=o.company_id
      WHERE o.company_id=? ${filter.sql}
      ORDER BY o.order_date DESC, o.id DESC
      LIMIT ?
    `).all(companyId, ...filter.params, limit)
  };
}

function csvEscape(value = "") {
  const raw = String(value ?? "");
  if (/[",\n;]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function reportToCsv(data = {}) {
  const columns = data.columns || [];
  const rows = data.rows || [];
  return [
    columns.map((column) => csvEscape(column.label || column.key)).join(";"),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(";"))
  ].join("\n");
}

async function reportToPdfBuffer(report = {}, data = {}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([842, 595]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 36;
  let y = 550;
  page.drawText(report.name || "Raport Nexora", { x: margin, y, size: 16, font: bold, color: rgb(0.08, 0.12, 0.2) });
  y -= 24;
  page.drawText(`${report.report_number || ""} · ${report.report_type || ""}`, { x: margin, y, size: 9, font, color: rgb(0.35, 0.4, 0.48) });
  y -= 24;
  const columns = (data.columns || []).slice(0, 6);
  const widths = [120, 180, 90, 90, 90, 90];
  columns.forEach((column, index) => {
    page.drawText(String(column.label || column.key || "").slice(0, 22), { x: margin + widths.slice(0, index).reduce((a, b) => a + b, 0), y, size: 8, font: bold });
  });
  y -= 14;
  for (const row of (data.rows || []).slice(0, 28)) {
    if (y < 40) {
      page = pdfDoc.addPage([842, 595]);
      y = 550;
    }
    columns.forEach((column, index) => {
      page.drawText(String(row[column.key] ?? "").slice(0, 30), { x: margin + widths.slice(0, index).reduce((a, b) => a + b, 0), y, size: 8, font });
    });
    y -= 14;
  }
  return Buffer.from(await pdfDoc.save());
}

function ensureReportsDir({ fs, path, __dirname }) {
  const targetDir = path.join(__dirname, "public", "uploads", "reports");
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

function analyticsData(db, companyId) {
  return {
    monthlyRevenue: db.prepare(`
      SELECT substr(data_emitere,1,7) AS month, COALESCE(SUM(total),0) AS total
      FROM facturi
      WHERE company_id=?
      GROUP BY substr(data_emitere,1,7)
      ORDER BY month DESC
      LIMIT 12
    `).all(companyId),
    topClients: db.prepare(`
      SELECT COALESCE(c.name,'-') AS client_name, COUNT(f.id) AS invoice_count, COALESCE(SUM(f.total),0) AS total
      FROM facturi f
      LEFT JOIN clients c ON c.id=f.client_id AND c.company_id=f.company_id
      WHERE f.company_id=?
      GROUP BY f.client_id
      ORDER BY total DESC
      LIMIT 10
    `).all(companyId),
    stockAlerts: db.prepare(`
      SELECT s.item_name, s.quantity, s.minimum_quantity, COALESCE(w.name,'-') AS warehouse_name
      FROM inventory_stock_items s
      LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id AND w.company_id=s.company_id
      WHERE s.company_id=? AND s.quantity <= s.minimum_quantity AND UPPER(COALESCE(s.status,''))='ACTIV'
      ORDER BY s.quantity ASC
      LIMIT 20
    `).all(companyId),
    pipeline: db.prepare(`
      SELECT status, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
      FROM quotes
      WHERE company_id=?
      GROUP BY status
      ORDER BY total DESC
      LIMIT 20
    `).all(companyId)
  };
}

export function registerReportsRoutes(app, { db, requireAuth, fs, path, __dirname }) {
  app.get("/nexora/reports", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraReportsHubPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      stats: reportStats(db, companyId),
      reports: loadSavedReports(db, companyId).slice(0, 8),
      exports: loadExports(db, companyId).slice(0, 8),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.get("/nexora/reports/dashboards", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraReportDashboardsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadDashboards(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/reports/dashboards/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/reports/dashboards?err=required");
    const dashboardNumber = nextNumber(db, companyId, "report_dashboards", "dashboard_number", "DBI");
    db.prepare(`
      INSERT INTO report_dashboards (
        company_id, dashboard_number, name, scope, refresh_interval,
        layout_json, status, notes, created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      dashboardNumber,
      name,
      safeText(req.body?.scope) || "GENERAL",
      safeText(req.body?.refresh_interval) || "MANUAL",
      safeText(req.body?.layout_json) || "[]",
      safeText(req.body?.status) || "ACTIV",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/reports/dashboards?ok=created");
  });

  app.post("/nexora/reports/dashboards/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    if (!["ACTIV", "BLOCAT", "DRAFT"].includes(status)) return res.redirect("/nexora/reports/dashboards?err=invalid");
    db.prepare("UPDATE report_dashboards SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/reports/dashboards?ok=status");
  });

  app.get("/nexora/reports/kpi", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraReportKpisPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadKpis(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/reports/kpi/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/reports/kpi?err=required");
    const metricKey = safeText(req.body?.metric_key) || "manual";
    const current = metricKey === "manual"
      ? parseNumber(req.body?.current_value, 0)
      : metricValue(db, companyId, metricKey, 0);
    const target = parseNumber(req.body?.target_value, 0);
    const kpiCode = nextNumber(db, companyId, "report_kpis", "kpi_code", "KPI");
    db.prepare(`
      INSERT INTO report_kpis (
        company_id, kpi_code, name, category, metric_key, target_value,
        current_value, unit, trend_direction, status, notes, created_by_email,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      kpiCode,
      name,
      safeText(req.body?.category) || "GENERAL",
      metricKey,
      target,
      current,
      safeText(req.body?.unit),
      trendFor(current, target),
      safeText(req.body?.status) || "ACTIV",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/reports/kpi?ok=created");
  });

  app.post("/nexora/reports/kpi/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const status = safeText(req.body?.status).toUpperCase();
    if (!["ACTIV", "BLOCAT", "DRAFT"].includes(status)) return res.redirect("/nexora/reports/kpi?err=invalid");
    db.prepare("UPDATE report_kpis SET status=?, updated_at=datetime('now') WHERE id=? AND company_id=?").run(status, Number(req.params.id), companyId);
    return res.redirect("/nexora/reports/kpi?ok=status");
  });

  app.get("/nexora/reports/saved", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const rows = loadSavedReports(db, companyId);
    const selectedReport = getSavedReport(db, companyId, Number(req.query?.report_id || rows[0]?.id || 0));
    const preview = selectedReport ? reportData(db, companyId, selectedReport, 30) : { columns: [], rows: [] };
    if (selectedReport) {
      db.prepare("UPDATE report_saved_reports SET last_run_at=datetime('now') WHERE id=? AND company_id=?").run(selectedReport.id, companyId);
    }
    return res.type("html").send(renderNexoraSavedReportsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows,
      selectedReport,
      preview,
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/reports/saved/create", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    const name = safeText(req.body?.name);
    if (!name) return res.redirect("/nexora/reports/saved?err=required");
    const reportNumber = nextNumber(db, companyId, "report_saved_reports", "report_number", "RPT");
    db.prepare(`
      INSERT INTO report_saved_reports (
        company_id, report_number, name, report_type, source_module,
        period_start, period_end, filters_json, format, status, notes,
        created_by_email, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIV', ?, ?, datetime('now'))
    `).run(
      companyId,
      reportNumber,
      name,
      safeText(req.body?.report_type) || "VANZARI",
      safeText(req.body?.source_module) || "sales",
      parseDate(req.body?.period_start),
      parseDate(req.body?.period_end),
      safeText(req.body?.filters_json) || "{}",
      safeText(req.body?.format) || "TABLE",
      safeText(req.body?.notes),
      currentUserEmail(req)
    );
    return res.redirect("/nexora/reports/saved?ok=created");
  });

  app.get("/nexora/reports/exports", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraReportExportsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: loadExports(db, companyId),
      reports: loadSavedReports(db, companyId),
      ok: safeText(req.query?.ok),
      err: safeText(req.query?.err)
    }));
  });

  app.post("/nexora/reports/exports/create", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req);
    const report = getSavedReport(db, companyId, Number(req.body?.report_id || 0));
    if (!report) return res.redirect("/nexora/reports/exports?err=missing");
    const data = reportData(db, companyId, report, 1000);
    const exportNumber = nextNumber(db, companyId, "report_exports", "export_number", "EXP");
    const format = safeText(req.body?.file_format).toUpperCase() === "PDF" ? "PDF" : "CSV";
    const targetDir = ensureReportsDir({ fs, path, __dirname });
    const safeName = `${exportNumber}-${String(report.name || "raport").replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const fileName = `${safeName}.${format === "PDF" ? "pdf" : "csv"}`;
    const finalPath = path.join(targetDir, fileName);
    if (format === "PDF") {
      fs.writeFileSync(finalPath, await reportToPdfBuffer(report, data));
    } else {
      fs.writeFileSync(finalPath, reportToCsv(data), "utf8");
    }
    const publicPath = `uploads/reports/${fileName}`;
    db.prepare(`
      INSERT INTO report_exports (
        company_id, export_number, report_id, export_type, file_format, status,
        row_count, file_path, requested_by_email, updated_at
      )
      VALUES (?, ?, ?, 'RAPORT', ?, 'GENERAT', ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      exportNumber,
      report.id,
      format,
      data.rows.length,
      publicPath,
      currentUserEmail(req)
    );
    db.prepare("UPDATE report_saved_reports SET last_run_at=datetime('now') WHERE id=? AND company_id=?").run(report.id, companyId);
    return res.redirect("/nexora/reports/exports?ok=export");
  });

  app.get("/nexora/reports/analytics", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req);
    return res.type("html").send(renderNexoraAnalyticsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      ...analyticsData(db, companyId)
    }));
  });
}
