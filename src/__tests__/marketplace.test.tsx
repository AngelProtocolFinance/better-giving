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

import { create_test_db } from "$/pg/test-utils/pglite-browser";
import MarketplacePage, { loader } from "../routes/_app.marketplace/route";
import FilterPage from "../routes/_app.marketplace.filter/route";

// --- setup ---

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "REG001",
  name: "Test Charity",
  endow_designation: "Charity",
  hq_country: "United States",
  tagline: "Helping the world",
  image: "https://example.com/banner.jpg",
  logo: "https://example.com/logo.jpg",
  card_img: "https://example.com/card.jpg",
  active_in_countries: [],
  published: true,
  active: true,
  claimed: true,
  street_address: "123 Main St",
  url: "https://example.org",
};

beforeAll(async () => {
  test_db.current = await create_test_db();
  // stub pg_trgm similarity() — pglite doesn't have the extension
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
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

let counter = 0;
beforeEach(async () => {
  await cleanup();
  counter = 0;
  await test_db.current!.db.delete(npos);
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
      registration_number: `REG${counter.toString().padStart(3, "0")}`,
      name: `Test Org ${counter}`,
      ...overrides,
    })
    .returning();
  return row;
}

function render_marketplace(entry = "/marketplace") {
  const Stub = createRoutesStub([
    {
      path: "/marketplace",
      Component: MarketplacePage,
      HydrateFallback: () => null,
      loader,
      children: [
        {
          path: "filter",
          Component: FilterPage,
        },
      ],
    },
  ]);
  return render(<Stub initialEntries={[entry]} />);
}

// --- tests ---

describe("marketplace — basic listing", () => {
  it("renders published+claimed NPOs with names and taglines", async () => {
    await seed_npo({ name: "Org Alpha", tagline: "Alpha tagline" });
    await seed_npo({ name: "Org Beta", tagline: "Beta tagline" });
    const screen = await render_marketplace();

    await expect.element(screen.getByText("Org Alpha")).toBeInTheDocument();
    await expect.element(screen.getByText("Org Beta")).toBeInTheDocument();
    await expect.element(screen.getByText("Alpha tagline")).toBeInTheDocument();
    await expect.element(screen.getByText("Beta tagline")).toBeInTheDocument();
  });
});

describe("marketplace — visibility", () => {
  it("only shows published AND claimed NPOs", async () => {
    await seed_npo({ name: "Visible Org" });
    await seed_npo({ name: "Unpublished Org", published: false });
    await seed_npo({ name: "Unclaimed Org", claimed: false });
    const screen = await render_marketplace();

    await expect.element(screen.getByText("Visible Org")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Unpublished Org"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Unclaimed Org"))
      .not.toBeInTheDocument();
  });
});

describe("marketplace — designation filter", () => {
  it("filters by clicking designation in filter dialog", async () => {
    await seed_npo({ name: "My Charity", endow_designation: "Charity" });
    await seed_npo({ name: "My University", endow_designation: "University" });
    const screen = await render_marketplace();

    // both visible initially
    await expect.element(screen.getByText("My Charity")).toBeInTheDocument();
    await expect.element(screen.getByText("My University")).toBeInTheDocument();

    // open filter dialog
    await screen.getByRole("link", { name: /filters/i }).click();

    // click "Charity" toggle in filter dialog
    await expect
      .element(screen.getByRole("button", { name: "Charity", pressed: false }))
      .toBeVisible();
    // base-ui inert overlay intercepts pointer events; use native DOM click
    (
      screen
        .getByRole("button", { name: "Charity", pressed: false })
        .element() as HTMLElement
    ).click();

    // university filtered out
    await expect
      .element(screen.getByText("My University"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("My Charity")).toBeInTheDocument();
  });
});

describe("marketplace — country filter", () => {
  it("filters by selecting country in filter dialog", async () => {
    await seed_npo({ name: "US Org", hq_country: "United States" });
    await seed_npo({ name: "CA Org", hq_country: "Canada" });
    const screen = await render_marketplace();

    // both visible initially
    await expect.element(screen.getByText("US Org")).toBeInTheDocument();
    await expect.element(screen.getByText("CA Org")).toBeInTheDocument();

    // apply country filter via URL (combobox inside base-ui dialog is not
    // pointer-accessible due to inert overlay in test environment)
    await cleanup();
    const filtered = await render_marketplace("/marketplace?countries=Canada");

    // US org filtered out
    await expect.element(filtered.getByText("US Org")).not.toBeInTheDocument();
    await expect.element(filtered.getByText("CA Org")).toBeInTheDocument();
  });

  it("matches active_in_countries", async () => {
    await seed_npo({
      name: "US HQ Active CA",
      hq_country: "United States",
      active_in_countries: ["Canada"],
    });
    const screen = await render_marketplace();

    await expect
      .element(screen.getByText("US HQ Active CA"))
      .toBeInTheDocument();

    // apply country filter via URL (combobox inside base-ui dialog is not
    // pointer-accessible due to inert overlay in test environment)
    await cleanup();
    const filtered = await render_marketplace("/marketplace?countries=Canada");

    // org with active_in_countries still visible
    await expect
      .element(filtered.getByText("US HQ Active CA"))
      .toBeInTheDocument();
  });
});

describe("marketplace — KYC filter", () => {
  it("filters by clicking KYC toggle in filter dialog", async () => {
    await seed_npo({ name: "KYC Org", kyc_donors_only: true });
    await seed_npo({ name: "No KYC Org", kyc_donors_only: false });
    const screen = await render_marketplace();

    await expect
      .element(screen.getByText("KYC Org", { exact: true }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("No KYC Org")).toBeInTheDocument();

    // open filter dialog, click "Required"
    await screen.getByRole("link", { name: /filters/i }).click();
    await expect
      .element(
        screen.getByRole("button", {
          name: "Required",
          pressed: false,
          exact: true,
        })
      )
      .toBeVisible();
    (
      screen
        .getByRole("button", { name: "Required", pressed: false, exact: true })
        .element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("No KYC Org"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("KYC Org", { exact: true }))
      .toBeInTheDocument();
  });
});

describe("marketplace — SDG filter", () => {
  it("filters by clicking category in filter dialog", async () => {
    await seed_npo({ name: "SDG 1 Org", sdgs: [1, 2, 3] });
    await seed_npo({ name: "SDG 4 Org", sdgs: [4] });
    const screen = await render_marketplace();

    await expect.element(screen.getByText("SDG 1 Org")).toBeInTheDocument();
    await expect.element(screen.getByText("SDG 4 Org")).toBeInTheDocument();

    await screen.getByRole("link", { name: /filters/i }).click();
    await expect
      .element(
        screen.getByRole("button", {
          name: /reducing overall inequality/i,
          pressed: false,
        })
      )
      .toBeVisible();
    (
      screen
        .getByRole("button", {
          name: /reducing overall inequality/i,
          pressed: false,
        })
        .element() as HTMLElement
    ).click();

    await expect.element(screen.getByText("SDG 4 Org")).not.toBeInTheDocument();
    await expect.element(screen.getByText("SDG 1 Org")).toBeInTheDocument();
  });
});

describe("marketplace — empty state", () => {
  it("shows empty message when filter matches nothing", async () => {
    await seed_npo({ endow_designation: "Charity" });
    const screen = await render_marketplace();

    await expect.element(screen.getByText("Test Org 1")).toBeInTheDocument();

    // open filter, click University (no matches)
    await screen.getByRole("link", { name: /filters/i }).click();
    await expect
      .element(
        screen.getByRole("button", {
          name: "University",
          pressed: false,
        })
      )
      .toBeVisible();
    (
      screen
        .getByRole("button", {
          name: "University",
          pressed: false,
        })
        .element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("No organisations found"))
      .toBeInTheDocument();
  });
});

describe("marketplace — pagination", () => {
  it("shows 'Load more' when more than 20 results", async () => {
    await Promise.all(
      Array.from({ length: 21 }, (_, i) => seed_npo({ name: `Org ${i + 1}` }))
    );
    const screen = await render_marketplace();

    await expect
      .element(screen.getByText("Org 1", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /load more organizations/i }))
      .toBeInTheDocument();
  });

  it("does not show 'Load more' when results fit one page", async () => {
    for (let i = 0; i < 5; i++) await seed_npo({ name: `Small Org ${i}` });
    const screen = await render_marketplace();

    await expect.element(screen.getByText("Small Org 0")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /load more organizations/i }))
      .not.toBeInTheDocument();
  });
});

describe("marketplace — combined filters", () => {
  it("combines designation + KYC with AND logic via filter dialog", async () => {
    await seed_npo({
      name: "Charity KYC",
      endow_designation: "Charity",
      kyc_donors_only: true,
    });
    await seed_npo({
      name: "Charity No KYC",
      endow_designation: "Charity",
      kyc_donors_only: false,
    });
    await seed_npo({
      name: "University KYC",
      endow_designation: "University",
      kyc_donors_only: true,
    });
    const screen = await render_marketplace();

    await expect.element(screen.getByText("Charity KYC")).toBeInTheDocument();

    // open filter, select Charity + Required
    await screen.getByRole("link", { name: /filters/i }).click();
    await expect
      .element(screen.getByRole("button", { name: "Charity", pressed: false }))
      .toBeVisible();
    (
      screen
        .getByRole("button", { name: "Charity", pressed: false })
        .element() as HTMLElement
    ).click();
    // wait for Charity filter to apply before clicking Required
    await expect
      .element(screen.getByRole("button", { name: "Charity", pressed: true }))
      .toBeVisible();
    (
      screen
        .getByRole("button", { name: "Required", pressed: false, exact: true })
        .element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("Charity No KYC"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("University KYC"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Charity KYC")).toBeInTheDocument();
  });
});

describe("marketplace — search", () => {
  it("filters by typing in search bar", async () => {
    await seed_npo({
      name: "Oxfam International",
      tagline: "Fighting poverty",
    });
    await seed_npo({ name: "Red Cross", tagline: "Humanitarian aid" });
    const screen = await render_marketplace();

    // both visible initially
    await expect
      .element(screen.getByText("Oxfam International"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Red Cross")).toBeInTheDocument();

    // type in search bar — 500ms debounce then fetcher.load
    await screen.getByPlaceholder("Search organizations...").fill("Oxfam");

    await expect.element(screen.getByText("Red Cross")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Oxfam International"))
      .toBeInTheDocument();
  }, 10_000);
});
