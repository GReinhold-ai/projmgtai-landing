// pages/estimator/export.tsx
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

export default function ExportPage() {
  const [rows, setRows] = useState<WbsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/current_wbs`);
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(
            `Failed to load WBS (${res.status}): ${detail || res.statusText}`
          );
        }
        const data: CurrentWbsResponse = await res.json();
        if (!Array.isArray(data.rows)) {
          throw new Error("Backend returned invalid WBS structure.");
        }
        setRows(data.rows);
      } catch (err: any) {
        console.error("[Export] load error:", err);
        setError(err.message || "Failed to load WBS.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleExport() {
    if (!rows.length) return;

    setExporting(true);
    setLastMessage(null);

    try {
      const payload = { rows };
      const res = await fetch(`${BACKEND_URL}/api/export_wbs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Export failed (${res.status})`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/csv") || contentType.includes("octet-stream")) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ProjMgtAI_WBS.csv";
        a.click();
        window.URL.revokeObjectURL(url);
        setLastMessage("CSV download triggered successfully.");
      } else {
        const text = await res.text().catch(() => "");
        setLastMessage(
          text ||
            "Export completed, but backend did not return a downloadable file."
        );
      }
    } catch (err: any) {
      console.error("[Export] handleExport error:", err);
      setLastMessage(err.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-10 text-slate-50">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              ProjMgtAI — Export WBS View
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Trigger a backend export of the current WBS rows to CSV or another
              format suitable for your estimating system.
            </p>
          </div>

          <Link
            href="/estimator/wbs"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs hover:bg-slate-800"
          >
            Back to WBS Builder
          </Link>
        </header>

        {loading && <p className="text-sm text-slate-300">Loading WBS…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Rows available for export:{" "}
              <span className="font-semibold">{rows.length}</span>
            </p>

            <button
              disabled={!rows.length || exporting}
              onClick={handleExport}
              className="rounded bg-green-600 px-4 py-2 text-sm hover:bg-green-500 disabled:bg-slate-700"
            >
              {exporting ? "Exporting…" : "Export current WBS"}
            </button>

            {lastMessage && (
              <pre className="rounded border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200">
                {lastMessage}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
