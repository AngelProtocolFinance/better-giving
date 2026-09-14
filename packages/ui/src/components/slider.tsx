import { Slider as Ark } from "@ark-ui/react/slider";
import type { ReactNode } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  /** the slider's accessible name */
  label: ReactNode;
  /** keeps `label` as the accessible name without drawing it, where text
   * beside the slider already says the same thing */
  hideLabel?: boolean;
  disabled?: boolean;
  /** outer placement only — width, margin */
  className?: string;
}

export function Slider({
  value,
  min,
  max,
  step,
  onValueChange,
  label,
  hideLabel = false,
  disabled,
  className = "",
}: Props) {
  return (
    <Ark.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(e) => onValueChange(e.value[0])}
      className={className}
    >
      <Ark.Label className={hideLabel ? "sr-only" : "label mb-2"}>
        {label}
      </Ark.Label>
      <Ark.Control className="flex h-5 w-full items-center">
        <Ark.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-3 inset-shadow-track">
          <Ark.Range className="absolute h-full bg-primary data-disabled:bg-gray-11" />
        </Ark.Track>
        <Ark.Thumb
          index={0}
          className="block size-4 rounded-full border-2 border-primary bg-background shadow-track-fill focus-visible:outline-2 focus-visible:outline-ring data-disabled:border-gray-11"
        >
          <Ark.HiddenInput />
        </Ark.Thumb>
      </Ark.Control>
    </Ark.Root>
  );
}
