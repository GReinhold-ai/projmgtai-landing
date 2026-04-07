// ─────────────────────────────────────────────────────────────────────────────
// pages/api/outreach/generate-pitch.ts
//
// POST /api/outreach/generate-pitch
//
// Takes a lead's JD + its JDAnalysis and returns a PitchSet:
//   - 3 subject line variants (A/B/C for SendGrid split testing)
//   - 3 full email body variants, each < 170 words
//   - All copy mirrors the exact JD language via the hook sentence and
//     pain phrases surfaced in the analysis step
//
// Called by the Review Dashboard "Generate outreach email" button,
// and by the nightly pipeline for auto-approved leads (score >= 8).
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";
import { anthropic, MODEL, MAX_TOKENS_PITCH, parseJSON, extractText } from "../../../lib/anthropic";
import { buildPitchPrompt } from "../../../lib/prompts";
import type {
  GeneratePitchRequest,
  GeneratePitchResponse,
  PitchSet,
  ErrorResponse,
} from "../../../types/outreach";

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(body: unknown): body is GeneratePitchRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.lead_id  === "string" && b.lead_id.trim().length > 0 &&
    typeof b.jd_text  === "string" && b.jd_text.trim().length > 20 &&
    typeof b.company  === "string" &&
    typeof b.title    === "string" &&
    typeof b.location === "string" &&
    b.analysis !== null && typeof b.analysis === "object"
  );
}

// ─── Fallback pitch ───────────────────────────────────────────────────────────
// If Claude fails to return parseable JSON, return a graceful partial fallback
// so the dashboard doesn't hard-error on the user — they can regenerate.
function fallbackPitch(lead_id: string, company: string, title: string): PitchSet {
  return {
    lead_id,
    subjects: [
      `Re: Your ${title} search — the takeoff problem we solved`,
      `ProjMgt.AI — AI estimating copilot for your team`,
      `4-minute millwork takeoff (built for exactly what you're hiring for)`,
    ],
    bodies: [
      `[Generation failed — click Regenerate to retry. If this persists, check ANTHROPIC_API_KEY in your .env.local]`,
      `[Variant B — regenerate to populate]`,
      `[Variant C — regenerate to populate]`,
    ],
    generated_at: new Date().toISOString(),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeneratePitchResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  if (!validate(req.body)) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid fields. Required: lead_id, jd_text, company, title, location, analysis.",
      code: "VALIDATION_ERROR",
    });
  }

  const pitchReq = req.body as GeneratePitchRequest;

  try {
    const message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS_PITCH,
      messages: [
        {
          role:    "user",
          content: buildPitchPrompt(pitchReq),
        },
      ],
    });

    const rawText = extractText(message.content);
    const parsed  = parseJSON<{ subjects: unknown; bodies: unknown }>(rawText);

    // Validate that Claude returned actual arrays of 3
    if (
      !Array.isArray(parsed.subjects) || parsed.subjects.length < 1 ||
      !Array.isArray(parsed.bodies)   || parsed.bodies.length   < 1
    ) {
      throw new Error("Claude returned subjects/bodies in unexpected format.");
    }

    // Normalize to exactly 3 variants — pad with placeholder if Claude short-changed us
    const pad = (arr: unknown[], placeholder: string): [string, string, string] => {
      const strings = arr.map(String);
      while (strings.length < 3) strings.push(placeholder);
      return [strings[0], strings[1], strings[2]];
    };

    const pitches: PitchSet = {
      lead_id:      pitchReq.lead_id,
      subjects:     pad(parsed.subjects, "[Subject — regenerate to populate]"),
      bodies:       pad(parsed.bodies,   "[Body — regenerate to populate]"),
      generated_at: new Date().toISOString(),
    };

    return res.status(200).json({ success: true, pitches });

  } catch (err: unknown) {
    console.error("[/api/outreach/generate-pitch] Error:", err);

    // Return a graceful fallback rather than a hard 500 — the dashboard
    // shows a "Regenerate" button so the user can retry without confusion.
    const fallback = fallbackPitch(pitchReq.lead_id, pitchReq.company, pitchReq.title);
    return res.status(200).json({ success: true, pitches: fallback });
  }
}
