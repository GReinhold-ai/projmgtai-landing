// projmgtai-ui/pages/estimator/wbs.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

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

const RAW_BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8080";

function normalizeBase(url: string) {
  return url.replace(/\/+$/, "");
}

function safeStr(v: any) {
  return (v ?? "").toString();
}

function safeNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function WbsPage() {
  const router = useRouter();
  const API_BASE = useMemo(() => normalizeBase(RAW_BACKEND), []);

  const [busy, setBusy] = useState<
    null | "load" | "classify" | "xlsx" | "csv"
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<WbsRow[]>([]);
  const [meta, setMeta] = useState<{
    total_scope_lines?: number;
    max_seed_rows?: number;
    last_updated_ts?: number;
    source?: string;
  }>({});

  const [classifyMode, setClassifyMode] = useState<"manual" | "auto" | "llm">(
    "auto"
  );
  const [overwrite, setOverwrite] = useState<boolean>(false);

  async function loadWbs() {
    setBusy("load");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/wbs`);
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(
          `Failed to load WBS rows (${res.status}): ${text || res.statusText}`
        );
      }
      const data = JSON.parse(text || "{}");
      const nextRows: WbsRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
      setMeta({
        total_scope_lines: data?.total_scope_lines ?? 0,
        max_seed_rows: data?.max_seed_rows ?? 0,
        last_updated_ts: data?.last_updated_ts ?? 0,
        source: data?.source ?? "",
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load WBS.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    loadWbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(idx: number, patch: Partial<WbsRow>) {
    setRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }

  async function classifyAi() {
    setBusy("classify");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: classifyMode, // "llm" or "manual" or "auto"
          overwrite, // false = fill blanks only
          rows, // current edited rows
        }),
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(text || res.statusText);
      }

      const data = JSON.parse(text || "{}");
      const nextRows: WbsRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
    } catch (e: any) {
      setError(e?.message || "Classify failed.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadXlsx() {
    setBusy("xlsx");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/export/xlsx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual", // ignored by export, but schema accepts it
          overwrite: false,
          rows,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || res.statusText);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wbs_export.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "XLSX download failed.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadCsv() {
    setBusy("csv");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/export/csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          overwrite: false,
          rows,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || res.statusText);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wbs_export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "CSV download failed.");
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Estimator — WBS</h1>
            <div className="text-sm text-zinc-300 mt-1">
              Backend: <span className="text-zinc-100">{API_BASE}</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Source: {meta.source || "-"} • Rows: {rows.length} • Total scope
              lines: {meta.total_scope_lines ?? "-"} • Max seed:{" "}
              {meta.max_seed_rows ?? "-"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
              onClick={() => router.push("/upload")}
              disabled={isBusy}
              title="Back to upload"
            >
              ← Upload
            </button>

            <button
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
              onClick={loadWbs}
              disabled={isBusy}
              title="Reload from backend"
            >
              {busy === "load" ? "Loading…" : "Reload"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-red-950 border border-red-800 text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        <div className="mt-5 p-4 rounded bg-zinc-900 border border-zinc-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-zinc-200 font-medium">
                Classify:
              </div>

              <select
                value={classifyMode}
                onChange={(e) =>
                  setClassifyMode(e.target.value as "manual" | "auto" | "llm")
                }
                className="bg-black border border-zinc-700 rounded px-2 py-1 text-sm"
                disabled={isBusy}
              >
                <option value="auto">auto</option>
                <option value="llm">llm</option>
                <option value="manual">manual</option>
              </select>

              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  disabled={isBusy}
                />
                overwrite existing trade/category
              </label>

              <button
                onClick={classifyAi}
                disabled={isBusy || rows.length === 0}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "classify" ? "Classifying…" : "Run Classify"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadXlsx}
                disabled={isBusy || rows.length === 0}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                title="Download Millwork-only XLSX (summary + category sheets)"
              >
                {busy === "xlsx" ? "Preparing…" : "Download XLSX"}
              </button>

              <button
                onClick={downloadCsv}
                disabled={isBusy || rows.length === 0}
                className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50"
                title="Download CSV of current table"
              >
                {busy === "csv" ? "Preparing…" : "Download CSV"}
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-zinc-400">
            Tip: use <span className="text-zinc-200">auto</span> in production.
            It uses LLM only when key looks valid; otherwise it falls back to
            manual rules.
          </div>
        </div>

        <div className="mt-5 overflow-auto rounded border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-200">
              <tr>
                <th className="p-2 text-left w-12">#</th>
                <th className="p-2 text-left w-14">Pg</th>
                <th className="p-2 text-left min-w-[420px]">Scope line</th>
                <th className="p-2 text-left w-40">Trade</th>
                <th className="p-2 text-left w-56">Category</th>
                <th className="p-2 text-left w-24">Qty</th>
                <th className="p-2 text-left w-20">UOM</th>
                <th className="p-2 text-left min-w-[260px]">Remarks</th>
              </tr>
            </thead>

            <tbody className="bg-black">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-4 text-zinc-400 border-t border-zinc-900"
                  >
                    No rows loaded yet. Go to Upload and Extract a PDF.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.id}-${idx}`} className="border-t border-zinc-900">
                    <td className="p-2 text-zinc-300">{r.id}</td>
                    <td className="p-2 text-zinc-300">{r.page}</td>

                    <td className="p-2">
                      <textarea
                        value={safeStr(r.line)}
                        onChange={(e) =>
                          updateRow(idx, { line: e.target.value })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 min-h-[44px]"
                        disabled={isBusy}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        value={safeStr(r.trade)}
                        onChange={(e) =>
                          updateRow(idx, { trade: e.target.value })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-zinc-100"
                        disabled={isBusy}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        value={safeStr(r.category)}
                        onChange={(e) =>
                          updateRow(idx, { category: e.target.value })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-zinc-100"
                        disabled={isBusy}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        value={r.quantity ?? ""}
                        onChange={(e) =>
                          updateRow(idx, { quantity: safeNum(e.target.value) })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-zinc-100"
                        disabled={isBusy}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        value={safeStr(r.uom)}
                        onChange={(e) =>
                          updateRow(idx, { uom: e.target.value })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-zinc-100"
                        disabled={isBusy}
                      />
                    </td>

                    <td className="p-2">
                      <textarea
                        value={safeStr(r.remarks)}
                        onChange={(e) =>
                          updateRow(idx, { remarks: e.target.value })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100 min-h-[44px]"
                        disabled={isBusy}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          Millwork XLSX currently exports only rows where{" "}
          <span className="text-zinc-200">trade === "Millwork"</span>. We’ll
          expand to other trades later.
        </div>
      </div>
    </div>
  );
}
