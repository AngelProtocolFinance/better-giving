import { describe, expect, test } from "vitest";
import { type IRoutingNpo, is_routable } from "./eligibility";

const npo: IRoutingNpo = {
  stripe_account_id: "acct_1",
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_details_submitted: true,
  stripe_requirements_due: [],
  fiscal_sponsored: false,
  hq_country_code: "US",
};

describe("is_routable", () => {
  test("a ready, unsponsored npo in a supported country routes when the switch is on", () => {
    expect(is_routable(npo, true)).toBe(true);
  });

  test("the same npo stays pooled while the switch is off", () => {
    expect(is_routable(npo, false)).toBe(false);
  });

  // a sponsored org isn't the donee, so no stripe state can make it one
  test("a fiscally sponsored npo never routes, however ready its account", () => {
    expect(is_routable({ ...npo, fiscal_sponsored: true }, true)).toBe(false);
  });

  test.each<[string, Partial<IRoutingNpo>]>([
    ["no connected account", { stripe_account_id: null }],
    ["payouts not enabled", { stripe_payouts_enabled: false }],
    ["details not submitted", { stripe_details_submitted: false }],
    // readiness is connect_status's "ready", the banking page's own word for it
    ["charges not enabled", { stripe_charges_enabled: false }],
  ])("%s stays pooled", (_case, patch) => {
    expect(is_routable({ ...npo, ...patch }, true)).toBe(false);
  });

  test.each<[string, string | undefined]>([
    // stripe has no self-serve transfer to a full account outside the set
    ["outside the transfer set", "PH"],
    // stripe offers icelandic accounts only on the recipient agreement
    ["recipient-only", "IS"],
    ["a country name, not a code", "United Kingdom"],
    ["unmappable", undefined],
  ])("an hq country %s stays pooled", (_case, hq_country_code) => {
    expect(is_routable({ ...npo, hq_country_code }, true)).toBe(false);
  });

  test.each(["GB", "gb", "Ch", "de", "NO"])(
    "an hq country of %s routes",
    (hq_country_code) => {
      expect(is_routable({ ...npo, hq_country_code }, true)).toBe(true);
    }
  );
});
