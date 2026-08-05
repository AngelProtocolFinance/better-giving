import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "../schema/donation";
import { donation_match_events } from "../schema/match";
import { npos } from "../schema/npo";
import { create_test_db, type TestDb } from "../test-utils/pglite-browser";
import type { DbOrTx } from "./helpers";
import { claim_match_arrival } from "./match";

// pglite stands in for neon; the handles differ only in a result-type HKT that
// nothing here reads. see match-void.test.ts.
const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;
let npo_id: number;
let counter = 0;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(donation_match_events);
  await test_db.db.delete(donation_donors);
  await test_db.db.delete(donation_recipients);
  await test_db.db.delete(donations);
  await test_db.db.delete(npos);
  counter = 0;

  const [npo] = await test_db.db
    .insert(npos)
    .values({
      registration_number: "EIN-ARRIVAL",
      name: "Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;
});

/** the donor's original gift, optionally already in the workflow */
async function seed(o?: {
  stamps?: Partial<typeof donation_match_events.$inferInsert>;
}) {
  counter++;
  const db = test_db.db;
  const id = `don-${counter}`;
  await db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 50,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(donation_recipients).values({
    donation_id: id,
    npo_id,
    name: "Test NPO",
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: "donor@test.com",
    name: "Ada Lovelace",
    company_name: "Acme Inc",
  });
  if (o?.stamps) {
    await db.insert(donation_match_events).values({
      id: `evt-${counter}`,
      donation_id: id,
      ...o.stamps,
    });
  }
  return id;
}

/** the employer's gift — a second, born-settled donation row */
async function seed_match() {
  counter++;
  const id = `match-${counter}`;
  await test_db.db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 50,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "match",
  });
  return id;
}

const now = "2026-07-10T00:00:00.000Z";
const events = () => test_db.db.select().from(donation_match_events);
// timestamptz comes back in the session's zone ("2026-07-10 08:00:00+08"), so
// compare instants rather than text
const at = (s?: string | null) => (s ? new Date(s).toISOString() : s);

describe("claim_match_arrival", () => {
  test("stamps the employer's gift onto the donor's event", async () => {
    const id = await seed({ stamps: { submitted_at: "2026-07-02T00:00:00Z" } });
    const match_id = await seed_match();

    const row = await claim_match_arrival(as_db(test_db.db), id, match_id, now);

    expect(at(row?.matched_at)).toBe(now);
    // the pair is what says whose money arrived: the event still hangs off the
    // donor's original gift, and points at the employer's second one
    expect(row?.donation_id).toBe(id);
    expect(row?.matched_donation_id).toBe(match_id);
  });

  test("a second arrival wins nothing and leaves the first where it was", async () => {
    const id = await seed({ stamps: {} });
    const first_match = await seed_match();
    const second_match = await seed_match();

    await claim_match_arrival(as_db(test_db.db), id, first_match, now);
    const second = await claim_match_arrival(
      as_db(test_db.db),
      id,
      second_match,
      "2026-08-01T00:00:00.000Z"
    );

    // a resubmitted settlement form must not move when the money landed, nor
    // repoint the event at a second gift
    expect(second).toBeNull();
    const [row] = await events();
    expect(at(row!.matched_at)).toBe(now);
    expect(row!.matched_donation_id).toBe(first_match);
  });

  test("a voided event takes no match", async () => {
    const id = await seed({
      stamps: {
        submitted_at: "2026-07-02T00:00:00Z",
        voided_at: "2026-07-08T00:00:00Z",
        void_reason: "refunded",
      },
    });
    const match_id = await seed_match();

    const row = await claim_match_arrival(as_db(test_db.db), id, match_id, now);

    // the donor's gift went back, so there is nothing left to match; attaching
    // one would leave a refunded donation reading as a completed match
    expect(row).toBeNull();
    const [stored] = await events();
    expect(stored!.matched_at).toBeNull();
    expect(stored!.matched_donation_id).toBeNull();
  });

  test("money can arrive for a donation that never entered the workflow", async () => {
    const id = await seed();
    const match_id = await seed_match();

    // no employer named, no pack, no filing — and an employer paid anyway
    const row = await claim_match_arrival(as_db(test_db.db), id, match_id, now);

    expect(row?.matched_donation_id).toBe(match_id);
    expect(row?.pack_sent_at).toBeNull();
    // the open is part of the claim, so exactly one event row exists after it
    expect(await events()).toHaveLength(1);
  });

  test("neither half of the pair can be written alone", async () => {
    await seed({ stamps: {} });
    const match_id = await seed_match();
    const [event] = await events();

    // drizzle wraps the driver error, so the constraint name is on the cause
    const refused = async (p: PromiseLike<unknown>) => {
      const e = (await p.then(
        () => null,
        (e) => e
      )) as { message?: string; cause?: { message?: string } } | null;
      expect(`${e?.message} ${e?.cause?.message}`).toMatch(
        /matched_pair_check/
      );
    };

    // a bare timestamp claims money arrived with nothing to audit it against
    await refused(
      test_db.db
        .update(donation_match_events)
        .set({ matched_at: now })
        .where(eq(donation_match_events.id, event!.id))
    );

    // a bare id is a match nobody can date, and every read gates on the date
    await refused(
      test_db.db
        .update(donation_match_events)
        .set({ matched_donation_id: match_id })
        .where(eq(donation_match_events.id, event!.id))
    );
  });

  test("rolls back with the transaction it runs in", async () => {
    const id = await seed({ stamps: {} });
    const match_id = await seed_match();

    await expect(
      test_db.db.transaction(async (tx) => {
        await claim_match_arrival(as_db(tx), id, match_id, now);
        throw new Error("settle_npo failed");
      })
    ).rejects.toThrow("settle_npo failed");

    // the settlement seam pairs this with the employer's donation row and the
    // npo credit: a stamp that survived a rolled-back settlement would claim
    // money that was never recorded
    const [row] = await events();
    expect(row!.matched_at).toBeNull();
  });
});
