import { type ReactNode, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { IPaginator } from "#/types/components";
import type { IPageKeyed, IPageNumbered } from "@/types/api";

type Page<T> = IPageKeyed<T> | IPageNumbered<T>;

function np(p: Page<any>): string | undefined {
  if ("page" in p) {
    const { page = 1, pages = 1 } = p || {};
    const n = page < pages ? page + 1 : undefined;
    return n?.toString();
  }
  return p.next;
}

interface Props<T, F = Page<T>> {
  /** explicit identity key — pass serialized filter/sort params so the hook
   *  reliably detects page1 changes instead of guessing from item shape */
  filter_key?: string;
  id?: string;
  classes?: string;
  page1: Page<T>;
  table: (props: IPaginator<T>) => ReactNode;
  gen_loader: (loader_fn: (href: string) => void, next: string) => () => void;
  /** map fetcher payload to Page shape — for loaders that wrap page in an envelope */
  unwrap?: (data: F) => Page<T>;
}

/** paginated table hook — always renders table, handles stale data via generation counter */
export function use_table<I, F = Page<I>>({
  table,
  page1,
  gen_loader,
  id,
  filter_key,
  classes = "",
  unwrap,
}: Props<I, F>) {
  const { state, data: raw, load } = useFetcher<F>({ key: id });
  const data = raw && unwrap ? unwrap(raw as F) : (raw as Page<I> | undefined);
  // extra items loaded via fetcher (pages 2, 3, …); page1.items used directly
  const [extra, set_extra] = useState<I[]>([]);
  // true when extra is a full replacement (e.g. fetcher search returned page 1)
  const [replaced, set_replaced] = useState(false);

  // generation counter — increments when page1 *changes* (e.g. filter switch),
  // so stale fetcher data from a previous generation is ignored.
  // skip increment on mount so the first fetcher result isn't discarded.
  const gen = useRef(0);
  const saved_gen = useRef(gen.current);
  const mounted = useRef(false);

  // fallback identity key when caller doesn't pass filter_key
  const first_id = page1.items[0]
    ? ((page1.items[0] as Record<string, unknown>).id ?? "")
    : "";
  const p1_key = filter_key ?? `${np(page1)}:${page1.items.length}:${first_id}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on data identity, not reference
  useEffect(() => {
    if (mounted.current) gen.current++;
    else mounted.current = true;
    saved_gen.current = gen.current;
    set_extra([]);
    set_replaced(false);
  }, [p1_key]);
  useEffect(() => {
    if (state !== "idle" || !data) return;
    // ignore fetcher data from a previous generation
    if (saved_gen.current !== gen.current) {
      saved_gen.current = gen.current;
      return;
    }
    // numbered pagination: page 1 means fresh search/filter — replace
    if ("page" in data && data.page === 1) {
      set_replaced(true);
      return set_extra(data.items as I[]);
    }
    set_extra((prev) => [...prev, ...data.items]);
  }, [state, data]);

  // only use fetcher's next cursor if it belongs to current generation
  const next = data && saved_gen.current === gen.current ? np(data) : np(page1);

  // when fetcher search replaced page1, show only extra; otherwise append
  const items = replaced
    ? extra
    : extra.length > 0
      ? [...page1.items, ...extra]
      : page1.items;

  const node = table({
    classes,
    items,
    load_next: next ? gen_loader(load, next) : undefined,
    disabled: state !== "idle",
    loading: state !== "idle",
  });

  return { node, loading: state !== "idle", load, items };
}
