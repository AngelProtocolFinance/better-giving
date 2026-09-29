import { describe, expect, it } from "vitest";
import { is_safe_href } from "./safe-href";

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
  ])("accepts %j", (href) => {
    expect(is_safe_href(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "\tjavascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "blog/x",
    "#section",
    "",
    "   ",
    undefined,
  ])("rejects %j", (href) => {
    expect(is_safe_href(href)).toBe(false);
  });
});
