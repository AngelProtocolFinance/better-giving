// flat-hex entrypoint: the palette for consumers that cannot read oklch() or a
// CSS custom property — the transactional email templates (mail clients) and
// the donation-calculator PDF (pdf-lib draws into a document with no
// stylesheet). kept off the root barrel so app code reaches for the css custom
// properties rather than baked-in hex.
export { colors as flat_colors } from "./colors.ts";
