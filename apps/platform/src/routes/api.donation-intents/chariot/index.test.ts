import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "../types";

const create_grant_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/chariot", () => ({
  chariot: { create_grant: create_grant_mock },
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_put: async (_db: unknown, r: unknown) => r,
}));

const { chariot_intent } = await import("./index");

const ctx = (amount: Ctx["intent"]["amount"]) =>
  ({
    to: { to_id: "1", to_type: "npo", to_name: "ACME" },
    from: { from_email: "a@b.co" },
    donor: { email: "a@b.co" },
    via: "chariot",
    via_extra: "wfs_1",
    intent: {
      amount,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
    },
  }) as unknown as Ctx;

const granted_cents = () => create_grant_mock.mock.calls[0][0].amount;

beforeEach(() => {
  vi.clearAllMocks();
  create_grant_mock.mockResolvedValue({
    id: "grant_1",
    metadata: { don_id: "don_1" },
  });
});

describe("chariot_intent grant amount", () => {
  it("creates a 19.99 total as a 1999-cent grant", async () => {
    await chariot_intent(ctx({ base: 19.99, tip: 0, fee_allowance: 0 }));
    expect(granted_cents()).toBe(1999);
  });

  it("sums base, tip and fee allowance before converting: 8 + 0.51 + 1.20 is 971", async () => {
    await chariot_intent(ctx({ base: 8, tip: 0.51, fee_allowance: 1.2 }));
    expect(granted_cents()).toBe(971);
  });

  it("grants the whole-cent sum of the parts, across a cent sweep", async () => {
    const mismatches: string[] = [];
    for (let c = 200; c <= 100_000; c += 7) {
      create_grant_mock.mockClear();
      await chariot_intent(
        ctx({ base: c / 100, tip: 0.51, fee_allowance: 1.2 })
      );
      const expected = c + 51 + 120;
      if (granted_cents() !== expected)
        mismatches.push(`${c}: ${granted_cents()} vs ${expected}`);
    }
    expect(mismatches).toEqual([]);
  });
});
