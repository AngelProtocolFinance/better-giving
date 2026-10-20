import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const collide = vi.hoisted(() => ({ on: false }));

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
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((d: unknown) => d),
}));
vi.mock("$/pg/queries/npo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$/pg/queries/npo")>();
  return {
    ...actual,
    npo_by_slug: async (slug: string) => {
      if (collide.on) return undefined;
      return actual.npo_by_slug(slug);
    },
  };
});

import { admin_ctx } from "#/.server/auth";
import { create_test_db } from "$/pg/test-utils/pglite";
import { endowUpdate } from "./endow-update-action";

const db = () => test_db.current!.db;
const action = endowUpdate({ success: "Organization updated" });

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  collide.on = false;
  await db().delete(npos);
});

async function seed(label: string, slug?: string) {
  const [row] = await db()
    .insert(npos)
    .values({
      registration_number: `EIN-${label}`,
      name: "Slug NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      tagline: "before",
      ...(slug ? { slug } : {}),
    })
    .returning();
  return row!;
}

async function save(npo_id: number, slug: string) {
  return (action as any)({
    request: new Request("http://localhost/admin/1/organization", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    }),
    params: { id: String(npo_id) },
    context: {
      get: (key: unknown) => (key === admin_ctx ? npo_id : undefined),
    },
  });
}

async function stored_slug(id: number) {
  const [saved] = await db()
    .select({ slug: npos.slug })
    .from(npos)
    .where(eq(npos.id, id));
  return saved?.slug;
}

describe("endowUpdate slug collision", () => {
  test("a slug another organization already holds is a 400", async () => {
    await seed("holder", "shared");
    const other = await seed("other");
    collide.on = true;

    const res = await save(other.id, "shared");

    expect(res.init.status).toBe(400);
    expect(res.data).toEqual({
      ok: false,
      error: "Slug shared is already taken",
    });
    expect(await stored_slug(other.id)).toBeNull();
  });

  test("a slug that differs only by case is a 400", async () => {
    await seed("holder", "shared");
    const other = await seed("other");
    collide.on = true;

    const res = await save(other.id, "Shared");

    expect(res.init.status).toBe(400);
    expect(res.data).toEqual({
      ok: false,
      error: "Slug Shared is already taken",
    });
    expect(await stored_slug(other.id)).toBeNull();
  });
});
