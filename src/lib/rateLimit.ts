import type { NextRequest } from "next/server";

// Simple in-memory sliding-window limiter. Each server instance keeps its own counts,
// so it's a burst guard, not an exact global limit (per-account limits live in the database).
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    // Drop the oldest keys so memory stays bounded.
    for (const k of [...hits.keys()].slice(0, 5_000)) hits.delete(k);
  }
  return true;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
