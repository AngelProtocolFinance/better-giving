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
  (await import("$/auth/test-utils")).make_auth_mock({ user_ctx: true })
);

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

import { user_ctx } from "$/auth/test-utils";
import { user } from "$/pg/schema/auth";
import { dists } from "$/pg/schema/dist";
import { donations } from "$/pg/schema/donation";
import { forms } from "$/pg/schema/form";
import { npos } from "$/pg/schema/npo";
import { create_test_db } from "$/pg/test-utils/pglite";
import { loader } from "../api";
import FormsPage from "../route";

const USER_ID = "user-1";
const FORM_ID = "form-1";

const db = () => test_db.current!.db;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(forms);
  await db().delete(npos);
  await db().delete(user);
  await db().insert(user).values({
    id: USER_ID,
    email: "donor@test.com",
    name: "Dee Donor",
    first_name: "Dee",
    last_name: "Donor",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

/** one parent gift on the form, settled as one dist per recipient */
async function seed_settled_gift(form_id: string, to_ids: number[]) {
  const donation_id = "don-1";
  await db().insert(donations).values({
    id: donation_id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    form_id,
  });
  await db()
    .insert(dists)
    .values(
      to_ids.map((to_id) => ({
        id: `${donation_id}-${to_id}`,
        donation_id,
        status: "settled" as const,
        date_created: new Date().toISOString(),
        to_id,
        amount_denom: "USD",
      }))
    );
}

async function render_page() {
  const Stub = createRoutesStub([
    {
      path: "/dashboard/forms",
      Component: FormsPage,
      HydrateFallback: () => null,
      loader: loader as any,
      middleware: [
        async ({ context }, next) => {
          context.set(user_ctx, { id: USER_ID, email: "donor@test.com" });
          return next();
        },
      ],
    },
  ]);
  return await render(
    <Stub
      initialEntries={["/dashboard/forms"]}
      future={{ v8_middleware: true }}
    />
  );
}

describe("donor reads a form's donation count", () => {
  it("counts one fund gift settled to five members as one donation", async () => {
    const members = await db()
      .insert(npos)
      .values(
        Array.from({ length: 5 }, (_, i) => ({
          registration_number: `EIN-${i}`,
          name: `Member ${i}`,
          endow_designation: "Charity" as const,
          overview_pt: "[]",
          hq_country: "United States",
        }))
      )
      .returning({ id: npos.id });
    // the stored counter takes one bump per member's settlement
    await db().insert(forms).values({
      id: FORM_ID,
      name: "Fund form",
      owner_user_id: USER_ID,
      status: "active",
      date_created: new Date().toISOString(),
      ltd_count: 5,
    });
    await seed_settled_gift(
      FORM_ID,
      members.map((m) => m.id)
    );

    const screen = await render_page();

    await expect.element(screen.getByText("Fund form")).toBeVisible();
    const table = screen.getByRole("table").element() as HTMLElement;
    const heads = [...table.querySelectorAll("thead th")];
    const col = heads.findIndex((th) => th.textContent === "Donations");
    const cell = table.querySelectorAll("tbody tr td")[col];
    expect(cell?.textContent).toBe("1");
  });
});
