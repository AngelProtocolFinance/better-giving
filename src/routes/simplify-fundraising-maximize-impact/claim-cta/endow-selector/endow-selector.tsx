import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import { SearchIcon } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import use_swr from "swr/immutable";
import { DrawerIcon } from "#/components/icon";
import { Image } from "#/components/image";
import { QueryLoader } from "#/components/query-loader";
import { use_debouncer } from "#/hooks/use-debouncer";
import type { EndowmentOption } from "#/types/npo";
import type { INposPage } from "@/npo";

interface Props {
  disabled?: boolean;
  value: EndowmentOption;
  onChange: (endowment: EndowmentOption) => void;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

const fields = ["id", "name", "card_img", "registration_number"] as const;
type Field = (typeof fields)[number];

const fetcher = async (path: string) =>
  fetch(path).then<INposPage<Field>>((res) => res.json());

export function EndowSelector(props: Props) {
  const [search_text, set_search_text] = useState("");
  const [is_open, set_is_open] = useState(false);
  const [debounced_search, is_debouncing] = use_debouncer(search_text, 200);

  const params = {
    query: debounced_search,
    page: "1",
    claimed: "false",
    fields: fields.join(","),
  };
  const endows = use_swr(
    `/api/npos?${new URLSearchParams(params).toString()}`,
    fetcher
  );

  const items = endows.data?.items ?? [];
  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToValue: (i) => i.id.toString(),
        itemToString: (i) => i.name,
      }),
    [items]
  );

  return (
    <Combobox.Root
      disabled={props.disabled}
      collection={collection}
      value={props.value?.id ? [props.value.id.toString()] : []}
      onValueChange={(e) => {
        const x = e.items[0] as EndowmentOption | undefined;
        if (x) props.onChange(x);
      }}
      onInputValueChange={(e) => {
        if (e.reason !== "input-change") return;
        set_search_text(e.inputValue);
      }}
      onOpenChange={(e) => set_is_open(e.open)}
      positioning={{ placement: "bottom", gap: 8 }}
      openOnClick
    >
      <Combobox.Control className="relative bg-card rounded">
        <SearchIcon
          className="absolute top-1/2 -translate-y-1/2 left-4"
          size={16}
        />
        <Combobox.Input
          ref={props.ref}
          id="claim-npo-input"
          placeholder="Search by name or EIN"
          aria-label="Search nonprofit"
          className="px-10 w-full focus:outline-none p-3 rounded"
        />

        <Combobox.Trigger className="absolute top-1/2 -translate-y-1/2 right-4">
          <DrawerIcon is_open={is_open} size={16} />
        </Combobox.Trigger>

        {props.error && (
          <span className="field-error" data-error>
            {props.error}
          </span>
        )}

        <Portal>
          <Combobox.Positioner>
            <Combobox.Content className="w-(--reference-width) z-10 bg-popover text-popover-fg shadow-lg rounded overflow-y-scroll overscroll-contain scrollbar-thin scrollbar-thumb-ring scrollbar-track-border max-h-60">
              <QueryLoader
                queryState={{
                  is_loading: endows.isLoading || is_debouncing,
                  is_fetching: endows.isValidating,
                  is_error: !!endows.error,
                  data: endows.data?.items,
                }}
                messages={{
                  loading: search_text
                    ? "searching..."
                    : "loading nonprofit...",
                  error: "failed to get nonprofits",
                  empty: search_text
                    ? `${search_text} not found or already claimed`
                    : "not found or already claimed",
                }}
                classes={{ container: "w-full p-2 text-muted-fg text-sm" }}
              >
                {(endowments) => (
                  <>
                    {endowments.map((endowment) => (
                      <Combobox.Item
                        className="data-[state=checked]:bg-secondary data-highlighted:bg-secondary hover:bg-secondary flex gap-2 p-2"
                        key={endowment.id}
                        item={endowment}
                      >
                        <Image
                          src={endowment.card_img ?? undefined}
                          width="10"
                          className="rounded"
                        />
                        <span>{endowment.name}</span>
                      </Combobox.Item>
                    ))}
                  </>
                )}
              </QueryLoader>
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Control>
    </Combobox.Root>
  );
}
