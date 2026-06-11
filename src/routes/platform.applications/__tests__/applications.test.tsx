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
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { registrations } from "$/pg/schema/registration";
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

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports (after mocks hoisted) ---

import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { loader } from "../api";
import Applications from "../route";

// --- setup ---

const now = new Date();

function days_ago(n: number) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const SEEDS: (typeof registrations.$inferInsert)[] = [
  {
    id: "reg-incomplete",
    r_id: "user-1",
    status: "01",
    o_name: "Incomplete Org",
    o_hq_country: "United States",
    // only contact step filled
    r_first_name: "John",
    r_last_name: "Doe",
    r_org_role: "ceo",
    rm: "internet",
    created_at: days_ago(5),
    updated_at: days_ago(5),
  },
  {
    id: "reg-pending",
    r_id: "user-2",
    status: "02",
    o_name: "Pending Org",
    o_hq_country: "Canada",
    created_at: days_ago(3),
    updated_at: days_ago(3),
  },
  {
    id: "reg-approved",
    r_id: "user-3",
    status: "03",
    o_name: "Approved Org",
    o_hq_country: "United Kingdom",
    created_at: days_ago(1),
    updated_at: days_ago(1),
  },
  {
    id: "reg-rejected",
    r_id: "user-4",
    status: "04",
    o_name: "Rejected Org",
    o_hq_country: "Australia",
    created_at: days_ago(2),
    updated_at: days_ago(2),
  },
];

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(registrations);
  for (const seed of SEEDS) {
    await test_db.current!.db.insert(registrations).values(seed);
  }
});

// --- helpers ---

async function render_applications(search = "") {
  const Stub = createRoutesStub([
    {
      path: "/platform/applications",
      Component: Applications,
      HydrateFallback: () => null,
      loader,
    },
  ]);

  return await render(
    <Stub initialEntries={[`/platform/applications${search}`]} />
  );
}

// --- tests ---

describe("applications — default view", () => {
  it("defaults to under-review when no status param", async () => {
    const screen = await render_applications();

    // only pending (status 02) shown by default
    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Approved Org"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Rejected Org"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Incomplete Org"))
      .not.toBeInTheDocument();
  });
});

describe("applications — status filter", () => {
  it("filters to approved when status=03", async () => {
    const screen = await render_applications("?status=03");

    await expect.element(screen.getByText("Approved Org")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Pending Org"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Rejected Org"))
      .not.toBeInTheDocument();
  });

  it("shows incomplete registrations with progress and links to /register", async () => {
    const screen = await render_applications("?status=01");

    await expect
      .element(screen.getByText("Incomplete Org"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Incomplete", { exact: true }))
      .toBeInTheDocument();

    // progress bar rendered — contact step done, others pending
    const step_dots = screen.getByTitle("Step 2 of 5");
    await expect.element(step_dots).toBeInTheDocument();
    await expect
      .element(screen.getByTitle("Contact: done"))
      .toBeInTheDocument();
    await expect.element(screen.getByTitle("Org: pending")).toBeInTheDocument();

    // details link points to registration flow, not platform review
    const link = screen.getByRole("link", { name: /application details/i });
    await expect
      .element(link)
      .toHaveAttribute("href", "/register/reg-incomplete");
  });

  it("does not show progress for non-incomplete statuses", async () => {
    const screen = await render_applications("?status=02");

    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();
    await expect
      .element(screen.getByTitle(/Step \d+ of 5/))
      .not.toBeInTheDocument();
  });
});

describe("applications — sort", () => {
  it("renders rows in loader-provided order (name desc)", async () => {
    await test_db.current!.db.insert(registrations).values({
      id: "reg-pending-2",
      r_id: "user-5",
      status: "02",
      o_name: "Alpha Org",
      o_hq_country: "France",
      created_at: days_ago(1),
      updated_at: days_ago(1),
    });

    // sort_key=o_name&sort_dir=desc → loader returns Pending before Alpha
    const screen = await render_applications(
      "?status=02&sort_key=o_name&sort_dir=desc"
    );

    const pending = screen.getByText("Pending Org");
    await expect.element(pending).toBeVisible();
    const alpha = screen.getByText("Alpha Org");
    expect(
      pending.element().compareDocumentPosition(alpha.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("renders rows in loader-provided order (name asc)", async () => {
    await test_db.current!.db.insert(registrations).values({
      id: "reg-pending-2",
      r_id: "user-5",
      status: "02",
      o_name: "Alpha Org",
      o_hq_country: "France",
      created_at: days_ago(1),
      updated_at: days_ago(1),
    });

    // sort_key=o_name&sort_dir=asc → Alpha before Pending
    const screen = await render_applications(
      "?status=02&sort_key=o_name&sort_dir=asc"
    );

    const alpha = screen.getByText("Alpha Org");
    await expect.element(alpha).toBeVisible();
    const pending = screen.getByText("Pending Org");
    expect(
      alpha.element().compareDocumentPosition(pending.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe("applications — search", () => {
  it("filters by org name when user submits search", async () => {
    await test_db.current!.db.insert(registrations).values({
      id: "reg-pending-2",
      r_id: "user-5",
      status: "02",
      o_name: "Zebra Foundation",
      o_hq_country: "France",
      created_at: days_ago(1),
      updated_at: days_ago(1),
    });

    const screen = await render_applications("?status=02");

    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Zebra Foundation"))
      .toBeInTheDocument();

    const search_input = screen.getByPlaceholder(/search applications/i);
    await search_input.clear();
    await search_input.fill("Zebra");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByText("Pending Org"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Zebra Foundation"))
      .toBeInTheDocument();
  });

  it("filters by registration id", async () => {
    const screen = await render_applications("?status=02");

    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();

    const search_input = screen.getByPlaceholder(/search applications/i);
    await search_input.fill("reg-pending");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();
  });

  it("is case-insensitive", async () => {
    const screen = await render_applications("?status=02");

    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();

    const search_input = screen.getByPlaceholder(/search applications/i);
    await search_input.fill("PENDING");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("Pending Org")).toBeInTheDocument();
  });
});
