import { HttpResponse, http } from "msw";
import { createRoutesStub } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

// --- mocks ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
// set to make the fundraisers query fail the way an unreachable neon does
const funds_failure = vi.hoisted(() => ({ current: null as Error | null }));
const report_error_mock = vi.hoisted(() => vi.fn());

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

vi.mock("$/pg/queries/fund", async (orig) => {
  const real = await orig<typeof import("$/pg/queries/fund")>();
  return {
    ...real,
    fund_npo_memberof: (...args: Parameters<typeof real.fund_npo_memberof>) =>
      funds_failure.current
        ? Promise.reject(funds_failure.current)
        : real.fund_npo_memberof(...args),
  };
});

vi.mock("#/errors/report", async (orig) => ({
  ...(await orig<typeof import("#/errors/report")>()),
  report_error: report_error_mock,
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports after mocks ---

import { seed_npo } from "#/__tests__/fixtures/funds";
import ProfilePage, { loader } from "#/routes/_app.marketplace_.$id/route";
import { create_test_db } from "$/pg/test-utils/pglite";
import ProfileIndex from "../route";

// --- setup ---

const COULDNT_LOAD =
  "We couldn't load this nonprofit's fundraisers right now. Please try again later.";

const db = () => test_db.current!.db;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(npos);
  mswWorker.use(
    http.get("/api/me", () => HttpResponse.json(null, { status: 401 })),
    http.get("/api/npo/:id/donors", () =>
      HttpResponse.json({ items: [], next: null })
    )
  );
});

afterEach(async () => {
  await cleanup();
  funds_failure.current = null;
  report_error_mock.mockReset();
});

async function render_profile(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/marketplace/:id",
      Component: ProfilePage as any,
      HydrateFallback: () => null,
      loader: loader as any,
      children: [{ index: true, Component: ProfileIndex }],
    },
  ]);
  return await render(<Stub initialEntries={[`/marketplace/${npo_id}`]} />);
}

// --- tests ---

describe("npo profile — fundraisers section", () => {
  it("says the fundraisers couldn't be loaded when the query fails, and still shows the profile", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-PROFILE-FUNDS",
      name: "Unreachable Funds Org",
      street_address: "87 Outage Ave",
    });
    const err = new Error(
      "Error connecting to database: TypeError: fetch failed"
    );
    funds_failure.current = err;

    const screen = await render_profile(npo.id);

    await expect.element(screen.getByText(COULDNT_LOAD)).toBeVisible();
    await expect.element(screen.getByText("87 Outage Ave")).toBeVisible();
    await expect
      .element(screen.getByText("Overview", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Fundraisers" }))
      .not.toBeInTheDocument();
    // a rejected deferred never reaches handleError, so the loader reports it
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(err, { endow_id: npo.id });
  });

  it("shows nothing for a nonprofit with no fundraisers", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-PROFILE-NOFUNDS",
      name: "No Funds Org",
      street_address: "1 Quiet St",
    });

    const screen = await render_profile(npo.id);

    await expect.element(screen.getByText("1 Quiet St")).toBeVisible();
    await expect
      .element(screen.getByText("Overview", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText(COULDNT_LOAD))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Fundraisers" }))
      .not.toBeInTheDocument();
    expect(report_error_mock).not.toHaveBeenCalled();
  });
});
