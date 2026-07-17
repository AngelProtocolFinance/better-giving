import { createRoutesStub, Outlet } from "react-router";
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
import type { IComposition } from "@/nav/interfaces";
import { bal_txs } from "$/pg/schema/bal-tx";
import { banking_apps } from "$/pg/schema/banking";
import { nav_holders, nav_log_positions, nav_logs } from "$/pg/schema/nav";
import { npos } from "$/pg/schema/npo";
import { payouts, settlements } from "$/pg/schema/payout";
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

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);

vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return {
    redirectWithSuccess: vi.fn((url: string) => redirect(url)),
    dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
    dataWithError: vi.fn((_d: unknown, msg: string) => ({ error: msg })),
  };
});

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

vi.mock("swr/immutable", () => ({
  default: () => ({ data: { points: [], total_return: 0 } }),
}));

// --- imports after mocks ---

import type { LoaderData } from "#/pages/admin/types";
import { admin_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import {
  endowUpdateAction as dashboard_action,
  loader as dashboard_loader,
} from "../routes/admin.$id.dashboard/api";
import DashboardPage from "../routes/admin.$id.dashboard/route";
import TransferPage, {
  action as transfer_action,
  loader as transfer_loader,
} from "../routes/admin.$id.dashboard.transfer/route";
import WithdrawPage, {
  action as withdraw_action,
  loader as withdraw_loader,
} from "../routes/admin.$id.dashboard.withdraw/route";

// investments page for cross-page
import { loader as inv_loader } from "../routes/admin.$id.investments/api";
import InvestmentsPage from "../routes/admin.$id.investments/route";

// --- setup ---

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-DASH",
  name: "Dashboard Test NPO",
  endow_designation: "Charity",
  overview_pt: "[]",
  hq_country: "United States",
  published: false,
  active: true,
  claimed: true,
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await cleanup();
  await test_db.current!.db.delete(nav_holders);
  await test_db.current!.db.delete(nav_logs);
  await test_db.current!.db.delete(bal_txs);
  await test_db.current!.db.delete(payouts);
  await test_db.current!.db.delete(settlements);
  await test_db.current!.db.delete(banking_apps);
  await test_db.current!.db.delete(npos);
});

// --- helpers ---

async function seed_npo(
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({ ...NPO_SEED, ...overrides })
    .returning();
  return row;
}

async function seed_nav_log(opts: {
  price: number;
  units: number;
  value: number;
  holders?: Record<number, number>;
  composition?: IComposition;
}) {
  const now = new Date().toISOString();
  const composition: IComposition = opts.composition ?? {
    CASH: {
      id: "CASH",
      qty: opts.value,
      price_date: now,
      price: 1,
      value: opts.value,
    },
  };
  const positions = Object.values(composition);
  await test_db.current!.db.transaction(async (tx) => {
    await tx.insert(nav_logs).values({
      date: now,
      reason: "test",
      units: opts.units,
      price: opts.price,
      price_updated: now,
    });
    if (positions.length) {
      await tx.insert(nav_log_positions).values(
        positions.map((p) => ({
          date: now,
          ticker: p.id,
          qty: p.qty,
          price: p.price,
          value: p.qty * p.price,
          price_date: p.price_date,
        }))
      );
    }
    if (opts.holders) {
      await tx.insert(nav_holders).values(
        Object.entries(opts.holders).map(([npo_id, units]) => ({
          date: now,
          npo_id: Number(npo_id),
          units,
        }))
      );
    }
  });
}

function make_admin_data(
  npo_id: number,
  overrides?: Partial<LoaderData["endow"]>
): LoaderData {
  return {
    id: npo_id,
    user: { email: "test@test.com", sub: "sub-1" } as any,
    endow: {
      logo: null,
      name: "Dashboard Test NPO",
      allocation: null,
      payout_minimum: undefined as any,
      ...overrides,
    },
  };
}

async function render_dashboard_with_transfer(
  npo_id: number,
  admin_data?: LoaderData
) {
  const data = admin_data ?? make_admin_data(npo_id);
  const mdlwr = [
    async ({ context }: any, next: any) => {
      context.set(admin_ctx, npo_id);
      return next();
    },
  ];
  const Stub = createRoutesStub([
    {
      id: "admin",
      path: "/admin/:id",
      Component: () => <Outlet />,
      HydrateFallback: () => null,
      loader: () => data,
      children: [
        {
          id: "dashboard",
          path: "dashboard",
          Component: DashboardPage,
          loader: dashboard_loader as any,
          action: dashboard_action,
          middleware: mdlwr,
          children: [
            {
              path: "transfer",
              Component: TransferPage,
              loader: transfer_loader as any,
              action: transfer_action,
              middleware: mdlwr,
            },
          ],
        },
      ],
    },
  ]);
  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/dashboard`]}
      future={{ v8_middleware: true }}
    />
  );
}

async function render_dashboard_with_withdraw(
  npo_id: number,
  admin_data?: LoaderData
) {
  const data = admin_data ?? make_admin_data(npo_id);
  const mdlwr = [
    async ({ context }: any, next: any) => {
      context.set(admin_ctx, npo_id);
      return next();
    },
  ];
  const Stub = createRoutesStub([
    {
      id: "admin",
      path: "/admin/:id",
      Component: () => <Outlet />,
      HydrateFallback: () => null,
      loader: () => data,
      children: [
        {
          id: "dashboard",
          path: "dashboard",
          Component: DashboardPage,
          loader: dashboard_loader as any,
          action: dashboard_action,
          middleware: mdlwr,
          children: [
            {
              path: "withdraw",
              Component: WithdrawPage,
              loader: withdraw_loader as any,
              action: withdraw_action,
              middleware: mdlwr,
            },
          ],
        },
        {
          path: "investments",
          Component: () => <div data-testid="investments-redirect" />,
        },
      ],
    },
  ]);
  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/dashboard`]}
      future={{ v8_middleware: true }}
    />
  );
}

async function render_investments(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/investments",
      Component: InvestmentsPage,
      HydrateFallback: () => null,
      loader: inv_loader as any,
      middleware: [
        async ({ context }: any, next: any) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
    },
  ]);
  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/investments`]}
      future={{ v8_middleware: true }}
    />
  );
}

// --- tests ---

describe("dashboard — transfer savings → investments", () => {
  it("user sees dashboard, transfers savings, balances update on both pages", async () => {
    const npo = await seed_npo({ liq: 1000, lock_units: 0 });
    await seed_nav_log({ price: 1, units: 0, value: 0 });

    let screen = await render_dashboard_with_transfer(npo.id);

    // dashboard structure renders
    await expect
      .element(screen.getByRole("heading", { name: /dashboard/i }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Savings")).toBeInTheDocument();
    await expect.element(screen.getByText("Investments")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /deposit/i }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /withdraw/i }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /transfer/i }))
      .toBeInTheDocument();

    // initial balances: savings $1,000, investments $0
    await expect.element(screen.getByText("$1,000.00")).toBeInTheDocument();
    await expect.element(screen.getByText(/\$ 0\.00/)).toBeInTheDocument();

    // no activity yet
    await expect
      .element(screen.getByText(/no grant items/i))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText(/no payout records/i))
      .toBeInTheDocument();

    // user clicks Transfer
    await screen.getByRole("link", { name: /transfer/i }).click();

    await expect
      .element(screen.getByRole("heading", { name: /transfer/i }))
      .toBeInTheDocument();

    // fill amount and submit
    await screen.getByLabelText(/amount/i).fill("500");
    await expect
      .element(screen.getByRole("button", { name: /submit/i }))
      .toBeEnabled();
    // base-ui inert overlay intercepts pointer events; use native DOM click
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // dashboard reloads — savings decreased, investments increased
    await expect.element(screen.getByText("$500.00")).toBeInTheDocument();
    await expect.element(screen.getByText(/\$ 500\.00/)).toBeInTheDocument();

    // cross-page: investments page shows the transfer tx
    await cleanup();
    screen = await render_investments(npo.id);

    await expect
      .element(screen.getByText(/transfer from savings/i))
      .toBeInTheDocument();
    await expect.element(screen.getByText(/final/i)).toBeInTheDocument();
  });
});

describe("dashboard — withdraw dialog", () => {
  it("opens withdraw dialog with account options", async () => {
    const npo = await seed_npo({ liq: 200, lock_units: 100 });
    await seed_nav_log({ price: 10, units: 100, value: 1000 });

    const screen = await render_dashboard_with_withdraw(npo.id);

    await expect.element(screen.getByText(/\$ 1,000\.00/)).toBeInTheDocument();

    // click Withdraw link opens dialog
    await screen.getByRole("link", { name: /withdraw/i }).click();

    await expect
      .element(screen.getByRole("heading", { name: /withdraw/i }))
      .toBeInTheDocument();

    // shows amount field and submit button
    await expect.element(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /submit/i }))
      .toBeDisabled();
  });
});
