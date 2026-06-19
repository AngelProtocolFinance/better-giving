import { HoverCard as Ark } from "@ark-ui/react/hover-card";
import { Portal } from "@ark-ui/react/portal";
import type { ComponentProps, ReactNode } from "react";
import { ArrowSvg } from "./arrow-svg";

export function Arrow() {
  return (
    <Ark.Arrow className="tooltip-arrow">
      <ArrowSvg />
    </Ark.Arrow>
  );
}

const popup_anim =
  "origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out";

export function Content({
  className = "",
  ...props
}: ComponentProps<typeof Ark.Content>) {
  return <Ark.Content className={`${popup_anim} ${className}`} {...props} />;
}

interface Props {
  /** must be wrapped by Content */
  tip: ReactNode;
  children: React.JSX.Element;
}
export function HoverCard(props: Props) {
  return (
    <Ark.Root
      openDelay={100}
      closeDelay={200}
      positioning={{ gutter: 5, overflowPadding: 16 }}
    >
      <Ark.Trigger asChild>{props.children}</Ark.Trigger>
      <Portal>
        <Ark.Positioner>{props.tip}</Ark.Positioner>
      </Portal>
    </Ark.Root>
  );
}
