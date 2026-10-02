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

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: { user: { id: "u1", role: "user" } },
  })
);

vi.mock("./evaluate", () => ({ evaluate: vi.fn() }));

const { loader } = await import("./api");
const { create_test_db } = await import("$/pg/test-utils/pglite");

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("new fundraiser loader", () => {
  it("seeds the member npo without its private columns", async () => {
    const [npo] = await test_db
      .current!.db.insert(npos)
      .values({
        registration_number: "EIN-FUND-NEW",
        name: "Member Org",
        logo: "https://x/logo.png",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
        liq: 1234,
        cash: 567,
        lock_units: 89,
        w_form: "w9-eid",
        referral_id: "REF-FUND-NEW",
        payout_minimum: 50,
      })
      .returning();

    const d: any = await loader({
      request: new Request(`https://x/fundraisers/new?npo=${npo.id}`),
      params: {},
    } as any);

    expect(d).toMatchObject({
      id: npo.id,
      name: "Member Org",
      logo: "https://x/logo.png",
    });
    expect(Object.keys(d).sort()).toEqual([...NPO_PUBLIC_KEYS].sort());
  });
});
