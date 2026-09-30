import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { amnt_sum, partition } from "@/donations/helpers";
import { snap } from "@/helpers/decimal";
import type { TestDb } from "$/pg/test-utils/pglite";
import type { Ctx } from "../types";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const create_grant_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/chariot", () => ({
  chariot: { create_grant: create_grant_mock },
}));
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));

const { chariot_intent } = await import("./index");
const { seed_npo } = await import("#/__tests__/fixtures/funds");
const { donation_get } = await import("$/pg/queries/donation");
const { donations, donation_donors, donation_recipients } = await import(
  "$/pg/schema/donation"
);
const { npos } = await import("$/pg/schema/npo");
const { create_test_db } = await import("$/pg/test-utils/pglite");

const db = () => test_db.current!.db;
let npo_id: number;

const ctx = (amount: Ctx["intent"]["amount"]) =>
  ({
    to: { to_id: npo_id.toString(), to_type: "npo", to_name: "ACME" },
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

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db().delete(donation_donors);
  await db().delete(donation_recipients);
  await db().delete(donations);
  await db().delete(npos);
  npo_id = (await seed_npo(db(), { registration_number: "EIN-CHARIOT" }))!.id;
  let n = 0;
  create_grant_mock.mockImplementation(async () => {
    n++;
    return { id: `grant_${n}`, metadata: { don_id: `don_${n}` } };
  });
});

describe("chariot_intent repeat for one workflow session", () => {
  it("returns the donation already recorded for the grant instead of failing", async () => {
    // create grant is idempotent per workflow session: a repeat returns the same grant
    create_grant_mock.mockResolvedValue({
      id: "grant_1",
      metadata: { don_id: "don_1" },
    });
    const amount = { base: 10, tip: 0, fee_allowance: 0 };

    const first = await chariot_intent(ctx(amount));
    const again = await chariot_intent(ctx(amount));

    expect(again).toEqual(first);
    expect(again).toMatchObject({ don_id: "don_1" });
    expect(await db().select().from(donations)).toHaveLength(1);
  });
});

// the checkout reads a 400 or 404 as "nothing exists at chariot" and lets the
// donor retry, so a 4xx may only ever come before create grant
describe("chariot_intent refusals the donor can retry", () => {
  it("refuses a base under the minimum with a 4xx before creating the grant", async () => {
    const res = await chariot_intent(
      ctx({ base: 0.5, tip: 0, fee_allowance: 0.5 })
    );
    expect((res as Response).status).toBe(400);
    expect(create_grant_mock).not.toHaveBeenCalled();
  });

  it("never answers a failed create grant with a 4xx", async () => {
    create_grant_mock.mockRejectedValue(
      new Error("Chariot API error: 400 below the fund minimum")
    );
    await expect(
      chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }))
    ).rejects.toThrow();
  });

  it("never answers a failed write after the grant with a 4xx", async () => {
    create_grant_mock.mockResolvedValue({
      id: "grant_x",
      metadata: { don_id: "don_x" },
    });
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }));
    // same don_id, different grant: the row isn't this grant's, so it fails
    create_grant_mock.mockResolvedValue({
      id: "grant_y",
      metadata: { don_id: "don_x" },
    });
    await expect(
      chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }))
    ).rejects.toThrow();
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
    expect(await db().select().from(donations)).toEqual([]);
  });

  it("creates a whole-dollar total as its cents: 10 + 1 fee allowance is 1100", async () => {
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 1 }));
    expect(granted_cents()).toBe(1100);
    expect(await donation_get("don_1")).toMatchObject({
      status: "intent",
      via_extra: "grant_1",
      amount: { base: 10, tip: 0, fee_allowance: 1 },
    });
  });

  it("grants every whole-dollar total whose parts carry float noise, and records that total", async () => {
    // raw `partition` output, as an older checkout bundle still posts it:
    // $10 + 15% tip + covered fee, rescaled to whatever the donor granted
    const split = partition({ base: 10, tip: 1.5, fee_allowance: 0.5 });
    const noisy = Array.from({ length: 4_998 }, (_, i) => i + 3).filter(
      (n) => amnt_sum(split(n)) !== n
    );
    expect(noisy.length).toBeGreaterThan(100);

    const mismatches: string[] = [];
    for (const n of noisy) {
      create_grant_mock.mockClear();
      await chariot_intent(ctx(split(n)));
      const granted = create_grant_mock.mock.calls[0]?.[0].amount;
      if (granted !== n * 100) mismatches.push(`granted ${n}: ${granted}`);
    }

    // the row settlement splits the grant by: its parts must add up to it
    const stored = await db().select().from(donations);
    for (const d of stored) {
      const n = noisy[Number(d.id.replace("don_", "")) - 1];
      const total = snap(d.amount_base + d.amount_tip + d.amount_fee_allowance);
      if (total !== n) mismatches.push(`stored ${n}: ${total}`);
    }
    expect(mismatches).toEqual([]);
    expect(stored).toHaveLength(noisy.length);
  });
});
