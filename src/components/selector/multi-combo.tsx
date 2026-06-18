import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { Check, Search, X } from "lucide-react";
import {
  type PropsWithChildren,
  type ReactNode,
  type Ref,
  useMemo,
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
  const { contains } = useFilter({ sensitivity: "base" });
  const [query, set_query] = useState("");
  const [is_open, set_is_open] = useState(false);

  const filtered = useMemo(() => {
    return props.searchable && query
      ? props.options.filter((o) => contains(o, query))
      : props.options;
  }, [props.searchable, props.options, query, contains]);

  const options_available = !query || filtered.length > 0;
  const is_all_selected = props.values.length === props.options.length;

  const collection = useMemo(
    () => createListCollection({ items: filtered as string[] }),
    [filtered]
  );

  return (
    <>
      <Combobox.Root
        multiple
        collection={collection}
        disabled={props.disabled}
        value={props.values as string[]}
        inputValue={query}
        onValueChange={(e) => props.on_change(e.value as T[])}
        onOpenChange={(e) => set_is_open(e.open)}
        onInputValueChange={(e) => set_query(e.inputValue)}
        positioning={{ placement: "bottom", gap: 8 }}
        openOnClick
      >
        <div className={`${cls.container}`}>
          <FocusableInput ref={ref} />
          <Combobox.Control
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
                // focus trap when search input is hidden
                <input
                  aria-disabled={true}
                  className="w-0 h-0 appearance-none"
                />
              )}
            </div>
            <Combobox.Trigger className="absolute right-2 top-3 shrink-0">
              <DrawerIcon is_open={is_open} size={20} className="" />
            </Combobox.Trigger>
          </Combobox.Control>
          <Portal>
            <Combobox.Positioner>
              <Combobox.Content
                className={`${cls.options} z-50 rounded border bg-popover text-popover-fg w-(--reference-width) max-h-[10rem] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-ring scrollbar-track-border`}
              >
                {options_available && (
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

                {options_available &&
                  filtered.map((o) => (
                    <Combobox.Item
                      key={o}
                      item={o}
                      className={`${cls.option} selector-opt flex items-center justify-between data-[state=checked]:bg-(--form-secondary) data-highlighted:bg-(--form-secondary)`}
                    >
                      {props.option_disp(o as T)}
                      {props.values.includes(o as T) && (
                        <Check size={16} className="text-primary shrink-0" />
                      )}
                    </Combobox.Item>
                  ))}
                {!options_available && (
                  <p className="text-muted-fg text-sm px-4 py-2">
                    No options found
                  </p>
                )}
              </Combobox.Content>
            </Combobox.Positioner>
          </Portal>
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
