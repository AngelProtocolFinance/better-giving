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

import { action as verdict_action } from "#/pages/platform-admin/redeem-requests/api";
import { admin_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import type { LoaderData as AdminLayoutData } from "../routes/admin.$id/types";
// dashboard for cross-page
import {
  endowUpdateAction as dash_action,
  loader as dash_loader,
} from "../routes/admin.$id.dashboard/api";
import DashboardPage from "../routes/admin.$id.dashboard/route";
import { loader as inv_loader } from "../routes/admin.$id.investments/api";
import InvestmentsPage from "../routes/admin.$id.investments/route";
import InvTransferPage, {
  action as inv_transfer_action,
  loader as inv_transfer_loader,
} from "../routes/admin.$id.investments.transfer/route";
import InvWithdrawPage, {
  action as inv_withdraw_action,
  loader as inv_withdraw_loader,
} from "../routes/admin.$id.investments.withdraw/route";
// platform admin redeem-requests for cross-page
import { loader as redeem_loader } from "../routes/platform.redeem-requests/api";
import RedeemRequestsPage from "../routes/platform.redeem-requests/route";
import VerdictApprove from "../routes/platform.redeem-requests.$tx_id.approve/route";
import VerdictReject from "../routes/platform.redeem-requests.$tx_id.reject/route";

// --- setup ---

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-INV",
  name: "Investments Test NPO",
  endow_designation: "Charity",
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

function make_composition(cash_value: number): IComposition {
  const now = new Date().toISOString();
  return {
    CASH: {
      id: "CASH",
      qty: cash_value,
      price_date: now,
      price: 1,
      value: cash_value,
    },
  };
}

async function seed_nav_log(opts: {
  price: number;
  units: number;
  value: number;
  holders?: Record<number, number>;
  composition?: IComposition;
}) {
  const now = new Date().toISOString();
  const composition = opts.composition ?? make_composition(opts.value);
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

function make_admin_data(npo_id: number): AdminLayoutData {
  return {
    id: npo_id,
    user: { email: "test@test.com", sub: "sub-1" } as any,
    endow: {
      logo: null,
      name: "Investments Test NPO",
      allocation: null,
      payout_minimum: undefined as any,
    },
  };
}

// --- render helpers ---

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

async function render_investments_with_withdraw(npo_id: number) {
  const mdlwr = [
    async ({ context }: any, next: any) => {
      context.set(admin_ctx, npo_id);
      return next();
    },
  ];
  const Stub = createRoutesStub([
    {
      path: "/admin/:id",
      HydrateFallback: () => null,
      children: [
        {
          path: "investments",
          Component: InvestmentsPage,
          loader: inv_loader as any,
          middleware: mdlwr,
          children: [
            {
              path: "withdraw",
              Component: InvWithdrawPage,
              loader: inv_withdraw_loader as any,
              action: inv_withdraw_action,
              middleware: mdlwr,
            },
          ],
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

async function render_investments_with_transfer(npo_id: number) {
  const mdlwr = [
    async ({ context }: any, next: any) => {
      context.set(admin_ctx, npo_id);
      return next();
    },
  ];
  const Stub = createRoutesStub([
    {
      path: "/admin/:id",
      HydrateFallback: () => null,
      children: [
        {
          path: "investments",
          Component: InvestmentsPage,
          loader: inv_loader as any,
          middleware: mdlwr,
          children: [
            {
              path: "transfer",
              Component: InvTransferPage,
              loader: inv_transfer_loader as any,
              action: inv_transfer_action,
              middleware: mdlwr,
            },
          ],
        },
        {
          path: "savings",
          Component: () => <div data-testid="savings-redirect" />,
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

async function render_dashboard(npo_id: number) {
  const Stub = createRoutesStub([
    {
      id: "admin",
      path: "/admin/:id",
      Component: () => <Outlet />,
      HydrateFallback: () => null,
      loader: () => make_admin_data(npo_id),
      children: [
        {
          id: "dashboard",
          path: "dashboard",
          Component: DashboardPage,
          loader: dash_loader as any,
          action: dash_action,
          middleware: [
            async ({ context }: any, next: any) => {
              context.set(admin_ctx, npo_id);
              return next();
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

async function render_redeem_requests() {
  const Stub = createRoutesStub([
    {
      path: "/platform/redeem-requests",
      Component: RedeemRequestsPage,
      HydrateFallback: () => null,
      loader: redeem_loader as any,
      children: [
        {
          path: ":tx_id/approve",
          Component: VerdictApprove,
          action: verdict_action,
        },
        {
          path: ":tx_id/reject",
          Component: VerdictReject,
          action: verdict_action,
        },
      ],
    },
  ]);
  return await render(<Stub initialEntries={["/platform/redeem-requests"]} />);
}

// --- tests ---

describe("investments — withdraw creates pending request", () => {
  it("user sees balance, withdraws, sees pending Grant tx", async () => {
    const npo = await seed_npo({ lock_units: 100 });
    await seed_nav_log({
      price: 10,
      units: 100,
      value: 1000,
      holders: { [npo.id]: 100 },
    });

    const screen = await render_investments_with_withdraw(npo.id);

    // page structure
    await expect
      .element(screen.getByRole("heading", { name: /investments/i }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: /transactions/i }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /deposit/i }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /withdraw/i }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /transfer/i }))
      .toBeInTheDocument();

    // computed balance: 100 units × $10 = $1,000
    await expect.element(screen.getByText(/\$1,000/)).toBeInTheDocument();

    // click Withdraw link
    await screen.getByRole("link", { name: /withdraw/i }).click();

    // dialog appears with preset source = Investments
    await expect
      .element(screen.getByRole("heading", { name: /withdraw/i }))
      .toBeInTheDocument();

    // fill amount
    await screen.getByLabelText(/amount/i).fill("300");

    // submit
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // after redirect, investments reloads — pending tx appears
    await expect.element(screen.getByText(/pending/i)).toBeInTheDocument();
    await expect.element(screen.getByText(/grant/i)).toBeInTheDocument();
    await expect.element(screen.getByText(/\$300/)).toBeInTheDocument();
  });
});

describe("investments — transfer to savings", () => {
  it("creates pending transfer, dashboard savings unchanged", async () => {
    const npo = await seed_npo({ lock_units: 100, liq: 0 });
    await seed_nav_log({
      price: 10,
      units: 100,
      value: 1000,
      holders: { [npo.id]: 100 },
    });

    let screen = await render_investments_with_transfer(npo.id);

    await expect.element(screen.getByText(/\$1,000/)).toBeInTheDocument();

    // click Transfer
    await screen.getByRole("link", { name: /transfer/i }).click();

    // dialog: "Transfer to Savings" (from="lock")
    await expect
      .element(screen.getByRole("heading", { name: /transfer/i }))
      .toBeInTheDocument();

    // fill amount
    await screen.getByLabelText(/amount/i).fill("200");

    // submit
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // lock→liq transfer is pending, investments reloads
    await expect.element(screen.getByText(/pending/i)).toBeInTheDocument();
    await expect
      .element(screen.getByText(/transfer to savings/i))
      .toBeInTheDocument();

    // cross-page: dashboard still shows savings $0 (pending, not approved)
    await cleanup();
    screen = await render_dashboard(npo.id);

    await expect.element(screen.getByText("$0.00")).toBeInTheDocument();
  });
});

describe("cross-page — platform admin approves redemption", () => {
  it("full flow: withdraw → admin sees → approves → user sees final + payout", async () => {
    const npo = await seed_npo({ lock_units: 100, liq: 500 });
    await seed_nav_log({
      price: 10,
      units: 100,
      value: 1000,
      holders: { [npo.id]: 100 },
    });

    // step 1: user withdraws $300 from investments
    let screen = await render_investments_with_withdraw(npo.id);

    await expect.element(screen.getByText(/\$1,000/)).toBeInTheDocument();
    await screen.getByRole("link", { name: /withdraw/i }).click();
    await expect
      .element(screen.getByRole("heading", { name: /withdraw/i }))
      .toBeVisible();
    await screen.getByLabelText(/amount/i).fill("300");
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // pending tx appears
    await expect.element(screen.getByText(/pending/i)).toBeInTheDocument();
    await expect.element(screen.getByText(/\$300/)).toBeInTheDocument();
    await cleanup();

    // step 2: platform admin sees the request
    screen = await render_redeem_requests();

    await expect.element(screen.getByText(/redeem units/i)).toBeInTheDocument();
    await expect.element(screen.getByText(/\$300/)).toBeInTheDocument();

    // step 3: admin clicks Approve
    await screen.getByRole("link", { name: /approve/i }).click();

    // verdict dialog
    await expect
      .element(screen.getByText(/you are about to approve/i))
      .toBeInTheDocument();
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // redirects back to list — request gone from pending (now final)
    await expect
      .element(screen.getByText(/redeem units/i))
      .not.toBeInTheDocument();
    await cleanup();

    // step 4: user sees result on investments page
    screen = await render_investments(npo.id);

    // tx status is now Final
    await expect.element(screen.getByText(/final/i)).toBeInTheDocument();
    await cleanup();

    // step 5: dashboard shows updated state — payout created from lock withdrawal
    screen = await render_dashboard(npo.id);

    await expect
      .element(screen.getByRole("heading", { name: /dashboard/i }))
      .toBeInTheDocument();
    // investments figure decreased
    await expect.element(screen.getByText(/\$ 700\.00/)).toBeInTheDocument();
    // grant item created (payout from lock source)
    expect(screen.getByText(/\$300/).elements().length).toBeGreaterThanOrEqual(
      1
    );
  });
});

describe("cross-page — platform admin rejects redemption", () => {
  it("reject restores balance, user sees cancelled tx", async () => {
    const npo = await seed_npo({ lock_units: 100 });
    await seed_nav_log({
      price: 10,
      units: 100,
      value: 1000,
      holders: { [npo.id]: 100 },
    });

    // user withdraws $300
    let screen = await render_investments_with_withdraw(npo.id);

    await expect.element(screen.getByText(/\$1,000/)).toBeInTheDocument();
    await screen.getByRole("link", { name: /withdraw/i }).click();
    await expect
      .element(screen.getByRole("heading", { name: /withdraw/i }))
      .toBeVisible();
    await screen.getByLabelText(/amount/i).fill("300");
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    await expect.element(screen.getByText(/pending/i)).toBeInTheDocument();
    await cleanup();

    // platform admin rejects
    screen = await render_redeem_requests();

    await expect.element(screen.getByText(/redeem units/i)).toBeInTheDocument();
    await screen.getByRole("link", { name: /reject/i }).click();

    await expect
      .element(screen.getByText(/you are about to reject/i))
      .toBeInTheDocument();
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText(/redeem units/i))
      .not.toBeInTheDocument();
    await cleanup();

    // user sees cancelled tx, balance restored
    screen = await render_investments(npo.id);

    await expect.element(screen.getByText(/cancelled/i)).toBeInTheDocument();
    // balance restored: lock_units back to 100, price=10 → $1,000
    await expect.element(screen.getByText(/\$1,000/)).toBeInTheDocument();
  });
});
