// email-only entrypoint: the flat-hex light palette, for consumers that
// can't read oklch() or CSS custom properties — mail clients. kept off the
// root barrel so app code can't accidentally import light hex under `.dark`.
export { colors as email_colors } from "./colors.ts";
