import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { type AuthUser, admin_ctx, user_ctx } from "#/.server/auth";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

const dataWithSuccess = vi.hoisted(() =>
  vi.fn((data: unknown, message: string) => ({ data, message }))
);
vi.mock("#/.server/toast", () => ({ dataWithSuccess }));

import { user } from "$/pg/schema/auth";
import { connector_keys } from "$/pg/schema/connector";
import { api_keys, npos } from "$/pg/schema/npo";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action, loader } from "./api";

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
  dataWithSuccess.mockClear();
  await db().delete(connector_keys);
  await db().delete(api_keys);
  await db().delete(npos);
  await db().delete(user);
});

const context_for = (npo_id: number, user_id: string) => {
  const context = new RouterContextProvider();
  context.set(admin_ctx, npo_id);
  context.set(user_ctx, { id: user_id } as AuthUser);
  return context;
};

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
  const here = (await seed_npo(db(), {
    name: "Alpha",
    registration_number: "EIN-A",
  }))!;
  const there = (await seed_npo(db(), {
    name: "Beta",
    registration_number: "EIN-B",
  }))!;
  const owner = (await seed_user(db(), "ada@test.com", "Ada", "Lovelace"))!;
  await db()
    .insert(connector_keys)
    .values([
      key_row("key-here", here.id, owner.id, "bgc_here"),
      key_row("key-there", there.id, owner.id, "bgc_ther"),
    ]);
  return { here, there, owner };
};

const post_revoke = (npo_id: number, user_id: string, key_id: string) =>
  action({
    params: { id: String(npo_id) },
    context: context_for(npo_id, user_id),
    request: new Request(`http://t/admin/${npo_id}/integrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revoke_key: key_id }),
    }),
  } as any);

describe("integration connection revoke", () => {
  test("revokes this nonprofit's key and leaves the zapier key alone", async () => {
    const { here, owner } = await seed();

    const res = await post_revoke(here.id, owner.id, "key-here");

    expect(res).toEqual({ data: null, message: "Connection revoked" });
    const [row] = await db()
      .select()
      .from(connector_keys)
      .where(eq(connector_keys.id, "key-here"));
    expect(row?.revoked_at).not.toBeNull();
    expect(row?.revoked_by).toBe(owner.id);
    expect(await db().select().from(api_keys)).toHaveLength(0);
  });

  test("a key that belongs to another nonprofit stays live", async () => {
    const { here, owner } = await seed();

    const res = await post_revoke(here.id, owner.id, "key-there");

    expect(res).toEqual({ data: null, message: "Connection revoked" });
    const [row] = await db()
      .select()
      .from(connector_keys)
      .where(eq(connector_keys.id, "key-there"));
    expect(row?.revoked_at).toBeNull();
  });

  test("the loader lists only this nonprofit's live keys", async () => {
    const { here, owner } = await seed();
    await db()
      .update(connector_keys)
      .set({ revoked_at: new Date().toISOString() })
      .where(eq(connector_keys.id, "key-here"));
    await db()
      .insert(connector_keys)
      .values({
        ...key_row("key-live", here.id, owner.id, "bgc_live"),
        created_at: "2026-10-17T00:00:00.000Z",
      });

    const loaded = await loader({
      params: { id: String(here.id) },
      context: context_for(here.id, owner.id),
      request: new Request(`http://t/admin/${here.id}/integrations`),
    } as any);

    expect(loaded.apiKey).toBeUndefined();
    expect(loaded.connections.map((row) => row.id)).toEqual(["key-live"]);
    expect(loaded.connections[0]?.allowed_by_name).toBe("Ada Lovelace");
  });
});
