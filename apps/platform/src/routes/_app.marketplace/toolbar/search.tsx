import { SearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  type Location,
  useLocation,
  useNavigation,
  useNavigationType,
  useSearchParams,
} from "react-router";
import { use_debounce } from "#/hooks/use-debounce";
import { toRaw } from "#/pages/marketplace/helpers";

/** location state marking a navigation as this box's own write. compared by
 *  field: browser history structured-clones state, so identity is lost. */
const OWN_WRITE = { marketplace_search: true };
const is_own_write = (l: Location) => l.state?.marketplace_search === true;

/** the url active-filters' Clear all lands on: the one writer allowed to
 *  discard a term the box holds but the url doesn't yet */
const CLEARED = `?${toRaw({ query: "", page: 1 })}`;

/** true while the box's own write is loading */
export function use_search_pending() {
  const navigation = useNavigation();
  return navigation.state !== "idle" && is_own_write(navigation.location);
}

export function Search({ classes = "" }: { classes?: string }) {
  const [params, set_params] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigation();
  const navigation_type = useNavigationType();
  const url_query = params.get("query") ?? "";
  const input = useRef<HTMLInputElement>(null);

  const write = (term: string) => {
    const n = new URLSearchParams(params);
    if (term) n.set("query", term);
    else n.delete("query");
    n.delete("page");
    set_params(n, {
      // a visit's first term gets its own entry, so Back returns to the
      // unfiltered list; refining or clearing that term doesn't
      replace: !term || params.has("query"),
      preventScrollReset: true,
      state: OWN_WRITE,
    });
  };

  const debounced_write = use_debounce((term: string) => {
    // the write is a navigation and would cut off one still loading, built
    // from a url that one is about to replace. its landing writes the term.
    if (navigation.state !== "idle" && !is_own_write(navigation.location)) {
      return;
    }
    write(term);
  }, 500);

  // other writers build from the committed url, blind to a term the box holds
  // but hasn't landed. one that carried the old term forward gets the box's
  // term written over it; one that changed the term, Clear all and back/forward
  // set the box to the url and void a keystroke still debouncing.
  const landed = useRef({ key: location.key, query: url_query });
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.key is the trigger — a landed navigation, not a read
  useEffect(() => {
    const prev = landed.current;
    // mount: the box may hold text typed before hydration
    if (prev.key === location.key) return;
    landed.current = { key: location.key, query: url_query };
    const box = input.current;
    if (!box) return;

    // history restores state on POP, so an entry the box wrote reads as own
    const pop = navigation_type === "POP";
    if (!pop && is_own_write(location)) return;

    if (pop || location.search === CLEARED || url_query !== prev.query) {
      debounced_write.cancel();
      box.value = url_query;
      return;
    }
    if (box.value !== url_query) {
      debounced_write.cancel();
      write(box.value);
    }
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
