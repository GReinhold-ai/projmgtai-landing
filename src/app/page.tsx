// src/app/page.tsx
// ProjMgtAI v14.3.1 — Client-driven room-by-room extraction
// v14.3 FIXES: improved Excel column mapping, room progress display
"use client";

import { useState, useRef, useCallback } from "react";
import Script from "next/script";

type Status = "idle" | "reading" | "analyzing" | "extracting" | "building" | "done" | "error";

declare global { interface Window { pdfjsLib: any; XLSX: any; } }

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const d = e.dataTransfer.files[0];
    if (d?.type === "application/pdf") { setFile(d); setError(""); }
    else setError("Please drop a PDF file.");
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(""); }
  };

  async function extractTextFromPdf(pdfFile: File): Promise<{ text: string; pageCount: number }> {
    const buf = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress(`Reading page ${i} of ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(`--- PAGE ${i} ---\n${content.items.map((it: any) => it.str).join(" ")}`);
    }
    return { text: pages.join("\n\n"), pageCount: pdf.numPages };
  }

  const handleExtract = async () => {
    if (!file || !pdfReady) return;
    setStatus("reading"); setProgress("Extracting text from PDF..."); setError("");
    setResultUrl(null); setStats(null);

    try {
      // Step 1: Extract PDF text
      const { text: pdfText, pageCount } = await extractTextFromPdf(file);
      if (!pdfText || pdfText.trim().length < 10)
        throw new Error("Could not extract text. This may be a scanned PDF.");

      // Step 2: Analyze — get room groupings + project context
      setStatus("analyzing");
      setProgress(`Analyzing ${pageCount} pages — detecting rooms & material legend...`);

      const analyzeRes = await fetch("/api/scope-extractor-v14", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pdfText, projectId: file.name.replace(".pdf", ""), mode: "analyze" }),
      });
      if (!analyzeRes.ok) {
        const e = await analyzeRes.json().catch(() => ({}));
        throw new Error(e.error || `Analysis failed (${analyzeRes.status})`);
      }
      const analysis = await analyzeRes.json();
      if (!analysis.ok) throw new Error(analysis.error || "Analysis failed");

      const rooms = analysis.rooms || [];
      const projectContext = analysis.projectContext || {};

      // Step 3: Extract room by room
      setStatus("extracting");
      const allRows: any[] = [];
      const allWarnings: string[] = [];
      const roomResults: any[] = [];
      let retryCount = 0;
      const MAX_RETRIES_PER_ROOM = 2;

      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        setProgress(`Extracting room ${i + 1}/${rooms.length}: ${room.roomName} (pages ${room.pageNums.join(", ")})...`);

        try {
          const extractRes = await fetch("/api/scope-extractor-v14", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: pdfText,
              projectId: file.name.replace(".pdf", ""),
              mode: "extract",
              roomName: room.roomName,
              roomPages: room.pageNums,
              projectContext: projectContext,
            }),
          });

          if (!extractRes.ok) {
            const e = await extractRes.json().catch(() => ({}));
            if ((extractRes.status === 429 || (e.error && e.error.includes("rate_limit"))) && retryCount < MAX_RETRIES_PER_ROOM) {
              setProgress(`Rate limited — waiting 30s before retrying ${room.roomName}...`);
              await new Promise(r => setTimeout(r, 30000));
              retryCount++;
              i--; // retry this room
              continue;
            }
            allWarnings.push(`[${room.roomName}] Error: ${e.error || extractRes.status}`);
            roomResults.push({ room: room.roomName, status: "failed", itemCount: 0, pages: room.pageNums });
            retryCount = 0;
            continue;
          }

          retryCount = 0;
          const result = await extractRes.json();
          if (result.ok) {
            allRows.push(...(result.rows || []));
            allWarnings.push(...(result.warnings || []).map((w: string) => `[${room.roomName}] ${w}`));
            roomResults.push({
              room: room.roomName, status: "ok",
              itemCount: result.rows?.length || 0,
              pages: room.pageNums,
              timing: result.timing,
            });
          } else {
            allWarnings.push(`[${room.roomName}] ${result.error || "Unknown error"}`);
            roomResults.push({ room: room.roomName, status: "failed", itemCount: 0, pages: room.pageNums });
          }
        } catch (roomErr: any) {
          allWarnings.push(`[${room.roomName}] ${roomErr.message}`);
          roomResults.push({ room: room.roomName, status: "error", itemCount: 0, pages: room.pageNums });
          retryCount = 0;
        }

        // Brief pause between rooms for rate limit breathing room
        if (i < rooms.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Step 4: Build Excel
      setStatus("building");
      setProgress("Building Excel workbook...");

      const finalStats = {
        pageCount, roomCount: rooms.length, totalItems: allRows.length,
        withDimensions: allRows.filter((r: any) => r.width_mm || r.length_mm || r.height_mm).length,
        withMaterials: allRows.filter((r: any) => r.material_code || r.material).length,
        materialLegendCount: projectContext.materialLegend?.length || 0,
        documentType: projectContext.documentType || "unknown",
        roomResults,
      };
      setStats(finalStats);

      const blob = await buildExcel(allRows, roomResults, allWarnings, projectContext, finalStats, file.name);
      setResultUrl(URL.createObjectURL(blob));
      setStatus("done"); setProgress("");
    } catch (err: any) {
      setStatus("error"); setError(err.message || "Something went wrong"); setProgress("");
    }
  };

  async function buildExcel(
    rows: any[], roomResults: any[], warnings: string[],
    projectContext: any, stats: any, filename: string
  ): Promise<Blob> {
    const XLSX = await loadSheetJS();
    const wb = XLSX.utils.book_new();

    // Tab 1: Project Summary
    const sum: any[][] = [
      ["MILLWORK SHOP ORDER — ProjMgtAI v14.3.1"], [],
      ["Project:", filename.replace(".pdf", "")],
      ["Document Type:", projectContext.documentType || "unknown"],
      ["Pages:", stats.pageCount], ["Rooms:", stats.roomCount],
      ["Total Items:", stats.totalItems],
      ["Items w/ Dimensions:", stats.withDimensions],
      ["Items w/ Materials:", stats.withMaterials],
      [],
    ];
    if (projectContext.materialLegend?.length > 0) {
      sum.push(["MATERIAL LEGEND"]);
      sum.push(["Code", "Manufacturer", "Product", "Catalog #", "Category"]);
      for (const m of projectContext.materialLegend)
        sum.push([m.code, m.manufacturer, m.productName, m.catalogNumber, m.category]);
      sum.push([]);
    }
    sum.push(["ROOM RESULTS"]);
    sum.push(["Room", "Status", "Items", "Pages"]);
    for (const r of roomResults)
      sum.push([r.room, r.status, r.itemCount || 0, (r.pages || []).join(", ")]);

    const ws1 = XLSX.utils.aoa_to_sheet(sum);
    ws1["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Project Summary");

    // Tab 2: All Items — FIXED column mapping
    const hdrs = ["#", "Room", "Type", "Description", "Section", "Qty", "Unit",
      "W(mm)", "D(mm)", "H(mm)", "Material Code", "Material", "Hardware", "Confidence", "Notes"];
    const allData = [hdrs];
    rows.forEach((r: any, i: number) => {
      allData.push([
        i+1,
        r.room || "",
        r.item_type || "",
        (r.description || "").replace(/;/g, ","),  // Sanitize semicolons
        r.section_id || "",
        r.qty || 1,
        r.unit || "EA",
        r.width_mm || "",
        r.depth_mm || "",
        r.height_mm || "",
        r.material_code || "",
        r.material || "",
        r.hardware_spec || r.hardware_type || "",
        r.confidence || "",
        r.notes || ""
      ]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(allData);
    ws2["!cols"] = [{wch:5},{wch:20},{wch:18},{wch:45},{wch:8},{wch:5},{wch:5},
      {wch:9},{wch:9},{wch:9},{wch:12},{wch:30},{wch:30},{wch:10},{wch:40}];
    XLSX.utils.book_append_sheet(wb, ws2, "All Items");

    // Per-room tabs
    const roomNames = [...new Set(rows.map((r: any) => r.room || "Unclassified"))];
    for (const rn of roomNames) {
      const rr = rows.filter((r: any) => (r.room || "Unclassified") === rn);
      if (!rr.length) continue;
      const rd = [hdrs];
      rr.forEach((r: any, i: number) => {
        rd.push([
          i+1,
          r.room || "",
          r.item_type || "",
          (r.description || "").replace(/;/g, ","),
          r.section_id || "",
          r.qty || 1,
          r.unit || "EA",
          r.width_mm || "",
          r.depth_mm || "",
          r.height_mm || "",
          r.material_code || "",
          r.material || "",
          r.hardware_spec || r.hardware_type || "",
          r.confidence || "",
          r.notes || ""
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rd);
      ws["!cols"] = ws2["!cols"];
      // Sheet name: max 31 chars, no special chars
      const tabName = rn.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
      XLSX.utils.book_append_sheet(wb, ws, tabName);
    }

    // Warnings tab
    const wd: any[][] = [["WARNINGS"], []];
    if (!warnings.length) wd.push(["No warnings."]);
    else for (const w of warnings) wd.push([w]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wd), "Warnings");

    return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  function loadSheetJS(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (window.XLSX) { resolve(window.XLSX); return; }
      const s = document.createElement("script");
      s.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
      s.onload = () => resolve(window.XLSX); s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const reset = () => {
    setFile(null); setStatus("idle"); setProgress(""); setError("");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null); setStats(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main style={{ minHeight:"100vh", background:"linear-gradient(168deg,#0a0e1a 0%,#0f1729 40%,#111d2e 100%)", color:"#e2e8f0", fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace" }}>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        onLoad={() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; setPdfReady(true); }} />

      <nav style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 40px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, background:"linear-gradient(135deg,#22d3ee,#6366f1)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#0a0e1a" }}>P</div>
          <span style={{ fontWeight:700, fontSize:16 }}>ProjMgtAI</span>
        </div>
        <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, opacity:0.7 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }} />v14.3.1 Live
        </span>
      </nav>

      <section style={{ textAlign:"center", padding:"80px 20px 60px" }}>
        <div style={{ display:"inline-block", padding:"6px 16px", border:"1px solid rgba(34,211,238,0.3)", borderRadius:20, fontSize:12, color:"#22d3ee", marginBottom:24 }}>
          ★ v14.3.1 — Improved room detection & dimension extraction
        </div>
        <h1 style={{ fontSize:"clamp(32px,5vw,56px)", fontWeight:800, lineHeight:1.1, margin:"0 0 20px", fontFamily:"'Inter','Helvetica Neue',sans-serif" }}>
          Full project takeoff,<br/>
          <span style={{ background:"linear-gradient(135deg,#22d3ee,#6366f1,#a855f7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>every room, one upload.</span>
        </h1>
        <p style={{ fontSize:15, maxWidth:500, margin:"0 auto 36px", lineHeight:1.6, opacity:0.7 }}>
          Upload multi-page plan PDFs. AI groups pages by room, resolves material specs
          across sheets, then extracts each room with manufacturer part numbers.
        </p>
      </section>

      <section id="try" style={{ padding:"0 40px 100px", textAlign:"center" }}>
        <div style={{ maxWidth:560, margin:"0 auto", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:32 }}>
          {status === "idle" && (<>
            <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
              style={{ border:"2px dashed rgba(34,211,238,0.3)", borderRadius:12, padding:"48px 24px", cursor:"pointer", marginBottom: file ? 16 : 0 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📎</div>
              <div style={{ fontSize:14, color:"#22d3ee", fontWeight:600 }}>Drop a PDF here <span style={{ opacity:0.5, color:"#e2e8f0", fontWeight:400 }}>or click to browse</span></div>
              <div style={{ fontSize:12, opacity:0.4, marginTop:8 }}>Multi-page plan sets supported</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} style={{ display:"none" }} />
            {file && (<div style={{ marginTop:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"rgba(34,211,238,0.08)", borderRadius:8, marginBottom:16 }}>
                <span style={{ fontSize:13 }}>📄 {file.name} <span style={{ opacity:0.5 }}>({(file.size/1024).toFixed(0)} KB)</span></span>
                <button onClick={e => { e.stopPropagation(); reset(); }} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:13 }}>✕</button>
              </div>
              <button onClick={handleExtract} disabled={!pdfReady}
                style={{ width:"100%", padding:"14px", background: pdfReady ? "linear-gradient(135deg,#22d3ee,#6366f1)" : "rgba(255,255,255,0.1)", color:"#0a0e1a", border:"none", borderRadius:8, fontWeight:700, fontSize:15, cursor: pdfReady?"pointer":"wait", fontFamily:"inherit" }}>
                {pdfReady ? "Extract All Rooms →" : "Loading PDF engine..."}
              </button>
            </div>)}
          </>)}

          {(status === "reading" || status === "analyzing" || status === "extracting" || status === "building") && (
            <div style={{ padding:"40px 0" }}>
              <div style={{ width:48, height:48, border:"3px solid rgba(34,211,238,0.2)", borderTop:"3px solid #22d3ee", borderRadius:"50%", margin:"0 auto 20px", animation:"spin 1s linear infinite" }} />
              <div style={{ fontSize:14, fontWeight:600 }}>{progress}</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {status === "done" && resultUrl && (
            <div style={{ padding:"24px 0" }}>
              <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Extraction Complete</div>
              {stats && (
                <div style={{ fontSize:12, opacity:0.6, marginBottom:20, lineHeight:1.8 }}>
                  {stats.pageCount} pages · {stats.roomCount} rooms · {stats.totalItems} items · {stats.withDimensions} with dims
                  {stats.materialLegendCount > 0 && ` · ${stats.materialLegendCount} materials resolved`}
                </div>
              )}
              <a href={resultUrl} download={`shop_order_v1431_${file?.name?.replace(".pdf","")}.xlsx`}
                style={{ display:"inline-block", padding:"14px 32px", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", borderRadius:8, fontWeight:700, fontSize:14, textDecoration:"none", marginBottom:12 }}>
                ⬇ Download Excel
              </a><br/>
              <button onClick={reset} style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", color:"#e2e8f0", padding:"10px 24px", borderRadius:8, fontSize:13, cursor:"pointer", marginTop:8, fontFamily:"inherit" }}>Extract Another</button>
            </div>
          )}

          {status === "error" && (
            <div style={{ padding:"24px 0" }}>
              <div style={{ fontSize:40, marginBottom:16 }}>❌</div>
              <div style={{ fontSize:14, fontWeight:600, color:"#ef4444", marginBottom:8 }}>{error}</div>
              <button onClick={reset} style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", color:"#e2e8f0", padding:"10px 24px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Try Again</button>
            </div>
          )}
        </div>
      </section>

      <footer style={{ textAlign:"center", padding:"40px 20px", borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:12, opacity:0.4 }}>
        © 2026 ProjMgtAI — Construction Intelligence, not guesswork.
      </footer>
    </main>
  );
}
