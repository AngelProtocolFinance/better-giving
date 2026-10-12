import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

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

const { handle_account_updated } = await import("./account-updated");
const { seed_npo } = await import("#/__tests__/fixtures/funds");
const { npos } = await import("$/pg/schema/npo");

const db = () => test_db.current!.db;

const T = Date.parse("2026-10-12T12:00:00Z") / 1000;

const event = (
  account: string,
  created: number,
  o: Partial<Stripe.Account> = {}
) =>
  ({
    id: `evt_${account}_${created}`,
    object: "event",
    type: "account.updated",
    account,
    created,
    api_version: "2026-08-26.dahlia",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: account,
        object: "account",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { currently_due: [] },
        ...o,
      },
    },
  }) as unknown as Stripe.AccountUpdatedEvent;

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

describe("account.updated → npo readiness mirror", () => {
  it("writes the account's readiness onto its npo, stamped with the event time", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-WH-1",
      stripe_account_id: "acct_wh_1",
    });

    await handle_account_updated(
      event("acct_wh_1", T, {
        payouts_enabled: false,
        requirements: { currently_due: ["external_account"] } as any,
      })
    );

    const r = await row(npo!.id);
    expect(r.stripe_charges_enabled).toBe(true);
    expect(r.stripe_payouts_enabled).toBe(false);
    expect(r.stripe_details_submitted).toBe(true);
    expect(r.stripe_requirements_due).toEqual(["external_account"]);
    expect(r.stripe_synced_at).toBe("2026-10-12T12:00:00.000Z");
  });

  // stripe doesn't deliver in order: a late event must not undo a newer read
  it("leaves the mirror alone for an event older than the last sync", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-WH-2",
      stripe_account_id: "acct_wh_2",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_synced_at: "2026-10-12T12:00:05.000Z",
    });

    const written = await handle_account_updated(
      event("acct_wh_2", T, { charges_enabled: false, payouts_enabled: false })
    );

    expect(written).toBe(false);
    const r = await row(npo!.id);
    expect(r.stripe_charges_enabled).toBe(true);
    expect(r.stripe_synced_at).toBe("2026-10-12T12:00:05.000Z");
  });

  it("an account no npo holds changes nothing", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-WH-3",
      stripe_account_id: "acct_wh_3",
    });

    const written = await handle_account_updated(event("acct_nobody", T));

    expect(written).toBe(false);
    const r = await row(npo!.id);
    expect(r.stripe_charges_enabled).toBe(false);
    expect(r.stripe_synced_at).toBeNull();
  });
});
