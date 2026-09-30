// the "two deliveries race" tests run on pglite, a single connection: two
// db.transaction() calls queue rather than overlap. they prove the guard reads
// committed state under the tx, not that the order row's lock contends.

import { execFileSync } from "node:child_process";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { crc32 } from "node:zlib";
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

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const enqueue_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const report_degraded_mock = vi.hoisted(() => vi.fn());
const sentry_capture_mock = vi.hoisted(() => vi.fn());
const get_order_mock = vi.hoisted(() => vi.fn());
const get_subscription_mock = vi.hoisted(() => vi.fn());
const get_plan_mock = vi.hoisted(() => vi.fn());
const capture_order_mock = vi.hoisted(() => vi.fn());
const schedule_mock = vi.hoisted(() => vi.fn());
const send_alert_mock = vi.hoisted(() => vi.fn());
const process_refund_mock = vi.hoisted(() => vi.fn());
const get_capture_mock = vi.hoisted(() => vi.fn());
const get_sale_mock = vi.hoisted(() => vi.fn());
/** runs on the lock's own tx just before it is taken — a write that commits
 * between the handler's first read and the lock */
const before_lock = vi.hoisted(() => ({
  current: null as null | ((tx: any, id: string) => Promise<void>),
}));

vi.mock("#/errors/report", () => ({
  report_error: report_error_mock,
  report_degraded: report_degraded_mock,
  report_resp: (e: any) => new Response(e?.message ?? "error", { status: 500 }),
}));
vi.mock("@sentry/react-router", async (io) => ({
  ...(await io<typeof import("@sentry/react-router")>()),
  captureException: sentry_capture_mock,
}));
/** read by the route once, at import — a change reaches only a fresh import */
const paypal_env = vi.hoisted(() => ({
  webhook_id: "wh-1",
  client_id: "c",
  client_secret: "s",
  api_url: "https://api-m.sandbox.paypal.com",
}));
vi.mock("$/env", () => ({ paypal: paypal_env, stage: "production" }));
vi.mock("$/kit/paypal", () => ({
  paypal: {
    get_order: get_order_mock,
    get_subscription: get_subscription_mock,
    get_plan: get_plan_mock,
    capture_order: capture_order_mock,
    get_capture: get_capture_mock,
    get_sale: get_sale_mock,
  },
}));
vi.mock("$/kit/queue", () => ({
  enqueue: enqueue_mock,
  schedule: schedule_mock,
}));
vi.mock("$/refund/process", () => ({ process_refund: process_refund_mock }));
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/pg/queries/donation", async (io) => {
  const actual = await io<typeof import("$/pg/queries/donation")>();
  return {
    ...actual,
    donation_settle_state_locked: async (tx: any, id: string) => {
      await before_lock.current?.(tx, id);
      return actual.donation_settle_state_locked(tx, id);
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

const { action } = await import("./route");
const { PayPalApiError } = await import("@better-giving/paypal");
const { report_error: real_report_error } =
  await vi.importActual<typeof import("#/errors/report")>("#/errors/report");
const { donation_get, donation_put, donation_update } = await import(
  "$/pg/queries/donation"
);
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { dists } = await import("$/pg/schema/dist");
const {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} = await import("$/pg/schema/donation");
const { npos } = await import("$/pg/schema/npo");
const { subscriptions } = await import("$/pg/schema/subscription");

const db = () => test_db.current!.db;

const ORDER_ID = "don-pp-1";
const CAPTURE_ID = "capture-1";
const SALE_ID = "sale-1";
const SUBS_ID = "I-SUBS-1";

interface ISigner {
  key: KeyObject;
  pem: string;
}

/** a key pair and a self-signed cert for it, via the openssl cli — node can
 * parse an X.509 cert but not issue one */
const self_signed = (
  subject: string,
  type: "rsa" | "ed25519" = "rsa"
): ISigner => {
  const { privateKey } =
    type === "rsa"
      ? generateKeyPairSync("rsa", { modulusLength: 2048 })
      : generateKeyPairSync("ed25519");
  const dir = mkdtempSync(join(tmpdir(), "paypal-webhook-test-"));
  try {
    const key_file = join(dir, "key.pem");
    writeFileSync(
      key_file,
      privateKey.export({ type: "pkcs8", format: "pem" }) as string
    );
    const pem = execFileSync(
      "openssl",
      [
        "req",
        "-new",
        "-x509",
        "-key",
        key_file,
        "-subj",
        subject,
        "-days",
        "2",
      ],
      { encoding: "utf8" }
    );
    return { key: privateKey, pem };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// issued in beforeAll, under its 30s timeout: rsa keygen + openssl are slow
let PAYPAL: ISigner;
/** holds a cert whose subject claims to be paypal's — only the url stops it */
let IMPOSTOR: ISigner;
/** a well-formed cert that is not paypal's signing cert */
let STRANGER: ISigner;
/** paypal's subject on a key type the route's sha256 verifier cannot use */
let ED25519: ISigner;

const CERT_URL =
  "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-ab66f33d";
/** the fetch stub serves IMPOSTOR's cert here, PAYPAL's everywhere else */
const IMPOSTOR_CERT_URL =
  "https://attacker.example/v1/notifications/certs/CERT-1";

/** `headers` overrides the defaults; a null drops that header. the body is
 * signed over the final headers, as paypal does, with `signer`'s key; a string
 * `ev` is sent as the raw body */
const deliver = (
  ev: Record<string, unknown> | string,
  headers: Record<string, string | null> = {},
  signer: ISigner = PAYPAL,
  route: typeof action = action
) => {
  const body = typeof ev === "string" ? ev : JSON.stringify(ev);
  const unsigned: Record<string, string | null> = {
    "paypal-transmission-id": "t-1",
    "paypal-transmission-time": "2026-01-01T00:00:00Z",
    "paypal-cert-url": CERT_URL,
    ...headers,
  };
  const message = [
    unsigned["paypal-transmission-id"],
    unsigned["paypal-transmission-time"],
    "wh-1",
    crc32(body),
  ].join("|");
  const merged = {
    "paypal-transmission-sig": createSign("SHA256")
      .update(message)
      .sign(signer.key, "base64"),
    ...unsigned,
  };
  return route({
    request: new Request("https://x/api/paypal-webhook", {
      method: "POST",
      body,
      headers: Object.entries(merged).filter(
        (e): e is [string, string] => e[1] !== null
      ),
    }),
  } as any) as Promise<Response>;
};

/** paypal's own copy of the capture — what the route settles from */
const capture_copy = () => ({
  id: CAPTURE_ID,
  status: "COMPLETED",
  amount: { value: "100.00", currency_code: "USD" },
  create_time: "2026-01-02T00:00:00.000Z",
  custom_id: ORDER_ID,
  seller_receivable_breakdown: {
    gross_amount: { value: "100", currency_code: "USD" },
    net_amount: { value: "96.5", currency_code: "USD" },
    paypal_fee: { value: "3.5" },
  },
});

/** the event announcing it. its amounts are decoys that disagree with
 * paypal's copy, so a settle read off the event body fails every assertion */
const capture_ev = () => ({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: CAPTURE_ID,
    create_time: "2026-01-02T00:00:00.000Z",
    custom_id: ORDER_ID,
    seller_receivable_breakdown: {
      gross_amount: { value: "1", currency_code: "USD" },
      net_amount: { value: "1", currency_code: "USD" },
      paypal_fee: { value: "0" },
    },
  },
});

/** delivers the capture event with `copy` as paypal's copy of the capture */
const deliver_capture = (copy: object) => {
  get_capture_mock.mockResolvedValue(copy);
  return deliver(capture_ev());
};

/** paypal's own copy of the sale */
const sale_copy = () => ({
  id: SALE_ID,
  state: "completed",
  create_time: "2026-01-02T00:00:00.000Z",
  billing_agreement_id: SUBS_ID,
  transaction_fee: { value: "3.5" },
  amount: { total: "100", currency: "USD" },
});

/** the event announcing it, with decoy amounts as for a capture */
const sale_ev = () => ({
  event_type: "PAYMENT.SALE.COMPLETED",
  resource: {
    id: SALE_ID,
    create_time: "2026-01-02T00:00:00.000Z",
    billing_agreement_id: SUBS_ID,
    transaction_fee: { value: "0" },
    amount: { total: "1", currency: "USD" },
  },
});

let npo_id: number;

const seed_donation = async (o: Record<string, unknown> = {}) => {
  const now = "2026-01-01T00:00:00.000Z";
  await donation_put(
    db() as any,
    {
      id: ORDER_ID,
      upusd: 1,
      status: "intent",
      amount: { base: 100, tip: 0, fee_allowance: 0 },
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "paypal",
      to_id: npo_id.toString(),
      to_name: "PP Test NPO",
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

/** the row `settle_npo` inserts once a settle's distribution message lands */
const seed_dist = async (donation_id: string) => {
  await db()
    .insert(dists)
    .values({
      id: `dist-${donation_id}`,
      donation_id,
      status: "settled",
      date_created: "2026-01-02T00:00:00.000Z",
      to_id: npo_id,
      amount_denom: "USD",
      net: 96.5,
    });
};

const settlements = () => db().select().from(donation_settlements);
/** the queue's dedupe keys of the nth enqueue — what makes a re-send a no-op */
const dedupes = (nth: number): string[] =>
  enqueue_mock.mock.calls.at(nth)!.map((m: any) => m.dedupe);
const all_kinds = () =>
  enqueue_mock.mock.calls.flat().map((m: any) => m.id as string);

beforeAll(async () => {
  test_db.current = await create_test_db();
  PAYPAL = self_signed(
    "/O=PayPal, Inc./CN=messageverificationcerts.sandbox.paypal.com"
  );
  IMPOSTOR = self_signed(
    "/O=PayPal, Inc./CN=messageverificationcerts.sandbox.paypal.com"
  );
  STRANGER = self_signed("/CN=certs.example.com");
  ED25519 = self_signed(
    "/O=PayPal, Inc./CN=messageverificationcerts.sandbox.paypal.com",
    "ed25519"
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          String(url) === IMPOSTOR_CERT_URL ? IMPOSTOR.pem : PAYPAL.pem
        )
    )
  );
}, 30_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  before_lock.current = null;
  schedule_mock.mockResolvedValue(undefined);
  process_refund_mock.mockResolvedValue({
    failures: [],
    loss_msgs: [],
    has_loss: false,
    applied: 1,
  });
  get_capture_mock.mockImplementation(async (id: string) => ({
    ...capture_copy(),
    id,
  }));
  get_sale_mock.mockImplementation(async (id: string) => ({
    ...sale_copy(),
    id,
  }));
  get_subscription_mock.mockResolvedValue({
    id: SUBS_ID,
    plan_id: "P-1",
    custom_id: ORDER_ID,
    create_time: "2026-01-01T00:00:00.000Z",
    update_time: "2026-01-01T00:00:00.000Z",
    subscriber: { email_address: "donor@test.com", name: { given_name: "J" } },
    billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
  });
  get_plan_mock.mockResolvedValue({
    id: "P-1",
    product_id: "PROD-1",
    billing_cycles: [
      { frequency: { interval_unit: "MONTH", interval_count: 1 } },
    ],
  });

  await db().delete(dists);
  await db().delete(donation_settlements);
  await db().delete(donation_donors);
  await db().delete(donation_recipients);
  await db().delete(donations);
  await db().delete(subscriptions);
  await db().delete(npos);
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-PP-TEST",
      name: "PP Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      active: true,
      allocation: { liq: 0, lock: 0, cash: 100 },
    })
    .returning();
  npo_id = npo!.id;
});

describe("PAYMENT.CAPTURE.COMPLETED", () => {
  it("settles one capture once when two deliveries race", async () => {
    await seed_donation();

    const [a, b] = await Promise.all([
      deliver(capture_ev()),
      deliver(capture_ev()),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const bodies = [await a.text(), await b.text()];
    expect(bodies.filter((t) => t === "already processed")).toHaveLength(1);

    expect(await settlements()).toHaveLength(1);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("settled");
    expect(don!.settlement!.id).toBe(CAPTURE_ID);
    // the loser recomputes the winner's messages — same dedupe keys, so qstash
    // drops the repeat
    expect(dedupes(1)).toEqual(dedupes(0));
    expect(all_kinds()).toEqual([
      "don-sttl-dist",
      "don-sttl-receipt",
      "don-sttl-dist",
      "don-sttl-receipt",
    ]);
  });

  it("re-queues a settled capture's messages on redelivery", async () => {
    await seed_donation();
    await deliver(capture_ev());
    enqueue_mock.mockClear();

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect(enqueue_mock).toHaveBeenCalledOnce();
    expect(all_kinds()).toEqual(["don-sttl-dist", "don-sttl-receipt"]);
  });

  it("leaves a donation refunded before the lock unsettled", async () => {
    await seed_donation();
    before_lock.current = async (tx, id) => {
      await donation_update(tx, id, { status: "refunded" });
    };

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect(await settlements()).toHaveLength(0);
    expect((await donation_get(ORDER_ID))!.status).toBe("refunded");
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("re-queues the receipt when the distribution landed and it did not", async () => {
    await seed_donation();
    await deliver(capture_ev());
    await seed_dist(ORDER_ID);
    enqueue_mock.mockClear();

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect(all_kinds()).toContain("don-sttl-receipt");
  });

  it("settles a capture paypal charged no fee at its gross", async () => {
    await seed_donation();
    const resource = {
      ...capture_copy(),
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
      },
    };

    const res = await deliver_capture(resource);

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: CAPTURE_ID, net: 100, fee: 0 }),
    ]);
  });

  it("takes platform fees out of a net paypal left off the capture", async () => {
    await seed_donation();
    const resource = {
      ...capture_copy(),
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "2", currency_code: "USD" } }],
      },
    };

    const res = await deliver_capture(resource);

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: CAPTURE_ID, net: 94.5, fee: 3.5 }),
    ]);
  });

  it("settles at paypal's net whatever platform fees ride along", async () => {
    await seed_donation();
    const resource = {
      ...capture_copy(),
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "1.85", currency_code: "EUR" } }],
        net_amount: { value: "94.5", currency_code: "USD" },
      },
    };

    const res = await deliver_capture(resource);

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ net: 94.5, fee: 3.5 }),
    ]);
  });

  it("derives a fallback net to the cent", async () => {
    await seed_donation();
    const resource = {
      ...capture_copy(),
      seller_receivable_breakdown: {
        gross_amount: { value: "50.00", currency_code: "USD" },
        paypal_fee: { value: "2.24", currency_code: "USD" },
        platform_fees: [{ amount: { value: "0.70", currency_code: "USD" } }],
      },
    };

    await deliver_capture(resource);

    expect(await settlements()).toEqual([
      expect.objectContaining({ net: 47.06 }),
    ]);
  });
});

describe("settling from paypal's copy, not the event's", () => {
  it("settles a capture onto the donation paypal names, whatever the event says", async () => {
    await seed_donation();
    await seed_donation({ id: "don-other" });
    const forged = capture_ev();
    forged.resource.custom_id = "don-other";

    const res = await deliver(forged);

    expect(res.status).toBe(200);
    expect(get_capture_mock).toHaveBeenCalledWith(CAPTURE_ID);
    expect(await settlements()).toEqual([
      expect.objectContaining({ donation_id: ORDER_ID, net: 96.5, fee: 3.5 }),
    ]);
    expect((await donation_get("don-other"))!.status).toBe("intent");
  });

  it("settles nothing on a capture paypal says is not complete", async () => {
    await seed_donation();

    const res = await deliver_capture({
      ...capture_copy(),
      status: "DECLINED",
    });

    expect(res.status).toBe(200);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("settles a sale at what paypal says it sold", async () => {
    await seed_donation({ frequency: "monthly" });

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(get_sale_mock).toHaveBeenCalledWith(SALE_ID);
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: SALE_ID, net: 96.5, fee: 3.5 }),
    ]);
  });

  it("reports and asks for redelivery of a capture paypal says it cannot find", async () => {
    await seed_donation();
    get_capture_mock.mockRejectedValue(
      new PayPalApiError("get capture", 404, '{"name":"RESOURCE_NOT_FOUND"}')
    );

    const res = await deliver(capture_ev());

    expect(res.status).toBe(503);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("settles a sale whose completion lands after paypal reversed it, so its reversal finds it", async () => {
    await seed_donation({ frequency: "monthly" });
    get_sale_mock.mockResolvedValue({ ...sale_copy(), state: "reversed" });

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: SALE_ID, net: 96.5, fee: 3.5 }),
    ]);
  });

  it("takes the subscription off the event when paypal's copy of the sale has none", async () => {
    await seed_donation({ frequency: "monthly" });
    const { billing_agreement_id: _, ...copy } = sale_copy();
    get_sale_mock.mockResolvedValue(copy);

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(get_subscription_mock).toHaveBeenCalledWith(SUBS_ID);
    expect((await donation_get(ORDER_ID))!.settlement!.id).toBe(SALE_ID);
  });

  it("reports and asks for redelivery of a sale paypal says it cannot find", async () => {
    await seed_donation({ frequency: "monthly" });
    get_sale_mock.mockRejectedValue(
      new PayPalApiError("get sale", 404, '{"name":"INVALID_RESOURCE_ID"}')
    );

    const res = await deliver(sale_ev());

    expect(res.ok).toBe(false);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });
});

describe("a lookup paypal refuses for good", () => {
  const not_found = (op: string) =>
    new PayPalApiError(op, 404, '{"name":"RESOURCE_NOT_FOUND"}');

  it("settles a capture whose order paypal cannot find, on the donor it has", async () => {
    await seed_donation();
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    });
    get_order_mock.mockRejectedValue(not_found("get order"));

    const res = await deliver(capture_ev());

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
  });

  it.each([
    [
      "subscription",
      () =>
        get_subscription_mock.mockRejectedValue(not_found("get subscription")),
    ],
    ["plan", () => get_plan_mock.mockRejectedValue(not_found("get plan"))],
  ])(
    "acknowledges and reports a sale whose %s paypal cannot find",
    async (_, refuse) => {
      await seed_donation({ frequency: "monthly" });
      refuse();

      const res = await deliver(sale_ev());

      expect(res.status).toBe(200);
      expect(await res.text()).toMatch(/^not routable: /);
      expect(report_error_mock).toHaveBeenCalledOnce();
      expect(await settlements()).toHaveLength(0);
    }
  );
});

describe("PAYMENT.SALE.COMPLETED", () => {
  it("re-queues a settled sale's messages on redelivery", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(all_kinds()).toEqual(["don-sttl-dist", "don-sttl-receipt"]);
  });

  it("asks for redelivery of a settled sale while paypal's api is down", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    get_subscription_mock.mockRejectedValue(new Error("paypal 503"));

    const res = await deliver(sale_ev());

    expect(res.ok).toBe(false);
    expect(enqueue_mock).not.toHaveBeenCalled();
    expect(await settlements()).toHaveLength(1);
  });

  it("answers 200 and reports a settled sale whose subscription paypal 404s", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    get_subscription_mock.mockRejectedValue(
      new PayPalApiError(
        "get subscription",
        404,
        '{"name":"RESOURCE_NOT_FOUND"}'
      )
    );

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(enqueue_mock).not.toHaveBeenCalled();
    // reported as ours to fix: the reporter keeps any error with a 4xx
    // `status` out of sentry
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining(SALE_ID) }),
      { sale_id: SALE_ID, subs_id: SUBS_ID, http_status: 404 }
    );
    expect(report_error_mock.mock.calls[0]![0]).not.toHaveProperty("status");
  });

  it("asks for redelivery of a settled sale while paypal rate-limits the lookup", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    get_subscription_mock.mockRejectedValue(
      new PayPalApiError("get subscription", 429, "{}")
    );

    const res = await deliver(sale_ev());

    expect(res.ok).toBe(false);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("answers 200 for a settled sale whose subscription has no order id", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
    const { custom_id: _, ...sub } = await get_subscription_mock();
    get_subscription_mock.mockResolvedValue(sub);

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(report_error_mock).toHaveBeenCalled();
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("asks for redelivery of a sale that lands before its subscription activates", async () => {
    await seed_donation({ frequency: "monthly" });
    const { billing_info: _, ...active } = await get_subscription_mock();
    get_subscription_mock.mockResolvedValue({ ...active, status: "APPROVED" });

    const early = await deliver(sale_ev());

    expect(early.ok).toBe(false);
    expect(await settlements()).toHaveLength(0);
    expect(enqueue_mock).not.toHaveBeenCalled();

    get_subscription_mock.mockResolvedValue({
      ...active,
      status: "ACTIVE",
      billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
    });
    const redelivered = await deliver(sale_ev());

    expect(redelivered.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.settlement!.id).toBe(SALE_ID);
  });

  it("settles a sale paypal charged no fee at its total", async () => {
    await seed_donation({ frequency: "monthly" });
    const { transaction_fee: _, ...resource } = sale_copy();
    get_sale_mock.mockResolvedValue(resource);

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: SALE_ID, net: 100, fee: 0 }),
    ]);
  });

  it("settles one first-recurring sale once when two deliveries race", async () => {
    await seed_donation({ frequency: "monthly" });

    const [a, b] = await Promise.all([deliver(sale_ev()), deliver(sale_ev())]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await settlements()).toHaveLength(1);
    expect(await db().select().from(donations)).toHaveLength(1);
    const don = await donation_get(ORDER_ID);
    expect(don!.status).toBe("settled");
    expect(don!.settlement!.id).toBe(SALE_ID);
    expect(all_kinds()).toEqual([
      "don-sttl-dist",
      "don-sttl-receipt",
      "don-sttl-dist",
      "don-sttl-receipt",
    ]);
  });
});

const approved_ev = () => ({
  event_type: "CHECKOUT.ORDER.APPROVED",
  resource: {
    id: "ORDER-1",
    payment_source: { paypal: { email_address: "payer@test.com" } },
    purchase_units: [{ custom_id: ORDER_ID }],
  },
});

describe("CHECKOUT.ORDER.APPROVED", () => {
  it("writes the payer and schedules a capture check, rather than racing the browser's capture", async () => {
    await seed_donation({ from_email: "anon@x.com" });
    const before = Date.now();

    const res = await deliver(approved_ev());

    expect(res.status).toBe(200);
    expect(capture_order_mock).not.toHaveBeenCalled();
    expect(schedule_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: "paypal-order-capture",
        payload: {
          order_id: "ORDER-1",
          don_id: ORDER_ID,
          scheduled_at: expect.any(String),
        },
        delay_s: expect.any(Number),
      })
    );
    // the handler tells its retries from its first attempt by this stamp
    const { scheduled_at } = schedule_mock.mock.calls[0]![0].payload;
    expect(Date.parse(scheduled_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(scheduled_at)).toBeLessThanOrEqual(Date.now());
    expect(schedule_mock.mock.calls[0]![0].delay_s).toBeGreaterThanOrEqual(60);
    expect((await donation_get(ORDER_ID))!.from_email).toBe("payer@test.com");
  });

  it.each([
    ["no payment source", {}],
    ["a payer with no email", { payment_source: { venmo: {} } }],
  ])(
    "schedules the capture check for an order approved with %s, keeping the donor it has",
    async (_, payer) => {
      await seed_donation();
      const ev = approved_ev();
      const { payment_source: __, ...rest } = ev.resource;

      const res = await deliver({ ...ev, resource: { ...rest, ...payer } });

      expect(res.status).toBe(200);
      expect(report_error_mock).not.toHaveBeenCalled();
      expect(schedule_mock).toHaveBeenCalledOnce();
      expect((await donation_get(ORDER_ID))!.from_email).toBe("donor@test.com");
    }
  );

  it("asks for redelivery while the check can't be scheduled", async () => {
    await seed_donation();
    schedule_mock.mockRejectedValue(new Error("qstash 503"));

    const res = await deliver(approved_ev());

    expect(res.ok).toBe(false);
  });
});

describe("refunds and reversals", () => {
  const capture_refund_ev = (event_type = "PAYMENT.CAPTURE.REFUNDED") => ({
    id: "WH-REF-1",
    event_type,
    resource: {
      id: "REF-1",
      status: "COMPLETED",
      amount: { value: "100", currency_code: "USD" },
      links: [
        {
          rel: "up",
          method: "GET",
          href: `https://api.sandbox.paypal.com/v2/payments/captures/${CAPTURE_ID}`,
        },
      ],
    },
  });
  const sale_refund_ev = (event_type = "PAYMENT.SALE.REFUNDED") => ({
    id: "WH-REF-2",
    event_type,
    resource: { id: "REF-2", state: "completed", sale_id: SALE_ID },
  });
  const settled_capture = async () => {
    await seed_donation();
    await deliver(capture_ev());
    await seed_dist(ORDER_ID);
  };
  const paypal_capture_is = (status: string) =>
    get_capture_mock.mockResolvedValue({ ...capture_copy(), status });

  it.each(["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"])(
    "reverses a donation whose capture %s in full",
    async (event_type) => {
      await settled_capture();
      paypal_capture_is("REFUNDED");

      const res = await deliver(capture_refund_ev(event_type));

      expect(res.status).toBe(200);
      expect(get_capture_mock).toHaveBeenLastCalledWith(CAPTURE_ID);
      expect(process_refund_mock).toHaveBeenCalledExactlyOnceWith(
        ORDER_ID,
        [
          expect.objectContaining({
            dist: expect.objectContaining({ donation_id: ORDER_ID }),
          }),
        ],
        expect.objectContaining({ alert_from: "paypal-refund" })
      );
    }
  );

  it("reports a partial refund to ops and reverses nothing", async () => {
    await settled_capture();
    paypal_capture_is("PARTIALLY_REFUNDED");

    const res = await deliver(capture_refund_ev());

    expect(res.status).toBe(200);
    expect(process_refund_mock).not.toHaveBeenCalled();
    // queued under the event's id, so a duplicate delivery is one notice
    const [notice] = enqueue_mock.mock.calls.at(-1)!;
    expect(notice).toMatchObject({
      id: "fiat-notice",
      dedupe: "fiat.notice_paypal-partial_WH-REF-1",
      payload: { alert: { title: "Partial Refund Not Reversed" } },
    });
    expect(notice.payload.alert.body).toContain(CAPTURE_ID);
  });

  it("reverses a chargeback of the whole capture, whatever status paypal leaves on it", async () => {
    await settled_capture();
    paypal_capture_is("COMPLETED");

    const res = await deliver(capture_refund_ev("PAYMENT.CAPTURE.REVERSED"));

    expect(res.status).toBe(200);
    expect(process_refund_mock).toHaveBeenCalledOnce();
  });

  it("reports a chargeback of part of the capture and reverses nothing", async () => {
    await settled_capture();
    paypal_capture_is("COMPLETED");
    const ev = capture_refund_ev("PAYMENT.CAPTURE.REVERSED");
    ev.resource.amount.value = "-40.00";

    const res = await deliver(ev);

    expect(res.status).toBe(200);
    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(enqueue_mock.mock.calls.at(-1)![0].id).toBe("fiat-notice");
  });

  it("reverses a chargeback of what a partial refund left, once the two take the whole capture", async () => {
    await settled_capture();
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      status: "PARTIALLY_REFUNDED",
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    });
    get_order_mock.mockResolvedValue({
      id: "ORDER-1",
      purchase_units: [
        {
          payments: {
            captures: [{ id: CAPTURE_ID }],
            refunds: [
              {
                id: "REF-0",
                status: "COMPLETED",
                amount: { value: "40.00", currency_code: "USD" },
              },
            ],
          },
        },
      ],
    });
    const ev = capture_refund_ev("PAYMENT.CAPTURE.REVERSED");
    ev.resource.amount.value = "-60.00";

    const res = await deliver(ev);

    expect(res.status).toBe(200);
    expect(get_order_mock).toHaveBeenLastCalledWith("ORDER-1");
    expect(process_refund_mock).toHaveBeenCalledOnce();
  });

  /** a capture partly refunded before, so sizing a chargeback of -60 needs
   * the refunds its order lists */
  const partly_refunded_capture = () =>
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      status: "PARTIALLY_REFUNDED",
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    });
  const partial_chargeback_ev = () => {
    const ev = capture_refund_ev("PAYMENT.CAPTURE.REVERSED");
    ev.resource.amount.value = "-60.00";
    return ev;
  };

  it.each([
    ["a 5xx", new PayPalApiError("get order", 503, "{}")],
    ["a rate limit", new PayPalApiError("get order", 429, "{}")],
    ["a timeout", new PayPalApiError("get order", 408, "{}")],
    ["the network", new TypeError("fetch failed")],
  ])(
    "redelivers a chargeback whose order lookup fails on %s, reversing and reporting nothing as partial",
    async (_, failure) => {
      await settled_capture();
      partly_refunded_capture();
      get_order_mock.mockRejectedValue(failure);
      enqueue_mock.mockClear();
      report_error_mock.mockClear();

      const res = await deliver(partial_chargeback_ev());

      expect(res.status).toBe(503);
      expect(process_refund_mock).not.toHaveBeenCalled();
      expect(enqueue_mock).not.toHaveBeenCalled();
      expect(report_error_mock).toHaveBeenCalledOnce();
    }
  );

  // no redelivery gets the order back, so holding the event buys 25 refusals
  it("tells ops a chargeback whose order paypal refuses for good can't be sized, reverses nothing, and acknowledges", async () => {
    await settled_capture();
    partly_refunded_capture();
    get_order_mock.mockRejectedValue(
      new PayPalApiError("get order", 404, '{"name":"RESOURCE_NOT_FOUND"}')
    );
    enqueue_mock.mockClear();
    report_error_mock.mockClear();

    const res = await deliver(partial_chargeback_ev());

    expect(res.status).toBe(200);
    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(report_error_mock).toHaveBeenCalledOnce();
    const [notice] = enqueue_mock.mock.calls.at(-1)!;
    expect(notice).toMatchObject({
      id: "fiat-notice",
      dedupe: "fiat.notice_paypal-unsized_WH-REF-1",
      payload: { alert: { title: "Reversal Not Sized" } },
    });
    expect(notice.payload.alert.body).toContain(CAPTURE_ID);
    expect(notice.payload.alert.body).toContain("by hand");
  });

  it("reverses a chargeback that alone takes the whole capture, without the order", async () => {
    await settled_capture();
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    });
    get_order_mock.mockClear();
    const ev = capture_refund_ev("PAYMENT.CAPTURE.REVERSED");
    ev.resource.amount.value = "-100.00";

    const res = await deliver(ev);

    expect(res.status).toBe(200);
    expect(get_order_mock).not.toHaveBeenCalled();
    expect(process_refund_mock).toHaveBeenCalledOnce();
  });

  it("reverses a chargeback of a capture paypal already reads refunded, without the order", async () => {
    await settled_capture();
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      status: "REFUNDED",
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    });
    get_order_mock.mockRejectedValue(new Error("paypal 503"));
    get_order_mock.mockClear();

    const res = await deliver(capture_refund_ev("PAYMENT.CAPTURE.REVERSED"));

    expect(res.status).toBe(200);
    expect(get_order_mock).not.toHaveBeenCalled();
    expect(process_refund_mock).toHaveBeenCalledOnce();
  });

  it("reverses a sale paypal reports reversed as the sale itself", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    await seed_dist(ORDER_ID);
    get_sale_mock.mockResolvedValue({ ...sale_copy(), state: "reversed" });

    const res = await deliver({
      id: "WH-REV-3",
      event_type: "PAYMENT.SALE.REVERSED",
      resource_type: "sale",
      resource: { id: SALE_ID, state: "reversed" },
    });

    expect(res.status).toBe(200);
    expect(get_sale_mock).toHaveBeenLastCalledWith(SALE_ID);
    expect(process_refund_mock).toHaveBeenCalledOnce();
  });

  it("asks for redelivery when some dists failed to reverse", async () => {
    await settled_capture();
    paypal_capture_is("REFUNDED");
    process_refund_mock.mockResolvedValue({
      failures: ["dist x: db timeout"],
      loss_msgs: [],
      has_loss: false,
      applied: 0,
    });

    const res = await deliver(capture_refund_ev());

    expect(res.ok).toBe(false);
  });

  it("reports and acknowledges a refund of a charge no donation here owns", async () => {
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      status: "REFUNDED",
      custom_id: "not-ours",
    });

    const res = await deliver(capture_refund_ev());

    expect(res.status).toBe(200);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(process_refund_mock).not.toHaveBeenCalled();
  });

  it("reverses a subscription charge paypal refunded in full", async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    await seed_dist(ORDER_ID);
    get_sale_mock.mockResolvedValue({ ...sale_copy(), state: "refunded" });

    const res = await deliver(sale_refund_ev());

    expect(res.status).toBe(200);
    expect(get_sale_mock).toHaveBeenLastCalledWith(SALE_ID);
    expect(process_refund_mock).toHaveBeenCalledExactlyOnceWith(
      ORDER_ID,
      [expect.anything()],
      expect.anything()
    );
  });

  it("acknowledges a refund on a donation already reversed", async () => {
    await settled_capture();
    await donation_update(db() as any, ORDER_ID, { status: "refunded" });
    paypal_capture_is("REFUNDED");

    const res = await deliver(capture_refund_ev());

    expect(res.status).toBe(200);
    expect(process_refund_mock).not.toHaveBeenCalled();
  });

  it("asks for redelivery of a refund whose capture has not settled here yet", async () => {
    await seed_donation();
    paypal_capture_is("REFUNDED");

    const res = await deliver(capture_refund_ev());

    expect(res.ok).toBe(false);
    expect(process_refund_mock).not.toHaveBeenCalled();
  });
});

describe("subscription lifecycle", () => {
  const sub_row = async () =>
    (
      await db()
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, SUBS_ID))
    )[0];
  const active_sub = async () => {
    await seed_donation({ frequency: "monthly" });
    await deliver(sale_ev());
    enqueue_mock.mockClear();
  };
  const paypal_sub_is = async (status: string, next_billing?: string) => {
    const { billing_info: _, ...sub } = await get_subscription_mock();
    get_subscription_mock.mockResolvedValue({
      ...sub,
      status,
      ...(next_billing && {
        billing_info: { next_billing_time: next_billing },
      }),
    });
  };
  const lifecycle_ev = (event_type: string) => ({
    id: `WH-${event_type}`,
    event_type,
    resource: { id: SUBS_ID, status: "IGNORED-read-from-paypal" },
  });

  it.each([
    ["BILLING.SUBSCRIPTION.CANCELLED", "CANCELLED"],
    ["BILLING.SUBSCRIPTION.SUSPENDED", "SUSPENDED"],
    ["BILLING.SUBSCRIPTION.EXPIRED", "EXPIRED"],
  ])(
    "marks a subscription inactive on %s, without cancelling it again",
    async (event_type, status) => {
      await active_sub();
      await paypal_sub_is(status);

      const res = await deliver(lifecycle_ev(event_type));

      expect(res.status).toBe(200);
      expect((await sub_row())!.status).toBe("inactive");
      expect(enqueue_mock).not.toHaveBeenCalled();
    }
  );

  it("brings a suspended subscription back when paypal reactivates it", async () => {
    await active_sub();
    await paypal_sub_is("SUSPENDED");
    await deliver(lifecycle_ev("BILLING.SUBSCRIPTION.SUSPENDED"));
    await paypal_sub_is("ACTIVE", "2026-04-01T00:00:00.000Z");

    const res = await deliver(
      lifecycle_ev("BILLING.SUBSCRIPTION.RE-ACTIVATED")
    );

    expect(res.status).toBe(200);
    expect(await sub_row()).toMatchObject({
      status: "active",
      next_billing: "2026-04-01T00:00:00.000Z",
    });
  });

  it("moves next billing on after a failed payment paypal will retry", async () => {
    await active_sub();
    await paypal_sub_is("ACTIVE", "2026-02-06T00:00:00.000Z");

    const res = await deliver(
      lifecycle_ev("BILLING.SUBSCRIPTION.PAYMENT.FAILED")
    );

    expect(res.status).toBe(200);
    expect(await sub_row()).toMatchObject({
      status: "active",
      next_billing: "2026-02-06T00:00:00.000Z",
    });
  });

  it("moves next billing on with every charge", async () => {
    await active_sub();
    await paypal_sub_is("ACTIVE", "2026-03-01T00:00:00.000Z");
    const next = sale_ev();
    next.resource.id = "sale-2";

    const res = await deliver(next);

    expect(res.status).toBe(200);
    expect((await sub_row())!.next_billing).toBe("2026-03-01T00:00:00.000Z");
  });

  it("settles a rebill paypal took before the donor cancelled", async () => {
    await active_sub();
    await paypal_sub_is("CANCELLED");
    const rebill = sale_ev();
    rebill.resource.id = "sale-2";
    get_sale_mock.mockResolvedValue({ ...sale_copy(), id: "sale-2" });

    const res = await deliver(rebill);

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sttl_id: "sale-2", net: 96.5, fee: 3.5 }),
      ])
    );
    expect(await sub_row()).toMatchObject({
      next_billing: "2026-02-01T00:00:00.000Z",
    });
  });

  it("settles a first sale on a subscription that has expired since, recording it inactive", async () => {
    await seed_donation({ frequency: "monthly" });
    await paypal_sub_is("EXPIRED");

    const res = await deliver(sale_ev());

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect((await donation_get(ORDER_ID))!.settlement!.id).toBe(SALE_ID);
    expect((await sub_row())!.status).toBe("inactive");
  });

  it("asks for redelivery of a cancellation that lands before the subscription does", async () => {
    await seed_donation({ frequency: "monthly" });
    await paypal_sub_is("CANCELLED");

    const res = await deliver(lifecycle_ev("BILLING.SUBSCRIPTION.CANCELLED"));

    expect(res.ok).toBe(false);
  });
});

describe("PAYMENT.CAPTURE.DENIED", () => {
  const denied_ev = () => ({
    event_type: "PAYMENT.CAPTURE.DENIED",
    resource: { id: CAPTURE_ID, status: "DECLINED", custom_id: ORDER_ID },
  });

  it("fails the donation and alerts ops once, however often it is delivered", async () => {
    await seed_donation();

    const first = await deliver(denied_ev());
    const again = await deliver(denied_ev());

    expect([first.status, again.status]).toEqual([200, 200]);
    expect((await donation_get(ORDER_ID))!.status).toBe("failed");
    expect(send_alert_mock).toHaveBeenCalledOnce();
    expect(send_alert_mock.mock.calls[0]![0].body).toContain(CAPTURE_ID);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("leaves a settled donation settled", async () => {
    await seed_donation();
    await deliver(capture_ev());

    const res = await deliver(denied_ev());

    expect(res.status).toBe(200);
    expect((await donation_get(ORDER_ID))!.status).toBe("settled");
  });
});

describe("PAYMENT.CAPTURE.PENDING", () => {
  it("reports why paypal is holding the capture and leaves the donation as it was", async () => {
    await seed_donation();

    const res = await deliver({
      event_type: "PAYMENT.CAPTURE.PENDING",
      resource: {
        id: CAPTURE_ID,
        status: "PENDING",
        custom_id: ORDER_ID,
        status_details: {
          reason: "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION",
        },
      },
    });

    expect(res.status).toBe(200);
    expect(report_degraded_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("pending") }),
      {
        capture_id: CAPTURE_ID,
        don_id: ORDER_ID,
        reason: "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION",
      }
    );
    expect((await donation_get(ORDER_ID))!.status).toBe("intent");
  });
});

// the route caches each cert by url for the life of the module, so a case that
// needs the download to run takes a url no other case has fetched
describe("signature verification", () => {
  it("reports paypal's cert host erroring as degraded, naming the delivery, then settles the redelivery", async () => {
    await seed_donation();
    const ev = { ...capture_ev(), id: "WH-5XX" };
    const cert_url = { "paypal-cert-url": `${CERT_URL}-5xx` };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("unavailable", { status: 503 })
    );

    const down = await deliver(ev, cert_url);

    expect(down.status).toBe(503);
    expect(await down.text()).toBe("signature unverifiable");
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(report_degraded_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "CertHostUnreachable",
        message:
          "[paypal webhook] cert host api.sandbox.paypal.com answered 503",
      }),
      {
        unverified: {
          transmission_id: "t-1",
          event_id: "WH-5XX",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          cert_host: "api.sandbox.paypal.com",
        },
      }
    );
    expect(await settlements()).toHaveLength(0);

    const redelivered = await deliver(ev, cert_url);

    expect(redelivered.status).toBe(200);
    expect(await settlements()).toHaveLength(1);
  });

  it("reports paypal's cert host rate-limiting as degraded, and asks for redelivery", async () => {
    await seed_donation();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("slow down", { status: 429 })
    );

    const res = await deliver(capture_ev(), {
      "paypal-cert-url": `${CERT_URL}-429`,
    });

    expect(res.status).toBe(503);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(report_degraded_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "CertHostUnreachable",
        message:
          "[paypal webhook] cert host api.sandbox.paypal.com answered 429",
      }),
      { unverified: expect.objectContaining({ transmission_id: "t-1" }) }
    );
  });

  // a 4xx is not the host shedding load, so it is triaged as a bug; the 503
  // holds the event while someone looks
  it("reports a 4xx from paypal's cert host to sentry as a bug, naming the status and host, and asks for redelivery", async () => {
    await seed_donation();
    report_error_mock.mockImplementationOnce(real_report_error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<html>cert body</html>", { status: 404 })
    );

    const res = await deliver(capture_ev(), {
      "paypal-cert-url": `${CERT_URL}-404`,
    });

    expect(res.status).toBe(503);
    expect(report_degraded_mock).not.toHaveBeenCalled();
    expect(sentry_capture_mock).toHaveBeenCalledOnce();
    const [reported, hint] = sentry_capture_mock.mock.calls[0]!;
    expect(hint).toMatchObject({
      level: "error",
      tags: { report: "bug" },
      extra: {
        unverified: expect.objectContaining({ transmission_id: "t-1" }),
      },
    });
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toMatch(/404/);
    expect(reported.message).toContain("api.sandbox.paypal.com");
    expect(reported.message).not.toContain("/v1/notifications/certs/");
    expect(reported.message).not.toContain("cert body");
    expect(await settlements()).toHaveLength(0);
  });

  it("does not follow a redirect off paypal's cert url, reports it as a bug, and asks for redelivery", async () => {
    await seed_donation();
    // a followed redirect lands on IMPOSTOR's cert
    vi.mocked(fetch).mockImplementationOnce(async (_, init) => {
      if (init?.redirect === "manual")
        return new Response(null, {
          status: 302,
          headers: { location: IMPOSTOR_CERT_URL },
        });
      if (init?.redirect === "error")
        throw new TypeError("fetch failed", {
          cause: new Error("unexpected redirect"),
        });
      return new Response(IMPOSTOR.pem);
    });

    const res = await deliver(
      capture_ev(),
      { "paypal-cert-url": `${CERT_URL}-redirect` },
      IMPOSTOR
    );

    expect(res.status).toBe(503);
    expect(report_degraded_mock).not.toHaveBeenCalled();
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message:
          "[paypal webhook] cert host api.sandbox.paypal.com answered 302",
      }),
      { unverified: expect.objectContaining({ transmission_id: "t-1" }) }
    );
    expect(await settlements()).toHaveLength(0);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it("reports a cert download that fails on the network as degraded, naming the delivery as unverified, and asks for redelivery", async () => {
    await seed_donation();
    const network = new TypeError("fetch failed");
    vi.mocked(fetch).mockRejectedValueOnce(network);

    const res = await deliver(
      { ...capture_ev(), id: "WH-UNREACHABLE" },
      {
        "paypal-cert-url": `${CERT_URL}-unreachable`,
        "paypal-transmission-id": "t-unreachable",
      }
    );

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("signature unverifiable");
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(report_degraded_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message:
          "[paypal webhook] cert host api.sandbox.paypal.com unreachable",
        cause: network,
      }),
      {
        unverified: {
          transmission_id: "t-unreachable",
          event_id: "WH-UNREACHABLE",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          cert_host: "api.sandbox.paypal.com",
        },
      }
    );
    expect(await settlements()).toHaveLength(0);
  });

  // the fetch's timeout signal also covers the body stream, so a host that
  // sends headers and stalls times out in the read
  it.each([
    ["connecting", (timeout: DOMException) => Promise.reject(timeout)],
    [
      "reading the body",
      async (timeout: DOMException) =>
        new Response(new ReadableStream({ start: (c) => c.error(timeout) })),
    ],
  ])(
    "reports paypal's cert host timing out while %s as degraded, and asks for redelivery",
    async (when, respond) => {
      await seed_donation();
      const timeout = new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError"
      );
      vi.mocked(fetch).mockImplementationOnce(() => respond(timeout));

      const res = await deliver(capture_ev(), {
        "paypal-cert-url": `${CERT_URL}-timeout-${when.replaceAll(" ", "-")}`,
      });

      expect(res.status).toBe(503);
      expect(report_error_mock).not.toHaveBeenCalled();
      expect(report_degraded_mock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: "CertHostUnreachable",
          message:
            "[paypal webhook] cert host api.sandbox.paypal.com unreachable",
          cause: timeout,
        }),
        { unverified: expect.objectContaining({ transmission_id: "t-1" }) }
      );
      expect(await settlements()).toHaveLength(0);
    }
  );

  it("reports a cert outage on a body that does not parse as degraded, naming the transmission", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("unavailable", { status: 502 })
    );

    const res = await deliver("{not json", {
      "paypal-cert-url": `${CERT_URL}-garbled-body`,
      "paypal-transmission-id": "t-garbled",
    });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("signature unverifiable");
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(report_degraded_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message:
          "[paypal webhook] cert host api.sandbox.paypal.com answered 502",
      }),
      {
        unverified: {
          transmission_id: "t-garbled",
          event_id: null,
          event_type: null,
          cert_host: "api.sandbox.paypal.com",
        },
      }
    );
  });

  it("rejects a cert hosted off paypal without fetching it, even when it verifies", async () => {
    await seed_donation();

    const res = await deliver(
      capture_ev(),
      { "paypal-cert-url": IMPOSTOR_CERT_URL },
      IMPOSTOR
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("invalid signature");
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "[paypal webhook] cert url is not paypal's",
      }),
      {
        unverified: {
          transmission_id: "t-1",
          event_id: null,
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          cert_host: "attacker.example",
        },
      }
    );
    expect(await settlements()).toHaveLength(0);
    expect(enqueue_mock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "over http",
      "http://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "api.sandbox.paypal.com",
    ],
    [
      "off the certs path",
      "https://api.sandbox.paypal.com/v1/uploads/cert.pem",
      "api.sandbox.paypal.com",
    ],
    [
      "climbing out of the certs path",
      "https://api.sandbox.paypal.com/v1/notifications/certs/../../uploads/c",
      "api.sandbox.paypal.com",
    ],
    [
      "on live's host from sandbox",
      "https://api.paypal.com/v1/notifications/certs/CERT-1",
      "api.paypal.com",
    ],
    [
      "on the rest client's api-m host",
      "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "api-m.sandbox.paypal.com",
    ],
    [
      "on a non-default port",
      "https://api.sandbox.paypal.com:8443/v1/notifications/certs/CERT-1",
      "api.sandbox.paypal.com:8443",
    ],
    [
      "carrying credentials",
      "https://user:pass@api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "api.sandbox.paypal.com",
    ],
    [
      "carrying only a password",
      "https://:pass@api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "api.sandbox.paypal.com",
    ],
    [
      "carrying a query",
      "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1?x=1",
      "api.sandbox.paypal.com",
    ],
    [
      "carrying a fragment",
      "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1#f",
      "api.sandbox.paypal.com",
    ],
    ["that does not parse", "not a url", null],
  ])(
    "rejects a cert url %s without fetching it",
    async (_, cert_url, cert_host) => {
      await seed_donation();

      const res = await deliver(capture_ev(), { "paypal-cert-url": cert_url });

      expect(fetch).not.toHaveBeenCalled();
      expect(res.status).toBe(201);
      expect(await res.text()).toBe("invalid signature");
      expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          message: "[paypal webhook] cert url is not paypal's",
        }),
        {
          unverified: {
            transmission_id: "t-1",
            event_id: null,
            event_type: "PAYMENT.CAPTURE.COMPLETED",
            cert_host,
          },
        }
      );
      expect(await settlements()).toHaveLength(0);
    }
  );

  it("asks for redelivery, reporting once, while PAYPAL_API_URL maps to no cert host", async () => {
    await seed_donation();
    const configured = paypal_env.api_url;
    paypal_env.api_url = "https://api.example.com";
    vi.resetModules();
    const { action: misconfigured } = await import("./route");
    paypal_env.api_url = configured;

    const res = await deliver(capture_ev(), {}, PAYPAL, misconfigured);

    expect(fetch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "[paypal webhook] cert host is not configured",
      }),
      { api_host: "api.example.com" }
    );
    expect(await settlements()).toHaveLength(0);
  });

  // a 200 that isn't a cert is not the host shedding load: triaged as a bug
  it("reports paypal's cert url answering 200 with no certificate as a bug, asks for redelivery, and caches nothing", async () => {
    await seed_donation();
    const cert_url = `${CERT_URL}-not-a-cert`;
    vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>ok</html>"));

    const garbled = await deliver(capture_ev(), {
      "paypal-cert-url": cert_url,
    });

    expect(garbled.status).toBe(503);
    expect(report_degraded_mock).not.toHaveBeenCalled();
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "ERR_OSSL_PEM_NO_START_LINE" }),
      { unverified: expect.objectContaining({ transmission_id: "t-1" }) }
    );
    expect(await settlements()).toHaveLength(0);

    const redelivered = await deliver(capture_ev(), {
      "paypal-cert-url": cert_url,
    });

    expect(redelivered.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u))).toEqual([
      cert_url,
      cert_url,
    ]);
    expect(await settlements()).toHaveLength(1);
  });

  it("reports paypal's cert url serving a cert not issued to paypal's signer as a bug, naming the delivery, and asks for redelivery", async () => {
    await seed_donation();
    const cert_url = `${CERT_URL}-stranger`;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(STRANGER.pem));

    const res = await deliver(
      { ...capture_ev(), id: "WH-STRANGER" },
      { "paypal-cert-url": cert_url },
      STRANGER
    );

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("signature unverifiable");
    expect(report_degraded_mock).not.toHaveBeenCalled();
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "[paypal webhook] cert is not paypal's signing cert",
      }),
      {
        unverified: {
          transmission_id: "t-1",
          event_id: "WH-STRANGER",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          cert_host: "api.sandbox.paypal.com",
        },
      }
    );
    expect(await settlements()).toHaveLength(0);
  });

  it("asks for redelivery once paypal's cert has expired, cached or not", async () => {
    await seed_donation();
    // prime the cache with the cert while it is current
    await deliver({ event_type: "PING" });
    // the test certs are issued for 2 days
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000);

    try {
      const res = await deliver(capture_ev());

      expect(res.status).toBe(503);
      expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          message: "[paypal webhook] paypal's signing cert is not current",
        }),
        { unverified: expect.objectContaining({ transmission_id: "t-1" }) }
      );
      expect(await settlements()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for redelivery and reports when verifying throws rather than fails", async () => {
    await seed_donation();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(ED25519.pem));

    const res = await deliver(capture_ev(), {
      "paypal-cert-url": `${CERT_URL}-ed25519`,
    });

    expect(res.status).toBe(503);
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "ERR_CRYPTO_UNSUPPORTED_OPERATION" }),
      { unverified: expect.objectContaining({ transmission_id: "t-1" }) }
    );
    expect(await settlements()).toHaveLength(0);
  });

  // a redelivery repeats the same headers and signature, so neither case below
  // can come right on retry
  it("acknowledges and reports a delivery whose signature does not verify", async () => {
    await seed_donation();

    const res = await deliver({ ...capture_ev(), id: "WH-BAD" }, {}, STRANGER);

    expect(res.status).toBe(201);
    expect(await res.text()).toBe("invalid signature");
    // were the fault ours (a wrong PAYPAL_WEBHOOK_ID), every event lands here
    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "[paypal webhook] signature does not verify",
      }),
      {
        unverified: {
          transmission_id: "t-1",
          event_id: "WH-BAD",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          cert_host: "api.sandbox.paypal.com",
        },
      }
    );
    expect(await settlements()).toHaveLength(0);
  });

  it("cuts each unverified id it reports to 128 characters", async () => {
    const long = (c: string) => c.repeat(4096);

    await deliver(
      { id: long("e"), event_type: long("y") },
      { "paypal-transmission-id": long("t") },
      STRANGER
    );

    expect(report_error_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "[paypal webhook] signature does not verify",
      }),
      {
        unverified: {
          transmission_id: "t".repeat(128),
          event_id: "e".repeat(128),
          event_type: "y".repeat(128),
          cert_host: "api.sandbox.paypal.com",
        },
      }
    );
  });

  it("acknowledges a delivery missing a signature header, unreported", async () => {
    await seed_donation();

    const res = await deliver(capture_ev(), {
      "paypal-transmission-sig": null,
    });

    expect(res.status).toBe(201);
    expect(await res.text()).toBe("missing paypal-transmission-sig");
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toHaveLength(0);
  });
});

// a non-2xx buys up to 25 redeliveries over 3 days; a payload missing what the
// route needs arrives identical every time, so it is reported and acknowledged
describe("an event no redelivery can route", () => {
  it("acknowledges and reports a capture with no donation id", async () => {
    await seed_donation();
    const { custom_id: _, ...resource } = capture_copy();

    const res = await deliver_capture(resource);

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports a capture with no gross amount", async () => {
    await seed_donation();
    const resource = {
      ...capture_copy(),
      seller_receivable_breakdown: {
        net_amount: { value: "96.5", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
      },
    };

    const res = await deliver_capture(resource);

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports a capture with no net and a platform fee in another currency", async () => {
    await seed_donation();
    const resource = {
      ...capture_copy(),
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "2", currency_code: "EUR" } }],
      },
    };

    const res = await deliver_capture(resource);

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports an approved order with no donation id", async () => {
    await seed_donation();

    const res = await deliver({
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: {
        id: "ORDER-1",
        payment_source: { paypal: { email_address: "payer@test.com" } },
        purchase_units: [{}],
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect((await donation_get(ORDER_ID))!.from_email).toBe("donor@test.com");
  });

  it("acknowledges and reports an activated subscription with no donation id", async () => {
    await seed_donation({ frequency: "monthly" });

    const res = await deliver({
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: {
        id: SUBS_ID,
        plan_id: "P-1",
        subscriber: { email_address: "subscriber@test.com" },
        billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await db().select().from(subscriptions)).toHaveLength(0);
  });

  it("acknowledges and reports a sale with no subscription id", async () => {
    await seed_donation({ frequency: "monthly" });
    const { billing_agreement_id: _, ...copy } = sale_copy();
    get_sale_mock.mockResolvedValue(copy);
    const { billing_agreement_id: __, ...resource } = sale_ev().resource;

    const res = await deliver({ ...sale_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("asks for redelivery of a capture whose donation row is not there yet", async () => {
    const res = await deliver(capture_ev());

    expect(res.ok).toBe(false);
    expect(await settlements()).toHaveLength(0);
  });
});

describe("logging", () => {
  const DONOR = {
    email: "payer-pii@example.com",
    given_name: "Janepii",
    surname: "Payerpii",
    line_1: "742 Piistreet Ave",
  };
  const donor_name = { given_name: DONOR.given_name, surname: DONOR.surname };
  const donor_address = {
    address_line_1: DONOR.line_1,
    admin_area_2: "Springfield",
    postal_code: "12345",
    country_code: "US",
  };
  const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

  let spies: { mock: { calls: unknown[][] } }[];
  beforeEach(() => {
    spies = CONSOLE_METHODS.map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );
  });

  /** every console call's and report's arguments, deeply rendered — inspect
   * reaches an Error's message, cause and own props where JSON drops them */
  const logged_text = () =>
    [...spies, report_error_mock, report_degraded_mock]
      .flatMap((s) => s.mock.calls.flat())
      .map((a) => (typeof a === "string" ? a : inspect(a, { depth: null })))
      .join("\n");

  const expect_no_donor_pii = () => {
    const text = logged_text();
    expect(text).not.toBe("");
    for (const v of Object.values(DONOR)) expect(text).not.toContain(v);
  };

  it("keeps the payer out of the log of an approved order", async () => {
    await seed_donation();

    const res = await deliver({
      id: "WH-1",
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: {
        id: "ORDER-1",
        payment_source: {
          paypal: {
            email_address: DONOR.email,
            name: donor_name,
            address: donor_address,
          },
        },
        purchase_units: [{ custom_id: ORDER_ID }],
      },
    });

    expect(res.status).toBe(200);
    expect_no_donor_pii();
  });

  it("keeps the payer out of the log of a completed capture", async () => {
    await seed_donation();
    get_order_mock.mockResolvedValue({
      id: "ORDER-1",
      payment_source: {
        paypal: {
          email_address: DONOR.email,
          name: donor_name,
          address: donor_address,
        },
      },
    });
    get_capture_mock.mockResolvedValue({
      ...capture_copy(),
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    });

    const res = await deliver({ ...capture_ev(), id: "WH-4" });

    expect(res.status).toBe(200);
    expect(get_order_mock).toHaveBeenCalledWith("ORDER-1");
    expect((await donation_get(ORDER_ID))!.from_email).toBe(DONOR.email);
    expect_no_donor_pii();
  });

  it("keeps the subscriber out of the log of an activated subscription", async () => {
    await seed_donation({ frequency: "monthly" });

    const res = await deliver({
      id: "WH-3",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: {
        id: SUBS_ID,
        plan_id: "P-1",
        custom_id: ORDER_ID,
        subscriber: {
          email_address: DONOR.email,
          name: donor_name,
          shipping_address: { address: donor_address },
        },
        billing_info: { next_billing_time: "2026-02-01T00:00:00.000Z" },
      },
    });

    expect(res.status).toBe(200);
    expect_no_donor_pii();
  });

  const payer_capture_ev = () => {
    const ev = capture_ev();
    return {
      ...ev,
      id: "WH-5",
      resource: {
        ...ev.resource,
        payer: {
          email_address: DONOR.email,
          name: donor_name,
          address: donor_address,
        },
      },
    };
  };

  it("keeps the payer out of the report of a delivery whose signature does not verify", async () => {
    const res = await deliver(payer_capture_ev(), {}, STRANGER);

    expect(res.status).toBe(201);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect_no_donor_pii();
  });

  it("keeps the payer out of the report of a cert outage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("unavailable", { status: 503 })
    );

    const res = await deliver(payer_capture_ev(), {
      "paypal-cert-url": `${CERT_URL}-pii-outage`,
    });

    expect(res.status).toBe(503);
    expect(report_degraded_mock).toHaveBeenCalledOnce();
    expect_no_donor_pii();
  });

  it("keeps the payer out of the log of an unhandled event", async () => {
    const res = await deliver({
      id: "WH-2",
      event_type: "CUSTOMER.DISPUTE.CREATED",
      resource: {
        id: "REFUND-1",
        payer: {
          email_address: DONOR.email,
          name: donor_name,
          address: donor_address,
        },
      },
    });

    expect(res.status).toBe(201);
    expect(await res.text()).toContain("event type not handled");
    expect_no_donor_pii();
  });
});
