import { Field } from "@base-ui/react/field";
import { Select as BaseSelect } from "@base-ui/react/select";
import {
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { unpack } from "#/helpers/unpack";
import { DrawerIcon } from "../icon";
import type { BaseProps } from "./types";

export interface Props<T extends string> extends BaseProps {
  value: T | undefined;
  onChange: (opt: T) => void;
  options: T[];
  option_disp: (opt: T) => ReactNode;
  children?: (selected: T | undefined) => ReactNode;
  error?: string;
  label?: ReactNode;
  required?: boolean;
}

export function Select<T extends string>({
  ref,
  ...props
}: Props<T> & { ref?: Ref<Pick<HTMLButtonElement, "focus" | "scrollTo">> }) {
  const cls = unpack(props.classes);
  const [open, set_open] = useState(false);

  const btn_ref = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => btn_ref.current?.focus(),
    scrollTo: () => btn_ref.current?.scrollIntoView({ block: "nearest" }),
  }));

  return (
    <Field.Root invalid={!!props.error} className={cls.container}>
      <Field.Label
        data-required={props.required}
        className={`label empty:hidden mb-2 ${cls.label}`}
      >
        {props.label}
      </Field.Label>
      <BaseSelect.Root
        disabled={props.disabled}
        value={props.value || null}
        onValueChange={(val) => props.onChange(val as T)}
        open={open}
        onOpenChange={set_open}
      >
        <BaseSelect.Trigger
          ref={btn_ref}
          aria-invalid={!!props.error}
          aria-disabled={props.disabled}
          className={`${cls.button} selector-btn field-input focus:outline-2 data-popup-open:outline-2 outline-ring`}
        >
          <BaseSelect.Value placeholder={props.placeholder}>
            {props.value != null ? props.option_disp(props.value as T) : null}
          </BaseSelect.Value>
          <DrawerIcon
            is_open={open}
            size={20}
            className="justify-self-end shrink-0"
          />
        </BaseSelect.Trigger>
        <BaseSelect.Positioner
          side="bottom"
          alignItemWithTrigger={false}
          className="relative z-10"
        >
          <BaseSelect.Popup
            className={`${cls.options} rounded-xs border bg-popover text-popover-fg mt-2 w-(--anchor-width) max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border origin-(--transform-origin) transition-[opacity,scale] duration-150 data-starting-style:opacity-0 data-starting-style:scale-90 data-ending-style:opacity-0 data-ending-style:scale-90`}
          >
            <BaseSelect.List>
              {props.options.map((v) => (
                <BaseSelect.Item
                  key={v}
                  value={v}
                  className={`selector-opt ${cls.option}`}
                >
                  <BaseSelect.ItemText>
                    {props.option_disp(v)}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
        <p className="field-err mt-1 empty:hidden">{props.error}</p>
      </BaseSelect.Root>
      {props.children?.(props.value)}
    </Field.Root>
  );
}
