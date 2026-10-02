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
import type { TestDb } from "../pg/test-utils/pglite";
import type { Pay } from "./settle";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const report_error = vi.hoisted(() => vi.fn());
const send_alert = vi.hoisted(() => vi.fn());

/** makes the next `payouts_move` out of this status throw, as a dropped socket would */
const fail_move = vi.hoisted(() => ({ from: null as string | null }));

vi.mock("#/errors/report", () => ({ report_error }));
vi.mock("../pg/queries/payout", async (io) => {
  const actual = await io<typeof import("../pg/queries/payout")>();
  return {
    ...actual,
    payouts_move: (...args: Parameters<typeof actual.payouts_move>) => {
      if (args[2] === fail_move.from) {
        fail_move.from = null;
        return Promise.reject(new Error("Connection terminated unexpectedly"));
      }
      return actual.payouts_move(...args);
    },
  };
});
vi.mock("../env", () => ({ stage: "test" }));
vi.mock("../kit/discord", () => ({
  aws_monitor: { send_alert },
  fiat_monitor: { send_alert: vi.fn() },
}));
vi.mock("../pg/db", () => ({
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

const { settle_npo_payouts } = await import("./settle");
const { NotFundedError } = await import("./transfer");
const { processing_payouts } = await import("../pg/queries/payout");
const { dists_for_refund } = await import("../pg/queries/dist");
const { process_refund } = await import("../refund/process");
const { dists } = await import("../pg/schema/dist");
const { bal_txs } = await import("../pg/schema/bal-tx");
const { donations } = await import("../pg/schema/donation");
const { loss_logs, rev_logs } = await import("../pg/schema/revenue");
const { create_test_db } = await import("../pg/test-utils/pglite");
const { npos } = await import("../pg/schema/npo");
const { payouts, settlements } = await import("../pg/schema/payout");

const db = () => test_db.current!.db;

const TRANSFER_ID = 9001;
const RECIPIENT = "777";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  report_error.mockReset();
  send_alert.mockReset();
  fail_move.from = null;
  await db().delete(bal_txs);
  await db().delete(loss_logs);
  await db().delete(rev_logs);
  await db().delete(payouts);
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(settlements);
  await db().delete(npos);
});

async function seed_npo(o: {
  cash: number;
  liq?: number;
  lock_units?: number;
  payout_minimum?: number;
}) {
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-SETTLE",
      name: "Settle Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      cash: o.cash,
      liq: o.liq,
      lock_units: o.lock_units,
      payout_minimum: o.payout_minimum,
    })
    .returning();
  return {
    id: npo!.id,
    name: npo!.name,
    payout_minimum: o.payout_minimum ?? 50,
  };
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

/** a settled donation whose one dist owes its cash share through payout `id` */
async function seed_donation_payout(
  npo_id: number,
  id: string,
  amount: number,
  alloc = { liq: 0, lock: 0, cash: 100 }
) {
  const don = `don-${id}`;
  const dist = `dist-${id}`;
  await db().insert(donations).values({
    id: don,
    upusd: 1,
    status: "settled",
    amount_base: amount,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db().insert(dists).values({
    id: dist,
    donation_id: don,
    status: "settled",
    date_created: "2026-09-01T00:00:00.000Z",
    to_id: npo_id,
    to_name: "npo",
    amount,
    amount_denom: "USD",
    net: amount,
    fee_base: 0,
    fee_fsa: 0,
    fee_processing: 0,
    alloc,
  });
  await db()
    .insert(rev_logs)
    .values({
      id: `rev-${id}`,
      date: "2026-09-01T00:00:00.000Z",
      donation_id: dist,
      npo_id,
      type: "base-fee",
      gross: 1,
      commission: 0,
      revenue: 1,
      status: "final",
    });
  await seed_payout(npo_id, id, (amount * alloc.cash) / 100);
  return { don };
}

/** the donor's refund, landing while the payout's transfer is in flight */
const refund_in_flight = async (donation_id: string) =>
  process_refund(donation_id, await dists_for_refund(donation_id), {
    form_id: null,
    program_id: null,
    alert_from: "test",
  });

const payout_types = async () =>
  Object.fromEntries(
    (
      await db().select({ id: payouts.id, type: payouts.type }).from(payouts)
    ).map((r) => [r.id, r.type])
  );

const npo_cash = async (id: number) =>
  (await db().select({ cash: npos.cash }).from(npos).where(eq(npos.id, id)))[0]
    ?.cash;

describe("settle_npo_payouts", () => {
  test("claims, pays the pending total, then settles every payout", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const seen_at_pay: Record<string, string>[] = [];
    const pay = vi.fn<Pay>(async () => {
      seen_at_pay.push(await payout_types());
      return TRANSFER_ID;
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(pay).toHaveBeenCalledOnce();
    expect(pay).toHaveBeenCalledWith(expect.any(String), 100);
    expect(seen_at_pay).toEqual([{ "p-1": "processing", "p-2": "processing" }]);
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "settled",
    });
    const [stlmt] = await db().select().from(settlements);
    expect(stlmt).toMatchObject({
      id: String(TRANSFER_ID),
      other_id: pay.mock.calls[0]![0],
      amount: 100,
    });
    expect([...(stlmt?.sources ?? [])].sort()).toEqual([
      "dist-p-1",
      "dist-p-2",
    ]);
    expect(await npo_cash(npo.id)).toBe(400);
    expect(res).toMatchObject({
      status: "settled",
      total: 100,
      transfer_id: String(TRANSFER_ID),
    });
    expect(report_error).not.toHaveBeenCalled();
  });

  test("pays, records and debits the pending total rounded to cents, a half cent down", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60.004);
    await seed_payout(npo.id, "p-2", 40.001);
    const pay = vi.fn<Pay>(async () => TRANSFER_ID);

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(pay).toHaveBeenCalledWith(expect.any(String), 100);
    const [stlmt] = await db().select().from(settlements);
    expect(stlmt?.amount).toBe(100);
    expect(await npo_cash(npo.id)).toBe(400);
    expect(res).toMatchObject({ status: "settled", total: 100 });
  });

  test("a float-drifted pending total is paid as the cents it adds up to", async () => {
    const npo = await seed_npo({ cash: 500, payout_minimum: 0 });
    await seed_payout(npo.id, "p-1", 0.1);
    await seed_payout(npo.id, "p-2", 0.2);
    const pay = vi.fn<Pay>(async () => TRANSFER_ID);

    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(pay).toHaveBeenCalledWith(expect.any(String), 0.3);
    expect(await npo_cash(npo.id)).toBe(499.7);
  });

  test("pays nothing when none of the payouts is still pending", async () => {
    const npo = await seed_npo({ cash: 500, payout_minimum: 0 });
    await seed_payout(npo.id, "p-1", 60);
    await db()
      .update(payouts)
      .set({ type: "refunded" })
      .where(eq(payouts.id, "p-1"));
    const pay = vi.fn<Pay>(async () => TRANSFER_ID);

    const res = await settle_npo_payouts(
      npo,
      ["p-1", "missing"],
      RECIPIENT,
      pay
    );

    expect(res).toEqual({ status: "none_pending" });
    expect(pay).not.toHaveBeenCalled();
    expect(await payout_types()).toEqual({ "p-1": "refunded" });
    expect(await db().select().from(settlements)).toEqual([]);
    expect(await npo_cash(npo.id)).toBe(500);
  });

  test("claims and pays nothing when the pending total is under the npo's minimum", async () => {
    const npo = await seed_npo({ cash: 500, payout_minimum: 80 });
    await seed_payout(npo.id, "p-1", 30);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => TRANSFER_ID);

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(res).toEqual({ status: "under_minimum", total: 70, minimum: 80 });
    expect(pay).not.toHaveBeenCalled();
    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "pending",
    });
    expect(await npo_cash(npo.id)).toBe(500);
  });

  test("a transfer that failed before funding was requested puts the payouts back to pending", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const quote_failed = new Error("wise quote 503");
    const pay = vi.fn<Pay>(async () => {
      throw new NotFundedError(quote_failed);
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(res).toMatchObject({ status: "released" });
    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "pending",
    });
    expect(await db().select().from(settlements)).toEqual([]);
    expect(await npo_cash(npo.id)).toBe(500);
    expect(report_error).toHaveBeenCalledWith(
      quote_failed,
      expect.objectContaining({ npo_id: npo.id, ref: pay.mock.calls[0]![0] })
    );
  });

  test("a claim stores its transfer ref on every claimed payout, where processing_payouts reads it", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      throw new Error("fetch failed");
    });

    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);
    const ref = pay.mock.calls[0]![0];

    const stuck = await processing_payouts();
    expect(stuck.map((p) => [p.id, p.ref])).toEqual([
      ["p-1", ref],
      ["p-2", ref],
    ]);
  });

  test("a claim's ref leaves the rows with it, released or settled", async () => {
    const npo = await seed_npo({ cash: 500, payout_minimum: 0 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const unfunded = vi.fn<Pay>(async () => {
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-1"], RECIPIENT, unfunded);
    await settle_npo_payouts(npo, ["p-2"], RECIPIENT, async () => TRANSFER_ID);

    const rows = await db()
      .select({ id: payouts.id, type: payouts.type, message: payouts.message })
      .from(payouts)
      .orderBy(payouts.id);
    expect(rows).toEqual([
      { id: "p-1", type: "pending", message: null },
      { id: "p-2", type: "settled", message: null },
    ]);
  });

  test("a transfer that failed once funding was requested leaves the payouts processing and alerts", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const socket_dropped = new Error("fetch failed");
    const pay = vi.fn<Pay>(async () => {
      throw socket_dropped;
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);
    const ref = pay.mock.calls[0]![0];

    expect(res).toEqual({ status: "fund_unknown", ref });
    expect(await payout_types()).toEqual({
      "p-1": "processing",
      "p-2": "processing",
    });
    expect(await db().select().from(settlements)).toEqual([]);
    expect(await npo_cash(npo.id)).toBe(500);
    expect(report_error).toHaveBeenCalledWith(
      socket_dropped,
      expect.objectContaining({ npo_id: npo.id, ref })
    );
    expect(send_alert).toHaveBeenCalledOnce();
    const [alert] = send_alert.mock.calls[0]!;
    expect(alert.type).toBe("ERROR");
    expect(alert.title).toMatch(/funding status unknown/);
    expect(alert.body).toContain(ref);
  });

  test("a paid transfer the settle fails to record leaves the payouts processing and alerts with its transfer id", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    // a settlement already under the transfer id: the settle's insert collides
    await db()
      .insert(settlements)
      .values({
        id: String(TRANSFER_ID),
        npo_id: npo.id,
        date: "2026-08-01T00:00:00.000Z",
        amount: 1,
        status: "",
      });
    const pay = vi.fn<Pay>(async () => TRANSFER_ID);

    const res = await settle_npo_payouts(npo, ["p-1"], RECIPIENT, pay);
    const ref = pay.mock.calls[0]![0];

    expect(res).toEqual({
      status: "unrecorded",
      ref,
      transfer_id: String(TRANSFER_ID),
    });
    expect(await payout_types()).toEqual({ "p-1": "processing" });
    expect(await npo_cash(npo.id)).toBe(500);
    expect(report_error).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ref, transfer_id: String(TRANSFER_ID) })
    );
    expect(send_alert).toHaveBeenCalledOnce();
    const [alert] = send_alert.mock.calls[0]!;
    expect(alert.type).toBe("ERROR");
    expect(alert.title).toMatch(/funded, not recorded/);
    expect(alert.body).toContain(ref);
    expect(alert.body).toContain(String(TRANSFER_ID));
  });

  test("a set released after an unfunded transfer is claimed again under a new ref, and paid under it", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi
      .fn<Pay>()
      .mockRejectedValueOnce(new NotFundedError(new Error("wise 503")))
      .mockResolvedValueOnce(TRANSFER_ID);

    await settle_npo_payouts(npo, ["p-2", "p-1"], RECIPIENT, pay);
    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    const [first, again] = pay.mock.calls.map(([ref]) => ref);
    expect(again).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(again).not.toBe(first);
    expect(res).toMatchObject({ status: "settled", ref: again });
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "settled",
    });
  });

  test("a payout loss-refunded while its transfer was in flight stays refunded_loss and is still settled for", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    const { don } = await seed_donation_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      await refund_in_flight(don);
      return TRANSFER_ID;
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(res).toMatchObject({ status: "settled", total: 100 });
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "refunded_loss",
    });
    const [stlmt] = await db().select().from(settlements);
    expect(stlmt?.amount).toBe(100);
    expect(await npo_cash(npo.id)).toBe(400);
    const logs = await db().select().from(loss_logs);
    expect(logs.map((l) => [l.dist_id, l.type])).toEqual([
      ["dist-p-2", "payout"],
    ]);
    const [d] = await db().select().from(dists);
    expect(d?.refund_status).toBe("loss");
    const [dn] = await db()
      .select()
      .from(donations)
      .where(eq(donations.id, don));
    expect(dn?.status).toBe("refunded_loss");
    const refs = await db().select({ message: payouts.message }).from(payouts);
    expect(refs).toEqual([{ message: null }, { message: null }]);
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("an unfunded payout loss-refunded in flight on a partly invested dist keeps its loss and is named in an alert", async () => {
    const npo = await seed_npo({ cash: 500, lock_units: 1000 });
    await seed_payout(npo.id, "p-1", 60);
    const { don } = await seed_donation_payout(npo.id, "p-2", 100, {
      liq: 0,
      lock: 60,
      cash: 40,
    });
    const pay = vi.fn<Pay>(async () => {
      await refund_in_flight(don);
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "refunded_loss",
    });
    expect(await npo_cash(npo.id)).toBe(500);
    const logs = await db().select().from(loss_logs);
    expect(logs.map((l) => [l.dist_id, l.type])).toEqual([
      ["dist-p-2", "payout"],
    ]);
    expect(report_error).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ not_released: ["p-2"] })
    );
    expect(send_alert).toHaveBeenCalledOnce();
    const [alert] = send_alert.mock.calls[0]!;
    expect(alert.type).toBe("ERROR");
    expect(alert.body).toMatch(/cash/);
    expect(alert.body).toMatch(/loss log/);
    expect(alert.fields).toContainEqual({
      name: "not_reversed",
      value: expect.stringMatching(/^p-2: .*nav price/),
    });
  });

  test("a payout loss-refunded in flight whose transfer then went unfunded is refunded as if it had been pending", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    const { don } = await seed_donation_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      await refund_in_flight(don);
      throw new NotFundedError(new Error("wise 503"));
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(res).toMatchObject({ status: "released" });
    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "refunded",
    });
    expect(await npo_cash(npo.id)).toBe(460);
    expect(await db().select().from(loss_logs)).toEqual([]);
    const [d] = await db().select().from(dists);
    expect([d?.status, d?.refund_status]).toEqual(["refunded", "completed"]);
    const [rl] = await db().select().from(rev_logs);
    expect(rl?.status).toBe("refunded");
    const [dn] = await db()
      .select()
      .from(donations)
      .where(eq(donations.id, don));
    expect(dn?.status).toBe("refunded");
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("an unfunded loss refund on a dist with a savings share takes that share from savings too", async () => {
    const npo = await seed_npo({ cash: 500, liq: 200 });
    const { don } = await seed_donation_payout(npo.id, "p-1", 100, {
      liq: 30,
      lock: 0,
      cash: 70,
    });
    const pay = vi.fn<Pay>(async () => {
      await refund_in_flight(don);
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-1"], RECIPIENT, pay);

    expect(await payout_types()).toEqual({ "p-1": "refunded" });
    const [n] = await db()
      .select({ liq: npos.liq, cash: npos.cash })
      .from(npos)
      .where(eq(npos.id, npo.id));
    expect(n).toEqual({ liq: 170, cash: 430 });
    const txs = await db().select().from(bal_txs);
    expect(
      txs.map((t) => [t.account, t.amount, t.bal_begin, t.bal_end])
    ).toEqual([["liq", 30, 200, 170]]);
    expect(await db().select().from(loss_logs)).toEqual([]);
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("an unfunded payout whose refund was a loss on savings is cancelled and cuts the loss to the shortfall, with no alert", async () => {
    const npo = await seed_npo({ cash: 500, liq: 0 });
    const { don } = await seed_donation_payout(npo.id, "p-1", 100, {
      liq: 30,
      lock: 0,
      cash: 70,
    });
    const pay = vi.fn<Pay>(async () => {
      await refund_in_flight(don);
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-1"], RECIPIENT, pay);

    expect(await payout_types()).toEqual({ "p-1": "refunded" });
    expect(await npo_cash(npo.id)).toBe(430);
    const logs = await db().select().from(loss_logs);
    expect(
      logs.map(({ type, amount, npo_amount }) => ({ type, amount, npo_amount }))
    ).toEqual([{ type: "balance_liq", amount: 30, npo_amount: 30 }]);
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("a release that fails after an unfunded transfer alerts that the payouts are safe to reset", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const quote_failed = new Error("wise quote 503");
    const pay = vi.fn<Pay>(async () => {
      fail_move.from = "processing";
      throw new NotFundedError(quote_failed);
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);
    const ref = pay.mock.calls[0]![0];

    expect(res).toEqual({ status: "unreleased", ref });
    expect(await payout_types()).toEqual({
      "p-1": "processing",
      "p-2": "processing",
    });
    expect(report_error).toHaveBeenCalledWith(
      quote_failed,
      expect.objectContaining({ ref, payout_ids: ["p-1", "p-2"] })
    );
    expect(send_alert).toHaveBeenCalledOnce();
    const [alert] = send_alert.mock.calls[0]!;
    expect(alert.type).toBe("ERROR");
    expect(alert.title).toMatch(/not funded/);
    expect(alert.body).toMatch(/safe to reset to pending/);
    expect(alert.body).toContain(ref);
    expect(alert.body).toContain("wise quote 503");
    expect(alert.fields).toContainEqual({
      name: "payout_ids",
      value: "p-1, p-2",
    });
  });

  test("a claimed payout that left processing by any path but a loss refund is named in an alert", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      await db()
        .update(payouts)
        .set({ type: "cancelled" })
        .where(eq(payouts.id, "p-2"));
      return TRANSFER_ID;
    });

    const res = await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(res).toMatchObject({ status: "settled", total: 100 });
    expect(await payout_types()).toEqual({
      "p-1": "settled",
      "p-2": "cancelled",
    });
    expect(await npo_cash(npo.id)).toBe(400);
    expect(send_alert).toHaveBeenCalledOnce();
    const [alert] = send_alert.mock.calls[0]!;
    expect(alert.type).toBe("ERROR");
    expect(alert.body).toContain(String(TRANSFER_ID));
    expect(alert.fields).toContainEqual({ name: "unsettled", value: "p-2" });
  });
});
