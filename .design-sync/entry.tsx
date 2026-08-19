// curated design-system entry for /design-sync.
//
// platform is an app, not a component library — it ships no dist/ and no
// barrel, and two of its files (tooltip.tsx, hover-card.tsx) both export
// `Arrow`/`Content`, so the converter's `export *` synth entry would collide.
// this file is the explicit export surface instead: one named export per
// component the design system publishes, plus the provider previews mount in.
//
// imports are relative and point at each component's implementation FILE, not
// its directory barrel: this file sits outside apps/platform so esbuild's own
// tsconfig discovery doesn't cover it (files it pulls in are under
// apps/platform and keep resolving `#/`, `@/`, `$/` natively), and the
// barrels re-export siblings that drag in assets the converter has no loader
// for (image/index.ts → dapp-logo.tsx → .webp). paths mirror
// cfg.componentSrcMap — regenerate both together.

import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";

// components that call useNavigate/NavLink (Prompt, Breadcrumbs) throw outside
// a router. previews mount through this via cfg.provider.
export function DsProvider({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

// content
export { Amount } from "../apps/platform/src/components/amount";
export { Breadcrumbs } from "../apps/platform/src/components/breadcrumbs";
export { ContentLoader } from "../apps/platform/src/components/content-loader";
export { Copier } from "../apps/platform/src/components/copier/copier";
export { DateField } from "../apps/platform/src/components/date-field";
export { DateRangeField } from "../apps/platform/src/components/date-range-field";
export { ExtLink } from "../apps/platform/src/components/ext-link";
export { FileDropzone } from "../apps/platform/src/components/file-dropzone/file-dropzone";
export { CheckField } from "../apps/platform/src/components/form/check-field";
// forms
export { Field } from "../apps/platform/src/components/form/field";
export { Input } from "../apps/platform/src/components/form/input";
export { Label } from "../apps/platform/src/components/form/label";
export { MaskedInput } from "../apps/platform/src/components/form/masked-input";
// mask presets for <MaskedInput mask={...} /> — each is a { format, unmask }
// pair. lowercase, so the converter never mistakes them for components; they
// ride on window.BetterGiving purely so a design can use the REAL ein/dollar
// masks instead of reimplementing them. (found by the batch-A preview author,
// which had to inline a copy.)
export * as masks from "../apps/platform/src/components/form/masks";
export { PasswordInput } from "../apps/platform/src/components/form/password-input";
export { UrlInput } from "../apps/platform/src/components/form/url-input";
export { Group } from "../apps/platform/src/components/group";
export {
  Content as HoverCardContent,
  HoverCard,
} from "../apps/platform/src/components/hover-card";
export { DrawerIcon } from "../apps/platform/src/components/icon/drawer-icon";
export { Image } from "../apps/platform/src/components/image/image";
export { ImagePlaceholder } from "../apps/platform/src/components/image/image-placeholder";
export { Increments } from "../apps/platform/src/components/increments";
export { LoadText } from "../apps/platform/src/components/load-text";
export { LoaderRing } from "../apps/platform/src/components/loader-ring";

// overlays
export { Modal } from "../apps/platform/src/components/modal";
export { PayoutStatus } from "../apps/platform/src/components/payout-status";
export { Prompt } from "../apps/platform/src/components/prompt/prompt";
// selection
export { Combo } from "../apps/platform/src/components/select/combo";
export { MultiCombo } from "../apps/platform/src/components/select/multi-combo";
export { Select } from "../apps/platform/src/components/select/select";
export { Separator } from "../apps/platform/src/components/separator";
export { Confirmed } from "../apps/platform/src/components/status/confirmed";
export { ErrorStatus } from "../apps/platform/src/components/status/error-status";
export { Info } from "../apps/platform/src/components/status/info";
export { LoadingStatus } from "../apps/platform/src/components/status/loading-status";
// feedback
export { Status } from "../apps/platform/src/components/status/status";
export { Target } from "../apps/platform/src/components/target";
export { Toaster } from "../apps/platform/src/components/toaster";
export { Toggle } from "../apps/platform/src/components/toggle";
// both source files export a `Content` that the `tip` prop must be wrapped in.
// renamed here because the two collide in one barrel; lowercase-free names keep
// them out of the converter's component set, which is right — they are parts of
// Tooltip/HoverCard, not cards of their own.
export {
  Content as TooltipContent,
  Tooltip,
} from "../apps/platform/src/components/tooltip";
export { VerifiedIcon } from "../apps/platform/src/components/verified-icon";
