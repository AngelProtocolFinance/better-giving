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
import { dists } from "$/pg/schema/dist";
import { donation_donors, donations } from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

// pg/queries/helpers uses Node Buffer for base64url cursor encoding. Browser
// tests have no Buffer global, so shim it with btoa/atob.
vi.hoisted(() => {
  if (typeof (globalThis as any).Buffer !== "undefined") return;
  const to_b64url = (s: string) =>
    btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const from_b64url = (s: string) =>
    atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  // function form so anything doing `x instanceof Buffer` doesn't blow up.
  function FakeBuffer() {}
  FakeBuffer.from = (input: string, enc?: string) => {
    const decoded = enc === "base64url" ? from_b64url(input) : input;
    return {
      toString(out_enc?: string) {
        if (out_enc === "base64url") return to_b64url(decoded);
        return decoded;
      },
    };
  };
  (globalThis as any).Buffer = FakeBuffer;
});

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

// CacheRoute → identity; clientLoader → undefined so route.tsx import is harmless.
vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports (after mocks hoisted) ---

import { admin_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import {
  default as DonorsLayout,
  loader as parent_loader,
} from "../../admin.$id.donors/route";
import { loader as index_loader } from "../api";
import DonorsIndex from "../route";

// --- setup ---

let counter = 0;

async function seed_npo() {
  counter++;
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number: `EIN-${counter}`,
      name: `NPO ${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  return row;
}

// seed one settled donation per donor email; amount controls total ordering.
async function seed_donor(npo_id: number, email: string, amount_usd: number) {
  counter++;
  const donation_id = `don-${counter}`;
  await test_db.current!.db.insert(donations).values({
    id: donation_id,
    upusd: amount_usd,
    status: "settled",
    amount_base: amount_usd,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "stripe",
    via: "card",
  });
  await test_db.current!.db.insert(dists).values({
    id: `dist-${counter}`,
    donation_id,
    status: "settled",
    date_created: new Date().toISOString(),
    to_id: npo_id,
    amount: amount_usd,
    amount_usd,
    amount_denom: "USD",
  });
  await test_db.current!.db.insert(donation_donors).values({
    donation_id,
    email,
    name: email.split("@")[0],
  });
}

async function render_page(npo_id: number, search = "") {
  // both parent layout + _index child must be present to exercise the
  // routing surface that broke before: fetcher.load("?index&next=…") only
  // hits the _index loader when ?index is in the query.
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/donors",
      Component: DonorsLayout,
      HydrateFallback: () => null,
      loader: parent_loader as any,
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
      children: [
        {
          index: true,
          Component: DonorsIndex,
          loader: index_loader as any,
        },
      ],
    },
  ]);

  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/donors${search}`]}
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
  // cascade order: donation_donors+dists → donations → npos
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(dists);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

// --- tests ---

describe("admin donor list — pagination via use_table", () => {
  it("renders first 20 donors with a View More button", async () => {
    const npo = await seed_npo();
    // 25 donors with descending amounts so order is deterministic by total desc
    for (let i = 0; i < 25; i++) {
      const amt = 1000 - i; // 1000, 999, …, 976
      await seed_donor(npo.id, `donor${String(i).padStart(2, "0")}@x.com`, amt);
    }

    const screen = await render_page(npo.id);

    // top donor visible (sort=total desc default)
    await expect
      .element(screen.getByText("donor00", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("donor19", { exact: true }))
      .toBeVisible();

    // 21st donor not yet rendered
    await expect.element(screen.getByText("donor20")).not.toBeInTheDocument();

    await expect
      .element(screen.getByRole("button", { name: /view more/i }))
      .toBeVisible();
  });

  it("appends remaining donors when View More is clicked", async () => {
    const npo = await seed_npo();
    for (let i = 0; i < 25; i++) {
      const amt = 1000 - i;
      await seed_donor(npo.id, `donor${String(i).padStart(2, "0")}@x.com`, amt);
    }

    const screen = await render_page(npo.id);
    await expect
      .element(screen.getByText("donor19", { exact: true }))
      .toBeVisible();

    await screen.getByRole("button", { name: /view more/i }).click();

    // remaining 5 donors append (the regression: before the ?index fix the
    // fetcher hit the parent layout loader and nothing was appended).
    await expect
      .element(screen.getByText("donor20", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("donor24", { exact: true }))
      .toBeInTheDocument();

    // cursor exhausted → button disappears
    await expect
      .element(screen.getByRole("button", { name: /view more/i }))
      .not.toBeInTheDocument();
  });

  it("does not render View More when there is only one page", async () => {
    const npo = await seed_npo();
    for (let i = 0; i < 5; i++) {
      await seed_donor(npo.id, `donor${i}@x.com`, 100 - i);
    }

    const screen = await render_page(npo.id);
    await expect
      .element(screen.getByText("donor0", { exact: true }))
      .toBeVisible();

    await expect
      .element(screen.getByRole("button", { name: /view more/i }))
      .not.toBeInTheDocument();
  });
});
