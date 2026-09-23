import {
  type ComponentProps,
  type FormHTMLAttributes,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { Form as RemixForm, useActionData, useNavigation } from "react-router";

interface IForm extends FormHTMLAttributes<HTMLFormElement> {
  disabled?: boolean;
  ref?: React.Ref<HTMLFormElement>;
}

export function Form({ disabled, children, ref, ...props }: IForm) {
  return (
    <form ref={ref} {...props}>
      <DisablingFieldset disabled={disabled}>{children}</DisablingFieldset>
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
      <DisablingFieldset disabled={disabled}>{children}</DisablingFieldset>
    </RemixForm>
  );
}

/**
 * disabling the fieldset ejects focus from whatever control held it (usually
 * the submit button) to `<body>`. that control is refocused when the fieldset
 * re-enables — unless something else took focus meanwhile.
 */
function DisablingFieldset({
  disabled,
  children,
}: {
  disabled?: boolean;
  children?: ReactNode;
}) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const ejected = useRef<HTMLElement | null>(null);

  // chrome blurs a control synchronously as its fieldset disables, before any
  // effect can read `activeElement` — so catch it on the way out
  useEffect(() => {
    const el = fieldset.current;
    if (!el) return;
    const on_focusout = (e: FocusEvent) => {
      if (
        el.disabled &&
        !e.relatedTarget &&
        e.target instanceof HTMLElement &&
        e.target.matches(":disabled")
      )
        ejected.current = e.target;
    };
    el.addEventListener("focusout", on_focusout);
    return () => el.removeEventListener("focusout", on_focusout);
  }, []);

  useLayoutEffect(() => {
    if (disabled) return;
    const el = ejected.current;
    ejected.current = null;
    const unclaimed =
      !document.activeElement || document.activeElement === document.body;
    if (el?.isConnected && unclaimed) el.focus();
  }, [disabled]);

  return (
    <fieldset ref={fieldset} disabled={disabled} className="contents">
      {children}
    </fieldset>
  );
}

export function useRmxForm<T = unknown>() {
  const nav = useNavigation();
  const data = useActionData<T>();
  return { nav, data };
}
