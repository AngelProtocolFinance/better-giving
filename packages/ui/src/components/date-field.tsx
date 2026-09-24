import {
  DateInput,
  type DateInputDateValue as DateValue,
} from "@ark-ui/react/date-input";
import { parseDate } from "@ark-ui/react/date-picker";
import { useSyncExternalStore } from "react";

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
const utc_today = () => new Date().toISOString().slice(0, 10);
const local_today = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};
// UTC−12's date: the earliest date that is still today somewhere, so a server
// render (no viewer zone) never clamps a date that is valid for the viewer.
const earliest_today = () =>
  new Date(Date.now() - 12 * 3_600_000).toISOString().slice(0, 10);
const no_subscribe = () => () => {};

/** the viewer's local date once hydrated; UTC−12's date on the server. */
function useViewerToday() {
  return useSyncExternalStore(no_subscribe, local_today, earliest_today);
}

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
  const viewer_today = useViewerToday();
  return (
    <DateInput.Root
      selectionMode="single"
      value={to_dv(value)}
      min={minToday ? parseDate(viewer_today) : undefined}
      max={maxToday ? parseDate(utc_today()) : undefined}
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
          className="flex-1 min-w-0 flex items-center gap-0.5 px-2 py-3.5 rounded border border-gray-6 bg-surface text-sm text-gray-12 data-invalid:border-destructive focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-2"
          data-invalid={error ? true : undefined}
        >
          <DateInput.SegmentContext>
            {(seg: DateValue | unknown) => (
              <DateInput.Segment
                segment={seg as any}
                className="px-0.5 rounded focus-visible:outline-none focus-visible:bg-primary focus-visible:text-primary-fg data-placeholder:not-focus-visible:text-gray-11 figures"
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
