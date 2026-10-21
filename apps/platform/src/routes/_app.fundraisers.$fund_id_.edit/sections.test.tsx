import { createRoutesStub } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render } from "vitest-browser-react";
import { seed_fund, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "$/pg/schema/auth";
import { funds } from "$/pg/schema/fund";
import type { TestDb } from "$/pg/test-utils/pglite";

// --- mocks (hoisted) ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const session = vi.hoisted(() => ({ user: null as any }));

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
vi.mock("#/.server/auth", async () => ({
  ...(await import("$/auth/test-utils")).make_auth_mock(),
  get_session: vi.fn(async () => session),
}));
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((d: unknown, _msg: string) => d),
  dataWithError: vi.fn((d: unknown, _msg: string) => d),
}));
vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports (after mocks hoisted) ---

import { fund_get_or_slug } from "$/pg/queries/fund";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action, loader } from "./api";
import EditPage from "./route";

const db = () => test_db.current!.db;
const FUND_ID = "3b9c7a52-0f4e-4d0a-9a51-6c2e8f1d7b40";

const DESCRIPTION = JSON.stringify([
  {
    _type: "block",
    _key: "b1",
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: "s1", text: "About us", marks: [] }],
  },
]);

/** the PATCH bodies the page sent, in order */
let sent: Record<string, unknown>[] = [];
const recording: typeof action = async (args) => {
  sent.push(await args.request.clone().json());
  return action(args);
};

async function render_edit() {
  const Stub = createRoutesStub([
    {
      path: "/fundraisers/:fund_id/edit",
      Component: EditPage as any,
      HydrateFallback: () => null,
      loader: loader as any,
      action: recording as any,
    },
  ]);
  return await render(
    <Stub initialEntries={[`/fundraisers/${FUND_ID}/edit`]} />
  );
}

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  sent = [];
  await db().delete(funds);
  await db().delete(user);
  const admin = await seed_user(db(), "admin@test.com");
  session.user = { ...admin, role: "admin" };
  await seed_fund(db(), {
    id: FUND_ID,
    name: "Original",
    description_pt: DESCRIPTION,
    target_smart: true,
    npo_owner: null,
    creator_id: admin.id,
  });
});

describe("fundraiser edit — per-section save", () => {
  it("each section's save stays disabled until that section is dirty", async () => {
    const screen = await render_edit();
    const name = screen.getByLabelText(/name/i);
    await expect.element(name).toHaveDisplayValue("Original");

    const general = screen.getByRole("button", { name: "Save general" });
    const media = screen.getByRole("button", { name: "Save media" });
    const goal = screen.getByRole("button", { name: "Save goal" });
    await expect.element(general).toBeDisabled();
    await expect.element(media).toBeDisabled();
    await expect.element(goal).toBeDisabled();

    await name.fill("Renamed");
    await expect.element(general).toBeEnabled();
    await expect.element(media).toBeDisabled();
    await expect.element(goal).toBeDisabled();
  });

  it("saving goal sends only its fields; an unsaved general edit survives", async () => {
    const screen = await render_edit();
    const name = screen.getByLabelText(/name/i);
    await expect.element(name).toHaveDisplayValue("Original");

    await name.fill("Unsaved name");
    await screen.getByText("No goal or progress bar").click();
    const goal = screen.getByRole("button", { name: "Save goal" });
    await goal.click();

    await vi.waitFor(async () =>
      expect((await fund_get_or_slug(FUND_ID))?.target).toBe("0")
    );
    expect(sent).toEqual([{ target: "0" }]);
    expect((await fund_get_or_slug(FUND_ID))?.name).toBe("Original");

    // goal settles clean on the revalidated read; general is read past it
    await expect.element(goal).toBeDisabled();
    await expect.element(name).toHaveDisplayValue("Unsaved name");
    const general = screen.getByRole("button", { name: "Save general" });
    await expect.element(general).toBeEnabled();

    await general.click();
    await vi.waitFor(async () =>
      expect((await fund_get_or_slug(FUND_ID))?.name).toBe("Unsaved name")
    );
    expect(sent[1]).toEqual({ name: "Unsaved name" });
    await expect.element(general).toBeDisabled();
  });

  it("an invalid general field shows in general and does not block saving goal", async () => {
    const screen = await render_edit();
    const name = screen.getByLabelText(/name/i);
    await expect.element(name).toHaveDisplayValue("Original");

    await name.clear();
    await screen.getByRole("button", { name: "Save general" }).click();
    const general = screen.getByRole("region", { name: "General" });
    await expect.element(general.getByText(/required/i)).toBeVisible();
    expect(sent).toEqual([]);

    await screen.getByText("No goal or progress bar").click();
    await screen.getByRole("button", { name: "Save goal" }).click();
    await vi.waitFor(async () =>
      expect((await fund_get_or_slug(FUND_ID))?.target).toBe("0")
    );
    expect(sent).toEqual([{ target: "0" }]);
    expect((await fund_get_or_slug(FUND_ID))?.name).toBe("Original");
  });
});
