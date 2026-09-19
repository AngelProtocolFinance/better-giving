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
vi.mock("$/kit/discord", () => ({ aws_monitor: { send_alert: vi.fn() } }));
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

const ETH_USD = 2000;
type Route = (req: Request) => Response | Promise<Response>;
/** nowpayments by path; eth at $2000, pair minimum 0.001 eth ($2) */
const np_server = (o: Record<string, Route> = {}) => {
  const routes: Record<string, Route> = {
    "/v1/min-amount": () =>
      Response.json({ min_amount: 0.001, fiat_equivalent: 0.001 * ETH_USD }),
    "/v1/estimate": () =>
      Response.json({ amount_from: 100, estimated_amount: 100 / ETH_USD }),
    "/v1/invoice": () => Response.json({ id: "inv-1" }),
    "/v1/invoice-payment": () =>
      Response.json({
        payment_id: "777",
        pay_address: "0xdeposit",
        payin_extra_id: null,
        pay_amount: 0.01,
        pay_currency: "eth",
      }),
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

describe("crypto_intent", () => {
  it("a currency outside the token map is a 400 before nowpayments or the db", async () => {
    const spy = fetch_spy();
    const res = await crypto_intent(ctx({ currency: "NOPECOIN" }));

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });

  it("a nowpayments invoice error answers 502, reports, and leaves no row", async () => {
    np_server({
      "/v1/invoice": () =>
        new Response('{"message":"currency disabled"}', { status: 400 }),
    });
    const res = await crypto_intent(
      ctx({ amount: { base: 0.01, tip: 0, fee_allowance: 0 } })
    );

    expect((res as Response).status).toBe(502);
    expect(await (res as Response).text()).not.toMatch(/currency disabled/);
    expect(report_error_mock).toHaveBeenCalledOnce();
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
    expect(invoice.price_amount).toBe(20);
    const [row] = await rows();
    expect(row.id).toBe(invoice.order_id);
    expect(row.via_extra).toBe("777");
    expect(res).toMatchObject({
      don_id: invoice.order_id,
      body: { id: "777", address: "0xdeposit", amount: 0.01 },
    });
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
        Response.json({
          payment_id: "778",
          pay_address: "0xdeposit",
          payin_extra_id: null,
          pay_amount: 0.00099,
          pay_currency: "eth",
        }),
    });
    // $2.20: over the $2 pair minimum plus allowance, as quoted
    const res = await crypto_intent(
      ctx({ amount: { base: 0.0011, tip: 0, fee_allowance: 0 } })
    );

    expect((res as Response).status).toBe(400);
    expect(await (res as Response).text()).toMatch(
      /below the minimum of .+ ETH/
    );
    expect(await rows()).toHaveLength(0);
  });

  it("enforces the same minimum the estimate route shows the donor", async () => {
    // pair minimum 0.001 eth ($2) is over the $1 floor, +3% = 0.00103
    np_server();
    const shown = await estimate_loader({ params: { code: "ETH" } } as any);
    const { min, usdpu } = await (shown as Response).json();
    expect(min).toBeCloseTo(0.00103, 9);
    expect(usdpu).toBe(ETH_USD);

    const under = await crypto_intent(
      ctx({ amount: { base: min * 0.999, tip: 0, fee_allowance: 0 } })
    );
    expect((under as Response).status).toBe(400);

    const at = await crypto_intent(
      ctx({ amount: { base: min, tip: 0, fee_allowance: 0 } })
    );
    expect(at).not.toBeInstanceOf(Response);
  });
});
