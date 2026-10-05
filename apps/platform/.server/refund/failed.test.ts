import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  clear_card_gifts,
  PAID_GRANT,
  seed_card_gift,
  seed_paid_commission,
} from "#/__tests__/fixtures/card-gift";
import { donations } from "../pg/schema/donation";
import { owed_amounts } from "../pg/schema/owed";
import type { TestDb } from "../pg/test-utils/pglite";

// --- mocks ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("../pg/db", () => ({
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

vi.mock("../kit/discord", () => ({ fiat_monitor: { send_alert: vi.fn() } }));
vi.mock("../kit/queue", () => ({ enqueue: vi.fn(async () => undefined) }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
// the full refund's subscription lookup: no gift here is recurring
vi.mock("../kit/stripe", () => ({
  stripe: { invoicePayments: { list: vi.fn(async () => ({ data: [] })) } },
}));

// --- imports (after mocks) ---

import { donation_get } from "../pg/queries/donation";
import type { DbOrTx } from "../pg/queries/helpers";
import { owed_for_donation, recover_owed } from "../pg/queries/owed";
import { create_test_db } from "../pg/test-utils/pglite";
import { refund_failed } from "./failed";
import { reverse_charge } from "./reverse";

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.current!.db;
  await db.delete(owed_amounts);
  await clear_card_gifts(db);
});

const seed = (...ds: Parameters<typeof seed_card_gift>[1][]) =>
  seed_card_gift(test_db.current!.db, ...ds);

/** a stripe refund of `taken` of the gift's $100 that succeeded */
const refund = (donation_id: string, taken: number, ref: string) =>
  reverse_charge({
    donation_id,
    rail: "stripe",
    source: "refund",
    share: { taken, of: 100 },
    source_ref: ref,
    alert_from: "charge-refunded",
    notice: { id: `evt_${ref}`, lines: [] },
  });

/** refund `ref`, of `failed` of the gift's $100, failed after succeeding,
 * leaving `left` of the charge taken back */
const fail = (donation_id: string, failed: number, ref: string, left = 0) =>
  refund_failed({
    donation_id,
    rail: "stripe",
    failed_share: { taken: failed, of: 100 },
    share: { taken: left, of: 100 },
    source_ref: ref,
  });

const gift = async (id: string) =>
  (
    await test_db
      .current!.db.select()
      .from(donations)
      .where(eq(donations.id, id))
  )[0];

const outstanding = async (donation_id: string) =>
  (await owed_for_donation(donation_id)).map((o) => o.outstanding_usd);

describe("refund_failed — part of the charge", () => {
  test("a failed $40 of a gift since refunded in full credits back only its share", async () => {
    const { id } = await seed(PAID_GRANT);
    await refund(id, 40, "re_1");
    await refund(id, 100, "re_2");

    await fail(id, 40, "re_1", 60);

    expect(await outstanding(id)).toEqual([55.92]);
  });

  test("a full refund after a failed $40 partial owes the full figure", async () => {
    const { id } = await seed(PAID_GRANT);
    await refund(id, 40, "re_1");
    await fail(id, 40, "re_1");

    expect((await refund(id, 100, "re_2")).status).toBe("reversed");

    expect(await outstanding(id)).toEqual([93.2]);
  });

  test("a recovered $40 partial that failed, then a $60 refund, owes the $60's share less what was recovered", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    await refund(id, 40, "re_1");
    await recover_owed(test_db.current!.db as unknown as DbOrTx, {
      donation_id: id,
      party: { npo_id: npo_ids[0]! },
      usd: 37.28,
      reason: "grant_run",
      ref: "run-1",
      now: "2026-10-02T00:00:00.000Z",
    });
    await fail(id, 40, "re_1");
    expect(await outstanding(id)).toEqual([-37.28]);

    await refund(id, 60, "re_2");

    expect(await outstanding(id)).toEqual([18.64]);
  });

  test("a failed $40 partial owes nothing, and a later $60 refund owes its own share, not reversing the gift", async () => {
    const { id } = await seed(PAID_GRANT);
    await refund(id, 40, "re_1");
    expect(await outstanding(id)).toEqual([37.28]);

    const res = await fail(id, 40, "re_1");

    expect(res).toMatchObject({
      status: "credited",
      donation_status: "settled",
    });
    expect(await outstanding(id)).toEqual([0]);
    expect((await gift(id))?.refunded_share).toBeNull();

    expect((await refund(id, 60, "re_2")).status).toBe("partial_owed");
    expect(await outstanding(id)).toEqual([55.92]);
    expect(await gift(id)).toMatchObject({
      status: "settled",
      refunded_share: 0.6,
    });
  });
});

describe("refund_failed — a gift whose grant hadn't gone out", () => {
  test.each([
    ["reversed from a pending payout", "pending", 100],
    ["reversed from savings", "savings", 100],
    ["partly refunded on a pending payout", "pending", 40],
  ] as const)(
    "%s credits nothing and names the dist to undo by hand",
    async (_, payout, taken) => {
      const { id } = await seed({ ...PAID_GRANT, payout });
      await refund(id, taken, "re_1");

      const res = await fail(id, taken, "re_1");

      expect(res).toEqual({
        status: "by_hand",
        donation_status: taken === 100 ? "refunded" : "settled",
        credited: [],
        by_hand: [expect.stringMatching(new RegExp(`^dist dist-${id}-0 `))],
      });
      expect(await owed_for_donation(id)).toEqual([]);
    }
  );
});

describe("refund_failed — a reversed paid-grant gift", () => {
  test("credits back the $93.20 its refund recorded, leaving the gift reversed", async () => {
    const { id } = await seed(PAID_GRANT);
    await refund(id, 100, "re_1");
    expect(await outstanding(id)).toEqual([93.2]);

    const res = await fail(id, 100, "re_1");

    expect(res).toMatchObject({
      status: "credited",
      donation_status: "refunded_loss",
    });
    expect(await outstanding(id)).toEqual([0]);
    expect((await donation_get(id))!.status).toBe("refunded_loss");
  });

  test("a row already recovered leaves the npo due the $93.20 back", async () => {
    const { id, npo_ids } = await seed(PAID_GRANT);
    await refund(id, 100, "re_1");
    await recover_owed(test_db.current!.db as unknown as DbOrTx, {
      donation_id: id,
      party: { npo_id: npo_ids[0]! },
      usd: 93.2,
      reason: "grant_run",
      ref: "run-1",
      now: "2026-10-02T00:00:00.000Z",
    });

    await fail(id, 100, "re_1");

    expect(await outstanding(id)).toEqual([-93.2]);
  });

  test("credits back the referrer's row from the same refund", async () => {
    const gift = await seed(PAID_GRANT);
    await seed_paid_commission(test_db.current!.db, gift, "REF-1", 5);
    await refund(gift.id, 100, "re_1");

    await fail(gift.id, 100, "re_1");

    const rows = await owed_for_donation(gift.id);
    expect(rows.map((o) => [o.referrer_user, o.outstanding_usd])).toEqual(
      expect.arrayContaining([
        [null, 0],
        ["REF-1", 0],
      ])
    );
  });

  test("a redelivery credits nothing twice", async () => {
    const { id } = await seed(PAID_GRANT);
    await refund(id, 100, "re_1");
    await fail(id, 100, "re_1");

    const again = await fail(id, 100, "re_1");

    expect(await outstanding(id)).toEqual([0]);
    expect(again).toMatchObject({
      status: "credited",
      credited: [expect.stringMatching(/^\$0\.00 credited back/)],
    });
  });
});
