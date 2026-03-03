"use client";

import React, { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8080";

type ExtractResponse = {
  ok: boolean;
  pdf_path?: string;
  toon_scope: string;
  toon_wbs: string;
  scope_items: any[];
  wbs_rows: any[];
};

export default function UploadTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  const handleRun = async () => {
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please choose a PDF file first.");
      return;
    }

    try {
      setLoading(true);

      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/api/extract_file`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Backend error (${res.status}): ${text}`);
      }

      const json = (await res.json()) as ExtractResponse;
      setResult(json);
    } catch (err: any) {
      console.error("Upload/Extract error:", err);
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold mb-2">
          ProjMgtAI Parser – File Upload TOON Test
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          This page uploads a PDF to <code>/api/extract_file</code> on the
          FastAPI server and shows the TOON strings plus decoded JSON.
        </p>

        {/* Card – file chooser */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium mb-1">
                Step 1 – Choose a PDF
              </div>
              <div className="text-xs text-slate-400">
                Backend URL:{" "}
                <span className="font-mono text-[11px]">
                  {API_BASE}/api/extract_file
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="text-xs text-slate-200"
              />
              <button
                onClick={handleRun}
                disabled={loading || !file}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? "Uploading & Extracting…" : "Upload + Run Extract"}
              </button>
            </div>
          </div>

          {file && (
            <div className="mt-3 text-xs text-slate-400">
              Selected:{" "}
              <span className="font-mono text-[11px]">{file.name}</span>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-md border border-red-500/60 bg-red-900/30 px-3 py-2 text-xs text-red-100">
              Error: {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* TOON – Scope */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold mb-2">TOON – Scope</h2>
              <p className="text-xs text-slate-400 mb-2">
                Raw TOON string for scope items as returned by FastAPI.
              </p>
              <pre className="max-h-40 overflow-auto rounded-md bg-slate-950/90 p-3 text-[11px] font-mono text-emerald-200">
                {result.toon_scope}
              </pre>
            </section>

            {/* Decoded scope JSON */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold mb-2">
                Decoded Scope Items (JSON)
              </h2>
              <pre className="max-h-60 overflow-auto rounded-md bg-slate-950/90 p-3 text-[11px] font-mono text-sky-200">
                {JSON.stringify(result.scope_items, null, 2)}
              </pre>
            </section>

            {/* TOON – WBS */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold mb-2">TOON – WBS</h2>
              <pre className="max-h-40 overflow-auto rounded-md bg-slate-950/90 p-3 text-[11px] font-mono text-amber-200">
                {result.toon_wbs}
              </pre>
            </section>

            {/* Decoded WBS JSON */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold mb-2">
                Decoded WBS Rows (JSON)
              </h2>
              <pre className="max-h-60 overflow-auto rounded-md bg-slate-950/90 p-3 text-[11px] font-mono text-fuchsia-200">
                {JSON.stringify(result.wbs_rows, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
