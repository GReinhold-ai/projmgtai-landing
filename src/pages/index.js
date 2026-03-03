import { useState, useEffect, useRef } from "react";

const API_BASE = "https://api.projmgt.ai";

function FeatureCard({ icon, title, desc, delay }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="feature-card"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

function StatusDot() {
  const [alive, setAlive] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setAlive(d.ok === true))
      .catch(() => setAlive(false));
  }, []);

  return (
    <span className="status-dot-wrap">
      <span
        className="status-dot"
        style={{ background: alive === null ? "#666" : alive ? "#00e676" : "#ff1744" }}
      />
      <span className="status-label">
        {alive === null ? "Checking…" : alive ? "API Live" : "API Offline"}
      </span>
    </span>
  );
}

export default function LandingPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/extract?auto_classify=true`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(`${API_BASE}/export/shop-order`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shop_order.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") setFile(f);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,300&family=JetBrains+Mono:wght@400;600&display=swap');

        :root {
          --bg-primary: #0a0f1a;
          --bg-secondary: #111827;
          --bg-card: #161e2e;
          --accent: #3b82f6;
          --accent-bright: #60a5fa;
          --accent-glow: rgba(59, 130, 246, 0.15);
          --green: #10b981;
          --green-glow: rgba(16, 185, 129, 0.15);
          --text-primary: #f1f5f9;
          --text-secondary: #94a3b8;
          --text-muted: #64748b;
          --border: #1e293b;
          --border-hover: #334155;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--bg-primary);
          color: var(--text-primary);
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }

        /* ── HERO ─────────────────────────────── */
        .hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          text-align: center;
          overflow: hidden;
        }

        .hero::before {
          content: '';
          position: absolute;
          top: -40%;
          left: 50%;
          transform: translateX(-50%);
          width: 900px;
          height: 900px;
          background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .hero::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--border), transparent);
        }

        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 80px 80px;
          opacity: 0.25;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 1;
          max-width: 720px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 2rem;
          letter-spacing: 0.04em;
          animation: fadeDown 0.8s ease-out;
        }

        .badge .dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        h1 {
          font-size: clamp(2.8rem, 6vw, 4.5rem);
          font-weight: 700;
          line-height: 1.08;
          letter-spacing: -0.03em;
          margin-bottom: 1.5rem;
          animation: fadeUp 0.8s ease-out 0.15s both;
        }

        h1 .gradient {
          background: linear-gradient(135deg, var(--accent-bright), var(--green));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subtitle {
          font-size: 1.15rem;
          color: var(--text-secondary);
          line-height: 1.7;
          max-width: 540px;
          margin: 0 auto 2.5rem;
          animation: fadeUp 0.8s ease-out 0.3s both;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          animation: fadeUp 0.8s ease-out 0.45s both;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          border-radius: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          text-decoration: none;
          border: none;
        }

        .btn-primary {
          background: var(--accent);
          color: white;
          box-shadow: 0 0 30px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .btn-primary:hover {
          background: var(--accent-bright);
          transform: translateY(-2px);
          box-shadow: 0 0 50px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15);
        }

        .btn-secondary {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }
        .btn-secondary:hover {
          border-color: var(--border-hover);
          background: var(--bg-secondary);
          transform: translateY(-2px);
        }

        /* ── FEATURES ─────────────────────────── */
        .features {
          padding: 6rem 2rem;
          max-width: 1100px;
          margin: 0 auto;
        }

        .section-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--accent);
          margin-bottom: 1rem;
        }

        .section-title {
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 1rem;
        }

        .section-desc {
          color: var(--text-secondary);
          font-size: 1.05rem;
          max-width: 600px;
          line-height: 1.7;
          margin-bottom: 3.5rem;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .feature-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2rem;
          transition: all 0.3s ease;
        }
        .feature-card:hover {
          border-color: var(--border-hover);
          transform: translateY(-4px);
          box-shadow: 0 8px 40px rgba(0,0,0,0.3);
        }

        .feature-icon {
          font-size: 2rem;
          margin-bottom: 1rem;
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: var(--accent-glow);
        }

        .feature-card h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.6rem;
        }

        .feature-card p {
          color: var(--text-secondary);
          font-size: 0.92rem;
          line-height: 1.65;
        }

        /* ── UPLOAD SECTION ───────────────────── */
        .upload-section {
          padding: 6rem 2rem;
          max-width: 720px;
          margin: 0 auto;
          text-align: center;
        }

        .drop-zone {
          border: 2px dashed var(--border);
          border-radius: 20px;
          padding: 3.5rem 2rem;
          margin: 2rem 0;
          cursor: pointer;
          transition: all 0.3s ease;
          background: var(--bg-secondary);
          position: relative;
        }
        .drop-zone.drag-over {
          border-color: var(--accent);
          background: var(--accent-glow);
        }
        .drop-zone:hover {
          border-color: var(--border-hover);
        }

        .drop-zone .icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .drop-zone .label {
          font-size: 1rem;
          color: var(--text-secondary);
        }
        .drop-zone .label strong {
          color: var(--accent-bright);
        }

        .file-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          margin-bottom: 1.5rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .file-info .name { color: var(--text-primary); }

        .result-box {
          text-align: left;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2rem;
          margin-top: 1.5rem;
        }

        .result-box h3 {
          font-size: 1.1rem;
          margin-bottom: 1.2rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .stat {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 1rem;
        }

        .stat .value {
          font-size: 1.6rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          color: var(--accent-bright);
        }

        .stat .label {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .error-msg {
          background: rgba(255, 23, 68, 0.1);
          border: 1px solid rgba(255, 23, 68, 0.3);
          border-radius: 10px;
          padding: 1rem 1.5rem;
          color: #ff6b6b;
          margin-top: 1rem;
          font-size: 0.9rem;
        }

        .download-row {
          margin-top: 1.5rem;
          display: flex;
          gap: 1rem;
          justify-content: center;
        }

        /* ── PIPELINE ─────────────────────────── */
        .pipeline {
          padding: 6rem 2rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .pipeline-steps {
          display: flex;
          flex-direction: column;
          gap: 0;
          position: relative;
          padding-left: 2.5rem;
        }

        .pipeline-steps::before {
          content: '';
          position: absolute;
          left: 15px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, var(--accent), var(--green));
          border-radius: 2px;
        }

        .step {
          position: relative;
          padding: 1.2rem 0 1.2rem 1.5rem;
        }

        .step::before {
          content: '';
          position: absolute;
          left: -2rem;
          top: 1.5rem;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent);
          border: 3px solid var(--bg-primary);
          box-shadow: 0 0 10px var(--accent-glow);
        }

        .step .step-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .step .step-desc {
          font-size: 0.88rem;
          color: var(--text-muted);
        }

        /* ── FOOTER ───────────────────────────── */
        .footer {
          padding: 3rem 2rem;
          text-align: center;
          border-top: 1px solid var(--border);
        }

        .footer-links {
          display: flex;
          gap: 2rem;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .footer-links a {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.85rem;
          transition: color 0.2s;
        }
        .footer-links a:hover { color: var(--text-primary); }

        .footer-copy {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        /* ── STATUS ───────────────────────────── */
        .status-dot-wrap {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .status-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .status-label { font-size: 0.8rem; color: var(--text-muted); }

        /* ── NAV ──────────────────────────────── */
        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 1rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(10, 15, 26, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }

        .nav-brand {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .nav-brand .mark {
          background: linear-gradient(135deg, var(--accent), var(--green));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .nav-links a {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: color 0.2s;
        }
        .nav-links a:hover { color: var(--text-primary); }

        .spinner {
          display: inline-block;
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .hero { padding: 6rem 1.5rem 3rem; }
          .stat-grid { grid-template-columns: 1fr; }
          .hero-actions { flex-direction: column; align-items: center; }
          .nav-links { gap: 0.8rem; }
          .pipeline-steps { padding-left: 2rem; }
        }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <span>📐</span>
          <span className="mark">ProjMgtAI</span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#demo">Try It</a>
          <a href={`${API_BASE}/docs`} target="_blank" rel="noopener">
            API Docs
          </a>
          <StatusDot />
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="grid-bg" />
        <div className="hero-content">
          <div className="badge">
            <span className="dot" />
            v1.0 Production — Live on Vercel
          </div>
          <h1>
            Construction takeoff,
            <br />
            <span className="gradient">powered by AI.</span>
          </h1>
          <p className="subtitle">
            Upload architectural plan PDFs. Get structured millwork scope, cabinet
            specs, bid sheets, and Excel exports — in seconds, not days.
          </p>
          <div className="hero-actions">
            <a href="#demo" className="btn btn-primary">
              Try It Now →
            </a>
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noopener"
              className="btn btn-secondary"
            >
              View API Docs
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="section-label">Capabilities</div>
        <h2 className="section-title">From PDF to bid sheet in one click</h2>
        <p className="section-desc">
          Deterministic, auditable AI — no black-box guessing. Every classification
          is rule-based, every output is Excel-ready.
        </p>
        <div className="features-grid">
          <FeatureCard
            icon="📄"
            title="PDF Extraction"
            desc="OCR'd architectural plans parsed with pdfplumber. Line-by-line text extraction with intelligent noise filtering."
            delay={0}
          />
          <FeatureCard
            icon="🏗️"
            title="Millwork Classification"
            desc="Rule-based engine classifies cabinets, countertops, trim, and millwork items. Base, wall, tall, drawer — all mapped to Woodwork Institute codes."
            delay={0.1}
          />
          <FeatureCard
            icon="📐"
            title="Dimension Validation"
            desc="Height 6-96″, width 6-72″, drawer heights 3-18″. OCR errors caught and flagged automatically."
            delay={0.2}
          />
          <FeatureCard
            icon="📊"
            title="5-Tab Excel Export"
            desc="Bid/Quote sheet, Cabinet List, Parts List, By Room breakdown, and Summary — ready for estimators and subs."
            delay={0.3}
          />
          <FeatureCard
            icon="🔍"
            title="Material Extraction"
            desc="Countertop materials, thicknesses, trim finishes, and molding profiles extracted from plan text automatically."
            delay={0.4}
          />
          <FeatureCard
            icon="⚡"
            title="Production API"
            desc="FastAPI backend on Vercel. Upload a PDF, get structured JSON or Excel. Integrate with any frontend or workflow."
            delay={0.5}
          />
        </div>
      </section>

      {/* PIPELINE */}
      <section className="pipeline">
        <div className="section-label">How It Works</div>
        <h2 className="section-title">The extraction pipeline</h2>
        <p className="section-desc">
          Seven deterministic stages. No LLM dependency. Every decision is
          explainable and auditable.
        </p>
        <div className="pipeline-steps">
          <div className="step">
            <div className="step-title">PDF Ingestion</div>
            <div className="step-desc">
              OCR'd architectural plan sets parsed page by page
            </div>
          </div>
          <div className="step">
            <div className="step-title">Hard Exclusion Engine</div>
            <div className="step-desc">
              Title blocks, boilerplate, notes, contacts, OCR junk — filtered out
            </div>
          </div>
          <div className="step">
            <div className="step-title">Millwork Classification</div>
            <div className="step-desc">
              Rule-based engine tags cabinets, countertops, trim, accessories
            </div>
          </div>
          <div className="step">
            <div className="step-title">Cabinet Mapping</div>
            <div className="step-desc">
              Items mapped to Woodwork Institute 100/200/300/400 series codes
            </div>
          </div>
          <div className="step">
            <div className="step-title">Dimension Validation</div>
            <div className="step-desc">
              Height, width, drawer sizes checked against real-world constraints
            </div>
          </div>
          <div className="step">
            <div className="step-title">Material Extraction</div>
            <div className="step-desc">
              Countertop materials, thickness, trim finishes parsed from text
            </div>
          </div>
          <div className="step">
            <div className="step-title">Excel Export</div>
            <div className="step-desc">
              5-tab workbook: Bid/Quote, Cabinet List, Parts List, By Room, Summary
            </div>
          </div>
        </div>
      </section>

      {/* DEMO / UPLOAD */}
      <section className="upload-section" id="demo">
        <div className="section-label">Live Demo</div>
        <h2 className="section-title">Try it now</h2>
        <p className="section-desc" style={{ margin: "0 auto" }}>
          Upload an architectural plan PDF and get a shop order Excel in seconds.
        </p>

        <div
          className={`drop-zone ${dragOver ? "drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div className="icon">📎</div>
          <div className="label">
            <strong>Drop a PDF here</strong> or click to browse
          </div>
        </div>

        {file && (
          <div className="file-info">
            📄 <span className="name">{file.name}</span>
            <span>({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
          </div>
        )}

        {file && !result && (
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {uploading ? (
              <>
                <span className="spinner" /> Extracting…
              </>
            ) : (
              "Extract & Classify →"
            )}
          </button>
        )}

        {error && <div className="error-msg">⚠️ {error}</div>}

        {result && (
          <div className="result-box">
            <h3>✅ Extraction Complete</h3>
            <div className="stat-grid">
              <div className="stat">
                <div className="value">{result.total_rows}</div>
                <div className="label">Total Rows</div>
              </div>
              <div className="stat">
                <div className="value">{result.millwork_count}</div>
                <div className="label">Millwork Items</div>
              </div>
              <div className="stat">
                <div className="value">{result.excluded_count}</div>
                <div className="label">Excluded</div>
              </div>
              <div className="stat">
                <div className="value">{result.classification_rate}</div>
                <div className="label">Classification Rate</div>
              </div>
            </div>
            <div className="download-row">
              <button className="btn btn-primary" onClick={handleDownload}>
                ⬇ Download Shop Order (Excel)
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError(null);
                }}
              >
                Upload Another
              </button>
            </div>
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-links">
          <a href={`${API_BASE}/docs`} target="_blank" rel="noopener">
            API Documentation
          </a>
          <a href="https://github.com/GReinhold-ai/ProjMgt.ai" target="_blank" rel="noopener">
            GitHub
          </a>
          <a href={`${API_BASE}/health`} target="_blank" rel="noopener">
            System Status
          </a>
        </div>
        <div className="footer-copy">
          © {new Date().getFullYear()} ProjMgtAI — Construction intelligence, not guesswork.
        </div>
      </footer>
    </>
  );
}
