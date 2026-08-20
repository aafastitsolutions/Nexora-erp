import assert from "node:assert/strict";
import test from "node:test";

import { isNextPdfStripeObject, nextPdfPlanDetails } from "../routes/billing-routes.js";
import { isNextPdfAdminUser } from "../routes/nextpdf-routes.js";
import { renderNextPdfAdminPage } from "../src/ui/nexora-nextpdf-page.js";
import { renderNexoraShell } from "../src/ui/nexora-shell.js";

test("adminul companiei A&A vede și poate administra NextPDF fără rol separat de super-admin", () => {
  const admin = { role: "admin", company_id: 1, is_company_admin: 1 };
  assert.equal(isNextPdfAdminUser(admin), true);
  assert.equal(isNextPdfAdminUser({ ...admin, company_id: 2 }), false);

  const html = renderNexoraShell({
    user: admin,
    currentPath: "/nexora-dashboard"
  });
  assert.match(html, /class="nx-module-main" href="\/nexora\/super-admin\/nextpdf"/);
});

test("identifică plățile NextPDF după metadata, referință sau Price ID", () => {
  const previousMonthly = process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID;
  process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID = "price_nextpdf_monthly_test";
  try {
    assert.equal(isNextPdfStripeObject({ metadata: { nextpdf_product: "nextpdf" } }), true);
    assert.equal(isNextPdfStripeObject({ client_reference_id: "np_42_m_nonce" }), true);
    assert.equal(isNextPdfStripeObject({ lines: { data: [{ price: { id: "price_nextpdf_monthly_test" } }] } }), true);
    assert.equal(isNextPdfStripeObject({ metadata: { product: "trevoro" } }), false);
    assert.equal(
      nextPdfPlanDetails({ lines: { data: [{ price: { id: "price_nextpdf_monthly_test" } }] } }).plan,
      "premium_monthly"
    );
  } finally {
    if (previousMonthly === undefined) delete process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID;
    else process.env.NEXTPDF_STRIPE_MONTHLY_PRICE_ID = previousMonthly;
  }
});

test("dashboardul NextPDF afișează utilizatori, activitate, plăți și operațiuni de suport", () => {
  const html = renderNextPdfAdminPage({
    user: { email: "admin@example.com", role: "super_admin" },
    overview: {
      stats: {
        usersTotal: 2,
        recentUsers30d: 1,
        premiumUsers: 1,
        activeSessions: 1,
        paidTotals: [{ currency: "RON", amountMinor: 9900 }]
      },
      users: [{
        id: 7,
        email: "client@example.com",
        plan: "premium_monthly",
        subscriptionStatus: "active",
        subscriptionId: "sub_nextpdf",
        currentPeriodEnd: "2026-09-06T12:00:00+00:00",
        cancelAtPeriodEnd: false,
        activeSessions: 1,
        lastSeenAt: "2026-08-06T12:00:00+00:00"
      }],
      payments: [{
        id: 9,
        payerEmail: "client@example.com",
        status: "paid",
        amountMinor: 9900,
        currency: "RON",
        stripeInvoiceId: "in_nextpdf",
        livemode: true
      }]
    }
  });

  assert.match(html, /NextPDF Admin/);
  assert.match(html, /Activi în 30 zile/);
  assert.match(html, /Reset parolă/);
  assert.match(html, /Închide sesiuni/);
  assert.match(html, /Anulează abonamentul/);
  assert.match(html, /nu se mai reînnoiește/);
  assert.match(html, /99,00 RON/);
  assert.match(html, /LIVE/);
});
