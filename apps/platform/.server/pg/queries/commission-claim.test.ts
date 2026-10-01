import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { npos } from "../schema/npo";
import { referrer_commissions } from "../schema/referrer";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import {
  commissions_claim,
  commissions_mark_paid,
  commissions_release,
} from "./referrer";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read.
const as_db = (x: unknown) => x as DbOrTx;

const REFERRER = "NPO-REF";

let test_db: TestDb;
let npo_id: number;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  const db = test_db.db;
  await db.delete(referrer_commissions);
  await db.delete(npos);
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-COMMISSION",
      name: "Commission Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      referral_id: REFERRER,
    })
    .returning();
  npo_id = npo!.id;
});

async function seed(donation_id: string, status: string, amount = 10) {
  await test_db.db.insert(referrer_commissions).values({
    referrer_npo: REFERRER,
    date: "2026-09-01T00:00:00.000Z",
    donation_id,
    npo_id,
    amount,
    status: status as "pending",
  });
}

async function seed_claimed(donation_id: string, ref: string) {
  await seed(donation_id, "processing");
  await test_db.db
    .update(referrer_commissions)
    .set({ ref })
    .where(eq(referrer_commissions.donation_id, donation_id));
}

async function status_of(donation_id: string) {
  const [row] = await test_db.db
    .select({
      status: referrer_commissions.status,
      ref: referrer_commissions.ref,
    })
    .from(referrer_commissions)
    .where(eq(referrer_commissions.donation_id, donation_id));
  return row;
}

describe("referrer_commissions migration", () => {
  test("status_check admits processing, and a ref is stored", async () => {
    await seed("don-1", "pending");
    await test_db.db.execute(
      sql`update referrer_commissions set status = 'processing', ref = 'r-1' where donation_id = 'don-1'`
    );
    expect(await status_of("don-1")).toEqual({
      status: "processing",
      ref: "r-1",
    });
  });

  test("status_check still refuses an unknown status", async () => {
    await expect(seed("don-1", "bogus")).rejects.toThrow();
  });
});

describe("commissions_claim", () => {
  test("moves the referrer's pending commissions to processing under one ref", async () => {
    await seed("don-1", "pending", 10);
    await seed("don-2", "pending", 5);
    await seed("don-3", "paid");
    const seen: string[][] = [];

    const claim = await commissions_claim(
      as_db(test_db.db),
      REFERRER,
      (pending) => {
        seen.push(pending.map((c) => c.donation_id));
        return "ref-1";
      }
    );

    expect(seen).toEqual([["don-1", "don-2"]]);
    expect(claim?.ref).toBe("ref-1");
    expect(claim?.commissions.map((c) => [c.donation_id, c.amount])).toEqual([
      ["don-1", 10],
      ["don-2", 5],
    ]);
    expect(await status_of("don-1")).toEqual({
      status: "processing",
      ref: "ref-1",
    });
    expect(await status_of("don-3")).toEqual({ status: "paid", ref: null });
  });

  test("a second claim of the same rows gets nothing", async () => {
    await seed("don-1", "pending");
    await commissions_claim(as_db(test_db.db), REFERRER, () => "ref-1");

    const mk_ref = vi.fn(() => "ref-2");
    const again = await commissions_claim(as_db(test_db.db), REFERRER, mk_ref);

    expect(again).toBeUndefined();
    expect(mk_ref).not.toHaveBeenCalled();
    expect(await status_of("don-1")).toEqual({
      status: "processing",
      ref: "ref-1",
    });
  });
});

describe("commissions_release", () => {
  test("puts the ref's processing commissions back to pending, ref cleared", async () => {
    await seed_claimed("don-1", "ref-1");
    await seed_claimed("don-2", "ref-2");
    // refunded while in flight: stays a loss
    await seed("don-3", "refunded_loss");
    await test_db.db
      .update(referrer_commissions)
      .set({ ref: "ref-1" })
      .where(eq(referrer_commissions.donation_id, "don-3"));

    const released = await commissions_release(as_db(test_db.db), "ref-1");

    expect(released.map((c) => [c.donation_id, c.status])).toEqual([
      ["don-1", "pending"],
    ]);
    expect(await status_of("don-1")).toEqual({ status: "pending", ref: null });
    expect(await status_of("don-2")).toEqual({
      status: "processing",
      ref: "ref-2",
    });
    expect(await status_of("don-3")).toEqual({
      status: "refunded_loss",
      ref: "ref-1",
    });
  });

  test("a released commission is claimable again", async () => {
    await seed("don-1", "pending");
    await commissions_claim(as_db(test_db.db), REFERRER, () => "ref-1");
    await commissions_release(as_db(test_db.db), "ref-1");

    const claim = await commissions_claim(
      as_db(test_db.db),
      REFERRER,
      () => "ref-2"
    );

    expect(claim?.commissions.map((c) => c.donation_id)).toEqual(["don-1"]);
  });
});

describe("commissions_mark_paid", () => {
  test("marks the ref's processing commissions paid and keeps the ref", async () => {
    await seed_claimed("don-1", "ref-1");
    await seed_claimed("don-2", "ref-2");

    const paid = await commissions_mark_paid(as_db(test_db.db), "ref-1");

    expect(paid.map((c) => [c.donation_id, c.status])).toEqual([
      ["don-1", "paid"],
    ]);
    expect(await status_of("don-1")).toEqual({ status: "paid", ref: "ref-1" });
    expect(await status_of("don-2")).toEqual({
      status: "processing",
      ref: "ref-2",
    });
  });

  test("a second mark of the same ref moves nothing", async () => {
    await seed_claimed("don-1", "ref-1");
    await commissions_mark_paid(as_db(test_db.db), "ref-1");

    expect(await commissions_mark_paid(as_db(test_db.db), "ref-1")).toEqual([]);
  });
});
