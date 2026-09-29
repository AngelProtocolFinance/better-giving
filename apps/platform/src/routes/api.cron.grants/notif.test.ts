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
const template = vi.hoisted(() =>
  vi.fn((_: unknown) => ({ node: null, subject: "schedule" }))
);

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
vi.mock("$/env", () => ({
  wise: { profile_id: "1", balance_id_usd: "2" },
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
  await db().delete(payouts);
  await db().delete(banking_apps);
  await db().delete(npos);
});

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
});
