import { eq } from "drizzle-orm";
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

// the webhook route with its real refund handlers over pglite; stripe's api
// and the queue are the boundary
const construct_event_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());
const invoice_payments_list_mock = vi.hoisted(() => vi.fn());
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/kit/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: construct_event_mock },
    charges: { retrieve: charge_retrieve_mock },
    refunds: { list: refunds_list_mock },
    invoicePayments: { list: invoice_payments_list_mock },
  },
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
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/kit/discord", () => ({ fiat_monitor: { send_alert: vi.fn() } }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

const { action } = await import("./route");
const { owed_for_donation } = await import("$/pg/queries/owed");
const { donations } = await import("$/pg/schema/donation");
const { owed_amounts } = await import("$/pg/schema/owed");
const { PAID_GRANT, clear_card_gifts, seed_card_gift } = await import(
  "#/__tests__/fixtures/card-gift"
);

const db = () => test_db.current!.db;

type Gift = Awaited<ReturnType<typeof seed_card_gift>>;

interface IRefund {
  id: string;
  amount: number;
  status: string;
  created: number;
}

/** stripe's side of the gift's one $100 usd charge; refunds newest first, as
 * stripe lists them */
let refunds: IRefund[] = [];
let charge_of: Gift;
let clock = 1_790_000_000;
let event_n = 0;

// stripe doesn't document whether its refunded total counts a pending refund
// or drops a failed one, so the charge stripe returns here carries none: the
// share is read off the refund list
const charge_now = () => ({
  id: `ch_${charge_of.id}`,
  payment_intent: charge_of.sttl_id,
  currency: "usd",
  amount: 10_000,
  amount_captured: 10_000,
});

/** the event's own copy of the charge, which names its refunded total */
const live_refunded = () =>
  refunds
    .filter((r) => r.status !== "failed" && r.status !== "canceled")
    .reduce((sum, r) => sum + r.amount, 0);

/** support refunds `amount` cents; returns the charge.refunded stripe sends.
 * a bank refund (ach, acss) starts pending */
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

/** the bank settles refund `id` as `status`; returns stripe's refund.updated */
const settle = (id: string, status: string) => {
  const r = refunds.find((x) => x.id === id);
  if (!r) throw new Error(`no refund ${id}`);
  const previous = r.status;
  r.status = status;
  clock += 60;
  return {
    id: `evt_${++event_n}`,
    type: "refund.updated",
    created: clock,
    data: {
      object: { ...r, charge: charge_now().id, currency: "usd" },
      previous_attributes: { status: previous },
    },
  };
};

/** verified by the mocked signature check, then handled for real */
const deliver = async (event: object) => {
  construct_event_mock.mockReturnValue(event);
  const request = new Request("https://x/api/stripe-webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=ok" },
  });
  return (await action({ request } as any)) as Response;
};

/** every ops notice queued so far, title and body */
const notice_text = () =>
  enqueue_mock.mock.calls
    .flat()
    .filter((m) => m.id === "fiat-notice")
    .map((m) => `${m.payload.alert.title}\n${m.payload.alert.body}`)
    .join("\n");

const gift_of = async (donation_id: string) => {
  const [row] = await db()
    .select({
      status: donations.status,
      refunded_share: donations.refunded_share,
    })
    .from(donations)
    .where(eq(donations.id, donation_id));
  return row;
};

/** each party's row on the gift, npos by id */
const owed_of = async (donation_id: string) =>
  (await owed_for_donation(donation_id))
    .sort((a, b) => (a.npo_id ?? Infinity) - (b.npo_id ?? Infinity))
    .map((o) => ({
      npo_id: o.npo_id,
      source_ref: o.source_ref,
      received_usd: o.received_usd,
      fee_processing_usd: o.fee_processing_usd,
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
  refunds = [];
  enqueue_mock.mockResolvedValue(undefined);
  invoice_payments_list_mock.mockResolvedValue({ data: [] });
  charge_retrieve_mock.mockImplementation(async () => charge_now());
  refunds_list_mock.mockImplementation(async () => ({ data: [...refunds] }));
  await db().delete(owed_amounts);
  await clear_card_gifts(db());
});

describe("a partial refund on a gift whose grant went out", () => {
  it("records the npo's share of what it received plus its card fee, and leaves the gift settled and partly refunded", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);

    const res = await deliver(refund(4_000));

    expect(res.status).toBe(200);
    expect(await owed_of(charge_of.id)).toEqual([
      {
        npo_id: charge_of.npo_ids[0],
        source_ref: "re_1",
        received_usd: 36,
        fee_processing_usd: 1.28,
        outstanding_usd: 37.28,
      },
    ]);
    expect(await gift_of(charge_of.id)).toEqual({
      status: "settled",
      refunded_share: 0.4,
    });
    expect(notice_text()).toMatch(/Partial Refund Recorded as Owed/);
  });

  it("reverses the gift once a later refund completes the charge, the row ending at the full-refund figure", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);
    await deliver(refund(4_000));

    const res = await deliver(refund(6_000));

    expect(res.status).toBe(200);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { received_usd: 90, fee_processing_usd: 3.2, outstanding_usd: 93.2 },
    ]);
    expect((await gift_of(charge_of.id))?.status).toBe("refunded_loss");
    expect(notice_text()).not.toMatch(/undo|hand adjustment/i);
  });

  it("ends two $50 refunds where one full refund ends, each redelivery changing nothing", async () => {
    const full = await seed_card_gift(db(), PAID_GRANT);
    charge_of = full;
    await deliver(refund(10_000));
    const one_full = await owed_of(full.id);

    refunds = [];
    charge_of = await seed_card_gift(db(), PAID_GRANT);
    const first = refund(5_000);
    await deliver(first);
    await deliver(first);
    const at_half = await owed_of(charge_of.id);
    const second = refund(5_000);
    await deliver(second);
    await deliver(second);

    expect(at_half).toMatchObject([{ outstanding_usd: 46.6 }]);
    const without_npo = (rows: typeof one_full) =>
      rows.map(({ npo_id: _, ...o }) => o);
    expect(without_npo(await owed_of(charge_of.id))).toEqual(
      without_npo(one_full)
    );
    expect(one_full).toMatchObject([{ outstanding_usd: 93.2 }]);
    expect((await gift_of(charge_of.id))?.status).toBe(
      (await gift_of(full.id))?.status
    );
  });
});

describe("a partial refund on a gift whose payout is still pending", () => {
  it("records nothing owed, and tells ops the pending grant is why", async () => {
    charge_of = await seed_card_gift(db(), {
      ...PAID_GRANT,
      payout: "pending",
    });

    const res = await deliver(refund(4_000));

    expect(res.status).toBe(200);
    expect(await owed_of(charge_of.id)).toEqual([]);
    expect((await gift_of(charge_of.id))?.status).toBe("settled");
    expect(notice_text()).toMatch(
      /Partial Refund Not Reversed[\s\S]*grant payout is still pending/
    );
  });
});

describe("a partial bank refund that starts pending", () => {
  it("records nothing until refund.updated says it succeeded, then its share", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);

    await deliver(refund(4_000, "pending"));
    const while_pending = await owed_of(charge_of.id);
    const res = await deliver(settle("re_1", "succeeded"));

    expect(while_pending).toEqual([]);
    expect(notice_text()).toMatch(/Reversal Held/);
    expect(res.status).toBe(200);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { source_ref: "re_1", outstanding_usd: 37.28 },
    ]);
    expect((await gift_of(charge_of.id))?.status).toBe("settled");
  });

  it("takes nothing back, and tells ops nothing more, when the pending refund fails", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);
    await deliver(refund(4_000, "pending"));
    const held = notice_text();

    const res = await deliver(settle("re_1", "failed"));

    expect(res.status).toBe(200);
    expect(await owed_of(charge_of.id)).toEqual([]);
    expect(notice_text()).toBe(held);
  });

  it("records the share of the refund that succeeded once the other pending one fails", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);
    await deliver(refund(4_000, "pending"));
    await deliver(refund(2_000, "pending"));
    await deliver(settle("re_1", "succeeded"));
    const while_one_pending = await owed_of(charge_of.id);

    await deliver(settle("re_2", "failed"));

    expect(while_one_pending).toEqual([]);
    expect(await owed_of(charge_of.id)).toMatchObject([
      { source_ref: "re_1", outstanding_usd: 37.28 },
    ]);
  });
});

describe("a refund.updated that changes no status", () => {
  it("ignores a refund.updated that settles nothing, such as the trace number arriving", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);
    await deliver(refund(4_000));
    const after_refund = notice_text();
    const traced = settle("re_1", "succeeded");
    traced.data.previous_attributes = {} as any;

    const res = await deliver(traced);

    expect(res.status).toBe(200);
    expect(after_refund).toMatch(/Partial Refund Recorded as Owed/);
    expect(notice_text()).toBe(after_refund);
  });
});

describe("what the share counts", () => {
  it("counts a pending refund, so a pending full refund ends the recurring gift while it holds", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);

    await deliver(refund(10_000, "pending"));

    expect(await owed_of(charge_of.id)).toEqual([]);
    expect(invoice_payments_list_mock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { payment_intent: charge_of.sttl_id, type: "payment_intent" },
      })
    );
  });

  it("ends no recurring gift while a pending refund is only part of the charge", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);

    await deliver(refund(4_000, "pending"));

    expect(invoice_payments_list_mock).not.toHaveBeenCalled();
  });

  it("counts nothing of a refund that failed", async () => {
    charge_of = await seed_card_gift(db(), PAID_GRANT);
    await deliver(refund(2_000, "pending"));
    await deliver(settle("re_1", "failed"));

    await deliver(refund(4_000));

    expect(await owed_of(charge_of.id)).toMatchObject([
      { source_ref: "re_2", outstanding_usd: 37.28 },
    ]);
  });
});
