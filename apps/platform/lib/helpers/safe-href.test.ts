import { describe, expect, it } from "vitest";
import { is_absolute_web_href, is_safe_href } from "./safe-href";

describe("is_safe_href", () => {
  it.each([
    "https://better.giving",
    "http://example.org/a?b=c#d",
    "HTTPS://EXAMPLE.ORG",
    "mailto:hi@better.giving",
    "tel:+15551234567",
    "  https://padded.example  ",
    "/blog/other-post",
    "/",
    "#section",
    "?q=1",
    "other-post",
    "blog/x",
    "./x",
    "../x",
    // the studio's relative-allowing uri rule publishes these; they resolve to http(s), no worse than an absolute link
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
  ])("accepts %j", (href) => {
    expect(is_safe_href(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "\tjavascript:alert(1)",
    "\u0001javascript:alert(1)",
    "\u0000javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "ftp://example.org",
    "http://",
    "",
    "   ",
    undefined,
    null,
    42,
    { href: "https://example.org" },
    ["https://example.org"],
  ])("rejects %j", (href) => {
    expect(is_safe_href(href)).toBe(false);
  });
});

describe("is_absolute_web_href", () => {
  it.each([
    "https://better.giving",
    "http://example.org/a?b=c#d",
    "HTTPS://EXAMPLE.ORG",
    "  https://padded.example  ",
  ])("accepts %j", (href) => {
    expect(is_absolute_web_href(href)).toBe(true);
  });

  it.each([
    "www.example.org",
    "example.org",
    "/donate",
    "other-page",
    "#section",
    "//example.org",
    "https:example.org",
    "https:/example.org",
    "http://",
    "mailto:hi@better.giving",
    "tel:+15551234567",
    "ftp://example.org",
    "javascript:alert(1)",
    "\u0001https://example.org",
    "ht\ntps://example.org",
    "",
    "   ",
    undefined,
    null,
    42,
    { href: "https://example.org" },
  ])("rejects %j", (href) => {
    expect(is_absolute_web_href(href)).toBe(false);
  });
});
