// pages/index.tsx  v14.9.33
// Fix CORS: removed @vercel/blob/client entirely.
// Flow: capture email/company/projectType -> POST metadata to /api/process-upload
// -> redirect to /scope-extractor so user uploads PDF there directly.
// Binary PDFs never touch a serverless function from this page.

import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

type FormStatus = "idle" | "submitting" | "done" | "error";

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

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState(PROJECT_TYPES[0]);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit() {
    if (!email || !company) {
      setErrorMsg("Email and company name are required.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    // Log lead to Supabase + send confirmation email
    // No binary data — just metadata
    try {
      const res = await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          company,
          project_name: projectName || `${company} Project`,
          project_type: projectType,
          blob_urls: [],
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
    } catch (err: any) {
      // Non-fatal — still redirect to scope extractor
      console.warn("[homepage] process-upload failed:", err.message);
    }

    // Redirect to scope extractor regardless — that's where the work happens
    router.push("/scope-extractor");
  }

  return (
    <>
      <Head>
        <title>ProjMgtAI - Millwork Scope Extraction</title>
        <meta name="description" content="Upload architectural plan PDFs. AI extracts millwork scope by room and delivers a bid-ready Excel workbook." />
      </Head>

      <main style={{ minHeight: "100vh", background: "linear-gradient(168deg,#0a0e1a 0%,#0f1729 40%,#111d2e 100%)", color: "#e2e8f0", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" }}>

        {/* Nav */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#22d3ee,#6366f1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#0a0e1a" }}>P</div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>ProjMgtAI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/scope-extractor" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>Scope Extractor</Link>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, opacity: 0.6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
              v14.9.33 Live
            </span>
          </div>
        </nav>

        {/* Hero */}
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

        {/* Lead capture form */}
        <section style={{ padding: "0 20px 80px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "32px 36px" }}>

            <p style={{ fontSize: 13, opacity: 0.5, margin: "0 0 20px", textAlign: "center" }}>
              Enter your details to get started — then upload your PDFs on the next screen.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Company *</label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="North County Cabinetry"
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="24hr Fitness Navajo"
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.5, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Project Type</label>
                <select
                  value={projectType}
                  onChange={e => setProjectType(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", background: "#141720", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                >
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {errorMsg && (
              <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 14, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 7 }}>
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={status === "submitting"}
              style={{ width: "100%", padding: "14px", background: status === "submitting" ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#22d3ee,#6366f1)", color: "#0a0e1a", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: status === "submitting" ? "wait" : "pointer" }}
            >
              {status === "submitting" ? "Starting..." : "Start Extraction →"}
            </button>

            <p style={{ textAlign: "center", marginTop: 14, fontSize: 12, opacity: 0.4 }}>
              Already have an account?{" "}
              <Link href="/scope-extractor" style={{ color: "#22d3ee", textDecoration: "none" }}>
                Go straight to the extractor →
              </Link>
            </p>
          </div>
        </section>

        {/* Feature strip */}
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
