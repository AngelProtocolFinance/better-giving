import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("../db", () => ({
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

import { dists } from "../schema/dist";
import { donation_donors, donations } from "../schema/donation";
import { npos } from "../schema/npo";
import { programs } from "../schema/program";
import { create_test_db } from "../test-utils/pglite";
import { program_donor_count } from "./donor";

const PROG = "prog-a";

let npo_id: number;
let other_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const { db } = test_db.current!;
  await db.delete(dists);
  await db.delete(donations);
  await db.delete(npos);
  const rows = await db
    .insert(npos)
    .values(
      ["A", "B"].map((k) => ({
        registration_number: `EIN-PROG-DONOR-COUNT-${k}`,
        name: `NPO ${k}`,
        endow_designation: "Charity" as const,
        overview_pt: "[]",
        hq_country: "United States",
        active: true,
      }))
    )
    .returning({ id: npos.id });
  npo_id = rows[0]!.id;
  other_id = rows[1]!.id;
  await db.insert(programs).values([
    { id: PROG, npo_id, title: "A1", description_pt: "[]" },
    { id: "prog-a2", npo_id, title: "A2", description_pt: "[]" },
    { id: "prog-b", npo_id: other_id, title: "B1", description_pt: "[]" },
  ]);
});

interface IGift {
  program_id: string | null;
  to_id?: number;
  dist_status?: "settled" | "refunded" | "refunded_loss";
}

/** one gift from `email`, settled as a single dist (to npo A by default) */
async function seed_gift(id: string, email: string, gift: IGift) {
  const { db } = test_db.current!;
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
    program_id: gift.program_id,
  });
  await db.insert(donation_donors).values({ donation_id: id, email });
  await db.insert(dists).values({
    id: `${id}-dist`,
    donation_id: id,
    status: gift.dist_status ?? "settled",
    date_created: new Date().toISOString(),
    to_id: gift.to_id ?? npo_id,
    amount_denom: "USD",
  });
}

test("a settled gift to the program counts its donor", async () => {
  await seed_gift("don-1", "jane@x.com", { program_id: PROG });
  expect(await program_donor_count(PROG)).toBe(1);
});

test("refunded and refunded_loss gifts don't count", async () => {
  await seed_gift("don-1", "jane@x.com", { program_id: PROG });
  await seed_gift("don-2", "bob@x.com", {
    program_id: PROG,
    dist_status: "refunded",
  });
  await seed_gift("don-3", "carol@x.com", {
    program_id: PROG,
    dist_status: "refunded_loss",
  });
  expect(await program_donor_count(PROG)).toBe(1);
});

test("a repeat donor counts once", async () => {
  await seed_gift("don-1", "jane@x.com", { program_id: PROG });
  await seed_gift("don-2", "jane@x.com", { program_id: PROG });
  expect(await program_donor_count(PROG)).toBe(1);
});

test("the org's other programs and undesignated gifts don't count", async () => {
  await seed_gift("don-1", "jane@x.com", { program_id: PROG });
  await seed_gift("don-2", "bob@x.com", { program_id: "prog-a2" });
  await seed_gift("don-3", "carol@x.com", { program_id: null });
  expect(await program_donor_count(PROG)).toBe(1);
});

test("another org's program gifts don't count", async () => {
  await seed_gift("don-1", "jane@x.com", { program_id: PROG });
  await seed_gift("don-2", "dave@x.com", {
    program_id: "prog-b",
    to_id: other_id,
  });
  expect(await program_donor_count(PROG)).toBe(1);
});

test("email as stored, like the org's count: case variants are two donors", async () => {
  await seed_gift("don-1", "jane@x.com", { program_id: PROG });
  await seed_gift("don-2", "Jane@x.com", { program_id: PROG });
  expect(await program_donor_count(PROG)).toBe(2);
});

test("a program with no gifts counts zero", async () => {
  expect(await program_donor_count(PROG)).toBe(0);
});
