import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { pathname } = req.body;
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname: pathname || "uploads/upload.pdf",
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 200 * 1024 * 1024,
      onUploadCompleted: {
        callbackUrl: "https://www.projmgt.ai/api/blob-upload-complete",
      },
    });
    return res.status(200).json({ clientToken });
  } catch (err) {
    console.error("[blob-upload-token]", err);
    return res.status(500).json({ error: String(err) });
  }
}