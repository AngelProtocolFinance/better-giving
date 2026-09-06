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
import { user } from "$/pg/schema/auth";
import { funds as fund_table } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

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

vi.mock("$/kit/queue", () => ({
  receiver: {},
  client: {},
  enqueue: vi.fn(),
  don_dist: vi.fn(),
  verify_qstash: vi.fn(),
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: true,
    user_ctx: true,
  })
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

// --- imports after mocks ---

import { Suspense } from "react";
import { Await } from "react-router";
import {
  seed_fund as insert_fund,
  seed_npo as insert_npo,
  seed_user as insert_user,
} from "#/__tests__/fixtures/funds";
import { loader as profile_loader } from "#/routes/_app.marketplace_.$id/api";
import type { IFundItem } from "@/fundraiser";
import { admin_ctx, user_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action, loader } from "../api";
import FundsPage from "../route";

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await cleanup();
  await test_db.current!.db.delete(fund_table);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
});

// --- helpers ---

const db = () => test_db.current!.db;

const seed_npo = (
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) =>
  insert_npo(db(), {
    registration_number: "EIN-FUNDS",
    name: "Funds Test NPO",
    ...overrides,
  });

const seed_user = (email: string, first = "Test", last = "User") =>
  insert_user(db(), email, first, last);

const seed_fund = (vals: Parameters<typeof insert_fund>[1]) =>
  insert_fund(db(), vals);

const MOCK_USER = {
  token_refresh: "tok",
  groups: [] as string[],
  endowments: [] as number[],
  funds: [] as string[],
  email: "admin@test.com",
};

async function render_funds(npo_id: number, user = MOCK_USER, search = "") {
  const mdlwr = [
    async ({ context }: any, next: any) => {
      context.set(admin_ctx, npo_id);
      context.set(user_ctx, user);
      return next();
    },
  ];
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/funds",
      Component: FundsPage,
      HydrateFallback: () => null,
      loader: loader as any,
      action: action as any,
      middleware: mdlwr,
    },
    {
      path: "/fundraisers/:fund_id/edit",
      Component: () => <div data-testid="edit-page" />,
    },
    {
      path: "/fundraisers/new",
      Component: () => <div data-testid="new-fund-page" />,
    },
    {
      path: "/fundraisers/:fund_id",
      Component: () => <div data-testid="fund-page" />,
    },
  ]);
  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/funds${search}`]}
      future={{ v8_middleware: true }}
    />
  );
}

async function render_profile(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/profile/:id",
      HydrateFallback: () => null,
      Component: ({ loaderData }: any) => (
        <Suspense fallback={null}>
          <Await resolve={loaderData.funds}>
            {(f: IFundItem[]) =>
              f.length > 0 ? (
                <div>
                  {f.map((fund) => (
                    <div key={fund.id}>{fund.name}</div>
                  ))}
                </div>
              ) : (
                <div>No profile funds</div>
              )
            }
          </Await>
        </Suspense>
      ),
      loader: profile_loader as any,
    },
  ]);
  return await render(<Stub initialEntries={[`/profile/${npo_id}`]} />);
}

// --- tests ---

describe("funds — filter and display", () => {
  it("shows all funds by default", async () => {
    const npo = await seed_npo();
    const other_npo = await seed_npo({
      registration_number: "EIN-OTHER",
      name: "Other NPO",
    });

    const npo_user = await seed_user("npo-user@test.com", "Our", "NPO");
    const other_user = await seed_user("other-user@test.com", "Other", "NPO");

    await seed_fund({
      id: "aaaaaaaa-0001-0001-0001-000000000001",
      name: "Our Gala Fund",
      npo_owner: npo.id,
      creator_id: npo_user.id,
      members: [npo.id, other_npo.id],
    });

    await seed_fund({
      id: "aaaaaaaa-0002-0002-0002-000000000002",
      name: "Supporter Drive",
      npo_owner: other_npo.id,
      creator_id: other_user.id,
      members: [npo.id, other_npo.id],
    });

    const screen = await render_funds(npo.id, {
      ...MOCK_USER,
      endowments: [npo.id],
    });

    await expect
      .element(screen.getByRole("heading", { name: /fundraisers/i }))
      .toBeInTheDocument();

    // default "All" shows both
    await expect.element(screen.getByText("Our Gala Fund")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Supporter Drive"))
      .toBeInTheDocument();

    // create link visible when not filtered to "others"
    await expect
      .element(screen.getByRole("link", { name: /\+ create/i }))
      .toBeInTheDocument();
  });

  it("filters to own funds with ?creator=ours", async () => {
    const npo = await seed_npo();
    const other_npo = await seed_npo({
      registration_number: "EIN-OTHER",
      name: "Other NPO",
    });

    const npo_user = await seed_user("npo-user@test.com", "Our", "NPO");
    const other_user = await seed_user("other-user@test.com", "Other", "NPO");

    await seed_fund({
      id: "aaaaaaaa-0001-0001-0001-000000000001",
      name: "Our Gala Fund",
      npo_owner: npo.id,
      creator_id: npo_user.id,
      members: [npo.id],
    });

    await seed_fund({
      id: "aaaaaaaa-0002-0002-0002-000000000002",
      name: "Supporter Drive",
      npo_owner: other_npo.id,
      creator_id: other_user.id,
      members: [npo.id, other_npo.id],
    });

    const screen = await render_funds(
      npo.id,
      { ...MOCK_USER, endowments: [npo.id] },
      "?creator=ours"
    );

    await expect.element(screen.getByText("Our Gala Fund")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Supporter Drive"))
      .not.toBeInTheDocument();
  });

  it("filters to supporter funds with ?creator=others", async () => {
    const npo = await seed_npo();
    const other_npo = await seed_npo({
      registration_number: "EIN-OTHER",
      name: "Other NPO",
    });

    const npo_user = await seed_user("npo-user@test.com", "Our", "NPO");
    const other_user = await seed_user("other-user@test.com", "Other", "NPO");

    await seed_fund({
      id: "aaaaaaaa-0001-0001-0001-000000000001",
      name: "Our Gala Fund",
      npo_owner: npo.id,
      creator_id: npo_user.id,
      members: [npo.id],
    });

    await seed_fund({
      id: "aaaaaaaa-0002-0002-0002-000000000002",
      name: "Supporter Drive",
      npo_owner: other_npo.id,
      creator_id: other_user.id,
      members: [npo.id, other_npo.id],
    });

    const screen = await render_funds(
      npo.id,
      { ...MOCK_USER, endowments: [npo.id] },
      "?creator=others"
    );

    await expect
      .element(screen.getByText("Supporter Drive"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Our Gala Fund"))
      .not.toBeInTheDocument();
  });

  it("others filter includes funds with null npo_owner", async () => {
    const npo = await seed_npo();
    const creator = await seed_user("creator@test.com", "Some", "Creator");

    await seed_fund({
      id: "aaaaaaaa-0003-0003-0003-000000000003",
      name: "Community Fund",
      npo_owner: null,
      creator_id: creator.id,
      members: [npo.id],
    });

    const screen = await render_funds(npo.id, MOCK_USER, "?creator=others");

    await expect
      .element(screen.getByText("Community Fund"))
      .toBeInTheDocument();
  });

  it("shows empty message when no funds exist", async () => {
    await seed_user("seed@test.com");
    const npo = await seed_npo();

    const screen = await render_funds(npo.id);

    await expect
      .element(screen.getByText(/no fundraisers found/i))
      .toBeInTheDocument();
  });
});

describe("funds — opt out", () => {
  it("npo opts out of a supporter fund, fund removed from admin list and profile page", async () => {
    const npo = await seed_npo();
    const other_npo = await seed_npo({
      registration_number: "EIN-OTHER2",
      name: "Creator NPO",
    });
    const creator_user = await seed_user(
      "creator-user@test.com",
      "Creator",
      "Person"
    );

    await seed_fund({
      id: "bbbbbbbb-0001-0001-0001-000000000001",
      name: "Community Drive",
      npo_owner: other_npo.id,
      creator_id: creator_user.id,
      members: [npo.id, other_npo.id],
      published: true,
    });

    // profile page shows the fund before opt-out
    let screen = await render_profile(npo.id);
    await expect
      .element(screen.getByText("Community Drive"))
      .toBeInTheDocument();
    await cleanup();

    // admin opts out — render with supporter filter
    screen = await render_funds(
      npo.id,
      { ...MOCK_USER, endowments: [npo.id] },
      "?creator=others"
    );

    await expect
      .element(screen.getByText("Community Drive"))
      .toBeInTheDocument();

    await screen.getByRole("button", { name: /opt out/i }).click();

    await expect
      .element(screen.getByText("Community Drive"))
      .not.toBeInTheDocument();
    await cleanup();

    // profile page no longer shows the fund
    screen = await render_profile(npo.id);
    await expect
      .element(screen.getByText("No profile funds"))
      .toBeInTheDocument();
  });

  it("last member opts out — fund becomes inactive, shows closed on admin page", async () => {
    const npo = await seed_npo();
    const other_npo = await seed_npo({
      registration_number: "EIN-SOLO",
      name: "Solo Creator NPO",
    });
    const solo_user = await seed_user("solo-user@test.com", "Solo", "Creator");

    // fund where npo is the only member
    await seed_fund({
      id: "bbbbbbbb-0002-0002-0002-000000000002",
      name: "Solo Fund",
      npo_owner: other_npo.id,
      creator_id: solo_user.id,
      members: [npo.id],
    });

    const screen = await render_funds(
      npo.id,
      { ...MOCK_USER, endowments: [npo.id] },
      "?creator=others"
    );

    await expect.element(screen.getByText("Solo Fund")).toBeInTheDocument();

    // opt out as last member
    await screen.getByRole("button", { name: /opt out/i }).click();

    // fund disappears from supporter view
    await expect.element(screen.getByText("Solo Fund")).not.toBeInTheDocument();
    await cleanup();

    // fund deactivated — profile page won't show it (published filter requires active)
    const profile_screen = await render_profile(npo.id);
    await expect
      .element(profile_screen.getByText("No profile funds"))
      .toBeInTheDocument();
  });
});

describe("funds — edit visibility", () => {
  it("edit link visible for own funds, hidden for supporter funds", async () => {
    const npo = await seed_npo();
    const other_npo = await seed_npo({
      registration_number: "EIN-EDIT-OTHER",
      name: "Other Edit NPO",
    });
    const own_user = await seed_user("own-npo@test.com", "Own", "NPO");
    const other_user = await seed_user("other-edit@test.com", "Other", "NPO");

    const own_fund_id = "cccccccc-0001-0001-0001-000000000001";
    await seed_fund({
      id: own_fund_id,
      name: "Editable Fund",
      npo_owner: npo.id,
      creator_id: own_user.id,
      members: [npo.id],
    });

    const supporter_fund_id = "cccccccc-0002-0002-0002-000000000002";
    await seed_fund({
      id: supporter_fund_id,
      name: "Supporter Fund",
      npo_owner: other_npo.id,
      creator_id: other_user.id,
      members: [npo.id, other_npo.id],
    });

    let screen = await render_funds(
      npo.id,
      { ...MOCK_USER, endowments: [npo.id], funds: [] },
      "?creator=ours"
    );

    await expect.element(screen.getByText("Editable Fund")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /^edit$/i }))
      .toBeVisible();

    await cleanup();

    // supporter view — edit hidden for non-owned fund
    screen = await render_funds(
      npo.id,
      { ...MOCK_USER, endowments: [], funds: [] },
      "?creator=others"
    );
    await expect
      .element(screen.getByText("Supporter Fund"))
      .toBeInTheDocument();
    // `invisible` is real visibility:hidden under the stylesheet, so the link
    // leaves the accessibility tree and only an includeHidden query reaches it
    await expect
      .element(
        screen.getByRole("link", { name: /^edit$/i, includeHidden: true })
      )
      .not.toBeVisible();
  });
});

describe("funds — published visibility on npo profile", () => {
  it("profile shows only published + active funds where npo is member", async () => {
    const npo = await seed_npo();
    const creator = await seed_user("pub-creator@test.com", "Pub", "Creator");

    // published + active — visible
    await seed_fund({
      id: "dddddddd-0001-0001-0001-000000000001",
      name: "Published Fund",
      npo_owner: npo.id,
      creator_id: creator.id,
      members: [npo.id],
      published: true,
    });

    // unpublished (draft) — hidden from profile
    await seed_fund({
      id: "dddddddd-0002-0002-0002-000000000002",
      name: "Draft Fund",
      npo_owner: npo.id,
      creator_id: creator.id,
      members: [npo.id],
      published: false,
    });

    // published but inactive — hidden from profile
    await seed_fund({
      id: "dddddddd-0003-0003-0003-000000000003",
      name: "Closed Fund",
      npo_owner: npo.id,
      creator_id: creator.id,
      members: [npo.id],
      published: true,
      active: false,
    });

    const screen = await render_profile(npo.id);
    await expect
      .element(screen.getByText("Published Fund"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Draft Fund"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Closed Fund"))
      .not.toBeInTheDocument();
  });

  it("admin page shows all funds regardless of published status", async () => {
    const npo = await seed_npo();
    const creator = await seed_user("admin-vis@test.com", "Admin", "Vis");

    await seed_fund({
      id: "eeeeeeee-0001-0001-0001-000000000001",
      name: "Published Admin Fund",
      npo_owner: npo.id,
      creator_id: creator.id,
      members: [npo.id],
      published: true,
    });

    await seed_fund({
      id: "eeeeeeee-0002-0002-0002-000000000002",
      name: "Draft Admin Fund",
      npo_owner: npo.id,
      creator_id: creator.id,
      members: [npo.id],
      published: false,
    });

    const screen = await render_funds(npo.id, {
      ...MOCK_USER,
      endowments: [npo.id],
    });

    await expect
      .element(screen.getByText("Published Admin Fund"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Draft Admin Fund"))
      .toBeInTheDocument();
  });
});
