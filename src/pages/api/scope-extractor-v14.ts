// src/pages/api/scope-extractor-v14.ts
// V14.2 Scope Extractor — Multi-Page Pipeline
//
// NEW in v14.2:
// - Accepts multi-page text with page boundaries
// - Pass 1: Extracts project-level context (material legends, hardware groups, general notes)
// - Pass 2: Groups pages by room/assembly using title block detection
// - Pass 3: Runs v14.1 extraction per room group with shared context
// - Merges all rooms into unified response

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA_V14 } from "@/lib/toonSchemas";
import { preprocess, type PreprocessResult } from "@/lib/parser/preprocess";
import { postprocess } from "@/lib/parser/postprocess";

// ─── Config ──────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";
const HEADER_V14 = `#TOON v=1 sep=; cols=${MW_ITEM_SCHEMA_V14.join(",")}`;

// ─── Types ───────────────────────────────────────────────────────

interface PageText {
  pageNum: number;
  text: string;
}

interface RoomGroup {
  roomName: string;
  roomId: string;
  pages: PageText[];
  combinedText: string;
}

interface MaterialLegendEntry {
  code: string;
  manufacturer: string;
  productName: string;
  catalogNumber: string;
  category: string; // laminate, solid_surface, specialty, etc.
}

interface ProjectContext {
  materialLegend: MaterialLegendEntry[];
  hardwareGroups: Record<string, string[]>;
  generalNotes: string[];
  documentType: "bid_set" | "shop_drawing" | "submittal" | "unknown";
}

// ─── Pass 1: Project Context Extraction ──────────────────────────

function extractProjectContext(pages: PageText[]): ProjectContext {
  const allText = pages.map(p => p.text).join("\n");
  
  const context: ProjectContext = {
    materialLegend: [],
    hardwareGroups: {},
    generalNotes: [],
    documentType: "unknown",
  };

  // Detect document type
  if (/Finish Material Selections|Revised Submittals/i.test(allText)) {
    context.documentType = "shop_drawing";
  } else if (/Bid Set|For Bidding/i.test(allText)) {
    context.documentType = "bid_set";
  } else if (/Submittal|Shop Drawing/i.test(allText)) {
    context.documentType = "submittal";
  }

  // Extract material legend
  // Pattern: "PL-1 ; Wilsonart 'Studio Teak' 7960K-18"
  // Also handles: "SS-1B ; Zodiaq 'Coarse Marfil'"
  // And: "3F-1 ; 3Form 'Chroma Vapor' 1""
  const legendBlock = allText.match(
    /Finish Material Selections[;:\s]*([\s\S]*?)(?=\n\n|\d+\s+\d+\s+\d+|---)/i
  );
  
  if (legendBlock) {
    const text = legendBlock[1];
    
    // Parse entries like: PL-1 ; Wilsonart 'Studio Teak' 7960K-18
    const entryRe = /((?:PL|SS|FB|3F|WD|GL|RB|MEL|ALM|WC|RB)-?\d*[A-Z]?)\s*[;:]\s*(\w[\w\s]*?)\s*[''']([^''']+)[''']\s*(\S+)?/gi;
    let m;
    while ((m = entryRe.exec(text)) !== null) {
      const code = m[1].trim();
      const mfr = m[2].trim();
      const product = m[3].trim();
      const catalog = (m[4] || "").trim();
      
      let category = "unknown";
      if (/^PL/i.test(code)) category = "laminate";
      else if (/^SS/i.test(code)) category = "solid_surface";
      else if (/^3F/i.test(code)) category = "specialty";
      else if (/^FB/i.test(code)) category = "blocking";
      else if (/^MEL/i.test(code)) category = "melamine";
      else if (/^WC/i.test(code)) category = "wall_covering";
      else if (/^RB/i.test(code)) category = "rubber_base";
      
      context.materialLegend.push({ code, manufacturer: mfr, productName: product, catalogNumber: catalog, category });
    }
  }

  // Extract hardware groups
  // Pattern: "Group 3 Hardware" followed by specs
  const hwGroupRe = /Group\s+(\d+)\s+Hardware[:\s]*([\s\S]*?)(?=Group\s+\d|$)/gi;
  let hm;
  while ((hm = hwGroupRe.exec(allText)) !== null) {
    const groupNum = hm[1];
    const specs = hm[2].split(/[;\n]/).map(s => s.trim()).filter(Boolean);
    context.hardwareGroups[`Group ${groupNum}`] = specs;
  }

  // Extract general notes
  const notesRe = /GENERAL NOTES[:\s]*([\s\S]*?)(?=\n\n\n|---|\f)/gi;
  let nm;
  while ((nm = notesRe.exec(allText)) !== null) {
    const notes = nm[1].split(/\n/).map(s => s.trim()).filter(s => s.length > 5);
    context.generalNotes.push(...notes);
  }

  return context;
}

// ─── Pass 2: Page Grouping by Room ───────────────────────────────

function groupPagesByRoom(pages: PageText[]): RoomGroup[] {
  const roomMap = new Map<string, PageText[]>();
  
  // Title block patterns found at bottom of architectural pages
  // "24 H Rece" = Reception Desk, "24 H Serv" = Service Manager, etc.
  const titlePatterns: [RegExp, string][] = [
    [/Rece(?:ption)?(?:\s*Desk)?/i, "Reception Desk"],
    [/Serv(?:ice)?\s*(?:Manager|Mgr)/i, "Service Manager"],
    [/Team\s*Room/i, "Team Room"],
    [/Kid['']?s?\s*Club/i, "Kid's Club"],
    [/Arts?\s*(?:&|and)?\s*Craft/i, "Arts & Crafts"],
    [/Men['']?s?\s*(?:Vanity|Locker|Restroom)/i, "Men's Vanity"],
    [/Wom[ea]n['']?s?\s*(?:Vanity|Locker|Restroom)/i, "Women's Vanity"],
    [/Vani(?:ty)?\s*Detail/i, "Vanity Details"],
    [/Retail/i, "Retail Display"],
    [/Break\s*Room/i, "Break Room"],
    [/Nurse\s*Station/i, "Nurse Station"],
    [/Check[\s-]*(?:In|Out)/i, "Check-In/Out"],
    [/Lobby/i, "Lobby"],
    [/Office/i, "Office"],
    [/Restroom|Bathroom|WC/i, "Restroom"],
    [/Kitchen|Kitchenette/i, "Kitchen"],
    [/Conference/i, "Conference Room"],
    [/Laundry/i, "Laundry"],
    [/Pool\s*(?:Area|Deck)/i, "Pool Area"],
    [/Fitness|Gym|Exercise/i, "Fitness Area"],
  ];

  // Also detect room numbers: "103", "206", "106B", "120", "118"
  const roomNumRe = /(?:Room|Rm\.?)\s*(\d+[A-Z]?)/gi;
  
  for (const page of pages) {
    let roomName = "Unclassified";
    
    // Check title block area (last ~20% of text often has title block)
    const text = page.text;
    const titleArea = text.slice(Math.max(0, text.length - 200));
    
    // Try title patterns on full text (title block may be anywhere in extracted text)
    for (const [pattern, name] of titlePatterns) {
      if (pattern.test(text)) {
        roomName = name;
        
        // Try to find room number too
        const numMatch = text.match(/(\d{2,4}[A-Z]?)\s*$/m);
        if (numMatch && /^\d+[A-Z]?$/.test(numMatch[1])) {
          // Only add room number if it looks reasonable (not a dimension)
          const num = parseInt(numMatch[1]);
          if (num >= 100 && num < 1000) {
            roomName = `${name} ${numMatch[1]}`;
          }
        }
        break;
      }
    }
    
    // Normalize room key
    const roomKey = roomName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    
    if (!roomMap.has(roomKey)) {
      roomMap.set(roomKey, []);
    }
    roomMap.get(roomKey)!.push(page);
  }

  // Build room groups
  const groups: RoomGroup[] = [];
  let roomIdx = 0;
  
  for (const [key, roomPages] of roomMap) {
    roomIdx++;
    const firstPage = roomPages[0];
    
    // Derive room name from the key or first page
    let roomName = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    
    // Check for more specific room name in text
    for (const [pattern, name] of titlePatterns) {
      if (pattern.test(firstPage.text)) {
        roomName = name;
        break;
      }
    }
    
    groups.push({
      roomName,
      roomId: `ROOM-${String(roomIdx).padStart(3, "0")}`,
      pages: roomPages,
      combinedText: roomPages.map(p => `--- PAGE ${p.pageNum} ---\n${p.text}`).join("\n\n"),
    });
  }

  return groups;
}

// ─── System Prompt (enhanced for multi-page + shop drawings) ─────

function buildSystemPrompt(projectContext: ProjectContext): string {
  let prompt = `
You are ScopeExtractor v14.2, an expert architectural millwork estimator
with 40 years of experience reading construction documents for a
C-6 licensed millwork subcontractor.

You will receive:
1. OCR text from MULTIPLE pages of architectural plans for ONE ROOM/ASSEMBLY
2. PRE-EXTRACTED HINTS: dimensions, materials, hardware, equipment tags,
   and assembly detection — all found by regex before you see the text.
3. PROJECT-LEVEL CONTEXT: material legend, hardware groups, and general notes
   that apply across all rooms in the project.

Your job is to produce a TOON-formatted extraction of ALL millwork scope items
for this specific room/assembly.

OUTPUT FORMAT:
- First line MUST be exactly: ${HEADER_V14}
- One line per item, semicolon-separated
- Fields in this exact order: ${MW_ITEM_SCHEMA_V14.join(", ")}

ASSEMBLY RULES:
- If the text describes a single built assembly (e.g., "Reception Desk"),
  create ONE parent row with item_type="assembly" and assembly_id="ASSY-001"
- Then create component rows nested under it using the same assembly_id
- Each distinct cabinet section = separate item with section_id
- The assembly parent row should have the overall dimensions if known

MULTI-PAGE RULES:
- You are seeing ALL pages for this room combined
- Page boundaries are marked with "--- PAGE N ---"
- Dimensions, materials, and hardware may be on different pages — cross-reference
- The same cabinet section may appear in plan view (one page) and section view (another)
  — combine the information, don't create duplicates

ITEM TYPE VALUES:
- assembly (parent record for a built-in structure)
- base_cabinet, upper_cabinet, tall_cabinet
- countertop (with material_code SS-1B, SS-6, etc.)
- decorative_panel (3Form, accent panels)
- trim (aluminum trim, molding)
- channel (aluminum channel)
- rubber_base
- substrate (plywood backing/substrate)
- concealed_hinge, piano_hinge
- grommet
- adjustable_shelf, fixed_shelf, cpu_shelf
- drawer, file_drawer, trash_drawer, rollout_basket
- conduit (when provided by millwork fabricator)
- j_box (flush mount junction box accommodation)
- equipment_cutout (for FA-##, SA-##, PH-## equipment)
- safe_cabinet, controls_cabinet, end_panel
- corner_guard, corner_detail
- stainless_panel
- hanger_support
- scope_exclusion (items explicitly N.I.C. or by others — still list them)

DIMENSION RULES — CRITICAL:
- Use dimensions from the PRE-EXTRACTED HINTS. Match them to items by context.
- Convert all dimensions to millimeters (mm). 1 inch = 25.4 mm.
- NEVER invent or default dimensions.
- If you cannot find a real dimension, leave dim fields EMPTY, set dim_source="unknown".
- For cabinets: width = front face width, depth = front-to-back, height = floor to top
- For countertops: length = run length, width = front-to-back depth
- dim_source values: "extracted" | "calculated" | "unknown"

MATERIAL RULES:
- Use material_code for parsed codes: PL-01, SS-1B, 3FORM-VAPOR, MEL-WHT, etc.
- Use material for free text description: "Plastic Laminate, Vertical Wood Grain"
- Every material mentioned in the hints should appear on at least one item
- Distinguish SS-1B from SS-6 — they are different specs
`.trim();

  // Add shop drawing specific rules if material legend exists
  if (projectContext.documentType === "shop_drawing" || projectContext.materialLegend.length > 0) {
    prompt += `

SHOP DRAWING MODE — ACTIVE (material legend detected):
- This is a SHOP DRAWING / SUBMITTAL, not a bid set
- Resolved material specs are available — use the FULL manufacturer info
- #N detail sections are individual component views with their own dimensions
- Manufacturer part numbers should be extracted (Blum, Rev-A-Shelf, Outwater, etc.)

DETAIL SECTION RULES (#N sections):
- #N patterns are individual shop drawing detail views
- Each #N = a distinct millwork component with specific dims from that section drawing
- Match dimensions to the correct #N section they belong to
- Include the detail number in the detail_ref field

N.I.C. / BY OTHERS HANDLING:
- "FB-1 By Others-Typical" → item_type="scope_exclusion", still extract as line item
- "Supplied By Others" → note as scope_exclusion
- "N.I.C." (Not In Contract) → note as scope_exclusion
- Flag these items — the estimator needs to see them for scope clarification`;
  }

  prompt += `

WHAT TO EXTRACT (comprehensive list):
- Every cabinet, desk section, or casework unit
- Every countertop run (with material code)
- Every decorative panel (3Form, accent, etc.)
- Every trim piece (aluminum, wood, rubber base)
- Every hardware item (hinges, grommets, shelves, slides, pulls)
- Every piece of equipment that requires millwork accommodation
- Every substrate/backing panel
- Every conduit/electrical accommodation by the millwork fabricator
- Overall assembly record if pages describe one built structure
- Scope exclusions (N.I.C. / by others items — still list them)

WHAT NOT TO EXTRACT:
- Items clearly noted as "BY G.C." or "BY OTHERS" (extract as scope_exclusion instead)
- Electrical work (unless conduit is by millwork fabricator)
- Plumbing fixtures (but extract sink cutouts/accommodations)
- Flooring (unless integral to millwork, like toe kick)
- Paint/wall finishes not on millwork

Set confidence to "high" when you have type + dimensions + material,
"medium" when missing one, "low" when missing two or more.`;

  return prompt.trim();
}

// ─── Prompt Builder (with project context) ───────────────────────

function buildUserPrompt(
  roomGroup: RoomGroup,
  hints: PreprocessResult,
  projectContext: ProjectContext,
  projectId?: string,
): string {
  const parts: string[] = [];

  parts.push(`Project: ${projectId || "(unspecified)"}`);
  parts.push(`Room: ${roomGroup.roomName} (${roomGroup.roomId})`);
  parts.push(`Pages: ${roomGroup.pages.map(p => p.pageNum).join(", ")}`);
  parts.push(`Document Type: ${projectContext.documentType}`);
  parts.push(`Millwork Signal Strength: ${(hints.millworkSignalStrength * 100).toFixed(0)}%`);
  parts.push("");

  // Project-level material legend
  if (projectContext.materialLegend.length > 0) {
    parts.push("## PROJECT MATERIAL LEGEND (resolved from finish schedule)");
    for (const m of projectContext.materialLegend) {
      parts.push(`  ${m.code}: ${m.manufacturer} '${m.productName}' ${m.catalogNumber} [${m.category}]`);
    }
    parts.push("");
  }

  // Hardware groups
  if (Object.keys(projectContext.hardwareGroups).length > 0) {
    parts.push("## HARDWARE GROUPS (from hardware schedule)");
    for (const [group, specs] of Object.entries(projectContext.hardwareGroups)) {
      parts.push(`  ${group}: ${specs.join("; ")}`);
    }
    parts.push("");
  }

  // General notes
  if (projectContext.generalNotes.length > 0) {
    parts.push("## GENERAL NOTES (apply to all rooms)");
    for (const note of projectContext.generalNotes.slice(0, 10)) {
      parts.push(`  • ${note}`);
    }
    parts.push("");
  }

  // Assembly context
  if (hints.assembly) {
    parts.push("## ASSEMBLY DETECTED");
    parts.push(`This room contains a built assembly: "${hints.assembly.name}"`);
    parts.push(`Type: ${hints.assembly.type}`);
    parts.push(`Title occurrences: ${hints.assembly.titleOccurrences}`);
    parts.push(`Detail views: ${hints.assembly.detailCount}`);
    if (hints.assembly.sections.length > 0) {
      parts.push(`Sections found: ${hints.assembly.sections.join(", ")}`);
    }
    parts.push(`→ Create assembly_id="ASSY-001" and nest ALL components under it.`);
    parts.push("");
  }

  // Pre-extracted dimensions
  parts.push(`## PRE-EXTRACTED DIMENSIONS (${hints.dimensions.length} found)`);
  if (hints.dimensions.length === 0) {
    parts.push("(none found — leave dimension fields empty, set dim_source=unknown)");
  } else {
    const dimsByLine = new Map<number, typeof hints.dimensions>();
    for (const d of hints.dimensions) {
      if (!dimsByLine.has(d.line)) dimsByLine.set(d.line, []);
      dimsByLine.get(d.line)!.push(d);
    }
    for (const [, dims] of dimsByLine) {
      for (const d of dims) {
        parts.push(`  Line ${d.line}: ${d.raw} = ${d.inches}" = ${d.mm}mm | "${d.context}"`);
      }
    }
  }
  parts.push("");

  // Pre-extracted materials
  parts.push(`## PRE-EXTRACTED MATERIALS (${hints.materials.length} found)`);
  for (const m of hints.materials) {
    // Enrich with legend if available
    const legendEntry = projectContext.materialLegend.find(l => l.code === m.code);
    if (legendEntry) {
      parts.push(`  ${m.code}: ${legendEntry.manufacturer} '${legendEntry.productName}' ${legendEntry.catalogNumber} [${m.category}]`);
    } else {
      parts.push(`  ${m.code}: ${m.fullName} [${m.category}]`);
    }
  }
  parts.push("");

  // Pre-extracted hardware
  parts.push(`## PRE-EXTRACTED HARDWARE (${hints.hardware.length} found)`);
  for (const h of hints.hardware) {
    parts.push(`  ${h.type}: qty=${h.qty}${h.size ? `, size=${h.size}` : ""}${h.spec ? `, spec="${h.spec}"` : ""}`);
  }
  parts.push("");

  // Equipment tags
  if (hints.equipment.length > 0) {
    parts.push(`## EQUIPMENT TAGS (${hints.equipment.length} found)`);
    for (const e of hints.equipment) {
      parts.push(`  ${e.tag}${e.description ? `: ${e.description}` : ""}`);
    }
    parts.push("");
  }

  // Detail references
  if (hints.detailRefs.length > 0) {
    parts.push(`## DETAIL REFERENCES (${hints.detailRefs.length} found)`);
    for (const d of hints.detailRefs) {
      parts.push(`  Detail ${d.detailNum}${d.sheet ? ` / ${d.sheet}` : ""}${d.title ? ` — ${d.title}` : ""}`);
    }
    parts.push("");
  }

  // The OCR text (all pages for this room)
  parts.push("## OCR TEXT (all pages for this room)");
  parts.push('"""');
  parts.push(roomGroup.combinedText);
  parts.push('"""');
  parts.push("");
  parts.push(`Output ONLY valid TOON with this exact header:`);
  parts.push(HEADER_V14);

  return parts.join("\n");
}

// ─── LLM Call (with rate limit retry) ────────────────────────────

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        temperature: 0.05,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = message.content.find((b: any) => b.type === "text");
      return textBlock?.text?.trim() ?? "";
    } catch (err: any) {
      const status = err?.status || err?.error?.status;
      const isRateLimit = status === 429 || err?.error?.type === "rate_limit_error";

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 15s, 30s, 60s
        const waitMs = 15000 * Math.pow(2, attempt);
        console.log(`[v14.2] Rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded for Anthropic API");
}

// ─── Parse Pages from Text ───────────────────────────────────────

function parsePages(text: string): PageText[] {
  // Split on page break markers inserted by client-side pdf.js
  const parts = text.split(/---\s*PAGE\s*(?:BREAK|(\d+))\s*---/i);
  const pages: PageText[] = [];
  
  if (parts.length <= 1) {
    // No page markers — treat as single page
    return [{ pageNum: 1, text: text.trim() }];
  }

  let pageNum = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]?.trim();
    if (!part) continue;
    
    // Check if this part is a page number from the regex capture
    if (/^\d+$/.test(part)) {
      pageNum = parseInt(part);
      continue;
    }
    
    // This is page content
    if (part.length > 5) {
      pageNum++;
      pages.push({ pageNum, text: part });
    }
  }

  return pages;
}

// ─── Main Handler ────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const { text, projectId, sheetRef } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY in environment.",
    });
  }

  try {
    const t0 = Date.now();

    // ── PASS 1: Parse pages & extract project context ──
    const pages = parsePages(text);
    const projectContext = extractProjectContext(pages);
    
    // ── PASS 2: Group pages by room ──
    const roomGroups = groupPagesByRoom(pages);
    
    const pass1Ms = Date.now() - t0;

    // ── PASS 3: Extract each room ──
    const systemPrompt = buildSystemPrompt(projectContext);
    const allRows: any[] = [];
    const allAssemblies: any[] = [];
    const allWarnings: string[] = [];
    const roomResults: any[] = [];
    let totalLlmMs = 0;
    let totalPostMs = 0;

    for (let ri = 0; ri < roomGroups.length; ri++) {
      const room = roomGroups[ri];

      // Rate limit protection: wait between rooms (skip first)
      if (ri > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5s between rooms
      }

      // Pre-process combined text for this room
      const tPre = Date.now();
      const hints = preprocess(room.combinedText, sheetRef);
      const preMs = Date.now() - tPre;

      // Build prompt with project context — truncate if too large
      let userPrompt = buildUserPrompt(room, hints, projectContext, projectId);

      // Cap prompt at ~20K chars to stay under token limits
      if (userPrompt.length > 20000) {
        // Trim the OCR text section, keep hints and context
        const ocrStart = userPrompt.indexOf('## OCR TEXT');
        if (ocrStart > 0) {
          const beforeOcr = userPrompt.substring(0, ocrStart);
          const ocrSection = userPrompt.substring(ocrStart);
          const truncatedOcr = ocrSection.substring(0, 20000 - beforeOcr.length) + '\n"""\n\n[TRUNCATED — text exceeded token budget]\n\nOutput ONLY valid TOON with this exact header:\n' + HEADER_V14;
          userPrompt = beforeOcr + truncatedOcr;
        }
      }

      // LLM extraction
      const tLlm = Date.now();
      let toon = await callAnthropic(systemPrompt, userPrompt);
      const llmMs = Date.now() - tLlm;
      totalLlmMs += llmMs;

      // Validate TOON
      if (!isValidToon(toon, HEADER_V14)) {
        const fenceMatch = toon.match(/```(?:toon|csv|text)?\s*\n?(#TOON[\s\S]*?)```/);
        if (fenceMatch) toon = fenceMatch[1].trim();
      }

      if (!isValidToon(toon, HEADER_V14)) {
        allWarnings.push(`[${room.roomName}] LLM did not return valid TOON — skipped`);
        roomResults.push({
          room: room.roomName,
          roomId: room.roomId,
          pages: room.pages.map(p => p.pageNum),
          status: "failed",
          error: "Invalid TOON output",
        });
        continue;
      }

      // Decode & post-process
      const rawRows = decodeToon(toon);
      const tPost = Date.now();
      const result = postprocess(rawRows);
      const postMs = Date.now() - tPost;
      totalPostMs += postMs;

      // Tag each row with room info
      for (const row of result.rows) {
        row.room = row.room || room.roomName;
      }

      allRows.push(...result.rows);
      allAssemblies.push(...result.assemblies);
      allWarnings.push(...result.warnings.map((w: string) => `[${room.roomName}] ${w}`));

      roomResults.push({
        room: room.roomName,
        roomId: room.roomId,
        pages: room.pages.map(p => p.pageNum),
        status: "ok",
        itemCount: result.rows.length,
        assemblyCount: result.assemblies.length,
        timing: { preMs, llmMs, postMs },
        hints: {
          dimensionCount: hints.dimensions.length,
          materialCount: hints.materials.length,
          hardwareCount: hints.hardware.length,
          assembly: hints.assembly,
        },
      });
    }

    const totalMs = Date.now() - t0;

    // ── Build unified stats ──
    const stats = {
      totalItems: allRows.length,
      withDimensions: allRows.filter((r: any) => r.width_mm || r.length_mm || r.height_mm).length,
      withMaterials: allRows.filter((r: any) => r.material_code || r.material).length,
      withHardware: allRows.filter((r: any) => r.hardware_type || r.hardware_spec).length,
      flaggedDefaults: allRows.filter((r: any) => r.dim_source === "default_FLAGGED").length,
      duplicatesRemoved: 0, // TODO: cross-room dedup
      roomCount: roomGroups.length,
      pageCount: pages.length,
      documentType: projectContext.documentType,
      materialLegendCount: projectContext.materialLegend.length,
    };

    return res.status(200).json({
      ok: true,
      version: "v14.2",
      projectId: projectId || null,
      sheetRef: sheetRef || null,
      model: MODEL,

      // Extraction results
      rows: allRows,
      assemblies: allAssemblies,

      // Project context
      projectContext: {
        documentType: projectContext.documentType,
        materialLegend: projectContext.materialLegend,
        hardwareGroups: projectContext.hardwareGroups,
        generalNoteCount: projectContext.generalNotes.length,
      },

      // Per-room results
      rooms: roomResults,

      // Stats
      stats,
      warnings: allWarnings,

      // Performance
      timing: {
        pass1Ms: pass1Ms,
        llmMs: totalLlmMs,
        postprocessMs: totalPostMs,
        totalMs,
      },
    });
  } catch (err: any) {
    console.error("[ScopeExtractor v14.2] error:", err?.message);
    return res.status(500).json({
      ok: false,
      version: "v14.2",
      error: err?.message || "scope-extractor-v14.2 failed",
    });
  }
}
