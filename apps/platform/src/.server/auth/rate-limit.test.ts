import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client_ip, reserve, reset_rate_limits } from "./rate-limit";

const from = (value: string, name = "x-forwarded-for") =>
  client_ip(new Headers({ [name]: value }));

describe("client_ip", () => {
  it("puts two ipv6 addresses in one /64 on the same key", () => {
    const a = from("2001:db8:85a3:12::1");
    const b = from("2001:db8:85a3:12:ffff:abcd:1:2");

    expect(a).toBe(b);
    expect(a).not.toBe(from("2001:db8:85a3:13::1"));
  });

  it("keys an ipv4-mapped address as its ipv4, not the shared ::ffff /64", () => {
    expect(from("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(from("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("yields no ip for a header value that is not an address", () => {
    expect(from("not-an-ip")).toBeNull();
    expect(from("evil:key", "x-vercel-forwarded-for")).toBeNull();
    expect(from("203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("reserve", () => {
  const KEY = "k";
  const QUOTA = { max: 2, window_s: 60 };

  beforeEach(() => {
    reset_rate_limits();
    vi.useFakeTimers({ now: 0 });
  });
  afterEach(() => vi.useRealTimers());

  it("returns a use to its window only once, however often it is released", () => {
    const first = reserve(KEY, QUOTA);
    reserve(KEY, QUOTA);

    first?.release();
    first?.release();

    expect(reserve(KEY, QUOTA)).not.toBeNull();
    expect(reserve(KEY, QUOTA)).toBeNull();
  });

  it("leaves a newer window alone when released after its own rolled over", () => {
    const stale = reserve(KEY, QUOTA);
    vi.advanceTimersByTime(QUOTA.window_s * 1000);
    reserve(KEY, QUOTA);
    reserve(KEY, QUOTA);

    stale?.release();

    expect(reserve(KEY, QUOTA)).toBeNull();
  });
});
