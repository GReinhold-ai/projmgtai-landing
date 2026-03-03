"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ScopeItem = {
  id: string;
  text?: string;
  line?: string;
  source?: string;
};

type SeedRow = {
  id: string;
  line: string;
  category?: string;
  confidence?: number | null;
  source?: string | null;
  rule?: string | null;
};

type ExtractResponse = {
  ok?: boolean;
  row_count?: number;
  scope_items?: ScopeItem[];
  rows?: SeedRow[];
  meta?: any;
  raw_pages_preview?: string[];
  dropped_low_quality?: number;
  detail?: any;
};

export default function UploadPage() {
  const router = useRouter();

  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://127.0.0.1:8080";

  const [file, setFile] = useState<File | null>(null);
  const [seedLimit, setSeedLimit] = useState<number>(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [scopePreview, setScopePreview] = useState<ScopeItem[]>([]);
  const [seededRows, setSeededRows] = useState<SeedRow[]>([]);

  const fileName = useMemo(() => file?.name || "", [file]);

  async function onExtract() {
    setError("");
    setScopePreview([]);
    setSeededRows([]);

    if (!file) {
      setError("Please select a PDF file.");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(
        `${API_BASE}/extract?max_rows=${seedLimit}`,
        {
          method: "POST",
          body: form,
        }
      );

      const text = await res.text();
      const data: ExtractResponse = JSON.parse(text);

      if (!res.ok) {
        throw new Error(
          data.detail || `Extract failed (${res.status})`
        );
      }

      if (!Array.isArray(data.scope_items)) {
        throw new Error("Backend extract response missing scope_items.");
      }

      setScopePreview(data.scope_items.slice(0, 10));
      setSeededRows(data.rows || []);

      // Persist for WBS page
      localStorage.setItem(
        "projmgtai:last_extract:rows",
        JSON.stringify(data.rows || [])
      );
      localStorage.setItem(
        "projmgtai:last_extract:meta",
        JSON.stringify(data.meta || {})
      );
      localStorage.setItem(
        "projmgtai:last_extract:scope_items",
        JSON.stringify(data.scope_items)
      );
    } catch (e: any) {
      setError(e.message || "Extract failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Upload Plans / Specs</h1>
          <p className="text-sm text-slate-400">
            Upload a PDF to seed WBS scope rows.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />

          {fileName && (
            <div className="text-xs text-slate-400">{fileName}</div>
          )}

          <div>
            <label className="text-xs text-slate-400">
              Seed rows limit
            </label>
            <input
              type="number"
              value={seedLimit}
              min={1}
              max={5000}
              onChange={(e) =>
                setSeedLimit(parseInt(e.target.value || "500", 10))
              }
              className="mt-1 w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onExtract}
              disabled={loading}
              className="rounded bg-emerald-700 px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "Extracting…" : "Extract"}
            </button>

            {/* ✅ FIXED ROUTE */}
            <button
              onClick={() => router.push("/estimator/wbs")}
              className="rounded bg-sky-700 px-4 py-2 text-sm hover:bg-sky-600"
            >
              Go to WBS Builder
            </button>
          </div>

          {error && (
            <div className="rounded border border-red-600 bg-red-950 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {scopePreview.length > 0 && (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold mb-2">
              Seed scope preview (first 10)
            </h2>
            <ul className="space-y-1 text-xs text-slate-300">
              {scopePreview.map((s) => (
                <li key={s.id} className="font-mono">
                  {s.text || s.line}
                </li>
              ))}
            </ul>

            <div className="mt-2 text-xs text-slate-400">
              Seeded rows stored: {seededRows.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
