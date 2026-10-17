import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
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

const verify_qstash = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("$/kit/queue", () => ({ verify_qstash }));

import { user } from "$/pg/schema/auth";
import {
  connector_codes,
  connector_idempotency,
  connector_keys,
} from "$/pg/schema/connector";
import { npos } from "$/pg/schema/npo";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action } from "./route";

const db = () => test_db.current!.db;

const sha256_hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  verify_qstash.mockClear();
  await db().delete(connector_idempotency);
  await db().delete(connector_keys);
  await db().delete(connector_codes);
  await db().delete(npos);
  await db().delete(user);
});

const tick = () =>
  action({
    request: new Request("https://bg.test/api/cron/connector-sweep", {
      method: "POST",
    }),
  } as any) as Promise<Response>;

describe("api.cron.connector-sweep", () => {
  test("revokes a key idle 91 days, drops an expired code and a day-old idempotency row, and keeps the fresh ones", async () => {
    const npo = (await seed_npo(db(), {
      name: "Alpha",
      registration_number: "EIN-A",
    }))!;
    const owner = (await seed_user(db(), "ada@test.com", "Ada", "Lovelace"))!;
    const now = Date.now();
    await db()
      .insert(connector_keys)
      .values([
        {
          id: "key-idle",
          npo_id: npo.id,
          key_hash: sha256_hex("idle"),
          prefix: "bgc_idle",
          last4: "idle",
          allowed_by: owner.id,
          created_at: new Date(now).toISOString(),
          last_used_at: new Date(now - 91 * DAY).toISOString(),
        },
        {
          id: "key-live",
          npo_id: npo.id,
          key_hash: sha256_hex("live"),
          prefix: "bgc_live",
          last4: "live",
          allowed_by: owner.id,
          created_at: new Date(now - 200 * DAY).toISOString(),
          last_used_at: new Date(now).toISOString(),
        },
      ]);
    await db()
      .insert(connector_codes)
      .values([
        {
          code_hash: sha256_hex("expired-code"),
          npo_id: npo.id,
          allowed_by: owner.id,
          iss: "https://app.example",
          expires_at: new Date(now - 1000).toISOString(),
        },
        {
          code_hash: sha256_hex("fresh-code"),
          npo_id: npo.id,
          allowed_by: owner.id,
          iss: "https://app.example",
          expires_at: new Date(now + 10 * 60 * 1000).toISOString(),
        },
      ]);
    await db()
      .insert(connector_idempotency)
      .values([
        {
          key_id: "key-live",
          idem_key: "old-request",
          request_hash: sha256_hex("old-request"),
          status: "pending",
          created_at: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
        },
        {
          key_id: "key-live",
          idem_key: "fresh-request",
          request_hash: sha256_hex("fresh-request"),
          status: "pending",
          created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        },
      ]);

    const res = await tick();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(verify_qstash).toHaveBeenCalledOnce();

    const keys = await db().select().from(connector_keys);
    expect(
      keys.find((row) => row.id === "key-idle")?.revoked_at
    ).not.toBeNull();
    expect(keys.find((row) => row.id === "key-live")?.revoked_at).toBeNull();

    const codes = await db().select().from(connector_codes);
    expect(codes.map((row) => row.code_hash)).toEqual([
      sha256_hex("fresh-code"),
    ]);

    const idem = await db().select().from(connector_idempotency);
    expect(idem.map((row) => row.idem_key)).toEqual(["fresh-request"]);
  });

  test("a rejected qstash signature sweeps nothing", async () => {
    const npo = (await seed_npo(db(), {
      name: "Alpha",
      registration_number: "EIN-A",
    }))!;
    const owner = (await seed_user(db(), "ada@test.com", "Ada", "Lovelace"))!;
    await db()
      .insert(connector_keys)
      .values({
        id: "key-idle",
        npo_id: npo.id,
        key_hash: sha256_hex("idle"),
        prefix: "bgc_idle",
        last4: "idle",
        allowed_by: owner.id,
        last_used_at: new Date(Date.now() - 91 * DAY).toISOString(),
      });
    verify_qstash.mockRejectedValueOnce(new Error("bad signature"));

    await expect(tick()).rejects.toThrow("bad signature");

    const [row] = await db().select().from(connector_keys);
    expect(row?.revoked_at).toBeNull();
  });
});
