import { Field } from "@ark-ui/react/field";
import type { ReactNode } from "react";

interface IFieldFrame {
  label?: ReactNode;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  classes?: { container?: string; label?: string };
  children: ReactNode;
}

/**
 * the label + error frame around a control — the one spelling of both.
 *
 * `label` present → this owns the `Field.Root`, and the control nested below
 * inherits its ids and aria wiring. `label` absent → renders bare so the
 * control inherits the CALLER's `Field.Root` instead. never both: a nested
 * second root shadows the outer context.
 *
 * `required` is deliberately NOT handed to `Field.Root`. ark's `useCombobox`
 * reads `required` off the field context and zag puts it on the search input
 * (`getInputProps`) — native constraint validation then swallows the form's
 * submit event, so react-hook-form never runs its resolver and no message ever
 * appears. the asterisk is the label's `data-required`; the control carries
 * `aria-required` itself; requiredness is enforced by the schema.
 */
export function FieldFrame({ label, ...p }: IFieldFrame) {
  const container = `grid content-start ${p.classes?.container ?? ""}`;
  const err = <p className="field-err mt-1 empty:hidden">{p.error}</p>;

  if (label == null) {
    return (
      <div className={container}>
        {p.children}
        {err}
      </div>
    );
  }

  return (
    <Field.Root invalid={!!p.error} disabled={p.disabled} className={container}>
      <Field.Label
        data-required={p.required}
        className={`label empty:hidden w-fit mb-2 ${p.classes?.label ?? ""}`}
      >
        {label}
      </Field.Label>
      {p.children}
      {err}
    </Field.Root>
  );
}
