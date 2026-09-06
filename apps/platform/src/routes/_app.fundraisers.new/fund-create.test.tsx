import { eq } from "drizzle-orm";
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
import { user } from "$/pg/schema/auth";
import { fund_members, funds as fund_table } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
import { user_fund_memberships, user_npo_memberships } from "$/pg/schema/user";
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

const session_mock = vi.hoisted(() => ({
  user: undefined as any,
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: session_mock,
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

// skip spam evaluation in tests
vi.mock("./evaluate", () => ({
  evaluate: vi.fn(async () => undefined),
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports after mocks ---

import {
  seed_npo as insert_npo,
  seed_user as insert_user,
} from "#/__tests__/fixtures/funds";
import { user_funds as dashboard_loader } from "#/routes/dashboard.funds/api";
import DashboardFundsPage from "#/routes/dashboard.funds/route";
import { user_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action } from "./api";

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(user_fund_memberships);
  await test_db.current!.db.delete(fund_table);
  await test_db.current!.db.delete(user_npo_memberships);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
});

// --- helpers ---

const db = () => test_db.current!.db;

const seed_npo = (
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) =>
  insert_npo(db(), {
    registration_number: "EIN-CREATE",
    name: "Create Test NPO",
    fund_opt_in: true,
    ...overrides,
  });

const seed_user = (email: string, first = "Test", last = "User") =>
  insert_user(db(), email, first, last);

/** the row the action wrote, read back by the name it was submitted under */
async function fund_by_name(name: string) {
  const [row] = await db()
    .select()
    .from(fund_table)
    .where(eq(fund_table.name, name));
  return row;
}

/** builds FormData the way remix-hook-form serializes it (JSON-stringified values) */
function build_fund_form(opts: {
  name: string;
  description: string;
  banner: string;
  logo: string;
  members: { id: number; name: string }[];
  expiration?: string;
  target?: { type: string; value?: string };
}) {
  const fd = new FormData();
  fd.append("name", JSON.stringify(opts.name));
  fd.append(
    "description",
    JSON.stringify({
      value: `{"ops":[{"insert":"${opts.description}\\n"}]}`,
      length: opts.description.length,
    })
  );
  fd.append("banner", JSON.stringify(opts.banner));
  fd.append("logo", JSON.stringify(opts.logo));
  for (let i = 0; i < opts.members.length; i++) {
    fd.append(`members.${i}.id`, JSON.stringify(opts.members[i].id));
    fd.append(`members.${i}.name`, JSON.stringify(opts.members[i].name));
  }
  fd.append("published", JSON.stringify(false));
  fd.append("expiration", JSON.stringify(opts.expiration ?? ""));
  fd.append("target", JSON.stringify(opts.target ?? { type: "smart" }));
  fd.append("videos", JSON.stringify([]));
  fd.append("increments", JSON.stringify([]));
  fd.append("website", JSON.stringify(""));
  return fd;
}

function make_request(fd: FormData, npo_id?: number) {
  const url = npo_id
    ? `http://localhost/fundraisers/new?npo=${npo_id}`
    : "http://localhost/fundraisers/new";
  return new Request(url, { method: "POST", body: fd });
}

async function render_dashboard(user_id: string) {
  const mdlwr = [
    async ({ context }: any, next: any) => {
      context.set(user_ctx, { id: user_id, role: "admin" });
      return next();
    },
  ];
  const Stub = createRoutesStub([
    {
      path: "/dashboard/funds",
      Component: DashboardFundsPage,
      HydrateFallback: () => null,
      loader: dashboard_loader as any,
      middleware: mdlwr,
    },
    {
      path: "/fundraisers/new",
      Component: () => <div data-testid="new-fund-page" />,
    },
    {
      path: "/fundraisers/:fund_id",
      Component: () => <div data-testid="fund-page" />,
    },
    {
      path: "/fundraisers/:fund_id/edit",
      Component: () => <div data-testid="edit-page" />,
    },
  ]);
  return await render(
    <Stub
      initialEntries={["/dashboard/funds"]}
      future={{ v8_middleware: true }}
    />
  );
}

async function create_fund(fd: FormData, npo_id?: number): Promise<Response> {
  const req = make_request(fd, npo_id);
  return (await action({
    request: req,
    params: {},
    context: new Map() as any,
    url: new URL(req.url),
    pattern: "/fundraisers/new",
  })) as Response;
}

// --- tests ---

describe("fund creation", () => {
  it("user creates fund without npo context, fund visible on member npo's admin page", async () => {
    const npo = await seed_npo();
    const u = await seed_user("creator@test.com", "Jane", "Doe");
    session_mock.user = { id: u.id, email: u.email, role: "admin" };

    const res = await create_fund(
      build_fund_form({
        name: "Save The Whales",
        description: "ocean conservation fundraiser",
        banner: "https://img.co/banner.png",
        logo: "https://img.co/logo.png",
        members: [{ id: npo.id, name: npo.name }],
      })
    );

    // redirects to edit page (no npo context)
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/fundraisers/");
    expect(res.headers.get("Location")).toContain("/edit");

    // the row landed: creator's, no deadline, joined to the member npo
    const row = await fund_by_name("Save The Whales");
    expect(row.creator_id).toBe(u.id);
    expect(row.expiration).toBeNull();
    const members = await db()
      .select()
      .from(fund_members)
      .where(eq(fund_members.fund_id, row.id));
    expect(members.map((m) => m.npo_id)).toEqual([npo.id]);

    // fund visible on creator's dashboard
    const screen = await render_dashboard(u.id);
    await expect
      .element(screen.getByText("Save The Whales"))
      .toBeInTheDocument();
  });

  it("empty expiration does not crash — fund created and visible", async () => {
    const npo = await seed_npo({
      registration_number: "EIN-EXP",
      name: "Expiry NPO",
    });
    const u = await seed_user("exp@test.com", "Exp", "Test");
    session_mock.user = { id: u.id, email: u.email, role: "admin" };

    const res = await create_fund(
      build_fund_form({
        name: "No Deadline Fund",
        description: "fundraiser without expiration",
        banner: "https://img.co/banner.png",
        logo: "https://img.co/logo.png",
        members: [{ id: npo.id, name: npo.name }],
        expiration: "",
      })
    );

    expect(res.status).toBe(302);

    const row = await fund_by_name("No Deadline Fund");
    expect(row.expiration).toBeNull();
  });

  it("valid expiration date — fund created and visible", async () => {
    const npo = await seed_npo({
      registration_number: "EIN-DATE",
      name: "Date NPO",
    });
    const u = await seed_user("date@test.com", "Date", "Tester");
    session_mock.user = { id: u.id, email: u.email, role: "admin" };

    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);

    const res = await create_fund(
      build_fund_form({
        name: "Holiday Gala",
        description: "annual fundraiser",
        banner: "https://img.co/banner.png",
        logo: "https://img.co/logo.png",
        members: [{ id: npo.id, name: npo.name }],
        expiration: future.toISOString(),
      })
    );

    expect(res.status).toBe(302);

    const row = await fund_by_name("Holiday Gala");
    expect(row.expiration?.slice(0, 10)).toBe(
      future.toISOString().slice(0, 10)
    );
  });
});
