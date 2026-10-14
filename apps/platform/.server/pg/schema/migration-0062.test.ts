import { afterAll, beforeAll, expect, test } from "vitest";
import {
  create_test_db,
  seed_npo_sql,
  type TestDb,
} from "../test-utils/pglite";

// 0062 gives a dist the account it was routed to, its stripe transfer and the
// share its refunds cut when a refused transfer rebooked it pooled, and
// an npo its connect and disconnect stamps. the rows already there come through
// it with none
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

test("dists already there stay pooled, with no transfer and no cut", async () => {
  const rows = await t.client.query(
    "select id, stripe_routed_to, stripe_transfer_id, refunds_cut_share from dists order by id"
  );
  const pooled = { stripe_routed_to: null, stripe_transfer_id: null };
  expect(rows.rows).toEqual([
    { id: "dist-1", ...pooled, refunds_cut_share: null },
    { id: "dist-2", ...pooled, refunds_cut_share: null },
  ]);
});

// a null connect stamp is what lets a disconnect for an account connected
// before 0062 land
test("an npo already connected is not marked disconnected, nor stamped connected", async () => {
  const rows = await t.client.query(
    "select stripe_account_id, stripe_connected_at, stripe_deauthorized_at from npos where id = $1",
    [npo]
  );
  expect(rows.rows).toEqual([
    {
      stripe_account_id: "acct_0062",
      stripe_connected_at: null,
      stripe_deauthorized_at: null,
    },
  ]);
});

const pay = (id: string, tr: string) =>
  t.client.query(
    "update dists set stripe_routed_to = 'acct_0062', stripe_transfer_id = $2 where id = $1",
    [id, tr]
  );

test("one transfer id belongs to one dist", async () => {
  await pay("dist-1", "tr_1");
  await expect(pay("dist-2", "tr_1")).rejects.toMatchObject({ code: "23505" });
});

test("a transfer on a dist routed nowhere is refused", async () => {
  await expect(
    t.client.query(
      "update dists set stripe_transfer_id = 'tr_pooled' where id = 'dist-2'"
    )
  ).rejects.toMatchObject({ code: "23514" });
});

test("dists without a transfer still go in side by side", async () => {
  await dist("dist-3", "don-3");
  const rows = await t.client.query(
    "select count(*)::int as n from dists where stripe_routed_to is null"
  );
  expect(rows.rows).toEqual([{ n: 2 }]);
});

const cut = (share: number) =>
  t.client.query(
    "update dists set refunds_cut_share = $1 where id = 'dist-2'",
    [share]
  );

test("a cut is a share of the charge, never none or more than all of it", async () => {
  await cut(1);
  await expect(cut(0)).rejects.toMatchObject({ code: "23514" });
  await expect(cut(1.01)).rejects.toMatchObject({ code: "23514" });
  const rows = await t.client.query(
    "select refunds_cut_share::float8 as share from dists where id = 'dist-2'"
  );
  expect(rows.rows).toEqual([{ share: 1 }]);
});
