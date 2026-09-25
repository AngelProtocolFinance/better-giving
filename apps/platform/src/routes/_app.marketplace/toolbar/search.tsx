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
const term_of = (l: Location) =>
  new URLSearchParams(l.search).get("query") ?? "";
const write_id = (l: Location): string | undefined =>
  (l.state as IWriteState | null)?.marketplace_search;

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

  /** set by a clear that steps back, until the step lands */
  const stepping_back = useRef(false);

  const write = (term: string, { replace }: { replace?: boolean } = {}) => {
    const current = router.state.location;
    const pushed = (current.state as IWriteState | null)?.marketplace_pushed;
    // the entry is the search; clearing it returns to the list it was pushed
    // over rather than stacking a second copy of that list
    if (!term && pushed) {
      stepping_back.current = true;
      navigate(-1);
      return;
    }
    const n = new URLSearchParams(current.search);
    // a term onto a url without one is a new search and gets its own entry;
    // refining it replaces
    const push = replace === undefined ? !!term && !n.has("query") : !replace;
    if (term) n.set("query", term);
    else n.delete("query");
    n.delete("page");
    const id = crypto.randomUUID();
    in_flight.current = id;
    const state: IWriteState = { marketplace_search: id };
    if (push || pushed) state.marketplace_pushed = true;
    set_params(n, { replace: !push, preventScrollReset: true, state });
  };

  const debounced_write = use_debounce((term: string) => {
    const { navigation, location } = router.state;
    const loading = navigation.state !== "idle";
    // the write is a navigation and would cut off one still loading, built
    // from a url that one is about to replace. its landing writes the term.
    if (loading && !is_own(navigation.location)) return;
    // the url it would write is already there or on its way
    if (term === term_of(loading ? navigation.location : location)) return;
    write(term);
  }, 500);

  // other writers build from the committed url, blind to a term the box holds
  // but hasn't landed. one that carried the old term forward gets the box's
  // term written over it, replacing: it repairs that landing, it isn't a new
  // search. one that changed the term, Clear all, and back/forward instead set
  // the box to the url and void a keystroke still debouncing. the clear's own
  // step back keeps what was typed while it loaded.
  const landed = useRef({ key: location.key, query: url_query });
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.key is the trigger — a landed navigation, not a read
  useEffect(() => {
    const prev = landed.current;
    // mount: the box may hold text typed before hydration
    if (prev.key === location.key) return;
    landed.current = { key: location.key, query: url_query };
    const box = input.current;
    if (!box) return;

    if (is_own(location)) {
      in_flight.current = null;
      return;
    }
    const stepped_back = stepping_back.current;
    stepping_back.current = false;
    const pop = navigation_type === "POP";

    if (
      !stepped_back &&
      (pop || is_clear_all(location) || url_query !== prev.query)
    ) {
      debounced_write.cancel();
      box.value = url_query;
      return;
    }
    if (box.value === url_query) return;
    // a click since this landing already moved on; its landing writes the term
    const now = router.state;
    if (now.navigation.state !== "idle" || now.location.key !== location.key) {
      return;
    }
    debounced_write.cancel();
    write(box.value, { replace: stepped_back ? undefined : true });
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
