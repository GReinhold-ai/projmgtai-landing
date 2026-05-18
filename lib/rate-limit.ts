// lib/rate-limit.ts
//
// Rate limiting via Upstash Redis. Two-tier sliding window:
//   - Burst: 5 requests / 1 minute   (catches parallel attacks)
//   - Sustained: 30 requests / 1 hour (catches slow scrapers)
//
// Applied per IP address. Used by middleware.ts to gate
// /api/extract-and-export (the LLM-cost-bearing route).
//
// Source: §13 Priority 1 hardening, May 16 production-readiness audit.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Both env vars must exist. Vercel injects them at runtime.
const redis = Redis.fromEnv();

// Tier 1: Burst limit — 5 requests per minute per IP.
export const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  analytics: true,
  prefix: "ratelimit:burst",
});

// Tier 2: Sustained limit — 30 requests per hour per IP.
export const sustainedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  analytics: true,
  prefix: "ratelimit:sustained",
});

// Check both tiers. Returns the first one that fails, or success.
export async function checkRateLimit(ip: string): Promise<{
  success: boolean;
  tier?: "burst" | "sustained";
  limit?: number;
  remaining?: number;
  reset?: number;
}> {
  const burst = await burstLimiter.limit(ip);
  if (!burst.success) {
    return {
      success: false,
      tier: "burst",
      limit: burst.limit,
      remaining: burst.remaining,
      reset: burst.reset,
    };
  }

  const sustained = await sustainedLimiter.limit(ip);
  if (!sustained.success) {
    return {
      success: false,
      tier: "sustained",
      limit: sustained.limit,
      remaining: sustained.remaining,
      reset: sustained.reset,
    };
  }

  return { success: true };
}
