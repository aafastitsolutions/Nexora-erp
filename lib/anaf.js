import { normalizeCui, todayISO } from "./helpers.js";

const ANAF_ENDPOINTS = [
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva",
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v8/tva",
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v7/tva",
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v6/tva"
];

export async function fetchAnafCompany(cuiRaw) {
  const cui = normalizeCui(cuiRaw);
  if (!cui) throw new Error("CUI invalid");

  const payload = [{ cui: Number(cui), data: todayISO() }];
  let lastErr = null;

  for (const url of ANAF_ENDPOINTS) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) MiniCRM/1.0"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const txt = await r.text();

    if (!ct.includes("application/json")) {
      lastErr = { url, status: r.status };
      continue;
    }

    if (!r.ok) {
      lastErr = { url, status: r.status, details: txt.slice(0, 200) };
      continue;
    }

    const data = JSON.parse(txt);
    const found = data?.found?.[0];
    if (!found?.date_generale) throw new Error("ANAF: raspuns invalid");

    const dg = found.date_generale;
    return {
      cui: String(dg.cui ?? cui),
      name: dg.denumire ?? "",
      address: dg.adresa ?? "",
      reg_com: dg.nrRegCom ?? "",
      caen: dg.cod_CAEN ?? "",
      vat: found?.inregistrare_scop_Tva?.scpTVA ? 1 : 0,
      inactive: found?.stare_inactiv?.statusInactivi ? 1 : 0,
      source_url: url
    };
  }

  throw new Error("ANAF unavailable: " + JSON.stringify(lastErr));
}
