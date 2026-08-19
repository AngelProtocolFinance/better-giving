import { DateField } from "platform";
import { useState } from "react";

export const Filled = () => {
  const [value, set] = useState("2025-11-14");
  return (
    <DateField
      name="expiration"
      label="I want my fundraiser to end on this date"
      value={value}
      onChange={set}
      minToday
    />
  );
};

export const Empty = () => {
  const [value, set] = useState("");
  return (
    <DateField
      name="expiration"
      label="I want my fundraiser to end on this date"
      value={value}
      onChange={set}
      minToday
    />
  );
};

export const Required = () => {
  const [value, set] = useState("2026-01-31");
  return (
    <DateField
      name="payout_date"
      label="Payout date"
      required
      value={value}
      onChange={set}
    />
  );
};

export const WithError = () => {
  const [value, set] = useState("");
  return (
    <DateField
      name="expiration"
      label="I want my fundraiser to end on this date"
      required
      value={value}
      onChange={set}
      minToday
      error="Choose an end date"
    />
  );
};

// maxToday caps the field at the current date — a date already in the past is
// the only value it renders unclamped.
export const MaxToday = () => {
  const [value, set] = useState("2024-04-22");
  return (
    <DateField
      name="donated_on"
      label="Donation received on"
      value={value}
      onChange={set}
      maxToday
    />
  );
};
