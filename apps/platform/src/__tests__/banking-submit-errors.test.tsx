import { eq } from "drizzle-orm";
import { createRoutesStub } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { registrations } from "$/pg/schema/registration";
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

vi.mock("$/kit/queue", () => ({
  receiver: {},
  client: {},
  enqueue: vi.fn(async () => {}),
  don_dist: vi.fn(),
  verify_qstash: vi.fn(),
}));

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: true,
    user_ctx: true,
  })
);

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// the three mounts hand `BankDetails` an `onSubmit` and own no error surface of
// their own — the wiring under test is what each mount does with the result, so
// the form itself stands in as a button that fires the callback.
const bank_statement = vi.hoisted(() => ({
  url: "https://example.com/bank.pdf",
}));

vi.mock("#/components/bank-details", () => ({
  BankDetails: ({ onSubmit, is_loading }: any) => (
    <button
      type="button"
      disabled={is_loading}
      onClick={() =>
        onSubmit(
          { id: 999, currency: "usd", details: { accountNumber: "12345678" } },
          bank_statement.url
        )
      }
    >
      submit bank details
    </button>
  ),
}));

// --- imports (after mocks hoisted) ---

import { get_session } from "#/.server/auth";
import { step_loader } from "#/pages/registration/data/step-loader";
import { update_action } from "#/pages/registration/update-action";
import Banking from "#/routes/_app.register.$reg_id._steps.4/route";
import { action as bapp_action } from "#/routes/admin.$id.banking.new/api";
import AdminBanking from "#/routes/admin.$id.banking.new/route";
import Payout from "#/routes/dashboard.referrals_.payout/route";
import { resp } from "@/helpers/https";
import { reg_put } from "$/pg/queries/registration";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

const mock_get_session = vi.mocked(get_session);
const TEST_EMAIL = "test@example.com";

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await cleanup();
  await test_db.current!.db.delete(registrations);
  bank_statement.url = "https://example.com/bank.pdf";
  mock_get_session.mockReset();
  mock_get_session.mockResolvedValue({
    user: {
      id: "test-user-id",
      email: TEST_EMAIL,
      role: null,
      name: TEST_EMAIL,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "Test",
      last_name: "User",
    } as any,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- helpers ---

// the first screen collects org type + identity; contact + org details are what
// `Progress` reads to put the applicant on step 4
const STEP_4_FIELDS = {
  r_first_name: "Jane",
  r_last_name: "Doe",
  r_contact_number: "1234567890",
  o_name: "Test Org",
  r_org_role: "ceo",
  rm: "search-engines",
  o_website: "https://example.com",
  o_designation: "Charity",
} as const;

async function seed_step_4() {
  const id = await reg_put({
    r_id: TEST_EMAIL,
    o_type: "501c3",
    o_ein: "123456789",
    o_hq_country: "United States",
  });
  await test_db
    .current!.db.update(registrations)
    .set(STEP_4_FIELDS)
    .where(eq(registrations.id, id));
  return id;
}

function render_step_4(id: string) {
  const Stub = createRoutesStub([
    {
      path: "/register/:reg_id",
      HydrateFallback: () => null,
      children: [
        {
          path: "4",
          Component: Banking,
          loader: step_loader(4) as any,
          action: update_action("5") as any,
        },
        { path: "5", Component: () => <p>summary</p> },
        { path: "2", Component: () => <p>org details</p> },
      ],
    },
  ]);
  return render(<Stub initialEntries={[`/register/${id}/4`]} />);
}

// --- tests ---

describe("registration step 4: banking", () => {
  it("surfaces the failure when the update is rejected", async () => {
    // a bank statement url the action's schema rejects
    bank_statement.url = "not-a-url";
    const id = await seed_step_4();
    const screen = await render_step_4(id);

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    // a 4xx is the user's to act on, so the action's own message is shown
    await expect.element(screen.getByText(/invalid url/i)).toBeInTheDocument();

    // nothing was written
    const [row] = await test_db
      .current!.db.select()
      .from(registrations)
      .where(eq(registrations.id, id));
    expect(row.o_bank_id).toBeNull();
  }, 30_000);

  // a landed save redirects and unmounts the form, so `fetcher.data` is never
  // read on this path — this is not coverage of the failure branch. it guards
  // against a prompt raised off stale `fetcher.data` after the navigation.
  it("raises no prompt when the update lands", async () => {
    const id = await seed_step_4();
    const screen = await render_step_4(id);

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    await expect.element(screen.getByText(/summary/i)).toBeInTheDocument();
    await expect
      .element(screen.getByText(/unexpected error occurred/i))
      .not.toBeInTheDocument();

    const [row] = await test_db
      .current!.db.select()
      .from(registrations)
      .where(eq(registrations.id, id));
    expect(row.o_bank_id).toBe("999");
  }, 30_000);
});

describe("referrals payout", () => {
  it("surfaces the failure when the save is rejected", async () => {
    const Stub = createRoutesStub([
      {
        path: "/dashboard/referrals/payout",
        Component: Payout,
        HydrateFallback: () => null,
        action: () => resp.fail(400, "wise recipient not found"),
      },
      { path: "/dashboard/referrals", Component: () => <p>referrals</p> },
    ]);
    const screen = await render(
      <Stub initialEntries={["/dashboard/referrals/payout"]} />
    );

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    await expect
      .element(screen.getByText(/wise recipient not found/i))
      .toBeInTheDocument();
  }, 30_000);

  it("falls back to the generic line when the failure is ours", async () => {
    const Stub = createRoutesStub([
      {
        path: "/dashboard/referrals/payout",
        Component: Payout,
        HydrateFallback: () => null,
        // the shape the real action returns when the write fails
        action: () => resp.fail(500, "Could not save your payout account"),
      },
      { path: "/dashboard/referrals", Component: () => <p>referrals</p> },
    ]);
    const screen = await render(
      <Stub initialEntries={["/dashboard/referrals/payout"]} />
    );

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    // a 5xx is ours: the user gets the generic line and it is reported
    await expect
      .element(screen.getByText(/while saving your payout account/i))
      .toBeInTheDocument();
  }, 30_000);
});

describe("admin: new payout method", () => {
  it("surfaces the failure when the action rejects the submission", async () => {
    // a bank statement url the action's schema rejects
    bank_statement.url = "not-a-url";
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/banking/new",
        Component: AdminBanking,
        HydrateFallback: () => null,
        action: bapp_action as any,
      },
      { path: "/admin/:id/banking", Component: () => <p>banking</p> },
    ]);
    const screen = await render(
      <Stub initialEntries={["/admin/1/banking/new"]} />
    );

    await screen.getByRole("button", { name: /submit bank details/i }).click();

    await expect
      .element(screen.getByText(/received "not-a-url"/i))
      .toBeInTheDocument();
  }, 30_000);
});
