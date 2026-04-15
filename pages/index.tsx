// pages/index.tsx  v14.9.37
// Homepage redesign: light/professional, two CTAs (Try Free + See Pricing)
// Font: DM Sans + DM Mono via Google Fonts
// Palette: warm off-white bg, near-black text, gold accent

import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

const FEATURES = [
  {
    label: "Scope Extraction",
    title: "Every room. Every item.",
    body: "AI reads your architectural PDFs page by page, groups by room, and pulls every millwork item — cabinets, countertops, shelving, hardware — into a structured line-item list.",
    stat: "132 items", sub: "from a 21-page plan set",
  },
  {
    label: "WBS + RFI Output",
    title: "Bid-ready in minutes.",
    body: "Six-tab Excel workbook: All Items, WBS Summary, Bid Checklist, RFI Log, Per-Room tabs, and AWI 300 Parts List. Ready to price the same day drawings arrive.",
    stat: "6 tabs", sub: "one download",
  },
  {
    label: "AWI 300 Cut Sheet",
    title: "From scope to shop floor.",
    body: "Every cabinet exploded into its component parts — sides, bottom, back, face frame, doors, drawers — with L×W×T dimensions and material codes. Feeds directly to your panel saw or CNC.",
    stat: "AWI 300", sub: "construction standard",
  },
];

const PROOF = [
  { label: "Plan pages processed", value: "2,400+" },
  { label: "Rooms extracted", value: "340+" },
  { label: "Accuracy vs ground truth", value: "~94%" },
  { label: "Time to first Excel", value: "< 3 min" },
];

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleTryFree() {
    if (!email) { router.push("/scope-extractor"); return; }
    setSubmitting(true);
    try {
      // v14.9.39: Store email in sessionStorage so scope extractor can capture PDFs
      try { sessionStorage.setItem("projmgtai_email", email); } catch (_) {}

      await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company: email.split("@")[1]?.split(".")[0] || "unknown", project_name: "Homepage signup", project_type: "signup", blob_urls: [] }),
      });
    } catch (_) {}
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => router.push("/scope-extractor"), 800);
  }

  return (
    <>
      <Head>
        <title>ProjMgtAI — Millwork Scope Extraction</title>
        <meta name="description" content="AI extracts millwork scope from architectural PDFs. Bid-ready Excel with WBS, RFIs, and AWI 300 cut sheets in under 3 minutes." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #FAFAF8; color: #0F0F0E; font-family: 'DM Sans', sans-serif; }
        ::selection { background: #B8860B22; }

        .mono { font-family: 'DM Mono', monospace; }

        .nav { display: flex; align-items: center; justify-content: space-between; padding: 0 48px; height: 64px; border-bottom: 1px solid #E8E6E1; background: #FAFAF8; position: sticky; top: 0; z-index: 100; }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #0F0F0E; }
        .nav-mark { width: 28px; height: 28px; background: #0F0F0E; border-radius: 5px; display: flex; align-items: center; justify-content: center; }
        .nav-mark span { color: #FAFAF8; font-size: 13px; font-weight: 600; font-family: 'DM Mono', monospace; }
        .nav-links { display: flex; align-items: center; gap: 32px; }
        .nav-link { font-size: 14px; color: #6B6860; text-decoration: none; transition: color .15s; }
        .nav-link:hover { color: #0F0F0E; }
        .nav-cta { font-size: 13px; font-weight: 500; padding: 8px 18px; background: #0F0F0E; color: #FAFAF8; border-radius: 6px; text-decoration: none; transition: opacity .15s; }
        .nav-cta:hover { opacity: 0.85; }

        .hero { padding: 96px 48px 80px; max-width: 1100px; margin: 0 auto; }
        .hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #B8860B; background: #B8860B0F; border: 1px solid #B8860B22; padding: 5px 12px; border-radius: 4px; margin-bottom: 32px; }
        .hero-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: #B8860B; }
        .hero-title { font-size: clamp(40px, 5.5vw, 72px); font-weight: 300; line-height: 1.05; letter-spacing: -0.025em; color: #0F0F0E; margin-bottom: 24px; }
        .hero-title strong { font-weight: 600; }
        .hero-sub { font-size: 17px; line-height: 1.7; color: #5A5850; max-width: 520px; margin-bottom: 40px; }

        .hero-cta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 56px; }
        .email-row { display: flex; gap: 0; border: 1px solid #D4D2CC; border-radius: 8px; overflow: hidden; background: #fff; }
        .email-row input { padding: 12px 16px; font-size: 14px; font-family: 'DM Sans', sans-serif; border: none; outline: none; width: 240px; color: #0F0F0E; background: transparent; }
        .email-row input::placeholder { color: #A8A69E; }
        .btn-primary { padding: 12px 22px; background: #0F0F0E; color: #FAFAF8; font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif; border: none; cursor: pointer; white-space: nowrap; transition: opacity .15s; }
        .btn-primary:hover { opacity: 0.85; }
        .btn-primary:disabled { opacity: 0.5; cursor: wait; }
        .btn-secondary { padding: 12px 22px; background: transparent; color: #0F0F0E; font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif; border: 1px solid #D4D2CC; border-radius: 8px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: border-color .15s, background .15s; display: inline-block; }
        .btn-secondary:hover { border-color: #0F0F0E; background: #F5F3EE; }

        .proof-strip { display: flex; gap: 0; border-top: 1px solid #E8E6E1; border-bottom: 1px solid #E8E6E1; }
        .proof-item { flex: 1; padding: 28px 32px; border-right: 1px solid #E8E6E1; }
        .proof-item:last-child { border-right: none; }
        .proof-value { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: #0F0F0E; line-height: 1; margin-bottom: 4px; }
        .proof-label { font-size: 12px; color: #8A8880; font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: .08em; }

        .section { max-width: 1100px; margin: 0 auto; padding: 80px 48px; }
        .section-label { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #B8860B; margin-bottom: 16px; }
        .section-title { font-size: clamp(28px, 3vw, 40px); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 12px; }
        .section-title strong { font-weight: 600; }
        .section-sub { font-size: 16px; color: #5A5850; line-height: 1.7; max-width: 480px; margin-bottom: 56px; }

        .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #E8E6E1; border: 1px solid #E8E6E1; border-radius: 12px; overflow: hidden; }
        .feature { background: #FAFAF8; padding: 36px 32px; }
        .feature-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #B8860B; margin-bottom: 16px; }
        .feature-title { font-size: 20px; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 12px; line-height: 1.2; }
        .feature-body { font-size: 14px; line-height: 1.7; color: #5A5850; margin-bottom: 24px; }
        .feature-stat { display: flex; align-items: baseline; gap: 8px; padding-top: 20px; border-top: 1px solid #E8E6E1; }
        .feature-stat-value { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: #0F0F0E; }
        .feature-stat-sub { font-size: 12px; color: #8A8880; font-family: 'DM Mono', monospace; }

        .outputs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 48px; }
        .output { padding: 20px 24px; border: 1px solid #E8E6E1; border-radius: 8px; background: #fff; }
        .output-icon { font-size: 18px; margin-bottom: 10px; }
        .output-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .output-desc { font-size: 12px; color: #8A8880; line-height: 1.5; }

        .how { background: #0F0F0E; color: #FAFAF8; }
        .how-inner { max-width: 1100px; margin: 0 auto; padding: 80px 48px; }
        .how-label { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #B8860B; margin-bottom: 20px; }
        .how-title { font-size: clamp(28px, 3vw, 40px); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 56px; }
        .how-title strong { font-weight: 600; }
        .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #1E1E1C; border: 1px solid #1E1E1C; border-radius: 8px; overflow: hidden; }
        .step { background: #0F0F0E; padding: 32px 28px; }
        .step-num { font-family: 'DM Mono', monospace; font-size: 11px; color: #B8860B; letter-spacing: .1em; margin-bottom: 16px; }
        .step-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
        .step-body { font-size: 13px; line-height: 1.6; color: #8A8880; }

        .cta-band { background: #FAFAF8; border-top: 1px solid #E8E6E1; }
        .cta-inner { max-width: 1100px; margin: 0 auto; padding: 80px 48px; text-align: center; }
        .cta-title { font-size: clamp(28px, 3vw, 44px); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 12px; }
        .cta-title strong { font-weight: 600; }
        .cta-sub { font-size: 16px; color: #5A5850; margin-bottom: 40px; }
        .cta-actions { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }

        .footer { border-top: 1px solid #E8E6E1; padding: 32px 48px; display: flex; align-items: center; justify-content: space-between; }
        .footer-left { font-family: 'DM Mono', monospace; font-size: 11px; color: #A8A69E; letter-spacing: .06em; }
        .footer-links { display: flex; gap: 24px; }
        .footer-link { font-size: 13px; color: #A8A69E; text-decoration: none; }
        .footer-link:hover { color: #0F0F0E; }

        @media (max-width: 768px) {
          .nav { padding: 0 20px; }
          .hero { padding: 60px 20px 56px; }
          .features { grid-template-columns: 1fr; }
          .outputs { grid-template-columns: 1fr 1fr; }
          .steps { grid-template-columns: 1fr 1fr; }
          .proof-strip { flex-wrap: wrap; }
          .proof-item { flex: 1 1 50%; border-right: none; border-bottom: 1px solid #E8E6E1; }
          .section { padding: 56px 20px; }
          .how-inner { padding: 56px 20px; }
          .footer { padding: 24px 20px; flex-direction: column; gap: 16px; align-items: flex-start; }
          .email-row input { width: 160px; }
        }
      `}</style>

      {/* Nav */}
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <div className="nav-mark"><span>P</span></div>
          <span style={{ fontSize: 15, fontWeight: 600 }}>ProjMgtAI</span>
        </Link>
        <div className="nav-links">
          <Link href="/pricing" className="nav-link">Pricing</Link>
          <Link href="/scope-extractor" className="nav-link">Extractor</Link>
          <Link href="/scope-extractor" className="nav-cta">Try Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <div className="hero-eyebrow">
          <span className="hero-eyebrow-dot" />
          AI-native millwork estimating
        </div>
        <h1 className="hero-title">
          Scope extracted.<br />
          <strong>Bid ready in minutes.</strong>
        </h1>
        <p className="hero-sub">
          Upload architectural PDFs. ProjMgtAI reads every page, groups by room,
          and outputs a structured Excel workbook — WBS, RFIs, Bid Checklist,
          and AWI 300 cut sheets — ready to price the same day drawings arrive.
        </p>

        <div className="hero-cta">
          <div className="email-row">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTryFree()}
            />
            <button className="btn-primary" onClick={handleTryFree} disabled={submitting}>
              {submitted ? "Opening..." : submitting ? "..." : "Try Free →"}
            </button>
          </div>
          <Link href="/pricing" className="btn-secondary">See Pricing</Link>
        </div>

        <p style={{ fontSize: 12, color: "#A8A69E", fontFamily: "'DM Mono', monospace", letterSpacing: ".04em" }}>
          No credit card required &nbsp;·&nbsp; Works on any architectural PDF &nbsp;·&nbsp; Results in under 3 min
        </p>
      </div>

      {/* Proof strip */}
      <div className="proof-strip">
        {PROOF.map(p => (
          <div key={p.label} className="proof-item">
            <div className="proof-value">{p.value}</div>
            <div className="proof-label">{p.label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="section">
        <div className="section-label">What it does</div>
        <h2 className="section-title">Three problems.<br /><strong>One upload.</strong></h2>
        <p className="section-sub">
          Most takeoff tools are built for GCs. ProjMgtAI is built for millwork subs —
          it understands cabinet series codes, AWI grades, material legends, and shop drawing notation.
        </p>

        <div className="features">
          {FEATURES.map(f => (
            <div key={f.label} className="feature">
              <div className="feature-label">{f.label}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-body">{f.body}</div>
              <div className="feature-stat">
                <span className="feature-stat-value">{f.stat}</span>
                <span className="feature-stat-sub">{f.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Output tabs */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div className="section-label">What you get</div>
        <h2 className="section-title"><strong>Six-tab Excel workbook,</strong><br />delivered every time.</h2>
        <div className="outputs">
          {[
            ["📋", "All Items", "Every scope item by room — type, dims, material, confidence"],
            ["🗂", "WBS Summary", "Trade hierarchy: cabinetry, countertops, shelving, hardware"],
            ["✅", "Bid Checklist", "Blocking, ADA, hardware, finish — flagged per room"],
            ["🔍", "RFI Log", "Missing scope, dims, material gaps — auto-detected"],
            ["✂", "Parts List", "AWI 300 cut sheet: part, qty, L×W×T, material code"],
            ["📄", "Per-Room Tabs", "One sheet per room, same columns as All Items"],
          ].map(([icon, name, desc]) => (
            <div key={name as string} className="output">
              <div className="output-icon">{icon}</div>
              <div className="output-name">{name}</div>
              <div className="output-desc">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="how">
        <div className="how-inner">
          <div className="how-label">How it works</div>
          <h2 className="how-title">Four steps from PDF<br /><strong>to shop order.</strong></h2>
          <div className="steps">
            {[
              ["01 —", "Upload", "Drop your plan PDFs — bid set, specs, addenda. Up to 150 MB. Any page count."],
              ["02 —", "Analyze", "AI reads every page, detects room names, resolves material legends, identifies image-only pages."],
              ["03 —", "Extract", "Room by room: cabinets, countertops, shelving, hardware, ADA scope — all extracted and classified."],
              ["04 —", "Download", "Six-tab Excel workbook downloads in under 3 minutes. Ready to price, bid, or send to the shop."],
            ].map(([num, title, body]) => (
              <div key={num as string} className="step">
                <div className="step-num">{num}</div>
                <div className="step-title">{title}</div>
                <div className="step-body">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="cta-band">
        <div className="cta-inner">
          <h2 className="cta-title">Start with a real project.<br /><strong>See it work on your drawings.</strong></h2>
          <p className="cta-sub">No demo data. Upload an actual plan set and get a real workbook back.</p>
          <div className="cta-actions">
            <Link href="/scope-extractor" className="btn-primary" style={{ borderRadius: 8, textDecoration: "none", display: "inline-block" }}>
              Try Free — No Credit Card →
            </Link>
            <Link href="/pricing" className="btn-secondary">View Pricing</Link>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="footer-left">PROJMGTAI &nbsp;·&nbsp; CENTRIV AI &nbsp;·&nbsp; FULLERTON CA &nbsp;·&nbsp; C-6 LIC 1007884</div>
        <div className="footer-links">
          <Link href="/pricing" className="footer-link">Pricing</Link>
          <Link href="/scope-extractor" className="footer-link">Extractor</Link>
          <a href="mailto:gary@projmgt.ai" className="footer-link">Contact</a>
        </div>
      </footer>
    </>
  );
}
