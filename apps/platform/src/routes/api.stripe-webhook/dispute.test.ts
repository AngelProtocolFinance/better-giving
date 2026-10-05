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
import type { DbOrTx } from "$/pg/queries/helpers";
import type { TestDb } from "$/pg/test-utils/pglite";

// the webhook route with its real dispute handlers over pglite; stripe's api
// and the queue are the boundary
const construct_event_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/kit/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: construct_event_mock },
    charges: { retrieve: charge_retrieve_mock },
    refunds: { list: refunds_list_mock },
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
const { disputes_of_donation } = await import("$/pg/queries/dispute");
const { owed_for_donation, recover_owed } = await import("$/pg/queries/owed");
const { donations } = await import("$/pg/schema/donation");
const { loss_logs } = await import("$/pg/schema/revenue");
const {
  PAID_GRANT,
  balance_of,
  clear_card_gifts,
  seed_card_gift,
  seed_paid_commission,
} = await import("#/__tests__/fixtures/card-gift");

const OPENED_UNIX = 1_790_000_000;
const OPENED = new Date(OPENED_UNIX * 1000).toISOString();
const CLOSED_UNIX = OPENED_UNIX + 40 * 86_400;
const CLOSED = new Date(CLOSED_UNIX * 1000).toISOString();

const db = () => test_db.current!.db;

type Gift = Awaited<ReturnType<typeof seed_card_gift>>;

interface IDisputeSeed {
  status?: string;
  /** cents of the $100 charge */
  amount?: number;
  /** cents, in the settlement currency; none for an inquiry */
  fee?: number;
}

/** stripe's dispute over `gift`'s $100 charge, opened at `OPENED` */
const dispute_of = (
  gift: Gift,
  { status = "needs_response", amount = 10_000, fee = 1_500 }: IDisputeSeed = {}
) => ({
  id: `du_${gift.id}`,
  object: "dispute",
  amount,
  currency: "usd",
  charge: `ch_${gift.id}`,
  payment_intent: gift.sttl_id,
  reason: "fraudulent",
  status,
  created: OPENED_UNIX,
  evidence_details: { due_by: OPENED_UNIX + 14 * 86_400 },
  balance_transactions: status.startsWith("warning_")
    ? []
    : [{ id: "txn_dsp", amount: -amount, fee, currency: "usd" }],
});

let event_n = 0;
const event_of = (type: string, object: object, created = OPENED_UNIX) => ({
  id: `evt_${++event_n}`,
  type,
  created,
  data: { object },
});

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

const status_of = async (donation_id: string) => {
  const [row] = await db()
    .select({ status: donations.status })
    .from(donations)
    .where(eq(donations.id, donation_id));
  return row?.status;
};

/** the ops notices queued so far */
const notices = () =>
  enqueue_mock.mock.calls.flat().filter((m) => m.id === "fiat-notice");

/** each party's row on the gift as it breaks down, npos by id */
const owed_of = async (donation_id: string) =>
  (await owed_for_donation(donation_id))
    .sort((a, b) => (a.npo_id ?? Infinity) - (b.npo_id ?? Infinity))
    .map((o) => ({
      npo_id: o.npo_id,
      referrer_user: o.referrer_user,
      source_ref: o.source_ref,
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
  enqueue_mock.mockResolvedValue(undefined);
  charge_retrieve_mock.mockImplementation(async (id: string) => ({
    id,
    amount: 10_000,
    currency: "usd",
    amount_refunded: 0,
  }));
  refunds_list_mock.mockResolvedValue({ data: [] });
  await clear_card_gifts(db());
});

describe("charge.dispute.created", () => {
  it("records the paid-grant npo as owing what it received plus its card and dispute fees, and the gift as disputed", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);

    const res = await deliver(
      event_of("charge.dispute.created", dispute_of(gift))
    );

    expect(res.status).toBe(200);
    expect(await owed_of(gift.id)).toEqual([
      {
        npo_id: gift.npo_ids[0],
        referrer_user: null,
        source_ref: `du_${gift.id}`,
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 15,
        outstanding_usd: 108.2,
      },
    ]);
    expect(await disputes_of_donation(gift.id)).toMatchObject([
      { id: `du_${gift.id}`, status: "open", opened_at: OPENED },
    ]);
  });

  it("tells ops once per dispute what it recorded as owed", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    const opened = event_of("charge.dispute.created", dispute_of(gift));

    await deliver(opened);
    await deliver(opened);
    await deliver(event_of("charge.dispute.funds_withdrawn", dispute_of(gift)));

    const [first, ...again] = notices();
    expect(first.payload.alert.title).toBe("Stripe Dispute Opened");
    const body: string = first.payload.alert.body;
    expect(body).toContain(gift.id);
    expect(body).toContain(`du_${gift.id}`);
    expect(body).toMatch(/amount: 100\.00 USD, reason: fraudulent/);
    expect(body).toMatch(/recorded as owed: 108\.20 USD/);
    expect(again.map((n) => n.dedupe)).toEqual([first.dedupe, first.dedupe]);
  });
});

const lost_of = (gift: Gift) =>
  event_of(
    "charge.dispute.closed",
    dispute_of(gift, { status: "lost" }),
    CLOSED_UNIX
  );

describe("charge.dispute.closed, lost after it opened", () => {
  it("reverses the gift, keeps the row at what the open recorded and books no loss", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    await deliver(event_of("charge.dispute.created", dispute_of(gift)));

    const res = await deliver(lost_of(gift));

    expect(res.status).toBe(200);
    expect(await status_of(gift.id)).toBe("refunded_loss");
    expect(await owed_of(gift.id)).toMatchObject([
      {
        source_ref: `du_${gift.id}`,
        received_usd: 90,
        fee_dispute_usd: 15,
        outstanding_usd: 108.2,
      },
    ]);
    expect(await db().select().from(loss_logs)).toEqual([]);
    expect(await disputes_of_donation(gift.id)).toMatchObject([
      { status: "lost", closed_at: CLOSED },
    ]);
  });

  it("takes what the npo received plus fees once when its payout was still pending at open", async () => {
    const gift = await seed_card_gift(db(), {
      ...PAID_GRANT,
      payout: "pending",
    });
    const npo_id = gift.npo_ids[0]!;
    const before = await balance_of(db(), npo_id);

    await deliver(event_of("charge.dispute.created", dispute_of(gift)));
    const at_open = await owed_of(gift.id);
    await deliver(lost_of(gift));

    expect(at_open).toMatchObject([{ outstanding_usd: 108.2 }]);
    const [row] = await owed_of(gift.id);
    const taken =
      before - (await balance_of(db(), npo_id)) + (row?.outstanding_usd ?? NaN);
    expect(taken).toBeCloseTo(108.2, 10);
  });
});

const won_of = (gift: Gift) =>
  event_of(
    "charge.dispute.closed",
    dispute_of(gift, { status: "won" }),
    CLOSED_UNIX
  );

describe("charge.dispute.closed, won", () => {
  it("credits back what the open recorded, leaving nothing outstanding and the gift settled", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    await deliver(event_of("charge.dispute.created", dispute_of(gift)));

    const res = await deliver(won_of(gift));

    expect(res.status).toBe(200);
    expect(await owed_of(gift.id)).toMatchObject([
      { received_usd: 90, fee_dispute_usd: 15, outstanding_usd: 0 },
    ]);
    expect(await status_of(gift.id)).toBe("settled");
    expect(await disputes_of_donation(gift.id)).toMatchObject([
      { status: "won", closed_at: CLOSED },
    ]);
  });

  it("leaves the npo due back what a grant run had already recovered", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    await deliver(event_of("charge.dispute.created", dispute_of(gift)));
    await recover_owed(db() as unknown as DbOrTx, {
      donation_id: gift.id,
      party: { npo_id: gift.npo_ids[0]! },
      usd: 50,
      reason: "grant_run",
      ref: "run-1",
      now: OPENED,
    });

    await deliver(won_of(gift));

    expect(await owed_of(gift.id)).toMatchObject([{ outstanding_usd: -50 }]);
  });

  it("records nothing owed for an open that arrives after the win", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);

    await deliver(won_of(gift));
    const res = await deliver(
      event_of("charge.dispute.created", dispute_of(gift))
    );

    expect(res.status).toBe(200);
    expect(await owed_of(gift.id)).toEqual([]);
    expect(await disputes_of_donation(gift.id)).toMatchObject([
      { status: "won" },
    ]);
  });
});

describe("a paid commission on the disputed gift", () => {
  it("is owed by its referrer from the open, and credited back on a win", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    await seed_paid_commission(db(), gift, "REF-1", 5);
    const referrer_row = async () =>
      (await owed_of(gift.id)).find((o) => o.referrer_user === "REF-1");

    await deliver(event_of("charge.dispute.created", dispute_of(gift)));
    const at_open = await referrer_row();
    await deliver(won_of(gift));

    expect(at_open).toMatchObject({
      source_ref: `du_${gift.id}`,
      received_usd: 5,
      fee_dispute_usd: 0,
      outstanding_usd: 5,
    });
    expect(await referrer_row()).toMatchObject({ outstanding_usd: 0 });
  });
});

describe("a fund gift across two nonprofits", () => {
  it("splits the dispute fee by each dist's share, the shares summing to the fee", async () => {
    // settled $50 and $25: a 2:1 split of $15.01 is $10.006… and $5.003…
    const gift = await seed_card_gift(
      db(),
      { net: 45, fee_processing: 1.6, fee_base: 3.4, payout: "settled" },
      { net: 22.5, fee_processing: 0.8, fee_base: 1.7, payout: "settled" }
    );
    charge_retrieve_mock.mockResolvedValue({
      id: `ch_${gift.id}`,
      amount: 7_500,
      currency: "usd",
      amount_refunded: 0,
    });

    await deliver(
      event_of(
        "charge.dispute.created",
        dispute_of(gift, { amount: 7_500, fee: 1_501 })
      )
    );

    const rows = await owed_of(gift.id);
    expect(rows.map((o) => [o.npo_id, o.fee_dispute_usd])).toEqual([
      [gift.npo_ids[0], 10.01],
      [gift.npo_ids[1], 5],
    ]);
  });
});

describe("a redelivered event", () => {
  it.each([
    ["won", won_of, 0],
    ["lost", lost_of, 108.2],
  ] as const)(
    "changes nothing further across an open and a %s close",
    async (_, close_of, outstanding) => {
      const gift = await seed_card_gift(db(), PAID_GRANT);
      const opened = event_of("charge.dispute.created", dispute_of(gift));
      const closed = close_of(gift);

      await deliver(opened);
      await deliver(opened);
      const at_open = await owed_of(gift.id);
      await deliver(closed);
      const at_close = await owed_of(gift.id);
      const res = await deliver(closed);
      await deliver(opened);

      expect(res.status).toBe(200);
      expect(at_open).toMatchObject([{ outstanding_usd: 108.2 }]);
      expect(at_close).toMatchObject([{ outstanding_usd: outstanding }]);
      expect(await owed_of(gift.id)).toEqual(at_close);
      expect(await disputes_of_donation(gift.id)).toHaveLength(1);
    }
  );
});

describe("a dispute over part of the charge", () => {
  const part = { amount: 4_000 };

  it("records the dispute with nothing owed, and its loss is left to ops", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);

    await deliver(event_of("charge.dispute.created", dispute_of(gift, part)));
    const res = await deliver(
      event_of(
        "charge.dispute.closed",
        dispute_of(gift, { ...part, status: "lost" }),
        CLOSED_UNIX
      )
    );

    expect(res.status).toBe(200);
    expect(await owed_of(gift.id)).toEqual([]);
    expect(await disputes_of_donation(gift.id)).toMatchObject([
      { id: `du_${gift.id}`, status: "lost" },
    ]);
    expect(await status_of(gift.id)).toBe("settled");
    expect(notices().map((n) => n.payload.alert.title)).toEqual([
      "Stripe Dispute Opened",
      "Lost Dispute Not Reversed",
    ]);
  });
});

describe("an inquiry", () => {
  const inquiry = { status: "warning_needs_response" };

  it("records the dispute with nothing owed, since no funds left", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);

    const res = await deliver(
      event_of("charge.dispute.created", dispute_of(gift, inquiry))
    );

    expect(res.status).toBe(200);
    expect(await disputes_of_donation(gift.id)).toMatchObject([
      { id: `du_${gift.id}`, status: "open" },
    ]);
    expect(await owed_of(gift.id)).toEqual([]);
    const [notice] = notices();
    expect(notice.payload.alert.body).toMatch(
      /inquiry.*nothing recorded as owed/
    );
  });

  it("records what is owed once it escalates and stripe withdraws the funds", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    await deliver(
      event_of("charge.dispute.created", dispute_of(gift, inquiry))
    );

    const res = await deliver(
      event_of("charge.dispute.funds_withdrawn", dispute_of(gift))
    );

    expect(res.status).toBe(200);
    expect(await owed_of(gift.id)).toMatchObject([
      { fee_dispute_usd: 15, outstanding_usd: 108.2 },
    ]);
    expect(notices().at(-1)!.payload.alert.body).toMatch(
      /recorded as owed: 108\.20 USD/
    );
  });

  it("a late inquiry event after the escalation changes nothing", async () => {
    const gift = await seed_card_gift(db(), PAID_GRANT);
    const asked = event_of("charge.dispute.created", dispute_of(gift, inquiry));
    await deliver(asked);
    await deliver(event_of("charge.dispute.funds_withdrawn", dispute_of(gift)));
    const before = notices().length;

    await deliver(asked);

    expect(await owed_of(gift.id)).toMatchObject([{ outstanding_usd: 108.2 }]);
    expect(notices()).toHaveLength(before);
  });
});
