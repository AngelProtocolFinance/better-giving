import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

// --- mocks (hoisted) ---

// the duplicate branch reports rather than resolving: two rows on one sttl_id
// means a guard failed upstream, and a query that silently picked one would
// keep it invisible.
const report_error = vi.hoisted(() => vi.fn());
vi.mock("@/errors/report", () => ({ report_error }));

// --- imports (after mocks) ---

import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "../schema/donation";
import { npos } from "../schema/npo";
import { create_test_db, type TestDb } from "../test-utils/pglite-browser";
import { donation_by_sttl_id } from "./donation";
import type { DbOrTx } from "./helpers";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which this query does not read. passed explicitly because the default
// handle is the real db.
const as_db = (x: unknown) => x as DbOrTx;

const STTL_ID = "pi_shared";

let test_db: TestDb;
let npo_id: number;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = test_db.db;
  await db.delete(donation_settlements);
  await db.delete(donation_donors);
  await db.delete(donation_recipients);
  await db.delete(donations);
  await db.delete(npos);

  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-STTL-LOOKUP",
      name: "Freegan Food Foundation",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;
});

/** a settled donation carrying `sttl_id`, created at `created_at` */
async function seed(id: string, created_at: string, sttl_id = STTL_ID) {
  const db = test_db.db;
  await db.insert(donations).values({
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
    updated_at: created_at,
  });
  await db.insert(donation_recipients).values({
    donation_id: id,
    npo_id,
    name: "Freegan Food Foundation",
    type: "npo",
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: "donor@test.com",
    name: "Ada Lovelace",
  });
  await db.insert(donation_settlements).values({
    donation_id: id,
    sttl_id,
    date: created_at,
    currency: "USD",
    net: 95,
    fee: 5,
  });
}

describe("donation_by_sttl_id", () => {
  test("returns the donation the settlement id was recorded against", async () => {
    await seed("don-1", "2026-01-01T00:00:00.000Z");

    const row = await donation_by_sttl_id(STTL_ID, as_db(test_db.db));

    expect(row?.id).toBe("don-1");
  });

  test("a settlement id on two donations resolves to the same one every time", async () => {
    // sttl_id has no UNIQUE behind it, so nothing at the db level stops this.
    // the caller derives both its `match` flag and the donation id it returns
    // from whichever row comes back — unordered, a redelivery could recover a
    // different donation than the one before it did.
    await seed("don-newer", "2026-02-01T00:00:00.000Z");
    await seed("don-older", "2026-01-01T00:00:00.000Z");

    const a = await donation_by_sttl_id(STTL_ID, as_db(test_db.db));
    const b = await donation_by_sttl_id(STTL_ID, as_db(test_db.db));

    // the oldest row is the one the first delivery wrote — the donation the
    // recovery is meant to be recovering.
    expect(a?.id).toBe("don-older");
    expect(b?.id).toBe("don-older");
  });

  test("a settlement id on two donations is reported", async () => {
    await seed("don-newer", "2026-02-01T00:00:00.000Z");
    await seed("don-older", "2026-01-01T00:00:00.000Z");

    await donation_by_sttl_id(STTL_ID, as_db(test_db.db));

    expect(report_error).toHaveBeenCalledOnce();
  });

  test("the ordinary single-row lookup reports nothing", async () => {
    await seed("don-1", "2026-01-01T00:00:00.000Z");

    await donation_by_sttl_id(STTL_ID, as_db(test_db.db));

    expect(report_error).not.toHaveBeenCalled();
  });

  test("an unknown settlement id is undefined, not an error", async () => {
    const row = await donation_by_sttl_id("pi_never_seen", as_db(test_db.db));

    expect(row).toBeUndefined();
    expect(report_error).not.toHaveBeenCalled();
  });
});
