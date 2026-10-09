import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { resp } from "@/helpers/https";
import { Context } from "../context";
import { donation_recipient_init, type TDonation } from "../types";
import { stb } from "./__tests__/test-data";
import { Paypal } from "./paypal";

// an sdk that loads — separate file from paypal.test.tsx because paypal.tsx
// caches the sdk instance at module scope, and vitest gives each file its own
// module registry. eligibility is read at call time so test order is free.
const sdk = vi.hoisted(() => ({
  eligible: true,
  starts: [] as Promise<unknown>[],
}));

// popup blocked / network drop after the donor clicked. waits on the order as
// the sdk does, so a refused intent rejects it first; then fails both ways the
// v6 sdk reports — onError with a wrapped error, and start's rejection
const session = vi.hoisted(() => (opts: { onError: (e: Error) => void }) => ({
  start: (_: unknown, order: Promise<unknown>) => {
    const started = (async () => {
      await order.catch(() => {});
      opts.onError(new Error("wrapped"));
      throw new Error("session start failed");
    })();
    sdk.starts.push(started);
    return started;
  },
}));

vi.mock("@paypal/paypal-js/sdk-v6", () => ({
  loadCoreSdkScript: async () => ({
    createInstance: async () => ({
      findEligibleMethods: async () => ({
        isEligible: (m: string) =>
          sdk.eligible && (m === "paypal" || m === "venmo"),
      }),
      createPayPalOneTimePaymentSession: session,
      createPayPalSubscriptionPaymentSession: session,
      createVenmoOneTimePaymentSession: session,
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

type Frequency = "one-time" | "monthly";

const express = {
  currency: "USD",
  amnt: 25,
  tip: 0,
  fee_allowance: 0,
  is_partial: false,
};

const mount = (
  on_error: () => void,
  on_unavailable: () => void,
  frequency: Frequency = "one-time"
) =>
  stb(
    <Context {...init()}>
      <Paypal
        {...express}
        frequency={frequency}
        validate={async () => true}
        on_error={on_error}
        on_unavailable={on_unavailable}
      />
    </Context>
  );

afterEach(() => {
  vi.restoreAllMocks();
  sdk.eligible = true;
  sdk.starts = [];
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

describe.each([
  ["one-time", "paypal-button", ""],
  ["monthly", "paypal-button", ""],
  ["one-time", "venmo-button", "venmo"],
] as const)(
  "%s %s: an intent our api refuses",
  (frequency, button, via_extra) => {
    /** every error the click raised, once its session has finished failing */
    const click = async (intent_res: Response) => {
      const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(intent_res);
      const on_error = vi.fn();
      const Stub = mount(on_error, vi.fn(), frequency);
      const screen = await render(<Stub />);
      const btn = await vi.waitFor(() => {
        const el = screen.container.querySelector(button);
        expect(el).not.toBeNull();
        return el as HTMLElement;
      });
      btn.click();
      await vi.waitFor(() => expect(sdk.starts).toHaveLength(1));
      await Promise.allSettled(sdk.starts);
      await new Promise((r) => setTimeout(r));
      return { on_error, fetch };
    };

    test("shows the donor the api's own refusal, once", async () => {
      const msg = "This nonprofit isn't accepting donations right now.";
      const { on_error } = await click(resp.refuse(msg, 404));

      expect(on_error).toHaveBeenCalledExactlyOnceWith(msg);
    });

    test("names the method the donor picked, so a refusal can too", async () => {
      const { fetch } = await click(resp.refuse("refused"));

      const [, init] = fetch.mock.calls[0]!;
      expect(JSON.parse(String(init?.body))).toMatchObject({
        via: "paypal",
        via_extra,
      });
    });

    test("keeps the generic message for an edge page that isn't ours", async () => {
      const { on_error } = await click(
        new Response("<html>bad gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        })
      );

      expect(on_error).toHaveBeenCalledExactlyOnceWith(
        "PayPal failed — please try another payment method."
      );
    });
  }
);
