import { createRoutesStub, Outlet } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { npos } from "$/pg/schema/npo";
import { programs } from "$/pg/schema/program";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

// --- mocks ---

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
    session: { user: { id: "user-1", role: "user" } },
  })
);

vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return {
    redirectWithSuccess: vi.fn((url: string, _msg: string) => redirect(url)),
  };
});

// --- imports (after mocks) ---

import Page from "#/pages/shared/form-create";
import { loader } from "#/pages/shared/form-create/api";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

// --- helpers ---

let counter = 0;

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-TEST",
  name: "Test NPO",
  endow_designation: "Charity",
  overview_pt: "[]",
  hq_country: "United States",
};

async function seed_npo(
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) {
  counter++;
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      ...NPO_SEED,
      registration_number: `EIN-${counter}`,
      ...overrides,
    })
    .returning();
  return row;
}

async function seed_program(npo_id: number, title: string) {
  counter++;
  const id = `prog-${counter}`;
  await test_db.current!.db.insert(programs).values({
    id,
    npo_id,
    title,
    description_pt: "{}",
    created_at: new Date().toISOString(),
  });
  return id;
}

async function render_page(search = "") {
  const Stub = createRoutesStub([
    {
      path: "/dashboard/forms",
      Component: () => <Outlet />,
      children: [
        {
          path: "create",
          Component: Page,
          loader: loader as any,
        },
        // action redirect target
        {
          path: ":id/edit",
          Component: () => <div data-testid="edit-page" />,
        },
      ],
    },
  ]);

  return await render(
    <Stub initialEntries={[`/dashboard/forms/create${search}`]} />
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

// --- tests ---

describe("user creates donation form", () => {
  it("renders form with npo selector, tag input, and submit", async () => {
    await seed_npo({ name: "Save the Whales" });

    const screen = await render_page();

    await expect
      .element(screen.getByRole("combobox", { name: /nonprofit/i }))
      .toBeVisible();
    await expect
      .element(screen.getByPlaceholder(/e\.g\. in mywebsite/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /submit/i }))
      .toBeVisible();
  });

  it("shows npo options on click without searching", async () => {
    await seed_npo({ name: "Save the Whales" });
    await seed_npo({ name: "Plant a Tree" });

    const screen = await render_page();

    // dispatch directly to bypass dialog's inert overlay
    const combo = screen
      .getByRole("combobox", { name: /nonprofit/i })
      .element() as HTMLElement;
    combo.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );

    // options render in a portal outside the dialog — use page-level locators
    await expect
      .element(page.getByRole("option", { name: "Save the Whales" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "Plant a Tree" }))
      .toBeVisible();
  });

  it("shows program selector when npo has programs", async () => {
    const npo = await seed_npo({ name: "Org with Programs" });
    await seed_program(npo.id, "Youth Initiative");

    const screen = await render_page(`?npo_id=${npo.id}`);

    await expect.element(screen.getByText(/select program/i)).toBeVisible();
  });

  it("hides program selector when npo has no programs", async () => {
    await seed_npo({ name: "Org without Programs" });

    const screen = await render_page();

    const prog = screen.getByText(/select program/i).query();
    expect(prog).toBeNull();
  });
});
