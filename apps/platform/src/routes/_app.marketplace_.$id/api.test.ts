import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NPO_PUBLIC_KEYS } from "$/pg/queries/npo";
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

const { loader } = await import("./api");
const { create_test_db } = await import("$/pg/test-utils/pglite");

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("public npo profile loader", () => {
  it("sends the npo's profile fields and none of its private columns", async () => {
    const [npo] = await test_db
      .current!.db.insert(npos)
      .values({
        registration_number: "EIN-PROFILE",
        name: "Profile Org",
        slug: "profile-org",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
        street_address: "1 Main St",
        liq: 1234,
        cash: 567,
        lock_units: 89,
        w_form: "w9-eid",
        referral_id: "REF-PROFILE",
        payout_minimum: 50,
      })
      .returning();

    for (const id of [String(npo.id), "profile-org"]) {
      const d = await loader({
        request: new Request(`https://x/marketplace/${id}`),
        params: { id },
      } as any);
      // settle the deferred reads before afterAll closes the db under them
      await Promise.all([d.funds, d.media, d.programs]);

      expect(d.npo).toMatchObject({
        id: npo.id,
        name: "Profile Org",
        street_address: "1 Main St",
      });
      expect(Object.keys(d.npo).sort()).toEqual([...NPO_PUBLIC_KEYS].sort());
    }
  });
});
