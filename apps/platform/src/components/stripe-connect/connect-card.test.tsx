import { AskHost } from "@better-giving/ui";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { type IStripeConnectCard, StripeConnectCard } from "./connect-card";

const START = "/api/stripe-connect/start?npo=42";

/** the confirm is raised through `ask`, which mounts at `AskHost`. */
const render_card = (props: Partial<IStripeConnectCard> = {}) =>
  render(
    <>
      <StripeConnectCard status="not_connected" start_href={START} {...props} />
      <AskHost />
    </>
  );

/** records where each link press would have navigated, and stops it — a real
 *  navigation would take the test page with it. */
function capture_navigation() {
  const hrefs: string[] = [];
  const on_click = (e: MouseEvent) => {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    e.preventDefault();
    hrefs.push(a.getAttribute("href") ?? "");
  };
  document.addEventListener("click", on_click, { capture: true });
  return {
    hrefs,
    stop: () =>
      document.removeEventListener("click", on_click, { capture: true }),
  };
}

let nav: ReturnType<typeof capture_navigation> | undefined;
afterEach(() => {
  nav?.stop();
  nav = undefined;
});

describe("StripeConnectCard", () => {
  test("not connected: connecting is a plain link to the start url", async () => {
    const screen = await render_card();

    await expect
      .element(screen.getByText("Not connected", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Connect with Stripe" }))
      .toHaveAttribute("href", START);
    await expect
      .element(
        screen.getByRole("button", { name: /connect a different account/i })
      )
      .not.toBeInTheDocument();
  });

  test("disconnected: reconnecting is a plain link to the start url, no confirm", async () => {
    nav = capture_navigation();
    const screen = await render_card({ status: "disconnected" });

    await expect
      .element(
        screen.getByText(
          "Disconnected — card donations settle to your bank details"
        )
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByRole("button", { name: /connect a different account/i })
      )
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "Connect with Stripe" }))
      .not.toBeInTheDocument();

    const reconnect = screen.getByRole("link", { name: "Reconnect Stripe" });
    await expect.element(reconnect).toHaveAttribute("href", START);
    await reconnect.click();
    // one press leaves for Stripe — without replace=1, and nothing asked first
    expect(nav.hrefs).toEqual([START]);
    expect(screen.getByRole("dialog").query()).toBeNull();
  });

  test.each<IStripeConnectCard["status"]>(["incomplete", "pending", "ready"])(
    "%s: offers switching accounts, never reconnecting",
    async (status) => {
      const screen = await render_card({ status });
      await expect
        .element(
          screen.getByRole("button", { name: /connect a different account/i })
        )
        .toBeVisible();
      await expect
        .element(screen.getByRole("link", { name: "Reconnect Stripe" }))
        .not.toBeInTheDocument();
    }
  );

  test("connected: switching accounts waits for a confirm, then goes with replace=1", async () => {
    nav = capture_navigation();
    const screen = await render_card({ status: "ready" });

    await expect
      .element(screen.getByText("Ready to receive card donations"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Connect with Stripe" }))
      .not.toBeInTheDocument();

    await screen
      .getByRole("button", { name: /connect a different account/i })
      .click();

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    // the press only asked — nothing has navigated yet
    expect(nav.hrefs).toEqual([]);
    // the dismiss control holds focus, not the one that commits
    await expect
      .element(screen.getByRole("button", { name: /keep current account/i }))
      .toHaveFocus();

    // dialog content sits behind the backdrop layer; a native click passes it
    (
      screen
        .getByRole("link", { name: /continue to stripe/i })
        .element() as HTMLElement
    ).click();
    expect(nav.hrefs).toEqual([`${START}&replace=1`]);
  });

  test("connected: keeping the current account closes the confirm without navigating", async () => {
    nav = capture_navigation();
    const screen = await render_card({
      status: "pending",
      start_href: "/api/stripe-connect/start",
    });

    await screen
      .getByRole("button", { name: /connect a different account/i })
      .click();
    // no query string on the start url: the flag opens one
    await expect
      .element(screen.getByRole("link", { name: /continue to stripe/i }))
      .toHaveAttribute("href", "/api/stripe-connect/start?replace=1");

    (
      screen
        .getByRole("button", { name: /keep current account/i })
        .element() as HTMLElement
    ).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(nav.hrefs).toEqual([]);
  });

  test.each<[IStripeConnectCard["notice"], RegExp]>([
    [{ result: "connected" }, /your stripe account is connected/i],
    [{ result: "denied" }, /didn't approve access on stripe/i],
    [{ result: "error" }, /couldn't connect your stripe account/i],
    [
      { result: "error", reason: "already_linked" },
      /already linked to another nonprofit/i,
    ],
    [
      { result: "error", reason: "replace_unconfirmed" },
      /wasn't changed.*confirm/i,
    ],
    [{ result: "error", reason: "expired" }, /timed out/i],
    [
      { result: "error", reason: "forbidden" },
      /don't have permission to connect/i,
    ],
    [
      { result: "error", reason: "failed" },
      /couldn't connect your stripe account/i,
    ],
  ])("notice %o reads its message and takes focus", async (notice, message) => {
    const screen = await render_card({ status: "not_connected", notice });

    const band = screen.getByText(message);
    await expect.element(band).toBeVisible();
    // arriving back from Stripe is a full page load; focus is what carries the
    // outcome to a screen reader
    await vi.waitFor(() =>
      expect((band.element() as HTMLElement).closest("[tabindex='-1']")).toBe(
        document.activeElement
      )
    );
  });

  test("no notice, no band and no focus taken", async () => {
    const screen = await render_card({ status: "ready" });
    await expect
      .element(screen.getByText("Ready to receive card donations"))
      .toBeVisible();
    expect(screen.container.querySelector("[tabindex='-1']")).toBeNull();
  });
});
