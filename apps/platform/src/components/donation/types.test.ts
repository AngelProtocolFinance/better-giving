import { describe, expect, test } from "vitest";
import { tip_from_val, tip_val } from "./types";

describe("tip_from_val", () => {
  test.each([
    ["15", 15],
    ["20", 20],
    ["10", 10],
  ])("a %s%% tip is recognised as a percentage", (format, tip) => {
    expect(tip_from_val(tip, 100)).toEqual({ tip_format: format, tip: "" });
  });

  test("an amount matching no percentage is custom", () => {
    expect(tip_from_val(17, 100)).toEqual({ tip_format: "custom", tip: "17" });
  });

  test("recognition is on the ratio, not the amount", () => {
    expect(tip_from_val(4.5, 30)).toEqual({ tip_format: "15", tip: "" });
  });

  test("a zero base cannot yield a ratio, so it is custom", () => {
    expect(tip_from_val(0, 0)).toEqual({ tip_format: "custom", tip: "0" });
  });

  test("round-trips through tip_val for every recognised percentage", () => {
    for (const pct of [10, 15, 20]) {
      const base = 250;
      const tip = (pct / 100) * base;
      const fv = tip_from_val(tip, base);
      expect(tip_val(fv.tip_format, fv.tip, base)).toBeCloseTo(tip);
    }
  });
});
