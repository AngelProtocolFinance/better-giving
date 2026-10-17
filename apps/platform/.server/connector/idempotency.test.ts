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
import type { DbOrTx } from "../pg/queries/helpers";
import { user } from "../pg/schema/auth";
import {
  connector_codes,
  connector_idempotency,
  connector_keys,
} from "../pg/schema/connector";
import { npos } from "../pg/schema/npo";
import { user_npo_memberships } from "../pg/schema/user";
import { create_test_db, type TestDb } from "../pg/test-utils/pglite";
import { with_idempotency } from "./idempotency";
import { exchange_code, issue_code } from "./keys";

const as_db = (x: unknown) => x as DbOrTx;

let t: TestDb;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  await t.db.delete(connector_idempotency);
  await t.db.delete(connector_keys);
  await t.db.delete(connector_codes);
  await t.db.delete(user_npo_memberships);
  await t.db.delete(npos);
  await t.db.delete(user);
});

const seed_key = async () => {
  const npo = (await seed_npo(t.db, {
    name: "Red Bird",
    registration_number: "EIN-RB",
  }))!;
  const owner = (await seed_user(t.db, "ada@test.com", "Ada", "Lovelace"))!;
  await t.db
    .insert(user_npo_memberships)
    .values({ user_id: owner.id, npo_id: npo.id });
  const issued = await issue_code(as_db(t.db), {
    npo_id: npo.id,
    allowed_by: owner.id,
    iss: "https://zap.example",
  });
  const exchanged = await exchange_code(as_db(t.db), issued.code);
  if (!exchanged.ok) throw new Error("seed key failed");
  return exchanged.key_id;
};

const call = (
  key_id: string,
  idem: string | undefined,
  body: string,
  handler: () => Promise<Response>
) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (idem !== undefined) headers.set("Idempotency-Key", idem);
  const request = new Request("https://bg.test/connector/v1/x", {
    method: "POST",
    headers,
    body,
  });
  return with_idempotency(as_db(t.db), key_id, request, handler);
};

describe("with_idempotency", () => {
  test.each([
    ["missing", undefined],
    ["blank", "   "],
    ["longer than 255", "k".repeat(256)],
  ])("%s key is 400 and does not call the handler", async (_label, idem) => {
    const key_id = await seed_key();
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const res = await call(key_id, idem, "{}", handler);

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      code: "idempotency_key_required",
      status: 400,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(await t.db.select().from(connector_idempotency)).toHaveLength(0);
  });

  test("the first call stores 201 and a repeat of the same body within 24h is 200", async () => {
    const key_id = await seed_key();
    const body = '{"n":1}';
    const handler = vi.fn(async () => Response.json({ n: 1 }, { status: 201 }));
    const idem = "k".repeat(255);

    const first = await call(key_id, idem, body, handler);

    expect(first.status).toBe(201);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual({ n: 1 });
    const [row] = await t.db.select().from(connector_idempotency);
    expect(row.status).toBe("stored");
    expect(row.response_status).toBe(201);
    expect(row.response_body).toEqual({ n: 1 });
    expect(row.idem_key).toBe(idem);

    const again = await call(key_id, idem, body, handler);

    expect(again.status).toBe(200);
    expect(again.headers.get("cache-control")).toBe("no-store");
    expect(await again.json()).toEqual({ n: 1 });
    expect(handler).toHaveBeenCalledOnce();
    expect(await t.db.select().from(connector_idempotency)).toHaveLength(1);
  });

  test("the same key with a different raw body is 409 and does not call the handler again", async () => {
    const key_id = await seed_key();
    const handler = vi.fn(async () => Response.json({ n: 1 }, { status: 201 }));

    expect((await call(key_id, "same", '{"n":1}', handler)).status).toBe(201);

    const res = await call(key_id, "same", '{ "n": 1 }', handler);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "idempotency_conflict",
      status: 409,
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  test("a pending row is 409 and does not call the handler", async () => {
    const key_id = await seed_key();
    await t.db.insert(connector_idempotency).values({
      key_id,
      idem_key: "flight",
      request_hash: "a".repeat(64),
      status: "pending",
    });
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const res = await call(key_id, "flight", "{}", handler);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "idempotency_conflict",
      status: 409,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test("the same header on a different key id runs the handler and stores a second row", async () => {
    const key_id = await seed_key();
    const npo = (await seed_npo(t.db, {
      name: "Blue Bird",
      registration_number: "EIN-BB",
    }))!;
    const owner = (await seed_user(t.db, "bea@test.com", "Bea", "Lovelace"))!;
    await t.db
      .insert(user_npo_memberships)
      .values({ user_id: owner.id, npo_id: npo.id });
    const issued = await issue_code(as_db(t.db), {
      npo_id: npo.id,
      allowed_by: owner.id,
      iss: "https://zap.example",
    });
    const second = await exchange_code(as_db(t.db), issued.code);
    if (!second.ok) throw new Error("second seed key failed");
    const handler = vi.fn(async () =>
      Response.json({ ok: true }, { status: 201 })
    );

    expect((await call(key_id, "shared", "{}", handler)).status).toBe(201);
    expect((await call(second.key_id, "shared", "{}", handler)).status).toBe(
      201
    );

    expect(handler).toHaveBeenCalledTimes(2);
    const rows = await t.db.select().from(connector_idempotency);
    expect(rows.map((row) => row.key_id).sort()).toEqual(
      [key_id, second.key_id].sort()
    );
  });

  test("a stored row older than 24h can be used again", async () => {
    const key_id = await seed_key();
    await t.db.insert(connector_idempotency).values({
      key_id,
      idem_key: "stale",
      request_hash: "b".repeat(64),
      status: "stored",
      response_status: 201,
      response_body: { stale: true },
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    const handler = vi.fn(async () =>
      Response.json({ fresh: true }, { status: 201 })
    );

    const res = await call(key_id, "stale", '{"fresh":true}', handler);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ fresh: true });
    expect(handler).toHaveBeenCalledOnce();
    const [row] = await t.db.select().from(connector_idempotency);
    expect(row.response_body).toEqual({ fresh: true });
    expect(row.status).toBe("stored");
    expect(Date.parse(row.created_at)).toBeGreaterThan(Date.now() - 60_000);
  });

  test("a handler throw deletes the pending row so the key can be used", async () => {
    const key_id = await seed_key();
    const boom = vi.fn(async (): Promise<Response> => {
      throw new Error("nope");
    });

    await expect(call(key_id, "once", "{}", boom)).rejects.toThrow("nope");
    expect(await t.db.select().from(connector_idempotency)).toHaveLength(0);

    const handler = vi.fn(async () =>
      Response.json({ ok: true }, { status: 201 })
    );
    const res = await call(key_id, "once", "{}", handler);

    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledOnce();
  });
});
