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
import { createRoutesStub } from "react-router";
import { loader as fund_loader } from "#/routes/_app.fundraisers.$fund_id/api";
// fund page — for fund Target directly
import FundPage from "#/routes/_app.fundraisers.$fund_id/route";
import { loader as profile_loader } from "#/routes/_app.marketplace_.$id/api";
// profile page — for fund Target on npo profile
import ProfilePage from "#/routes/_app.marketplace_.$id/route";
import GeneralInfoPage from "#/routes/_app.marketplace_.$id._index/route";
import { action as stripe_action } from "#/routes/api.stripe-webhook/route";
import { loader as user_forms_loader } from "#/routes/dashboard.forms/api";
// user-dashboard forms — for form ltd verification
import UserFormsPage from "#/routes/dashboard.forms/route";
// platform-admin refunds pages
import RefundsListPage from "#/routes/platform.refunds/route";
import {
  action as refund_action,
  loader as refund_loader,
} from "#/routes/platform.refunds.$donation_id.refund/api";
import RefundDialog from "#/routes/platform.refunds.$donation_id.refund/route";
import type { IDonation } from "@/donations";
import { user_ctx } from "$/auth/test-utils";
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
import { fund_members, funds } from "$/pg/schema/fund";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import { payouts } from "$/pg/schema/payout";
import { referrer_commissions } from "$/pg/schema/referrer";
import { rev_logs } from "$/pg/schema/revenue";
import { v_donation_total_usd } from "$/pg/schema/views";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { settle_donation } from "../routes/api.q-handler.$event/settle-donation";

// --- setup ---

const FUND_ID = "a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4";
const DON_ID = "fund-don-001";
const FORM_ID = "user-form-001";
const FUTURE = new Date(Date.now() + 86400000 * 365).toISOString();

const NPO_A_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-FUND-A",
  name: "Fund NPO A",
  endow_designation: "Charity",
  hq_country: "United States",
  published: true,
  active: true,
  claimed: true,
  fiscal_sponsored: true,
  hide_bg_tip: false,
  allocation: { liq: 60, lock: 20, cash: 20 },
  referrer_user: "PREF-TEST",
  referrer_expiry: FUTURE,
};

const NPO_B_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-FUND-B",
  name: "Fund NPO B",
  endow_designation: "Charity",
  hq_country: "United States",
  published: true,
  active: true,
  claimed: true,
  fiscal_sponsored: false,
  hide_bg_tip: true,
  allocation: { liq: 0, lock: 0, cash: 100 },
};

const NPO_C_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-FUND-C",
  name: "Fund NPO C",
  endow_designation: "Charity",
  hq_country: "United States",
  published: true,
  active: true,
  claimed: true,
  fiscal_sponsored: false,
  hide_bg_tip: false,
  allocation: { liq: 50, lock: 50, cash: 0 },
  referrer_user: "UREF-TEST",
  referrer_expiry: FUTURE,
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

let npo_a_id: number;
let npo_b_id: number;
let npo_c_id: number;

async function seed() {
  // user (FK for funds.creator_id + form owner)
  await test_db.current!.db.insert(user).values([
    {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Fund Creator",
      email: "fund-creator@test.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "Fund",
      last_name: "Creator",
      referral_code: "PREF-TEST",
    },
    {
      id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      name: "User Referrer",
      email: "user-referrer@test.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "User",
      last_name: "Referrer",
      referral_code: "UREF-TEST",
    },
  ]);

  // 3 npos
  const [a] = await test_db
    .current!.db.insert(npos)
    .values(NPO_A_SEED)
    .returning();
  const [b] = await test_db
    .current!.db.insert(npos)
    .values(NPO_B_SEED)
    .returning();
  const [c] = await test_db
    .current!.db.insert(npos)
    .values(NPO_C_SEED)
    .returning();
  npo_a_id = a.id;
  npo_b_id = b.id;
  npo_c_id = c.id;

  // fund
  await test_db.current!.db.insert(funds).values({
    id: FUND_ID,
    name: "Test Fund",
    description_rich: "integration test fund",
    banner: "https://img.co/banner.png",
    logo: "https://img.co/logo.png",
    npo_owner: npo_a_id,
    creator_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    active: true,
    published: true,
    target_number: 1000,
  });
  await test_db.current!.db.insert(fund_members).values(
    [npo_a_id, npo_b_id, npo_c_id].map((npo_id, i) => ({
      fund_id: FUND_ID,
      npo_id,
      position: i,
    }))
  );

  // user-owned form (source for the donation)
  const now = new Date().toISOString();
  await test_db.current!.db.insert(forms).values({
    id: FORM_ID,
    name: "User Donation Form",
    owner_user_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    status: "active",
    tag: "user-form-tag",
    recipient_fund_id: FUND_ID,
    date_created: now,
    ltd: 0,
    ltd_count: 0,
    target_number: 5000,
  });

  // nav log
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

  // donation to fund via user form
  const don: IDonation = {
    id: DON_ID,
    upusd: 1,
    status: "intent",
    amount: { base: 300, tip: 15, fee_allowance: 0 },
    currency: "USD",
    frequency: "one-time",
    source: "bg-widget",
    form_id: FORM_ID,
    via: "stripe",
    to_id: FUND_ID,
    to_name: "Test Fund",
    to_type: "fund",
    to_tip_allowed: false,
    to_members: [npo_a_id.toString(), npo_b_id.toString(), npo_c_id.toString()],
    from_email: "donor@test.com",
    from_name: "Jane Donor",
    created_at: now,
    updated_at: now,
  };
  await donation_put(test_db.current!.db as any, don);
  return don;
}

async function truncate_all() {
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
  await test_db.current!.db.delete(funds);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
}

function setup_stripe_mocks() {
  (stripe.webhooks.constructEvent as any).mockImplementation((body: string) =>
    JSON.parse(body)
  );
  (stripe.paymentIntents.retrieve as any).mockResolvedValue({
    latest_charge: { balance_transaction: { net: 30000, fee: 1500 } },
  });
  (stripe.paymentMethods.retrieve as any).mockResolvedValue({ type: "card" });
}

function make_stripe_event(order_id: string) {
  return JSON.stringify({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_fund_test",
        object: "payment_intent",
        amount: 31500,
        currency: "usd",
        status: "succeeded",
        created: 1700000000,
        payment_method: "pm_fund_test",
        metadata: { order_id },
        invoice: null,
        latest_charge: null,
      },
    },
  });
}

async function fire_webhook(order_id = DON_ID) {
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

function setup_refund_stripe_mocks() {
  (stripe.paymentIntents.retrieve as any).mockResolvedValue({
    id: "pi_fund_test",
    amount: 31500,
    currency: "usd",
    status: "succeeded",
    metadata: { order_id: DON_ID },
    invoice: null,
  });

  (stripe.refunds.create as any).mockResolvedValue({
    id: "re_fund_789",
    payment_intent: "pi_fund_test",
    status: "succeeded",
  });
}

// --- expected values ---
// donation: base=300, tip=15, fa=0, total=315, upusd=1
// stripe: net=300 (30000/100), fee=15 (1500/100)
// partition: base_r=300/315, tip_r=15/315

const TOTAL = 315;
const BASE_R = 300 / TOTAL;
const TIP_R = 15 / TOTAL;
const N = 3;

// per-npo settlement amounts (÷3)
const PER_STTL_BASE = (300 * BASE_R) / N; // ≈95.238
const PER_STTL_FEE_BASE = (15 * BASE_R) / N; // ≈4.762
const TIP = (300 * TIP_R) / N; // ≈4.762

// credit_fa path: fa=0 → fa_added = PER_STTL_BASE
const FA_ADDED = PER_STTL_BASE;

// --- npo a: fsa=2.9%, referrer=30% ---
const A_FSA = FA_ADDED * 0.029;
const A_NET = FA_ADDED - A_FSA;
const A_CF_TIP = TIP * 0.3;
const A_CF_FSA = A_FSA * 0.3;
const A_CF_TOTAL = A_CF_TIP + A_CF_FSA;
const A_TIP_REV = TIP - A_CF_TIP;
const A_FSA_REV = A_FSA - A_CF_FSA;
const A_LIQ = A_NET * 0.6;
const A_LOCK = A_NET * 0.2;
const A_CASH = A_NET * 0.2;

// --- npo b: base=1.5%, no referrer ---
const B_BASE_FEE = FA_ADDED * 0.015;
const B_NET = FA_ADDED - B_BASE_FEE;
const B_TIP_REV = TIP;
const B_FEE_REV = B_BASE_FEE;
const B_CASH = B_NET;

// --- npo c: no fees, referrer=30% ---
const C_NET = FA_ADDED;
const C_CF_TIP = TIP * 0.3;
const C_CF_TOTAL = C_CF_TIP;
const C_TIP_REV = TIP - C_CF_TIP;
const C_LIQ = C_NET * 0.5;
const C_LOCK = C_NET * 0.5;

// form ltd: each npo settlement increments by that npo's net
const FORM_LTD = A_NET + B_NET + C_NET;

const P = 2;

// --- tests ---

describe("fund donation → settlement across 3 NPOs → DB + UI", () => {
  beforeEach(async () => {
    await truncate_all();
    await seed();
    setup_stripe_mocks();
  });

  it("creates 3 dists with per-NPO fees and allocation", async () => {
    const res = await fire_webhook();
    expect(res.status).toBe(200);

    const rows = await test_db.current!.db.select().from(dists);
    expect(rows).toHaveLength(3);

    for (const d of rows) {
      expect(d.donation_id).toBe(DON_ID);
      expect(d.status).toBe("settled");
      expect(d.amount_denom).toBe("USD");
      expect(d.amount).toBeCloseTo(100, P);
      expect(d.amount_usd).toBeCloseTo(100, P);
      expect(d.fee_processing).toBeCloseTo(PER_STTL_FEE_BASE, P);
    }

    const da = rows.find((d) => d.to_id === npo_a_id)!;
    expect(da.fee_fsa).toBeCloseTo(A_FSA, P);
    expect(da.fee_base).toBeCloseTo(0, P);
    expect(da.net).toBeCloseTo(A_NET, P);
    expect(da.alloc).toEqual({ liq: 60, lock: 20, cash: 20 });

    const db_ = rows.find((d) => d.to_id === npo_b_id)!;
    expect(db_.fee_base).toBeCloseTo(B_BASE_FEE, P);
    expect(db_.fee_fsa).toBeCloseTo(0, P);
    expect(db_.net).toBeCloseTo(B_NET, P);
    expect(db_.alloc).toEqual({ liq: 0, lock: 0, cash: 100 });

    const dc = rows.find((d) => d.to_id === npo_c_id)!;
    expect(dc.fee_base).toBeCloseTo(0, P);
    expect(dc.fee_fsa).toBeCloseTo(0, P);
    expect(dc.net).toBeCloseTo(C_NET, P);
    expect(dc.alloc).toEqual({ liq: 50, lock: 50, cash: 0 });
  });

  it("creates correct rev_logs per NPO based on fee settings", async () => {
    await fire_webhook();

    const logs = await test_db.current!.db.select().from(rev_logs);
    expect(logs).toHaveLength(5);

    // npo a: tip + fsa-fee (with referral commission)
    const a_logs = logs.filter((l) => l.npo_id === npo_a_id);
    expect(a_logs).toHaveLength(2);
    const a_tip = a_logs.find((l) => l.type === "tip")!;
    expect(a_tip.gross).toBeCloseTo(TIP, P);
    expect(a_tip.commission).toBeCloseTo(A_CF_TIP, P);
    expect(a_tip.revenue).toBeCloseTo(A_TIP_REV, P);
    expect(a_tip.status).toBe("final");
    const a_fsa = a_logs.find((l) => l.type === "fsa-fee")!;
    expect(a_fsa.gross).toBeCloseTo(A_FSA, P);
    expect(a_fsa.commission).toBeCloseTo(A_CF_FSA, P);
    expect(a_fsa.revenue).toBeCloseTo(A_FSA_REV, P);

    // npo b: tip + base-fee (no commission)
    const b_logs = logs.filter((l) => l.npo_id === npo_b_id);
    expect(b_logs).toHaveLength(2);
    const b_tip = b_logs.find((l) => l.type === "tip")!;
    expect(b_tip.gross).toBeCloseTo(TIP, P);
    expect(b_tip.commission).toBe(0);
    expect(b_tip.revenue).toBeCloseTo(B_TIP_REV, P);
    const b_base = b_logs.find((l) => l.type === "base-fee")!;
    expect(b_base.gross).toBeCloseTo(B_BASE_FEE, P);
    expect(b_base.commission).toBe(0);
    expect(b_base.revenue).toBeCloseTo(B_FEE_REV, P);

    // npo c: tip only (with referral commission)
    const c_logs = logs.filter((l) => l.npo_id === npo_c_id);
    expect(c_logs).toHaveLength(1);
    expect(c_logs[0].type).toBe("tip");
    expect(c_logs[0].gross).toBeCloseTo(TIP, P);
    expect(c_logs[0].commission).toBeCloseTo(C_CF_TIP, P);
    expect(c_logs[0].revenue).toBeCloseTo(C_TIP_REV, P);
  });

  it("creates referral commissions only for NPOs with active referrers", async () => {
    await fire_webhook();

    const rows = await test_db.current!.db.select().from(referrer_commissions);
    expect(rows).toHaveLength(2);

    const a_comm = rows.find((r) => r.npo_id === npo_a_id)!;
    expect(a_comm.referrer_user).toBe("PREF-TEST");
    expect(a_comm.amount).toBeCloseTo(A_CF_TOTAL, P);
    expect(a_comm.status).toBe("pending");

    const c_comm = rows.find((r) => r.npo_id === npo_c_id)!;
    expect(c_comm.referrer_user).toBe("UREF-TEST");
    expect(c_comm.amount).toBeCloseTo(C_CF_TOTAL, P);
    expect(c_comm.status).toBe("pending");

    expect(rows.find((r) => r.npo_id === npo_b_id)).toBeUndefined();
  });

  it("creates bal_txs and payouts matching per-NPO allocation", async () => {
    await fire_webhook();

    const txs = await test_db.current!.db.select().from(bal_txs);
    expect(txs).toHaveLength(4);

    const a_lock = txs.find(
      (t) => t.npo_id === npo_a_id && t.account === "lock"
    )!;
    expect(a_lock.amount).toBeCloseTo(A_LOCK, P);
    expect(a_lock.status).toBe("final");
    expect(a_lock.account_other).toBe("donation");

    const a_liq = txs.find(
      (t) => t.npo_id === npo_a_id && t.account === "liq"
    )!;
    expect(a_liq.amount).toBeCloseTo(A_LIQ, P);

    const c_lock = txs.find(
      (t) => t.npo_id === npo_c_id && t.account === "lock"
    )!;
    expect(c_lock.amount).toBeCloseTo(C_LOCK, P);

    const c_liq = txs.find(
      (t) => t.npo_id === npo_c_id && t.account === "liq"
    )!;
    expect(c_liq.amount).toBeCloseTo(C_LIQ, P);

    expect(txs.find((t) => t.npo_id === npo_b_id)).toBeUndefined();

    const pos = await test_db.current!.db.select().from(payouts);
    expect(pos).toHaveLength(2);

    const a_po = pos.find((p) => p.npo_id === npo_a_id)!;
    expect(a_po.amount).toBeCloseTo(A_CASH, P);
    expect(a_po.type).toBe("pending");
    expect(a_po.source).toBe("donation");

    const b_po = pos.find((p) => p.npo_id === npo_b_id)!;
    expect(b_po.amount).toBeCloseTo(B_CASH, P);
    expect(b_po.type).toBe("pending");
  });

  it("updates each NPO's balances according to their allocation", async () => {
    await fire_webhook();

    const all = await test_db
      .current!.db.select({
        id: npos.id,
        liq: npos.liq,
        lock_units: npos.lock_units,
        cash: npos.cash,
      })
      .from(npos);

    const a = all.find((n) => n.id === npo_a_id)!;
    expect(a.liq).toBeCloseTo(A_LIQ, P);
    expect(a.lock_units).toBeCloseTo(A_LOCK, P);
    expect(a.cash).toBeCloseTo(A_CASH, P);

    const b = all.find((n) => n.id === npo_b_id)!;
    expect(b.liq).toBe(0);
    expect(b.lock_units).toBe(0);
    expect(b.cash).toBeCloseTo(B_CASH, P);

    const c = all.find((n) => n.id === npo_c_id)!;
    expect(c.liq).toBeCloseTo(C_LIQ, P);
    expect(c.lock_units).toBeCloseTo(C_LOCK, P);
    expect(c.cash).toBe(0);
  });

  it("emits donation.settled.dist event for fund", async () => {
    await fire_webhook();

    const settled = _emitted.filter((e) => e.id === "don-dist");
    // one event per NPO in the fund
    expect(settled).toHaveLength(3);

    const total_net = settled.reduce((sum, e) => sum + e.payload.net, 0);
    expect(total_net).toBeCloseTo(FORM_LTD, P);
    for (const e of settled) {
      expect(e.payload.amount_denom).toBe("USD");
    }
  });

  it("increments form ltd and ltd_count after settlement", async () => {
    await fire_webhook();

    const [form] = await test_db
      .current!.db.select()
      .from(forms)
      .where(eq(forms.id, FORM_ID));
    // each npo settlement increments form ltd by its net, ltd_count by 1
    expect(form.ltd).toBeCloseTo(FORM_LTD, P);
    expect(form.ltd_count).toBe(3);
  });

  it("v_donation_total_usd aggregates to correct fund total", async () => {
    await fire_webhook();

    const [row] = await test_db
      .current!.db.select()
      .from(v_donation_total_usd)
      .where(eq(v_donation_total_usd.fund_id, FUND_ID));
    expect(row.total).toBeCloseTo(FORM_LTD, P);
  });

  it("fund page Target shows progress after settlement", async () => {
    await fire_webhook();

    const Stub = createRoutesStub([
      {
        path: "/fundraisers/:fund_id",
        Component: FundPage,
        HydrateFallback: () => null,
        loader: fund_loader as any,
      },
    ]);

    const screen = await render(
      <Stub
        initialEntries={[`/fundraisers/${FUND_ID}`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    await expect.element(screen.getByText("Test Fund")).toBeInTheDocument();
    // fund page renders member NPOs
    await expect.element(screen.getByText("Fund NPO A")).toBeInTheDocument();
    await expect.element(screen.getByText("Fund NPO B")).toBeInTheDocument();
    await expect.element(screen.getByText("Fund NPO C")).toBeInTheDocument();
    // Target shows raised from v_donation_total_usd (sum of nets), $1,000 goal from target_number
    expect(screen.getByText("$282").elements().length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByText("$1,000").elements().length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByText("Raised").elements().length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByText("Goal").elements().length).toBeGreaterThanOrEqual(
      1
    );
  });

  it("profile page Fundraisers section shows fund Target", async () => {
    await fire_webhook();

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
        initialEntries={[`/marketplace/${npo_a_id}`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    await expect
      .element(screen.getByText("Test Fund", { exact: true }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("$282")).toBeInTheDocument();
    await expect.element(screen.getByText("$1,000")).toBeInTheDocument();
  });

  it("user-dashboard forms page shows form with updated ltd Target", async () => {
    await fire_webhook();

    const mdlwr = [
      async ({ context }: any, next: any) => {
        context.set(user_ctx, {
          id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          email: "fund-creator@test.com",
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

    // page heading loads
    await expect
      .element(screen.getByRole("heading", { name: /Donation forms/i }))
      .toBeInTheDocument();
    // form card renders with tag and Target showing ltd progress
    await expect.element(screen.getByText("user-form-tag")).toBeInTheDocument();
    await expect.element(screen.getByText("$5,000")).toBeInTheDocument();
    expect(screen.getByText("Raised").elements().length).toBeGreaterThanOrEqual(
      1
    );
  });

  it("platform-admin refunds page shows fund donation", async () => {
    await fire_webhook();

    const mock_refunds_loader = () => ({
      items: [
        {
          id: "pi_fund_test",
          donation_id: "pi_fund_test",
          amount_base: 315,
          amount_tip: 15,
          amount_fee_allowance: 0,
          currency: "USD",
          email: "donor@test.com",
          npo_name: "Test Fund",
          sttl_fee: null,
          via: "stripe:card",
          created_at: new Date(1700000000 * 1000).toISOString(),
          status: "succeeded",
        },
      ],
    });

    const Stub = createRoutesStub([
      {
        path: "/refunds",
        Component: RefundsListPage,
        HydrateFallback: () => null,
        loader: mock_refunds_loader as any,
        children: [
          {
            path: ":donation_id/refund",
            Component: RefundDialog,
            loader: refund_loader as any,
            action: refund_action as any,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub initialEntries={["/refunds"]} future={{ v8_middleware: true }} />
    );
    render_screen = screen;

    await expect
      .element(screen.getByText("donor@test.com"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Test Fund")).toBeInTheDocument();
    await expect.element(screen.getByText(/315/)).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /Refund/i }))
      .toBeInTheDocument();
  });

  it("refund dialog shows preview with 3 NPO distributions", async () => {
    await fire_webhook();
    setup_refund_stripe_mocks();

    const empty_list = () => ({
      items: [],
    });

    const Stub = createRoutesStub([
      {
        path: "/refunds",
        Component: RefundsListPage,
        HydrateFallback: () => null,
        loader: empty_list as any,
        children: [
          {
            path: ":donation_id/refund",
            Component: RefundDialog,
            loader: refund_loader as any,
            action: refund_action as any,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub
        initialEntries={[`/refunds/${DON_ID}/refund`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    await expect
      .element(screen.getByText("Refund preview"))
      .toBeInTheDocument();
    // 3 NPOs in preview table
    await expect.element(screen.getByText("Fund NPO A")).toBeInTheDocument();
    await expect.element(screen.getByText("Fund NPO B")).toBeInTheDocument();
    await expect.element(screen.getByText("Fund NPO C")).toBeInTheDocument();
    // effects: A has liq+lock+cash, B has cash only, C has liq+lock
    expect(
      screen.getByText("Savings balance").elements().length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("Investment balance").elements().length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("Grant payout").elements().length
    ).toBeGreaterThanOrEqual(1);
    // commissions for A and C
    expect(screen.getByText("Commission").elements()).toHaveLength(2);
    // confirm enabled
    const btn = screen.getByRole("button", { name: /Confirm refund/i });
    await expect.element(btn).not.toBeDisabled();
  });

  it("confirming fund refund invokes stripe.refunds.create and shows success", async () => {
    await fire_webhook();
    setup_refund_stripe_mocks();

    const empty_list = () => ({
      items: [],
    });

    const Stub = createRoutesStub([
      {
        path: "/refunds",
        Component: RefundsListPage,
        HydrateFallback: () => null,
        loader: empty_list as any,
        children: [
          {
            path: ":donation_id/refund",
            Component: RefundDialog,
            loader: refund_loader as any,
            action: refund_action as any,
          },
        ],
      },
    ]);

    const screen = await render(
      <Stub
        initialEntries={[`/refunds/${DON_ID}/refund`]}
        future={{ v8_middleware: true }}
      />
    );
    render_screen = screen;

    const confirm_btn = screen.getByRole("button", {
      name: /Confirm refund/i,
    });
    await expect.element(confirm_btn).toBeVisible();
    // base-ui inert overlay intercepts pointer events; use native DOM click
    (confirm_btn.element() as HTMLElement).click();

    await expect
      .element(screen.getByText("Refund processed"))
      .toBeInTheDocument();
    expect(stripe.refunds.create).toHaveBeenCalledWith({
      payment_intent: "pi_fund_test",
    });
  });
});
