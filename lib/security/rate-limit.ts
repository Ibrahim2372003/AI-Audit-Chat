/**
 * In-memory fixed-window rate limiter — no external service, no new
 * dependency. Honest tradeoff, stated plainly rather than oversold:
 *
 * - Works within a single warm serverless instance. Vercel frequently
 *   reuses the same instance across nearby requests, so this genuinely
 *   stops a casual abuse loop from one IP.
 * - It does NOT coordinate across multiple concurrent instances or
 *   survive a cold start — under real distributed load or a determined
 *   attacker, this is not a substitute for a shared store (Upstash
 *   Redis + @upstash/ratelimit is the standard upgrade path, deliberately
 *   not added here to avoid a paid dependency this capstone doesn't need
 *   yet). Good enough to stop "someone left a tab open in a loop" or a
 *   casual script; not good enough to stop a coordinated attack.
 *
 * Deleting expired entries opportunistically (on each call) rather than
 * running a background interval — keeps this file free of any setInterval
 * that would need its own cleanup/lifecycle management in a serverless
 * function that may be frozen between invocations.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 20;

export function rateLimit(key: string): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  // Opportunistic cleanup: drop any bucket whose window has fully expired,
  // so this Map doesn't grow unbounded across a long-lived warm instance.
  for (const [k, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(k);
  }

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client identifier from request headers. `x-forwarded-for`
 * is what Vercel (and most proxies) set to the real client IP; falls back
 * to a constant so local dev without that header still rate-limits
 * (against a single shared bucket) rather than throwing.
 */
export function getClientKey(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return 'unknown-client';
}
