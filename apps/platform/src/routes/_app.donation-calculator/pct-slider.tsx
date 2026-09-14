import { Slider } from "@better-giving/ui";
import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { CircleHelpIcon } from "lucide-react";

interface ProcessingFeeSliderProps {
  label: string;
  value: number;
  range: [number, number];
  onChange: (value: number) => void;
  classes?: string;
  tooltip?: string;
}

export function PctSlider({ classes = "", ...p }: ProcessingFeeSliderProps) {
  return (
    <div className={`w-full max-w-md ${classes}`}>
      <div className="flex items-center mb-2 gap-x-1">
        <p className="label">{p.label}</p>
        {p.tooltip && (
          <Tooltip
            tip={
              <Content className="max-w-xs text-center text-xs">
                {p.tooltip}
                <Arrow />
              </Content>
            }
          >
            <CircleHelpIcon size={14} className="relative inline" />
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-8">
        <div className="flex-1">
          <Slider
            label={p.label}
            hideLabel
            value={p.value}
            max={p.range[1]}
            min={p.range[0]}
            step={0.001}
            onValueChange={p.onChange}
          />
        </div>
        <div className="text-right font-semibold">
          {(p.value * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
