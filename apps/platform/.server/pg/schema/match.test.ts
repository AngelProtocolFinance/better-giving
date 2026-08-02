import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { create_test_db, type TestDb } from "../test-utils/pglite-browser";
import { donations } from "./donation";
import { donation_match_events } from "./match";

let t: TestDb;

const DONATION_ID = "don_1";

beforeEach(async () => {
  t = await create_test_db();
  await t.db.insert(donations).values({
    id: DONATION_ID,
    upusd: 1,
    status: "confirmed",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
});

afterEach(async () => {
  await t.client.close();
});

// drizzle wraps the driver error in a generic "Failed query" — the violated
// constraint name only survives on `cause`.
async function violation(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e: any) {
    return `${e.message} ${e.cause?.message ?? ""}`;
  }
}

describe("donation_match_events send-failed pair", () => {
  test("rejects a stamp with no kind", async () => {
    const err = await violation(
      t.db.insert(donation_match_events).values({
        id: "evt_1",
        donation_id: DONATION_ID,
        send_failed_at: new Date().toISOString(),
      })
    );
    expect(err).toContain("donation_match_events_send_failed_pair_check");
  });

  test("rejects a kind with no stamp", async () => {
    const err = await violation(
      t.db.insert(donation_match_events).values({
        id: "evt_1",
        donation_id: DONATION_ID,
        send_failed_kind: "pack",
      })
    );
    expect(err).toContain("donation_match_events_send_failed_pair_check");
  });

  test("accepts both together", async () => {
    const err = await violation(
      t.db.insert(donation_match_events).values({
        id: "evt_1",
        donation_id: DONATION_ID,
        send_failed_at: new Date().toISOString(),
        send_failed_kind: "chase",
      })
    );
    expect(err).toBe("");
  });

  test("rejects an unknown kind", async () => {
    const err = await violation(
      t.client.exec(
        `insert into donation_match_events (id, donation_id, send_failed_at, send_failed_kind)
         values ('evt_1', '${DONATION_ID}', now(), 'self_check')`
      )
    );
    expect(err).toContain("donation_match_events_send_failed_kind_check");
  });
});

describe("donation_match_events void pair", () => {
  test("rejects a stamp with no reason", async () => {
    const err = await violation(
      t.db.insert(donation_match_events).values({
        id: "evt_1",
        donation_id: DONATION_ID,
        voided_at: new Date().toISOString(),
      })
    );
    expect(err).toContain("donation_match_events_void_pair_check");
  });

  test("rejects a reason with no stamp", async () => {
    const err = await violation(
      t.db.insert(donation_match_events).values({
        id: "evt_1",
        donation_id: DONATION_ID,
        void_reason: "refunded",
      })
    );
    expect(err).toContain("donation_match_events_void_pair_check");
  });

  test("accepts both together", async () => {
    const err = await violation(
      t.db.insert(donation_match_events).values({
        id: "evt_1",
        donation_id: DONATION_ID,
        voided_at: new Date().toISOString(),
        void_reason: "refunded_loss",
      })
    );
    expect(err).toBe("");
  });

  test("rejects an unknown reason", async () => {
    const err = await violation(
      t.client.exec(
        `insert into donation_match_events (id, donation_id, voided_at, void_reason)
         values ('evt_1', '${DONATION_ID}', now(), 'chargeback')`
      )
    );
    expect(err).toContain("donation_match_events_void_reason_check");
  });
});

describe("donation_match_events donation link", () => {
  test("accepts a row with every stamp null", async () => {
    const err = await violation(
      t.db
        .insert(donation_match_events)
        .values({ id: "evt_1", donation_id: DONATION_ID })
    );
    expect(err).toBe("");
  });

  test("rejects a second event for the same donation", async () => {
    await t.db
      .insert(donation_match_events)
      .values({ id: "evt_1", donation_id: DONATION_ID });
    const err = await violation(
      t.db
        .insert(donation_match_events)
        .values({ id: "evt_2", donation_id: DONATION_ID })
    );
    expect(err).toContain("donation_match_events_donation_id_idx");
  });

  test("rejects an event for an unknown donation", async () => {
    const err = await violation(
      t.db
        .insert(donation_match_events)
        .values({ id: "evt_1", donation_id: "don_missing" })
    );
    expect(err).toContain("donation_match_events_donation_id_donations_id_fk");
  });

  test("deleting the donation cascades to the event", async () => {
    await t.db
      .insert(donation_match_events)
      .values({ id: "evt_1", donation_id: DONATION_ID });
    await t.db.delete(donations).where(eq(donations.id, DONATION_ID));
    const rows = await t.db.select().from(donation_match_events);
    expect(rows).toHaveLength(0);
  });
});
