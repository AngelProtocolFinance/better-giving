import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { type ComponentProps, type ReactNode, useState } from "react";

// kept as a no-op for back-compat: arrow is now rendered by `Tooltip` itself
// as a sibling of `Content` inside `Positioner` (the only structure ark-ui
// will position via popper). callers can leave `<Arrow />` in place; it
// renders nothing.
export function Arrow() {
  return null;
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
      // unmount positioner (and arrow) once content's exit animation ends,
      // otherwise the arrow lingers after content hides.
      lazyMount
      unmountOnExit
      positioning={{ gutter: 4 }}
    >
      <ArkTooltip.Trigger onClick={() => set_open(true)} asChild>
        {props.children}
      </ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner className="[--arrow-size:10px] [--arrow-background:var(--popover)]">
          <ArkTooltip.Arrow>
            <ArkTooltip.ArrowTip className="border-l border-t border-border" />
          </ArkTooltip.Arrow>
          {props.tip}
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
}
