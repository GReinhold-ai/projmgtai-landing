// pages/estimator/index.tsx
"use client";

import Link from "next/link";

export default function EstimatorHubPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">
            ProjMgtAI — Estimator Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Central hub for your PDF parsing and WBS building flow.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
            <h2 className="text-sm font-semibold text-slate-100">1. Upload</h2>
            <p className="mt-2 text-xs text-slate-300">
              Upload a combined OCR&apos;d plan set PDF. We&apos;ll parse each
              page to raw text and seed scope rows.
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex rounded-md bg-emerald-500 px-3 py-2 text-xs font-medium text-emerald-50 hover:bg-emerald-400"
            >
              Go to Upload →
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
            <h2 className="text-sm font-semibold text-slate-100">
              2. WBS Builder
            </h2>
            <p className="mt-2 text-xs text-slate-300">
              Browse the first 500 seed rows, page by page, with line text,
              trade/category, quantities, and remarks.
            </p>
            <Link
              href="/estimator/wbs"
              className="mt-4 inline-flex rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-50 hover:bg-slate-700"
            >
              Open WBS Builder →
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
            <h2 className="text-sm font-semibold text-slate-100">
              3. AI & Export
            </h2>
            <p className="mt-2 text-xs text-slate-300">
              Use a separate view to apply rule-based / AI classification and
              generate export files for your estimating system.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Link
                href="/estimator/classify"
                className="inline-flex rounded-md bg-indigo-600 px-3 py-2 font-medium text-indigo-50 hover:bg-indigo-500"
              >
                AI Classify →
              </Link>
              <Link
                href="/estimator/export"
                className="inline-flex rounded-md bg-slate-800 px-3 py-2 font-medium text-slate-50 hover:bg-slate-700"
              >
                Export View →
              </Link>
            </div>
          </div>
        </div>

        <footer className="pt-4 text-xs text-slate-500">
          Tip: Run through a real project with the same PDF set you&apos;d give
          a junior estimator. Compare timing vs manual takeoff.
        </footer>
      </div>
    </div>
  );
}
