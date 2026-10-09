import { eq } from "drizzle-orm";
import { createRoutesStub } from "react-router";
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
import { cleanup, render } from "vitest-browser-react";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      const real = test_db.current?.db;
      if (!real) throw new Error("test_db not initialized");
      return (real as any)[prop];
    },
  }),
}));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({ user_ctx: true })
);
vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { admin_ctx, user_ctx } from "$/auth/test-utils";
import type { DbOrTx } from "$/pg/queries/helpers";
import { type OwedParty, record_owed, recover_owed } from "$/pg/queries/owed";
import { user } from "$/pg/schema/auth";
import { donations } from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { owed_amounts } from "$/pg/schema/owed";
import { create_test_db } from "$/pg/test-utils/pglite";
import { loader as npo_referrer_loader } from "../admin.$id.referrals_.payouts/api";
import NpoReferrerPayouts from "../admin.$id.referrals_.payouts/route";
import { loader } from "./api";
import ReferrerPayouts from "./route";

const db = () => test_db.current!.db;
const as_db = (x: unknown) => x as DbOrTx;

const NOW = "2026-11-20T12:00:00.000Z";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(owed_amounts);
  await db().delete(donations);
  await db().delete(npos);
  await db().delete(user);
});

afterEach(async () => {
  await cleanup();
});

async function referrer(email: string, code: string) {
  const u = await seed_user(db(), email, "Jane");
  await db()
    .update(user)
    .set({ referral_code: code })
    .where(eq(user.id, u!.id));
}

/** a $100 gift's refund, taking back the party's $4.50 commission */
async function refunded(id: string, party: OwedParty) {
  await db().insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at: "2026-11-05T10:00:00.000Z",
  });
  await record_owed(as_db(db()), {
    donation_id: id,
    party,
    source: "refund",
    source_ref: `re_${id}`,
    received_usd: 4.5,
    fee_processing_usd: 0,
    now: NOW,
  });
}

describe("a referrer's payouts page", () => {
  it("shows the referrer's own owed rows with what its payouts recovered, and never another referrer's", async () => {
    await referrer("jane@example.com", "REF-JANE");
    await referrer("other@example.com", "REF-OTHER");
    await refunded("don-jane", { referrer_user: "REF-JANE" });
    await refunded("don-other", { referrer_user: "REF-OTHER" });
    await recover_owed(as_db(db()), {
      donation_id: "don-jane",
      party: { referrer_user: "REF-JANE" },
      usd: 2,
      reason: "commission_run",
      ref: "c-run-1",
      now: "2026-11-21T00:00:00.000Z",
    });

    const Stub = createRoutesStub([
      {
        path: "/dashboard/referrals/payouts",
        Component: ReferrerPayouts as any,
        loader: loader as any,
        middleware: [
          async ({ context }, next) => {
            context.set(user_ctx, { email: "jane@example.com" });
            return next();
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub
        initialEntries={["/dashboard/referrals/payouts"]}
        future={{ v8_middleware: true }}
      />
    );

    const owed = screen.getByRole("region", { name: "Amounts owed" });
    const row = owed.getByRole("row", { name: "don-jane" });
    await expect
      .element(row)
      .toMatchTextContent(
        /Partly recovered.*\$2\.00 from payout of Nov 21, 2026/
      );
    await expect.element(row).toMatchTextContent(/\$4\.50.*\$2\.50/);
    expect(screen.getByText("don-other").query()).toBeNull();
  });

  it("for a referring nonprofit, shows its rows as referrer and not the ones it owes as a gift's nonprofit", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-R",
      referral_id: "NPO-R",
    });
    await refunded("don-referred", { referrer_npo: "NPO-R" });
    await refunded("don-to-npo", { npo_id: npo!.id });

    const Stub = createRoutesStub([
      {
        path: "/admin/:id/referrals/payouts",
        Component: NpoReferrerPayouts as any,
        loader: npo_referrer_loader as any,
        middleware: [
          async ({ context }, next) => {
            context.set(admin_ctx, npo!.id);
            return next();
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub
        initialEntries={[`/admin/${npo!.id}/referrals/payouts`]}
        future={{ v8_middleware: true }}
      />
    );

    const owed = screen.getByRole("region", { name: "Amounts owed" });
    await expect
      .element(owed.getByRole("row", { name: "don-referred" }))
      .toMatchTextContent(/Owed/);
    expect(screen.getByText("don-to-npo").query()).toBeNull();
  });
});
