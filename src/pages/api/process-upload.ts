// pages/api/process-upload.ts  v14.9.31
// Fix 1: Supabase insert simplified to existing columns only (clears PGRST204)
// Fix 2: sendConfirmationEmail rewritten from scratch, ASCII only (no Unicode/em-dash)
// Fix 3: reply_to changed to greinhold@rewmo.ai (gary@projmgt.ai forward is broken)
//
// Deploy to: pages/api/process-upload.ts AND src/pages/api/process-upload.ts

import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { Fields, Files } from "formidable";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

// -- Confirmation email (ASCII only, no Unicode) ---------------------------
// Rewritten from scratch to avoid PowerShell UTF-8 encoding issues.
// Rules: no em-dash, no smart quotes, no bullet points, no emoji.
// Use plain hyphens (-) and straight ASCII only.
async function sendConfirmationEmail(
  to: string,
  company: string,
  projectName: string
) {
  const workbookItems = [
    ["All Items", "Every millwork item extracted, organized by room"],
    ["WBS Summary", "Trade hierarchy - cabinetry, countertops, shelving"],
    ["Bid Checklist", "Blocking, hardware, ADA, and finish - flagged by room"],
    ["RFI Log", "Missing scope, dimensions, and material gaps auto-detected"],
    ["Parts List", "AWI 300 cut sheet - part, qty, L x W x T, material"],
  ];

  const workbookRows = workbookItems
    .map(
      ([title, desc]) =>
        `<tr>
          <td style="padding:6px 16px 6px 0;font-size:13px;font-weight:600;color:#f0ede8;white-space:nowrap;">${title}</td>
          <td style="padding:6px 0;font-size:13px;color:#9098a8;">${desc}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0b0d14;font-family:Helvetica Neue,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d14;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#0f1117;border:1px solid #1e2130;border-radius:4px;">

          <tr><td height="3" style="background:#c8922a;font-size:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:32px 40px 20px;">
              <p style="margin:0 0 6px;font-family:Courier New,monospace;font-size:10px;
                letter-spacing:0.2em;color:#c8922a;text-transform:uppercase;">
                // ProjMgt.AI
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#f0ede8;line-height:1.2;">
                Your extraction link is ready.
              </h1>
            </td>
          </tr>

          <tr><td style="padding:0 40px;">
            <div style="height:1px;background:#1e2130;"></div>
          </td></tr>

          <tr>
            <td style="padding:24px 40px;">
              <p style="margin:0 0 18px;font-size:14px;color:#9098a8;line-height:1.7;">
                Hi ${company},
              </p>
              <p style="margin:0 0 18px;font-size:14px;color:#9098a8;line-height:1.7;">
                We received your upload for
                <strong style="color:#f0ede8;">${projectName}</strong>.
                Click the button below to run your extraction - it takes about 2 minutes.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="https://www.projmgt.ai/scope-extractor"
                      style="display:inline-block;padding:14px 36px;background:#c8922a;
                        color:#0b0d14;font-size:14px;font-weight:700;
                        text-decoration:none;border-radius:3px;letter-spacing:0.02em;">
                      Run Extraction
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;font-family:Courier New,monospace;font-size:10px;
                letter-spacing:0.15em;color:#454858;text-transform:uppercase;">
                What is in your workbook
              </p>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#141720;border:1px solid #1e2130;
                  border-radius:3px;margin-bottom:24px;">
                <tr><td style="padding:12px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${workbookRows}
                  </table>
                </td></tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#5a6070;line-height:1.7;">
                Spam folder? Reply to this email and we will resend.
              </p>
              <p style="margin:0;font-size:13px;color:#5a6070;line-height:1.7;">
                Questions? Reply here or email
                <a href="mailto:gary@projmgt.ai"
                  style="color:#c8922a;text-decoration:none;">gary@projmgt.ai</a>
              </p>
            </td>
          </tr>

          <tr><td style="padding:0 40px;">
            <div style="height:1px;background:#1e2130;"></div>
          </td></tr>
          <tr>
            <td style="padding:16px 40px;">
              <p style="margin:0;font-family:Courier New,monospace;font-size:10px;
                color:#2a2d3a;letter-spacing:0.08em;">
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

// -- Fire-and-forget extraction -------------------------------------------
async function fireExtraction(
  uploadId: string,
  filePaths: string[],
  fileTags: Record<string, string>,
  metadata: {
    email: string;
    company: string;
    projectName: string;
    projectType: string;
  }
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

  fetch(`${process.env.EXTRACTION_API_URL}/extract-and-deliver`, {
    method: "POST",
    body: form,
  }).catch((err) => {
    console.error(`[process-upload] Extraction fire failed for ${uploadId}:`, err);
  });
}

// -- Main handler ---------------------------------------------------------
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({
    maxFileSize: 150 * 1024 * 1024,
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

  const email       = Array.isArray(fields.email)        ? fields.email[0]        : fields.email        || "";
  const company     = Array.isArray(fields.company)      ? fields.company[0]      : fields.company      || "";
  const projectType = Array.isArray(fields.project_type) ? fields.project_type[0] : fields.project_type || "";
  const projectName = Array.isArray(fields.project_name) ? fields.project_name[0] : fields.project_name
    || `${company} Project`;

  if (!email || !company) {
    return res.status(400).json({ error: "Email and company are required" });
  }

  const uploadedFiles = Array.isArray(files.files)
    ? files.files
    : files.files ? [files.files] : [];
  const filePaths = uploadedFiles.map((f) => f.filepath);
  const fileNames = uploadedFiles.map((f) => f.originalFilename || path.basename(f.filepath));

  const fileTags: Record<string, string> = {};
  for (const filename of fileNames) {
    const tagKey = `tag_${filename}`;
    const tagVal = Array.isArray(fields[tagKey]) ? fields[tagKey]![0] : fields[tagKey];
    fileTags[filename] = tagVal || "Plans";
  }

  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Fix 1: simplified insert — only columns confirmed to exist in schema
  try {
    await supabaseInsert("uploads", {
      user_email: email,
      company,
      project_type: projectType,
    });
  } catch (err) {
    console.error("[process-upload] Supabase log failed:", err);
    // Non-fatal — continue
  }

  // Fix 2 + 3: clean email, corrected reply_to
  try {
    await sendConfirmationEmail(email, company, projectName);
  } catch (err) {
    console.error("[process-upload] Confirmation email failed:", err);
    // Non-fatal
  }

  if (filePaths.length > 0) {
    fireExtraction(uploadId, filePaths, fileTags, {
      email,
      company,
      projectName,
      projectType,
    });
  }

  return res.status(200).json({
    ok: true,
    upload_id: uploadId,
    message: "Upload received. Results will be emailed shortly.",
  });
}
