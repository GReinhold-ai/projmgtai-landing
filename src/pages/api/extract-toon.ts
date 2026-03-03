import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { MW_ITEM_SCHEMA } from "@/lib/toonSchemas";
import { encodeToon, decodeToon } from "@/lib/toon";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SCHEMA_LINE = `cols=${MW_ITEM_SCHEMA.join(",")}`;
const HEADER = `#TOON v=1 sep=; ${SCHEMA_LINE}`;

const SYSTEM = `
You are ScopeExtractor for architectural millwork.
Output STRICTLY in TOON format with this exact header on the first line:
${HEADER}
No prose, no explanation, no JSON. One item per line.
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" });

    const userPrompt = `
Parse the following text and extract millwork items. If data is unknown, leave fields empty.

Text:
"""
${text}
"""
Expected TOON header (repeat exactly): ${HEADER}
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini", // or your chosen model
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
    });

    const toon = (resp.choices[0]?.message?.content || "").trim();

    // Basic guardrail: ensure the header is present
    if (!toon.startsWith(HEADER)) {
      return res.status(400).json({ error: "Model did not return valid TOON", raw: toon.slice(0, 500) });
    }

    const rows = decodeToon(toon);
    return res.status(200).json({ ok: true, rows, toon });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "extract-toon failed" });
  }
}
