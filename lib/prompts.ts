// ─────────────────────────────────────────────────────────────────────────────
// lib/prompts.ts
// All Claude prompt templates for the Estimator Outreach pipeline.
// Kept here so they can be versioned, A/B tested, and tuned without touching
// the API route logic.
// ─────────────────────────────────────────────────────────────────────────────

import type { JDAnalysis, GeneratePitchRequest } from "../types/outreach";

// ─── PROOF POINTS ─────────────────────────────────────────────────────────────
// Real project results — update as new North County Cabinetry test projects land
const PROOF_POINTS = [
  "24 Hour Fitness Ventura — complete millwork and casework takeoff from architectural PDF in under 4 minutes",
  "Coto De Caza Golf & Racquet Club — multi-room millwork scope extracted and Excel workbook output in one pass",
  "24 Hour Fitness Navajo — full TOON-format takeoff with RFI flags generated automatically from PDF",
];

// ─── SYSTEM CONTEXT (shared) ──────────────────────────────────────────────────
export const SYSTEM_CONTEXT = `You are an AI pipeline agent for ProjMgt.AI, an AI-native millwork and casework estimating copilot built by Gary Reinhold — Founder of Centriv AI, retired USMC Lt. Colonel, and 40-year veteran of construction, aviation, and large-scale logistics operations.

ProjMgt.AI extracts millwork and casework scope from architectural PDFs and outputs a structured Excel workbook with line items, dimensions, material codes, room groupings, and auto-generated RFI flags. It is purpose-built for estimators at specialty subcontractors and GCs.`;

// ─── ANALYZE PROMPT ──────────────────────────────────────────────────────────
export function buildAnalyzePrompt(jd_text: string, company: string, title: string): string {
  return `${SYSTEM_CONTEXT}

Analyze the following Estimator job description for ProjMgt.AI sales relevance. Return ONLY a valid JSON object — no markdown fences, no explanation, no preamble.

Company: ${company}
Title: ${title}

Job Description:
---
${jd_text}
---

Return exactly this JSON structure:
{
  "relevance_score": <integer 1-10>,
  "pitch_angle": <"speed" | "accuracy" | "AI_native" | "cost_reduction">,
  "team_size_signal": <"solo" | "small" | "mid" | "large">,
  "company_tier": <"sub" | "gc" | "owner" | "unknown">,
  "project_types": [<string array, e.g. "TI", "Healthcare", "Millwork">],
  "pain_phrases": [<array of exact phrases from the JD that signal manual pain>],
  "software_mentioned": [<array of software tools named in the JD>],
  "hook_sentence": "<one sentence opening an outreach email, using exact JD language>"
}

Scoring guide:
- Base score on overlap with millwork/casework estimating, takeoff volume, and Excel workflows
- +1 if millwork or casework explicitly mentioned
- +1 if Excel or spreadsheet-based workflow mentioned
- +1 if high bid volume or tight deadlines mentioned
- Score >= 8 means auto-approve for immediate send
- Score 5-7 means human review required
- Score <= 4 means archive, do not send`;
}

// ─── GENERATE PITCH PROMPT ────────────────────────────────────────────────────
export function buildPitchPrompt(req: GeneratePitchRequest): string {
  const { company, title, location, contact_name, analysis } = req;

  const salutation = contact_name
    ? `Hi ${contact_name.split(" ")[0]},`
    : `Hi,`;

  // Pick the most relevant proof point based on pitch angle
  const proof = analysis.pitch_angle === "speed"
    ? PROOF_POINTS[0]
    : analysis.pitch_angle === "accuracy"
    ? PROOF_POINTS[2]
    : PROOF_POINTS[1];

  const angleGuidance: Record<string, string> = {
    speed:        "Lead with how fast ProjMgt.AI turns around a full takeoff. Emphasize time-per-bid savings.",
    accuracy:     "Lead with RFI auto-generation and scope completeness. Emphasize fewer errors and fewer change orders.",
    AI_native:    "Lead with the AI copilot angle — this isn't automation, it's an estimating partner that reads drawings.",
    cost_reduction: "Lead with bid overhead reduction and the cost of a manual estimator vs. AI-assisted throughput.",
  };

  return `${SYSTEM_CONTEXT}

Write 3 cold outreach email variants for this Estimator job posting. Each variant should have a different strategic angle but all must sound like a knowledgeable industry peer who read the actual posting — not a blast email.

Target:
- Company: ${company}
- Title: ${title}
- Location: ${location}
- Salutation to use: ${salutation}

JD excerpt:
---
${req.jd_text.slice(0, 800)}
---

AI analysis results:
- Pain phrases detected: ${analysis.pain_phrases.join(", ")}
- Software mentioned: ${analysis.software_mentioned.join(", ")}
- Hook sentence: ${analysis.hook_sentence}
- Recommended pitch angle: ${analysis.pitch_angle}
- Angle guidance: ${angleGuidance[analysis.pitch_angle]}

Proof point to include in at least one variant:
"${proof}"

CTA options (use one per variant, vary them):
- "I'd like to show you a 15-minute live demo — reply here or book at projmgt.ai"
- "Can I run a live takeoff on one of your current project PDFs and send you the output?"
- "Happy to send a sample workbook from a similar ${analysis.project_types[0] || "commercial"} project if that's useful"

Signature block for all variants:
Gary Reinhold | Founder, ProjMgt.AI | Centriv AI | projmgt.ai

Hard rules:
- Each email body: 130–170 words maximum
- Open with the hook sentence or a close variant that mirrors JD language
- Never use "I hope this finds you well" or any generic opener
- Never say "our AI tool" — say "ProjMgt.AI" or "the copilot"
- At least one variant must reference a specific pain phrase verbatim from the JD
- Subject lines must be specific, not generic — no "Introducing ProjMgt.AI"

Return ONLY valid JSON, no markdown, no extra text:
{
  "subjects": ["subject line A", "subject line B", "subject line C"],
  "bodies": ["full email body A", "full email body B", "full email body C"]
}`;
}
