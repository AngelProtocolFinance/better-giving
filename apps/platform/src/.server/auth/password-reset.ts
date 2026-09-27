import { href } from "react-router";
import { base_url } from "$/env";
import { auth } from "./auth";
import { LINK_PER_EMAIL, LINK_PER_IP } from "./login-link";
import { client_ip, reserve } from "./rate-limit";

/** mail a password-reset link that lands on the set-password step.
 *
 * Throttled at the login link's quota sizes but in its own buckets, so an
 * attacker who burns one flow's cap for an address leaves the other recovery
 * route open. Over quota is silent, like an unknown address: the caller's
 * "check your inbox" screen must not differ.
 *
 * A mailer failure never reaches the caller — better-auth sends through
 * `runInBackgroundOrAwait`, which catches and only logs it. What can throw
 * is the adapter (the user lookup, the token write). */
export async function request_password_reset(
  email: string,
  request: Request
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const ip = client_ip(request.headers);
  const source = ip
    ? reserve(`password-reset:ip:${ip}`, LINK_PER_IP)
    : undefined;
  if (source === null) return;
  const address = reserve(`password-reset:email:${normalized}`, LINK_PER_EMAIL);
  if (!address) {
    source?.release();
    return;
  }

  const q = new URLSearchParams({ type: "set-password", email: normalized });
  // not the request's origin: the emailed link's callbackURL must pass
  // better-auth's origin check, which trusts BASE_URL's origin alone, and a
  // reset can start on another host we serve (deployment url, www, staging)
  const redirect_to = `${new URL(base_url).origin}${href("/login/reset")}?${q}`;

  try {
    await auth.api.requestPasswordReset({
      body: { email: normalized, redirectTo: redirect_to },
      // hooks and plugins see the caller's headers, as on a direct hit
      headers: request.headers,
    });
  } catch (err) {
    // the source keeps its charge, so a failure never buys it free requests
    address.release();
    throw err;
  }
}
