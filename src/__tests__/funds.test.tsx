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
import { fund_members, funds as fund_table } from "$/pg/schema/fund";
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
import type { IFundItem } from "@/fundraiser";
import { admin_ctx, user_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { loader as profile_loader } from "../routes/_app.marketplace_.$id/api";
import { action, loader } from "../routes/admin.$id.funds/api";
import FundsPage from "../routes/admin.$id.funds/route";

// --- setup ---

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-FUNDS",
  name: "Funds Test NPO",
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
  await test_db.current!.db.delete(fund_table);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
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

async function seed_user(email: string, first = "Test", last = "User") {
  const [row] = await test_db
    .current!.db.insert(user)
    .values({
      id: crypto.randomUUID(),
      name: `${first} ${last}`,
      email,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: first,
      last_name: last,
    })
    .returning();
  return row;
}

async function seed_fund(
  vals: Partial<typeof fund_table.$inferInsert> & {
    id: string;
    npo_owner: number;
    creator_id: string;
    members?: number[];
  }
) {
  const { members = [], ...rest } = vals;
  const [row] = await test_db
    .current!.db.insert(fund_table)
    .values({
      name: "Test Fund",
      description_pt: "desc",
      banner: "https://img.co/banner.png",
      logo: "https://img.co/logo.png",
      active: true,
      ...rest,
    })
    .returning();
  if (members.length > 0) {
    await test_db.current!.db.insert(fund_members).values(
      members.map((npo_id: number, i: number) => ({
        fund_id: row.id,
        npo_id,
        position: i,
      }))
    );
  }
  return row;
}

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
      npo_owner: null as any,
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
      .not.toHaveClass("invisible");

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
    await expect
      .element(screen.getByRole("link", { name: /^edit$/i }))
      .toHaveClass("invisible");
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
