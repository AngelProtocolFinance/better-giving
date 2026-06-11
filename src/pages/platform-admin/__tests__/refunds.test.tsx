import { createRoutesStub } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { bal_txs } from "$/pg/schema/bal-tx";
import { dists } from "$/pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { rev_logs } from "$/pg/schema/revenue";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

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
    paymentIntents: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));

vi.mock("$/kit/queue", () => ({
  enqueue: vi.fn(),
}));

vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: vi.fn() },
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);

vi.mock("remix-client-cache", () => ({
  CacheRoute: (C: any) => C,
  createClientLoaderCache: () => undefined,
}));

vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return {
    dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
    redirectWithSuccess: vi.fn((url: string, _msg: string) => redirect(url)),
  };
});

// --- imports (after mocks) ---

import { loader } from "#/routes/platform.refunds/api";
import ListPage from "#/routes/platform.refunds/route";
import {
  action as refund_action,
  loader as refund_loader,
} from "#/routes/platform.refunds.$donation_id.refund/api";
import RefundPage from "#/routes/platform.refunds.$donation_id.refund/route";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

// --- setup ---

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-REFUND-TEST",
  name: "Test NPO",
  endow_designation: "Charity",
  hq_country: "United States",
};

let counter = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(rev_logs);
  await test_db.current!.db.delete(bal_txs);
  await test_db.current!.db.delete(dists);
  await test_db.current!.db.delete(donation_settlements);
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

// --- helpers ---

async function seed_npo(
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) {
  counter++;
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      ...NPO_SEED,
      registration_number: `EIN-R-${counter}`,
      ...overrides,
    })
    .returning();
  return row;
}

async function seed_donation(
  npo_id: number,
  npo_name: string,
  overrides?: {
    donation?: Partial<typeof donations.$inferInsert>;
    via?: string;
  }
) {
  counter++;
  const don_id = `don-${counter}`;
  const now = new Date().toISOString();

  await test_db.current!.db.insert(donations).values({
    id: don_id,
    upusd: 1,
    status: "settled",
    amount_base: 5,
    amount_tip: 0.75,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: overrides?.via ?? "stripe:card",
    created_at: now,
    updated_at: now,
    ...overrides?.donation,
  });

  await test_db.current!.db.insert(donation_recipients).values({
    donation_id: don_id,
    npo_id,
    name: npo_name,
    type: "npo",
    tip_allowed: true,
  });

  await test_db.current!.db.insert(donation_donors).values({
    donation_id: don_id,
    email: "donor@test.com",
    name: "Test Donor",
  });

  return don_id;
}

async function seed_dist(
  donation_id: string,
  npo_id: number,
  npo_name: string,
  overrides?: Partial<typeof dists.$inferInsert>
) {
  counter++;
  const dist_id = `dist-${counter}`;
  await test_db.current!.db.insert(dists).values({
    id: dist_id,
    donation_id,
    status: "settled",
    date_created: new Date().toISOString(),
    to_id: npo_id,
    to_name: npo_name,
    amount: 5,
    amount_usd: 5,
    amount_denom: "USD",
    net: 4.53,
    fee_base: 0.13,
    fee_fsa: 0,
    fee_processing: 0.34,
    fee_allowance: 0,
    fee_allowance_excess: 0,
    alloc: { liq: 100, lock: 0, cash: 0 },
    ...overrides,
  });
  return dist_id;
}

async function render_list(don_id?: string) {
  const Stub = createRoutesStub([
    {
      path: "/platform/refunds",
      Component: ListPage,
      HydrateFallback: () => null,
      loader,
      children: don_id
        ? [
            {
              path: ":donation_id/refund",
              Component: RefundPage,
              loader: refund_loader as any,
              action: refund_action as any,
            },
          ]
        : [],
    },
  ]);

  return await render(<Stub initialEntries={["/platform/refunds"]} />);
}

// --- tests ---

describe("refunds list — settled stripe donation", () => {
  it("shows donation, user clicks refund, confirms, sees success", async () => {
    const npo = await seed_npo({ liq: 100 });
    const don_id = await seed_donation(npo.id, npo.name);
    await seed_dist(don_id, npo.id, npo.name);

    await test_db.current!.db.insert(rev_logs).values({
      id: "rl-1",
      date: new Date().toISOString(),
      donation_id: `dist-${counter}`,
      npo_id: npo.id,
      type: "tip",
      gross: 0.75,
      commission: 0,
      revenue: 0.75,
      status: "final",
    });

    const screen = await render_list(don_id);

    // list renders with donation row
    await expect
      .element(screen.getByRole("heading", { name: /refunds/i }))
      .toBeVisible();
    await expect.element(screen.getByText("Test NPO")).toBeInTheDocument();
    await expect
      .element(screen.getByText("donor@test.com"))
      .toBeInTheDocument();

    // refund link present for stripe donation
    const refund_link = screen.getByRole("link", { name: /refund/i });
    await expect.element(refund_link).toBeInTheDocument();

    // click refund → preview appears
    await refund_link.click();
    await expect
      .element(screen.getByRole("heading", { name: /refund preview/i }))
      .toBeVisible();

    // confirm refund (native click — Base UI dialog overlay blocks playwright click)
    (
      screen
        .getByRole("button", { name: /confirm refund/i })
        .element() as HTMLElement
    ).click();
    await expect.element(screen.getByText("Refund processed")).toBeVisible();

    // after revalidation, list should show "Refunded" label
    await cleanup();
    const screen2 = await render_list();
    await expect.element(screen2.getByText("Refunded")).toBeVisible();
    await expect
      .element(screen2.getByRole("link", { name: /refund/i }))
      .not.toBeInTheDocument();
  });
});

describe("refunds list — non-stripe donation", () => {
  it("shows N/A instead of refund button for paypal donation", async () => {
    const npo = await seed_npo();
    await seed_donation(npo.id, npo.name, { via: "paypal" });

    const screen = await render_list();

    await expect
      .element(screen.getByRole("heading", { name: /refunds/i }))
      .toBeVisible();
    await expect.element(screen.getByText("Test NPO")).toBeInTheDocument();
    await expect.element(screen.getByText("N/A")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /refund/i }))
      .not.toBeInTheDocument();
  });
});

describe("refunds list — filtering", () => {
  it("shows settled and refunded, excludes created donations", async () => {
    const npo = await seed_npo();
    await seed_donation(npo.id, npo.name); // settled
    await seed_donation(npo.id, npo.name, {
      donation: { status: "refunded" },
    });
    await seed_donation(npo.id, npo.name, {
      donation: { status: "created" },
    });

    const screen = await render_list();

    await expect
      .element(screen.getByRole("heading", { name: /refunds/i }))
      .toBeVisible();
    // 2 rows: settled + refunded (not created)
    const rows = screen.getByRole("row");
    // 1 header row + 2 data rows
    expect(rows.all()).toHaveLength(3);

    // one "Refund" link (settled stripe), one "Refunded" label
    await expect
      .element(screen.getByRole("link", { name: /refund/i }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Refunded")).toBeInTheDocument();
  });
});

describe("refund action — already refunded", () => {
  it("rejects refund for already-refunded donation", async () => {
    const npo = await seed_npo();
    const don_id = await seed_donation(npo.id, npo.name, {
      donation: { status: "refunded" },
    });

    try {
      await (refund_action as (...args: unknown[]) => unknown)({
        params: { donation_id: don_id },
        request: new Request(`http://test/platform/refunds/${don_id}/refund`, {
          method: "POST",
        }),
        context: {},
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(400);
    }
  });
});
