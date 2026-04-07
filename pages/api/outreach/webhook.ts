// ─────────────────────────────────────────────────────────────────────────────
// pages/api/outreach/webhook.ts
//
// POST /api/outreach/webhook
//
// Receives SendGrid Event Webhook payloads and updates lead status in Supabase.
// Configure this URL in SendGrid: Settings → Mail Settings → Event Webhook
// Recommended events to enable: delivered, open, click, bounce, unsubscribe
//
// IMPORTANT: Add SENDGRID_WEBHOOK_SECRET to .env.local and enable signed
// webhooks in SendGrid to verify payloads — see verifySignature() below.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

// ─── SendGrid event types we care about ──────────────────────────────────────
type SGEvent =
  | "delivered"
  | "open"
  | "click"
  | "bounce"
  | "unsubscribe"
  | "spamreport"
  | "deferred";

interface SendGridEventPayload {
  event:      SGEvent;
  email:      string;
  timestamp:  number;
  lead_id?:   string;    // our custom_arg — set at send time
  url?:       string;    // for click events
  reason?:    string;    // for bounce events
  sg_event_id: string;
}

// ─── Slack hot-lead alert ─────────────────────────────────────────────────────
async function alertHotLead(email: string, leadId: string, event: SGEvent) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const emoji = event === "click" ? ":rocket:" : ":email:";
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${emoji} *HOT LEAD — ${event.toUpperCase()}* | ${email} | lead_id: ${leadId}\n:point_right: Follow up now.`,
    }),
  }).catch((e) => console.warn("[Slack hot-lead]", e));
}

// ─── Signature verification ───────────────────────────────────────────────────
// SendGrid signed webhooks include X-Twilio-Email-Event-Webhook-Signature.
// Enable in SendGrid → Settings → Mail Settings → Signed Event Webhook.
function verifySignature(req: NextApiRequest, rawBody: string): boolean {
  const secret = process.env.SENDGRID_WEBHOOK_SECRET;
  if (!secret) {
    // Skip verification in dev — warn loudly in prod
    if (process.env.NODE_ENV === "production") {
      console.error("[webhook] SENDGRID_WEBHOOK_SECRET not set — skipping verification (INSECURE)");
    }
    return true;
  }

  const signature  = req.headers["x-twilio-email-event-webhook-signature"] as string;
  const timestamp  = req.headers["x-twilio-email-event-webhook-timestamp"] as string;
  if (!signature || !timestamp) return false;

  const payload  = timestamp + rawBody;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── Status mapper ────────────────────────────────────────────────────────────
function eventToStatus(event: SGEvent): string | null {
  switch (event) {
    case "delivered":    return "sent";
    case "open":         return "opened";
    case "click":        return "clicked";
    case "bounce":       return "bounced";
    case "unsubscribe":  return "unsubscribed";
    case "spamreport":   return "spam";
    default:             return null;
  }
}

// ─── Disable body parsing — we need raw body for signature verification ───────
export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end",  () => resolve(data));
    req.on("error", reject);
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let rawBody: string;
  let events: SendGridEventPayload[];

  try {
    rawBody = await readRawBody(req);
    events  = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (!verifySignature(req, rawBody)) {
    console.warn("[webhook] Signature verification failed — rejecting");
    return res.status(403).json({ error: "Signature mismatch" });
  }

  // Process each event — SendGrid batches multiple events per request
  for (const event of events) {
    const newStatus = eventToStatus(event.event);
    if (!newStatus || !event.lead_id) continue;

    console.log(`[webhook] ${event.event} | lead: ${event.lead_id} | ${event.email}`);

    // ── Update Supabase ───────────────────────────────────────────────────────
    // Uncomment when Supabase is configured:
    //
    // await supabase
    //   .from("leads")
    //   .update({
    //     status:           newStatus,
    //     [`${event.event}_at`]: new Date(event.timestamp * 1000).toISOString(),
    //   })
    //   .eq("id", event.lead_id);

    // ── Alert on high-value engagement ───────────────────────────────────────
    if (event.event === "click" || event.event === "open") {
      await alertHotLead(event.email, event.lead_id, event.event);
    }

    // ── Add to SendGrid suppression on unsubscribe/spam ───────────────────────
    if (event.event === "unsubscribe" || event.event === "spamreport") {
      console.log(`[webhook] Suppressing ${event.email} — ${event.event}`);
      // SendGrid handles this automatically when Global Unsubscribe is enabled
      // Add to your own suppression table here for double-safety:
      // await supabase.from("suppressions").insert({ email: event.email, reason: event.event });
    }
  }

  // SendGrid expects a 200 — any other status triggers retries
  return res.status(200).json({ received: events.length });
}
