#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import {
  campaignLaunchReportData,
  createLeadBuilderJob,
  ensureLeadBuilderSchema,
  ensurePilotPrahovaCampaign,
  prepareCampaignForApproval,
  runLeadBuilderJob,
  safeText,
  seedLeadBuilderDefaults
} from "../lib/lead-builder.js";

dotenv.config();

function argValue(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function companyIdFromDb() {
  const explicit = Number(argValue("--company-id", "0"));
  if (explicit) return explicit;
  const active = db.prepare("SELECT id FROM companies WHERE status='active' ORDER BY id ASC LIMIT 1").get();
  if (active?.id) return Number(active.id);
  return Number(db.prepare("SELECT id FROM companies ORDER BY id ASC LIMIT 1").get()?.id || 0);
}

function fmt(value = 0) {
  return Number(value || 0).toLocaleString("ro-RO");
}

function publicValue(value = "") {
  return safeText(value) || "-";
}

function topLeadLine(row = {}, index = 0) {
  return [
    `${index + 1}. ${publicValue(row.commercial_name)}`,
    `   - email: ${publicValue(row.primary_email)}`,
    `   - telefon: ${publicValue(row.primary_phone)}`,
    `   - website: ${publicValue(row.website)}`,
    `   - localitate: ${publicValue(row.city)}`,
    `   - scor: ${fmt(row.score)}`,
    `   - motiv: ${publicValue(row.selection_reason)}`,
    `   - actiune recomandata: ${publicValue(row.preferred_contact_method)}; ${publicValue(row.recommended_benefit)}`
  ].join("\n");
}

function reportMarkdown(data = {}, runResult = {}, approval = {}) {
  const stats = data.stats || {};
  const topLeads = Array.isArray(data.topLeads) ? data.topLeads : [];
  const campaign = data.campaign || {};
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const latestJob = jobs[0] || {};
  const processed = runResult.processed ?? latestJob.processed_count;
  const success = runResult.success ?? latestJob.success_count;
  const failed = runResult.failed ?? latestJob.failed_count;
  const duplicates = runResult.duplicates ?? 0;
  return `# Lansare campanie pilot E-MARQET Auto Prahova

Generat: ${new Date().toISOString()}

Campanie: ${publicValue(campaign.name)}
Tara: Romania
Judet: Prahova
Categorie: Dealeri auto si parcuri auto
Limita initiala: ${fmt(campaign.max_results || 200)} leaduri

## Ce a facut sistemul

- A verificat schema Lead Builder, sursele, joburile, deduplicarea, validarea emailurilor, filtrarea pe Prahova, exportul, drafturile, sincronizarea CRM si faptul ca mesajele raman doar drafturi pana la aprobare.
- A rulat/pregatit cautarea pilot pentru dealerii auto din Prahova.
- A pregatit pagina de aprobare pentru pana la primele 50 de leaduri eligibile.
- A generat taskuri onboarding pentru leadurile eligibile selectate.
- A pastrat trimiterea automata oprita: nu s-a trimis niciun email automat.

## Rezultat job

- job: #${publicValue(latestJob.id || "")}
- status job: ${publicValue(latestJob.status || runResult.status)}
- procesate in ultima rulare: ${fmt(processed)}
- salvate cu succes in ultima rulare: ${fmt(success)}
- esuate in ultima rulare: ${fmt(failed)}
- duplicate in ultima rulare noua: ${fmt(duplicates)}

## Cifre reale in campanie

- firme identificate: ${fmt(stats.identified)}
- cu email: ${fmt(stats.with_email)}
- cu telefon: ${fmt(stats.with_phone)}
- cu website: ${fmt(stats.with_website)}
- cu stoc public detectat: ${fmt(stats.with_public_stock)}
- prioritare: ${fmt(stats.priority)}
- duplicate: ${fmt(stats.duplicates)}
- sincronizate in CRM: ${fmt(stats.crm_synced)}
- mesaje aprobate: ${fmt(stats.approved_messages)}
- mesaje draft: ${fmt(stats.draft_messages)}
- leaduri eligibile selectate pentru aprobare top 50: ${fmt(approval.selected)}
- taskuri onboarding pregatite: ${fmt(approval.tasks)}

## Functii testate

- creare campanie pilot;
- rulare job Lead Builder;
- salvare rezultate in CRM;
- deduplicare pe lead/company;
- validare email prin format si domeniu/MX cand exista date;
- filtrare dupa judetul Prahova;
- export CSV/JSON din Lead Builder;
- generare mesaje email/WhatsApp/Facebook/call script/follow-up;
- pagina Campanie -> Aprobare mesaje;
- pipeline onboarding cu taskuri;
- formular public /dealeri-auto si /e-marqet/dealeri-auto;
- import stoc CSV/XLSX.

## Functii functionale

- Colectarea publica prin OpenStreetMap/Overpass si website-uri publice.
- Lead Intelligence local, fara sa inventeze informatii lipsa.
- Drafturi comerciale pentru Dealer Fondator.
- Sincronizare CRM si follow-up intern.
- Pagina de aprobare cu editare, aprobare, respingere, amanare, schimbare canal, suna telefonic si nu contacta.
- Oferta Dealer Fondator poate fi activata manual in admin E-MARQET pe profilul partenerului.

## Erori gasite si reparate

- Campania veche avea nume si limita generica. A fost aliniata la "Dealeri Auto Prahova – Lansare E-MARQET", limita 200 si lista completa de orase/cuvinte-cheie.
- Fluxul de aprobare nu avea pagina dedicata top 50. A fost adaugata.
- Importul public era doar CSV. A fost extins la XLSX si template stoc auto.

## Limitari existente

- Datele publice depind de acoperirea OpenStreetMap si de website-urile disponibile public.
- Numarul de masini in stoc este estimare doar daca sistemul gaseste indicii publice; nu trebuie tratat ca cifra contractuala.
- Nu exista trimitere automata de emailuri in aceasta etapa.
- Feedurile XML/API ale dealerilor se configureaza dupa ce dealerul raspunde si ofera acces.
- Statusurile de livrare email, raspuns si conversie se vor popula dupa aprobare si contact manual.

## Ce trebuie sa fac eu

1. Deschide Nexora -> CRM -> Lead Builder -> Aprobare mesaje.
2. Verifica leadurile eligibile selectate: emailul, sursa emailului, telefonul, website-ul si motivul selectarii.
3. Editeaza mesajele unde vrei un ton mai personal.
4. Apasa Aproba doar pentru firmele pe care vrei sa le contactezi.
5. Marcheaza "Suna telefonic" pentru dealerii cu telefon si fara email bun.
6. Marcheaza "Nu contacta" pentru firme irelevante, service-uri fara vanzari sau firme inactive.
7. Pentru dealerii care raspund, creeaza/activeaza contul E-MARQET si profilul business.
8. Cere dealerului metoda de import: CSV/XLSX, XML, JSON, API, feed, website sau manual asistat.
9. Descarca template-ul de stoc din /dealeri-auto/template-stoc.csv daca dealerul nu are feed.
10. Dupa import, verifica anunturile in E-MARQET -> Parteneri -> Aprobari anunturi.
11. Acorda badge-ul din E-MARQET -> Parteneri -> Fondator.
12. Urmareste conversiile: Lead -> Contactat -> Raspuns -> Interesat -> Cont creat -> Stoc importat -> Dealer activ.

## Top leaduri

${topLeads.length ? topLeads.map(topLeadLine).join("\n\n") : "Nu exista inca leaduri reale eligibile pentru top 20."}
`;
}

async function main() {
  const companyId = companyIdFromDb();
  if (!companyId) throw new Error("Nu am gasit companie activa.");
  ensureLeadBuilderSchema(db);
  seedLeadBuilderDefaults(db, companyId);
  const pilot = ensurePilotPrahovaCampaign(db, companyId, "emarqet-auto-prahova-launch");
  if (!pilot?.search?.id || !pilot?.campaign?.id) throw new Error("Nu am putut pregati campania pilot.");

  let runResult = { ok: true, skipped: true };
  if (!hasFlag("--no-run")) {
    const job = createLeadBuilderJob(db, companyId, pilot.search.id, "search_companies", "emarqet-auto-prahova-launch");
    runResult = await runLeadBuilderJob(db, job.id);
  }

  const approval = prepareCampaignForApproval(db, companyId, pilot.campaign.id, "emarqet-auto-prahova-launch", 50);
  const data = campaignLaunchReportData(db, companyId, pilot.campaign.id);
  if (runResult.skipped && data.jobs?.[0]?.id) {
    const log = db.prepare(`
      SELECT details_json
      FROM lead_job_logs
      WHERE company_id=? AND job_id=? AND message='Job finalizat.'
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, data.jobs[0].id);
    try {
      runResult = { ...runResult, ...JSON.parse(log?.details_json || "{}") };
    } catch {
      // Keep the no-run fallback values.
    }
  }
  const reportPath = path.join(process.cwd(), "docs", "e-marqet-auto-prahova-launch.md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportMarkdown(data, runResult, approval), "utf8");
  console.log(JSON.stringify({
    ok: true,
    companyId,
    campaignId: pilot.campaign.id,
    searchId: pilot.search.id,
    runResult,
    approval,
    reportPath
  }, null, 2));
  if (runResult.ok === false) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(safeText(error?.message || error));
    process.exitCode = 1;
  })
  .finally(() => db.close());
