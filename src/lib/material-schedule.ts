// src/lib/material-schedule.ts
//
// D1 - Material Schedule / Finish Legend extractor (Haiku 4.5).
//
// Replaces the brittle quote-delimited regex at scope-extractor-v14.ts
// lines 154-188. Reads the full document text (no page filtering - per the
// hard-learned rule, the model handles mixed-content pages) and returns clean
// MaterialLegendEntry rows. Downstream code already consumes these unchanged:
//   - per-room prompt injection ("## PROJECT MATERIAL LEGEND", ~line 701)
//   - assignMaterialCodes() row resolution (~line 1503)
//
// Why Haiku, not the coordinate parser in app/scope-extractor/
// finish-schedule-parser.ts: the route works on text, and Haiku handles the
// multi-column / messy legends that defeat the text-only regex - without the
// client-side pdf.js coordinate plumbing the coord parser needs. The coord
// parser remains the future deterministic upgrade once coordinates are wired.
//
// Output contract: TOON (project standard), decoded via decodeToon.
// Honest absence: returns [] on no-legend or any failure - never throws,
// never synthesizes codes.

import type Anthropic from "@anthropic-ai/sdk";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_MATERIAL_SCHEMA } from "@/lib/toonSchemas";

const MODEL_MATERIAL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_MATERIAL = 4096;

// Structurally identical to the MaterialLegendEntry interface declared in
// scope-extractor-v14.ts, so `ctx.materialLegend = await extractMaterialLegend(...)`
// type-checks without touching the route's own declaration.
export interface MaterialLegendEntry {
  code: string;
  manufacturer: string;
  productName: string;
  catalogNumber: string;
  category: string;
}

const TOON_HEADER = `#TOON v=1 sep=; cols=${MW_MATERIAL_SCHEMA.join(",")}`;

// Known finish/material code prefixes - union of the v14.9.31 material-legend
// regex and the finish-schedule-parser catalog. Used to (a) validate that a
// row's code is a real code and (b) derive a reliable category server-side
// rather than trusting the model's category guess.
const PREFIX_CATEGORY: Record<string, string> = {
  PL: "laminate",
  SS: "solid_surface",
  QZ: "quartz",
  GR: "granite",
  WD: "wood",
  GL: "glass",
  MEL: "melamine",
  ST: "stainless",
  FB: "blocking",
  "3F": "specialty",
  AF: "architectural_finish",
  RC: "cabinet_finish",
  FM: "framed_mirror",
  MR: "mirror",
  WC: "wall_covering",
  CT: "ceramic_tile",
  PT: "paint",
  LVP: "flooring",
  CPT: "carpet",
  VCT: "flooring",
  STA: "stain",
  COR: "corian",
  LN: "linoleum",
  RB: "rubber_base",
  VB: "vinyl_base",
};

// A code looks like PREFIX-digits(+optional letter): PL-01, SS-1B, AF-3, QZ-1,
// 3F-1; or a known bare code. Prose fragments ("SS THAN 6") fail this test.
const CODE_RE = /^([A-Z0-9]{1,4})-?\d+[A-Z]?$|^(EPOXY|FRP|SC)$/;

function categoryFor(code: string, modelGuess: string): string {
  const c = code.trim().toUpperCase();
  const prefix = c.includes("-") ? c.split("-")[0] : c.replace(/\d.*$/, "");
  const known = PREFIX_CATEGORY[prefix];
  if (known) return known;
  const g = (modelGuess || "").trim();
  return g && g.toLowerCase() !== "unknown" ? g : "unknown";
}

function isPlausibleEntry(e: MaterialLegendEntry): boolean {
  if (!e.code || !CODE_RE.test(e.code.trim().toUpperCase())) return false;
  // Reject rows with no product info at all. The prose-fragment failure mode
  // (BHH "SS THAN 6 LENGTHS") is caught by CODE_RE above, since the "code"
  // field would not match. Belt-and-suspenders.
  if (!(e.manufacturer || "").trim() && !(e.productName || "").trim()) return false;
  return true;
}

const SYSTEM_PROMPT = `You extract the MATERIAL / FINISH LEGEND from an architectural woodwork bid set.

The legend (a.k.a. material schedule, finish material selections, finish legend)
maps short codes to actual products. Codes look like: PL-1, SS-1, SS-2, QZ-1,
RC-1, RC-3, AF-3, AF-6, WD-1, STA-1, MEL-1, 3F-1. The prefix varies by project.

For EACH code paired with an explicit product definition in a legend or schedule
block, output one row with these columns, in this order:
  code           the code, normalized to PREFIX-NUMBER (e.g. PL01 -> PL-1)
  manufacturer   manufacturer / brand (e.g. "Wilsonart", "Vicostone/Pental")
  productName    product / pattern / color name (e.g. "Mystique #9200CS")
  catalogNumber  catalog or model number if present (e.g. "7816-60"), else empty
  category       leave EMPTY - it is derived downstream from the code prefix

RULES:
- Find the legend WHEREVER it appears. Do not assume a page number.
- Emit a row ONLY when a code has an explicit product definition. Do NOT emit
  codes that appear only as inline references in scope rows with no definition.
- DO NOT treat prose or spec fragments as codes. "SS THAN 6 LENGTHS" and
  "ST AND STRIP JOINTS" are sentence fragments, NOT codes - skip them.
- DO NOT invent or infer codes. If the document contains no legend, output ONLY
  the header line with zero data rows.

OUTPUT - TOON only, no prose, no markdown fences. First line is the header:
${TOON_HEADER}
<one row per code, fields joined by ";", in the column order above>

EXAMPLE (correct output):
${TOON_HEADER}
PL-1;Wilsonart;Solar Oak;7816-60;
SS-1;Wilsonart;Mystique #9200CS;;
QZ-1;Vicostone/Pental;Quartz Diamante;BQ8788;
RC-1;Fast Cabinet Doors;Revere Stained Shaker;;`;

export async function extractMaterialLegend(
  allText: string,
  client: Anthropic,
): Promise<MaterialLegendEntry[]> {
  if (!allText || allText.trim().length < 40) return [];

  try {
    const msg = await client.messages.create({
      model: MODEL_MATERIAL,
      max_tokens: MAX_TOKENS_MATERIAL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: allText }],
    });

    const rawText = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!rawText.startsWith("#TOON")) {
      console.log("[D1-material] no TOON header in model output; 0 entries");
      return [];
    }
    if (!isValidToon(rawText, TOON_HEADER)) {
      console.log("[D1-material] invalid TOON; 0 entries");
      return [];
    }

    // decodeToon returns row objects keyed by the declared column names.
    const rows = decodeToon(rawText) as Array<Record<string, string>>;

    const entries: MaterialLegendEntry[] = [];
    for (const r of rows) {
      const code = (r.code || "").trim();
      const entry: MaterialLegendEntry = {
        code,
        manufacturer: (r.manufacturer || "").trim(),
        productName: (r.productName || "").trim(),
        catalogNumber: (r.catalogNumber || "").trim(),
        category: categoryFor(code, (r.category || "").trim()),
      };
      if (isPlausibleEntry(entry)) entries.push(entry);
    }

    // Dedupe by code (keep first - the legend-block definition).
    const seen = new Set<string>();
    const deduped = entries.filter((e) => {
      const k = e.code.toUpperCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    console.log(
      `[D1-material] haiku legend: ${deduped.length} entries (${rows.length} raw rows)`,
    );
    return deduped;
  } catch (err) {
    console.log(
      `[D1-material] extraction failed, returning 0 entries: ${(err as Error)?.message}`,
    );
    return [];
  }
}
