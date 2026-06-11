import { Combobox } from "@base-ui/react/combobox";
import { Check, Search, X } from "lucide-react";
import {
  type PropsWithChildren,
  type ReactNode,
  type Ref,
  useState,
} from "react";
import { unpack } from "#/helpers/unpack";
import { DrawerIcon } from "../icon";

import { styles } from "./constants";
import { FocusableInput } from "./focusable-input";
import type { BaseProps } from "./types";

export interface Props<T extends string> extends BaseProps {
  searchable?: true;
  values: T[];
  on_change: (opts: T[]) => void;
  on_reset: () => void;
  options: T[];
  option_disp: (opt: T) => ReactNode;
  children?: (values: T[]) => ReactNode;

  error?: string;
  label?: ReactNode;
  required?: boolean;
}

export function MultiCombo<T extends string>({
  children,
  ref,
  ...props
}: Props<T> & { ref?: Ref<HTMLInputElement> }) {
  const cls = unpack(props.classes);
  const [query, set_query] = useState("");
  const [is_open, set_is_open] = useState(false);
  const filteredOptions =
    props.searchable && query
      ? props.options.filter((o) =>
          o.toLowerCase().includes(query.toLowerCase())
        )
      : props.options;

  const optionsAvailable = !query || filteredOptions.length > 0;

  const is_all_selected = props.values.length === props.options.length;

  return (
    <>
      <Combobox.Root
        multiple
        items={filteredOptions}
        filter={null}
        disabled={props.disabled}
        value={props.values}
        onValueChange={props.on_change}
        onOpenChange={(open) => set_is_open(open)}
        onInputValueChange={(q) => set_query(q)}
        itemToStringLabel={(v) => v}
      >
        <div className={`${cls.container}`}>
          <FocusableInput ref={ref} />
          <Combobox.InputGroup
            aria-invalid={!!props.error}
            aria-disabled={props.disabled}
            className={`${cls.button} ${styles.selectorButton} relative flex-wrap gap-2 focus-within:outline-2 outline-ring aria-invalid:border-destructive p-1 pr-10`}
          >
            <div className="flex flex-wrap gap-2 h-full">
              {props.values.map((v) => (
                <SelectedOption
                  option={v}
                  option_disp={props.option_disp}
                  key={v}
                  on_deselect={(opt) =>
                    props.on_change(props.values.filter((v) => v !== opt))
                  }
                />
              ))}
              {props.searchable ? (
                <div className="bg-input inline-flex items-center gap-2 text-muted-fg pl-3 rounded">
                  <Search size={20} />
                  <Combobox.Input className="appearance-none bg-transparent first:pl-3 focus:outline-hidden h-10" />
                </div>
              ) : (
                //this will receive focus if search input is not rendered
                <input
                  aria-disabled={true}
                  className="w-0 h-0 appearance-none"
                />
              )}
            </div>
            <Combobox.Trigger className="absolute right-2 top-3 shrink-0">
              <DrawerIcon is_open={is_open} size={20} className="" />
            </Combobox.Trigger>
          </Combobox.InputGroup>
          <Combobox.Portal>
            <Combobox.Positioner side="bottom" sideOffset={8} className="z-50">
              <Combobox.Popup
                className={`${cls.options} rounded border bg-popover text-popover-fg w-(--anchor-width) max-h-[10rem] overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border`}
              >
                {optionsAvailable && (
                  <div className="flex justify-between p-4">
                    {is_all_selected ? (
                      <Action on_click={() => props.on_change([])}>
                        Deselect All
                      </Action>
                    ) : (
                      <Action on_click={() => props.on_change(props.options)}>
                        Select All
                      </Action>
                    )}
                    <Action on_click={props.on_reset}>Reset</Action>
                  </div>
                )}

                <Combobox.List>
                  {optionsAvailable &&
                    filteredOptions.map((o) => (
                      <Combobox.Item
                        key={o}
                        value={o}
                        className={`${cls.option} selector-opt flex items-center justify-between`}
                      >
                        {props.option_disp(o)}
                        {props.values.includes(o) && (
                          <Check size={16} className="text-primary shrink-0" />
                        )}
                      </Combobox.Item>
                    ))}
                </Combobox.List>
                {!optionsAvailable && (
                  <p className="text-muted-fg text-sm px-4 py-2">
                    No options found
                  </p>
                )}
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </div>
        <p className="field-err mt-1 empty:hidden">{props.error}</p>
      </Combobox.Root>
      {children?.(props.values)}
    </>
  );
}

type ISelectedOption<T extends string> = {
  option: T;
  option_disp: (opt: T) => ReactNode;
  on_deselect: (option: T) => void;
};

function SelectedOption<T extends string>({
  on_deselect,
  option,
  option_disp,
}: ISelectedOption<T>) {
  return (
    <div className="flex items-center px-3 gap-2 h-10 bg-secondary border rounded font-semibold text-secondary-fg capitalize">
      <span className="max-w-[200px] truncate">{option_disp(option)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          on_deselect(option);
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}

function Action(props: PropsWithChildren<{ on_click: () => void }>) {
  return (
    <button
      type="button"
      className="text-primary hover:text-primary hover:underline"
      onClick={props.on_click}
    >
      {props.children}
    </button>
  );
}
