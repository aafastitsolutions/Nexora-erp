import {
  LEAD_PIPELINE_STAGES,
  campaignLaunchReportData,
  categoryOptions,
  createLeadBuilderJob,
  createLeadSearch,
  enrichCampaignWithGooglePlaces,
  enrichLeadWebsiteFromOfficialSite,
  ensureLeadBuilderSchema,
  ensurePilotPrahovaCampaign,
  getLeadDetail,
  leadDashboard,
  leadSources,
  leadsToCsv,
  importLeadCsvText,
  listCampaignApprovalRows,
  listLeadRows,
  loadLeadScoreConfig,
  prepareCampaignForApproval,
  regenerateLeadDrafts,
  runLeadBuilderJob,
  saveLeadScoreConfig,
  searchGooglePlacesForLead,
  seedLeadBuilderDefaults,
  syncLeadToCrm,
  updateLeadSource,
  updateGooglePlaceMatchStatus,
  updateLeadMessageApproval,
  updateLeadStatus
} from "../lib/lead-builder.js";
import {
  renderLeadBuilderApprovalPage,
  renderLeadBuilderDashboardPage,
  renderLeadBuilderDetailPage,
  renderLeadBuilderLeadsPage,
  renderLeadBuilderSearchNewPage,
  renderLeadBuilderSourcesPage
} from "../src/ui/nexora-lead-builder-pages.js";

const runningJobs = new Set();

function safeText(value = "") {
  return String(value ?? "").trim();
}

function redirect(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null && String(value).trim() !== "") search.set(key, String(value));
  }
  return `${path}${search.toString() ? `?${search}` : ""}`;
}

function companyIdFrom(req, db) {
  const sessionCompanyId = Number(req.session?.user?.company_id || 0);
  if (sessionCompanyId) return sessionCompanyId;
  const activeCompany = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  return Number(activeCompany?.id || 0);
}

function actorEmail(req) {
  return safeText(req.session?.user?.email || "lead-builder");
}

function ensureReady(db, companyId) {
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);
}

function normalizeSources(value) {
  if (Array.isArray(value)) return value;
  if (safeText(value)) return [safeText(value)];
  return [];
}

function leadFilters(query = {}) {
  return {
    q: safeText(query.q),
    category: safeText(query.category),
    county: safeText(query.county),
    city: safeText(query.city),
    status: safeText(query.status),
    source: safeText(query.source),
    min_score: safeText(query.min_score),
    has_email: safeText(query.has_email),
    has_phone: safeText(query.has_phone),
    has_website: safeText(query.has_website),
    google_found: safeText(query.google_found),
    google_confirmed: safeText(query.google_confirmed),
    google_needs_review: safeText(query.google_needs_review),
    google_category: safeText(query.google_category),
    google_business_status: safeText(query.google_business_status),
    verified: safeText(query.verified),
    contacted: safeText(query.contacted),
    duplicate: safeText(query.duplicate)
  };
}

function runJobBackground(db, job) {
  if (!job?.id || runningJobs.has(Number(job.id))) return;
  runningJobs.add(Number(job.id));
  setImmediate(async () => {
    try {
      await runLeadBuilderJob(db, Number(job.id));
    } catch (error) {
      console.error("[LeadBuilder] background job failed", error);
    } finally {
      runningJobs.delete(Number(job.id));
    }
  });
}

function selectedLeadIds(body = {}) {
  const value = body.lead_ids;
  const rows = Array.isArray(value) ? value : (value ? [value] : []);
  return rows.map((item) => Number(item || 0)).filter((id) => id > 0);
}

function leadBuilderEnabled() {
  const raw = safeText(process.env.LEAD_BUILDER_ENABLED).toLowerCase();
  if (!raw) return true;
  return !["0", "false", "no", "off"].includes(raw);
}

export function registerLeadBuilderRoutes(app, { db, requireAuth }) {
  app.use("/nexora/lead-builder", requireAuth, (req, res, next) => {
    if (!leadBuilderEnabled()) return res.status(404).send("Lead Builder disabled");
    return next();
  });

  app.get("/nexora/lead-builder", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    return res.type("html").send(renderLeadBuilderDashboardPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      data: leadDashboard(db, companyId),
      ok: safeText(req.query.ok),
      err: safeText(req.query.err)
    }));
  });

  app.post("/nexora/lead-builder/pilot/prahova", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    ensurePilotPrahovaCampaign(db, companyId, actorEmail(req));
    return res.redirect(redirect("/nexora/lead-builder", { ok: "pilot" }));
  });

  app.get("/nexora/lead-builder/approval", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const pilot = ensurePilotPrahovaCampaign(db, companyId, actorEmail(req));
    return res.redirect(`/nexora/lead-builder/campaigns/${pilot.campaign.id}/approval`);
  });

  app.get("/nexora/lead-builder/campaigns/:id/approval", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const campaignId = Number(req.params.id || 0);
    const campaign = db.prepare("SELECT * FROM lead_campaigns WHERE id=? AND company_id=?").get(campaignId, companyId);
    if (!campaign) return res.redirect(redirect("/nexora/lead-builder", { err: "missing" }));
    return res.type("html").send(renderLeadBuilderApprovalPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      campaign,
      rows: listCampaignApprovalRows(db, companyId, campaignId, 50),
      report: campaignLaunchReportData(db, companyId, campaignId),
      ok: safeText(req.query.ok),
      err: safeText(req.query.err)
    }));
  });

  app.post("/nexora/lead-builder/campaigns/:id/prepare-approval", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const campaignId = Number(req.params.id || 0);
    const result = prepareCampaignForApproval(db, companyId, campaignId, actorEmail(req), 50);
    return res.redirect(redirect(`/nexora/lead-builder/campaigns/${campaignId}/approval`, { [result.ok ? "ok" : "err"]: result.ok ? "approval_ready" : "save_failed" }));
  });

  app.post("/nexora/lead-builder/campaigns/:id/google-enrich", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const campaignId = Number(req.params.id || 0);
    try {
      const result = await enrichCampaignWithGooglePlaces(db, companyId, campaignId, actorEmail(req), { limit: 50 });
      return res.redirect(redirect(`/nexora/lead-builder/campaigns/${campaignId}/approval`, { [result.ok ? "ok" : "err"]: result.ok ? "google_enriched" : "google_failed" }));
    } catch (error) {
      console.error("[LeadBuilder] Google campaign enrichment failed", error?.message || error);
      return res.redirect(redirect(`/nexora/lead-builder/campaigns/${campaignId}/approval`, { err: "google_failed" }));
    }
  });

  app.post("/nexora/lead-builder/messages/:id/approval", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const result = updateLeadMessageApproval(db, companyId, Number(req.params.id || 0), req.body || {}, actorEmail(req));
    const campaignId = Number(req.body?.campaign_id || 0);
    const target = campaignId ? `/nexora/lead-builder/campaigns/${campaignId}/approval` : "/nexora/lead-builder/approval";
    return res.redirect(redirect(target, { [result.ok ? "ok" : "err"]: result.ok ? "updated" : "missing" }));
  });

  app.post("/nexora/lead-builder/campaigns/:id/run", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const campaignId = Number(req.params.id || 0);
    const search = db.prepare(`
      SELECT *
      FROM lead_searches
      WHERE company_id=? AND campaign_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, campaignId);
    if (!search) return res.redirect(redirect("/nexora/lead-builder", { err: "missing" }));
    const job = createLeadBuilderJob(db, companyId, search.id, "search_companies", actorEmail(req));
    if (!job) return res.redirect(redirect("/nexora/lead-builder", { err: "job_failed" }));
    runJobBackground(db, job);
    return res.redirect(redirect("/nexora/lead-builder", { ok: "running" }));
  });

  app.get("/nexora/lead-builder/searches/new", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    return res.type("html").send(renderLeadBuilderSearchNewPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      categories: categoryOptions(),
      sources: leadSources(db, companyId),
      ok: safeText(req.query.ok),
      err: safeText(req.query.err)
    }));
  });

  app.post("/nexora/lead-builder/searches", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    try {
      const searchId = createLeadSearch(db, companyId, actorEmail(req), {
        ...req.body,
        sources: normalizeSources(req.body?.sources)
      });
      if (safeText(req.body?.run_now) === "1") {
        const job = createLeadBuilderJob(db, companyId, searchId, "search_companies", actorEmail(req));
        if (job) runJobBackground(db, job);
        return res.redirect(redirect("/nexora/lead-builder", { ok: job ? "running" : "queued" }));
      }
      return res.redirect(redirect("/nexora/lead-builder", { ok: "saved" }));
    } catch (error) {
      console.error("[LeadBuilder] create search failed", error);
      return res.redirect(redirect("/nexora/lead-builder/searches/new", { err: "save_failed" }));
    }
  });

  app.post("/nexora/lead-builder/searches/:id/run", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const job = createLeadBuilderJob(db, companyId, Number(req.params.id || 0), "search_companies", actorEmail(req));
    if (!job) return res.redirect(redirect("/nexora/lead-builder", { err: "job_failed" }));
    runJobBackground(db, job);
    return res.redirect(redirect("/nexora/lead-builder", { ok: "running" }));
  });

  app.post("/nexora/lead-builder/jobs/:id/run", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const job = db.prepare("SELECT * FROM lead_jobs WHERE id=? AND company_id=?").get(Number(req.params.id || 0), companyId);
    if (!job) return res.redirect(redirect("/nexora/lead-builder", { err: "missing" }));
    runJobBackground(db, job);
    return res.redirect(redirect("/nexora/lead-builder", { ok: "running" }));
  });

  app.post("/nexora/lead-builder/jobs/:id/stop", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    db.prepare("UPDATE lead_jobs SET stop_requested=1, updated_at=datetime('now') WHERE id=? AND company_id=?")
      .run(Number(req.params.id || 0), companyId);
    return res.redirect(redirect("/nexora/lead-builder", { ok: "updated" }));
  });

  app.get("/nexora/lead-builder/leads", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const filters = leadFilters(req.query || {});
    return res.type("html").send(renderLeadBuilderLeadsPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      rows: listLeadRows(db, companyId, filters),
      filters,
      ok: safeText(req.query.ok),
      err: safeText(req.query.err)
    }));
  });

  app.get("/nexora/lead-builder/leads/export.csv", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const filters = leadFilters(req.query || {});
    const rows = listLeadRows(db, companyId, filters);
    db.prepare(`
      INSERT INTO lead_exports (company_id, export_type, filters_json, row_count, file_name, created_by_email)
      VALUES (?, 'csv', ?, ?, ?, ?)
    `).run(companyId, JSON.stringify(filters), rows.length, `lead-builder-${new Date().toISOString().slice(0, 10)}.csv`, actorEmail(req));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lead-builder-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(leadsToCsv(rows));
  });

  app.get("/nexora/lead-builder/leads/export.json", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const filters = leadFilters(req.query || {});
    const rows = listLeadRows(db, companyId, filters);
    db.prepare(`
      INSERT INTO lead_exports (company_id, export_type, filters_json, row_count, file_name, created_by_email)
      VALUES (?, 'json', ?, ?, ?, ?)
    `).run(companyId, JSON.stringify(filters), rows.length, `lead-builder-${new Date().toISOString().slice(0, 10)}.json`, actorEmail(req));
    return res.json({ exported_at: new Date().toISOString(), filters, rows });
  });

  app.post("/nexora/lead-builder/leads/bulk", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const ids = selectedLeadIds(req.body || {});
    if (!ids.length) return res.redirect(redirect("/nexora/lead-builder/leads", { err: "missing" }));
    const action = safeText(req.body?.bulk_action);
    try {
      for (const id of ids) {
        if (action === "crm") syncLeadToCrm(db, companyId, id, actorEmail(req), { createOpportunity: true });
        if (action === "drafts") regenerateLeadDrafts(db, companyId, id, actorEmail(req));
        if (action === "status_prioritar") updateLeadStatus(db, companyId, id, "prioritar", actorEmail(req), "Bulk Lead Builder");
        if (action === "do_not_contact") updateLeadStatus(db, companyId, id, "nu_mai_contacta", actorEmail(req), "Bulk Lead Builder");
      }
      return res.redirect(redirect("/nexora/lead-builder/leads", { ok: action === "crm" ? "crm" : "updated" }));
    } catch (error) {
      console.error("[LeadBuilder] bulk action failed", error);
      return res.redirect(redirect("/nexora/lead-builder/leads", { err: "save_failed" }));
    }
  });

  app.post("/nexora/lead-builder/import/csv", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    try {
      const result = await importLeadCsvText(db, companyId, req.body?.csv_text || "", {
        campaign_name: req.body?.campaign_name,
        category: req.body?.category,
        country: req.body?.country,
        county: req.body?.county,
        city: req.body?.city,
        enrich_websites: safeText(req.body?.enrich_websites) === "1",
        actor_email: actorEmail(req)
      });
      return res.redirect(redirect("/nexora/lead-builder/leads", { [result.ok ? "ok" : "err"]: result.ok ? "saved" : "save_failed" }));
    } catch (error) {
      console.error("[LeadBuilder] CSV import failed", error);
      return res.redirect(redirect("/nexora/lead-builder/leads", { err: "save_failed" }));
    }
  });

  app.get("/nexora/lead-builder/leads/:id", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const detail = getLeadDetail(db, companyId, Number(req.params.id || 0));
    if (!detail) return res.redirect(redirect("/nexora/lead-builder/leads", { err: "missing" }));
    return res.type("html").send(renderLeadBuilderDetailPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      detail,
      statuses: LEAD_PIPELINE_STAGES,
      ok: safeText(req.query.ok),
      err: safeText(req.query.err)
    }));
  });

  app.post("/nexora/lead-builder/leads/:id/google/search", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const leadId = Number(req.params.id || 0);
    try {
      const result = await searchGooglePlacesForLead(db, companyId, leadId, actorEmail(req));
      return res.redirect(redirect(`/nexora/lead-builder/leads/${leadId}`, { [result.ok ? "ok" : "err"]: result.ok ? "google" : "google_failed" }));
    } catch (error) {
      console.error("[LeadBuilder] Google lead search failed", error?.message || error);
      return res.redirect(redirect(`/nexora/lead-builder/leads/${leadId}`, { err: "google_failed" }));
    }
  });

  app.post("/nexora/lead-builder/leads/:id/google/confirm", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const leadId = Number(req.params.id || 0);
    const result = updateGooglePlaceMatchStatus(db, companyId, leadId, Number(req.body?.match_id || 0), "confirmed", actorEmail(req));
    return res.redirect(redirect(`/nexora/lead-builder/leads/${leadId}`, { [result.ok ? "ok" : "err"]: result.ok ? "google_confirmed" : "missing" }));
  });

  app.post("/nexora/lead-builder/leads/:id/google/reject", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const leadId = Number(req.params.id || 0);
    const result = updateGooglePlaceMatchStatus(db, companyId, leadId, Number(req.body?.match_id || 0), "rejected", actorEmail(req));
    return res.redirect(redirect(`/nexora/lead-builder/leads/${leadId}`, { [result.ok ? "ok" : "err"]: result.ok ? "google_rejected" : "missing" }));
  });

  app.post("/nexora/lead-builder/leads/:id/google/website-email", requireAuth, async (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const leadId = Number(req.params.id || 0);
    try {
      const result = await enrichLeadWebsiteFromOfficialSite(db, companyId, leadId, actorEmail(req));
      return res.redirect(redirect(`/nexora/lead-builder/leads/${leadId}`, { [result.ok ? "ok" : "err"]: result.ok ? "website_enriched" : "website_failed" }));
    } catch (error) {
      console.error("[LeadBuilder] Website enrichment from Google website failed", error?.message || error);
      return res.redirect(redirect(`/nexora/lead-builder/leads/${leadId}`, { err: "website_failed" }));
    }
  });

  app.post("/nexora/lead-builder/leads/:id/status", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const result = updateLeadStatus(db, companyId, Number(req.params.id || 0), req.body?.status, actorEmail(req), req.body?.note);
    return res.redirect(redirect(`/nexora/lead-builder/leads/${Number(req.params.id || 0)}`, { [result.ok ? "ok" : "err"]: result.ok ? "updated" : "missing" }));
  });

  app.post("/nexora/lead-builder/leads/:id/messages", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const result = regenerateLeadDrafts(db, companyId, Number(req.params.id || 0), actorEmail(req));
    return res.redirect(redirect(`/nexora/lead-builder/leads/${Number(req.params.id || 0)}`, { [result.ok ? "ok" : "err"]: result.ok ? "messages" : "missing" }));
  });

  app.post("/nexora/lead-builder/leads/:id/crm", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const result = syncLeadToCrm(db, companyId, Number(req.params.id || 0), actorEmail(req), { createOpportunity: true });
    return res.redirect(redirect(`/nexora/lead-builder/leads/${Number(req.params.id || 0)}`, { [result.ok ? "ok" : "err"]: result.ok ? "crm" : "crm_failed" }));
  });

  app.get("/nexora/lead-builder/sources", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    return res.type("html").send(renderLeadBuilderSourcesPage({
      companyName: req.session.user.company_name || "",
      user: req.session.user,
      sources: leadSources(db, companyId),
      scoreConfig: loadLeadScoreConfig(db, companyId),
      ok: safeText(req.query.ok),
      err: safeText(req.query.err)
    }));
  });

  app.post("/nexora/lead-builder/sources/scoring", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    saveLeadScoreConfig(db, companyId, req.body || {}, actorEmail(req));
    return res.redirect(redirect("/nexora/lead-builder/sources", { ok: "updated" }));
  });

  app.post("/nexora/lead-builder/sources/:id", requireAuth, (req, res) => {
    const companyId = companyIdFrom(req, db);
    ensureReady(db, companyId);
    const result = updateLeadSource(db, companyId, Number(req.params.id || 0), req.body || {});
    return res.redirect(redirect("/nexora/lead-builder/sources", { [result.ok ? "ok" : "err"]: result.ok ? "updated" : "missing" }));
  });
}
