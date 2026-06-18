import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Field } from "@ark-ui/react/field";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { X } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useState,
} from "react";
import { unpack } from "#/helpers/unpack";

type El = HTMLInputElement;

interface BaseProps {
  options: string[];
  option_disp: (opt: string) => ReactNode;
  onReset?: () => void;
  required?: boolean;
  label?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
  classes?: {
    container?: string;
    input?: string;
    error?: string;
    label?: string;
  };
}

interface TriggerProps extends BaseProps {
  variant?: "trigger";
  btn_disp: (opt: string, open: boolean) => ReactElement;
  label?: ReactNode;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  // not applicable to trigger variant
  allow_custom?: never;
  options_style?: never;
  on_change?: never;
}

interface InlineProps extends BaseProps {
  variant: "inline";
  label: string;
  value: string;
  on_change: (val: string) => void;
  error?: string;
  allow_custom?: boolean;
  options_style?: Record<string, string | undefined>;
  // not applicable to inline variant
  btn_disp?: never;
  onChange?: never;
}

type Props = TriggerProps | InlineProps;

const popup_cls =
  "bg-popover text-popover-fg w-(--reference-width) max-h-60 overflow-y-auto overscroll-contain rounded shadow-2xl/20 origin-(--transform-origin) transition-[opacity,scale] duration-150 data-[state=closed]:opacity-0 data-[state=closed]:scale-90";

export function Combo({ ref, ...props }: Props & { ref?: Ref<El> }) {
  const cls = unpack(props.classes);
  const { contains } = useFilter({ sensitivity: "base" });
  const display_value = props.value || "";
  const [input_value, set_input_value] = useState(display_value);
  const [is_open, set_is_open] = useState(false);

  // sync displayed text when external value changes (e.g., RHF reset)
  useEffect(() => {
    set_input_value(display_value);
  }, [display_value]);

  const is_inline = props.variant === "inline";
  const handle_change = is_inline ? props.on_change : props.onChange;
  const allow_custom = is_inline && !!props.allow_custom;

  // user is searching when text differs from the selected display value
  const is_search = input_value !== "" && input_value !== display_value;

  const filtered = useMemo(() => {
    let base = is_search
      ? props.options.filter((o) => contains(o, input_value)).slice(0, 5)
      : props.options.slice(0, 5);

    if (allow_custom && is_search) {
      base = [input_value].concat(base).slice(0, 5);
    }
    // ensure currently-selected value is in collection so Ark can resolve it
    if (display_value && !base.includes(display_value)) {
      base = [display_value, ...base].slice(0, 5);
    }
    return base;
  }, [
    props.options,
    input_value,
    is_search,
    contains,
    allow_custom,
    display_value,
  ]);

  const collection = useMemo(
    () => createListCollection({ items: filtered }),
    [filtered]
  );

  return (
    <Field.Root className={`w-full ${cls.container} grid content-start`}>
      {!is_inline && (
        <Field.Label
          data-required={props.required}
          className={`${cls.label} label empty:hidden mb-2 w-fit`}
        >
          {props.label}
        </Field.Label>
      )}
      <Combobox.Root
        collection={collection}
        disabled={props.disabled}
        value={props.value ? [props.value] : []}
        inputValue={input_value}
        onValueChange={(e) => handle_change(e.value[0] ?? "")}
        onOpenChange={(e) => set_is_open(e.open)}
        onInputValueChange={(e) => set_input_value(e.inputValue)}
        allowCustomValue={allow_custom}
        openOnClick
      >
        <Combobox.Control
          className={`relative ${is_inline ? "group/combo" : ""}`}
        >
          {!is_inline && props.btn_disp && (
            <Combobox.Trigger className="absolute left-4 top-1/2 -translate-y-1/2">
              {props.btn_disp(props.value, is_open)}
            </Combobox.Trigger>
          )}

          <Combobox.Input
            ref={ref}
            placeholder={is_inline ? "" : props.placeholder}
            className={
              is_inline
                ? `${props.classes?.input} text-sm w-full px-4 py-3.5 border bg-input rounded outline-ring group-[:has([data-error])]/combo:border-destructive`
                : `${props.classes?.input} field-input w-full h-full`
            }
          />

          {is_inline && (
            <Field.Label
              data-required={props.required}
              className={`${cls.label} label-floating`}
            >
              {props.label}{" "}
              {props.error && (
                <span
                  data-error
                  className="text-xs text-destructive font-normal"
                >
                  {props.error}
                </span>
              )}
            </Field.Label>
          )}

          {props.value && (
            <Combobox.Context>
              {(api) => (
                <Combobox.ClearTrigger
                  disabled={props.disabled}
                  onClick={() => {
                    props.onReset?.();
                    // ClearTrigger clears + focuses input; also reopen popup
                    queueMicrotask(() => api.setOpen(true));
                  }}
                  className={
                    is_inline
                      ? "absolute right-0 p-4 inset-y-0 transform disabled:text-muted-fg text-destructive hover:text-destructive active:text-destructive "
                      : "absolute right-4 top-1/2 -translate-y-1/2 transform disabled:text-muted-fg text-destructive hover:text-destructive active:text-destructive "
                  }
                >
                  <X size={16} />
                </Combobox.ClearTrigger>
              )}
            </Combobox.Context>
          )}

          <Portal>
            <Combobox.Positioner>
              <Combobox.Content
                style={is_inline ? props.options_style : undefined}
                className={`${popup_cls} ${is_inline ? "z-10" : "z-50"}`}
              >
                {is_search && filtered.length === 0 && (
                  <div className="p-2 text-sm">{input_value} not found</div>
                )}
                {filtered.map((v) => (
                  <Combobox.Item
                    className="data-[state=checked]:bg-form-secondary data-highlighted:bg-form-secondary hover:bg-form-secondary flex items-center gap-2 p-2 text-sm"
                    key={v}
                    item={v}
                  >
                    {props.option_disp(v)}
                  </Combobox.Item>
                ))}
              </Combobox.Content>
            </Combobox.Positioner>
          </Portal>
        </Combobox.Control>
      </Combobox.Root>
      {!is_inline && (
        <span className={`${cls.error} empty:hidden field-err mt-1`}>
          {props.error}
        </span>
      )}
    </Field.Root>
  );
}
