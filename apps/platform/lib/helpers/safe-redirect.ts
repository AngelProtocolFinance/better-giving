const SELF = "http://self.invalid";
/** every path we route to is printable ascii. CR/LF or anything past latin-1
 * would make `redirect()`'s Headers throw — a 500 */
const NOT_PRINTABLE_ASCII = /[^\x20-\x7e]/;

/** `raw` when it stays on this origin, else `fallback`. judged decoded once,
 * because magic-link verify decodes its `callbackURL` again, which must not
 * turn `/%2Fevil` into `//evil`. */
export function safe_redirect<F extends string | null>(
  raw: string | null | undefined,
  fallback: F
): string | F {
  if (typeof raw !== "string" || NOT_PRINTABLE_ASCII.test(raw)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/")) return fallback;
  // the browser's own parser decides where a location goes: it reads `/\` as
  // `//` and drops tab/newline, so a string check on `//` alone is bypassable
  const resolved = new URL(decoded, SELF);
  if (resolved.origin !== SELF) return fallback;
  // `/..//evil` stays on origin but resolves to the path `//evil`, which is
  // protocol-relative again wherever the pathname is re-serialized
  if (resolved.pathname.startsWith("//")) return fallback;
  return raw;
}
