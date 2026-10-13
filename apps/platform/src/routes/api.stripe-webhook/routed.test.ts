import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

// the webhook route with its real refund and dispute handlers over pglite, on
// gifts routed to a connected account. stripe's api and the queue are the
// boundary; its transfers are faked with the idempotency stripe keeps
const construct_event_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());
const invoice_payments_list_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const transfers = vi.hoisted(() => ({
  retrieve: vi.fn(),
  update: vi.fn(),
  listReversals: vi.fn(),
  createReversal: vi.fn(),
}));
const test_db = vi.hoisted(() => ({
  current: null as TestDb | null,
  /** the next transaction throws, as a lost neon connection does */
  fail_next_tx: false,
}));

vi.mock("$/kit/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: construct_event_mock },
    charges: { retrieve: charge_retrieve_mock },
    refunds: { list: refunds_list_mock },
    invoicePayments: { list: invoice_payments_list_mock },
    transfers,
  },
}));
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        if (prop === "transaction" && test_db.fail_next_tx) {
          test_db.fail_next_tx = false;
          return async () => {
            throw new Error("Connection terminated unexpectedly");
          };
        }
        return (real as any)[prop];
      },
    }
  ),
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/kit/discord", () => ({ fiat_monitor: { send_alert: vi.fn() } }));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));

const { action } = await import("./route");
const { eq } = await import("drizzle-orm");
const { owed_for_donation } = await import("$/pg/queries/owed");
const { donations } = await import("$/pg/schema/donation");
const { owed_amounts } = await import("$/pg/schema/owed");
const {
  PAID_GRANT,
  ROUTED,
  balance_of,
  clear_card_gifts,
  seed_card_gift,
  transfer_of,
} = await import("#/__tests__/fixtures/card-gift");

const db = () => test_db.current!.db;

type Gift = Awaited<ReturnType<typeof seed_card_gift>>;

interface IRefund {
  id: string;
  amount: number;
  status: string;
  created: number;
}

interface IReversal {
  id: string;
  amount: number;
  metadata: Record<string, string>;
}

interface ITransfer {
  id: string;
  amount: number;
  amount_reversed: number;
  metadata: Record<string, string>;
  reversals: IReversal[];
}

/** stripe's side of the gift's one $100 usd charge; refunds newest first */
let refunds: IRefund[] = [];
/** stripe's side of each transfer that paid a routed dist, by id */
let stripe_transfers = new Map<string, ITransfer>();
/** what stripe answered each idempotency key with, as it replays it */
let answered = new Map<string, IReversal>();
/** transfers whose connected account can't cover a reversal */
let short = new Set<string>();
let charge_of: Gift;
/** cents: $100 per dist the gift was seeded with */
let captured = 10_000;
let clock = 1_790_000_000;
let event_n = 0;

const charge_now = () => ({
  id: `ch_${charge_of.id}`,
  payment_intent: charge_of.sttl_id,
  currency: "usd",
  amount: captured,
  amount_captured: captured,
});

const live_refunded = () =>
  refunds
    .filter((r) => r.status !== "failed" && r.status !== "canceled")
    .reduce((sum, r) => sum + r.amount, 0);

/** support refunds `amount` cents from the dashboard; returns the
 * charge.refunded stripe sends */
const refund = (amount: number, status = "succeeded") => {
  const before = live_refunded();
  clock += 60;
  refunds.unshift({
    id: `re_${refunds.length + 1}`,
    amount,
    status,
    created: clock,
  });
  return {
    id: `evt_${++event_n}`,
    type: "charge.refunded",
    created: clock,
    data: {
      object: { ...charge_now(), amount_refunded: live_refunded() },
      previous_attributes: { amount_refunded: before },
    },
  };
};

/** the card network returns refund `id` to stripe; returns stripe's refund.failed */
const fail = (id: string) => {
  const r = refunds.find((x) => x.id === id);
  if (!r) throw new Error(`no refund ${id}`);
  r.status = "failed";
  clock += 60;
  return {
    id: `evt_${++event_n}`,
    type: "refund.failed",
    created: clock,
    data: {
      object: {
        ...r,
        charge: charge_now().id,
        payment_intent: charge_of.sttl_id,
        currency: "usd",
        failure_reason: "expired_or_canceled_card",
      },
    },
  };
};

/** the finance alert a failed refund posts */
const failed_alert = () =>
  enqueue_mock.mock.calls
    .flat()
    .filter((m) => m.payload?.alert?.title === "Stripe Refund Failed")
    .map((m) => m.payload.alert.body)
    .join("\n");

/** stripe's `type` event for a chargeback of `amount` cents on the charge,
 * its funds withdrawn with a $15 fee; `status` as stripe has it then */
const dispute_event = (type: string, amount: number, status: string) => {
  clock += 60;
  return {
    id: `evt_${++event_n}`,
    type,
    created: clock,
    data: {
      object: {
        id: `du_${charge_of.id}`,
        object: "dispute",
        amount,
        currency: "usd",
        charge: charge_now().id,
        payment_intent: charge_of.sttl_id,
        reason: "fraudulent",
        status,
        created: clock,
        evidence_details: { due_by: clock + 14 * 86_400 },
        balance_transactions: [
          { id: "txn_dsp", amount: -amount, fee: 1_500, currency: "usd" },
        ],
      },
    },
  };
};
const opened = (amount = 10_000) =>
  dispute_event("charge.dispute.created", amount, "needs_response");
const closed = (status: "won" | "lost", amount = 10_000) =>
  dispute_event("charge.dispute.closed", amount, status);

/** the $90 transfer that paid the routed dist `i` of `gift` */
const paid_by_transfer = (gift: Gift, i = 0, amount = 9_000) => {
  const id = transfer_of(gift, i);
  stripe_transfers.set(id, {
    id,
    amount,
    amount_reversed: 0,
    metadata: {},
    reversals: [],
  });
  return id;
};

const deliver = async (event: object) => {
  construct_event_mock.mockReturnValue(event);
  const request = new Request("https://x/api/stripe-webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=ok" },
  });
  return (await action({ request } as any)) as Response;
};

/** what was reversed of `tr` at stripe, each with the refund it answers */
const reversed_of = (tr: string) =>
  stripe_transfers
    .get(tr)!
    .reversals.map((r) => ({ amount: r.amount, refund: r.metadata.refund_id }));

/** every ops notice queued so far, title and body */
const notice_text = () =>
  enqueue_mock.mock.calls
    .flat()
    .filter((m) => m.id === "fiat-notice")
    .map((m) => `${m.payload.alert.title}\n${m.payload.alert.body}`)
    .join("\n");

const status_of = async (donation_id: string) => {
  const [row] = await db()
    .select({ status: donations.status })
    .from(donations)
    .where(eq(donations.id, donation_id));
  return row?.status;
};

const owed_of = async (donation_id: string) =>
  (await owed_for_donation(donation_id)).map((o) => ({
    npo_id: o.npo_id,
    received_usd: o.received_usd,
    fee_processing_usd: o.fee_processing_usd,
    fee_dispute_usd: o.fee_dispute_usd,
    outstanding_usd: o.outstanding_usd,
  }));

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  test_db.fail_next_tx = false;
  refunds = [];
  captured = 10_000;
  stripe_transfers = new Map();
  answered = new Map();
  short = new Set();
  enqueue_mock.mockResolvedValue(undefined);
  invoice_payments_list_mock.mockResolvedValue({ data: [] });
  charge_retrieve_mock.mockImplementation(async () => charge_now());
  refunds_list_mock.mockImplementation(async () => ({ data: [...refunds] }));
  transfers.retrieve.mockImplementation(async (id: string) => {
    const t = stripe_transfers.get(id);
    if (!t) throw new Error(`no transfer ${id}`);
    const { reversals: _, ...rest } = t;
    return structuredClone(rest);
  });
  transfers.update.mockImplementation(
    async (id: string, p: { metadata: Record<string, string> }) => {
      const t = stripe_transfers.get(id)!;
      Object.assign(t.metadata, p.metadata);
      return structuredClone(t);
    }
  );
  transfers.listReversals.mockImplementation(async (id: string) => ({
    data: structuredClone(stripe_transfers.get(id)?.reversals ?? []),
  }));
  transfers.createReversal.mockImplementation(
    async (
      id: string,
      p: { amount: number; metadata: Record<string, string> },
      o: { idempotencyKey: string }
    ) => {
      const replay = answered.get(o.idempotencyKey);
      if (replay) return replay;
      const t = stripe_transfers.get(id)!;
      if (short.has(id) || p.amount > t.amount - t.amount_reversed) {
        throw new Stripe.errors.StripeInvalidRequestError({
          type: "invalid_request_error",
          message: "Insufficient funds in the connected account",
          code: "balance_insufficient",
        });
      }
      const r = {
        id: `trr_${t.reversals.length + 1}_${id}`,
        amount: p.amount,
        metadata: p.metadata,
      };
      t.reversals.push(r);
      t.amount_reversed += p.amount;
      answered.set(o.idempotencyKey, r);
      return r;
    }
  );
  await db().delete(owed_amounts);
  await clear_card_gifts(db());
});

describe("a dashboard refund of a routed gift", () => {
  it("reverses the whole transfer on a full refund, the npo's balances untouched and nothing owed", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);

    const res = await deliver(refund(10_000));

    expect(res.status).toBe(200);
    expect(reversed_of(tr)).toEqual([{ amount: 9_000, refund: "re_1" }]);
    expect(await status_of(charge_of.id)).toBe("refunded");
    expect(await balance_of(db(), charge_of.npo_ids[0]!)).toBe(0);
    expect(await owed_of(charge_of.id)).toEqual([]);
  });
});

describe("partial dashboard refunds of a routed gift", () => {
  it("reverses each refund's share of the transfer, owing nothing and never calling the share pending", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);

    await deliver(refund(4_000));

    expect(reversed_of(tr)).toEqual([{ amount: 3_600, refund: "re_1" }]);
    expect(await status_of(charge_of.id)).toBe("settled");
    expect(await owed_of(charge_of.id)).toEqual([]);
    expect(notice_text()).not.toMatch(/still in the npo's balances|pending/);
    expect(notice_text()).toMatch(/^Partial Refund: Nothing Owed$/m);
    expect(notice_text()).not.toMatch(/Recorded as Owed/);

    await deliver(refund(6_000));

    expect(reversed_of(tr)).toEqual([
      { amount: 3_600, refund: "re_1" },
      { amount: 5_400, refund: "re_2" },
    ]);
    expect(await status_of(charge_of.id)).toBe("refunded");
    expect(await owed_of(charge_of.id)).toEqual([]);
  });

  it("cuts a third-of-a-charge refund to the cent, the three summing to the transfer", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of, 0, 8_999);

    for (const cents of [3_333, 3_333, 3_334]) await deliver(refund(cents));

    expect(reversed_of(tr).map((r) => r.amount)).toEqual([2_999, 3_000, 3_000]);
  });

  it("reverses nothing more when stripe redelivers a refund's event", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    const first = refund(4_000);

    await deliver(first);
    // past stripe's 24h idempotency window: only the reversal on record dedupes it
    answered.clear();
    await deliver(first);

    expect(reversed_of(tr)).toEqual([{ amount: 3_600, refund: "re_1" }]);
  });
});

describe("a routed gift's transfer reversed in part by hand", () => {
  it("reverses only what is left of it, recording nothing owed", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    const t = stripe_transfers.get(tr)!;
    t.reversals.push({ id: "trr_by_hand", amount: 5_000, metadata: {} });
    t.amount_reversed = 5_000;

    expect((await deliver(refund(10_000))).status).toBe(200);

    expect(reversed_of(tr)).toEqual([
      { amount: 5_000, refund: undefined },
      { amount: 4_000, refund: "re_1" },
    ]);
    expect(await owed_of(charge_of.id)).toEqual([]);
    expect(await status_of(charge_of.id)).toBe("refunded");
  });
});

describe("a fund gift to a routed and a pooled nonprofit", () => {
  it("reverses only the routed one's transfer, the pooled one owing its share as before", async () => {
    charge_of = await seed_card_gift(db(), ROUTED, PAID_GRANT);
    captured = 20_000;
    const tr = paid_by_transfer(charge_of);
    const [routed_npo, pooled_npo] = charge_of.npo_ids;

    await deliver(refund(8_000));

    expect(reversed_of(tr)).toEqual([{ amount: 3_600, refund: "re_1" }]);
    expect(transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(await owed_of(charge_of.id)).toEqual([
      {
        npo_id: pooled_npo,
        received_usd: 36,
        fee_processing_usd: 1.28,
        fee_dispute_usd: 0,
        outstanding_usd: 37.28,
      },
    ]);
    expect(notice_text()).not.toContain(`npo ${routed_npo}`);

    await deliver(refund(12_000));

    expect(reversed_of(tr)).toEqual([
      { amount: 3_600, refund: "re_1" },
      { amount: 5_400, refund: "re_2" },
    ]);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { npo_id: pooled_npo, received_usd: 90, fee_processing_usd: 3.2 },
    ]);
    expect(await status_of(charge_of.id)).toBe("refunded_loss");
  });
});

describe("a reversal stripe refuses", () => {
  it("still acks the donor's refund, records the shortfall owed by the npo and reports it", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    short.add(tr);

    const res = await deliver(refund(4_000));

    expect(res.status).toBe(200);
    expect(reversed_of(tr)).toEqual([]);
    expect(await owed_of(charge_of.id)).toEqual([
      {
        npo_id: charge_of.npo_ids[0],
        received_usd: 36,
        fee_processing_usd: 0,
        fee_dispute_usd: 0,
        outstanding_usd: 36,
      },
    ]);
    expect(report_error_mock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("re_1") }),
      expect.objectContaining({
        donation_id: charge_of.id,
        dist_id: `dist-${charge_of.id}-0`,
        transfer_id: tr,
        refund_id: "re_1",
        stripe_code: "balance_insufficient",
      })
    );
  });

  it("never asks stripe again for a cut it refused, so a later success can't take it twice", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    short.add(tr);
    const first = refund(4_000);
    await deliver(first);
    // the balance has since come in, and stripe's idempotency window passed
    short.clear();
    answered.clear();

    await deliver(first);
    await deliver(refund(6_000));

    expect(reversed_of(tr)).toEqual([{ amount: 5_400, refund: "re_2" }]);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 36, outstanding_usd: 36 },
    ]);
    expect(await status_of(charge_of.id)).toBe("refunded");
  });

  it("records the shortfall on redelivery when the db fails after stripe has the cut marked refused", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    short.add(tr);
    transfers.update.mockImplementationOnce(
      async (id: string, p: { metadata: Record<string, string> }) => {
        Object.assign(stripe_transfers.get(id)!.metadata, p.metadata);
        test_db.fail_next_tx = true;
        return {};
      }
    );
    const event = refund(4_000);

    expect((await deliver(event)).status).not.toBe(200);
    expect((await deliver(event)).status).toBe(200);

    expect(transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 36, outstanding_usd: 36 },
    ]);
  });

  it("records the whole transfer owed when a full refund's reversal is refused", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    short.add(paid_by_transfer(charge_of));

    expect((await deliver(refund(10_000))).status).toBe(200);

    expect(await status_of(charge_of.id)).toBe("refunded");
    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 90, outstanding_usd: 90 },
    ]);
  });

  it("fails the delivery when stripe can't be reached, and its redelivery reverses the transfer", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    transfers.createReversal.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" })
    );
    const event = refund(10_000);

    expect((await deliver(event)).status).toBe(503);
    expect(await status_of(charge_of.id)).toBe("settled");

    expect((await deliver(event)).status).toBe(200);
    expect(reversed_of(tr)).toEqual([{ amount: 9_000, refund: "re_1" }]);
    expect(await status_of(charge_of.id)).toBe("refunded");
  });
});

// stripe debits every dispute from the platform, and the transfer stays
// where it went: what the npo owes for it is recorded for recoup, nothing is
// reversed (decisions.md, "cross-border reversal trap")
describe("a dispute on a routed gift", () => {
  it("records the npo as owing its share plus its card and dispute fees at open, reversing nothing", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    paid_by_transfer(charge_of);

    expect((await deliver(opened())).status).toBe(200);

    expect(await owed_of(charge_of.id)).toEqual([
      {
        npo_id: charge_of.npo_ids[0],
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 15,
        outstanding_usd: 108.2,
      },
    ]);
    expect(await status_of(charge_of.id)).toBe("settled");
    expect(transfers.createReversal).not.toHaveBeenCalled();
  });

  // a withdrawn dispute closes won, or lost without evidence
  // (docs.stripe.com/disputes/withdrawing)
  it("cancels what the open recorded once the dispute is won or withdrawn", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    paid_by_transfer(charge_of);
    await deliver(opened());

    await deliver(closed("won"));

    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 90, fee_dispute_usd: 15, outstanding_usd: 0 },
    ]);
    expect(await status_of(charge_of.id)).toBe("settled");
    expect(transfers.createReversal).not.toHaveBeenCalled();
  });

  it("reduces what is owed when the chargeback comes in under the dispute opened", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    paid_by_transfer(charge_of);
    await deliver(opened(6_000));
    const at_open = await owed_of(charge_of.id);

    await deliver(closed("lost", 4_000));

    expect(at_open).toMatchObject([{ outstanding_usd: 70.92 }]);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 54, outstanding_usd: 52.28 },
    ]);
    expect(await status_of(charge_of.id)).toBe("settled");
    expect(transfers.createReversal).not.toHaveBeenCalled();
  });

  it("leaves what the open recorded standing once lost, the npo's balances untouched", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    paid_by_transfer(charge_of);
    await deliver(opened());

    expect((await deliver(closed("lost"))).status).toBe(200);

    expect(await status_of(charge_of.id)).toMatch(/^refunded/);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 90, fee_dispute_usd: 15, outstanding_usd: 108.2 },
    ]);
    expect(await balance_of(db(), charge_of.npo_ids[0]!)).toBe(0);
    expect(transfers.createReversal).not.toHaveBeenCalled();
  });
});

// the money is back in our balance and the npo's share stays reversed: no
// transfer pays it back on its own, so ops re-pays it
describe("a refund that fails after a routed gift's cut was reversed", () => {
  it("tells ops to re-pay the reversed share by hand, naming the dist, transfer and amount", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    await deliver(refund(4_000));

    expect((await deliver(fail("re_1"))).status).toBe(200);

    const alert = failed_alert();
    expect(alert).toContain(
      `dist dist-${charge_of.id}-0 to NPO ${charge_of.id.slice(4)}-0 (npo ${charge_of.npo_ids[0]}): $36.00 reversed from transfer ${tr} for this refund; re-pay it to the nonprofit by hand`
    );
    expect(alert).not.toMatch(/hand adjustment|balances or pending payout/);
  });

  it("names the reversal of a full refund that failed, not the npo's balances", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    await deliver(refund(10_000));

    await deliver(fail("re_1"));

    const alert = failed_alert();
    expect(alert).toContain(`$90.00 reversed from transfer ${tr}`);
    expect(alert).not.toMatch(/hand adjustment|balances or pending payout/);
  });

  it("credits back the shortfall recorded for a refused cut, which a later refund doesn't raise again", async () => {
    charge_of = await seed_card_gift(db(), ROUTED);
    const tr = paid_by_transfer(charge_of);
    short.add(tr);
    await deliver(refund(4_000));

    await deliver(fail("re_1"));
    const after_fail = await owed_of(charge_of.id);
    await deliver(refund(2_000));

    expect(after_fail).toMatchObject([{ outstanding_usd: 0 }]);
    // the later refund's own cut is refused too: only it is owed
    expect(await owed_of(charge_of.id)).toMatchObject([
      { outstanding_usd: 18 },
    ]);
    expect(failed_alert()).toContain("$36.00 shortfall");
  });
});
