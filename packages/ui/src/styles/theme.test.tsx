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
