import { afterAll, beforeAll, expect, test, vi } from "vitest";
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

import { user } from "../schema/auth";
import { campaigns } from "../schema/campaign";
import { npos } from "../schema/npo";
import { programs } from "../schema/program";
import { create_test_db } from "../test-utils/pglite";
import { campaign_live_for_program } from "./campaign";

const PROG = "prog-live";

beforeAll(async () => {
  test_db.current = await create_test_db();
  const { db } = test_db.current;
  await db.insert(user).values({
    id: "user-prog",
    name: "Ada Admin",
    email: "ada-prog@test.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    first_name: "Ada",
    last_name: "Admin",
  });
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-PROG-LIVE",
      name: "Acme",
      slug: "acme",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active: true,
      published: true,
    })
    .returning({ id: npos.id });
  await db.insert(programs).values(
    [PROG, "prog-other"].map((id) => ({
      id,
      npo_id: npo!.id,
      title: id,
      description_pt: "[]",
    }))
  );
  const campaign = (
    slug: string,
    o: Partial<typeof campaigns.$inferInsert>
  ): typeof campaigns.$inferInsert => ({
    id: slug,
    owner_npo_id: npo!.id,
    creator_id: "user-prog",
    name: slug,
    slug,
    status: "live",
    program_id: PROG,
    ...o,
  });
  await db.insert(campaigns).values([
    campaign("older", { created_at: "2026-01-01T00:00:00.000Z" }),
    campaign("newer", {
      created_at: "2026-02-01T00:00:00.000Z",
      ends_at: "2099-01-01T00:00:00.000Z",
    }),
    campaign("draft", { status: "draft" }),
    campaign("ended", { status: "ended" }),
    campaign("past", { ends_at: "2020-01-01T00:00:00.000Z" }),
    campaign("other-program", { program_id: "prog-other" }),
    campaign("no-program", { program_id: null }),
  ]);
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

test("lists the program's live campaigns, newest first, as presented rows", async () => {
  const rows = await campaign_live_for_program(PROG);
  expect(rows.map((c) => c.slug)).toEqual(["newer", "older"]);
  expect(rows[0]).toMatchObject({
    status: "live",
    owner_slug: "acme",
    raised: 0,
  });
});
