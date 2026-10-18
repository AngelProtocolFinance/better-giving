import { describe, expect, test } from "vitest";
import { HEADER, MIN_SCALE, stage_fit } from "./fit";

/** where the scaled stage's top and bottom land: pinned (box at the header's
 *  foot) and at scroll 0 (box at the column's own top, under the banner) */
const edges = (
  fit: { scale: number; offset: number },
  natural: number,
  col_top: number
) => {
  const h = natural * fit.scale;
  return {
    pinned: [HEADER + fit.offset, HEADER + fit.offset + h],
    at_load: [col_top + fit.offset, col_top + fit.offset + h],
  };
};

describe("stage_fit", () => {
  test("a stage that fits is not scaled, and sits centred under the header", () => {
    const fit = stage_fit(720, 1080, 64);
    expect(fit?.scale).toBe(1);
    expect(fit?.offset).toBe((1080 - HEADER - 720) / 2);
  });

  test("a short viewport scales the stage to fit, with the banner shown", () => {
    // 1280x720 with the 44px banner: the column starts at 108
    const fit = stage_fit(723, 720, 108);
    expect(fit).not.toBeNull();
    if (!fit) return;
    expect(fit.scale).toBeLessThan(1);
    expect(fit.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    const e = edges(fit, 723, 108);
    // under the header once pinned, inside the viewport at load
    expect(e.pinned[0]).toBeGreaterThanOrEqual(HEADER);
    expect(e.pinned[1]).toBeLessThanOrEqual(720);
    expect(e.at_load[0]).toBeGreaterThanOrEqual(108);
    expect(e.at_load[1]).toBeLessThanOrEqual(720);
  });

  test("with the banner dismissed it fits the same way", () => {
    const fit = stage_fit(723, 768, 64);
    expect(fit).not.toBeNull();
    if (!fit) return;
    const e = edges(fit, 723, 64);
    expect(e.pinned[0]).toBeGreaterThanOrEqual(HEADER);
    expect(e.pinned[1]).toBeLessThanOrEqual(768);
  });

  test("where even the floor scale does not fit, there is no pin", () => {
    expect(stage_fit(723, 560, 108)).toBeNull();
  });

  test("the scale never drops under the floor", () => {
    for (const h of [650, 700, 720, 768, 800, 900]) {
      const fit = stage_fit(723, h, 108);
      if (fit) expect(fit.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    }
  });
});
