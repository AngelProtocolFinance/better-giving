import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import type { IDonorMessage } from "./items";
import { QuoteStrip } from "./quote-strip";

const msg = (n: number): IDonorMessage => ({
  id: `m-${n}`,
  name: `Donor ${n}`,
  message: `Message body ${n}`,
});

const msgs = (n: number) => Array.from({ length: n }, (_, i) => msg(i + 1));

afterEach(async () => {
  await reset_viewport();
});

describe("QuoteStrip", () => {
  test("no messages renders nothing", async () => {
    const screen = await render(<QuoteStrip messages={[]} tone="light" />);
    expect(screen.container.querySelector("section")).toBeNull();
  });

  test("steps through the messages, announcing the position with no total, and wraps at the end", async () => {
    const screen = await render(<QuoteStrip messages={msgs(3)} tone="dark" />);
    const next = screen.getByRole("button", { name: "Next message" });
    const position = screen.getByText(/^Message \d$/);

    await expect.element(screen.getByText("Message body 1")).toBeVisible();
    await expect.element(screen.getByText("Donor 1")).toBeVisible();
    await expect.element(position).toHaveTextContent("Message 1");
    expect(position.element()).toHaveAttribute("aria-live", "polite");
    // messages load a page at a time, so no total is shown or announced
    expect(screen.container.textContent).not.toMatch(/\bof\b|\d\s*\/\s*\d/);

    await next.click();
    await expect.element(screen.getByText("Message body 2")).toBeVisible();
    await expect.element(position).toHaveTextContent("Message 2");

    await next.click();
    await next.click();
    await expect.element(screen.getByText("Message body 1")).toBeVisible();
    await expect.element(position).toHaveTextContent("Message 1");
  });

  test("asks for more on reaching the last loaded message, and moves on when it lands", async () => {
    const on_more = vi.fn();
    const screen = await render(
      <QuoteStrip messages={msgs(2)} tone="light" on_more={on_more} />
    );
    const next = screen.getByRole("button", { name: "Next message" });

    await next.click();
    await expect.element(screen.getByText("Message body 2")).toBeVisible();
    expect(on_more).toHaveBeenCalledOnce();

    // pressed again before the page lands: it waits rather than wrapping
    await next.click();
    expect(on_more).toHaveBeenCalledTimes(2);
    await expect.element(screen.getByText("Message body 2")).toBeVisible();

    await screen.rerender(
      <QuoteStrip messages={msgs(4)} tone="light" on_more={on_more} />
    );
    await expect.element(screen.getByText("Message body 3")).toBeVisible();
    await expect
      .element(screen.getByText("Message 3", { exact: true }))
      .toBeInTheDocument();
  });

  test("one message with nothing more shows no navigation", async () => {
    const screen = await render(<QuoteStrip messages={msgs(1)} tone="light" />);
    await expect.element(screen.getByText("Message body 1")).toBeVisible();
    expect(screen.getByRole("button").query()).toBeNull();
  });

  test.each(["light", "dark"] as const)(
    "on a phone the %s box ends at the donor's name, next riding the mark's row",
    async (tone) => {
      await page.viewport(375, 812);
      const screen = await render(
        <QuoteStrip messages={msgs(3)} tone={tone} />
      );
      const box = screen.getByRole("region", { name: "Donor messages" });
      await expect.element(box).toBeVisible();
      const section = box.element() as HTMLElement;
      const name = screen
        .getByText("Donor 1")
        .element()
        .getBoundingClientRect();
      const next = screen
        .getByRole("button", { name: "Next message" })
        .element()
        .getBoundingClientRect();
      const inset = Number.parseFloat(getComputedStyle(section).paddingBottom);
      expect(section.getBoundingClientRect().bottom - name.bottom).toBeCloseTo(
        inset,
        0
      );
      expect(next.bottom).toBeLessThan(
        screen.getByText("Message body 1").element().getBoundingClientRect().top
      );
    }
  );
});
