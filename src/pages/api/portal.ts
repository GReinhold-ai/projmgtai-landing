import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { customerId, returnUrl } = req.body || {};
    if (!customerId) return res.status(400).json({ error: "Missing customerId" });

    const base =
      returnUrl ||
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_BASE_URL ||
      "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: base,
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Failed to create portal session" });
  }
}
