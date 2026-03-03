// projmgtai-ui/pages/upload.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

const RAW_BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8080";

function normalizeBase(url: string) {
  return url.replace(/\/+$/, ""); // strip trailing slashes
}

const LS_LAST_EXTRACT_URL = "projmgtaI:last_extract_url";

export default function UploadPage() {
  const router = useRouter();
  const BACKEND_URL = useMemo(() => normalizeBase(RAW_BACKEND), []);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Optional: show last known working extract URL for clarity
  const [lastGoodExtractUrl, setLastGoodExtractUrl] = useState<string>("");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LS_LAST_EXTRACT_URL) || "";
      setLastGoodExtractUrl(v);
    } catch {
      // ignore
    }
  }, []);

  async function postMultipart(url: string, pdf: File) {
    const form = new FormData();
    form.append("file", pdf); // FastAPI expects field name "file"
    const res = await fetch(url, { method: "POST", body: form });
    const text = await res.text().catch(() => "");
    return { res, text };
  }

  async function handleExtract() {
    if (!file) {
      setError("Please select a PDF file.");
      return;
    }

    setLoading(true);
    setError(null);

    // Try likely endpoint shapes (based on your Swagger screenshot)
    const candidates = [
      `${BACKEND_URL}/extract?max_rows=500`,
      `${BACKEND_URL}/extract/?max_rows=500`,
      `${BACKEND_URL}/api/extract?max_rows=500`,
      `${BACKEND_URL}/v1/extract?max_rows=500`,
    ];

    // If we previously found a working one, try it first.
    const orderedCandidates = (() => {
      if (!lastGoodExtractUrl) return candidates;
      const dedup = [lastGoodExtractUrl, ...candidates].filter(
        (v, i, a) => a.indexOf(v) === i
      );
      return dedup;
    })();

    try {
      setStatus(`Backend base: ${BACKEND_URL}`);
      console.log("Backend base:", BACKEND_URL);
      console.log("Trying endpoints:", orderedCandidates);

      let lastErr = "";

      for (const url of orderedCandidates) {
        setStatus(`Trying: ${url}`);
        console.log("Trying:", url);

        const { res, text } = await postMultipart(url, file);

        // If FastAPI returns JSON error, it’ll still be text here; log it
        console.log("Result:", res.status, text);

        if (res.ok) {
          let data: any = {};
          try {
            data = JSON.parse(text || "{}");
          } catch {
            // If backend ever returns non-JSON on success, treat as failure
            lastErr = `Endpoint returned non-JSON success at ${url}`;
            continue;
          }

          if (!data?.ok) {
            lastErr = `Endpoint worked but returned ok=false at ${url}`;
            continue;
          }

          // Save the working URL so we try it first next time
          try {
            window.localStorage.setItem(LS_LAST_EXTRACT_URL, url);
            setLastGoodExtractUrl(url);
          } catch {
            // ignore
          }

          setStatus(`Success via: ${url}\nRedirecting to WBS Builder...`);
          // ✅ AUTO NAVIGATE
          await router.push("/estimator/wbs");
          return;
        }

        // keep the most informative failure
        lastErr = `POST ${url} -> ${res.status}: ${text || res.statusText}`;
      }

      throw new Error(lastErr || "No working extract endpoint found.");
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">ProjMgtAI — Upload Plans (PDF)</h1>
            <p className="text-sm text-zinc-300 mt-1">
              Backend: <span className="text-zinc-100">{BACKEND_URL}</span>
            </p>
            {lastGoodExtractUrl && (
              <p className="text-xs text-zinc-400 mt-1">
                Last working extract URL:{" "}
                <span className="text-zinc-200">{lastGoodExtractUrl}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <a
              className="text-sm text-emerald-300 hover:underline"
              href={`${BACKEND_URL}/docs`}
              target="_blank"
              rel="noreferrer"
              title="Open FastAPI docs"
            >
              Open backend docs →
            </a>

            <button
              type="button"
              onClick={() => router.push("/estimator/wbs")}
              className="text-sm text-zinc-200 hover:text-white underline underline-offset-2"
              disabled={loading}
              title="Go to WBS Builder"
            >
              Go to WBS Builder
            </button>
          </div>
        </div>

        <div className="mt-5">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
        </div>

        {status && (
          <div className="mt-3 text-xs text-zinc-300 whitespace-pre-wrap">
            {status}
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-300 whitespace-pre-wrap">
            {error}
          </div>
        )}

        <button
          onClick={handleExtract}
          disabled={loading}
          className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 py-2 rounded"
        >
          {loading ? "Extracting…" : "Extract WBS"}
        </button>

        <div className="mt-4 text-xs text-zinc-400">
          Tip: Open DevTools → Console. This page logs the exact URL and the FastAPI
          response body so we can see what it’s actually hitting.
        </div>
      </div>
    </div>
  );
}
