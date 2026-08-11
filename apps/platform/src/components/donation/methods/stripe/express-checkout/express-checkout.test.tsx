import { useEffect } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { donor_fv_blank } from "@/donations/schema";
import { Context } from "../../../context";
import { donation_recipient_init, type TDonation } from "../../../types";
import { stb } from "../../__tests__/test-data";
import { ExpressCheckout } from ".";

// the global mock (src/__tests__/mocks/payment.tsx) stubs the express element
// out entirely, so none of its events can fire there. this file replaces that
// stub with one that emits them: `loaderror` for the pre-interaction failure,
// and a click that drives onConfirm for the in-flight one.
//
// what this file proves: our handlers are wired to the right element events,
// `on_unavailable ?? on_error` resolves the way it's documented, and none of
// the four on_confirm failures leak onto `on_unavailable`. what it does NOT
// prove: that stripe really emits `loaderror` for an adblocked element, or
// that any of this survives a real <Elements> — both are stripe's behavior,
// stubbed out here.
const el = vi.hoisted(() => ({
  load_error: false,
  error: { message: "element iframe blocked" } as Record<string, unknown>,
}));
const reported = vi.hoisted(() => [] as [string, unknown][]);
vi.mock("@/errors/report", async (orig) => ({
  ...(await orig<typeof import("@/errors/report")>()),
  report_error: (e: unknown) => {
    reported.push(["error", e]);
  },
  report_degraded: (e: unknown) => {
    reported.push(["degraded", e]);
  },
}));
const stripe = vi.hoisted(() => ({ value: null as any }));
const elements = vi.hoisted(() => ({ value: null as any }));

// stripe.js itself loads here, so the mount reaches the element. the blocked
// -script case can't share this file: common/stripe.ts calls loadStripe once
// at module scope, and a module registry is per test file (see
// stripe-js-blocked.test.tsx).
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: () => Promise.resolve({} as any),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => children,
  ExpressCheckoutElement: ({ onLoadError, onConfirm }: any) => {
    // mount-only: `onLoadError` is an inline arrow, so keeping it in the deps
    // would re-fire the handler on every re-render and quietly turn the
    // `toHaveBeenCalledOnce()` assertions below into "called at least once".
    // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design, per the note above
    useEffect(() => {
      if (el.load_error) {
        onLoadError({ elementType: "expressCheckout", error: el.error });
      }
    }, []);
    return (
      <button
        type="button"
        data-testid="express-btn"
        onClick={() =>
          onConfirm({
            expressPaymentType: "apple_pay",
            billingDetails: {
              email: "john@doe.com",
              name: "John Doe",
              address: {
                line1: "1 Main St",
                line2: "",
                city: "Springfield",
                state: "IL",
                country: "US",
                postal_code: "62701",
              },
            },
          })
        }
      />
    );
  },
  useStripe: () => stripe.value,
  useElements: () => elements.value,
}));

const load_failed =
  "Express checkout failed to load — please try another payment method.";

// every mount here carries the flag — it's the mount that degrades quietly, so
// anything that still reaches on_error proves it isn't over-swallowing.
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

describe("stripe express: an element that reports a load error", () => {
  const og_error = console.error;
  beforeAll(() => {
    console.error = vi.fn();
    return () => {
      console.error = og_error;
    };
  });
  afterEach(() => {
    el.load_error = false;
    el.error = { message: "element iframe blocked" };
    reported.length = 0;
    vi.restoreAllMocks();
  });

  test("is reported as unavailable, not as a payment error", async () => {
    el.load_error = true;
    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = mount({ on_error, on_unavailable });
    await render(<Stub />);

    await vi.waitFor(() => expect(on_unavailable).toHaveBeenCalledOnce());
    expect(on_unavailable).toHaveBeenCalledWith(load_failed);
    expect(on_error).not.toHaveBeenCalled();
  });

  test("a donor who can't reach stripe is not an application defect", async () => {
    // stripe's own code for it. nothing in this repo is broken, and these
    // outnumber real defects enough to bury them if they page the same way
    el.load_error = true;
    el.error = { type: "api_connection_error", message: "network" };
    const Stub = mount({ on_error: vi.fn(), on_unavailable: vi.fn() });
    await render(<Stub />);

    await vi.waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0]![0]).toBe("degraded");
  });

  test("anything else stays a defect — an amount stripe rejects lands here too", async () => {
    el.load_error = true;
    el.error = { type: "validation_error", message: "Amount must be at least" };
    const Stub = mount({ on_error: vi.fn(), on_unavailable: vi.fn() });
    await render(<Stub />);

    await vi.waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0]![0]).toBe("error");
  });

  test("still surfaces through on_error when the caller doesn't handle it", async () => {
    el.load_error = true;
    const on_error = vi.fn();
    const Stub = mount({ on_error });
    await render(<Stub />);

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(load_failed);
  });
});

describe("stripe express: a payment that dies mid-flight", () => {
  const og_error = console.error;
  beforeAll(() => {
    console.error = vi.fn();
    return () => {
      console.error = og_error;
    };
  });
  afterEach(() => {
    stripe.value = null;
    elements.value = null;
    vi.restoreAllMocks();
  });

  test("is an error even on a mount that degrades quietly", async () => {
    elements.value = { submit: async () => ({}) };
    stripe.value = {
      confirmPayment: async () => ({
        error: { message: "Your card was declined." },
      }),
    };
    // the intent POST the confirm fires — the donor is already past the wallet
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ order_id: "ord_1", client_secret: "cs_1" })
    );

    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = mount({ on_error, on_unavailable });
    const screen = await render(<Stub />);

    await screen.getByTestId("express-btn").click();

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith("Your card was declined.");
    expect(on_unavailable).not.toHaveBeenCalled();
  });

  test("a failed intent is an error too, not an unavailable block", async () => {
    elements.value = { submit: async () => ({}) };
    stripe.value = { confirmPayment: async () => ({}) };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500, statusText: "Server Error" })
    );

    const on_error = vi.fn();
    const on_unavailable = vi.fn();
    const Stub = mount({ on_error, on_unavailable });
    const screen = await render(<Stub />);

    await screen.getByTestId("express-btn").click();

    await vi.waitFor(() => expect(on_error).toHaveBeenCalledOnce());
    expect(on_error).toHaveBeenCalledWith(
      "Failed to create donation intent: Server Error"
    );
    expect(on_unavailable).not.toHaveBeenCalled();
  });
});
