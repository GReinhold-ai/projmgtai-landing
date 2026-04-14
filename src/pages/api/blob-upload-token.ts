// pages/api/blob-upload-token.ts  v14.9.32
// Vercel Blob client-side upload token handler.
// Client calls this to get a signed upload URL, then PUTs directly to Blob.
// This bypasses the 4.5MB Next.js serverless body limit entirely.
//
// Deploy to: pages/api/blob-upload-token.ts AND src/pages/api/blob-upload-token.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 150 * 1024 * 1024,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("[blob-upload-token] Upload complete:", blob.url);
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err: any) {
    console.error("[blob-upload-token] error:", err);
    return res.status(400).json({ error: err.message });
  }
}
