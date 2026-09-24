import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

// the queries read the module-level handle rather than taking one, so the
// pglite db is swapped in behind it.
vi.mock("../db", () => ({
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

import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { fund_members, funds } from "../schema/fund";
import { npos } from "../schema/npo";
import { create_test_db } from "../test-utils/pglite";
import { fund_npo_memberof, fund_search } from "./fund";

// an end date of oct 1 closes at the end of oct 1 in utc−12
const OCT_1 = "2026-10-01T00:00:00Z";
const CLOSES_AT = "2026-10-02T12:00:00Z";
const MINUTE_BEFORE_CLOSE = "2026-10-02T11:59:00Z";
const MINUTE_AFTER_CLOSE = "2026-10-02T12:01:00Z";

let npo_id: number;
let creator_id: string;

async function freeze_now(iso: string) {
  await test_db.current!.client.exec(`set test.now = '${iso}'`);
}

async function seed_listed_fund(id: string, expiration: string | null) {
  await test_db.current!.db.insert(funds).values({
    id,
    name: id,
    description_pt: "desc",
    banner: "https://img.co/banner.png",
    logo: "https://img.co/logo.png",
    active: true,
    published: true,
    creator_id,
    npo_owner: npo_id,
    expiration,
  });
}

const listers = {
  fund_search: async () =>
    (await fund_search({ page: 1 })).items.map((f) => f.id),
  fund_npo_memberof: async () =>
    (await fund_npo_memberof(npo_id, { published: true })).map((f) => f.id),
};

beforeAll(async () => {
  test_db.current = await create_test_db();
  // shadows pg_catalog.now() for this session: an unqualified NOW() resolves
  // through search_path, and pg_catalog only wins when it isn't listed.
  await test_db.current.client.exec(`
    create schema test_clock;
    create function test_clock.now() returns timestamptz
      language sql stable as $$ select current_setting('test.now')::timestamptz $$;
    set search_path = test_clock, pg_catalog, public;
  `);
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db, client } = test_db.current!;
  // the utc date of the end date is the rule; a non-utc session zone exposes
  // any part of the expression that reads the session's zone instead
  await client.exec("set time zone 'America/Los_Angeles'");
  await db.delete(fund_members);
  await db.delete(funds);
  await db.delete(npos);
  npo_id = (await seed_npo(db)).id;
  creator_id = (await seed_user(db, `${crypto.randomUUID()}@test.com`)).id;
});

describe.each(Object.entries(listers))("%s", (_, list_ids) => {
  test("a fund ending today in utc−12 is listed", async () => {
    await seed_listed_fund("ends-oct-1", OCT_1);
    await freeze_now(MINUTE_BEFORE_CLOSE);

    expect(await list_ids()).toEqual(["ends-oct-1"]);
  });

  test("a fund whose closing instant passed a minute ago is not listed", async () => {
    await seed_listed_fund("ends-oct-1", OCT_1);
    await freeze_now(MINUTE_AFTER_CLOSE);

    expect(await list_ids()).toEqual([]);
  });

  test("the closing instant itself is closed", async () => {
    await seed_listed_fund("ends-oct-1", OCT_1);
    await freeze_now(CLOSES_AT);

    expect(await list_ids()).toEqual([]);
  });

  test("an end date stored with a time of day closes with its date's midnight row", async () => {
    await seed_listed_fund("ends-oct-1-evening", "2026-10-01T18:30:00Z");

    await freeze_now(MINUTE_BEFORE_CLOSE);
    expect(await list_ids()).toEqual(["ends-oct-1-evening"]);

    await freeze_now(MINUTE_AFTER_CLOSE);
    expect(await list_ids()).toEqual([]);
  });

  test("a fund with no end date is listed", async () => {
    await seed_listed_fund("no-end", null);
    await freeze_now("9999-12-31T00:00:00Z");

    expect(await list_ids()).toEqual(["no-end"]);
  });
});
