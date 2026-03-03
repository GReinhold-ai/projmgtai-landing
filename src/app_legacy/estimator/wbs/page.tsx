"use client";

import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://127.0.0.1:8080")!.trim();

/**
 * New Phase A1 backend row shape (what /wbs returns)
 */
type A1Row = {
  id: string;
  line: string;
  category?: string;
  confidence?: number | null;
  source?: string | null;
  rule?: string | null;
};

/**
 * Legacy seed row shape (what your old /api/current_wbs used)
 */
type LegacySeedRow = {
  id: number;
  page: number;
  line: string;
  trade?: string;
  category?: string;
  quantity?: number | null;
  uom?: string;
  remarks?: string;
};

type WbsResponse = {
  rows: any[];
  meta?: any;
};

type DebugA1 = {
  millwork_row_count: number;
  inferred_takeoff_row_count: number;
  skipped: Array<{ id: string; line: string; reason: string }>;
};

function isA1Row(x: any): x is A1Row {
  return (
    x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.line === "string"
  );
}

function normalizeToA1Rows(rows: any[]): A1Row[] {
  if (!Array.isArray(rows)) return [];
  // If they already look like A1 rows, keep them
  if (rows.length && isA1Row(rows[0])) return rows as A1Row[];

  // Otherwise convert legacy seed rows to A1 rows
  return rows
    .filter((r) => r && typeof r === "object" && typeof r.line === "string")
    .map((r) => {
      const legacy = r as LegacySeedRow;
      return {
        id: typeof legacy.id === "number" ? `seed-${legacy.id}` : String((r as any).id ?? ""),
        line: legacy.line,
        category: legacy.category || "Unclassified",
        confidence: null,
        source: null,
        rule: null,
      } as A1Row;
    });
}

export default function WbsPage() {
  const [rows, setRows] = useState<A1Row[]>([]);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [debugA1, setDebugA1] = useState<DebugA1 | null>(null);

  // simple client-side paging so you’re not rendering 500 rows at once
  const PAGE_SIZE = 50;
  const [pageIndex, setPageIndex] = useState(0);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageRows = rows.slice(
    safePageIndex * PAGE_SIZE,
    safePageIndex * PAGE_SIZE + PAGE_SIZE
  );

  const counts = useMemo(() => {
    const mw = rows.filter((r) => {
      const c = (r.category || "").toLowerCase();
      return (
        c === "millwork" ||
        c === "casework" ||
        c === "woodwork" ||
        c === "architectural millwork"
      );
    }).length;
    const un = rows.filter(
      (r) => (r.category || "").toLowerCase() === "unclassified"
    ).length;
    return { millwork: mw, unclassified: un };
  }, [rows]);

  function handlePrevPage() {
    setPageIndex((p) => Math.max(0, p - 1));
  }

  function handleNextPage() {
    setPageIndex((p) => Math.min(totalPages - 1, p + 1));
  }

  // -------------------------------
  // Load rows (localStorage → /wbs fallback)
  // -------------------------------
  async function loadWbs() {
    setLoading(true);
    setError(null);

    try {
      // 1) Try localStorage first (from upload page)
      let localRows: any[] = [];
      let localMeta: any = {};

      try {
        const raw = localStorage.getItem("projmgtai:last_extract:rows");
        const m = localStorage.getItem("projmgtai:last_extract:meta");
        if (raw) localRows = JSON.parse(raw);
        if (m) localMeta = JSON.parse(m);
      } catch {
        // ignore localStorage parse issues
      }

      if (Array.isArray(localRows) && localRows.length) {
        const normalized = normalizeToA1Rows(localRows);
        setRows(normalized);
        setMeta(localMeta || {});
        setLoading(false);
        return;
      }

      // 2) Fall back to backend /wbs
      const url = `${API_BASE}/wbs`;
      console.log("[WBS] GET", url);

      const res = await fetch(url);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Failed to load WBS rows (${res.status}): ${detail || res.statusText}`
        );
      }

      const data: WbsResponse = await res.json();

      if (!Array.isArray(data.rows)) {
        throw new Error("Backend returned invalid WBS structure (rows missing).");
      }

      const normalized = normalizeToA1Rows(data.rows);
      setRows(normalized);
      setMeta(data.meta || {});

      // Cache in localStorage so refresh is instant
      try {
        localStorage.setItem(
          "projmgtai:last_extract:rows",
          JSON.stringify(normalized)
        );
        localStorage.setItem(
          "projmgtai:last_extract:meta",
          JSON.stringify(data.meta || {})
        );
      } catch {}
    } catch (err: any) {
      console.error("[WBS] loadWbs error:", err);
      setError(err.message || "Unknown backend error when loading WBS.");
      setRows([]);
      setMeta({});
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------
  // Actions
  // -------------------------------
  async function runClassify() {
    setBusy(true);
    setError(null);
    try {
      const url = `${API_BASE}/classify`;
      console.log("[WBS] POST", url);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto", rows }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Classify failed (${res.status}): ${detail || res.statusText}`
        );
      }

      const data = await res.json();
      const normalized = normalizeToA1Rows(data.rows || []);
      setRows(normalized);
      setMeta(data.meta || {});

      try {
        localStorage.setItem(
          "projmgtai:last_extract:rows",
          JSON.stringify(normalized)
        );
        localStorage.setItem(
          "projmgtai:last_extract:meta",
          JSON.stringify(data.meta || {})
        );
      } catch {}
    } catch (e: any) {
      setError(e?.message || "Unknown classify error");
    } finally {
      setBusy(false);
    }
  }

  async function loadDebugA1() {
    setBusy(true);
    setError(null);
    try {
      const url = `${API_BASE}/debug/a1`;
      console.log("[WBS] GET", url);

      const res = await fetch(url);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Debug A1 failed (${res.status}): ${detail || res.statusText}`
        );
      }

      const data: DebugA1 = await res.json();
      setDebugA1(data);
    } catch (e: any) {
      setError(e?.message || "Unknown debug error");
      setDebugA1(null);
    } finally {
      setBusy(false);
    }
  }

  function exportXlsx() {
    window.open(`${API_BASE}/export/xlsx`, "_blank");
  }

  useEffect(() => {
    loadWbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstRow = rows[0];

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header + debug toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 text-2xl font-bold">
              ProjMgtAI — WBS Builder (Phase A1)
            </h1>
            <p className="text-sm text-slate-400">
              Rows load from last Extract (localStorage) or backend{" "}
              <span className="font-mono">/wbs</span>.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              API: <span className="font-mono text-slate-300">{API_BASE}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
            onClick={() => (window.location.href = "/upload")}
          >
            ← Back to Upload
          </button>

          <button
            className="rounded bg-sky-700 px-4 py-2 text-sm hover:bg-sky-600 disabled:opacity-50"
            onClick={loadWbs}
            disabled={loading || busy}
          >
            {loading ? "Loading…" : "Reload"}
          </button>

          <button
            className="rounded bg-emerald-700 px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
            onClick={runClassify}
            disabled={busy || loading || rows.length === 0}
            title="Rules-first classify and updates categories"
          >
            {busy ? "Working…" : "Run Classify"}
          </button>

          <button
            className="rounded bg-indigo-700 px-4 py-2 text-sm hover:bg-indigo-600 disabled:opacity-50"
            onClick={exportXlsx}
            disabled={busy || loading || rows.length === 0}
            title="Exports XLSX (auto-classify safety net)"
          >
            Export XLSX
          </button>

          <button
            className="rounded bg-amber-700 px-4 py-2 text-sm hover:bg-amber-600 disabled:opacity-50"
            onClick={loadDebugA1}
            disabled={busy || loading || rows.length === 0}
            title="Shows A1 takeoff inference counts and why lines were skipped"
          >
            Debug A1
          </button>

          <div className="ml-auto flex flex-col items-end text-xs text-slate-300">
            <span>
              Total rows:{" "}
              <span className="font-mono">{rows.length.toLocaleString()}</span>
            </span>
            <span>
              Millwork: <span className="font-mono">{counts.millwork}</span> |
              Unclassified:{" "}
              <span className="font-mono">{counts.unclassified}</span>
            </span>
          </div>
        </div>

        {/* Debug Inspector */}
        {showDebug && (
          <div className="rounded-xl border border-amber-500/60 bg-amber-950/20 p-4 text-xs text-amber-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Debug Inspector</span>
              <span className="font-mono text-[11px] text-amber-200/80">
                rows: {rows.length} | millwork: {counts.millwork}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] text-amber-200/80">meta</div>
                <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-snug">
                  {JSON.stringify(meta || {}, null, 2)}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-amber-200/80">first row</div>
                <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-snug">
                  {firstRow ? JSON.stringify(firstRow, null, 2) : "// no rows loaded yet"}
                </pre>
              </div>
            </div>

            {debugA1 && (
              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3">
                <div className="font-mono text-[11px] text-amber-200/90">
                  /debug/a1 → millwork_row_count={debugA1.millwork_row_count} |
                  inferred_takeoff_row_count={debugA1.inferred_takeoff_row_count} |
                  skipped={debugA1.skipped?.length ?? 0}
                </div>

                {debugA1.skipped?.length ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-snug">
                    {JSON.stringify(debugA1.skipped.slice(0, 20), null, 2)}
                  </pre>
                ) : (
                  <div className="mt-2 text-[11px] text-amber-100/70">
                    No skipped millwork lines.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {loading && <p className="text-sm text-slate-300">Loading WBS rows…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && rows.length === 0 && !error && (
          <p className="text-sm text-slate-400">
            No rows loaded. Go back to <span className="font-mono">/upload</span>, extract a PDF, then return here.
          </p>
        )}

        {/* ---------------- TABLE ---------------- */}
        {rows.length > 0 && (
          <div className="space-y-3">
            {/* Pagination header */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Showing rows{" "}
                <span className="font-mono">
                  {safePageIndex * PAGE_SIZE + 1}–
                  {Math.min((safePageIndex + 1) * PAGE_SIZE, rows.length)}
                </span>{" "}
                of{" "}
                <span className="font-mono">{rows.length.toLocaleString()}</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={safePageIndex === 0}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="font-mono">
                  Page {safePageIndex + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={safePageIndex >= totalPages - 1}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="w-full overflow-x-auto rounded border border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-[11px] uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">ID</th>
                    <th className="px-2 py-2 w-[55%]">Scope line</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Conf</th>
                    <th className="px-2 py-2">Rule</th>
                    <th className="px-2 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => (
                    <tr
                      key={row.id ?? `${safePageIndex}-${idx}`}
                      className="border-t border-slate-700 hover:bg-slate-900/70"
                    >
                      <td className="px-2 py-1 font-mono text-[11px] text-slate-400">
                        {safePageIndex * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-2 py-1 font-mono text-[11px] text-slate-200">
                        {row.id}
                      </td>
                      <td className="px-2 py-1 text-[11px]">{row.line}</td>
                      <td className="px-2 py-1 text-[11px] text-slate-200">
                        {row.category ?? ""}
                      </td>
                      <td className="px-2 py-1 text-[11px] font-mono">
                        {row.confidence == null
                          ? ""
                          : Number(row.confidence).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-slate-200">
                        {row.rule ?? ""}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-slate-200">
                        {row.source ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              Export XLSX includes an auto-classify safety net — even if you skip
              “Run Classify”, your Millwork-Takeoff sheet won’t be empty.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
