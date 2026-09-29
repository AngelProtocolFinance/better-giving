const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
// sanity's `uri({ allowRelative })` resolves against this origin, so relative forms pass as http: — mirrored here
const RELATIVE_BASE = "http://sanity";

export function is_safe_href(href: string | undefined): boolean {
  if (!href?.trim()) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(href, RELATIVE_BASE).protocol);
  } catch {
    return false;
  }
}
