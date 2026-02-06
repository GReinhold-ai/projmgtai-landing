// src/pages/api/scope-extractor-v14.ts
// V14 Scope Extractor — 3-Stage Pipeline
//
// Stage 1: Regex pre-processor (extracts dims, materials, hardware, assemblies)
// Stage 2: LLM extraction via Claude Sonnet (with pre-extracted hints)
// Stage 3: Post-processor (validates, dedupes, calculates areas, rolls up assemblies)

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA_V14 } from "@/lib/toonSchemas";
import { preprocess, type PreprocessResult } from "@/lib/parser/preprocess";
import { postprocess } from "@/lib/parser/postprocess";

// ─── Config ──────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Fallback to OpenAI if Anthropic key not set (backward compat)
let openai: any = null;
async function getOpenAI() {
  if (!openai) {
    const OpenAI = (await import("openai")).default;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const MODEL = "claude-sonnet-4-20250514";
const MODEL_FALLBACK = "gpt-4o"; // fallback if no Anthropic key

const HEADER_V14 = `#TOON v=1 sep=; cols=${MW_ITEM_SCHEMA_V14.join(",")}`;

// ─── System Prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT_V14 = `
You are ScopeExtractor v14, an expert architectural millwork estimator
with 40 years of experience reading construction documents for a
C-6 licensed millwork subcontractor.

You will receive:
1. OCR text from an architectural plan sheet
2. PRE-EXTRACTED HINTS: dimensions, materials, hardware, equipment tags,
   and assembly detection — all found by regex before you see the text.

Your job is to produce a TOON-formatted extraction of ALL millwork scope items.

OUTPUT FORMAT:
- First line MUST be exactly: ${HEADER_V14}
- One line per item, semicolon-separated
- Fields in this exact order: ${MW_ITEM_SCHEMA_V14.join(", ")}

ASSEMBLY RULES:
- If an assembly is detected (e.g., "Reception Desk"), create ONE parent row
  with item_type="assembly" and assembly_id="ASSY-001"
- Then create component rows nested under it using the same assembly_id
- Each distinct cabinet section (5A, 5B, 5C, 5D) = separate item with section_id
- The assembly parent row should have the overall dimensions if known

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
- drawer
- conduit (when provided by millwork fabricator)
- j_box (flush mount junction box accommodation)
- equipment_cutout (for FA-##, SA-##, PH-## equipment)

DIMENSION RULES — CRITICAL:
- Use dimensions from the PRE-EXTRACTED HINTS. Match them to items by context.
- Convert all dimensions to millimeters (mm). 1 inch = 25.4 mm.
- NEVER invent or default dimensions. If you cannot find a real dimension
  for an item, leave length_mm/width_mm/height_mm/depth_mm EMPTY and
  set dim_source="unknown".
- For cabinets: width = front face width, depth = front-to-back, height = floor to top
- For countertops: length = run length, width = front-to-back depth
- Set dim_source to: "extracted" (from hints), "calculated" (you computed it),
  or "unknown" (not available)

MATERIAL RULES:
- Use material_code for parsed codes: PL-01, SS-1B, 3FORM-VAPOR, MEL-WHT, etc.
- Use material for free text description: "Plastic Laminate, Vertical Wood Grain"
- Every material mentioned in the hints should appear on at least one item
- Distinguish SS-1B from SS-6 — they are different specs

HARDWARE RULES:
- Each hardware type = separate line item (not a note on a cabinet)
- Grommets: include size and qty from hints
- Hinges: include qty per door and spec from hints
- Shelves (adjustable, fixed, CPU): separate line items

SCOPE NOTES:
- "Conduit provided by millwork fabricator" = separate line item (labor + material cost)
- Flush mount J-boxes = separate line items
- Special angles (e.g., 35.25°) = note on the relevant component
- "Butt joint sealed with clear silicone" = construction note in notes field

WHAT TO EXTRACT (comprehensive list):
- Every cabinet, desk section, or casework unit
- Every countertop run (with material code)
- Every decorative panel (3Form, accent, etc.)
- Every trim piece (aluminum, wood, rubber base)
- Every hardware item (hinges, grommets, shelves, pulls)
- Every piece of equipment that requires millwork accommodation
- Every substrate/backing panel
- Every conduit/electrical accommodation by the millwork fabricator
- Overall assembly record if this sheet describes one built structure

WHAT NOT TO EXTRACT:
- Items clearly noted as "BY G.C." or "BY OTHERS"
- Electrical work (unless conduit is by millwork fabricator)
- Plumbing
- Flooring (unless integral to millwork, like toe kick)
- Paint/wall finishes not on millwork

Set confidence to "high" when you have type + dimensions + material,
"medium" when missing one, "low" when missing two or more.
`.trim();

// ─── Prompt Builder ──────────────────────────────────────────────────

function buildUserPrompt(
  text: string,
  hints: PreprocessResult,
  projectId?: string,
  sheetRef?: string
): string {
  const parts: string[] = [];

  parts.push(`Project: ${projectId || "(unspecified)"}`);
  parts.push(`Sheet: ${sheetRef || "(unspecified)"}`);
  parts.push(`Millwork Signal Strength: ${(hints.millworkSignalStrength * 100).toFixed(0)}%`);
  parts.push("");

  // Assembly context
  if (hints.assembly) {
    parts.push("## ASSEMBLY DETECTED");
    parts.push(`This sheet describes a single built assembly: "${hints.assembly.name}"`);
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
    // Group by line for readability, limit to most relevant
    const dimsByLine = new Map<number, typeof hints.dimensions>();
    for (const d of hints.dimensions) {
      if (!dimsByLine.has(d.line)) dimsByLine.set(d.line, []);
      dimsByLine.get(d.line)!.push(d);
    }
    for (const [lineNum, dims] of dimsByLine) {
      for (const d of dims) {
        parts.push(`  Line ${d.line}: ${d.raw} = ${d.inches}" = ${d.mm}mm | "${d.context}"`);
      }
    }
  }
  parts.push("");

  // Pre-extracted materials
  parts.push(`## PRE-EXTRACTED MATERIALS (${hints.materials.length} found)`);
  for (const m of hints.materials) {
    parts.push(`  ${m.code}: ${m.fullName} [${m.category}]`);
  }
  parts.push("");

  // Pre-extracted hardware
  parts.push(`## PRE-EXTRACTED HARDWARE (${hints.hardware.length} found)`);
  for (const h of hints.hardware) {
    parts.push(`  ${h.type}: qty=${h.qty}${h.size ? `, size=${h.size}` : ""}${h.spec ? `, spec="${h.spec}"` : ""}`);
  }
  parts.push("");

  // Pre-extracted equipment
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

  // The OCR text
  parts.push("## OCR TEXT");
  parts.push('"""');
  parts.push(hints.cleanedText);
  parts.push('"""');
  parts.push("");
  parts.push(`Output ONLY valid TOON with this exact header:`);
  parts.push(HEADER_V14);

  return parts.join("\n");
}

// ─── LLM Calls ───────────────────────────────────────────────────────

async function callAnthropic(userPrompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    temperature: 0.05,
    system: SYSTEM_PROMPT_V14,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = message.content.find((b: any) => b.type === "text");
  return textBlock?.text?.trim() ?? "";
}

async function callOpenAI(userPrompt: string): Promise<string> {
  const oai = await getOpenAI();
  const completion = await oai.chat.completions.create({
    model: MODEL_FALLBACK,
    temperature: 0.05,
    messages: [
      { role: "system", content: SYSTEM_PROMPT_V14 },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ─── Handler ─────────────────────────────────────────────────────────

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

  const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const useOpenAI = !!process.env.OPENAI_API_KEY;

  if (!useAnthropic && !useOpenAI) {
    return res.status(500).json({
      error: "Missing API key. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in environment.",
    });
  }

  try {
    // ── STAGE 1: Pre-process ──
    const t0 = Date.now();
    const hints = preprocess(text, sheetRef);
    const preprocessMs = Date.now() - t0;

    // ── STAGE 2: LLM Extraction ──
    const userPrompt = buildUserPrompt(text, hints, projectId, sheetRef);
    const t1 = Date.now();

    let toon: string;
    let modelUsed: string;

    if (useAnthropic) {
      toon = await callAnthropic(userPrompt);
      modelUsed = MODEL;
    } else {
      toon = await callOpenAI(userPrompt);
      modelUsed = MODEL_FALLBACK;
    }
    const llmMs = Date.now() - t1;

    // Validate TOON header
    if (!isValidToon(toon, HEADER_V14)) {
      // Try to salvage: sometimes the model wraps in markdown code fences
      const fenceMatch = toon.match(/```(?:toon|csv|text)?\s*\n?(#TOON[\s\S]*?)```/);
      if (fenceMatch) {
        toon = fenceMatch[1].trim();
      }

      if (!isValidToon(toon, HEADER_V14)) {
        console.error("[ScopeExtractor v14] invalid TOON:", toon.slice(0, 500));
        return res.status(400).json({
          ok: false,
          error: "Model did not return valid TOON",
          preview: toon.slice(0, 500),
          model: modelUsed,
          hints: {
            assembly: hints.assembly,
            dimensionCount: hints.dimensions.length,
            materialCount: hints.materials.length,
            hardwareCount: hints.hardware.length,
            millworkSignal: hints.millworkSignalStrength,
          },
        });
      }
    }

    // Decode TOON rows
    const rawRows = decodeToon(toon);

    // ── STAGE 3: Post-process ──
    const t2 = Date.now();
    const result = postprocess(rawRows);
    const postprocessMs = Date.now() - t2;

    return res.status(200).json({
      ok: true,
      version: "v14",
      projectId: projectId || null,
      sheetRef: sheetRef || null,
      model: modelUsed,

      // Extraction results
      toon,
      rows: result.rows,
      assemblies: result.assemblies,

      // Pre-processor output (for debugging / UI display)
      hints: {
        assembly: hints.assembly,
        dimensionCount: hints.dimensions.length,
        materialCount: hints.materials.length,
        hardwareCount: hints.hardware.length,
        equipmentCount: hints.equipment.length,
        detailRefCount: hints.detailRefs.length,
        millworkSignalStrength: hints.millworkSignalStrength,
        // Include full hints for debugging (remove in production if too verbose)
        dimensions: hints.dimensions,
        materials: hints.materials,
        hardware: hints.hardware,
        equipment: hints.equipment,
      },

      // Post-processor stats
      stats: result.stats,
      warnings: result.warnings,

      // Performance
      timing: {
        preprocessMs,
        llmMs,
        postprocessMs,
        totalMs: preprocessMs + llmMs + postprocessMs,
      },
    });
  } catch (err: any) {
    console.error("[ScopeExtractor v14] error:", err?.message);
    return res.status(500).json({
      ok: false,
      version: "v14",
      error: err?.message || "scope-extractor-v14 failed",
    });
  }
}
