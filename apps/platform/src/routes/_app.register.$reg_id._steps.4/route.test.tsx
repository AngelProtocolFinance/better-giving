import { AskHost } from "@better-giving/ui";
import { eq } from "drizzle-orm";
import { createRoutesStub, Outlet } from "react-router";
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

// stripe's live answer for a linked account
const account_status_live = vi.hoisted(() => vi.fn());
vi.mock("$/stripe-connect/sync", () => ({ account_status_live }));

const routing = vi.hoisted(() => ({ on: true }));
vi.mock("$/env", async (importOriginal) => {
  const env = await importOriginal<typeof import("$/env")>();
  return {
    ...env,
    stripe: {
      ...env.stripe,
      get connect_routing() {
        return routing.on;
      },
    },
  };
});

// the step hands `BankDetails` an `onSubmit` and owns no error surface of its
// own — the wiring under test is what the step does with the result, so the
// form itself stands in as a button that fires the callback.
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
import { update_action } from "#/pages/registration/update-action";
import { reg_put } from "$/pg/queries/registration";
import { create_test_db } from "$/pg/test-utils/pglite";
import Banking, { loader } from "./route";

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
  account_status_live.mockReset();
  routing.on = true;
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

function render_step_4(id: string, search = "") {
  const Stub = createRoutesStub([
    {
      path: "/register/:reg_id",
      // the step's failure prompt is raised through `ask`, which mounts at
      // `AskHost`. it goes on the layout rather than around the step, whose
      // component takes `loaderData` as a prop.
      Component: () => (
        <>
          <Outlet />
          <AskHost />
        </>
      ),
      HydrateFallback: () => null,
      children: [
        {
          path: "4",
          Component: Banking,
          loader: loader as any,
          action: update_action("5") as any,
        },
        { path: "5", Component: () => <p>summary</p> },
        { path: "2", Component: () => <p>org details</p> },
      ],
    },
  ]);
  return render(<Stub initialEntries={[`/register/${id}/4${search}`]} />);
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

  it("offers stripe beside the bank form, without requiring it", async () => {
    const id = await seed_step_4();
    const screen = await render_step_4(id);

    const card = screen.getByRole("region", { name: "Stripe account" });
    await expect
      .element(card.getByText("Not connected", { exact: true }))
      .toBeVisible();
    await expect
      .element(card.getByRole("link", { name: "Connect with Stripe" }))
      .toHaveAttribute(
        "href",
        `/api/stripe-connect/start?kind=reg&reg_id=${id}`
      );

    // bank details alone still complete the step
    await screen.getByRole("button", { name: /submit bank details/i }).click();
    await expect.element(screen.getByText(/summary/i)).toBeVisible();
  }, 30_000);

  it("shows how the connect attempt ended on the way back from stripe", async () => {
    const id = await seed_step_4();
    const screen = await render_step_4(id, "?stripe_connect=connected");

    await expect
      .element(screen.getByText("Your Stripe account is connected."))
      .toBeVisible();
  }, 30_000);

  it("shows no notice for a result the callback never sends", async () => {
    const id = await seed_step_4();
    const screen = await render_step_4(
      id,
      "?stripe_connect=error&stripe_connect_reason=made_up"
    );

    const card = screen.getByRole("region", { name: "Stripe account" });
    await expect
      .element(card.getByText("Not connected", { exact: true }))
      .toBeVisible();
    expect(card.element().querySelector("[tabindex='-1']")).toBeNull();
  }, 30_000);

  describe("once the notice has shown", () => {
    const page_url = location.href;
    afterEach(() => history.replaceState(history.state, "", page_url));

    it("leaves the address bar, and the rest of the url stays", async () => {
      const returned = new URL(page_url);
      returned.searchParams.set("keep", "1");
      returned.searchParams.set("stripe_connect", "error");
      returned.searchParams.set("stripe_connect_reason", "expired");
      history.replaceState(history.state, "", returned);
      const id = await seed_step_4();
      const screen = await render_step_4(
        id,
        "?stripe_connect=error&stripe_connect_reason=expired"
      );

      const notice = screen.getByText("The link to Stripe timed out.");
      await expect.element(notice).toBeVisible();
      await vi.waitFor(() => {
        const q = new URL(location.href).searchParams;
        expect([...q.keys()]).not.toContain("stripe_connect");
        expect([...q.keys()]).not.toContain("stripe_connect_reason");
        expect(q.get("keep")).toBe("1");
      });
      // the router never navigated, so the band stays for the reader
      await expect.element(notice).toBeVisible();
    }, 30_000);
  });

  it("reads a linked account's status from stripe, beside saved bank details", async () => {
    account_status_live.mockResolvedValue("pending");
    const id = await seed_step_4();
    await test_db
      .current!.db.update(registrations)
      .set({
        o_bank_id: "999",
        o_bank_statement: "https://example.com/bank.pdf",
        o_stripe_account_id: "acct_123",
      })
      .where(eq(registrations.id, id));
    const screen = await render_step_4(id);

    const card = screen.getByRole("region", { name: "Stripe account" });
    await expect
      .element(card.getByText("Pending review", { exact: true }))
      .toBeVisible();
    expect(account_status_live).toHaveBeenCalledWith("acct_123");
    await expect
      .element(screen.getByRole("link", { name: "Continue" }))
      .toBeVisible();
  }, 30_000);

  describe("while routing is off", () => {
    beforeEach(() => {
      routing.on = false;
    });

    it("hides stripe beside the bank form, including a return notice", async () => {
      const id = await seed_step_4();
      const screen = await render_step_4(id, "?stripe_connect=connected");

      await expect
        .element(screen.getByRole("button", { name: /submit bank details/i }))
        .toBeVisible();
      expect(
        screen.getByRole("region", { name: "Stripe account" }).query()
      ).toBeNull();
      expect(
        screen.getByText("Not connected", { exact: true }).query()
      ).toBeNull();
      expect(
        screen.getByRole("link", { name: "Connect with Stripe" }).query()
      ).toBeNull();
      expect(
        screen.getByRole("link", { name: "Stripe dashboard" }).query()
      ).toBeNull();
      expect(
        screen.getByText("Your Stripe account is connected.").query()
      ).toBeNull();

      await screen
        .getByRole("button", { name: /submit bank details/i })
        .click();
      await expect.element(screen.getByText(/summary/i)).toBeVisible();
    }, 30_000);

    it("hides stripe beside saved bank details and does not ask stripe", async () => {
      account_status_live.mockResolvedValue("pending");
      const id = await seed_step_4();
      await test_db
        .current!.db.update(registrations)
        .set({
          o_bank_id: "999",
          o_bank_statement: "https://example.com/bank.pdf",
          o_stripe_account_id: "acct_123",
        })
        .where(eq(registrations.id, id));
      const screen = await render_step_4(id, "?stripe_connect=connected");

      await expect
        .element(screen.getByRole("link", { name: "Continue" }))
        .toBeVisible();
      expect(
        screen.getByRole("region", { name: "Stripe account" }).query()
      ).toBeNull();
      expect(
        screen.getByText("Pending review", { exact: true }).query()
      ).toBeNull();
      expect(
        screen.getByText("Your Stripe account is connected.").query()
      ).toBeNull();
      expect(account_status_live).not.toHaveBeenCalled();
    }, 30_000);
  });
});
