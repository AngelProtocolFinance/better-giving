import { afterEach, describe, expect, test } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// chromium serializes a 0.01ms duration in exponent form ("1e-05s"), so every
// collapsed assertion reads the number rather than the string.
const secs = (duration: string) => Number.parseFloat(duration);

describe("speed ladder", () => {
  afterEach(async () => {
    // fileParallelism is off, so one page carries every file — a leaked
    // emulation would quietly reduce motion for the rest of the suite.
    await commands.emulateMedia({ reducedMotion: null });
  });

  test("spends the three declared speeds by default", async () => {
    expect(token("--duration-fast")).toBe("150ms");
    expect(token("--duration-base")).toBe("200ms");
    expect(token("--duration-slow")).toBe("300ms");

    const screen = await render(
      <div data-testid="box" className="transition duration-base" />
    );
    const box = screen.getByTestId("box").element();
    expect(getComputedStyle(box).transitionDuration).toBe("0.2s");
  });

  test("collapses to near-zero under prefers-reduced-motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });

    expect(token("--duration-fast")).toBe("0.01ms");
    expect(token("--duration-base")).toBe("0.01ms");
    expect(token("--duration-slow")).toBe("0.01ms");

    const screen = await render(
      <div data-testid="box" className="transition duration-base" />
    );
    const box = screen.getByTestId("box").element();
    expect(secs(getComputedStyle(box).transitionDuration)).toBeLessThan(0.001);
  });

  test("collapses the keyframe shorthands that read the ladder", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });

    const screen = await render(
      <div data-testid="pop" className="animate-popup-in" />
    );
    const pop = screen.getByTestId("pop").element();
    expect(secs(getComputedStyle(pop).animationDuration)).toBeLessThan(0.001);
  });

  test("stills the spin and pulse loops under prefers-reduced-motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });

    expect(token("--animate-spin")).toBe("none");
    expect(token("--animate-pulse")).toBe("none");

    const screen = await render(
      <div data-testid="spinner" className="animate-spin" />
    );
    const spinner = screen.getByTestId("spinner").element();
    expect(getComputedStyle(spinner).animationName).toBe("none");
  });

  test("a collapsed transition still fires transitionend", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });

    const screen = await render(
      <div
        data-testid="fader"
        className="transition duration-base"
        style={{ opacity: 1 }}
      />
    );
    const fader = screen.getByTestId("fader").element() as HTMLElement;

    const outcome = Promise.race([
      new Promise<string>((resolve) =>
        fader.addEventListener(
          "transitionend",
          () => resolve("transitionend"),
          {
            once: true,
          }
        )
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("no event"), 2_000)
      ),
    ]);

    // reading it resolves the starting style the flip transitions from
    expect(getComputedStyle(fader).opacity).toBe("1");
    await new Promise(requestAnimationFrame);
    fader.style.opacity = "0";

    expect(await outcome).toBe("transitionend");
  });
});

describe("scroll reveal", () => {
  afterEach(async () => {
    await commands.emulateMedia({ reducedMotion: null });
  });

  test("runs on the element's view timeline", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });

    const screen = await render(<div data-testid="head" className="reveal" />);
    const style = getComputedStyle(screen.getByTestId("head").element());
    expect(style.animationName).toBe("rise-in");
    // lib.dom has no `animationTimeline` yet
    expect(style.getPropertyValue("animation-timeline")).toBe("view()");
    // an unparseable range drops only its own declaration and falls back to
    // `normal`, the whole cover range — still animating, at the wrong pace.
    expect(style.getPropertyValue("animation-range-end")).toMatch(/^entry \d/);
  });

  // the guard is the media query itself, not the collapsed ladder: a view
  // timeline spends no named speed, so nothing at the foot of theme.css
  // reaches it.
  test("does not run at all under prefers-reduced-motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });

    const screen = await render(<div data-testid="head" className="reveal" />);
    const style = getComputedStyle(screen.getByTestId("head").element());
    expect(style.animationName).toBe("none");
    expect(style.opacity).toBe("1");
  });
});

describe("editorial face", () => {
  test.each(["hero-heading", "section-heading", "subsection-heading"])(
    "%s reads it",
    async (role) => {
      const screen = await render(
        <h1 data-testid="h" className={role}>
          Every way to give. <em>Free forever.</em>
        </h1>
      );
      const style = getComputedStyle(screen.getByTestId("h").element());
      expect(style.fontFamily).toMatch(/^"?Fraunces Variable"?,/);
      expect(style.fontWeight).toBe("600");
    }
  );

  // an <em> in a headline must land on the drawn italic, not a synthesized
  // slant of the roman — so the italic face has to exist and load.
  test("ships a real italic", async () => {
    const faces = await document.fonts.load(
      'italic 600 48px "Fraunces Variable"'
    );
    expect(faces.map((f) => f.style)).toContain("italic");
    expect(faces.every((f) => f.status === "loaded")).toBe(true);
  });
});

// the media-query half is read off the CSSOM rather than emulated. chromium
// can emulate a hover-less device (touch emulation) but cannot hand the hover
// type back: once touch emulation is lifted, `(hover: none)` keeps matching for
// the rest of the page, and fileParallelism off means one page carries every
// file. `setEmulatedMedia` takes no `hover` feature, and playwright's
// emulateMedia has none either.
// tailwind's own `hover:` nests the gate INSIDE the hover rule
// (`.x { &:hover { @media (hover: hover) { … } } }`), so a hover selector is
// a finding only where a declaration lands under it with no gate on the way.
const ungated_hovers = (
  rules: CSSRuleList,
  ctx = { gated: false, hover: "" }
): string[] =>
  Array.from(rules).flatMap((rule) => {
    const gated =
      ctx.gated ||
      (rule instanceof CSSMediaRule &&
        /\(\s*hover\s*:\s*hover\s*\)/.test(rule.conditionText));
    const hover =
      rule instanceof CSSStyleRule && /(?<!\\):hover/.test(rule.selectorText)
        ? rule.selectorText
        : ctx.hover;
    const own =
      rule instanceof CSSStyleRule && hover && !gated && rule.style.length > 0
        ? [hover]
        : [];
    const nested =
      "cssRules" in rule
        ? ungated_hovers(rule.cssRules as CSSRuleList, { gated, hover })
        : [];
    return [...own, ...nested];
  });

describe("hover is gated on a hover-capable pointer", () => {
  test("no :hover rule in the stylesheet sits outside (hover: hover)", async () => {
    // a class nobody renders is still emitted (the scan is of source text), so
    // the sheet already holds every recipe; rendering one only proves it loaded
    await render(<button type="button" className="btn btn-primary" />);
    const findings = Array.from(document.styleSheets).flatMap((sheet) =>
      ungated_hovers(sheet.cssRules)
    );
    expect(findings).toEqual([]);
  });

  test("a hover device still takes the hover fill", async () => {
    expect(matchMedia("(hover: hover)").matches).toBe(true);
    const screen = await render(
      <button type="button" className="btn btn-primary">
        Donate
      </button>
    );
    const btn = screen.getByRole("button").element();
    const resting = getComputedStyle(btn).backgroundColor;
    await userEvent.hover(btn);
    expect(btn.matches(":hover")).toBe(true);
    expect(getComputedStyle(btn).backgroundColor).not.toBe(resting);
    await userEvent.unhover(btn);
  });
});

describe("press scale", () => {
  afterEach(async () => {
    await commands.emulateMedia({ reducedMotion: null });
  });

  // chromium holds a button :active while Space is down, which is the one
  // press a test can keep held long enough to read.
  const held_scale = async () => {
    const screen = await render(
      <button type="button" className="btn btn-secondary">
        Save
      </button>
    );
    const btn = screen.getByRole("button").element() as HTMLElement;
    btn.focus();
    await userEvent.keyboard("{Space>}");
    expect(btn.matches(":active")).toBe(true);
    const scale = getComputedStyle(btn).scale;
    await userEvent.keyboard("{/Space}");
    return scale;
  };

  test("shrinks to 0.97 while held", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    expect(await held_scale()).toBe("0.97");
  });

  test("does not move under prefers-reduced-motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    expect(await held_scale()).toBe("none");
  });
});

describe("root", () => {
  test("stops the rubber-band on a fine pointer", () => {
    expect(matchMedia("(any-pointer: coarse)").matches).toBe(false);
    expect(getComputedStyle(document.documentElement).overscrollBehaviorY).toBe(
      "none"
    );
  });

  test("breaks an unbroken string inside its box", () => {
    expect(getComputedStyle(document.documentElement).overflowWrap).toBe(
      "break-word"
    );
  });
});

describe("side corners", () => {
  test.each([
    ["rounded-s", "ltr", [true, false, false, true]],
    ["rounded-s", "rtl", [false, true, true, false]],
    ["rounded-e", "ltr", [false, true, true, false]],
    ["rounded-e", "rtl", [true, false, false, true]],
    ["rounded-l", "rtl", [true, false, false, true]],
    ["rounded-r", "rtl", [false, true, true, false]],
  ] as const)(
    "%s under %s rounds its own two corners",
    async (name, dir, want) => {
      const screen = await render(
        <div dir={dir}>
          <div data-testid="ref" className="rounded" />
          <div data-testid="c" className={name} />
        </div>
      );
      const radius = getComputedStyle(
        screen.getByTestId("ref").element()
      ).borderTopLeftRadius;
      // clockwise from top-left
      const style = getComputedStyle(screen.getByTestId("c").element());
      const radii = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ];
      expect(radii.map((r) => r !== "0px")).toEqual(want);
      expect(radii.filter((r) => r !== "0px")).toEqual([radius, radius]);
    }
  );
});
