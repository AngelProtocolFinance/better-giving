import { describe, expect, test } from "vitest";
import { is_routable, routing_npo } from "./eligibility";

/** the npo row columns routing reads, ready to route */
const row = {
  stripe_account_id: "acct_1" as string | null,
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_details_submitted: true,
  stripe_requirements_due: [] as string[],
  stripe_deauthorized_at: null as string | null,
  fiscal_sponsored: false,
  hq_country: "United States",
};
type Row = typeof row;

const routable = (patch: Partial<Row> = {}, on = true) =>
  is_routable(routing_npo({ ...row, ...patch }), on);

describe("is_routable", () => {
  test("a ready, unsponsored npo in a supported country routes when the switch is on", () => {
    expect(routable()).toBe(true);
  });

  test("the same npo stays pooled while the switch is off", () => {
    expect(routable({}, false)).toBe(false);
  });

  // a sponsored org isn't the donee, so no stripe state can make it one
  test("a fiscally sponsored npo never routes, however ready its account", () => {
    expect(routable({ fiscal_sponsored: true })).toBe(false);
  });

  // stripe keeps billing a disconnected account's donors but can no longer pay it
  test("an npo that disconnected us stays pooled, however ready its account last read", () => {
    expect(
      routable({ stripe_deauthorized_at: "2026-10-01T00:00:00.000Z" })
    ).toBe(false);
  });

  test.each<[string, Partial<Row>]>([
    ["no connected account", { stripe_account_id: null }],
    ["payouts not enabled", { stripe_payouts_enabled: false }],
    ["details not submitted", { stripe_details_submitted: false }],
    // readiness is connect_status's "ready", the banking page's own word for it
    ["charges not enabled", { stripe_charges_enabled: false }],
  ])("%s stays pooled", (_case, patch) => {
    expect(routable(patch)).toBe(false);
  });

  test.each<[string, string]>([
    // stripe has no self-serve transfer to a full account outside the set
    ["outside the transfer set", "Philippines"],
    // stripe offers icelandic accounts only on the recipient agreement
    ["recipient-only", "Iceland"],
    ["unmappable", "Atlantis"],
  ])("an hq country %s stays pooled", (_case, hq_country) => {
    expect(routable({ hq_country })).toBe(false);
  });

  test.each(["United Kingdom", "switzerland", "Germany", " Norway "])(
    "an hq country of %s routes",
    (hq_country) => {
      expect(routable({ hq_country })).toBe(true);
    }
  );
});
