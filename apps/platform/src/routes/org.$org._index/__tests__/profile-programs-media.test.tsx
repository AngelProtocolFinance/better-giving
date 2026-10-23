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
import { programs } from "$/pg/schema/program";
import type { TestDb } from "$/pg/test-utils/pglite";

// --- mocks ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
// set to make that query fail the way an unreachable neon does
const programs_failure = vi.hoisted(() => ({ current: null as Error | null }));
const media_failure = vi.hoisted(() => ({ current: null as Error | null }));
const report_error_mock = vi.hoisted(() => vi.fn());

// the layout pick asks Jev; stubbed so a run is deterministic (an unset key is what keeps the suite off the gateway)
vi.mock("$/jev", () => ({ jev_choice: async () => null }));

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

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: { user: undefined },
  })
);
vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports after mocks ---

import { seed_npo as seed_any_npo } from "#/__tests__/fixtures/funds";
import { create_test_db } from "$/pg/test-utils/pglite";
import ProfilePage, { loader } from "../route";

// --- setup ---

const PROGRAMS_COULDNT_LOAD =
  "We couldn't load this nonprofit's programs right now. Please try again later.";
const MEDIA_COULDNT_LOAD =
  "We couldn't load this nonprofit's videos right now. Please try again later.";

const db = () => test_db.current!.db;

const unreachable = () =>
  new Error("Error connecting to database: TypeError: fetch failed");

/** a profile anyone can see; an unpublished one is the loader suite's */
const seed_npo = (
  db: Parameters<typeof seed_any_npo>[0],
  o: Parameters<typeof seed_any_npo>[1] = {}
) => seed_any_npo(db, { published: true, ...o });

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
      path: "/org/:org",
      Component: ProfilePage as any,
      HydrateFallback: () => null,
      loader: loader as any,
    },
  ]);
  return await render(<Stub initialEntries={[`/org/${npo_id}`]} />);
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
    await expect
      .element(screen.getByRole("contentinfo").getByText("12 Outage Ave"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
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
    await expect
      .element(screen.getByRole("contentinfo").getByText("34 Outage Ave"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    // a rejected deferred never reaches handleError, so the loader reports it
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(err, { endow_id: npo.id });
  });
});

describe("npo profile — programs and media together", () => {
  it("says both couldn't be loaded when both queries fail, reporting each", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-PROFILE-BOTH-FAIL",
      name: "Unreachable Both Org",
      street_address: "56 Outage Ave",
    });
    const programs_err = unreachable();
    const media_err = unreachable();
    programs_failure.current = programs_err;
    media_failure.current = media_err;

    const screen = await render_profile(npo.id);

    await expect.element(screen.getByText(PROGRAMS_COULDNT_LOAD)).toBeVisible();
    await expect.element(screen.getByText(MEDIA_COULDNT_LOAD)).toBeVisible();
    await expect
      .element(screen.getByRole("contentinfo").getByText("56 Outage Ave"))
      .toBeVisible();
    await vi.waitFor(() => expect(report_error_mock).toHaveBeenCalledTimes(2));
    expect(report_error_mock).toHaveBeenCalledWith(programs_err, {
      endow_id: npo.id,
    });
    expect(report_error_mock).toHaveBeenCalledWith(media_err, {
      endow_id: npo.id,
    });
  });

  it("shows neither error when both queries succeed", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-PROFILE-BOTH-OK",
      name: "Reachable Org",
      street_address: "78 Quiet Ave",
    });
    await db().insert(programs).values({
      id: "prog-ok",
      npo_id: npo.id,
      title: "School Lunches",
      description_pt: "feeds classrooms",
      target_raise: 500,
      total_donations: 0,
      created_at: new Date().toISOString(),
    });

    const screen = await render_profile(npo.id);

    await expect
      .element(screen.getByRole("contentinfo").getByText("78 Quiet Ave"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toBeVisible();
    // the programs section has settled once its card is up, and the media
    // query resolves in the same loader pass
    await expect.element(screen.getByText("School Lunches")).toBeVisible();
    expect(screen.getByText(PROGRAMS_COULDNT_LOAD).query()).toBeNull();
    expect(screen.getByText(MEDIA_COULDNT_LOAD).query()).toBeNull();
    expect(report_error_mock).not.toHaveBeenCalled();
  });
});
