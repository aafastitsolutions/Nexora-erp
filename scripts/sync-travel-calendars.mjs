import { db, migrate } from "../db.js";

function text(value = "") {
  return String(value || "").trim();
}

function addDays(value = "", days = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function dateRange(start = "", end = "") {
  if (!start) return [];
  const finalEnd = end && end > start ? end : addDays(start, 1);
  const dates = [];
  let cursor = start;
  let guard = 0;
  while (cursor && cursor < finalEnd && guard < 370) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

function parseIcsDate(value = "") {
  const match = text(value).replace(/Z$/i, "").match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function unfoldLines(body = "") {
  return text(body)
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseIcs(body = "") {
  const blocks = [];
  let event = null;
  for (const line of unfoldLines(body)) {
    if (line === "BEGIN:VEVENT") {
      event = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (event?.start) {
        for (const blockDate of dateRange(event.start, event.end || addDays(event.start, 1))) {
          blocks.push({ block_date: blockDate, summary: event.summary || "Ocupat" });
        }
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).toUpperCase();
    const value = line.slice(separator + 1);
    if (key.startsWith("DTSTART")) event.start = parseIcsDate(value);
    if (key.startsWith("DTEND")) event.end = parseIcsDate(value);
    if (key.startsWith("SUMMARY")) event.summary = text(value).slice(0, 180);
  }
  const unique = new Map();
  for (const block of blocks) {
    if (block.block_date && !unique.has(block.block_date)) unique.set(block.block_date, block);
  }
  return [...unique.values()].sort((a, b) => a.block_date.localeCompare(b.block_date));
}

async function syncLink(link) {
  try {
    const response = await fetch(link.calendar_url, { redirect: "follow" });
    if (!response.ok) throw new Error(`calendar_http_${response.status}`);
    const body = await response.text();
    if (!/BEGIN:VCALENDAR/i.test(body)) throw new Error("calendar_not_ical");
    const blocks = parseIcs(body);
    const write = db.transaction(() => {
      db.prepare(`
        DELETE FROM travel_property_calendar_blocks
        WHERE company_id=? AND property_id=? AND calendar_link_id=?
      `).run(link.company_id, link.property_id, link.id);
      const insert = db.prepare(`
        INSERT OR IGNORE INTO travel_property_calendar_blocks (
          company_id, property_id, calendar_link_id, block_date, source, summary, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      for (const block of blocks) {
        insert.run(link.company_id, link.property_id, link.id, block.block_date, link.provider || "ical", block.summary || "Ocupat");
      }
      db.prepare(`
        UPDATE travel_property_calendar_links
        SET sync_status='active',
            last_synced_at=datetime('now'),
            last_error=NULL,
            updated_at=datetime('now')
        WHERE id=?
      `).run(link.id);
    });
    write();
    return { ok: true, id: link.id, synced: blocks.length };
  } catch (error) {
    const message = text(error?.message || "calendar_sync_failed").slice(0, 240);
    db.prepare(`
      UPDATE travel_property_calendar_links
      SET sync_status='error',
          last_error=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(message, link.id);
    return { ok: false, id: link.id, error: message };
  }
}

async function main() {
  migrate();
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = Math.max(1, Math.min(500, Number(limitArg?.split("=")[1] || 200)));
  const links = db.prepare(`
    SELECT *
    FROM travel_property_calendar_links
    WHERE sync_status IN ('pending', 'active', 'error')
    ORDER BY COALESCE(last_synced_at, created_at) ASC, id ASC
    LIMIT ?
  `).all(limit);
  const results = [];
  for (const link of links) {
    results.push(await syncLink(link));
  }
  const ok = results.filter((result) => result.ok).length;
  const failed = results.length - ok;
  console.log(JSON.stringify({ ok: true, checked: results.length, synced: ok, failed, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
