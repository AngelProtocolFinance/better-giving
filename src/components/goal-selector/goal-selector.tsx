import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
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
    <RadioGroup
      value={props.value}
      onValueChange={props.onChange}
      aria-label="Fundraiser Goal"
      className={`${props.classes ?? ""} grid gap-y-2`}
    >
      {Object.entries(options).map(([value, label]) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: wraps Radio.Root
        <label key={value} className="flex items-center gap-2">
          <Radio.Root
            value={value}
            className="group flex size-5 items-center justify-center rounded-full border bg-input data-checked:bg-primary"
          >
            <span className="invisible size-2 rounded-full bg-card group-data-checked:visible" />
          </Radio.Root>
          <span className="text-sm">
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
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
