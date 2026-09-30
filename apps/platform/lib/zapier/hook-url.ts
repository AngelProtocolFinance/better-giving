/**
 * every donation is posted to a stored hook url, so a leaked key must not be
 * able to point one anywhere but zapier
 */
export function is_zapier_hook_url(x: unknown): x is string {
  if (typeof x !== "string" || !URL.canParse(x)) return false;
  const u = new URL(x);
  return u.origin === "https://hooks.zapier.com" && !u.username && !u.password;
}
