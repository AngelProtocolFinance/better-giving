import { Select } from "platform";
import { useState } from "react";

const CURRENCIES = ["USD", "GBP", "EUR", "JPY", "AUD"];
const FREQUENCIES = ["One-time", "Monthly", "Quarterly", "Annually"];

export const Selected = () => {
  const [value, set] = useState<string | undefined>("USD");
  return (
    <Select
      label="Payout currency"
      value={value}
      onChange={set}
      options={CURRENCIES}
      option_disp={(o) => o}
      placeholder="Select a currency"
    />
  );
};

export const Placeholder = () => {
  const [value, set] = useState<string | undefined>(undefined);
  return (
    <Select
      label="Payout currency"
      value={value}
      onChange={set}
      options={CURRENCIES}
      option_disp={(o) => o}
      placeholder="Select a currency"
    />
  );
};

export const Required = () => {
  const [value, set] = useState<string | undefined>("Monthly");
  return (
    <Select
      label="Donation frequency"
      required
      value={value}
      onChange={set}
      options={FREQUENCIES}
      option_disp={(o) => o}
      placeholder="Select a frequency"
    />
  );
};

export const WithError = () => {
  const [value, set] = useState<string | undefined>(undefined);
  return (
    <Select
      label="Payout currency"
      required
      value={value}
      onChange={set}
      options={CURRENCIES}
      option_disp={(o) => o}
      placeholder="Select a currency"
      error="Choose a payout currency"
    />
  );
};

export const Disabled = () => (
  <Select
    label="Payout currency"
    value="USD"
    onChange={() => {}}
    options={CURRENCIES}
    option_disp={(o) => o}
    disabled
  />
);
