import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { npos } from "$/pg/schema/npo";
import { programs } from "$/pg/schema/program";
import type { TestDb } from "$/pg/test-utils/pglite";

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

import ProfilePage, {
  loader as profile_loader,
} from "#/routes/org.$org._index/route";
import { admin_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action, loader } from "../api";
import Page from "../route";

// --- setup ---

let counter = 0;

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-TEST",
  name: "Test NPO",
  endow_designation: "Charity",
  overview_pt: "[]",
  hq_country: "United States",
};

async function seed_npo() {
  counter++;
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({ ...NPO_SEED, registration_number: `EIN-${counter}` })
    .returning();
  return row;
}

async function render_programs(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id",
      HydrateFallback: () => null,
      children: [
        {
          path: "programs",
          Component: Page,
          loader: loader as any,
          action: action as any,
          middleware: [
            async ({ context }, next) => {
              context.set(admin_ctx, npo_id);
              return next();
            },
          ],
        },
        {
          path: "program-editor/:program_id",
          Component: () => <div data-testid="program-editor">Editor</div>,
        },
      ],
    },
  ]);

  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/programs`]}
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
  await test_db.current!.db.delete(programs);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

// --- test ---

it("programs: empty → create → delete", async () => {
  const npo = await seed_npo();

  // 1. empty state
  const screen = await render_programs(npo.id);
  await expect.element(screen.getByText("No programs yet")).toBeVisible();

  // 2. create program — redirects to editor
  await screen.getByRole("button", { name: /create program/i }).click();
  await expect.element(screen.getByTestId("program-editor")).toBeVisible();

  // 3. verify on marketplace profile — program appears
  await cleanup();
  const profile = await render_profile(npo.id);
  await expect.element(profile.getByText("New Program")).toBeInTheDocument();

  // 4. go back to admin programs list — new program visible
  await cleanup();
  const screen2 = await render_programs(npo.id);
  await expect.element(screen2.getByText("New Program")).toBeVisible();

  // 5. delete the program — removed from list
  await screen2.getByRole("button", { name: /delete/i }).click();
  await expect
    .element(screen2.getByText("New Program"))
    .not.toBeInTheDocument();

  // back to empty state
  await expect
    .element(screen2.getByText("No programs yet"))
    .toBeInTheDocument();

  // 6. verify on the public profile — the deleted program is gone. the
  // programs section streams in, so a program that must still be there goes
  // first: absence only means something once the section has rendered
  await test_db.current!.db.insert(programs).values({
    id: crypto.randomUUID(),
    npo_id: npo.id,
    title: "Kept Program",
    description_pt: "[]",
  });
  await cleanup();
  const profile2 = await render_profile(npo.id);
  await expect.element(profile2.getByText("Kept Program")).toBeVisible();
  await expect
    .element(profile2.getByText("New Program"))
    .not.toBeInTheDocument();
});

function render_profile(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/org/:org",
      Component: ProfilePage as any,
      HydrateFallback: () => null,
      loader: profile_loader as any,
    },
  ]);
  return render(<Stub initialEntries={[`/org/${npo_id}`]} />);
}
