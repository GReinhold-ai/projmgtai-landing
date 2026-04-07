// ─────────────────────────────────────────────────────────────────────────────
// lib/anthropic.ts
// Thin wrapper around the Anthropic SDK — shared by all outreach API routes.
// Keeps the API key in one place and enforces the project-wide model/token defaults.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Project-wide defaults — override per-call only if you have a good reason
export const MODEL    = "claude-sonnet-4-20250514";
export const MAX_TOKENS_ANALYSIS    = 600;
export const MAX_TOKENS_PITCH       = 1400;

// ─────────────────────────────────────────────────────────────────────────────
// parseJSON
// Strips markdown fences Claude sometimes adds even when told not to, then
// parses.  Throws a typed error so callers can return a clean 422 response.
// ─────────────────────────────────────────────────────────────────────────────
export function parseJSON<T>(raw: string): T {
  const clean = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(clean) as T;
  } catch {
    throw new Error(`Claude returned non-JSON output: ${clean.slice(0, 120)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extractText
// Pulls all text blocks from a Claude response content array.
// ─────────────────────────────────────────────────────────────────────────────
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
