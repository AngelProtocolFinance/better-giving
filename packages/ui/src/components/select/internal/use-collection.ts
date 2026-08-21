import { createListCollection } from "@ark-ui/react/combobox";
import { useMemo } from "react";

interface Args<T> {
  /** the rows the current query produced */
  items: readonly T[];
  /** what is selected right now, in the caller's terms */
  selected: readonly T[];
  key: (v: T) => string;
  label: (v: T) => string;
}

/**
 * the collection, with every selected item guaranteed present.
 *
 * zag resolves a value's display text through the collection
 * (`collection.stringifyMany`), so a selected item that a filter dropped has no
 * label left to show — the input goes blank and never comes back.
 *
 * the rehydrated item is returned in `rows` as well as the collection, not just
 * the collection: an entry zag can arrow onto but the popup never renders would
 * be a phantom row that scrolls nowhere.
 */
export function use_collection<T>(p: Args<T>) {
  const { items, selected, key, label } = p;
  return useMemo(() => {
    const seen = new Set<string>();
    const rows: T[] = [];
    for (const v of items) {
      seen.add(key(v));
      rows.push(v);
    }
    for (const v of selected) {
      const k = key(v);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      rows.push(v);
    }
    return {
      rows,
      collection: createListCollection({
        items: rows,
        itemToValue: key,
        itemToString: label,
      }),
    };
  }, [items, selected, key, label]);
}
