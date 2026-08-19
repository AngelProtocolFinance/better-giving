import { MultiCombo } from "platform";
import { type ReactNode, useState } from "react";

const COUNTRIES = [
  "Brazil",
  "Colombia",
  "Indonesia",
  "Kenya",
  "Peru",
  "Philippines",
  "United Kingdom",
  "United States",
];

// MultiCombo renders no label of its own — real usage sits a Label above it
// (see routes/_app.register.$reg_id._steps.2).
const Labelled = (props: { text: string; children: ReactNode }) => (
  <div className="grid gap-2">
    <p className="label w-fit">{props.text}</p>
    {props.children}
  </div>
);

export const Selected = () => {
  const [values, set] = useState(["Kenya", "Peru", "Philippines"]);
  return (
    <Labelled text="Countries your nonprofit is active in">
      <MultiCombo
        values={values}
        on_change={set}
        on_reset={() => set([])}
        options={COUNTRIES}
        classes={{ options: "text-sm" }}
      />
    </Labelled>
  );
};

export const Empty = () => {
  const [values, set] = useState<string[]>([]);
  return (
    <Labelled text="Countries your nonprofit is active in">
      <MultiCombo
        values={values}
        on_change={set}
        on_reset={() => set([])}
        options={COUNTRIES}
        classes={{ options: "text-sm" }}
      />
    </Labelled>
  );
};

export const WithError = () => {
  const [values, set] = useState<string[]>([]);
  return (
    <Labelled text="Countries your nonprofit is active in">
      <MultiCombo
        values={values}
        on_change={set}
        on_reset={() => set([])}
        options={COUNTRIES}
        error="Select at least one country"
        classes={{ options: "text-sm" }}
      />
    </Labelled>
  );
};

export const Disabled = () => (
  <Labelled text="Countries your nonprofit is active in">
    <MultiCombo
      disabled
      values={["Kenya", "Peru"]}
      on_change={() => {}}
      on_reset={() => {}}
      options={COUNTRIES}
    />
  </Labelled>
);
