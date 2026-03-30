// pages/schema.tsx
// ProjMgtAI Schema — structured data standard for millwork scope extraction
// Written for both human readers and AI agent indexing
import Head from "next/head";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 48 }}>
    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e2e8f0" }}>{title}</h2>
    {children}
  </div>
);

const Field = ({ name, type, desc, example }: { name: string; type: string; desc: string; example?: string }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px 80px 1fr", gap: "0 16px", padding: "10px 0", borderBottom: "1px solid #f1f5f9", alignItems: "start" }}>
    <code style={{ fontFamily: "monospace", fontSize: 13, color: "#7c3aed", fontWeight: 600 }}>{name}</code>
    <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", paddingTop: 1 }}>{type}</span>
    <div>
      <span style={{ fontSize: 14, color: "#475569" }}>{desc}</span>
      {example && <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>e.g. {example}</div>}
    </div>
  </div>
);

const CodeBlock = ({ code }: { code: string }) => (
  <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: "20px 24px", borderRadius: 10, fontSize: 13, fontFamily: "monospace", lineHeight: 1.7, overflow: "auto", marginTop: 16 }}>
    {code}
  </pre>
);

export default function SchemaPage() {
  return (
    <>
      <Head>
        <title>ProjMgtAI Schema — Structured Millwork Scope Data Standard</title>
        <meta name="description" content="The ProjMgtAI data schema for millwork scope extraction. Scope objects, RFI objects, risk indicators, and confidence scores — machine-readable structured output from architectural plan sets." />
        <link rel="canonical" href="https://projmgt.ai/schema" />
      </Head>
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b" }}>

        <a href="/" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>← projmgt.ai</a>

        <div style={{ marginTop: 32, marginBottom: 56 }}>
          <div style={{ display: "inline-block", padding: "4px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, fontSize: 12, color: "#15803d", fontWeight: 600, marginBottom: 16 }}>Schema v1.0</div>
          <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.2, marginBottom: 16, color: "#0f172a" }}>ProjMgtAI Data Schema</h1>
          <p style={{ fontSize: 17, color: "#64748b", lineHeight: 1.7, maxWidth: 640 }}>
            Every extraction produces structured JSON output following this schema. Designed for machine readability, AI agent consumption, and integration into construction workflows.
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <a href="/api/sample-output" style={{ padding: "10px 20px", background: "#0f172a", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>View sample JSON →</a>
            <a href="/examples/millwork-plan-review" style={{ padding: "10px 20px", border: "1px solid #e2e8f0", color: "#475569", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>See full example →</a>
          </div>
        </div>

        <Section title="Scope Object">
          <p style={{ fontSize: 15, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
            Each extracted millwork item is a Scope Object. One object per item — cabinet sections, countertops, panels, hardware, and scope exclusions each get their own row.
          </p>
          <Field name="id" type="string" desc="Unique item identifier within the extraction" example="001" />
          <Field name="room" type="string" desc="Room or assembly name as detected from drawings" example="Reception Desk" />
          <Field name="item_type" type="enum" desc="Millwork category. One of: assembly, base_cabinet, upper_cabinet, tall_cabinet, countertop, transaction_top, decorative_panel, trim, channel, rubber_base, substrate, concealed_hinge, piano_hinge, grommet, adjustable_shelf, fixed_shelf, cpu_shelf, drawer, file_drawer, trash_drawer, rollout_basket, conduit, j_box, equipment_cutout, safe_cabinet, controls_cabinet, end_panel, corner_guard, trellis, ada_fascia, wall_cap, scope_exclusion" example="base_cabinet" />
          <Field name="description" type="string" desc="Plain text description of the item" example="Base Cabinet Section 18A" />
          <Field name="section_id" type="string" desc="Drawing callout or section identifier" example="18A" />
          <Field name="qty" type="number" desc="Quantity of this item" example="4" />
          <Field name="unit" type="enum" desc="Unit of measure: EA, LF, SF, LOT" example="EA" />
          <Field name="dimensions.width_mm" type="number" desc="Face width in millimeters (run length along wall)" example="1359" />
          <Field name="dimensions.depth_mm" type="number" desc="Front-to-back depth in millimeters" example="610" />
          <Field name="dimensions.height_mm" type="number" desc="Vertical height in millimeters" example="864" />
          <Field name="dimensions.dim_source" type="enum" desc="How dimensions were obtained: extracted (from drawing text), calculated (derived), unknown" example="extracted" />
          <Field name="material_code" type="string" desc="Material code from project legend" example="PL-01" />
          <Field name="material" type="string" desc="Full material description" example="Plastic Laminate" />
          <Field name="sheet_ref" type="string" desc="Drawing sheet and detail reference" example="1/A8.10" />
          <Field name="confidence" type="enum" desc="Extraction confidence: high (type+dims+material), medium (missing one), low (missing two or more)" example="high" />
          <Field name="rule" type="string" desc="Classification rule applied" example="RULE_cabinet_with_dims" />

          <CodeBlock code={`{
  "id": "002",
  "room": "Reception Desk",
  "item_type": "base_cabinet",
  "description": "Base Cabinet Section 18A",
  "section_id": "18A",
  "qty": 1,
  "unit": "EA",
  "dimensions": {
    "width_mm": 1359,
    "depth_mm": 610,
    "height_mm": 864,
    "dim_source": "extracted"
  },
  "material_code": "PL-01",
  "material": "Plastic Laminate",
  "sheet_ref": "1/A8.10",
  "confidence": "high",
  "rule": "RULE_cabinet_with_dims"
}`} />
        </Section>

        <Section title="RFI Object">
          <p style={{ fontSize: 15, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
            Every scope gap, missing dimension, undefined material, or ambiguous exclusion generates an RFI Object. These are pre-bid RFIs — gaps caught before the job starts.
          </p>
          <Field name="rfi_id" type="string" desc="Sequential RFI identifier" example="RFI-001" />
          <Field name="priority" type="enum" desc="High / Medium / Low / Info" example="High" />
          <Field name="category" type="enum" desc="Missing Scope / Scope Exclusion / Missing Dimensions / Missing Material / Sheet Reference / Extraction Note" example="Missing Scope" />
          <Field name="room" type="string" desc="Room or area where the gap was identified" example="Service Manager" />
          <Field name="description" type="string" desc="Plain text description of the gap and recommended action" example="Upper cabinets not found. Verify scope on interior elevation sheet." />
          <Field name="sheet_ref" type="string" desc="Drawing reference where the gap was identified" example="A8.02" />
          <Field name="status" type="enum" desc="Open / Resolved" example="Open" />

          <CodeBlock code={`{
  "rfi_id": "RFI-002",
  "priority": "Medium",
  "category": "Missing Dimensions",
  "room": "Vanity Details",
  "description": "19 vanity sections without width dimensions. Section IDs: 101A, 101B, 101C...",
  "sheet_ref": "A8.06",
  "status": "Open"
}`} />
        </Section>

        <Section title="Confidence Score">
          <p style={{ fontSize: 15, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
            Every Scope Object carries a confidence score based on the evidence available at extraction time.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
            {[
              { level: "high", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", desc: "Item type + dimensions + material all present" },
              { level: "medium", color: "#92400e", bg: "#fffbeb", border: "#fde68a", desc: "One of: type, dimensions, or material missing" },
              { level: "low", color: "#991b1b", bg: "#fef2f2", border: "#fecaca", desc: "Two or more of: type, dimensions, material missing" },
            ].map(({ level, color, bg, border, desc }) => (
              <div key={level} style={{ padding: "16px 20px", background: bg, border: `1px solid ${border}`, borderRadius: 10 }}>
                <div style={{ fontFamily: "monospace", fontWeight: 700, color, fontSize: 15, marginBottom: 8 }}>{level}</div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Item Type Reference">
          <p style={{ fontSize: 15, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
            All valid item_type values in the ProjMgtAI schema.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              "assembly","base_cabinet","upper_cabinet","tall_cabinet","countertop",
              "transaction_top","decorative_panel","trim","channel","rubber_base",
              "substrate","concealed_hinge","piano_hinge","grommet","adjustable_shelf",
              "fixed_shelf","cpu_shelf","drawer","file_drawer","trash_drawer",
              "rollout_basket","conduit","j_box","equipment_cutout","safe_cabinet",
              "controls_cabinet","end_panel","corner_guard","corner_detail",
              "stainless_panel","hanger_support","trellis","ada_fascia","wall_cap",
              "scope_exclusion"
            ].map(t => (
              <code key={t} style={{ padding: "4px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, fontFamily: "monospace", color: "#334155" }}>{t}</code>
            ))}
          </div>
        </Section>

        <Section title="API Access">
          <p style={{ fontSize: 15, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
            ProjMgtAI outputs are available as structured JSON. The sample output endpoint demonstrates the full schema with real extraction data.
          </p>
          <div style={{ background: "#0f172a", borderRadius: 10, padding: "16px 24px", fontFamily: "monospace", fontSize: 13, color: "#94a3b8" }}>
            <span style={{ color: "#60a5fa" }}>GET</span> <span style={{ color: "#e2e8f0" }}>https://projmgt.ai/api/sample-output</span>
          </div>
          <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 12 }}>
            Full extraction API available for integration partners. Contact for access.
          </p>
        </Section>

        <div style={{ padding: "32px 40px", background: "#f0f9ff", borderRadius: 16, border: "1px solid #bae6fd", marginTop: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#0c4a6e" }}>Try the extractor</div>
          <p style={{ fontSize: 15, color: "#0369a1", marginBottom: 20, lineHeight: 1.6 }}>Upload a millwork plan set and get structured JSON output following this schema in under 2 minutes.</p>
          <a href="/scope-extractor" style={{ display: "inline-block", padding: "13px 28px", background: "#0ea5e9", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>Open Scope Extractor →</a>
        </div>

      </main>
    </>
  );
}
