import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { IDonorMessage } from "./items";
import { QuoteStrip } from "./quote-strip";

const msg = (n: number): IDonorMessage => ({
  id: `m-${n}`,
  name: `Donor ${n}`,
  message: `Message body ${n}`,
});

const msgs = (n: number) => Array.from({ length: n }, (_, i) => msg(i + 1));

describe("QuoteStrip", () => {
  test("no messages renders nothing", async () => {
    const screen = await render(<QuoteStrip messages={[]} tone="light" />);
    expect(screen.container.querySelector("section")).toBeNull();
  });

  test("steps through the messages, announcing the count, and wraps at the end", async () => {
    const screen = await render(<QuoteStrip messages={msgs(3)} tone="dark" />);
    const next = screen.getByRole("button", { name: "Next message" });
    const count = screen.getByText(/^Message \d of 3$/);

    await expect.element(screen.getByText("Message body 1")).toBeVisible();
    await expect.element(screen.getByText("Donor 1")).toBeVisible();
    await expect.element(count).toHaveTextContent("Message 1 of 3");
    expect(count.element().closest("[aria-live='polite']")).not.toBeNull();

    await next.click();
    await expect.element(screen.getByText("Message body 2")).toBeVisible();
    await expect.element(count).toHaveTextContent("Message 2 of 3");

    await next.click();
    await next.click();
    await expect.element(screen.getByText("Message body 1")).toBeVisible();
    await expect.element(count).toHaveTextContent("Message 1 of 3");
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
      .element(screen.getByText("Message 3 of 4"))
      .toBeInTheDocument();
  });

  test("one message with nothing more shows no navigation", async () => {
    const screen = await render(<QuoteStrip messages={msgs(1)} tone="light" />);
    await expect.element(screen.getByText("Message body 1")).toBeVisible();
    expect(screen.getByRole("button").query()).toBeNull();
  });
});
