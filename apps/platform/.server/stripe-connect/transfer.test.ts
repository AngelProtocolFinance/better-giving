import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import type { IConnectTransferPayload } from "@/queue";
import type { IInput, IParts } from "@/types/donation-dist";
import type { DbOrTx } from "../pg/queries/helpers";
import { bal_txs } from "../pg/schema/bal-tx";
import { dists } from "../pg/schema/dist";
import { donations } from "../pg/schema/donation";
import { npos } from "../pg/schema/npo";
import { payouts } from "../pg/schema/payout";
import type { TestDb } from "../pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn() },
  charges: { retrieve: vi.fn() },
  refunds: { list: vi.fn() },
  transfers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    listReversals: vi.fn(),
    createReversal: vi.fn(),
  },
}));
const report_error = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn(async (..._msgs: unknown[]) => {}));

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
vi.mock("../kit/stripe", () => ({ stripe }));
vi.mock("../kit/queue", () => ({ enqueue }));
vi.mock("#/errors/report", () => ({ report_error }));
vi.mock("../env", async (importOriginal) => {
  const real = await importOriginal<typeof import("../env")>();
  return { ...real, stripe: { ...real.stripe, connect_routing: true } };
});

const { create_test_db } = await import("../pg/test-utils/pglite");
const { settle_npo } = await import("../settlement/settle-npo");
const { transfer_routed_dist } = await import("./transfer");
const { calc_settlement_plan } = await import("@/settlement/plan");
const { payout_total } = await import("../payouts/transfer");
const { reversed_statuses } = await import("@/donations/settle");

const db = () => test_db.current!.db;

const ACCT = "acct_transfer_1";
const DON_ID = "don-transfer-1";
const INTENT = "pi_transfer_1";
const CHARGE = "ch_transfer_1";
/** a delivery qstash retries if it throws */
const RETRY = { last: false };

const amt = (base: number, tip = 0, fee_allowance = 0) => ({
  base,
  tip,
  fee_allowance,
});

const parts = (net: number): IParts => ({
  amnt: amt(net),
  amnt_usd: amt(net),
  fa: amt(0),
  sttl: amt(net),
  sttl_fee: amt(0),
  sttl_fa: amt(0),
});

const make_input = (npo_id: number, net = 100): IInput => ({
  id: npo_id,
  ps: parts(net),
  sttl: { id: INTENT, date: "2026-01-01T00:00:00.000Z", currency: "USD" },
  prnt: {
    id: DON_ID,
    to_id: String(npo_id),
    to_name: "Routed NPO",
    to_members: [],
    type: "npo",
  },
  source: undefined,
  program: undefined,
  nav_price: 1,
  tx: {
    currency: "USD",
    upusd: 1,
    frequency: "one-time",
    status: "settled",
    source: "bg-marketplace",
    via: "stripe:card",
    from_email: "d@e.com",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
});

/** settles a routed share and returns the transfer msg the plan carried
 * @param allocation - the npo's stored split, which routing overrides */
async function settle_routed(
  net = 100,
  allocation = { cash: 100, liq: 0, lock: 0 }
) {
  const npo = await seed_npo(db(), {
    registration_number: "EIN-TRANSFER-1",
    name: "Routed NPO",
    hq_country: "United States",
    allocation,
    stripe_account_id: ACCT,
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_details_submitted: true,
    stripe_requirements_due: [],
  });
  await db().insert(donations).values({
    id: DON_ID,
    upusd: 1,
    status: "settled",
    amount_base: net,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  const { msgs } = await db().transaction((tx) =>
    settle_npo(tx as unknown as DbOrTx, make_input(npo!.id, net))
  );
  const m = msgs.find((x) => x.id === "connect-transfer");
  if (!m) throw new Error("settled pooled");
  return { npo: npo!, payload: m.payload as IConnectTransferPayload };
}

const stored = async (dist_id: string) => {
  const [d] = await db().select().from(dists).where(eq(dists.id, dist_id));
  return d?.stripe_transfer_id;
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  stripe.paymentIntents.retrieve.mockResolvedValue({
    id: INTENT,
    latest_charge: CHARGE,
  });
  stripe.transfers.create.mockResolvedValue({ id: "tr_1" });
  // no refund on the charge unless a test says so
  stripe.refunds.list.mockResolvedValue({ data: [] });
  stripe.charges.retrieve.mockResolvedValue({
    id: CHARGE,
    amount_captured: 10_000,
  });
  stripe.transfers.retrieve.mockResolvedValue({
    id: "tr_1",
    amount: 10_000,
    amount_reversed: 0,
    metadata: {},
  });
  stripe.transfers.listReversals.mockResolvedValue({ data: [] });
  stripe.transfers.createReversal.mockResolvedValue({ id: "trr_1" });
  await db().delete(payouts);
  await db().delete(bal_txs);
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(npos);
});

describe("transfer_routed_dist", () => {
  test("pays the routed net to the account from the donation's charge, and stores it", async () => {
    const { payload } = await settle_routed();

    await transfer_routed_dist(payload, RETRY);

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(INTENT);
    expect(stripe.transfers.create).toHaveBeenCalledExactlyOnceWith(
      {
        amount: 10000,
        currency: "usd",
        destination: ACCT,
        source_transaction: CHARGE,
        metadata: { donation_id: DON_ID, dist_id: payload.dist_id },
      },
      { idempotencyKey: `connect-transfer:${payload.dist_id}` }
    );
    expect(await stored(payload.dist_id)).toBe("tr_1");
  });

  test("a redelivery after the transfer is stored never transfers again", async () => {
    const { payload } = await settle_routed();
    await transfer_routed_dist(payload, RETRY);

    await transfer_routed_dist(payload, RETRY);

    expect(stripe.transfers.create).toHaveBeenCalledOnce();
    expect(await stored(payload.dist_id)).toBe("tr_1");
  });

  // neither sees the other's store, so stripe's idempotency key is what holds
  test("two deliveries racing ask stripe for one transfer under one key", async () => {
    const { payload } = await settle_routed();

    await Promise.all([
      transfer_routed_dist(payload, RETRY),
      transfer_routed_dist(payload, RETRY),
    ]);

    const keys = stripe.transfers.create.mock.calls.map(
      (c) => (c[1] as { idempotencyKey: string }).idempotencyKey
    );
    expect(keys).toEqual([
      `connect-transfer:${payload.dist_id}`,
      `connect-transfer:${payload.dist_id}`,
    ]);
    expect(await stored(payload.dist_id)).toBe("tr_1");
    expect(report_error).not.toHaveBeenCalled();
  });

  test("reports a dist already paid by a different transfer", async () => {
    const { payload } = await settle_routed();
    // another transfer is stored while this one is in flight
    stripe.transfers.create.mockImplementationOnce(async () => {
      await db()
        .update(dists)
        .set({ stripe_transfer_id: "tr_other" })
        .where(eq(dists.id, payload.dist_id));
      return { id: "tr_1" };
    });

    await transfer_routed_dist(payload, RETRY);

    expect(await stored(payload.dist_id)).toBe("tr_other");
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error.mock.calls[0]![1]).toMatchObject({
      donation_id: DON_ID,
      dist_id: payload.dist_id,
      transfer_id: "tr_1",
      stored_transfer_id: "tr_other",
    });
  });

  test("transfers what the pooled path would pay out for the same share", async () => {
    // a fund's two members splitting a 20.35 net each get a half cent
    const { npo, payload } = await settle_routed(10.175);
    const pooled = calc_settlement_plan(
      make_input(npo.id, 10.175),
      {
        ...npo,
        allocation: { cash: 100, liq: 0, lock: 0 },
      },
      null
    );

    await transfer_routed_dist(payload, RETRY);

    const [[params]] = stripe.transfers.create.mock.calls;
    // the grants run's figure for that payout, half down to 10.17
    expect(params.amount).toBe(1017);
    expect(params.amount).toBe(
      Math.round(payout_total([pooled.payout!.amount]) * 100)
    );
  });

  test("a transfer stripe could not take throws for the queue to retry, naming its dist", async () => {
    const { payload } = await settle_routed();
    stripe.transfers.create.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" })
    );

    const err = await transfer_routed_dist(payload, RETRY).catch(
      (e: Error) => e
    );

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(payload.dist_id);
    expect((err as Error).message).toContain(DON_ID);
    expect(await stored(payload.dist_id)).toBeNull();
    // a retry follows, so ops isn't told yet
    expect(enqueue).not.toHaveBeenCalled();
  });

  const refusals = [
    [
      "an account that revoked our access",
      new Stripe.errors.StripePermissionError({
        message: "The provided key does not have access to account",
      }),
    ],
    [
      "a destination it can no longer pay",
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such destination",
        code: "resource_missing",
      }),
    ],
  ] as const;

  const row = async (dist_id: string) => {
    const [d] = await db().select().from(dists).where(eq(dists.id, dist_id));
    return d!;
  };
  const notices = () =>
    enqueue.mock.calls
      .flat()
      .filter((m) => (m as { id: string }).id === "fiat-notice") as {
      dedupe: string;
      payload: { alert: { body: string } };
    }[];

  // a retry is the same request under the same idempotency key, so it can
  // only be refused again
  test.each(refusals)(
    "settles the share pooled when stripe refuses %s, and tells ops",
    async (_case, refusal) => {
      const { npo, payload } = await settle_routed(100, {
        cash: 60,
        liq: 40,
        lock: 0,
      });
      stripe.transfers.create.mockRejectedValueOnce(refusal);

      await expect(
        transfer_routed_dist(payload, RETRY)
      ).resolves.toBeUndefined();

      // what a pooled settle of the same share books
      const pooled = calc_settlement_plan(make_input(npo.id), npo, null);
      const dist = await row(payload.dist_id);
      expect(dist.stripe_routed_to).toBeNull();
      expect(dist.alloc).toEqual({ cash: 60, liq: 40, lock: 0 });
      const [payout] = await db().select().from(payouts);
      expect(payout).toMatchObject({
        source_id: payload.dist_id,
        npo_id: npo.id,
        amount: pooled.payout!.amount,
        type: "pending",
      });
      expect(payout!.amount).toBe(60);
      const txs = await db().select().from(bal_txs);
      expect(txs.map((t) => [t.account, t.amount, t.account_other_id])).toEqual(
        [["liq", 40, payload.dist_id]]
      );
      const [after] = await db().select().from(npos).where(eq(npos.id, npo.id));
      expect({ cash: after!.cash, liq: after!.liq }).toEqual({
        cash: 60,
        liq: 40,
      });

      const [notice] = notices();
      expect(notice!.dedupe).toBe(
        `fiat.notice_connect-refused_${payload.dist_id}`
      );
      expect(notice!.payload.alert.body).toContain(DON_ID);
      expect(notice!.payload.alert.body).toContain(payload.dist_id);
      expect((report_error.mock.calls[0]![0] as Error).cause).toBe(refusal);
    }
  );

  test("a redelivery after the pooled rebook books nothing more and tells ops again", async () => {
    const { payload } = await settle_routed();
    stripe.transfers.create.mockRejectedValueOnce(refusals[0][1]);
    await transfer_routed_dist(payload, RETRY);

    await transfer_routed_dist(payload, RETRY);

    expect(stripe.transfers.create).toHaveBeenCalledOnce();
    expect(await db().select().from(payouts)).toHaveLength(1);
    // a notice lost between the rebook's commit and its enqueue goes again
    expect(notices().map((n) => n.dedupe)).toEqual([
      `fiat.notice_connect-refused_${payload.dist_id}`,
      `fiat.notice_connect-refused_${payload.dist_id}`,
    ]);
  });

  // both read the dist routed before either rebooks it
  test("two refused deliveries racing book the share pooled once", async () => {
    const { payload } = await settle_routed();
    stripe.transfers.create.mockRejectedValue(refusals[0][1]);

    await Promise.all([
      transfer_routed_dist(payload, RETRY),
      transfer_routed_dist(payload, RETRY),
    ]);

    expect(stripe.transfers.create).toHaveBeenCalledTimes(2);
    expect(await db().select().from(payouts)).toHaveLength(1);
    const [after] = await db().select().from(npos);
    expect(after!.cash).toBe(100);
  });

  // the refund recorded nothing while the dist was routed: its cut was to come
  // off the transfer
  test("a refusal after a partial refund books the share less the refund's cut", async () => {
    const { payload } = await settle_routed();
    stripe.refunds.list.mockResolvedValue({
      data: [
        { id: "re_1", amount: 2_500, status: "succeeded", created: 1 },
        // stripe won't send it, so it takes nothing
        { id: "re_2", amount: 1_000, status: "failed", created: 2 },
      ],
    });
    stripe.transfers.create.mockRejectedValueOnce(refusals[0][1]);

    await transfer_routed_dist(payload, RETRY);

    const [payout] = await db().select().from(payouts);
    expect(payout!.amount).toBe(75);
    const [after] = await db().select().from(npos);
    expect(after!.cash).toBe(75);
    expect(notices()[0]!.payload.alert.body).toContain("refund");
  });

  // the refund core took nothing back: the dist was routed, so it had none
  test("a refusal racing a full refund unroutes the share and books nothing", async () => {
    const { payload } = await settle_routed();
    stripe.transfers.create.mockImplementationOnce(async () => {
      await db()
        .update(donations)
        .set({ status: "refunded" })
        .where(eq(donations.id, DON_ID));
      throw refusals[0][1];
    });

    await transfer_routed_dist(payload, RETRY);

    expect((await row(payload.dist_id)).stripe_routed_to).toBeNull();
    expect(await db().select().from(payouts)).toEqual([]);
    const [after] = await db().select().from(npos);
    expect(after!.cash).toBe(0);
    expect(notices()[0]!.payload.alert.body).toContain("refunded");
  });

  // stripe may have made the transfer it never answered for
  test("the last attempt at a transfer stripe never answered tells ops and leaves it routed", async () => {
    const { payload } = await settle_routed();
    stripe.transfers.create.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" })
    );

    await expect(transfer_routed_dist(payload, { last: true })).rejects.toThrow(
      payload.dist_id
    );

    const [notice] = notices();
    expect(notice!.dedupe).toBe(
      `fiat.notice_connect-unanswered_${payload.dist_id}`
    );
    expect(notice!.payload.alert.body).toContain(DON_ID);
    expect((await row(payload.dist_id)).stripe_routed_to).toBe(ACCT);
    expect(await db().select().from(payouts)).toEqual([]);
  });

  // the plan names the dist settle_npo writes; a mismatch must not pass quietly
  test("reports a transfer for a dist that doesn't exist", async () => {
    const { payload } = await settle_routed();

    await transfer_routed_dist({ ...payload, dist_id: "no-such-dist" }, RETRY);

    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error.mock.calls[0]![1]).toMatchObject({
      donation_id: DON_ID,
      dist_id: "no-such-dist",
    });
  });

  test.each(reversed_statuses)(
    "never pays out a donation %s before its transfer ran",
    async (status) => {
      const { payload } = await settle_routed();
      await db()
        .update(donations)
        .set({ status })
        .where(eq(donations.id, DON_ID));

      await expect(
        transfer_routed_dist(payload, RETRY)
      ).resolves.toBeUndefined();

      expect(stripe.transfers.create).not.toHaveBeenCalled();
      expect(report_error).toHaveBeenCalledOnce();
      expect(report_error.mock.calls[0]![1]).toMatchObject({
        donation_id: DON_ID,
        dist_id: payload.dist_id,
        status,
      });
    }
  );
});

describe("a refund that landed before the transfer ran", () => {
  const refunded = (amount: number, status = "succeeded") =>
    stripe.refunds.list.mockResolvedValue({
      data: [{ id: "re_1", amount, status, created: 1_790_000_000 }],
    });

  // no refund event after it will see the transfer, so the transfer reverses
  // the refunded share itself; the transfer itself stays the one its key names
  test("transfers the routed net, then reverses the refunded share from it", async () => {
    const { payload } = await settle_routed();
    refunded(4_000);

    await transfer_routed_dist(payload, RETRY);

    expect(stripe.transfers.create.mock.calls[0]![0]).toMatchObject({
      amount: 10_000,
    });
    expect(stripe.transfers.createReversal.mock.calls).toEqual([
      [
        "tr_1",
        {
          amount: 4_000,
          metadata: {
            refund_id: "re_1",
            dist_id: payload.dist_id,
            donation_id: DON_ID,
          },
        },
        { idempotencyKey: `connect-reversal:re_1:${payload.dist_id}` },
      ],
    ]);
  });

  test("leaves a refund still unsent to the refund event that sees it sent", async () => {
    const { payload } = await settle_routed();
    refunded(4_000, "pending");

    await transfer_routed_dist(payload, RETRY);

    expect(stripe.transfers.create).toHaveBeenCalledOnce();
    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
  });

  test("a delivery retried after the reversal failed reverses it, transferring nothing more", async () => {
    const { payload } = await settle_routed();
    refunded(4_000);
    stripe.transfers.createReversal.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" })
    );
    await expect(transfer_routed_dist(payload, RETRY)).rejects.toThrow();

    await transfer_routed_dist(payload, RETRY);

    expect(stripe.transfers.create).toHaveBeenCalledOnce();
    expect(stripe.transfers.createReversal).toHaveBeenCalledTimes(2);
    expect(stripe.transfers.createReversal.mock.calls[1]![1]).toMatchObject({
      amount: 4_000,
    });
  });
});
