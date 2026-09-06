import { settle_donation } from "#/routes/api.q-handler.$event/settle-donation";
import { action as stripe_action } from "#/routes/api.stripe-webhook/route";
import { user_ctx } from "$/auth/test-utils";
import { stripe } from "$/kit/stripe";
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
import { funds } from "$/pg/schema/fund";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import { payouts } from "$/pg/schema/payout";
import { programs } from "$/pg/schema/program";
import { referrer_commissions } from "$/pg/schema/referrer";
import { rev_logs } from "$/pg/schema/revenue";
import type { TestDb } from "$/pg/test-utils/pglite";

export type Db = TestDb["db"];

/** shape of the messages each test file's `$/kit/queue` mock captures */
export interface IQEvent {
  id: string;
  payload: any;
  dedupe: string;
}

export async function truncate_all(db: Db) {
  // FK-safe order; a table absent from a given test's seed truncates to a no-op
  await db.delete(donation_messages);
  await db.delete(referrer_commissions);
  await db.delete(payouts);
  await db.delete(bal_txs);
  await db.delete(rev_logs);
  await db.delete(dists);
  await db.delete(donation_settlements);
  await db.delete(donation_tributes);
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(nav_holders);
  await db.delete(nav_logs);
  await db.delete(forms);
  await db.delete(funds);
  await db.delete(programs);
  await db.delete(npos);
  await db.delete(user);
}

export async function seed_user(
  db: Db,
  u: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    referral_code?: string;
  }
) {
  await db.insert(user).values({
    ...u,
    name: `${u.first_name} ${u.last_name}`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function seed_form(db: Db, f: typeof forms.$inferInsert) {
  await db
    .insert(forms)
    .values({ status: "active", ltd: 0, ltd_count: 0, ...f });
}

/** settlement allocation reads nav price off this log — no log, no allocation */
export async function seed_nav_log(db: Db, date: string) {
  await db.transaction(async (tx) => {
    await tx.insert(nav_logs).values({
      date,
      reason: "test",
      units: 100,
      price: 1,
      price_updated: date,
    });
    await tx.insert(nav_log_positions).values({
      date,
      ticker: "CASH",
      qty: 1000,
      price: 1,
      value: 1000,
      price_date: date,
    });
  });
}

export interface IIntent {
  order_id: string;
  pi_id: string;
  /** total charged, in cents */
  amount: number;
  payment_method: string;
}

export function stripe_event(i: IIntent) {
  return JSON.stringify({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: i.pi_id,
        object: "payment_intent",
        amount: i.amount,
        currency: "usd",
        status: "succeeded",
        created: 1700000000,
        payment_method: i.payment_method,
        metadata: { order_id: i.order_id },
        invoice: null,
        latest_charge: null,
      },
    },
  });
}

/** `net` and `fee` are the balance-transaction cents the settlement partitions */
export function setup_stripe_mocks(sttl: { net: number; fee: number }) {
  (stripe.webhooks.constructEvent as any).mockImplementation((body: string) =>
    JSON.parse(body)
  );
  (stripe.paymentIntents.retrieve as any).mockResolvedValue({
    latest_charge: { balance_transaction: sttl },
  });
  (stripe.paymentMethods.retrieve as any).mockResolvedValue({ type: "card" });
}

export function setup_refund_stripe_mocks(i: IIntent & { refund_id: string }) {
  (stripe.paymentIntents.retrieve as any).mockResolvedValue({
    id: i.pi_id,
    amount: i.amount,
    currency: "usd",
    status: "succeeded",
    metadata: { order_id: i.order_id },
    invoice: null,
  });

  (stripe.refunds.create as any).mockResolvedValue({
    id: i.refund_id,
    payment_intent: i.pi_id,
    status: "succeeded",
  });
}

export async function settle_via_webhook(o: {
  db: Db;
  emitted: IQEvent[];
  intent: IIntent;
}) {
  o.emitted.length = 0;
  const res = await stripe_action({
    request: new Request("http://localhost/api/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: stripe_event(o.intent),
    }),
    params: {},
    context: {} as any,
    url: new URL("http://localhost/api/stripe-webhook"),
    pattern: "/api/stripe-webhook",
  });

  // replay settlement events outside the transaction (pglite is single-connection)
  for (const { id, payload } of o.emitted) {
    if (id === "don-sttl-dist") {
      await settle_donation(o.db as any, payload);
    }
  }

  return res;
}

export function user_middleware(id: string, email: string) {
  return [
    async ({ context }: any, next: any) => {
      context.set(user_ctx, {
        id,
        email,
        groups: [],
        endowments: [],
        funds: [],
        token_refresh: "",
      });
      return next();
    },
  ];
}
