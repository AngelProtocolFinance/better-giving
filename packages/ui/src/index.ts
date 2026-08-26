/**
 * the app's single import path into the design system: the 40 published
 * components (re-exported from `./design-system`), plus the surface the app
 * needs that the design agent must never be handed —
 * `Form`/`RmxForm`/`useRmxForm` bind to react-router,
 * `FloatingField`/`FloatingInput` are the second field language (a property of
 * a field GROUP, never a control variant), and the rest are helpers that only
 * look like components to an extractor reading names off a barrel.
 *
 * two families are namespaced instead of flattened here — `./tooltip` and
 * `./hover-card` both export `Arrow` and `Content`, and a flat barrel can only
 * hold one of each. `./masks` is a namespace pair (`dollar`, `ein`) for the
 * same reason.
 */

export type { FileOutput, FileSpec } from "./components/file-dropzone/types";
export {
  FloatingField,
  FloatingInput,
} from "./components/form/floating-field";
export { Form, RmxForm, useRmxForm } from "./components/form/form";
export { ornament_end_cls } from "./components/form/ornament";
export type { Classes as FormClasses } from "./components/form/types";
export type { PayoutStatusType } from "./components/payout-status";
export type { IPrompt } from "./components/prompt/prompt";
export type { Props as ComboProps } from "./components/select/combo";
export type { Props as MultiComboProps } from "./components/select/multi-combo";
export type { Props as SelectProps } from "./components/select/select";
export type {
  AsyncSource,
  FieldProps,
  Opt,
  QuerySource,
  Source,
  StaticSource,
  SyncSource,
} from "./components/select/types";
export type { StatusProps } from "./components/status/types";
export type { ITarget, TTarget } from "./components/target";
export { to_target } from "./components/target";
export { show_toast } from "./components/toaster";
export * from "./design-system";
export type {
  ApplicationMIMEType,
  ImageMIMEType,
  MIMEType,
} from "./types/mime";
