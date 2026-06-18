import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useMemo, useState } from "react";
import { DrawerIcon } from "#/components/icon";
import { Info, LoadingStatus } from "#/components/status";
import { use_debounce } from "#/hooks/use-debounce";
import type { INpoOpt } from "../api";

interface Props {
  classes?: string;
  label: string;
  required?: boolean;
  q: string;
  on_q_change: (q: string) => void;
  on_change: (opt: INpoOpt) => void;
  opts: "loading" | (string & {}) | INpoOpt[];
  value: INpoOpt | undefined;
}

export function NpoSelector(p: Props) {
  const [is_open, set_is_open] = useState(false);

  const fetched = Array.isArray(p.opts) ? p.opts : [];
  // ensure selected value is present in items so Ark can match it (esp. while loading)
  const items = useMemo(() => {
    return p.value && !fetched.some((o) => o.id === p.value?.id)
      ? [p.value, ...fetched]
      : fetched;
  }, [p.value, fetched]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToValue: (i) => i.id.toString(),
        itemToString: (i) => i.name,
      }),
    [items]
  );

  const debounced_q_change = use_debounce(p.on_q_change, 500);

  return (
    <Combobox.Root
      collection={collection}
      value={p.value ? [p.value.id.toString()] : []}
      onValueChange={(e) => {
        const x = e.items[0] as INpoOpt | undefined;
        // strip extra fields from api items — RHF's field.onChange treats
        // any object with a `target` property as a synthetic event, so
        // leaking the raw npo object (which has a `target` column) causes
        // setValue to receive undefined.
        if (x) p.on_change({ id: x.id, name: x.name });
      }}
      onOpenChange={(e) => set_is_open(e.open)}
      onInputValueChange={(e) => {
        // skip refetch when input mutates due to selection/clear/programmatic
        if (e.reason !== "input-change") return;
        debounced_q_change(e.inputValue);
      }}
      positioning={{ placement: "bottom", gap: 8 }}
      openOnClick
    >
      <Combobox.Label data-required={p.required} className="label mb-1 w-fit">
        {p.label}
      </Combobox.Label>
      <Combobox.Control className="relative">
        <Combobox.Input
          name="q"
          placeholder="Search for an organization..."
          className="field-input w-full"
        />

        <Combobox.Trigger className="absolute top-4 right-4">
          <DrawerIcon is_open={is_open} size={20} />
        </Combobox.Trigger>

        <Combobox.Positioner>
          <Combobox.Content className="z-51 max-h-60 w-(--reference-width) overflow-y-scroll overscroll-contain scrollbar-thin scrollbar-thumb-ring scrollbar-track-border bg-popover text-popover-fg shadow-lg rounded">
            {p.opts === "loading" ? (
              <LoadingStatus classes="w-full text-sm p-2">
                Loading options..
              </LoadingStatus>
            ) : typeof p.opts === "string" ? (
              <Info classes="w-full text-sm p-2">{p.opts} not found</Info>
            ) : (
              p.opts.map((opt) => (
                <Combobox.Item
                  className="data-[state=checked]:bg-secondary data-highlighted:bg-secondary hover:text-primary flex gap-2 p-2 text-sm"
                  key={opt.id}
                  item={opt}
                >
                  {opt.name}
                </Combobox.Item>
              ))
            )}
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Control>
    </Combobox.Root>
  );
}
