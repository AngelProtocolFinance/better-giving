import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { Context } from "../../../context";
import { donation_recipient_init, type TDonation } from "../../../types";
import { stb } from "../../__tests__/test-data";
import { ExpressCheckout } from ".";

// js.stripe.com drops the first request and answers the second. own file
// because common/stripe.ts calls loadStripe once at module scope and vitest
// gives each test file its own module registry — the first-attempt failure can
// only happen once per file. sibling of stripe-js-blocked.test.tsx, which is
// the same mount with an origin that never answers.
const script = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: () => {
    script.calls++;
    return script.calls === 1
      ? Promise.reject(new Error("Failed to load Stripe.js"))
      : Promise.resolve({} as any);
  },
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => children,
  ExpressCheckoutElement: () => (
    <div data-testid="express-checkout">express checkout</div>
  ),
  useElements: () => null,
  useStripe: () => null,
}));

const reported = vi.hoisted(() => [] as unknown[]);
vi.mock("@/errors/report", async (orig) => ({
  ...(await orig<typeof import("@/errors/report")>()),
  report_degraded: (e: unknown) => {
    reported.push(e);
  },
}));

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

describe("stripe.js fails once", () => {
  test("is retried, and express checkout stays offered", async () => {
    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = stb(
      <Context {...init()}>
        <ExpressCheckout
          {...express}
          validate={async () => true}
          on_error={on_error}
          on_unavailable={on_unavailable}
        />
      </Context>
    );
    const screen = await render(<Stub />);

    await vi.waitFor(() => expect(script.calls).toBe(2));
    await expect.element(screen.getByTestId("express-checkout")).toBeVisible();
    expect(on_unavailable).not.toHaveBeenCalled();
    expect(on_error).not.toHaveBeenCalled();
    expect(reported).toEqual([]);
  });
});
