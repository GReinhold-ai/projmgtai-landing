// pages/index.tsx
// ProjMgtAI Homepage — conversion-focused landing page
// Replaces the old WBS Builder v1 page
import Head from "next/head";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Head>
        <title>ProjMgtAI — AI Millwork Scope Extractor</title>
        <meta name="description" content="Upload your architectural plan set and get 130+ millwork scope items extracted into a structured shop order in under 2 minutes. Free to try." />
        <meta property="og:title" content="ProjMgtAI — AI Millwork Scope Extractor" />
        <meta property="og:description" content="PDF plan set to structured shop order in under 2 minutes. Cabinets, countertops, dimensions, materials, RFIs, WBS summary." />
        <link rel="canonical" href="https://projmgt.ai" />
      </Head>

      <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "'system-ui', -apple-system, sans-serif" }}>

        {/* Nav */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.02em" }}>
            ProjMgtAI
          </div>
          <div style={{ display: "flex", gap: 28, alignItems: "center", fontSize: 14 }}>
            <Link href="/how-it-works" style={{ color: "#94a3b8", textDecoration: "none" }}>How it works</Link>
            <Link href="/schema" style={{ color: "#94a3b8", textDecoration: "none" }}>Schema</Link>
            <Link href="/blog" style={{ color: "#94a3b8", textDecoration: "none" }}>Blog</Link>
            <Link href="/scope-extractor" style={{ padding: "8px 20px", background: "#22c55e", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Try free →
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "80px 40px 60px", textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "4px 14px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, fontSize: 12, color: "#86efac", fontWeight: 600, marginBottom: 28, letterSpacing: "0.04em" }}>
            BETA — FREE TO TRY
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 24, color: "#fff" }}>
            Your plan set becomes a<br />
            <span style={{ color: "#22c55e" }}>structured shop order</span><br />
            in 2 minutes.
          </h1>
          <p style={{ fontSize: 18, color: "#94a3b8", lineHeight: 1.7, maxWidth: 580, margin: "0 auto 40px", fontWeight: 400 }}>
            Upload your architectural PDF. ProjMgtAI extracts every millwork scope item — cabinets, countertops, dimensions, materials, hardware — and delivers a structured Excel shop order with RFIs and WBS summary.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/scope-extractor" style={{ display: "inline-block", padding: "16px 36px", background: "#22c55e", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 16, textDecoration: "none", letterSpacing: "-0.01em" }}>
              Extract my plan set →
            </Link>
            <Link href="/examples/millwork-plan-review" style={{ display: "inline-block", padding: "16px 28px", border: "1px solid rgba(255,255,255,0.12)", color: "#cbd5e1", borderRadius: 10, fontWeight: 600, fontSize: 15, textDecoration: "none" }}>
              See a real example
            </Link>
          </div>
        </section>

        {/* Stats bar */}
        <section style={{ borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 40px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
            {[
              { n: "130+", label: "scope items per project" },
              { n: "< 2 min", label: "extraction time" },
              { n: "30+", label: "RFIs generated" },
              { n: "12+", label: "rooms detected" },
            ].map(({ n, label }, i) => (
              <div key={label} style={{ textAlign: "center", padding: "8px 20px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e", letterSpacing: "-0.02em" }}>{n}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* What you get */}
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "72px 40px" }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8, color: "#fff" }}>What you get</h2>
          <p style={{ color: "#64748b", fontSize: 15, marginBottom: 48 }}>Six structured outputs in a single Excel download.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { title: "All Items", desc: "Every scope item with type, room, dimensions, material, and confidence score", icon: "▦" },
              { title: "WBS Summary", desc: "Trade hierarchy — Cabinetry, Countertops, Shelving, Panels, Trim, Hardware", icon: "≡" },
              { title: "RFI Log", desc: "30+ pre-bid RFIs: missing dims, undefined materials, scope exclusions, sheet refs", icon: "⚑" },
              { title: "Bid Checklist", desc: "Per-room checklist: blocking, hardware, ADA, dimensions — OK / VERIFY / MISSING", icon: "✓" },
              { title: "Per-Room Tabs", desc: "One tab per room with items scoped to that assembly", icon: "◫" },
              { title: "Project Summary", desc: "File inventory, page count, room results, extraction stats", icon: "◎" },
            ].map(({ title, desc, icon }) => (
              <div key={title} style={{ padding: "24px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 20, marginBottom: 12, color: "#22c55e" }}>{icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 40px" }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 48, color: "#fff" }}>How it works</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
              {[
                { step: "1", title: "Upload your plan set", desc: "Drop your PDFs — plans, specs, addenda, shop drawings. Multi-file, up to 150MB. Scanned drawings supported." },
                { step: "2", title: "AI reads every page", desc: "Claude reads every sheet, groups pages by room, extracts scope items with dimensions, materials, and sheet references." },
                { step: "3", title: "Download your shop order", desc: "Excel workbook with 6 tabs: all items, per-room breakdown, WBS summary, bid checklist, RFI log, project summary." },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ position: "relative" }}>
                  <div style={{ width: 36, height: 36, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#22c55e", marginBottom: 16 }}>{step}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>{title}</div>
                  <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 48, textAlign: "center" }}>
              <Link href="/how-it-works" style={{ fontSize: 14, color: "#22c55e", textDecoration: "none", fontWeight: 600 }}>
                Full technical details →
              </Link>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "72px 40px" }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8, color: "#fff" }}>Built for the people who read plans</h2>
          <p style={{ color: "#64748b", fontSize: 15, marginBottom: 48, maxWidth: 560 }}>If you spend hours manually extracting scope from architectural drawings, this is for you.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { role: "Millwork contractors", desc: "Turn a 100-page plan set into a complete bid scope in 2 minutes instead of 6 hours." },
              { role: "Estimators", desc: "Get a structured first draft with RFIs pre-flagged. Spend your time verifying, not transcribing." },
              { role: "Project managers", desc: "WBS summary and bid checklist ready before the first team meeting." },
            ].map(({ role, desc }) => (
              <div key={role} style={{ padding: "24px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", marginBottom: 8 }}>{role}</div>
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Real project proof */}
        <section style={{ background: "rgba(34,197,94,0.04)", borderTop: "1px solid rgba(34,197,94,0.12)", borderBottom: "1px solid rgba(34,197,94,0.12)" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#86efac", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 16 }}>REAL PROJECT RESULT</div>
              <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff", marginBottom: 16, lineHeight: 1.3 }}>24 Hour Fitness — Navajo, San Diego</h2>
              <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>101 pages across 4 PDF files. 12 rooms detected. Extracted in 97 seconds.</p>
              <Link href="/examples/millwork-plan-review" style={{ fontSize: 14, color: "#22c55e", textDecoration: "none", fontWeight: 600 }}>
                See the full extraction →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { n: "132", label: "scope items" },
                { n: "30", label: "RFIs generated" },
                { n: "71", label: "items with dims" },
                { n: "12", label: "rooms" },
              ].map(({ n, label }) => (
                <div key={label} style={{ padding: "20px", background: "rgba(0,0,0,0.3)", borderRadius: 10, border: "1px solid rgba(34,197,94,0.15)", textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#22c55e", letterSpacing: "-0.02em" }}>{n}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Blog */}
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "72px 40px" }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8, color: "#fff" }}>From the blog</h2>
          <p style={{ color: "#64748b", fontSize: 15, marginBottom: 40 }}>Practical guides for millwork contractors and estimators.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
            {[
              { slug: "missing-scope-construction", title: "Why Construction Bids Miss Scope", excerpt: "Where scope gaps hide in plan sets — and how to catch them before bid day." },
              { slug: "rfi-examples-construction", title: "Top RFIs to Catch Before Bidding", excerpt: "The RFIs that should never reach the field — and how to generate them automatically." },
              { slug: "millwork-estimating-checklist", title: "Millwork Estimating Checklist", excerpt: "What experienced estimators check before submitting. Print it. Use it every time." },
            ].map(({ slug, title, excerpt }) => (
              <Link key={slug} href={`/blog/${slug}`} style={{ textDecoration: "none", display: "block", padding: "20px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 8, lineHeight: 1.4 }}>{title}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, marginBottom: 16 }}>{excerpt}</div>
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Read more →</div>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ background: "rgba(34,197,94,0.06)", borderTop: "1px solid rgba(34,197,94,0.15)" }}>
          <div style={{ maxWidth: 700, margin: "0 auto", padding: "80px 40px", textAlign: "center" }}>
            <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff", marginBottom: 16, lineHeight: 1.2 }}>
              Run your next plan set through it.
            </h2>
            <p style={{ color: "#64748b", fontSize: 16, marginBottom: 36, lineHeight: 1.7 }}>
              Free to try. No account required. Upload your plans and see what it finds in under 2 minutes.
            </p>
            <Link href="/scope-extractor" style={{ display: "inline-block", padding: "18px 44px", background: "#22c55e", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 17, textDecoration: "none", letterSpacing: "-0.01em" }}>
              Open Scope Extractor →
            </Link>
            <div style={{ marginTop: 20, fontSize: 13, color: "#475569" }}>
              Looking to test with your own projects?{" "}
              <a href="mailto:greinhold@rewmo.ai" style={{ color: "#22c55e", textDecoration: "none" }}>Get in touch</a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "32px 40px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>ProjMgtAI</div>
            <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#475569" }}>
              <Link href="/scope-extractor" style={{ color: "#475569", textDecoration: "none" }}>Scope Extractor</Link>
              <Link href="/how-it-works" style={{ color: "#475569", textDecoration: "none" }}>How it works</Link>
              <Link href="/schema" style={{ color: "#475569", textDecoration: "none" }}>Schema</Link>
              <Link href="/blog" style={{ color: "#475569", textDecoration: "none" }}>Blog</Link>
              <Link href="/api/sample-output" style={{ color: "#475569", textDecoration: "none" }}>API</Link>
            </div>
            <div style={{ fontSize: 12, color: "#334155" }}>© 2026 ProjMgtAI</div>
          </div>
        </footer>

      </div>
    </>
  );
}
