// src/app/estimator/page.tsx

"use client";

import Link from "next/link";

export default function EstimatorPage() {
  return (
    <main className="min-h-screen bg-[#003B49] text-white px-8 py-10">
      <h1 className="text-2xl font-semibold mb-2">
        ProjMgtAI – Estimator Workspace
      </h1>
      <p className="text-sm text-gray-300 mb-8 max-w-2xl">
        This workspace is for millwork estimators. Start by uploading an OCR&apos;d
        plan set, then continue to the WBS Builder to refine scope rows.
      </p>

      <div className="flex flex-col gap-4 max-w-md">
        <Link
          href="/upload"
          className="inline-flex items-center justify-center rounded-lg border border-teal-400 bg-teal-500/20 px-4 py-3 text-sm font-medium hover:bg-teal-500/30"
        >
          1️⃣ Upload OCR&apos;d Plan Set
        </Link>

        <Link
          href="/estimator/wbs"
          className="inline-flex items-center justify-center rounded-lg border border-gray-500 bg-gray-700/30 px-4 py-3 text-sm font-medium hover:bg-gray-700/50"
        >
          2️⃣ Open WBS Builder (after extraction)
        </Link>

        <p className="text-xs text-gray-400 mt-4">
          Note: Firebase-based features from the older EstimatorLanding screen
          are disabled in this ProjMgtAI parser MVP. We&apos;re running a pure
          FastAPI + Next.js flow here.
        </p>
      </div>
    </main>
  );
}
