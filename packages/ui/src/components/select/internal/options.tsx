import { Combobox } from "@ark-ui/react/combobox";
import type { ReactNode } from "react";
import { option_cls } from "../classes";

interface IOptions<T> {
  items: readonly T[];
  item_key: (v: T) => string;
  render: (v: T) => ReactNode;
  /**
   * drawn on the selected row only — ark hides it on the rest, so this never
   * needs a `values.includes()` scan per row.
   */
  indicator?: ReactNode;
  classes?: string;
}

/**
 * the option rows for the combobox machine. owning `Combobox.Item` here is what
 * keeps `@ark-ui/react/combobox` out of the call sites: they hand over a
 * `render` for the row's body and nothing else.
 */
export function Options<T>(p: IOptions<T>) {
  return (
    <>
      {p.items.map((v) => (
        <Combobox.Item
          key={p.item_key(v)}
          item={v}
          className={`${option_cls} ${p.classes ?? ""}`}
        >
          {p.render(v)}
          {p.indicator && (
            <Combobox.ItemIndicator className="ml-auto shrink-0">
              {p.indicator}
            </Combobox.ItemIndicator>
          )}
        </Combobox.Item>
      ))}
    </>
  );
}
