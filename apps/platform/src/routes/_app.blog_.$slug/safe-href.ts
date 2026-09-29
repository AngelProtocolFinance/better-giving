const SAFE_SCHEMES = /^(https?|mailto|tel):/i;
// the url parser drops tab/newline anywhere and treats `\` as `/`, so `/\t/x` and `/\x` are protocol-relative
const URL_IGNORED_CHARS = /[\t\n\r]/g;
const ROOT_RELATIVE = /^\/(?![/\\])/;

export function is_safe_href(href: string | undefined): boolean {
  if (!href) return false;
  const normalized = href.replace(URL_IGNORED_CHARS, "").trim();
  return SAFE_SCHEMES.test(normalized) || ROOT_RELATIVE.test(normalized);
}
