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
vi.mock("../kit/discord", () => ({ aws_monitor: { send_alert } }));
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

const { NotFundedError, settle_npo_payouts } = await import("./settle");
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
  await db().delete(payouts);
  await db().delete(settlements);
  await db().delete(npos);
});

async function seed_npo(o: { cash: number; payout_minimum?: number }) {
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-SETTLE",
      name: "Settle Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      cash: o.cash,
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

  test("pays the same payout set under the same uuid ref whatever order the ids came in", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    await seed_payout(npo.id, "p-3", 50);
    const pay = vi.fn<Pay>(async () => {
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-2", "p-1"], RECIPIENT, pay);
    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);
    await settle_npo_payouts(npo, ["p-1", "p-3"], RECIPIENT, pay);

    const [first, again, other] = pay.mock.calls.map(([ref]) => ref);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  test("a payout loss-refunded while its transfer was in flight stays refunded_loss and is still settled for", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      await db()
        .update(payouts)
        .set({ type: "refunded_loss" })
        .where(eq(payouts.id, "p-2"));
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
    expect(send_alert).not.toHaveBeenCalled();
  });

  test("a payout loss-refunded while its transfer failed before funding is named in an alert", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      await db()
        .update(payouts)
        .set({ type: "refunded_loss" })
        .where(eq(payouts.id, "p-2"));
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    expect(await payout_types()).toEqual({
      "p-1": "pending",
      "p-2": "refunded_loss",
    });
    expect(report_error).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ not_released: ["p-2"] })
    );
    expect(send_alert).toHaveBeenCalledOnce();
    const [alert] = send_alert.mock.calls[0]!;
    expect(alert.type).toBe("ERROR");
    expect(alert.body).toMatch(/cash/);
    expect(alert.body).toMatch(/loss log/);
    expect(alert.fields).toContainEqual({ name: "not_released", value: "p-2" });
  });

  test("binds the ref to the recipient and the total, not just the payout ids", async () => {
    const npo = await seed_npo({ cash: 500 });
    await seed_payout(npo.id, "p-1", 60);
    await seed_payout(npo.id, "p-2", 40);
    const pay = vi.fn<Pay>(async () => {
      throw new NotFundedError(new Error("wise 503"));
    });

    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);
    await settle_npo_payouts(npo, ["p-1", "p-2"], "888", pay);
    await db().update(payouts).set({ amount: 45 }).where(eq(payouts.id, "p-2"));
    await settle_npo_payouts(npo, ["p-1", "p-2"], RECIPIENT, pay);

    const [first, other_recipient, other_total] = pay.mock.calls.map(
      ([ref]) => ref
    );
    expect(new Set([first, other_recipient, other_total]).size).toBe(3);
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
