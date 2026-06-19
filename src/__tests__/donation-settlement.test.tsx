import { createRoutesStub, Outlet } from "react-router";
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
import { render } from "vitest-browser-react";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (before imports) ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

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

vi.mock("$/kit/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    paymentIntents: { retrieve: vi.fn(), search: vi.fn() },
    paymentMethods: { retrieve: vi.fn() },
    invoices: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));

vi.mock("$/email", () => ({
  send_email: vi.fn().mockResolvedValue({ MessageId: "test-msg-id" }),
  ses: { send: vi.fn() },
  sender: "test@test.com",
}));

// capture enqueued events so we can replay settlement outside the transaction
// (pglite is single-connection — calling global `db` inside a tx deadlocks)
const _emitted: { id: string; payload: any; dedupe: string }[] = [];
vi.mock("$/kit/queue", () => ({
  enqueue: vi.fn(
    async (...msgs: { id: string; payload: any; dedupe: string }[]) => {
      _emitted.push(...msgs);
    }
  ),
}));

vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: vi.fn() },
}));

vi.mock("@/errors/report", () => ({
  report_error: vi.fn(),
  report_null: vi.fn(() => null),
  report_undefined: vi.fn(() => undefined),
  report_msg: vi.fn((_, m: string) => m),
  report_obj: vi.fn((_, v) => v),
  report_resp: vi.fn(
    (_, message?: string, status = 500) =>
      new Response(message ?? "Server Error", { status })
  ),
}));

vi.mock("#/.server/auth/middleware", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    user_ctx: true,
    middleware: true,
  })
);
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    user_ctx: true,
    middleware: true,
  })
);

vi.mock("remix-client-cache", () => ({
  CacheRoute: (C: any) => C,
  createClientLoaderCache: () => undefined,
}));

vi.mock("swr", () => ({
  default: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("swr/immutable", () => ({
  default: () => ({ data: undefined, isLoading: false }),
}));

// --- imports after mocks ---

import { eq } from "drizzle-orm";
// admin donations page
import { npo_donors } from "#/.server/npo-donors";
import type { LoaderData } from "#/pages/admin/types";
import { loader as admin_donations_loader } from "#/routes/admin.$id.donations/api";
import AdminDonationsPage from "#/routes/admin.$id.donations/route";
import { action as stripe_action } from "#/routes/api.stripe-webhook/route";
// user dashboard final tab
import { loader as user_donations_loader } from "#/routes/dashboard.donations._index/api";
import UserDonationsPage from "#/routes/dashboard.donations._index/route";
import type { IDonation } from "@/donations";
import { admin_ctx, user_ctx } from "$/auth/test-utils";
import { stripe } from "$/kit/stripe";
import { donation_put } from "$/pg/queries/donation";
import { user } from "$/pg/schema/auth";
import { bal_txs } from "$/pg/schema/bal-tx";
import { dists } from "$/pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donation_tributes,
  donations,
} from "$/pg/schema/donation";
import { donation_messages } from "$/pg/schema/donation-message";
import { forms } from "$/pg/schema/form";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import { payouts } from "$/pg/schema/payout";
import { programs } from "$/pg/schema/program";
import { referrer_commissions } from "$/pg/schema/referrer";
import { rev_logs } from "$/pg/schema/revenue";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { settle_donation } from "../routes/api.q-handler.$event/settle-donation";

// --- setup ---

// fiscal_sponsored + hide_bg_tip → generates fsa-fee + base-fee revenue logs
// mixed allocation → generates bal_txs (lock), payouts (cash), liq balance update
const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-STTL-TEST",
  name: "Settlement Test NPO",
  endow_designation: "Charity",
  overview_pt: "[]",
  hq_country: "United States",
  published: true,
  active: true,
  claimed: true,
  fiscal_sponsored: true,
  hide_bg_tip: true,
  allocation: { liq: 50, lock: 30, cash: 20 },
  target_smart: true,
};

let render_screen: Awaited<ReturnType<typeof render>> | null = null;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

afterEach(() => {
  render_screen?.unmount();
  render_screen = null;
});

// --- helpers ---

let npo_id: number;

const NPO_FORM_ID = "npo-form-001";
const USER_FORM_ID = "user-form-002";
const PROGRAM_ID = "b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4";

async function seed() {
  // user (FK for user-owned form)
  await test_db.current!.db.insert(user).values({
    id: "test-donor-id",
    name: "Jane Donor",
    email: "donor@test.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    first_name: "Jane",
    last_name: "Donor",
  });

  // seed npo
  const [npo] = await test_db
    .current!.db.insert(npos)
    .values(NPO_SEED)
    .returning();
  npo_id = npo.id;

  const now = new Date().toISOString();

  // npo-owned form (not used as source — verifies admin/forms renders it)
  await test_db.current!.db.insert(forms).values({
    id: NPO_FORM_ID,
    name: "NPO Donation Form",
    owner_npo_id: npo_id,
    status: "active",
    tag: "npo-form-tag",
    recipient_npo_id: npo_id,
    date_created: now,
    ltd: 0,
    ltd_count: 0,
    target_number: 2000,
  });

  // user-owned form (source for the donation — ltd incremented by settlement)
  await test_db.current!.db.insert(forms).values({
    id: USER_FORM_ID,
    name: "User Donation Form",
    owner_user_id: "test-donor-id",
    status: "active",
    tag: "user-form-tag",
    recipient_npo_id: npo_id,
    date_created: now,
    ltd: 0,
    ltd_count: 0,
    target_number: 3000,
  });

  // program (for program attribution)
  await test_db.current!.db.insert(programs).values({
    id: PROGRAM_ID,
    npo_id: npo_id,
    title: "Test Program",
    description_pt: "integration test program",
    target_raise: 500,
    total_donations: 0,
    created_at: now,
  });

  // seed nav log (required for settlement allocation)
  await test_db.current!.db.transaction(async (tx) => {
    await tx.insert(nav_logs).values({
      date: now,
      reason: "test",
      units: 100,
      price: 1,
      price_updated: now,
    });
    await tx.insert(nav_log_positions).values({
      date: now,
      ticker: "CASH",
      qty: 1000,
      price: 1,
      value: 1000,
      price_date: now,
    });
  });

  // seed donation in "intent" state — via user form, attributed to program
  const don: IDonation = {
    id: "test-order-123",
    upusd: 1,
    status: "intent",
    amount: { base: 100, tip: 5, fee_allowance: 0 },
    currency: "USD",
    frequency: "one-time",
    source: "bg-widget",
    form_id: USER_FORM_ID,
    via: "stripe",
    to_id: npo_id.toString(),
    to_name: "Settlement Test NPO",
    to_type: "npo",
    to_tip_allowed: false,
    to_members: [],
    from_email: "donor@test.com",
    from_name: "Jane Donor",
    program: { id: PROGRAM_ID, name: "Test Program" },
    created_at: now,
    updated_at: now,
  };
  await donation_put(test_db.current!.db as any, don);
  return don;
}

async function truncate_all() {
  // truncate in FK-safe order
  await test_db.current!.db.delete(donation_messages);
  await test_db.current!.db.delete(referrer_commissions);
  await test_db.current!.db.delete(payouts);
  await test_db.current!.db.delete(bal_txs);
  await test_db.current!.db.delete(rev_logs);
  await test_db.current!.db.delete(dists);
  await test_db.current!.db.delete(donation_settlements);
  await test_db.current!.db.delete(donation_tributes);
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(nav_holders);
  await test_db.current!.db.delete(nav_logs);
  await test_db.current!.db.delete(forms);
  await test_db.current!.db.delete(programs);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
}

function make_admin_data(id: number): LoaderData {
  return {
    id,
    user: { email: "admin@test.com" } as any,
    endow: {
      logo: null,
      name: "Settlement Test NPO",
      allocation: { liq: 50, lock: 30, cash: 20 },
      payout_minimum: undefined as any,
    },
  };
}

function setup_stripe_mocks() {
  (stripe.webhooks.constructEvent as any).mockImplementation((body: string) =>
    JSON.parse(body)
  );
  (stripe.paymentIntents.retrieve as any).mockResolvedValue({
    latest_charge: { balance_transaction: { net: 9500, fee: 500 } },
  });
  (stripe.paymentMethods.retrieve as any).mockResolvedValue({ type: "card" });
}

function make_stripe_event(order_id: string) {
  return JSON.stringify({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_123",
        object: "payment_intent",
        amount: 10500,
        currency: "usd",
        status: "succeeded",
        created: 1700000000,
        payment_method: "pm_test_456",
        metadata: { order_id },
        invoice: null,
        latest_charge: null,
      },
    },
  });
}

function setup_refund_stripe_mocks() {
  (stripe.paymentIntents.search as any).mockResolvedValue({
    data: [
      {
        id: "pi_test_123",
        amount: 10500,
        currency: "usd",
        status: "succeeded",
        created: 1700000000,
        description: null,
        receipt_email: null,
        metadata: { order_id: "test-order-123" },
        latest_charge: {
          refunded: false,
          billing_details: { email: "donor@test.com" },
          payment_method_details: { type: "card" },
        },
        invoice: null,
      },
    ],
    has_more: false,
    next_page: null,
  });

  (stripe.paymentIntents.retrieve as any).mockResolvedValue({
    id: "pi_test_123",
    amount: 10500,
    currency: "usd",
    status: "succeeded",
    metadata: { order_id: "test-order-123" },
    invoice: null,
  });

  (stripe.refunds.create as any).mockResolvedValue({
    id: "re_test_789",
    payment_intent: "pi_test_123",
    status: "succeeded",
  });
}

import { loader as profile_loader } from "#/routes/_app.marketplace_.$id/api";
// npo profile page
import ProfilePage from "#/routes/_app.marketplace_.$id/route";
import GeneralInfoPage from "#/routes/_app.marketplace_.$id._index/route";
import { loader as program_loader } from "#/routes/_app.marketplace_.$id.program.$program_id/api";
// program page (nested under profile)
import ProgramPage from "#/routes/_app.marketplace_.$id.program.$program_id/route";
import { loader as admin_forms_loader } from "#/routes/admin.$id.forms/api";
// admin forms page
import AdminFormsPage from "#/routes/admin.$id.forms/route";
import { loader as user_forms_loader } from "#/routes/dashboard.forms/api";
// user-dashboard forms page
import UserFormsPage from "#/routes/dashboard.forms/route";
import { loader as refunds_list_loader } from "#/routes/platform.refunds/api";
// platform-admin refunds pages
import RefundsListPage from "#/routes/platform.refunds/route";
import {
  action as refund_action,
  loader as refund_loader,
} from "#/routes/platform.refunds.$donation_id.refund/api";
import RefundPage from "#/routes/platform.refunds.$donation_id.refund/route";
// platform-admin revenue pages
import { loader as rev_loader } from "#/routes/platform.revenue/api";
import RevenuePage from "#/routes/platform.revenue/route";
import { loader as rev_logs_loader } from "#/routes/platform.revenue_.logs/api";
import RevLogsPage from "#/routes/platform.revenue_.logs/route";

// --- helpers ---

async function fire_webhook(order_id = "test-order-123") {
  _emitted.length = 0;
  const res = await stripe_action({
    request: new Request("http://localhost/api/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: make_stripe_event(order_id),
    }),
    params: {},
    context: {} as any,
    url: new URL("http://localhost/api/stripe-webhook"),
    pattern: "/api/stripe-webhook",
  });

  // replay settlement events outside the transaction (pglite is single-connection)
  for (const { id, payload } of _emitted) {
    if (id === "don-sttl-dist") {
      await settle_donation(test_db.current!.db as any, payload);
    }
  }

  return res;
}

// --- expected values ---
// donation: base=100, tip=5, fa=0, upusd=1
// stripe settlement: net=95 (9500/100), fee=5 (500/100)
// partition ratio: base=100/105, tip=5/105

const GROSS = 95 * (100 / 105); // base portion of settlement net: ~90.476
const PROCESSING = 5 * (100 / 105); // base portion of settlement fee: ~4.762
const TIP = 95 * (5 / 105); // tip portion: ~4.524
// fees: base=1.5%, fsa=2.9% of gross
const BASE_FEE = GROSS * 0.015; // ~1.357
const FSA_FEE = GROSS * 0.029; // ~2.624
const NET = GROSS - BASE_FEE - FSA_FEE; // ~86.495
// allocation: liq=50%, lock=30%, cash=20% of net
const LIQ = NET * 0.5; // ~43.248
const LOCK = NET * 0.3; // ~25.949
const CASH = NET * 0.2; // ~17.299

const P = 2; // precision digits for toBeCloseTo

// --- tests ---

describe("payment_intent.succeeded → settlement → UI", () => {
  beforeEach(async () => {
    await truncate_all();
    await seed();
    setup_stripe_mocks();
  });

  it("creates dist with correct fees, net, and allocation", async () => {
    const res = await fire_webhook();
    expect(res.status).toBe(200);

    const [dist] = await test_db.current!.db.select().from(dists);
    expect(dist.status).toBe("settled");
    expect(dist.to_id).toBe(npo_id);
    expect(dist.amount_denom).toBe("USD");
    expect(dist.amount).toBeCloseTo(100, P); // base amount
    expect(dist.amount_usd).toBeCloseTo(100, P);
    expect(dist.fee_base).toBeCloseTo(BASE_FEE, P);
    expect(dist.fee_fsa).toBeCloseTo(FSA_FEE, P);
    expect(dist.fee_processing).toBeCloseTo(PROCESSING, P);
    expect(dist.net).toBeCloseTo(NET, P);
    expect(dist.alloc).toEqual({ liq: 50, lock: 30, cash: 20 });
  });

  it("creates revenue logs with correct amounts", async () => {
    await fire_webhook();

    const logs = await test_db.current!.db.select().from(rev_logs);
    const by_type = Object.fromEntries(logs.map((l) => [l.type, l]));

    // tip revenue
    expect(by_type.tip.gross).toBeCloseTo(TIP, P);
    expect(by_type.tip.revenue).toBeCloseTo(TIP, P); // no referrer → revenue = gross
    expect(by_type.tip.commission).toBe(0);
    expect(by_type.tip.status).toBe("final");

    // base-fee revenue
    expect(by_type["base-fee"].gross).toBeCloseTo(BASE_FEE, P);
    expect(by_type["base-fee"].revenue).toBeCloseTo(BASE_FEE, P);
    expect(by_type["base-fee"].commission).toBe(0);

    // fsa-fee revenue
    expect(by_type["fsa-fee"].gross).toBeCloseTo(FSA_FEE, P);
    expect(by_type["fsa-fee"].revenue).toBeCloseTo(FSA_FEE, P);
    expect(by_type["fsa-fee"].commission).toBe(0);

    // all logs linked to this npo
    for (const log of logs) {
      expect(log.npo_id).toBe(npo_id);
      expect(log.npo_name).toBe("Settlement Test NPO");
    }
  });

  it("creates bal_txs and payout with correct allocation amounts", async () => {
    await fire_webhook();

    const txs = await test_db.current!.db.select().from(bal_txs);
    const lock_tx = txs.find((t) => t.account === "lock")!;
    const liq_tx = txs.find((t) => t.account === "liq")!;

    expect(lock_tx.amount).toBeCloseTo(LOCK, P);
    expect(lock_tx.status).toBe("final");
    expect(lock_tx.account_other).toBe("donation");

    expect(liq_tx.amount).toBeCloseTo(LIQ, P);
    expect(liq_tx.status).toBe("final");
    expect(liq_tx.account_other).toBe("donation");

    // cash allocation → pending payout
    const [po] = await test_db.current!.db.select().from(payouts);
    expect(po.amount).toBeCloseTo(CASH, P);
    expect(po.type).toBe("pending");
    expect(po.source).toBe("donation");
  });

  it("emits donation.settled.dist event with correct net", async () => {
    await fire_webhook();

    const settled_evt = _emitted.find((e) => e.id === "don-dist")!;
    expect(settled_evt).toBeDefined();
    expect(settled_evt.payload.to_id).toBe(npo_id);
    expect(settled_evt.payload.net).toBeCloseTo(NET, P);
    expect(settled_evt.payload.amount_denom).toBe("USD");
  });

  it("updates npo balances to match allocation", async () => {
    await fire_webhook();

    const [npo] = await test_db
      .current!.db.select({
        liq: npos.liq,
        lock_units: npos.lock_units,
        cash: npos.cash,
      })
      .from(npos);
    expect(npo.liq).toBeCloseTo(LIQ, P);
    // lock_units = lock_amount / nav_price (nav_price=1)
    expect(npo.lock_units).toBeCloseTo(LOCK, P);
    expect(npo.cash).toBeCloseTo(CASH, P);
  });

  it("admin donations page renders correct donor, method, and fee values", async () => {
    await fire_webhook();

    const mdlwr = [
      async ({ context }: any, next: any) => {
        context.set(admin_ctx, npo_id);
        return next();
      },
    ];

    const Stub = createRoutesStub([
      {
        id: "admin",
        path: "/admin/:id",
        Component: () => <Outlet />,
        HydrateFallback: () => null,
        loader: () => make_admin_data(npo_id),
        children: [
          {
            id: "donations",
            path: "donations",
            Component: AdminDonationsPage,
            loader: admin_donations_loader as any,
            middleware: mdlwr,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub
        initialEntries={[`/admin/${npo_id}/donations`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    // wait for data to load, then verify content values
    await expect.element(screen.getByText("Jane Donor")).toBeInTheDocument();
    await expect.element(screen.getByText("Card")).toBeInTheDocument();
    // fee labels conditionally rendered (only when > 0)
    // fiscal_sponsored + hide_bg_tip → all 3 fee types show
    await expect.element(screen.getByText(/^base$/)).toBeInTheDocument();
    await expect
      .element(screen.getByText(/^fiscal sponsorship$/))
      .toBeInTheDocument();
    await expect.element(screen.getByText(/^processing$/)).toBeInTheDocument();
    // net amount rendered (exact value verified in DB test)
    await expect.element(screen.getByText(/\$86/)).toBeInTheDocument();
    // program attribution
    await expect.element(screen.getByText("Test Program")).toBeInTheDocument();
    // form origin: source=bg-widget → "Donation Form" heading with form tag below
    await expect
      .element(screen.getByText("Donation Form", { exact: true }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("user-form-tag")).toBeInTheDocument();
  });

  it("user dashboard renders correct recipient and payment method", async () => {
    await fire_webhook();

    const mdlwr = [
      async ({ context }: any, next: any) => {
        context.set(user_ctx, {
          id: "test-donor-id",
          email: "donor@test.com",
          groups: [],
          endowments: [],
          funds: [],
          token_refresh: "",
        });
        return next();
      },
    ];

    const Stub = createRoutesStub([
      {
        path: "/donations",
        Component: UserDonationsPage,
        HydrateFallback: () => null,
        loader: user_donations_loader as any,
        middleware: mdlwr,
      },
    ]);

    const screen = await render(
      <Stub initialEntries={["/donations"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    // recipient name + payment method (capitalize renders "card" → "card")
    await expect
      .element(screen.getByText("Settlement Test NPO"))
      .toBeInTheDocument();
    await expect.element(screen.getByText(/card/i)).toBeInTheDocument();
    // frequency shown (css uppercase, dom text is lowercase)
    await expect.element(screen.getByText("one-time")).toBeInTheDocument();
    // program attribution shown as link below recipient
    await expect.element(screen.getByText("Test Program")).toBeInTheDocument();
  });

  it("platform-admin revenue page renders correct LTD totals and per-npo breakdown", async () => {
    await fire_webhook();

    const Stub = createRoutesStub([
      {
        path: "/revenue",
        Component: RevenuePage,
        HydrateFallback: () => null,
        loader: rev_loader as any,
        children: [
          {
            path: "logs",
            Component: RevLogsPage,
            loader: rev_logs_loader as any,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub initialEntries={["/revenue"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    // wait for page load
    await expect.element(screen.getByText("Total Revenue")).toBeInTheDocument();

    // LTD card values (first 4 $-prefixed elements): total, tip, base_fee, fsa_fee
    const dollar_els = screen.getByText(/^\$\d/).elements();
    const parse_dollar = (el: Element) =>
      Number.parseFloat(el.textContent!.replace("$", "").replace(/,/g, ""));

    const [total, tip_ltd, base_ltd, fsa_ltd] = dollar_els
      .slice(0, 4)
      .map(parse_dollar);
    const expected_total = TIP + BASE_FEE + FSA_FEE;
    expect(total).toBeCloseTo(expected_total, 1);
    expect(tip_ltd).toBeCloseTo(TIP, 1);
    expect(base_ltd).toBeCloseTo(BASE_FEE, 1);
    expect(fsa_ltd).toBeCloseTo(FSA_FEE, 1);

    // per-npo row shows npo name (appears in both breakdown table and log table)
    expect(
      screen.getByText("Settlement Test NPO").elements().length
    ).toBeGreaterThanOrEqual(1);

    // recent revenue log entries show all 3 types
    await expect
      .element(screen.getByText("tip", { exact: true }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("base-fee", { exact: true }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("fsa-fee", { exact: true }))
      .toBeInTheDocument();
  });

  it("profile page Target shows contributions_total after settlement", async () => {
    await fire_webhook();

    // npo has target_smart → profile page renders Target with contributions_total
    // v_contributions: amount_usd=100, so progress=100
    // smart_next(100) → 200 (100 <= 100, doubles)
    const Stub = createRoutesStub([
      {
        path: "/marketplace/:id",
        Component: ProfilePage,
        HydrateFallback: () => null,
        loader: profile_loader as any,
        children: [
          {
            index: true,
            Component: GeneralInfoPage,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub
        initialEntries={[`/marketplace/${npo_id}`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    // npo Target shows contributions progress (rendered in both Body and DetailsColumn)
    const raised = screen.getByText("$100").elements();
    expect(raised.length).toBeGreaterThanOrEqual(1);
    const goals = screen.getByText("$200").elements();
    expect(goals.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Raised").elements().length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByText("Goal").elements().length).toBeGreaterThanOrEqual(
      1
    );
  });

  it("increments form ltd and program total_donations after settlement", async () => {
    await fire_webhook();

    const [form] = await test_db
      .current!.db.select()
      .from(forms)
      .where(eq(forms.id, USER_FORM_ID));
    expect(form.ltd).toBeCloseTo(NET, P);
    expect(form.ltd_count).toBe(1);

    const [prog] = await test_db
      .current!.db.select()
      .from(programs)
      .where(eq(programs.id, PROGRAM_ID));
    expect(prog.total_donations).toBeCloseTo(NET, P);
  });

  it("program page shows TargetProgress after settlement", async () => {
    await fire_webhook();

    const Stub = createRoutesStub([
      {
        path: "/marketplace/:id",
        Component: ProfilePage,
        HydrateFallback: () => null,
        loader: profile_loader as any,
        children: [
          {
            path: "program/:program_id",
            Component: ProgramPage,
            loader: program_loader as any,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub
        initialEntries={[`/marketplace/${npo_id}/program/${PROGRAM_ID}`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    await expect.element(screen.getByText("Test Program")).toBeInTheDocument();
    // program target_raise=500 shown as "Target raise:"
    await expect.element(screen.getByText("$500")).toBeInTheDocument();
    // program total_donations ≈ NET shown as "Donations received"
    await expect
      .element(screen.getByText("Donations received"))
      .toBeInTheDocument();
  });

  it("admin forms page shows form with updated ltd Target", async () => {
    await fire_webhook();

    const mdlwr = [
      async ({ context }: any, next: any) => {
        context.set(admin_ctx, npo_id);
        return next();
      },
    ];

    const Stub = createRoutesStub([
      {
        path: "/forms",
        Component: AdminFormsPage,
        HydrateFallback: () => null,
        loader: admin_forms_loader as any,
        middleware: mdlwr,
      },
    ]);

    const screen = await render(
      <Stub initialEntries={["/forms"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    await expect
      .element(screen.getByRole("heading", { name: /Donation forms/i }))
      .toBeInTheDocument();
    // form card renders with tag and Target showing ltd progress
    await expect.element(screen.getByText("npo-form-tag")).toBeInTheDocument();
    // form Target goal = $2,000
    await expect.element(screen.getByText("$2,000")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Raised", { exact: true }))
      .toBeInTheDocument();
  });

  it("user-dashboard forms page shows user form with updated ltd", async () => {
    await fire_webhook();

    const mdlwr = [
      async ({ context }: any, next: any) => {
        context.set(user_ctx, {
          id: "test-donor-id",
          email: "donor@test.com",
          groups: [],
          endowments: [],
          funds: [],
          token_refresh: "",
        });
        return next();
      },
    ];

    const Stub = createRoutesStub([
      {
        path: "/forms",
        Component: UserFormsPage,
        HydrateFallback: () => null,
        loader: user_forms_loader as any,
        middleware: mdlwr,
      },
    ]);

    const screen = await render(
      <Stub initialEntries={["/forms"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    await expect
      .element(screen.getByRole("heading", { name: /Donation forms/i }))
      .toBeInTheDocument();
    // user form card with tag and Target showing ltd after settlement
    await expect.element(screen.getByText("user-form-tag")).toBeInTheDocument();
    // form Target goal = $3,000
    await expect.element(screen.getByText("$3,000")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Raised", { exact: true }))
      .toBeInTheDocument();
  });

  it("refunds page shows settled donation, click refund shows preview with effects, confirm processes refund", async () => {
    await fire_webhook();
    setup_refund_stripe_mocks();

    const Stub = createRoutesStub([
      {
        path: "/refunds",
        Component: RefundsListPage,
        HydrateFallback: () => null,
        loader: refunds_list_loader as any,
        children: [
          {
            path: ":donation_id/refund",
            Component: RefundPage,
            loader: refund_loader as any,
            action: refund_action as any,
          },
        ],
      },
    ]);

    let screen = await render(
      <Stub initialEntries={["/refunds"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    // list renders settled donation
    await expect
      .element(screen.getByText("donor@test.com"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Settlement Test NPO"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("card")).toBeInTheDocument();
    const refund_link = screen.getByRole("link", { name: /Refund/i });
    await expect.element(refund_link).toBeInTheDocument();

    // click refund → preview dialog appears (NPO name shows in both list + preview)
    await refund_link.click();
    await expect
      .element(screen.getByRole("heading", { name: /Refund preview/i }))
      .toBeInTheDocument();
    expect(screen.getByText("Settlement Test NPO").elements()).toHaveLength(2);
    await expect
      .element(screen.getByText("Savings balance"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Investment balance"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Grant payout")).toBeInTheDocument();

    // confirm refund → action runs PG reversals + stripe refund (native click — Base UI dialog overlay)
    (
      screen
        .getByRole("button", { name: /Confirm refund/i })
        .element() as HTMLElement
    ).click();
    await expect
      .element(screen.getByText("Refund processed"))
      .toBeInTheDocument();
    expect(stripe.refunds.create).toHaveBeenCalledWith({
      payment_intent: "pi_test_123",
    });

    // revalidated list shows "Refunded" label
    screen.unmount();

    const Stub2 = createRoutesStub([
      {
        path: "/refunds",
        Component: RefundsListPage,
        HydrateFallback: () => null,
        loader: refunds_list_loader as any,
      },
    ]);
    screen = await render(
      <Stub2 initialEntries={["/refunds"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    await expect.element(screen.getByText("Refunded")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /Refund/i }))
      .not.toBeInTheDocument();

    // npo balances reverted to zero
    const [npo_after] = await test_db
      .current!.db.select({
        liq: npos.liq,
        lock_units: npos.lock_units,
        cash: npos.cash,
      })
      .from(npos);
    expect(npo_after.liq).toBeCloseTo(0, P);
    expect(npo_after.lock_units).toBeCloseTo(0, P);
    // cash is from payout (pending → refunded), balance stays since payout was pending
    expect(npo_after.cash).toBeCloseTo(0, P);

    // rev_logs all marked refunded
    const logs = await test_db.current!.db.select().from(rev_logs);
    for (const log of logs) {
      expect(log.status).toBe("refunded");
    }

    // dist marked refunded
    const [dist_after] = await test_db.current!.db.select().from(dists);
    expect(dist_after.status).toBe("refunded");
    expect(dist_after.refund_status).toBe("completed");
  });

  it("returns 403 when stripe-signature header missing", async () => {
    const res = await stripe_action({
      request: new Request("http://localhost/api/stripe-webhook", {
        method: "POST",
        body: "{}",
      }),
      params: {},
      context: {} as any,
      url: new URL("http://localhost/api/stripe-webhook"),
      pattern: "/api/stripe-webhook",
    });

    expect(res.status).toBe(403);
  });

  it("donor message created on settlement with avatar from joined user", async () => {
    // update donation to have public message + update user to have avatar
    await test_db
      .current!.db.update(donation_donors)
      .set({ is_public: true, public_msg: "Great cause!" })
      .where(eq(donation_donors.donation_id, "test-order-123"));
    await test_db
      .current!.db.update(user)
      .set({ avatar_url: "https://example.com/jane.jpg" })
      .where(eq(user.id, "test-donor-id"));

    await fire_webhook();

    // verify donation_message was inserted
    const msgs = await test_db.current!.db.select().from(donation_messages);
    expect(msgs.length).toBe(1);
    expect(msgs[0].donor_name).toBe("Jane Donor");
    expect(msgs[0].donor_message).toBe("Great cause!");
    expect(msgs[0].npo_id).toBe(npo_id.toString());

    // verify npo_donors joins through donation_donors → user for avatar
    const page = await npo_donors(npo_id.toString());
    expect(page.items.length).toBe(1);
    expect(page.items[0].donor_name).toBe("Jane Donor");
    expect(page.items[0].donor_message).toBe("Great cause!");
    expect(page.items[0].photo).toBe("https://example.com/jane.jpg");
  });

  it("donor message without matching user shows no avatar", async () => {
    // donor email doesn't match any user
    await test_db
      .current!.db.update(donation_donors)
      .set({
        is_public: true,
        public_msg: "Keep it up!",
        email: "stranger@example.com",
      })
      .where(eq(donation_donors.donation_id, "test-order-123"));

    await fire_webhook();

    const page = await npo_donors(npo_id.toString());
    expect(page.items.length).toBe(1);
    expect(page.items[0].donor_name).toBe("Jane Donor");
    expect(page.items[0].photo).toBeUndefined();
  });

  it("returns 400 on handler error", async () => {
    const { report_error } = await import("@/errors/report");
    (report_error as any).mockClear();
    (stripe.paymentIntents.retrieve as any).mockRejectedValue(
      new Error("stripe api down")
    );

    const res = await stripe_action({
      request: new Request("http://localhost/api/stripe-webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_test" },
        body: make_stripe_event("test-order-123"),
      }),
      params: {},
      context: {} as any,
      url: new URL("http://localhost/api/stripe-webhook"),
      pattern: "/api/stripe-webhook",
    });

    expect(res.status).toBe(400);
    expect(report_error).toHaveBeenCalled();
    expect((report_error as any).mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
