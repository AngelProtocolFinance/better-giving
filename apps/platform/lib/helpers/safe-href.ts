const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
// relative forms resolve against a placeholder origin, so they classify as http:
const RELATIVE_BASE = "http://relative.invalid";
const WEB_PROTOCOLS = new Set(["http:", "https:"]);
// the URL parser alone would take `https:host` (relative on an https page)
const ABSOLUTE_WEB = /^https?:\/\//i;

/** a web, mail or phone link, absolute or relative */
export function is_safe_href(href: unknown): boolean {
  if (typeof href !== "string" || !href.trim()) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(href, RELATIVE_BASE).protocol);
  } catch {
    return false;
  }
}

/** a full `http(s)://` url; schemeless, relative and protocol-relative forms fail */
export function is_absolute_web_href(href: unknown): boolean {
  if (typeof href !== "string") return false;
  const trimmed = href.trim();
  if (!ABSOLUTE_WEB.test(trimmed)) return false;
  try {
    return WEB_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}
