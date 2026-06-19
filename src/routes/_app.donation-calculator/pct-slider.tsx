import { Slider } from "@ark-ui/react/slider";
import { CircleHelpIcon } from "lucide-react";
import { Arrow, Content, Tooltip } from "#/components/tooltip";

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
              <Content className="max-w-xs text-center bg-popover outline outline-border p-4 text-popover-fg text-xs shadow-lg rounded">
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
          <Slider.Root
            className="relative flex w-full touch-none select-none items-center"
            value={[p.value]}
            max={p.range[1]}
            min={p.range[0]}
            step={0.001}
            onValueChange={(e) => p.onChange(e.value[0])}
          >
            <Slider.Control className="flex w-full items-center">
              <Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
                <Slider.Range className="absolute h-full bg-primary" />
              </Slider.Track>
              <Slider.Thumb
                index={0}
                className="block size-4 rounded-full border-2 border-primary bg-background shadow-md focus-visible:outline-2 focus-visible:outline-ring"
              />
            </Slider.Control>
          </Slider.Root>
        </div>
        <div className="text-right  font-semibold">
          {(p.value * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
