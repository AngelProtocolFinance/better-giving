import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { unpack } from "../../helpers/unpack";
import type { Classes } from "./types";

type El = HTMLInputElement;

interface IMask {
  /** raw digits → display string */
  format: (digits: string) => string;
  /** display string → raw digits */
  unmask: (masked: string) => string;
}

interface Base
  extends Pick<
    InputHTMLAttributes<El>,
    "placeholder" | "inputMode" | "type" | "onBlur"
  > {}

interface Props extends Base {
  id: string;
  /** set it to submit the masked value with a plain form post; controller-driven
   * callers leave it off and submit through their form library instead. */
  name?: string;
  /** one of `./masks/*` — no default, so a caller can never inherit another
   * field's formatting by omission. */
  mask: IMask;
  placeholder?: string;
  classes?: Classes | string;
  label: string | ReactElement;
  /** help text under the label. a string empty after trim counts as absent;
   * any other truthy value counts as present, so a ReactNode must render
   * text — one that renders nothing leaves the control described by an empty
   * node. */
  sub?: ReactNode;
  required?: boolean; // extract to disable native validation
  onChange: (val: string) => void;
  /** refuses edits via `readOnly`, never `disabled` — a disabled input is
   * dropped from a native form post, which would silently lose the value on a
   * pre-hydration submit. `.field-input` paints the affordance off
   * `[readonly]`. */
  disabled?: boolean;
  value: string;
  error?: string;
  ref?: React.Ref<El>;
}

export function MaskedInput({ sub, ...props }: Props) {
  // extract `required` to disable native validation
  const style = unpack(props.classes);
  const errorId = `error_${props.id}`;
  const subId = `sub_${props.id}`;
  const has_sub = typeof sub === "string" ? sub.trim() !== "" : !!sub;

  // every piece of help text on screen for this render, in reading order. the
  // error joins the list rather than standing in for it — a reader that hears
  // only the error loses the guidance that would fix it.
  const described =
    [has_sub ? subId : undefined, props.error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

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

      const digits = props.mask.unmask(input.value);
      const formatted = props.mask.format(digits);

      // find cursor position after same number of digits in formatted value
      let pos = 0;
      let count = 0;
      for (const ch of formatted) {
        pos++;
        if (/\d/.test(ch)) count++;
        if (count === digits_before) break;
      }
      // no digits before the cursor means it belongs in front of the first
      // one — sending it to the end makes a delete-from-the-front loop chew
      // the value from the wrong side
      if (digits_before === 0) {
        const first = formatted.search(/\d/);
        pos = first === -1 ? formatted.length : first;
      }

      cursor_ref.current = pos;
      props.onChange(formatted);
    },
    [props.onChange, props.mask]
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
        className={`${style.label} label ${has_sub ? "" : "mb-2"}`}
        htmlFor={props.id}
      >
        {props.label}
      </label>
      {has_sub ? (
        typeof sub === "string" ? (
          <p id={subId} className="text-gray-11 text-sm mb-2">
            {sub}
          </p>
        ) : (
          // `sub` is a ReactNode and callers pass block markup, so the wrapper
          // has to hold it — inside a span that is invalid nesting the browser
          // is free to restructure, carrying the content out from under the id
          <div id={subId}>{sub}</div>
        )
      ) : null}

      <input
        type={props.type ?? "text"}
        ref={set_ref}
        id={props.id}
        name={props.name}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={props.value}
        aria-invalid={!!props.error}
        // native `required` is withheld (see `required` above), so this is the
        // only requiredness a screen reader hears — absent, never "false"
        aria-required={props.required || undefined}
        readOnly={props.disabled}
        // see `field.tsx`: the errormessage relationship is the correct one and
        // the describedby is the one every screen reader reads
        aria-errormessage={errorId}
        // absent when no help text is present — a ReactNode `sub` is taken at
        // its word (see the prop)
        aria-describedby={described}
        className={`${style.input} field-input`}
        autoComplete="off"
        spellCheck={false}
        onInput={on_input}
        onBlur={props.onBlur}
      />

      <p id={errorId} className={`${style.error} field-err mt-1 empty:hidden`}>
        {props.error}
      </p>
    </div>
  );
}
