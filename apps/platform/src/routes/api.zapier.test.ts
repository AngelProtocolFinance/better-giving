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
import { query_webhooks } from "$/pg/queries/webhook";
import { api_keys, npos, webhooks } from "$/pg/schema/npo";
import * as generate from "./api.zapier.generate.$id";
import { loader as me } from "./api.zapier.me";
import * as new_donation from "./api.zapier.triggers.new-donation";

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
  await db.delete(webhooks);
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

describe("zapier new-donation subscribe", () => {
  const subscribe = (key: string, body: unknown) =>
    new_donation.action({
      request: new Request("https://x/api/zapier/triggers/new-donation", {
        method: "POST",
        headers: { "x-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    } as any) as Promise<Response>;

  test("a hooks.zapier.com url is stored and its id returned", async () => {
    const key = await api_key_put(npo_id);
    const url = "https://hooks.zapier.com/hooks/standard/1/abc/";

    const res = await subscribe(key, { hookUrl: url });

    expect(res.status).toBe(200);
    const { id } = await res.json();
    expect(await query_webhooks(npo_id)).toEqual([{ id, npo_id, url }]);
  });

  test.each([
    ["an internal address", "http://169.254.169.254/latest/meta-data/"],
    ["plain http to zapier", "http://hooks.zapier.com/hooks/standard/1/abc/"],
    ["a lookalike host", "https://hooks.zapier.com.evil.test/x"],
    ["credentials in the url", "https://u:p@hooks.zapier.com/x"],
    ["not a url", "hooks.zapier.com"],
    ["a missing hookUrl", undefined],
  ])("%s is refused with 400 and stores nothing", async (_, url) => {
    const key = await api_key_put(npo_id);

    const res = await subscribe(key, { hookUrl: url });

    expect(res.status).toBe(400);
    expect(await query_webhooks(npo_id)).toEqual([]);
  });
});

describe("zapier key rotation", () => {
  test("rotating an npo's key unsubscribes every hook it had, and only its", async () => {
    const db = test_db.current!.db;
    const other_npo = (await seed_npo(db, { registration_number: "EIN-ZAP-2" }))
      .id;
    await db.insert(webhooks).values([
      { id: "h-1", npo_id, url: "https://hooks.zapier.com/a" },
      { id: "h-2", npo_id, url: "https://hooks.zapier.com/b" },
      { id: "h-3", npo_id: other_npo, url: "https://hooks.zapier.com/c" },
    ]);
    await api_key_put(npo_id);

    await api_key_put(npo_id);

    expect(await query_webhooks(npo_id)).toEqual([]);
    expect((await query_webhooks(other_npo)).map((h) => h.id)).toEqual(["h-3"]);
  });
});
