import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { settle_stripe } from "../../../common/stripe";
import { Context } from "../../../context";
import { donation_recipient_init, type TDonation } from "../../../types";
import { stb } from "../../__tests__/test-data";
import { ExpressCheckout } from ".";

// js.stripe.com blocked outright — the script never runs, so no element is
// ever created and `onLoadError` can never fire. own file because
// common/stripe.ts calls loadStripe once at module scope and vitest gives each
// file its own module registry; express-checkout.test.tsx is the same mount
// with a script that loads.
//
// the whole file also stands as the unhandled-rejection check: nothing here
// awaits `stripe_promise` before the component mounts, so if common/stripe.ts
// left it unhandled, the rejection below would surface as a test-run error.
const blocked = vi.hoisted(() => new Error("Failed to load Stripe.js"));
const script = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: () => {
    script.calls++;
    return Promise.reject(blocked);
  },
}));

const reported = vi.hoisted(() => [] as unknown[]);
vi.mock("@/errors/report", async (orig) => ({
  ...(await orig<typeof import("@/errors/report")>()),
  report_error: (e: unknown) => {
    reported.push(["error", e]);
  },
  report_degraded: (e: unknown) => {
    reported.push(["degraded", e]);
  },
}));

const load_failed =
  "Express checkout failed to load — please try another payment method.";

// the flag is on: whatever still reaches on_error here isn't over-swallowing
const init = (): TDonation => ({
  base_url: "https://test.example.com",
  source: "bg-marketplace",
  mode: "live",
  recipient: donation_recipient_init({ hide_bg_tip: true }),
  donor: donor_fv_blank,
  config: null,
  method: "stripe",
  hide_unavailable_express: true,
});

const express = {
  frequency: "one-time" as const,
  currency: "usd",
  total_usd: 25,
  total_atomic: 2500,
  total: 25,
  base: 25,
  tip: 0,
  fee_allowance: 0,
  items: [{ name: "Donation", amount_atomic: 2500 }],
  is_partial: false,
};

const mount = (handlers: {
  on_error: (msg: string) => void;
  on_unavailable?: (msg: string) => void;
}) =>
  stb(
    <Context {...init()}>
      <ExpressCheckout {...express} validate={async () => true} {...handlers} />
    </Context>
  );

describe("stripe.js itself never loads", () => {
  test("degrades as unavailable and is reported", async () => {
    reported.length = 0;
    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = mount({ on_error, on_unavailable });
    await render(<Stub />);

    await vi.waitFor(() => expect(on_unavailable).toHaveBeenCalledOnce());
    expect(on_unavailable).toHaveBeenCalledWith(load_failed);
    expect(on_error).not.toHaveBeenCalled();
    // observable: without this the donor gets an empty div and nobody hears.
    // degraded, not error — js.stripe.com is unreachable from this browser and
    // there is nothing here to fix
    expect(reported).toEqual([["degraded", blocked]]);
    // asked twice before giving up
    expect(script.calls).toBe(2);
  });

  test("still surfaces through on_error when the caller doesn't handle it", async () => {
    const on_error = vi.fn();
    const Stub = mount({ on_error });
    await render(<Stub />);

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(load_failed);
  });
});

// both shapes of the same failure, without the module-scope promise in the way
describe("settle_stripe", () => {
  test("a rejection settles to not-ok, carrying the error", async () => {
    const err = new Error("blocked");
    const r = await settle_stripe(Promise.reject(err));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.err).toBe(err);
  });

  test("a null stripe settles to not-ok too", async () => {
    // loadStripe resolves null rather than rejecting when the script loaded
    // but stripe never attached — and on the server, where it's a no-op
    const r = await settle_stripe(Promise.resolve(null));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.err).toBeInstanceOf(Error);
  });

  test("a live stripe settles to ok", async () => {
    const r = await settle_stripe(Promise.resolve({} as any));
    expect(r.ok).toBe(true);
  });
});
