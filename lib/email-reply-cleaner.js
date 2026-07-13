function safeText(value = "") {
  return String(value || "").trim();
}

const QUOTE_LINE_MARKERS = [
  /^\s*On .{0,260}\bwrote:\s*$/i,
  /^\s*(In|La|Pe|În) .{0,260}\b(a scris|wrote):\s*$/i,
  /^\s*.{0,220}<[^>]+>\s*(wrote|a scris|napisao je|napisala je|napisał|napisała|escribió|escreveu|écrit)\s*:\s*$/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^\s*-{2,}\s*(Message d'origine|Message transféré|Message transfere)\s*-{2,}\s*$/i,
  /^\s*Envoy[ée] depuis l['’]application Mail Orange\s*-{2,}.*$/i,
  /^\s*(De|From)\s*:\s+.{1,260}$/i
];

const INLINE_QUOTE_MARKERS = [
  /\sOn\s+(Mon|Monday|Tue|Tuesday|Wed|Wednesday|Thu|Thursday|Fri|Friday|Sat|Saturday|Sun|Sunday),?\s+.{0,260}?\bwrote:\s*>?/i,
  /\sOn\s+.{0,260}?<[^>]+>\s+wrote:\s*>?/i,
  /<[^>]+>\s*(wrote|a scris|napisao je|napisala je|napisał|napisała|escribió|escreveu|écrit)\s*:\s*>?/i,
  /\s-{2,}\s*Original Message\s*-{2,}/i,
  /\s-{2,}\s*Forwarded message\s*-{2,}/i,
  /\s-{2,}\s*(Message d'origine|Message transféré|Message transfere)\s*-{2,}/i,
  /(?:^|\s)Envoy[ée] depuis l['’]application Mail Orange\s*-{2,}/i,
  /\sFrom:\s+.{0,160}\s+Sent:\s+.{0,160}\s+To:/i,
  /(?:^|\s)De\s*:\s+.{0,220}\s+Envoy[ée]\s*:\s+.{0,220}\s+(À|A|To)\s*:/i
];

function cutAtInlineMarker(text = "") {
  let cutIndex = -1;
  for (const marker of INLINE_QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (!match) continue;
    const index = match.index;
    if (index >= 0 && (cutIndex < 0 || index < cutIndex)) cutIndex = index;
  }
  return cutIndex >= 0 ? text.slice(0, cutIndex) : text;
}

function removeTrailingQuoteHeader(text = "") {
  return text
    .replace(/\sOn\s+(Mon|Monday|Tue|Tuesday|Wed|Wednesday|Thu|Thursday|Fri|Friday|Sat|Saturday|Sun|Sunday),?\s+.{0,180}$/i, "")
    .replace(/\s(mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday|pon|uto|sri|čet|cet|pet|sub|ned)\.?,?\s+.{0,180}$/i, "")
    .replace(/\s\d{1,2}[./-]\d{1,2}[./-]\d{2,4}[^.!?\n]{0,120}$/i, "")
    .trim();
}

function cutAtLineMarker(text = "") {
  const lines = text.split("\n");
  const kept = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (QUOTE_LINE_MARKERS.some((marker) => marker.test(line))) break;
    kept.push(line);
  }
  return kept.join("\n");
}

export function stripQuotedEmailText(value = "") {
  let text = safeText(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
  if (!text) return "";
  text = cutAtLineMarker(text);
  text = cutAtInlineMarker(text);
  text = removeTrailingQuoteHeader(text);

  // Some imported previews are already flattened, so quoted lines survive as " > ...".
  const inlineQuoteIndex = text.search(/\s>\s+(Hello|Bună|Buna|Hi|Dear|I am contacting|Trevoro)\b/i);
  if (inlineQuoteIndex > 0) text = text.slice(0, inlineQuoteIndex);

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanEmailBodyPreview(value = "", limit = 900) {
  const cleaned = stripQuotedEmailText(value);
  return cleaned
    .replace(/\s+/g, " ")
    .slice(0, Number(limit || 900))
    .trim();
}
