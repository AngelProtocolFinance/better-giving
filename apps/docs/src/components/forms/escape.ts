// escapes a value for safe interpolation into a double-quoted html attribute
// in copyable embed snippets. the route `:id` is user-controlled (decoded from
// the url), so an encoded quote would otherwise break out of `src`/`data-bg-form`
// and inject attributes into the pasted markup. the live react preview is already
// escaped by react; this covers the raw string snippets.
export const esc_attr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
