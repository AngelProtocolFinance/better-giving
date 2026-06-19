import { RadioGroup } from "@ark-ui/react/radio-group";
import { CircleHelp } from "lucide-react";
import { Arrow, Content, Tooltip } from "../tooltip";
import type { TargetType } from "./types";

const options: { [T in TargetType]: string } = {
  smart: "Use smart milestones",
  none: "No goal or progress bar",
  fixed: "Set my own goal",
};

interface Props {
  value: TargetType;
  onChange: (type: TargetType) => void;
  classes?: string;
}
export function GoalSelector(props: Props) {
  return (
    <RadioGroup.Root
      value={props.value}
      onValueChange={(e) => props.onChange(e.value as TargetType)}
      aria-label="Fundraiser Goal"
      className={`${props.classes ?? ""} grid gap-y-2`}
    >
      {Object.entries(options).map(([value, label]) => (
        <RadioGroup.Item
          key={value}
          value={value}
          className="flex items-center gap-2"
        >
          <RadioGroup.ItemControl className="group flex size-5 items-center justify-center rounded-full border bg-input data-[state=checked]:bg-primary">
            <span className="invisible size-2 rounded-full bg-card group-data-[state=checked]:visible" />
          </RadioGroup.ItemControl>
          <RadioGroup.ItemText className="text-sm">
            {label}{" "}
            {value === "smart" && (
              <Tooltip
                tip={
                  <Content className="max-w-xs text-center bg-popover outline outline-border p-4 text-popover-fg text-xs shadow-lg rounded">
                    Smart milestones will dynamically update your goal amount as
                    donors contribute, providing a moving target that grows with
                    your success
                    <Arrow />
                  </Content>
                }
              >
                <CircleHelp size={14} className="relative inline" />
              </Tooltip>
            )}
          </RadioGroup.ItemText>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
