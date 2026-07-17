import { Field } from "@ark-ui/react/field";
import type { InputHTMLAttributes, ReactNode } from "react";

interface Props {
  classes?: string;
  input: ReactNode;
  label: string;
  error?: string;
  required?: boolean;
}

export function Field2({ classes = "", input, error, label, required }: Props) {
  return (
    <Field.Root invalid={!!error} className={`${classes} group/field relative`}>
      {input}
      <Field.Label data-required={required} className="label-floating">
        {label}{" "}
        {error && (
          <span
            data-error
            className="text-destructive mt-0.5 text-right text-xs font-normal"
          >
            {error}
          </span>
        )}
      </Field.Label>
    </Field.Root>
  );
}

interface IInput2
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input2({ className = "", ref, ...props }: IInput2) {
  return (
    <Field.Input
      {...props}
      placeholder=""
      className="peer w-full py-3.5 text-sm rounded border bg-input px-4 transition-colors outline-ring data-invalid:border-destructive"
      ref={ref}
    />
  );
}
