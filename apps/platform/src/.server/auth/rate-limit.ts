/** Application-level throttling for auth work that runs server-side.
 *
 * better-auth's own limiter lives in its router's `onRequest`, so it only sees
 * traffic that arrives at `/api/auth/*`. Every call this app makes through
 * `auth.api.*` goes straight to the endpoint and is never counted — which is
 * exactly the anonymous lead path. These counters are that missing gate.
 *
 * They are per-process: each serverless instance keeps its own map, so the real
 * ceiling is `max` × live instances, and a cold start resets it. That makes this
 * a blunt cap on a single abusive source rather than an exact quota. A durable
 * one needs a shared store (the app has no redis today); when one exists, swap
 * the map for it and the callers stay as they are.
 */

export interface Quota {
  max: number;
  /** rolling window, in seconds */
  window_s: number;
}

interface Bucket {
  count: number;
  reset_at: number;
}

const buckets = new Map<string, Bucket>();
/** past this, the oldest entries go — bounds a map nobody ever sweeps */
const MAX_BUCKETS = 10_000;

/** Records one use of `key` and reports whether it was within `quota`. */
export function consume(key: string, quota: Quota): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.reset_at) {
    if (buckets.size >= MAX_BUCKETS) prune(now);
    buckets.set(key, { count: 1, reset_at: now + quota.window_s * 1000 });
    return true;
  }

  if (bucket.count >= quota.max) return false;
  bucket.count += 1;
  return true;
}

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.reset_at) buckets.delete(key);
  }
  // still full: every bucket is live, so drop insertion-oldest to make room
  if (buckets.size < MAX_BUCKETS) return;
  const overflow = buckets.size - MAX_BUCKETS + 1;
  let dropped = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++dropped >= overflow) break;
  }
}

/** the same headers `advanced.ipAddress.ipAddressHeaders` names, in the same
 * order — one source of truth for "who is calling" whether the request reached
 * better-auth's router or a loader. */
const IP_HEADERS = ["x-vercel-forwarded-for", "x-forwarded-for"] as const;

export function client_ip(headers: Headers): string | null {
  for (const name of IP_HEADERS) {
    // a forwarding chain lists the client first
    const ip = headers.get(name)?.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return null;
}

/** test seam — the counters outlive a single request by design */
export function reset_rate_limits(): void {
  buckets.clear();
}
