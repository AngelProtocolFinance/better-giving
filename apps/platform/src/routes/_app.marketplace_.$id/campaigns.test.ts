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

vi.mock("#/errors/report", () => ({
  report_error: vi.fn(),
}));

const { campaign_members, campaigns } = await import("$/pg/schema/campaign");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { loader } = await import("./api");

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
  ]);
  await db.insert(campaign_members).values([
    { campaign_id: "live-1", npo_id: npo!.id },
    { campaign_id: "draft-1", npo_id: npo!.id },
    { campaign_id: "ended-1", npo_id: npo!.id },
  ]);
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("marketplace profile campaigns", () => {
  it("lists live campaigns only", async () => {
    const data = await loader({ params: { id: "acme" } } as any);
    expect(data.campaigns.map((c) => c.slug)).toEqual(["live"]);
    expect(data.campaigns.every((c) => c.status === "live")).toBe(true);
  });
});
