import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { npos } from "../schema/npo";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { npo_update, slug_change_refused } from "./npo";

const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(npos);
});

async function seed(slug?: string) {
  const [row] = await test_db.db
    .insert(npos)
    .values({
      registration_number: `EIN-${slug ?? "none"}`,
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

async function row(id: number) {
  const [saved] = await test_db.db
    .select({ slug: npos.slug, tagline: npos.tagline })
    .from(npos)
    .where(eq(npos.id, id));
  return saved!;
}

describe("npo_update slug", () => {
  test("sets a slug when the nonprofit has none", async () => {
    const npo = await seed();
    await npo_update(as_db(test_db.db), npo.id, { slug: "new-slug" });
    expect((await row(npo.id)).slug).toBe("new-slug");
  });

  test("refuses a change to a slug that is already set and writes nothing else", async () => {
    const npo = await seed("kept-slug");
    await expect(
      npo_update(as_db(test_db.db), npo.id, {
        slug: "other-slug",
        tagline: "after",
      })
    ).rejects.toThrow(slug_change_refused);
    const saved = await row(npo.id);
    expect(saved.slug).toBe("kept-slug");
    expect(saved.tagline).toBe("before");
  });

  test("allows other columns when the slug is repeated", async () => {
    const npo = await seed("kept-slug");
    await npo_update(as_db(test_db.db), npo.id, {
      slug: "kept-slug",
      tagline: "after",
    });
    const saved = await row(npo.id);
    expect(saved.slug).toBe("kept-slug");
    expect(saved.tagline).toBe("after");
  });
});
