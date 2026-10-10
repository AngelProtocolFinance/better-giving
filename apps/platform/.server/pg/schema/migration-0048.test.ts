import { afterAll, beforeAll, expect, test } from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { create_test_db, type TestDb } from "../test-utils/pglite";

// 0048 lets loss_logs hold a write-off (of an npo or a referrer, by an admin)
// and stops a grant run recovering what was written off. the losses and owed
// rows already there come through it untouched
let t: TestDb;
let npo: number;
const NOW = "2026-10-04T12:00:00.000Z";

beforeAll(async () => {
  t = await create_test_db({ stop_before: "0048" });
  npo = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
  await t.client.query(
    `insert into loss_logs (id, date, donation_id, dist_id, npo_id, type, amount, npo_amount, fees_bg, fees_processing, reason)
     values ('loss-1', $1, 'don-1', 'dist-1', $2, 'payout', 93.2, 90, 0, 3.2, 'refund after payout')`,
    [NOW, npo]
  );
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

test("keeps the losses already logged, with no party but their npo and no admin", async () => {
  await t.migrate_rest();

  const rows = await t.client.query(
    "select id, npo_id, referrer_user, referrer_npo, dist_id, type, actor from loss_logs"
  );
  expect(rows.rows).toEqual([
    {
      id: "loss-1",
      npo_id: npo,
      referrer_user: null,
      referrer_npo: null,
      dist_id: "dist-1",
      type: "payout",
      actor: null,
    },
  ]);
});

test("a loss without a dist must be a write-off, and a write-off names its admin", async () => {
  const insert = (id: string, type: string, dist_id: string | null) =>
    t.client.query(
      `insert into loss_logs (id, date, donation_id, dist_id, npo_id, type, amount, npo_amount, fees_bg, fees_processing, reason)
       values ($1, $2, 'don-1', $3, $4, $5, 1, 1, 0, 0, 'x')`,
      [id, NOW, dist_id, npo, type]
    );

  await expect(insert("loss-2", "payout", null)).rejects.toMatchObject({
    code: "23514",
  });
  await expect(insert("loss-3", "write_off", null)).rejects.toMatchObject({
    code: "23514",
  });
});

test("a loss names exactly one party", async () => {
  await expect(
    t.client.query(
      `insert into loss_logs (id, date, donation_id, dist_id, type, amount, npo_amount, fees_bg, fees_processing, reason)
       values ('loss-4', $1, 'don-1', 'dist-1', 'payout', 1, 1, 0, 0, 'x')`,
      [NOW]
    )
  ).rejects.toMatchObject({ code: "23514" });
});
