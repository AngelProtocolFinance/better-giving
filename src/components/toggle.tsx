import { Field } from "@base-ui/react/field";
import { Switch } from "@base-ui/react/switch";
import type { PropsWithChildren } from "react";
import { unpack } from "#/helpers/unpack";

type Classes = { container?: string; label?: string; error?: string };

interface Props extends PropsWithChildren {
  classes?: Classes;
  disabled?: boolean;
  required?: boolean;
  value: boolean;
  onChange: (val: boolean) => void;
  error?: string;
}

export const Toggle = ({ children, ...props }: Props) => {
  const cls = unpack(props.classes);
  return (
    <Field.Root
      invalid={!!props.error}
      className={`grid grid-cols-[auto_1fr] ${
        children ? "gap-x-3" : ""
      } items-center ${cls.container}`}
    >
      <Switch.Root
        disabled={props.disabled}
        checked={props.value}
        onCheckedChange={props.onChange}
        className="bg-input peer relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:bg-muted disabled:cursor-default"
      >
        <Switch.Thumb className="translate-x-1 bg-muted-fg data-[checked]:translate-x-[1.625rem] data-[checked]:bg-primary inline-block size-6 transform rounded-full transition-transform" />
      </Switch.Root>

      <Field.Label
        data-required={props.required}
        className={`${cls.label} data-[required=true]:after:ml-1 data-[required=true]:after:content-['*'] data-[required=true]:after:text-destructive`}
      >
        {children}
      </Field.Label>

      <p
        data-error
        className={`${cls.error} col-span-full field-err empty:hidden`}
      >
        {props.error}
      </p>
    </Field.Root>
  );
};
