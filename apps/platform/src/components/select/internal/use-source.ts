import type { QuerySource, SyncSource } from "../types";

export interface Resolved<T> {
  items: readonly T[];
  loading: boolean;
  error?: string;
  /** what the control's adornment should be showing */
  state: "idle" | "loading" | "error";
}

/**
 * flattens the option-source arms into the one shape the popup renders from.
 *
 * the point of the union is that a caller-owned query (SWR in a loader) and a
 * plain array are genuinely different lifecycles, not a variant flag — but
 * everything downstream of here only ever sees items + a status.
 */
export function use_source<T>(source: SyncSource<T>): Resolved<T> {
  if (!is_query(source)) {
    return { items: source, loading: false, state: "idle" };
  }
  return {
    items: source.items,
    loading: !!source.loading,
    error: source.error,
    state: source.loading ? "loading" : source.error ? "error" : "idle",
  };
}

function is_query<T>(s: SyncSource<T>): s is QuerySource<T> {
  return "items" in s;
}
