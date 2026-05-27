import express from "express";
import Stripe from "stripe";
import { maybeGenerateBillingInvoice } from "../lib/billing-invoices.js";
import { planChargeAmount, planChargeQuantity } from "../lib/app-config.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

function stripeConfigured() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
}

function stripeWebhookConfigured() {
  return Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim());
}

function appBaseUrl(req) {
  const envUrl = String(process.env.APP_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function toStripeAmount(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function fromStripeAmount(value) {
  return Number(value || 0) / 100;
}

function isoFromStripeTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

function mapStripeSubscriptionStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "trialing") return "trial";
  if (normalized === "active") return "active";
  if (normalized === "past_due" || normalized === "unpaid" || normalized === "incomplete") return "past_due";
  if (normalized === "canceled" || normalized === "incomplete_expired" || normalized === "paused") return "suspended";
  return "active";
}

function latestSubscriptionRow(db, companyId) {
  return db.prepare(`
    SELECT cs.id, cs.plan_id, cs.status, cs.seats_included, cs.seats_used, cs.module_overrides,
           cs.stripe_subscription_id, cs.billing_email, cs.billing_currency,
           p.name AS plan_name, p.code AS plan_code, p.pricing_model, p.price_monthly, p.max_users, p.module_keys
    FROM company_subscriptions cs
    JOIN plans p ON p.id = cs.plan_id
    WHERE cs.company_id=?
    ORDER BY cs.id DESC
    LIMIT 1
  `).get(companyId);
}

function syncCompanyStatusFromSubscription(db, companyId) {
  const subscription = db.prepare(`
    SELECT status, seats_included
    FROM company_subscriptions
    WHERE company_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);
  if (!subscription) return;

  db.prepare(`
    UPDATE companies
    SET status=?,
        max_users=COALESCE(?, max_users),
        updated_at=datetime('now')
    WHERE id=? AND archived_at IS NULL
  `).run(
    subscription.status || "active",
    subscription.seats_included || null,
    companyId
  );
}

function ensureStripeCustomer(db, stripe, companyId, email) {
  const company = db.prepare(`
    SELECT id, name, cui, stripe_customer_id
    FROM companies
    WHERE id=?
  `).get(companyId);
  if (!company) throw new Error("Company not found");

  if (company.stripe_customer_id) {
    stripe.customers.update(company.stripe_customer_id, {
      email: email || undefined,
      name: company.name || undefined,
      metadata: {
        company_id: String(company.id),
        company_cui: String(company.cui || "")
      }
    }).catch(() => null);
    return company.stripe_customer_id;
  }

  return stripe.customers.create({
    email: email || undefined,
    name: company.name || undefined,
    metadata: {
      company_id: String(company.id),
      company_cui: String(company.cui || "")
    }
  }).then((customer) => {
    db.prepare(`
      UPDATE companies
      SET stripe_customer_id=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(customer.id, companyId);
    return customer.id;
  });
}

function updateSubscriptionFromStripe(db, stripeSubscription) {
  const subscriptionId = String(stripeSubscription?.id || "");
  if (!subscriptionId) return;

  const row = db.prepare(`
    SELECT id, company_id, seats_used
    FROM company_subscriptions
    WHERE stripe_subscription_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(subscriptionId);
  if (!row) return;

  const item = Array.isArray(stripeSubscription.items?.data) ? stripeSubscription.items.data[0] : null;
  const mappedStatus = mapStripeSubscriptionStatus(stripeSubscription.status);
  const currentPeriodEnd = stripeSubscription.current_period_end
    ? new Date(Number(stripeSubscription.current_period_end) * 1000).toISOString()
    : null;

  db.prepare(`
    UPDATE company_subscriptions
    SET status=?,
        stripe_price_id=?,
        current_period_end=?,
        billing_currency=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(
    mappedStatus,
    item?.price?.id || null,
    currentPeriodEnd,
    String(stripeSubscription.currency || item?.price?.currency || "eur"),
    row.id
  );

  syncCompanyStatusFromSubscription(db, row.company_id);
}

function findBillingPayment(db, { stripeInvoiceId = "", stripePaymentIntentId = "", stripeCheckoutSessionId = "", stripeSubscriptionId = "", companyId = 0 }) {
  if (stripeInvoiceId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE stripe_invoice_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripeInvoiceId);
    if (row?.id) return row.id;
  }

  if (stripePaymentIntentId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE stripe_payment_intent_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripePaymentIntentId);
    if (row?.id) return row.id;
  }

  if (stripeCheckoutSessionId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE stripe_checkout_session_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(stripeCheckoutSessionId);
    if (row?.id) return row.id;
  }

  if (stripeSubscriptionId && companyId) {
    const row = db.prepare(`
      SELECT id
      FROM billing_payments
      WHERE company_id=?
        AND stripe_subscription_id=?
      ORDER BY id DESC
      LIMIT 1
    `).get(companyId, stripeSubscriptionId);
    if (row?.id) return row.id;
  }

  return null;
}

function upsertBillingPayment(db, payload = {}) {
  const companyId = Number(payload.companyId || 0);
  if (!companyId) return null;

  const existingId = findBillingPayment(db, {
    stripeInvoiceId: String(payload.stripeInvoiceId || ""),
    stripePaymentIntentId: String(payload.stripePaymentIntentId || ""),
    stripeCheckoutSessionId: String(payload.stripeCheckoutSessionId || ""),
    stripeSubscriptionId: String(payload.stripeSubscriptionId || ""),
    companyId
  });

  const values = {
    company_subscription_id: Number(payload.companySubscriptionId || 0) || null,
    source: String(payload.source || "stripe"),
    provider_event_type: String(payload.providerEventType || ""),
    payment_kind: String(payload.paymentKind || "subscription"),
    status: String(payload.status || "initiated"),
    amount: Number(payload.amount || 0),
    currency: String(payload.currency || "eur").toLowerCase(),
    payer_name: String(payload.payerName || ""),
    payer_email: String(payload.payerEmail || "").trim().toLowerCase(),
    reference_code: String(payload.referenceCode || ""),
    stripe_checkout_session_id: String(payload.stripeCheckoutSessionId || ""),
    stripe_subscription_id: String(payload.stripeSubscriptionId || ""),
    stripe_invoice_id: String(payload.stripeInvoiceId || ""),
    stripe_payment_intent_id: String(payload.stripePaymentIntentId || ""),
    paid_at: payload.paidAt ? String(payload.paidAt) : null,
    failure_reason: String(payload.failureReason || ""),
    notes: String(payload.notes || ""),
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    created_by_user_id: Number(payload.createdByUserId || 0) || null,
    created_by_email: String(payload.createdByEmail || "").trim().toLowerCase()
  };

  if (existingId) {
    db.prepare(`
      UPDATE billing_payments
      SET company_subscription_id=COALESCE(?, company_subscription_id),
          source=CASE WHEN ? <> '' THEN ? ELSE source END,
          provider_event_type=CASE WHEN ? <> '' THEN ? ELSE provider_event_type END,
          payment_kind=CASE WHEN ? <> '' THEN ? ELSE payment_kind END,
          status=CASE WHEN ? <> '' THEN ? ELSE status END,
          amount=CASE WHEN ? > 0 THEN ? ELSE amount END,
          currency=CASE WHEN ? <> '' THEN ? ELSE currency END,
          payer_name=CASE WHEN ? <> '' THEN ? ELSE payer_name END,
          payer_email=CASE WHEN ? <> '' THEN ? ELSE payer_email END,
          reference_code=CASE WHEN ? <> '' THEN ? ELSE reference_code END,
          stripe_checkout_session_id=CASE WHEN ? <> '' THEN ? ELSE stripe_checkout_session_id END,
          stripe_subscription_id=CASE WHEN ? <> '' THEN ? ELSE stripe_subscription_id END,
          stripe_invoice_id=CASE WHEN ? <> '' THEN ? ELSE stripe_invoice_id END,
          stripe_payment_intent_id=CASE WHEN ? <> '' THEN ? ELSE stripe_payment_intent_id END,
          paid_at=COALESCE(?, paid_at),
          failure_reason=CASE WHEN ? <> '' THEN ? ELSE failure_reason END,
          notes=CASE WHEN ? <> '' THEN ? ELSE notes END,
          metadata=COALESCE(?, metadata),
          created_by_user_id=COALESCE(created_by_user_id, ?),
          created_by_email=CASE WHEN created_by_email IS NULL OR created_by_email='' THEN ? ELSE created_by_email END,
          updated_at=datetime('now')
      WHERE id=?
    `).run(
      values.company_subscription_id,
      values.source, values.source,
      values.provider_event_type, values.provider_event_type,
      values.payment_kind, values.payment_kind,
      values.status, values.status,
      values.amount, values.amount,
      values.currency, values.currency,
      values.payer_name, values.payer_name,
      values.payer_email, values.payer_email,
      values.reference_code, values.reference_code,
      values.stripe_checkout_session_id, values.stripe_checkout_session_id,
      values.stripe_subscription_id, values.stripe_subscription_id,
      values.stripe_invoice_id, values.stripe_invoice_id,
      values.stripe_payment_intent_id, values.stripe_payment_intent_id,
      values.paid_at,
      values.failure_reason, values.failure_reason,
      values.notes, values.notes,
      values.metadata,
      values.created_by_user_id,
      values.created_by_email,
      existingId
    );
    return existingId;
  }

  const result = db.prepare(`
    INSERT INTO billing_payments (
      company_id, company_subscription_id, source, provider_event_type, payment_kind, status,
      amount, currency, payer_name, payer_email, reference_code,
      stripe_checkout_session_id, stripe_subscription_id, stripe_invoice_id, stripe_payment_intent_id,
      paid_at, failure_reason, notes, metadata, created_by_user_id, created_by_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    values.company_subscription_id,
    values.source,
    values.provider_event_type || null,
    values.payment_kind,
    values.status,
    values.amount,
    values.currency,
    values.payer_name || null,
    values.payer_email || null,
    values.reference_code || null,
    values.stripe_checkout_session_id || null,
    values.stripe_subscription_id || null,
    values.stripe_invoice_id || null,
    values.stripe_payment_intent_id || null,
    values.paid_at,
    values.failure_reason || null,
    values.notes || null,
    values.metadata,
    values.created_by_user_id,
    values.created_by_email || null
  );

  return result.lastInsertRowid;
}

function renderBillingResult(message, href = "/setari") {
  return `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Billing</title></head>
<body style="font-family:system-ui;padding:40px;background:#f8fafc;color:#0f172a">
  <div style="max-width:760px;margin:0 auto;padding:24px;border-radius:20px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 20px 40px rgba(15,23,42,.08)">
    <h1 style="margin:0 0 12px 0">Stripe Billing</h1>
    <p style="line-height:1.6">${escapeHtml(message)}</p>
    <a href="${href}" style="display:inline-flex;margin-top:12px;padding:10px 14px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">Înapoi în aplicație</a>
  </div>
</body>
</html>
`;
}

function wantsNexoraReturn(req) {
  return String(req.query?.return_to || "").trim().toLowerCase() === "nexora";
}

function settingsReturnHref(req) {
  return wantsNexoraReturn(req) ? "/nexora/settings?tab=subscription" : "/setari";
}

export function registerBillingWebhook(app, { db }) {
  const stripe = createStripeClient();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!stripe || !webhookSecret) return;

  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature failed:", error?.message || error);
      return res.status(400).send(`Webhook Error: ${error?.message || "Invalid signature"}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const companyId = Number(session?.metadata?.company_id || 0);
          const companySubscriptionId = Number(session?.metadata?.subscription_id || 0) || null;
          const subscriptionId = String(session?.subscription || "");
          const customerId = String(session?.customer || "");
          const email = String(session?.customer_details?.email || session?.customer_email || "");
          const initiatedByUserId = Number(session?.metadata?.initiated_by_user_id || 0) || null;
          const initiatedByEmail = String(session?.metadata?.initiated_by_email || email || "");

          if (companyId) {
            upsertBillingPayment(db, {
              companyId,
              companySubscriptionId,
              source: "stripe",
              providerEventType: event.type,
              paymentKind: "subscription",
              status: "processing",
              amount: fromStripeAmount(session?.amount_total || session?.amount_subtotal || 0),
              currency: String(session?.currency || "eur"),
              payerEmail: email,
              referenceCode: String(session?.id || ""),
              stripeCheckoutSessionId: String(session?.id || ""),
              stripeSubscriptionId: subscriptionId,
              paidAt: isoFromStripeTimestamp(session?.created),
              createdByUserId: initiatedByUserId,
              createdByEmail: initiatedByEmail,
              metadata: {
                company_id: companyId,
                customer_id: customerId
              }
            });

            if (customerId) {
              db.prepare(`
                UPDATE companies
                SET stripe_customer_id=?,
                    updated_at=datetime('now')
                WHERE id=?
              `).run(customerId, companyId);
            }

            db.prepare(`
              UPDATE company_subscriptions
              SET stripe_checkout_session_id=?,
                  stripe_subscription_id=COALESCE(?, stripe_subscription_id),
                  billing_email=CASE WHEN ? <> '' THEN ? ELSE billing_email END,
                  last_payment_status='checkout_completed',
                  updated_at=datetime('now')
              WHERE company_id=?
            `).run(
              session.id,
              subscriptionId || null,
              email,
              email,
              companyId
            );

            if (subscriptionId) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
                updateSubscriptionFromStripe(db, stripeSubscription);
              } catch (error) {
                console.error("Stripe subscription retrieve failed:", error?.message || error);
              }
            } else {
              syncCompanyStatusFromSubscription(db, companyId);
            }
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          updateSubscriptionFromStripe(db, event.data.object);
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const subscriptionId = String(invoice?.subscription || "");
          if (subscriptionId) {
            const row = db.prepare(`
              SELECT id, company_id
              FROM company_subscriptions
              WHERE stripe_subscription_id=?
              ORDER BY id DESC
              LIMIT 1
            `).get(subscriptionId);
            if (row) {
              upsertBillingPayment(db, {
                companyId: row.company_id,
                companySubscriptionId: row.id,
                source: "stripe",
                providerEventType: event.type,
                paymentKind: "subscription",
                status: "failed",
                amount: fromStripeAmount(invoice?.amount_due || invoice?.amount_remaining || 0),
                currency: String(invoice?.currency || "eur"),
                payerName: String(invoice?.customer_name || ""),
                payerEmail: String(invoice?.customer_email || ""),
                referenceCode: String(invoice?.number || invoice?.id || ""),
                stripeSubscriptionId: subscriptionId,
                stripeInvoiceId: String(invoice?.id || ""),
                stripePaymentIntentId: String(invoice?.payment_intent || ""),
                failureReason: String(invoice?.last_finalization_error?.message || invoice?.status || "payment_failed"),
                notes: "Plată Stripe eșuată",
                metadata: {
                  hosted_invoice_url: invoice?.hosted_invoice_url || null
                }
              });

              db.prepare(`
                UPDATE company_subscriptions
                SET status='past_due',
                    last_payment_status='payment_failed',
                    updated_at=datetime('now')
                WHERE id=?
              `).run(row.id);
              syncCompanyStatusFromSubscription(db, row.company_id);
            }
          }
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object;
          const subscriptionId = String(invoice?.subscription || "");
          if (subscriptionId) {
            const row = db.prepare(`
              SELECT id, company_id
              FROM company_subscriptions
              WHERE stripe_subscription_id=?
              ORDER BY id DESC
              LIMIT 1
            `).get(subscriptionId);
            if (row) {
              upsertBillingPayment(db, {
                companyId: row.company_id,
                companySubscriptionId: row.id,
                source: "stripe",
                providerEventType: event.type,
                paymentKind: "subscription",
                status: "paid",
                amount: fromStripeAmount(invoice?.amount_paid || invoice?.amount_due || 0),
                currency: String(invoice?.currency || "eur"),
                payerName: String(invoice?.customer_name || ""),
                payerEmail: String(invoice?.customer_email || ""),
                referenceCode: String(invoice?.number || invoice?.id || ""),
                stripeSubscriptionId: subscriptionId,
                stripeInvoiceId: String(invoice?.id || ""),
                stripePaymentIntentId: String(invoice?.payment_intent || ""),
                paidAt: isoFromStripeTimestamp(invoice?.status_transitions?.paid_at || invoice?.created),
                notes: "Plată Stripe confirmată",
                metadata: {
                  hosted_invoice_url: invoice?.hosted_invoice_url || null
                }
              });
              const paymentId = findBillingPayment(db, {
                stripeInvoiceId: String(invoice?.id || ""),
                stripePaymentIntentId: String(invoice?.payment_intent || ""),
                stripeSubscriptionId: subscriptionId,
                companyId: row.company_id
              });
              if (paymentId) {
                maybeGenerateBillingInvoice(db, paymentId, { livemode: invoice?.livemode ? 1 : 0 });
              }

              db.prepare(`
                UPDATE company_subscriptions
                SET status='active',
                    last_payment_status='paid',
                    updated_at=datetime('now')
                WHERE id=?
              `).run(row.id);
              syncCompanyStatusFromSubscription(db, row.company_id);
            }
          }
          break;
        }
        default:
          break;
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook handling failed:", error?.message || error);
      return res.status(500).send("Webhook handler failed");
    }
  });
}

export function registerBillingRoutes(app, { db, requireAuth, requireRole, getSetting, refreshSessionCompanyAccess }) {
  const stripe = createStripeClient();

  app.get("/billing/checkout", requireAuth, requireRole("admin"), async (req, res) => {
    const settingsHref = settingsReturnHref(req);
    if (!stripeConfigured() || !stripe) {
      return res.status(400).type("html").send(renderBillingResult("Stripe nu este configurat încă pe server.", settingsHref));
    }

    const companyId = Number(req.session?.user?.company_id || 0);
    const email = String(req.session?.user?.email || "").trim().toLowerCase();
    const subscription = latestSubscriptionRow(db, companyId);
    if (!companyId || !subscription) {
      return res.status(404).type("html").send(renderBillingResult("Nu am găsit abonamentul companiei.", settingsHref));
    }

    try {
      const customerId = await ensureStripeCustomer(db, stripe, companyId, email);
      const currency = String(process.env.STRIPE_CURRENCY || subscription.billing_currency || "eur").toLowerCase();
      const successUrl = `${appBaseUrl(req)}/billing/success?session_id={CHECKOUT_SESSION_ID}${wantsNexoraReturn(req) ? "&return_to=nexora" : ""}`;
      const cancelUrl = `${appBaseUrl(req)}${wantsNexoraReturn(req) ? "/nexora/settings?tab=subscription&billing=cancelled" : "/setari?billing=cancelled"}`;
      const unitAmount = toStripeAmount(subscription.price_monthly || 0);
      const quantity = planChargeQuantity(subscription, subscription.seats_used || 1);
      const estimatedAmount = planChargeAmount(subscription, subscription.seats_used || 1);
      if (!unitAmount) {
        return res.status(400).type("html").send(renderBillingResult("Planul selectat nu are preț lunar configurat.", settingsHref));
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customerId,
        client_reference_id: String(companyId),
        metadata: {
          company_id: String(companyId),
          subscription_id: String(subscription.id),
          plan_code: String(subscription.plan_code || ""),
          initiated_by_user_id: String(req.session?.user?.id || ""),
          initiated_by_email: email
        },
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: unitAmount,
              recurring: { interval: "month" },
              product_data: {
                name: `MiniCRM ${subscription.plan_name || subscription.plan_code || "Subscription"}`,
                description: String(subscription.pricing_model || "flat").trim().toLowerCase() === "per_user"
                  ? `Abonament lunar pentru ${quantity} utilizatori activi`
                  : `Abonament lunar pentru ${subscription.plan_name || "plan activ"}`
              }
            },
            quantity
          }
        ]
      });

      db.prepare(`
        UPDATE company_subscriptions
        SET stripe_checkout_session_id=?,
            billing_currency=?,
            billing_email=?,
            updated_at=datetime('now')
        WHERE id=?
      `).run(
        session.id,
        currency,
        email || null,
        subscription.id
      );

      upsertBillingPayment(db, {
        companyId,
        companySubscriptionId: subscription.id,
        source: "stripe",
        providerEventType: "checkout.session.created",
        paymentKind: "subscription",
        status: "initiated",
        amount: Number(estimatedAmount || 0),
        currency,
        payerEmail: email,
        referenceCode: session.id,
        stripeCheckoutSessionId: session.id,
        createdByUserId: Number(req.session?.user?.id || 0) || null,
        createdByEmail: email,
        metadata: {
          company_id: companyId,
          subscription_id: subscription.id,
          plan_code: subscription.plan_code || ""
        }
      });

      return res.redirect(session.url);
    } catch (error) {
      console.error("Stripe checkout create failed:", error?.message || error);
      return res.status(500).type("html").send(renderBillingResult(`Nu am putut crea sesiunea Stripe: ${error?.message || "eroare necunoscută"}`, settingsHref));
    }
  });

  app.get("/billing/success", requireAuth, async (req, res) => {
    const settingsHref = settingsReturnHref(req);
    const stripeClient = createStripeClient();
    const sessionId = String(req.query?.session_id || "");
    if (!stripeClient || !sessionId) {
      return res.type("html").send(renderBillingResult("Plata a fost finalizată, dar sesiunea Stripe nu a putut fi verificată.", settingsHref));
    }

    try {
      const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"]
      });
      const companyId = Number(req.session?.user?.company_id || 0);
      if (companyId && Number(session?.metadata?.company_id || 0) === companyId) {
        const subscription = session.subscription;
        if (subscription && typeof subscription === "object") {
          updateSubscriptionFromStripe(db, subscription);
        }
        refreshSessionCompanyAccess(req);
      }
      return res.type("html").send(renderBillingResult("Plata a fost confirmată. Abonamentul companiei a fost sincronizat cu Stripe.", settingsHref));
    } catch (error) {
      console.error("Stripe success sync failed:", error?.message || error);
      return res.type("html").send(renderBillingResult("Plata a fost finalizată, dar sincronizarea finală se va face prin webhook în câteva momente.", settingsHref));
    }
  });

  app.get("/billing/portal", requireAuth, requireRole("admin"), async (req, res) => {
    const settingsHref = settingsReturnHref(req);
    if (!stripeConfigured() || !stripe) {
      return res.status(400).type("html").send(renderBillingResult("Stripe nu este configurat încă pe server.", settingsHref));
    }

    const companyId = Number(req.session?.user?.company_id || 0);
    const company = db.prepare(`
      SELECT stripe_customer_id
      FROM companies
      WHERE id=?
    `).get(companyId);

    if (!company?.stripe_customer_id) {
      return res.type("html").send(renderBillingResult("Compania nu are încă un client Stripe activ. Finalizează mai întâi prima plată.", settingsHref));
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id,
        return_url: `${appBaseUrl(req)}${wantsNexoraReturn(req) ? "/nexora/settings?tab=subscription" : "/setari"}`
      });
      return res.redirect(session.url);
    } catch (error) {
      console.error("Stripe portal session failed:", error?.message || error);
      return res.status(500).type("html").send(renderBillingResult(`Nu am putut deschide portalul Stripe: ${error?.message || "eroare necunoscută"}`, settingsHref));
    }
  });

  app.get("/billing/status", requireAuth, (req, res) => {
    const companyId = Number(req.session?.user?.company_id || 0);
    const company = db.prepare(`
      SELECT id, name, stripe_customer_id
      FROM companies
      WHERE id=?
    `).get(companyId);
    const subscription = latestSubscriptionRow(db, companyId);

    res.json({
      stripe_configured: stripeConfigured(),
      stripe_webhook_configured: stripeWebhookConfigured(),
      company: company ? {
        id: company.id,
        name: company.name,
        stripe_customer_id: company.stripe_customer_id || null
      } : null,
      subscription: subscription ? {
        id: subscription.id,
        plan_name: subscription.plan_name,
        plan_code: subscription.plan_code,
        status: subscription.status,
        stripe_subscription_id: subscription.stripe_subscription_id || null,
        stripe_checkout_session_id: subscription.stripe_checkout_session_id || null,
        billing_currency: subscription.billing_currency || null,
        current_period_end: subscription.current_period_end || null,
        last_payment_status: subscription.last_payment_status || null
      } : null
    });
  });
}
