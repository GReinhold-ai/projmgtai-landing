// pages/examples/millwork-plan-review.tsx
// ProjMgtAI — Real extraction example for AI indexing and human reference
import Head from "next/head";

export default function ExamplePage() {
  return (
    <>
      <Head>
        <title>Millwork Plan Review Example — ProjMgtAI Scope Extraction</title>
        <meta name="description" content="Real example: ProjMgtAI extracts 132 millwork scope items from a 101-page commercial fitness facility plan set. Before and after — PDF input to structured shop order output." />
        <link rel="canonical" href="https://projmgt.ai/examples/millwork-plan-review" />
      </Head>
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b", lineHeight: 1.7 }}>

        <div style={{ display: "flex", gap: 8, fontSize: 13, color: "#94a3b8", marginBottom: 40 }}>
          <a href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>projmgt.ai</a>
          <span>›</span>
          <a href="/examples" style={{ color: "#94a3b8", textDecoration: "none" }}>Examples</a>
        </div>

        <div style={{ marginBottom: 8, fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Real extraction example</div>
        <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.2, marginBottom: 16, color: "#0f172a" }}>Millwork Plan Review — Commercial Fitness Facility</h1>
        <p style={{ fontSize: 16, color: "#64748b", marginBottom: 48 }}>
          101 pages across 4 PDF files. 12 rooms. 132 scope items extracted in 97 seconds.
        </p>

        {/* INPUT */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#0f172a" }}>Input</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { tag: "PLANS", name: "Millwork plan set", pages: "48 pages", content: "Floor plan, interior elevations, casework details, locker details, vanity details" },
              { tag: "SPECS", name: "Division 06 specification", pages: "22 pages", content: "Material standards, hardware specs, finish codes, installation requirements" },
              { tag: "ADDENDA", name: "Revision set", pages: "18 pages", content: "Scope revisions, clarifications, substitution approvals" },
              { tag: "SHOP DRAWINGS", name: "Casework shop drawings", pages: "13 pages", content: "Approved shop drawings with manufacturer part numbers and hardware schedule" },
            ].map(({ tag, name, pages, content }) => (
              <div key={tag} style={{ padding: "18px 20px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fafafa" }}>
                <code style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#7c3aed", background: "#f3f4f6", padding: "2px 8px", borderRadius: 4 }}>[{tag}]</code>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginTop: 8 }}>{name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{pages}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* EXTRACTION RESULTS */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#0f172a" }}>Extraction results</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
            {[
              { n: "132", label: "Scope items" },
              { n: "12", label: "Rooms detected" },
              { n: "71", label: "Items with dimensions" },
              { n: "30", label: "RFIs generated" },
            ].map(({ n, label }) => (
              <div key={label} style={{ padding: "20px", border: "1px solid #e2e8f0", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{n}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Room breakdown */}
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>Items by room</h3>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {[
              { room: "Reception Desk", items: 28, types: "13 base cabinets, 2 countertops, 1 panel, trim, hardware, conduit, scope exclusions" },
              { room: "Vanity Details", items: 20, types: "19 base cabinet sections (ADA vanities), 1 concealed hinge row" },
              { room: "Arts & Crafts", items: 19, types: "Base cabinets, countertops, tall cabinets, equipment cabinets" },
              { room: "Team Members", items: 15, types: "Lockers (surface mount, dial lock, padlock), benches, towel stations, rubber base" },
              { room: "Kids Club", items: 10, types: "Base cabinets, decorative panels, rubber base, wainscot" },
              { room: "Team Room", items: 9, types: "FRP wall panels, plywood substrate, rubber base, reducer strip" },
              { room: "Service Manager", items: 5, types: "Assembly, base cabinet, upper cabinet, countertop, scope exclusion" },
              { room: "Locker Room / Unisex / Other", items: 11, types: "Mixed millwork and scope exclusions" },
              { room: "Mens Vanity", items: 15, types: "Scope exclusions: grab bars, mirrors, dispensers, accessories" },
            ].map(({ room, items, types }, i) => (
              <div key={room} style={{ display: "grid", gridTemplateColumns: "200px 50px 1fr", gap: 16, padding: "12px 20px", background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f1f5f9", alignItems: "start" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{room}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0ea5e9", textAlign: "center" }}>{items}</span>
                <span style={{ fontSize: 13, color: "#64748b" }}>{types}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SAMPLE SCOPE ITEMS */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>Sample scope items</h2>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>Representative rows from the All Items tab. Full JSON schema at <a href="/schema" style={{ color: "#0ea5e9" }}>projmgt.ai/schema</a>.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#e2e8f0" }}>
                  {["Room", "Type", "Description", "W(mm)", "Material", "Confidence"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Reception Desk", "base_cabinet", "Base Cabinet Section 18A", "610", "PL-01", "high"],
                  ["Reception Desk", "countertop", "Solid Surface Countertop", "—", "SS-1B", "high"],
                  ["Team Members", "tall_cabinet", "Surface Mount Post Form Locker Triple Doors", "533", "—", "high"],
                  ["Team Members", "base_cabinet", "Locker Bench PFB2448", "610", "—", "high"],
                  ["Team Room", "decorative_panel", "FRP Wall Panel WC-4B Entire Room 10'-0\"", "—", "WC-4B", "high"],
                  ["Team Room", "substrate", "1/2\" Plywood on Wall up to 8'-0\" AFF", "—", "PLY", "medium"],
                  ["Vanity Details", "base_cabinet", "Vanity Section 101A", "—", "PL-1", "medium"],
                  ["Service Manager", "upper_cabinet", "Upper Cabinet", "—", "PL-04", "low"],
                  ["Mens Vanity", "scope_exclusion", "Grab Bar 4-0 Toilet — By Others", "1219", "—", "medium"],
                ].map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f1f5f9" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "10px 14px", color: j === 1 ? "#7c3aed" : j === 5 ? (cell === "high" ? "#15803d" : cell === "medium" ? "#92400e" : "#991b1b") : "#334155", fontFamily: j === 1 ? "monospace" : "inherit", fontSize: 13, whiteSpace: j < 2 ? "nowrap" : "normal" }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SAMPLE RFIS */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#0f172a" }}>Sample RFIs generated</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { id: "RFI-001", priority: "High", category: "Missing Scope", room: "Service Manager", desc: "Fewer items than expected. Verify: upper cabinets, base cabinets, wall shelves, file drawers, countertop on interior elevation sheets." },
              { id: "RFI-002", priority: "Medium", category: "Missing Dimensions", room: "Vanity Details", desc: "19 vanity sections extracted without width dimensions. Confirm from elevation drawings or provide standard widths." },
              { id: "RFI-003", priority: "Medium", category: "Missing Material", room: "Arts & Crafts", desc: "14 base cabinet sections without material specification. Confirm finish code from material legend." },
              { id: "RFI-004", priority: "Low", category: "Scope Exclusion", room: "Mens Vanity", desc: "15 accessories extracted as scope exclusions. Confirm responsible party for all items on sheet A8.06." },
            ].map(({ id, priority, category, room, desc }) => (
              <div key={id} style={{ padding: "16px 20px", border: `1px solid ${priority === "High" ? "#fecaca" : priority === "Medium" ? "#fde68a" : "#e2e8f0"}`, borderRadius: 10, background: priority === "High" ? "#fef2f2" : priority === "Medium" ? "#fffbeb" : "#fafafa" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <code style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{id}</code>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: priority === "High" ? "#fee2e2" : priority === "Medium" ? "#fef9c3" : "#f1f5f9", color: priority === "High" ? "#991b1b" : priority === "Medium" ? "#78350f" : "#475569" }}>{priority}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{category}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{room}</span>
                </div>
                <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* JSON LINK */}
        <div style={{ padding: "24px 28px", background: "#0f172a", borderRadius: 12, marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Machine-readable version</div>
            <div style={{ fontSize: 13, color: "#64748b", fontFamily: "monospace" }}>GET /api/sample-output</div>
          </div>
          <a href="/api/sample-output" style={{ padding: "10px 20px", background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>View JSON →</a>
        </div>

        <div style={{ padding: "32px 40px", background: "#f0f9ff", borderRadius: 16, border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#0c4a6e" }}>Run your own plan set</div>
          <p style={{ fontSize: 15, color: "#0369a1", marginBottom: 20 }}>Upload your drawings and get results like these in under 2 minutes. Free to try.</p>
          <a href="/scope-extractor" style={{ display: "inline-block", padding: "13px 28px", background: "#0ea5e9", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>Open Scope Extractor →</a>
        </div>

      </main>
    </>
  );
}
