// src/app/scope-extractor/page.tsx
// ProjMgtAI v14.9.0 — Feedback UI + Constructability RFI Agent
// v14.9.0:
//   - NEW: Feedback UI — in-browser review/correct before Excel export
//     - Status "review" inserted between "extracting" and "building"
//     - Editable: Room, Type, Description, Confidence per row
//     - Grouped by room, color-coded by confidence, delete rows, flag for RFI
//     - "Approve & Download" builds Excel from corrected data
//   - NEW: Agent F — Constructability RFI Agent
//     - Rule-based field review: blocking, attachment, MEP, ADA, tolerances, lead time
//     - Merged into existing RFIs tab under category "Constructability"
//     - Runs entirely client-side from extracted row data (no extra API call)
"use client";

import { useState, useRef, useCallback } from "react";
import Script from "next/script";

type Status = "idle" | "reading" | "analyzing" | "extracting" | "review" | "building" | "done" | "error";
type FileEntry = { file: File; type: "plans" | "specs" | "addenda" | "shop_drawings"; };

// Editable review row — only core fields are mutable in UI
type ReviewRow = {
  _id: number;           // stable index for keying
  _flagForRfi: boolean;  // user-flagged during review
  _deleted: boolean;
  room: string;
  item_type: string;
  description: string;
  confidence: string;
  // passthrough fields (not editable in review but preserved for Excel)
  qty: any; unit: any; section_id: any;
  width_mm: any; depth_mm: any; height_mm: any;
  material_code: any; material: any;
  sheet_ref: any; hardware_spec: any; hardware_type: any;
  notes: any; classification_rule: any; [key: string]: any;
};

declare global { interface Window { pdfjsLib: any; XLSX: any; } }

const VALID_ITEM_TYPES = [
  "assembly","base_cabinet","upper_cabinet","tall_cabinet","countertop",
  "transaction_top","decorative_panel","trim","channel","rubber_base","substrate",
  "concealed_hinge","piano_hinge","grommet","adjustable_shelf","fixed_shelf",
  "cpu_shelf","drawer","file_drawer","trash_drawer","rollout_basket",
  "conduit","j_box","equipment_cutout","safe_cabinet","controls_cabinet",
  "end_panel","corner_guard","corner_detail","stainless_panel","hanger_support",
  "trellis","scope_exclusion",
];

export default function HomePage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review state
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [reviewRoomResults, setReviewRoomResults] = useState<any[]>([]);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [reviewProjectContext, setReviewProjectContext] = useState<any>(null);
  const [reviewStats, setReviewStats] = useState<any>(null);
  const [reviewProjectName, setReviewProjectName] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"all" | "low" | "flagged">("all");

  const detectFileType = (name: string): FileEntry["type"] => {
    if (/spec|division|section/i.test(name)) return "specs";
    if (/addend|delta|revision|rev\d|asi/i.test(name)) return "addenda";
    if (/shop|submitt|detail/i.test(name)) return "shop_drawings";
    return "plans";
  };

  const addFiles = (newFiles: File[]) => {
    const pdfs = newFiles.filter(f => f.type === "application/pdf");
    if (pdfs.length === 0) { setError("Please select PDF files."); return; }
    const totalSize = [...files.map(f => f.file), ...pdfs].reduce((s, f) => s + f.size, 0);
    if (totalSize > 150 * 1024 * 1024) { setError("Total file size exceeds 150MB."); return; }
    setFiles(prev => [...prev, ...pdfs.map(f => ({ file: f, type: detectFileType(f.name) }))]);
    setError("");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); addFiles(Array.from(e.dataTransfer.files));
  }, [files]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const changeFileType = (idx: number, newType: FileEntry["type"]) =>
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, type: newType } : f));

  // ─── PDF Reading ─────────────────────────────────────────────────────────
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
          const scale = 2.0;
          const viewport = page.getViewport({ scale });
          const maxDim = Math.max(viewport.width, viewport.height);
          const finalScale = maxDim > 2000 ? scale * (2000 / maxDim) : scale;
          const finalViewport = page.getViewport({ scale: finalScale });
          const canvas = document.createElement("canvas");
          canvas.width = finalViewport.width; canvas.height = finalViewport.height;
          const ctx2d = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx2d, viewport: finalViewport }).promise;
          const base64 = canvas.toDataURL("image/jpeg", 0.70).split(",")[1];
          imagePages[i] = base64;
          canvas.remove();
        } catch (renderErr) { console.warn(`Failed to render page ${i}:`, renderErr); }
      }
    }
    return { text: pages.join("\n\n"), pageCount: pdf.numPages, imagePages };
  }

  // ─── Main Extract Flow ────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (files.length === 0 || !pdfReady) return;
    setStatus("reading"); setProgress("Extracting text from PDFs..."); setError("");
    setResultUrl(null); setStats(null);

    try {
      let combinedText = "";
      let totalPageCount = 0;
      let allImagePages: Record<number, string> = {};

      for (let fi = 0; fi < files.length; fi++) {
        const entry = files[fi];
        setProgress(`Reading file ${fi + 1}/${files.length}: ${entry.file.name} [${entry.type}]...`);
        const { text, pageCount, imagePages } = await extractTextFromPdf(entry.file);

        const pageTexts = text.split(/--- PAGE \d+ ---/).filter(Boolean);
        for (let p = 0; p < pageTexts.length; p++) {
          const globalPage = totalPageCount + p + 1;
          combinedText += `--- PAGE ${globalPage} [${entry.type.toUpperCase()}] ---\n${pageTexts[p]}\n\n`;
        }
        for (const [pn, b64] of Object.entries(imagePages)) {
          allImagePages[totalPageCount + parseInt(pn)] = b64;
        }
        totalPageCount += pageCount;
      }

      const imagePageNums = Object.keys(allImagePages).map(Number);
      if (imagePageNums.length > 0) {
        setProgress(`Found ${imagePageNums.length} image-only page(s) — will use vision`);
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!combinedText || combinedText.trim().length < 10)
        throw new Error("Could not extract text from any PDF.");

      setStatus("analyzing");
      setProgress(`Analyzing ${totalPageCount} pages from ${files.length} file(s) — detecting rooms & material legend...`);

      const projectName = files.find(f => f.type === "plans")?.file.name?.replace(".pdf", "") || files[0].file.name.replace(".pdf", "");

      const analyzeRes = await fetch("/api/scope-extractor-v14", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText, projectId: projectName, mode: "analyze" }),
      });
      if (!analyzeRes.ok) {
        const e = await analyzeRes.json().catch(() => ({}));
        throw new Error(e.error || `Analysis failed (${analyzeRes.status})`);
      }
      const analysis = await analyzeRes.json();
      if (!analysis.ok) throw new Error(analysis.error || "Analysis failed");

      const rooms = analysis.rooms || [];
      const projectContext = analysis.projectContext || {};
      projectContext.sourceFiles = files.map(f => ({ name: f.file.name, type: f.type, pages: 0 }));

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
              text: combinedText, projectId: projectName,
              mode: "extract", roomName: room.roomName, roomPages: room.pageNums,
              projectContext,
              pageImages: room.pageNums.reduce((acc: Record<number, string>, pn: number) => {
                if (allImagePages[pn]) acc[pn] = allImagePages[pn];
                return acc;
              }, {}),
            }),
          });

          if (!extractRes.ok) {
            const e = await extractRes.json().catch(() => ({}));
            if ((extractRes.status === 429 || (e.error && e.error.includes("rate_limit"))) && retryCount < MAX_RETRIES_PER_ROOM) {
              setProgress(`Rate limited — waiting 30s before retrying ${room.roomName}...`);
              await new Promise(r => setTimeout(r, 30000));
              retryCount++; i--; continue;
            }
            allWarnings.push(`[${room.roomName}] Error: ${e.error || extractRes.status}`);
            roomResults.push({ room: room.roomName, status: "failed", itemCount: 0, pages: room.pageNums });
            retryCount = 0; continue;
          }

          retryCount = 0;
          const result = await extractRes.json();
          if (result.ok) {
            const rowCount = result.rows?.length || 0;
            if (rowCount === 0 && !(room as any)._retried) {
              (room as any)._retried = true;
              setProgress(`${room.roomName}: 0 items — retrying...`);
              await new Promise(r => setTimeout(r, 2000));
              i--; continue;
            }
            allRows.push(...(result.rows || []));
            allWarnings.push(...(result.warnings || []).map((w: string) => `[${room.roomName}] ${w}`));
            roomResults.push({
              room: room.roomName, status: "ok", itemCount: rowCount,
              pages: room.pageNums, sheetInfo: result.sheetInfo || null, timing: result.timing,
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

        if (i < rooms.length - 1) await new Promise(r => setTimeout(r, 3000));
      }

      // ── Transition to REVIEW instead of building directly ───────────────
      const finalStats = {
        pageCount: totalPageCount, roomCount: rooms.length, totalItems: allRows.length,
        withDimensions: allRows.filter((r: any) => r.width_mm || r.length_mm || r.height_mm).length,
        withMaterials: allRows.filter((r: any) => r.material_code || r.material).length,
        materialLegendCount: projectContext.materialLegend?.length || 0,
        documentType: projectContext.documentType || "unknown",
        roomResults, fileCount: files.length,
      };

      // Build ReviewRow array with stable _id
      const rr: ReviewRow[] = allRows.map((r: any, idx: number) => ({
        _id: idx, _flagForRfi: false, _deleted: false,
        room: r.room || "Unclassified",
        item_type: r.item_type || "",
        description: r.description || "",
        confidence: r.confidence || "",
        qty: r.qty, unit: r.unit, section_id: r.section_id,
        width_mm: r.width_mm, depth_mm: r.depth_mm, height_mm: r.height_mm,
        material_code: r.material_code, material: r.material,
        sheet_ref: r.sheet_ref, hardware_spec: r.hardware_spec, hardware_type: r.hardware_type,
        notes: r.notes, classification_rule: r.classification_rule,
      }));

      setReviewRows(rr);
      setReviewRoomResults(roomResults);
      setReviewWarnings(allWarnings);
      setReviewProjectContext(projectContext);
      setReviewStats(finalStats);
      setReviewProjectName(projectName);
      setStats(finalStats);
      setStatus("review");

    } catch (err: any) {
      setStatus("error"); setError(err.message || "Something went wrong"); setProgress("");
    }
  };

  // ─── Review helpers ───────────────────────────────────────────────────────
  const updateReviewRow = (id: number, field: keyof ReviewRow, value: any) => {
    setReviewRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));
  };

  const deleteReviewRow = (id: number) => {
    setReviewRows(prev => prev.map(r => r._id === id ? { ...r, _deleted: true } : r));
  };

  const toggleFlag = (id: number) => {
    setReviewRows(prev => prev.map(r => r._id === id ? { ...r, _flagForRfi: !r._flagForRfi } : r));
  };

  const undoDelete = (id: number) => {
    setReviewRows(prev => prev.map(r => r._id === id ? { ...r, _deleted: false } : r));
  };

  const handleApproveAndDownload = async () => {
    setStatus("building"); setProgress("Building Excel workbook...");
    try {
      const activeRows = reviewRows.filter(r => !r._deleted);
      // Convert ReviewRows back to plain objects for buildExcel
      const plainRows = activeRows.map(r => {
        const { _id, _flagForRfi, _deleted, ...rest } = r;
        // Inject flag into notes if flagged
        if (_flagForRfi) rest.notes = `[FLAGGED FOR RFI] ${rest.notes || ""}`.trim();
        return rest;
      });

      // Update stats with post-review counts
      const updatedStats = {
        ...reviewStats,
        totalItems: plainRows.length,
        withDimensions: plainRows.filter((r: any) => r.width_mm || r.depth_mm || r.height_mm).length,
        withMaterials: plainRows.filter((r: any) => r.material_code || r.material).length,
      };

      const flaggedWarnings = reviewRows
        .filter(r => r._flagForRfi && !r._deleted)
        .map(r => `[${r.room}] User flagged: "${r.description.substring(0, 60)}"`);

      const blob = await buildExcel(
        plainRows, reviewRoomResults,
        [...reviewWarnings, ...flaggedWarnings],
        reviewProjectContext, updatedStats, reviewProjectName + ".pdf"
      );
      setResultUrl(URL.createObjectURL(blob));
      setStats(updatedStats);
      setStatus("done"); setProgress("");
    } catch (err: any) {
      setStatus("error"); setError(err.message || "Excel build failed"); setProgress("");
    }
  };

  // ─── Excel Build ──────────────────────────────────────────────────────────
  async function buildExcel(
    rows: any[], roomResults: any[], warnings: string[],
    projectContext: any, stats: any, filename: string
  ): Promise<Blob> {
    const XLSX = await loadSheetJS();
    const wb = XLSX.utils.book_new();

    // ── Item re-routing — gender-specific vanity/locker items ──────────────
    for (const r of rows) {
      const desc = (r.description || "").toLowerCase();
      const currentRoom = (r.room || "").toLowerCase();
      if (/women['']?s?\b/i.test(r.description) && /\b(?:vanit|wet|dry|lavator|counter)/i.test(desc)) {
        if (/men/i.test(currentRoom) && !/women/i.test(currentRoom)) r.room = "Womens Vanity";
      }
      if (/\bmen['']?s?\s*(?:wet|dry|vanit)/i.test(desc) && !/men/i.test(currentRoom)) r.room = "Mens Vanity";
      if (/\bwomen['']?s?\s*(?:wet|dry|vanit)/i.test(desc) && !/women/i.test(currentRoom)) r.room = "Womens Vanity";
    }

    // ── Assembly enrichment ────────────────────────────────────────────────
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
      for (const r of items) { const room = r.room || "Unclassified"; if (!roomItems[room]) roomItems[room] = []; roomItems[room].push(r); }
      for (const room of Object.keys(roomItems)) {
        const ri = roomItems[room];
        const assemblies = ri.filter((r: any) => r.item_type === "assembly");
        const children = ri.filter((r: any) => r.item_type !== "assembly" && r.item_type !== "scope_exclusion");
        if (!assemblies.length) continue;
        for (let ai = 1; ai < assemblies.length; ai++) assemblies[ai]._duplicate = true;
        let totalLF = 0; let maxW = 0; let maxD = 0; let maxH = 0;
        const typeCounts: Record<string, number> = {}; const materials = new Set<string>(); const matCodes = new Set<string>();
        for (const c of children) {
          const w = Number(c.width_mm)||0, d = Number(c.depth_mm)||0, h = Number(c.height_mm)||0;
          if (w > maxW) maxW = w; if (d > maxD) maxD = d; if (h > maxH) maxH = h;
          const lfMatch = ((c.notes||"")+" "+(c.description||"")).match(/(\d+\.?\d*)\s*LF/);
          if (lfMatch) totalLF += parseFloat(lfMatch[1]);
          const t = c.item_type||"item"; typeCounts[t] = (typeCounts[t]||0) + (Number(c.qty)||1);
          if (c.material && !VALID_ITEM_TYPES_SET.has(c.material)) materials.add(c.material);
          if (c.material_code && !VALID_ITEM_TYPES_SET.has(c.material_code)) matCodes.add(c.material_code);
        }
        const typeNames: Record<string, string> = {
          base_cabinet:"base cabinet", upper_cabinet:"upper cabinet", tall_cabinet:"tall cabinet",
          countertop:"countertop", transaction_top:"transaction top", decorative_panel:"decorative panel",
          fixed_shelf:"shelf", adjustable_shelf:"adj. shelf", drawer:"drawer", file_drawer:"file drawer",
          trash_drawer:"trash drawer", grommet:"grommet", conduit:"conduit", j_box:"j-box",
          safe_cabinet:"safe cabinet", trim:"trim", channel:"channel", rubber_base:"rubber base",
          substrate:"substrate", piano_hinge:"hinge", concealed_hinge:"hinge", equipment_cutout:"equip. cutout",
          hanger_support:"support", cpu_shelf:"CPU shelf", rollout_basket:"rollout basket",
        };
        const typePriority: Record<string, number> = {
          base_cabinet:1, upper_cabinet:1, tall_cabinet:1, countertop:2, transaction_top:2,
          decorative_panel:3, trim:4, channel:4, fixed_shelf:5, adjustable_shelf:5, cpu_shelf:5,
          drawer:5, file_drawer:5, trash_drawer:5, safe_cabinet:5, rubber_base:6, substrate:6,
          conduit:7, j_box:7, grommet:8, concealed_hinge:8, piano_hinge:8, hanger_support:8,
          equipment_cutout:7, rollout_basket:5,
        };
        const sorted = Object.entries(typeCounts).sort((a,b) => (typePriority[a[0]]||9)-(typePriority[b[0]]||9) || b[1]-a[1]);
        const parts = sorted.map(([type, count]) => {
          const name = typeNames[type]||type.replace(/_/g," ");
          return `(${count}) ${name}${count>1?"s":""}`;
        });
        const matStr = matCodes.size>0 ? `. Materials: ${[...matCodes].join(", ")}` : "";
        const lfStr = totalLF>0 ? ` — ${totalLF.toFixed(1)} LF total` : "";
        const summaryDesc = `Custom millwork assembly: ${parts.join(", ")}${lfStr}${matStr}`;
        const overallW = totalLF>0 ? Math.round(totalLF*304.8) : (maxW||"");
        for (const assy of assemblies) {
          if (!assy.description || assy.description===`${room} Assembly` || /assembly$/i.test(assy.description)) assy.description = summaryDesc;
          if (!assy.width_mm && overallW) assy.width_mm = overallW;
          if (!assy.depth_mm && maxD) assy.depth_mm = maxD;
          if (!assy.height_mm && maxH) assy.height_mm = maxH;
        }
      }
    };
    enrichAssemblies(rows);
    rows = rows.filter((r: any) => !r._duplicate);

    // ── Tab 1: Project Summary ─────────────────────────────────────────────
    const pi = projectContext.projectInfo || {};
    const sum: any[][] = [["MILLWORK SHOP ORDER — ProjMgtAI v14.9.0"], []];
    if (pi.projectName) sum.push(["Project:", pi.projectName]); else sum.push(["Project:", filename.replace(".pdf","")]);
    if (pi.address) sum.push(["Address:", pi.address]);
    if (pi.client) sum.push(["Client:", pi.client]);
    if (pi.architect) sum.push(["Architect:", pi.architect]);
    if (pi.planSet) sum.push(["Plan Set:", pi.planSet]);
    if (pi.planDate) sum.push(["Plan Date:", pi.planDate]);
    sum.push(["Document Type:", projectContext.documentType||"unknown"]);
    if (projectContext.sourceFiles?.length > 1) {
      sum.push([]); sum.push(["SOURCE FILES"]); sum.push(["File","Type"]);
      for (const sf of projectContext.sourceFiles) sum.push([sf.name, sf.type]);
    }
    sum.push([]); sum.push(["SCOPE SUMMARY"]);
    sum.push(["Pages:", stats.pageCount]); sum.push(["Rooms:", stats.roomCount]);
    sum.push(["Total Items:", stats.totalItems]);
    sum.push(["Items w/ Dimensions:", stats.withDimensions]);
    sum.push(["Items w/ Materials:", stats.withMaterials]);
    sum.push([]);
    if (projectContext.materialLegend?.length > 0) {
      sum.push(["MATERIAL LEGEND"]); sum.push(["Code","Manufacturer","Product","Catalog #","Category"]);
      for (const m of projectContext.materialLegend) sum.push([m.code, m.manufacturer, m.productName, m.catalogNumber, m.category]);
      sum.push([]);
    }
    sum.push(["ROOM RESULTS"]); sum.push(["Room","Status","Items","Sheet","Details"]);
    for (const r of roomResults) {
      const si = (r as any).sheetInfo;
      sum.push([r.room, r.status, r.itemCount||0, si?.sheetNumber||"", si?.detailNumbers?.join(", ")||""]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(sum);
    ws1["!cols"] = [{wch:25},{wch:20},{wch:25},{wch:20},{wch:15}];
    XLSX.utils.book_append_sheet(wb, ws1, "Project Summary");

    // ── Agent B: Trade Classifier ─────────────────────────────────────────
    const classifyItem = (r: any): { confidence: string; rule: string } => {
      const type = (r.item_type||"").toLowerCase();
      const desc = (r.description||"").toLowerCase();
      const hasDims = !!(r.width_mm||r.depth_mm||r.height_mm);
      const hasMat = !!r.material_code;
      const hasHw = !!(r.hardware_spec||r.hardware_type);
      if (type==="scope_exclusion") {
        if (/by\s*others|nic|not\s*in/i.test(desc)) return { confidence:"high", rule:"RULE_explicit_exclusion" };
        if (/mirror|tv|monitor|light/i.test(desc)) return { confidence:"high", rule:"RULE_fixture_exclusion" };
        return { confidence:"medium", rule:"LLM_exclusion" };
      }
      if (type==="assembly") return { confidence:"high", rule:"RULE_assembly_rollup" };
      let score = 0; let ruleTag = "LLM_classify";
      if (hasDims) { score+=30; ruleTag="RULE_has_dimensions"; }
      if (hasMat) { score+=25; ruleTag=hasDims?"RULE_dims_and_material":"RULE_has_material"; }
      if (hasHw) score+=10;
      if (/cabinet/i.test(type) && hasDims) { score+=20; ruleTag="RULE_cabinet_with_dims"; }
      if (/countertop|transaction/i.test(type) && hasMat) { score+=20; ruleTag="RULE_countertop_with_mat"; }
      if (/hinge|grommet/i.test(type)) { score+=15; ruleTag="RULE_hardware_item"; }
      if (/trim|channel|rubber/i.test(type)) { score+=10; ruleTag=hasMat?"RULE_trim_with_mat":"RULE_trim_generic"; }
      if (desc.length>20) score+=10;
      if (/\d+['"]\s*[-x×]/i.test(desc)) score+=15;
      return { confidence: score>=60?"high": score>=30?"medium":"low", rule: ruleTag };
    };

    for (const r of rows) {
      if (r.qty) { const q=Number(r.qty); if (isNaN(q)||q<=0||q>500) r.qty=1; }
      if (r.confidence && !/^(high|medium|low)$/i.test(r.confidence)) {
        if (!r.notes) r.notes=r.confidence;
        r.confidence="";
      }
      const { confidence, rule } = classifyItem(r);
      if (!r.confidence||r.confidence==="") r.confidence=confidence;
      r.classification_rule=rule;
    }

    // ── mm → ft-in converter ──────────────────────────────────────────────
    const mmToFtIn = (mm: any): string => {
      if (!mm||isNaN(Number(mm))||Number(mm)<=0) return "";
      const totalInches = Number(mm)/25.4;
      let feet=Math.floor(totalInches/12), inches=totalInches%12;
      let wholeIn=Math.floor(inches); const frac=inches-wholeIn;
      let sixteenths=Math.round(frac*16);
      if (sixteenths>=16) { sixteenths=0; wholeIn+=1; }
      if (wholeIn>=12) { wholeIn-=12; feet+=1; }
      let fracStr="";
      if (sixteenths>0) {
        const g=(a:number,b:number):number => b===0?a:g(b,a%b);
        const d=g(sixteenths,16);
        fracStr=` ${sixteenths/d}/${16/d}`;
      }
      if (feet>0) return `${feet}'-${wholeIn}${fracStr}"`;
      return `${wholeIn}${fracStr}"`;
    };

    // ── Tab 2: All Items ──────────────────────────────────────────────────
    const hdrs = ["#","Room","Type","Description","Section","Qty","Unit",
      "W(mm)","D(mm)","H(mm)","W(ft-in)","D(ft-in)","H(ft-in)",
      "Material Code","Material","Detail","Sheet","Hardware","Confidence","Rule","Notes"];
    const allData = [hdrs];
    const buildRow = (r: any, i: number) => {
      let sheetRef=(r.sheet_ref||"").trim();
      if (/^(high|medium|low)$/i.test(sheetRef)) { if (!r.confidence) r.confidence=sheetRef; sheetRef=""; }
      if (/^\d+['-]/.test(sheetRef)||/^\d+mm$/.test(sheetRef)) sheetRef="";
      let detail="", sheetNum="";
      if (sheetRef) {
        const slashMatch=sheetRef.match(/^(\d+[A-D]?)\s*\/\s*(A[\d.]+)/);
        if (slashMatch) { detail=slashMatch[1]; sheetNum=slashMatch[2]; }
        else if (/^A\d+\.\d+$/.test(sheetRef)) sheetNum=sheetRef;
        else detail=sheetRef;
      }
      const roomResult=roomResults.find((rr:any)=>rr.room===r.room);
      const roomSheetInfo=(roomResult as any)?.sheetInfo;
      if (!sheetNum) sheetNum=roomSheetInfo?.sheetNumber||"";
      if (!detail && roomSheetInfo?.detailNumbers?.length) detail=roomSheetInfo.detailNumbers.join(", ");
      return [
        i+1, r.room||"", r.item_type||"",
        (r.description||"").replace(/;/g,","),
        r.section_id||"", r.qty||1, r.unit||"EA",
        r.width_mm||"", r.depth_mm||"", r.height_mm||"",
        mmToFtIn(r.width_mm), mmToFtIn(r.depth_mm), mmToFtIn(r.height_mm),
        r.material_code||"", r.material||"", detail, sheetNum,
        r.hardware_spec||r.hardware_type||"",
        r.confidence||"", r.classification_rule||"", r.notes||""
      ];
    };
    rows.forEach((r:any, i:number) => allData.push(buildRow(r,i)));
    const colWidths = [{wch:5},{wch:20},{wch:18},{wch:45},{wch:8},{wch:5},{wch:5},
      {wch:9},{wch:9},{wch:9},{wch:10},{wch:10},{wch:10},{wch:12},{wch:30},{wch:10},{wch:10},{wch:30},{wch:10},{wch:22},{wch:40}];
    const ws2 = XLSX.utils.aoa_to_sheet(allData);
    ws2["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws2, "All Items");

    // ── Per-room tabs ─────────────────────────────────────────────────────
    const roomNames = [...new Set(rows.map((r:any) => r.room||"Unclassified"))];
    for (const rn of roomNames) {
      const rr = rows.filter((r:any)=>(r.room||"Unclassified")===rn);
      if (!rr.length) continue;
      const rd = [hdrs];
      rr.forEach((r:any, i:number) => rd.push(buildRow(r,i)));
      const ws = XLSX.utils.aoa_to_sheet(rd);
      ws["!cols"] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, rn.substring(0,31).replace(/[\\/*?[\]:]/g,""));
    }

    // ── Agent D: Bid Checklist ────────────────────────────────────────────
    const checklist: any[][] = [["#","Room","Category","Check Item","Status","Found","Notes"]];
    let checkNum = 0;
    const addCheck = (room:string, category:string, item:string, status:string, found:string, notes:string) => {
      checklist.push([++checkNum, room, category, item, status, found, notes]);
    };
    const roomItemMap: Record<string, any[]> = {};
    for (const r of rows) { const room=r.room||"Unclassified"; if (!roomItemMap[room]) roomItemMap[room]=[]; roomItemMap[room].push(r); }
    for (const [room, items] of Object.entries(roomItemMap)) {
      const millItems = items.filter((r:any)=>r.item_type!=="scope_exclusion"&&r.item_type!=="assembly");
      const types = new Set(millItems.map((r:any)=>r.item_type));
      const hasHardware = millItems.some((r:any)=>r.hardware_spec||r.hardware_type);
      const cabinets = millItems.filter((r:any)=>/cabinet/i.test(r.item_type||""));
      const countertops = millItems.filter((r:any)=>r.item_type==="countertop"||r.item_type==="transaction_top");
      const shelves = millItems.filter((r:any)=>/shelf/i.test(r.item_type||""));
      const hasSubstrate = types.has("substrate");
      if (cabinets.length>0 && !hasSubstrate) addCheck(room,"Blocking","Plywood substrate/blocking for cabinet mounting","VERIFY","Not found","Cabinets present — confirm blocking scope");
      else if (hasSubstrate) addCheck(room,"Blocking","Plywood substrate/blocking","OK","Yes","");
      const hinges = millItems.filter((r:any)=>/hinge/i.test(r.item_type||""));
      if (cabinets.length>0) {
        if (hinges.length>0||hasHardware) addCheck(room,"Hardware",`Cabinet hardware (${hinges.length} hinge items found)`,"OK","Yes","Verify hinge type and qty per door");
        else addCheck(room,"Hardware","Cabinet hardware (hinges, pulls, locks)","MISSING","Not found",`${cabinets.length} cabinet(s) — no hardware specified`);
      }
      const drawers = millItems.filter((r:any)=>/drawer/i.test(r.item_type||""));
      if (drawers.length>0) addCheck(room,"Hardware",`Drawer slides (${drawers.length} drawer items)`,"VERIFY","","Confirm slide type: full extension / soft close");
      if (shelves.length>0) addCheck(room,"Hardware",`Shelf supports (${shelves.length} shelf items)`,"VERIFY","","Confirm: pins, standards, or fixed cleats");
      if (countertops.length>0) addCheck(room,"Finish",`Countertop edge profile (${countertops.length} top items)`,"VERIFY","","Confirm edge detail: eased, beveled, bullnose, waterfall");
      const itemsNoMat = millItems.filter((r:any)=>!r.material_code);
      if (itemsNoMat.length>0 && millItems.length>0) {
        const pct=Math.round((1-itemsNoMat.length/millItems.length)*100);
        addCheck(room,"Finish",`Material specs (${pct}% complete)`,pct>=80?"OK":"VERIFY",`${millItems.length-itemsNoMat.length}/${millItems.length} items`,itemsNoMat.length>0?`Missing: ${itemsNoMat.slice(0,2).map((r:any)=>r.item_type).join(", ")}`:"");
      }
      const itemsNoDims = millItems.filter((r:any)=>!r.width_mm&&!r.depth_mm&&!r.height_mm);
      if (millItems.length>0) {
        const pct=Math.round((1-itemsNoDims.length/millItems.length)*100);
        addCheck(room,"Dimensions",`Field dimensions (${pct}% complete)`,pct>=60?"OK":"VERIFY",`${millItems.length-itemsNoDims.length}/${millItems.length} items`,pct<60?"Field verify critical dimensions before fabrication":"");
      }
      if (/vanit|restroom|reception|ada/i.test(room)) {
        addCheck(room,"ADA","ADA knee clearance (27\" min under counter)","VERIFY","","Confirm 27\" knee height, 8\" toe depth per ADA 306");
        if (/vanit|restroom/i.test(room)) addCheck(room,"ADA","ADA mirror mounting height (40\" max to bottom)","VERIFY","","Confirm mirror height per ADA 603.3");
      }
      const exclusions = items.filter((r:any)=>r.item_type==="scope_exclusion");
      if (exclusions.length>0) addCheck(room,"Exclusions",`${exclusions.length} scope exclusion(s)`,"VERIFY","",exclusions.slice(0,2).map((r:any)=>(r.description||"").substring(0,30)).join("; "));
    }
    const wsCheck = XLSX.utils.aoa_to_sheet(checklist);
    wsCheck["!cols"] = [{wch:5},{wch:25},{wch:14},{wch:55},{wch:9},{wch:12},{wch:50}];
    XLSX.utils.book_append_sheet(wb, wsCheck, "Bid Checklist");

    // ── Agent C: WBS Summary ──────────────────────────────────────────────
    const wbs: any[][] = [["WBS #","Level","Trade / Component","Room","Qty","Unit","Total W (ft-in)","Material","Notes"]];
    let wbsNum = 0;
    const getTradeCategory = (itemType: string): string => {
      if (/cabinet|drawer|file_drawer|rollout|trash_drawer/i.test(itemType)) return "Cabinetry";
      if (/countertop|transaction_top/i.test(itemType)) return "Countertops";
      if (/shelf/i.test(itemType)) return "Shelving";
      if (/panel|substrate|trellis/i.test(itemType)) return "Panels & Substrates";
      if (/trim|channel|rubber_base|corner/i.test(itemType)) return "Trim & Molding";
      if (/hinge|grommet/i.test(itemType)) return "Hardware";
      if (/cutout|j_box|conduit/i.test(itemType)) return "Cutouts & Electrical";
      if (/scope_exclusion/i.test(itemType)) return "Exclusions";
      if (/assembly/i.test(itemType)) return "Assemblies";
      return "Other";
    };
    const tradeMap: Record<string, Record<string, any[]>> = {};
    for (const r of rows) {
      const trade=getTradeCategory(r.item_type||""), room=r.room||"Unclassified";
      if (!tradeMap[trade]) tradeMap[trade]={};
      if (!tradeMap[trade][room]) tradeMap[trade][room]=[];
      tradeMap[trade][room].push(r);
    }
    const tradePriority: Record<string,number> = {"Cabinetry":1,"Countertops":2,"Shelving":3,"Panels & Substrates":4,"Trim & Molding":5,"Hardware":6,"Cutouts & Electrical":7,"Assemblies":8,"Exclusions":9,"Other":10};
    for (const trade of Object.keys(tradeMap).sort((a,b)=>(tradePriority[a]||99)-(tradePriority[b]||99))) {
      const trms = tradeMap[trade];
      let tradeQty=0, tradeTotalWidthMm=0; const tradeMats=new Set<string>();
      wbsNum++;
      const tradeWbsNum=wbsNum, tradeRowIdx=wbs.length;
      wbs.push([`${wbsNum}`,"Trade",trade,"",0,"","","",""]);
      for (const [room, items] of Object.entries(trms).sort((a,b)=>a[0].localeCompare(b[0]))) {
        const roomQty=items.reduce((s:number,r:any)=>s+(Number(r.qty)||1),0);
        const roomWidthMm=items.reduce((s:number,r:any)=>s+(Number(r.width_mm)||0),0);
        const roomMats=[...new Set(items.map((r:any)=>r.material_code).filter(Boolean))];
        tradeQty+=roomQty; tradeTotalWidthMm+=roomWidthMm;
        roomMats.forEach((m:any)=>tradeMats.add(m));
        wbsNum++;
        wbs.push([`${tradeWbsNum}.${wbsNum-tradeWbsNum}`,"Room",`${items.length} ${trade.toLowerCase()} item(s)`,room,roomQty,"EA",roomWidthMm>0?mmToFtIn(roomWidthMm):"",roomMats.join(", "),items.filter((r:any)=>r.item_type!=="assembly").map((r:any)=>r.item_type).join(", ")]);
      }
      wbs[tradeRowIdx][4]=tradeQty;
      wbs[tradeRowIdx][7]=[...tradeMats].join(", ");
      wbs[tradeRowIdx][8]=`${Object.keys(trms).length} room(s)`;
    }
    wbs.push([]);
    const totalMill=rows.filter((r:any)=>r.item_type!=="scope_exclusion"&&r.item_type!=="assembly").length;
    const totalExcl=rows.filter((r:any)=>r.item_type==="scope_exclusion").length;
    wbs.push(["","","TOTAL","",rows.length,"","","",`${totalMill} millwork + ${totalExcl} exclusions`]);
    const wsWbs = XLSX.utils.aoa_to_sheet(wbs);
    wsWbs["!cols"] = [{wch:8},{wch:8},{wch:35},{wch:28},{wch:6},{wch:5},{wch:14},{wch:20},{wch:45}];
    XLSX.utils.book_append_sheet(wb, wsWbs, "WBS Summary");

    // ═══════════════════════════════════════════════════════════════════════
    // AGENT E + F: COMBINED RFIs TAB
    //   Agent E: Extraction gap RFIs (6 types — existing)
    //   Agent F: Constructability RFIs (new — what a senior Sup/PM would flag)
    //   Merged via "Category" column — Constructability items have distinct categories
    // ═══════════════════════════════════════════════════════════════════════
    const rfis: any[][] = [
      ["RFI #","Priority","Category","Type","Room","Description","Reference","Status"],
    ];
    let rfiNum = 0;
    const addRfi = (priority:string, category:string, type:string, room:string, desc:string, ref:string) => {
      rfiNum++;
      rfis.push([`RFI-${String(rfiNum).padStart(3,"0")}`, priority, category, type, room, desc, ref, "Open"]);
    };

    // ── Agent E: Extraction gap RFIs ─────────────────────────────────────
    for (const r of roomResults) {
      if ((r.itemCount||0)===0 && r.status==="ok" && r.room!=="Unclassified")
        addRfi("High","Extraction Gap","Missing Scope",r.room,`Room detected but 0 millwork items extracted. Verify casework scope exists for ${r.room}. Check interior elevation sheets for this room.`,(r as any).sheetInfo?.sheetNumber||"No sheet ref");
    }
    for (const row of rows) {
      if (row.item_type==="scope_exclusion")
        addRfi("Medium","Extraction Gap","Scope Exclusion",row.room||"Unclassified",`"${(row.description||"").substring(0,80)}" — Confirm this item is by others / NIC. Verify responsible party.`,row.sheet_ref||"");
    }
    const dimGapRooms: Record<string, string[]> = {};
    for (const r of rows.filter((r:any)=>r.item_type!=="scope_exclusion"&&r.item_type!=="assembly"&&!r.width_mm&&!r.depth_mm&&!r.height_mm)) {
      const room=r.room||"Unclassified";
      if (!dimGapRooms[room]) dimGapRooms[room]=[];
      dimGapRooms[room].push(r.description?.substring(0,40)||r.item_type);
    }
    for (const [room, items] of Object.entries(dimGapRooms))
      addRfi("Medium","Extraction Gap","Missing Dimensions",room,`${items.length} item(s) missing dimensions: ${items.slice(0,3).join("; ")}${items.length>3?` (+${items.length-3} more)`:""}.  Field verify or obtain from detail sheets.`,"");
    const matGapRooms: Record<string, string[]> = {};
    for (const r of rows.filter((r:any)=>r.item_type!=="scope_exclusion"&&r.item_type!=="assembly"&&r.item_type!=="concealed_hinge"&&!r.material_code)) {
      const room=r.room||"Unclassified";
      if (!matGapRooms[room]) matGapRooms[room]=[];
      matGapRooms[room].push(r.description?.substring(0,40)||r.item_type);
    }
    for (const [room, items] of Object.entries(matGapRooms))
      addRfi("Low","Extraction Gap","Missing Material",room,`${items.length} item(s) missing material specification: ${items.slice(0,3).join("; ")}${items.length>3?` (+${items.length-3} more)`:""}.`,"");
    for (const r of roomResults) {
      const si=(r as any).sheetInfo;
      if ((r.itemCount||0)>0 && !si?.sheetNumber)
        addRfi("Low","Extraction Gap","Sheet Reference",r.room,`No sheet number identified for ${r.room}. Provide detail/elevation sheet reference for cross-check.`,"");
    }
    for (const w of warnings) {
      const isUserFlag = w.includes("[FLAGGED FOR RFI]");
      addRfi(isUserFlag?"High":"Info","Extraction Gap",isUserFlag?"User-Flagged Item":(w.match(/\[([^\]]+)\]/)?.[1])||"Extraction Note",isUserFlag?(w.match(/\[([^\]]+)\]/)?.[1])||"":"",(isUserFlag?w.replace(/\[[^\]]+\]\s*/g,""):w.replace(/\[[^\]]+\]\s*/,"")),"");
    }

    // ── Agent F: Constructability RFIs ────────────────────────────────────
    // Simulates plan review a senior Superintendent or PM would conduct
    // before submitting a bid or mobilizing to site.
    //
    // Categories: Structural Attachment | MEP Coordination | ADA/Clearance
    //             Sequencing | Tolerances | Lead Time | Scope Ambiguity | Missing Details

    for (const [room, items] of Object.entries(roomItemMap)) {
      const millItems = items.filter((r:any)=>r.item_type!=="scope_exclusion");

      // ── Structural Attachment ──────────────────────────────────────────
      const upperCabs = millItems.filter((r:any)=>r.item_type==="upper_cabinet");
      const hasSubstrate = millItems.some((r:any)=>r.item_type==="substrate");
      const heavyCountertops = millItems.filter((r:any)=>(r.item_type==="countertop"||r.item_type==="transaction_top") && /granite|stone|quartz|marble|concrete/i.test((r.material||"")+(r.material_code||"")));
      if (upperCabs.length>0 && !hasSubstrate) {
        addRfi("High","Constructability","Structural Attachment",room,
          `${upperCabs.length} upper cabinet(s) specified — no backing/substrate called out. Upper cabs on gypsum board without blocking risk pull-out failure under load. Confirm blocking scope is on GC/framing contract and verify wall type.`,
          upperCabs[0]?.sheet_ref||"");
      }
      if (heavyCountertops.length>0) {
        addRfi("Medium","Constructability","Structural Attachment",room,
          `${heavyCountertops.length} stone/heavy countertop(s) (${heavyCountertops.map((r:any)=>r.material||r.material_code).filter(Boolean).slice(0,2).join(", ")}). Verify cabinet construction can support stone dead load — confirm plywood decking spec, corbel or bracket requirement, and edge support at open runs.`,
          "");
      }

      // ── MEP Coordination ──────────────────────────────────────────────
      const sinkCutouts = millItems.filter((r:any)=>/sink|plumb|faucet/i.test((r.description||"")+(r.notes||"")));
      const elecCutouts = millItems.filter((r:any)=>r.item_type==="equipment_cutout"||r.item_type==="j_box"||r.item_type==="conduit");
      const tallerThan84 = millItems.filter((r:any)=>Number(r.height_mm)>2134); // > 84"
      if (sinkCutouts.length>0)
        addRfi("Medium","Constructability","MEP Coordination",room,
          `${sinkCutouts.length} item(s) reference sink or plumbing cutout. Confirm plumbing rough-in location is on Plumbing drawings and coordinates with cabinet centerline shown on millwork sheet. Obtain plumber's rough-in sheet before fabrication.`,
          "");
      if (elecCutouts.length>0)
        addRfi("Medium","Constructability","MEP Coordination",room,
          `${elecCutouts.length} electrical cutout/conduit item(s) in millwork scope. Confirm outlet locations, low-voltage penetrations, and in-cabinet power requirements are coordinated with Electrical drawings. Power strips or grommet locations need field dimension confirmation.`,
          "");
      if (tallerThan84.length>0)
        addRfi("Low","Constructability","MEP Coordination",room,
          `${tallerThan84.length} tall unit(s) over 84" height. Verify ceiling height, soffit location, HVAC diffuser and sprinkler head clearance for units in ${room}. Confirm GC ceiling rough-in does not conflict with tall cabinet top.`,
          "");

      // ── ADA / Clearance ───────────────────────────────────────────────
      if (/vanit|restroom|toilet|ada/i.test(room)) {
        const cabs34 = millItems.filter((r:any)=>Number(r.height_mm)>864&&/cabinet/i.test(r.item_type||""));
        if (cabs34.length>0)
          addRfi("High","Constructability","ADA / Clearance",room,
            `ADA-sensitive room: ${cabs34.length} cabinet(s) may exceed accessible counter height (34" max per ADA 902). Verify counter height for accessible reach range. Confirm knee clearance 27" min height × 30" wide × 19" deep under any accessible counter.`,
            "");
      }
      const deepCabs = millItems.filter((r:any)=>Number(r.depth_mm)>762); // > 30"
      if (deepCabs.length>0)
        addRfi("Low","Constructability","ADA / Clearance",room,
          `${deepCabs.length} item(s) exceed 30" depth (${deepCabs.map((r:any)=>r.description?.substring(0,25)).slice(0,2).join("; ")}). Verify depth does not conflict with door swing, aisle clearance (36" min per code), or egress path. Obtain reflected ceiling plan for door swing confirmation.`,
          "");

      // ── Tolerances & Field Conditions ─────────────────────────────────
      const floorToCeiling = millItems.filter((r:any)=>Number(r.height_mm)>2591&&r.item_type!=="assembly"); // > 102"
      const longRuns = millItems.filter((r:any)=>Number(r.width_mm)>3658); // single piece > 12ft
      if (floorToCeiling.length>0)
        addRfi("Medium","Constructability","Tolerances",room,
          `${floorToCeiling.length} floor-to-ceiling unit(s). No scribe allowance noted in extracted scope. Confirm scribe/filler width at each wall return, ceiling variation tolerance, and installation sequence (unit installed before or after ceiling finish?).`,
          "");
      if (longRuns.length>0)
        addRfi("Medium","Constructability","Tolerances",room,
          `${longRuns.length} item(s) over 12ft single-piece width. Verify transport access (elevator, door openings, corridor width). May require field-spliced construction — confirm splice location and method.`,
          "");
      const itemsNoDims = millItems.filter((r:any)=>r.item_type!=="assembly"&&!r.width_mm&&!r.depth_mm&&!r.height_mm);
      if (itemsNoDims.length>2)
        addRfi("Medium","Constructability","Tolerances",room,
          `${itemsNoDims.length} items have no dimensions. Cannot fabricate to spec without field dimensions. Assign a field measure before release to shop — do not assume from similar rooms.`,
          "");

      // ── Lead Time Flags ───────────────────────────────────────────────
      const longLeadMaterials = millItems.filter((r:any)=>{
        const mat=((r.material||"")+(r.material_code||"")).toLowerCase();
        return /3form|chroma|laminart|formica.*(special|custom)|vitricor|caesar|neolith|dekton|3\s*cm\s*(marble|quartzite)/i.test(mat) ||
               /specialty|custom.*laminate|custom.*panel|custom.*veneer/i.test(r.description||"");
      });
      if (longLeadMaterials.length>0)
        addRfi("High","Constructability","Lead Time",room,
          `${longLeadMaterials.length} item(s) with potential long-lead materials (${longLeadMaterials.map((r:any)=>r.material||r.material_code).filter(Boolean).slice(0,3).join(", ")}). Specialty surfaces typically 6–14 weeks. Submit material orders concurrent with permit, not after approval.`,
          "");
      const customFab = millItems.filter((r:any)=>/custom|special.order|made.to.order|bespoke/i.test(r.description||""));
      if (customFab.length>0)
        addRfi("Medium","Constructability","Lead Time",room,
          `${customFab.length} custom-fabricated item(s) flagged. Confirm shop drawing submittal and approval lead time is included in schedule. Do not start fabrication without approved submittals.`,
          "");

      // ── Scope Ambiguity ───────────────────────────────────────────────
      const installOnlyFlags = millItems.filter((r:any)=>/install\s*only|io\b|f\.?i\.?o/i.test(r.description||""));
      if (installOnlyFlags.length>0)
        addRfi("High","Constructability","Scope Ambiguity",room,
          `${installOnlyFlags.length} item(s) labeled "install only" or "FIO". Confirm: (1) who furnishes the product, (2) delivery coordination responsibility, (3) warranty — installer vs. manufacturer. Get written confirmation from GC before bid.`,
          "");
      const demolition = millItems.filter((r:any)=>/demo|remove|replace|existing/i.test(r.description||""));
      if (demolition.length>0)
        addRfi("Medium","Constructability","Scope Ambiguity",room,
          `${demolition.length} item(s) reference demo, removal, or existing conditions. Confirm demo scope is in millwork contract vs. GC. Confirm existing wall/ceiling conditions will be acceptable before new work. Obtain existing condition photos or field survey.`,
          "");

      // ── Missing Details ────────────────────────────────────────────────
      const hasItems = millItems.filter((r:any)=>r.item_type!=="assembly").length>0;
      const hasAnySheet = millItems.some((r:any)=>r.sheet_ref);
      if (hasItems && !hasAnySheet && millItems.length>3)
        addRfi("Medium","Constructability","Missing Details",room,
          `${millItems.length} items extracted but no detail/elevation sheet reference found. Cannot verify shop fabrication against design intent without interior elevation sheets. Request sheet reference from architect.`,
          "");
      const countertopNoEdge = millItems.filter((r:any)=>(r.item_type==="countertop"||r.item_type==="transaction_top")&&!/edge|profile|bullnose|eased|bevel|waterfall/i.test((r.description||"")+(r.notes||"")));
      if (countertopNoEdge.length>0)
        addRfi("Low","Constructability","Missing Details",room,
          `${countertopNoEdge.length} countertop(s) with no edge profile specified. Edge detail affects fabrication time, cost, and appearance. Confirm with architect: eased, beveled, ogee, waterfall, or custom profile before fabrication.`,
          "");
    }

    const wsRfi = XLSX.utils.aoa_to_sheet(rfis);
    wsRfi["!cols"] = [{wch:10},{wch:8},{wch:22},{wch:22},{wch:25},{wch:75},{wch:12},{wch:8}];
    XLSX.utils.book_append_sheet(wb, wsRfi, "RFIs");

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
    setFiles([]); setStatus("idle"); setProgress(""); setError("");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null); setStats(null);
    setReviewRows([]); setReviewRoomResults([]);
    setReviewWarnings([]); setReviewProjectContext(null);
    setReviewStats(null); setReviewProjectName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Review screen computed values ───────────────────────────────────────
  const activeReviewRows = reviewRows.filter(r => !r._deleted);
  const filteredRows = activeReviewRows.filter(r => {
    if (reviewFilter === "low") return r.confidence === "low" || r.confidence === "";
    if (reviewFilter === "flagged") return r._flagForRfi;
    return true;
  });
  const deletedCount = reviewRows.filter(r => r._deleted).length;
  const flaggedCount = reviewRows.filter(r => r._flagForRfi && !r._deleted).length;
  const lowConfCount = activeReviewRows.filter(r => r.confidence === "low" || r.confidence === "").length;
  const groupedByRoom = filteredRows.reduce((acc: Record<string, ReviewRow[]>, r) => {
    if (!acc[r.room]) acc[r.room] = [];
    acc[r.room].push(r);
    return acc;
  }, {});

  const confidenceColor = (conf: string) => {
    if (conf === "high") return "#22c55e";
    if (conf === "medium") return "#f59e0b";
    return "#ef4444";
  };
  const confidenceBg = (conf: string) => {
    if (conf === "high") return "rgba(34,197,94,0.08)";
    if (conf === "medium") return "rgba(245,158,11,0.08)";
    return "rgba(239,68,68,0.10)";
  };

  // ─── Styles ───────────────────────────────────────────────────────────────
  const S = {
    main: { minHeight:"100vh", background:"linear-gradient(168deg,#0a0e1a 0%,#0f1729 40%,#111d2e 100%)", color:"#e2e8f0", fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace" } as React.CSSProperties,
    input: { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:5, color:"#e2e8f0", padding:"4px 7px", fontSize:12, fontFamily:"inherit", width:"100%" } as React.CSSProperties,
    select: { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:5, color:"#e2e8f0", padding:"4px 7px", fontSize:12, fontFamily:"inherit", cursor:"pointer" } as React.CSSProperties,
  };

  return (
    <main style={S.main}>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        onLoad={() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; setPdfReady(true); }} />

      <nav style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 40px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, background:"linear-gradient(135deg,#22d3ee,#6366f1)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#0a0e1a" }}>P</div>
          <span style={{ fontWeight:700, fontSize:16 }}>ProjMgtAI</span>
        </div>
        <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, opacity:0.7 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }} />v14.9.0 Live
        </span>
      </nav>

      {/* ── IDLE / UPLOAD ───────────────────────────────────────────────────── */}
      {status === "idle" && (
        <>
          <section style={{ textAlign:"center", padding:"80px 20px 60px" }}>
            <div style={{ display:"inline-block", padding:"6px 16px", border:"1px solid rgba(34,211,238,0.3)", borderRadius:20, fontSize:12, color:"#22d3ee", marginBottom:24 }}>
              ★ v14.9.0 — Feedback UI + Constructability RFI Agent
            </div>
            <h1 style={{ fontSize:"clamp(32px,5vw,56px)", fontWeight:800, lineHeight:1.1, margin:"0 0 20px", fontFamily:"'Inter','Helvetica Neue',sans-serif" }}>
              Full project takeoff,<br/>
              <span style={{ background:"linear-gradient(135deg,#22d3ee,#6366f1,#a855f7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>every room, one upload.</span>
            </h1>
            <p style={{ fontSize:15, maxWidth:520, margin:"0 auto 36px", lineHeight:1.6, opacity:0.7 }}>
              Upload plans, specs, and addenda. AI extracts every room — then you review and correct before the Excel goes out.
            </p>
          </section>

          <section id="try" style={{ padding:"0 40px 100px", textAlign:"center" }}>
            <div style={{ maxWidth:560, margin:"0 auto", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:32 }}>
              <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
                style={{ border:"2px dashed rgba(34,211,238,0.3)", borderRadius:12, padding:"48px 24px", cursor:"pointer", marginBottom: files.length ? 16 : 0 }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📎</div>
                <div style={{ fontSize:14, color:"#22d3ee", fontWeight:600 }}>Drop PDFs here <span style={{ opacity:0.5, color:"#e2e8f0", fontWeight:400 }}>or click to browse</span></div>
                <div style={{ fontSize:12, opacity:0.4, marginTop:8 }}>Plans, specs, addenda — upload multiple files</div>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleFileSelect} style={{ display:"none" }} />
              {files.length > 0 && (
                <div style={{ marginTop:16 }}>
                  {files.map((entry, idx) => (
                    <div key={idx} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"rgba(34,211,238,0.06)", borderRadius:8, marginBottom:6, fontSize:13 }}>
                      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📄 {entry.file.name} <span style={{ opacity:0.4 }}>({(entry.file.size/1024).toFixed(0)}KB)</span></span>
                      <select value={entry.type} onChange={e => changeFileType(idx, e.target.value as FileEntry["type"])} style={S.select}>
                        <option value="plans">Plans</option>
                        <option value="specs">Specs</option>
                        <option value="addenda">Addenda</option>
                        <option value="shop_drawings">Shop Drawings</option>
                      </select>
                      <button onClick={() => removeFile(idx)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:13, padding:"2px 6px" }}>✕</button>
                    </div>
                  ))}
                  <div style={{ fontSize:12, opacity:0.4, marginTop:8, marginBottom:12 }}>
                    {files.length} file(s) · {(files.reduce((s, f) => s + f.file.size, 0) / (1024*1024)).toFixed(1)}MB total
                  </div>
                  <button onClick={handleExtract} disabled={!pdfReady}
                    style={{ width:"100%", padding:"14px", background: pdfReady ? "linear-gradient(135deg,#22d3ee,#6366f1)" : "rgba(255,255,255,0.1)", color:"#0a0e1a", border:"none", borderRadius:8, fontWeight:700, fontSize:15, cursor: pdfReady?"pointer":"wait", fontFamily:"inherit" }}>
                    {pdfReady ? `Extract All Rooms (${files.length} file${files.length > 1 ? "s" : ""}) →` : "Loading PDF engine..."}
                  </button>
                </div>
              )}
              {error && <div style={{ color:"#ef4444", fontSize:13, marginTop:12 }}>{error}</div>}
            </div>
          </section>
        </>
      )}

      {/* ── LOADING STATES ──────────────────────────────────────────────────── */}
      {(status === "reading" || status === "analyzing" || status === "extracting" || status === "building") && (
        <section style={{ padding:"120px 40px", textAlign:"center" }}>
          <div style={{ width:48, height:48, border:"3px solid rgba(34,211,238,0.2)", borderTop:"3px solid #22d3ee", borderRadius:"50%", margin:"0 auto 20px", animation:"spin 1s linear infinite" }} />
          <div style={{ fontSize:14, fontWeight:600, maxWidth:460, margin:"0 auto" }}>{progress}</div>
          <div style={{ fontSize:12, opacity:0.4, marginTop:8 }}>
            {status === "reading" && "Reading PDF pages..."}
            {status === "analyzing" && "Detecting rooms and material legend..."}
            {status === "extracting" && "Extracting millwork items room by room..."}
            {status === "building" && "Building Excel workbook with all agents..."}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section>
      )}

      {/* ── REVIEW ──────────────────────────────────────────────────────────── */}
      {status === "review" && (
        <section style={{ padding:"40px", maxWidth:1200, margin:"0 auto" }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:16 }}>
            <div>
              <div style={{ fontSize:11, color:"#22d3ee", letterSpacing:2, marginBottom:6 }}>STEP 2 OF 3 — REVIEW</div>
              <h2 style={{ margin:0, fontSize:22, fontWeight:700, fontFamily:"'Inter',sans-serif" }}>Review Extracted Items</h2>
              <div style={{ fontSize:13, opacity:0.5, marginTop:4 }}>
                {activeReviewRows.length} items · {Object.keys(groupedByRoom).length} rooms visible
                {deletedCount > 0 && ` · ${deletedCount} deleted`}
                {flaggedCount > 0 && ` · ${flaggedCount} flagged for RFI`}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              {/* Filter tabs */}
              <div style={{ display:"flex", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, overflow:"hidden" }}>
                {(["all","low","flagged"] as const).map(f => (
                  <button key={f} onClick={() => setReviewFilter(f)}
                    style={{ padding:"7px 14px", border:"none", background: reviewFilter===f ? "rgba(34,211,238,0.15)" : "transparent", color: reviewFilter===f ? "#22d3ee" : "#e2e8f0", fontSize:12, cursor:"pointer", fontFamily:"inherit", borderRight: f!=="flagged" ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                    {f === "all" && `All (${activeReviewRows.length})`}
                    {f === "low" && `Low conf (${lowConfCount})`}
                    {f === "flagged" && `Flagged (${flaggedCount})`}
                  </button>
                ))}
              </div>
              <button onClick={handleApproveAndDownload}
                style={{ padding:"10px 22px", background:"linear-gradient(135deg,#22c55e,#16a34a)", border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                ✓ Approve & Download Excel →
              </button>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display:"flex", gap:16, marginBottom:20, fontSize:11, opacity:0.6, flexWrap:"wrap" }}>
            <span>● <span style={{ color:"#22c55e" }}>High confidence</span></span>
            <span>● <span style={{ color:"#f59e0b" }}>Medium confidence</span></span>
            <span>● <span style={{ color:"#ef4444" }}>Low / unset</span></span>
            <span style={{ opacity:0.4 }}>|</span>
            <span>🚩 = flagged for RFI &nbsp; ✕ = delete row</span>
            <span style={{ opacity:0.4 }}>|</span>
            <span>Click any field to edit</span>
          </div>

          {/* Table */}
          {Object.entries(groupedByRoom).map(([room, roomRows]) => (
            <div key={room} style={{ marginBottom:28 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#22d3ee", letterSpacing:0.5 }}>{room.toUpperCase()}</div>
                <div style={{ fontSize:11, opacity:0.4 }}>{roomRows.length} item{roomRows.length!==1?"s":""}</div>
                <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.07)" }} />
              </div>

              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                      {["#","Type","Description","Confidence","Sheet","Actions"].map(h => (
                        <th key={h} style={{ padding:"6px 8px", textAlign:"left", opacity:0.45, fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roomRows.map((r, idx) => (
                      <tr key={r._id}
                        style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", background: r._flagForRfi ? "rgba(239,68,68,0.06)" : confidenceBg(r.confidence) }}>
                        <td style={{ padding:"6px 8px", opacity:0.4, whiteSpace:"nowrap" }}>{idx+1}</td>

                        {/* Type */}
                        <td style={{ padding:"4px 6px", minWidth:140 }}>
                          <select value={r.item_type} onChange={e => updateReviewRow(r._id, "item_type", e.target.value)}
                            style={{ ...S.select, width:"100%" }}>
                            {VALID_ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>

                        {/* Description */}
                        <td style={{ padding:"4px 6px", minWidth:260 }}>
                          <input value={r.description} onChange={e => updateReviewRow(r._id, "description", e.target.value)}
                            style={{ ...S.input }} />
                        </td>

                        {/* Confidence */}
                        <td style={{ padding:"4px 6px" }}>
                          <select value={r.confidence||""} onChange={e => updateReviewRow(r._id, "confidence", e.target.value)}
                            style={{ ...S.select, color: confidenceColor(r.confidence) }}>
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                            <option value="">—</option>
                          </select>
                        </td>

                        {/* Sheet ref (read-only hint) */}
                        <td style={{ padding:"6px 8px", opacity:0.4, fontSize:11, whiteSpace:"nowrap" }}>
                          {r.sheet_ref || "—"}
                        </td>

                        {/* Actions */}
                        <td style={{ padding:"4px 8px", whiteSpace:"nowrap" }}>
                          <button onClick={() => toggleFlag(r._id)}
                            title={r._flagForRfi ? "Remove RFI flag" : "Flag for RFI"}
                            style={{ background: r._flagForRfi ? "rgba(239,68,68,0.2)" : "transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:4, color: r._flagForRfi ? "#ef4444" : "#e2e8f0", padding:"3px 8px", cursor:"pointer", fontSize:12, marginRight:4 }}>
                            🚩
                          </button>
                          <button onClick={() => deleteReviewRow(r._id)}
                            title="Delete this item"
                            style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:4, color:"#ef4444", padding:"3px 8px", cursor:"pointer", fontSize:12 }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Deleted items restore */}
          {deletedCount > 0 && (
            <div style={{ marginTop:16, padding:"14px 20px", background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, fontSize:13 }}>
              <span style={{ opacity:0.7 }}>{deletedCount} item{deletedCount!==1?"s":""} deleted. </span>
              {reviewRows.filter(r => r._deleted).slice(0,3).map(r => (
                <button key={r._id} onClick={() => undoDelete(r._id)}
                  style={{ background:"none", border:"none", color:"#22d3ee", cursor:"pointer", fontSize:12, marginLeft:8, textDecoration:"underline", fontFamily:"inherit" }}>
                  Restore "{r.description.substring(0,30)}"
                </button>
              ))}
            </div>
          )}

          {/* Bottom action bar */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:32, paddingTop:24, borderTop:"1px solid rgba(255,255,255,0.07)", flexWrap:"wrap", gap:12 }}>
            <button onClick={reset}
              style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", color:"#e2e8f0", padding:"10px 20px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              ← Start Over
            </button>
            <div style={{ display:"flex", gap:12, alignItems:"center" }}>
              <div style={{ fontSize:12, opacity:0.5 }}>
                {activeReviewRows.length} items · {flaggedCount} flagged · {deletedCount} removed
              </div>
              <button onClick={handleApproveAndDownload}
                style={{ padding:"12px 28px", background:"linear-gradient(135deg,#22c55e,#16a34a)", border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
                ✓ Approve & Download Excel →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── DONE ────────────────────────────────────────────────────────────── */}
      {status === "done" && resultUrl && (
        <section style={{ padding:"120px 40px", textAlign:"center" }}>
          <div style={{ maxWidth:500, margin:"0 auto", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:40 }}>
            <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Extraction Complete</div>
            {stats && (
              <div style={{ fontSize:12, opacity:0.6, marginBottom:20, lineHeight:1.8 }}>
                {stats.fileCount > 1 && `${stats.fileCount} files · `}{stats.pageCount} pages · {stats.roomCount} rooms · {stats.totalItems} items · {stats.withDimensions} with dims
                {stats.materialLegendCount > 0 && ` · ${stats.materialLegendCount} materials resolved`}
              </div>
            )}
            <a href={resultUrl} download={`shop_order_v1490_${(files[0]?.file?.name || "project").replace(".pdf","")}.xlsx`}
              style={{ display:"inline-block", padding:"14px 32px", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", borderRadius:8, fontWeight:700, fontSize:14, textDecoration:"none", marginBottom:12 }}>
              ⬇ Download Excel
            </a><br/>
            <button onClick={reset} style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", color:"#e2e8f0", padding:"10px 24px", borderRadius:8, fontSize:13, cursor:"pointer", marginTop:8, fontFamily:"inherit" }}>Extract Another</button>
          </div>
        </section>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────────── */}
      {status === "error" && (
        <section style={{ padding:"120px 40px", textAlign:"center" }}>
          <div style={{ maxWidth:460, margin:"0 auto" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>❌</div>
            <div style={{ fontSize:14, fontWeight:600, color:"#ef4444", marginBottom:8 }}>{error}</div>
            <button onClick={reset} style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", color:"#e2e8f0", padding:"10px 24px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Try Again</button>
          </div>
        </section>
      )}

      <footer style={{ textAlign:"center", padding:"40px 20px", borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:12, opacity:0.4 }}>
        © 2026 ProjMgtAI — Construction Intelligence, not guesswork.
      </footer>
    </main>
  );
}
