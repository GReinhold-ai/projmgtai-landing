// src/lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

export function getBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:3001";
}
