import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const sign_in_email = vi.hoisted(() => vi.fn());

vi.mock("#/.server/auth", async () => {
  // the real counters — they are the behavior under test
  const rl = await import("#/.server/auth/rate-limit");
  return {
    auth: { api: { signInEmail: sign_in_email } },
    get_session: vi.fn(async () => ({ user: undefined })),
    client_ip: rl.client_ip,
    consume: rl.consume,
  };
});

vi.mock("#/.server/auth/login-link", () => ({
  check_email_url: vi.fn(() => "/check-email"),
  request_login_link: vi.fn(),
}));

vi.mock("#/.server/toast", () => ({
  dataWithError: vi.fn((_: unknown, msg: string) => ({ toast_error: msg })),
}));

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

vi.mock("$/pg/db", () => ({ db: {} }));

// --- imports (after mocks hoisted) ---

import { reset_rate_limits } from "#/.server/auth/rate-limit";
import { action } from "./route";

const THROTTLED = "Too many sign-in attempts. Try again in a few minutes.";

beforeEach(() => {
  reset_rate_limits();
  sign_in_email.mockReset();
  sign_in_email.mockImplementation(
    async () =>
      new Response(null, {
        status: 200,
        headers: { "set-cookie": "session=abc" },
      })
  );
});

const attempt = (email: string, ip = "203.0.113.7") => {
  const fv = new FormData();
  fv.set("email", email);
  fv.set("password", "hunter22");
  const request = new Request("https://app.test/login", {
    method: "POST",
    body: fv,
    headers: { "x-forwarded-for": ip, "user-agent": "stuffer/1.0" },
  });
  return (action as any)({ request, params: {}, context: {} });
};

/** the password-field error the action returns instead of a redirect */
const password_error = (res: unknown): string | undefined =>
  (res as { errors?: { password?: { message?: string } } }).errors?.password
    ?.message;

describe("password sign-in throttle", () => {
  it("stops the 6th attempt for one email before it reaches sign-in", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await attempt("Victim@Example.com");
      expect(password_error(res)).toBeUndefined();
    }
    expect(sign_in_email).toHaveBeenCalledTimes(5);

    const sixth = await attempt("victim@example.com");

    expect(sign_in_email).toHaveBeenCalledTimes(5);
    expect(password_error(sixth)).toBe(THROTTLED);
  });

  it("stops the 21st attempt from one ip, across different emails", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await attempt(`user${i}@example.com`);
      expect(password_error(res)).toBeUndefined();
    }

    const fresh_email = await attempt("fresh@example.com");

    expect(sign_in_email).toHaveBeenCalledTimes(20);
    expect(password_error(fresh_email)).toBe(THROTTLED);

    // the cap is the source's, not the address's
    const other_ip = await attempt("fresh@example.com", "198.51.100.9");
    expect(password_error(other_ip)).toBeUndefined();
    expect(sign_in_email).toHaveBeenCalledTimes(21);
  });

  it("hands sign-in the caller's headers, so the session records ip and agent", async () => {
    await attempt("someone@example.com");

    const headers: Headers = sign_in_email.mock.calls[0][0].headers;
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(headers.get("user-agent")).toBe("stuffer/1.0");
  });
});
