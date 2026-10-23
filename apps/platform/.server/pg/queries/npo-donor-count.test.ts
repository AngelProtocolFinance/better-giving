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
import { create_test_db } from "../test-utils/pglite";
import { npo_donor_tab_counts } from "./donor";
import { npo_donor_count } from "./npo";

type TDistStatus = "settled" | "refunded" | "refunded_loss";

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
        registration_number: `EIN-DONOR-COUNT-${k}`,
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
});

interface IShare {
  to_id: number;
  status?: TDistStatus;
  fund_id?: string;
}

/** one donation from `email`, distributed as one dist per share */
async function seed_gift(id: string, email: string, shares: IShare[]) {
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
  });
  await db.insert(donation_donors).values({ donation_id: id, email });
  await db.insert(dists).values(
    shares.map((s) => ({
      id: `${id}-${s.to_id}`,
      donation_id: id,
      status: s.status ?? "settled",
      date_created: new Date().toISOString(),
      to_id: s.to_id,
      amount_denom: "USD",
      fund_id: s.fund_id ?? null,
    }))
  );
}

test("a settled gift counts its donor", async () => {
  await seed_gift("don-1", "jane@x.com", [{ to_id: npo_id }]);
  expect(await npo_donor_count(npo_id)).toBe(1);
});

test("refunded and refunded_loss gifts don't count", async () => {
  await seed_gift("don-1", "jane@x.com", [{ to_id: npo_id }]);
  await seed_gift("don-2", "bob@x.com", [
    { to_id: npo_id, status: "refunded" },
  ]);
  await seed_gift("don-3", "carol@x.com", [
    { to_id: npo_id, status: "refunded_loss" },
  ]);
  expect(await npo_donor_count(npo_id)).toBe(1);
});

test("a repeat donor counts once", async () => {
  await seed_gift("don-1", "jane@x.com", [{ to_id: npo_id }]);
  await seed_gift("don-2", "jane@x.com", [{ to_id: npo_id }]);
  expect(await npo_donor_count(npo_id)).toBe(1);
});

test("another org's gifts don't count", async () => {
  await seed_gift("don-1", "jane@x.com", [{ to_id: npo_id }]);
  await seed_gift("don-2", "dave@x.com", [{ to_id: other_id }]);
  expect(await npo_donor_count(npo_id)).toBe(1);
});

test("a gift routed through a fund counts at each member org", async () => {
  await seed_gift("don-fund", "erin@x.com", [
    { to_id: npo_id, fund_id: "fund-1" },
    { to_id: other_id, fund_id: "fund-1" },
  ]);
  expect(await npo_donor_count(npo_id)).toBe(1);
});

test("the public count and the admin badge agree, email as stored", async () => {
  await seed_gift("don-1", "jane@x.com", [{ to_id: npo_id }]);
  await seed_gift("don-2", "Jane@x.com", [{ to_id: npo_id }]);
  const { donor_total } = await npo_donor_tab_counts(npo_id);
  expect([await npo_donor_count(npo_id), donor_total]).toEqual([2, 2]);
});
