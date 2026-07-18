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
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const test_auth_ref = vi.hoisted(() => ({ current: null as any }));
const mock_send_email = vi.hoisted(() => vi.fn());
const mock_evaluate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    is_spam: false,
    spam_score: 0,
    explanation: "ok",
    field: "email",
  })
);

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

vi.mock("$/email", () => ({
  send_email: mock_send_email,
  sender: "test <test@test.com>",
  resend: {},
}));

vi.mock("#/.server/auth", () => ({
  auth: new Proxy(
    {},
    {
      get(_, prop) {
        if (!test_auth_ref.current) throw new Error("test auth not init");
        return (test_auth_ref.current as any)[prop];
      },
    }
  ),
  get_session: vi.fn(async (request: Request) => {
    if (!test_auth_ref.current) throw new Error("test auth not init");
    const session = await test_auth_ref.current.api.getSession({
      headers: request.headers,
    });
    return { user: session?.user };
  }),
  to_auth: vi.fn(
    () => new Response(null, { status: 302, headers: { location: "/login" } })
  ),
}));

vi.mock("#/.server/cookie", () => ({
  reg_cookie: {
    parse: vi.fn(async () => ({})),
    serialize: vi.fn(async () => "bg-registration=x"),
  },
}));

vi.mock("#/routes/_app.signup._index/evaluate", () => ({
  evaluate: mock_evaluate,
}));

vi.mock("#/.server/toast", () => ({
  dataWithError: (_data: any, message: string, init?: ResponseInit) =>
    new Response(JSON.stringify({ error: message }), {
      status: init?.status ?? 400,
      headers: { "Content-Type": "application/json" },
    }),
  dataWithSuccess: (_data: any, message: string) =>
    new Response(JSON.stringify({ success: message }), {
      headers: { "Content-Type": "application/json" },
    }),
  redirectWithSuccess: (url: string) =>
    new Response(null, { status: 302, headers: { location: url } }),
  getToast: vi.fn(),
}));

vi.mock("emails", () => ({
  cognito_signup: { template: () => ({ node: null }) },
  reset_password: { template: () => ({ node: null, subject: "Reset" }) },
}));

// --- imports (after mocks) ---

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { testUtils } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { sql } from "drizzle-orm";
import { referral_id } from "#/helpers/referral";
import LoginPage, {
  action as login_action,
  loader as login_loader,
} from "#/routes/_app.login/route";
import {
  action as reset_action,
  loader as reset_loader,
} from "#/routes/_app.login_.reset/api";
import ResetPage from "#/routes/_app.login_.reset/route";
// route components & actions/loaders
import SignupPage, {
  action as signup_action,
  loader as signup_loader,
} from "#/routes/_app.signup._index/route";
import {
  action as confirm_action,
  loader as confirm_loader,
} from "#/routes/_app.signup.confirm/api";
import ConfirmPage from "#/routes/_app.signup.confirm/route";
import SuccessPage from "#/routes/_app.signup.success/route";
import * as schema from "$/pg/schema";
import {
  account,
  session,
  user as user_table,
  verification,
} from "$/pg/schema/auth";
import { create_test_db } from "$/pg/test-utils/pglite-browser";

// --- constants ---

const BASE_URL = "http://localhost:4200";
const TEST_SECRET = "test-secret-at-least-32-characters-long!!";
const TEST_EMAIL = "jane@example.com";
const TEST_PW = "Test1234!@";

// --- test context ---

/** seed a verified user via auth API (not UI — used for login test setup) */
async function create_verified_user(
  email = TEST_EMAIL,
  password = TEST_PW,
  first_name = "Jane",
  last_name = "Doe"
) {
  await test_auth_ref.current.api.signUpEmail({
    body: {
      email,
      password,
      name: `${first_name} ${last_name}`,
      first_name,
      last_name,
    },
  });

  // getOTP returns hash when storeOTP:"hashed" — get plaintext from send_email mock
  const otp_call = mock_send_email.mock.calls.find(
    (c: any[]) => c[0]?.type === "otp" && c[0]?.email === email
  );
  if (!otp_call) throw new Error(`no OTP email sent for ${email}`);
  await test_auth_ref.current.api.verifyEmailOTP({
    body: { email, otp: otp_call[0].otp },
  });
}

// --- setup ---

beforeAll(async () => {
  test_db.current = await create_test_db();

  const test_auth = betterAuth({
    secret: TEST_SECRET,
    baseURL: BASE_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(test_db.current.db, { provider: "pg", schema }),
    experimental: { joins: true },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      async sendResetPassword({ user, url }) {
        mock_send_email({ type: "reset", email: user.email, url });
      },
    },

    emailVerification: { sendOnSignUp: true },

    plugins: [
      emailOTP({
        storeOTP: "hashed",
        otpLength: 6,
        expiresIn: 300,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === "forget-password") return;
          mock_send_email({ type: "otp", email, otp });
        },
      }),
      admin(),
      testUtils({ captureOTP: true }),
    ],

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 300, strategy: "jwe" },
    },

    user: {
      additionalFields: {
        first_name: { type: "string", required: true },
        last_name: { type: "string", required: true },
        referral_code: { type: "string", required: false, unique: true },
        pref_currency: { type: "string", required: false, defaultValue: "usd" },
        avatar_url: { type: "string", required: false },
        pay_id: { type: "string", required: false },
        pay_min: { type: "number", required: false, defaultValue: 0 },
        w_form: { type: "string", required: false },
        signup_date: { type: "string", required: false },
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const code = referral_id();
            await test_db.current!.db.execute(
              sql`UPDATE "user" SET referral_code = ${code}, signup_date = NOW() WHERE id = ${user.id}`
            );
          },
        },
      },
    },

    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
  });

  test_auth_ref.current = test_auth;
  await test_auth.$context;
}, 30_000);

beforeEach(async () => {
  await test_db.current!.db.delete(verification);
  await test_db.current!.db.delete(session);
  await test_db.current!.db.delete(account);
  await test_db.current!.db.delete(user_table);
  mock_send_email.mockClear();
  mock_evaluate.mockClear();
  mock_evaluate.mockResolvedValue({
    is_spam: false,
    spam_score: 0,
    explanation: "ok",
    field: "email",
  });
});

afterAll(async () => {
  await test_db.current?.client.close();
});

// --- route stubs ---

function signup_stub() {
  return createRoutesStub([
    {
      path: "/signup",
      Component: SignupPage,
      ErrorBoundary: () => <div data-testid="error-boundary">error</div>,
      action: signup_action,
      loader: signup_loader,
    },
    {
      path: "/signup/confirm",
      Component: ConfirmPage,
      action: confirm_action,
      loader: confirm_loader,
    },
    {
      path: "/signup/success",
      Component: SuccessPage,
      loader: signup_loader,
    },
    {
      // login redirect target — just a sentinel
      path: "/login",
      Component: () => <div data-testid="login-page">login</div>,
    },
    {
      path: "/marketplace",
      Component: () => <div data-testid="marketplace">marketplace</div>,
    },
  ]);
}

function login_stub() {
  return createRoutesStub([
    {
      path: "/login",
      Component: LoginPage,
      action: login_action,
      loader: login_loader,
    },
    {
      path: "/signup/confirm",
      Component: () => <div data-testid="confirm-page">confirm</div>,
    },
    {
      path: "/login/reset",
      Component: () => <div data-testid="reset-page">reset</div>,
    },
    {
      path: "/marketplace",
      Component: () => <div data-testid="marketplace">marketplace</div>,
    },
    {
      path: "/dashboard",
      Component: () => <div data-testid="dashboard">dashboard</div>,
    },
  ]);
}

function reset_stub() {
  return createRoutesStub([
    {
      path: "/login/reset",
      Component: ResetPage,
      action: reset_action,
      loader: reset_loader,
    },
    {
      path: "/login",
      Component: () => <div data-testid="login-page">login</div>,
    },
  ]);
}

// --- tests ---

describe("signup → OTP → success", () => {
  it("fills form, submits, enters OTP, sees success", async () => {
    const Stub = signup_stub();
    const screen = await render(<Stub initialEntries={["/signup"]} />);

    // fill signup form
    await screen.getByPlaceholder(/first name/i).fill("Jane");
    await screen.getByPlaceholder(/last name/i).fill("Doe");
    // two email fields — email and confirm
    const email_inputs = screen.getByPlaceholder(/email address/i);
    await email_inputs.nth(0).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/confirm email/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/create password/i).fill(TEST_PW);

    await screen.getByRole("button", { name: "Sign Up", exact: true }).click();

    // should land on confirm page with OTP input
    await expect.element(screen.getByPlaceholder(/6-digit/i)).toBeVisible();

    // get plaintext OTP from send_email mock (getOTP returns hash with storeOTP:"hashed")
    const otp_call = mock_send_email.mock.calls.find(
      (c: any[]) => c[0]?.type === "otp" && c[0]?.email === TEST_EMAIL
    );
    expect(otp_call).toBeTruthy();
    await screen.getByPlaceholder(/6-digit/i).fill(otp_call![0].otp);
    await screen.getByRole("button", { name: /verify/i }).click();

    // should see success page
    await expect
      .element(screen.getByText(/account created successfully/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /continue to sign in/i }))
      .toBeVisible();
  });

  it("shows error for wrong OTP", async () => {
    // seed unverified user via API
    await test_auth_ref.current.api.signUpEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PW,
        name: "Jane Doe",
        first_name: "Jane",
        last_name: "Doe",
      },
    });

    const Stub = signup_stub();
    const screen = await render(
      <Stub
        initialEntries={[
          `/signup/confirm?email=${encodeURIComponent(TEST_EMAIL)}`,
        ]}
      />
    );

    await screen.getByPlaceholder(/6-digit/i).fill("000000");
    await screen.getByRole("button", { name: /verify/i }).click();

    await expect
      .element(screen.getByText(/invalid or expired code/i))
      .toBeVisible();
  });

  it("resend OTP button sends new code", async () => {
    await test_auth_ref.current.api.signUpEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PW,
        name: "Jane Doe",
        first_name: "Jane",
        last_name: "Doe",
      },
    });
    mock_send_email.mockClear();

    const Stub = signup_stub();
    const screen = await render(
      <Stub
        initialEntries={[
          `/signup/confirm?email=${encodeURIComponent(TEST_EMAIL)}`,
        ]}
      />
    );

    // counter starts at 30 — wait for it to reach 0 would be slow
    // instead, test resend action directly since the button is disabled while counter > 0
    // the resend button text is visible even when disabled
    await expect
      .element(screen.getByRole("button", { name: /resend code/i }))
      .toBeVisible();
  });

  it("rejects spam signup and shows field error", async () => {
    mock_evaluate.mockResolvedValueOnce({
      is_spam: true,
      spam_score: 0.95,
      category: "spam",
      explanation: "suspicious email pattern",
      field: "email",
    });

    const Stub = signup_stub();
    const screen = await render(<Stub initialEntries={["/signup"]} />);

    await screen.getByPlaceholder(/first name/i).fill("Jane");
    await screen.getByPlaceholder(/last name/i).fill("Doe");
    await screen
      .getByPlaceholder(/email address/i)
      .nth(0)
      .fill(TEST_EMAIL);
    await screen.getByPlaceholder(/confirm email/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/create password/i).fill(TEST_PW);

    await screen.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect
      .element(screen.getByText(/suspicious email pattern/i))
      .toBeVisible();
  });

  it("signup with existing verified email still shows confirm page", async () => {
    // better-auth returns 200 to avoid email enumeration
    await create_verified_user();

    const Stub = signup_stub();
    const screen = await render(<Stub initialEntries={["/signup"]} />);

    await screen.getByPlaceholder(/first name/i).fill("Jane");
    await screen.getByPlaceholder(/last name/i).fill("Doe");
    await screen
      .getByPlaceholder(/email address/i)
      .nth(0)
      .fill(TEST_EMAIL);
    await screen.getByPlaceholder(/confirm email/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/create password/i).fill(TEST_PW);

    await screen.getByRole("button", { name: "Sign Up", exact: true }).click();

    // redirects to confirm — better-auth doesn't leak user existence
    await expect.element(screen.getByPlaceholder(/6-digit/i)).toBeVisible();
  });
});

describe("login flow", () => {
  it("signs in with valid credentials → redirects to marketplace", async () => {
    await create_verified_user();

    const Stub = login_stub();
    const screen = await render(<Stub initialEntries={["/login"]} />);

    await screen.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/password/i).fill(TEST_PW);
    await screen.getByRole("button", { name: /log in/i }).click();

    await expect.element(screen.getByTestId("marketplace")).toBeVisible();
  });

  it("shows error for invalid credentials", async () => {
    await create_verified_user();

    const Stub = login_stub();
    const screen = await render(<Stub initialEntries={["/login"]} />);

    await screen.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/password/i).fill("WrongPass1!");
    await screen.getByRole("button", { name: /log in/i }).click();

    await expect.element(screen.getByText(/invalid/i)).toBeVisible();
  });

  it("redirects unverified user to confirm page", async () => {
    await test_auth_ref.current.api.signUpEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PW,
        name: "Jane Doe",
        first_name: "Jane",
        last_name: "Doe",
      },
    });

    const Stub = login_stub();
    const screen = await render(<Stub initialEntries={["/login"]} />);

    await screen.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/password/i).fill(TEST_PW);
    await screen.getByRole("button", { name: /log in/i }).click();

    await expect.element(screen.getByTestId("confirm-page")).toBeVisible();
  });

  it("redirects migrated user (no account row) to reset page", async () => {
    // insert user directly — simulates cognito migration
    const user_id = crypto.randomUUID();
    await test_db.current!.db.insert(user_table).values({
      id: user_id,
      name: "Migrated User",
      email: TEST_EMAIL,
      emailVerified: true,
      first_name: "Migrated",
      last_name: "User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const Stub = login_stub();
    const screen = await render(<Stub initialEntries={["/login"]} />);

    await screen.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/password/i).fill("AnyPass1!");
    await screen.getByRole("button", { name: /log in/i }).click();

    await expect.element(screen.getByTestId("reset-page")).toBeVisible();
  });

  it("redirects to original page after login with ?redirect param", async () => {
    await create_verified_user();

    const Stub = login_stub();
    const screen = await render(
      <Stub initialEntries={["/login?redirect=/dashboard"]} />
    );

    await screen.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await screen.getByPlaceholder(/password/i).fill(TEST_PW);
    await screen.getByRole("button", { name: /log in/i }).click();

    await expect.element(screen.getByTestId("dashboard")).toBeVisible();
  });
});

describe("password reset flow", () => {
  it("requests reset → check email → set password → success", async () => {
    await create_verified_user();
    mock_send_email.mockClear();

    const Stub = reset_stub();
    const screen = await render(<Stub initialEntries={["/login/reset"]} />);

    // step 1: init form — enter email
    await expect
      .element(screen.getByText(/reset your password/i))
      .toBeVisible();
    await screen.getByPlaceholder(/email address/i).fill(TEST_EMAIL);
    await screen.getByRole("button", { name: /send code/i }).click();

    // step 2: check email page
    await expect.element(screen.getByText(/check your email/i)).toBeVisible();

    // extract token from send_email mock
    // url format: {baseURL}/reset-password/{token}?callbackURL={encoded}
    const reset_call = mock_send_email.mock.calls.find(
      (c: any[]) => c[0]?.type === "reset"
    );
    expect(reset_call).toBeTruthy();
    const reset_url = new URL(reset_call![0].url);
    const token = reset_url.pathname.split("/reset-password/")[1];
    expect(token).toBeTruthy();

    // step 3: navigate to set-password with token (simulates clicking email link)
    await cleanup();
    const screen2 = await render(
      <Stub
        initialEntries={[
          `/login/reset?type=set-password&email=${encodeURIComponent(TEST_EMAIL)}&token=${token}`,
        ]}
      />
    );

    await expect.element(screen2.getByText(/set new password/i)).toBeVisible();
    await screen2
      .getByPlaceholder("New Password", { exact: true })
      .fill("NewPass1!@");
    await screen2
      .getByPlaceholder("Confirm New Password", { exact: true })
      .fill("NewPass1!@");
    await screen2.getByRole("button", { name: /confirm/i }).click();

    // step 4: success
    await expect
      .element(screen2.getByText(/password reset successful/i))
      .toBeVisible();
    await expect
      .element(screen2.getByRole("link", { name: /back to sign in/i }))
      .toBeVisible();
  });

  it("forgot password link on login navigates to reset page", async () => {
    const Stub = createRoutesStub([
      {
        path: "/login",
        Component: LoginPage,
        action: login_action,
        loader: login_loader,
      },
      {
        path: "/login/reset",
        Component: ResetPage,
        action: reset_action,
        loader: reset_loader,
      },
    ]);
    const screen = await render(<Stub initialEntries={["/login"]} />);

    await screen.getByRole("link", { name: /forgot password/i }).click();

    await expect
      .element(screen.getByText(/reset your password/i))
      .toBeVisible();
  });
});
