// pages/index.tsx  v14.9.32
// Fixes 413: PDFs now upload directly browser -> Vercel Blob (no size limit).
// process-upload receives only JSON metadata + blob URLs.

import React, { useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { upload } from "@vercel/blob/client";

type UploadStatus = "idle" | "uploading" | "done" | "error";

const PROJECT_TYPES = [
  "Fitness / Recreation",
  "Hospitality / Restaurant",
  "Golf / Country Club",
  "Healthcare / Medical Office",
  "Corporate / Office",
  "Retail / Commercial",
  "Multi-Family Residential",
  "Other",
];

const FILE_TAGS = ["Plans", "Specs", "Addenda", "Shop Drawings"];

type FileEntry = { file: File; tag: string; };

export default function HomePage() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState(PROJECT_TYPES[0]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoTag(filename: string): string {
    const lower = filename.toLowerCase();
    if (/spec|division|div\d|csi/.test(lower)) return "Specs";
    if (/addend|delta|revision|rev-\d/.test(lower)) return "Addenda";
    if (/shop|submittal|sub/.test(lower)) return "Shop Drawings";
    return "Plans";
  }

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const added: FileEntry[] = [];
    for (let i = 0; i < newFiles.length; i++) {
      const f = newFiles[i];
      if (f.type === "application/pdf") added.push({ file: f, tag: autoTag(f.name) });
    }
    setEntries(prev => [...prev, ...added]);
    setErrorMsg("");
  }

  function removeEntry(i: number) { setEntries(prev => prev.filter((_, idx) => idx !== i)); }
  function updateTag(i: number, tag: string) {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, tag } : e));
  }

  async function handleSubmit() {
    if (!email || !company) { setErrorMsg("Email and company name are required."); return; }
    if (entries.length === 0) { setErrorMsg("Please attach at least one PDF."); return; }

    setStatus("uploading");
    setErrorMsg("");

    try {
      // Step 1: Upload each PDF directly to Vercel Blob (bypasses 4.5MB serverless limit)
      const blobUrls: { url: string; filename: string; tag: string }[] = [];

      for (let i = 0; i < entries.length; i++) {
        const { file, tag } = entries[i];
        setUploadProgress(`Uploading file ${i + 1} of ${entries.length}: ${file.name}...`);

        const blob = await upload(
          `uploads/${Date.now()}_${file.name}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/blob-upload-token",
          }
        );

        blobUrls.push({ url: blob.url, filename: file.name, tag });
      }

      // Step 2: Send metadata + blob URLs to process-upload (tiny JSON payload)
      setUploadProgress("Logging upload and sending confirmation...");

      const res = await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          company,
          project_name: projectName || `${company} Project`,
          project_type: projectType,
          blob_urls: blobUrls,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      setStatus("done");
      setUploadProgress("");
    } catch (err: any) {
      setErrorMsg(err.message || "Upload failed. Please try again.");
      setStatus("error");
      setUploadProgress("");
    }
  }

  function reset() {
    setEntries([]); setEmail(""); setCompany(""); setProjectName("");
    setProjectType(PROJECT_TYPES[0]); setStatus("idle");
    setErrorMsg(""); setUploadProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const totalMB = entries.reduce((s, e) => s + e.file.size, 0) / 1024 / 1024;

  return (
    <>
      <Head>
        <title>ProjMgtAI - Millwork Scope Extraction</title>
        <meta name="description" content="Upload architectural plan PDFs. AI extracts millwork scope by room and delivers a bid-ready Excel workbook." />
      </Head>

      <main style={{ minHeight: "100vh", background: "linear-gradient(168deg,#0a0e1a 0%,#0f1729 40%,#111d2e 100%)", color: "#e2e8f0", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" }}>

        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#22d3ee,#6366f1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#0a0e1a" }}>P</div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>ProjMgtAI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/scope-extractor" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>Scope Extractor</Link>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, opacity: 0.6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
              v14.9.32 Live
            </span>
          </div>
        </nav>

        <section style={{ textAlign: "center", padding: "72px 20px 48px" }}>
          <div style={{ display: "inline-block", padding: "6px 16px", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 20, fontSize: 12, color: "#22d3ee", marginBottom: 24, letterSpacing: "0.05em" }}>
            AI-native millwork estimating
          </div>
          <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px" }}>
            Full project takeoff,<br />
            <span style={{ background: "linear-gradient(135deg,#22d3ee,#6366f1,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              every room, one upload.
            </span>
          </h1>
          <p style={{ fontSize: 15, maxWidth: 480, margin: "0 auto 0", lineHeight: 1.7, opacity: 0.65 }}>
            Upload your plan PDFs. AI groups pages by room, resolves material specs,
            and delivers a bid-ready Excel workbook with WBS, RFIs, and cut sheets.
          </p>
        </section>

        <section style={{ padding: "0 20px 80px" }}>
          <div style={{ maxWidth: 600, margin: "0 auto", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "32px 36px" }}>

            {status === "done" ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Upload received</div>
                <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 28, lineHeight: 1.7 }}>
                  Check <strong style={{ color: "#e2e8f0" }}>{email}</strong> for your results link — usually within 2-3 minutes.
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link href="/scope-extractor" style={{ display: "inline-block", padding: "12px 28px", background: "linear-gradient(135deg,#22d3ee,#6366f1)", color: "#0a0e1a", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                    Open Scope Extractor
                  </Link>
                  <button onClick={reset} style={{ padding: "12px 28px", background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#e2e8f0", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                    Upload Another
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Email *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                      style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Company *</label>
                    <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="North County Cabinetry"
                      style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Project Name</label>
                    <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="24hr Fitness Navajo"
                      style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Project Type</label>
                    <select value={projectType} onChange={e => setProjectType(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", background: "#141720", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}>
                      {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: "2px dashed rgba(34,211,238,0.25)", borderRadius: 10, padding: entries.length > 0 ? "20px 20px 12px" : "36px 20px", cursor: "pointer", marginBottom: 16 }}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={e => handleFiles(e.target.files)} style={{ display: "none" }} />

                  {entries.length === 0 ? (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>📎</div>
                      <div style={{ fontSize: 14, color: "#22d3ee", fontWeight: 600, marginBottom: 4 }}>
                        Drop PDFs here <span style={{ opacity: 0.5, color: "#e2e8f0", fontWeight: 400 }}>or click to browse</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.4 }}>Plans, specs, addenda — up to 150 MB per file</div>
                    </div>
                  ) : (
                    <div onClick={e => e.stopPropagation()}>
                      {entries.map((entry, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 10px", background: "rgba(34,211,238,0.06)", borderRadius: 6 }}>
                          <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.9 }}>
                            📄 {entry.file.name}
                            <span style={{ opacity: 0.45, marginLeft: 6 }}>({(entry.file.size / 1024).toFixed(0)} KB)</span>
                          </span>
                          <select value={entry.tag} onChange={e => { e.stopPropagation(); updateTag(i, e.target.value); }}
                            style={{ padding: "4px 8px", background: "#141720", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, color: "#e2e8f0", fontSize: 12 }}>
                            {FILE_TAGS.map(t => <option key={t}>{t}</option>)}
                          </select>
                          <button onClick={e => { e.stopPropagation(); removeEntry(i); }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
                        </div>
                      ))}
                      <div onClick={() => fileInputRef.current?.click()}
                        style={{ fontSize: 12, color: "#22d3ee", opacity: 0.7, cursor: "pointer", textAlign: "center", paddingTop: 4 }}>
                        + Add more files
                      </div>
                    </div>
                  )}
                </div>

                {entries.length > 0 && (
                  <div style={{ fontSize: 12, opacity: 0.4, marginBottom: 16, textAlign: "right" }}>
                    {entries.length} file{entries.length !== 1 ? "s" : ""} — {totalMB.toFixed(1)} MB
                  </div>
                )}

                {uploadProgress && (
                  <div style={{ fontSize: 13, color: "#22d3ee", marginBottom: 14, padding: "10px 14px", background: "rgba(34,211,238,0.06)", borderRadius: 7 }}>
                    {uploadProgress}
                  </div>
                )}

                {errorMsg && (
                  <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 14, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 7 }}>
                    {errorMsg}
                  </div>
                )}

                <button onClick={handleSubmit} disabled={status === "uploading"}
                  style={{ width: "100%", padding: "14px", background: status === "uploading" ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#22d3ee,#6366f1)", color: "#0a0e1a", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: status === "uploading" ? "wait" : "pointer" }}>
                  {status === "uploading" ? "Uploading..." : "Submit for Extraction →"}
                </button>

                <p style={{ textAlign: "center", marginTop: 14, fontSize: 12, opacity: 0.4 }}>
                  Results emailed within 2-3 minutes.{" "}
                  <Link href="/scope-extractor" style={{ color: "#22d3ee", textDecoration: "none", opacity: 0.8 }}>
                    Run extraction yourself instead →
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>

        <section style={{ padding: "0 40px 80px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            {[
              ["📋", "All Items", "Every scope item extracted by room with dims and materials"],
              ["🗂", "WBS Summary", "Trade hierarchy — cabinetry, countertops, shelving, hardware"],
              ["✅", "Bid Checklist", "Blocking, ADA, hardware, and finish flagged per room"],
              ["🔍", "RFI Log", "Missing scope, dims, and material gaps auto-detected"],
              ["✂", "Parts List", "AWI 300 cut sheet — part, qty, L x W x T, material"],
            ].map(([icon, title, desc]) => (
              <div key={title as string} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "20px 20px 18px" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, opacity: 0.5, lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ textAlign: "center", padding: "32px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, opacity: 0.35 }}>
          ProjMgtAI - Centriv AI - Fullerton CA
        </footer>
      </main>
    </>
  );
}
