import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { client_ip, consume, has_quota, type Quota } from "./rate-limit";

/** guessing one account's password. an honest typo streak is two or three */
const SIGN_IN_PER_EMAIL: Quota = { max: 5, window_s: 5 * 60 };
/** one source cycling addresses — credential stuffing. sized for a shared NAT */
const SIGN_IN_PER_IP: Quota = { max: 20, window_s: 5 * 60 };

const PATH = "/sign-in/email";

const email_key = (body: unknown): string | null => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string"
    ? `sign-in:email:${email.toLowerCase()}`
    : null;
};

const THROTTLED_CODE = "SIGN_IN_THROTTLED";

const throttled = () =>
  new APIError("TOO_MANY_REQUESTS", {
    code: THROTTLED_CODE,
    message:
      "Too many sign-in attempts. Try again in a few minutes, or sign in with an email link.",
  });

/** runs from `dispatchAuthEndpoint`, which the router and every `auth.api.*`
 * call both go through — so it binds `/api/auth/sign-in/email` and the
 * `/login` action alike. */
export const sign_in_hooks = {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== PATH) return;
    // the source pays first, so one that is already over its cap can't spend
    // anybody's address quota.
    const ip = ctx.headers && client_ip(ctx.headers);
    if (ip && !consume(`sign-in:ip:${ip}`, SIGN_IN_PER_IP)) throw throttled();
    const key = email_key(ctx.body);
    if (key && !has_quota(key, SIGN_IN_PER_EMAIL)) throw throttled();
  }),
  // only a wrong password spends the address's quota: charging every attempt
  // lets anyone lock a stranger out, and a success is no guess.
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== PATH) return;
    const res = ctx.context.returned;
    if (!isAPIError(res) || res.body?.code !== "INVALID_EMAIL_OR_PASSWORD") {
      return;
    }
    const key = email_key(ctx.body);
    if (key) consume(key, SIGN_IN_PER_EMAIL);
  }),
};

/** a before hook's throw escapes `auth.api.*` even under `asResponse: true` —
 * only the endpoint's own errors become a Response — so a server-side caller
 * catches this rather than reading a 429. */
export const is_sign_in_throttled = (err: unknown): err is APIError =>
  isAPIError(err) && err.body?.code === THROTTLED_CODE;
