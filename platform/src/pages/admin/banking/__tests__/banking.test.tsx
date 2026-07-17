import { eq } from "drizzle-orm";
import { createRoutesStub, useFetcher } from "react-router";
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

vi.mock("$/kit/wise", () => ({
  wise: { v2_account: vi.fn() },
}));

// --- imports (after mocks hoisted) ---

import { loader as list_loader } from "#/routes/admin.$id.banking._index/api";
import PayoutMethodsList from "#/routes/admin.$id.banking._index/route";
import {
  default_action,
  delete_action,
  loader as detail_loader,
} from "#/routes/admin.$id.banking.$bank_id/api";
import PayoutMethodDetail from "#/routes/admin.$id.banking.$bank_id/route";
import DeletePrompt from "#/routes/admin.$id.banking.$bank_id.delete/route";
import { action as new_banking_action } from "#/routes/admin.$id.banking.new/api";
import { admin_ctx } from "$/auth/test-utils";
import { wise } from "$/kit/wise";
import { bapp_delete } from "$/pg/queries/banking";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

// --- setup ---

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

async function seed_bapp(
  npo_id: number,
  overrides: Partial<typeof banking_apps.$inferInsert> = {}
) {
  counter++;
  const id = overrides.id ?? `wise-${counter}`;
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

// full route stub for multi-page flows (list → detail → delete)
async function render_banking_app(npo_id: number, initial_path: string) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id",
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
      children: [
        {
          path: "banking",
          children: [
            {
              index: true,
              Component: PayoutMethodsList,
              HydrateFallback: () => null,
              loader: list_loader as any,
            },
            {
              path: ":bank_id",
              Component: PayoutMethodDetail,
              HydrateFallback: () => null,
              loader: detail_loader as any,
              action: default_action as any,
              children: [
                {
                  path: "delete",
                  Component: DeletePrompt,
                  action: delete_action as any,
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  return await render(
    <Stub initialEntries={[initial_path]} future={{ v8_middleware: true }} />
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

// --- lifecycle ---

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

async function render_list(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/banking",
      Component: PayoutMethodsList,
      HydrateFallback: () => null,
      loader: list_loader as any,
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
    },
  ]);

  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/banking`]}
      future={{ v8_middleware: true }}
    />
  );
}

// --- tests ---

describe("payout methods list", () => {
  it("renders table rows for seeded bapps", async () => {
    const npo = await seed_npo();
    await seed_bapp(npo.id, {
      status: "approved",
      bank_summary: "USD account ending in 1234",
    });
    await seed_bapp(npo.id, {
      status: "under-review",
      bank_summary: "EUR account ending in 5678",
    });

    const screen = await render_list(npo.id);

    await expect
      .element(screen.getByText("USD account ending in 1234"))
      .toBeVisible();
    await expect
      .element(screen.getByText("EUR account ending in 5678"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Approved")).toBeInTheDocument();
    await expect.element(screen.getByText("Under review")).toBeInTheDocument();
  });

  it("clicks Details and navigates to detail page", async () => {
    const npo = await seed_npo();
    await seed_bapp(npo.id, {
      id: "100",
      status: "approved",
      bank_summary: "USD account ending in 1234",
    });
    vi.mocked(wise.v2_account).mockResolvedValue(WISE_FIXTURE as any);

    const screen = await render_banking_app(npo.id, `/admin/${npo.id}/banking`);

    await expect
      .element(screen.getByText("USD account ending in 1234"))
      .toBeVisible();
    await screen.getByRole("link", { name: /bank statement file/i }).click();

    // detail page loaded — wait for detail-unique text first
    await expect.element(screen.getByText("Jane Doe")).toBeVisible();
    await expect.element(screen.getByText("Approved")).toBeInTheDocument();
    await expect.element(screen.getByText("USD")).toBeInTheDocument();
  });

  it("shows empty state when no bapps", async () => {
    const npo = await seed_npo();
    const screen = await render_list(npo.id);

    await expect
      .element(screen.getByText(/no payout methods found/i))
      .toBeVisible();
  });
});

describe("new banking action", () => {
  const valid_payload = (npo_id: number) => ({
    wiseRecipientID: "999",
    endowmentID: npo_id,
    bankSummary: "USD account ending in 5678",
    bankStatementFile: {
      name: "stmt.pdf",
      publicUrl: "https://example.com/stmt.pdf",
    },
  });

  // stub component that submits json payload via fetcher (mirrors banking.tsx)
  function SubmitPage({ payload }: { payload: any }) {
    const fetcher = useFetcher();
    return (
      <>
        {fetcher.data && (
          <div data-testid="action-response">
            {typeof fetcher.data === "string"
              ? fetcher.data
              : JSON.stringify(fetcher.data)}
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            fetcher.submit(payload, {
              action: ".",
              method: "POST",
              encType: "application/json",
            })
          }
        >
          Submit
        </button>
      </>
    );
  }

  async function render_new_banking(
    npo_id: number,
    payload: Record<string, unknown>
  ) {
    const Stub = createRoutesStub([
      {
        path: "/admin/:id",
        children: [
          {
            path: "banking",
            Component: () => <div data-testid="banking-list">List</div>,
          },
          {
            path: "banking/new",
            Component: () => <SubmitPage payload={payload} />,
            action: new_banking_action as any,
          },
        ],
      },
    ]);

    return await render(
      <Stub initialEntries={[`/admin/${npo_id}/banking/new`]} />
    );
  }

  it("valid payload creates bapp and emits event", async () => {
    const npo = await seed_npo();

    const screen = await render_new_banking(npo.id, valid_payload(npo.id));

    await screen.getByRole("button", { name: /submit/i }).click();

    // redirects to banking list on success
    await expect.element(screen.getByTestId("banking-list")).toBeVisible();

    // cross-page: render real banking list — new bapp with status visible
    await cleanup();
    const list = await render_list(npo.id);
    await expect.element(list.getByText("Under review")).toBeInTheDocument();

    const events = await get_outbox_events();
    expect(events.some((e) => e.id === "banking-new")).toBe(true);
  });

  it("returns 400 for invalid payload", async () => {
    const npo = await seed_npo();

    const screen = await render_new_banking(npo.id, { endowmentID: npo.id });

    await screen.getByRole("button", { name: /submit/i }).click();

    // action returns 400 — stays on same page, no redirect
    await expect.element(screen.getByTestId("action-response")).toBeVisible();
    await expect
      .element(screen.getByTestId("banking-list"))
      .not.toBeInTheDocument();
  });

  it("rejects when npo has 10 bapps", async () => {
    const npo = await seed_npo();
    for (let i = 0; i < 10; i++) {
      await seed_bapp(npo.id);
    }

    const screen = await render_new_banking(npo.id, {
      ...valid_payload(npo.id),
      wiseRecipientID: "new-one",
    });

    await screen.getByRole("button", { name: /submit/i }).click();

    await expect.element(screen.getByTestId("action-response")).toBeVisible();
    await expect
      .element(screen.getByTestId("action-response"))
      .toHaveTextContent("Max 10");
    await expect
      .element(screen.getByTestId("banking-list"))
      .not.toBeInTheDocument();
  });
});

describe("payout method detail", () => {
  async function render_detail(ba: typeof banking_apps.$inferSelect) {
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/banking/:bank_id",
        Component: PayoutMethodDetail,
        HydrateFallback: () => null,
        loader: async () => ({ ...WISE_FIXTURE, ba }),
        children: [
          {
            path: "delete",
            Component: () => null,
          },
        ],
      },
    ]);

    return await render(
      <Stub initialEntries={[`/admin/${ba.npo_id}/banking/${ba.id}`]} />
    );
  }

  it("renders rejected badge and rejection reason", async () => {
    const npo = await seed_npo();
    const id = await seed_bapp(npo.id, {
      status: "rejected",
      rejection_reason: "Missing docs",
    });
    const row = await get_bapp(id);

    const screen = await render_detail(row!);

    await expect.element(screen.getByText("Rejected")).toBeVisible();
    await expect.element(screen.getByText("Missing docs")).toBeInTheDocument();
  });

  it("Set Default button disabled when default", async () => {
    const npo = await seed_npo();
    const id = await seed_bapp(npo.id, { status: "default" });
    const row = await get_bapp(id);

    const screen = await render_detail(row!);

    const btn = screen.getByRole("button", { name: /set default/i });
    await expect.element(btn).toBeDisabled();
  });

  it("Set Default button disabled when not approved", async () => {
    const npo = await seed_npo();
    const id = await seed_bapp(npo.id, { status: "under-review" });
    const row = await get_bapp(id);

    const screen = await render_detail(row!);

    const btn = screen.getByRole("button", { name: /set default/i });
    await expect.element(btn).toBeDisabled();
  });
});

describe("set default flow", () => {
  it("click Set Default on approved bapp changes badge to Default", async () => {
    const npo = await seed_npo();
    await seed_bapp(npo.id, { id: "100", status: "approved" });
    vi.mocked(wise.v2_account).mockResolvedValue(WISE_FIXTURE as any);

    const screen = await render_banking_app(
      npo.id,
      `/admin/${npo.id}/banking/100`
    );

    await expect.element(screen.getByText("Approved")).toBeVisible();
    await screen.getByRole("button", { name: /set default/i }).click();

    // revalidation: badge changes
    await expect
      .element(screen.getByText("Default", { exact: true }))
      .toBeVisible();
  });

  it("demotes previous default (cross-page)", async () => {
    const npo = await seed_npo();
    await seed_bapp(npo.id, {
      id: "100",
      status: "default",
      bank_summary: "USD ending 1111",
    });
    await seed_bapp(npo.id, {
      id: "200",
      status: "approved",
      bank_summary: "EUR ending 2222",
    });
    vi.mocked(wise.v2_account).mockResolvedValue(WISE_FIXTURE as any);

    // navigate to bapp 200 and promote it
    const screen = await render_banking_app(
      npo.id,
      `/admin/${npo.id}/banking/200`
    );
    await expect.element(screen.getByText("Approved")).toBeVisible();
    await screen.getByRole("button", { name: /set default/i }).click();
    await expect
      .element(screen.getByText("Default", { exact: true }))
      .toBeVisible();

    // verify on list page: 200 is Default, 100 is Approved
    await screen.unmount();
    const screen2 = await render_banking_app(
      npo.id,
      `/admin/${npo.id}/banking`
    );
    await expect.element(screen2.getByText("EUR ending 2222")).toBeVisible();
    // table status cells
    const cells = screen2.getByText(/Default|Approved/);
    const texts = cells.elements().map((c) => c.textContent);
    expect(texts).toContain("Default");
    expect(texts).toContain("Approved");
  });
});

describe("delete", () => {
  it("bapp_delete removes row", async () => {
    const npo = await seed_npo();
    const id = await seed_bapp(npo.id);

    await bapp_delete(id);

    const row = await get_bapp(id);
    expect(row).toBeUndefined();
  });

  async function render_delete_prompt(search: string) {
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/banking/:bank_id/delete",
        Component: DeletePrompt,
        HydrateFallback: () => null,
      },
    ]);

    return await render(
      <Stub initialEntries={[`/admin/1/banking/wise-1/delete${search}`]} />
    );
  }

  it("blocks when default with heir", async () => {
    const screen = await render_delete_prompt("?default=true&with_heir=true");

    await expect
      .element(
        screen.getByText(
          /set another payout method as default before deleting/i
        )
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /proceed/i }))
      .not.toBeInTheDocument();
  });

  it("allows when default without heir", async () => {
    const screen = await render_delete_prompt("?default=true");

    await expect
      .element(screen.getByText(/must have at least one banking connection/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /proceed/i }))
      .toBeInTheDocument();
  });

  it("shows simple confirmation when not default", async () => {
    const screen = await render_delete_prompt("?default=false");

    await expect.element(screen.getByText(/are you sure/i)).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /proceed/i }))
      .toBeInTheDocument();
  });

  it("detail → Delete → Proceed → redirects to list", async () => {
    const npo = await seed_npo();
    await seed_bapp(npo.id, { id: "100", status: "approved" });
    vi.mocked(wise.v2_account).mockResolvedValue(WISE_FIXTURE as any);

    const screen = await render_banking_app(
      npo.id,
      `/admin/${npo.id}/banking/100`
    );
    await expect.element(screen.getByText("Approved")).toBeVisible();

    // click Delete link → modal
    await screen.getByRole("link", { name: /delete/i }).click();
    await expect.element(screen.getByText(/are you sure/i)).toBeVisible();

    // confirm — dispatch click via JS to bypass data-base-ui-inert overlay
    const proceed_btn = screen.getByRole("button", { name: /proceed/i });
    (proceed_btn.element() as HTMLElement).click();

    // redirected to list — bapp gone
    await expect
      .element(screen.getByText(/no payout methods found/i))
      .toBeVisible();
  });

  it("detail → Delete → Cancel → stays on detail", async () => {
    const npo = await seed_npo();
    await seed_bapp(npo.id, { id: "100", status: "approved" });
    vi.mocked(wise.v2_account).mockResolvedValue(WISE_FIXTURE as any);

    const screen = await render_banking_app(
      npo.id,
      `/admin/${npo.id}/banking/100`
    );
    await expect.element(screen.getByText("Approved")).toBeVisible();

    // click Delete link → modal
    await screen.getByRole("link", { name: /delete/i }).click();
    await expect.element(screen.getByText(/are you sure/i)).toBeVisible();

    // cancel — dispatch click via JS to bypass data-base-ui-inert overlay
    (
      screen.getByRole("link", { name: /cancel/i }).element() as HTMLElement
    ).click();

    // still on detail
    await expect.element(screen.getByText("Approved")).toBeVisible();
    await expect.element(screen.getByText("Jane Doe")).toBeInTheDocument();
  });
});
