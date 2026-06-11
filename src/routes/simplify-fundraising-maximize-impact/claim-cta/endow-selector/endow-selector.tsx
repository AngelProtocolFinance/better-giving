import { Combobox } from "@base-ui/react/combobox";
import { SearchIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { DrawerIcon } from "#/components/icon";
import type { EndowmentOption } from "#/types/npo";
import { Options } from "./options";

interface Props {
  disabled?: boolean;
  value: EndowmentOption;
  onChange: (endowment: EndowmentOption) => void;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function EndowSelector(props: Props) {
  const [searchText, setSearchText] = useState("");
  const [is_open, set_is_open] = useState(false);

  return (
    <Combobox.Root
      disabled={props.disabled}
      value={props.value}
      onValueChange={(val) => val && props.onChange(val)}
      onInputValueChange={(q, details) => {
        // skip refetch when input mutates due to selection/clear/programmatic
        if (details.reason !== "input-change") return;
        setSearchText(q);
      }}
      onOpenChange={(open) => set_is_open(open)}
      items={props.value ? [props.value] : []}
      filter={null}
      itemToStringLabel={(v) => v.name}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
    >
      <div className="relative bg-card rounded">
        <SearchIcon
          className="absolute top-1/2 -translate-y-1/2 left-4"
          size={16}
        />
        <Combobox.Input
          ref={props.ref}
          id="claim-npo-input"
          placeholder="Search by name or EIN"
          className="px-10 w-full focus:outline-none p-3 rounded"
        />

        <Combobox.Trigger className="absolute top-1/2 -translate-y-1/2 right-4">
          <DrawerIcon is_open={is_open} size={16} />
        </Combobox.Trigger>

        <Options searchText={searchText} />
        {props.error && (
          <span className="field-error" data-error>
            {props.error}
          </span>
        )}
      </div>
    </Combobox.Root>
  );
}
