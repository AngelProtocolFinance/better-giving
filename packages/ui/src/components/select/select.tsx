import {
  Select as ArkSelect,
  createListCollection,
} from "@ark-ui/react/select";
import {
  type ReactNode,
  type Ref,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { unpack } from "../../helpers/unpack";
import { DrawerIcon } from "../icon";
import { use_dialog_container } from "../use-dialog-container";
import { option_cls } from "./classes";
import { Popup } from "./internal/popup";
import type { FieldProps } from "./types";

/** call sites of `Select` name the control class `button`; it is the same slot
    as `FieldProps["classes"].control` on the shared interface. */
type Classes = Omit<NonNullable<FieldProps["classes"]>, "control"> & {
  button?: string;
};

export interface Props<T extends string>
  extends Omit<FieldProps, "classes" | "popup_vars"> {
  classes?: Classes;
  value: T | undefined;
  onChange: (opt: T) => void;
  options: T[];
  option_disp: (opt: T) => ReactNode;
  children?: (selected: T | undefined) => ReactNode;
}

export function Select<T extends string>({
  ref,
  ...props
}: Props<T> & { ref?: Ref<Pick<HTMLButtonElement, "focus" | "scrollTo">> }) {
  const cls = unpack(props.classes);
  const err_id = useId();
  const btn_ref = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => btn_ref.current?.focus(),
    scrollTo: () => btn_ref.current?.scrollIntoView({ block: "nearest" }),
  }));

  const collection = useMemo(
    () => createListCollection({ items: props.options }),
    [props.options]
  );

  const dialog = use_dialog_container(btn_ref);

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
      // when the popup does portal to body, mounting it on open keeps it out of
      // the aria-hidden sweep a dialog runs over body children as it opens
      lazyMount
      unmountOnExit
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
          aria-describedby={props.error ? err_id : undefined}
          className={`${cls.button} selector-btn field-input focus-visible:outline-2 data-[state=open]:outline-2 outline-ring`}
        >
          {props.value != null ? (
            props.option_disp(props.value as T)
          ) : (
            <span className="text-gray-11">{props.placeholder}</span>
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
      <Popup
        parts={{
          Positioner: ArkSelect.Positioner,
          Content: ArkSelect.Content,
        }}
        container={dialog}
        classes={cls.options}
      >
        {props.options.map((v) => (
          <ArkSelect.Item
            key={v}
            item={v}
            className={`${option_cls} ${cls.option}`}
          >
            <ArkSelect.ItemText>{props.option_disp(v)}</ArkSelect.ItemText>
          </ArkSelect.Item>
        ))}
      </Popup>
      {/* named by the trigger's `aria-describedby` above: zag's select puts
          `aria-invalid` on the trigger and nothing that says why. */}
      <p id={err_id} className="field-err mt-1 empty:hidden">
        {props.error}
      </p>
      {props.children?.(props.value)}
    </ArkSelect.Root>
  );
}
