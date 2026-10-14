import { afterAll, beforeAll, expect, test } from "vitest";
import {
  create_test_db,
  seed_npo_sql,
  type TestDb,
} from "../test-utils/pglite";

// 0065 stores when stripe created a dist's transfer. a transfer already
// stored has no such time, so it keeps the donation date the list ordered by.
// a dist with no transfer keeps the column null
let t: TestDb;
let npo: number;

const donation = (id: string) =>
  t.client.query(
    `insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
     values ($1, 1, 'settled', 100, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card')`,
    [id]
  );

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0065" });
  npo = await seed_npo_sql(t.client, "EIN-0065");
  for (const id of ["don-old", "don-new", "don-open"]) await donation(id);
  await t.client.query(
    `insert into dists (id, donation_id, status, date_created, to_id, amount_denom, stripe_routed_to, stripe_transfer_id)
     values
       ('dist-old', 'don-old', 'settled', '2026-01-01T00:00:00.000Z', $1, 'USD', 'acct_0065', 'tr_old'),
       ('dist-new', 'don-new', 'settled', '2026-06-01T00:00:00.000Z', $1, 'USD', 'acct_0065', 'tr_new'),
       ('dist-open', 'don-open', 'settled', '2026-06-01T00:00:00.000Z', $1, 'USD', 'acct_0065', null)`,
    [npo]
  );
  await t.migrate_rest();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("a stored transfer keeps the donation date it was listed by", async () => {
  const rows = await t.client.query<{ id: string; kept: boolean }>(
    `select id, stripe_transfer_created_at = date_created as kept
     from dists where stripe_transfer_id is not null order by id`
  );
  expect(rows.rows).toEqual([
    { id: "dist-new", kept: true },
    { id: "dist-old", kept: true },
  ]);
});

test("a dist with no transfer keeps a null creation time", async () => {
  const rows = await t.client.query<{ empty: boolean }>(
    "select stripe_transfer_created_at is null as empty from dists where id = 'dist-open'"
  );
  expect(rows.rows).toEqual([{ empty: true }]);
});
