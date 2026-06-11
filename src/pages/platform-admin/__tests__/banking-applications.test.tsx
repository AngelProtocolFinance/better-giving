import { eq } from "drizzle-orm";
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
import { cleanup, render } from "vitest-browser-react";
import { get_qstash_events } from "#/setup-tests-browser";
import { banking_apps } from "$/pg/schema/banking";
import { npos } from "$/pg/schema/npo";
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

vi.mock("$/kit/queue", () => {
  const qstash_url = import.meta.env.QSTASH_URL;
  const base_url = import.meta.env.BASE_URL_OVERRIDE || "http://localhost";
  return {
    receiver: {},
    client: {},
    enqueue: vi.fn(async (...msgs: { id: string; payload: any }[]) => {
      for (const m of msgs) {
        await fetch(
          `${qstash_url}/v2/publish/${base_url}/api/q-handler/${m.id}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(m.payload),
          }
        );
      }
    }),
    don_dist: vi.fn(),
    verify_qstash: vi.fn(),
  };
});

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

vi.mock("$/kit/wise", () => ({
  wise: { v2_account: vi.fn() },
}));

vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return {
    dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
    redirectWithSuccess: vi.fn((url: string, _msg: string) => redirect(url)),
  };
});

// --- imports (after mocks hoisted) ---

import { action } from "#/pages/platform-admin/banking-applications/api";
import DetailPage from "#/routes/platform.banking-applications_.$id/route";
import ApprovePage from "#/routes/platform.banking-applications_.$id.approve/route";
import RejectPage from "#/routes/platform.banking-applications_.$id.reject/route";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

// --- setup ---

let counter = 0;

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN-TEST",
  name: "Test NPO",
  endow_designation: "Charity",
  hq_country: "United States",
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(banking_apps);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

// --- helpers ---

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

async function seed_bapp(
  npo_id: number,
  overrides: Partial<typeof banking_apps.$inferInsert> = {}
) {
  counter++;
  const id = overrides.id ?? String(1000 + counter);
  await test_db.current!.db.insert(banking_apps).values({
    id,
    npo_id,
    status: "under-review",
    bank_summary: `USD account ending in ${String(counter).padStart(4, "0")}`,
    bank_statement_url: "https://example.com/stmt.pdf",
    rejection_reason: "",
    date_created: new Date().toISOString(),
    ...overrides,
  });
  return id;
}

async function get_bapp(id: string) {
  const [row] = await test_db
    .current!.db.select()
    .from(banking_apps)
    .where(eq(banking_apps.id, id));
  return row;
}

function get_outbox_events() {
  return get_qstash_events();
}

async function render_detail(bapp_id: string, ba: any) {
  const Stub = createRoutesStub([
    {
      path: "/platform/banking-applications/:id",
      Component: DetailPage,
      HydrateFallback: () => null,
      loader: () => ({ ...WISE_FIXTURE, ba }),
    },
  ]);
  return await render(
    <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
  );
}

const WISE_FIXTURE = {
  id: 12345,
  currency: "USD",
  country: "US",
  name: { fullName: "Jane Doe" },
  type: "checking",
  legalEntityType: "PERSON" as const,
  longAccountSummary: "USD account ending in 1234",
  displayFields: [
    { key: "routingNumber", label: "Routing number", value: "021000021" },
    { key: "accountNumber", label: "Account number", value: "****1234" },
  ],
};

// --- tests ---

describe("application detail", () => {
  it("renders bank details and action buttons", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id);
    const row = await get_bapp(bapp_id);

    const loader_data = { ...WISE_FIXTURE, ba: row };

    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => loader_data,
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );

    await expect
      .element(screen.getByText("Banking Application Review"))
      .toBeVisible();

    await expect.element(screen.getByText("USD")).toBeInTheDocument();
    await expect
      .element(screen.getByText("US", { exact: true }))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Jane Doe")).toBeInTheDocument();

    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .not.toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("link", { name: /reject/i }))
      .not.toHaveAttribute("aria-disabled", "true");
  });

  it("shows approved badge when already approved", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id, { status: "approved" });
    const row = await get_bapp(bapp_id);

    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => ({ ...WISE_FIXTURE, ba: row }),
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );

    await expect.element(screen.getByText("Approved")).toBeVisible();

    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("link", { name: /reject/i }))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("shows rejected badge and rejection reason", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id, {
      status: "rejected",
      rejection_reason: "Incomplete docs",
    });
    const row = await get_bapp(bapp_id);

    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => ({ ...WISE_FIXTURE, ba: row }),
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );

    await expect.element(screen.getByText("Rejected")).toBeVisible();
    await expect
      .element(screen.getByText("Incomplete docs"))
      .toBeInTheDocument();
  });
});

describe("approve flow", () => {
  async function render_with_approve(bapp_id: string, ba: any) {
    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => ({ ...WISE_FIXTURE, ba }),
        action,
        children: [
          { path: "approve", Component: ApprovePage, action },
          {
            path: "success",
            Component: () => <div data-testid="success">OK</div>,
          },
        ],
      },
    ]);

    return await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );
  }

  it("approves bapp — status becomes approved when npo has >1 bapp", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id);
    await seed_bapp(npo.id);
    const row = await get_bapp(bapp_id);

    const screen = await render_with_approve(bapp_id, row);

    await expect
      .element(screen.getByText("Banking Application Review"))
      .toBeVisible();
    await screen.getByRole("link", { name: /approve/i }).click();
    await expect
      .element(screen.getByText(/you are about to approve/i))
      .toBeVisible();
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();
    await expect.element(screen.getByTestId("success")).toBeVisible();

    // cross-page: re-render detail page — status badge visible
    await cleanup();
    const updated = await get_bapp(bapp_id);
    const screen2 = await render_detail(bapp_id, updated);
    await expect.element(screen2.getByText("Approved")).toBeVisible();

    const events = await get_outbox_events();
    expect(events.some((e) => e.id === "banking-approved")).toBe(true);
  });

  it("auto-defaults when npo has only 1 bapp", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id);
    const row = await get_bapp(bapp_id);

    const screen = await render_with_approve(bapp_id, row);

    await expect
      .element(screen.getByText("Banking Application Review"))
      .toBeVisible();
    await screen.getByRole("link", { name: /approve/i }).click();
    await expect
      .element(screen.getByText(/you are about to approve/i))
      .toBeVisible();
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();
    await expect.element(screen.getByTestId("success")).toBeVisible();

    // "default" status not surfaced in platform-admin UI — DB check required
    const updated = await get_bapp(bapp_id);
    expect(updated.status).toBe("default");
  });

  it("approve button disabled after verdict", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id, { status: "approved" });
    const row = await get_bapp(bapp_id);

    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => ({ ...WISE_FIXTURE, ba: row }),
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );

    await expect.element(screen.getByText("Approved")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .toHaveAttribute("aria-disabled", "true");
  });
});

describe("reject flow", () => {
  async function render_with_reject(bapp_id: string, ba: any) {
    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => ({ ...WISE_FIXTURE, ba }),
        action,
        children: [
          { path: "reject", Component: RejectPage, action },
          {
            path: "success",
            Component: () => <div data-testid="success">OK</div>,
          },
        ],
      },
    ]);

    return await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );
  }

  it("rejects with reason", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id);
    const row = await get_bapp(bapp_id);

    const screen = await render_with_reject(bapp_id, row);

    await expect
      .element(screen.getByText("Banking Application Review"))
      .toBeVisible();
    await screen.getByRole("link", { name: /reject/i }).click();
    await expect
      .element(screen.getByLabelText(/reason for rejection/i))
      .toBeVisible();
    await screen
      .getByLabelText(/reason for rejection/i)
      .fill("Missing documentation");
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();
    await expect.element(screen.getByTestId("success")).toBeVisible();

    // cross-page: re-render detail page — rejected badge + reason visible
    await cleanup();
    const updated = await get_bapp(bapp_id);
    const screen2 = await render_detail(bapp_id, updated);
    await expect.element(screen2.getByText("Rejected")).toBeVisible();
    await expect
      .element(screen2.getByText("Missing documentation"))
      .toBeInTheDocument();

    const events = await get_outbox_events();
    expect(events.some((e) => e.id === "banking-rejected")).toBe(true);
  });

  it("reject without reason shows validation error", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id);
    const row = await get_bapp(bapp_id);

    const screen = await render_with_reject(bapp_id, row);

    await expect
      .element(screen.getByText("Banking Application Review"))
      .toBeVisible();
    await screen.getByRole("link", { name: /reject/i }).click();
    await expect
      .element(screen.getByLabelText(/reason for rejection/i))
      .toBeVisible();
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();
    await expect.element(screen.getByText(/required/i)).toBeVisible();
  });

  it("reject button disabled after verdict", async () => {
    const npo = await seed_npo();
    const bapp_id = await seed_bapp(npo.id, { status: "rejected" });
    const row = await get_bapp(bapp_id);

    const Stub = createRoutesStub([
      {
        path: "/platform/banking-applications/:id",
        Component: DetailPage,
        HydrateFallback: () => null,
        loader: () => ({ ...WISE_FIXTURE, ba: row }),
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/banking-applications/${bapp_id}`]} />
    );

    await expect.element(screen.getByText("Rejected")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /reject/i }))
      .toHaveAttribute("aria-disabled", "true");
  });
});

describe("action edge cases", () => {
  it("returns 404 for non-existent bapp", async () => {
    const form = new FormData();
    form.set("type", "approved");

    const result = await (action as (...args: unknown[]) => unknown)({
      params: { id: "99999" },
      request: new Request("http://test/platform/banking-applications/99999", {
        method: "POST",
        body: form,
      }),
      context: {},
    });

    expect(result).toMatchObject({
      status: 404,
      statusText: expect.stringContaining("not found"),
    });
  });
});
