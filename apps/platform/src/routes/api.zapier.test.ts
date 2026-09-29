import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

const session = vi.hoisted(() => ({ user: null as { role: string } | null }));
vi.mock("#/.server/auth", () => ({ get_session: async () => session }));

import { api_key_put } from "$/pg/queries/api-key";
import { api_keys, npos } from "$/pg/schema/npo";
import * as generate from "./api.zapier.generate.$id";
import { loader as me } from "./api.zapier.me";

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

let npo_id: number;
beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(api_keys);
  await db.delete(npos);
  npo_id = (await seed_npo(db, { registration_number: "EIN-ZAP" })).id;
});

const get = (fn: typeof me, key?: string) =>
  fn({
    request: new Request("https://x/api/zapier/me", {
      headers: key === undefined ? {} : { "x-api-key": key },
    }),
  } as any) as Promise<Response>;

describe("zapier auth test", () => {
  test("a malformed key answers 401", async () => {
    const res = await get(me, "not-a-real-key");
    expect(res.status).toBe(401);
  });

  test("a missing key answers 401", async () => {
    const res = await get(me);
    expect(res.status).toBe(401);
  });

  test("a well-formed key with no stored key behind it answers 401", async () => {
    const key = await api_key_put(npo_id);
    await test_db.current!.db.delete(api_keys);

    const res = await get(me, key);
    expect(res.status).toBe(401);
  });

  test("a superseded key answers 401, the current one names its npo", async () => {
    const old_key = await api_key_put(npo_id);
    const new_key = await api_key_put(npo_id);

    expect((await get(me, old_key)).status).toBe(401);
    const res = await get(me, new_key);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ npoId: npo_id });
  });
});

describe("zapier key minting", () => {
  const post = (id: number) =>
    generate.action({
      request: new Request(`https://x/api/zapier/generate/${id}`, {
        method: "POST",
      }),
      params: { id: String(id) },
    } as any) as Promise<Response>;

  test("a GET has nothing to answer with, so it can't rotate a key", () => {
    expect("loader" in generate).toBe(false);
  });

  test("a site admin's POST rotates the key and is never cached", async () => {
    session.user = { role: "admin" };
    const old_key = await api_key_put(npo_id);

    const res = await post(npo_id);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const key = await res.text();
    expect((await get(me, key)).status).toBe(200);
    expect((await get(me, old_key)).status).toBe(401);
  });

  test("a POST from anyone but a site admin rotates nothing", async () => {
    session.user = { role: "user" };
    const key = await api_key_put(npo_id);

    expect((await post(npo_id)).status).toBe(401);
    expect((await get(me, key)).status).toBe(200);
  });
});
