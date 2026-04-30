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
import { parseFinishSchedule, buildFinishScheduleItems } from "./finish-schedule-parser";

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
  // v14.9.39: Lead email from homepage capture — drives PDF upload to Blob
  const [leadEmail, setLeadEmail] = useState<string>("");
  const pdfBuffers = useRef<{name: string; buffer: ArrayBuffer}[]>([]);

  // v14.9.36: Post-download feedback capture
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent">("idle");
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  // v14.9.39: Read lead email from sessionStorage on mount
  const { useEffect } = require("react");
  const didReadEmail = useRef(false);
  if (!didReadEmail.current && typeof window !== "undefined") {
    didReadEmail.current = true;
    try {
      const stored = sessionStorage.getItem("projmgtai_email");
      if (stored) setLeadEmail(stored);
    } catch (_) {}
  }

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
    // v14.9.39: Store buffer for later Blob upload
    pdfBuffers.current = [...(pdfBuffers.current || []), { name: pdfFile.name, buffer: buf }];
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

      // v14.9.40: Finish-schedule parser — extract structured millwork from FS pages
      // Non-fatal: if this throws, room-by-room extraction continues as before.
      try {
        const fsResult = parseFinishSchedule(pdfText);
        if (fsResult.rooms.length > 0) {
          const fsItems = buildFinishScheduleItems(fsResult);
          console.log(
            `[v14.9.40] Finish schedule: ${fsResult.rooms.length} rooms parsed, ` +
            `${fsItems.length} items from ${fsResult.schedulePages.length} FS pages ` +
            `+ ${fsResult.legend.length} legend entries`
          );
          projectContext.finishScheduleItems = fsItems;
          projectContext.finishScheduleLegend = fsResult.legend;
          projectContext.finishSchedulePages = fsResult.schedulePages;
        } else {
          console.log("[v14.9.40] Finish schedule: no FS pages detected");
        }
      } catch (fsErr) {
        console.warn("[v14.9.40] Finish schedule parser failed, continuing without it:", fsErr);
      }

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

      let finalStats = {
        pageCount, roomCount: rooms.length, totalItems: allRows.length,
        withDimensions: allRows.filter((r: any) => r.width_mm || r.length_mm || r.height_mm).length,
        withMaterials: allRows.filter((r: any) => r.material_code || r.material).length,
        materialLegendCount: projectContext.materialLegend?.length || 0,
        documentType: projectContext.documentType || "unknown",
        roomResults,
      };
      setStats(finalStats);

      // v14.9.40: Merge finish-schedule-parser items into allRows
      // Dedupe: if an LLM-extracted item already covers (room, material_code), skip the FS item.
      const fsItemsToMerge = projectContext.finishScheduleItems || [];
      if (fsItemsToMerge.length > 0) {
        let merged = 0;
        for (const fsItem of fsItemsToMerge) {
          const duplicate = allRows.find((r: any) =>
            r.room === fsItem.room && r.material_code === fsItem.material_code
          );
          if (!duplicate) {
            allRows.push(fsItem);
            merged++;
          }
        }
        console.log(`[v14.9.40] Merged ${merged} finish-schedule items into allRows (total: ${allRows.length})`);
      }

      // [v14.9.41] stats post-merge: recompute counts AFTER FS items merged into allRows
      // so the UI badge reflects total scope (LLM + finish-schedule), not just LLM.
      const mergedRoomCount = new Set(
        allRows.map((r: any) => r.room).filter((r: any) => r && String(r).trim().length > 0)
      ).size;
      finalStats = {
        ...finalStats,
        roomCount: Math.max(finalStats.roomCount, mergedRoomCount),
        totalItems: allRows.length,
        withDimensions: allRows.filter((r: any) => r.width_mm || r.length_mm || r.height_mm).length,
        withMaterials: allRows.filter((r: any) => r.material_code || r.material).length,
      };
      setStats(finalStats);

      const blob = await buildExcel(allRows, roomResults, allWarnings, projectContext, finalStats, file.name);
      setResultUrl(URL.createObjectURL(blob));
      setStatus("done"); setProgress("");

      // v14.9.39: Upload PDFs to Blob + log extraction (only for lead-capture users)
      if (leadEmail && pdfBuffers.current.length > 0) {
        uploadAndLog(leadEmail, pdfBuffers.current, finalStats).catch(e =>
          console.warn("[v14.9.39] upload/log failed:", e)
        );
      }
    } catch (err: any) {
      setStatus("error"); setError(err.message || "Something went wrong"); setProgress("");
    }
  };

  // v14.9.39: Upload PDFs to Vercel Blob + log to Supabase
  // Only called for lead-capture users (has email from sessionStorage)
  async function uploadAndLog(
    email: string,
    buffers: {name: string; buffer: ArrayBuffer}[],
    stats: any
  ) {
    const blobUrls: {url: string; filename: string; size_kb: number}[] = [];

    for (const { name, buffer } of buffers) {
      try {
        // Get upload token from our API
        const tokenRes = await fetch("/api/blob-upload-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: {
              pathname: `extractions/${Date.now()}_${name}`,
              callbackUrl: `${window.location.origin}/api/blob-upload-token`,
              multipart: false,
            },
          }),
        });

        if (!tokenRes.ok) {
          console.warn("[v14.9.39] token fetch failed for", name);
          continue;
        }

        const { clientToken } = await tokenRes.json();
        if (!clientToken) continue;

        // PUT directly to Vercel Blob
        const putRes = await fetch(
          `https://blob.vercel-storage.com/extractions/${Date.now()}_${encodeURIComponent(name)}`,
          {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${clientToken}`,
              "Content-Type": "application/pdf",
              "x-content-type": "application/pdf",
            },
            body: buffer,
          }
        );

        if (putRes.ok) {
          const { url } = await putRes.json();
          blobUrls.push({ url, filename: name, size_kb: Math.round(buffer.byteLength / 1024) });
          console.log("[v14.9.39] uploaded:", name, "->", url);
        }
      } catch (e) {
        console.warn("[v14.9.39] blob upload failed for", name, e);
      }
    }

    // Log to Supabase regardless of whether blob upload succeeded
    try {
      await fetch("/api/log-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: email,
          project_name: stats?.roomResults?.[0]?.room || "unknown",
          room_count: stats?.roomCount || 0,
          item_count: stats?.totalItems || 0,
          page_count: stats?.pageCount || 0,
          blob_urls: blobUrls,
        }),
      });
      console.log("[v14.9.39] extraction logged for", email);
    } catch (e) {
      console.warn("[v14.9.39] log-extraction failed:", e);
    }
  }

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

    // v14.10.1: WBS Summary tab (Agent C — restored from v14.8.1)
    {
      const TRADE_MAP: Array<{ wbs: number; name: string; types: string[] }> = [
        { wbs: 1,  name: "Cabinetry",            types: ["base_cabinet","upper_cabinet","tall_cabinet","controls_cabinet","safe_cabinet"] },
        { wbs: 2,  name: "Countertops",          types: ["countertop","transaction_top"] },
        { wbs: 3,  name: "Shelving",             types: ["adjustable_shelf","fixed_shelf","cpu_shelf"] },
        { wbs: 4,  name: "Drawers",              types: ["drawer","file_drawer","trash_drawer","rollout_basket"] },
        { wbs: 5,  name: "Panels & Substrates",  types: ["decorative_panel","substrate","end_panel","stainless_panel"] },
        { wbs: 6,  name: "Trim & Molding",       types: ["trim","channel","rubber_base","corner_guard","corner_detail"] },
        { wbs: 7,  name: "Hardware",             types: ["concealed_hinge","piano_hinge","grommet","hanger_support"] },
        { wbs: 8,  name: "Cutouts & Electrical", types: ["equipment_cutout","conduit","j_box"] },
        { wbs: 9,  name: "Specialty",            types: ["trellis","ada_fascia","wall_cap"] },
        { wbs: 10, name: "Assemblies",           types: ["assembly"] },
        { wbs: 11, name: "Exclusions",           types: ["scope_exclusion"] },
      ];
      const tradeOf = (itype: string): { wbs: number; name: string } => {
        for (const t of TRADE_MAP) if (t.types.includes(itype)) return { wbs: t.wbs, name: t.name };
        return { wbs: 99, name: "Unclassified" };
      };

      // Group rows by trade, then by room within trade
      const byTrade: Record<number, { name: string; byRoom: Record<string, any[]> }> = {};
      for (const r of rows) {
        const t = tradeOf(r.item_type || "");
        if (!byTrade[t.wbs]) byTrade[t.wbs] = { name: t.name, byRoom: {} };
        const room = r.room || "Unclassified";
        if (!byTrade[t.wbs].byRoom[room]) byTrade[t.wbs].byRoom[room] = [];
        byTrade[t.wbs].byRoom[room].push(r);
      }

      const wbsHdrs = ["WBS #", "Level", "Trade / Component", "Room", "Qty", "Unit", "Total W (ft-in)", "Material", "Notes"];
      const wbsData: any[][] = [wbsHdrs];
      const sortedTradeKeys = Object.keys(byTrade).map(Number).sort((a, b) => a - b);
      let totalQty = 0;
      let totalMillwork = 0;
      let totalExclusions = 0;

      for (const tWbs of sortedTradeKeys) {
        const trade = byTrade[tWbs];
        const allRoomsInTrade = Object.keys(trade.byRoom);
        // Trade header row: aggregate qty across all rooms in trade
        let tradeQty = 0;
        const tradeMaterials = new Set<string>();
        for (const room of allRoomsInTrade) {
          for (const item of trade.byRoom[room]) {
            tradeQty += Number(item.qty) || 1;
            if (item.material_code) tradeMaterials.add(String(item.material_code));
          }
        }
        wbsData.push([
          String(tWbs),
          "Trade",
          trade.name,
          "",
          tradeQty,
          "",
          "",
          Array.from(tradeMaterials).slice(0, 6).join(", "),
          `${allRoomsInTrade.length} room(s)`,
        ]);
        totalQty += tradeQty;
        if (tWbs === 11) totalExclusions += tradeQty;
        else totalMillwork += tradeQty;

        // Room sub-rows under this trade
        const sortedRooms = allRoomsInTrade.sort();
        sortedRooms.forEach((room, idx) => {
          const items = trade.byRoom[room];
          let roomQty = 0;
          let roomTotalW = 0;
          const roomMaterials = new Set<string>();
          const roomTypes: string[] = [];
          for (const item of items) {
            roomQty += Number(item.qty) || 1;
            if (item.width_mm && Number(item.width_mm) > 0) roomTotalW += Number(item.width_mm) * (Number(item.qty) || 1);
            if (item.material_code) roomMaterials.add(String(item.material_code));
            roomTypes.push(item.item_type || "");
          }
          const wlbl = `${tWbs}.${idx + 1}`;
          wbsData.push([
            wlbl,
            "Room",
            `${items.length} ${trade.name.toLowerCase()} item(s)`,
            room,
            roomQty,
            "EA",
            mmToFtIn(roomTotalW),
            Array.from(roomMaterials).slice(0, 6).join(", "),
            roomTypes.slice(0, 12).join(", "),
          ]);
        });
      }

      // Footer total
      wbsData.push(["", "", "", "", "", "", "", "", ""]);
      wbsData.push(["", "", "TOTAL", "", totalQty, "", "", "", `${totalMillwork} millwork + ${totalExclusions} exclusions`]);

      const wsWbs = XLSX.utils.aoa_to_sheet(wbsData);
      wsWbs["!cols"] = [
        { wch: 8 }, { wch: 8 }, { wch: 26 }, { wch: 24 },
        { wch: 6 }, { wch: 6 }, { wch: 16 }, { wch: 22 }, { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(wb, wsWbs, "WBS Summary");
    }

    // v14.10.2: Bid Checklist tab (Agent D — restored from v14.8.1)
    {
      const CABINET_TYPES = new Set([
        "base_cabinet","upper_cabinet","tall_cabinet","controls_cabinet","safe_cabinet"
      ]);
      const HARDWARE_TYPES = new Set([
        "concealed_hinge","piano_hinge","grommet","hanger_support"
      ]);
      const ADA_ROOM_RE = /vanity|restroom|reception|toilet|ada/i;

      // Group rows by room
      const byRoom: Record<string, any[]> = {};
      for (const r of rows) {
        const room = r.room || "Unclassified";
        if (!byRoom[room]) byRoom[room] = [];
        byRoom[room].push(r);
      }

      const bcHdrs = ["#", "Room", "Category", "Check Item", "Status", "Found", "Notes"];
      const bcData: any[][] = [bcHdrs];
      let bcIdx = 1;

      const sortedRooms = Object.keys(byRoom).sort();
      for (const room of sortedRooms) {
        const items = byRoom[room];
        if (items.length === 0) continue;

        const cabinets = items.filter((i: any) => CABINET_TYPES.has(i.item_type));
        const hardware = items.filter((i: any) => HARDWARE_TYPES.has(i.item_type));
        const substrate = items.filter((i: any) => i.item_type === "substrate");
        const exclusions = items.filter((i: any) => i.item_type === "scope_exclusion");
        const millwork = items.filter((i: any) => i.item_type !== "scope_exclusion");
        const isAdaRoom = ADA_ROOM_RE.test(room);

        // ── Blocking ──
        if (cabinets.length > 0) {
          if (substrate.length > 0) {
            bcData.push([bcIdx++, room, "Blocking", "Plywood substrate/blocking", "OK", "Yes", ""]);
          } else {
            bcData.push([bcIdx++, room, "Blocking", "Plywood substrate/blocking for cabinet mounting", "VERIFY", "Not found", "Cabinets present — confirm blocking scope"]);
          }
        }

        // ── Hardware ──
        if (cabinets.length > 0) {
          const status = hardware.length === 0 ? "MISSING" : (hardware.length >= cabinets.length ? "OK" : "VERIFY");
          const found = hardware.length === 0 ? "Not found" : `${hardware.length} item(s)`;
          const notes = hardware.length === 0
            ? `${cabinets.length} cabinet(s) — no hardware specified`
            : "";
          bcData.push([bcIdx++, room, "Hardware", "Cabinet hardware (hinges, pulls, locks)", status, found, notes]);
        }

        // ── Finish (material specs) ──
        if (millwork.length > 0) {
          const withMat = millwork.filter((i: any) => i.material_code || i.material).length;
          const pct = millwork.length > 0 ? Math.round((withMat / millwork.length) * 100) : 0;
          const status = pct === 100 ? "OK" : "VERIFY";
          const missingTypes = millwork
            .filter((i: any) => !i.material_code && !i.material)
            .slice(0, 2)
            .map((i: any) => i.item_type || "unknown");
          if (pct < 100) {
            bcData.push([bcIdx++, room, "Finish", `Material specs (${pct}% complete)`, status, `${withMat}/${millwork.length} items`, missingTypes.length ? `Missing: ${missingTypes.join(", ")}` : ""]);
          }
        }

        // ── Dimensions ──
        if (millwork.length > 0) {
          const withDims = millwork.filter((i: any) => 
            (i.width_mm && Number(i.width_mm) > 0) || 
            (i.height_mm && Number(i.height_mm) > 0)
          ).length;
          const pct = millwork.length > 0 ? Math.round((withDims / millwork.length) * 100) : 0;
          const status = pct >= 75 ? "OK" : "VERIFY";
          const notes = pct < 75 ? "Field verify critical dimensions before fabrication" : "";
          bcData.push([bcIdx++, room, "Dimensions", `Field dimensions (${pct}% complete)`, status, `${withDims}/${millwork.length} items`, notes]);
        }

        // ── ADA (only ADA rooms) ──
        if (isAdaRoom) {
          const adaItems = items.filter((i: any) => i.item_type === "ada_fascia" || i.item_type === "wall_cap");
          if (adaItems.length === 0) {
            bcData.push([bcIdx++, room, "ADA", "ADA fascia / wall cap items", "VERIFY", "Not found", "ADA-classified room — verify accessibility millwork scope"]);
          } else {
            bcData.push([bcIdx++, room, "ADA", "ADA fascia / wall cap items", "OK", `${adaItems.length} item(s)`, ""]);
          }
        }

        // ── Exclusions ──
        if (exclusions.length > 0) {
          const exDescs = exclusions
            .map((e: any) => String(e.description || "").substring(0, 60))
            .filter((s: string) => s.length > 0)
            .slice(0, 3)
            .join("; ");
          bcData.push([bcIdx++, room, "Exclusions", `${exclusions.length} scope exclusion(s)`, "VERIFY", "", exDescs]);
        }
      }

      const wsBc = XLSX.utils.aoa_to_sheet(bcData);
      wsBc["!cols"] = [
        { wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 42 },
        { wch: 9 }, { wch: 14 }, { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(wb, wsBc, "Bid Checklist");
    }

    // v14.10.3: RFIs tab (Agent E — Risk & RFI restored from v14.8.1)
    {
      type Rfi = {
        priority: "High" | "Medium" | "Low" | "Info";
        category: string;
        room: string;
        description: string;
        reference: string;
      };
      const rfis: Rfi[] = [];

      // Group rows by room for per-room aggregations
      const byRoom: Record<string, any[]> = {};
      for (const r of rows) {
        const room = r.room || "Unclassified";
        if (!byRoom[room]) byRoom[room] = [];
        byRoom[room].push(r);
      }

      // ── Type 1: Missing Scope (High) — rooms with zero items ──
      for (const rr of (roomResults || [])) {
        const itemCount = (byRoom[rr.room] || []).length;
        if (itemCount === 0 && rr.room && rr.room !== "Unclassified") {
          rfis.push({
            priority: "High",
            category: "Missing Scope",
            room: rr.room,
            description: `Room detected but 0 millwork items extracted. Verify casework scope exists for ${rr.room}. Check interior elevation sheets for this room.`,
            reference: rr.sheet || "No sheet ref",
          });
        }
      }

      // ── Type 2: Scope Exclusion (Medium) — one RFI per exclusion ──
      for (const r of rows) {
        if (r.item_type !== "scope_exclusion") continue;
        const desc = String(r.description || "").trim();
        if (!desc) continue;
        rfis.push({
          priority: "Medium",
          category: "Scope Exclusion",
          room: r.room || "Unclassified",
          description: `"${desc}" — Confirm this item is by others / NIC. Verify responsible party.`,
          reference: r.sheet_ref || "",
        });
      }

      // ── Type 3: Missing Dimensions (Medium) — per room, items with no W or H ──
      for (const room of Object.keys(byRoom).sort()) {
        const items = byRoom[room];
        const millwork = items.filter((i: any) => i.item_type !== "scope_exclusion");
        const noDims = millwork.filter((i: any) =>
          !(i.width_mm && Number(i.width_mm) > 0) &&
          !(i.height_mm && Number(i.height_mm) > 0)
        );
        if (noDims.length === 0) continue;
        const named = noDims.slice(0, 3).map((i: any) => 
          String(i.description || i.item_type || "unnamed").substring(0, 40)
        );
        const more = noDims.length > 3 ? ` (+${noDims.length - 3} more)` : "";
        rfis.push({
          priority: "Medium",
          category: "Missing Dimensions",
          room,
          description: `${noDims.length} item(s) missing dimensions: ${named.join("; ")}${more}. Field verify or obtain from detail sheets.`,
          reference: "",
        });
      }

      // ── Type 4: Missing Material (Low) — per room ──
      for (const room of Object.keys(byRoom).sort()) {
        const items = byRoom[room];
        const millwork = items.filter((i: any) => i.item_type !== "scope_exclusion");
        const noMat = millwork.filter((i: any) => !i.material_code && !i.material);
        if (noMat.length === 0) continue;
        const named = noMat.slice(0, 3).map((i: any) =>
          String(i.description || i.item_type || "unnamed").substring(0, 40)
        );
        const more = noMat.length > 3 ? ` (+${noMat.length - 3} more)` : "";
        rfis.push({
          priority: "Low",
          category: "Missing Material",
          room,
          description: `${noMat.length} item(s) missing material specification: ${named.join("; ")}${more}. Confirm finish and material per spec.`,
          reference: "",
        });
      }

      // ── Type 5: Sheet Reference (Low) — room has no sheet on any item ──
      for (const room of Object.keys(byRoom).sort()) {
        const items = byRoom[room];
        if (items.length === 0) continue;
        const anySheet = items.some((i: any) => {
          const s = String(i.sheet_ref || "").trim();
          return s.length > 0 && !/^(high|medium|low)$/i.test(s);
        });
        if (!anySheet) {
          rfis.push({
            priority: "Low",
            category: "Sheet Reference",
            room,
            description: `No sheet number identified for ${room}. Provide detail/elevation sheet reference for cross-check.`,
            reference: "",
          });
        }
      }

      // ── Type 6: Extraction Note (Info) — pull merge warnings ──
      const MERGE_RE = /identical rows merged|qty=\d+/i;
      for (const w of (warnings || [])) {
        if (!MERGE_RE.test(w)) continue;
        // Warnings are formatted as "[RoomName] body". Extract room.
        const m = String(w).match(/^\[([^\]]+)\]\s*(.+)$/);
        const room = m ? m[1] : "Unclassified";
        const body = m ? m[2] : String(w);
        rfis.push({
          priority: "Info",
          category: "Extraction Note",
          room,
          description: body,
          reference: "",
        });
      }

      // Sort: priority order (High, Medium, Low, Info), then by category, then room
      const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, Info: 3 };
      const CATEGORY_ORDER: Record<string, number> = {
        "Missing Scope": 0,
        "Scope Exclusion": 1,
        "Missing Dimensions": 2,
        "Missing Material": 3,
        "Sheet Reference": 4,
        "Extraction Note": 5,
      };
      rfis.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 99;
        const pb = PRIORITY_ORDER[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        const ca = CATEGORY_ORDER[a.category] ?? 99;
        const cb = CATEGORY_ORDER[b.category] ?? 99;
        if (ca !== cb) return ca - cb;
        return a.room.localeCompare(b.room);
      });

      const rfiHdrs = ["RFI #", "Priority", "Category", "Room", "Description", "Reference", "Status"];
      const rfiData: any[][] = [rfiHdrs];
      rfis.forEach((r, i) => {
        const id = `RFI-${String(i + 1).padStart(3, "0")}`;
        rfiData.push([id, r.priority, r.category, r.room, r.description, r.reference, "Open"]);
      });
      if (rfis.length === 0) {
        rfiData.push(["", "", "", "", "No RFIs generated — extraction complete with no flagged gaps.", "", ""]);
      }

      const wsRfi = XLSX.utils.aoa_to_sheet(rfiData);
      wsRfi["!cols"] = [
        { wch: 9 }, { wch: 9 }, { wch: 18 }, { wch: 22 },
        { wch: 80 }, { wch: 14 }, { wch: 8 },
      ];
      XLSX.utils.book_append_sheet(wb, wsRfi, "RFIs");
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
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#16a34a" }} />v14.10
          </span>
        </div>
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
