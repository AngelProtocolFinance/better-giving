import { Combobox } from "@base-ui/react/combobox";
import { SearchIcon, X } from "lucide-react";
import { type RefObject, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import countries from "#/assets/countries/all.json";
import { toParsed, toRaw } from "#/pages/marketplace/helpers";

export default function Countries() {
  const [params, setParams] = useSearchParams();
  const { countries: pcountries = [], ...p } = toParsed(params);

  const [searchText, setSearchText] = useState("");
  const container_ref = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(
    () =>
      countries
        .map((c) => c.name)
        .filter((c) => c.toLowerCase().includes(searchText.toLowerCase())),
    [searchText]
  );

  function handleChange(values: string[]) {
    setParams(toRaw({ ...p, countries: values }), {
      replace: true,
      preventScrollReset: true,
    });
  }

  return (
    <Combobox.Root
      multiple
      items={filteredOptions}
      filter={null}
      value={pcountries}
      onValueChange={handleChange}
      onInputValueChange={(q) => setSearchText(q)}
      itemToStringLabel={(v) => v}
    >
      <div ref={container_ref} className="relative">
        <Combobox.InputGroup className="flex items-center field-input justify-between p-1 focus-within:border-ring">
          <div className="flex flex-wrap gap-2 h-full">
            {pcountries.map((opt) => (
              <SelectedOption
                key={opt}
                option={opt}
                selected={pcountries}
                onChange={handleChange}
              />
            ))}

            <div className="inline-flex p-1 items-center gap-2 bg-muted text-muted-fg rounded">
              <SearchIcon size={18} />
              <Combobox.Input className="appearance-none bg-transparent focus:outline-hidden" />
            </div>
          </div>
        </Combobox.InputGroup>
        <Combobox.Portal container={container_ref as RefObject<HTMLDivElement>}>
          <Combobox.Positioner side="bottom" sideOffset={4}>
            <Combobox.Popup className="rounded text-sm border z-10 bg-popover w-(--anchor-width) max-h-[10rem] overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
              {filteredOptions.length > 0 && (
                <Combobox.List>
                  {filteredOptions.map((name) => (
                    <Combobox.Item
                      key={name}
                      value={name}
                      className={optionStyle}
                    >
                      {name}
                    </Combobox.Item>
                  ))}
                </Combobox.List>
              )}
              {filteredOptions.length === 0 && (
                <p className="text-muted-fg text-sm px-4 py-2">
                  No options found
                </p>
              )}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </div>
    </Combobox.Root>
  );
}

type SelectedProps = {
  option: string;
  selected: string[];
  onChange(value: string[]): void;
};

const optionStyle =
  "px-4 py-2 text-sm data-selected:bg-secondary hover:bg-accent";

function SelectedOption({ selected, onChange, option }: SelectedProps) {
  const handleRemove = (value: string) =>
    onChange(selected.filter((s) => s !== value));

  return (
    <div className="flex gap-2 items-center text-xs pt-1 pb-[.3rem] px-2 bg-muted border rounded">
      <span className="max-w-[200px] truncate">{option}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          handleRemove(option);
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
