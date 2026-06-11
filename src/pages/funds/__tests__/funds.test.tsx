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
import { fund_members, funds } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
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

import FundsPage, { loader } from "#/routes/_app.fundraisers._index/route";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

// --- setup ---

const TEST_USER = {
  id: "test-creator-uuid",
  email: "creator@test.com",
  first_name: "Jane",
  last_name: "Doe",
  pref_currency: "usd",
};

let npo_id: number;

function fund_seed(): Omit<typeof funds.$inferInsert, "id"> & {
  members?: number[];
} {
  return {
    name: "Test Fund",
    description_rich: "A test fundraiser",
    banner: "https://example.com/banner.jpg",
    logo: "https://example.com/logo.jpg",
    members: [npo_id],
    published: true,
    active: true,
    npo_owner: npo_id,
    creator_id: TEST_USER.id,
  };
}

beforeAll(async () => {
  test_db.current = await create_test_db();
  // stub pg_trgm similarity() -- pglite doesn't have the extension
  await test_db.current!.client.exec(
    "CREATE OR REPLACE FUNCTION similarity(a text, b text) " +
      "RETURNS float4 AS $fn$ " +
      "BEGIN " +
      "IF a IS NULL OR b IS NULL THEN RETURN 0; END IF; " +
      "IF LOWER(a) LIKE '%' || LOWER(b) || '%' THEN RETURN 0.5; END IF; " +
      "RETURN 0; " +
      "END; " +
      "$fn$ LANGUAGE plpgsql IMMUTABLE;"
  );
  // seed a dummy npo for FK + creator user
  const [npo] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number: "REG001",
      name: "NPO 1",
      endow_designation: "Charity",
      hq_country: "US",
      tagline: "tagline",
      image: "img",
      logo: "logo",
      card_img: "card",
      active_in_countries: [],
      published: true,
      active: true,
      claimed: true,
      street_address: "123 Main",
      url: "https://npo.org",
    })
    .returning();
  npo_id = npo.id;
  await test_db.current!.db.insert(user).values({
    ...TEST_USER,
    name: `${TEST_USER.first_name} ${TEST_USER.last_name}`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

let counter = 0;
beforeEach(async () => {
  counter = 0;
  await test_db.current!.db.delete(funds);
});

// --- helpers ---

async function seed_fund(
  overrides: Partial<Omit<typeof funds.$inferInsert, "id">> & {
    members?: number[];
  } = {}
) {
  counter++;
  const { members: seed_members, ...seed_rest } = fund_seed();
  const { members: override_members, ...override_rest } = overrides;
  const member_ids = override_members ?? seed_members ?? [];
  const id = crypto.randomUUID();
  const [row] = await test_db
    .current!.db.insert(funds)
    .values({
      id,
      ...seed_rest,
      name: `Fund ${counter}`,
      ...override_rest,
    })
    .returning();
  if (member_ids.length > 0) {
    await test_db
      .current!.db.insert(fund_members)
      .values(
        member_ids.map((npo_id, i) => ({ fund_id: id, npo_id, position: i }))
      );
  }
  return row;
}

function render_funds(entry = "/fundraisers") {
  const Stub = createRoutesStub([
    {
      path: "/fundraisers",
      Component: FundsPage,
      HydrateFallback: () => null,
      loader,
    },
  ]);
  return render(<Stub initialEntries={[entry]} />);
}

// --- tests ---

describe("funds — basic listing", () => {
  it("renders active+published funds with names and descriptions", async () => {
    await seed_fund({ name: "Alpha Fund", description_rich: "Alpha desc" });
    await seed_fund({ name: "Beta Fund", description_rich: "Beta desc" });
    const screen = await render_funds();

    await expect.element(screen.getByText("Alpha Fund")).toBeInTheDocument();
    await expect.element(screen.getByText("Beta Fund")).toBeInTheDocument();
  });
});

describe("funds — visibility", () => {
  it("only shows active AND published funds", async () => {
    await seed_fund({ name: "Visible Fund" });
    await seed_fund({ name: "Inactive Fund", active: false });
    await seed_fund({ name: "Not Published Fund", published: false });
    const screen = await render_funds();

    await expect.element(screen.getByText("Visible Fund")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Inactive Fund"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Not Published Fund"))
      .not.toBeInTheDocument();
  });

  it("hides expired funds", async () => {
    await seed_fund({ name: "Live Fund" });
    await seed_fund({
      name: "Expired Fund",
      expiration: "2020-01-01T00:00:00Z",
    });
    const screen = await render_funds();

    await expect.element(screen.getByText("Live Fund")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Expired Fund"))
      .not.toBeInTheDocument();
  });
});

describe("funds — search", () => {
  it("filters by typing in search bar", async () => {
    await seed_fund({
      name: "Ocean Cleanup",
      description_rich: "Save the seas",
    });
    await seed_fund({
      name: "Forest Restoration",
      description_rich: "Plant trees",
    });
    const screen = await render_funds();

    // both visible initially
    await expect.element(screen.getByText("Ocean Cleanup")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Forest Restoration"))
      .toBeInTheDocument();

    // type in search bar -- 500ms debounce then fetcher.load
    await screen.getByPlaceholder("Search fundraiser").fill("Ocean");

    await expect
      .element(screen.getByText("Forest Restoration"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Ocean Cleanup")).toBeInTheDocument();
  }, 10_000);
});

describe("funds — pagination", () => {
  it("shows 'Load more' when more than 25 results", async () => {
    await Promise.all(
      Array.from({ length: 26 }, (_, i) => seed_fund({ name: `Fund ${i + 1}` }))
    );
    const screen = await render_funds();

    await expect
      .element(screen.getByText("Fund 1", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /load more funds/i }))
      .toBeInTheDocument();
  });

  it("does not show 'Load more' when results fit one page", async () => {
    for (let i = 0; i < 5; i++) await seed_fund({ name: `Small Fund ${i}` });
    const screen = await render_funds();

    await expect.element(screen.getByText("Small Fund 0")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /load more funds/i }))
      .not.toBeInTheDocument();
  });
});

describe("funds — empty state", () => {
  it("shows no cards when no active+published funds exist", async () => {
    await seed_fund({ name: "Hidden Fund", active: false });
    const screen = await render_funds();

    // wait for loader to resolve -- hero is always rendered
    await expect
      .element(screen.getByText(/fundraising, the/i))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Hidden Fund"))
      .not.toBeInTheDocument();
  });
});
