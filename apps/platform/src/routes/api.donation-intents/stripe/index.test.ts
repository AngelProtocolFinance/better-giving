import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "../types";

const pi_create_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/stripe", () => ({
  stripe: { paymentIntents: { create: pi_create_mock } },
}));
vi.mock("#/.server/unit-per-usd", () => ({ unit_per_usd: async () => 1 }));
vi.mock("./customer-with-currency", () => ({
  customer_with_currency: async () => "cus_1",
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_put: async (_db: unknown, r: unknown) => r,
}));

const { stripe_intent } = await import("./index");

const ctx = (patch: Partial<Ctx["intent"]> = {}, via: Ctx["via"] = "bank") =>
  ({
    to: { to_id: "1", to_type: "npo", to_name: "ACME" },
    from: { from_email: "a@b.co" },
    donor: { email: "a@b.co" },
    via,
    via_extra: "",
    intent: {
      amount: { base: 10_000, tip: 0, fee_allowance: 0 },
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      ...patch,
    },
  }) as unknown as Ctx;

/** the shape stripe-node throws for a 400 from the api */
const stripe_refusal = (code: string, message: string) =>
  new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code,
    message,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripe_intent refusals", () => {
  const above =
    "This amount is above the limit for this payment method. Try a smaller amount or a different payment method.";
  const below =
    "This amount is below the minimum for this payment method. Try a larger amount or a different payment method.";

  it.each([
    ["amount_too_large", above],
    ["charge_exceeds_transaction_limit", above],
    ["amount_too_small", below],
  ])("answers %s with a donor-safe 400", async (code, reason) => {
    pi_create_mock.mockRejectedValue(
      stripe_refusal(code, "stripe's own account-specific wording")
    );

    const res = (await stripe_intent(ctx())) as Response;

    expect(res.status).toBe(400);
    expect(await res.text()).toBe(reason);
  });

  it("logs a mapped refusal with stripe's code, raw message and the donation id", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    pi_create_mock.mockRejectedValue(
      stripe_refusal("amount_too_large", "greater than $3,000.00 CAD")
    );

    await stripe_intent(ctx());

    const don_id = pi_create_mock.mock.calls[0]![0].metadata.order_id;
    const line = info.mock.calls.map((c) => c.join(" ")).join("\n");
    info.mockRestore();
    expect(line).toContain("amount_too_large");
    expect(line).toContain("greater than $3,000.00 CAD");
    expect(line).toContain(don_id);
  });

  it("answers an amount under the platform minimum with a donor-safe 400", async () => {
    const res = (await stripe_intent(
      ctx({ amount: { base: 1, tip: 0, fee_allowance: 0 } })
    )) as Response;

    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      "The minimum donation is $2. Try a larger amount."
    );
    expect(pi_create_mock).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-stripe error", new Error("socket hang up")],
    [
      "a stripe error with no code",
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        message: "no code here",
      }),
    ],
  ])("rethrows %s without logging", async (_, err) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    pi_create_mock.mockRejectedValue(err);

    const outcome = stripe_intent(ctx());
    await expect(outcome).rejects.toBe(err);
    const logged = info.mock.calls.length;
    info.mockRestore();
    expect(logged).toBe(0);
  });

  it("rethrows a stripe error the donor can't act on", async () => {
    const err = stripe_refusal("parameter_invalid_integer", "bad amount");
    pi_create_mock.mockRejectedValue(err);

    await expect(stripe_intent(ctx())).rejects.toBe(err);
  });
});
