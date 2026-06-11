import { Combobox } from "@base-ui/react/combobox";
import { Field } from "@base-ui/react/field";
import { LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { unpack } from "#/helpers/unpack";
import {
  type CurrencyOption,
  is_query,
  type QueryState,
} from "#/types/components";
import { DrawerIcon } from "../icon";
import { CurrencyOptions } from "./currency-options";

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

export function CurrencySelector<T extends CurrencyOption>({
  currencies,
  ...props
}: Props<T>) {
  const [query, set_query] = useState("");
  const [is_open, set_is_open] = useState(false);

  const is_currency_loading = is_query(currencies) && currencies.is_loading;
  const is_currency_error = is_query(currencies) && currencies.is_error;

  const items = useMemo(() => {
    const list = is_query(currencies) ? (currencies.data ?? []) : currencies;
    if (!query) return list;
    const q = query.toLowerCase().replace(/\s+/g, "");
    return list.filter((c) => {
      const matches_code = c.code.toLowerCase().includes(q);
      const matches_name = ("name" in c ? c.name : undefined)
        ?.toLowerCase()
        .replace(/\s+/g, "")
        .includes(q);
      return matches_code || matches_name || false;
    });
  }, [currencies, query]);

  const style = unpack(props.classes);

  return (
    <Field.Root
      disabled={props.disabled || is_currency_loading || is_currency_error}
      className={style.container}
    >
      <Field.Label
        className={`${style.label} label mb-2`}
        data-required={props.required}
        aria-required={props.required}
      >
        {props.label}
      </Field.Label>
      <Combobox.Root
        items={items}
        filter={null}
        value={props.value}
        onValueChange={(val) => val && props.onChange(val)}
        onInputValueChange={(q) => set_query(q)}
        onOpenChange={(open) => {
          set_is_open(open);
          if (open) set_query("");
        }}
        itemToStringLabel={(v) =>
          "name" in v
            ? `${v.code.toUpperCase()} - ${v.name}`
            : v.code.toUpperCase()
        }
        disabled={props.disabled || is_currency_loading || is_currency_error}
      >
        <div className={`relative ${style.combobox}`}>
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

          <CurrencyOptions
            query={query}
            items={items}
            classes={style.options}
          />
        </div>
      </Combobox.Root>
    </Field.Root>
  );
}
