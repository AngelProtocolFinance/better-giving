import { MaskedInput } from "platform";
import { useState } from "react";

// mirrors apps/platform/src/components/form/masks — the masks are not part of
// the design-system export surface, so previews carry their own copy.
const ein = {
  format: (digits: string) => {
    const d = digits.replace(/[^0-9]/g, "").slice(0, 9);
    return d.length <= 2 ? d : `${d.slice(0, 2)}-${d.slice(2)}`;
  },
  unmask: (masked: string) => masked.replace(/[^0-9]/g, ""),
};

const fmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  useGrouping: true,
});
const dollar = {
  format: (digits: string) => {
    if (!digits) return "";
    const num = Number.parseInt(digits, 10);
    if (Number.isNaN(num)) return "";
    return `$ ${fmt.format(num)}`;
  },
  unmask: (masked: string) => masked.replace(/[^0-9]/g, ""),
};

export const Ein = () => {
  const [value, set_value] = useState("87-3758939");
  return (
    <MaskedInput
      id="o_ein"
      mask={ein}
      value={value}
      onChange={set_value}
      inputMode="numeric"
      label="Employer Identification Number (EIN)"
      required
      sub="The 9-digit number the IRS issued to your organization."
      placeholder="12-3456789"
      error=""
    />
  );
};

export const Empty = () => {
  const [value, set_value] = useState("");
  return (
    <MaskedInput
      id="o_ein_empty"
      mask={ein}
      value={value}
      onChange={set_value}
      inputMode="numeric"
      label="Employer Identification Number (EIN)"
      required
      placeholder="12-3456789"
    />
  );
};

export const WithError = () => {
  const [value, set_value] = useState("87-37");
  return (
    <MaskedInput
      id="o_ein_bad"
      mask={ein}
      value={value}
      onChange={set_value}
      inputMode="numeric"
      label="Employer Identification Number (EIN)"
      required
      placeholder="12-3456789"
      error="Must be 9 digits"
    />
  );
};

export const Dollars = () => {
  const [value, set_value] = useState("$ 1,200");
  return (
    <MaskedInput
      id="annual_online_donations"
      mask={dollar}
      value={value}
      onChange={set_value}
      inputMode="decimal"
      label="Annual online donations"
      sub="Total amount received through online platforms"
      placeholder="$ 0"
    />
  );
};

export const Disabled = () => (
  <MaskedInput
    id="o_ein_locked"
    mask={ein}
    value="87-3758939"
    onChange={() => {}}
    inputMode="numeric"
    label="Employer Identification Number (EIN)"
    disabled
  />
);
