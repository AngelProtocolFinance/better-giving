import {
  type ComponentProps,
  type FieldsetHTMLAttributes,
  type FormHTMLAttributes,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react";
import { Form as RemixForm, useActionData, useNavigation } from "react-router";
import {
  clear_ejected,
  focus_without_tab_stop,
  note_ejected,
} from "../../helpers/ejected-focus";

interface IForm extends FormHTMLAttributes<HTMLFormElement> {
  disabled?: boolean;
  /** see `Fieldset` */
  busy?: boolean;
  ref?: React.Ref<HTMLFormElement>;
}

export function Form({ disabled, busy, children, ref, ...props }: IForm) {
  return (
    <form ref={ref} {...props}>
      <Fieldset disabled={disabled} busy={busy} className="contents">
        {children}
      </Fieldset>
    </form>
  );
}

interface IRmxForm extends ComponentProps<typeof RemixForm> {
  disabled?: boolean;
  /** see `Fieldset` */
  busy?: boolean;
  ref?: React.Ref<HTMLFormElement>;
}

export function RmxForm({ disabled, busy, children, ref, ...props }: IRmxForm) {
  return (
    <RemixForm ref={ref} {...props}>
      <Fieldset disabled={disabled} busy={busy} className="contents">
        {children}
      </Fieldset>
    </RemixForm>
  );
}

interface IFieldset extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  disabled?: boolean;
  /**
   * a request this form sent is in flight — a polite status says
   * "Submitting…" while it holds. omitted, `disabled` is read as busy; pass
   * it wherever `disabled` can hold for any other reason (a navigation
   * elsewhere, a locked or read-only form).
   */
  busy?: boolean;
}

/**
 * disabling the fieldset ejects focus from whatever control held it (usually
 * the submit button) to `<body>`. when it re-enables, focus returns to that
 * control — or to the enclosing `<form>` if the control is itself still
 * disabled — unless something else took focus meanwhile. a Tab pressed from
 * `<body>` doesn't count as taking it: the user is looking for the focus they
 * lost, so the control that Tab landed on is given back up, unless a click,
 * typing or any other focus move followed. firefox and safari leave focus on
 * the disabled control instead of ejecting it; a Tab pressed from there counts
 * the same. a `Modal` opened while it is disabled returns focus to that
 * control too.
 *
 * the focus handling keys off `disabled`, whatever disabled it — a request's
 * `busy` can end before the fieldset re-enables. the outcome is the caller's
 * to render.
 */
export function Fieldset({
  disabled,
  busy = disabled,
  children,
  ...props
}: IFieldset) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const ejected = useRef<HTMLElement | null>(null);
  const reached_by_tab = useRef<HTMLElement | null>(null);

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
      ) {
        ejected.current = e.target;
        note_ejected(el, e.target);
      }
    };
    el.addEventListener("focusout", on_focusout);
    return () => {
      el.removeEventListener("focusout", on_focusout);
      clear_ejected(el);
    };
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
      ) {
        ejected.current = active;
        note_ejected(fieldset.current, active);
      }
      return watch_tab_from_body(ejected, reached_by_tab);
    }
    const el = ejected.current;
    const tabbed_to = reached_by_tab.current;
    ejected.current = null;
    reached_by_tab.current = null;
    if (fieldset.current) clear_ejected(fieldset.current);
    const active = document.activeElement;
    const unclaimed =
      !active ||
      active === document.body ||
      active === el ||
      (active === tabbed_to && !active.closest(OPEN_DIALOG));
    if (!el?.isConnected || !unclaimed) return;
    if (!el.matches(":disabled")) return el.focus();
    const form = el.closest("form");
    if (form) focus_without_tab_stop(form);
  }, [disabled]);

  return (
    <fieldset ref={fieldset} disabled={disabled} {...props}>
      {children}
      {/* after children, so a caller's `<legend>` stays first; rendered while
          empty, so the text written in on submit is announced */}
      <p role="status" className="sr-only">
        {busy ? "Submitting…" : ""}
      </p>
    </fieldset>
  );
}

/**
 * while the fieldset holds an ejected control, records in `reached` the
 * element a Tab (or Shift+Tab) pressed on `<body>` — or on the ejected control
 * itself, where an engine left focus there — lands on. cleared by a
 * pointerdown, any input, any other key, or any later focus move
 */
function watch_tab_from_body(
  ejected: RefObject<HTMLElement | null>,
  reached: RefObject<HTMLElement | null>
) {
  let tabbing = false;
  const on_keydown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") {
      if (!MODIFIER_KEYS.has(e.key)) reached.current = null;
      return;
    }
    if (!ejected.current) return;
    const active = document.activeElement;
    if (active !== document.body && active !== ejected.current) return;
    tabbing = true;
    // the focus move is the keydown's default action; a prevented one leaves
    // no move to attribute
    setTimeout(() => {
      tabbing = false;
    });
  };
  const on_focusin = (e: FocusEvent) => {
    reached.current =
      tabbing && e.target instanceof HTMLElement ? e.target : null;
    tabbing = false;
  };
  const release = () => {
    reached.current = null;
  };
  document.addEventListener("keydown", on_keydown, true);
  document.addEventListener("focusin", on_focusin, true);
  document.addEventListener("pointerdown", release, true);
  // typing reaches a field without a keydown too: paste, dictation, an IME
  document.addEventListener("input", release, true);
  return () => {
    document.removeEventListener("keydown", on_keydown, true);
    document.removeEventListener("focusin", on_focusin, true);
    document.removeEventListener("pointerdown", release, true);
    document.removeEventListener("input", release, true);
  };
}

// held down for a Shift+Tab, or by a screen reader's own commands
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

const OPEN_DIALOG = 'dialog[open], [role="dialog"], [role="alertdialog"]';

export function useRmxForm<T = unknown>() {
  const nav = useNavigation();
  const data = useActionData<T>();
  return { nav, data };
}
