import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import { unpack } from "#/helpers/unpack";

import { Label } from "./label";
import type { Classes } from "./types";

type El = HTMLInputElement;
type Props = Omit<
  InputHTMLAttributes<El>,
  "autoComplete" | "className" | "id" | "spellCheck" | "type"
> & {
  classes?: Classes | string;
  tooltip?: ReactNode;
  label: string | ReactElement;
  error?: string;
  ref?: React.Ref<El>;
};

export function UrlInput(props: Props) {
  const {
    label,
    classes,
    tooltip,
    required, //extract from props to disable native validation
    error,
    ref,
    ...p
  } = props;
  const style = unpack(classes);

  const id = `__${props.name}`;
  const error_id = `__error_${props.name}`;

  return (
    <div className={`${style.container} `}>
      <Label
        className={`${style.label} mb-2 label`}
        required={required}
        htmlFor={id}
      >
        {label}
      </Label>

      <div className="relative px-3 py-4">
        <input
          ref={ref}
          {...p}
          id={id}
          aria-invalid={!!error}
          disabled={props.disabled}
          aria-errormessage={error_id}
          className={`${style.input} field-input pl-15 absolute inset-0`}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="relative text-sm text-muted-fg pointer-events-none">
          https://
        </span>
      </div>

      <p id={error_id} className={`${style.error} field-err mt-1 empty:hidden`}>
        {error}
      </p>
    </div>
  );
}
