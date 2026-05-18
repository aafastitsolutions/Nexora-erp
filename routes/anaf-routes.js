export function registerAnafRoutes(app, { fetchAnafCompany, normalizeCui }) {
  app.get("/api/company", async (req, res) => {
    try {
      const cui = normalizeCui(req.query.cui);
      if (!cui) return res.status(400).json({ error: "CUI invalid" });
      const company = await fetchAnafCompany(cui);
      return res.json({
        normalized_cui: company.cui,
        legal_name: company.name,
        address: company.address,
        reg_com: company.reg_com,
        caen: company.caen,
        vat: company.vat,
        inactive: company.inactive,
        source_url: company.source_url,
        fetched_at: new Date().toISOString()
      });
    } catch (e) {
      const message = String(e?.message ?? e);
      const status = /ANAF unavailable/i.test(message) ? 502 : /raspuns invalid|negăsit|not found/i.test(message) ? 404 : 500;
      return res.status(status).json({ error: "Server error", details: message });
    }
  });
}
