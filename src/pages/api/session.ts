import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "Missing session id" });

  try {
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items.data.price.product", "subscription"],
    });

    const li = session.line_items?.data?.[0];
    const price = li?.price || null;
    const product = (price?.product as Stripe.Product) || null;
    const recurring = price?.recurring || null;

    res.status(200).json({
      id: session.id,
      customer_email: session.customer_details?.email ?? null,
      productName: product?.name ?? null,
      interval: recurring?.interval ?? null,
      amount_total: session.amount_total ?? 0,
      currency: session.currency?.toUpperCase() ?? "USD",
      payment_status: session.payment_status,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      subscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Failed to fetch session" });
  }
}
