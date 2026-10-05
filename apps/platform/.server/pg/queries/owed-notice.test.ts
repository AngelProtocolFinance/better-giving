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
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "../schema/auth";
import { donations } from "../schema/donation";
import { npos } from "../schema/npo";
import { owed_amounts } from "../schema/owed";
import { loss_logs } from "../schema/revenue";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import {
  admin_credit_owed,
  credit_owed,
  owed_deductible,
  record_owed,
  write_off_owed,
} from "./owed";
import {
  claim_owed_notice,
  mark_owed_notice_sent,
  owed_notices_due,
  queue_owed_notices_missed,
  release_owed_notice,
} from "./owed-notice";

const terms = vi.hoisted(() => ({ effective: null as string | null }));
vi.mock("../../env", async (io) => ({
  ...(await io<typeof import("../../env")>()),
  get owed_terms_effective() {
    return terms.effective;
  },
}));

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read
const as_db = (x: unknown) => x as DbOrTx;

const EFFECTIVE = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-20T12:00:00.000Z";

let t: TestDb;
let npo_a: number;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  terms.effective = EFFECTIVE;
  await t.db.delete(loss_logs);
  await t.db.delete(owed_amounts);
  await t.db.delete(donations);
  await t.db.delete(npos);
  await t.db.delete(user);
  npo_a = (await seed_npo(t.db, { registration_number: "EIN-A" }))!.id;
});

const gift = (id: string, created_at: string) =>
  t.db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at,
  });

/** the refund webhook's write, as each delivery of one event makes it */
const refund = (donation_id: string) =>
  t.db.transaction((tx) =>
    record_owed(as_db(tx), {
      donation_id,
      party: { npo_id: npo_a },
      source: "refund",
      source_ref: `re_${donation_id}`,
      received_usd: 90,
      fee_processing_usd: 3.2,
      now: NOW,
    })
  );

const due = async () =>
  (await owed_notices_due(50, as_db(t.db))).map((n) => n.kind);

describe("the recorded notice", () => {
  test("is due once, and a redelivery after the send queues none", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    await refund("don-1");

    const [notice, ...more] = await owed_notices_due(50, as_db(t.db));
    expect([notice?.kind, more]).toEqual(["recorded", []]);

    const claim = await claim_owed_notice(notice!.id, as_db(t.db));
    expect(claim.status).toBe("claimed");
    await mark_owed_notice_sent(notice!.id, as_db(t.db));
    await refund("don-1");

    expect(await due()).toEqual([]);
    expect(await claim_owed_notice(notice!.id, as_db(t.db))).toEqual({
      status: "done",
    });
  });

  test("is none for a gift made before the effective date, or for any while it is unset", async () => {
    await gift("don-before", "2026-10-31T23:59:59.000Z");
    await refund("don-before");
    expect(await due()).toEqual([]);

    terms.effective = null;
    await gift("don-on", EFFECTIVE);
    await refund("don-on");
    expect(await due()).toEqual([]);
  });

  test("hands the claimant the row and its party", async () => {
    await gift("don-1", EFFECTIVE);
    const owed = await refund("don-1");
    const [notice] = await owed_notices_due(50, as_db(t.db));

    const claim = await claim_owed_notice(notice!.id, as_db(t.db));
    expect(claim).toMatchObject({
      status: "claimed",
      kind: "recorded",
      round: 0,
      party: { npo_id: npo_a },
      row: {
        id: owed.id,
        donation_id: "don-1",
        state: "recorded",
        outstanding_usd: 93.2,
      },
    });
  });

  test("is done without a send once the row owes nothing, the credit's own notice still due", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    const [notice] = await owed_notices_due(50, as_db(t.db));
    await credit_owed(as_db(t.db), {
      donation_id: "don-1",
      party: { npo_id: npo_a },
      reason: "dispute_won",
      ref: "dp_won",
      now: NOW,
    });

    expect(await claim_owed_notice(notice!.id, as_db(t.db))).toEqual({
      status: "done",
    });
    expect(await due()).toEqual(["credited"]);
  });
});

describe("a claim", () => {
  test("drops a queued notice whose row no longer reaches its party", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    const [notice] = await owed_notices_due(50, as_db(t.db));

    terms.effective = "2026-11-02T00:00:00.000Z";
    expect(await due()).toEqual([]);
    expect(await claim_owed_notice(notice!.id, as_db(t.db))).toEqual({
      status: "done",
    });
  });

  test("is busy while another holds it, and free again once released", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    const [notice] = await owed_notices_due(50, as_db(t.db));
    const first = await claim_owed_notice(notice!.id, as_db(t.db));

    expect(await claim_owed_notice(notice!.id, as_db(t.db))).toEqual({
      status: "busy",
    });
    expect(await due()).toEqual([]);

    if (first.status !== "claimed") throw new Error(first.status);
    await release_owed_notice(notice!.id, first.stamp, as_db(t.db));
    expect(await due()).toEqual(["recorded"]);
  });
});

describe("the recorded notice, re-armed", () => {
  const record = (source_ref: string, received_usd: number, fee: number) =>
    t.db.transaction((tx) =>
      record_owed(as_db(tx), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        source: "refund",
        source_ref,
        received_usd,
        fee_processing_usd: fee,
        now: NOW,
      })
    );
  const send_all = async () => {
    for (const n of await owed_notices_due(50, as_db(t.db))) {
      await claim_owed_notice(n.id, as_db(t.db));
      await mark_owed_notice_sent(n.id, as_db(t.db));
    }
  };

  test("is due once more when a row owing nothing comes to owe again, and once only across redeliveries", async () => {
    await gift("don-1", EFFECTIVE);
    await record("re_1", 36, 1.28);
    await send_all();
    // the partial refund failed: credited back to nothing
    for (const [reason, usd] of [
      ["refund_failed", 36],
      ["refund_failed_fee", 1.28],
    ] as const) {
      await credit_owed(as_db(t.db), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        usd,
        reason,
        ref: `${reason}:re_1`,
        now: NOW,
      });
    }
    await send_all();

    await record("re_2", 90, 3.2);
    await record("re_2", 90, 3.2);

    const [again, ...more] = await owed_notices_due(50, as_db(t.db));
    expect([again?.kind, more]).toEqual(["recorded", []]);
    const claim = await claim_owed_notice(again!.id, as_db(t.db));
    expect(claim).toMatchObject({ status: "claimed", round: 1 });
  });

  test("a credit-back after the row owed again is noticed again", async () => {
    await gift("don-1", EFFECTIVE);
    const fail = async (ref: string, received: number, fee: number) => {
      for (const [reason, usd] of [
        ["refund_failed", received],
        ["refund_failed_fee", fee],
      ] as const) {
        await credit_owed(as_db(t.db), {
          donation_id: "don-1",
          party: { npo_id: npo_a },
          usd,
          reason,
          ref: `${reason}:${ref}`,
          now: NOW,
        });
      }
    };
    await record("re_1", 36, 1.28);
    await fail("re_1", 36, 1.28);
    await send_all();
    await record("re_2", 90, 3.2);
    await send_all();

    await fail("re_2", 90, 3.2);

    expect(await due()).toEqual(["credited"]);
  });

  test("is not due again while the row still owes when it grows", async () => {
    await gift("don-1", EFFECTIVE);
    await record("re_1", 36, 1.28);
    await send_all();

    await record("re_2", 90, 3.2);

    expect(await due()).toEqual([]);
  });
});

describe("owed_deductible", () => {
  const deductible = async () =>
    (
      await t.db
        .select({ donation_id: owed_amounts.donation_id })
        .from(owed_amounts)
        .innerJoin(donations, eq(donations.id, owed_amounts.donation_id))
        .where(owed_deductible())
    ).map((r) => r.donation_id);
  const send = async () => {
    for (const n of await owed_notices_due(50, as_db(t.db))) {
      await claim_owed_notice(n.id, as_db(t.db));
      await mark_owed_notice_sent(n.id, as_db(t.db));
    }
  };

  test("holds a row back until its recorded notice is sent", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    expect(await deductible()).toEqual([]);

    await send();
    expect(await deductible()).toEqual(["don-1"]);
  });

  test("holds a row back again once it owes anew, until that notice is sent", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    await send();
    await credit_owed(as_db(t.db), {
      donation_id: "don-1",
      party: { npo_id: npo_a },
      reason: "dispute_won",
      ref: "dp_won",
      now: NOW,
    });
    await t.db.transaction((tx) =>
      record_owed(as_db(tx), {
        donation_id: "don-1",
        party: { npo_id: npo_a },
        source: "dispute",
        source_ref: "dp_2",
        received_usd: 90,
        fee_processing_usd: 3.2,
        fee_dispute_usd: 15,
        now: NOW,
      })
    );
    expect(await deductible()).toEqual([]);

    await send();
    expect(await deductible()).toEqual(["don-1"]);
  });

  test("holds every row back while the date is unset, notice sent or not", async () => {
    await gift("don-1", EFFECTIVE);
    await refund("don-1");
    await send();

    terms.effective = null;
    expect(await deductible()).toEqual([]);
  });
});

describe("queue_owed_notices_missed", () => {
  test("queues one recorded notice for each owing row that reaches its party with none", async () => {
    terms.effective = null;
    await gift("don-1", EFFECTIVE);
    await gift("don-2", EFFECTIVE);
    await refund("don-1");
    await refund("don-2");
    // owes nothing, so there is nothing to tell of before a deduction
    await credit_owed(as_db(t.db), {
      donation_id: "don-2",
      party: { npo_id: npo_a },
      reason: "dispute_won",
      ref: "dp_won",
      now: NOW,
    });
    expect(await due()).toEqual([]);

    terms.effective = EFFECTIVE;
    expect(await queue_owed_notices_missed(as_db(t.db))).toBe(1);
    expect(await queue_owed_notices_missed(as_db(t.db))).toBe(0);
    const notices = await owed_notices_due(50, as_db(t.db));
    expect(notices.map((n) => n.kind)).toEqual(["recorded"]);
  });
});

describe("follow-ups", () => {
  test("a credit-back and a write-off each queue one", async () => {
    const admin = await seed_user(t.db, "admin@test.com");
    await gift("don-1", EFFECTIVE);
    await gift("don-2", EFFECTIVE);
    const credited = await refund("don-1");
    const waived = await refund("don-2");
    const credit = (ref: string, usd: number) =>
      admin_credit_owed(as_db(t.db), {
        owed_id: credited.id,
        usd,
        reason: "goodwill",
        ref,
        actor: admin!.id,
        now: NOW,
      });
    await credit("c-1", 10);
    await credit("c-2", 10);
    await write_off_owed(as_db(t.db), {
      owed_id: waived.id,
      reason: "uncollectable",
      actor: admin!.id,
      now: NOW,
    });

    const notices = await owed_notices_due(50, as_db(t.db));
    expect(
      notices
        .filter((n) => n.kind !== "recorded")
        .map((n) => [n.owed_id, n.kind])
    ).toEqual(
      expect.arrayContaining([
        [credited.id, "credited"],
        [waived.id, "waived"],
      ])
    );
    expect(notices).toHaveLength(4);
  });

  test("a refund core credit queues one", async () => {
    await gift("don-1", EFFECTIVE);
    const owed = await refund("don-1");
    await credit_owed(as_db(t.db), {
      donation_id: "don-1",
      party: { npo_id: npo_a },
      reason: "dispute_won",
      ref: "dp_won",
      now: NOW,
    });

    const notices = await owed_notices_due(50, as_db(t.db));
    expect(notices.map((n) => [n.owed_id, n.kind])).toEqual(
      expect.arrayContaining([[owed.id, "credited"]])
    );
  });
});
