import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((d: unknown, msg: string) => ({ d, msg })),
}));

import { admin_ctx } from "#/.server/auth";
import { action, loader } from "./route";

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

describe("edit profile", () => {
  it("redirects to the organization page's Better Giving Page section", () => {
    const res = loader({ params: { id: "7" } } as never) as Response;
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/admin/7/organization#page");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400"
    );
  });

  it("still saves a PATCH from a page loaded before the fold", async () => {
    const db = test_db.current!.db;
    const [npo] = await db
      .insert(npos)
      .values({
        registration_number: "EIN-EDIT",
        name: "Edit Org",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
        tagline: "before",
      })
      .returning();

    const res = await (action as any)({
      request: new Request(`http://x/admin/${npo!.id}/edit-profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagline: "after" }),
      }),
      params: { id: String(npo!.id) },
      context: {
        get: (key: unknown) => (key === admin_ctx ? npo!.id : undefined),
      },
    });

    expect(res.msg).toBe("Profile updated");
    const [row] = await db
      .select({ tagline: npos.tagline })
      .from(npos)
      .where(eq(npos.id, npo!.id));
    expect(row?.tagline).toBe("after");
  });
});
