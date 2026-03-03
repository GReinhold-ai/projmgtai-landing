import { useState } from "react";

export default function DevScopeWbs() {
  const [text, setText] = useState(
    "UPPER CABINETS, PLAM DOORS, SEE DETAIL 9/A8.41 FOR BREAKROOM 204."
  );
  const [scopeResult, setScopeResult] = useState<any>(null);
  const [wbsResult, setWbsResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function runScope() {
    setLoading(true);
    setWbsResult(null);
    try {
      const res = await fetch("/api/scope-extractor-toon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "DEV", sheetRef: "A8.41", text }),
      });
      const json = await res.json();
      setScopeResult(json);
    } finally {
      setLoading(false);
    }
  }

  async function runWbs() {
    if (!scopeResult?.toon) return;
    setLoading(true);
    try {
      const res = await fetch("/api/wbs-from-toon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "DEV", toonItems: scopeResult.toon }),
      });
      const json = await res.json();
      setWbsResult(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 grid gap-4 md:grid-cols-2">
      <section>
        <h1 className="text-xl font-bold mb-2">Dev: Scope → WBS (TOON)</h1>
        <textarea
          className="w-full h-60 border rounded p-2 text-sm font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={runScope}
            disabled={loading}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "Running…" : "Run ScopeExtractor"}
          </button>
          <button
            onClick={runWbs}
            disabled={loading || !scopeResult?.toon}
            className="px-4 py-2 rounded border disabled:opacity-50"
          >
            {loading ? "…" : "Run WBS"}
          </button>
        </div>

        {scopeResult && (
          <pre className="mt-4 p-2 border rounded text-xs overflow-auto max-h-64">
            {JSON.stringify(scopeResult.rows, null, 2)}
          </pre>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-2">WBS Result (JSON)</h2>
        {wbsResult ? (
          <pre className="p-2 border rounded text-xs overflow-auto max-h-96">
            {JSON.stringify(wbsResult.wbsRows, null, 2)}
          </pre>
        ) : (
          <p className="text-sm opacity-70">
            Run ScopeExtractor, then click "Run WBS" to see grouped WBS rows.
          </p>
        )}
      </section>
    </main>
  );
}
