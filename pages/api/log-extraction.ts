// pages/api/log-extraction.ts  v14.11.3
// Logs completed extraction metadata + Vercel Blob URLs to Supabase.
// Called client-side after extraction completes, only when user has email
// from homepage lead capture (stored in sessionStorage as projmgtai_email).
//
// Supabase table: extractions
// Columns: id, upload_id, line_item_count, room_count, rfi_flag_count,
//          processing_seconds, excel_url, delivered_at
//
// Deploy to: pages/api/log-extraction.ts AND src/pages/api/log-extraction.ts

import type { NextApiRequest, NextApiResponse } from "next";

async function supabaseInsert(table: string, record: Record<string, unknown>) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
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

  const { room_count, item_count } = req.body || {};

  // email gate removed (v14.11.3): extractions logs telemetry for any completed run

  try {
    await supabaseInsert("extractions", {
      room_count: room_count || 0,
      line_item_count: item_count || 0,
      delivered_at: new Date().toISOString(),
    });

    console.log(`[log-extraction] logged: ${room_count || 0} rooms, ${item_count || 0} items`);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[log-extraction] failed:", err.message);
    // Non-fatal — return 200 so client doesn't show error
    return res.status(200).json({ ok: false, error: err.message });
  }
}
