import { Fieldset } from "@ark-ui/react/fieldset";
import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
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
    <Fieldset.Root
      className={`${classes} grid grid-cols-[auto_1fr] gap-x-2 gap-y-1`}
    >
      <Fieldset.Legend className="col-span-2 label mb-1">
        Donation frequency
      </Fieldset.Legend>
      <input ref={ref} className="sr-only" />
      <p className="grid col-span-2 text-destructive text-xs empty:hidden">
        {p.error}
      </p>
      {Array.from({ length: 4 }).map((_, idx) => (
        <Field.Root
          key={idx}
          className="border p-2 rounded accent-primary grid grid-cols-subgrid col-span-2"
        >
          <Input
            type="checkbox"
            className="checkbox"
            checked={p.value[idx] || false}
            onChange={(e) => {
              const new_values = [...p.value];
              new_values[idx] = e.target.checked;
              p.on_change(new_values);
            }}
          />
          <Field.Label className="text-sm">
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
    </Fieldset.Root>
  );
}
