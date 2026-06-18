import { Portal } from "@ark-ui/react/portal";
import {
  Select as ArkSelect,
  createListCollection,
} from "@ark-ui/react/select";
import {
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useMemo,
  useRef,
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
  const btn_ref = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => btn_ref.current?.focus(),
    scrollTo: () => btn_ref.current?.scrollIntoView({ block: "nearest" }),
  }));

  const collection = useMemo(
    () => createListCollection({ items: props.options }),
    [props.options]
  );

  return (
    <ArkSelect.Root
      collection={collection}
      disabled={props.disabled}
      invalid={!!props.error}
      required={props.required}
      value={props.value != null ? [props.value] : []}
      onValueChange={(e) => {
        const v = e.value[0];
        if (v != null) props.onChange(v as T);
      }}
      positioning={{ placement: "bottom-start", gutter: 8 }}
      className={cls.container}
    >
      <ArkSelect.Label
        data-required={props.required}
        className={`label empty:hidden w-fit mb-2 ${cls.label}`}
      >
        {props.label}
      </ArkSelect.Label>
      <ArkSelect.Control>
        <ArkSelect.Trigger
          ref={btn_ref}
          className={`${cls.button} selector-btn field-input focus:outline-2 data-[state=open]:outline-2 outline-ring`}
        >
          {props.value != null ? (
            props.option_disp(props.value as T)
          ) : (
            <span className="text-muted-fg">{props.placeholder}</span>
          )}
          <ArkSelect.Context>
            {(api) => (
              <DrawerIcon
                is_open={api.open}
                size={20}
                className="justify-self-end shrink-0"
              />
            )}
          </ArkSelect.Context>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner>
          <ArkSelect.Content
            className={`${cls.options} rounded-xs border bg-popover text-popover-fg w-(--reference-width) max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border z-10 origin-(--transform-origin) transition-[opacity,scale] duration-150 data-[state=closed]:opacity-0 data-[state=closed]:scale-90`}
          >
            {props.options.map((v) => (
              <ArkSelect.Item
                key={v}
                item={v}
                className={`selector-opt ${cls.option}`}
              >
                <ArkSelect.ItemText>{props.option_disp(v)}</ArkSelect.ItemText>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
      <p className="field-err mt-1 empty:hidden">{props.error}</p>
      {props.children?.(props.value)}
    </ArkSelect.Root>
  );
}
