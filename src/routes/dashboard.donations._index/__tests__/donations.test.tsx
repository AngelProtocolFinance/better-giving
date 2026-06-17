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
import { render } from "vitest-browser-react";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks ---

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

vi.mock("#/.server/auth", async () => {
  const { make_auth_mock } = await import("$/auth/test-utils");
  return { ...make_auth_mock({ user_ctx: true }), auth_mdlwr: vi.fn() };
});

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports after mocks ---

import { user_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import DonationsLayout from "../../dashboard.donations/route";
import DonationsPage, { loader } from "../../dashboard.donations._index/route";

// --- setup ---

const TEST_EMAIL = "donor@test.com";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(npos);
});

// --- helpers ---

async function seed_npo() {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number: "REG001",
      name: "Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      active: true,
      claimed: true,
    })
    .returning();
  return row;
}

async function seed_donation(npo_id: number, i: number) {
  const id = `don-${i.toString().padStart(3, "0")}`;
  // stagger dates so cursor pagination works (oldest last)
  const date = new Date(2025, 0, 1 + i).toISOString();

  await test_db.current!.db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 10 + i,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at: date,
    updated_at: date,
  });
  await test_db.current!.db.insert(donation_recipients).values({
    donation_id: id,
    npo_id,
    name: "Test NPO",
    type: "npo",
  });
  await test_db.current!.db.insert(donation_donors).values({
    donation_id: id,
    email: TEST_EMAIL,
  });
}

async function render_donations(entry = "/dashboard/donations") {
  const Stub = createRoutesStub([
    {
      // parent layout — has NO loader, just renders filter + Outlet
      path: "/dashboard/donations",
      Component: DonationsLayout,
      children: [
        {
          // _index route — has the loader
          index: true,
          Component: DonationsPage,
          loader,
        },
      ],
      middleware: [
        async ({ context }, next) => {
          context.set(user_ctx, { email: TEST_EMAIL } as any);
          return next();
        },
      ],
    },
  ]);
  return await render(
    <Stub initialEntries={[entry]} future={{ v8_middleware: true }} />
  );
}

// --- tests ---

describe("my donations — pagination", () => {
  it("clicking 'View More' loads and appends page 2 items", async () => {
    const npo = await seed_npo();

    // seed 12 donations — page size is 10, so page 2 has 2 items
    for (let i = 1; i <= 12; i++) {
      await seed_donation(npo.id, i);
    }

    const screen = await render_donations();

    // page 1: newest donations appear first (don-012 .. don-003)
    // wait for table to render
    await expect.element(screen.getByText("Test NPO").first()).toBeVisible();
    await vi.waitFor(() => {
      const rows = screen.getByText("Test NPO").elements();
      expect(rows.length).toBe(10);
    });

    // "View More" button should be present
    const view_more = screen.getByRole("button", { name: /view more/i });
    await expect.element(view_more).toBeInTheDocument();

    // count initial table rows
    await vi.waitFor(() => {
      const initial_rows = screen.getByRole("row").elements();
      // thead row + 10 data rows + tfoot row = 12
      expect(initial_rows.length).toBeGreaterThan(0);
    });
    const initial_data_rows = screen.getByRole("row").elements().length;

    // click "View More"
    await view_more.click();

    // page 2 should load — wait for more rows to appear
    await vi.waitFor(() => {
      const updated_rows = screen.getByRole("row").elements();
      expect(updated_rows.length).toBeGreaterThan(initial_data_rows);
    });
  });

  it("hides 'View More' when all results fit one page", async () => {
    const npo = await seed_npo();
    for (let i = 1; i <= 5; i++) {
      await seed_donation(npo.id, i);
    }

    const screen = await render_donations();

    await expect.element(screen.getByText("Test NPO").first()).toBeVisible();
    await vi.waitFor(() => {
      const rows = screen.getByText("Test NPO").elements();
      expect(rows.length).toBe(5);
    });
    await expect
      .element(screen.getByRole("button", { name: /view more/i }))
      .not.toBeInTheDocument();
  });
});
