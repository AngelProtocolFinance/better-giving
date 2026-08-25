import { describe, expect, it } from "vitest";
import { hex_to_oklch, oklch_to_hex } from "./oklch.ts";

// hex_to_oklch exists so a generated palette given as sRGB hex can be authored
// in colors.css as oklch(). that is only sound if the pair is lossless: the
// hex a step is written from has to be the hex it renders back to.
describe("hex_to_oklch round-trips through oklch_to_hex", () => {
  it("holds across the sRGB cube", () => {
    const misses: string[] = [];
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          const hex = `#${[r, g, b]
            .map((c) => c.toString(16).padStart(2, "0"))
            .join("")}`;
          if (oklch_to_hex(...hex_to_oklch(hex)) !== hex) misses.push(hex);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it.each([
    "#000000",
    "#ffffff",
    "#808080",
    "#1e6dab",
    "#cc1926",
    "#0e8c62",
    "#f59e0b",
    "#e2e8f0",
  ])("holds for %s", (hex) => {
    expect(oklch_to_hex(...hex_to_oklch(hex))).toBe(hex);
  });

  it("reads an uppercase hex and one without the hash", () => {
    expect(hex_to_oklch("1E6DAB")).toEqual(hex_to_oklch("#1e6dab"));
  });

  it.each([
    "#ffffff",
    "#808080",
    "#000000",
  ])("gives the achromatic %s no chroma and no hue", (hex) => {
    const [, C, h] = hex_to_oklch(hex);
    expect(C).toBe(0);
    expect(h).toBe(0);
  });

  it("rejects a value that isn't a 6-digit sRGB hex", () => {
    expect(() => hex_to_oklch("#fff")).toThrow();
    expect(() => hex_to_oklch("#1e6dabff")).toThrow();
  });
});
