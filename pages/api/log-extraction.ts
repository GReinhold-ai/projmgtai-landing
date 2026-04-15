// pages/api/log-extraction.ts  v14.9.39
// Logs completed extraction metadata + Vercel Blob URLs to Supabase.
// Called client-side after extraction completes, only when user has email
// from homepage lead capture (stored in sessionStorage as projmgtai_email).
//
// Supabase table: extractions
// Columns: id, user_email, project_name, room_count, item_count,
//          page_count, blob_urls, created_at
//
// Deploy to: pages/api/log-extraction.ts AND src/pages/api/log-extraction.ts

import type { NextApiRequest, NextApiResponse } from "next";

async function supabaseInsert(table: string, record: Record<string, unknown>) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_ANON_KEY!,
      "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${err}`);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    user_email,
    project_name,
    room_count,
    item_count,
    page_count,
    blob_urls,       // array of { url, filename, size_kb }
  } = req.body || {};

  if (!user_email) {
    return res.status(400).json({ error: "user_email required" });
  }

  try {
    await supabaseInsert("extractions", {
      user_email,
      project_name: project_name || "unknown",
      room_count: room_count || 0,
      item_count: item_count || 0,
      page_count: page_count || 0,
      blob_urls: JSON.stringify(blob_urls || []),
      created_at: new Date().toISOString(),
    });

    console.log(`[log-extraction] logged for ${user_email}: ${room_count} rooms, ${item_count} items, ${(blob_urls || []).length} files`);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[log-extraction] failed:", err.message);
    // Non-fatal — return 200 so client doesn't show error
    return res.status(200).json({ ok: false, error: err.message });
  }
}
