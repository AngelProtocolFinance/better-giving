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
import { void_match_event } from "./match";

// the test db is pglite; its drizzle handle differs from neon's only in the
// result-type HKT, which none of these queries read. every other query test
// reaches the same place through the mocked `$/pg/db` proxy — this one passes
// the handle explicitly, because `void_match_event` refuses to default it.
const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;
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
});

async function seed(o?: { event?: boolean }) {
  counter++;
  const db = test_db.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: `EIN-VOID-${counter}`,
      name: `Test NPO ${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();

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
    npo_id: npo!.id,
    name: npo!.name,
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: "donor@test.com",
    name: "Ada Lovelace",
    company_name: "Acme Inc",
  });

  if (o?.event !== false) {
    await db.insert(donation_match_events).values({
      id: `evt-${counter}`,
      donation_id: id,
      pack_sent_at: "2026-01-02T03:04:05Z",
    });
  }
  return id;
}

const events = () => test_db.db.select().from(donation_match_events);

describe("void_match_event", () => {
  test("stamps the void and the reason the donation carries", async () => {
    const id = await seed();

    const row = await void_match_event(as_db(test_db.db), id, "refunded");

    expect(row?.voided_at).not.toBeNull();
    expect(row?.void_reason).toBe("refunded");
    // the stage the event actually reached is untouched — that it got as far as
    // a pack is the one thing about a voided event still worth reading
    expect(row?.pack_sent_at).not.toBeNull();
  });

  test("carries refunded_loss through, so the two rows can be read together", async () => {
    const id = await seed();

    const row = await void_match_event(as_db(test_db.db), id, "refunded_loss");

    expect(row?.void_reason).toBe("refunded_loss");
  });

  test("a replayed refund does not move the stamp forward", async () => {
    const id = await seed();

    const first = await void_match_event(as_db(test_db.db), id, "refunded");
    const second = await void_match_event(as_db(test_db.db), id, "refunded");

    // when the donation was reversed is what the timestamp is there to say; a
    // replayed charge.refunded must not overwrite it with the replay's clock
    expect(second).toBeNull();
    const [row] = await events();
    expect(row!.voided_at).toBe(first!.voided_at);
  });

  test("a donation that never entered the workflow is not an error", async () => {
    const id = await seed({ event: false });

    // the ordinary case: most donations have no event at all
    await expect(
      void_match_event(as_db(test_db.db), id, "refunded")
    ).resolves.toBeNull();
  });

  test("rolls back with the transaction it runs in", async () => {
    const id = await seed();

    await expect(
      test_db.db.transaction(async (tx) => {
        await void_match_event(as_db(tx), id, "refunded");
        throw new Error("dist write failed");
      })
    ).rejects.toThrow("dist write failed");

    // the refund seam pairs this with the donation's status flip: a void that
    // survived a rolled-back refund would suppress sends for money still owed
    const [row] = await events();
    expect(row!.voided_at).toBeNull();
    expect(row!.void_reason).toBeNull();
  });
});
