import { SearchIcon } from "lucide-react";
import { type ChangeEventHandler, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router";
import { use_debounce } from "#/hooks/use-debounce";

/** location state marking a navigation as this box's own write. compared by
 *  field: browser history structured-clones state, so identity is lost. */
const OWN_WRITE = { marketplace_search: true };

export function Search({ classes = "" }: { classes?: string }) {
  const [params, set_params] = useSearchParams();
  const location = useLocation();
  const url_query = params.get("query") ?? "";
  const input = useRef<HTMLInputElement>(null);

  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const term = e.target.value;
    const n = new URLSearchParams(params);
    if (term) n.set("query", term);
    else n.delete("query");
    n.delete("page");
    set_params(n, {
      replace: true,
      preventScrollReset: true,
      state: OWN_WRITE,
    });
  };

  const debounced_change = use_debounce(onChange, 500);

  // every other writer builds from the committed url, so one landing while
  // the box's write still loads has cut that write off; comparing terms can't
  // see it when the landed url keeps the old one. any navigation not the box's
  // own resets the box to the url and voids a keystroke still debouncing —
  // left pending it would put the typed term back after a clear.
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.key is the trigger — a landed navigation, not a read
  useEffect(() => {
    if (location.state?.marketplace_search) return;
    debounced_change.cancel();
    if (input.current) input.current.value = url_query;
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
        onChange={debounced_change}
        className="w-full h-full p-3 pl-10 placeholder:text-gray-11 font-medium bg-transparent outline-hidden"
        placeholder="Search organizations..."
      />
    </div>
  );
}
