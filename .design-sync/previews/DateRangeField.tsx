import { DateRangeField } from "platform";
import { useState } from "react";

// maxToday defaults to true, so both ends must sit on or before the current
// date to render unclamped.
export const Filled = () => {
  const [range, set] = useState({ start: "2024-03-01", end: "2024-05-10" });
  return (
    <DateRangeField
      label="Application date"
      startValue={range.start}
      endValue={range.end}
      onChange={(start, end) => set({ start, end })}
    />
  );
};

export const Empty = () => {
  const [range, set] = useState({ start: "", end: "" });
  return (
    <DateRangeField
      label="Application date"
      startValue={range.start}
      endValue={range.end}
      onChange={(start, end) => set({ start, end })}
    />
  );
};

export const StartOnly = () => (
  <DateRangeField
    label="Payouts settled between"
    startValue="2024-01-01"
    endValue=""
    onChange={() => {}}
  />
);

export const WithError = () => (
  <DateRangeField
    label="Application date"
    startValue="2024-03-01"
    endValue=""
    onChange={() => {}}
    error="Choose an end date"
  />
);
