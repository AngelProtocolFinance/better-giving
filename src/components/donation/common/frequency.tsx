import { Fieldset } from "@base-ui/react/fieldset";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { TFrequency } from "@/schemas";
import { freqs_default } from "./constants";

const opt_style =
  "group text-sm rounded px-4 py-2 border flex items-center justify-center @md/frequency:justify-start hover:not-data-checked:bg-(--form-secondary) data-checked:bg-(--form-primary) data-checked:text-primary-fg data-checked:border-none select-none";

const freqs_disp = {
  "one-time": "Once",
  weekly: "Weekly",
  monthly: "Monthly",
  annual: "Annually",
} as const;

export const freqs_shown = (
  freqs: TFrequency[] | undefined
): TFrequency[] | null => {
  if (!freqs || freqs.length === 0) return freqs_default;
  // hide frequency selector if only one option and it's one-time
  if (freqs.length === 1 && freqs[0] === "one-time") return null;
  return freqs;
};

interface Props {
  opts: TFrequency[] | undefined;
  value: TFrequency;
  onChange: (freq: TFrequency) => void;
  error?: string;
}
export function Frequency({
  value,
  onChange,
  error,
  opts = freqs_default,
}: Props) {
  return (
    <div className="@container/frequency">
      <Fieldset.Root
        render={<RadioGroup value={value} onValueChange={onChange} />}
      >
        <Fieldset.Legend className="mb-1 label">
          Frequency <span className="text-destructive">*</span>
        </Fieldset.Legend>
        <div className="grid grid-cols-2 gap-2 @md/frequency:flex">
          {opts.map((f) => (
            <Radio.Root key={f} value={f} className={opt_style}>
              Give {freqs_disp[f]}
            </Radio.Root>
          ))}
        </div>
      </Fieldset.Root>
      {error && <p className="field-err text-left mt-1">{error}</p>}
      <p className="text-muted-fg text-sm my-2">
        <span className="font-medium text-sm">Recurring donations</span> help
        nonprofits focus on mission and long-term impact, not fundraising.
        Cancel anytime.
      </p>
    </div>
  );
}
