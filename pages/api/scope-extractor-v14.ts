// src/pages/api/scope-extractor-v14.ts
// V14.4.1 Scope Extractor — Client-Driven Multi-Room Pipeline with Vision
//
// v14.8.1: Image-page detection + vision extraction for scanned drawings
// v14.8.1: Multi-detail page splitting, Retail Trellis room+type
// v14.3.1 FIXES (on top of v14.3):
//   - TOON sanitization: detect comma-embedded TOON data in descriptions
//   - Column shift repair: detect description in item_type field, re-map columns
//   - Clean "extracted" from dimension fields
//   - Infer item_type from description keywords when LLM outputs non-standard type
//
// v14.3 FIXES:

import type { NextApiRequest, NextApiResponse } from "next";

// Increase body size limit for base64 page images
export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } },
};
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

import Anthropic from "@anthropic-ai/sdk";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA_V14 } from "@/lib/toonSchemas";
import { preprocess } from "@/lib/parser/preprocess";
import { postprocess } from "@/lib/parser/postprocess";
import { extractMaterialLegend } from "@/lib/material-schedule";

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
  projectInfo: {
    projectName: string;
    client: string;
    address: string;
    architect: string;
    planSet: string;
    planDate: string;
  };
}

interface RoomInfo {
  roomName: string; roomId: string;
  pageNums: number[];
}

// ─── Parse Pages ─────────────────────────────────────────────

function parsePages(text: string): PageText[] {
  const parts = text.split(/---\s*PAGE\s*(?:BREAK|(\d+))(?:\s*\[[^\]]*\])?\s*---/i);
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

async function extractProjectContext(pages: PageText[]): Promise<ProjectContext> {
  const allText = pages.map(p => p.text).join("\n");
  const context: ProjectContext = {
    materialLegend: [], hardwareGroups: {}, generalNotes: [],
    documentType: "unknown",
    projectInfo: { projectName: "", client: "", address: "", architect: "", planSet: "", planDate: "" },
  };

  // Project info extraction from title blocks
  // Look for common patterns in first few pages
  const titleText = pages.slice(0, 3).map(p => p.text).join("\n");
  
  // Project name: "Project: X" or "PROJECT X" in title block
  const projMatch = titleText.match(/Project[:\s]+([^\n]{3,60})/i);
  if (projMatch) context.projectInfo.projectName = projMatch[1].trim();
  
  // Client/Owner
  const clientMatch = titleText.match(/(?:Owner|Client)[:\s]+([^\n]{3,60})/i);
  if (clientMatch) context.projectInfo.client = clientMatch[1].trim();
  
  // Architect — v14.10.6: require colon after "Architect" (not just whitespace) to avoid
  // matching "ARCHITECTURAL" in legend abbreviations. Validate result is title-case
  // alphabetic content (rejects legend rows like "FINISH CPT  CARPET CH ...").
  const archMatch = allText.match(/Architect\s*[:\-]\s*([A-Z][\w&,\.\s]{2,60})/i)
                  || allText.match(/\b(MACKENZIE|HKS|Gensler|DLR|IPA|MACHADO|HOK|Perkins[\s+&]+Will)\s+([\w&,\.\s]{0,40})/i);
  if (archMatch) {
    const candidate = (archMatch[1] || archMatch[0] || "").trim();
    // Reject if it looks like legend abbrev list (multiple all-caps codes)
    const upperWordCount = (candidate.match(/\b[A-Z]{2,}\b/g) || []).length;
    if (upperWordCount < 4 && candidate.length >= 3) {
      context.projectInfo.architect = candidate.substring(0, 60);
    }
  }
  
  // Address — v14.10.6: require state-abbr + zip code anchor OR explicit "Address:" label.
  // Old regex matched "115 RESTROOM CT" (FS row + Court suffix) - too permissive.
  // Conservative: better to leave Address blank than show finish-schedule garbage.
  const addrMatch =
    // Path A: explicit label prefix
    titleText.match(/(?:Project\s+|Site\s+)?Address\s*[:\-]\s*(\d{1,5}\s+[A-Z][\w\s\.,]{3,80}?(?:\s+[A-Z]{2}\s+\d{5}|\.))/i)
    // Path B: full address with state-abbr + zip code anchor at end
    || titleText.match(/\b(\d{1,5}\s+(?:[NESW]\.?\s+|North\s+|South\s+|East\s+|West\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:Street|Avenue|Boulevard|Road|Drive|Way|Lane|Court|Place|Parkway|Highway|Circle|St|Ave|Blvd|Rd|Dr|Ln|Pl|Pkwy|Hwy|Cir|Ct)\.?(?:[,\s]+[A-Z][\w\s]{1,30})?[,\s]+[A-Z]{2}\s+\d{5})/i);
  if (addrMatch) context.projectInfo.address = addrMatch[1].trim();
  
  // Plan set reference
  const planMatch = allText.match(/(?:BID\s*SET|CONSTRUCTION\s*SET|PERMIT\s*SET|ISSUED\s*FOR)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})?/i);
  if (planMatch) {
    context.projectInfo.planSet = planMatch[0].trim();
    if (planMatch[1]) context.projectInfo.planDate = planMatch[1].trim();
  }
  // Also try "dtd" date pattern
  if (!context.projectInfo.planDate) {
    const dtdMatch = allText.match(/(?:dtd|dated?)\s+(\d{1,2}\s+\w+\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dtdMatch) context.projectInfo.planDate = dtdMatch[1].trim();
  }

  // Document type detection - check for shop drawing indicators first (more specific)
  if (/Finish\s*Material\s*Selections|Revised\s*Submittals|SHOP\s*DRAW/i.test(allText)) {
    context.documentType = "shop_drawing";
  } else if (/Submittal|SUBMITT/i.test(allText)) {
    context.documentType = "submittal";
  } else if (/Bid\s*Set|For\s*Bidding|BID\s*SET/i.test(allText)) {
    context.documentType = "bid_set";
  }

  // Material legend extraction (D1): Haiku-based; honest absence -> [].
  context.materialLegend = await extractMaterialLegend(allText, anthropic);

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
  // ─── Step 0: Page type classification (logging only, no filtering) ───
  // Log page type stats for debugging but don't filter - let the LLM decide
  let millworkCount = 0;
  let specCount = 0;
  for (const p of pages) {
    const t = p.text.toLowerCase();
    const hasMill = /\b(?:cabinet|countertop|shelf|vanit|drawer|WD-?\d|PL-?\d|M-\d|veneer|plywood|millwork|casework|wainscot)/i.test(p.text);
    const hasSpec = /\b(?:general\s*notes|code\s*analysis|ada|accessibility|demolition\s*plan|electrical\s*plan)/i.test(p.text);
    if (hasMill) millworkCount++;
    if (hasSpec && !hasMill) specCount++;
  }
  console.log(`[v14.10.15] Page stats: ${pages.length} total, ${millworkCount} with millwork signals, ${specCount} spec-only`);

  // Room patterns with specificity scores (higher = more specific = wins ties)
  const titlePatterns: [RegExp, string, number][] = [
    // Very specific multi-word patterns (score 10)
    [/Kids?\s*(?:['']s?\s*)?Club/i, "Kids Club", 10],
    [/Arts?\s*(?:&|and|'?n'?)?\s*Crafts?/i, "Arts & Crafts", 10],
    [/Service\s*Manager/i, "Service Manager", 10],
    [/Reception\s*Desk/i, "Reception Desk", 10],
    [/\bFront\s*Desk\b/i, "Reception Desk", 10],                  // v14.10.11: alias - "FRONT DESK 219 SF"
    [/\bRECEPTION\s+\d{3}/, "Reception Desk", 10],                // v14.10.11: floor-plan label "RECEPTION 100"
    [/\b\d{3}[A-Z]?\s+RECEPTION\b/, "Reception Desk", 10],       // v14.10.11: door-schedule label "100A RECEPTION"
    [/\bRECEPTION\s+\d+\s*SF\b/, "Reception Desk", 10],         // v14.10.11: room schedule "RECEPTION 99 SF"

    [/Team\s*(?:Member|Memb)/i, "Team Members", 10],
    [/Team\s*Room/i, "Team Room", 10],
    [/Men['']?s?\s*(?:Vanit|Locker|Restroom)/i, "Mens Vanity", 10],
    [/Wom[ea]n['']?s?\s*(?:Vanit|Locker|Restroom)/i, "Womens Vanity", 10],
    [/Vanit(?:y|ies)\s*Detail/i, "Vanity Details", 10],
    [/Retail\s*(?:Display|Trellis|Area|Ceiling)/i, "Retail Trellis", 10],
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
    
    // Golf/Country Club & Hospitality patterns (score 10)
    [/Lounge\s*(?:Bar|&|Area)/i, "Lounge Bar & Fireplace", 10],
    [/Bar\s*(?:&|and)\s*Fireplace/i, "Lounge Bar & Fireplace", 10],
    [/Fireplace\s*(?:Cabinet|Wall|Surround)/i, "Lounge Bar & Fireplace", 10],
    [/Pre[\s-]*function/i, "Pre-function", 10],
    [/Banquet\s*(?:Room|Hall)?/i, "Banquet Room", 10],
    [/Wine\s*(?:Display|Cabinet|Cellar|Room|Bar)/i, "Wine Display", 10],
    [/Preserve\s*Display/i, "Preserve Display Case", 10],
    [/Display\s*Case/i, "Display Case", 10],
    [/(?:Wood|Slat)\s*Screen/i, "Screen", 10],
    [/Meeting\s*Room/i, "Meeting Room", 10],
    [/Board\s*Room/i, "Board Room", 10],
    [/Pro\s*Shop/i, "Pro Shop", 10],
    [/(?:Men|Women|Unisex)?\s*Locker\s*Room/i, "Locker Room", 10],
    [/Back\s*Bar/i, "Back Bar", 10],
    [/Host(?:ess)?\s*(?:Stand|Station|Desk)/i, "Host Stand", 10],
    [/Coat\s*(?:Room|Check|Closet)/i, "Coat Room", 10],
    [/Pantry/i, "Pantry", 10],
    [/Butler/i, "Butler Pantry", 10],

    // v14.10.15: Score-5 label neutralization per F1 / standing rule 36.
    // Source: May 15 addendum sec 8.5; May 16 Design Process doc Part III F1 + rule 36.
    // Patterns retained so real scope still gets matched. Labels neutralized to
    // "Unclassified" so the LLM sees the page contents without being forced into
    // a 24HF-canonical tab name. The v14.11.1a fix (extracted-room-number
    // preference) will replace these patterns with real-name extraction.
    // Exceptions: Lobby, Lounge, Bar, Fireplace, Wine Display, Banquet Room are
    // generic descriptive labels (not 24HF-canonical) and are kept as-is.
    // Note: Pantry score-10 pattern at line ~273 still leaks until v14.11.1a;
    // this commit only neutralizes the score-5 path.
    [/\bLocker/i, "Unclassified", 5],
    [/\bVanit(?:y|ies)\b/i, "Unclassified", 5],
    [/\bTrellis\b/i, "Unclassified", 5],
    [/\bRetail\b/i, "Unclassified", 5],
    [/\bLobby\b/i, "Lobby", 5],
    [/\bKitchen\b/i, "Unclassified", 5],
    [/\bMirror/i, "Unclassified", 5],
    [/\bUnisex\b/i, "Unclassified", 5],
    [/\bPool\b/i, "Unclassified", 5],
    [/\bFitness\b/i, "Unclassified", 5],
    [/\bStereo\b/i, "Unclassified", 5],
    [/\bAV\s*Equip/i, "Unclassified", 5],
    [/\bLounge\b/i, "Lounge", 5],
    [/\bBar\b(?!\s*(?:code|chart))/i, "Bar", 5],
    [/\bFireplace\b/i, "Fireplace", 5],
    [/\bWine\b/i, "Wine Display", 5],
    [/\bPantry\b/i, "Unclassified", 5],
    [/\bBanquet\b/i, "Banquet Room", 5],
  ];

  // Sheet reference patterns — "T3.12" "A7.15" "A-403" "A-507" etc. in title block
  const sheetRefRe = /([AT]\d+[.\-]\d+)\s*[-–—:]\s*(.+)/gi;

  // Multi-detail detection: pages with multiple "ENLARGED X PLAN" or "X DETAIL" headings
  const detailHeadingRe = /(?:ENLARGED|INTERIOR|CASEWORK|MILLWORK|CABINET)\s+([A-Z][A-Z\s'&/]+?)\s*(?:PLAN|DETAIL|SECTION|ELEVATION|VIEW)/gi;

  // Also detect room names after common architectural prefixes
  const archTitleRe = /(?:INTERIOR\s+ELEVATIONS?|CASEWORK\s+DETAILS?|MILLWORK\s+DETAILS?|ENLARGED\s+PLANS?|FINISH\s+PLANS?)\s*[-–—:]\s*(.+)/gi;

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
    
    // Check for architectural title patterns (INTERIOR ELEVATIONS - LOUNGE BAR, etc.)
    const archCheck = new RegExp(archTitleRe.source, archTitleRe.flags);
    let am;
    while ((am = archCheck.exec(page.text)) !== null) {
      sheetRefs.push(am[1].trim());
    }

    // Detect multi-detail pages: extract all detail headings
    const detailHeadings: string[] = [];
    let dm;
    const detailCheck = new RegExp(detailHeadingRe.source, detailHeadingRe.flags);
    while ((dm = detailCheck.exec(page.text)) !== null) {
      detailHeadings.push(dm[1].trim());
    }

    // For multi-detail pages (3+ detail headings), assign to ALL matching rooms
    if (detailHeadings.length >= 3) {
      const matchedRooms = new Set<string>();
      // Check each detail heading against room patterns
      for (const heading of detailHeadings) {
        for (const [pattern, name] of titlePatterns) {
          if (pattern.test(heading)) {
            matchedRooms.add(name);
            break; // first match per heading
          }
        }
      }
      // Also check sheet references
      for (const ref of sheetRefs) {
        for (const [pattern, name] of titlePatterns) {
          if (pattern.test(ref)) {
            matchedRooms.add(name);
            break;
          }
        }
      }
      // Assign this page to all matched rooms
      if (matchedRooms.size > 0) {
        for (const room of matchedRooms) {
          if (!roomMap.has(room)) roomMap.set(room, []);
          if (!roomMap.get(room)!.includes(page.pageNum)) {
            roomMap.get(room)!.push(page.pageNum);
          }
        }
        continue; // skip single-room assignment
      }
    }

    // Single-room assignment (original logic): pick best match
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
You are ScopeExtractor v14.10.15, an expert architectural millwork estimator
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

EXAMPLE OUTPUT 1 (for a room called "Reception Desk", from a casework details sheet):
  assembly;Reception Desk;1;Reception Desk Assembly;ASSY-001;EA;4420;;;extracted;;;;A8.10;high;
  countertop;Reception Desk;1;Solid Surface Countertop;;EA;4420;;32;extracted;SS-1B;Solid Surface;;5/A8.06;high;
  transaction_top;Reception Desk;4;Oval Granite Transaction Top;;EA;914;610;32;extracted;GRANITE;Granite;;A8.10, 7/A8.06;high;
  decorative_panel;Reception Desk;2;3Form Panel Front;;EA;;;;unknown;3FORM;3Form Chroma Vapor;;A8.10;medium;
  rubber_base;Reception Desk;1;Black Rubber Base;;LF;;;;unknown;FB-01;Rubber Base;;;medium;
  scope_exclusion;Reception Desk;1;Printer FA-2 - By Others;;EA;;;;unknown;;;;;low;

NOTE on the Reception Desk example above: The assembly row represents the entire
reception desk run. Casework details sheets (A8.10 and similar) contain detail
callouts numbered 1, 2, 3, 4A-D, 5A-D, 8-14, 16-20 in a legend block at the
bottom of the page. These numbers identify DRAWING VIEWS (plans, elevations,
sections, reveal details), not cabinet items. Do NOT emit per-section base_cabinet
rows like "Base Cabinet Section 1A" or "Base Cabinet Section 4A" from drawing-
index numbers. The Reception Desk example above intentionally has NO per-section
base_cabinet rows -- the entire desk is captured in the assembly row plus its
component rows (countertop, transaction_top, decorative_panel, rubber_base).

EXAMPLE OUTPUT 2 (for a room called "Laundry", with explicit furniture-schedule callouts):
  base_cabinet;Laundry;1;Base Cabinet FURN-31;FURN-31;EA;991;610;864;extracted;PL-01;Plastic Laminate;;A2.41;high;
  base_cabinet;Laundry;1;Base Cabinet FURN-44;FURN-44;EA;965;610;864;extracted;PL-01;Plastic Laminate;;A2.41;high;
  base_cabinet;Laundry;1;Base Cabinet FURN-36 with Sink;FURN-36;EA;1829;610;864;extracted;PL-01;Plastic Laminate;;A2.41;high;

The Laundry example shows per-section base_cabinet rows ARE appropriate when
the page text contains explicit furniture-schedule callouts (FURN-NN), cabinet
type codes (CL-N), or inline cabinet labels inside elevation annotations.

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
- A cabinet 'section' is an EXPLICITLY LABELED cabinet identifier found
  in the page text, such as: a furniture-schedule callout (FURN-31, FURN-44),
  a cabinet-type code (CL-1, CL-2), or an inline label inside an elevation's
  annotations (e.g. "Section 3A" written next to a labeled cabinet box).
- DO NOT treat drawing-index numbers as cabinet sections. The legend block
  at the bottom of casework detail sheets lists drawings by number:
  "1 RECEPTION DESK PLAN", "8 RECEPTION DESK SECTION", "4A FRONT ELEVATION".
  These numbers describe drawing VIEWS, not cabinet items. Do not emit
  base_cabinet / upper_cabinet / tall_cabinet rows from them.
- When a casework page contains drawing-index numbers but NO explicit
  cabinet section labels in elevations or schedules, emit ONE assembly
  row describing the whole run, not per-drawing-number cabinet rows.

ITEM TYPES: assembly, base_cabinet, upper_cabinet, tall_cabinet, countertop,
transaction_top, decorative_panel, trim, channel, rubber_base, substrate, concealed_hinge,
piano_hinge, grommet, adjustable_shelf, fixed_shelf, cpu_shelf, drawer, file_drawer,
trash_drawer, rollout_basket, conduit, j_box, equipment_cutout, safe_cabinet,
controls_cabinet, end_panel, corner_guard, corner_detail, stainless_panel, hanger_support,
trellis, scope_exclusion, ada_fascia, wall_cap

DIMENSION RULES — CRITICAL:
- Use dimensions from PRE-EXTRACTED HINTS. Match to items by context.
- Convert all dimensions to mm. 1" = 25.4mm, 1' = 304.8mm.
- Common conversions: 24"=610mm, 25"=635mm, 34"=864mm, 36"=914mm, 42"=1067mm, 48"=1219mm
- For dimensions like 2'-1" = 25"= 635mm, 6'-0" = 72" = 1829mm
- NEVER invent dimensions. Leave empty if not found in text or hints.
- dim_source: "extracted" | "calculated" | "unknown"
- ALWAYS check the PRE-EXTRACTED DIMENSIONS section — these are reliable regex matches from the OCR.
  Map them to the correct items by reading the surrounding context.

DIMENSION ASSIGNMENT (W/D/H):
- W = WIDTH: the LONG horizontal dimension of the section front face (the run length).
  For a cabinet section measured along the countertop run, this is the face width.
  Example: cabinet FURN-36 is 4'-5 1/2" wide → W = 1359mm
- D = DEPTH: the SHORT horizontal dimension, front-to-back.
  Example: cabinet depth 2'-0" → D = 610mm
- H = HEIGHT: the vertical dimension.
  Example: cabinet height 2'-10" → H = 864mm
- When plan dimensions show run lengths (e.g. "4'-5 1/2", 1'-3", 2'-6"), these are section WIDTHS.
  The front-to-back measurement (typically 2'-0" to 2'-6") is the DEPTH.
- DO NOT put depth in the width column. If the only dimension you see is depth, put it in D.

RECEPTION DESK / SERVICE COUNTERS:
- Capture each side/run as a single assembly row by default.
- Only emit per-section cabinet rows when the page text contains explicit
  cabinet section labels (furniture-schedule callouts like FURN-NN, type
  codes like CL-N, or inline elevation labels like "Section 3A"). When
  the only section signals are drawing-index numbers from the legend
  block (e.g. "1 RECEPTION DESK PLAN", "4A FRONT ELEVATION"), emit only
  the assembly row, not per-section rows.
- Transaction tops (raised customer-facing surfaces, often oval or shaped granite/stone) 
  should be separate rows with item_type="transaction_top"
- If the material is called "solid surface" (like Corian) use material_code SS-xx
- If granite or stone, use material_code "GRANITE" or "STONE" and describe in material field
- Count each distinct transaction top shape as its own item with qty

MATERIAL RULES:
- material_code: code from hints/legend (PL-01, SS-1B, WC-4A, FB-1, etc.)
- material: full text description (Plastic Laminate, Solid Surface, etc.)
- Apply material codes from PRE-EXTRACTED MATERIALS to matching items.
- If same material applies to all cabinet sections (e.g. PL-01), apply to every section.

SHEET_REF / DETAIL PAGE — CRITICAL:
- sheet_ref: the drawing sheet number and/or detail number where this item is shown
- Look for references like "A8.10", "5/A8.06", "D1/A-403", "A2.41", "A7.15"
- These appear as title block references, detail callout bubbles, or sheet index entries
- Format: use the notation from the drawing (e.g. "A8.10", "5/A8.06", "D1/A-403")
- If multiple details show the item, list them comma-separated: "A8.10, 5/A8.06"
- NEVER put confidence values (high/medium/low) in the sheet_ref field
- NEVER put dimensions in the sheet_ref field
- Leave empty if no sheet reference is identifiable`.trim();

  if (ctx.documentType === "shop_drawing" || ctx.materialLegend.length > 0) {
    p += `

SHOP DRAWING MODE ACTIVE:
- Use FULL manufacturer info from material legend
- #N detail sections = individual component views with own dims
- Extract manufacturer part numbers (Blum, Rev-A-Shelf, Outwater, etc.)
- "FB-1 By Others" / "N.I.C." → item_type="scope_exclusion"`;
  }

  p += `

VANITY SECTION EXTRACTION — CRITICAL:
- On vanity/locker elevation drawings, section callout bubbles (e.g. 101A, 108B, 11A, 346C)
  each represent a SEPARATE cabinet. Extract every visible callout as its own base_cabinet row.
- Do NOT collapse multiple sections into one row. One callout = one row.
- Section number = section_id field. Use description: "Vanity Section [ID]".
- If dimensions appear near the callout, assign to width_mm. Standard depth = 533mm (21").

WALL FINISH / SUBSTRATE EXTRACTION:
- FRP panels, plywood substrates, rubber base, wall tile, and reducer strips installed by
  the millwork sub ARE in scope. Extract them even when no cabinet is present.
- FRP / fiberglass panels → item_type=decorative_panel, include WC-XX material code.
- Plywood on wall → item_type=substrate.
- Rubber base / coved base → item_type=rubber_base, unit=LF.
- Reducer strips → item_type=trim.

WHAT TO EXTRACT: cabinets, countertops, panels, trim, hardware, equipment cutouts,
substrates, conduit/electrical by millwork fab, scope exclusions (NIC/by others).
WHAT NOT TO EXTRACT: items by G.C., electrical, plumbing, flooring, paint,
ceiling systems (suspended grids, acoustical tiles, gypsum board ceilings),
structural elements (demo work, blocking by GC), sprinkler heads,
AV mounts (TV mounts, projectors, fan mounts) unless explicitly in millwork scope.
These items appear on finish/equipment pages but are NEVER millwork — do not extract them.

Set confidence: "high" = type+dims+material, "medium" = missing one, "low" = missing two+.

FINAL CHECK: Before outputting, verify each line has the correct number of semicolons
matching the column count. Description field must NEVER contain semicolons.`;
  return p;
}

// ─── Sheet & Detail Reference Extraction ────────────────────

interface SheetDetailInfo {
  sheetNumber: string;       // e.g. "A8.10"
  detailNumbers: string[];   // e.g. ["1", "2", "3", "4A", "4B", ...]
  fullRefs: string[];        // e.g. ["1/A8.10", "4A/A8.10", ...]
}

function extractSheetDetails(pageText: string): SheetDetailInfo {
  const info: SheetDetailInfo = { sheetNumber: "", detailNumbers: [], fullRefs: [] };
  const detailSet = new Set<string>();
  
  // Extract sheet number from title block patterns:
  // "A8.10\nCASEWORK" or standalone "A8.10" in title block area
  // The sheet number typically appears near SHEET TITLE or as a standalone reference
  const sheetPatterns = [
    /\b(A\d+\.\d+)\s*\n\s*(?:CASEWORK|FINISH|INTERIOR|ENLARGED|LOCKER|TEAM|SERVICE|RECEPTION|DETAILS)/i,
    /SHEET\s*(?:NO\.?)?\s*:?\s*(A\d+\.\d+)/i,
    /^\s*(A\d+\.\d+)\s*$/m,
  ];
  
  // Count occurrences of each sheet number to find the most common (= the page's sheet)
  const sheetCounts: Record<string, number> = {};
  const allSheetRefs = pageText.match(/\b(A\d+\.\d+)\b/g) || [];
  for (const s of allSheetRefs) {
    sheetCounts[s] = (sheetCounts[s] || 0) + 1;
  }
  // Most frequent sheet number is likely the page's own sheet
  let bestSheet = ""; let bestCount = 0;
  for (const [s, c] of Object.entries(sheetCounts)) {
    if (c > bestCount) { bestSheet = s; bestCount = c; }
  }
  if (bestSheet && bestCount >= 3) {
    info.sheetNumber = bestSheet;
  } else {
    // Try explicit patterns
    for (const pat of sheetPatterns) {
      const m = pageText.match(pat);
      if (m) { info.sheetNumber = m[1]; break; }
    }
  }
  
  if (!info.sheetNumber) return info;
  
  const sheet = info.sheetNumber.replace(".", "\\.");
  
  // Pattern 1: "N / A8.10" (slash reference)
  const p1 = new RegExp(`(\\d+[A-D]?)\\s*/\\s*${sheet}`, "g");
  let m;
  while ((m = p1.exec(pageText)) !== null) detailSet.add(m[1]);
  
  // Pattern 2: "N\nA8.10" (detail number on line before sheet)
  const p2 = new RegExp(`(\\d+[A-D]?)\\s*\\n\\s*${sheet}`, "g");
  while ((m = p2.exec(pageText)) !== null) detailSet.add(m[1]);
  
  // Pattern 3: "A8.10\nN ROOM NAME" (title block detail index)
  const p3 = new RegExp(`${sheet}\\s+[\\d/"= \\'-]+\\n(\\d+[A-D]?)\\s+[A-Z]`, "g");
  while ((m = p3.exec(pageText)) !== null) detailSet.add(m[1]);
  
  // Pattern 4: "A8.10\nNA" (sheet then detail with letter suffix)
  const p4 = new RegExp(`${sheet}\\s*\\n\\s*(\\d+[A-D])\\b`, "g");
  while ((m = p4.exec(pageText)) !== null) detailSet.add(m[1]);

  info.detailNumbers = [...detailSet].sort((a, b) => {
    const na = parseInt(a.replace(/[A-D]/g, "")); const nb = parseInt(b.replace(/[A-D]/g, ""));
    return na - nb || a.localeCompare(b);
  });
  info.fullRefs = info.detailNumbers.map(d => `${d}/${info.sheetNumber}`);
  
  return info;
}

// ─── User Prompt Builder ─────────────────────────────────────

function buildUserPrompt(
  roomText: string, roomName: string, hints: any, ctx: ProjectContext, projectId?: string, sheetInfo?: SheetDetailInfo
): string {
  const parts: string[] = [];
  parts.push(`Project: ${projectId || "(unspecified)"}`);
  parts.push(`Room: ${roomName}`);
  parts.push(`Document Type: ${ctx.documentType}`);
  parts.push("");

  // Sheet & detail references
  if (sheetInfo?.sheetNumber) {
    parts.push(`## SHEET & DETAIL REFERENCES`);
    parts.push(`Sheet: ${sheetInfo.sheetNumber}`);
    if (sheetInfo.detailNumbers.length > 0) {
      parts.push(`Details found: ${sheetInfo.detailNumbers.join(", ")}`);
      parts.push(`Use these for sheet_ref field: e.g. "${sheetInfo.detailNumbers[0]}/${sheetInfo.sheetNumber}"`);
    }
    parts.push("");
  }

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

  // v14.8.3: Room-specific extraction hints
  // Injected into the user prompt when the room name matches known patterns.
  // These replicate what a proposal/SOW provides — explicit scope language to
  // guide the LLM when drawing text alone is ambiguous.
  const roomLower = roomName.toLowerCase();

  if (/vanity|locker.*room|men.*vanity|women.*vanity|unisex.*vanity/i.test(roomName)) {
    parts.push("## ROOM HINT: VANITY / LOCKER ROOM");
    parts.push("This room contains individual vanity or locker cabinet sections.");
    parts.push("CRITICAL — section extraction rules:");
    parts.push("- Section IDs like 101A, 108B, 11A, 23B are individual cabinet sections on the elevation.");
    parts.push("  Extract EACH section as a separate base_cabinet row even if no dimension string is visible.");
    parts.push("- Section number prefixes (e.g. 101, 108, 111, 123, 171, 346) often correspond to");
    parts.push("  ADA-compliant or standard vanity runs — treat each letter suffix as a separate cabinet.");
    parts.push("- Look for dimension strings adjacent to or below each section callout bubble.");
    parts.push("- Standard vanity cabinet widths: 18\"=457mm, 21\"=533mm, 24\"=610mm, 30\"=762mm.");
    parts.push("- Standard vanity depth: 21\" (533mm). Height to counter: 34\" (864mm).");
    parts.push("- If ADA vanity is noted, add item_type=ada_fascia for the knee-space fascia panel.");
    parts.push("- Countertop: solid surface or stone top spanning the full run — add as countertop row.");
    parts.push("- Concealed hinges for cabinet doors — add as concealed_hinge row with qty = door count.");
    parts.push("");
  }

  if (/service\s*manager/i.test(roomName)) {
    parts.push("## ROOM HINT: SERVICE MANAGER");
    parts.push("This room typically contains a casework run along one or more walls.");
    parts.push("CRITICAL — do NOT return empty or only scope_exclusions for this room.");
    parts.push("Expected millwork scope (extract ALL that appear in the drawing text):");
    parts.push("- Upper wall cabinets (upper_cabinet): typically 12\" deep, 30\"–42\" tall");
    parts.push("- Base cabinets (base_cabinet): typically 24\" deep, 34\" tall");
    parts.push("- Wall shelves (fixed_shelf or adjustable_shelf)");
    parts.push("- File drawers (file_drawer) — look for 'file' or 'lateral' near cabinet sections");
    parts.push("- Locks — note qty in description if called out (e.g. '8 locks')");
    parts.push("- Countertop (countertop): spanning the base cabinet run");
    parts.push("- Stereo/AV/controls cabinet (controls_cabinet): custom millwork, NOT scope_exclusion");
    parts.push("- Section letters like 11B, 48D, 55D, 75D are individual cabinet sections —");
    parts.push("  extract each as a separate row with section_id matching the callout.");
    parts.push("- Look for dimension strings like 5'-0\", 4'-0\" etc. for run widths.");
    parts.push("");
  }

  if (/team\s*room/i.test(roomName)) {
    parts.push("## ROOM HINT: TEAM ROOM");
    parts.push("CRITICAL: This room has NO base cabinets. Its millwork scope is wall finishes and substrates.");
    parts.push("You MUST extract these items — do NOT return empty or only rubber_base:");
    parts.push("");
    parts.push("- FRP wall panels (decorative_panel): Fiberglass Reinforced Panel, material code WC-4A or WC-4B.");
    parts.push("  Look for notes like '10\'-0 FRP entire room', 'FRP wainscot', 'WC-4B with waterproofing'.");
    parts.push("  Each distinct FRP note = separate decorative_panel row. Include full height in description.");
    parts.push("- Plywood substrate (substrate): '1/2\" plywood on wall', 'ply sub', 'blocking on wall'.");
    parts.push("  These back the FRP panels — extract as substrate with unit=SF.");
    parts.push("- Wall tile (decorative_panel or scope_exclusion): tile noted on walls — check if by GC.");
    parts.push("- Rubber base (rubber_base): all floor base — include material code and color number.");
    parts.push("  Look for 'RF-3B', custom color #308, coved base, slim foot ceramic base.");
    parts.push("- Reducer strip / transition strip (trim): at floor material changes.");
    parts.push("- Refinish existing floor (scope_exclusion if by others).");
    parts.push("");
    parts.push("If you see only 1-2 rubber_base rows, you are MISSING scope. Re-read for FRP panel notes.");
    parts.push("");
  }

  if (/team\s*member/i.test(roomName)) {
    parts.push("## ROOM HINT: TEAM MEMBERS (LOCKER ROOM)");
    parts.push("This room contains locker units, benches, and towel stations.");
    parts.push("- Each locker unit is a separate tall_cabinet or base_cabinet row.");
    parts.push("- Locker types: Surface Mount Post Form, Dial Lock, Padlock, End of Run —");
    parts.push("  extract each type as its own row with qty and width.");
    parts.push("- Bench units (base_cabinet): model numbers like PFB2448, PFB1248, PFB1272.");
    parts.push("  Width = first 2 digits of model in inches × 25.4mm (e.g. PFB2448 = 24\"=610mm).");
    parts.push("- Towel stations (tall_cabinet): Small=12\"(305mm), Large=15\"(381mm) wide.");
    parts.push("- Towel drop with curb (base_cabinet): 21\"(533mm) wide.");
    parts.push("- Rubber base (rubber_base): coved and ventilated — extract both if noted.");
    parts.push("- Count TOTAL drawers across all locker units and note in assembly description.");
    parts.push("");
  }

  // Truncate OCR text to ~15K chars to stay under token budget
  let ocrText = roomText;
  if (ocrText.length > 15000) {
    ocrText = ocrText.substring(0, 15000) + "\n[TRUNCATED]";
  }

  // Check if OCR text is mostly empty (image-only pages)
  const textChars = ocrText.replace(/---\s*PAGE\s*\d+(?:\s*\[[^\]]*\])?\s*---/g, "").replace(/\s/g, "").length;
  const isImageBased = textChars < 100;

  if (isImageBased) {
    parts.push("## VISION MODE — SCANNED DRAWING");
    parts.push("OCR text is EMPTY. Extract millwork from the ATTACHED IMAGE(S) above.");
    parts.push("");
    parts.push("Read dimension strings (5'-0\"=1524mm, 2'-0\"=610mm, 2'-6\"=762mm).");
    parts.push("Horizontal plan dims = WIDTH. Vertical elevation dims = HEIGHT.");
    parts.push("Base cabinet depth ~24\" (610mm). Upper cabinet depth ~12\" (305mm).");
    parts.push("");
    parts.push("Look for: cabinet sections, countertops, upper cabinets (dashed lines),");
    parts.push("shelves, drawers, file drawers, equipment tags, material callouts,");
    parts.push("hardware, and 'By Others'/'NIC' scope exclusions.");
    parts.push("");
    parts.push("Do NOT return empty TOON. Every millwork drawing has extractable items.");
    parts.push("");
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
  "transaction_top", "decorative_panel", "trim", "channel", "rubber_base", "substrate",
  "concealed_hinge", "piano_hinge", "grommet", "adjustable_shelf", "fixed_shelf",
  "cpu_shelf", "drawer", "file_drawer", "trash_drawer", "rollout_basket",
  "conduit", "j_box", "equipment_cutout", "safe_cabinet", "controls_cabinet",
  "end_panel", "corner_guard", "corner_detail", "stainless_panel", "hanger_support",
  "trellis", "scope_exclusion",
  "ada_fascia", "wall_cap",
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
    
    // Pattern E (v14.8.2): item_type is valid but description == a room name.
    // This happens when the LLM outputs: real_item_type | room | qty | ROOM_NAME_AGAIN | real_desc ...
    // Symptoms: description === room, section_id has the real description text.
    if (
      itemType && VALID_ITEM_TYPES.has(itemType) &&
      row.description && row.section_id &&
      String(row.description).trim() === String(row.room).trim() &&
      String(row.section_id).trim().length > 3
    ) {
      row.description = String(row.section_id).trim();
      row.section_id = "";
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
          else if (/towel.*bar|hook|coat.*rack|accessory/i.test(combined)) row.item_type = "scope_exclusion";
          else if (/mirror/i.test(combined)) row.item_type = "scope_exclusion";
          else if (/grab.*bar|soap.*dispenser|paper.*towel|hand.*dryer/i.test(combined)) row.item_type = "scope_exclusion";
          else if (/trellis/i.test(combined)) row.item_type = "trellis";
          else if (/ada.*fascia|fascia.*ada|accessibility.*fascia/i.test(combined)) row.item_type = "ada_fascia";
          else if (/wall.*cap|cap.*trim.*wall|countertop.*cap|cap.*panel/i.test(combined)) row.item_type = "wall_cap";
          
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
    
    // Fix A (v14.8.2): Backfill width_mm from description text when field is empty.
    // Targets rows where the LLM wrote run dimensions into description text but left width_mm blank.
    // We only attempt this for item types that represent linear/planimetric millwork runs.
    const _needsWidth =
      (!row.width_mm || row.width_mm === "" || Number(row.width_mm) === 0) &&
      /cabinet|countertop|transaction_top|trellis|panel|shelf|ada_fascia|wall_cap/i.test(row.item_type || "");
    if (_needsWidth && row.description) {
      const _desc = String(row.description);
      let _backfillMm = 0;

      // Helper: feet + inch + fraction -> mm
      const _toMm = (ft: number, inch: number, frac: number): number =>
        Math.round(ft * 304.8 + (inch + frac) * 25.4);

      // P1: feet-inches compound with optional fraction  e.g. 5'-0", 18'-6", 4'-5 1/2"
      const _m1 = _desc.match(/\b(\d{1,2})'-(\d{1,2})(?:\s+(\d+)\/(\d+))?["'\s]/);
      if (_m1) {
        const _ft = parseInt(_m1[1]);
        const _in = parseInt(_m1[2]);
        const _fr = _m1[3] ? parseInt(_m1[3]) / parseInt(_m1[4]) : 0;
        _backfillMm = _toMm(_ft, _in, _fr);
      }

      // P2: plain inches with optional fraction  e.g. 60", 18 1/2"
      if (!_backfillMm) {
        const _m2 = _desc.match(/\b(\d{2,3})(?:\s+(\d+)\/(\d+))?"/);
        if (_m2) {
          const _in = parseInt(_m2[1]);
          const _fr = _m2[2] ? parseInt(_m2[2]) / parseInt(_m2[3]) : 0;
          _backfillMm = Math.round((_in + _fr) * 25.4);
        }
      }

      // P3: explicit mm value  e.g. 1524mm
      if (!_backfillMm) {
        const _m3 = _desc.match(/\b(\d{3,5})\s*mm\b/i);
        if (_m3) _backfillMm = parseInt(_m3[1]);
      }

      // P4: plain feet only  e.g. 5', 18'  (last resort)
      if (!_backfillMm) {
        const _m4 = _desc.match(/\b(\d{1,2})\'\s*(?!\d)/);
        if (_m4) _backfillMm = Math.round(parseInt(_m4[1]) * 304.8);
      }

      // Sanity gate: cabinet runs are 1ft (305mm) to 40ft (12192mm)
      // Values outside this range are likely heights or depths leaking in — skip
      if (_backfillMm >= 305 && _backfillMm <= 12192) {
        row.width_mm = _backfillMm;
        if (!row.dim_source || row.dim_source === "unknown") row.dim_source = "calculated";
      }
    }

    // Reclassify tall_cabinet → base_cabinet when height is 3'-0" (914mm) or below
    if (row.item_type === "tall_cabinet" && row.height_mm) {
      const h = Number(row.height_mm);
      if (h > 0 && h <= 914) {
        row.item_type = "base_cabinet";
      }
    }
    
    // Clean material_code: description or confidence value leaked into wrong column
    if (row.material_code && typeof row.material_code === "string") {
      const mc = row.material_code.trim();
      // If mat_code is a confidence value, swap
      if (/^(high|medium|low)$/i.test(mc)) {
        if (!row.confidence) row.confidence = mc;
        row.material_code = "";
      }
      // If mat_code is very long (description leaked in), clear it
      else if (mc.length > 25) {
        row.material_code = "";
      }
    }
    // Clean material field: confidence value leaked in
    if (row.material && typeof row.material === "string" && /^(high|medium|low)$/i.test(row.material.trim())) {
      if (!row.confidence) row.confidence = row.material.trim();
      row.material = "";
    }
    
    // Clean sheet_ref: confidence or dimension values leaked in
    if (row.sheet_ref && typeof row.sheet_ref === "string") {
      const sr = row.sheet_ref.trim();
      if (/^(high|medium|low)$/i.test(sr)) {
        if (!row.confidence) row.confidence = sr;
        row.sheet_ref = "";
      } else if (/^\d+['-]/.test(sr) || /^\d+mm$/i.test(sr) || /^\d+$/.test(sr)) {
        row.sheet_ref = "";
      }
    }
    
    // Clean description of any remaining semicolons or commas with TOON patterns
    if (row.description) {
      row.description = row.description
        .replace(/;/g, ",")
        // Strip comma-embedded TOON data: ",RoomName,..." or ",qty,,qty,EA,..." patterns
        .replace(/,(?:Service Manager|Reception Desk|Team Members|Kids Club|Team Room|Unclassified|Retail Display|Laundry|Janitor|Pool Area|Mens Vanity|Womens Vanity|Building Wide|Men's Locker Room|Women's Locker Room|First Floor)[,].*/i, "")
        // Also strip: ",,,1,EA,1234" style trailing TOON fragments  
        .replace(/,{2,}\d*,(?:EA|LF|SF|LOT),?\d*.*$/i, "")
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

async function callAnthropic(systemPrompt: string, userPrompt: string, images?: { pageNum: number; base64: string }[]): Promise<string> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      // Build content blocks: text + optional images
      const content: any[] = [];
      
      // If we have images, add them first so the LLM sees the drawings
      if (images && images.length > 0) {
        for (const img of images) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: img.base64,
            },
          });
          content.push({
            type: "text",
            text: `[Above: PAGE ${img.pageNum} — scanned architectural/millwork shop drawing. Read ALL dimension strings, cabinet sections, countertops, shelves, drawers, material callouts, and equipment tags visible in this drawing.]`,
          });
        }
      }
      
      // Add the main text prompt
      content.push({ type: "text", text: userPrompt });
      
      const message = await anthropic.messages.create({
        model: MODEL, max_tokens: 8192, temperature: 0.05,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      });
      const tb = message.content.find((b: any) => b.type === "text");
      return tb?.text?.trim() ?? "";
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.error?.type === "rate_limit_error";
      if (is429 && attempt < 2) {
        const wait = 15000 * Math.pow(2, attempt);
        console.log(`[v14.8.1] Rate limited, waiting ${wait/1000}s...`);
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

  const { text, projectId, sheetRef, mode, roomPages, projectContext: clientCtx, pageImages } = req.body || {};

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
      const ctx = await extractProjectContext(pages);
      const rooms = groupPagesByRoom(pages);

      // v14.10.11: Runtime guardrail. If any page text contains reception
      // labels but groupPagesByRoom produced no Reception Desk room, log a
      // warning. This catches future regressions immediately rather than
      // discovering them in customer Excel output six weeks later.
      const _hasReceptionRoom = rooms.some(r => r.roomName === "Reception Desk");
      if (!_hasReceptionRoom) {
        const _pagesWithReceptionLabels = pages
          .filter(p => /\bRECEPTION\s+\d|\d{3}[A-Z]?\s+RECEPTION\b|\bFront\s*Desk\b/i.test(p.text))
          .map(p => p.pageNum);
        if (_pagesWithReceptionLabels.length > 0) {
          console.log(`[v14.10.11] WARN: pages ${JSON.stringify(_pagesWithReceptionLabels)} contain reception labels but no Reception Desk room was produced`);
        }
      }

      // Log for debugging
      console.log(`[v14.8.1] Analyze: ${pages.length} pages, ${rooms.length} rooms, ${ctx.materialLegend.length} materials`);
      for (const r of rooms) {
        console.log(`  ${r.roomName}: pages ${r.pageNums.join(",")}`);
      }

      return res.status(200).json({
        ok: true, version: "v14.8.1", mode: "analyze",
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

    // v14.8.1: Extract sheet number & detail references from OCR text
    const sheetInfo = extractSheetDetails(combinedText);
    if (sheetInfo.sheetNumber) {
      console.log(`[v14.8.1] Sheet: ${sheetInfo.sheetNumber}, Details: ${sheetInfo.detailNumbers.join(", ")}`);
    }

    const ctx: ProjectContext = clientCtx || await extractProjectContext(pages);
    const hints = preprocess(combinedText, sheetRef);

    const systemPrompt = buildSystemPrompt(ctx);
    const userPrompt = buildUserPrompt(combinedText, roomName, hints, ctx, projectId, sheetInfo);

    // v14.8.1: Build image list for vision extraction (image-only pages)
    const images: { pageNum: number; base64: string }[] = [];
    if (pageImages && typeof pageImages === "object") {
      for (const [pn, b64] of Object.entries(pageImages)) {
        if (typeof b64 === "string" && b64.length > 100) {
          images.push({ pageNum: parseInt(pn), base64: b64 as string });
        }
      }
    }
    if (images.length > 0) {
      console.log(`[v14.8.1] Vision mode: ${images.length} image page(s) for ${roomName}`);
    }

    const tLlm = Date.now();
    let toon = await callAnthropic(systemPrompt, userPrompt, images.length > 0 ? images : undefined);
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
    // v14.8.1: ALWAYS override room to the API-provided roomName.
    for (const row of cleanedRows) { row.room = roomName; }

    // v14.8.3: Drop fully-garbled rows where both item_type AND description == room name
    // These come from proposal text where the LLM repeats the room heading as a data row.
    const degarbled = cleanedRows.filter(row => {
      const t = (row.item_type || "").trim();
      const d = (row.description || "").trim();
      const r = (row.room || "").trim();
      // Drop if item_type matches room name (not a valid type) and description also matches
      if (t === r && d === r) return false;
      if (t === r && d === "") return false;

      // v14.8.4: Drop Unclassified scope_exclusions that are clearly non-millwork
      // Ceiling systems, AV mounts, sprinkler heads, structural items — never millwork scope.
      if (r === "Unclassified" && t === "scope_exclusion") {
        const dl = d.toLowerCase();
        if (/ceiling|suspended.*grid|acoustical.*tile|gypsum.*board|sprinkler|demo.*ceiling|cedar.*panel.*angle|ceramic.*tile.*angle|projector|tv.*mount|fan.*mount/i.test(dl)) {
          return false;
        }
      }

      return true;
    });
    cleanedRows.length = 0;
    degarbled.forEach(r => cleanedRows.push(r));
    
    // v14.8.1: Auto-assign sheet_ref from extracted sheet/detail info
    if (sheetInfo.sheetNumber) {
      for (const row of cleanedRows) {
        if (!row.sheet_ref || /^(high|medium|low)$/i.test(row.sheet_ref)) {
          row.sheet_ref = sheetInfo.sheetNumber;
        }
      }
    }

    // v14.8.1: Reclassify scope_exclusions that are actually millwork
    for (const row of cleanedRows) {
      if (row.item_type !== "scope_exclusion") continue;
      const desc = (row.description || "").toLowerCase();
      // Stereo/equipment CABINETS are custom millwork (the cabinet, not the AV gear)
      if (/(?:stereo|equipment|av)\s*(?:cabinet|rack|enclosure)/i.test(desc) && !/by\s*others|nic|not\s*in/i.test(desc)) {
        row.item_type = "controls_cabinet";
      }
      // Base/upper/tall cabinets wrongly marked as exclusion
      else if (/(?:base|upper|wall|tall)\s*cabinet/i.test(desc) && !/by\s*others|nic|not\s*in/i.test(desc)) {
        if (/upper|wall.*hung/i.test(desc)) row.item_type = "upper_cabinet";
        else if (/tall/i.test(desc)) row.item_type = "tall_cabinet";
        else row.item_type = "base_cabinet";
      }
      // Countertops wrongly marked as exclusion
      else if (/counter\s*top|laminate\s*top/i.test(desc) && !/by\s*others|nic|not\s*in/i.test(desc)) {
        row.item_type = "countertop";
      }
      // Shelves wrongly marked as exclusion
      else if (/(?:wall.*hung|adjustable|fixed)\s*shelf/i.test(desc) && !/by\s*others|nic|not\s*in/i.test(desc)) {
        row.item_type = /adjustable/i.test(desc) ? "adjustable_shelf" : "fixed_shelf";
      }
    }

    // v14.10.13: Demote misclassified finish-callout rows out of cabinet types.
    // L950 and L992 inference matches /cabinet/ inside brand names like
    // "Fast Cabinet Doors", producing false base_cabinet rows from finish
    // specs on Finish Keys PDFs. Real cabinets have dimensions and sheet refs;
    // finish callouts don't. If all three guards hold, reclassify.
    const FINISH_CABINET_TYPES = new Set(["base_cabinet", "upper_cabinet", "tall_cabinet"]);
    const FINISH_DESC_PATTERN = /^to\s*match\b|^residential\s*cabinet\b|^[A-Z]{1,3}-\d+\s*$|^[A-Z][a-z]+\s*\/\s*[A-Z]/i;
    for (const row of cleanedRows) {
      if (!FINISH_CABINET_TYPES.has(row.item_type)) continue;
      const desc = String(row.description || "").trim();
      if (!FINISH_DESC_PATTERN.test(desc)) continue;
      const hasW = row.width_mm && Number(row.width_mm) > 0;
      const hasD = row.depth_mm && Number(row.depth_mm) > 0;
      const hasH = row.height_mm && Number(row.height_mm) > 0;
      const hasSheet = row.sheet_ref && String(row.sheet_ref).trim().length > 0;
      if (!hasW && !hasD && !hasH && !hasSheet) {
        row.item_type = "scope_exclusion";
        row.notes = (String(row.notes || "").trim() + " [v14.10.13: finish-spec, not item]").trim();
      }
    }

    // v14.8.1: Postprocess material code assignment from hints (with error safety)
    try {
    const assignMaterialCodes = (rows: any[], matHints: any[], legend: any[]) => {
      if (!matHints || !legend || !rows) return;
      const codeMap: Record<string, { code: string; name: string; category: string }> = {};
      for (const m of (matHints || [])) {
        if (m?.code) codeMap[m.code] = { code: m.code, name: m.fullName || m.code, category: m.category || "" };
      }
      for (const l of (legend || [])) {
        if (l?.code) codeMap[l.code] = { code: l.code, name: l.productName || l.code, category: l.category || "" };
      }

      const plCodes = Object.keys(codeMap).filter(c => /^PL-/i.test(c));
      const ssCodes = Object.keys(codeMap).filter(c => /^SS-/i.test(c));
      const wcCodes = Object.keys(codeMap).filter(c => /^WC-/i.test(c));
      const fbCodes = Object.keys(codeMap).filter(c => /^FB-/i.test(c));

      for (const row of rows) {
        try {
        if (!row || row.item_type === "scope_exclusion" || row.item_type === "assembly") continue;
        
        // Pre-scan: if material field has a code pattern and material_code doesn't, swap
        const matField = String(row.material || "").trim();
        const mcField = String(row.material_code || "").trim();
        const matFieldCode = matField.match(/^(PL-\d+[A-Z]?|SS-\d+[A-Z]?|WC-\d+[A-Z]?|FB-\d+|MEL-\w+|3FORM)$/i);
        if (matFieldCode && (!mcField || mcField.length <= 3)) {
          // Material field has the code, material_code has junk or a bare prefix
          row.material_code = matFieldCode[1].toUpperCase();
          row.material = mcField || ""; // swap the bare prefix to material or clear
          continue;
        }
        
        const matCode = mcField;
        // Skip if already has a real-looking material code (4+ chars, pattern match)
        const looksLikeCode = matCode.length >= 3 && matCode.length <= 15 && /^[A-Z0-9][-A-Z0-9_]*$/i.test(matCode) && !VALID_ITEM_TYPES.has(matCode);
        if (looksLikeCode) continue;
        // Clear garbage in material_code (item_type names, long descriptions, bare prefixes like "SS")
        if (matCode) row.material_code = "";

        const combined = `${String(row.description||"")} ${String(row.material||"")} ${String(row.notes||"")}`.toUpperCase();

        let found = false;
        for (const code of Object.keys(codeMap)) {
          if (combined.includes(code.toUpperCase())) {
            row.material_code = code;
            if (!row.material) row.material = codeMap[code].name;
            found = true; break;
          }
        }
        if (found) continue;

        const codeMatch = combined.match(/\b(PL-\d+|SS-\d+[A-Z]?|WC-\d+[A-Z]?|FB-\d+|MEL-\w+|3FORM|GRANITE|STONE)\b/i);
        if (codeMatch) { row.material_code = codeMatch[1].toUpperCase(); continue; }

        const t = row.item_type || "";
        if (/base_cabinet|upper_cabinet|tall_cabinet|cpu_shelf|fixed_shelf|adjustable_shelf|drawer|file_drawer|trash_drawer|safe_cabinet/.test(t)) {
          if (plCodes.length) { row.material_code = plCodes[0]; row.material = row.material || codeMap[plCodes[0]].name; }
        } else if (/countertop|transaction_top/.test(t)) {
          if (ssCodes.length) { row.material_code = ssCodes[0]; row.material = row.material || codeMap[ssCodes[0]].name; }
        } else if (/decorative_panel/.test(t) && /FRP|FIBERGLASS/i.test(combined)) {
          if (wcCodes.length) { row.material_code = wcCodes[0]; row.material = row.material || codeMap[wcCodes[0]].name; }
        } else if (/rubber_base/.test(t)) {
          if (fbCodes.length) { row.material_code = fbCodes[0]; row.material = row.material || codeMap[fbCodes[0]].name; }
        } else if (/substrate/.test(t)) {
          row.material_code = row.material_code || "PLY"; row.material = row.material || "Plywood";
        }
        } catch (_) { /* skip row */ }
      }
    };
    assignMaterialCodes(cleanedRows, hints.materials, ctx.materialLegend);
    } catch (e) { console.error("[v14.8.1] material assign error:", e); }

    return res.status(200).json({
      ok: true, version: "v14.8.4", mode: "extract",
      model: MODEL, room: roomName,
      projectId: projectId || null,
      toon, rows: cleanedRows, assemblies: result.assemblies,
      stats: { ...result.stats, totalItems: cleanedRows.length },
      warnings: result.warnings,
      sheetInfo: sheetInfo.sheetNumber ? sheetInfo : null,
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
    console.error("[v14.8.1] error:", err?.message);
    return res.status(500).json({ ok: false, version: "v14.8.1", error: err?.message || "Unknown error" });
  }
}
