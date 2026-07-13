import fs from "node:fs";
import { db } from "../db.js";

const companyIdArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const companyId = Number(companyIdArg?.split("=")[1] || 1) || 1;

const source = fs.readFileSync(new URL("../routes/travel-routes.js", import.meta.url), "utf8");
const groupsMatch = source.match(/const DEFAULT_SOCIAL_GROUPS = ([\s\S]*?);\n\nfunction ensureTravelSocialGroupsTable/);

if (!groupsMatch) {
  console.error("Nu am gasit DEFAULT_SOCIAL_GROUPS in routes/travel-routes.js.");
  process.exit(1);
}

const groups = Function(`return ${groupsMatch[1]}`)();

db.exec(`
  CREATE TABLE IF NOT EXISTS travel_social_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'facebook',
    url TEXT,
    country TEXT,
    language TEXT,
    members_count INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    join_status TEXT NOT NULL DEFAULT 'de_verificat',
    rules_status TEXT NOT NULL DEFAULT 'de_verificat',
    promotion_allowed INTEGER NOT NULL DEFAULT 0,
    last_post_at TEXT,
    result TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, platform, name)
  );
  CREATE INDEX IF NOT EXISTS idx_travel_social_groups_company_status
    ON travel_social_groups(company_id, join_status, rules_status, promotion_allowed);
`);

const upsert = db.prepare(`
  INSERT INTO travel_social_groups (
    company_id, name, platform, country, language, members_count, category, url, notes, updated_at
  )
  VALUES (?, ?, 'facebook', ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(company_id, platform, name) DO UPDATE SET
    country=excluded.country,
    language=excluded.language,
    members_count=CASE
      WHEN travel_social_groups.members_count > 0 THEN travel_social_groups.members_count
      ELSE excluded.members_count
    END,
    category=excluded.category,
    url=excluded.url,
    notes=excluded.notes,
    updated_at=datetime('now')
`);

const seed = db.transaction(() => {
  for (const [name, country, language, members, category, url, notes] of groups) {
    upsert.run(companyId, name, country, language, Number(members || 0), category, url, notes);
  }
});

seed();

const total = db.prepare(`
  SELECT COUNT(*) AS total
  FROM travel_social_groups
  WHERE company_id=?
`).get(companyId)?.total || 0;

console.log(JSON.stringify({ ok: true, company_id: companyId, seeded: groups.length, total }, null, 2));
db.close();
