import { afterAll, beforeAll, expect, test } from "vitest";
import {
  create_test_db,
  seed_npo_sql,
  type TestDb,
} from "../test-utils/pglite";

// 0062 gives a dist its stripe transfer and an npo its disconnect stamp. the
// rows already there come through it with neither
let t: TestDb;
let npo: number;
const NOW = "2026-10-13T12:00:00.000Z";

const dist = (id: string, donation_id: string) =>
  t.client.query(
    `insert into dists (id, donation_id, status, date_created, to_id, amount_denom)
     values ($1, $2, 'settled', $3, $4, 'USD')`,
    [id, donation_id, NOW, npo]
  );

const donation = (id: string) =>
  t.client.query(
    `insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
     values ($1, 1, 'settled', 100, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card')`,
    [id]
  );

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0062" });
  npo = await seed_npo_sql(t.client, "EIN-0062");
  await t.client.query(
    "update npos set stripe_account_id = 'acct_0062' where id = $1",
    [npo]
  );
  for (const id of ["don-1", "don-2", "don-3"]) await donation(id);
  await dist("dist-1", "don-1");
  await dist("dist-2", "don-2");
  await t.migrate_rest();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("dists already there carry no transfer", async () => {
  const rows = await t.client.query(
    "select id, stripe_transfer_id from dists order by id"
  );
  expect(rows.rows).toEqual([
    { id: "dist-1", stripe_transfer_id: null },
    { id: "dist-2", stripe_transfer_id: null },
  ]);
});

test("an npo already connected is not marked disconnected", async () => {
  const rows = await t.client.query(
    "select stripe_account_id, stripe_deauthorized_at from npos where id = $1",
    [npo]
  );
  expect(rows.rows).toEqual([
    { stripe_account_id: "acct_0062", stripe_deauthorized_at: null },
  ]);
});

test("one transfer id belongs to one dist", async () => {
  await t.client.query(
    "update dists set stripe_transfer_id = 'tr_1' where id = 'dist-1'"
  );
  await expect(
    t.client.query(
      "update dists set stripe_transfer_id = 'tr_1' where id = 'dist-2'"
    )
  ).rejects.toMatchObject({ code: "23505" });
});

test("dists without a transfer still go in side by side", async () => {
  await dist("dist-3", "don-3");
  const rows = await t.client.query(
    "select count(*)::int as n from dists where stripe_transfer_id is null"
  );
  expect(rows.rows).toEqual([{ n: 2 }]);
});
