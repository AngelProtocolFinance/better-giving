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

import { user } from "../schema/auth";
import { npos } from "../schema/npo";
import { user_npo_memberships } from "../schema/user";
import { create_test_db } from "../test-utils/pglite";
import { npo_admin_member } from "./user";

let acme: number;
let beta: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
  const { db } = test_db.current;
  await db.insert(user).values(
    ["admin", "outsider"].map((id) => ({
      id,
      name: id,
      email: `${id}@test.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: id,
      last_name: "Test",
    }))
  );
  const rows = await db
    .insert(npos)
    .values(
      ["A", "B"].map((k) => ({
        registration_number: `EIN-ADMIN-MEMBER-${k}`,
        name: `NPO ${k}`,
        endow_designation: "Charity" as const,
        overview_pt: "[]",
        hq_country: "United States",
        active: true,
      }))
    )
    .returning({ id: npos.id });
  [acme, beta] = rows.map((r) => r.id) as [number, number];
  await db
    .insert(user_npo_memberships)
    .values({ user_id: "admin", npo_id: acme });
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

test("a member of the org is its admin", async () => {
  expect(await npo_admin_member("admin", acme)).toBe(true);
});

test("a member of another org, or of none, is not", async () => {
  expect(await npo_admin_member("admin", beta)).toBe(false);
  expect(await npo_admin_member("outsider", acme)).toBe(false);
});
