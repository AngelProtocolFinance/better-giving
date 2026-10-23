import { describe, expect, it } from "vitest";
import { to_excerpt } from "./helpers";

const doc = (text: string) =>
  JSON.stringify([
    {
      _type: "block",
      _key: "b",
      children: [{ _type: "span", _key: "s", text }],
    },
  ]);

describe("to_excerpt", () => {
  it("lets a cut that ends a sentence stand, with no ellipsis after it", () => {
    const head = `${"a".repeat(150)}.`;
    const out = to_excerpt(doc(`${head} ${"b".repeat(30)}`));
    expect(out).toBe(head);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it("trades a trailing comma for the ellipsis", () => {
    const out = to_excerpt(doc(`${"a".repeat(150)}, ${"b".repeat(30)}`));
    expect(out).toBe(`${"a".repeat(150)}…`);
  });

  it("leaves a story that fits whole", () => {
    expect(to_excerpt(doc("Clean water for every village."))).toBe(
      "Clean water for every village."
    );
  });
});
