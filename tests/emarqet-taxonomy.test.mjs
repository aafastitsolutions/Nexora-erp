import assert from "node:assert/strict";
import test from "node:test";

import {
  EMARQET_CATEGORY_DEFINITIONS,
  metadataFromBody,
  publishFieldsFor
} from "../lib/emarqet-categories.js";
import {
  EMARQET_DEPENDENT_OPTIONS,
  suggestEmarqetCategory
} from "../lib/emarqet-taxonomy.js";
import { renderEmarqetPublicPublishPage } from "../src/ui/emarqet-public-pages.js";
import { renderEmarqetListingsPage } from "../src/ui/nexora-emarqet-pages.js";

const verticals = EMARQET_CATEGORY_DEFINITIONS.map((category, index) => ({
  id: index + 1,
  code: category.code,
  name: category.name,
  status: "ACTIV",
  public_path: category.public_path
}));

test("taxonomia e-Marqet acoperă toate verticalele și are câmpuri de publicare", () => {
  assert.ok(EMARQET_CATEGORY_DEFINITIONS.length >= 19);
  for (const category of EMARQET_CATEGORY_DEFINITIONS) {
    assert.ok(category.filters.length > 0, `${category.code} nu are filtre`);
    assert.ok(category.publishFields.length > 0, `${category.code} nu are câmpuri de publicare`);
  }
  assert.ok(publishFieldsFor("electronice_electrocasnice").some((field) => field.name === "brand"));
  assert.ok(publishFieldsFor("electronice_electrocasnice").some((field) => field.name === "model"));
  assert.ok(publishFieldsFor("imobiliare").some((field) => field.name === "property_subtype"));
  assert.ok(EMARQET_DEPENDENT_OPTIONS.appliance_model.options.Samsung.includes("EcoBubble"));
});

test("sugestia de categorie folosește titlul și descrierea", () => {
  assert.equal(suggestEmarqetCategory("Mașină de spălat Samsung EcoBubble 8 kg")?.code, "electronice_electrocasnice");
  assert.equal(suggestEmarqetCategory("Apartament cu 2 camere de închiriat")?.code, "imobiliare");
  assert.equal(suggestEmarqetCategory("iPhone 15 Pro, stare foarte bună")?.code, "telefoane_accesorii");
  assert.equal(suggestEmarqetCategory("Canapea extensibilă pentru living")?.code, "casa_gradina");
  assert.equal(suggestEmarqetCategory("Angajăm șofer categoria B")?.code, "joburi");
});

test("metadatele noilor categorii sunt salvate din formular", () => {
  assert.deepEqual(metadataFromBody("electronice_electrocasnice", {
    appliance_type: "Mașină de spălat rufe",
    brand: "Samsung",
    model: "EcoBubble",
    warranty: "Da"
  }), {
    appliance_type: "Mașină de spălat rufe",
    brand: "Samsung",
    model: "EcoBubble",
    warranty: "Da"
  });
});

test("formularele client, partener, editare și admin primesc aceeași taxonomie", () => {
  const publicHtml = renderEmarqetPublicPublishPage({
    verticals,
    pricingPlans: [],
    partnerProfiles: [{ id: 10, display_name: "Partener Test", partner_type: "auto_dealer" }],
    user: { id: 4, display_name: "Client", email: "client@example.test" }
  });
  assert.match(publicHtml, /data-emq-category-suggestion/);
  assert.match(publicHtml, /Profil business/);
  assert.match(publicHtml, /Mașină de spălat rufe/);
  assert.match(publicHtml, /Subtip proprietate/);

  const editHtml = renderEmarqetPublicPublishPage({
    mode: "edit",
    actionPath: "/cont/anunt/1/edit",
    verticals,
    form: { vertical_id: verticals.find((row) => row.code === "telefoane_accesorii").id, title: "iPhone 15" },
    user: { id: 4, email: "client@example.test" }
  });
  assert.match(editHtml, /Salvează modificările/);
  assert.match(editHtml, /Model \/ serie/);

  const adminHtml = renderEmarqetListingsPage({ verticals, rows: [], companyName: "Test", user: {} });
  assert.match(adminHtml, /data-emq-admin-listing-form/);
  assert.match(adminHtml, /data-emq-admin-category-fields="imobiliare"/);
  assert.match(adminHtml, /data-category-code="electronice_electrocasnice"/);
});
