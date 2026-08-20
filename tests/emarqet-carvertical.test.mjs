import assert from "node:assert/strict";
import test from "node:test";

import {
  renderEmarqetCarVerticalSeoPage,
  renderEmarqetPublicHomePage,
  renderEmarqetPublicListingPage
} from "../src/ui/emarqet-public-pages.js";
import { carVerticalAffiliateUrl } from "../routes/emarqet-public-routes.js";

test("listing page renders the approved carVertical affiliate offer", () => {
  const html = renderEmarqetPublicListingPage({
    listing: {
      id: 42,
      slug: "masina-test",
      title: "Mașină test",
      vertical_code: "auto",
      metadata_json: JSON.stringify({ vin_optional: "WVWZZZ1JZXW000001" })
    },
    services: [{
      code: "vehicle_history_report",
      name: "Raport istoric auto carVertical",
      description: "Verifică istoricul mașinii.",
      cta_label: "Verifică pe carVertical"
    }]
  });

  assert.match(html, /carVertical/);
  assert.match(html, /EMARQET20/);
  assert.match(html, /20% reducere/);
  assert.match(html, /\/partener\/carvertical\?listing_id=42&amp;placement=listing_services/);
  assert.match(html, /rel="sponsored noopener noreferrer"/);
  assert.match(html, /Link afiliat/);
  assert.match(html, /https:\/\/aff\.carvertical\.com/);
  assert.match(html, /<div\s+data-cvaff/);
  assert.match(html, /data-partner-id="2NGMLPR"/);
  assert.match(html, /data-offer-id="66RQ8Q"/);
  assert.match(html, /data-uid="01"/);
  assert.match(html, /data-chan="website"/);
  assert.match(html, /data-voucher="emarqet20"/);
  assert.match(html, /data-integration-type="button"/);
  assert.match(html, /data-variant="variant-2"/);
  assert.match(html, /data-animated="true"/);
  assert.match(html, /data-vin="WVWZZZ1JZXW000001"/);
  assert.match(html, /data-integration-type="banner"/);
  assert.doesNotMatch(html, /data-chan="wesite"/);
});

test("carVertical contact widget is limited to auto listings", () => {
  const html = renderEmarqetPublicListingPage({
    listing: {
      id: 43,
      slug: "apartament-test",
      title: "Apartament test",
      vertical_code: "imobiliare"
    },
    services: []
  });

  assert.doesNotMatch(html, /<div\s+data-cvaff/);
  assert.doesNotMatch(html, /aff\.carvertical\.com\/sdk\.js/);
});

test("home page displays the carVertical partnership banner", () => {
  const html = renderEmarqetPublicHomePage({
    verticals: [],
    listings: [],
    services: []
  });

  assert.match(html, /e-Marqet × carVertical/);
  assert.match(html, /carvertical-logo-white\.png/);
  assert.match(html, /href="\/verificare-istoric-auto-carvertical"/);
  assert.match(html, /EMARQET20/);
});

test("SEO landing page includes indexable metadata, content and structured data", () => {
  const html = renderEmarqetCarVerticalSeoPage({});

  assert.match(html, /<title>Verificare istoric auto carVertical \| Reducere 20%<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/e-marqet\.com\/verificare-istoric-auto-carvertical">/);
  assert.match(html, /<h1>Verificare istoric auto carVertical după VIN<\/h1>/);
  assert.match(html, /method="post" action="\/partener\/carvertical"/);
  assert.match(html, /name="vin" minlength="17" maxlength="17"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /Transparență: acesta este un parteneriat afiliat/);
});

test("affiliate redirect selects the recommended URL based on listing VIN", () => {
  const oldDefault = process.env.EMARQET_CARVERTICAL_AFFILIATE_URL;
  const oldVin = process.env.EMARQET_CARVERTICAL_AFFILIATE_VIN_URL;
  delete process.env.EMARQET_CARVERTICAL_AFFILIATE_URL;
  delete process.env.EMARQET_CARVERTICAL_AFFILIATE_VIN_URL;
  try {
    const withoutVin = new URL(carVerticalAffiliateUrl({}));
    assert.equal(withoutVin.searchParams.get("source_id"), "AFF");
    assert.equal(withoutVin.searchParams.get("sub1"), "emarqet20");
    assert.equal(withoutVin.searchParams.get("uid"), null);

    const withVin = new URL(carVerticalAffiliateUrl({
      metadata_json: JSON.stringify({ vin_optional: "WVWZZZ1JZXW000001" })
    }));
    assert.equal(withVin.searchParams.get("uid"), "69");
    assert.equal(withVin.searchParams.get("source_id"), "AFF");
    assert.equal(withVin.searchParams.get("sub1"), "emarqet20");
    assert.equal(withVin.searchParams.get("sub3"), "WVWZZZ1JZXW000001");
  } finally {
    if (oldDefault === undefined) delete process.env.EMARQET_CARVERTICAL_AFFILIATE_URL;
    else process.env.EMARQET_CARVERTICAL_AFFILIATE_URL = oldDefault;
    if (oldVin === undefined) delete process.env.EMARQET_CARVERTICAL_AFFILIATE_VIN_URL;
    else process.env.EMARQET_CARVERTICAL_AFFILIATE_VIN_URL = oldVin;
  }
});
