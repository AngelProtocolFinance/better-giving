import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { PartnersStrip } from "./strip";

describe("PartnersStrip", () => {
  test("the toggle holds the strip still until it is pressed again", async () => {
    const screen = await render(<PartnersStrip />);
    const root = () =>
      screen.container.querySelector(
        '[data-scope="marquee"][data-part="root"]'
      );
    const is_paused = () => root()?.hasAttribute("data-paused");

    // the logos say nothing the eyebrow doesn't, so the strip is out of the
    // AX tree and the toggle is its only presence there
    expect(root()).toHaveAttribute("aria-hidden", "true");
    expect(is_paused()).toBe(false);

    await screen.getByRole("button", { name: "Pause logos" }).click();
    await vi.waitFor(() => expect(is_paused()).toBe(true));

    await screen.getByRole("button", { name: "Play logos" }).click();
    await vi.waitFor(() => expect(is_paused()).toBe(false));
    await expect
      .element(screen.getByRole("button", { name: "Pause logos" }))
      .toBeVisible();
  });
});
