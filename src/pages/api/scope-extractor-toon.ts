// src/pages/api/scope-extractor-toon.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { decodeToon, isValidToon } from "@/lib/toon";
import { MW_ITEM_SCHEMA } from "@/lib/toonSchemas";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HEADER = `#TOON v=1 sep=; cols=${MW_ITEM_SCHEMA.join(",")}`;

const SYSTEM_PROMPT = `
You are ScopeExtractor, an expert architectural millwork estimator.

Goal:
- Read architectural notes, schedules, and plan annotations.
- Extract only ARCHITECTURAL WOODWORK / MILLWORK / CASEWORK scope items that should
  be priced by a millwork subcontractor.

Output format:
- You MUST output strictly in TOON format.
- The FIRST LINE must be exactly this header (no extra spaces):

${HEADER}

- One line per item.
- Each column maps to MW_ITEM_SCHEMA in this order:

${MW_ITEM_SCHEMA.join(", ")}

Rules:
- If a field is unknown, leave it empty.
- Use consistent item_type values like: "upper_cabinet", "base_cabinet", "countertop",
  "paneling", "reception_desk", "vanity", etc.
- Use "ea" (each) for qty unit by default unless clearly linear (lf) or area (sf).
- Measurements are in millimeters (mm); convert if the plans are in inches.
- room = room name/number; level = floor; zone = area tag if mentioned.
- sheet_ref and detail_ref should match what appears in the text (e.g. "A8.41", "Detail 9").
- notes may include any clarifying remarks, options, or assumptions.
`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const { text, projectId, sheetRef } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY in environment" });
  }

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    const userPrompt = `
Project: ${projectId || "(unspecified)"}
Sheet: ${sheetRef || "(unspecified)"}

Extract millwork / casework scope items from the following content
and output ONLY valid TOON with header:

${HEADER}

Text:
"""
${text}
"""
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT.trim() },
        { role: "user", content: userPrompt },
      ],
    });

    const toon =
      completion.choices[0]?.message?.content?.trim() ?? "";

    if (!isValidToon(toon, HEADER)) {
      console.error("[ScopeExtractor] invalid TOON output:", toon.slice(0, 300));
      return res.status(400).json({
        ok: false,
        error: "Model did not return valid TOON",
        preview: toon.slice(0, 300),
      });
    }

    const rows = decodeToon(toon);

    return res.status(200).json({
      ok: true,
      projectId: projectId || null,
      sheetRef: sheetRef || null,
      toon,
      rows, // <- JSON rows you can store in Firestore or pass to the next step
    });
  } catch (err: any) {
    console.error("[ScopeExtractor] error:", err?.message);
    return res.status(500).json({
      ok: false,
      error: err?.message || "scope-extractor-toon failed",
    });
  }
}
