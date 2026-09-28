import { describe, expect, test } from "vitest";
import { safe_redirect } from "./safe-redirect";

const FALLBACK = "/marketplace";

describe("safe_redirect", () => {
  test("a same-origin path passes through", () => {
    expect(safe_redirect("/dashboard", FALLBACK)).toBe("/dashboard");
  });

  test("an absolute url falls back", () => {
    expect(safe_redirect("https://evil.example", FALLBACK)).toBe(FALLBACK);
  });

  test.each([
    ["protocol-relative", "//evil.example"],
    ["backslash authority", "/\\evil.example"],
    // the url parser strips tab/newline anywhere, so these resolve as `//evil`
    ["tab-split slashes", "/\t/evil.example"],
    ["newline-split slashes", "/\n/evil.example"],
    ["percent-encoded protocol-relative", "%2F%2Fevil.example"],
    ["percent-encoded slash after the first", "/%2Fevil.example"],
    ["percent-encoded backslash", "/%5Cevil.example"],
    ["percent-encoded tab-split slashes", "/%09/evil.example"],
  ])("a %s path falls back", (_, raw) => {
    expect(safe_redirect(raw, FALLBACK)).toBe(FALLBACK);
  });

  test.each([
    ["CR/LF", "/a\r\nset-cookie: x=1"],
    ["a line separator", "/\u2028"],
    ["a non-ascii letter", "/caf\u00e9"],
  ])("a path carrying %s falls back", (_, raw) => {
    expect(safe_redirect(raw, FALLBACK)).toBe(FALLBACK);
  });

  test("a dot-segment that resolves to a protocol-relative path falls back", () => {
    expect(safe_redirect("/..//evil.example", FALLBACK)).toBe(FALLBACK);
  });

  // each resolves on this origin, so only the leading-slash check refuses it
  test.each([
    ["an empty param", ""],
    ["a bare relative path", "dashboard"],
    ["a bare query", "?next=/x"],
  ])("%s falls back", (_, raw) => {
    expect(safe_redirect(raw, FALLBACK)).toBe(FALLBACK);
  });

  test("a script url falls back", () => {
    expect(safe_redirect("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });

  test("malformed percent-encoding falls back", () => {
    expect(safe_redirect("/%E0%A4%A", FALLBACK)).toBe(FALLBACK);
  });

  test.each([null, undefined])("a missing param (%s) falls back", (raw) => {
    expect(safe_redirect(raw, FALLBACK)).toBe(FALLBACK);
  });

  test("a path with query and hash passes through undecoded", () => {
    const raw = "/donate/12?frequency=monthly&note=a%26b#form";
    expect(safe_redirect(raw, FALLBACK)).toBe(raw);
  });
});
