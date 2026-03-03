// projmgtai-ui/pages/estimator/wbs.tsx
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

interface WbsRow {
  id: number;
  page: number;
  line: string;
  trade?: string;
  category?: string;
  quantity?: number | null;
  uom?: string;
  remarks?: string;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8080";

const WbsPage: React.FC = () => {
  const router = useRouter();

  const [rows, setRows] = useState<WbsRow[]>([]);
  const [totalLines, setTotalLines] = useState<number>(0);
  const [maxSeed, setMaxSeed] = useState<number>(500);
  const [error, setError] = useState<string>("");

  // --------------------------------------------------------
  // Load last extracted WBS from backend
  // --------------------------------------------------------
  useEffect(() => {
    async function loadWbs() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/current_wbs`);
        if (!res.ok) {
          throw new Error(`Failed to fetch current WBS: ${res.status}`);
        }

        const data = await res.json();

        // *** FIXED: The backend returns "scope_items", not "rows" ***
        if (!Array.isArray(data.scope_items)) {
          throw new Error("Backend returned invalid WBS structure.");
        }

        setRows(data.scope_items);
        setTotalLines(data.total_scope_lines ?? 0);
        setMaxSeed(data.max_seed_rows ?? 500);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Unknown error loading WBS");
      }
    }

    loadWbs();
  }, []);

  // --------------------------------------------------------
  // Export CSV
  // --------------------------------------------------------
  async function handleExportCsv() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/export_wbs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const text = await res.text();
        alert(`Export failed: ${text}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "projmgtaI_wbs_export.csv";
      a.click();
    } catch (e) {
      alert("CSV export error: " + e);
    }
  }

  // --------------------------------------------------------
  // Render Page
  // --------------------------------------------------------
  return (
    <div style={{ padding: "2rem", color: "white" }}>
      <h1>ProjMgtAI — WBS Builder (Phase 1)</h1>

      <button onClick={() => router.push("/estimator/upload")}>
        ← Back to Upload
      </button>

      <button onClick={handleExportCsv} style={{ marginLeft: "1rem" }}>
        Export WBS (CSV / data)
      </button>

      <div style={{ marginTop: "1rem", opacity: 0.7 }}>
        Rows loaded: {rows.length} / {maxSeed}  
        &nbsp; • &nbsp; Total lines in PDF: {totalLines}
      </div>

      {error && (
        <div style={{ color: "red", marginTop: "1rem" }}>Error: {error}</div>
      )}

      <table
        style={{
          width: "100%",
          marginTop: "2rem",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            <th>#</th>
            <th>Page</th>
            <th>Scope Line</th>
            <th>Trade</th>
            <th>Category</th>
            <th>Qty</th>
            <th>UOM</th>
            <th>Remarks</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td>{r.id}</td>
              <td>{r.page}</td>
              <td>{r.line}</td>
              <td>{r.trade}</td>
              <td>{r.category}</td>
              <td>{r.quantity}</td>
              <td>{r.uom}</td>
              <td>{r.remarks}</td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>
                No WBS rows loaded.  
                Go back → Upload → Extract PDF → then return here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default WbsPage;
