import { eq } from "drizzle-orm";
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
const send_alert = vi.hoisted(() => vi.fn());
const referrer = vi.hoisted(() => ({ pay_id: 42, pay_min: 50 }));

/**
 * wise at its http boundary: `customerTransactionId` is the idempotency key,
 * so a reused ref answers with the original transfer, funded or not
 */
const wise = vi.hoisted(() => {
  const by_ref = new Map<string, { id: number; status: string }>();
  const by_id = new Map<number, { id: number; status: string }>();
  return {
    by_ref,
    by_id,
    v2_account: vi.fn(async () => ({ currency: "USD" })),
    quote: vi.fn(async (_: string, q: { sourceAmount: number }) => ({
      id: `q-${q.sourceAmount}`,
    })),
    transfer: vi.fn(
      async (t: { customerTransactionId: string; targetAccount: string }) => {
        const seen = by_ref.get(t.customerTransactionId);
        if (seen) return { ...seen };
        const created = {
          id: 9000 + by_ref.size,
          status: "incoming_payment_waiting",
        };
        by_ref.set(t.customerTransactionId, created);
        by_id.set(created.id, created);
        return { ...created };
      }
    ),
    fund_transfer: vi.fn(),
  };
});
/** funding as wise does it: the transfer moves on to processing */
const fund_ok = async (id: number) => {
  wise.by_id.get(id)!.status = "processing";
  return { status: "COMPLETED" as const };
};

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
vi.mock("$/env", () => ({ stage: "test", wise: { profile_id: "1" } }));
vi.mock("$/kit/discord", () => ({ aws_monitor: { send_alert } }));
vi.mock("$/kit/wise", () => ({ wise }));
vi.mock("./helpers", () => ({
  get_referrer: async (id: string) => ({
    id,
    name: "Ref",
    email: "ref@example.com",
    pay_id: referrer.pay_id,
    pay_min: referrer.pay_min,
  }),
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

const { index } = await import("./handler");
const { commission_refund } = await import("$/pg/queries/referrer");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { npos } = await import("$/pg/schema/npo");
const { referrer_commissions, referrer_payouts } = await import(
  "$/pg/schema/referrer"
);

const db = () => test_db.current!.db;
const REFERRER = "NPO-REF";
let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  send_alert.mockReset();
  referrer.pay_id = 42;
  referrer.pay_min = 50;
  wise.by_ref.clear();
  wise.by_id.clear();
  wise.quote.mockClear();
  wise.transfer.mockClear();
  wise.fund_transfer.mockReset().mockImplementation(fund_ok);
  await db().delete(referrer_payouts);
  await db().delete(referrer_commissions);
  await db().delete(npos);
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-COMMISSION",
      name: "Commission Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      referral_id: REFERRER,
    })
    .returning();
  npo_id = npo!.id;
});

async function seed(donation_id: string, amount: number) {
  await db().insert(referrer_commissions).values({
    referrer_npo: REFERRER,
    date: "2026-09-01T00:00:00.000Z",
    donation_id,
    npo_id,
    amount,
    status: "pending",
  });
}

const statuses = async () =>
  Object.fromEntries(
    (
      await db()
        .select({
          id: referrer_commissions.donation_id,
          status: referrer_commissions.status,
        })
        .from(referrer_commissions)
    ).map((r) => [r.id, r.status])
  );

const quoted = () => wise.quote.mock.calls.map(([, q]) => q.sourceAmount);
const refs = () =>
  wise.transfer.mock.calls.map(([t]) => t.customerTransactionId);
const alert_titles = () => send_alert.mock.calls.map(([a]) => a.title);

describe("commissions cron", () => {
  test("pays the pending total in cents, half down, and marks every commission paid", async () => {
    await seed("d-1", 10.005);
    await seed("d-2", 40);

    await index();

    expect(quoted()).toEqual([50]);
    expect(await statuses()).toEqual({ "d-1": "paid", "d-2": "paid" });
    const [payout] = await db().select().from(referrer_payouts);
    expect(payout).toMatchObject({
      id: refs()[0],
      amount: 50,
      transfer_id: 9000,
      error: null,
    });
  });

  test("a retry over a grown set after an unknown funding outcome pays only the new commission", async () => {
    await seed("d-1", 25);
    await seed("d-2", 30);
    wise.fund_transfer.mockRejectedValueOnce("fetch failed");
    await index();
    expect(alert_titles()).toContain(
      `commission funding status unknown for ${REFERRER}`
    );

    await seed("d-3", 60);
    await index();

    expect(quoted()).toEqual([55, 60]);
    expect(await statuses()).toEqual({
      "d-1": "processing",
      "d-2": "processing",
      "d-3": "paid",
    });
    const [first, second] = refs();
    expect(second).not.toBe(first);
    const stuck = send_alert.mock.calls.find(
      ([a]) => a.title === "commissions claimed but not paid"
    );
    expect(stuck?.[0].body).toContain(`${REFERRER} ref ${first}: d-1, d-2`);
  });

  test.each([
    ["the same", 42],
    ["a changed", 43],
  ])(
    "a set released after an unfunded transfer wise then cancelled is claimed again under a new ref and paid to %s recipient",
    async (_, pay_id) => {
      await seed("d-1", 25);
      await seed("d-2", 30);
      wise.fund_transfer.mockImplementationOnce(async (id: number) => {
        // wise cancels the transfer it was refused funding for
        wise.by_id.get(id)!.status = "cancelled";
        return { status: "REJECTED", errorCode: "balance.insufficient" };
      });
      await index();
      expect(await statuses()).toEqual({ "d-1": "pending", "d-2": "pending" });

      referrer.pay_id = pay_id;
      await index();

      const [first, second] = refs();
      expect(second).not.toBe(first);
      expect(wise.transfer.mock.calls[1]![0].targetAccount).toBe(
        String(pay_id)
      );
      expect(await statuses()).toEqual({ "d-1": "paid", "d-2": "paid" });
      const [payout] = await db()
        .select()
        .from(referrer_payouts)
        .where(eq(referrer_payouts.id, second!));
      expect(payout).toMatchObject({ amount: 55, transfer_id: 9001 });
    }
  );

  test("a commission refunded while its transfer went unfunded stays a loss, named in an alert with the ref", async () => {
    await seed("d-1", 25);
    await seed("d-2", 30);
    wise.fund_transfer.mockImplementationOnce(async () => {
      await commission_refund(db() as any, "d-1", "refunded");
      return { status: "REJECTED", errorCode: "balance.insufficient" };
    });

    await index();

    expect(await statuses()).toEqual({
      "d-1": "refunded_loss",
      "d-2": "pending",
    });
    const [a] = send_alert.mock.calls.find(([a]) =>
      a.title.startsWith("commission refunded in flight, not funded")
    )!;
    expect(a.body).toContain(refs()[0]);
    expect(a.fields).toContainEqual({ name: "not_released", value: "d-1" });
  });

  test.each([
    [24.998, 50, "paid"],
    [24.997, undefined, "pending"],
  ])(
    "two commissions of %s are judged against a 50 minimum as the cents they pay",
    async (amount, paid, status) => {
      await seed("d-1", amount);
      await seed("d-2", amount);

      await index();

      expect(quoted()).toEqual(paid === undefined ? [] : [paid]);
      expect(await statuses()).toEqual({ "d-1": status, "d-2": status });
    }
  );
});
