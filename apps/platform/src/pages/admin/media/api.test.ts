import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { npo_media, npos } from "$/pg/schema/npo";
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
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return {
    dataWithSuccess: vi.fn((d: unknown) => d),
    dataWithError: vi.fn((d: unknown) => d),
    redirectWithSuccess: vi.fn((url: string) => redirect(url)),
  };
});

import { admin_ctx } from "#/.server/auth";
import { create_test_db } from "$/pg/test-utils/pglite";
import { edit_action, new_action } from "./api";

const db = () => test_db.current!.db;
const YOUTUBE = "https://youtu.be/dQw4w9WgXcQ";
const VIMEO = "https://vimeo.com/123456";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(npos);
});

async function seed_npo() {
  const [row] = await db()
    .insert(npos)
    .values({
      registration_number: "EIN-MEDIA-API",
      name: "Media API Org",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  return row!;
}

async function seed_video(npo_id: number) {
  const [row] = await db()
    .insert(npo_media)
    .values({
      id: crypto.randomUUID(),
      npo_id,
      url: YOUTUBE,
      type: "video",
      featured: true,
      date_created: new Date().toISOString(),
    })
    .returning();
  return row!;
}

const videos_of = (npo_id: number) =>
  db().select().from(npo_media).where(eq(npo_media.npo_id, npo_id));

/** a form post as the add and edit dialogs send it, to `action` for `npo_id` */
function submit(
  action: unknown,
  npo_id: number,
  url: string,
  params: Record<string, string> = {}
) {
  return (action as any)({
    request: new Request("http://x/admin/1/media/new", {
      method: "POST",
      body: new URLSearchParams({ url }),
    }),
    params,
    context: {
      get: (key: unknown) => (key === admin_ctx ? npo_id : undefined),
    },
  });
}

describe("video entry is YouTube only, server side", () => {
  it("adds a YouTube link and refuses another site's, writing nothing", async () => {
    const npo = await seed_npo();

    const refused = await submit(new_action, npo.id, VIMEO);
    expect(refused.errors.url.message).toBe("only YouTube links are supported");
    expect(await videos_of(npo.id)).toHaveLength(0);

    const added = await submit(new_action, npo.id, YOUTUBE);
    expect(added).toBeInstanceOf(Response);
    expect(await videos_of(npo.id)).toMatchObject([{ url: YOUTUBE }]);
  });

  it("edits a video to a YouTube link and refuses another site's, leaving the url", async () => {
    const npo = await seed_npo();
    const video = await seed_video(npo.id);
    const params = { media_id: video.id };

    const refused = await submit(edit_action, npo.id, VIMEO, params);
    expect(refused.errors.url.message).toBe("only YouTube links are supported");
    expect(await videos_of(npo.id)).toMatchObject([{ url: YOUTUBE }]);

    const other = "https://www.youtube.com/watch?v=9bZkp7q19f0";
    const saved = await submit(edit_action, npo.id, other, params);
    expect(saved).toBeInstanceOf(Response);
    expect(await videos_of(npo.id)).toMatchObject([{ url: other }]);
  });
});
