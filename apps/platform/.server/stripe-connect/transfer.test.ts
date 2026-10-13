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
import { dists } from "../pg/schema/dist";
import { donations } from "../pg/schema/donation";
import { npos } from "../pg/schema/npo";
import type { TestDb } from "../pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn() },
  transfers: { create: vi.fn() },
}));
const report_error = vi.hoisted(() => vi.fn());

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

/** settles a routed share and returns the transfer msg the plan carried */
async function settle_routed(net = 100) {
  const npo = await seed_npo(db(), {
    registration_number: "EIN-TRANSFER-1",
    name: "Routed NPO",
    hq_country: "United States",
    allocation: { cash: 100, liq: 0, lock: 0 },
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
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(npos);
});

describe("transfer_routed_dist", () => {
  test("pays the routed net to the account from the donation's charge, and stores it", async () => {
    const { payload } = await settle_routed();

    await transfer_routed_dist(payload);

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

  test("a redelivery after the transfer is stored never reaches stripe", async () => {
    const { payload } = await settle_routed();
    await transfer_routed_dist(payload);

    await transfer_routed_dist(payload);

    expect(stripe.transfers.create).toHaveBeenCalledOnce();
    expect(await stored(payload.dist_id)).toBe("tr_1");
  });

  // neither sees the other's store, so stripe's idempotency key is what holds
  test("two deliveries racing ask stripe for one transfer under one key", async () => {
    const { payload } = await settle_routed();

    await Promise.all([
      transfer_routed_dist(payload),
      transfer_routed_dist(payload),
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

    await transfer_routed_dist(payload);

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
    const pooled = calc_settlement_plan(make_input(npo.id, 10.175), {
      ...npo,
      allocation: { cash: 100, liq: 0, lock: 0 },
    });

    await transfer_routed_dist(payload);

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

    const err = await transfer_routed_dist(payload).catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(payload.dist_id);
    expect((err as Error).message).toContain(DON_ID);
    expect(await stored(payload.dist_id)).toBeNull();
  });

  // a retry is the same request under the same idempotency key, so it can
  // only be refused again
  test.each([
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
  ])("reports %s for manual handling and acks", async (_case, refusal) => {
    const { payload } = await settle_routed();
    stripe.transfers.create.mockRejectedValueOnce(refusal);

    await expect(transfer_routed_dist(payload)).resolves.toBeUndefined();

    expect(report_error).toHaveBeenCalledOnce();
    const [err, ctx] = report_error.mock.calls[0]!;
    expect((err as Error).cause).toBe(refusal);
    expect(ctx).toMatchObject({
      donation_id: DON_ID,
      dist_id: payload.dist_id,
    });
    // the dist stays routed and unpaid, where the untransferred query finds it
    expect(await stored(payload.dist_id)).toBeNull();
    const [dist] = await db()
      .select()
      .from(dists)
      .where(eq(dists.id, payload.dist_id));
    expect(dist!.stripe_routed_to).toBe(ACCT);
  });

  test.each(reversed_statuses)(
    "never pays out a donation %s before its transfer ran",
    async (status) => {
      const { payload } = await settle_routed();
      await db()
        .update(donations)
        .set({ status })
        .where(eq(donations.id, DON_ID));

      await expect(transfer_routed_dist(payload)).resolves.toBeUndefined();

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
