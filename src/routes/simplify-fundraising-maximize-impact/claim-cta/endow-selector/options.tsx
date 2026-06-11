import { Combobox } from "@base-ui/react/combobox";
import use_swr from "swr/immutable";
import { Image } from "#/components/image";
import { QueryLoader } from "#/components/query-loader";
import { use_debouncer } from "#/hooks/use-debouncer";
import type { INposPage } from "@/npo";

type Props = {
  searchText: string;
};

const fields = ["id", "name", "card_img", "registration_number"] as const;
type Field = (typeof fields)[number];

const fetcher = async (path: string) =>
  fetch(path).then<INposPage<Field>>((res) => res.json());

export function Options({ searchText }: Props) {
  const [debouncedSearchText, isDebouncing] = use_debouncer(searchText, 200);

  const params = {
    query: debouncedSearchText,
    page: "1",
    claimed: "false",
    fields: fields.join(","),
  };
  const endows = use_swr(
    `/api/npos?${new URLSearchParams(params).toString()}`,
    fetcher
  );

  return (
    <Combobox.Portal>
      <Combobox.Positioner side="bottom" sideOffset={8}>
        <Combobox.Popup className="w-(--anchor-width) mt-2 z-10 bg-popover text-popover-fg shadow-lg rounded overflow-y-scroll scrollbar-thin scrollbar-thumb-ring scrollbar-track-border max-h-24">
          <QueryLoader
            queryState={{
              is_loading: endows.isLoading || isDebouncing,
              is_fetching: endows.isValidating,
              is_error: !!endows.error,
              data: endows.data?.items,
            }}
            messages={{
              loading: searchText ? "searching..." : "loading nonprofit...",
              error: "failed to get nonprofits",
              empty: searchText
                ? `${searchText} not found or already claimed`
                : "not found or already claimed",
            }}
            classes={{ container: "w-full p-2 text-muted-fg" }}
          >
            {(endowments) => (
              <Combobox.List>
                {endowments.map((endowment) => (
                  <Combobox.Item
                    className="data-selected:bg-secondary hover:bg-secondary flex gap-2 p-2"
                    key={endowment.name}
                    value={endowment}
                  >
                    <Image
                      src={endowment.card_img ?? undefined}
                      width="10"
                      className="rounded"
                    />
                    <span>{endowment.name}</span>
                  </Combobox.Item>
                ))}
              </Combobox.List>
            )}
          </QueryLoader>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  );
}
