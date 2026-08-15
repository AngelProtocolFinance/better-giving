import { createCookie } from "react-router";
import { app } from "$/env";
import { auth } from "./auth";
import type { AuthUser } from "./middleware";

const GRANT_TTL_S = 60 * 60 * 24;

/** Pre-verification authority, and deliberately not a session.
 *
 * It is signed (forging one needs the app secret) and httpOnly (page scripts
 * can't read or mint it) — unlike `reg_cookie`, which is unsigned and
 * client-writable and therefore cannot carry authority at all.
 *
 * It is only ever issued for an account that was *just created empty*, so the
 * worst a holder can reach is a blank application it started itself. The
 * moment the address is proven the account gains a real session and this
 * stops resolving. */
export const draft_grant_cookie = createCookie("bg-draft", {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: GRANT_TTL_S,
  secrets: [app.session_secret],
});

export const issue_draft_grant = (user_id: string) =>
  draft_grant_cookie.serialize({ user_id });

/** Who may fill the registration step that runs before verification.
 *
 * A verified session always wins. Failing that, a draft grant resolves — but
 * only while its account is still unverified, so a stale grant can never act
 * as a second key to an account that has since been proven and may by then
 * hold real data. */
export async function get_registrant(
  request: Request
): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.emailVerified) return session.user;

  const raw = await draft_grant_cookie.parse(request.headers.get("cookie"));
  const user_id: unknown = raw?.user_id;
  if (typeof user_id !== "string" || !user_id) return null;

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.findUserById(user_id);
  if (!user || user.emailVerified) return null;
  return user as AuthUser;
}
