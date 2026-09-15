import crypto from "node:crypto";
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

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const enqueue_mock = vi.hoisted(() => vi.fn());
const send_alert_mock = vi.hoisted(() => vi.fn());
const send_email_mock = vi.hoisted(() =>
  vi.fn(async () => ({ data: { id: "email-1" } }))
);
/** usd per unit, keyed by lowercase nowpayments code; a missing code rejects.
 * `zzzusd` has a rate but no entry in `@better-giving/crypto`'s token map */
const usd_rates = vi.hoisted(
  () =>
    ({ eth: 2000, usdc: 1, btc: 50_000, zzzusd: 1 }) as Record<string, number>
);

vi.mock("@sentry/react-router", () => ({ captureException: vi.fn() }));
vi.mock("$/env", () => ({
  nowpayments: { ipn_secret: "ipn-secret", is_sandbox: false },
  stage: "production",
}));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
vi.mock("$/email", () => ({ send_email: send_email_mock }));
vi.mock("$/kit/nowpayments", () => ({
  np: {
    estimate: vi.fn(async (code: string) => {
      const usdpu = usd_rates[code.toLowerCase()];
      if (!usdpu) throw new Error(`no rate: ${code}`);
      return { usdpu };
    }),
    min_amount: vi.fn(async (code: string) => {
      const usdpu = usd_rates[code.toLowerCase()];
      if (!usdpu) throw new Error(`no rate: ${code}`);
      return { min: 0.001, min_usd: 0.001 * usdpu };
    }),
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

// wrapped, not replaced: a test that stubs it can model a concurrent delivery
// that passed the read guard before this one's write committed
vi.mock("$/pg/queries/donation", async (importOriginal) => {
  const m = await importOriginal<typeof import("$/pg/queries/donation")>();
  return { ...m, donation_by_sttl_id: vi.fn(m.donation_by_sttl_id) };
});

const { action } = await import("./route");
const { handle_settled } = await import("./handlers/settled");
const { handle_confirming } = await import("./handlers/confirming");
const { handle_failed } = await import("./handlers/failed");
const { np } = await import("$/kit/nowpayments");
const { donation_by_sttl_id, donation_get, donation_put } = await import(
  "$/pg/queries/donation"
);
const {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} = await import("$/pg/schema/donation");
const { npos } = await import("$/pg/schema/npo");
const { create_test_db } = await import("$/pg/test-utils/pglite");

const db = () => test_db.current!.db;

const sort_deep = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sort_deep)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort_deep((v as any)[k])])
        )
      : v;

const deliver = async (payload: Record<string, unknown>) => {
  const body = JSON.stringify(payload);
  const sig = crypto
    .createHmac("sha512", "ipn-secret")
    .update(JSON.stringify(sort_deep(payload)))
    .digest("hex");
  const request = new Request("https://x/api/nowpayments-webhook", {
    method: "POST",
    body,
    headers: { "x-nowpayments-sig": sig },
  });
  return (await action({ request } as any)) as Response;
};

const ORDER_ID = "don-np-1";

const payment = (o: Record<string, unknown> = {}) => ({
  payment_id: 5001,
  parent_payment_id: null,
  invoice_id: 9,
  order_id: ORDER_ID,
  payment_status: "finished",
  pay_amount: 0.5,
  pay_currency: "eth",
  actually_paid: 0.5,
  actually_paid_at_fiat: 1000,
  outcome_amount: 990,
  outcome_currency: "usdc",
  fee: {
    currency: "usdc",
    depositFee: 1,
    serviceFee: 4,
    withdrawalFee: 5,
  },
  ...o,
});

let npo_id: number;

const seed_donation = async (o: Record<string, unknown> = {}) => {
  const now = new Date().toISOString();
  await donation_put(
    db() as any,
    {
      id: ORDER_ID,
      upusd: 1 / 2000,
      status: "confirmed",
      amount: { base: 0.5, tip: 0, fee_allowance: 0 },
      currency: "ETH",
      frequency: "one-time",
      source: "bg-widget",
      via: "crypto:eth",
      via_extra: "5001",
      to_id: npo_id.toString(),
      to_name: "NP Test NPO",
      to_type: "npo",
      to_tip_allowed: false,
      to_members: [],
      from_email: "donor@test.com",
      from_name: "Jane Donor",
      created_at: now,
      updated_at: now,
      ...o,
    } as any
  );
};

const settlements = () => db().select().from(donation_settlements);
/** the queue's dedupe keys of the nth enqueue — what makes a re-send a no-op */
const dedupes = (nth: number): string[] =>
  enqueue_mock.mock.calls.at(nth)!.map((m: any) => m.dedupe);
const alert_titles = () =>
  send_alert_mock.mock.calls.map(([a]) => a.title as string);

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  send_alert_mock.mockReset();
  await db().delete(donation_settlements);
  await db().delete(donation_donors);
  await db().delete(donation_recipients);
  await db().delete(donations);
  await db().delete(npos);
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-NP-TEST",
      name: "NP Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      active: true,
      fiscal_sponsored: true,
      hide_bg_tip: true,
      allocation: { liq: 50, lock: 30, cash: 20 },
      target_smart: true,
    })
    .returning();
  npo_id = npo.id;
});

describe("donation_settlements.sttl_id", () => {
  it("rejects a second donation settled under the same sttl_id", async () => {
    await seed_donation({
      status: "settled",
      settlement: {
        id: "5001",
        date: new Date().toISOString(),
        currency: "USDC",
        net: 1,
        fee: 0,
      },
    });

    const err = await seed_donation({
      id: "don-np-2",
      status: "settled",
      settlement: {
        id: "5001",
        date: new Date().toISOString(),
        currency: "USDC",
        net: 1,
        fee: 0,
      },
    }).catch((e) => e);

    expect(err?.cause?.code).toBe("23505");
    expect(await settlements()).toHaveLength(1);
  });
});

describe("nowpayments ipn settlement", () => {
  // the first delivery's enqueue can fail after its commit; the redelivery is
  // what's left to send them, and the queue absorbs a repeat
  it("settles a redelivered finished payment once, queueing its messages again", async () => {
    await seed_donation();

    const first = await deliver(payment());
    const { updated_at } = (await donation_get(ORDER_ID))!;
    const second = await deliver(payment());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await settlements()).toHaveLength(1);
    expect((await donation_get(ORDER_ID))!.updated_at).toBe(updated_at);
    expect(enqueue_mock).toHaveBeenCalledTimes(2);
    expect(dedupes(1)).toEqual(dedupes(0));
    expect(alert_titles()).toEqual(["Donation settled"]);
  });

  it("settles once when two deliveries read the donation before either wrote", async () => {
    await seed_donation();
    const stale = (await donation_get(ORDER_ID))!;

    const first = await handle_settled(payment() as any, stale);
    const second = await handle_settled(payment() as any, stale);

    expect(first.op).toBe("settled");
    expect(second.op).toBe("duplicate");
    expect(await settlements()).toHaveLength(1);
  });

  it("settles an underpayment once at what arrived when two deliveries read before either wrote", async () => {
    await seed_donation();
    const stale = (await donation_get(ORDER_ID))!;
    const partial = payment({
      payment_status: "partially_paid",
      actually_paid: 0.4,
    }) as any;

    const first = await handle_settled(partial, stale);
    const second = await handle_settled(partial, stale);

    expect(first.op).toBe("settled");
    expect(second.op).toBe("duplicate");
    expect(await settlements()).toHaveLength(1);
    const don = (await donation_get(ORDER_ID))!;
    expect(don.status).toBe("settled");
    expect(don.amount.base).toBeCloseTo(0.4);
  });

  it("keeps a settled donation when a confirming read before the settle writes after it", async () => {
    await seed_donation();
    const stale = (await donation_get(ORDER_ID))!;
    await deliver(payment());

    await handle_confirming(
      payment({ payment_status: "confirming", actually_paid: 0.1 }) as any,
      stale
    );

    const don = (await donation_get(ORDER_ID))!;
    expect(don.status).toBe("settled");
    expect(don.amount.base).toBe(0.5);
  });

  it("sends no failure email when a failed read before the settle writes after it", async () => {
    await seed_donation();
    const stale = (await donation_get(ORDER_ID))!;
    await deliver(payment());

    await handle_failed(
      payment({
        payment_status: "failed",
        actually_paid: 0.0001,
        actually_paid_at_fiat: 0,
        fee: null,
      }) as any,
      stale
    );

    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
    expect(send_email_mock).not.toHaveBeenCalled();
  });

  it("settles while discord is down", async () => {
    await seed_donation();
    send_alert_mock.mockRejectedValue(new Error("discord down"));

    const res = await deliver(
      payment({
        fee: {
          currency: "zzz",
          depositFee: 1,
          serviceFee: 1,
          withdrawalFee: 1,
        },
      })
    );

    expect(res.status).toBe(200);
    expect(await settlements()).toHaveLength(1);
    expect(enqueue_mock).toHaveBeenCalledOnce();
  });

  it("leaves the donation open for redelivery when the minimum lookup fails", async () => {
    await seed_donation();
    const failed = payment({
      payment_status: "failed",
      actually_paid: 0.0001,
      actually_paid_at_fiat: 0,
      fee: null,
    });
    vi.mocked(np.min_amount).mockRejectedValueOnce(new Error("np down"));

    const first = await deliver(failed);
    expect(first.status).toBe(500);
    expect((await donation_get(ORDER_ID))!.status).toBe("confirmed");

    await deliver(failed);
    expect((await donation_get(ORDER_ID))!.status).toBe("failed");
    expect(send_email_mock).toHaveBeenCalledOnce();
  });

  it.each([
    "refunded_loss",
    "cancelled",
  ])("keeps a %s donation's status when refunded arrives", async (status) => {
    await seed_donation({ status });

    const res = await deliver(payment({ payment_status: "refunded" }));

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe(status);
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it("refunds a settled donation and alerts", async () => {
    await seed_donation();
    await deliver(payment());
    send_alert_mock.mockClear();

    const res = await deliver(payment({ payment_status: "refunded" }));

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("refunded");
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(send_alert_mock.mock.calls[0][0].body).toContain("payment:5001");
  });

  it("acknowledges a finished redelivered after its refund without alerting", async () => {
    await seed_donation();
    await deliver(payment());
    await deliver(payment({ payment_status: "refunded" }));
    enqueue_mock.mockClear();
    send_alert_mock.mockClear();

    const res = await deliver(payment());

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("refunded");
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it("keeps a settled donation's status and amount when confirming arrives late", async () => {
    await seed_donation();
    await deliver(payment());

    const res = await deliver(
      payment({ payment_status: "confirming", actually_paid: 0.1 })
    );

    expect(res.status).toBe(200);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("settled");
    expect(don!.amount.base).toBe(0.5);
  });

  const child = (o: Record<string, unknown> = {}) =>
    payment({
      payment_id: 5002,
      parent_payment_id: 5001,
      actually_paid: 0.2,
      outcome_amount: 396,
      ...o,
    });

  it("settles a repeated deposit as its own donation, leaving the parent intact", async () => {
    await seed_donation();
    await deliver(payment());

    await deliver(child());
    const redelivered = await deliver(child());

    expect(redelivered.status).toBe(200);
    const parent = await donation_get(ORDER_ID);
    expect(parent!.settlement!.id).toBe("5001");
    expect(parent!.amount.base).toBe(0.5);

    const rows = await settlements();
    expect(rows).toHaveLength(2);
    const child_row = rows.find((r) => r.sttl_id === "5002")!;
    const clone = await donation_get(child_row.donation_id);
    expect(clone!.id).not.toBe(ORDER_ID);
    expect(clone!.status).toBe("settled");
    expect(clone!.amount.base).toBeCloseTo(0.2);
    expect(clone!.settlement!.net).toBeCloseTo(396);
    expect(clone!.to_id).toBe(parent!.to_id);
    // parent, child, and the child's redelivery queueing the clone's again
    expect(enqueue_mock).toHaveBeenCalledTimes(3);
    expect(dedupes(2)).toEqual(dedupes(1));
  });

  it("treats a repeated deposit a concurrent delivery already cloned as a duplicate", async () => {
    await seed_donation();
    await deliver(payment());
    await deliver(child());
    const cloned = dedupes(-1);
    enqueue_mock.mockClear();
    send_alert_mock.mockClear();
    // the guard misses, as it does for two deliveries racing past it
    vi.mocked(donation_by_sttl_id).mockResolvedValueOnce(undefined);

    const res = await deliver(child());

    expect(res.status).toBe(200);
    expect(
      (await settlements()).filter((r) => r.sttl_id === "5002")
    ).toHaveLength(1);
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(dedupes(0)).toEqual(cloned);
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it.each([
    "confirming",
    "waiting",
  ])("writes nothing for a repeated deposit still %s", async (payment_status) => {
    await seed_donation({ status: "intent" });

    const res = await deliver(child({ payment_status }));

    expect(res.status).toBe(200);
    const parent = await donation_get(ORDER_ID);
    expect(parent!.status).toBe("intent");
    expect(parent!.via_extra).toBe("5001");
  });

  it.each([
    "failed",
    "expired",
  ])("alerts on a %s repeated deposit without writing or emailing", async (payment_status) => {
    await seed_donation();
    await deliver(payment());
    send_alert_mock.mockClear();

    const res = await deliver(child({ payment_status }));

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
    expect(await settlements()).toHaveLength(1);
    expect(send_email_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(send_alert_mock.mock.calls[0][0].body).toContain("parent:5001");
  });

  it.each([
    "confirming",
    "finished",
    "partially_paid",
  ])("holds a %s deposit in another asset than the order's", async (payment_status) => {
    await seed_donation();

    const res = await deliver(
      payment({ payment_status, pay_currency: "usdterc20", actually_paid: 50 })
    );

    expect(res.status).toBe(200);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("confirmed");
    expect(don!.amount.base).toBe(0.5);
    expect(await settlements()).toHaveLength(0);
    expect(send_alert_mock).toHaveBeenCalledOnce();
    const [a] = send_alert_mock.mock.calls[0];
    expect(`${a.title} ${a.body}`).toMatch(/USDTERC20.*ETH|ETH.*USDTERC20/);
    expect(a.body).toContain("payment:5001");
  });

  it("records a fee charged in another currency at that currency's usd rate", async () => {
    await seed_donation();

    await deliver(
      payment({
        fee: {
          currency: "btc",
          depositFee: 0.00002,
          serviceFee: 0.00003,
          withdrawalFee: 0.00005,
        },
      })
    );

    const [row] = await settlements();
    expect(row.fee).toBeCloseTo(5);
    expect(row.net).toBeCloseTo(990);
  });

  it("settles with a zero fee and alerts when the fee currency has no rate", async () => {
    await seed_donation();

    const res = await deliver(
      payment({
        fee: {
          currency: "zzz",
          depositFee: 1,
          serviceFee: 1,
          withdrawalFee: 1,
        },
      })
    );

    expect(res.status).toBe(200);
    const [row] = await settlements();
    expect(row.fee).toBe(0);
    expect(alert_titles()).toContainEqual(expect.stringMatching(/fee/i));
  });

  it("settles an outcome token missing from the token map under its own code", async () => {
    await seed_donation();

    const res = await deliver(payment({ outcome_currency: "zzzusd" }));

    expect(res.status).toBe(200);
    const [row] = await settlements();
    expect(row.currency).toBe("ZZZUSD");
    expect(alert_titles()).toContainEqual(expect.stringMatching(/token map/i));
  });

  it("alerts on a reprocessable failure without emailing the donor", async () => {
    await seed_donation();

    const res = await deliver(payment({ payment_status: "failed" }));

    expect(res.status).toBe(200);
    expect(send_email_mock).not.toHaveBeenCalled();
    expect((await donation_get(ORDER_ID))!.status).toBe("confirmed");
    expect(alert_titles()).toEqual([expect.stringMatching(/reprocess/i)]);
  });

  it("emails the donor once for a final failure delivered twice", async () => {
    await seed_donation();
    const failed = payment({
      payment_status: "failed",
      actually_paid: 0.0001,
      actually_paid_at_fiat: 0,
      fee: null,
    });

    await deliver(failed);
    const second = await deliver(failed);

    expect(second.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("failed");
    expect(send_email_mock).toHaveBeenCalledOnce();
  });

  it.each([
    ["finished", "failed"],
    ["finished", "expired"],
    ["partially_paid", "expired"],
  ])("settles a late %s on a %s donation and alerts", async (payment_status, status) => {
    await seed_donation({ status });

    const res = await deliver(payment({ payment_status, actually_paid: 0.4 }));

    expect(res.status).toBe(200);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("settled");
    expect(don!.settlement!.id).toBe("5001");
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(alert_titles()).toContainEqual(expect.stringMatching(/late/i));
  });

  it("refuses a finished payment on a refunded donation", async () => {
    await seed_donation({ status: "refunded" });

    const res = await deliver(payment());

    expect(res.status).toBe(200);
    expect(await settlements()).toHaveLength(0);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("marks a refunded repeated deposit's own donation refunded", async () => {
    await seed_donation();
    await deliver(payment());
    await deliver(child());
    send_alert_mock.mockClear();

    const res = await deliver(child({ payment_status: "refunded" }));

    expect(res.status).toBe(200);
    const [child_row] = (await settlements()).filter(
      (r) => r.sttl_id === "5002"
    );
    expect((await donation_get(child_row.donation_id))!.status).toBe(
      "refunded"
    );
    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(send_alert_mock.mock.calls[0][0].body).toContain("payment:5002");
  });

  it("acknowledges a refunded repeated deposit that never settled", async () => {
    await seed_donation();
    await deliver(payment());
    send_alert_mock.mockClear();

    const res = await deliver(child({ payment_status: "refunded" }));

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it.each([
    "failed",
    "expired",
  ])("ignores %s after the donation settled", async (payment_status) => {
    await seed_donation();
    await deliver(payment());

    const res = await deliver(payment({ payment_status }));

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
    expect(send_email_mock).not.toHaveBeenCalled();
  });
});
