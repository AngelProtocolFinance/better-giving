// email-only entrypoint: the flat-hex palette, for consumers that can't read
// oklch() or CSS custom properties — mail clients. kept off the root barrel so
// app code reaches for the css custom properties rather than baked-in hex.
export { colors as email_colors } from "./colors.ts";
