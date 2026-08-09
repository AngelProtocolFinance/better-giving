import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { Context } from "../context";
import { donation_recipient_init, type TDonation } from "../types";
import { stb } from "./__tests__/test-data";
import { Paypal } from "./paypal";

// an sdk that loads — separate file from paypal.test.tsx because paypal.tsx
// caches the sdk instance at module scope, and vitest gives each file its own
// module registry. eligibility is read at call time so test order is free.
const sdk = vi.hoisted(() => ({ eligible: true }));

vi.mock("@paypal/paypal-js/sdk-v6", () => ({
  loadCoreSdkScript: async () => ({
    createInstance: async () => ({
      findEligibleMethods: async () => ({
        isEligible: (m: string) => sdk.eligible && m === "paypal",
      }),
      createPayPalOneTimePaymentSession: () => ({
        // popup blocked / network drop after the donor clicked
        start: () => Promise.reject(new Error("session start failed")),
      }),
    }),
  }),
}));

const init = (): TDonation => ({
  base_url: "",
  source: "bg-marketplace",
  mode: "live",
  recipient: donation_recipient_init({ hide_bg_tip: true }),
  donor: donor_fv_blank,
  config: null,
  method: "stripe",
  hide_unavailable_express: true,
});

const express = {
  currency: "USD",
  frequency: "one-time" as const,
  amnt: 25,
  tip: 0,
  fee_allowance: 0,
  is_partial: false,
};

const mount = (on_error: () => void, on_unavailable: () => void) =>
  stb(
    <Context {...init()}>
      <Paypal
        {...express}
        validate={async () => true}
        on_error={on_error}
        on_unavailable={on_unavailable}
      />
    </Context>
  );

afterEach(() => {
  vi.restoreAllMocks();
  sdk.eligible = true;
});

describe("paypal express: no eligible funding method", () => {
  test("is reported as unavailable, not as a payment error", async () => {
    sdk.eligible = false;
    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = mount(on_error, on_unavailable);
    await render(<Stub />);

    await vi.waitFor(() => expect(on_unavailable).toHaveBeenCalledOnce());
    expect(on_unavailable).toHaveBeenCalledWith("PayPal not available for USD");
    expect(on_error).not.toHaveBeenCalled();
  });
});

describe("paypal express: a payment that dies mid-flight", () => {
  test("is an error even on a mount that degrades quietly", async () => {
    // the intent POST the click fires — the donor is already past the gate
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ tx_id: "tx_1", don_id: "don_1" })
    );

    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = mount(on_error, on_unavailable);
    const screen = await render(<Stub />);

    const btn = await vi.waitFor(() => {
      const el = screen.container.querySelector("paypal-button");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    btn.click();

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(
      "PayPal failed — please try another payment method."
    );
    expect(on_unavailable).not.toHaveBeenCalled();
  });
});
