import { Combobox } from "@base-ui/react/combobox";
import { Field } from "@base-ui/react/field";
import { X } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
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
  "bg-popover text-popover-fg w-(--anchor-width) rounded shadow-2xl/20 origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:scale-90";

export function Combo({ ref, ...props }: Props & { ref?: Ref<El> }) {
  const cls = unpack(props.classes);
  const { contains } = Combobox.useFilter();
  const [query, set_query] = useState("");
  const [is_open, set_is_open] = useState(false);

  const is_inline = props.variant === "inline";
  const handle_change = is_inline ? props.on_change : props.onChange;

  const filtered = useMemo(() => {
    const base = query
      ? props.options.filter((o) => contains(o, query))
      : props.options.slice(0, 5);

    if (is_inline && props.allow_custom && query.length > 0) {
      return [query].concat(base).slice(0, 5);
    }
    return base.slice(0, 5);
  }, [props.options, query, contains, is_inline, props.allow_custom]);

  const clear = () => {
    handle_change("");
    set_query("");
    props.onReset?.();
  };

  return (
    <Field.Root className={`w-full ${cls.container} grid content-start`}>
      {!is_inline && (
        <Field.Label
          data-required={props.required}
          className={`${cls.label} label empty:hidden mb-2`}
        >
          {props.label}
        </Field.Label>
      )}
      <Combobox.Root
        items={filtered}
        itemToStringLabel={(v) => v}
        filter={null}
        disabled={props.disabled}
        value={props.value}
        onValueChange={(c) => c && handle_change(c)}
        onOpenChange={(open) => set_is_open(open)}
        onInputValueChange={(next_q) => set_query(next_q)}
      >
        <div className={`relative ${is_inline ? "group/combo" : ""}`}>
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
            <button
              type="button"
              disabled={props.disabled}
              className={
                is_inline
                  ? "absolute right-0 p-4 inset-y-0 transform disabled:text-muted-fg text-destructive hover:text-destructive active:text-destructive "
                  : "absolute right-4 top-1/2 -translate-y-1/2 transform disabled:text-muted-fg text-destructive hover:text-destructive active:text-destructive "
              }
              onClick={clear}
            >
              <X size={16} />
            </button>
          )}

          <Combobox.Portal>
            <Combobox.Positioner
              side="bottom"
              sideOffset={4}
              className={is_inline ? "" : "z-50"}
            >
              <Combobox.Popup
                style={is_inline ? props.options_style : undefined}
                className={`${popup_cls} ${is_inline ? "z-10" : ""}`}
              >
                {query && filtered.length === 0 && (
                  <div className="p-2 text-sm">{query} not found</div>
                )}
                <Combobox.List>
                  {filtered.map((v) => (
                    <Combobox.Item
                      className="data-selected:bg-form-secondary hover:bg-form-secondary flex items-center gap-2 p-2 text-sm"
                      key={v}
                      value={v}
                    >
                      {props.option_disp(v)}
                    </Combobox.Item>
                  ))}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </div>
      </Combobox.Root>
      {!is_inline && (
        <span className={`${cls.error} empty:hidden field-err mt-1`}>
          {props.error}
        </span>
      )}
    </Field.Root>
  );
}
