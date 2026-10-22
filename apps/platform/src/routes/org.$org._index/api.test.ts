import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const report_error = vi.hoisted(() => vi.fn());

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

vi.mock("#/errors/report", () => ({ report_error }));

const npo_queries = await import("$/pg/queries/npo");
const { NPO_PUBLIC_KEYS } = npo_queries;
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

    const d = await loader({
      request: new Request("https://x/org/profile-org"),
      params: { org: "profile-org" },
    } as any);
    // settle the deferred reads before afterAll closes the db under them
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.npo).toMatchObject({
      id: npo.id,
      name: "Profile Org",
      street_address: "1 Main St",
    });
    expect(Object.keys(d.npo).sort()).toEqual([...NPO_PUBLIC_KEYS].sort());
    expect(d.url).toBe("https://x/org/profile-org");

    // the id url is an alias of a slugged org's profile
    const thrown = await loader({
      request: new Request(`https://x/org/${npo.id}?referrer=R1`),
      params: { org: String(npo.id) },
    } as any).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(301);
    expect((thrown as Response).headers.get("location")).toBe(
      "/org/profile-org?referrer=R1"
    );
    expect((thrown as Response).headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400"
    );
  });

  it("still serves the profile when the donor count fails, without a count", async () => {
    const [npo] = await test_db
      .current!.db.insert(npos)
      .values({
        registration_number: "EIN-NO-COUNT",
        name: "No Count Org",
        slug: "no-count-org",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
      })
      .returning();
    vi.spyOn(npo_queries, "npo_donor_count").mockRejectedValueOnce(
      new Error("donor count down")
    );

    const d = await loader({
      request: new Request("https://x/org/no-count-org"),
      params: { org: "no-count-org" },
    } as any);
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.npo).toMatchObject({ id: npo!.id, name: "No Count Org" });
    expect(d.donors).toBeNull();
    expect(report_error).toHaveBeenCalledWith(expect.any(Error), {
      endow_id: npo!.id,
    });
  });
});
