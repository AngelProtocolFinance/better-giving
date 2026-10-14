import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type HttpError, json_ok } from "@/helpers/https";
import {
  create_invoice,
  create_payment,
  estimate_price,
  min_amount,
  with_decimal_strings,
} from "@/nowpayments/fixtures/examples";
import {
  simple_price,
  simple_price_for,
} from "$/kit/fixtures/coingecko-examples";
import type { TestDb } from "$/pg/test-utils/pglite";
import type { Ctx } from "../types";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const report_error_mock = vi.hoisted(() => vi.fn());
const env_mock = vi.hoisted(() => ({
  base_url: "https://app.test",
  stage: "staging",
  nowpayments: {
    api_key: "k",
    api_url: "https://api-sandbox.nowpayments.io",
    is_sandbox: true,
    ipn_secret: "s",
  },
}));

vi.mock("$/env", () => env_mock);
vi.mock("#/errors/report", () => ({
  report_error: report_error_mock,
  report_null: () => null,
}));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: vi.fn(async () => new Response()) },
}));
vi.mock("$/kit/coingecko", () => ({ coingecko: vi.fn() }));
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

const { crypto_intent } = await import("./index");
const { coingecko } = await import("$/kit/coingecko");
const { loader: estimate_loader } = await import(
  "#/routes/api.tokens.$code.estimate"
);
const { donations, donation_donors, donation_recipients } = await import(
  "$/pg/schema/donation"
);
const { npos } = await import("$/pg/schema/npo");
const { create_test_db } = await import("$/pg/test-utils/pglite");

const db = () => test_db.current!.db;
const rows = () => db().select().from(donations);

let npo_id: number;

const ctx = (o: Partial<Ctx["intent"]> = {}): Ctx =>
  ({
    to: {
      to_id: npo_id.toString(),
      to_type: "npo",
      to_name: "NP Test NPO",
      to_tip_allowed: false,
      to_members: [],
    },
    from: { from_email: "donor@test.com", from_name: "Jane Donor" },
    donor: { first_name: "Jane", last_name: "Donor", email: "donor@test.com" },
    via: "crypto",
    via_extra: "",
    intent: {
      amount: { base: 1, tip: 0, fee_allowance: 0 },
      currency: "ETH",
      source: "bg-marketplace",
      frequency: "one-time",
      ...o,
    },
  }) as Ctx;

const fetch_spy = () => vi.spyOn(globalThis, "fetch");

const QUOTED_USD =
  Number(estimate_price.amount_from) / Number(estimate_price.estimated_amount);
/** the documented min-amount example is already over the $1 floor */
const PAIR_FLOOR = Number(min_amount.min_amount);
const PAIR_MIN = PAIR_FLOOR * 1.03;
type Route = (req: Request) => Response | Promise<Response>;
/** nowpayments by path, answering with the published examples */
const np_server = (o: Record<string, Route> = {}) => {
  const routes: Record<string, Route> = {
    "/v1/min-amount": () => Response.json(min_amount),
    "/v1/estimate": () => Response.json(estimate_price),
    "/v1/invoice": () => Response.json(create_invoice),
    "/v1/invoice-payment": () => Response.json(create_payment),
    ...o,
  };
  return fetch_spy().mockImplementation(async (input) => {
    const req = input as Request;
    const route = routes[new URL(req.url).pathname];
    if (!route) throw new Error(`unexpected nowpayments call ${req.url}`);
    return route(req);
  });
};
const bodies = (spy: ReturnType<typeof fetch_spy>, path: string) =>
  Promise.all(
    spy.mock.calls
      .map(([r]) => r as Request)
      .filter((r) => new URL(r.url).pathname === path)
      .map((r) => r.clone().json())
  );

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db().delete(donation_donors);
  await db().delete(donation_recipients);
  await db().delete(donations);
  await db().delete(npos);
  const [npo] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-NP-INTENT",
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

afterEach(() => {
  vi.restoreAllMocks();
});

// what the checkout shows the donor: only a marked refusal's body; any other
// failure's `HTTP <status>` is never for their eyes
const shown = (res: unknown) =>
  json_ok(res as Response).then(
    () => "",
    (e: HttpError) => (e.refused ? e.message : "")
  );

describe("crypto_intent", () => {
  it("a currency outside the token map is a 400 before nowpayments or the db", async () => {
    const spy = fetch_spy();
    const res = await crypto_intent(ctx({ currency: "NOPECOIN" }));

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(await shown(res)).toMatch(/isn't supported.*different currency/);
    expect(spy).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });

  // retrying a coin nowpayments refuses can never succeed
  it.each([400, 404])(
    "a nowpayments %i tells the donor to pick another currency, reports, and leaves no row",
    async (status) => {
      np_server({
        "/v1/invoice": () =>
          new Response('{"message":"currency disabled"}', { status }),
      });
      const res = await crypto_intent(
        ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
      );

      expect((res as Response).status).toBe(400);
      const msg = await shown(res);
      expect(msg).toMatch(/isn't available right now.*different currency/);
      expect(msg).not.toMatch(/currency disabled/);
      expect(report_error_mock).toHaveBeenCalledOnce();
      expect(await rows()).toHaveLength(0);
    }
  );

  it.each([
    ["a 5xx", () => new Response("", { status: 503 })],
    ["a 429", () => new Response("", { status: 429 })],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
  ])(
    "%s from nowpayments answers 502 try-again-later, reports, and leaves no row",
    async (_, route) => {
      np_server({ "/v1/invoice": route });
      const res = await crypto_intent(
        ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
      );

      expect((res as Response).status).toBe(502);
      // `json_ok` drops every 5xx body; the retry cue is the checkout's
      expect(await shown(res)).toBe("");
      expect(report_error_mock).toHaveBeenCalledOnce();
      expect(await rows()).toHaveLength(0);
    }
  );

  it.each([0, null])(
    "a %s pair minimum tells the donor the currency isn't available and leaves no row",
    async (quoted) => {
      const spy = np_server({
        "/v1/min-amount": () =>
          Response.json({
            ...min_amount,
            min_amount: quoted,
            fiat_equivalent: 0,
          }),
      });
      const res = await crypto_intent(
        ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
      );

      expect((res as Response).status).toBe(400);
      expect(await shown(res)).toMatch(
        /isn't available right now.*different currency/
      );
      expect(await bodies(spy, "/v1/invoice")).toHaveLength(0);
      expect(await rows()).toHaveLength(0);
      // an enabled token nowpayments won't quote is token-list drift
      expect(report_error_mock).toHaveBeenCalledOnce();
    }
  );

  it("an unusable estimate tells the donor the currency isn't available and leaves no row", async () => {
    const spy = np_server({
      "/v1/estimate": () =>
        Response.json({ ...estimate_price, estimated_amount: 0 }),
    });
    const res = await crypto_intent(
      ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
    );

    expect((res as Response).status).toBe(400);
    expect(await shown(res)).toMatch(
      /isn't available right now.*different currency/
    );
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(await bodies(spy, "/v1/invoice")).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it("creates the invoice with a well-formed callback, then the row under its order_id", async () => {
    const spy = np_server();
    const res = await crypto_intent(
      ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
    );

    expect(res).not.toBeInstanceOf(Response);
    const [invoice] = await bodies(spy, "/v1/invoice");
    expect(invoice.ipn_callback_url).toBe(
      "https://app.test/api/nowpayments-webhook"
    );
    expect(invoice.price_amount).toBeCloseTo(0.01 * QUOTED_USD, 9);
    const [row] = await rows();
    expect(row.id).toBe(invoice.order_id);
    expect(row.via_extra).toBe(create_payment.payment_id);
    expect(res).toMatchObject({
      don_id: invoice.order_id,
      body: {
        id: create_payment.payment_id,
        address: create_payment.pay_address,
        amount: create_payment.pay_amount,
      },
    });
  });

  // priced at nowpayments' rate, its conversion back lands on the donor's 10
  it("a USDC intent values the row at a dollar a unit and prices the invoice at nowpayments' rate", async () => {
    const spy = np_server({
      "/v1/min-amount": () =>
        Response.json({ ...min_amount, min_amount: 1, fiat_equivalent: 1.03 }),
      "/v1/estimate": () =>
        Response.json({
          ...estimate_price,
          amount_from: 100,
          estimated_amount: 100 / 1.03,
        }),
      "/v1/invoice-payment": () =>
        Response.json({
          ...create_payment,
          payment_id: "779",
          pay_amount: 10,
          pay_currency: "usdc",
        }),
    });
    const res = await crypto_intent(
      ctx({ currency: "USDC", amount: { base: 10, tip: 0, fee_allowance: 0 } })
    );

    expect(res).not.toBeInstanceOf(Response);
    const [invoice] = await bodies(spy, "/v1/invoice");
    expect(invoice.price_amount).toBeCloseTo(10.3, 9);
    const [row] = await rows();
    expect(row.upusd).toBe(1);
    expect(res).toMatchObject({ body: { usdpu: 1 } });
  });

  it.each([
    { is_sandbox: true, stage: "production", sent: "success" },
    { is_sandbox: false, stage: "staging", sent: undefined },
  ])(
    "the api host, not the stage, decides the simulated case (sandbox: $is_sandbox)",
    async ({ is_sandbox, stage, sent }) => {
      env_mock.nowpayments.is_sandbox = is_sandbox;
      env_mock.stage = stage;
      try {
        const spy = np_server();
        await crypto_intent(
          ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
        );
        const [p] = await bodies(spy, "/v1/invoice-payment");
        expect(p.case).toBe(sent);
      } finally {
        env_mock.nowpayments.is_sandbox = true;
        env_mock.stage = "staging";
      }
    }
  );

  it("nowpayments' pay_amount under the pair floor is a 400 with no row", async () => {
    np_server({
      "/v1/invoice-payment": () =>
        Response.json({ ...create_payment, pay_amount: PAIR_FLOOR / 2 }),
    });
    // the donor's amount clears the quoted minimum; the deposit nowpayments
    // asks for does not
    const res = await crypto_intent(
      ctx({ amount: { base: PAIR_MIN, tip: 0, fee_allowance: 0 } })
    );

    expect((res as Response).status).toBe(400);
    expect(await shown(res)).toMatch(/below the minimum of .+ ETH/);
    expect(await rows()).toHaveLength(0);
  });

  it("a quote nowpayments sends as decimal strings still prices the token", async () => {
    np_server({
      "/v1/estimate": () =>
        Response.json(
          with_decimal_strings(estimate_price, [
            "amount_from",
            "estimated_amount",
          ])
        ),
      "/v1/min-amount": () =>
        Response.json(
          with_decimal_strings(min_amount, ["min_amount", "fiat_equivalent"])
        ),
    });
    const quoted = await estimate_loader({ params: { code: "ETH" } } as any);
    const { min, usdpu } = await (quoted as Response).json();
    expect(usdpu).toBe(QUOTED_USD);
    expect(min).toBeCloseTo(PAIR_MIN, 9);
  });

  it("a custom token's price request keeps the id in the query, not the path", async () => {
    vi.mocked(coingecko).mockImplementationOnce(async (url_fn) => {
      const url = url_fn(new URL("https://api.coingecko.com"), (p) => p);
      expect(url).toBeInstanceOf(URL);
      const built = url as URL;
      expect(built.pathname).toBe("/api/v3/simple/price");
      expect(built.searchParams.get("ids")).toBe("karate-combat");
      expect(built.searchParams.get("vs_currencies")).toBe("usd");
      return Response.json(simple_price_for("karate-combat"));
    });
    const quoted = await estimate_loader({
      params: { code: "KARATE-1" },
    } as any);
    const usd = simple_price.bitcoin.usd;
    expect(await (quoted as Response).json()).toEqual({
      min: 1 / usd,
      usdpu: usd,
    });
  });

  it("enforces the same minimum the estimate route shows the donor", async () => {
    np_server();
    const quoted = await estimate_loader({ params: { code: "ETH" } } as any);
    const { min, usdpu } = await (quoted as Response).json();
    expect(min).toBeCloseTo(PAIR_MIN, 9);
    expect(usdpu).toBe(QUOTED_USD);

    const under = await crypto_intent(
      ctx({ amount: { base: min * 0.999, tip: 0, fee_allowance: 0 } })
    );
    expect((under as Response).status).toBe(400);
    expect(await shown(under)).toMatch(/below the minimum of .+ ETH/);

    const at = await crypto_intent(
      ctx({ amount: { base: min, tip: 0, fee_allowance: 0 } })
    );
    expect(at).not.toBeInstanceOf(Response);
  });

  // a custom token is priced off coingecko, never nowpayments
  it("a custom token under a dollar's worth tells the donor the minimum and leaves no row", async () => {
    const spy = fetch_spy();
    vi.mocked(coingecko).mockImplementationOnce(async (url_fn) => {
      const url = url_fn(new URL("https://api.coingecko.com"), (p) => p);
      expect((url as URL).searchParams.get("ids")).toBe("karate-combat");
      expect((url as URL).pathname).toBe("/api/v3/simple/price");
      return Response.json(simple_price_for("karate-combat"));
    });
    const usd = simple_price.bitcoin.usd;
    const min = 1 / usd;
    const res = await crypto_intent(
      ctx({
        currency: "KARATE-1",
        amount: { base: min / 2, tip: 0, fee_allowance: 0 },
      })
    );

    expect((res as Response).status).toBe(400);
    expect(await shown(res)).toContain(`below the minimum of ${min} KARATE-1`);
    expect(spy).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });
});
