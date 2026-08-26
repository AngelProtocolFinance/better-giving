// the browser suite renders real components, so every assertion about geometry
// (a touch target, a truncating label, a gap) needs the style layer compiled and
// applied — without this the tailwind classes are inert and the tests silently
// measure unstyled boxes. build-entry.css is used rather than index.css because
// it carries the `@import "tailwindcss"` that index.css deliberately withholds
// for consumers that own their own tailwind pass.
import "./styles/build-entry.css";
