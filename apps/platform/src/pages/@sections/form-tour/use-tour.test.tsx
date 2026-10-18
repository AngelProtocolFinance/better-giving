import { useRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { use_tour } from "./use-tour";

function Harness() {
  const root = useRef<HTMLDivElement>(null);
  const { chapter, progress, reduced } = use_tour(root);
  return (
    <div ref={root}>
      <output className="fixed top-0">
        {`chapter ${chapter} at ${progress.toFixed(2)}${reduced ? " reduced" : ""}`}
      </output>
      {[0, 1, 2].map((i) => (
        <section key={i} data-tour-chapter style={{ height: 1000 }} />
      ))}
    </div>
  );
}

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  window.scrollTo(0, 0);
});

describe("use_tour", () => {
  test("scrolling moves the chapter and the progress through it", async () => {
    const screen = await render(<Harness />);
    await expect.element(screen.getByText("chapter 0")).toBeVisible();

    // put the viewport's centre line a quarter of the way into chapter 2
    const third = screen.container.querySelectorAll("[data-tour-chapter]")[2];
    const top = third.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + 250 - window.innerHeight / 2);

    await expect
      .element(screen.getByText("chapter 2 at 0.25", { exact: true }))
      .toBeVisible();
  });

  test("a reader who asked for less motion is passed through", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    const screen = await render(<Harness />);
    await expect
      .element(screen.getByText(/^chapter 0 .* reduced$/))
      .toBeVisible();
  });

  test("motion is assumed allowed when the reader has not asked otherwise", async () => {
    const screen = await render(<Harness />);
    await expect.element(screen.getByText("chapter 0")).toBeVisible();
    expect(screen.getByText("reduced").query()).toBeNull();
  });
});
