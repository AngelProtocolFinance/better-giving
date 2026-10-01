import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useViewerToday } from "./use-viewer-today";

function Today() {
  return <output>{useViewerToday("max")}</output>;
}

describe("useViewerToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("rolls over to the new date at local midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 2, 14, 23, 59));
    const screen = await render(<Today />);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("2026-03-14");

    await vi.advanceTimersByTimeAsync(60_000);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("2026-03-15");

    // re-armed for the midnight after that
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("2026-03-16");
  });

  // chromium pauses timers through OS sleep: on wake the clock is past
  // midnight while the timeout is still pending
  test("re-reads the date when the page becomes visible again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 2, 14, 22, 0));
    const screen = await render(<Today />);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("2026-03-14");

    // the clock moves on, the timer does not fire
    vi.setSystemTime(new Date(2026, 2, 15, 8, 0));
    document.dispatchEvent(new Event("visibilitychange"));

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("2026-03-15");
  });

  test("leaves no timer behind once unmounted", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 2, 14, 12, 0));
    const screen = await render(<Today />);
    await expect.element(screen.getByRole("status")).toBeVisible();

    await screen.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
