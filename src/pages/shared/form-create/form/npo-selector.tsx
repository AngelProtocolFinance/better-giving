import { Combobox } from "@base-ui/react/combobox";
import { useState } from "react";
import { DrawerIcon } from "#/components/icon";
import { Info, LoadingStatus } from "#/components/status";
import { use_debounce } from "#/hooks/use-debounce";
import type { INpoOpt } from "../api";

interface Props {
  classes?: string;
  q: string;
  on_q_change: (q: string) => void;
  on_change: (opt: INpoOpt) => void;
  opts: "loading" | (string & {}) | INpoOpt[];
  value: INpoOpt | undefined;
}

export function NpoSelector(p: Props) {
  const [is_open, set_is_open] = useState(false);

  const fetched = Array.isArray(p.opts) ? p.opts : [];
  // ensure selected value is present in items so Combobox can match it (esp. while loading)
  const items =
    p.value && !fetched.some((o) => o.id === p.value?.id)
      ? [p.value, ...fetched]
      : fetched;

  const debounced_q_change = use_debounce(p.on_q_change, 500);
  return (
    <Combobox.Root
      value={p.value ?? null}
      onValueChange={(x) =>
        // strip extra fields from api items — RHF's field.onChange treats
        // any object with a `target` property as a synthetic event, so
        // leaking the raw npo object (which has a `target` column) causes
        // setValue to receive undefined.
        x && p.on_change({ id: x.id, name: x.name })
      }
      onOpenChange={(open) => set_is_open(open)}
      onInputValueChange={(next, details) => {
        // skip refetch when input mutates due to selection/clear/programmatic
        if (details.reason !== "input-change") return;
        debounced_q_change(next);
      }}
      items={items}
      filter={null}
      itemToStringLabel={(v) => v.name}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
    >
      <div className="relative">
        <Combobox.Input
          name="q"
          placeholder="Search for an organization..."
          className="field-input w-full"
        />

        <Combobox.Trigger className="absolute top-4 right-4">
          <DrawerIcon is_open={is_open} size={20} />
        </Combobox.Trigger>

        <Combobox.Portal>
          <Combobox.Positioner className="z-51" side="bottom" sideOffset={4}>
            <Combobox.Popup className="max-h-60 mt-2 w-(--anchor-width) overflow-y-scroll scrollbar-thin scrollbar-thumb-ring scrollbar-track-border bg-popover text-popover-fg shadow-lg rounded">
              {p.opts === "loading" ? (
                <LoadingStatus classes="w-full text-sm p-2">
                  Loading options..
                </LoadingStatus>
              ) : typeof p.opts === "string" ? (
                <Info classes="w-full text-sm p-2">{p.opts} not found</Info>
              ) : (
                <Combobox.List>
                  {p.opts.map((opt) => (
                    <Combobox.Item
                      className="data-selected:bg-secondary hover:text-primary flex gap-2 p-2 text-sm"
                      key={opt.id}
                      value={opt}
                    >
                      {opt.name}
                    </Combobox.Item>
                  ))}
                </Combobox.List>
              )}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </div>
    </Combobox.Root>
  );
}
