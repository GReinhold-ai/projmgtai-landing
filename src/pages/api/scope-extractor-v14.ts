// src/pages/api/scope-extractor-v14.ts
// V14.2 Scope Extractor — Client-Driven Multi-Room Pipeline
//
// Architecture change: Instead of processing all rooms server-side,
// the API now handles ONE room per call. The client orchestrates:
//   Call 1: mode="analyze" → returns page groupings + project context
//   Call 2+: mode="extract" → extracts one room at a time
// This stays under both Vercel 60s timeout and Anthropic 30K tok/min rate limit.

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA_V14 } from "@/lib/toonSchemas";
import { preprocess } from "@/lib/parser/preprocess";
import { postprocess } from "@/lib/parser/postprocess";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-20250514";
const HEADER_V14 = `#TOON v=1 sep=; cols=${MW_ITEM_SCHEMA_V14.join(",")}`;

// ─── Types ───────────────────────────────────────────────────────

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

// ─── Parse Pages ─────────────────────────────────────────────────

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

// ─── Project Context Extraction ──────────────────────────────────

function extractProjectContext(pages: PageText[]): ProjectContext {
  const allText = pages.map(p => p.text).join("\n");
  const context: ProjectContext = {
    materialLegend: [], hardwareGroups: {}, generalNotes: [],
    documentType: "unknown",
  };

  if (/Finish Material Selections|Revised Submittals/i.test(allText)) context.documentType = "shop_drawing";
  else if (/Bid Set|For Bidding/i.test(allText)) context.documentType = "bid_set";
  else if (/Submittal|Shop Drawing/i.test(allText)) context.documentType = "submittal";

  const legendBlock = allText.match(/Finish Material Selections[;:\s]*([\s\S]*?)(?=\n\n|\d+\s+\d+\s+\d+|---)/i);
  if (legendBlock) {
    const entryRe = /((?:PL|SS|FB|3F|WD|GL|RB|MEL|ALM|WC)-?\d*[A-Z]?)\s*[;:]\s*(\w[\w\s]*?)\s*['''"]([^'''"]+)['''"]?\s*(\S+)?/gi;
    let m;
    while ((m = entryRe.exec(legendBlock[1])) !== null) {
      let category = "unknown";
      const code = m[1].trim();
      if (/^PL/i.test(code)) category = "laminate";
      else if (/^SS/i.test(code)) category = "solid_surface";
      else if (/^3F/i.test(code)) category = "specialty";
      else if (/^FB/i.test(code)) category = "blocking";
      context.materialLegend.push({
        code, manufacturer: m[2].trim(), productName: m[3].trim(),
        catalogNumber: (m[4] || "").trim(), category,
      });
    }
  }

  const hwGroupRe = /Group\s+(\d+)\s+Hardware[:\s]*([\s\S]*?)(?=Group\s+\d|$)/gi;
  let hm;
  while ((hm = hwGroupRe.exec(allText)) !== null) {
    context.hardwareGroups[`Group ${hm[1]}`] = hm[2].split(/[;\n]/).map(s => s.trim()).filter(Boolean);
  }

  return context;
}

// ─── Page Grouping ───────────────────────────────────────────────

function groupPagesByRoom(pages: PageText[]): RoomInfo[] {
  const titlePatterns: [RegExp, string][] = [
    [/Rece(?:ption)?(?:\s*Desk)?/i, "Reception Desk"],
    [/Serv(?:ice)?\s*(?:Manager|Mgr)/i, "Service Manager"],
    [/Team\s*Room/i, "Team Room"],
    [/Kid['']?s?\s*Club/i, "Kids Club"],
    [/Arts?\s*(?:&|and)?\s*Craft/i, "Arts & Crafts"],
    [/Men['']?s?\s*(?:Vanity|Locker|Restroom)/i, "Mens Vanity"],
    [/Wom[ea]n['']?s?\s*(?:Vanity|Locker|Restroom)/i, "Womens Vanity"],
    [/Vani(?:ty)?\s*Detail/i, "Vanity Details"],
    [/Retail/i, "Retail Display"],
    [/Break\s*Room/i, "Break Room"],
    [/Nurse\s*Station/i, "Nurse Station"],
    [/Check[\s-]*(?:In|Out)/i, "Check-In-Out"],
    [/Lobby/i, "Lobby"],
    [/Conference/i, "Conference Room"],
    [/Kitchen/i, "Kitchen"],
    [/Laundry/i, "Laundry"],
  ];

  const roomMap = new Map<string, number[]>();

  for (const page of pages) {
    let roomName = "Unclassified";
    for (const [pattern, name] of titlePatterns) {
      if (pattern.test(page.text)) { roomName = name; break; }
    }
    const key = roomName;
    if (!roomMap.has(key)) roomMap.set(key, []);
    roomMap.get(key)!.push(page.pageNum);
  }

  const rooms: RoomInfo[] = [];
  let idx = 0;
  for (const [name, pageNums] of roomMap) {
    idx++;
    rooms.push({ roomName: name, roomId: `ROOM-${String(idx).padStart(3, "0")}`, pageNums });
  }
  return rooms;
}

// ─── System Prompt ───────────────────────────────────────────────

function buildSystemPrompt(ctx: ProjectContext): string {
  let p = `
You are ScopeExtractor v14.2, an expert architectural millwork estimator
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
- Convert to mm. NEVER invent dimensions. Leave empty if unknown.
- dim_source: "extracted" | "calculated" | "unknown"

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

Set confidence: "high" = type+dims+material, "medium" = missing one, "low" = missing two+.`;
  return p;
}

// ─── User Prompt Builder ─────────────────────────────────────────

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
  for (const d of hints.dimensions.slice(0, 80)) {
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

  // Truncate OCR text to ~12K chars to stay under token budget
  let ocrText = roomText;
  if (ocrText.length > 12000) {
    ocrText = ocrText.substring(0, 12000) + "\n[TRUNCATED]";
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

// ─── LLM Call with Retry ─────────────────────────────────────────

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
        console.log(`[v14.2] Rate limited, waiting ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Handler ─────────────────────────────────────────────────────

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
    // ══════════════════════════════════════════════════════════════
    // MODE: "analyze" — Parse pages, group rooms, extract context
    // Returns room list + context for client to drive extraction
    // ══════════════════════════════════════════════════════════════
    if (mode === "analyze") {
      const t0 = Date.now();
      const pages = parsePages(text);
      const ctx = extractProjectContext(pages);
      const rooms = groupPagesByRoom(pages);

      return res.status(200).json({
        ok: true, version: "v14.2", mode: "analyze",
        projectContext: ctx,
        rooms: rooms,
        pageCount: pages.length,
        timing: { analyzeMs: Date.now() - t0 },
      });
    }

    // ══════════════════════════════════════════════════════════════
    // MODE: "extract" (or default) — Extract ONE room
    // Client sends: roomPages (page numbers), projectContext
    // ══════════════════════════════════════════════════════════════
    const t0 = Date.now();
    const pages = parsePages(text);

    // If client sent specific page numbers for a room, filter
    let roomPageTexts = pages;
    let roomName = "Unclassified";

    if (roomPages && Array.isArray(roomPages) && roomPages.length > 0) {
      const pageSet = new Set(roomPages as number[]);
      roomPageTexts = pages.filter(p => pageSet.has(p.pageNum));
      // Derive room name from the request
      roomName = req.body.roomName || "Room";
    }

    const combinedText = roomPageTexts.map(p => `--- PAGE ${p.pageNum} ---\n${p.text}`).join("\n\n");

    // Use client-provided context or extract fresh
    const ctx: ProjectContext = clientCtx || extractProjectContext(pages);

    // Pre-process
    const hints = preprocess(combinedText, sheetRef);

    // Build prompts
    const systemPrompt = buildSystemPrompt(ctx);
    const userPrompt = buildUserPrompt(combinedText, roomName, hints, ctx, projectId);

    // LLM extraction
    const tLlm = Date.now();
    let toon = await callAnthropic(systemPrompt, userPrompt);
    const llmMs = Date.now() - tLlm;

    // Validate TOON
    if (!isValidToon(toon, HEADER_V14)) {
      const fence = toon.match(/```(?:toon|csv|text)?\s*\n?(#TOON[\s\S]*?)```/);
      if (fence) toon = fence[1].trim();
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

    for (const row of result.rows) { row.room = row.room || roomName; }

    return res.status(200).json({
      ok: true, version: "v14.2", mode: "extract",
      model: MODEL, room: roomName,
      projectId: projectId || null,
      toon, rows: result.rows, assemblies: result.assemblies,
      stats: result.stats, warnings: result.warnings,
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
    console.error("[v14.2] error:", err?.message);
    return res.status(500).json({ ok: false, version: "v14.2", error: err?.message || "Unknown error" });
  }
}
