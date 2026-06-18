import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Field } from "@ark-ui/react/field";
import { Portal } from "@ark-ui/react/portal";
import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { unpack } from "#/helpers/unpack";
import {
  type CurrencyOption,
  is_query,
  type QueryState,
} from "#/types/components";
import { DrawerIcon } from "../icon";

type Classes = {
  combobox?: string;
  label?: string;
  container?: string;
  options?: string;
  input?: string;
};

type Props<T extends CurrencyOption> = {
  classes?: Classes;
  currencies: T[] | QueryState<T[]>;
  disabled?: boolean;
  required?: boolean;
  value: T;
  label: string;
  onChange: (currency: T) => void;
};

const to_label = (v: CurrencyOption) =>
  "name" in v ? `${v.code.toUpperCase()} - ${v.name}` : v.code.toUpperCase();

export function CurrencySelector<T extends CurrencyOption>({
  currencies,
  ...props
}: Props<T>) {
  const display_value = to_label(props.value);
  const [input_value, set_input_value] = useState(display_value);
  const [is_open, set_is_open] = useState(false);

  // sync displayed text when external value changes
  useEffect(() => {
    set_input_value(display_value);
  }, [display_value]);

  const is_currency_loading = is_query(currencies) && currencies.is_loading;
  const is_currency_error = is_query(currencies) && currencies.is_error;

  const is_search = input_value !== "" && input_value !== display_value;

  const items = useMemo(() => {
    const list = is_query(currencies) ? (currencies.data ?? []) : currencies;
    if (!is_search) return list;
    const q = input_value.toLowerCase().replace(/\s+/g, "");
    return list.filter((c) => {
      const matches_code = c.code.toLowerCase().includes(q);
      const matches_name = ("name" in c ? c.name : undefined)
        ?.toLowerCase()
        .replace(/\s+/g, "")
        .includes(q);
      return matches_code || matches_name || false;
    });
  }, [currencies, input_value, is_search]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: items as CurrencyOption[],
        itemToValue: (c) => c.code,
        itemToString: to_label,
      }),
    [items]
  );

  const style = unpack(props.classes);
  const disabled =
    props.disabled || is_currency_loading || is_currency_error || false;

  return (
    <Field.Root disabled={disabled} className={style.container}>
      <Field.Label
        className={`${style.label} label mb-2 w-fit`}
        data-required={props.required}
        aria-required={props.required}
      >
        {props.label}
      </Field.Label>
      <Combobox.Root
        collection={collection}
        value={props.value ? [props.value.code] : []}
        inputValue={input_value}
        onValueChange={(e) => {
          const next = e.items[0] as T | undefined;
          if (next) props.onChange(next);
        }}
        onInputValueChange={(e) => {
          if (e.reason === "input-change") set_input_value(e.inputValue);
        }}
        onOpenChange={(e) => {
          set_is_open(e.open);
          // restore selected label when popup closes without a new pick
          if (!e.open) set_input_value(display_value);
        }}
        positioning={{ placement: "bottom", gutter: 4 }}
        openOnClick
        disabled={disabled}
      >
        <Combobox.Control className={`relative ${style.combobox}`}>
          <Combobox.Input
            className={`h-full field-input ${style.input}`}
            spellCheck={false}
          />
          <Combobox.Trigger className="flex items-center absolute inset-y-0 right-4">
            {is_currency_loading ? (
              <LoaderCircle className="text-muted-fg animate-spin" size={20} />
            ) : (
              <DrawerIcon
                is_open={is_open}
                size={20}
                className={`${is_currency_error ? "text-destructive" : ""}`}
                aria-hidden
              />
            )}
          </Combobox.Trigger>

          <Portal>
            <Combobox.Positioner>
              <Combobox.Content
                className={`${style.options ?? ""} z-50 text-sm w-(--reference-width) border bg-popover text-popover-fg shadow-lg rounded max-h-52 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-ring scrollbar-track-border outline-ring`}
              >
                {is_search && items.length === 0 && (
                  <div className="p-2 text-sm text-muted-fg">
                    {input_value} not found
                  </div>
                )}
                {items.map((c) => (
                  <Combobox.Item
                    key={c.code}
                    item={c}
                    className="flex items-center gap-2 p-2 truncate data-[state=checked]:bg-(--form-secondary) data-highlighted:bg-(--form-secondary) hover:bg-(--form-secondary)"
                  >
                    {to_label(c)}
                  </Combobox.Item>
                ))}
              </Combobox.Content>
            </Combobox.Positioner>
          </Portal>
        </Combobox.Control>
      </Combobox.Root>
    </Field.Root>
  );
}
