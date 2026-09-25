import { SearchIcon } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import {
  type Location,
  UNSAFE_DataRouterContext,
  useLocation,
  useNavigate,
  useNavigation,
  useNavigationType,
  useSearchParams,
} from "react-router";
import { use_debounce } from "#/hooks/use-debounce";

/** location state on the box's writes. history keeps it and hands it back
 *  on back/forward, so only the id of the write in flight marks one as own. */
interface IWriteState {
  marketplace_search: string;
  /** the entry began as this box's push, so the one behind it is the list
   *  the search started from */
  marketplace_pushed?: true;
}
const pushed_of = (l: Location) =>
  (l.state as IWriteState | null)?.marketplace_pushed === true;
const term_of = (l: Location) =>
  new URLSearchParams(l.search).get("query") ?? "";
const write_id = (l: Location): string | undefined =>
  (l.state as IWriteState | null)?.marketplace_search;
/** same keys and values in any key order: a shared link spells `,` raw where
 *  `URLSearchParams` writes `%2C` */
const same_params = (a: string, b: string) => {
  const x = new URLSearchParams(a);
  const y = new URLSearchParams(b);
  x.sort();
  y.sort();
  return x.toString() === y.toString();
};

/** location state Clear all navigates with: the one writer allowed to
 *  discard a term the box holds but the url doesn't yet */
export const CLEAR_ALL = { marketplace_clear: true };
const is_clear_all = (l: Location) => l.state?.marketplace_clear === true;

/** true while a navigation onto an entry the box wrote is loading: its own
 *  write, or back/forward onto one */
export function use_search_pending() {
  const navigation = useNavigation();
  return navigation.state !== "idle" && !!write_id(navigation.location);
}

/** the router's state as of now, off `UNSAFE_DataRouterContext`:
 *  `useNavigation` renders it in a transition, which lags the click that
 *  started a navigation. */
function use_live_router() {
  const ctx = useContext(UNSAFE_DataRouterContext);
  if (!ctx) throw new Error("Search renders under a data router");
  return ctx.router;
}

export function Search({ classes = "" }: { classes?: string }) {
  const [params, set_params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const router = use_live_router();
  const navigation_type = useNavigationType();
  const url_query = params.get("query") ?? "";
  const input = useRef<HTMLInputElement>(null);
  /** the id of the box's latest write, until it lands */
  const in_flight = useRef<string | null>(null);
  const is_own = (l: Location) =>
    in_flight.current !== null && write_id(l) === in_flight.current;

  /** the current entry began as the box's push. other writers replace it
   *  without the box's state, so this outlives the marker on their replaces. */
  const on_search = useRef(pushed_of(location));
  /** where a clear that steps back meant to land, until the step lands */
  const stepping_back = useRef<{ pathname: string; search: string } | null>(
    null
  );
  /** the step's landing is being replaced with the filters the step meant;
   *  a term typed meanwhile waits for that replace, then pushes */
  const repairing = useRef(false);

  const write = (term: string, { replace }: { replace?: boolean } = {}) => {
    const current = router.state.location;
    const n = new URLSearchParams(current.search);
    // a term onto a url without one is a new search and gets its own entry;
    // refining it replaces
    const push = replace === undefined ? !!term && !n.has("query") : !replace;
    if (term) n.set("query", term);
    else n.delete("query");
    n.delete("page");
    // the entry is the search; clearing it returns to the list it was pushed
    // over rather than stacking a second copy of that list
    if (!term && on_search.current) {
      const search = n.toString();
      stepping_back.current = {
        pathname: current.pathname,
        search: search ? `?${search}` : "",
      };
      navigate(-1);
      return;
    }
    const id = crypto.randomUUID();
    in_flight.current = id;
    const state: IWriteState = { marketplace_search: id };
    if (push || on_search.current) state.marketplace_pushed = true;
    set_params(n, { replace: !push, preventScrollReset: true, state });
  };

  const debounced_write = use_debounce((term: string) => {
    const { navigation, location } = router.state;
    const loading = navigation.state !== "idle";
    // the write is a navigation and would cut off one still loading, built
    // from a url that one is about to replace. its landing writes the term.
    if (loading && !is_own(navigation.location)) return;
    // a write now would cut off the repair, leaving the step's landing stale
    if (loading && repairing.current) return;
    // the url it would write is already there or on its way
    if (term === term_of(loading ? navigation.location : location)) return;
    write(term);
  }, 500);

  // other writers build from the committed url, blind to a term the box holds
  // but hasn't landed. one that carried the old term forward gets the box's
  // term written over it, replacing: it repairs that landing, it isn't a new
  // search. one that changed the term, Clear all, and back/forward instead set
  // the box to the url and void a keystroke still debouncing. the clear's own
  // step back keeps what was typed while it loaded, and the filters changed
  // since the push.
  const landed = useRef({ key: location.key, query: url_query });
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.key is the trigger — a landed navigation, not a read
  useEffect(() => {
    const prev = landed.current;
    // mount: the box may hold text typed before hydration
    if (prev.key === location.key) return;
    landed.current = { key: location.key, query: url_query };
    const box = input.current;
    if (!box) return;
    const repaired = repairing.current;
    repairing.current = false;
    // a click since this landing already moved on; its landing writes the term
    const now = router.state;
    const moved_on =
      now.navigation.state !== "idle" || now.location.key !== location.key;

    const own = is_own(location);
    // a foreign replace keeps the entry's place in history, and so what it
    // began as
    if (own || navigation_type !== "REPLACE") {
      on_search.current = pushed_of(location);
    }
    if (own) {
      in_flight.current = null;
      // the list the step meant is in place; a term typed during the step is
      // a new search over it
      if (repaired && box.value !== url_query && !moved_on) {
        debounced_write.cancel();
        write(box.value);
      }
      return;
    }
    const step = stepping_back.current;
    stepping_back.current = null;
    const pop = navigation_type === "POP";

    if (!step && (pop || is_clear_all(location) || url_query !== prev.query)) {
      debounced_write.cancel();
      box.value = url_query;
      return;
    }
    // the entry behind the search predates the filters changed on the
    // search's own entry, which stay changed
    if (
      step &&
      !moved_on &&
      (location.pathname !== step.pathname ||
        !same_params(location.search, step.search))
    ) {
      const id = crypto.randomUUID();
      in_flight.current = id;
      repairing.current = true;
      debounced_write.cancel();
      navigate(step, {
        replace: true,
        preventScrollReset: true,
        state: { marketplace_search: id } satisfies IWriteState,
      });
      return;
    }
    if (box.value === url_query || moved_on) return;
    debounced_write.cancel();
    write(box.value, { replace: step ? undefined : true });
  }, [location.key]);

  return (
    <div
      className={`${classes} field-input-container flex gap-2 items-center relative`}
    >
      <SearchIcon className="absolute origin-center left-3 top-1/2 -translate-y-1/2 icon-xl" />
      <input
        ref={input}
        type="search"
        name="query"
        // uncontrolled on purpose: the handler is debounced and must not
        // re-render per keystroke
        defaultValue={url_query}
        onChange={(e) => debounced_write(e.target.value)}
        className="w-full h-full p-3 pl-10 placeholder:text-gray-11 font-medium bg-transparent outline-hidden"
        placeholder="Search organizations..."
      />
    </div>
  );
}
