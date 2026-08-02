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
import { match_funnel } from "./match";

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
      registration_number: "EIN-FUNNEL",
      name: "Test NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  npo_id = npo!.id;
});

async function seed(o?: {
  status?: string;
  company_name?: string | null;
  created_at?: string;
  stamps?: Partial<typeof donation_match_events.$inferInsert>;
}) {
  counter++;
  const db = test_db.db;
  const id = `don-${counter}`;
  await db.insert(donations).values({
    id,
    upusd: 1,
    status: o?.status ?? "settled",
    amount_base: 50,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    ...(o?.created_at ? { created_at: o.created_at } : {}),
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
    company_name: o?.company_name,
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

const funnel = () => match_funnel(undefined, as_db(test_db.db));

describe("match_funnel — the denominator", () => {
  test("counts money that landed, refunds included", async () => {
    await seed();
    await seed({ status: "refunded" });
    await seed({ status: "refunded_loss" });

    // narrowing this to `settled` would delete a refunded donation from the
    // numerator and the denominator of every stage at once
    expect((await funnel()).donations).toBe(3);
  });

  test("leaves checkout attempts out", async () => {
    await seed();
    await seed({ status: "intent" });
    await seed({ status: "created" });
    await seed({ status: "failed" });

    expect((await funnel()).donations).toBe(1);
  });

  test("counts an employer only when the donor actually typed one", async () => {
    await seed({ company_name: "Acme Inc" });
    await seed({ company_name: "   " });
    await seed();

    expect((await funnel()).with_employer).toBe(1);
  });

  test("honours the since window", async () => {
    await seed({ created_at: "2026-01-01T00:00:00.000Z" });
    await seed({ created_at: "2026-07-01T00:00:00.000Z" });

    const f = await match_funnel("2026-06-01", as_db(test_db.db));
    expect(f.donations).toBe(1);
  });
});

describe("match_funnel — the stages", () => {
  test("each stage is the presence of its own stamp", async () => {
    await seed({
      company_name: "Acme Inc",
      stamps: { pack_sent_at: "2026-07-01T00:00:00.000Z" },
    });
    await seed({
      company_name: "Globex",
      stamps: {
        pack_sent_at: "2026-07-01T00:00:00.000Z",
        chased_at: "2026-07-04T00:00:00.000Z",
      },
    });
    await seed({
      company_name: "Initech",
      stamps: {
        pack_sent_at: "2026-07-01T00:00:00.000Z",
        submitted_at: "2026-07-02T00:00:00.000Z",
      },
    });

    const f = await funnel();
    expect(f.pack_sent).toBe(3);
    expect(f.chased).toBe(1);
    expect(f.submitted).toBe(1);
  });

  test("a donation with no event sits at with_employer and goes no further", async () => {
    await seed({ company_name: "Acme Inc" });

    const f = await funnel();
    expect(f.with_employer).toBe(1);
    expect(f.pack_sent).toBe(0);
  });
});

describe("match_funnel — the subtrahends", () => {
  test("a refused mail is counted, and its stage still counts too", async () => {
    await seed({
      company_name: "Acme Inc",
      stamps: {
        pack_sent_at: "2026-07-01T00:00:00.000Z",
        send_failed_at: "2026-07-01T00:00:01.000Z",
        send_failed_kind: "pack",
      },
    });

    const f = await funnel();
    // the stamp is burnt before the send, so this row reads as sent — which is
    // exactly why send_failed exists to be subtracted from it
    expect(f.pack_sent).toBe(1);
    expect(f.send_failed).toBe(1);
  });

  test("a refund does not erase the stages the event reached", async () => {
    await seed({
      status: "refunded",
      company_name: "Acme Inc",
      stamps: {
        pack_sent_at: "2026-07-01T00:00:00.000Z",
        submitted_at: "2026-07-02T00:00:00.000Z",
        voided_at: "2026-07-08T00:00:00.000Z",
        void_reason: "refunded",
      },
    });

    const f = await funnel();
    // the pack really was sent and the donor really did file; "it never
    // happened" would be a lie, not a measurement
    expect(f.donations).toBe(1);
    expect(f.pack_sent).toBe(1);
    expect(f.submitted).toBe(1);
    expect(f.voided).toBe(1);
  });
});
