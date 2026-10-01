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

import { seed_fund, seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "../schema/auth";
import { fund_members, funds } from "../schema/fund";
import { npos } from "../schema/npo";
import { create_test_db } from "../test-utils/pglite";
import { fund_member_remove, fund_members_get } from "./fund";

const db = () => test_db.current!.db;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(fund_members);
  await db().delete(funds);
  await db().delete(npos);
  await db().delete(user);
});

describe("fund_member_remove", () => {
  test("drops the member and returns the fund-member-removed payload naming that nonprofit", async () => {
    const creator = await seed_user(db(), "ada@test.com");
    const staying = await seed_npo(db(), {
      name: "Stays",
      registration_number: "EIN-STAYS",
    });
    const leaving = await seed_npo(db(), {
      name: "Leaves",
      registration_number: "EIN-LEAVES",
    });
    await seed_fund(db(), {
      id: "fund-1",
      name: "Ocean Fund",
      npo_owner: null,
      creator_id: creator.id,
      members: [staying.id, leaving.id],
    });

    const removed = await fund_member_remove("fund-1", leaving.id, false);

    expect(removed).toEqual({
      fund_id: "fund-1",
      creator_id: creator.id,
      creator_name: "Ocean Fund",
      npo_id: leaving.id,
    });
    expect(await fund_members_get("fund-1")).toEqual([staying.id]);
  });
});
