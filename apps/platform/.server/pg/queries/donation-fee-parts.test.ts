import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
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

import type { ISettlement } from "@/donations";
import { db } from "../db";
import { donation_settlements, donations } from "../schema/donation";
import { create_test_db } from "../test-utils/pglite";
import { donation_get, donation_update } from "./donation";

const DON_ID = "don-chariot";

const sttl: ISettlement = {
  id: "grant-1",
  date: "2026-09-30T00:00:00.000Z",
  currency: "USD",
  net: 95.5,
  fee: 4.5,
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(donation_settlements);
  await db.delete(donations);
  await db.insert(donations).values({
    id: DON_ID,
    upusd: 1,
    status: "intent",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "chariot",
  });
});

test("a settlement's fee split by party reads back beside its total", async () => {
  const fee_parts = { chariot: 2.9, daf: 1.6 };
  await donation_update(db, DON_ID, { settlement: { ...sttl, fee_parts } });

  const don = await donation_get(DON_ID);
  expect(don?.settlement).toMatchObject({ fee: 4.5, fee_parts });
});

test("a settlement with no breakdown reads back with none", async () => {
  await donation_update(db, DON_ID, { settlement: sttl });

  const don = await donation_get(DON_ID);
  expect(don?.settlement?.fee).toBe(4.5);
  expect(don?.settlement?.fee_parts).toBeUndefined();
});

test("a re-settle that carries no breakdown keeps the recorded one", async () => {
  const fee_parts = { chariot: 2.9, daf: 1.6 };
  await donation_update(db, DON_ID, { settlement: { ...sttl, fee_parts } });
  await donation_update(db, DON_ID, { settlement: sttl });

  const don = await donation_get(DON_ID);
  expect(don?.settlement?.fee_parts).toEqual(fee_parts);
});

test("the column holds an object of parts, never another json shape", async () => {
  const { client } = test_db.current!;
  await client.query(
    `insert into donation_settlements (donation_id, sttl_id, date, currency, net, fee) values ($1, 'g', now(), 'USD', 1, 0)`,
    [DON_ID]
  );
  await expect(
    client.query(
      `update donation_settlements set fee_parts = '[1, 2]'::jsonb where donation_id = $1`,
      [DON_ID]
    )
  ).rejects.toThrow(/fee_parts_object_check/);
});
