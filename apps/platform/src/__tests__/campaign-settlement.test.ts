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
const emitted: { id: string; payload: any; dedupe: string }[] = [];

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
    paymentIntents: { retrieve: vi.fn() },
    paymentMethods: { retrieve: vi.fn() },
    invoices: { retrieve: vi.fn() },
    invoicePayments: { list: vi.fn(async () => ({ data: [] })) },
    refunds: { create: vi.fn() },
  },
}));

vi.mock("$/email", () => ({
  send_email: vi.fn().mockResolvedValue({ MessageId: "test-msg-id" }),
  ses: { send: vi.fn() },
  sender: "test@test.com",
}));

vi.mock("$/kit/queue", () => ({
  enqueue: vi.fn(
    async (...msgs: { id: string; payload: any; dedupe: string }[]) => {
      emitted.push(...msgs);
    }
  ),
}));

vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: vi.fn() },
}));

vi.mock("#/errors/report", () => ({
  report_error: vi.fn(),
  report_degraded: vi.fn(),
  report_null: vi.fn(() => null),
  report_undefined: vi.fn(() => undefined),
  report_msg: vi.fn((_: unknown, m: string) => m),
  report_obj: vi.fn((_: unknown, v: unknown) => v),
  report_resp: vi.fn(
    (_: unknown, message?: string, status = 500) =>
      new Response(message ?? "Server Error", { status })
  ),
}));

import type { IDonation } from "@/donations";
import { donation_put } from "$/pg/queries/donation";
import { user } from "$/pg/schema/auth";
import { bal_txs } from "$/pg/schema/bal-tx";
import { campaign_members, campaigns } from "$/pg/schema/campaign";
import { dists } from "$/pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "$/pg/schema/donation";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import { payouts } from "$/pg/schema/payout";
import { v_campaign_total_usd } from "$/pg/schema/views";
import { create_test_db } from "$/pg/test-utils/pglite";
import { reverse_charge, WHOLE } from "$/refund/reverse";
import {
  seed_nav_log,
  seed_user,
  settle_via_webhook,
  setup_stripe_mocks,
} from "./fixtures/settlement";

const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CAMPAIGN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

let npo_id: number;

beforeEach(async () => {
  emitted.length = 0;
  const db = test_db.current!.db;
  await db.delete(payouts);
  await db.delete(bal_txs);
  await db.delete(dists);
  await db.delete(donation_settlements);
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(nav_holders);
  await db.delete(nav_log_positions);
  await db.delete(nav_logs);
  await db.delete(campaign_members);
  await db.delete(campaigns);
  await db.delete(npos);
  await db.delete(user);
  await seed_user(db, {
    id: USER,
    email: "ada-settle@test.com",
    first_name: "Ada",
    last_name: "Admin",
  });
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-CAMP-STTL",
      name: "Settlement NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      active: true,
      fiscal_sponsored: false,
      hide_bg_tip: false,
      allocation: { liq: 100, lock: 0, cash: 0 },
    })
    .returning();
  npo_id = npo!.id;
  await db.insert(campaigns).values({
    id: CAMPAIGN,
    owner_npo_id: npo_id,
    creator_id: USER,
    name: "Winter",
    slug: "winter",
    status: "live",
    description_pt: "[]",
  });
  await db.insert(campaign_members).values({
    campaign_id: CAMPAIGN,
    npo_id,
  });
  await seed_nav_log(db, new Date().toISOString());
  setup_stripe_mocks({ net: 10000, fee: 0 });
});

function gift(id: string, campaign_id?: string): IDonation {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id,
    upusd: 1,
    status: "intent",
    amount: { base: 100, tip: 0, fee_allowance: 0 },
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe",
    to_id: String(npo_id),
    to_name: "Settlement NPO",
    to_type: "npo",
    to_tip_allowed: true,
    to_members: [],
    from_email: "donor@test.com",
    from_name: "Jane Donor",
    campaign_id,
    created_at: now,
    updated_at: now,
  };
}

async function settle(order_id: string) {
  return settle_via_webhook({
    db: test_db.current!.db,
    emitted,
    intent: {
      order_id,
      pi_id: `pi_${order_id}`,
      amount: 10000,
      payment_method: "pm_test",
    },
  });
}

async function view_total() {
  const [row] = await test_db
    .current!.db.select()
    .from(v_campaign_total_usd)
    .where(eq(v_campaign_total_usd.campaign_id, CAMPAIGN));
  return row?.total ?? 0;
}

describe("campaign settlement", () => {
  it("settles like a profile gift, and the view follows settled net", async () => {
    const db = test_db.current!.db;
    await donation_put(db as any, gift("profile"));
    await donation_put(db as any, gift("attributed", CAMPAIGN));
    await donation_put(db as any, gift("second", CAMPAIGN));

    expect((await settle("profile")).status).toBe(200);
    expect((await settle("attributed")).status).toBe(200);
    expect((await settle("second")).status).toBe(200);

    const donations_rows = await db.select().from(donations);
    const by_id = Object.fromEntries(donations_rows.map((r) => [r.id, r]));
    expect(by_id.profile?.campaign_id).toBeNull();
    expect(by_id.attributed?.campaign_id).toBe(CAMPAIGN);
    expect(by_id.profile?.status).toBe("settled");
    expect(by_id.attributed?.status).toBe("settled");

    const recipients = await db.select().from(donation_recipients);
    const profile_r = recipients.find((r) => r.donation_id === "profile")!;
    const campaign_r = recipients.find((r) => r.donation_id === "attributed")!;
    expect(campaign_r).toMatchObject({
      npo_id,
      fund_id: null,
      type: profile_r.type,
      name: profile_r.name,
    });

    const dist_rows = await db.select().from(dists);
    const profile_d = dist_rows.find((r) => r.donation_id === "profile")!;
    const campaign_d = dist_rows.find((r) => r.donation_id === "attributed")!;
    const second_d = dist_rows.find((r) => r.donation_id === "second")!;
    expect(campaign_d).toMatchObject({
      status: "settled",
      fund_id: null,
      to_id: profile_d.to_id,
      net: profile_d.net,
    });

    const txs = await db.select().from(bal_txs);
    const liq = txs.filter((t) => t.account === "liq");
    expect(liq).toHaveLength(3);
    expect(new Set(liq.map((t) => t.amount)).size).toBe(1);

    const raised = campaign_d.net! + second_d.net!;
    expect(await view_total()).toBeCloseTo(raised, 2);

    const partial = await reverse_charge({
      donation_id: "attributed",
      rail: "stripe",
      source: "refund",
      share: { taken: 1, of: 2 },
      alert_from: "charge-refunded",
      notice: { id: "evt_partial", lines: [] },
    });
    expect(partial.status === "reversed").toBe(false);
    const [still] = await db
      .select()
      .from(dists)
      .where(eq(dists.donation_id, "attributed"));
    expect(still?.status).toBe("settled");
    expect(await view_total()).toBeCloseTo(raised, 2);

    const full = await reverse_charge({
      donation_id: "second",
      rail: "stripe",
      source: "refund",
      share: WHOLE,
      alert_from: "charge-refunded",
      notice: { id: "evt_whole", lines: [] },
    });
    expect(full).toMatchObject({ status: "reversed" });
    expect(await view_total()).toBeCloseTo(campaign_d.net!, 2);
  }, 30_000);
});
