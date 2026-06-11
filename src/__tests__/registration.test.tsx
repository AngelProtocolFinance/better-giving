import { eq } from "drizzle-orm";
import type { LoaderFunctionArgs } from "react-router";
import { createRoutesStub, redirect } from "react-router";
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
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { clear_qstash_events, get_qstash_events } from "#/setup-tests-browser";
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
  (await import("$/auth/test-utils")).make_auth_mock({ session: true })
);

vi.mock("#/.server/cookie", () => ({
  reg_cookie: {
    parse: vi.fn(async () => ({})),
    serialize: vi.fn(async () => "bg-registration=x"),
  },
}));

vi.mock("#/components/bank-details/recipient-details/use-requirements", () => ({
  use_requirements: (args: { amount: number; currency: string } | null) => ({
    req: {
      data: args
        ? {
            requirements: [
              {
                type: "iban",
                title: "IBAN",
                usageInfo: null,
                fields: [
                  {
                    name: "Account holder",
                    group: [
                      {
                        key: "accountHolderName",
                        name: "Full name of the account holder",
                        type: "text",
                        refreshRequirementsOnChange: false,
                        required: true,
                        displayFormat: null,
                        example: "Jane Doe",
                        minLength: 1,
                        maxLength: 100,
                        validationRegexp: null,
                        validationAsync: null,
                        valuesAllowed: null,
                      },
                    ],
                  },
                  {
                    name: "IBAN",
                    group: [
                      {
                        key: "details.IBAN",
                        name: "IBAN",
                        type: "text",
                        refreshRequirementsOnChange: false,
                        required: true,
                        displayFormat: null,
                        example: "DE89370400440532013000",
                        minLength: 2,
                        maxLength: 34,
                        validationRegexp: null,
                        validationAsync: null,
                        valuesAllowed: null,
                      },
                    ],
                  },
                ],
              },
            ],
            quoteId: "test-quote-1",
          }
        : undefined,
      isLoading: false,
    },
    update_requirements: vi.fn(),
  }),
}));

vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((_data: unknown, msg: string) => ({ toast: msg })),
}));

vi.mock("#/components/bank-details/use-currencies", () => ({
  use_currencies: () => ({
    data: [
      { code: "USD", name: "United States Dollar", rate: null },
      { code: "EUR", name: "Euro", rate: null },
    ],
    is_loading: false,
    is_fetching: false,
    is_error: false,
    error: undefined,
  }),
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// mock anvil signing — return a route the stub can handle
vi.mock("#/.server/registration/gen-fsa-signing-url", () => ({
  gen_fsa_signing_url: vi.fn(
    async (reg_id: string) => `/register/${reg_id}/sign-result`
  ),
}));

// mock helpers that import anvil SDK (SST secrets not available in test)
vi.mock("#/.server/registration/helpers", () => ({
  reg_id_from_signer_eid: vi.fn(),
  is_claimed: vi.fn(),
}));

// mock FileDropzone — replace drag-drop with a simple text input
vi.mock("#/components/file-dropzone", async () => {
  const actual = await vi.importActual<
    typeof import("#/components/file-dropzone")
  >("#/components/file-dropzone");
  return {
    ...actual,
    FileDropzone: ({ onChange, value, label, error, className, ref }: any) => (
      <div className={className} ref={ref} data-testid="file-dropzone">
        {label}
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e: any) => onChange(e.target.value)}
        />
        {error && <span className="field-err">{error}</span>}
      </div>
    ),
  };
});

// --- imports (after mocks hoisted) ---

import { get_session } from "#/.server/auth";
import { action as fsa_action_handler } from "#/pages/registration/data/fsa-action";
import { step_loader } from "#/pages/registration/data/step-loader";
import { update_action } from "#/pages/registration/update-action";
import { reg_put } from "$/pg/queries/registration";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import ContactDetails from "../routes/_app.register.$reg_id._steps.1/route";
import OrgDetails from "../routes/_app.register.$reg_id._steps.2/route";
import FsaInquiry from "../routes/_app.register.$reg_id._steps.3/route";
import Documentation from "../routes/_app.register.$reg_id._steps.4/route";
import Banking from "../routes/_app.register.$reg_id._steps.5/route";
import Dashboard from "../routes/_app.register.$reg_id._steps.6/route";
import { submit_action } from "../routes/_app.register.$reg_id._steps.6/submit-action";

const mock_get_session = vi.mocked(get_session);
const TEST_EMAIL = "test@example.com";

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

const original_fetch = globalThis.fetch;
beforeEach(async () => {
  await test_db.current!.db.delete(registrations);
  mock_get_session.mockReset();
  // mswWorker.use() runtime overrides don't work in browser mode — spy on fetch instead
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.includes("/api/wise/v1/accounts"))
      return Response.json({ id: 999, currency: "EUR", details: {} });
    if (url.includes("/api/file-upload"))
      return Response.json({
        url: "https://example.com/bank-statement.pdf",
        presigned_url: "https://s3.example.com/put",
        content_type: "application/pdf",
      });
    if (url.includes("s3.example.com"))
      return new Response(null, { status: 200 });
    if (url.includes("/api/npos/ein/"))
      return new Response(null, { status: 404 });
    return original_fetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- helpers ---

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
      first_name: "Test",
      last_name: "User",
    } as any,
  });
}

async function create_reg(): Promise<string> {
  return reg_put({ r_id: TEST_EMAIL });
}

async function get_reg(id: string) {
  const [row] = await test_db
    .current!.db.select()
    .from(registrations)
    .where(eq(registrations.id, id));
  return row;
}

function get_outbox_events() {
  return get_qstash_events();
}

async function seed_reg(
  overrides: Partial<typeof registrations.$inferInsert> = {}
) {
  const id = await create_reg();
  if (Object.keys(overrides).length) {
    await test_db
      .current!.db.update(registrations)
      .set(overrides)
      .where(eq(registrations.id, id));
  }
  const reg = await get_reg(id);
  return { id, reg };
}

// minimal valid field sets per step
const CONTACT_FIELDS = {
  r_first_name: "Jane",
  r_last_name: "Doe",
  r_contact_number: "1234567890",
  o_name: "Test Org",
  r_org_role: "ceo",
  rm: "search-engines",
} as const;

const ORG_FIELDS_US = {
  o_website: "https://example.com",
  o_hq_country: "United States",
  o_designation: "Charity",
} as const;

const EIN_FIELDS: Partial<typeof registrations.$inferInsert> = {
  o_type: "501c3",
  o_ein: "123456789",
};

const BANKING_FIELDS = {
  o_bank_id: "wise-recipient-123",
  o_bank_statement: "https://example.com/bank.pdf",
} as const;

// --- sign-result loader (simulates anvil webhook) ---

async function sign_result_loader({ params }: LoaderFunctionArgs) {
  const rid = params.reg_id!;
  await test_db
    .current!.db.update(registrations)
    .set({ o_fsa_signed_doc_url: "https://example.com/signed-fsa.pdf" })
    .where(eq(registrations.id, rid));
  return redirect(`/register/${rid}/5`);
}

// --- route tree ---

function render_registration(id: string, initial_step = "1") {
  set_authed();

  const Stub = createRoutesStub([
    {
      path: "/register/:reg_id",
      HydrateFallback: () => null,
      children: [
        {
          path: "1",
          Component: ContactDetails,
          loader: step_loader(1),
          action: update_action("2"),
        },
        {
          path: "2",
          Component: OrgDetails,
          loader: step_loader(2),
          action: update_action("3"),
        },
        {
          path: "3",
          Component: FsaInquiry,
          loader: step_loader(3),
          action: update_action("4"),
        },
        {
          path: "4",
          Component: Documentation,
          loader: step_loader(4),
          action: update_action("5"),
          children: [
            {
              path: "fsa",
              action: fsa_action_handler,
            },
          ],
        },
        {
          path: "5",
          Component: Banking,
          loader: step_loader(5),
          action: update_action("6"),
        },
        {
          path: "6",
          Component: Dashboard,
          loader: step_loader(6),
          action: submit_action,
        },
        {
          path: "sign-result",
          loader: sign_result_loader,
          Component: () => null,
        },
      ],
    },
  ]);

  return render(<Stub initialEntries={[`/register/${id}/${initial_step}`]} />);
}

// --- E2E tests ---

describe("E2E: US path (501c3)", () => {
  it("threads contact → org → fsa-inquiry → EIN → banking → dashboard → submit", async () => {
    const id = await create_reg();
    clear_qstash_events();
    const screen = await render_registration(id);

    // --- step 1: contact details ---
    await expect.element(screen.getByLabelText(/first name/i)).toBeVisible();

    await screen.getByLabelText(/first name/i).fill("Jane");
    await screen.getByLabelText(/last name/i).fill("Doe");
    await screen.getByLabelText(/phone number/i).fill("1234567890");
    await screen.getByLabelText(/organization name/i).fill("Test Org");

    // select role
    await screen.getByText(/what's your role/i).click();
    await expect.element(screen.getByText("CEO")).toBeVisible();
    await screen.getByText("CEO").click();

    // select referral method
    await screen.getByText(/how did you find/i).click();
    await expect.element(screen.getByText("Search engines")).toBeVisible();
    await screen.getByText("Search engines").click();

    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 2: org details ---
    await expect.element(screen.getByLabelText(/website/i)).toBeVisible();

    await screen.getByLabelText(/website/i).fill("example.com");

    // select country
    await expect
      .element(screen.getByPlaceholder("Select a country"))
      .toBeVisible();
    await screen.getByPlaceholder("Select a country").fill("United States");
    await expect
      .element(screen.getByRole("option", { name: /United States/i }).nth(0))
      .toBeVisible();
    await screen
      .getByRole("option", { name: /United States/i })
      .nth(0)
      .click();

    // select designation
    await screen.getByText(/designation/i).click();
    await expect.element(screen.getByText("Charity")).toBeVisible();
    await screen.getByText("Charity").click();

    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 3: fsa inquiry (US → 501c3) ---
    await expect.element(screen.getByText(/501\(c\)\(3\)/i)).toBeVisible();

    // default is "no" for fresh reg, select "yes"
    await screen.getByLabelText("Yes").click();
    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 4: documentation (EIN) ---
    await expect.element(screen.getByLabelText(/ein/i)).toBeVisible();

    await screen.getByLabelText(/ein/i).fill("123456789");
    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 5: banking ---
    await expect
      .element(screen.getByText(/bank account currency/i))
      .toBeVisible();

    // currency defaults to USD, change to EUR
    const currency_input = screen.getByRole("combobox", {
      name: /currency/i,
    });
    await vi.waitFor(() => {
      expect(currency_input.element()).not.toBeDisabled();
    });
    await currency_input.clear();
    await currency_input.fill("EUR");
    await expect
      .element(screen.getByRole("option", { name: /EUR/i }))
      .toBeVisible();
    await screen.getByRole("option", { name: /EUR/i }).click();

    // wait for requirements to load (dynamic fields lack for/id, use placeholders)
    await expect.element(screen.getByPlaceholder("Jane Doe")).toBeVisible();

    await screen.getByPlaceholder("Jane Doe").fill("Jane Doe");
    await screen
      .getByPlaceholder("DE89370400440532013000")
      .fill("DE89370400440532013000");

    // upload bank statement via mocked FileDropzone
    const dropzones = screen.getByTestId("file-dropzone");
    const bank_stmt_dropzone =
      dropzones.elements()[dropzones.elements().length - 1];
    const bank_stmt_input = page
      .elementLocator(bank_stmt_dropzone)
      .getByRole("textbox");
    await bank_stmt_input.fill("https://example.com/bank.pdf");

    await screen.getByRole("button", { name: /submit/i }).click();

    // --- step 6: dashboard ---
    await expect.element(screen.getByText(/summary/i)).toBeVisible();

    // verify all fields written to DB
    const row = await get_reg(id);
    expect(row.r_first_name).toBe("Jane");
    expect(row.r_last_name).toBe("Doe");
    expect(row.o_name).toBe("Test Org");
    expect(row.o_hq_country).toBe("United States");
    expect(row.o_type).toBe("501c3");
    expect(row.o_ein).toBe("123456789");
    expect(row.o_bank_id).toBe("999");
    expect(row.o_bank_statement).toBe("https://example.com/bank.pdf");
    expect(row.status).toBe("01");

    // submit application
    await screen.getByRole("button", { name: /continue/i }).click();

    await vi.waitFor(async () => {
      const r = await get_reg(id);
      expect(r.status).toBe("02");
    });

    // dashboard shows in-review state
    await expect
      .element(screen.getByText(/submitted for review/i))
      .toBeInTheDocument();

    // outbox event
    const events = await get_outbox_events();
    expect(events.some((e) => e.id === "reg-updated")).toBe(true);
  }, 60_000);
});

describe("E2E: non-US path (FSA)", () => {
  it("threads contact → org → fsa-inquiry → FSA docs → sign → banking → dashboard → submit", async () => {
    const id = await create_reg();
    clear_qstash_events();
    const screen = await render_registration(id);

    // --- step 1: contact details ---
    await expect.element(screen.getByLabelText(/first name/i)).toBeVisible();

    await screen.getByLabelText(/first name/i).fill("Alice");
    await screen.getByLabelText(/last name/i).fill("Smith");
    await screen.getByLabelText(/phone number/i).fill("9876543210");
    await screen.getByLabelText(/organization name/i).fill("Global Aid");

    await screen.getByText(/what's your role/i).click();
    await expect.element(screen.getByText("CEO")).toBeVisible();
    await screen.getByText("CEO").click();

    await screen.getByText(/how did you find/i).click();
    await expect.element(screen.getByText("Search engines")).toBeVisible();
    await screen.getByText("Search engines").click();

    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 2: org details (non-US) ---
    await expect.element(screen.getByLabelText(/website/i)).toBeVisible();

    await screen.getByLabelText(/website/i).fill("globalaid.org");

    await expect
      .element(screen.getByPlaceholder("Select a country"))
      .toBeVisible();
    await screen.getByPlaceholder("Select a country").fill("Canada");
    await expect
      .element(screen.getByRole("option", { name: /Canada/i }).nth(0))
      .toBeVisible();
    await screen
      .getByRole("option", { name: /Canada/i })
      .nth(0)
      .click();

    await screen.getByText(/designation/i).click();
    await expect.element(screen.getByText("Charity")).toBeVisible();
    await screen.getByText("Charity").click();

    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 3: fsa inquiry (non-US → NotTaxExempt) ---
    await expect
      .element(screen.getByText(/can now take advantage/i))
      .toBeVisible();

    // NotTaxExempt just has a Continue button
    await screen.getByRole("button", { name: /continue/i }).click();

    // --- step 4: documentation (FSA form) ---
    await expect
      .element(screen.getByLabelText(/registration number/i))
      .toBeVisible();

    await screen.getByLabelText(/registration number/i).fill("abc123xyz");
    await screen.getByLabelText(/legal entity/i).fill("Nonprofit Corporation");
    await screen
      .getByLabelText(/charitable activities/i)
      .fill("Providing humanitarian aid globally");

    // fill file dropzones (proof of identity + proof of registration)
    const dropzones = screen.getByTestId("file-dropzone");
    const poi_dropzone = dropzones.elements()[0];
    const poi_input = page.elementLocator(poi_dropzone).getByRole("textbox");
    await poi_input.fill("https://example.com/passport.pdf");
    const por_dropzone = dropzones.elements()[1];
    const por_input = page.elementLocator(por_dropzone).getByRole("textbox");
    await por_input.fill("https://example.com/registration.pdf");

    // click Sign — triggers fsa-action
    await screen.getByRole("button", { name: /sign/i }).click();

    // fsa-action writes docs to DB, redirects to sign-result
    // sign-result loader seeds o_fsa_signed_doc_url, redirects to step 5

    // --- step 5: banking ---
    await expect
      .element(screen.getByText(/bank account currency/i))
      .toBeVisible();

    // assert o_registration_number written to DB
    const mid_row = await get_reg(id);
    expect(mid_row.o_registration_number).toBe("abc123xyz");
    expect(mid_row.o_fsa_signed_doc_url).toBe(
      "https://example.com/signed-fsa.pdf"
    );

    // select currency EUR
    const currency_input = screen.getByRole("combobox", {
      name: /currency/i,
    });
    // wait for combobox to be enabled (currencies load async)
    await vi.waitFor(() => {
      expect(currency_input.element()).not.toBeDisabled();
    });
    await currency_input.clear();
    await currency_input.fill("EUR");
    await expect
      .element(screen.getByRole("option", { name: /EUR/i }))
      .toBeVisible();
    await screen.getByRole("option", { name: /EUR/i }).click();

    // wait for requirements
    await expect.element(screen.getByPlaceholder("Jane Doe")).toBeVisible();

    await screen.getByPlaceholder("Jane Doe").fill("Alice Smith");
    await screen
      .getByPlaceholder("DE89370400440532013000")
      .fill("DE89370400440532013000");

    // bank statement upload
    const bank_dropzones = screen.getByTestId("file-dropzone");
    const bank_stmt_dropzone =
      bank_dropzones.elements()[bank_dropzones.elements().length - 1];
    const bank_stmt_input = page
      .elementLocator(bank_stmt_dropzone)
      .getByRole("textbox");
    await bank_stmt_input.fill("https://example.com/bank.pdf");

    await screen.getByRole("button", { name: /submit/i }).click();

    // --- step 6: dashboard ---
    await expect.element(screen.getByText(/summary/i)).toBeVisible();

    const row = await get_reg(id);
    expect(row.r_first_name).toBe("Alice");
    expect(row.o_hq_country).toBe("Canada");
    expect(row.o_type).toBe("other");
    expect(row.o_registration_number).toBe("abc123xyz");
    expect(row.o_bank_id).toBe("999");
    expect(row.status).toBe("01");

    // submit
    await screen.getByRole("button", { name: /continue/i }).click();

    await vi.waitFor(async () => {
      const r = await get_reg(id);
      expect(r.status).toBe("02");
    });

    await expect
      .element(screen.getByText(/submitted for review/i))
      .toBeInTheDocument();
  }, 60_000);
});

describe("E2E: back navigation", () => {
  it("navigates back through steps with pre-filled values", async () => {
    const { id } = await seed_reg({
      ...CONTACT_FIELDS,
      ...ORG_FIELDS_US,
    });
    const screen = await render_registration(id, "3");

    // step 3 renders (fsa inquiry)
    await expect.element(screen.getByText(/501\(c\)\(3\)/i)).toBeVisible();

    // click Back → step 2
    await screen.getByRole("link", { name: /back/i }).click();

    // step 2: org details pre-filled
    await expect.element(screen.getByLabelText(/website/i)).toBeVisible();
    // input strips "https://" prefix
    await expect
      .element(screen.getByLabelText(/website/i))
      .toHaveDisplayValue("example.com");

    // click Back → step 1
    await screen.getByRole("link", { name: /back/i }).click();

    // step 1: contact details pre-filled
    await expect.element(screen.getByLabelText(/first name/i)).toBeVisible();
    await expect
      .element(screen.getByLabelText(/first name/i))
      .toHaveDisplayValue("Jane");
    await expect
      .element(screen.getByLabelText(/last name/i))
      .toHaveDisplayValue("Doe");
  }, 30_000);
});

describe("E2E: dashboard update", () => {
  it("clicking Update navigates to step, submitting goes to next step", async () => {
    const { id } = await seed_reg({
      ...CONTACT_FIELDS,
      ...ORG_FIELDS_US,
      ...EIN_FIELDS,
      ...BANKING_FIELDS,
    });
    clear_qstash_events();
    const screen = await render_registration(id, "6");

    // dashboard renders
    await expect.element(screen.getByText(/summary/i)).toBeVisible();

    // click Update on step 1 (Contact Details)
    const step_rows = screen.getByText("Update");
    await step_rows.nth(0).click(); // first Update link = step 1

    // lands on step 1
    await expect.element(screen.getByLabelText(/first name/i)).toBeVisible();
    await expect
      .element(screen.getByLabelText(/first name/i))
      .toHaveDisplayValue("Jane");

    // change first name
    await screen.getByLabelText(/first name/i).clear();
    await screen.getByLabelText(/first name/i).fill("Janet");

    await screen.getByRole("button", { name: /continue/i }).click();

    // prog.step === 6 (all steps complete) → redirects back to dashboard
    await expect.element(screen.getByText(/summary/i)).toBeVisible();

    // verify DB updated
    const row = await get_reg(id);
    expect(row.r_first_name).toBe("Janet");
  }, 30_000);
});

describe("E2E: submitted state disables dashboard", () => {
  it("status 02 shows in-review and disables Update links", async () => {
    const { id } = await seed_reg({
      ...CONTACT_FIELDS,
      ...ORG_FIELDS_US,
      ...EIN_FIELDS,
      ...BANKING_FIELDS,
      status: "02",
    });
    const screen = await render_registration(id, "6");

    // dashboard renders
    await expect.element(screen.getByText(/summary/i)).toBeVisible();

    // shows in-review message
    await expect
      .element(screen.getByText(/submitted for review/i))
      .toBeInTheDocument();

    // all Update links are disabled
    const update_links = screen.getByRole("link", { name: /update/i });
    for (const link of update_links.elements()) {
      expect(link).toHaveAttribute("aria-disabled", "true");
    }

    // no Continue or Resubmit button
    await expect
      .element(screen.getByRole("button", { name: /continue/i }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /resubmit/i }))
      .not.toBeInTheDocument();
  }, 15_000);
});

// --- reg_put: seed data ---

describe("reg_put — seed data", () => {
  it("pre-fills referral method and code when referrer provided", async () => {
    const id = await reg_put({
      r_id: TEST_EMAIL,
      referrer: "ABC123",
    });

    const row = await get_reg(id);
    expect(row.rm).toBe("referral");
    expect(row.rm_referral_code).toBe("ABC123");
  });

  it("pre-fills claim when claim provided", async () => {
    const claim = { id: 42, name: "Test NPO", ein: "abc123" };
    const id = await reg_put({
      r_id: TEST_EMAIL,
      claim,
    });

    const row = await get_reg(id);
    expect(row.claim).toEqual(claim);
  });
});
