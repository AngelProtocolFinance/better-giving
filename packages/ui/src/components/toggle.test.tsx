import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Toggle } from "./toggle";

const geometry = (root: HTMLElement) => {
  const control = root.querySelector<HTMLElement>("[data-part=control]")!;
  const thumb = root.querySelector<HTMLElement>("[data-part=thumb]")!;
  const c = control.getBoundingClientRect();
  const t = thumb.getBoundingClientRect();
  return {
    w: c.width,
    h: c.height,
    thumb_w: t.width,
    thumb_h: t.height,
    left: t.left - c.left,
    right: c.right - t.right,
    top: t.top - c.top,
  };
};

describe("Toggle geometry", () => {
  const cases = [
    ["text-sm", "", 40, 20],
    ["text-base", "", 48, 24],
    ["text-sm", "[--toggle-w:4rem] [--toggle-h:1.5rem]", 64, 24],
  ] as const;

  for (const [text, vars, w, h] of cases) {
    for (const checked of [false, true]) {
      test(`${text} ${vars || "default"} ${checked ? "on" : "off"}: ${w}x${h}, thumb round and inset evenly`, async () => {
        const screen = await render(
          <Toggle
            value={checked}
            onChange={() => {}}
            classes={{ container: `${text} ${vars}` }}
          >
            Publish profile
          </Toggle>
        );
        const g = geometry(screen.container);
        const inset = h * 0.1;
        expect(g.w).toBeCloseTo(w, 1);
        expect(g.h).toBeCloseTo(h, 1);
        expect(g.thumb_w).toBeCloseTo(h - 2 * inset, 1);
        expect(g.thumb_h).toBeCloseTo(g.thumb_w, 1);
        expect(g.top).toBeCloseTo(inset, 1);
        // transition-transform: wait for the slide to settle before measuring
        await expect
          .poll(() => geometry(screen.container)[checked ? "right" : "left"])
          .toBeCloseTo(inset, 1);
      });
    }
  }
});

describe("Toggle track", () => {
  const track_bg = async (value: boolean, disabled = false) => {
    const screen = await render(
      <Toggle value={value} onChange={() => {}} disabled={disabled}>
        Publish profile
      </Toggle>
    );
    const control = screen.container.querySelector("[data-part=control]")!;
    return getComputedStyle(control).backgroundColor;
  };

  test("fills when checked, stays at rest when checked but disabled", async () => {
    const rest = await track_bg(false);
    expect(await track_bg(true)).not.toBe(rest);
    expect(await track_bg(true, true)).toBe(rest);
  });
});
