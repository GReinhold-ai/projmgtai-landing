// ─────────────────────────────────────────────────────────────────────────────
// pages/api/outreach/approve.ts
//
// POST /api/outreach/approve
//
// Finalizes a reviewed lead: stores the approved subject + body, schedules
// the send via SendGrid for the next optimal send window (Tue–Thu 7–8:30 AM
// recipient local time), and marks the lead as "approved" in Supabase.
//
// The actual send is handled by a separate SendGrid scheduled job — this
// route only queues. That separation means Gary can approve at midnight and
// emails still land at the right time.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";
import type { ApproveRequest, ApproveResponse, ErrorResponse } from "../../../types/outreach";

// ─── SendGrid client (only imported when key is available) ────────────────────
// Install: npm install @sendgrid/mail
// import sgMail from "@sendgrid/mail";
// sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// ─── Supabase client ──────────────────────────────────────────────────────────
// Install: npm install @supabase/supabase-js
// import { createClient } from "@supabase/supabase-js";
// const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// ─── Slack notifier ───────────────────────────────────────────────────────────
async function notifySlack(company: string, contact: string, scheduledFor: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `:white_check_mark: *Outreach approved* — ${company} (${contact})\nScheduled: ${scheduledFor}`,
    }),
  }).catch((e) => console.warn("[Slack notify] failed:", e));
}

// ─── Send window calculator ───────────────────────────────────────────────────
// Returns the next Tue/Wed/Thu at 7:30 AM in the recipient's timezone.
// Falls back to UTC if timezone is unknown.
function nextSendWindow(recipientTimezone = "America/Los_Angeles"): Date {
  const now = new Date();

  // Walk forward up to 7 days to find the next Tue (2), Wed (3), or Thu (4)
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + daysAhead);

    const localDow = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: recipientTimezone,
    }).format(candidate);

    if (["Tue", "Wed", "Thu"].includes(localDow)) {
      // Set to 7:30 AM in recipient timezone — approximate via UTC offset
      // In production use a proper timezone library (date-fns-tz or luxon)
      const send = new Date(candidate);
      send.setUTCHours(15, 30, 0, 0); // 7:30 AM PT ≈ 15:30 UTC (adjust per recipient)
      if (send > now) return send;
    }
  }

  // Fallback: 24h from now
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(body: unknown): body is ApproveRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.lead_id       === "string" && b.lead_id.trim().length > 0 &&
    typeof b.subject       === "string" && b.subject.trim().length > 0 &&
    typeof b.body          === "string" && b.body.trim().length > 50 &&
    typeof b.contact_email === "string" && b.contact_email.includes("@")
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApproveResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  if (!validate(req.body)) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid fields. Required: lead_id, subject, body, contact_email.",
      code: "VALIDATION_ERROR",
    });
  }

  const { lead_id, subject, body, contact_email, contact_name } = req.body as ApproveRequest;

  try {
    const sendAt = nextSendWindow();
    const sendAtISO = sendAt.toISOString();

    // ── 1. Queue in SendGrid ──────────────────────────────────────────────────
    // Uncomment when SENDGRID_API_KEY is configured:
    //
    // await sgMail.send({
    //   to:           contact_email,
    //   from: {
    //     email:      "outreach@projmgt.ai",
    //     name:       "Gary Reinhold | ProjMgt.AI",
    //   },
    //   replyTo:      "gary@projmgt.ai",
    //   subject,
    //   text:         body,
    //   sendAt:       Math.floor(sendAt.getTime() / 1000), // Unix timestamp for scheduled send
    //   trackingSettings: {
    //     clickTracking:  { enable: true },
    //     openTracking:   { enable: true },
    //   },
    //   customArgs: {
    //     lead_id,          // lets the webhook route map events back to our DB record
    //   },
    // });

    // ── 2. Mark lead as approved in Supabase ─────────────────────────────────
    // Uncomment when Supabase is configured:
    //
    // const { error: dbError } = await supabase
    //   .from("leads")
    //   .update({
    //     status:            "approved",
    //     approved_subject:  subject,
    //     approved_body:     body,
    //     send_scheduled_for: sendAtISO,
    //     approved_at:       new Date().toISOString(),
    //   })
    //   .eq("id", lead_id);
    //
    // if (dbError) throw new Error(`Supabase update failed: ${dbError.message}`);

    // ── 3. Notify Gary via Slack ──────────────────────────────────────────────
    await notifySlack(
      lead_id,  // replace with company name once DB lookup is wired
      contact_name ?? contact_email,
      sendAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "short", timeStyle: "short" })
    );

    console.log(`[approve] Lead ${lead_id} queued → ${contact_email} at ${sendAtISO}`);

    return res.status(200).json({
      success: true,
      queued_at:           new Date().toISOString(),
      send_scheduled_for:  sendAtISO,
    });

  } catch (err: unknown) {
    console.error("[/api/outreach/approve] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({
      success: false,
      error:   `Approval failed: ${message}`,
      code:    "APPROVE_ERROR",
    });
  }
}
