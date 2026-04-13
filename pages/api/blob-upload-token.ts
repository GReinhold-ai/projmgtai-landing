// pages/api/blob-upload-token.ts
// Required by @vercel/blob client-side upload
// Generates a signed upload token for the browser to upload directly to Blob storage
// Deploy to: pages/api/blob-upload-token.ts AND src/pages/api/blob-upload-token.ts

import { handleUpload, type HandleUploadBody } from "@vercel/blob/next";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = await new Promise<HandleUploadBody>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 200 * 1024 * 1024, // 200MB per file
        tokenPayload: JSON.stringify({ pathname }),
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("[blob-upload-token] Upload complete:", blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("[blob-upload-token] Error:", err);
    return res.status(400).json({ error: String(err) });
  }
}

