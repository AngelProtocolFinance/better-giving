import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { Context } from "../context";
import { donation_recipient_init, type TDonation } from "../types";
import { stb } from "./__tests__/test-data";
import { Paypal } from "./paypal";

// an sdk that fails once and then loads — its own file because paypal.tsx
// caches the sdk instance at module scope and vitest gives each file its own
// module registry, so the first-attempt failure can only happen once per file.
//
// what this proves: the cache reset in `get_sdk` really does let a second call
// re-run the whole chain, so the donor keeps paypal after a single dropped
// request instead of being told to pick another method.
const script = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@paypal/paypal-js/sdk-v6", () => ({
  loadCoreSdkScript: async () => {
    script.calls++;
    if (script.calls === 1) throw new Error("script failed to load");
    return {
      createInstance: async () => ({
        findEligibleMethods: async () => ({
          isEligible: (m: string) => m === "paypal",
        }),
        createPayPalOneTimePaymentSession: () => ({
          start: () => Promise.resolve(),
        }),
      }),
    };
  },
}));

const reported = vi.hoisted(() => [] as unknown[]);
vi.mock("@/errors/report", async (orig) => ({
  ...(await orig<typeof import("@/errors/report")>()),
  report_degraded: (e: unknown) => {
    reported.push(e);
  },
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

describe("paypal express: an sdk that fails once", () => {
  test("is retried, and the donor keeps paypal", async () => {
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

    await vi.waitFor(() => expect(script.calls).toBe(2));
    // nothing is withdrawn and nothing is reported — the donor never learns
    // the first attempt happened
    expect(on_unavailable).not.toHaveBeenCalled();
    expect(on_error).not.toHaveBeenCalled();
    expect(reported).toEqual([]);
  });
});
