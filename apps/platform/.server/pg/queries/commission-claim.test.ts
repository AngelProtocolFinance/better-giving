import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { npos } from "../schema/npo";
import { referrer_commissions } from "../schema/referrer";
import { create_test_db, type TestDb } from "../test-utils/pglite";

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
