import {
  DateInput,
  type DateInputDateValue as DateValue,
} from "@ark-ui/react/date-input";
import { parseDate } from "@ark-ui/react/date-picker";

interface IDateField {
  value: string;
  onChange: (v: string) => void;
  name?: string;
  label?: string;
  error?: string;
  minToday?: boolean;
  maxToday?: boolean;
  required?: boolean;
  classes?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const to_dv = (s: string) => (ISO.test(s) ? [parseDate(s)] : []);
const today = () => parseDate(new Date().toISOString().slice(0, 10));

export function DateField({
  value,
  onChange,
  name,
  label = "Date",
  error,
  minToday,
  maxToday,
  required,
  classes = "",
}: IDateField) {
  return (
    <DateInput.Root
      selectionMode="single"
      value={to_dv(value)}
      min={minToday ? today() : undefined}
      max={maxToday ? today() : undefined}
      onValueChange={({ value }) => onChange(value[0]?.toString() ?? "")}
      className={classes}
    >
      <DateInput.Label
        className="label mb-1"
        data-required={required || undefined}
      >
        {label}
      </DateInput.Label>
      <DateInput.Control className="flex items-center gap-2">
        <DateInput.SegmentGroup
          index={0}
          className="flex-1 min-w-0 flex items-center gap-0.5 px-2 py-3.5 rounded-sm border border-border bg-input text-sm text-fg data-invalid:border-destructive focus-within:outline focus-within:outline-ring"
          data-invalid={error ? true : undefined}
        >
          <DateInput.SegmentContext>
            {(seg: DateValue | unknown) => (
              <DateInput.Segment
                segment={seg as any}
                className="px-0.5 rounded-sm focus:outline-none focus:bg-secondary focus:text-secondary-fg data-placeholder:text-muted-fg tabular-nums"
              />
            )}
          </DateInput.SegmentContext>
        </DateInput.SegmentGroup>
      </DateInput.Control>
      <DateInput.HiddenInput index={0} name={name} />
      <p className="field-err mt-1 empty:hidden">{error}</p>
    </DateInput.Root>
  );
}
