import { afterAll, beforeAll, expect, test } from "vitest";
import {
  create_test_db,
  seed_npo_sql,
  type TestDb,
} from "../test-utils/pglite";

// 0064 stores the settled net a refused transfer's rebook cut its refunds
// off. a cut row written before the column gets that net from its booked
// remainder; a dist nothing cut keeps it null
let t: TestDb;
let npo: number;
const NOW = "2026-10-14T12:00:00.000Z";

const donation = (id: string) =>
  t.client.query(
    `insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
     values ($1, 1, 'settled', 100, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card')`,
    [id]
  );

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0064" });
  npo = await seed_npo_sql(t.client, "EIN-0064");
  for (const id of ["don-1", "don-2", "don-3"]) await donation(id);
  await t.client.query(
    `insert into dists (id, donation_id, status, date_created, to_id, amount_denom, net, refunds_cut_share)
     values
       ('dist-1', 'don-1', 'settled', $1, $2, 'USD', 50, null),
       ('dist-2', 'don-2', 'settled', $1, $2, 'USD', 75, 0.25),
       ('dist-3', 'don-3', 'settled', $1, $2, 'USD', 100, 1)`,
    [NOW, npo]
  );
  await t.migrate_rest();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("a dist nothing cut keeps a null settled net", async () => {
  const rows = await t.client.query(
    "select settled_net from dists where id = 'dist-1'"
  );
  expect(rows.rows).toEqual([{ settled_net: null }]);
});

test("a cut row is backfilled with the settled net its remainder came from", async () => {
  const rows = await t.client.query(
    "select id, settled_net::float8 as settled_net from dists where id in ('dist-2', 'dist-3') order by id"
  );
  expect(rows.rows).toEqual([
    { id: "dist-2", settled_net: 100 },
    { id: "dist-3", settled_net: 100 },
  ]);
});

test("a cut without its settled net is refused", async () => {
  await expect(
    t.client.query(
      "update dists set refunds_cut_share = 0.5 where id = 'dist-1'"
    )
  ).rejects.toMatchObject({ code: "23514" });
});
