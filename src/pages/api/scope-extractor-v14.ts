// src/pages/api/scope-extractor-v14.ts
// V14.3 Scope Extractor — Client-Driven Multi-Room Pipeline
//
// v14.3 FIXES:
//   - Room grouping: title-block-aware detection (first/last 600 chars + sheet number patterns)
//   - Room grouping: specificity scoring — "Kids Club" beats "Reception" on same page
//   - TOON sanitization: strip semicolons from description field to prevent column bleed
//   - Dimension extraction: improved regex coverage for architectural notation
//   - Column alignment: fixed confidence vs notes swap in postprocess
//   - Garbage row filter: skip rows with empty description or type
//
// Architecture (unchanged from v14.2):
//   Call 1: mode="analyze" → returns page groupings + project context
//   Call 2+: mode="extract" → extracts one room at a time

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA_V14 } from "@/lib/toonSchemas";
import { preprocess } from "@/lib/parser/preprocess";
import { postprocess } from "@/lib/parser/postprocess";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-20250514";
const HEADER_V14 = `#TOON v=1 sep=; cols=${MW_ITEM_SCHEMA_V14.join(",")}`;

// ─── Types ───────────────────────────────────────────────────

interface PageText { pageNum: number; text: string; }

interface MaterialLegendEntry {
  code: string; manufacturer: string; productName: string;
  catalogNumber: string; category: string;
}

interface ProjectContext {
  materialLegend: MaterialLegendEntry[];
  hardwareGroups: Record<string, string[]>;
  generalNotes: string[];
  documentType: "bid_set" | "shop_drawing" | "submittal" | "unknown";
}

interface RoomInfo {
  roomName: string; roomId: string;
  pageNums: number[];
}

// ─── Parse Pages ─────────────────────────────────────────────

function parsePages(text: string): PageText[] {
  const parts = text.split(/---\s*PAGE\s*(?:BREAK|(\d+))\s*---/i);
  const pages: PageText[] = [];
  if (parts.length <= 1) return [{ pageNum: 1, text: text.trim() }];

  let pageNum = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]?.trim();
    if (!part) continue;
    if (/^\d+$/.test(part)) { pageNum = parseInt(part); continue; }
    if (part.length > 5) { pageNum++; pages.push({ pageNum, text: part }); }
  }
  return pages;
}

// ─── Project Context Extraction ──────────────────────────────

function extractProjectContext(pages: PageText[]): ProjectContext {
  const allText = pages.map(p => p.text).join("\n");
  const context: ProjectContext = {
    materialLegend: [], hardwareGroups: {}, generalNotes: [],
    documentType: "unknown",
  };

  // Document type detection - check for shop drawing indicators first (more specific)
  if (/Finish\s*Material\s*Selections|Revised\s*Submittals|SHOP\s*DRAW/i.test(allText)) {
    context.documentType = "shop_drawing";
  } else if (/Submittal|SUBMITT/i.test(allText)) {
    context.documentType = "submittal";
  } else if (/Bid\s*Set|For\s*Bidding|BID\s*SET/i.test(allText)) {
    context.documentType = "bid_set";
  }

  // Material legend extraction — broader patterns
  // Look for "Finish Material Selections" OR "MATERIAL LEGEND" OR "FINISH SCHEDULE"
  const legendPatterns = [
    /Finish\s*Material\s*Selections[;:\s]*([\s\S]*?)(?=\n\n|\d+\s+\d+\s+\d+|---|$)/i,
    /MATERIAL\s*LEGEND[;:\s]*([\s\S]*?)(?=\n\n|---|$)/i,
    /FINISH\s*SCHEDULE[;:\s]*([\s\S]*?)(?=\n\n|---|$)/i,
  ];
  
  for (const pat of legendPatterns) {
    const legendBlock = allText.match(pat);
    if (legendBlock) {
      // Match patterns like: PL-01: Wilsonart "Solar Oak" 7816-60
      // or PL-01; Wilsonart 'Solar Oak' 7816-60
      // or PL01 Wilsonart "Solar Oak" 7816
      const entryRe = /((?:PL|SS|FB|3F|WD|GL|RB|MEL|ALM|WC|ST|MR|QZ|GR|COR|LN)-?\d*[A-Z]?)\s*[;:=\s]\s*(\w[\w\s&.]*?)\s*['''"""]([^'''""\n]+)['''"""]?\s*(\S+)?/gi;
      let m;
      while ((m = entryRe.exec(legendBlock[1])) !== null) {
        let category = "unknown";
        const code = m[1].trim();
        if (/^PL/i.test(code)) category = "laminate";
        else if (/^SS/i.test(code)) category = "solid_surface";
        else if (/^3F/i.test(code)) category = "specialty";
        else if (/^FB/i.test(code)) category = "blocking";
        else if (/^MEL/i.test(code)) category = "melamine";
        else if (/^ST/i.test(code)) category = "stainless";
        else if (/^QZ/i.test(code)) category = "quartz";
        else if (/^GR/i.test(code)) category = "granite";
        else if (/^WD/i.test(code)) category = "wood";
        else if (/^GL/i.test(code)) category = "glass";
        context.materialLegend.push({
          code, manufacturer: m[2].trim(), productName: m[3].trim(),
          catalogNumber: (m[4] || "").trim(), category,
        });
      }
      if (context.materialLegend.length > 0) break; // found entries, stop
    }
  }

  // Hardware group extraction
  const hwGroupRe = /Group\s+(\d+)\s+Hardware[:\s]*([\s\S]*?)(?=Group\s+\d|$)/gi;
  let hm;
  while ((hm = hwGroupRe.exec(allText)) !== null) {
    context.hardwareGroups[`Group ${hm[1]}`] = hm[2].split(/[;\n]/).map(s => s.trim()).filter(Boolean);
  }

  return context;
}

// ─── Page Grouping — Title Block Aware ───────────────────────
//
// v14.3 KEY FIX: Previous version searched the ENTIRE page text for room names.
// This caused "Reception Desk" to match nearly every page because the word
// "Reception" appeared in general notes, cross-references, or title blocks.
//
// New approach:
//   1. Extract the "title zone" — first 600 chars + last 600 chars of page
//      (architectural drawing title blocks are usually at top or bottom)
//   2. Also look for explicit sheet naming patterns like "T3.12 - KIDS CLUB"
//   3. Score matches by specificity (multi-word > single-word)
//   4. If a page matches multiple rooms, highest specificity wins
//   5. Pages that only match via general terms go to most-specific match

function groupPagesByRoom(pages: PageText[]): RoomInfo[] {
  // Room patterns with specificity scores (higher = more specific = wins ties)
  const titlePatterns: [RegExp, string, number][] = [
    // Very specific multi-word patterns (score 10)
    [/Kids?\s*(?:['']s?\s*)?Club/i, "Kids Club", 10],
    [/Arts?\s*(?:&|and|'?n'?)?\s*Crafts?/i, "Arts & Crafts", 10],
    [/Service\s*Manager/i, "Service Manager", 10],
    [/Reception\s*Desk/i, "Reception Desk", 10],
    [/Team\s*(?:Member|Memb)/i, "Team Members", 10],
    [/Team\s*Room/i, "Team Room", 10],
    [/Men['']?s?\s*Vanit/i, "Mens Vanity", 10],
    [/Wom[ea]n['']?s?\s*Vanit/i, "Womens Vanity", 10],
    [/Vanit(?:y|ies)\s*Detail/i, "Vanity Details", 10],
    [/Retail\s*Display/i, "Retail Display", 10],
    [/Break\s*Room/i, "Break Room", 10],
    [/Nurse\s*Station/i, "Nurse Station", 10],
    [/Check[\s-]*(?:In|Out)/i, "Check-In-Out", 10],
    [/Conference\s*Room/i, "Conference Room", 10],
    [/Equip(?:ment)?\s*Cab/i, "Equipment Cabinet", 10],
    [/Stereo\s*(?:Equip|Cab)/i, "Equipment Cabinet", 10],
    
    // Medium specificity (score 5)
    [/\bLocker/i, "Team Members", 5],
    [/\bVanit(?:y|ies)\b/i, "Vanity Details", 5],
    [/\bRetail\b/i, "Retail Display", 5],
    [/\bLobby\b/i, "Lobby", 5],
    [/\bKitchen\b/i, "Kitchen", 5],
    [/\bLaundry\b/i, "Laundry", 5],
    [/\bMirror/i, "Vanity Details", 5],
    [/\bUnisex\b/i, "Unisex", 5],
    [/\bPool\b/i, "Pool Area", 5],
    [/\bFitness\b/i, "Fitness Area", 5],
  ];

  // Sheet reference patterns — "T3.12" "A7.15" etc. in title block
  const sheetRefRe = /([AT]\d+[.\-]\d+)\s*[-–—:]\s*(.+)/gi;

  const roomMap = new Map<string, number[]>();

  for (const page of pages) {
    // Extract title zone: first and last 600 chars
    const titleZone = (
      page.text.substring(0, 600) + "\n" +
      page.text.substring(Math.max(0, page.text.length - 600))
    );

    // Also check for sheet reference lines anywhere (these are explicit)
    const sheetRefs: string[] = [];
    let sm;
    const sheetCheck = new RegExp(sheetRefRe.source, sheetRefRe.flags);
    while ((sm = sheetCheck.exec(page.text)) !== null) {
      sheetRefs.push(sm[2].trim());
    }

    // Score each room against this page
    let bestRoom = "Unclassified";
    let bestScore = 0;

    for (const [pattern, name, score] of titlePatterns) {
      // Check title zone first (highest priority)
      if (pattern.test(titleZone)) {
        if (score > bestScore) { bestRoom = name; bestScore = score; }
      }
      // Check sheet references
      for (const ref of sheetRefs) {
        if (pattern.test(ref)) {
          const refScore = score + 5; // sheet refs get bonus
          if (refScore > bestScore) { bestRoom = name; bestScore = refScore; }
        }
      }
    }

    // If nothing matched in title zone, check full text but only for high-specificity patterns
    if (bestScore === 0) {
      for (const [pattern, name, score] of titlePatterns) {
        if (score >= 10 && pattern.test(page.text)) {
          if (score > bestScore) { bestRoom = name; bestScore = score; }
        }
      }
    }

    if (!roomMap.has(bestRoom)) roomMap.set(bestRoom, []);
    roomMap.get(bestRoom)!.push(page.pageNum);
  }

  const rooms: RoomInfo[] = [];
  let idx = 0;
  for (const [name, pageNums] of roomMap) {
    idx++;
    rooms.push({ roomName: name, roomId: `ROOM-${String(idx).padStart(3, "0")}`, pageNums });
  }
  return rooms;
}

// ─── System Prompt ───────────────────────────────────────────

function buildSystemPrompt(ctx: ProjectContext): string {
  let p = `
You are ScopeExtractor v14.3, an expert architectural millwork estimator
with 40 years of experience reading construction documents for a
C-6 licensed millwork subcontractor.

You will receive:
1. OCR text from pages of an architectural plan for ONE ROOM/ASSEMBLY
2. PRE-EXTRACTED HINTS: dimensions, materials, hardware from regex
3. PROJECT CONTEXT: material legend and hardware groups from other sheets

OUTPUT FORMAT:
- First line MUST be exactly: ${HEADER_V14}
- One line per item, semicolon-separated
- Fields: ${MW_ITEM_SCHEMA_V14.join(", ")}

CRITICAL RULES FOR SEMICOLONS IN OUTPUT:
- NEVER use semicolons inside any field value. Semicolons are ONLY column separators.
- If a description contains a semicolon, replace it with a comma or dash.
- Each data line must have exactly the same number of semicolons as there are column separators.

ASSEMBLY RULES:
- If text describes a single built assembly, create parent row with item_type="assembly"
- Nest components under it with same assembly_id
- Each cabinet section = separate item with section_id

ITEM TYPES: assembly, base_cabinet, upper_cabinet, tall_cabinet, countertop,
decorative_panel, trim, channel, rubber_base, substrate, concealed_hinge, piano_hinge,
grommet, adjustable_shelf, fixed_shelf, cpu_shelf, drawer, file_drawer, trash_drawer,
rollout_basket, conduit, j_box, equipment_cutout, safe_cabinet, controls_cabinet,
end_panel, corner_guard, corner_detail, stainless_panel, hanger_support, scope_exclusion

DIMENSION RULES — CRITICAL:
- Use dimensions from PRE-EXTRACTED HINTS. Match to items by context.
- Convert all dimensions to mm. 1" = 25.4mm, 1' = 304.8mm.
- Common conversions: 24"=610mm, 25"=635mm, 34"=864mm, 36"=914mm, 42"=1067mm, 48"=1219mm
- For dimensions like 2'-1" = 25"= 635mm, 6'-0" = 72" = 1829mm
- NEVER invent dimensions. Leave empty if not found in text or hints.
- dim_source: "extracted" | "calculated" | "unknown"
- ALWAYS check the PRE-EXTRACTED DIMENSIONS section — these are reliable regex matches from the OCR.
  Map them to the correct items by reading the surrounding context.

MATERIAL RULES:
- material_code for parsed codes (PL-01, SS-1B, etc.)
- material for free text description
- Every material in hints should appear on at least one item`.trim();

  if (ctx.documentType === "shop_drawing" || ctx.materialLegend.length > 0) {
    p += `

SHOP DRAWING MODE ACTIVE:
- Use FULL manufacturer info from material legend
- #N detail sections = individual component views with own dims
- Extract manufacturer part numbers (Blum, Rev-A-Shelf, Outwater, etc.)
- "FB-1 By Others" / "N.I.C." → item_type="scope_exclusion"`;
  }

  p += `

WHAT TO EXTRACT: cabinets, countertops, panels, trim, hardware, equipment cutouts,
substrates, conduit/electrical by millwork fab, scope exclusions (NIC/by others).
WHAT NOT TO EXTRACT: items by G.C., electrical, plumbing, flooring, paint.

Set confidence: "high" = type+dims+material, "medium" = missing one, "low" = missing two+.

FINAL CHECK: Before outputting, verify each line has the correct number of semicolons
matching the column count. Description field must NEVER contain semicolons.`;
  return p;
}

// ─── User Prompt Builder ─────────────────────────────────────

function buildUserPrompt(
  roomText: string, roomName: string, hints: any, ctx: ProjectContext, projectId?: string
): string {
  const parts: string[] = [];
  parts.push(`Project: ${projectId || "(unspecified)"}`);
  parts.push(`Room: ${roomName}`);
  parts.push(`Document Type: ${ctx.documentType}`);
  parts.push("");

  if (ctx.materialLegend.length > 0) {
    parts.push("## PROJECT MATERIAL LEGEND");
    for (const m of ctx.materialLegend) {
      parts.push(`  ${m.code}: ${m.manufacturer} '${m.productName}' ${m.catalogNumber} [${m.category}]`);
    }
    parts.push("");
  }

  if (hints.assembly) {
    parts.push("## ASSEMBLY DETECTED");
    parts.push(`Name: "${hints.assembly.name}" | Type: ${hints.assembly.type}`);
    parts.push(`Sections: ${hints.assembly.sections.join(", ") || "none found"}`);
    parts.push(`→ Create assembly_id="ASSY-001" and nest ALL components under it.`);
    parts.push("");
  }

  parts.push(`## PRE-EXTRACTED DIMENSIONS (${hints.dimensions.length} found)`);
  for (const d of hints.dimensions.slice(0, 100)) {
    parts.push(`  Line ${d.line}: ${d.raw} = ${d.mm}mm | "${d.context}"`);
  }
  parts.push("");

  parts.push(`## PRE-EXTRACTED MATERIALS (${hints.materials.length} found)`);
  for (const m of hints.materials) {
    const legend = ctx.materialLegend.find((l: any) => l.code === m.code);
    parts.push(legend
      ? `  ${m.code}: ${legend.manufacturer} '${legend.productName}' ${legend.catalogNumber}`
      : `  ${m.code}: ${m.fullName} [${m.category}]`);
  }
  parts.push("");

  parts.push(`## PRE-EXTRACTED HARDWARE (${hints.hardware.length} found)`);
  for (const h of hints.hardware) {
    parts.push(`  ${h.type}: qty=${h.qty}${h.spec ? ` "${h.spec}"` : ""}`);
  }
  parts.push("");

  // Truncate OCR text to ~15K chars to stay under token budget
  let ocrText = roomText;
  if (ocrText.length > 15000) {
    ocrText = ocrText.substring(0, 15000) + "\n[TRUNCATED]";
  }

  parts.push("## OCR TEXT");
  parts.push('"""');
  parts.push(ocrText);
  parts.push('"""');
  parts.push("");
  parts.push(`Output ONLY valid TOON with this exact header:`);
  parts.push(HEADER_V14);

  return parts.join("\n");
}

// ─── TOON Sanitization ──────────────────────────────────────
// v14.3: Strip semicolons from description fields to prevent column bleed

function sanitizeToon(toon: string): string {
  const lines = toon.split("\n");
  const sanitized: string[] = [];
  
  for (const line of lines) {
    // Keep header line as-is
    if (line.startsWith("#TOON") || !line.trim()) {
      sanitized.push(line);
      continue;
    }
    
    // Split into fields
    const fields = line.split(";");
    
    // The description field is typically the 3rd field (index 2)
    // Sanitize: replace any embedded semicolons within fields that shouldn't have them
    // We expect exactly (column_count - 1) semicolons per line
    const expectedCols = MW_ITEM_SCHEMA_V14.length;
    
    if (fields.length > expectedCols) {
      // Too many semicolons — likely semicolons inside a field value
      // Strategy: merge excess fields into the description (field index 2)
      const descIdx = 2; // description is typically the 3rd column
      const excess = fields.length - expectedCols;
      const mergedDesc = fields.slice(descIdx, descIdx + excess + 1).join(" - ");
      const fixedFields = [
        ...fields.slice(0, descIdx),
        mergedDesc,
        ...fields.slice(descIdx + excess + 1)
      ];
      sanitized.push(fixedFields.join(";"));
    } else {
      sanitized.push(line);
    }
  }
  
  return sanitized.join("\n");
}

// ─── Row Cleanup ─────────────────────────────────────────────
// v14.3: Filter garbage rows and fix column misalignment

function cleanupRows(rows: any[]): any[] {
  return rows.filter(row => {
    // Must have a description or item_type
    if (!row.description && !row.item_type) return false;
    // Description shouldn't be a single word that looks like a column value
    if (row.description && /^(EA|LS|SF|LF|extracted|calculated|unknown|high|medium|low)$/i.test(row.description.trim())) return false;
    return true;
  }).map(row => {
    // Fix common column misalignment: confidence value in notes, or vice versa
    const validConfidence = ["high", "medium", "low"];
    if (row.notes && validConfidence.includes(row.notes.toLowerCase()) && !validConfidence.includes((row.confidence || "").toLowerCase())) {
      // Notes has a confidence value, swap
      const tmp = row.confidence;
      row.confidence = row.notes;
      row.notes = tmp || "";
    }
    // Clean description of any remaining semicolons
    if (row.description) {
      row.description = row.description.replace(/;/g, ",");
    }
    return row;
  });
}

// ─── LLM Call with Retry ─────────────────────────────────────

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL, max_tokens: 8192, temperature: 0.05,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const tb = message.content.find((b: any) => b.type === "text");
      return tb?.text?.trim() ?? "";
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.error?.type === "rate_limit_error";
      if (is429 && attempt < 2) {
        const wait = 15000 * Math.pow(2, attempt);
        console.log(`[v14.3] Rate limited, waiting ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Handler ─────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const { text, projectId, sheetRef, mode, roomPages, projectContext: clientCtx } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
  }

  try {
    // ══════════════════════════════════════════════════════════
    // MODE: "analyze" — Parse pages, group rooms, extract context
    // ══════════════════════════════════════════════════════════
    if (mode === "analyze") {
      const t0 = Date.now();
      const pages = parsePages(text);
      const ctx = extractProjectContext(pages);
      const rooms = groupPagesByRoom(pages);

      // Log for debugging
      console.log(`[v14.3] Analyze: ${pages.length} pages, ${rooms.length} rooms, ${ctx.materialLegend.length} materials`);
      for (const r of rooms) {
        console.log(`  ${r.roomName}: pages ${r.pageNums.join(",")}`);
      }

      return res.status(200).json({
        ok: true, version: "v14.3", mode: "analyze",
        projectContext: ctx,
        rooms: rooms,
        pageCount: pages.length,
        timing: { analyzeMs: Date.now() - t0 },
      });
    }

    // ══════════════════════════════════════════════════════════
    // MODE: "extract" (or default) — Extract ONE room
    // ══════════════════════════════════════════════════════════
    const t0 = Date.now();
    const pages = parsePages(text);

    let roomPageTexts = pages;
    let roomName = "Unclassified";

    if (roomPages && Array.isArray(roomPages) && roomPages.length > 0) {
      const pageSet = new Set(roomPages as number[]);
      roomPageTexts = pages.filter(p => pageSet.has(p.pageNum));
      roomName = req.body.roomName || "Room";
    }

    const combinedText = roomPageTexts.map(p => `--- PAGE ${p.pageNum} ---\n${p.text}`).join("\n\n");

    const ctx: ProjectContext = clientCtx || extractProjectContext(pages);
    const hints = preprocess(combinedText, sheetRef);

    const systemPrompt = buildSystemPrompt(ctx);
    const userPrompt = buildUserPrompt(combinedText, roomName, hints, ctx, projectId);

    const tLlm = Date.now();
    let toon = await callAnthropic(systemPrompt, userPrompt);
    const llmMs = Date.now() - tLlm;

    // v14.3: Sanitize TOON before validation
    toon = sanitizeToon(toon);

    // Validate TOON
    if (!isValidToon(toon, HEADER_V14)) {
      const fence = toon.match(/```(?:toon|csv|text)?\s*\n?(#TOON[\s\S]*?)```/);
      if (fence) toon = sanitizeToon(fence[1].trim());
    }
    if (!isValidToon(toon, HEADER_V14)) {
      return res.status(400).json({
        ok: false, error: "Model did not return valid TOON",
        preview: toon.slice(0, 500), room: roomName,
      });
    }

    // Decode & post-process
    const rawRows = decodeToon(toon);
    const result = postprocess(rawRows);

    // v14.3: Clean up rows
    const cleanedRows = cleanupRows(result.rows);
    for (const row of cleanedRows) { row.room = row.room || roomName; }

    return res.status(200).json({
      ok: true, version: "v14.3", mode: "extract",
      model: MODEL, room: roomName,
      projectId: projectId || null,
      toon, rows: cleanedRows, assemblies: result.assemblies,
      stats: { ...result.stats, totalItems: cleanedRows.length },
      warnings: result.warnings,
      hints: {
        dimensionCount: hints.dimensions.length,
        materialCount: hints.materials.length,
        hardwareCount: hints.hardware.length,
        assembly: hints.assembly,
        millworkSignalStrength: hints.millworkSignalStrength,
      },
      timing: { llmMs, totalMs: Date.now() - t0 },
    });
  } catch (err: any) {
    console.error("[v14.3] error:", err?.message);
    return res.status(500).json({ ok: false, version: "v14.3", error: err?.message || "Unknown error" });
  }
}
