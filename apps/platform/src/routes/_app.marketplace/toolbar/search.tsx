import { SearchIcon } from "lucide-react";
import { type ChangeEventHandler, useEffect } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { use_debounce } from "#/hooks/use-debounce";
import type { EndowCardsPage } from "#/types/npo";

export function Search({ classes = "" }: { classes?: string }) {
  const [params] = useSearchParams();
  const { load } = useFetcher<EndowCardsPage>({
    key: "marketplace",
  }); //initially undefined
  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const n = new URLSearchParams(params);
    n.set("query", e.target.value);
    load(`?${n.toString()}`);
  };

  const debounced_change = use_debounce(onChange, 500);
  const url_query = params.get("query") ?? "";

  // a keystroke still inside the debounce window when the url's term changes
  // under it — "Clear all" wipes `query` — is void. left pending it fires after
  // the revalidation and refills the grid with results for a term that is in
  // neither the box nor the url. typing never changes the url, so this cancels
  // nothing a user is still in the middle of.
  // biome-ignore lint/correctness/useExhaustiveDependencies: url_query is the trigger, not a read
  useEffect(() => {
    debounced_change.cancel();
  }, [url_query, debounced_change]);

  return (
    <div
      className={`${classes} field-input-container flex gap-2 items-center relative`}
    >
      <SearchIcon
        size={20}
        className="absolute origin-center left-3 top-1/2 -translate-y-1/2"
      />
      <input
        // keyed on the url term so a change made while the marketplace stays
        // mounted reaches the box. typing never writes to the url (the handler
        // loads a fetcher), so the key holds still under the keystrokes it
        // would otherwise remount on.
        key={url_query}
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
