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
import { clear_qstash_events, get_qstash_events } from "#/setup-tests-browser";
import { user } from "$/pg/schema/auth";
import { banking_apps } from "$/pg/schema/banking";
import { npos } from "$/pg/schema/npo";
import { registrations } from "$/pg/schema/registration";
import { user_npo_memberships } from "$/pg/schema/user";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- test db (assigned in beforeAll, accessed via getter in mock) ---
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

vi.mock("$/kit/wise", () => ({
  wise: {
    v2_account: vi.fn(async () => ({
      id: 123,
      longAccountSummary: "Test Bank ***1234",
      name: { fullName: "Test Org" },
      currency: "USD",
      country: "US",
      type: "aba",
      legalEntityType: "BUSINESS" as const,
      displayFields: [
        { key: "accountNumber", label: "Account", value: "***1234" },
      ],
    })),
  },
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({ session: true })
);

vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((_data: unknown, msg: string) => ({ toast: msg })),
}));

import type { LoaderFunction } from "react-router";
import { get_session } from "#/.server/auth";
import { step_loader } from "#/pages/registration/data/step-loader";
// registration page imports for cross-page verification
import Dashboard from "#/routes/_app.register.$reg_id._steps.6/route";
import { submit_action } from "#/routes/_app.register.$reg_id._steps.6/submit-action";
import RegSuccess from "#/routes/_app.register.success/route";
import type { V2RecipientAccount } from "#/types/bank-details";
import { reg_get, reg_put } from "$/pg/queries/registration";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import Page from "../routes/platform.applications_.$id/route";
import Prompt, {
  action,
} from "../routes/platform.applications_.$id.$verdict/route";

const mock_get_session = vi.mocked(get_session);
const TEST_EMAIL = "admin@example.com";

function set_authed(email = TEST_EMAIL) {
  mock_get_session.mockResolvedValue({
    user: {
      id: "test-user-id",
      email,
      role: null,
      name: email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "Jane",
      last_name: "Doe",
    } as any,
  });
}

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await cleanup();
  await test_db.current!.db.delete(user_npo_memberships);
  await test_db.current!.db.delete(banking_apps);
  await test_db.current!.db.delete(registrations);
  await test_db.current!.db.delete(npos);
  await test_db.current!.db.delete(user);
  mock_get_session.mockReset();
});

// --- helpers ---

async function seed_user(email = TEST_EMAIL) {
  await test_db
    .current!.db.insert(user)
    .values({
      id: "test-user-id",
      name: "Jane Doe",
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "Jane",
      last_name: "Doe",
    })
    .onConflictDoNothing();
}

async function seed_reg(
  overrides: Partial<typeof registrations.$inferInsert> = {}
) {
  const id = await reg_put({ r_id: TEST_EMAIL });
  if (Object.keys(overrides).length) {
    await test_db
      .current!.db.update(registrations)
      .set(overrides)
      .where(eq(registrations.id, id));
  }
  return id;
}

const CONTACT_FIELDS = {
  r_first_name: "Jane",
  r_last_name: "Doe",
  r_contact_number: "1234567890",
  o_name: "Test Org",
  r_org_role: "ceo",
  rm: "search-engines",
};

const ORG_FIELDS = {
  o_website: "https://example.com",
  o_hq_country: "United States",
  o_designation: "Charity",
};

const EIN_FIELDS: Partial<typeof registrations.$inferInsert> = {
  o_type: "501c3",
  o_ein: "123456789",
};

const BANKING_FIELDS = {
  o_bank_id: "wise-recipient-123",
  o_bank_statement: "https://example.com/bank.pdf",
};

const ALL_FIELDS = {
  ...CONTACT_FIELDS,
  ...ORG_FIELDS,
  ...EIN_FIELDS,
  ...BANKING_FIELDS,
  status: "02" as const,
};

// --- route stubs ---

const MOCK_WACC: V2RecipientAccount = {
  id: 123,
  longAccountSummary: "Test Bank ***1234",
  name: { fullName: "Test Org" },
  currency: "USD",
  country: "US",
  type: "aba",
  legalEntityType: "BUSINESS",
  displayFields: [{ key: "accountNumber", label: "Account", value: "***1234" }],
};

const test_loader: LoaderFunction = async ({ params }) => {
  const reg = await reg_get(params.id!);
  if (!reg) throw new Response("Not found", { status: 404 });
  return { reg, wacc: MOCK_WACC };
};

async function render_review(id: string) {
  const Stub = createRoutesStub([
    {
      path: "/platform/applications/:id",
      Component: Page,
      HydrateFallback: () => null,
      loader: test_loader,
      children: [
        { path: ":verdict", Component: Prompt, action: action as any },
        {
          path: "success",
          Component: () => <p>Review submitted</p>,
        },
      ],
    },
  ]);
  return await render(
    <Stub initialEntries={[`/platform/applications/${id}`]} />
  );
}

async function render_registration(id: string) {
  set_authed();
  const Stub = createRoutesStub([
    {
      path: "/register",
      HydrateFallback: () => null,
      children: [
        {
          path: ":reg_id",
          children: [
            {
              path: "6",
              Component: Dashboard,
              loader: step_loader(6) as any,
              action: submit_action as any,
            },
          ],
        },
        {
          path: "success",
          Component: RegSuccess,
        },
      ],
    },
  ]);
  return await render(<Stub initialEntries={[`/register/${id}/6`]} />);
}

// --- tests ---

describe("rejection", () => {
  it("shows rejected badge + success after admin rejects", async () => {
    const id = await seed_reg(ALL_FIELDS);
    let screen = await render_review(id);

    // application details render
    await expect.element(screen.getByText("Test Org")).toBeInTheDocument();
    await expect.element(screen.getByText("123456789")).toBeInTheDocument();

    // click Reject → modal
    await screen.getByRole("link", { name: /reject/i }).click();
    await expect
      .element(screen.getByText(/changing application status/i))
      .toBeInTheDocument();

    // fill reason + submit
    await screen
      .getByLabelText(/reason for rejection/i)
      .fill("docs incomplete");
    // base-ui inert overlay intercepts pointer events on the dialog;
    // use native DOM click to bypass
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // success page renders, parent revalidates with rejected state
    await expect
      .element(screen.getByText(/review submitted/i))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Rejected")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("link", { name: /reject/i }))
      .toHaveAttribute("aria-disabled", "true");

    // qstash events
    const events = get_qstash_events();
    expect(events.some((e: any) => e.id === "reg-updated")).toBe(true);

    // --- registrant side: sees rejection + can resubmit ---
    await cleanup();
    clear_qstash_events();
    screen = await render_registration(id);

    // dashboard shows rejected message
    await expect
      .element(screen.getByText(/application has been rejected/i))
      .toBeInTheDocument();

    // resubmit
    await screen.getByRole("button", { name: /resubmit/i }).click();

    // now shows "submitted for review"
    await expect
      .element(screen.getByText(/submitted for review/i))
      .toBeInTheDocument();
  });
});

describe("approval", () => {
  it("shows approved badge + success after admin approves", async () => {
    await seed_user();
    const id = await seed_reg(ALL_FIELDS);
    let screen = await render_review(id);

    await expect.element(screen.getByText("Test Org")).toBeInTheDocument();

    // click Approve → modal with payout warning
    await screen.getByRole("link", { name: /approve/i }).click();
    await expect
      .element(screen.getByText(/immediately payout all pending funds/i))
      .toBeInTheDocument();

    // submit — base-ui inert overlay intercepts pointer events;
    // use native DOM click to bypass
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    // success page renders, parent revalidates with approved state
    await expect
      .element(screen.getByText(/review submitted/i))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Approved")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("link", { name: /reject/i }))
      .toHaveAttribute("aria-disabled", "true");

    // qstash events
    const events = get_qstash_events();
    expect(events.some((e: any) => e.id === "banking-new")).toBe(true);
    expect(events.some((e) => e.id === "reg-updated")).toBe(true);

    // --- registrant side: sees account created ---
    await cleanup();
    screen = await render_registration(id);

    // step_loader(6) redirects approved registration to success page
    await expect
      .element(screen.getByText(/Test Org.*account has been created/i))
      .toBeInTheDocument();
    // links to the new NPO's admin profile
    await expect
      .element(screen.getByRole("link", { name: /start filling out/i }))
      .toHaveAttribute("href", expect.stringContaining("/admin/"));
  });
});

describe("already decided", () => {
  it("shows approved badge + disabled buttons", async () => {
    await seed_user();
    const id = await seed_reg({ ...ALL_FIELDS, status: "03" });
    const screen = await render_review(id);

    await expect.element(screen.getByText("Approved")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("link", { name: /reject/i }))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("shows rejected badge + reason + disabled buttons", async () => {
    const id = await seed_reg({
      ...ALL_FIELDS,
      status: "04",
      status_rejected_reason: "missing docs",
    });
    const screen = await render_review(id);

    await expect.element(screen.getByText("Rejected")).toBeInTheDocument();
    await expect.element(screen.getByText("missing docs")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: /approve/i }))
      .toHaveAttribute("aria-disabled", "true");
  });
});
