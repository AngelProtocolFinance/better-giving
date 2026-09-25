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
  },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));
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

const capture_ev = () => ({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: CAPTURE_ID,
    create_time: "2026-01-02T00:00:00.000Z",
    custom_id: ORDER_ID,
    seller_receivable_breakdown: {
      gross_amount: { value: "100", currency_code: "USD" },
      net_amount: { value: "96.5", currency_code: "USD" },
      paypal_fee: { value: "3.5" },
    },
  },
});

const sale_ev = () => ({
  event_type: "PAYMENT.SALE.COMPLETED",
  resource: {
    id: SALE_ID,
    create_time: "2026-01-02T00:00:00.000Z",
    billing_agreement_id: SUBS_ID,
    transaction_fee: { value: "3.5" },
    amount: { total: "100", currency: "USD" },
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
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(report_error_mock).not.toHaveBeenCalled();
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: CAPTURE_ID, net: 100, fee: 0 }),
    ]);
  });

  it("takes platform fees out of a net paypal left off the capture", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "2", currency_code: "USD" } }],
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ sttl_id: CAPTURE_ID, net: 94.5, fee: 3.5 }),
    ]);
  });

  it("settles at paypal's net whatever platform fees ride along", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "1.85", currency_code: "EUR" } }],
        net_amount: { value: "94.5", currency_code: "USD" },
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await settlements()).toEqual([
      expect.objectContaining({ net: 94.5, fee: 3.5 }),
    ]);
  });

  it("derives a fallback net to the cent", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "50.00", currency_code: "USD" },
        paypal_fee: { value: "2.24", currency_code: "USD" },
        platform_fees: [{ amount: { value: "0.70", currency_code: "USD" } }],
      },
    };

    await deliver({ ...capture_ev(), resource });

    expect(await settlements()).toEqual([
      expect.objectContaining({ net: 47.06 }),
    ]);
  });
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
    const { transaction_fee: _, ...resource } = sale_ev().resource;

    const res = await deliver({ ...sale_ev(), resource });

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
    const { custom_id: _, ...resource } = capture_ev().resource;

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports a capture with no gross amount", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        net_amount: { value: "96.5", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^not routable: /);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await settlements()).toHaveLength(0);
  });

  it("acknowledges and reports a capture with no net and a platform fee in another currency", async () => {
    await seed_donation();
    const resource = {
      ...capture_ev().resource,
      seller_receivable_breakdown: {
        gross_amount: { value: "100", currency_code: "USD" },
        paypal_fee: { value: "3.5", currency_code: "USD" },
        platform_fees: [{ amount: { value: "2", currency_code: "EUR" } }],
      },
    };

    const res = await deliver({ ...capture_ev(), resource });

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
    const { billing_agreement_id: _, ...resource } = sale_ev().resource;

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
    const ev = capture_ev();

    const res = await deliver({
      ...ev,
      id: "WH-4",
      resource: {
        ...ev.resource,
        supplementary_data: { related_ids: { order_id: "ORDER-1" } },
      },
    });

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
      event_type: "PAYMENT.CAPTURE.REFUNDED",
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
