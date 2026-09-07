import test from "node:test";
import assert from "node:assert/strict";

import { normalizeLanguage, translateHtml, translateText } from "../lib/i18n.js";

test("normalizeLanguage accepts Romanian and English only", () => {
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage("ro-RO"), "ro");
  assert.equal(normalizeLanguage("de"), "ro");
});

test("English translation covers the main Nexora modules", () => {
  const cases = [
    ["Portofoliu clienți", "Client portfolio"],
    ["Ofertă nouă", "New offer"],
    ["Importă și înregistrează", "Import and register"],
    ["Poziție stoc nouă", "New stock item"],
    ["Planificare, taskuri, termene, documente și progres centralizate pentru echipă.", "Centralized planning, tasks, deadlines, documents, and progress for the team."],
    ["Fișă mentenanță", "Maintenance sheet"],
    ["Registru documente", "Document register"],
    ["Factură nouă", "New invoice"],
    ["Nu există task-uri mobile.", "No mobile tasks."],
    ["Rapoarte & BI (Business Intelligence)", "Reports & BI (Business Intelligence)"],
    ["A-01 / raft 3", "A-01 / shelf 3"],
    ["Autentifică-te în workspace-ul tău.", "Sign in to your workspace."],
  ];

  for (const [romanian, english] of cases) {
    assert.equal(translateText(romanian, "en"), english);
  }
});

test("translateHtml translates text and accessible attributes but preserves user input", () => {
  const html = `<!doctype html><html lang="ro"><body>
    <button aria-label="Limbă aplicație">Ofertă nouă</button>
    <textarea>Fișă mentenanță</textarea>
  </body></html>`;
  const translated = translateHtml(html, "en");

  assert.match(translated, /<html lang="en">/);
  assert.match(translated, /aria-label="Application language"/);
  assert.match(translated, />New offer</);
  assert.match(translated, /<textarea>Fișă mentenanță<\/textarea>/);
});

test("translateHtml handles HTML-escaped module labels", () => {
  const translated = translateHtml('<span>Workflow &amp; Automatizări</span>', "en");
  assert.equal(translated, '<span>Workflow &amp; Automation</span>');
});
