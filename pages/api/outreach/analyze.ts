// ─────────────────────────────────────────────────────────────────────────────
// pages/api/outreach/analyze.ts
//
// POST /api/outreach/analyze
//
// Reads a raw job description and returns a structured JDAnalysis object:
//   - relevance_score 1–10
//   - pitch angle, team size, company tier
//   - pain phrases and software extracted verbatim from the JD
//   - hook sentence for email personalization
//   - auto_approve flag (score >= 8)
//
// Called by the Review Dashboard immediately after a lead is selected,
// and by the nightly Scout Agent pipeline for batch processing.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODEL, MAX_TOKENS_ANALYSIS, parseJSON, extractText } from "../../../lib/anthropic";
import { buildAnalyzePrompt } from "../../../lib/prompts";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  JDAnalysis,
  ErrorResponse,
} from "../../../types/outreach";

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(body: unknown): body is AnalyzeRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.lead_id  === "string" && b.lead_id.trim().length > 0 &&
    typeof b.jd_text  === "string" && b.jd_text.trim().length > 20 &&
    typeof b.company  === "string" && b.company.trim().length > 0 &&
    typeof b.title    === "string" && b.title.trim().length > 0
  );
}

// ─── Scoring guard ────────────────────────────────────────────────────────────
// Clamp and validate the score Claude returns — it occasionally drifts slightly
// outside 1–10 on edge-case JDs.
function normalizeScore(raw: unknown): number {
  const n = Number(raw);
  if (isNaN(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyzeResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  if (!validate(req.body)) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid fields. Required: lead_id, jd_text, company, title.",
      code: "VALIDATION_ERROR",
    });
  }

  const { lead_id, jd_text, company, title } = req.body as AnalyzeRequest;

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_ANALYSIS,
      messages: [
        {
          role: "user",
          content: buildAnalyzePrompt(jd_text, company, title),
        },
      ],
    });

    const rawText = extractText(message.content);
    const parsed  = parseJSON<Record<string, unknown>>(rawText);

    // Build the typed analysis object, normalizing each field defensively
    const analysis: JDAnalysis = {
      lead_id,
      relevance_score:   normalizeScore(parsed.relevance_score),
      pitch_angle:       (["speed","accuracy","AI_native","cost_reduction"].includes(parsed.pitch_angle as string)
                           ? parsed.pitch_angle : "speed") as JDAnalysis["pitch_angle"],
      team_size_signal:  (["solo","small","mid","large"].includes(parsed.team_size_signal as string)
                           ? parsed.team_size_signal : "mid") as JDAnalysis["team_size_signal"],
      company_tier:      (["sub","gc","owner","unknown"].includes(parsed.company_tier as string)
                           ? parsed.company_tier : "unknown") as JDAnalysis["company_tier"],
      project_types:     Array.isArray(parsed.project_types) ? parsed.project_types.map(String) : [],
      pain_phrases:      Array.isArray(parsed.pain_phrases)  ? parsed.pain_phrases.map(String)  : [],
      software_mentioned:Array.isArray(parsed.software_mentioned) ? parsed.software_mentioned.map(String) : [],
      hook_sentence:     typeof parsed.hook_sentence === "string" ? parsed.hook_sentence : "",
      auto_approve:      normalizeScore(parsed.relevance_score) >= 8,
      analyzed_at:       new Date().toISOString(),
    };

    return res.status(200).json({ success: true, analysis });

  } catch (err: unknown) {
    console.error("[/api/outreach/analyze] Error:", err);

    // Surface Claude-specific errors distinctly for easier debugging
    const message = err instanceof Error ? err.message : "Unknown error";
    const isParseError = message.includes("non-JSON");

    return res.status(isParseError ? 422 : 500).json({
      success: false,
      error:   isParseError
        ? "Claude returned malformed JSON. Retry or check the JD for unusual characters."
        : "Analysis failed. Check server logs.",
      code: isParseError ? "PARSE_ERROR" : "CLAUDE_ERROR",
    });
  }
}
