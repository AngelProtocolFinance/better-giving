import { RadioGroup } from "@ark-ui/react/radio-group";
import { Switch } from "@ark-ui/react/switch";
import { PencilIcon } from "lucide-react";
import type { ReactElement } from "react";
import { base_url } from "#/constants/env";
import { ExtLink } from "../../ext-link";
import type { TTipFormat } from "../types";
import { CometBorder } from "./comet-border";

interface Props {
  classes?: string;
  checked: boolean;
  checked_changed: (checked: boolean) => void;
  tip_format: TTipFormat;
  tip_format_changed: (format: TTipFormat) => void;
  custom_tip: ReactElement | undefined;
}

export function TipField({ classes = "", ...p }: Props) {
  return (
    <div
      className={`${classes} flex has-[input:not([type=radio]):focus-within]:border-b-form-primary items-center py-1 border-y justify-between flex-wrap gap-x-3 gap-y-1`}
    >
      <Switch.Root
        checked={p.checked}
        onCheckedChange={(e) => p.checked_changed(e.checked)}
        className="group gap-x-1 flex items-center text-sm justify-self-start"
      >
        {/* relative wrapper sized to the pill so the comet's inset-0 overlay
            rides the visible border box (Control's p-1 would shrink it) */}
        <span className="relative inline-flex">
          <Switch.Control className="group text-xs flex items-center h-lh w-8 rounded-full bg-muted p-1 ease-in-out data-[state=checked]:bg-form-primary focus-visible:outline-2 focus-visible:outline-form-primary data-disabled:opacity-50">
            <Switch.Thumb
              aria-hidden="true"
              className="pointer-events-none inline-block h-[0.8lh] aspect-square -translate-x-0.5 rounded-full bg-card transition-transform ease-in-out group-data-[state=checked]:translate-x-3.5"
            />
          </Switch.Control>
          {/* comet drop — draws attention while the tip toggle is off */}
          {!p.checked && <CometBorder />}
        </span>
        <Switch.Label className="whitespace-nowrap font-medium">
          Support free fundraising tools
        </Switch.Label>
        <Switch.HiddenInput />
      </Switch.Root>
      <RadioGroup.Root
        className="flex gap-x-1"
        value={p.tip_format}
        onValueChange={(e) => p.tip_format_changed(e.value as TTipFormat)}
      >
        <RadioGroup.Item
          className="text-xs outline outline-form-secondary hover:not-data-[state=checked]:bg-form-secondary data-[state=checked]:outline-none data-[state=checked]:bg-form-secondary data-[state=checked]:text-form-primary data-[state=checked]:pointer-events-none select-none px-2 py-1 rounded"
          value={"10" satisfies TTipFormat}
        >
          <RadioGroup.ItemText>10%</RadioGroup.ItemText>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
        <RadioGroup.Item
          className="text-xs outline outline-form-secondary hover:not-data-[state=checked]:bg-form-secondary data-[state=checked]:outline-none data-[state=checked]:bg-form-secondary data-[state=checked]:text-form-primary data-[state=checked]:pointer-events-none select-none px-2 py-1 rounded"
          value={"15" satisfies TTipFormat}
        >
          <RadioGroup.ItemText>15%</RadioGroup.ItemText>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
        <RadioGroup.Item
          className="text-xs outline outline-form-secondary hover:not-data-[state=checked]:bg-form-secondary data-[state=checked]:outline-none data-[state=checked]:bg-form-secondary data-[state=checked]:text-form-primary data-[state=checked]:pointer-events-none select-none px-2 py-1 rounded"
          value={"20" satisfies TTipFormat}
        >
          <RadioGroup.ItemText>20%</RadioGroup.ItemText>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
        <RadioGroup.Item
          className="text-xs outline outline-form-secondary hover:not-data-[state=checked]:bg-form-secondary data-[state=checked]:outline-none data-[state=checked]:bg-form-secondary data-[state=checked]:text-form-primary data-[state=checked]:pointer-events-none select-none px-2 py-1 rounded flex-center"
          value={"custom" satisfies TTipFormat}
        >
          <RadioGroup.ItemText>
            <PencilIcon className="inline-block size-3 " />
          </RadioGroup.ItemText>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
      </RadioGroup.Root>
      {p.tip_format === "none" && (
        <p className="text-warning text-sm w-full">
          <BgTxtLogoLink /> is a nonprofit and charges no platform fees. A small
          optional contribution — separate from any payment processing fee —
          helps keep this free for every nonprofit.
        </p>
      )}
      {p.tip_format !== "none" && (
        <p className="text-sm w-full">
          Your contribution to <BgTxtLogoLink /> is separate from payment
          processing fees and goes directly to keeping this platform free for
          nonprofits. Thank you.
        </p>
      )}
      {p.custom_tip}
    </div>
  );
}

function BgTxtLogoLink() {
  return (
    <ExtLink href={base_url}>
      <span className="font-bold text-primary">Better.</span>
      <span className="font-bold text-primary">Giving</span>{" "}
      <span className="text-primary text-2xs">501(c)(3)</span>
    </ExtLink>
  );
}
