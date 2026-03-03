import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing session id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items.data.price.product", "subscription"],
    });

    const li = session.line_items?.data?.[0];
    const price = li?.price!;
    const product = (price?.product as Stripe.Product | null) || null;

    res.status(200).json({
      id: session.id,
      payment_status: session.payment_status,
      mode: session.mode,
      currency: price?.currency,
      unit_amount: price?.unit_amount, // in cents
      interval: (price?.recurring as any)?.interval ?? null,
      product_name: product ? product.name : null,
    });
  } catch (e: any) {
    console.error("session fetch error:", e?.message);
    res.status(500).json({ error: "Failed to fetch session" });
  }
}
