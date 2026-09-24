import {
  type ComponentProps,
  type FieldsetHTMLAttributes,
  type FormHTMLAttributes,
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
      <Fieldset disabled={disabled} className="contents">
        {children}
      </Fieldset>
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
      <Fieldset disabled={disabled} className="contents">
        {children}
      </Fieldset>
    </RemixForm>
  );
}

interface IFieldset extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  disabled?: boolean;
}

/**
 * disabling the fieldset ejects focus from whatever control held it (usually
 * the submit button) to `<body>`. when it re-enables, focus returns to that
 * control — or to the enclosing `<form>` if the control is itself still
 * disabled — unless something else took focus meanwhile.
 */
export function Fieldset({ disabled, children, ...props }: IFieldset) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const ejected = useRef<HTMLElement | null>(null);

  // chromium blurs the control synchronously as the commit writes `disabled`,
  // so `focusout` fires before any effect of that commit runs
  useLayoutEffect(() => {
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
    if (disabled) {
      // an engine that defers the blur to its next rendering step still has
      // the control focused here
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        fieldset.current?.contains(active) &&
        active.matches(":disabled")
      )
        ejected.current = active;
      return;
    }
    const el = ejected.current;
    ejected.current = null;
    const unclaimed =
      !document.activeElement || document.activeElement === document.body;
    if (!el?.isConnected || !unclaimed) return;
    if (!el.matches(":disabled")) return el.focus();
    const form = el.closest("form");
    if (form) focus_without_tab_stop(form);
  }, [disabled]);

  return (
    <fieldset ref={fieldset} disabled={disabled} {...props}>
      {children}
    </fieldset>
  );
}

/** `tabindex=-1` only while focused — removing it sooner would unfocus it */
function focus_without_tab_stop(el: HTMLElement) {
  if (el.hasAttribute("tabindex")) return el.focus();
  el.tabIndex = -1;
  el.addEventListener("blur", () => el.removeAttribute("tabindex"), {
    once: true,
  });
  el.focus();
}

export function useRmxForm<T = unknown>() {
  const nav = useNavigation();
  const data = useActionData<T>();
  return { nav, data };
}
