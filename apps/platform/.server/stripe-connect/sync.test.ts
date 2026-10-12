import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { npos } from "../pg/schema/npo";
import type { TestDb } from "../pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const retrieve = vi.hoisted(() => vi.fn());
const report_error = vi.hoisted(() => vi.fn());

vi.mock("../pg/db", () => ({
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
vi.mock("../kit/stripe", () => ({ stripe: { accounts: { retrieve } } }));
vi.mock("#/errors/report", () => ({ report_error }));

import { create_test_db } from "../pg/test-utils/pglite";
import { account_status_live, sync_npo_account } from "./sync";

const db = () => test_db.current!.db;

const stripe_account = (id: string) => ({
  id,
  object: "account",
  charges_enabled: true,
  payouts_enabled: false,
  details_submitted: true,
  requirements: { currently_due: ["external_account"] },
});

const row = async (id: number) => {
  const [r] = await db().select().from(npos).where(eq(npos.id, id));
  return r!;
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(() => {
  retrieve.mockReset();
  report_error.mockReset();
});

describe("sync_npo_account", () => {
  test("writes the account's readiness onto the npo and returns it", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-SYNC-1",
      stripe_account_id: "acct_sync_1",
    });
    retrieve.mockResolvedValue(stripe_account("acct_sync_1"));
    const before = Date.now();

    const m = await sync_npo_account(npo!.id);

    expect(retrieve).toHaveBeenCalledWith("acct_sync_1");
    const mirror = {
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
      requirements_due: ["external_account"],
    };
    expect(m).toEqual(mirror);
    const r = await row(npo!.id);
    expect({
      charges_enabled: r.stripe_charges_enabled,
      payouts_enabled: r.stripe_payouts_enabled,
      details_submitted: r.stripe_details_submitted,
      requirements_due: r.stripe_requirements_due,
    }).toEqual(mirror);
    expect(Date.parse(r.stripe_synced_at!)).toBeGreaterThanOrEqual(
      before - 1000
    );
  });

  test("an npo with no account is null and asks stripe nothing", async () => {
    const npo = await seed_npo(db(), { registration_number: "EIN-SYNC-2" });

    await expect(sync_npo_account(npo!.id)).resolves.toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  // right after a connect stripe is still verifying, so an account.updated
  // can land while this read is in flight
  test("an event written while stripe was answering is kept", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-SYNC-4",
      stripe_account_id: "acct_sync_4",
    });
    retrieve.mockImplementation(async (id: string) => {
      await db()
        .update(npos)
        .set({
          stripe_charges_enabled: true,
          stripe_payouts_enabled: true,
          stripe_details_submitted: true,
          stripe_requirements_due: [],
          stripe_synced_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .where(eq(npos.id, npo!.id));
      return {
        ...stripe_account(id),
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      };
    });

    const m = await sync_npo_account(npo!.id);

    expect(m).toEqual({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements_due: [],
    });
    const r = await row(npo!.id);
    expect(r.stripe_charges_enabled).toBe(true);
    expect(r.stripe_payouts_enabled).toBe(true);
    expect(r.stripe_details_submitted).toBe(true);
  });

  // a replace landing while the old account is being read: the old account's
  // flags must not end up describing the new one
  test("re-reads the new account when it changed mid-read", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-SYNC-3",
      stripe_account_id: "acct_old",
    });
    retrieve
      .mockImplementationOnce(async (id: string) => {
        await db()
          .update(npos)
          .set({ stripe_account_id: "acct_new" })
          .where(eq(npos.id, npo!.id));
        return { ...stripe_account(id), payouts_enabled: true };
      })
      .mockResolvedValueOnce({
        ...stripe_account("acct_new"),
        charges_enabled: false,
        details_submitted: false,
      });

    const m = await sync_npo_account(npo!.id);

    expect(retrieve.mock.calls).toEqual([["acct_old"], ["acct_new"]]);
    const r = await row(npo!.id);
    expect(m?.charges_enabled).toBe(false);
    expect(r.stripe_charges_enabled).toBe(false);
    expect(r.stripe_payouts_enabled).toBe(false);
    expect(r.stripe_details_submitted).toBe(false);
  });
});

describe("account_status_live", () => {
  test("reads the status off the account stripe returns", async () => {
    retrieve.mockResolvedValue(stripe_account("acct_live_1"));

    await expect(account_status_live("acct_live_1")).resolves.toBe(
      "incomplete"
    );
    expect(retrieve).toHaveBeenCalledWith("acct_live_1");
  });

  test("a stripe error is reported and reads as pending", async () => {
    const err = new Stripe.errors.StripePermissionError({
      message: "The provided key does not have access to account",
    });
    retrieve.mockRejectedValue(err);

    await expect(account_status_live("acct_gone")).resolves.toBe("pending");
    expect(report_error).toHaveBeenCalledWith(err);
  });
});
