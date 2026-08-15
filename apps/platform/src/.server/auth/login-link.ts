import { href } from "react-router";
import { report_error } from "@/errors/report";
import { auth } from "./auth";
import { client_ip, consume, type Quota } from "./rate-limit";

interface LinkReq {
  email: string;
  /** where the link should land them once it has signed them in */
  redirect_to?: string;
  /** the caller's own request headers. carries the client ip, which is the only
   * thing that caps an anonymous source across many addresses. */
  headers?: Headers;
}

/** one address can only be mailed this often, whoever asks. short window and a
 * tight-ish ceiling because this is the bucket protecting a *third party*: the
 * victim of a mailbomb is whoever's address got typed, not the sender. The
 * check-email screen's own 30s cooldown means a quarter hour physically allows
 * about thirty honest clicks and an impatient real person makes two or three,
 * so this clears human use with margin while capping one inbox at ~60/hour. */
export const LINK_PER_EMAIL: Quota = { max: 15, window_s: 15 * 60 };
/** and one source can only pull links for so many addresses. sized like
 * `CREATE_PER_IP` — carrier-grade NAT, not the office — and deliberately above
 * it, since every account opened on the signup path implies a mail and honest
 * resends land on top; the account ceiling should bind first, not this. */
export const LINK_PER_IP: Quota = { max: 100, window_s: 60 * 60 };

/** the "check your inbox" screen, carrying enough to offer a resend */
export function check_email_url(a: LinkReq & { stale?: boolean }): string {
  const q = new URLSearchParams({ email: a.email });
  if (a.redirect_to) q.set("redirect", a.redirect_to);
  // the link was expired or already used — same remedy either way
  if (a.stale) q.set("stale", "1");
  return `${href("/check-email")}?${q}`;
}

/** mail a single-use sign-in link. never reports whether the address exists —
 * callers show the same "check your inbox" either way, so this is not an
 * account-enumeration oracle.
 *
 * Throttled here rather than at each caller: this is the one chokepoint every
 * surface that can make us send mail goes through, and being over quota is
 * silent for the same reason an unknown address is — the screen must not
 * differ. */
export async function request_login_link(a: LinkReq): Promise<void> {
  const email = a.email.trim().toLowerCase();
  const redirect_to = a.redirect_to || href("/marketplace");

  if (!consume(`login-link:email:${email}`, LINK_PER_EMAIL)) return;
  const ip = a.headers && client_ip(a.headers);
  if (ip && !consume(`login-link:ip:${ip}`, LINK_PER_IP)) return;

  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: redirect_to,
        // a dead link bounces back to the inbox screen, which offers a resend
        errorCallbackURL: check_email_url({ email, redirect_to, stale: true }),
      },
      // the real caller's headers, so better-auth resolves the same client ip
      // it would have from a direct hit on the endpoint
      headers: a.headers ?? new Headers(),
    });
  } catch (err) {
    // unknown address, or the mailer failed. either way the caller's screen is
    // identical, so swallow rather than leak which one it was.
    report_error(err);
  }
}
