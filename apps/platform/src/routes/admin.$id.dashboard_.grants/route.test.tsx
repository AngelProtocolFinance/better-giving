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
// browser mode snapshots a mocked module's exports, so the date is fixed for
// the file; the unset date is pinned on the node side (owed-history, the cron)
vi.mock("$/env", async (io) => ({
  ...(await io<typeof import("$/env")>()),
  owed_terms_effective: "2026-11-01T00:00:00.000Z",
}));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { admin_ctx } from "$/auth/test-utils";
import type { DbOrTx } from "$/pg/queries/helpers";
import {
  credit_owed,
  owed_for_donation,
  record_owed,
  recover_owed,
  write_off_owed,
} from "$/pg/queries/owed";
import { user } from "$/pg/schema/auth";
import { donations } from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { owed_amounts } from "$/pg/schema/owed";
import { payouts, settlements } from "$/pg/schema/payout";
import { loss_logs } from "$/pg/schema/revenue";
import { create_test_db } from "$/pg/test-utils/pglite";
import GrantsPage, { loader } from "./route";

const db = () => test_db.current!.db;
const as_db = (x: unknown) => x as DbOrTx;

const GIFT_AT = "2026-11-05T10:00:00.000Z";
const NOW = "2026-11-20T12:00:00.000Z";
const RUN_AT = "2026-11-21T00:00:00.000Z";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(loss_logs);
  await db().delete(owed_amounts);
  await db().delete(payouts);
  await db().delete(settlements);
  await db().delete(donations);
  await db().delete(npos);
  await db().delete(user);
  npo_id = (await seed_npo(db(), { registration_number: "EIN-A" }))!.id;
});

afterEach(async () => {
  await cleanup();
});

/** the $100 card gift's refund: $90 to the npo plus the $3.20 card fee */
async function refunded(id: string, created_at = GIFT_AT) {
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
    created_at,
  });
  return record_owed(as_db(db()), {
    donation_id: id,
    party: { npo_id },
    source: "refund",
    source_ref: `re_${id}`,
    received_usd: 90,
    fee_processing_usd: 3.2,
    now: NOW,
  });
}

/** a grant run that sent $60 after recovering $40 of don-2: $100 gross */
async function recovering_grant() {
  await db().insert(settlements).values({
    id: "wise-tx-1",
    other_id: "run-1",
    npo_id,
    date: RUN_AT,
    amount: 60,
    sources: [],
    status: "",
  });
  await recover_owed(as_db(db()), {
    donation_id: "don-2",
    party: { npo_id },
    usd: 40,
    reason: "grant_run",
    ref: "run-1",
    now: RUN_AT,
  });
}

async function render_page() {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/dashboard/grants",
      Component: GrantsPage as any,
      loader: loader as any,
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
    },
  ]);
  return render(
    <Stub
      initialEntries={[`/admin/${npo_id}/dashboard/grants`]}
      future={{ v8_middleware: true }}
    />
  );
}

describe("the npo's grant history", () => {
  it("shows a recorded, a partly recovered, a credited-back and a waived row with their figures, and the recovering grant's gross, deduction and net", async () => {
    const admin = await seed_user(db(), "ops@better.giving");
    for (const id of ["don-1", "don-2", "don-3", "don-4"]) await refunded(id);
    await recovering_grant();
    await credit_owed(as_db(db()), {
      donation_id: "don-3",
      party: { npo_id },
      reason: "dispute_won",
      ref: "dp_won",
      now: "2026-11-22T00:00:00.000Z",
    });
    const [waived] = await owed_for_donation("don-4", as_db(db()));
    await write_off_owed(as_db(db()), {
      owed_id: waived!.id,
      reason: "goodwill",
      actor: admin!.id,
      now: "2026-11-23T00:00:00.000Z",
    });

    const screen = await render_page();

    const owed = screen.getByRole("region", { name: "Amounts owed" });
    const row = (id: string) => owed.getByRole("row", { name: id });
    await expect.element(row("don-1")).toMatchTextContent(/Owed/);
    await expect.element(row("don-1")).toMatchTextContent(/\$90\.00/);
    await expect.element(row("don-1")).toMatchTextContent(/\$3\.20/);
    await expect.element(row("don-1")).toMatchTextContent(/\$93\.20/);
    await expect
      .element(row("don-2"))
      .toMatchTextContent(
        /Partly recovered.*\$40\.00 from grant of Nov 21, 2026/
      );
    await expect.element(row("don-2")).toMatchTextContent(/\$53\.20/);
    await expect
      .element(row("don-3"))
      .toMatchTextContent(/Credited back \$93\.20 on Nov 22, 2026/);
    await expect
      .element(row("don-4"))
      .toMatchTextContent(/Waived \$93\.20 on Nov 23, 2026/);

    const grant = screen.getByRole("row", { name: /Gross/ });
    await expect.element(grant).toMatchTextContent(/Gross \$100\.00/);
    await expect.element(grant).toMatchTextContent(/don-2.*-\$40\.00/);
    await expect.element(grant).toMatchTextContent(/Net \$60\.00/);
    // the deduction links to the gift's own line
    const [don_2] = await owed_for_donation("don-2", as_db(db()));
    await expect
      .element(grant.getByRole("link", { name: "don-2" }))
      .toHaveAttribute("href", `#owed-${don_2!.id}`);
    expect((row("don-2").element() as HTMLElement).getAttribute("id")).toBe(
      `owed-${don_2!.id}`
    );
  });

  it("reads a row credited back and then owed again as owed, keeping its credit-back on the line", async () => {
    await refunded("don-5");
    await credit_owed(as_db(db()), {
      donation_id: "don-5",
      party: { npo_id },
      reason: "dispute_won",
      ref: "dp_won",
      now: "2026-11-22T00:00:00.000Z",
    });
    // a later dispute on the same gift brings its fee
    await record_owed(as_db(db()), {
      donation_id: "don-5",
      party: { npo_id },
      source: "dispute",
      source_ref: "dp_2",
      received_usd: 90,
      fee_processing_usd: 3.2,
      fee_dispute_usd: 15,
      now: "2026-11-24T00:00:00.000Z",
    });

    const screen = await render_page();

    const row = screen
      .getByRole("region", { name: "Amounts owed" })
      .getByRole("row", { name: "don-5" });
    await expect
      .element(row)
      .toMatchTextContent(/Owed.*Credited back \$93\.20 on Nov 22, 2026/);
    await expect.element(row).toMatchTextContent(/\$15\.00$/);
  });

  it("shows nothing for a gift made before the effective date", async () => {
    await refunded("don-before", "2026-10-31T23:59:59.000Z");
    const screen = await render_page();
    await expect.element(screen.getByText("No amounts owed yet")).toBeVisible();
    expect(screen.getByText("don-before").query()).toBeNull();
  });
});
