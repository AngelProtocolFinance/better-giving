import type React from "react";
import {
  createElement,
  type HTMLInputTypeAttribute,
  type ReactElement,
  type ReactNode,
} from "react";
import { unpack } from "../../helpers/unpack";
import { Label } from "./label";
import type { Classes } from "./types";

const textarea = "textarea" as const;
type TextArea = typeof textarea;
type InputType = HTMLInputTypeAttribute | TextArea;

/** a constrained *text* type is a rule the browser enforces itself, in its own
 * bubble, before the action ever runs — so a malformed address fires no submit,
 * the app's error summary stays empty, nothing is marked `aria-invalid` and the
 * focus move never happens. `required` is withheld from the control for exactly
 * that reason (see the prop below); a type named here is translated rather than
 * spread, for the same one.
 *
 * the keyboard is the only half worth keeping, and `inputMode` carries it
 * without the constraint. the schema is what validates. `date`, `number` and
 * `checkbox` are absent — their type is the control, not a rule over free
 * text. */
const unconstrained: Partial<Record<string, "email" | "url" | "tel">> = {
  email: "email",
  url: "url",
  tel: "tel",
};

type Props<T extends InputType> = Omit<
  T extends TextArea
    ? React.TextareaHTMLAttributes<HTMLTextAreaElement>
    : React.InputHTMLAttributes<HTMLInputElement>,
  "className" | "id" | "spellCheck" | "type"
> & {
  classes?: Classes | string;
  tooltip?: ReactNode;
  label: string | ReactElement;
  sub?: ReactNode;
  type?: T;
};

export function Field<T extends InputType = InputType>({
  type = "text" as T,
  label,
  classes,
  tooltip,
  required, //extract from props to disable native validation
  // off by default: most fields here are somebody else's data (a nonprofit's
  // details, a donation's recipient), which the browser must not prefill from
  // the visitor's own saved values
  autoComplete = "off",
  error,
  ref,
  ...props
}: Props<T> & {
  error?: string;
  ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
}) {
  const style = unpack(classes);

  const id = `__${String(props.name)}`;
  const errorId = `__error_${String(props.name)}`;
  const mode = unconstrained[type as string];

  return (
    <div className={`${style.container} `}>
      <Label
        className={`${style.label} label ${props.sub ? "" : "mb-1"}`}
        required={required}
        htmlFor={id}
      >
        {label}
      </Label>
      {props.sub ? (
        typeof props.sub === "string" ? (
          <p className="text-gray-11 text-sm mb-2">{props.sub}</p>
        ) : (
          props.sub
        )
      ) : null}

      {createElement(type === textarea ? textarea : "input", {
        ref,
        ...props,
        ...(type === textarea ? {} : { type: mode ? "text" : type }),
        // a caller's own inputMode wins. autoCapitalize is off by default on a
        // constrained type and on by default on `text`, so it is restated here
        ...(mode
          ? {
              inputMode: props.inputMode ?? mode,
              autoCapitalize: props.autoCapitalize ?? "none",
            }
          : {}),
        id,
        "aria-invalid": !!error,
        "aria-disabled": props.disabled,
        "aria-errormessage": errorId,
        className: `${style.input} field-input`,
        autoComplete,
        spellCheck: false,
      })}

      {(tooltip && ( //tooltip in normal flow
        <p className={`${style.error} text-left mt-1 left-0 text-xs`}>
          {typeof tooltip === "string" ? (
            <span className="text-gray-11">{tooltip}</span>
          ) : (
            tooltip
          )}{" "}
          <span
            id={errorId}
            className="empty:hidden text-destructive-subtle-fg text-xs before:content-['('] before:mr-0.5 after:content-[')'] after:ml-0.5 empty:before:hidden empty:after:hidden"
          >
            {error}
          </span>
        </p>
      )) || (
        <p
          id={errorId}
          className={`${style.error} field-err mt-1 empty:hidden`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
