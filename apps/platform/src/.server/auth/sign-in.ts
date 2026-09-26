import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import {
  client_ip,
  consume,
  type Quota,
  type Reservation,
  reserve,
} from "./rate-limit";

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
    message: "Too many sign-in attempts. Try again in a few minutes.",
  });

const RESERVATION = Symbol("sign-in email reservation");

/** `dispatchAuthEndpoint` gives each call its own copy of `ctx.context` and
 * hands that same object to the before and after hooks — the infra plugin
 * carries its visitor id across the same way. a symbol key survives the defu
 * merge a before hook's returned context goes through. */
const held = (ctx: { context: object }) =>
  ctx.context as { [RESERVATION]?: Reservation };

/** runs from `dispatchAuthEndpoint`, which the router and every `auth.api.*`
 * call both go through — so it binds `/api/auth/sign-in/email` and the
 * `/login` action alike. */
export const sign_in_hooks = {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== PATH) return;
    // the source pays on every attempt, even one the address check refuses. a
    // source over its cap is refused here, before the address is charged.
    const ip = ctx.headers && client_ip(ctx.headers);
    if (ip && !consume(`sign-in:ip:${ip}`, SIGN_IN_PER_IP)) throw throttled();
    const key = email_key(ctx.body);
    if (!key) return;
    const reservation = reserve(key, SIGN_IN_PER_EMAIL);
    if (!reservation) throw throttled();
    held(ctx)[RESERVATION] = reservation;
  }),
  // only a wrong password keeps its charge: that is the guess the cap is for,
  // and charging a success would throttle the account's owner. the dispatcher
  // turns an endpoint's thrown APIError into `returned`, so every refusal the
  // endpoint makes lands here too.
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== PATH) return;
    const res = ctx.context.returned;
    const guessed =
      isAPIError(res) && res.body?.code === "INVALID_EMAIL_OR_PASSWORD";
    if (!guessed) held(ctx)[RESERVATION]?.release();
  }),
};

/** a before hook's throw escapes `auth.api.*` even under `asResponse: true` —
 * only the endpoint's own errors become a Response — so a server-side caller
 * catches this rather than reading a 429. */
export const is_sign_in_throttled = (err: unknown): err is APIError =>
  isAPIError(err) && err.body?.code === THROTTLED_CODE;
