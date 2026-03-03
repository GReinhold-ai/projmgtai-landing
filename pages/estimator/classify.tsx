// pages/estimator/classify.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8080";

type WbsRow = {
  id: number;
  page: number;
  line: string;
  trade?: string | null;
  category?: string | null;
  quantity?: number | null;
  uom?: string | null;
  remarks?: string | null;
};

type CurrentWbsResponse = {
  rows: WbsRow[];
  total_scope_lines: number;
  max_seed_rows: number;
};

export default function ClassifyPage() {
  const [rows, setRows] = useState<WbsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode] = useState<"local" | "hybrid" | "openai">("local");

  useEffect(() => {
    async function run() {
      try {
        // Load current WBS
        const res = await fetch(`${BACKEND_URL}/api/current_wbs`);
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(
            `Failed to load WBS (${res.status}): ${detail || res.statusText}`
          );
        }
        const data: CurrentWbsResponse = await res.json();
        if (!Array.isArray(data.rows)) {
          throw new Error("Invalid WBS response from backend.");
        }

        // Classify
        const classifyPayload = { rows: data.rows, mode };
        const res2 = await fetch(`${BACKEND_URL}/api/classify_rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(classifyPayload),
        });

        if (!res2.ok) {
          const detail = await res2.text().catch(() => "");
          throw new Error(
            `AI classify failed (${res2.status}): ${
              detail || res2.statusText
            }`
          );
        }

        const classified: { rows: WbsRow[] } = await res2.json();
        if (!Array.isArray(classified.rows)) {
          throw new Error("Invalid classify response from backend.");
        }

        setRows(classified.rows);
      } catch (err: any) {
        console.error("[Classify] error:", err);
        setError(err.message || "Failed to classify WBS.");
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [mode]);

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-10 text-slate-50">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              ProjMgtAI — AI Classification View
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              This view automatically loads the latest WBS and applies{" "}
              <span className="font-mono">{mode}</span> classification to trade
              and category.
            </p>
          </div>

          <Link
            href="/estimator/wbs"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs hover:bg-slate-800"
          >
            Back to WBS Builder
          </Link>
        </header>

        {loading && <p className="text-sm text-slate-300">Running AI…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-slate-400">
            No rows found. Start from <Link href="/upload">/upload</Link>.
          </p>
        )}

        {rows.length > 0 && (
          <div className="w-full overflow-x-auto rounded border border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 text-[11px] uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Page</th>
                  <th className="p-2 text-left">Scope line</th>
                  <th className="p-2 text-left">Trade (AI)</th>
                  <th className="p-2 text-left">Category (AI)</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800 hover:bg-slate-900/70"
                  >
                    <td className="p-2 text-[11px] text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="p-2 text-[11px] text-slate-200">
                      {r.page}
                    </td>
                    <td className="p-2 text-[11px] text-slate-100">
                      {r.line}
                    </td>
                    <td className="p-2 text-[11px] text-emerald-300">
                      {r.trade || ""}
                    </td>
                    <td className="p-2 text-[11px] text-emerald-300">
                      {r.category || ""}
                    </td>
                    <td className="p-2 text-right text-[11px] text-slate-200">
                      {r.quantity ?? ""}
                    </td>
                    <td className="p-2 text-[11px] text-slate-200">
                      {r.uom || ""}
                    </td>
                    <td className="p-2 text-[11px] text-slate-300">
                      {r.remarks || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="pt-4 text-xs text-slate-500">
          This page is ideal for screenshots / review meetings: it shows
          AI-assigned trades and categories without editing.
        </footer>
      </div>
    </div>
  );
}
