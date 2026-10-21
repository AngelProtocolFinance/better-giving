import { Field } from "@ark-ui/react/field";
import { Fieldset } from "@ark-ui/react/fieldset";
import type { Ref } from "react";

interface Props {
  classes?: string;
  value: boolean[];
  on_change: (frequencies: boolean[]) => void;
  error?: string;
}

export function DonateFrequencies({
  classes = "",
  ref,
  ...p
}: Props & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Fieldset.Root className={classes}>
      <Fieldset.Legend className="label mb-1">
        Donation frequency
      </Fieldset.Legend>
      <input ref={ref} className="sr-only" />
      <p className="text-destructive-subtle-fg text-xs mb-2 empty:hidden">
        {p.error}
      </p>
      <div className="border rounded overflow-hidden divide-y">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Field.Root
            key={idx}
            data-unchecked={p.value[idx] ? undefined : ""}
            className="flex items-center gap-2 p-3 min-h-12 bg-panel data-unchecked:bg-gray-3 data-unchecked:text-gray-11"
          >
            <Field.Input
              type="checkbox"
              className="checkbox"
              checked={p.value[idx] || false}
              onChange={(e) => {
                const new_values = [...p.value];
                new_values[idx] = e.target.checked;
                p.on_change(new_values);
              }}
            />
            <Field.Label className="text-sm grow">
              {idx === 0
                ? "One time"
                : idx === 1
                  ? "Weekly"
                  : idx === 2
                    ? "Monthly"
                    : "Annual"}
            </Field.Label>
          </Field.Root>
        ))}
      </div>
    </Fieldset.Root>
  );
}
