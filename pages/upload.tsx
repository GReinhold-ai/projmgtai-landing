// projmgtai-ui/pages/upload.tsx
import React, { useMemo, useState } from "react";
import { useRouter } from "next/router";

type ScopeItem = {
  id: number;
  page: number;
  line: string;
  trade?: string;
  category?: string;
  quantity?: number | null;
  uom?: string;
  remarks?: string;
};

type ExtractResponse = {
  ok: boolean;
  raw_text?: string;
  raw_pages?: string[];
  scope_items?: ScopeItem[];
  total_scope_lines?: number;
  max_seed_rows?: number;
  pages_extracted?: number;
  error?: string;
  trace?: string;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://127.0.0.1:8080";

const LS_KEY = "projmgtai:last_extract";

export default function UploadPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [maxRows, setMaxRows] = useState<number>(500);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<ExtractResponse | null>(null);

  const firstPagesPreview = useMemo(() => {
    const pages = data?.raw_pages ?? [];
    return pages.slice(0, 3);
  }, [data]);

  const seedPreview = useMemo(() => {
    const rows = data?.scope_items ?? [];
    return rows.slice(0, 10);
  }, [data]);

  async function handleExtract() {
    try {
      setErr("");
      setLoading(true);

      if (!file) {
        setErr("Please choose a PDF file.");
        return;
      }

      const form = new FormData();
      // Backend expects field name "file"
      form.append("file", file);

      const url = `${API_BASE}/extract?max_rows=${encodeURIComponent(
        String(maxRows || 500)
      )}`;

      const res = await fetch(url, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Backend error (${res.status}): ${detail || res.statusText}`);
      }

      const json = (await res.json()) as ExtractResponse;

      if (!json?.ok) {
        throw new Error(json?.error || "Extract failed (unknown error).");
      }
      if (!Array.isArray(json.scope_items)) {
        throw new Error("Backend returned invalid extract result (scope_items missing).");
      }

      setData(json);

      // Persist latest extract so WBS page can recover even if backend restarts.
      // (Backend still serves /wbs from memory; this is a client-side safety net.)
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(json));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function goToWbs() {
    router.push("/estimator/wbs");
  }

  return (
    <div className="min-h-screen bg-[#070B18] text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-2 text-3xl font-semibold">Upload PDF</div>
        <div className="mb-8 text-sm text-slate-400">
          Upload plans/specs → extract raw text → seed WBS rows (beta limits apply).
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-medium text-slate-300">
                PDF file
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-100 hover:file:bg-white/15"
                />
              </div>
              {file?.name ? (
                <div className="mt-2 text-xs text-slate-400">{file.name}</div>
              ) : null}
            </div>

            <div className="w-full md:w-48">
              <label className="mb-2 block text-xs font-medium text-slate-300">
                Seed rows limit
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                value={maxRows}
                onChange={(e) => setMaxRows(Number(e.target.value || 500))}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExtract}
                disabled={loading}
                className="rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-500 disabled:opacity-60"
              >
                {loading ? "Extracting..." : "Extract"}
              </button>

              <button
                onClick={goToWbs}
                className="rounded-xl bg-sky-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-sky-500"
              >
                Go to WBS Builder
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            API: <span className="text-slate-200">{API_BASE}</span>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}
        </div>

        {data?.ok ? (
          <>
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold">Extraction summary</div>
              <div className="mt-2 text-sm text-slate-300">
                Pages extracted: <span className="font-semibold">{data.pages_extracted ?? "-"}</span>
                {" · "}
                Seed rows prepared: <span className="font-semibold">{data.max_seed_rows ?? (data.scope_items?.length ?? "-")}</span>
                {" · "}
                Total scope lines: <span className="font-semibold">{data.total_scope_lines ?? "-"}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Tip: If WBS shows 0 rows, re-run Extract (backend memory resets on restart).
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-2 text-sm font-semibold">Raw pages preview (first 3)</div>
                <div className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-200">
                  {firstPagesPreview.length ? (
                    firstPagesPreview.map((p, idx) => (
                      <div key={idx} className="mb-4">
                        <div className="mb-1 text-[11px] font-semibold text-slate-400">
                          Page {idx + 1}
                        </div>
                        <pre className="whitespace-pre-wrap">{p}</pre>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">No pages returned.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-2 text-sm font-semibold">Seed scope items (first 10)</div>
                <div className="space-y-2">
                  {seedPreview.length ? (
                    seedPreview.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200"
                      >
                        <span className="mr-2 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200">
                          Pg {r.page}
                        </span>
                        <span className="text-slate-100">{r.line}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-400">No rows returned.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Tip: your <code className="text-slate-300">.env.local</code> uses{" "}
              <code className="text-slate-300">NEXT_PUBLIC_API_BASE</code>. If you change it,
              restart <code className="text-slate-300">npm run dev</code> in the UI project.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
