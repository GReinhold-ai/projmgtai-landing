// src/app/page.tsx
// ProjMgtAI v14.7.3 — Client-driven room-by-room extraction
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
    if (f) {
      const sizeMB = f.size / (1024 * 1024);
      if (sizeMB > 100) {
        setError("File is " + sizeMB.toFixed(0) + "MB — max recommended is 100MB. Try splitting into smaller sets.");
        return;
      }
      if (sizeMB > 50) {
        setProgress("Large file (" + sizeMB.toFixed(0) + "MB) — processing may take longer.");
      }
      setFile(f); setError("");
    }
  };

  async function extractTextFromPdf(pdfFile: File): Promise<{ text: string; pageCount: number; imagePages: Record<number, string> }> {
    const buf = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    const imagePages: Record<number, string> = {}; // pageNum -> base64 PNG
    
    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress(`Reading page ${i} of ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it: any) => it.str).join(" ").trim();
      pages.push(`--- PAGE ${i} ---\n${text}`);
      
      // Detect image-only pages: <50 chars of extractable text
      if (text.length < 50) {
        try {
          setProgress(`Page ${i}: image-only — rendering for vision...`);
          const scale = 2.0; // 2x for readable text (balanced size vs quality)
          const viewport = page.getViewport({ scale });
          // Cap at 2000px to keep base64 payload manageable
          const maxDim = Math.max(viewport.width, viewport.height);
          const finalScale = maxDim > 2000 ? scale * (2000 / maxDim) : scale;
          const finalViewport = page.getViewport({ scale: finalScale });
          
          const canvas = document.createElement("canvas");
          canvas.width = finalViewport.width;
          canvas.height = finalViewport.height;
          const ctx2d = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx2d, viewport: finalViewport }).promise;
          // JPEG at 70% quality — cuts base64 size ~50% vs 90%
          const dataUrl = canvas.toDataURL("image/jpeg", 0.70);
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
      // Step 1: Extract PDF text + detect image pages
      const { text: pdfText, pageCount, imagePages } = await extractTextFromPdf(file);
      const imagePageNums = Object.keys(imagePages).map(Number);
      if (imagePageNums.length > 0) {
        setProgress(`Found ${imagePageNums.length} image-only page(s): ${imagePageNums.join(", ")} — will use vision`);
        await new Promise(r => setTimeout(r, 1000)); // brief pause so user sees the message
      }
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
              // Include base64 images for any image-only pages in this room
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
            const rowCount = result.rows?.length || 0;
            
            // Auto-retry rooms with 0 items (LLM may extract more on second pass)
            if (rowCount === 0 && !(room as any)._retried) {
              (room as any)._retried = true;
              setProgress(`${room.roomName}: 0 items — retrying...`);
              await new Promise(r => setTimeout(r, 2000));
              i--; // retry this room
              continue;
            }
            
            allRows.push(...(result.rows || []));
            allWarnings.push(...(result.warnings || []).map((w: string) => `[${room.roomName}] ${w}`));
            roomResults.push({
              room: room.roomName, status: "ok",
              itemCount: rowCount,
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

    // ─── Item Re-routing — Gender-specific vanity/locker items ───
    // Items with "Women's" or "Men's" in description may land in wrong room
    // (e.g., "Women's Wet Vanity" extracted under Mens Vanity because shared page)
    // Re-route based on description keywords
    const roomSet = new Set(rows.map((r: any) => r.room));
    for (const r of rows) {
      const desc = (r.description || "").toLowerCase();
      const currentRoom = (r.room || "").toLowerCase();
      
      // Women's items in a men's room → Womens Vanity
      if (/women['']?s?\b/i.test(r.description) && /\b(?:vanit|wet|dry|lavator|counter)/i.test(desc)) {
        if (/men/i.test(currentRoom) && !/women/i.test(currentRoom)) {
          r.room = "Womens Vanity";
        }
      }
      // Men's items in a team/general room → Mens Vanity (if vanity-related)
      if (/\bmen['']?s?\s*(?:wet|dry|vanit)/i.test(desc) && !/men/i.test(currentRoom)) {
        r.room = "Mens Vanity";
      }
      // Women's items in a team/general room → Womens Vanity
      if (/\bwomen['']?s?\s*(?:wet|dry|vanit)/i.test(desc) && !/women/i.test(currentRoom)) {
        r.room = "Womens Vanity";
      }
    }

    // ─── Assembly Enrichment ───────────────────────────────────
    // For each assembly row, compute overall dims + summary from child items in same room
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

        // Mark duplicate assemblies for removal (keep only first)
        for (let ai = 1; ai < assemblies.length; ai++) {
          assemblies[ai]._duplicate = true;
        }

        // Compute overall dims: max width sum (total LF), max depth, max height
        let totalLF = 0; let maxW = 0; let maxD = 0; let maxH = 0;
        const typeCounts: Record<string, number> = {};
        const materials = new Set<string>();
        const matCodes = new Set<string>();

        for (const c of children) {
          const w = Number(c.width_mm) || 0;
          const d = Number(c.depth_mm) || 0;
          const h = Number(c.height_mm) || 0;
          if (w > maxW) maxW = w;
          if (d > maxD) maxD = d;
          if (h > maxH) maxH = h;

          // Extract LF from notes
          const lfMatch = ((c.notes || "") + " " + (c.description || "")).match(/(\d+\.?\d*)\s*LF/);
          if (lfMatch) totalLF += parseFloat(lfMatch[1]);

          const t = c.item_type || "item";
          typeCounts[t] = (typeCounts[t] || 0) + (Number(c.qty) || 1);
          if (c.material && !VALID_ITEM_TYPES_SET.has(c.material)) materials.add(c.material);
          if (c.material_code && !VALID_ITEM_TYPES_SET.has(c.material_code)) matCodes.add(c.material_code);
        }

        // Build summary description
        const parts: string[] = [];
        const typeNames: Record<string, string> = {
          base_cabinet: "base cabinet", upper_cabinet: "upper cabinet",
          tall_cabinet: "tall cabinet", countertop: "countertop",
          transaction_top: "transaction top",
          decorative_panel: "decorative panel", fixed_shelf: "shelf",
          adjustable_shelf: "adj. shelf", drawer: "drawer",
          file_drawer: "file drawer", trash_drawer: "trash drawer",
          grommet: "grommet", conduit: "conduit", j_box: "j-box",
          safe_cabinet: "safe cabinet", trim: "trim", channel: "channel",
          rubber_base: "rubber base", substrate: "substrate",
          piano_hinge: "hinge", concealed_hinge: "hinge",
          equipment_cutout: "equip. cutout", hanger_support: "support",
          cpu_shelf: "CPU shelf", rollout_basket: "rollout basket",
        };
        // Sort by priority then count desc
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
        for (const [type, count] of sorted) {
          const name = typeNames[type] || type.replace(/_/g, " ");
          parts.push(`(${count}) ${name}${count > 1 ? "s" : ""}`);
        }
        const matStr = matCodes.size > 0 ? `. Materials: ${[...matCodes].join(", ")}` : "";
        const lfStr = totalLF > 0 ? ` — ${totalLF.toFixed(1)} LF total` : "";
        const summaryDesc = `Custom millwork assembly: ${parts.join(", ")}${lfStr}${matStr}`;

        // Overall dimension: use totalLF*304.8 for width if available, else maxW
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
    // Remove duplicate assembly rows
    rows = rows.filter((r: any) => !r._duplicate);

    // Tab 1: Project Summary — with project info header
    const pi = projectContext.projectInfo || {};
    const sum: any[][] = [
      ["MILLWORK SHOP ORDER — ProjMgtAI v14.7.3"], [],
    ];
    // Project info block (like Coto De Casa proposal header)
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
    XLSX.utils.book_append_sheet(wb, ws1, "Project Summary");

    // ═══════════════════════════════════════════════════════════════
    // AGENT B: TRADE CLASSIFIER — Confidence scoring & rule tagging
    // ═══════════════════════════════════════════════════════════════
    const classifyItem = (r: any): { confidence: string; rule: string } => {
      const type = (r.item_type || "").toLowerCase();
      const desc = (r.description || "").toLowerCase();
      const hasDims = !!(r.width_mm || r.depth_mm || r.height_mm);
      const hasMat = !!r.material_code;
      const hasHw = !!(r.hardware_spec || r.hardware_type);

      // Rule-based classification with traceability
      if (type === "scope_exclusion") {
        if (/by\s*others|nic|not\s*in/i.test(desc)) return { confidence: "high", rule: "RULE_explicit_exclusion" };
        if (/mirror|tv|monitor|light/i.test(desc)) return { confidence: "high", rule: "RULE_fixture_exclusion" };
        return { confidence: "medium", rule: "LLM_exclusion" };
      }
      if (type === "assembly") {
        return { confidence: "high", rule: "RULE_assembly_rollup" };
      }

      // Millwork items — score based on evidence
      let score = 0;
      let ruleTag = "LLM_classify";

      // Dimensional evidence
      if (hasDims) { score += 30; ruleTag = "RULE_has_dimensions"; }
      // Material evidence
      if (hasMat) { score += 25; ruleTag = hasDims ? "RULE_dims_and_material" : "RULE_has_material"; }
      // Hardware evidence
      if (hasHw) score += 10;
      // Type-specific confidence boosts
      if (/cabinet/i.test(type) && hasDims) { score += 20; ruleTag = "RULE_cabinet_with_dims"; }
      if (/countertop|transaction/i.test(type) && hasMat) { score += 20; ruleTag = "RULE_countertop_with_mat"; }
      if (/hinge|grommet/i.test(type)) { score += 15; ruleTag = "RULE_hardware_item"; }
      if (/trim|channel|rubber/i.test(type)) { score += 10; ruleTag = hasMat ? "RULE_trim_with_mat" : "RULE_trim_generic"; }
      // Description quality
      if (desc.length > 20) score += 10;
      if (/\d+['"]\s*[-x×]/i.test(desc)) score += 15; // embedded dimensions in description

      const confidence = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
      return { confidence, rule: ruleTag };
    };

    // Apply classification to all rows
    for (const r of rows) {
      // Sanitize LLM field leaks: qty, confidence may contain description text
      if (r.qty) {
        const q = Number(r.qty);
        if (isNaN(q) || q <= 0 || q > 500) r.qty = 1; // reset absurd quantities
      }
      // Clean confidence: only allow high/medium/low
      if (r.confidence && !/^(high|medium|low)$/i.test(r.confidence)) {
        // Move leaked text to notes if notes is empty
        if (!r.notes) r.notes = r.confidence;
        r.confidence = "";
      }
      
      const { confidence, rule } = classifyItem(r);
      if (!r.confidence || r.confidence === "") r.confidence = confidence;
      r.classification_rule = rule;
    }

    // Tab 2: All Items — dual-unit dimensions (mm + ft-in)
    const mmToFtIn = (mm: any): string => {
      if (!mm || isNaN(Number(mm)) || Number(mm) <= 0) return "";
      const totalInches = Number(mm) / 25.4;
      let feet = Math.floor(totalInches / 12);
      let inches = totalInches % 12;
      let wholeIn = Math.floor(inches);
      const frac = inches - wholeIn;
      // Round to nearest 1/16
      let sixteenths = Math.round(frac * 16);
      // Handle rollover: 16/16 = 1 inch
      if (sixteenths >= 16) { sixteenths = 0; wholeIn += 1; }
      // Handle 12 inches = 1 foot
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
      "Material Code", "Material", "Detail", "Sheet", "Hardware", "Confidence", "Rule", "Notes"];
    const allData = [hdrs];
    rows.forEach((r: any, i: number) => {
      // Detail column: per-item detail ref from sheet_ref field (e.g. "4A/A8.10" → "4A")
      let sheetRef = (r.sheet_ref || "").trim();
      // Filter out confidence/dimension leaks
      if (/^(high|medium|low)$/i.test(sheetRef)) {
        if (!r.confidence) r.confidence = sheetRef;
        sheetRef = "";
      }
      if (/^\d+['-]/.test(sheetRef) || /^\d+mm$/.test(sheetRef)) sheetRef = "";
      
      // Parse detail from sheet_ref: "4A/A8.10" → detail="4A", or just "A8.10" → detail=""
      let detail = "";
      let sheetNum = "";
      if (sheetRef) {
        const slashMatch = sheetRef.match(/^(\d+[A-D]?)\s*\/\s*(A[\d.]+)/);
        if (slashMatch) {
          detail = slashMatch[1];
          sheetNum = slashMatch[2];
        } else if (/^A\d+\.\d+$/.test(sheetRef)) {
          sheetNum = sheetRef;
        } else {
          detail = sheetRef; // unknown format, put in detail
        }
      }
      
      // Sheet column: use extracted sheet number, fall back to room's sheetInfo
      const roomResult = roomResults.find((rr: any) => rr.room === r.room);
      const roomSheetInfo = (roomResult as any)?.sheetInfo;
      if (!sheetNum) {
        sheetNum = roomSheetInfo?.sheetNumber || "";
      }
      
      // Detail column: if no per-item detail, use the room's full detail list
      if (!detail && roomSheetInfo?.detailNumbers?.length) {
        detail = roomSheetInfo.detailNumbers.join(", ");
      }
      
      allData.push([
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
        mmToFtIn(r.width_mm),
        mmToFtIn(r.depth_mm),
        mmToFtIn(r.height_mm),
        r.material_code || "",
        r.material || "",
        detail,
        sheetNum,
        r.hardware_spec || r.hardware_type || "",
        r.confidence || "",
        r.classification_rule || "",
        r.notes || ""
      ]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(allData);
    ws2["!cols"] = [{wch:5},{wch:20},{wch:18},{wch:45},{wch:8},{wch:5},{wch:5},
      {wch:9},{wch:9},{wch:9},{wch:10},{wch:10},{wch:10},{wch:12},{wch:30},{wch:10},{wch:10},{wch:30},{wch:10},{wch:22},{wch:40}];
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
        if (!sheetNum) {
          sheetNum = roomSheetInfo?.sheetNumber || "";
        }
        if (!detail && roomSheetInfo?.detailNumbers?.length) {
          detail = roomSheetInfo.detailNumbers.join(", ");
        }
        
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
          mmToFtIn(r.width_mm),
          mmToFtIn(r.depth_mm),
          mmToFtIn(r.height_mm),
          r.material_code || "",
          r.material || "",
          detail,
          sheetNum,
          r.hardware_spec || r.hardware_type || "",
          r.confidence || "",
          r.classification_rule || "",
          r.notes || ""
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rd);
      ws["!cols"] = ws2["!cols"];
      // Sheet name: max 31 chars, no special chars
      const tabName = rn.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
      XLSX.utils.book_append_sheet(wb, ws, tabName);
    }

    // ═══════════════════════════════════════════════════════════════
    // AGENT D: BID CHECKLIST — "Don't miss" items per room
    // ═══════════════════════════════════════════════════════════════
    const checklist: any[][] = [
      ["#", "Room", "Category", "Check Item", "Status", "Found", "Notes"],
    ];
    let checkNum = 0;
    const addCheck = (room: string, category: string, item: string, status: string, found: string, notes: string) => {
      checkNum++;
      checklist.push([checkNum, room, category, item, status, found, notes]);
    };

    // Build room item maps for checklist analysis
    const roomItemMap: Record<string, any[]> = {};
    for (const r of rows) {
      const room = r.room || "Unclassified";
      if (!roomItemMap[room]) roomItemMap[room] = [];
      roomItemMap[room].push(r);
    }

    for (const [room, items] of Object.entries(roomItemMap)) {
      const millItems = items.filter((r: any) => r.item_type !== "scope_exclusion" && r.item_type !== "assembly");
      const types = new Set(millItems.map((r: any) => r.item_type));
      const mats = new Set(millItems.map((r: any) => r.material_code).filter(Boolean));
      const hasHardware = millItems.some((r: any) => r.hardware_spec || r.hardware_type);
      const hasDims = millItems.some((r: any) => r.width_mm || r.depth_mm || r.height_mm);
      const cabinets = millItems.filter((r: any) => /cabinet/i.test(r.item_type || ""));
      const countertops = millItems.filter((r: any) => r.item_type === "countertop" || r.item_type === "transaction_top");
      const shelves = millItems.filter((r: any) => /shelf/i.test(r.item_type || ""));
      const panels = millItems.filter((r: any) => /panel|trim|substrate/i.test(r.item_type || ""));

      // Blocking / substrate check
      const hasSubstrate = types.has("substrate");
      if (cabinets.length > 0 && !hasSubstrate) {
        addCheck(room, "Blocking", "Plywood substrate/blocking for cabinet mounting", "VERIFY", "Not found", "Cabinets present — confirm blocking scope");
      } else if (hasSubstrate) {
        addCheck(room, "Blocking", "Plywood substrate/blocking", "OK", "Yes", "");
      }

      // Hardware check
      const hinges = millItems.filter((r: any) => /hinge/i.test(r.item_type || ""));
      if (cabinets.length > 0) {
        if (hinges.length > 0 || hasHardware) {
          addCheck(room, "Hardware", `Cabinet hardware (${hinges.length} hinge items found)`, "OK", "Yes", "Verify hinge type and qty per door");
        } else {
          addCheck(room, "Hardware", "Cabinet hardware (hinges, pulls, locks)", "MISSING", "Not found", `${cabinets.length} cabinet(s) — no hardware specified`);
        }
      }

      // Drawer hardware
      const drawers = millItems.filter((r: any) => /drawer/i.test(r.item_type || ""));
      if (drawers.length > 0) {
        addCheck(room, "Hardware", `Drawer slides (${drawers.length} drawer items)`, "VERIFY", "", "Confirm slide type: full extension / soft close");
      }

      // Adjustable shelf pins/standards
      if (shelves.length > 0) {
        addCheck(room, "Hardware", `Shelf supports (${shelves.length} shelf items)`, "VERIFY", "", "Confirm: pins, standards, or fixed cleats");
      }

      // Countertop edge detail
      if (countertops.length > 0) {
        addCheck(room, "Finish", `Countertop edge profile (${countertops.length} top items)`, "VERIFY", "", "Confirm edge detail: eased, beveled, bullnose, waterfall");
      }

      // Material/finish completeness
      const itemsNoMat = millItems.filter((r: any) => !r.material_code);
      if (itemsNoMat.length > 0 && millItems.length > 0) {
        const pct = Math.round((1 - itemsNoMat.length / millItems.length) * 100);
        addCheck(room, "Finish", `Material specs (${pct}% complete)`,
          pct >= 80 ? "OK" : "VERIFY",
          `${millItems.length - itemsNoMat.length}/${millItems.length} items`,
          itemsNoMat.length > 0 ? `Missing: ${itemsNoMat.slice(0,2).map((r:any) => r.item_type).join(", ")}` : "");
      }

      // Dimensions completeness
      const itemsNoDims = millItems.filter((r: any) => !r.width_mm && !r.depth_mm && !r.height_mm);
      if (millItems.length > 0) {
        const pct = Math.round((1 - itemsNoDims.length / millItems.length) * 100);
        addCheck(room, "Dimensions", `Field dimensions (${pct}% complete)`,
          pct >= 60 ? "OK" : "VERIFY",
          `${millItems.length - itemsNoDims.length}/${millItems.length} items`,
          pct < 60 ? "Field verify critical dimensions before fabrication" : "");
      }

      // ADA compliance (vanity/reception rooms)
      if (/vanit|restroom|reception|ada/i.test(room)) {
        addCheck(room, "ADA", "ADA knee clearance (27\" min under counter)", "VERIFY", "", "Confirm 27\" knee height, 8\" toe depth per ADA 306");
        if (/vanit|restroom/i.test(room)) {
          addCheck(room, "ADA", "ADA mirror mounting height (40\" max to bottom)", "VERIFY", "", "Confirm mirror height per ADA 603.3");
        }
      }

      // Scope exclusions confirmation
      const exclusions = items.filter((r: any) => r.item_type === "scope_exclusion");
      if (exclusions.length > 0) {
        addCheck(room, "Exclusions", `${exclusions.length} scope exclusion(s)`, "VERIFY", "",
          exclusions.slice(0, 2).map((r: any) => (r.description || "").substring(0, 30)).join("; "));
      }
    }

    const wsCheck = XLSX.utils.aoa_to_sheet(checklist);
    wsCheck["!cols"] = [
      { wch: 5 }, { wch: 25 }, { wch: 14 }, { wch: 55 }, { wch: 9 }, { wch: 12 }, { wch: 50 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCheck, "Bid Checklist");

    // ═══════════════════════════════════════════════════════════════
    // AGENT C: WBS SUMMARY — Trade → Component → Location rollups
    // ═══════════════════════════════════════════════════════════════
    const wbs: any[][] = [
      ["WBS #", "Level", "Trade / Component", "Room", "Qty", "Unit", "Total W (ft-in)", "Material", "Notes"],
    ];
    let wbsNum = 0;

    // Group items by trade category
    const tradeMap: Record<string, Record<string, any[]>> = {};
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

    for (const r of rows) {
      const trade = getTradeCategory(r.item_type || "");
      const room = r.room || "Unclassified";
      if (!tradeMap[trade]) tradeMap[trade] = {};
      if (!tradeMap[trade][room]) tradeMap[trade][room] = [];
      tradeMap[trade][room].push(r);
    }

    // Sort trades by priority
    const tradePriority: Record<string, number> = {
      "Cabinetry": 1, "Countertops": 2, "Shelving": 3, "Panels & Substrates": 4,
      "Trim & Molding": 5, "Hardware": 6, "Cutouts & Electrical": 7, "Assemblies": 8,
      "Exclusions": 9, "Other": 10,
    };
    const sortedTrades = Object.keys(tradeMap).sort((a, b) => (tradePriority[a] || 99) - (tradePriority[b] || 99));

    for (const trade of sortedTrades) {
      const rooms = tradeMap[trade];
      let tradeQty = 0;
      let tradeTotalWidthMm = 0;
      const tradeMats = new Set<string>();

      // Trade header row
      wbsNum++;
      const tradeWbsNum = wbsNum;
      const tradeRowIdx = wbs.length;
      wbs.push([`${wbsNum}`, "Trade", trade, "", 0, "", "", "", ""]);

      for (const [room, items] of Object.entries(rooms).sort((a, b) => a[0].localeCompare(b[0]))) {
        const roomQty = items.reduce((s: number, r: any) => s + (Number(r.qty) || 1), 0);
        const roomWidthMm = items.reduce((s: number, r: any) => s + (Number(r.width_mm) || 0), 0);
        const roomMats = [...new Set(items.map((r: any) => r.material_code).filter(Boolean))];
        tradeQty += roomQty;
        tradeTotalWidthMm += roomWidthMm;
        roomMats.forEach(m => tradeMats.add(m));

        wbsNum++;
        wbs.push([
          `${tradeWbsNum}.${wbsNum - tradeWbsNum}`, "Room",
          `${items.length} ${trade.toLowerCase()} item(s)`,
          room, roomQty, "EA",
          roomWidthMm > 0 ? mmToFtIn(roomWidthMm) : "",
          roomMats.join(", "),
          items.filter((r:any) => r.item_type !== "assembly").map((r:any) => r.item_type).join(", "),
        ]);
      }

      // Update trade header with totals
      wbs[tradeRowIdx][4] = tradeQty;
      wbs[tradeRowIdx][7] = [...tradeMats].join(", ");
      wbs[tradeRowIdx][8] = `${Object.keys(rooms).length} room(s)`;
    }

    // Summary row
    wbs.push([]);
    const totalMill = rows.filter((r:any) => r.item_type !== "scope_exclusion" && r.item_type !== "assembly").length;
    const totalExcl = rows.filter((r:any) => r.item_type === "scope_exclusion").length;
    wbs.push(["", "", "TOTAL", "", rows.length, "", "", "", `${totalMill} millwork + ${totalExcl} exclusions`]);

    const wsWbs = XLSX.utils.aoa_to_sheet(wbs);
    wsWbs["!cols"] = [
      { wch: 8 }, { wch: 8 }, { wch: 35 }, { wch: 28 }, { wch: 6 }, { wch: 5 },
      { wch: 14 }, { wch: 20 }, { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, wsWbs, "WBS Summary");

    // ─── RFI Tab — Auto-generated from extraction gaps ───────────
    const rfis: any[][] = [
      ["RFI #", "Priority", "Category", "Room", "Description", "Reference", "Status"],
    ];
    let rfiNum = 0;
    const addRfi = (priority: string, category: string, room: string, desc: string, ref: string) => {
      rfiNum++;
      rfis.push([`RFI-${String(rfiNum).padStart(3, "0")}`, priority, category, room, desc, ref, "Open"]);
    };

    // 1. Rooms with 0 items — likely missing scope
    for (const r of roomResults) {
      if ((r.itemCount || 0) === 0 && r.status === "ok" && r.room !== "Unclassified") {
        addRfi("High", "Missing Scope",
          r.room,
          `Room detected but 0 millwork items extracted. Verify casework scope exists for ${r.room}. Check interior elevation sheets for this room.`,
          (r as any).sheetInfo?.sheetNumber || "No sheet ref");
      }
    }

    // 2. Scope exclusions — confirm by others
    for (const row of rows) {
      if (row.item_type === "scope_exclusion") {
        addRfi("Medium", "Scope Exclusion",
          row.room || "Unclassified",
          `"${(row.description || "").substring(0, 80)}" — Confirm this item is by others / NIC. Verify responsible party.`,
          row.sheet_ref || "");
      }
    }

    // 3. Items missing dimensions
    const itemsMissingDims = rows.filter((r: any) =>
      r.item_type !== "scope_exclusion" && r.item_type !== "assembly" &&
      !r.width_mm && !r.depth_mm && !r.height_mm
    );
    // Group by room to avoid flooding
    const dimGapRooms: Record<string, string[]> = {};
    for (const r of itemsMissingDims) {
      const room = r.room || "Unclassified";
      if (!dimGapRooms[room]) dimGapRooms[room] = [];
      dimGapRooms[room].push(r.description?.substring(0, 40) || r.item_type);
    }
    for (const [room, items] of Object.entries(dimGapRooms)) {
      addRfi("Medium", "Missing Dimensions",
        room,
        `${items.length} item(s) missing dimensions: ${items.slice(0, 3).join("; ")}${items.length > 3 ? ` (+${items.length - 3} more)` : ""}. Field verify or obtain from detail sheets.`,
        "");
    }

    // 4. Items missing material codes
    const itemsMissingMat = rows.filter((r: any) =>
      r.item_type !== "scope_exclusion" && r.item_type !== "assembly" &&
      r.item_type !== "concealed_hinge" && !r.material_code
    );
    const matGapRooms: Record<string, string[]> = {};
    for (const r of itemsMissingMat) {
      const room = r.room || "Unclassified";
      if (!matGapRooms[room]) matGapRooms[room] = [];
      matGapRooms[room].push(r.description?.substring(0, 40) || r.item_type);
    }
    for (const [room, items] of Object.entries(matGapRooms)) {
      addRfi("Low", "Missing Material",
        room,
        `${items.length} item(s) missing material specification: ${items.slice(0, 3).join("; ")}${items.length > 3 ? ` (+${items.length - 3} more)` : ""}. Confirm finish and material per spec.`,
        "");
    }

    // 5. Rooms with no sheet reference
    for (const r of roomResults) {
      const si = (r as any).sheetInfo;
      if ((r.itemCount || 0) > 0 && (!si?.sheetNumber)) {
        addRfi("Low", "Sheet Reference",
          r.room,
          `No sheet number identified for ${r.room}. Provide detail/elevation sheet reference for cross-check.`,
          "");
      }
    }

    // 6. Merge warnings (from extraction) — keep as informational RFIs
    for (const w of warnings) {
      addRfi("Info", "Extraction Note",
        (w.match(/\[([^\]]+)\]/)?.[1]) || "",
        w.replace(/\[[^\]]+\]\s*/, ""),
        "");
    }

    const wsRfi = XLSX.utils.aoa_to_sheet(rfis);
    wsRfi["!cols"] = [
      { wch: 10 }, // RFI #
      { wch: 8 },  // Priority
      { wch: 20 }, // Category
      { wch: 25 }, // Room
      { wch: 70 }, // Description
      { wch: 12 }, // Reference
      { wch: 8 },  // Status
    ];
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
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }} />v14.7.3 Live
        </span>
      </nav>

      <section style={{ textAlign:"center", padding:"80px 20px 60px" }}>
        <div style={{ display:"inline-block", padding:"6px 16px", border:"1px solid rgba(34,211,238,0.3)", borderRadius:20, fontSize:12, color:"#22d3ee", marginBottom:24 }}>
          ★ v14.7.3 — Improved room detection & dimension extraction
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
              <a href={resultUrl} download={`shop_order_v1473_${file?.name?.replace(".pdf","")}.xlsx`}
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
