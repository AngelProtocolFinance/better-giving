import { eq } from "drizzle-orm";
import type Stripe from "stripe";
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
const enqueue = vi.hoisted(() => vi.fn());

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

vi.mock("$/kit/queue", () => ({ enqueue }));

const { handle_account_deauthorized } = await import("./account-deauthorized");
const { seed_npo } = await import("#/__tests__/fixtures/funds");
const { npos } = await import("$/pg/schema/npo");
const { registrations } = await import("$/pg/schema/registration");
const { banking_apps } = await import("$/pg/schema/banking");
const { npo_get, npo_stripe_connect } = await import("$/pg/queries/npo");
const { is_routable, routing_npo } = await import(
  "@/stripe-connect/eligibility"
);

const db = () => test_db.current!.db;

const T = Date.parse("2026-10-12T12:00:00Z") / 1000;

const event = (account: string, created: number) =>
  ({
    id: `evt_deauth_${account}_${created}`,
    object: "event",
    type: "account.application.deauthorized",
    account,
    created,
    api_version: "2026-08-26.dahlia",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: { id: "ca_platform", object: "application", name: null } },
  }) as unknown as Stripe.AccountApplicationDeauthorizedEvent;

// the input settle_npo decides routing on, read the way it reads it
const routes = async (id: number) => {
  const npo = (await npo_get(id))!;
  return is_routable(routing_npo(npo), true);
};

const row = async (id: number) => {
  const [r] = await db().select().from(npos).where(eq(npos.id, id));
  return r!;
};

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(() => {
  enqueue.mockReset();
});

describe("account.application.deauthorized → npo disconnected", () => {
  it("stamps the npo holding the account with the event's time, keeping the account", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-DEAUTH-1",
      stripe_account_id: "acct_deauth_1",
    });

    const out = await handle_account_deauthorized(event("acct_deauth_1", T));

    expect(out).toEqual({ status: "marked", npo_id: npo!.id });
    const r = await row(npo!.id);
    expect(r.stripe_deauthorized_at).toBe("2026-10-12T12:00:00.000Z");
    expect(r.stripe_account_id).toBe("acct_deauth_1");
  });

  it("a ready npo stops routing once it disconnects", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-DEAUTH-ROUTE",
      hq_country: "United States",
      stripe_account_id: "acct_deauth_route",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    });
    expect(await routes(npo!.id)).toBe(true);

    await handle_account_deauthorized(event("acct_deauth_route", T));

    expect(await routes(npo!.id)).toBe(false);
  });

  // stripe redelivers, and not in order: the stamp is the first disconnect
  it("a redelivered or older event leaves the earliest stamp", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-DEAUTH-3",
      stripe_account_id: "acct_deauth_3",
    });

    await handle_account_deauthorized(event("acct_deauth_3", T + 60));
    await handle_account_deauthorized(event("acct_deauth_3", T));
    await handle_account_deauthorized(event("acct_deauth_3", T + 60));

    expect((await row(npo!.id)).stripe_deauthorized_at).toBe(
      "2026-10-12T12:00:00.000Z"
    );
  });

  // stripe redelivers for days: the disconnect it is retrying predates the
  // npo connecting the account again, and must not take the new one down
  it("a disconnect redelivered after a reconnect leaves the npo connected and routable", async () => {
    const acct = "acct_deauth_reconnect";
    const npo = await seed_npo(db(), {
      registration_number: "EIN-DEAUTH-RECONNECT",
      hq_country: "United States",
      stripe_account_id: acct,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    });
    const disconnect = event(acct, T);
    await handle_account_deauthorized(disconnect);
    await npo_stripe_connect(db() as any, npo!.id, acct, acct, {
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_requirements_due: [],
      stripe_synced_at: new Date().toISOString(),
    });
    enqueue.mockReset();

    const out = await handle_account_deauthorized(disconnect);

    expect(out).toEqual({ status: "stale", npo_id: npo!.id });
    expect((await row(npo!.id)).stripe_deauthorized_at).toBeNull();
    expect(await routes(npo!.id)).toBe(true);
    // it has no bank details: a disconnect taken as live would flag ops
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("an account no npo holds is acknowledged and stamps nothing", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-DEAUTH-2",
      stripe_account_id: "acct_deauth_2",
    });

    const out = await handle_account_deauthorized(event("acct_nobody", T));

    expect(out).toEqual({ status: "unknown" });
    expect((await row(npo!.id)).stripe_deauthorized_at).toBeNull();
  });

  // a registration keeps no disconnect stamp: holding a dead account would
  // only make the applicant confirm replacing it before connecting again
  it("an applicant who disconnects no longer holds the account on their registration", async () => {
    const reg_id = crypto.randomUUID();
    await db().insert(registrations).values({
      id: reg_id,
      r_id: "deauth@reg.test",
      status: "01",
      o_stripe_account_id: "acct_deauth_reg",
    });

    const out = await handle_account_deauthorized(event("acct_deauth_reg", T));

    expect(out).toEqual({ status: "reg_cleared", reg_id });
    const [r] = await db()
      .select({ acct: registrations.o_stripe_account_id })
      .from(registrations)
      .where(eq(registrations.id, reg_id));
    expect(r!.acct).toBeNull();
  });

  // its share keeps settling pooled, and pooled pays out over wise to the
  // default bank details: without them it sits in the npo's balance
  describe("a disconnect leaving nothing to pay out to", () => {
    const seed_with_bank = async (
      tag: string,
      status?: "default" | "under-review"
    ) => {
      const npo = await seed_npo(db(), {
        registration_number: `EIN-${tag}`,
        stripe_account_id: `acct_${tag}`,
      });
      if (status) {
        await db()
          .insert(banking_apps)
          .values({
            id: `wise-${tag}`,
            npo_id: npo!.id,
            status,
          });
      }
      return npo!;
    };

    it.each([
      ["no bank details", undefined],
      ["bank details still in review", "under-review" as const],
    ])("is flagged to ops when the npo has %s", async (_case, status) => {
      const npo = await seed_with_bank(`deauth-nobank-${status}`, status);
      const ev = event(`acct_deauth-nobank-${status}`, T);

      await handle_account_deauthorized(ev);

      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "fiat-notice",
          // keyed on the event: a redelivery collapses into one notice
          payload: expect.objectContaining({
            id: ev.id,
            alert: expect.objectContaining({
              body: expect.stringContaining(`npo ${npo.id}`),
            }),
          }),
        })
      );
    });

    it("is not flagged when the npo's payouts have somewhere to go", async () => {
      await seed_with_bank("deauth-bank", "default");

      await handle_account_deauthorized(event("acct_deauth-bank", T));

      expect(enqueue).not.toHaveBeenCalled();
    });
  });
});
