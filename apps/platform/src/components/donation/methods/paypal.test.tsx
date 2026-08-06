import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { Context } from "../context";
import { Steps } from "../index";
import { donation_recipient_init, type TDonation } from "../types";
import { stb } from "./__tests__/test-data";
import { Paypal } from "./paypal";

// no local sdk mock: the global one (src/__tests__/mocks/payment.tsx) resolves
// loadCoreSdkScript to null, which is exactly what a visitor with an adblocker
// or a csp that blocks paypal.com gets.

const load_failed =
  "PayPal failed to load — please try another payment method.";

const init = (over?: Partial<TDonation>): TDonation => ({
  base_url: "",
  source: "bg-marketplace",
  mode: "live",
  recipient: donation_recipient_init({ hide_bg_tip: true }),
  donor: donor_fv_blank,
  config: null,
  method: "stripe",
  ...over,
});

const express = {
  currency: "USD",
  frequency: "one-time" as const,
  amnt: 25,
  tip: 0,
  fee_allowance: 0,
  is_partial: false,
};

describe("paypal express: an sdk that never loads", () => {
  test("is reported as unavailable, not as a payment error", async () => {
    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = stb(
      <Context {...init()}>
        <Paypal
          {...express}
          validate={async () => true}
          on_error={on_error}
          on_unavailable={on_unavailable}
        />
      </Context>
    );
    await render(<Stub />);

    await vi.waitFor(() => expect(on_unavailable).toHaveBeenCalledOnce());
    expect(on_unavailable).toHaveBeenCalledWith(load_failed);
    expect(on_error).not.toHaveBeenCalled();
  });

  test("still surfaces through on_error when the caller doesn't handle it", async () => {
    const on_error = vi.fn();
    const Stub = stb(
      <Context {...init()}>
        <Paypal {...express} validate={async () => true} on_error={on_error} />
      </Context>
    );
    await render(<Stub />);

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(load_failed);
  });
});

describe("paypal express: per-mount handling of a blocked sdk", () => {
  test("a hide_unavailable_express mount drops the block and prompts nothing", async () => {
    const Stub = stb(<Steps init={init({ hide_unavailable_express: true })} />);
    const screen = await render(<Stub />);

    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();
    // the card panel body is up, so the absences below can't pass vacuously
    await expect
      .element(screen.getByRole("button", { name: /continue with card/i }))
      .toBeVisible();

    // nothing thrown over the page...
    await expect
      .element(screen.getByText(/paypal failed/i))
      .not.toBeInTheDocument();
    // ...and the express block itself is gone (its click gate is the only
    // rendered part of <Paypal> before a donor enters an amount)
    await vi.waitFor(() =>
      expect(
        screen.container.querySelector('[data-testid="paypal-gate"]')
      ).toBeNull()
    );
  });

  test("a mount without the flag tells the donor, in place of the block", async () => {
    const Stub = stb(<Steps init={init()} />);
    const screen = await render(<Stub />);

    await expect.element(screen.getByTestId("donate-methods")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /continue with card/i }))
      .toBeVisible();
    await expect.element(screen.getByText(load_failed)).toBeVisible();

    // not a modal: the sdk fails the same way on every mount, so a prompt the
    // donor closes would just come back — and this is the page they came to
    // donate on, with five other tabs behind it
    expect(screen.getByRole("dialog").query()).toBeNull();
    await vi.waitFor(() =>
      expect(
        screen.container.querySelector('[data-testid="paypal-gate"]')
      ).toBeNull()
    );
  });
});
