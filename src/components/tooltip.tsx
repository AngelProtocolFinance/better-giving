import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { type ComponentProps, type ReactNode, useState } from "react";
import { ArrowSvg } from "./arrow-svg";

export function Arrow() {
  return (
    <ArkTooltip.Arrow className="tooltip-arrow">
      <ArrowSvg />
    </ArkTooltip.Arrow>
  );
}

const popup_anim =
  "origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out";

export function Content({
  className = "",
  ...props
}: ComponentProps<typeof ArkTooltip.Content>) {
  return (
    <ArkTooltip.Content className={`${popup_anim} ${className}`} {...props} />
  );
}

interface Props {
  /** must be wrapped by Content */
  tip: ReactNode;
  children: React.JSX.Element;
}
export function Tooltip(props: Props) {
  const [open, set_open] = useState(false);
  return (
    <ArkTooltip.Root
      open={open}
      onOpenChange={(e) => set_open(e.open)}
      openDelay={50}
      closeOnClick={false}
      positioning={{ gutter: 8 }}
    >
      <ArkTooltip.Trigger onClick={() => set_open(true)} asChild>
        {props.children}
      </ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner>{props.tip}</ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
}
