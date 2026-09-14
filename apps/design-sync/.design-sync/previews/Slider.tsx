import { Slider } from "@better-giving/ui";
import { useState } from "react";

export const Default = () => {
  const [value, set] = useState(0.029);
  return (
    <div className="flex w-96 items-center gap-8">
      <Slider
        className="flex-1"
        label="Processing fee"
        value={value}
        min={0}
        max={0.1}
        step={0.001}
        onValueChange={set}
      />
      <span className="font-semibold">{(value * 100).toFixed(1)}%</span>
    </div>
  );
};

export const Disabled = () => (
  <Slider
    className="w-96"
    label="Projection years"
    value={10}
    min={5}
    max={20}
    step={5}
    onValueChange={() => {}}
    disabled
  />
);
