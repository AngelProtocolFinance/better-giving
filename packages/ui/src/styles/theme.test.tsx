import { afterEach, describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
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

describe("scrolled header ground", () => {
  afterEach(async () => {
    await commands.emulateMedia({ reducedMotion: null });
  });

  const ground = async () => {
    const screen = await render(
      <header data-testid="bar" className="relative header-ground" />
    );
    return getComputedStyle(screen.getByTestId("bar").element(), "::before");
  };

  test("fades in on the root scroll timeline", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });

    const style = await ground();
    expect(style.animationName).toBe("ground-in");
    expect(style.getPropertyValue("animation-timeline")).toBe("scroll()");
    // the range is a fixed scroll distance; `normal` would mean the
    // declaration was dropped and the ground fades over the whole page.
    expect(style.getPropertyValue("animation-range-end")).not.toBe("normal");
  });

  // the same guard as the reveal: the media query itself, so the fallback is
  // the solid header rather than a ground that never arrives.
  test("is the solid header under prefers-reduced-motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });

    const style = await ground();
    expect(style.animationName).toBe("none");
    expect(style.opacity).toBe("1");
    expect(style.backdropFilter).toBe("none");
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
