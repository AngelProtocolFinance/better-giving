import type Stripe from "stripe";
import { describe, expect, test } from "vitest";
import { account_mirror, connect_status } from "./readiness";

const account = (o: Partial<Stripe.Account>): Stripe.Account => ({
  id: "acct_1",
  object: "account",
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  email: null,
  type: "standard",
  ...o,
});

const due = (currently_due: string[] | null) => ({
  requirements: {
    alternatives: null,
    current_deadline: null,
    currently_due,
    disabled_reason: null,
    errors: null,
    eventually_due: null,
    past_due: null,
    pending_verification: null,
  },
});

describe("account_mirror", () => {
  test("copies the three flags and what is currently due", () => {
    const m = account_mirror(
      account({
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        ...due(["external_account"]),
      })
    );

    expect(m).toEqual({
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
      requirements_due: ["external_account"],
    });
  });

  test.each([
    ["absent", {}],
    ["null currently_due", due(null)],
  ])("%s requirements read as nothing due", (_case, o) => {
    expect(account_mirror(account(o)).requirements_due).toEqual([]);
  });
});

describe("connect_status", () => {
  const mirror = {
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements_due: [],
  };

  test("no account is not_connected", () => {
    expect(connect_status(null)).toBe("not_connected");
  });

  test("all three flags with nothing due is ready", () => {
    expect(connect_status(mirror)).toBe("ready");
  });

  // ready keys on the flags alone: stripe can enable an account while a
  // future deadline is already listed as due
  test("all three flags is ready even with something due", () => {
    expect(
      connect_status({ ...mirror, requirements_due: ["individual.dob.day"] })
    ).toBe("ready");
  });

  test("details not submitted is incomplete", () => {
    expect(
      connect_status({
        ...mirror,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      })
    ).toBe("incomplete");
  });

  test("submitted but something due is incomplete", () => {
    expect(
      connect_status({
        ...mirror,
        payouts_enabled: false,
        requirements_due: ["external_account"],
      })
    ).toBe("incomplete");
  });

  test("submitted, nothing due, not yet enabled is pending", () => {
    expect(
      connect_status({
        ...mirror,
        charges_enabled: false,
        payouts_enabled: false,
      })
    ).toBe("pending");
  });
});
