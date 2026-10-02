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

import { eq } from "drizzle-orm";
import { dists } from "../schema/dist";
import { donations } from "../schema/donation";
import { forms } from "../schema/form";
import { npos } from "../schema/npo";
import { create_test_db } from "../test-utils/pglite";
import { forms_owned_by } from "./form";

const FORM_ID = "form-1";
let owner_id: number;
let member_ids: number[];

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
  await db.delete(forms);
  await db.delete(npos);
  const rows = await db
    .insert(npos)
    .values(
      Array.from({ length: 6 }, (_, i) => ({
        registration_number: `EIN-FORM-${i}`,
        name: `NPO ${i}`,
        endow_designation: "Charity" as const,
        overview_pt: "[]",
        hq_country: "United States",
        active: true,
      }))
    )
    .returning({ id: npos.id });
  owner_id = rows[0]!.id;
  member_ids = rows.slice(1).map((r) => r.id);
  await db.insert(forms).values({
    id: FORM_ID,
    name: "Fund form",
    owner_npo_id: owner_id,
    status: "active",
    date_created: new Date().toISOString(),
  });
});

/** one parent donation on the form, settled as one dist per recipient */
async function seed_gift(donation_id: string, to_ids: number[]) {
  const { db } = test_db.current!;
  await db.insert(donations).values({
    id: donation_id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    form_id: FORM_ID,
  });
  await db.insert(dists).values(
    to_ids.map((to_id) => ({
      id: `${donation_id}-${to_id}`,
      donation_id,
      status: "settled" as const,
      date_created: new Date().toISOString(),
      to_id,
      amount_denom: "USD",
    }))
  );
}

const count_of_form = async () => {
  const page = await forms_owned_by(String(owner_id));
  return page.items.find((f) => f.id === FORM_ID)?.donation_count;
};

test("a gift through a 5-member fund form counts once", async () => {
  await seed_gift("don-fund", member_ids);
  expect(await count_of_form()).toBe(1);
});

test("each parent donation on the form counts once", async () => {
  await seed_gift("don-fund", member_ids);
  await seed_gift("don-single", [owner_id]);
  expect(await count_of_form()).toBe(2);
});

test("a refunded fund gift leaves the count, once, not once per member", async () => {
  await seed_gift("don-fund", member_ids);
  await seed_gift("don-single", [owner_id]);
  await test_db
    .current!.db.update(dists)
    .set({ status: "refunded" })
    .where(eq(dists.donation_id, "don-fund"));
  expect(await count_of_form()).toBe(1);
});

test("a form with no settled gifts counts zero", async () => {
  expect(await count_of_form()).toBe(0);
});
