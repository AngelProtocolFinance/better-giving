import { describe, expect, it } from "vitest";
import { slate_to_pt } from "./backfill-richtext-pt";

const slate = (doc: unknown) => JSON.stringify(doc);

describe("slate_to_pt converter", () => {
  it("empty or null → []", () => {
    expect(slate_to_pt("r1", "")).toEqual([]);
    expect(slate_to_pt("r1", null)).toEqual([]);
    expect(slate_to_pt("r1", undefined)).toEqual([]);
  });

  it("paragraph-only with plain text", () => {
    const out = slate_to_pt(
      "r1",
      slate([{ type: "paragraph", children: [{ text: "hello" }] }])
    );
    expect(out).toHaveLength(1);
    expect(out[0]._type).toBe("block");
    expect(out[0].style).toBe("normal");
    expect(out[0].listItem).toBeUndefined();
    expect(out[0].children[0].text).toBe("hello");
    expect(out[0].children[0].marks).toEqual([]);
    expect(out[0].markDefs).toEqual([]);
  });

  it("paragraph with bold + italic marks", () => {
    const out = slate_to_pt(
      "r1",
      slate([
        {
          type: "paragraph",
          children: [
            { text: "a" },
            { text: "B", bold: true },
            { text: "i", italic: true },
            { text: "BI", bold: true, italic: true },
          ],
        },
      ])
    );
    expect(out[0].children.map((c) => c.marks)).toEqual([
      [],
      ["strong"],
      ["em"],
      ["strong", "em"],
    ]);
  });

  it("paragraph with link mark adds markDef + reference", () => {
    const out = slate_to_pt(
      "r1",
      slate([
        {
          type: "paragraph",
          children: [
            { text: "click", link: "https://example.com" },
            { text: " here", link: "https://example.com" },
          ],
        },
      ])
    );
    expect(out[0].markDefs).toHaveLength(1);
    expect(out[0].markDefs[0]._type).toBe("link");
    expect(out[0].markDefs[0].href).toBe("https://example.com");
    const md_key = out[0].markDefs[0]._key;
    expect(out[0].children[0].marks).toContain(md_key);
    expect(out[0].children[1].marks).toContain(md_key);
  });

  it("bulleted list → flat blocks with listItem:bullet", () => {
    const out = slate_to_pt(
      "r1",
      slate([
        {
          type: "bulleted-list",
          children: [
            { type: "list-item", children: [{ text: "one" }] },
            { type: "list-item", children: [{ text: "two" }] },
          ],
        },
      ])
    );
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.listItem === "bullet")).toBe(true);
    expect(out.every((b) => b.level === 1)).toBe(true);
    expect(out.map((b) => b.children[0].text)).toEqual(["one", "two"]);
  });

  it("numbered list → blocks with listItem:number", () => {
    const out = slate_to_pt(
      "r1",
      slate([
        {
          type: "numbered-list",
          children: [
            { type: "list-item", children: [{ text: "a" }] },
            { type: "list-item", children: [{ text: "b" }] },
          ],
        },
      ])
    );
    expect(out.every((b) => b.listItem === "number")).toBe(true);
  });

  it("already-PT doc passes through untouched", () => {
    const pt = [
      {
        _key: "abc",
        _type: "block",
        style: "normal",
        markDefs: [],
        children: [{ _key: "s1", _type: "span", text: "x", marks: [] }],
      },
    ];
    expect(slate_to_pt("r1", JSON.stringify(pt))).toEqual(pt);
  });

  it("non-json raw text → single paragraph block", () => {
    const out = slate_to_pt("r1", "raw legacy string");
    expect(out).toHaveLength(1);
    expect(out[0].children[0].text).toBe("raw legacy string");
  });

  it("keys are deterministic across runs", () => {
    const json = slate([
      { type: "paragraph", children: [{ text: "x", bold: true }] },
    ]);
    const a = slate_to_pt("r1", json);
    const b = slate_to_pt("r1", json);
    expect(a).toEqual(b);
  });

  it("different row_ids produce different keys", () => {
    const json = slate([{ type: "paragraph", children: [{ text: "x" }] }]);
    expect(slate_to_pt("r1", json)[0]._key).not.toBe(
      slate_to_pt("r2", json)[0]._key
    );
  });
});
