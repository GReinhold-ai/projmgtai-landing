// src/app/page.tsx  v14.9.31
// AssemblyDecomposer wired — Parts List tab added to Excel output
// v14.9.31: Parts List (AWI 300 cut sheet), Parts List tab as 7th sheet
"use client";

import { useState, useRef, useCallback } from "react";
import Script from "next/script";
import Head from "next/head";
import Link from "next/link";
// v14.9.31: Assembly decomposer — AWI 300 parts explosion
import { decomposeItems, partsToAOA } from "./assembly-decomposer";

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

  // v14.9.36: Post-download feedback capture
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent">("idle");
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const d = e.dataTransfer.files[0];
    if (d?.type === "application/pdf") { setFile(d); setError(""); }
    else setError("Please drop a PDF file.");
  }, []);

  // v14.9.36: Auto-trigger download — flag ref fires once, never interferes with star clicks
  const didAutoDownload = useRef(false);
  if (resultUrl && !didAutoDownload.current) {
    didAutoDownload.current = true;
    setTimeout(() => downloadLinkRef.current?.click(), 300);
  }
  if (status === 'idle') didAutoDownload.current = false;

  async function submitFeedback() {
    if (!feedbackEmail || feedbackRating === null) return;
    setFeedbackStatus("sending");
    try {
      await fetch("/api/process-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: feedbackEmail,
          company: "scope-extractor",
          project_name: file?.name?.replace(".pdf", "") || "unknown",
          project_type: "feedback",
          blob_urls: [],
          feedback: {
            rating: feedbackRating,
            note: feedbackNote,
            items: stats?.totalItems,
            rooms: stats?.roomCount,
          },
        }),
      });
    } catch (_) { /* non-fatal */ }
    setFeedbackStatus("sent");
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(""); }
  };

  async function extractTextFromPdf(pdfFile: File): Promise<{ text: string; pageCount: number; imagePages: Record<number, string> }> {
    const buf = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    const imagePages: Record<number, string> = {};
    
    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress(`Reading page ${i} of ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it: any) => it.str).join(" ").trim();
      pages.push(`--- PAGE ${i} ---\n${text}`);
      
      if (text.length < 50) {
        try {
          setProgress(`Page ${i}: image-only — rendering for vision...`);
          const scale = 2.5;
          const viewport = page.getViewport({ scale });
          const maxDim = Math.max(viewport.width, viewport.height);
          const finalScale = maxDim > 2500 ? scale * (2500 / maxDim) : scale;
          const finalViewport = page.getViewport({ scale: finalScale });
          
          const canvas = document.createElement("canvas");
          canvas.width = finalViewport.width;
          canvas.height = finalViewport.height;
          const ctx2d = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx2d, viewport: finalViewport }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
          const base64 = dataUrl.split(",")[1];
          imagePages[i] = base64;
          canvas.remove();
        } catch (renderErr) {
          console.warn(`Failed to render page ${i}:`, renderErr);
        }
      }
    }
    return { text: pages.join("\n\n"), pageCount: pdf.numPages, imagePages };
  }

  const handleExtract = async () => {
    if (!file || !pdfReady) return;
    setStatus("reading"); setProgress("Extracting text from PDF..."); setError("");
    setResultUrl(null); setStats(null);

    try {
      const { text: pdfText, pageCount, imagePages } = await extractTextFromPdf(file);
      const imagePageNums = Object.keys(imagePages).map(Number);
      if (imagePageNums.length > 0) {
        setProgress(`Found ${imagePageNums.length} image-only page(s): ${imagePageNums.join(", ")} — will use vision`);
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!pdfText || pdfText.trim().length < 10)
        throw new Error("Could not extract text. This may be a scanned PDF.");

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
              pageImages: room.pageNums.reduce((acc: Record<number, string>, pn: number) => {
                if (imagePages[pn]) acc[pn] = imagePages[pn];
                return acc;
              }, {}),
            }),
          });

          if (!extractRes.ok) {
            const e = await extractRes.json().catch(() => ({}));
            if ((extractRes.status === 429 || (e.error && e.error.includes("rate_limit"))) && retryCount < MAX_RETRIES_PER_ROOM) {
              setProgress(`Rate limited — waiting 30s before retrying ${room.roomName}...`);
              await new Promise(r => setTimeout(r, 30000));
              retryCount++;
              i--;
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
              sheetInfo: result.sheetInfo || null,
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

        if (i < rooms.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }

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

    // ─── Assembly Enrichment ───────────────────────────────────
    const VALID_ITEM_TYPES_SET = new Set([
      "assembly","base_cabinet","upper_cabinet","tall_cabinet","countertop","transaction_top",
      "decorative_panel","trim","channel","rubber_base","substrate","concealed_hinge",
      "piano_hinge","grommet","adjustable_shelf","fixed_shelf","cpu_shelf","drawer",
      "file_drawer","trash_drawer","rollout_basket","conduit","j_box","equipment_cutout",
      "safe_cabinet","controls_cabinet","end_panel","corner_guard","corner_detail",
      "stainless_panel","hanger_support","trellis","scope_exclusion",
    ]);
    const enrichAssemblies = (items: any[]) => {
      const roomItems: Record<string, any[]> = {};
      for (const r of items) {
        const room = r.room || "Unclassified";
        if (!roomItems[room]) roomItems[room] = [];
        roomItems[room].push(r);
      }
      for (const room of Object.keys(roomItems)) {
        const ri = roomItems[room];
        const assemblies = ri.filter((r: any) => r.item_type === "assembly");
        const children = ri.filter((r: any) => r.item_type !== "assembly" && r.item_type !== "scope_exclusion");
        if (!assemblies.length) continue;

        for (let ai = 1; ai < assemblies.length; ai++) {
          assemblies[ai]._duplicate = true;
        }

        let totalLF = 0; let maxW = 0; let maxD = 0; let maxH = 0;
        const typeCounts: Record<string, number> = {};
        const matCodes = new Set<string>();

        for (const c of children) {
          const w = Number(c.width_mm) || 0;
          const d = Number(c.depth_mm) || 0;
          const h = Number(c.height_mm) || 0;
          if (w > maxW) maxW = w;
          if (d > maxD) maxD = d;
          if (h > maxH) maxH = h;

          const lfMatch = ((c.notes || "") + " " + (c.description || "")).match(/(\d+\.?\d*)\s*LF/);
          if (lfMatch) totalLF += parseFloat(lfMatch[1]);

          const t = c.item_type || "item";
          typeCounts[t] = (typeCounts[t] || 0) + (Number(c.qty) || 1);
          if (c.material_code && !VALID_ITEM_TYPES_SET.has(c.material_code)) matCodes.add(c.material_code);
        }

        const typeNames: Record<string, string> = {
          base_cabinet: "base cabinet", upper_cabinet: "upper cabinet",
          tall_cabinet: "tall cabinet", countertop: "countertop",
          transaction_top: "transaction top", decorative_panel: "decorative panel",
          fixed_shelf: "shelf", adjustable_shelf: "adj. shelf", drawer: "drawer",
          file_drawer: "file drawer", trash_drawer: "trash drawer",
          grommet: "grommet", conduit: "conduit", j_box: "j-box",
          safe_cabinet: "safe cabinet", trim: "trim", channel: "channel",
          rubber_base: "rubber base", substrate: "substrate",
          piano_hinge: "hinge", concealed_hinge: "hinge",
          equipment_cutout: "equip. cutout", hanger_support: "support",
          cpu_shelf: "CPU shelf", rollout_basket: "rollout basket",
        };
        const typePriority: Record<string, number> = {
          base_cabinet: 1, upper_cabinet: 1, tall_cabinet: 1, countertop: 2,
          transaction_top: 2, decorative_panel: 3, trim: 4, channel: 4,
          fixed_shelf: 5, adjustable_shelf: 5, cpu_shelf: 5,
          drawer: 5, file_drawer: 5, trash_drawer: 5, safe_cabinet: 5,
          rubber_base: 6, substrate: 6, conduit: 7, j_box: 7,
          grommet: 8, concealed_hinge: 8, piano_hinge: 8, hanger_support: 8,
          equipment_cutout: 7, rollout_basket: 5,
        };
        const sorted = Object.entries(typeCounts)
          .sort((a, b) => (typePriority[a[0]] || 9) - (typePriority[b[0]] || 9) || b[1] - a[1]);
        const parts: string[] = [];
        for (const [type, count] of sorted) {
          const name = typeNames[type] || type.replace(/_/g, " ");
          parts.push(`(${count}) ${name}${count > 1 ? "s" : ""}`);
        }
        const matStr = matCodes.size > 0 ? `. Materials: ${[...matCodes].join(", ")}` : "";
        const lfStr = totalLF > 0 ? ` -- ${totalLF.toFixed(1)} LF total` : "";
        const summaryDesc = `Custom millwork assembly: ${parts.join(", ")}${lfStr}${matStr}`;

        const overallW = totalLF > 0 ? Math.round(totalLF * 304.8) : (maxW || "");
        const overallD = maxD || "";
        const overallH = maxH || "";

        for (const assy of assemblies) {
          if (!assy.description || assy.description === `${room} Assembly` || /assembly$/i.test(assy.description)) {
            assy.description = summaryDesc;
          }
          if (!assy.width_mm && overallW) assy.width_mm = overallW;
          if (!assy.depth_mm && overallD) assy.depth_mm = overallD;
          if (!assy.height_mm && overallH) assy.height_mm = overallH;
        }
      }
    };
    enrichAssemblies(rows);
    rows = rows.filter((r: any) => !r._duplicate);

    // v14.9.31: Run assembly decomposer before building workbook
    const partsRows = decomposeItems(rows);
    const partsAOA  = partsToAOA(partsRows);

    // Tab 1: Project Summary
    const pi = projectContext.projectInfo || {};
    const sum: any[][] = [
      ["MILLWORK SHOP ORDER -- ProjMgtAI v14.9.31"], [],
    ];
    if (pi.projectName) sum.push(["Project:", pi.projectName]);
    else sum.push(["Project:", filename.replace(".pdf", "")]);
    if (pi.address) sum.push(["Address:", pi.address]);
    if (pi.client) sum.push(["Client:", pi.client]);
    if (pi.architect) sum.push(["Architect:", pi.architect]);
    if (pi.planSet) sum.push(["Plan Set:", pi.planSet]);
    if (pi.planDate) sum.push(["Plan Date:", pi.planDate]);
    sum.push(["Document Type:", projectContext.documentType || "unknown"]);
    sum.push([]);
    sum.push(["SCOPE SUMMARY"]);
    sum.push(["Pages:", stats.pageCount]);
    sum.push(["Rooms:", stats.roomCount]);
    sum.push(["Total Items:", stats.totalItems]);
    sum.push(["Items w/ Dimensions:", stats.withDimensions]);
    sum.push(["Items w/ Materials:", stats.withMaterials]);
    sum.push(["Parts List Rows:", partsRows.length]);
    sum.push([]);
    if (projectContext.materialLegend?.length > 0) {
      sum.push(["MATERIAL LEGEND"]);
      sum.push(["Code", "Manufacturer", "Product", "Catalog #", "Category"]);
      for (const m of projectContext.materialLegend)
        sum.push([m.code, m.manufacturer, m.productName, m.catalogNumber, m.category]);
      sum.push([]);
    }
    sum.push(["ROOM RESULTS"]);
    sum.push(["Room", "Status", "Items", "Sheet", "Details"]);
    for (const r of roomResults) {
      const si = (r as any).sheetInfo;
      sum.push([
        r.room, r.status, r.itemCount || 0,
        si?.sheetNumber || "",
        si?.detailNumbers?.join(", ") || "",
      ]);
    }

    const ws1 = XLSX.utils.aoa_to_sheet(sum);
    ws1["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Project Summary");

    // Tab 2: All Items
    const mmToFtIn = (mm: any): string => {
      if (!mm || isNaN(Number(mm)) || Number(mm) <= 0) return "";
      const totalInches = Number(mm) / 25.4;
      let feet = Math.floor(totalInches / 12);
      let inches = totalInches % 12;
      let wholeIn = Math.floor(inches);
      const frac = inches - wholeIn;
      let sixteenths = Math.round(frac * 16);
      if (sixteenths >= 16) { sixteenths = 0; wholeIn += 1; }
      if (wholeIn >= 12) { wholeIn -= 12; feet += 1; }
      let fracStr = "";
      if (sixteenths > 0) {
        const g = (a: number, b: number): number => b === 0 ? a : g(b, a % b);
        const d = g(sixteenths, 16);
        fracStr = ` ${sixteenths/d}/${16/d}`;
      }
      if (feet > 0) return `${feet}'-${wholeIn}${fracStr}"`;
      return `${wholeIn}${fracStr}"`;
    };

    const hdrs = ["#", "Room", "Type", "Description", "Section", "Qty", "Unit",
      "W(mm)", "D(mm)", "H(mm)", "W(ft-in)", "D(ft-in)", "H(ft-in)",
      "Material Code", "Material", "Detail", "Sheet", "Hardware", "Confidence", "Notes"];
    const allData = [hdrs];
    rows.forEach((r: any, i: number) => {
      let sheetRef = (r.sheet_ref || "").trim();
      if (/^(high|medium|low)$/i.test(sheetRef)) {
        if (!r.confidence) r.confidence = sheetRef;
        sheetRef = "";
      }
      if (/^\d+['-]/.test(sheetRef) || /^\d+mm$/.test(sheetRef)) sheetRef = "";
      
      let detail = "";
      let sheetNum = "";
      if (sheetRef) {
        const slashMatch = sheetRef.match(/^(\d+[A-D]?)\s*\/\s*(A[\d.]+)/);
        if (slashMatch) { detail = slashMatch[1]; sheetNum = slashMatch[2]; }
        else if (/^A\d+\.\d+$/.test(sheetRef)) { sheetNum = sheetRef; }
        else { detail = sheetRef; }
      }
      
      const roomResult = roomResults.find((rr: any) => rr.room === r.room);
      const roomSheetInfo = (roomResult as any)?.sheetInfo;
      if (!sheetNum) sheetNum = roomSheetInfo?.sheetNumber || "";
      if (!detail && roomSheetInfo?.detailNumbers?.length) detail = roomSheetInfo.detailNumbers.join(", ");
      
      allData.push([
        i+1, r.room || "", r.item_type || "",
        (r.description || "").replace(/;/g, ","),
        r.section_id || "", r.qty || 1, r.unit || "EA",
        r.width_mm || "", r.depth_mm || "", r.height_mm || "",
        mmToFtIn(r.width_mm), mmToFtIn(r.depth_mm), mmToFtIn(r.height_mm),
        r.material_code || "", r.material || "",
        detail, sheetNum,
        r.hardware_spec || r.hardware_type || "",
        r.confidence || "", r.notes || ""
      ]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(allData);
    ws2["!cols"] = [{wch:5},{wch:20},{wch:18},{wch:45},{wch:8},{wch:5},{wch:5},
      {wch:9},{wch:9},{wch:9},{wch:10},{wch:10},{wch:10},{wch:12},{wch:30},{wch:10},{wch:10},{wch:30},{wch:10},{wch:40}];
    XLSX.utils.book_append_sheet(wb, ws2, "All Items");

    // Per-room tabs
    const roomNames = [...new Set(rows.map((r: any) => r.room || "Unclassified"))];
    for (const rn of roomNames) {
      const rr = rows.filter((r: any) => (r.room || "Unclassified") === rn);
      if (!rr.length) continue;
      const rd = [hdrs];
      rr.forEach((r: any, i: number) => {
        let sheetRef = (r.sheet_ref || "").trim();
        if (/^(high|medium|low)$/i.test(sheetRef)) {
          if (!r.confidence) r.confidence = sheetRef;
          sheetRef = "";
        }
        if (/^\d+['-]/.test(sheetRef) || /^\d+mm$/.test(sheetRef)) sheetRef = "";
        
        let detail = "";
        let sheetNum = "";
        if (sheetRef) {
          const slashMatch = sheetRef.match(/^(\d+[A-D]?)\s*\/\s*(A[\d.]+)/);
          if (slashMatch) { detail = slashMatch[1]; sheetNum = slashMatch[2]; }
          else if (/^A\d+\.\d+$/.test(sheetRef)) { sheetNum = sheetRef; }
          else { detail = sheetRef; }
        }
        const roomResult = roomResults.find((rres: any) => rres.room === r.room);
        const roomSheetInfo = (roomResult as any)?.sheetInfo;
        if (!sheetNum) sheetNum = roomSheetInfo?.sheetNumber || "";
        if (!detail && roomSheetInfo?.detailNumbers?.length) detail = roomSheetInfo.detailNumbers.join(", ");
        
        rd.push([
          i+1, r.room || "", r.item_type || "",
          (r.description || "").replace(/;/g, ","),
          r.section_id || "", r.qty || 1, r.unit || "EA",
          r.width_mm || "", r.depth_mm || "", r.height_mm || "",
          mmToFtIn(r.width_mm), mmToFtIn(r.depth_mm), mmToFtIn(r.height_mm),
          r.material_code || "", r.material || "",
          detail, sheetNum,
          r.hardware_spec || r.hardware_type || "",
          r.confidence || "", r.notes || ""
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rd);
      ws["!cols"] = ws2["!cols"];
      const tabName = rn.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
      XLSX.utils.book_append_sheet(wb, ws, tabName);
    }

    // Warnings tab
    const wd: any[][] = [["WARNINGS"], []];
    if (!warnings.length) wd.push(["No warnings."]);
    else for (const w of warnings) wd.push([w]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wd), "Warnings");

    // v14.9.31: Parts List tab (AWI 300 cut sheet)
    if (partsRows.length > 0) {
      const partsSheet = XLSX.utils.aoa_to_sheet(partsAOA);
      partsSheet["!cols"] = [
        { wch: 10 },  // Item Ref
        { wch: 18 },  // Room
        { wch: 36 },  // Description
        { wch: 22 },  // Part
        { wch: 6  },  // Qty
        { wch: 8  },  // L"
        { wch: 8  },  // W"
        { wch: 8  },  // T"
        { wch: 10 },  // Material
        { wch: 36 },  // Notes
      ];
      XLSX.utils.book_append_sheet(wb, partsSheet, "Parts List");
    }

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
    <main style={{ minHeight:"100vh", background:"#FAFAF8", color:"#0F0F0E", fontFamily:"'DM Sans',sans-serif" }}>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        onLoad={() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; setPdfReady(true); }} />

      <nav style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 48px", height:64, borderBottom:"1px solid #E8E6E1", background:"#FAFAF8" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, background:"#0F0F0E", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ color:"#FAFAF8", fontSize:13, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>P</span></div>
          <span style={{ fontWeight:600, fontSize:15, color:"#0F0F0E" }}>ProjMgtAI</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:24 }}>
          <a href="/pricing" style={{ fontSize:14, color:"#6B6860", textDecoration:"none" }}>Pricing</a>
          <span style={{ fontSize:12, color:"#8A8880", fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#16a34a" }} />v14.9.38
          </span>
      </nav>

      <section style={{ textAlign:"center", padding:"72px 20px 56px" }}>
        <div style={{ display:"inline-block", padding:"5px 12px", border:"1px solid #B8860B22", borderRadius:4, fontSize:11, color:"#B8860B", background:"#B8860B0F", marginBottom:24, fontFamily:"'DM Mono',monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>
          Scope Extractor
        </div>
        <h1 style={{ fontSize:"clamp(32px,4.5vw,52px)", fontWeight:300, lineHeight:1.05, letterSpacing:"-0.025em", margin:"0 0 20px" }}>
          Full project takeoff,<br/>
          <span style={{ fontWeight:600 }}>every room, one upload.</span>
        </h1>
        <p style={{ fontSize:15, maxWidth:500, margin:"0 auto 36px", lineHeight:1.7, color:"#5A5850" }}>
          Upload multi-page plan PDFs. AI groups pages by room, resolves material specs
          across sheets, then extracts each room with manufacturer part numbers.
        </p>
      </section>

      <section id="try" style={{ padding:"0 40px 100px", textAlign:"center" }}>
        <div style={{ maxWidth:560, margin:"0 auto", background:"#fff", border:"1px solid #E8E6E1", borderRadius:12, padding:32, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
          {status === "idle" && (<>
            <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
              style={{ border:"2px dashed #D4D2CC", borderRadius:10, padding:"48px 24px", cursor:"pointer", marginBottom: file ? 16 : 0 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📎</div>
              <div style={{ fontSize:14, color:"#B8860B", fontWeight:500 }}>Drop a PDF here <span style={{ color:"#8A8880", fontWeight:400 }}>or click to browse</span></div>
              <div style={{ fontSize:12, color:"#A8A69E", marginTop:8 }}>Multi-page plan sets supported</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} style={{ display:"none" }} />
            {file && (<div style={{ marginTop:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#F5F3EE", borderRadius:8, border:"1px solid #E8E6E1", marginBottom:16 }}>
                <span style={{ fontSize:13 }}>📄 {file.name} <span style={{ opacity:0.5 }}>({(file.size/1024).toFixed(0)} KB)</span></span>
                <button onClick={e => { e.stopPropagation(); reset(); }} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:13 }}>✕</button>
              </div>
              <button onClick={handleExtract} disabled={!pdfReady}
                style={{ width:"100%", padding:"14px", background: pdfReady ? "#0F0F0E" : "#E8E6E1", color: pdfReady ? "#FAFAF8" : "#8A8880", border:"none", borderRadius:8, fontWeight:700, fontSize:15, cursor: pdfReady?"pointer":"wait", fontFamily:"inherit" }}>
                {pdfReady ? "Extract All Rooms -->" : "Loading PDF engine..."}
              </button>
            </div>)}
          </>)}

          {(status === "reading" || status === "analyzing" || status === "extracting" || status === "building") && (
            <div style={{ padding:"40px 0" }}>
              <div style={{ width:48, height:48, border:"3px solid #E8E6E1", borderTop:"3px solid #B8860B", borderRadius:"50%", margin:"0 auto 20px", animation:"spin 1s linear infinite" }} />
              <div style={{ fontSize:14, fontWeight:500, color:"#0F0F0E" }}>{progress}</div>
              </div>
          )}

          {status === "done" && resultUrl && (
            <div style={{ padding:"24px 0" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Extraction Complete</div>
              {stats && (
                <div style={{ fontSize:12, color:"#5A5850", marginBottom:16, lineHeight:1.8 }}>
                  {stats.pageCount} pages · {stats.roomCount} rooms · {stats.totalItems} items · {stats.withDimensions} with dims
                  {stats.materialLegendCount > 0 && ` · ${stats.materialLegendCount} materials resolved`}
                </div>
              )}
              {/* Hidden auto-download anchor — clicked programmatically */}
              <a ref={downloadLinkRef} href={resultUrl}
                download={`shop_order_v14936_${file?.name?.replace(".pdf","")}.xlsx`}
                style={{ display:"none" }} aria-hidden="true" />
              {/* Visible download button as fallback */}
              <a href={resultUrl} download={`shop_order_v14936_${file?.name?.replace(".pdf","")}.xlsx`}
                style={{ display:"inline-block", padding:"13px 28px", background:"#0F0F0E", color:"#FAFAF8", borderRadius:7, fontWeight:500, fontSize:14, textDecoration:"none", marginBottom:20 }}>
                Download Excel
              </a>

              {/* Feedback banner */}
              {feedbackStatus !== "sent" ? (
                <div style={{ background:"#F5F3EE", border:"1px solid #E8E6E1", borderRadius:10, padding:"18px 20px", textAlign:"left", marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:12, color:"#0F0F0E" }}>
                    How accurate was the extraction?
                  </div>
                  {/* Star rating */}
                  <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} type="button" onClick={(e) => { e.stopPropagation(); setFeedbackRating(n); }}
                        style={{ fontSize:22, background:"none", border:"none", cursor:"pointer", opacity: feedbackRating !== null && feedbackRating >= n ? 1 : 0.3, transition:"opacity 0.1s" }}>
                        ★
                      </button>
                    ))}
                    {feedbackRating && (
                      <span style={{ fontSize:12, opacity:0.5, alignSelf:"center", marginLeft:4 }}>
                        {["","Poor","Fair","Good","Great","Perfect"][feedbackRating]}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={feedbackNote}
                    onChange={e => setFeedbackNote(e.target.value)}
                    placeholder="What was missing or wrong? (optional)"
                    style={{ width:"100%", padding:"9px 12px", background:"#fff", border:"1px solid #E8E6E1", borderRadius:6, color:"#0F0F0E", fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:10 }}
                  />
                  <div style={{ display:"flex", gap:8 }}>
                    <input
                      type="email"
                      value={feedbackEmail}
                      onChange={e => setFeedbackEmail(e.target.value)}
                      placeholder="your@email.com (to follow up)"
                      style={{ flex:1, padding:"9px 12px", background:"#fff", border:"1px solid #E8E6E1", borderRadius:6, color:"#0F0F0E", fontSize:13, outline:"none" }}
                    />
                    <button type="button" onClick={(e) => { e.stopPropagation(); submitFeedback(); }}
                      disabled={!feedbackEmail || feedbackRating === null || feedbackStatus === "sending"}
                      style={{ padding:"9px 18px", background: (feedbackEmail && feedbackRating !== null) ? "#0F0F0E" : "#F0EEE9", border: "1px solid #E8E6E1", borderRadius:6, color: (feedbackEmail && feedbackRating !== null) ? "#FAFAF8" : "#A8A69E", fontSize:13, cursor: (feedbackEmail && feedbackRating !== null) ? "pointer" : "default", fontFamily:"inherit", whiteSpace:"nowrap", fontWeight: (feedbackEmail && feedbackRating !== null) ? 600 : 400 }}>
                      {feedbackStatus === "sending" ? "..." : "Send"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize:13, color:"#16a34a", marginBottom:16, padding:"12px 16px", background:"#ECFDF5", border:"1px solid #D1FAE5", borderRadius:8 }}>
                  Thanks for the feedback — it goes straight into training data.
                </div>
              )}

              <button onClick={reset} style={{ background:"none", border:"1px solid #D4D2CC", color:"#0F0F0E", padding:"10px 24px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Extract Another</button>
            </div>
          )}

          {status === "error" && (
            <div style={{ padding:"24px 0" }}>
              <div style={{ fontSize:40, marginBottom:16 }}>❌</div>
              <div style={{ fontSize:14, fontWeight:500, color:"#0F0F0E", color:"#ef4444", marginBottom:8 }}>{error}</div>
              <button onClick={reset} style={{ background:"none", border:"1px solid #D4D2CC", color:"#0F0F0E", padding:"10px 24px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Try Again</button>
            </div>
          )}
        </div>
      </section>

      <footer style={{ textAlign:"center", padding:"28px 48px", borderTop:"1px solid #E8E6E1", fontSize:11, color:"#A8A69E", fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em" }}>
        PROJMGTAI  ·  CENTRIV AI  ·  FULLERTON CA
      </footer>
    </main>
  );
}
