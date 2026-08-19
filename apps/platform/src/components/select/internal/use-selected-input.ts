import { useComboboxContext } from "@ark-ui/react/combobox";
import { useEffect } from "react";

/**
 * closes zag's one input-text gap, WITHOUT controlling `inputValue`.
 *
 * verified against @zag-js/combobox 1.41.2 (`combobox.machine.js`) and in
 * chromium (`combo.test.tsx` → "input text follows the value"):
 *
 * - an external value change (RHF `reset()`/`setValue`) already re-syncs the
 *   input text on its own: `watch()` tracks `context.hash("value")` →
 *   `syncSelectedItems` → `inputValue = collection.stringifyMany(value)` under
 *   the single-select default `selectionBehavior: "replace"`. controlling
 *   `inputValue` is what DISABLES that, which is why every wrapper that did so
 *   had to hand-roll the sync back.
 * - clicking outside reverts typed-but-unselected text (`LAYER.INTERACT_OUTSIDE`,
 *   guard `isCustomValue && !allowCustomValue` → `revertInputValue`).
 * - Escape and a trigger click do NOT revert — `LAYER.ESCAPE` only calls
 *   `syncInputValue` under `inputBehavior: "autocomplete"`. those two close
 *   the popup leaving a query in the box that no longer matches the value.
 *
 * this covers exactly those two. the trigger-click path is asserted in
 * `combo.test.tsx`; Escape is not, because zag routes it through the
 * dismissable layer and that listener never fires under headless chromium —
 * the popup stays open there, so the case is unreachable from a test. mount it only when custom values are NOT
 * allowed, matching zag's own guard — with `allowCustomValue` the typed text
 * IS the value and reverting it would delete the user's input.
 *
 * all of the above needs the selected item to still be IN the collection:
 * `stringifyMany` resolves through it, so a selected item filtered out of the
 * list has no label left to restore. that guarantee is `use-collection`'s.
 */
export function SelectedInputSync() {
  const api = useComboboxContext();

  useEffect(() => {
    if (api.open) return;
    if (api.inputValue === api.valueAsString) return;
    api.setInputValue(api.valueAsString);
  }, [api]);

  return null;
}
