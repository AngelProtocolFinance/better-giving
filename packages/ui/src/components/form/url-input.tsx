import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import { unpack } from "../../helpers/unpack";

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

      {/* prefix as a flex sibling, not an overlay: a fixed input padding can
          never equal the rendered width of "https://" */}
      <div className="field-input-container flex min-h-(--field-size)">
        <label
          htmlFor={id}
          className="flex items-center pl-4 text-gray-11 select-none"
        >
          https://
        </label>
        <input
          ref={ref}
          {...p}
          id={id}
          aria-invalid={!!error}
          disabled={props.disabled}
          aria-errormessage={error_id}
          className={`${style.input} min-w-0 flex-1 bg-transparent pr-4 py-3.5 outline-none`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <p id={error_id} className={`${style.error} field-err mt-1 empty:hidden`}>
        {error}
      </p>
    </div>
  );
}
