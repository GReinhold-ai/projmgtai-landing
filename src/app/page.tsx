// src/app/page.tsx
// ProjMgtAI Landing Page — wired to v14 scope extractor
"use client";

import { useState, useRef, useCallback } from "react";

type ExtractorStatus = "idle" | "uploading" | "extracting" | "done" | "error";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ExtractorStatus>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
      setError("");
    } else {
      setError("Please drop a PDF file.");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError("");
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    setStatus("uploading");
    setProgress("Reading PDF...");
    setError("");
    setResultUrl(null);
    setStats(null);

    try {
      // Step 1: Read PDF and extract text client-side using pdf.js would be ideal,
      // but for now we'll send the raw text. The landing page demo uses a simple
      // FormData approach — the API expects { text, sheetRef, projectId }
      // For the demo, we'll read the file as text (OCR text from PDF)
      
      setProgress("Extracting text from PDF...");
      
      // Use the existing OCR/text extraction or send to a helper endpoint
      // For now, read as ArrayBuffer and send to our extract endpoint
      const formData = new FormData();
      formData.append("file", file);

      setStatus("extracting");
      setProgress("Running v14 3-stage pipeline...");

      // Call the v14 extractor via a wrapper that handles PDF→text→extract→Excel
      const response = await fetch("/api/extract-and-export", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Extraction failed" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      // Response is the Excel file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);

      // Try to get stats from response headers
      const statsHeader = response.headers.get("X-Extract-Stats");
      if (statsHeader) {
        try { setStats(JSON.parse(statsHeader)); } catch {}
      }

      setStatus("done");
      setProgress("");
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Something went wrong");
      setProgress("");
    }
  };

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setProgress("");
    setError("");
    setResultUrl(null);
    setStats(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(168deg, #0a0e1a 0%, #0f1729 40%, #111d2e 100%)",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: "linear-gradient(135deg, #22d3ee, #6366f1)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#0a0e1a",
            }}
          >
            P
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>
            ProjMgtAI
          </span>
        </div>
        <div style={{ display: "flex", gap: "32px", fontSize: 13, opacity: 0.7 }}>
          <a href="#features" style={{ color: "inherit", textDecoration: "none" }}>
            Features
          </a>
          <a href="#try" style={{ color: "inherit", textDecoration: "none" }}>
            Try It
          </a>
          <a href="#pipeline" style={{ color: "inherit", textDecoration: "none" }}>
            Pipeline
          </a>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                boxShadow: "0 0 6px #22c55e",
              }}
            />
            API Live
          </span>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          textAlign: "center",
          padding: "100px 20px 80px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            border: "1px solid rgba(34,211,238,0.3)",
            borderRadius: 20,
            fontSize: 12,
            color: "#22d3ee",
            marginBottom: 24,
            letterSpacing: "0.04em",
          }}
        >
          ★ v1.4 Production — Live on Vercel
        </div>
        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 64px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            margin: "0 0 20px",
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          }}
        >
          Construction takeoff,
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #22d3ee, #6366f1, #a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            powered by AI.
          </span>
        </h1>
        <p
          style={{
            fontSize: 16,
            maxWidth: 480,
            margin: "0 auto 36px",
            lineHeight: 1.6,
            opacity: 0.7,
          }}
        >
          Upload architectural plan PDFs. Get structured millwork scope, cabinet specs, 
          bid sheets, and Excel exports — in seconds, not days.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <a
            href="#try"
            style={{
              padding: "12px 28px",
              background: "linear-gradient(135deg, #22d3ee, #6366f1)",
              color: "#0a0e1a",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              transition: "transform 0.2s",
            }}
          >
            Try It Now →
          </a>
          <a
            href="https://api.projmgt.ai"
            style={{
              padding: "12px 28px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            View API Docs
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "60px 40px", textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#22d3ee",
            marginBottom: 12,
          }}
        >
          CAPABILITIES
        </div>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 12,
          }}
        >
          From PDF to bid sheet in one click
        </h2>
        <p style={{ opacity: 0.6, maxWidth: 500, margin: "0 auto 48px", fontSize: 14 }}>
          3-stage AI pipeline: regex pre-processing, Claude Sonnet extraction, 
          post-validation. Every dimension verified, every material coded.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            maxWidth: 900,
            margin: "0 auto",
          }}
        >
          {[
            { icon: "📐", title: "Dimension Extraction", desc: "Architectural dimensions parsed to mm — no defaults, no guessing" },
            { icon: "🎨", title: "Material Codes", desc: "PL-01, SS-1B, FB-01 — every code captured and categorized" },
            { icon: "🔩", title: "Hardware Counts", desc: "Hinges, grommets, shelves — exact quantities per section" },
            { icon: "🏗️", title: "Assembly Detection", desc: "Reception desks, vanities — recognized as single bid items" },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                padding: "28px 24px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" style={{ padding: "60px 40px", textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#22d3ee",
            marginBottom: 12,
          }}
        >
          HOW IT WORKS
        </div>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 12,
          }}
        >
          The extraction pipeline
        </h2>
        <p style={{ opacity: 0.6, maxWidth: 480, margin: "0 auto 40px", fontSize: 14 }}>
          Three stages. Regex pre-processing feeds Claude Sonnet, then post-validation 
          catches errors. Every decision is explainable and auditable.
        </p>

        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
          {[
            { stage: "1", title: "PDF Ingestion + OCR", desc: "Architectural plan sets parsed page-by-page, text extracted" },
            { stage: "2", title: "Regex Pre-Processor", desc: "Dimensions, material codes, hardware, equipment tags — extracted before AI sees the text" },
            { stage: "3", title: "Assembly Detection", desc: "Reception desks, vanities, nurse stations identified as single structures" },
            { stage: "4", title: "Claude Sonnet Extraction", desc: "AI matches pre-extracted hints to items — no inventing, no defaults" },
            { stage: "5", title: "Post-Validation", desc: "Default dimensions flagged, duplicates merged, areas calculated" },
            { stage: "6", title: "Assembly Roll-Up", desc: "Components grouped under parent assemblies with material + hardware summaries" },
            { stage: "7", title: "Excel Export", desc: "5-tab workbook: Bid/Quote, Cabinet List, Parts List, By Room, Summary" },
          ].map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 24,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #22d3ee, #6366f1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0a0e1a",
                  flexShrink: 0,
                }}
              >
                {step.stage}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{step.title}</div>
                <div style={{ fontSize: 13, opacity: 0.5, marginTop: 2 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Try It */}
      <section id="try" style={{ padding: "60px 40px 100px", textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#22d3ee",
            marginBottom: 12,
          }}
        >
          LIVE DEMO
        </div>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 12,
          }}
        >
          Try it now
        </h2>
        <p style={{ opacity: 0.6, marginBottom: 32, fontSize: 14 }}>
          Upload an architectural plan PDF and get a shop order Excel in seconds.
        </p>

        <div
          style={{
            maxWidth: 520,
            margin: "0 auto",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 32,
          }}
        >
          {status === "idle" && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "2px dashed rgba(34,211,238,0.3)",
                  borderRadius: 12,
                  padding: "48px 24px",
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                  marginBottom: file ? 16 : 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(34,211,238,0.6)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)")}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>📎</div>
                <div style={{ fontSize: 14, color: "#22d3ee", fontWeight: 600 }}>
                  Drop a PDF here
                  <span style={{ opacity: 0.5, color: "#e2e8f0", fontWeight: 400 }}>
                    {" "}or click to browse
                  </span>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              {file && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "rgba(34,211,238,0.08)",
                      borderRadius: 8,
                      marginBottom: 16,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>
                      📄 {file.name}{" "}
                      <span style={{ opacity: 0.5 }}>
                        ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); reset(); }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <button
                    onClick={handleExtract}
                    style={{
                      width: "100%",
                      padding: "14px",
                      background: "linear-gradient(135deg, #22d3ee, #6366f1)",
                      color: "#0a0e1a",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Extract Millwork Scope →
                  </button>
                </div>
              )}
            </>
          )}

          {(status === "uploading" || status === "extracting") && (
            <div style={{ padding: "40px 0" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: "3px solid rgba(34,211,238,0.2)",
                  borderTop: "3px solid #22d3ee",
                  borderRadius: "50%",
                  margin: "0 auto 20px",
                  animation: "spin 1s linear infinite",
                }}
              />
              <div style={{ fontSize: 14, fontWeight: 600 }}>{progress}</div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
                {status === "extracting"
                  ? "Stage 1: Regex → Stage 2: Claude Sonnet → Stage 3: Validation"
                  : "Preparing file..."}
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {status === "done" && resultUrl && (
            <div style={{ padding: "24px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                Extraction Complete
              </div>
              {stats && (
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.6,
                    marginBottom: 20,
                    lineHeight: 1.8,
                  }}
                >
                  {stats.totalItems} items · {stats.withDimensions} with dimensions · 
                  {stats.withMaterials} with materials · {stats.flaggedDefaults} flagged defaults
                </div>
              )}
              <a
                href={resultUrl}
                download={`shop_order_${file?.name?.replace(".pdf", "")}.xlsx`}
                style={{
                  display: "inline-block",
                  padding: "14px 32px",
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  marginBottom: 12,
                }}
              >
                ⬇ Download Excel
              </a>
              <br />
              <button
                onClick={reset}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#e2e8f0",
                  padding: "10px 24px",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  marginTop: 8,
                  fontFamily: "inherit",
                }}
              >
                Extract Another
              </button>
            </div>
          )}

          {status === "error" && (
            <div style={{ padding: "24px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ef4444", marginBottom: 8 }}>
                {error}
              </div>
              <button
                onClick={reset}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#e2e8f0",
                  padding: "10px 24px",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {error && status === "idle" && (
          <div style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</div>
        )}
      </section>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "40px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: 12,
          opacity: 0.4,
        }}
      >
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 12 }}>
          <a href="https://api.projmgt.ai" style={{ color: "inherit", textDecoration: "none" }}>
            API Documentation
          </a>
          <a
            href="https://github.com/GReinhold-ai/projmgtai-landing"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            GitHub
          </a>
        </div>
        © 2026 ProjMgtAI — Construction Intelligence, not guesswork.
      </footer>
    </main>
  );
}
