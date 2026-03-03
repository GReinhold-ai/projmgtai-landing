// pages/api/checkout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

type Body = {
  plan?: "month" | "year";
  quantity?: number; // optional, default 1
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const {
    STRIPE_PRICE_PRO_MONTH,
    STRIPE_PRICE_PRO_YEAR,
    APP_BASE_URL = "http://localhost:3000",
  } = process.env;

  if (!STRIPE_PRICE_PRO_MONTH || !STRIPE_PRICE_PRO_YEAR) {
    return res.status(500).json({ error: "Price IDs not configured" });
  }

  const body = (req.body ?? {}) as Body;
  const plan = body.plan === "year" ? "year" : "month";
  const quantity = Number.isFinite(body.quantity) && (body.quantity as number) > 0 ? body.quantity! : 1;

  const priceId = plan === "year" ? STRIPE_PRICE_PRO_YEAR : STRIPE_PRICE_PRO_MONTH;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", // change to "payment" if you’re selling one-off items
      line_items: [{ price: priceId, quantity }],
      allow_promotion_codes: true,
      success_url: `${APP_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_BASE_URL}/cancel`,
      // Optional customer/account hints:
      // customer_email: "test@example.com",
      // metadata: { plan },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe] create checkout session error:", err?.message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
