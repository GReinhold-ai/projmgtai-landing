// pages/how-it-works.tsx
// ProjMgtAI — How It Works
// Structured for both human readers and AI agent indexing
// No fluff — input, process, output, schema
import Head from "next/head";

export default function HowItWorks() {
  return (
    <>
      <Head>
        <title>How ProjMgtAI Works — PDF Plan Set to Structured Millwork Scope</title>
        <meta name="description" content="ProjMgtAI reads architectural PDF plan sets and extracts millwork scope into structured JSON — scope items, RFIs, WBS summary, and bid checklist. Input, process, and output explained." />
        <link rel="canonical" href="https://projmgt.ai/how-it-works" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "ProjMgtAI Scope Extractor",
          "applicationCategory": "BusinessApplication",
          "description": "AI-powered millwork scope extraction from architectural PDF plan sets. Produces structured shop orders, RFI logs, WBS summaries, and bid checklists.",
          "url": "https://projmgt.ai/scope-extractor",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": "Free to try" },
          "featureList": [
            "Millwork scope extraction from PDF plan sets",
            "Automated RFI generation",
            "WBS summary with trade hierarchy",
            "Bid checklist with ADA and hardware verification",
            "Multi-PDF upload support",
            "Vision mode for scanned drawings",
            "Structured JSON output"
          ]
        })}} />
      </Head>
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b", lineHeight: 1.7 }}>

        <a href="/" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>← projmgt.ai</a>

        <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, margin: "32px 0 16px", color: "#0f172a" }}>How ProjMgtAI Works</h1>
        <p style={{ fontSize: 17, color: "#64748b", marginBottom: 56 }}>
          Upload architectural plan sets. Get structured millwork scope in under 2 minutes.
        </p>

        {/* INPUT */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, background: "#0f172a", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>1</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>Input</h2>
          </div>
          <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>ProjMgtAI accepts multi-file PDF uploads. Each file is tagged by document type for optimal extraction.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { tag: "PLANS", desc: "Architectural millwork/casework plan sheets, interior elevations, locker and vanity details" },
              { tag: "SPECS", desc: "Division 06 specifications — material standards, hardware specs, finish requirements" },
              { tag: "SHOP DRAWINGS", desc: "Approved shop drawings with manufacturer part numbers, exact dimensions, hardware schedules" },
              { tag: "ADDENDA", desc: "Issued addenda revising millwork scope, clarifications, substitution requests" },
            ].map(({ tag, desc }) => (
              <div key={tag} style={{ padding: "16px 20px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fafafa" }}>
                <code style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#7c3aed", background: "#f3f4f6", padding: "2px 8px", borderRadius: 4 }}>[{tag}]</code>
                <p style={{ fontSize: 13, color: "#64748b", margin: "8px 0 0", lineHeight: 1.5 }}>{desc}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
            <strong>Supported:</strong> Text-based PDFs, scanned image PDFs (vision mode), multi-file sets up to 150MB combined
          </div>
        </div>

        {/* PROCESS */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, background: "#0f172a", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>2</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>Process</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { step: "PDF parsing", detail: "Pages extracted as text. Image-only pages rendered at 2x scale for vision processing." },
              { step: "Room grouping", detail: "50+ regex patterns identify room names from title zones, sheet references, and heading text. Pages assigned to rooms." },
              { step: "Project context extraction", detail: "Material legend, hardware groups, sheet index extracted from non-casework pages and shared across all room extractions." },
              { step: "LLM extraction per room", detail: "Claude Sonnet processes each room's pages with pre-extracted dimension hints, material codes, and hardware counts. Outputs structured TOON format." },
              { step: "Post-processing", detail: "Column shift repair, dimension backfill, material code assignment, scope reclassification, deduplication, assembly rollup." },
              { step: "Agent pipeline", detail: "TradeClassifier, WBSBuilder, BidChecklist, and RFI agents run on the extracted rows to produce the full 6-tab Excel output." },
            ].map(({ step, detail }, i) => (
              <div key={i} style={{ display: "flex", gap: 16, padding: "14px 16px", border: "1px solid #f1f5f9", borderRadius: 8 }}>
                <div style={{ width: 6, background: "#e2e8f0", borderRadius: 3, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{step}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OUTPUT */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, background: "#0f172a", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>3</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>Output</h2>
          </div>
          <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>Six structured outputs delivered as a downloadable Excel workbook and structured JSON.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { tab: "All Items", desc: "Every scope item with type, room, dimensions, material, confidence, and classification rule" },
              { tab: "Per-Room Tabs", desc: "One tab per room with items scoped to that assembly" },
              { tab: "WBS Summary", desc: "Trade hierarchy: Cabinetry, Countertops, Shelving, Panels, Trim, Hardware, Exclusions — with room rollups and material totals" },
              { tab: "Bid Checklist", desc: "Per-room checklist: Blocking, Hardware, Finish, Dimensions, ADA, Exclusions — status: OK / VERIFY / MISSING" },
              { tab: "RFIs", desc: "Structured RFI log: 6 categories, priority levels, room assignment, sheet references" },
              { tab: "Project Summary", desc: "File inventory, page count, room results, extraction stats, document type tags" },
            ].map(({ tab, desc }) => (
              <div key={tab} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16, padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <code style={{ fontFamily: "monospace", fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{tab}</code>
                <span style={{ fontSize: 13, color: "#64748b" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PERFORMANCE */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 20 }}>Performance benchmarks</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {[
              { metric: "130+", label: "scope items from 100-page set" },
              { metric: "< 2 min", label: "extraction time" },
              { metric: "30+", label: "RFIs generated per project" },
              { metric: "12+", label: "rooms detected" },
            ].map(({ metric, label }) => (
              <div key={label} style={{ padding: "20px 16px", border: "1px solid #e2e8f0", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>{metric}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SCHEMA LINK */}
        <div style={{ padding: "28px 32px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Machine-readable output</div>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>Every extraction follows a consistent JSON schema — structured for AI agent consumption, workflow integration, and automated processing.</p>
          <div style={{ display: "flex", gap: 12 }}>
            <a href="/schema" style={{ padding: "10px 18px", background: "#0f172a", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>View schema →</a>
            <a href="/api/sample-output" style={{ padding: "10px 18px", border: "1px solid #e2e8f0", color: "#475569", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Sample JSON →</a>
          </div>
        </div>

        <div style={{ padding: "32px 40px", background: "#f0f9ff", borderRadius: 16, border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#0c4a6e" }}>Try it on your next bid</div>
          <p style={{ fontSize: 15, color: "#0369a1", marginBottom: 20 }}>Upload your plan set and see what it finds. Free, no account required.</p>
          <a href="/scope-extractor" style={{ display: "inline-block", padding: "13px 28px", background: "#0ea5e9", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>Open Scope Extractor →</a>
        </div>

      </main>
    </>
  );
}
