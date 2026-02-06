// src/pages/api/scope-extractor-v14.ts
// V14.3.1 Scope Extractor — Client-Driven Multi-Room Pipeline
//
// v14.3.1 FIXES (on top of v14.3):
//   - TOON sanitization: detect comma-embedded TOON data in descriptions
//   - Column shift repair: detect description in item_type field, re-map columns
//   - Clean "extracted" from dimension fields
//   - Infer item_type from description keywords when LLM outputs non-standard type
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
    [/Men['']?s?\s*(?:Vanit|Locker|Restroom)/i, "Mens Vanity", 10],
    [/Wom[ea]n['']?s?\s*(?:Vanit|Locker|Restroom)/i, "Womens Vanity", 10],
    [/Vanit(?:y|ies)\s*Detail/i, "Vanity Details", 10],
    [/Retail\s*(?:Display|Trellis|Area)/i, "Retail Display", 10],
    [/Break\s*Room/i, "Break Room", 10],
    [/Nurse\s*Station/i, "Nurse Station", 10],
    [/Check[\s-]*(?:In|Out)/i, "Check-In-Out", 10],
    [/Conference\s*Room/i, "Conference Room", 10],
    [/Equip(?:ment)?\s*Cab/i, "Equipment Cabinet", 10],
    [/Stereo\s*(?:Equip|Cab)/i, "Equipment Cabinet", 10],
    [/Janitor/i, "Janitor", 10],
    [/Laundry/i, "Laundry", 10],
    [/First\s*Floor\s*Plan/i, "First Floor", 10],
    [/Floor\s*Plan/i, "First Floor", 8],
    
    // Medium specificity (score 5)
    [/\bLocker/i, "Team Members", 5],
    [/\bVanit(?:y|ies)\b/i, "Vanity Details", 5],
    [/\bRetail\b/i, "Retail Display", 5],
    [/\bTrellis\b/i, "Retail Display", 5],
    [/\bLobby\b/i, "Lobby", 5],
    [/\bKitchen\b/i, "Kitchen", 5],
    [/\bMirror/i, "Vanity Details", 5],
    [/\bUnisex\b/i, "Unisex", 5],
    [/\bPool\b/i, "Pool Area", 5],
    [/\bFitness\b/i, "Fitness Area", 5],
    [/\bStereo\b/i, "Service Manager", 5],
    [/\bAV\s*Equip/i, "Service Manager", 5],
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
You are ScopeExtractor v14.3.3, an expert architectural millwork estimator
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
- NEVER use commas to create sub-fields within a description. Keep descriptions as plain text.
- If a description contains a semicolon or comma-separated data, replace with plain text.
- Each data line must have exactly the same number of semicolons as there are column separators.

COLUMN ORDER IS CRITICAL — every row must follow this exact field order:
  item_type;room;qty;description;section_id;unit;width_mm;depth_mm;height_mm;dim_source;material_code;material;...
The FIRST field is ALWAYS item_type (e.g. "base_cabinet", "scope_exclusion").
The FOURTH field is ALWAYS description (free text).
NEVER put the room name as item_type. NEVER repeat the room name across multiple fields.

EXAMPLE OUTPUT (for a room called "Reception Desk"):
  assembly;Reception Desk;1;Reception Desk Assembly;ASSY-001;EA;4420;;;extracted;;;;...
  base_cabinet;Reception Desk;1;Base Cabinet Section 18A;18A;EA;1168;610;864;extracted;PL-01;Plastic Laminate;...
  countertop;Reception Desk;1;Solid Surface Countertop;;EA;4420;;32;extracted;SS-1B;Solid Surface;...
  fixed_shelf;Reception Desk;1;CPU Shelf;9;EA;762;610;19;extracted;PL-01;PLAM;...
  grommet;Reception Desk;8;Desk Grommets;;EA;;;;unknown;;;;...
  scope_exclusion;Reception Desk;1;Printer FA-2 - By Others;;EA;;;;unknown;;;;...

SCOPE_EXCLUSION vs MILLWORK — CRITICAL:
- scope_exclusion is ONLY for items NOT built/installed by the millwork contractor
  Examples: TVs, AV equipment, plumbing fixtures, electrical by others, items marked "NIC" or "By Others"
- Vendor-supplied lockers, benches, towel stations, and casework components that are SPECIFIED 
  IN THE MILLWORK PLANS are MILLWORK items (tall_cabinet, base_cabinet, etc.) even if a brand 
  name like "Club Resource Group" or a model number is listed. These are items the millwork 
  sub will procure and install.
- Only mark as scope_exclusion if the text explicitly says "By Others", "NIC", "Not In Contract",
  "By GC", "By Owner", or similar exclusion language.

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
// v14.3.1: Comprehensive TOON repair
//
// Handles three failure modes:
// 1. Excess semicolons in description field (v14.3 fix)
// 2. Comma-separated TOON data embedded in description (LLM outputs commas instead of semicolons)
// 3. Column order shift (description before item_type)

// Known valid item_type values for detection
const VALID_ITEM_TYPES = new Set([
  "assembly", "base_cabinet", "upper_cabinet", "tall_cabinet", "countertop",
  "decorative_panel", "trim", "channel", "rubber_base", "substrate",
  "concealed_hinge", "piano_hinge", "grommet", "adjustable_shelf", "fixed_shelf",
  "cpu_shelf", "drawer", "file_drawer", "trash_drawer", "rollout_basket",
  "conduit", "j_box", "equipment_cutout", "safe_cabinet", "controls_cabinet",
  "end_panel", "corner_guard", "corner_detail", "stainless_panel", "hanger_support",
  "scope_exclusion",
]);

function sanitizeToon(toon: string): string {
  const lines = toon.split("\n");
  const sanitized: string[] = [];
  const expectedCols = MW_ITEM_SCHEMA_V14.length;
  
  for (const line of lines) {
    if (line.startsWith("#TOON") || !line.trim()) {
      sanitized.push(line);
      continue;
    }
    
    const fields = line.split(";");
    
    // Fix 1: Too many semicolons — merge excess into description
    if (fields.length > expectedCols) {
      const descIdx = 2;
      const excess = fields.length - expectedCols;
      const mergedDesc = fields.slice(descIdx, descIdx + excess + 1).join(" - ");
      const fixedFields = [
        ...fields.slice(0, descIdx),
        mergedDesc,
        ...fields.slice(descIdx + excess + 1)
      ];
      sanitized.push(fixedFields.join(";"));
      continue;
    }
    
    // Fix 2: Comma-embedded TOON data in description field
    // Pattern: description contains "roomName,qty,,..." which is TOON-like comma data
    // Detect: description field has 5+ commas with patterns like ",EA," or ",1," or ",extracted,"
    if (fields.length === expectedCols) {
      const descField = fields[2] || "";
      const commaCount = (descField.match(/,/g) || []).length;
      if (commaCount >= 5 && /,(EA|LS|SF|LF),|,\d+,|,extracted,|,calculated,/i.test(descField)) {
        // The description has embedded TOON data after the real description
        // Extract just the first part (before the first occurrence of the room name or comma-separated data pattern)
        const cleanDesc = descField.replace(/[,](?:Service Manager|Reception Desk|Team Members|Kids Club|Team Room|Unclassified|Retail Display|Laundry|Janitor|Pool Area|Mens Vanity|Womens Vanity|Building Wide)[,].*/i, "").trim();
        fields[2] = cleanDesc;
        sanitized.push(fields.join(";"));
        continue;
      }
    }
    
    sanitized.push(line);
  }
  
  return sanitized.join("\n");
}

// ─── Row Cleanup ─────────────────────────────────────────────
// v14.3.1: Robust column repair
//
// Handles:
// 1. Column shift: description in item_type, item_type in room, etc.
// 2. Confidence/notes swap
// 3. Garbage row filtering
// 4. Description sanitization

function cleanupRows(rows: any[]): any[] {
  return rows.map(row => {
    const itemType = (row.item_type || "").trim();
    
    // Pattern D: Room name is a unit value (EA, LF, SF, LOT) — entire row is garbled
    // These rows are unsalvageable, mark for filtering
    if (/^(EA|LF|SF|LOT|LS)$/i.test((row.room || "").trim())) {
      row._garbled = true;
      return row;
    }
    
    if (itemType && !VALID_ITEM_TYPES.has(itemType)) {
      
      // Pattern A: section_id has a valid item_type — fields shifted right by 2
      if (row.section_id && VALID_ITEM_TYPES.has(row.section_id.trim())) {
        const realItemType = row.section_id.trim();
        const realDesc = itemType;
        const realUnit = row.qty;
        const realWidth = row.unit;
        const realDepth = row.width_mm;
        
        row.description = realDesc;
        row.item_type = realItemType;
        row.section_id = "";
        row.qty = realUnit === "EA" || realUnit === "LS" || realUnit === "LOT" || realUnit === "SF" || realUnit === "LF" ? 1 : (parseInt(realUnit) || 1);
        row.unit = typeof row.qty === "string" && /^(EA|LS|LOT|SF|LF)$/i.test(row.qty) ? row.qty : "EA";
        if (realWidth && !isNaN(Number(realWidth))) row.width_mm = Number(realWidth);
        if (realDepth && !isNaN(Number(realDepth))) row.depth_mm = Number(realDepth);
      }
      // Pattern C: item_type equals the room name (LLM repeated room name across fields)
      // section_id has the real description
      else if (itemType === row.room && row.section_id && row.section_id.length > 2) {
        const realDesc = row.section_id;
        const realWidth = row.qty;
        const realMaterial = row.depth_mm;
        
        // Infer item_type from the description
        const descLower = realDesc.toLowerCase();
        let inferredType = "assembly";
        if (/counter/i.test(descLower)) inferredType = "countertop";
        else if (/panel|3form|frp/i.test(descLower)) inferredType = "decorative_panel";
        else if (/adjust.*shelf/i.test(descLower)) inferredType = "adjustable_shelf";
        else if (/shelf|cpu/i.test(descLower)) inferredType = "fixed_shelf";
        else if (/rubber.*base|base.*rubber/i.test(descLower)) inferredType = "rubber_base";
        else if (/channel/i.test(descLower)) inferredType = "channel";
        else if (/trim|aluminum.*trim/i.test(descLower)) inferredType = "trim";
        else if (/substrate|plywood.*sub/i.test(descLower)) inferredType = "substrate";
        else if (/j.?box|junction/i.test(descLower)) inferredType = "j_box";
        else if (/conduit/i.test(descLower)) inferredType = "conduit";
        else if (/grommet/i.test(descLower)) inferredType = "grommet";
        else if (/hinge/i.test(descLower)) inferredType = "piano_hinge";
        else if (/cabinet|drawer/i.test(descLower)) inferredType = "base_cabinet";
        else if (/assembly/i.test(descLower)) inferredType = "assembly";
        else if (/shower.*rod|rod/i.test(descLower)) inferredType = "scope_exclusion";
        else if (/printer|monitor|cctv|telephone|terminal|pos\b|scanner/i.test(descLower)) inferredType = "scope_exclusion";
        
        row.item_type = inferredType;
        row.description = realDesc;
        row.section_id = "";
        
        // Parse width from qty if it's a plausible dimension
        if (realWidth && !isNaN(Number(realWidth)) && Number(realWidth) > 10) {
          row.width_mm = Number(realWidth);
        }
        row.qty = 1;
        row.unit = "EA";
        
        // Material in depth_mm
        if (realMaterial && typeof realMaterial === "string" && isNaN(Number(realMaterial))) {
          row.material = realMaterial;
          row.depth_mm = "";
        }
      }
      // Pattern B: infer type from keywords
      else {
        const desc = (row.description || "").trim();
        if (VALID_ITEM_TYPES.has(desc)) {
          row.description = itemType;
          row.item_type = desc;
        } else {
          const combined = `${itemType} ${desc}`.toLowerCase();
          if (/rubber.*base|floor.*base/i.test(combined)) row.item_type = "rubber_base";
          else if (/adjustable.*shelf/i.test(combined)) row.item_type = "adjustable_shelf";
          else if (/\bshelf\b|cpu.*shelf/i.test(combined)) row.item_type = "fixed_shelf";
          else if (/channel/i.test(combined)) row.item_type = "channel";
          else if (/j.?box/i.test(combined)) row.item_type = "j_box";
          else if (/panel|3form|frp/i.test(combined)) row.item_type = "decorative_panel";
          else if (/grommet/i.test(combined)) row.item_type = "grommet";
          else if (/hinge/i.test(combined)) row.item_type = "piano_hinge";
          else if (/conduit/i.test(combined)) row.item_type = "conduit";
          else if (/trim/i.test(combined)) row.item_type = "trim";
          else if (/substrate|plywood/i.test(combined)) row.item_type = "substrate";
          else if (/counter/i.test(combined)) row.item_type = "countertop";
          else if (/locker|cabinet/i.test(combined)) row.item_type = "base_cabinet";
          
          if (desc === row.room || !desc) {
            row.description = itemType;
          }
        }
      }
    }
    
    // Fix confidence/notes swap
    const validConfidence = ["high", "medium", "low"];
    if (row.notes && validConfidence.includes(row.notes.toLowerCase()) && !validConfidence.includes((row.confidence || "").toLowerCase())) {
      const tmp = row.confidence;
      row.confidence = row.notes;
      row.notes = tmp || "";
    }
    
    // Clean "extracted" from dimension fields — it's a dim_source value that leaked
    for (const dimField of ["width_mm", "depth_mm", "height_mm"]) {
      if (row[dimField] === "extracted" || row[dimField] === "calculated" || row[dimField] === "unknown") {
        row[dimField] = "";
      }
    }
    
    // Clean description of any remaining semicolons or commas with TOON patterns
    if (row.description) {
      row.description = row.description
        .replace(/;/g, ",")
        .replace(/,(?:Service Manager|Reception Desk|Team Members|Kids Club|Team Room|Unclassified|Retail Display|Laundry|Janitor|Pool Area|Mens Vanity|Womens Vanity|Building Wide),\d.*/i, "")
        .trim();
    }
    
    return row;
  }).filter(row => {
    // Remove garbled rows (Pattern D)
    if (row._garbled) return false;
    // Must have a description or item_type
    if (!row.description && !row.item_type) return false;
    // Description shouldn't be a single word that looks like a column value
    if (row.description && /^(EA|LS|SF|LF|extracted|calculated|unknown|high|medium|low)$/i.test(row.description.trim())) return false;
    return true;
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
        console.log(`[v14.3.3] Rate limited, waiting ${wait/1000}s...`);
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
      console.log(`[v14.3.3] Analyze: ${pages.length} pages, ${rooms.length} rooms, ${ctx.materialLegend.length} materials`);
      for (const r of rooms) {
        console.log(`  ${r.roomName}: pages ${r.pageNums.join(",")}`);
      }

      return res.status(200).json({
        ok: true, version: "v14.3.3", mode: "analyze",
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
      ok: true, version: "v14.3.3", mode: "extract",
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
    console.error("[v14.3.3] error:", err?.message);
    return res.status(500).json({ ok: false, version: "v14.3.3", error: err?.message || "Unknown error" });
  }
}
