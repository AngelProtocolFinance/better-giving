import { SearchIcon } from "lucide-react";
import { type ChangeEventHandler, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { use_debounce } from "#/hooks/use-debounce";

export function Search({ classes = "" }: { classes?: string }) {
  const [params, set_params] = useSearchParams();
  const url_query = params.get("query") ?? "";
  const input = useRef<HTMLInputElement>(null);
  // the term this box last put in the url. the url commits only once the
  // loader lands, so by then the box may already hold more letters — its own
  // write arriving must not be mistaken for a change made elsewhere.
  const written = useRef(url_query);

  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const term = e.target.value;
    const n = new URLSearchParams(params);
    if (term) n.set("query", term);
    else n.delete("query");
    written.current = term;
    set_params(n, { replace: true, preventScrollReset: true });
  };

  const debounced_change = use_debounce(onChange, 500);

  // a term that changed under the box — "Clear all", back/forward — replaces
  // what is typed, and a keystroke still inside the debounce window is void:
  // left pending it would put the typed term back in the url after the clear.
  useEffect(() => {
    if (url_query === written.current) return;
    written.current = url_query;
    debounced_change.cancel();
    if (input.current) input.current.value = url_query;
  }, [url_query, debounced_change]);

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
