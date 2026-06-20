import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { SearchIcon, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import countries from "#/assets/countries/all.json";
import { toParsed, toRaw } from "#/pages/marketplace/helpers";

export default function Countries() {
  const [params, set_params] = useSearchParams();
  const { countries: pcountries = [], ...p } = toParsed(params);

  const { contains } = useFilter({ sensitivity: "base" });
  const [query, set_query] = useState("");
  const container_ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const names = countries.map((c) => c.name);
    return query ? names.filter((n) => contains(n, query)) : names;
  }, [query, contains]);

  const collection = useMemo(
    () => createListCollection({ items: filtered }),
    [filtered]
  );

  function handle_change(values: string[]) {
    set_params(toRaw({ ...p, countries: values }), {
      replace: true,
      preventScrollReset: true,
    });
  }

  return (
    <Combobox.Root
      multiple
      collection={collection}
      value={pcountries}
      onValueChange={(e) => handle_change(e.value)}
      onInputValueChange={(e) => set_query(e.inputValue)}
      positioning={{ placement: "bottom", gutter: 4 }}
      openOnClick
    >
      <div ref={container_ref} className="relative">
        <Combobox.Control className="flex items-center field-input justify-between p-1 focus-within:border-ring">
          <div className="flex flex-wrap gap-2 h-full">
            {pcountries.map((opt) => (
              <SelectedOption
                key={opt}
                option={opt}
                selected={pcountries}
                onChange={handle_change}
              />
            ))}

            <div className="inline-flex p-1 items-center gap-2 bg-muted text-muted-fg rounded">
              <SearchIcon size={18} />
              <Combobox.Input className="appearance-none bg-transparent focus:outline-hidden" />
            </div>
          </div>
        </Combobox.Control>
        <Portal container={container_ref}>
          <Combobox.Positioner>
            <Combobox.Content className="rounded text-sm border z-10 bg-popover w-(--reference-width) max-h-40 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
              {filtered.length > 0 ? (
                filtered.map((name) => (
                  <Combobox.Item
                    key={name}
                    item={name}
                    className={option_style}
                  >
                    {name}
                  </Combobox.Item>
                ))
              ) : (
                <p className="text-muted-fg text-sm px-4 py-2">
                  No options found
                </p>
              )}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </div>
    </Combobox.Root>
  );
}

type SelectedProps = {
  option: string;
  selected: string[];
  onChange(value: string[]): void;
};

const option_style =
  "px-4 py-2 text-sm data-[state=checked]:bg-secondary data-highlighted:bg-accent hover:bg-accent";

function SelectedOption({ selected, onChange, option }: SelectedProps) {
  const handle_remove = (value: string) =>
    onChange(selected.filter((s) => s !== value));

  return (
    <div className="flex gap-2 items-center text-xs pt-1 pb-[.3rem] px-2 bg-muted border rounded">
      <span className="max-w-50 truncate">{option}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          handle_remove(option);
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
