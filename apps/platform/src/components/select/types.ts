import type { ReactNode } from "react";

/** how the module reads an arbitrary option type. string options need none of it. */
export interface Opt<T> {
  /**
   * stable id; default: identity for `T extends string`.
   *
   * named `item_key`, not the conventional `key`: `key` is reserved in JSX, so React
   * strips it from props before the component ever sees it and the default
   * silently takes over — `String(v)` on an object, at every call site with a
   * non-string option type.
   */
  item_key?: (v: T) => string;
  /**
   * input display text + typeahead + accessible name (ark's `itemToString`);
   * default: identity for `T extends string`.
   *
   * named `item_text` rather than the conventional `label`: every component takes
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
/**
 * options the module fetches itself, per keystroke.
 *
 * `search` OWNS the matching: it is handed the query and returns the rows for
 * it, and nothing filters them again on this side. `/api/tokens` and
 * `/api/tickers` are fuzzy over fields the row's own text doesn't carry — a
 * ticker found by company name has only its symbol as `item_text` — so a
 * second pass here would drop the rows the server just matched.
 *
 * the signal is aborted the moment a later search fires; a request that loses
 * that race never reaches state.
 */
export type AsyncSource<T> = {
  search: (q: string, signal: AbortSignal) => Promise<readonly T[]>;
};

/** where options come from — the only place option-lifecycle varies. */
export type Source<T> = StaticSource<T> | QuerySource<T> | AsyncSource<T>;

/**
 * the arms that need no state machine: the caller already holds the options,
 * or already holds the query that fetches them.
 *
 * kept as a name of its own because the difference is what `internal/use-source`
 * branches on — a sync source's `loading` means the list isn't there yet and
 * the control has nothing to offer, while an async one's means a keystroke is
 * in flight and the control must stay usable.
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
