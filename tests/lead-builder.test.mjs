import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  createLeadBuilderJob,
  createLeadSearch,
  ensureLeadBuilderSchema,
  ensurePilotPrahovaCampaign,
  prepareCampaignForApproval,
  getLeadDetail,
  importLeadCsvText,
  listCampaignApprovalRows,
  leadDashboard,
  leadSources,
  listLeadRows,
  regenerateLeadDrafts,
  seedLeadBuilderDefaults,
  syncLeadToCrm,
  updateLeadMessageApproval,
  updateLeadStatus
} from "../lib/lead-builder.js";

const db = new Database(":memory:");

db.exec(`
  CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE crm_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    lead_number TEXT NOT NULL,
    name TEXT NOT NULL,
    company_name TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    source TEXT,
    status TEXT,
    owner_email TEXT,
    estimated_value REAL,
    probability INTEGER,
    next_step TEXT,
    next_followup_date TEXT,
    notes TEXT,
    created_by_email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, lead_number)
  );

  CREATE TABLE crm_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    lead_id INTEGER,
    activity_type TEXT,
    subject TEXT,
    notes TEXT,
    due_date TEXT,
    priority TEXT,
    status TEXT,
    owner_email TEXT,
    created_by_email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE crm_opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    opportunity_number TEXT NOT NULL,
    lead_id INTEGER,
    title TEXT,
    stage TEXT,
    status TEXT,
    amount REAL,
    probability INTEGER,
    owner_email TEXT,
    source TEXT,
    notes TEXT,
    created_by_email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, opportunity_number)
  );
`);

const companyId = Number(db.prepare("INSERT INTO companies (name, slug) VALUES ('Lead Builder Test', 'lead-builder-test')").run().lastInsertRowid);

ensureLeadBuilderSchema(db);
seedLeadBuilderDefaults(db, companyId);

const sources = leadSources(db, companyId);
assert.ok(sources.some((source) => source.source_key === "openstreetmap"));
assert.ok(sources.some((source) => source.source_key === "public_website"));

const pilot = ensurePilotPrahovaCampaign(db, companyId, "tester@example.test");
assert.equal(pilot.campaign.name, "Dealeri Auto Prahova – Lansare E-MARQET");
assert.equal(pilot.search.category, "auto_dealers");
assert.equal(pilot.search.max_results, 50);

const searchId = createLeadSearch(db, companyId, "tester@example.test", {
  campaign_name: "Service auto Prahova",
  activity_domain: "Auto",
  category: "auto_dealers",
  country: "Romania",
  county: "Prahova",
  city: "Ploiesti",
  max_results: 25,
  sources: ["openstreetmap", "public_website"],
  collect_email: "1",
  collect_phone: "1",
  auto_sync_crm: "1"
});
assert.ok(searchId > 0);

const job = createLeadBuilderJob(db, companyId, searchId, "search_companies", "tester@example.test");
assert.equal(job.status, "queued");

const leadCompanyId = Number(db.prepare(`
  INSERT INTO lead_companies (
    company_id, commercial_name, category, country, county, city,
    primary_email, primary_phone, website, main_source, source_url,
    verification_status, confidence_score, dedupe_hash
  ) VALUES (?, 'Auto Test Dealer', 'auto_dealers', 'Romania', 'Prahova', 'Ploiesti',
    'vanzari@autotest.example', '+40720000000', 'https://autotest.example',
    'manual_import', 'https://example.test/source', 'verificat_partial', 82, 'test-hash')
`).run(companyId).lastInsertRowid);

const leadId = Number(db.prepare(`
  INSERT INTO leads (
    company_id, campaign_id, search_id, lead_company_id, title, stage, status,
    priority, score, score_category, contact_ready, created_by_email
  ) VALUES (?, ?, ?, ?, 'Auto Test Dealer', 'prioritar', 'nou',
    'mare', 82, 'prioritate_foarte_mare', 1, 'tester@example.test')
`).run(companyId, pilot.campaign.id, searchId, leadCompanyId).lastInsertRowid);

const detail = getLeadDetail(db, companyId, leadId);
assert.equal(detail.lead.lead_id, leadId);
assert.equal(detail.lead.commercial_name, "Auto Test Dealer");

const draftResult = regenerateLeadDrafts(db, companyId, leadId, "tester@example.test");
assert.equal(draftResult.ok, true);
assert.ok(db.prepare("SELECT COUNT(*) AS total FROM lead_messages WHERE company_id=? AND lead_id=?").get(companyId, leadId).total >= 7);

const approvalPrep = prepareCampaignForApproval(db, companyId, pilot.campaign.id, "tester@example.test", 50);
assert.equal(approvalPrep.ok, true);
assert.equal(approvalPrep.selected, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS total FROM lead_onboarding_tasks WHERE company_id=? AND lead_id=?").get(companyId, leadId).total, 13);
const approvalRows = listCampaignApprovalRows(db, companyId, pilot.campaign.id, 50);
assert.equal(approvalRows.length, 1);
assert.ok(approvalRows[0].selection_reason.includes("email"));
const approvalMessage = db.prepare("SELECT id FROM lead_messages WHERE company_id=? AND lead_id=? AND message_type='email_initial'").get(companyId, leadId);
const approvalResult = updateLeadMessageApproval(db, companyId, approvalMessage.id, { action: "approve", channel: "email", subject: "Test", body: "Mesaj test" }, "tester@example.test");
assert.equal(approvalResult.ok, true);
assert.equal(db.prepare("SELECT status FROM lead_messages WHERE id=?").get(approvalMessage.id).status, "approved");

const crmResult = syncLeadToCrm(db, companyId, leadId, "tester@example.test", { createOpportunity: true });
assert.equal(crmResult.ok, true);
assert.equal(db.prepare("SELECT COUNT(*) AS total FROM crm_leads WHERE company_id=?").get(companyId).total, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS total FROM crm_opportunities WHERE company_id=?").get(companyId).total, 1);

const statusResult = updateLeadStatus(db, companyId, leadId, "pregatit_contact", "tester@example.test", "test");
assert.equal(statusResult.ok, true);
assert.equal(db.prepare("SELECT status FROM leads WHERE id=?").get(leadId).status, "pregatit_contact");

const rows = listLeadRows(db, companyId, { min_score: "60", has_email: "1" });
assert.equal(rows.length, 1);
assert.equal(rows[0].commercial_name, "Auto Test Dealer");

const dashboard = leadDashboard(db, companyId);
assert.equal(dashboard.stats.total_leads, 1);
assert.equal(dashboard.stats.with_email, 1);

const importResult = await importLeadCsvText(
  db,
  companyId,
  "Company Name,Email Address,Phone,Website URL,County,City\nCSV Dealer,office@csvdealer.example,0722000001,https://csvdealer.example,Prahova,Ploiesti",
  {
    campaign_name: "CSV Test",
    category: "auto_dealers",
    country: "Romania",
    actor_email: "tester@example.test"
  }
);
assert.equal(importResult.ok, true);
assert.equal(importResult.imported, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS total FROM leads WHERE company_id=?").get(companyId).total, 2);

db.close();
console.log("lead builder tests passed");
