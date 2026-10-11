import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { ILossLog } from "@/revenue";
import { user } from "$/pg/schema/auth";
import { create_test_db, type TestDb } from "$/pg/test-utils/pglite";
import { with_actor_names } from "./loss-log-actors";

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

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(user);
});

const write_off_by = (actor: string): ILossLog => ({
  id: `write_off:${actor}`,
  date: "2026-10-04T12:00:00.000Z",
  donation_id: "don-1",
  dist_id: null,
  npo_id: 1,
  referrer_user: null,
  referrer_npo: null,
  type: "write_off",
  amount: 53.2,
  npo_amount: 53.2,
  fees_bg: 0,
  fees_processing: 0,
  reason: "npo closed",
  actor,
});

test("a banned admin's write-off shows their first name", async () => {
  await test_db.current!.db.insert(user).values({
    id: "admin-1",
    name: "Grace Hopper",
    email: "grace@test.com",
    emailVerified: true,
    banned: true,
    first_name: "Grace",
    last_name: "Hopper",
  });

  const [log] = await with_actor_names([write_off_by("admin-1")]);

  expect(log?.actor).toBe("Grace");
});

test("an admin with no first name shows their email", async () => {
  await test_db.current!.db.insert(user).values({
    id: "admin-2",
    name: "",
    email: "ops@test.com",
    first_name: " ",
    last_name: "",
  });

  const [log] = await with_actor_names([write_off_by("admin-2")]);

  expect(log?.actor).toBe("ops@test.com");
});

test("an actor no user has keeps their id", async () => {
  const [log] = await with_actor_names([write_off_by("gone-1")]);

  expect(log?.actor).toBe("gone-1");
});
