/**
 * a mailto href's header fields as a mail client reads them (RFC 6068):
 * split on `&` before percent-decoding, `+` stays literal, nothing past `#`.
 * `URLSearchParams` would read `+` as a space, so it is not used here.
 */
export function mailto_fields(href: string): Map<string, string> {
  const fields = new Map<string, string>();
  const query = new URL(href).search.slice(1);
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    fields.set(
      decodeURIComponent(pair.slice(0, eq)),
      decodeURIComponent(pair.slice(eq + 1))
    );
  }
  return fields;
}
