import * as v from "valibot";

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

/** Whether `key` has a use left under `quota`, without recording one. */
export function has_quota(key: string, quota: Quota): boolean {
  const bucket = buckets.get(key);
  return !bucket || Date.now() >= bucket.reset_at || bucket.count < quota.max;
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

const IPV4 = v.pipe(v.string(), v.ipv4());
const IPV6 = v.pipe(v.string(), v.ipv6());

/** the caller's address as a bucket key. an ipv6 client holds a whole /64, so
 * it is keyed by that prefix — per-address keys would hand it a fresh quota
 * per address. */
export function client_ip(headers: Headers): string | null {
  for (const name of IP_HEADERS) {
    // a forwarding chain lists the client first
    const ip = headers.get(name)?.split(",")[0]?.trim();
    if (!ip) continue;
    if (v.is(IPV4, ip)) return ip;
    if (v.is(IPV6, ip)) return ipv6_key(ip);
  }
  return null;
}

/** `2001:db8::1` → `2001:0db8:0000:0000:0000:0000:0000:0000`, better-auth's
 * own key for the same /64. an ipv4-mapped address is an ipv4 client and keys
 * as one — the /64 they share is `::`, every such client at once. */
function ipv6_key(ip: string): string {
  const g = ipv6_groups(ip);
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  if (mapped) {
    const [hi = 0, lo = 0] = g.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  const prefix = g.slice(0, 4).map((x) => x.toString(16).padStart(4, "0"));
  return [...prefix, "0000", "0000", "0000", "0000"].join(":");
}

/** the eight 16-bit groups of an address `IPV6` already accepted */
function ipv6_groups(ip: string): number[] {
  const parse = (part: string) =>
    (part ? part.split(":") : []).flatMap((x) => {
      if (!x.includes(".")) return [Number.parseInt(x, 16)];
      const [a = 0, b = 0, c = 0, d = 0] = x.split(".").map(Number);
      return [(a << 8) | b, (c << 8) | d];
    });
  const [head = "", tail] = ip.split("::");
  const left = parse(head);
  if (tail === undefined) return left;
  const right = parse(tail);
  const zeros = Array<number>(8 - left.length - right.length).fill(0);
  return [...left, ...zeros, ...right];
}

/** test seam — the counters outlive a single request by design */
export function reset_rate_limits(): void {
  buckets.clear();
}
