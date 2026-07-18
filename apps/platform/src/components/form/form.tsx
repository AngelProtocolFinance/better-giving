import type { ComponentProps, FormHTMLAttributes } from "react";
import { Form as RemixForm, useActionData, useNavigation } from "react-router";

interface IForm extends FormHTMLAttributes<HTMLFormElement> {
  disabled?: boolean;
  ref?: React.Ref<HTMLFormElement>;
}

export function Form({ disabled, children, ref, ...props }: IForm) {
  return (
    <form ref={ref} {...props}>
      <fieldset disabled={disabled} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

interface IRmxForm extends ComponentProps<typeof RemixForm> {
  disabled?: boolean;
  ref?: React.Ref<HTMLFormElement>;
}

export function RmxForm({ disabled, children, ref, ...props }: IRmxForm) {
  return (
    <RemixForm ref={ref} {...props}>
      <fieldset disabled={disabled} className="contents">
        {children}
      </fieldset>
    </RemixForm>
  );
}

export function useRmxForm<T = unknown>() {
  const nav = useNavigation();
  const data = useActionData<T>();
  return { nav, data };
}
