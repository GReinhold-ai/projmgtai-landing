// pages/api/process-upload.ts  v14.9.34
// Fix 1: Outlook em-dash garble — removed " - " separators, two-column table only
// Fix 2: CTA button missing in Outlook — added VML bulletproof button fallback
// Fix 3: "Parts List" added to workbook list (was missing from last send)
//
// Deploy to: pages/api/process-upload.ts AND src/pages/api/process-upload.ts

import type { NextApiRequest, NextApiResponse } from "next";

// -- Supabase REST helper --------------------------------------------------
async function supabaseInsert(table: string, record: Record<string, unknown>) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_ANON_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(record),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert failed: ${err}`);
  }
  return;
}

// -- Confirmation email ---------------------------------------------------
// Rules:
//   - ASCII only in template literals (no smart quotes, no em-dashes)
//   - Workbook list: two columns, NO separator character between them
//   - CTA button: VML bulletproof fallback so Outlook renders it
//   - reply_to: greinhold@rewmo.ai (gary@projmgt.ai M365 forward is broken)
async function sendConfirmationEmail(
  to: string,
  company: string,
  projectName: string
) {
  // Two-column rows: title left, description right, NO separator in between
  const workbookItems = [
    ["All Items", "Every millwork item extracted by room"],
    ["WBS Summary", "Cabinetry, countertops, shelving hierarchy"],
    ["Bid Checklist", "Blocking, hardware, ADA flagged per room"],
    ["RFI Log", "Missing scope, dims, and material gaps"],
    ["Parts List", "AWI 300 cut sheet with L x W x T per part"],
  ];

  const workbookRows = workbookItems.map(([title, desc]) =>
    `<tr>
      <td style="padding:5px 14px 5px 0;font-size:13px;font-weight:600;color:#0F0F0E;white-space:nowrap;vertical-align:top;">${title}</td>
      <td style="padding:5px 0;font-size:13px;color:#5A5850;vertical-align:top;">${desc}</td>
    </tr>`
  ).join("");

  // VML bulletproof button — renders in Outlook AND modern clients
  const ctaUrl = "https://www.projmgt.ai/scope-extractor";
  const ctaButton = `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="${ctaUrl}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="7%"
  stroke="f" fillcolor="#B8860B">
  <w:anchorlock/>
  <center style="color:#FAFAF8;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">
    Run Extraction
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${ctaUrl}"
  style="background:#B8860B;border-radius:4px;color:#ffffff;display:inline-block;
    font-family:Arial,sans-serif;font-size:14px;font-weight:700;
    line-height:44px;text-align:center;text-decoration:none;
    width:200px;-webkit-text-size-adjust:none;mso-hide:all;">
  Run Extraction
</a>
<!--<![endif]-->`;

  const html = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0"
          style="background:#ffffff;border:1px solid #E8E6E1;border-radius:4px;">

          <tr><td height="3" bgcolor="#B8860B" style="font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:32px 40px 20px;background:#ffffff;">
              <p style="margin:0 0 6px 0;font-family:'Courier New',Courier,monospace;font-size:10px;
                letter-spacing:3px;color:#B8860B;text-transform:uppercase;">
                // ProjMgt.AI
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#0F0F0E;line-height:1.3;
                font-family:Arial,sans-serif;">
                Your extraction<br>link is ready.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="1" bgcolor="#E8E6E1" style="font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 0 40px;">
              <p style="margin:0 0 16px 0;font-size:14px;color:#5A5850;line-height:1.7;
                font-family:Arial,sans-serif;">
                Hi ${company},
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;color:#5A5850;line-height:1.7;
                font-family:Arial,sans-serif;">
                We received your upload for
                <strong style="color:#0F0F0E;">${projectName}</strong>.
                Click below to run your extraction. It takes about 2 minutes.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 40px 24px 40px;">
              ${ctaButton}
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 8px 40px;">
              <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;
                letter-spacing:2px;color:#8A8880;text-transform:uppercase;">
                What is in your workbook
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:#F5F3EE;border:1px solid #E8E6E1;border-radius:3px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${workbookRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 40px 24px 40px;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#8A8880;line-height:1.7;
                font-family:Arial,sans-serif;">
                Check spam? Reply to this email and we will resend.
              </p>
              <p style="margin:0;font-size:13px;color:#8A8880;line-height:1.7;
                font-family:Arial,sans-serif;">
                Questions? Email
                <a href="mailto:gary@projmgt.ai" style="color:#B8860B;text-decoration:none;">
                  gary@projmgt.ai
                </a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="1" bgcolor="#E8E6E1" style="font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 40px;">
              <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:10px;
                color:#C8C6C0;letter-spacing:1px;line-height:1.8;">
                // PROJMGT.AI - CENTRIV AI - FULLERTON CA<br>
                // YOU ARE RECEIVING THIS BECAUSE YOU SUBMITTED A PLAN SET
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || "outreach@projmgt.ai",
        name: "Gary Reinhold | ProjMgt.AI",
      },
      reply_to: { email: "greinhold@rewmo.ai" },
      subject: `Your millwork extraction is ready - ${projectName}`,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid failed: ${err}`);
  }
}

// -- Feedback notification email -----------------------------------------
async function sendFeedbackNotification(
  fromEmail: string,
  projectName: string,
  feedback: { rating?: number; note?: string; items?: number; rooms?: number }
) {
  const stars = "★".repeat(feedback.rating || 0) + "☆".repeat(5 - (feedback.rating || 0));
  const label = ["", "Poor", "Fair", "Good", "Great", "Perfect"][feedback.rating || 0] || "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8;padding:32px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0"
        style="background:#ffffff;border:1px solid #E8E6E1;border-radius:4px;">
        <tr><td height="3" bgcolor="#B8860B" style="font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 32px 8px 32px;">
          <p style="margin:0 0 4px 0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:#B8860B;text-transform:uppercase;">
            // ProjMgt.AI Feedback
          </p>
          <h2 style="margin:0;font-size:20px;font-weight:600;color:#0F0F0E;">
            ${stars} ${label}
          </h2>
        </td></tr>
        <tr><td style="padding:12px 32px 20px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F3EE;border:1px solid #E8E6E1;border-radius:3px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#5A5850;">
                <strong style="color:#0F0F0E;">From:</strong> ${fromEmail}
              </p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#5A5850;">
                <strong style="color:#0F0F0E;">Project:</strong> ${projectName}
              </p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#5A5850;">
                <strong style="color:#0F0F0E;">Extraction:</strong> ${feedback.rooms || "?"} rooms, ${feedback.items || "?"} items
              </p>
              ${feedback.note ? `<p style="margin:8px 0 0 0;font-size:13px;color:#0F0F0E;border-top:1px solid #E8E6E1;padding-top:10px;">
                "${feedback.note}"
              </p>` : ""}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: "greinhold@rewmo.ai" }] }],
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || "outreach@projmgt.ai",
        name: "ProjMgt.AI Feedback",
      },
      reply_to: { email: fromEmail },
      subject: `[Feedback] ${stars} ${label} - ${projectName}`,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid feedback failed: ${err}`);
  }
}

// -- Main handler ---------------------------------------------------------
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    email,
    company,
    project_name: projectName,
    project_type: projectType,
    blob_urls: blobUrls,
    feedback,
  } = req.body || {};

  if (!email || !company) {
    return res.status(400).json({ error: "Email and company are required" });
  }

  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const resolvedProjectName = projectName || `${company} Project`;

  // Log to Supabase — simplified to existing columns only
  try {
    await supabaseInsert("uploads", {
      user_email: email,
      company,
      project_type: projectType || "",
    });
  } catch (err) {
    console.error("[process-upload] Supabase log failed:", err);
  }

  // Send confirmation email (skip for feedback-only submissions)
  if (projectType !== "feedback") {
    try {
      await sendConfirmationEmail(email, company, resolvedProjectName);
    } catch (err) {
      console.error("[process-upload] Confirmation email failed:", err);
    }
  }

  // Send feedback notification to Gary and log
  if (feedback) {
    console.log(`[process-upload] Feedback from ${email}:`, JSON.stringify(feedback));
    try {
      await sendFeedbackNotification(email, resolvedProjectName, feedback);
    } catch (err) {
      console.error("[process-upload] Feedback notification failed:", err);
    }
  }

  // Log blob URLs
  if (blobUrls && blobUrls.length > 0) {
    console.log(`[process-upload] ${uploadId}: ${blobUrls.length} blob URLs logged`);
  }

  return res.status(200).json({
    ok: true,
    upload_id: uploadId,
    message: "Received.",
  });
}
