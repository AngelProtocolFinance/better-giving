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
const wise_pay_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const send_alert = vi.hoisted(() => vi.fn());
const settle_spy = vi.hoisted(() => vi.fn());
/** runs right after the cron's pending snapshot — a write that commits
 * between the snapshot and the settle */
const after_snapshot = vi.hoisted(() => ({
  current: null as null | (() => Promise<void>),
}));

vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/env", () => ({ stage: "test" }));
vi.mock("$/kit/discord", () => ({ aws_monitor: { send_alert } }));
vi.mock("$/payouts/wise-pay", () => ({ wise_pay: wise_pay_mock }));
vi.mock("$/payouts/settle", async (io) => {
  const actual = await io<typeof import("$/payouts/settle")>();
  settle_spy.mockImplementation(actual.settle_npo_payouts);
  return { ...actual, settle_npo_payouts: settle_spy };
});
vi.mock("$/pg/queries/payout", async (io) => {
  const actual = await io<typeof import("$/pg/queries/payout")>();
  return {
    ...actual,
    pending_payouts: async () => {
      const snapshot = await actual.pending_payouts();
      await after_snapshot.current?.();
      return snapshot;
    },
  };
});
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
const { NotFundedError } = await import("$/payouts/settle");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { banking_apps } = await import("$/pg/schema/banking");
const { npos } = await import("$/pg/schema/npo");
const { payouts, settlements } = await import("$/pg/schema/payout");

const db = () => test_db.current!.db;

const WISE_RECIPIENT = 777;
const TRANSFER_ID = 9001;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  after_snapshot.current = null;
  wise_pay_mock.mockReset().mockResolvedValue(TRANSFER_ID);
  report_error_mock.mockReset();
  send_alert.mockReset();
  settle_spy.mockClear();
  await db().delete(payouts);
  await db().delete(settlements);
  await db().delete(banking_apps);
  await db().delete(npos);
});

async function seed_npo(o: { cash: number; payout_minimum?: number }) {
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-GRANTS",
      name: "Grants Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      cash: o.cash,
      payout_minimum: o.payout_minimum,
    })
    .returning();
  await db()
    .insert(banking_apps)
    .values({ id: String(WISE_RECIPIENT), npo_id: npo!.id, status: "default" });
  return npo!.id;
}

async function seed_payout(npo_id: number, id: string, amount: number) {
  await db()
    .insert(payouts)
    .values({
      id,
      source_id: `dist-${id}`,
      npo_id,
      source: "donation",
      date: "2026-09-01T00:00:00.000Z",
      amount,
      type: "pending",
    });
}

/** left `processing` by a run that died; no `ref` is a claim from before refs were stored */
async function seed_claimed(
  npo_id: number,
  id: string,
  amount: number,
  ref?: string
) {
  await seed_payout(npo_id, id, amount);
  await db()
    .update(payouts)
    .set({ type: "processing", message: ref ?? null })
    .where(eq(payouts.id, id));
}

async function mark_refunded(id: string) {
  await db()
    .update(payouts)
    .set({ type: "refunded" })
    .where(eq(payouts.id, id));
}

const payout_types = async () =>
  Object.fromEntries(
    (
      await db().select({ id: payouts.id, type: payouts.type }).from(payouts)
    ).map((r) => [r.id, r.type])
  );

const npo_cash = async (id: number) =>
  (await db().select({ cash: npos.cash }).from(npos).where(eq(npos.id, id)))[0]
    ?.cash;

describe("grants cron execute", () => {
  test("pays the npo its full pending total and settles every payout", async () => {
    const npo_id = await seed_npo({ cash: 500 });
    await seed_payout(npo_id, "p-1", 60);
    await seed_payout(npo_id, "p-2", 40);

    await index();

    expect(report_error_mock).not.toHaveBeenCalled();
    expect(settle_spy).toHaveBeenCalledOnce();
    expect(settle_spy.mock.calls[0]![0]).toMatchObject({ id: npo_id });
    expect([...settle_spy.mock.calls[0]![1]].sort()).toEqual(["p-1", "p-2"]);
    expect(wise_pay_mock).toHaveBeenCalledOnce();
    expect(wise_pay_mock).toHaveBeenCalledWith(
      WISE_RECIPIENT,
      100,
      expect.any(String)
    );
    const ref = wise_pay_mock.mock.calls[0]![2];
    expect(send_alert).toHaveBeenCalledOnce();
    expect(send_alert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTICE",
        title: expect.stringMatching(/^Grant paid for npo:/),
        fields: [
          { name: "amount", value: "100" },
          { name: "transfer_id", value: String(TRANSFER_ID) },
          { name: "ref_id", value: ref },
        ],
      })
    );
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "settled",
    });
    const [stlmt] = await db().select().from(settlements);
    expect(stlmt).toMatchObject({ id: String(TRANSFER_ID), amount: 100 });
    expect([...(stlmt?.sources ?? [])].sort()).toEqual([
      "dist-p-1",
      "dist-p-2",
    ]);
    expect(await npo_cash(npo_id)).toBe(400);
  });

  test("a payout refunded after the snapshot is left out of the transfer and the settlement", async () => {
    const npo_id = await seed_npo({ cash: 500 });
    await seed_payout(npo_id, "p-1", 60);
    await seed_payout(npo_id, "p-2", 40);
    after_snapshot.current = () => mark_refunded("p-2");

    await index();

    expect(report_error_mock).not.toHaveBeenCalled();
    expect(wise_pay_mock).toHaveBeenCalledWith(
      WISE_RECIPIENT,
      60,
      expect.any(String)
    );
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "refunded",
    });
    const [stlmt] = await db().select().from(settlements);
    expect(stlmt).toMatchObject({ amount: 60, sources: ["dist-p-1"] });
    expect(await npo_cash(npo_id)).toBe(440);
  });

  test("no transfer when every snapshot payout was refunded meanwhile", async () => {
    // the column has no db check, so a zero minimum is storable and only the
    // nothing-pending guard stops a zero wise transfer
    const npo_id = await seed_npo({ cash: 500, payout_minimum: 0 });
    await seed_payout(npo_id, "p-1", 60);
    await seed_payout(npo_id, "p-2", 40);
    after_snapshot.current = async () => {
      await mark_refunded("p-1");
      await mark_refunded("p-2");
    };

    await index();

    expect(report_error_mock).not.toHaveBeenCalled();
    expect(wise_pay_mock).not.toHaveBeenCalled();
    expect(await payout_types()).toEqual({
      "p-1": "refunded",
      "p-2": "refunded",
    });
    expect(await db().select().from(settlements)).toEqual([]);
    expect(await npo_cash(npo_id)).toBe(500);
  });

  test("payouts a past run claimed and never settled raise one alert naming each claim's wise ref, and the run still pays", async () => {
    const npo_id = await seed_npo({ cash: 500 });
    await seed_claimed(npo_id, "stuck-1", 70, "ref-a");
    await seed_claimed(npo_id, "stuck-2", 30, "ref-a");
    await seed_claimed(npo_id, "stuck-3", 20);
    await seed_payout(npo_id, "p-1", 60);

    await index();

    const errors = send_alert.mock.calls
      .map(([a]) => a)
      .filter((a) => a.type === "ERROR");
    expect(errors).toHaveLength(1);
    expect(errors[0].title).toMatch(/claimed but not settled/);
    expect(errors[0].body).toContain(
      `npo:${npo_id} ref ref-a: stuck-1, stuck-2`
    );
    expect(errors[0].body).toContain(`npo:${npo_id} ref unknown: stuck-3`);
    expect(wise_pay_mock).toHaveBeenCalledWith(
      WISE_RECIPIENT,
      60,
      expect.any(String)
    );
    expect(await payout_types()).toEqual({
      "stuck-1": "processing",
      "stuck-2": "processing",
      "stuck-3": "processing",
      "p-1": "settled",
    });
  });

  test("an unsettled-claims alert that fails to send is reported and the run still pays", async () => {
    const npo_id = await seed_npo({ cash: 500 });
    await seed_claimed(npo_id, "stuck-1", 70, "ref-a");
    await seed_payout(npo_id, "p-1", 60);
    const discord_down = new Error("discord 502");
    send_alert.mockImplementation(async (a) => {
      if (a.type === "ERROR") throw discord_down;
    });

    const res = await index();

    expect(res.statusCode).toBe(200);
    expect(report_error_mock).toHaveBeenCalledWith(discord_down);
    expect(await payout_types()).toMatchObject({ "p-1": "settled" });
  });

  test("a snapshot under the npo's minimum claims nothing", async () => {
    const npo_id = await seed_npo({ cash: 500, payout_minimum: 80 });
    await seed_payout(npo_id, "p-1", 30);
    await seed_payout(npo_id, "p-2", 40);

    await index();

    expect(report_error_mock).not.toHaveBeenCalled();
    expect(settle_spy).not.toHaveBeenCalled();
    expect(wise_pay_mock).not.toHaveBeenCalled();
    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "pending",
    });
  });

  test("a pending total of 49.996 meets a 50 minimum and is paid as 50", async () => {
    const npo_id = await seed_npo({ cash: 500, payout_minimum: 50 });
    await seed_payout(npo_id, "p-1", 24.998);
    await seed_payout(npo_id, "p-2", 24.998);

    await index();

    expect(wise_pay_mock).toHaveBeenCalledWith(
      WISE_RECIPIENT,
      50,
      expect.any(String)
    );
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "settled",
    });
  });

  test("a transfer that fails before funding sends no paid notice and leaves the payouts pending", async () => {
    const npo_id = await seed_npo({ cash: 500 });
    await seed_payout(npo_id, "p-1", 60);
    wise_pay_mock.mockRejectedValue(new NotFundedError(new Error("quote 503")));

    await index();

    expect(wise_pay_mock).toHaveBeenCalledOnce();
    expect(send_alert).not.toHaveBeenCalled();
    expect(await payout_types()).toEqual({ "p-1": "pending" });
    expect(await npo_cash(npo_id)).toBe(500);
  });

  test("no transfer when the still-pending total falls under the payout minimum", async () => {
    const npo_id = await seed_npo({ cash: 500, payout_minimum: 50 });
    await seed_payout(npo_id, "p-1", 30);
    await seed_payout(npo_id, "p-2", 40);
    after_snapshot.current = () => mark_refunded("p-2");

    await index();

    expect(report_error_mock).not.toHaveBeenCalled();
    expect(wise_pay_mock).not.toHaveBeenCalled();
    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "refunded",
    });
    expect(await db().select().from(settlements)).toEqual([]);
    expect(await npo_cash(npo_id)).toBe(500);
  });
});
