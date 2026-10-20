import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { user } from "$/pg/schema/auth";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/pg/db", () => ({
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

const { campaign_members, campaigns } = await import("$/pg/schema/campaign");
const {
  campaign_count,
  campaign_live_count,
  campaign_live_for_npo,
  campaign_shown_status,
} = await import("$/pg/queries/campaign");
const { create_test_db } = await import("$/pg/test-utils/pglite");

beforeAll(async () => {
  test_db.current = await create_test_db();
  const db = test_db.current.db;
  await db.insert(user).values({
    id: "user-mkt",
    name: "Ada Admin",
    email: "ada-mkt@test.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    first_name: "Ada",
    last_name: "Admin",
  });
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: "EIN-MKT",
      name: "Acme",
      slug: "acme",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active: true,
      published: true,
    })
    .returning();
  await db.insert(campaigns).values([
    {
      id: "live-1",
      owner_npo_id: npo!.id,
      creator_id: "user-mkt",
      name: "Live",
      slug: "live",
      status: "live",
      description_pt: "[]",
    },
    {
      id: "draft-1",
      owner_npo_id: npo!.id,
      creator_id: "user-mkt",
      name: "Draft",
      slug: "draft",
      status: "draft",
      description_pt: "[]",
    },
    {
      id: "ended-1",
      owner_npo_id: npo!.id,
      creator_id: "user-mkt",
      name: "Ended",
      slug: "ended",
      status: "ended",
      description_pt: "[]",
    },
    {
      id: "past-1",
      owner_npo_id: npo!.id,
      creator_id: "user-mkt",
      name: "Past",
      slug: "past",
      status: "live",
      ends_at: "2020-01-01T00:00:00.000Z",
      description_pt: "[]",
    },
    {
      id: "future-1",
      owner_npo_id: npo!.id,
      creator_id: "user-mkt",
      name: "Future",
      slug: "future",
      status: "live",
      ends_at: "2099-01-01T00:00:00.000Z",
      description_pt: "[]",
    },
    {
      id: "open-1",
      owner_npo_id: npo!.id,
      creator_id: "user-mkt",
      name: "Open",
      slug: "open",
      status: "live",
      ends_at: null,
      description_pt: "[]",
    },
  ]);
  await db.insert(campaign_members).values([
    { campaign_id: "live-1", npo_id: npo!.id },
    { campaign_id: "draft-1", npo_id: npo!.id },
    { campaign_id: "ended-1", npo_id: npo!.id },
    { campaign_id: "past-1", npo_id: npo!.id },
    { campaign_id: "future-1", npo_id: npo!.id },
    { campaign_id: "open-1", npo_id: npo!.id },
  ]);
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("marketplace profile campaigns", () => {
  it("lists live campaigns only", async () => {
    const [npo] = await test_db.current!.db.select().from(npos);
    const rows = await campaign_live_for_npo(npo!.id);
    expect(rows.map((c) => c.slug).sort()).toEqual(["future", "live", "open"]);
    expect(rows.every((c) => c.status === "live" && c.owner_slug)).toBe(true);
    const past = {
      status: "live" as const,
      ends_at: "2020-01-01T00:00:00.000Z",
    };
    expect(campaign_shown_status(past)).toBe("ended");
    expect(campaign_shown_status({ status: "live", ends_at: null })).toBe(
      "live"
    );
  });

  it("counts every campaign and only those still live", async () => {
    const [npo] = await test_db.current!.db.select().from(npos);
    expect(await campaign_count(npo!.id)).toBe(6);
    expect(await campaign_live_count(npo!.id)).toBe(3);
  });
});
