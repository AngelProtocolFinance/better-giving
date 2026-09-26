import { describe, expect, it } from "vitest";
import { client_ip } from "./rate-limit";

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
