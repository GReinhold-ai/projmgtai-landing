// src/components/EstimatorLanding.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getFirebaseApp } from "@/firebase";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

// --- Small helpers -----------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8080";

type Trade =
  | "Electrical"
  | "Mechanical"
  | "Plumbing"
  | "Fire Protection"
  | "Structural"
  | "Architectural"
  | "Civil";

const ALL_TRADES: Trade[] = [
  "Electrical",
  "Mechanical",
  "Plumbing",
  "Fire Protection",
  "Structural",
  "Architectural",
  "Civil",
];

// -----------------------------------------------------------------------------

export default function EstimatorLanding() {
  // ----- Firebase singletons -----
  const app = useMemo(() => getFirebaseApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);

  // ----- Auth state -----
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      await setPersistence(auth, browserLocalPersistence);

      unsub = onAuthStateChanged(auth, async (user: User | null) => {
        if (!user) {
          try {
            await signInAnonymously(auth);
            // onAuthStateChanged will fire again with the user
            return;
          } catch (err) {
            console.error("Anonymous sign-in failed:", err);
          }
        }
        setUid(user ? user.uid : null);
        setAuthReady(true);
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [auth]);

  // ----- UI state (very lightweight wizard) -----
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 – basic (optional) project info
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [projectName, setProjectName] = useState("");

  // Step 2 – file + trades
  const [file, setFile] = useState<File | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);

  // Parse
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  // ----- Helpers -----

  const toggleTrade = (t: Trade) => {
    setTrades((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : prev.concat(t)
    );
  };

  const canGoNextFromStep1 = true; // nothing required on step 1
  const canGoNextFromStep2 = !!file && trades.length > 0;
  const parseDisabled = !authReady || !uid || !file || trades.length === 0 || busy;

  // Creates a project doc prior to parsing
  const ensureProjectDoc = useCallback(async (): Promise<string> => {
    if (!uid) throw new Error("Please sign in to create a project.");
    const projectId = crypto.randomUUID();

    await setDoc(doc(db, "projects", projectId), {
      owner: uid,
      company: company || null,
      email: email || null,
      name: projectName || null,
      createdAt: serverTimestamp(),
      status: "draft",
      uiVersion: 1,
    });

    return projectId;
  }, [db, uid, company, email, projectName]);

  // Saves parsed results to Firestore: projects/<id>/scopes/<trade>
  const saveResults = useCallback(
    async (projectId: string, resultsByTrade: Record<string, any[]>) => {
      const batch = writeBatch(db);
      Object.entries(resultsByTrade).forEach(([trade, items]) => {
        const ref = doc(db, "projects", projectId, "scopes", trade);
        batch.set(ref, {
          trade,
          items: Array.isArray(items) ? items : [],
          savedAt: serverTimestamp(),
        });
      });
      await batch.commit();

      // also mark project as parsed
      await setDoc(
        doc(db, "projects", projectId),
        { status: "parsed", parsedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [db]
  );

  // Core parse action
  const handleParse = useCallback(async () => {
    if (!file) return;
    if (!uid) {
      alert("Please wait for sign-in (or refresh).");
      return;
    }

    setBusy(true);
    setStatus("Creating project…");

    try {
      const projectId = await ensureProjectDoc();

      setStatus("Uploading & parsing…");

      const form = new FormData();
      form.append("file", file, file.name);
      form.append("trades_json", JSON.stringify(trades));

      const resp = await fetch(`${API_BASE}/analyze/parse_plans`, {
        method: "POST",
        headers: {
          // backend expects these:
          "X-User-Id": uid,
          "X-Plan": "free",
        },
        body: form,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(
          `Backend error ${resp.status} ${resp.statusText}${
            errText ? `: ${errText}` : ""
          }`
        );
      }

      const data = (await resp.json()) as {
        trades: string[];
        results: Record<string, any[]>;
      };

      setStatus("Saving results…");
      await saveResults(projectId, data.results || {});
      setStatus("Done! Results saved to Firestore.");
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setStatus(err?.message || "Failed to parse.");
      alert(status || err?.message || "Failed to parse.");
    } finally {
      setBusy(false);
    }
  }, [file, trades, uid, ensureProjectDoc, saveResults]);

  // ----- Render -----
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-1">
        ProjMgtAI — Subcontractor Bidding Assistant
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        Intake your project, upload plans (PDF), select trades, and
        auto-extract scope → export XLSX.
      </p>

      <div className="rounded border p-3 mb-6 text-sm">
        <strong>Free Tier:</strong> 3 projects total.&nbsp;
        <span className="inline-block ml-2">
          {authReady ? (
            uid ? (
              <span className="text-green-600">Signed in (anonymous)</span>
            ) : (
              <span className="text-red-600">Not signed in</span>
            )
          ) : (
            <span>Checking sign-in…</span>
          )}
        </span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className={`h-2 w-2 rounded-full ${step >= 1 ? "bg-green-600" : "bg-gray-300"}`} />
        <span>Project Info</span>
        <span className="mx-1 text-gray-400">→</span>
        <span className={`h-2 w-2 rounded-full ${step >= 2 ? "bg-green-600" : "bg-gray-300"}`} />
        <span>Upload & Trades</span>
        <span className="mx-1 text-gray-400">→</span>
        <span className={`h-2 w-2 rounded-full ${step >= 3 ? "bg-green-600" : "bg-gray-300"}`} />
        <span>Parse & Export</span>
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="rounded border p-4">
          <h2 className="font-medium mb-3">1) Project Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Company</label>
              <input
                className="border rounded w-full p-2"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Construction"
              />
            </div>
            <div>
              <label className="text-sm">Email</label>
              <input
                className="border rounded w-full p-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="estimator@acme.com"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm">Project Name</label>
              <input
                className="border rounded w-full p-2"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Tenant Improvement — 3rd Floor"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="px-4 py-2 rounded border"
              onClick={() => {
                // optionally clear form
                setCompany("");
                setEmail("");
                setProjectName("");
              }}
            >
              Clear
            </button>
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={() => setStep(2)}
              disabled={!canGoNextFromStep1}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="rounded border p-4">
          <h2 className="font-medium mb-3">2) Upload Plans & Select Trades</h2>

          <div className="mb-4">
            <label className="text-sm block mb-1">Plan Set (PDF)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <div className="text-xs text-gray-600 mt-1">
                Selected: {file.name} ({Math.ceil(file.size / 1024)} KB)
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="text-sm block mb-2">Trades</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TRADES.map((t) => {
                const active = trades.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTrade(t)}
                    className={`px-3 py-1 rounded border text-sm ${
                      active ? "bg-emerald-50 border-emerald-400" : ""
                    }`}
                    type="button"
                  >
                    {active ? "✓ " : ""} {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            <button className="px-4 py-2 rounded border" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={() => setStep(3)}
              disabled={!canGoNextFromStep2}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="rounded border p-4">
          <h2 className="font-medium mb-3">3) Parse & Export</h2>
          <p className="text-sm mb-4">
            This will analyze your PDF for the selected trades and create a scope list per
            trade. Results are saved in Firestore under{" "}
            <code>projects/&lt;id&gt;/scopes/&lt;trade&gt;</code>.
          </p>

          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
              onClick={handleParse}
              disabled={parseDisabled}
            >
              {busy ? "Parsing…" : "Parse Plans"}
            </button>

            {status && <span className="text-sm text-gray-700">{status}</span>}
          </div>

          <div className="mt-4">
            <button className="px-4 py-2 rounded border" onClick={() => setStep(2)}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
