import { href } from "react-router";
import { report_error } from "#/errors/report";
import { safe_redirect } from "@/helpers/safe-redirect";
import { auth } from "./auth";
import { client_ip, type Quota, reserve } from "./rate-limit";

interface LinkReq {
  email: string;
  /** where the link should land them once it has signed them in. anything
   * off this origin is dropped for the default. */
  redirect_to?: string;
  /** the caller's own request headers. carries the client ip, which is the only
   * thing that caps an anonymous source across many addresses. */
  headers?: Headers;
}

/** one address can only be mailed this often by one flow, whoever asks. short
 * window and a tight-ish ceiling because this is the bucket protecting a
 * *third party*: the victim of a mailbomb is whoever's address got typed, not
 * the sender. The check-email screen's own 30s cooldown means a quarter hour
 * physically allows about thirty honest clicks and an impatient real person
 * makes two or three, so this clears human use with margin while capping one
 * flow at ~60/hour per inbox. */
export const LINK_PER_EMAIL: Quota = { max: 15, window_s: 15 * 60 };
/** and one source can only pull mail for so many addresses, per flow. sized like
 * `CREATE_PER_IP` — carrier-grade NAT, not the office — and deliberately above
 * it, since every account opened on the signup path implies a mail and honest
 * resends land on top; the account ceiling should bind first, not this. */
export const LINK_PER_IP: Quota = { max: 100, window_s: 60 * 60 };

/** the "check your inbox" screen, carrying enough to offer a resend */
export function check_email_url(a: LinkReq & { stale?: boolean }): string {
  const q = new URLSearchParams({ email: a.email });
  const redirect_to = safe_redirect(a.redirect_to, null);
  if (redirect_to) q.set("redirect", redirect_to);
  // the link was expired or already used — same remedy either way
  if (a.stale) q.set("stale", "1");
  return `${href("/check-email")}?${q}`;
}

/** mail a single-use sign-in link. never reports whether the address exists —
 * callers show the same "check your inbox" either way, so this is not an
 * account-enumeration oracle.
 *
 * Throttled here rather than at each caller: every surface that sends a
 * login link goes through this, and being over quota is silent for the same
 * reason an unknown address is — the screen must not differ. The buckets are
 * this flow's own; reset mail is capped separately. */
export async function request_login_link(a: LinkReq): Promise<void> {
  const email = a.email.trim().toLowerCase();
  const redirect_to = safe_redirect(a.redirect_to, href("/marketplace"));

  const ip = a.headers && client_ip(a.headers);
  const source = ip ? reserve(`login-link:ip:${ip}`, LINK_PER_IP) : undefined;
  if (source === null) return;
  const address = reserve(`login-link:email:${email}`, LINK_PER_EMAIL);
  if (!address) {
    source?.release();
    return;
  }

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
    // the adapter (the token write) or the template render failed — the send
    // itself swallows a mailer refusal. the caller's screen stays identical, so
    // swallow rather than leak it. the source keeps its charge, so a failure
    // never buys it free requests.
    address.release();
    report_error(err);
  }
}
