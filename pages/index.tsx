"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-8 py-10">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">
            ProjMgtAI · Phase 1
          </p>
          <h1 className="text-3xl font-semibold">
            ProjMgtAI — PDF ➜ WBS Builder
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Upload your combined OCR&apos;d plan set PDF, auto-seed a millwork
            scope WBS, classify it by trade &amp; category, and export for
            pricing &amp; bid generation.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <Link
            href="/upload"
            className="group rounded-xl border border-slate-800 bg-slate-900/70 p-5 hover:border-emerald-500/70 hover:bg-slate-900"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Step 1
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">
              Upload PDF &amp; Extract
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Send your combined OCR&apos;d plan set to the backend. We extract
              raw text, slice by page, and seed up to 500 scope rows.
            </p>
            <p className="mt-4 text-xs font-medium text-emerald-400">
              Start with upload →
            </p>
          </Link>

          {/* Step 2 */}
          <Link
            href="/estimator/wbs"
            className="group rounded-xl border border-slate-800 bg-slate-900/70 p-5 hover:border-blue-500/70 hover:bg-slate-900"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              Step 2
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">
              WBS Builder
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Review auto-seeded rows per page, adjust trade/category/quantity,
              and prepare the scope for pricing.
            </p>
            <p className="mt-4 text-xs font-medium text-blue-400">
              Open WBS Builder →
            </p>
          </Link>

          {/* Step 3 */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Step 3+
            </div>
            <h2 className="text-lg font-semibold text-slate-50">
              Classify &amp; Export
            </h2>
            <p className="text-xs text-slate-400">
              Use AI-assisted classification and CSV export to feed your
              existing estimating &amp; bid workflows.
            </p>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link
                href="/estimator/classify"
                className="rounded-md border border-slate-700 px-3 py-1 text-slate-200 hover:border-emerald-500 hover:bg-slate-900"
              >
                AI Classify
              </Link>
              <Link
                href="/estimator/export"
                className="rounded-md border border-slate-700 px-3 py-1 text-slate-200 hover:border-blue-500 hover:bg-slate-900"
              >
                Export CSV
              </Link>
            </div>
          </div>
        </section>

        <footer className="pt-4 text-xs text-slate-500">
          <p>
            This build is optimized for{" "}
            <span className="font-mono text-slate-300">localhost</span>{" "}
            development. Backend API is assumed to be running on{" "}
            <span className="font-mono text-slate-300">
              http://127.0.0.1:8080
            </span>{" "}
            unless overridden via{" "}
            <span className="font-mono">NEXT_PUBLIC_BACKEND_URL</span>.
          </p>
        </footer>
      </div>
    </div>
  );
}
