import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { type ComponentProps, type ReactNode, useState } from "react";
import { ArrowSvg } from "./arrow-svg";

export function Arrow() {
  return (
    <BaseTooltip.Arrow className="tooltip-arrow">
      <ArrowSvg />
    </BaseTooltip.Arrow>
  );
}

const popup_anim =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:scale-90";

export function Content({
  className = "",
  ...props
}: ComponentProps<typeof BaseTooltip.Popup>) {
  return (
    <BaseTooltip.Popup className={`${popup_anim} ${className}`} {...props} />
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
    <BaseTooltip.Root open={open} onOpenChange={(o) => set_open(o)}>
      <BaseTooltip.Trigger
        onClick={() => set_open(true)}
        render={props.children}
      />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={8}>
          {props.tip}
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
