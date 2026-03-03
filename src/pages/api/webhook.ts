// src/pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { buffer } from "micro";

/**
 * We must read the raw request body so Stripe's signature can be verified.
 * Next.js body parsing must be disabled for this route.
 */
export const config = {
  api: { bodyParser: false },
};

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-07-30.basil";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  // Fail fast at boot if the secret key isn't set
  throw new Error("Missing STRIPE_SECRET_KEY in environment");
}

const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });

/**
 * Prefer the Stripe CLI secret in dev; fall back to the Dashboard destination
 * secret in prod (Vercel). Only ONE should be set per environment.
 */
function getWebhookSecret(): string | null {
  const cli = process.env.STRIPE_WEBHOOK_SECRET_CLI?.trim();
  if (cli) return cli;
  const prod = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (prod) return prod;
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const whSecret = getWebhookSecret();
  if (!whSecret) {
    console.error("[webhook] No webhook secret configured (CLI or PROD).");
    return res.status(500).send("Webhook secret not configured");
  }

  let event: Stripe.Event;

  try {
    const raw = await buffer(req); // raw Buffer (not parsed JSON)
    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) {
      return res.status(400).send("Missing Stripe signature header");
    }
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err: any) {
    console.error("[webhook] Signature verification failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message ?? "invalid signature"}`);
  }

  // Minimal, safe logging
  console.log(`[stripe] ${event.id} ${event.type}`);

  try {
    switch (event.type) {
      /**
       * Customer completed Checkout. Create/attach your internal account,
       * persist stripeCustomerId and subscriptionId, and grant access.
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Fetch expanded session for convenience (product/price/subscription)
        const full = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items.data.price.product", "subscription"],
        });

        const customerId =
          typeof full.customer === "string" ? full.customer : full.customer?.id || null;

        const subscriptionId =
          typeof full.subscription === "string"
            ? full.subscription
            : full.subscription?.id || null;

        const line = full.line_items?.data?.[0];
        const price = line?.price || null;
        const product = (price?.product as Stripe.Product) || null;
        const interval = (price?.recurring as Stripe.Price.Recurring)?.interval || null;

        // TODO: Idempotently upsert your user/billing record keyed by event.id
        // save({ customerId, subscriptionId, plan: product?.name, priceId: price?.id, interval })

        console.log("[billing] checkout.session.completed", {
          sessionId: full.id,
          email: full.customer_details?.email,
          customerId,
          subscriptionId,
          productName: product?.name ?? null,
          priceId: price?.id ?? null,
          interval,
          amountTotal: full.amount_total,
          currency: full.currency,
        });
        break;
      }

      /**
       * An invoice for a subscription was successfully paid.
       * Good time to extend entitlements / mark payment status.
       */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("[billing] invoice.payment_succeeded", {
          invoiceId: invoice.id,
          customer: invoice.customer,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          subscription: invoice.subscription,
        });
        // TODO: Idempotently mark latest period active
        break;
      }

      /**
       * Stripe is notifying you of an upcoming renewal (useful for reminders).
       */
      case "invoice.upcoming": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("[billing] invoice.upcoming", {
          customer: invoice.customer,
          customerEmail: invoice.customer_email,
          amountDue: invoice.amount_due,
          nextPaymentAttempt: invoice.next_payment_attempt,
        });
        // TODO: Optional email reminder
        break;
      }

      /**
       * The subscription was canceled (user action or dunning).
       * Revoke access at the end of period or immediately, per your policy.
       */
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        console.log("[billing] subscription.deleted", {
          subscriptionId: sub.id,
          customer: sub.customer,
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        // TODO: Idempotently set entitlement end / downgrade user
        break;
      }

      default: {
        // Handle other events if/when you need them
        // console.log(`[stripe] Unhandled event type: ${event.type}`);
        break;
      }
    }
  } catch (err: any) {
    console.error("[webhook] Handler error:", err?.message);
    return res.status(500).send("Webhook handler failed");
  }

  // Always acknowledge receipt so Stripe doesn't retry unnecessarily.
  return res.status(200).json({ received: true });
}
