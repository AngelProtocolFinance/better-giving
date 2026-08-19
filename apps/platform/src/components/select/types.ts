import type { ReactNode } from "react";

/** how the module reads an arbitrary option type. string options need none of it. */
export interface Opt<T> {
  /**
   * stable id; default: identity for `T extends string`.
   *
   * named `item_key`, not the spec's `key`: `key` is reserved in JSX, so React
   * strips it from props before the component ever sees it and the default
   * silently takes over — `String(v)` on an object, at every call site with a
   * non-string option type.
   */
  item_key?: (v: T) => string;
  /**
   * input display text + typeahead + accessible name (ark's `itemToString`);
   * default: identity for `T extends string`.
   *
   * named `item_text` rather than the spec's `label`: every component takes
   * `FieldProps & Opt<T>`, and `FieldProps.label` is the FIELD's label — the
   * two collide in that intersection and neither is usable after it.
   */
  item_text?: (v: T) => string;
  /** option row body; default: `item_text(v)`. renders INSIDE the module's option row. */
  render?: (v: T) => ReactNode;
}

/** options the caller already has in hand. */
export type StaticSource<T> = readonly T[];
/** options a caller-owned query is fetching (SWR, a loader). */
export type QuerySource<T> = {
  items: readonly T[];
  loading?: boolean;
  error?: string;
};
/** options the module fetches itself, per keystroke. */
export type AsyncSource<T> = {
  search: (q: string, signal: AbortSignal) => Promise<readonly T[]>;
};

/** where options come from — the only place option-lifecycle varies. */
export type Source<T> = StaticSource<T> | QuerySource<T> | AsyncSource<T>;

/**
 * the arms `internal/use-source` resolves today.
 *
 * `AsyncSource` is deliberately absent from the components' `options` prop
 * until the async pickers migrate: an abort/loading/error state machine that
 * nothing exercises is the worst kind of code to inherit. adding the arm is
 * then a type error at every call site that needs it, not a silent hole.
 */
export type SyncSource<T> = StaticSource<T> | QuerySource<T>;

export interface FieldProps {
  /** present → renders own Field.Root + top label. absent → inherits the caller's Field.Root. */
  label?: ReactNode;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  classes?: {
    container?: string;
    control?: string;
    label?: string;
    options?: string;
    option?: string;
  };
  /** css custom props re-applied to the portaled popup (donation-form accents) */
  popup_vars?: Record<string, string | undefined>;
}
