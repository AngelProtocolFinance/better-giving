import { createRoutesStub } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { render } from "vitest-browser-react";
import type { TestDb } from "$/pg/test-utils/pglite";

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
  CacheRoute: (C: any) => C,
  createClientLoaderCache: () => undefined,
}));

// donor messages fetch their own api route
vi.mock("swr/immutable", () => ({
  default: () => ({ data: undefined }),
}));

import { seed_fund, seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { create_test_db } from "$/pg/test-utils/pglite";
import { loader } from "./api";
import FundPage from "./route";

// the closing instant of a Sep 22 end date: Sep 22 has just ended in UTC-12
const NOW = new Date("2027-09-23T12:00:00.000Z");
const ms_before = (d: Date, ms: number) => new Date(d.getTime() - ms);
const DAY_MS = 86_400_000;

let creator_id: string;
let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
  const db = test_db.current.db;
  creator_id = (await seed_user(db, "creator@test.com")).id;
  npo_id = (await seed_npo(db)).id;
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

afterEach(() => {
  vi.useRealTimers();
});

/** `server` is the clock the loader runs on, `browser` the one the page renders on */
async function open_fund_page(
  expiration: string,
  { server, browser }: { server: Date; browser: Date }
) {
  const fund = await seed_fund(test_db.current!.db, {
    id: crypto.randomUUID(),
    npo_owner: npo_id,
    creator_id,
    members: [npo_id],
    expiration,
  });
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  const Stub = createRoutesStub([
    {
      path: "/fundraisers/:fund_id",
      Component: FundPage as any,
      loader: async (args: any) => {
        vi.setSystemTime(server);
        const data = await loader(args);
        vi.setSystemTime(browser);
        return data;
      },
      HydrateFallback: () => null,
    },
  ]);
  return render(<Stub initialEntries={[`/fundraisers/${fund.id}`]} />);
}

describe("fundraiser page", () => {
  test("shows a fund closed by the server's clock when the browser's runs behind", async () => {
    const screen = await open_fund_page("2027-09-22T00:00:00.000Z", {
      server: NOW,
      browser: ms_before(NOW, DAY_MS),
    });
    // one of the two donate links is display:none at any width
    await expect
      .element(screen.getByRole("link", { name: /donate now/i }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("last day", { exact: true }).query()).toBeNull();
  });

  test("closes once mounted when served from before closing to a browser past it", async () => {
    const screen = await open_fund_page("2027-09-22T00:00:00.000Z", {
      server: ms_before(NOW, 1),
      browser: NOW,
    });
    // one of the two donate links is display:none at any width
    await expect
      .element(screen.getByRole("link", { name: /donate now/i }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("last day", { exact: true }).query()).toBeNull();
  });

  test("closes without a reload once the closing instant passes", async () => {
    const at = ms_before(NOW, 1);
    const screen = await open_fund_page("2027-09-22T00:00:00.000Z", {
      server: at,
      browser: at,
    });
    await expect
      .element(screen.getByText("last day", { exact: true }))
      .toBeVisible();
    await vi.advanceTimersByTimeAsync(1);
    await expect
      .element(screen.getByRole("link", { name: /donate now/i }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("last day", { exact: true }).query()).toBeNull();
  });
});
