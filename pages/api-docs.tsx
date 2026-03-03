// pages/api-docs.tsx
"use client";

import Link from "next/link";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8080";

export default function ApiDocsPage() {
  const docsUrl = `${BACKEND_URL}/docs`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-8 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">ProjMgtAI — API Docs</h1>
            <p className="mt-1 text-sm text-slate-400">
              Embedded FastAPI Swagger UI from{" "}
              <span className="font-mono text-emerald-400">{docsUrl}</span>
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs hover:bg-slate-800"
          >
            Back to Hub
          </Link>
        </header>

        <div className="mt-4 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          {/* Simple iframe embed */}
          <iframe
            src={docsUrl}
            title="ProjMgtAI API docs"
            className="h-[80vh] w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
