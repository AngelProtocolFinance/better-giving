import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

import { loader as program_loader } from "../marketplace_.$id_.program.$program_id/route";
import { loader } from "./route";

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

const location = (r: Response) => [r.status, r.headers.get("location")];
const call = (fn: unknown, path: string, params: object) =>
  (fn as (a: unknown) => Promise<Response>)({
    params,
    request: new Request(`https://x${path}`),
  });

describe("old marketplace urls", () => {
  it("301 the profile to /org/<slug|id>, keeping the query", async () => {
    const db = test_db.current!.db;
    const slugged = await seed_npo(db, {
      registration_number: "EIN-SLUG",
      slug: "acme",
    });
    const bare = await seed_npo(db, { registration_number: "EIN-BARE" });

    expect(
      location(
        await call(loader, `/marketplace/${slugged!.id}`, {
          id: String(slugged!.id),
        })
      )
    ).toEqual([301, "/org/acme"]);
    expect(
      location(await call(loader, "/marketplace/acme?x=1", { id: "acme" }))
    ).toEqual([301, "/org/acme?x=1"]);
    expect(
      location(
        await call(loader, `/marketplace/${bare!.id}`, { id: String(bare!.id) })
      )
    ).toEqual([301, `/org/${bare!.id}`]);
  });

  it("301 a program to /org/<slug|id>/program/<id>", async () => {
    const db = test_db.current!.db;
    const npo = await seed_npo(db, {
      registration_number: "EIN-PROG",
      slug: "wells-org",
    });
    const res = await call(
      program_loader,
      `/marketplace/${npo!.id}/program/p1`,
      { id: String(npo!.id), program_id: "p1" }
    );
    expect(location(res)).toEqual([301, "/org/wells-org/program/p1"]);
  });
});
