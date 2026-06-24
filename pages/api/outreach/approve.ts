// ─────────────────────────────────────────────────────────────────────────────
// pages/api/outreach/approve.ts
//
// POST /api/outreach/approve
//
// Finalizes a reviewed lead: checks suppression, queues a scheduled SendGrid
// send (Tue–Thu 7:30 AM recipient local time), and marks the lead as
// "approved" in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";
import sgMail from "@sendgrid/mail";
import { createClient } from "@supabase/supabase-js";
import type { ApproveRequest, ApproveResponse, ErrorResponse } from "../../../types/outreach";

// ─── Clients ──────────────────────────────────────────────────────────────────
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// Admin gate: shared secret required to invoke this internal CRM endpoint.
const ADMIN_SECRET = process.env.OUTREACH_ADMIN_SECRET;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service_role uses BYPASSRLS - bypasses all policies regardless of RLS state. Least-privilege demotion tracked as P2.2c.
);

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
function nextSendWindow(recipientTimezone = "America/Los_Angeles"): Date {
  const now = new Date();

  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + daysAhead);

    const localDow = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: recipientTimezone,
    }).format(candidate);

    if (["Tue", "Wed", "Thu"].includes(localDow)) {
      const send = new Date(candidate);
      send.setUTCHours(15, 30, 0, 0); // 7:30 AM PT ≈ 15:30 UTC
      if (send > now) return send;
    }
  }

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
  // Admin-secret gate: reject unless the caller presents the shared secret.
  // Fail-closed: if OUTREACH_ADMIN_SECRET is unset, the endpoint refuses all calls.
  const provided = req.headers["x-admin-secret"];
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    console.warn("[approve] rejected - missing or invalid admin secret");
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

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
    const sendAt    = nextSendWindow();
    const sendAtISO = sendAt.toISOString();

    // ── 1. Check suppression list ─────────────────────────────────────────────
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("email")
      .eq("email", contact_email)
      .maybeSingle();

    if (suppressed) {
      console.warn(`[approve] ${contact_email} is suppressed — aborting`);
      return res.status(409).json({
        success: false,
        error: `${contact_email} is on the suppression list.`,
        code: "SUPPRESSED",
      });
    }

    // ── 2. Fetch company name for Slack notification ───────────────────────────
    const { data: lead } = await supabase
      .from("leads")
      .select("company")
      .eq("id", lead_id)
      .maybeSingle();

    const companyName = lead?.company ?? lead_id;

    // ── 3. Queue in SendGrid (scheduled send) ─────────────────────────────────
    await sgMail.send({
      to:      contact_email,
      from: {
        email: "outreach@projmgt.ai",
        name:  "Gary Reinhold | ProjMgt.AI",
      },
      replyTo: "gary@projmgt.ai",
      subject,
      text:    body,
      sendAt:  Math.floor(sendAt.getTime() / 1000), // Unix timestamp
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking:  { enable: true },
      },
      customArgs: {
        lead_id,  // webhook uses this to map SendGrid events back to the DB row
      },
    });

    // ── 4. Mark lead as approved in Supabase ──────────────────────────────────
    const { error: dbError } = await supabase
      .from("leads")
      .update({
        status:             "approved",
        approved_subject:   subject,
        approved_body:      body,
        send_scheduled_for: sendAtISO,
        approved_at:        new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (dbError) throw new Error(`Supabase update failed: ${dbError.message}`);

    // ── 5. Notify Gary via Slack ──────────────────────────────────────────────
    await notifySlack(
      companyName,
      contact_name ?? contact_email,
      sendAt.toLocaleString("en-US", {
        timeZone:  "America/Los_Angeles",
        dateStyle: "short",
        timeStyle: "short",
      })
    );

    console.log(`[approve] Lead ${lead_id} (${companyName}) queued → ${contact_email} at ${sendAtISO}`);

    return res.status(200).json({
      success:            true,
      queued_at:          new Date().toISOString(),
      send_scheduled_for: sendAtISO,
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
