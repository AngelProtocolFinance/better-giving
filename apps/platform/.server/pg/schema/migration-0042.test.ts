import { afterAll, beforeAll, expect, test } from "vitest";
import { create_test_db, type TestDb } from "../test-utils/pglite";

// 0042 runs from `postbuild` while the previous deployment still serves, so
// it must land on rows written under 0041 and leave every one of them valid
let t: TestDb;

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0042" });
  await t.client.exec(`
    insert into npos (registration_number, name, endow_designation, overview_pt, hq_country, active, referral_id)
      values ('EIN-MIG', 'Mig NPO', 'Charity', '[]', 'United States', true, 'REF-MIG');
    insert into donations (id, upusd, status, amount_base, amount_tip, amount_fee_allowance, currency, frequency, source, via)
      values ('don-old', 1, 'settled', 10, 0, 0, 'USD', 'one-time', 'bg-marketplace', 'stripe:card');
    insert into donation_settlements (donation_id, sttl_id, date, currency, net, fee)
      values ('don-old', 'ch_old', now(), 'USD', 9.5, 0.5);
    insert into dists (id, donation_id, status, date_created, amount_denom)
      values ('dist-old', 'don-old', 'settled', now(), 'USD');
    insert into referrer_payouts (id, referrer_npo, date, amount) values ('p-ok', 'REF-MIG', now(), 30);
    insert into referrer_payouts (id, referrer_npo, date, amount, error) values ('p-err', 'REF-MIG', now(), 70, 'not funded');
  `);
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

const payout_ltd = async () => {
  const r = await t.client.query<{ total: string }>(
    `select total from v_referrer_payout_ltd where referrer = 'REF-MIG'`
  );
  return Number(r.rows[0]?.total);
};

test("applies on top of 0041's rows and replaces the payout view in place", async () => {
  expect(await payout_ltd()).toBe(100);

  await t.migrate_rest();

  expect(await payout_ltd()).toBe(30);

  const old = await t.client.query<Record<string, unknown>>(
    `select d.held_at, d.hold_asset, s.fee_parts, x.notice_claimed_at, x.notice_sent_at
       from donations d
       join donation_settlements s on s.donation_id = d.id
       join dists x on x.donation_id = d.id
      where d.id = 'don-old'`
  );
  expect(old.rows).toEqual([
    {
      held_at: null,
      hold_asset: null,
      fee_parts: null,
      notice_claimed_at: null,
      notice_sent_at: null,
    },
  ]);

  const idx = await t.client.query(
    `select 1 from pg_indexes where indexname = 'subscriptions_from_id_lower_status_idx'`
  );
  expect(idx.rows).toHaveLength(1);

  // NOT VALID still binds every write after it
  const checks = await t.client.query<{ conname: string }>(
    `select conname from pg_constraint where conname in ('hold_pair_check', 'fee_parts_object_check') order by conname`
  );
  expect(checks.rows.map((r) => r.conname)).toEqual([
    "fee_parts_object_check",
    "hold_pair_check",
  ]);
});
