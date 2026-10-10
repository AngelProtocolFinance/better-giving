import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const deductions = vi.hoisted(() => ({ on: false }));
const template = vi.hoisted(() =>
  vi.fn((_: unknown) => ({ node: null, subject: "schedule" }))
);

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
vi.mock("$/env", () => ({
  wise: { profile_id: "1", balance_id_usd: "2" },
  stage: "test",
  get owed_deductions() {
    return deductions.on;
  },
}));
// before every gift here, so a row a run may net once its notice is sent
const terms = vi.hoisted(() => ({ effective: "2026-01-01" }));
vi.mock("@/terms", async (io) => ({
  ...(await io<typeof import("@/terms")>()),
  get TERMS_EFFECTIVE() {
    return terms.effective;
  },
}));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: vi.fn(async () => {}) },
}));
vi.mock("$/kit/wise", () => ({
  wise: { balance: async () => ({ totalWorth: { value: 150 } }) },
}));
vi.mock("$/email", () => ({ send_email: vi.fn() }));
vi.mock("emails", () => ({ grants_schedule: { template } }));
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

const { index } = await import("./notif");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { banking_apps } = await import("$/pg/schema/banking");
const { donations } = await import("$/pg/schema/donation");
const { owed_amounts, owed_notices } = await import("$/pg/schema/owed");
const { npos } = await import("$/pg/schema/npo");
const { payouts } = await import("$/pg/schema/payout");

const db = () => test_db.current!.db;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  template.mockClear();
  deductions.on = false;
  terms.effective = "2026-01-01";
  await db().delete(owed_amounts);
  await db().delete(donations);
  await db().delete(payouts);
  await db().delete(banking_apps);
  await db().delete(npos);
});

const npo_ids: Record<string, number> = {};

async function seed_npo(
  name: string,
  o: { active?: boolean; recipient?: boolean; amount: number }
) {
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: `EIN-${name}`,
      name,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      cash: 1000,
      active: o.active,
    })
    .returning();
  npo_ids[name] = npo!.id;
  if (o.recipient !== false) {
    await db()
      .insert(banking_apps)
      .values({ id: `${npo!.id}77`, npo_id: npo!.id, status: "default" });
  }
  await db()
    .insert(payouts)
    .values({
      id: `p-${name}`,
      source_id: `dist-${name}`,
      npo_id: npo!.id,
      source: "donation",
      date: "2026-09-01T00:00:00.000Z",
      amount: o.amount,
      type: "pending",
    });
}

/** the npo named `name` owes `usd` on a gift refunded after its grant */
async function seed_owed(name: string, donation_id: string, usd: number) {
  await db().insert(donations).values({
    id: donation_id,
    upusd: 1,
    status: "refunded_loss",
    amount_base: usd,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  const [owed] = await db()
    .insert(owed_amounts)
    .values({
      donation_id,
      npo_id: npo_ids[name],
      source: "refund",
      source_ref: `re_${donation_id}`,
      recorded_at: "2026-09-15T00:00:00.000Z",
      received_usd: usd,
    })
    .returning({ id: owed_amounts.id });
  // the party was told of it, so a run may net it
  await db().insert(owed_notices).values({
    owed_id: owed!.id,
    kind: "recorded",
    created_at: "2026-09-15T00:00:00.000Z",
    sent_at: "2026-09-15T00:00:00.000Z",
  });
}

describe("grants schedule notice", () => {
  test("lists only the nonprofits the payout run will pay as pass, and totals those alone", async () => {
    await seed_npo("Paid", { amount: 100 });
    await seed_npo("Inactive", { active: false, amount: 100 });
    await seed_npo("NoRecipient", { recipient: false, amount: 100 });

    await index();

    const data = template.mock.calls[0]![0] as any;
    const effects = Object.fromEntries(
      data.rows.map((r: any) => [r.name, r.effect])
    );
    expect(effects).toEqual({
      Paid: "pass",
      Inactive: "skipped",
      NoRecipient: "skipped",
    });
    expect(data.total_grant).toBe(100);
    expect(data.low_balance).toBe(false);
  });

  test("an npo under its minimum is a skipped row showing its total and minimum, left out of the total", async () => {
    await seed_npo("Paid", { amount: 100 });
    await seed_npo("Small", { amount: 30 });

    await index();

    const data = template.mock.calls[0]![0] as any;
    const small = data.rows.find((r: any) => r.name === "Small");
    expect(small).toMatchObject({ amount: 30, min: 50, effect: "skipped" });
    expect(data.total_grant).toBe(100);
  });

  test("judges the 50 minimum on the cents the run pays: 49.996 passes as 50, 49.994 is skipped as 49.99", async () => {
    await seed_npo("Edge", { amount: 49.996 });
    await seed_npo("Under", { amount: 49.994 });

    await index();

    const data = template.mock.calls[0]![0] as any;
    const rows = Object.fromEntries(
      data.rows.map((r: any) => [r.name, [r.amount, r.effect]])
    );
    expect(rows).toEqual({ Edge: [50, "pass"], Under: [49.99, "skipped"] });
    expect(data.total_grant).toBe(50);
  });

  test("switched on, an npo's row shows its gross, each deduction by gift and its net, the total summing nets", async () => {
    deductions.on = true;
    await seed_npo("Nets", { amount: 500 });
    await seed_owed("Nets", "don-owed", 93.2);
    await seed_npo("Covered", { amount: 80, recipient: false });
    await seed_owed("Covered", "don-big", 93.2);

    await index();

    const data = template.mock.calls[0]![0] as any;
    const rows = Object.fromEntries(data.rows.map((r: any) => [r.name, r]));
    expect(rows.Nets).toMatchObject({
      amount: 500,
      net: 406.8,
      effect: "pass",
      deductions: [{ donation_id: "don-owed", usd: 93.2 }],
    });
    expect(rows.Covered).toMatchObject({
      amount: 80,
      net: 0,
      effect: "recovered",
      deductions: [{ donation_id: "don-big", usd: 80 }],
    });
    expect(data.total_grant).toBe(406.8);
  });

  test("switched on with no terms effective date, a row is the gross one, as if switched off", async () => {
    deductions.on = true;
    terms.effective = "soon";
    await seed_npo("Gross", { amount: 500 });
    await seed_owed("Gross", "don-owed", 93.2);

    await index();

    const data = template.mock.calls[0]![0] as any;
    expect(data.rows).toEqual([
      {
        id: npo_ids.Gross,
        name: "Gross",
        amount: 500,
        min: 50,
        effect: "pass",
      },
    ]);
    expect(data.total_grant).toBe(500);
  });

  test("switched on, an npo whose net falls under its minimum is skipped, still showing what it owes", async () => {
    deductions.on = true;
    await seed_npo("Small", { amount: 80 });
    await seed_owed("Small", "don-owed", 50);

    await index();

    const data = template.mock.calls[0]![0] as any;
    expect(data.rows[0]).toMatchObject({
      amount: 80,
      net: 30,
      effect: "skipped",
      deductions: [{ donation_id: "don-owed", usd: 50 }],
    });
    expect(data.total_grant).toBe(0);
  });

  test("switched on, an npo owed a transfer with no wise recipient is skipped, its total left out", async () => {
    deductions.on = true;
    await seed_npo("Paid", { amount: 100 });
    await seed_npo("NoRecipient", { amount: 500, recipient: false });
    await seed_owed("NoRecipient", "don-owed", 93.2);

    await index();

    const data = template.mock.calls[0]![0] as any;
    const row = data.rows.find((r: any) => r.name === "NoRecipient");
    expect(row).toMatchObject({ net: 406.8, effect: "skipped" });
    expect(data.total_grant).toBe(100);
  });
});
