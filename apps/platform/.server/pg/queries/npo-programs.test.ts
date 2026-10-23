import { afterAll, beforeAll, expect, test, vi } from "vitest";
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

import { npos } from "../schema/npo";
import { programs } from "../schema/program";
import { create_test_db } from "../test-utils/pglite";
import { npo_programs } from "./program";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
  const { db } = test_db.current;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-NPO-PROGRAMS",
      name: "Acme",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active: true,
    })
    .returning({ id: npos.id });
  npo_id = npo!.id;
  await db.insert(programs).values([
    {
      id: "goal",
      npo_id,
      title: "Goal",
      description_pt: "[]",
      target_raise: 2500.5,
      total_donations: 120.25,
      created_at: "2026-02-01T00:00:00.000Z",
    },
    {
      id: "no-goal",
      npo_id,
      title: "No goal",
      description_pt: "[]",
      target_raise: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

test("returns goal and raised as numbers, a missing goal as null", async () => {
  const rows = await npo_programs(npo_id);
  expect(
    rows.map((p) => [p.id, p.target_raise, p.total_donations])
  ).toStrictEqual([
    ["goal", 2500.5, 120.25],
    ["no-goal", null, 0],
  ]);
});
