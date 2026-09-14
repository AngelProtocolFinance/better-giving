import { RadioGroup } from "@better-giving/ui";
import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import type { TargetType } from "./types";

const options: { value: TargetType; label: ReactNode }[] = [
  {
    value: "smart",
    label: (
      <>
        Use smart milestones{" "}
        <Tooltip
          tip={
            <Content className="max-w-xs text-center text-xs">
              Smart milestones will dynamically update your goal amount as
              donors contribute, providing a moving target that grows with your
              success
              <Arrow />
            </Content>
          }
        >
          <CircleHelp size={14} className="relative inline" />
        </Tooltip>
      </>
    ),
  },
  { value: "none", label: "No goal or progress bar" },
  { value: "fixed", label: "Set my own goal" },
];

interface Props {
  value: TargetType;
  onChange: (type: TargetType) => void;
  classes?: string;
}
export function GoalSelector(props: Props) {
  return (
    <RadioGroup
      label="Fundraiser Goal"
      hideLabel
      value={props.value}
      onValueChange={props.onChange}
      className={props.classes}
      items={options}
    />
  );
}
