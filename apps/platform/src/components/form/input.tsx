import type { Church } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { unpack } from "#/helpers/unpack";
import type { Classes } from "./types";

type El = HTMLInputElement;
interface Props extends Omit<InputHTMLAttributes<El>, "type" | "className"> {
  classes?: Classes;
  error?: string;
  icon?: typeof Church;
  ref?: React.Ref<El>;
}

export function Input(props: Props) {
  const { classes, error, icon, ref, ...rest } = props;
  const style = unpack(classes);

  return (
    <div className={style.container}>
      <div className="relative">
        {props.icon && (
          <props.icon
            className="text-muted-fg absolute top-1/2 -translate-y-1/2 left-4"
            size={20}
          />
        )}
        <input
          {...rest}
          ref={ref}
          type="text"
          className={`field-input h-full ${props.icon ? "pl-12" : ""} ${style.input}`}
          aria-invalid={!!error}
        />
      </div>
      {error && <p className="field-err mt-1 empty:hidden">{error}</p>}
    </div>
  );
}
