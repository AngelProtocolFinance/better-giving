import { beforeEach, describe, expect, it, vi } from "vitest";
import { partition } from "@/donations/helpers";
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
  it("refuses a total that isn't whole dollars before creating the grant", async () => {
    const res = await chariot_intent(
      ctx({ base: 10, tip: 0, fee_allowance: 0.3 })
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).text()).toMatch(/whole dollar/i);
    expect(create_grant_mock).not.toHaveBeenCalled();
  });

  it("creates a whole-dollar total as its cents: 10 + 1 fee allowance is 1100", async () => {
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 1 }));
    expect(granted_cents()).toBe(1100);
  });

  it("grants every whole-dollar total whose parts carry float noise", async () => {
    // raw `partition` output, as an older checkout bundle still posts it:
    // $10 + 15% tip + covered fee, rescaled to whatever the donor granted
    const split = partition({ base: 10, tip: 1.5, fee_allowance: 0.5 });
    const mismatches: string[] = [];
    for (let n = 3; n <= 5_000; n++) {
      create_grant_mock.mockClear();
      await chariot_intent(ctx(split(n)));
      const granted = create_grant_mock.mock.calls[0]?.[0].amount;
      if (granted !== n * 100) mismatches.push(`${n}: ${granted}`);
    }
    expect(mismatches).toEqual([]);
  });
});
