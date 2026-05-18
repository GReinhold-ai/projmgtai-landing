// proxy.ts (Next.js 16 - formerly middleware.ts; renamed per v16 deprecation)
//
// Next.js Proxy. Runs before any API route or page.
// Currently gates only /api/extract-and-export (the LLM-cost-bearing route).
//
// Other routes are unaffected. Auth pages, healthchecks, static assets
// all bypass this middleware via the matcher config below.
//
// Source: §13 Priority 1 hardening, May 16 production-readiness audit.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "./lib/rate-limit";

export const config = {
  matcher: ["/api/extract-and-export"],
};

export async function proxy(req: NextRequest) {
  // Vercel sets x-forwarded-for; fall back to a constant if missing
  // so dev/local doesn't error. In production this header is always set.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    const result = await checkRateLimit(ip);

    if (!result.success) {
      const retryAfter = result.reset
        ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
        : 60;

      return new NextResponse(
        JSON.stringify({
          error: "Rate limit exceeded",
          tier: result.tier,
          limit: result.limit,
          remaining: result.remaining,
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(result.limit ?? ""),
            "X-RateLimit-Remaining": String(result.remaining ?? ""),
            "X-RateLimit-Reset": String(result.reset ?? ""),
          },
        }
      );
    }

    return NextResponse.next();
  } catch (err) {
    // Fail open: if Redis is down or middleware errors, let the request
    // through rather than blocking legitimate users. The Anthropic-cost
    // exposure during an outage is bounded by how long Redis stays down.
    // Worth re-evaluating if we move to a paid Upstash plan with SLA.
    console.error("[rate-limit] middleware error, failing open:", err);
    return NextResponse.next();
  }
}
