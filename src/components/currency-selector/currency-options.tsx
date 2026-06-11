import { Combobox } from "@base-ui/react/combobox";
import type { CurrencyOption } from "#/types/components";

type Props = {
  classes?: string;
  items: CurrencyOption[];
  query: string;
};

export function CurrencyOptions({ classes = "", items, query }: Props) {
  return (
    <Combobox.Portal>
      <Combobox.Positioner side="bottom" sideOffset={4} className="z-50">
        <Combobox.Popup
          className={`${classes} w-(--anchor-width) border bg-popover text-popover-fg shadow-lg rounded max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border outline-ring`}
        >
          {query && items.length === 0 && (
            <div className="p-2 text-sm text-muted-fg">{query} not found</div>
          )}
          <Combobox.List>
            {items.map((c) => (
              <Combobox.Item
                key={c.code}
                value={c}
                className="flex items-center gap-2 p-2 truncate data-selected:bg-(--form-secondary) hover:bg-(--form-secondary)"
              >
                {"name" in c
                  ? `${c.code.toUpperCase()} - ${c.name}`
                  : c.code.toUpperCase()}
              </Combobox.Item>
            ))}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  );
}
