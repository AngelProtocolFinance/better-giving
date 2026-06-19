import { Field } from "@ark-ui/react/field";
import { Switch } from "@ark-ui/react/switch";
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
      disabled={props.disabled}
      required={props.required}
      className={`grid grid-cols-[auto_1fr] ${
        children ? "gap-x-3" : ""
      } items-center ${cls.container}`}
    >
      <Switch.Root
        checked={props.value}
        onCheckedChange={(e) => props.onChange(e.checked)}
        className="contents"
      >
        <Switch.Control className="bg-input relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring data-disabled:bg-muted data-disabled:cursor-default">
          <Switch.Thumb className="translate-x-1 bg-muted-fg data-[state=checked]:translate-x-6.5 data-[state=checked]:bg-primary inline-block size-6 transform rounded-full transition-transform" />
        </Switch.Control>
        <Switch.Label
          className={`${cls.label} ${
            props.required
              ? "after:ml-1 after:content-['*'] after:text-destructive"
              : ""
          }`}
        >
          {children}
        </Switch.Label>
        <Switch.HiddenInput />
      </Switch.Root>

      <p className={`${cls.error} col-span-full field-err empty:hidden`}>
        {props.error}
      </p>
    </Field.Root>
  );
};
