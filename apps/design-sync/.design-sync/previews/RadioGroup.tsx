import { RadioGroup } from "@better-giving/ui";
import { Sprout, Trees, Zap } from "lucide-react";
import { useState } from "react";

export const Radio = () => {
  const [value, set] = useState("smart");
  return (
    <RadioGroup
      className="w-80"
      label="Fundraiser goal"
      value={value}
      onValueChange={set}
      items={[
        { value: "smart", label: "Use smart milestones" },
        { value: "none", label: "No goal or progress bar" },
        { value: "fixed", label: "Set my own goal" },
      ]}
    />
  );
};

export const RadioDisabledOption = () => (
  <RadioGroup
    className="w-80"
    label="Payout schedule"
    defaultValue="monthly"
    items={[
      { value: "monthly", label: "Monthly" },
      { value: "quarterly", label: "Quarterly" },
      {
        value: "weekly",
        label: "Weekly (available after 90 days)",
        disabled: true,
      },
    ]}
  />
);

export const TileTwoColumns = () => {
  const [value, set] = useState("savings");
  return (
    <RadioGroup
      className="w-120"
      variant="tile"
      columns={2}
      label="Deposit to"
      value={value}
      onValueChange={set}
      items={[
        { value: "savings", label: "Savings account" },
        { value: "investments", label: "Investments account" },
      ]}
    />
  );
};

export const TileWithDescription = () => {
  const [value, set] = useState("000-025-075");
  return (
    <RadioGroup
      className="w-96"
      variant="tile"
      label="Allocation"
      value={value}
      onValueChange={set}
      items={[
        {
          value: "000-000-100",
          label: "Endowment Builder",
          description: "100% Investment",
          icon: <Trees className="size-6 shrink-0 text-success" />,
        },
        {
          value: "000-025-075",
          label: "Long-Term Sustainability",
          description: "25% Savings, 75% Investment",
          icon: <Sprout className="size-6 shrink-0 text-success" />,
        },
        {
          value: "075-025-000",
          label: "Immediate Impact",
          description: "75% Grant, 25% Savings",
          icon: <Zap className="size-6 shrink-0 text-warning" />,
        },
      ]}
    />
  );
};
