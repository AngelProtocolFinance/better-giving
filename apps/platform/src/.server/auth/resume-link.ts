import { auth } from "./auth";
import { check_email_url } from "./login-link";
import { hash_link_token, RESUME_LINK_TTL_S } from "./options";

/** A sign-in link minted for a mail rather than for a form.
 *
 * `request_login_link` cannot serve this. It *sends*, and the welcome mail must
 * stay one mail; and it goes through `/sign-in/magic-link`, whose row is always
 * written with the plugin-global `expiresIn` — the login form's hour, which is
 * the wrong lifetime for something opened the next morning. better-auth 1.6
 * takes no per-call expiry (`signInMagicLinkBodySchema` has no such field), and
 * lengthening the global would lengthen every `/login` link with it.
 *
 * So the row is written here, with our own `expiresAt`, and nothing else is
 * ours: redemption is still the plugin's `/magic-link/verify`, which owns the
 * atomic single-use consume, the promotion to verified, the session and the
 * cookie. The two halves agree on the identifier because both derive it with
 * `hash_link_token` — that is what `storeToken` is set to.
 *
 * Mint this only for an address no verified account owns. Once an address is
 * proven, its account's key is a session, and `draft-grant` says why: authority
 * that predates the proof must not outlive it. */
export async function mint_resume_link(a: {
  email: string;
  /** where the link lands them once it has signed them in */
  redirect_to: string;
}): Promise<string> {
  const email = a.email.trim().toLowerCase();
  const ctx = await auth.$context;

  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await ctx.internalAdapter.createVerificationValue({
    identifier: await hash_link_token(token),
    // the shape `/magic-link/verify` parses back out. `name` is absent on
    // purpose — the row it would name already exists.
    value: JSON.stringify({ email }),
    expiresAt: new Date(Date.now() + RESUME_LINK_TTL_S * 1000),
  });

  // the plugin builds its own url the same way: `baseURL` already carries the
  // base path when one is configured, so adding `basePath` again would double it
  const base = new URL(ctx.baseURL);
  const pathname = base.pathname === "/" ? "" : base.pathname;
  const url = new URL(
    `${pathname || ctx.options.basePath || ""}/magic-link/verify`,
    base.origin
  );
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", a.redirect_to);
  // a token a scanner already burned, or one opened after three days, is not a
  // dead end — this is the screen that offers a fresh link
  url.searchParams.set(
    "errorCallbackURL",
    check_email_url({ email, redirect_to: a.redirect_to, stale: true })
  );
  return url.toString();
}
