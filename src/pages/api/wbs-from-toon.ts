// src/pages/api/wbs-from-toon.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA, MW_WBS_SCHEMA } from "@/lib/toonSchemas";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ITEMS_HEADER = `#TOON v=1 sep=; cols=${MW_ITEM_SCHEMA.join(",")}`;
const WBS_HEADER   = `#TOON v=1 sep=; cols=${MW_WBS_SCHEMA.join(",")}`;

const SYSTEM_PROMPT = `
You are a Millwork WBS Generator for a construction estimator.

Input:
- TOON of raw millwork items (one line per item) using MW_ITEM_SCHEMA:
  ${MW_ITEM_SCHEMA.join(", ")}

Output:
- A roll-up Work Breakdown Structure (WBS) in TOON format.
- The FIRST LINE MUST be EXACTLY this header:

${WBS_HEADER}

Each output row represents a logical pricing bucket. Columns:

${MW_WBS_SCHEMA.join(", ")}

Guidelines:
- Group by wbs_code + room + level + item_type where it makes sense
  (e.g., all upper cabinets in Breakroom 204 on Level 2 might be one row).
- Aggregate qty_total, length_total_mm, width_total_mm, and height_max_mm.
- unit should typically be "ea" for cabinets, "lf" for linear items, "sf" for panels/tops.
- material_primary and finish_primary should reflect the majority of items in the group.
- estimate_basis can be "plan_takeoff" unless a different basis is clear.
- notes can summarize key assumptions or callouts.
- Do not include extra commentary. Only output TOON.
`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const { toonItems, projectId } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY in environment" });
  }

  if (!toonItems || typeof toonItems !== "string") {
    return res.status(400).json({ error: "Missing toonItems" });
  }

  try {
    // Basic guard to ensure the input is TOON with the expected item header
    const firstLine = toonItems.replace(/\r/g, "").split("\n")[0]?.trim() || "";
    if (firstLine !== ITEMS_HEADER.trim()) {
      console.warn("[WBS] Input TOON header mismatch.\nExpected:", ITEMS_HEADER, "\nGot:", firstLine);
      // We can still try decodeToon to get a clearer error:
      try {
        decodeToon(toonItems);
      } catch (e) {
        return res.status(400).json({ error: "Invalid TOON items input", detail: (e as Error).message });
      }
    }

    const userPrompt = `
Project: ${projectId || "(unspecified)"}

Source millwork items in TOON (MW_ITEM_SCHEMA):

${toonItems}

Produce a WBS roll-up in TOON using EXACTLY this header on the first line:

${WBS_HEADER}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT.trim() },
        { role: "user", content: userPrompt },
      ],
    });

    const toonWbs =
      completion.choices[0]?.message?.content?.trim() ?? "";

    if (!isValidToon(toonWbs, WBS_HEADER)) {
      console.error("[WBS] invalid TOON output:", toonWbs.slice(0, 300));
      return res.status(400).json({
        ok: false,
        error: "Model did not return valid WBS TOON",
        preview: toonWbs.slice(0, 300),
      });
    }

    const wbsRows = decodeToon(toonWbs);

    return res.status(200).json({
      ok: true,
      projectId: projectId || null,
      toonWbs,
      wbsRows, // <- JSON rows for your estimating workbook/export
    });
  } catch (err: any) {
    console.error("[WBS] error:", err?.message);
    return res.status(500).json({
      ok: false,
      error: err?.message || "wbs-from-toon failed",
    });
  }
}
