import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";
import { seed_fund, seed_user } from "#/__tests__/fixtures/funds";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("../db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

const { funds_list } = await import("./fund");

type Item = Awaited<ReturnType<typeof funds_list>>["items"][number];

beforeAll(async () => {
  const { create_test_db } = await import("../test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("funds_list", () => {
  // the joined/derived IFund fields (members, target, donation_total_usd) are
  // not selected here, so the type must not promise them
  test("each item carries exactly the columns it selects", async () => {
    expectTypeOf<keyof Item>().toEqualTypeOf<
      "id" | "name" | "creator_id" | "created_at"
    >();

    const creator = await seed_user(test_db.current!.db, "c@test.com");
    await seed_fund(test_db.current!.db, {
      id: "fund-list-1",
      name: "Listed Fund",
      npo_owner: null,
      creator_id: creator.id,
    });

    const { items } = await funds_list();

    expect(items).toEqual([
      {
        id: "fund-list-1",
        name: "Listed Fund",
        creator_id: creator.id,
        created_at: expect.any(String),
      },
    ]);
  });
});
