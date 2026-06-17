import { eq } from "drizzle-orm";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { npo_media, npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

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
    dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
    redirectWithSuccess: vi.fn((url: string, _msg: string) => redirect(url)),
  };
});

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports (after mocks hoisted) ---

import {
  edit_action,
  new_action,
  videos_action,
} from "#/pages/admin/media/api";
import VideoEditor from "#/pages/admin/media/video-editor";
import { admin_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { loader } from "../routes/admin.$id.media/api";
import MediaPage from "../routes/admin.$id.media/route";

// --- setup ---

let counter = 0;

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-MEDIA",
  name: "Media Test NPO",
  endow_designation: "Charity",
  overview_pt: "[]",
  hq_country: "United States",
};

async function seed_npo() {
  counter++;
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({ ...NPO_SEED, registration_number: `EIN-MEDIA-${counter}` })
    .returning();
  return row;
}

interface IVideoSeed {
  featured?: boolean;
  url?: string;
}

async function seed_video(npo_id: number, overrides: IVideoSeed = {}) {
  const [row] = await test_db
    .current!.db.insert(npo_media)
    .values({
      id: crypto.randomUUID(),
      npo_id,
      url: overrides.url ?? "https://youtu.be/dQw4w9WgXcQ",
      type: "video",
      featured: overrides.featured ?? false,
      date_created: new Date().toISOString(),
    })
    .returning();
  return row;
}

// --- render helpers ---

function render_media(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id",
      HydrateFallback: () => null,
      children: [
        {
          path: "media",
          Component: MediaPage,
          HydrateFallback: () => null,
          loader: loader as any,
          action: videos_action as any,
          middleware: [
            async ({ context }, next) => {
              context.set(admin_ctx, npo_id);
              return next();
            },
          ],
          children: [
            {
              path: "new",
              Component: VideoEditor,
              action: new_action as any,
            },
            {
              path: ":media_id",
              Component: VideoEditor,
              action: edit_action as any,
            },
          ],
        },
      ],
    },
  ]);

  return render(
    <Stub
      initialEntries={[`/admin/${npo_id}/media`]}
      future={{ v8_middleware: true }}
    />
  );
}

// --- lifecycle ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(npo_media);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

// --- tests ---

it("empty → add video → edit → feature toggle → delete", async () => {
  const npo = await seed_npo();

  // 1. empty state
  let screen = await render_media(npo.id);
  await expect
    .element(screen.getByText(/start by adding your first video/i))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: /add video/i }))
    .toBeInTheDocument();

  // 2. add video — navigate to /new, fill URL, submit
  await screen.getByRole("link", { name: /add video/i }).click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await screen
    .getByLabelText(/web address/i)
    .fill("https://youtu.be/dQw4w9WgXcQ");
  (
    screen.getByRole("button", { name: /continue/i }).element() as HTMLElement
  ).click();

  // redirects to parent — video appears (not featured)
  await expect
    .element(screen.getByRole("button", { name: /feature/i }))
    .toBeVisible();

  // 3. seed a featured video, re-render
  const vid = await seed_video(npo.id, {
    featured: true,
    url: "https://youtu.be/abc123",
  });
  await screen.unmount();
  screen = await render_media(npo.id);

  // featured video shows "unfeature" aria-label
  await expect
    .element(screen.getByRole("button", { name: /unfeature/i }))
    .toBeVisible();

  // 4. edit video — click pencil for the featured video, change URL, submit
  const edit_links = screen.getByRole("link", { name: /edit/i });
  await edit_links.nth(0).click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await expect
    .element(screen.getByLabelText(/web address/i))
    .toHaveDisplayValue("https://youtu.be/abc123");

  await screen.getByLabelText(/web address/i).clear();
  await screen.getByLabelText(/web address/i).fill("https://youtu.be/xyz789");
  (
    screen.getByRole("button", { name: /continue/i }).element() as HTMLElement
  ).click();

  // redirects back — video still featured
  await expect
    .element(screen.getByRole("button", { name: /unfeature/i }))
    .toBeVisible();

  // verify URL updated in DB
  const [updated] = await test_db
    .current!.db.select()
    .from(npo_media)
    .where(eq(npo_media.id, vid.id));
  expect(updated.url).toBe("https://youtu.be/xyz789");

  // 5. unfeature — click star, verify DB toggled
  await screen.getByRole("button", { name: /unfeature/i }).click();
  await vi.waitFor(async () => {
    const [row] = await test_db
      .current!.db.select()
      .from(npo_media)
      .where(eq(npo_media.id, vid.id));
    expect(row.featured).toBe(false);
  });

  // re-render to confirm UI reflects the toggle
  await screen.unmount();
  screen = await render_media(npo.id);
  const feature_btns = screen.getByRole("button", { name: /^feature$/i });
  await expect.element(feature_btns.nth(0)).toBeVisible();
  await expect.element(feature_btns.nth(1)).toBeVisible();

  // 6. delete one video
  await screen
    .getByRole("button", { name: /delete/i })
    .nth(0)
    .click();
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: /delete/i }).elements().length
    ).toBe(1)
  );
});

it("all videos: empty → seed → list → delete", async () => {
  const npo = await seed_npo();

  // 1. empty state
  let screen = await render_media(npo.id);
  await expect
    .element(screen.getByText(/start by adding your first video/i))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: /add video/i }))
    .toBeInTheDocument();

  // 2. seed videos and re-render
  await screen.unmount();
  await seed_video(npo.id, { url: "https://youtu.be/vid1" });
  await seed_video(npo.id, { url: "https://youtu.be/vid2" });
  await seed_video(npo.id, {
    url: "https://youtu.be/vid3",
    featured: true,
  });

  screen = await render_media(npo.id);

  // 3 delete buttons = 3 videos rendered
  await expect
    .element(screen.getByRole("button", { name: /delete/i }).nth(2))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: /delete/i }).elements().length
  ).toBe(3);

  // no "load more" — only 3 items, limit is 10
  await expect.element(screen.getByText(/load more/i)).not.toBeInTheDocument();

  // 3. delete one video
  await screen
    .getByRole("button", { name: /delete/i })
    .nth(0)
    .click();
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: /delete/i }).elements().length
    ).toBe(2)
  );
});

it("video editor: validation errors → fix → submit", async () => {
  const npo = await seed_npo();

  const screen = await render_media(npo.id);
  await expect
    .element(screen.getByText(/start by adding your first video/i))
    .toBeVisible();

  // open add editor
  await screen.getByRole("link", { name: /add video/i }).click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  // invalid URL → submit → error
  await screen.getByLabelText(/web address/i).fill("not-a-url");
  (
    screen.getByRole("button", { name: /continue/i }).element() as HTMLElement
  ).click();
  await expect.element(screen.getByText(/invalid url/i)).toBeVisible();

  // clear → button disabled (value matches default)
  await screen.getByLabelText(/web address/i).clear();
  await expect
    .element(screen.getByRole("button", { name: /continue/i }))
    .toBeDisabled();

  // fix → submit succeeds → redirects back
  await screen
    .getByLabelText(/web address/i)
    .fill("https://youtu.be/dQw4w9WgXcQ");
  (
    screen.getByRole("button", { name: /continue/i }).element() as HTMLElement
  ).click();
  // redirects back — video appears in list
  await expect
    .element(screen.getByRole("button", { name: /feature/i }))
    .toBeVisible();
});
