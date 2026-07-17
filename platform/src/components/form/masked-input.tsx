import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { unpack } from "#/helpers/unpack";
import { format, unmask } from "./masks/dollar";
import type { Classes } from "./types";

type El = HTMLInputElement;

interface Base
  extends Pick<InputHTMLAttributes<El>, "placeholder" | "inputMode" | "type"> {}

interface Props extends Base {
  id: string;
  placeholder?: string;
  classes?: Classes | string;
  label: string | ReactElement;
  sub?: ReactNode;
  required?: boolean; // extract to disable native validation
  onChange: (val: string) => void;
  disabled?: boolean;
  value: string;
  error?: string;
  ref?: React.Ref<El>;
}

export function MaskedInput(props: Props) {
  // extract `required` to disable native validation
  const style = unpack(props.classes);
  const errorId = `error_${props.id}`;

  const input_ref = useRef<El>(null);
  const cursor_ref = useRef<number | null>(null);

  // restore cursor after react re-renders the controlled value
  useLayoutEffect(() => {
    if (cursor_ref.current != null && input_ref.current) {
      input_ref.current.setSelectionRange(
        cursor_ref.current,
        cursor_ref.current
      );
      cursor_ref.current = null;
    }
  });

  const on_input = useCallback(
    (e: React.FormEvent<El>) => {
      const input = e.currentTarget;
      const cursor = input.selectionStart ?? 0;

      // count digits before cursor in the raw (pre-format) value
      const digits_before = input.value
        .slice(0, cursor)
        .replace(/\D/g, "").length;

      const digits = unmask(input.value);
      const formatted = format(digits);

      // find cursor position after same number of digits in formatted value
      let pos = 0;
      let count = 0;
      for (const ch of formatted) {
        pos++;
        if (/\d/.test(ch)) count++;
        if (count === digits_before) break;
      }
      // if no digits matched, place cursor at end
      if (digits_before === 0)
        pos = formatted.indexOf("0") + 1 || formatted.length;

      cursor_ref.current = pos;
      props.onChange(formatted);
    },
    [props.onChange]
  );

  const set_ref = useCallback(
    (node: El | null) => {
      (input_ref as React.MutableRefObject<El | null>).current = node;
      if (typeof props.ref === "function") props.ref(node);
      else if (props.ref) {
        (props.ref as React.MutableRefObject<El | null>).current = node;
      }
    },
    [props.ref]
  );

  return (
    <div className={`${style.container} `}>
      <label
        data-required={props.required}
        className={`${style.label} label ${props.sub ? "" : "mb-2"}`}
        htmlFor={props.id}
      >
        {props.label}
      </label>
      {props.sub ? (
        typeof props.sub === "string" ? (
          <p className="text-muted-fg text-sm mb-2">{props.sub}</p>
        ) : (
          props.sub
        )
      ) : null}

      <input
        type={props.type ?? "text"}
        ref={set_ref}
        id={props.id}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={props.value}
        aria-invalid={!!props.error}
        aria-disabled={props.disabled}
        aria-errormessage={errorId}
        className={`${style.input} field-input`}
        autoComplete="off"
        spellCheck={false}
        onInput={on_input}
      />

      <p id={errorId} className={`${style.error} field-err mt-1 empty:hidden`}>
        {props.error}
      </p>
    </div>
  );
}
