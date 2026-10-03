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
// set to make that query fail the way an unreachable neon does
const programs_failure = vi.hoisted(() => ({ current: null as Error | null }));
const media_failure = vi.hoisted(() => ({ current: null as Error | null }));
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

vi.mock("$/pg/queries/program", async (orig) => {
  const real = await orig<typeof import("$/pg/queries/program")>();
  return {
    ...real,
    npo_programs: (...args: Parameters<typeof real.npo_programs>) =>
      programs_failure.current
        ? Promise.reject(programs_failure.current)
        : real.npo_programs(...args),
  };
});

vi.mock("$/pg/queries/npo-media", async (orig) => {
  const real = await orig<typeof import("$/pg/queries/npo-media")>();
  return {
    ...real,
    npo_media_list: (...args: Parameters<typeof real.npo_media_list>) =>
      media_failure.current
        ? Promise.reject(media_failure.current)
        : real.npo_media_list(...args),
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

const PROGRAMS_COULDNT_LOAD =
  "We couldn't load this nonprofit's programs right now. Please try again later.";
const MEDIA_COULDNT_LOAD =
  "We couldn't load this nonprofit's videos right now. Please try again later.";

const db = () => test_db.current!.db;

const unreachable = () =>
  new Error("Error connecting to database: TypeError: fetch failed");

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
  programs_failure.current = null;
  media_failure.current = null;
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

describe("npo profile — programs section", () => {
  it("says the programs couldn't be loaded when the query fails, and still shows the profile", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-PROFILE-PROGRAMS",
      name: "Unreachable Programs Org",
      street_address: "12 Outage Ave",
    });
    const err = unreachable();
    programs_failure.current = err;

    const screen = await render_profile(npo.id);

    await expect.element(screen.getByText(PROGRAMS_COULDNT_LOAD)).toBeVisible();
    await expect.element(screen.getByText("12 Outage Ave")).toBeVisible();
    await expect
      .element(screen.getByText("Overview", { exact: true }))
      .toBeVisible();
    // a rejected deferred never reaches handleError, so the loader reports it
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(err, { endow_id: npo.id });
  });
});

describe("npo profile — media section", () => {
  it("says the videos couldn't be loaded when the query fails, and still shows the profile", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-PROFILE-MEDIA",
      name: "Unreachable Media Org",
      street_address: "34 Outage Ave",
    });
    const err = unreachable();
    media_failure.current = err;

    const screen = await render_profile(npo.id);

    await expect.element(screen.getByText(MEDIA_COULDNT_LOAD)).toBeVisible();
    await expect.element(screen.getByText("34 Outage Ave")).toBeVisible();
    await expect
      .element(screen.getByText("Overview", { exact: true }))
      .toBeVisible();
    // a rejected deferred never reaches handleError, so the loader reports it
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(err, { endow_id: npo.id });
  });
});
