/**
 * the origin of the page framing this form, when its embed script told us —
 * otherwise `"*"`, which is what every embed sent before the parameter
 * existed.
 *
 * this is a `postMessage` target, so it is only ever a *validated* origin:
 * anything else makes `postMessage` throw, and that throw would land in the
 * middle of a donation that already went through.
 *
 * the residual is deliberate: merchant pages run a cached `form-embed.js` we
 * don't control, and a plain `<iframe src>` embed has no script at all. both
 * send nothing and keep the wildcard, so a form with a `success_redirect` can
 * still have its message (donor name, amount) read by any page framing it.
 * that closes for a given merchant only when their browser picks up the newer
 * script.
 */
export function parent_origin(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    // an origin and nothing else — a path, a trailing slash or "*" is not one
    return new URL(raw).origin === raw ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** the same rule, as the `postMessage` argument itself. */
export const post_target = (raw?: string | null): string =>
  parent_origin(raw) ?? "*";
