// pages/api/process-upload.ts
// Receives multipart FormData from /upload page
// 1. Writes upload record to Supabase `uploads` table
// 2. Sends confirmation email via SendGrid immediately
// 3. Fires extraction to api.projmgt.ai async (fire-and-forget)
// 4. Returns 200 immediately so UI advances to done state
//
// Deploy to: pages/api/process-upload.ts AND src/pages/api/process-upload.ts

import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { Fields, Files } from "formidable";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false, // Required for formidable multipart parsing
  },
};

// â”€â”€ Supabase REST helper (no SDK needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function supabaseInsert(table: string, record: Record<string, unknown>) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_ANON_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(record),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert failed: ${err}`);
  }
  return res.json();
}

// â”€â”€ SendGrid confirmation email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendConfirmationEmail(to: string, company: string, projectName: string) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0b0d14;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d14;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2130;border-radius:4px;overflow:hidden;">

          <!-- Gold top bar -->
          <tr><td height="2" style="background:linear-gradient(90deg,#7a5010,#c8922a,#e8b84b,#c8922a,#7a5010);font-size:0;">&nbsp;</td></tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;">
              <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.2em;color:#c8922a;text-transform:uppercase;">// ProjMgt.AI</p>
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#f0ede8;line-height:1.1;">
                Your extraction<br>link is ready.
              </h1>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background:#1e2130;"></div></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 40px;">
              <p style="margin:0 0 20px;font-size:14px;color:#9098a8;line-height:1.7;">
                Hi ${company},<br><br>
                We've received your upload for <strong style="color:#f0ede8;">${projectName}</strong> and ready for you to run. Click the button below -- it takes about 2 minutes.            <!-- What's in the workbook -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#141720;border:1px solid #1e2130;border-radius:3px;margin-bottom:24px;">
                <tr><td style="padding:14px 16px 8px;">
                  <p style="margin:0 0 10px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;color:#454858;text-transform:uppercase;">What's in your workbook</p>
                </td></tr>
                ${[
                  ["All Items tab", "Every millwork item extracted by room"],
                  ["WBS Summary", "Trade hierarchy - cabinetry, countertops, shelving"],
                  ["Bid Checklist", "Blocking, hardware, ADA, finish -- flagged by roomy room"],
                  ["RFI Log", "Missing scope, dims, and material gaps"],
                ].map(([title, desc]) => `
                <tr><td style="padding:4px 16px 10px;">
                  <p style="margin:0;font-size:13px;color:#9098a8;">
                    <strong style="color:#f0ede8;">${title}</strong> â€” ${desc}
                  </p>
                </td></tr>`).join("")}
                <tr><td height="6"></td></tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#5a6070;line-height:1.7;">
                Didn't get it? Check your spam folder or reply to this email and we'll resend.
              </p>
              <p style="margin:0;font-size:13px;color:#5a6070;line-height:1.7;">
                Questions? Reply here or email 
                <a href="mailto:gary@projmgt.ai" style="color:#c8922a;">gary@projmgt.ai</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background:#1e2130;"></div></td></tr>
          <tr>
            <td style="padding:20px 40px;">
              <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;color:#2a2d3a;letter-spacing:0.08em;">
                // PROJMGT.AI Â· CENTRIV AI Â· FULLERTON CA<br>
                // YOU'RE RECEIVING THIS BECAUSE YOU SUBMITTED A PLAN SET
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
      reply_to: { email: "gary@projmgt.ai" },
      subject: `Your millwork extraction is running - ${projectName}`,   content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid failed: ${err}`);
  }
}

// â”€â”€ Fire-and-forget extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Calls api.projmgt.ai with the uploaded files â€” does NOT await response
// Updates Supabase extractions table when done (handled by background fetch)
async function fireExtraction(
  uploadId: string,
  filePaths: string[],
  fileTags: Record<string, string>,
  metadata: { email: string; company: string; projectName: string; projectType: string }
) {
  const form = new FormData();
  form.append("upload_id", uploadId);
  form.append("email", metadata.email);
  form.append("company", metadata.company);
  form.append("project_name", metadata.projectName);
  form.append("project_type", metadata.projectType);
  form.append("supabase_url", process.env.SUPABASE_URL!);
  form.append("supabase_key", process.env.SUPABASE_ANON_KEY!);
  form.append("sendgrid_key", process.env.SENDGRID_API_KEY!);
  form.append("sendgrid_from", process.env.SENDGRID_FROM_EMAIL || "outreach@projmgt.ai");

  for (const filePath of filePaths) {
    const filename = path.basename(filePath);
    const tag = fileTags[filename] || "Plans";
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer], { type: "application/pdf" });
    form.append("files", blob, filename);
    form.append(`tag_${filename}`, tag);
  }

  // Fire and forget â€” no await, no timeout handling needed here
  fetch(`${process.env.EXTRACTION_API_URL}/extract-and-deliver`, {
    method: "POST",
    body: form,
  }).catch((err) => {
    console.error(`[process-upload] Extraction fire failed for ${uploadId}:`, err);
  });
}

// â”€â”€ Main handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse multipart form
  const form = formidable({
    maxFileSize: 150 * 1024 * 1024, // 150MB total
    maxFiles: 8,
    keepExtensions: true,
  });

  let fields: Fields;
  let files: Files;

  try {
    [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
      form.parse(req, (err, f, fi) => {
        if (err) reject(err);
        else resolve([f, fi]);
      });
    });
  } catch (err) {
    console.error("[process-upload] Form parse error:", err);
    return res.status(400).json({ error: "Failed to parse upload" });
  }

  // Extract scalar fields
  const email       = Array.isArray(fields.email)        ? fields.email[0]        : fields.email        || "";
  const company     = Array.isArray(fields.company)      ? fields.company[0]      : fields.company      || "";
  const projectType = Array.isArray(fields.project_type) ? fields.project_type[0] : fields.project_type || "";
  const projectName = Array.isArray(fields.project_name) ? fields.project_name[0] : fields.project_name || `${company} Project`;

  if (!email || !company) {
    return res.status(400).json({ error: "Email and company are required" });
  }

  // Build file list and tag map
  const uploadedFiles = Array.isArray(files.files) ? files.files : files.files ? [files.files] : [];
  const filePaths = uploadedFiles.map((f) => f.filepath);
  const fileNames = uploadedFiles.map((f) => f.originalFilename || path.basename(f.filepath));

  const fileTags: Record<string, string> = {};
  for (const filename of fileNames) {
    const tagKey = `tag_${filename}`;
    const tagVal = Array.isArray(fields[tagKey]) ? fields[tagKey]![0] : fields[tagKey];
    fileTags[filename] = tagVal || "Plans";
  }

  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 1. Log to Supabase uploads table
  try {
    await supabaseInsert("uploads", {
      id: uploadId,
      user_email: email,
      company,
      project_type: projectType,
      project_name: projectName,
      file_count: uploadedFiles.length,
      file_names: fileNames,
      file_tags: fileTags,
      status: "pending",
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[process-upload] Supabase log failed:", err);
    // Non-fatal â€” continue even if logging fails
  }

  // 2. Send confirmation email immediately
  try {
    await sendConfirmationEmail(email, company, projectName);
  } catch (err) {
    console.error("[process-upload] Confirmation email failed:", err);
    // Non-fatal â€” don't block the response
  }

  // 3. Fire extraction async (no await)
  if (filePaths.length > 0) {
    fireExtraction(uploadId, filePaths, fileTags, { email, company, projectName, projectType });
  }

  // 4. Return immediately â€” UI advances to done state
  return res.status(200).json({
    ok: true,
    upload_id: uploadId,
    message: "Upload received. Results will be emailed shortly.",
  });
}
