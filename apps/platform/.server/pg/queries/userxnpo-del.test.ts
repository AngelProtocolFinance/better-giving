import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("../db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

const fail_revoke = vi.hoisted(() => ({ current: false }));
vi.mock("../../connector/keys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../connector/keys")>();
  return {
    ...actual,
    revoke_member_keys: (
      tx: Parameters<typeof actual.revoke_member_keys>[0],
      args: Parameters<typeof actual.revoke_member_keys>[1]
    ) => {
      if (fail_revoke.current) throw new Error("revoke failed");
      return actual.revoke_member_keys(tx, args);
    },
  };
});

import { user } from "../schema/auth";
import { connector_keys } from "../schema/connector";
import { npos } from "../schema/npo";
import { user_npo_memberships } from "../schema/user";
import { create_test_db } from "../test-utils/pglite";
import { userxnpo_del } from "./user";

const db = () => test_db.current!.db;

const sha256_hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  fail_revoke.current = false;
  await db().delete(connector_keys);
  await db().delete(user_npo_memberships);
  await db().delete(npos);
  await db().delete(user);
});

afterEach(() => {
  fail_revoke.current = false;
});

const key_row = (
  id: string,
  npo_id: number,
  allowed_by: string,
  prefix: string
) => ({
  id,
  npo_id,
  key_hash: sha256_hex(id),
  prefix,
  last4: prefix.slice(-4),
  allowed_by,
});

const seed = async () => {
  const npo = (await seed_npo(db(), {
    name: "Alpha",
    registration_number: "EIN-A",
  }))!;
  const member = (await seed_user(db(), "ada@test.com", "Ada", "Lovelace"))!;
  const other = (await seed_user(db(), "grace@test.com", "Grace", "Hopper"))!;
  const admin = (await seed_user(db(), "ann@test.com", "Ann", "Admin"))!;
  await db()
    .insert(user_npo_memberships)
    .values({ user_id: member.id, npo_id: npo.id });
  await db()
    .insert(connector_keys)
    .values([
      key_row("key-member", npo.id, member.id, "bgc_mem1"),
      key_row("key-other", npo.id, other.id, "bgc_oth1"),
    ]);
  return { npo, member, other, admin };
};

describe("userxnpo_del", () => {
  test("removes the membership and revokes only that user's key", async () => {
    const { npo, member, admin } = await seed();

    await userxnpo_del(npo.id, member.id, admin.id);

    expect(await db().select().from(user_npo_memberships)).toEqual([]);
    const keys = await db().select().from(connector_keys);
    const member_key = keys.find((row) => row.id === "key-member");
    const other_key = keys.find((row) => row.id === "key-other");
    expect(member_key?.revoked_at).not.toBeNull();
    expect(member_key?.revoked_by).toBe(admin.id);
    expect(other_key?.revoked_at).toBeNull();
  });

  test("a thrown revoke rolls the membership delete back and leaves the key live", async () => {
    const { npo, member, admin } = await seed();
    fail_revoke.current = true;

    await expect(userxnpo_del(npo.id, member.id, admin.id)).rejects.toThrow(
      "revoke failed"
    );

    const memberships = await db()
      .select()
      .from(user_npo_memberships)
      .where(eq(user_npo_memberships.user_id, member.id));
    expect(memberships).toHaveLength(1);
    const [member_key] = await db()
      .select()
      .from(connector_keys)
      .where(eq(connector_keys.id, "key-member"));
    expect(member_key?.revoked_at).toBeNull();
  });
});
