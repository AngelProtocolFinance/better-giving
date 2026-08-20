import { useEffect, useRef, useState } from "react";
import { status_text } from "../classes";
import type { AsyncSource, QuerySource, Source } from "../types";

export interface Resolved<T> {
  items: readonly T[];
  loading: boolean;
  error?: string;
  /** what the control's adornment should be showing */
  state: "idle" | "loading" | "error";
  /**
   * the source answered the query itself, so nothing on this side answers it
   * again. two things ride on it and both are wrong the other way: a second,
   * client-side pass over `items` would drop every row the server matched on
   * something the row's own text doesn't contain, and a `loading` that means
   * one request in flight — not a list that isn't there yet — must never take
   * the control away from the donor mid-keystroke.
   */
  searched: boolean;
}

/** the two moments an async source has to hear about; inert for the rest. */
export interface Notify {
  /** the popup opened — the empty query is what fills the list before anything is typed */
  on_open: () => void;
  /** the donor typed */
  on_query: (q: string) => void;
}

type Search<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; msg: string }
  | { status: "ok"; data: readonly T[] };

/** one identity for "no rows", so the memos downstream of `items` hold */
const none: readonly never[] = [];

/**
 * flattens the option-source arms into the one shape the popup renders from.
 *
 * the point of the union is that a caller-owned query (SWR in a loader), a
 * plain array and a per-keystroke fetch are genuinely different lifecycles,
 * not a variant flag — but everything downstream of here only ever sees items
 * + a status. the async arm's abort/loading/error machine lives here for the
 * same reason: `internal/popup`, `internal/status` and the caller's adornment
 * never learn that a source can fetch.
 */
export function use_source<T>(source: Source<T>): Resolved<T> & Notify {
  const [search, set_search] = useState<Search<T>>({ status: "idle" });
  const inflight = useRef<AbortController | null>(null);

  // the donation form's methods are tabs: switching away mid-search unmounts
  // the control, and the answer has nowhere left to land.
  useEffect(() => () => inflight.current?.abort(), []);

  /**
   * every fire supersedes the one before it. the responses can land in any
   * order, so the `aborted` checks are what keep a slow answer to an abandoned
   * query from overwriting a fast answer to the current one.
   */
  const fire = (q: string) => {
    if (!is_async(source)) return;
    const ctrl = new AbortController();
    inflight.current?.abort();
    inflight.current = ctrl;
    set_search({ status: "loading" });

    source
      .search(q, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        set_search({ status: "ok", data });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        set_search({ status: "error", msg: status_text.error });
      });
  };

  const notify: Notify = {
    on_open: () => fire(""),
    on_query: (q) => {
      if (q) return fire(q);
      // an emptied box is not a query for everything — it drops back to the
      // selection alone, the way the control looks before it is ever opened.
      // the answer to what was just deleted would otherwise land on top of it.
      inflight.current?.abort();
      inflight.current = null;
      set_search({ status: "idle" });
    },
  };

  if (is_async(source)) {
    return {
      items: search.status === "ok" ? search.data : none,
      loading: search.status === "loading",
      error: search.status === "error" ? search.msg : undefined,
      state:
        search.status === "loading"
          ? "loading"
          : search.status === "error"
            ? "error"
            : "idle",
      searched: true,
      ...notify,
    };
  }

  if (!is_query(source)) {
    return {
      items: source,
      loading: false,
      state: "idle",
      searched: false,
      ...notify,
    };
  }

  return {
    items: source.items,
    loading: !!source.loading,
    error: source.error,
    state: source.loading ? "loading" : source.error ? "error" : "idle",
    searched: false,
    ...notify,
  };
}

function is_async<T>(s: Source<T>): s is AsyncSource<T> {
  return "search" in s;
}

function is_query<T>(s: Source<T>): s is QuerySource<T> {
  return "items" in s;
}
