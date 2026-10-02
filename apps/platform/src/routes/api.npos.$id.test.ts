import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const { loader } = await import("./api.npos.$id");
const { create_test_db } = await import("$/pg/test-utils/pglite");

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("GET /api/npos/:id", () => {
  it("answers an anonymous caller without the npo's private fields", async () => {
    const [npo] = await test_db
      .current!.db.insert(npos)
      .values({
        registration_number: "EIN-1",
        name: "Public Name",
        slug: "public-name",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
      })
      .returning();

    for (const id of [String(npo.id), "public-name"]) {
      const res = (await loader({
        request: new Request(`https://x/api/npos/${id}`),
        params: { id },
      } as any)) as Response;
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ id: npo.id, name: "Public Name" });
      for (const key of [
        "liq",
        "cash",
        "lock_units",
        "w_form",
        "referral_id",
      ]) {
        expect(body).not.toHaveProperty(key);
      }
      expect(res.headers.get("cache-control")).toBe(
        "public, s-maxage=60, stale-while-revalidate=300"
      );
    }
  });
});
