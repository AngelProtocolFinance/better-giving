import { afterAll, beforeAll, expect, test } from "vitest";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { create_test_db, type TestDb } from "../test-utils/pglite";

// 0044 swaps user_invites' key from invitee alone to (invitee, npo_id) — the
// invites already pending under the old key must come through it intact
let t: TestDb;
let npo_a: number;
let npo_b: number;

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0044" });
  npo_a = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
  npo_b = (await seed_npo(t.db, { registration_number: "EIN-B" }))!.id;
  const invitor = (await seed_user(t.db, "admin@test.com"))!.id;
  await t.client.query(
    `insert into user_invites (invitee, invitee_first, invitor_id, npo_name, npo_id, expire_at)
       values ('ada@test.com', 'Ada', $1, 'A', $2, '2026-10-01T00:00:00Z'),
              ('bo@test.com', 'Bo', $1, 'B', $3, '2026-10-01T00:00:00Z')`,
    [invitor, npo_a, npo_b]
  );
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("keys pending invites on (invitee, npo_id), keeping the rows already there", async () => {
  await t.migrate_rest();

  const pk = await t.client.query<{ cols: string }>(
    `select string_agg(a.attname, ',' order by k.ord) as cols
       from pg_constraint c
       cross join unnest(c.conkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.conrelid = 'user_invites'::regclass and c.contype = 'p'`
  );
  expect(pk.rows).toEqual([{ cols: "invitee,npo_id" }]);

  const rows = await t.client.query(
    "select invitee, npo_id from user_invites order by invitee"
  );
  expect(rows.rows).toEqual([
    { invitee: "ada@test.com", npo_id: npo_a },
    { invitee: "bo@test.com", npo_id: npo_b },
  ]);
});
